'use client';
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';

export default function PengajuanLemburPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['karyawan']);
  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.employmentType === 'magang') return MENU_CONFIG['karyawan-magang'];
    if (userProfile.employmentType === 'training') return MENU_CONFIG['karyawan-training'];
    return MENU_CONFIG['karyawan'];
  }, [userProfile]);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Pengajuan Lembur" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Pengajuan Lembur" menuConfig={menuConfig}>
      <p>Fitur ini sedang dalam pengembangan.</p>
    </DashboardLayout>
  );
}
