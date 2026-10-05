(() => {
  "use strict";

  const CFG = window.FLASH_GEAR_CONFIG || {};
  const logo = "./flash-gear-logo.png";

  let products = [
    {
      id: "FG-001", name: "20W Fast Charger", brand: "Baseus", category: "Charger",
      price: 1200, oldPrice: 1450, badge: "Sale", stock: "In Stock",
      image: "", description: "Compact fast charger for everyday mobile use.",
      variant: "20W"
    },
    {
      id: "FG-002", name: "Type-C Braided Cable", brand: "Baseus", category: "Cable & Adapter",
      price: 500, oldPrice: 650, badge: "Popular", stock: "Low Stock",
      image: "", description: "Durable braided Type-C charging and data cable.",
      variant: "1m"
    },
    {
      id: "FG-003", name: "Premium Phone Case", brand: "Flash Gear", category: "Gadget & Accessories",
      price: 850, oldPrice: 999, badge: "New", stock: "In Stock",
      image: "", description: "Slim protective case with a clean premium finish.",
      variant: "iPhone 15"
    },
    {
      id: "FG-004", name: "10,000mAh Power Bank", brand: "Anker", category: "Powerbank",
      price: 2600, oldPrice: 2900, badge: "", stock: "In Stock",
      image: "", description: "Portable power for your daily travel and work.",
      variant: "10,000mAh"
    },
    {
      id: "FG-005", name: "Wireless Earbuds", brand: "Xiaomi", category: "Earbuds",
      price: 2200, oldPrice: 2500, badge: "New", stock: "Low Stock",
      image: "", description: "Comfortable wireless earbuds for calls and music.",
      variant: "White"
    },
    {
      id: "FG-006", name: "Smart Watch", brand: "Xiaomi", category: "Smart watch",
      price: 3900, oldPrice: 4300, badge: "Popular", stock: "Out of Stock",
      image: "", description: "Everyday smart watch with fitness and notification features.",
      variant: "Black"
    }
  ];

  const categories = [
    ["Mobile", "📱", true], ["Feature Phone", "☎️", true],
    ["Gadget & Accessories", "🎧", false], ["Charger", "🔌", false],
    ["Cable & Adapter", "🔗", false], ["Powerbank", "🔋", false],
    ["Earbuds", "🎧", false], ["Neckband", "🎶", false],
    ["Headphones", "🎧", false], ["Microphone", "🎙️", false],
    ["Speaker", "🔊", false], ["Smart watch", "⌚", false]
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
    ["Charger", "🔌"], ["Cable & Adapter", "🔗"], ["Powerbank", "🔋"],
    ["Earbuds", "🎧"], ["Neckband", "🎶"], ["Headphones", "🎧"],
    ["Microphone", "🎙️"], ["Speaker", "🔊"], ["Smart watch", "⌚"]
  ];

  let cart = JSON.parse(localStorage.getItem("fgbd_cart") || "[]");
  let backendOnline = false;
  let liveProductsLoaded = false;
  const selectedVariants = {};

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
    url=String(url||'');
    const m=url.match(/drive\.google\.com\/(?:uc\?export=view&id=|file\/d\/)([A-Za-z0-9_-]+)/);
    return m ? 'https://drive.google.com/thumbnail?id='+encodeURIComponent(m[1])+'&sz=w1600' : url;
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
    if (p.image) return `<img src="${escapeHtml(normalizeImageUrl(p.image))}" loading="lazy" decoding="async" alt="${escapeHtml(p.name)}" onerror="this.style.display='none'">`;
    return `<div class="product-placeholder ${large ? "large" : ""}">
      <span>⚡</span><small>${escapeHtml(p.category)}</small>
    </div>`;
  }

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[c]));
  }

  function header() {
    return `
      <header class="topbar">
        <div class="topbar-inner">
          <button class="icon-btn mobile-menu" onclick="toggleMenu()" aria-label="Menu">☰</button>
          <a class="brand" href="#home">
            <img src="${logo}" alt="Flash Gear BD">
            <span><b>FLASH GEAR BD</b><small>Mobile & Accessories</small></span>
          </a>
          <nav id="main-menu">
            <a href="#home">Home</a>
            <a href="#shop">Shop</a>
            <a href="#offers">Offers</a>
            <a href="#track">Track Order</a>
            <a href="#support">Support</a>
          </nav>
          <div class="header-search">
            <form class="header-search-form" onsubmit="submitHeaderSearch(event)">
              <span class="header-search-icon" aria-hidden="true">⌕</span>
              <input id="headerSearch" value="${escapeHtml(currentSearch)}" autocomplete="off" placeholder="Search products..." aria-label="Search products">
              <button class="header-search-submit" type="submit" aria-label="Search">⌕</button>
            </form>
          </div>
          <div class="header-actions">
            <button class="cart-btn" onclick="location.hash='#cart'" aria-label="Cart">🛒<span data-cart-count>0</span></button>
          </div>
        </div>
      </header>`;
  }

  function bottomNav() {
    return `
      <nav class="bottom-nav">
        <a href="#home">⌂<small>Home</small></a>
        <a href="#shop">▦<small>Categories</small></a>
        <a href="#cart">🛒<small>Cart</small><b data-cart-count>0</b></a>
        <a href="#account">◉<small>Account</small></a>
      </nav>`;
  }

  function productCard(p) {
    const disabled = p.stock === "Out of Stock" ? "disabled" : "";
    return `
      <article class="product-card">
        <a href="#product/${p.id}" class="product-media">${productImage(p)}</a>
        ${p.badge ? `<span class="badge">${escapeHtml(p.badge)}</span>` : ""}
        <div class="product-body">
          <small class="muted">${escapeHtml(p.brand)} · ${escapeHtml(p.category)}</small>
          <a href="#product/${p.id}" class="product-name">${escapeHtml(p.name)}</a>
          <span class="${stockClass(p.stock)}">${escapeHtml(p.stock)}</span>
          <div class="price-row">
            <strong>${money(p.price)}</strong>
            ${p.oldPrice ? `<del>${money(p.oldPrice)}</del>` : ""}
          </div>
          <button class="quick-add" ${disabled} onclick="addToCart('${p.id}', '${escapeHtml(p.sku || "")}')">${disabled ? "Out of Stock" : "+ Add to Cart"}</button>
        </div>
      </article>`;
  }

  function homePage() {
    const featured = products.slice(0, 4);
    return `
      ${header()}
      <main>
        <section class="hero">
          <div class="hero-copy">
            <span class="eyebrow">TRUSTED MOBILE & ACCESSORIES STORE</span>
            <h1>Premium Tech.<br><span>Better Together.</span></h1>
            <p>Smartphones are coming soon. Until then, explore our latest gadgets & accessories with easy checkout and simple service.</p>
            <div class="hero-actions">
              <a class="btn primary" href="#shop">Shop Now</a>
              <a class="btn ghost" href="#track">Track Order</a>
            </div>
          </div>
          <div class="hero-art" aria-hidden="true"></div>
          <div class="hero-blend" aria-hidden="true"></div>
        </section>

        <section class="trust-strip">
          <div><b>🛡️</b><span>Authentic Products</span></div>
          <div><b>🚚</b><span>Fast Delivery</span></div>
          <div><b>🔒</b><span>Secure Checkout</span></div>
          <div><b>↻</b><span>Easy Return</span></div>
        </section>

        <section class="section">
          <div class="section-head"><div><span class="eyebrow">EXPLORE</span><h2>Shop by Category</h2></div><a href="#shop">View All →</a></div>
          <div class="category-grid">${categories.map(([name, icon, coming]) =>
            coming
              ? `<a class="category-card coming" href="#shop?category=${encodeURIComponent(name)}"><span>${icon}</span><b>${name}</b><small>Coming Later</small></a>`
              : `<a class="category-card" href="#shop?category=${encodeURIComponent(name)}"><span>${icon}</span><b>${name}</b></a>`
          ).join("")}</div>
        </section>

        <section class="section soft">
          <div class="section-head"><div><span class="eyebrow">CURATED FOR YOU</span><h2>Featured Products</h2></div><a href="#shop">View All →</a></div>
          <div class="product-grid">${featured.map(productCard).join("")}</div>
        </section>

        <section class="promo">
          <div><span class="eyebrow">FLASH GEAR PROMISE</span><h2>Simple shopping.<br>Clear information.</h2><p>See product availability as In Stock, Low Stock or Out of Stock. No confusing quantity displays.</p></div>
          <a class="btn light" href="#shop">Explore Products</a>
        </section>

        <section class="section">
          <div class="section-head"><div><span class="eyebrow">NEED HELP?</span><h2>We’re here for you</h2></div><a href="#support">Contact Support →</a></div>
          <div class="support-cards">
            <a href="#support">💬 <b>WhatsApp</b><span>Chat with us</span></a>
            <a href="#support">☎️ <b>Call Us</b><span>Get quick help</span></a>
            <a href="#faq">❓ <b>FAQ</b><span>Find answers</span></a>
          </div>
        </section>
      </main>
      ${footer()}${bottomNav()}`;
  }

  function shopPage() {
    const isComingSoon = currentCategory === "Mobile" || currentCategory === "Feature Phone";
    const showGadgetSubcategories = currentCategory === "Gadget & Accessories";
    const filtered = products.filter(p => {
      const matchesSearch = !currentSearch || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(currentSearch.toLowerCase());
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
          ${categories.map(([name,,coming]) => `<button class="${currentCategory===name?"active":""}" onclick="setCategory('${name.replace(/'/g,"\'")}')">${name}${coming ? " · Coming Later" : ""}</button>`).join("")}
        </div>
        ${showGadgetSubcategories ? `<div class="subcategory-panel"><b>Gadget & Accessories</b><span>Choose a category</span><div class="chips subchips">${gadgetSubcategories.map(([name,icon])=>`<button onclick="setCategory('${name.replace(/'/g,"\'")}')">${icon} ${name}</button>`).join("")}</div></div>` : ""}
        ${isComingSoon ? `<div class="coming-soon-card"><div class="coming-soon-icon">⚡</div><span class="eyebrow">COMING LATER</span><h2>We’re currently working on our ${currentCategory.toLowerCase()} inventory.</h2><p>Until then, explore our latest gadgets & accessories.</p><a class="btn primary" href="#shop?category=Gadget%20%26%20Accessories">Explore Gadgets & Accessories</a></div>` : `
        <div class="shop-layout">
          <aside class="filter-panel">
            <b>Filter</b><label>Brand</label><select><option>All Brands</option><option>Apple</option><option>Samsung</option><option>Xiaomi</option><option>Baseus</option><option>Anker</option></select>
            <label>Availability</label><label class="check"><input type="checkbox"> In Stock</label><label class="check"><input type="checkbox"> Low Stock</label>
          </aside>
          <section><div class="results-head"><span>${filtered.length} products</span><select><option>Recommended</option><option>Price: Low to High</option><option>Price: High to Low</option><option>Newest</option></select></div><div class="product-grid">${filtered.length ? filtered.map(productCard).join("") : `<div class="empty">No products found.</div>`}</div></section>
        </div>`}
      </main>${footer()}${bottomNav()}`;
  }

  function productPage(id) {
    const p = products.find(x => x.id === id) || products[0];
    if (!p) return `${header()}<main class="page"><div class="empty">Product not found.</div></main>${footer()}${bottomNav()}`;
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [{ sku: p.sku || "", variantId: p.variantId || p.sku || "", variant: p.variant || "", price: p.price, oldPrice: p.oldPrice, stock: p.stock, image: p.image, images: p.images || [] }];
    const selectedSku = selectedVariants[p.id] || variants[0].sku;
    const selected = variants.find(v => v.sku === selectedSku) || variants[0];
    const display = {...p, price: Number(selected.price || 0), oldPrice: Number(selected.oldPrice || 0), stock: selected.stock, image: normalizeImageUrl(selected.image || p.image), sku: selected.sku, variant: selected.variant, variantId: selected.variantId};
    return `
      ${header()}
      <main class="page">
        <a class="back" href="#shop">← Back to Shop</a>
        <div class="product-detail">
          <div class="detail-media">${productImage(display, true)}</div>
          <div class="detail-info">
            <span class="eyebrow">${escapeHtml(display.category)}</span>
            <h1>${escapeHtml(display.name)}</h1>
            <p class="muted">${escapeHtml(display.brand)} · SKU ${escapeHtml(display.sku || display.id)}</p>
            <div class="detail-price"><strong>${money(display.price)}</strong>${display.oldPrice?`<del>${money(display.oldPrice)}</del>`:""}</div>
            <span class="${stockClass(display.stock)}">${escapeHtml(display.stock)}</span>
            <p>${escapeHtml(display.description)}</p>
            <div class="variant"><b>Variant</b><div class="chips variant-chips">${variants.map(v => `<button class="${v.sku===selectedSku?"active":""}" onclick="selectVariant('${escapeHtml(p.id)}','${escapeHtml(v.sku)}')">${escapeHtml(v.variant || v.sku || "Standard")}</button>`).join("")}</div></div>
            <div class="buy-row"><div class="qty"><button onclick="changeTempQty(-1)">−</button><span id="tempQty">1</span><button onclick="changeTempQty(1)">+</button></div><button class="btn primary grow" ${display.stock==="Out of Stock"?"disabled":""} onclick="addToCart('${escapeHtml(display.id)}','${escapeHtml(display.sku || "")}')">Add to Cart</button></div>
            <button class="btn outline full" ${display.stock==="Out of Stock"?"disabled":""} onclick="buyNow('${escapeHtml(display.id)}','${escapeHtml(display.sku || "")}')">Buy Now</button>
            <div class="mini-trust"><span>🛡️ Authentic</span><span>🚚 Fast Delivery</span><span>↻ Easy Return</span></div>
          </div>
        </div>
        <section class="section"><div class="section-head"><div><span class="eyebrow">COMPLETE YOUR SETUP</span><h2>Frequently Bought Together</h2></div></div><div class="product-grid">${products.filter(x=>x.id!==p.id).slice(0,3).map(productCard).join("")}</div></section>
      </main>${footer()}${bottomNav()}`;
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
      </main>${footer()}${bottomNav()}`;
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
          ${["Cash on Delivery","bKash","Nagad","Upay","Bank Transfer"].map((x,i)=>`<label class="payment"><input type="radio" name="payment" value="${x}" ${i===0?"checked":""}><span>${["💵","🩷","🟠","🔵","🏦"][i]}</span><b>${x}</b><small>${i===0?"Pay when you receive the product":`Pay securely using ${x}`}</small></label>`).join("")}
        </div>
        <div class="delivery-note-card"><b>🚚 Delivery</b><span>Chattogram District: ${money(60)} · Other Districts: ${money(120)}</span><span class="free-delivery-progress" id="freeDeliveryMessage">Free delivery eligibility is checked automatically.</span></div>
        <div class="summary checkout-summary"><div><span>Subtotal</span><b>${money(total)}</b></div><div><span>Delivery</span><b id="deliveryAmount">Calculated after address</b></div><hr><div class="grand"><span>Total</span><b id="checkoutGrandTotal">${money(total)}</b></div><button id="placeOrderBtn" class="btn primary full order-submit" type="button" disabled onclick="placeOrder()">Place Order</button><small class="legal">All required fields must be completed correctly. By placing your order, you agree to our Terms & Conditions and Privacy Policy.</small></div>
      </section></main>${footer()}${bottomNav()}`;
  }

  function confirmationPage() {
    return `${header()}<main class="page narrow"><div class="success-card"><div class="success-icon">✓</div><span class="eyebrow">THANK YOU</span><h1>Order Confirmed!</h1><p>Your order has been received. We’ll contact you shortly to confirm delivery details.</p><b>Order ID: <span id="demoOrderId">${escapeHtml(window.demoOrderId || "—")}</span></b><strong class="confirm-total">${money(window.demoTotal||0)}</strong><a class="btn primary full" href="#track">Track Your Order</a><a class="btn outline full" href="#home">Back to Home</a></div></main>${footer()}${bottomNav()}`;
  }

  function trackPage() {
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">ORDER TRACKING</span><h1>Track your order.</h1><p>Enter your Order ID and phone number to view your latest status.</p></section>
      <div class="form-card"><label>Order ID<input placeholder="e.g. FG-10258"></label><label>Phone Number<div class="phone-field"><span>+88</span><input inputmode="numeric" maxlength="11" placeholder="01XXXXXXXXX"></div></label><button class="btn primary full" onclick="showDemoTracking()">Track Order</button></div>
      <div id="tracking-result"></div></main>${footer()}${bottomNav()}`;
  }

  function searchPage() {
    return `${header()}<main class="page"><section class="page-head"><span class="eyebrow">SEARCH</span><h1>What are you looking for?</h1></section><div class="searchbar"><input autofocus placeholder="Search products..." oninput="setSearch(this.value); render()" value="${escapeHtml(currentSearch)}"><button>⌕</button></div><div class="product-grid">${products.filter(p => !currentSearch || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(currentSearch.toLowerCase())).map(productCard).join("")}</div></main>${footer()}${bottomNav()}`;
  }

  function accountPage() {
    return `${header()}<main class="page narrow"><section class="account-card"><div class="avatar">👤</div><div><h1>My Account</h1><p class="muted">Guest account — create an account later to save addresses and order history.</p></div></section><div class="menu-list"><a href="#track">📦 <b>Track Order</b><span>→</span></a><a href="#shop">🕘 <b>Recently Viewed</b><span>→</span></a><a href="#support">💬 <b>Support</b><span>→</span></a><a href="#faq">❓ <b>FAQ</b><span>→</span></a></div></main>${footer()}${bottomNav()}`;
  }

  function supportPage() {
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">SUPPORT</span><h1>Need Help?</h1><p>We’re here every day from 11 AM – 9 PM.</p></section><div class="support-list"><a href="https://wa.me/8801891656945" target="_blank" rel="noopener"><span>🟢</span><div><b>WhatsApp</b><small>01891656945</small></div><strong>→</strong></a><a href="tel:+8801601093553"><span>📞</span><div><b>Call Us</b><small>+8801601093553</small></div><strong>→</strong></a><a href="mailto:flashgearbd@gmail.com"><span>✉️</span><div><b>Email</b><small>flashgearbd@gmail.com</small></div><strong>→</strong></a></div><div class="help-banner">📍 <b>Visit Flash Gear BD</b><span>Meridian Kohinoor City Level 5, 537 No. Shop · 11 AM – 9 PM</span></div></main>${footer()}${bottomNav()}`;
  }

  function faqPage() {
    const qs = [
      ["How do I place an order?", "Choose a product, add it to your cart, enter delivery information and select your preferred payment method."],
      ["Do you offer Cash on Delivery?", "Yes. Cash on Delivery is one of the available payment methods."],
      ["How can I track my order?", "Use the Track Order page with your Order ID and phone number."],
      ["Will the website show exact stock quantity?", "No. Customers only see In Stock, Low Stock or Out of Stock."],
      ["How do I get support?", "Contact Flash Gear BD through the support options provided on the website."]
    ];
    return `${header()}<main class="page narrow"><section class="page-head"><span class="eyebrow">FAQ</span><h1>Frequently Asked Questions</h1></section><div class="faq">${qs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></main>${footer()}${bottomNav()}`;
  }

  function footer() {
    return `<footer><div class="footer-brand"><img src="${logo}" alt="Flash Gear BD"><div><b>FLASH GEAR BD</b><span>Mobile & Accessories Store</span></div></div><div class="footer-grid"><div><b>Shop</b><a href="#shop">All Products</a><a href="#offers">Offers</a><a href="#track">Track Order</a></div><div><b>Help</b><a href="#support">Support</a><a href="#faq">FAQ</a><a href="tel:+8801601093553">+8801601093553</a></div><div><b>Visit</b><span>Meridian Kohinoor City Level 5, 537 No. Shop</span><span>11 AM – 9 PM</span><span>Chattogram, Bangladesh</span></div></div><div class="footer-payment"><b>Payment:</b> Cash on Delivery · bKash · Nagad · Upay · Bank Transfer</div><small>© ${new Date().getFullYear()} Flash Gear BD. All rights reserved.</small></footer>`;
  }

  function addToCart(id, sku = "") {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [{ sku: p.sku || "", variantId: p.variantId || p.sku || "", variant: p.variant || "", price: p.price, oldPrice: p.oldPrice, stock: p.stock, image: p.image, images: p.images || [] }];
    const v = variants.find(x => x.sku === sku) || variants[0];
    if (!v || v.stock === "Out of Stock") return;
    const key = `${id}::${v.sku || "default"}`;
    const existing = cart.find(x => x.cartKey === key);
    if (existing) existing.qty += 1;
    else cart.push({...p, price: Number(v.price || 0), oldPrice: Number(v.oldPrice || 0), stock: v.stock, image: normalizeImageUrl(v.image || p.image), variant: v.variant || p.variant, sku: v.sku || p.sku || "", variantId: v.variantId || v.sku || p.variantId || "", cartKey: key, qty: 1});
    saveCart();
    toast("Added to cart ✓");
  }

  function buyNow(id, sku = "") { addToCart(id, sku); location.hash = "#checkout"; }
  function changeCart(id, delta) {
    const item = cart.find(x => (x.cartKey || x.id) === id); if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(x => (x.cartKey || x.id) !== id);
    saveCart(); render();
  }
  function removeCart(id) { cart = cart.filter(x => (x.cartKey || x.id) !== id); saveCart(); render(); }

  function setSearch(v) { currentSearch = v; }

  function submitHeaderSearch(event) {
    event.preventDefault();
    const input = document.getElementById("headerSearch");
    currentSearch = (input?.value || "").trim();
    location.hash = "#search";
  }
  function setCategory(v) { currentCategory = v; render(); }
  function toggleMenu() { document.getElementById("main-menu")?.classList.toggle("open"); }

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
        window.demoOrderId = data.orderId;
        window.demoTotal = Number(data.total || 0);
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
    void app.offsetWidth;
    app.classList.add("page-enter");
    updateCartCount();
    if (path === "checkout") validateCheckout();
    window.scrollTo({top:0, behavior:"auto"});
  }

  window.addToCart = addToCart;
  window.buyNow = buyNow;
  window.changeCart = changeCart;
  window.removeCart = removeCart;
  window.setSearch = setSearch;
  window.submitHeaderSearch = submitHeaderSearch;
  window.setCategory = setCategory;
  window.toggleMenu = toggleMenu;
  window.changeTempQty = changeTempQty;
  window.placeOrder = placeOrder;
  window.selectVariant = selectVariant;
  window.showDemoTracking = showDemoTracking;
  window.handleCheckoutInput = handleCheckoutInput;
  window.validateCheckout = validateCheckout;
  window.validateCheckoutField = validateCheckoutField;

  window.addEventListener("hashchange", render);
  render();
  loadProductsFromApi();
})();
