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
  deleteDoc,
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
  Offering,
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
  FileText,
  DollarSign,
  Clock,
  MapPin,
  Eye,
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
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [isWithdrawingOfferings, setIsWithdrawingOfferings] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);
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

  const offeringsQuery = useMemoFirebase(() => {
    if (!applicationId) return null;
    return query(
      collection(firestore, "offerings"),
      where("applicationId", "==", applicationId),
    );
  }, [firestore, applicationId]);
  const {
    data: offeringsList,
    isLoading: isLoadingOfferings,
    mutate: mutateOfferings,
  } = useCollection<Offering>(offeringsQuery);

  const latestOffering = useMemo(() => {
    if (!offeringsList || offeringsList.length === 0) return null;
    return [...offeringsList].sort(
      (a, b) =>
        (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) -
        (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0),
    )[0];
  }, [offeringsList]);

  const activeOffering = useMemo(() => {
    if (!offeringsList || offeringsList.length === 0 || !application?.currentOfferingId) return null;

    // Use currentOfferingId as single source of truth
    const currentOffering = offeringsList.find(
      (offering) => offering.id === application.currentOfferingId && offering.isActive === true
    );

    return currentOffering || null;
  }, [offeringsList, application?.currentOfferingId]);

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

  const handleSaveOfferDraft = async (offerData: any) => {
    if (!application) return;
    setIsSavingDraft(true);

    try {
      // Safely combine response deadline date and time
      let responseDeadline: Date | null = null;
      if (offerData.responseDeadline) {
        responseDeadline = new Date(offerData.responseDeadline);
        if (
          offerData.responseDeadlineTime &&
          typeof offerData.responseDeadlineTime === "string"
        ) {
          const [hh, mm] = offerData.responseDeadlineTime
            .split(":")
            .map((x: string) => parseInt(x));
          if (!isNaN(hh) && !isNaN(mm)) {
            responseDeadline.setHours(hh, mm, 0, 0);
          }
        }
      }

      const offeringId = offerData.offeringId as string | undefined;
      const updatePayload: any = {
        currentOfferingId: offeringId || application.currentOfferingId,
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(responseDeadline)
          : null,
        offeringDetails: {
          salary: offerData.salary || "",
          startDate: offerData.startDate || "",
          contractDurationMonths: offerData.contractDurationMonths || "",
          firstDayTime: offerData.firstDayTime || "",
          firstDayLocation: offerData.firstDayLocation || "",
          hrContact: offerData.hrContact || "",
        },
        additionalNotes: offerData.additionalNotes || "",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      if (mutateOfferings) {
        mutateOfferings();
      }
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

  const handleSendOffer = async (offerData: any) => {
    if (!application || !userProfile) return;
    setIsSendingOffer(true);

    try {
      // Safely combine response deadline date and time
      let responseDeadline: Date | null = null;
      if (offerData.responseDeadline) {
        responseDeadline = new Date(offerData.responseDeadline);
        if (
          offerData.responseDeadlineTime &&
          typeof offerData.responseDeadlineTime === "string"
        ) {
          const [hh, mm] = offerData.responseDeadlineTime
            .split(":")
            .map((x: string) => parseInt(x));
          if (!isNaN(hh) && !isNaN(mm)) {
            responseDeadline.setHours(hh, mm, 0, 0);
          }
        }
      }

      const timelineEvent: ApplicationTimelineEvent = {
        type: "offer_sent",
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
          note: "Penawaran kerja resmi telah dikirimkan kepada kandidat.",
        },
      };

      const offeringId = offerData.offeringId as string | undefined;
      const updatePayload: any = {
        status: "offered",
        currentOfferingId: offeringId || application.currentOfferingId,
        offerStatus: "sent",
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(responseDeadline)
          : null,
        offeringDetails: {
          salary: offerData.salary || "",
          startDate: offerData.startDate || "",
          contractDurationMonths: offerData.contractDurationMonths || "",
          firstDayTime: offerData.firstDayTime || "",
          firstDayLocation: offerData.firstDayLocation || "",
          hrContact: offerData.hrContact || "",
        },
        additionalNotes: offerData.additionalNotes || "",
        sentAt: Timestamp.now(),
        sentBy: userProfile.uid,
        viewedAtFirst: null,
        viewedAtLast: null,
        viewCount: 0,
        respondedAt: null,
        responseType: null,
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      };

      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      if (mutateOfferings) {
        mutateOfferings();
      }
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

  const handleDeleteDraft = async () => {
    if (!activeOffering?.id) return;
    setIsDeletingDraft(true);

    try {
      await deleteDoc(doc(firestore, "offerings", activeOffering.id));
      if (mutateOfferings) {
        mutateOfferings();
      }
      toast({
        title: "Draft Dihapus",
        description: "Draft penawaran berhasil dihapus.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus Draft",
        description: error.message,
      });
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const handleWithdrawAllOfferings = async () => {
    if (!applicationId || !offeringsList || offeringsList.length === 0) return;
    setIsWithdrawingOfferings(true);

    try {
      const batch = writeBatch(firestore);

      // Update all offerings to withdrawn and inactive
      offeringsList.forEach((offering) => {
        const offeringRef = doc(firestore, "offerings", offering.id!);
        batch.update(offeringRef, {
          status: "withdrawn",
          isActive: false,
          withdrawnAt: serverTimestamp(),
          withdrawnBy: userProfile?.uid,
          updatedAt: serverTimestamp(),
        });
      });

      // Clear currentOfferingId from application
      const applicationRef = doc(firestore, "applications", applicationId);
      batch.update(applicationRef, {
        currentOfferingId: null,
        offerStatus: null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      if (mutateOfferings) {
        mutateOfferings();
      }
      if (mutateApplication) {
        mutateApplication();
      }

      toast({
        title: "Offering Ditarik",
        description:
          "Semua penawaran sebelumnya telah ditarik. Kandidat tidak akan melihat penawaran aktif.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menarik Offering",
        description: error.message,
      });
    } finally {
      setIsWithdrawingOfferings(false);
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
      !!activeOffering ||
      !!application.offerStatus ||
      !!application.offeredSalary ||
      !!application.contractStartDate ||
      !!application.contractDurationMonths ||
      !!application.offerSections?.length ||
      !!application.offerDescription ||
      !!application.workDays ||
      !!application.offerNotes
    );
  }, [application, activeOffering]);

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
                      <Card className="border border-slate-700">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <FileText className="h-5 w-5 text-primary" />
                              Penawaran Kerja
                            </CardTitle>
                            {activeOffering && (
                              <Badge
                                variant={
                                  activeOffering.status === "draft"
                                    ? "secondary"
                                    : "default"
                                }
                                className="uppercase text-xs"
                              >
                                {activeOffering.status}
                              </Badge>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          {!hasOfferData ? (
                            <div className="py-6 text-center text-slate-500">
                              <p className="text-sm">
                                Belum ada penawaran kerja. Buat dan kelola
                                penawaran di bawah ini.
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {/* Row 1: Status & Last Updated */}
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">
                                  Status
                                </p>
                                <p className="text-sm font-semibold capitalize">
                                  {activeOffering?.status ||
                                    application.offerStatus ||
                                    "draft"}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">
                                  Diperbarui
                                </p>
                                <p className="text-sm font-semibold">
                                  {activeOffering
                                    ? format(
                                        activeOffering.updatedAt?.toDate?.() ||
                                          activeOffering.createdAt?.toDate?.() ||
                                          new Date(),
                                        "dd MMM yyyy HH:mm",
                                      )
                                    : "-"}
                                </p>
                              </div>

                              {/* Row 2: Dokumen & Kompensasi */}
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">
                                  Dokumen
                                </p>
                                <p className="text-sm font-semibold truncate">
                                  {activeOffering?.documentName ?? "-"}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">
                                  Kompensasi
                                </p>
                                <p className="text-sm font-semibold">
                                  {activeOffering?.offeringDetails?.salary
                                    ? `Rp ${activeOffering.offeringDetails.salary}`
                                    : application.offeredSalary
                                      ? `Rp ${formatSalary(application.offeredSalary)}`
                                      : "-"}
                                </p>
                              </div>

                              {/* Row 3: Tanggal Mulai & Durasi */}
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">
                                  Tanggal Mulai
                                </p>
                                <p className="text-sm font-semibold">
                                  {activeOffering?.offeringDetails?.startDate ||
                                    (application.contractStartDate
                                      ? format(
                                          application.contractStartDate.toDate(),
                                          "dd MMM yyyy",
                                        )
                                      : "-")}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-500">
                                  Durasi Kontrak
                                </p>
                                <p className="text-sm font-semibold">
                                  {activeOffering?.offeringDetails
                                    ?.contractDurationMonths
                                    ? `${activeOffering.offeringDetails.contractDurationMonths} bulan`
                                    : application.contractDurationMonths
                                      ? `${application.contractDurationMonths} bulan`
                                      : "-"}
                                </p>
                              </div>

                              {/* Row 4: Lokasi & Catatan */}
                              <div className="space-y-1 sm:col-span-2">
                                <p className="text-xs font-medium text-slate-500">
                                  Lokasi Hari Pertama
                                </p>
                                <p className="text-sm font-semibold">
                                  {activeOffering?.offeringDetails
                                    ?.firstDayLocation || "-"}
                                </p>
                              </div>
                              {(activeOffering?.additionalNotes ||
                                application.offerNotes) && (
                                <div className="space-y-1 sm:col-span-2">
                                  <p className="text-xs font-medium text-slate-500">
                                    Catatan
                                  </p>
                                  <p className="text-sm text-slate-600 line-clamp-2">
                                    {activeOffering?.additionalNotes ||
                                      application.offerNotes ||
                                      "-"}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>

                        {/* Actions Footer */}
                        <CardFooter className="flex flex-wrap gap-2 border-t border-slate-700 bg-slate-900/30 px-4 py-3">
                          {!hasOfferData ? (
                            <p className="text-xs text-slate-500">
                              Scroll ke bawah untuk membuat penawaran
                            </p>
                          ) : activeOffering?.status === "draft" ? (
                            <>
                              {activeOffering?.documentUrl && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    window.open(
                                      activeOffering.documentUrl,
                                      "_blank",
                                    )
                                  }
                                >
                                  <Eye className="h-4 w-4 mr-1.5" />
                                  Preview
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  document
                                    .getElementById("offering")
                                    ?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "start",
                                    })
                                }
                              >
                                <Edit className="h-4 w-4 mr-1.5" />
                                Lanjutkan Edit
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteDraft}
                                disabled={isDeletingDraft}
                              >
                                <X className="h-4 w-4 mr-1.5" />
                                {isDeletingDraft
                                  ? "Menghapus..."
                                  : "Hapus Draft"}
                              </Button>
                              {offeringsList && offeringsList.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleWithdrawAllOfferings}
                                  disabled={isWithdrawingOfferings}
                                >
                                  <RefreshCw className="h-4 w-4 mr-1.5" />
                                  {isWithdrawingOfferings
                                    ? "Menarik..."
                                    : "Tarik Offering"}
                                </Button>
                              )}
                            </>
                          ) : activeOffering?.status === "sent" ? (
                            <>
                              {activeOffering?.documentUrl && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    window.open(
                                      activeOffering.documentUrl,
                                      "_blank",
                                    )
                                  }
                                >
                                  <Eye className="h-4 w-4 mr-1.5" />
                                  Lihat Dokumen
                                </Button>
                              )}
                              <span className="text-xs text-slate-500">
                                Penawaran telah dikirim ke kandidat
                              </span>
                            </>
                          ) : null}
                        </CardFooter>
                      </Card>

                      <OfferEditor
                        id="offering"
                        application={application}
                        job={job}
                        candidateName={profile.fullName}
                        onSaveDraft={handleSaveOfferDraft}
                        onSendOffer={handleSendOffer}
                        isSavingDraft={isSavingDraft}
                        isSendingOffer={isSendingOffer}
                        currentOfferingId={activeOffering?.id}
                        currentOfferingStatus={activeOffering?.status as any}
                        offering={activeOffering || undefined}
                        allOfferings={offeringsList || []}
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
