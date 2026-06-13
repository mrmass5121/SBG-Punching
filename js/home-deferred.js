/* ─── INTRO ───
   Disabled for faster first paint. The splash remains hidden through CSS. */
document.getElementById('intro')?.classList.add('hidden');

/* ─── HEADER SCROLL ─── */
const header=document.getElementById('mainHeader');
window.addEventListener('scroll',()=>{
  header?.classList.toggle('scrolled',window.scrollY>60);
},{passive:true});

/* ─── MOBILE MENU ─── */
function openMobileMenu(){
  const menu=document.getElementById('mobileMenu');
  const overlay=document.getElementById('mobileOverlay');
  menu?.removeAttribute('hidden');
  overlay?.removeAttribute('hidden');
  menu?.classList.add('open');
  overlay?.classList.add('open');
  document.querySelector('.hamburger')?.setAttribute('aria-expanded','true');
}
function closeMobileMenu(){
  const menu=document.getElementById('mobileMenu');
  const overlay=document.getElementById('mobileOverlay');
  menu?.classList.remove('open');
  overlay?.classList.remove('open');
  setTimeout(()=>{
    if(!menu?.classList.contains('open'))menu?.setAttribute('hidden','');
    if(!overlay?.classList.contains('open'))overlay?.setAttribute('hidden','');
  },360);
  document.querySelector('.hamburger')?.setAttribute('aria-expanded','false');
}

/* ─── SCROLL REVEAL ─── */
const revealObs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');revealObs.unobserve(e.target)}});
},{threshold:.1,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach(el=>revealObs.observe(el));

/* ─── ANIMATED COUNTERS ─── */
function animateCounters(){
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.stat-num[data-target]').forEach(el=>{
    if(el.dataset.counted==='true')return;
    el.dataset.counted='true';
    const target=Number(el.dataset.target)||0;
    const suffix=el.dataset.suffix||'';
    const setValue=value=>{el.textContent=`${value}${suffix}`};
    if(reduceMotion){
      setValue(target);
      return;
    }
    const duration=600;
    const start=performance.now();
    setValue(0);
    const tick=now=>{
      const progress=Math.min((now-start)/duration,1);
      const eased=1-Math.pow(1-progress,3);
      setValue(Math.round(target*eased));
      if(progress<1)requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const statsObs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting){animateCounters();statsObs.disconnect()}});
},{threshold:.1});
const sb=document.querySelector('.stats-bar');
if(sb)statsObs.observe(sb);

/* ─── GALLERY PRODUCTS ─── */
const FALLBACK_PRODUCTS=[];
const REMOVED_PRODUCTION_IDS=new Set(['5e39e40b-c668-466f-8e04-33de2a9f3cad']);
let products=FALLBACK_PRODUCTS;
let currentFilter='All';
let currentMaterialFilter='All';
let productSearchQuery='';
let activeGalleryView='collections';
let sbgClient=null;
let visibleProducts=[];
let activeProductSlug='';
let currentProductIndex=-1;
let activeImageIndex=0;
let activeProductTab='description';
let productReviews={};
let reviewsChannel=null;
let pendingReviewRating=5;
const WISHLIST_STORAGE_KEY='sbg_product_wishlist';
let productWishlist=new Set(loadWishlistSlugs());
const SBG_CFG=window.SBG_CONFIG||{};
const SBG_IS_LOCAL=Boolean(window.SBG_IS_LOCAL);
const QUOTE_INQUIRY_STORAGE_KEY='sbg_local_quote_inquiries';
const QUOTE_EMAIL='sbgpunching@gmail.com';
const QUOTE_WHATSAPP='918892181792';
function hasConfigValue(value){
  const text=String(value||'').trim();
  return Boolean(text)&&!/^YOUR_/i.test(text)&&!/^PASTE_/i.test(text)&&!/[<>]/.test(text);
}
let turnstileScriptPromise=null;
let configScriptPromise=null;
let supabaseScriptPromise=null;
const turnstileWidgetIds=new WeakMap();
function ensureSiteConfig(){
  if(SBG_IS_LOCAL||SBG_CFG.externalConfigLoaded)return Promise.resolve(!SBG_IS_LOCAL);
  if(configScriptPromise)return configScriptPromise;
  configScriptPromise=new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='/js/config.js';
    script.defer=true;
    script.onload=()=>{
      Object.assign(SBG_CFG,window.SBG_CONFIG||{});
      SBG_CFG.externalConfigLoaded=true;
      window.SBG_CONFIG=SBG_CFG;
      resolve(true);
    };
    script.onerror=()=>resolve(false);
    document.head.append(script);
  });
  return configScriptPromise;
}
function turnstileSiteKey(){
  const key=String(SBG_CFG.turnstileSiteKey||'').trim();
  return hasConfigValue(key)?key:'';
}
function serverlessBaseUrl(){
  return String(SBG_CFG.serverlessBaseUrl||'/api').replace(/\/$/,'');
}
function supabaseConfigReady(){
  return Boolean(
    hasConfigValue(SBG_CFG.supabaseUrl) &&
    hasConfigValue(SBG_CFG.supabaseAnonKey) &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(SBG_CFG.supabaseUrl).trim())
  );
}
function configureSupabaseClient(){
  if(sbgClient)return true;
  if(!window.supabase||!supabaseConfigReady())return false;
  sbgClient=window.supabase.createClient(SBG_CFG.supabaseUrl,SBG_CFG.supabaseAnonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  return true;
}
function ensureSupabaseScript(){
  if(window.supabase)return Promise.resolve(true);
  if(!supabaseConfigReady())return Promise.resolve(false);
  if(supabaseScriptPromise)return supabaseScriptPromise;
  supabaseScriptPromise=new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='/js/supabase.min.js';
    script.defer=true;
    script.onload=()=>resolve(true);
    script.onerror=()=>resolve(false);
    document.head.append(script);
  });
  return supabaseScriptPromise;
}
async function ensureSupabaseClient(){
  if(configureSupabaseClient())return true;
  await ensureSiteConfig();
  if(configureSupabaseClient())return true;
  const loaded=await ensureSupabaseScript();
  return loaded&&configureSupabaseClient();
}

function turnstileEnabled(){
  const localHost=/^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i.test(location.host);
  return Boolean(turnstileSiteKey())&&location.protocol!=='file:'&&!localHost;
}
function markCaptchaError(node,message){
  if(!node)return;
  const widgetId=turnstileWidgetIds.get(node);
  if(widgetId!==undefined&&window.turnstile&&typeof window.turnstile.remove==='function'){
    try{window.turnstile.remove(widgetId);}catch(error){console.warn(error.message||error);}
  }
  turnstileWidgetIds.delete(node);
  node.dataset.turnstileRendered='error';
  node.textContent=message;
}
function ensureTurnstile(){
  if(!turnstileEnabled())return Promise.resolve(false);
  if(window.turnstile)return Promise.resolve(true);
  if(turnstileScriptPromise)return turnstileScriptPromise;
  turnstileScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async=true;
    script.defer=true;
    script.onload=()=>resolve(true);
    script.onerror=()=>reject(new Error('Security check could not load.'));
    document.head.append(script);
  });
  return turnstileScriptPromise;
}
async function renderTurnstileWidgets(root=document){
  await ensureSiteConfig();
  if(!turnstileEnabled())return;
  try{
    await ensureTurnstile();
    root.querySelectorAll('[data-turnstile]:not([data-turnstile-rendered])').forEach(node=>{
      try{
        const widgetId=window.turnstile.render(node,{
          sitekey:turnstileSiteKey(),
          theme:'dark',
          callback:()=>{node.dataset.turnstileStatus='complete';},
          'expired-callback':()=>{node.dataset.turnstileStatus='expired';},
          'timeout-callback':()=>markCaptchaError(node,'Security check timed out. Reload and try again.'),
          'error-callback':()=>markCaptchaError(node,'Security check could not load. Add this domain in Cloudflare Turnstile.')
        });
        node.dataset.turnstileRendered='true';
        turnstileWidgetIds.set(node,widgetId);
      }catch(error){
        markCaptchaError(node,'Security check could not load. Check Turnstile domain settings.');
        console.warn(error.message||error);
      }
    });
  }catch(error){
    root.querySelectorAll('[data-turnstile]:not([data-turnstile-rendered])').forEach(node=>{
      markCaptchaError(node,'Security check could not load. Check your connection or Turnstile settings.');
    });
    console.warn(error.message||error);
  }
}
function captchaToken(name,root=document){
  if(!turnstileEnabled())return '';
  const node=root.querySelector(`[data-turnstile="${name}"]`);
  const widgetId=node?turnstileWidgetIds.get(node):null;
  return widgetId!==null&&widgetId!==undefined&&window.turnstile?window.turnstile.getResponse(widgetId):'';
}
function captchaReady(name,root=document){
  if(!turnstileEnabled())return true;
  const node=root.querySelector(`[data-turnstile="${name}"]`);
  return Boolean(node&&node.dataset.turnstileRendered!=='error'&&window.turnstile&&turnstileWidgetIds.has(node));
}
function captchaHasVisibleWidget(name,root=document){
  const node=root.querySelector(`[data-turnstile="${name}"]`);
  if(!node)return false;
  const rect=node.getBoundingClientRect();
  return rect.width>0&&rect.height>10;
}
function captchaLoadMessage(name,root=document,message='Security check could not load. Check Turnstile domain settings.'){
  const node=root.querySelector(`[data-turnstile="${name}"]`);
  if(!node)return;
  markCaptchaError(node,message);
}
function resetCaptcha(name,root=document){
  if(!turnstileEnabled())return;
  const node=root.querySelector(`[data-turnstile="${name}"]`);
  const widgetId=node?turnstileWidgetIds.get(node):null;
  if(widgetId!==null&&widgetId!==undefined&&window.turnstile){
    try{window.turnstile.reset(widgetId);}
    catch(error){turnstileWidgetIds.delete(node);console.warn(error.message||error);}
  }
}
async function postJson(url,payload){
  const response=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const text=await response.text();
  let data={};
  if(text){
    try{
      data=JSON.parse(text);
    }catch{
      data={error:text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180)};
    }
  }
  if(!response.ok){
    const detail=data.error||data.message||response.statusText||'Request failed.';
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return data;
}
function serverlessEndpoint(name){
  return `${serverlessBaseUrl()}/${name}`;
}




function escHTML(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function safeUrl(value){
  const url=String(value||'').trim();
  if(!url)return '';
  if(url.startsWith('data:image/'))return url;
  if(/^(https?:|\.\/|\/|assets\/|img\/|images\/)/i.test(url) && !/^javascript:/i.test(url))return url;
  return '';
}
function normalizeStoragePath(pathOrUrl,bucket){
  const value=String(pathOrUrl||'').trim();
  if(!value)return '';
  const buckets=[bucket,SBG_CFG.publicStorageBucket||SBG_CFG.storageBucket||'production-media-public',SBG_CFG.privateStorageBucket||'production-media-private'].filter(Boolean);
  for(const bucketName of [...new Set(buckets)]){
    const prefix=`${bucketName}/`;
    if(value.startsWith(prefix))return value.slice(prefix.length);
    const publicMarker=`/storage/v1/object/public/${bucketName}/`;
    const publicIndex=value.indexOf(publicMarker);
    if(publicIndex>=0)return decodeURIComponent(value.slice(publicIndex+publicMarker.length).split(/[?#]/)[0]);
    const signedMarker=`/storage/v1/object/sign/${bucketName}/`;
    const signedIndex=value.indexOf(signedMarker);
    if(signedIndex>=0)return decodeURIComponent(value.slice(signedIndex+signedMarker.length).split(/[?#]/)[0]);
  }
  return value;
}
function mediaPublicUrl(mediaOrPath){
  const media=typeof mediaOrPath==='object'&&mediaOrPath?mediaOrPath:null;
  const bucket=media?.bucket||SBG_CFG.publicStorageBucket||SBG_CFG.storageBucket||'production-media-public';
  const privateBucket=SBG_CFG.privateStorageBucket||'production-media-private';
  if(media&&(media.private||bucket===privateBucket))return '';
  const src=normalizeStoragePath(media?(media.path||media.url||media.src||''):mediaOrPath,bucket);
  if(!src)return '';
  if(/^(https?:|data:image\/|\.\/|\/|assets\/|img\/|images\/)/i.test(src))return safeUrl(src);
  if(!sbgClient)return '';
  const {data}=sbgClient.storage.from(bucket).getPublicUrl(src);
  return safeUrl(data.publicUrl);
}
function slugify(value){
  return String(value||'product').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'product';
}
function productSlug(product){
  return product?.slug||slugify(`${product?.cat||'production'}-${product?.name||product?.id||'item'}`);
}
function routeProductSlug(){
  const params=new URLSearchParams(location.search);
  const querySlug=params.get('product');
  const pathMatch=location.pathname.match(/\/products\/([^/?#]+)/);
  const hashProduct=String(location.hash||'').match(/(?:[?&]product=|#product=)([^&#]+)/);
  const slug=querySlug||pathMatch?.[1]||hashProduct?.[1]||'';
  try{
    return decodeURIComponent(slug).trim();
  }catch(error){
    return String(slug||'').trim();
  }
}
function hasProductRoute(){
  return Boolean(routeProductSlug());
}
function initialProductLimit(){
  return hasProductRoute()?1000:PAGE_SIZE;
}
function normalizedProductImage(item,fallbackTitle){
  if(!item)return null;
  if(typeof item==='string'){
    const src=safeUrl(item);
    return src?{src,type:'image',alt:fallbackTitle||'Production item'}:null;
  }
  if(typeof item==='object'){
    const src=safeUrl(item.src||item.url||item.image||'');
    return src?{src,type:item.type||'image',alt:item.alt||fallbackTitle||'Production item'}:null;
  }
  return null;
}
function loadWishlistSlugs(){
  try{
    const values=JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY)||'[]');
    return Array.isArray(values)?values.filter(Boolean):[];
  }catch(error){
    return [];
  }
}
function saveWishlistSlugs(){
  try{
    localStorage.setItem(WISHLIST_STORAGE_KEY,JSON.stringify([...productWishlist]));
  }catch(error){}
}
function isWishlisted(product){
  return productWishlist.has(productSlug(product));
}
function productReviewKey(product){
  return productSlug(product);
}

function isCustomisedDesignProduct(product){
  const tags=Array.isArray(product?.tags)?product.tags:[];
  const features=Array.isArray(product?.features)?product.features:[];
  const text=[product?.cat,product?.category,...tags,...features].filter(Boolean).join(' ').toLowerCase();
  return /customi[sz]ed/.test(text)&&/design/.test(text);
}
function productMediaList(product){
  if(Array.isArray(product?.images)&&product.images.length){
    const images=product.images.map(item=>normalizedProductImage(item,product?.name||'Production item')).filter(Boolean);
    if(images.length)return images;
  }
  const single=safeUrl(product?.image);
  return single?[{src:single,type:'image',alt:product?.name||'Production item'}]:[];
}
function mediaToProductImage(media, fallbackTitle){
  const src=mediaPublicUrl(media);
  return src?{src,type:media?.type||'image',alt:media?.alt||fallbackTitle||'Production item'}:null;
}
function missingQuantityColumn(error){
  const message=String(error?.message||'');
  return error?.code==='PGRST204'||message.includes("Could not find the 'quantity' column")||message.includes("'quantity' column");
}
function missingProductionColumn(error,column){
  const message=String(error?.message||'');
  return error?.code==='PGRST204'||message.includes(`'${column}' column`)||message.includes(`the '${column}' column`);
}
function rowQuantity(row){
  const direct=Number(row.quantity);
  if(Number.isFinite(direct)&&direct>0)return direct;
  const tag=(Array.isArray(row.tags)?row.tags:[]).find(value=>/^qty:\d+$/i.test(String(value||'').trim()));
  const tagged=Number(String(tag||'').match(/^qty:(\d+)$/i)?.[1]);
  return Number.isFinite(tagged)&&tagged>0?tagged:null;
}
function mapProduction(row){
  const media=Array.isArray(row.media)?row.media:[];
  const images=media.map(item=>mediaToProductImage(item,row.title)).filter(Boolean);
  const first=images[0]||{};
  const quantity=rowQuantity(row);
  const qty=quantity?`Qty ${quantity.toLocaleString('en-IN')}`:'';
  const details=[row.material,row.thickness,qty].filter(Boolean).join(' / ');
  return {
    id:row.id||row.title,
    cat:row.category||'Production',
    name:row.title||'Production Item',
    mat:details||row.status||'',
    material:row.material||'',
    thickness:row.thickness||'',
    quantity,
    status:row.status||'Live',
    featured:Boolean(row.featured),
    desc:row.description||'',
    tags:Array.isArray(row.tags)?row.tags.filter(tag=>!/^qty:\d+$/i.test(String(tag||'').trim())):[],
    features:Array.isArray(row.tags)?row.tags.filter(tag=>!/^qty:\d+$/i.test(String(tag||'').trim())):[],
    icon:'⚙️',
    image:first.src||mediaPublicUrl(row.image),
    images,
    date:row.production_date||row.created_at||null
  };
}

// Public reads are protected by Supabase RLS. If config is not set, the
// gallery stays empty until real production records are available.
const PAGE_SIZE = 15;
let galleryPage = 0;
let galleryHasMore = true;

async function loadProducts(){
  galleryPage = 0;
  galleryHasMore = true;
  products = [];
  const firstLimit = initialProductLimit();

  try{
    if(await ensureSupabaseClient()){
      let {data,error}=await sbgClient
        .from('productions')
        .select('id,title,category,material,thickness,quantity,status,description,tags,media,production_date,created_at,is_public,featured')
        .eq('is_public',true)
        .order('production_date',{ascending:false})
        .order('created_at',{ascending:false})
        .range(0, firstLimit - 1);
      if(error&&(missingQuantityColumn(error)||missingProductionColumn(error,'featured'))){
        ({data,error}=await sbgClient
          .from('productions')
          .select('id,title,category,material,thickness,status,description,tags,media,production_date,created_at,is_public')
          .eq('is_public',true)
          .order('production_date',{ascending:false})
          .order('created_at',{ascending:false})
          .range(0, firstLimit - 1));
      }
      if(error)throw error;
      const fetched=(data||[]).filter(row=>!REMOVED_PRODUCTION_IDS.has(row.id)).map(mapProduction);
      if(fetched.length < firstLimit) galleryHasMore=false;
      products=fetched;
      await loadReviews();
      renderProducts(currentFilter);
      updateLoadMoreButton();
      openProductFromRoute();
      return;
    }else if(!SBG_IS_LOCAL){
      const res = await fetch('/products.json', { cache: 'default' });
      if(res.ok){
        const data=await res.json();
        if(data&&data.products&&data.products.length){
          const fetched=data.products.slice(0, firstLimit).map(p=>({
            id:p.id||p.title,
            cat:p.category||'Production',
            name:p.title||'Production Item',
            mat:p.details||p.material||'',
            material:p.material||'',
            thickness:p.thickness||'',
            quantity:p.quantity||null,
            status:p.status||'Live',
            featured:Boolean(p.featured),
            desc:p.description||'',
            tags:Array.isArray(p.tags)?p.tags:[],
            features:Array.isArray(p.features)?p.features:(Array.isArray(p.tags)?p.tags:[]),
            icon:'📧',
            image:safeUrl(p.image),
            images:Array.isArray(p.images)?p.images.map(item=>normalizedProductImage(item,p.title||'Production item')).filter(Boolean):[],
            date:p.date||null
          }));
          if(data.products.length <= firstLimit) galleryHasMore=false;
          products=fetched;
          await loadReviews();
          renderProducts(currentFilter);
          updateLoadMoreButton();
          openProductFromRoute();
          return;
        }
      }
    }
  }catch(error){
    console.warn('Gallery fallback active:',error.message||error);
  }
  await loadReviews();
  renderProducts(currentFilter);
  updateLoadMoreButton();
  openProductFromRoute();
}

// ── NEW FUNCTION: loads the next batch when user clicks "Load More" ──
async function loadMoreProducts(){
  if(!galleryHasMore) return;
  const from = products.length;
  const to   = from + PAGE_SIZE - 1;

  const btn = document.getElementById('loadMoreBtn');
  if(btn){ btn.disabled=true; btn.textContent='Loading...'; }

  try{
    if(await ensureSupabaseClient()){
      let {data,error}=await sbgClient
        .from('productions')
        .select('id,title,category,material,thickness,quantity,status,description,tags,media,production_date,created_at,is_public,featured')
        .eq('is_public',true)
        .order('production_date',{ascending:false})
        .order('created_at',{ascending:false})
        .range(from, to);
      if(error&&(missingQuantityColumn(error)||missingProductionColumn(error,'featured'))){
        ({data,error}=await sbgClient
          .from('productions')
          .select('id,title,category,material,thickness,status,description,tags,media,production_date,created_at,is_public')
          .eq('is_public',true)
          .order('production_date',{ascending:false})
          .order('created_at',{ascending:false})
          .range(from, to));
      }
      if(error)throw error;
      const newItems=(data||[]).filter(row=>!REMOVED_PRODUCTION_IDS.has(row.id)).map(mapProduction);
      if(newItems.length < PAGE_SIZE) galleryHasMore=false;
      products=[...products, ...newItems];
    }
  }catch(error){
    console.warn('Load more failed:',error.message||error);
  }

  renderProducts(currentFilter);
  updateLoadMoreButton();
}

// ── Shows or hides the Load More button based on whether more items exist ──
function updateLoadMoreButton(){
  const btn=document.getElementById('loadMoreBtn');
  if(!btn) return;
  btn.hidden = !galleryHasMore;
  btn.classList.toggle('is-visible', galleryHasMore);
  btn.disabled = false;
  btn.textContent = 'Load More';
}
function registerProductRealtime(){
  if(!sbgClient)return;
  sbgClient.channel('homepage-production-feed')
    .on('postgres_changes',{event:'*',schema:'public',table:'productions'},()=>loadProducts())
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR')console.warn('Production realtime channel unavailable');
    });
  reviewsChannel=sbgClient.channel('production-review-feed')
    .on('postgres_changes',{event:'*',schema:'public',table:'production_reviews'},async()=>{
      await loadReviews();
      renderProducts(currentFilter);
      if(currentProductIndex>=0)renderOpenProductDetail(false);
    })
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR')console.warn('Review realtime channel unavailable');
    });
}

function reviewStorageKey(){
  return 'sbg_production_reviews';
}
function fallbackReviews(){
  try{
    return JSON.parse(localStorage.getItem(reviewStorageKey())||'{}')||{};
  }catch(error){
    return {};
  }
}
function saveFallbackReviews(){
  try{
    localStorage.setItem(reviewStorageKey(),JSON.stringify(productReviews));
  }catch(error){}
}
async function loadReviews(){
  if(!sbgClient){
    productReviews=fallbackReviews();
    return;
  }
  const {data,error}=await sbgClient
    .from('production_reviews')
    .select('product_slug,rating,reviewer_name,comment,created_at')
    .eq('approved',true)
    .order('created_at',{ascending:false})
    .limit(15);
  if(error){
    console.warn('Review fallback active:',error.message||error);
    productReviews=fallbackReviews();
    return;
  }
  productReviews=(data||[]).reduce((groups,row)=>{
    const key=row.product_slug||'';
    if(!key)return groups;
    groups[key]=groups[key]||[];
    groups[key].push(row);
    return groups;
  },{});
}
function reviewsFor(product){
  const rows=productReviews[productReviewKey(product)];
  return Array.isArray(rows)?rows:[];
}
function reviewStats(product){
  const rows=reviewsFor(product);
  if(!rows.length)return {count:0,average:0};
  const total=rows.reduce((sum,row)=>sum+(Number(row.rating)||0),0);
  return {count:rows.length,average:total/rows.length};
}
function starText(value){
  const rating=Math.round(Number(value)||0);
  return Array.from({length:5},(_,index)=>index<rating?'&#9733;':'&#9734;').join('');
}
function fullViewIcon(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M21 3l-7 7"></path><path d="M9 21H3v-6"></path><path d="M3 21l7-7"></path></svg>`;
}

function productSearchText(product){
  const values=[
    product?.name,
    product?.cat,
    product?.category,
    product?.mat,
    product?.material,
    product?.thickness,
    product?.status,
    product?.desc,
    ...(Array.isArray(product?.tags)?product.tags:[]),
    ...(Array.isArray(product?.features)?product.features:[])
  ];
  return values.filter(Boolean).join(' ').toLowerCase();
}
function productMaterialLabel(product){
  const direct=String(product?.material||'').trim();
  if(direct)return direct;
  const fromDetails=String(product?.mat||'').split('/')[0].trim();
  return fromDetails&&!/^qty\b/i.test(fromDetails)?fromDetails:'Other';
}
function uniqueProductValues(items,mapper,limit=12){
  return [...new Set(items.map(mapper).map(value=>String(value||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b))
    .slice(0,limit);
}
function productMatchesSearch(product){
  const query=productSearchQuery.trim().toLowerCase();
  return !query||productSearchText(product).includes(query);
}
function productMatchesMaterial(product){
  return currentMaterialFilter==='All'||productMaterialLabel(product)===currentMaterialFilter;
}
function filterProductionList(items){
  return items.filter(product=>
    (currentFilter==='All'||product.cat===currentFilter) &&
    productMatchesMaterial(product) &&
    productMatchesSearch(product)
  );
}
function renderProductionChips(container,values,activeValue,dataName){
  if(!container)return;
  container.innerHTML=['All',...values].map(value=>{
    const active=value===activeValue;
    return `<button class="production-chip ${active?'active':''}" type="button" data-${dataName}="${escHTML(value)}" aria-pressed="${active?'true':'false'}">${escHTML(value)}</button>`;
  }).join('');
}
function syncProductionControls(source,filtered){
  const search=document.getElementById('productionSearchInput');
  if(search&&search.value!==productSearchQuery)search.value=productSearchQuery;
  const categories=uniqueProductValues(source,product=>product.cat||'Production');
  const materials=uniqueProductValues(source,productMaterialLabel);
  renderProductionChips(document.getElementById('productionCategoryFilters'),categories,currentFilter,'production-category');
  renderProductionChips(document.getElementById('productionMaterialFilters'),materials,currentMaterialFilter,'production-material');
  const line=document.getElementById('productionResultsLine');
  if(line){
    const count=filtered.length;
    const total=source.length;
    const query=productSearchQuery.trim();
    const parts=[
      `Showing ${count} of ${total} production${total===1?'':'s'}`,
      currentFilter!=='All'?`Category: ${currentFilter}`:'',
      currentMaterialFilter!=='All'?`Material: ${currentMaterialFilter}`:'',
      query?`Search: "${query}"`:''
    ].filter(Boolean);
    line.textContent=parts.join(' | ');
  }
}
function clearProductionFilters(){
  currentFilter='All';
  currentMaterialFilter='All';
  productSearchQuery='';
  renderProducts(currentFilter);
}
function productGlobalIndex(product){
  return Math.max(0,products.findIndex(item=>item.name===product.name&&item.cat===product.cat));
}
function safeProductQuoteUrl(product){
  try{
    return productEnquiryUrl(product);
  }catch(error){
    console.warn('Product quote URL failed:',error.message||error);
    return '#contact';
  }
}
function productRecommendedCard(product,index){
  const productIndex=productGlobalIndex(product);
  const image=productImage(product);
  const name=escHTML(product.name||'Production Item');
  const mat=escHTML(product.mat||product.material||'Custom material');
  const stats=reviewStats(product);
  const ratingLabel=stats.count?`${starText(stats.average)} ${stats.average.toFixed(1)} (${stats.count})`:'&#9734;&#9734;&#9734;&#9734;&#9734; No ratings';
  const slug=productSlug(product);
  const saved=isWishlisted(product);
  const quoteUrl=escHTML(safeProductQuoteUrl(product));
  return `<article class="amazon-product-card amazon-rec-card" data-product-index="${productIndex}" role="button" tabindex="0" aria-label="View ${name}">
    <div class="amazon-card-media">
      <a class="amazon-card-image" href="#production" data-product-link aria-label="Open details for ${name}">${image?`<img src="${escHTML(image)}" alt="${name}" loading="lazy" decoding="async" width="400" height="210" class="csp-inline-40">`:escHTML(product.icon||'??')}</a>
      <button class="product-full-view" type="button" data-full-view="${productIndex}" aria-label="Full view ${name}" title="Full view">${fullViewIcon()}</button>
    </div>
    <span class="amazon-quote">Quote after drawing review</span>
    <a class="amazon-product-title" href="#production" data-product-link>${name}</a>
    <div class="prod-mat">${mat}</div>
    <span class="amazon-stars">${ratingLabel}</span>
    <div class="product-card-actions">
      <a class="product-card-action product-quote-action" href="${quoteUrl}" target="_blank" rel="noopener noreferrer">Request Quote</a>
      <button class="product-card-action ${saved?'active':''}" type="button" data-toggle-wishlist="${productIndex}" data-wishlist-slug="${escHTML(slug)}" aria-pressed="${saved?'true':'false'}"><span data-wishlist-label>${saved?'Wishlisted':'Wishlist'}</span></button>
      <button class="product-card-action product-share-action" type="button" data-share-product="${productIndex}">Share</button>
      <button class="product-review-cta" type="button" data-open-reviews="${productIndex}">Rate &amp; Review</button>
    </div>
  </article>`;
}
function safeProductRecommendedCard(product,index){
  try{
    return productRecommendedCard(product,index);
  }catch(error){
    console.warn('Product card render failed:',error.message||error,product);
    const productIndex=productGlobalIndex(product);
    const name=escHTML(product?.name||'Production Item');
    const mat=escHTML(product?.mat||product?.material||'Custom material');
    return `<article class="amazon-product-card amazon-rec-card" data-product-index="${productIndex}" role="button" tabindex="0" aria-label="View ${name}">
      <a class="amazon-card-image" href="#production" data-product-link aria-label="Open details for ${name}">${escHTML(product?.icon||'Production')}</a>
      <span class="amazon-quote">Quote after drawing review</span>
      <a class="amazon-product-title" href="#production" data-product-link>${name}</a>
      <div class="prod-mat">${mat}</div>
      <div class="product-card-actions">
        <a class="product-card-action product-quote-action" href="${escHTML(safeProductQuoteUrl(product))}" target="_blank" rel="noopener noreferrer">Request Quote</a>
      </div>
    </article>`;
  }
}
function featuredCollectionProducts(){
  return products.filter(product=>product.featured);
}
function collectionProducts(){
  return products;
}
function customisedDesignProducts(){
  return products.filter(isCustomisedDesignProduct);
}
function wishlistCollectionProducts(){
  return products.filter(product=>productWishlist.has(productSlug(product)));
}
function updateGalleryTabs(){
  const collectionsCount=collectionProducts().length;
  const customisedCount=customisedDesignProducts().length;
  const featuredCount=featuredCollectionProducts().length;
  const wishlistCount=wishlistCollectionProducts().length;
  document.querySelectorAll('[data-gallery-view]').forEach(button=>{
    const active=button.dataset.galleryView===activeGalleryView;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  document.querySelector('[data-collections-count]')?.replaceChildren(String(collectionsCount));
  document.querySelector('[data-customised-count]')?.replaceChildren(String(customisedCount));
  document.querySelector('[data-featured-count]')?.replaceChildren(String(featuredCount));
  document.querySelector('[data-wishlist-count]')?.replaceChildren(String(wishlistCount));
}
function setGalleryView(view){
  activeGalleryView=['collections','customised','featured','wishlist'].includes(view)?view:'collections';
  closeProductionDetailViewOnly();
  renderProducts(currentFilter);
}
function bindProductCards(root=document){
  root.querySelectorAll('.amazon-product-card[data-product-index], .wishlist-item[data-product-index]').forEach(el=>{
    el.addEventListener('click',event=>{
      const fullView=event.target.closest('[data-full-view]');
      if(fullView){
        event.preventDefault();
        event.stopPropagation();
        openProductFullView(Number(fullView.dataset.fullView||el.dataset.productIndex||0));
        return;
      }
      const wishlist=event.target.closest('[data-toggle-wishlist]');
      if(wishlist){
        event.preventDefault();
        event.stopPropagation();
        toggleWishlist(products[Number(wishlist.dataset.toggleWishlist||el.dataset.productIndex||0)]);
        return;
      }
      const share=event.target.closest('[data-share-product]');
      if(share){
        event.preventDefault();
        event.stopPropagation();
        shareProduct(products[Number(share.dataset.shareProduct||el.dataset.productIndex||0)]);
        return;
      }
      const quote=event.target.closest('.product-quote-action');
      if(quote){
        logQuoteClick(products[Number(el.dataset.productIndex||0)]);
        return;
      }
      const reviews=event.target.closest('[data-open-reviews]');
      if(reviews){
        event.preventDefault();
        event.stopPropagation();
        openProductionDetail(Number(reviews.dataset.openReviews||el.dataset.productIndex||0),{tab:'reviews'});
        return;
      }
      const link=event.target.closest('a');
      if(link&&!link.hasAttribute('data-product-link'))return;
      if(link)event.preventDefault();
      openProductionDetail(Number(el.dataset.productIndex||0));
    });
    el.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      openProductionDetail(Number(el.dataset.productIndex||0));
    });
  });
}
function renderProducts(filter){
  const recommendedGrid=document.getElementById('recommendedGallery');
  const galleryShell=document.getElementById('productionGalleryShell');
  if(!recommendedGrid)return;
  const sources={
    collections:collectionProducts,
    customised:customisedDesignProducts,
    featured:featuredCollectionProducts,
    wishlist:wishlistCollectionProducts
  };
  const source=(sources[activeGalleryView]||collectionProducts)();
  const filtered=filterProductionList(source);
  visibleProducts=filtered;
  document.getElementById('productionDetailView')?.setAttribute('hidden','');
  galleryShell?.removeAttribute('hidden');
  syncProductionControls(source,filtered);
  if(recommendedGrid&&activeGalleryView==='wishlist'){
    recommendedGrid.innerHTML='';
  }else if(recommendedGrid){
    recommendedGrid.innerHTML=filtered.length
      ? filtered.map(safeProductRecommendedCard).join('')
      : `<div class="empty-gallery-note">${
          productSearchQuery||currentFilter!=='All'||currentMaterialFilter!=='All'
            ? 'No productions match your search or filters.'
            : activeGalleryView==='wishlist'
              ? 'No wishlist products yet. Save products to see them here.'
              : activeGalleryView==='featured'
                ? 'No featured production records yet.'
                : 'No public gallery collections yet.'
        }</div>`;
  }
  renderWishlistShelf(activeGalleryView==='wishlist',filtered);
  updateGalleryTabs();
  lbProducts=filtered;
  bindProductCards(document.getElementById('production')||document);
  syncWishlistButtons();
}
document.querySelectorAll('[data-gallery-view]').forEach(button=>{
  button.addEventListener('click',()=>setGalleryView(button.dataset.galleryView));
});
document.getElementById('productionSearchInput')?.addEventListener('input',event=>{
  productSearchQuery=event.currentTarget.value;
  renderProducts(currentFilter);
});
document.getElementById('productionFilterToggle')?.addEventListener('click',event=>{
  const button=event.currentTarget;
  const panel=document.getElementById('productionFilterPanel');
  if(!panel)return;
  const open=panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden',!open);
  button.setAttribute('aria-expanded',open?'true':'false');
});
document.getElementById('productionClearFilters')?.addEventListener('click',clearProductionFilters);
document.getElementById('productionFilterPanel')?.addEventListener('click',event=>{
  const category=event.target.closest('[data-production-category]');
  if(category){
    currentFilter=category.dataset.productionCategory||'All';
    renderProducts(currentFilter);
    return;
  }
  const material=event.target.closest('[data-production-material]');
  if(material){
    currentMaterialFilter=material.dataset.productionMaterial||'All';
    renderProducts(currentFilter);
  }
});
async function startNonCriticalHomepageWork(){
  await loadProducts();
  registerProductRealtime();
  renderTurnstileNearForms();
}

function renderTurnstileNearForms(){
  const nodes=[...document.querySelectorAll('[data-turnstile]')];
  if(!nodes.length)return;
  if(!('IntersectionObserver' in window)){
    renderTurnstileWidgets(document);
    return;
  }
  const seen=new WeakSet();
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting||seen.has(entry.target))return;
      seen.add(entry.target);
      renderTurnstileWidgets(entry.target.closest('form')||document);
      observer.unobserve(entry.target);
    });
  },{rootMargin:'700px 0px'});
  nodes.forEach(node=>observer.observe(node));
}

/* Load Supabase & gallery only when user scrolls near the production section,
   or after 6s idle — whichever comes first. This avoids loading 51 KiB of
   supabase.min.js on initial page load, removing it from the critical path.
   Exception: if a product slug is present in the URL (shared link), start
   immediately so the product detail view opens without waiting for scroll. */
(function(){
  let started=false;
  function start(){
    if(started)return;
    started=true;
    if('requestIdleCallback' in window){
      requestIdleCallback(startNonCriticalHomepageWork,{timeout:3000});
    }else{
      startNonCriticalHomepageWork();
    }
  }
  /* If URL contains a product slug (shared link), load immediately */
  var hasProductInUrl=(function(){
    var params=new URLSearchParams(location.search);
    if(params.get('product'))return true;
    if(/(?:[?&]product=|#product=)([^&#]+)/.test(String(location.hash||'')))return true;
    return /\/products\/[^/?#]+/.test(location.pathname);
  })();
  if(hasProductInUrl){
    /* Scroll #production into view first so the detail renders in context,
       then kick off data loading right away — no idle/scroll delay. */
    const openSharedProduct=function(){
      document.getElementById('production')?.scrollIntoView({behavior:'instant',block:'start'});
      startNonCriticalHomepageWork();
      started=true;
    };
    if(document.readyState==='complete'){
      setTimeout(openSharedProduct,0);
    }else{
      window.addEventListener('load',openSharedProduct,{once:true});
    }
    return;
  }
  /* Trigger when gallery section is 200px away from viewport */
  const gallerySection=document.getElementById('production');
  if(gallerySection&&'IntersectionObserver' in window){
    const obs=new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting){obs.disconnect();start();}
    },{rootMargin:'200px 0px',threshold:0});
    obs.observe(gallerySection);
  }
  /* Safety fallback: start after 6s regardless */
  window.addEventListener('load',()=>setTimeout(start,6000),{once:true});
})();

/* ── Independent Turnstile bootstrap for the contact/quote form ──
   The gallery-section observer above only fires when #production
   scrolls into view. On product-detail pages or direct #contact
   links the user may never pass #production, so we watch the
   contact section separately and render the CAPTCHA widget as soon
   as it is 400 px from the viewport — no waiting for the gallery.  */
(function(){
  let contactTurnstileDone=false;
  function renderContactTurnstile(){
    if(contactTurnstileDone)return;
    contactTurnstileDone=true;
    ensureSiteConfig().then(()=>renderTurnstileWidgets(document.getElementById('contact')||document));
  }
  const contactSection=document.getElementById('contact');
  if(contactSection&&'IntersectionObserver' in window){
    const obs=new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting){obs.disconnect();renderContactTurnstile();}
    },{rootMargin:'400px 0px',threshold:0});
    obs.observe(contactSection);
  }else{
    /* No IntersectionObserver — render immediately after load */
    window.addEventListener('load',()=>setTimeout(renderContactTurnstile,500),{once:true});
  }
  /* Hard fallback: render after 3s even if section never intersects */
  window.addEventListener('load',()=>setTimeout(renderContactTurnstile,3000),{once:true});
})();
/* ─── PRODUCTION DETAIL MODAL ─── */
let lbProducts=[],lbIndex=0,lbImageIndex=0;
function closeLightbox(){
  const lightbox=document.getElementById('lightbox');
  lightbox?.classList.remove('open');
  lightbox?.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}
function openLightbox(index,imageIndex=0){
  if(!lbProducts.length)return;
  lbIndex=Math.max(0,Math.min(index,lbProducts.length-1));
  const mediaCount=productMediaList(lbProducts[lbIndex]||{}).length||1;
  lbImageIndex=Math.max(0,Math.min(Number(imageIndex)||0,mediaCount-1));
  updateLightbox();
  const lightbox=document.getElementById('lightbox');
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function openProductFullView(index,imageIndex=0){
  const product=products[index];
  if(!product)return;
  const existing=lbProducts.findIndex(item=>productSlug(item)===productSlug(product));
  if(existing>=0){
    openLightbox(existing,imageIndex);
    return;
  }
  lbProducts=[product,...lbProducts.filter(item=>productSlug(item)!==productSlug(product))];
  openLightbox(0,imageIndex);
}
function lightboxNav(d){
  if(!lbProducts.length)return;
  const product=lbProducts[lbIndex]||{};
  const mediaCount=productMediaList(product).length||1;
  if(mediaCount<2)return;
  lbImageIndex=(lbImageIndex+d+mediaCount)%mediaCount;
  updateLightbox();
}
function productEnquiryUrl(product){
  const phone=SBG_CFG.whatsappNumber||'918892181792';
  const text=encodeURIComponent(productQuoteMessage(product));
  return `https://wa.me/${phone}?text=${text}`;
}
function productMessageDetails(product){
  const specs=productSpecs(product)
    .filter(([label,value])=>value&&value!=='Date TBC')
    .map(([label,value])=>`${label}: ${value}`);
  return [
    `Product: ${product?.name||'Production Item'}`,
    ...specs
  ].join('\n');
}
function productQuoteMessage(product){
  return [
    'Hi S.B.G. Punching, I would like a quote for this product.',
    '',
    productMessageDetails(product),
    '',
    'Please share the best process, timeline, and quotation.',
    '',
    currentProductUrl(product)
  ].join('\n');
}
async function logQuoteClick(product){
  if(!product)return;
  const key=`sbg_quote_click_${productSlug(product)}`;
  const last=Number(sessionStorage.getItem(key)||0);
  if(Date.now()-last<3000)return;
  sessionStorage.setItem(key,String(Date.now()));

  /* ── Save gallery inquiry so it appears in the admin Inquiries panel ──
     The message embeds "Product URL:" and "Product Image:" lines which
     admin.js already strips from the display cell and uses for the
     Preview thumbnail + Link column.                                    */
  try{
    const productUrl=currentProductUrl(product);
    const productImg=productImage(product);
    const msg=[
      productMessageDetails(product),
      '',
      `Product URL: ${productUrl}`,
      productImg?`Product Image: ${productImg}`:'',
      'Contact details were not collected — gallery quote click.'
    ].filter(l=>l!=null).join('\n').trim();

    const payload={
      contact_name:'Gallery Visitor',
      company_name:'',
      phone:'',
      email:'',
      source:'production-gallery',
      service:product.name||'Production Item',
      message:msg,
      product_url:productUrl||'',
      captchaToken:''
    };

    /* Save gallery inquiries only through the serverless endpoint. */
    await postJson(serverlessEndpoint('submit-inquiry'),payload);
  }catch(err){
    console.warn('Gallery inquiry track failed:',err);
  }
}
function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim());
}
function loadLocalQuoteInquiries(){
  try{
    const rows=JSON.parse(localStorage.getItem(QUOTE_INQUIRY_STORAGE_KEY)||'[]');
    return Array.isArray(rows)?rows:[];
  }catch{
    return [];
  }
}
function saveLocalQuoteInquiry(payload){
  const localPayload={...payload};
  delete localPayload.captchaToken;
  const rows=loadLocalQuoteInquiries();
  rows.unshift({
    ...localPayload,
    id:`local-${Date.now()}`,
    created_at:new Date().toISOString(),
    status:'New',
    local_only:true
  });
  try{
    localStorage.setItem(QUOTE_INQUIRY_STORAGE_KEY,JSON.stringify(rows.slice(0,80)));
  }catch(error){
    console.warn('Local quote inquiry save failed:',error.message||error);
  }
}
function quoteContactMessage(product,details){
  const productUrl=currentProductUrl(product);
  return [
    productUrl,
    '',
    'New Production Gallery Quote Request',
    '',
    `Name: ${details.name}`,
    `Mobile: ${details.mobile}`,
    `Email: ${details.email}`,
    `City: ${details.city}`,
    '',
    productMessageDetails(product),
    `Description: ${details.description||'No description'}`
  ].filter(Boolean).join('\n');
}
function quoteMailUrl(product,details,provider='gmail'){
  const to=encodeURIComponent(QUOTE_EMAIL);
  const subject=encodeURIComponent(`Quote request - ${product?.name||'Production Item'}`);
  const body=encodeURIComponent(quoteContactMessage(product,details));
  switch(provider){
    case 'outlook':
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
    case 'yahoo':
      return `https://compose.mail.yahoo.com/?to=${to}&subject=${subject}&body=${body}`;
    case 'icloud':
      return 'https://www.icloud.com/mail/';
    case 'proton':
      return 'https://mail.proton.me/u/0/inbox#compose';
    case 'default':
      return `mailto:${QUOTE_EMAIL}?subject=${subject}&body=${body}`;
    case 'gmail':
    default:
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
  }
}
function quoteWhatsappUrl(product,details){
  const phone=SBG_CFG.whatsappNumber||QUOTE_WHATSAPP;
  return `https://wa.me/${phone}?text=${encodeURIComponent(quoteContactMessage(product,details))}`;
}
function galleryQuotePayload(product,details){
  const productUrl=currentProductUrl(product);
  const productImg=absoluteUrl(productImage(product))||productImage(product);
  const message=[
    'Source: Production Gallery',
    `Description: ${details.description||'No description'}`,
    '',
    productMessageDetails(product),
    '',
    `Name: ${details.name}`,
    `Mobile: ${details.mobile}`,
    `Email: ${details.email}`,
    `City: ${details.city}`,
    '',
    `Product URL: ${productUrl}`,
    productImg?`Product Image: ${productImg}`:''
  ].filter(Boolean).join('\n').trim();
  return {
    contact_name:details.name,
    company_name:`City: ${details.city}`,
    phone:details.mobile,
    email:details.email,
    source:'production-gallery-form',
    service:product?.name||'Production Item',
    message,
    product_url:productUrl||'',
    captchaToken:details.captchaToken||''
  };
}
async function saveGalleryQuoteInquiry(product,details){
  const payload=galleryQuotePayload(product,details);
  try{
    await postJson(serverlessEndpoint('submit-inquiry'),payload);
    return true;
  }catch(error){
    console.warn('Gallery quote endpoint insert failed:',error.message||error);
  }
  console.warn('Gallery quote was not saved in admin because the serverless inquiry endpoint failed.');
  return false;
}
let activeQuoteProduct=null;
let quotePreviousOverflow='';
function openProductQuoteModal(product){
  const modal=document.getElementById('quoteModal');
  const form=document.getElementById('quoteRequestForm');
  if(!modal||!form||!product)return;
  activeQuoteProduct=product;
  quotePreviousOverflow=document.body.style.overflow;
  document.getElementById('quoteProductName').textContent=product.name||'Production item';
  document.getElementById('quoteStatus').textContent='';
  form.reset();
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  renderTurnstileWidgets(modal);
  setTimeout(()=>document.getElementById('quoteName')?.focus(),30);
}
function closeProductQuoteModal(){
  const modal=document.getElementById('quoteModal');
  if(!modal)return;
  modal.setAttribute('hidden','');
  modal.setAttribute('aria-hidden','true');
  activeQuoteProduct=null;
  resetCaptcha('quote',modal);
  document.body.style.overflow=document.getElementById('lightbox')?.classList.contains('open')?'hidden':quotePreviousOverflow;
}
function quoteProductFromTrigger(trigger){
  const card=trigger.closest('[data-product-index]');
  if(card)return products[Number(card.dataset.productIndex||0)];
  if(document.getElementById('lightbox')?.contains(trigger))return lbProducts[lbIndex]||products[currentProductIndex];
  if(currentProductIndex>=0)return products[currentProductIndex];
  return null;
}
async function submitQuoteRequest(event){
  event.preventDefault();
  const form=event.currentTarget;
  const status=document.getElementById('quoteStatus');
  const channel=event.submitter?.dataset.quoteChannel||'whatsapp';
  const details={
    name:form.elements.name.value.trim().slice(0,140),
    mobile:form.elements.mobile.value.trim().slice(0,40),
    email:form.elements.email.value.trim().slice(0,180),
    city:form.elements.city.value.trim().slice(0,100),
    description:form.elements.description.value.trim().slice(0,700),
    mailProvider:form.elements.mail_provider?.value||'gmail',
    captchaToken:captchaToken('quote',document.getElementById('quoteModal')||document)
  };
  if(!activeQuoteProduct){status.textContent='Please choose a production item.';return}
  if(!details.name){status.textContent='Please enter your name.';return}
  if(!details.mobile||!validPhone(details.mobile)){status.textContent='Please enter a valid mobile number.';return}
  if(!details.email||!validEmail(details.email)){status.textContent='Please enter a valid email address.';return}
  if(!details.city){status.textContent='Please enter your city.';return}
  const destinationWindow=window.open('about:blank','_blank');
  if(destinationWindow)destinationWindow.opener=null;
  form.querySelectorAll('.quote-send').forEach(button=>{button.disabled=true;});
  status.textContent='Saving inquiry...';
  try{
    await saveGalleryQuoteInquiry(activeQuoteProduct,details);
    try{localStorage.setItem('sbg_last_inquiry',String(Date.now()));}catch(error){}
    status.textContent=channel==='email'?'Opening email...':'Opening WhatsApp...';
    const destination=channel==='email'?quoteMailUrl(activeQuoteProduct,details,details.mailProvider):quoteWhatsappUrl(activeQuoteProduct,details);
    if(destinationWindow){
      destinationWindow.location.href=destination;
    }else{
      window.open(destination,'_blank','noopener');
    }
    if(channel==='whatsapp')setTimeout(closeProductQuoteModal,500);
  }finally{
    form.querySelectorAll('.quote-send').forEach(button=>{button.disabled=false;});
  }
}
function bindQuoteRequestModal(){
  document.addEventListener('click',event=>{
    const close=event.target.closest('[data-close-quote]');
    if(close){
      event.preventDefault();
      closeProductQuoteModal();
      return;
    }
    const quote=event.target.closest('.product-quote-action,.shop-quote-btn');
    if(!quote)return;
    const product=quoteProductFromTrigger(quote);
    if(!product)return;
    event.preventDefault();
    event.stopPropagation();
    openProductQuoteModal(product);
  },true);
  document.getElementById('quoteRequestForm')?.addEventListener('submit',submitQuoteRequest);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!document.getElementById('quoteModal')?.hasAttribute('hidden'))closeProductQuoteModal();
  });
}
bindQuoteRequestModal();
function productShareMessage(product){
  const url=currentProductUrl(product);
  return [
    url,
    '',
    `${product?.name||'Production Item'} | S.B.G. Punching`,
    '',
    productMessageDetails(product)
  ].join('\n');
}
function productSharePayload(product){
  const name=product?.name||'S.B.G. Punching production item';
  return {
    title:`${name} | S.B.G. Punching`,
    text:productShareMessage(product),
    url:currentProductUrl(product)
  };
}
async function copyProductMessage(message,url){
  const text=[message,url].filter(Boolean).join('\n');
  if(navigator.clipboard&&window.isSecureContext){
    await navigator.clipboard.writeText(text);
    alert('Product message copied.');
    return;
  }
  window.prompt('Copy this product message:',text);
}
async function shareProduct(product){
  if(!product)return;
  const payload=productSharePayload(product);
  if(navigator.share){
    try{
      await navigator.share(payload);
      return;
    }catch(error){
      if(error?.name==='AbortError')return;
    }
  }
  try{
    await copyProductMessage(payload.text,payload.url);
  }catch(error){
    window.prompt('Copy this product message:',[payload.text,payload.url].filter(Boolean).join('\n'));
  }
}
function syncWishlistButtons(){
  document.querySelectorAll('[data-wishlist-slug]').forEach(button=>{
    const saved=productWishlist.has(button.dataset.wishlistSlug||'');
    button.classList.toggle('active',saved);
    button.setAttribute('aria-pressed',saved?'true':'false');
    const label=button.querySelector('[data-wishlist-label]');
    if(label)label.textContent=saved?'Wishlisted':'Wishlist';
  });
}
function toggleWishlist(product){
  if(!product)return;
  const slug=productSlug(product);
  if(productWishlist.has(slug))productWishlist.delete(slug);
  else productWishlist.add(slug);
  saveWishlistSlugs();
  if(activeGalleryView==='wishlist'){
    renderProducts(currentFilter);
    return;
  }
  renderWishlistShelf(false);
  bindProductCards(document.getElementById('wishlistShelf')||document);
  updateGalleryTabs();
  syncWishlistButtons();
}
function renderWishlistShelf(forceVisible=false,filteredItems=null){
  const shelf=document.getElementById('wishlistShelf');
  if(!shelf)return;
  const items=Array.isArray(filteredItems)?filteredItems:wishlistCollectionProducts();
  if(!forceVisible){
    shelf.setAttribute('hidden','');
    shelf.innerHTML='';
    return;
  }
  shelf.removeAttribute('hidden');
  shelf.innerHTML=`
    <div class="wishlist-shelf-head">
      <h3>Your Wishlist</h3>
      <span>${items.length} saved product${items.length===1?'':'s'}</span>
    </div>
    <div class="wishlist-grid">
      ${items.length?items.map(product=>{
        const index=productGlobalIndex(product);
        const image=productImage(product);
        const name=escHTML(product.name||'Production Item');
        return `<article class="wishlist-item" data-product-index="${index}" role="button" tabindex="0" aria-label="Open ${name}">
          ${image?`<img src="${image}" alt="${name}" loading="lazy" decoding="async" width="400" height="210" class="csp-inline-40">`:`<div class="wishlist-thumb">${escHTML(product.icon||'??')}</div>`}
          <strong>${name}</strong>
          <small>${escHTML(product.cat||'Production')}</small>
          <div class="product-card-actions">
            <a class="product-card-action product-quote-action" href="${productEnquiryUrl(product)}" target="_blank" rel="noopener noreferrer">Request Quote</a>
            <button class="product-card-action active" type="button" data-toggle-wishlist="${index}" data-wishlist-slug="${productSlug(product)}" aria-pressed="true"><span data-wishlist-label>Wishlisted</span></button>
            <button class="product-card-action product-share-action" type="button" data-share-product="${index}">Share</button>
          </div>
        </article>`;
      }).join(''):`<div class="empty-gallery-note">${productSearchQuery||currentFilter!=='All'||currentMaterialFilter!=='All'?'No wishlist products match your search or filters.':'No wishlist products yet. Tap Wishlist on any product to save it here.'}</div>`}
    </div>`;
}
function productImage(product){
  const media=productMediaList(product)[0];
  return safeUrl(media?.src||product?.image);
}
function productFeatures(product){
  const fromData=Array.isArray(product?.features)?product.features:[];
  const fromTags=Array.isArray(product?.tags)?product.tags:[];
  const fallback=[
    `${product?.cat||'Production'} job work`,
    product?.material?`${product.material} material support`:'Custom material support',
    product?.thickness?`${product.thickness} thickness capability`:'Thickness as per drawing',
    'Quality checked before dispatch'
  ];
  return [...new Set([...fromData,...fromTags,...fallback].filter(Boolean))].slice(0,8);
}
function formatProductDate(value){
  if(!value)return 'Date TBC';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Date TBC':date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function productSpecs(product){
  const qty=product.quantity?Number(product.quantity).toLocaleString('en-IN'):'On request';
  return [
    ['Category',product.cat||'Production'],
    ['Material',product.material||product.mat||'As required'],
    ['Thickness',product.thickness||'As required'],
    ['Quantity',qty],
    ['Status',product.status||'Live'],
    ['Date',formatProductDate(product.date)]
  ];
}
function closeProductionDetail(){
  closeProductionDetailViewOnly();
  setGalleryRoute();
  document.getElementById('production')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeProductionDetailViewOnly(){
  document.getElementById('productionDetailView')?.setAttribute('hidden','');
  document.getElementById('productionGalleryShell')?.removeAttribute('hidden');
  activeProductSlug='';
  currentProductIndex=-1;
  activeImageIndex=0;
  activeProductTab='description';
  document.title='S.B.G. Punching CNC Punching, Laser Cutting & Sheet Metal Fabrication';
  updateGalleryTabs();
}
function shopRelatedCard(product){
  const index=products.findIndex(item=>item.name===product.name&&item.cat===product.cat);
  const image=productImage(product);
  return `<article class="shop-related-card" data-shop-related="${Math.max(0,index)}" role="button" tabindex="0" aria-label="Open ${escHTML(product.name)}">
    ${image?`<img src="${image}" alt="${escHTML(product.name)}" loading="lazy" decoding="async">`:`<div class="shop-related-thumb">${escHTML(product.icon||'??')}</div>`}
    <strong>${escHTML(product.name||'Production Item')}</strong>
    <span>${escHTML(product.cat||'Production')}</span>
  </article>`;
}
const CANONICAL_ORIGIN='https://www.sbgpunching.in';
function siteOrigin(){
  if(location.protocol==='file:')return '';
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(location.host) ? location.origin : CANONICAL_ORIGIN;
}
function productionBasePath(){
  const path=location.pathname||'/';
  const productBaseIndex=path.indexOf('/products/');
  const base=productBaseIndex>=0
    ? path.slice(0,productBaseIndex)
    : path.replace(/\/(?:index\.html)?$/,'');
  const cleanBase=(base||'').replace(/\/$/,'');
  return cleanBase?`${cleanBase}/`:'/';
}
function currentProductUrl(product){
  const slug=encodeURIComponent(productSlug(product));
  if(location.protocol==='file:')return `${location.href.split(/[?#]/)[0]}?product=${slug}#production`;
  return `${siteOrigin()}${productionBasePath()}?product=${slug}#production`;
}
function setProductRoute(product, replace=false){
  if(!product||!window.history)return;
  const target=currentProductUrl(product);
  try{
    const url=new URL(target);
    const next=`${url.pathname}${url.search}${url.hash}`;
    const current=`${location.pathname}${location.search}${location.hash}`;
    if(next===current)return;
    history[replace?'replaceState':'pushState']({product:productSlug(product)},'',next);
  }catch(error){}
}
function absoluteUrl(value){
  const url=String(value||'').trim();
  if(!url||url.startsWith('data:'))return '';
  try{
    return new URL(url,location.origin).href;
  }catch(error){
    return '';
  }
}
function upsertMeta(selector,attrs){
  let node=document.querySelector(selector);
  if(!node){
    node=document.createElement('meta');
    document.head.append(node);
  }
  Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));
  return node;
}
function setGalleryRoute(replace=false){
  if(location.protocol==='file:'||!window.history)return;
  try{
    const next=`${productionBasePath()}#production`;
    history[replace?'replaceState':'pushState']({},'',next);
  }catch(error){}
}
window.addEventListener('popstate',()=>{
  if(openProductFromRoute())return;
  document.getElementById('productionDetailView')?.setAttribute('hidden','');
  document.getElementById('productionGalleryShell')?.removeAttribute('hidden');
});
function setProductMeta(product){
  const title=`${product.name||'Production Item'} | S.B.G. Punching`;
  const desc=(product.desc||`${product.cat||'Production'} showcase by S.B.G. Punching. Request a quote for CNC punching, laser cutting, bending, and fabrication.`).slice(0,155);
  const url=currentProductUrl(product);
  const image=absoluteUrl(productImage(product));
  const imageAlt=`${product.name||'Production item'} by S.B.G. Punching`;
  document.title=title;
  let meta=document.querySelector('meta[name="description"]');
  if(!meta){
    meta=document.createElement('meta');
    meta.name='description';
    document.head.append(meta);
  }
  meta.content=desc;
  let canonical=document.querySelector('link[rel="canonical"]');
  if(!canonical){
    canonical=document.createElement('link');
    canonical.rel='canonical';
    document.head.append(canonical);
  }
  canonical.href=url;
  upsertMeta('meta[property="og:title"]',{property:'og:title',content:title});
  upsertMeta('meta[property="og:description"]',{property:'og:description',content:desc});
  upsertMeta('meta[property="og:type"]',{property:'og:type',content:'product'});
  upsertMeta('meta[property="og:url"]',{property:'og:url',content:url});
  upsertMeta('meta[name="twitter:card"]',{name:'twitter:card',content:'summary_large_image'});
  upsertMeta('meta[name="twitter:title"]',{name:'twitter:title',content:title});
  upsertMeta('meta[name="twitter:description"]',{name:'twitter:description',content:desc});
  if(image){
    upsertMeta('meta[property="og:image"]',{property:'og:image',content:image});
    upsertMeta('meta[property="og:image:alt"]',{property:'og:image:alt',content:imageAlt});
    upsertMeta('meta[name="twitter:image"]',{name:'twitter:image',content:image});
  }
}
function openProductFromRoute(){
  const slug=routeProductSlug();
  if(!slug)return false;
  // Don't hide the gallery if products haven't loaded yet —
  // loadProducts() will call openProductFromRoute() again once data is ready
  if(!products.length)return false;
  const index=products.findIndex(product=>productSlug(product)===slug);
  if(index<0){
    // Slug not found — stale URL, clean it and show gallery
    if(!galleryHasMore)setGalleryRoute(true);
    return false;
  }
  openProductionDetail(index,{replace:true,scroll:true});
  return true;
}
function renderMainMedia(product){
  const media=productMediaList(product);
  const active=media[activeImageIndex]||media[0];
  if(active?.src){
    const isVideo=String(active.type||'').startsWith('video');
    return isVideo
      ? `<video src="${escHTML(active.src)}" controls playsinline preload="metadata"></video>`
      : `<img src="${escHTML(active.src)}" alt="${escHTML(active.alt||product.name||'Production item')}" decoding="async">`;
  }
  return escHTML(product.icon||'⚙️');
}
function renderThumbnails(product){
  const media=productMediaList(product);
  if(!media.length)return ['CNC','MS','QC','B2B'].map((label,index)=>`<button class="shop-thumb ${index===0?'active':''}" type="button">${label}</button>`).join('');
  return media.map((item,index)=>{
    const isVideo=String(item.type||'').startsWith('video');
    const content=isVideo?'▶':`<img src="${escHTML(item.src)}" alt="${escHTML(item.alt||product.name||'Production thumbnail')}" loading="lazy" decoding="async">`;
    return `<button class="shop-thumb ${index===activeImageIndex?'active':''}" type="button" data-thumb-index="${index}">${content}</button>`;
  }).join('');
}
function renderReviewPanel(product){
  const reviews=reviewsFor(product);
  const stats=reviewStats(product);
  const average=stats.count?stats.average.toFixed(1):'No ratings yet';
  const summary=stats.count
    ? `<span class="review-stars">${starText(stats.average)}</span><strong>${average}</strong><span>${stats.count} review${stats.count===1?'':'s'}</span>`
    : `<span class="review-stars">&#9734;&#9734;&#9734;&#9734;&#9734;</span><strong>No reviews yet</strong><span>Be the first customer to review this production.</span>`;
  const list=reviews.slice(0,8).map(review=>`
    <article class="review-item">
      <div><strong>${escHTML(review.reviewer_name||'Customer')}</strong> <span class="review-stars">${starText(review.rating)}</span></div>
      <span class="review-date">${review.created_at?formatProductDate(review.created_at):'Just now'}</span>
      <p>${escHTML(review.comment||'')}</p>
    </article>`).join('') || `<div class="review-item"><strong>No customer reviews yet.</strong><p>Share your experience with this production work.</p></div>`;
  return `
    <div class="review-summary">${summary}</div>
    <form class="review-form" data-review-form>
      <input name="reviewer_name" maxlength="80" required placeholder="Your name">
      <div class="review-rating-picker" aria-label="Rating">
        ${[1,2,3,4,5].map(value=>`<button class="${value<=pendingReviewRating?'active':''}" type="button" data-review-rating="${value}" aria-label="${value} star">${value<=pendingReviewRating?'&#9733;':'&#9734;'}</button>`).join('')}
      </div>
      <textarea name="comment" maxlength="700" required placeholder="Write your review"></textarea>
      <div class="captcha-field" data-turnstile="review"></div>
      <button class="review-submit" type="submit">Submit Review</button>
      <span class="review-status" data-review-status></span>
    </form>
    <div class="review-list">${list}</div>`;
}
async function submitReview(event,product){
  event.preventDefault();
  const form=event.currentTarget;
  const status=form.querySelector('[data-review-status]');
  const values=Object.fromEntries(new FormData(form).entries());
  const payload={
    product_slug:productReviewKey(product),
    rating:Math.max(1,Math.min(5,Number(pendingReviewRating)||5)),
    reviewer_name:String(values.reviewer_name||'').trim().slice(0,80),
    comment:String(values.comment||'').trim().slice(0,700)
  };
  if(payload.reviewer_name.length<2||payload.comment.length<3){
    status.textContent='Please add your name and review.';
    return;
  }
  if(turnstileEnabled()){
    status.textContent='Loading security check...';
    await renderTurnstileWidgets(form);
    if(!captchaReady('review',form)){
      captchaLoadMessage('review',form);
      status.textContent='Security check is not loading. Add this domain in Cloudflare Turnstile.';
      return;
    }
    const token=captchaToken('review',form);
    if(!token){
      if(!captchaHasVisibleWidget('review',form)){
        captchaLoadMessage('review',form,'Security check could not load. Add this domain in Cloudflare Turnstile.');
        status.textContent='Security check is not loading. Add this domain in Cloudflare Turnstile.';
        return;
      }
      status.textContent='Please complete the security check.';
      return;
    }
    payload.captchaToken=token;
  }
    status.textContent='Submitting review...';
    try{
    if(turnstileEnabled()){
      await postJson(serverlessEndpoint('submit-review'),payload);
    }else if(sbgClient){
      const {error}=await sbgClient.from('production_reviews').insert(payload);
      if(error)throw error;
      await loadReviews();
    }else{
      const row={...payload,created_at:new Date().toISOString(),approved:true};
      const key=payload.product_slug;
      productReviews[key]=[row,...(productReviews[key]||[])];
      saveFallbackReviews();
    }
  }catch(error){
    status.textContent=error.message||'Could not save review right now.';
    resetCaptcha('review',form);
    return;
  }
  pendingReviewRating=5;
  status.textContent=turnstileEnabled()?'Review submitted for approval.':'Review added.';
  form.reset();
  resetCaptcha('review',form);
  renderProducts(currentFilter);
  renderOpenProductDetail(false);
}
function renderTabPanels(product,specs){
  const features=productFeatures(product).map(feature=>`<li>${escHTML(feature)}</li>`).join('');
  const gallery=productMediaList(product);
  const galleryHtml=gallery.length
    ? gallery.map(item=>`<img src="${escHTML(item.src)}" alt="${escHTML(item.alt||product.name||'Production gallery image')}" loading="lazy" decoding="async">`).join('')
    : `<div class="shop-gallery-tile">${escHTML(product.icon||'??')}</div>`;
  const reviewPanel=renderReviewPanel(product);
  const stats=reviewStats(product);
  const reviewTabLabel=stats.count
    ? `Reviews & Rating <span class="review-tab-count">${stats.average.toFixed(1)}</span>`
    : `Reviews & Rating <span class="review-tab-count">0</span>`;
  return `
    <div class="shop-tab-row" role="tablist" aria-label="Product details">
      <button class="shop-tab ${activeProductTab==='description'?'active':''}" type="button" data-product-tab="description">Description</button>
      <button class="shop-tab ${activeProductTab==='specifications'?'active':''}" type="button" data-product-tab="specifications">Specifications</button>
      <button class="shop-tab ${activeProductTab==='features'?'active':''}" type="button" data-product-tab="features">Features</button>
      <button class="shop-tab ${activeProductTab==='gallery'?'active':''}" type="button" data-product-tab="gallery">Gallery</button>
      <button class="shop-tab ${activeProductTab==='reviews'?'active':''}" type="button" data-product-tab="reviews">${reviewTabLabel}</button>
    </div>
    <div class="shop-tab-panel ${activeProductTab==='description'?'active':''}" data-tab-panel="description">
      <p class="shop-description">${escHTML(product.desc||'Production details are available on request. Share your drawing, size, material, and quantity so S.B.G. Punching can confirm the right process and delivery timeline.')}</p>
    </div>
    <div class="shop-tab-panel ${activeProductTab==='specifications'?'active':''}" data-tab-panel="specifications">
      <ul class="shop-spec-list">${specs}</ul>
    </div>
    <div class="shop-tab-panel ${activeProductTab==='features'?'active':''}" data-tab-panel="features">
      <ul class="shop-feature-list">${features}</ul>
    </div>
    <div class="shop-tab-panel ${activeProductTab==='gallery'?'active':''}" data-tab-panel="gallery">
      <div class="shop-gallery-grid">${galleryHtml}</div>
    </div>
    <div class="shop-tab-panel ${activeProductTab==='reviews'?'active':''}" data-tab-panel="reviews">
      ${reviewPanel}
    </div>`;
}
function bindProductDetailInteractions(product){
  const detail=document.getElementById('productionDetailView');
  if(!detail)return;
  detail.querySelectorAll('[data-thumb-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      activeImageIndex=Number(button.dataset.thumbIndex||0);
      renderOpenProductDetail(false);
    });
  });
  detail.querySelectorAll('[data-product-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      activeProductTab=button.dataset.productTab||'description';
      renderOpenProductDetail(false);
    });
  });
  detail.querySelectorAll('[data-review-rating]').forEach(button=>{
    button.addEventListener('click',()=>{
      pendingReviewRating=Number(button.dataset.reviewRating)||5;
      renderOpenProductDetail(false);
    });
  });
  detail.querySelector('[data-review-form]')?.addEventListener('submit',event=>submitReview(event,product));
  detail.querySelectorAll('[data-full-view]').forEach(button=>{
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      openProductFullView(Number(button.dataset.fullView||currentProductIndex||0),activeImageIndex);
    });
  });
  detail.querySelectorAll('[data-toggle-wishlist]').forEach(button=>{
    button.addEventListener('click',event=>{
      event.preventDefault();
      toggleWishlist(product);
    });
  });
  detail.querySelectorAll('[data-share-product]').forEach(button=>{
    button.addEventListener('click',event=>{
      event.preventDefault();
      shareProduct(product);
    });
  });
  detail.querySelectorAll('.shop-quote-btn,.product-quote-action').forEach(link=>{
    link.addEventListener('click',()=>logQuoteClick(product));
  });
  const zoom=detail.querySelector('.shop-main-image');
  if(zoom){
    zoom.addEventListener('click',()=>zoom.classList.toggle('zoomed'));
    zoom.addEventListener('mousemove',event=>{
      const rect=zoom.getBoundingClientRect();
      zoom.style.setProperty('--zoom-x',`${((event.clientX-rect.left)/rect.width)*100}%`);
      zoom.style.setProperty('--zoom-y',`${((event.clientY-rect.top)/rect.height)*100}%`);
    });
    zoom.addEventListener('mouseleave',()=>zoom.classList.remove('zoomed'));
  }
  detail.querySelectorAll('[data-back-gallery]').forEach(btn=>btn.addEventListener('click',closeProductionDetail));
  detail.querySelectorAll('[data-shop-related]').forEach(card=>{
    const openRelated=()=>openProductionDetail(Number(card.dataset.shopRelated||0));
    card.addEventListener('click',openRelated);
    card.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      openRelated();
    });
  });
}
function renderOpenProductDetail(shouldScroll=true){
  if(currentProductIndex<0)return;
  const product=products[currentProductIndex];
  const detail=document.getElementById('productionDetailView');
  if(!product||!detail)return;
  document.getElementById('productionGalleryShell')?.setAttribute('hidden','');
  detail.removeAttribute('hidden');
  const specs=productSpecs(product).map(([label,value])=>`<li><span>${escHTML(label)}</span><strong>${escHTML(value)}</strong></li>`).join('');
  const related=relatedProducts(product);
  const slug=productSlug(product);
  const saved=isWishlisted(product);
  detail.innerHTML=`
    <nav class="shop-breadcrumb" aria-label="Breadcrumb">Home / Production Gallery / ${escHTML(product.cat||'Production')} / ${escHTML(product.name||'Production Item')}</nav>
    <button class="shop-back" type="button" data-back-gallery>← Back to Production Gallery</button>
    <article class="shop-detail-shell" itemscope itemtype="https://schema.org/Product">
      <meta itemprop="name" content="${escHTML(product.name||'Production Item')}">
      <meta itemprop="description" content="${escHTML(product.desc||'Production showcase by S.B.G. Punching')}">
      <div class="shop-detail-grid">
        <div class="shop-media-pane">
          <div class="shop-media-frame">
            <div class="shop-main-image" aria-label="Click to zoom">${renderMainMedia(product)}</div>
            <button class="product-full-view" type="button" data-full-view="${currentProductIndex}" aria-label="Full view ${escHTML(product.name||'Production Item')}" title="Full view">${fullViewIcon()}</button>
            <button class="product-full-view shop-share-floating" type="button" data-share-product="${currentProductIndex}" aria-label="Share ${escHTML(product.name||'Production Item')}" title="Share product">↗</button>
          </div>
          <div class="shop-thumb-row">${renderThumbnails(product)}</div>
        </div>
        <div class="shop-info-pane">
          <h3 itemprop="name">${escHTML(product.name||'Production Item')}</h3>
          <span class="shop-rating">${reviewStats(product).count?`${reviewStats(product).average.toFixed(1)} &#9733;`:'No ratings'}</span><span class="shop-status">${escHTML(product.status||'Available')}</span>
          <p class="shop-description">${escHTML(product.desc||'Production details are available on request. Share your drawing, size, material, thickness, and quantity so S.B.G. Punching can confirm the right process and delivery timeline.')}</p>
          <div class="shop-action-row">
            <a class="shop-quote-btn" href="${productEnquiryUrl(product)}" target="_blank" rel="noopener noreferrer">Request Quote</a>
            <button class="${saved?'active':''}" type="button" data-toggle-wishlist="${currentProductIndex}" data-wishlist-slug="${slug}" aria-pressed="${saved?'true':'false'}"><span data-wishlist-label>${saved?'Wishlisted':'Wishlist'}</span></button>
            <button class="shop-share-btn" type="button" data-share-product="${currentProductIndex}">Share Product</button>
            <a class="shop-contact-btn" href="#contact">Contact Us</a>
          </div>
          ${renderTabPanels(product,specs)}
        </div>
      </div>
      ${related.length?`<div class="shop-related"><h4>Other Product Collections</h4><div class="shop-related-grid">${related.map(shopRelatedCard).join('')}</div></div>`:''}
    </article>`;
  bindProductDetailInteractions(product);
  renderTurnstileWidgets(detail);
  if(shouldScroll)detail.scrollIntoView({behavior:'smooth',block:'start'});
}
function openProductionDetail(index){
  const product=products[index];
  const detail=document.getElementById('productionDetailView');
  if(!product||!detail)return;
  const options=arguments[1]||{};
  currentProductIndex=index;
  activeProductSlug=productSlug(product);
  activeImageIndex=0;
  activeProductTab=options.tab||'description';
  setProductMeta(product);
  setProductRoute(product,Boolean(options.replace));
  document.getElementById('productionGalleryShell')?.setAttribute('hidden','');
  detail.removeAttribute('hidden');
  renderOpenProductDetail(options.scroll!==false);
}
function relatedProducts(product){
  const currentName=product?.name||'';
  const sameCategory=products.filter(item=>item.name!==currentName&&item.cat===product.cat);
  const others=products.filter(item=>item.name!==currentName&&item.cat!==product.cat);
  return [...sameCategory,...others].slice(0,30);
}
function relatedCard(product){
  const index=products.findIndex(item=>item.name===product.name);
  const image=productImage(product);
  return `<article class="related-card" data-related-index="${Math.max(0,index)}" role="button" tabindex="0" aria-label="View ${escHTML(product.name)}">
    ${image?`<img src="${image}" alt="${escHTML(product.name)}" loading="lazy" decoding="async">`:`<div class="related-thumb">${escHTML(product.icon||'??')}</div>`}
    <div><span>${escHTML(product.cat||'Production')}</span><strong>${escHTML(product.name||'Production Item')}</strong><p>${escHTML(product.mat||'')}</p></div>
  </article>`;
}
function openRelatedProduct(index){
  const product=products[index];
  if(!product)return;
  if(document.getElementById('lightbox').classList.contains('open')){
    openProductFullView(index,0);
    return;
  }
  openProductionDetail(index);
}
function updateLightbox(){
  if(!lbProducts.length)return;
  const product=lbProducts[lbIndex]||{};
  const media=productMediaList(product);
  const activeMedia=media[lbImageIndex]||media[0]||{};
  const image=safeUrl(activeMedia.src||productImage(product));
  const isVideo=String(activeMedia.type||'').startsWith('video');
  const specs=productSpecs(product).map(([label,value])=>`<div><span>${escHTML(label)}</span><strong>${escHTML(value)}</strong></div>`).join('');
  const tags=(product.tags||[]).slice(0,5).map(tag=>`<span>${escHTML(tag)}</span>`).join('');
  const related=relatedProducts(product);
  document.querySelectorAll('.lb-nav').forEach(button=>{button.disabled=media.length<2});
  document.getElementById('productDetail').innerHTML=`
    <article class="product-detail-modal">
      <div class="product-detail-main">
        <div class="product-detail-media">
          ${image
            ? isVideo
              ? `<video src="${escHTML(image)}" controls playsinline preload="metadata"></video>`
              : `<img src="${escHTML(image)}" alt="${escHTML(activeMedia.alt||product.name||'Production item')}">`
            : escHTML(product.icon||'??')}
        </div>
        <div class="product-detail-copy">
          <span class="prod-cat">${escHTML(product.cat||'Production')}</span>
          <h3>${escHTML(product.name||'Production Item')}</h3>
          <p>${escHTML(product.desc||'Production details are available on request. Share your requirement and S.B.G. Punching will confirm the process, material, and delivery timeline.')}</p>
          ${media.length>1?`<div class="lb-counter">Image ${lbImageIndex+1} of ${media.length}</div>`:''}
          <div class="product-specs">${specs}</div>
          ${tags?`<div class="tag-row">${tags}</div>`:''}
          <div class="product-detail-actions">
            <a class="product-quote-action" href="${productEnquiryUrl(product)}" target="_blank" rel="noopener noreferrer">Enquire on WhatsApp</a>
            <button type="button" data-close-lightbox>Back to Gallery</button>
          </div>
        </div>
      </div>
      ${related.length?`<div class="related-products"><h4>Similar Productions</h4><div class="related-grid">${related.map(relatedCard).join('')}</div></div>`:''}
    </article>`;
  document.querySelectorAll('[data-related-index]').forEach(card=>{
    const openRelated=()=>openRelatedProduct(Number(card.dataset.relatedIndex||0));
    card.addEventListener('click',openRelated);
    card.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      openRelated();
    });
  });
}
document.addEventListener('keydown',e=>{
  if(!document.getElementById('lightbox').classList.contains('open'))return;
  if(e.key==='Escape')closeLightbox();
  if(e.key==='ArrowLeft')lightboxNav(-1);
  if(e.key==='ArrowRight')lightboxNav(1);
});

/* --- SECURE ENQUIRY FORM --- */
function validPhone(value){return /^[+()\-\s0-9]{7,40}$/.test(value)}
async function submitForm(){
  const button=document.querySelector('.btn-submit');
  const name=document.getElementById('fname').value.trim().slice(0,140);
  const phone=document.getElementById('fphone').value.trim().slice(0,40);
  const service=document.getElementById('fservice').value.trim().slice(0,120);
  const message=document.getElementById('fmessage').value.trim().slice(0,1200);
  if(!name){alert('Please enter your name.');return}
  if(!phone||!validPhone(phone)){alert('Please enter a valid phone number.');return}
  if(!service){alert('Please select a service.');return}
  if(!message){alert('Please describe your requirement.');return}

  /* Cloudflare Turnstile guard — block submit if user hasn't completed the challenge */
  if(turnstileEnabled()){
    const captchaNode=document.querySelector('[data-turnstile="inquiry"]');
    const captchaStatus=captchaNode?.dataset.turnstileStatus;
    if(!captchaStatus||captchaStatus==='expired'){
      let err=document.getElementById('captchaError');
      if(!err){
        err=document.createElement('p');
        err.id='captchaError';
        err.className='captcha-error';
        captchaNode?.insertAdjacentElement('afterend',err);
      }
      err.textContent=captchaStatus==='expired'
        ?'Security check expired — please tick it again before sending.'
        :'Please complete the security check before sending.';
      setTimeout(()=>err.remove(),5000);
      if(button){button.disabled=false;button.textContent='Send Enquiry via WhatsApp →'}
      return;
    }
  }

  const lastSubmit=Number(localStorage.getItem('sbg_last_inquiry')||0);
  if(Date.now()-lastSubmit<20000){alert('Please wait a few seconds before sending another enquiry.');return}

  const company=document.getElementById('fcompany').value.trim().slice(0,140);
  const email=document.getElementById('femail').value.trim().slice(0,180);
  const material=document.getElementById('fmaterial').value.trim().slice(0,160);
  const fullMessage=material?`Material: ${material}\n${message}`:message;
  const captchaTokenValue=captchaToken('inquiry',document);
  if(button){button.disabled=true;button.textContent='Sending...'}
  const waMsg=encodeURIComponent(
    `Hi Team, New Enquiry - SBG Website\n\n`+
    `Name: ${name}\n`+
    `Company: ${company||'N/A'}\n`+
    `Phone: ${phone}\n`+
    `Email: ${email||'N/A'}\n`+
    `Service: ${service}\n`+
    `Material: ${material||'N/A'}\n`+
    `Message: ${message}`
  );
  const openInquiryWhatsapp=()=>{
    window.open(`https://wa.me/${SBG_CFG.whatsappNumber||'918892181792'}?text=${waMsg}`,'_blank','noopener');
    document.getElementById('formBody')?.setAttribute('hidden','');
    document.getElementById('formSuccess')?.removeAttribute('hidden');
  };

  try{
    const inquiryPayload={
      company_name:company,
      contact_name:name,
      phone,
      email,
      service,
      message:fullMessage,
      source:'contact-section',
      captchaToken:captchaTokenValue
    };
    /* Save only through the serverless endpoint so Turnstile is verified server-side. */
    await postJson(serverlessEndpoint('submit-inquiry'),inquiryPayload);
    localStorage.setItem('sbg_last_inquiry',String(Date.now()));
    resetCaptcha('inquiry',document);
    openInquiryWhatsapp();
  }catch(error){
    console.warn('Inquiry log failed, opening WhatsApp instead:',error);
    resetCaptcha('inquiry',document);
    localStorage.setItem('sbg_last_inquiry',String(Date.now()));
    openInquiryWhatsapp();
  }finally{
    if(button){button.disabled=false;button.textContent='Send Enquiry via WhatsApp →'}
  }
}
