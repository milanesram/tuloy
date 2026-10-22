# Operational application validation — October 22, 2026

The shared copy is the working application, with its real API routes, discovery engine, review queue, tracker, follow-ups and configuration. It has no mock workspace or active search configuration. The introduction at `/welcome` and story at `/about` are static information pages, independent of workspace providers.

Verified from a clean source copy with no personal data:

- Dependency installation from the local npm cache with install scripts disabled.
- Real first-run screen and an empty inbox/application tracker.
- Setup from explicitly supplied fictional CV, role and location inputs.
- Real CV reading and canonical pipeline writes through the application API.
- Review display and persistence after a browser reload.
- Not a Fit dismissal, restoration, and unchanged application records.
- Settings screen and no browser page errors during the workflow.
- Landing and About pages: desktop/mobile layouts, navigation, workflow anchors, setup-command copying, light/dark themes, and no application API calls. Seeded private-cache values were not displayed.
- 22 core/setup/export regression checks passed.
- All 720 shared web tests passed; private replay tests were omitted entirely.
- TypeScript checking and a production build passed.

Synthetic records used for this check are confined to a disposable installation and are not included in the shared package. Search parameters, selected employer boards, results, browser sessions, application records and private replay-test files are excluded. Existing local personal configuration and records were preserved; only the system example profile was cleared to avoid seeding invented facts for new users.

No live search, external application submission, model-provider call, GitHub push, or public hosting was performed. Cached installation is not a fresh-network installation test. AI and browser-based functions require each user's own tool setup. The build retains an inherited dynamic-filesystem tracing warning, so share the clean source rather than live server/build output. The inherited engine's entire root test suite and all external integrations were not rerun.
