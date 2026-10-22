import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLiteOpportunity } from "../src/lib/lite-recommendation.mjs";

const common = { location: "Chicago, IL · Hybrid", liveness: "LIVE", source: "Greenhouse", candidateLocation: "Greater Chicago" };
const decide = (title, jd, extra = {}) => classifyLiteOpportunity({ title, jd, ...common, ...extra });

const positive = [
  ["Privacy Operations Manager", "Own privacy impact assessments, data protection controls, policy implementation, remediation, and audit readiness.", "B", "RESUME_B"],
  ["Privacy Risk Specialist", "Perform privacy impact assessments, risk assessments, controls testing, and remediation governance.", "B", "RESUME_B"],
  ["GRC Consultant", "Deliver risk assessments, controls testing, audit readiness, and remediation governance for clients.", "A", "RESUME_A"],
  ["Cybersecurity Risk Analyst", "Perform information security risk assessments, control testing, remediation, and security compliance assurance.", "A", "RESUME_A"],
  ["Technology Risk Consultant", "Assess technology risk, test controls, advise clients, and track remediation through audit readiness.", "A", "RESUME_A"],
  ["IT Risk Specialist", "Own IT risk assessments, controls testing, third-party risk, remediation, and audit readiness.", "A", "RESUME_A"],
  ["AI Governance Specialist", "Operate AI governance under NIST AI RMF, perform risk assessments, implement controls, and support assurance reviews.", "A", "RESUME_A"],
  ["ISO 42001 Governance and Compliance Specialist", "Run the AI governance program, ISO 42001 controls implementation, risk assessments, policy governance, and audit readiness.", "A", "RESUME_A"],
  ["GRC Analyst", "Perform cybersecurity risk assessments, control testing, remediation governance, third-party risk reviews, and audit readiness.", "A", "RESUME_A"],
];

test("golden positive opportunities are admitted from JD evidence and route to the defensible resume", () => {
  for (const [title, jd, lane, resume] of positive) {
    const result = decide(title, jd);
    assert.equal(result.admission, "PASS", title);
    assert.equal(result.gate, "PASS", title);
    assert.equal(result.careerLaneCode, lane, title);
    assert.equal(result.recommendedResumeCode, resume, title);
    assert.notEqual(result.recommendationClass, "REJECT", title);
    assert.ok(result.recommendationReasons.length >= 2, title);
  }
  const bridge = decide(positive[8][0], positive[8][1]);
  assert.equal(bridge.seniorityClassification, "US_MARKET_BRIDGE");
  assert.equal(bridge.recommendationClass, "BRIDGE");
});

const negative = [
  ["Software Engineer", "Develop production services in Java, write application code, and operate distributed systems.", "software engineering"],
  ["Cloud Infrastructure Security Engineer", "Build cloud infrastructure with Terraform and Kubernetes and deploy security services.", "cloud security engineering"],
  ["Penetration Tester", "Conduct penetration tests, exploit systems, and deliver red-team findings.", "offensive security"],
  ["ISO 9001 Quality Manager", "Maintain the ISO 9001 quality management system and manufacturing quality procedures.", "quality management"],
  ["Compliance Manager", "Manage consumer product labeling compliance, inspections, and trade documentation.", "generic non-target compliance"],
  ["AI/ML Software Engineer", "Write Python model-serving code, deploy machine-learning services, and operate Kubernetes workloads.", "software engineering"],
  ["Network Engineer", "Configure routers, switches, firewalls, and network infrastructure.", "network engineering"],
];

test("golden negative role families fail deterministically and cannot become high priority", () => {
  for (const [title, jd, reason] of negative) {
    const result = decide(title, jd);
    assert.equal(result.gate, "FAIL", title);
    assert.equal(result.recommendationClass, "REJECT", title);
    assert.equal(result.priorityBand, "LOW", title);
    assert.match(result.gateReasons.join(" "), new RegExp(reason, "i"), title);
  }
});

test("ambiguous evidence stays reviewable instead of becoming an unsupported rejection", () => {
  const genericRisk = decide("Risk Manager", "Coordinate enterprise risk reporting and facilitate business workshops.");
  assert.equal(genericRisk.gate, "PASS");
  assert.equal(genericRisk.recommendationClass, "REVIEW");
  assert.equal(genericRisk.careerLaneCode, "UNCLEAR");

  const genericCompliance = decide("Compliance Analyst", "Review regulatory updates and coordinate general compliance reporting.");
  assert.notEqual(genericCompliance.gate, "FAIL");
  assert.equal(genericCompliance.recommendationClass, "REVIEW");

  const hybrid = decide("Privacy and Security Governance Specialist", "Perform privacy impact assessments, information security risk assessments, controls testing, remediation, and assurance reviews.");
  assert.equal(hybrid.careerLaneCode, "HYBRID");
  assert.equal(hybrid.recommendedResumeCode, "MANUAL_REVIEW");

  const responsibleAi = decide("Responsible AI Program Specialist", "Coordinate model documentation and stakeholder meetings; governance duties are not specified.");
  assert.equal(responsibleAi.recommendationClass, "REVIEW");

  const remote = decide("Privacy Risk Analyst", "Remote in the United States. Perform privacy impact assessments, controls testing, and remediation.", { location: "Remote — United States" });
  assert.notEqual(remote.gate, "FAIL");
});

test("eligibility unknowns review, explicit Illinois exclusion fails, and missing JD caps confidence", () => {
  const clearance = decide("Cybersecurity Risk Analyst", "Perform risk assessments and controls testing. Must hold an active Secret clearance.");
  assert.equal(clearance.gate, "REVIEW");
  assert.match(clearance.gateReasons.join(" "), /CLEARANCE_UNVERIFIED/);

  const excluded = decide("Privacy Risk Analyst", "Remote role not available to residents of Illinois. Perform privacy impact assessments and controls testing.");
  assert.equal(excluded.gate, "FAIL");
  assert.equal(excluded.priorityBand, "LOW");

  const missing = classifyLiteOpportunity({ title: "GRC Analyst", jd: null, jdQuality: "MISSING", location: "Remote", liveness: "UNCLEAR" });
  assert.equal(missing.gate, "REVIEW");
  assert.equal(missing.recommendationClass, "REVIEW");
  assert.notEqual(missing.priorityBand, "HIGH");
});

test("ranking output is byte-for-byte deterministic for identical inputs", () => {
  const input = { title: positive[2][0], jd: positive[2][1], ...common };
  assert.deepEqual(classifyLiteOpportunity(input), classifyLiteOpportunity(input));
});

test("generic compliance and referenced occupations cannot create unsupported hard failures", () => {
  for (const jd of [null, "Review regulatory updates and coordinate compliance reporting."]) {
    const result = decide("Compliance Manager", jd);
    assert.notEqual(result.gate, "FAIL");
    assert.equal(result.recommendationClass, "REVIEW");
  }
  const legal = decide("Privacy Counsel", "Interpret GDPR and CCPA, perform privacy impact assessments and controls testing, advise software engineers and penetration testers, and oversee data protection compliance.");
  assert.equal(legal.gate, "PASS");
  assert.equal(legal.careerLaneCode, "B");
  assert.equal(legal.recommendedResumeCode, "RESUME_B");
  assert.doesNotMatch(legal.whyItFits ?? "", /U\.S\. experience/);
});

test("contradictory completeness cannot give an empty JD complete confidence", () => {
  const result = decide("GRC Analyst", "", { jdQuality: "COMPLETE" });
  assert.equal(result.jdQuality, "MISSING");
  assert.equal(result.gate, "REVIEW");
  assert.equal(result.recommendationClass, "REVIEW");
  assert.notEqual(result.priorityBand, "HIGH");
});

test("closed postings remain rejected regardless of strong governance duties", () => {
  const result = decide(positive[0][0], positive[0][1], { postingStatus: "CLOSED" });
  assert.equal(result.gate, "FAIL");
  assert.equal(result.recommendationClass, "REJECT");
  assert.equal(result.priorityBand, "LOW");
});

test("Illinois inclusion and conditional sponsorship are not geography exclusions", () => {
  for (const restriction of ["We cannot hire outside Illinois.", "Illinois candidates are not eligible for visa sponsorship."]) {
    const result = decide("Privacy Analyst", `${restriction} Perform privacy impact assessments and controls testing.`);
    assert.notEqual(result.gate, "FAIL", restriction);
  }
});

test("equally material privacy and AI governance responsibilities need a mixed-route review", () => {
  const result = decide("Privacy and AI Governance Specialist", "Own privacy impact assessments, responsible AI governance, data protection compliance and risk assessments.");
  assert.equal(result.careerLaneCode, "HYBRID");
  assert.equal(result.recommendedResumeCode, "MANUAL_REVIEW");
});

test("dominant GRC responsibilities override a privacy-only title", () => {
  const result = decide("Privacy Analyst", "Own IT risk assessments, controls testing, remediation governance and audit readiness. Responsibilities focus entirely on security compliance and IT controls.");
  assert.equal(result.careerLaneCode, "A");
  assert.equal(result.recommendedResumeCode, "RESUME_A");
  assert.equal(result.recommendationClass, "BRIDGE");
});


test('SOC entry is assessed from operational evidence rather than blanket exclusion',()=>{
 const r=decide('SOC Alert Monitoring Analyst','Monitor SIEM alerts, triage incidents, and escalate security operations center events.');
 assert.equal(r.careerLaneCode,'C');assert.equal(r.gate,'REVIEW');
 assert.ok(r.materialRequirements.some(q=>q.capability==='socOperations'&&q.candidateEvidence==='UNVERIFIED'));
 assert.equal(r.applicationReadiness,'CONDITIONAL_REVIEW');
});
