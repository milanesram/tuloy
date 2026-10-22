import * as yaml from "js-yaml";
import { cleanHeading, splitSections } from "./report-sections.mjs";
import { resolveEmployerIdentity } from "./employer-identity.mjs";

export const NOT_CAPTURED = "Not captured";
export const UNCLEAR = "UNCLEAR";

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const list = (value) =>
  Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];

function sectionNamed(sections, pattern) {
  return sections.find((section) => pattern.test(cleanHeading(section.heading))) ?? null;
}

function isKnownReportBoundary(section) {
  if (section.letter) return true;
  return /^(?:machine summary|keywords extracted|risk summary|cover letter draft|post-evaluation|liveness gate|blacklist gate|bounded research budget|step 0\b)/i.test(
    cleanHeading(section.heading),
  );
}

/** A verbatim JD may itself contain Markdown H2 headings. Reassemble those
 *  unrecognized subsections until the next established report boundary. */
function archivedJdSection(sections) {
  const start = sections.findIndex((section) => /^job description\b/i.test(cleanHeading(section.heading)));
  if (start < 0) return null;
  const pieces = [sections[start].content];
  for (let i = start + 1; i < sections.length; i += 1) {
    if (isKnownReportBoundary(sections[i])) break;
    pieces.push(`## ${sections[i].heading}\n${sections[i].content}`);
  }
  return text(pieces.join("\n\n"));
}

/** Parse only the established Machine Summary YAML fence. External report/JD
 *  content remains data; no other section can become configuration or code. */
export function parseMachineSummary(report) {
  if (!text(report)) return {};
  const { sections } = splitSections(report);
  const section = sectionNamed(sections, /^machine summary$/i);
  if (!section) return {};
  const fenced = section.content.match(/```(?:ya?ml)?\s*\n([\s\S]*?)```/i);
  if (!fenced) return {};
  try {
    const parsed = yaml.load(fenced[1]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Resolve report sections into the small set /ops displays. A canonical JD
 *  pointer is returned for the server-side, contained-file reader to resolve.
 *  @param {string | null | undefined} report
 *  @param {string | null} linkedJdText
 */
export function extractReportDetails(report, linkedJdText = null) {
  if (!text(report)) {
    return {
      machine: {},
      whyItFits: null,
      materialGaps: null,
      applicationQuestions: null,
      jd: text(linkedJdText),
      jdPointer: null,
      nextAction: null,
      recommendation: null,
      seniorityBand: null,
    };
  }

  const { sections } = splitSections(report);
  const machine = parseMachineSummary(report);
  const questions = sectionNamed(sections, /^draft application answers$/i);
  const jdSection = archivedJdSection(sections);
  const pointerCandidate = jdSection?.replace(/^Posted:.*$/im, "").trim();
  const pointerMatch = pointerCandidate?.match(
    /^See\s+(jds\/[A-Za-z0-9._-]+)\s+for the full archive(?:\s+\(archive-posting\.mjs\s+--report=\d+\))?\.?$/i,
  );
  const embeddedJd = pointerMatch ? null : jdSection;
  const strengths = list(machine.top_strengths);
  const gaps = [...list(machine.hard_stops), ...list(machine.soft_gaps)];
  const band = /\bU\.S\.-Market Bridge\b/i.test(report)
    ? "U.S.-Market Bridge"
    : /\bExperience-Aligned\b/i.test(report)
      ? "Experience-Aligned"
      : null;

  return {
    machine,
    whyItFits: strengths.length ? strengths.join("\n") : null,
    materialGaps: gaps.length ? gaps.join("\n") : null,
    applicationQuestions: text(questions?.content),
    jd: text(linkedJdText) ?? embeddedJd,
    jdPointer: pointerMatch?.[1] ?? null,
    nextAction: text(machine.next_action),
    recommendation: text(machine.final_decision),
    seniorityBand: band,
  };
}

/** Pull only explicit campaign labels from the pipeline's free-text note. */
export function parsePipelineNote(note) {
  const raw = text(note);
  if (!raw) return {};
  const segments = raw.split(";").map((part) => part.trim()).filter(Boolean);
  const find = (pattern) => segments.find((part) => pattern.test(part)) ?? null;
  const recommendation = find(/^(?:Proceed|Apply)\s+[—-]\s+/i);
  const lane = find(/^(?:GRC\s*\/\s*IT Risk\s*\/\s*Security Compliance|Privacy\s*\/\s*Compliance\s*\/\s*Assurance|Applied AI Governance(?: overlay)?|Technical Entry\s*\/\s*Graduate Internships)$/i);
  const band = find(/^(?:U\.S\.-Market Bridge|Experience-Aligned)$/i);
  const gapsSegment = find(/^material gaps\s*:/i);
  const risks = [
    gapsSegment?.replace(/^material gaps\s*:\s*/i, ""),
    ...segments.filter((part) => /^do not claim\b/i.test(part)),
  ].filter(Boolean);
  return {
    recommendation,
    careerLane: lane,
    seniorityBand: band,
    materialGaps: risks.length ? risks.join("\n") : null,
  };
}

export function recommendedResumeForLane(lane) {
  const value = text(lane);
  if (!value) return null;
  if (/Technical Entry|Graduate Internships/i.test(value)) return "Resume C — Technical Entry";
  if (/\bGRC\b|IT Risk|Security Compliance|Technology Risk|Controls Assurance|AI Governance|Responsible AI|AI Risk|AI Assurance/i.test(value)) {
    return "Resume A — GRC / Information Security Risk";
  }
  if (/Privacy|Data Protection/i.test(value)) {
    return "Resume B — Privacy";
  }
  return null;
}

export function workArrangementFromLocation(location) {
  const value = text(location);
  if (!value) return null;
  if (/\bhybrid\b/i.test(value)) return "Hybrid";
  if (/\bremote\b/i.test(value)) return "Remote";
  if (/\bon[ -]?site\b|\bin[- ]office\b/i.test(value)) return "Onsite";
  return null;
}

export function requisitionFromPosting(url, note = "") {
  const fromNote = text(note)?.match(
    /\b(?:job\s*id|posting\s*id|requisition|req|jr|job|posting|ref(?:erence)?|r_)[\s:#_-]*([a-z][a-z0-9-]*\d[a-z0-9-]*|\d[a-z0-9-]*)\b/i,
  )?.[1];
  try {
    const parsed = new URL(url);
    for (const key of ["gh_jid", "job_id", "jobId", "jid", "requisitionId", "postingId"]) {
      const value = parsed.searchParams.get(key);
      if (value && /^[A-Za-z0-9_-]+$/.test(value)) return value;
    }
    const greenhouse = parsed.pathname.match(/\/jobs\/(\d+)(?:\/|$)/i);
    if (greenhouse) return greenhouse[1];
  } catch { /* explicit note remains a fallback when the URL has no identity */ }
  return fromNote ?? null;
}

export function sourceFromPostingUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const domainIs = (base) => host === base || host.endsWith(`.${base}`);
    // Employer-hosted Greenhouse embeds retain the provider's explicit gh_jid.
    if (parsed.searchParams.has("gh_jid")) return "Greenhouse";
    if (domainIs("greenhouse.io")) return "Greenhouse";
    if (domainIs("lever.co")) return "Lever";
    if (domainIs("ashbyhq.com")) return "Ashby";
    if (domainIs("myworkdayjobs.com") || domainIs("workday.com")) return "Workday";
    if (domainIs("builtinchicago.org")) return "Built In Chicago";
  } catch {
    return null;
  }
  return null;
}

export function normalizeOpportunityUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return String(url ?? "").trim();
  }
}

/** True only for a complete HTTP(S) posting URL. This is shared by the UI and
 *  write route so malformed strings and non-web schemes never become links or
 *  tracker identities. Embedded credentials are rejected as unnecessary for
 *  public job postings. */
export function isSafeWebUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

export function opportunityRoleKey(company, role) {
  const fold = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${fold(company)}\u0000${fold(role)}`;
}

/** Match canonical opportunities without collapsing two distinct requisitions.
 * Unresolved employer conflict blocks association; otherwise URL equality
 * wins and a shared requisition may bridge canonical URL aliases.
 * Company+role fallback is only for two wholly unkeyed legacy records. */
export function opportunityIdentityMatches(left, right) {
  const leftUrl = isSafeWebUrl(left?.url) ? normalizeOpportunityUrl(left.url) : null;
  const rightUrl = isSafeWebUrl(right?.url) ? normalizeOpportunityUrl(right.url) : null;
  const unresolved = item => item?.employerIdentityStatus === "CONFLICT"
    || resolveEmployerIdentity(item || {}).employerIdentityStatus === "CONFLICT";
  if (unresolved(left) || unresolved(right)) return false;
  const explicitReq = item => text(item?.employerRequisitionId) && item.employerRequisitionId !== NOT_CAPTURED ? item.employerRequisitionId : null;
  if (explicitReq(left) && explicitReq(right) && explicitReq(left) !== explicitReq(right)) return false;
  const board = url => { try { const u = new URL(url); return /(^|\.)greenhouse\.io$/.test(u.hostname) ? u.pathname.match(/^\/([^/]+)\/jobs\//)?.[1] : null; } catch { return null; } };
  if (board(leftUrl) && board(rightUrl) && board(leftUrl) !== board(rightUrl)) return false;
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;
  const leftCanonicalReq = requisitionFromPosting(left?.url);
  const rightCanonicalReq = requisitionFromPosting(right?.url);
  // A shared stale note is not proof that two present, different canonical
  // URLs name the same posting. Only URL-derived identifiers can bridge them.
  if (leftUrl && rightUrl && (!leftCanonicalReq || !rightCanonicalReq)) return false;
  const leftReq = leftCanonicalReq ?? requisitionFromPosting("", left?.note || left?.notes || "");
  const rightReq = rightCanonicalReq ?? requisitionFromPosting("", right?.note || right?.notes || "");
  if (leftReq && rightReq) return leftReq.toLowerCase() === rightReq.toLowerCase()
      && opportunityRoleKey(left?.company, "") === opportunityRoleKey(right?.company, "");
  if (leftUrl && rightUrl) return false;
  // A specific current posting cannot inherit an unkeyed application merely
  // because its employer/title agree. Matching requisitions above remain valid.
  if (leftUrl || rightUrl || leftReq || rightReq) return false;
  // Uncorroborated publisher labels cannot claim an unkeyed application.
  // Exact canonical identity above still supports valid historical records.
  const ambiguous = item => item?.employerIdentityStatus === 'AMBIGUOUS'
    || item?.identityMetadataInvalid || ((item?.companySource || item?.sourceProvider || item?.sourceUrl) && resolveEmployerIdentity(item).employerIdentityStatus === 'AMBIGUOUS');
  if (ambiguous(left) || ambiguous(right)) return false;
  return opportunityRoleKey(left?.company, left?.role) === opportunityRoleKey(right?.company, right?.role);
}

/** Deterministic Review Queue order. Bands are authoritative; the numeric
 * component score only orders records inside a band and is not a percentage. */
export function compareOpportunityPriority(left, right) {
  const bandRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const leftBand = bandRank[left?.priorityBand] ?? 0;
  const rightBand = bandRank[right?.priorityBand] ?? 0;
  const unresolvedRequired = job => (job?.materialRequirements ?? []).filter(item => item.importance === 'REQUIRED' && item.candidateEvidence !== 'SUPPORTED').length;
  return rightBand - leftBand
    || (Number(right?.priorityScore) || 0) - (Number(left?.priorityScore) || 0)
    || (Number(right?.rankingComponents?.relevance) || 0) - (Number(left?.rankingComponents?.relevance) || 0)
    || (Number(right?.rankingComponents?.materialRequirements) || 0) - (Number(left?.rankingComponents?.materialRequirements) || 0)
    || unresolvedRequired(left) - unresolvedRequired(right)
    || String(left?.company ?? "").localeCompare(String(right?.company ?? ""))
    || String(left?.role ?? "").localeCompare(String(right?.role ?? ""))
    || String(left?.url ?? "").localeCompare(String(right?.url ?? ""));
}

/** Preserve an existing Handoff 2.0 verdict only when current evidence does
 * not impose a review/low/reject confidence cap. */
export function confidenceSafeRecommendation(prior, recommendationClass) {
  const current = text(recommendationClass);
  if (["REVIEW", "LOW", "REJECT"].includes(current)) return current;
  return text(prior) ?? current;
}

const handoffValue = (value, fallback = NOT_CAPTURED) => text(value) ?? fallback;

const handoffList = (value) => {
  const values = Array.isArray(value) ? value : text(value)?.split("\n") ?? [];
  const cleaned = values.map((item) => String(item).replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean);
  return cleaned.length ? cleaned.map((item) => `- ${item}`).join("\n") : `- ${NOT_CAPTURED}`;
};

/** Stateless, paste-ready Handoff Model 2.0 package. */
export function composeHandoff(job) {
  const lines = [
    "CAREER OPS JOB HANDOFF",
    "",
    `Company: ${handoffValue(job.company)}`,
    `Role: ${handoffValue(job.role)}`,
    `Location: ${handoffValue(job.location)}`,
    `Work arrangement: ${handoffValue(job.workArrangement)}`,
    `Provider: ${handoffValue(job.source)}`,
    `Requisition: ${handoffValue(job.requisition)}${job.requisitionType ? ` (${job.requisitionType})` : ' (legacy identifier — type not established)'}`,
    `Employer requisition ID: ${handoffValue(job.employerRequisitionId)}`,
    `Provider internal job ID: ${handoffValue(job.providerInternalJobId)}`,
    `Canonical posting URL: ${handoffValue(job.url)}`,
    `Posting status: ${handoffValue(job.postingStatus ?? job.liveness, UNCLEAR)}`,
    ...(job.sourceListingStatus ? [`Source listing: ${job.sourceListingStatus}`, ...(job.sourceListingStatus === 'AVAILABLE' && job.postingStatus !== 'ACTIVE' ? ['WARNING: Source listing availability does not independently confirm the employer posting is active.'] : [])] : []),
    `Posting date: ${handoffValue(job.postedAt)}`,
    ...(job.workArrangementReasons?.length || job.workArrangementEvidence?.length ? ['WORK ARRANGEMENT EVIDENCE', `Source signal: ${job.sourceWorkArrangement}`, `Captured JD signal: ${job.jdWorkArrangement}`, ...(job.workArrangementReasons?.length ? [handoffList(job.workArrangementReasons)] : []), ...(job.workArrangementEvidence?.length ? [handoffList(job.workArrangementEvidence)] : [])] : []),
    ...(job.postingVariants?.length ? ['POSTING VARIANTS — same verified employer requisition, separate posting identities', ...job.postingVariants.map(v => `${v.sourceId}: ${v.location} — ${v.url}`)] : []),
    "",
    `Career lane: ${handoffValue(job.careerLaneCode ?? job.careerLane)}`,
    `Recommended resume: ${handoffValue(job.recommendedResumeCode ?? job.recommendedResume)}`,
    ...(job.recommendedResumeBase ? [`Approved resume base: ${handoffValue(job.recommendedResumeBase)}`] : []),
    `Seniority classification: ${handoffValue(job.seniorityClassification ?? job.seniorityBand)}`,
    `Bridge status: ${handoffValue(job.bridgeStatus)}`,
    ...(job.seniorityReasons?.length ? ['Seniority rationale:', handoffList(job.seniorityReasons)] : []),
    "",
    `Recommendation: ${handoffValue(job.recommendation)}`,
    `Priority: ${handoffValue(job.priorityBand)}`,
    ...(job.applicationReadiness ? ['APPLICATION READINESS', job.applicationReadiness, handoffList(job.readinessReasons), 'Review readiness is not permission to submit an application.'] : []),
    "",
    "EMPLOYER IDENTITY",
    `Status: ${handoffValue(job.employerIdentityStatus, "CONSISTENT")}`,
    `Displayed employer: ${handoffValue(job.company)}`,
    `Captured employer evidence: ${handoffValue(job.employerIdentityName)}`,
    ...(["CONFLICT", "AMBIGUOUS"].includes(job.employerIdentityStatus)
      ? ["WARNING: Employer identity is unresolved. Human confirmation required before application.", handoffList(job.employerIdentityReasons)] : []),
    "",
    "WHY THIS ROLE WAS SURFACED",
    handoffList(job.recommendationReasons ?? job.whyItFits),
    "",
    "STRENGTHS",
    handoffList(job.whyItFits),
    "",
    ...(job.materialRequirements?.length ? ['MATERIAL REQUIREMENTS', handoffList(job.materialRequirements.map(item => `${item.requirement} — ${item.importance}; candidate evidence: ${item.candidateEvidence}${item.candidateSource ? ` (${item.candidateSource})` : ''}`)), ''] : []),
    ...(job.roleFamilyReasons?.length ? ['ROLE FAMILY / EMPLOYMENT TYPE', handoffList(job.roleFamilyReasons), ''] : []),
    "MATERIAL GAPS",
    handoffList(job.materialGaps),
    "",
    "RISKS / UNRESOLVED REQUIREMENTS",
    handoffList(job.gateReasons),
    "",
    ...(job.priorityCapReasons?.length ? ['PRIORITY SAFEGUARDS', handoffList(job.priorityCapReasons), ''] : []),
    "ELIGIBILITY",
    `Gate: ${handoffValue(job.gate)}`,
    "Reasons:",
    handoffList(job.gateReasons),
    "",
    "JOB DESCRIPTION",
    job.jd
      ? `Status: ${handoffValue(job.jdQuality, "COMPLETE")}\n${job.jdQuality && job.jdQuality !== "COMPLETE" ? "WARNING: Complete JD evidence is unavailable; the captured text below may be incomplete.\n" : ""}\n${job.jd}`
      : `Status: ${handoffValue(job.jdQuality, "MISSING")}\nWARNING: Complete JD text is unavailable. Retrieve and verify the employer posting before substantive fit analysis.`,
    "",
    "SOURCE INFORMATION",
    `Provider: ${handoffValue(job.sourceProvider ?? job.source)}`,
    `Publisher: ${handoffValue(job.sourcePublisher ?? job.source)}`,
    `Source posting ID: ${handoffValue(job.sourceId)}`,
    `Employer label source: ${handoffValue(job.companySource)}`,
    `Discovery URL: ${handoffValue(job.discoveredUrl)}`,
    `JD source: ${handoffValue(job.jdSource)}`,
    `JD archive: ${handoffValue(job.jdArchiveReference)}`,
    `Source confidence: ${handoffValue(job.sourceConfidence)}`,
  ];
  return lines.join("\n");
}

export function trackerSkeleton() {
  return [
    "# Applications Tracker",
    "",
    "| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes | URL |",
    "|---|------|---------|------|----------|-------|--------|-----|--------|-------|-----|",
    "",
  ].join("\n");
}

const tsvCell = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();

/** Headed addition consumed by merge-tracker.mjs; it is staging, not a new
 *  tracker format. The initial Evaluated state is immediately transitioned to
 *  Applied by set-status.mjs so the canonical follow-up hook fires. */
export function trackerAdditionTsv({ num, date, company, role, location, notes, url }) {
  const header = ["num", "date", "company", "role", "status", "score", "pdf", "report", "notes", "location", "url"];
  const row = [num, date, company, role, "Evaluated", "N/A", "❌", "—", notes, location, url];
  return `${header.join("\t")}\n${row.map(tsvCell).join("\t")}\n`;
}
