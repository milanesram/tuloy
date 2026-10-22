// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Lever provider — hits the public postings endpoint.
// Auto-detects from careers_url via jobs.(eu.)?lever.co/<slug>.
// Handles both explicit `api:` URLs and auto-detection from `careers_url`.

import { textFingerprint } from '../lib/posting-evidence.mjs';
import { htmlToText } from './_html-to-text.mjs';

const ALLOWED_LEVER_HOSTS = new Set(['api.lever.co', 'api.eu.lever.co']);

// The v0 postings endpoint returns the whole board in one response, with every
// description inlined, so a large board outgrows _http.mjs's 10s default:
// jobgether is 42.8 MB and aborted at 10s on its own (#4177). Same value and
// reasoning as ASHBY_TIMEOUT_MS, the other one-response board-wide ATS feed.
const LEVER_TIMEOUT_MS = 30_000;

/** @param {string} url */
function assertLeverUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`lever: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`lever: URL must use HTTPS: ${url}`);
  if (!ALLOWED_LEVER_HOSTS.has(parsed.hostname))
    throw new Error(`lever: untrusted hostname "${parsed.hostname}" — must be one of: ${[...ALLOWED_LEVER_HOSTS].join(', ')}`);
  return url;
}

/** @param {import('./_types.js').PortalEntry} entry */
function resolveApiUrl(entry) {
  // Explicit api: wins — lets an entry keep a human-facing corporate
  // careers_url (e.g. https://www.coalfire.com/careers) while still pinning
  // the Lever postings board (mirrors greenhouse's api: precedence).
  if (entry.api) {
    assertLeverUrl(entry.api);
    return entry.api;
  }
  let url;
  try {
    url = new URL(entry.careers_url || '');
  } catch {
    return null;
  }
  const host = url.hostname.match(/^jobs\.((?:eu\.)?lever\.co)$/);
  if (!host) return null;
  const slug = url.pathname.split('/').filter(Boolean)[0];
  if (!slug) return null;
  return `https://api.${host[1]}/v0/postings/${slug}`;
}

/** Fold `categories.location` together with any extra `categories.allLocations`
 *  into one string. Lever puts a SINGLE primary city in `location`, and exposes
 *  the full set on multi-location postings in `allLocations` — reading only the
 *  former silently hides every other eligible location from scan.mjs's
 *  location_filter (e.g. a req open in Barcelona AND Montevideo looks
 *  Barcelona-only). Mirrors resolveLocation() in providers/remotli.mjs.
 *  @param {any} categories */
function resolveLocation(categories) {
  const primary = typeof categories?.location === 'string' ? categories.location.trim() : '';
  const all = Array.isArray(categories?.allLocations)
    ? categories.allLocations.filter(l => typeof l === 'string' && l.trim()).map(l => l.trim())
    : [];
  const merged = [];
  for (const l of [primary, ...all]) {
    if (l && !merged.some(m => m.toLowerCase() === l.toLowerCase())) merged.push(l);
  }
  return merged.join('; ');
}

/** Lever splits the public body across description, extra lists and closing
 * content. descriptionPlain alone excludes requirements in `lists`.
 * @param {any} posting */
export function completePostingText(posting, blocks = false) {
  const plainOrHtml = (plain, html) => typeof plain === 'string' && plain.trim()
    ? plain.trim() : htmlToText(html, Infinity, blocks);
  const parts = [plainOrHtml(posting?.descriptionPlain, posting?.description)];
  for (const section of Array.isArray(posting?.lists) ? posting.lists : []) {
    const heading = typeof section?.text === 'string' ? section.text.trim() : '';
    const body = htmlToText(section?.content, Infinity, blocks);
    if (heading || body) parts.push([heading, body].filter(Boolean).join('\n'));
  }
  parts.push(plainOrHtml(posting?.additionalPlain, posting?.additional));
  parts.push(plainOrHtml(posting?.salaryDescriptionPlain, posting?.salaryDescription));
  return parts.filter(Boolean).join('\n\n');
}

// Preserve canonical text bytes while recovering true HTML list boundaries for
// qualification. Offsets are accepted only against the exact text fingerprint.
export function completePostingStructure(posting) {
  const description=completePostingText(posting), blocks=completePostingText(posting,true).split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const descriptionBreaks=[];let offset=0;
  for(const block of blocks) {
    const index=description.indexOf(block,offset);
    if(index<offset || /\S/.test(description.slice(offset,index))) return {};
    if(index>0 && description[index-1]===' ') descriptionBreaks.push(index);
    offset=index+block.length;
  }
  if(/\S/.test(description.slice(offset))) return {};
  return descriptionBreaks.length ? {descriptionBreaks,jdTextFingerprint:textFingerprint(description)} : {};
}

/** @type {Provider} */
export default {
  id: 'lever',

  detect(entry) {
    try {
      const apiUrl = resolveApiUrl(entry);
      return apiUrl ? { url: apiUrl } : null;
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const apiUrl = resolveApiUrl(entry);
    if (!apiUrl) throw new Error(`lever: cannot derive API URL for ${entry.name}`);
    assertLeverUrl(apiUrl);
    const json = await ctx.fetchJson(apiUrl, { redirect: 'error', timeoutMs: LEVER_TIMEOUT_MS });
    if (!Array.isArray(json)) return [];
    return json.map(j => {
      const description = completePostingText(j);
      return {
        title: j.text || '',
        url: j.hostedUrl || '',
        company: entry.name,
        location: resolveLocation(j.categories),
        description,
        descriptionComplete: Boolean(description.trim()),
        ...completePostingStructure(j),
        companySource: 'configured-ats-board',
        sourceProvider: 'lever',
        sourcePublisher: 'Lever',
        sourceBoard: new URL(apiUrl).pathname.split('/').filter(Boolean).at(-1),
        sourceId: typeof j.id === 'string' ? j.id : '',
        postedAt: typeof j.createdAt === 'number' ? j.createdAt : undefined,
      };
    });
  },
};
