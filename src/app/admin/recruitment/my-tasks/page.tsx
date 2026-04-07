'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, Eye } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import type { Job, JobApplication } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function MyTasksSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-80" />
            </CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...Array(3)].map((_, i) => (
                                <TableRow key={i}>
                                    {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

export default function MyRecruitmentTasksPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const assignedJobsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'jobs'),
      where('assignedUserIds', 'array-contains', userProfile.uid)
    );
  }, [userProfile?.uid, firestore]);

  const { data: assignedJobs, isLoading: isLoadingJobs, error: jobsError } = useCollection<Job>(assignedJobsQuery);

  const { data: allApplications, isLoading: isLoadingApps, error: appsError } = useCollection<JobApplication>(
      useMemoFirebase(() => collection(firestore, 'applications'), [firestore])
  );

  const applicantCounts = useMemo(() => {
      if (!allApplications) return new Map<string, number>();
      return allApplications.reduce((acc, app) => {
          acc.set(app.jobId, (acc.get(app.jobId) || 0) + 1);
          return acc;
      }, new Map<string, number>());
  }, [allApplications]);
  
  const jobsWithCounts = useMemo(() => {
    if (!assignedJobs) return [];
    return assignedJobs.map(job => ({
        ...job,
        applicantCount: applicantCounts.get(job.id!) || 0
    })).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  }, [assignedJobs, applicantCounts]);

  const isLoading = authLoading || isLoadingJobs || isLoadingApps;
  const error = jobsError || appsError;

  return (
    <DashboardLayout pageTitle="Tugas Rekrutmen Saya" menuConfig={menuConfig}>
        {isLoading ? <MyTasksSkeleton /> : error ? (
             <Alert variant="destructive">
                <AlertTitle>Gagal Memuat Tugas</AlertTitle>
                <AlertDescription>
                    Terjadi kesalahan saat mengambil data lowongan yang ditugaskan kepada Anda. Silakan coba lagi nanti.
                    <p className="mt-2 text-xs font-mono">{error.message}</p>
                </AlertDescription>
            </Alert>
        ) : (
            <Card>
                <CardHeader>
                <CardTitle>Tugas Rekrutmen Anda</CardTitle>
                <CardDescription>
                    Berikut adalah daftar lowongan di mana Anda ditugaskan sebagai bagian dari tim rekrutmen.
                </CardDescription>
                </CardHeader>
                <CardContent>
                    {jobsWithCounts.length > 0 ? (
                        <div className="rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Posisi</TableHead>
                                        <TableHead>Brand</TableHead>
                                        <TableHead>Tipe</TableHead>
                                        <TableHead>Jumlah Kandidat</TableHead>
                                        <TableHead>Status Lowongan</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobsWithCounts.map(job => (
                                        <TableRow key={job.id}>
                                            <TableCell className="font-medium">{job.position}</TableCell>
                                            <TableCell>{job.brandName}</TableCell>
                                            <TableCell><Badge variant="outline" className="capitalize">{job.statusJob}</Badge></TableCell>
                                            <TableCell>{job.applicantCount}</TableCell>
                                            <TableCell><Badge variant={job.publishStatus === 'published' ? 'default' : 'secondary'}>{job.publishStatus}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/admin/recruitment/jobs/${job.id}`}>
                                                        <Eye className="mr-2 h-4 w-4" /> Lihat Kandidat
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                         <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg">
                            <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="font-semibold">Anda Belum Ditugaskan</p>
                            <p className="text-sm text-muted-foreground">
                            Saat ini Anda belum ditugaskan ke lowongan pekerjaan manapun.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        )}
    </DashboardLayout>
  );
}
