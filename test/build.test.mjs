import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCartridge, validatePackage, safe } from '../src/cartridge.js';

const course = {
  title: 'Land Navigation Basics',
  lessons: [{ text: 'A pace count is the number of paces per 100m.', cite: 'Ch.9' }],
  quiz: [{ stem: 'What does a pace count measure?', options: ['Paces/100m', 'Steps/mile'], answer: 0 }],
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

test('validatePackage catches a broken package', async () => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('index.html', '<html></html>'); // no manifest
  const v = await validatePackage(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(v.valid, false);
});

test('safe() sanitizes filenames', () => {
  assert.equal(safe('MCWP 5-10 (MCPP)'), 'MCWP-5-10-MCPP');
});
