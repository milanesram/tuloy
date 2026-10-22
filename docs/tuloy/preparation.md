# Preparation notes and Career Project returns

Open **Review**, select an opportunity, then use **Preparation notes**. Choose Reviewing, Selected for application, Preparing documents, Ready for manual submission, or On hold. Add the approved resume version, prepared-document references, next action and the reviewed conclusion returned from your Career Project. Press **Save preparation**. Records persist across refreshes and local browser ports because they are stored in the workspace, rather than browser preferences.

Evidence tasks explain what needs research. Record the source URL, your note and whether it was reviewed or could not be confirmed. Changed posting evidence requires another review; previous notes remain available. A research note never upgrades automated eligibility or creates facts in your CV.

Preparation stages and review decisions are separate from application status. **Pass — keep this note** retains a research decision; **Not a Fit** controls discovery dismissal. Only the existing explicit manual-submission flow records Applied. The app never submits externally.

The private source of truth is `data/opportunity-workflow.md`. It contains a structured JSON block for consistent reads, shared locks and atomic saves. It is omitted from clean source exports. Missing files are treated as no notes; unreadable, malformed and unsupported files are reported without overwriting them. Concurrent edits return a conflict rather than replacing newer notes. Reload saved notes after preserving any edits you need to keep.

Analytics shows saved preparation stages and Career Project returns separately from application outcomes. Counts include historical saved notes and do not imply verified suitability, submission or hiring results.

These features do not synchronize automatically with ChatGPT. Paste the reviewed result into the return field and select the corresponding decision yourself.
