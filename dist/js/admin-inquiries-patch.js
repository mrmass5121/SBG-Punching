(function(){
    const key='sbg_local_quote_inquiries';
    const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    let remoteInquiries=[];
    let patching=false;
    const productUrl=item=>{
      const direct=String(item.product_url||'').trim();
      const match=String(item.message||'').match(/Product URL:\s*(https?:\/\/\S+)/i);
      return direct||(match?match[1]:'');
    };
    const productImage=item=>{
      const match=String(item.message||'').match(/Product Image:\s*(\S+)/i);
      return match?match[1]:'';
    };
    const previewCell=item=>{
      const image=productImage(item);
      return image
        ? `<span class="table-thumb"><img src="${esc(image)}" alt="${esc(item.service||'Production preview')}" loading="lazy" decoding="async"></span>`
        : `<span class="table-thumb empty"><i data-lucide="image-off"></i></span>`;
    };
    const descriptionOnly=value=>{
      const text=String(value||'').trim();
      const description=text.match(/Description:\s*([\s\S]*?)(?:\s+Product:|\s+Category:|\s+Name:|\s+Mobile:|\s+Product URL:|\s+Product Image:|$)/i);
      if(description&&description[1].trim())return description[1].trim().replace(/^No description$/i,'No description').slice(0,260);
      if(/Source:\s*Production Gallery/i.test(text))return 'No description';
      return text
        .split(/\r?\n/)
        .map(line=>line.trim())
        .filter(line=>line&&!/^Product URL:/i.test(line)&&!/^Product Image:/i.test(line))
        .join(' ')
        .slice(0,260);
    };
    function matchingRemoteInquiry(row){
      const contact=(row.children[1]?.textContent||'').toLowerCase();
      const service=(row.children[3]?.textContent||'').trim().toLowerCase();
      return remoteInquiries.find(item=>{
        const phone=String(item.phone||'').toLowerCase();
        const email=String(item.email||'').toLowerCase();
        const itemService=String(item.service||'').trim().toLowerCase();
        const phoneMatch=!phone||contact.includes(phone);
        const emailMatch=!email||contact.includes(email);
        const serviceMatch=!service||!itemService||service.includes(itemService)||itemService.includes(service);
        return serviceMatch&&(phoneMatch||emailMatch);
      });
    }
    function patchRemoteDescriptions(){
      if(!remoteInquiries.length)return;
      document.querySelectorAll('#inquiryRows tr:not([data-local-inquiry])').forEach(row=>{
        const item=matchingRemoteInquiry(row);
        const message=row.children[5];
        const source=row.children[2];
        if(!item||!message)return;
        message.textContent=descriptionOnly(item.message);
        if(source&&/production-gallery/i.test(String(item.source||''))){
          source.textContent='Production Gallery';
        }
      });
    }
    async function loadRemoteInquiries(){
      const cfg=window.SBG_CONFIG||{};
      if(!window.supabase||!cfg.supabaseUrl||!cfg.supabaseAnonKey)return;
      try{
        const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
          auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
        });
        const {data,error}=await client.from('inquiries').select('*').order('created_at',{ascending:false}).limit(80);
        if(error)throw error;
        remoteInquiries=data||[];
        patchRemoteDescriptions();
      }catch(error){
        console.warn('Inquiry description patch failed:',error.message||error);
      }
    }
    function patchSourceLabels(){
      document.querySelectorAll('#inquiryRows tr').forEach(row=>{
        const source=row.children[2];
        const message=row.children[5];
        if(source&&message&&/Source:\s*Production Gallery/i.test(message.textContent)){
          source.textContent='Production Gallery';
        }
        if(message)message.textContent=descriptionOnly(message.textContent);
      });
      patchRemoteDescriptions();
    }
    function removeLocalInquiries(){
      const tbody=document.getElementById('inquiryRows');
      if(!tbody||patching)return;
      patching=true;
      try{localStorage.removeItem(key);}catch(error){}
      tbody.querySelectorAll('[data-local-inquiry]').forEach(row=>row.remove());
      patchSourceLabels();
      window.lucide?.createIcons();
      patching=false;
    }
    document.addEventListener('DOMContentLoaded',()=>{
      removeLocalInquiries();
      loadRemoteInquiries();
      [600,1500,3000].forEach(delay=>setTimeout(removeLocalInquiries,delay));
      [800,1800,3200].forEach(delay=>setTimeout(loadRemoteInquiries,delay));
      const tbody=document.getElementById('inquiryRows');
      if(tbody){
        const observer=new MutationObserver(()=>setTimeout(()=>{removeLocalInquiries();patchRemoteDescriptions();},80));
        observer.observe(tbody,{childList:true});
      }
      document.getElementById('refreshInquiries')?.addEventListener('click',()=>setTimeout(()=>{loadRemoteInquiries();removeLocalInquiries();},500));
    });
  })();
