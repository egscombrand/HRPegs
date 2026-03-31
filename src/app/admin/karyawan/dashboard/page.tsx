'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

export default function KaryawanDashboardPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const hasAccess = useRoleGuard('karyawan');
  
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(
    useMemoFirebase(() => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null), [userProfile, firestore])
  );

  const isLoading = authLoading || profileLoading;

  if (!hasAccess || !userProfile || isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }
  
  const isProfileComplete = employeeProfile?.completeness?.isComplete;
  const isDataIncomplete = !employeeProfile?.managerName || !employeeProfile?.division || !employeeProfile?.positionTitle;

  return (
    <DashboardLayout pageTitle="Dashboard Karyawan">
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Halo, {userProfile.fullName}!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Selamat datang di dashboard karyawan.</p>
                    <Badge className="mt-4 capitalize">{employeeProfile?.positionTitle || userProfile.employmentType || 'Karyawan'}</Badge>
                </CardContent>
            </Card>

            {!isProfileComplete && (
                <Card className="border-primary/50 bg-primary/5">
                    <CardHeader>
                        <CardTitle>Lengkapi Profil Anda</CardTitle>
                        <CardDescription>Data diri Anda belum lengkap. Mohon lengkapi untuk mengakses semua fitur kepegawaian dan mengajukan izin atau cuti.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild>
                            <Link href="/admin/karyawan/profile">
                                Lengkapi Data Diri <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {isProfileComplete && isDataIncomplete && (
                 <Alert>
                    <InfoIcon className="h-4 w-4" />
                    <AlertTitle>Data Kepegawaian Belum Lengkap</AlertTitle>
                    <AlertDescription>
                       Informasi jabatan, divisi, atau atasan Anda belum diatur. Beberapa fitur mungkin belum berfungsi. Harap hubungi HRD.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    </DashboardLayout>
  );
}
