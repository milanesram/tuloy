#!/usr/bin/env node

import readline from 'node:readline';
import {
  AUTH_STATES,
  AUTHENTICATED_SOURCE_DEFINITIONS,
  authenticatedSessionStatus,
  classifyAuthenticatedSession,
  getAuthenticatedSource,
  readAuthenticatedSessionMetadata,
  resetAuthenticatedProfile,
  sanitizeAuthenticatedBrowserError,
  withAuthenticatedBrowser,
} from './lib/authenticated-browser.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

const USAGE = `Usage:
  node auth-browser.mjs login <linkedin|handshake>
  node auth-browser.mjs status <linkedin|handshake>
  node auth-browser.mjs reset <linkedin|handshake>

Credentials, MFA values, cookies and tokens are never accepted by this command.`;

export function parseAuthBrowserArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--help') || args.includes('-h')) {
    if (args.some((arg) => arg.startsWith('-') && arg !== '--help' && arg !== '-h')) {
      throw new Error('auth-browser accepts no credential or option flags');
    }
    return { help: true };
  }
  if (args.some((arg) => arg.startsWith('-'))) throw new Error('auth-browser accepts no credential or option flags');
  const [command, rawSource, ...extra] = args;
  if (!['login', 'status', 'reset'].includes(command) || !rawSource || extra.length) {
    throw new Error('expected: auth-browser.mjs <login|status|reset> <linkedin|handshake>');
  }
  const source = getAuthenticatedSource(rawSource).id;
  return { command, source };
}

export function waitForTerminalEnter(prompt, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) {
    throw new Error('AUTHENTICATED SOURCE REQUIRES HUMAN ATTENTION: run this command in an interactive terminal');
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

export async function loginAuthenticatedBrowser(source, deps = {}) {
  const cfg = AUTHENTICATED_SOURCE_DEFINITIONS[source];
  const withBrowser = deps.withBrowser ?? withAuthenticatedBrowser;
  const wait = deps.waitForEnter ?? waitForTerminalEnter;
  console.error('Log in manually in the browser. Career-Ops does not receive your credentials.');
  return withBrowser(source, async (session) => {
    await session.goto(cfg.loginUrl);
    await wait('Complete login, MFA, or CAPTCHA yourself. Press Enter here when finished: ');
    const response = await session.goto(cfg.jobsUrl);
    const state = await classifyAuthenticatedSession(session, source, { status: response?.status?.() ?? 200 });
    if (state === AUTH_STATES.SUCCESS) session.markSuccessfulJobPageAccess();
    return {
      source,
      state,
      authenticated: state === AUTH_STATES.SUCCESS ? 'appears authenticated' : 'unclear',
      lastSuccessfulJobPageAccess: readAuthenticatedSessionMetadata(source, deps.browserOptions).lastSuccessfulJobPageAccess,
    };
  }, { loginMode: true, ...deps.browserOptions });
}

export async function runAuthBrowser(argv, deps = {}) {
  const parsed = parseAuthBrowserArgs(argv);
  if (parsed.help) return { help: true, usage: USAGE };
  if (parsed.command === 'login') return loginAuthenticatedBrowser(parsed.source, deps);
  if (parsed.command === 'status') {
    const status = deps.status ?? authenticatedSessionStatus;
    return status(parsed.source, deps.browserOptions);
  }
  const reset = deps.reset ?? resetAuthenticatedProfile;
  return reset(parsed.source, deps.browserOptions);
}

if (isMainModule(import.meta.url)) {
  try {
    const result = await runAuthBrowser(process.argv.slice(2));
    if (result.help) console.log(result.usage);
    else console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(sanitizeAuthenticatedBrowserError(err));
    console.error(USAGE);
    process.exitCode = 1;
  }
}
