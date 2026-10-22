import {execFile} from 'node:child_process';
import {careerOpsRoot,rootScript} from '@/lib/career-ops';
export function callWorkspaceFeature(action:string,input:unknown={}):Promise<Response>{
  return new Promise(resolve=>{
    const child=execFile(process.execPath,[rootScript('workspace-features'),action],{cwd:careerOpsRoot(),env:{...process.env,CAREER_OPS_ROOT:careerOpsRoot()},timeout:action==='schedules-run'?300000:15000,maxBuffer:32*1024*1024},(error,stdout)=>{
      try{const result=JSON.parse(stdout);if(!result.ok)return resolve(Response.json({error:result.error},{status:result.code==='REVISION_CONFLICT'||result.code==='LockTimeoutError'?409:result.code==='NOT_FOUND'?404:result.code==='INVALID_REQUEST'||result.code==='SyntaxError'?400:500}));if(error)throw error;resolve(Response.json(result.value));}
      catch{resolve(Response.json({error:'The workspace operation failed. Existing records were preserved.'},{status:500}));}
    });
    child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify(input));
  });
}
