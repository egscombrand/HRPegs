'use client';

import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/providers/auth-provider';
import type { JobApplication, JobApplicationStatus, Job, ApplicationInterview, UserProfile, Brand } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, CalendarPlus, List, LayoutGrid, RefreshCw, Pencil, Edit, X, Users } from 'lucide-react';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { format, differenceInMinutes, add } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { BulkScheduleWizard } from './BulkScheduleWizard';
import { CandidatesKanban } from './CandidatesKanban';
import { useToast } from '@/hooks/use-toast';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../ui/card';
import { setDocumentNonBlocking, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, Timestamp, query, collection, where, writeBatch } from 'firebase/firestore';
import type { ScheduleInterviewData } from './ScheduleInterviewDialog';
import { ScheduleInterviewDialog } from './ScheduleInterviewDialog';
import { EditInterviewTemplateDialog } from './EditInterviewTemplateDialog';
import { AssignedUsersCard } from './AssignedUsersCard';

type SelectionState = {
  selectedIds: Set<string>;
};

export function ApplicantsPageClient({ applications, job, onJobUpdate, allBrands }: { applications: JobApplication[], job: Job | null, onJobUpdate: () => void, allBrands: Brand[] }) {
  const { userProfile } = useAuth();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<SelectionState>({ selectedIds: new Set() });
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isSingleScheduleOpen, setIsSingleScheduleOpen] = useState(false);
  const [activeApplication, setActiveApplication] = useState<JobApplication | null>(null);
  
  const firestore = useFirestore();
  const { toast } = useToast();

  const isPrivilegedRecruiter = userProfile?.role === 'super-admin' || userProfile?.role === 'hrd';

  const { data: usersToFilter, isLoading: isLoadingUsers } = useCollection<UserProfile>(
      useMemoFirebase(() => {
        if (!userProfile || !isPrivilegedRecruiter) return null;
        return query(
          collection(firestore, 'users'),
          where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
          where('isActive', '==', true)
        );
    }, [firestore, userProfile, isPrivilegedRecruiter])
  );

  const assignableUsers = useMemo(() => {
    if (!usersToFilter) return [];
    // Filter out interns and trainees from the 'karyawan' role
    return usersToFilter.filter(u => u.role === 'manager' || (u.role === 'karyawan' && u.employmentType === 'karyawan'));
  }, [usersToFilter]);

  const detectedTemplate = useMemo(() => {
    if (!job || (job.interviewTemplate && job.interviewTemplate.slotDurationMinutes)) return null;

    const firstInterviewWithData = applications
      .flatMap(app => app.interviews || [])
      .find(iv => iv.startAt && iv.endAt);

    if (!firstInterviewWithData) return null;

    const duration = differenceInMinutes(firstInterviewWithData.endAt.toDate(), firstInterviewWithData.startAt.toDate());

    return {
      meetingLink: firstInterviewWithData.meetingLink || '',
      defaultStartDate: firstInterviewWithData.startAt,
      workdayStartTime: format(firstInterviewWithData.startAt.toDate(), 'HH:mm'),
      slotDurationMinutes: duration > 0 ? duration : 30,
    };
  }, [job, applications]);

  const handleUseAsDefault = async () => {
    if (!job || !detectedTemplate) return;
    try {
        const jobRef = doc(firestore, 'jobs', job.id!);
        await setDocumentNonBlocking(jobRef, {
            interviewTemplate: {
                ...job.interviewTemplate,
                ...detectedTemplate,
            },
            'updatedAt': serverTimestamp(),
        }, { merge: true });

        // Notify recruitment team about template change
        if (job.assignedUserIds && job.assignedUserIds.length > 0) {
            const batch = writeBatch(firestore);
            job.assignedUserIds.forEach(uid => {
                const notifRef = doc(collection(firestore, 'users', uid, 'notifications'));
                batch.set(notifRef, {
                    module: 'recruitment',
                    targetType: 'job',
                    targetId: job.id,
                    userId: uid,
                    type: 'interview_updated',
                    title: 'Template Wawancara Diperbarui',
                    message: `Template jadwal wawancara untuk "${job.position}" telah diperbarui.`,
                    actionUrl: '/admin/recruitment/my-tasks',
                    isRead: false,
                    createdAt: serverTimestamp(),
                    createdBy: userProfile?.uid,
                });
            });
            await batch.commit();
        }

        toast({ title: "Template Updated", description: "The detected settings have been set as the default." });
        onJobUpdate();
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Save Failed", description: e.message });
    }
  };


  const filteredApplications = useMemo(() => {
    if (stageFilter === 'all') return applications;
    return applications.filter(app => app.status === stageFilter);
  }, [applications, stageFilter]);
  
  useEffect(() => {
    setSelection({ selectedIds: new Set() });
  }, [stageFilter, selectionMode]);
  
  const isAllFilteredSelected = useMemo(() => {
    if (filteredApplications.length === 0) return false;
    return filteredApplications.every(app => selection.selectedIds.has(app.id!));
  }, [filteredApplications, selection.selectedIds]);

  const handleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelection({ selectedIds: new Set(filteredApplications.map(app => app.id!)) });
    } else {
      setSelection({ selectedIds: new Set() });
    }
  };

  const handleSelectRow = (appId: string, checked: boolean) => {
    setSelection(prev => {
      const newSelectedIds = new Set(prev.selectedIds);
      if (checked) newSelectedIds.add(appId);
      else newSelectedIds.delete(appId);
      return { selectedIds: newSelectedIds };
    });
  };

  const selectedApplications = useMemo(() => {
    return applications.filter(app => selection.selectedIds.has(app.id!));
  }, [applications, selection.selectedIds]);

  const sortedApplications = useMemo(() => {
    if (!filteredApplications) return [];
    return [...filteredApplications].sort((a, b) => (b.submittedAt?.toMillis() || b.createdAt.toMillis()) - (a.submittedAt?.toMillis() || a.createdAt.toMillis()));
  }, [filteredApplications]);
  
  const getMostRelevantInterview = (app: JobApplication) => {
    if (!app.interviews || app.interviews.length === 0) return null;
    const now = new Date().getTime();
    const relevantInterviews = app.interviews.filter(i => ['scheduled', 'reschedule_requested'].includes(i.status));
    if (relevantInterviews.length === 0) return null;
    const upcoming = relevantInterviews.filter(i => i.startAt.toMillis() >= now).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    if (upcoming.length > 0) return upcoming[0];
    const past = relevantInterviews.filter(i => i.startAt.toMillis() < now).sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
    return past.length > 0 ? past[0] : null;
  };
  
  const handleSaveTemplate = async (templateData: Partial<Job['interviewTemplate']>) => {
    if (!job) return;
    try {
      const jobRef = doc(firestore, 'jobs', job.id!);
      await setDocumentNonBlocking(jobRef, {
        interviewTemplate: {
            ...job.interviewTemplate,
            ...templateData,
        },
        'updatedAt': serverTimestamp(),
      }, { merge: true });

      // Notify recruitment team about template change
      if (job.assignedUserIds && job.assignedUserIds.length > 0) {
          const batch = writeBatch(firestore);
          job.assignedUserIds.forEach(uid => {
              const notifRef = doc(collection(firestore, 'users', uid, 'notifications'));
              batch.set(notifRef, {
                  module: 'recruitment',
                  targetType: 'job',
                  targetId: job.id,
                  userId: uid,
                  type: 'interview_updated',
                  title: 'Template Wawancara Diperbarui',
                  message: `Template jadwal wawancara untuk "${job.position}" telah diperbarui.`,
                  actionUrl: '/admin/recruitment/my-tasks',
                  isRead: false,
                  createdAt: serverTimestamp(),
                  createdBy: userProfile?.uid,
              });
          });
          await batch.commit();
      }

      toast({ title: "Template Saved", description: "The default interview template has been updated." });
      onJobUpdate();
      setIsTemplateDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Save Failed", description: e.message });
    }
  }

  const handleEditSingleInterview = (app: JobApplication) => {
    setActiveApplication(app);
    setIsSingleScheduleOpen(true);
  }

  const handleSaveSingleInterview = async (values: ScheduleInterviewData) => {
    if (!activeApplication || !userProfile) return false;

    const interviewToEdit = getMostRelevantInterview(activeApplication);
    const newInterviews = [...(activeApplication.interviews || [])];
    const panelistIds = values.panelists?.map(p => p.value) || [userProfile.uid];
    const panelistNames = values.panelists?.map(p => p.label) || [userProfile.fullName];
    
    if(interviewToEdit) {
        const index = newInterviews.findIndex(iv => iv.interviewId === interviewToEdit.interviewId);
        if (index !== -1) {
            newInterviews[index] = {
                ...newInterviews[index],
                startAt: Timestamp.fromDate(values.dateTime),
                endAt: Timestamp.fromDate(add(values.dateTime, { minutes: values.duration })),
                panelistIds,
                panelistNames,
                meetingLink: values.meetingLink || newInterviews[index].meetingLink || '',
            };
        }
    } else {
         newInterviews.push({
            interviewId: crypto.randomUUID(),
            startAt: Timestamp.fromDate(values.dateTime),
            endAt: Timestamp.fromDate(add(values.dateTime, { minutes: values.duration })),
            panelistIds,
            panelistNames,
            meetingLink: values.meetingLink || job?.interviewTemplate?.meetingLink || '',
            status: 'scheduled',
            meetingPublished: false,
        });
    }

    // Rebuild allPanelistIds from all non-canceled interviews
    const allPanelistIds = Array.from(
      new Set(newInterviews.filter(iv => iv.status !== 'canceled').flatMap(iv => iv.panelistIds || []))
    );

    try {
        const batch = writeBatch(firestore);
        const appRef = doc(firestore, 'applications', activeApplication.id!);

        batch.set(appRef, {
            interviews: newInterviews,
            allPanelistIds,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        // Notification logic
        const startAtDate = values.dateTime;
        const interviewDateStr = format(startAtDate, 'dd MMMM yyyy', { locale: idLocale });
        const interviewTimeStr = format(startAtDate, 'HH:mm');
        const meetingLink = values.meetingLink || (interviewToEdit?.meetingLink) || job?.interviewTemplate?.meetingLink || '';

        const notifMeta = {
            jobId: activeApplication.jobId,
            applicationId: activeApplication.id!,
            candidateName: activeApplication.candidateName,
            jobTitle: activeApplication.jobPosition,
            interviewDate: interviewDateStr,
            interviewTime: interviewTimeStr,
            meetingLink: meetingLink,
        };

        const recruitmentTeamIds = new Set<string>([
            ...panelistIds,
            ...(job?.assignedUserIds || []),
        ]);
        const allRecipients = new Set<string>([
            activeApplication.candidateUid,
            ...recruitmentTeamIds,
        ]);

        console.log(`[ApplicantsPageClient] Notifying ${allRecipients.size} recipients for interview update/creation`);

        allRecipients.forEach(recipientUid => {
            const notifRef = doc(collection(firestore, 'users', recipientUid, 'notifications'));
            const isCandidate = recipientUid === activeApplication.candidateUid;
            
            batch.set(notifRef, {
                module: 'recruitment',
                targetType: 'application',
                targetId: activeApplication.id!,
                userId: recipientUid,
                type: interviewToEdit ? 'interview_updated' : 'interview_scheduled',
                title: interviewToEdit ? 'Jadwal Wawancara Diperbarui' : 'Jadwal Wawancara Baru',
                message: `Jadwal wawancara untuk ${activeApplication.candidateName} telah ${interviewToEdit ? 'diperbarui' : 'ditetapkan'}. Silakan cek detail terbaru.`,
                actionUrl: isCandidate ? '/careers/portal/applications' : '/admin/recruitment/my-tasks',
                isRead: false,
                createdAt: serverTimestamp(),
                createdBy: userProfile.uid,
                meta: notifMeta,
            });
        });

        await batch.commit();

        toast({ title: "Jadwal Diperbarui", description: `Jadwal untuk ${activeApplication.candidateName} telah disimpan.`});
        onJobUpdate();
        return true;
    } catch (e: any) {
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: e.message });
        return false;
    }
  }

  return (
    <div className="space-y-4">
      {job && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <AssignedUsersCard 
                job={job}
                allUsers={assignableUsers}
                allBrands={allBrands || []}
                onUpdate={onJobUpdate}
                className="lg:col-span-1"
            />
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Interview Template</CardTitle>
                    <CardDescription>Atur templat default untuk semua wawancara pada lowongan ini. Ini akan digunakan saat menjadwalkan wawancara baru.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="sm:col-span-2">
                        <p className="font-medium text-muted-foreground">Default Link:</p>
                        {job.interviewTemplate?.meetingLink ? (
                        <p className="font-mono break-all">{job.interviewTemplate.meetingLink}</p>
                        ) : detectedTemplate?.meetingLink ? (
                        <div className='flex items-center gap-2 mt-1'>
                            <p className="font-mono break-all text-muted-foreground italic">{detectedTemplate.meetingLink}</p>
                            <Badge variant="outline">Detected</Badge>
                        </div>
                        ) : (
                        <p className="font-mono break-all">Not set</p>
                        )}
                    </div>
                    <div>
                        <p className="font-medium text-muted-foreground">Default Start Date:</p>
                        {job.interviewTemplate?.defaultStartDate ? (
                            <p>{format(job.interviewTemplate.defaultStartDate.toDate(), 'dd MMM yyyy')}</p>
                        ) : detectedTemplate?.defaultStartDate ? (
                            <p className="italic text-muted-foreground">{format(detectedTemplate.defaultStartDate.toDate(), 'dd MMM yyyy')}</p>
                        ) : (
                            <p>Not set</p>
                        )}
                    </div>
                    <div>
                        <p className="font-medium text-muted-foreground">Workday Start Time:</p>
                        {job.interviewTemplate?.workdayStartTime ? (
                            <p>{job.interviewTemplate.workdayStartTime}</p>
                        ) : detectedTemplate?.workdayStartTime ? (
                            <p className="italic text-muted-foreground">{detectedTemplate.workdayStartTime}</p>
                        ) : (
                            <p>Not set</p>
                        )}
                    </div>
                    <div>
                        <p className="font-medium text-muted-foreground">Slot Duration:</p>
                        {job.interviewTemplate?.slotDurationMinutes ? (
                            <p>{job.interviewTemplate.slotDurationMinutes} minutes</p>
                        ) : detectedTemplate?.slotDurationMinutes ? (
                            <p className="italic text-muted-foreground">{detectedTemplate.slotDurationMinutes} minutes</p>
                        ) : (
                            <p>Not set</p>
                        )}
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)}>
                        {isPrivilegedRecruiter ? <Edit className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {isPrivilegedRecruiter ? 'Edit Template' : 'Lihat Detail'}
                    </Button>
                    {isPrivilegedRecruiter && detectedTemplate && !job.interviewTemplate?.meetingLink && (
                        <Button onClick={handleUseAsDefault}>
                            Gunakan sebagai Default
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
            <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by stage..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {ORDERED_RECRUITMENT_STAGES.map((stage) => (<SelectItem key={stage} value={stage}>{statusDisplayLabels[stage]}</SelectItem>))}
                </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{filteredApplications.length} candidates</p>
        </div>
        <div className="flex items-center gap-2">
            {!selectionMode ? (
                <>
                <Button size="sm" onClick={() => { setSelection({selectedIds: new Set(filteredApplications.map(app => app.id!))}); setIsWizardOpen(true); }}>Jadwalkan Semua ({filteredApplications.length})</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)}>Pilih Kandidat</Button>
                </>
            ) : (
                <Button size="sm" variant="ghost" onClick={() => setSelectionMode(false)}>Batalkan Mode Pilih</Button>
            )}
            <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('table')}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('kanban')} disabled={true} title="Kanban view is coming soon"><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>

        {selectionMode && (
            <div className="sticky top-16 z-10 p-2 bg-secondary border rounded-lg shadow flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Checkbox id="select-all" checked={isAllFilteredSelected} onCheckedChange={handleSelectAllFiltered} />
                    <label htmlFor="select-all" className="text-sm font-medium">{isAllFilteredSelected ? "Batal Pilih Semua" : "Pilih Semua Hasil Filter"}</label>
                    <span className="text-sm font-bold">{selection.selectedIds.size} kandidat terpilih</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setIsWizardOpen(true)} disabled={selection.selectedIds.size === 0}><CalendarPlus className="mr-2 h-4 w-4" />Jadwalkan Wawancara</Button>
                </div>
            </div>
        )}

        {viewMode === 'table' ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectionMode && <TableHead className="w-[50px]"><Checkbox checked={isAllFilteredSelected} onCheckedChange={handleSelectAllFiltered} aria-label="Select all" /></TableHead>}
                  <TableHead>Candidate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Interview Schedule</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.length > 0 ? (
                  sortedApplications.map(app => {
                    const scheduledInterview = getMostRelevantInterview(app);
                    return (
                      <TableRow key={app.id} data-state={selection.selectedIds.has(app.id!) && "selected"}>
                        {selectionMode && <TableCell><Checkbox checked={selection.selectedIds.has(app.id!)} onCheckedChange={(checked) => handleSelectRow(app.id!, !!checked)} aria-label={`Select ${app.candidateName}`} /></TableCell>}
                        <TableCell className="font-medium">{app.candidateName}</TableCell>
                        <TableCell><ApplicationStatusBadge status={app.status} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {scheduledInterview ? (
                                <>
                                  {scheduledInterview.status === 'reschedule_requested' ? (
                                      <Badge variant="outline" className="text-amber-600 border-amber-500"><RefreshCw className="mr-2 h-3 w-3" /> Reschedule</Badge>
                                  ) : (
                                      <Badge variant="outline">{format(scheduledInterview.startAt.toDate(), 'dd MMM, HH:mm')}</Badge>
                                  )}
                                </>
                            ) : '-'}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditSingleInterview(app)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                          </div>
                        </TableCell>
                        <TableCell>{app.submittedAt ? format(app.submittedAt.toDate(), 'dd MMM yyyy') : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="icon">
                            <Link href={`/admin/recruitment/applications/${app.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View Application</span>
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )})
                ) : (
                  <TableRow><TableCell colSpan={selectionMode ? 6 : 5} className="h-24 text-center">No applicants match the current filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
            <CandidatesKanban applications={filteredApplications} />
        )}

      {userProfile && job && (
        <BulkScheduleWizard 
            isOpen={isWizardOpen} 
            onOpenChange={setIsWizardOpen} 
            candidates={selectedApplications} 
            recruiter={userProfile} 
            job={job}
            onSuccess={() => { setSelection({ selectedIds: new Set() }); onJobUpdate(); }}
        />
      )}
       {job && (
        <EditInterviewTemplateDialog 
            open={isTemplateDialogOpen} 
            onOpenChange={setIsTemplateDialogOpen} 
            job={job}
            initialTemplateData={detectedTemplate || undefined}
            onSave={handleSaveTemplate}
            readOnly={!isPrivilegedRecruiter}
        />
      )}
      {activeApplication && userProfile && job && (
        <ScheduleInterviewDialog
            open={isSingleScheduleOpen}
            onOpenChange={setIsSingleScheduleOpen}
            onConfirm={handleSaveSingleInterview}
            initialData={getMostRelevantInterview(activeApplication) ? {
                dateTime: getMostRelevantInterview(activeApplication)!.startAt.toDate(),
                duration: differenceInMinutes(getMostRelevantInterview(activeApplication)!.endAt.toDate(), getMostRelevantInterview(activeApplication)!.startAt.toDate()),
                meetingLink: getMostRelevantInterview(activeApplication)!.meetingLink,
            } : undefined}
            candidateName={activeApplication.candidateName}
            recruiter={userProfile}
            job={job}
            allUsers={assignableUsers}
            allBrands={allBrands}
        />
      )}
    </div>
  );
}
