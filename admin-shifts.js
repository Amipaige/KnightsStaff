(function(){
  const boot=()=>{if(!window.supabase||!document.getElementById('staffTab'))return setTimeout(boot,250);start()};
  function start(){
    const S=window.supabase.createClient('__SUPA_URL__','__SUPA_KEY__');
    const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const tm=x=>x?String(x).slice(0,5):'—',fd=x=>x?new Date(x+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'';
    const declined=x=>['declined','rejected','cancelled'].includes(String(x||'').toLowerCase());
    let admin=false,box;
    function ensure(){if(!box){box=document.createElement('div');box.id='adminShiftContent';$('staffView').insertBefore(box,$('staffContent'));}return box}
    async function load(){
      if(!admin)return;const b=ensure();b.innerHTML='<div class="card">Loading shifts…</div>';
      const [a,z,p]=await Promise.all([S.from('bar_events').select('*').order('event_date',{ascending:true}),S.from('shift_signups').select('*'),S.from('staff_profiles').select('id,full_name,email,role,registration_status').order('full_name')]);
      if(a.error||z.error||p.error){b.innerHTML='<div class="card"><p class="msg">Could not load shifts.</p></div>';return}
      const ev=a.data||[],su=z.data||[],people=p.data||[],by=Object.fromEntries(people.map(x=>[x.id,x]));
      b.innerHTML='<div class="card"><h2>All events</h2><p class="small">All events are shown here. Declined requests stay available so you can accept them again if someone drops out.</p></div>';
      for(const e of ev){
        const rows=su.filter(x=>x.event_id===e.id),ok=rows.filter(x=>x.status==='confirmed'),pen=rows.filter(x=>x.status==='pending'),old=rows.filter(x=>declined(x.status));
        const need=Math.max(0,Number(e.staff_required||0)-ok.length),manager=people.find(x=>x.id===e.manager_id),avail=people.filter(x=>x.role==='staff'&&x.registration_status==='approved'&&!rows.some(y=>y.staff_id===x.id));
        const c=document.createElement('div');c.className='card';
        c.innerHTML=`<div class="row"><div><div class="date">${fd(e.event_date)}</div><div class="event">${esc(e.event_name)}</div></div><span class="badge ${need?'need':'approved'}">${need?need+' staff needed':'Fully staffed'}</span></div><div class="meta">📍 ${esc(e.venue||'')}<br>🕐 Arrival ${tm(e.arrival_time)} · ${tm(e.start_time)}–${tm(e.finish_time)}<br>👥 ${ok.length} / ${e.staff_required||0} confirmed</div><div class="manager">👑 Bar Manager: <b>${esc(manager?.full_name||e.manager_name||'Not assigned')}</b></div><div class="small">${esc(e.bar_package||'')}${e.dress_code?' · Dress: '+esc(e.dress_code):''}</div><div class="event-actions"><button class="btn gold" data-edit>Amend event</button><button class="btn red" data-del>Delete event</button></div>`;
        const rowsUI=(title,list,type)=>{if(!list.length)return;const h=document.createElement('div');h.className='small';h.style.marginTop='10px';h.innerHTML='<b>'+title+'</b>';c.appendChild(h);list.forEach(x=>{const p=by[x.staff_id],r=document.createElement('div');r.className='signup-line';r.innerHTML='<div class="row"><span>'+esc(p?.full_name||'Unknown staff')+'</span><span class="badge '+(x.status==='confirmed'?'approved':declined(x.status)?'need':'pending')+'">'+(declined(x.status)?'Declined':esc(x.status))+'</span></div>';const q=document.createElement('button');q.className='btn mini '+(type==='confirmed'?'red':'green');q.textContent=type==='confirmed'?'Decline / remove':type==='pending'?'Accept request':'Accept / restore';q.onclick=()=>set(x.id,type==='confirmed'?'declined':'confirmed');r.appendChild(q);const del=document.createElement('button');del.className='btn mini red';del.textContent='Delete from shift';del.style.marginLeft='6px';del.onclick=()=>removeSignup(x.id,p?.full_name||'this staff member');r.appendChild(del);c.appendChild(r)})};
        rowsUI('Confirmed staff',ok,'confirmed');rowsUI('Pending requests',pen,'pending');rowsUI('Declined / previously requested',old,'old');
        const add=document.createElement('div');add.className='grid';add.style.marginTop='12px';add.innerHTML='<select><option value="">Add approved staff…</option>'+avail.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join('')+'</select><button class="btn green">Add to shift</button>';add.children[1].onclick=async()=>{const id=add.children[0].value;if(!id)return alert('Select a staff member first.');const r=await S.from('shift_signups').insert({event_id:e.id,staff_id:id,status:'confirmed'});if(r.error)return alert(r.error.message);load()};c.appendChild(add);
        c.querySelector('[data-del]').onclick=async()=>{if(!confirm('Delete this event and all its shift bookings?'))return;let r=await S.from('shift_signups').delete().eq('event_id',e.id);if(r.error)return alert(r.error.message);r=await S.from('bar_events').delete().eq('id',e.id);if(r.error)return alert(r.error.message);load()};
        c.querySelector('[data-edit]').onclick=()=>{$('adminTab').click();if(typeof window.openEdit==='function')window.openEdit(e.id);else alert('Use the event amendment controls on the Admin page.')};
        b.appendChild(c)
      }
    }
    async function set(id,status){const r=await S.from('shift_signups').update({status}).eq('id',id);if(r.error)return alert(r.error.message);load()}
    async function removeSignup(id,name){if(!confirm('Completely remove '+name+' from this shift? This deletes their shift booking. They can be added again later if needed.'))return;const r=await S.from('shift_signups').delete().eq('id',id);if(r.error)return alert(r.error.message);load()}
    $('staffTab').onclick=()=>{if(!admin)return;$('staffTab').classList.add('active');$('adminTab').classList.remove('active');$('staffView').classList.remove('hidden');$('adminView').classList.add('hidden');$('staffGate').classList.add('hidden');$('staffContent').classList.add('hidden');load()};
    $('adminTab').onclick=()=>{if(!admin)return;$('adminTab').classList.add('active');$('staffTab').classList.remove('active');$('adminView').classList.remove('hidden');$('staffView').classList.add('hidden');$('adminEvents').classList.add('hidden')};
    (async()=>{const {data}=await S.auth.getSession();if(!data.session)return;const {data:p}=await S.from('staff_profiles').select('role').eq('id',data.session.user.id).maybeSingle();admin=p?.role==='admin';if(admin){$('adminEvents').classList.add('hidden');$('staffGate').classList.add('hidden');$('staffContent').classList.add('hidden');$('staffTab').click()}})();
  }
  boot();
})();