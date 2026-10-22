#!/usr/bin/env node
// Daily workflow: preserve queue/history, archive unverifiable/stale pending
// records verbatim, then invoke the existing scanner once. Never writes tracker.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getCareerOpsRoot, resolveTrackerPath } from './path-resolver.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
import { atomicWriteFile } from './scan.mjs';
import { evidenceFromPipelineLine, reviewQueueVisible } from './web/src/lib/fresh-posting.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { assertStrategySources } from './lib/strategy-sources.mjs';
import { splitStrategyQueue, applicationActivityTexts } from './strategy-queue.mjs';
import { openTrackerTransaction } from './tracker-utils.mjs';

export function splitDailyQueue(text, now, activityTexts = []) {
  const protectedRows = new Set(splitStrategyQueue(text, activityTexts).protectedRows);
  const archived = [];
  const active = text.split('\n').filter(line => {
    if (!/^\s*-\s*\[ \]/.test(line) || protectedRows.has(line)) return true;
    const label = name => line.split('|').map(s => s.trim()).find(s => s.startsWith(`${name}:`))?.slice(name.length + 1).trim();
    if (reviewQueueVisible({ manualReview: label('queue_mode') === 'MANUAL_REVIEW', originalPosting: evidenceFromPipelineLine(line), discoveryCategory: label('discovery_category'), discoveredAt: label('discovered_at') }, true, now)) return true;
    archived.push(line);
    return false;
  }).join('\n');
  return { active, archived };
}
export async function prepareDailyQueue({ root = getCareerOpsRoot(), now = Date.now(), pipelinePath = process.env.CAREER_OPS_PIPELINE || path.join(root, 'data/pipeline.md'), historyPath = process.env.CAREER_OPS_SCAN_HISTORY || path.join(root, 'data/scan-history.tsv') } = {}) {
  return withPipelineLock(pipelinePath, () => withPipelineLock(path.join(root,'data/dismissed-opportunities.json'), () => withPipelineLock(historyPath, async () => {
    const trackerTx = await openTrackerTransaction(resolveTrackerPath(root));
    try {
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    const backup = path.join(root, 'data/backups', `fresh-search-${stamp}`);
    fs.mkdirSync(backup, { recursive: true });
    const files = [];
    for (const [name, file] of [['pipeline.md', pipelinePath], ['scan-history.tsv', historyPath], ['applications.md', resolveTrackerPath(root)], ['dismissed-opportunities.json', path.join(root,'data/dismissed-opportunities.json')], ['fresh-search.json',path.join(root,'data/fresh-search.json')]]) {
      if (!fs.existsSync(file)) { files.push({ name, source: file, absent: true }); continue; }
      const bytes = fs.readFileSync(file);
      fs.writeFileSync(path.join(backup, name), bytes, { flag: 'wx' });
      files.push({ name, source: file, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ timestamp: new Date(now).toISOString(), files }, null, 2), { flag: 'wx' });
    const text = fs.existsSync(pipelinePath) ? fs.readFileSync(pipelinePath, 'utf8') : '# Pipeline\n\n## Pending\n\n## Processed\n';
    const activityTexts = applicationActivityTexts(root);
    const { active, archived } = splitDailyQueue(text, now, activityTexts);
    const archiveDir = path.join(root, 'data/archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const archive = path.join(archiveDir, `pending-${stamp}.md`);
    fs.writeFileSync(archive, `# Pending opportunities archived ${new Date(now).toISOString()}\n\nOriginal publication could not be verified within the rolling 24-hour window. These are preserved discovery records, not application outcomes.\n\n${archived.join('\n')}\n`, { flag: 'wx' });
    atomicWriteFile(pipelinePath, active);
    atomicWriteFile(path.join(root, 'data/fresh-search.json'), JSON.stringify({ enabled: true, hours: 24, backup, archive }, null, 2));
    return { backup, archive, archived: archived.length };
    } finally { trackerTx.close(); }
  })));
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node fresh-search.mjs [--dry-run]\nBack up queue/history, archive stale pending records, then scan once with separate verified-fresh and newly-discovered/unverified categories. --dry-run skips all writes. Applications remain manual.');
  } else if (args.some(arg => arg !== '--dry-run')) {
    console.error('Unknown argument. Use --help.'); process.exitCode = 1;
  } else {
    try {
      assertStrategySources();
      if (!args.includes('--dry-run')) console.error(JSON.stringify(await prepareDailyQueue()));
      const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scan.mjs');
      const result = spawnSync(process.execPath, [script, '--fresh-24h', '--include-newly-discovered', '--json', '--quiet', ...args], { stdio: 'inherit', timeout: 240_000 });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
