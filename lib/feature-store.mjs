import fs from 'node:fs';
import path from 'node:path';
import { withPipelineLock } from '../pipeline-lock.mjs';
import { writeFileAtomic } from '../tracker-utils.mjs';
import {readFeature,featureError} from './feature-read.mjs';
export {readFeature,featureError,boundedText,textList} from './feature-read.mjs';
export async function updateFeature(root, relative, initial, validate, expectedRevision, update) {
  const file = path.join(root, relative);
  return withPipelineLock(file, () => {
    const current = readFeature(root, relative, initial, validate);
    if (expectedRevision !== null && current.revision !== expectedRevision) throw featureError('Settings changed in another window. Reload before saving.', 'REVISION_CONFLICT');
    const next = update(structuredClone(current));
    next.revision = current.revision + 1;
    validate(next);
    writeFileAtomic(file, JSON.stringify(next, null, 2) + '\n');
    fs.chmodSync(file, 0o600);
    return next;
  });
}
