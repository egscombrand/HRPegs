'use client';

import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';

export default function MagangDashboardPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const profileDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
    [firestore, userProfile]
  );
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(profileDocRef);

  const hasAccess = useRoleGuard('karyawan');
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan-magang'] || [], []);
  
  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (!isLoading && userProfile?.employmentType === 'magang') {
      if (!employeeProfile || !employeeProfile.completeness?.isComplete) {
        router.replace('/admin/karyawan/magang/profile');
      }
    }
  }, [isLoading, userProfile, employeeProfile, router]);


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
