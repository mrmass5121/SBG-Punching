(function(){
  function setMenu(open){
    const menu=document.getElementById('mobileMenu');
    const overlay=document.getElementById('mobileOverlay');
    menu?.toggleAttribute('hidden',!open);
    overlay?.toggleAttribute('hidden',!open);
    menu?.classList.toggle('open',open);
    overlay?.classList.toggle('open',open);
    document.querySelector('.hamburger')?.setAttribute('aria-expanded',open?'true':'false');
  }

  window.openMobileMenu=window.openMobileMenu||function(){setMenu(true);};
  window.closeMobileMenu=window.closeMobileMenu||function(){setMenu(false);};
  window.loadMoreProducts=window.loadMoreProducts||function(){window.__sbgLoadMoreRequested=true;window.__loadSbgApp?.();};
  window.closeLightbox=window.closeLightbox||function(){
    const lightbox=document.getElementById('lightbox');
    lightbox?.classList.remove('open');
    lightbox?.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };
  window.lightboxNav=window.lightboxNav||function(){};
  window.submitForm=window.submitForm||function(){
    window.__sbgSubmitRequested=true;
    const button=document.querySelector('.btn-submit');
    if(button){button.disabled=true;button.textContent='Loading form...';}
    window.__loadSbgApp?.();
  };

  window.__loadSbgApp=window.__loadSbgApp||function(){
    if(window.__sbgAppLoaded||window.__sbgAppLoading)return;
    window.__sbgAppLoading=true;
    const script=document.createElement('script');
    script.src='js/home-deferred.js';
    script.defer=true;
    script.onload=function(){
      window.__sbgAppLoaded=true;
      window.__sbgAppLoading=false;
      if(window.__sbgLoadMoreRequested&&typeof window.loadMoreProducts==='function')setTimeout(()=>window.loadMoreProducts(),0);
      if(window.__sbgSubmitRequested&&typeof window.submitForm==='function')setTimeout(()=>window.submitForm(),0);
    };
    script.onerror=function(){
      window.__sbgAppLoading=false;
      console.warn('Homepage app script failed to load.');
    };
    document.body.appendChild(script);
  };

  document.addEventListener('click',event=>{
    if(event.target.closest('[data-open-mobile-menu]')){
      event.preventDefault();
      window.openMobileMenu();
      return;
    }
    if(event.target.closest('[data-close-mobile-menu]')){
      window.closeMobileMenu();
      return;
    }
    if(event.target.closest('[data-load-more]')){
      event.preventDefault();
      window.loadMoreProducts();
      return;
    }
    if(event.target.closest('[data-submit-inquiry]')){
      event.preventDefault();
      window.submitForm();
      return;
    }
    const nav=event.target.closest('[data-lightbox-nav]');
    if(nav){
      event.stopPropagation();
      window.lightboxNav(Number(nav.dataset.lightboxNav)||0);
      return;
    }
    if(event.target.closest('[data-close-lightbox]')){
      event.preventDefault();
      window.closeLightbox();
      return;
    }
    if(event.target.closest('[data-stop-lightbox]')){
      event.stopPropagation();
    }
  });


  document.querySelectorAll('img[data-fallback-src]').forEach(img=>{
    img.addEventListener('error',()=>{
      const fallback=img.dataset.fallbackSrc;
      if(!fallback||img.dataset.fallbackApplied==='true')return;
      img.dataset.fallbackApplied='true';
      img.src=fallback;
    });
  });  const hasProductUrl=(function(){
    const p=new URLSearchParams(location.search);
    const hashProduct=String(location.hash||'').match(/(?:[?&]product=|#product=)([^&#]+)/);
    return p.get('product')||hashProduct?.[1]||/\/products\/[^/?#]+/.test(location.pathname);
  })();
  const schedule=()=>{
    const load=()=>window.__loadSbgApp();
    if(hasProductUrl){
      load();
    }else if('requestIdleCallback' in window){
      requestIdleCallback(load,{timeout:4000});
    }else{
      setTimeout(load,2000);
    }
  };
  if(document.readyState==='complete')setTimeout(schedule,hasProductUrl?0:1000);
  else window.addEventListener('load',()=>setTimeout(schedule,hasProductUrl?0:1000),{once:true});
})();