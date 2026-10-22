# Preparing a clean source copy

Run `npm run share:prepare` from a Git checkout. It writes a new source folder under `.tuloy-showcase/` containing the operational application and a hash manifest. The legacy folder name is just an output location.

The copy contains no Git history, active profile, search parameters, selected employer boards, results, tracker, CV, browser session, or generated records. It omits the earlier demo route, fabricated screenshot assets, demo recording, personal campaign configuration tests, and private-result replay tests. A blank profile example and blank portal example allow the next person to configure their own workspace. System-owned batch helpers and operational reference documentation are included.

The README is a small personal sharing note with setup instructions and upstream credit. No testimonials, press badges, invented usage figures, or hiring claims are added.

Only Tuloy's validation workflow is copied into `.github/workflows`. The working application keeps its upstream Git remote; publication uses a separate checkout. Publish from a reviewed clean copy, not from the personalized working checkout or its history. The file manifest records the local baseline; exact upstream ancestry is not independently established. The credential/path check is a bounded preflight.

The original MIT license is retained. Upstream updates are adopted through reviewed merges; the derivative marker blocks automatic replacement and rollback. The public GitHub destination is `milanesram/tuloy`.

## Public introduction and future hosting

`/welcome` introduces Tuloy and `/about` explains the name and purpose. Both use public navigation without mounting private workspace providers; `/` remains the working local app. Workspace links navigate only when clicked. These pages show no user records or search results.

A future public marketing deployment should package only these information pages and their assets. A hosted workspace would be a separate phase with user sign-in, isolated storage and server-side credentials. The current local APIs and live build are not a hosted service. The landing page describes that possibility without advertising an available hosted edition.

## Publishing future updates

Keep using and editing the working local application. Publish through a separate source-only checkout; never push the personalized working checkout or copy its Git history.

```sh
npm run github:prepare -- --checkout /path/to/Tuloy-GitHub --message "Describe the update"
```

This exports approved source files, checks the publication allowlist, and commits only those files to the separate checkout. It does not push. Inspect the commit there, then use `git push origin main` from that checkout.

For a reviewed update in one step:

```sh
npm run github:push -- --checkout /path/to/Tuloy-GitHub --message "Describe the update"
```

The publishing command verifies the exact destination, a clean main branch, and matching GitHub history before it changes files. It never force pushes. A GitHub edit or unpublished local commit requires reconciliation first.

`publication-files.json` lists approved source paths. New files stop publication until reviewed and added to that list; file deletion is supported. Never add personal files to the list. Private paths remain excluded even if listed. Code edits still need review: an allowlist cannot detect every personal fact pasted into a source file. The exporter also checks common credential patterns and local home paths. Neither Git ignores nor this bounded content check is an exhaustive privacy detector.

Do not run the app or setup in the publishing checkout. Keep personal configuration and results in your working application. The public history begins with the clean source, retains MIT attribution, and uses the maintainer's GitHub noreply address for commits.
