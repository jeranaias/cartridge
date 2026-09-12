// Cartridge — package a course into a SCORM 1.2 bundle that any LMS can play.
// Input is a plain course object (see README for the shape); output is a .zip Buffer.
import JSZip from 'jszip';

/** Escape a value for safe interpolation into XML/HTML text and attributes. */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
        <adlcp:masteryscore>${course.masteryScore ?? 70}</adlcp:masteryscore>
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
    complete:function(s){var a=get();if(!a)return false;if(s!=null){a.LMSSetValue('cmi.core.score.raw',String(s));a.LMSSetValue('cmi.core.score.min','0');a.LMSSetValue('cmi.core.score.max','100');}a.LMSSetValue('cmi.core.lesson_status',(s!=null&&s>=70)?'passed':'completed');a.LMSCommit('');return true;},
    finish:function(){var a=get();if(!a)return false;a.LMSFinish('');return true;}};})();`;
}

// SCORM 2004 runtime wrapper — same window.SCORM interface, different underlying data model.
function runtime2004() {
  return `(function(){var API=null;
  function find(w){var n=0;while(w&&!w.API_1484_11&&w.parent&&w.parent!=w&&n<12){w=w.parent;n++;}return w?w.API_1484_11:null;}
  function get(){if(API)return API;API=find(window);if(!API&&window.opener)API=find(window.opener);return API;}
  window.SCORM={present:function(){return !!get();},
    init:function(){var a=get();if(!a)return false;a.Initialize('');a.SetValue('cmi.completion_status','incomplete');a.Commit('');return true;},
    complete:function(s){var a=get();if(!a)return false;if(s!=null){a.SetValue('cmi.score.raw',String(s));a.SetValue('cmi.score.min','0');a.SetValue('cmi.score.max','100');a.SetValue('cmi.score.scaled',String(Math.max(0,Math.min(1,s/100))));a.SetValue('cmi.success_status',(s>=70)?'passed':'failed');}a.SetValue('cmi.completion_status','completed');a.Commit('');return true;},
    finish:function(){var a=get();if(!a)return false;a.Terminate('');return true;}};})();`;
}

function courseware(course) {
  const lessons = (course.lessons || []).map((l) => (typeof l === 'string' ? { text: l } : l));
  const quiz = (course.quiz || []).slice(0, 12);
  const data = { title: course.title, subtitle: course.subtitle || '', summary: course.summary || '', lessons, quiz };
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
<script>var DATA=${JSON.stringify(data)};(function(){var ok=false;try{ok=window.SCORM&&SCORM.init();}catch(e){}
document.getElementById('st').textContent='SCORM: '+(ok?'connected — status/score report to the LMS':'no LMS detected (standalone preview)');
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
var app=document.getElementById('app'),h='';if(DATA.summary)h+='<div class="sum"><b>Overview.</b> '+esc(DATA.summary)+'</div>';
DATA.lessons.forEach(function(l){h+='<div class="card">'+esc(l.text)+(l.cite?'<div class="cite">'+esc(l.cite)+'</div>':'')+'</div>';});
if(DATA.quiz.length){h+='<h2>Knowledge check</h2>';DATA.quiz.forEach(function(q,i){h+='<div class="q" data-a="'+q.answer+'"><p>'+(i+1)+'. '+esc(q.stem)+'</p>'+(q.options||[]).map(function(o,j){return '<label class="opt"><input type="radio" name="q'+i+'" value="'+j+'"> '+esc(o)+'</label>';}).join('')+'</div>';});h+='<button class="btn" id="sub">Submit &amp; record score</button><div id="res"></div>';}else{h+='<button class="btn" id="done">Mark complete</button>';}
app.innerHTML=h;var sub=document.getElementById('sub');if(sub)sub.onclick=function(){var qs=app.querySelectorAll('.q'),c=0;qs.forEach(function(q){var a=+q.getAttribute('data-a'),sel=q.querySelector('input:checked'),o=q.querySelectorAll('.opt');o[a]&&o[a].classList.add('correct');if(sel){var v=+sel.value;if(v===a)c++;else o[v]&&o[v].classList.add('wrong');}});var s=Math.round(c/qs.length*100);var r=document.getElementById('res');r.className='result';r.textContent='Score: '+s+'% ('+c+'/'+qs.length+') — '+(s>=70?'PASSED':'not yet')+'. Recorded.';try{SCORM.complete(s);SCORM.finish();}catch(e){}};
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
  const version = opts.version || course.version || '1.2';
  if (version !== '1.2' && version !== '2004') {
    throw new TypeError(`buildCartridge: version must be '1.2' or '2004', got '${version}'`);
  }
  const zip = new JSZip();
  zip.file('imsmanifest.xml', version === '2004' ? manifest2004(course) : manifest(course));
  zip.file('runtime.js', version === '2004' ? runtime2004() : runtime12());
  zip.file('index.html', courseware(course));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Validate a package buffer: manifest present + parseable, has an organization and a resource, and
 * every file the manifest references is actually in the zip. Returns { valid, version, issues }.
 */
export async function validatePackage(buffer) {
  const issues = [];
  const zip = await JSZip.loadAsync(buffer);
  const man = zip.file('imsmanifest.xml');
  if (!man) return { valid: false, version: null, issues: ['imsmanifest.xml missing'] };
  const xml = await man.async('string');
  if (!/<manifest[\s>]/.test(xml)) issues.push('no <manifest> element');
  if (!/<organization\b/.test(xml)) issues.push('no <organization>');
  if (!/<resource\b/.test(xml)) issues.push('no <resource>');
  const sv = xml.match(/<schemaversion>([^<]+)<\/schemaversion>/);
  const names = new Set(Object.keys(zip.files));
  for (const m of xml.matchAll(/<file\s+href="([^"]+)"/g)) if (!names.has(m[1])) issues.push(`referenced file missing: ${m[1]}`);
  return { valid: issues.length === 0, version: sv ? sv[1].trim() : null, issues };
}
