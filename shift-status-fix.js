// Staff shift-status display fix
(function(){
  const SUPA='https://jpjrsndbjklecvwiuvbf.supabase.co';
  const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqd2';
  // The main app already creates Supabase; use its client when available.
  let db=null, userId=null, cacheKey='', declined=[];
  const $=id=>document.getElementById(id);
  function style(){
    if(document.getElementById('shift-status-fix-style'))return;
    const s=document.createElement('style');s.id='shift-status-fix-style';
    s.textContent='.shift-declined-notice{margin-top:12px;padding:12px 14px;border:1px solid #e5ddd0;border-radius:10px;background:#f6f1e8;color:#777166;font-size:13px;font-weight:700}.shift-declined-notice b{color:#171716}';
    document.head.appendChild(s);
  }
  async function init(){
    if(!window.supabase?.createClient)return false;
    if(!db)db=window.supabase.createClient(SUPA,KEY);
    const r=await db.auth.getUser();
    if(r.error||!r.data.user)return false;
    userId=r.data.user.id;
    const p=await db.from('staff_profiles').select('role').eq('id',userId).maybeSingle();
    if(p.data?.role==='admin')return false;
    return true;
  }
  async function load(){
    if(!userId)return;
    const r=await db.from('shift_signups').select('event_id,status').eq('staff_id',userId).eq('status','declined');
    if(r.error)return;
    const ids=(r.data||[]).map(x=>x.event_id).filter(Boolean);
    const key=ids.join(',');
    if(key===cacheKey)return;
    cacheKey=key;declined=ids;
  }
  function render(){
    if(!declined.length)return;
    style();
    document.querySelectorAll('.event').forEach(el=>{
      const card=el.closest('.card');if(!card)return;
      if(card.querySelector('.shift-declined-notice'))return;
      // The app's event cards contain the event id on the request button where available.
      const target=card.querySelector('[data-event-id],[data-id]');
      let eventId=target?.dataset?.eventId||target?.dataset?.id||'';
      if(!eventId){
        // Fall back to matching the visible event name + date against the live database.
        const name=(el.textContent||'').trim();
        const dateEl=card.querySelector('.date');
        const dateText=(dateEl?.textContent||'').trim();
        const match=window.__knightsShiftEvents?.find(e=>declined.includes(e.id)&&e.event_name===name&&(!dateText||dateText.includes(new Date(e.event_date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}))));
        if(match)eventId=match.id;
      }
      if(!eventId||!declined.includes(eventId))return;
      card.querySelectorAll('button').forEach(b=>{
        if(/requested|request shift|pending/i.test(b.textContent||'')){
          b.disabled=true;b.textContent='Not required for this shift, thank you.';b.classList.remove('gold','green','red');b.classList.add('light');
        }
      });
      const n=document.createElement('div');n.className='shift-declined-notice';n.innerHTML='<b>Not required for this shift, thank you.</b>';
      card.appendChild(n);
    });
  }
  async function events(){
    const r=await db.from('bar_events').select('id,event_name,event_date');
    if(!r.error)window.__knightsShiftEvents=r.data||[];
  }
  async function tick(){
    try{
      if(!db){if(!(await init()))return;}
      await load();await events();render();
    }catch(e){console.debug('Shift status fix:',e)}
  }
  function start(){tick();setInterval(tick,2000);new MutationObserver(()=>render()).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
