'use client';
import { useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { PermissionApprovalClient } from '@/components/dashboard/approvals/PermissionApprovalClient';
import { useRouter } from 'next/navigation';

import { canUserReview } from '@/lib/auth-eligibility';

export default function PersetujuanIzinManagerPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  // Initial role-based check
  const hasAccess = useRoleGuard(['manager', 'hrd', 'super-admin', 'karyawan']); 
  
  useEffect(() => {
    // Standardized review authority check
    if (!loading && userProfile) {
      if (!canUserReview(userProfile)) {
        router.replace('/admin');
      }
    }
  }, [loading, userProfile, router]);


  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'karyawan' && userProfile.isDivisionManager) {
        return MENU_CONFIG['karyawan'];
    }
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Render skeleton while access is being verified
  if (!hasAccess || loading) {
    return <DashboardLayout pageTitle="Persetujuan Izin" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  // Final authority check
  const authorized = canUserReview(userProfile);
  if (!authorized && !loading) {
      return <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}><p className="py-20 text-center text-muted-foreground">Anda tidak memiliki otoritas sebagai reviewer.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Persetujuan Izin Tim" menuConfig={menuConfig}>
      <PermissionApprovalClient mode="manager" />
    </DashboardLayout>
  );
}
