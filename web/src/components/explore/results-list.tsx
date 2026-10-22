"use client";

import { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { qualifyDiscoveredOffer } from "@/lib/discovery-qualification.mjs";
import type { DiscoveredOffer } from "@/lib/explore";
import { CostBadge } from "@/components/cost/cost-badge";
import { DiscoveryCard } from "./discovery-card";
import { useExplore } from "./explore-provider";

export type EnrichedOffer = DiscoveredOffer & { inPipeline: boolean; evaluatedN?: string; qualification?: ReturnType<typeof qualifyDiscoveredOffer> };

export function ResultsList({ offers, dismissed = false }: { offers: EnrichedOffer[]; dismissed?: boolean }) {
  const { companiesScanned, partial, addToPipeline, added, mode, dismissalBusy } = useExplore();
  const isAi = mode === "ai";
  const [sort, setSort] = useState<"fresh" | "company">("fresh");
  const [q, setQ] = useState("");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = offers;
    if (needle) list = list.filter((o) => o.title.toLowerCase().includes(needle) || o.company.toLowerCase().includes(needle));
    const sorted = [...list].sort((a, b) =>
      sort === "fresh" ? (b.postedAt || "").localeCompare(a.postedAt || "") : a.company.localeCompare(b.company),
    );
    return sorted;
  }, [offers, q, sort]);

  const addable = dismissed ? [] : offers.filter((o) => !o.inPipeline && !o.evaluatedN && !added.has(o.url) && o.qualification?.queueEligible === true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm text-foreground">
            <span className="font-semibold">{offers.length}</span> {dismissed ? "dismissed" : isAi ? `candidate${offers.length === 1 ? "" : "s"}` : `opportunit${offers.length === 1 ? "y" : "ies"}`}
            <CostBadge kind={isAi ? "spend" : "free-network"} size="xs" className="ml-2 align-middle" />
          </p>
          <p className="text-[12px] text-faint">
            {dismissed ? "Restore an opportunity to make it available in Explore again." : isAi
              ? "found by AI on the open web · public evidence may remain unverified"
              : `${companiesScanned > 0 ? `${companiesScanned.toLocaleString()} companies scanned · ` : ""}0 tokens spent${partial ? " · some boards were unreachable (normal for public directories)" : ""}`}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5">
            <Search className="size-3.5 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter results…"
              className="w-32 bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
          </div>
          <div className="inline-flex rounded-lg border border-border bg-surface/40 p-0.5 text-xs">
            {(["fresh", "company"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={cn("rounded-md px-2.5 py-1 font-medium capitalize transition-colors", sort === s ? "bg-brand-soft text-brand-text" : "text-muted hover:text-foreground")}
              >
                {s}
              </button>
            ))}
          </div>
          {addable.length > 1 && (
            <button
              type="button"
              disabled={dismissalBusy}
              onClick={() => addToPipeline(addable)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand-text"
            >
              <Plus className="size-3.5" /> Add all {addable.length} to Review Queue
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.map((o) => (
          <DiscoveryCard key={o.url} offer={o} inPipeline={o.inPipeline} evaluatedN={o.evaluatedN} dismissed={dismissed} />
        ))}
      </div>

      {view.length === 0 && <p className="py-10 text-center text-sm text-faint">{q ? `No results match “${q}”.` : dismissed ? "No dismissed opportunities." : "No active opportunities."}</p>}
    </div>
  );
}
