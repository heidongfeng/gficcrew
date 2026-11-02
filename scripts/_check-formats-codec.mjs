// Verifies the new `formats` codec round-trips against the real FORMATS data.
// Run: node scripts/_check-formats-codec.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { codecToText, codecFromText } from '../src/scripts/guide-codec.js';

const here = dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(readFileSync(resolve(here, '../src/data/generated/site.json'), 'utf8'));
const formats = site.formats;

if (!Array.isArray(formats) || formats.length !== 10) {
  throw new Error('expected 10 formats in generated/site.json, got ' + (formats || []).length);
}

const text = codecToText(formats, 'formats');
const back = codecFromText(text, 'formats');

if (back.length !== formats.length) {
  throw new Error('round-trip length mismatch: ' + formats.length + ' -> ' + back.length);
}

let bad = 0;
formats.forEach((orig, i) => {
  const got = back[i];
  const a = JSON.stringify(orig);
  const b = JSON.stringify(got);
  if (a !== b) {
    bad += 1;
    console.log('MISMATCH #' + i + ' ' + orig.id);
    console.log('  orig: ' + a);
    console.log('  back: ' + b);
  }
});

if (bad) throw new Error(bad + ' formats did not round-trip');

// Second pass: parse the text it produced again, so we also prove stability.
const again = codecToText(codecFromText(text, 'formats'), 'formats');
if (again !== text) throw new Error('text form is not stable across a second pass');

console.log('OK 10/10 round-trip, text stable');
console.log('---- first entry as the admin will see it ----');
console.log(text.split('\n\n')[0]);
console.log('---------------------------------------------');
console.log('total text length: ' + text.length + ' chars, ' + text.split('\n').length + ' lines');
