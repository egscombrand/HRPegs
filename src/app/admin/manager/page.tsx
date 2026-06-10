"use client";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManagerDashboard() {
  const hasAccess = useRoleGuard("manager");

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Manager's Dashboard">
      <p>
        This is the main content area for the Manager dashboard. View team
        details and manage approvals.
      </p>
    </DashboardLayout>
  );
}
