// Explore decisions are user data, separate from application lifecycle/history.
import fs from 'node:fs';
import path from 'node:path';
import { getCareerOpsRoot, resolveTrackerPath } from './path-resolver.mjs';
import { randomUUID } from 'node:crypto';
import { parseTrackerRow, resolveColumns } from './tracker-parse.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
import { writeFileAtomic, openTrackerTransaction } from './tracker-utils.mjs';
import { decodePostingEvidence } from './lib/posting-evidence.mjs';
import { decodeEmployerIdentity } from './web/src/lib/employer-identity.mjs';
import { isSafeWebUrl } from './web/src/lib/ops.mjs';
import { activeOffers, isDismissed, sameDismissedPosting } from './web/src/lib/dismissals.mjs';
export { activeOffers, isDismissed };

export function dismissalsPath(root = getCareerOpsRoot()) {
  return path.join(root, 'data/dismissed-opportunities.json');
}

function readOptional(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function readDismissals(root = getCareerOpsRoot()) {
  const raw = readOptional(dismissalsPath(root));
  if (raw === null) return [];
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.some(entry => !entry?.offer || !isSafeWebUrl(entry.offer.url) || typeof entry.dismissedAt !== 'string')) {
    throw new Error('Invalid dismissed-opportunities.json; repair the file before changing dismissals.');
  }
  return entries;
}

// Read the canonical URL-first pipeline rows, including identity metadata.
// Completed rows are history, not an active Review Queue decision.
function pendingPostings(text) {
  return text.split('\n').filter(line => /^\s*-\s*\[ \]/.test(line)).map(line => {
    const cells = line.replace(/^\s*-\s*\[ \]\s*/, '').split('|').map(cell => cell.trim());
    const label = name => cells.slice(3).find(cell => cell.startsWith(`${name}:`))?.slice(name.length + 1).trim();
    const url = cells[0].match(/https?:\/\/[^\s)>]+/)?.[0];
    return { line, url, company: cells[1], role: cells[2], ...decodeEmployerIdentity(label('employer_identity')), ...decodePostingEvidence(label('posting_evidence')) };
  });
}

export async function setDismissal(offer, dismissed, { root = getCareerOpsRoot(), pipelinePath = process.env.CAREER_OPS_PIPELINE || path.join(root, 'data/pipeline.md') } = {}) {
  if (!offer || !isSafeWebUrl(offer.url) || typeof offer.company !== 'string' || typeof offer.title !== 'string') {
    throw new Error('A dismissal requires a posting URL, company and title.');
  }
  // Same lock/order as the queue writer: a concurrent Add cannot leave an
  // opportunity both dismissed and pending. The queue always stays untouched.
  return withPipelineLock(pipelinePath, () => withPipelineLock(dismissalsPath(root), () => {
    const entries = readDismissals(root);
    if (dismissed && pendingPostings(readOptional(pipelinePath) || '').some(job => sameDismissedPosting(job, offer))) {
      const error = new Error('This opportunity is already in the Review Queue.');
      error.code = 'IN_REVIEW_QUEUE';
      throw error;
    }
    if (dismissed && isDismissed(offer, entries)) return entries;
    const next = entries.filter(entry => !sameDismissedPosting(entry.offer, offer));
    if (dismissed) next.push({ offer, dismissedAt: new Date().toISOString() });
    writeFileAtomic(dismissalsPath(root), JSON.stringify(next, null, 2) + '\n');
    return next;
  }));
}

// Explicit Ops action: preserve the original pending rows in an archive before
// removing them. Explore dismissals keep their existing queue-conflict guard.
export async function dismissReviewOpportunity(offer, { root = getCareerOpsRoot(), pipelinePath = process.env.CAREER_OPS_PIPELINE || path.join(root, 'data/pipeline.md') } = {}) {
  if (!offer || !isSafeWebUrl(offer.url) || typeof offer.company !== 'string' || typeof offer.title !== 'string') {
    const error = new Error('A dismissal requires a posting URL, company and title.'); error.code = 'INVALID_OFFER'; throw error;
  }
  return withPipelineLock(pipelinePath, () => withPipelineLock(dismissalsPath(root), async () => {
    const entries = readDismissals(root);
    const originalQueue = readOptional(pipelinePath) || '';
    const matched = pendingPostings(originalQueue).filter(job => sameDismissedPosting(job, offer));
    if (!matched.length) {
      if (isDismissed(offer, entries)) return { dismissed: true, removed: 0 };
      const error = new Error('This posting is no longer in the Review Queue. Refresh Ops.'); error.code = 'NOT_IN_REVIEW_QUEUE'; throw error;
    }
    const tracker = await openTrackerTransaction(resolveTrackerPath(root));
    try {
      const text = readOptional(tracker.path) || '';
      const lines = text.split('\n'), columns = resolveColumns(lines);
      if (lines.map(line => parseTrackerRow(line, columns)).filter(Boolean).some(app => sameDismissedPosting(app, offer))) {
        const error = new Error('This posting has an application record. Manage its status in the tracker.'); error.code = 'TRACKED_OPPORTUNITY'; throw error;
      }
      const stamp = new Date().toISOString();
      const archiveDir = path.join(root, 'data/archive');
      fs.mkdirSync(archiveDir, { recursive: true });
      const archive = path.join(archiveDir, `not-a-fit-${stamp.replace(/[:.]/g, '-')}-${randomUUID()}.md`);
      fs.writeFileSync(archive, `# Manually reviewed and marked Not a Fit\n\nReviewed at: ${stamp}\nThis is a candidate review decision, not an employer rejection or application outcome.\nRestore discovery through Explore > Dismissed. Original pending rows follow verbatim.\n\n${matched.map(job => job.line).join('\n')}\n`, { flag: 'wx', mode: 0o600 });
      const oldDismissals = readOptional(dismissalsPath(root));
      const next = isDismissed(offer, entries) ? entries : [...entries, { offer, dismissedAt: stamp, queueArchive: path.relative(root, archive) }];
      // Persist suppression first so a crash cannot resurface a dismissed job.
      // The archived rows support recovery even if a later filesystem write fails.
      writeFileAtomic(dismissalsPath(root), JSON.stringify(next, null, 2) + '\n');
      const remove = new Set(matched.map(job => job.line));
      try { writeFileAtomic(pipelinePath, originalQueue.split('\n').filter(line => !remove.has(line)).join('\n')); }
      catch (error) {
        writeFileAtomic(dismissalsPath(root), oldDismissals ?? '[]\n');
        throw error;
      }
      return { dismissed: true, removed: matched.length, archive: path.relative(root, archive) };
    } finally { tracker.close(); }
  }));
}
