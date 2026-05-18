'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { OvertimePayrollRecapClient } from '@/components/dashboard/approvals/OvertimePayrollRecapClient';

export default function OvertimePayrollRecapPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Rekap Lembur Payroll" menuConfig={menuConfig}>
        <Skeleton className="h-[600px] w-full rounded-[2rem]" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Rekap Lembur Payroll" menuConfig={menuConfig}>
      <OvertimePayrollRecapClient />
    </DashboardLayout>
  );
}
