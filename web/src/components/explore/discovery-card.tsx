"use client";

import { useState } from "react";
import { ExternalLink, Plus, Check, Loader2, ShieldQuestion, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { instrumentSerif } from "@/lib/fonts";
import { ATS_LABEL, type AtsSource, type DiscoveredOffer } from "@/lib/explore";
import { postingFreshnessLabel } from "@/lib/fresh-posting.mjs";
import { qualifyDiscoveredOffer } from "@/lib/discovery-qualification.mjs";
import { useExplore } from "./explore-provider";

// Real company logo (favicon) via the localhost proxy, cached on disk FOREVER per
// company — so once it resolves it's instant for this card AND every other card,
// this search or any future one. Falls back to a monogram on miss.
function Logo({ company }: { company: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (company || "?").trim().charAt(0).toUpperCase();
  if (failed || !company.trim()) {
    return <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-brand-text">{letter}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/logo?company=${encodeURIComponent(company)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-9 shrink-0 rounded-lg border border-border bg-surface object-contain p-1"
    />
  );
}

export function DiscoveryCard({ offer, inPipeline, evaluatedN, dismissed = false }: { offer: DiscoveredOffer & { qualification?: ReturnType<typeof qualifyDiscoveredOffer> }; inPipeline: boolean; evaluatedN?: string; dismissed?: boolean }) {
  const { added, adding, addToPipeline, changeDismissal, dismissalBusy } = useExplore();
  const isAdded = added.has(offer.url) || inPipeline;
  const isAdding = adding.has(offer.url);
  const qualification = offer.qualification;
  const unverified = offer.verification === "unconfirmed";
  const fresh = postingFreshnessLabel(offer);

  return (
    <div className="co-rise group flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface/40 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <Logo company={offer.company} />
        <a href={offer.url} target="_blank" rel="noopener noreferrer" className="block min-w-0 flex-1 max-sm:min-h-[44px]">
          <h3 className={`${instrumentSerif.className} truncate text-[17px] leading-tight text-foreground transition-colors group-hover:text-brand-text`}>{offer.title}</h3>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {offer.company}
            {offer.location && <span className="text-faint"> · {offer.location}</span>}
          </p>
        </a>
        <a
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the posting"
          aria-label="Open the posting"
          className="-m-1 inline-flex shrink-0 items-center justify-center rounded p-1 text-faint transition-colors hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded border border-border px-1.5 py-0.5 font-medium text-muted">{ATS_LABEL[offer.ats as AtsSource] ?? offer.ats}</span>
        {fresh && <span className="text-faint">{fresh}</span>}
        {unverified && (
          <span
            className="inline-flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-300"
            title="Found by AI on the public web — liveness remains unconfirmed until public evidence supports a verdict."
          >
            <ShieldQuestion className="size-3" /> unverified
          </span>
        )}
        {offer.matchedKeyword && (
          <span className="text-faint" title="Keyword match used by deterministic discovery.">
            · matched <span className="text-brand-text/80">{offer.matchedKeyword}</span>
          </span>
        )}
      </div>

      {qualification && <p className="text-xs text-muted" title={qualification.queueEligibilityReasons.join("\n")}>
        {qualification.recommendedResumeBase || qualification.recommendedResume || "Resume needs review"} · {qualification.recommendationClass} · {qualification.applicationReadiness}
        {!qualification.queueEligible && <span className="block">{qualification.manualReviewEligible ? "You can add this for manual review. Eligibility and evidence still need checking." : "Not suitable under the current evidence."}</span>}
      </p>}

      {qualification && !qualification.queueEligible && <details className="text-xs text-muted"><summary className="cursor-pointer">What needs checking</summary><ul className="mt-2 list-disc space-y-1 pl-4">{qualification.queueEligibilityReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}

      {offer.why && (
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-brand-text/80">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          {offer.why}
        </p>
      )}

      <div className="mt-0.5">
        {dismissed ? (
          <button type="button" disabled={dismissalBusy} onClick={() => void changeDismissal(offer, false)} className="w-full rounded-md bg-surface-hover px-2.5 py-2 text-xs font-medium text-foreground disabled:opacity-50">
            Restore
          </button>
        ) : evaluatedN ? (
          <a
            href={`/pipeline/${evaluatedN}`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-2 text-xs font-medium text-brand-text max-sm:min-h-[44px]"
          >
            <Check className="size-3.5" /> Tracked · view record
          </a>
        ) : (
          <button
            type="button"
            disabled={isAdded || isAdding || dismissalBusy || !qualification?.manualReviewEligible}
            title={qualification?.queueEligibilityReasons.join("\n")}
            onClick={() => addToPipeline([offer])}
            className={cn(
              "inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px]",
              isAdded ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-surface-hover text-foreground hover:bg-brand-soft hover:text-brand-text",
            )}
          >
            {isAdding ? <Loader2 className="size-3.5 animate-spin" /> : isAdded ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {isAdded ? "In Review Queue" : "Add to Review Queue"}
          </button>
        )}
        {!dismissed && (
          <button
            type="button"
            disabled={isAdded || isAdding || !!evaluatedN || dismissalBusy}
            title={isAdded || evaluatedN ? "Manage this opportunity in the Review Queue or tracker." : undefined}
            onClick={() => void changeDismissal(offer, true)}
            className="mt-1 w-full rounded-md px-2.5 py-2 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-50 max-sm:min-h-[44px]"
          >
            Not a Fit
          </button>
        )}
      </div>
    </div>
  );
}
