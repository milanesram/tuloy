import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const auth = await import(pathToFileURL(join(ROOT, 'lib/authenticated-browser.mjs')).href);
const opportunity = await import(pathToFileURL(join(ROOT, 'lib/authenticated-opportunity.mjs')).href);
const linkedin = await import(pathToFileURL(join(ROOT, 'authenticated-sources/linkedin.mjs')).href);
const handshake = await import(pathToFileURL(join(ROOT, 'authenticated-sources/handshake.mjs')).href);
const discover = await import(pathToFileURL(join(ROOT, 'discover-authenticated.mjs')).href);

const temp = mkdtempSync(join(tmpdir(), 'career-ops-auth-browser-'));
const baseDir = join(temp, 'profiles');
const options = { baseDir, repoRoot: ROOT };
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const pipelinePath = join(ROOT, 'data/pipeline.md');
const pipelineBefore = hash(pipelinePath);

try {
  const linkedInPath = auth.resolveAuthenticatedProfilePath('linkedin', options);
  const handshakePath = auth.resolveAuthenticatedProfilePath('handshake', options);
  assert.notEqual(linkedInPath, handshakePath);
  assert.ok(linkedInPath.startsWith(baseDir));
  assert.ok(!linkedInPath.startsWith(ROOT));
  assert.throws(() => auth.resolveAuthenticatedProfilePath('linkedin', { baseDir: join(ROOT, 'profiles'), repoRoot: ROOT }), /outside/);

  auth.ensurePrivateProfileDirectory('linkedin', options);
  assert.equal(statSync(linkedInPath).mode & 0o777, 0o700);
  const absentStatus = await auth.authenticatedSessionStatus('handshake', options);
  assert.deepEqual(Object.keys(absentStatus).sort(), [
    'authenticated', 'lastSuccessfulJobPageAccess', 'profileExists', 'source',
  ]);
  assert.equal(absentStatus.profileExists, false);
  assert.equal(absentStatus.authenticated, 'unauthenticated');

  assert.equal(auth.isAuthenticatedSourceUrlAllowed('linkedin', 'https://www.linkedin.com/jobs/view/123'), true);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('linkedin', 'https://www.linkedin.com/in/example'), false);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('linkedin', 'https://www.linkedin.com/feed/'), false);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('linkedin', 'https://www.linkedin.com/feed/', { loginMode: true }), true);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('linkedin', 'https://evil.example/jobs/view/123'), false);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('handshake', 'https://app.joinhandshake.com/stu/postings/123'), true);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('handshake', 'https://app.joinhandshake.com/stu/profile'), false);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('handshake', 'https://sso.northwestern.edu/login'), false);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('handshake', 'https://sso.northwestern.edu/login', { loginMode: true }), true);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('handshake', 'https://api-123.duosecurity.com/frame', { loginMode: true }), true);
  assert.equal(auth.isAuthenticatedSourceUrlAllowed('linkedin', 'http://www.linkedin.com/jobs/'), false);
  assert.equal(
    auth.normalizeAuthenticatedPostingUrl('linkedin', 'https://www.linkedin.com/jobs/view/grc-analyst-123456/?trackingId=discard-me'),
    'https://www.linkedin.com/jobs/view/grc-analyst-123456/',
  );
  assert.throws(
    () => auth.normalizeAuthenticatedPostingUrl('linkedin', 'https://www.linkedin.com/jobs/search/?currentJobId=123456'),
    /individual job-posting URL/,
  );

  assert.throws(() => auth.rejectSensitiveAuthInput({ password: 'nope' }), /not accepted/);
  assert.throws(() => auth.rejectSensitiveAuthInput({ nested: { csrfToken: 'nope' } }), /not accepted/);
  const redacted = auth.sanitizeAuthenticatedBrowserError('Authorization: Bearer abc.def Cookie: li_at=secret?token=other');
  assert.ok(!redacted.includes('abc.def'));
  assert.ok(!redacted.includes('li_at'));
  assert.ok(!redacted.includes('other'));

  assert.equal(auth.classifyAuthenticatedPage('linkedin', {
    url: 'https://www.linkedin.com/login', text: 'Sign in Email Password',
  }), auth.AUTH_STATES.AUTH_REQUIRED);
  assert.equal(auth.classifyAuthenticatedPage('linkedin', {
    url: 'https://www.linkedin.com/checkpoint', text: 'Enter verification code for multi-factor authentication',
  }), auth.AUTH_STATES.HUMAN_MFA_REQUIRED);
  assert.equal(auth.classifyAuthenticatedPage('linkedin', {
    url: 'https://www.linkedin.com/checkpoint', text: 'Verify you are human CAPTCHA',
  }), auth.AUTH_STATES.HUMAN_CAPTCHA_REQUIRED);
  assert.equal(auth.classifyAuthenticatedPage('linkedin', {
    url: 'https://www.linkedin.com/jobs/', text: 'Join now Sign in Search jobs',
  }), auth.AUTH_STATES.AUTH_REQUIRED);
  assert.equal(auth.classifyAuthenticatedPage('handshake', {
    url: 'https://app.joinhandshake.com/stu/postings', text: 'Jobs and employers',
  }), auth.AUTH_STATES.SUCCESS);

  let launchOptions;
  let launchedProfile;
  let closed = false;
  const fakePage = {
    _url: 'https://www.linkedin.com/jobs/',
    on() {},
    async goto(url) { this._url = url; return { status: () => 200 }; },
    url() { return this._url; },
    async title() { return 'LinkedIn Jobs'; },
    locator() { return { innerText: async () => 'Jobs' }; },
    async evaluate(fn, arg) { return typeof fn === 'function' ? [] : arg; },
    async waitForTimeout() {},
  };
  const fakeContext = {
    async route() {},
    pages() { return [fakePage]; },
    async newPage() { return fakePage; },
    async close() { closed = true; },
  };
  await auth.withAuthenticatedBrowser('linkedin', async (session) => {
    assert.equal(session.source, 'linkedin');
    assert.equal(Object.hasOwn(session, 'profilePath'), false);
    await session.goto('https://www.linkedin.com/jobs/');
  }, {
    ...options,
    launchPersistentContext: async (profile, opts) => {
      launchedProfile = profile;
      launchOptions = opts;
      return fakeContext;
    },
  });
  assert.equal(launchedProfile, linkedInPath);
  assert.equal(launchOptions.headless, false);
  assert.equal(launchOptions.acceptDownloads, false);
  assert.equal(closed, true);
  await assert.rejects(
    () => auth.withAuthenticatedBrowser('linkedin', async () => {}, { ...options, headless: true, launchPersistentContext: async () => fakeContext }),
    /visible browser/,
  );

  // Reset removes only the selected source profile.
  auth.ensurePrivateProfileDirectory('handshake', options);
  writeFileSync(join(linkedInPath, 'sentinel'), 'linkedin');
  writeFileSync(join(handshakePath, 'sentinel'), 'handshake');
  const reset = auth.resetAuthenticatedProfile('linkedin', options);
  assert.equal(reset.removed, true);
  assert.equal(auth.readAuthenticatedSessionMetadata('handshake', options).source, 'handshake');
  assert.equal(statSync(handshakePath).isDirectory(), true);

  const li = linkedin.normalizeLinkedInRecords([
    { title: 'GRC Analyst', employer: 'Acme', location: 'Chicago, IL (Hybrid)', url: 'https://www.linkedin.com/jobs/view/grc-analyst-123456?trackingId=discard-me', description: 'Controls work' },
    { title: 'Duplicate', employer: 'Acme', url: 'https://www.linkedin.com/jobs/view/grc-analyst-123456' },
  ]);
  assert.equal(li.length, 1);
  assert.equal(li[0].source, 'LinkedIn');
  assert.equal(li[0].sourcePostingId, '123456');
  assert.equal(li[0].workArrangement, 'Hybrid');
  assert.equal(li[0].url, 'https://www.linkedin.com/jobs/view/grc-analyst-123456');
  assert.deepEqual(li[0].foundOn, ['LinkedIn']);
  assert.equal(linkedin.normalizeLinkedInRecords([
    { title: 'Injected result', employer: 'Bad', url: 'https://evil.example/jobs/view/123456' },
  ]).length, 0);
  assert.equal(linkedin.normalizeLinkedInRecords(Array.from({ length: 40 }, (_, index) => ({
    title: `Bounded role ${index}`,
    employer: 'Example',
    url: `https://www.linkedin.com/jobs/view/bounded-${100000 + index}`,
  }))).length, 25);

  const hs = handshake.normalizeHandshakeRecords([
    { title: 'Privacy Analyst', employer: 'Example', location: 'Chicago', url: 'https://app.joinhandshake.com/stu/postings/987', applicationDeadline: 'October 30' },
  ]);
  assert.equal(hs[0].source, 'Handshake');
  assert.equal(hs[0].sourcePostingId, '987');
  assert.equal(hs[0].applicationDeadline, 'October 30');

  const canonical = await opportunity.canonicalizeAuthenticatedOpportunity({
    ...li[0],
    employerUrl: 'https://job-boards.greenhouse.io/acme/jobs/1234567',
  }, { livenessCheck: async () => ({ result: 'active', code: 'greenhouse_api_ok' }) });
  assert.equal(canonical.canonicalization.provider, 'greenhouse');
  assert.equal(canonical.canonicalization.liveness, 'ACTIVE');
  assert.ok(canonical.identity.startsWith('ats:greenhouse:'));
  assert.equal(canonical.sourceOccurrences[0].source, 'LinkedIn');
  const sourceOnly = await opportunity.canonicalizeAuthenticatedOpportunity(hs[0]);
  assert.equal(sourceOnly.canonicalization.state, 'SOURCE ONLY / CANONICAL NOT FOUND');
  assert.equal(sourceOnly.locationNormalization, 'DEFERRED_TO_SHARED_NORMALIZER');

  assert.throws(() => discover.parseAuthenticatedDiscoveryArgs(['linkedin', '--password', 'secret', '--search']), /forbidden/);
  assert.throws(() => discover.parseAuthenticatedDiscoveryArgs(['linkedin', '--url', 'x', '--search']), /exactly one/);
  assert.throws(() => discover.parseAuthenticatedDiscoveryArgs(['linkedin', '--url']), /requires a value/);
  assert.throws(() => discover.parseAuthenticatedDiscoveryArgs(['linkedin', '--search', 'surprise']), /unexpected positional/);
  assert.throws(() => discover.parseAuthenticatedDiscoveryArgs(['linkedin', '--search', '--max', '5', '--max=6']), /only once/);
  assert.equal(discover.parseAuthenticatedDiscoveryArgs(['linkedin', '--search', '--max', '999']).max, 25);

  const mockSession = {
    async goto() {},
    currentUrl: () => 'https://www.linkedin.com/jobs/search/',
    visibleText: async () => 'Jobs search results',
    markSuccessfulJobPageAccess() {},
  };
  const run = await discover.runAuthenticatedDiscovery({ source: 'linkedin', mode: 'search', max: 1 }, {
    withBrowser: async (_source, callback) => callback(mockSession),
    waitForSearchReady: async () => {},
    classifySession: async () => auth.AUTH_STATES.SUCCESS,
    adapter: { search: async () => li, detail: async () => li },
    canonicalize: async (record) => ({
      ...record,
      identity: `source:linkedin:${record.sourcePostingId}`,
      sourceOccurrences: [{ source: record.source, sourceUrl: record.url }],
    }),
  });
  assert.equal(run.state, auth.AUTH_STATES.SUCCESS);
  assert.equal(run.jobs.length, 1);
  assert.deepEqual(run.writes, { pipeline: false, applications: false, scanHistory: false });
  assert.equal(hash(pipelinePath), pipelineBefore);

  for (const file of [
    'auth-browser.mjs',
    'authenticated-sources/linkedin.mjs',
    'authenticated-sources/handshake.mjs',
    'discover-authenticated.mjs',
    'lib/authenticated-browser.mjs',
  ]) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.equal(/\.click\s*\(|\.fill\s*\(|\.type\s*\(|setInputFiles\s*\(/.test(source), false, `${file} must remain discovery-only`);
  }

  console.log('✓ authenticated browser/session isolation, adapters, canonicalization and no-write controls passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
