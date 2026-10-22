import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLiteOpportunity, seniorityBandFromTitle } from "../src/lib/lite-recommendation.mjs";

const live = (title, jd, extra = {}) => classifyLiteOpportunity({
  title,
  jd,
  location: "Chicago, IL · Hybrid",
  liveness: "LIVE",
  ...extra,
});

test("AI Governance Experienced Associate maps to route A without forced bridge certainty", () => {
  const result = live(
    "AI Governance Experienced Associate",
    "Support AI governance, regulatory compliance, controls, NIST and ISO frameworks for clients.",
  );
  assert.equal(result.careerLane, "Applied AI Governance overlay");
  assert.equal(result.seniorityBand, "BRIDGE");
  assert.equal(result.seniorityClassification, "UNCLEAR");
  assert.equal(result.recommendedResume, "Resume A — GRC / Information Security Risk");
  assert.equal(result.recommendationClass, "REVIEW");
  assert.match(result.whyItFits, /AI governance/);
  assert.match(result.whyItFits, /NIST \/ ISO/);
});

test("GRC Analyst maps to the GRC lane, bridge, and Resume A", () => {
  const result = live("GRC Analyst", "Perform risk assessments, controls testing, security compliance, and audit readiness.");
  assert.equal(result.careerLane, "GRC / IT Risk / Security Compliance");
  assert.equal(result.seniorityBand, "BRIDGE");
  assert.equal(result.bridgeStatus, "US_MARKET_BRIDGE");
  assert.equal(result.recommendedResume, "Resume A — GRC / Information Security Risk");
  assert.equal(result.recommendationClass, "BRIDGE");
});

test("GRC Engineer with primary production-software duties is excluded, not rescued by its domain title", () => {
  const result = live(
    "GRC Engineer",
    "Write production software and Python services. Build Kubernetes infrastructure with Terraform and CI/CD. Develop application code.",
  );
  assert.equal(result.careerLane, "GRC / IT Risk / Security Compliance");
  assert.equal(result.seniorityBand, "CORE");
  assert.equal(result.gate, "FAIL");
  assert.equal(result.recommendationClass, "REJECT");
  assert.equal(result.priorityBand, "LOW");
  assert.match(result.materialGaps, /engineering-heavy responsibilities/);
});

test("AI Governance Manager is experience-aligned when duties support it", () => {
  const result = live("AI Governance Manager", "Lead responsible AI governance, controls, and regulatory compliance.");
  assert.equal(result.seniorityBand, "SCOPE REVIEW");
  assert.equal(result.seniorityClassification, "EXPERIENCE_ALIGNED");
  assert.equal(result.recommendationClass, "STRONG");
});

test("AI Governance Director title alone cannot establish excessive scope", () => {
  const result = live("AI Governance Director", "Lead AI governance, risk, controls, and assurance.");
  assert.equal(result.seniorityBand, "SCOPE REVIEW");
  assert.equal(result.seniorityClassification, "EXPERIENCE_ALIGNED");
  assert.equal(result.recommendationClass, "STRONG");
  assert.match(result.seniorityReasons.join(' '), /title alone is not a veto/);
});

test("privacy role maps to Privacy lane and Resume B", () => {
  const result = live("Privacy Compliance Specialist", "Operate privacy assessments, data protection controls, and privacy by design.");
  assert.equal(result.careerLane, "Privacy / Compliance / Assurance");
  assert.equal(result.seniorityBand, "BRIDGE");
  assert.equal(result.recommendedResume, "Resume B — Privacy");
});

test("IT Risk / Security Compliance role maps to GRC and Resume A", () => {
  const result = live("Senior IT Risk and Security Compliance Analyst", "Own technology risk, SOC 2 controls, remediation, and ISO 27001 audit readiness.");
  assert.equal(result.careerLane, "GRC / IT Risk / Security Compliance");
  assert.equal(result.seniorityBand, "CORE");
  assert.equal(result.recommendedResume, "Resume A — GRC / Information Security Risk");
});

test("missing JD uses only title evidence and surfaces uncertainty", () => {
  const result = classifyLiteOpportunity({ title: "GRC Engineer", jd: null, location: "Remote", liveness: "UNCLEAR" });
  assert.equal(result.recommendationClass, "REVIEW");
  assert.equal(result.gate, "REVIEW");
  assert.equal(result.whyItFits, "• GRC / technology risk");
  assert.match(result.materialGaps, /JD unavailable/);
  assert.match(result.materialGaps, /technical title — duties need verification/);
  assert.match(result.materialGaps, /posting status unconfirmed/);
  assert.doesNotMatch(result.whyItFits, /controls|audit|NIST|ISO/i);
});

test("sponsorship restrictions are surfaced without deciding personal eligibility", () => {
  const result = live("Privacy Analyst", "Support privacy compliance. The company does not sponsor employment visas.");
  assert.match(result.materialGaps, /sponsorship restriction present/i);
});

test("PwC-style indirect sponsorship and AI validation requirements are surfaced", () => {
  const result = live(
    "AI Governance Experienced Associate",
    "Applying experience in AI/ML governance, risk, controls, audit, testing, and validation. PwC does not intend to hire experienced or entry level job seekers who will need, now or in the future, PwC sponsorship through the H-1B lottery.",
  );
  assert.match(result.materialGaps, /direct AI validation depth requested/i);
  assert.match(result.materialGaps, /sponsorship restriction present/i);
});

test("seniority title helper keeps manager and high leadership distinct", () => {
  assert.equal(seniorityBandFromTitle("Technology Risk Manager"), "SCOPE REVIEW");
  assert.equal(seniorityBandFromTitle("Director, Privacy"), "SCOPE REVIEW");
});
