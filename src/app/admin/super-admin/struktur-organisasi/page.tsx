'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StrukturOrganisasiClient } from '@/components/dashboard/StrukturOrganisasiClient';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useAuth } from '@/providers/auth-provider';

export default function StrukturOrganisasiPage() {
  const { userProfile } = useAuth();
  
  // Accessible by super-admin and hrd
  const hasAccess = useRoleGuard(['super-admin', 'hrd']);
  
  // Use the appropriate menu config based on role
  const menuConfig = useMemo(() => {
    if (!userProfile?.role) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile?.role]);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Organisasi Perusahaan" menuConfig={menuConfig}>
      <StrukturOrganisasiClient />
    </DashboardLayout>
  );
}
