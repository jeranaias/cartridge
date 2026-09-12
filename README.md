# 🎴 Cartridge

[![CI](https://github.com/jeranaias/cartridge/actions/workflows/ci.yml/badge.svg)](https://github.com/jeranaias/cartridge/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Package a course into a SCORM 1.2 cartridge that drops into any LMS and reports scores.**

You have course content — lessons, a quiz. Your LMS speaks SCORM. Cartridge is the little machine
that snaps them together: hand it a plain JSON course, get back a `.zip` that Moodle, SCORM Cloud,
Canvas, or any SCORM 1.2 player will happily play — and it reports completion and score straight
back to the gradebook.

No build step, no runtime server. One function in, one `.zip` out.

```js
import { buildCartridge } from 'cartridge';
import { writeFileSync } from 'node:fs';

const zip = await buildCartridge({
  title: 'Land Navigation Basics',
  summary: 'Pace count, terrain association, resection.',
  lessons: [{ text: 'A pace count is the number of paces per 100m…', cite: 'Ch.9, p.9-3' }],
  quiz: [{ stem: 'What does a pace count measure?', options: ['Paces/100m', 'Steps/mile'], answer: 0 }],
});
writeFileSync('course.zip', zip); // ← upload this to your LMS
```

Or from the terminal:

```bash
npx cartridge example/course.json -o course.zip
```

## The course shape

```jsonc
{
  "title": "…",            // required
  "subtitle": "…",         // optional
  "summary": "…",          // optional overview paragraph
  "masteryScore": 70,      // optional, default 70
  "lessons": [             // strings, or { text, cite? }
    { "text": "…", "cite": "Field reference, Ch.9, p.9-3" }
  ],
  "quiz": [                // optional; a graded knowledge check
    { "stem": "…", "options": ["A", "B", "C", "D"], "answer": 0 }
  ]
}
```

## What's in the box

Every cartridge is a valid SCORM 1.2 package containing:

- `imsmanifest.xml` — SCORM 1.2 manifest (`scormtype="sco"`, mastery score set)
- `index.html` — self-contained courseware: your lessons, then the quiz
- `scorm12.js` — a tiny runtime that finds the LMS API and reports `cmi.core.lesson_status` + `cmi.core.score.raw`

Open `index.html` on its own and it still works as a standalone preview (it just says "no LMS detected").

## SCORM 1.2 or 2004

1.2 by default (it works *everywhere*), or ask for 2004 when your LMS wants it — same course in, the
right manifest and runtime out:

```js
await buildCartridge(course, { version: '2004' });
```

## Validate before you ship

Don't upload and pray. Check a package is well-formed — manifest present and parseable, an organization
and a resource, and every referenced file actually in the zip:

```js
import { validatePackage } from 'cartridge';
const report = await validatePackage(zipBuffer);
// → { valid: true, version: '1.2', issues: [] }
```

## Why minimal

Cartridge keeps the player-side package tiny and dependency-free, so it loads instantly and never trips
a content validator — the courseware is one self-contained HTML file plus a small runtime.

## Install

```bash
npm install cartridge
```

Requires Node 18+.

## License

Apache-2.0.
