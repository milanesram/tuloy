import {careerOpsRoot} from '@/lib/career-ops';
import {listDocuments,readLibraryDocument} from '../../../../../document-library.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  try {
    const id=new URL(req.url).searchParams.get('id');
    if(id===null)return Response.json(listDocuments(careerOpsRoot()));
    const {entry,content,mime}=readLibraryDocument(careerOpsRoot(),id);
    return new Response(new Uint8Array(content),{headers:{'Content-Type':mime,'Content-Disposition':`${entry.extension==='.pdf'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(entry.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){const e=error as Error&{code?:string};return Response.json({error:e.message},{status:e.code==='NOT_FOUND'?404:e.code==='TOO_LARGE'?413:e.code==='INVALID_REQUEST'?400:500});}
}
