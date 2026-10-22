"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarClock,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Send,
  ThumbsDown,
} from "lucide-react";
import type { OpsOpportunity, OpsSummary } from "@/lib/career-ops";
import { composeHandoff, isSafeWebUrl, NOT_CAPTURED } from "@/lib/ops.mjs";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company-logo";
import { StatusSelect } from "@/components/status-select";
import { cn } from "@/lib/cn";
import { PreparationNotes } from './preparation-notes';
import { preparationKey } from '@/lib/preparation.mjs';

type CopyState = "jd" | "handoff" | null;

export function OpsView({ data }: { data: OpsSummary }) {
  const router = useRouter();
  const manualReview = data.queue.filter(job => job.discoveryCategory === "MANUAL_REVIEW");
  const verified = data.queue.filter(job => !["NEWLY_DISCOVERED", "MANUAL_REVIEW"].includes(job.discoveryCategory || ""));
  const newlyDiscovered = data.queue.filter(job => job.discoveryCategory === "NEWLY_DISCOVERED");
  const all = useMemo(() => [...[...data.queue.filter(job => job.discoveryCategory !== "NEWLY_DISCOVERED"), ...data.queue.filter(job => job.discoveryCategory === "NEWLY_DISCOVERED")].flatMap(job => [job, ...(job.postingVariants || [])]), ...data.tracked], [data]);
  const [selectedId, setSelectedId] = useState(all[0]?.id ?? "");
  const [selectedForApplicationId, setSelectedForApplicationId] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const preparationDirty = useRef(false);
  const onPreparationDirty = useCallback((dirty: boolean) => { preparationDirty.current = dirty; }, []);
  function chooseOpportunity(id: string) {
    if (preparationDirty.current && !window.confirm('Discard unsaved preparation edits before switching opportunities?')) return;
    setSelectedId(id);
  }
  const selected = all.find((job) => job.id === selectedId) ?? all[0] ?? null;
  const variantGroup = data.queue.find(job => job.id === selected?.id || job.postingVariants?.some(v => v.id === selected?.id));
  const onPreparationStage = useCallback((url: string, stage: string) => {
    const job = all.find(item => preparationKey(item.url) === url);
    setSelectedForApplicationId(['selected', 'preparing', 'ready'].includes(stage) ? job?.id ?? null : null);
  }, [all]);

  async function copy(value: string, kind: Exclude<CopyState, null>) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setMessage("Clipboard access failed. Select and copy the text manually.");
    }
  }

  async function markNotAFit(job: OpsOpportunity) {
    setDismissing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ops/dismiss", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: { ...job, title: job.role } }),
      });
      const result = await response.json() as { error?: string; dismissed?: boolean };
      if (!response.ok || !result.dismissed) throw new Error(result.error || "Could not mark this posting Not a Fit.");
      setMessage(`${job.company} — ${job.role} marked Not a Fit and removed from the Review Queue. Restore it from Explore → Dismissed.`);
      setSelectedForApplicationId(null);
      window.dispatchEvent(new Event("co-dismissals-changed"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark this posting Not a Fit.");
    } finally { setDismissing(false); }
  }

  async function markSubmitted(job: OpsOpportunity) {
    const confirmed = window.confirm(
      `Confirm that you manually submitted the application for ${job.company} — ${job.role}. Tuloy will only update the local tracker.`,
    );
    if (!confirmed) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ops/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedSubmitted: true,
          company: job.company,
          role: job.role,
          url: job.url,
          location: job.location === NOT_CAPTURED ? "" : job.location,
          source: job.source === NOT_CAPTURED ? "Tuloy" : job.source,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Tracker update failed");
      setMessage("Recorded as Applied. The application itself was not submitted by Tuloy.");
      setSelectedForApplicationId(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tracker update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-text">Tuloy</p>
        <h1 className="mt-1 font-display text-3xl tracking-tight text-landing">Review → hand off → track</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Tuloy discovers and tracks. Copy the evidence package to your ChatGPT Career Project, submit manually, then record the outcome here.
        </p>
      </header>

      {message && (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted" role="status">
          {message}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-5">
          <QueueSection
            title={data.dailyReviewEnabled ? "VERIFIED FRESH" : "Review Queue"}
            empty={data.dailyReviewEnabled ? "No verified postings from the preceding 24 hours." : "No pending opportunities."}
            jobs={data.dailyReviewEnabled ? verified : data.queue}
            selectedId={variantGroup?.id ?? selected?.id ?? ""}
            selectedForApplicationId={selectedForApplicationId}
            onSelect={chooseOpportunity}
          />
          {data.dailyReviewEnabled && <QueueSection
            title="NEWLY DISCOVERED — POSTING DATE UNVERIFIED"
            empty="No unseen postings with unverified publication dates."
            jobs={newlyDiscovered}
            selectedId={variantGroup?.id ?? selected?.id ?? ""}
            selectedForApplicationId={selectedForApplicationId}
            onSelect={chooseOpportunity}
          />}
          {data.dailyReviewEnabled && <QueueSection
            title="MANUAL EVIDENCE REVIEW"
            empty="No manually selected opportunities needing evidence review."
            jobs={manualReview}
            selectedId={variantGroup?.id ?? selected?.id ?? ""}
            selectedForApplicationId={selectedForApplicationId}
            onSelect={chooseOpportunity}
          />}
          <QueueSection
            title="Application Tracker"
            empty="No tracked applications yet."
            jobs={data.tracked}
            selectedId={selected?.id ?? ""}
            selectedForApplicationId={selectedForApplicationId}
            onSelect={chooseOpportunity}
          />
        </aside>

        <main className="min-w-0">
          {selected ? (
            <article className="overflow-hidden rounded-2xl border border-border bg-surface/50 shadow-sm">
              <div className="border-b border-border px-5 py-5 sm:px-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <CompanyLogo name={selected.company} size={40} />
                    <div className="min-w-0">
                      <p className="font-display text-2xl text-landing">{selected.company}</p>
                      <h2 className="mt-0.5 text-base text-muted">{selected.role}</h2>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone={selected.kind === "review" ? "info" : "good"}>
                          {selected.kind === "review" ? "Review Queue" : "Tracked"}
                        </Badge>
                        {selected.discoveryCategory && <Badge tone={selected.discoveryCategory === "VERIFIED_FRESH" ? "good" : "warn"}>
                          {selected.discoveryCategory === "MANUAL_REVIEW" ? "MANUAL EVIDENCE REVIEW — ELIGIBILITY NOT CONFIRMED" : selected.discoveryCategory === "NEWLY_DISCOVERED" ? "NEWLY DISCOVERED — POSTING DATE UNVERIFIED" : "VERIFIED FRESH"}
                        </Badge>}
                        {selected.applicationStatus && <Badge>{selected.applicationStatus}</Badge>}
                        <Badge tone={selected.priorityBand === "HIGH" ? "good" : selected.priorityBand === "MEDIUM" ? "warn" : "muted"}>
                          {selected.priorityBand} priority
                        </Badge>
                        <Badge tone={selected.gate === "PASS" ? "good" : selected.gate === "FAIL" ? "bad" : "warn"}>
                          Gate {selected.gate}
                        </Badge>
                        {selectedForApplicationId === selected.id && <Badge tone="warn">Selected for application</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a href="#preparation-notes" className="inline-flex min-h-10 items-center rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted hover:text-brand-text">Preparation notes</a>
                    {selected.kind === "review" && !selected.trackerId && (
                      <button type="button" disabled={dismissing || submitting || !isSafeWebUrl(selected.url)}
                        onClick={() => void markNotAFit(selected)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-muted transition hover:border-red-400/50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50">
                        <ThumbsDown className="size-3.5" /> {dismissing ? "Marking…" : "Not a Fit"}
                      </button>
                    )}
                    {isSafeWebUrl(selected.url) ? (
                      <a
                        href={selected.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium transition hover:border-brand/50 hover:text-brand-text"
                      >
                        <ExternalLink className="size-3.5" /> Open Posting
                      </a>
                    ) : (
                      <button disabled className="inline-flex min-h-10 cursor-not-allowed items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs text-faint">
                        <ExternalLink className="size-3.5" /> Open Posting
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!selected.jd}
                      onClick={() => selected.jd && copy(selected.jd, "jd")}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium transition hover:border-brand/50 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {copied === "jd" ? <Check className="size-3.5" /> : <FileText className="size-3.5" />}
                      {copied === "jd" ? "JD copied" : "Copy JD"}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(composeHandoff(selected), "handoff")}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-medium text-brand-foreground transition hover:bg-brand-200"
                    >
                      {copied === "handoff" ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                      {copied === "handoff" ? "Handoff copied" : "Copy Handoff"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-7 px-5 py-6 sm:px-7">
                {variantGroup?.postingVariants?.length ? <div className="flex flex-wrap gap-2" aria-label="Verified requisition posting variants">{[variantGroup, ...variantGroup.postingVariants].map(variant => <button key={variant.id} type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => chooseOpportunity(variant.id)}>{variant.location} · posting {variant.sourceId}</button>)}</div> : null}
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label={`Identifier (${selected.requisitionType})`} value={selected.requisition} />
                  <Field label="Employer requisition" value={selected.employerRequisitionId} />
                  <Field label="Provider posting ID" value={selected.sourceId} />
                  <Field label="Source" value={selected.source} />
                  <Field label="Location" value={selected.location} />
                  <Field label="Work arrangement" value={selected.workArrangement} />
                  <Field label="Posting status" value={selected.postingStatus} />
                  <Field label="Source listing" value={selected.sourceListingStatus} />
                  <Field label="Posting date" value={selected.postedAt} />
                  {selected.discoveryCategory === "NEWLY_DISCOVERED" && <Field label="Discovered at (not publication time)" value={selected.discoveredAt || NOT_CAPTURED} />}
                  <Field label="Source confidence" value={selected.sourceConfidence} />
                  <Field label="Employer identity" value={selected.employerIdentityStatus} />
                  <Field label="Source publisher" value={selected.sourcePublisher} />
                  <Field label="JD completeness" value={selected.jdQuality} />
                  <Field label="Recommendation" value={selected.recommendation} />
                  <Field label="Recommendation class" value={selected.recommendationClass} />
                  <Field label="Priority" value={`${selected.priorityBand} (${selected.priorityScore} ranking points)`} />
                  <Field label="Career lane" value={selected.careerLane} />
                  <Field label="Lane classification" value={selected.careerLaneCode} />
                  <Field label="Seniority classification" value={selected.seniorityClassification} />
                  <Field label="Bridge status" value={selected.bridgeStatus} />
                  <Field label="Role family" value={selected.roleFamily} />
                  <Field label="Employment type" value={selected.employmentType} />
                  <Field label="Recommended résumé" value={selected.recommendedResume} />
                  <Field label="Approved résumé base" value={selected.recommendedResumeBase} />
                  <Field label="Current status" value={selected.applicationStatus ?? NOT_CAPTURED} />
                  <Field label="Next action" value={selected.nextAction} />
                  <Field label="Next follow-up" value={selected.nextFollowupDate ?? NOT_CAPTURED} />
                </dl>

                <div className="grid gap-5 xl:grid-cols-2">
                  {variantGroup?.postingVariants?.length ? <TextPanel title="Verified requisition variants" value={[variantGroup, ...variantGroup.postingVariants].map(v => `${v.location}: ${v.url}`).join("\n")} /> : null}
                  {selected.workArrangementEvidence.length > 0 && <TextPanel title={`Work arrangement: ${selected.workArrangementStatus}`} value={[`Source: ${selected.sourceWorkArrangement}`, `JD: ${selected.jdWorkArrangement}`, ...selected.workArrangementReasons, ...selected.workArrangementEvidence].join("\n")} />}
                  <TextPanel title="Why this opportunity was selected" value={selected.recommendationReasons.map((item) => `• ${item}`).join("\n")} />
                  <TextPanel title="Ranking explanation" value={selected.rankingExplanation.map((item) => `• ${item}`).join("\n")} />
                  <TextPanel title="Strengths" value={selected.whyItFits} />
                  <TextPanel title="Material gaps / risks" value={selected.materialGaps} />
                  <TextPanel title="Seniority rationale" value={selected.seniorityReasons.map((item) => `• ${item}`).join("\n")} />
                  <TextPanel title={`Application readiness: ${selected.applicationReadiness}`} value={selected.readinessReasons.map((item) => `• ${item}`).join("\n") || "Ready for human review—not permission to submit."} />
                  <TextPanel title="Role family / employment issues" value={selected.roleFamilyReasons.map((item) => `• ${item}`).join("\n") || NOT_CAPTURED} />
                  {selected.materialRequirements.length > 0 && <TextPanel title="Material requirements" value={selected.materialRequirements.map((item) => `• ${item.requirement} — ${item.importance}; candidate evidence: ${item.candidateEvidence}`).join("\n")} />}
                  {selected.priorityCapReasons.length > 0 && <TextPanel title="Priority safeguards" value={selected.priorityCapReasons.map((item) => `• ${item}`).join("\n")} />}
                </div>
                {selected.sourceListingStatus === "AVAILABLE" && selected.postingStatus !== "ACTIVE" && <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">Source listing available. Employer posting activity has not been independently confirmed.</p>}
                <section className={cn(
                  "rounded-xl border p-4",
                  selected.gate === "FAIL" ? "border-red-500/40 bg-red-500/5" : selected.gate === "REVIEW" ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5",
                )}>
                  <h3 className="font-display text-lg text-landing">Eligibility — {selected.gate}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{selected.gateReasons.map((item) => `• ${item}`).join("\n")}</p>
                </section>
                <TextPanel title="Application questions" value={selected.applicationQuestions} />
                {["CONFLICT", "AMBIGUOUS"].includes(selected.employerIdentityStatus) && (
                  <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                    <h3 className="font-display text-lg text-landing">Employer identity — {selected.employerIdentityStatus}</h3>
                    <p className="mt-2 text-sm text-muted">Displayed employer: {selected.company}</p>
                    <p className="mt-1 text-sm text-muted">Captured employer evidence: {selected.employerIdentityName ?? NOT_CAPTURED}</p>
                    <p className="mt-1 text-sm text-muted">Source publisher: {selected.sourcePublisher}</p>
                    {isSafeWebUrl(selected.discoveredUrl) && <a className="mt-1 block text-sm text-brand-text hover:underline" href={selected.discoveredUrl} target="_blank" rel="noreferrer">Open source listing</a>}
                    <ul className="mt-2 space-y-1 text-sm text-muted">{selected.employerIdentityEvidence.filter((item) => item.kind !== "ATS_BOARD").map((item, index) => <li key={index}>{item.kind.replaceAll("_", " ").toLowerCase()}: {item.value}</li>)}</ul>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{selected.employerIdentityReasons.join("\n")}</p>
                    <p className="mt-2 text-sm font-medium">Human confirmation required before application.</p>
                  </section>
                )}

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg text-landing">Captured JD — {selected.jdQuality}</h3>
                    {selected.jd && (
                      <button type="button" onClick={() => copy(selected.jd!, "jd")} className="text-xs font-medium text-brand-text hover:underline">
                        Copy JD
                      </button>
                    )}
                  </div>
                  {selected.jd ? (
                    <div className="mt-3 max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/60 p-4 text-sm leading-6 text-muted">
                      {selected.jd}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-border bg-background/40 p-5">
                      <p className="font-medium">{selected.jdQuality === "ARCHIVE_UNAVAILABLE" ? "Archived JD text unavailable" : selected.jdQuality === "FETCH_FAILED" ? "JD retrieval failed" : "Complete JD not captured"}</p>
                      <p className="mt-1 text-sm text-muted">Use Open Posting to review the employer page. Tuloy will not reconstruct missing text.</p>
                    </div>
                  )}
                </section>

                <PreparationNotes key={selected.url} job={selected} onStage={onPreparationStage} onDirty={onPreparationDirty} />

                <section className="rounded-xl border border-border bg-background/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">Application tracking</h3>
                      <p className="mt-1 text-xs text-muted">Tuloy records your action; it never submits an external form.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.trackerId && selected.applicationStatus && (
                        <StatusSelect n={selected.trackerId} current={selected.applicationStatus} />
                      )}

                      {(!selected.applicationStatus || selected.applicationStatus === "Evaluated") && (
                        <a href="#preparation-notes" className="inline-flex min-h-10 items-center rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted hover:text-brand-text">Manage preparation above</a>
                      )}

                      {selectedForApplicationId === selected.id && selected.applicationStatus !== "Applied" && (
                        <button
                          type="button"
                          disabled={submitting || !isSafeWebUrl(selected.url)}
                          onClick={() => markSubmitted(selected)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-medium text-brand-foreground transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Send className="size-3.5" /> {submitting ? "Recording…" : "Mark Submitted"}
                        </button>
                      )}
                      {selected.trackerId && (
                        <Link href="/followups" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs text-muted hover:text-foreground">
                          <CalendarClock className="size-3.5" /> Follow-ups
                        </Link>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </article>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-16 text-center">
              <BriefcaseBusiness className="mx-auto size-8 text-faint" />
              <p className="mt-3 font-display text-xl">No Tuloy records yet</p>
              <p className="mt-1 text-sm text-muted">Add reviewed opportunities to the existing pipeline to see them here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function QueueSection({
  title,
  empty,
  jobs,
  selectedId,
  selectedForApplicationId,
  onSelect,
}: {
  title: string;
  empty: string;
  jobs: OpsOpportunity[];
  selectedId: string;
  selectedForApplicationId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg text-landing">{title}</h2>
        <span className="font-mono text-xs text-faint">{jobs.length}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface/40">
        {jobs.length ? jobs.map((job) => (
          <button
            type="button"
            key={job.id}
            onClick={() => onSelect(job.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b border-border px-3.5 py-3 text-left last:border-b-0",
              selectedId === job.id ? "bg-brand-soft" : "transition hover:bg-surface-hover",
            )}
          >
            <CompanyLogo name={job.company} size={24} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{job.company}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{job.role}</span>
              <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-faint">
                {job.location !== NOT_CAPTURED && <span>{job.location}</span>}
                {job.applicationStatus && <span>· {job.applicationStatus}</span>}
              </span>
              <span className="mt-1.5 flex flex-wrap gap-1">
                <Badge tone={job.priorityBand === "HIGH" ? "good" : job.priorityBand === "MEDIUM" ? "warn" : "muted"}>{job.priorityBand}</Badge>
                <Badge tone={job.gate === "PASS" ? "good" : job.gate === "FAIL" ? "bad" : "warn"}>{job.gate}</Badge>
                <Badge>{job.recommendedResumeCode}</Badge>
                <Badge>{job.seniorityClassification}</Badge>
                <Badge tone={job.jdQuality === "COMPLETE" ? "good" : "warn"}>{job.jdQuality}</Badge>
                <Badge>{job.postingStatus}</Badge>
              </span>
            </span>
            {selectedForApplicationId === job.id && <Check className="mt-1 size-4 shrink-0 text-brand-text" aria-label="Selected for application" />}
          </button>
        )) : (
          <p className="px-4 py-6 text-center text-sm text-faint">{empty}</p>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const absent = value === NOT_CAPTURED || value === "UNCLEAR";
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className={cn("mt-1 text-sm", absent ? "italic text-faint" : "text-foreground")}>{value}</dd>
    </div>
  );
}

function TextPanel({ title, value }: { title: string; value: string }) {
  const absent = value === NOT_CAPTURED;
  return (
    <section className="rounded-xl border border-border bg-background/40 p-4">
      <h3 className="font-display text-lg text-landing">{title}</h3>
      <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6", absent ? "italic text-faint" : "text-muted")}>{value}</p>
    </section>
  );
}
