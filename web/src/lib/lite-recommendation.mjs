// Deterministic Career Ops Lite decision projection.
// Admission, eligibility, classification, recommendation and queue priority
// share one evidence set. This module never calls a model or invents facts.
import { resolveEmployerIdentity } from './employer-identity.mjs';
import { dutyAwareSeniority, materialRequirements, occupationEvidence, requirementSummary } from './qualification-evidence.mjs';
import { structuredQualificationText } from '../../../lib/posting-evidence.mjs';
import { reconcileWorkArrangement } from './work-arrangement.mjs';
import { selectConfiguredRoute } from './career-strategy.mjs';

const clean = (value) => typeof value === "string" ? value.trim() : "";
const bulletText = (items) => items.length ? items.map((item) => `• ${item}`).join("\n") : null;

const LANE = Object.freeze({
  PRIVACY: "Privacy / Compliance / Assurance",
  AI: "Applied AI Governance overlay",
  GRC: "GRC / IT Risk / Security Compliance",
  MIXED: "Mixed Governance / Risk",
  TECH: "Technical Entry / Graduate Internships",
});
const RESUME = Object.freeze({
  A: "Resume A — GRC / Information Security Risk",
  B: "Resume B — Privacy",
  C: "Resume C — Technical Entry",
});
const TARGET_DUTY_PATTERNS = [
  [/\brisk assessments?\b/i, "risk assessments"],
  [/\bcontrols? (?:testing|assessment|design|implementation|assurance)\b/i, "controls / assurance"],
  [/\bremediation\b/i, "remediation governance"],
  [/\b(?:audit readiness|compliance audits?|assurance reviews?)\b/i, "audit / assurance"],
  [/\b(?:privacy impact|data protection impact|pia|dpia)\b/i, "privacy assessments"],
  [/\b(?:policy|policies|standards?) (?:development|implementation|governance|maintenance)\b/i, "policy governance"],
  [/\bthird[- ]party risk\b|\bvendor risk\b/i, "third-party risk"],
  [/\b(?:nist ai rmf|iso(?:\/iec)?\s*42001|responsible ai|ai governance)\b/i, "AI governance"],
  [/\b(?:data subject (?:rights?|requests?)|DSARs?|DSRs?|privacy rights)\b/i, "privacy rights operations"],
  [/\b(?:data (?:maps?|mapping|inventor(?:y|ies))|records? of processing|ROPA|data flow maps?)\b/i, "data mapping / processing records"],
  [/\b(?:privacy|data|security)[- ](?:incidents?|breach|investigations?|notification)\b|\bbreach (?:notification|risk assessment)\b/i, "incident / breach governance"],
  [/\b(?:risk registers?|risk (?:acceptance|treatment)|governance forums?|(?:executive|board|management) reporting)\b/i, "risk treatment / governance reporting"],
  [/\b(?:retention|deletion|consent management|records management)\b/i, "privacy lifecycle controls"],
  [/\b(?:business continuity|disaster recovery|BCDR|tabletop exercises?)\b/i, "operational resilience governance"],
];

function hits(value, pattern) { return pattern.test(value) ? 1 : 0; }
function scoreLane(title, jd, titlePattern, bodyPattern) {
  return hits(title, titlePattern) * 4 + hits(jd, bodyPattern) * 2;
}

export function seniorityBandFromTitle(rawTitle) {
  const title = clean(rawTitle).toLowerCase();
  if (!title) return null;
  if (/\b(chief|c[a-z]o|vice president|vp|head|director|principal|executive)\b/.test(title)) return "SCOPE REVIEW";
  if (/\b(senior\s+manager|sr\.?\s+manager|manager|lead)\b/.test(title)) return "SCOPE REVIEW";
  if (/\b(senior|sr\.?|snr)\b.{0,80}\b(analyst|associate|consultant|specialist|advisor|officer|engineer)\b/.test(title)) return "CORE";
  if (/\b(experienced\s+associate|analyst|associate|consultant|specialist|coordinator|advisor)\b/.test(title)) return "BRIDGE";
  if (/\b(engineer|architect|officer|auditor)\b/.test(title)) return "CORE";
  return null;
}

function laneFromEvidence(title, jd) {
  const aiTitle = /\b(?:ai|artificial intelligence|model)\s+(?:governance|risk|assurance|controls?)\b|\bresponsible ai\b|\biso(?:\/iec)?\s*42001\b/i;
  const aiBody = /\b(?:ai|artificial intelligence|model)\s+(?:governance|risk|assurance|controls?|lifecycle|validation)\b|\bresponsible ai\b|\bnist ai rmf\b|\biso(?:\/iec)?\s*42001\b/i;
  const privacyTitle = /\bprivacy\b|\bdata protection\b|\bdpo\b/i;
  const privacyBody = /\bprivacy\b|\bdata protection\b|\bprivacy by design\b|\bgdpr\b|\bccpa\b|\bdpo\b/i;
  const grcTitle = /\bgrc\b|\bit risk\b|\btechnology risk\b|\bsecurity (?:compliance|governance)\b|\binformation security risk\b|\bthird[- ]party risk\b|\bvendor risk\b|\bcontrols?\b|\bassurance\b|\baudit\b/i;
  const grcBody = /\bgrc\b|\bit risk\b|\btechnology risk\b|\bsecurity (?:compliance|governance)\b|\binformation security risk\b|\bthird[- ]party risk\b|\bvendor risk\b|\bcontrols? testing\b|\baudit readiness\b|\bremediation governance\b|\bsoc 2\b|\biso 27001\b|\bnist csf\b/i;
  const technicalTitle = /\b(?:IT|information systems|cybersecurity|technology|security)\s+(?:intern|trainee|apprentice)\b|\b(?:application support|junior systems|IT project|help ?desk|desktop support|SOC|IAM|service desk)\b/i;
  const technicalBody = /\b(?:troubleshoot\w*|ticket(?:s|ing)?|desktop support|help ?desk|application support|system testing|user support|access provisioning|alert triage|security monitoring|technical documentation|IT projects?|system configuration)\b/i;
  // Responsibilities outrank the title. Count distinct duty clauses so incidental
  // company boilerplate cannot turn technical entry into privacy governance.
  const clauses = jd.split(/[.\n;]+/).filter(Boolean);
  const count = pattern => clauses.filter(clause => pattern.test(clause)).length;
  const scores = {
    ai: count(aiBody) * 4 + hits(title, aiTitle),
    privacy: count(privacyBody) * 4 + hits(title, privacyTitle),
    grc: count(grcBody) * 4 + hits(title, grcTitle),
    technical: count(technicalBody) * 4 + hits(title, technicalTitle),
  };
  const routes = [
    { code: 'A', score: scores.grc + scores.ai, lane: scores.ai > scores.grc ? LANE.AI : LANE.GRC, resume: RESUME.A },
    { code: 'B', score: scores.privacy, lane: LANE.PRIVACY, resume: RESUME.B },
    { code: 'C', score: scores.technical, lane: LANE.TECH, resume: RESUME.C },
  ].sort((a,b) => b.score-a.score);
  const [first, second] = routes;
  if (!first.score) return { lane: null, code: 'UNCLEAR', resume: null, resumeCode: 'MANUAL_REVIEW', scores };
  if (second.score && first.score === second.score) return { lane: LANE.MIXED, code: 'HYBRID', resume: null, resumeCode: 'MANUAL_REVIEW', scores };
  return { lane: first.lane, code: first.code, resume: first.resume, resumeCode: `RESUME_${first.code}`, scores,
    explanation: `${first.code} selected from dominant responsibilities; competing route ${second.code}: ${second.score} vs ${first.score} duty/title points` };

}

function targetDutySignals(jd) {
  return TARGET_DUTY_PATTERNS.filter(([pattern]) => pattern.test(jd)).map(([, label]) => label);
}
function evidenceSignals(title, jd) {
  const all = `${title}\n${jd}`;
  const candidates = [
    [/\b(?:ai|artificial intelligence) governance\b|\bresponsible ai\b/i, "AI governance"],
    [/\bprivacy\b|\bdata protection\b/i, "privacy / data protection"],
    [/\bgrc\b|\bit risk\b|\btechnology risk\b|\binformation security risk\b/i, "GRC / technology risk"],
    [/\bsecurity compliance\b|\bregulatory compliance\b/i, "regulatory / security compliance"],
    [/\bthird[- ]party risk\b|\bvendor risk\b/i, "third-party risk"],
    [/\bcontrols?\b|\bassurance\b|\baudit readiness\b|\bremediation\b/i, "controls / assurance / remediation"],
    [/\bnist(?: ai rmf| csf)?\b|\biso(?:\/iec)?\s*(?:27001|27701|42001)?\b/i, "NIST / ISO frameworks"],
    [/\bclients?\b|\bclient-facing\b|\badvis(?:e|ing|ory)\b/i, "client-facing governance"],
  ];
  return candidates.filter(([pattern]) => pattern.test(all)).map(([, label]) => label).slice(0, 6);
}

function unrelatedAssessment(title, jd, targetDuties, lane) {
  const all = `${title}\n${jd}`;
  const families = [
    [/\bsoftware (?:development )?engineer\b|\bai\/ml software engineer\b/i, "software engineering"],
    [/\b(?:soc|security operations center)\b[^.\n]{0,60}\banalyst\b[\s\S]{0,220}\b(?:monitor|triage|alerts?|incidents?)\b/i, "SOC alert monitoring"],
    [/\bpenetration tester\b|\bethical hacker\b|\bred team\b/i, "offensive security"],
    [/\bnetwork engineer\b|\bnetwork infrastructure\b/i, "network engineering"],
    [/\bcloud (?:infrastructure )?security engineer\b/i, "cloud security engineering"],
    [/\biso\s*9001\b|\bquality management system\b/i, "non-technology quality management"],
  ];
  // A referenced colleague or prior occupation in a JD is not the vacancy's
  // role family. Require title evidence, except for explicit quality duties.
  const match = families.find(([pattern, family]) => pattern.test(title)
    || (family === "SOC alert monitoring" && /\b(?:soc|security operations center)\b/i.test(title) && pattern.test(all))
    || (family === "non-technology quality management" && /\b(?:quality|manufacturing)\b/i.test(title) && pattern.test(jd)));
  const unrelated = Boolean(match) && targetDuties.length < 2;
  const genericCompliance = /\bcompliance manager\b/i.test(title) && lane.code === "UNCLEAR" && targetDuties.length < 2
    && /\b(?:consumer product labeling|product labeling|manufacturing permits|trade documentation|facility inspections)\b/i.test(jd);
  return { unrelated: unrelated || genericCompliance, reason: match?.[1] ?? (genericCompliance ? "generic non-target compliance" : null) };
}

function postingStatus(raw) {
  const value = clean(raw).toUpperCase();
  if (["LIVE", "ACTIVE"].includes(value)) return "ACTIVE";
  if (["CLOSED", "EXPIRED", "REMOVED"].includes(value)) return "CLOSED";
  if (["UNCLEAR", "UNCONFIRMED"].includes(value)) return "UNCONFIRMED";
  return "UNKNOWN";
}
function jdQuality(raw, jd) {
  const value = clean(raw).toUpperCase();
  if (!jd && value === "COMPLETE") return "MISSING";
  if (["COMPLETE", "PARTIAL", "MISSING", "FETCH_FAILED", "ARCHIVE_UNAVAILABLE"].includes(value)) return value;
  return jd ? "COMPLETE" : "MISSING";
}
function candidateIsIllinois(location) { return /\b(?:illinois|chicago|il)\b/i.test(clean(location)); }

function explicitlyExcludesIllinois(jd) {
  const exclusions = [...jd.matchAll(/\b(?:not available|cannot hire|unable to hire|excluding|except)\b([^.;\n]{0,100})\bIllinois\b/gi)];
  // "Cannot hire outside Illinois" admits an Illinois resident. Conditional
  // sponsorship/benefit language does not establish a geography exclusion.
  return exclusions.some((match) => !/\b(?:outside|other than|without|sponsor\w*|benefits?)\b/i.test(match[1]))
    || /\bIllinois\b[^.;\n]{0,80}\b(?:excluded|not eligible)\b(?![^.;\n]*\b(?:sponsor\w*|benefits?)\b)/i.test(jd);
}

function eligibilityGate({ jd, candidateLocation, status, quality, unrelated, occupation, requirements }) {
  const reasons = [];
  if (status === "CLOSED") reasons.push("CLOSED_POSTING: source evidence says the posting is closed");
  if (unrelated.unrelated) reasons.push(`UNRELATED_ROLE_FAMILY: duties indicate ${unrelated.reason}`);
  if (occupation.legalPrimary || occupation.engineeringPrimary || occupation.financialPrimary || occupation.unpaid) reasons.push(...occupation.reasons.filter(reason => /^(?:UNRELATED_ROLE_FAMILY|EMPLOYMENT_TYPE_EXCLUSION)/.test(reason)));
  if (candidateIsIllinois(candidateLocation) && explicitlyExcludesIllinois(jd)) reasons.push("GEOGRAPHY_EXCLUSION: posting explicitly excludes Illinois");
  for (const requirement of requirements.filter(r => r.importance === "REQUIRED" && r.candidateEvidence === "MATERIAL_GAP")) reasons.push(`CONFIRMED_MANDATORY_MISMATCH: ${requirement.requirement}; ${requirement.comparisonReason}`);
  if (reasons.length) return { outcome: "FAIL", reasons };
  if (!requirements.some(r => r.category === 'CLEARANCE') && /\b(?:active|current) (?:top secret|secret|ts\/sci|security) clearance\b|\bmust (?:hold|possess|maintain)\b[^.\n]{0,80}\bclearance\b/i.test(jd)) reasons.push("CLEARANCE_UNVERIFIED: mandatory clearance found; candidate evidence was not inferred");
  if (!requirements.some(r => r.category === 'PROFESSIONAL_LICENSE') && /\b(?:must|requires?|required)\b[^.\n]{0,100}\b(?:bar admission|licensed attorney|cpa license|professional engineer license|rn license)\b/i.test(jd)) reasons.push("LICENSE_UNVERIFIED: mandatory professional license found; candidate evidence was not inferred");
  if (/\b(?:may|might|case[- ]by[- ]case)\b[^.\n]{0,80}\bsponsor/i.test(jd)) reasons.push("SPONSORSHIP_AMBIGUOUS: sponsorship language requires human review");
  if (quality !== "COMPLETE") reasons.push(`JD_${quality}: complete requirements are unavailable`);
  for (const requirement of requirements.filter(r => r.importance === 'REQUIRED' && r.candidateEvidence !== 'SUPPORTED')) {
    reasons.push(`${requirement.category}_${requirement.candidateEvidence}: ${requirement.requirement}; candidate scope was not inferred`);
  }
  return reasons.length ? { outcome: "REVIEW", reasons } : { outcome: "PASS", reasons: ["NO_HARD_DISQUALIFIER: none established from available evidence"] };
}

function priorityProjection({ gate, lane, seniority, quality, status, sourceConfidence, targetDuties, recommendationClass, identityReview, identity, occupation, requirements }) {
  const unresolved = requirements.filter(r => r.importance === 'REQUIRED' && r.candidateEvidence !== 'SUPPORTED');
  const specialized = new Set(unresolved.filter(r => r.specialized).map(r => r.capability || r.category)).size;
  const materialPenalty = Math.min(30, (specialized ? 10 + Math.min(10, (specialized - 1) * 3) : 0) + (occupation.technicalGovernance ? 18 : 0)
    + (unresolved.some(r => r.category === 'EXPERIENCE') ? 2 : 0)
    + (unresolved.some(r => r.category === 'EDUCATION_ELIGIBILITY') ? 8 : 0)
    + (unresolved.some(r => r.category === 'PEOPLE_MANAGEMENT' && r.specialized) ? 4 : 0)
    + (unresolved.some(r => ['PROFESSIONAL_LICENSE','CLEARANCE','CERTIFICATION'].includes(r.category)) ? 4 : 0));
  const components = {
    relevance: Math.min(60, Math.max(...Object.values(lane.scores)) * 5 + targetDuties.length * 3),
    eligibility: gate.outcome === "PASS" ? 20 : gate.outcome === "REVIEW" ? 5 : -100,
    careerStrategy: seniority.classification === "EXPERIENCE_ALIGNED" ? 15 : seniority.classification === "US_MARKET_BRIDGE" ? 13 : seniority.classification === "UNCLEAR" ? 4 : -8,
    jdIntegrity: quality === "COMPLETE" ? 10 : quality === "PARTIAL" ? 2 : 0,
    actionability: (status === "ACTIVE" ? 7 : status === "UNCONFIRMED" ? 2 : 0) + (sourceConfidence === "HIGH" ? 5 : sourceConfidence === "MEDIUM" ? 3 : 0),
    materialRequirements: -materialPenalty,
    identityConfidence: identity?.employerIdentityStatus === 'CONFLICT' ? -8 : identityReview ? -3 : 0,
  };
  const rawScore = Object.values(components).reduce((sum, value) => sum + value, 0);
  let band = rawScore >= 70 ? "HIGH" : rawScore >= 42 ? "MEDIUM" : "LOW";
  if (gate.outcome === "FAIL" || ["REJECT", "LOW"].includes(recommendationClass)) band = "LOW";
  const caps = [];
  if (gate.outcome === 'FAIL' || ['REJECT','LOW'].includes(recommendationClass)) caps.push('hard gate / recommendation requires LOW');
  if (quality !== 'COMPLETE') caps.push('complete JD unavailable');
  if (identityReview) caps.push('employer identity is unresolved');
  if (recommendationClass === 'REVIEW') caps.push('classification or mandatory requirements need human review');
  if ((quality !== "COMPLETE" || identityReview || recommendationClass === 'REVIEW') && band === "HIGH") band = "MEDIUM";
  const explanation = [
    `${components.relevance} relevance points from lane and duty evidence`,
    `${components.eligibility} eligibility points (${gate.outcome})`,
    `${components.careerStrategy} career-strategy points (${seniority.classification})`,
    `${components.jdIntegrity} JD-integrity points (${quality})`,
    `${components.actionability} actionability points (${status}, ${sourceConfidence} source confidence)`,
    `${components.materialRequirements} material-requirement points (${unresolved.length} mandatory requirement(s) not established)`,
    `${components.identityConfidence} identity-confidence points`,
  ];
  if (identityReview) explanation.push("employer identity is unresolved; priority capped at MEDIUM");
  if (materialPenalty) explanation.push('mandatory specialized scope or experience is not established; preferred qualifications are not vetoes');
  // Band safeguards are authoritative in compareOpportunityPriority. Never
  // clamp the substantive ordering value to a band boundary.
  return { band, score: rawScore, components, explanation, caps };
}

export function classifyLiteOpportunity(input = {}) {
  const title = clean(input.title);
  const jd = clean(input.jd);
  const location = clean(input.location);
  const sourceStatus = postingStatus(input.postingStatus || input.liveness);
  const aggregator = /builtin|built in/i.test(clean(input.sourceProvider || input.source)) || /aggregator/i.test(clean(input.companySource));
  const status = sourceStatus === 'ACTIVE' && aggregator && input.employerPostingVerified !== true ? 'UNCONFIRMED' : sourceStatus;
  const quality = jdQuality(input.jdQuality, jd);
  const sourceConfidence = clean(input.sourceConfidence).toUpperCase() || (/greenhouse|lever|ashby|workday/i.test(clean(input.source)) ? "HIGH" : "MEDIUM");
  const identity = input.company !== undefined || input.employerIdentityStatus || input.employerIdentityEvidence
    ? resolveEmployerIdentity(input) : null;
  const identityReview = ["AMBIGUOUS", "CONFLICT"].includes(identity?.employerIdentityStatus);
  const custom = input.candidateEvidence?.careerStrategy?.active === 'custom';
  const lane = custom ? selectConfiguredRoute(title, jd, input.candidateEvidence.careerStrategy) : laneFromEvidence(title, jd);
  const duties = custom ? lane.duties : targetDutySignals(jd);
  if (!custom && lane.code === 'C') for (const [pattern,label] of [
    [/troubleshoot|tickets?|user support|help ?desk|desktop support/i, 'technical support / troubleshooting'],
    [/system testing|system configuration|application support|technical documentation|IT projects?/i, 'systems / application delivery'],
    [/access provisioning|IAM|alert triage|security monitoring|SOC/i, 'access / security operations'],
    [/supervis|mentor|training|learn/i, 'supervision / technical learning'],
  ]) if (pattern.test(jd)) duties.push(label);
  const requirements = materialRequirements(structuredQualificationText(jd, input), input.candidateEvidence);
  const arrangement = reconcileWorkArrangement({ ...input, jd, location });
  const observedOccupation = occupationEvidence(title, jd, requirements);
  // The inherited occupational exclusions describe the legacy governance
  // strategy, not every profession. Custom routes retain universal evidence
  // gates and explicit unpaid exclusions, and always require scope review.
  const occupation = custom ? { ...observedOccupation, legalPrimary:false, engineeringPrimary:false, financialPrimary:false, technicalGovernance:false, reasons:observedOccupation.reasons.filter(reason => !/^UNRELATED_ROLE_FAMILY|^MANDATORY_TECHNICAL_GOVERNANCE/.test(reason)) } : observedOccupation;
  if (occupation.unpaid) requirements.push({ category: 'EMPLOYMENT_TYPE', requirement: 'explicit unpaid / volunteer position', importance: 'REQUIRED', evidence: occupation.reasons.find(reason => reason.startsWith('EMPLOYMENT_TYPE_EXCLUSION')), candidateEvidence: 'MATERIAL_GAP', comparisonReason: 'explicit arrangement conflicts with paid-professional targeting, not a claim about candidate capabilities', candidateSource: null, specialized: false });
  const seniority = custom ? {band:'SCOPE REVIEW',classification:'UNCLEAR',bridge:'UNCLEAR',years:null,reasons:['CONFIGURED_STRATEGY_SCOPE_REVIEW: verify responsibility level and candidate evidence manually'],evidence:{}} : dutyAwareSeniority(title, jd, duties, seniorityBandFromTitle(title), requirements, lane.code);
  const engineering = { technicalTitle: /\b(engineer|architect|developer)\b/i.test(title), engineeringHeavy: occupation.engineeringPrimary, technicalGovernance: occupation.technicalGovernance };
  const unrelated = custom ? {unrelated:false,reason:null} : unrelatedAssessment(title, jd, duties, lane);
  if (lane.code === "C" && unrelated.reason === "SOC alert monitoring") unrelated.unrelated = false;
  const strengths = custom ? duties : evidenceSignals(title, jd);
  const risks = [];
  risks.push(...arrangement.workArrangementReasons);
  risks.push(...occupation.reasons);
  risks.push(...requirements.filter(r => r.candidateEvidence !== 'SUPPORTED').map(r => requirementSummary(r)));
  if (seniority.classification === "TOO_SENIOR") risks.push("seniority above current target band");
  if (seniority.classification === "TOO_JUNIOR") risks.push("responsibility level appears below the target band");
  if (engineering.engineeringHeavy) risks.push("engineering-heavy responsibilities outweigh governance duties");
  else if (engineering.technicalTitle && !jd) risks.push("technical title — duties need verification");
  if (lane.lane === LANE.AI && /\b(?:model|ai)\s+(?:testing|validation)\b|\bai\/ml\b[^.\n]{0,100}\b(?:testing|validation)\b/i.test(jd)) risks.push("direct AI validation depth requested — verify documented evidence");
  if (/\b(?:does not|doesn't|will not|unable to)\s+(?:provide\s+)?(?:visa\s+)?sponsor(?:ship)?\b|\bdoes not intend to hire\b[^.\n]{0,160}\bsponsorship\b|\bno (?:visa )?sponsorship\b|\bsponsorship (?:is )?not available\b/i.test(jd)) risks.push("sponsorship restriction present — compare only with explicit candidate configuration");
  if (quality !== "COMPLETE") risks.push(`JD unavailable (${quality.toLowerCase().replaceAll("_", " ")}) — recommendation confidence is limited`);
  if (status !== "ACTIVE") risks.push(`posting status ${status.toLowerCase()} — verify before investing in an application`);
  if (!location) risks.push("location uncertainty");
  if (identityReview) risks.push(...identity.employerIdentityReasons);

  const gate = eligibilityGate({ jd, candidateLocation: input.candidateLocation, status, quality, unrelated, occupation, requirements });
  if (arrangement.workArrangementReasons.length) {
    if (gate.outcome === 'PASS') gate.outcome = 'REVIEW';
    gate.reasons.push(...arrangement.workArrangementReasons);
  }
  if (identityReview) {
    if (gate.outcome === "PASS") gate.outcome = "REVIEW";
    gate.reasons.push(...identity.employerIdentityReasons);
  }
  let recommendationClass;
  if (gate.outcome === "FAIL") recommendationClass = "REJECT";
  else if (engineering.engineeringHeavy || requirements.some(r => r.importance === 'REQUIRED' && r.candidateEvidence === 'MATERIAL_GAP') || (occupation.technicalGovernance && requirements.some(r => r.importance === 'REQUIRED' && r.specialized && r.candidateEvidence !== 'SUPPORTED')) || seniority.classification === "TOO_SENIOR" || seniority.classification === "TOO_JUNIOR") recommendationClass = "LOW";
  else if (gate.outcome === "REVIEW" || lane.code === "UNCLEAR" || lane.code === "HYBRID" || seniority.classification === 'UNCLEAR' || duties.length === 0) recommendationClass = "REVIEW";
  else if (seniority.classification === "US_MARKET_BRIDGE") recommendationClass = "BRIDGE";
  else if (quality === "COMPLETE" && duties.length >= 4 && status === "ACTIVE") recommendationClass = "PRIORITY";
  else recommendationClass = "STRONG";

  const recommendationReasons = [];
  if (lane.code !== "UNCLEAR") recommendationReasons.push(`career route ${lane.code} supported by posting evidence`);
  if (lane.explanation) recommendationReasons.push(lane.explanation);
  if (duties.length) recommendationReasons.push(`${duties.length} target dut${duties.length === 1 ? "y" : "ies"} matched`);
  recommendationReasons.push(`eligibility gate ${gate.outcome}`);
  if (seniority.classification === "US_MARKET_BRIDGE") recommendationReasons.push("lower U.S. title retains substantive target duties");
  if (quality !== "COMPLETE") recommendationReasons.push("confidence capped because the complete JD is unavailable");
  if (identityReview) recommendationReasons.push(...identity.employerIdentityReasons);
  if (occupation.reasons.length) recommendationReasons.push(...occupation.reasons);
  const priority = priorityProjection({ gate, lane, seniority, quality, status, sourceConfidence, targetDuties: duties, recommendationClass, identityReview, identity, occupation, requirements });
  const readinessReasons = [];
  if (gate.outcome === 'FAIL' || ['REJECT','LOW'].includes(recommendationClass)) readinessReasons.push('hard veto or material suitability / cohort gap: not actionable under the current evidence');
  if (identityReview) readinessReasons.push(...identity.employerIdentityReasons);
  if (quality !== 'COMPLETE') readinessReasons.push(`JD_${quality}: retrieve complete requirements first`);
  if (status !== 'ACTIVE') readinessReasons.push(`POSTING_${status}: employer activity needs confirmation`);
  if (['UNCLEAR','HYBRID'].includes(lane.code) || seniority.classification === 'UNCLEAR') readinessReasons.push('CLASSIFICATION_UNRESOLVED: occupational lane or responsibility level needs human review');
  if (requirements.some(r => r.importance === 'UNVERIFIED')) readinessReasons.push('REQUIREMENT_IMPORTANCE_UNVERIFIED: clarify whether listed qualifications are mandatory');
  if (gate.outcome === 'REVIEW') readinessReasons.push(...gate.reasons.filter(r => !readinessReasons.includes(r)));
  const applicationReadiness = gate.outcome === 'FAIL' || ['REJECT','LOW'].includes(recommendationClass) ? 'NOT_ACTIONABLE'
    : readinessReasons.length ? 'CONDITIONAL_REVIEW' : 'READY_FOR_REVIEW';
  const matchedRules = [...new Set([...strengths, ...duties])];
  const negativeRules = [unrelated.reason, ...occupation.reasons, engineering.engineeringHeavy ? "engineering-heavy" : null].filter(Boolean);
  return {
    ...arrangement,
    ...(identity ?? {}),
    admission: gate.outcome === "FAIL" ? "REJECT" : identityReview || lane.code === "UNCLEAR" ? "REVIEW" : "PASS",
    admissionReasons: gate.outcome === 'FAIL' ? gate.reasons : lane.code === "UNCLEAR" ? ["target role-family evidence is insufficient"] : [`title/JD supports lane ${lane.code}`],
    careerLane: lane.lane,
    careerLaneCode: lane.code,
    roleFamily: unrelated.unrelated || occupation.legalPrimary || occupation.engineeringPrimary || occupation.financialPrimary ? "UNRELATED" : lane.code === "UNCLEAR" ? "UNCLEAR" : custom ? "TARGET_CUSTOM" : lane.code === "C" ? "TARGET_TECHNICAL_ENTRY" : "TARGET_GOVERNANCE",
    roleFamilyReasons: occupation.reasons,
    employmentType: occupation.unpaid ? 'UNPAID_VOLUNTEER' : 'UNSPECIFIED',
    materialRequirements: requirements,
    seniorityBand: seniority.band,
    seniorityClassification: seniority.classification,
    seniorityReasons: seniority.reasons,
    bridgeStatus: seniority.bridge,
    recommendedResume: lane.resume,
    recommendedResumeCode: lane.resumeCode,
    recommendedResumeBase: custom ? lane.resumeBase || null : input.candidateEvidence?.resumeBases?.[lane.code]?.source_name || null,
    postingStatus: status,
    sourceListingStatus: sourceStatus === 'ACTIVE' ? 'AVAILABLE' : sourceStatus,
    sourceConfidence,
    jdQuality: quality,
    gate: gate.outcome,
    gateReasons: gate.reasons,
    recommendationClass,
    recommendation: recommendationClass,
    recommendationReasons,
    priorityBand: priority.band,
    priorityScore: priority.score,
    rankingComponents: priority.components,
    rankingExplanation: priority.explanation,
    priorityCapReasons: priority.caps,
    applicationReadiness,
    readinessReasons,
    whyItFits: bulletText(strengths),
    materialGaps: bulletText(risks),
    diagnostics: { matchedRules, negativeRules, laneScores: lane.scores, targetDuties: duties, engineering, occupation, seniority: seniority.evidence, minimumYears: seniority.years },
    factors: { laneScores: lane.scores, engineering },
  };
}

export const LITE_LANES = LANE;
export const LITE_RESUMES = RESUME;
