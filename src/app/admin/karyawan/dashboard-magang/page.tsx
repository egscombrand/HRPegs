'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowRight, FilePlus, BarChart, CheckSquare, FileClock, CheckCircle, AlertCircle, Edit, ListTodo } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import type { EmployeeProfile, UserProfile, Brand, JobApplication } from '@/lib/types';
import { format, differenceInDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

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

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Informasi Penempatan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span> <Badge className="capitalize">{userProfile?.employmentType}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Brand</span> <span className="font-semibold">{brandNameToDisplay}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Divisi</span> <span className="font-semibold">{profile?.division || 'Belum diatur'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Mentor/PIC</span> <span className="font-semibold">{profile?.supervisorName || 'Belum diatur'}</span></div>
            </CardContent>
        </Card>
    )
}

function PeriodProgressCard({ profile }: { profile: EmployeeProfile | null }) {
    const startDate = profile?.internshipStartDate?.toDate();
    const endDate = profile?.internshipEndDate?.toDate();

    const { progress, remainingDays, totalDays, weekOf } = useMemo(() => {
        if (!startDate || !endDate) return { progress: 0, remainingDays: 'N/A', totalDays: 'N/A', weekOf: 'N/A' };
        
        const now = new Date();
        const totalDuration = differenceInDays(endDate, startDate);
        const elapsedDuration = differenceInDays(now, startDate);
        const progressPercentage = totalDuration > 0 ? Math.max(0, Math.min(100, (elapsedDuration / totalDuration) * 100)) : 0;
        const remaining = Math.max(0, differenceInDays(endDate, now));
        
        const currentWeek = Math.floor(elapsedDuration / 7) + 1;
        const totalWeeks = Math.ceil(totalDuration / 7);

        return {
            progress: progressPercentage,
            remainingDays: `${remaining} hari`,
            totalDays: `${totalDuration} hari`,
            weekOf: `Minggu ${currentWeek} dari ${totalWeeks}`
        };
    }, [startDate, endDate]);

    return (
         <Card>
            <CardHeader>
                <CardTitle className="text-base">Progres Periode Magang</CardTitle>
                <CardDescription className="text-xs">{weekOf}</CardDescription>
            </CardHeader>
            <CardContent>
                <Progress value={progress} className="w-full h-2 mb-2"/>
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{startDate ? format(startDate, 'dd MMM yyyy') : '-'}</span>
                    <span>{endDate ? format(endDate, 'dd MMM yyyy') : '-'}</span>
                </div>
                 <div className="mt-4 text-sm space-y-1">
                    <div className="flex justify-between"><span>Total Periode:</span><span className="font-semibold">{totalDays}</span></div>
                    <div className="flex justify-between"><span>Sisa Periode:</span><span className="font-semibold">{remainingDays}</span></div>
                </div>
            </CardContent>
        </Card>
    )
}

const mockReportStatus = 'not_created'; // 'not_created', 'created', 'revision'

function GreetingAndAlert({ name }: { name: string }) {
    let alertContent;
    switch(mockReportStatus) {
        case 'revision':
            alertContent = (
                <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ada Laporan yang Perlu Revisi!</AlertTitle>
                    <AlertDescription className="flex justify-between items-center">
                        Cek catatan dari mentor dan perbaiki laporan Anda.
                        <Button variant="destructive" size="sm" asChild><Link href="/admin/karyawan/magang/laporan-harian">Lihat Revisi</Link></Button>
                    </AlertDescription>
                </Alert>
            );
            break;
        case 'created':
             alertContent = (
                <Alert className="mt-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 dark:text-green-200">Laporan Hari Ini Terkirim!</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-300">
                        Laporan Anda sedang menunggu review dari mentor. Kerja bagus!
                    </AlertDescription>
                </Alert>
            );
            break;
        case 'not_created':
        default:
             alertContent = (
                <Alert className="mt-4">
                    <FileClock className="h-4 w-4" />
                    <AlertTitle>Jangan Lupa Laporan Harian!</AlertTitle>
                    <AlertDescription className="flex justify-between items-center">
                       Anda belum membuat laporan untuk hari ini.
                       <Button size="sm" asChild><Link href="/admin/karyawan/magang/laporan-harian">Buat Laporan</Link></Button>
                    </AlertDescription>
                </Alert>
            );
    }
    return (
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Halo, {name}!</h1>
            <p className="text-muted-foreground">Selamat datang di dashboard magang Anda.</p>
            {alertContent}
        </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <GreetingAndAlert name={userProfile.fullName} />
                <Card>
                    <CardHeader>
                        <CardTitle>Ringkasan Progres Laporan</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                        <div className="p-4 bg-muted/50 rounded-lg"><p className="text-2xl font-bold">21</p><p className="text-xs text-muted-foreground">Total Laporan</p></div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg"><p className="text-2xl font-bold text-green-600 dark:text-green-400">15</p><p className="text-xs text-green-700 dark:text-green-500">Disetujui</p></div>
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg"><p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">3</p><p className="text-xs text-yellow-700 dark:text-yellow-500">Perlu Revisi</p></div>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg"><p className="text-2xl font-bold text-blue-600 dark:text-blue-400">3</p><p className="text-xs text-blue-700 dark:text-blue-500">Menunggu Review</p></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-primary" />Fokus Hari Ini</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                         <div className="flex items-center p-3 rounded-md border bg-background hover:bg-muted/50 transition-colors">
                            <CheckSquare className="h-5 w-5 mr-3 text-muted-foreground" />
                            <p className="text-sm font-medium flex-grow">Kerjakan target sprint saat ini</p>
                         </div>
                         <div className="flex items-center p-3 rounded-md border bg-background hover:bg-muted/50 transition-colors">
                            <CheckSquare className="h-5 w-5 mr-3 text-muted-foreground" />
                            <p className="text-sm font-medium flex-grow">Siapkan materi untuk presentasi mingguan</p>
                         </div>
                         <div className="flex items-center p-3 rounded-md border bg-background hover:bg-muted/50 transition-colors">
                            <FilePlus className="h-5 w-5 mr-3 text-primary" />
                            <p className="text-sm font-medium flex-grow">Buat Laporan Harian</p>
                            <Button size="sm" asChild><Link href="/admin/karyawan/magang/laporan-harian">Buat</Link></Button>
                         </div>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-24">
                <PeriodProgressCard profile={employeeProfile} />
                <IdentityCard profile={employeeProfile} userProfile={userProfile} brands={brands} />
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Aksi Cepat</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                        <Button asChild variant="outline" size="sm"><Link href="/admin/karyawan/magang/laporan-harian"><FilePlus className="mr-2"/> Buat Laporan</Link></Button>
                        <Button asChild variant="outline" size="sm"><Link href="/admin/karyawan/magang/rekap-laporan"><BarChart className="mr-2"/> Rekap</Link></Button>
                        <Button asChild variant="outline" size="sm"><Link href="/admin/karyawan/magang/evaluasi"><CheckSquare className="mr-2"/> Evaluasi</Link></Button>
                        <Button asChild variant="outline" size="sm"><Link href="/admin/karyawan/magang/profile"><Edit className="mr-2"/> Edit Profil</Link></Button>
                    </CardContent>
                </Card>
            </div>
        </div>
      )}
    </DashboardLayout>
  );
}

    