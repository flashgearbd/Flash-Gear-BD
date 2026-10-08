/** FLASH GEAR BD — Cloudflare Worker API Gateway — V1 */
const DEFAULT_ORIGIN = 'https://flash-gear-bd.fgbd.workers.dev';
const RATE = new Map();
const PUBLIC_GET_ACTIONS = new Set(['health','products','product','trackOrder','settings']);
const ADMIN_ACTIONS = new Set(['adminLogin','adminLogout','adminChangePassword','adminData','adminOrders','adminProducts','adminActivity','adminProductSave','adminProductDelete','adminOrderStatus','adminCourier','adminStock','adminCategorySave','adminCategoryDelete','adminSettingsSave','adminImageUpload','adminImageBatchUpload']);
const PUBLIC_POST_ACTIONS = new Set(['createOrder']);
const MUTATION_ACTIONS = new Set(['updateOrderStatus','updateCourier','adjustStock']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResponse(request, env, new Response(null, {status:204}));
    if (url.pathname === '/api' || url.pathname === '/api/' || url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    // Serve the admin shell directly. Do not redirect /admin <-> /admin.html: Cloudflare's
    // default HTML canonicalization can otherwise create a redirect loop.
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return env.ASSETS.fetch(new Request(new URL('/admin.html', url), request));
    }
    if (url.pathname === '/shop' || url.pathname === '/offers' || url.pathname === '/new' || url.pathname.startsWith('/product/')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return env.ASSETS.fetch(request);
  }
};

function allowedOrigin(request, env){
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const configured = String(env.PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/,'');
  return origin === configured;
}
function corsHeaders(request, env){
  const origin = request.headers.get('Origin');
  const configured = String(env.PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/,'');
  return {'Access-Control-Allow-Origin': origin && origin === configured ? origin : configured,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'};
}
function corsResponse(request, env, response){const h=new Headers(response.headers);Object.entries(corsHeaders(request,env)).forEach(([k,v])=>h.set(k,v));return new Response(response.body,{status:response.status,headers:h});}
function withNoStore(response){const h=new Headers(response.headers);h.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');h.set('Pragma','no-cache');return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});}

function rateLimit(request, key, limit=20, windowMs=60000){
  const now=Date.now(); const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
  const k=key+':'+ip; const old=RATE.get(k)||[]; const fresh=old.filter(t=>now-t<windowMs); if(fresh.length>=limit)return false; fresh.push(now); RATE.set(k,fresh); if(RATE.size>2000) RATE.delete(RATE.keys().next().value); return true;
}
async function handleApi(request, env, url){
  if(!allowedOrigin(request,env)) return json({ok:false,error:'Origin not allowed.'},403,request,env);
  let action=url.searchParams.get('action') || url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'') || 'health';
  if(request.method==='GET' && !PUBLIC_GET_ACTIONS.has(action)) return json({ok:false,error:'GET is not available for this API action. Use POST.'},403,request,env);
  if(action==='createOrder' && !rateLimit(request,'order',12,60000)) return json({ok:false,error:'Too many order attempts. Please wait a moment and try again.'},429,request,env);
  if(action==='adminLogin' && !rateLimit(request,'login',8,900000)) return json({ok:false,error:'Too many login attempts from this network. Please wait and try again.'},429,request,env);
  const appsScriptUrl=String(env.APPS_SCRIPT_URL||'').trim(), apiKey=String(env.FGBD_API_KEY||'').trim();
  if(!appsScriptUrl||!apiKey)return json({ok:false,error:'Backend is not configured yet.'},503,request,env);
  let body={};
  if(request.method==='POST'){
    try{body=await request.json();}catch(_){return json({ok:false,error:'Invalid JSON request body.'},400,request,env);}
  }else{
    url.searchParams.forEach((v,k)=>{if(k!=='action')body[k]=v;});
  }
  action=String(body.action||action);
  if(request.method==='POST' && MUTATION_ACTIONS.has(action)) return json({ok:false,error:'Direct mutation endpoint is disabled. Use an authenticated admin session.'},403,request,env);
  body.action=action; body.apiKey=apiKey;
  if(body.action==='adminLogin') body.clientKey = await clientKey_(request);
  if(body.action==='createOrder' && String(body.website||'').trim()) return json({ok:false,error:'Order request rejected.'},400,request,env);
  // Public GET product responses are cached at the Worker edge for 30 seconds.
  if(request.method==='GET' && body.action==='products'){
    const cacheKey=new Request(new URL('/api/products?'+new URLSearchParams(Object.fromEntries(Object.entries(body).filter(([k])=>k!=='apiKey'))),url.origin),{method:'GET'});
    const cached=await caches.default.match(cacheKey); if(cached)return corsResponse(request,env,cached);
    const result=await callAppsScript(appsScriptUrl,body); const response=json(result.data,result.status,request,env,30); await caches.default.put(cacheKey,response.clone()); return response;
  }
  const result=await callAppsScript(appsScriptUrl,body);
  return json(result.data,result.status,request,env);
}
async function callAppsScript(baseUrl, body){
  // Google Apps Script Web Apps return ContentService responses through a
  // generated googleusercontent.com redirect. Let the Workers Fetch runtime
  // follow that redirect. The original request remains POST with the JSON body;
  // the generated redirect target contains the already-created response and
  // does not contain the password, API key, or session token.
  try{
    const upstream=await fetch(baseUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(body),
      redirect:'follow'
    });
    const type=String(upstream.headers.get('content-type')||'');
    let text=String(await upstream.text()||'').replace(/^\uFEFF/,'').trim();
    let data;
    try{data=text?JSON.parse(text):{};}catch(_){
      return {status:502,data:{ok:false,error:`Backend returned an invalid response for ${body.action}.`,detail:text.replace(/\s+/g,' ').slice(0,500),upstreamStatus:upstream.status,upstreamContentType:type||'unknown'}};
    }
    if(upstream.status===401||String(data.error||'').toLowerCase()==='unauthorized')return {status:401,data:{ok:false,error:'Backend authorization failed.'}};
    return {status:upstream.status,data};
  }catch(err){
    return {status:502,data:{ok:false,error:`Backend request failed for ${body.action}.`,detail:String(err&&err.message||err)}};
  }
}

function json(data,status,request,env,cacheSeconds=0){const h=new Headers({'Content-Type':'application/json; charset=utf-8',...corsHeaders(request,env)});h.set('Cache-Control',cacheSeconds?`public, max-age=${cacheSeconds}`:'no-store, no-cache, must-revalidate');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Frame-Options','DENY');return new Response(JSON.stringify(data),{status,headers:h});}
async function clientKey_(request){const raw=request.headers.get('CF-Connecting-IP')||'unknown';const bytes=new TextEncoder().encode(raw+'|fgbd-login-v1');const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
