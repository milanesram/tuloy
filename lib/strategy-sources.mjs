// Only a completed, hash-verified user-layer import can activate a requested
// source-controlled strategy. This check performs no import or factual rewrite.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as yaml from 'js-yaml';
import { getCareerOpsRoot } from '../path-resolver.mjs';
export function assertStrategySources({root=getCareerOpsRoot(),profilePath=process.env.CAREER_OPS_PROFILE || path.join(root,'config/profile.yml')}={}) {
  let profile;
  try { profile=yaml.load(fs.readFileSync(profilePath,'utf8')) || {}; } catch(e) { if(e.code==='ENOENT') return null; throw e; }
  const strategy=profile.job_search;
  if(!strategy?.source_manifest) return null;
  if(strategy.source_status !== 'verified') throw new Error(`Approved strategy documents are not imported (${strategy.source_status || 'unknown'}). Complete the approved-source import before live discovery; the previous CV must not stand in for the requested master.`);
  const within=relative=>{
    const file=path.resolve(root,relative);const rel=path.relative(root,file);
    if(rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Strategy manifest path escapes the data root');
    return file;
  };
  const manifest=JSON.parse(fs.readFileSync(within(strategy.source_manifest),'utf8'));
  if(manifest.strategyVersion!==strategy.strategy_version || !manifest.importDate || manifest.status!=='verified') throw new Error('Strategy manifest version/import status mismatch');
  for(const name of strategy.source_names || []) if(!manifest.sources?.some(s=>s.sourceName===name)) throw new Error(`Strategy source missing: ${name}`);
  const runtimeRequired=['cv.md','config/profile.yml','modes/_profile.md',...Object.values(profile.resume_bases || {}).map(base=>base.path)];
  for(const file of runtimeRequired) if(!manifest.runtime?.some(record=>record.localPath===file)) throw new Error(`Strategy runtime representation missing: ${file}`);
  for(const record of [...(manifest.sources || []),...(manifest.runtime || [])]) {
    const hash=createHash('sha256').update(fs.readFileSync(within(record.localPath))).digest('hex');
    if(hash!==record.sha256) throw new Error(`Strategy source integrity mismatch: ${record.localPath}`);
  }
  return manifest;
}
