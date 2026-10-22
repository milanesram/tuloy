#!/usr/bin/env node

import readline from 'node:readline';
import { flagValue, hasFlag, safeIntFlag } from './lib/cli-flags.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import {
  AUTH_STATES,
  AUTHENTICATED_SOURCE_DEFINITIONS,
  classifyAuthenticatedSession,
  getAuthenticatedSource,
  normalizeAuthenticatedPostingUrl,
  sanitizeAuthenticatedBrowserError,
  withAuthenticatedBrowser,
} from './lib/authenticated-browser.mjs';
import { canonicalizeAuthenticatedOpportunity } from './lib/authenticated-opportunity.mjs';
import {
  extractLinkedInPosting,
  extractLinkedInSearch,
} from './authenticated-sources/linkedin.mjs';
import {
  extractHandshakePosting,
  extractHandshakeSearch,
} from './authenticated-sources/handshake.mjs';

const DEFAULT_MAX = 25;
const MAX_ALLOWED = 25;
const ADAPTERS = Object.freeze({
  linkedin: Object.freeze({ detail: extractLinkedInPosting, search: extractLinkedInSearch }),
  handshake: Object.freeze({ detail: extractHandshakePosting, search: extractHandshakeSearch }),
});

const USAGE = `Usage:
  node discover-authenticated.mjs linkedin --url "https://www.linkedin.com/jobs/view/..."
  node discover-authenticated.mjs linkedin --search [--max 25]
  node discover-authenticated.mjs handshake --url "https://app.joinhandshake.com/stu/postings/..."
  node discover-authenticated.mjs handshake --search [--max 25]

Review-only: no pipeline writes, applications, messages, form entry or submission.`;

const SENSITIVE_FLAG_RE = /^--(?:user(?:name)?|email|pass(?:word|wd)?|mfa|otp|cookie|authorization|csrf|token|session|client-secret)/i;

export function parseAuthenticatedDiscoveryArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const sensitive = args.find((arg) => SENSITIVE_FLAG_RE.test(arg));
  if (sensitive) throw new Error(`credential/session flag is forbidden: ${sensitive.split('=')[0]}`);
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  if (!args[0] || args[0].startsWith('-')) throw new Error('the first argument must be linkedin or handshake');
  const source = getAuthenticatedSource(args[0]).id;
  const known = new Set(['--url', '--search', '--max']);
  const consumedOperands = new Set([0]);
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) continue;
    const flag = arg.split('=')[0];
    if (!known.has(flag)) throw new Error(`unrecognized flag: ${flag}`);
    if ((flag === '--url' || flag === '--max') && arg === flag) {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`${flag} requires a value`);
      consumedOperands.add(index + 1);
    }
  }
  const unexpected = args.find((arg, index) => index > 0 && !arg.startsWith('-') && !consumedOperands.has(index));
  if (unexpected) throw new Error(`unexpected positional argument: ${unexpected}`);
  for (const flag of known) {
    const occurrences = args.filter((arg) => arg === flag || arg.startsWith(`${flag}=`));
    if (occurrences.length > 1) throw new Error(`flag may be supplied only once: ${flag}`);
  }
  const urlPresent = hasFlag(args, '--url');
  const search = args.includes('--search');
  if (urlPresent === search) throw new Error('choose exactly one of --url or --search');
  const url = urlPresent ? flagValue(args, '--url') : undefined;
  if (urlPresent && !url) throw new Error('--url requires a value');
  const max = Math.max(1, Math.min(MAX_ALLOWED, safeIntFlag(flagValue(args, '--max'), DEFAULT_MAX)));
  return { source, mode: search ? 'search' : 'url', url, max };
}

export function waitForSearchReady(prompt, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) {
    throw new Error('AUTHENTICATED SOURCE REQUIRES HUMAN ATTENTION: run --search in an interactive terminal');
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

export async function runAuthenticatedDiscovery(config, deps = {}) {
  const cfg = getAuthenticatedSource(config.source);
  const adapter = deps.adapter ?? ADAPTERS[cfg.id];
  const withBrowser = deps.withBrowser ?? withAuthenticatedBrowser;
  const canonicalize = deps.canonicalize ?? canonicalizeAuthenticatedOpportunity;
  const wait = deps.waitForSearchReady ?? waitForSearchReady;

  try {
    const extracted = await withBrowser(cfg.id, async (session) => {
      if (config.mode === 'url') {
        await session.goto(normalizeAuthenticatedPostingUrl(cfg.id, config.url));
      } else {
        await session.goto(AUTHENTICATED_SOURCE_DEFINITIONS[cfg.id].jobsUrl);
        await wait('Adjust keywords, location, and filters in the visible browser. Press Enter when the results to analyze are visible: ');
      }

      const state = deps.classifySession
        ? await deps.classifySession(session, cfg.id)
        : await classifyAuthenticatedSession(session, cfg.id);
      if (state !== AUTH_STATES.SUCCESS) return { state, records: [] };

      const records = config.mode === 'url'
        ? await adapter.detail(session)
        : await adapter.search(session, { max: config.max });
      if (!records.length) return { state: AUTH_STATES.SOURCE_LAYOUT_CHANGED, records: [] };
      session.markSuccessfulJobPageAccess();
      return { state: AUTH_STATES.SUCCESS, records: records.slice(0, config.max) };
    }, deps.browserOptions);

    if (extracted.state !== AUTH_STATES.SUCCESS) {
      return {
        state: extracted.state,
        source: cfg.id,
        mode: config.mode,
        jobs: [],
        writes: { pipeline: false, applications: false, scanHistory: false },
      };
    }

    const byIdentity = new Map();
    for (const record of extracted.records) {
      const opportunity = await canonicalize(record);
      const existing = byIdentity.get(opportunity.identity);
      if (!existing) {
        byIdentity.set(opportunity.identity, opportunity);
      } else {
        existing.foundOn = [...new Set([...(existing.foundOn || []), ...(opportunity.foundOn || [])])];
        existing.sourceOccurrences.push(...opportunity.sourceOccurrences);
      }
    }

    return {
      state: AUTH_STATES.SUCCESS,
      source: cfg.id,
      mode: config.mode,
      jobs: [...byIdentity.values()],
      writes: { pipeline: false, applications: false, scanHistory: false },
    };
  } catch (err) {
    return {
      state: AUTH_STATES.EXTRACTION_FAILED,
      source: cfg.id,
      mode: config.mode,
      error: sanitizeAuthenticatedBrowserError(err),
      jobs: [],
      writes: { pipeline: false, applications: false, scanHistory: false },
    };
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const args = parseAuthenticatedDiscoveryArgs(process.argv.slice(2));
    if (args.help) {
      console.log(USAGE);
    } else {
      const result = await runAuthenticatedDiscovery(args);
      console.log(JSON.stringify(result, null, 2));
      if (result.state !== AUTH_STATES.SUCCESS) {
        console.error('AUTHENTICATED SOURCE REQUIRES HUMAN ATTENTION');
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(sanitizeAuthenticatedBrowserError(err));
    console.error(USAGE);
    process.exitCode = 1;
  }
}
