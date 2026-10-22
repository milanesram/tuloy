// Shared, pure provenance rules used by the CLI providers/writer and /ops.
// Located inside web/ so Next can bundle it without a second implementation.
const text = value => typeof value === "string" ? value.trim() : "";
const KINDS = new Set(["SOURCE_LABEL", "SOURCE_STRUCTURED", "CONFIGURED_EMPLOYER", "CANONICAL_EMPLOYER", "JD_EMPLOYER", "ATS_BOARD"]);
const strong = item => ["CANONICAL_EMPLOYER", "JD_EMPLOYER"].includes(item.kind);
const key = value => text(value).normalize("NFKC").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const validName = value => Boolean(text(value)) && !/^(?:not captured|unknown|confidential|company|employer)$/i.test(text(value));
const explicitName = value => validName(value) && !/\b(?:we|our|you|your|perform|responsible|will|must|requirements|looking|join|support|manage|seeking)\b/i.test(value);
const safeUrl = value => {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
};
function providerFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    if (/(^|\.)builtin(?:chicago\.org|\.com|[a-z]+\.com)$/.test(host)) return "builtin";
    if (/(^|\.)greenhouse\.io$/.test(host) || new URL(value).searchParams.has("gh_jid")) return "greenhouse";
    if (/(^|\.)ashbyhq\.com$/.test(host)) return "ashby";
    if (/(^|\.)lever\.co$/.test(host)) return "lever";
    if (/(^|\.)myworkdayjobs\.com$/.test(host)) return "workday";
  } catch { /* no identity inferred from malformed URLs */ }
  return "";
}
function cleanEvidence(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => item && KINDS.has(item.kind) && validName(item.value))
    .map(item => ({ kind: item.kind, value: text(item.value), url: safeUrl(item.url) }))
    .filter(item => { const id = JSON.stringify(item); if (seen.has(id)) return false; seen.add(id); return true; })
    .sort((left, right) => {
      const rank = { CANONICAL_EMPLOYER: 4, JD_EMPLOYER: 3, CONFIGURED_EMPLOYER: 2, SOURCE_STRUCTURED: 1, SOURCE_LABEL: 0, ATS_BOARD: -1 };
      return rank[right.kind] - rank[left.kind] || left.value.localeCompare(right.value) || left.url.localeCompare(right.url);
    });
}

/** Only explicit employer self-identification in a complete body is evidence.
 * Mentions of customers, competitors, skills or URLs never become names. */
export function employerNamesFromJd(jd) {
  const value = text(jd);
  const patterns = [
    /(?:^|\n)\s*(?:Employer|Hiring company|Hiring organization)\s*:\s*([^\n.;]{2,120})(?=\n|$|[.;])/gimu,
    /\bAbout (?:Us|the Company)\s*[:.–-]?\s+At\s+([\p{L}\d][\p{L}\d '&().-]{1,100}?),\s+we\b/gimu,
    // A recruiting heading must be corroborated by the described employing
    // function. A customer's name, acquisition mention or footer alone is not
    // enough to resolve a represented employer or corporate relationship.
    /\bWhy\s+[\p{L}\d &/-]{1,40}\s+at\s+([\p{L}\d][\p{L}\d '&().-]{1,80}?)\?/gimu,
  ];
  return [...new Set(patterns.flatMap((pattern, index) => [...value.matchAll(pattern)].map(match => text(match[1]))
    .filter(name => {
      if (index !== 2) return true;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b(?:function|team|department) at ${escaped}\\b|\\b${escaped}(?: Corporation| Inc\\.?| LLC)? is an? (?:equal opportunity|EO) employer\\b`, 'iu').test(value);
    })).filter(explicitName))];
}

/** Never rewrites `company`. Names asserted by canonical metadata or explicit
 * JD self-identification outrank source labels for diagnostics, but disagreement
 * remains unresolved rather than silently selecting one as canonical truth. */
export function resolveEmployerIdentity(input = {}) {
  const company = text(input.company);
  const canonicalUrl = safeUrl(input.url);
  const sourceUrl = safeUrl(input.sourceUrl || input.discoveredUrl || canonicalUrl);
  const sourceProvider = text(input.sourceProvider || input.source).toLowerCase().replace(/-(?:api|full)$/, "")
    || providerFromUrl(sourceUrl) || providerFromUrl(canonicalUrl);
  const aggregator = sourceProvider === "builtin" || providerFromUrl(sourceUrl) === "builtin" || /^aggregator-/i.test(text(input.companySource));
  const companySource = text(input.companySource) || (aggregator ? "aggregator-label" : "legacy-company");
  const sourcePublisher = text(input.sourcePublisher) || (aggregator ? "Built In" : sourceProvider || "Not captured");
  const evidence = [...(Array.isArray(input.employerIdentityEvidence) ? input.employerIdentityEvidence : [])];
  if (validName(company)) evidence.push({ kind: aggregator ? "SOURCE_LABEL" : "CONFIGURED_EMPLOYER", value: company, url: sourceUrl });
  if (input.descriptionComplete === true || input.jdQuality === "COMPLETE") {
    for (const name of employerNamesFromJd(input.jd || input.description)) evidence.push({ kind: "JD_EMPLOYER", value: name, url: canonicalUrl || sourceUrl });
  }
  const employerIdentityEvidence = cleanEvidence(evidence);
  const names = employerIdentityEvidence.filter(item => item.kind !== "ATS_BOARD");
  const authoritative = names.filter(strong);
  const distinct = new Set(names.map(item => key(item.value)));
  const conflict = distinct.size > 1 || input.employerIdentityStatus === "CONFLICT";
  const employerIdentityName = authoritative[0]?.value || null;
  const employerIdentityStatus = conflict ? "CONFLICT"
    : input.identityMetadataInvalid || !validName(company) || (aggregator && !authoritative.length) ? "AMBIGUOUS"
    : authoritative.length ? "CONFIRMED" : "CONSISTENT";
  const employerIdentityConfidence = employerIdentityStatus === "CONFIRMED" ? "HIGH"
    : employerIdentityStatus === "CONSISTENT" ? "MEDIUM" : "LOW";
  const employerIdentityReasons = employerIdentityStatus === "CONFLICT"
    ? ["EMPLOYER_IDENTITY_CONFLICT: source employer labels and captured employer evidence disagree; human confirmation required"]
    : employerIdentityStatus === "AMBIGUOUS"
      ? [input.identityMetadataInvalid ? "EMPLOYER_IDENTITY_AMBIGUOUS: stored provenance is unreadable; human confirmation required"
        : "EMPLOYER_IDENTITY_AMBIGUOUS: employer identity lacks authoritative corroboration; human confirmation required"]
      : [employerIdentityStatus === "CONFIRMED" ? "EMPLOYER_IDENTITY_CONFIRMED: explicit employer evidence agrees with the displayed employer"
        : "EMPLOYER_IDENTITY_CONSISTENT: available employer labels agree; independent confirmation is not claimed"];
  return { companySource, sourceProvider, sourcePublisher, employerIdentityStatus, employerIdentityConfidence,
    employerIdentityName, employerIdentityEvidence, employerIdentityReasons };
}

/** Optional metadata rides the existing pipeline row; no new store or status. */
export function encodeEmployerIdentity(identity) {
  const json = JSON.stringify({ v: 1, companySource: identity.companySource, sourceProvider: identity.sourceProvider,
    sourcePublisher: identity.sourcePublisher, employerIdentityEvidence: identity.employerIdentityEvidence,
    ...(identity.employerIdentityStatus === "CONFLICT" ? { employerIdentityStatus: "CONFLICT" } : {}) });
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeEmployerIdentity(encoded) {
  if (!text(encoded)) return {};
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 64_000) throw new Error("invalid provenance");
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (value?.v !== 1 || !Array.isArray(value.employerIdentityEvidence)) throw new Error("invalid provenance");
    return { companySource: text(value.companySource), sourceProvider: text(value.sourceProvider), sourcePublisher: text(value.sourcePublisher),
      employerIdentityEvidence: cleanEvidence(value.employerIdentityEvidence),
      ...(value.employerIdentityStatus === "CONFLICT" ? { employerIdentityStatus: "CONFLICT" } : {}) };
  } catch { return { identityMetadataInvalid: true }; }
}
