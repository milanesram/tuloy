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

## Workspace features — October 22, 2026

A subsequent update added configurable career routes, a read-only document library and scheduled discovery. The existing strategy remains the default. New schedules start paused; background-worker installation creates no searches. Results require an explicit Add for review action.

- 41 focused workflow, preservation and publication checks passed against the local source.
- All 727 local web tests, type checking and the separate production build passed.
- The clean exported package passed 25 feature, preparation and publication checks.
- Browser checks used fictional data to save a custom route, seed Explore, filter documents and save a paused schedule. A mocked partial scan displayed a degraded result with coverage diagnostics.
- The local deployment retained all 1,447 inventoried private files byte for byte. The macOS worker was installed and loaded with no schedules enabled. Live strategy and scheduling pages were verified without saving user settings.

No live job search, AI call or application submission was needed for this update. Scheduled external-source behavior is covered by adapter and mocked failure tests; source availability remains dependent on the providers. GitHub publication uses the existing clean-source exporter, which excludes active strategies, schedules, receipts and personal documents.
