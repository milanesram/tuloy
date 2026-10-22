import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshPostingVerdict, evidenceFromPipelineLine, DAY_MS } from '../web/src/lib/fresh-posting.mjs';
import { prepareDailyQueue, splitDailyQueue } from '../fresh-search.mjs';
import greenhouse from '../providers/greenhouse.mjs';
import { parseDetailPage } from '../providers/builtin.mjs';
import { formatPipelineOffer } from '../scan.mjs';
const now = Date.parse('2026-10-16T18:00:00Z');
const evidence = value => ({value, source:'greenhouse:first_published', url:'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true'});

test('exact rolling boundary, timezone, future, invalid and absent evidence', () => {
  for (const ms of [now, now - DAY_MS, now - DAY_MS + 1]) assert.equal(freshPostingVerdict(evidence(new Date(ms).toISOString()),now), 'fresh');
  assert.equal(freshPostingVerdict(evidence(new Date(now-DAY_MS-1).toISOString()),now),'older');
  assert.equal(freshPostingVerdict(evidence('2026-10-15T13:00:00-05:00'),now),'fresh');
  assert.equal(freshPostingVerdict(evidence('2026-10-16T18:00:01Z'),now),'future_date');
  for(const value of [undefined,null,'','2026-10-16','2026-10-16T17:00:00','yesterday','invalid']) assert.equal(freshPostingVerdict(evidence(value),now),'missing_date');
  for(const source of ['lever:createdAt','ashby:publishedAt','workday:postedOn','updated_at','first_seen']) assert.equal(freshPostingVerdict({...evidence('2026-10-16T17:00:00Z'),source},now),'missing_date');
  assert.equal(freshPostingVerdict({...evidence('2026-10-16T17:00:00Z'),url:'https://evil.example'},now),'missing_date');
});
test('provider evidence survives pipeline round trip; last-updated never substitutes', async () => {
  const [job]=await greenhouse.fetch({name:'Acme',careers_url:'https://job-boards.greenhouse.io/acme'}, {fetchJson: async()=>({jobs:[{id:1,title:'Privacy Analyst',absolute_url:'https://job-boards.greenhouse.io/acme/jobs/1',first_published:'2026-10-16T17:00:00Z',updated_at:'2026-10-16T17:59:00Z'}]})});
  assert.equal(freshPostingVerdict(job.originalPosting,now),'fresh');
  assert.deepEqual(evidenceFromPipelineLine(formatPipelineOffer(job)),job.originalPosting);
  const [undated]=await greenhouse.fetch({name:'Acme',careers_url:'https://job-boards.greenhouse.io/acme'},{fetchJson:async()=>({jobs:[{absolute_url:job.url,updated_at:'2026-10-16T17:59:00Z'}]})});
  assert.equal(freshPostingVerdict(undated.originalPosting,now),'missing_date');
});
test('Built In accepts precise structured date only, not relative card or modified time',()=>{
  const base={ '@type':'JobPosting',title:'Privacy Analyst',description:'Own privacy controls',datePosted:'2026-10-16',dateModified:'2026-10-16T17:00:00Z'};
  const html=obj=>`<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  const source='https://www.builtinchicago.org/job/privacy/123';
  assert.equal(freshPostingVerdict(parseDetailPage(html(base),source,now).originalPosting,now),'missing_date');
  assert.equal(freshPostingVerdict(parseDetailPage(html({...base,datePosted:'2026-10-16T17:00:00Z'}),source,now).originalPosting,now),'fresh');
});
test('backup precedes archive; exact rows, history, JD and application bytes preserved', async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fresh-search-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'jds'));
  const recent=formatPipelineOffer({url:'https://job-boards.greenhouse.io/acme/jobs/1',company:'Acme',title:'Privacy Analyst',originalPosting:evidence('2026-10-16T17:00:00Z')});
  const stale='- [ ] https://example.com/old | Old | Risk Analyst | posted: 2026-10-16 | jd: jds/old.md | source_id: 123';
  const done='- [x] https://example.com/applied | Applied | Privacy';
  const text=`# Pipeline\n\n## Pending\n${recent}\n${stale}\n\n## Processed\n${done}\n`;
  const files={'data/pipeline.md':text,'data/scan-history.tsv':'url\tfirst_seen\nold\t2026-10-16\n','data/applications.md':'history unchanged','jds/old.md':'JD unchanged'};
  for(const [name,bytes] of Object.entries(files))fs.writeFileSync(path.join(root,name),bytes);
  const result=await prepareDailyQueue({root,now});
  assert.equal(result.archived,1);assert.equal(fs.readFileSync(path.join(result.backup,'pipeline.md'),'utf8'),text);
  assert.equal(fs.readFileSync(path.join(result.backup,'scan-history.tsv'),'utf8'),files['data/scan-history.tsv']);
  assert.ok(fs.readFileSync(result.archive,'utf8').includes(stale));
  const active=fs.readFileSync(path.join(root,'data/pipeline.md'),'utf8');assert.ok(active.includes(recent));assert.ok(active.includes(done));assert.ok(!active.includes(stale));
  for(const name of ['data/scan-history.tsv','data/applications.md','jds/old.md']) assert.equal(fs.readFileSync(path.join(root,name),'utf8'),files[name]);
  assert.equal(splitDailyQueue(active,now+DAY_MS).archived.length,1);
});

test('strict CLI dry run uses adapters and existing targeting, fails closed, writes nothing', async t => {
  const { spawnSync } = await import('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fresh-cli-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'config'));
  fs.writeFileSync(path.join(root,'config/profile.yml'),'candidate:\n  full_name: Test\n');
  fs.writeFileSync(path.join(root,'portals.yml'),`title_filter:\n  positive: [Privacy]\nlocation_filter:\n  allow: [Chicago]\ntracked_companies:\n  - name: Acme\n    provider: greenhouse\n    careers_url: https://job-boards.greenhouse.io/acme\n  - name: LastPublished\n    provider: ashby\n    careers_url: https://jobs.ashbyhq.com/acme\n  - name: Created\n    provider: lever\n    careers_url: https://jobs.lever.co/acme\n`);
  const bootstrap=path.join(root,'mock.mjs');
  fs.writeFileSync(bootstrap, `const now=Date.now();globalThis.fetch=async url=>{ const u=String(url);const row=(id,date)=>({id,title:'Privacy Analyst',absolute_url:'https://job-boards.greenhouse.io/acme/jobs/'+id,location:{name:'Chicago'},first_published:date,updated_at:new Date(now).toISOString()});let body;if(u.includes('greenhouse'))body={jobs:[row(1,new Date(now-3600000).toISOString()),row(2,undefined),row(3,new Date(now-90000000).toISOString()),row(4,new Date(now+3600000).toISOString()),{...row(5,new Date(now-3600000).toISOString()),title:'Accountant'},row(6,new Date(now-3600000).toISOString())]};else if(u.includes('ashby'))body={jobs:[{id:'a',title:'Privacy Analyst',jobUrl:'https://jobs.ashbyhq.com/acme/a',location:'Chicago',publishedAt:new Date(now-3600000).toISOString()}]};else body=[{id:'l',text:'Privacy Analyst',hostedUrl:'https://jobs.lever.co/acme/l',categories:{location:'Chicago'},createdAt:now-3600000}];return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});};`);
  // A historical discovery must not block re-verification, while an application
  // must still suppress the exact posting.
  fs.writeFileSync(path.join(root,'data/scan-history.tsv'),'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\nhttps://job-boards.greenhouse.io/acme/jobs/1\t2026-10-01\tGreenhouse\tPrivacy Analyst\tAcme\tadded\n');
  fs.writeFileSync(path.join(root,'data/applications.md'),'# Applications\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n| 1 | 2026-10-01 | Acme | Privacy Analyst | 4 | Applied | | | https://job-boards.greenhouse.io/acme/jobs/6 |\n');
  // Give the already-applied posting a distinct role, so company-role safeguards
  // do not also suppress the other fixture's intentionally identical title.
  const app=path.join(root,'data/applications.md');fs.writeFileSync(app,fs.readFileSync(app,'utf8').replace('Acme | Privacy Analyst','Acme | Privacy Counsel'));
  const files=()=>Object.fromEntries(['data/scan-history.tsv','data/applications.md','portals.yml'].map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]));
  const before=files();
  const run=spawnSync(process.execPath,['--import',bootstrap,'scan.mjs','--fresh-24h','--dry-run','--json','--quiet'],{cwd:process.cwd(),env:{...process.env,CAREER_OPS_ROOT:root},encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);
  assert.equal(result.added,1);assert.deepEqual(result.added_urls,['https://job-boards.greenhouse.io/acme/jobs/1']);
  assert.equal(result.fresh_search.coverage.reduce((s,c)=>s+c.missing_date,0),3);
  assert.equal(result.fresh_search.coverage[0].older,1);assert.equal(result.fresh_search.coverage[0].future_date,1);
  assert.deepEqual(files(),before);assert.equal(fs.existsSync(path.join(root,'data/pipeline.md')),false);
  // Secondary mode is exercised entirely against the mocked transport.
  fs.appendFileSync(path.join(root,'data/scan-history.tsv'),'https://jobs.lever.co/acme/l\t2026-10-01\tLever\tPrivacy Analyst\tCreated\tcooldown:2020-01-01\n');
  fs.mkdirSync(path.join(root,'data/archive'));
  fs.writeFileSync(path.join(root,'data/archive/pending-test.md'),'- [ ] https://job-boards.greenhouse.io/acme/jobs/2 | Acme | Privacy Analyst\n');
  const prior=files();
  const secondary=spawnSync(process.execPath,['--import',bootstrap,'scan.mjs','--fresh-24h','--include-newly-discovered','--dry-run','--json','--quiet'],{cwd:process.cwd(),env:{...process.env,CAREER_OPS_ROOT:root},encoding:'utf8'});
  assert.equal(secondary.status,0,secondary.stderr);const secondaryResult=JSON.parse(secondary.stdout);
  assert.equal(secondaryResult.fresh_search.verified_fresh,1);
  assert.equal(secondaryResult.fresh_search.newly_discovered_unverified,1);
  assert.equal(secondaryResult.fresh_search.previously_seen_unverified,2);
  const unverified=secondaryResult.fresh_search.offers.find(job=>job.discoveryCategory==='NEWLY_DISCOVERED');
  assert.equal(unverified.company,'LastPublished');assert.equal(unverified.postedAt,undefined);
  assert.match(formatPipelineOffer(unverified),/discovery_category: NEWLY_DISCOVERED/);
  assert.ok(!formatPipelineOffer(unverified).includes(' | posted:'));
  assert.deepEqual(files(),prior);assert.equal(fs.existsSync(path.join(root,'data/pipeline.md')),false);
  // A mocked real write records observed identities without touching applications.
  const apply=spawnSync(process.execPath,['--import',bootstrap,'scan.mjs','--fresh-24h','--include-newly-discovered','--json','--quiet'],{cwd:process.cwd(),env:{...process.env,CAREER_OPS_ROOT:root},encoding:'utf8'});
  assert.equal(apply.status,0,apply.stderr);
  assert.equal(fs.readFileSync(app,'utf8'),prior['data/applications.md']);
  assert.match(fs.readFileSync(path.join(root,'data/pipeline.md'),'utf8'),/discovery_category: NEWLY_DISCOVERED/);
  assert.match(fs.readFileSync(path.join(root,'data/scan-history.tsv'),'utf8'),/observed/);
  const repeated=spawnSync(process.execPath,['--import',bootstrap,'scan.mjs','--fresh-24h','--include-newly-discovered','--dry-run','--json','--quiet'],{cwd:process.cwd(),env:{...process.env,CAREER_OPS_ROOT:root},encoding:'utf8'});
  assert.equal(repeated.status,0,repeated.stderr);assert.equal(JSON.parse(repeated.stdout).fresh_search.newly_discovered_unverified,0);
});

test('daily view expires records on render and never uses displayed/scanned dates',async()=>{
  const {dailyReviewEligible}=await import('../web/src/lib/fresh-posting.mjs');
  const job={done:false,postedAt:'2026-10-16',firstSeen:'2026-10-16',originalPosting:evidence('2026-10-16T17:00:00Z')};
  assert.equal(dailyReviewEligible(job,true,now),true);
  assert.equal(dailyReviewEligible(job,true,now+DAY_MS),false);
  assert.equal(dailyReviewEligible({...job,originalPosting:undefined},true,now),false);
  assert.equal(dailyReviewEligible({...job,done:true},true,now),false);
  assert.equal(dailyReviewEligible({...job,originalPosting:undefined},false,now),true);
});

test('reverified posting with changed JD preserves the earlier archive',async t=>{
  const {archiveCompleteJd}=await import('../scan.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fresh-jd-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const job={source:'greenhouse-api',sourceId:'1',company:'Acme',title:'Privacy Analyst',descriptionComplete:true,description:'Original full JD'};
  const a=archiveCompleteJd(job,{jdsDir:root});const b=archiveCompleteJd({...job,description:'Updated full JD'},{jdsDir:root});
  assert.notEqual(a,b);assert.equal(fs.readFileSync(path.join(root,path.basename(a)),'utf8'),'Original full JD\n');
  assert.equal(fs.readFileSync(path.join(root,path.basename(b)),'utf8'),'Updated full JD\n');
});


test('categories remain separate; older/future never become newly discovered; discovery age is not publication age',async()=>{
  const {dailyDiscoveryCategory,dailyReviewEligible}=await import('../web/src/lib/fresh-posting.mjs');
  assert.equal(dailyDiscoveryCategory(evidence('2026-10-16T17:00:00Z'),true,now),'VERIFIED_FRESH');
  assert.equal(dailyDiscoveryCategory(undefined,false,now),'NEWLY_DISCOVERED');
  assert.equal(dailyDiscoveryCategory(undefined,true,now),'PREVIOUSLY_SEEN');
  assert.equal(dailyDiscoveryCategory(evidence('2026-10-15T17:59:59Z'),false,now),'CONFIRMED_OLDER');
  assert.equal(dailyDiscoveryCategory(evidence('2026-10-16T18:00:01Z'),false,now),'INVALID_DATE');
  const job={discoveryCategory:'NEWLY_DISCOVERED',discoveredAt:'2026-10-16T17:00:00Z'};
  assert.equal(dailyReviewEligible(job,true,now),true);
  assert.equal(dailyReviewEligible({...job,discoveredAt:undefined},true,now),false);
  assert.equal(dailyReviewEligible(job,true,now+DAY_MS),false);
  assert.equal(dailyReviewEligible({...job,originalPosting:evidence('2026-10-15T17:59:59Z')},true,now),false);
  const row=formatPipelineOffer({url:'https://example.com/1',company:'Acme',title:'Privacy',...job});
  assert.deepEqual(splitDailyQueue(row,now).archived,[]);
  assert.equal(splitDailyQueue(row,now+DAY_MS).archived.length,1);
});

test('archived employer requisition variants are historical even when title/URL change',async t=>{
  const {loadDiscoveryHistory}=await import('../scan.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fresh-history-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const old={url:'https://job-boards.greenhouse.io/acme/jobs/1',company:'Acme',title:'Privacy Analyst',sourceProvider:'greenhouse',sourceBoard:'acme',employerRequisitionId:'PR-123'};
  fs.writeFileSync(path.join(root,'pending-old.md'),formatPipelineOffer(old));
  const history=loadDiscoveryHistory({historyPath:path.join(root,'history.tsv'),pipelinePath:path.join(root,'pipeline.md'),archiveDir:root,applicationsPath:path.join(root,'apps.md')});
  assert.equal(history.has({...old,title:'Privacy Specialist',url:'https://job-boards.greenhouse.io/acme/jobs/2'}),true);
  assert.equal(history.has({...old,employerRequisitionId:'PR-999',url:'https://job-boards.greenhouse.io/acme/jobs/3'}),false);
});
