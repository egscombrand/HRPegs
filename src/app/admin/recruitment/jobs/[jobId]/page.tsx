'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { Job, JobApplication, UserProfile, Brand } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ApplicantsPageClient } from '@/components/recruitment/ApplicantsPageClient';
import { AssignedUsersCard } from '@/components/recruitment/AssignedUsersCard';

function ApplicantsPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[240px]" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default function RecruitmentApplicantsPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  
  const jobRef = useMemoFirebase(() => (jobId ? doc(firestore, 'jobs', jobId) : null), [firestore, jobId]);
  const { data: job, isLoading: isLoadingJob, mutate: mutateJob } = useDoc<Job>(jobRef);

  const applicationsQuery = useMemoFirebase(
    () => (jobId ? query(collection(firestore, 'applications'), where('jobId', '==', jobId)) : null),
    [firestore, jobId]
  );
  const { data: applications, isLoading: isLoadingApps, error } = useCollection<JobApplication>(applicationsQuery);

  const usersQuery = useMemoFirebase(() => {
    if (!userProfile || !['super-admin', 'hrd'].includes(userProfile.role)) {
        return null;
    }
    return query(
      collection(firestore, 'users'),
      where('role', 'in', ['manager', 'karyawan', 'hrd', 'super-admin']),
      where('isActive', '==', true)
    );
  }, [firestore, userProfile]);

  const { data: usersToFilter, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  const assignableUsers = useMemo(() => {
    if (!usersToFilter) return [];
    // Filter out interns and trainees from the 'karyawan' role
    return usersToFilter.filter(u => u.role === 'manager' || (u.role === 'karyawan' && u.employmentType === 'karyawan'));
  }, [usersToFilter]);

  const brandsQuery = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsQuery);

  const hasAccess = useMemo(() => {
    if (isLoadingJob || !userProfile || !job) return false;
    if (userProfile.role === 'super-admin' || userProfile.role === 'hrd') return true;
    if (job.assignedUserIds?.includes(userProfile.uid)) return true;
    return false;
  }, [userProfile, job, isLoadingJob]);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'];
    // For assigned users, show their own menu config
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);
  
  const isLoading = isLoadingApps || isLoadingJob || isLoadingUsers || isLoadingBrands;

  if (!hasAccess && !isLoading) {
    return (
       <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}>
        <Alert variant="destructive">
          <AlertTitle>Akses Ditolak</AlertTitle>
          <AlertDescription>Anda tidak memiliki izin untuk melihat halaman ini.</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout 
        pageTitle="Loading Applicants..." 
        menuConfig={menuConfig}
      >
        <ApplicantsPageSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout 
        pageTitle="Error" 
        menuConfig={menuConfig}
      >
        <Alert variant="destructive">
          <AlertTitle>Error Loading Applications</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
        pageTitle={`Applicants for: ${job?.position || '...'}`} 
        menuConfig={menuConfig}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/recruitment')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Job List
            </Button>
        </div>
        
        {job && (userProfile?.role === 'hrd' || userProfile?.role === 'super-admin') && (
            <AssignedUsersCard 
                job={job} 
                allUsers={assignableUsers}
                allBrands={brands || []}
                onUpdate={mutateJob} 
            />
        )}
        
        <ApplicantsPageClient 
          applications={applications || []} 
          job={job}
          onJobUpdate={mutateJob}
          allUsers={assignableUsers}
          allBrands={brands || []}
        />
      </div>
    </DashboardLayout>
  );
}
