/**
 * One-off KMB.Hub booking enquiry backfill.
 *
 * Run importEventsRows105And106() from the Apps Script project attached to
 * the Google Sheet that contains the "Events" tab.
 *
 * Requirements:
 * - Script Property KNIGHTS_WEBHOOK_SECRET must contain the same secret
 *   used by the existing KMB booking enquiry webhook.
 *
 * The script sends rows 105 and 106 through the same Supabase endpoint used
 * for normal Google Form enquiries, so they land in KMB.Hub > Enquiries.
 */

const KMB_BOOKING_ENQUIRY_URL =
  'https://jpjrsndbjklecvwiuvbf.supabase.co/functions/v1/google-form-booking';

function importEventsRows105And106() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (!sheet) throw new Error('Could not find the active sheet.');

  const secret = PropertiesService.getScriptProperties()
    .getProperty('KNIGHTS_WEBHOOK_SECRET');
  if (!secret) {
    throw new Error(
      'Missing Script Property KNIGHTS_WEBHOOK_SECRET. Add the existing booking webhook secret in Apps Script > Project Settings > Script Properties.'
    );
  }

  const rows = [105, 106];
  const results = [];

  rows.forEach(function (rowNumber) {
    const result = importEventsRow_(sheet, rowNumber, secret);
    results.push(result);
  });

  Logger.log(JSON.stringify(results, null, 2));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Rows 105 and 106 sent to KMB.Hub Enquiries.',
    'KMB.Hub',
    6
  );
}

function importEventsRow_(sheet, rowNumber, secret) {
  const props = PropertiesService.getDocumentProperties();
  const markerKey = 'KMB_BOOKING_BACKFILL_EVENTS_ROW_' + rowNumber;

  if (props.getProperty(markerKey) === 'done') {
    return { row: rowNumber, skipped: true, reason: 'Already imported' };
  }

  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('The Events sheet has no columns.');
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];

  const responses = {};
  let hasData = false;

  headers.forEach(function (header, index) {
    const key = String(header || '').trim();
    const value = String(values[index] || '').trim();

    if (value) hasData = true;
    if (key) responses[key] = value;
  });

  if (!hasData) {
    throw new Error('Events row ' + rowNumber + ' is blank.');
  }

  const submittedAt =
    firstMatchingValue_(responses, ['Timestamp', 'Submitted at', 'Submission time']) ||
    'events-row-' + rowNumber + '-' + new Date().toISOString();

  const payload = {
    submitted_at: submittedAt,
    responses: responses
  };

  const response = UrlFetchApp.fetch(KMB_BOOKING_ENQUIRY_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-knights-secret': secret
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      'KMB.Hub import failed for Events row ' +
        rowNumber +
        ' (HTTP ' +
        code +
        '): ' +
        body
    );
  }

  props.setProperty(markerKey, 'done');

  return {
    row: rowNumber,
    imported: true,
    response: safeJson_(body)
  };
}

function firstMatchingValue_(responses, names) {
  const normalised = {};
  Object.keys(responses).forEach(function (key) {
    normalised[String(key).toLowerCase().replace(/\s+/g, ' ').trim()] =
      responses[key];
  });

  for (let i = 0; i < names.length; i++) {
    const key = String(names[i]).toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalised[key]) return normalised[key];
  }

  return '';
}

function safeJson_(value) {
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}
