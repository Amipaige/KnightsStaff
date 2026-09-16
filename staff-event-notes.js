// Live admin pending-request panel for the Knights staffing app.
(function(){
  const SUPA='https://jpjrsndbjklecvwiuvbf.supabase.co';
  const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcGpyc25kYmprbGVjd3ZpdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE';
  const db=window.supabase.createClient(SUPA,KEY);
  const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const dateFmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'';
  let busy=false;

  async function load(){
    if(busy)return;
    const host=document.getElementById('adminEvents');
    if(!host)return;
    const adminView=document.getElementById('adminView');
    if(!adminView || adminView.classList.contains('hidden'))return;
    try{
      const {data:{session}}=await db.auth.getSession();
      if(!session)return;
      const {data:pending,error}=await db.from('shift_signups').select('id,event_id,staff_id,status,created_at').eq('status','pending').order('created_at',{ascending:true});
      if(error){console.warn('Pending requests:',error.message);return;}
      const rows=pending||[];
      const eventIds=[...new Set(rows.map(x=>x.event_id))];
      const staffIds=[...new Set(rows.map(x=>x.staff_id))];
      const [er,sr]=await Promise.all([
        eventIds.length?db.from('bar_events').select('id,event_name,event_date,venue,arrival_time,start_time,finish_time').in('id',eventIds):Promise.resolve({data:[],error:null}),
        staffIds.length?db.from('staff_profiles').select('id,full_name,email').in('id',staffIds):Promise.resolve({data:[],error:null})
      ]);
      if(er.error||sr.error){console.warn('Pending request details:',er.error?.message||sr.error?.message);return;}
      const events=Object.fromEntries((er.data||[]).map(x=>[x.id,x]));
      const staff=Object.fromEntries((sr.data||[]).map(x=>[x.id,x]));
      let panel=document.getElementById('livePendingRequests');
      if(!rows.length){if(panel)panel.remove();return;}
      if(!panel){panel=document.createElement('div');panel.id='livePendingRequests';host.parentNode.insertBefore(panel,host);}
      panel.innerHTML='<div class="card"><div class="section-title"><h2>Pending shift requests</h2><span class="badge pending">'+rows.length+' awaiting action</span></div><p class="small">These staff members have requested a shift. Approve or decline each request below.</p>'+rows.map(r=>{
        const e=events[r.event_id]||{}; const p=staff[r.staff_id]||{};
        return '<div class="person"><div class="row"><div><b>'+esc(p.full_name||'Unknown staff')+'</b><br><span class="small">'+esc(p.email||'')+'</span></div><span class="badge pending">REQUESTED</span></div><div class="meta"><b>'+esc(e.event_name||'Unknown event')+'</b><br>'+esc(dateFmt(e.event_date))+' · '+esc(e.venue||'')+'<br>🕐 Arrival '+esc((e.arrival_time||'').slice(0,5)||'—')+' · '+esc((e.start_time||'').slice(0,5)||'—')+'–'+esc((e.finish_time||'').slice(0,5)||'—')+'</div><div class="actions"><button class="btn mini green" type="button" data-approve="'+r.id+'">Approve request</button><button class="btn mini red" type="button" data-decline="'+r.id+'">Decline request</button></div></div>';
      }).join('')+'</div>';
      panel.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>setStatus(b.dataset.approve,'confirmed'));
      panel.querySelectorAll('[data-decline]').forEach(b=>b.onclick=()=>setStatus(b.dataset.decline,'declined'));
    }catch(e){console.warn('Pending requests panel:',e);}
  }

  async function setStatus(id,status){
    const r=await db.from('shift_signups').update({status}).eq('id',id);
    if(r.error){alert(r.error.message);return;}
    load();
  }

  function start(){
    const st=document.createElement('style');
    st.textContent='#livePendingRequests{margin-bottom:0}#livePendingRequests .person{background:#fffdf9}';
    document.head.appendChild(st);
    setTimeout(load,800);
    setInterval(load,3000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
