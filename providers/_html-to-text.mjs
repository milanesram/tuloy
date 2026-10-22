// @ts-check
// Shared HTML → plain-text pipeline for providers whose payloads embed
// description markup. Greenhouse's contentToText was the first instance;
// this is the extracted form so later providers cannot grow a divergent
// copy — same rationale that produced _html-entities when entity decoders
// drifted across four files (#1555/#1639/#2623).
import { decodeEntities } from './_html-entities.mjs';

// Capped like greenhouse/alibaba full-text JDs: a 10 KB/posting body is
// normal on these boards, and scan payloads must stay sane.
export const DESCRIPTION_CAP = 4000;

// A tag ends at an unquoted `>`. Attribute values may contain angle brackets,
// so the common `<[^>]+>` shortcut can stop midway through a tag and expose
// the remaining attributes as description text. Requiring content between the
// brackets preserves a literal `<>`, as the old matcher did.
const HTML_TAG_RE = /<(?:[^>"']|"[^"]*"|'[^']*')+>/g;
const HTML_MEDIA_RE = /<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi;

/** @param {string} content */
function stripMarkup(content, blocks = false) {
  return content.replace(HTML_MEDIA_RE, ' ').replace(HTML_TAG_RE, tag => blocks && /^<\/?(?:p|li|h[1-6]|br|div|ul|ol)\b/i.test(tag) ? '\n' : ' ');
}

/**
 * Entity-decoded markup → stripped plain text.
 *
 * Double-decode: the payload often carries entity-escaped tags (`&lt;p&gt;`),
 * so the first pass reveals real tags, and text-level entities (`&amp;`,
 * `&#39;`) only become decodable once those tags are gone. Plain text is what
 * the description-consuming filters match against — substring matching over
 * raw HTML misses keywords split by a tag and pads matches into attribute
 * soup.
 *
 * Exported for tests.
 *
 * @param {unknown} content
 * @param {number} [maxChars] Maximum returned characters. Existing provider
 *   payloads keep the 4,000-character scanner cap; callers archiving a complete
 *   public detail page may explicitly pass Infinity.
 * @param {boolean} [blocks] Preserve structural breaks for optional evidence offsets; default text is unchanged.
 * @returns {string}
 */
export function htmlToText(content, maxChars = DESCRIPTION_CAP, blocks = false) {
  if (typeof content !== 'string' || !content) return '';
  // Strip literal markup before decoding: quote entities inside a quoted
  // attribute are data, and decoding them first would turn them into false
  // delimiters. Each decode is followed by a strip so double-encoded active
  // markup cannot become the final plain-text output. A final incomplete tag
  // opener has no closing `>` for stripMarkup() to consume, so drop only its
  // leading angle bracket; this keeps the text visible while making it inert.
  const decoded = decodeEntities(stripMarkup(content, blocks));
  const decodedTwice = decodeEntities(stripMarkup(decoded, blocks));
  const text = stripMarkup(decodedTwice, blocks)
    .replace(/<(?=\/?[a-z!?])/gi, '')
    .replace(blocks ? /[^\S\n]+/g : /\s+/g, ' ')
    .replace(blocks ? / *\n[\s\n]*/g : /$^/g, '\n')
    .trim();
  return Number.isFinite(maxChars) ? text.slice(0, Math.max(0, maxChars)) : text;
}
