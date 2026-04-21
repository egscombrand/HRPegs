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
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import type {
  Job,
  JobApplication,
  JobApplicationStatus,
  AssessmentSession,
  Offering,
} from "@/lib/types";
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
}: {
  application: JobApplication;
  job?: Job;
  hasCompletedTest: boolean;
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
  const [negotiationSalary, setNegotiationSalary] = useState<number | null>(null);
  const [negotiationStartDate, setNegotiationStartDate] = useState("");
  const [negotiationWorkModel, setNegotiationWorkModel] = useState("");
  const [negotiationLocation, setNegotiationLocation] = useState("");
  const [negotiationContractDuration, setNegotiationContractDuration] = useState<number | null>(null);
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
  const offerHrContact = offerDetails.hrContact || "-";
  const offerAdditionalNotes = activeOffering?.additionalNotes || "";
  const offerDocumentUrl = activeOffering?.documentUrl;
  const offerDocumentName =
    activeOffering?.documentName ||
    `Offering_${application.jobPosition.replace(/\s+/g, "_")}.pdf`;

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
    : (application.offerStatus === "accepted" || application.offerStatus === "accepted_pending_document" || application.offerStatus === "document_uploaded")
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
    (application.offerStatus === "accepted" || application.offerStatus === "accepted_pending_document" || application.offerStatus === "document_uploaded");
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
      await updateDocumentNonBlocking(appRef, {
        offerStatus: "negotiation_requested" as const,
        candidateNegotiationUsed: true,
        candidateCounterOffer: {
          requestedAreas: negotiationAreas,
          requestedSalary: negotiationAreas.includes("gaji") ? negotiationSalary : null,
          requestedStartDate: negotiationAreas.includes("tanggal_mulai") ? negotiationStartDate : null,
          requestedWorkModel: negotiationAreas.includes("sistem_kerja") ? negotiationWorkModel : null,
          requestedLocation: negotiationAreas.includes("lokasi") ? negotiationLocation : null,
          requestedContractDurationMonths: negotiationAreas.includes("durasi_kontrak") ? negotiationContractDuration : null,
          requestedBenefitNotes: negotiationAreas.includes("benefit") ? negotiationBenefitNotes : null,
          requestedScopeNotes: negotiationAreas.includes("peran") ? negotiationScopeNotes : null,
          requestedOtherNotes: negotiationAreas.includes("lainnya") ? negotiationOtherNotes : null,
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
      const storage = getStorage();
      const storageRef = ref(
        storage,
        `offerings/${activeOfferingId}/signed_documents/${Date.now()}_${signedFile.name}`,
      );
      const uploadTask = uploadBytesResumable(storageRef, signedFile, {
        contentType: signedFile.type,
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
            );
            setUploadProgress(progress);
          },
          (error) => {
            setUploadError(error.message || "Gagal mengunggah dokumen.");
            setIsUploading(false);
            reject(error);
          },
          () => {
            resolve();
          },
        );
      });

      const signedDocumentUrl = await getDownloadURL(uploadTask.snapshot.ref);
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
          "Dokumen penawaran telah dikirim. Tim HRD akan memverifikasi segera.",
      });
    } catch (error: any) {
      console.error("Upload signed document failed:", error);
      setUploadError(error?.message || "Gagal mengunggah dokumen.");
      toast({
        variant: "destructive",
        title: "Unggah Gagal",
        description:
          error?.message || "Terjadi kesalahan saat mengunggah dokumen.",
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

  const isRejected = application.status === "rejected";
  const isHired =
    application.status === "hired" &&
    application.internalAccessEnabled === true;
  const isOffered = application.status === "offered";
  const isInterviewStage = application.status === "interview";
  const isAssessmentStage = application.status === "tes_kepribadian";
  const isProcessing = [
    "submitted",
    "screening",
    "verification",
    "document_submission",
  ].includes(application.status);
  const hasFinalPositive = application.candidateStatus === "lolos";
  const hasInternalEvaluation =
    !!application.postInterviewDecision ||
    !!application.recruitmentInternalDecision;

  // Status mapping for candidates
  const displayStatus = useMemo(() => {
    if (application.candidateStatus === "lolos") {
      return { text: "Lolos ke Tahap Berikutnya", color: "bg-emerald-600" };
    }
    if (isHired || isOffered) return { text: "Lolos", color: "bg-green-600" };

    const internalPra = application.recruitmentInternalDecision?.status;
    const internalPasca = application.postInterviewDecision?.status;

    if (
      internalPasca === "lanjut" ||
      internalPra === "lanjut_ke_tahap_selanjutnya"
    ) {
      return { text: "Lolos ke Tahap Berikutnya", color: "bg-emerald-600" };
    }

    // Everything else (pending, tidak_lanjut, or processing) is mapped to 'Menunggu' or 'Ditinjau'
    return {
      text: "Menunggu Hasil Evaluasi",
      color: "bg-secondary text-secondary-foreground",
    };
  }, [application, isHired, isOffered]);

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

            {application.offerStatus === "negotiation_rejected" && application.candidateNegotiationResponse && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-full bg-orange-100 p-2 shadow-sm">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-orange-950 uppercase tracking-wider">Negosiasi Tidak Dapat Disetujui</p>
                    <div className="mt-2 text-sm text-orange-800 bg-white/40 p-3 rounded-xl border border-orange-200/50">
                      {application.candidateNegotiationResponse.note}
                    </div>
                    <p className="mt-3 text-[10px] font-black uppercase text-orange-500/80">
                      — Tim HRD • {format(application.candidateNegotiationResponse.respondedAt.toDate(), "dd MMM yyyy", { locale: id })}
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
                          window.open(offerDocumentUrl, "_blank");
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
                          window.open(offerDocumentUrl, "_blank");
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
              {application.offerStatus !== "negotiation_requested" && !application.candidateNegotiationUsed && (
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
            <DialogContent className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle>Ajukan Diskusi Penawaran</DialogTitle>
                <DialogDescription>
                  Gunakan fitur ini jika Anda ingin mendiskusikan aspek tertentu
                  dari penawaran ini sebelum memberikan keputusan final.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-1 py-2 space-y-6">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-4 text-sm text-blue-900">
                  <p className="font-semibold">Informasi Negosiasi:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Negosiasi bersifat diskusi profesional.</li>
                    <li>Kesempatan diskusi ini hanya dapat diajukan satu kali.</li>
                    <li>HRD akan meninjau dan memberikan respons atas permintaan Anda.</li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold">Area yang Ingin Dinegosiasikan:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: "gaji", label: "Gaji / Kompensasi" },
                      { id: "tanggal_mulai", label: "Tanggal Mulai" },
                      { id: "sistem_kerja", label: "Sistem Kerja" },
                      { id: "lokasi", label: "Lokasi" },
                      { id: "durasi_kontrak", label: "Durasi Kontrak" },
                      { id: "benefit", label: "Benefit / Fasilitas" },
                      { id: "peran", label: "Lingkup Peran" },
                      { id: "lainnya", label: "Lainnya" },
                    ].map((area) => (
                      <div key={area.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`area-${area.id}`}
                          checked={negotiationAreas.includes(area.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNegotiationAreas([...negotiationAreas, area.id]);
                            } else {
                              setNegotiationAreas(negotiationAreas.filter(a => a !== area.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <label htmlFor={`area-${area.id}`} className="text-sm cursor-pointer">
                          {area.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  {negotiationAreas.includes("gaji") && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Usulan Gaji (Gross/Bulan)</label>
                      <Input
                        type="number"
                        placeholder="Contoh: 15000000"
                        value={negotiationSalary || ""}
                        onChange={(e) => setNegotiationSalary(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("tanggal_mulai") && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Usulan Tanggal Mulai</label>
                      <Input
                        type="date"
                        value={negotiationStartDate}
                        onChange={(e) => setNegotiationStartDate(e.target.value)}
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("sistem_kerja") && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Usulan Sistem Kerja</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={negotiationWorkModel}
                        onChange={(e) => setNegotiationWorkModel(e.target.value)}
                      >
                        <option value="">Pilih...</option>
                        <option value="Onsite">Onsite (Ke Kantor)</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="Remote">Full Remote</option>
                      </select>
                    </div>
                  )}

                  {negotiationAreas.includes("durasi_kontrak") && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Usulan Durasi (Bulan)</label>
                      <Input
                        type="number"
                        placeholder="Contoh: 12"
                        value={negotiationContractDuration || ""}
                        onChange={(e) => setNegotiationContractDuration(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("benefit") && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Catatan Benefit</label>
                      <Textarea
                        placeholder="Jelaskan usulan benefit..."
                        value={negotiationBenefitNotes}
                        onChange={(e) => setNegotiationBenefitNotes(e.target.value)}
                      />
                    </div>
                  )}

                  {negotiationAreas.includes("peran") && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Catatan Lingkup Peran</label>
                      <Textarea
                        placeholder="Jelaskan usulan peran..."
                        value={negotiationScopeNotes}
                        onChange={(e) => setNegotiationScopeNotes(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alasan & Penjelasan Profesional (Wajib)</label>
                    <Textarea
                      placeholder="Jelaskan alasan pengajuan diskusi ini secara profesional..."
                      className="min-h-[120px]"
                      value={negotiationReason}
                      onChange={(e) => setNegotiationReason(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="border-t pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setIsNegotiationDialogOpen(false)}
                  disabled={isDeciding}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleNegotiationSubmit}
                  disabled={isDeciding || negotiationAreas.length === 0 || !negotiationReason.trim()}
                >
                  {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Kirim Permintaan
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
    if (hasInternalEvaluation) {
      return (
        <div className="p-6 rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100">
          <h3 className="font-bold text-lg flex items-center gap-3">
            <Users className="h-6 w-6" />
            Wawancara telah selesai
          </h3>
          <div className="mt-4 space-y-4 text-sm leading-relaxed">
            <p>
              Terima kasih, Anda telah menyelesaikan tahap wawancara. Saat ini
              tim rekrutmen kami sedang melakukan evaluasi lebih lanjut terhadap
              hasil wawancara Anda.
            </p>
            <p>
              Kami akan menginformasikan hasilnya melalui portal ini setelah
              proses penilaian selesai. Mohon menunggu informasi selanjutnya.
            </p>
          </div>
        </div>
      );
    }

    if (scheduledInterview) {
      const interviewStart = scheduledInterview.startAt.toDate();
      const interviewEnd = scheduledInterview.endAt.toDate();
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      const isActuallyCompleted =
        (application.postInterviewEvaluation?.submissions ?? 0) > 0 ||
        now.getTime() > interviewEnd.getTime() + twoHoursInMs;

      if (!isActuallyCompleted) {
        // Before or during interview
        const isDuring = now >= interviewStart && now < interviewEnd;

        return (
          <div
            className={cn(
              "p-6 rounded-2xl border",
              isDuring
                ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
                : "border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 shadow-sm",
            )}
          >
            <h3 className="font-bold text-lg flex items-center gap-3">
              {isDuring ? (
                <Clock className="h-6 w-6 animate-spin" />
              ) : (
                <Calendar className="h-6 w-6" />
              )}
              {isDuring
                ? "Wawancara Sedang Berlangsung"
                : "Jadwal Wawancara Tersedia"}
            </h3>
            <div className="mt-4 space-y-4 text-sm leading-relaxed">
              <p>
                {isDuring
                  ? "Tahap wawancara Anda sedang berlangsung. Silakan mengikuti sesi sesuai jadwal yang telah ditentukan."
                  : `Anda dijadwalkan untuk mengikuti tahap wawancara untuk posisi ${application.jobPosition}.`}
              </p>

              {!isDuring && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-500/60 mb-1">
                      Hari & Tanggal
                    </p>
                    <p className="font-bold">
                      {format(interviewStart, "eeee, dd MMMM yyyy", {
                        locale: id,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-500/60 mb-1">
                      Jam (WIB)
                    </p>
                    <p className="font-bold">
                      {format(interviewStart, "HH:mm")} -{" "}
                      {format(interviewEnd, "HH:mm")} (
                      {differenceInMinutes(interviewEnd, interviewStart)} mnt)
                    </p>
                  </div>
                  {scheduledInterview.meetingLink && (
                    <div className="sm:col-span-2 pt-2">
                      <p className="text-[10px] font-black uppercase text-blue-500/60 mb-2">
                        Link Wawancara
                      </p>
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <a
                          href={scheduledInterview.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <LinkIcon className="mr-2 h-4 w-4" /> Gabung Sesi
                          Wawancara
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!isDuring && (
                <p className="italic text-xs text-blue-700/70 dark:text-blue-300/60">
                  Mohon pastikan Anda hadir tepat waktu dan mempersiapkan diri
                  dengan baik.
                </p>
              )}
            </div>
          </div>
        );
      } else {
        // After interview (completed manually or by time)
        const isLolos = application.postInterviewDecision?.status === "lanjut";

        return (
          <div className="p-6 rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100">
            <h3 className="font-bold text-lg flex items-center gap-3">
              <Users className="h-6 w-6" />
              {isLolos ? "Tahap Wawancara Selesai" : "Sedang Ditinjau"}
            </h3>
            <div className="mt-4 space-y-4 text-sm leading-relaxed">
              <p>
                Terima kasih telah mengikuti wawancara. Saat ini tim kami sedang
                meninjau hasil evaluasi Anda.
              </p>
              <p>
                Kami akan memberikan informasi perkembangan selanjutnya melalui
                portal ini atau email apabila terdapat pembaruan status. Terima
                kasih atas pengertian dan antusiasme Anda.
              </p>
            </div>
          </div>
        );
      }
    } else if (job?.interviewTemplate?.defaultStartDate) {
      const template = job.interviewTemplate;
      const templateDate = template.defaultStartDate!.toDate();
      const templateTime = template.workdayStartTime || "N/A";
      const templateLink = template.meetingLink;

      return (
        <div className="p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100">
          <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800 dark:text-blue-100">
            <Calendar className="h-5 w-5" /> Jadwal Wawancara Tersedia
          </h3>
          <div className="text-sm mt-3 space-y-3 text-blue-800/90 dark:text-blue-200/90 text-justify">
            <p>
              Selamat! Anda telah lolos ke tahap wawancara. Berdasarkan jadwal
              yang telah ditentukan oleh tim HRD, wawancara Anda akan
              dilaksanakan pada:
            </p>
            <ul className="list-disc pl-5 font-semibold">
              <li>
                Tanggal:{" "}
                {format(templateDate, "eeee, dd MMMM yyyy", { locale: id })}
              </li>
              <li>Waktu: {templateTime} WIB</li>
              <li>Media: Zoom Meeting</li>
            </ul>
            <p>
              Silakan mempersiapkan diri dengan baik. Jika terdapat pembaruan
              jadwal atau link wawancara, kami akan menginformasikannya melalui
              portal ini dan email.
            </p>
            {templateLink && (
              <div className="pt-2">
                <Button asChild size="sm">
                  <a
                    href={templateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LinkIcon className="mr-2 h-4 w-4" /> Buka Link Wawancara
                    (Template)
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      // No interview scheduled yet for this 'interview' stage application
      return (
        <div className="p-4 rounded-md border border-muted-foreground/20 bg-muted/50 text-muted-foreground">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" /> Menunggu Penjadwalan Wawancara
          </h3>
          <div className="text-sm mt-3 space-y-3">
            <p>
              Selamat! Anda telah lolos ke tahap wawancara. Tim HRD kami sedang
              mengatur jadwal yang sesuai.
            </p>
            <p>
              Anda akan menerima notifikasi di portal ini dan melalui email
              setelah jadwal wawancara Anda dikonfirmasi. Mohon periksa secara
              berkala.
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div>
            <CardTitle className="text-xl">{application.jobPosition}</CardTitle>
            <CardDescription className="flex items-center gap-2 pt-1">
              <Building className="h-4 w-4" /> {application.brandName}
            </CardDescription>
          </div>
          <Badge className={cn("w-fit", displayStatus.color)}>
            {displayStatus.text}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <Separator />

        {isRejected ? (
          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <FileClock className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold text-lg">Menunggu Hasil Evaluasi</h3>
            </div>
            <div className="text-sm space-y-3 text-slate-600 dark:text-slate-400 text-justify">
              <p>
                {application.offerStatus === "rejected"
                  ? "Anda telah menolak penawaran kerja ini. Proses rekrutmen untuk posisi ini telah selesai."
                  : "Terima kasih telah berpartisipasi dalam proses seleksi. Saat ini lamaran Anda sedang dalam tahap evaluasi lanjutan oleh tim kami."}
              </p>
              {application.offerStatus !== "rejected" && (
                <>
                  <p>
                    Lamaran Anda telah kami terima dengan baik dan saat ini
                    sedang dalam proses evaluasi oleh tim rekrutmen kami. Kami
                    sedang meninjau kesesuaian profil dan hasil tahapan seleksi
                    Anda untuk menentukan proses selanjutnya.
                  </p>
                  <p>
                    Mohon menunggu informasi berikutnya yang akan kami sampaikan
                    melalui portal ini. Kami akan memberikan informasi
                    perkembangan selanjutnya melalui portal ini atau email
                    apabila terdapat pembaruan status. Terima kasih atas
                    kesabaran dan minat Anda.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : hasFinalPositive ? (
          <div className="p-4 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100">
            <h3 className="font-semibold text-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-100">
              <Check className="h-5 w-5" /> Selamat! Anda lolos ke tahap
              berikutnya
            </h3>
            <div className="text-sm mt-3 space-y-3 text-emerald-900/90 dark:text-emerald-200/90 text-justify">
              <p>
                Hasil evaluasi wawancara Anda telah dinyatakan lolos. Silakan
                tunggu informasi lanjutan mengenai tahap Offering yang akan
                segera kami kirimkan.
              </p>
              <p>
                Kami akan menghubungi Anda melalui portal ini atau email setelah
                detail penawaran siap.
              </p>
            </div>
            {isProcessing && !hasCompletedTest && (
              <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/50">
                <p className="font-bold text-blue-900 dark:text-blue-200">
                  Percepat proses Anda
                </p>
                <p className="text-xs mt-1">
                  Selesaikan tes kepribadian untuk mempercepat proses screening.
                  Hasil tes ini akan berlaku untuk semua lamaran Anda.
                </p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/careers/portal/assessment/personality">
                    Lanjut ke Tes Kepribadian{" "}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-between items-center min-h-[76px] gap-4">
        <div className="flex-1">
          {isInterviewStage && scheduledInterview ? (
            <div>
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> JADWAL WAWANCARA
              </p>
              <p className="text-sm font-semibold">
                {format(
                  scheduledInterview.startAt.toDate(),
                  "eeee, dd MMM yyyy",
                  { locale: id },
                )}
              </p>
              <p className="text-sm font-semibold">
                {format(scheduledInterview.startAt.toDate(), "HH:mm", {
                  locale: id,
                })}{" "}
                - {format(scheduledInterview.endAt.toDate(), "HH:mm")} WIB
              </p>
            </div>
          ) : application.submittedAt ? (
            <div>
              <p className="text-xs text-muted-foreground">Lamaran Dikirim:</p>
              <p className="text-sm font-semibold">
                {format(
                  application.submittedAt.toDate(),
                  "dd MMM yyyy, HH:mm",
                  { locale: id },
                )}{" "}
                WIB
              </p>
            </div>
          ) : (
            <div></div> // Placeholder for alignment
          )}
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto">
          {isInterviewStage && scheduledInterview && (
            <Button asChild size="sm" className="w-full">
              <a
                href={scheduledInterview.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon className="mr-2 h-4 w-4" /> Buka Link Wawancara
              </a>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
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
      where("status", "==", "submitted"),
    );
  }, [uid, firestore]);
  const { data: submittedSessions, isLoading: sessionsLoading } =
    useCollection<AssessmentSession>(sessionsQuery);

  const hasCompletedTest = useMemo(
    () => (submittedSessions?.length ?? 0) > 0,
    [submittedSessions],
  );

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [applications]);

  const isLoading =
    authLoading || applicationsLoading || sessionsLoading || jobsLoading;

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
          Riwayat dan status lamaran pekerjaan yang telah Anda kirimkan atau
          simpan sebagai draf.
        </p>
      </div>

      {isLoading ? (
        <ApplicationsPageSkeleton />
      ) : sortedApplications && sortedApplications.length > 0 ? (
        <div className="space-y-6">
          {sortedApplications.map((app) => {
            const job = jobMap.get(app.jobId);
            return (
              <ApplicationCard
                key={app.id}
                application={app}
                job={job}
                hasCompletedTest={hasCompletedTest}
              />
            );
          })}
        </div>
      ) : (
        <Card className="h-64 flex flex-col items-center justify-center text-center">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="mt-4">Anda Belum Pernah Melamar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Semua lamaran Anda akan muncul di sini.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/careers/portal/jobs">Cari Lowongan Sekarang</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
