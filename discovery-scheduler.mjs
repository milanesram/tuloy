import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {execFile, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFeature, updateFeature, featureError, boundedText, textList} from './lib/feature-store.mjs';
import {withPipelineLock} from './pipeline-lock.mjs';
import {writeFileAtomic} from './tracker-utils.mjs';
import {serializePortals} from './web/src/lib/core/portals-serialize.mjs';
import {getCareerOpsRoot} from './path-resolver.mjs';
import {assertStrategySources} from './lib/strategy-sources.mjs';
import {isMainModule} from './lib/is-main-module.mjs';

const sourceRoot=path.dirname(fileURLToPath(import.meta.url));
export const SCHEDULE_FILE='data/discovery-schedules.json';
const initial={version:1,revision:0,jobs:[]};
const sources=['greenhouse','lever','ashby','workday','builtin'];
function filters(value) {
  if(!value || typeof value!=='object')throw featureError('Search filters are required.');
  const out={};for(const key of ['positive','negative','allow','block','blockHard','alwaysAllow'])out[key]=textList(value[key]);
  if(!out.positive.length)throw featureError('Choose at least one role keyword for a bounded search.');
  if(!Array.isArray(value.sources)||!value.sources.length||value.sources.some(s=>!sources.includes(s)))throw featureError('Choose supported discovery sources.');
  out.sources=[...new Set(value.sources)];
  if(!Number.isInteger(value.sinceDays)||value.sinceDays<1||value.sinceDays>30||!Number.isInteger(value.limitPerAts)||value.limitPerAts<1||value.limitPerAts>500)throw featureError('Choose a 1–30 day window and a source limit of 1–500.');
  out.sinceDays=value.sinceDays;out.limitPerAts=value.limitPerAts;return out;
}
function validate(value) {
  if(!value||value.version!==1||!Number.isInteger(value.revision)||value.revision<0||!Array.isArray(value.jobs)||value.jobs.length>10)throw featureError('Invalid discovery schedules.');
  const ids=new Set();
  for(const job of value.jobs){
    if(!job||!/^[0-9a-f-]{36}$/.test(job.id)||ids.has(job.id)||typeof job.enabled!=='boolean'||!Number.isInteger(job.intervalHours)||job.intervalHours<1||job.intervalHours>168||!Array.isArray(job.runs))throw featureError('Invalid saved schedule.');
    ids.add(job.id);boundedText(job.name,100,true);filters(job.filters);
    if((job.enabled&&job.nextRunAt===null)||(job.nextRunAt!==null&&!Number.isFinite(Date.parse(job.nextRunAt))))throw featureError('Invalid schedule time.');
  }
}
export function readSchedules(root) {return readFeature(root,SCHEDULE_FILE,initial,validate);}
export function saveSchedules(root,request,now=Date.now()) {
  if(!request||!Number.isInteger(request.expectedRevision)||request.expectedRevision<0||!Array.isArray(request.jobs))throw featureError('Current schedule revision and jobs are required.');
  return updateFeature(root,SCHEDULE_FILE,initial,validate,request.expectedRevision,current=>{
    if(current.jobs.some(job=>!request.jobs.some(next=>next.id===job.id)))throw featureError('Pause existing schedules instead of deleting their history.');
    const jobs=request.jobs.map(input=>{
      const prior=input.id?current.jobs.find(job=>job.id===input.id):null;
      if(input.id&&!prior)throw featureError('Unknown schedule. Reload settings.');
      if(typeof input.enabled!=='boolean')throw featureError('Choose whether the schedule is paused or enabled.');
      return {...(prior||{id:randomUUID(),runs:[],lastStatus:'never',lastRunAt:null,lastError:null}),name:boundedText(input.name,100,true),enabled:input.enabled,intervalHours:input.intervalHours,filters:filters(input.filters),
        nextRunAt:input.enabled?(prior?.enabled&&prior.nextRunAt?prior.nextRunAt:new Date(now).toISOString()):null};
    });
    return {...current,jobs};
  });
}

/** Reuse the existing public ATS scanner, with saved explicit filters in a
 * throwaway file and --dry-run. No queue, tracker, CV or scan-history writer. */
export function executeScheduledScan(root,filter,{execute=execFile}={}) {
  return new Promise((resolve,reject)=>{
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-scheduled-'));
    const config=path.join(temporary,'portals.yml');fs.writeFileSync(config,serializePortals(filter),{mode:0o600});
    const env={...process.env,CAREER_OPS_ROOT:root,CAREER_OPS_DATA_DIR:root,CAREER_OPS_PORTALS:config};
    execute(process.execPath,[path.join(sourceRoot,'scan-ats-full.mjs'),'--dry-run','--json','--since',String(filter.sinceDays),'--ats',filter.sources.join(','),'--limit',String(filter.limitPerAts)],{cwd:sourceRoot,env,timeout:240000,maxBuffer:24*1024*1024},(error,stdout)=>{
      fs.rmSync(temporary,{recursive:true,force:true});
      try {const result=JSON.parse(stdout);if(error||!Array.isArray(result.offers))throw new Error();resolve(result);}
      catch {reject(featureError(error?.killed?'Discovery timed out; no successful empty search was recorded.':'Discovery failed or returned incomplete output. Review the source diagnostics.','SCAN_FAILED'));}
    });
  });
}

export async function runDueSchedules(root,{now=Date.now(),runScanner=executeScheduledScan,onlyId=null}={}) {
  return withPipelineLock(path.join(root,SCHEDULE_FILE+'.runner'),async()=>{
    const due=readSchedules(root).jobs.filter(job=>(job.enabled||onlyId)&&(!onlyId||job.id===onlyId)&&(onlyId||Date.parse(job.nextRunAt||'')<=now));
    const completed=[];
    for(const snapshot of due){
      // Re-check pause/config edits after acquiring the exclusive runner lock.
      const job=readSchedules(root).jobs.find(item=>item.id===snapshot.id);
      if(!job||(!job.enabled&&!onlyId))continue;
      const startedAt=new Date(now).toISOString();const runId=randomUUID();let result=null;let error=null;let status='failed';
      await updateFeature(root,SCHEDULE_FILE,initial,validate,null,current=>({...current,jobs:current.jobs.map(item=>item.id===job.id?{...item,lastStatus:'running',lastRunAt:startedAt}:item)}));
      try {
        assertStrategySources({root,profilePath:path.join(root,'config/profile.yml')});
        result=await runScanner(root,job.filters);
        if(!result||!Array.isArray(result.offers))throw featureError('Scanner returned invalid results.');
        status=result.capHit||result.degraded||result.timedOut||result.stoppedEarly||result.unreachableBoards>0||result.postingsDroppedNoDate>0||(result.datasetStatus&&Object.values(result.datasetStatus).some(s=>s!=='ok'))?'degraded':'success';
      } catch(e){error=e.message;}
      const endedAt=new Date().toISOString();
      const receipt={runId,jobId:job.id,startedAt,endedAt,status,error,offers:result?.offers||[],diagnostics:result?Object.fromEntries(Object.entries(result).filter(([key])=>key!=='offers')):null};
      const relative=`data/scheduled-discovery/${job.id}/${runId}.json`;fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});writeFileAtomic(path.join(root,relative),JSON.stringify(receipt,null,2)+'\n');fs.chmodSync(path.join(root,relative),0o600);
      const summary={runId,startedAt,endedAt,status,error,count:receipt.offers.length,resultFile:relative};
      await updateFeature(root,SCHEDULE_FILE,initial,validate,null,current=>({...current,jobs:current.jobs.map(item=>item.id===job.id?{...item,lastRunAt:startedAt,lastStatus:status,lastError:error,nextRunAt:item.enabled?new Date(Math.max(now,Date.now())+item.intervalHours*3600000).toISOString():null,runs:[summary,...item.runs].slice(0,20)}:item)}));
      completed.push(summary);
    }
    return completed;
  },{timeoutMs:2000});
}

export function readScheduleResults(root,id) {
  const job=readSchedules(root).jobs.find(item=>item.id===id);
  if(!job)throw featureError('Schedule not found.','NOT_FOUND');
  if(!job.runs.length)return {offers:[],status:'never'};
  const run=job.runs[0];const expected=`data/scheduled-discovery/${job.id}/${run.runId}.json`;
  if(run.resultFile!==expected||!/^[0-9a-f-]{36}$/.test(run.runId))throw featureError('Saved result reference is invalid.','INVALID_STORE');
  const file=path.join(root,expected);if(fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep))throw featureError('Saved result path is invalid.','INVALID_STORE');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

export function backgroundIdentity(root) {
  const label='local.tuloy.discovery.'+createHash('sha256').update(fs.realpathSync(root)).digest('hex').slice(0,12);
  return {label,file:path.join(os.homedir(),'Library','LaunchAgents',label+'.plist')};
}
export function backgroundStatus(root) {
  const identity=backgroundIdentity(root);let loaded=false;
  if(process.platform==='darwin')try{execFileSync('/bin/launchctl',['print',`gui/${process.getuid()}/${identity.label}`],{stdio:'ignore'});loaded=true;}catch{}
  return {supported:process.platform==='darwin',installed:fs.existsSync(identity.file),loaded};
}
export function installBackgroundScheduler(root) {
  if(process.platform!=='darwin')throw featureError('Use node discovery-scheduler.mjs tick from your operating-system scheduler. Automatic installation is currently available on macOS.');
  const {label,file}=backgroundIdentity(root);const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const args=[process.execPath,path.join(sourceRoot,'discovery-scheduler.mjs'),'tick','--root',fs.realpathSync(root)];
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(arg=>`<string>${escape(arg)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${escape(sourceRoot)}</string><key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><true/></dict></plist>\n`;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw featureError('Background task file is a symlink; it was preserved.');
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')!==xml)throw featureError('An existing background task differs. Preserve it and reinstall explicitly from the command line.');
  fs.writeFileSync(file,xml,{mode:0o600});
  if(!backgroundStatus(root).loaded)execFileSync('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,file],{stdio:'pipe'});
  return backgroundStatus(root);
}

if(isMainModule(import.meta.url)) {
  try {
    const index=process.argv.indexOf('--root');const root=index>=0?path.resolve(process.argv[index+1]):getCareerOpsRoot();
    if(process.argv[2]==='tick')console.log(JSON.stringify(await runDueSchedules(root)));
    else if(process.argv[2]==='install')console.log(JSON.stringify(installBackgroundScheduler(root)));
    else if(process.argv[2]==='status')console.log(JSON.stringify(backgroundStatus(root)));
    else console.log('Usage: node discovery-scheduler.mjs tick|install|status [--root data-folder]. Discovery only; schedules start paused.');
  } catch(error){console.error(error.message);process.exitCode=1;}
}
