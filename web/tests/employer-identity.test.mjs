import { test } from 'node:test';
import assert from 'node:assert/strict';
import builtin from '../../providers/builtin.mjs';
import { resolveEmployerIdentity, encodeEmployerIdentity, decodeEmployerIdentity, employerNamesFromJd } from '../src/lib/employer-identity.mjs';
import { classifyLiteOpportunity } from '../src/lib/lite-recommendation.mjs';
import { composeHandoff, opportunityIdentityMatches } from '../src/lib/ops.mjs';

const canonical = 'https://job-boards.greenhouse.io/acme/jobs/101';
const common = { company: 'Acme', title: 'GRC Analyst', role: 'GRC Analyst', url: canonical,
  sourceUrl: 'https://www.builtinchicago.org/job/grc/901', sourceProvider: 'builtin', sourcePublisher: 'Built In',
  jd: 'Perform risk assessments, controls testing, remediation, audit readiness and third-party risk.', jdQuality: 'COMPLETE',
  postingStatus: 'ACTIVE', candidateLocation: 'Chicago, IL', location: 'Chicago, IL' };
const canonicalEvidence = { kind: 'CANONICAL_EMPLOYER', value: 'Acme', url: canonical };

test('canonical employer evidence is distinct from a differently named publisher', () => {
  const input = { ...common, sourcePublisher: 'A differently named publishing platform', employerIdentityEvidence: [canonicalEvidence] };
  const result = resolveEmployerIdentity(input);
  assert.equal(result.employerIdentityStatus, 'CONFIRMED');
  assert.equal(result.employerIdentityName, 'Acme');
  assert.equal(result.sourcePublisher, input.sourcePublisher);
  assert.equal(classifyLiteOpportunity(input).gate, 'PASS');
  assert.equal(classifyLiteOpportunity(input).priorityBand, 'HIGH');
  assert.equal(opportunityIdentityMatches(input, { company: 'Old publisher label', role: input.role, url: canonical }), true);
});

test('aggregator employer disagreement is preserved and cannot obtain HIGH/PRIORITY', () => {
  const input = { ...common, company: 'Acme Regional Subsidiary', employerIdentityEvidence: [canonicalEvidence] };
  const identity = resolveEmployerIdentity(input);
  assert.equal(input.company, 'Acme Regional Subsidiary');
  assert.equal(identity.employerIdentityStatus, 'CONFLICT');
  assert.equal(identity.employerIdentityName, 'Acme');
  assert.equal(identity.employerIdentityConfidence, 'LOW');
  const result = classifyLiteOpportunity(input);
  assert.equal(result.gate, 'REVIEW');
  assert.equal(result.recommendationClass, 'REVIEW');
  assert.notEqual(result.priorityBand, 'HIGH');
  assert.match(result.gateReasons.join(' '), /EMPLOYER_IDENTITY_CONFLICT/);
  assert.deepEqual(result, classifyLiteOpportunity(input));
  const handoff = composeHandoff({ ...input, ...result, role: input.title, discoveredUrl: input.sourceUrl, source: 'Built In' });
  assert.match(handoff, /EMPLOYER IDENTITY\nStatus: CONFLICT/);
  assert.match(handoff, /Displayed employer: Acme Regional Subsidiary/);
  assert.match(handoff, /Captured employer evidence: Acme/);
  assert.match(handoff, /WARNING: Employer identity is unresolved/);
  assert.ok(handoff.includes(input.jd));
  assert.ok(handoff.includes(input.sourceUrl));
  assert.ok(handoff.includes(canonical));
});

test('incomplete employer evidence is ambiguous and reviewable without rejection', () => {
  const result = classifyLiteOpportunity(common);
  assert.equal(result.employerIdentityStatus, 'AMBIGUOUS');
  assert.equal(result.employerIdentityName, null);
  assert.equal(result.gate, 'REVIEW');
  assert.notEqual(result.recommendationClass, 'REJECT');
  assert.notEqual(result.priorityBand, 'HIGH');
  assert.equal(resolveEmployerIdentity({ company: 'Acme', url: canonical, companySource: 'aggregator-label' }).employerIdentityStatus, 'AMBIGUOUS', 'a canonical ATS URL alone cannot verify an aggregator label');
});

test('different legal employer names do not silently become a confirmed alias', () => {
  const result = resolveEmployerIdentity({ ...common, company: 'Acme LLC', employerIdentityEvidence: [{ ...canonicalEvidence, value: 'Acme Inc' }] });
  assert.equal(result.employerIdentityStatus, 'CONFLICT');
  assert.equal(resolveEmployerIdentity({ ...common, company: 'Acme, Inc.', employerIdentityEvidence: [{ ...canonicalEvidence, value: 'Acme Inc' }] }).employerIdentityStatus, 'CONFIRMED', 'cosmetic punctuation does not change the legal name');
});

test('identity uncertainty cannot override closed, geographic, or unrelated vetoes', () => {
  for (const patch of [{ postingStatus: 'CLOSED' }, { jd: `${common.jd} Role not available in Illinois.` }, { title: 'Software Engineer', jd: 'Write application code and build distributed systems in Java.' }]) {
    const result = classifyLiteOpportunity({ ...common, ...patch, company: 'Wrong employer', employerIdentityEvidence: [canonicalEvidence] });
    assert.equal(result.gate, 'FAIL');
    assert.equal(result.recommendationClass, 'REJECT');
    assert.equal(result.priorityBand, 'LOW');
  }
});

test('tracker matching keeps distinct requisitions and blocks unresolved company/title fallback', () => {
  const first = { company: 'Acme', role: 'GRC Analyst', url: canonical };
  assert.equal(opportunityIdentityMatches(first, { ...first, url: canonical.replace('101', '102') }), false);
  assert.equal(opportunityIdentityMatches({ ...first, notes: 'Requisition: OLD-999' }, { ...first, url: canonical.replace('101', '102'), notes: 'Requisition: OLD-999' }), false, 'canonical requisitions outrank stale note identifiers');
  const workday = { company: 'Acme', role: 'GRC Analyst', url: 'https://acme.wd1.myworkdayjobs.com/External/job/Chicago/Analyst_JR100', notes: 'Requisition: OLD-999' };
  assert.equal(opportunityIdentityMatches(workday, { ...workday, url: workday.url.replace('JR100', 'JR101') }), false, 'stale notes cannot bridge two different Workday posting URLs');
  const conflict = { ...first, employerIdentityStatus: 'CONFLICT', employerIdentityEvidence: [canonicalEvidence] };
  assert.equal(opportunityIdentityMatches(conflict, { ...first, url: '' }), false);
  assert.equal(opportunityIdentityMatches(conflict, first), false, 'unresolved employer conflicts require human resolution even for an exact URL; no status association is implied');
  const unresolvedFromEvidence = { ...first, company: 'Wrong employer', employerIdentityEvidence: [canonicalEvidence] };
  assert.equal(opportunityIdentityMatches(unresolvedFromEvidence, { ...unresolvedFromEvidence, url: '' }), false);
});

test('valid legacy records and consistent identities retain established qualification and association', () => {
  const legacy = { ...common, sourceUrl: undefined, sourceProvider: 'greenhouse', source: 'greenhouse', sourcePublisher: undefined };
  const base = classifyLiteOpportunity({ ...legacy, company: undefined });
  const current = classifyLiteOpportunity(legacy);
  assert.equal(current.employerIdentityStatus, 'CONSISTENT');
  for (const field of ['gate', 'recommendationClass', 'priorityBand', 'priorityScore', 'recommendedResumeCode']) assert.equal(current[field], base[field]);
  assert.equal(opportunityIdentityMatches(legacy, { company: 'Acme', role: legacy.role, url: '' }), false, 'employer consistency alone cannot prove which legacy requisition was submitted');
  assert.equal(opportunityIdentityMatches(legacy, { company: 'Acme', role: legacy.role, url: canonical }), true, 'legacy rows without source IDs still match their canonical URL');
  assert.equal(opportunityIdentityMatches({...legacy,url:''}, { company: 'Acme', role: legacy.role, url: '' }), true, 'wholly unkeyed legacy comparison remains compatible');
});

test('only explicit complete-JD employer identification counts; textual coincidence does not', () => {
  assert.deepEqual(employerNamesFromJd('Clients include Acme. Compare Beta tools and Gamma frameworks.'), []);
  assert.deepEqual(employerNamesFromJd('Employer: Acme Perform risk assessments and controls testing.'), [], 'collapsed paragraph boundaries are not a safe employer field');
  const jd = 'About Us At Acme, we build privacy services. Perform risk assessments and controls testing.';
  assert.equal(resolveEmployerIdentity({ ...common, jd }).employerIdentityStatus, 'CONFIRMED');
  assert.equal(resolveEmployerIdentity({ ...common, company: 'Acme Gibraltar', jd }).employerIdentityStatus, 'CONFLICT');
  assert.equal(resolveEmployerIdentity({ ...common, jd, jdQuality: 'PARTIAL' }).employerIdentityStatus, 'AMBIGUOUS');
});

test('pipeline provenance codec is deterministic, Unicode-safe, and fails unreadable metadata to review', () => {
  const identity = resolveEmployerIdentity({ ...common, company: 'Société Acme', employerIdentityEvidence: [{ ...canonicalEvidence, value: 'Société Acme' }] });
  const encoded = encodeEmployerIdentity(identity);
  assert.equal(encoded, encodeEmployerIdentity(identity));
  assert.equal(resolveEmployerIdentity({ ...common, company: 'Société Acme', ...decodeEmployerIdentity(encoded) }).employerIdentityStatus, 'CONFIRMED');
  assert.equal(resolveEmployerIdentity({ ...common, ...decodeEmployerIdentity('not-json') }).employerIdentityStatus, 'AMBIGUOUS');
  assert.deepEqual(decodeEmployerIdentity(''), {});
  const unresolved = resolveEmployerIdentity({ company: 'Acme', url: canonical, employerIdentityStatus: 'CONFLICT' });
  assert.equal(resolveEmployerIdentity({ company: 'Acme', url: canonical, ...decodeEmployerIdentity(encodeEmployerIdentity(unresolved)) }).employerIdentityStatus, 'CONFLICT', 'an unresolved conflict must survive persistence even if evidence is incomplete');
});

test('Built In enrichment retains the original label and complete body when structured/JD evidence conflicts', async () => {
  const listing = { title: 'GRC Analyst', company: 'Acme Regional Subsidiary', companySource: 'aggregator-card', sourceProvider: 'builtin', url: common.sourceUrl };
  const posting = { '@context': 'https://schema.org', '@type': 'JobPosting', title: listing.title,
    hiringOrganization: { name: 'Acme' }, description: `<p>Employer: Acme</p><p>${common.jd}</p>` };
  const html = `<script type="application/ld+json">${JSON.stringify(posting)}</script>`;
  const job = await builtin.enrichDetail(listing, { fetchText: async () => html });
  assert.equal(job.company, 'Acme Regional Subsidiary');
  assert.equal(job.companySource, 'aggregator-card');
  assert.equal(job.sourceUrl, common.sourceUrl);
  assert.equal(job.employerIdentityStatus, 'CONFLICT');
  assert.equal(job.descriptionComplete, true);
  assert.match(job.description, /Employer: Acme/);
  assert.ok(job.employerIdentityEvidence.some(item => item.value === 'Acme Regional Subsidiary'));
  assert.ok(job.employerIdentityEvidence.some(item => item.value === 'Acme'));
});
