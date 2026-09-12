# 🎴 Cartridge

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

## Why SCORM 1.2

Because it's the format that *actually* works everywhere — every LMS in the wild imports 1.2. Cartridge
keeps the package minimal and dependency-free on the player side, so it loads instantly and never
trips a content validator.

## Install

```bash
npm install cartridge
```

Requires Node 18+.

## License

Apache-2.0.
