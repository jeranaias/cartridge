import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCartridge, validatePackage, safe } from '../src/cartridge.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(here, '..', 'src', 'cli.mjs');
const JSZip = (await import('jszip')).default;
const readIndex = async (buf) => (await (await JSZip.loadAsync(buf)).file('index.html').async('string'));
const readManifest = async (buf) => (await (await JSZip.loadAsync(buf)).file('imsmanifest.xml').async('string'));
const readRuntime = async (buf) => (await (await JSZip.loadAsync(buf)).file('runtime.js').async('string'));

const course = {
  title: 'Workplace Fire Safety Basics',
  lessons: [{ text: 'Pull, Aim, Squeeze, Sweep.', cite: 'Section 4.2' }],
  quiz: [{ stem: "What does 'A' in PASS stand for?", options: ['Alert', 'Aim at the base'], answer: 1 }],
};

test('SCORM 1.2 package builds and validates', async () => {
  const buf = await buildCartridge(course);
  const v = await validatePackage(buf);
  assert.equal(v.valid, true, JSON.stringify(v.issues));
  assert.equal(v.version, '1.2');
});

test('SCORM 2004 package builds and validates', async () => {
  const buf = await buildCartridge(course, { version: '2004' });
  const v = await validatePackage(buf);
  assert.equal(v.valid, true, JSON.stringify(v.issues));
  assert.match(v.version, /2004/);
});

test('a course with no quiz still builds and validates (Mark complete path)', async () => {
  const noQuiz = { title: 'Intro Only', lessons: ['A single lesson with no knowledge check.'] };
  const buf = await buildCartridge(noQuiz);
  const v = await validatePackage(buf);
  assert.equal(v.valid, true, JSON.stringify(v.issues));

  // The courseware embeds an empty quiz, so it renders the "Mark complete" path at runtime.
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const html = await zip.file('index.html').async('string');
  assert.match(html, /Mark complete/);
  assert.match(html, /"quiz":\[\]/);
});

test('string lessons and object lessons both render', async () => {
  const mixed = { title: 'Mixed Lessons', lessons: ['plain string lesson', { text: 'object lesson', cite: 'ref' }] };
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await buildCartridge(mixed));
  const html = await zip.file('index.html').async('string');
  assert.match(html, /plain string lesson/);
  assert.match(html, /object lesson/);
});

test('validatePackage catches a broken package', async () => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('index.html', '<html></html>'); // no manifest
  const v = await validatePackage(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(v.valid, false);
  assert.deepEqual(v.issues, ['imsmanifest.xml missing']);
});

test('validatePackage flags a referenced file that is missing from the zip', async () => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('imsmanifest.xml', '<manifest><organization/><resource><file href="ghost.html"/></resource></manifest>');
  const v = await validatePackage(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(v.valid, false);
  assert.ok(v.issues.some((i) => i.includes('ghost.html')));
});

test('buildCartridge requires a title', async () => {
  await assert.rejects(() => buildCartridge({}), /title is required/);
  await assert.rejects(() => buildCartridge({ title: '   ' }), /title is required/);
  await assert.rejects(() => buildCartridge(null), /must be an object/);
});

test('buildCartridge rejects an unknown SCORM version', async () => {
  await assert.rejects(() => buildCartridge(course, { version: '3' }), /version must be/);
});

test('special characters in content are escaped, not injected', async () => {
  const tricky = { title: 'A & B <tag> "quote"', lessons: ['<script>alert(1)</script> & more'] };
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await buildCartridge(tricky));
  const manifest = await zip.file('imsmanifest.xml').async('string');
  assert.match(manifest, /A &amp; B &lt;tag&gt;/);
  const v = await validatePackage(await buildCartridge(tricky));
  assert.equal(v.valid, true, JSON.stringify(v.issues));
});

test('safe() sanitizes into a filesystem-safe token', () => {
  assert.equal(safe('Fire Safety 101 (draft)'), 'Fire-Safety-101-draft');
  assert.equal(safe(''), 'course');
  assert.equal(safe(null), 'course');
  assert.equal(safe('!!!'), 'course');
  assert.equal(safe('a'.repeat(80)).length, 40);
});

test('a </script> in a lesson body cannot break out of the embedded data block', async () => {
  const attack = { title: 'Breakout', lessons: ['normal', '</script><img src=x onerror=alert(1)>'] };
  const html = await readIndex(await buildCartridge(attack));
  // The raw closing tag must never appear inside the DATA script; it is escaped as </script>.
  const dataStart = html.indexOf('var DATA=');
  const dataEnd = html.indexOf(';(function()', dataStart);
  const dataBlock = html.slice(dataStart, dataEnd);
  assert.ok(!dataBlock.includes('</script>'), 'literal </script> leaked into the data block');
  assert.match(dataBlock, /\\u003c\/script>/);
  // The payload still round-trips: the escaped form parses back to the original text.
  const json = JSON.parse(dataBlock.slice('var DATA='.length));
  assert.equal(json.lessons[1].text, '</script><img src=x onerror=alert(1)>');
  // And the package as a whole is still a valid, well-formed SCORM bundle.
  assert.equal((await validatePackage(await buildCartridge(attack))).valid, true);
});

test('U+2028/U+2029 in a body are escaped so the data script stays on one JS statement', async () => {
  const html = await readIndex(await buildCartridge({ title: 'LS', lessons: ['a b c'] }));
  const dataStart = html.indexOf('var DATA=');
  const dataBlock = html.slice(dataStart, html.indexOf(';(function()', dataStart));
  const S = String.fromCharCode(0x2028), P = String.fromCharCode(0x2029);
  assert.ok(!dataBlock.includes(S) && !dataBlock.includes(P), 'raw line separators leaked into the script');
  assert.match(dataBlock, /\\u2028/);
  assert.match(dataBlock, /\\u2029/);
});

test('a malicious masteryScore is coerced and cannot inject XML into the manifest', async () => {
  const evil = { title: 'Inject', masteryScore: '70</adlcp:masteryscore><evil>' };
  const buf = await buildCartridge(evil);
  const manifest = await readManifest(buf);
  assert.ok(!manifest.includes('<evil>'), 'attacker markup landed in the manifest');
  assert.match(manifest, /<adlcp:masteryscore>70<\/adlcp:masteryscore>/);
  // The built package stays well-formed and valid.
  assert.equal((await validatePackage(buf)).valid, true);
});

test('masteryScore is coerced to an integer 0–100 (999 clamped, non-numbers default 70)', async () => {
  assert.match(await readManifest(await buildCartridge({ title: 'A', masteryScore: 999 })), /<adlcp:masteryscore>100<\/adlcp:masteryscore>/);
  assert.match(await readManifest(await buildCartridge({ title: 'A', masteryScore: -5 })), /<adlcp:masteryscore>0<\/adlcp:masteryscore>/);
  assert.match(await readManifest(await buildCartridge({ title: 'A', masteryScore: 'banana' })), /<adlcp:masteryscore>70<\/adlcp:masteryscore>/);
  assert.match(await readManifest(await buildCartridge({ title: 'A', masteryScore: 82.6 })), /<adlcp:masteryscore>83<\/adlcp:masteryscore>/);
});

test('validatePackage reports a malformed (non-well-formed) manifest as invalid', async () => {
  const zip = new JSZip();
  zip.file('imsmanifest.xml', '<manifest><organization><resource></organization></manifest>'); // mis-nested
  const v = await validatePackage(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(v.valid, false);
  assert.ok(v.issues.some((i) => i.includes('malformed manifest XML')), JSON.stringify(v.issues));
});

test('validatePackage returns a result (does not throw) on non-zip / null input', async () => {
  const bad = await validatePackage(Buffer.from('this is not a zip'));
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.issues, ['not a readable zip package']);
  const nul = await validatePackage(null);
  assert.equal(nul.valid, false);
  assert.deepEqual(nul.issues, ['not a readable zip package']);
});

test('q.answer is coerced to a numeric index and cannot inject into the data-a attribute', async () => {
  const evil = { title: 'Ans', quiz: [{ stem: 'q', options: ['x', 'y'], answer: '"><img src=x onerror=alert(1)>' }] };
  const html = await readIndex(await buildCartridge(evil));
  // The runtime builds data-a from (+q.answer||0); with a coerced non-numeric answer that is 0.
  assert.match(html, /data-a="'\+\(\+q\.answer\|\|0\)\+'"/);
  const json = JSON.parse(html.slice(html.indexOf('var DATA=') + 'var DATA='.length, html.indexOf(';(function()', html.indexOf('var DATA='))));
  assert.equal(json.quiz[0].answer, 0, 'non-integer answer should coerce to 0');
});

test('CLI selects the positional input even when it follows a flag value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cartridge-cli-'));
  const coursePath = join(dir, 'real-course.json');
  const decoy = join(dir, 'out.zip'); // -o value that the old buggy parser grabbed as the input
  writeFileSync(coursePath, JSON.stringify({ title: 'CLI Picked Me', lessons: ['x'] }));
  // Flag value comes BEFORE the positional; the parser must not treat "out.zip" as the input file.
  const stdout = execFileSync(process.execPath, [CLI, '-o', decoy, coursePath], { encoding: 'utf8' });
  assert.match(stdout, /Packaged "CLI Picked Me"/);
  assert.ok(existsSync(decoy), 'expected output written to the -o path');
});

test('builds are deterministic: identical input yields byte-for-byte identical output', async () => {
  const c = { title: 'Repro', summary: 's', lessons: ['a', { text: 'b', cite: 'r' }], quiz: [{ stem: 'q', options: ['a', 'b'], answer: 1 }] };
  const a = await buildCartridge(c);
  await new Promise((r) => setTimeout(r, 5)); // let wall-clock advance; output must not
  const b = await buildCartridge(c);
  assert.ok(Buffer.compare(a, b) === 0, 'two builds of the same course differ');
});

test('SCORM 1.2 runtime records lesson_status=failed below the mastery threshold', async () => {
  const buf = await buildCartridge({ title: 'Thresh', masteryScore: 80, quiz: [{ stem: 'q', options: ['a', 'b'], answer: 0 }] });
  const runtime = await readRuntime(buf);
  const calls = {};
  const api = { LMSInitialize: () => 'true', LMSSetValue: (k, v) => ((calls[k] = v), 'true'), LMSGetValue: () => '', LMSCommit: () => 'true', LMSFinish: () => 'true' };
  const win = { API: api, opener: null };
  win.parent = win;
  const SCORM = new Function('window', runtime + '\nreturn window.SCORM;')(win);
  SCORM.complete(50, 80); // below threshold
  assert.equal(calls['cmi.core.lesson_status'], 'failed');
  SCORM.complete(90, 80); // at/above threshold
  assert.equal(calls['cmi.core.lesson_status'], 'passed');
  SCORM.complete(null); // no-quiz "Mark complete" path
  assert.equal(calls['cmi.core.lesson_status'], 'completed');
  // Courseware wires the configured threshold through to the runtime call.
  const html = await readIndex(buf);
  assert.match(html, /"mastery":80/);
  assert.match(html, /SCORM\.complete\(s,pass\)/);
});

test('buildCartridge rejects non-array lessons or quiz with a TypeError', async () => {
  await assert.rejects(() => buildCartridge({ title: 'T', lessons: 'nope' }), /lessons must be an array/);
  await assert.rejects(() => buildCartridge({ title: 'T', quiz: { a: 1 } }), /quiz must be an array/);
});
