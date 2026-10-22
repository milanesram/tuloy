import {updateFeature,featureError,boundedText,textList} from './lib/feature-store.mjs';
import {STRATEGY_FILE,validateStrategies,readCareerStrategies} from './career-strategies-read.mjs';
export {STRATEGY_FILE,validateStrategies,readCareerStrategies};
const initial={version:1,revision:0,active:'legacy',routes:[]};
export function saveCareerStrategies(root, request) {
  if (!request || !Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) throw featureError('Current settings revision is required.');
  return updateFeature(root,STRATEGY_FILE,initial,validateStrategies,request.expectedRevision,current => ({...current,active:request.active,routes:Array.isArray(request.routes)?request.routes.map(route=>({...route,label:boundedText(route.label,100,true),resume:boundedText(route.resume,300),titleTerms:textList(route.titleTerms),dutyTerms:textList(route.dutyTerms),excludeTerms:textList(route.excludeTerms)})):request.routes}));
}
