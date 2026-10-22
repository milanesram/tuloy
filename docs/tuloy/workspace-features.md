# Career strategies, documents and scheduled discovery

## Career strategies

Open **Career strategies**. The current A/B/C strategy stays active until you explicitly choose custom routes and save. Add route codes, labels, literal title terms, responsibility terms, exclusions and approved resume references. Duties outweigh titles; competing routes remain uncertain. Custom routes can represent other professions without inheriting governance-specific occupational exclusions. They always require manual scope review, and cannot confirm credentials, authorization or suitability. Closed postings, explicit location exclusions and mandatory evidence gaps still apply.

Custom routes also seed Explore's role terms when reopened. Existing CV, profile and portals preferences are not rewritten. Save a schedule's explicit filters separately; a schedule never silently changes when the active strategy changes. Switch back to **Keep my current strategy and rules** to restore legacy routing.

Private settings live in `config/career-strategies.json`, with locked, revision-checked atomic saves. The public example is fictional and inactive. No active user strategy is exported.

## Document library

Open **Documents** to search existing files in `output/`, `documents/` and `reports/`. PDFs open in a viewer; DOCX, Markdown and text download. The library does not edit, upload, delete or send files to AI providers. HTML and executable formats are excluded. Symlink paths and traversal are rejected; file reads use opaque identifiers and containment checks. Files larger than 50 MB must be opened locally. Lists are bounded to 5,000 documents and eight directory levels, with truncation reported.

## Scheduled discovery

Open **Scheduled discovery**, add a paused schedule, enter role keywords, location filters, supported sources, a date window and a source limit, then save. **Run now** performs an explicit one-time search even while paused. Set **Enabled** and save to allow timed runs. You can pause any schedule without deleting its history.

The macOS background worker checks due schedules every five minutes, while logged in and the Mac is awake. It continues when the app is closed. Missed runs are performed once after wake; it does not backfill every missed interval. Install it from the page or with `npm run discovery:install`. On other operating systems, configure the OS scheduler to execute `npm run discovery:tick` every five minutes. No default searches or enabled schedules are shipped.

The worker reuses `scan-ats-full.mjs` with explicit serialized filters and `--dry-run --json`, without a per-job AI call. It never invokes application, queue or tracker writers. Results and diagnostics are saved under `data/scheduled-discovery/`; schedule state and recent run history are in `data/discovery-schedules.json`. Historical result files remain intact. Source failures, limits, stale datasets and early stops are shown as failed or degraded, not as a successful empty search. The current display shows up to 200 results; the full receipt is retained locally.

Inspect **View last results**, then explicitly **Add for review** if useful. The existing queue admission, identity and dismissal rules still apply. No role is automatically added or submitted. Changing a preparation stage or strategy never records Applied.

The Mac must be powered on and awake. Background searches contact the selected public job sources; they are not a cloud service. Per-run time is bounded to four minutes, and overlapping runners use a shared lock. Settings edits during a run are retained. A worker installation does not enable or create a schedule.

To stop searches, pause all schedules. The generated LaunchAgent is named `local.tuloy.discovery.<workspace-hash>` under the user's `Library/LaunchAgents` folder and is specific to the data root. Pausing keeps history and the worker configuration intact.

## Privacy and updates

Missing settings are read as inactive defaults; malformed settings are reported without replacement. Active strategies, schedules, results and documents are private and excluded from clean exports. Only reusable code, inactive fictional examples and this documentation belong in GitHub. The public marketing website remains separate from the local application.
