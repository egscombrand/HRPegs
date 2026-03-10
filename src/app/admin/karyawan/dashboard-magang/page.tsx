'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, FilePlus, BookOpen, BarChart3, CheckSquare, Target, Activity } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { EmployeeProfile, UserProfile, Brand, JobApplication } from '@/lib/types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
                <Skeleton className="lg:col-span-2 h-64" />
                <Skeleton className="h-64" />
            </div>
        </div>
    )
}

function IdentityCard({ profile, userProfile, brands }: { profile: EmployeeProfile | null; userProfile: UserProfile | null; brands: Brand[] | null; }) {
    const brandMap = useMemo(() => new Map(brands?.map(b => [b.id!, b.name]) || []), [brands]);
    
    const brandNameToDisplay = useMemo(() => {
        if (profile?.brandName) return profile.brandName;
        if (userProfile?.brandId) {
          if (Array.isArray(userProfile.brandId)) {
            return userProfile.brandId.map(id => brandMap.get(id)).filter(Boolean).join(', ');
          }
          return brandMap.get(userProfile.brandId as string);
        }
        return 'Belum diatur';
      }, [profile, userProfile, brandMap]);

    const startDate = profile?.internshipStartDate?.toDate();
    const endDate = profile?.internshipEndDate?.toDate();

    return (
        <Card>
            <CardHeader>
                <CardTitle>{userProfile?.fullName}</CardTitle>
                <CardDescription className="capitalize">{userProfile?.employmentType}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Brand</span> <span className="font-semibold">{brandNameToDisplay}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Divisi</span> <span className="font-semibold">{profile?.division || 'Belum diatur'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Mentor/PIC</span> <span className="font-semibold">{profile?.supervisorName || 'Belum diatur'}</span></div>
                 <div className="flex justify-between"><span className="text-muted-foreground">Periode</span> <span className="font-semibold">{startDate && endDate ? `${format(startDate, 'dd MMM yyyy')} - ${format(endDate, 'dd MMM yyyy')}` : 'Belum diatur'}</span></div>
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

  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const isLoading = authLoading || profileLoading || brandsLoading;

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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <IdentityCard profile={employeeProfile} userProfile={userProfile} brands={brands} />
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Progres Laporan</CardTitle>
                        <CardDescription>Ringkasan status laporan harian Anda.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                        <div className="p-4 bg-muted/50 rounded-lg"><p className="text-2xl font-bold">21</p><p className="text-xs text-muted-foreground">Total Laporan</p></div>
                        <div className="p-4 bg-muted/50 rounded-lg"><p className="text-2xl font-bold">15</p><p className="text-xs text-muted-foreground">Disetujui</p></div>
                        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg"><p className="text-2xl font-bold">3</p><p className="text-xs text-yellow-600 dark:text-yellow-400">Perlu Revisi</p></div>
                        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><p className="text-2xl font-bold">3</p><p className="text-xs text-blue-600 dark:text-blue-400">Menunggu Review</p></div>
                    </CardContent>
                </Card>
            </div>
             <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Target className="text-primary"/> Target & Indikator Kinerja</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Fitur ini sedang dalam pengembangan. Di sini akan ditampilkan target-target yang harus Anda capai selama periode magang.
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Activity className="text-primary"/> Aktivitas Terbaru</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                         Fitur ini sedang dalam pengembangan. Di sini akan ditampilkan histori singkat dari laporan terakhir yang Anda kirim atau feedback yang Anda terima.
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Aksi Cepat</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Button asChild variant="outline"><Link href="/admin/karyawan/magang/laporan-harian"><FilePlus className="mr-2"/> Buat Laporan</Link></Button>
                    <Button asChild variant="outline"><Link href="/admin/karyawan/magang/rekap-laporan"><BarChart3 className="mr-2"/> Lihat Rekap</Link></Button>
                    <Button asChild variant="outline"><Link href="/admin/karyawan/magang/evaluasi"><CheckSquare className="mr-2"/> Lihat Feedback</Link></Button>
                     <Button asChild><Link href="/admin/karyawan/magang/profile">Lengkapi Profil <ArrowRight className="ml-2"/></Link></Button>
                </CardContent>
            </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
