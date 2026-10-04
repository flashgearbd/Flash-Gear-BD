/** FLASH GEAR BD — Apps Script API — FGBD V1.0.4 */
const CFG={
  VERSION:'1.0.5', SHEET_ID:'13tC0gl5w0m8jjMd7N38ZVN_MdCh_2D09nTAP5FMhQLc',
  PHONE:/^01\d{9}$/, INSIDE:60, OUTSIDE:120, FREE:6499, FREE_ITEMS:2, FREE_ITEM_PRICE:1500, REORDER:10,
  SHEETS:{P:'Products',O:'Orders',C:'Customers',I:'Inventory',PU:'Purchases',E:'Expenses',S:'Settings',L:'API_Log'}
};
const H={
 Products:['Product ID','Product Name','Category','Subcategory','Brand','SKU','Variant ID','Variant','Cost Price','Selling Price','Old Price','Stock','Reserved','Available Stock','Reorder Level','Supplier','Image 1 URL','Image 2 URL','Image 3 URL','Image 4 URL','Short Description','Description','Featured','New Arrival','Deal','Offer Price','Website Status','Updated At'],
 Orders:['Order ID','Date','Customer ID','Customer Name','Phone','Email','Product ID','Product Name','SKU','Variant ID','Variant','Qty','Unit Price','Discount','Shipping','Total','Payment','Payment Status','Status','Courier','Tracking ID','Division','District','Area / Thana','Full Delivery Address','Delivery Note','Delivery Zone','Free Delivery','Source','Idempotency Key','Stock Restored','Created At','Updated At'],
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
    auth_(q.apiKey);
    if(a==='products')return out(products_(q));
    if(a==='product')return out(product_(q.productId,q.sku));
    if(a==='trackOrder')return out(track_(q.orderId,q.phone));
    if(a==='settings')return out(settings_());
    return out({ok:false,error:'Unknown action'});
  }catch(err){log_('GET',false,err.message,'','');return out({ok:false,error:err.message});}
}

function doPost(e){
  let b={};
  try{
    b=JSON.parse(e?.postData?.contents||'{}'); auth_(b.apiKey);
    switch(String(b.action||'')){
      case 'createOrder':return out(createOrder_(b));
      case 'updateOrderStatus':return out(status_(b));
      case 'updateCourier':return out(courier_(b));
      case 'adjustStock':return out(stock_(b));
      default:return out({ok:false,error:'Unknown action'});
    }
  }catch(err){log_('POST',false,err.message,b.orderId||'','');return out({ok:false,error:err.message});}
}

function setupStore(){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID);
  Object.keys(H).forEach(k=>headers_(ss,k,H[k]));
  const s=sheet_(ss,CFG.SHEETS.S); const have=objects_(s).map(r=>String(r.Setting||''));
  [['Shop Name','Flash Gear BD'],['Business Type','Mobile & Accessories'],['Currency','BDT (৳)'],['Low Stock Default',CFG.REORDER],['Website Status','Connected'],['Inside Chattogram Delivery',CFG.INSIDE],['Outside Chattogram Delivery',CFG.OUTSIDE],['Free Delivery Threshold',CFG.FREE],['Free Delivery Minimum Item Price',CFG.FREE_ITEM_PRICE],['Free Delivery Minimum Item Count',CFG.FREE_ITEMS],['Shop Phone','+8801601093553'],['WhatsApp','01891656945'],['Email','flashgearbd@gmail.com'],['Address','Meridian Kohinoor City Level 5, 537 No. Shop'],['Business Hours','11 AM - 9 PM']].forEach(x=>{if(!have.includes(x[0]))s.appendRow(x);});
  return 'Flash Gear BD sheets are ready.';
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
    const free=subtotal>CFG.FREE||(count>=CFG.FREE_ITEMS&&items.some(i=>i.price>=CFG.FREE_ITEM_PRICE));
    const zone=zone_(b.division,b.district), ship=free?0:(zone==='Chattogram District'?CFG.INSIDE:CFG.OUTSIDE), total=subtotal+ship, now=new Date();
    const orderId=nextOrder_(os,now), customerId=customer_(cs,b,now,total), om=map_(os);
    items.forEach(i=>{const row=new Array(os.getLastColumn()).fill(''); const vals={
      'Order ID':orderId,Date:now,'Customer ID':customerId,'Customer Name':b.name,Phone:b.phone,Email:b.email||'',
      'Product ID':i.pid,'Product Name':i.p['Product Name'],'SKU':i.sku,'Variant ID':i.vid,Variant:i.variant,Qty:i.qty,
      'Unit Price':i.price,Discount:0,Shipping:ship,Total:total,Payment:b.payment,'Payment Status':'Pending',Status:'Pending',
      Courier:'','Tracking ID':'',Division:b.division,District:b.district,'Full Delivery Address':b.address,
      'Delivery Note':b.note||'','Delivery Zone':zone,'Free Delivery':free?'Yes':'No',Source:'Website','Idempotency Key':b.idempotencyKey,
      'Stock Restored':'No','Created At':now,'Updated At':now}; Object.keys(vals).forEach(k=>{if(om[k])row[om[k]-1]=vals[k];}); os.getRange(os.getLastRow()+1,1,1,row.length).setValues([row]);});
    const pm=map_(ps); items.forEach(i=>{const next=num_(i.p.Stock)-i.qty;if(next<0)throw Error('Stock would become negative.');ps.getRange(i.p.__row,pm.Stock).setValue(next);if(pm['Updated At'])ps.getRange(i.p.__row,pm['Updated At']).setValue(now);});
    SpreadsheetApp.flush(); log_('createOrder',true,'Order created',orderId,'Website');
    return {ok:true,orderId,customerId,status:'Pending',subtotal,shipping,total,freeDelivery:free,deliveryZone:zone};
  }finally{lock.releaseLock();}
}

function products_(q){
  const rows=objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.P)), status=String(q.status||'Published').toLowerCase(), query=String(q.q||'').toLowerCase(), cat=String(q.category||'').toLowerCase(), g={};
  rows.filter(p=>String(p['Website Status']||'').toLowerCase()===status).filter(p=>!cat||String(p.Category||'').toLowerCase()===cat||String(p.Subcategory||'').toLowerCase()===cat).filter(p=>{if(!query)return true;return [p['Product Name'],p.Brand,p.Category,p.Subcategory,p.SKU,p.Variant].join(' ').toLowerCase().includes(query);}).forEach(p=>{
    const id=String(p['Product ID']||p.SKU||''); if(!id)return;
    if(!g[id])g[id]={id,name:String(p['Product Name']||''),category:String(p.Category||''),subcategory:String(p.Subcategory||''),brand:String(p.Brand||''),shortDescription:String(p['Short Description']||''),description:String(p.Description||''),featured:truth_(p.Featured),newArrival:truth_(p['New Arrival']),deal:truth_(p.Deal),variants:[]};
    const av=num_(p['Available Stock'],num_(p.Stock)-num_(p.Reserved)), st=av<=0?'Out of Stock':av<=num_(p['Reorder Level'],CFG.REORDER)?'Low Stock':'In Stock', price=truth_(p.Deal)&&num_(p['Offer Price'])>0?num_(p['Offer Price']):num_(p['Selling Price']);
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
function stock_(b){if(!b.sku||!Number.isFinite(Number(b.quantity)))throw Error('SKU and quantity are required.');const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=sheet_(ss,CFG.SHEETS.P),m=map_(s),r=objects_(s).find(x=>String(x.SKU||'')===String(b.sku));if(!r)throw Error('SKU not found.');const next=num_(r.Stock)+Number(b.quantity);if(next<0)throw Error('Stock cannot become negative.');s.getRange(r.__row,m.Stock).setValue(next);if(m['Updated At'])s.getRange(r.__row,m['Updated At']).setValue(new Date());return{ok:true,sku:b.sku,stock:next};}

function restore_(os,rows){
  const ss=SpreadsheetApp.openById(CFG.SHEET_ID),ps=sheet_(ss,CFG.SHEETS.P),pm=map_(ps),om=map_(os),prod=objects_(ps),by={};prod.forEach(p=>by[String(p.SKU||'')]=p);
  rows.forEach(r=>{const p=by[String(r.SKU||'')];if(!p)throw Error('Cannot restore stock; SKU not found: '+r.SKU);ps.getRange(p.__row,pm.Stock).setValue(num_(p.Stock)+num_(r.Qty));if(pm['Updated At'])ps.getRange(p.__row,pm['Updated At']).setValue(new Date());});
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
function validate_(b){['name','phone','division','district','address','payment'].forEach(k=>{if(!String(b[k]||'').trim())throw Error('Missing required field: '+k);});b.phone=normPhone(b.phone);if(!CFG.PHONE.test(b.phone))throw Error('Phone number must contain exactly 11 digits and start with 01.');if(!Array.isArray(b.items)||!b.items.length)throw Error('Cart is empty.');if(String(b.idempotencyKey||'').length<12)throw Error('Order request token is missing.');if(!['Cash on Delivery','bKash','Nagad','Upay','Bank Transfer'].includes(String(b.payment)))throw Error('Invalid payment method.');}
function normPhone(v){let s=String(v||'').replace(/\s+/g,'');if(s.startsWith('+88'))s=s.slice(3);else if(s.startsWith('88')&&s.length===13)s=s.slice(2);return s.replace(/\D/g,'');}
function timeline_(st){const a=['Pending','Confirmed','Processing','Shipped','Delivered'],x=st==='Under Shipment'?'Shipped':st,i=a.indexOf(x);return a.map((s,n)=>({status:s,done:x==='Delivered'||(i>=0&&n<=i)}));}
function settings_(){const o={};objects_(sheet_(SpreadsheetApp.openById(CFG.SHEET_ID),CFG.SHEETS.S)).forEach(r=>{if(r.Setting)o[String(r.Setting)]=r.Value;});return{ok:true,settings:o};}
function headers_(ss,name,wanted){let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);if(!s.getLastRow())s.getRange(1,1,1,wanted.length).setValues([wanted]);const cur=s.getRange(1,1,1,Math.max(1,s.getLastColumn())).getValues()[0].map(String);wanted.forEach(h=>{if(!cur.includes(h)){s.getRange(1,s.getLastColumn()+1).setValue(h);cur.push(h);}});s.setFrozenRows(1);}
function objects_(s){const v=s.getDataRange().getValues();if(!v.length)return[];const h=v[0].map(x=>String(x||'').trim()),o=[];for(let r=1;r<v.length;r++){if(v[r].every(x=>x===''||x==null))continue;const x={__row:r+1};h.forEach((k,c)=>{if(k)x[k]=v[r][c];});o.push(x);}return o;}
function map_(s){const a=s.getRange(1,1,1,Math.max(1,s.getLastColumn())).getValues()[0],m={};a.forEach((x,i)=>{if(x)m[String(x).trim()]=i+1;});return m;}
function sheet_(ss,name){const s=ss.getSheetByName(name);if(!s)throw Error('Sheet not found: '+name+'. Run setupStore() first.');return s;}
function auth_(key){const k=PropertiesService.getScriptProperties().getProperty('FGBD_API_KEY');if(!k||String(key||'')!==k)throw Error('Unauthorized');}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
function log_(a,ok,msg,id,src){try{const ss=SpreadsheetApp.openById(CFG.SHEET_ID),s=ss.getSheetByName(CFG.SHEETS.L)||ss.insertSheet(CFG.SHEETS.L);if(!s.getLastRow())s.appendRow(H.API_Log);s.appendRow([new Date(),a,ok?'Yes':'No',msg,id||'',src||'']);}catch(_) {}}
function num_(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function truth_(v){return v===true||['true','yes','1'].includes(String(v||'').toLowerCase().trim());}
function iso_(v){if(!v)return'';const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?String(v):d.toISOString();}
