import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dismissReviewOpportunity, readDismissals, setDismissal } from '../opportunity-dismissals.mjs';

const offer = { url: 'https://job-boards.greenhouse.io/acme/jobs/1001', company: 'Acme', title: 'Privacy Analyst' };
const pending = `- [ ] ${offer.url} | Acme | Privacy Analyst | queue_mode: MANUAL_REVIEW | note: original review evidence`;
const sibling = '- [ ] https://job-boards.greenhouse.io/acme/jobs/1002 | Acme | Privacy Analyst';
const done = '- [x] https://example.org/jobs/3 | Other | GRC Analyst';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-dismiss-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/pipeline.md'), `# Queue\n\n## Pending\n${pending}\n${sibling}\n\n## Processed\n${done}\n`);
  fs.writeFileSync(path.join(root, 'data/scan-history.tsv'), 'existing history');
  return root;
}
test('Ops Not a Fit archives the selected pending posting and preserves other rows and history', async t => {
  const root = fixture(t);
  const result = await dismissReviewOpportunity(offer, { root });
  assert.equal(result.dismissed, true); assert.equal(result.removed, 1);
  const queue = fs.readFileSync(path.join(root, 'data/pipeline.md'), 'utf8');
  assert.ok(!queue.includes(pending)); assert.ok(queue.includes(sibling)); assert.ok(queue.includes(done));
  assert.match(fs.readFileSync(path.join(root, result.archive), 'utf8'), /candidate review decision, not an employer rejection/);
  assert.ok(fs.readFileSync(path.join(root, result.archive), 'utf8').includes(pending));
  assert.equal(fs.readFileSync(path.join(root, 'data/scan-history.tsv'), 'utf8'), 'existing history');
  assert.equal(readDismissals(root).length, 1); assert.deepEqual(readDismissals(root)[0].offer, offer);
  assert.equal(readDismissals(root)[0].queueArchive, result.archive);
  await setDismissal(offer, false, { root });
  assert.equal(readDismissals(root).length, 0);
  assert.ok(fs.existsSync(path.join(root, result.archive)), 'restore keeps the original row archive');
  assert.equal(fs.existsSync(path.join(root, 'data/applications.md')), false);
});
test('Ops dismissal is idempotent across concurrent clicks; ordinary Explore still protects pending queue', async t => {
  const root = fixture(t);
  await assert.rejects(setDismissal(offer, true, { root }), { code: 'IN_REVIEW_QUEUE' });
  const results = await Promise.all([dismissReviewOpportunity(offer, { root }), dismissReviewOpportunity(offer, { root })]);
  assert.equal(results.reduce((sum, r) => sum + r.removed, 0), 1);
  assert.equal(readDismissals(root).length, 1);
});
test('Ops dismissal does not change a tracker-backed application', async t => {
  const root = fixture(t);
  const tracker = `| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |\n|---|---|---|---|---|---|---|---|---|---|\n| 1 | 2026-10-22 | Acme | Privacy Analyst | 4/5 | Applied | | | req 1001 | ${offer.url} |\n`;
  fs.writeFileSync(path.join(root, 'data/applications.md'), tracker);
  const before = fs.readFileSync(path.join(root, 'data/pipeline.md'), 'utf8');
  await assert.rejects(dismissReviewOpportunity(offer, { root }), { code: 'TRACKED_OPPORTUNITY' });
  assert.equal(fs.readFileSync(path.join(root, 'data/pipeline.md'), 'utf8'), before);
  assert.equal(fs.readFileSync(path.join(root, 'data/applications.md'), 'utf8'), tracker);
  assert.deepEqual(readDismissals(root), []);
});
test('stale and invalid requests do not dismiss a different posting', async t => {
  const root = fixture(t);
  await assert.rejects(dismissReviewOpportunity(null, { root }), { code: 'INVALID_OFFER' });
  await assert.rejects(dismissReviewOpportunity({ ...offer, url: 'https://example.org/jobs/9999' }, { root }), { code: 'NOT_IN_REVIEW_QUEUE' });
  assert.deepEqual(readDismissals(root), []);
});
