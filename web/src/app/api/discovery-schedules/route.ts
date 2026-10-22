import {callWorkspaceFeature} from '@/lib/core/workspace-features';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req:Request){
  try {const id=new URL(req.url).searchParams.get('id');return callWorkspaceFeature(id?'schedules-results':'schedules-read',id?{id}:{});}
  catch(error){return Response.json({error:(error as Error).message},{status:500});}
}
export async function POST(req:Request){
  try {
    const raw=await req.text();if(raw.length>200000)return Response.json({error:'Schedule settings are too large.'},{status:413});const body=JSON.parse(raw);
    if(body.action==='save')return callWorkspaceFeature('schedules-save',body);
    if(body.action==='install')return callWorkspaceFeature('schedules-install');
    if(body.action==='run')return callWorkspaceFeature('schedules-run',{id:body.id});
    return Response.json({error:'Unknown schedule action.'},{status:400});
  }catch(error){const e=error as Error&{code?:string};return Response.json({error:e.message},{status:e.code==='REVISION_CONFLICT'?409:e.code==='INVALID_STORE'?500:e.name==='LockTimeoutError'?409:400});}
}
