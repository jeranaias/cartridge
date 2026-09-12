#!/usr/bin/env node
// cartridge <course.json> [-o out.zip] [--version 1.2|2004]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCartridge, safe } from './cartridge.js';

function fail(msg) {
  console.error(`cartridge: ${msg}`);
  process.exit(1);
}

// Parse flags and their values first, so a flag's VALUE (e.g. the token after -o) is never mistaken
// for the positional input file. The first bare token that is not a consumed flag value is the input.
const args = process.argv.slice(2);
let input, outFlag, version;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-o' || a === '--out') outFlag = args[++i];
  else if (a === '--version') version = args[++i];
  else if (a.startsWith('-')) fail(`unknown flag: ${a}`);
  else if (input === undefined) input = a;
}

if (!input) fail('usage: cartridge <course.json> [-o out.zip] [--version 1.2|2004]');

const out = outFlag || `cartridge-${safe(input)}.zip`;

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
