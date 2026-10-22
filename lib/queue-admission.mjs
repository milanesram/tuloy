// Node-side context only; the decision itself is shared with Explore and Ops.
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { candidateEvidenceFromSources } from '../web/src/lib/qualification-evidence.mjs';
import { qualifyDiscoveredOffer } from '../web/src/lib/discovery-qualification.mjs';
import { assertStrategySources } from './strategy-sources.mjs';
import { readCareerStrategies } from '../career-strategies.mjs';
const read = file => { try {return fs.readFileSync(file,'utf8');} catch(e) {if(e.code==='ENOENT')return null;throw e;} };
export function queueQualificationContext(root) {
  const raw=read(path.join(root,'config/profile.yml'));
  const profile=raw ? yaml.load(raw) || {} : {};
  const daily=read(path.join(root,'data/fresh-search.json'));
  const careerStrategy=readCareerStrategies(root);
  return { active:profile.job_search?.version===3 || careerStrategy.active==='custom', profile,
    candidateLocation:[profile.candidate?.location,profile.location?.city,profile.location?.state].filter(Boolean).join(' · '),
    candidateEvidence:{...candidateEvidenceFromSources({cv:read(path.join(root,'cv.md')) || '',profile}),careerStrategy},
    daily:daily ? JSON.parse(daily).enabled === true : false };
}
export function assertQueueAdmission(offers,{root,context=queueQualificationContext(root),manualReview=false}={}) {
  if(!context.active) return;
  assertStrategySources({root,profilePath:path.join(root,'config/profile.yml')});
  const decisions=[];
  for(const offer of offers) {
    const decision=qualifyDiscoveredOffer(offer,context);
    decisions.push(decision);
    if(!decision.queueEligible && !(manualReview && decision.manualReviewEligible)) throw new Error(`Retain in discovery: ${offer.title || offer.url}. ${decision.queueEligibilityReasons.join('; ')}`);
  }
  return decisions;
}
