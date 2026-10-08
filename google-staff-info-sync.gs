/**
 * KMB.Hub Staff Information Sync
 * Paste this into the Apps Script project attached to the Google Sheet
 * that receives New Starter Form responses.
 *
 * Required Script Property:
 * KNIGHTS_FORM_WEBHOOK_SECRET = the existing KMB new-starter webhook secret
 *
 * Recommended triggers:
 * 1) From spreadsheet: On form submit -> syncNewStarterToKmb
 * 2) Optional: Time-driven hourly -> syncAllStaffInformation
 */

const KMB_STAFF_SYNC_URL =
  'https://jpjrsndbjklecvwiuvbf.supabase.co/functions/v1/sync-new-starter';

function syncNewStarterToKmb(e) {
  if (!e || !e.range) throw new Error('This function must run from a spreadsheet form-submit trigger.');
  const sheet = e.range.getSheet();
  syncStaffRow_(sheet, e.range.getRow());
}

function syncAllStaffInformation() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  for (let row = 2; row <= lastRow; row++) {
    syncStaffRow_(sheet, row);
    Utilities.sleep(100);
  }
}

function syncStaffRow_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];

  const answers = {};
  headers.forEach((header, index) => {
    const key = String(header || '').trim();
    if (key) answers[key] = values[index];
  });

  const email = findAnswer_(answers, [/^email$/i, /email address/i, /e-mail/i]);
  const fullName = findAnswer_(answers, [/^full ?name$/i, /your name/i, /staff name/i, /name/i]);
  const phone = findAnswer_(answers, [/phone/i, /mobile/i, /telephone/i, /contact number/i]);

  if (!email) return;

  const secret = PropertiesService.getScriptProperties().getProperty('KNIGHTS_FORM_WEBHOOK_SECRET');
  if (!secret) throw new Error('Missing Script Property: KNIGHTS_FORM_WEBHOOK_SECRET');

  const payload = {
    email: String(email).trim().toLowerCase(),
    full_name: String(fullName || '').trim(),
    phone: String(phone || '').trim(),
    raw_data: answers,
    source_updated_at: new Date().toISOString()
  };

  const response = UrlFetchApp.fetch(KMB_STAFF_SYNC_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-knights-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('KMB.Hub sync failed: ' + response.getContentText());
  }
}

function findAnswer_(answers, patterns) {
  const keys = Object.keys(answers);
  for (let i = 0; i < keys.length; i++) {
    if (patterns.some(pattern => pattern.test(keys[i]))) {
      const value = String(answers[keys[i]] || '').trim();
      if (value) return value;
    }
  }
  return '';
}
