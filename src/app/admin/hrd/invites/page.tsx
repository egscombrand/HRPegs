'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Skeleton } from '@/components/ui/skeleton';
import { InviteManagementClient } from '@/components/dashboard/InviteManagementClient';

export default function InvitesPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);
  
  if (!hasAccess) {
      return (
        <DashboardLayout pageTitle="Employee Invites" menuConfig={menuConfig}>
            <Skeleton className="h-96 w-full" />
        </DashboardLayout>
      );
  }

  return (
    <DashboardLayout pageTitle="Employee Invites" menuConfig={menuConfig}>
      <InviteManagementClient />
    </DashboardLayout>
  );
}
