import {readFeature,featureError,boundedText,textList} from './lib/feature-read.mjs';
export const STRATEGY_FILE = 'config/career-strategies.json';
const initial = {version:1, revision:0, active:'legacy', routes:[]};
export function validateStrategies(value) {
  if (!value || value.version !== 1 || !Number.isInteger(value.revision) || value.revision < 0 || !['legacy','custom'].includes(value.active) || !Array.isArray(value.routes) || value.routes.length > 20) throw featureError('Invalid career strategy.');
  const codes = new Set();
  for (const route of value.routes) {
    if (!route || typeof route.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,19}$/.test(route.code) || ['UNCLEAR','HYBRID'].includes(route.code) || codes.has(route.code)) throw featureError('Route codes must be unique uppercase identifiers.');
    codes.add(route.code);boundedText(route.label,100,true);boundedText(route.resume,300);
    for (const field of ['titleTerms','dutyTerms','excludeTerms']) textList(route[field]);
    if (!route.titleTerms.length && !route.dutyTerms.length) throw featureError('Each route needs at least one title or duty term.');
  }
  if (value.active === 'custom' && !value.routes.length) throw featureError('Add a route before activating a custom strategy.');
}
export function readCareerStrategies(root) { return readFeature(root, STRATEGY_FILE, initial, validateStrategies); }
