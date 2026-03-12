'use client';
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';

export default function PersetujuanLemburPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard('manager');
  const menuConfig = useMemo(() => MENU_CONFIG['manager'] || [], []);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Persetujuan Lembur" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Persetujuan Lembur" menuConfig={menuConfig}>
      <p>Fitur ini sedang dalam pengembangan.</p>
    </DashboardLayout>
  );
}
