/**
 * FLASH GEAR BD — Cloudflare Worker API Gateway
 * FGBD V1.0.7
 *
 * Secrets to configure in Cloudflare:
 *   APPS_SCRIPT_URL = your deployed Google Apps Script Web App URL
 *   FGBD_API_KEY    = the same secret saved in Apps Script Script Properties
 *
 * Static files are served through the ASSETS binding.
 * API paths are configured with run_worker_first so /api requests reach this Worker before asset fallback.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Support both /api?action=... and /api/... styles.
    // The website currently uses /api?action=..., while /api/... remains
    // supported for direct REST-style calls.
    if (url.pathname === '/api' || url.pathname === '/api/' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, url) {
  if (!env.APPS_SCRIPT_URL || !env.FGBD_API_KEY) {
    return json({ ok: false, error: 'Backend is not configured yet.' }, 503);
  }

  const pathAction = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const action = url.searchParams.get('action') || pathAction || 'health';
  const target = new URL(env.APPS_SCRIPT_URL);
  target.searchParams.set('action', action);

  try {
    if (request.method === 'GET') {
      url.searchParams.forEach((value, key) => {
        if (key !== 'action') target.searchParams.set(key, value);
      });
      target.searchParams.set('apiKey', env.FGBD_API_KEY);
      const upstream = await fetch(target.toString(), { redirect: 'follow' });
      return proxyResponse(upstream);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      body.apiKey = env.FGBD_API_KEY;
      body.action = body.action || action;

      const upstream = await fetch(target.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
      return proxyResponse(upstream);
    }

    return json({ ok: false, error: 'Method not allowed.' }, 405);
  } catch (error) {
    return json({ ok: false, error: 'Backend request failed.', detail: error.message }, 502);
  }
}

async function proxyResponse(upstream) {
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      ...corsHeaders,
      'Cache-Control': 'no-store'
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
