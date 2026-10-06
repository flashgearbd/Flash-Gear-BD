/**
 * FLASH GEAR BD — Cloudflare Worker API Gateway
 * FGBD V1.0.20
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
  const apiKey = normalizeKey(env.FGBD_API_KEY);
  const appsScriptUrl = String(env.APPS_SCRIPT_URL || '').trim();
  if (!appsScriptUrl || !apiKey) {
    return json({ ok: false, error: 'Backend is not configured yet.' }, 503);
  }

  const pathAction = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const action = url.searchParams.get('action') || pathAction || 'health';
  const target = new URL(appsScriptUrl);
  target.searchParams.set('action', action);
  // Keep the key in the query string as well as the POST body. This is important
  // for Google Apps Script web-app redirects, where the body may not survive a redirect.
  target.searchParams.set('apiKey', apiKey);

  try {
    if (request.method === 'GET') {
      url.searchParams.forEach((value, key) => {
        if (key !== 'action') target.searchParams.set(key, value);
      });
      const upstream = await fetchPreservingMethod(target, {
        method: 'GET',
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
      body.apiKey = apiKey;
      body.action = body.action || action;
      target.searchParams.set('action', body.action);

      const upstream = await fetchPreservingMethod(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      });
      return await proxyResponse(upstream, body.action);
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

function normalizeKey(value) {
  return String(value || '').trim();
}

async function fetchPreservingMethod(target, init, maxRedirects = 4) {
  let current = new URL(target.toString());
  let options = { ...init, redirect: 'manual' };

  for (let attempt = 0; attempt <= maxRedirects; attempt++) {
    const response = await fetch(current.toString(), options);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('Location');
    if (!location) return response;

    current = new URL(location, current.toString());

    // Preserve POST method/body across the Apps Script redirect. A normal
    // redirect:'follow' can turn a 302 POST into a GET and lose the request body.
    if (response.status === 303) {
      options = { method: 'GET', headers: { 'Accept': 'application/json' }, redirect: 'manual' };
    } else {
      options = { ...options, redirect: 'manual' };
    }
  }

  throw new Error('Too many backend redirects. Check the Apps Script Web App URL.');
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

  // Give the browser a useful message when the upstream explicitly rejects auth.
  if (upstream.status === 401 || String(data.error || '').trim().toLowerCase() === 'unauthorized') {
    return json({
      ok: false,
      error: 'Backend authorization failed.',
      detail: 'Cloudflare reached Google Apps Script, but the API key was rejected. Verify FGBD_API_KEY in both services and redeploy the Apps Script Web App and Worker.',
      upstreamStatus: upstream.status
    }, 401);
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
