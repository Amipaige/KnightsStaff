/**
 * Knights Mobile Bars — Google Sheets Staffing Backup
 * Paste this into a blank Google Sheet via Extensions > Apps Script.
 * Run setupKnightsBackup once, then the sheet refreshes every hour.
 */

const KNIGHTS_BACKUP = {
  endpoint: 'https://jpjrsndbjklecvwiuvbf.supabase.co/functions/v1/staffing-backup-export',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwanJzbmRiamtsZWN2d2l1dmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ1MTQsImV4cCI6MjEwMjExMDUxNH0.KrNOCgc71pyc7vNgWdy9juQCz5PiEl0oIQ52QFv-9FE',
  timezone: 'Europe/London',
  sheets: {
    status: 'Backup Status',
    events: 'Upcoming Events',
    confirmed: 'Confirmed Staffing',
    pending: 'Pending Requests',
    staff: 'Staff Directory',
    history: 'History',
    log: 'Backup Log'
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

  let data;
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
  } catch (error) {
    logBackup_(ss, 'FAILED', null, error.message || String(error));
    setStatusValue_(ss, 'Last sync status', 'FAILED — previous good snapshot kept');
    setStatusValue_(ss, 'Last error', error.message || String(error));
    throw error;
  }

  const prepared = prepareTables_(data);
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

    updateStatusSheet_(ss, data);
    appendDailyHistory_(ss, data);
    logBackup_(ss, 'SUCCESS', data.counts, '');
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
    sheet.getRange('A1:B1').setValues([['Knights Staffing Backup','Value']]);
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

function updateStatusSheet_(ss,data) {
  setStatusValue_(ss,'Last successful sync',new Date(data.generated_at));
  setStatusValue_(ss,'Upcoming events',data.counts.events);
  setStatusValue_(ss,'Confirmed assignments',data.counts.confirmed_staffing);
  setStatusValue_(ss,'Pending requests',data.counts.pending_requests);
  setStatusValue_(ss,'Staff records',data.counts.staff);
  setStatusValue_(ss,'Hourly sync','Installed');
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
