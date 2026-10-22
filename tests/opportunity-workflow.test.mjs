import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readWorkflow, savePreparation, workflowPath } from '../opportunity-workflow.mjs';
import { evidenceReviewTasks, preparationCounts } from '../web/src/lib/preparation.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuloy-preparation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  for (const name of ['applications.md', 'pipeline.md', 'scan-history.tsv']) fs.writeFileSync(path.join(root, 'data', name), `preserve ${name}`);
  fs.writeFileSync(path.join(root, 'cv.md'), 'approved experience');
  return root;
}
const url = 'https://example.org/jobs/1';

test('preparation persists across processes without touching existing job-search records', async t => {
  const root = fixture(t);
  assert.deepEqual(readWorkflow(root).records, []);
  assert.equal(fs.existsSync(workflowPath(root)), false, 'reading does not create records');
  const record = await savePreparation({ url, expectedRevision: 0, patch: { stage: 'preparing', decision: 'pursue', resumeVersion: 'Example-v2', nextAction: 'Review cover letter', chatgptSummary: 'Reviewed conclusion; location remains unclear.' } }, {root});
  assert.equal(record.revision, 1);
  const child = spawnSync(process.execPath, ['opportunity-workflow.mjs', 'read'], { cwd: path.resolve(import.meta.dirname, '..'), env: {...process.env, CAREER_OPS_ROOT:root}, encoding:'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).records[0].stage, 'preparing');
  assert.equal(fs.readFileSync(path.join(root,'cv.md'),'utf8'),'approved experience');
  for (const name of ['applications.md','pipeline.md','scan-history.tsv']) assert.equal(fs.readFileSync(path.join(root,'data',name),'utf8'),`preserve ${name}`);
  assert.equal(fs.statSync(workflowPath(root)).mode & 0o777, 0o600);
});

test('same-posting tracking aliases share notes; different requisitions and fragments remain distinct', async t => {
  const root = fixture(t);
  await savePreparation({url:url+'?utm_source=board',expectedRevision:0,patch:{stage:'selected'}},{root});
  await savePreparation({url,expectedRevision:1,patch:{stage:'ready'}},{root});
  for (const next of ['https://example.org/jobs/2','https://example.org/careers?gh_jid=1','https://example.org/careers?gh_jid=2','https://example.org/#/jobs/1','https://example.org/#/jobs/2']) await savePreparation({url:next,expectedRevision:0,patch:{stage:'reviewing'}},{root});
  assert.equal(readWorkflow(root).records.length,6);
  assert.equal(readWorkflow(root).records.find(r=>r.url===url).revision,2);
});

test('concurrent saves retain both postings; stale edits never overwrite newer notes', async t => {
  const root = fixture(t);
  await Promise.all([savePreparation({url,expectedRevision:0,patch:{nextAction:'One'}},{root}),savePreparation({url:url+'2',expectedRevision:0,patch:{nextAction:'Two'}},{root})]);
  const attempts=await Promise.allSettled([savePreparation({url,expectedRevision:1,patch:{nextAction:'New A'}},{root}),savePreparation({url,expectedRevision:1,patch:{nextAction:'New B'}},{root})]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
  assert.equal(readWorkflow(root).records.length,2);
  assert.equal(readWorkflow(root).records.find(r=>r.url===url).revision,2);
});

test('corrupt storage and unsupported versions are preserved rather than replaced', async t => {
  const root=fixture(t);
  for(const value of ['broken private file','# Opportunity preparation\n\n```json\n{"version":2,"records":[]}\n```\n','# Opportunity preparation\n\n```json\n{"version":1,"records":[]}\n```\nDo not discard this appended note.']) {
    fs.writeFileSync(workflowPath(root),value);
    await assert.rejects(savePreparation({url,expectedRevision:0,patch:{stage:'selected'}},{root}),{code:'INVALID_WORKFLOW'});
    assert.equal(fs.readFileSync(workflowPath(root),'utf8'),value);
  }
});

test('invalid updates cannot write status, unsupported stages, credentials or oversized notes', async t => {
  const root=fixture(t);
  for(const patch of [{status:'Applied'},{stage:'submitted'},{resumeVersion:'x'.repeat(301)},{evidence:[{id:'location',status:'reviewed',note:'',sourceUrl:'',basis:''}]},{evidence:[{id:'location',status:'reviewed',note:'Checked',sourceUrl:'https://user:pass@example.org',basis:''}]}]) {
    await assert.rejects(savePreparation({url,expectedRevision:0,patch},{root}),{code:'INVALID_REQUEST'});
  }
  for (const bad of ['javascript:alert(1)','file:///tmp/file','https://user:pass@example.org']) await assert.rejects(savePreparation({url:bad,expectedRevision:0,patch:{}},{root}),{code:'INVALID_REQUEST'});
  assert.equal(fs.existsSync(workflowPath(root)),false);
});

test('could-not-confirm research persists without promoting eligibility or changing source evidence', async t => {
  const root=fixture(t);
  const job={url,employerIdentityStatus:'AMBIGUOUS',postingStatus:'UNCONFIRMED',jdQuality:'PARTIAL',jd:'Partial text',location:'Remote',gateReasons:['REMOTE_STATE_ELIGIBILITY_UNVERIFIED'],readinessReasons:[],materialRequirements:[],applicationReadiness:'CONDITIONAL_REVIEW'};
  const original=JSON.stringify(job);
  const tasks=evidenceReviewTasks(job);
  assert.deepEqual(tasks.map(t=>t.id),['identity','posting','jd','location']);
  const evidence=tasks.map(task=>({id:task.id,status:'cannot_confirm',note:'Employer evidence is still unavailable.',sourceUrl:'',basis:task.basis}));
  const saved=await savePreparation({url,expectedRevision:0,patch:{evidence}},{root});
  assert.equal(saved.evidence[0].status,'cannot_confirm');
  assert.equal(JSON.stringify(job),original);
  assert.notEqual(evidenceReviewTasks({...job,jd:'Changed requirements'})[2].basis,tasks[2].basis,'changed evidence invalidates prior task basis');
});

test('analytics counts saved preparation separately from application and evaluation outcomes',()=>{
  assert.deepEqual(preparationCounts([{stage:'selected',chatgptSummary:''},{stage:'preparing',chatgptSummary:'Reviewed'},{stage:'ready',chatgptSummary:''},{stage:'on_hold',chatgptSummary:'Unknown location'}]),{selected:1,preparing:1,ready:1,returned:2});
});
