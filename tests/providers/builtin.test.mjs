// tests/providers/builtin.test.mjs — contract test for the builtin.com
// board-wide aggregator provider. Auto-discovered by test-all.mjs under tests/**.
// Run alone with: node test-all.mjs --only providers/builtin
//
// Every fixture here is synthetic. Nothing in this file touches the network.

import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { buildTitleFilter } from '../../scan.mjs';

console.log('\nProvider — builtin');

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };
const HOST = 'builtin.com';

// Build one ItemList entry exactly as builtin embeds it (stable key order).
const item = (name, url, description) =>
  `{"@type":"ListItem","position":1,"name":${JSON.stringify(name)},"url":${JSON.stringify(url)}`
  + (description !== undefined ? `,"description":${JSON.stringify(description)}` : '')
  + '}';
const pageHtml = (items) => `<html><body><script>{"itemListElement":[${items.join(',')}]}</script></body></html>`;

// A ctx recording every fetchText(url, opts). Replays canned HTML keyed by URL;
// an Error value is thrown; an unknown URL returns '' (an empty page → stop).
function mockCtx(pages) {
  const calls = [];
  return {
    calls,
    ctx: {
      transport: 'http',
      fetchJson: async () => ({}),
      sleep: async () => {},
      fetchText: async (url, opts) => {
        calls.push({ url, opts });
        const v = pages[url];
        if (v instanceof Error) throw v;
        return v ?? '';
      },
    },
  };
}

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/builtin.mjs')).href);
  const bi = mod.default;
  const { parseListPage, parseDetailPage, normalizeBuiltInUrl, readConfig } = mod;

  // ── id / no detect ──────────────────────────────────────────────────
  if (bi.id === 'builtin') pass('builtin.id is "builtin"');
  else fail(`builtin.id is ${JSON.stringify(bi.id)}`);

  if (typeof bi.detect === 'undefined') {
    pass('builtin has no detect() — it is an explicit provider:builtin-only board-wide aggregator');
  } else {
    fail('builtin should not expose detect() (explicit-only)');
  }

  // ── readConfig ──────────────────────────────────────────────────────
  const dflt = readConfig({ name: 'B' });
  if (dflt.queries.length === 0 && dflt.categories.length === 0 && dflt.maxPages === 3) {
    pass('readConfig() ships NO default queries (neutralized) and defaults max_pages to 3');
  } else {
    fail(`readConfig(default) = ${JSON.stringify(dflt)}`);
  }

  const flat = readConfig({ queries: ['platform engineer'], categories: ['dev-engineering'], max_pages: 2 });
  if (flat.queries.join() === 'platform engineer' && flat.categories.join() === 'dev-engineering' && flat.maxPages === 2) {
    pass('readConfig() honours legacy-flat queries/categories/max_pages');
  } else {
    fail(`readConfig(flat) = ${JSON.stringify(flat)}`);
  }

  const nested = readConfig({ queries: ['flat-loses'], builtin: { queries: ['nested-wins'], max_pages: 4 } });
  if (nested.queries.join() === 'nested-wins' && nested.maxPages === 4) {
    pass('readConfig() lets the nested builtin:{} block win over flat keys');
  } else {
    fail(`readConfig(nested) = ${JSON.stringify(nested)}`);
  }
  const sharedTerms = readConfig({ builtin: { useTitleFilter: true, fetchDetails: true, detailLimit: 999 } });
  if (sharedTerms.useTitleFilter && sharedTerms.fetchDetails && !sharedTerms.deferDetails && sharedTerms.detailLimit === 100) {
    pass('readConfig() supports authoritative title-filter queries and bounded detail enrichment');
  } else {
    fail(`shared/detail config: ${JSON.stringify(sharedTerms)}`);
  }

  const clampHi = readConfig({ queries: ['x'], max_pages: 999 });
  const clampLo = readConfig({ queries: ['x'], max_pages: 0 });
  if (clampHi.maxPages === 25 && clampLo.maxPages === 1) {
    pass('readConfig() clamps max_pages to [1, 25]');
  } else {
    fail(`clamp: hi=${clampHi.maxPages} lo=${clampLo.maxPages} (expected 25 / 1)`);
  }

  // ── parseListPage (pure) ────────────────────────────────────────────
  const html = pageHtml([
    item('Platform Engineer', 'https://builtin.com/job/1', 'Own the platform.'),
    item('Backend Engineer', 'https://builtin.com/job/2'),          // no description
    '{"@type":"ListItem","position":3,"name":"Broken}',              // malformed → skipped
    item('', 'https://builtin.com/job/4', 'no title'),              // no title → dropped
  ]);
  const parsed = parseListPage(html);
  if (parsed.length === 2) {
    pass('parseListPage() parses valid ItemList rows and skips malformed / titleless ones (2 kept)');
  } else {
    fail(`parseListPage kept ${parsed.length}: ${JSON.stringify(parsed.map((j) => j.title))}`);
  }
  if (parsed[0]?.title === 'Platform Engineer' && parsed[0]?.url === 'https://builtin.com/job/1'
      && parsed[0]?.description === 'Own the platform.' && parsed[0]?.company === '' && parsed[0]?.location === '') {
    pass('parseListPage() maps title/url/description and leaves company/location empty by design');
  } else {
    fail(`row 0 mapping: ${JSON.stringify(parsed[0])}`);
  }
  if (parsed[1]?.description === '') {
    pass('parseListPage() defaults a missing description to ""');
  } else {
    fail(`missing-description row: ${JSON.stringify(parsed[1])}`);
  }
  if (parseListPage(null).length === 0 && parseListPage(42).length === 0 && parseListPage('<html></html>').length === 0) {
    pass('parseListPage() returns [] for non-string / itemless input (no crash)');
  } else {
    fail('parseListPage() should return [] for degenerate input');
  }

  // Saved minimal fixtures pin the public Chicago listing/detail contracts
  // without making this suite depend on the live website.
  const fixture = (name) => readFileSync(join(ROOT, 'tests/fixtures', name), 'utf8');
  const chicagoList = parseListPage(fixture('builtin-chicago-list.html'), 1_800_000_000_000);
  if (chicagoList.length === 1 && chicagoList[0].company === 'Acme Security'
      && chicagoList[0].title === 'Privacy GRC Analyst') {
    pass('Chicago listing fixture extracts company + title');
  } else {
    fail(`Chicago listing mapping: ${JSON.stringify(chicagoList)}`);
  }
  if (chicagoList[0]?.location === 'Hybrid · Chicago, IL, USA') {
    pass('Chicago listing fixture extracts location + work arrangement');
  } else {
    fail(`Chicago listing location: ${JSON.stringify(chicagoList[0]?.location)}`);
  }

  const detail = parseDetailPage(
    fixture('builtin-chicago-detail.html'),
    'https://www.builtinchicago.org/job/privacy-grc-analyst/12345?utm_source=test#apply',
    Date.parse('2026-10-03T00:00:00Z'),
  );
  if (detail?.company === 'Acme Security' && detail?.title === 'Privacy GRC Analyst'
      && detail?.sourceId === '12345') {
    pass('detail-page JSON-LD extracts company, title, and source identifier');
  } else {
    fail(`detail identity: ${JSON.stringify(detail)}`);
  }
  if (detail?.location === 'Remote or Hybrid · Chicago, IL, USA'
      && detail?.workArrangement === 'Remote or Hybrid' && detail?.seniority === 'Mid level') {
    pass('detail-page rendered metadata extracts location, work arrangement, and seniority');
  } else {
    fail(`detail metadata: ${JSON.stringify(detail)}`);
  }
  if (detail?.url === 'https://jobs.lever.co/acme-security/privacy-123'
      && detail?.sourceUrl === 'https://www.builtinchicago.org/job/privacy-grc-analyst/12345') {
    pass('detail parser prefers a public employer URL and preserves Built In provenance');
  } else {
    fail(`canonical/source URL: ${JSON.stringify(detail)}`);
  }
  if (detail?.descriptionComplete === true && /Responsibilities/.test(detail.description)
      && detail.description.length > 200) {
    pass('detail-page JSON-LD yields a complete substantial JD, not the listing summary');
  } else {
    fail(`detail JD: ${JSON.stringify(detail?.description)}`);
  }
  if (detail?.liveness === 'LIVE' && detail?.postedAt === Date.parse('2026-10-01')) {
    pass('detail-page validThrough/datePosted provide conservative liveness and exact posted date');
  } else {
    fail(`detail dates/liveness: ${JSON.stringify(detail)}`);
  }
  const expiredDetail = parseDetailPage(
    fixture('builtin-chicago-detail.html').replace('2026-11-01T00:00:00Z', '2026-09-01T00:00:00Z'),
    'https://www.builtinchicago.org/job/privacy-grc-analyst/12345',
    Date.parse('2026-10-03T00:00:00Z'),
  );
  const unclearDetail = parseDetailPage(
    fixture('builtin-chicago-detail.html').replace(',"validThrough":"2026-11-01T00:00:00Z"', ''),
    'https://www.builtinchicago.org/job/privacy-grc-analyst/12345',
    Date.parse('2026-10-03T00:00:00Z'),
  );
  if (expiredDetail?.expired === true && unclearDetail?.expired === false && unclearDetail?.liveness === 'UNCLEAR') {
    pass('liveness distinguishes explicit active, explicit expired, and insufficient evidence');
  } else {
    fail(`liveness evidence mapping: expired=${JSON.stringify(expiredDetail)} unclear=${JSON.stringify(unclearDetail)}`);
  }
  if (parseDetailPage(fixture('builtin-chicago-malformed.html'), 'https://www.builtinchicago.org/job/x/9') === null
      && parseDetailPage('<p>Sorry, this job was removed at noon</p>', 'https://www.builtinchicago.org/job/x/9')?.expired === true) {
    pass('malformed metadata degrades safely and explicit removed evidence is rejected');
  } else {
    fail('malformed/removed detail handling drifted');
  }
  if (normalizeBuiltInUrl('https://www.builtinchicago.org/job/x/9/?a=1#b') === 'https://www.builtinchicago.org/job/x/9'
      && normalizeBuiltInUrl('https://evil.example/job/9') === null) {
    pass('Built In operational URLs normalize safely and reject foreign hosts');
  } else {
    fail('Built In URL normalization drifted');
  }
  const exclusion = buildTitleFilter({ positive: ['Privacy'], negative: ['Director'] });
  if (exclusion(detail.title) && !exclusion('Director of Privacy')) {
    pass('Built In titles pass through the existing role inclusion/exclusion logic');
  } else {
    fail('Built In title exclusion behavior drifted');
  }

  // ── fetch: no baked-in default queries ─────────────────────────
  const noCfg = mockCtx({});
  const nothing = await bi.fetch({ name: 'BuiltIn' }, noCfg.ctx);
  if (Array.isArray(nothing) && nothing.length === 0 && noCfg.calls.length === 0) {
    pass('builtin.fetch() with NO queries/categories returns [] and makes ZERO requests (no baked-in personal defaults)');
  } else {
    fail(`neutralization: ${nothing.length} jobs in ${noCfg.calls.length} requests (expected 0 / 0)`);
  }

  // ── fetch: URL construction, headers, host pin ──────────────────────
  const q = encodeURIComponent('platform engineer');
  const searchP1 = `https://builtin.com/jobs?search=${q}&page=1`;
  const catP1 = 'https://builtin.com/jobs/dev-engineering?page=1';
  const built = mockCtx({
    [searchP1]: pageHtml([item('Platform Engineer', 'https://builtin.com/job/1', 'x')]),
    [catP1]: pageHtml([item('Dev Eng', 'https://builtin.com/job/9', 'y')]),
  });
  const jobsBuilt = await bi.fetch(
    { name: 'BuiltIn', queries: ['platform engineer'], categories: ['dev-engineering'], max_pages: 1 },
    built.ctx,
  );
  if (built.calls.some((c) => c.url === searchP1) && built.calls.some((c) => c.url === catP1) && jobsBuilt.length === 2) {
    pass('builtin.fetch() builds /jobs?search=&page= and /jobs/<category>?page= URLs');
  } else {
    fail(`URL construction: ${built.calls.map((c) => c.url).join(' | ')} → ${jobsBuilt.length} jobs`);
  }
  if (built.calls.every((c) => c.opts?.redirect === 'error' && c.opts?.headers?.['User-Agent'])) {
    pass('builtin.fetch() passes redirect:"error" + a browser UA on every request');
  } else {
    fail(`fetch opts: ${JSON.stringify(built.calls.map((c) => c.opts))}`);
  }
  if (built.calls.every((c) => hostOf(c.url) === HOST)) {
    pass('builtin.fetch() only ever requests builtin.com');
  } else {
    fail(`hosts requested: ${built.calls.map((c) => hostOf(c.url)).join(',')}`);
  }

  const chicagoSearch = 'https://www.builtinchicago.org/jobs?search=Privacy&page=1';
  const chicagoDetail = 'https://www.builtinchicago.org/job/privacy-grc-analyst/12345';
  const detailCtx = mockCtx({
    [chicagoSearch]: fixture('builtin-chicago-list.html'),
    [chicagoDetail]: fixture('builtin-chicago-detail.html'),
  });
  const detailedJobs = await bi.fetch({
    name: 'Built In Chicago',
    builtin: {
      host: 'www.builtinchicago.org', useTitleFilter: true,
      fetchDetails: true, detailLimit: 1, max_pages: 1,
    },
  }, { ...detailCtx.ctx, titleKeywords: ['Privacy'] });
  if (detailCtx.calls.map((c) => c.url).join('|') === `${chicagoSearch}|${chicagoDetail}`
      && detailedJobs[0]?.descriptionComplete === true
      && detailedJobs[0]?.url === 'https://jobs.lever.co/acme-security/privacy-123') {
    pass('fetch() reuses shared title terms and performs bounded public detail enrichment');
  } else {
    fail(`detail enrichment: calls=${JSON.stringify(detailCtx.calls)} jobs=${JSON.stringify(detailedJobs)}`);
  }

  const deferredCtx = mockCtx({
    [chicagoSearch]: fixture('builtin-chicago-list.html'),
    [chicagoDetail]: fixture('builtin-chicago-detail.html'),
  });
  const deferredJobs = await bi.fetch({
    name: 'Built In Chicago',
    builtin: {
      host: 'www.builtinchicago.org', useTitleFilter: true,
      fetchDetails: true, deferDetails: true, detailLimit: 1, max_pages: 1,
    },
  }, { ...deferredCtx.ctx, titleKeywords: ['Privacy'] });
  if (deferredCtx.calls.length === 1 && deferredJobs[0]?._detailPending === true
      && deferredJobs[0]?._detailLimit === 1 && deferredJobs[0]?.descriptionComplete !== true) {
    pass('reverse-scan mode defers bounded detail work until after cheap gates');
  } else {
    fail(`deferred detail marker: calls=${JSON.stringify(deferredCtx.calls)} jobs=${JSON.stringify(deferredJobs)}`);
  }
  const deferredDetail = await bi.enrichDetail(deferredJobs[0], deferredCtx.ctx);
  if (deferredCtx.calls.length === 2 && deferredCtx.calls[1]?.url === chicagoDetail
      && deferredDetail?.descriptionComplete === true) {
    pass('deferred candidate enrichment preserves the complete public JD');
  } else {
    fail(`deferred detail enrichment failed: calls=${JSON.stringify(deferredCtx.calls)} job=${JSON.stringify(deferredDetail)}`);
  }

  // ── fetch: dedup across pages, stop on empty page ───────────────────
  const p1 = `https://builtin.com/jobs?search=a&page=1`;
  const p2 = `https://builtin.com/jobs?search=a&page=2`;
  const p3 = `https://builtin.com/jobs?search=a&page=3`;
  const dedupCtx = mockCtx({
    [p1]: pageHtml([item('X', 'https://builtin.com/job/x', 'x'), item('Y', 'https://builtin.com/job/y', 'y')]),
    [p2]: pageHtml([item('Y', 'https://builtin.com/job/y', 'y'), item('Z', 'https://builtin.com/job/z', 'z')]), // Y dup, Z new
    [p3]: '', // empty → stop
  });
  const deduped = await bi.fetch({ name: 'B', queries: ['a'], max_pages: 5 }, dedupCtx.ctx);
  if (deduped.length === 3 && new Set(deduped.map((j) => j.url)).size === 3) {
    pass('builtin.fetch() dedupes the same url across pages (X,Y,Z from an overlapping page 2)');
  } else {
    fail(`dedup: ${deduped.length} jobs (${deduped.map((j) => j.title).join(',')})`);
  }
  if (dedupCtx.calls.length === 3) {
    pass('builtin.fetch() stops paginating a base once a page yields no NEW items / is empty');
  } else {
    fail(`pagination stop: ${dedupCtx.calls.length} requests (expected 3)`);
  }

  // ── fetch: ctx.maxPages probe hint narrows to 1 page per base ────────
  const probeCtx = mockCtx({
    [p1]: pageHtml([item('X', 'https://builtin.com/job/x', 'x')]),
    [p2]: pageHtml([item('W', 'https://builtin.com/job/w', 'w')]),
  });
  await bi.fetch({ name: 'B', queries: ['a'], max_pages: 5 }, { ...probeCtx.ctx, maxPages: 1 });
  if (probeCtx.calls.length === 1) {
    pass('builtin.fetch() honors the ctx.maxPages probe hint (1 page per base)');
  } else {
    fail(`ctx.maxPages hint: ${probeCtx.calls.length} requests (expected 1)`);
  }

  // ── fetch: a throwing page ends that base without crashing ──────────
  const goodP1 = `https://builtin.com/jobs?search=good&page=1`;
  const goodP2 = `https://builtin.com/jobs?search=good&page=2`;
  const badP1 = `https://builtin.com/jobs?search=bad&page=1`;
  const throwCtx = mockCtx({
    [goodP1]: pageHtml([item('Good Role', 'https://builtin.com/job/g', 'g')]),
    [goodP2]: '', // stop good base
    [badP1]: new Error('boom'),
  });
  const survived = await bi.fetch({ name: 'B', queries: ['good', 'bad'], max_pages: 3 }, throwCtx.ctx);
  if (survived.length === 1 && survived[0]?.title === 'Good Role') {
    pass('builtin.fetch() keeps a good base and swallows a throwing base without crashing');
  } else {
    fail(`throw handling: ${JSON.stringify(survived.map((j) => j.title))}`);
  }

  // ── resolveHost / market hosts ──────────────────────────────────────
  const { resolveHost, parseCards, parseSalary, parsePostedAt, composeLocation } = mod;

  if (resolveHost(undefined) === 'builtin.com' && resolveHost('') === 'builtin.com') {
    pass('resolveHost() defaults to builtin.com (an existing entry keeps its behaviour)');
  } else {
    fail(`resolveHost(default) = ${resolveHost(undefined)}`);
  }
  if (resolveHost('builtinseattle.com') === 'www.builtinseattle.com'
      && resolveHost('www.builtinseattle.com') === 'www.builtinseattle.com'
      && resolveHost('BuiltInSeattle.com') === 'www.builtinseattle.com') {
    pass('resolveHost() canonicalizes a bare/mixed-case market host to its www form (bare 301s, and we fetch redirect:"error")');
  } else {
    fail(`resolveHost(seattle) = ${resolveHost('builtinseattle.com')}`);
  }
  if (resolveHost('https://www.builtinseattle.com/jobs') === 'www.builtinseattle.com') {
    pass('resolveHost() accepts a pasted URL as the host');
  } else {
    fail(`resolveHost(url) = ${resolveHost('https://www.builtinseattle.com/jobs')}`);
  }
  if (resolveHost('builtinchicago.org') === 'www.builtinchicago.org') {
    pass('resolveHost() knows builtinchicago is .org, not .com');
  } else {
    fail(`resolveHost(chicago) = ${resolveHost('builtinchicago.org')}`);
  }
  if (resolveHost('evil.com') === null && resolveHost('builtin.com.evil.com') === null
      && resolveHost('notbuiltin.com') === null && resolveHost(42) === null) {
    pass('resolveHost() rejects any host off the allowlist (SSRF guard)');
  } else {
    fail('resolveHost() must return null for non-allowlisted hosts');
  }

  const badHost = mockCtx({});
  const badJobs = await bi.fetch({ name: 'B', host: 'evil.com', queries: ['a'] }, badHost.ctx);
  if (badJobs.length === 0 && badHost.calls.length === 0) {
    pass('builtin.fetch() REFUSES an unknown host — returns [] and makes zero requests (never falls back to builtin.com)');
  } else {
    fail(`bad host: ${badJobs.length} jobs in ${badHost.calls.length} requests (expected 0 / 0)`);
  }

  const seaP1 = `https://www.builtinseattle.com/jobs?search=${encodeURIComponent('platform engineer')}&page=1`;
  const seaCtx = mockCtx({ [seaP1]: pageHtml([item('PE', 'https://www.builtinseattle.com/job/pe/1', 'x')]) });
  const seaJobs = await bi.fetch({ name: 'B', builtin: { host: 'builtinseattle.com', queries: ['platform engineer'] }, max_pages: 1 }, seaCtx.ctx);
  if (seaCtx.calls.length === 1 && seaCtx.calls[0].url === seaP1 && seaJobs.length === 1) {
    pass('builtin.fetch() scans the configured market host');
  } else {
    fail(`market host: ${seaCtx.calls.map((c) => c.url).join(' | ')}`);
  }

  // ── scope path ──────────────────────────────────────────────────────
  const remoteSearch = `https://builtin.com/jobs/remote?search=${encodeURIComponent('a')}&page=1`;
  const remoteCat = 'https://builtin.com/jobs/remote/dev-engineering?page=1';
  const scopeCtx = mockCtx({
    [remoteSearch]: pageHtml([item('R', 'https://builtin.com/job/r/1', 'x')]),
    [remoteCat]: pageHtml([item('C', 'https://builtin.com/job/c/2', 'y')]),
  });
  await bi.fetch({ name: 'B', builtin: { scope: 'remote', queries: ['a'], categories: ['dev-engineering'] }, max_pages: 1 }, scopeCtx.ctx);
  if (scopeCtx.calls.some((c) => c.url === remoteSearch) && scopeCtx.calls.some((c) => c.url === remoteCat)) {
    pass('builtin.fetch() nests queries AND categories under an optional scope path (/jobs/remote/...)');
  } else {
    fail(`scope: ${scopeCtx.calls.map((c) => c.url).join(' | ')}`);
  }
  const badScope = readConfig({ scope: '../../etc', queries: ['a'] });
  if (badScope.scope === '') {
    pass('readConfig() drops a non-slug scope (no path traversal)');
  } else {
    fail(`bad scope kept: ${JSON.stringify(badScope.scope)}`);
  }

  // ── card enrichment ─────────────────────────────────────────────────
  // Mirrors builtin's real card markup: a /company/ anchor before the title,
  // then icon-anchored fields. Icon classes are the parse anchors.
  const card = ({ id, title, company, posted, mode, location, tooltip, pay }) => `
    <div><a href="/company/${company.toLowerCase().replace(/[^a-z]+/g, '-')}" class="z-1"><span>${company}</span></a></div>
    <h2><a href="/job/${title.toLowerCase().replace(/[^a-z]+/g, '-')}/${id}" data-id="job-card-title" data-builtin-track-job-id="${id}" class="text-break">${title}</a></h2>
    <div><i class="fa-regular fa-clock fs-xs text-gray-03"></i>${posted}</span></div>
    <div><div><i class="fa-regular fa-house-building fs-xs text-pretty-blue"></i></div> <span class="font-barlow text-gray-04">${mode}</span></div>
    <div><div><i class="fa-regular fa-location-dot fs-xs text-pretty-blue"></i></div> <div><span ${tooltip ? `aria-label="Job locations" data-bs-title="${tooltip}"` : 'class="font-barlow"'}>${location}</span></div></div>
    ${pay ? `<div><div><i class="fa-regular fa-sack-dollar fs-xs text-pretty-blue"></i></div> <span class="font-barlow">${pay}</span></div>` : ''}
  `;
  const enrichedHtml = `<html><body>
    ${card({ id: '101', title: 'Backend Engineer', company: 'Acme Corp', posted: 'Yesterday', mode: 'Hybrid', location: 'Seattle, WA, USA', pay: '170K-230K Annually' })}
    ${card({ id: '102', title: 'Platform Engineer', company: 'Globex', posted: 'Reposted 3 Days Ago', mode: 'Remote', location: 'United States', pay: '115K-130K Hourly' })}
    ${card({ id: '103', title: 'Staff Engineer', company: 'Initech', posted: '2 Hours Ago', mode: 'In-Office', location: '2 Locations', tooltip: '&lt;div&gt;Denver, CO, USA&lt;/div&gt;&lt;div&gt;Long Beach, CA, USA&lt;/div&gt;' })}
    ${card({ id: '104', title: 'Data Engineer', company: 'Umbrella', posted: '5 Days Ago', mode: 'Hybrid', location: '3 Locations' })}
    <script>{"itemListElement":[
      ${item('Backend Engineer', 'https://builtin.com/job/backend-engineer/101', 'a')},
      ${item('Platform Engineer', 'https://builtin.com/job/platform-engineer/102', 'b')},
      ${item('Staff Engineer', 'https://builtin.com/job/staff-engineer/103', 'c')},
      ${item('Data Engineer', 'https://builtin.com/job/data-engineer/104', 'd')}
    ]}</script></body></html>`;

  const cards = parseCards(enrichedHtml);
  if (cards.size === 4) pass('parseCards() finds one enrichment record per rendered card');
  else fail(`parseCards found ${cards.size} cards (expected 4)`);

  const enriched = parseListPage(enrichedHtml);
  const byId = Object.fromEntries(enriched.map((j) => [j.url.split('/').pop(), j]));
  if (byId['101']?.company === 'Acme Corp' && byId['102']?.company === 'Globex' && byId['103']?.company === 'Initech') {
    pass('parseListPage() joins each card to its ItemList row on the job id and fills company (unblocks the blacklist gate)');
  } else {
    fail(`company join: ${JSON.stringify(enriched.map((j) => j.company))}`);
  }
  if (byId['101']?.location === 'Hybrid · Seattle, WA, USA' && byId['102']?.location === 'Remote · United States') {
    pass('parseListPage() composes workplace mode + place into location (unblocks location_filter)');
  } else {
    fail(`location compose: ${JSON.stringify(enriched.map((j) => j.location))}`);
  }
  if (byId['103']?.location === 'In-Office · Denver, CO, USA · Long Beach, CA, USA') {
    pass('parseCards() resolves a multi-location card from its data-bs-title tooltip');
  } else {
    fail(`tooltip resolution: ${JSON.stringify(byId['103']?.location)}`);
  }
  if (byId['104']?.location === '') {
    pass('parseCards() leaves an UNRESOLVABLE multi-location card empty — empty passes location_filter, so the row keeps flowing instead of being dropped on a placeholder');
  } else {
    fail(`unresolvable multi-location should be '': ${JSON.stringify(byId['104']?.location)}`);
  }
  if (byId['101']?.salary?.min === 170000 && byId['101']?.salary?.max === 230000 && byId['101']?.salary?.currency === undefined) {
    pass('parseListPage() maps an Annually band to {min,max} and leaves currency unset (buildSalaryFilter only rejects when both sides declare one)');
  } else {
    fail(`salary: ${JSON.stringify(byId['101']?.salary)}`);
  }
  if (byId['102']?.salary === undefined) {
    pass('parseSalary() ignores builtin’s bogus "115K-130K Hourly" bands (their data error; reading it would be 1000x off)');
  } else {
    fail(`hourly band should be dropped: ${JSON.stringify(byId['102']?.salary)}`);
  }
  if (typeof byId['101']?.postedAt === 'number' && byId['101'].postedAt < Date.now()) {
    pass('parseListPage() maps the freshness badge to postedAt (unblocks max_posting_age_days)');
  } else {
    fail(`postedAt: ${JSON.stringify(byId['101']?.postedAt)}`);
  }

  // ── pure helpers ────────────────────────────────────────────────────
  const NOW = 1_700_000_000_000;
  const day = 86_400_000;
  if (parsePostedAt('Yesterday', NOW) === NOW - day
      && parsePostedAt('Reposted 3 Days Ago', NOW) === NOW - 3 * day
      && parsePostedAt('2 Hours Ago', NOW) === NOW - 2 * 3_600_000
      && parsePostedAt('30+ Days Ago', NOW) === NOW - 30 * day
      && parsePostedAt('An Hour Ago', NOW) === NOW - 3_600_000) {
    pass('parsePostedAt() reads builtin’s relative badges (incl. the "Reposted"/"30+"/"An" forms)');
  } else {
    fail(`parsePostedAt: ${['Yesterday', 'Reposted 3 Days Ago', '2 Hours Ago', '30+ Days Ago', 'An Hour Ago'].map((t) => parsePostedAt(t, NOW)).join(',')}`);
  }
  if (parsePostedAt('Whenever', NOW) === undefined && parsePostedAt(null, NOW) === undefined) {
    pass('parsePostedAt() returns undefined for unrecognised text (scan.mjs then treats it as "no date" and passes)');
  } else {
    fail('parsePostedAt() should return undefined for unparseable badges');
  }
  if (composeLocation('Hybrid', []) === '' && composeLocation('In-Office', []) === '') {
    pass('composeLocation() returns ’’ for a placeless non-remote card (never invents a location)');
  } else {
    fail(`composeLocation(placeless): ${JSON.stringify(composeLocation('Hybrid', []))}`);
  }
  if (composeLocation('Remote', []) === 'Remote' && composeLocation('Remote or Hybrid', []) === 'Remote or Hybrid') {
    pass('composeLocation() keeps a bare remote marker (the allow list matches on "remote")');
  } else {
    fail(`composeLocation(remote): ${JSON.stringify(composeLocation('Remote', []))}`);
  }
  if (parseSalary('170K Annually')?.min === 170000 && parseSalary('170K Annually')?.max === 170000) {
    pass('parseSalary() handles a single-value band');
  } else {
    fail(`parseSalary(single): ${JSON.stringify(parseSalary('170K Annually'))}`);
  }

  // ── drift guard ─────────────────────────────────────────────────────
  // Card enrichment failing is silent by construction (every field empties, and
  // an empty location PASSES the filter), so a layout change must be loud.
  const itemsOnly = pageHtml(Array.from({ length: 8 }, (_, i) =>
    item(`Role ${i}`, `https://builtin.com/job/role-${i}/${200 + i}`, 'd')));
  const guardCtx = mockCtx({ 'https://builtin.com/jobs?search=a&page=1': itemsOnly });
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    await bi.fetch({ name: 'GuardEntry', queries: ['a'], max_pages: 1 }, guardCtx.ctx);
  } finally {
    console.error = realError;
  }
  if (warnings.some((w) => /ZERO job cards/.test(w) && /INERT/.test(w))) {
    pass('builtin.fetch() warns LOUDLY when a page yields rows but no cards (silent enrichment loss would re-open the off-policy leak)');
  } else {
    fail(`drift guard did not fire: ${JSON.stringify(warnings)}`);
  }
  if (warnings.some((w) => /GuardEntry/.test(w))) {
    pass('the drift-guard warning names the portals entry');
  } else {
    fail('drift-guard warning should name the entry');
  }

  // A small ItemList-only page (a fixture, a stub) must NOT trip the guard.
  const quietCtx = mockCtx({ 'https://builtin.com/jobs?search=a&page=1': pageHtml([item('One', 'https://builtin.com/job/one/9', 'x')]) });
  const quiet = [];
  const realError2 = console.error;
  console.error = (...a) => quiet.push(a.join(' '));
  try {
    await bi.fetch({ name: 'Q', queries: ['a'], max_pages: 1 }, quietCtx.ctx);
  } finally {
    console.error = realError2;
  }
  if (quiet.length === 0) {
    pass('the drift guard stays quiet below the row threshold (a stub page is not a signal)');
  } else {
    fail(`guard fired on a tiny page: ${JSON.stringify(quiet)}`);
  }
} catch (e) {
  fail(`builtin provider tests crashed: ${e.message}`);
}
