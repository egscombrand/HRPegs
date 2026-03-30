'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { LaporanMagangClient } from '@/components/dashboard/review/LaporanMagangClient';
import { canUserReview } from '@/lib/auth-eligibility';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
  const hasAccess = useRoleGuard(['super-admin', 'hrd', 'manager', 'karyawan']);
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    // Precise authority check
    if (!loading && userProfile) {
      if (!canUserReview(userProfile)) {
        router.replace('/admin');
      }
    }
  }, [loading, userProfile, router]);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Loading or initial block
  if (!hasAccess || loading) {
    return (
      <DashboardLayout pageTitle="Review Laporan Magang" menuConfig={menuConfig}><ReviewSkeleton /></DashboardLayout>
    );
  }

  // Final confirmation
  const authorized = canUserReview(userProfile);
  if (!authorized) {
      return (
        <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}>
            <p className="py-20 text-center text-muted-foreground">Anda tidak memiliki otoritas sebagai reviewer.</p>
        </DashboardLayout>
      );
  }

  return (
    <DashboardLayout 
        pageTitle="Review Laporan Magang" 
        menuConfig={menuConfig}
    >
      <LaporanMagangClient />
    </DashboardLayout>
  );
}
