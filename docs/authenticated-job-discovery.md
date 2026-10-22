# Authenticated job discovery

Career-Ops can read a bounded set of LinkedIn or Handshake jobs from a visible,
user-authenticated Chromium session. It does not log in for you and never
accepts credentials, MFA codes, cookies, or tokens.

Browser profiles are isolated by source and stored outside the repository:

- `~/.career-ops/browser-profiles/linkedin/`
- `~/.career-ops/browser-profiles/handshake/`

## First-time LinkedIn setup

```bash
node auth-browser.mjs login linkedin
```

Log in manually in the visible browser, complete any challenge yourself, then
press Enter in the terminal. Career-Ops does not receive what you enter.

## First-time Handshake setup

```bash
node auth-browser.mjs login handshake
```

Complete Northwestern SSO, MFA, or Duo manually. Career-Ops does not automate
or store university authentication.

## Check or reset a session

```bash
node auth-browser.mjs status linkedin
node auth-browser.mjs status handshake
node auth-browser.mjs reset linkedin
node auth-browser.mjs reset handshake
```

Reset removes only the named Career-Ops profile. It never touches a normal
Chrome, Safari, or Firefox profile.

## Review one job URL

```bash
node discover-authenticated.mjs linkedin --url "https://www.linkedin.com/jobs/view/1234567890"
node discover-authenticated.mjs handshake --url "https://app.joinhandshake.com/stu/postings/1234567"
```

## Review one bounded visible search result set

```bash
node discover-authenticated.mjs linkedin --search
node discover-authenticated.mjs handshake --search
```

Adjust keywords, location, and filters yourself in the visible browser. Press
Enter in the terminal only when the one result set you want reviewed is visible.
Career-Ops does not infinite-scroll, paginate recommendations, or silently alter
your filters. The maximum extracted batch is 25 visible records.

Results are printed for review and are not written to the pipeline. When a
posting exposes a public employer/ATS link, Career-Ops resolves that link only
after the authenticated browser closes; otherwise it reports
`SOURCE ONLY / CANONICAL NOT FOUND`. Raw location is preserved until the shared
Greater Chicago normalizer is available.

## Security and action boundaries

- Visible browser only; authenticated mode never runs headless.
- Separate LinkedIn and Handshake profiles with restrictive permissions.
- Top-level navigation is source-allowlisted.
- Employer canonicalization happens later through public mechanisms without
  carrying LinkedIn or Handshake cookies.
- No screenshots are retained and downloads are disabled.
- No Easy Apply, Handshake Apply, form filling, resume upload, messaging,
  connection requests, outreach, or submission.
- Discovery is review-only. It does not write `data/pipeline.md`, application
  records, or scan history. Human approval remains the pipeline gate.

Failures are explicit: `AUTH_REQUIRED`, `HUMAN_MFA_REQUIRED`,
`HUMAN_CAPTCHA_REQUIRED`, `ACCESS_DENIED`, `SOURCE_LAYOUT_CHANGED`,
`EXTRACTION_FAILED`, or `INCOMPLETE`. A failed source is never reported as an
empty successful search.
