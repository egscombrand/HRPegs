'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { MentorDashboard } from './MentorDashboard';
import { HrdMonthlyReviewDashboard } from './HrdMonthlyReviewDashboard';

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function LaporanMagangClient() {
  const { userProfile, loading: isLoadingAuth } = useAuth();
  
  if (isLoadingAuth) {
    return <ReviewSkeleton />;
  }

  if (userProfile && ['manager', 'karyawan'].includes(userProfile.role)) {
    return <MentorDashboard userProfile={userProfile} />;
  }

  if (userProfile && ['hrd', 'super-admin'].includes(userProfile.role)) {
    return <HrdMonthlyReviewDashboard userProfile={userProfile} />;
  }

  // Fallback for any other roles or states
  return (
    <div>
        <h1 className="text-2xl font-bold">Review Laporan Magang</h1>
        <p className="text-muted-foreground">Anda tidak memiliki akses ke halaman ini.</p>
    </div>
  );
}
