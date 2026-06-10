"use client";

import { useAuth } from "@/providers/auth-provider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { LaporanMagangClient } from "@/components/dashboard/review/LaporanMagangClient";
import { canUserReview } from "@/lib/auth-eligibility";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function LaporanMagangPage() {
  // Broad role check for next.js middleware parity
  const hasAccess = useRoleGuard(["super-admin", "hrd", "manager", "karyawan"]);
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Precise authority check
    if (!loading && userProfile) {
      if (!canUserReview(userProfile)) {
        router.replace("/admin");
      }
    }
  }, [loading, userProfile, router]);

  // Loading or initial block
  if (!hasAccess || loading) {
    return (
      <DashboardLayout pageTitle="Review Laporan Magang">
        <ReviewSkeleton />
      </DashboardLayout>
    );
  }

  // Final confirmation
  const authorized = canUserReview(userProfile);
  if (!authorized) {
    return (
      <DashboardLayout pageTitle="Akses Ditolak">
        <p className="py-20 text-center text-muted-foreground">
          Anda tidak memiliki otoritas sebagai reviewer.
        </p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Review Laporan Magang">
      <LaporanMagangClient />
    </DashboardLayout>
  );
}
