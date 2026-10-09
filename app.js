(() => {
  "use strict";

  const CFG = window.FLASH_GEAR_CONFIG || {};
  const logo = "./flash-gear-logo.png";

  // Live catalog only. Products are loaded from Google Sheets through the API.
  // Keeping this empty prevents stale demo products from hiding backend/catalog problems.
  let products = [];

  let categories = [
    ["Mobile", true], ["Feature Phone", true],
    ["Gadget & Accessories", false], ["Charger", false],
    ["Cable & Adapter", false], ["Powerbank", false],
    ["Earbuds", false], ["Neckband", false],
    ["Headphones", false], ["Microphone", false],
    ["Speaker", false], ["Smart watch", false]
  ];

  // Bangladesh: 8 divisions and 64 districts. District options are filtered by selected division.
  const bangladeshDistricts = {
    "Dhaka": ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
    "Khulna": ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
    "Chattogram": ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cumilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
    "Rajshahi": ["Bogura", "Joypurhat", "Naogaon", "Natore", "Chapainawabganj", "Pabna", "Rajshahi", "Sirajganj"],
    "Sylhet": ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
    "Rangpur": ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
    "Mymensingh": ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
    "Barishal": ["Barguna", "Barishal", "Bhola", "Jhalokathi", "Patuakhali", "Pirojpur"]
  };

  let gadgetSubcategories = [
    ["Charger"], ["Cable & Adapter"], ["Powerbank"],
    ["Earbuds"], ["Neckband"], ["Headphones"],
    ["Microphone"], ["Speaker"], ["Smart watch"]
  ];

  let cart = JSON.parse(localStorage.getItem("fgbd_cart") || "[]");
  let backendOnline = false;
  let liveProductsLoaded = false;
  let catalogLoading = true;
  let catalogError = "";
  let storeSettings = {
    "Shop Name":"Flash Gear BD", "Business Hours":"11 AM - 9 PM", "Shop Phone":"", "WhatsApp":"",
    "Email":"", "Address":"",
    "Inside Chattogram Delivery":60, "Outside Chattogram Delivery":120, "Free Delivery Threshold":6499,
    "Free Delivery Minimum Item Price":1500, "Free Delivery Minimum Item Count":2,
    "bKash Number":"", "bKash Type":"", "Nagad Number":"", "Nagad Type":"",
    "Bank Name":"", "Bank Account Name":"", "Bank Account Number":"",
    "Bank Branch District":"", "Bank Branch Name":"", "Bank Routing Number":""
  };
  let shopBrandFilter = "";
  let shopAvailabilityFilter = "";
  let shopSort = "Recommended";
  let currentCollection = "all";
  const selectedVariants = {};
  const quickQuantities = {};
  let homeSliderTimer = null;
  let heroTimer = null;
  let heroIndex = 0;
  const heroSlides=[
    {eyebrow:"PREMIUM GADGETS & ACCESSORIES",title:"Technology that",accent:"fits your life.",text:"Discover quality gadgets, smart accessories and everyday tech essentials with easy ordering and fast delivery across Bangladesh."},
    {eyebrow:"FLASH DEALS",title:"Better value.",accent:"Every day.",text:"Find selected deals on trusted gadgets and accessories while stock lasts."},
    {eyebrow:"SHOP WITH CONFIDENCE",title:"Simple shopping.",accent:"Reliable delivery.",text:"Live availability, secure checkout and order tracking from Flash Gear BD."}
  ];

  async function apiRequest(path, options = {}) {
    const base = (CFG.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("API base URL is not configured.");
    const response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const text=await response.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch(_){throw new Error(`API returned an invalid response (HTTP ${response.status}).`);}
    if(!response.ok||data.ok===false)throw new Error(data.error||`Request failed (HTTP ${response.status}).`);
    return data;
  }

  function extractDriveFileId(value){
    let raw=String(value||'').trim();
    if(!raw)return '';
    const imageFn=raw.match(/^=IMAGE\(\s*["']([^"']+)["']/i);
    if(imageFn)raw=imageFn[1].trim();
    raw=raw.replace(/^['"]|['"]$/g,'').replace(/&amp;/gi,'&').trim();
    if(/^[A-Za-z0-9_-]{20,}$/.test(raw))return raw;
    let decoded=raw;try{decoded=decodeURIComponent(raw)}catch(_){}
    const patterns=[
      /(?:drive|docs)\.google\.com\/(?:file|document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})/i,
      /(?:drive|docs)\.google\.com\/.*?[?&](?:id|fileId)=([A-Za-z0-9_-]{10,})/i,
      /drive\.usercontent\.google\.com\/download\?.*?[?&]id=([A-Za-z0-9_-]{10,})/i,
      /lh\d+\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/i,
      /[?&](?:id|fileId)=([A-Za-z0-9_-]{10,})/i
    ];
    for(const pattern of patterns){const m=decoded.match(pattern);if(m&&m[1])return m[1]}
    return '';
  }

  // Required canonicalizer: turn Drive share links into an image endpoint before assigning img.src.
  function getGoogleDriveDirectUrl(url){
    let value=String(url||'').trim();
    if(!value)return '';
    value=value.replace(/&amp;/gi,'&');
    const formula=value.match(/^=IMAGE\(\s*["']([^"']+)["']/i);
    if(formula)value=formula[1].trim();
    const id=extractDriveFileId(value);
    if(!id)return value;
    return 'https://lh3.googleusercontent.com/d/'+encodeURIComponent(id);
  }

  // Explicit helper used before assigning Google Drive URLs to image elements.
  // Keeps non-Drive image URLs unchanged and handles sharing URLs, open?id=, uc?id=,
  // Drive thumbnail links, Apps Script IMAGE() values, and already-converted URLs.
  function fixDriveImage(url){
    const value=String(url||'').trim().replace(/&amp;/gi,'&');
    if(!value)return '';
    if(!/drive\.google\.com|drive\.usercontent\.google\.com|lh\d+\.googleusercontent\.com/i.test(value))return value;
    const direct=getGoogleDriveDirectUrl(value);
    return direct||value;
  }

  function normalizeImageUrl(url){
    const value=String(url||'').trim();
    if(!value)return '';
    const id=extractDriveFileId(value);
    return id ? fixDriveImage(value) : value.replace(/&amp;/gi,'&');
  }

  function imageCandidates(url){
    const value=String(url||'').trim();
    if(!value)return [];
    const id=extractDriveFileId(value),out=[];const add=u=>{if(u&&!out.includes(u))out.push(u)};
    if(id){
      // Try the requested direct URL first, then alternate Google image endpoints.
      add('https://lh3.googleusercontent.com/d/'+encodeURIComponent(id));
      add('https://lh3.googleusercontent.com/d/'+encodeURIComponent(id)+'=w1600');
      add('https://lh3.googleusercontent.com/d/'+encodeURIComponent(id)+'=w1200');
      add('https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1600');
      add('https://drive.google.com/uc?export=view&id='+encodeURIComponent(id));
      add('https://drive.google.com/uc?export=download&id='+encodeURIComponent(id));
      add('https://drive.usercontent.google.com/download?id='+encodeURIComponent(id)+'&export=view&confirm=t');
      if(/^https?:\/\//i.test(value))add(value);
    }else if(/^https?:\/\//i.test(value)){add(value);}
    return out;
  }

  function normalizeLiveProducts(rows) {
    return (Array.isArray(rows)?rows:[]).map(p=>{
      const safe=p&&typeof p==='object'?p:{};
      const variants=Array.isArray(safe.variants)?safe.variants:[];
      const normalizedVariants=variants.map(v=>{const x=v&&typeof v==='object'?v:{};return {
        sku:String(x.sku||''),variantId:String(x.variantId||x.sku||''),variant:String(x.variant||''),
        price:Number(x.price)||0,oldPrice:Number(x.oldPrice)||0,
        stock:String(x.stock||'Out of Stock'),availableStock:Math.max(0,Number(x.availableStock)||0),
        image:normalizeImageUrl(x.image||''),images:(Array.isArray(x.images)?x.images:[]).map(normalizeImageUrl).filter(Boolean),
        salesCount:Number(x.salesCount)||0
      };});
      const v=normalizedVariants[0]||{sku:'',variantId:'',variant:'',price:0,oldPrice:0,stock:'Out of Stock',availableStock:0,image:'',images:[]};
      return {
        id:String(safe.id||safe.productId||v.sku||''),name:String(safe.name||'Unnamed Product'),brand:String(safe.brand||''),
        category:String(safe.category||'Gadget & Accessories'),subcategory:String(safe.subcategory||''),
        price:v.price,oldPrice:v.oldPrice,stock:v.stock,image:normalizeImageUrl(v.image||''),images:v.images,
        description:String(safe.description||safe.shortDescription||''),shortDescription:String(safe.shortDescription||''),
        variant:v.variant,sku:v.sku,variantId:v.variantId,variants:normalizedVariants.length?normalizedVariants:[v],
        featured:Boolean(safe.featured),newArrival:Boolean(safe.newArrival),deal:Boolean(safe.deal)
      };
    }).filter(p=>p.id);
  }

  async function loadProductsFromApi(){
    catalogLoading=true; catalogError='';
    if(!["#checkout","#cart"].includes(location.hash.split('?')[0]))render(true);
    try{
      const data=await apiRequest('/products');
      if(!data||!Array.isArray(data.products))throw new Error('Product catalog response is invalid.');
      products=normalizeLiveProducts(data.products);
      const subs=[...new Set(products.map(p=>p.subcategory).filter(Boolean))];
      if(subs.length)gadgetSubcategories=subs.map(x=>[x]);
      backendOnline=true; liveProductsLoaded=true; catalogLoading=false; catalogError='';
      refreshCartFromLiveCatalog();
      render(true);
    }catch(error){
      backendOnline=false; liveProductsLoaded=false; catalogLoading=false; catalogError=String(error?.message||'Unable to load products.');
      products=[];
      if(!["#checkout","#cart"].includes(location.hash.split('?')[0]))render(true);
    }
  }

  async function loadStoreSettings(){
    try{
      const data=await apiRequest("/settings");
      if(data.settings){
        storeSettings={...storeSettings,...data.settings};
        if(Array.isArray(data.settings.categories) && data.settings.categories.length){
          categories=data.settings.categories.sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)).map(c=>[c.name,c.name==="Mobile"||c.name==="Feature Phone"]);
        }
        if(!["#checkout","#cart"].includes(location.hash.split('?')[0])) render(true);
      }
    }catch(_){ /* defaults remain available */ }
  }

  function refreshCartFromLiveCatalog(){
    if(!Array.isArray(cart)||!cart.length||!products.length)return;
    let changed=false;
    cart=cart.filter(item=>{
      const p=products.find(x=>String(x.id)===String(item.id));
      if(!p){changed=true;return false;}
      const v=(p.variants||[]).find(x=>String(x.sku||'')===String(item.sku||'')) || p.variants?.[0];
      if(!v){changed=true;return false;}
      const available=v.stock==='Out of Stock'?0:Math.max(0,Number(v.availableStock??0));
      const nextQty=Math.min(Number(item.qty)||1,Math.max(1,available));
      if(available<=0){changed=true;return false;}
      if(item.qty!==nextQty || item.price!==Number(v.price||0) || item.oldPrice!==Number(v.oldPrice||0) || item.stock!==v.stock){
        item.qty=nextQty; item.price=Number(v.price||0); item.oldPrice=Number(v.oldPrice||0); item.stock=v.stock; item.image=normalizeImageUrl(v.image||p.image); item.variant=v.variant||p.variant; item.sku=v.sku||item.sku||''; changed=true;
      }
      return true;
    });
    if(changed)saveCart();
  }

  let currentSearch = "";
  let currentCategory = "All";

  const money = n => `${CFG.currency || "৳"}${Number(n).toLocaleString("en-BD")}`;

  function saveCart() {
    localStorage.setItem("fgbd_cart", JSON.stringify(cart));
    updateCartCount();
  }

  function updateCartCount() {
    const count = cart.reduce((s, x) => s + x.qty, 0);
    document.querySelectorAll("[data-cart-count]").forEach(el => el.textContent = count);
  }

  function stockClass(status) {
    if (status === "In Stock") return "stock in";
    if (status === "Low Stock") return "stock low";
    return "stock out";
  }

  function productImage(p, large = false) {
    // Use every stored image as a fallback, not just alternate URL formats for Image 1.
    // Sheets often contain one stale/permission-blocked first image while later gallery
    // images are valid; cards and the hero image should still display a working photo.
    const sourceImages = [p && p.image, ...((p && Array.isArray(p.images)) ? p.images : [])]
      .map(normalizeImageUrl).filter(Boolean);
    const uniqueImages = [...new Set(sourceImages)];
    const src = getGoogleDriveDirectUrl(uniqueImages[0] || "");
    const fallback = `<span class="product-placeholder ${large ? "large" : ""}" hidden><span>⚡</span><small>${escapeHtml((p && p.category) || "Product")}</small></span>`;
    if (!src) return `<span class="product-image-fallback">${fallback.replace(' hidden','')}</span>`;
    const candidates = [...new Set(uniqueImages.flatMap(imageCandidates))];
    return `<span class="product-image-wrap"><img src="${escapeHtml(src)}" loading="lazy" decoding="async" alt="${escapeHtml((p && p.name) || "Product image")}" onerror="handleImageError(this)" data-image-candidates="${escapeHtml(JSON.stringify(candidates))}" data-image-candidate-index="1">${fallback}</span>`;
  }

  function handleImageError(img) {
    if (!img) return;
    let candidates = [];
    try { candidates = JSON.parse(img.getAttribute("data-image-candidates") || "[]"); } catch (_) {}
    let index = Number(img.dataset.imageCandidateIndex || 0);
    const current = img.getAttribute("src") || "";
    while (index < candidates.length && (!candidates[index] || candidates[index] === current)) index++;
    if (index < candidates.length) {
      img.dataset.imageCandidateIndex = String(index + 1);
      img.setAttribute("src", candidates[index]);
      return;
    }
    img.onerror = null;
    img.style.display = "none";
    const fallback = img.nextElementSibling;
    if (fallback) fallback.hidden = false;
  }

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[c]));
  }

  function header() {
    return `
      <div class="announcement-bar">
        <div class="announcement-inner">
          <span>🚚 Fast Delivery Across Bangladesh</span>
          <i></i><span>💳 Cash on Delivery Available</span>
          <i></i><span>✦ 100% Original Products</span>
          <div class="announcement-links"><a href="#track">Track Order</a><a href="#support">Help</a></div>
        </div>
      </div>
      <header class="topbar">
        <div class="topbar-inner">
          <button class="icon-btn mobile-menu" onclick="toggleMenu()" aria-label="Open menu" aria-controls="sideDrawer" aria-expanded="false">☰</button>
          <a class="brand" href="#home" onclick="closeMenu()">
            <img src="${logo}" alt="Flash Gear BD">
            <span><b>FLASH GEAR BD</b><small>Your Gadget Partner</small></span>
          </a>
          <div class="header-search">
            <form class="header-search-form" onsubmit="submitHeaderSearch(event)">
              <span class="header-search-icon" aria-hidden="true">⌕</span>
              <input id="headerSearch" value="${escapeHtml(currentSearch)}" autocomplete="off" placeholder="Search for products, brands and more..." aria-label="Search products" oninput="handleHeaderSearchInput(this.value)" onfocus="handleHeaderSearchInput(this.value)" onblur="setTimeout(hideHeaderSuggestions,160)">
              <button class="header-search-submit" type="submit" aria-label="Search">⌕</button>
              <div id="headerSearchSuggestions" class="header-search-suggestions" role="listbox" aria-label="Product suggestions"></div>
            </form>
          </div>
          <div class="header-actions">
            <a class="header-track" href="#track"><span>◉</span><b>Track Order</b></a>
            <button class="cart-btn" onclick="location.hash='#cart'" aria-label="Cart">🛒<span data-cart-count>0</span></button>
          </div>
        </div>
        <div class="nav-row">
          <nav id="main-menu">
            <a class="nav-category" href="#shop" onclick="closeMenu()">☰ <span>All Categories</span></a>
            <a href="#home" onclick="closeMenu()">Home</a>
            <a href="#shop?category=Gadget%20%26%20Accessories" onclick="closeMenu()">Gadget & Accessories</a>
            <a href="#new" onclick="closeMenu()">New Arrivals</a>
            <a href="#offers" onclick="closeMenu()">Deals</a>
            <a href="#support" onclick="closeMenu()">About Us</a>
            <a href="#support" onclick="closeMenu()">Contact</a>
          </nav>
        </div>
      </header>
      <div id="drawerBackdrop" class="drawer-backdrop" onclick="closeMenu()" aria-hidden="true"></div>
      <aside id="sideDrawer" class="side-drawer" aria-hidden="true" aria-label="Site menu">
        <div class="drawer-head">
          <a class="drawer-brand" href="#home" onclick="closeMenu()"><img src="${logo}" alt="Flash Gear BD"><span><b>FLASH GEAR BD</b><small>Your Gadget Partner</small></span></a>
          <button class="drawer-close" onclick="closeMenu()" aria-label="Close menu">×</button>
        </div>
        <nav class="drawer-nav">
          <a class="drawer-link active" href="#home" onclick="closeMenu()"><span>⌂</span><b>Home</b></a>
          <a class="drawer-link" href="#shop" onclick="closeMenu()"><span>▦</span><b>All Categories</b><em>›</em></a>
          <a class="drawer-link" href="#shop?category=Gadget%20%26%20Accessories" onclick="closeMenu()"><span>◉</span><b>Gadget & Accessories</b><em>›</em></a>
          <a class="drawer-link" href="#new" onclick="closeMenu()"><span>✦</span><b>New Arrivals</b><em>›</em></a>
          <a class="drawer-link" href="#offers" onclick="closeMenu()"><span>◇</span><b>Deals</b><em>›</em></a>
          <a class="drawer-link" href="#support" onclick="closeMenu()"><span>ⓘ</span><b>About Us</b><em>›</em></a>
          <a class="drawer-link" href="#support" onclick="closeMenu()"><span>✉</span><b>Contact</b><em>›</em></a>
        </nav>
        <div class="drawer-divider"></div>
        <div class="drawer-title">Quick Links</div>
        <nav class="drawer-nav drawer-quick">
          <a class="drawer-link" href="#track" onclick="closeMenu()"><span>◷</span><b>Track Order</b><em>›</em></a>
          <a class="drawer-link" href="#support" onclick="closeMenu()"><span>?</span><b>Help & Support</b><em>›</em></a>
        </nav>
        <div class="drawer-help"><span>☎</span><div><b>Need Help?</b><small>${escapeHtml(storeSettings["Business Hours"]||"11 AM - 9 PM")}</small></div><a href="tel:${escapeHtml(storeSettings["Shop Phone"]||"")}">Call</a></div>
        <div class="drawer-footer">Flash Gear BD · Your Gadget Partner</div>
      </aside>`;
  }

  function bottomNav() {
    return `
      <nav class="bottom-nav">
        <a href="#home" data-dock="home">⌂<small>Home</small></a>
        <a href="#shop" data-dock="shop">▦<small>Categories</small></a>
        <a href="#cart" class="dock-cart" data-dock="cart">🛒<small>Cart</small><b data-cart-count>0</b></a>
        <a href="#track" data-dock="track">◷<small>Orders</small></a>
      </nav>`;
  }

  function productCartKey(p) {
    return `${p.id}::${p.sku || p.variantId || "default"}`;
  }

  function quickQtyValue(p) {
    const key = productCartKey(p);
    return Math.max(1, Number(quickQuantities[key] || 1));
  }

  function changeQuickQty(id, sku, delta) {
    const key = `${id}::${sku || "default"}`;
    const p=products.find(x=>x.id===id),v=p?.variants?.find(x=>String(x.sku||'')===String(sku||''));const max=v?Math.max(1,Number(v.availableStock||0)):1;if(v&&Number(v.availableStock||0)<=0)return;quickQuantities[key]=Math.min(max,Math.max(1,Number(quickQuantities[key]||1)+Number(delta||0)));
    const el = document.querySelector(`[data-quick-qty="${CSS.escape(key)}"]`);
    if (el) el.textContent = quickQuantities[key];
  }

  function productCard(p) {
    const variants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{sku:p.sku||'',variantId:p.variantId||p.sku||'',variant:p.variant||'',price:p.price,oldPrice:p.oldPrice,stock:p.stock,availableStock:p.availableStock||0,image:p.image,images:p.images||[]}];
    const selectedSku=selectedVariants[p.id]||variants[0].sku, v=variants.find(x=>x.sku===selectedSku)||variants[0];
    const view={...p,price:Number(v.price||0),oldPrice:Number(v.oldPrice||0),stock:v.stock,availableStock:Number(v.availableStock||0),image:v.image||p.image,images:v.images||p.images,sku:v.sku||p.sku,variant:v.variant||p.variant};
    const disabled=view.stock==='Out of Stock'?'disabled':'';
    const discount=view.oldPrice&&Number(view.oldPrice)>Number(view.price)?Math.round((1-Number(view.price)/Number(view.oldPrice))*100):0;
    const key=productCartKey(view),qty=quickQtyValue(view),safeKey=escapeHtml(key);
    return `<article class="product-card"><a href="#product/${encodeURIComponent(p.id)}" class="product-media">${productImage(view)}</a>${discount?`<span class="badge">-${discount}%</span>`:view.deal?`<span class="badge">DEAL</span>`:''}<div class="product-body"><small class="muted">${escapeHtml(view.brand||'Gadget')} · ${escapeHtml(view.category||'Accessories')}</small><a href="#product/${encodeURIComponent(p.id)}" class="product-name">${escapeHtml(view.name)}</a>${variants.length>1?`<select class="card-variant-select" aria-label="Choose variant" onchange="changeCardVariant('${escapeHtml(p.id)}',this.value)">${variants.map(x=>`<option value="${escapeHtml(x.sku)}" ${x.sku===selectedSku?'selected':''}>${escapeHtml(x.variant||x.sku||'Standard')} · ${money(x.price)}</option>`).join('')}</select>`:''}<div class="price-row"><strong>${money(view.price)}</strong>${view.oldPrice?`<del>${money(view.oldPrice)}</del>`:''}</div><span class="${stockClass(view.stock)}">${escapeHtml(view.stock)}</span><div class="quick-cart-row"><div class="quick-qty" aria-label="Quantity"><button type="button" ${disabled} onclick="changeQuickQty('${escapeHtml(view.id)}','${escapeHtml(view.sku||view.variantId||'')}',-1); return false;" aria-label="Decrease quantity">−</button><span data-quick-qty="${safeKey}">${qty}</span><button type="button" ${disabled} onclick="changeQuickQty('${escapeHtml(view.id)}','${escapeHtml(view.sku||view.variantId||'')}',1); return false;" aria-label="Increase quantity">+</button></div><button class="quick-add" ${disabled} onclick="addToCart('${escapeHtml(view.id)}','${escapeHtml(view.sku||view.variantId||'')}',quickQtyValueByKey('${safeKey}'))">${disabled?'Out of Stock':'🛒 Add'}</button></div></div></article>`;
  }
  function changeCardVariant(id,sku){selectedVariants[id]=sku;render(true);}

  function quickQtyValueByKey(key) { return Math.max(1, Number(quickQuantities[key] || 1)); }

  function homePage() {
    const featured = products.filter(p => p.featured).slice(0, 4);
    const featuredProducts = featured.length ? featured : products.slice(0, 4);
    const deals = products.filter(p => p.deal || Number(p.oldPrice) > Number(p.price)).slice(0, 4);
    const arrivals = products.filter(p => p.newArrival).slice(0, 4);
    return `
      ${header()}
      <main>
        <section class="hero" data-hero-slider><div class="hero-copy"><span class="eyebrow" id="heroEyebrow">${heroSlides[heroIndex].eyebrow}</span><h1 id="heroTitle">${heroSlides[heroIndex].title}<br><span>${heroSlides[heroIndex].accent}</span></h1><p id="heroText">${heroSlides[heroIndex].text}</p><div class="hero-actions"><a class="btn primary" href="#shop">Shop Now →</a><a class="btn ghost" href="#offers">Explore Deals</a></div></div><div class="hero-slide-count"><span class="active" id="heroIndex">${String(heroIndex+1).padStart(2,'0')}</span><i>/</i><span>03</span><button type="button" onclick="nextHeroSlide()" aria-label="Next banner">→</button></div></section>

        <section class="trust-strip">
          <div><b>◈</b><span><strong>100% Original</strong><small>Products guaranteed</small></span></div>
          <div><b>▣</b><span><strong>Cash on Delivery</strong><small>Available nationwide</small></span></div>
          <div><b>⌁</b><span><strong>Fast Delivery</strong><small>Across Bangladesh</small></span></div>
          <div><b>↻</b><span><strong>Easy Return</strong><small>7 days policy</small></span></div>
        </section>

        <section class="section category-section">
          <div class="section-head"><div><span class="eyebrow">EXPLORE</span><h2>Shop by Category</h2></div><a href="#shop">View All →</a></div>
          <div class="category-grid">${categories.filter(([name]) => !["Mobile","Feature Phone"].includes(name)).map(([name]) =>
            `<a class="category-card" href="#shop?category=${encodeURIComponent(name)}"><b>${escapeHtml(name)}</b><small>Explore →</small></a>`
          ).join("")}</div>
        </section>

        <section class="promo-grid promo-grid-single">
          <a class="promo-card promo-arrivals" href="#new"><div><span class="eyebrow">JUST IN</span><h2>New Arrivals</h2><p>Fresh gadgets and accessories, ready for your setup.</p><span class="promo-btn">Explore →</span></div><div class="promo-orb">✦</div></a>
        </section>

        <section class="section product-section">
          <div class="section-head"><div><span class="eyebrow">HANDPICKED</span><h2>Featured Products</h2></div><a href="#shop">View All →</a></div>
          <div class="product-tabs"><span class="active">Featured</span><a href="#shop?collection=bestsellers">Best Sellers</a><a href="#new">New Arrivals</a><a href="#offers">Deals</a></div>
          <div class="product-slider" data-home-slider="featured"><div class="product-slider-track">${featuredProducts.length ? featuredProducts.map(productCard).join("") : `<div class="empty">Products will appear here once they are published.</div>`}</div></div>
        </section>

        ${deals.length ? `<section class="section soft product-section"><div class="section-head"><div><span class="eyebrow">BEST VALUE</span><h2>Flash Deals</h2></div><a href="#offers">View Deals →</a></div><div class="product-grid">${deals.map(productCard).join("")}</div></section>` : ""}

        ${arrivals.length ? `<section class="section product-section"><div class="section-head"><div><span class="eyebrow">LATEST</span><h2>New Arrivals</h2></div><a href="#shop">View All →</a></div><div class="product-slider" data-home-slider="arrivals"><div class="product-slider-track">${arrivals.map(productCard).join("")}</div></div></section>` : ""}

        <section class="popular-band">
          <div class="section-head"><div><span class="eyebrow">DISCOVER MORE</span><h2>Popular Gadgets</h2></div><a href="#shop">View All →</a></div>
          <div class="popular-grid">${gadgetSubcategories.map(([name]) => `<a href="#shop?category=${encodeURIComponent(name)}"><b>${escapeHtml(name)}</b><small>Explore →</small></a>`).join("")}</div>
        </section>

        <section class="blue-promise">
          <div><span class="eyebrow">FLASH GEAR BD</span><h2>Better gadgets.<br>Better everyday.</h2><p>Shop confidently with clear pricing, simple checkout and live product availability.</p></div>
          <a class="btn light" href="#shop">Start Shopping →</a>
        </section>
      </main>
      ${footer()}`;
  }

  function getShopProducts(){
    const q=currentSearch.toLowerCase();
    let arr=products.filter(p=>{
      const text=`${p.name} ${p.brand} ${p.category} ${p.subcategory||''} ${p.sku||''}`.toLowerCase();
      const matchesSearch=!q||text.includes(q);
      const matchesCat=currentCategory==='All'||currentCategory==='Gadget & Accessories'||p.category===currentCategory||p.subcategory===currentCategory;
      const matchesBrand=!shopBrandFilter||p.brand===shopBrandFilter;
      const matchesAvailability=!shopAvailabilityFilter||p.stock===shopAvailabilityFilter;
      const matchesCollection=currentCollection==='deals'?(p.deal||Number(p.oldPrice)>Number(p.price)):currentCollection==='new'?p.newArrival:true;
      return matchesSearch&&matchesCat&&matchesBrand&&matchesAvailability&&matchesCollection;
    });
    if(currentCollection==='bestsellers')arr.sort((a,b)=>Number(b.salesCount||0)-Number(a.salesCount||0));
    else if(shopSort==='Price: Low to High')arr.sort((a,b)=>a.price-b.price);
    else if(shopSort==='Price: High to Low')arr.sort((a,b)=>b.price-a.price);
    else if(shopSort==='Newest')arr.sort((a,b)=>Number(b.newArrival)-Number(a.newArrival)||String(b.id).localeCompare(String(a.id)));
    else if(shopSort==='Best Selling')arr.sort((a,b)=>Number(b.salesCount||0)-Number(a.salesCount||0));
    return arr;
  }
  function updateShopResults(){
    const box=document.getElementById('shopResults');if(!box)return;
    const arr=getShopProducts();
    box.innerHTML=arr.length?arr.map(productCard).join(''):'<div class="empty"><h3>No products found</h3><p>Try another search, category or filter.</p></div>';
    const count=document.getElementById('shopResultCount');if(count)count.textContent=`${arr.length} product${arr.length===1?'':'s'}`;
  }
  function handleShopSearchInput(v){currentSearch=String(v||'');updateShopResults();}
  function handleShopFilter(){shopBrandFilter=document.getElementById('shopBrandFilter')?.value||'';shopAvailabilityFilter=document.getElementById('shopAvailabilityFilter')?.value||'';shopSort=document.getElementById('shopSort')?.value||'Recommended';updateShopResults();}

  function shopPage() {
    const isComingSoon=currentCategory==='Mobile'||currentCategory==='Feature Phone';
    const showGadgetSubcategories=currentCategory==='Gadget & Accessories';
    const brands=[...new Set(products.map(p=>p.brand).filter(Boolean))].sort();
    const arr=getShopProducts();
    const title=currentCollection==='deals'?'Deals':currentCollection==='new'?'New Arrivals':currentCollection==='bestsellers'?'Best Sellers':'Find your next favourite.';
    return `${header()}<main class="page"><section class="page-head"><span class="eyebrow">SHOP</span><h1>${escapeHtml(title)}</h1><p>Browse products by category, brand and availability.</p></section>
      <div class="searchbar"><input id="shopSearch" value="${escapeHtml(currentSearch)}" placeholder="Search products..." oninput="handleShopSearchInput(this.value)" aria-label="Search shop"><button type="button" onclick="handleShopSearchInput(document.getElementById('shopSearch').value)">⌕</button></div>
      <div class="chips"><button class="${currentCategory==='All'?'active':''}" onclick="setCategory('All')">All</button>${categories.map(([name,coming])=>`<button class="${currentCategory===name?'active':''}" onclick="setCategory('${escapeHtml(name).replace(/'/g,'&#39;')}')">${escapeHtml(name)}${coming?' · Coming Later':''}</button>`).join('')}</div>
      ${showGadgetSubcategories?`<div class="subcategory-panel"><b>Gadget & Accessories</b><span>Choose a category</span><div class="chips subchips">${gadgetSubcategories.map(([name])=>`<button onclick="setCategory('${escapeHtml(name).replace(/'/g,'&#39;')}')">${escapeHtml(name)}</button>`).join('')}</div></div>`:''}
      ${isComingSoon?`<div class="coming-soon-card"><div class="coming-soon-icon">⚡</div><span class="eyebrow">COMING LATER</span><h2>We’re currently working on our ${escapeHtml(currentCategory.toLowerCase())} inventory.</h2><p>Until then, explore our latest gadgets & accessories.</p><a class="btn primary" href="#shop?category=Gadget%20%26%20Accessories">Explore Gadgets & Accessories</a></div>`:`<div class="shop-layout"><aside class="filter-panel"><b>Filter</b><label>Brand<select id="shopBrandFilter" onchange="handleShopFilter()"><option value="">All Brands</option>${brands.map(b=>`<option ${b===shopBrandFilter?'selected':''}>${escapeHtml(b)}</option>`).join('')}</select></label><label>Availability<select id="shopAvailabilityFilter" onchange="handleShopFilter()"><option value="">All</option><option ${shopAvailabilityFilter==='In Stock'?'selected':''}>In Stock</option><option ${shopAvailabilityFilter==='Low Stock'?'selected':''}>Low Stock</option></select></label></aside><section><div class="results-head"><span id="shopResultCount">${arr.length} product${arr.length===1?'':'s'}</span><select id="shopSort" onchange="handleShopFilter()"><option ${shopSort==='Recommended'?'selected':''}>Recommended</option><option ${shopSort==='Best Selling'?'selected':''}>Best Selling</option><option ${shopSort==='Price: Low to High'?'selected':''}>Price: Low to High</option><option ${shopSort==='Price: High to Low'?'selected':''}>Price: High to Low</option><option ${shopSort==='Newest'?'selected':''}>Newest</option></select></div><div id="shopResults" class="product-grid">${catalogLoading?'<div class="loading-state"><div class="spinner"></div><h3>Loading products…</h3><p>Checking live inventory.</p></div>':arr.length?arr.map(productCard).join(''):'<div class="empty"><h3>No products found</h3><p>'+escapeHtml(catalogError||'Try another search, category or filter.')+'</p></div>'}</div></section></div>`}
      </main>${footer()}`;
  }

  function productPage(id) {
    const wanted=decodeURIComponent(String(id||''));
    const p=products.find(x=>String(x.id)===wanted);
    if(!p&&catalogLoading)return `${header()}<main class="page narrow"><div class="loading-state"><div class="spinner"></div><h2>Loading product…</h2><p>Please wait while we load the live inventory.</p></div></main>${footer()}`;
    if(!p)return `${header()}<main class="page"><div class="empty"><h2>Product not found</h2><p>${escapeHtml(catalogError||'This product is unavailable or no longer published.')}</p><a class="btn primary" href="#shop">Back to Shop</a></div></main>${footer()}`;
    const recent=JSON.parse(localStorage.getItem("fgbd_recent")||"[]").filter(x=>String(x)!==String(p.id));recent.unshift(p.id);localStorage.setItem("fgbd_recent",JSON.stringify(recent.slice(0,8)));
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [{ sku: p.sku || "", variantId: p.variantId || p.sku || "", variant: p.variant || "", price: p.price, oldPrice: p.oldPrice, stock: p.stock, image: p.image, images: p.images || [] }];
    const selectedSku = selectedVariants[p.id] || variants[0].sku;
    const selected = variants.find(v => v.sku === selectedSku) || variants[0];
    const display = {...p, price: Number(selected.price || 0), oldPrice: Number(selected.oldPrice || 0), stock: selected.stock, availableStock:Number(selected.availableStock||0), image: normalizeImageUrl(selected.image || p.image), images:(selected.images||p.images||[]).map(normalizeImageUrl), sku: selected.sku, variant: selected.variant, variantId: selected.variantId};
    return `
      ${header()}
      <main class="page">
        <a class="back" href="#shop">← Back to Shop</a>
        <div class="product-detail">
          <div class="detail-gallery">
            <div class="detail-media" id="detailMedia">${productImage(display, true)}</div>
            ${(display.images && display.images.length > 1) ? `<div class="detail-thumbs">${display.images.slice(0,6).map((im,i)=>`<button class="detail-thumb ${normalizeImageUrl(im)===normalizeImageUrl(display.image)?"active":""}" type="button" onclick="selectProductImage('${escapeHtml(normalizeImageUrl(im))}')"><img src="${escapeHtml(imageCandidates(im)[0]||normalizeImageUrl(im))}" data-image-candidates="${escapeHtml(JSON.stringify(imageCandidates(im)))}" onerror="handleImageError(this)" loading="lazy" alt="${escapeHtml(display.name)} image ${i+1}"></button>`).join("")}</div>` : ""}
          </div>
          <div class="detail-info">
            <span class="eyebrow">${escapeHtml(display.category)}</span>
            <h1>${escapeHtml(display.name)}</h1>
            <p class="muted">${escapeHtml(display.brand)} · SKU ${escapeHtml(display.sku || display.id)}</p>
            <div class="detail-price"><strong>${money(display.price)}</strong>${display.oldPrice?`<del>${money(display.oldPrice)}</del>`:""}</div>
            <span class="${stockClass(display.stock)}">${escapeHtml(display.stock)}</span>
            <p>${escapeHtml(display.description)}</p>
            <div class="variant"><b>Variant</b><div class="chips variant-chips">${variants.map(v => `<button class="${v.sku===selectedSku?"active":""}" onclick="selectVariant('${escapeHtml(p.id)}','${escapeHtml(v.sku)}')">${escapeHtml(v.variant || v.sku || "Standard")}</button>`).join("")}</div></div>
            <div class="buy-row"><div class="qty"><button onclick="changeTempQty(-1)">−</button><span id="tempQty">1</span><button onclick="changeTempQty(1)">+</button></div><button class="btn primary grow" ${display.stock==="Out of Stock"?"disabled":""} onclick="addToCart('${escapeHtml(display.id)}','${escapeHtml(display.sku || "")}',getTempQty())">Add to Cart</button></div>
            <button class="btn outline full" ${display.stock==="Out of Stock"?"disabled":""} onclick="buyNow('${escapeHtml(display.id)}','${escapeHtml(display.sku || "")}',getTempQty())">Buy Now</button>
            <div class="mini-trust"><span>🛡️ Authentic</span><span>🚚 Fast Delivery</span><span>↻ Easy Return</span></div>
          </div>
        </div>
        <section class="section"><div class="section-head"><div><span class="eyebrow">COMPLETE YOUR SETUP</span><h2>Frequently Bought Together</h2></div></div><div class="product-grid">${products.filter(x=>x.id!==p.id).slice(0,3).map(productCard).join("")}</div></section>
      </main>${footer()}`;
  }

  function selectProductImage(url) {
    const box=document.getElementById("detailMedia");
    if(!box) return;
    const img=box.querySelector("img");
    if(img){
      const candidates=imageCandidates(url);
      img.setAttribute("data-image-candidates",JSON.stringify(candidates));
      img.dataset.imageCandidateIndex="1";
      img.onerror=()=>handleImageError(img);
      img.src=getGoogleDriveDirectUrl(url)||url;
      img.style.display="block";
      const fallback=img.nextElementSibling;if(fallback)fallback.hidden=true;
    }
    document.querySelectorAll(".detail-thumb").forEach(b=>b.classList.toggle("active", b.querySelector("img")?.getAttribute("src")===url));
  }

  function selectVariant(productId, sku) {
    selectedVariants[productId] = sku;
    render();
  }

  let tempQty = 1;
  function changeTempQty(delta) {
    tempQty = Math.max(1, tempQty + delta);
    const el = document.getElementById("tempQty"); if (el) el.textContent = tempQty;
  }

  function cartPage() {
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    return `
      ${header()}
      <main class="page narrow"><section class="page-head"><span class="eyebrow">YOUR CART</span><h1>Ready when you are.</h1></section>
      ${cart.length ? `<div class="cart-list">${cart.map(item => `
        <div class="cart-item"><div class="cart-thumb">${productImage(item)}</div><div class="cart-main"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.variant||"")}</small><span class="${stockClass(item.stock)}">${escapeHtml(item.stock)}</span><strong>${money(item.price)}</strong></div>
        <div class="qty"><button onclick="changeCart('${escapeHtml(item.cartKey || item.id)}',-1)">−</button><span>${item.qty}</span><button onclick="changeCart('${escapeHtml(item.cartKey || item.id)}',1)">+</button></div><button class="remove" onclick="removeCart('${escapeHtml(item.cartKey || item.id)}')">×</button></div>`).join("")}</div>
      <div class="summary"><div><span>Subtotal</span><b>${money(total)}</b></div><div><span>Delivery</span><b>${money(Number(storeSettings["Inside Chattogram Delivery"]||60))} Chattogram · ${money(Number(storeSettings["Outside Chattogram Delivery"]||120))} elsewhere</b></div><hr><div class="grand"><span>Total</span><b>${money(total)}</b></div><a class="btn primary full" href="#checkout">Checkout</a><a class="btn outline full" href="#shop">Continue Shopping</a></div>`
      : `<div class="empty"><div class="empty-icon">🛒</div><h2>Your cart is empty</h2><p>Add something you love and come back here.</p><a class="btn primary" href="#shop">Start Shopping</a></div>`}
      </main>${footer()}`;
  }

  function checkoutPage() {
    if(!cart.length) return `${header()}<main class="page narrow"><div class="empty"><div class="empty-icon">🛒</div><h2>Your cart is empty</h2><p>Add a product before opening checkout.</p><a class="btn primary" href="#shop">Start Shopping</a></div></main>${footer()}`;
    const total=cart.reduce((s,item)=>s+item.price*item.qty,0), chg=Number(storeSettings["Inside Chattogram Delivery"]||60), other=Number(storeSettings["Outside Chattogram Delivery"]||120);
    return `${header()}<main class="page narrow"><div class="steps"><b>1 Customer</b><span>2 Delivery</span><span>3 Payment</span></div>
      <section class="form-card checkout-form" oninput="handleCheckoutInput(event)" onfocusout="validateCheckoutField(event)"><span class="eyebrow">CHECKOUT</span><h1>Customer Information</h1>
        <label data-field="name">Full Name *<input id="name" autocomplete="name" minlength="2" placeholder="Enter your full name"></label>
        <label data-field="phone">Mobile Number *<div class="phone-field"><span>+88</span><input id="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="01XXXXXXXXX" aria-describedby="phone-help"></div><small id="phone-help" class="field-hint">Enter exactly 11 digits starting with 01.</small></label>
        <label data-field="email">Email <small>(Optional)</small><input id="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <h2>Delivery Information</h2>
        <div class="two"><label data-field="division">Division *<select id="division" onchange="handleCheckoutInput(event)"><option value="">Select Division</option>${Object.keys(bangladeshDistricts).map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}</select></label><label data-field="district">District *<select id="district" onchange="handleCheckoutInput(event)" disabled><option value="">Select Division First</option></select></label></div>
        <label data-field="address">Full Delivery Address *<textarea id="address" minlength="8" placeholder="House/Flat, Road, Area, Landmark"></textarea></label>
        <input id="website" name="website" type="text" tabindex="-1" autocomplete="off" style="position:absolute;left:-10000px;width:1px;height:1px;opacity:0" aria-hidden="true"><label data-field="note">Delivery Note <small>(Optional)</small><textarea id="note" placeholder="Any special instructions..."></textarea></label>
        <h2>Payment Method</h2>
        <div class="payment-options">
          <label class="payment"><input type="radio" name="payment" value="Cash on Delivery" checked onchange="handlePaymentChange(this.value)"><span class="payment-icon">💵</span><b>Cash on Delivery</b><small>Pay when you receive the product.</small></label>
          <label class="payment payment-brand"><input type="radio" name="payment" value="bKash" onchange="handlePaymentChange(this.value)"><span class="payment-icon">bK</span><div><b>bKash</b><small>${escapeHtml(storeSettings['bKash Type']||'Payment account')} · ${escapeHtml(storeSettings['bKash Number']||'Set in Settings')}</small></div></label>
          <label class="payment payment-brand"><input type="radio" name="payment" value="Nagad" onchange="handlePaymentChange(this.value)"><span class="payment-icon">N</span><div><b>Nagad</b><small>${escapeHtml(storeSettings['Nagad Type']||'Payment account')} · ${escapeHtml(storeSettings['Nagad Number']||'Set in Settings')}</small></div></label>
          <label class="payment"><input type="radio" name="payment" value="Bank Transfer" onchange="handlePaymentChange(this.value)"><span class="payment-icon">🏦</span><div><b>Bank Transfer</b><small>${escapeHtml(storeSettings['Bank Name']||'Set in Settings')} · ${escapeHtml(storeSettings['Bank Account Name']||'Set in Settings')} · A/C ${escapeHtml(storeSettings['Bank Account Number']||'Set in Settings')}</small></div></label>
        </div>
        <div id="paymentInstructions" class="payment-instructions hidden"></div>
        <div id="paymentProofFields" class="payment-proof-fields hidden"><label data-field="transactionId">Transaction ID *<input id="transactionId" autocomplete="off" placeholder="Enter transaction ID"></label><label>Payment Screenshot <small>(Optional)</small><input id="paymentProof" type="file" accept="image/jpeg,image/png,image/webp" onchange="handlePaymentProof(this)"><small class="field-hint">Maximum 3 MB.</small></label></div>
        <div class="delivery-note-card"><b>🚚 Delivery</b><span>Chattogram District: ${money(chg)} · Other Districts: ${money(other)}</span><span class="free-delivery-progress" id="freeDeliveryMessage">Free delivery eligibility is checked automatically.</span></div>
        <div class="summary checkout-summary"><div><span>Subtotal</span><b>${money(total)}</b></div><div><span>Delivery</span><b id="deliveryAmount">Select district</b></div><hr><div class="grand"><span>Total</span><b id="checkoutGrandTotal">${money(total)}</b></div><button id="placeOrderBtn" class="btn primary full order-submit" type="button" disabled onclick="placeOrder()">Place Order</button><small class="legal">By placing your order, you agree to our <a href="#terms">Terms & Conditions</a> and <a href="#privacy">Privacy Policy</a>.</small></div>
      </section></main>${footer()}`;
  }
  function handlePaymentChange(method){
    const proof=document.getElementById('paymentProofFields'),instructions=document.getElementById('paymentInstructions');if(!proof||!instructions)return;
    const non=method!=='Cash on Delivery';proof.classList.toggle('hidden',!non);
    if(!non){instructions.classList.add('hidden');instructions.innerHTML='';window.__paymentProofBase64='';return;}
    const lines=method==='bKash'?`Send payment to ${escapeHtml(storeSettings['bKash Number']||'Set in Settings')} (${escapeHtml(storeSettings['bKash Type']||'Payment account')})`:method==='Nagad'?`Send payment to ${escapeHtml(storeSettings['Nagad Number']||'Set in Settings')} (${escapeHtml(storeSettings['Nagad Type']||'Payment account')})`:`Bank: ${escapeHtml(storeSettings['Bank Name']||'Set in Settings')} · A/C ${escapeHtml(storeSettings['Bank Account Number']||'Set in Settings')} · ${escapeHtml(storeSettings['Bank Account Name']||'Set in Settings')}`;
    instructions.innerHTML=`<b>Payment instructions</b><span>${lines}</span><small>Complete payment, then enter the Transaction ID below.</small>`;instructions.classList.remove('hidden');
  }
  function handlePaymentProof(input){
    const file=input?.files?.[0];if(!file){window.__paymentProofBase64='';return;}if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>3*1024*1024){toast('Choose a JPG, PNG or WEBP image under 3 MB.');input.value='';return;}
    const reader=new FileReader();reader.onload=()=>{window.__paymentProofBase64=String(reader.result).split(',')[1]||'';window.__paymentProofMimeType=file.type;window.__paymentProofName=file.name;};reader.readAsDataURL(file);
  }

  function confirmationPage() {
    const saved=JSON.parse(localStorage.getItem('fgbd_last_order')||'null')||{};
    const subtotal = Number(window.demoSubtotal ?? saved.subtotal ?? 0);
    const shipping = Number(window.demoShipping ?? saved.shipping ?? 0);
    const total = Number(window.demoTotal ?? saved.total ?? 0);
    const orderId=window.demoOrderId || saved.orderId || '';
    if(!orderId && location.hash==='#confirmed') return `${header()}<main class="page narrow"><div class="empty"><h2>No recent order found</h2><p>Your confirmation expired from this device.</p><a class="btn primary" href="#track">Track Order</a></div></main>${footer()}`;
    const items=Array.isArray(saved.items)?saved.items:[];
    return `${header()}<main class="page narrow"><div class="success-card"><div class="success-icon">✓</div><span class="eyebrow">THANK YOU</span><h1>Order Confirmed!</h1><p>Your order has been received. We’ll contact you shortly to confirm delivery details.</p><b>Order ID: <span id="demoOrderId">${escapeHtml(orderId || "—")}</span></b><div class="confirmation-items">${items.map(i=>`<div><span>${escapeHtml(i.name)} × ${i.qty}</span><b>${money(Number(i.price||0)*Number(i.qty||0))}</b></div>`).join("")}</div><div class="confirmation-breakdown"><span>Subtotal <b>${money(subtotal)}</b></span><span>Delivery <b>${shipping ? money(shipping) : "FREE"}</b></span><strong>Total <b>${money(total)}</b></strong></div><a class="btn primary full" href="#track">Track Your Order</a><a class="btn outline full" href="#home">Back to Home</a></div></main>${footer()}`;
  }

  function trackPage() {
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">ORDER TRACKING</span><h1>Track your order.</h1><p>Enter your Order ID and phone number to view your latest status.</p></section>
      <div class="form-card"><label>Order ID<input id="trackOrderId" placeholder="e.g. FG-20261008-0001" autocomplete="off"></label><label>Phone Number<div class="phone-field"><span>+88</span><input id="trackPhone" inputmode="numeric" maxlength="11" placeholder="01XXXXXXXXX" autocomplete="tel"></div></label><button class="btn primary full" onclick="trackOrder()">Track Order</button></div>
      <div id="tracking-result"></div></main>${footer()}`;
  }

  function searchPage() {
    const matches=filteredProducts();
    return `${header()}<main class="page"><section class="page-head"><span class="eyebrow">SEARCH</span><h1>What are you looking for?</h1></section><div class="searchbar"><input id="searchPageInput" autofocus placeholder="Search products..." oninput="handleSearchPageInput(this.value)" value="${escapeHtml(currentSearch)}"><button type="button" onclick="handleSearchPageInput(document.getElementById('searchPageInput').value)">⌕</button></div><div id="searchResults" class="product-grid">${matches.length?matches.map(productCard).join(''):'<div class="empty">No products found.</div>'}</div></main>${footer()}`;
  }
  function handleSearchPageInput(value){currentSearch=String(value||'');const box=document.getElementById('searchResults');if(box){const m=filteredProducts();box.innerHTML=m.length?m.map(productCard).join(''):'<div class="empty">No products found.</div>';}}
  function filteredProducts(){const q=currentSearch.toLowerCase();return products.filter(p=>!q||`${p.name} ${p.brand} ${p.category} ${p.subcategory||''} ${p.sku||''}`.toLowerCase().includes(q));}

  function accountPage() {
    return `${header()}<main class="page narrow"><section class="account-card"><div class="avatar">👤</div><div><h1>My Account</h1><p class="muted">Guest account — create an account later to save addresses and order history.</p></div></section><div class="menu-list"><a href="#track">📦 <b>Track Order</b><span>→</span></a><a href="#account?recent=1">🕘 <b>Recently Viewed</b><span>→</span></a><a href="#support">💬 <b>Support</b><span>→</span></a><a href="#faq">❓ <b>FAQ</b><span>→</span></a></div>${location.hash.includes("recent=1")?`<section class="section"><div class="product-grid">${(JSON.parse(localStorage.getItem("fgbd_recent")||"[]")).map(id=>products.find(p=>p.id===id)).filter(Boolean).map(productCard).join("")||'<div class="empty">No recently viewed products yet.</div>'}</div></section>`:""}</main>${footer()}`;
  }

  function aboutPage(){return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">ABOUT US</span><h1>Flash Gear BD</h1><p>Your gadget partner in Bangladesh.</p></section><div class="form-card"><p>Flash Gear BD is a Mobile & Accessories shop focused on quality gadgets, clear pricing and dependable delivery.</p><p>Visit us at ${escapeHtml(storeSettings.Address||'Meridian Kohinoor City Level 5, 537 No. Shop')} during ${escapeHtml(storeSettings['Business Hours']||'11 AM - 9 PM')}.</p></div></main>${footer()}`;}
  function contactPage(){return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">CONTACT</span><h1>Contact Flash Gear BD</h1></section><div class="support-list"><a href="https://wa.me/${String(storeSettings.WhatsApp||"").replace(/\D/g,"")}" target="_blank" rel="noopener"><span>🟢</span><div><b>WhatsApp</b><small>${escapeHtml(storeSettings.WhatsApp||'')}</small></div><strong>→</strong></a><a href="tel:${escapeHtml(storeSettings['Shop Phone']||'')}"><span>📞</span><div><b>Call Us</b><small>${escapeHtml(storeSettings['Shop Phone']||'')}</small></div><strong>→</strong></a><a href="mailto:${escapeHtml(storeSettings.Email||'')}"><span>✉️</span><div><b>Email</b><small>${escapeHtml(storeSettings.Email||'')}</small></div><strong>→</strong></a></div></main>${footer()}`;}
  function termsPage(){return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">TERMS</span><h1>Terms & Conditions</h1></section><div class="form-card"><p>Orders are subject to product availability and confirmation. Customers cannot cancel orders directly from the website; contact our helpline before shipment for cancellation or changes.</p><p>Prices, stock and delivery charges are calculated by the store system at order time.</p></div></main>${footer()}`;}
  function privacyPage(){return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">PRIVACY</span><h1>Privacy Policy</h1></section><div class="form-card"><p>We use the information you provide to process orders, delivery and customer support. We do not ask customers to create passwords for guest checkout.</p><p>Payment transaction information is used to verify payment and manage the order.</p></div></main>${footer()}`;}
  function returnsPage(){return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">RETURNS</span><h1>Return Policy</h1></section><div class="form-card"><p>Eligible products may be returned according to Flash Gear BD's return conditions. Contact support before returning an item so the team can confirm eligibility and instructions.</p><p>Orders already under shipment or shipped may require the customer to receive the parcel and pay the applicable delivery charge.</p></div></main>${footer()}`;}

  function supportPage() {
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">SUPPORT</span><h1>Need Help?</h1><p>We’re here every day from ${escapeHtml(storeSettings["Business Hours"]||"11 AM - 9 PM")}.</p></section><div class="support-list"><a href="https://wa.me/${String(storeSettings.WhatsApp||"").replace(/\D/g,"")}" target="_blank" rel="noopener"><span>🟢</span><div><b>WhatsApp</b><small>${escapeHtml(storeSettings.WhatsApp||"")}</small></div><strong>→</strong></a><a href="tel:${escapeHtml(storeSettings["Shop Phone"]||"")}"><span>📞</span><div><b>Call Us</b><small>${escapeHtml(storeSettings["Shop Phone"]||"")}</small></div><strong>→</strong></a><a href="mailto:${escapeHtml(storeSettings.Email||"")}"><span>✉️</span><div><b>Email</b><small>${escapeHtml(storeSettings.Email||"")}</small></div><strong>→</strong></a></div><div class="help-banner">📍 <b>Visit Flash Gear BD</b><span>${escapeHtml(storeSettings.Address||"Store address")} · ${escapeHtml(storeSettings["Business Hours"]||"11 AM - 9 PM")}</span></div></main>${footer()}`;
  }

  function faqPage() {
    const qs = [
      ["How do I place an order?", "Choose a product, add it to your cart, enter delivery information and select your preferred payment method."],
      ["Do you offer Cash on Delivery?", "Yes. Cash on Delivery is one of the available payment methods."],
      ["How can I track my order?", "Use the Track Order page with your Order ID and phone number."],
      ["Will the website show exact stock quantity?", "No. Customers only see In Stock, Low Stock or Out of Stock."],
      ["How do I get support?", "Contact Flash Gear BD through the support options provided on the website."]
    ];
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">FAQ</span><h1>Frequently Asked Questions</h1></section><div class="faq">${qs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></main>${footer()}`;
  }

  function footer() {
    return `<footer>
      <div class="footer-main">
        <div class="footer-brand"><img src="${logo}" alt="Flash Gear BD"><div><b>FLASH GEAR BD</b><span>Your Gadget Partner</span><p>Quality gadgets, better life. Flash Gear BD brings you the latest tech and accessories at the best price in Bangladesh.</p></div></div>
        <div class="footer-grid">
          <div><b>Quick Links</b><a href="#home">Home</a><a href="#shop">All Products</a><a href="#offers">Deals</a><a href="#track">Track Order</a></div>
          <div><b>Categories</b><a href="#shop?category=Gadget%20%26%20Accessories">Gadget & Accessories</a><a href="#shop?category=Charger">Charger</a><a href="#shop?category=Cable%20%26%20Adapter">Cable & Adapter</a><a href="#shop?category=Earbuds">Earbuds</a><a href="#shop?category=Headphones">Headphones</a></div>
          <div><b>Customer Service</b><a href="#support">Support</a><a href="#faq">FAQ</a><a href="tel:${escapeHtml(storeSettings["Shop Phone"]||"")}">${escapeHtml(storeSettings["Shop Phone"]||"Call Us")}</a><a href="mailto:${escapeHtml(storeSettings.Email||"")}">${escapeHtml(storeSettings.Email||"Email Us")}</a></div>
          <div><b>Visit Us</b><span>${escapeHtml(storeSettings.Address||"Store address")}</span><span>${escapeHtml(storeSettings["Business Hours"]||"11 AM - 9 PM")}</span><span>Chattogram, Bangladesh</span></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} Flash Gear BD. All rights reserved.</span><span><a href="#terms">Terms</a> · <a href="#privacy">Privacy</a> · <a href="#returns">Returns</a></span></div>
    </footer>`;
  }

  function addToCart(id, sku = "", qty = 1) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [{ sku: p.sku || "", variantId: p.variantId || p.sku || "", variant: p.variant || "", price: p.price, oldPrice: p.oldPrice, stock: p.stock, image: p.image, images: p.images || [] }];
    const v = variants.find(x => x.sku === sku) || variants[0];
    if (!v || v.stock === "Out of Stock") return;
    const key = `${id}::${v.sku || "default"}`;
    const amount = Math.max(1, Number(qty || 1));
    const available = Math.max(0, Number(v.availableStock ?? 0));
    const existing = cart.find(x => x.cartKey === key);
    const nextQty = (existing ? Number(existing.qty||0) : 0) + amount;
    if(available && nextQty>available){ toast(`Only ${available} unit${available===1?'':'s'} available.`); return; }
    if (existing) existing.qty = nextQty;
    else cart.push({...p, price: Number(v.price || 0), oldPrice: Number(v.oldPrice || 0), stock: v.stock, availableStock: available, image: normalizeImageUrl(v.image || p.image), variant: v.variant || p.variant, sku: v.sku || p.sku || "", variantId: v.variantId || v.sku || p.variantId || "", cartKey: key, qty: amount});
    saveCart();
    toast("Added to cart ✓");
  }

  function getTempQty() { return Math.max(1, Number(tempQty || 1)); }
  function buyNow(id, sku = "", qty = 1) { addToCart(id, sku, qty); location.hash = "#checkout"; }
  function changeCart(id, delta) {
    const item = cart.find(x => (x.cartKey || x.id) === id); if (!item) return;
    item.qty += delta;
    const live=products.find(p=>String(p.id)===String(item.id)); const lv=live?.variants?.find(v=>String(v.sku||'')===String(item.sku||'')); const av=lv?Math.max(0,Number(lv.availableStock??0)):0; if(item.qty>av && av>0){item.qty=av;toast(`Only ${av} available.`);}
    if (item.qty <= 0) cart = cart.filter(x => (x.cartKey || x.id) !== id);
    saveCart(); render();
  }
  function removeCart(id) { cart = cart.filter(x => (x.cartKey || x.id) !== id); saveCart(); render(); }

  function setSearch(v) { currentSearch = String(v || ""); updateShopResults(); }

  function searchMatchScore(p, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return 0;
    const name = String(p.name || "").toLowerCase();
    const brand = String(p.brand || "").toLowerCase();
    const category = String(p.category || "").toLowerCase();
    const subcategory = String(p.subcategory || "").toLowerCase();
    const sku = String(p.sku || "").toLowerCase();
    const fields = [name, brand, category, subcategory, sku];
    if (!fields.some(x => x.includes(q))) return -1;
    let score = 0;
    if (name === q) score += 1200;
    else if (name.startsWith(q)) score += 1000;
    else if (name.split(/\s+/).some(w => w.startsWith(q))) score += 900;
    else if (name.includes(q)) score += 760;
    if (brand === q) score += 700;
    else if (brand.startsWith(q)) score += 620;
    else if (brand.includes(q)) score += 540;
    if (category.startsWith(q) || subcategory.startsWith(q)) score += 400;
    else if (category.includes(q) || subcategory.includes(q)) score += 300;
    if (sku.startsWith(q)) score += 220;
    else if (sku.includes(q)) score += 160;
    return score;
  }

  function getHeaderSuggestions(query) {
    const q = String(query || "").trim();
    if (!q || !products.length) return [];
    return products.map(p => ({ p, score: searchMatchScore(p, q) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name)))
      .slice(0, 5)
      .map(x => x.p);
  }

  function renderHeaderSuggestions(query) {
    const box = document.getElementById("headerSearchSuggestions");
    if (!box) return;
    const q = String(query || "").trim();
    const matches = getHeaderSuggestions(q);
    if (!q) { box.innerHTML = ""; box.classList.remove("show"); return; }
    if (!matches.length) {
      box.innerHTML = `<div class="search-suggestion-empty">No matching products</div>`;
      box.classList.add("show");
      return;
    }
    box.innerHTML = matches.map(p => `
      <button type="button" class="search-suggestion" onclick="chooseHeaderSuggestion('${escapeHtml(p.id)}')">
        <span class="search-suggestion-image">${productImage(p)}</span>
        <span class="search-suggestion-copy"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.brand || p.category || "Product")} · ${money(p.price)}</small></span>
      </button>`).join("");
    box.classList.add("show");
  }

  function handleHeaderSearchInput(value) {
    currentSearch = String(value || "");
    renderHeaderSuggestions(currentSearch);
  }

  function hideHeaderSuggestions() {
    const box = document.getElementById("headerSearchSuggestions");
    if (box) box.classList.remove("show");
  }

  function chooseHeaderSuggestion(id) {
    const p = products.find(x => String(x.id) === String(id));
    if (!p) return;
    currentSearch = p.name;
    hideHeaderSuggestions();
    location.href = `/product/${encodeURIComponent(p.id)}`;
  }

  function submitHeaderSearch(event) {
    event.preventDefault();
    const input = document.getElementById("headerSearch");
    currentSearch = (input?.value || "").trim();
    hideHeaderSuggestions();
    location.hash = `#search?q=${encodeURIComponent(currentSearch)}`;
  }
  function setCategory(v) { currentCategory = v; render(); }
  function toggleMenu() {
    const drawer = document.getElementById("sideDrawer");
    const backdrop = document.getElementById("drawerBackdrop");
    const button = document.querySelector(".mobile-menu");
    if (!drawer || !backdrop) return;
    const open = !drawer.classList.contains("open");
    drawer.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    button?.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("drawer-open", open);
  }
  function closeMenu() {
    document.getElementById("main-menu")?.classList.remove("open");
    const drawer = document.getElementById("sideDrawer");
    const backdrop = document.getElementById("drawerBackdrop");
    const button = document.querySelector(".mobile-menu");
    drawer?.classList.remove("open");
    backdrop?.classList.remove("open");
    drawer?.setAttribute("aria-hidden", "true");
    backdrop?.setAttribute("aria-hidden", "true");
    button?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
  }

  const requiredCheckoutFields = ["name", "phone", "division", "district", "address"];

  function phoneIsValid() {
    const digits = (document.getElementById("phone")?.value || "").replace(/\D/g, "");
    return /^01\d{9}$/.test(digits);
  }

  function getCheckoutFieldValid(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const value=String(el.value||'').trim();
    if(id==='phone') return phoneIsValid();
    if(id==='name') return value.length>=2;
    if(id==='address') return value.length>=8;
    if(id==='email') return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return value.length>0;
  }

  function markCheckoutField(id, invalid) {
    const el = document.getElementById(id);
    const wrap = el?.closest("[data-field]");
    if (!wrap) return;
    wrap.classList.toggle("field-invalid", Boolean(invalid));
    el.setAttribute("aria-invalid", invalid ? "true" : "false");
  }

  function syncDistrictOptions() {
    const division = document.getElementById("division");
    const district = document.getElementById("district");
    if (!division || !district) return;
    const selected = district.value;
    const list = bangladeshDistricts[division.value] || [];
    district.innerHTML = `<option value="">${list.length ? "Select District" : "Select Division First"}</option>` + list.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    district.disabled = !list.length;
    if (list.includes(selected)) district.value = selected;
  }

  function handleCheckoutInput(event) {
    const target = event?.target;
    if (target?.id === "division") syncDistrictOptions();
    if (target?.id && requiredCheckoutFields.includes(target.id)) {
      const hasValue = String(target.value || "").trim().length > 0;
      markCheckoutField(target.id, hasValue && !getCheckoutFieldValid(target.id));
      const index = requiredCheckoutFields.indexOf(target.id);
      if (index > 0) {
        const previousId = requiredCheckoutFields[index - 1];
        if (!getCheckoutFieldValid(previousId)) markCheckoutField(previousId, true);
      }
    }
    validateCheckout();
  }

  function validateCheckoutField(event) {
    const target = event?.target;
    if (!target?.id || !requiredCheckoutFields.includes(target.id)) return;
    markCheckoutField(target.id, !getCheckoutFieldValid(target.id));

    const index = requiredCheckoutFields.indexOf(target.id);
    if (index > 0) {
      const previousId = requiredCheckoutFields[index - 1];
      if (!getCheckoutFieldValid(previousId)) markCheckoutField(previousId, true);
    }
    validateCheckout();
  }

  function getDeliveryCharge(district){return String(district||'').toLowerCase()==='chattogram'?Number(storeSettings["Inside Chattogram Delivery"]||60):Number(storeSettings["Outside Chattogram Delivery"]||120);}

  function validateCheckout() {
    const btn = document.getElementById("placeOrderBtn");
    if (!btn) return false;
    const valid = requiredCheckoutFields.every(getCheckoutFieldValid) && (document.querySelector('input[name="payment"]:checked')?.value==='Cash on Delivery' || String(document.getElementById('transactionId')?.value||'').trim().length>=3);
    btn.disabled = !valid;
    btn.classList.toggle("is-disabled", !valid);
    const message = document.getElementById("freeDeliveryMessage");
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    const itemCount = cart.reduce((count, item) => count + Number(item.qty || 0), 0);
    const threshold=Number(storeSettings["Free Delivery Threshold"]||6499), minPrice=Number(storeSettings["Free Delivery Minimum Item Price"]||1500), minItems=Number(storeSettings["Free Delivery Minimum Item Count"]||2);
    const eligible = total > threshold || (itemCount >= minItems && cart.some(item => Number(item.price) >= minPrice));
    if (message) message.textContent = eligible ? "🎉 Congratulations! You unlocked FREE DELIVERY." : `You're ${money(Math.max(0, threshold+1-total))} away from FREE DELIVERY! 🎉`;
    const district=document.getElementById('district')?.value||'';
    const shipping=eligible?0:(district?getDeliveryCharge(district):null);
    const da=document.getElementById('deliveryAmount'),gt=document.getElementById('checkoutGrandTotal');
    if(da)da.textContent=shipping===null?'Select district':shipping===0?'FREE':money(shipping);
    if(gt)gt.textContent=money(total+(shipping||0));
    return valid;
  }

  async function placeOrder() {
    if (!validateCheckout()) {
      const firstInvalid = requiredCheckoutFields.find(id => !getCheckoutFieldValid(id));
      if (firstInvalid) {
        markCheckoutField(firstInvalid, true);
        document.getElementById(firstInvalid)?.focus();
      }
      toast("Please complete the highlighted required field.");
      return;
    }
    if (!cart.length) { toast("Your cart is empty."); return; }

    const btn = document.getElementById("placeOrderBtn");
    if (btn) { btn.disabled = true; btn.classList.add("is-disabled"); btn.textContent = "Placing Order…"; }

    const phone = document.getElementById("phone").value.trim();
    const payload = {
      name: document.getElementById("name").value.trim(),
      phone,
      email: document.getElementById("email").value.trim(),
      division: document.getElementById("division").value,
      district: document.getElementById("district").value,
      address: document.getElementById("address").value.trim(),
      note: document.getElementById("note").value.trim(),
      website: document.getElementById("website")?.value || "",
      payment: document.querySelector('input[name="payment"]:checked')?.value || "Cash on Delivery",
      transactionId: document.getElementById('transactionId')?.value.trim() || '',
      paymentProofBase64: window.__paymentProofBase64 || '', paymentProofMimeType: window.__paymentProofMimeType || '', paymentProofName: window.__paymentProofName || '',
      idempotencyKey: (crypto.randomUUID ? crypto.randomUUID() : `fg-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      items: cart.map(item => ({ productId: item.id, sku: item.sku || "", qty: Number(item.qty) }))
    };

    try {
      if (backendOnline || !CFG.useMockData) {
        const data = await apiRequest("/createOrder", { method: "POST", body: JSON.stringify(payload) });
        if (!data.orderId) throw new Error(data.error || "Order was not created.");
        window.demoOrderId = data.orderId;
        window.demoShipping = Number(data.shipping ?? data.delivery ?? 0);
        window.demoSubtotal = Number(data.subtotal ?? 0);
        window.demoTotal = Number(data.total ?? (window.demoSubtotal + window.demoShipping));
        window.demoPhone = "+88" + phone;
        localStorage.setItem('fgbd_last_order',JSON.stringify({orderId:data.orderId,subtotal:window.demoSubtotal,shipping:window.demoShipping,total:window.demoTotal,items:cart.map(i=>({name:i.name,qty:i.qty,price:i.price}))}));
        cart = []; saveCart();
        location.hash = "#confirmed";
        return;
      }
      if (CFG.allowDemoOrders) {
        window.demoOrderId = "DEMO-" + Date.now().toString().slice(-6);
        window.demoTotal = cart.reduce((s, item) => s + item.price * item.qty, 0);
        window.demoPhone = "+88" + phone;
        localStorage.setItem('fgbd_last_order',JSON.stringify({orderId:data.orderId,subtotal:window.demoSubtotal,shipping:window.demoShipping,total:window.demoTotal,items:cart.map(i=>({name:i.name,qty:i.qty,price:i.price}))}));
        cart = []; saveCart(); location.hash = "#confirmed";
        return;
      }
      throw new Error("Order system is not connected yet. Please try again shortly.");
    } catch (error) {
      toast(error.message || "Unable to place the order. Please try again.");
      if (btn) { btn.disabled = false; btn.classList.remove("is-disabled"); btn.textContent = "Place Order"; }
    }
  }

  async function trackOrder() {
    const result = document.getElementById("tracking-result");
    const orderId = document.getElementById('trackOrderId')?.value.trim();
    const phone = document.getElementById('trackPhone')?.value.trim();
    if (!orderId || !/^01\d{9}$/.test(phone)) { toast("Enter a valid Order ID and 11-digit phone number."); return; }
    if (!result) return;

    try {
      if (backendOnline || !CFG.useMockData) {
        const data = await apiRequest(`/trackOrder?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`);
        if (!data.order) throw new Error(data.error || "Order not found.");
        const o = data.order;
        result.innerHTML = `<div class="tracking-card"><div class="tracking-top"><b>${escapeHtml(o.orderId)}</b><span class="stock in">${escapeHtml(o.status)}</span></div><div class="timeline">${o.timeline.map(t => `<div class="${t.done ? "done" : ""}">${t.done ? "●" : "○"}<span>${escapeHtml(t.status)}<small>${t.done ? "Completed" : "Waiting for update"}</small></span></div>`).join("")}</div><div class="tracking-meta"><span>Total <b>${money(o.total)}</b></span><span>Payment <b>${escapeHtml(o.payment)}</b></span><span>Courier <b>${escapeHtml(o.courier || "Not assigned yet")}</b></span><span>Tracking ID <b>${escapeHtml(o.trackingId || "—")}</b></span></div></div>`;
        return;
      }
    } catch (error) {
      result.innerHTML = `<div class="empty"><h3>Order not found</h3><p>${escapeHtml(error.message || "Please check your Order ID and phone number.")}</p></div>`;
      return;
    }
    result.innerHTML = `<div class="tracking-card"><div class="tracking-top"><b>${escapeHtml(orderId)}</b><span class="stock in">Confirmed</span></div><div class="timeline"><div class="done">●<span>Order Placed<small>Received successfully</small></span></div><div class="done">●<span>Confirmed<small>Order confirmed</small></span></div><div>○<span>Shipped<small>Waiting for update</small></span></div><div>○<span>Delivered<small>Waiting for update</small></span></div></div><div class="tracking-meta"><span>Courier <b>Not assigned yet</b></span><span>Tracking ID <b>—</b></span></div></div>`;
  }

  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
  }


  function updateHeroSlide(){
    const s=heroSlides[heroIndex],ey=document.getElementById('heroEyebrow'),ti=document.getElementById('heroTitle'),tx=document.getElementById('heroText'),ix=document.getElementById('heroIndex');
    if(!ey||!ti||!tx||!ix)return;ey.textContent=s.eyebrow;ti.innerHTML=`${escapeHtml(s.title)}<br><span>${escapeHtml(s.accent)}</span>`;tx.textContent=s.text;ix.textContent=String(heroIndex+1).padStart(2,'0');
  }
  function nextHeroSlide(){heroIndex=(heroIndex+1)%heroSlides.length;updateHeroSlide();}
  function startHeroSlider(){if(heroTimer)clearInterval(heroTimer);if(document.querySelector('[data-hero-slider]'))heroTimer=setInterval(nextHeroSlide,4500);}

  function stopHomeSliders() {
    if(heroTimer){clearInterval(heroTimer);heroTimer=null;}
    if (homeSliderTimer) { clearInterval(homeSliderTimer); homeSliderTimer = null; }
    document.querySelectorAll("[data-home-slider]").forEach(slider => slider.classList.remove("is-dragging"));
  }

  function initHomeSliders() {
    stopHomeSliders();
    const sliders = [...document.querySelectorAll("[data-home-slider]")];
    if (!sliders.length) return;
    sliders.forEach(setupHomeSlider);
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sliders.forEach(slider=>{slider.addEventListener('mouseenter',()=>slider.dataset.pauseUntil=String(Date.now()+86400000));slider.addEventListener('mouseleave',()=>slider.dataset.pauseUntil='0');});
    homeSliderTimer = setInterval(() => {
      document.querySelectorAll("[data-home-slider]").forEach(slider => advanceHomeSlider(slider));
    }, 2600);
  }

  function sliderStep(slider) {
    const track = slider.querySelector(".product-slider-track");
    const card = track?.querySelector(".product-card");
    if (!track || !card) return 0;
    const gap = parseFloat(getComputedStyle(track).gap || "0") || 0;
    return card.getBoundingClientRect().width + gap;
  }

  function advanceHomeSlider(slider) {
    if (Number(slider.dataset.pauseUntil || 0) > Date.now()) return;
    const track = slider.querySelector(".product-slider-track");
    if (!track) return;
    const max = Math.max(0, track.scrollWidth - slider.clientWidth);
    if (max <= 2) return;
    const next = Math.min(track.scrollLeft + sliderStep(slider), max);
    if (next >= max - 2) {
      track.scrollTo({left:0, behavior:"smooth"});
    } else {
      track.scrollTo({left:next, behavior:"smooth"});
    }
  }

  function setupHomeSlider(slider) {
    const track = slider.querySelector(".product-slider-track");
    if (!track || track.dataset.bound === "1") return;
    track.dataset.bound = "1";
    let startX = 0, startScroll = 0, dragging = false;
    track.addEventListener("pointerdown", e => {
      if(e.target.closest('a,button,select,input')) return;
      dragging = true; startX = e.clientX; startScroll = track.scrollLeft;
      slider.dataset.pauseUntil = String(Date.now() + 4500);
      slider.classList.add("is-dragging"); track.setPointerCapture?.(e.pointerId);
    });
    track.addEventListener("pointermove", e => {
      if (!dragging) return;
      track.scrollLeft = startScroll - (e.clientX - startX);
    });
    const end = () => { dragging = false; slider.classList.remove("is-dragging"); };
    track.addEventListener("pointerup", e => { slider.dataset.pauseUntil = String(Date.now() + 3500); end(e); });
    track.addEventListener("pointercancel", end);
    track.addEventListener("pointerleave", e => { if (dragging && e.buttons === 0) end(); });
    track.addEventListener("touchstart", () => {}, {passive:true});
  }

  function render(preserveScroll = true) {
    const savedScrollY = preserveScroll ? window.scrollY : 0;
    const cleanPath=location.pathname.replace(/^\/+|\/+$/g,'');
    const cleanQuery=location.search.replace(/^\?/,'');
    let cleanRoute=cleanPath.startsWith('product/')?'product/'+decodeURIComponent(cleanPath.slice(8)):cleanPath;
    if((!cleanRoute||cleanRoute==='index.html')&&cleanQuery){
      const directParams=new URLSearchParams(cleanQuery);
      if(directParams.get('id'))cleanRoute='product/'+decodeURIComponent(directParams.get('id'));
      else if(directParams.get('route'))cleanRoute=String(directParams.get('route')).replace(/^\/+/, '');
    }
    const hash = cleanRoute && cleanRoute!=='index.html' ? cleanRoute+(cleanQuery&&!/^product\//.test(cleanRoute)?'?'+cleanQuery:'') : (location.hash.replace(/^#/, "") || "home");
    const [path, query] = hash.split("?");
    let html = "";
    if (path === "home") { currentCollection="all"; html = homePage(); }
    else if (path === "shop") {
      const params = new URLSearchParams(query || "");
      currentCollection = params.get('collection') || 'all';
      currentCategory = params.get("category") || "All";
      html = shopPage();
    }
    else if (path.startsWith("product/")) html = productPage(path.split("/")[1]);
    else if (path === "cart") html = cartPage();
    else if (path === "checkout") html = checkoutPage();
    else if (path === "confirmed") html = confirmationPage();
    else if (path === "track") html = trackPage();
    else if (path === "search") html = searchPage();
    else if (path === "account") html = accountPage();
    else if (path === "support") html = supportPage();
    else if (path === "about") html = aboutPage();
    else if (path === "contact") html = contactPage();
    else if (path === "terms") html = termsPage();
    else if (path === "privacy") html = privacyPage();
    else if (path === "returns") html = returnsPage();
    else if (path === "faq") html = faqPage();
    else if (path === "offers") { currentCollection="deals"; currentCategory="All"; html = shopPage(); }
    else if (path === "new") { currentCollection="new"; currentCategory="All"; html = shopPage(); }
    else html = homePage();

    const app = document.getElementById("app");
    const titles={home:"Flash Gear BD — Your Gadget Partner",shop:"Shop Gadgets — Flash Gear BD",offers:"Deals — Flash Gear BD",new:"New Arrivals — Flash Gear BD",search:"Search — Flash Gear BD",track:"Track Order — Flash Gear BD",support:"Help & Support — Flash Gear BD",about:"About Flash Gear BD",contact:"Contact Flash Gear BD",terms:"Terms & Conditions — Flash Gear BD",privacy:"Privacy Policy — Flash Gear BD",returns:"Return Policy — Flash Gear BD"};document.title=titles[path]||"Flash Gear BD — Your Gadget Partner";
    app.classList.remove("page-enter");
    app.innerHTML = html;
    const dockRoot = document.getElementById("mobileDockRoot");
    if (dockRoot) dockRoot.innerHTML = bottomNav();
    void app.offsetWidth;
    app.classList.add("page-enter");
    updateCartCount();
    document.querySelectorAll("[data-dock]").forEach(a=>a.classList.toggle("active", (a.dataset.dock===path || (a.dataset.dock==="shop" && ["shop","search","offers","new"].includes(path)))));
    if (path === "home") { initHomeSliders(); startHeroSlider(); }
    else stopHomeSliders();
    if (path === "checkout") validateCheckout();
    if (preserveScroll) {
      requestAnimationFrame(() => window.scrollTo({top: savedScrollY, left: 0, behavior: "auto"}));
    }
  }

  window.addToCart = addToCart;
  window.changeQuickQty = changeQuickQty;
  window.changeCardVariant = changeCardVariant;
  window.nextHeroSlide = nextHeroSlide;
  window.quickQtyValueByKey = quickQtyValueByKey;
  window.buyNow = buyNow;
  window.getTempQty = getTempQty;
  window.changeCart = changeCart;
  window.removeCart = removeCart;
  window.setSearch = setSearch;
  window.handleShopSearchInput = handleShopSearchInput;
  window.handleShopFilter = handleShopFilter;
  window.handleSearchPageInput = handleSearchPageInput;
  window.submitHeaderSearch = submitHeaderSearch;
  window.handleHeaderSearchInput = handleHeaderSearchInput;
  window.hideHeaderSuggestions = hideHeaderSuggestions;
  window.getGoogleDriveDirectUrl = getGoogleDriveDirectUrl;
  window.fixDriveImage = fixDriveImage;
  window.handleImageError = handleImageError;
  window.chooseHeaderSuggestion = chooseHeaderSuggestion;
  window.setCategory = setCategory;
  window.toggleMenu = toggleMenu;
  window.closeMenu = closeMenu;
  window.changeTempQty = changeTempQty;
  window.placeOrder = placeOrder;
  window.selectVariant = selectVariant;
  window.trackOrder = trackOrder;
  window.handleCheckoutInput = handleCheckoutInput;
  window.handlePaymentChange = handlePaymentChange;
  window.handlePaymentProof = handlePaymentProof;
  window.validateCheckout = validateCheckout;
  window.validateCheckoutField = validateCheckoutField;

  window.addEventListener("hashchange", () => { window.scrollTo({top:0, left:0, behavior:"auto"}); render(false); });
  render(false);
  loadProductsFromApi();
  loadStoreSettings();
})();
