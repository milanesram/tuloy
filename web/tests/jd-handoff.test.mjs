import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import builtin, { parseDetailPage } from "../../providers/builtin.mjs";
import ashby from "../../providers/ashby.mjs";
import greenhouse from "../../providers/greenhouse.mjs";
import lever from "../../providers/lever.mjs";
import { appendToPipeline } from "../../scan.mjs";
import { readJdArchive } from "../src/lib/jd-archive.mjs";
import { classifyLiteOpportunity } from "../src/lib/lite-recommendation.mjs";
import { composeHandoff, trackerSkeleton } from "../src/lib/ops.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const fixture = (name) => fs.readFileSync(path.join(ROOT, "tests", "fixtures", name), "utf8");

// Exercise the real /ops projection using the same TypeScript/alias hook
// already used by the web planner tests, rather than rebuilding the projection.
const { registerHooks } = await import("node:module");
const canImportTs = Boolean(process.features?.typescript) && typeof registerHooks === "function";
if (canImportTs) registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(ROOT, "web/src", specifier.slice(2));
      const resolved = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`].find((file) => fs.existsSync(file));
      return nextResolve(pathToFileURL(resolved ?? base).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    return nextLoad(url, url.endsWith(".ts") ? { ...context, format: "module-typescript" } : context);
  },
});
const { opsSummary } = canImportTs ? await import("../src/lib/career-ops.ts") : {};
const { POST: recordApplied } = canImportTs ? await import("../src/app/api/ops/track/route.ts") : {};
const { addOffersToPipeline } = canImportTs ? await import("../src/lib/core/pipeline.ts") : {};

async function withOpsWorkspace(run) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-rc-ops-"));
  const previousRoot = process.env.CAREER_OPS_ROOT;
  const previousTracker = process.env.CAREER_OPS_TRACKER;
  const previousCwd = process.cwd();
  try {
    fs.copyFileSync(path.join(ROOT, "tracker-aliases.json"), path.join(workspace, "tracker-aliases.json"));
    process.env.CAREER_OPS_ROOT = workspace;
    process.env.CAREER_OPS_TRACKER = path.join(workspace, "data/applications.md");
    process.chdir(path.join(ROOT, "web"));
    await run(workspace);
  } finally {
    process.chdir(previousCwd);
    if (previousRoot === undefined) delete process.env.CAREER_OPS_ROOT;
    else process.env.CAREER_OPS_ROOT = previousRoot;
    if (previousTracker === undefined) delete process.env.CAREER_OPS_TRACKER;
    else process.env.CAREER_OPS_TRACKER = previousTracker;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

test("Greenhouse and split Lever bodies survive the real /ops projection and copied handoff", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    const greenhouseBody = "Risk assessments, controls testing and remediation. ".repeat(110) + "FINAL GREENHOUSE REQUIREMENT";
    const [gh] = await greenhouse.fetch({ name: "Acme", careers_url: "https://job-boards.greenhouse.io/acme" }, {
      fetchJson: async () => ({ jobs: [{ id: 1001, title: "Cybersecurity Risk Analyst", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1001", location: { name: "Chicago, IL" }, content: `<p>${greenhouseBody}</p>` }] }),
    });
    const [lv] = await lever.fetch({ name: "Acme", careers_url: "https://jobs.lever.co/acme" }, {
      fetchJson: async () => [{ id: "lever-1", text: "Privacy Specialist", hostedUrl: "https://jobs.lever.co/acme/lever-1", categories: { location: "Chicago, IL" }, descriptionPlain: "Privacy program overview.", lists: [{ text: "Requirements", content: `<ul><li>${"Perform privacy impact assessments and controls testing. ".repeat(90)}LAST LIST REQUIREMENT</li></ul>` }], additionalPlain: "FINAL LEVER CLOSING CONDITION", salaryDescriptionPlain: "Advertised salary condition" }],
    });
    assert.ok(gh.description.length > 4000);
    assert.ok(lv.description.length > 4000);
    await appendToPipeline([{ ...gh, source: "greenhouse-api" }, { ...lv, source: "lever-api" }], { pipelinePath: path.join(workspace, "data/pipeline.md"), jdsDir: path.join(workspace, "jds") });
    const first = opsSummary();
    assert.equal(first.queue.length, 2);
    assert.deepEqual(first, opsSummary());
    for (const source of [gh, lv]) {
      const projected = first.queue.find((job) => job.url === source.url);
      assert.equal(projected.jdQuality, "COMPLETE");
      assert.equal(projected.jd, source.description);
      assert.ok(composeHandoff(projected).includes(source.description));
    }
    const leverProjected = first.queue.find((job) => job.url === lv.url);
    assert.match(leverProjected.jd, /Requirements[\s\S]*LAST LIST REQUIREMENT[\s\S]*FINAL LEVER CLOSING CONDITION[\s\S]*Advertised salary condition/);
  });
});

test("legacy report gaps cannot hide newly established material requirements", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    fs.mkdirSync(path.join(workspace, "data"));
    fs.mkdirSync(path.join(workspace, "reports"));
    const url = "https://jobs.lever.co/acme/technology-1";
    const jd = "Perform privacy impact assessments and operate privacy controls. Required Qualifications: 5+ years production software engineering experience. Must build production systems.";
    const report = `**URL:** ${url}\n\n## Machine Summary\n\n\`\`\`yaml\nsoft_gaps:\n  - No gaps previously recorded\n\`\`\`\n\n## Job Description (archived verbatim)\n${jd}\n`;
    const tracker = trackerSkeleton() + `| 1 | 2026-10-03 | Acme | Privacy Technologist | Chicago, IL | N/A | Applied | ❌ | [Report](reports/001-acme-2026-10-03.md) | historical fixture | ${url} |\n`;
    fs.writeFileSync(path.join(workspace, "data/applications.md"), tracker);
    fs.writeFileSync(path.join(workspace, "reports/001-acme-2026-10-03.md"), report);
    const [job] = opsSummary().tracked;
    assert.equal(job.jd, jd);
    assert.equal(job.jdQuality, "COMPLETE");
    assert.match(job.materialGaps, /production engineering|production software/i);
    assert.match(job.materialGaps, /Prior captured analysis:\nNo gaps previously recorded/);
    assert.match(composeHandoff(job), /production engineering|production software/i);
    assert.equal(fs.readFileSync(path.join(workspace, "data/applications.md"), "utf8"), tracker);
    assert.equal(fs.readFileSync(path.join(workspace, "reports/001-acme-2026-10-03.md"), "utf8"), report);
  });
});

test("real /ops keeps separate requisitions and caps unavailable archive confidence", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    fs.mkdirSync(path.join(workspace, "data"), { recursive: true });
    const firstUrl = "https://job-boards.greenhouse.io/acme/jobs/1001";
    const secondUrl = "https://job-boards.greenhouse.io/acme/jobs/1002";
    const row = "| 1 | 2026-10-03 | Acme | GRC Analyst | Chicago, IL | N/A | Applied | ❌ | — | fixture | " + firstUrl + " |\n";
    fs.writeFileSync(path.join(workspace, "data/applications.md"), trackerSkeleton() + row);
    fs.writeFileSync(path.join(workspace, "data/pipeline.md"), `# Pipeline\n\n## Pending\n- [ ] ${firstUrl} | Acme | GRC Analyst | Chicago, IL\n- [ ] ${secondUrl} | Acme | GRC Analyst | Chicago, IL | jd: jds/missing.md | jd_status: COMPLETE\n`);
    const result = opsSummary();
    assert.equal(result.queue.length, 1);
    assert.equal(result.queue[0].url, secondUrl);
    assert.equal(result.queue[0].trackerId, null);
    assert.equal(result.queue[0].jdQuality, "ARCHIVE_UNAVAILABLE");
    assert.equal(result.queue[0].gate, "REVIEW");
    assert.notEqual(result.queue[0].priorityBand, "HIGH");
    assert.match(composeHandoff(result.queue[0]), /Status: ARCHIVE_UNAVAILABLE\nWARNING:/);
    assert.equal(result.tracked[0].url, firstUrl);
  });
});

test("real /ops does not upgrade an explicitly partial archive merely because it contains text", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    fs.mkdirSync(path.join(workspace, "data"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "jds"));
    fs.writeFileSync(path.join(workspace, "jds/partial.md"), "Privacy impact assessments and controls testing. Summary only.");
    fs.writeFileSync(path.join(workspace, "data/pipeline.md"), "# Pipeline\n\n## Pending\n- [ ] https://jobs.lever.co/acme/partial | Acme | Privacy Analyst | Chicago, IL | jd: jds/partial.md | jd_status: PARTIAL\n");
    const [job] = opsSummary().queue;
    assert.equal(job.jdQuality, "PARTIAL");
    assert.equal(job.gate, "REVIEW");
    assert.notEqual(job.priorityBand, "HIGH");
    assert.match(composeHandoff(job), /Status: PARTIAL\nWARNING:/);
    assert.match(composeHandoff(job), /Summary only\./);
  });
});

test("employer provenance survives archive and /ops while a conflicting legacy tracker fallback is blocked", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    const url = "https://job-boards.greenhouse.io/acme/jobs/101";
    const sourceUrl = "https://www.builtinchicago.org/job/grc/901";
    await appendToPipeline([{ url, sourceUrl, sourceId: "101", company: "Acme Regional Subsidiary", title: "GRC Analyst", location: "Chicago, IL",
      sourceProvider: "builtin", sourcePublisher: "Built In", companySource: "aggregator-card",
      employerIdentityEvidence: [{ kind: "CANONICAL_EMPLOYER", value: "Acme", url }],
      description: "Perform risk assessments, controls testing, remediation and audit readiness.", descriptionComplete: true }],
    { pipelinePath: path.join(workspace, "data/pipeline.md"), jdsDir: path.join(workspace, "jds") });
    const tracker = path.join(workspace, "data/applications.md");
    const before = trackerSkeleton() + "| 1 | 2026-10-03 | Acme Regional Subsidiary | GRC Analyst | Chicago, IL | N/A | Applied | ❌ | — | legacy row |  |\n";
    fs.writeFileSync(tracker, before);
    const result = opsSummary();
    assert.deepEqual(result, opsSummary());
    const [job] = result.queue;
    assert.equal(job.company, "Acme Regional Subsidiary");
    assert.equal(job.employerIdentityStatus, "CONFLICT");
    assert.equal(job.employerIdentityName, "Acme");
    assert.equal(job.discoveredUrl, sourceUrl);
    assert.equal(job.url, url);
    assert.equal(job.sourceId, "101");
    assert.equal(job.source, "Built In Chicago", "canonical ATS URL must not replace the discovery publisher");
    assert.equal(job.trackerId, null);
    assert.equal(job.recommendationClass, "REVIEW");
    assert.notEqual(job.priorityBand, "HIGH");
    assert.ok(composeHandoff(job).includes(job.jd));
    const response = await recordApplied(new Request("http://localhost/api/ops/track", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedSubmitted: true, company: job.company, role: job.role, url }) }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /employer identity conflict/);
    assert.equal(fs.readFileSync(tracker, "utf8"), before);
    assert.equal(fs.existsSync(path.join(workspace, "data/status-log.tsv")), false);
  });
});

test('new JD employer conflict blocks even an exact-URL Evaluated row before status mutation', { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async workspace => {
    const url='https://www.builtinchicago.org/job/grc/901';
    await appendToPipeline([{url,sourceUrl:url,sourceId:'901',company:'Acquired Brand',title:'GRC Analyst',location:'Chicago, IL',sourceProvider:'builtin',companySource:'aggregator-card',
      description:'Why Assurance at Parent Group? The Assurance function at Parent Group is growing. Perform risk assessments, controls testing and remediation.',descriptionComplete:true}],
      {pipelinePath:path.join(workspace,'data/pipeline.md'),jdsDir:path.join(workspace,'jds')});
    const file=path.join(workspace,'data/applications.md');
    const before=trackerSkeleton()+`| 1 | 2026-10-03 | Acquired Brand | GRC Analyst | Chicago, IL | N/A | Evaluated | ❌ | — | existing exact URL | ${url} |\n`;
    fs.writeFileSync(file,before);
    assert.equal(opsSummary().queue[0].employerIdentityStatus,'CONFLICT');
    assert.equal(opsSummary().queue[0].trackerId,null);
    const response=await recordApplied(new Request('http://localhost/api/ops/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmedSubmitted:true,company:'Acquired Brand',role:'GRC Analyst',url})}));
    assert.equal(response.status,409);assert.equal(fs.readFileSync(file,'utf8'),before);
    for(const name of ['status-log.tsv','follow-ups.md','active-interviews.md'])assert.equal(fs.existsSync(path.join(workspace,'data',name)),false);
  });
});

test('ambiguous publisher label cannot silently attach or create against an unkeyed legacy application', { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async workspace => {
    const url='https://www.builtinchicago.org/job/grc/902';
    await appendToPipeline([{url,sourceUrl:url,sourceId:'902',company:'Unconfirmed Brand',title:'GRC Analyst',location:'Chicago, IL',sourceProvider:'builtin',companySource:'aggregator-card',
      description:'Perform risk assessments, controls testing and remediation.',descriptionComplete:true}],{pipelinePath:path.join(workspace,'data/pipeline.md'),jdsDir:path.join(workspace,'jds')});
    const file=path.join(workspace,'data/applications.md');
    const before=trackerSkeleton()+'| 1 | 2026-10-03 | Unconfirmed Brand | GRC Analyst | Chicago, IL | N/A | Evaluated | ❌ | — | legacy without source ID |  |\n';
    fs.writeFileSync(file,before);assert.equal(opsSummary().queue[0].trackerId,null);
    const response=await recordApplied(new Request('http://localhost/api/ops/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmedSubmitted:true,company:'Unconfirmed Brand',role:'GRC Analyst',url})}));
    assert.equal(response.status,409);assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(fs.existsSync(path.join(workspace,'data/status-log.tsv')),false);
  });
});

test("Explore Add-to-pipeline keeps provenance through the canonical child-process writer", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    fs.symlinkSync(path.join(ROOT, "scan.mjs"), path.join(workspace, "scan.mjs"));
    fs.mkdirSync(path.join(workspace, "lib"));
    fs.symlinkSync(path.join(ROOT, "lib/local-today.mjs"), path.join(workspace, "lib/local-today.mjs"));
    const url = "https://jobs.ashbyhq.com/acme/job-1";
    const result = await addOffersToPipeline([{ url, title: "Privacy Analyst", company: "Wrong Source Employer", source: "builtin-full",
      sourceUrl: "https://www.builtinchicago.org/job/privacy/901", sourceId: "job-1", location: "Chicago, IL", ats: "builtin", postedAt: "",
      companySource: "aggregator-label", sourceProvider: "builtin", sourcePublisher: "Built In",
      employerIdentityEvidence: [{ kind: "CANONICAL_EMPLOYER", value: "Acme", url }],
      description: "Perform privacy impact assessments, controls testing and remediation.", descriptionComplete: true }]);
    assert.equal(result.added, 1);
    const [job] = opsSummary().queue;
    assert.equal(job.employerIdentityStatus, "CONFLICT");
    assert.equal(job.sourceId, "job-1");
    assert.equal(job.sourcePublisher, "Built In");
    assert.equal(job.jdQuality, "COMPLETE");
    assert.equal(fs.existsSync(path.join(workspace, "data/applications.md")), false);
  });
});

test("legacy archived employer conflict is resolved before an unkeyed tracker can claim the posting", { skip: !canImportTs }, async () => {
  await withOpsWorkspace(async (workspace) => {
    fs.mkdirSync(path.join(workspace, "data"));
    fs.mkdirSync(path.join(workspace, "jds"));
    fs.writeFileSync(path.join(workspace, "jds/legacy.md"), "About Us At Acme, we deliver technology services. Perform risk assessments and controls testing.");
    fs.writeFileSync(path.join(workspace, "data/pipeline.md"), "# Pipeline\n\n## Pending\n- [ ] https://www.builtinchicago.org/job/grc/901 | Acme Gibraltar | GRC Analyst | Chicago, IL | jd: jds/legacy.md\n");
    fs.writeFileSync(path.join(workspace, "data/applications.md"), trackerSkeleton() + "| 1 | 2026-10-03 | Acme Gibraltar | GRC Analyst | Chicago, IL | N/A | Applied | ❌ | — | legacy |  |\n");
    const [job] = opsSummary().queue;
    assert.equal(job.employerIdentityStatus, "CONFLICT");
    assert.equal(job.trackerId, null);
    assert.equal(job.company, "Acme Gibraltar");
    assert.equal(job.gate, "REVIEW");
    assert.notEqual(job.priorityBand, "HIGH");
  });
});

function pointerFromPipeline(md) {
  return md.match(/\|\s*jd:\s*(jds\/[A-Za-z0-9._-]+)/)?.[1] ?? null;
}

test("Built In complete JD survives provider → pipeline → archive → Ops handoff", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-jd-handoff-"));
  try {
    const pipelinePath = path.join(workspace, "data", "pipeline.md");
    const jdsDir = path.join(workspace, "jds");
    fs.mkdirSync(path.dirname(pipelinePath), { recursive: true });
    fs.writeFileSync(pipelinePath, "# Pipeline\n\n## Pending\n\n## Processed\n", "utf8");
    const offer = parseDetailPage(
      fixture("builtin-chicago-detail.html"),
      "https://www.builtinchicago.org/job/privacy-grc-analyst/12345",
      Date.parse("2026-10-03T00:00:00Z"),
    );
    assert.equal(offer.descriptionComplete, true);
    await appendToPipeline([{ ...offer, source: "builtin-full" }], { pipelinePath, jdsDir });

    const pointer = pointerFromPipeline(fs.readFileSync(pipelinePath, "utf8"));
    assert.ok(pointer, "canonical pipeline row must carry the jds/ pointer");
    const archived = readJdArchive(workspace, pointer);
    assert.equal(archived.captured, true);
    assert.equal(archived.text, offer.description);

    const triage = classifyLiteOpportunity({
      title: offer.title,
      jd: archived.text,
      location: offer.location,
      liveness: offer.liveness,
    });
    const handoff = composeHandoff({
      company: offer.company,
      role: offer.title,
      url: offer.url,
      source: "Built In Chicago",
      location: offer.location,
      workArrangement: offer.workArrangement,
      liveness: offer.liveness,
      ...triage,
      jd: archived.text,
    });
    assert.match(handoff, /JOB DESCRIPTION\nStatus: COMPLETE\n\nOverview/);
    assert.match(handoff, /Responsibilities/);
    assert.match(handoff, /Career lane: A/);
    assert.match(handoff, /competing route B/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("Ashby public descriptionPlain is complete and reaches the same canonical archive", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-ashby-jd-"));
  try {
    const description = "Complete Ashby public JD. " + "Own GRC controls, risk assessments, remediation governance, and audit readiness. ".repeat(8);
    const [offer] = await ashby.fetch(
      { name: "Acme", careers_url: "https://jobs.ashbyhq.com/acme" },
      { fetchJson: async () => ({ jobs: [{ id: "job-1", title: "GRC Analyst", jobUrl: "https://jobs.ashbyhq.com/acme/job-1", location: "Remote", descriptionPlain: description, publishedAt: "2026-10-01" }] }) },
    );
    assert.equal(offer.descriptionComplete, true);
    const pipelinePath = path.join(workspace, "data", "pipeline.md");
    const jdsDir = path.join(workspace, "jds");
    await appendToPipeline([{ ...offer, source: "ashby-full" }], { pipelinePath, jdsDir });
    const pointer = pointerFromPipeline(fs.readFileSync(pipelinePath, "utf8"));
    assert.ok(pointer);
    assert.equal(readJdArchive(workspace, pointer).text, description.trim());
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("missing or summary-only JD stays missing and is never mislabeled complete", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-summary-only-"));
  try {
    const pipelinePath = path.join(workspace, "data", "pipeline.md");
    await appendToPipeline([{
      url: "https://example.test/jobs/1",
      company: "Acme",
      title: "Privacy Analyst",
      description: "Short listing summary only.",
      descriptionComplete: false,
      source: "fixture",
    }], { pipelinePath, jdsDir: path.join(workspace, "jds") });
    assert.equal(pointerFromPipeline(fs.readFileSync(pipelinePath, "utf8")), null);
    assert.match(composeHandoff({ company: "Acme", role: "Privacy Analyst", jd: null }), /JOB DESCRIPTION\nStatus: MISSING\nWARNING:/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("JD archive resolver rejects traversal and symlink escapes", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-jd-guard-"));
  try {
    fs.mkdirSync(path.join(workspace, "jds"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "outside.md"), "secret", "utf8");
    assert.deepEqual(readJdArchive(workspace, "jds/../outside.md"), { text: null, captured: false });
    fs.symlinkSync(path.join(workspace, "outside.md"), path.join(workspace, "jds", "escape.md"));
    assert.deepEqual(readJdArchive(workspace, "jds/escape.md"), { text: null, captured: false });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("Built In provider still exposes deferred public detail enrichment", () => {
  assert.equal(typeof builtin.enrichDetail, "function");
});
