'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking, useCollection } from '@/firebase';
import { doc, serverTimestamp, updateDoc, Timestamp, writeBatch, collection, where, query } from 'firebase/firestore';
import type { JobApplication, Profile, Job, ApplicationTimelineEvent, ApplicationInterview, RescheduleRequest, Brand, UserProfile } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, XCircle, Calendar, Users, RefreshCw, X, MessageSquare, AlertTriangle, Edit, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ProfileView } from '@/components/recruitment/ProfileView';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { format, differenceInMinutes, add } from 'date-fns';
import { ApplicationProgressStepper } from '@/components/recruitment/ApplicationProgressStepper';
import { CandidateDocumentsCard } from '@/components/recruitment/CandidateDocumentsCard';
import { CandidateFitAnalysis } from '@/components/recruitment/CandidateFitAnalysis';
import { ApplicationActionBar } from '@/components/recruitment/ApplicationActionBar';
import { ApplicationNotes } from '@/components/recruitment/ApplicationNotes';
import type { ScheduleInterviewData } from '@/components/recruitment/ScheduleInterviewDialog';
import { ScheduleInterviewDialog } from '@/components/recruitment/ScheduleInterviewDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { id as idLocale } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ManagePanelistsDialog } from '@/components/recruitment/ManagePanelistsDialog';

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

function InterviewManagement({ application, onUpdate, allUsers, allBrands, job }: { application: JobApplication; onUpdate: () => void; allUsers: UserProfile[], allBrands: Brand[], job: Job }) {
  const [isScheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [isManagePanelistsOpen, setManagePanelistsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeInterview, setActiveInterview] = useState<ApplicationInterview | null>(null);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleOpenScheduleDialog = (interview: ApplicationInterview | null = null) => {
    setActiveInterview(interview);
    setScheduleDialogOpen(true);
  };
  
  const handleOpenPanelistDialog = (interview: ApplicationInterview) => {
    setActiveInterview(interview);
    setManagePanelistsOpen(true);
  };
  
  const handleTogglePublish = async (interviewToToggle: ApplicationInterview) => {
    if (!application || !userProfile) return;

    const isCurrentlyPublished = !!interviewToToggle.meetingPublished;

    // Prevent publishing if the link is missing
    if (!isCurrentlyPublished && !interviewToToggle.meetingLink) {
        toast({ variant: 'destructive', title: 'Link Kosong', description: 'Tambahkan link meeting sebelum mempublikasikannya.' });
        return;
    }
    
    setIsSubmitting(true);

    const newInterviews = (application.interviews || []).map(iv => {
        if (iv.interviewId === interviewToToggle.interviewId) {
            return {
                ...iv,
                meetingPublished: !isCurrentlyPublished,
                meetingPublishedAt: !isCurrentlyPublished ? Timestamp.now() : null,
                meetingPublishedBy: !isCurrentlyPublished ? userProfile.uid : null,
            };
        }
        return iv;
    });

    try {
        await updateDoc(doc(firestore, 'applications', application.id!), { interviews: newInterviews });
        toast({ 
            title: isCurrentlyPublished ? 'Link Ditarik Kembali' : 'Link Dipublish',
            description: isCurrentlyPublished ? 'Panelis tidak dapat lagi melihat link meeting.' : 'Panelis sekarang dapat melihat link meeting.' 
        });
        onUpdate();
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal Memperbarui Status', description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleConfirmSchedule = async (data: ScheduleInterviewData) => {
    if (!application || !userProfile) return false;

    setIsSubmitting(true);

    const newInterviews = [...(application.interviews || [])];
    const newTimeline = [...(application.timeline || [])];
    
    try {
        const panelistIds = data.panelists.map(p => p.value);
        const panelistNames = data.panelists.map(p => p.label);

        if (activeInterview && !activeInterview.rescheduleRequest) { // Pure Edit
            const index = newInterviews.findIndex(iv => iv.interviewId === activeInterview.interviewId);
            if (index !== -1) {
                newInterviews[index] = {
                    ...newInterviews[index],
                    startAt: Timestamp.fromDate(data.dateTime),
                    endAt: Timestamp.fromDate(add(data.dateTime, { minutes: data.duration })),
                    panelistIds: panelistIds,
                    panelistNames: panelistNames,
                    meetingLink: data.meetingLink || "",
                    notes: data.notes,
                };
                newTimeline.push({
                    type: 'status_changed',
                    at: Timestamp.now(),
                    by: userProfile.uid,
                    meta: { note: `Jadwal wawancara diperbarui oleh HRD.` },
                });

                const allPanelistIds = new Set<string>();
                newInterviews.forEach(iv => {
                    if (iv.status === 'scheduled') {
                        iv.panelistIds.forEach(id => allPanelistIds.add(id));
                    }
                });

                await updateDoc(doc(firestore, 'applications', application.id!), { interviews: newInterviews, timeline: newTimeline, allPanelistIds: Array.from(allPanelistIds) });
                toast({ title: 'Wawancara Diperbarui' });
            } else {
                 throw new Error("Wawancara yang akan diedit tidak ditemukan.");
            }
        } else { // Create or Counter-proposal
            if (activeInterview && activeInterview.rescheduleRequest) { // Counter-proposal
                const index = newInterviews.findIndex(iv => iv.interviewId === activeInterview.interviewId);
                if (index !== -1) {
                    newInterviews[index].status = 'canceled';
                    newInterviews[index].rescheduleRequest!.status = 'countered';
                    newInterviews[index].rescheduleRequest!.decidedAt = Timestamp.now();
                    newInterviews[index].rescheduleRequest!.decidedByUid = userProfile.uid;
                    newInterviews[index].rescheduleRequest!.hrResponseNote = 'HRD telah mengusulkan jadwal baru.';
                }
            }

            const newInterview: ApplicationInterview = {
                interviewId: crypto.randomUUID(),
                startAt: Timestamp.fromDate(data.dateTime),
                endAt: Timestamp.fromDate(add(data.dateTime, { minutes: data.duration })),
                panelistIds: panelistIds,
                panelistNames: panelistNames,
                status: 'scheduled',
                meetingLink: data.meetingLink || "",
                notes: data.notes,
                meetingPublished: false,
            };
            newInterviews.push(newInterview);
            
            newTimeline.push({
                type: 'interview_scheduled',
                at: Timestamp.now(),
                by: userProfile.uid,
                meta: { interviewDate: Timestamp.fromDate(data.dateTime) }
            });
            const allPanelistIds = new Set<string>(application.allPanelistIds || []);
            panelistIds.forEach(id => allPanelistIds.add(id));

            await updateDoc(doc(firestore, 'applications', application.id!), { interviews: newInterviews, timeline: newTimeline, allPanelistIds: Array.from(allPanelistIds) });
            toast({ title: activeInterview ? 'Jadwal Baru Diajukan' : 'Wawancara Dijadwalkan' });
        }
        
        onUpdate();
        return true;
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
        return false;
    } finally {
        setIsSubmitting(false);
    }
  };

   const handleApproveReschedule = async (interviewToApprove: ApplicationInterview, approvedSlot: { startAt: Timestamp; endAt: Timestamp }) => {
    if (!application || !userProfile) return;
    setIsSubmitting(true);

    const newInterviews = (application.interviews || []).map(iv => {
        if (iv.interviewId === interviewToApprove.interviewId) {
            return {
                ...iv,
                startAt: approvedSlot.startAt,
                endAt: approvedSlot.endAt,
                status: 'scheduled' as const,
                rescheduleRequest: {
                    ...iv.rescheduleRequest!,
                    status: 'approved' as const,
                    decidedAt: Timestamp.now(),
                    decidedByUid: userProfile.uid,
                }
            };
        }
        return iv;
    });

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'status_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { note: 'Jadwal ulang wawancara disetujui oleh HRD.' },
    };

    try {
        await updateDoc(doc(firestore, 'applications', application.id!), {
            interviews: newInterviews,
            timeline: [...(application.timeline || []), timelineEvent]
        });
        onUpdate();
        toast({ title: 'Jadwal Ulang Disetujui' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Menyetujui', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleDenyReschedule = async (interviewToDeny: ApplicationInterview) => {
    if (!application || !userProfile) return;
    setIsSubmitting(true);
    const newInterviews = (application.interviews || []).map(iv => {
        if (iv.interviewId === interviewToDeny.interviewId) {
            return {
                ...iv,
                status: 'scheduled' as const,
                rescheduleRequest: {
                    ...iv.rescheduleRequest!,
                    status: 'denied' as const,
                    decidedAt: Timestamp.now(),
                    decidedByUid: userProfile.uid,
                    hrResponseNote: "Jadwal yang diusulkan tidak tersedia. Mohon ikuti jadwal semula.",
                }
            };
        }
        return iv;
    });

    try {
        await updateDoc(doc(firestore, 'applications', application.id!), { interviews: newInterviews });
        onUpdate();
        toast({ title: 'Permintaan Ditolak', description: 'Status wawancara dikembalikan ke "Terjadwal".' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Menolak', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (application.status !== 'interview') {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Manajemen Wawancara</CardTitle>
            {(!application.interviews || application.interviews.filter(iv => iv.status !== 'canceled').length === 0) && (
              <Button size="sm" onClick={() => handleOpenScheduleDialog()}>Jadwalkan Wawancara Baru</Button>
            )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!application.interviews || application.interviews.filter(iv => iv.status !== 'canceled').length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada wawancara yang dijadwalkan.</p>
        ) : (
            <div className="space-y-4">
                {application.interviews.filter(iv => iv.status !== 'canceled').map((iv, index) => (
                    <div key={iv.interviewId || index} className="p-4 border rounded-lg space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold">{format(iv.startAt.toDate(), 'eeee, dd MMM yyyy, HH:mm', { locale: idLocale })}</p>
                                <p className="text-sm text-muted-foreground">Pewawancara: {(iv.panelistNames || iv.interviewerNames || []).join(', ')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {userProfile && ['super-admin', 'hrd'].includes(userProfile.role) && (
                                    <>
                                        <Button 
                                            variant={iv.meetingPublished ? "outline" : "secondary"} 
                                            size="sm" 
                                            onClick={() => handleTogglePublish(iv)} 
                                            disabled={isSubmitting || (!iv.meetingPublished && !iv.meetingLink)}
                                            title={!iv.meetingPublished && !iv.meetingLink ? "Tambahkan link meeting untuk bisa publish" : ""}
                                        >
                                            {iv.meetingPublished ? (
                                                <><X className="mr-2 h-4 w-4" /> Unpublish</>
                                            ) : (
                                                <><ShieldCheck className="mr-2 h-4 w-4" /> Publish</>
                                            )}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => handleOpenPanelistDialog(iv)}>
                                            Kelola Panelis
                                        </Button>
                                    </>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleOpenScheduleDialog(iv)}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit
                                </Button>
                                <Badge variant={iv.status === 'scheduled' ? 'default' : 'secondary'} className="capitalize">{iv.status.replace('_', ' ')}</Badge>
                            </div>
                        </div>
                        {iv.status === 'reschedule_requested' && iv.rescheduleRequest && (
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Permintaan Jadwal Ulang</AlertTitle>
                                <AlertDescription>
                                    <div className="space-y-3">
                                        <p className="italic">Alasan: "{iv.rescheduleRequest.reason}"</p>
                                        <div className="space-y-2">
                                            <p className="font-semibold text-foreground">Usulan Waktu Kandidat:</p>
                                            <ul className="space-y-2">
                                                {iv.rescheduleRequest.proposedSlots.map((slot, slotIndex) => (
                                                    <li key={slotIndex} className="flex items-center justify-between text-sm p-2 bg-background/50 rounded-md">
                                                        <span>{format(slot.startAt.toDate(), 'eeee, dd MMM yyyy - HH:mm', { locale: idLocale })}</span>
                                                        <Button size="sm" onClick={() => handleApproveReschedule(iv, slot)} disabled={isSubmitting}>Setujui</Button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </AlertDescription>
                                <div className="flex gap-2 mt-4 pt-4 border-t">
                                    <Button size="sm" onClick={() => handleOpenScheduleDialog(iv)} disabled={isSubmitting}>Buat Jadwal Baru (Counter)</Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDenyReschedule(iv)} disabled={isSubmitting}>Tolak Permintaan</Button>
                                </div>
                            </Alert>
                        )}
                    </div>
                ))}
            </div>
        )}
      </CardContent>
       <ScheduleInterviewDialog
        open={isScheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onConfirm={handleConfirmSchedule}
        candidateName={application.candidateName}
        recruiter={userProfile!}
        initialData={activeInterview ? {
            dateTime: activeInterview.startAt.toDate(),
            duration: differenceInMinutes(activeInterview.endAt.toDate(), activeInterview.startAt.toDate()),
            meetingLink: activeInterview.meetingLink,
            panelists: activeInterview.panelistIds?.map((id, index) => ({ value: id, label: (activeInterview.panelistNames || [])[index] || id })) || [],
            notes: activeInterview.notes,
        } : undefined}
        allUsers={allUsers}
        allBrands={allBrands}
        job={job}
      />
      {activeInterview && userProfile && (
        <ManagePanelistsDialog
            open={isManagePanelistsOpen}
            onOpenChange={setManagePanelistsOpen}
            application={application}
            interview={activeInterview}
            currentUser={userProfile}
            allUsers={allUsers}
            allBrands={allBrands}
            onSuccess={onUpdate}
        />
      )}
    </Card>
  );
}


export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;
  const [hasTriggeredAutoScreen, setHasTriggeredAutoScreen] = useState(false);

  const applicationRef = useMemoFirebase(
    () => (applicationId ? doc(firestore, 'applications', applicationId) : null),
    [firestore, applicationId]
  );
  const { data: application, isLoading: isLoadingApp, mutate: mutateApplication } = useDoc<JobApplication>(applicationRef);

  const profileRef = useMemoFirebase(
    () => (application ? doc(firestore, 'profiles', application.candidateUid) : null),
    [firestore, application]
  );
  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(profileRef);
  
  const jobRef = useMemoFirebase(
    () => (application ? doc(firestore, 'jobs', application.jobId) : null),
    [firestore, application]
  );
  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobRef);

  const internalUsersQuery = useMemoFirebase(() =>
    query(
      collection(firestore, 'users'),
      where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
      where('isActive', '==', true)
    ),
    [firestore]
  );
  const { data: internalUsers, isLoading: isLoadingUsers } = useCollection<UserProfile>(internalUsersQuery);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(useMemoFirebase(() => collection(firestore, 'brands'), [firestore]));

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') {
      return MENU_CONFIG['hrd'];
    }
    return [];
  }, [userProfile]);

  const handleStageChange = async (newStage: JobApplication['status'], reason: string) => {
    if (!application || !userProfile) return false;

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'stage_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
            from: application.status,
            to: newStage,
            note: reason,
        }
    };
    
    const updatePayload: any = {
        status: newStage,
        updatedAt: serverTimestamp(),
        timeline: [
            ...(application.timeline || []),
            timelineEvent
        ]
    };
    
    if (newStage === 'tes_kepribadian' && !application.personalityTestAssignedAt) {
      updatePayload.personalityTestAssignedAt = serverTimestamp();
    }
    if (['hired', 'rejected'].includes(newStage)) {
      updatePayload.decisionAt = serverTimestamp();
    }

    try {
        await updateDoc(applicationRef!, updatePayload);
        mutateApplication(); // Re-fetch data
        toast({ title: 'Status Diperbarui', description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".` });
        return true;
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Memperbarui', description: error.message });
        return false;
    }
  };

  useEffect(() => {
    const autoScreening = async () => {
      if (isLoadingApp || !application || !userProfile || application.status !== 'submitted' || hasTriggeredAutoScreen) {
        return;
      }
      setHasTriggeredAutoScreen(true);
      
      const timelineEvent: ApplicationTimelineEvent = {
        type: 'stage_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
          from: 'submitted',
          to: 'screening',
          note: 'Application automatically moved to screening upon HR review.',
        },
      };

      const updatePayload = {
        status: 'screening',
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      };

      try {
        await updateDocumentNonBlocking(applicationRef!, updatePayload);
        mutateApplication(); 
        toast({
          title: 'Lamaran Discreening',
          description: `Status lamaran ini secara otomatis diperbarui menjadi "Screening".`,
        });
      } catch (error) {
        console.error("Failed to auto-update status to screening:", error);
      }
    };

    autoScreening();
  }, [application, isLoadingApp, userProfile, hasTriggeredAutoScreen, applicationRef, mutateApplication, toast]);


  const isLoading = isLoadingApp || isLoadingProfile || isLoadingJob || isLoadingUsers || isLoadingBrands;

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Loading..." menuConfig={[]}><ApplicationDetailSkeleton /></DashboardLayout>;
  }

  return (
    <DashboardLayout 
        pageTitle="Application Detail" 
        menuConfig={menuConfig}
    >
      {isLoading ? (
        <ApplicationDetailSkeleton />
      ) : !application || !profile || !job ? (
        <p>Application, profile, or job details not found.</p>
      ) : (
        <>
        <div className="space-y-6">
          <ApplicationActionBar 
            application={application} 
            onStageChange={handleStageChange}
            onSendOfferClick={() => {}}
          />
          
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border">
                     <AvatarImage src={application.candidatePhotoUrl || `https://picsum.photos/seed/${application.candidateUid}/100/100`} alt={profile.fullName} data-ai-hint="profile avatar" />
                     <AvatarFallback className="text-xl">{getInitials(profile.fullName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
                    <CardDescription className="text-base">{profile.nickname}</CardDescription>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> {application.candidateEmail}</span>
                        <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {profile.phone}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <ApplicationStatusBadge status={application.status} className="text-base px-4 py-1" />
                     {application.submittedAt && <p className="text-sm text-muted-foreground">Applied on {format(application.submittedAt.toDate(), 'dd MMM yyyy')}</p>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="border-t pt-6 space-y-6">
                <h3 className="font-semibold text-lg">Applied for: {application.jobPosition}</h3>
                 {application.status !== 'rejected' ? (
                  <ApplicationProgressStepper currentStatus={application.status} />
                 ) : (
                    <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                        <XCircle className="h-5 w-5" />
                        <p className="text-sm font-medium">This application was rejected.</p>
                    </div>
                 )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <InterviewManagement job={job} application={application} onUpdate={mutateApplication} allUsers={internalUsers || []} allBrands={brands || []} />
                <CandidateFitAnalysis profile={profile} job={job} application={application}/>
                <ProfileView profile={profile} />
            </div>
            <div className="lg:sticky lg:top-24 space-y-6">
                <CandidateDocumentsCard application={application} profile={profile} onVerificationChange={mutateApplication}/>
                <ApplicationNotes application={application} onNoteAdded={mutateApplication} />
            </div>
          </div>
        </div>
        </>
      )}
    </DashboardLayout>
  );
}
