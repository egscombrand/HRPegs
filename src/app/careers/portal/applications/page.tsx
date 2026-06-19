"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import {
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from "@/firebase";
import {
  collection,
  doc,
  getDoc,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { 
  validateStorageFile, 
  compressImage, 
  handleStorageError 
} from "@/lib/storage-utils";
import type {
  Job,
  JobApplication,
  JobApplicationStatus,
  AssessmentSession,
  Offering,
} from "@/lib/types";
import { getCandidateDisplayStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  format,
  addMonths,
  differenceInMinutes,
  differenceInSeconds,
} from "date-fns";
import { id } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractFileIdFromUrl, openSecureFile } from "@/lib/candidate-docs-utils";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Briefcase,
  Building,
  FileSignature,
  FileUp,
  ClipboardCheck,
  Users,
  Award,
  XCircle,
  BrainCircuit,
  FileText,
  Search,
  Calendar,
  Link as LinkIcon,
  FileClock,
  Loader2,
  Clock,
  Download,
  MapPin,
  Info,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { generateOfferingPDF } from "@/lib/recruitment/pdf-generator";
import { cn } from "@/lib/utils";
import SafeRichText from "@/components/ui/SafeRichText";
import { sendNotification } from "@/lib/notifications";
import { Separator } from "@/components/ui/separator";
import { ORDERED_RECRUITMENT_STAGES } from "@/lib/types";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";

function ApplicationCard({
  application,
  job,
  hasCompletedTest,
  isOpen,
  onToggle,
}: {
  application: JobApplication;
  job?: Job;
  hasCompletedTest: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [now, setNow] = useState(new Date());
  const [isDeciding, setIsDeciding] = React.useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isAcceptConfirmOpen, setIsAcceptConfirmOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Gaji tidak sesuai");
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isNegotiationDialogOpen, setIsNegotiationDialogOpen] = useState(false);
  const [negotiationAreas, setNegotiationAreas] = useState<string[]>([]);
  const [negotiationStartDate, setNegotiationStartDate] = useState("");
  const [negotiationWorkModel, setNegotiationWorkModel] = useState("");
  const [negotiationWorkDays, setNegotiationWorkDays] = useState("");
  const [negotiationWorkTime, setNegotiationWorkTime] = useState("");
  const [negotiationEntryLocation, setNegotiationEntryLocation] = useState("");
  const [negotiationLocation, setNegotiationLocation] = useState("");
  const [negotiationContractDuration, setNegotiationContractDuration] =
    useState<number | null>(null);
  const [negotiationBenefitNotes, setNegotiationBenefitNotes] = useState("");
  const [negotiationScopeNotes, setNegotiationScopeNotes] = useState("");
  const [negotiationOtherNotes, setNegotiationOtherNotes] = useState("");
  const [negotiationReason, setNegotiationReason] = useState("");
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const activeOfferingPointerId =
    application.activeOfferingId || application.currentOfferingId;
  const activeOfferingRef = useMemoFirebase(() => {
    if (!activeOfferingPointerId) return null;
    return doc(firestore, "offerings", activeOfferingPointerId);
  }, [activeOfferingPointerId, firestore]);

  const [activeOffering, setActiveOffering] = useState<Offering | null>(null);
  const [activeOfferingLoading, setActiveOfferingLoading] = useState(false);

  useEffect(() => {
    async function fetchOffering() {
      if (!activeOfferingRef) {
        setActiveOffering(null);
        return;
      }

      setActiveOfferingLoading(true);
      try {
        const snap = await getDoc(activeOfferingRef);
        if (snap.exists()) {
          setActiveOffering({ ...snap.data(), id: snap.id } as Offering);
        } else {
          setActiveOffering(null);
        }
      } catch (err) {
        console.error("Error fetching offering:", err);
      } finally {
        setActiveOfferingLoading(false);
      }
    }

    fetchOffering();
  }, [activeOfferingRef]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeOfferingId =
    activeOffering?.id || activeOfferingPointerId || null;
  const isActuallyLoading = activeOfferingLoading;

  const offerDetails = activeOffering?.offeringDetails || {};
  const offerSalaryLabel =
    application.jobType === "internship" ? "Uang Saku" : "Gaji";
  const offerSalary = offerDetails.salary || "-";
  const offerStartDate = offerDetails.startDate
    ? new Date(offerDetails.startDate)
    : null;
  const offerContractDuration = offerDetails.contractDurationMonths || "-";
  const offerFirstDayTime = offerDetails.firstDayTime || "-";
  const offerFirstDayLocation = offerDetails.firstDayLocation || "-";
  const offerWorkModel = (offerDetails as any)?.workModel || "-";
  const offerJobLocation =
    (offerDetails as any)?.location || offerFirstDayLocation || "-";
  const offerBenefits = (offerDetails as any)?.benefits || "-";
  const offerRoleScope = (offerDetails as any)?.roleScope || "-";
  const offerAdditionalNotes = activeOffering?.additionalNotes || "";
  const offerOtherNotes = offerAdditionalNotes || "-";
  const offerHrContact = offerDetails.hrContact || "-";
  const offerDocumentUrl = activeOffering?.documentUrl;
  const offerDocumentName =
    activeOffering?.documentName ||
    `Offering_${application.jobPosition.replace(/\s+/g, "_")}.pdf`;

  const requestedStartDateLabel = negotiationStartDate
    ? format(new Date(negotiationStartDate), "dd MMMM yyyy", { locale: id })
    : "Belum diisi";
  const requestedWorkModelLabel =
    [
      negotiationWorkModel,
      negotiationWorkDays ? `Hari kerja: ${negotiationWorkDays}` : null,
      negotiationWorkTime ? `Jam kerja: ${negotiationWorkTime}` : null,
      negotiationEntryLocation ? `Lokasi: ${negotiationEntryLocation}` : null,
    ]
      .filter(Boolean)
      .join(" • ") || "Belum diisi";
  const requestedLocationLabel = negotiationLocation || "Belum diisi";
  const requestedContractDurationLabel = negotiationContractDuration
    ? `${negotiationContractDuration} bulan`
    : "Belum diisi";
  const requestedBenefitLabel = negotiationBenefitNotes || "Belum diisi";
  const requestedScopeLabel = negotiationScopeNotes || "Belum diisi";
  const requestedOtherLabel = negotiationOtherNotes || "Belum diisi";

  // Requirement 8: Card is available only if we found an active offering and it is active.
  const activeOfferIsAvailable = !!activeOffering && activeOffering.isActive;

  const parseDateValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value && typeof value.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const offerResponseDeadline = parseDateValue(
    activeOffering?.responseDeadline,
  );
  const secondsLeft = offerResponseDeadline
    ? Math.max(0, differenceInSeconds(offerResponseDeadline, now))
    : null;
  const hasExpired =
    !!offerResponseDeadline && now.getTime() > offerResponseDeadline.getTime();
  const isVeryUrgent =
    secondsLeft !== null && !hasExpired && secondsLeft <= 10 * 60;
  const isUrgent =
    secondsLeft !== null &&
    !hasExpired &&
    secondsLeft <= 60 * 60 &&
    secondsLeft > 10 * 60;
  const isWarning =
    secondsLeft !== null &&
    !hasExpired &&
    secondsLeft <= 24 * 60 * 60 &&
    secondsLeft > 60 * 60;
  const responseDeadlineLabel = offerResponseDeadline
    ? format(offerResponseDeadline, "dd MMMM yyyy HH:mm", { locale: id })
    : "-";
  const countdownParts =
    secondsLeft !== null
      ? {
          days: Math.floor(secondsLeft / 86400),
          hours: Math.floor((secondsLeft % 86400) / 3600),
          minutes: Math.floor((secondsLeft % 3600) / 60),
          seconds: secondsLeft % 60,
        }
      : null;
  const countdownLabel = countdownParts
    ? `${countdownParts.days} hari ${String(countdownParts.hours).padStart(2, "0")} jam ${String(countdownParts.minutes).padStart(2, "0")} menit ${String(countdownParts.seconds).padStart(2, "0")} detik`
    : "-";
  const offerAcceptedStatuses = [
    "accepted",
    "accepted_pending_document",
    "document_uploaded",
  ];
  const offerIsAccepted = offerAcceptedStatuses.includes(
    application.offerStatus || "",
  );

  const candidateOfferStatusLabel = hasExpired
    ? "Expired"
    : application.offerStatus === "accepted"
      ? "Diterima"
      : application.offerStatus === "negotiation_requested"
        ? "Negosiasi Diajukan"
        : application.offerStatus === "offered_final"
          ? "Penawaran Final"
          : application.offerStatus === "negotiation_rejected"
            ? "Negosiasi Ditolak"
            : isVeryUrgent
              ? "Waktu Hampir Habis"
              : isUrgent
                ? "Urgent"
                : isWarning
                  ? "Hampir Habis"
                  : "Menunggu Keputusan";
  const candidateStatusBadgeClass = hasExpired
    ? "border-red-400/30 bg-red-950/60 text-red-100"
    : application.offerStatus === "accepted" ||
        application.offerStatus === "accepted_pending_document" ||
        application.offerStatus === "document_uploaded"
      ? "border-emerald-400/30 bg-emerald-950/60 text-emerald-100"
      : application.offerStatus === "negotiation_requested"
        ? "border-blue-400/30 bg-blue-950/60 text-blue-100"
        : application.offerStatus === "offered_final"
          ? "border-indigo-400/30 bg-indigo-950/60 text-indigo-100"
          : application.offerStatus === "negotiation_rejected"
            ? "border-orange-400/30 bg-orange-950/60 text-orange-100"
            : isVeryUrgent
              ? "border-red-400/30 bg-red-950/60 text-red-100"
              : isUrgent
                ? "border-orange-400/30 bg-orange-950/60 text-orange-100"
                : isWarning
                  ? "border-amber-400/30 bg-amber-950/60 text-amber-100"
                  : "border-slate-500/30 bg-slate-950/70 text-slate-100";
  const isOfferDisabled =
    hasExpired ||
    application.offerStatus === "negotiation_requested" ||
    application.offerStatus === "accepted" ||
    application.offerStatus === "accepted_pending_document" ||
    application.offerStatus === "document_uploaded";
  const offerActionHint = hasExpired
    ? "Penawaran ini sudah lewat batas waktu dan tidak dapat diproses lagi."
    : application.offerStatus === "negotiation_requested"
      ? "Permintaan negosiasi Anda sedang dalam peninjauan Tim HRD. Mohon tunggu informasi selanjutnya."
      : application.offerStatus === "offered_final"
        ? "Ini adalah penawaran final berdasarkan hasil diskusi negosiasi. Silakan berikan keputusan akhir Anda."
        : application.offerStatus === "negotiation_rejected"
          ? "Permintaan diskusi sebelumnya tidak dapat disetujui. Anda dapat melanjutkan dengan penawaran awal ini atau memberikan keputusan penolakan."
          : `Anda memiliki waktu sampai ${responseDeadlineLabel} untuk memberikan keputusan.`;

  const offerContractEndDate =
    offerStartDate && offerDetails.contractDurationMonths
      ? addMonths(
          offerStartDate,
          parseInt(offerDetails.contractDurationMonths, 10),
        )
      : null;

  useEffect(() => {
    if (
      application.status === "offered" &&
      application.offerStatus === "sent" &&
      application.id
    ) {
      const appRef = doc(firestore, "applications", application.id);
      updateDocumentNonBlocking(appRef, {
        offerStatus: "viewed",
        offerViewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(console.error);
    }
  }, [application, firestore]);

  const handleDecision = async (
    decision: "accepted" | "rejected",
    reason?: string,
  ) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login.",
      });
      return;
    }
    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);
      const payload: any = {
        offerStatus:
          decision === "accepted" ? "accepted_pending_document" : decision,
        candidateOfferDecisionAt: serverTimestamp(),
        offerRejectionReason: reason ?? null,
        updatedAt: serverTimestamp(),
      };
      if (decision === "rejected") {
        payload.status = "rejected";
      }
      await updateDocumentNonBlocking(appRef, payload);

      const hrRecipient = application.assignedRecruiterId;
      if (hrRecipient) {
        await sendNotification(firestore, {
          userId: hrRecipient,
          type: "decision",
          module: "recruitment",
          title:
            decision === "accepted"
              ? "Kandidat telah menerima penawaran kerja."
              : "Kandidat menolak penawaran kerja.",
          message:
            decision === "accepted"
              ? "Kandidat telah menerima penawaran kerja."
              : "Kandidat menolak penawaran kerja.",
          targetType: "application",
          targetId: application.id!,
          actionUrl: `/admin/recruitment/applications/${application.id}`,
          createdBy: firebaseUser.uid,
          meta: {
            applicationId: application.id,
            candidateUid: application.candidateUid,
            candidateName: application.candidateName,
          },
        });
      }

      toast({
        title:
          decision === "accepted"
            ? "Persetujuan Awal Tercatat"
            : "Keputusan Tercatat",
        description:
          decision === "accepted"
            ? "Anda telah menyetujui penawaran secara prinsip. Langkah selanjutnya adalah unggah dokumen yang sudah ditandatangani."
            : "Anda telah menolak penawaran ini. Tim HR akan mencatat keputusan Anda dan menindaklanjutinya.",
      });
    } catch (error: any) {
      console.error("Failed to submit decision:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Keputusan",
        description: error.message,
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleNegotiationSubmit = async () => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login.",
      });
      return;
    }

    if (negotiationAreas.length === 0) {
      toast({
        variant: "destructive",
        title: "Pilih Area",
        description: "Pilih setidaknya satu area yang ingin dinegosiasikan.",
      });
      return;
    }

    if (!negotiationReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan Wajib",
        description: "Berikan penjelasan profesional mengenai permintaan Anda.",
      });
      return;
    }

    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);

      const requestedWorkModel = negotiationAreas.includes("sistem_kerja")
        ? [
            negotiationWorkModel,
            negotiationWorkDays ? `Hari kerja: ${negotiationWorkDays}` : null,
            negotiationWorkTime ? `Jam kerja: ${negotiationWorkTime}` : null,
            negotiationEntryLocation
              ? `Lokasi masuk: ${negotiationEntryLocation}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ")
        : null;

      await updateDocumentNonBlocking(appRef, {
        offerStatus: "negotiation_requested" as const,
        candidateNegotiationUsed: true,
        candidateCounterOffer: {
          requestedAreas: negotiationAreas,
          requestedStartDate: negotiationAreas.includes("tanggal_mulai")
            ? negotiationStartDate
            : null,
          requestedWorkModel,
          requestedLocation: negotiationAreas.includes("lokasi")
            ? negotiationLocation
            : null,
          requestedContractDurationMonths: negotiationAreas.includes(
            "durasi_kontrak",
          )
            ? negotiationContractDuration
            : null,
          requestedBenefitNotes: negotiationAreas.includes("benefit")
            ? negotiationBenefitNotes
            : null,
          requestedScopeNotes: negotiationAreas.includes("peran")
            ? negotiationScopeNotes
            : null,
          requestedOtherNotes: negotiationAreas.includes("lainnya")
            ? negotiationOtherNotes
            : null,
          reason: negotiationReason,
          submittedAt: Timestamp.now(),
        },
        updatedAt: serverTimestamp(),
      });

      const hrRecipient = application.assignedRecruiterId;
      if (hrRecipient) {
        await sendNotification(firestore, {
          userId: hrRecipient,
          type: "negotiation",
          module: "recruitment",
          title: "Permintaan Negosiasi Penawaran",
          message: `${application.candidateName} mengajukan diskusi negosiasi untuk penawaran ${application.jobPosition}.`,
          targetType: "application",
          targetId: application.id!,
          actionUrl: `/admin/recruitment/applications/${application.id}`,
          createdBy: firebaseUser.uid,
          meta: {
            applicationId: application.id,
            candidateName: application.candidateName,
          },
        });
      }

      setIsNegotiationDialogOpen(false);
      toast({
        title: "Negosiasi Terkirim",
        description: "Permintaan diskusi Anda telah terkirim ke Tim HRD.",
      });
    } catch (error: any) {
      console.error("Failed to submit negotiation:", error);
      toast({
        variant: "destructive",
        title: "Gagal Mengajukan",
        description: error.message,
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleReturnToOfferReview = async () => {
    if (!firebaseUser || !application.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak dapat mengembalikan ke penawaran saat ini.",
      });
      return;
    }

    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id);
      await updateDocumentNonBlocking(appRef, {
        offerStatus: "viewed",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Kembali ke Penawaran",
        description:
          "Anda sekarang dapat meninjau ulang penawaran sebelum mengunggah dokumen.",
      });
    } catch (error: any) {
      console.error("Failed to return to offer review:", error);
      toast({
        variant: "destructive",
        title: "Gagal Kembali",
        description:
          error?.message ||
          "Terjadi kesalahan saat mengembalikan ke penawaran.",
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleSignedDocumentUpload = async () => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login untuk mengunggah dokumen.",
      });
      return;
    }

    if (!activeOfferingId || !activeOffering) {
      setUploadError("Tidak ada penawaran yang aktif untuk diunggah dokumen.");
      return;
    }

    if (!signedFile) {
      setUploadError("Pilih file dokumen penawaran yang telah ditandatangani.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const validation = validateStorageFile(signedFile);
      if (!validation.isValid) {
        setUploadError(validation.message || 'File tidak valid');
        setIsUploading(false);
        return;
      }
      
      const processedFile = await compressImage(signedFile);
      setUploadProgress(10);
      
      const filePath = `offerings/${activeOfferingId}/signed_documents/${Date.now()}_${processedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      const result = await uploadFile(processedFile, filePath, firebaseUser.uid, {
        category: 'signed_offering',
        ownerUid: firebaseUser.uid,
        applicationId: application.id,
        offeringId: activeOfferingId,
        compress: false // Already compressed
      });

      const signedDocumentUrl = result.webViewLink || result.downloadUrl || "";
      
      const offeringRef = doc(firestore, "offerings", activeOfferingId);
      const appRef = doc(firestore, "applications", application.id!);
      await updateDocumentNonBlocking(appRef, {
        offerStatus: "document_uploaded",
        signedOfferUrl: signedDocumentUrl,
        signedOfferFileName: signedFile.name,
        offerDocumentStatus: "pending_verification",
        candidateOfferDocumentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSignedFile(null);
      setUploadProgress(100);

      toast({
        title: "Dokumen Terkirim",
        description:
          "Dokumen penawaran telah dikirim ke Google Drive. Tim HRD akan memverifikasi segera.",
      });
    } catch (error: any) {
      console.error("Upload signed document failed:", error);
      setUploadError(error?.message || "Gagal mengunggah dokumen.");
      toast({
        variant: "destructive",
        title: "Unggah Gagal",
        description:
          error?.message || "Terjadi kesalahan saat mengunggah dokumen ke Google Drive.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatSalary = (value: number | undefined | null) => {
    if (value === undefined || value === null) return "-";
    return `Rp ${value.toLocaleString("id-ID")}`;
  };

  const formatSalaryInput = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return `Rp ${parseInt(digits, 10).toLocaleString("id-ID")}`;
  };

  const scheduledInterview = useMemo(() => {
    if (!application.interviews || application.interviews.length === 0)
      return null;
    const now = new Date().getTime();
    const scheduledInterviews = application.interviews.filter(
      (i) => i.status === "scheduled",
    );
    if (scheduledInterviews.length === 0) return null;

    const upcoming = scheduledInterviews
      .filter((i) => i.startAt.toDate().getTime() >= now)
      .sort(
        (a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime(),
      );

    if (upcoming.length > 0) return upcoming[0];

    const past = scheduledInterviews
      .filter((i) => i.startAt.toDate().getTime() < now)
      .sort(
        (a, b) => b.startAt.toDate().getTime() - a.startAt.toDate().getTime(),
      );

    if (past.length > 0) return past[0];

    return null;
  }, [application.interviews]);

  // HRD internal negative post-interview decision — candidate must NOT see this.
  // Old code used to set application.status="rejected" when HRD chose "tidak_lanjut";
  // detect by the decision field so the portal freezes at "Evaluasi Setelah Wawancara".
  // Pre-interview "tidak_dilanjutkan_saat_ini"/"pending_internal" never changes
  // application.status, so we only guard the "rejected" edge case there.
  const isHRDInternalRejection =
    application.postInterviewDecision?.status === "tidak_lanjut" ||
    (["tidak_dilanjutkan_saat_ini", "pending_internal"].includes(
      application.recruitmentInternalDecision?.status ?? ""
    ) &&
      application.status === "rejected");

  // Only surface "Proses Selesai" to candidates who rejected an offer themselves.
  const isRejected = application.status === "rejected" && !isHRDInternalRejection;

  const isHired =
    application.status === "hired" &&
    application.internalAccessEnabled === true;
  const isOffered = application.status === "offered";
  // Include the HRD-internally-rejected case so we fall into the interview display path.
  const isInterviewStage = application.status === "interview" || isHRDInternalRejection;
  const isAssessmentStage = application.status === "tes_kepribadian";
  const isProcessing = [
    "submitted",
    "screening",
    "verification",
    "document_submission",
  ].includes(application.status);
  const hasFinalPositive = application.candidateStatus === "lolos";

  // True when the interview is physically complete from the candidate's viewpoint.
  // Internal "tidak_lanjut" decision always triggers this so the candidate sees the
  // neutral "Menunggu Keputusan Akhir" state rather than an active interview card.
  // Note: !!postInterviewDecision alone is intentionally NOT used — only "lanjut" or
  // an explicit internal rejection should transition this flag.
  const isInterviewActuallyDone =
    isHRDInternalRejection ||
    application.interviewCompleted === true ||
    !!application.interviewCompletedAt ||
    !!application.interviewCompletionSource ||
    (application.postInterviewEvaluation?.submissions ?? 0) > 0 ||
    application.postInterviewDecision?.status === "lanjut";

  // Status shown to candidate — uses helper that never exposes HRD internal decisions
  const displayStatus = useMemo(
    () => getCandidateDisplayStatus(application),
    [application],
  );

  if (isOffered) {
    const salaryLabel =
      application.jobType === "internship" ? "Uang Saku" : "Gaji";
    const renderMissingOfferDetails = () => (
      <Card className="flex flex-col border-primary/50">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl">
                Penawaran Kerja: {application.jobPosition}
              </CardTitle>
              <CardDescription>
                Detail penawaran untuk posisi ini sedang disiapkan oleh Tim HRD.
                Mohon tunggu sampai detail penawaran dipublikasikan untuk Anda.
              </CardDescription>
            </div>
            <Badge className="w-fit bg-slate-500/80">
              Menyiapkan Penawaran
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="rounded-lg border border-muted/70 bg-muted/50 p-4 text-sm">
            <p>
              Detail penawaran saat ini tidak dapat ditampilkan karena penawaran
              aktif belum ditemukan atau belum diaktifkan.
            </p>
          </div>
        </CardContent>
      </Card>
    );

    if (
      application.offerStatus === "sent" ||
      application.offerStatus === "viewed" ||
      application.offerStatus === "negotiation_requested" ||
      application.offerStatus === "negotiation_rejected" ||
      application.offerStatus === "offered_final" ||
      !application.offerStatus
    ) {
      if (isActuallyLoading) {
        return (
          <Card className="flex flex-col border-primary/20 animate-pulse">
            <CardHeader>
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        );
      }

      if (!activeOfferIsAvailable) {
        return renderMissingOfferDetails();
      }

      const offerStatusLabel = hasExpired
        ? "Kedaluwarsa"
        : application.offerStatus === "viewed"
          ? "Sudah Dilihat"
          : "Baru";

      const offerViewStatus = activeOffering?.viewCount
        ? `Dibuka ${activeOffering.viewCount} kali`
        : "Belum dibuka";

      const offerFirstViewed = parseDateValue(activeOffering?.viewedAtFirst);
      const offerLastViewed = parseDateValue(activeOffering?.viewedAtLast);

      const offerViewSubtitle = activeOffering?.viewCount
        ? "Penawaran ini telah Anda akses."
        : "Anda belum membuka detail penawaran ini.";

      return (
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">
                  Penawaran Kerja: {application.jobPosition}
                </CardTitle>
                <CardDescription>
                  Berdasarkan hasil seleksi Anda, kami mengirimkan penawaran
                  kerja resmi untuk posisi ini. Mohon baca dokumen penawaran
                  dengan teliti dan ambil keputusan sebelum batas waktu.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2">
                <Badge
                  className={cn(
                    "w-fit",
                    hasExpired
                      ? "bg-red-600"
                      : application.offerStatus === "viewed"
                        ? "bg-blue-600"
                        : "bg-primary/80",
                  )}
                >
                  {offerStatusLabel}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {secondsLeft !== null && (
              <div
                className={cn(
                  "rounded-3xl border p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.75)] backdrop-blur-xl",
                  hasExpired
                    ? "border-red-500/30 bg-red-950/70 text-red-100"
                    : isVeryUrgent
                      ? "border-red-500/30 bg-red-950/70 text-red-100"
                      : isUrgent
                        ? "border-orange-500/30 bg-orange-950/70 text-orange-100"
                        : isWarning
                          ? "border-amber-500/30 bg-amber-950/70 text-amber-100"
                          : "border-slate-700/60 bg-slate-950/80 text-slate-100",
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Hitung Mundur Respons
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {countdownLabel}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "w-fit rounded-full px-3 py-1 text-sm border backdrop-blur-md bg-white/10 shadow-sm",
                      candidateStatusBadgeClass,
                    )}
                  >
                    {candidateOfferStatusLabel}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-400">{offerActionHint}</p>
                {isVeryUrgent ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-950/60 px-4 py-3 text-sm font-semibold text-red-100 shadow-sm animate-pulse">
                    Waktu Hampir Habis — segera ambil keputusan sebelum
                    penawaran kedaluwarsa.
                  </div>
                ) : isUrgent ? (
                  <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-950/60 px-4 py-3 text-sm font-semibold text-orange-100 shadow-sm">
                    Waktu tersisa kurang dari 1 jam.
                  </div>
                ) : isWarning ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-950/60 px-4 py-3 text-sm font-semibold text-amber-100 shadow-sm">
                    Penawaran hampir habis dalam 24 jam.
                  </div>
                ) : null}
              </div>
            )}

            {application.offerStatus === "negotiation_rejected" &&
              application.candidateNegotiationResponse && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-full bg-orange-100 p-2 shadow-sm">
                      <Clock className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-orange-950 uppercase tracking-wider">
                        Negosiasi Tidak Dapat Disetujui
                      </p>
                      <div className="mt-2 text-sm text-orange-800 bg-white/40 p-3 rounded-xl border border-orange-200/50">
                        {application.candidateNegotiationResponse.note}
                      </div>
                      <p className="mt-3 text-[10px] font-black uppercase text-orange-500/80">
                        — Tim HRD •{" "}
                        {format(
                          application.candidateNegotiationResponse.respondedAt.toDate(),
                          "dd MMM yyyy",
                          { locale: id },
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            <div className="grid gap-6 lg:grid-cols-[0.95fr_0.85fr]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-muted/70 bg-background p-5">
                  <p className="text-sm font-semibold text-foreground">
                    Dokumen Penawaran
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Buka dokumen resmi atau unduh file untuk melihat semua
                    detail lengkap yang harus Anda tinjau.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        if (offerDocumentUrl) {
                          const fileId = extractFileIdFromUrl(offerDocumentUrl);
                          openSecureFile(fileId, offerDocumentName || "Offering.pdf");
                        } else if (offerAdditionalNotes) {
                          generateOfferingPDF(
                            offerAdditionalNotes,
                            offerDocumentName,
                          );
                        }
                      }}
                    >
                      <FileSignature className="mr-2 h-4 w-4" /> Preview
                      Offering
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        if (offerDocumentUrl) {
                          const fileId = extractFileIdFromUrl(offerDocumentUrl);
                          openSecureFile(fileId, offerDocumentName || "Offering.pdf");
                        } else {
                          generateOfferingPDF(
                            offerAdditionalNotes,
                            offerDocumentName,
                          );
                        }
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
                  </div>
                </div>

                <div className="rounded-3xl border border-muted/70 bg-slate-50/80 dark:bg-slate-950/80 p-5">
                  <p className="text-sm font-semibold text-foreground">
                    Informasi Penting
                  </p>
                  <ul className="mt-4 list-disc space-y-3 pl-5 text-sm text-slate-900 dark:text-slate-100">
                    <li>
                      Pastikan Anda telah membaca dokumen penawaran sebelum
                      mengambil keputusan.
                    </li>
                    <li>
                      Keputusan diterima atau ditolak akan memengaruhi proses
                      rekrutmen selanjutnya.
                    </li>
                    <li>
                      Jika Anda menerima, silakan lanjutkan ke pengumpulan
                      dokumen onboarding.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-muted/70 bg-muted/50 p-5">
                  <p className="text-sm font-semibold text-foreground">
                    Ringkasan Penawaran
                  </p>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">{salaryLabel}</p>
                      <p className="font-semibold">{offerSalary} / bulan</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Durasi Kontrak</p>
                      <p className="font-semibold">
                        {offerContractDuration} bulan
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tanggal Mulai</p>
                      <p className="font-semibold">
                        {offerStartDate
                          ? format(offerStartDate, "dd MMMM yyyy", {
                              locale: id,
                            })
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tanggal Selesai</p>
                      <p className="font-semibold">
                        {offerContractEndDate
                          ? format(offerContractEndDate, "dd MMMM yyyy", {
                              locale: id,
                            })
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Hari Pertama</p>
                      <p className="font-semibold">
                        {offerFirstDayTime || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        Lokasi Hari Pertama
                      </p>
                      <p className="font-semibold">
                        {offerFirstDayLocation || "-"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground">Kontak HRD</p>
                      <p className="font-semibold">{offerHrContact || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-muted/70 bg-background p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-foreground">
                      Detail Penawaran
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {offerAdditionalNotes
                        ? "Ringkas"
                        : "Tidak ada informasi tambahan"}
                    </p>
                  </div>
                  <details className="mt-4 rounded-3xl border border-muted/80 bg-slate-50/60 p-4 text-sm text-slate-700 dark:bg-slate-950/80 dark:text-slate-300">
                    <summary className="cursor-pointer font-semibold">
                      Lihat Selengkapnya
                    </summary>
                    <div className="mt-3 space-y-3">
                      <SafeRichText
                        html={
                          offerAdditionalNotes ||
                          "Tidak ada informasi penawaran tambahan."
                        }
                      />
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => setIsRejectDialogOpen(true)}
                disabled={isDeciding || isOfferDisabled}
                className="w-full sm:w-auto"
              >
                Tolak Penawaran
              </Button>
              {application.offerStatus !== "negotiation_requested" &&
                !application.candidateNegotiationUsed && (
                  <Button
                    variant="outline"
                    onClick={() => setIsNegotiationDialogOpen(true)}
                    disabled={isDeciding || isOfferDisabled}
                    className="w-full sm:w-auto border-blue-200 hover:border-blue-400 hover:bg-blue-50/50"
                  >
                    Ajukan Negosiasi
                  </Button>
                )}
            </div>
            <Button
              onClick={() => setIsAcceptConfirmOpen(true)}
              disabled={isDeciding || isOfferDisabled}
              className="w-full sm:w-auto"
            >
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Setujui & Lanjutkan
            </Button>
          </CardFooter>

          <Dialog
            open={isAcceptConfirmOpen}
            onOpenChange={setIsAcceptConfirmOpen}
          >
            <DialogContent className="w-full max-w-2xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle>Konfirmasi Persetujuan Penawaran</DialogTitle>
                <DialogDescription>
                  Silakan tinjau kembali ringkasan ini agar status dan langkah
                  berikutnya jelas sebelum melanjutkan.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-8 sm:py-6 space-y-6">
                <section className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Konteks Penawaran
                  </p>
                  <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    <p>
                      Penawaran ini diberikan untuk posisi{" "}
                      <strong>{application.jobPosition}</strong> di{" "}
                      <strong>{application.brandName}</strong>.
                    </p>
                    <p>
                      Penawaran diterbitkan berdasarkan hasil seleksi dan
                      kesepakatan tim rekrutmen.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Arti Persetujuan
                  </p>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
                    <li>Anda menyetujui penawaran ini secara prinsip.</li>
                    <li>
                      Ini bukan titik akhir; masih ada langkah administrasi
                      lanjutan.
                    </li>
                    <li>
                      Setelah menyetujui, Anda harus mengunggah dokumen yang
                      sudah ditandatangani.
                    </li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Apa yang terjadi setelah ini
                  </p>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
                    <li>
                      Status akan berubah menjadi{" "}
                      <strong>Menunggu Upload Dokumen</strong>.
                    </li>
                    <li>
                      Anda akan diminta untuk mengunggah dokumen penawaran yang
                      sudah ditandatangani.
                    </li>
                    <li>
                      HRD akan memverifikasi dokumen setelah upload selesai.
                    </li>
                    <li>
                      Proses baru selesai setelah dokumen diverifikasi oleh HRD.
                    </li>
                  </ul>
                </section>
              </div>
              <DialogFooter className="border-t px-6 py-4 sm:px-8 bg-background">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsAcceptConfirmOpen(false)}
                  disabled={isDeciding}
                >
                  Tinjau Kembali
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    setIsAcceptConfirmOpen(false);
                    await handleDecision("accepted");
                  }}
                  disabled={isDeciding}
                >
                  {isDeciding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Ya, Saya Setuju &amp; Lanjutkan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isRejectDialogOpen}
            onOpenChange={setIsRejectDialogOpen}
          >
            <DialogContent className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tolak Penawaran</DialogTitle>
                <DialogDescription>
                  Pilih satu alasan utama untuk penolakan, lalu jelaskan
                  pertimbangan Anda secara profesional agar tim HR dapat
                  memahami keputusan ini.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-8 p-6 sm:p-8">
                <div className="rounded-3xl border border-slate-700/80 bg-slate-950/90 p-6 shadow-xl shadow-slate-950/40">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        Alasan / Pertimbangan Penolakan
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Pilih satu alasan utama dan lengkapi dengan penjelasan
                        profesional sesuai pilihan Anda.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        "Kompensasi dan paket belum sesuai",
                        "Lokasi atau model kerja tidak cocok",
                        "Kesempatan lain lebih sesuai dengan rencana saya",
                        "Jadwal mulai tidak selaras dengan situasi saya",
                        "Ruang lingkup peran tidak sejalan dengan keahlian saya",
                        "Kesesuaian peran belum sesuai dengan harapan",
                        "Benefit dan fasilitas belum memenuhi kebutuhan",
                        "Saya membutuhkan pertimbangan pribadi lebih lanjut",
                        "Perubahan rencana pribadi",
                        "Alasan lain",
                      ].map((option) => (
                        <button
                          type="button"
                          key={option}
                          onClick={() => setRejectReason(option)}
                          className={cn(
                            "text-left rounded-3xl border px-5 py-4 transition duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500/50",
                            rejectReason === option
                              ? "border-slate-400/80 bg-slate-900/80 shadow-[0_15px_35px_-25px_rgba(15,23,42,0.85)]"
                              : "border-slate-700/80 bg-slate-950/80 hover:border-slate-500/70 hover:bg-slate-900/80",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-100">
                              {option}
                            </p>
                            {rejectReason === option ? (
                              <span className="rounded-full border border-slate-400/50 bg-slate-800/90 px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-100">
                                Dipilih
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-400">
                    Masukan Anda membantu tim HR memahami pertimbangan kandidat
                    dengan lebih baik.
                  </p>
                </div>

                {rejectReason ? (
                  <div className="rounded-3xl border border-slate-700/80 bg-slate-950/90 p-5">
                    <label className="text-sm font-semibold text-slate-100">
                      Penjelasan Wajib
                    </label>
                    <p className="mt-2 text-sm text-slate-400">
                      {rejectReason === "Kompensasi dan paket belum sesuai" ||
                      rejectReason ===
                        "Benefit dan fasilitas belum memenuhi kebutuhan"
                        ? "Jelaskan bagian kompensasi atau benefit yang menurut Anda belum sesuai, serta faktor lain yang memengaruhi keputusan Anda."
                        : "Jelaskan secara profesional alasan utama Anda memilih penolakan ini."}
                    </p>
                    <Textarea
                      value={customRejectReason}
                      onChange={(event) =>
                        setCustomRejectReason(event.target.value)
                      }
                      placeholder={
                        rejectReason === "Kompensasi dan paket belum sesuai"
                          ? "Misalnya: gaji yang diharapkan, benefit tambahan, atau paket kompensasi ideal"
                          : rejectReason ===
                              "Benefit dan fasilitas belum memenuhi kebutuhan"
                            ? "Misalnya: fasilitas yang dibutuhkan atau benefit yang menurut Anda kurang"
                            : "Jelaskan pertimbangan utama Anda secara profesional"
                      }
                      rows={5}
                      className="mt-3 bg-slate-950/90 text-slate-100 placeholder:text-slate-600"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Mohon jelaskan pertimbangan Anda secara profesional agar
                      tim HR dapat memahami keputusan Anda.
                    </p>
                  </div>
                ) : null}

                <div className="rounded-3xl border border-slate-700/80 bg-slate-950/90 p-5">
                  <label className="text-sm font-semibold text-slate-100">
                    Catatan Tambahan (opsional)
                  </label>
                  <p className="mt-2 text-sm text-slate-400">
                    Jika ada detail lain yang perlu disampaikan, tuliskan di
                    sini.
                  </p>
                  <Textarea
                    value={rejectionNotes}
                    onChange={(event) => setRejectionNotes(event.target.value)}
                    placeholder="Tambahkan catatan singkat kepada HRD"
                    rows={4}
                    className="mt-3 bg-slate-950/90 text-slate-100 placeholder:text-slate-600"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsRejectDialogOpen(false)}
                  disabled={isDeciding}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const finalReason =
                      rejectReason === "Alasan lain"
                        ? customRejectReason.trim() || rejectReason
                        : rejectReason;
                    handleDecision(
                      "rejected",
                      `${finalReason}${rejectionNotes.trim() ? `: ${rejectionNotes.trim()}` : ""}`,
                    );
                  }}
                  disabled={
                    isDeciding ||
                    !rejectReason ||
                    customRejectReason.trim().length === 0
                  }
                >
                  {isDeciding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Konfirmasi Tolak
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isNegotiationDialogOpen}
            onOpenChange={setIsNegotiationDialogOpen}
          >
            <DialogContent className="w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-3xl">
                  Ajukan Diskusi Penawaran
                </DialogTitle>
                <DialogDescription className="mt-2 text-base leading-7 text-slate-400">
                  Ajukan permintaan dengan konteks yang jelas agar HRD dapat
                  memahami kebutuhan Anda dan menyiapkan respons yang tepat.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">Fokus diskusi</p>
                  <p className="mt-2 text-slate-400">
                    Pilih area yang ingin Anda bahas agar HRD dapat merespons
                    dengan cepat dan relevan.
                  </p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-300">
                    <li>Tanggal mulai</li>
                    <li>Sistem kerja dan jadwal kerja</li>
                    <li>Lokasi kerja / penempatan</li>
                    <li>Durasi kontrak</li>
                    <li>Benefit / fasilitas</li>
                    <li>Lingkup peran</li>
                    <li>Lainnya</li>
                  </ul>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        Ringkas Perbandingan
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        Bandingkan penawaran saat ini dengan permintaan Anda
                        untuk area yang dipilih sebelum mengirim permintaan.
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-400">
                      {negotiationAreas.length} area dipilih
                    </span>
                  </div>
                  <div className="mt-5 grid gap-4">
                    {negotiationAreas.length === 0 ? (
                      <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-4 text-sm text-slate-400">
                        Pilih area diskusi terlebih dahulu untuk melihat
                        pembanding isi penawaran saat ini dan permintaan Anda.
                      </div>
                    ) : (
                      negotiationAreas.map((area) => {
                        const label =
                          area === "tanggal_mulai"
                            ? "Tanggal Mulai"
                            : area === "sistem_kerja"
                              ? "Sistem Kerja"
                              : area === "lokasi"
                                ? "Lokasi Kerja / Penempatan"
                                : area === "durasi_kontrak"
                                  ? "Durasi Kontrak"
                                  : area === "benefit"
                                    ? "Benefit / Fasilitas"
                                    : area === "peran"
                                      ? "Lingkup Peran"
                                      : "Lainnya";
                        const currentValue =
                          area === "tanggal_mulai"
                            ? offerStartDate
                              ? format(offerStartDate, "dd MMMM yyyy", {
                                  locale: id,
                                })
                              : "-"
                            : area === "sistem_kerja"
                              ? offerWorkModel
                              : area === "lokasi"
                                ? offerJobLocation
                                : area === "durasi_kontrak"
                                  ? `${offerContractDuration} bulan`
                                  : area === "benefit"
                                    ? offerBenefits
                                    : area === "peran"
                                      ? offerRoleScope
                                      : offerOtherNotes;
                        const requestedValue =
                          area === "tanggal_mulai"
                            ? requestedStartDateLabel
                            : area === "sistem_kerja"
                              ? requestedWorkModelLabel
                              : area === "lokasi"
                                ? requestedLocationLabel
                                : area === "durasi_kontrak"
                                  ? requestedContractDurationLabel
                                  : area === "benefit"
                                    ? requestedBenefitLabel
                                    : area === "peran"
                                      ? requestedScopeLabel
                                      : requestedOtherLabel;
                        return (
                          <div
                            key={area}
                            className="grid gap-4 lg:grid-cols-[1fr_1fr]"
                          >
                            <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-4">
                              <p className="text-sm font-semibold text-slate-100">
                                {label}
                              </p>
                              <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                                Saat ini
                              </p>
                              <p className="mt-3 min-h-[52px] text-sm font-semibold text-white">
                                {currentValue}
                              </p>
                            </div>
                            <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-4">
                              <p className="text-sm font-semibold text-slate-100">
                                Permintaan Anda
                              </p>
                              <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                                Isi sesuai kebutuhan Anda
                              </p>
                              <p className="mt-3 min-h-[52px] text-sm font-semibold text-white">
                                {requestedValue}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      Area yang ingin didiskusikan
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      Pilih area yang paling penting bagi kebutuhan kerja Anda.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { id: "tanggal_mulai", label: "Tanggal Mulai" },
                      { id: "sistem_kerja", label: "Sistem Kerja" },
                      { id: "lokasi", label: "Lokasi Kerja / Penempatan" },
                      { id: "durasi_kontrak", label: "Durasi Kontrak" },
                      { id: "benefit", label: "Benefit / Fasilitas" },
                      { id: "peran", label: "Lingkup Peran" },
                      { id: "lainnya", label: "Lainnya" },
                    ].map((area) => (
                      <label
                        key={area.id}
                        htmlFor={`area-${area.id}`}
                        className="flex cursor-pointer items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm transition hover:border-slate-700"
                      >
                        <input
                          type="checkbox"
                          id={`area-${area.id}`}
                          checked={negotiationAreas.includes(area.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNegotiationAreas([
                                ...negotiationAreas,
                                area.id,
                              ]);
                            } else {
                              setNegotiationAreas(
                                negotiationAreas.filter((a) => a !== area.id),
                              );
                            }
                          }}
                          className="h-4 w-4 accent-slate-400 text-slate-100"
                        />
                        <span className="text-slate-100">{area.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  {negotiationAreas.includes("tanggal_mulai") && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-100">
                        Usulan Tanggal Mulai
                      </label>
                      <Input
                        type="date"
                        value={negotiationStartDate}
                        onChange={(e) =>
                          setNegotiationStartDate(e.target.value)
                        }
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("sistem_kerja") && (
                    <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          Sistem Kerja
                        </p>
                        <p className="text-sm text-slate-400 mt-1">
                          Sebutkan model kerja, hari kerja, jam masuk, dan
                          lokasi masuk / penempatan jika perlu.
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-100">
                            Model Kerja
                          </label>
                          <select
                            className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-600"
                            value={negotiationWorkModel}
                            onChange={(e) =>
                              setNegotiationWorkModel(e.target.value)
                            }
                          >
                            <option value="" className="text-slate-500">
                              Pilih sistem kerja
                            </option>
                            <option value="Onsite">Onsite</option>
                            <option value="Hybrid">Hybrid</option>
                            <option value="Remote">Remote</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-100">
                            Hari Kerja
                          </label>
                          <Input
                            placeholder="Contoh: Senin - Jumat"
                            value={negotiationWorkDays}
                            onChange={(e) =>
                              setNegotiationWorkDays(e.target.value)
                            }
                            className="bg-slate-950 border-slate-800 text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-100">
                            Jam Kerja
                          </label>
                          <Input
                            placeholder="Contoh: 09:00 - 18:00"
                            value={negotiationWorkTime}
                            onChange={(e) =>
                              setNegotiationWorkTime(e.target.value)
                            }
                            className="bg-slate-950 border-slate-800 text-slate-100"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-100">
                            Lokasi Masuk / Penempatan
                          </label>
                          <Input
                            placeholder="Contoh: Kantor pusat / remote sepenuhnya"
                            value={negotiationEntryLocation}
                            onChange={(e) =>
                              setNegotiationEntryLocation(e.target.value)
                            }
                            className="bg-slate-950 border-slate-800 text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {negotiationAreas.includes("lokasi") && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-100">
                        Lokasi Kerja / Penempatan
                      </label>
                      <Input
                        placeholder="Contoh: Jakarta Selatan / Remote"
                        value={negotiationLocation}
                        onChange={(e) => setNegotiationLocation(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("durasi_kontrak") && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-100">
                        Durasi Kontrak (bulan)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Contoh: 12"
                        value={negotiationContractDuration || ""}
                        onChange={(e) =>
                          setNegotiationContractDuration(
                            e.target.value ? parseInt(e.target.value) : null,
                          )
                        }
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("benefit") && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-100">
                        Benefit / Fasilitas
                      </label>
                      <Textarea
                        placeholder="Jelaskan benefit atau fasilitas yang penting bagi Anda"
                        value={negotiationBenefitNotes}
                        onChange={(e) =>
                          setNegotiationBenefitNotes(e.target.value)
                        }
                        className="min-h-[120px] bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("peran") && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-100">
                        Lingkup Peran
                      </label>
                      <Textarea
                        placeholder="Jelaskan penyesuaian tugas atau tanggung jawab yang Anda harapkan"
                        value={negotiationScopeNotes}
                        onChange={(e) =>
                          setNegotiationScopeNotes(e.target.value)
                        }
                        className="min-h-[120px] bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("lainnya") && (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-100">
                        Lainnya
                      </label>
                      <Textarea
                        placeholder="Sebutkan hal lain yang ingin Anda diskusikan"
                        value={negotiationOtherNotes}
                        onChange={(e) =>
                          setNegotiationOtherNotes(e.target.value)
                        }
                        className="min-h-[120px] bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-100">
                      Alasan & Penjelasan Profesional (Wajib)
                    </label>
                    <Textarea
                      placeholder="Jelaskan mengapa area ini penting bagi Anda dan bagaimana ini mendukung kesiapan kerja Anda"
                      value={negotiationReason}
                      onChange={(e) => setNegotiationReason(e.target.value)}
                      className="min-h-[140px] bg-slate-950 border-slate-800 text-slate-100"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="border-t border-slate-800 bg-slate-950/90 px-6 py-4">
                <Button
                  variant="ghost"
                  onClick={() => setIsNegotiationDialogOpen(false)}
                  disabled={isDeciding}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleNegotiationSubmit}
                  disabled={
                    isDeciding ||
                    negotiationAreas.length === 0 ||
                    !negotiationReason.trim()
                  }
                  className="py-3"
                >
                  {isDeciding && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Kirim Permintaan Diskusi
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      );
    }

    if (
      application.offerStatus === "accepted" ||
      application.offerStatus === "accepted_pending_document" ||
      application.offerStatus === "document_uploaded"
    ) {
      const isDocumentUploaded = !!activeOffering?.signedDocumentUrl;
      const showReturnToOfferButton =
        application.offerStatus === "accepted_pending_document" &&
        !isDocumentUploaded;
      const documentStatus = activeOffering?.signedDocumentStatus;
      const currentStatusLabel = isDocumentUploaded
        ? documentStatus === "pending_verification"
          ? "Menunggu Verifikasi HRD"
          : documentStatus === "verified"
            ? "Dokumen Sudah Diverifikasi"
            : documentStatus === "rejected"
              ? "Dokumen Ditolak, unggah ulang"
              : "Dokumen telah diunggah"
        : "Menunggu Upload Dokumen";
      const statusDetails = isDocumentUploaded
        ? documentStatus === "pending_verification"
          ? "Dokumen Anda telah dikirim dan sedang diverifikasi oleh tim HRD. Tunggu konfirmasi selanjutnya."
          : documentStatus === "verified"
            ? "Dokumen Anda sudah diverifikasi. Proses penawaran telah selesai."
            : documentStatus === "rejected"
              ? "Dokumen sebelumnya tidak lolos verifikasi. Silakan unggah kembali setelah Anda memperbaiki tanda tangan atau isi dokumen."
              : "Dokumen telah diunggah. Tim HRD akan segera memeriksa dokumen tersebut."
        : "Dokumen penawaran belum diunggah. Silakan download, tanda tangani, lalu upload kembali ke portal.";

      return (
        <Card className="flex flex-col bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl text-blue-800 dark:text-blue-200">
                  {application.jobPosition}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 pt-1 text-blue-700 dark:text-blue-300">
                  <Building className="h-4 w-4" /> {application.brandName}
                </CardDescription>
              </div>
              <Badge className="w-fit bg-blue-600 hover:bg-blue-700">
                {currentStatusLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <div className="p-4 rounded-md border border-blue-500/20 bg-slate-950 text-blue-100">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-white">
                <FileClock className="h-5 w-5 text-blue-300" /> Anda telah
                menyetujui penawaran ini secara prinsip.
              </h3>
              <p className="text-sm text-slate-300">
                Penerimaan ini belum final sampai dokumen penawaran
                ditandatangani dan diunggah kembali ke portal. Setelah itu, tim
                HRD akan memverifikasi dokumen Anda.
              </p>
            </div>
            <div className="rounded-3xl border border-blue-500/20 bg-slate-900 p-5 shadow-sm space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-blue-300">
                  Status Saat Ini
                </p>
                <p className="text-base font-semibold text-white">
                  {currentStatusLabel}
                </p>
                <p className="text-sm text-slate-300">{statusDetails}</p>
              </div>
              <div className="rounded-2xl border border-blue-500/20 bg-slate-800 p-4 text-slate-300">
                <p className="text-sm font-semibold text-blue-300">
                  Langkah Selanjutnya
                </p>
                <ul className="mt-3 space-y-3 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <Check className="mt-1 h-4 w-4 text-emerald-500" />
                    <span>
                      <strong>Penawaran Disetujui.</strong> Ini adalah
                      persetujuan awal secara prinsip.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-slate-100">
                      2
                    </span>
                    <span>
                      Upload dokumen penawaran yang sudah Anda tanda tangani.
                      (Sebelumnya download dan tanda tangan dokumen.)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-slate-100">
                      3
                    </span>
                    <span>Verifikasi HRD setelah dokumen diunggah.</span>
                  </li>
                </ul>
              </div>
              <div className="grid gap-3">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-white">
                    File Dokumen Penawaran
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) => {
                      setUploadError(null);
                      setSignedFile(event.target.files?.[0] || null);
                    }}
                    disabled={isUploading}
                    className="file:border-0 file:bg-blue-600 file:text-white file:px-4 file:py-2 file:rounded-md file:font-medium file:hover:bg-blue-700"
                  />
                </label>
                {uploadError ? (
                  <p className="text-sm text-red-500">{uploadError}</p>
                ) : null}
                {isUploading ? (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Mengunggah {uploadProgress}%
                    </p>
                  </div>
                ) : null}
                {isDocumentUploaded && activeOffering?.signedDocumentName ? (
                  <div className="rounded-2xl border border-blue-500/20 bg-slate-800 p-4 text-sm text-slate-300">
                    <p className="font-semibold text-white">
                      Dokumen tersimpan:
                    </p>
                    <p>{activeOffering.signedDocumentName}</p>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Button
                    type="button"
                    onClick={handleSignedDocumentUpload}
                    disabled={isUploading || !signedFile}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    {isUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {isDocumentUploaded
                      ? "Unggah Ulang Dokumen"
                      : "Kirim Dokumen"}
                  </Button>
                  {showReturnToOfferButton ? (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={handleReturnToOfferReview}
                      disabled={isDeciding || isUploading}
                      className="border border-slate-700 bg-slate-950/70 text-slate-100 hover:bg-slate-900"
                    >
                      Kembali ke Penawaran
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="p-8 text-center border-dashed">
        <CardContent className="space-y-4 pt-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <FileClock className="text-muted-foreground h-6 w-6" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-lg">Penawaran Kerja</CardTitle>
            <CardDescription>
              Saat ini belum ada penawaran kerja aktif.
            </CardDescription>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isHired) {
    return (
      <Card className="flex flex-col bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl text-green-800 dark:text-green-200">
                {application.jobPosition}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 pt-1 text-green-700 dark:text-green-300">
                <Building className="h-4 w-4" /> {application.brandName}
              </CardDescription>
            </div>
            <Badge className="w-fit bg-green-600 hover:bg-green-700">
              Akun Diaktifkan
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-4">
          <div className="p-4 rounded-md border-dashed border-green-400 bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Award className="h-5 w-5" /> Selamat! Anda sekarang adalah bagian
              dari tim.
            </h3>
            <p className="text-sm">
              Akun Anda telah diaktifkan. Silakan logout, kemudian login kembali
              melalui Portal Karyawan untuk mengakses dasbor internal Anda.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-green-100/50 dark:bg-green-900/20 p-4 border-t border-green-200 dark:border-green-800 flex justify-end">
          <Button asChild>
            <Link href="/admin/login">
              Ke Portal Karyawan <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isAssessmentStage) {
    // If candidate already completed the test globally, don't ask them to re-test
    if (hasCompletedTest || application.personalityTestCompleted) {
      // Show "awaiting review" — the test result will be applied automatically
      return (
        <Card className="flex flex-col border-teal-200 dark:border-teal-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">{application.jobPosition}</CardTitle>
                <CardDescription>{application.brandName}</CardDescription>
              </div>
              <Badge className="w-fit bg-teal-600 text-white">Dalam Evaluasi</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <div className="p-4 rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-900/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-teal-800 dark:text-teal-200">
                    Tes Kepribadian: Selesai
                  </h3>
                  <p className="text-sm text-teal-700 dark:text-teal-300 leading-relaxed">
                    Lamaran Anda sedang dalam proses evaluasi. Hasil tes kepribadian
                    yang sudah Anda selesaikan akan digunakan dalam proses evaluasi
                    posisi ini.
                  </p>
                </div>
              </div>
            </div>

            {/* 5-stage timeline: desktop horizontal / mobile vertical */}
            {(() => {
              type TState = "done" | "active" | "pending";
              const tStages: { label: string; sublabel: string; state: TState }[] = [
                { label: "Lamaran & Tes Kepribadian", sublabel: "Selesai", state: "done" },
                { label: "Evaluasi HRD", sublabel: "Sedang Berjalan", state: "active" },
                { label: "Wawancara", sublabel: "Menunggu", state: "pending" },
                { label: "Offering", sublabel: "Menunggu", state: "pending" },
                { label: "Keputusan Akhir", sublabel: "Menunggu", state: "pending" },
              ];
              const dot = (state: TState) => cn(
                "flex items-center justify-center rounded-full shrink-0 font-bold h-7 w-7 text-xs",
                state === "done" && "bg-teal-500 text-white",
                state === "active" && "bg-white dark:bg-slate-900 border-2 border-teal-500 text-teal-600 dark:text-teal-400",
                state === "pending" && "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-600",
              );
              const lbl = (state: TState) => cn(
                "font-semibold text-[11px] sm:text-xs leading-tight",
                state === "done" && "text-teal-700 dark:text-teal-400",
                state === "active" && "text-slate-900 dark:text-white",
                state === "pending" && "text-slate-400 dark:text-slate-600",
              );
              const sub = (state: TState) => cn(
                "text-[10px] mt-0.5",
                state === "done" && "text-teal-600/80 dark:text-teal-500/80",
                state === "active" && "text-teal-600 dark:text-teal-400 font-semibold",
                state === "pending" && "text-slate-400 dark:text-slate-600",
              );
              const conn = (state: TState) => cn(
                "hidden sm:block h-0.5 flex-1 rounded-full shrink-0",
                state === "done" ? "bg-teal-400 dark:bg-teal-600" : "bg-slate-200 dark:bg-slate-700",
              );
              const mconn = (state: TState) => cn(
                "sm:hidden w-0.5 h-3 rounded-full ml-3",
                state === "done" ? "bg-teal-400 dark:bg-teal-600" : "bg-slate-200 dark:bg-slate-700",
              );
              return (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                    Tahapan Seleksi
                  </p>
                  {/* Desktop */}
                  <div className="hidden sm:flex items-center gap-0">
                    {tStages.map((s, i) => (
                      <React.Fragment key={i}>
                        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                          <div className={dot(s.state)}>
                            {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <span className={cn(lbl(s.state), "text-center px-0.5")}>{s.label}</span>
                          <span className={cn(sub(s.state), "text-center")}>{s.sublabel}</span>
                        </div>
                        {i < tStages.length - 1 && <div className={conn(s.state)} />}
                      </React.Fragment>
                    ))}
                  </div>
                  {/* Mobile */}
                  <ol className="flex flex-col sm:hidden">
                    {tStages.map((s, i) => (
                      <li key={i}>
                        <div className="flex items-start gap-3">
                          <div className={dot(s.state)}>
                            {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <div className="pt-0.5 pb-1">
                            <p className={lbl(s.state)}>{s.label}</p>
                            <p className={sub(s.state)}>{s.sublabel}</p>
                          </div>
                        </div>
                        {i < tStages.length - 1 && <div className={mconn(s.state)} />}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}

            <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
              <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                Pembaruan status seleksi akan ditampilkan melalui portal ini. Anda tidak
                perlu mengikuti tes kepribadian kembali.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="flex flex-col border-yellow-500/50">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl">
                Langkah Selanjutnya: {application.jobPosition}
              </CardTitle>
              <CardDescription>
                Anda diundang untuk menyelesaikan tes kepribadian sebagai bagian
                dari proses seleksi.
              </CardDescription>
            </div>
            <Badge className="w-fit bg-yellow-500/80 text-yellow-900">
              Menunggu Tes
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-4">
          <div className="p-4 rounded-md border-dashed border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <BrainCircuit className="h-5 w-5" /> Tes Kepribadian
            </h3>
            <p className="text-sm">
              Hasil tes ini merupakan bagian penting dari proses seleksi kami.
              Silakan selesaikan tes ini untuk melanjutkan ke tahap berikutnya.
              Tes ini tidak memiliki batas waktu, namun kami sarankan untuk
              menyelesaikannya sesegera mungkin.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/50 p-4 border-t flex justify-end">
          <Button asChild>
            <Link
              href={`/careers/portal/assessment/personality?applicationId=${application.id}`}
            >
              Mulai Tes Kepribadian <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isInterviewStage) {
    // ── Shared preparation tips box ───────────────────────────────────────────
    const PrepTips = () => (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Persiapan Sebelum Wawancara
        </p>
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {[
            "Pastikan koneksi internet Anda stabil sebelum sesi dimulai.",
            "Gunakan perangkat dengan kamera dan mikrofon yang berfungsi dengan baik.",
            "Masuk ke ruang wawancara 5–10 menit sebelum jadwal yang ditentukan.",
            "Siapkan CV, portofolio, dan dokumen pendukung jika diperlukan.",
            "Gunakan nama asli sesuai profil kandidat Anda saat bergabung.",
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    );

    // ── Selection timeline — horizontal desktop / vertical mobile ────────────
    const InterviewTimeline = ({ active }: { active: "scheduled" | "done" | "waiting" }) => {
      type StageState = "done" | "active" | "pending";
      const stages: { label: string; sublabel: string; state: StageState }[] = [
        { label: "Lamaran & Tes Kepribadian", sublabel: "Selesai", state: "done" },
        { label: "Evaluasi HRD", sublabel: "Selesai", state: "done" },
        {
          label: "Wawancara",
          sublabel: active === "done" ? "Selesai" : active === "scheduled" ? "Terjadwal" : "Menunggu Jadwal",
          state: active === "done" ? "done" : "active",
        },
        {
          label: "Offering",
          sublabel: "Menunggu",
          state: "pending" as StageState,
        },
        {
          label: "Keputusan Akhir",
          sublabel: "Menunggu",
          state: "pending" as StageState,
        },
      ];

      const dotClass = (state: StageState) =>
        cn(
          "flex items-center justify-center rounded-full shrink-0 font-bold",
          // desktop: smaller dot inline; mobile: slightly bigger
          "h-7 w-7 text-xs sm:h-8 sm:w-8",
          state === "done" && "bg-emerald-500 text-white",
          state === "active" && "bg-white dark:bg-slate-900 border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400",
          state === "pending" && "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700",
        );

      const labelClass = (state: StageState) =>
        cn(
          "text-sm font-semibold leading-tight",
          state === "done" && "text-emerald-700 dark:text-emerald-400",
          state === "active" && "text-slate-900 dark:text-white",
          state === "pending" && "text-slate-400 dark:text-slate-500",
        );

      const sublabelClass = (state: StageState) =>
        cn(
          "text-[11px] mt-0.5",
          state === "done" && "text-emerald-600/80 dark:text-emerald-500/80",
          state === "active" && "text-indigo-600 dark:text-indigo-400 font-semibold",
          state === "pending" && "text-slate-400 dark:text-slate-600",
        );

      const connectorClass = (prevState: StageState) =>
        cn(
          "shrink-0 rounded-full",
          // vertical connector on mobile, horizontal on desktop
          "hidden sm:block h-0.5 flex-1",
          prevState === "done" ? "bg-emerald-400 dark:bg-emerald-600" : "bg-slate-200 dark:bg-slate-700",
        );

      const mobileConnectorClass = (prevState: StageState) =>
        cn(
          "sm:hidden w-0.5 h-4 rounded-full ml-3.5",
          prevState === "done" ? "bg-emerald-400 dark:bg-emerald-600" : "bg-slate-200 dark:bg-slate-700",
        );

      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
            Tahapan Seleksi
          </p>

          {/* ── Desktop: horizontal stepper ── */}
          <div className="hidden sm:flex items-center gap-0">
            {stages.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <div className={dotClass(s.state)}>
                    {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={cn(labelClass(s.state), "text-center text-[12px] sm:text-xs leading-tight px-1")}>
                    {s.label}
                  </span>
                  <span className={cn(sublabelClass(s.state), "text-center text-[10px]")}>
                    {s.sublabel}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <div className={connectorClass(s.state)} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ── Mobile: vertical stepper ── */}
          <ol className="flex flex-col sm:hidden">
            {stages.map((s, i) => (
              <li key={i}>
                <div className="flex items-start gap-3">
                  <div className={dotClass(s.state)}>
                    {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className="pt-0.5 pb-1">
                    <p className={labelClass(s.state)}>{s.label}</p>
                    <p className={sublabelClass(s.state)}>{s.sublabel}</p>
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <div className={mobileConnectorClass(s.state)} />
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    };

    // ── DONE state ────────────────────────────────────────────────────────────
    if (isInterviewActuallyDone) {
      return (
        <div className="space-y-3">
          {/* Status card */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-indigo-100 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-800/60 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="font-bold text-indigo-900 dark:text-indigo-100 text-base">
                  Wawancara Telah Selesai
                </p>
              </div>
              <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1">
                Menunggu Keputusan Akhir
              </Badge>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                Terima kasih, Anda telah menyelesaikan tahap wawancara. Saat ini tim rekrutmen
                sedang melakukan peninjauan akhir terhadap hasil wawancara Anda. Seluruh
                pembaruan status seleksi akan ditampilkan melalui portal ini. Silakan pantau
                halaman ini secara berkala.
              </p>
            </div>
          </div>

          {/* Timeline — horizontal desktop / vertical mobile */}
          <InterviewTimeline active="done" />

          {/* Info box */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Info className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Status saat ini: Menunggu hasil evaluasi akhir.
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Seluruh informasi lanjutan akan ditampilkan melalui portal ini. Anda tidak perlu
                  mengirim ulang lamaran selama status masih dalam proses.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── SCHEDULED state ───────────────────────────────────────────────────────
    if (scheduledInterview) {
      const interviewStart = scheduledInterview.startAt.toDate();
      const interviewEnd = scheduledInterview.endAt.toDate();
      const twoHoursInMs = 2 * 60 * 60 * 1000;
      const isActuallyCompleted =
        (application.postInterviewEvaluation?.submissions ?? 0) > 0 ||
        now.getTime() > interviewEnd.getTime() + twoHoursInMs;

      if (isActuallyCompleted) {
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-indigo-100 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-800/60 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="font-bold text-indigo-900 dark:text-indigo-100 text-base">
                    Wawancara Telah Selesai
                  </p>
                </div>
                <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1">
                  Menunggu Keputusan Akhir
                </Badge>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                  Terima kasih, Anda telah menyelesaikan tahap wawancara. Saat ini tim rekrutmen
                  sedang melakukan peninjauan akhir terhadap hasil wawancara Anda. Seluruh
                  pembaruan status seleksi akan ditampilkan melalui portal ini. Silakan pantau
                  halaman ini secara berkala.
                </p>
              </div>
            </div>
            <InterviewTimeline active="done" />
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Info className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Status saat ini: Menunggu hasil evaluasi akhir.
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Seluruh informasi lanjutan akan ditampilkan melalui portal ini. Anda tidak perlu
                    mengirim ulang lamaran selama status masih dalam proses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Before or during interview
      const isDuring = now >= interviewStart && now < interviewEnd;
      const durationMins = differenceInMinutes(interviewEnd, interviewStart);
      // All interviews for this candidate at this stage
      const allScheduled = (application.interviews || []).filter(i => i.status === "scheduled");

      return (
        <div className="space-y-4">
          {/* Header banner */}
          <div className={cn(
            "rounded-xl border p-5 shadow-sm",
            isDuring
              ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20"
              : "border-teal-200 bg-teal-50 dark:bg-teal-900/20"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                isDuring
                  ? "bg-amber-100 dark:bg-amber-800/40"
                  : "bg-teal-100 dark:bg-teal-800/40"
              )}>
                {isDuring
                  ? <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-pulse" />
                  : <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={cn("font-bold text-base",
                    isDuring ? "text-amber-900 dark:text-amber-100" : "text-teal-900 dark:text-teal-100"
                  )}>
                    {isDuring ? "Wawancara Sedang Berlangsung" : "Jadwal Wawancara Anda Telah Tersedia"}
                  </p>
                  <Badge className={cn("text-[10px] px-2 py-0 font-semibold",
                    isDuring
                      ? "bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200 border-0"
                      : "bg-teal-200 text-teal-800 dark:bg-teal-800/40 dark:text-teal-200 border-0"
                  )}>
                    {isDuring ? "Berlangsung" : "Tahap Wawancara"}
                  </Badge>
                </div>
                <p className={cn("text-sm mt-1 leading-relaxed",
                  isDuring ? "text-amber-800/80 dark:text-amber-200/80" : "text-teal-800/80 dark:text-teal-200/80"
                )}>
                  {isDuring
                    ? "Sesi wawancara Anda sedang berlangsung. Silakan segera bergabung ke ruang wawancara."
                    : "Selamat, Anda telah masuk ke tahap wawancara untuk posisi ini. Silakan periksa detail jadwal berikut dan pastikan Anda hadir sesuai waktu yang telah ditentukan."
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Interview card(s) — one per scheduled slot */}
          {allScheduled.map((iv, idx) => {
            const ivStart = iv.startAt.toDate();
            const ivEnd = iv.endAt.toDate();
            const ivDuration = differenceInMinutes(ivEnd, ivStart);
            const isPublished = iv.meetingPublished !== false;
            return (
              <div key={iv.interviewId || idx} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{application.jobPosition}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{application.brandName}</p>
                  </div>
                  <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                    Terjadwal
                  </Badge>
                </div>

                {/* Detail grid */}
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Tanggal</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {format(ivStart, "eeee, dd MMMM yyyy", { locale: id })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Waktu (WIB)</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {format(ivStart, "HH.mm")} – {format(ivEnd, "HH.mm")} WIB
                        <span className="ml-1.5 text-slate-400 font-normal">({ivDuration} menit)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <LinkIcon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Metode</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Online Meeting</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Media</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {iv.meetingLink ? (
                          (() => {
                            try {
                              const host = new URL(iv.meetingLink).hostname.replace("www.", "");
                              if (host.includes("zoom")) return "Zoom Meeting";
                              if (host.includes("meet.google")) return "Google Meet";
                              if (host.includes("teams")) return "Microsoft Teams";
                              return "Online Meeting";
                            } catch {
                              return "Online Meeting";
                            }
                          })()
                        ) : "Online Meeting"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="px-5 pb-5">
                  {isPublished && iv.meetingLink ? (
                    <Button asChild className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white">
                      <a href={iv.meetingLink} target="_blank" rel="noopener noreferrer">
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Masuk ke Ruang Wawancara
                      </a>
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
                      <Info className="h-4 w-4 shrink-0" />
                      Link wawancara belum tersedia. Silakan pantau portal ini secara berkala.
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Info notice */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            Seluruh pembaruan jadwal dan instruksi wawancara akan ditampilkan melalui portal ini. Silakan pantau halaman ini secara berkala.
          </div>

          {!isDuring && <PrepTips />}
          <InterviewTimeline active="scheduled" />
        </div>
      );
    }

    // ── TEMPLATE date only (no assigned slot) ─────────────────────────────────
    if (job?.interviewTemplate?.defaultStartDate) {
      const template = job.interviewTemplate;
      const templateDate = template.defaultStartDate!.toDate();
      const templateTime = template.workdayStartTime || "—";
      const templateLink = template.meetingLink;

      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50 dark:bg-teal-900/20 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-800/40 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-base text-teal-900 dark:text-teal-100">
                    Jadwal Wawancara Anda Telah Tersedia
                  </p>
                  <Badge className="bg-teal-200 text-teal-800 dark:bg-teal-800/40 dark:text-teal-200 border-0 text-[10px] font-semibold">
                    Tahap Wawancara
                  </Badge>
                </div>
                <p className="text-sm mt-1 leading-relaxed text-teal-800/80 dark:text-teal-200/80">
                  Selamat, Anda telah masuk ke tahap wawancara untuk posisi ini. Silakan periksa detail jadwal berikut dan pastikan Anda hadir sesuai waktu yang telah ditentukan.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{application.jobPosition}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{application.brandName}</p>
              </div>
              <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                Terjadwal
              </Badge>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Tanggal</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {format(templateDate, "eeee, dd MMMM yyyy", { locale: id })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Waktu (WIB)</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{templateTime} WIB</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <LinkIcon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Metode</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Online Meeting</p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              {templateLink ? (
                <Button asChild className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white">
                  <a href={templateLink} target="_blank" rel="noopener noreferrer">
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Masuk ke Ruang Wawancara
                  </a>
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
                  <Info className="h-4 w-4 shrink-0" />
                  Link wawancara belum tersedia. Silakan pantau portal ini secara berkala.
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            Seluruh pembaruan jadwal dan instruksi wawancara akan ditampilkan melalui portal ini. Silakan pantau halaman ini secara berkala.
          </div>

          <PrepTips />
          <InterviewTimeline active="scheduled" />
        </div>
      );
    }

    // ── NO SCHEDULE YET ───────────────────────────────────────────────────────
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-800/40 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-indigo-900 dark:text-indigo-100">Anda Lanjut ke Tahap Wawancara</p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1 leading-relaxed">
                Selamat, lamaran Anda telah dilanjutkan ke tahap wawancara. Tim rekrutmen sedang
                menyiapkan jadwal wawancara untuk Anda.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-800/40 border border-indigo-200 dark:border-indigo-700">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  Menunggu Jadwal Wawancara
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
          Seluruh pembaruan jadwal dan instruksi wawancara akan ditampilkan melalui portal ini. Silakan pantau halaman ini secara berkala.
        </div>

        <PrepTips />
        <InterviewTimeline active="waiting" />
      </div>
    );
  }

  // 5-stage recruitment timeline visible to candidates
  const TIMELINE_STAGES = [
    { key: "start",     label: "Lamaran & Tes Kepribadian", icon: FileText },
    { key: "eval",      label: "Evaluasi HRD",              icon: Search  },
    { key: "interview", label: "Wawancara",                 icon: Users   },
    { key: "offering",  label: "Offering",                  icon: FileSignature },
    { key: "decision",  label: "Keputusan Akhir",           icon: Award   },
  ] as const;

  const stageIndex = (status: string): number => {
    if (["submitted", "tes_kepribadian"].includes(status)) return 0;
    if (["screening", "verification", "document_submission"].includes(status)) return 1;
    if (status === "interview") return 2;
    if (status === "offered") return 3;
    // hired → Keputusan Akhir active
    return 4;
  };
  // HRD internal negative decisions: freeze timeline at interview stage (stage 2 active).
  // Never advance to "Keputusan Akhir" just because status flipped to "rejected" internally.
  const currentStageIdx = isHRDInternalRejection
    ? 2
    : (isProcessing && hasCompletedTest)
      ? 1
      : stageIndex(application.status);

  const jobTypeLabel =
    application.jobType === "fulltime" ? "Full-time" :
    application.jobType === "internship" ? "Internship" :
    application.jobType ?? null;

  return (
    <Card className="rounded-xl shadow-sm overflow-hidden">
      {/* ── Always-visible summary row ── */}
      <div className="px-5 py-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
          {/* Left: position + meta */}
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-base leading-snug">
              {application.jobPosition}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 shrink-0" />
                {application.brandName}
              </span>
              {application.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {application.location}
                </span>
              )}
              {jobTypeLabel && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  {jobTypeLabel}
                </span>
              )}
            </div>
          </div>
          {/* Right: status badge */}
          <Badge className={cn("w-fit shrink-0 self-start", displayStatus.color)}>
            {displayStatus.text}
          </Badge>
        </div>

        {/* Bottom row: submit date + toggle button */}
        <div className="flex items-center justify-between mt-3 gap-2">
          <p className="text-xs text-muted-foreground">
            {application.submittedAt
              ? `Dikirim ${format(application.submittedAt.toDate(), "d MMM yyyy", { locale: id })}`
              : ""}
          </p>
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors select-none"
          >
            {isOpen ? "Tutup Detail" : "Lihat Detail Lamaran"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* ── Collapsible detail section ── */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t bg-slate-50 dark:bg-slate-900/40 px-5 py-5 space-y-5">

            {/* Timeline */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Tahapan Rekrutmen
              </p>
              <div className="flex items-start justify-between gap-1">
                {TIMELINE_STAGES.map((stage, idx) => {
                  const isDone = idx < currentStageIdx;
                  const isCurrent = idx === currentStageIdx;
                  const Icon = stage.icon;
                  return (
                    <div
                      key={stage.key}
                      className="flex flex-1 flex-col items-center gap-1.5 min-w-[60px]"
                    >
                      <div className="relative flex items-center w-full justify-center">
                        {idx > 0 && (
                          <div
                            className={cn(
                              "absolute right-1/2 top-3 h-0.5 w-full -translate-y-px",
                              isDone || isCurrent
                                ? "bg-teal-500"
                                : "bg-slate-200 dark:bg-slate-700",
                            )}
                          />
                        )}
                        <div
                          className={cn(
                            "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                            isDone
                              ? "border-teal-500 bg-teal-500 text-white"
                              : isCurrent
                                ? "border-teal-500 bg-white dark:bg-slate-900 text-teal-600"
                                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-400",
                          )}
                        >
                          {isDone ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Icon className="h-3 w-3" />
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          "text-center text-[10px] leading-tight font-medium",
                          isCurrent
                            ? "text-teal-600 dark:text-teal-400"
                            : isDone
                              ? "text-slate-600 dark:text-slate-300"
                              : "text-slate-400 dark:text-slate-600",
                        )}
                      >
                        {stage.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator className="border-slate-200 dark:border-slate-700" />

            {/* Status content block */}
            {isHRDInternalRejection ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-indigo-100 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <p className="font-semibold text-sm text-indigo-900 dark:text-indigo-100">
                      Evaluasi Setelah Wawancara
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                    Dalam Evaluasi
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                    Terima kasih, Anda telah menyelesaikan tahap wawancara. Saat ini tim
                    rekrutmen sedang meninjau hasil wawancara dan data pendukung Anda.
                    Seluruh pembaruan status seleksi akan ditampilkan melalui portal ini.
                    Silakan pantau halaman ini secara berkala.
                  </p>
                </div>
              </div>
            ) : isRejected ? (
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <FileClock className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm">
                    {application.offerStatus === "rejected"
                      ? "Penawaran Ditolak"
                      : "Proses Seleksi Selesai"}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {application.offerStatus === "rejected"
                    ? "Anda telah menolak penawaran kerja ini. Proses rekrutmen untuk posisi ini telah selesai."
                    : "Terima kasih telah berpartisipasi dalam proses seleksi. Pantau portal ini untuk melihat pembaruan status terbaru dari tim rekrutmen."}
                </p>
              </div>
            ) : hasFinalPositive ? (
              <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-100 mb-2">
                  <Check className="h-4 w-4" /> Selamat! Anda lolos ke tahap berikutnya
                </h3>
                <p className="text-sm text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                  Hasil evaluasi wawancara Anda dinyatakan lolos. Pantau portal ini
                  untuk melihat informasi lanjutan mengenai tahap Offering.
                </p>
              </div>
            ) : isProcessing && hasCompletedTest ? (
              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-900/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <h3 className="font-semibold text-sm text-teal-800 dark:text-teal-100">
                        Lamaran &amp; Tes Kepribadian Selesai — Dalam Evaluasi
                      </h3>
                      {application.personalityTestCompleted ? (
                        <p className="text-sm text-teal-700 dark:text-teal-300 leading-relaxed">
                          Lamaran Anda telah diterima. Hasil tes kepribadian yang sudah
                          Anda selesaikan sebelumnya akan digunakan dalam proses evaluasi
                          posisi ini.
                        </p>
                      ) : (
                        <p className="text-sm text-teal-700 dark:text-teal-300 leading-relaxed">
                          Lamaran dan hasil tes kepribadian Anda telah diterima. Saat ini
                          data Anda sedang ditinjau oleh tim rekrutmen melalui sistem HRP.
                        </p>
                      )}
                      <p className="text-sm text-teal-700/80 dark:text-teal-400 leading-relaxed">
                        Pantau portal ini untuk melihat pembaruan status atau jadwal
                        wawancara.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                  <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                  <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                    Semua informasi seleksi akan ditampilkan di portal ini. Anda tidak
                    perlu mengirim ulang lamaran selama status masih dalam proses.
                    Pastikan data profil Anda tetap akurat agar proses seleksi berjalan
                    lancar.
                  </p>
                </div>
              </div>
            ) : isProcessing && !hasCompletedTest ? (
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-100 mb-1">
                      Langkah Selanjutnya: Selesaikan Tes Kepribadian
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed mb-3">
                      Lamaran Anda telah diterima. Untuk melanjutkan proses seleksi,
                      silakan selesaikan tes kepribadian terlebih dahulu.
                    </p>
                    <Button
                      asChild
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <Link href="/careers/portal/assessment/personality">
                        Mulai Tes Kepribadian{" "}
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Interview schedule (shown inside detail if available) */}
            {isInterviewStage && scheduledInterview && (
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Calendar className="h-3.5 w-3.5" /> Jadwal Wawancara
                </p>
                <p className="text-sm font-semibold">
                  {format(
                    scheduledInterview.startAt.toDate(),
                    "eeee, d MMMM yyyy",
                    { locale: id },
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(scheduledInterview.startAt.toDate(), "HH:mm", {
                    locale: id,
                  })}{" "}
                  –{" "}
                  {format(scheduledInterview.endAt.toDate(), "HH:mm")} WIB
                </p>
                {scheduledInterview.meetingLink && (
                  <Button
                    asChild
                    size="sm"
                    className="mt-3 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <a
                      href={scheduledInterview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" /> Lihat Jadwal
                      Wawancara
                    </a>
                  </Button>
                )}
              </div>
            )}

            {/* Secondary actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {isProcessing && !hasCompletedTest && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/careers/portal/profile">Perbarui Profil</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Wrapper that owns accordion open-state so only one card is expanded at a time
function ApplicationsList({
  applications,
  jobMap,
  hasCompletedTest,
}: {
  applications: JobApplication[];
  jobMap: Map<string, Job>;
  hasCompletedTest: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {applications.map((app) => {
        const job = jobMap.get(app.jobId);
        const id = app.id ?? "";
        return (
          <ApplicationCard
            key={id}
            application={app}
            job={job}
            hasCompletedTest={hasCompletedTest}
            isOpen={openId === id}
            onToggle={() => setOpenId(openId === id ? null : id)}
          />
        );
      })}
    </div>
  );
}

function ApplicationsPageSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full" />
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-32" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export default function ApplicationsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const uid = userProfile?.uid;

  const applicationsQuery = useMemoFirebase(() => {
    if (!uid) return null;
    return query(
      collection(firestore, "applications"),
      where("candidateUid", "==", uid),
    );
  }, [uid, firestore]);

  const {
    data: applications,
    isLoading: applicationsLoading,
    error,
  } = useCollection<JobApplication>(applicationsQuery);

  const jobIds = useMemo(() => {
    if (!applications) return [];
    return Array.from(new Set(applications.map((app) => app.jobId)));
  }, [applications]);

  const { data: jobs, isLoading: jobsLoading } = useCollection<Job>(
    useMemoFirebase(() => {
      if (jobIds.length === 0) return null;
      // Chunking would be needed for > 30 job applications to different jobs
      return query(
        collection(firestore, "jobs"),
        where("__name__", "in", jobIds.slice(0, 30)),
      );
    }, [firestore, jobIds]),
  );

  const jobMap = useMemo(() => {
    if (!jobs) return new Map<string, Job>();
    return new Map(jobs.map((job) => [job.id!, job]));
  }, [jobs]);

  const sessionsQuery = useMemoFirebase(() => {
    if (!uid) return null;
    return query(
      collection(firestore, "assessment_sessions"),
      where("candidateUid", "==", uid),
      where("status", "in", ["submitted", "completed"]),
    );
  }, [uid, firestore]);
  const { data: submittedSessions, isLoading: sessionsLoading } =
    useCollection<AssessmentSession>(sessionsQuery);

  // Candidate-level personality test record (1 per candidate)
  const candidateTestDocRef = useMemoFirebase(
    () => (uid ? doc(firestore, "candidate_personality_tests", uid) : null),
    [uid, firestore],
  );
  const { data: candidateTestDoc, isLoading: candidateTestLoading } = useDoc<{
    status?: string;
    isCompleted?: boolean;
    completedAt?: any;
    personalityTestCompleted?: boolean;
  }>(candidateTestDocRef);

  const hasCompletedTest = useMemo(() => {
    // Primary: candidate-level test record — check all possible completion signals
    if (candidateTestDoc) {
      if (
        candidateTestDoc.status === "completed" ||
        candidateTestDoc.status === "selesai" ||
        candidateTestDoc.isCompleted === true ||
        candidateTestDoc.personalityTestCompleted === true ||
        candidateTestDoc.completedAt != null
      ) return true;
    }
    // Fallback: any submitted assessment session for this candidate
    if ((submittedSessions?.length ?? 0) > 0) return true;
    // Fallback: any application where test was marked done
    if ((applications || []).some((app) => app.personalityTestCompleted === true)) return true;
    return false;
  }, [candidateTestDoc, submittedSessions, applications]);

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [applications]);

  const isLoading =
    authLoading || applicationsLoading || sessionsLoading || jobsLoading || candidateTestLoading;

  if (error) {
    return (
      <div className="p-4 border-2 border-dashed border-destructive/50 rounded-lg bg-red-50 text-destructive-foreground">
        <h3 className="font-bold text-lg mb-2 text-destructive">
          Terjadi Kesalahan
        </h3>
        <p>Gagal memuat data lamaran Anda. Silakan coba lagi nanti.</p>
        <pre className="mt-4 text-xs bg-white p-2 rounded overflow-auto text-destructive">
          {error.message}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lamaran Saya</h1>
        <p className="text-muted-foreground">
          Seluruh perkembangan seleksi akan diperbarui melalui portal ini.
          Silakan tinjau halaman ini secara berkala untuk melihat status
          terbaru, jadwal wawancara, dan informasi lanjutan dari tim
          rekrutmen.
        </p>
      </div>

      {isLoading ? (
        <ApplicationsPageSkeleton />
      ) : sortedApplications && sortedApplications.length > 0 ? (
        <ApplicationsList
          applications={sortedApplications}
          jobMap={jobMap}
          hasCompletedTest={hasCompletedTest}
        />
      ) : (
        <Card className="flex flex-col items-center justify-center py-16 text-center rounded-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <Briefcase className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Belum Ada Lamaran</h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-6">
            Anda belum pernah mengirimkan lamaran. Temukan lowongan yang sesuai
            dan mulai perjalanan karier Anda bersama kami.
          </p>
          <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white">
            <Link href="/careers/portal/jobs">Lihat Lowongan</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
