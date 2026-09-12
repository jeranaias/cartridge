#!/usr/bin/env node
// cartridge <course.json> [-o out.zip]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCartridge, safe } from './cartridge.js';
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('-'));
const out = (args.includes('-o') ? args[args.indexOf('-o') + 1] : null) || `cartridge-${safe(input)}.zip`;
if (!input) { console.error('usage: cartridge <course.json> [-o out.zip]'); process.exit(1); }
const course = JSON.parse(readFileSync(input, 'utf8'));
const buf = await buildCartridge(course);
writeFileSync(out, buf);
console.log(`Packaged "${course.title}" → ${out} (${buf.length} bytes)`);
