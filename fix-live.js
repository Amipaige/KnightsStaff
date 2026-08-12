// Live fixes for the shared Supabase stock database.
(function () {
  const URL = 'https://jpjrsndbjklecvwiuvbf.supabase.co/rest/v1/products?select=*&order=name';
  const KEY = 'sb_publishable_3xafRje7lv0WNnV1wkdU4Q_Yo3NYrW7';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let liveProducts = [];

  function installHeaderLogo() {
    const header = document.querySelector('.header');
    if (!header) return;
    if (header.querySelector('.live-brand-logo')) return;
    const brand = header.querySelector('.brand');
    const small = header.querySelector('.small');
    const img = document.createElement('img');
    img.className = 'live-brand-logo';
    img.src = 'logo-exact.svg?v=9';
    img.alt = 'Knights Mobile Bars';
    img.onerror = function () { this.style.display = 'none'; };
    header.insertBefore(img, brand);
    const style = document.createElement('style');
    style.textContent = '.live-brand-logo{display:block;width:125px;height:125px;object-fit:contain;margin:0 auto 8px;background:#fff;border-radius:10px;padding:6px}.header{text-align:center}.header .brand{font-size:24px}.header .small{margin-top:3px}';
    document.head.appendChild(style);
  }

  async function fetchProducts() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(URL, {headers:{apikey:KEY,Authorization:'Bearer '+KEY},cache:'no-store',signal:controller.signal});
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch (_) { data = null; }
      if (!r.ok) throw new Error(data?.message || data?.hint || ('HTTP '+r.status));
      if (!Array.isArray(data)) throw new Error('Unexpected response from stock database.');
      return data;
    } finally { clearTimeout(timer); }
  }

  function renderLive() {
    const received = liveProducts.reduce((a,p)=>a+Number(p.stock_received||0),0);
    const sold = liveProducts.reduce((a,p)=>a+Number(p.stock_sold||0),0);
    if ($('received')) $('received').textContent = received;
    if ($('sold')) $('sold').textContent = sold;
    if ($('expected')) $('expected').textContent = received-sold;
    if ($('count')) $('count').textContent = liveProducts.length;
    const rows = $('rows');
    if (!rows) return;
    rows.innerHTML = liveProducts.length ? liveProducts.map(p => {
      const received=Number(p.stock_received||0), sold=Number(p.stock_sold||0), physical=p.physical_stock;
      return `<tr><td>${esc(p.name)}</td><td>${received}</td><td><input class="live-sold" data-id="${esc(p.id)}" type="number" min="0" value="${sold}" style="width:75px"></td><td>${received-sold}</td><td><button class="secondary live-save" data-id="${esc(p.id)}">Save</button></td></tr>`;
    }).join('') : '<tr><td colspan="5">No stock yet.</td></tr>';
    rows.onclick = async e => {
      if (!e.target.classList.contains('live-save')) return;
      const id=e.target.dataset.id, input=rows.querySelector(`.live-sold[data-id="${id}"]`), value=Math.max(0,Number(input.value)||0);
      e.target.disabled=true;
      try {
        const r=await fetch('https://jpjrsndbjklecvwiuvbf.supabase.co/rest/v1/products?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({stock_sold:value})});
        if(!r.ok) throw new Error(await r.text());
        await window.liveLoad();
      } catch(err){ alert('Could not save stock: '+err.message); e.target.disabled=false; }
    };
  }

  window.liveLoad = async function () {
    installHeaderLogo();
    const status=$('connection');
    if(status) status.textContent='Connecting to shared stock…';
    try {
      liveProducts=await fetchProducts();
      window.products=liveProducts;
      if(status) status.textContent='✓ Shared stock connected ('+liveProducts.length+' products)';
      renderLive();
    } catch(err) {
      if(status) status.textContent='Database connection failed: '+(err.name==='AbortError'?'request timed out after 10 seconds':err.message);
      console.error('KnightsStock database error',err);
    }
  };

  function replaceAddStockConfirm() {
    const old = $('confirm');
    if(!old || old.dataset.liveFixed) return;
    old.dataset.liveFixed='1';
    old.onclick=async function(){
      if(!window.pending || !window.pending.length){ alert('No stock lines to add.'); return; }
      for(const x of window.pending){ if(x.type==='spirit'&&!x.bottleMl){alert('Enter bottle size for '+x.name);return;} }
      old.disabled=true;
      try {
        for(const x of window.pending){
          const units=Number(x.units)||0; if(!units) continue;
          const name=String(x.name).trim();
          const existing=liveProducts.find(p=>String(p.name||'').trim().toLowerCase()===name.toLowerCase());
          if(existing){
            const r=await fetch('https://jpjrsndbjklecvwiuvbf.supabase.co/rest/v1/products?id=eq.'+encodeURIComponent(existing.id),{method:'PATCH',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({stock_received:Number(existing.stock_received||0)+units})});
            if(!r.ok) throw new Error(await r.text());
          } else {
            const r=await fetch('https://jpjrsndbjklecvwiuvbf.supabase.co/rest/v1/products',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({name,category:x.type==='spirit'?'Spirits':'Other',unit:x.type==='spirit'?'shots':'unit',stock_received:units,stock_sold:0,physical_stock:units,low_stock_level:0})});
            if(!r.ok) throw new Error(await r.text());
          }
        }
        $('modal').style.display='none'; $('status').textContent='✓ Stock added successfully.'; window.pending=[]; await window.liveLoad();
      } catch(err){ alert('Could not add stock: '+err.message); } finally { old.disabled=false; }
    };
  }

  function start() {
    installHeaderLogo();
    replaceAddStockConfirm();
    window.load = window.liveLoad;
    const app=$('app');
    if(app && app.style.display!=='none' && sessionStorage.getItem('k')==='1') window.liveLoad();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
