# Using Tuloy locally

Install Node.js 24 and dependencies using the README commands. Run `npm run setup` in an empty checkout, then `npm start`. The working app opens at http://127.0.0.1:3210. There is no demo mode in the shared package.

## Setup

Prepare a CV as a Markdown or plain-text file. Setup asks for your name, preferred location, target roles, its path, and optional Greenhouse, Lever or Ashby employer-board URLs. It writes `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `portals.yml` from your answers. It never infers credentials, authorization, compensation, or previous employment. If any of these files exists, setup stops and preserves it.

You can leave employer boards blank and use Explore, whose supported public ATS datasets do not require an inherited company list. Add your own boards through `portals.yml` to use the direct scanner (`npm run scan`). The blank example is at `config/portals.example.yml`; it contains no search parameters and is not an active configuration.

For PDF import and AI-assisted evaluation, choose an installed, authenticated tool in Settings. Pasted Markdown/text can be reviewed and saved without an AI tool. Browser-assisted features require Chromium: `npx playwright install chromium`.

## Everyday workflow

1. Open Today or Explore. Enter your own role and location filters and start a search when ready.
2. Inspect posting details and evidence. Remote labels alone do not establish geographic eligibility.
3. Add an opportunity for review. Saving it does not record an application or confirm eligibility.
4. Use Review and Pipeline to assess opportunities and track actions. Mark Not a Fit where appropriate; restore through the dismissal workflow.
5. Apply through the employer yourself. Record the outcome and use Follow-ups for subsequent actions.

Existing `CAREER_OPS_*` environment variables and data paths are retained for compatibility. An existing personalized installation continues to use its own configuration; the source export omits it. Use `npm run build` and `npm run serve` for a production build served locally. Never publish the live server or its build output.
