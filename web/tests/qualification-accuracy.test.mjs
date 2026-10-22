import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialRequirements,requirementUnits,candidateEvidenceFromSources} from '../src/lib/qualification-evidence.mjs';
import {resolveEmployerIdentity} from '../src/lib/employer-identity.mjs';
import {classifyLiteOpportunity} from '../src/lib/lite-recommendation.mjs';
import {opportunityIdentityMatches,composeHandoff,compareOpportunityPriority} from '../src/lib/ops.mjs';
import {buildTitleFilter,compilePositiveKeyword} from '../../title-keywords.mjs';
const duties='Perform risk assessments, control testing, remediation, privacy impact assessments and audit readiness.';
const decide=(title,jd,extra={})=>classifyLiteOpportunity({title,jd,jdQuality:'COMPLETE',source:'greenhouse',postingStatus:'ACTIVE',location:'Chicago, IL',candidateLocation:'Chicago, IL',...extra});

test('required/preferred section ownership survives flattened headings, mixed case and emphatic optional wording',()=>{
 const jd='What You Need Required: Minimum 4 years of IT audit experience SAP S/4 audit experience Preferred: Must have CISA certification. 8 years of ERP audit experience required.';
 const req=materialRequirements(jd);
 assert.ok(req.some(r=>r.requirement.startsWith('4+ years')&&r.importance==='REQUIRED'));
 assert.ok(req.some(r=>r.capability==='sapS4Audit'&&r.importance==='REQUIRED'));
 assert.ok(req.filter(r=>/CISA|8\+ years/.test(r.requirement)).every(r=>r.importance==='PREFERRED'));
 assert.ok(req.every(r=>jd.includes(r.evidence)),'supporting text remains verbatim');
});
test('trailing preferred negation belongs to certification, never the preceding mandatory experience',()=>{
 const req=materialRequirements('Who You Are: Relevant certification preferred, such as CISA, CISSP, CISM; CPA is valued but not required Minimum 8 years working as IT auditor.');
 assert.ok(req.some(r=>r.category==='CERTIFICATION'&&r.importance==='PREFERRED'));
 assert.ok(!req.some(r=>r.category==='CERTIFICATION'&&r.importance==='REQUIRED'));
 assert.ok(req.some(r=>r.requirement==='8+ years: it audit'&&r.importance==='REQUIRED'));
 const campus=materialRequirements('Qualifications: Must possess integrity. Certification or working towards certification as CPA, CISA, or CIA, preferred not required.');
 assert.ok(campus.filter(r=>r.category==='CERTIFICATION').every(r=>r.importance==='PREFERRED'));
});
test('optional specialization cannot erase base required scope, and preferred years cannot control seniority',()=>{
 const req=materialRequirements('Required Qualifications: Experience with FedRAMP, ideally having led an organization through authorization.');
 assert.ok(req.some(r=>r.capability==='fedrampExperience'&&r.importance==='REQUIRED'));
 const result=decide('Privacy Analyst',`${duties} Requirements: 3 years privacy experience. Preferred Qualifications: 15 years experience required.`);
 assert.equal(result.seniorityClassification,'US_MARKET_BRIDGE');
 const bare=materialRequirements('Responsibilities: perform control testing. Experience 10-12+ years of technology risk experience. Prior experience in finance preferred.');
 assert.ok(bare.some(r=>r.category==='EXPERIENCE'&&r.years===10&&r.importance==='UNVERIFIED'));
});
test('specialized mandatory evidence is surfaced without translating technical literacy into a deficiency',()=>{
 const req=materialRequirements('Required: SAP S/4 audit experience Experience testing ITGCs across enterprise applications, infrastructure and cloud environments Experience supporting audit teams testing automated controls and key reports Proven ownership of multi-framework compliance in cloud-native SaaS Experience with FedRAMP.');
 for(const key of ['sapS4Audit','itgcTesting','cloudAudit','automatedControlsAudit','saasCompliance','fedrampExperience'])assert.ok(req.some(r=>r.capability===key&&r.importance==='REQUIRED'&&r.candidateEvidence==='UNVERIFIED'),key);
 const literate=decide('Privacy Technology Governance Specialist',`${duties} Collaborate with engineers on APIs, SQL, SAP and cloud tooling; engineers conduct technical audits. Nice to Have: ERP audit experience.`);
 assert.notEqual(literate.gate,'FAIL');assert.notEqual(literate.recommendationClass,'LOW');
 assert.ok(!literate.materialRequirements.some(r=>r.specialized&&r.importance==='REQUIRED'));
});
test('alternative broad experience paths do not become mandatory specialized audit/coding experience',()=>{
 const result=decide('Technology Controls Specialist',`${duties} Basic Qualifications: At least 2 years of experience in technology (cloud infrastructure), cybersecurity, technology auditing, technology risk assessments, or a combination.`);
 assert.ok(!result.materialRequirements.some(r=>r.category==='SPECIALIZED_EXPERIENCE'&&r.importance==='REQUIRED'));
});
test('unknown specialized capability stays unverified; primary positive/contradictory evidence is scoped independently',()=>{
 const jd='Required: SAP S/4 audit experience.';
 const primary=years=>({status:'SUPPORTED',source:'cv.md',years});
 const known={capabilities:{sapS4Audit:primary(4)}};
 assert.equal(materialRequirements(jd,known)[0].candidateEvidence,'SUPPORTED');
 assert.equal(materialRequirements(jd,{capabilities:{governanceOperations:primary(20)}})[0].candidateEvidence,'UNVERIFIED');
 assert.equal(materialRequirements(jd,{capabilities:{sapS4Audit:{status:'MATERIAL_GAP',source:'user-stated'}}})[0].candidateEvidence,'MATERIAL_GAP');
 assert.equal(materialRequirements(jd,{capabilities:{sapS4Audit:{status:'SUPPORTED',source:'auto-memory'}}})[0].candidateEvidence,'UNVERIFIED');
});
test('years of managing managers are not established by generic personnel oversight',()=>{
 const jd=`${duties} What We’re Looking For: 8+ years in security compliance, including 5+ years in leadership roles managing both people managers and senior individual contributors. Proven ownership of multi-framework compliance in a cloud-native SaaS environment.`;
 const result=decide('Director, Compliance',jd,{candidateEvidence:candidateEvidenceFromSources({cv:'Led the division with personnel oversight.'})});
 assert.ok(result.materialRequirements.some(r=>r.capability==='managementOfManagers'&&r.years===5&&r.candidateEvidence==='UNVERIFIED'));
 assert.ok(result.materialRequirements.some(r=>r.category==='EXPERIENCE'&&r.years===8));
 assert.notEqual(result.seniorityClassification,'US_MARKET_BRIDGE');
});
test('compound senior title with engagement ownership is aligned, not a substring bridge; execution alone does not erase leadership',()=>{
 const r=decide('IT Risk Associate Director',`${duties} Required Qualifications: Minimum 8 years working as IT auditor. Responsibilities: Lead consulting engagements, review staff work, supervise senior consultants and own project plans.`);
 assert.equal(r.seniorityClassification,'EXPERIENCE_ALIGNED');assert.match(r.seniorityReasons.join(' '),/LEADERSHIP_SCOPE/);
 for(const t of ['Privacy Analyst I','GRC Associate','Privacy Specialist'])assert.equal(decide(t,`${duties} Requirements: 2 years compliance experience.`).seniorityClassification,'US_MARKET_BRIDGE');
 assert.equal(decide('GRC Consultant',`${duties} Independently lead client projects. Requirements: 3 years compliance experience.`).seniorityClassification,'US_MARKET_BRIDGE','project ownership alone is not organizational people leadership');
});
test('explicit student/graduation cohort is conditional eligibility, not an invented failure or blanket Associate exclusion',()=>{
 const jd=`${duties} Qualifications: Pursuin g a B.A./B.S. degree, expected completion of degree by December 202 6 or June 202 7. Certification as CPA or CISA, preferred not required.`;
 const r=decide('Technology Risk Associate - Summer Program',jd);
 assert.equal(r.gate,'REVIEW');assert.equal(r.recommendationClass,'REVIEW');assert.equal(r.priorityBand,'MEDIUM');assert.equal(r.applicationReadiness,'CONDITIONAL_REVIEW');
 assert.ok(r.materialRequirements.some(q=>q.category==='EDUCATION_ELIGIBILITY'&&q.candidateEvidence==='UNVERIFIED'&&q.requirement.includes('December 2026')));
 assert.equal(decide('Technology Risk Associate',duties).seniorityClassification,'US_MARKET_BRIDGE');
});
test('occupation/admission phrase boundaries separate credit risk from IT risk and preserve genuine mixed technology roles',()=>{
 const filter=buildTitleFilter({positive:['IT Risk','Technology Risk','GRC']});
 for(const t of ['Credit Risk Analyst Commercial Underwriter','Financial Risk Analyst','Market Risk Associate'])assert.equal(filter(t),false,t);
 for(const t of ['IT Risk Consultant','IT-Risk Advisor','Technology Risk Specialist','GRC Analyst'])assert.equal(filter(t),true,t);
 assert.equal(compilePositiveKeyword('it risk')('preit risk'),false);
 const r=decide('Credit Risk Analyst', 'Underwrite commercial merchant portfolios using financial risk modeling and cash flow forecasting. Minimum requirements: 5 years commercial underwriting experience.');
 assert.equal(r.gate,'FAIL');assert.equal(r.recommendationClass,'REJECT');assert.equal(r.priorityBand,'LOW');assert.equal(r.roleFamily,'UNRELATED');
 const mixed=decide('Technology Risk Consultant, Financial Services',`${duties} Audit technology controls supporting financial risk modeling and credit underwriting teams.`);
 assert.notEqual(mixed.gate,'FAIL');assert.equal(mixed.recommendedResumeCode,'RESUME_A');
});
test('credible recruiting self-identification requires corroboration; ownership/acquisition context is not an employer alias',()=>{
 const base={company:'Purchased Brand',sourceProvider:'builtin',url:'https://example.org/jobs/1',jdQuality:'COMPLETE'};
 for(const jd of ['Why Assurance at Parent Group? The Assurance function at Parent Group is growing.','Why Assurance at Parent Group? Our team is growing. Parent Group Corporation is an equal opportunity employer.','Employer: Parent Group\nOur subsidiary Purchased Brand was acquired.']){
  const r=resolveEmployerIdentity({...base,jd});assert.equal(r.employerIdentityStatus,'CONFLICT');assert.equal(r.employerIdentityName,'Parent Group');
 }
 assert.equal(resolveEmployerIdentity({...base,jd:'We serve Parent Group clients and collaborate with their risk team.'}).employerIdentityStatus,'AMBIGUOUS');
 assert.equal(resolveEmployerIdentity({...base,jd:'Why Assurance at Parent Group? We partner with their team.'}).employerIdentityStatus,'AMBIGUOUS');
 assert.equal(resolveEmployerIdentity({...base,jdQuality:'PARTIAL',jd:'Employer: Parent Group\n'}).employerIdentityStatus,'AMBIGUOUS');
});
test('identical JDs are not requisition identity, conflict/ambiguity block legacy guesses, consistent legacy still works',()=>{
 const base={company:'Acme',role:'GRC Analyst',url:'https://job-boards.greenhouse.io/acme/jobs/101',jd:'Employer: Acme\n'+duties,jdQuality:'COMPLETE'};
 assert.equal(opportunityIdentityMatches(base,{...base,url:base.url.replace('101','102')}),false);
 assert.equal(opportunityIdentityMatches({...base,company:'Other Employer'}, {...base,url:base.url.replace('101','102')}),false);
 for(const status of ['CONFLICT','AMBIGUOUS'])assert.equal(opportunityIdentityMatches({...base,employerIdentityStatus:status},{...base,url:''}),false);
 assert.equal(opportunityIdentityMatches({...base,employerIdentityStatus:'CONSISTENT'},{...base,url:''}),false,'consistent employer does not establish the unkeyed legacy requisition');
 assert.equal(opportunityIdentityMatches({...base,employerIdentityStatus:'CONSISTENT'},{...base}),true);
});
test('readiness respects safeguards without providing application permission; penalties order within capped bands',()=>{
 const ready=decide('Privacy Manager',duties);assert.equal(ready.applicationReadiness,'READY_FOR_REVIEW');
 const unknown=decide('Privacy Manager',`${duties} Required: SAP S/4 audit experience.`,{company:'Acme',sourceProvider:'builtin',url:'https://example.org/jobs/1'});
 assert.equal(unknown.applicationReadiness,'CONDITIONAL_REVIEW');assert.notEqual(unknown.priorityBand,'HIGH');
 const conflict=decide('Privacy Manager',duties,{company:'Acme',sourceProvider:'builtin',url:'https://example.org/jobs/1',employerIdentityEvidence:[{kind:'JD_EMPLOYER',value:'Other'}]});
 assert.equal(conflict.applicationReadiness,'CONDITIONAL_REVIEW');assert.notEqual(conflict.recommendationClass,'PRIORITY');
 const closed=decide('Privacy Manager',duties,{postingStatus:'CLOSED'});assert.equal(closed.applicationReadiness,'NOT_ACTIONABLE');assert.equal(closed.priorityBand,'LOW');
 assert.ok(compareOpportunityPriority({...ready,priorityBand:'MEDIUM'},unknown)<0);
 assert.ok(ready.priorityScore>69);assert.notEqual(ready.priorityScore,unknown.priorityScore);
 const handoff=composeHandoff({...unknown,jd:duties,role:'Privacy Manager'});assert.match(handoff,/APPLICATION READINESS/);assert.match(handoff,/not permission/);assert.match(handoff,/SAP S\/4/);
 assert.deepEqual(unknown,decide('Privacy Manager',`${duties} Required: SAP S/4 audit experience.`,{company:'Acme',sourceProvider:'builtin',url:'https://example.org/jobs/1'}));
});
