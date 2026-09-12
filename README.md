# 🎴 Cartridge

[![CI](https://github.com/jeranaias/cartridge/actions/workflows/ci.yml/badge.svg)](https://github.com/jeranaias/cartridge/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Package a plain JSON course into a SCORM 1.2 or 2004 `.zip` that drops into any LMS and reports scores.**

You have course content — lessons, a quiz. Your LMS speaks SCORM. Cartridge is the little machine
that snaps them together: hand it a plain JSON course, get back a `.zip` that Moodle, SCORM Cloud,
Canvas, or any SCORM player will happily play — and it reports completion and score straight
back to the gradebook.

No build step, no runtime server. One function in, one `.zip` out.

```js
import { buildCartridge } from 'cartridge';
import { writeFileSync } from 'node:fs';

const zip = await buildCartridge({
  title: 'Workplace Fire Safety Basics',
  summary: 'Extinguisher use, evacuation routes, raising the alarm.',
  lessons: [{ text: 'Use the PASS technique: Pull, Aim, Squeeze, Sweep.', cite: 'Section 4.2' }],
  quiz: [{ stem: "What does 'A' in PASS stand for?", options: ['Alert others', 'Aim at the base'], answer: 1 }],
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
  "masteryScore": 70,      // optional passing score, integer 0–100 (default 70)
  "lessons": [             // strings, or { text, cite? }
    { "text": "…", "cite": "Safety handbook, Section 4.2" }
  ],
  "quiz": [                // optional; a graded knowledge check (first 12 questions used)
    { "stem": "…", "options": ["A", "B", "C", "D"], "answer": 0 }
  ]
}
```

`title` is the only required field. `answer` is the zero-based index of the correct option.
A course with no `quiz` still builds — the learner gets a **Mark complete** button instead of a scored check.

`masteryScore` is the real passing threshold, not decoration: when a learner scores below it, the
cartridge reports a **failed** lesson status to the LMS (SCORM 1.2) / `success_status="failed"`
(2004); at or above it, **passed**. Non-numeric or out-of-range values are coerced to an integer 0–100
(default 70). `lessons` and `quiz`, if present, must be arrays — otherwise `buildCartridge` throws a `TypeError`.

## What's in the box

Every cartridge is a valid SCORM package containing:

- `imsmanifest.xml` — the SCORM manifest (`scormtype="sco"`, mastery score set for 1.2)
- `index.html` — self-contained courseware: your lessons, then the quiz
- `runtime.js` — a tiny runtime that finds the LMS API and reports lesson status + score

Open `index.html` on its own and it still works as a standalone preview (it just says "no LMS detected").

## SCORM 1.2 or 2004

1.2 by default (it works *everywhere*), or ask for 2004 when your LMS wants it — same course in, the
right manifest and runtime out:

```js
await buildCartridge(course, { version: '2004' });
```

## Validate before you ship

Don't upload and pray. Check a package is well-formed — it's a readable zip, the manifest is present and
parses as well-formed XML (mis-nested or unterminated tags are rejected, not waved through), it has an
organization and a resource, and every referenced file is actually in the zip:

```js
import { validatePackage } from 'cartridge';

const report = await validatePackage(zipBuffer);
// → { valid: true, version: '1.2', issues: [] }
```

`valid` is `false` when any check fails, and `issues` lists exactly what's wrong. `validatePackage` never
throws — non-zip, empty, or `null` input comes back as `{ valid: false, … }` with a reason.

## Reproducible builds

The same course in always produces the same bytes out: every zip entry is stamped with a fixed
timestamp instead of wall-clock time, so builds are byte-for-byte deterministic and diffable in CI.

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
