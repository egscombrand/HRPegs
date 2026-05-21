'use client';

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ManagementDinasClient } from "@/components/dashboard/dinas/ManagementDinasClient";
import { useMenuAccessGuard } from "@/hooks/useMenuAccessGuard";
import { Skeleton } from "@/components/ui/skeleton";

export default function PerjalananDinasPage() {
  const { hasAccess, loading } = useMenuAccessGuard("management.business_trip_missions");

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  if (!hasAccess) return null; // Hook redirects if false

  return (
    <DashboardLayout pageTitle="Perjalanan Dinas / Misi Dinas">
      <ManagementDinasClient />
    </DashboardLayout>
  );
}
