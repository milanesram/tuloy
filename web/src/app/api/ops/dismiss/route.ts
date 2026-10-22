import { careerOpsRoot } from '@/lib/career-ops';
import { dismissReviewOpportunity } from '../../../../../../opportunity-dismissals.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  try { return Response.json(await dismissReviewOpportunity(body?.offer, { root: careerOpsRoot() })); }
  catch (error) {
    const code = (error as { code?: string }).code;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, {
      status: code === 'INVALID_OFFER' ? 400 : ['NOT_IN_REVIEW_QUEUE', 'TRACKED_OPPORTUNITY'].includes(code || '') ? 409 : 500,
    });
  }
}
