'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, ApplicationInterview, Job, UserProfile, Brand } from '@/lib/types';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format, differenceInMinutes, addDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  ArrowRight, Briefcase, Calendar, Link as LinkIcon,
  Clock, Users, Video, Info, ExternalLink, ChevronRight,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { getInitials } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// --- Helpers ───────────────────────────────────────────────────────────────

const safeToDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.toMillis === 'function') return new Date(ts.toMillis());
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
  return null;
};

const getDisplayInterview = (app: JobApplication): ApplicationInterview | null => {
    if (!app.interviews || app.interviews.length === 0) return null;

    const sortedInterviews = [...app.interviews]
        .filter(iv => iv && iv.status !== 'canceled' && iv.startAt)
        .sort((a, b) => (a.startAt?.toMillis() || 0) - (b.startAt?.toMillis() || 0));

    if (sortedInterviews.length === 0) return null;

    const now = new Date();
    // Prioritize interviews that are not yet completed or are currently happening
    const activeOrUpcoming = sortedInterviews.filter(iv => iv.status === 'scheduled' || iv.status === 'reschedule_requested');

    const upcoming = activeOrUpcoming.find(iv => iv.startAt.toDate() >= now);
    if (upcoming) return upcoming;
    
    // If no upcoming, return the most recent active/past one
    const past = activeOrUpcoming.sort((a,b) => b.startAt.toMillis() - a.startAt.toMillis());
    if (past.length > 0) return past[0];
    
    // Fallback to any latest interview if no active ones found
    return sortedInterviews.pop() || null;
};


// --- Modal payload types ────────────────────────────────────────────────────

type ModalData =
  | { type: 'actual'; interview: ApplicationInterview; app: JobApplication }
  | { type: 'template'; template: NonNullable<Job['interviewTemplate']>; app: JobApplication; jobPosition: string };

// --- Interview Detail Modal ─────────────────────────────────────────────────

function InterviewDetailModal({
  data,
  open,
  onClose,
}: {
  data: ModalData | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!data) return null;

  const isTemplate = data.type === 'template';

  const meetingLink = isTemplate
    ? data.template.meetingLink
    : data.interview.meetingLink;

  const startDate = isTemplate
    ? safeToDate(data.template.defaultStartDate)
    : safeToDate(data.interview.startAt);

  const endDate = !isTemplate ? safeToDate(data.interview.endAt) : null;

  const duration =
    !isTemplate && startDate && endDate
      ? differenceInMinutes(endDate, startDate)
      : isTemplate
      ? data.template.slotDurationMinutes
      : null;

  const panelistNames = !isTemplate ? data.interview.panelistNames ?? [] : [];

  const candidateName = data.app.candidateName;
  const jobPosition = data.app.jobPosition;
  const brandName = data.app.brandName;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">{getInitials(candidateName)}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl mb-1">{candidateName}</DialogTitle>
              <DialogDescription>
                {jobPosition} &middot; {brandName}
              </DialogDescription>
              {isTemplate && (
                <Badge variant="outline" className="mt-2 text-xs gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-500">
                  <Info className="h-3 w-3" />
                  Informasi dari Template (Jadwal belum final)
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="grid md:grid-cols-2 gap-x-6 gap-y-8 py-2">
            <div className="space-y-6">
                <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Tanggal & Waktu</p>
                        {startDate ? (
                            <p className="font-semibold text-base">{format(startDate, 'EEEE, dd MMMM yyyy', { locale: idLocale })}</p>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">Tanggal belum ditentukan</p>
                        )}
                        {startDate && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {isTemplate ? `Mulai pukul ${data.template.workdayStartTime ?? '–'}` : `${format(startDate, 'HH:mm')}${endDate ? ` – ${format(endDate, 'HH:mm')} WIB` : ' WIB'}`}
                            </p>
                        )}
                    </div>
                </div>

                {duration != null && (
                    <div className="flex items-start gap-3">
                        <Clock className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                        <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Durasi</p>
                        <p className="text-base font-semibold">{duration} menit</p>
                        </div>
                    </div>
                )}
                 {!isTemplate && panelistNames.length > 0 && (
                    <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Pewawancara / Panelis</p>
                            <div className="flex flex-wrap gap-1.5">
                                {panelistNames.map((name, i) => (
                                    <Badge key={i} variant="secondary">{name}</Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="space-y-4">
                 {meetingLink ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                            <Video className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Link Meeting</p>
                            <p className="text-xs font-mono text-muted-foreground break-all">{meetingLink}</p>
                            </div>
                        </div>
                        <Button asChild className="gap-2 w-full">
                            <a href={meetingLink} target="_blank" rel="noopener noreferrer">
                            <Video className="h-4 w-4" />
                            Bergabung ke Meeting
                            <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                            </a>
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                        <Video className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                        <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Link Meeting</p>
                        <p className="text-sm font-semibold text-muted-foreground">Belum tersedia</p>
                        </div>
                    </div>
                )}
                 {!isTemplate && data.interview.notes && (
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                        <Info className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                        <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Catatan</p>
                        <p className="text-sm">{data.interview.notes}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <DialogFooter>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/admin/recruitment/applications/${data.app.id}`}>
                Lihat Profil Kandidat <ChevronRight className="h-4 w-4" />
                </Link>
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MyRecruitmentTasksPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();

  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = (data: ModalData) => {
    setModalData(data);
    setIsModalOpen(true);
  };

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
  }, [firestore, userProfile?.uid]);

  const { data: assignedJobs, isLoading: loadingJobs } = useCollection<Job>(assignedJobsQuery);
  const assignedJobIds = useMemo(
    () => (assignedJobs?.map(j => j.id).filter(Boolean) as string[]) || [],
    [assignedJobs]
  );

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

  const jobMap = useMemo(() => {
    const map = new Map<string, Job>();
    (assignedJobs || []).forEach(j => { if (j.id) map.set(j.id, j); });
    return map;
  }, [assignedJobs]);

  const isLoading =
    authLoading ||
    loadingJobs ||
    loadingDirect ||
    loadingPanelist ||
    (assignedJobIds.length > 0 && loadingJobLevel);
    
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  const filteredApplications = useMemo(() => {
    if (!applications) return [];
    return applications.filter(app => {
        const stageMatch = stageFilter === 'all' || app.status === stageFilter;
        const searchMatch = searchTerm === '' || 
            app.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) || 
            app.jobPosition.toLowerCase().includes(searchTerm.toLowerCase());
        return stageMatch && searchMatch;
    });
  }, [applications, stageFilter, searchTerm]);

  if (!userProfile) return null;

  return (
    <DashboardLayout pageTitle="Tugas Rekrutmen Saya" menuConfig={menuConfig}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Tugas Rekrutmen Saya</h1>
          <p className="text-muted-foreground">
            Daftar kandidat yang ditugaskan kepada Anda untuk dilakukan evaluasi internal atau wawancara.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari kandidat atau posisi..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Filter tahap..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Semua Tahap</SelectItem>
                    {Object.entries(statusDisplayLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !filteredApplications || filteredApplications.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Briefcase className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-semibold">Tidak Ada Tugas Review</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2 text-sm">
                Saat ini belum ada kandidat yang membutuhkan tindakan dari Anda.
                Tugas akan muncul di sini jika HRD menambahkan Anda sebagai reviewer.
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
                {filteredApplications.map(app => {
                  const interview = getDisplayInterview(app);
                  const jobTemplate = !interview
                    ? jobMap.get(app.jobId)?.interviewTemplate
                    : null;
                  const templateDate = jobTemplate?.defaultStartDate
                    ? safeToDate(jobTemplate.defaultStartDate)
                    : null;

                  return (
                    <TableRow key={app.id} className="hover:bg-muted/30 transition-colors">
                      {/* Kandidat */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10"><AvatarFallback>{getInitials(app.candidateName)}</AvatarFallback></Avatar>
                          <div>
                            <p className="font-bold">{app.candidateName}</p>
                            <p className="text-xs text-muted-foreground">{app.candidateEmail}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Posisi */}
                      <TableCell>
                        <p className="text-sm font-medium">{app.jobPosition}</p>
                        <p className="text-xs text-muted-foreground">{app.brandName}</p>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <ApplicationStatusBadge status={app.status} className="text-[10px] h-4" />
                      </TableCell>

                      {/* Jadwal Wawancara — klikable buka modal */}
                      <TableCell>
                        {interview ? (
                          <Button
                            variant="ghost"
                            className="text-left p-0 h-auto font-normal group"
                            onClick={() => openModal({ type: 'actual', interview, app })}
                          >
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                                {format(safeToDate(interview.startAt)!, 'dd MMM, HH:mm')}
                              </p>
                            </div>
                          </Button>
                        ) : jobTemplate && (templateDate || jobTemplate.meetingLink) ? (
                          <Button
                            variant="ghost"
                            className="text-left p-0 h-auto font-normal group"
                            onClick={() => openModal({ type: 'template', template: jobTemplate, app, jobPosition: app.jobPosition })}
                          >
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-sky-500" />
                              <div className="leading-tight">
                                <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                                    Jadwal dari Template
                                </p>
                              </div>
                            </div>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {app.status === 'interview' ? 'Menunggu penjadwalan' : 'Belum terjadwal'}
                          </span>
                        )}
                      </TableCell>
                      
                      {/* Aksi */}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild className="rounded-xl group">
                          <Link href={`/admin/recruitment/applications/${app.id}`}>
                            Buka Detail{' '}
                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Modal Detail Jadwal */}
      <InterviewDetailModal
        data={modalData}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </DashboardLayout>
  );
}
