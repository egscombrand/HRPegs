'use client';

import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function MagangDashboardPage() {
  const { userProfile, loading: authLoading } = useAuth();
  
  // NOTE: The redirect logic has been moved to /admin/karyawan/page.tsx to centralize routing decisions.
  // This component now only displays the dashboard.

  const hasAccess = useRoleGuard('karyawan');
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan-magang'] || [], []);
  
  const isLoading = authLoading;

  if (isLoading || !hasAccess || !userProfile || userProfile.employmentType !== 'magang') {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Magang" menuConfig={menuConfig}>
        <Card>
            <CardHeader>
                <CardTitle>Halo, {userProfile.fullName}!</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Selamat datang di dashboard peserta magang.</p>
                <Badge className="mt-4 capitalize">{userProfile.employmentType}</Badge>
            </CardContent>
        </Card>
    </DashboardLayout>
  );
}
