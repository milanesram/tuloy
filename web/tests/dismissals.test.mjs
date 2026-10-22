import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readDismissals, setDismissal, dismissalsPath, activeOffers } from '../../opportunity-dismissals.mjs';
import { sameDismissedPosting } from '../src/lib/dismissals.mjs';

const core = path.resolve(import.meta.dirname, '../..');
const offer = { url: 'https://job-boards.greenhouse.io/acme/jobs/1001?utm_source=test', company: 'Acme', title: 'Privacy Analyst', location: 'Chicago', postedAt: '2026-10-16', ats: 'greenhouse', source: 'greenhouse-full', sourceId: '1001', sourceUrl: 'https://acme.example/careers?gh_jid=1001' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dismissals-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('posting identity retains query/fragment IDs, aliases, boards and distinct requisitions', () => {
  assert.equal(sameDismissedPosting(offer, { ...offer, url: offer.url.replace('?utm_source=test', '?gh_src=other') }), true);
  assert.equal(sameDismissedPosting(offer, { ...offer, url: offer.sourceUrl }), true);
  for (const url of ['https://job-boards.greenhouse.io/acme/jobs/1002', 'https://job-boards.greenhouse.io/other/jobs/1001', 'https://acme.example/careers?gh_jid=1002']) {
    assert.equal(sameDismissedPosting(offer, { ...offer, url }), false, url);
  }
  const hash = { ...offer, url: 'https://example.com/#/jobs/1001' };
  assert.equal(sameDismissedPosting(hash, { ...hash, url: 'https://example.com/#/jobs/1002' }), false);
  assert.equal(sameDismissedPosting({ ...offer, employerIdentityStatus: 'CONFLICT' }, offer), true);
  assert.equal(sameDismissedPosting({ company: 'Acme', url: '' }, { company: 'Acme', url: '' }), false);
});

test('dismiss and restore persist across processes without changing queue, archives or history', async t => {
  const root = fixture(t);
  const preserved = { 'data/applications.md': 'historical application', 'data/scan-history.tsv': 'scan history', 'data/pipeline.md': '# Pipeline\n\n## Pending\n', 'jds/original.md': 'archived JD' };
  for (const [name, bytes] of Object.entries(preserved)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), bytes);
  }
  const entries = await setDismissal(offer, true, { root });
  assert.deepEqual(entries[0].offer, offer);
  assert.ok(Date.parse(entries[0].dismissedAt));
  await setDismissal({ ...offer, url: offer.sourceUrl }, true, { root });
  assert.equal(readDismissals(root).length, 1, 'alias dismissal is idempotent');
  assert.deepEqual(readDismissals(root)[0].offer, offer, 'idempotent dismissal preserves the original source URL and identity');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {readDismissals} from ${JSON.stringify(pathToFileURL(path.join(core, 'opportunity-dismissals.mjs')).href)};process.stdout.write(JSON.stringify(readDismissals(${JSON.stringify(root)})));`], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(activeOffers([offer], JSON.parse(child.stdout)).length, 0);
  await setDismissal(offer, false, { root });
  assert.deepEqual(activeOffers([offer], readDismissals(root)), [offer]);
  for (const [name, bytes] of Object.entries(preserved)) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), bytes);
});

test('a queued posting cannot be dismissed, including canonical URL aliases', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'data'));
  const pipeline = `# Pipeline\n\n## Pending\n- [ ] ${offer.sourceUrl} | Acme | Privacy Analyst\n`;
  fs.writeFileSync(path.join(root, 'data/pipeline.md'), pipeline);
  await assert.rejects(setDismissal(offer, true, { root }), { code: 'IN_REVIEW_QUEUE' });
  assert.deepEqual(readDismissals(root), []);
  assert.equal(fs.readFileSync(path.join(root, 'data/pipeline.md'), 'utf8'), pipeline);
});

test('concurrent dismissals survive and malformed storage is never overwritten', async t => {
  const root = fixture(t);
  await Promise.all([setDismissal(offer, true, { root }), setDismissal({ ...offer, url: 'https://job-boards.greenhouse.io/acme/jobs/1002' }, true, { root })]);
  assert.equal(readDismissals(root).length, 2);
  fs.writeFileSync(dismissalsPath(root), '{broken');
  await assert.rejects(setDismissal(offer, false, { root }), SyntaxError);
  assert.equal(fs.readFileSync(dismissalsPath(root), 'utf8'), '{broken');
});

test('daily and reverse scans exclude dismissals, keep distinct postings, and allow restore', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config/profile.yml'), 'candidate:\n  full_name: Test\n');
  fs.writeFileSync(path.join(root, 'portals.yml'), 'title_filter:\n  positive: [Privacy]\ntracked_companies:\n  - name: Acme\n    careers_url: https://job-boards.greenhouse.io/acme\n');
  const bootstrap = path.join(root, 'mock.mjs');
  fs.writeFileSync(bootstrap, `globalThis.fetch=async url=>{const u=String(url);const body=u.includes('raw.githubusercontent.com')?['acme']:{jobs:[1001,1002].map(id=>({id,title:'Privacy Analyst',absolute_url:'https://job-boards.greenhouse.io/acme/jobs/'+id,location:{name:'Chicago'},first_published:new Date(Date.now()-3600000).toISOString()}))};return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});};`);
  const env = { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: root };
  for (const name of ['CAREER_OPS_PIPELINE', 'CAREER_OPS_SCAN_HISTORY', 'CAREER_OPS_TRACKER', 'CAREER_OPS_PORTALS']) delete env[name];
  const run = args => {
    const child = spawnSync(process.execPath, ['--import', bootstrap, ...args], { cwd: core, env, encoding: 'utf8', timeout: 20000 });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  await setDismissal(offer, true, { root });
  const daily = ['scan.mjs', '--dry-run', '--json', '--quiet'];
  assert.deepEqual(run(daily).added_urls, ['https://job-boards.greenhouse.io/acme/jobs/1002']);
  // Also exercise this checkout's optional strict daily-discovery mode.
  if (fs.readFileSync(path.join(core, 'scan.mjs'), 'utf8').includes("args.includes('--fresh-24h')")) {
    assert.deepEqual(run([...daily, '--fresh-24h', '--include-newly-discovered']).added_urls, ['https://job-boards.greenhouse.io/acme/jobs/1002']);
  }
  const reverse = ['scan-ats-full.mjs', '--ats', 'greenhouse', '--limit', '1', '--dry-run', '--json'];
  assert.deepEqual(run(reverse).offers.map(job => job.url), ['https://job-boards.greenhouse.io/acme/jobs/1002']);
  const blocked = spawnSync(process.execPath, ['--input-type=module', '-e', `import {appendToPipeline} from './scan.mjs'; await appendToPipeline(${JSON.stringify([offer])});`], { cwd: core, env, encoding: 'utf8' });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Restore dismissed/);
  assert.equal(fs.existsSync(path.join(root, 'data/pipeline.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'data/applications.md')), false);
  await setDismissal(offer, false, { root });
  // The existing daily scanner still collapses identical company+role rows;
  // restoration does not change that safeguard or force both into its output.
  assert.deepEqual(run(daily).added_urls, ['https://job-boards.greenhouse.io/acme/jobs/1001']);
  assert.equal(run(reverse).offers.length, 2);
});
