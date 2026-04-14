'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking, useCollection } from '@/firebase';
import { doc, serverTimestamp, updateDoc, writeBatch, Timestamp, collection, where, query, orderBy, limit, getDocs } from 'firebase/firestore';
import type { JobApplication, Profile, Job, ApplicationTimelineEvent, ApplicationInterview, RescheduleRequest, Brand, UserProfile, AssessmentSession } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, XCircle, Calendar, Users, RefreshCw, X, MessageSquare, AlertTriangle, Edit, ShieldCheck, Lock, GraduationCap, BrainCircuit, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ProfileView } from '@/components/recruitment/ProfileView';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
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
import { ROLES_INTERNAL, ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { InterviewManagement } from '@/components/recruitment/InterviewManagement';
import { InternalEvaluationSection } from '@/components/recruitment/InternalEvaluationSection';
import { PostInterviewEvaluationSection } from '@/components/recruitment/PostInterviewEvaluationSection';
import { UnifiedInternalDecision } from '@/components/recruitment/UnifiedInternalDecision';
import { CandidateStepNav, CandidateStepContent } from '@/components/recruitment/CandidateStepView';
import { FinalInternalDecisionSection } from '@/components/recruitment/FinalInternalDecisionSection';


function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

const InfoCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: React.ReactNode }) => (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>
        <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold">{value || '-'}</div>
        </div>
    </div>
);


export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard([...ROLES_INTERNAL]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;
  const [hasTriggeredAutoScreen, setHasTriggeredAutoScreen] = useState(false);
  const [isOfferDialogOpen, setIsOfferDialogOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [activeProfileStep, setActiveProfileStep] = useState(1);
  const [evaluationFilter, setEvaluationFilter] = useState<'all' | 'pra' | 'pasca'>('all');

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

  const isPrivilegedRecruiter = userProfile?.role === 'super-admin' || userProfile?.role === 'hrd';

  const internalUsersQuery = useMemoFirebase(() => {
    // Only privileged users can fetch the full list for assignment purposes.
    if (!userProfile || !isPrivilegedRecruiter) {
      return null;
    }
    return query(
      collection(firestore, 'users'),
      where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
      where('isActive', '==', true)
    );
  }, [firestore, userProfile, isPrivilegedRecruiter]);

  const { data: internalUsers, isLoading: isLoadingUsers } = useCollection<UserProfile>(internalUsersQuery);

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(useMemoFirebase(() => collection(firestore, 'brands'), [firestore]));

  const assessmentSessionsQuery = useMemoFirebase(() => {
    if (!application) return null;
    return query(
        collection(firestore, 'assessment_sessions'),
        where('candidateUid', '==', application.candidateUid)
    );
  }, [firestore, application]);
  const { data: assessmentSessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(assessmentSessionsQuery);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const isAssigned = useMemo(() => {
    if (!userProfile || !application || !job) return false;
    if (isPrivilegedRecruiter) return true;
    
    // Check if user is in allPanelistIds
    if (application.allPanelistIds?.includes(userProfile.uid)) return true;
    
    // Check if user is assigned to the job
    if (job.assignedUserIds?.includes(userProfile.uid)) return true;

    // Last resort check: look into active interviews
    const isPanelist = application.interviews?.some(iv => 
        iv.status !== 'canceled' && iv.panelistIds?.includes(userProfile.uid)
    );
    if (isPanelist) return true;

    // Check if user is assigned as an internal reviewer
    if (application.internalReviewConfig?.assignedReviewerUids?.includes(userProfile.uid)) return true;

    return false;
  }, [userProfile, application, job, isPrivilegedRecruiter]);

  const handleStageChange = async (newStage: JobApplication['status'], reason: string) => {
    if (!application || !userProfile) return false;

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
    
    // Logic to update candidateStatus based on internalStatus change
    switch (newStage as string) {
        case 'interview':
            updatePayload.candidateStatus = 'interview_scheduled';
            break;
        case 'offer':
            updatePayload.candidateStatus = 'offer_received';
            break;
        case 'hired':
            updatePayload.candidateStatus = 'process_complete';
            break;
        // For other internal statuses, keep candidateStatus as 'under_review'
        case 'on_hold':
        case 'rejected':
        case 'screening':
             updatePayload.candidateStatus = 'under_review';
             break;
        default:
            // Do not change candidate status for other internal changes
    }
    
    if (newStage === 'rejected') {
      updatePayload.decisionAt = serverTimestamp();
    }

    try {
        await updateDoc(appRef!, updatePayload as any);
        mutateApplication();
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

      await updateDocumentNonBlocking(appRef!, { 
        status: 'screening',
        candidateStatus: 'under_review',
        timeline: [...(application.timeline || []), timelineEvent] 
      });
      mutateApplication(); 
      toast({
        title: 'Lamaran Discreening',
        description: `Status lamaran ini secara otomatis diperbarui menjadi "Screening".`,
      });
    };
    autoScreening().catch(console.error);
  }, [application, isLoadingApp, userProfile, hasTriggeredAutoScreen, applicationRef, mutateApplication, toast]);

  const assessmentInfo = useMemo(() => {
    if (isLoadingSessions) {
      return { status: 'loading', text: 'Memuat...', result: null, color: 'text-muted-foreground' };
    }
    if (!assessmentSessions || assessmentSessions.length === 0) {
      return { status: 'unstarted', text: 'Belum Dikerjakan', result: null, color: 'text-destructive' };
    }
    
    // Sort sessions on the client to find the most recent one
    const sortedSessions = [...assessmentSessions].sort((a,b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
    const session = sortedSessions[0];

    if (session.status === 'submitted') {
      const resultText = session.result?.discType || session.result?.mbtiArchetype?.code;
      return { status: 'completed', text: 'Selesai', result: resultText, color: 'text-green-600' };
    }
    if (session.status === 'draft') {
      return { status: 'in_progress', text: 'Sedang Dikerjakan', result: null, color: 'text-amber-600' };
    }
    return { status: 'unstarted', text: 'Belum Dikerjakan', result: null, color: 'text-destructive' };
  }, [assessmentSessions, isLoadingSessions]);


  const shouldShowPostInterview = useMemo(() => {
    if (!application) return false;

    // If there's already a post-interview evaluation summary, it's definitely post-interview phase.
    if (application.postInterviewEvaluation && application.postInterviewEvaluation.submissions > 0) {
      return true;
    }

    if (application.interviewCompleted) { // Keep legacy check for now
      return true;
    }

    if (application.status === 'interview') {
      const lastInterview = application.interviews
        ?.filter(iv => iv.status === 'scheduled')
        .sort((a,b) => b.startAt.toMillis() - a.startAt.toMillis())[0];
      
      if (lastInterview?.endAt) {
        return new Date() > lastInterview.endAt.toDate();
      }
    }
    
    const interviewStageIndex = ORDERED_RECRUITMENT_STAGES.indexOf('interview');
    const currentStageIndex = ORDERED_RECRUITMENT_STAGES.indexOf(application.status);
    if (currentStageIndex > interviewStageIndex) {
      return true;
    }

    return false;
  }, [application]);


  const isLoading = isLoadingApp || isLoadingProfile || isLoadingJob || isLoadingUsers || isLoadingBrands || isLoadingSessions;

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Loading..." menuConfig={[]}><ApplicationDetailSkeleton /></DashboardLayout>;
  }

  // Handle access denied once data is loaded
  if (!isLoading && !isAssigned) {
    return (
        <DashboardLayout 
            pageTitle="Akses Ditolak" 
            menuConfig={menuConfig}
        >
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
             <div className="bg-destructive/10 p-4 rounded-full">
                <Lock className="h-10 w-10 text-destructive" />
             </div>
             <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Anda tidak memiliki akses</h1>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Halaman ini hanya dapat diakses oleh HRD, Super Admin, atau anggota tim yang ditugaskan untuk rekrutmen ini.
                </p>
             </div>
             <Button variant="outline" onClick={() => window.history.back()}>
               Kembali
             </Button>
          </div>
        </DashboardLayout>
    );
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
            onSendOfferClick={() => setIsOfferDialogOpen(true)}
          />
          
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border-4 border-background ring-2 ring-primary">
                     <AvatarImage src={(profile as any).photoUrl || `https://picsum.photos/seed/${application.candidateUid}/100/100`} alt={profile.fullName} data-ai-hint="profile avatar" />
                     <AvatarFallback className="text-xl">{getInitials(profile.fullName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
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
                    <div className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted mt-1 flex items-center gap-1.5", assessmentInfo.color)}>
                        <BrainCircuit className="h-3 w-3" />
                        <span>Psikotest: {assessmentInfo.text} {assessmentInfo.result && `(${assessmentInfo.result})`}</span>
                    </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <UnifiedInternalDecision application={application} onStageChange={handleStageChange} />

          <InterviewManagement 
              application={application} 
              job={job} 
              allUsers={internalUsers || []}
              allBrands={brands || []}
              onUpdate={mutateApplication}
          />
          
          <div className="grid grid-cols-1 xl:grid-cols-[200px_1fr] gap-10 items-start pt-4">
            
            <div className="xl:sticky xl:top-24 hidden xl:block">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-4 px-3">Navigator Profil</p>
                <CandidateStepNav activeStep={activeProfileStep} onStepChange={setActiveProfileStep} />
            </div>

            <div className="space-y-6">
                <Card className="shadow-2xl border-none p-4 sm:p-8 md:p-12 rounded-[2.5rem] bg-card/60 backdrop-blur-md border-t-8 border-t-primary min-h-[700px]">
                    <CandidateStepContent profile={profile} application={application} activeStep={activeProfileStep} job={job} />
                </Card>
            </div>
            
            <div className="xl:hidden grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-2xl">
                 {[1,2,3,4,5,6].map(i => (
                     <Button key={i} variant={activeProfileStep === i ? 'default' : 'ghost'} size="sm" onClick={() => setActiveProfileStep(i)}>Step {i}</Button>
                 ))}
            </div>
          </div>

          <div className="space-y-6 pt-10">
              <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                      <div className="flex p-1 bg-slate-900/50 rounded-2xl border border-slate-800 ring-1 ring-white/5 shadow-2xl">
                          <Button 
                              variant={evaluationFilter === 'all' ? 'default' : 'ghost'} 
                              size="sm" 
                              onClick={() => setEvaluationFilter('all')}
                              className={cn("rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10", evaluationFilter === 'all' && "bg-indigo-600 shadow-lg shadow-indigo-600/20")}
                          >
                              Semua
                          </Button>
                          <Button 
                              variant={evaluationFilter === 'pra' ? 'default' : 'ghost'} 
                              size="sm" 
                              onClick={() => setEvaluationFilter('pra')}
                              className={cn("rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10", evaluationFilter === 'pra' && "bg-indigo-600 shadow-lg shadow-indigo-600/20")}
                          >
                              Pra Wawancara
                          </Button>
                          {shouldShowPostInterview && (
                              <Button 
                                  variant={evaluationFilter === 'pasca' ? 'default' : 'ghost'} 
                                  size="sm" 
                                  onClick={() => setEvaluationFilter('pasca')}
                                  className={cn("rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10", evaluationFilter === 'pasca' && "bg-teal-600 shadow-lg shadow-teal-600/20")}
                              >
                                  Pasca Wawancara
                              </Button>
                          )}
                      </div>
                  </div>
              </div>

              {(evaluationFilter === 'all' || evaluationFilter === 'pra') && (
                  <InternalEvaluationSection application={application} job={job} internalUsers={internalUsers} />
              )}

              {shouldShowPostInterview && (evaluationFilter === 'all' || evaluationFilter === 'pasca') && (
                  <PostInterviewEvaluationSection application={application} job={job} internalUsers={internalUsers} />
              )}
               {isHRD && <FinalInternalDecisionSection application={application} onStageChange={handleStageChange} />}
          </div>
        </div>
        </>
      )}
    </DashboardLayout>
  );
}
