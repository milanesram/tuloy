import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { careerOpsRoot, opsSummary, readApplications, readInbox, rootScript } from "@/lib/career-ops";
import { localISODate } from "@/lib/followups";
import { isSafeWebUrl, normalizeOpportunityUrl, opportunityIdentityMatches, trackerAdditionTsv, trackerSkeleton } from "@/lib/ops.mjs";
import { parseCliJson } from "@/lib/status-cli.mjs";
import { parseApplications } from "@/lib/tracker-table.mjs";
import { trackedRequisitionVariant } from '../../../../../../lib/posting-evidence.mjs';
import { resolveEmployerIdentity } from '@/lib/employer-identity.mjs';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrackRequest = {
  confirmedSubmitted?: boolean;
  company?: string;
  role?: string;
  url?: string;
  location?: string;
  source?: string;
};

type ExecResult = { code: number; stdout: string; stderr: string; timedOut: boolean };

function run(script: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], {
      cwd: careerOpsRoot(),
      env,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const e = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      resolve({
        code: typeof e?.code === "number" ? e.code : e ? -1 : 0,
        stdout: stdout || "",
        stderr: stderr || "",
        timedOut: e?.killed === true,
      });
    });
  });
}

function trackerPath(): string {
  const root = careerOpsRoot();
  const override = process.env.CAREER_OPS_TRACKER;
  return override ? path.resolve(root, override) : path.join(root, "data", "applications.md");
}

function ensureTracker(file: string): void {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, trackerSkeleton(), { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

function trackerRows(file: string) {
  try {
    return parseApplications(fs.readFileSync(file, "utf8"), careerOpsRoot());
  } catch {
    return [];
  }
}

function findRow(rows: ReturnType<typeof trackerRows>, body: Required<Pick<TrackRequest, "company" | "role" | "url">>) {
  return rows.find((row) => opportunityIdentityMatches(body, row)) ?? null;
}

async function setApplied(n: string, date: string): Promise<{ ok: boolean; error?: string; followup?: unknown }> {
  const script = rootScript("set-status");
  if (!fs.existsSync(script)) return { ok: false, error: "canonical status writer is unavailable" };
  const result = await run(script, ["--row", n, "Applied", "--source", "web", "--on", date, "--json"]);
  const parsed = parseCliJson(result.stdout);
  if (result.timedOut) return { ok: false, error: "status update timed out; verify the tracker before retrying" };
  if (result.code !== 0 || !parsed) return { ok: false, error: "canonical status update failed" };
  return { ok: true, followup: parsed.followupSeeded ?? null };
}

export async function POST(req: Request) {
  let body: TrackRequest;
  try {
    body = await req.json() as TrackRequest;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (body.confirmedSubmitted !== true) {
    return Response.json({ error: "manual submission confirmation required" }, { status: 409 });
  }
  const company = body.company?.trim() ?? "";
  const role = body.role?.trim() ?? "";
  const url = body.url?.trim() ?? "";
  if (!company || !role || !isSafeWebUrl(url)) {
    return Response.json({ error: "company, role, and canonical http(s) URL are required" }, { status: 400 });
  }

  const file = trackerPath();
  const pending = readInbox().find((job) =>
    !job.done && normalizeOpportunityUrl(job.url) === normalizeOpportunityUrl(url));
  // Resolve provenance from canonical files, never from client-supplied flags.
  const projected = pending ? opsSummary().queue.flatMap(job => [job, ...(job.postingVariants || [])]).find((job) => normalizeOpportunityUrl(job.url) === normalizeOpportunityUrl(url)) : null;
  // This guard must precede *all* status mutations, including exact-URL rows.
  if (projected?.employerIdentityStatus === 'CONFLICT') {
    return Response.json({ error: 'employer identity conflict requires human resolution before tracking or association' }, { status: 409 });
  }
  if (projected && trackedRequisitionVariant(projected, readInbox().map(raw => ({ ...raw, ...resolveEmployerIdentity(raw) })), readApplications())) {
    return Response.json({ error: 'another posting variant of this verified employer requisition is already tracked; human resolution required' }, { status: 409 });
  }
  const identity = { company: projected?.company ?? company, role: projected?.role ?? role, url, employerIdentityStatus: projected?.employerIdentityStatus,
    employerIdentityEvidence: projected?.employerIdentityEvidence };
  const existing = findRow(readApplications(), identity);
  if (!existing && projected
      && readApplications().some(row => !row.url && row.company.trim().toLowerCase() === identity.company.trim().toLowerCase()
        && row.role.trim().toLowerCase() === identity.role.trim().toLowerCase())) {
    return Response.json({ error: 'posting identity cannot be established for an unkeyed legacy application; human resolution required' }, { status: 409 });
  }
  const date = localISODate();
  if (existing) {
    if (existing.status === "Applied") {
      return Response.json({ ok: true, created: false, n: existing.n, status: "Applied", followup: null });
    }
    if (existing.status !== "Evaluated") {
      return Response.json({
        error: `tracker row is already ${existing.status || "in an unknown state"}; use the existing status control instead`,
      }, { status: 409 });
    }
    const applied = await setApplied(existing.n, date);
    if (!applied.ok) return Response.json({ error: applied.error }, { status: 500 });
    return Response.json({ ok: true, created: false, n: existing.n, status: "Applied", followup: applied.followup });
  }

  if (!pending) {
    return Response.json({ error: "opportunity is not in the Review Queue" }, { status: 404 });
  }
  const pendingIdentity = { company: pending.company, role: pending.role, url: pending.url };

  try {
    ensureTracker(file);
  } catch {
    return Response.json({ error: "could not initialize the canonical tracker" }, { status: 500 });
  }

  const mergeScript = rootScript("merge-tracker");
  if (!fs.existsSync(mergeScript)) {
    return Response.json({ error: "canonical tracker merge writer is unavailable" }, { status: 503 });
  }

  const rows = trackerRows(file);
  const nextNum = Math.max(0, ...rows.map((row) => Number.parseInt(row.n, 10)).filter(Number.isFinite)) + 1;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-lite-track-"));
  const addition = path.join(tempDir, `${String(nextNum).padStart(3, "0")}-${randomUUID()}.tsv`);
  const safeSource = body.source?.trim().replace(/[;\r\n]+/g, " ") || "Career Ops Lite";
  const notes = `manual submission confirmed ${date}; source: ${safeSource}`;

  try {
    fs.writeFileSync(addition, trackerAdditionTsv({
      num: nextNum,
      date,
      company: pending.company,
      role: pending.role,
      location: pending.location ?? body.location?.trim() ?? "",
      notes,
      url: pending.url,
    }), { encoding: "utf8", mode: 0o600 });

    const merged = await run(mergeScript, ['--require-posting-identity'], {
      ...process.env,
      CAREER_OPS_TRACKER: file,
      CAREER_OPS_ADDITIONS: tempDir,
    });
    if (merged.timedOut) {
      return Response.json({ error: "tracker merge timed out; verify the tracker before retrying" }, { status: 504 });
    }
    if (merged.code !== 0) {
      console.error(`/api/ops/track: canonical merge failed: ${merged.stderr.trim() || merged.stdout.trim()}`);
      return Response.json({ error: "canonical tracker merge failed" }, { status: 500 });
    }

    const created = findRow(trackerRows(file), pendingIdentity);
    if (!created) {
      return Response.json({ error: "tracker merge completed but the application row could not be resolved" }, { status: 500 });
    }
    const applied = await setApplied(created.n, date);
    if (!applied.ok) return Response.json({ error: applied.error }, { status: 500 });
    return Response.json({ ok: true, created: true, n: created.n, status: "Applied", followup: applied.followup });
  } finally {
    // This exact directory was created above solely for one isolated merge.
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
