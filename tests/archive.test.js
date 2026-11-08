import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateArchive, workingArchive} from '../lib/archive.js';
import {WorkingVersion} from '../lib/working-version.js';

const source = JSON.parse(readFileSync(new URL('../mac/Tests/RetainerCoreTests/Fixtures/account.json', import.meta.url), 'utf8'));
test('Mac and web archives load without trusting identity or unknown fields', () => {
  const input = structuredClone(source);
  input.userId = 'other-account'; input.reviews[0].userId = 'other-account'; input.reviews[0].localEdited = true;
  const result = validateArchive(input);
  assert.equal(result.reviews[0].revision, 'fictional-fixture-revision');
  assert.equal(result.reviews[0].localEdited, true);
  assert.ok(!('userId' in result)); assert.ok(!('userId' in result.reviews[0]));
  assert.deepEqual(result.reviews[0].rows, source.reviews[0].rows);
});
test('archive validation rejects duplicate keys, broken trash and invalid client data', () => {
  for (const mutate of [
    a => a.reviews.push(a.reviews[0]),
    a => a.trash.push({...a.reviews.pop(), deletedAt: null}),
    a => a.reviews[0].rows[0].fee = -1,
    a => a.reviews[0].revision = {userId: 'other'},
    a => a.reviews[0].updatedAt = 'not a date',
    a => a.format = 'unknown'
  ]) { const input = structuredClone(source); mutate(input); assert.throws(() => validateArchive(input)); }
});
test('working export preserves month, currency, target and original version for Mac edits', () => {
  const archive = workingArchive(source.reviews[0], 'base-version');
  const reloaded = validateArchive(JSON.parse(JSON.stringify(archive))).reviews[0];
  assert.equal(reloaded.month, '2026-11'); assert.equal(reloaded.target, 50);
  assert.equal(reloaded.currency, 'USD'); assert.equal(reloaded.revision, 'base-version');
  assert.equal(reloaded.localEdited, true);
});
test('a history refresh cannot advance the working version used to save', () => {
  const version = new WorkingVersion();
  const original = {...source.reviews[0], revision: 'version-one'};
  version.load(original);
  const refreshedHistory = [{...original, revision: 'version-two', target: 60}];
  assert.notEqual(version.expected(original), refreshedHistory[0].revision);
  assert.equal(version.expected(original), 'version-one');
});
test('new months and replaced drafts never inherit another review version', () => {
  const version = new WorkingVersion(); version.load(source.reviews[0]);
  assert.equal(version.expected({...source.reviews[0], month: '2026-12'}), null);
  version.reset(); assert.equal(version.expected(source.reviews[0]), null);
});
test('a late save response cannot attach its version to a newly loaded working copy', () => {
  const version = new WorkingVersion(); version.load(source.reviews[0]);
  const requestGeneration = version.generation;
  version.load({...source.reviews[0], revision: 'loaded-elsewhere'});
  assert.equal(version.saved(source.reviews[0], 'late-response', requestGeneration, source.reviews[0]), false);
  assert.equal(version.expected(source.reviews[0]), 'loaded-elsewhere');
  assert.equal(version.saved(source.reviews[0], 'saved-next', version.generation, source.reviews[0]), true);
  assert.equal(version.expected(source.reviews[0]), 'saved-next');
});
