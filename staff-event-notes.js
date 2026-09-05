// Live event-card extras for the Knights staffing app.
(function(){
  const SUPA='https://jpjrsndbjklecvwiuvbf.supabase.co';
  const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwanJzbmRiamtsZWN3d2l1dmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE';
  const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let events=[];

  async function load(){
    try{
      const r=await fetch(SUPA+'/rest/v1/events?select=id,event_name,event_date,guest_count,notes',{headers:{apikey:KEY,Authorization:'Bearer '+KEY},cache:'no-store'});
      if(!r.ok){console.warn('Event extras HTTP',r.status);return;}
      events=await r.json();
      apply();
    }catch(e){console.warn('Event extras fix:',e)}
  }

  function findEvent(card){
    const title=card.querySelector('.event');
    const date=card.querySelector('.date');
    if(!title)return null;
    const name=(title.textContent||'').trim();
    const dateText=(date?.textContent||'').trim();
    const year=(dateText.match(/\b20\d{2}\b/)||[])[0]||'';
    return events.find(e=>String(e.event_name||'').trim()===name && (!year || String(e.event_date||'').startsWith(year))) ||
           events.find(e=>String(e.event_name||'').trim()===name) || null;
  }

  function apply(){
    if(!events.length)return;
    document.querySelectorAll('#staffContent .card,#adminEvents .card').forEach(card=>{
      const event=findEvent(card);
      if(!event)return;

      if(event.guest_count!==null && event.guest_count!==undefined && String(event.guest_count)!==''){
        if(!card.querySelector('.guest-count-live')){
          const box=document.createElement('div');
          box.className='guest-count-live small';
          box.innerHTML='👥 <b>Guest count:</b> '+esc(event.guest_count);
          const anchor=card.querySelector('.meta') || card.querySelector('.manager');
          if(anchor)anchor.insertAdjacentElement('afterend',box); else card.appendChild(box);
        }
      }

      if(String(event.notes||'').trim() && !card.querySelector('.event-notes-live')){
        const box=document.createElement('div');
        box.className='event-notes-live';
        box.innerHTML='<b>Notes:</b> '+esc(event.notes).replace(/\n/g,'<br>');
        const anchor=card.querySelector('.meta') || card.querySelector('.manager');
        if(anchor)anchor.insertAdjacentElement('afterend',box); else card.appendChild(box);
      }
    });
  }

  function start(){
    const st=document.createElement('style');
    st.textContent='.guest-count-live{margin-top:8px}.event-notes-live{margin-top:10px;padding:10px 12px;background:#f8f0df;border:1px solid #e7d5ac;border-radius:10px;font-size:13px;line-height:1.5;color:#514a3e}.event-notes-live b{color:#171716}';
    document.head.appendChild(st);
    load();
    new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
