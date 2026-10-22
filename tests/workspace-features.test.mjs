import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readCareerStrategies,saveCareerStrategies} from '../career-strategies.mjs';
import {classifyLiteOpportunity} from '../web/src/lib/lite-recommendation.mjs';
import {selectConfiguredRoute} from '../web/src/lib/career-strategy.mjs';
import {listDocuments,readLibraryDocument} from '../document-library.mjs';
import {readSchedules,saveSchedules,runDueSchedules,readScheduleResults,executeScheduledScan} from '../discovery-scheduler.mjs';
import {queueQualificationContext} from '../lib/queue-admission.mjs';

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-workspace-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'config'));for(const n of ['applications.md','pipeline.md','scan-history.tsv'])fs.writeFileSync(path.join(root,'data',n),`preserve ${n}`);fs.writeFileSync(path.join(root,'cv.md'),'Approved experience');fs.writeFileSync(path.join(root,'config/profile.yml'),'candidate:\n  location: Chicago, IL\n');return root;}
function preserved(root){for(const n of ['applications.md','pipeline.md','scan-history.tsv'])assert.equal(fs.readFileSync(path.join(root,'data',n),'utf8'),`preserve ${n}`);assert.equal(fs.readFileSync(path.join(root,'cv.md'),'utf8'),'Approved experience');assert.equal(fs.readFileSync(path.join(root,'config/profile.yml'),'utf8'),'candidate:\n  location: Chicago, IL\n');}
const route={code:'OPERATIONS',label:'Operations',resume:'Approved-Operations.docx',titleTerms:['operations analyst'],dutyTerms:['process improvement','service delivery'],excludeTerms:['volunteer']};
const filter={positive:['operations analyst'],negative:[],allow:['Chicago'],block:[],blockHard:['outside Illinois'],alwaysAllow:[],sources:['greenhouse'],sinceDays:7,limitPerAts:10};
const draft={id:'',name:'Sample daily search',enabled:false,intervalHours:24,filters:filter};

test('missing strategy settings preserve legacy behavior and create no private settings',t=>{
 const root=fixture(t);assert.equal(readCareerStrategies(root).active,'legacy');assert.equal(fs.existsSync(path.join(root,'config/career-strategies.json')),false);assert.equal(queueQualificationContext(root).active,false);preserved(root);
});
test('custom strategy is shared by queue qualification without modifying primary facts',async t=>{
 const root=fixture(t);const saved=await saveCareerStrategies(root,{expectedRevision:0,active:'custom',routes:[route]});assert.equal(saved.revision,1);
 const context=queueQualificationContext(root);assert.equal(context.active,true);assert.equal(context.candidateEvidence.careerStrategy.routes[0].code,'OPERATIONS');
 const job={company:'Example',title:'Operations Analyst',jd:'Own process improvement and service delivery.',jdQuality:'COMPLETE',postingStatus:'ACTIVE',location:'Chicago',candidateEvidence:context.candidateEvidence};
 const result=classifyLiteOpportunity(job);assert.equal(result.careerLaneCode,'OPERATIONS');assert.equal(result.recommendedResumeBase,'Approved-Operations.docx');assert.equal(result.applicationReadiness,'CONDITIONAL_REVIEW');assert.equal(result.gate,'PASS');assert.equal(result.roleFamily,'TARGET_CUSTOM');
 assert.equal(classifyLiteOpportunity({...job,postingStatus:'CLOSED'}).gate,'FAIL');assert.equal(classifyLiteOpportunity({...job,jd:job.jd+' Cannot hire in Illinois.',candidateLocation:'Chicago, IL'}).gate,'FAIL');preserved(root);
});
test('strategy terms are literal, duty-led, tie-aware and not substring traps',()=>{
 const strategy={active:'custom',routes:[route,{...route,code:'OTHER',label:'Other',titleTerms:['operations analyst'],dutyTerms:['budget review']}]};
 assert.equal(selectConfiguredRoute('Operations Analyst','Own service delivery.',strategy).code,'OPERATIONS');assert.equal(selectConfiguredRoute('Operations Analyst','',strategy).code,'HYBRID');assert.equal(selectConfiguredRoute('Preoperations analyst','',strategy).code,'UNCLEAR');
 const literal={active:'custom',routes:[{...route,titleTerms:['C++'],dutyTerms:[]}]};assert.equal(selectConfiguredRoute('C++ Developer','',literal).code,'OPERATIONS');assert.equal(selectConfiguredRoute('CCC Developer','',literal).code,'UNCLEAR');
 assert.equal(selectConfiguredRoute('Operations Analyst','Volunteer service delivery.',{...strategy,routes:[route]}).code,'UNCLEAR');
});
test('custom strategies do not impose legacy occupation vetoes or waive mandatory evidence',()=>{
 const strategy={active:'custom',routes:[{...route,code:'ENGINEERING',titleTerms:['software engineer'],dutyTerms:['build software']}]};
 const result=classifyLiteOpportunity({company:'Example',title:'Software Engineer',jd:'Build software. Required: active security clearance.',jdQuality:'COMPLETE',postingStatus:'ACTIVE',candidateEvidence:{careerStrategy:strategy}});
 assert.notEqual(result.gate,'FAIL');assert.equal(result.applicationReadiness,'CONDITIONAL_REVIEW');assert.ok(result.readinessReasons.some(r=>/CLEARANCE/.test(r)));assert.notEqual(result.recommendationClass,'PRIORITY');
});
test('strategy settings reject stale edits and preserve corrupt files',async t=>{
 const root=fixture(t);await saveCareerStrategies(root,{expectedRevision:0,active:'custom',routes:[route]});await assert.rejects(saveCareerStrategies(root,{expectedRevision:0,active:'legacy',routes:[]}),{code:'REVISION_CONFLICT'});
 await assert.rejects(saveCareerStrategies(root,{expectedRevision:1,active:'custom',routes:[route,route]}));const file=path.join(root,'config/career-strategies.json');fs.writeFileSync(file,'private broken settings');await assert.rejects(saveCareerStrategies(root,{expectedRevision:1,active:'legacy',routes:[]}),{code:'INVALID_STORE'});assert.equal(fs.readFileSync(file,'utf8'),'private broken settings');preserved(root);
});
test('document library lists supported local files and serves exact bytes without changing records',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'output'));fs.mkdirSync(path.join(root,'documents'));fs.mkdirSync(path.join(root,'reports'));fs.writeFileSync(path.join(root,'output','sample-cv.pdf'),'%PDF-1.4\nSample');fs.writeFileSync(path.join(root,'documents','resume.docx'),'fictional docx');fs.writeFileSync(path.join(root,'reports','review.md'),'# Review');fs.writeFileSync(path.join(root,'documents','active.html'),'<script>bad()</script>');
 const {documents}=listDocuments(root);assert.equal(documents.length,3);const entry=documents.find(d=>d.name==='sample-cv.pdf');const result=readLibraryDocument(root,entry.id);assert.equal(result.mime,'application/pdf');assert.equal(result.content.toString(),'%PDF-1.4\nSample');assert.equal(listDocuments(root).documents.find(d=>d.name==='resume.docx').kind,'CV / resume');preserved(root);
});
test('document library rejects traversal and symlink escapes, including sibling private files',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'output'));fs.symlinkSync(path.join(root,'cv.md'),path.join(root,'output','leak.md'));fs.symlinkSync(os.tmpdir(),path.join(root,'output','outside'));assert.equal(listDocuments(root).documents.length,0);assert.throws(()=>readLibraryDocument(root,'../../cv.md'),{code:'INVALID_REQUEST'});assert.throws(()=>readLibraryDocument(root,'a'.repeat(64)),{code:'NOT_FOUND'});preserved(root);
});
test('document library refuses an entire symlinked library root and oversized downloads',t=>{
 const root=fixture(t);const outside=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-doc-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));fs.writeFileSync(path.join(outside,'private.txt'),'Private');fs.symlinkSync(outside,path.join(root,'documents'));assert.equal(listDocuments(root).documents.length,0);fs.mkdirSync(path.join(root,'output'));const file=path.join(root,'output','large.pdf');const fd=fs.openSync(file,'w');fs.ftruncateSync(fd,51*1024*1024);fs.closeSync(fd);assert.throws(()=>readLibraryDocument(root,listDocuments(root).documents[0].id),{code:'TOO_LARGE'});
});
test('new schedules stay paused and no scan runs until explicitly requested',async t=>{
 const root=fixture(t);assert.equal(readSchedules(root).jobs.length,0);const saved=await saveSchedules(root,{expectedRevision:0,jobs:[draft]});let calls=0;
 assert.deepEqual(await runDueSchedules(root,{runScanner:async()=>{calls++;return {offers:[]};}}),[]);assert.equal(calls,0);assert.equal(saved.jobs[0].enabled,false);
 await runDueSchedules(root,{onlyId:saved.jobs[0].id,runScanner:async()=>{calls++;return {offers:[{url:'https://example.org/jobs/1',title:'Operations Analyst',company:'Example'}]};}});assert.equal(calls,1);assert.equal(readSchedules(root).jobs[0].enabled,false);assert.equal(readScheduleResults(root,saved.jobs[0].id).offers.length,1);preserved(root);
});
test('concurrent due runners execute a schedule once and preserve all existing job-search data',async t=>{
 const root=fixture(t);await saveSchedules(root,{expectedRevision:0,jobs:[{...draft,enabled:true}]});let calls=0;const execute=async()=>{calls++;await new Promise(r=>setTimeout(r,60));return {offers:[],datasetStatus:{greenhouse:'ok'}};};
 await Promise.all([runDueSchedules(root,{runScanner:execute}),runDueSchedules(root,{runScanner:execute})]);assert.equal(calls,1);const job=readSchedules(root).jobs[0];assert.equal(job.lastStatus,'success');assert.ok(Date.parse(job.nextRunAt)>Date.now());assert.equal(job.runs.length,1);preserved(root);
});
test('partial coverage and failures are not reported as successful empty searches',async t=>{
 const root=fixture(t);const state=await saveSchedules(root,{expectedRevision:0,jobs:[draft]});const id=state.jobs[0].id;
 await runDueSchedules(root,{onlyId:id,runScanner:async()=>({offers:[],unreachableBoards:2,stoppedEarly:true})});assert.equal(readScheduleResults(root,id).status,'degraded');
 await runDueSchedules(root,{onlyId:id,runScanner:async()=>{throw new Error('Source failed');}});const latest=readScheduleResults(root,id);assert.equal(latest.status,'failed');assert.equal(latest.error,'Source failed');assert.equal(readSchedules(root).jobs[0].runs.length,2);preserved(root);
});
test('pausing during a scan preserves the pause and newer filter/name edits',async t=>{
 const root=fixture(t);const initial=await saveSchedules(root,{expectedRevision:0,jobs:[{...draft,enabled:true}]});let release;let started;const barrier=new Promise(r=>started=r);
 const running=runDueSchedules(root,{runScanner:async()=>{started();await new Promise(r=>release=r);return {offers:[]};}});await barrier;const state=readSchedules(root);await saveSchedules(root,{expectedRevision:state.revision,jobs:[{...state.jobs[0],name:'Updated name',enabled:false}]});release();await running;const job=readSchedules(root).jobs[0];assert.equal(job.enabled,false);assert.equal(job.name,'Updated name');assert.equal(job.nextRunAt,null);assert.equal(job.runs.length,1);preserved(root);
});
test('scheduled scan reuses the core dry-run scanner with isolated serialized filters',async t=>{
 const root=fixture(t);let args;let temp;
 const result=await executeScheduledScan(root,filter,{execute:(node,a,options,callback)=>{args=a;temp=options.env.CAREER_OPS_PORTALS;assert.notEqual(temp,path.join(root,'portals.yml'));assert.match(fs.readFileSync(temp,'utf8'),/operations analyst/);assert.equal(options.env.CAREER_OPS_ROOT,root);assert.ok(options.timeout<=240000);callback(null,JSON.stringify({offers:[]}));}});
 assert.ok(args.includes('--dry-run'));assert.ok(args.includes('--json'));assert.ok(args[0].endsWith('scan-ats-full.mjs'));assert.equal(fs.existsSync(temp),false);assert.deepEqual(result.offers,[]);preserved(root);
});
test('schedule settings reject unsupported sources, blank searches and malformed stores',async t=>{
 const root=fixture(t);for(const filters of [{...filter,positive:[]},{...filter,sources:['untrusted']},{...filter,limitPerAts:9999}])await assert.rejects(saveSchedules(root,{expectedRevision:0,jobs:[{...draft,filters}]}));fs.writeFileSync(path.join(root,'data/discovery-schedules.json'),'preserve malformed schedules');await assert.rejects(saveSchedules(root,{expectedRevision:0,jobs:[draft]}),{code:'INVALID_STORE'});assert.equal(fs.readFileSync(path.join(root,'data/discovery-schedules.json'),'utf8'),'preserve malformed schedules');preserved(root);
});
