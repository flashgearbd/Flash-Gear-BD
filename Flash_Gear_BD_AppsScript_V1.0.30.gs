/** FLASH GEAR BD — Apps Script API — FGBD V1.0.30 + Admin Panel Backend */
const CFG={
  VERSION:'1.0.30', SHEET_ID:'13tC0gl5w0m8jjMd7N38ZVN_MdCh_2D09nTAP5FMhQLc',
  PHONE:/^01\d{9}$/, INSIDE:60, OUTSIDE:120, FREE:6499, FREE_ITEMS:2, FREE_ITEM_PRICE:1500, REORDER:10,
  SHEETS:{P:'Products',O:'Orders',C:'Customers',I:'Inventory',PU:'Purchases',E:'Expenses',S:'Settings',L:'API_Log',OL:'Order_Log'}
};
const ORDER_LOG_HEADERS=['Timestamp','Order ID','Status','Note','Admin','Action'];
const H={
 Products:['Product ID','Product Name','Category','Subcategory','Brand','SKU','Variant ID','Variant','Cost Price','Selling Price','Old Price','Stock','Reserved','Available Stock','Reorder Level','Supplier','Image 1 URL','Image 2 URL','Image 3 URL','Image 4 URL','Short Description','Description','Featured','New Arrival','Deal','Offer Price','Website Status','Updated At'],
 Orders:['Order ID','Date','Customer ID','Customer Name','Phone','Email','Product ID','Product Name','SKU','Variant ID','Variant','Qty','Unit Price','Cost Price','Discount','Shipping','Total','Payment','Payment Status','Status','Courier','Tracking ID','Division','District','Area / Thana','Full Delivery Address','Delivery Note','Delivery Zone','Free Delivery','Source','Idempotency Key','Stock Restored','Created At','Updated At'],
 Customers:['Customer ID','Customer Name','Phone','Email','Total Orders','Total Spent','Last Order','Customer Type','Division','District','Address','Notes','Created At','Updated At'],
 Inventory:['Product ID','Product Name','SKU','Variant ID','Opening Stock','Stock In','Units Sold','Reserved','Available Stock','Reorder Level','Stock Status','Last Updated'],
 Purchases:['Purchase ID','Date','Supplier','Product ID','Product Name','SKU','Variant ID','Qty Received','Cost/Unit','Total Cost','Invoice','Notes'],
 Expenses:['Expense ID','Date','Category','Description','Amount','Payment Method','Notes'],
 Settings:['Setting','Value'], API_Log:['Timestamp','Action','Success','Message','Order ID','Source']
};

function doGet(e){
  try{
    const q=e?.parameter||{}, a=String(q.action||'health');
    if(a==='health')return out({ok:true,version:CFG.VERSION,shop:'Flash Gear BD'});
    return out({ok:false,error:'GET is disabled for API actions. Use the authenticated POST gateway.'});
  }catch(err){return out({ok:false,error:err.message});}
}

function doPost(e){
  let b={};
  try{
    const raw=String(e?.postData?.contents||'{}');
    try{b=JSON.parse(raw||'{}');}catch(parseErr){throw Error('Invalid JSON request body.');}
    auth_(b.apiKey);
    switch(String(b.action||'')){
      case 'createOrder':return out(createOrder_(b));
      case 'products':return out(products_(Object.assign({},b,{status:'Published'})));
      case 'product':return out(product_(b.productId,b.sku));
      case 'trackOrder':return out(track_(b.orderId,b.phone));
      case 'settings':return out(settings_());
      case 'adminLogin':return out(adminLogin_(b));
      case 'adminData':return out(adminAuthAndData_(b.sessionToken));
      case 'adminOrders':return out(adminOrders_(b.sessionToken));
      case 'adminProducts':return out(adminProducts_(b.sessionToken));
      case 'adminActivity':return out(adminActivity_(b.sessionToken));
      case 'adminLogout':return out(adminLogout_(b));
      case 'adminChangePassword':return out(adminChangePassword_(b));
      case 'adminProductSave':return out(adminProductSave_(b));
      case 'adminProductDelete':return out(adminProductDelete_(b));
      case 'adminOrderStatus':return out(adminOrderStatus_(b));
      case 'adminCourier':return out(adminCourier_(b));
      case 'adminStock':return out(adminStock_(b));
      case 'adminCategorySave':return out(adminCategorySave_(b));
      case 'adminCategoryDelete':return out(adminCategoryDelete_(b));
      case 'adminSettingsSave':return out(adminSettingsSave_(b));
      case 'adminImageUpload':return out(adminImageUpload_(b));
      case 'adminImageBatchUpload':return out(adminImageBatchUpload_(b));
      default:return out({ok:false,error:'Unknown action'});
    }
  }catch(err){log_('POST',false,err.message,b.orderId||'','');return out({ok:false,error:err.message});}
}

function setupStore(){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID);
  Object.keys(H).forEach(k=>headers_(ss,k,H[k]));
  headers_(ss,CFG.SHEETS.OL,['Timestamp','Order ID','Status','Note','Admin','Action']);
  const adminSetup=ensureAdminPassword_();
  const s=sheet_(ss,CFG.SHEETS.S); const have=objects_(s).map(r=>String(r.Setting||''));
  [['Shop Name','Flash Gear BD'],['Business Type','Mobile & Accessories'],['Currency','BDT (৳)'],['Low Stock Default',CFG.REORDER],['Website Status','Connected'],['Inside Chattogram Delivery',CFG.INSIDE],['Outside Chattogram Delivery',CFG.OUTSIDE],['Free Delivery Threshold',CFG.FREE],['Free Delivery Minimum Item Price',CFG.FREE_ITEM_PRICE],['Free Delivery Minimum Item Count',CFG.FREE_ITEMS],['Shop Phone','+8801601093553'],['WhatsApp','01891656945'],['Email','flashgearbd@gmail.com'],['Address','Meridian Kohinoor City Level 5, 537 No. Shop'],['Business Hours','11 AM - 9 PM']].forEach(x=>{if(!have.includes(x[0]))s.appendRow(x);});
  ensureDefaultCategories_();
  const message=adminSetup.created
    ? 'Flash Gear BD sheets are ready. Initial admin username: admin. Initial admin password: '+adminSetup.password+' — save it and change it after first login.'
    : 'Flash Gear BD sheets are ready. Admin credentials already exist.';
  Logger.log(message);
  return message;
}

function setApiKey(secret){
  secret=String(secret||'').trim(); if(secret.length<24)throw Error('API key must be at least 24 characters.');
  PropertiesService.getScriptProperties().setProperty('FGBD_API_KEY',secret); return 'FGBD_API_KEY saved.';
}

function createOrder_(b){
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try{
    validate_(b); const ss=SpreadsheetApp.openById(CFG.SHEET_ID), ps=sheet_(ss,CFG.SHEETS.P), os=sheet_(ss,CFG.SHEETS.O), cs=sheet_(ss,CFG.SHEETS.C);
    const prior=findKey_(os,b.idempotencyKey); if(prior)return prior;
    const rows=objects_(ps), bySku={}, byId={}; rows.forEach(r=>{if(r.SKU)bySku[String(r.SKU).trim()]=r;if(r['Product ID']&&!byId[r['Product ID']])byId[r['Product ID']]=r;});
    const items=b.items.map(i=>{
      const p=(i.sku&&bySku[String(i.sku).trim()])||byId[String(i.productId||'').trim()]; if(!p)throw Error('Product not found.');
      const qty=Number(i.qty), avail=num_(p['Available Stock'],num_(p.Stock)-num_(p.Reserved)); if(!Number.isInteger(qty)||qty<1||qty>100)throw Error('Invalid quantity.');
      if(avail<qty)throw Error(String(p['Product Name'])+' is not available in the requested quantity.');
      const price=truth_(p.Deal)&&num_(p['Offer Price'])>0?num_(p['Offer Price']):num_(p['Selling Price']); if(price<=0)throw Error('Invalid product price.');
      return {p,qty,price,sku:String(p.SKU||''),pid:String(p['Product ID']||''),vid:String(p['Variant ID']||p.SKU||''),variant:String(p.Variant||'')};
    });
    const subtotal=items.reduce((n,i)=>n+i.qty*i.price,0), count=items.reduce((n,i)=>n+i.qty,0);
    const free = subtotal > CFG.FREE || (count >= CFG.FREE_ITEMS && items.some(i => i.price >= CFG.FREE_ITEM_PRICE));
    const zone = zone_(b.division, b.district);
    const shipping = free ? 0 : (zone === 'Chattogram District' ? CFG.INSIDE : CFG.OUTSIDE);
    const total = subtotal + shipping;
    const now = new Date();
    const orderId=nextOrder_(os,now), customerId=customer_(cs,b,now,total), om=map_(os);
    items.forEach(i=>{const row=new Array(os.getLastColumn()).fill(''); const vals={
      'Order ID':orderId,Date:now,'Customer ID':customerId,'Customer Name':b.name,Phone:b.phone,Email:b.email||'',
      'Product ID':i.pid,'Product Name':i.p['Product Name'],'SKU':i.sku,'Variant ID':i.vid,Variant:i.variant,Qty:i.qty,
      'Unit Price':i.price,'Cost Price':num_(i.p['Cost Price']),Discount:0,Shipping:shipping,Total:total,Payment:b.payment,'Payment Status':'Pending',Status:'Pending',
      Courier:'','Tracking ID':'',Division:b.division,District:b.district,'Full Delivery Address':b.address,
      'Delivery Note':b.note||'','Delivery Zone':zone,'Free Delivery':free?'Yes':'No',Source:'Website','Idempotency Key':b.idempotencyKey,
      'Stock Restored':'No','Created At':now,'Updated At':now}; Object.keys(vals).forEach(k=>{if(om[k])row[om[k]-1]=vals[k];}); os.getRange(os.getLastRow()+1,1,1,row.length).setValues([row]);});
    const pm=map_(ps); items.forEach(i=>{const next=num_(i.p.Stock)-i.qty;if(next<0)throw Error('Stock would become negative.');const reserved=num_(i.p.Reserved);ps.getRange(i.p.__row,pm.Stock).setValue(next);if(pm['Available Stock'])ps.getRange(i.p.__row,pm['Available Stock']).setValue(Math.max(0,next-reserved));if(pm['Updated At'])ps.getRange(i.p.__row,pm['Updated At']).setValue(now);});
    SpreadsheetApp.flush(); log_('createOrder',true,'Order created',orderId,'Website');
    return {ok:true,orderId,customerId,status:'Pending',subtotal,shipping,delivery:shipping,total,freeDelivery:free,deliveryZone:zone};
  }finally{lock.releaseLock();}
}

function products_(q){
  const rows=objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.P)), status='published', query=String(q.q||'').toLowerCase(), cat=String(q.category||'').toLowerCase(), g={};
  rows.filter(p=>String(p['Website Status']||'').toLowerCase()===status).filter(p=>!cat||String(p.Category||'').toLowerCase()===cat||String(p.Subcategory||'').toLowerCase()===cat).filter(p=>{if(!query)return true;return [p['Product Name'],p.Brand,p.Category,p.Subcategory,p.SKU,p.Variant].join(' ').toLowerCase().includes(query);}).forEach(p=>{
    const id=String(p['Product ID']||p.SKU||''); if(!id)return;
    if(!g[id])g[id]={id,name:String(p['Product Name']||''),category:String(p.Category||''),subcategory:String(p.Subcategory||''),brand:String(p.Brand||''),shortDescription:String(p['Short Description']||''),description:String(p.Description||''),featured:truth_(p.Featured),newArrival:truth_(p['New Arrival']),deal:truth_(p.Deal),variants:[]};
    const av=Math.max(0,num_(p.Stock)-num_(p.Reserved)), st=av<=0?'Out of Stock':av<=num_(p['Reorder Level'],CFG.REORDER)?'Low Stock':'In Stock', price=truth_(p.Deal)&&num_(p['Offer Price'])>0?num_(p['Offer Price']):num_(p['Selling Price']);
    g[id].variants.push({sku:String(p.SKU||''),variantId:String(p['Variant ID']||p.SKU||''),variant:String(p.Variant||''),price,oldPrice:num_(p['Old Price']),stock:st,image:String(p['Image 1 URL']||''),images:[p['Image 1 URL'],p['Image 2 URL'],p['Image 3 URL'],p['Image 4 URL']].filter(Boolean).map(String)});
  });
  return {ok:true,products:Object.values(g)};
}
function product_(id,sku){const a=products_({status:'Published'}).products.find(p=>sku?p.variants.some(v=>v.sku===sku):p.id===String(id||''));return a?{ok:true,product:a}:{ok:false,error:'Product not found'};}

function track_(id,phone){
  phone=normPhone(phone);if(!id||!CFG.PHONE.test(phone))throw Error('Valid Order ID and 11-digit phone number are required.');
  const rows=objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.O)).filter(r=>String(r['Order ID']||'')===String(id)&&normPhone(r.Phone)===phone);if(!rows.length)return{ok:false,error:'Order not found.'};
  const r=rows[0],st=String(r.Status||'Pending');return{ok:true,order:{orderId:id,status:st,date:iso_(r.Date||r['Created At']),total:num_(r.Total),payment:String(r.Payment||''),courier:String(r.Courier||''),trackingId:String(r['Tracking ID']||''),items:rows.map(x=>({productId:String(x['Product ID']||''),productName:String(x['Product Name']||''),sku:String(x.SKU||''),variant:String(x.Variant||''),qty:num_(x.Qty),unitPrice:num_(x['Unit Price'])})),timeline:timeline_(st)}};
}

function status_(b){
  const allowed=['Pending','Confirmed','Processing','Shipped','Under Shipment','Delivered','Cancelled','Returned','Refunded'],st=String(b.status||'');if(!b.orderId||!allowed.includes(st))throw Error('Invalid order status.');
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID),os=sheet_(ss,CFG.SHEETS.O),om=map_(os),rows=objects_(os).filter(r=>String(r['Order ID']||'')===String(b.orderId));if(!rows.length)throw Error('Order not found.');
  rows.forEach(r=>{if(om.Status)os.getRange(r.__row,om.Status).setValue(st);if(om['Updated At'])os.getRange(r.__row,om['Updated At']).setValue(new Date());});
  if(['Cancelled','Returned','Refunded'].includes(st)&&!rows.every(r=>String(r['Stock Restored']||'').toLowerCase()==='yes'))restore_(os,rows);
  return{ok:true,orderId:b.orderId,status:st};
}
function courier_(b){if(!b.orderId)throw Error('Order ID is required.');const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=sheet_(ss,CFG.SHEETS.O),m=map_(s),rows=objects_(s).filter(r=>String(r['Order ID']||'')===String(b.orderId));if(!rows.length)throw Error('Order not found.');rows.forEach(r=>{if(m.Courier)s.getRange(r.__row,m.Courier).setValue(String(b.courier||''));if(m['Tracking ID'])s.getRange(r.__row,m['Tracking ID']).setValue(String(b.trackingId||''));if(m['Updated At'])s.getRange(r.__row,m['Updated At']).setValue(new Date());});return{ok:true,orderId:b.orderId};}
function stock_(b){if(!b.sku||!Number.isFinite(Number(b.quantity)))throw Error('SKU and quantity are required.');const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=sheet_(ss,CFG.SHEETS.P),m=map_(s),r=objects_(s).find(x=>String(x.SKU||'')===String(b.sku));if(!r)throw Error('SKU not found.');const next=num_(r.Stock)+Number(b.quantity);if(next<0)throw Error('Stock cannot become negative.');const now=new Date();s.getRange(r.__row,m.Stock).setValue(next);if(m['Available Stock'])s.getRange(r.__row,m['Available Stock']).setValue(Math.max(0,next-num_(r.Reserved)));if(m['Updated At'])s.getRange(r.__row,m['Updated At']).setValue(now);moveProductRowsToTop_(s,[r.__row]);return{ok:true,sku:b.sku,stock:next};}

function restore_(os,rows){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID),ps=sheet_(ss,CFG.SHEETS.P),pm=map_(ps),om=map_(os),prod=objects_(ps),by={};prod.forEach(p=>by[String(p.SKU||'')]=p);
  rows.forEach(r=>{const p=by[String(r.SKU||'')];if(!p)throw Error('Cannot restore stock; SKU not found: '+r.SKU);const next=num_(p.Stock)+num_(r.Qty);ps.getRange(p.__row,pm.Stock).setValue(next);if(pm['Available Stock'])ps.getRange(p.__row,pm['Available Stock']).setValue(Math.max(0,next-num_(p.Reserved)));if(pm['Updated At'])ps.getRange(p.__row,pm['Updated At']).setValue(new Date());});
  rows.forEach(r=>{if(om['Stock Restored'])os.getRange(r.__row,om['Stock Restored']).setValue('Yes');});
}
function findKey_(s,key){if(!key)return null;const r=objects_(s).find(x=>String(x['Idempotency Key']||'')===String(key));if(!r)return null;return{ok:true,duplicate:true,orderId:String(r['Order ID']),customerId:String(r['Customer ID']),status:String(r.Status||'Pending'),subtotal:Math.max(0,num_(r.Total)-num_(r.Shipping)),shipping:num_(r.Shipping),total:num_(r.Total),freeDelivery:String(r['Free Delivery'])==='Yes',deliveryZone:String(r['Delivery Zone']||'')}}

function customer_(s,b,now,total){
  const m=map_(s), phone=normPhone(b.phone), rows=objects_(s), old=rows.find(r=>normPhone(r.Phone)===phone);
  if(!old){const id=nextCustomer_(s),row=new Array(s.getLastColumn()).fill(''),v={'Customer ID':id,'Customer Name':b.name,Phone:phone,Email:b.email||'','Total Orders':1,'Total Spent':total,'Last Order':now,'Customer Type':'New',Division:b.division,District:b.district,Address:b.address,'Created At':now,'Updated At':now};Object.keys(v).forEach(k=>{if(m[k])row[m[k]-1]=v[k];});s.getRange(s.getLastRow()+1,1,1,row.length).setValues([row]);return id;}
  const n=num_(old['Total Orders'])+1;[['Customer Name',b.name],['Email',b.email||old.Email||''],['Total Orders',n],['Total Spent',num_(old['Total Spent'])+total],['Last Order',now],['Customer Type',n>1?'Returning':'New'],['Division',b.division],['District',b.district],['Address',b.address],['Updated At',now]].forEach(x=>{if(m[x[0]])s.getRange(old.__row,m[x[0]]).setValue(x[1]);});return String(old['Customer ID']);
}
function nextCustomer_(s){let n=0;objects_(s).forEach(r=>{const m=/^CUS-(\d+)$/.exec(String(r['Customer ID']||''));if(m)n=Math.max(n,+m[1]);});return'CUS-'+String(n+1).padStart(5,'0');}
function nextOrder_(s,d){const pre='FG-'+Utilities.formatDate(d,Session.getScriptTimeZone()||'Asia/Dhaka','yyyyMMdd')+'-',used=objects_(s).map(r=>String(r['Order ID']||'')).filter(x=>x.startsWith(pre)).map(x=>parseInt(x.slice(pre.length),10)).filter(Number.isFinite),n=used.length?Math.max(...used)+1:1;return pre+String(n).padStart(4,'0');}
function zone_(division,district){return String(district||'').toLowerCase()==='chattogram'?'Chattogram District':'Other District';}
function validate_(b){if(String(b.website||'').trim())throw Error('Order request rejected.');['name','phone','division','district','address','payment'].forEach(k=>{if(!String(b[k]||'').trim())throw Error('Missing required field: '+k);});b.phone=normPhone(b.phone);if(!CFG.PHONE.test(b.phone))throw Error('Phone number must contain exactly 11 digits and start with 01.');if(!Array.isArray(b.items)||!b.items.length)throw Error('Cart is empty.');if(String(b.idempotencyKey||'').length<12)throw Error('Order request token is missing.');if(!['Cash on Delivery','bKash','Nagad','Bank Transfer'].includes(String(b.payment)))throw Error('Invalid payment method.');}
function normPhone(v){let s=String(v||'').replace(/\s+/g,'');if(s.startsWith('+88'))s=s.slice(3);else if(s.startsWith('88')&&s.length===13)s=s.slice(2);return s.replace(/\D/g,'');}
function timeline_(st){const a=['Pending','Confirmed','Processing','Shipped','Delivered'],x=st==='Under Shipment'?'Shipped':st,i=a.indexOf(x);return a.map((s,n)=>({status:s,done:x==='Delivered'||(i>=0&&n<=i)}));}
function settings_(){const o={};objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.S)).forEach(r=>{if(r.Setting)o[String(r.Setting)]=r.Value;});return{ok:true,settings:o};}
function headers_(ss,name,wanted){let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);if(!s.getLastRow())s.getRange(1,1,1,wanted.length).setValues([wanted]);const cur=s.getRange(1,1,1,Math.max(1,s.getLastColumn())).getValues()[0].map(String);wanted.forEach(h=>{if(!cur.includes(h)){s.getRange(1,s.getLastColumn()+1).setValue(h);cur.push(h);}});s.setFrozenRows(1);}
function objects_(s){const v=s.getDataRange().getValues();if(!v.length)return[];const h=v[0].map(x=>String(x||'').trim()),o=[];for(let r=1;r<v.length;r++){if(v[r].every(x=>x===''||x==null))continue;const x={__row:r+1};h.forEach((k,c)=>{if(k)x[k]=v[r][c];});o.push(x);}return o;}
function map_(s){const a=s.getRange(1,1,1,Math.max(1,s.getLastColumn())).getValues()[0],m={};a.forEach((x,i)=>{if(x)m[String(x).trim()]=i+1;});return m;}
function sheet_(ss,name){const s=ss.getSheetByName(name);if(!s)throw Error('Sheet not found: '+name+'. Run setupStore() first.');return s;}
function auth_(key){const expected=String(PropertiesService.getScriptProperties().getProperty('FGBD_API_KEY')||'').trim();const supplied=String(key||'').trim();if(!expected)throw Error('API key is not configured in Apps Script. Run setApiKey(secret) once in the Apps Script editor.');if(!supplied)throw Error('API key was not supplied by the API gateway.');if(supplied!==expected)throw Error('Unauthorized: API key mismatch.');}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
function log_(a,ok,msg,id,src){try{const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName(CFG.SHEETS.L)||ss.insertSheet(CFG.SHEETS.L);if(!s.getLastRow())s.appendRow(H.API_Log);s.appendRow([new Date(),a,ok?'Yes':'No',msg,id||'',src||'']);}catch(_) {}}
function num_(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function truth_(v){return v===true||['true','yes','1'].includes(String(v||'').toLowerCase().trim());}
function iso_(v){if(!v)return'';const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?String(v):d.toISOString();}


/* ============================================================
 * ADMIN AUTHENTICATION + MANAGEMENT
 * ========================================================== */
const ADMIN_USER_KEY='FGBD_ADMIN_USERNAME';
const ADMIN_HASH_KEY='FGBD_ADMIN_PASSWORD_HASH';
const ADMIN_SALT_KEY='FGBD_ADMIN_PASSWORD_SALT';
const ADMIN_SESSION_PREFIX='FGBD_ADMIN_SESSION_';
const ADMIN_SESSION_TTL=21600;
const ADMIN_LOGIN_FAIL_KEY='FGBD_ADMIN_LOGIN_FAILS';
const ADMIN_LOGIN_LOCK_KEY='FGBD_ADMIN_LOGIN_LOCK_UNTIL';
const ADMIN_LOGIN_FAIL_LIMIT=5;
const ADMIN_LOGIN_LOCK_MS=15*60*1000;

function ensureAdminPassword_(){
  const props=PropertiesService.getScriptProperties();
  let user=props.getProperty(ADMIN_USER_KEY);
  let hash=props.getProperty(ADMIN_HASH_KEY);
  let salt=props.getProperty(ADMIN_SALT_KEY);
  if(user&&hash&&salt)return {created:false};
  user='admin';
  const password='FGbd@'+Utilities.getUuid().replace(/-/g,'').slice(0,12);
  salt=Utilities.getUuid().replace(/-/g,'');
  hash=hashPassword_(password,salt);
  props.setProperties({[ADMIN_USER_KEY]:user,[ADMIN_HASH_KEY]:hash,[ADMIN_SALT_KEY]:salt});
  return {created:true,password};
}
function adminLogin_(b){
  const username=String(b.username||'').trim();
  const password=String(b.password||'');
  if(!username||!password)throw Error('Username and password are required.');
  const props=PropertiesService.getScriptProperties();
  const lockUntil=Number(props.getProperty(ADMIN_LOGIN_LOCK_KEY)||0);
  if(lockUntil>Date.now())throw Error('Too many failed attempts. Try again in 15 minutes.');
  let storedUser=props.getProperty(ADMIN_USER_KEY);
  if(!storedUser){
    storedUser='admin';
    props.setProperty(ADMIN_USER_KEY,storedUser);
  }
  const hash=props.getProperty(ADMIN_HASH_KEY), salt=props.getProperty(ADMIN_SALT_KEY);
  if(!hash||!salt)throw Error('Admin password is not configured. In Apps Script, run setupStore() once to create the initial admin password.');
  if(username!==storedUser||hashPassword_(password,salt)!==hash){
    const fails=Number(props.getProperty(ADMIN_LOGIN_FAIL_KEY)||0)+1;
    if(fails>=ADMIN_LOGIN_FAIL_LIMIT){props.setProperties({[ADMIN_LOGIN_FAIL_KEY]:String(fails),[ADMIN_LOGIN_LOCK_KEY]:String(Date.now()+ADMIN_LOGIN_LOCK_MS)});}
    else props.setProperty(ADMIN_LOGIN_FAIL_KEY,String(fails));
    throw Error('Invalid admin username or password.');
  }
  props.deleteProperty(ADMIN_LOGIN_FAIL_KEY);
  props.deleteProperty(ADMIN_LOGIN_LOCK_KEY);
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  CacheService.getScriptCache().put(ADMIN_SESSION_PREFIX+token,storedUser,ADMIN_SESSION_TTL);
  return {ok:true,sessionToken:token,username:storedUser,expiresIn:ADMIN_SESSION_TTL};
}
function adminLogout_(b){
  const token=String(b.sessionToken||'');
  if(token)CacheService.getScriptCache().remove(ADMIN_SESSION_PREFIX+token);
  return {ok:true};
}
function adminChangePassword_(b){
  const user=adminSession_(b.sessionToken);
  const current=String(b.currentPassword||''), next=String(b.newPassword||'');
  if(next.length<10)throw Error('New password must be at least 10 characters.');
  const props=PropertiesService.getScriptProperties(),salt=props.getProperty(ADMIN_SALT_KEY),hash=props.getProperty(ADMIN_HASH_KEY);
  if(!salt||!hash||hashPassword_(current,salt)!==hash)throw Error('Current password is incorrect.');
  const newSalt=Utilities.getUuid().replace(/-/g,'');
  props.setProperties({[ADMIN_HASH_KEY]:hashPassword_(next,newSalt),[ADMIN_SALT_KEY]:newSalt});
  log_('adminChangePassword',true,'Password changed','','Admin:'+user);
  return {ok:true,message:'Password changed successfully.'};
}
function adminSession_(token){
  token=String(token||'').trim();
  if(!token)throw Error('Admin session required.');
  const user=CacheService.getScriptCache().get(ADMIN_SESSION_PREFIX+token);
  if(!user)throw Error('Admin session expired. Please log in again.');
  return user;
}
function hashPassword_(password,salt){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(salt)+'|'+String(password),Utilities.Charset.UTF_8);
  return bytes.map(b=>{const n=b<0?b+256:b;return ('0'+n.toString(16)).slice(-2);}).join('');
}
function adminAuthAndData_(token){const user=adminSession_(token);return Object.assign({ok:true,username:user},adminData_());}
function adminProducts_(token){adminSession_(token);return {ok:true,products:adminProductsData_()};}
function adminOrders_(token){adminSession_(token);return {ok:true,orders:adminOrdersData_()};}
function adminActivity_(token){adminSession_(token);return {ok:true,activity:adminActivityData_()};}

function adminData_(){
  return {dashboard:adminDashboard_(),products:adminProductsData_(),orders:adminOrdersData_(),customers:adminCustomersData_(),categories:adminCategoriesData_(),settings:settings_().settings,activity:adminActivityData_()};
}
function adminDashboard_(){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID);
  const ps=sheet_(ss,CFG.SHEETS.P),os=sheet_(ss,CFG.SHEETS.O),cs=sheet_(ss,CFG.SHEETS.C);
  const pr=objects_(ps),or=objects_(os),cr=objects_(cs);
  const grouped={}; or.forEach(r=>{const id=String(r['Order ID']||'');if(id){if(!grouped[id]) grouped[id]=[]; grouped[id].push(r);}});
  const orders=Object.values(grouped).map(a=>a[0]);
  const valid=orders.filter(r=>!['Cancelled','Returned','Refunded'].includes(String(r.Status||'')));
  const sales=valid.reduce((n,r)=>n+num_(r.Total),0);
  const profit=or.filter(r=>!['Cancelled','Returned','Refunded'].includes(String(r.Status||''))).reduce((n,r)=>n+(num_(r['Unit Price'])-num_(r['Cost Price']))*num_(r.Qty),0);
  const pending=orders.filter(r=>['Pending','Confirmed','Processing'].includes(String(r.Status||''))).length;
  const low=pr.filter(r=>{const av=num_(r['Available Stock'],num_(r.Stock)-num_(r.Reserved));return av>0&&av<=num_(r['Reorder Level'],CFG.REORDER);}).length;
  const out=pr.filter(r=>num_(r['Available Stock'],num_(r.Stock)-num_(r.Reserved))<=0).length;
  return {sales,profit,totalOrders:orders.length,totalCustomers:cr.length,totalProducts:pr.length,activeProducts:pr.filter(r=>['published','draft'].includes(String(r['Website Status']||'').toLowerCase())).length,lowStock:low,outOfStock:out,pendingOrders:pending};
}
function adminProductsData_(){
  const rows=objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.P)), g={};
  rows.forEach(r=>{
    const id=String(r['Product ID']||r.SKU||''); if(!id)return;
    if(!g[id])g[id]={id,name:String(r['Product Name']||''),brand:String(r.Brand||''),category:String(r.Category||''),subcategory:String(r.Subcategory||''),shortDescription:String(r['Short Description']||''),description:String(r.Description||''),featured:truth_(r.Featured),newArrival:truth_(r['New Arrival']),deal:truth_(r.Deal),updatedAt:iso_(r['Updated At']||r['Created At']),variants:[]};
    const av=num_(r['Available Stock'],num_(r.Stock)-num_(r.Reserved));
    g[id].updatedAt=iso_(r['Updated At']||r['Created At'])||g[id].updatedAt;
    g[id].variants.push({sku:String(r.SKU||''),variantId:String(r['Variant ID']||r.SKU||''),variant:String(r.Variant||''),costPrice:num_(r['Cost Price']),sellingPrice:num_(r['Selling Price']),oldPrice:num_(r['Old Price']),stock:num_(r.Stock),reserved:num_(r.Reserved),availableStock:av,reorderLevel:num_(r['Reorder Level'],CFG.REORDER),supplier:String(r.Supplier||''),offerPrice:num_(r['Offer Price']),websiteStatus:String(r['Website Status']||'Published'),images:[r['Image 1 URL'],r['Image 2 URL'],r['Image 3 URL'],r['Image 4 URL']].filter(Boolean).map(String)});
  });
  return Object.values(g).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
}
function adminOrdersData_(){
  const rows=objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.O)),g={};
  rows.forEach(r=>{const id=String(r['Order ID']||'');if(!id)return;if(!g[id])g[id]={orderId:id,date:iso_(r.Date||r['Created At']),updatedAt:iso_(r['Updated At']||r.Date||r['Created At']),customerId:String(r['Customer ID']||''),customerName:String(r['Customer Name']||''),phone:String(r.Phone||''),email:String(r.Email||''),division:String(r.Division||''),district:String(r.District||''),address:String(r['Full Delivery Address']||''),note:String(r['Delivery Note']||''),payment:String(r.Payment||''),paymentStatus:String(r['Payment Status']||''),status:String(r.Status||'Pending'),courier:String(r.Courier||''),trackingId:String(r['Tracking ID']||''),shipping:num_(r.Shipping),total:num_(r.Total),items:[]};g[id].updatedAt=iso_(r['Updated At']||r.Date||r['Created At'])||g[id].updatedAt;g[id].items.push({productId:String(r['Product ID']||''),productName:String(r['Product Name']||''),sku:String(r.SKU||''),variant:String(r.Variant||''),qty:num_(r.Qty),unitPrice:num_(r['Unit Price']),costPrice:num_(r['Cost Price'])});});
  return Object.values(g).sort((a,b)=>new Date(b.updatedAt||b.date)-new Date(a.updatedAt||a.date));
}
function adminCustomersData_(){return objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.C)).map(r=>({id:String(r['Customer ID']||''),name:String(r['Customer Name']||''),phone:String(r.Phone||''),email:String(r.Email||''),totalOrders:num_(r['Total Orders']),totalSpent:num_(r['Total Spent']),lastOrder:iso_(r['Last Order']),type:String(r['Customer Type']||''),division:String(r.Division||''),district:String(r.District||''),address:String(r.Address||'')}));}
function adminCategoriesData_(){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName('Categories');
  if(!s)return [];
  return objects_(s).map(r=>({name:String(r.Category||''),active:truth_(r.Active),sortOrder:num_(r['Sort Order'])})).filter(x=>x.name);
}
function adminActivityData_(){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName(CFG.SHEETS.OL);if(!s)return [];
  return objects_(s).slice(-200).reverse().map(r=>({timestamp:iso_(r.Timestamp),orderId:String(r['Order ID']||''),status:String(r.Status||''),note:String(r.Note||''),admin:String(r.Admin||''),action:String(r.Action||'')}));
}

function adminProductSave_(b){
  const user=adminSession_(b.sessionToken),p=b.product||{};if(!String(p.name||'').trim())throw Error('Product name is required.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const id=String(p.id||'').trim()||nextProductId_(),variants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{}];
    const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=sheet_(ss,CFG.SHEETS.P),m=map_(s),rows=objects_(s),oldRows=rows.filter(r=>String(r['Product ID']||'')===id).sort((a,b)=>a.__row-b.__row);
    const oldByKey={};oldRows.forEach(r=>{oldByKey[String(r.SKU||r['Variant ID']||r.__row)]={row:r,stock:num_(r.Stock),reserved:num_(r.Reserved)};});
    const now=new Date(),category=String(p.category||'Gadget & Accessories'),base=skuPrefix_(category),existing=skuSet_(s);const usedOldRows=new Set(),built=[];
    variants.forEach((v,i)=>{
      let sku=String(v.sku||'').trim();
      const old=oldByKey[sku] || oldRows[i] && oldRows[i].SKU ? oldByKey[String(oldRows[i].SKU)] : null;
      if(!sku) sku=old?String(old.row.SKU||''):nextSku_(base,existing);
      if(existing.has(sku)&&!old)sku=nextSku_(base,existing); existing.add(sku);
      const vid=String(v.variantId||'').trim()||sku;
      const current=old || oldByKey[vid] || null;
      if(current)usedOldRows.add(current.row.__row);
      // Existing stock is authoritative. The product editor cannot overwrite live stock.
      const stock=current?current.stock:Math.max(0,num_(v.stock));
      const reserved=current?current.reserved:Math.max(0,num_(v.reserved));
      const vals={'Product ID':id,'Product Name':p.name,'Category':category,'Subcategory':p.subcategory||'','Brand':p.brand||'','SKU':sku,'Variant ID':vid,'Variant':v.variant||'','Cost Price':num_(v.costPrice),'Selling Price':num_(v.sellingPrice),'Old Price':num_(v.oldPrice),'Stock':stock,'Reserved':reserved,'Available Stock':Math.max(0,stock-reserved),'Reorder Level':num_(v.reorderLevel,CFG.REORDER),'Supplier':v.supplier||'','Image 1 URL':(v.images||[])[0]||'','Image 2 URL':(v.images||[])[1]||'','Image 3 URL':(v.images||[])[2]||'','Image 4 URL':(v.images||[])[3]||'','Short Description':p.shortDescription||'','Description':p.description||'','Featured':p.featured?'TRUE':'FALSE','New Arrival':p.newArrival?'TRUE':'FALSE','Deal':p.deal?'TRUE':'FALSE','Offer Price':num_(v.offerPrice),'Website Status':v.websiteStatus||'Published','Updated At':now};
      if(current){Object.keys(vals).forEach(k=>{if(m[k])s.getRange(current.row.__row,m[k]).setValue(vals[k]);});}
      else built.push(vals);
    });
    // Remove variants explicitly removed from the editor only after all retained rows were validated.
    oldRows.slice().sort((a,b)=>b.__row-a.__row).forEach(r=>{if(!usedOldRows.has(r.__row))s.deleteRow(r.__row);});
    if(built.length){const freshRows=built.map(vals=>{const row=new Array(s.getLastColumn()).fill('');Object.keys(vals).forEach(k=>{if(m[k])row[m[k]-1]=vals[k];});return row;});s.insertRowsAfter(1,freshRows.length);s.getRange(2,1,freshRows.length,s.getLastColumn()).setValues(freshRows);}
    invalidateProductCache_();logAdmin_(id,'',user,'Product saved; live stock preserved');return{ok:true,id,skus:variants.map((v,i)=>String(v.sku||v.variantId||'')).filter(Boolean),message:'Product saved successfully. Live stock was preserved.'};
  }finally{lock.releaseLock();}
}
function skuPrefix_(category){const map={'Charger':'CHG','Cable & Adapter':'CAB','Powerbank':'PWB','Earbuds':'EAR','Neckband':'NEK','Headphones':'HDP','Microphone':'MIC','Speaker':'SPK','Smart watch':'SWT','Mobile':'MOB','Feature Phone':'FPN'};return 'FGBD-'+(map[category]||String(category||'GEN').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase()||'GEN')+'-';}
function skuSet_(s){const set=new Set();objects_(s).forEach(r=>{if(r.SKU)set.add(String(r.SKU).trim())});return set;}
function nextSku_(prefix,existing){let n=1;while(existing.has(prefix+String(n).padStart(4,'0')))n++;return prefix+String(n).padStart(4,'0');}
function moveProductRowsToTop_(s,rowNums){const unique=[...new Set(rowNums)].sort((a,b)=>b-a);const data=unique.map(r=>s.getRange(r,1,1,s.getLastColumn()).getValues()[0]);unique.forEach(r=>s.deleteRow(r));s.insertRowsAfter(1,data.length);s.getRange(2,1,data.length,s.getLastColumn()).setValues(data);}
function ensureDefaultCategories_(){const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName('Categories')||ss.insertSheet('Categories');if(!s.getLastRow())s.appendRow(['Category','Active','Sort Order']);const names=objects_(s).map(r=>String(r.Category||'').toLowerCase());['Charger','Cable & Adapter','Powerbank','Earbuds','Neckband','Headphones','Microphone','Speaker','Smart watch'].forEach((n,i)=>{if(!names.includes(n.toLowerCase()))s.appendRow([n,'TRUE',i+1])});}
function nextProductId_(){const rows=objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.P));let n=0;rows.forEach(r=>{const m=/^FG-(\d+)$/.exec(String(r['Product ID']||''));if(m)n=Math.max(n,+m[1]);});return 'FG-'+String(n+1).padStart(3,'0');}
function adminProductDelete_(b){const user=adminSession_(b.sessionToken),id=String(b.productId||'');if(!id)throw Error('Product ID is required.');const s=sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.P),rows=objects_(s).filter(r=>String(r['Product ID']||'')===id).sort((a,b)=>b.__row-a.__row);if(!rows.length)throw Error('Product not found.');rows.forEach(r=>s.deleteRow(r.__row));invalidateProductCache_();logAdmin_(id,'',user,'Product deleted');return {ok:true,message:'Product deleted.'};}
function adminOrderStatus_(b){const user=adminSession_(b.sessionToken),st=String(b.status||'');if(!['Pending','Confirmed','Processing','Shipped','Under Shipment','Delivered','Cancelled','Returned','Refunded'].includes(st))throw Error('Invalid order status.');const result=status_({orderId:b.orderId,status:st});logAdmin_(b.orderId,st,user,b.note||'Status changed');return result;}
function adminCourier_(b){const user=adminSession_(b.sessionToken),result=courier_({orderId:b.orderId,courier:b.courier,trackingId:b.trackingId});logAdmin_(b.orderId,'',user,'Courier updated');return result;}
function adminStock_(b){const user=adminSession_(b.sessionToken),result=stock_({sku:b.sku,quantity:b.quantity});logAdmin_('', '', user, 'Stock adjusted: '+b.sku+' '+b.quantity);return result;}
function adminCategorySave_(b){const user=adminSession_(b.sessionToken),name=String(b.name||'').trim(),oldName=String(b.oldName||'').trim();if(!name)throw Error('Category name is required.');const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName('Categories')||ss.insertSheet('Categories');if(!s.getLastRow())s.appendRow(['Category','Active','Sort Order']);const rows=objects_(s),target=rows.find(r=>String(r.Category||'').toLowerCase()===(oldName||name).toLowerCase());if(target){s.getRange(target.__row,1,1,3).setValues([[name,b.active===false?'FALSE':'TRUE',num_(b.sortOrder)]]);if(oldName&&oldName.toLowerCase()!==name.toLowerCase()){const ps=sheet_(ss,CFG.SHEETS.P),pm=map_(ps);objects_(ps).filter(r=>String(r.Category||'').toLowerCase()===oldName.toLowerCase()).forEach(r=>{if(pm.Category)ps.getRange(r.__row,pm.Category).setValue(name);if(pm['Updated At'])ps.getRange(r.__row,pm['Updated At']).setValue(new Date())});}}else{s.appendRow([name,b.active===false?'FALSE':'TRUE',num_(b.sortOrder)]);}logAdmin_('', '', user, 'Category saved: '+name);return {ok:true};}
function adminCategoryDelete_(b){const user=adminSession_(b.sessionToken),name=String(b.name||'');const s=SpreadsheetApp.openById(CFG.SHEET_ID),rows=objects_(s.getSheetByName('Categories')||s.insertSheet('Categories')).filter(r=>String(r.Category||'')===name).sort((a,b)=>b.__row-a.__row);rows.forEach(r=>s.deleteRow(r.__row));logAdmin_('', '', user, 'Category deleted: '+name);return {ok:true};}

function adminImageUpload_(b){
  const user=adminSession_(b.sessionToken);
  const name=String(b.fileName||'').trim()||('product-'+Date.now()+'.jpg');
  const mime=String(b.mimeType||'image/jpeg').trim().toLowerCase();
  const data=String(b.base64||'').replace(/^data:[^;]+;base64,/,'');
  if(!data)throw Error('Image data is missing.');
  const allowed=['image/jpeg','image/png','image/webp','image/gif'];
  if(!allowed.includes(mime))throw Error('Only JPG, PNG, WEBP or GIF images are allowed.');
  if(data.length>8*1024*1024)throw Error('Image is too large. Please choose an image under about 6 MB.');
  const bytes=Utilities.base64Decode(data);
  if(bytes.length>6*1024*1024)throw Error('Image is too large. Please choose an image under 6 MB.');
  const props=PropertiesService.getScriptProperties();
  let folderId=props.getProperty('FGBD_PRODUCT_IMAGE_FOLDER_ID');
  let folder=null;
  if(folderId){try{folder=DriveApp.getFolderById(folderId);}catch(_){} }
  if(!folder){
    const it=DriveApp.getFoldersByName('Flash Gear BD Product Images');
    folder=it.hasNext()?it.next():DriveApp.createFolder('Flash Gear BD Product Images');
    props.setProperty('FGBD_PRODUCT_IMAGE_FOLDER_ID',folder.getId());
  }
  const safeName=name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
  const file=folder.createFile(Utilities.newBlob(bytes,mime,safeName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  const fileId=file.getId();
  const url='https://drive.google.com/thumbnail?id='+encodeURIComponent(fileId)+'&sz=w1600';
  logAdmin_('', '', user, 'Product image uploaded: '+safeName);
  return {ok:true,url,fileId:fileId,name:file.getName()};
}

function adminImageBatchUpload_(b){
  const user=adminSession_(b.sessionToken), items=Array.isArray(b.images)?b.images:[];
  if(!items.length)throw Error('No images were supplied.');
  if(items.length>4)throw Error('You can upload up to 4 images at a time.');
  const props=PropertiesService.getScriptProperties();
  let folderId=props.getProperty('FGBD_PRODUCT_IMAGE_FOLDER_ID'),folder=null;
  if(folderId){try{folder=DriveApp.getFolderById(folderId);}catch(_){} }
  if(!folder){
    const it=DriveApp.getFoldersByName('Flash Gear BD Product Images');
    folder=it.hasNext()?it.next():DriveApp.createFolder('Flash Gear BD Product Images');
    props.setProperty('FGBD_PRODUCT_IMAGE_FOLDER_ID',folder.getId());
  }
  const allowed=['image/jpeg','image/png','image/webp','image/gif'],out=[];
  items.forEach((item,i)=>{
    const name=String(item.fileName||'').trim()||('product-'+Date.now()+'-'+(i+1)+'.webp');
    const mime=String(item.mimeType||'image/webp').trim().toLowerCase();
    const data=String(item.base64||'').replace(/^data:[^;]+;base64,/,'');
    if(!data)throw Error('Image '+(i+1)+' data is missing.');
    if(!allowed.includes(mime))throw Error('Image '+(i+1)+' has an unsupported format.');
    if(data.length>4*1024*1024)throw Error('Image '+(i+1)+' is too large after compression.');
    const bytes=Utilities.base64Decode(data);
    if(bytes.length>3*1024*1024)throw Error('Image '+(i+1)+' is too large after compression.');
    const safeName=name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
    const file=folder.createFile(Utilities.newBlob(bytes,mime,safeName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    const fileId=file.getId();
    out.push({ok:true,url:'https://drive.google.com/thumbnail?id='+encodeURIComponent(fileId)+'&sz=w1600',fileId:fileId,name:file.getName()});
  });
  logAdmin_('', '', user, 'Product image batch uploaded: '+out.length+' image(s)');
  return {ok:true,images:out};
}

function adminSettingsSave_(b){const user=adminSession_(b.sessionToken),settings=b.settings||{};const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=sheet_(ss,CFG.SHEETS.S),m=map_(s);Object.keys(settings).forEach(k=>{const v=settings[k];if(m.Setting&&m.Value){const rows=objects_(s),r=rows.find(x=>String(x.Setting||'')===k);if(r)s.getRange(r.__row,m.Value).setValue(v);else s.appendRow([k,v]);}});logAdmin_('', '', user, 'Store settings updated');return {ok:true};}
function logAdmin_(orderId,status,admin,note){const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName(CFG.SHEETS.OL)||ss.insertSheet(CFG.SHEETS.OL);if(!s.getLastRow())s.appendRow(ORDER_LOG_HEADERS);s.appendRow([new Date(),orderId||'',status||'',note||'',admin||'', 'admin']);}

function invalidateProductCache_(){try{CacheService.getScriptCache().remove(PRODUCT_CACHE_KEY);}catch(_){} }
