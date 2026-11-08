import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculate} from '../src/core.js';
import {validateReview} from '../lib/review.js';

test('Mac contract fixtures match the current web calculations and review schema', () => {
  const fixtures = new URL('../mac/Tests/RetainerCoreTests/Fixtures/', import.meta.url);
  const cases = JSON.parse(readFileSync(new URL('calculations.json', fixtures), 'utf8'));
  for (const {row, target, expected} of cases) assert.deepEqual(calculate(row, target), expected);
  const archive = JSON.parse(readFileSync(new URL('account.json', fixtures), 'utf8'));
  for (const review of [...archive.reviews, ...archive.trash]) {
    assert.deepEqual(validateReview(review), {month:review.month, currency:review.currency, target:review.target, rows:review.rows});
  }
});
