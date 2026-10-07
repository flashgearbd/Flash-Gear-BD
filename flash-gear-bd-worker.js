/**
 * FLASH GEAR BD — Cloudflare Worker API Gateway
 * FGBD V1.0.23
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

      // Google Apps Script Web Apps can return an HTML Google wrapper for a
      // POST response when the request crosses the script.google.com ->
      // googleusercontent.com boundary. Admin login is the one request that
      // must be able to return a clean JSON response before a session exists.
      // For that request only, send the credentials from this Worker to the
      // Apps Script doGet endpoint. The browser still sends its credentials
      // to Cloudflare using POST, so credentials are never exposed in the
      // website URL. The Worker-to-Google hop remains HTTPS.
      if (String(body.action) === 'adminLogin') {
        target.searchParams.set('username', String(body.username || ''));
        target.searchParams.set('password', String(body.password || ''));
        const upstream = await fetch(target.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          redirect: 'follow'
        });
        return await proxyResponse(upstream, body.action);
      }

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

async function fetchPreservingMethod(target, init, maxRedirects = 5) {
  // Google Apps Script Web Apps commonly return a 302 after executing the
  // request and place the actual ContentService JSON at the redirect target.
  // Let the Cloudflare runtime follow that redirect using standard Fetch
  // semantics. For 301/302/303, Fetch changes POST -> GET after the POST has
  // already executed, which is exactly what the Apps Script ContentService
  // response endpoint expects.
  //
  // We keep this helper small and use redirect:'follow' rather than manual
  // redirect handling because Cloudflare may expose cross-origin redirect
  // responses differently when redirect:'manual' is used.
  const options = { ...init, redirect: 'follow' };
  const response = await fetch(target.toString(), options);
  return response;
}

async function proxyResponse(upstream, action) {
  const contentType = String(upstream.headers.get('content-type') || '');
  let text = await upstream.text();
  text = String(text || '').replace(/^\uFEFF/, '').trim();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 500);
    return json({
      ok: false,
      error: `Backend returned an invalid response for ${action}.`,
      detail: snippet || `Empty response. HTTP ${upstream.status}.`,
      upstreamStatus: upstream.status,
      upstreamContentType: contentType || 'unknown'
    }, 502);
  }

  // Give the browser a useful message when the upstream explicitly rejects auth.
  if (upstream.status === 401 || String(data.error || '').trim().toLowerCase() === 'unauthorized') {
    return json({
      ok: false,
      error: 'Backend authorization failed.',
      detail: 'Cloudflare reached Google Apps Script, but the API key was rejected. Verify FGBD_API_KEY in both services and redeploy the Apps Script Web App and Worker.',
      upstreamStatus: upstream.status,
      upstreamContentType: contentType || 'unknown'
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
