"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import {
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
  useCollection,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  Timestamp,
  collection,
  where,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import type {
  JobApplication,
  Profile,
  Job,
  ApplicationTimelineEvent,
  ApplicationInterview,
  RescheduleRequest,
  Brand,
  UserProfile,
  AssessmentSession,
} from "@/lib/types";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail,
  Phone,
  XCircle,
  Calendar,
  Users,
  RefreshCw,
  X,
  MessageSquare,
  AlertTriangle,
  Edit,
  ShieldCheck,
  Lock,
  GraduationCap,
  BrainCircuit,
  Info,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { MENU_CONFIG } from "@/lib/menu-config";
import { ProfileView } from "@/components/recruitment/ProfileView";
import {
  ApplicationStatusBadge,
  statusDisplayLabels,
} from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { format, differenceInMinutes, add, isBefore } from "date-fns";
import { ApplicationProgressStepper } from "@/components/recruitment/ApplicationProgressStepper";
import { CandidateDocumentsCard } from "@/components/recruitment/CandidateDocumentsCard";
import { CandidateFitAnalysis } from "@/components/recruitment/CandidateFitAnalysis";
import { ApplicationActionBar } from "@/components/recruitment/ApplicationActionBar";
import { ApplicationNotes } from "@/components/recruitment/ApplicationNotes";
import type { ScheduleInterviewData } from "@/components/recruitment/ScheduleInterviewDialog";
import { ScheduleInterviewDialog } from "@/components/recruitment/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { id as idLocale } from "date-fns/locale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ManagePanelistsDialog } from "@/components/recruitment/ManagePanelistsDialog";
import { ROLES_INTERNAL, ORDERED_RECRUITMENT_STAGES } from "@/lib/types";
import { InternalEvaluationSection } from "@/components/recruitment/InternalEvaluationSection";
import { PostInterviewEvaluationSection } from "@/components/recruitment/PostInterviewEvaluationSection";
import { UnifiedInternalDecision } from "@/components/recruitment/UnifiedInternalDecision";
import {
  OfferEditor,
  type OfferFormData,
} from "@/components/recruitment/OfferEditor";
import {
  CandidateStepNav,
  CandidateStepContent,
} from "@/components/recruitment/CandidateStepView";

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

const InfoRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-slate-600">
      {icon}
    </div>
    <div>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="text-sm font-semibold">{value || "-"}</div>
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
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  const [counterSalary, setCounterSalary] = useState("");
  const [counterReason, setCounterReason] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [activeProfileStep, setActiveProfileStep] = useState(1);
  const [evaluationFilter, setEvaluationFilter] = useState<
    "all" | "pra" | "pasca" | "offering"
  >("all");

  const applicationRef = useMemoFirebase(
    () =>
      applicationId ? doc(firestore, "applications", applicationId) : null,
    [firestore, applicationId],
  );
  const {
    data: application,
    isLoading: isLoadingApp,
    mutate: mutateApplication,
  } = useDoc<JobApplication>(applicationRef);

  const profileRef = useMemoFirebase(
    () =>
      application ? doc(firestore, "profiles", application.candidateUid) : null,
    [firestore, application],
  );
  const { data: profile, isLoading: isLoadingProfile } =
    useDoc<Profile>(profileRef);

  const jobRef = useMemoFirebase(
    () => (application ? doc(firestore, "jobs", application.jobId) : null),
    [firestore, application],
  );
  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobRef);

  const isPrivilegedRecruiter =
    userProfile?.role === "super-admin" || userProfile?.role === "hrd";

  const internalUsersQuery = useMemoFirebase(() => {
    // Only privileged users can fetch the full list for assignment purposes.
    if (!userProfile || !isPrivilegedRecruiter) {
      return null;
    }
    return query(
      collection(firestore, "users"),
      where("role", "in", ["hrd", "manager", "karyawan", "super-admin"]),
      where("isActive", "==", true),
    );
  }, [firestore, userProfile, isPrivilegedRecruiter]);

  const { data: internalUsers, isLoading: isLoadingUsers } =
    useCollection<UserProfile>(internalUsersQuery);

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const assessmentSessionsQuery = useMemoFirebase(() => {
    if (!application) return null;
    return query(
      collection(firestore, "assessment_sessions"),
      where("candidateUid", "==", application.candidateUid),
    );
  }, [firestore, application]);
  const { data: assessmentSessions, isLoading: isLoadingSessions } =
    useCollection<AssessmentSession>(assessmentSessionsQuery);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === "super-admin") return MENU_CONFIG["super-admin"];
    if (userProfile.role === "hrd") return MENU_CONFIG["hrd"];
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
    const isPanelist = application.interviews?.some(
      (iv) =>
        iv.status !== "canceled" && iv.panelistIds?.includes(userProfile.uid),
    );
    if (isPanelist) return true;

    // Check if user is assigned as an internal reviewer
    if (
      application.internalReviewConfig?.assignedReviewerUids?.includes(
        userProfile.uid,
      )
    )
      return true;

    return false;
  }, [userProfile, application, job, isPrivilegedRecruiter]);

  const handleStageChange = async (
    newStage: JobApplication["status"],
    reason: string,
  ) => {
    if (!application || !userProfile) return false;

    if (
      application.candidateStatus === "lolos" ||
      application.finalDecisionLocked
    ) {
      toast({
        variant: "destructive",
        title: "Perubahan Dikunci",
        description:
          "Keputusan final telah dikunci dan status tidak dapat diubah secara langsung.",
      });
      return false;
    }

    const timelineEvent: ApplicationTimelineEvent = {
      type: "stage_changed",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: { from: application.status, to: newStage, note: reason },
    };

    const updatePayload: any = {
      status: newStage,
      updatedAt: serverTimestamp(),
      timeline: [...(application.timeline || []), timelineEvent],
    };

    // Logic to update candidateStatus based on internalStatus change
    switch (newStage as string) {
      case "interview":
        updatePayload.candidateStatus = "interview_scheduled";
        break;
      case "offer":
        updatePayload.candidateStatus = "offer_received";
        break;
      case "hired":
        updatePayload.candidateStatus = "process_complete";
        break;
      // For other internal statuses, keep candidateStatus as 'under_review'
      case "on_hold":
      case "rejected":
      case "screening":
        updatePayload.candidateStatus = "under_review";
        break;
      default:
      // Do not change candidate status for other internal changes
    }

    if (newStage === "rejected") {
      updatePayload.decisionAt = serverTimestamp();
    }

    try {
      await updateDoc(applicationRef!, updatePayload as any);
      mutateApplication();
      toast({
        title: "Status Diperbarui",
        description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".`,
      });
      return true;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Memperbarui",
        description: error.message,
      });
      return false;
    }
  };

  const handleSaveOfferDraft = async (offerData: OfferFormData) => {
    if (!application) return;
    setIsSavingDraft(true);

    const [hours, minutes] = offerData.startTime.split(":").map(Number);
    const combinedDate = new Date(offerData.contractStartDate);
    combinedDate.setHours(hours, minutes);

    try {
      await updateDoc(applicationRef!, {
        offeredSalary: offerData.offeredSalary,
        probationDurationMonths: offerData.probationDurationMonths,
        contractStartDate: Timestamp.fromDate(combinedDate),
        contractDurationMonths: offerData.contractDurationMonths,
        contractEndDate: offerData.contractEndDate
          ? Timestamp.fromDate(offerData.contractEndDate)
          : null,
        offerDescription: offerData.offerDescription,
        workDays: offerData.workDays,
        offerNotes: offerData.offerNotes,
        updatedAt: serverTimestamp(),
      });
      mutateApplication();
      toast({
        title: "Draf Disimpan",
        description: "Detail penawaran kerja telah disimpan sebagai draf.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Draf",
        description: error.message,
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSendOffer = async (offerData: OfferFormData) => {
    if (!application || !userProfile) return;
    setIsSendingOffer(true);

    const [hours, minutes] = offerData.startTime.split(":").map(Number);
    const combinedDate = new Date(offerData.contractStartDate);
    combinedDate.setHours(hours, minutes);

    const timelineEvent: ApplicationTimelineEvent = {
      type: "offer_sent",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: {
        note: "Penawaran kerja resmi telah dikirimkan kepada kandidat.",
      },
    };

    try {
      await updateDoc(applicationRef!, {
        status: "offered",
        offerStatus: "sent",
        offeredSalary: offerData.offeredSalary,
        probationDurationMonths: offerData.probationDurationMonths,
        contractStartDate: Timestamp.fromDate(combinedDate),
        contractDurationMonths: offerData.contractDurationMonths,
        contractEndDate: offerData.contractEndDate
          ? Timestamp.fromDate(offerData.contractEndDate)
          : null,
        offerDescription: offerData.offerDescription,
        workDays: offerData.workDays,
        offerNotes: offerData.offerNotes,
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      });
      mutateApplication();
      toast({
        title: "Penawaran Terkirim",
        description:
          "Kandidat sekarang dapat melihat dan merespons penawaran Anda.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Penawaran",
        description: error.message,
      });
    } finally {
      setIsSendingOffer(false);
    }
  };

  const handleOfferDecision = async (
    decision:
      | "negotiation_approved"
      | "negotiation_rejected"
      | "negotiation_countered",
  ) => {
    if (!application || !userProfile) return;
    setIsUpdatingDecision(true);

    const candidateRequest = application.candidateCounterOffer;
    const counterSalaryValue = Number(counterSalary.replace(/[^0-9]/g, ""));

    if (decision === "negotiation_countered" && !counterSalaryValue) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Counter",
        description: "Mohon isi nominal penawaran counter yang valid.",
      });
      setIsUpdatingDecision(false);
      return;
    }

    const timelineEvent: ApplicationTimelineEvent = {
      type: "offer_sent",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: {
        note:
          decision === "negotiation_approved"
            ? "HRD menyetujui negosiasi kandidat dan menetapkan penawaran akhir."
            : decision === "negotiation_rejected"
              ? "HRD menolak negosiasi kandidat. Kandidat dapat menerima atau menolak penawaran awal."
              : "HRD mengajukan penawaran counter akhir kepada kandidat.",
      },
    };

    const updatePayload: any = {
      offerStatus: decision,
      updatedAt: serverTimestamp(),
      timeline: [...(application.timeline || []), timelineEvent],
    };

    if (
      decision === "negotiation_approved" &&
      candidateRequest?.requestedSalary
    ) {
      updatePayload.offeredSalary = candidateRequest.requestedSalary;
    }

    if (decision === "negotiation_countered") {
      updatePayload.offeredSalary = counterSalaryValue;
      updatePayload.offerNotes = counterReason || application.offerNotes;
    }

    try {
      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      toast({
        title: "Tanggapan Negosiasi Diperbarui",
        description: "Status penawaran berhasil dikirim kepada kandidat.",
      });
      setIsCounterOpen(false);
      setCounterSalary("");
      setCounterReason("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Memperbarui Negosiasi",
        description: error.message,
      });
    } finally {
      setIsUpdatingDecision(false);
    }
  };

  useEffect(() => {
    const autoScreening = async () => {
      if (
        isLoadingApp ||
        !application ||
        !userProfile ||
        application.status !== "submitted" ||
        hasTriggeredAutoScreen
      ) {
        return;
      }
      setHasTriggeredAutoScreen(true);

      const timelineEvent: ApplicationTimelineEvent = {
        type: "stage_changed",
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
          from: "submitted",
          to: "screening",
          note: "Application automatically moved to screening upon HR review.",
        },
      };

      await updateDocumentNonBlocking(applicationRef!, {
        status: "screening",
        candidateStatus: "under_review",
        timeline: [...(application.timeline || []), timelineEvent],
      });
      mutateApplication();
      toast({
        title: "Lamaran Discreening",
        description: `Status lamaran ini secara otomatis diperbarui menjadi "Screening".`,
      });
    };
    autoScreening().catch(console.error);
  }, [
    application,
    isLoadingApp,
    userProfile,
    hasTriggeredAutoScreen,
    applicationRef,
    mutateApplication,
    toast,
  ]);

  const assessmentInfo = useMemo(() => {
    if (isLoadingSessions) {
      return {
        status: "loading",
        text: "Memuat...",
        result: null,
        color: "text-slate-500",
      };
    }
    if (!assessmentSessions || assessmentSessions.length === 0) {
      return {
        status: "unstarted",
        text: "Belum Dikerjakan",
        result: null,
        color: "text-destructive",
      };
    }

    // Sort sessions on the client to find the most recent one
    const sortedSessions = [...assessmentSessions].sort(
      (a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0),
    );
    const session = sortedSessions[0];

    if (session.status === "submitted") {
      const resultText =
        session.result?.discType || session.result?.mbtiArchetype?.code;
      return {
        status: "completed",
        text: "Selesai",
        result: resultText,
        color: "text-green-600",
      };
    }
    if (session.status === "draft") {
      return {
        status: "in_progress",
        text: "Sedang Dikerjakan",
        result: null,
        color: "text-amber-600",
      };
    }
    return {
      status: "unstarted",
      text: "Belum Dikerjakan",
      result: null,
      color: "text-destructive",
    };
  }, [assessmentSessions, isLoadingSessions]);

  const shouldShowPostInterview = useMemo(() => {
    if (!application) return false;
    // Show if there are any post-interview reviews submitted
    if (
      application.postInterviewEvaluation &&
      application.postInterviewEvaluation.submissions > 0
    ) {
      return true;
    }
    // Or if the interview stage is complete
    return !!application.interviewCompleted;
  }, [application]);

  const isHRD =
    userProfile?.role === "hrd" || userProfile?.role === "super-admin";

  const canOpenPostInterview = useMemo(() => {
    if (!application) return false;
    const postInterviewStages = [
      "interview",
      "post_interview",
      "offered",
      "offering",
      "hired",
      "offer_sent",
      "offer_accepted",
      "offer_rejected",
      "offer_received",
      "process_complete",
    ];
    return (
      postInterviewStages.includes(application.status) ||
      (application.candidateStatus &&
        postInterviewStages.includes(application.candidateStatus)) ||
      ((application as any).candidateStage &&
        postInterviewStages.includes((application as any).candidateStage)) ||
      ((application as any).currentStage &&
        postInterviewStages.includes((application as any).currentStage))
    );
  }, [application]);

  const canOpenOffering = useMemo(() => {
    if (!application || !isHRD) return false;

    const offeringStages = [
      "offered",
      "offering",
      "offer_sent",
      "offer_accepted",
      "offer_rejected",
      "hired",
      "offer_received",
      "process_complete",
    ];

    return (
      offeringStages.includes(application.status) ||
      (application.candidateStatus &&
        offeringStages.includes(application.candidateStatus)) ||
      (application.offerStatus &&
        offeringStages.includes(application.offerStatus)) ||
      ((application as any).candidateStage &&
        offeringStages.includes((application as any).candidateStage)) ||
      ((application as any).currentStage &&
        offeringStages.includes((application as any).currentStage))
    );
  }, [application, isHRD]);

  const displayStatus = useMemo(() => {
    if (!application) return "draft";

    const isHrdEvaluated =
      application.postInterviewDecision != null ||
      application.recruitmentInternalDecision != null;

    if (application.status === "interview" && !isHrdEvaluated) {
      const now = new Date();
      const hasPastInterview = application.interviews?.some(
        (iv) => iv.status === "scheduled" && iv.startAt.toDate() < now,
      );

      if (hasPastInterview) return "waiting_evaluation";
    }

    return application.status;
  }, [application]);

  const showOfferingTab = useMemo(() => {
    if (!application || !isHRD) return false;

    const interviewAndAfterStatuses = [
      "interview",
      "post_interview",
      "offered",
      "offering",
      "offer_sent",
      "offer_accepted",
      "offer_rejected",
      "hired",
      "rejected",
      "offer_received",
      "process_complete",
    ];

    const matchesStatus = interviewAndAfterStatuses.includes(
      application.status,
    );
    const matchesCandidateStatus =
      application.candidateStatus &&
      interviewAndAfterStatuses.includes(application.candidateStatus);
    const matchesOfferStatus =
      application.offerStatus &&
      interviewAndAfterStatuses.includes(application.offerStatus);
    const hasOfferTimeline = application.timeline?.some(
      (event) => event.type === "offer_sent",
    );

    return (
      !!matchesStatus ||
      !!matchesCandidateStatus ||
      !!matchesOfferStatus ||
      !!hasOfferTimeline
    );
  }, [application, isHRD]);

  const isLoading =
    isLoadingApp ||
    isLoadingProfile ||
    isLoadingJob ||
    isLoadingUsers ||
    isLoadingBrands ||
    isLoadingSessions;

  const formatSalary = (value?: number | null) => {
    if (value === undefined || value === null) return "-";
    return value.toLocaleString("id-ID");
  };

  const offerTimeline = useMemo(
    () =>
      (application?.timeline || []).filter(
        (event) => event.type === "offer_sent",
      ),
    [application?.timeline],
  );

  const hasOfferData = useMemo(() => {
    if (!application) return false;
    return (
      !!application.offerStatus ||
      !!application.offeredSalary ||
      !!application.contractStartDate ||
      !!application.contractDurationMonths ||
      !!application.offerDescription ||
      !!application.workDays ||
      !!application.offerNotes
    );
  }, [application]);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Loading..." menuConfig={[]}>
        <ApplicationDetailSkeleton />
      </DashboardLayout>
    );
  }

  // Handle access denied once data is loaded
  if (!isLoading && !isAssigned) {
    return (
      <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <div className="bg-destructive/10 p-4 rounded-full">
            <Lock className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Anda tidak memiliki akses
            </h1>
            <p className="text-slate-700 max-w-md mx-auto">
              Halaman ini hanya dapat diakses oleh HRD, Super Admin, atau
              anggota tim yang ditugaskan untuk rekrutmen ini.
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
    <DashboardLayout pageTitle="Application Detail" menuConfig={menuConfig}>
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
              onSendOfferClick={() => setEvaluationFilter("offering")}
              actionsLocked={
                application.candidateStatus === "lolos" ||
                application.finalDecisionLocked
              }
            />
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16 border-4 border-background ring-2 ring-primary">
                      <AvatarImage
                        src={
                          (profile as any).photoUrl ||
                          `https://picsum.photos/seed/${application.candidateUid}/100/100`
                        }
                        alt={profile.fullName}
                        data-ai-hint="profile avatar"
                      />
                      <AvatarFallback className="text-xl">
                        {getInitials(profile.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-2xl">
                        {profile.fullName}
                      </CardTitle>
                      <CardDescription className="text-base flex items-center gap-2 mt-1">
                        Melamar untuk:{" "}
                        <span className="font-semibold text-foreground">
                          {application.jobPosition}
                        </span>
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-slate-600" />{" "}
                          {application.candidateEmail}
                        </span>
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-600" />{" "}
                          {profile.phone}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ApplicationStatusBadge
                      status={displayStatus}
                      className="text-base px-4 py-1"
                    />
                    {application.candidateStatus && (
                      <Badge
                        variant="secondary"
                        className="uppercase text-[10px] tracking-wider px-2 py-1"
                      >
                        {application.candidateStatus.replaceAll("_", " ")}
                      </Badge>
                    )}
                    {application.submittedAt && (
                      <p className="text-sm text-slate-700">
                        Applied on{" "}
                        {format(
                          application.submittedAt.toDate(),
                          "dd MMM yyyy",
                        )}
                      </p>
                    )}
                    <div
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted mt-1 flex items-center gap-1.5",
                        assessmentInfo.color,
                      )}
                    >
                      <BrainCircuit className="h-3 w-3" />
                      <span>
                        Psikotest: {assessmentInfo.text}{" "}
                        {assessmentInfo.result && `(${assessmentInfo.result})`}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <ApplicationProgressStepper currentStatus={displayStatus} />

            <UnifiedInternalDecision
              application={application}
              onStageChange={handleStageChange}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[200px_1fr] gap-10 items-start pt-4">
              <div className="xl:sticky xl:top-24 hidden xl:block">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500/40 mb-4 px-3">
                  Navigator Profil
                </p>
                <CandidateStepNav
                  activeStep={activeProfileStep}
                  onStepChange={setActiveProfileStep}
                />
              </div>

              <div className="space-y-6">
                <Card className="shadow-2xl border-none p-4 sm:p-8 md:p-12 rounded-[2.5rem] bg-card/60 backdrop-blur-md border-t-8 border-t-primary min-h-[700px]">
                  <CandidateStepContent
                    profile={profile}
                    application={application}
                    activeStep={activeProfileStep}
                    job={job}
                  />
                </Card>
              </div>

              <div className="xl:hidden grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-2xl">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Button
                    key={i}
                    variant={activeProfileStep === i ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveProfileStep(i)}
                  >
                    Step {i}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-6 pt-10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="flex p-1 bg-slate-900/50 rounded-2xl border border-slate-800 ring-1 ring-white/5 shadow-2xl">
                    <Button
                      variant={evaluationFilter === "all" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setEvaluationFilter("all")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10",
                        evaluationFilter === "all" &&
                          "bg-indigo-600 shadow-lg shadow-indigo-600/20",
                      )}
                    >
                      Semua
                    </Button>
                    <Button
                      variant={evaluationFilter === "pra" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setEvaluationFilter("pra")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10",
                        evaluationFilter === "pra" &&
                          "bg-indigo-600 shadow-lg shadow-indigo-600/20",
                      )}
                    >
                      Pra Wawancara
                    </Button>
                    <Button
                      variant={
                        evaluationFilter === "pasca" ? "default" : "ghost"
                      }
                      size="sm"
                      onClick={() => setEvaluationFilter("pasca")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10",
                        evaluationFilter === "pasca" &&
                          "bg-teal-600 shadow-lg shadow-teal-600/20",
                      )}
                    >
                      Pasca Wawancara
                    </Button>
                    <Button
                      variant={
                        evaluationFilter === "offering" ? "default" : "ghost"
                      }
                      size="sm"
                      onClick={() => setEvaluationFilter("offering")}
                      className={cn(
                        "rounded-xl text-[10px] font-black uppercase tracking-widest px-6 h-10",
                        evaluationFilter === "offering" &&
                          "bg-amber-600 shadow-lg shadow-amber-600/20",
                      )}
                    >
                      Offering
                    </Button>
                  </div>
                </div>
              </div>

              {(evaluationFilter === "all" || evaluationFilter === "pra") && (
                <InternalEvaluationSection
                  application={application}
                  job={job}
                  internalUsers={internalUsers}
                />
              )}

              {(evaluationFilter === "all" || evaluationFilter === "pasca") &&
                (canOpenPostInterview ? (
                  <PostInterviewEvaluationSection
                    application={application}
                    job={job}
                    internalUsers={internalUsers}
                  />
                ) : evaluationFilter === "pasca" ? (
                  <Card className="border border-dashed border-slate-700 bg-slate-950/70">
                    <CardHeader>
                      <CardTitle className="text-xl font-bold">
                        Kandidat belum mencapai tahap pasca wawancara.
                      </CardTitle>
                      <CardDescription>
                        Tab ini akan aktif setelah kandidat memasuki proses
                        wawancara.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : null)}

              {(evaluationFilter === "all" && showOfferingTab) ||
              evaluationFilter === "offering" ? (
                <div className="space-y-6">
                  {!canOpenOffering ? (
                    <Card className="border border-dashed border-slate-700 bg-slate-950/70">
                      <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                          <Lock className="h-5 w-5 text-amber-500" />
                          Kandidat belum mencapai tahap offering.
                        </CardTitle>
                        <CardDescription>
                          Tab ini akan aktif setelah kandidat lolos ke tahap
                          penawaran kerja.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-600">
                            Offering
                          </p>
                          <h2 className="text-xl font-semibold">
                            Rekap Penawaran Kerja HRD
                          </h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="uppercase">
                            {application.offerStatus ?? "draft"}
                          </Badge>
                          <span className="text-sm text-slate-600">
                            {hasOfferData
                              ? "Penawaran tersedia untuk kandidat"
                              : "Belum ada penawaran kerja dibuat"}
                          </span>
                        </div>
                      </div>

                      {!hasOfferData ? (
                        <Card className="border border-dashed border-muted/50 bg-muted/50">
                          <CardHeader>
                            <CardTitle>Belum ada penawaran kerja</CardTitle>
                            <CardDescription>
                              HRD dapat membuat dan mengelola penawaran kerja
                              kandidat di tab ini. Simpan sebagai draf atau
                              kirim penawaran resmi saat semuanya siap.
                            </CardDescription>
                          </CardHeader>
                        </Card>
                      ) : (
                        <Card className="border border-muted/50 bg-muted/50">
                          <CardHeader>
                            <CardTitle>Ringkasan Penawaran</CardTitle>
                            <CardDescription>
                              Status, kompensasi, jadwal kerja, dan catatan HRD
                              untuk kandidat.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-4 md:grid-cols-2">
                            <InfoRow
                              icon={<ShieldCheck className="h-4 w-4" />}
                              label="Status Penawaran"
                              value={
                                application.offerStatus
                                  ? application.offerStatus
                                  : "draft"
                              }
                            />
                            <InfoRow
                              icon={<Users className="h-4 w-4" />}
                              label="Posisi"
                              value={application.jobPosition}
                            />
                            <InfoRow
                              icon={<Calendar className="h-4 w-4" />}
                              label="Kompensasi"
                              value={
                                application.offeredSalary
                                  ? `Rp ${formatSalary(
                                      application.offeredSalary,
                                    )} / bulan`
                                  : "-"
                              }
                            />
                            <InfoRow
                              icon={<Info className="h-4 w-4" />}
                              label="Status Kerja"
                              value={application.workDays ?? "-"}
                            />
                            <InfoRow
                              icon={<MessageSquare className="h-4 w-4" />}
                              label="Catatan HRD"
                              value={application.offerNotes ?? "-"}
                            />
                            <InfoRow
                              icon={<Calendar className="h-4 w-4" />}
                              label="Deskripsi Penawaran"
                              value={application.offerDescription ?? "-"}
                            />
                          </CardContent>
                          {application.offerStatus ===
                            "negotiation_requested" &&
                          application.candidateCounterOffer ? (
                            <>
                              <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      Usulan Negosiasi Kandidat
                                    </p>
                                    <p className="text-sm text-slate-600">
                                      Detail gaji yang diminta kandidat dan
                                      catatan.
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <InfoRow
                                    icon={<ShieldCheck className="h-4 w-4" />}
                                    label="Gaji awal"
                                    value={
                                      application.offeredSalary != null
                                        ? `${formatSalary(application.offeredSalary)} / bulan`
                                        : "-"
                                    }
                                  />
                                  <InfoRow
                                    icon={<Info className="h-4 w-4" />}
                                    label="Gaji diminta kandidat"
                                    value={
                                      application.candidateCounterOffer
                                        .requestedSalary != null
                                        ? `${formatSalary(application.candidateCounterOffer.requestedSalary)} / bulan`
                                        : "-"
                                    }
                                  />
                                  <InfoRow
                                    icon={<Users className="h-4 w-4" />}
                                    label="Selisih nominal"
                                    value={
                                      application.candidateCounterOffer
                                        .requestedSalary != null &&
                                      application.offeredSalary != null
                                        ? `Rp ${(application.candidateCounterOffer.requestedSalary - application.offeredSalary).toLocaleString("id-ID")}`
                                        : "-"
                                    }
                                  />
                                  <InfoRow
                                    icon={<MessageSquare className="h-4 w-4" />}
                                    label="Catatan kandidat"
                                    value={
                                      application.candidateCounterOffer
                                        .reason || "-"
                                    }
                                  />
                                </div>
                              </div>
                              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    handleOfferDecision("negotiation_rejected")
                                  }
                                  disabled={isUpdatingDecision}
                                >
                                  {isUpdatingDecision ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  Tolak Negosiasi
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    handleOfferDecision("negotiation_approved")
                                  }
                                  disabled={isUpdatingDecision}
                                >
                                  {isUpdatingDecision ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  Setuju
                                </Button>
                                <Button
                                  onClick={() => setIsCounterOpen(true)}
                                  disabled={isUpdatingDecision}
                                >
                                  Ajukan Counter
                                </Button>
                              </div>
                              <Dialog
                                open={isCounterOpen}
                                onOpenChange={setIsCounterOpen}
                              >
                                <DialogContent className="sm:max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>
                                      Ajukan Counter Penawaran
                                    </DialogTitle>
                                    <DialogDescription>
                                      Masukkan nominal gaji final yang akan
                                      diajukan kembali kepada kandidat.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div>
                                      <label className="text-sm font-medium text-slate-600">
                                        Gaji counter
                                      </label>
                                      <Input
                                        value={counterSalary}
                                        onChange={(event) =>
                                          setCounterSalary(event.target.value)
                                        }
                                        placeholder="7.000.000"
                                        inputMode="numeric"
                                        className="mt-2"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-slate-600">
                                        Catatan untuk kandidat
                                      </label>
                                      <Textarea
                                        value={counterReason}
                                        onChange={(event) =>
                                          setCounterReason(event.target.value)
                                        }
                                        placeholder="Berikan alasan singkat untuk counter penawaran"
                                        rows={5}
                                        className="mt-2"
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button
                                      variant="secondary"
                                      type="button"
                                      onClick={() => setIsCounterOpen(false)}
                                      disabled={isUpdatingDecision}
                                    >
                                      Batal
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={() =>
                                        handleOfferDecision(
                                          "negotiation_countered",
                                        )
                                      }
                                      disabled={isUpdatingDecision}
                                    >
                                      {isUpdatingDecision ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : null}
                                      Kirim Counter
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </>
                          ) : null}
                          <CardFooter className="rounded-b-xl bg-slate-100/70 dark:bg-slate-900/50 p-4">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Timeline Penawaran
                              </p>
                              {offerTimeline.length > 0 ? (
                                <div className="space-y-2">
                                  {offerTimeline.map((event, index) => (
                                    <div
                                      key={index}
                                      className="rounded-lg border border-slate-300/80 bg-slate-100 p-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-100"
                                    >
                                      <p className="font-medium">
                                        {format(
                                          event.at.toDate(),
                                          "dd MMM yyyy HH:mm",
                                        )}
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-300">
                                        {event.meta.note ??
                                          "Penawaran dikirim ke kandidat."}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                  Belum ada aktivitas penawaran yang tercatat.
                                </p>
                              )}
                            </div>
                          </CardFooter>
                        </Card>
                      )}

                      <OfferEditor
                        id="offering"
                        application={application}
                        job={job}
                        candidateName={profile.fullName}
                        onSaveDraft={handleSaveOfferDraft}
                        onSendOffer={handleSendOffer}
                        isSavingDraft={isSavingDraft}
                        isSendingOffer={isSendingOffer}
                      />
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
