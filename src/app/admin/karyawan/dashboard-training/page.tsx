'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TrainingDashboardPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard('karyawan');
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan'] || [], []);

  if (!hasAccess || !userProfile) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Training" menuConfig={menuConfig}>
        <Card>
            <CardHeader>
                <CardTitle>Halo, {userProfile.fullName}!</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Selamat datang di dashboard peserta training.</p>
                <Badge className="mt-4 capitalize">{userProfile.employmentType}</Badge>
            </CardContent>
        </Card>
    </DashboardLayout>
  );
}
