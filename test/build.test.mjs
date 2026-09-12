import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCartridge, validatePackage, safe } from '../src/cartridge.js';

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
