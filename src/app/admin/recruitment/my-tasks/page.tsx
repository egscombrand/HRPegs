'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { JobApplication, Job, ApplicationInterview, UserProfile } from '@/lib/types';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRight, Briefcase, Calendar, CheckCircle2, Clock, User, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { ApplicationStatusBadge } from '@/components/recruitment/ApplicationStatusBadge';
import { getInitials } from '@/lib/utils';

// Helper to get the most relevant interview to display
const getDisplayInterview = (app: JobApplication): ApplicationInterview | null => {
    if (!app.interviews || app.interviews.length === 0) return null;
    const now = new Date();
    // Filter for interviews that are not canceled
    const relevantInterviews = app.interviews.filter(iv => iv.status !== 'canceled');
    if (relevantInterviews.length === 0) return null;

    // Find the next upcoming interview
    const upcoming = relevantInterviews
        .filter(iv => iv.startAt.toDate() >= now)
        .sort((a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime());
    
    if (upcoming.length > 0) return upcoming[0];
    
    // If no upcoming, find the most recent past one
    const past = relevantInterviews
        .sort((a, b) => b.startAt.toDate().getTime() - a.startAt.toDate().getTime());
    
    return past.length > 0 ? past[0] : null;
};

export default function MyRecruitmentTasksPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Queries remain the same as before
  const assignedJobsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'jobs'),
      where('assignedUserIds', 'array-contains', userProfile.uid)
    );
  }, [firestore, userProfile?.uid]);

  const { data: assignedJobs, isLoading: loadingJobs } = useCollection<Job>(assignedJobsQuery);
  const assignedJobIds = useMemo(() => assignedJobs?.map(j => j.id).filter(Boolean) as string[] || [], [assignedJobs]);
  
  const directAssignmentQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('internalReviewConfig.assignedReviewerUids', 'array-contains', userProfile.uid)
    );
  }, [firestore, userProfile?.uid]);

  const panelistAssignmentQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('allPanelistIds', 'array-contains', userProfile.uid)
    );
  }, [firestore, userProfile?.uid]);

  const jobLevelAppsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || assignedJobIds.length === 0) return null;
    // Firestore 'in' queries are limited to 30 items per query.
    return query(
      collection(firestore, 'applications'),
      where('jobId', 'in', assignedJobIds.slice(0, 30))
    );
  }, [firestore, userProfile?.uid, assignedJobIds]);

  const { data: directApps, isLoading: loadingDirect } = useCollection<JobApplication>(directAssignmentQuery);
  const { data: panelistApps, isLoading: loadingPanelist } = useCollection(panelistAssignmentQuery);
  const { data: jobApps, isLoading: loadingJobLevel } = useCollection(jobLevelAppsQuery);

  const applications = useMemo(() => {
    const all = [...(directApps || []), ...(panelistApps || []), ...(jobApps || [])];
    const unique = Array.from(new Map(all.map(a => [a.id, a])).values());
    return unique.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || (a.updatedAt as any)?.seconds || 0;
        const timeB = b.updatedAt?.toMillis?.() || (b.updatedAt as any)?.seconds || 0;
        return timeB - timeA;
    });
  }, [directApps, panelistApps, jobApps]);
  
  const isLoading = authLoading || loadingJobs || loadingDirect || loadingPanelist || (assignedJobIds.length > 0 && loadingJobLevel);

  if (!userProfile) return null;

  return (
    <DashboardLayout pageTitle="Tugas Rekrutmen Saya" menuConfig={menuConfig}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Tugas Rekrutmen Saya</h1>
          <p className="text-muted-foreground">Daftar kandidat yang ditugaskan kepada Anda untuk dilakukan evaluasi internal atau wawancara.</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !applications || applications.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Briefcase className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-semibold">Tidak Ada Tugas Review</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2 text-sm">
                Saat ini belum ada kandidat yang ditugaskan kepada Anda untuk evaluasi internal. Tugas akan muncul di sini jika HRD menambahkan Anda sebagai reviewer.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-none shadow-xl rounded-[2rem] bg-card/60 backdrop-blur-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold">Kandidat</TableHead>
                  <TableHead className="font-bold">Posisi</TableHead>
                  <TableHead className="font-bold">Tahap Saat Ini</TableHead>
                  <TableHead className="font-bold">Jadwal Wawancara</TableHead>
                  <TableHead className="text-right font-bold">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => {
                  const interview = getDisplayInterview(app);
                  return (
                  <TableRow key={app.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                          {getInitials(app.candidateName)}
                        </div>
                        <div>
                          <p className="font-bold">{app.candidateName}</p>
                          <p className="text-xs text-muted-foreground">{app.candidateEmail}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{app.jobPosition}</p>
                      <p className="text-xs text-muted-foreground">{app.brandName}</p>
                    </TableCell>
                    <TableCell>
                      <ApplicationStatusBadge status={app.status} className="text-[10px] h-4" />
                    </TableCell>
                    <TableCell>
                        {interview ? (
                            <div className="flex items-center gap-2 text-xs font-semibold">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{format(interview.startAt.toDate(), 'dd MMM, HH:mm')}</span>
                                {interview.meetingLink && <LinkIcon className="h-3.5 w-3.5 text-blue-500" />}
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground italic">Belum terjadwal</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild className="rounded-xl group">
                        <Link href={`/admin/recruitment/applications/${app.id}`}>
                          Buka Detail <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
