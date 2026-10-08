(()=>{
const URL='https://jpjrsndbjklecvwiuvbf.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwanJzbmRiamtsZWN2d2l1dmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE';
const db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let me=null,profile=null,bookings=[],enquiries=[],payments=[],tasks=[],checklistItems=[],staffingEvents=[],staffingSignups=[],supportTickets=[],staffInformation=[],staffProfiles=[],teamAccountEmails=new Set(),calendarCursor=new Date();
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
 if(profile.role==='admin'){
   await refreshAdminData();
   const requestedView=new URLSearchParams(window.location.search).get('view');
   const allowedViews=new Set(['dashboard','enquiries','bookings','calendar','staffing','team','support','stock']);
   switchView(allowedViews.has(requestedView)?requestedView:'dashboard');
 }else{switchView('staffing')}
}
async function refreshStaffingSummary(){
 const today=new Date().toISOString().slice(0,10);
 const [er,sr]=await Promise.all([
   db.from('bar_events').select('id,event_date,staff_required,is_cancelled,manager_id').eq('is_cancelled',false).gte('event_date',today),
   db.from('shift_signups').select('id,event_id,staff_id,status')
 ]);
 if(er.error)throw er.error;if(sr.error)throw sr.error;
 staffingEvents=er.data||[];staffingSignups=sr.data||[];
}
async function refreshBackupStatus(){
 const el=$('backupStatusNote');if(!el)return;
 const r=await db.from('staffing_backup_status').select('last_success_at,last_export_at').eq('id',true).maybeSingle();
 if(r.error){el.textContent='Last Google backup: status unavailable';return}
 const stamp=r.data?.last_success_at||r.data?.last_export_at;
 if(!stamp){el.textContent='Last Google backup: waiting for first sync';return}
 const when=new Date(stamp).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 el.textContent='Last Google backup: '+when;
}
async function refreshAdminData(){
 const [b,e,p,t,c,si,sp]=await Promise.all([
   db.from('bookings').select('*').order('event_date',{ascending:true}),
   db.from('booking_enquiries').select('*').order('created_at',{ascending:false}),
   db.from('booking_payments').select('*').order('paid_at',{ascending:false}),
   db.from('booking_tasks').select('*').order('due_date',{ascending:true}),
   db.from('booking_checklist_items').select('*').order('sort_order',{ascending:true}),
   db.from('staff_information').select('*').order('full_name',{ascending:true}),
   db.from('staff_profiles').select('id,full_name,email,role,registration_status,approval_notification_sent_at,approval_notification_error').order('full_name',{ascending:true})
 ]);
 for(const x of [b,e,p,t,c,si,sp])if(x.error)throw x.error;
 bookings=b.data||[];enquiries=e.data||[];payments=p.data||[];tasks=t.data||[];checklistItems=c.data||[];staffInformation=si.data||[];staffProfiles=sp.data||[];
 await Promise.all([refreshStaffingSummary(),refreshBackupStatus(),refreshTeamAccountStatus()]);
 renderDashboard();renderEnquiries();renderBookings();renderCalendar();renderTeam();
}
function totalPaid(bookingId){return payments.filter(p=>p.booking_id===bookingId).reduce((s,p)=>s+Number(p.amount||0),0)}
function switchView(name){
 document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
 const el=$(name+'View');if(el)el.classList.remove('hidden');
 document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 $('viewTitle').textContent=({dashboard:'Dashboard',enquiries:'Enquiries',bookings:'Bookings',calendar:'Calendar',staffing:'Staffing',team:'Team',support:'Support',stock:'Stock'}[name]||'Knights Hub');
 if(name==='calendar')renderCalendar();
 if(name==='team')renderTeam();
 if(name==='support')loadSupportTickets().catch(e=>{$('supportMsg').textContent=e.message||'Could not load support tickets.'});
 if(name==='staffing'){
   const frame=$('staffingFrame');
   try{frame?.contentWindow?.postMessage({type:'knights-show-shifts'},window.location.origin)}catch(_){}
 }
 if(name==='dashboard'&&profile?.role==='admin')Promise.all([refreshStaffingSummary(),refreshBackupStatus()]).then(renderDashboard).catch(e=>console.warn('Dashboard refresh:',e));
 if(window.innerWidth<901)document.querySelector('.sidebar')?.classList.remove('open');
}
function staffingFilledCount(e){const ids=new Set(staffingSignups.filter(s=>s.event_id===e.id&&s.status==='confirmed').map(s=>s.staff_id).filter(Boolean));if(e.manager_id)ids.add(e.manager_id);return ids.size}
function bookingHasPending(b){
 return checklistItems.some(x=>x.booking_id===b.id&&!x.is_completed)||tasks.some(t=>t.booking_id===b.id&&t.status==='open');
}
function renderDashboard(){
 const today=new Date().toISOString().slice(0,10);
 const todayDate=new Date(today+'T12:00:00');
 const currentMonth=today.slice(0,7);
 const allUpcoming=bookings.filter(b=>b.event_date>=today&&b.booking_status!=='cancelled');
 const currentMonthUpcoming=allUpcoming.filter(b=>String(b.event_date||'').slice(0,7)===currentMonth);
 const outstanding=bookings.filter(b=>b.booking_status!=='cancelled').reduce((sum,b)=>sum+Math.max(0,Number(b.total_amount||0)-totalPaid(b.id)),0);
 const allOpenTasks=tasks.filter(t=>t.status==='open'&&bookings.some(b=>b.id===t.booking_id&&b.booking_status!=='cancelled'));
 const openTasks=allOpenTasks.filter(t=>{
   const due=new Date(t.due_date+'T12:00:00'),showFrom=new Date(due);showFrom.setDate(showFrom.getDate()-14);
   return todayDate>=showFrom;
 });
 const outstandingEnquiries=enquiries.filter(e=>e.status!=='accepted'&&e.status!=='declined');
 const activeStaffingIds=new Set(staffingEvents.map(e=>e.id));
 const staffingRequests=staffingSignups.filter(s=>s.status==='pending'&&activeStaffingIds.has(s.event_id)).length;
 const eventsNeedStaff=staffingEvents.filter(e=>staffingFilledCount(e)<Number(e.staff_required||0)).length;
 $('statUpcoming').textContent=allUpcoming.length;
 $('statOutstanding').textContent=money(outstanding);
 $('statTasks').textContent=allOpenTasks.length;
 $('statPending').textContent=outstandingEnquiries.length;
 $('statStaffRequests').textContent=staffingRequests;
 $('statNeedStaff').textContent=eventsNeedStaff;
 $('dashboardEvents').innerHTML=currentMonthUpcoming.map(bookingCardMini).join('')||'<p class="muted">No more bookings this month.</p>';
 $('dashboardTasks').innerHTML=openTasks.slice(0,8).map(t=>{
   const b=bookings.find(x=>x.id===t.booking_id);const overdue=t.due_date<today;
   return '<div class="list-card task-card"><label class="task-check"><input type="checkbox" data-complete-task="'+t.id+'"><span></span></label><div class="task-copy"><b>'+esc(t.title)+'</b><div class="meta"><strong>'+esc(b?.customer_name||'Unknown host')+'</strong>'+(b?.event_name?' · '+esc(b.event_name):'')+' · due '+dmy(t.due_date)+'</div></div><span class="badge '+(overdue?'overdue':'awaiting')+'">'+(overdue?'OVERDUE':'OPEN')+'</span></div>'
 }).join('')||'<p class="muted">Nothing outstanding.</p>';
 document.querySelectorAll('[data-complete-task]').forEach(x=>x.onchange=()=>setTaskCompleted(x.dataset.completeTask,true,x));
 document.querySelectorAll('[data-dashboard-booking]').forEach(x=>x.onclick=()=>openBooking(x.dataset.dashboardBooking,true));
}
async function setTaskCompleted(id,isCompleted,input){
 if(input)input.disabled=true;
 const r=await db.from('booking_tasks').update({status:isCompleted?'completed':'open',completed_at:isCompleted?new Date().toISOString():null}).eq('id',id);
 if(r.error){if(input){input.checked=!isCompleted;input.disabled=false}return alert(r.error.message)}
 await refreshAdminData();
 const bookingId=tasks.find(t=>t.id===id)?.booking_id;
 if(bookingId&&$('editBookingId')?.value===bookingId)renderEventChecklist(bookingId);
}
function bookingCardMini(b){return '<div class="list-card clickable" data-dashboard-booking="'+b.id+'"><div class="row"><div><div class="event-name">'+esc(b.customer_name)+'</div><div class="meta">'+dmy(b.event_date)+' · '+esc(b.venue)+(b.event_name?' · '+esc(b.event_name):'')+'</div></div><span class="bar-chip '+barClass(b.bar_type)+'">'+barLabel(b.bar_type)+'</span></div></div>'}
function rawResponses(e){return e?.raw_payload?.responses&&typeof e.raw_payload.responses==='object'?e.raw_payload.responses:{}}
function responseExact(e,...names){
 const wanted=names.map(x=>String(x).toLowerCase().replace(/\s+/g,' ').trim());
 for(const [k,v] of Object.entries(rawResponses(e))){
   if(wanted.includes(String(k).toLowerCase().replace(/\s+/g,' ').trim()))return String(v??'').trim();
 }
 return '';
}
function timeFromResponse(value){
 const m=String(value||'').match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);return m?String(m[1]).padStart(2,'0')+':'+m[2]:'';
}
function tensFromEnquiry(e){return /required|yes/i.test(responseExact(e,'Temporary Events notice requirements','TENS required'))}
function requirementGroup(question){
 const q=question.toLowerCase();
 if(/name|email|phone/.test(q)&&!/venue contact/.test(q))return 'Customer';
 if(/event|guest|date|bar close|opening time|entertainment/.test(q))return 'Event';
 if(/bar design|drink|cocktail|paying/.test(q))return 'Bar & drinks';
 if(/venue|setup|colour|theme/.test(q))return 'Venue & setup';
 if(/temporary events|confirm|contract|terms/.test(q))return 'Compliance';
 return 'Other';
}
function openEnquiryDetail(id){
 const e=enquiries.find(x=>x.id===id);if(!e)return;
 $('detailTitle').textContent=e.event_name||e.customer_name||'Enquiry';
 $('detailSummary').innerHTML=[
   ['Customer',e.customer_name||'—'],['Event date',dmy(e.event_date)],['Venue',e.venue||'TBC'],['Bar',barLabel(e.bar_type)],
   ['Email',e.customer_email||'—'],['Phone',e.customer_phone||'—'],['Guests',e.guest_count||'—'],['Status',String(e.status||'').replaceAll('_',' ')]
 ].map(x=>'<div class="summary-box"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('');
 const responses=rawResponses(e),groups={};
 Object.entries(responses).filter(([q,a])=>String(q).trim()&&String(a??'').trim()).forEach(([q,a])=>{const g=requirementGroup(q);(groups[g]??=[]).push([q,a])});
 const order=['Customer','Event','Bar & drinks','Venue & setup','Compliance','Other'];
 $('detailRequirements').innerHTML=order.filter(g=>groups[g]?.length).map(g=>'<section class="requirement-section"><h3>'+esc(g)+'</h3><div class="requirements-grid">'+groups[g].map(([q,a])=>'<div class="requirement-item '+(String(a).length>100?'wide':'')+'"><div class="q">'+esc(q)+'</div><div class="a">'+esc(a)+'</div></div>').join('')+'</div></section>').join('')+(e.notes?'<section class="requirement-section"><h3>Knights notes</h3><div class="requirement-item wide"><div class="a">'+esc(e.notes)+'</div></div></section>':'');
 $('detailActions').innerHTML=e.status!=='accepted'&&e.status!=='declined'?'<button class="btn green" id="detailAcceptBtn">Record fee & accept booking</button><button class="btn red" id="detailDeclineBtn">Decline enquiry</button>':'<button class="btn primary" data-close-modal>Close</button>';
 $('detailAcceptBtn')&&($('detailAcceptBtn').onclick=()=>{closeModals();openAccept(id)});
 $('detailDeclineBtn')&&($('detailDeclineBtn').onclick=()=>{closeModals();declineEnquiry(id)});
 openModal('enquiryDetailModal');
}
function renderEnquiries(){
 const visible=enquiries.filter(e=>e.status!=='accepted');
 $('enquiryList').innerHTML=visible.length?visible.map(e=>'<div class="list-card clickable" data-view-enquiry="'+e.id+'"><div class="row"><div><div class="event-name">'+esc(e.event_name||e.customer_name)+'</div><div class="meta">'+esc(e.customer_name)+' · '+dmy(e.event_date)+' · '+esc(e.venue||'Venue TBC')+'<br>'+esc(e.guest_count||'—')+' guests · '+barLabel(e.bar_type)+'</div><div class="source-tag">'+esc(e.source==='google_form'?'Google Form':'Manual')+'</div></div><span class="badge '+(e.status==='declined'?'overdue':'awaiting')+'">'+esc(e.status.replaceAll('_',' ')).toUpperCase()+'</span></div><div class="actions"><button class="btn primary" data-details="'+e.id+'">View requirements</button>'+(e.status!=='declined'?'<button class="btn green" data-accept="'+e.id+'">Record fee & accept</button><button class="btn red" data-decline="'+e.id+'">Decline</button>':'')+'</div></div>').join(''):'<p class="muted">No open enquiries.</p>';
 document.querySelectorAll('[data-details]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();openEnquiryDetail(b.dataset.details)});
 document.querySelectorAll('[data-view-enquiry]').forEach(card=>card.onclick=()=>openEnquiryDetail(card.dataset.viewEnquiry));
 document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();openAccept(b.dataset.accept)});
 document.querySelectorAll('[data-decline]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();declineEnquiry(b.dataset.decline)});
}
function bookingListCard(b){
 const paid=totalPaid(b.id),out=Math.max(0,Number(b.total_amount||0)-paid),cancelled=b.booking_status==='cancelled';
 return '<div class="list-card clickable '+(cancelled?'cancelled-booking':'')+'" data-booking="'+b.id+'"><div class="row"><div><div class="event-name">'+esc(b.customer_name)+'</div><div class="meta">'+dmy(b.event_date)+' · '+esc(b.venue)+'<br>'+esc(b.event_name)+' · '+esc(b.guest_count||'—')+' guests · '+barLabel(b.bar_type)+'</div></div><span class="badge '+(cancelled?'overdue':'booked')+'">'+esc(b.booking_status.replaceAll('_',' ')).toUpperCase()+'</span></div><div class="booking-finance"><span>Paid <b>'+money(paid)+'</b></span><span>Outstanding <b class="'+(out>0?'balance-due':'balance-clear')+'">'+money(out)+'</b></span><span>Staff <b>'+esc(b.staff_required)+'</b></span></div><div class="actions"><button class="btn primary" data-edit-booking="'+b.id+'">Edit booking & payments</button>'+(cancelled?'':'<button class="btn red" data-cancel-booking="'+b.id+'">Cancel booking</button>')+'</div></div>';
}
function bookingYearSection(year,list,labelClass=''){
 const ordered=[...list].sort((a,b)=>a.event_date.localeCompare(b.event_date));
 return '<details class="booking-year-section '+labelClass+'"><summary><span>'+year+' bookings</span><b>'+ordered.length+'</b></summary><div class="booking-year-body">'+ordered.map(bookingListCard).join('')+'</div></details>';
}
function renderBookings(){
 const now=new Date(),currentYear=now.getFullYear();
 const active=bookings.filter(b=>b.booking_status!=='cancelled');
 const current=active.filter(b=>Number(String(b.event_date||'').slice(0,4))===currentYear).sort((a,b)=>a.event_date.localeCompare(b.event_date));
 const futureYears=[...new Set(active.map(b=>Number(String(b.event_date||'').slice(0,4))).filter(y=>y>currentYear))].sort((a,b)=>a-b);
 const pastYears=[...new Set(active.map(b=>Number(String(b.event_date||'').slice(0,4))).filter(y=>y<currentYear))].sort((a,b)=>b-a);
 let html='<section class="booking-current-year"><div class="booking-section-head"><h3>'+currentYear+' bookings</h3><span>'+current.length+'</span></div>'+(current.length?current.map(bookingListCard).join(''):'<p class="muted">No '+currentYear+' bookings yet.</p>')+'</section>';
 html+=futureYears.map(year=>bookingYearSection(year,active.filter(b=>Number(String(b.event_date||'').slice(0,4))===year),'future-year')).join('');
 html+=pastYears.map(year=>bookingYearSection(year,active.filter(b=>Number(String(b.event_date||'').slice(0,4))===year),'past-year')).join('');
 $('bookingList').innerHTML=active.length?html:'<p class="muted">No accepted bookings yet.</p>';
 document.querySelectorAll('[data-edit-booking]').forEach(x=>x.onclick=ev=>{ev.stopPropagation();openBooking(x.dataset.editBooking)});
 document.querySelectorAll('[data-cancel-booking]').forEach(x=>x.onclick=ev=>{ev.stopPropagation();openCancelBooking(x.dataset.cancelBooking)});
 document.querySelectorAll('[data-booking]').forEach(x=>x.onclick=()=>openBooking(x.dataset.booking));
}
function bookingCapacityIssue(date,bar,excludeId=null){
 const active=bookings.filter(b=>b.event_date===date&&b.booking_status!=='cancelled'&&b.id!==excludeId);
 if(active.length>=3)return 'This date is full — maximum 3 bookings per day.';
 const limit={luxury:1,pop_up:2,stock_and_staff:1}[bar];
 const used=active.filter(b=>b.bar_type===bar).length;
 if(limit&&used>=limit)return ({luxury:'Luxury Bar',pop_up:'Pop-Up Bar',stock_and_staff:'Stock & Staff'}[bar]||'Selected bar')+' is not available on this date.';
 return '';
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
   const dayEnquiries=enquiries.filter(e=>e.event_date===iso&&e.status!=='accepted'&&e.status!=='declined');
   const dayTasks=tasks.filter(t=>t.due_date===iso&&t.status==='open').filter(t=>bookings.some(b=>b.id===t.booking_id&&b.booking_status!=='cancelled'));
   const taskIcons=dayTasks.map(t=>{const b=bookings.find(x=>x.id===t.booking_id);return '<button class="calendar-task-icon" data-task-booking="'+t.booking_id+'" data-task-id="'+t.id+'" title="'+esc((b?.customer_name||'Booking')+' — '+t.title)+'" aria-label="Task due">☑</button>'}).join('');
   const availabilityClass=dayBookings.length?(dayBookings.length>=3?'full':dayBookings.length===2?'limited':'available'):'';
   const availabilityLabel=dayBookings.length?dayBookings.length+' of 3 confirmed bookings used':'';
   const bookingHtml=dayBookings.map(b=>'<button class="cal-event '+barClass(b.bar_type)+'" data-calendar-booking="'+b.id+'" title="'+esc(b.customer_name)+' — '+esc(b.event_name)+'">'+esc(b.customer_name)+'</button>').join('');
   const enquiryHtml=dayEnquiries.map(e=>'<button class="cal-event enquiry" data-calendar-enquiry="'+e.id+'" title="Open enquiry — '+esc(e.customer_name)+' — '+esc(e.event_name||'Event')+'">? '+esc(e.customer_name||e.event_name||'Enquiry')+'</button>').join('');
   html+='<div class="calendar-day '+(d.getMonth()!==m?'outside':'')+'"><div class="calendar-day-head"><div class="day-num '+availabilityClass+'" '+(availabilityLabel?'title="'+availabilityLabel+'" aria-label="'+availabilityLabel+'"':'')+'>'+d.getDate()+'</div><div class="calendar-task-icons">'+taskIcons+'</div></div>'+bookingHtml+enquiryHtml+'</div>';
 }
 $('calendarGrid').innerHTML=html;
 document.querySelectorAll('[data-calendar-booking]').forEach(x=>x.onclick=()=>openBooking(x.dataset.calendarBooking,true));
 document.querySelectorAll('[data-calendar-enquiry]').forEach(x=>x.onclick=()=>openEnquiryDetail(x.dataset.calendarEnquiry));
 document.querySelectorAll('[data-task-booking]').forEach(x=>x.onclick=()=>openBooking(x.dataset.taskBooking,false,x.dataset.taskId));
}
async function refreshTeamAccountStatus(){
 if(profile?.role!=='admin'){teamAccountEmails=new Set();return}
 const emails=staffInformation.map(r=>String(r.email||'').trim().toLowerCase()).filter(Boolean);
 if(!emails.length){teamAccountEmails=new Set();return}
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Admin session expired.');
   const response=await fetch(URL+'/functions/v1/team-account-actions',{
     method:'POST',
     headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},
     body:JSON.stringify({action:'status',emails})
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.error||'Could not check KMB.Hub accounts.');
   teamAccountEmails=new Set((body.existing_emails||[]).map(x=>String(x).toLowerCase()));
 }catch(e){
   console.warn('Team account status:',e);
   teamAccountEmails=new Set();
 }
}
async function inviteTeamMember(email,name){
 if(!email)return;
 if(!confirm('Send a KMB.Hub invitation to '+email+'?'))return;
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your admin session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/team-account-actions',{
     method:'POST',
     headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},
     body:JSON.stringify({action:'invite',email,name})
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.error||'Could not send invitation.');
   alert('KMB.Hub invitation accepted for sending to '+email+'. If it does not arrive within a few minutes, check Junk/Spam and use Resend invite from Team.');
   await refreshAdminData();
 }catch(e){
   alert(e.message||'Could not send invitation.');
 }
}
window.inviteTeamMember=inviteTeamMember;
function staffInfoEntries(row){
 const raw=row?.raw_data&&typeof row.raw_data==='object'?row.raw_data:{};
 const common=/^(email|e-?mail|email address|full ?name|name|first name\??|last name\??|phone number|phone|mobile|telephone|contact number|timestamp|source_updated_at|column \d+)$/i;
 const entries=Object.entries(raw).filter(([k,v])=>!common.test(String(k).trim())&&String(v??'').trim());
 const order=[
   /^home address$/i,
   /^date of birth$/i,
   /^what is your sex\?$/i,
   /^do you drive\?$/i,
   /^emergency contact name$/i,
   /^relationship$/i,
   /^do you have cocktail experience\?$/i,
   /^are you a personal licence holder\?$/i,
   /^employee statement$/i,
   /^if you have a student loan/i,
   /^national insurance number$/i,
   /^account name$/i,
   /^bank name$/i,
   /^sort code$/i,
   /^account number$/i,
   /^do you have any medical conditions/i,
   /^once you have read the above/i
 ];
 const rank=k=>{const key=String(k).trim();const i=order.findIndex(rx=>rx.test(key));return i<0?999:i};
 return entries.sort((a,b)=>rank(a[0])-rank(b[0])||String(a[0]).localeCompare(String(b[0])));
}
function isEmailValue(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}
function isPhoneValue(v){const x=String(v||'').trim();return /\d/.test(x)&&/^\+?[\d\s().-]{7,}$/.test(x)}
function teamContactValue(v){
 const value=String(v??'').trim();
 if(isEmailValue(value))return '<a class="team-contact-link" href="mailto:'+encodeURIComponent(value)+'">'+esc(value)+'</a>';
 if(isPhoneValue(value))return '<a class="team-contact-link" href="tel:'+esc(value.replace(/[^+\d]/g,''))+'">'+esc(value)+'</a>';
 return esc(value);
}
async function approveTeamStaff(id){
 const staff=staffProfiles.find(p=>p.id===id);if(!staff)return;
 if(!confirm('Approve '+(staff.full_name||staff.email)+' so they can start requesting shifts?'))return;
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your admin session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/approve-staff-member',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},body:JSON.stringify({staff_id:id})});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not approve staff account.');
   await refreshAdminData();
   alert(body.email_sent?(staff.full_name||'Staff member')+' is approved and has been emailed.':(staff.full_name||'Staff member')+' is approved, but the email could not be sent'+(body.email_error?': '+body.email_error:'.'));
 }catch(e){alert(e.message||'Could not approve staff account.')}
}
window.approveTeamStaff=approveTeamStaff;

async function declineTeamStaff(id){
 const staff=staffProfiles.find(p=>p.id===id);if(!staff)return;
 if(!confirm('Move '+(staff.full_name||staff.email)+' back to not completed?'))return;
 const r=await db.from('staff_profiles').update({registration_status:'not_completed'}).eq('id',id);
 if(r.error)return alert(r.error.message);
 await refreshAdminData();
}
window.declineTeamStaff=declineTeamStaff;

async function setTeamArchive(email,restore=false){
 const action=restore?'restore':'archive';
 if(!confirm((restore?'Rehire ':'Move ')+email+(restore?' and return them to the active team?':' to Former staff? Their history will be kept.')))return;
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your admin session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/team-account-actions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},body:JSON.stringify({action,email})});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not update this staff member.');
   await refreshAdminData();
 }catch(e){alert(e.message||'Could not update this staff member.')}
}
async function permanentlyDeleteTeamMember(email){
 if(!confirm('Permanently delete '+email+'? This cannot be undone and will remove their KMB.Hub account, staff profile, stored New Starter information and shift signup history.'))return;
 const typed=prompt('Type DELETE to permanently remove this staff member.');
 if(typed!=='DELETE')return;
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your admin session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/team-account-actions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},body:JSON.stringify({action:'delete',email})});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not permanently delete this staff member.');
   await refreshAdminData();
   alert('Staff member permanently deleted.');
 }catch(e){alert(e.message||'Could not permanently delete this staff member.')}
}
window.archiveTeamMember=email=>setTeamArchive(email,false);
window.restoreTeamMember=email=>setTeamArchive(email,true);
window.permanentlyDeleteTeamMember=permanentlyDeleteTeamMember;

function openTeamPasswordReset(profileId){
 const p=staffProfiles.find(x=>x.id===profileId);if(!p)return;
 $('teamPasswordUserId').value=profileId;
 $('teamPasswordName').textContent=(p.full_name||p.email)+' · '+p.email;
 $('teamNewPassword').value='';$('teamConfirmPassword').value='';$('teamPasswordMsg').textContent='';
 openModal('teamPasswordModal');
}
window.openTeamPasswordReset=openTeamPasswordReset;

async function saveTeamPassword(){
 const id=$('teamPasswordUserId').value,password=$('teamNewPassword').value,confirmPassword=$('teamConfirmPassword').value;
 if(password.length<8)return $('teamPasswordMsg').textContent='Password must be at least 8 characters.';
 if(password!==confirmPassword)return $('teamPasswordMsg').textContent='Passwords do not match.';
 $('teamSavePasswordBtn').disabled=true;$('teamPasswordMsg').textContent='Saving…';
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your admin session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/admin-reset-staff-password',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},body:JSON.stringify({action:'reset',user_id:id,password})});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not change password.');
   $('teamPasswordMsg').textContent='Password changed successfully.';
   setTimeout(closeModals,700);
 }catch(e){$('teamPasswordMsg').textContent=e.message||'Could not change password.'}
 finally{$('teamSavePasswordBtn').disabled=false}
}

function teamDisplayName(row){
 const raw=row?.raw_data||{},first=String(raw['First name?']||'').trim(),last=String(raw['Last name?']||'').trim();
 return (first||last)?[first,last].filter(Boolean).join(' '):(row?.full_name||'Unnamed staff member');
}
function combinedTeamRows(){
 const byEmail=new Map();
 staffInformation.forEach(r=>byEmail.set(String(r.email||'').trim().toLowerCase(),{...r}));
 staffProfiles.filter(p=>p.role==='staff').forEach(p=>{
   const email=String(p.email||'').trim().toLowerCase();
   if(!email)return;
   if(byEmail.has(email))byEmail.set(email,{...byEmail.get(email),profile_id:p.id,profile:p});
   else byEmail.set(email,{id:'profile-'+p.id,profile_id:p.id,full_name:p.full_name,email:p.email,phone:null,raw_data:{},synced_at:null,is_archived:p.registration_status==='inactive',profile:p});
 });
 return [...byEmail.values()];
}
function renderTeamCard(r,former=false){
 const extras=staffInfoEntries(r),displayName=teamDisplayName(r),email=String(r.email||'').trim(),p=r.profile||staffProfiles.find(x=>String(x.email||'').toLowerCase()===email.toLowerCase()),signedUp=teamAccountEmails.has(email.toLowerCase()),inactive=former||r.is_archived||p?.registration_status==='inactive';
 const accountBadge=inactive?'<span class="badge">Former staff</span>':'<span class="badge '+(signedUp?'booked':'awaiting')+'">'+(signedUp?'KMB.Hub account active':'Not signed up')+'</span>';
 const buttons=inactive
   ? '<button class="btn green compact" type="button" onclick="restoreTeamMember(\''+esc(email)+'\')">Rehire</button><button class="btn red compact" type="button" onclick="permanentlyDeleteTeamMember(\''+esc(email)+'\')">Permanently delete</button>'
   : ((signedUp&&p?.id)?'<button class="btn gold compact" type="button" onclick="openTeamPasswordReset(\''+p.id+'\')">Reset password</button>':'')+
     (!signedUp&&email?'<button class="btn gold compact" type="button" onclick="inviteTeamMember(\''+esc(email)+'\',\''+esc(displayName.replaceAll("'","&#39;"))+'\')">'+(r.invite_sent_at?'Resend invite':'Invite to KMB.Hub')+'</button>':'')+
     '<button class="btn red compact" type="button" onclick="archiveTeamMember(\''+esc(email)+'\')">Move to former staff</button>';
 return '<article class="team-card"><div class="team-card-head"><div><h3>'+esc(displayName)+'</h3><div class="small muted">'+(r.synced_at?'Synced '+new Date(r.synced_at).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'KMB.Hub staff record')+'</div></div>'+accountBadge+'</div><div class="team-primary">'+
   (email?'<div><span>Email</span><a href="mailto:'+encodeURIComponent(email)+'">'+esc(email)+'</a></div>':'')+
   (r.phone?'<div><span>Phone</span><a href="tel:'+esc(String(r.phone).replace(/[^+\d]/g,''))+'">'+esc(r.phone)+'</a></div>':'')+
   '</div>'+(r.invite_sent_at&&!signedUp?'<div class="small muted">Invite last sent '+new Date(r.invite_sent_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+(r.invite_error?' · email error':'')+'</div>':'')+(r.invite_error&&!signedUp?'<div class="small" style="color:var(--red)">Invite email failed: '+esc(r.invite_error)+'</div>':'')+'<div class="actions team-actions">'+buttons+'</div>'+
   (extras.length?'<details class="team-details"><summary>View all staff information</summary><div class="team-info-grid">'+extras.map(([k,v])=>'<div class="team-info-row"><span>'+esc(k)+'</span><b>'+teamContactValue(v)+'</b></div>').join('')+'</div></details>':'<p class="small muted">No additional form details synced yet.</p>')+'</article>';
}
function renderTeam(){
 const host=$('teamList');if(!host)return;
 const combined=combinedTeamRows();
 const profileByEmail=new Map(staffProfiles.filter(p=>p.role==='staff').map(p=>[String(p.email||'').trim().toLowerCase(),p]));
 combined.forEach(r=>{r.profile=profileByEmail.get(String(r.email||'').trim().toLowerCase())||r.profile});
 const pending=staffProfiles.filter(p=>p.role==='staff'&&!['approved','inactive'].includes(p.registration_status));
 const former=combined.filter(r=>r.is_archived||r.profile?.registration_status==='inactive');
 const active=combined.filter(r=>!r.is_archived&&(!r.profile||r.profile.registration_status==='approved'));
 const query=String($('teamSearch')?.value||'').trim().toLowerCase();
 const activeFiltered=active.filter(r=>!query||[teamDisplayName(r),r.email,r.phone,JSON.stringify(r.raw_data||{})].some(v=>String(v||'').toLowerCase().includes(query)));
 const latest=staffInformation.map(r=>r.synced_at).filter(Boolean).sort().at(-1);
 $('teamActiveCount').textContent=active.length;
 $('teamPendingCount').textContent=pending.length;
 $('teamShiftRequestCount').textContent=staffingSignups.filter(s=>s.status==='pending'&&staffingEvents.some(e=>e.id===s.event_id)).length;
 $('formerTeamCount').textContent=former.length;
 const status=$('teamSyncStatus');if(status)status.textContent=staffInformation.length?(staffInformation.length+' synced record'+(staffInformation.length===1?'':'s')+(latest?' · Last synced '+new Date(latest).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'')):'Waiting for staff information sync';
 $('teamApprovalList').innerHTML=pending.length?pending.map(p=>'<div class="list-card"><div class="row"><div><b>'+esc(p.full_name||p.email)+'</b><div class="meta">'+esc(p.email)+' · '+esc(String(p.registration_status||'').replaceAll('_',' '))+'</div></div><div class="actions"><button class="btn green compact" type="button" onclick="approveTeamStaff(\''+p.id+'\')">Approve</button><button class="btn red compact" type="button" onclick="declineTeamStaff(\''+p.id+'\')">Decline</button></div></div></div>').join(''):'<p class="muted">No staff waiting for approval.</p>';
 host.innerHTML=activeFiltered.length?'<div class="team-grid">'+activeFiltered.map(r=>renderTeamCard(r,false)).join('')+'</div>':'<p class="muted">'+(active.length?'No matching staff.':'No active staff records yet.')+'</p>';
 $('formerTeamList').innerHTML=former.length?'<div class="team-grid">'+former.map(r=>renderTeamCard(r,true)).join('')+'</div>':'<p class="muted">No former staff.</p>';
}
function requirementRows(obj){
 const entries=Object.entries(obj||{}).filter(([q,a])=>String(q).trim()&&String(a??'').trim());
 return entries.length?'<div class="requirements-grid">'+entries.map(([q,a])=>'<div class="requirement-item '+(String(a).length>100?'wide':'')+'"><div class="q">'+esc(q)+'</div><div class="a">'+esc(a)+'</div></div>').join('')+'</div>':'<p class="muted">No original form requirements stored.</p>';
}
function renderPaymentHistory(bookingId){
 const list=payments.filter(p=>p.booking_id===bookingId).sort((a,b)=>new Date(b.paid_at)-new Date(a.paid_at));
 $('paymentHistory').innerHTML=list.length?list.map(p=>'<div class="payment-row"><div><b>'+money(p.amount)+'</b><div class="meta">'+esc(String(p.payment_type||'other').replaceAll('_',' '))+' · '+esc(p.method||'Method not recorded')+(p.reference?' · '+esc(p.reference):'')+'</div></div><span class="meta">'+new Date(p.paid_at).toLocaleDateString('en-GB')+'</span></div>').join(''):'<p class="muted">No payments recorded yet.</p>';
}
function refreshBookingBalance(b){
 const paid=totalPaid(b.id),out=Math.max(0,Number(b.total_amount||0)-paid);
 $('bookingBalanceSummary').innerHTML='<div><span>Total</span><b>'+money(b.total_amount)+'</b></div><div><span>Paid</span><b>'+money(paid)+'</b></div><div><span>Outstanding</span><b class="'+(out>0?'balance-due':'balance-clear')+'">'+money(out)+'</b></div>';
}
function renderEventChecklist(bookingId){
 const standard=checklistItems.filter(x=>x.booking_id===bookingId).sort((a,b)=>a.sort_order-b.sort_order);
 const dated=tasks.filter(t=>t.booking_id===bookingId).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)));
 const standardHtml=standard.map(x=>'<label class="checklist-row"><input type="checkbox" data-checklist-id="'+x.id+'" '+(x.is_completed?'checked':'')+'><span><b>'+esc(x.title)+'</b></span></label>').join('');
 const taskHtml=dated.map(t=>'<label class="checklist-row dated" id="task-row-'+t.id+'"><input type="checkbox" data-task-toggle="'+t.id+'" '+(t.status==='completed'?'checked':'')+'><span><b>'+esc(t.title)+'</b><small>Due '+dmy(t.due_date)+(t.status==='completed'?' · completed':'')+'</small></span></label>').join('');
 $('eventChecklist').innerHTML='<div class="checklist-group"><div class="checklist-label">Requirements</div>'+(standardHtml||'<p class="muted">No requirement checks.</p>')+'</div><div class="checklist-group"><div class="checklist-label">Dated actions</div>'+(taskHtml||'<p class="muted">No dated actions.</p>')+'</div>';
 document.querySelectorAll('[data-checklist-id]').forEach(x=>x.onchange=()=>toggleChecklistItem(x.dataset.checklistId,x.checked,x));
 document.querySelectorAll('[data-task-toggle]').forEach(x=>x.onchange=()=>setTaskCompleted(x.dataset.taskToggle,x.checked,x));
}
async function toggleChecklistItem(id,isCompleted,input){
 input.disabled=true;
 const r=await db.from('booking_checklist_items').update({is_completed:isCompleted,completed_at:isCompleted?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id);
 if(r.error){input.checked=!isCompleted;input.disabled=false;return alert(r.error.message)}
 await refreshAdminData();
 const item=checklistItems.find(x=>x.id===id);
 if(item&&$('editBookingId')?.value===item.booking_id)renderEventChecklist(item.booking_id);
}
async function ensureChecklistForBooking(bookingId){
 const rows=[
   {booking_id:bookingId,item_key:'electric_confirmed',title:'Electric supply confirmed',sort_order:10},
   {booking_id:bookingId,item_key:'water_confirmed',title:'Water supply confirmed',sort_order:20},
   {booking_id:bookingId,item_key:'venue_access_confirmed',title:'Venue access / setup confirmed',sort_order:30}
 ];
 const r=await db.from('booking_checklist_items').upsert(rows,{onConflict:'booking_id,item_key'});
 if(r.error)throw r.error;
}
function openBooking(id,showRequirements=false,focusTaskId=null){
 const b=bookings.find(x=>x.id===id);if(!b)return;
 $('editBookingId').value=id;$('bookingModalTitle').textContent=b.customer_name||b.event_name;
 $('editCustomer').value=b.customer_name||'';$('editEmail').value=b.customer_email||'';$('editPhone').value=b.customer_phone||'';
 $('editEvent').value=b.event_name||'';$('editDate').value=b.event_date||'';$('editVenue').value=b.venue||'';$('editGuests').value=b.guest_count||'';
 $('editBar').value=b.bar_type;$('editTotal').value=Number(b.total_amount||0);$('editStaff').value=b.staff_required||1;
 $('editArrival').value=String(b.arrival_time||'').slice(0,5);$('editStart').value=String(b.start_time||'').slice(0,5);$('editFinish').value=String(b.finish_time||'').slice(0,5);
 $('editTens').checked=!!b.tens_required;$('editNotes').value=b.notes||'';
 $('paymentAmount').value='';$('paymentType').value='balance';$('paymentMethod').value='Bank transfer';$('paymentReference').value='';
 $('bookingEditMsg').textContent='';$('paymentMsg').textContent='';
 $('cancelBookingBtn').classList.toggle('hidden',b.booking_status==='cancelled');
 refreshBookingBalance(b);renderPaymentHistory(id);renderEventChecklist(id);
 $('bookingRequirements').innerHTML=requirementRows(b.requirements);
 $('bookingRequirementsWrap').open=!!showRequirements;
 openModal('bookingModal');
 if(focusTaskId){
   setTimeout(()=>{
     const row=$('task-row-'+focusTaskId);
     if(row){
       document.querySelectorAll('.checklist-row.task-focus').forEach(x=>x.classList.remove('task-focus'));
       row.classList.add('task-focus');
       row.scrollIntoView({behavior:'smooth',block:'center'});
       setTimeout(()=>row.classList.remove('task-focus'),2400);
     }else{
       $('eventChecklist')?.scrollIntoView({behavior:'smooth',block:'start'});
     }
   },140);
 }else if(showRequirements){
   setTimeout(()=>$('bookingRequirementsWrap')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
 }
}
function openCancelBooking(id){
 const b=bookings.find(x=>x.id===id);if(!b||b.booking_status==='cancelled')return;
 $('cancelBookingId').value=id;
 $('cancelBookingText').innerHTML='Cancel <b>'+esc(b.customer_name)+'</b> — '+esc(b.event_name)+' on '+dmy(b.event_date)+'?';
 $('cancelBookingMsg').textContent='';
 openModal('cancelBookingModal');
}
async function confirmCancelBooking(){
 const id=$('cancelBookingId').value,b=bookings.find(x=>x.id===id);if(!b)return;
 $('confirmCancelBookingBtn').disabled=true;$('cancelBookingMsg').textContent='Cancelling booking…';
 let bookingChanged=false;
 try{
   const r=await db.from('bookings').update({booking_status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id);
   if(r.error)throw r.error;bookingChanged=true;
   if(b.staffing_event_id){
     const er=await db.from('bar_events').update({is_cancelled:true}).eq('id',b.staffing_event_id);
     if(er.error)throw er.error;
   }
   closeModals();
   await refreshAdminData();
   switchView('bookings');
 }catch(e){
   if(bookingChanged)await db.from('bookings').update({booking_status:b.booking_status,updated_at:new Date().toISOString()}).eq('id',id);
   $('cancelBookingMsg').textContent=e.message||'Could not cancel booking.';
 }finally{$('confirmCancelBookingBtn').disabled=false}
}
async function saveBooking(){
 const id=$('editBookingId').value,b=bookings.find(x=>x.id===id);if(!b)return;
 const payload={
   customer_name:$('editCustomer').value.trim(),customer_email:$('editEmail').value.trim()||null,customer_phone:$('editPhone').value.trim()||null,
   event_name:$('editEvent').value.trim(),event_date:$('editDate').value,venue:$('editVenue').value.trim(),
   guest_count:$('editGuests').value?Number($('editGuests').value):null,bar_type:$('editBar').value,total_amount:Number($('editTotal').value||0),
   staff_required:Number($('editStaff').value||1),arrival_time:$('editArrival').value||null,start_time:$('editStart').value||null,finish_time:$('editFinish').value||null,
   tens_required:$('editTens').checked,notes:$('editNotes').value.trim()||null,updated_at:new Date().toISOString()
 };
 if(!payload.customer_name||!payload.event_name||!payload.event_date||!payload.venue)return $('bookingEditMsg').textContent='Host, event name, date and venue are required.';
 const capacityIssue=bookingCapacityIssue(payload.event_date,payload.bar_type,id);if(capacityIssue)return $('bookingEditMsg').textContent=capacityIssue;
 $('saveBookingBtn').disabled=true;$('bookingEditMsg').textContent='Saving…';
 try{
   const r=await db.from('bookings').update(payload).eq('id',id);if(r.error)throw r.error;
   await ensureChecklistForBooking(id);
   if(b.staffing_event_id){
     const er=await db.from('bar_events').update({event_name:payload.event_name,event_date:payload.event_date,venue:payload.venue,guest_count:payload.guest_count,bar_package:barLabel(payload.bar_type),staff_required:payload.staff_required,arrival_time:payload.arrival_time,start_time:payload.start_time,finish_time:payload.finish_time,notes:payload.notes}).eq('id',b.staffing_event_id);
     if(er.error)throw er.error;
   }
   if(payload.event_date!==b.event_date){
     const date=new Date(payload.event_date+'T12:00:00'),six=new Date(date),fourteen=new Date(date);six.setDate(six.getDate()-42);fourteen.setDate(fourteen.getDate()-14);
     const fmt=x=>[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
     const [t1,t2]=await Promise.all([
       db.from('booking_tasks').update({due_date:fmt(six)}).eq('booking_id',id).eq('task_type','six_week_check'),
       db.from('booking_tasks').update({due_date:fmt(fourteen)}).eq('booking_id',id).eq('task_type','final_numbers')
     ]);
     if(t1.error)throw t1.error;if(t2.error)throw t2.error;
   }
   await refreshAdminData();
   const updated=bookings.find(x=>x.id===id);if(updated){refreshBookingBalance(updated);renderPaymentHistory(id)}
   $('bookingEditMsg').textContent='Saved.';
 }catch(e){$('bookingEditMsg').textContent=e.message||'Could not save booking.'}
 finally{$('saveBookingBtn').disabled=false}
}
function supportCategoryLabel(x){return ({app_issue:'App issue',login:'Login',staffing:'Staffing',bookings:'Bookings',stock:'Stock',other:'Other'}[x]||x||'Other')}
function supportStatusLabel(x){return String(x||'open').replaceAll('_',' ')}
async function loadSupportTickets(){
 const r=await db.from('support_tickets').select('*').order('created_at',{ascending:false}).limit(100);
 if(r.error)throw r.error;
 supportTickets=r.data||[];
 $('supportTicketsTitle').textContent=profile?.role==='admin'?'Support tickets':'My tickets';
 renderSupportTickets();
}
function renderSupportTickets(){
 $('supportTicketsList').innerHTML=supportTickets.length?supportTickets.map(t=>{
   const when=new Date(t.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
   const retryEmail=t.email_error&&!t.email_sent_at?'<button class="btn ghost compact" data-ticket-retry="'+t.id+'">Retry email</button>':'';
   const adminActions=profile?.role==='admin'?'<div class="actions">'+retryEmail+(t.status!=='in_progress'?'<button class="btn ghost compact" data-ticket-status="'+t.id+'" data-status="in_progress">In progress</button>':'')+(t.status!=='resolved'?'<button class="btn green compact" data-ticket-status="'+t.id+'" data-status="resolved">Resolve</button>':'<button class="btn ghost compact" data-ticket-status="'+t.id+'" data-status="open">Reopen</button>')+'</div>':'';
   return '<div class="support-ticket"><div class="row"><div><b>'+esc(t.subject)+'</b><div class="meta">#'+esc(String(t.id).slice(0,8).toUpperCase())+' · '+esc(supportCategoryLabel(t.category))+' · '+esc(when)+(profile?.role==='admin'?' · '+esc(t.reporter_name||'Unknown user'):'')+'</div></div><span class="badge '+(t.status==='resolved'?'booked':t.status==='in_progress'?'awaiting':'overdue')+'">'+esc(supportStatusLabel(t.status).toUpperCase())+'</span></div><p class="support-description">'+esc(t.description)+'</p>'+adminActions+'</div>';
 }).join(''):'<p class="muted">No support tickets yet.</p>';
 document.querySelectorAll('[data-ticket-status]').forEach(b=>b.onclick=()=>setSupportStatus(b.dataset.ticketStatus,b.dataset.status));
 document.querySelectorAll('[data-ticket-retry]').forEach(b=>b.onclick=()=>retrySupportEmail(b.dataset.ticketRetry,b));
}
async function submitSupportTicket(){
 const category=$('supportCategory').value,subject=$('supportSubject').value.trim(),description=$('supportDescription').value.trim();
 if(subject.length<3)return $('supportMsg').textContent='Add a short subject.';
 if(description.length<5)return $('supportMsg').textContent='Tell us a little more about what happened.';
 $('supportSubmitBtn').disabled=true;$('supportMsg').textContent='Submitting…';
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/submit-support-ticket',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},body:JSON.stringify({category,subject,description,page:$('viewTitle').textContent})});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not submit support ticket.');
   $('supportSubject').value='';$('supportDescription').value='';
   $('supportMsg').textContent=body.email_sent?'Ticket #'+String(body.ticket_ref||'').toUpperCase()+' submitted and email alert sent.':'Ticket #'+String(body.ticket_ref||'').toUpperCase()+' submitted. The ticket is saved, but the email alert could not be sent.';
   await loadSupportTickets();
 }catch(e){$('supportMsg').textContent=e.message||'Could not submit support ticket.'}
 finally{$('supportSubmitBtn').disabled=false}
}
async function retrySupportEmail(id,button){
 if(button)button.disabled=true;
 try{
   const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your session has expired. Please sign in again.');
   const response=await fetch(URL+'/functions/v1/submit-support-ticket',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':KEY},body:JSON.stringify({action:'retry_email',ticket_id:id})});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not retry support email.');
   if(!body.email_sent)throw new Error(body.email_error||'Email still could not be sent.');
   await loadSupportTickets();
   alert('Support email sent successfully.');
 }catch(e){alert(e.message||'Could not retry support email.')}
 finally{if(button)button.disabled=false}
}
async function setSupportStatus(id,status){
 const r=await db.from('support_tickets').update({status,updated_at:new Date().toISOString()}).eq('id',id);
 if(r.error)return alert(r.error.message);
 await loadSupportTickets();
}

async function addPayment(){
 const id=$('editBookingId').value,b=bookings.find(x=>x.id===id);if(!b)return;
 const amount=Number($('paymentAmount').value||0);if(amount<=0)return $('paymentMsg').textContent='Enter the payment amount received.';
 $('addPaymentBtn').disabled=true;$('paymentMsg').textContent='Recording…';
 try{
   const r=await db.from('booking_payments').insert({booking_id:id,amount,payment_type:$('paymentType').value,method:$('paymentMethod').value||null,reference:$('paymentReference').value.trim()||null});
   if(r.error)throw r.error;
   await refreshAdminData();
   const updated=bookings.find(x=>x.id===id);if(updated){refreshBookingBalance(updated);renderPaymentHistory(id)}
   $('paymentAmount').value='';$('paymentReference').value='';$('paymentMsg').textContent='Payment recorded.';
 }catch(e){$('paymentMsg').textContent=e.message||'Could not record payment.'}
 finally{$('addPaymentBtn').disabled=false}
}
function openModal(id){$(id).classList.remove('hidden')}
function closeModals(){document.querySelectorAll('.modal-bg').forEach(m=>m.classList.add('hidden'))}
async function saveEnquiry(){
 const customer=$('eqCustomer').value.trim();if(!customer)return $('enquiryMsg').textContent='Customer name is required.';
 const payload={source:'manual',customer_name:customer,customer_email:$('eqEmail').value.trim()||null,customer_phone:$('eqPhone').value.trim()||null,event_name:$('eqEvent').value.trim()||null,event_date:$('eqDate').value||null,venue:$('eqVenue').value.trim()||null,guest_count:$('eqGuests').value?Number($('eqGuests').value):null,bar_type:$('eqBar').value,notes:$('eqNotes').value.trim()||null,status:'enquiry'};
 $('saveEnquiryBtn').disabled=true;$('enquiryMsg').textContent='Saving…';
 try{const r=await db.from('booking_enquiries').insert(payload);if(r.error)throw r.error;closeModals();await refreshAdminData()}catch(e){$('enquiryMsg').textContent=e.message}finally{$('saveEnquiryBtn').disabled=false}
}
function openAccept(id){
 const e=enquiries.find(x=>x.id===id);if(!e)return;
 $('acceptEnquiryId').value=id;
 $('acceptEvent').value=e.event_name||'';
 $('acceptDate').value=e.event_date||'';
 $('acceptVenue').value=e.venue||'';
 $('acceptGuests').value=e.guest_count||'';
 $('acceptBar').value=e.bar_type||'pop_up';
 $('acceptFee').value='50';$('acceptTotal').value='0';$('acceptStaff').value='3';
 $('acceptMethod').value='Bank transfer';$('acceptReference').value='';
 $('acceptArrival').value='';
 $('acceptStart').value=timeFromResponse(responseExact(e,'Event Date & Bar opening time','Bar opening time'));
 $('acceptFinish').value=timeFromResponse(responseExact(e,'Bar close'));
 $('acceptTens').checked=tensFromEnquiry(e);
 $('acceptMsg').textContent='';openModal('acceptModal')
}
async function declineEnquiry(id){if(!confirm('Decline this enquiry?'))return;const r=await db.from('booking_enquiries').update({status:'declined',updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return alert(r.error.message);await refreshAdminData()}
async function acceptBooking(){
 const id=$('acceptEnquiryId').value,e=enquiries.find(x=>x.id===id);if(!e)return;
 const fee=Number($('acceptFee').value||0);
 const eventName=$('acceptEvent').value.trim(),eventDate=$('acceptDate').value,venue=$('acceptVenue').value.trim();
 const guests=$('acceptGuests').value?Number($('acceptGuests').value):null,bar=$('acceptBar').value;
 if(fee<=0)return $('acceptMsg').textContent='Record the booking fee paid before accepting.';
 if(!eventName||!eventDate||!venue)return $('acceptMsg').textContent='Event name, date and venue are required.';
 const capacityIssue=bookingCapacityIssue(eventDate,bar);if(capacityIssue)return $('acceptMsg').textContent=capacityIssue;
 $('confirmAcceptBtn').disabled=true;$('acceptMsg').textContent='Creating booking and staffing event…';
 let eventId=null,bookingId=null;
 try{
   const staffRequired=Number($('acceptStaff').value||1),arrival=$('acceptArrival').value||null,start=$('acceptStart').value||null,finish=$('acceptFinish').value||null;
   const ev=await db.from('bar_events').insert({event_name:eventName,event_date:eventDate,venue,arrival_time:arrival,start_time:start,finish_time:finish,staff_required:staffRequired,bar_package:barLabel(bar),guest_count:guests,notes:e.notes}).select('id').single();
   if(ev.error)throw ev.error;eventId=ev.data.id;
   const br=await db.from('bookings').insert({enquiry_id:e.id,customer_name:e.customer_name,customer_email:e.customer_email,customer_phone:e.customer_phone,event_name:eventName,event_date:eventDate,venue,guest_count:guests,bar_type:bar,staff_required:staffRequired,arrival_time:arrival,start_time:start,finish_time:finish,total_amount:Number($('acceptTotal').value||0),booking_fee_due:fee,booking_status:'booked',tens_required:$('acceptTens').checked,staffing_event_id:eventId,notes:e.notes,requirements:rawResponses(e)}).select('id').single();
   if(br.error)throw br.error;bookingId=br.data.id;
   const pay=await db.from('booking_payments').insert({booking_id:bookingId,amount:fee,payment_type:'booking_fee',method:$('acceptMethod').value||null,reference:$('acceptReference').value.trim()||null});
   if(pay.error)throw pay.error;
   const date=new Date(eventDate+'T12:00:00'),six=new Date(date),fourteen=new Date(date);six.setDate(six.getDate()-42);fourteen.setDate(fourteen.getDate()-14);
   const fmt=x=>[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
   const tr=await db.from('booking_tasks').insert([
     {booking_id:bookingId,task_type:'six_week_check',title:($('acceptTens').checked?'Confirm payment & apply for TENS':'Confirm payment & event requirements'),due_date:fmt(six)},
     {booking_id:bookingId,task_type:'final_numbers',title:'Confirm final guest numbers',due_date:fmt(fourteen)}
   ]);
   if(tr.error)throw tr.error;
   await ensureChecklistForBooking(bookingId);
   const er=await db.from('booking_enquiries').update({status:'accepted',event_name:eventName,event_date:eventDate,venue,guest_count:guests,bar_type:bar,updated_at:new Date().toISOString()}).eq('id',e.id);if(er.error)throw er.error;
   closeModals();await refreshAdminData();switchView('bookings');
 }catch(err){
   $('acceptMsg').textContent=err.message||'Could not accept booking.';
   if(bookingId)await db.from('bookings').delete().eq('id',bookingId);
   if(eventId)await db.from('bar_events').delete().eq('id',eventId);
 }finally{$('confirmAcceptBtn').disabled=false}
}
$('supportSubmitBtn').onclick=submitSupportTicket;
if('serviceWorker' in navigator){
 window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(e=>console.warn('Service worker:',e)));
}
window.addEventListener('beforeinstallprompt',e=>{
 e.preventDefault();
 deferredInstallPrompt=e;
 $('installAppBtn')?.classList.remove('hidden');
});
window.addEventListener('appinstalled',()=>{
 deferredInstallPrompt=null;
 $('installAppBtn')?.classList.add('hidden');
});
$('installAppBtn').onclick=async()=>{
 if(!deferredInstallPrompt){
   alert('On iPhone/iPad, use Share → Add to Home Screen. On Android/desktop, use your browser’s Install app option.');
   return;
 }
 deferredInstallPrompt.prompt();
 try{await deferredInstallPrompt.userChoice}catch(_){}
 deferredInstallPrompt=null;
 $('installAppBtn').classList.add('hidden');
};
$('loginBtn').onclick=login;
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('logoutBtn').onclick=async()=>{await db.auth.signOut({scope:'local'});showAuth()};
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('[data-jump]').forEach(b=>{b.onclick=()=>switchView(b.dataset.jump);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();switchView(b.dataset.jump)}}});
$('mobileMenuBtn').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
$('newEnquiryBtn').onclick=()=>{['eqCustomer','eqEmail','eqPhone','eqEvent','eqDate','eqVenue','eqGuests','eqNotes'].forEach(id=>$(id).value='');$('enquiryMsg').textContent='';openModal('enquiryModal')};
$('saveEnquiryBtn').onclick=saveEnquiry;$('confirmAcceptBtn').onclick=acceptBooking;$('saveBookingBtn').onclick=saveBooking;$('addPaymentBtn').onclick=addPayment;$('cancelBookingBtn').onclick=()=>openCancelBooking($('editBookingId').value);$('confirmCancelBookingBtn').onclick=confirmCancelBooking;$('keepBookingBtn').onclick=()=>$('cancelBookingModal').classList.add('hidden');
document.querySelectorAll('[data-close-modal]').forEach(b=>b.onclick=closeModals);
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModals()}));
$('teamSearch')?.addEventListener('input',renderTeam);
$('teamSavePasswordBtn')?.addEventListener('click',saveTeamPassword);
$('teamShiftRequestsCard')?.addEventListener('click',()=>{switchView('staffing');setTimeout(()=>{try{$('staffingFrame')?.contentWindow?.postMessage({type:'knights-show-admin'},window.location.origin)}catch(_){}},150)});
$('teamShiftRequestsCard')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('teamShiftRequestsCard').click()}});
$('prevMonth').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()};
$('nextMonth').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()};
$('staffingFrame')?.addEventListener('load',()=>{if(!$('staffingView')?.classList.contains('hidden')){try{$('staffingFrame').contentWindow?.postMessage({type:'knights-show-shifts'},window.location.origin)}catch(_){}}});
window.addEventListener('message',e=>{
 if(e.origin!==window.location.origin||!e.data)return;
 if(e.data.type==='knights-open-booking'&&e.data.staffingEventId){
   const b=bookings.find(x=>x.staffing_event_id===e.data.staffingEventId);
   if(!b)return alert('This staffing event is not linked to a booking.');
   switchView('bookings');openBooking(b.id,true);
 }
 if(e.data.type==='knights-staffing-changed'&&profile?.role==='admin'){
   refreshStaffingSummary().then(renderDashboard).catch(err=>console.warn('Staffing summary refresh:',err));
 }
});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showAuth();if(session?.user&&['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'].includes(event))setTimeout(()=>{if(!me||me.id!==session.user.id)bootUser(session.user).catch(e=>showAuth(e.message))},0)});
(async()=>{try{const {data,error}=await db.auth.getSession();if(error)throw error;if(data.session?.user)await bootUser(data.session.user);else showAuth()}catch(e){if(stale(e))await clearLocal();showAuth('Please sign in again.')}})();
})();