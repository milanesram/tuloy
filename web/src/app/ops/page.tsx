import { opsSummary } from "@/lib/career-ops";
import { OpsView } from "@/components/ops/ops-view";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return <OpsView data={opsSummary()} />;
}
