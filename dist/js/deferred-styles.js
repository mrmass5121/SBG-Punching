(function(){
  const applyDeferredStyles=()=>{const style=document.getElementById('deferredStyles');if(style)style.media='all';};
  if('requestAnimationFrame' in window){
    requestAnimationFrame(()=>requestAnimationFrame(applyDeferredStyles));
  }else{
    setTimeout(applyDeferredStyles,0);
  }
})();
