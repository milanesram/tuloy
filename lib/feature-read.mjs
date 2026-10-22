import fs from 'node:fs';
import path from 'node:path';
export const featureError = (message, code = 'INVALID_REQUEST') => Object.assign(new Error(message), {code});
export function readFeature(root, relative, initial, validate) {
  let raw;
  try { raw = fs.readFileSync(path.join(root, relative), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(initial); throw error; }
  let value;
  try { value = JSON.parse(raw); validate(value); }
  catch { throw featureError(`Saved ${relative} is invalid. The existing file was preserved.`, 'INVALID_STORE'); }
  return value;
}
export function boundedText(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw featureError('A text field is missing or too long.');
  return value.trim();
}
export function textList(value, max = 60) {
  if (!Array.isArray(value) || value.length > max) throw featureError('Invalid list of search terms.');
  return [...new Set(value.map(v => boundedText(v, 100, true)))];
}
