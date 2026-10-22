import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendToPipeline } from '../scan.mjs';
import { qualifyDiscoveredOffer } from '../web/src/lib/discovery-qualification.mjs';
import { dailyReviewEligible, reviewQueueVisible } from '../web/src/lib/fresh-posting.mjs';
import { splitDailyQueue } from '../fresh-search.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-review-queue-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'config'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'config/profile.yml'), 'job_search:\n  version: 3\ncandidate:\n  location: Chicago, IL\n');
  fs.writeFileSync(path.join(root, 'cv.md'), '');
  fs.writeFileSync(path.join(root, 'data/fresh-search.json'), '{"enabled":true}');
  fs.writeFileSync(path.join(root, 'data/pipeline.md'), '# Queue\n\n## Pending\n\n## Processed\n');
  return { root, pipelinePath: path.join(root, 'data/pipeline.md'), jdsDir: path.join(root, 'jds') };
}
const offer = {
  url: 'https://example.org/jobs/421', company: 'Example', title: 'GRC Analyst',
  location: 'Chicago, IL', description: 'Perform risk assessments, control testing and remediation.',
  descriptionComplete: false, liveness: 'UNCLEAR', discoveryCategory: 'STRATEGY_REASSESSMENT',
};

test('manual review admits incomplete evidence without changing strict scan qualification', async t => {
  const options = fixture(t);
  const decision = qualifyDiscoveredOffer(offer, { candidateLocation: 'Chicago, IL', daily: true });
  assert.equal(decision.queueEligible, false);
  assert.equal(decision.manualReviewEligible, true);
  assert.equal(decision.applicationReadiness, 'CONDITIONAL_REVIEW');
  await assert.rejects(appendToPipeline([offer], options), /Retain in discovery/);
  await appendToPipeline([offer], { ...options, manualReview: true });
  const queue = fs.readFileSync(options.pipelinePath, 'utf8');
  assert.match(queue, /queue_mode: MANUAL_REVIEW/);
  assert.match(queue, /Manually selected for evidence review/);
  assert.match(queue, /JD_PARTIAL/);
  assert.doesNotMatch(queue, /original_posted:|discovery_category: VERIFIED_FRESH/);
  assert.ok(!fs.existsSync(path.join(options.jdsDir, '421.md')));
  await assert.rejects(appendToPipeline([offer], { ...options, manualReview: true }), /already linked/);
});

test('manual action preserves hard vetoes and dismissals', async t => {
  const options = fixture(t);
  const veto = { ...offer, description: 'Privacy program. Cannot hire in Illinois.', descriptionComplete: true };
  assert.equal(qualifyDiscoveredOffer(veto, { candidateLocation: 'Chicago, IL' }).manualReviewEligible, false);
  await assert.rejects(appendToPipeline([veto], { ...options, manualReview: true }), /Retain in discovery/);
  fs.writeFileSync(path.join(options.root, 'data/dismissed-opportunities.json'), JSON.stringify([{ offer, dismissedAt: new Date().toISOString() }]));
  await assert.rejects(appendToPipeline([offer], { ...options, manualReview: true }), /Restore dismissed/);
  assert.doesNotMatch(fs.readFileSync(options.pipelinePath, 'utf8'), /jobs\/421/);
});

test('manual selections remain visible and survive daily cleanup without becoming fresh', () => {
  const manual = { ...offer, manualReview: true, done: false };
  assert.equal(dailyReviewEligible(manual, true), false);
  assert.equal(reviewQueueVisible(manual, true), true);
  assert.equal(reviewQueueVisible({ ...manual, done: true }, true), false);
  const line = '- [ ] https://example.org/jobs/421 | Example | GRC Analyst | queue_mode: MANUAL_REVIEW';
  const automatic = '- [ ] https://example.org/jobs/422 | Example | Privacy Analyst';
  const result = splitDailyQueue('# Queue\n## Pending\n' + line + '\n' + automatic);
  assert.ok(result.active.includes(line));
  assert.deepEqual(result.archived, [automatic]);
});
