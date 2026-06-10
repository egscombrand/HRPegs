"use client";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useMenuAccessGuard } from "@/hooks/useMenuAccessGuard";
import { BusinessTripApprovalClient } from "@/components/dashboard/review/BusinessTripApprovalClient";
import { Skeleton } from "@/components/ui/skeleton";

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function BusinessTripApprovalPage() {
  const hasAccess = useRoleGuard(["super-admin", "hrd", "manager", "karyawan"]);
  const { userProfile, loading } = useAuth();
  const { loading: guardLoading, hasAccess: menuHasAccess } =
    useMenuAccessGuard("review.business_trip_approval");

  if (!hasAccess || loading || guardLoading) {
    return (
      <DashboardLayout pageTitle="Persetujuan Perjalanan Dinas">
        <ReviewSkeleton />
      </DashboardLayout>
    );
  }

  if (!userProfile || !menuHasAccess) {
    return (
      <DashboardLayout pageTitle="Akses Ditolak">
        <p className="py-20 text-center text-muted-foreground">
          Anda tidak memiliki otoritas untuk melihat halaman ini.
        </p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Persetujuan Perjalanan Dinas">
      <BusinessTripApprovalClient />
    </DashboardLayout>
  );
}
