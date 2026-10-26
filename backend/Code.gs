/**
 * Mana Hakku shared register — Google Apps Script web app (Andhra Pradesh + Telangana).
 *
 * Stores reports and suggestions in the Google Sheet this script is attached to,
 * and serves the reports back so everyone using the app can see them.
 *
 * Deploy: Extensions → Apps Script → paste this file → Deploy → New deployment →
 *         type "Web app", Execute as "Me", Who has access "Anyone" → copy the /exec URL.
 * Update: paste the new file → Save → Deploy → Manage deployments → edit → Version "New version" → Deploy.
 *         The /exec URL stays the same.
 *
 * Every report is public as soon as it is saved. Each row has a "state" (ap or ts); the app shows one state at a time.
 *
 * Personal details (phone, Aadhaar / long ID numbers, email, PAN, name phrases) are
 * refused here as well as in the app, so they can never reach the sheet.
 * The sheet owner updates the "status" column by hand; the app shows it to everyone.
 */

const REPORTS = 'Reports';
const SUGGESTIONS = 'Suggestions';
const REPORT_COLS = ['id', 'created', 'district', 'place', 'sector', 'title', 'desc', 'affected', 'urgency', 'status', 'verify_level', 'outlets', 'lang', 'state'];
const SUGGESTION_COLS = ['created', 'text', 'lang', 'state'];

const DISTRICTS = {
  ap: ['Alluri Sitharama Raju', 'Anakapalli', 'Ananthapuramu', 'Annamayya', 'Bapatla', 'Chittoor',
    'Dr. B. R. Ambedkar Konaseema', 'East Godavari', 'Eluru', 'Guntur', 'Kakinada', 'Krishna', 'Kurnool', 'Markapuram',
    'Nandyal', 'NTR', 'Palnadu', 'Parvathipuram Manyam', 'Polavaram', 'Prakasam', 'Sri Potti Sriramulu Nellore',
    'Sri Sathya Sai', 'Srikakulam', 'Tirupati', 'Visakhapatnam', 'Vizianagaram', 'West Godavari', 'YSR Kadapa'],
  ts: ['Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagtial', 'Jangaon', 'Jayashankar Bhupalpally',
    'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam', 'Kumuram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar',
    'Mancherial', 'Medak', 'Medchal–Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal', 'Nizamabad',
    'Peddapalli', 'Rajanna Sircilla', 'Ranga Reddy', 'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad', 'Wanaparthy',
    'Warangal', 'Yadadri Bhuvanagiri']
};
const SECTORS = ['water', 'health', 'nutrition', 'education', 'child', 'women', 'elderly', 'livelihood', 'housing', 'roads', 'power', 'social', 'agri'];
const URGENCY = ['high', 'medium', 'low'];
const STATUSES = ['reported', 'acknowledged', 'progress', 'resolved'];
const MAX_ROWS_RETURNED = 500;

// ---------- personal-details guard (mirrors the app) ----------
const TE_DIGITS = '౦౧౨౩౪౫౬౭౮౯';
function normDigits_(x) { return String(x || '').replace(/[౦-౯]/g, c => String(TE_DIGITS.indexOf(c))); }
const NAME_CUES = [/\bmy name\b/i, /\bname\s*(is|:|-)/i, /\b[sdwc]\s*\/\s*o\b/i, /\b(son|daughter|wife|husband) of\b/i,
  /\b(?:[Mm]rs?|[Mm]s|[Ss]mt|[Dd]r)\.?\s+[A-Z][a-z]{2,}/,
  /నా పేరు/, /పేరు\s*[:\-]/, /తండ్రి పేరు/, /భర్త పేరు/, /తల్లి పేరు/, /శ్రీమతి\s+\S/, /కుమారుడు/, /కుమార్తె/];
function hasPersonalDetails_(text) {
  const x = normDigits_(text);
  if (/(?:\+?\d[\s.\-()]*){10,}/.test(x)) return true;                 // phone, Aadhaar, account numbers
  if (/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.test(x)) return true; // email
  if (/\b[A-Za-z]{5}\d{4}[A-Za-z]\b/.test(x)) return true;            // PAN
  return NAME_CUES.some(re => re.test(x));
}

// ---------- helpers ----------
function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
  return sh;
}
// Adds the "state" column to an older sheet; rows saved before Telangana was added are Andhra Pradesh.
function ensureColumns_(sh, cols) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  cols.forEach(c => {
    if (head.indexOf(c) >= 0) return;
    head.push(c);
    sh.getRange(1, head.length).setValue(c).setFontWeight('bold');
    const n = sh.getLastRow() - 1;
    if (n > 0 && c === 'state') sh.getRange(2, head.length, n, 1).setValue('ap');
  });
  const idx = {};
  head.forEach((h, i) => idx[h] = i);
  return idx;
}
// Plain text only, length-capped, and never a formula (stops =, +, -, @ injection in the sheet).
function clip_(v, n) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- read: everyone's reports ----------
function doGet(e) {
  const state = e && e.parameter && e.parameter.state === 'ts' ? 'ts' : 'ap';
  const sh = sheet_(REPORTS, REPORT_COLS);
  const idx = ensureColumns_(sh, REPORT_COLS);
  const values = sh.getDataRange().getValues();
  values.shift();
  const rows = values.filter(r => r[idx.id] && String(r[idx.state] || 'ap') === state).slice(-MAX_ROWS_RETURNED).reverse().map(r => ({
    id: String(r[idx.id]),
    state: state,
    created: r[idx.created] instanceof Date ? r[idx.created].toISOString() : String(r[idx.created] || ''),
    district: String(r[idx.district] || ''),
    place: String(r[idx.place] || ''),
    sector: String(r[idx.sector] || ''),
    title: String(r[idx.title] || ''),
    desc: String(r[idx.desc] || ''),
    affected: Number(r[idx.affected]) || 0,
    urgency: String(r[idx.urgency] || 'medium'),
    status: STATUSES.indexOf(String(r[idx.status])) >= 0 ? String(r[idx.status]) : 'reported',
    verify: { level: Math.min(2, Number(r[idx.verify_level]) || 0) },
    lang: String(r[idx.lang] || '')
  }));
  return json_({ ok: true, state: state, reports: rows });
}

// ---------- write: a new report or a suggestion ----------
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const state = d.state === 'ts' || (d.report && d.report.state === 'ts') ? 'ts' : 'ap';

  if (d.type === 'suggestion') {
    const text = clip_(d.text, 1500).trim();
    if (!text) return json_({ ok: false, error: 'empty' });
    if (hasPersonalDetails_(text)) return json_({ ok: false, error: 'pii' });
    const ss = sheet_(SUGGESTIONS, SUGGESTION_COLS);
    ensureColumns_(ss, SUGGESTION_COLS);
    ss.appendRow([new Date().toISOString(), text, d.lang === 'te' ? 'te' : 'en', state]);
    return json_({ ok: true });
  }

  const r = d.report || {};
  if (DISTRICTS[state].indexOf(r.district) < 0 || SECTORS.indexOf(r.sector) < 0 || URGENCY.indexOf(r.urgency) < 0) {
    return json_({ ok: false, error: 'bad_request' });
  }
  const desc = clip_(r.desc, 1500).trim();
  if (!desc) return json_({ ok: false, error: 'empty' });
  if (hasPersonalDetails_([r.place, r.title, r.desc].join(' '))) return json_({ ok: false, error: 'pii' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const outlets = Array.isArray(r.verify && r.verify.outlets) ? r.verify.outlets.join(', ') : '';
    const sh = sheet_(REPORTS, REPORT_COLS);
    ensureColumns_(sh, REPORT_COLS);
    sh.appendRow([
      id, new Date().toISOString(), r.district, clip_(r.place, 80), r.sector, clip_(r.title, 90), desc,
      Math.min(10000000, Math.max(1, parseInt(r.affected, 10) || 1)), r.urgency, 'reported',
      Math.min(2, Math.max(0, Number(r.verify && r.verify.level) || 0)), clip_(outlets, 200), r.lang === 'te' ? 'te' : 'en', state
    ]);
    return json_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}
