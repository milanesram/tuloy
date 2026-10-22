// Reversible discovery recalibration. Application lifecycle is never written here.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getCareerOpsRoot, resolveTrackerPath } from './path-resolver.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
import { openTrackerTransaction, writeFileAtomic } from './tracker-utils.mjs';
import { normalizeUrlForDedup, requisitionIdsForDedup } from './scan.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

export const RECALIBRATION_REASON = 'Archived for Job Search V3 strategy recalibration.';
const read = file => { try { return fs.readFileSync(file,'utf8'); } catch(e) { if(e.code === 'ENOENT') return ''; throw e; } };
const fold = value => value.toLowerCase().replace(/[^a-z0-9]/g,'');

// Conservative retention: a matching URL, requisition, or company/role in any
// application-activity record protects a pending row, including unchecked rows.
export function splitStrategyQueue(text, activityTexts = []) {
  const archived = [], protectedRows = [];
  const active = text.split('\n').filter(line => {
    if (!/^\s*-\s*\[ \]/.test(line)) return true;
    const [url,company,role] = line.replace(/^\s*-\s*\[ \]\s*/,'').split('|').map(s=>s.trim());
    const reqs = requisitionIdsForDedup({url,text:line});
    const linked = activityTexts.some(activity => activity.split('\n').some(record => {
      const urls = record.match(/https?:\/\/[^\s|)<>]+/g) || [];
      if (urls.some(other => normalizeUrlForDedup(other) === normalizeUrlForDedup(url))) return true;
      if (company && role && fold(record).includes(fold(company)) && fold(record).includes(fold(role))) return true;
      const otherReqs = requisitionIdsForDedup({url:urls[0] || '',text:record});
      return company && fold(record).includes(fold(company)) && [...reqs].some(req => otherReqs.includes(req));
    }));
    if (linked) { protectedRows.push(line); return true; }
    // An annotated unchecked row may already have preparation/lifecycle work.
    if (/\b(?:submitted|applied|prepared|interview|recruiter representation|offer accepted|application_id|report|pdf):/i.test(line)) { protectedRows.push(line); return true; }
    archived.push(line); return false;
  }).join('\n');
  return { active, archived, protectedRows };
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : e.isFile() ? [path.join(dir,e.name)] : []);
}
export function applicationActivityTexts(root,trackerPath=resolveTrackerPath(root)) {
  return [trackerPath,...['reports','output','interview-prep','data/offers','data/outcomes'].flatMap(dir=>walk(path.join(root,dir))),...['data/active-interviews.md','data/follow-ups.md','data/reply-candidates.json','data/status-log.tsv','status-log.tsv'].map(p=>path.join(root,p))]
    .map(file=>`${file}\n${read(file)}`);
}
export async function archivePendingForStrategy({ root=getCareerOpsRoot(), now=Date.now(), pipelinePath=process.env.CAREER_OPS_PIPELINE || path.join(root,'data/pipeline.md'), historyPath=process.env.CAREER_OPS_SCAN_HISTORY || path.join(root,'data/scan-history.tsv'), trackerPath=resolveTrackerPath(root) }={}) {
  return withPipelineLock(pipelinePath, () => withPipelineLock(path.join(root,'data/dismissed-opportunities.json'), () => withPipelineLock(historyPath, async () => {
    const tx=await openTrackerTransaction(trackerPath);
    try {
      const timestamp=new Date(now).toISOString(), stamp=timestamp.replace(/[:.]/g,'-');
      const backup=path.join(root,'data/backups',`job-search-v3-queue-${stamp}`);
      fs.mkdirSync(backup,{recursive:true});
      const all=[...new Set([pipelinePath,historyPath,trackerPath,...walk(path.join(root,'data')).filter(p=> !/[\\/]backups[\\/]|[\\/]cache[\\/]|[\\/]\.lock[\\/]/.test(p)),...['jds','reports','output','interview-prep'].flatMap(d=>walk(path.join(root,d)))])];
      const files=[];
      for(const [index,file] of all.entries()) {
        if(!fs.existsSync(file)) { files.push({source:file,absent:true}); continue; }
        const relative=path.relative(root,file), name=relative.startsWith('..') ? `external/${index}-${path.basename(file)}` : relative;
        const bytes=fs.readFileSync(file), target=path.join(backup,name);
        fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
        files.push({source:file,backup:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
      }
      // Snapshot is durable before the only mutation. Never erase linked rows.
      const {active,archived,protectedRows}=splitStrategyQueue(read(pipelinePath),applicationActivityTexts(root,trackerPath));
      const archive=path.join(root,'data/archive',`pending-v3-${stamp}.md`);
      const metadata={timestamp,strategy:'V5',reason:RECALIBRATION_REASON,backup,archive,archived:archived.length,protected:protectedRows.length,pendingBefore:archived.length+protectedRows.length,files};
      writeFileAtomic(path.join(backup,'manifest.json'),JSON.stringify(metadata,null,2)+'\n');
      fs.mkdirSync(path.dirname(archive),{recursive:true});
      writeFileAtomic(archive,`# Pending discoveries archived ${timestamp}\n\n${RECALIBRATION_REASON}\n\nStrategy: V5. Discovery only; no application outcome. ${archived.length} archived; ${protectedRows.length} linked pending records retained.\n\n${archived.join('\n')}\n`);
      if(archived.length) writeFileAtomic(pipelinePath,active);
      writeFileAtomic(path.join(backup,'RESTORE.md'),`# Restore\n\nStop queue/scan writers. Verify SHA-256 against manifest.json. Restore only data/pipeline.md from this backup under withPipelineLock using writeFileAtomic; merge its exact archived rows if newer queue work exists. Other backed-up files are restoration evidence and were not modified by recalibration. Do not overwrite newer tracker, dismissals or history. Keep the archive as provenance.\n`);
      return {...metadata,files:files.length};
    } finally { tx.close(); }
  })));
}
if(isMainModule(import.meta.url)) console.log(JSON.stringify(await archivePendingForStrategy(),null,2));
