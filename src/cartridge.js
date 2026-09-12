// Cartridge — package a course into a SCORM 1.2 bundle that any LMS can play.
// Input is a plain course object (see README for the shape); output is a .zip Buffer.
import JSZip from 'jszip';

/** Escape a value for safe interpolation into XML/HTML text and attributes. */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Coerce a mastery/passing score to an integer 0–100; non-numbers and out-of-range fall back to 70. */
const masteryOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 70;
};

/**
 * Serialize a value for embedding inside a `<script>` block. Plain JSON is not safe there: a payload
 * containing `</script>` (or U+2028/U+2029, which are raw line terminators in JS) breaks out of the
 * element. Escaping `<` to its `<` form (which JSON.parse restores to `<`) closes that gap.
 */
const jsonEmbed = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Fixed timestamp stamped on every zip entry so identical input yields byte-for-byte identical output
// (JSZip otherwise records wall-clock time per file, making builds non-reproducible).
const FIXED_DATE = new Date('2020-01-01T00:00:00Z');

/**
 * Sanitize an arbitrary string into a filesystem/identifier-safe token: keep only
 * `A–Z a–z 0–9 . _ -`, collapse runs of other characters to a single `-`, trim
 * leading/trailing dashes, and cap at 40 characters. Never returns an empty string.
 * @param {string} s
 * @returns {string}
 */
export const safe = (s) => String(s || 'course').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'course';

function manifest(course) {
  const id = 'CARTRIDGE_' + safe(course.id || course.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG">
    <organization identifier="ORG">
      <title>${esc(course.title)}</title>
      <item identifier="ITEM1" identifierref="RES1" isvisible="true">
        <title>${esc(course.title)}</title>
        <adlcp:masteryscore>${esc(masteryOf(course.masteryScore))}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/><file href="runtime.js"/>
    </resource>
  </resources>
</manifest>`;
}

// SCORM 1.2 runtime wrapper — exposes a stable window.SCORM the courseware calls.
function runtime12() {
  return `(function(){var API=null;
  function find(w){var n=0;while(w&&!w.API&&w.parent&&w.parent!=w&&n<12){w=w.parent;n++;}return w?w.API:null;}
  function get(){if(API)return API;API=find(window);if(!API&&window.opener)API=find(window.opener);return API;}
  window.SCORM={present:function(){return !!get();},
    init:function(){var a=get();if(!a)return false;a.LMSInitialize('');a.LMSSetValue('cmi.core.lesson_status','incomplete');a.LMSCommit('');return true;},
    complete:function(s,pass){pass=(pass==null?70:pass);var a=get();if(!a)return false;if(s!=null){a.LMSSetValue('cmi.core.score.raw',String(s));a.LMSSetValue('cmi.core.score.min','0');a.LMSSetValue('cmi.core.score.max','100');}a.LMSSetValue('cmi.core.lesson_status',(s==null)?'completed':(s>=pass?'passed':'failed'));a.LMSCommit('');return true;},
    finish:function(){var a=get();if(!a)return false;a.LMSFinish('');return true;}};})();`;
}

// SCORM 2004 runtime wrapper — same window.SCORM interface, different underlying data model.
function runtime2004() {
  return `(function(){var API=null;
  function find(w){var n=0;while(w&&!w.API_1484_11&&w.parent&&w.parent!=w&&n<12){w=w.parent;n++;}return w?w.API_1484_11:null;}
  function get(){if(API)return API;API=find(window);if(!API&&window.opener)API=find(window.opener);return API;}
  window.SCORM={present:function(){return !!get();},
    init:function(){var a=get();if(!a)return false;a.Initialize('');a.SetValue('cmi.completion_status','incomplete');a.Commit('');return true;},
    complete:function(s,pass){pass=(pass==null?70:pass);var a=get();if(!a)return false;if(s!=null){a.SetValue('cmi.score.raw',String(s));a.SetValue('cmi.score.min','0');a.SetValue('cmi.score.max','100');a.SetValue('cmi.score.scaled',String(Math.max(0,Math.min(1,s/100))));a.SetValue('cmi.success_status',(s>=pass)?'passed':'failed');}a.SetValue('cmi.completion_status','completed');a.Commit('');return true;},
    finish:function(){var a=get();if(!a)return false;a.Terminate('');return true;}};})();`;
}

function courseware(course) {
  const lessons = (course.lessons || []).map((l) => (typeof l === 'string' ? { text: l } : l));
  const quiz = (course.quiz || []).slice(0, 12).map((q) => {
    const n = Number(q && q.answer);
    return { ...q, answer: Number.isInteger(n) && n >= 0 ? n : 0 };
  });
  const mastery = masteryOf(course.masteryScore);
  const data = { title: course.title, subtitle: course.subtitle || '', summary: course.summary || '', mastery, lessons, quiz };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(course.title)}</title><script src="runtime.js"></script>
<style>:root{--ink:#1a2733;--dim:#5c6b7a;--line:#dbe3ec;--teal:#0a7d70;--bg:#f6f8fb;--good:#0a7d70;--bad:#c0392b}
*{box-sizing:border-box}body{margin:0;font-family:'Inter',system-ui,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
.wrap{max-width:760px;margin:0 auto;padding:28px 22px 80px}h1{font-size:26px;margin:0 0 2px}.sub{color:var(--dim);margin:0 0 18px}
.card{background:#fff;border:1px solid var(--line);border-left:3px solid var(--teal);border-radius:12px;padding:15px 18px;margin:0 0 12px}
.cite{font:11px ui-monospace,monospace;color:var(--teal);margin-top:8px}.sum{background:#eef4f3;border:1px solid var(--line);border-radius:12px;padding:14px 17px;margin:0 0 18px}
h2{font-size:18px;margin:26px 0 10px}.q{background:#fff;border:1px solid var(--line);border-radius:12px;padding:15px 18px;margin:0 0 12px}.q p{font-weight:600;margin:0 0 10px}
.opt{display:block;border:1px solid var(--line);border-radius:9px;padding:9px 12px;margin:6px 0;cursor:pointer}.opt.correct{border-color:var(--good);background:#eafaf5}.opt.wrong{border-color:var(--bad);background:#fdeeec}
.btn{background:var(--teal);color:#fff;border:none;border-radius:10px;padding:11px 20px;font-weight:700;cursor:pointer;margin-top:8px}
.result{font-size:17px;font-weight:700;margin:16px 0;padding:14px 18px;border-radius:12px;border:1px solid var(--line);background:#fff}.status{font:12px ui-monospace,monospace;color:var(--dim);margin-top:24px}</style></head>
<body><div class="wrap"><h1>${esc(course.title)}</h1><p class="sub">${esc(course.subtitle || '')}</p><div id="app"></div><div class="status" id="st"></div></div>
<script>var DATA=${jsonEmbed(data)};(function(){var ok=false;try{ok=window.SCORM&&SCORM.init();}catch(e){}
document.getElementById('st').textContent='SCORM: '+(ok?'connected — status/score report to the LMS':'no LMS detected (standalone preview)');
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
var app=document.getElementById('app'),h='';if(DATA.summary)h+='<div class="sum"><b>Overview.</b> '+esc(DATA.summary)+'</div>';
DATA.lessons.forEach(function(l){h+='<div class="card">'+esc(l.text)+(l.cite?'<div class="cite">'+esc(l.cite)+'</div>':'')+'</div>';});
if(DATA.quiz.length){h+='<h2>Knowledge check</h2>';DATA.quiz.forEach(function(q,i){h+='<div class="q" data-a="'+(+q.answer||0)+'"><p>'+(i+1)+'. '+esc(q.stem)+'</p>'+(q.options||[]).map(function(o,j){return '<label class="opt"><input type="radio" name="q'+i+'" value="'+j+'"> '+esc(o)+'</label>';}).join('')+'</div>';});h+='<button class="btn" id="sub">Submit &amp; record score</button><div id="res"></div>';}else{h+='<button class="btn" id="done">Mark complete</button>';}
app.innerHTML=h;var sub=document.getElementById('sub');if(sub)sub.onclick=function(){var qs=app.querySelectorAll('.q'),c=0;qs.forEach(function(q){var a=+q.getAttribute('data-a'),sel=q.querySelector('input:checked'),o=q.querySelectorAll('.opt');o[a]&&o[a].classList.add('correct');if(sel){var v=+sel.value;if(v===a)c++;else o[v]&&o[v].classList.add('wrong');}});var s=Math.round(c/qs.length*100);var pass=DATA.mastery;var r=document.getElementById('res');r.className='result';r.textContent='Score: '+s+'% ('+c+'/'+qs.length+') — '+(s>=pass?'PASSED':'not yet')+'. Recorded.';try{SCORM.complete(s,pass);SCORM.finish();}catch(e){}};
var d=document.getElementById('done');if(d)d.onclick=function(){try{SCORM.complete(null);SCORM.finish();}catch(e){}};})();</script></body></html>`;
}

// SCORM 2004 (3rd/4th Edition) content-packaging manifest.
function manifest2004(course) {
  const id = 'CARTRIDGE_' + safe(course.id || course.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="ORG">
    <organization identifier="ORG">
      <title>${esc(course.title)}</title>
      <item identifier="ITEM1" identifierref="RES1"><title>${esc(course.title)}</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html"/><file href="runtime.js"/>
    </resource>
  </resources>
</manifest>`;
}

/**
 * A single lesson: either a plain string, or an object with body text and an optional citation.
 * @typedef {string | { text: string, cite?: string }} Lesson
 */

/**
 * A single quiz question.
 * @typedef {object} Question
 * @property {string}   stem     the question text
 * @property {string[]} options  answer choices
 * @property {number}   answer   zero-based index of the correct option
 */

/**
 * A course to package.
 * @typedef {object} Course
 * @property {string}     title           required course title
 * @property {string}     [id]            stable identifier used in the manifest (defaults to the title)
 * @property {string}     [subtitle]      optional subtitle
 * @property {string}     [summary]       optional overview paragraph
 * @property {number}     [masteryScore]  passing score, 0–100 (default 70; SCORM 1.2 only)
 * @property {Lesson[]}   [lessons]       lesson cards shown before the quiz
 * @property {Question[]} [quiz]          optional graded knowledge check (first 12 questions used)
 * @property {'1.2'|'2004'} [version]     default SCORM version if none is passed to buildCartridge
 */

/**
 * Build a SCORM package from a course object. Returns a Promise<Buffer> (the .zip).
 * @param {Course} course  the course to package; `course.title` is required
 * @param {{ version?: '1.2'|'2004' }} [opts]  target SCORM version (default '1.2')
 * @returns {Promise<Buffer>} the packaged .zip, ready to upload to an LMS
 * @throws {TypeError} if `course` is not an object or `course.title` is missing/blank
 */
export async function buildCartridge(course, opts = {}) {
  if (!course || typeof course !== 'object') throw new TypeError('buildCartridge: course must be an object');
  if (typeof course.title !== 'string' || course.title.trim() === '') {
    throw new TypeError('buildCartridge: course.title is required and must be a non-empty string');
  }
  if (course.lessons != null && !Array.isArray(course.lessons)) {
    throw new TypeError('buildCartridge: course.lessons must be an array');
  }
  if (course.quiz != null && !Array.isArray(course.quiz)) {
    throw new TypeError('buildCartridge: course.quiz must be an array');
  }
  const version = opts.version || course.version || '1.2';
  if (version !== '1.2' && version !== '2004') {
    throw new TypeError(`buildCartridge: version must be '1.2' or '2004', got '${version}'`);
  }
  const zip = new JSZip();
  zip.file('imsmanifest.xml', version === '2004' ? manifest2004(course) : manifest(course), { date: FIXED_DATE });
  zip.file('runtime.js', version === '2004' ? runtime2004() : runtime12(), { date: FIXED_DATE });
  zip.file('index.html', courseware(course), { date: FIXED_DATE });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Zero-dependency XML well-formedness check. Returns `null` when the document is well-formed, or a
 * short reason string otherwise. It enforces the things a string regex cannot: tags nest and close
 * in the right order, attribute values are quoted, and no stray `<` appears in text. It is not a full
 * validating parser — it exists to catch the malformed manifests a naive regex would wave through.
 * @param {string} xml
 * @returns {string | null}
 */
function xmlWellFormed(xml) {
  const s = String(xml)
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^<>"'/]|"[^"]*"|'[^']*')*)(\/?)>/g;
  const stack = [];
  let last = 0;
  let m;
  while ((m = tag.exec(s))) {
    if (s.slice(last, m.index).includes('<')) return 'stray "<" in text';
    last = tag.lastIndex;
    const [, close, name, , selfClose] = m;
    if (close) {
      if (!stack.length) return `unexpected closing tag </${name}>`;
      if (stack.pop() !== name) return `mismatched closing tag </${name}>`;
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  if (s.slice(last).includes('<')) return 'unterminated tag';
  if (stack.length) return `unclosed tag <${stack[stack.length - 1]}>`;
  return null;
}

/**
 * Validate a package buffer: it is a readable zip, the manifest is present and well-formed XML, it has
 * an organization and a resource, and every file the manifest references is actually in the zip.
 * Never throws — non-zip, empty, or null input returns `{ valid:false, … }` with a reason.
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {Promise<{valid: boolean, version: string|null, issues: string[]}>}
 */
export async function validatePackage(buffer) {
  const issues = [];
  let zip;
  try {
    if (buffer == null) throw new Error('no input');
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { valid: false, version: null, issues: ['not a readable zip package'] };
  }
  const man = zip.file('imsmanifest.xml');
  if (!man) return { valid: false, version: null, issues: ['imsmanifest.xml missing'] };
  const xml = await man.async('string');
  const xmlErr = xmlWellFormed(xml);
  if (xmlErr) issues.push(`malformed manifest XML: ${xmlErr}`);
  if (!/<manifest[\s>]/.test(xml)) issues.push('no <manifest> element');
  if (!/<organization\b/.test(xml)) issues.push('no <organization>');
  if (!/<resource\b/.test(xml)) issues.push('no <resource>');
  const sv = xml.match(/<schemaversion>([^<]+)<\/schemaversion>/);
  const names = new Set(Object.keys(zip.files));
  for (const m of xml.matchAll(/<file\s+href="([^"]+)"/g)) if (!names.has(m[1])) issues.push(`referenced file missing: ${m[1]}`);
  return { valid: issues.length === 0, version: sv ? sv[1].trim() : null, issues };
}
