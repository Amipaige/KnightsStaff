// Show event notes on staff/admin event cards.
(function(){
  const SUPA='https://jpjrsndbjklecvwiuvbf.supabase.co';
  const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwanJzbmRiamtsZWN2d2l1dmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE';
  const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let notes=[];
  async function load(){
    try{
      const r=await fetch(SUPA+'/rest/v1/events?select=id,name,date,notes',{headers:{apikey:KEY,Authorization:'Bearer '+KEY},cache:'no-store'});
      if(!r.ok)return;
      notes=await r.json();
      apply();
    }catch(e){console.warn('Event notes fix:',e)}
  }
  function apply(){
    if(!notes.length)return;
    document.querySelectorAll('#staffContent .card,#adminEvents .card').forEach(card=>{
      if(card.dataset.notesAdded==='1')return;
      const title=card.querySelector('.event');
      const date=card.querySelector('.date');
      if(!title)return;
      const name=(title.textContent||'').trim();
      const dateText=(date?.textContent||'').trim();
      const match=notes.find(e=>String(e.name||'').trim()===name && (!dateText || String(e.date||'').includes(dateText.slice(-4))));
      if(!match || !String(match.notes||'').trim())return;
      const anchor=card.querySelector('.meta') || card.querySelector('.manager');
      const box=document.createElement('div');
      box.className='event-notes-live';
      box.innerHTML='<b>Notes:</b> '+esc(match.notes).replace(/\n/g,'<br>');
      if(anchor)anchor.insertAdjacentElement('afterend',box); else card.appendChild(box);
      card.dataset.notesAdded='1';
    });
  }
  function start(){
    const st=document.createElement('style');
    st.textContent='.event-notes-live{margin-top:10px;padding:10px 12px;background:#f8f0df;border:1px solid #e7d5ac;border-radius:10px;font-size:13px;line-height:1.5;color:#514a3e}.event-notes-live b{color:#171716}';
    document.head.appendChild(st);
    load();
    new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
