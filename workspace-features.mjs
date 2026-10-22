// Web-to-core command boundary: core filesystem/worker code runs in Node,
// outside the Next.js bundle, with the existing data root explicitly selected.
import {getCareerOpsRoot} from './path-resolver.mjs';
import {isMainModule} from './lib/is-main-module.mjs';
import {readCareerStrategies,saveCareerStrategies} from './career-strategies.mjs';
import {readSchedules,saveSchedules,backgroundStatus,installBackgroundScheduler,runDueSchedules,readScheduleResults} from './discovery-scheduler.mjs';
export async function executeWorkspaceFeature(action,input={},root=getCareerOpsRoot()) {
  if(action==='strategies-read')return readCareerStrategies(root);
  if(action==='strategies-save')return saveCareerStrategies(root,input);
  if(action==='schedules-read')return {...readSchedules(root),worker:backgroundStatus(root)};
  if(action==='schedules-save')return saveSchedules(root,input);
  if(action==='schedules-install')return installBackgroundScheduler(root);
  if(action==='schedules-results')return readScheduleResults(root,input.id);
  if(action==='schedules-run'){
    if(typeof input.id!=='string'||!readSchedules(root).jobs.some(job=>job.id===input.id))throw Object.assign(new Error('Select an existing schedule.'),{code:'INVALID_REQUEST'});
    return {runs:await runDueSchedules(root,{onlyId:input.id})};
  }
  throw Object.assign(new Error('Unknown workspace action.'),{code:'INVALID_REQUEST'});
}
if(isMainModule(import.meta.url)){
  try{
    let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>200000)throw new Error('Request too large.');}
    console.log(JSON.stringify({ok:true,value:await executeWorkspaceFeature(process.argv[2],raw?JSON.parse(raw):{})}));
  }catch(error){console.log(JSON.stringify({ok:false,error:error.message,code:error.code||error.name||'CORE_ERROR'}));process.exitCode=1;}
}
