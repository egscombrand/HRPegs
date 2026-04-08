'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking, useCollection } from '@/firebase';
import { doc, serverTimestamp, updateDoc, Timestamp, writeBatch, collection, where, query, limit } from 'firebase/firestore';
import type { JobApplication, Profile, Job, ApplicationTimelineEvent, ApplicationInterview, RescheduleRequest, Brand, UserProfile, AssessmentSession } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, Briefcase, Calendar, CheckCircle, XCircle, Building, GraduationCap, DollarSign, Clock, Target, Lightbulb, User, FileText, Bot, BrainCircuit } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ProfileView } from '@/components/recruitment/ProfileView';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ApplicationProgressStepper } from '@/components/recruitment/ApplicationProgressStepper';
import { CandidateDocumentsCard } from '@/components/recruitment/CandidateDocumentsCard';
import { CandidateFitAnalysis } from '@/components/recruitment/CandidateFitAnalysis';
import { ApplicationActionBar } from '@/components/recruitment/ApplicationActionBar';
import { ApplicationNotes } from '@/components/recruitment/ApplicationNotes';
import { OfferDialog, type OfferFormData } from '@/components/recruitment/OfferDialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InterviewManagement } from '@/components/recruitment/InterviewManagement';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

const InfoCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: React.ReactNode }) => (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>
        <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold">{value || '-'}</p>
        </div>
    </div>
);


const SummaryTab = ({ profile }: { profile: Profile }) => (
  <div className="grid md:grid-cols-2 gap-6">
    <Card className="md:col-span-2">
      <CardHeader><CardTitle className="text-base">Deskripsi Diri</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{profile.selfDescription || 'Belum diisi.'}</p></CardContent>
    </Card>
     <Card>
      <CardHeader><CardTitle className="text-base">Motivasi Melamar</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{profile.motivation || 'Belum diisi.'}</p></CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Alasan Ekspektasi Gaji</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{profile.salaryExpectationReason || 'Belum diisi.'}</p></CardContent>
    </Card>
     <Card>
      <CardHeader><CardTitle className="text-base">Gaya Kerja</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{profile.workStyle || 'Belum diisi.'}</p></CardContent>
    </Card>
     <Card>
      <CardHeader><CardTitle className="text-base">Area Pengembangan Diri</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{profile.improvementArea || 'Belum diisi.'}</p></CardContent>
    </Card>
  </div>
);


export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;
  const [hasTriggeredAutoScreen, setHasTriggeredAutoScreen] = useState(false);
  const [isOfferDialogOpen, setIsOfferDialogOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

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

  const assessmentSessionsQuery = useMemoFirebase(() => {
    if (!application) return null;
    return query(
      collection(firestore, 'assessment_sessions'),
      where('applicationId', '==', application.id!),
      limit(1)
    );
  }, [firestore, application]);
  const { data: assessmentSessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(assessmentSessionsQuery);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') {
      return MENU_CONFIG['hrd'];
    }
    return [];
  }, [userProfile]);

  const handleStageChange = async (newStage: JobApplication['status'], reason: string) => {
    if (!application || !userProfile) return false;
    
    if (newStage === 'offered') {
        setIsOfferDialogOpen(true);
        return false;
    }

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'stage_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { from: application.status, to: newStage, note: reason }
    };
    
    const updatePayload: any = {
        status: newStage,
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent]
    };
    
    if (newStage === 'tes_kepribadian' && !application.personalityTestAssignedAt) {
      updatePayload.personalityTestAssignedAt = serverTimestamp();
    }
    if (['hired', 'rejected'].includes(newStage)) {
      updatePayload.decisionAt = serverTimestamp();
    }

    try {
        await updateDoc(applicationRef!, updatePayload);
        mutateApplication();
        toast({ title: 'Status Diperbarui', description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".` });
        return true;
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Memperbarui', description: error.message });
        return false;
    }
  };

  const handleSendOffer = async (offerData: OfferFormData) => {
    if (!application || !userProfile) return;

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'offer_sent',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { note: 'Penawaran kerja resmi telah dikirimkan kepada kandidat.' }
    };
    
    const [hours, minutes] = offerData.startTime.split(':').map(Number);
    const combinedDate = new Date(offerData.contractStartDate);
    combinedDate.setHours(hours, minutes);

    const updatePayload = {
        status: 'offered' as const,
        offerStatus: 'sent' as const,
        offeredSalary: offerData.offeredSalary,
        probationDurationMonths: offerData.probationDurationMonths,
        contractStartDate: Timestamp.fromDate(combinedDate),
        contractDurationMonths: offerData.contractDurationMonths,
        contractEndDate: offerData.contractEndDate ? Timestamp.fromDate(offerData.contractEndDate) : null,
        offerNotes: offerData.offerNotes,
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
    };

    try {
        await updateDoc(applicationRef!, updatePayload);
        mutateApplication();
        toast({ title: 'Penawaran Terkirim', description: 'Kandidat sekarang dapat melihat dan merespons penawaran Anda.' });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal Mengirim Penawaran', description: e.message });
    }
  };
  
  const handleActivateEmployee = async () => {
    if (!application || !userProfile || application.offerStatus !== 'accepted') return;

    setIsActivating(true);
    const batch = writeBatch(firestore);

    const userRef = doc(firestore, 'users', application.candidateUid);
    const appRef = doc(firestore, 'applications', application.id!);
    
    const userUpdatePayload: Partial<UserProfile> = {
        role: 'karyawan',
        brandId: application.brandId,
    };
    if (application.jobType === 'internship') {
        userUpdatePayload.employmentType = 'magang';
        userUpdatePayload.employmentStage = 'intern_pre_probation';
    } else { // fulltime or contract
        userUpdatePayload.employmentType = 'karyawan';
        userUpdatePayload.employmentStage = 'probation';
    }
    batch.set(userRef, userUpdatePayload, { merge: true });
    
    const timelineEvent: ApplicationTimelineEvent = {
        type: 'status_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { from: 'offered', to: 'hired', note: 'Akun kandidat telah diaktifkan sebagai karyawan internal.' }
    };
    batch.update(appRef, {
        status: 'hired',
        internalAccessEnabled: true,
        timeline: [...(application.timeline || []), timelineEvent]
    });

    try {
        await batch.commit();
        mutateApplication();
        toast({ title: 'Akun Diaktifkan!', description: `${application.candidateName} sekarang memiliki akses sebagai karyawan.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal Aktivasi', description: e.message });
    } finally {
        setIsActivating(false);
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

  const assessmentInfo = useMemo(() => {
    if (isLoadingSessions) {
      return { status: 'loading', text: 'Memuat...', result: null, color: 'text-muted-foreground' };
    }
    if (!assessmentSessions || assessmentSessions.length === 0) {
      return { status: 'unstarted', text: 'Belum Dikerjakan', result: null, color: 'text-destructive' };
    }
    const session = assessmentSessions[0];
    if (session.status === 'submitted') {
      const resultText = session.result?.discType || session.result?.mbtiArchetype?.code;
      return { status: 'completed', text: 'Selesai', result: resultText, color: 'text-green-600' };
    }
    if (session.status === 'draft') {
      return { status: 'in_progress', text: 'Sedang Dikerjakan', result: null, color: 'text-amber-600' };
    }
    return { status: 'unstarted', text: 'Belum Dikerjakan', result: null, color: 'text-destructive' };
  }, [assessmentSessions, isLoadingSessions]);


  const isLoading = isLoadingApp || isLoadingProfile || isLoadingJob || isLoadingUsers || isLoadingBrands || isLoadingSessions;

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <Avatar className="h-20 w-20 border-4 border-background ring-2 ring-primary">
                                    <AvatarImage src={profile.photoUrl || `https://picsum.photos/seed/${application.candidateUid}/100/100`} alt={profile.fullName} data-ai-hint="profile avatar" />
                                    <AvatarFallback className="text-3xl">{getInitials(profile.fullName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle className="text-3xl">{profile.fullName}</CardTitle>
                                    <CardDescription className="text-base flex items-center gap-2 mt-1">
                                        Melamar untuk: <span className="font-semibold text-foreground">{application.jobPosition}</span>
                                    </CardDescription>
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
                </Card>

                {/* Quick Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <InfoCard icon={<DollarSign/>} label="Ekspektasi Gaji" value={profile.salaryExpectation} />
                    <InfoCard icon={<GraduationCap/>} label="Pendidikan Terakhir" value={`${profile.education?.[0]?.level} ${profile.education?.[0]?.fieldOfStudy}`} />
                    <InfoCard icon={<Calendar/>} label="Ketersediaan" value={profile.availability} />
                    <InfoCard icon={<Clock/>} label="Kerja Deadline" value={profile.usedToDeadline ? 'Ya' : 'Tidak'} />
                    <InfoCard
                        icon={<BrainCircuit />}
                        label="Tes Kepribadian"
                        value={
                          isLoadingSessions ? (
                            <span className="text-sm text-muted-foreground">Memuat...</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={cn('font-semibold', assessmentInfo.color)}>{assessmentInfo.text}</span>
                              {assessmentInfo.result && <Badge variant="secondary">{assessmentInfo.result}</Badge>}
                            </div>
                          )
                        }
                    />
                </div>
                
                <ApplicationProgressStepper currentStatus={application.status} />

                <Tabs defaultValue="summary" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="summary">Ringkasan</TabsTrigger>
                        <TabsTrigger value="profile">Profil Lengkap</TabsTrigger>
                        <TabsTrigger value="documents">Dokumen</TabsTrigger>
                        <TabsTrigger value="ai_analysis">Analisis AI</TabsTrigger>
                    </TabsList>
                    <TabsContent value="summary" className="mt-4">
                        <SummaryTab profile={profile} />
                    </TabsContent>
                    <TabsContent value="profile" className="mt-4">
                        <ProfileView profile={profile} />
                    </TabsContent>
                    <TabsContent value="documents" className="mt-4">
                        <CandidateDocumentsCard profile={profile} application={application} onVerificationChange={mutateApplication}/>
                    </TabsContent>
                    <TabsContent value="ai_analysis" className="mt-4">
                       <CandidateFitAnalysis profile={profile} job={job} application={application} />
                    </TabsContent>
                </Tabs>
            </div>
            
            {/* Right Sidebar */}
            <div className="lg:sticky lg:top-24 space-y-6">
                <ApplicationActionBar 
                    application={application} 
                    onStageChange={handleStageChange}
                    onSendOfferClick={() => setIsOfferDialogOpen(true)}
                />
                <InterviewManagement job={job} application={application} onUpdate={mutateApplication} allUsers={internalUsers || []} allBrands={brands || []} />
                <ApplicationNotes application={application} onNoteAdded={mutateApplication} />
            </div>
          </div>

          <OfferDialog 
            open={isOfferDialogOpen}
            onOpenChange={setIsOfferDialogOpen}
            onConfirm={handleSendOffer}
            candidateName={application.candidateName}
            job={job}
          />
        </>
      )}
    </DashboardLayout>
  );
}

    