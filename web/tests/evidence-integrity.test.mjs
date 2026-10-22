import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {registerHooks} from 'node:module';import {pathToFileURL} from 'node:url';
import greenhouse from '../../providers/greenhouse.mjs';
import {appendToPipeline} from '../../scan.mjs';
import {materialRequirements,requirementUnits} from '../src/lib/qualification-evidence.mjs';
import {classifyLiteOpportunity} from '../src/lib/lite-recommendation.mjs';
import {reconcileWorkArrangement} from '../src/lib/work-arrangement.mjs';
import {structuredQualificationText,employerRequisitionKey,trackedRequisitionVariant} from '../../lib/posting-evidence.mjs';
import {composeHandoff,opportunityIdentityMatches,trackerSkeleton} from '../src/lib/ops.mjs';
const repo=path.resolve(import.meta.dirname,'../..');
registerHooks({resolve(s,c,next){if(s.startsWith('@/')){const b=path.join(repo,'web/src',s.slice(2));return next(pathToFileURL([b,`${b}.ts`,`${b}.mjs`].find(fs.existsSync)??b).href,c);}return next(s,c);},load(u,c,next){return next(u,u.endsWith('.ts')?{...c,format:'module-typescript'}:c);}});
const {opsSummary}=await import('../src/lib/career-ops.ts'),{POST}=await import('../src/app/api/ops/track/route.ts');
const duties='Perform risk assessments, controls testing and remediation. Lead AI governance and ISO 42001 audit readiness.';
const html=`<p>${duties}</p><h2>WHO YOU ARE</h2><p>Required Skills:</p><ul><li>5+ years of professional experience working in a SaaS company in GRC or Information Security</li><li>Familiar with GCP cloud computing, AI architectures, Data governance and model validations</li><li>Extensive knowledge of at least 2 compliance frameworks (ISO 27001, ISO 42001, SOC, NIST)</li><li>BS degree in Information Systems OR equivalent work experience</li><li>CISSP, CCSK, CISM or other related certifications a plus</li></ul><p>Employees are expected to work from their assigned office a minimum of 3 days per week.</p>`;
async function jobs(overrides=[]){return greenhouse.fetch({name:'SampleCo',careers_url:'https://job-boards.greenhouse.io/sampleco'},{fetchJson:async u=>String(u).includes('/offices')?{}:{jobs:overrides.map((o,i)=>({id:900+i,absolute_url:`https://job-boards.greenhouse.io/sampleco/jobs/${900+i}`,title:'AI Governance Manager',location:{name:'Chicago, IL'},content:html,requisition_id:'REQ-1',internal_job_id:700,metadata:[{name:'Employment Type',value:'Full-time'}],...o}))}});}
test('required base experience cannot inherit a later optional certificate in structured or legacy clauses',()=>{
 for(const jd of ['WHO YOU ARE Required Skills: 5+ years of professional experience working in a SaaS company in GRC Familiar with GCP cloud computing CISSP, CCSK, CISM or other related certifications a plus', 'Who You Are: 5 years GRC experience CISA certification a plus', 'Required Skills:\n5 years GRC experience\nCISA certification preferred']){
  const req=materialRequirements(jd);assert.equal(req.find(r=>r.category==='EXPERIENCE')?.importance,'REQUIRED');assert.ok(req.filter(r=>r.category==='CERTIFICATION').every(r=>r.importance==='PREFERRED'));assert.ok(req.some(r=>r.category==='CERTIFICATION'));
 }
 const optional=materialRequirements('Preferred Skills: Must have 8 years IT audit experience; CISA certification required.');assert.ok(optional.every(r=>r.importance==='PREFERRED'));
 const mandatory=materialRequirements('Required Skills: 5 years GRC experience. Must hold CISA certification.');assert.equal(mandatory.find(r=>r.category==='CERTIFICATION').importance,'REQUIRED');
});
test('structural offsets preserve the exact complete body and recover separate employer requirements',async()=>{
 const [job]=await jobs([{}]);const restored=structuredQualificationText(job.description,job);assert.ok(restored.includes('\n'));assert.equal(restored.replace(/\s+/g,' '),job.description);assert.equal(structuredQualificationText('different body',job),'different body');
 const r=classifyLiteOpportunity({...job,title:job.title,jd:job.description,jdQuality:'COMPLETE',candidateLocation:'Chicago',postingStatus:'ACTIVE'});
 for(const category of ['EXPERIENCE','TECHNICAL_FAMILIARITY','FRAMEWORK_EXPERTISE','EDUCATION'])assert.ok(r.materialRequirements.some(q=>q.category===category&&q.importance==='REQUIRED'&&q.candidateEvidence==='UNVERIFIED'));
 assert.ok(r.materialRequirements.filter(q=>q.category==='CERTIFICATION').every(q=>q.importance==='PREFERRED'));
 assert.equal(r.gate,'REVIEW');assert.notEqual(r.priorityBand,'HIGH');assert.match(composeHandoff({...r,jd:job.description}),/MATERIAL REQUIREMENTS[\s\S]*5\+ years/);
});
test('explicit required example certification is surfaced, not invented as candidate support or all-example mandate',()=>{
 const req=materialRequirements('WHO YOU ARE Required Skills: 4+ years experience leading ISO 27001 audits or an equivalent security audit role. Certified in certifications such as CISSP, CISA, CIA, and CISM. Preferred skills ISO 42001 Lead Auditor certification.');
 assert.equal(req.find(r=>r.category==='EXPERIENCE').importance,'REQUIRED');const cert=req.find(r=>r.category==='CERTIFICATION'&&r.importance==='REQUIRED');assert.equal(cert.candidateEvidence,'UNVERIFIED');
 const supported=materialRequirements('Required Skills: Certified in certifications such as CISSP, CISA, CIA, and CISM.',{certifications:['CISA'],certificationSource:'cv.md'});assert.equal(supported[0].candidateEvidence,'SUPPORTED');
 assert.ok(!materialRequirements('Required Skills: 4 years experience managing security audits.').some(q=>q.category==='PEOPLE_MANAGEMENT'));
 assert.ok(requirementUnits('Assess enhancements/requirements and provide guidance.').every(u=>u.section==='UNSPECIFIED'));
});
test('work model reconciliation preserves remote, hybrid, on-site and conflicting evidence without a veto',()=>{
 const decide=(location,jd)=>reconcileWorkArrangement({location,jd,candidateLocation:'Chicago'});
 assert.equal(decide('Remote, Illinois','Fully remote. No required office attendance.').workArrangement,'Remote');
 assert.equal(decide('Chicago','Employees are expected to work from their assigned office a minimum of 3 days per week.').workArrangement,'Hybrid');
 assert.equal(decide('Onsite, Chicago','This role is fully on-site.').workArrangement,'Onsite');
 const conflict=decide('Remote','Employees are expected to work from their assigned office a minimum of 3 days per week.');assert.equal(conflict.workArrangementStatus,'CONFLICT');assert.equal(conflict.sourceWorkArrangement,'Remote');assert.equal(conflict.jdWorkArrangement,'Hybrid');
 const r=classifyLiteOpportunity({title:'Privacy Manager',jd:`${duties} Employees must work in the office at least 3 days per week.`,location:'Remote',jdQuality:'COMPLETE',candidateLocation:'Chicago',postingStatus:'ACTIVE'});assert.equal(r.gate,'REVIEW');assert.equal(r.applicationReadiness,'CONDITIONAL_REVIEW');assert.match(r.materialGaps,/WORK_ARRANGEMENT_CONFLICT/);
 assert.ok(decide('Remote','Fully remote.').workArrangementReasons.some(r=>r.startsWith('REMOTE_STATE')));
 assert.equal(decide('Remote','This role is hybrid.').workArrangementStatus,'CONFLICT');
 assert.ok(decide('Hybrid','This role is hybrid.').workArrangementReasons.some(r=>r.startsWith('WORK_LOCATION_UNVERIFIED')));
 assert.notEqual(decide('Hybrid, Chicago','This role is not fully remote.').jdWorkArrangement,'Remote');
});
async function workspace(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'career-ops-rc08-test-')),oldRoot=process.env.CAREER_OPS_ROOT,oldTracker=process.env.CAREER_OPS_TRACKER,oldCwd=process.cwd();try{fs.copyFileSync(path.join(repo,'tracker-aliases.json'),path.join(root,'tracker-aliases.json'));process.env.CAREER_OPS_ROOT=root;process.env.CAREER_OPS_TRACKER=path.join(root,'data/applications.md');process.chdir(path.join(repo,'web'));await fn(root);}finally{process.chdir(oldCwd);if(oldRoot===undefined)delete process.env.CAREER_OPS_ROOT;else process.env.CAREER_OPS_ROOT=oldRoot;if(oldTracker===undefined)delete process.env.CAREER_OPS_TRACKER;else process.env.CAREER_OPS_TRACKER=oldTracker;}}
test('real ingestion/archive/projection groups verified aliases but retains distinct posting objects and handoffs',async()=>workspace(async root=>{
 const rows=await jobs([{}, {location:{name:'Remote'}}, {requisition_id:'REQ-2',internal_job_id:701}, {requisition_id:null,internal_job_id:null}]);await appendToPipeline(rows,{pipelinePath:path.join(root,'data/pipeline.md'),jdsDir:path.join(root,'jds')});
 const result=opsSummary();assert.equal(result.queue.length,3);const group=result.queue.find(r=>r.postingVariants?.length);assert.equal(group.employerRequisitionId,'REQ-1');assert.equal(group.requisitionType,'EMPLOYER_REQUISITION');assert.equal(group.employmentType,'Full-time');assert.equal(group.postingVariants.length,1);assert.notEqual(group.url,group.postingVariants[0].url);
 for(const r of [group,...group.postingVariants]){assert.ok(rows.some(j=>j.description===r.jd));assert.equal(r.jdQuality,'COMPLETE');assert.ok(composeHandoff(r).includes(r.jd));assert.match(composeHandoff(r),/Employer requisition ID: REQ-1/);assert.equal(r.trackerId,null);}
 const remote=group.postingVariants.find(r=>r.sourceWorkArrangement==='Remote')||group;assert.equal(remote.workArrangementStatus,'CONFLICT');assert.equal(remote.applicationReadiness,'CONDITIONAL_REVIEW');
 assert.equal(opportunityIdentityMatches(group,group.postingVariants[0]),false,'display grouping never widens automatic tracker matching');assert.deepEqual(result,opsSummary());
 assert.equal(fs.existsSync(path.join(root,'data/applications.md')),false);
}));
test('explicit source namespaces, conflicts, missing IDs and different requisitions cannot create unsafe groups',()=>{
 const base={company:'SampleCo',sourceProvider:'greenhouse',sourceBoard:'sampleco',employerRequisitionId:'REQ-1',providerInternalJobId:'700',employerIdentityStatus:'CONSISTENT'};
 assert.ok(employerRequisitionKey(base));for(const update of [{employerIdentityStatus:'CONFLICT'},{employerIdentityStatus:'AMBIGUOUS'},{employerRequisitionId:''}])assert.equal(employerRequisitionKey({...base,...update}),null);
 assert.equal(employerRequisitionKey({...base,providerInternalJobId:undefined}),employerRequisitionKey({...base,providerInternalJobId:'Not captured'}));
 for(const update of [{sourceBoard:'other'},{company:'OtherCo'},{employerRequisitionId:'REQ-2'},{employerRequisitionId:'req-1'},{providerInternalJobId:'701'}])assert.notEqual(employerRequisitionKey(base),employerRequisitionKey({...base,...update}));
 assert.equal(opportunityIdentityMatches({...base,url:'https://job-boards.greenhouse.io/one/jobs/900'},{...base,url:'https://job-boards.greenhouse.io/two/jobs/900'}),false);
 assert.equal(opportunityIdentityMatches({...base,url:'https://job-boards.greenhouse.io/one/jobs/900'},{...base,employerRequisitionId:'REQ-2',url:'https://job-boards.greenhouse.io/one/jobs/900'}),false);
 assert.ok(trackedRequisitionVariant({...base,url:'https://x/2',role:'Privacy Manager'},[{...base,url:'https://x/1',role:'Earlier title'}],[{url:'https://x/1',company:'OtherCo',role:'Legacy title'}]),'strong alias URL blocks a new write even when historical labels disagree; no association is authorized');
} );
test('manual track route refuses a second verified alias without changing an existing application or dates',async()=>workspace(async root=>{
 const rows=await jobs([{},{}]);await appendToPipeline(rows,{pipelinePath:path.join(root,'data/pipeline.md'),jdsDir:path.join(root,'jds')});const file=path.join(root,'data/applications.md'),original=trackerSkeleton()+`| 1 | 2026-10-01 | SampleCo | AI Governance Manager | Chicago, IL | N/A | Applied | ❌ | — | fixture | ${rows[0].url} |\n`;fs.writeFileSync(file,original);
 const pending=opsSummary().queue.find(r=>r.url===rows[1].url);assert.equal(pending.trackerId,null);assert.match(pending.readinessReasons.join(' '),/REQUISITION_VARIANT_TRACKED/);
 const response=await POST(new Request('http://localhost/api/ops/track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmedSubmitted:true,company:'SampleCo',role:'AI Governance Manager',url:rows[1].url})}));assert.equal(response.status,409);assert.equal(fs.readFileSync(file,'utf8'),original);for(const f of ['status-log.tsv','follow-ups.md','active-interviews.md'])assert.equal(fs.existsSync(path.join(root,'data',f)),false);
}));
