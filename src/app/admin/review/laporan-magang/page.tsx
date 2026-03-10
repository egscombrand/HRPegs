'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { LaporanMagangClient } from '@/components/dashboard/review/LaporanMagangClient';

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function LaporanMagangPage() {
  const hasAccess = useRoleGuard(['super-admin', 'hrd', 'manager']);
  const { userProfile } = useAuth();
  
  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  if (!hasAccess) {
    return (
      <DashboardLayout 
        pageTitle="Review Laporan Magang" 
        menuConfig={menuConfig}
      >
        <ReviewSkeleton />
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
