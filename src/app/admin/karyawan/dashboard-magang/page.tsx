'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

function DashboardSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
        </div>
    )
}

function PeriodCard({ profile }: { profile: EmployeeProfile | null }) {
    return (
        <Card className="bg-primary/5 text-primary-foreground border-primary/20">
            <CardHeader>
                <CardTitle className="text-lg text-primary">Periode Magang Anda</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-around text-center">
                    <div>
                        <p className="text-xs text-primary/80">Mulai Magang</p>
                        <p className="font-bold text-xl text-primary">{profile?.internshipStartDate ? format(profile.internshipStartDate.toDate(), 'dd MMM yyyy', { locale: id }) : 'TBA'}</p>
                    </div>
                    <div className="h-12 w-px bg-primary/20" />
                    <div>
                        <p className="text-xs text-primary/80">Selesai Magang</p>
                        <p className="font-bold text-xl text-primary">{profile?.internshipEndDate ? format(profile.internshipEndDate.toDate(), 'dd MMM yyyy', { locale: id }) : 'TBA'}</p>
                    </div>
                </div>
                {!profile?.internshipStartDate && (
                    <p className="text-xs text-center text-primary/70 mt-3">Periode resmi magang Anda akan diatur dan ditampilkan di sini oleh HRD.</p>
                )}
            </CardContent>
        </Card>
    )
}

export default function MagangDashboardPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  
  const hasAccess = useRoleGuard('karyawan');
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan-magang'] || [], []);
  
  const employeeProfileRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
    [firestore, userProfile]
  );
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(employeeProfileRef);

  const isLoading = authLoading || profileLoading;

  if (!hasAccess || !userProfile || userProfile.employmentType !== 'magang') {
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
      {isLoading ? <DashboardSkeleton /> : (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Halo, {userProfile.fullName}!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Selamat datang di dashboard peserta magang.</p>
                    <Badge className="mt-4 capitalize">{userProfile.employmentType}</Badge>
                </CardContent>
            </Card>
            <PeriodCard profile={employeeProfile} />
        </div>
      )}
    </DashboardLayout>
  );
}
