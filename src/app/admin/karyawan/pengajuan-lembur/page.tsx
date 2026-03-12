'use client';
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { PengajuanLemburClient } from '@/components/dashboard/karyawan/PengajuanLemburClient';

export default function PengajuanLemburPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['karyawan', 'manager', 'hrd', 'super-admin']);

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
      <PengajuanLemburClient />
    </DashboardLayout>
  );
}
