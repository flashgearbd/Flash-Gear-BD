/**
 * FLASH GEAR BD — Cloudflare Worker API Gateway
 * FGBD V1.0.18
 *
 * Website -> Cloudflare Worker -> Google Apps Script -> Google Sheets
 *
 * Cloudflare secrets:
 *   APPS_SCRIPT_URL = deployed Google Apps Script Web App URL
 *   FGBD_API_KEY    = same secret stored in Apps Script Script Properties
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

    if (url.pathname === '/api' || url.pathname === '/api/' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
      const adminUrl = new URL('/admin.html', url);
      const adminRequest = new Request(adminUrl.toString(), {
        method: 'GET',
        headers: request.headers
      });
      return env.ASSETS.fetch(adminRequest);
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
      const upstream = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: { 'Accept': 'application/json' }
      });
      return await proxyResponse(upstream, action);
    }

    if (request.method === 'POST') {
      const raw = await request.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch (_) {
        return json({ ok: false, error: 'Invalid JSON request body.' }, 400);
      }
      body.apiKey = env.FGBD_API_KEY;
      body.action = body.action || action;

      const upstream = await fetch(target.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
      return await proxyResponse(upstream, action);
    }

    return json({ ok: false, error: 'Method not allowed.' }, 405);
  } catch (error) {
    return json({
      ok: false,
      error: 'Backend request failed.',
      detail: String(error && error.message || error)
    }, 502);
  }
}

async function proxyResponse(upstream, action) {
  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 280);
    return json({
      ok: false,
      error: `Backend returned an invalid response for ${action}.`,
      detail: snippet || `HTTP ${upstream.status}`,
      upstreamStatus: upstream.status
    }, 502);
  }

  return json(data, upstream.status);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
