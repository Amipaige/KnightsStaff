(()=>{
const URL='https://jpjrsndbjklecvwiuvbf.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwanJzbmRiamtsZWN2d2l1dmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE';
const db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let me=null,profile=null,bookings=[],enquiries=[],payments=[],tasks=[],calendarCursor=new Date();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'£'+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const dmy=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const barLabel=x=>({luxury:'Luxury',pop_up:'Pop-up',stock_and_staff:'Stock & staff'}[x]||x||'—');
const barClass=x=>x==='pop_up'?'pop-up':x==='stock_and_staff'?'stock-staff':'luxury';
const stale=e=>/refresh token|session.*not found|invalid.*token/i.test(String(e?.message||e||''));
async function clearLocal(){try{await db.auth.signOut({scope:'local'})}catch(_){};me=null;profile=null}
function authMessage(t=''){$('loginMsg').textContent=t}
function showAuth(t=''){$('authScreen').classList.remove('hidden');$('appShell').classList.add('hidden');if(t)authMessage(t)}
function showApp(){$('authScreen').classList.add('hidden');$('appShell').classList.remove('hidden')}
async function login(){
 const email=$('loginEmail').value.trim().toLowerCase(),password=$('loginPassword').value;
 if(!email||!password)return authMessage('Enter your email and password.');
 $('loginBtn').disabled=true;authMessage('Signing in…');
 try{
   const r=await db.auth.signInWithPassword({email,password}); if(r.error)throw r.error; await bootUser(r.data.user);
 }catch(e){if(stale(e)){await clearLocal();authMessage('Your saved session had expired. Please sign in again.')}else authMessage(e.message||'Sign in failed.')}
 finally{$('loginBtn').disabled=false}
}
async function bootUser(user){
 me=user;
 const r=await db.from('staff_profiles').select('*').eq('id',user.id).maybeSingle();
 if(r.error)throw r.error;
 profile=r.data;
 if(!profile)throw new Error('Your staff profile is missing. Please contact Knights.');
 showApp();
 $('userSummary').innerHTML='<b>'+esc(profile.full_name||user.email)+'</b><br>'+esc(profile.role||'staff');
 document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',profile.role!=='admin'));
 if(profile.role==='admin'){await refreshAdminData();switchView('dashboard')}else{switchView('staffing')}
}
async function refreshAdminData(){
 const [b,e,p,t]=await Promise.all([
   db.from('bookings').select('*').order('event_date',{ascending:true}),
   db.from('booking_enquiries').select('*').order('created_at',{ascending:false}),
   db.from('booking_payments').select('*').order('paid_at',{ascending:false}),
   db.from('booking_tasks').select('*').order('due_date',{ascending:true})
 ]);
 for(const x of [b,e,p,t])if(x.error)throw x.error;
 bookings=b.data||[];enquiries=e.data||[];payments=p.data||[];tasks=t.data||[];
 renderDashboard();renderEnquiries();renderBookings();renderCalendar();
}
function totalPaid(bookingId){return payments.filter(p=>p.booking_id===bookingId).reduce((s,p)=>s+Number(p.amount||0),0)}
function switchView(name){
 document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
 const el=$(name+'View');if(el)el.classList.remove('hidden');
 document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 $('viewTitle').textContent=({dashboard:'Dashboard',enquiries:'Enquiries',bookings:'Bookings',calendar:'Calendar',staffing:'Staffing',stock:'Stock'}[name]||'Knights Hub');
 if(name==='calendar')renderCalendar();
 if(window.innerWidth<901)document.querySelector('.sidebar')?.classList.remove('open');
}
function renderDashboard(){
 const today=new Date().toISOString().slice(0,10);
 const future=bookings.filter(b=>b.event_date>=today&&b.booking_status!=='cancelled');
 const outstanding=bookings.reduce((sum,b)=>sum+Math.max(0,Number(b.total_amount||0)-totalPaid(b.id)),0);
 const openTasks=tasks.filter(t=>t.status==='open');
 $('statUpcoming').textContent=future.length;
 $('statOutstanding').textContent=money(outstanding);
 $('statTasks').textContent=openTasks.length;
 $('statAwaitingFee').textContent=bookings.filter(b=>b.booking_status==='awaiting_booking_fee').length;
 $('dashboardEvents').innerHTML=future.slice(0,6).map(bookingCardMini).join('')||'<p class="muted">No upcoming bookings yet.</p>';
 $('dashboardTasks').innerHTML=openTasks.slice(0,8).map(t=>{
   const b=bookings.find(x=>x.id===t.booking_id);const overdue=t.due_date<today;
   return '<div class="list-card"><div class="row"><div><b>'+esc(t.title)+'</b><div class="meta">'+esc(b?.event_name||'Booking')+' · due '+dmy(t.due_date)+'</div></div><span class="badge '+(overdue?'overdue':'awaiting')+'">'+(overdue?'OVERDUE':'OPEN')+'</span></div></div>'
 }).join('')||'<p class="muted">Nothing outstanding.</p>';
}
function bookingCardMini(b){return '<div class="list-card"><div class="row"><div><div class="event-name">'+esc(b.event_name)+'</div><div class="meta">'+dmy(b.event_date)+' · '+esc(b.venue)+'</div></div><span class="bar-chip '+barClass(b.bar_type)+'">'+barLabel(b.bar_type)+'</span></div></div>'}
function renderEnquiries(){
 $('enquiryList').innerHTML=enquiries.length?enquiries.map(e=>'<div class="list-card"><div class="row"><div><div class="event-name">'+esc(e.event_name||e.customer_name)+'</div><div class="meta">'+esc(e.customer_name)+' · '+dmy(e.event_date)+' · '+esc(e.venue||'Venue TBC')+'<br>'+esc(e.guest_count||'—')+' guests · '+barLabel(e.bar_type)+'</div></div><span class="badge '+(e.status==='accepted'?'booked':'awaiting')+'">'+esc(e.status.replaceAll('_',' ')).toUpperCase()+'</span></div><div class="actions">'+(e.status!=='accepted'&&e.status!=='declined'?'<button class="btn green" data-accept="'+e.id+'">Record fee & accept</button><button class="btn red" data-decline="'+e.id+'">Decline</button>':'')+'</div></div>').join(''):'<p class="muted">No enquiries yet.</p>';
 document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>openAccept(b.dataset.accept));
 document.querySelectorAll('[data-decline]').forEach(b=>b.onclick=()=>declineEnquiry(b.dataset.decline));
}
function renderBookings(){
 const sorted=[...bookings].sort((a,b)=>a.event_date.localeCompare(b.event_date));
 $('bookingList').innerHTML=sorted.length?sorted.map(b=>{
   const paid=totalPaid(b.id),out=Math.max(0,Number(b.total_amount||0)-paid);
   return '<div class="list-card"><div class="row"><div><div class="event-name">'+esc(b.event_name)+'</div><div class="meta">'+dmy(b.event_date)+' · '+esc(b.venue)+'<br>'+esc(b.customer_name)+' · '+esc(b.guest_count||'—')+' guests · '+barLabel(b.bar_type)+'</div></div><span class="badge booked">'+esc(b.booking_status.replaceAll('_',' ')).toUpperCase()+'</span></div><div class="meta">Paid <b>'+money(paid)+'</b> · Outstanding <b>'+money(out)+'</b> · Staff '+esc(b.staff_required)+'</div></div>'
 }).join(''):'<p class="muted">No accepted bookings yet.</p>';
}
function renderCalendar(){
 const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
 $('calendarTitle').textContent=calendarCursor.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
 const first=new Date(y,m,1);const start=new Date(y,m,1-((first.getDay()+6)%7));
 let html='';
 for(let i=0;i<42;i++){
   const d=new Date(start);d.setDate(start.getDate()+i);
   const iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
   const dayBookings=bookings.filter(b=>b.event_date===iso&&b.booking_status!=='cancelled');
   html+='<div class="calendar-day '+(d.getMonth()!==m?'outside':'')+'"><div class="day-num">'+d.getDate()+'</div>'+dayBookings.map(b=>'<button class="cal-event '+barClass(b.bar_type)+'" title="'+esc(b.event_name)+'">'+esc(b.event_name)+'</button>').join('')+'</div>';
 }
 $('calendarGrid').innerHTML=html;
}
function openModal(id){$(id).classList.remove('hidden')}
function closeModals(){document.querySelectorAll('.modal-bg').forEach(m=>m.classList.add('hidden'))}
async function saveEnquiry(){
 const customer=$('eqCustomer').value.trim();if(!customer)return $('enquiryMsg').textContent='Customer name is required.';
 const payload={source:'manual',customer_name:customer,customer_email:$('eqEmail').value.trim()||null,customer_phone:$('eqPhone').value.trim()||null,event_name:$('eqEvent').value.trim()||null,event_date:$('eqDate').value||null,venue:$('eqVenue').value.trim()||null,guest_count:$('eqGuests').value?Number($('eqGuests').value):null,bar_type:$('eqBar').value,notes:$('eqNotes').value.trim()||null,status:'enquiry'};
 $('saveEnquiryBtn').disabled=true;$('enquiryMsg').textContent='Saving…';
 try{const r=await db.from('booking_enquiries').insert(payload);if(r.error)throw r.error;closeModals();await refreshAdminData()}catch(e){$('enquiryMsg').textContent=e.message}finally{$('saveEnquiryBtn').disabled=false}
}
function openAccept(id){const e=enquiries.find(x=>x.id===id);if(!e)return;$('acceptEnquiryId').value=id;$('acceptFee').value='50';$('acceptTotal').value='0';$('acceptStaff').value='3';$('acceptTens').checked=true;$('acceptMsg').textContent='';openModal('acceptModal')}
async function declineEnquiry(id){if(!confirm('Decline this enquiry?'))return;const r=await db.from('booking_enquiries').update({status:'declined',updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return alert(r.error.message);await refreshAdminData()}
async function acceptBooking(){
 const id=$('acceptEnquiryId').value,e=enquiries.find(x=>x.id===id);if(!e)return;
 const fee=Number($('acceptFee').value||0);if(fee<=0)return $('acceptMsg').textContent='Record the booking fee paid before accepting.';
 if(!e.event_date||!e.venue||!e.event_name)return $('acceptMsg').textContent='Event name, date and venue are needed before accepting.';
 $('confirmAcceptBtn').disabled=true;$('acceptMsg').textContent='Creating booking…';
 let eventId=null,bookingId=null;
 try{
   const ev=await db.from('bar_events').insert({event_name:e.event_name,event_date:e.event_date,venue:e.venue,arrival_time:$('acceptArrival').value||null,start_time:$('acceptStart').value||null,finish_time:$('acceptFinish').value||null,staff_required:Number($('acceptStaff').value||1),bar_package:barLabel(e.bar_type),guest_count:e.guest_count,notes:e.notes}).select('id').single();
   if(ev.error)throw ev.error;eventId=ev.data.id;
   const br=await db.from('bookings').insert({enquiry_id:e.id,customer_name:e.customer_name,customer_email:e.customer_email,customer_phone:e.customer_phone,event_name:e.event_name,event_date:e.event_date,venue:e.venue,guest_count:e.guest_count,bar_type:e.bar_type,staff_required:Number($('acceptStaff').value||1),arrival_time:$('acceptArrival').value||null,start_time:$('acceptStart').value||null,finish_time:$('acceptFinish').value||null,total_amount:Number($('acceptTotal').value||0),booking_fee_due:fee,booking_status:'booked',tens_required:$('acceptTens').checked,staffing_event_id:eventId,notes:e.notes}).select('id').single();
   if(br.error)throw br.error;bookingId=br.data.id;
   const pay=await db.from('booking_payments').insert({booking_id:bookingId,amount:fee,payment_type:'booking_fee',method:'recorded in Knights Hub'});
   if(pay.error)throw pay.error;
   const date=new Date(e.event_date+'T12:00:00'),six=new Date(date),fourteen=new Date(date);six.setDate(six.getDate()-42);fourteen.setDate(fourteen.getDate()-14);
   const fmt=x=>[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
   const tr=await db.from('booking_tasks').insert([
     {booking_id:bookingId,task_type:'six_week_check',title:($('acceptTens').checked?'Confirm payment & apply for TENS':'Confirm payment & event requirements'),due_date:fmt(six)},
     {booking_id:bookingId,task_type:'final_numbers',title:'Confirm final guest numbers',due_date:fmt(fourteen)}
   ]);
   if(tr.error)throw tr.error;
   const er=await db.from('booking_enquiries').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',e.id);if(er.error)throw er.error;
   closeModals();await refreshAdminData();switchView('bookings');
 }catch(err){
   $('acceptMsg').textContent=err.message||'Could not accept booking.';
   if(bookingId)await db.from('bookings').delete().eq('id',bookingId);
   else if(eventId)await db.from('bar_events').delete().eq('id',eventId);
 }finally{$('confirmAcceptBtn').disabled=false}
}
$('loginBtn').onclick=login;
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('logoutBtn').onclick=async()=>{await db.auth.signOut({scope:'local'});showAuth()};
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>switchView(b.dataset.jump));
$('mobileMenuBtn').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
$('newEnquiryBtn').onclick=()=>{['eqCustomer','eqEmail','eqPhone','eqEvent','eqDate','eqVenue','eqGuests','eqNotes'].forEach(id=>$(id).value='');$('enquiryMsg').textContent='';openModal('enquiryModal')};
$('saveEnquiryBtn').onclick=saveEnquiry;$('confirmAcceptBtn').onclick=acceptBooking;
document.querySelectorAll('[data-close-modal]').forEach(b=>b.onclick=closeModals);
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModals()}));
$('prevMonth').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()};
$('nextMonth').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()};
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showAuth();if(session?.user&&['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'].includes(event))setTimeout(()=>{if(!me||me.id!==session.user.id)bootUser(session.user).catch(e=>showAuth(e.message))},0)});
(async()=>{try{const {data,error}=await db.auth.getSession();if(error)throw error;if(data.session?.user)await bootUser(data.session.user);else showAuth()}catch(e){if(stale(e))await clearLocal();showAuth('Please sign in again.')}})();
})();