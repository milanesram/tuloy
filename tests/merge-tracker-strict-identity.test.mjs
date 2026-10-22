import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const repo=path.resolve(import.meta.dirname,'..');
test('strict posting mode preserves legacy application history rather than using report/number/company-role guesses',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'career-ops-strict-merge-'));
 try{
  fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'additions'));
  const file=path.join(root,'data/applications.md');
  const old='| 1 | 2026-10-01 | Acme | GRC Analyst | 4.0/5 | Applied | ❌ | — | immutable historical notes |  |';
  fs.writeFileSync(file,'# Applications\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |\n|---|---|---|---|---|---|---|---|---|---|\n'+old+'\n');
  fs.writeFileSync(path.join(root,'additions/001.tsv'),'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n1\t2026-10-13\tAcme\tGRC Analyst\tEvaluated\tN/A\t❌\t—\tseparate canonical posting\thttps://job-boards.greenhouse.io/acme/jobs/102\n');
  const env={...process.env,CAREER_OPS_ROOT:root,CAREER_OPS_TRACKER:file,CAREER_OPS_ADDITIONS:path.join(root,'additions')};
  execFileSync(process.execPath,[path.join(repo,'merge-tracker.mjs'),'--require-posting-identity'],{env,stdio:'pipe'});
  const result=fs.readFileSync(file,'utf8');assert.ok(result.includes(old));assert.ok(result.includes('/jobs/102'));assert.equal(result.split('\n').filter(l=>/^\| \d+ /.test(l)).length,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
