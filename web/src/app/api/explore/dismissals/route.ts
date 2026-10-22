import { careerOpsRoot } from '@/lib/career-ops';
import { readDismissals, setDismissal } from '../../../../../../opportunity-dismissals.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return Response.json({ dismissals: readDismissals(careerOpsRoot()) }); }
  catch (error) { return Response.json({ error: String(error) }, { status: 500 }); }
}

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body?.dismissed !== 'boolean' || !body?.offer) return Response.json({ error: 'Invalid dismissal.' }, { status: 400 });
  try {
    return Response.json({ dismissals: await setDismissal(body.offer, body.dismissed, { root: careerOpsRoot() }) });
  } catch (error) {
    const conflict = (error as { code?: string }).code === 'IN_REVIEW_QUEUE';
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: conflict ? 409 : 500 });
  }
}
