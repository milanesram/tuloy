import fs from "node:fs";
import { ExplorerView } from "@/components/explore/explorer-view";
import { seedExploreFilters } from "@/lib/core/portals";
import { readInbox, readApplications, careerOpsRoot, configuredCandidateLocation, configuredCandidateEvidence, configuredDailySearch } from "@/lib/career-ops";
import { DEFAULT_FILTERS } from "@/lib/explore";

// Read live data at request time so a bare checkout (or `next build` with no
// CAREER_OPS_ROOT) never fails — discovery seeds are best-effort.
export const dynamic = "force-dynamic";

export default function ExplorePage() {
  const candidateEvidence = configuredCandidateEvidence();
  let seed: { filters: typeof DEFAULT_FILTERS; seededFrom: string[] } = { filters: DEFAULT_FILTERS, seededFrom: [] };
  try {
    seed = seedExploreFilters();
  } catch {
    /* bare checkout → defaults */
  }
  if (candidateEvidence.careerStrategy.active === 'custom') {
    const terms = [...new Set<string>((candidateEvidence.careerStrategy.routes as Array<{titleTerms:string[];dutyTerms:string[]}>).flatMap(route => route.titleTerms.length ? route.titleTerms : route.dutyTerms))];
    seed = { filters: { ...seed.filters, positive: terms, negative: [] }, seededFrom: ['custom career strategy'] };
  }
  let rootExists = false;
  try {
    rootExists = fs.existsSync(careerOpsRoot());
  } catch {
    /* ignore */
  }
  return (
    <ExplorerView seed={seed} inboxSnapshot={readInbox()} appsSnapshot={readApplications()} rootExists={rootExists} qualificationContext={{ candidateLocation: configuredCandidateLocation(), candidateEvidence, daily: configuredDailySearch() }} />
  );
}
