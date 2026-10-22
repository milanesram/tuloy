// @ts-check
/**
 * User-controlled authenticated browser sessions for job discovery.
 *
 * Security boundary:
 *   - the user authenticates in visible Chromium;
 *   - Chromium owns its persistent profile;
 *   - career-ops never reads cookies/storage or accepts credentials;
 *   - top-level navigation stays on the selected source (plus a small login-only
 *     identity-provider allowlist for Northwestern SSO);
 *   - source adapters receive a narrow session facade, never BrowserContext or
 *     the profile directory.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATUS_FILE = '.career-ops-session.json';
const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_EVALUATE_RESULTS = 100;

export const AUTH_STATES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  HUMAN_MFA_REQUIRED: 'HUMAN_MFA_REQUIRED',
  HUMAN_CAPTCHA_REQUIRED: 'HUMAN_CAPTCHA_REQUIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  SOURCE_LAYOUT_CHANGED: 'SOURCE_LAYOUT_CHANGED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  SUCCESS: 'SUCCESS',
  INCOMPLETE: 'INCOMPLETE',
});

const SOURCES = Object.freeze({
  linkedin: Object.freeze({
    id: 'linkedin',
    loginUrl: 'https://www.linkedin.com/login',
    jobsUrl: 'https://www.linkedin.com/jobs/',
    sourceHosts: Object.freeze(['linkedin.com']),
    discoveryPaths: Object.freeze(['/jobs']),
    postingPath: /^\/jobs\/view\/(?:.*-)?\d+\/?$/i,
    authenticatedMarkerSelector: [
      'header.global-nav .global-nav__primary-link-me-menu-trigger',
      'nav.global-nav a[href*="/mynetwork/"]',
      'nav.global-nav a[href*="/notifications/"]',
      '[data-control-name="identity_profile_photo"]',
    ].join(','),
    loginHosts: Object.freeze([]),
  }),
  handshake: Object.freeze({
    id: 'handshake',
    loginUrl: 'https://app.joinhandshake.com/login',
    jobsUrl: 'https://app.joinhandshake.com/stu/postings',
    sourceHosts: Object.freeze(['joinhandshake.com']),
    discoveryPaths: Object.freeze(['/stu/postings', '/jobs']),
    postingPath: /^\/(?:stu\/postings|jobs)\/\d+\/?$/i,
    authenticatedMarkerSelector: '',
    // Login mode only. Discovery mode returns to the Handshake-only boundary.
    // These are the identity-provider families Northwestern commonly uses; a
    // new redirect is blocked visibly until it is reviewed and allowlisted.
    loginHosts: Object.freeze([
      'northwestern.edu',
      'duosecurity.com',
      'login.microsoftonline.com',
    ]),
  }),
});

const SENSITIVE_KEY_RE = /(?:pass(?:word|wd)?|username|user_name|mfa|otp|totp|backup.?code|cookie|authorization|auth.?header|csrf|oauth|access.?token|refresh.?token|session.?token|session.?id|client.?secret)/i;

/** @param {unknown} source */
export function getAuthenticatedSource(source) {
  const key = String(source || '').trim().toLowerCase();
  const cfg = SOURCES[key];
  if (!cfg) throw new Error(`unsupported authenticated source: ${key || '(empty)'}`);
  return cfg;
}

/** True when target is nested inside base (or exactly base). */
function isWithin(base, target) {
  const rel = relative(resolve(base), resolve(target));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Resolve the profile root. Runtime overrides must be absolute and remain
 * outside the checkout. Tests can pass `baseDir` directly.
 */
export function resolveAuthenticatedProfileBase({ baseDir, repoRoot = CODE_ROOT, env = process.env } = {}) {
  const configured = baseDir ?? env.CAREER_OPS_AUTH_PROFILE_BASE;
  const raw = configured == null || String(configured).trim() === ''
    ? join(homedir(), '.career-ops', 'browser-profiles')
    : String(configured).trim();
  if (!isAbsolute(raw)) throw new Error('authenticated browser profile base must be an absolute path');
  const resolved = resolve(raw);
  if (isWithin(repoRoot, resolved)) {
    throw new Error('authenticated browser profiles must be stored outside the career-ops repository');
  }
  return resolved;
}

export function resolveAuthenticatedProfilePath(source, options = {}) {
  const cfg = getAuthenticatedSource(source);
  return join(resolveAuthenticatedProfileBase(options), cfg.id);
}

function chmodPrivate(path, mode) {
  try {
    chmodSync(path, mode);
  } catch (err) {
    // Windows and some network filesystems do not implement POSIX modes. The
    // directory remains isolated by path; callers can still surface real mkdir
    // failures, but chmod portability is not a reason to lose the session.
    if (process.platform !== 'win32' && err?.code !== 'ENOTSUP') throw err;
  }
}

export function ensurePrivateProfileDirectory(source, options = {}) {
  const base = resolveAuthenticatedProfileBase(options);
  const profile = resolveAuthenticatedProfilePath(source, options);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  chmodPrivate(base, 0o700);
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  chmodPrivate(profile, 0o700);
  return profile;
}

/** @param {string} host @param {readonly string[]} suffixes */
function hostMatches(host, suffixes) {
  const lower = host.toLowerCase().replace(/\.$/, '');
  return suffixes.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

export function isAuthenticatedSourceUrlAllowed(source, rawUrl, { loginMode = false } = {}) {
  const cfg = getAuthenticatedSource(source);
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (loginMode) return hostMatches(url.hostname, [...cfg.sourceHosts, ...cfg.loginHosts]);
  return hostMatches(url.hostname, cfg.sourceHosts)
    && cfg.discoveryPaths.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

export function assertAuthenticatedSourceUrl(source, rawUrl, options = {}) {
  if (!isAuthenticatedSourceUrlAllowed(source, rawUrl, options)) {
    throw new Error(`navigation blocked: URL is outside the ${source} authenticated-source allowlist`);
  }
  return new URL(String(rawUrl)).href;
}

/**
 * Validate an explicitly supplied posting URL and discard source tracking
 * parameters before navigation or output. Search/collection URLs belong to
 * interactive --search mode, not single-posting ingestion.
 */
export function normalizeAuthenticatedPostingUrl(source, rawUrl) {
  const cfg = getAuthenticatedSource(source);
  const url = new URL(assertAuthenticatedSourceUrl(cfg.id, rawUrl));
  if (!cfg.postingPath.test(url.pathname)) throw new Error(`expected a ${cfg.id} individual job-posting URL`);
  url.search = '';
  url.hash = '';
  return url.href;
}

/** Reject any API option that could smuggle credentials into this layer. */
export function rejectSensitiveAuthInput(value, path = 'options') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveAuthInput(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      throw new Error(`credential/session input is not accepted (${path}.${key})`);
    }
    rejectSensitiveAuthInput(child, `${path}.${key}`);
  }
}

/** Redact likely secrets before any caught browser error reaches a log. */
export function sanitizeAuthenticatedBrowserError(error) {
  let text = error instanceof Error ? error.message : String(error ?? 'unknown error');
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b((?:set-)?cookie|authorization|proxy-authorization|x-csrf-token|csrf(?:token)?|access_token|refresh_token|session(?:id|token)?|password|passwd|mfa(?:_?code)?|backup(?:_?code)?)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s;,]+)/gi, '$1=[REDACTED]')
    .replace(/([?&](?:token|access_token|refresh_token|session|sessionid|csrf|code)=)[^&#\s]+/gi, '$1[REDACTED]');
  return text.slice(0, 500);
}

export function classifyAuthenticatedPage(source, { url = '', text = '', status = 200 } = {}) {
  const lowerUrl = String(url).toLowerCase();
  const lower = String(text).toLowerCase().slice(0, 100_000);

  if (/captcha|verify you are human|security verification|unusual activity|automated activity|automation warning/.test(lower)) {
    return AUTH_STATES.HUMAN_CAPTCHA_REQUIRED;
  }
  if (/multi-factor|two-factor|two-step verification|verification code|approve.*duo|duo push|mfa/.test(lower)) {
    return AUTH_STATES.HUMAN_MFA_REQUIRED;
  }
  if (status === 401 || status === 403 || /access denied|not authorized|permission denied/.test(lower)) {
    return AUTH_STATES.ACCESS_DENIED;
  }
  const loginPath = /\/(?:login|signin|sign-in|auth|checkpoint)(?:[/?#]|$)/.test(lowerUrl);
  const loginText = /\bsign in\b|\blog in\b/.test(lower) && /password|email|username|single sign-on|sso/.test(lower);
  const linkedInGuest = source === 'linkedin' && /\bjoin now\b/.test(lower) && /\bsign in\b/.test(lower);
  if (loginPath || loginText || linkedInGuest) return AUTH_STATES.AUTH_REQUIRED;
  if (!isAuthenticatedSourceUrlAllowed(source, url, { loginMode: false })) return AUTH_STATES.INCOMPLETE;
  return AUTH_STATES.SUCCESS;
}

/**
 * Conservative session probe. LinkedIn exposes useful public job pages while
 * logged out, so URL/body success alone cannot be called authentication.
 */
export async function classifyAuthenticatedSession(session, source, { status = 200 } = {}) {
  const cfg = getAuthenticatedSource(source);
  const text = await session.visibleText();
  const state = classifyAuthenticatedPage(cfg.id, { url: session.currentUrl(), text, status });
  if (state !== AUTH_STATES.SUCCESS || !cfg.authenticatedMarkerSelector) return state;
  const hasMemberNavigation = await session.evaluate((selector) => Boolean(document.querySelector(selector)), cfg.authenticatedMarkerSelector).catch(() => false);
  return hasMemberNavigation ? AUTH_STATES.SUCCESS : AUTH_STATES.INCOMPLETE;
}

function metadataPath(profilePath) {
  return join(profilePath, STATUS_FILE);
}

export function readAuthenticatedSessionMetadata(source, options = {}) {
  const profilePath = resolveAuthenticatedProfilePath(source, options);
  const path = metadataPath(profilePath);
  if (!existsSync(path)) return { source: getAuthenticatedSource(source).id, lastSuccessfulJobPageAccess: null };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      source: getAuthenticatedSource(source).id,
      lastSuccessfulJobPageAccess: typeof raw?.lastSuccessfulJobPageAccess === 'string'
        ? raw.lastSuccessfulJobPageAccess
        : null,
    };
  } catch {
    return { source: getAuthenticatedSource(source).id, lastSuccessfulJobPageAccess: null };
  }
}

export function markAuthenticatedJobPageAccess(source, options = {}) {
  const profilePath = ensurePrivateProfileDirectory(source, options);
  const path = metadataPath(profilePath);
  const tmp = `${path}.tmp-${process.pid}`;
  const record = {
    source: getAuthenticatedSource(source).id,
    lastSuccessfulJobPageAccess: new Date().toISOString(),
  };
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  chmodPrivate(tmp, 0o600);
  renameSync(tmp, path);
  chmodPrivate(path, 0o600);
  return record;
}

export function resetAuthenticatedProfile(source, options = {}) {
  const sourceId = getAuthenticatedSource(source).id;
  const profilePath = resolveAuthenticatedProfilePath(sourceId, options);
  const base = resolveAuthenticatedProfileBase(options);
  if (dirname(profilePath) !== base || !Object.hasOwn(SOURCES, sourceId)) {
    throw new Error('refusing to reset an unresolved authenticated profile path');
  }
  const existed = existsSync(profilePath);
  if (existed) rmSync(profilePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  return { source: sourceId, profilePath, removed: existed };
}

/**
 * Install a context-wide guard for top-level navigation. Subresources are not
 * blocked: LinkedIn and Handshake legitimately load scripts/assets from CDNs,
 * but no authenticated page may navigate the main frame to an arbitrary host.
 */
async function installNavigationGuard(context, source, { loginMode = false } = {}) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const frame = request.frame?.();
    const topLevelNavigation = request.isNavigationRequest?.() === true && !frame?.parentFrame?.();
    if (topLevelNavigation && !isAuthenticatedSourceUrlAllowed(source, request.url(), { loginMode })) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
}

/**
 * Launch a visible persistent Chromium context and expose a narrow facade.
 * `launchPersistentContext` is injectable for credential-free unit tests.
 */
export async function withAuthenticatedBrowser(source, callback, options = {}) {
  rejectSensitiveAuthInput(options);
  if (options.headless === true) throw new Error('authenticated browsing requires a visible browser (headless=false)');
  const cfg = getAuthenticatedSource(source);
  const profilePath = ensurePrivateProfileDirectory(source, options);
  const playwright = options.launchPersistentContext
    ? null
    : await import('playwright');
  const launchPersistentContext = options.launchPersistentContext ?? playwright.chromium.launchPersistentContext.bind(playwright.chromium);
  const context = await launchPersistentContext(profilePath, {
    headless: false,
    acceptDownloads: false,
    locale: 'en-US',
    viewport: null,
  });

  try {
    await installNavigationGuard(context, cfg.id, { loginMode: options.loginMode === true });
    const page = context.pages()[0] ?? await context.newPage();
    page.on?.('download', (download) => { void download.cancel().catch(() => {}); });

    const session = Object.freeze({
      source: cfg.id,
      async goto(rawUrl, { timeout = DEFAULT_NAVIGATION_TIMEOUT_MS } = {}) {
        const url = assertAuthenticatedSourceUrl(cfg.id, rawUrl, { loginMode: options.loginMode === true });
        return page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      },
      currentUrl() { return page.url(); },
      async title() { return page.title(); },
      async visibleText(maxChars = 100_000) {
        const text = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
        return String(text).slice(0, Math.max(0, Math.min(100_000, maxChars)));
      },
      async evaluate(fn, arg) { return page.evaluate(fn, arg); },
      async waitForTimeout(ms) { return page.waitForTimeout(Math.max(0, Math.min(5_000, Number(ms) || 0))); },
      markSuccessfulJobPageAccess() { return markAuthenticatedJobPageAccess(cfg.id, options); },
      maxEvaluateResults: MAX_EVALUATE_RESULTS,
    });

    return await callback(session);
  } finally {
    await context.close();
  }
}

export async function authenticatedSessionStatus(source, options = {}) {
  const cfg = getAuthenticatedSource(source);
  const profilePath = resolveAuthenticatedProfilePath(cfg.id, options);
  const metadata = readAuthenticatedSessionMetadata(cfg.id, options);
  if (!existsSync(profilePath)) {
    return {
      profileExists: false,
      source: cfg.id,
      authenticated: 'unauthenticated',
      lastSuccessfulJobPageAccess: metadata.lastSuccessfulJobPageAccess,
    };
  }

  try {
    const result = await withAuthenticatedBrowser(cfg.id, async (session) => {
      const response = await session.goto(cfg.jobsUrl);
      const state = await classifyAuthenticatedSession(session, cfg.id, { status: response?.status?.() ?? 200 });
      if (state === AUTH_STATES.SUCCESS) session.markSuccessfulJobPageAccess();
      return state;
    }, options);
    return {
      profileExists: true,
      source: cfg.id,
      authenticated: result === AUTH_STATES.SUCCESS
        ? 'authenticated'
        : result === AUTH_STATES.AUTH_REQUIRED
          ? 'unauthenticated'
          : 'unclear',
      lastSuccessfulJobPageAccess: readAuthenticatedSessionMetadata(cfg.id, options).lastSuccessfulJobPageAccess,
    };
  } catch (err) {
    // Status is deliberately metadata-minimal. Browser failures are reduced to
    // "unclear" here; discovery commands surface a sanitized operational error.
    void err;
    return {
      profileExists: true,
      source: cfg.id,
      authenticated: 'unclear',
      lastSuccessfulJobPageAccess: metadata.lastSuccessfulJobPageAccess,
    };
  }
}

export const AUTHENTICATED_SOURCE_DEFINITIONS = SOURCES;
