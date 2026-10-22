import { execFile } from 'node:child_process';
import { careerOpsRoot, rootScript } from '@/lib/career-ops';
import { preparationKey, emptyPreparation } from '@/lib/preparation.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function execute(action: 'read' | 'save', input?: string): Promise<Response> {
  return new Promise(resolve => {
    const child = execFile(process.execPath, [rootScript('opportunity-workflow'), action], {
      cwd: careerOpsRoot(), env: { ...process.env, CAREER_OPS_ROOT: careerOpsRoot() }, timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout) => {
      try {
        const result = JSON.parse(stdout);
        if (!result.ok) return resolve(Response.json(result, { status: result.code === 'REVISION_CONFLICT' ? 409 : result.code === 'INVALID_REQUEST' ? 400 : 500 }));
        if (error) throw error;
        resolve(Response.json(result));
      } catch { resolve(Response.json({ error: 'Preparation notes could not be accessed. Your existing records were preserved.' }, { status: 500 })); }
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(input || '');
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url');
  if (url !== null && !preparationKey(url)) return Response.json({ error: 'Invalid posting URL.' }, { status: 400 });
  const response = await execute('read');
  if (!response.ok || url === null) return response;
  const result = await response.json();
  return Response.json({ ok: true, record: result.records.find((r: { url: string }) => r.url === preparationKey(url)) || emptyPreparation(url) });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 600000) return Response.json({ error: 'Preparation request is too large.' }, { status: 413 });
  try { JSON.parse(raw); } catch { return Response.json({ error: 'Invalid preparation request.' }, { status: 400 }); }
  return execute('save', raw);
}
