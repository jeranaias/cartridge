#!/usr/bin/env node
// cartridge <course.json> [-o out.zip] [--version 1.2|2004]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCartridge, safe } from './cartridge.js';

function fail(msg) {
  console.error(`cartridge: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('-'));
const out = (args.includes('-o') ? args[args.indexOf('-o') + 1] : null) || `cartridge-${safe(input)}.zip`;
const version = args.includes('--version') ? args[args.indexOf('--version') + 1] : undefined;

if (!input) fail('usage: cartridge <course.json> [-o out.zip] [--version 1.2|2004]');

let course;
try {
  course = JSON.parse(readFileSync(input, 'utf8'));
} catch (e) {
  fail(`could not read/parse ${input}: ${e.message}`);
}

try {
  const buf = await buildCartridge(course, version ? { version } : {});
  writeFileSync(out, buf);
  console.log(`Packaged "${course.title}" → ${out} (${buf.length} bytes)`);
} catch (e) {
  fail(e.message);
}
