(() => {
  "use strict";

  const CFG = window.FLASH_GEAR_CONFIG || {};
  const logo = "./flash-gear-logo.png";

  // Live catalog only. Products are loaded from Google Sheets through the API.
  // Keeping this empty prevents stale demo products from hiding backend/catalog problems.
  let products = [];

  const categories = [
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

  const gadgetSubcategories = [
    ["Charger"], ["Cable & Adapter"], ["Powerbank"],
    ["Earbuds"], ["Neckband"], ["Headphones"],
    ["Microphone"], ["Speaker"], ["Smart watch"]
  ];

  let cart = JSON.parse(localStorage.getItem("fgbd_cart") || "[]");
  let backendOnline = false;
  let liveProductsLoaded = false;
  const selectedVariants = {};
  const quickQuantities = {};
  let homeSliderTimer = null;
  let homeSliderPointer = null;

  async function apiRequest(path, options = {}) {
    const base = (CFG.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("API base URL is not configured.");
    const response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Request failed.");
    return data;
  }

  function normalizeImageUrl(url){
    let value=String(url||'').trim();
    if(!value) return '';
    // Handle Sheets cells that contain IMAGE("url") or quoted URLs.
    const imageFn=value.match(/^=IMAGE\(\s*[\"']([^\"']+)[\"']/i);
    if(imageFn) value=imageFn[1].trim();
    value=value.replace(/^['\"]|['\"]$/g,'').trim();
    value=value.replace(/&amp;/g,'&');

    // Google Drive URLs appear in several formats depending on how they were copied.
    // Convert every Drive file URL to a public thumbnail URL so the browser can render it reliably.
    const drivePatterns=[
      /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/(?:uc)\?export=(?:view|download)&id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]+)/i
    ];
    for(const pattern of drivePatterns){
      const match=value.match(pattern);
      if(match && match[1]) return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(match[1])+'&sz=w1600';
    }
    // A bare Google Drive file ID is also accepted.
    if(/^[A-Za-z0-9_-]{20,}$/.test(value)) return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(value)+'&sz=w1600';
    return value;
  }

  function normalizeLiveProducts(rows) {
    return (rows || []).map(p => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const v = variants[0] || { sku: "", variantId: "", variant: "", price: 0, oldPrice: 0, stock: "Out of Stock", image: "", images: [] };
      return {
        id: p.id, name: p.name, brand: p.brand, category: p.category, subcategory: p.subcategory,
        price: Number(v.price || 0), oldPrice: Number(v.oldPrice || 0), stock: v.stock || "Out of Stock",
        image: normalizeImageUrl(v.image || ""), images: (v.images || []).map(normalizeImageUrl), description: p.description || p.shortDescription || "",
        shortDescription: p.shortDescription || "", variant: v.variant || "", sku: v.sku || "",
        variantId: v.variantId || v.sku || "", variants, featured: !!p.featured, newArrival: !!p.newArrival, deal: !!p.deal
      };
    });
  }

  async function loadProductsFromApi() {
    if (CFG.useMockData && !CFG.tryLiveData) return;
    try {
      const data = await apiRequest("/products");
      if (data.products && data.products.length) {
        products = normalizeLiveProducts(data.products);
        backendOnline = true;
        liveProductsLoaded = true;
        render();
      }
    } catch (error) {
      backendOnline = false;
      liveProductsLoaded = false;
      products = [];
      render();
    }
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
    const src = normalizeImageUrl(p.image || (p.images || [])[0] || "");
    const fallback = `<span class="product-placeholder ${large ? "large" : ""}" hidden><span>⚡</span><small>${escapeHtml(p.category || "Product")}</small></span>`;
    if (!src) return `<span class="product-image-fallback">${fallback.replace(' hidden','')}</span>`;
    return `<span class="product-image-wrap"><img src="${escapeHtml(src)}" loading="lazy" decoding="async" alt="${escapeHtml(p.name)}" onerror="handleImageError(this)">${fallback}</span>`;
  }

  function handleImageError(img) {
    if (!img) return;
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
            <a href="#shop" onclick="closeMenu()">New Arrivals</a>
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
          <a class="drawer-link" href="#shop" onclick="closeMenu()"><span>✦</span><b>New Arrivals</b><em>›</em></a>
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
        <div class="drawer-help"><span>☎</span><div><b>Need Help?</b><small>We're here 11 AM – 9 PM</small></div><a href="tel:+8801601093553">Call</a></div>
        <div class="drawer-footer">Flash Gear BD · Your Gadget Partner</div>
      </aside>`;
  }

  function bottomNav() {
    return `
      <nav class="bottom-nav">
        <a href="#home">⌂<small>Home</small></a>
        <a href="#shop">▦<small>Categories</small></a>
        <a href="#cart" class="dock-cart">🛒<small>Cart</small><b data-cart-count>0</b></a>
        <a href="#track">◷<small>Orders</small></a>
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
    quickQuantities[key] = Math.max(1, Number(quickQuantities[key] || 1) + Number(delta || 0));
    const el = document.querySelector(`[data-quick-qty="${CSS.escape(key)}"]`);
    if (el) el.textContent = quickQuantities[key];
  }

  function productCard(p) {
    const disabled = p.stock === "Out of Stock" ? "disabled" : "";
    const discount = p.oldPrice && Number(p.oldPrice) > Number(p.price)
      ? Math.round((1 - Number(p.price) / Number(p.oldPrice)) * 100)
      : 0;
    const key = productCartKey(p);
    const qty = quickQtyValue(p);
    const safeKey = escapeHtml(key);
    return `
      <article class="product-card">
        <a href="#product/${p.id}" class="product-media">${productImage(p)}</a>
        ${discount ? `<span class="badge">-${discount}%</span>` : p.deal ? `<span class="badge">DEAL</span>` : ""}
        <div class="product-body">
          <small class="muted">${escapeHtml(p.brand || "Gadget")} · ${escapeHtml(p.category || "Accessories")}</small>
          <a href="#product/${p.id}" class="product-name">${escapeHtml(p.name)}</a>
          <div class="price-row">
            <strong>${money(p.price)}</strong>
            ${p.oldPrice ? `<del>${money(p.oldPrice)}</del>` : ""}
          </div>
          <span class="${stockClass(p.stock)}">${escapeHtml(p.stock)}</span>
          <div class="quick-cart-row">
            <div class="quick-qty" aria-label="Quantity">
              <button type="button" ${disabled} onclick="changeQuickQty('${escapeHtml(p.id)}','${escapeHtml(p.sku || p.variantId || "")}',-1); return false;" aria-label="Decrease quantity">−</button>
              <span data-quick-qty="${safeKey}">${qty}</span>
              <button type="button" ${disabled} onclick="changeQuickQty('${escapeHtml(p.id)}','${escapeHtml(p.sku || p.variantId || "")}',1); return false;" aria-label="Increase quantity">+</button>
            </div>
            <button class="quick-add" ${disabled} onclick="addToCart('${escapeHtml(p.id)}', '${escapeHtml(p.sku || p.variantId || "")}', quickQtyValueByKey('${safeKey}'))">${disabled ? "Out of Stock" : "🛒 Add"}</button>
          </div>
        </div>
      </article>`;
  }

  function quickQtyValueByKey(key) { return Math.max(1, Number(quickQuantities[key] || 1)); }

  function homePage() {
    const featured = products.filter(p => p.featured).slice(0, 4);
    const featuredProducts = featured.length ? featured : products.slice(0, 4);
    const deals = products.filter(p => p.deal || Number(p.oldPrice) > Number(p.price)).slice(0, 4);
    const arrivals = products.filter(p => p.newArrival).slice(0, 4);
    return `
      ${header()}
      <main>
        <section class="hero">
          <div class="hero-copy">
            <span class="eyebrow">PREMIUM GADGETS & ACCESSORIES</span>
            <h1>Technology that<br><span>fits your life.</span></h1>
            <p>Discover quality gadgets, smart accessories and everyday tech essentials with easy ordering and fast delivery across Bangladesh.</p>
            <div class="hero-actions">
              <a class="btn primary" href="#shop">Shop Now →</a>
              <a class="btn ghost" href="#offers">Explore Deals</a>
            </div>
          </div>
          <div class="hero-slide-count"><span class="active">01</span><i>/</i><span>03</span><button aria-label="Next banner">→</button></div>
        </section>

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
          <a class="promo-card promo-arrivals" href="#shop"><div><span class="eyebrow">JUST IN</span><h2>New Arrivals</h2><p>Fresh gadgets and accessories, ready for your setup.</p><span class="promo-btn">Explore →</span></div><div class="promo-orb">✦</div></a>
        </section>

        <section class="section product-section">
          <div class="section-head"><div><span class="eyebrow">HANDPICKED</span><h2>Featured Products</h2></div><a href="#shop">View All →</a></div>
          <div class="product-tabs"><span class="active">Featured</span><a href="#shop">Best Sellers</a><a href="#shop">New Arrivals</a><a href="#offers">Deals</a></div>
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

  function shopPage() {
    const isComingSoon = currentCategory === "Mobile" || currentCategory === "Feature Phone";
    const showGadgetSubcategories = currentCategory === "Gadget & Accessories";
    const filtered = products.filter(p => {
      const matchesSearch = !currentSearch || `${p.name} ${p.brand} ${p.category} ${p.subcategory || ""} ${p.sku || ""}`.toLowerCase().includes(currentSearch.toLowerCase());
      const matchesCat = currentCategory === "All" || currentCategory === "Gadget & Accessories" || p.category === currentCategory;
      return matchesSearch && matchesCat;
    });
    return `
      ${header()}
      <main class="page">
        <section class="page-head"><span class="eyebrow">SHOP</span><h1>Find your next favourite.</h1><p>Browse products by category, brand and availability.</p></section>
        <div class="searchbar"><input id="shopSearch" value="${escapeHtml(currentSearch)}" placeholder="Search products..." oninput="setSearch(this.value)"><button>⌕</button></div>
        <div class="chips">
          <button class="${currentCategory==="All"?"active":""}" onclick="setCategory('All')">All</button>
          ${categories.map(([name,coming]) => `<button class="${currentCategory===name?"active":""}" onclick="setCategory('${name.replace(/'/g,"\'")}')">${name}${coming ? " · Coming Later" : ""}</button>`).join("")}
        </div>
        ${showGadgetSubcategories ? `<div class="subcategory-panel"><b>Gadget & Accessories</b><span>Choose a category</span><div class="chips subchips">${gadgetSubcategories.map(([name])=>`<button onclick="setCategory('${name.replace(/'/g,"\'")}')">${name}</button>`).join("")}</div></div>` : ""}
        ${isComingSoon ? `<div class="coming-soon-card"><div class="coming-soon-icon">⚡</div><span class="eyebrow">COMING LATER</span><h2>We’re currently working on our ${currentCategory.toLowerCase()} inventory.</h2><p>Until then, explore our latest gadgets & accessories.</p><a class="btn primary" href="#shop?category=Gadget%20%26%20Accessories">Explore Gadgets & Accessories</a></div>` : `
        <div class="shop-layout">
          <aside class="filter-panel">
            <b>Filter</b><label>Brand</label><select><option>All Brands</option><option>Apple</option><option>Samsung</option><option>Xiaomi</option><option>Baseus</option><option>Anker</option></select>
            <label>Availability</label><label class="check"><input type="checkbox"> In Stock</label><label class="check"><input type="checkbox"> Low Stock</label>
          </aside>
          <section><div class="results-head"><span>${filtered.length} products</span><select><option>Recommended</option><option>Price: Low to High</option><option>Price: High to Low</option><option>Newest</option></select></div><div class="product-grid">${filtered.length ? filtered.map(productCard).join("") : `<div class="empty">No products found.</div>`}</div></section>
        </div>`}
      </main>${footer()}`;
  }

  function productPage(id) {
    const p = products.find(x => x.id === id) || products[0];
    if (!p) return `${header()}<main class="page"><div class="empty">Product not found.</div></main>${footer()}`;
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [{ sku: p.sku || "", variantId: p.variantId || p.sku || "", variant: p.variant || "", price: p.price, oldPrice: p.oldPrice, stock: p.stock, image: p.image, images: p.images || [] }];
    const selectedSku = selectedVariants[p.id] || variants[0].sku;
    const selected = variants.find(v => v.sku === selectedSku) || variants[0];
    const display = {...p, price: Number(selected.price || 0), oldPrice: Number(selected.oldPrice || 0), stock: selected.stock, image: normalizeImageUrl(selected.image || p.image), sku: selected.sku, variant: selected.variant, variantId: selected.variantId};
    return `
      ${header()}
      <main class="page">
        <a class="back" href="#shop">← Back to Shop</a>
        <div class="product-detail">
          <div class="detail-gallery">
            <div class="detail-media" id="detailMedia">${productImage(display, true)}</div>
            ${(display.images && display.images.length > 1) ? `<div class="detail-thumbs">${display.images.slice(0,6).map((im,i)=>`<button class="detail-thumb ${normalizeImageUrl(im)===normalizeImageUrl(display.image)?"active":""}" type="button" onclick="selectProductImage('${escapeHtml(normalizeImageUrl(im))}')"><img src="${escapeHtml(normalizeImageUrl(im))}" loading="lazy" alt="${escapeHtml(display.name)} image ${i+1}"></button>`).join("")}</div>` : ""}
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
    if(img){ img.src=url; img.style.display="block"; }
    document.querySelectorAll(".detail-thumb").forEach(b=>b.classList.toggle("active", b.querySelector("img")?.src===url));
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
      <div class="summary"><div><span>Subtotal</span><b>${money(total)}</b></div><div><span>Delivery</span><b>Calculated at checkout</b></div><hr><div class="grand"><span>Total</span><b>${money(total)}</b></div><a class="btn primary full" href="#checkout">Checkout</a><a class="btn outline full" href="#shop">Continue Shopping</a></div>`
      : `<div class="empty"><div class="empty-icon">🛒</div><h2>Your cart is empty</h2><p>Add something you love and come back here.</p><a class="btn primary" href="#shop">Start Shopping</a></div>`}
      </main>${footer()}`;
  }

  function checkoutPage() {
    const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
    return `
      ${header()}<main class="page narrow"><div class="steps"><b>1 Customer</b><span>2 Delivery</span><span>3 Payment</span></div>
      <section class="form-card checkout-form" oninput="handleCheckoutInput(event)" onfocusout="validateCheckoutField(event)"><span class="eyebrow">CHECKOUT</span><h1>Customer Information</h1>
        <label data-field="name">Full Name *<input id="name" autocomplete="name" placeholder="Enter your full name"></label>
        <label data-field="phone">Mobile Number *<div class="phone-field"><span>+88</span><input id="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="01XXXXXXXXX" aria-describedby="phone-help"></div><small id="phone-help" class="field-hint">Enter exactly 11 digits starting with 01.</small></label>
        <label data-field="email">Email <small>(Optional)</small><input id="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <h2>Delivery Information</h2>
        <div class="two">
          <label data-field="division">Division *<select id="division" onchange="handleCheckoutInput(event)"><option value="">Select Division</option>${Object.keys(bangladeshDistricts).map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("")}</select></label>
          <label data-field="district">District *<select id="district" onchange="handleCheckoutInput(event)" disabled><option value="">Select Division First</option></select></label>
        </div>
        <label data-field="address">Full Delivery Address *<textarea id="address" placeholder="House/Flat, Road, Area, Landmark"></textarea></label>
        <label data-field="note">Delivery Note <small>(Optional)</small><textarea id="note" placeholder="Any special instructions..."></textarea></label>
        <h2>Payment Method</h2>
        <div class="payment-options">
          <label class="payment"><input type="radio" name="payment" value="Cash on Delivery" checked><span class="payment-icon">💵</span><b>Cash on Delivery</b><small>Pay when you receive the product.</small></label>
          <label class="payment payment-brand"><input type="radio" name="payment" value="bKash"><span class="payment-logo-wrap"><img src="https://commons.wikimedia.org/wiki/Special:Redirect/file/BKash-Bangla-Logo-01.png" alt="bKash"></span><div><b>bKash</b><small>Personal · +8801601093553</small></div></label>
          <label class="payment payment-brand"><input type="radio" name="payment" value="Nagad"><span class="payment-logo-wrap"><img src="https://logotyp.us/file/nagad.svg" alt="Nagad"></span><div><b>Nagad</b><small>Personal · +8801601093553</small></div></label>
          <label class="payment"><input type="radio" name="payment" value="Bank Transfer"><span class="payment-icon">🏦</span><div><b>Bank Transfer</b><small>City Bank · MD ARMAN · A/C 2805166963001</small></div></label>
        </div>
        <div class="delivery-note-card"><b>🚚 Delivery</b><span>Chattogram District: ${money(60)} · Other Districts: ${money(120)}</span><span class="free-delivery-progress" id="freeDeliveryMessage">Free delivery eligibility is checked automatically.</span></div>
        <div class="summary checkout-summary"><div><span>Subtotal</span><b>${money(total)}</b></div><div><span>Delivery</span><b id="deliveryAmount">Calculated after address</b></div><hr><div class="grand"><span>Total</span><b id="checkoutGrandTotal">${money(total)}</b></div><button id="placeOrderBtn" class="btn primary full order-submit" type="button" disabled onclick="placeOrder()">Place Order</button><small class="legal">All required fields must be completed correctly. By placing your order, you agree to our Terms & Conditions and Privacy Policy.</small></div>
      </section></main>${footer()}`;
  }

  function confirmationPage() {
    const subtotal = Number(window.demoSubtotal || 0);
    const shipping = Number(window.demoShipping || 0);
    const total = Number(window.demoTotal || 0);
    return `${header()}<main class="page narrow"><div class="success-card"><div class="success-icon">✓</div><span class="eyebrow">THANK YOU</span><h1>Order Confirmed!</h1><p>Your order has been received. We’ll contact you shortly to confirm delivery details.</p><b>Order ID: <span id="demoOrderId">${escapeHtml(window.demoOrderId || "—")}</span></b><div class="confirmation-breakdown"><span>Subtotal <b>${money(subtotal)}</b></span><span>Delivery <b>${shipping ? money(shipping) : "FREE"}</b></span><strong>Total <b>${money(total)}</b></strong></div><a class="btn primary full" href="#track">Track Your Order</a><a class="btn outline full" href="#home">Back to Home</a></div></main>${footer()}`;
  }

  function trackPage() {
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">ORDER TRACKING</span><h1>Track your order.</h1><p>Enter your Order ID and phone number to view your latest status.</p></section>
      <div class="form-card"><label>Order ID<input placeholder="e.g. FG-10258"></label><label>Phone Number<div class="phone-field"><span>+88</span><input inputmode="numeric" maxlength="11" placeholder="01XXXXXXXXX"></div></label><button class="btn primary full" onclick="showDemoTracking()">Track Order</button></div>
      <div id="tracking-result"></div></main>${footer()}`;
  }

  function searchPage() {
    return `${header()}<main class="page"><section class="page-head"><span class="eyebrow">SEARCH</span><h1>What are you looking for?</h1></section><div class="searchbar"><input autofocus placeholder="Search products..." oninput="setSearch(this.value); render()" value="${escapeHtml(currentSearch)}"><button>⌕</button></div><div class="product-grid">${products.filter(p => !currentSearch || `${p.name} ${p.brand} ${p.category} ${p.subcategory || ""} ${p.sku || ""}`.toLowerCase().includes(currentSearch.toLowerCase())).map(productCard).join("")}</div></main>${footer()}`;
  }

  function accountPage() {
    return `${header()}<main class="page narrow"><section class="account-card"><div class="avatar">👤</div><div><h1>My Account</h1><p class="muted">Guest account — create an account later to save addresses and order history.</p></div></section><div class="menu-list"><a href="#track">📦 <b>Track Order</b><span>→</span></a><a href="#shop">🕘 <b>Recently Viewed</b><span>→</span></a><a href="#support">💬 <b>Support</b><span>→</span></a><a href="#faq">❓ <b>FAQ</b><span>→</span></a></div></main>${footer()}`;
  }

  function supportPage() {
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">SUPPORT</span><h1>Need Help?</h1><p>We’re here every day from 11 AM – 9 PM.</p></section><div class="support-list"><a href="https://wa.me/8801891656945" target="_blank" rel="noopener"><span>🟢</span><div><b>WhatsApp</b><small>01891656945</small></div><strong>→</strong></a><a href="tel:+8801601093553"><span>📞</span><div><b>Call Us</b><small>+8801601093553</small></div><strong>→</strong></a><a href="mailto:flashgearbd@gmail.com"><span>✉️</span><div><b>Email</b><small>flashgearbd@gmail.com</small></div><strong>→</strong></a></div><div class="help-banner">📍 <b>Visit Flash Gear BD</b><span>Meridian Kohinoor City Level 5, 537 No. Shop · 11 AM – 9 PM</span></div></main>${footer()}`;
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
          <div><b>Categories</b><a href="#shop?category=Gadget%20%26%20Accessories">Gadget & Accessories</a><a href="#shop?category=Charger">Charger & Adapter</a><a href="#shop?category=Cable%20%26%20Adapter">Cable & Adapter</a><a href="#shop?category=Earbuds">Earbuds</a><a href="#shop?category=Headphones">Headphones</a></div>
          <div><b>Customer Service</b><a href="#support">Support</a><a href="#faq">FAQ</a><a href="tel:+8801601093553">+8801601093553</a><a href="mailto:flashgearbd@gmail.com">flashgearbd@gmail.com</a></div>
          <div><b>Visit Us</b><span>Meridian Kohinoor City Level 5, 537 No. Shop</span><span>11 AM – 9 PM</span><span>Chattogram, Bangladesh</span></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} Flash Gear BD. All rights reserved.</span><span>Cash on Delivery · bKash · Nagad · Bank Transfer</span></div>
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
    const existing = cart.find(x => x.cartKey === key);
    if (existing) existing.qty += amount;
    else cart.push({...p, price: Number(v.price || 0), oldPrice: Number(v.oldPrice || 0), stock: v.stock, image: normalizeImageUrl(v.image || p.image), variant: v.variant || p.variant, sku: v.sku || p.sku || "", variantId: v.variantId || v.sku || p.variantId || "", cartKey: key, qty: amount});
    saveCart();
    toast("Added to cart ✓");
  }

  function getTempQty() { return Math.max(1, Number(tempQty || 1)); }
  function buyNow(id, sku = "", qty = 1) { addToCart(id, sku, qty); location.hash = "#checkout"; }
  function changeCart(id, delta) {
    const item = cart.find(x => (x.cartKey || x.id) === id); if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(x => (x.cartKey || x.id) !== id);
    saveCart(); render();
  }
  function removeCart(id) { cart = cart.filter(x => (x.cartKey || x.id) !== id); saveCart(); render(); }

  function setSearch(v) { currentSearch = String(v || ""); }

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
    location.hash = `#product/${encodeURIComponent(p.id)}`;
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
    if (id === "phone") return phoneIsValid();
    return String(el.value || "").trim().length > 0;
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

  function validateCheckout() {
    const btn = document.getElementById("placeOrderBtn");
    if (!btn) return false;
    const valid = requiredCheckoutFields.every(getCheckoutFieldValid);
    btn.disabled = !valid;
    btn.classList.toggle("is-disabled", !valid);
    const message = document.getElementById("freeDeliveryMessage");
    if (message) {
      const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
      const itemCount = cart.reduce((count, item) => count + Number(item.qty || 0), 0);
      const eligible = total > 6499 || (itemCount >= 2 && cart.some(item => Number(item.price) >= 1500));
      message.textContent = eligible ? "🎉 Congratulations! You unlocked FREE DELIVERY." : `You're ${money(Math.max(0, 6500 - total))} away from FREE DELIVERY! 🎉`;
    }
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
      payment: document.querySelector('input[name="payment"]:checked')?.value || "Cash on Delivery",
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
        cart = []; saveCart();
        location.hash = "#confirmed";
        return;
      }
      if (CFG.allowDemoOrders) {
        window.demoOrderId = "DEMO-" + Date.now().toString().slice(-6);
        window.demoTotal = cart.reduce((s, item) => s + item.price * item.qty, 0);
        window.demoPhone = "+88" + phone;
        cart = []; saveCart(); location.hash = "#confirmed";
        return;
      }
      throw new Error("Order system is not connected yet. Please try again shortly.");
    } catch (error) {
      toast(error.message || "Unable to place the order. Please try again.");
      if (btn) { btn.disabled = false; btn.classList.remove("is-disabled"); btn.textContent = "Place Order"; }
    }
  }

  async function showDemoTracking() {
    const result = document.getElementById("tracking-result");
    const inputs = document.querySelectorAll('.form-card input');
    const orderId = inputs[0]?.value.trim();
    const phone = inputs[1]?.value.trim();
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


  function stopHomeSliders() {
    if (homeSliderTimer) { clearInterval(homeSliderTimer); homeSliderTimer = null; }
    document.querySelectorAll("[data-home-slider]").forEach(slider => slider.classList.remove("is-dragging"));
  }

  function initHomeSliders() {
    stopHomeSliders();
    const sliders = [...document.querySelectorAll("[data-home-slider]")];
    if (!sliders.length) return;
    sliders.forEach(setupHomeSlider);
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

  function render() {
    const hash = location.hash.replace(/^#/, "") || "home";
    const [path, query] = hash.split("?");
    let html = "";
    if (path === "home") html = homePage();
    else if (path === "shop") {
      const params = new URLSearchParams(query || "");
      if (params.get("category")) currentCategory = params.get("category");
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
    else if (path === "faq") html = faqPage();
    else if (path === "offers") html = shopPage();
    else html = homePage();

    const app = document.getElementById("app");
    app.classList.remove("page-enter");
    app.innerHTML = html;
    const dockRoot = document.getElementById("mobileDockRoot");
    if (dockRoot) dockRoot.innerHTML = bottomNav();
    void app.offsetWidth;
    app.classList.add("page-enter");
    updateCartCount();
    if (path === "home") initHomeSliders();
    else stopHomeSliders();
    if (path === "checkout") validateCheckout();
  }

  window.addToCart = addToCart;
  window.changeQuickQty = changeQuickQty;
  window.quickQtyValueByKey = quickQtyValueByKey;
  window.buyNow = buyNow;
  window.getTempQty = getTempQty;
  window.changeCart = changeCart;
  window.removeCart = removeCart;
  window.setSearch = setSearch;
  window.submitHeaderSearch = submitHeaderSearch;
  window.handleHeaderSearchInput = handleHeaderSearchInput;
  window.hideHeaderSuggestions = hideHeaderSuggestions;
  window.handleImageError = handleImageError;
  window.chooseHeaderSuggestion = chooseHeaderSuggestion;
  window.setCategory = setCategory;
  window.toggleMenu = toggleMenu;
  window.closeMenu = closeMenu;
  window.changeTempQty = changeTempQty;
  window.placeOrder = placeOrder;
  window.selectVariant = selectVariant;
  window.showDemoTracking = showDemoTracking;
  window.handleCheckoutInput = handleCheckoutInput;
  window.validateCheckout = validateCheckout;
  window.validateCheckoutField = validateCheckoutField;

  window.addEventListener("hashchange", () => { window.scrollTo({top:0, behavior:"auto"}); render(); });
  render();
  loadProductsFromApi();
})();
