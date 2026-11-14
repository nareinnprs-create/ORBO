import { createFileRoute } from "@tanstack/react-router";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/_authed/_app/manager")({
  component: ManagerPage,
});

function ManagerPage() {
  return (
    <PageShell
      description="Everything your Bots are doing, in one view."
      title="Dashboard"
    >
      <ManagerDashboard />
    </PageShell>
  );
}
