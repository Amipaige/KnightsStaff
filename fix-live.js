// Knights Stock Control - live database + invoice fixes
(function () {
  const BASE='https://jpjrsndbjklecvwiuvbf.supabase.co/rest/v1/stock_products';
  const KEY='sb_publishable_3xafRje7lv0WNnV1wkdU4Q_Yo3NYrW7';
  const MEASURE=25;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let liveProducts=[];
  let livePending=[];

  function installLogo(){const header=$('.header');if(!header||header.querySelector('.live-brand-logo'))return;const img=document.createElement('img');img.className='live-brand-logo';img.src='logo-exact.svg?v=14';img.alt='Knights Mobile Bars';const brand=header.querySelector('.brand');header.insertBefore(img,brand);const st=document.createElement('style');st.textContent='.live-brand-logo{display:block;width:155px;height:155px;object-fit:contain;margin:0 auto 2px}.header{text-align:center}.header .brand{display:none}.header .small{margin-top:0}';document.head.appendChild(st)}

  async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',...(opts.headers||{})},cache:'no-store'});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}if(!r.ok)throw new Error(d?.message||d?.hint||d||('HTTP '+r.status));return d}
  async function loadProducts(){return api(BASE+'?select=*&order=name')}
  function render(){const received=liveProducts.reduce((a,p)=>a+Number(p.received||0),0),sold=liveProducts.reduce((a,p)=>a+Number(p.sold||0),0);if($('received'))$('received').textContent=received;if($('sold'))$('sold').textContent=sold;if($('expected'))$('expected').textContent=received-sold;if($('count'))$('count').textContent=liveProducts.length;const rows=$('rows');if(!rows)return;rows.innerHTML=liveProducts.length?liveProducts.map(p=>{const r=Number(p.received||0),s=Number(p.sold||0);return `<tr><td>${esc(p.name)}</td><td>${r}</td><td><input class="live-sold" data-id="${esc(p.id)}" type="number" min="0" value="${s}" style="width:75px"></td><td>${r-s}</td><td><button class="secondary live-save" data-id="${esc(p.id)}">Save</button></td></tr>`}).join(''):'<tr><td colspan="5">No stock yet.</td></tr>';rows.onclick=async e=>{if(!e.target.classList.contains('live-save'))return;const id=e.target.dataset.id,v=Math.max(0,Number(rows.querySelector(`.live-sold[data-id="${id}"]`).value)||0);e.target.disabled=true;try{await api(BASE+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({sold:v})});await liveLoad()}catch(err){alert('Could not save stock: '+err.message);e.target.disabled=false}}}
  window.liveLoad=async function(){installLogo();const status=$('connection');if(status)status.textContent='Connecting to shared stock…';try{liveProducts=await loadProducts();window.products=liveProducts;if(status)status.textContent='✓ Shared stock connected ('+liveProducts.length+' products)';render()}catch(err){if(status)status.textContent='Database connection failed: '+err.message;console.error(err)}};

  function isSpirit(s){return /\b(gin|vodka|whisk(?:y|e)y|rum|brandy|cognac|tequila|mezcal|liqueur|disaronno|baileys|amaretto|sambuca|malibu|jack daniel|jameson|smirnoff|gordon'?s|bacardi|captain morgan|absolut|bombay|tanqueray|hendrick|grey goose|ketel one)\b/i.test(s)}
  function sizeMl(s){let m=String(s).match(/(\d+(?:\.\d+)?)\s*(ml|cl)\b/i);if(m)return Math.round(Number(m[1])*(m[2].toLowerCase()==='cl'?10:1));m=String(s).match(/(\d+(?:\.\d+)?)\s*(litre|liter|l)\b/i);return m?Math.round(Number(m[1])*1000):null}

  function genericInvoice(text){const out=[];const lines=String(text).replace(/\u00a0/g,' ').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);for(let i=0;i<lines.length;i++){const line=lines[i];if(/^(subtotal|total|saving|promotion|discount|vat|invoice|receipt|payment|balance|account|date|delivery|customer|supplier|page\b)/i.test(line)||!/£\s*\d/.test(line))continue;let q=1,name='';let m=line.match(/^(\d{1,4})\s+(.*?)\s+£\s*\d+(?:\.\d{1,2})?/);if(m){q=Number(m[1]);name=m[2]}else{m=line.match(/^(.*?)\s+(?:£\s*\d+(?:\.\d{1,2})?)\s+(\d{1,4})$/);if(m){name=m[1];q=Number(m[2])}}if(!name)continue;name=name.replace(/\s+/g,' ').trim();const full=name+' '+lines.slice(i+1,i+3).join(' ');if(isSpirit(full)){const ml=sizeMl(full);out.push({name:name.replace(/\b\d+(?:\.\d+)?\s*(?:ml|cl|l|litre|liter)\b/ig,'').trim(),type:'spirit',qty:q,bottleMl:ml,units:ml?Math.round(ml/MEASURE*q):0,sizeText:ml?ml+'ml bottle':'SIZE REQUIRED'})}else{const pm=full.match(/(\d+)\s*[x×]/i),pack=pm?Number(pm[1]):1;out.push({name,type:'unit',qty:q,units:q*pack,sizeText:pack>1?'pack '+pack:'unit'})}}return out}

  function parseLWCRobust(text){
    const s=String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
    const re=/(\d{8})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+\d+\s+\w+\s+£\d+(?:\.\d{2})\s+(\d+)\s+£\d+(?:\.\d{2})/g;
    const items=[];let m;
    while((m=re.exec(s))){
      let name=m[2].trim();
      const qty=Number(m[4])||1;
      const pack=name.match(/\b(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/i);
      const keg=name.match(/\b(\d+(?:\.\d+)?)\s*l\s*keg\b/i);
      let units=qty,sizeText='unit',type='unit';
      if(pack){units=qty*Number(pack[1]);sizeText=`${pack[1]} x ${pack[2]}${pack[3]}`}else if(keg){type='keg';sizeText=`${keg[1]}L keg`;units=qty}
      items.push({name,type,qty,units,sizeText,ref:m[1]});
    }
    return items;
  }

  function parseBookerRobust(text){
    const s=String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
    const re=/(\d{5,})\s+(.+?)\s+(\d+)\s*[x×]?\s*(\d+(?:\.\d+)?)\s*(ml|cl|l)\s+(?:NRB\s+)?\d{2}\/\d{2}\/\d{4}/ig;
    const items=[];let m;
    while((m=re.exec(s))){const name=m[2].trim(),pack=Number(m[3])||1,size=m[4]+m[5];const v=sizeMl(size);items.push(isSpirit(name)?{name,type:'spirit',qty:1,bottleMl:v,units:v?Math.round(v/MEASURE):0,sizeText:v?v+'ml bottle':'SIZE REQUIRED'}:{name,type:'unit',qty:1,units:pack,sizeText:'pack '+pack})}
    return items;
  }

  function loadScript(src,globalName){return new Promise((resolve,reject)=>{if(window[globalName])return resolve(window[globalName]);const s=document.createElement('script');s.src=src;s.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error(globalName+' did not load'));s.onerror=()=>reject(new Error('Could not load '+src));document.head.appendChild(s)})}
  async function ensurePdfJs(){if(window.pdfjsLib)return window.pdfjsLib;const sources=['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js','https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'];let last;for(const src of sources){try{return await loadScript(src,'pdfjsLib')}catch(e){last=e}}throw last||new Error('PDF reader library could not be loaded')}
  async function ensureTesseract(){if(window.Tesseract)return window.Tesseract;return loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','Tesseract')}

  async function extractPdfText(file){
    const lib=await ensurePdfJs();
    const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true,useWorkerFetch:false,isEvalSupported:false}).promise;
    let out='';
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const c=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
      const items=(c.items||[]).filter(x=>String(x.str||'').trim()).map(x=>({s:String(x.str).trim(),x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0)}));
      const groups=[];
      for(const it of items){let g=groups.find(q=>Math.abs(q.y-it.y)<=2);if(!g){g={y:it.y,a:[]};groups.push(g)}g.a.push(it)}
      groups.sort((a,b)=>b.y-a.y);
      for(const g of groups){g.a.sort((a,b)=>a.x-b.x);out+='\n'+g.a.map(x=>x.s).join(' ')}
    }
    return out;
  }

  async function ocrPdf(file){
    const lib=await ensurePdfJs(),ocr=await ensureTesseract();
    const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true}).promise;let out='';
    for(let p=1;p<=Math.min(pdf.numPages,8);p++){const page=await pdf.getPage(p),vp=page.getViewport({scale:1.8}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;$('status').textContent=`OCR page ${p} of ${pdf.numPages}…`;const r=await ocr.recognize(c,'eng');out+='\n'+r.data.text}
    return out;
  }

  async function readInvoicePdf(file){
    let text='';
    try{text=await extractPdfText(file)}catch(e){console.warn('PDF text extraction failed:',e)}
    const compact=text.replace(/\s/g,'');
    if(compact.length>40)return text;
    $('status').textContent='PDF has no usable text. Scanning pages…';
    return ocrPdf(file);
  }

  function parseInvoiceText(text){
    if(/Transaction\s*Detail/i.test(text)&&/LWC/i.test(text)){const items=parseLWCRobust(text);if(items.length)return{supplier:'LWC',items}}
    if(/Booker/i.test(text)){const items=parseBookerRobust(text);if(items.length)return{supplier:'Booker',items}}
    if(window.parse){const r=window.parse(text);if(r?.items?.length)return r}
    return{supplier:/Tesco/i.test(text)?'Tesco':'Invoice / receipt',items:genericInvoice(text)};
  }

  function showReview(items,fileName,supplier){livePending=items;const modal=$('modal');$('supplier').textContent=(supplier||'Invoice / receipt')+' · '+fileName;$('reviewMsg').textContent=items.length?items.length+' stock lines found. Check the quantities before confirming.':'I could not confidently identify stock lines. Try a clearer PDF/photo.';$('reviewWarning').innerHTML=items.some(x=>x.type==='spirit'&&!x.bottleMl)?'<div class="warning">A spirit bottle size is missing. Enter the bottle size in ml before confirming.</div>':'';$('detected').innerHTML=items.map((x,i)=>`<tr><td><input class="live-nm" data-i="${i}" value="${esc(x.name)}"></td><td><span class="tag ${x.type==='spirit'?'spirit':''}">${x.type.toUpperCase()}</span></td><td><input class="live-qt" data-i="${i}" type="number" min="0" value="${x.qty}" style="width:65px"></td><td>${x.type==='spirit'?`<input class="live-sz" data-i="${i}" type="number" min="1" value="${x.bottleMl||''}" placeholder="ml" style="width:85px"> ml bottle`:esc(x.sizeText||'unit')}</td><td class="live-u" data-i="${i}">${x.type==='spirit'?(x.units?x.units+' shots':'SIZE REQUIRED'):(x.units+' units')}</td></tr>`).join('');$('detected').oninput=e=>{const i=Number(e.target.dataset.i),x=livePending[i];if(!x)return;if(e.target.classList.contains('live-nm'))x.name=e.target.value;if(e.target.classList.contains('live-qt'))x.qty=Number(e.target.value)||0;if(e.target.classList.contains('live-sz'))x.bottleMl=Number(e.target.value)||0;if(x.type==='spirit'){x.units=x.bottleMl?Math.round(x.bottleMl/MEASURE*x.qty):0;const u=document.querySelector(`.live-u[data-i="${i}"]`);if(u)u.textContent=x.units?x.units+' shots':'SIZE REQUIRED'}};modal.style.display='flex'}

  function hookUpload(){const input=$('file');if(!input||input.dataset.liveUpload)return;input.dataset.liveUpload='1';input.onchange=async()=>{const f=input.files[0];if(!f)return;$('status').textContent='Reading '+f.name+'…';try{const isPdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name);let text=isPdf?await readInvoicePdf(f):await (window.imageText?window.imageText(f):'');let parsed=parseInvoiceText(text);if(!parsed.items.length&&isPdf){$('status').textContent='Text extraction found no stock lines. Scanning the PDF…';text=await ocrPdf(f);parsed=parseInvoiceText(text)}if(!parsed.items.length)throw new Error('No stock lines could be identified from this document.');showReview(parsed.items,f.name,parsed.supplier)}catch(err){console.error(err);$('status').textContent='Could not read this file: '+(err?.message||'unknown error');alert('Could not read the invoice. '+(err?.message||'Please try the PDF again or upload a clear photo.'))}}}

  function hookConfirm(){const b=$('confirm');if(!b||b.dataset.liveConfirm)return;b.dataset.liveConfirm='1';b.onclick=async()=>{if(!livePending.length){alert('No stock lines were found in this invoice.');return}for(const x of livePending)if(x.type==='spirit'&&!x.bottleMl){alert('Enter bottle size for '+x.name);return}b.disabled=true;try{for(const x of livePending){const units=Number(x.units)||0;if(!units)continue;const name=String(x.name).trim(),ex=liveProducts.find(p=>String(p.name||'').trim().toLowerCase()===name.toLowerCase());if(ex)await api(BASE+'?id=eq.'+encodeURIComponent(ex.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({received:Number(ex.received||0)+units})});else await api(BASE,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({name,received:units,sold:0,low_stock_level:0})})}$('modal').style.display='none';$('status').textContent='✓ Stock added successfully.';livePending=[];await liveLoad()}catch(err){alert('Could not add stock: '+err.message)}finally{b.disabled=false}}}

  function start(){installLogo();hookUpload();hookConfirm();window.load=window.liveLoad;const app=$('app');if(app&&app.style.display!=='none'&&sessionStorage.getItem('k')==='1')window.liveLoad()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();