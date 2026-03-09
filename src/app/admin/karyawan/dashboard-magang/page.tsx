'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { EmployeeProfile, UserProfile, Brand, JobApplication } from '@/lib/types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

function DashboardSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
        </div>
    )
}

function PlacementInfoCard({
  profile,
  userProfile,
  brands,
}: {
  profile: EmployeeProfile | null;
  userProfile: UserProfile | null;
  brands: Brand[] | null;
}) {
  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map(b => [b.id!, b.name]));
  }, [brands]);

  const brandNameToDisplay = useMemo(() => {
    // Priority 1: From employee_profiles (HR-set override)
    if (profile?.brandName) {
      return profile.brandName;
    }
    // Priority 2: From users (set during registration/activation)
    if (userProfile?.brandId) {
      if (Array.isArray(userProfile.brandId)) {
        return userProfile.brandId
          .map(id => brandMap.get(id))
          .filter(Boolean)
          .join(', ');
      }
      return brandMap.get(userProfile.brandId as string);
    }
    return 'Belum diatur';
  }, [profile, userProfile, brandMap]);
  
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Informasi Penempatan</CardTitle>
                 <CardDescription>Detail penempatan dan penanggung jawab Anda selama periode magang.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Brand</span> <span className="font-semibold">{brandNameToDisplay}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Divisi</span> <span className="font-semibold">{profile?.division || 'Belum diatur'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Supervisor / PIC</span> <span className="font-semibold">{profile?.supervisorName || 'Belum diatur'}</span></div>
            </CardContent>
        </Card>
    );
}

function PeriodCard({ profile, application }: { profile: EmployeeProfile | null, application: JobApplication | null }) {
    // Priority: Official HR data (profile) > Data from recruitment offer (application)
    const startDate = profile?.internshipStartDate?.toDate() || application?.contractStartDate?.toDate();
    const endDate = profile?.internshipEndDate?.toDate() || application?.contractEndDate?.toDate();

    return (
        <Card className="bg-primary/5 text-primary-foreground border-primary/20">
            <CardHeader>
                <CardTitle className="text-lg text-primary">Periode Magang Anda</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-around text-center">
                    <div>
                        <p className="text-xs text-primary/80">Mulai Magang</p>
                        <p className="font-bold text-xl text-primary">{startDate ? format(startDate, 'dd MMM yyyy', { locale: id }) : 'TBA'}</p>
                    </div>
                    <div className="h-12 w-px bg-primary/20" />
                    <div>
                        <p className="text-xs text-primary/80">Selesai Magang</p>
                        <p className="font-bold text-xl text-primary">{endDate ? format(endDate, 'dd MMM yyyy', { locale: id }) : 'TBA'}</p>
                    </div>
                </div>
                {!startDate && (
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

  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const applicationQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    // Remove orderBy and limit to avoid needing a composite index
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid),
      where('status', '==', 'hired')
    );
  }, [firestore, userProfile]);

  const { data: applications, isLoading: isLoadingApplication } = useCollection<JobApplication>(applicationQuery);

  const application = useMemo(() => {
    if (!applications || applications.length === 0) return null;
    // Sort on the client to get the most recent hired application
    const sortedApps = [...applications].sort((a, b) => {
        const timeA = a.updatedAt?.toMillis() || 0;
        const timeB = b.updatedAt?.toMillis() || 0;
        return timeB - timeA;
    });
    return sortedApps[0];
  }, [applications]);

  const isLoading = authLoading || profileLoading || brandsLoading || isLoadingApplication;

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
            <PlacementInfoCard profile={employeeProfile} userProfile={userProfile} brands={brands} />
            <PeriodCard profile={employeeProfile} application={application} />
        </div>
      )}
    </DashboardLayout>
  );
}
