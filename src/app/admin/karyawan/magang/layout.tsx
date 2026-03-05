'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';

export default function MagangLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard('karyawan');
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan-magang'] || [], []);

  if (!hasAccess || !userProfile || userProfile.employmentType !== 'magang') {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Profil Magang" menuConfig={menuConfig}>
      {children}
    </DashboardLayout>
  );
}
