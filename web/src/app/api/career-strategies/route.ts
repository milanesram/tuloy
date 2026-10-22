import {callWorkspaceFeature} from '@/lib/core/workspace-features';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return callWorkspaceFeature('strategies-read');}
export async function POST(req:Request){
  try {const raw=await req.text();if(raw.length>200000)return Response.json({error:'Strategy settings are too large.'},{status:413});return callWorkspaceFeature('strategies-save',JSON.parse(raw));}
  catch(error){const e=error as Error&{code?:string};return Response.json({error:e.message},{status:e.code==='REVISION_CONFLICT'?409:e.code==='INVALID_STORE'?500:400});}
}
