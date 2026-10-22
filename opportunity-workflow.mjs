// Canonical preparation notes. Tracker lifecycle and qualification are never written here.
import fs from 'node:fs';
import path from 'node:path';
import { withPipelineLock } from './pipeline-lock.mjs';
import { writeFileAtomic } from './tracker-utils.mjs';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { preparationKey, emptyPreparation, PREPARATION_STAGES, REVIEW_DECISIONS } from './web/src/lib/preparation.mjs';

const fail = (message, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { code });
export const workflowPath = root => path.join(root, 'data', 'opportunity-workflow.md');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = new Set(['stage', 'decision', 'resumeVersion', 'documentReferences', 'nextAction', 'chatgptSummary', 'evidence']);
const evidenceIds = new Set(['identity', 'posting', 'jd', 'location', 'requirements', 'scope']);
function text(value, max) { if (typeof value !== 'string' || value.length > max) throw fail(`A note is invalid or exceeds ${max} characters.`); return value; }
function validatePatch(patch) {
  if (!object(patch) || Object.keys(patch).some(k => !fields.has(k))) throw fail('Preparation fields are invalid. Application status cannot be changed here.');
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'stage') { if (!PREPARATION_STAGES.includes(value)) throw fail('Invalid preparation stage.'); out[key] = value; }
    else if (key === 'decision') { if (!REVIEW_DECISIONS.includes(value)) throw fail('Invalid review decision.'); out[key] = value; }
    else if (key === 'evidence') {
      if (!Array.isArray(value) || value.length > 6) throw fail('Invalid evidence notes.');
      const seen = new Set();
      out.evidence = value.map(item => {
        if (!object(item) || !evidenceIds.has(item.id) || seen.has(item.id) || !['pending', 'reviewed', 'cannot_confirm'].includes(item.status)) throw fail('Invalid evidence note.');
        seen.add(item.id);
        const sourceUrl = text(item.sourceUrl, 2000).trim();
        if (sourceUrl && !preparationKey(sourceUrl)) throw fail('Evidence references must be http(s) URLs without credentials.');
        const note = text(item.note, 4000);
        if (item.status !== 'pending' && !note.trim()) throw fail('Add a note explaining what you reviewed or could not confirm.');
        return { id: item.id, status: item.status, note, sourceUrl, basis: text(item.basis, 80000) };
      });
    } else out[key] = text(value, key === 'chatgptSummary' ? 12000 : key === 'resumeVersion' ? 300 : 4000);
  }
  return out;
}

export function readWorkflow(root = getCareerOpsRoot()) {
  let content;
  try { content = fs.readFileSync(workflowPath(root), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return { version: 1, records: [] }; throw e; }
  try {
    const match = content.match(/^# Opportunity preparation\n[\s\S]*?\n```json\n([\s\S]*?)\n```\n?$/);
    if (!match) throw new Error();
    const store = JSON.parse(match[1]);
    if (!object(store) || store.version !== 1 || !Array.isArray(store.records)) throw new Error();
    const seen = new Set();
    for (const record of store.records) {
      if (!object(record) || !preparationKey(record.url) || record.url !== preparationKey(record.url) || seen.has(record.url) || !Number.isInteger(record.revision) || record.revision < 1 || typeof record.updatedAt !== 'string') throw new Error();
      seen.add(record.url);
      validatePatch(Object.fromEntries([...fields].map(k => [k, record[k]])));
    }
    return store;
  } catch { throw fail('Preparation notes could not be read. The existing file was preserved; restore or repair it before saving.', 'INVALID_WORKFLOW'); }
}

export async function savePreparation({ url, expectedRevision, patch }, { root = getCareerOpsRoot() } = {}) {
  const key = preparationKey(url);
  if (!key || !Number.isInteger(expectedRevision) || expectedRevision < 0) throw fail('A posting URL and current preparation revision are required.');
  const validated = validatePatch(patch);
  const file = workflowPath(root);
  return withPipelineLock(file, () => {
    const store = readWorkflow(root);
    const index = store.records.findIndex(r => r.url === key);
    const current = index >= 0 ? store.records[index] : emptyPreparation(key);
    if (current.revision !== expectedRevision) throw fail('These notes changed in another tab. Reload the latest notes before saving.', 'REVISION_CONFLICT');
    const record = { ...current, ...validated, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    if (index >= 0) store.records[index] = record; else store.records.push(record);
    const markdown = '# Opportunity preparation\n\nPrivate preparation notes and user-reviewed decisions. These do not establish eligibility, change application status, or authorize submission.\n\n```json\n' + JSON.stringify(store, null, 2) + '\n```\n';
    writeFileAtomic(file, markdown);
    fs.chmodSync(file, 0o600);
    return record;
  });
}

if (isMainModule(import.meta.url)) {
  try {
    if (['--help', '-h'].includes(process.argv[2])) console.log('Usage: node opportunity-workflow.mjs read | save (JSON on stdin). Writes private preparation notes only; never changes the tracker or qualification.');
    else if (process.argv[2] === 'read') console.log(JSON.stringify({ ok: true, ...readWorkflow() }));
    else if (process.argv[2] === 'save') {
      let input = '';
      for await (const chunk of process.stdin) { input += chunk; if (input.length > 600000) throw fail('Preparation request is too large.'); }
      const request = JSON.parse(input);
      if (!object(request)) throw fail('Invalid preparation request.');
      console.log(JSON.stringify({ ok: true, record: await savePreparation(request) }));
    } else throw fail('Usage: node opportunity-workflow.mjs read | save (JSON on stdin)');
  } catch (error) { console.log(JSON.stringify({ ok: false, code: error.code || 'WORKFLOW_ERROR', error: error.message })); process.exitCode = 1; }
}
