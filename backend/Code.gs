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
 * Automatic news check: the app asks this script (?action=news&q=...) and the script searches
 * Google News (Bing News if Google gives nothing) and marks trusted outlets. The first deploy
 * after adding this asks you to allow "Connect to an external service" — allow it.
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
const MAX_ROWS_RETURNED = 20000;   // every report from the start

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

// ---------- automatic news check ----------
// Only these publishers are trusted. Matching is on the publisher's web address, never on the name a site gives itself.
const TRUSTED = [
  ['The Hindu', 'thehindu.com'], ['The New Indian Express', 'newindianexpress.com'], ['Deccan Chronicle', 'deccanchronicle.com'],
  ['The Hans India', 'thehansindia.com'], ['Times of India', 'timesofindia.indiatimes.com'], ['Eenadu', 'eenadu.net'],
  ['Sakshi', 'sakshi.com'], ['PIB', 'pib.gov.in'], ['Telangana Today', 'telanganatoday.com'], ['Andhra Jyothy', 'andhrajyothy.com'],
  ['The News Minute', 'thenewsminute.com'], ['The Indian Express', 'indianexpress.com'], ['NDTV', 'ndtv.com'],
  ['ETV Bharat', 'etvbharat.com'], ['Hindustan Times', 'hindustantimes.com'], ['Deccan Herald', 'deccanherald.com']
];
function host_(u) { const m = String(u || '').match(/^https?:\/\/([^/:?#]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }
function trustedFor_(host) { return TRUSTED.find(x => host === x[1] || host.endsWith('.' + x[1])); }
function decode_(x) {
  return String(x || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
}
function tag_(item, name) { const m = item.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i')); return m ? decode_(m[1]) : ''; }
function parseRss_(xml, engine) {
  const out = [];
  (String(xml).match(/<item>[\s\S]*?<\/item>/gi) || []).forEach(it => {
    let title = tag_(it, 'title'), link = tag_(it, 'link'), source = tag_(it, 'source') || tag_(it, 'News:Source');
    const srcUrl = (it.match(/<source[^>]*url="([^"]+)"/i) || [])[1] || '';
    if (engine === 'google' && source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    if (engine === 'bing') { const u = (link.match(/[?&]url=([^&]+)/) || [])[1]; if (u) { try { link = decodeURIComponent(u); } catch (e) {} } }
    // Publisher's address: Google gives it in <source url>, Bing links go straight to the article.
    const domain = engine === 'google' ? host_(srcUrl) : host_(link);
    if (!source) source = domain;
    if (!title || !/^https?:\/\//.test(link)) return;
    const t = domain ? trustedFor_(domain) : null;
    // A trusted item may only be opened over https, and only through Google News or the publisher's own site.
    const lh = host_(link);
    const safeLink = !!t && /^https:\/\//i.test(link) && (lh === 'news.google.com' || lh === t[1] || lh.endsWith('.' + t[1]));
    out.push({ title: title.slice(0, 220), link: safeLink ? link : '', source: safeLink ? t[0] : (domain || source).slice(0, 60), domain: domain, trusted: safeLink, date: tag_(it, 'pubDate') });
  });
  return out;
}
function fetchNews_(q, lang) {
  const g = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
    (lang === 'te' ? '&hl=te&gl=IN&ceid=IN:te' : '&hl=en-IN&gl=IN&ceid=IN:en');
  let items = [], engine = 'google';
  try { const r = UrlFetchApp.fetch(g, { muteHttpExceptions: true, followRedirects: true }); if (r.getResponseCode() === 200) items = parseRss_(r.getContentText(), 'google'); } catch (e) {}
  if (!items.length) {
    engine = 'bing';
    try {
      const b = 'https://www.bing.com/news/search?format=rss&mkt=' + (lang === 'te' ? 'te-IN' : 'en-IN') + '&q=' + encodeURIComponent(q);
      const r = UrlFetchApp.fetch(b, { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() === 200) items = parseRss_(r.getContentText(), 'bing');
    } catch (e) {}
  }
  return { items: items.slice(0, 25), engine: engine };
}
function newsSearch_(p) {
  const q = String(p.q || '').replace(/[\u0000-\u001F]/g, ' ').slice(0, 200).trim();
  const lang = p.lang === 'te' ? 'te' : 'en';
  if (!q) return { ok: false, error: 'empty' };
  const cache = CacheService.getScriptCache();
  const key = 'n' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, lang + '|' + q, Utilities.Charset.UTF_8));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = fetchNews_(q, lang);
  const out = { ok: true, q: q, lang: lang, engine: res.engine, items: res.items };
  try { cache.put(key, JSON.stringify(out), 1800); } catch (e) {}
  return out;
}

// ---------- read: everyone's reports ----------
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'news') return json_(newsSearch_(e.parameter));
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
