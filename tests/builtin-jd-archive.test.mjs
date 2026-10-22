import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendToPipeline } from '../scan.mjs';
import { pass, fail } from './helpers.mjs';

console.log('\nBuilt In JD archive → pipeline');

const root = mkdtempSync(join(tmpdir(), 'career-ops-builtin-jd-'));
const pipelinePath = join(root, 'data', 'pipeline.md');
const jdsDir = join(root, 'jds');

try {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(pipelinePath, '# Pipeline\n\n## Pending\n\n## Processed\n', 'utf8');
  const jd = 'Complete JD. ' + 'Privacy controls, GRC testing, risk assessments, and audit readiness. '.repeat(8);
  await appendToPipeline([{
    url: 'https://jobs.lever.co/acme-security/privacy-123',
    sourceUrl: 'https://www.builtinchicago.org/job/privacy-grc-analyst/12345',
    company: 'Acme Security',
    title: 'Privacy GRC Analyst',
    location: 'Hybrid · Chicago, IL, USA',
    source: 'builtin-full',
    sourceId: '12345',
    description: jd,
    descriptionComplete: true,
    liveness: 'LIVE',
  }], { pipelinePath, jdsDir });

  const pipeline = readFileSync(pipelinePath, 'utf8');
  const captures = readdirSync(jdsDir);
  if (captures.length === 1 && pipeline.includes(`jd: jds/${captures[0]}`)
      && pipeline.includes('jd_status: COMPLETE')
      && pipeline.includes('source_url: https://www.builtinchicago.org/job/privacy-grc-analyst/12345')
      && pipeline.includes('liveness: LIVE')) {
    pass('canonical pipeline writer archives a complete Built In JD and records its existing jds/ pointer');
  } else {
    fail(`archive/pointer mismatch: captures=${JSON.stringify(captures)} pipeline=${pipeline}`);
  }
  if (readFileSync(join(jdsDir, captures[0]), 'utf8').trim() === jd.trim()) {
    pass('archived JD content is complete and Copy JD/Handoff-readable');
  } else {
    fail('archived JD content changed');
  }

  const summaryPipeline = join(root, 'data', 'summary.md');
  writeFileSync(summaryPipeline, '# Pipeline\n\n## Pending\n', 'utf8');
  await appendToPipeline([{
    url: 'https://www.builtinchicago.org/job/summary/999', company: 'Acme', title: 'Privacy Analyst',
    description: 'Short listing summary only.', descriptionComplete: false, source: 'builtin-full',
  }], { pipelinePath: summaryPipeline, jdsDir });
  const summaryText = readFileSync(summaryPipeline, 'utf8');
  if (!summaryText.includes('jd:') && summaryText.includes('jd_status: PARTIAL')) {
    pass('listing summaries are not mislabeled or archived as complete JDs');
  } else {
    fail('summary incorrectly received a JD pointer');
  }

  const concisePipeline = join(root, 'data', 'concise.md');
  writeFileSync(concisePipeline, '# Pipeline\n\n## Pending\n', 'utf8');
  await appendToPipeline([{
    url: 'https://example.test/jobs/concise', company: 'Acme', title: 'GRC Analyst',
    description: 'Complete concise public posting.', descriptionComplete: true, source: 'fixture',
  }], { pipelinePath: concisePipeline, jdsDir });
  if (readFileSync(concisePipeline, 'utf8').includes('jd:')) {
    pass('provider-confirmed complete concise JDs satisfy the persistence invariant');
  } else {
    fail('a provider-confirmed complete JD was dropped solely because it was concise');
  }
} catch (error) {
  fail(`Built In JD archive test crashed: ${error.message}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
