'use client';
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { RecruitmentDashboardClient } from '@/components/recruitment/RecruitmentDashboardClient';

export default function HrdRekrutmenDashboardPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Dashboard" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Dashboard Rekrutmen" menuConfig={menuConfig}>
      <RecruitmentDashboardClient />
    </DashboardLayout>
  );
}
