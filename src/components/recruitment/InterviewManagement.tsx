'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit, X, ShieldCheck, AlertTriangle, Users } from 'lucide-react';
import { format, differenceInMinutes, add } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, updateDoc, Timestamp, writeBatch, collection } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScheduleInterviewDialog, type ScheduleInterviewData } from './ScheduleInterviewDialog';
import { ManagePanelistsDialog } from './ManagePanelistsDialog';
import type { JobApplication, ApplicationInterview, RescheduleRequest, Brand, UserProfile, ApplicationTimelineEvent, Job } from '@/lib/types';


export function InterviewManagement({ application, onUpdate, allUsers, allBrands, job }: { application: JobApplication; onUpdate: () => void; allUsers: UserProfile[], allBrands: Brand[], job: Job }) {
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
    const batch = writeBatch(firestore);
    const appRef = doc(firestore, 'applications', application.id!);
    const newInterviews = [...(application.interviews || [])];
    const newTimeline = [...(application.timeline || [])];
    
    try {
        const panelistIds = data.panelists.map(p => p.value);
        const panelistNames = data.panelists.map(p => p.label);
        
        const notificationBase = {
            module: 'recruitment' as const,
            targetType: 'application' as const,
            targetId: application.id!,
            isRead: false,
            createdAt: serverTimestamp() as Timestamp,
            createdBy: userProfile.uid,
        };

        if (activeInterview && !activeInterview.rescheduleRequest) { // Pure Edit
            const index = newInterviews.findIndex(iv => iv.interviewId === activeInterview.interviewId);
            if (index !== -1) {
                const originalData = newInterviews[index];

                const updatedData: ApplicationInterview = {
                    ...originalData,
                    startAt: Timestamp.fromDate(data.dateTime),
                    endAt: Timestamp.fromDate(add(data.dateTime, { minutes: data.duration })),
                    panelistIds: panelistIds,
                    panelistNames: panelistNames,
                    meetingLink: data.meetingLink || '',
                    notes: data.notes,
                };
                
                // Compare key fields to see if a notification is needed
                const hasChanged =
                    originalData.startAt.toMillis() !== updatedData.startAt.toMillis() ||
                    originalData.endAt.toMillis() !== updatedData.endAt.toMillis() ||
                    originalData.meetingLink !== updatedData.meetingLink ||
                    JSON.stringify((originalData.panelistIds || []).sort()) !== JSON.stringify(updatedData.panelistIds.sort());

                newInterviews[index] = updatedData;

                if (hasChanged) {
                    console.log('[InterviewManagement] Interview updated → sending notifications');

                    newTimeline.push({
                        type: 'interview_updated',
                        at: Timestamp.now(),
                        by: userProfile.uid,
                        meta: { note: 'Jadwal wawancara diperbarui oleh HRD.' },
                    });

                    // Build rich meta for the notification payload
                    const interviewDateStr = format(updatedData.startAt.toDate(), 'dd MMMM yyyy', { locale: idLocale });
                    const interviewTimeStr = format(updatedData.startAt.toDate(), 'HH:mm');
                    const notifMeta = {
                        jobId: application.jobId,
                        applicationId: application.id!,
                        candidateName: application.candidateName,
                        jobTitle: application.jobPosition,
                        interviewDate: interviewDateStr,
                        interviewTime: interviewTimeStr,
                        meetingLink: updatedData.meetingLink,
                    };

                    // Recipients:
                    // 1. Panelists assigned to this specific interview
                    // 2. ALL recruitment team members assigned to this job (job.assignedUserIds)
                    // 3. The candidate
                    const recruitmentTeamIds = new Set<string>([
                        ...updatedData.panelistIds,
                        ...(job.assignedUserIds || []),
                    ]);
                    const allRecipients = new Set<string>([
                        application.candidateUid,
                        ...recruitmentTeamIds,
                    ]);

                    console.log(`[InterviewManagement] Notifying ${allRecipients.size} recipients (candidate + ${recruitmentTeamIds.size} recruitment team members)`);

                    allRecipients.forEach(recipientUid => {
                        const notifRef = doc(collection(firestore, 'users', recipientUid, 'notifications'));
                        const isCandidate = recipientUid === application.candidateUid;
                        batch.set(notifRef, {
                            ...notificationBase,
                            userId: recipientUid,
                            type: 'interview_updated',
                            title: 'Jadwal Wawancara Diperbarui',
                            message: `Jadwal wawancara untuk ${application.candidateName} telah diperbarui. Silakan cek detail terbaru.`,
                            actionUrl: isCandidate
                                ? `/careers/portal/applications`
                                : `/admin/recruitment/my-tasks`,
                            meta: notifMeta,
                        });
                    });
                }
                
                const allPanelistIds = new Set<string>();
                newInterviews.forEach(iv => {
                    if (iv.status === 'scheduled') {
                        (iv.panelistIds || []).forEach(id => allPanelistIds.add(id));
                    }
                });

                batch.update(appRef, { interviews: newInterviews, timeline: newTimeline, allPanelistIds: Array.from(allPanelistIds) });
                toast({ title: 'Wawancara Diperbarui' });

            } else {
                 throw new Error("Wawancara yang akan diedit tidak ditemukan.");
            }
        } else { // Create or Counter-proposal
            if (activeInterview && activeInterview.rescheduleRequest) {
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
                meetingLink: data.meetingLink || '',
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

            // On new schedule: notify candidate + panelists + full job recruitment team
            const newInterviewDateStr = format(data.dateTime, 'dd MMMM yyyy', { locale: idLocale });
            const newInterviewTimeStr = format(data.dateTime, 'HH:mm');
            const newNotifMeta = {
                jobId: application.jobId,
                applicationId: application.id!,
                candidateName: application.candidateName,
                jobTitle: application.jobPosition,
                interviewDate: newInterviewDateStr,
                interviewTime: newInterviewTimeStr,
                meetingLink: data.meetingLink,
            };

            const newRecruitmentTeamIds = new Set<string>([
                ...panelistIds,
                ...(job.assignedUserIds || []),
            ]);
            const allRecipients = new Set<string>([
                application.candidateUid,
                ...newRecruitmentTeamIds,
            ]);

            console.log(`[InterviewManagement] Interview scheduled → notifying ${allRecipients.size} recipients`);

            allRecipients.forEach(recipientUid => {
                const notifRef = doc(collection(firestore, 'users', recipientUid, 'notifications'));
                const isCandidate = recipientUid === application.candidateUid;

                batch.set(notifRef, {
                    ...notificationBase,
                    userId: recipientUid,
                    type: 'interview_scheduled',
                    title: 'Jadwal Wawancara Baru',
                    message: isCandidate
                        ? `Anda telah dijadwalkan untuk wawancara posisi "${application.jobPosition}". Silakan cek detail terbaru.`
                        : `Jadwal wawancara baru untuk ${application.candidateName} (${application.jobPosition}) telah ditetapkan.`,
                    actionUrl: isCandidate
                        ? `/careers/portal/applications`
                        : `/admin/recruitment/my-tasks`,
                    meta: newNotifMeta,
                });
            });

            const allPanelistIds = new Set<string>(application.allPanelistIds || []);
            panelistIds.forEach(id => allPanelistIds.add(id));

            batch.update(appRef, { interviews: newInterviews, timeline: newTimeline, allPanelistIds: Array.from(allPanelistIds) });
            toast({ title: activeInterview ? 'Jadwal Baru Diajukan' : 'Wawancara Dijadwalkan' });
        }
        
        await batch.commit();
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

    const batch = writeBatch(firestore);
    const appRef = doc(firestore, 'applications', application.id!);

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'status_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { note: 'Jadwal ulang wawancara disetujui oleh HRD.' },
    };

    try {
        batch.update(appRef, {
            interviews: newInterviews,
            timeline: [...(application.timeline || []), timelineEvent]
        });

        // Notify candidate and recruitment team
        const interviewDateStr = format(approvedSlot.startAt.toDate(), 'dd MMMM yyyy', { locale: idLocale });
        const interviewTimeStr = format(approvedSlot.startAt.toDate(), 'HH:mm');
        
        const notifMeta = {
            jobId: application.jobId,
            applicationId: application.id!,
            candidateName: application.candidateName,
            jobTitle: application.jobPosition,
            interviewDate: interviewDateStr,
            interviewTime: interviewTimeStr,
            meetingLink: interviewToApprove.meetingLink,
        };

        const recruitmentTeamIds = new Set<string>([
            ...(interviewToApprove.panelistIds || []),
            ...(job.assignedUserIds || []),
        ]);
        const allRecipients = new Set<string>([
            application.candidateUid,
            ...recruitmentTeamIds,
        ]);

        allRecipients.forEach(recipientUid => {
            const notifRef = doc(collection(firestore, 'users', recipientUid, 'notifications'));
            const isCandidate = recipientUid === application.candidateUid;
            
            batch.set(notifRef, {
                module: 'recruitment',
                targetType: 'application',
                targetId: application.id!,
                userId: recipientUid,
                type: 'interview_updated',
                title: 'Permintaan Jadwal Ulang Disetujui',
                message: isCandidate 
                    ? `Permintaan jadwal ulang Anda telah disetujui untuk tanggal ${interviewDateStr}.`
                    : `Jadwal ulang untuk ${application.candidateName} telah disetujui.`,
                actionUrl: isCandidate ? '/careers/portal/applications' : '/admin/recruitment/my-tasks',
                isRead: false,
                createdAt: serverTimestamp(),
                createdBy: userProfile.uid,
                meta: notifMeta,
            });
        });

        await batch.commit();
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

    const batch = writeBatch(firestore);
    const appRef = doc(firestore, 'applications', application.id!);

    try {
        batch.update(appRef, { interviews: newInterviews });

        // Notify candidate and recruitment team
        const interviewDateStr = format(interviewToDeny.startAt.toDate(), 'dd MMMM yyyy', { locale: idLocale });
        
        const recruitmentTeamIds = new Set<string>([
            ...(interviewToDeny.panelistIds || []),
            ...(job.assignedUserIds || []),
        ]);
        const allRecipients = new Set<string>([
            application.candidateUid,
            ...recruitmentTeamIds,
        ]);

        allRecipients.forEach(recipientUid => {
            const notifRef = doc(collection(firestore, 'users', recipientUid, 'notifications'));
            const isCandidate = recipientUid === application.candidateUid;
            
            batch.set(notifRef, {
                module: 'recruitment',
                targetType: 'application',
                targetId: application.id!,
                userId: recipientUid,
                type: 'interview_updated',
                title: 'Permintaan Jadwal Ulang Ditolak',
                message: isCandidate 
                    ? `Mohon maaf, permintaan jadwal ulang Anda ditolak. Silakan ikuti jadwal semula.`
                    : `Permintaan jadwal ulang untuk ${application.candidateName} ditolak.`,
                actionUrl: isCandidate ? '/careers/portal/applications' : '/admin/recruitment/my-tasks',
                isRead: false,
                createdAt: serverTimestamp(),
                createdBy: userProfile.uid,
                meta: {
                    jobId: application.jobId,
                    applicationId: application.id!,
                    candidateName: application.candidateName,
                }
            });
        });

        await batch.commit();
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
  
  const isPrivilegedRecruiter = userProfile?.role === 'hrd' || userProfile?.role === 'super-admin';
  const title = isPrivilegedRecruiter ? 'Manajemen Wawancara' : 'Detail Jadwal Wawancara';
  const description = isPrivilegedRecruiter ? 'Atur, ubah, dan publikasikan jadwal wawancara untuk kandidat ini.' : 'Berikut adalah detail jadwal wawancara yang telah ditetapkan oleh tim HRD.';

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {isPrivilegedRecruiter && (!application.interviews || application.interviews.filter(iv => iv.status !== 'canceled').length === 0) && (
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
                                {isPrivilegedRecruiter && (
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
                                {isPrivilegedRecruiter && (
                                    <Button variant="ghost" size="sm" onClick={() => handleOpenScheduleDialog(iv)}>
                                        <Edit className="h-4 w-4 mr-2" /> Edit
                                    </Button>
                                )}
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
                                                        {isPrivilegedRecruiter && <Button size="sm" onClick={() => handleApproveReschedule(iv, slot)} disabled={isSubmitting}>Setujui</Button>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </AlertDescription>
                                {isPrivilegedRecruiter && (
                                  <div className="flex gap-2 mt-4 pt-4 border-t">
                                      <Button size="sm" onClick={() => handleOpenScheduleDialog(iv)} disabled={isSubmitting}>Buat Jadwal Baru (Counter)</Button>
                                      <Button size="sm" variant="ghost" onClick={() => handleDenyReschedule(iv)} disabled={isSubmitting}>Tolak Permintaan</Button>
                                  </div>
                                )}
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
            onSuccess={onUpdate}
        />
      )}
    </Card>
  );
}
