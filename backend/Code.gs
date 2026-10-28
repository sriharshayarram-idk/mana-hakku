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
 * Category auto-correction: reports are checked against the app's own keyword lists (published at
 * KEYWORDS_URL). A report whose words clearly belong to another area is moved there; the original area is
 * kept in "sector_was". Type no in the "auto_fix" column of a row to stop it from ever being changed.
 *
 * Spelling and grammar: before a report is saved, its text is tidied (spaces, punctuation, capitals) and English
 * text is checked with the free LanguageTool service. The person's original words are kept in "desc_original".
 * Telugu text is only tidied (no spell-checker for Telugu is used).
 *
 * Mandal: each report has a "mandal" column (chosen from a list in the app, or typed under "Other").
 *
 * Older reports follow new rules automatically: every row has a "rules_v" number. When the rules change, RULES_V
 * goes up and rows with a lower number are checked again (area, mandal, spelling) a few at a time each time
 * the app loads the list, until all rows are up to date.
 *
 * Safety (moderation that stays transparent):
 *  - Type yes in the "hidden" column of a row (and a short reason in "hide_reason") to hide a false, abusive or
 *    unsafe report. The app then shows "Report #N hidden by the moderator · reason" in its place, so nothing
 *    disappears silently. Type no to show it again (no always wins, even over public flags).
 *  - Anyone can flag a report (false, abusive, personal details, duplicate, other). Flags go to the "Flags" sheet
 *    and are counted in the "flags" column. At AUTO_HIDE_FLAGS flags a report is hidden for review automatically.
 *  - The same text cannot be posted twice within 10 minutes, and at most MAX_PER_HOUR reports are accepted per hour.
 *  - Each phone may send at most 6 reports, 5 suggestions and 10 flags an hour; a phone's flag counts once per report.
 *  - Grievance number: when a report is saved, the phone that saved it gets a private key ("edit_key", never shown
 *    to anyone else). Only that phone can later add the official grievance number (PGRS / Prajavani / CPGRAMS).
 *    Older reports (saved before keys existed) can only be given a number by you, the owner: run makeOwnerCode once
 *    from the editor, copy the code from the Execution log, then on your phone tap the "Mana Hakku" title 7 times
 *    and paste it. With the owner code your phone can add or correct the number on any report ("grv_by" = owner).
 *    Run makeOwnerCode again any time to replace the code (the old one stops working on every phone).
 *  - Follow-up: the app checks back with the person 7 days after they file. Their answer (solved / work started /
 *    nothing happened) is shown publicly as "Reporter says ..." and kept in "reporter_says". Only the phone that saved
 *    the report (or you, with the owner code) can set it. The "status" column stays yours to set.
 *  - Review: run setupReview once. Tick the "reviewed" box on a report in Reports after you have checked it (optional
 *    short public note in "review_note"); the app then shows "✔ Checked by the moderator". The "Review" tab always lists
 *    the reports you have not checked yet, most-flagged first.
 *  - Weekly backup: run setupBackup once from the editor; a copy of this Sheet is then made every Sunday in your Drive.
 *
 * Every report is public as soon as it is saved. Each row has a "state" (ap or ts); the app shows one state at a time.
 *
 * Personal details (phone, Aadhaar / long ID numbers, email, PAN, name phrases) are
 * refused here as well as in the app, so they can never reach the sheet.
 * The sheet owner updates the "status" column by hand; the app shows it to everyone.
 */

const REPORTS = 'Reports';
const SUGGESTIONS = 'Suggestions';
const REPORT_COLS = ['id', 'created', 'district', 'place', 'sector', 'title', 'desc', 'affected', 'urgency', 'status', 'verify_level', 'outlets', 'lang', 'state', 'sub', 'sector_was', 'auto_fix', 'mandal', 'desc_original', 'title_original', 'rules_v', 'hidden', 'hide_reason', 'flags', 'edit_key', 'grv_system', 'grv_number', 'grv_date', 'grv_by', 'reporter_says', 'reporter_says_date', 'reviewed', 'review_note'];
const OUTCOMES = ['solved', 'progress', 'none'];
const GRV_SYSTEMS = ['pgrs', 'prajavani', 'cpgrams', 'other'];
const FLAGS = 'Flags';
const FLAG_COLS = ['created', 'id', 'reason', 'note', 'state', 'dev'];
const FLAG_REASONS = ['false', 'abusive', 'personal', 'duplicate', 'other'];
const AUTO_HIDE_FLAGS = 5;    // public flags that hide a report until the owner reviews it
const MAX_PER_HOUR = 60;      // reports accepted per hour (stops floods)
// Per-phone limits (each app install sends a random phone id, never anything personal) and overall hourly caps.
const DEV_REPORTS_PER_HOUR = 6, DEV_SUGGESTIONS_PER_HOUR = 5, DEV_FLAGS_PER_HOUR = 10;
const SUGGESTIONS_PER_HOUR = 60, FLAGS_PER_HOUR = 120;
const RULES_V = 2;            // raise this when the rules below change; older rows are re-checked automatically
const GRAMMAR_PER_LOAD = 5;   // rows spell-checked per list load (keeps the app fast and within LanguageTool's free limit)
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
const SECTORS = ['water', 'sanitation', 'health', 'nutrition', 'education', 'child', 'women', 'elderly', 'livelihood', 'housing', 'roads', 'power', 'social', 'agri'];
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

// ---------- category auto-correction (same rule and keywords as the app) ----------
const KEYWORDS_URL = 'https://sriharshayarram-idk.github.io/mana-hakku/data/keywords.json';
function keywords_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('kw1');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  try {
    const r = UrlFetchApp.fetch(KEYWORDS_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const j = JSON.parse(r.getContentText());
      if (j && j.sectors) { try { cache.put('kw1', JSON.stringify(j), 21600); } catch (e) {} return j; }
    }
  } catch (e) {}
  return null;
}
function kwScore_(s0, list) { let s = 0; (list || []).forEach(w => { if (s0.indexOf(String(w).toLowerCase()) >= 0) s += w.length > 4 ? 2 : 1; }); return s; }
// Returns {sector, sub, changed}. Moves a report only when its words clearly belong to another area
// and say nothing about the chosen one.
function autoFix_(kw, text, sector) {
  if (!kw || !kw.sectors) return { sector: sector, sub: '', changed: false };
  const s0 = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  const rank = Object.keys(kw.sectors).map(k => [k, kwScore_(s0, kw.sectors[k].kw)]).sort((a, b) => b[1] - a[1]);
  const k1 = rank[0][0], s1 = rank[0][1], s2 = rank.length > 1 ? rank[1][1] : 0;
  const cur = kw.sectors[sector] ? kwScore_(s0, kw.sectors[sector].kw) : 0;
  const out = (k1 !== sector && s1 > s2 && ((cur === 0 && s1 >= 2) || (s1 >= 3 && s1 >= cur * 2 + 2))) ? k1 : sector;
  return { sector: out, sub: subOf_(kw, out, s0), changed: out !== sector };
}
function subOf_(kw, sector, s0) {
  const subs = kw.sectors[sector] && kw.sectors[sector].subs;
  if (!subs) return '';
  let best = '', sc = 0, tie = false;
  Object.keys(subs).forEach(k => { const v = kwScore_(s0, subs[k]); if (v > sc) { sc = v; best = k; tie = false; } else if (v > 0 && v === sc) tie = true; });
  return tie ? '' : best;
}

// ---------- mandals (list published with the app) ----------
const MANDALS_URL = 'https://sriharshayarram-idk.github.io/mana-hakku/data/mandals.json';
function mandals_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('md1');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  try {
    const r = UrlFetchApp.fetch(MANDALS_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const j = JSON.parse(r.getContentText());
      const slim = { ap: j.ap, ts: j.ts };
      try { cache.put('md1', JSON.stringify(slim), 21600); } catch (e) {}
      return slim;
    }
  } catch (e) {}
  return null;
}
function reEsc_(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// The list's own spelling for a mandal typed or picked in the app ('' if it is not in the list).
function mandalCanon_(md, state, district, name) {
  const list = md && md[state] && md[state][district];
  if (!list || !name) return '';
  const n = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  const hit = list.find(m => m[0].toLowerCase() === n || (m[1] && m[1] === String(name).trim()));
  return hit ? hit[0] : '';
}
// Finds a mandal of the district named inside free text (older reports had "X mandal, village" in one box).
function mandalIn_(md, state, district, text) {
  const list = md && md[state] && md[state][district];
  if (!list) return '';
  const h = ' ' + String(text || '').toLowerCase() + ' ';
  let best = '';
  list.forEach(m => {
    const a = m[0].toLowerCase().replace(/\s*\(.*\)/, '');
    const hit = (a.length >= 4 && new RegExp('(^|[^a-z])' + reEsc_(a) + '([^a-z]|$)').test(h)) || (m[1] && h.indexOf(m[1]) >= 0);
    if (hit && m[0].length > best.length) best = m[0];
  });
  return best;
}

// ---------- spelling and grammar ----------
// Tidy any language: spaces, repeated punctuation, space after punctuation, capital letter at sentence start.
function tidy_(x) {
  let s = String(x || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  s = s.replace(/\s+([,.;:!?।])/g, '$1').replace(/([!?])\1+/g, '$1').replace(/\.{4,}/g, '...').replace(/,{2,}/g, ',')
       .replace(/([,;!?।])(?=[A-Za-z\u0C00-\u0C7F])/g, '$1 ');
  s = s.replace(/(^|(?<!\b(?:i\.e|e\.g|etc|vs|no|dr|mr|mrs|smt|st|approx))[.!?]\s+|\n)([a-z])/gi, (m, a, b) => a + b.toUpperCase()).replace(/(^|\s)i(?=[\s',])/g, '$1I');
  if (s && /[A-Za-z0-9\u0C00-\u0C7F)]$/.test(s)) s += '.';
  return s;
}
const latinShare_ = s => { const l = (s.match(/[A-Za-z]/g) || []).length, t = (s.match(/[\u0C00-\u0C7F]/g) || []).length; return l + t ? l / (l + t) : 0; };
const LT_KEEP = ['TYPOS', 'GRAMMAR', 'PUNCTUATION', 'CASING', 'TYPOGRAPHY', 'CONFUSED_WORDS', 'MISC'];
function ltRequest_(text) {
  return { url: 'https://api.languagetool.org/v2/check', method: 'post', muteHttpExceptions: true,
    payload: { text: text, language: 'en-GB', level: 'default' } };
}
// Applies LanguageTool's first suggestion where it is safe: never on names (capitalised words, place names),
// numbers, or Telugu written in English letters (when many words look misspelt, spelling fixes are skipped).
function ltApply_(text, resp, protect) {
  let j;
  try { j = JSON.parse(resp.getContentText()); } catch (e) { return text; }
  const ms = (j && j.matches) || [];
  const words = (text.match(/[A-Za-z]+/g) || []).length || 1;
  const typos = ms.filter(m => m.rule && m.rule.category && m.rule.category.id === 'TYPOS').length;
  const tenglish = typos / words > 0.45;
  const edits = [];
  ms.forEach(m => {
    const cat = m.rule && m.rule.category ? m.rule.category.id : '';
    if (LT_KEEP.indexOf(cat) < 0 || !m.replacements || !m.replacements.length) return;
    const from = text.substr(m.offset, m.length), to = m.replacements[0].value;
    if (cat === 'TYPOS') {
      if (tenglish || /^[A-Z]/.test(from) || /\d/.test(from) || from.length < 3) return;
      if (protect.some(w => w && w.toLowerCase() === from.toLowerCase())) return;
      if (to.toLowerCase()[0] !== from.toLowerCase()[0] || lev_(from.toLowerCase(), to.toLowerCase().replace(/ /g, '')) > 2) return;
    }
    if (to.length > from.length + 20) return;
    edits.push([m.offset, m.length, to]);
  });
  edits.sort((a, b) => b[0] - a[0]);
  let out = text, lastStart = Infinity;
  edits.forEach(e => { if (e[0] + e[1] <= lastStart) { out = out.slice(0, e[0]) + e[2] + out.slice(e[0] + e[1]); lastStart = e[0]; } });
  return out;
}
function lev_(a, b) {
  const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Local words a spell-checker does not know (never "corrected").
const LOCAL_WORDS = ['mandal', 'mandals', 'panchayat', 'panchayats', 'gram', 'sachivalayam', 'anganwadi', 'anganwadis', 'handpump', 'handpumps',
  'borewell', 'borewells', 'tanda', 'thanda', 'gudem', 'palem', 'peta', 'puram', 'pally', 'palli', 'thanda', 'ward', 'mgnregs', 'nrega', 'aasara',
  'pension', 'ration', 'tahsildar', 'tehsildar', 'mro', 'mpdo', 'vro', 'phc', 'chc', 'asha', 'anm', 'jagananna', 'rythu', 'bharosa', 'dharani',
  'kalyana', 'lakshmi', 'aarogyasri', 'swachh', 'bharat', 'jal', 'jeevan', 'mission', 'crore', 'lakh', 'lakhs', 'acre', 'acres', 'kms', 'km'];
// Corrects several texts at once. Returns the corrected texts in the same order (unchanged when the service is unreachable).
function correctMany_(texts, protect) {
  const tidied = texts.map(tidy_);
  const ask = [];
  tidied.forEach((t, i) => { if (t && latinShare_(t) >= 0.6) ask.push(i); });
  if (!ask.length) return tidied;
  let resps = [];
  try { resps = UrlFetchApp.fetchAll(ask.map(i => ltRequest_(tidied[i]))); } catch (e) { return tidied; }
  ask.forEach((i, k) => { const r = resps[k]; if (r && r.getResponseCode() === 200) tidied[i] = tidy_(ltApply_(tidied[i], r, protect)); });
  return tidied;
}
function protectWords_(md) {
  const w = LOCAL_WORDS.slice();
  const kw = keywords_();
  if (kw && kw.sectors) Object.keys(kw.sectors).forEach(k => (kw.sectors[k].kw || []).forEach(x => { if (/^[a-z]+$/i.test(x)) w.push(x); }));
  Object.keys(DISTRICTS).forEach(st => DISTRICTS[st].forEach(d => w.push.apply(w, d.split(/[\s.–-]+/))));
  if (md) ['ap', 'ts'].forEach(st => Object.keys(md[st] || {}).forEach(d => md[st][d].forEach(m => w.push.apply(w, m[0].split(/[\s()]+/)))));
  return w.filter(x => x.length >= 3);
}
const titleOf_ = d => String(d || '').split(/[.!?।]/)[0].slice(0, 90);
// The app makes the title from the first words of the description; when that is so, take the same words from the corrected text.
function fixTitle_(title0, desc0, desc1) {
  const t = String(title0 || '').trim(), norm = x => String(x).toLowerCase().replace(/[^a-z0-9\u0C00-\u0C7F]+/g, ' ').trim();
  if (!t) return clip_(titleOf_(desc1), 90);
  if (norm(desc0).indexOf(norm(t)) === 0) {
    const n = norm(t).split(' ').length;
    return clip_(String(desc1).split(/\s+/).slice(0, n).join(' ').replace(/[,.;:!?।]+$/, ''), 90);
  }
  return clip_(tidy_(t).replace(/\.$/, ''), 90);
}

// ---------- read: everyone's reports ----------
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'news') return json_(newsSearch_(e.parameter));
  const state = e && e.parameter && e.parameter.state === 'ts' ? 'ts' : 'ap';
  const sh = sheet_(REPORTS, REPORT_COLS);
  const idx = ensureColumns_(sh, REPORT_COLS);
  const values = sh.getDataRange().getValues();
  values.shift();
  // Bring older rows up to the current rules: area (original kept in sector_was), mandal, spelling (original kept).
  const kw = keywords_(), md = mandals_();
  const dirty = {};
  const set = (r, i, k, v) => { if (String(r[idx[k]]) !== String(v)) { r[idx[k]] = v; dirty[k] = true; } };
  let grammarTodo = [];
  values.forEach((r, i) => {
    if (!r[idx.id] || Number(r[idx.rules_v]) >= RULES_V) return;
    const locked = String(r[idx.auto_fix]).toLowerCase() === 'no';
    if (kw && !locked && !r[idx.sector_was]) {
      const f = autoFix_(kw, [r[idx.title], r[idx.desc], r[idx.place]].join(' '), String(r[idx.sector] || ''));
      if (f.changed) { set(r, i, 'sector_was', r[idx.sector]); set(r, i, 'sector', f.sector); set(r, i, 'sub', f.sub); }
    }
    if (md && !r[idx.mandal]) {
      const st = String(r[idx.state] || 'ap'), m = mandalIn_(md, st, String(r[idx.district]), r[idx.place]);
      if (m) set(r, i, 'mandal', m);
    }
    if (locked || r[idx.desc_original]) set(r, i, 'rules_v', RULES_V);   // spelling already done (or the owner locked the row)
    else if (md || kw) grammarTodo.push(i);
  });
  grammarTodo = grammarTodo.slice(0, GRAMMAR_PER_LOAD);
  if (grammarTodo.length) {
    const fixed = correctMany_(grammarTodo.map(i => String(values[i][idx.desc] || '')), protectWords_(md));
    grammarTodo.forEach((i, k) => {
      const r = values[i], d0 = String(r[idx.desc] || ''), d1 = clip_(fixed[k], 1500);
      if (d1 && d1 !== d0) {
        set(r, i, 'desc_original', clip_(d0, 1500)); set(r, i, 'desc', d1);
        const t0 = String(r[idx.title] || ''), t1 = fixTitle_(t0, d0, d1);
        if (t1 !== t0) { set(r, i, 'title_original', t0); set(r, i, 'title', t1); }
      }
      set(r, i, 'rules_v', RULES_V);
    });
  }
  // Write each changed column in one go (skipped if another request is writing right now; it will run next time).
  const wl = LockService.getScriptLock();
  if (Object.keys(dirty).length && wl.tryLock(3000)) try { Object.keys(dirty).forEach(k => {
    if (!values.length) return;
    sh.getRange(2, idx[k] + 1, values.length, 1).setValues(values.map(r => [r[idx[k]] === undefined ? '' : r[idx[k]]]));
  }); } finally { wl.releaseLock(); }
  const isHidden = r => { const h = String(r[idx.hidden] || '').trim().toLowerCase(); if (h === 'no') return false;
    return h === 'yes' || h === 'y' || h === 'hide' || h === 'true' || (Number(r[idx.flags]) || 0) >= AUTO_HIDE_FLAGS; };
  const mine = values.filter(r => r[idx.id] && String(r[idx.state] || 'ap') === state);
  const hidden = mine.filter(isHidden).map(r => ({
    id: String(r[idx.id]),
    created: r[idx.created] instanceof Date ? r[idx.created].toISOString() : String(r[idx.created] || ''),
    reason: String(r[idx.hide_reason] || '').slice(0, 120) || ((Number(r[idx.flags]) || 0) >= AUTO_HIDE_FLAGS && String(r[idx.hidden] || '').trim().toLowerCase() !== 'yes' ? 'flagged' : '')
  }));
  const rows = mine.filter(r => !isHidden(r)).slice(-MAX_ROWS_RETURNED).reverse().map(r => ({
    id: String(r[idx.id]),
    state: state,
    created: r[idx.created] instanceof Date ? r[idx.created].toISOString() : String(r[idx.created] || ''),
    district: String(r[idx.district] || ''),
    mandal: String(r[idx.mandal] || ''),
    place: String(r[idx.place] || ''),
    sector: String(r[idx.sector] || ''),
    title: String(r[idx.title] || ''),
    desc: String(r[idx.desc] || ''),
    affected: Number(r[idx.affected]) || 0,
    urgency: String(r[idx.urgency] || 'medium'),
    status: STATUSES.indexOf(String(r[idx.status])) >= 0 ? String(r[idx.status]) : 'reported',
    verify: { level: Math.min(2, Number(r[idx.verify_level]) || 0) },
    lang: String(r[idx.lang] || ''),
    sub: String(r[idx.sub] || ''),
    sector_was: String(r[idx.sector_was] || ''),
    locked: String(r[idx.auto_fix] || '').toLowerCase() === 'no',
    text_fixed: !!r[idx.desc_original],
    grv_system: String(r[idx.grv_system] || ''),
    grv_number: String(r[idx.grv_number] || ''),
    grv_date: r[idx.grv_date] instanceof Date ? r[idx.grv_date].toISOString() : String(r[idx.grv_date] || ''),
    grv_by: String(r[idx.grv_by] || ''),
    reporter_says: OUTCOMES.indexOf(String(r[idx.reporter_says])) >= 0 ? String(r[idx.reporter_says]) : '',
    reviewed: r[idx.reviewed] === true || /^(yes|y|true|✔|checked)$/i.test(String(r[idx.reviewed] || '').trim()),
    review_note: String(r[idx.review_note] || '').slice(0, 140)
  }));
  return json_({ ok: true, state: state, reports: rows, hidden: hidden });
}

// ---------- write: a new report or a suggestion ----------
// Counts actions per phone (or overall, with dev '*') in the current hour; false when the limit is reached.
function rate_(bucket, dev, limit) {
  if (!dev) return true;
  const cache = CacheService.getScriptCache(), key = 'rl:' + bucket + ':' + dev + ':' + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(key)) || 0;
  if (n >= limit) return false;
  cache.put(key, String(n + 1), 3700);
  return true;
}
function devId_(d) { return String(d.dev || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40); }

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const dev = devId_(d);
  const state = d.state === 'ts' || (d.report && d.report.state === 'ts') ? 'ts' : 'ap';

  if (d.type === 'suggestion') {
    const text = clip_(d.text, 1500).trim();
    if (!text) return json_({ ok: false, error: 'empty' });
    if (hasPersonalDetails_(text)) return json_({ ok: false, error: 'pii' });
    if (!rate_('sg', dev, DEV_SUGGESTIONS_PER_HOUR) || !rate_('sg', '*', SUGGESTIONS_PER_HOUR)) return json_({ ok: false, error: 'busy' });
    const ss = sheet_(SUGGESTIONS, SUGGESTION_COLS);
    ensureColumns_(ss, SUGGESTION_COLS);
    ss.appendRow([new Date().toISOString(), text, d.lang === 'te' ? 'te' : 'en', state]);
    return json_({ ok: true });
  }

  if (d.type === 'flag') {
    const id = String(d.id || '').slice(0, 40), reason = FLAG_REASONS.indexOf(d.reason) >= 0 ? d.reason : 'other';
    const note = clip_(d.note, 300).trim();
    if (!/^r[a-z0-9]{4,30}$/.test(id)) return json_({ ok: false, error: 'bad_request' });
    if (note && hasPersonalDetails_(note)) return json_({ ok: false, error: 'pii' });
    if (!rate_('fl', dev, DEV_FLAGS_PER_HOUR) || !rate_('fl', '*', FLAGS_PER_HOUR)) return json_({ ok: false, error: 'busy' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet_(REPORTS, REPORT_COLS);
      const idx = ensureColumns_(sh, REPORT_COLS);
      const ids = sh.getRange(2, idx.id + 1, Math.max(1, sh.getLastRow() - 1), 1).getValues().map(x => String(x[0]));
      const k = ids.indexOf(id);
      if (k < 0) return json_({ ok: false, error: 'not_found' });
      const fs = sheet_(FLAGS, FLAG_COLS);
      const fi = ensureColumns_(fs, FLAG_COLS);
      // One phone counts once per report, so one person cannot hide a report by tapping again and again.
      // Flags from old app versions (no phone id) are recorded for you to read but do not count towards auto-hide.
      let counts = !!dev;
      if (dev && fs.getLastRow() > 1) {
        const prev = fs.getRange(2, 1, fs.getLastRow() - 1, fs.getLastColumn()).getValues();
        if (prev.some(p => String(p[fi.id]) === id && String(p[fi.dev]) === dev)) counts = false;
      }
      if (counts) { const cell = sh.getRange(k + 2, idx.flags + 1); cell.setValue((Number(cell.getValue()) || 0) + 1); }
      const frow = [];
      frow[fi.created] = new Date().toISOString(); frow[fi.id] = id; frow[fi.reason] = reason; frow[fi.note] = note; frow[fi.state] = state; frow[fi.dev] = dev;
      for (let i = 0; i < frow.length; i++) if (frow[i] === undefined) frow[i] = '';
      fs.appendRow(frow);
      return json_({ ok: true, counted: counts });
    } finally {
      lock.releaseLock();
    }
  }

  if (d.type === 'owner_check') {
    return json_({ ok: isOwner_(d.code) });
  }

  if (d.type === 'outcome') {
    const id = String(d.id || '').slice(0, 40), key = String(d.key || ''), value = String(d.value || '');
    if (!/^r[a-z0-9]{4,30}$/.test(id) || !/^[A-Za-z0-9]{16,40}$/.test(key) || OUTCOMES.indexOf(value) < 0) return json_({ ok: false, error: 'bad_request' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet_(REPORTS, REPORT_COLS);
      const idx = ensureColumns_(sh, REPORT_COLS);
      const ids = sh.getRange(2, idx.id + 1, Math.max(1, sh.getLastRow() - 1), 1).getValues().map(x => String(x[0]));
      const k = ids.indexOf(id);
      if (k < 0) return json_({ ok: false, error: 'not_found' });
      const stored = String(sh.getRange(k + 2, idx.edit_key + 1).getValue() || '');
      const byNow = String(sh.getRange(k + 2, idx.grv_by + 1).getValue() || '');
      if (!isOwner_(key) && !(stored && stored === key && byNow !== 'claimed')) return json_({ ok: false, error: 'not_allowed' });
      sh.getRange(k + 2, idx.reporter_says + 1).setValue(value);
      sh.getRange(k + 2, idx.reporter_says_date + 1).setValue(new Date().toISOString());
      return json_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  }

  if (d.type === 'grievance') {
    const id = String(d.id || '').slice(0, 40), key = String(d.key || '');
    const system = GRV_SYSTEMS.indexOf(d.system) >= 0 ? d.system : 'other';
    const number = String(d.number || '').trim().slice(0, 40);
    if (!/^r[a-z0-9]{4,30}$/.test(id) || (key && !/^[A-Za-z0-9]{16,40}$/.test(key)) || !/^[A-Za-z0-9][A-Za-z0-9\/\-_. ]{3,39}$/.test(number)) return json_({ ok: false, error: 'bad_request' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet_(REPORTS, REPORT_COLS);
      const idx = ensureColumns_(sh, REPORT_COLS);
      const n = Math.max(1, sh.getLastRow() - 1);
      const ids = sh.getRange(2, idx.id + 1, n, 1).getValues().map(x => String(x[0]));
      const k = ids.indexOf(id);
      if (k < 0) return json_({ ok: false, error: 'not_found' });
      const stored = String(sh.getRange(k + 2, idx.edit_key + 1).getValue() || '');
      const byNow = String(sh.getRange(k + 2, idx.grv_by + 1).getValue() || '');
      let by;
      if (isOwner_(key)) by = 'owner';                      // you: any report, old or new
      else if (stored && stored === key && byNow !== 'claimed' && byNow !== 'owner') by = 'owner_phone';   // the phone that saved it
      else return json_({ ok: false, error: 'not_allowed' });
      sh.getRange(k + 2, idx.grv_system + 1).setValue(system);
      sh.getRange(k + 2, idx.grv_number + 1).setValue(clip_(number, 40));
      sh.getRange(k + 2, idx.grv_date + 1).setValue(new Date().toISOString());
      sh.getRange(k + 2, idx.grv_by + 1).setValue(by);
      return json_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  }

  const r = d.report || {};
  if (DISTRICTS[state].indexOf(r.district) < 0 || (SECTORS.indexOf(r.sector) < 0 && !/^[a-z]{3,20}$/.test(String(r.sector || ''))) || URGENCY.indexOf(r.urgency) < 0) {
    return json_({ ok: false, error: 'bad_request' });
  }
  const desc0 = clip_(r.desc, 1500).trim();
  if (!desc0) return json_({ ok: false, error: 'empty' });
  if (!rate_('rp', dev, DEV_REPORTS_PER_HOUR)) return json_({ ok: false, error: 'busy' });
  if (hasPersonalDetails_([r.place, r.mandal, r.title, r.desc].join(' '))) return json_({ ok: false, error: 'pii' });
  const md = mandals_();
  const mandal = mandalCanon_(md, state, r.district, r.mandal) || clip_(tidy_(r.mandal).replace(/\.$/, ''), 40) || mandalIn_(md, state, r.district, r.place);
  // Spelling and grammar are corrected before saving; the person's own words stay in desc_original.
  const desc = clip_(correctMany_([desc0], protectWords_(md))[0], 1500) || desc0;
  const title0 = clip_(r.title, 90);
  const title = fixTitle_(title0, desc0, desc);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const outlets = Array.isArray(r.verify && r.verify.outlets) ? r.verify.outlets.join(', ') : '';
    const sh = sheet_(REPORTS, REPORT_COLS);
    const idx = ensureColumns_(sh, REPORT_COLS);
    // Flood guard: the same text twice within 10 minutes, or too many reports in the last hour, is refused.
    const n0 = sh.getLastRow() - 1;
    if (n0 > 0) {
      const take = Math.min(n0, 200), recent = sh.getRange(n0 + 2 - take, 1, take, sh.getLastColumn()).getValues();
      const now = Date.now(), norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9\u0C00-\u0C7F]+/g, '');
      const age = row => now - (row[idx.created] instanceof Date ? row[idx.created].getTime() : Date.parse(row[idx.created]) || 0);
      if (recent.some(row => age(row) < 600000 && (norm(row[idx.desc]) === norm(desc) || norm(row[idx.desc_original]) === norm(desc0)))) return json_({ ok: false, error: 'dup' });
      if (recent.filter(row => age(row) < 3600000).length >= MAX_PER_HOUR) return json_({ ok: false, error: 'busy' });
    }
    // Correct a clearly wrong area before saving (the app does the same; this also covers older app versions).
    const f = autoFix_(keywords_(), [r.title, desc, r.place].join(' '), r.sector);
    const sub = /^[a-z]{3,20}$/.test(String(r.sub || '')) && !f.changed ? String(r.sub) : f.sub;
    const row = [];
    const put = (k, v) => { row[idx[k]] = v; };
    put('id', id); put('created', new Date().toISOString()); put('district', r.district); put('mandal', mandal); put('place', clip_(tidy_(r.place).replace(/\.$/, ''), 80));
    put('sector', f.sector); put('title', title); put('desc', desc);
    put('desc_original', desc !== desc0 ? desc0 : ''); put('title_original', title !== title0 ? title0 : ''); put('rules_v', RULES_V);
    put('affected', Math.min(10000000, Math.max(1, parseInt(r.affected, 10) || 1))); put('urgency', r.urgency); put('status', 'reported');
    put('verify_level', Math.min(2, Math.max(0, Number(r.verify && r.verify.level) || 0))); put('outlets', clip_(outlets, 200));
    put('lang', r.lang === 'te' ? 'te' : 'en'); put('state', state); put('sub', sub || ''); put('sector_was', f.changed ? r.sector : ''); put('auto_fix', '');
    put('hidden', ''); put('hide_reason', ''); put('flags', 0); put('reviewed', false); put('review_note', '');
    const key = Utilities.getUuid().replace(/-/g, '');
    put('edit_key', key); put('grv_system', ''); put('grv_number', ''); put('grv_date', '');
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    sh.appendRow(row);
    try { sh.getRange(sh.getLastRow(), idx.reviewed + 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build()); } catch (e) {}
    return json_({ ok: true, id: id, key: key, sector: f.sector, corrected: f.changed, desc: desc, title: title, mandal: mandal, text_fixed: desc !== desc0 });
  } finally {
    lock.releaseLock();
  }
}

// ---------- owner code: run makeOwnerCode once from the editor, copy the code from the Execution log ----------
function isOwner_(code) {
  const own = PropertiesService.getScriptProperties().getProperty('OWNER_CODE') || '';
  return !!own && String(code || '') === own;
}
function makeOwnerCode() {
  const code = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('OWNER_CODE', code);
  Logger.log('Your owner code (keep it private, do not share or screenshot): ' + code);
  Logger.log('On your phone: tap the "Mana Hakku" title 7 times, paste this code, tap Save.');
}

// ---------- review: run setupReview once from the editor (pick setupReview → Run) ----------
function setupReview() {
  const sh = sheet_(REPORTS, REPORT_COLS);
  const idx = ensureColumns_(sh, REPORT_COLS);
  // Tick boxes (validation only, so empty rows stay empty); existing yes/no values become ticked / unticked.
  const rows = Math.max(sh.getMaxRows() - 1, sh.getLastRow() + 2000);
  if (sh.getMaxRows() < rows + 1) sh.insertRowsAfter(sh.getMaxRows(), rows + 1 - sh.getMaxRows());
  sh.getRange(2, idx.reviewed + 1, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  const n = sh.getLastRow() - 1;
  if (n > 0) {
    const r = sh.getRange(2, idx.reviewed + 1, n, 1), ids = sh.getRange(2, idx.id + 1, n, 1).getValues();
    r.setValues(r.getValues().map((v, i) => [ids[i][0] ? (v[0] === true || /^(yes|y|true|✔|checked)$/i.test(String(v[0]).trim())) : '']));
  }
  const col = c => colLetter_(idx[c] + 1);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rv = ss.getSheetByName('Review');
  if (!rv) rv = ss.insertSheet('Review');
  rv.clear();
  rv.getRange('A1').setValue('Reports not checked yet (most flagged first). To check one: go to Reports, find the row number below, tick "reviewed". This tab updates by itself.')
    .setFontWeight('bold').setWrap(true);
  rv.getRange('A2:K2').setValues([['row', 'id', 'created', 'state', 'district', 'mandal', 'place', 'sector', 'flags', 'reporter_says', 'desc']]).setFontWeight('bold');
  const pick = ['id', 'created', 'state', 'district', 'mandal', 'place', 'sector', 'flags', 'reporter_says', 'desc'].map(c => 'Reports!' + col(c) + '2:' + col(c));
  const rowsExpr = 'ROW(Reports!' + col('id') + '2:' + col('id') + ')';
  const keep = '(Reports!' + col('id') + '2:' + col('id') + '<>"")*(Reports!' + col('reviewed') + '2:' + col('reviewed') + '<>TRUE)';
  rv.getRange('A3').setFormula('=IFERROR(SORT(FILTER({' + rowsExpr + ',' + pick.join(',') + '},' + keep + '),9,FALSE,1,TRUE),"All reports are checked ✔")');
  rv.setFrozenRows(2);
  rv.setColumnWidth(11, 480);
  rv.getRange('K:K').setWrap(true);
  Logger.log('Review is ready: tick "reviewed" in Reports; the Review tab lists what is left.');
}
function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// ---------- setup check: run this from the Apps Script editor (pick checkSetup → Run) and read the Execution log ----------
function checkSetup() {
  const urls = [KEYWORDS_URL, MANDALS_URL, 'https://news.google.com/rss/search?q=Guntur&hl=en-IN&gl=IN&ceid=IN:en'];
  urls.forEach(u => {
    try { const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true }); Logger.log('OK ' + r.getResponseCode() + ' ' + r.getContentText().length + ' chars  ' + u); }
    catch (e) { Logger.log('FAILED ' + u + '  ->  ' + e); }
  });
  try { const r = UrlFetchApp.fetch('https://api.languagetool.org/v2/check', { method: 'post', muteHttpExceptions: true, payload: { text: 'no wter since july', language: 'en-GB' } }); Logger.log('LanguageTool ' + r.getResponseCode()); }
  catch (e) { Logger.log('LanguageTool FAILED -> ' + e); }
  Logger.log('keywords loaded: ' + !!keywords_() + ' · mandals loaded: ' + !!mandals_());
}

// ---------- weekly backup: run setupBackup once from the editor (pick setupBackup → Run → allow) ----------
function setupBackup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyBackup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
  weeklyBackup();
  Logger.log('Weekly backup is on: a copy of this Sheet is made every Sunday night (first copy made now).');
}
function weeklyBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.copy(ss.getName() + ' · backup ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
}
