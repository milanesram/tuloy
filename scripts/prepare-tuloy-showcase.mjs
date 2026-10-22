import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

// A source snapshot, not a history export. Never copy runtime roots or browser profiles.
const PRIVATE_ROOTS = new Set(['data','documents','reports','output','jds','config','authenticated-sources','interview-prep','writing-samples','plan']);
const LEGACY_PRESENTATION = new Set(['HIRED.md','SIGNATURES.md','CONTRIBUTORS.md','CITATION.cff','MAINTAINERS.md','GOVERNANCE.md','SUPPORT.md','CHANGELOG.md']);
export function publishable(name) {
  const normalized = name.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some(p => !p || p === '..' || p === '.' || p === 'node_modules' || p === '.git' || p.startsWith('.next'))) return false;
  if (parts.some(p => /(?:\.bak(?:-|$)|\.db(?:-|$)|\.log$|\.tsbuildinfo$|\.DS_Store$|\.pem$|\.key$)/i.test(p))) return false;
  if (parts.some(p => p.startsWith('.')) && !['.gitignore','.gitattributes','.dockerignore','.editorconfig','.npmignore','.env.example'].includes(normalized)) return false;
  if (PRIVATE_ROOTS.has(parts[0])) return false;
  if (/^web\/tests\/rc\d+-frozen-replay\.test\.mjs$/.test(normalized)) return false;
  if (parts[0] === 'batch' && !['batch/README.md','batch/batch-prompt.md','batch/batch-runner.sh','batch/aggregate-tokens.mjs'].includes(normalized)) return false;
  if (normalized.startsWith('examples/tuloy/') || ['tests/job-search-v3.test.mjs','tests/operational-discovery-config.test.mjs','web/src/app/demo/page.tsx','web/src/components/tuloy-demo.tsx'].includes(normalized)) return false;
  if (['cv.md','voice-dna.md','article-digest.md','portals.yml'].includes(normalized) || /^modes\/_+(?:profile|custom)\.md$/.test(normalized)) return false;
  if (['PUBLICATION-MANIFEST.json','SHOWCASE-MANIFEST.json'].includes(normalized)) return false;
  if (LEGACY_PRESENTATION.has(normalized) || /^README\.(?!md$)[a-z]/.test(normalized)) return false;
  if (/\.(?:mp4|mov|zip|tar|gz)$/i.test(normalized)) return false;
  if (normalized.startsWith('docs/tuloy/')) return ['brand.md','mark.svg','wordmark.svg','using-tuloy.md','sharing.md','validation.md','ci-template.yml','preparation.md','workspace-features.md'].includes(parts.at(-1));
  if (parts[0] === 'docs') return ['SUPPORTED_CLIS.md','SUPPORTED_JOB_BOARDS.md','SETUP.md','CUSTOMIZATION.md','RUNNING_ON_A_BUDGET.md','SCRIPTS.md','WINDOWS.md','FAQ.md','APPLY_AUTOFILL.md','PLUGINS.md','FREE_TIER.md','authenticated-job-discovery.md'].includes(parts.at(-1));
  if (/^config\//.test(normalized)) return false;
  return true;
}

export function exportShowcase(root, destination) {
  if (fs.existsSync(destination)) throw new Error('Destination already exists. Use a fresh output folder; never overwrite a prior review snapshot.');
  const files = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const included = [...new Set(files)].filter(publishable).filter(name => { try { return fs.lstatSync(path.join(root,name)).isFile(); } catch { return false; } });
  const entries = included.map(name => [name,fs.readFileSync(path.join(root,name))]);
  // Explicit safe defaults: never copy the active personal targeting configuration.
  // Active search preferences are never shipped, even as an existing tracked file.
  entries.push(['config/portals.example.yml',Buffer.from('title_filter:\n  positive: []\n  negative: []\nlocation_filter:\n  allow: []\ntracked_companies: []\njob_boards: []\n')]);
  for (const name of ['config/profile.example.yml','config/plugins.example.yml','config/cv-facts.example.json','config/career-strategies.example.json']) {
    entries.push([name,fs.readFileSync(path.join(root,name))]);
  }
  entries.push(['.github/workflows/tuloy-ci.yml',fs.readFileSync(path.join(root,'docs/tuloy/ci-template.yml'))]);
  // Fail closed for common credentials and the actual local account path.
  // This is a bounded preflight, not a claim of exhaustive content clearance.
  const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{35,}/;
  const findings = entries.filter(([name,bytes]) => /\.(?:mjs|ts|tsx|md|yml|yaml|json|txt|html|svg)$/.test(name) && (secret.test(bytes.toString('utf8')) || bytes.toString('utf8').includes(homedir() + path.sep))).map(([name]) => name);
  if (findings.length) throw new Error(`Public-content preflight needs review (values withheld): ${findings.join(', ')}`);
  fs.mkdirSync(destination,{recursive:true});
  const manifest=[];
  for (const [name,bytes] of entries) {
    const target=path.join(destination,name); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,bytes);
    const original=path.join(root,name);
    if (fs.existsSync(original) && fs.statSync(original).mode & 0o111) fs.chmodSync(target,0o755);
    manifest.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const provenance={name:'Tuloy',operationalApplication:true,activeSearchConfigurationIncluded:false,searchResultsIncluded:false,upstream:'https://github.com/career-ops-hq/career-ops',localCheckoutBaseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),upstreamBaselineVerified:false,preparedAt:new Date().toISOString(),historyIncluded:false,personalRuntimeIncluded:false,files:manifest};
  fs.writeFileSync(path.join(destination,'SHOWCASE-MANIFEST.json'),JSON.stringify(provenance,null,2)+'\n');
  return {files:manifest.length,destination};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const destination=path.join(root,'.tuloy-showcase',new Date().toISOString().replaceAll(/[:.]/g,'-'));
  try { console.log(JSON.stringify(exportShowcase(root,destination),null,2)); }
  catch(error) { console.error(error.message); process.exitCode=1; }
}
