import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLiteOpportunity } from '../src/lib/lite-recommendation.mjs';
import { candidateEvidenceFromSources, materialRequirements } from '../src/lib/qualification-evidence.mjs';
import { compareOpportunityPriority, composeHandoff, opportunityIdentityMatches } from '../src/lib/ops.mjs';
const duties='Own privacy impact assessments, controls testing, remediation, data maps, data subject requests and audit readiness.';
const decide=(title,jd,extra={})=>classifyLiteOpportunity({title,jd,location:'Chicago, IL',candidateLocation:'Chicago, IL',liveness:'LIVE',jdQuality:'COMPLETE',source:'Greenhouse',...extra});
const primary=status=>({status,source:'config/profile.yml'});

test('hands-on Director / Senior Director scope remains aligned; title-only scope remains unclear',()=>{
 for(const title of ['Director, Privacy','Senior Director, Privacy']){
  const result=decide(title,`${duties} Lead client engagements and mentor junior colleagues with limited oversight. Requirements: 5–8 years of relevant experience.`);
  assert.equal(result.seniorityClassification,'EXPERIENCE_ALIGNED');assert.notEqual(result.recommendationClass,'LOW');assert.match(result.seniorityReasons.join(' '),/HANDS_ON_SCOPE/);
 }
 const empty=decide('Director, Privacy',null,{jdQuality:'MISSING'});assert.equal(empty.seniorityClassification,'UNCLEAR');assert.notEqual(empty.priorityBand,'HIGH');
});
test('genuine executive ownership, not stakeholder mentions, establishes excessive scope',()=>{
 const result=decide('Director, Privacy',`${duties} Manage a department of 150 employees. Own enterprise-wide budget and P&L.`);
 assert.equal(result.seniorityClassification,'TOO_SENIOR');assert.equal(result.recommendationClass,'LOW');assert.equal(result.priorityBand,'LOW');
 const advisor=decide('Director, Privacy',`${duties} Lead projects with department heads. Deliver training for 150 staff and prepare executive budget reports.`);
 assert.equal(advisor.seniorityClassification,'EXPERIENCE_ALIGNED');
});
test('Analyst I with substantive independent responsibilities is a bridge, not an automatic junior rejection',()=>{
 const result=decide('Privacy Analyst I',`${duties} Investigate privacy incidents and manage remediation independently. Required Qualifications: At least two (2) years compliance experience.`);
 assert.equal(result.seniorityClassification,'US_MARKET_BRIDGE');assert.notEqual(result.recommendationClass,'LOW');assert.ok(result.materialRequirements.some(r=>r.requirement.startsWith('2+ years')));
 const junior=decide('Privacy Analyst I','Training-only role: shadow senior colleagues, learn the basics and perform routine data entry; no independent responsibility.');
 assert.equal(junior.seniorityClassification,'TOO_JUNIOR');assert.equal(junior.priorityBand,'LOW');
});
test('primary legal practice fails despite privacy/control vocabulary',()=>{
 for(const [title,jd]of[
  ['Privacy Counsel',`${duties} Serve as in-house legal advisor. Required Qualifications: active license to practice law in a U.S. jurisdiction.`],
  ['Privacy Associate',`${duties} Provide privacy counseling and legal research for law clients. Must be active and admitted to the local state bar.`],
  ['Cybersecurity Attorney',`${duties} Represent clients in litigation and provide legal advice as their lawyer.`],
 ]){const result=decide(title,jd);assert.equal(result.gate,'FAIL');assert.equal(result.recommendationClass,'REJECT');assert.equal(result.priorityBand,'LOW');assert.match(result.materialGaps,/primary occupation is legal practice/);}
});
test('privacy operations in Legal, adjacent regulatory work and preferred legal education are not legal-practice vetoes',()=>{
 for(const title of ['Privacy Program Manager','Privacy Office Administrator','Privacy Governance Specialist']){
  const result=decide(title,`${duties} Work in the Legal department, coordinate DPA reviews with legal counsel and translate privacy laws into operational requirements. Preferred Qualifications: Juris Doctor.`);
  assert.notEqual(result.gate,'FAIL');assert.equal(result.recommendedResumeCode,'RESUME_B');
 }
 const uncertain=decide('Privacy Counsel',`${duties} Interpret GDPR and advise software engineers on operational controls.`);assert.notEqual(uncertain.gate,'FAIL');
 const cpa=decide('GRC Manager',`${duties} Collaborate with a legal advisor. Must have a CPA license.`);assert.notEqual(cpa.gate,'FAIL');assert.equal(cpa.gate,'REVIEW');
});
test('production-engineering occupation is not neutralized by governance words',()=>{
 for(const title of ['Privacy Engineer','Software Engineer, Privacy Infrastructure']){
  const result=decide(title,`${duties} This is a hands-on engineering role. Write production software and own distributed systems. Qualifications: 6+ years software engineering experience. Strong programming experience building production systems in cloud environments.`);
  assert.equal(result.gate,'FAIL');assert.equal(result.recommendationClass,'REJECT');assert.ok(result.materialRequirements.some(r=>r.category==='PRODUCTION_ENGINEERING'));assert.match(result.materialGaps,/production.*engineering/i);
 }
});
test('technical literacy and preferred scripting do not exclude governance; core technical privacy automation lowers confidence',()=>{
 const governance=decide('Privacy Technology Governance Specialist',`${duties} Partner with engineering on technical controls. You do not need to be an engineer. Nice to Have: SQL and Python scripting experience.`);
 assert.notEqual(governance.gate,'FAIL');assert.notEqual(governance.recommendationClass,'LOW');
 const technical=decide('Privacy Program Engineer',`${duties} Build the privacy automation layer: scripts, scheduled jobs and API integrations. Requirements: Working proficiency in SQL and scripting; build tools against production systems.`);
 assert.notEqual(technical.gate,'FAIL');assert.equal(technical.recommendationClass,'LOW');assert.equal(technical.priorityBand,'LOW');
 const coordinator=decide('Privacy Operations Lead',`${duties} You are not expected to do that engineering work yourself. Engineering builds the production systems.`);
 assert.notEqual(coordinator.gate,'FAIL');
});
test('unpaid/fundraising occupation is excluded, but paid nonprofit work and volunteering benefits are not',()=>{
 for(const text of['This is an unpaid volunteer position.','This is a volunteer role.','All current opportunities are volunteer roles; first assignment fundraising.']){
  const result=decide('Privacy Compliance Specialist',`${duties} ${text}`);assert.equal(result.gate,'FAIL');assert.equal(result.recommendationClass,'REJECT');assert.match(result.gateReasons.join(' '),/EMPLOYMENT_TYPE_EXCLUSION/);
 }
 const paid=decide('Nonprofit Privacy Compliance Analyst',`${duties} This is a salaried employee position with paid volunteer days. We support community volunteer roles through donations.`);assert.notEqual(paid.gate,'FAIL');
 const negated=decide('Privacy Analyst',`${duties} This is not an unpaid position.`);assert.notEqual(negated.gate,'FAIL');
});
test('mandatory and preferred requirements remain separate, including flattened section headings',()=>{
 const result=decide('Privacy Program Manager',`${duties} Requirements: CIPM certification required. Preferred Qualifications: At least 5 years healthcare experience. CISA certification preferred.`,{candidateEvidence:{certifications:['CIPM'],certificationSource:'cv.md'}});
 assert.ok(result.materialRequirements.some(r=>r.requirement.includes('CIPM')&&r.importance==='REQUIRED'&&r.candidateEvidence==='SUPPORTED'));
 assert.ok(result.materialRequirements.some(r=>r.requirement.includes('CISA')&&r.importance==='PREFERRED'&&r.candidateEvidence==='UNVERIFIED'));
 assert.ok(result.materialRequirements.some(r=>r.category==='EXPERIENCE'&&r.importance==='PREFERRED'));
 assert.equal(result.gate,'PASS');assert.notEqual(result.recommendationClass,'LOW');
});
test('preferred unknown credentials neither change ranking nor become a hard veto',()=>{
 const base=decide('Privacy Program Manager',duties),preferred=decide('Privacy Program Manager',`${duties} Nice to Have: CISA certification and 10 years of healthcare experience.`);
 assert.equal(preferred.gate,base.gate);assert.equal(preferred.priorityScore,base.priorityScore);assert.equal(preferred.recommendationClass,base.recommendationClass);
});
test('candidate comparison uses explicit evidence; unknown capability does not become a fabricated absence',()=>{
 const jd=`${duties} Requirements: 5+ years of healthcare experience. CIPM certification required.`;
 const unknown=decide('Privacy Program Manager',jd);assert.equal(unknown.gate,'REVIEW');assert.ok(unknown.materialRequirements.every(r=>r.candidateEvidence==='UNVERIFIED'));
 const supported=decide('Privacy Program Manager',jd,{candidateEvidence:{certifications:['CIPM'],capabilities:{healthcareExperience:{...primary('SUPPORTED'),years:6}}}});assert.equal(supported.gate,'PASS');
 const gap=decide('Privacy Program Manager',jd,{candidateEvidence:{certifications:['CIPM'],capabilities:{healthcareExperience:{...primary('SUPPORTED'),years:2}}}});assert.equal(gap.gate,'FAIL');assert.equal(gap.recommendationClass,'REJECT');assert.ok(gap.materialRequirements.some(r=>r.candidateEvidence==='MATERIAL_GAP'));
 const untrusted=decide('Privacy Program Manager',jd,{candidateEvidence:{capabilities:{healthcareExperience:{status:'SUPPORTED',years:10,source:'auto-memory'}}}});assert.equal(untrusted.gate,'REVIEW');
});
test('credential alternatives and conjunctive mandatory credentials are not conflated',()=>{
 const evidence={certifications:['CISA'],certificationSource:'cv.md'};
 const both=materialRequirements('Requirements: CISA and CISSP certifications required.',evidence);assert.equal(both[0].candidateEvidence,'UNVERIFIED');
 const either=materialRequirements('Requirements: At least one of CISA or CISSP certifications required.',evidence);assert.equal(either[0].candidateEvidence,'SUPPORTED');
});
test('primary CV credential section does not promote training, professional mentions or a capstone into credentials/capabilities',()=>{
 const evidence=candidateEvidenceFromSources({cv:'Core skills include CISSP frameworks.\n### Credentials and Certifications\n- Certified Information Privacy Manager (CIPM).\n### Specialist Training\n- CISA training.\n- ISO 27001 Lead Auditor training.\n## Projects\n- Non-production MVP with TypeScript.',profile:{location:{authorized_in:['United States'],needs_sponsorship:false}}});
 assert.deepEqual(evidence.certifications,['CIPM']);assert.equal(evidence.capabilities.productionEngineering,undefined);assert.equal(evidence.capabilities.legalLicense,undefined);assert.equal(evidence.capabilities.usWorkAuthorization.status,'SUPPORTED');
});
test('mandatory license/clearance remains unverified without explicit evidence, and documented evidence can support it',()=>{
 for(const [requirement,key,category] of [['Must hold an active Secret clearance.','clearance','CLEARANCE'],['Must have a CPA license.','professionalLicense','PROFESSIONAL_LICENSE']]){
  const unknown=decide('GRC Specialist',`${duties} ${requirement}`);assert.equal(unknown.gate,'REVIEW');assert.ok(unknown.materialRequirements.some(r=>r.category===category&&r.candidateEvidence==='UNVERIFIED'));
  const supported=decide('GRC Specialist',`${duties} ${requirement}`,{candidateEvidence:{capabilities:{[key]:primary('SUPPORTED')}}});assert.equal(supported.gate,'PASS');
 }
});
test('material travel/people/platform requirements are visible without asserting candidate absence',()=>{
 const result=decide('GRC Manager',`${duties} Requirements: Hands-on experience administering a GRC platform. Demonstrated experience managing people. Ability to travel up to 30%.`);
 for(const category of ['SPECIALIZED_PLATFORM','PEOPLE_MANAGEMENT','TRAVEL'])assert.ok(result.materialRequirements.some(r=>r.category===category),category);
 assert.match(result.materialGaps,/candidate evidence: UNVERIFIED/);
});
test('band cap never flattens substantive ordering; band authority dominates score',()=>{
 const identity={company:'Acme',sourceProvider:'builtin',companySource:'aggregator-card'};
 const richer=decide('Privacy Program Manager',duties,identity),less=decide('Privacy Program Manager','Own privacy impact assessments and remediation.',identity);
 assert.equal(richer.priorityBand,'MEDIUM');assert.equal(less.priorityBand,'MEDIUM');assert.ok(richer.priorityScore>less.priorityScore);assert.ok(richer.priorityScore>69);
 const items=[{...less,company:'A',role:'Privacy Program Manager',url:'https://example.com/a'},{...richer,company:'Z',role:'Privacy Program Manager',url:'https://example.com/z'}];items.sort(compareOpportunityPriority);assert.equal(items[0].company,'Z');
 assert.ok(compareOpportunityPriority({priorityBand:'LOW',priorityScore:500},{priorityBand:'MEDIUM',priorityScore:20})>0);
});
test('equal ordering values use unresolved mandatory burden before lexical names, never preferred burden',()=>{
 const base={priorityBand:'MEDIUM',priorityScore:75,rankingComponents:{relevance:48,materialRequirements:0}};
 const required={importance:'REQUIRED',candidateEvidence:'UNVERIFIED'},preferred={importance:'PREFERRED',candidateEvidence:'UNVERIFIED'};
 const more={...base,company:'A',materialRequirements:[required,required]},less={...base,company:'Z',materialRequirements:[required,preferred,preferred]};
 assert.ok(compareOpportunityPriority(less,more)<0);
 const supported={...base,company:'Z',materialRequirements:[{importance:'REQUIRED',candidateEvidence:'SUPPORTED'}]};
 assert.ok(compareOpportunityPriority(supported,less)<0);
 assert.deepEqual([more,less].sort(compareOpportunityPriority),[less,more]);
});
test('conflict, incomplete and established hard failures retain independent priority/recommendation safeguards',()=>{
 const base={company:'Wrong label',sourceProvider:'builtin',employerIdentityEvidence:[{kind:'CANONICAL_EMPLOYER',value:'Canonical Employer',url:'https://example.com/101'}]};
 const conflict=decide('Privacy Program Manager',duties,base);assert.equal(conflict.employerIdentityStatus,'CONFLICT');assert.equal(conflict.gate,'REVIEW');assert.equal(conflict.priorityBand,'MEDIUM');assert.notEqual(conflict.recommendationClass,'PRIORITY');assert.ok(conflict.priorityScore>69);
 assert.equal(opportunityIdentityMatches({...conflict,role:'Privacy Program Manager',url:'https://example.com/101'},{company:'Wrong label',role:'Privacy Program Manager',url:''}),false);
 for(const quality of ['PARTIAL','MISSING','FETCH_FAILED','ARCHIVE_UNAVAILABLE'])assert.notEqual(decide('Privacy Program Manager',duties,{jdQuality:quality}).priorityBand,'HIGH');
 for(const extra of [{postingStatus:'CLOSED'},{candidateLocation:'Illinois',jd:`${duties} Role not available in Illinois.`}]){const result=classifyLiteOpportunity({...base,title:'Privacy Program Manager',jd:duties,...extra});assert.equal(result.gate,'FAIL');assert.equal(result.recommendationClass,'REJECT');assert.equal(result.priorityBand,'LOW');}
});
test('aggregator availability is not independently confirmed employer activity; closed always wins',()=>{
 const result=decide('GRC Specialist',duties,{source:'Built In Chicago'});assert.equal(result.sourceListingStatus,'AVAILABLE');assert.equal(result.postingStatus,'UNCONFIRMED');
 assert.equal(decide('GRC Specialist',duties,{source:'Built In Chicago',postingStatus:'CLOSED'}).postingStatus,'CLOSED');
 assert.equal(decide('GRC Specialist',duties,{source:'Built In Chicago',employerPostingVerified:true}).postingStatus,'ACTIVE');
});
test('new requirements, seniority evidence, caps and complete body survive handoff deterministically',()=>{
 const input={title:'Director, Privacy',jd:`${duties} Hands-on client delivery. Requirements: CIPM certification required.`,company:'Source label',source:'Built In Chicago',liveness:'LIVE'};
 const result=classifyLiteOpportunity(input);assert.deepEqual(result,classifyLiteOpportunity(input));
 const handoff=composeHandoff({...result,role:input.title,jd:input.jd});assert.equal(handoff,composeHandoff({...result,role:input.title,jd:input.jd}));assert.ok(handoff.includes(input.jd));
 for(const text of ['MATERIAL REQUIREMENTS','CIPM','REQUIRED','UNVERIFIED','Seniority rationale','HANDS_ON_SCOPE','PRIORITY SAFEGUARDS','does not independently confirm'])assert.ok(handoff.includes(text),text);
});
test('preferred specialization does not erase mandatory general experience in the same sentence',()=>{
 const requirements=materialRequirements('Required Qualifications: At least two (2) years privacy compliance experience, preferably in healthcare.');
 assert.ok(requirements.some(r=>r.importance==='REQUIRED'&&r.requirement.startsWith('2+ years: privacy operations')));
 assert.ok(!requirements.some(r=>r.importance==='REQUIRED'&&/healthcare/.test(r.requirement)));
});
test('total engineering experience and nested specialization remain separate explicit requirements',()=>{
 const requirements=materialRequirements('Qualifications: 6+ years of software or privacy engineering experience, including at least 4 years focused on privacy engineering.');
 assert.ok(requirements.some(r=>r.requirement.startsWith('6+ years')));assert.ok(requirements.some(r=>r.requirement.startsWith('4+ years')));
});
test('preferred clearance/license is not silently made mandatory by the legacy fallback',()=>{
 const result=decide('GRC Specialist',`${duties} Nice to Have: Active Secret clearance. CPA license preferred.`);
 assert.equal(result.gate,'PASS');assert.ok(result.materialRequirements.every(r=>r.importance==='PREFERRED'));
});
test('a referenced legal advisor is not the occupation of a privacy counselor',()=>{
 const result=decide('Privacy Counsel',`${duties} Work with a legal advisor on contract interpretation.`);
 assert.notEqual(result.gate,'FAIL');
});
test('explicit non-practice boundaries are not overridden by a Counsel title or referenced legal work',()=>{
 const result=decide('Privacy Counsel',`${duties} This is not a legal-counsel role. You do not provide legal advice. Interpret regulatory requirements and coordinate with licensed lawyers.`);
 assert.notEqual(result.gate,'FAIL');
});
test('U.S. legal education and years of legal practice are captured without fabricated equivalence',()=>{
 const requirements=materialRequirements('Required Qualifications: Education: Juris Doctor (J.D.) degree from an accredited U.S. law school. At least 5 years of legal experience.');
 assert.ok(requirements.some(r=>r.category==='LEGAL_EDUCATION'&&r.candidateEvidence==='UNVERIFIED'));
 assert.ok(requirements.some(r=>r.requirement==='5+ years: legal practice'));
});
