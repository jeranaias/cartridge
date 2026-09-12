// Cartridge — package a course into a SCORM 1.2 bundle that any LMS can play.
// Input is a plain course object (see README for the shape); output is a .zip Buffer.
import JSZip from 'jszip';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      <file href="index.html"/><file href="scorm12.js"/>
    </resource>
  </resources>
</manifest>`;
}

function runtime() {
  return `(function(){var API=null;
  function find(w){var n=0;while(w&&!w.API&&w.parent&&w.parent!=w&&n<12){w=w.parent;n++;}return w?w.API:null;}
  function get(){if(API)return API;API=find(window);if(!API&&window.opener)API=find(window.opener);return API;}
  window.SCORM={
    init:function(){var a=get();if(!a)return false;a.LMSInitialize('');a.LMSSetValue('cmi.core.lesson_status','incomplete');a.LMSCommit('');return true;},
    complete:function(s){var a=get();if(!a)return false;if(s!=null){a.LMSSetValue('cmi.core.score.raw',String(s));a.LMSSetValue('cmi.core.score.min','0');a.LMSSetValue('cmi.core.score.max','100');}a.LMSSetValue('cmi.core.lesson_status',(s!=null&&s>=70)?'passed':'completed');a.LMSCommit('');return true;},
    finish:function(){var a=get();if(!a)return false;a.LMSFinish('');return true;}};})();`;
}

function courseware(course) {
  const lessons = (course.lessons || []).map((l) => (typeof l === 'string' ? { text: l } : l));
  const quiz = (course.quiz || []).slice(0, 12);
  const data = { title: course.title, subtitle: course.subtitle || '', summary: course.summary || '', lessons, quiz };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(course.title)}</title><script src="scorm12.js"></script>
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

/** Build a SCORM 1.2 package from a course object. Returns a Promise<Buffer> (the .zip). */
export async function buildCartridge(course) {
  const zip = new JSZip();
  zip.file('imsmanifest.xml', manifest(course));
  zip.file('scorm12.js', runtime());
  zip.file('index.html', courseware(course));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
