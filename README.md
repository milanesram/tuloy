<img src="docs/tuloy/wordmark.svg" alt="Tuloy" width="200">

A local job-search workspace. *Tuloy* means to continue; as a welcome, it invites you in.

This is the setup I use to organize my job search. I’m sharing the application in case it’s useful to you too. Bring your own CV, preferences, and sources.

## Run it locally

Requires Node.js 24 and npm.

```sh
npm install --ignore-scripts
npm --prefix web ci --ignore-scripts
npm run setup
npm start
```

Open **http://127.0.0.1:3210**. The introduction is at **/welcome**, with the story behind the name at **/about**. Your working home stays at **/**. This opens the working application: Today, Explore, Review, Pipeline, Follow-ups, Sources, Analytics, CV, and Settings.

Setup asks for your own name, location, target roles, and a text/Markdown CV. You can optionally add employer boards. It preserves existing workspaces and runs no search. You can also start the app first and use its onboarding. [Setup and everyday use](docs/tuloy/using-tuloy.md).

## What it does

- Search supported employer sources using your filters.
- Review job details, qualification evidence, and unresolved requirements.
- Keep discoveries separate from applications, save roles for review, dismiss unsuitable roles, and restore them later.
- Track applications, outcomes, and follow-ups in local files.
- Use your configured AI tool for evaluation, CV preparation, and other assisted workflows. You review and submit applications yourself.

Explore can search supported ATS datasets with the filters you enter. Direct employer-board scanning uses your own `portals.yml`. Availability and coverage depend on the source. Browser-based workflows need `npx playwright install chromium`. AI features need a supported installed and authenticated tool selected in Settings; public HTTP-based discovery does not require an AI key.

## Your own data

The shared application contains no active search parameters, employer shortlist, CV, application records, search results, scan history, browser sessions, or saved assistant conversations from my workspace. It starts without a profile or results. Tests use synthetic fixtures.

Your setup creates private local configuration. Those files are ignored by Git. Files stay on your computer; AI providers you choose may receive the content used for AI tasks. Keep the server local.

## Origin

Tuloy is my customized version of [Career Ops](https://github.com/career-ops-hq/career-ops), originally authored by Santiago Fernández de Valderrama and contributors. It retains the original engine and web application, with local workflow changes and Tuloy branding. The original [MIT license](LICENSE) and notices are retained.

## Development

```sh
npm run test:tuloy
node --test tests/manual-review-queue.test.mjs tests/ops-dismiss.test.mjs tests/fresh-search.test.mjs
npm --prefix web test
npm --prefix web run typecheck
npm run build
npm run serve
```

[Validation notes](docs/tuloy/validation.md) · [Preparing a clean source copy](docs/tuloy/sharing.md)

For maintainers: [publish code updates without runtime data](docs/tuloy/sharing.md#publishing-future-updates).
