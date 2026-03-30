'use client';
import { useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { OvertimeApprovalClient } from '@/components/dashboard/approvals/OvertimeApprovalClient';
import { useRouter } from 'next/navigation';

import { canUserReview } from '@/lib/auth-eligibility';

export default function PersetujuanLemburPage() {
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
    // If it's a 'karyawan' who is a division manager, they might not have the 'manager' menu config by default.
    // We can conditionally merge it or just show their base menu.
    // The DashboardLayout will dynamically add the approval menu link.
    if (userProfile.role === 'karyawan' && userProfile.isDivisionManager) {
        return MENU_CONFIG['karyawan'];
    }
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Render skeleton while access is being verified
  if (!hasAccess || loading) {
    return <DashboardLayout pageTitle="Persetujuan Lembur" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  // Final authority check
  const authorized = canUserReview(userProfile);
  if (!authorized && !loading) {
      return <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}><p className="py-20 text-center text-muted-foreground">Anda tidak memiliki otoritas sebagai reviewer.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Persetujuan Lembur Tim" menuConfig={menuConfig}>
      <OvertimeApprovalClient mode="manager" />
    </DashboardLayout>
  );
}
