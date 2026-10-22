import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  compareOpportunityPriority,
  confidenceSafeRecommendation,
  composeHandoff,
  extractReportDetails,
  isSafeWebUrl,
  normalizeOpportunityUrl,
  opportunityIdentityMatches,
  opportunityRoleKey,
  parseMachineSummary,
  parsePipelineNote,
  recommendedResumeForLane,
  requisitionFromPosting,
  sourceFromPostingUrl,
  trackerAdditionTsv,
  trackerSkeleton,
  workArrangementFromLocation,
} from "../src/lib/ops.mjs";
import { parseApplications } from "../src/lib/tracker-table.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const REPORT = `# Evaluation

## A) Role Summary
Relevant work.

## H) Draft Application Answers
Why us? Use the candidate's documented controls and implementation experience.

Band: Experience-Aligned

## Machine Summary

\`\`\`yaml
final_decision: APPLY — PRIORITY
top_strengths:
  - Privacy-program implementation
  - Controls and remediation
soft_gaps:
  - Direct CCPA implementation not established
hard_stops: []
next_action: Copy to ChatGPT Career Project for deep application preparation
\`\`\`

## Job Description (archived verbatim)
Build and operate the privacy program.
`;

test("extracts only established report sections and Machine Summary fields", () => {
  assert.deepEqual(parseMachineSummary(REPORT).top_strengths, [
    "Privacy-program implementation",
    "Controls and remediation",
  ]);
  const details = extractReportDetails(REPORT);
  assert.equal(details.recommendation, "APPLY — PRIORITY");
  assert.equal(details.whyItFits, "Privacy-program implementation\nControls and remediation");
  assert.equal(details.materialGaps, "Direct CCPA implementation not established");
  assert.match(details.applicationQuestions, /^Why us\?/);
  assert.equal(details.jd, "Build and operate the privacy program.");
  assert.equal(details.seniorityBand, "Experience-Aligned");
  assert.match(details.nextAction, /Copy to ChatGPT/);
});

test("recognizes an existing canonical JD pointer without fabricating content", () => {
  const report = `## Job Description (archived verbatim)\nPosted: 2026-10-01\nSee jds/012-acme-role.md for the full archive.`;
  const unresolved = extractReportDetails(report);
  assert.equal(unresolved.jd, null);
  assert.equal(unresolved.jdPointer, "jds/012-acme-role.md");
  assert.equal(extractReportDetails(report, "Archived employer text").jd, "Archived employer text");
});

test("preserves Markdown subheadings inside an embedded JD", () => {
  const report = [
    "## Job Description (archived verbatim)",
    "Build the privacy program.",
    "",
    "## Responsibilities",
    "Run assessments and remediation.",
    "",
    "## Machine Summary",
    "```yaml",
    "final_decision: Apply",
    "```",
  ].join("\n");
  assert.equal(
    extractReportDetails(report).jd,
    "Build the privacy program.\n\n## Responsibilities\nRun assessments and remediation.",
  );
});

test("derives only explicit pipeline labels and conservative display metadata", () => {
  const parsed = parsePipelineNote(
    "Proceed — Bridge Application; U.S.-Market Bridge; GRC / IT Risk / Security Compliance; material gaps: platform administration; Do not claim LogicGate experience",
  );
  assert.equal(parsed.recommendation, "Proceed — Bridge Application");
  assert.equal(parsed.seniorityBand, "U.S.-Market Bridge");
  assert.equal(parsed.careerLane, "GRC / IT Risk / Security Compliance");
  assert.match(parsed.materialGaps, /platform administration/);
  assert.match(parsed.materialGaps, /Do not claim LogicGate experience/);
  assert.equal(recommendedResumeForLane(parsed.careerLane), "Resume A — GRC / Information Security Risk");
  assert.equal(recommendedResumeForLane("Privacy / Compliance / Assurance"), "Resume B — Privacy");
  assert.equal(workArrangementFromLocation("Chicago, IL (Hybrid)"), "Hybrid");
  assert.equal(workArrangementFromLocation("Chicago, IL"), null);
});

test("derives source and requisition only from explicit posting identifiers", () => {
  const url = "https://job-boards.greenhouse.io/acme/jobs/7711359003";
  assert.equal(sourceFromPostingUrl(url), "Greenhouse");
  assert.equal(sourceFromPostingUrl("https://acme.example/careers/?gh_jid=123"), "Greenhouse");
  assert.equal(sourceFromPostingUrl("https://www.builtinchicago.org/job/privacy-analyst/123"), "Built In Chicago");
  assert.equal(requisitionFromPosting(url), "7711359003");
  assert.equal(requisitionFromPosting("https://example.com/careers/privacy", "Requisition: ABC-123"), "ABC-123");
  assert.equal(requisitionFromPosting("https://example.com/careers/privacy"), null);
});

test("recognizes Built In work-arrangement spellings", () => {
  assert.equal(workArrangementFromLocation("In-Office · Chicago, IL"), "Onsite");
  assert.equal(workArrangementFromLocation("Remote or Hybrid · United States"), "Hybrid");
});

test("normalizes opportunity identity without merging different roles", () => {
  assert.equal(
    normalizeOpportunityUrl("HTTPS://EXAMPLE.COM/jobs/1/#details"),
    "https://example.com/jobs/1",
  );
  assert.equal(opportunityRoleKey("Acme, Inc.", "Senior Privacy Manager"), "acme inc\u0000senior privacy manager");
});

test("canonical identity preserves distinct requisitions with the same company and title", () => {
  const first = { company: "Acme", role: "GRC Analyst", url: "https://job-boards.greenhouse.io/acme/jobs/1001" };
  const second = { company: "Acme", role: "GRC Analyst", url: "https://job-boards.greenhouse.io/acme/jobs/1002" };
  assert.equal(opportunityIdentityMatches(first, second), false);
  assert.equal(opportunityIdentityMatches(first, { ...first, url: "https://acme.example/careers?gh_jid=1001" }), true);
  assert.equal(opportunityIdentityMatches({ company: "Acme", role: "GRC Analyst", url: "" }, second), false, 'an unkeyed legacy record cannot claim a specific requisition');
  assert.equal(opportunityIdentityMatches(
    { company: "Acme", role: "GRC Analyst", url: "", notes: "Requisition: REQ-1001" },
    { company: "Acme", role: "GRC Analyst", url: "", notes: "Requisition: REQ-1002" },
  ), false);
});

test("queue ordering is stable and band-authoritative", () => {
  const jobs = [
    { company: "Zeta", role: "GRC", url: "https://z.test/1", priorityBand: "LOW", priorityScore: 99 },
    { company: "Beta", role: "Privacy", url: "https://b.test/1", priorityBand: "HIGH", priorityScore: 80 },
    { company: "Acme", role: "Privacy", url: "https://a.test/1", priorityBand: "HIGH", priorityScore: 80 },
    { company: "Mid", role: "Risk", url: "https://m.test/1", priorityBand: "MEDIUM", priorityScore: 90 },
  ];
  assert.deepEqual([...jobs].sort(compareOpportunityPriority).map((job) => job.company), ["Acme", "Beta", "Mid", "Zeta"]);
  assert.deepEqual([...jobs].sort(compareOpportunityPriority), [...jobs].sort(compareOpportunityPriority));
});

test("incomplete or vetoed evidence cannot inherit a high-confidence report verdict", () => {
  assert.equal(confidenceSafeRecommendation("APPLY — PRIORITY", "REVIEW"), "REVIEW");
  assert.equal(confidenceSafeRecommendation("APPLY — PRIORITY", "REJECT"), "REJECT");
  assert.equal(confidenceSafeRecommendation("APPLY — PRIORITY", "STRONG"), "APPLY — PRIORITY");
});

test("accepts only complete credential-free HTTP(S) posting URLs", () => {
  assert.equal(isSafeWebUrl("https://example.com/jobs/1"), true);
  assert.equal(isSafeWebUrl("http://jobs.example.test/role?id=7"), true);
  assert.equal(isSafeWebUrl("https://"), false);
  assert.equal(isSafeWebUrl("javascript:alert(1)"), false);
  assert.equal(isSafeWebUrl("file:///etc/passwd"), false);
  assert.equal(isSafeWebUrl("https://user:secret@example.com/jobs/1"), false);
});

test("handoff is stateless, complete, and labels missing data honestly", () => {
  const handoff = composeHandoff({
    company: "Acme",
    role: "Privacy Manager",
    url: "https://example.com/jobs/1",
    source: "Greenhouse",
    location: "Remote — United States",
    liveness: "ACTIVE",
    whyItFits: "Privacy controls",
    jd: null,
  });
  for (const label of [
    "CAREER OPS JOB HANDOFF", "Company:", "Role:", "Requisition:", "Canonical posting URL:", "Provider:", "Location:",
    "Work arrangement:", "Posting status:", "Recommendation:", "Career lane:",
    "Seniority classification:", "Recommended resume:", "WHY THIS ROLE WAS SURFACED",
    "MATERIAL GAPS", "ELIGIBILITY", "JOB DESCRIPTION", "SOURCE INFORMATION",
  ]) assert.match(handoff, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(handoff, /Requisition: Not captured/);
  assert.match(handoff, /Status: MISSING\nWARNING:/);
  assert.match(composeHandoff({ role: "Privacy Analyst", jd: "Listing summary only.", jdQuality: "PARTIAL" }), /Status: PARTIAL\nWARNING:/);
});

test("canonical tracker staging uses the existing schema and an Evaluated pre-transition state", () => {
  const skeleton = trackerSkeleton();
  assert.match(skeleton, /\| # \| Date \| Company \| Role \| Location \| Score \| Status/);
  const tsv = trackerAdditionTsv({
    num: 1,
    date: "2026-10-03",
    company: "Acme",
    role: "Privacy Manager",
    location: "Chicago, IL",
    notes: "manual submission confirmed; source: Greenhouse",
    url: "https://example.com/jobs/1",
  });
  const [header, row] = tsv.trim().split("\n").map((line) => line.split("\t"));
  const cells = Object.fromEntries(header.map((key, index) => [key, row[index]]));
  assert.equal(cells.status, "Evaluated");
  assert.equal(cells.score, "N/A");
  assert.equal(cells.report, "—");
  assert.equal(cells.url, "https://example.com/jobs/1");
});

test("tracker reader exposes existing optional Location and URL columns", () => {
  const md = [
    "# Applications Tracker",
    "",
    "| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes | URL |",
    "|---|------|---------|------|----------|-------|--------|-----|--------|-------|-----|",
    "| 7 | 2026-10-03 | Acme | Privacy Manager | Chicago, IL | N/A | Applied | ❌ | — | source: Greenhouse | https://example.com/jobs/1 |",
  ].join("\n");
  const [row] = parseApplications(md, ROOT);
  assert.equal(row.location, "Chicago, IL");
  assert.equal(row.url, "https://example.com/jobs/1");
  assert.equal(row.status, "Applied");
});

test("canonical merge then status transition creates one Applied tracker row and seeds follow-up", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-lite-test-"));
  const tracker = path.join(workspace, "data", "applications.md");
  const additions = path.join(workspace, "batch", "tracker-additions");
  fs.mkdirSync(path.dirname(tracker), { recursive: true });
  fs.mkdirSync(additions, { recursive: true });
  fs.writeFileSync(tracker, trackerSkeleton(), "utf8");
  fs.writeFileSync(path.join(additions, "001-acme.tsv"), trackerAdditionTsv({
    num: 1,
    date: "2026-10-03",
    company: "Acme",
    role: "Privacy Manager",
    location: "Chicago, IL",
    notes: "manual submission confirmed 2026-10-03; source: Greenhouse",
    url: "https://example.com/jobs/1",
  }), "utf8");

  const env = {
    ...process.env,
    CAREER_OPS_ROOT: workspace,
    CAREER_OPS_TRACKER: tracker,
    CAREER_OPS_ADDITIONS: additions,
    CAREER_OPS_BATCH_STATE: path.join(workspace, "batch", "batch-state.tsv"),
  };
  try {
    execFileSync(process.execPath, [path.join(ROOT, "merge-tracker.mjs")], { cwd: ROOT, env, stdio: "pipe" });
    assert.equal(parseApplications(fs.readFileSync(tracker, "utf8"), ROOT)[0].status, "Evaluated");

    execFileSync(process.execPath, [
      path.join(ROOT, "set-status.mjs"),
      "--row", "1", "Applied", "--source", "web", "--on", "2026-10-03", "--json",
    ], { cwd: ROOT, env, stdio: "pipe" });

    const [application] = parseApplications(fs.readFileSync(tracker, "utf8"), ROOT);
    assert.equal(application.status, "Applied");
    assert.equal(application.score, "N/A");
    assert.equal(application.url, "https://example.com/jobs/1");
    assert.match(fs.readFileSync(path.join(workspace, "data", "status-log.tsv"), "utf8"), /\tEvaluated\tApplied\tweb\t/);
    assert.match(fs.readFileSync(path.join(workspace, "data", "follow-ups.md"), "utf8"), /next #1 2026-10-10/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
