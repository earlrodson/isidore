import {
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
  listProjectSummaries,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { PresenterShell } from "@/components/presenter/presenter-shell";

// Server-fetched on every request — same reasoning as the main dashboard
// (see apps/web/src/app/page.tsx): data changes a few times a day, so there
// is no benefit to static generation here.
export const dynamic = "force-dynamic";

export default async function PresentPage() {
  const db = getDb();
  const [projects, completedPerWeek, estimationDrift, allocation] = await Promise.all([
    listProjectSummaries(db),
    listFeaturesCompletedPerWeek(db),
    listEstimationDrift(db),
    listDeveloperAllocation(db),
  ]);

  return (
    <PresenterShell data={{ projects, completedPerWeek, estimationDrift, allocation }} />
  );
}
