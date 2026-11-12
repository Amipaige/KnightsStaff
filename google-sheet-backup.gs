/**
 * Knights Mobile Bars — Google Sheets Staffing Backup
 * Paste this into a blank Google Sheet via Extensions > Apps Script.
 * Run setupKnightsBackup once, then the sheet refreshes every hour.
 */

const KNIGHTS_BACKUP = {
  endpoint: 'https://jpjrsndbjklecvwiuvbf.supabase.co/functions/v1/staffing-backup-export',
  hubEndpoint: 'https://jpjrsndbjklecvwiuvbf.supabase.co/functions/v1/hub-backup-export',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwanJzbmRiamtsZWN2d2l1dmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE',
  timezone: 'Europe/London',
  sheets: {
    status: 'Backup Status',
    events: 'Upcoming Events',
    confirmed: 'Confirmed Staffing',
    pending: 'Pending Requests',
    staff: 'Staff Directory',
    history: 'History',
    log: 'Backup Log',
    hubIndex: 'Hub Backup Index',
    hubData: 'Hub Database Records',
    stockHistory: 'Hub Stocktake History'
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Knights Backup')
    .addItem('Sync now', 'syncStaffingBackup')
    .addItem('Setup / change backup key', 'setupKnightsBackup')
    .addItem('Reinstall hourly trigger', 'installKnightsHourlyTrigger')
    .addToUi();
}

function setupKnightsBackup() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Knights Staffing Backup',
    'Paste the private Google Sheet backup key from Knights Hub → Backup.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const key = String(response.getResponseText() || '').trim();
  if (key.length < 32) {
    ui.alert('That key does not look right. Copy it again from Knights Hub → Backup.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperties({
    KNIGHTS_BACKUP_KEY: key,
    KNIGHTS_BACKUP_SPREADSHEET_ID: ss.getId()
  }, true);

  ss.setSpreadsheetTimeZone(KNIGHTS_BACKUP.timezone);
  ensureCoreSheets_(ss);
  installKnightsHourlyTrigger();
  syncStaffingBackup();
  ui.alert('Knights Staffing Backup is set up. It will refresh automatically every hour.');
}

function installKnightsHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncStaffingBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncStaffingBackup')
    .timeBased()
    .everyHours(1)
    .create();

  const ss = getBackupSpreadsheet_();
  ensureCoreSheets_(ss);
  setStatusValue_(ss, 'Hourly sync', 'Installed');
  setStatusValue_(ss, 'Trigger refreshed', new Date());
}

function syncStaffingBackup() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('KNIGHTS_BACKUP_KEY');
  if (!key) throw new Error('Backup key not set. Run setupKnightsBackup first.');

  const ss = getBackupSpreadsheet_();
  ensureCoreSheets_(ss);

  let data, hubData;
  try {
    const response = UrlFetchApp.fetch(KNIGHTS_BACKUP.endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + KNIGHTS_BACKUP.anonKey,
        apikey: KNIGHTS_BACKUP.anonKey,
        'x-backup-key': key
      },
      payload: JSON.stringify({ action: 'export' }),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const body = response.getContentText();
    if (status !== 200) {
      let message = body;
      try { message = JSON.parse(body).error || body; } catch (_) {}
      throw new Error('Backup service returned ' + status + ': ' + message);
    }

    data = JSON.parse(body);
    validatePayload_(data);
    // Complete Hub snapshot is required before touching any live Google Sheet tab.
    hubData = fetchFullHubBackup_(key);
    validateFullHubBackup_(hubData);
  } catch (error) {
    logBackup_(ss, 'FAILED', null, error.message || String(error));
    setStatusValue_(ss, 'Last sync status', 'FAILED — previous good snapshot kept');
    setStatusValue_(ss, 'Last error', error.message || String(error));
    throw error;
  }

  const prepared = prepareTables_(data);
  prepared.liveTables.push(...prepareFullHubTables_(hubData));
  const stamp = Utilities.formatDate(new Date(), KNIGHTS_BACKUP.timezone, 'yyyyMMdd_HHmmss');
  const staged = [];

  try {
    // Build every replacement tab first. Live tabs are untouched if fetching/staging fails.
    for (const table of prepared.liveTables) {
      const tempName = '__tmp_' + table.name.replace(/[^A-Za-z0-9]/g, '_') + '_' + stamp;
      const temp = ss.insertSheet(tempName);
      writeTable_(temp, table.headers, table.rows);
      staged.push({ temp, liveName: table.name });
    }

    SpreadsheetApp.flush();

    for (const item of staged) {
      const live = ss.getSheetByName(item.liveName);
      if (live) ss.deleteSheet(live);
      item.temp.setName(item.liveName);
    }

    updateStatusSheet_(ss, data, hubData);
    appendDailyHistory_(ss, data);
    logBackup_(ss, 'SUCCESS', data.counts, '');
    acknowledgeBackupSuccess_(key, data, hubData);
    setStatusValue_(ss, 'Last sync status', 'SUCCESS');
    setStatusValue_(ss, 'Last error', '');
    SpreadsheetApp.flush();
  } catch (error) {
    staged.forEach(item => {
      const sheet = ss.getSheetByName(item.temp.getName());
      if (sheet && sheet.getName().startsWith('__tmp_')) {
        try { ss.deleteSheet(sheet); } catch (_) {}
      }
    });
    logBackup_(ss, 'FAILED', data && data.counts, error.message || String(error));
    setStatusValue_(ss, 'Last sync status', 'FAILED — check History');
    setStatusValue_(ss, 'Last error', error.message || String(error));
    throw error;
  }
}

function acknowledgeBackupSuccess_(key, data, hubData) {
  try {
    UrlFetchApp.fetch(KNIGHTS_BACKUP.endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + KNIGHTS_BACKUP.anonKey,
        apikey: KNIGHTS_BACKUP.anonKey,
        'x-backup-key': key
      },
      payload: JSON.stringify({
        action: 'ack_success',
        source_generated_at: data.generated_at,
        counts: {
          ...(data.counts || {}),
          hub_tables: Object.keys(hubData.tables || {}).length,
          hub_rows: Object.values(hubData.counts || {}).reduce((n, v) => n + Number(v || 0), 0),
          stocktakes: (hubData.tables.kmb_stocktake_sessions || []).length
        }
      }),
      muteHttpExceptions: true
    });
  } catch (_) {
    // The Sheet backup has already succeeded; acknowledgement failure must not undo it.
  }
}

function validatePayload_(data) {
  if (!data || data.success !== true) throw new Error('Backup response was not valid.');
  ['upcoming_events','confirmed_staffing','pending_requests','staff_directory'].forEach(key => {
    if (!Array.isArray(data[key])) throw new Error('Backup response is missing ' + key + '.');
  });
  if (!data.generated_at) throw new Error('Backup response has no generated timestamp.');
}

function prepareTables_(data) {
  return {
    liveTables: [
      {
        name: KNIGHTS_BACKUP.sheets.events,
        headers: ['Event date','Event','Venue','Bar / package','Guests','Arrival','Start','Finish','Staff required','Bar Manager','Confirmed','Pending requests','Notes'],
        rows: data.upcoming_events.map(e => [
          e.event_date || '', e.event_name || '', e.venue || '', e.bar_package || '',
          e.guest_count ?? '', e.arrival_time || '', e.start_time || '', e.finish_time || '',
          e.staff_required ?? '', e.manager_name || 'Not assigned',
          e.confirmed_count ?? 0, e.pending_count ?? 0, e.notes || ''
        ])
      },
      {
        name: KNIGHTS_BACKUP.sheets.confirmed,
        headers: ['Event date','Event','Venue','Staff member','Email','Assignment','Arrival','Start','Finish','Bar / package'],
        rows: data.confirmed_staffing.map(r => [
          r.event_date || '', r.event_name || '', r.venue || '', r.staff_name || '',
          r.staff_email || '', r.assignment_role || '', r.arrival_time || '',
          r.start_time || '', r.finish_time || '', r.bar_package || ''
        ])
      },
      {
        name: KNIGHTS_BACKUP.sheets.pending,
        headers: ['Event date','Event','Venue','Staff member','Email','Requested at'],
        rows: data.pending_requests.map(r => [
          r.event_date || '', r.event_name || '', r.venue || '', r.staff_name || '',
          r.staff_email || '', r.requested_at ? new Date(r.requested_at) : ''
        ])
      },
      {
        name: KNIGHTS_BACKUP.sheets.staff,
        headers: ['Staff member','Email','Registration status'],
        rows: data.staff_directory.map(r => [
          r.full_name || '', r.email || '', humanize_(r.registration_status || '')
        ])
      }
    ]
  };
}


/**
 * Full Hub backup extension.
 * Uses the same private Apps Script backup key and hourly trigger as the
 * existing staffing backup. No new login, Sheets connection, or schedule.
 * All Hub database records are copied; Supabase Auth passwords and Storage
 * file binaries are not exported into Google Sheets.
 */
function fetchFullHubBackup_(key) {
  const response=UrlFetchApp.fetch(KNIGHTS_BACKUP.hubEndpoint,{
    method:'post',
    contentType:'application/json',
    headers:{
      Authorization:'Bearer '+KNIGHTS_BACKUP.anonKey,
      apikey:KNIGHTS_BACKUP.anonKey,
      'x-backup-key':key
    },
    payload:JSON.stringify({action:'export'}),
    muteHttpExceptions:true
  });
  const code=response.getResponseCode();
  const body=response.getContentText();
  if(code!==200){
    let detail=body;
    try{detail=JSON.parse(body).error||body}catch(_){}
    throw new Error('Full Hub backup service returned '+code+': '+detail);
  }
  try{return JSON.parse(body)}catch(_){throw new Error('Full Hub backup returned invalid JSON.')}
}
function validateFullHubBackup_(data){
  if(!data || data.success!==true || !data.generated_at || !data.tables || typeof data.tables!=='object')
    throw new Error('Full Hub backup data is missing.');
  const required=[
    'booking_enquiries','bookings','booking_payments','booking_tasks',
    'booking_checklist_items','booking_images','bar_events','shift_signups',
    'staff_profiles','staff_information','deleted_staff_members',
    'support_tickets','kmb_stocktake_sessions','kmb_stocktake_entries',
    'stock_products','stock_receipts','stock_sales_reports','stock_takes',
    'products','stock_movements','sumup_transactions'
  ];
  required.forEach(table=>{
    if(!Array.isArray(data.tables[table]))throw new Error('Full Hub backup missing '+table+'.');
    if(!Number.isInteger(Number(data.counts?.[table])) || Number(data.counts[table])!==data.tables[table].length)
      throw new Error('Incomplete Hub backup for '+table+'.');
  });
}
// Escape data entered by customers/staff to prevent spreadsheet formula execution.
function safeSheetText_(value){
  const text=String(value==null?'':value);
  return /^[\s]*[=+\-@]/.test(text) ? "'"+text : text;
}
function prepareFullHubTables_(data){
  const allRows=[];
  const chunkSize=35000;
  let longest=1;
  Object.keys(data.tables).sort().forEach(table=>{
    data.tables[table].forEach((record,index)=>{
      const serialized=JSON.stringify(record);
      if(!serialized || serialized.length>chunkSize*20)
        throw new Error('Hub record too large for Google Sheets in '+table+'.');
      const chunks=[];
      for(let i=0;i<serialized.length;i+=chunkSize)chunks.push(serialized.slice(i,i+chunkSize));
      longest=Math.max(longest,chunks.length);
      allRows.push({table,id:safeSheetText_(record?.id||record?.profile_id||String(index+1)),chunks});
    });
  });
  const headers=['Database table','Record ID',...Array.from({length:longest},(_,i)=>'Row JSON '+(i+1))];
  const databaseRows=allRows.map(record=>[record.table,record.id,...record.chunks,...Array(longest-record.chunks.length).fill('')]);
  const tableRows=Object.keys(data.tables).sort().map(table=>[
    table, data.counts[table], new Date(data.generated_at)
  ]);
  const sessions=new Map((data.tables.kmb_stocktake_sessions||[]).map(s=>[s.id,s]));
  const stockRows=[];
  const entries=data.tables.kmb_stocktake_entries||[];
  const sessionWithEntries=new Set(entries.map(e=>e.session_id));
  for(const s of data.tables.kmb_stocktake_sessions||[]){
    if(!sessionWithEntries.has(s.id))
      stockRows.push([s.taken_on,s.status,'','','',0,'',0,'',s.id]);
  }
  for(const entry of entries){
    const s=sessions.get(entry.session_id)||{};
    stockRows.push([
      s.taken_on||'',safeSheetText_(s.status||''),safeSheetText_(entry.category||''),
      safeSheetText_(entry.product_name||''),safeSheetText_(entry.size_label||''),
      Number(entry.quantity||0),
      entry.unit_cost===null?'':Number(entry.unit_cost),
      entry.unit_cost===null?'':Number((Number(entry.quantity||0)*Number(entry.unit_cost)).toFixed(2)),
      safeSheetText_(entry.entry_type||''),entry.session_id||''
    ]);
  }
  stockRows.sort((a,b)=>String(b[0]).localeCompare(String(a[0]))||String(a[3]).localeCompare(String(b[3])));
  return [
    {
      name:KNIGHTS_BACKUP.sheets.hubIndex,
      headers:['Database table','Records','Export timestamp'],
      rows:tableRows
    },{
      name:KNIGHTS_BACKUP.sheets.hubData,
      headers,
      rows:databaseRows
    },{
      name:KNIGHTS_BACKUP.sheets.stockHistory,
      headers:['Stocktake date','Status','Category','Drink','Size','Bottle equivalents','Purchase cost / unit GBP','Stock value GBP','Count type','Stocktake ID'],
      rows:stockRows
    }
  ];
}

function writeTable_(sheet, headers, rows) {
  sheet.clear();
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  else sheet.getRange(2,1).setValue('No records');

  sheet.getRange(1,1,1,headers.length)
    .setBackground('#171716').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getDataRange().setVerticalAlignment('top').setWrap(true);

  for (let c=1;c<=headers.length;c++) {
    sheet.autoResizeColumn(c);
    if (sheet.getColumnWidth(c)>320) sheet.setColumnWidth(c,320);
    if (sheet.getColumnWidth(c)<90) sheet.setColumnWidth(c,90);
  }

  if (rows.length) sheet.getRange(1,1,rows.length+1,headers.length).createFilter();
  const requestedCol=headers.indexOf('Requested at')+1;
  if (requestedCol>0 && rows.length) {
    sheet.getRange(2,requestedCol,rows.length,1).setNumberFormat('ddd d mmm yyyy hh:mm');
  }
}

function ensureCoreSheets_(ss) {
  [KNIGHTS_BACKUP.sheets.status,KNIGHTS_BACKUP.sheets.history,KNIGHTS_BACKUP.sheets.log].forEach(name => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  setupStatusSheet_(ss);
  setupHistorySheet_(ss);
  setupLogSheet_(ss);
}

function setupStatusSheet_(ss) {
  const sheet=ss.getSheetByName(KNIGHTS_BACKUP.sheets.status);
  if (sheet.getLastRow()===0) {
    sheet.getRange('A1:B1').setValues([['Knights Hub Backup','Value']]);
    sheet.getRange('A1:B1').setBackground('#171716').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange('A2:A9').setValues([
      ['Last successful sync'],['Last sync status'],['Last error'],['Upcoming events'],
      ['Confirmed assignments'],['Pending requests'],['Staff records'],['Hourly sync']
    ]);
    sheet.setColumnWidth(1,190);
    sheet.setColumnWidth(2,360);
    sheet.setFrozenRows(1);
  }
}

function updateStatusSheet_(ss,data,hubData) {
  setStatusValue_(ss,'Last successful sync',new Date(data.generated_at));
  setStatusValue_(ss,'Upcoming events',data.counts.events);
  setStatusValue_(ss,'Confirmed assignments',data.counts.confirmed_staffing);
  setStatusValue_(ss,'Pending requests',data.counts.pending_requests);
  setStatusValue_(ss,'Staff records',data.counts.staff);
  setStatusValue_(ss,'Hourly sync','Installed');
  if(hubData){
    setStatusValue_(ss,'Hub tables included',Object.keys(hubData.tables || {}).length);
    setStatusValue_(ss,'Hub database records',Object.values(hubData.counts || {}).reduce((n,v)=>n+Number(v||0),0));
    setStatusValue_(ss,'Stocktakes saved',(hubData.tables.kmb_stocktake_sessions || []).length);
    setStatusValue_(ss,'Full Hub export at',new Date(hubData.generated_at));
  }
  ss.getSheetByName(KNIGHTS_BACKUP.sheets.status).getRange('B2').setNumberFormat('ddd d mmm yyyy hh:mm:ss');
}

function setStatusValue_(ss,label,value) {
  const sheet=ss.getSheetByName(KNIGHTS_BACKUP.sheets.status);
  const values=sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),1).getValues();
  const idx=values.findIndex(r=>r[0]===label);
  if (idx>=0) sheet.getRange(idx+1,2).setValue(value);
  else sheet.appendRow([label,value]);
}

function setupHistorySheet_(ss) {
  const sheet=ss.getSheetByName(KNIGHTS_BACKUP.sheets.history);
  if (sheet.getLastRow()===0) {
    const headers=['Snapshot date','Event date','Event','Venue','Staff member','Email','Assignment','Status','Arrival','Start','Finish','Bar / package'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length).setBackground('#171716').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function appendDailyHistory_(ss,data) {
  const sheet=ss.getSheetByName(KNIGHTS_BACKUP.sheets.history);
  const today=Utilities.formatDate(new Date(),KNIGHTS_BACKUP.timezone,'yyyy-MM-dd');
  if (sheet.getLastRow()>1) {
    const existing=sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().flat();
    if (existing.includes(today)) return;
  }

  const rows=[];
  data.confirmed_staffing.forEach(r=>rows.push([
    today,r.event_date||'',r.event_name||'',r.venue||'',r.staff_name||'',r.staff_email||'',
    r.assignment_role||'Staff','Confirmed',r.arrival_time||'',r.start_time||'',r.finish_time||'',r.bar_package||''
  ]));
  data.pending_requests.forEach(r=>rows.push([
    today,r.event_date||'',r.event_name||'',r.venue||'',r.staff_name||'',r.staff_email||'',
    'Staff','Pending','','','',''
  ]));
  data.upcoming_events.forEach(e=>{
    const hasAny=data.confirmed_staffing.some(r=>r.event_id===e.event_id)||
      data.pending_requests.some(r=>r.event_id===e.event_id);
    if(!hasAny) rows.push([
      today,e.event_date||'',e.event_name||'',e.venue||'','','','','No staff assigned',
      e.arrival_time||'',e.start_time||'',e.finish_time||'',e.bar_package||''
    ]);
  });
  if(!rows.length) rows.push([today,'','','','','','','No upcoming staffing','','','','']);

  sheet.getRange(sheet.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  sheet.getDataRange().setWrap(true);
}

function setupLogSheet_(ss) {
  const sheet=ss.getSheetByName(KNIGHTS_BACKUP.sheets.log);
  if(sheet.getLastRow()===0) {
    const headers=['Timestamp','Status','Events','Confirmed assignments','Pending requests','Staff records','Message'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length).setBackground('#171716').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function logBackup_(ss,status,counts,message) {
  const sheet=ss.getSheetByName(KNIGHTS_BACKUP.sheets.log);
  sheet.appendRow([
    new Date(),status,
    counts?counts.events:'',
    counts?counts.confirmed_staffing:'',
    counts?counts.pending_requests:'',
    counts?counts.staff:'',
    message||''
  ]);
  if(sheet.getLastRow()>1) sheet.getRange(2,1,sheet.getLastRow()-1,1).setNumberFormat('ddd d mmm yyyy hh:mm:ss');
}

function getBackupSpreadsheet_() {
  const props=PropertiesService.getScriptProperties();
  const id=props.getProperty('KNIGHTS_BACKUP_SPREADSHEET_ID');
  if(id) return SpreadsheetApp.openById(id);

  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(!active) throw new Error('No backup spreadsheet is configured. Run setupKnightsBackup from the Google Sheet.');
  props.setProperty('KNIGHTS_BACKUP_SPREADSHEET_ID',active.getId());
  return active;
}

function humanize_(value) {
  return String(value||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
