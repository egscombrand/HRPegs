"use client";

import { useState, useMemo } from "react";
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  deleteDocumentNonBlocking,
  setDocumentNonBlocking,
  useDoc,
} from "@/firebase";
import { collection, query, where, doc } from "firebase/firestore";
import type { OvertimeSubmission, EmployeeProfile, Brand } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Loader2,
  PlusCircle,
  Eye,
  Edit,
  Trash2,
  Clock,
  UserCheck,
  Building,
  Calendar,
  Info,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { OvertimeSubmissionForm } from "./OvertimeSubmissionForm";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { serverTimestamp } from "firebase/firestore";

import { useToast } from "@/hooks/use-toast";
import { KpiCard } from "@/components/recruitment/KpiCard";
import { OvertimeStatusBadge } from "./OvertimeStatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const approvalStatusLabel: Record<string, string> = {
  draft: "Draft",
  pending_supervisor: "Menunggu Manager Divisi",
  pending_hrd: "Menunggu Review HRD",
  pending_manager: "Menunggu Manager Divisi",
  pending_approval: "Menunggu Review HRD",
  needs_revision: "Perlu Revisi",
  revision_requested: "Perlu Revisi",
  approved: "Disetujui",
  approved_hrd: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const overtimeTypeLabels: Record<string, string> = {
  hari_kerja: "Hari Kerja",
  hari_libur: "Hari Libur",
  urgent: "Urgent",
};

const workLocationLabels: Record<string, string> = {
  kantor: "Kantor",
  remote: "Remote",
  site: "Site/Lokasi Klien",
};

const getSubmissionStatus = (submission: OvertimeSubmission) =>
  (submission as any).approvalStatus || submission.status || "draft";

const isRevisionStatus = (status: string) =>
  status === "needs_revision" || status.startsWith("revision");

const getTimelineSteps = (
  status: string,
  supervisorName: string,
  submission: OvertimeSubmission,
) => {
  const supervisorDisplay =
    (submission as any).directSupervisorName ||
    supervisorName ||
    "atasan langsung";
  const rejectionReason =
    (submission as any).rejectionReason ||
    (submission as any).rejection_note ||
    "";
  const cancellationReason = (submission as any).cancellationReason || "";

  const step1 = {
    title: "Pengajuan Dikirim",
    statusLabel: status === "draft" ? "Menunggu" : "Selesai",
    state: status === "draft" ? "active" : "completed",
    description:
      status === "draft"
        ? "Pengajuan belum dikirim."
        : "Pengajuan lembur berhasil dikirim.",
  };

  const step2 = {
    title: "Review Atasan",
    state:
      status === "pending_supervisor"
        ? "active"
        : status === "needs_revision"
          ? "revision"
          : status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval"
            ? "completed"
            : status === "approved" || status === "approved_hrd"
              ? "completed"
              : status === "rejected"
                ? "rejected"
                : status === "cancelled"
                  ? "cancelled"
                  : "pending",
    statusLabel:
      status === "pending_supervisor"
        ? "Sedang Berjalan"
        : status === "needs_revision"
          ? "Revisi"
          : status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval"
            ? "Selesai"
            : status === "approved" || status === "approved_hrd"
              ? "Selesai"
              : status === "rejected"
                ? "Ditolak"
                : status === "cancelled"
                  ? "Dibatalkan"
                  : "Menunggu",
    description:
      status === "pending_supervisor"
        ? `Menunggu persetujuan dari ${supervisorDisplay}.`
        : status === "needs_revision"
          ? "Perlu direvisi sesuai catatan atasan sebelum dilanjutkan."
          : status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval"
            ? "Atasan telah menyetujui pengajuan dan meneruskan ke HRD."
            : status === "approved" || status === "approved_hrd"
              ? "Atasan sudah menyetujui dan pengajuan diteruskan ke HRD."
              : status === "rejected"
                ? rejectionReason
                  ? `Ditolak: ${rejectionReason}`
                  : "Pengajuan ditolak dan tidak dilanjutkan."
                : status === "cancelled"
                  ? cancellationReason
                    ? `Dibatalkan: ${cancellationReason}`
                    : "Pengajuan dibatalkan."
                  : "Akan dimulai setelah pengajuan dikirim.",
  };

  const step3 = {
    title: "Review HRD",
    state:
      status === "pending_hrd" ||
      status === "pending_manager" ||
      status === "pending_approval"
        ? "active"
        : status === "approved" || status === "approved_hrd"
          ? "completed"
          : status === "needs_revision"
            ? "pending"
            : status === "rejected" || status === "cancelled"
              ? "pending"
              : "pending",
    statusLabel:
      status === "pending_hrd" ||
      status === "pending_manager" ||
      status === "pending_approval"
        ? "Sedang Berjalan"
        : status === "approved" || status === "approved_hrd"
          ? "Selesai"
          : status === "needs_revision"
            ? "Menunggu"
            : status === "rejected" || status === "cancelled"
              ? "Menunggu"
              : "Menunggu",
    description:
      status === "pending_hrd" ||
      status === "pending_manager" ||
      status === "pending_approval"
        ? "Menunggu review HRD."
        : status === "approved" || status === "approved_hrd"
          ? "HRD telah mereview dan menyetujui pengajuan."
          : status === "needs_revision"
            ? "Akan diteruskan ke HRD setelah revisi selesai."
            : status === "rejected" || status === "cancelled"
              ? "Tidak dilanjutkan setelah penolakan atau pembatalan."
              : "Akan diteruskan ke HRD setelah persetujuan atasan.",
  };

  const step4 = {
    title: "Selesai",
    state:
      status === "approved" || status === "approved_hrd"
        ? "completed"
        : status === "rejected" || status === "cancelled"
          ? "pending"
          : "pending",
    statusLabel:
      status === "approved" || status === "approved_hrd"
        ? "Selesai"
        : status === "rejected"
          ? "Tidak Selesai"
          : status === "cancelled"
            ? "Dibatalkan"
            : "Menunggu",
    description:
      status === "approved" || status === "approved_hrd"
        ? "Pengajuan lembur telah disetujui."
        : status === "rejected"
          ? "Pengajuan tidak selesai karena ditolak."
          : status === "cancelled"
            ? "Pengajuan dibatalkan sebelum proses selesai."
            : "Pengajuan selesai setelah review HRD.",
  };

  return [step1, step2, step3, step4];
};

const isPendingStatus = (status: string) =>
  status === "pending_supervisor" ||
  status === "pending_manager" ||
  status === "pending_hrd" ||
  status === "approved_by_manager" ||
  status.startsWith("pending");

const isApprovedStatus = (status: string) =>
  status === "approved" || status === "approved_hrd";

const isRejectedStatus = (status: string) =>
  status === "rejected" || status.startsWith("rejected");

const getStatusMeta = (status: string) => {
  if (status === "draft") {
    return {
      waitingFor: "Anda",
      nextStep: "Lengkapi draf dan kirim pengajuan lembur.",
      alertVariant: "warning" as const,
      activeStep: 0,
    };
  }

  if (status === "pending_supervisor" || status === "pending_manager") {
    return {
      waitingFor: "Atasan Langsung",
      nextStep: "Menunggu persetujuan dari atasan langsung.",
      alertVariant: "default" as const,
      activeStep: 1,
    };
  }

  if (
    status === "pending_hrd" ||
    status === "approved_by_manager" ||
    status === "pending_approval"
  ) {
    return {
      waitingFor: "Tim HRD",
      nextStep: "Menunggu review dan persetujuan akhir HRD.",
      alertVariant: "default" as const,
      activeStep: 2,
    };
  }

  if (status === "revision_manager" || status === "revision_hrd") {
    return {
      waitingFor: "Anda",
      nextStep: "Revisi pengajuan sesuai catatan yang diterima.",
      alertVariant: "warning" as const,
      activeStep: 0,
    };
  }

  if (isRevisionStatus(status)) {
    return {
      waitingFor: "Anda",
      nextStep: "Revisi pengajuan sesuai catatan yang diterima.",
      alertVariant: "warning" as const,
      activeStep: 0,
    };
  }

  if (isApprovedStatus(status)) {
    return {
      waitingFor: "Selesai",
      nextStep: "Pengajuan lembur telah disetujui.",
      alertVariant: "default" as const,
      activeStep: 3,
    };
  }

  if (isRejectedStatus(status)) {
    return {
      waitingFor: "Selesai",
      nextStep: "Pengajuan lembur ditolak. Lihat detail untuk alasan.",
      alertVariant: "destructive" as const,
      activeStep: 3,
    };
  }

  return {
    waitingFor: "-",
    nextStep: "Periksa status pengajuan.",
    alertVariant: "default" as const,
    activeStep: 0,
  };
};

const LatestSubmissionCard = ({
  submission,
  supervisorName,
  onActionClick,
}: {
  submission: OvertimeSubmission | null;
  supervisorName: string;
  onActionClick: (action: "view" | "edit", sub: OvertimeSubmission) => void;
}) => {
  if (!submission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Belum Ada Pengajuan Lembur</CardTitle>
          <CardDescription>
            Buat pengajuan lembur pertama Anda untuk memulai.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  let waitingFor = "-";
  let nextStep = "-";
  let alertVariant: "default" | "destructive" | "warning" = "default";

  const status = getSubmissionStatus(submission);
  const statusMeta = getStatusMeta(status);
  waitingFor = statusMeta.waitingFor;
  nextStep = statusMeta.nextStep;
  alertVariant = statusMeta.alertVariant;
  const supervisorDisplay =
    status === "pending_supervisor" || status === "pending_manager"
      ? (submission as any).directSupervisorName || supervisorName
      : waitingFor;
  const workLocationLabel =
    (submission as any).workLocationLabel ||
    (submission.location
      ? workLocationLabels[submission.location]
      : undefined) ||
    submission.location;
  const overtimeTypeLabel =
    (submission as any).overtimeTypeLabel ||
    (submission.overtimeType
      ? overtimeTypeLabels[submission.overtimeType]
      : undefined) ||
    submission.overtimeType;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Pengajuan Terakhir</CardTitle>
            <CardDescription>
              Diajukan{" "}
              {(submission as any).submittedAt?.toDate
                ? formatDistanceToNow(
                    (submission as any).submittedAt.toDate(),
                    {
                      addSuffix: true,
                      locale: idLocale,
                    },
                  )
                : submission.createdAt?.toDate
                  ? formatDistanceToNow(submission.createdAt.toDate(), {
                      addSuffix: true,
                      locale: idLocale,
                    })
                  : "baru saja"}
            </CardDescription>
          </div>
          <OvertimeStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Tanggal Lembur</p>
            <p className="font-semibold">
              {(() => {
                const overtimeDate =
                  (submission as any).overtimeDate?.toDate?.() ??
                  submission.date?.toDate?.();
                return overtimeDate
                  ? format(overtimeDate, "eeee, dd MMM yyyy", {
                      locale: idLocale,
                    })
                  : "-";
              })()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Durasi</p>
            <p className="font-semibold">
              {submission.totalDurationMinutes} menit
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Building className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Lokasi</p>
            <p className="font-semibold">{workLocationLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UserCheck className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Tipe Lembur</p>
            <p className="font-semibold">{overtimeTypeLabel}</p>
          </div>
        </div>
      </CardContent>
      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4">
        <div className="text-sm font-semibold text-slate-300 mb-3">
          Timeline Status
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          {getTimelineSteps(status, supervisorDisplay, submission).map(
            (step, index) => {
              const isLast = index === 3;
              const stateStyles = {
                completed: {
                  ring: "bg-emerald-500 text-white border-emerald-500",
                  badge:
                    "bg-emerald-500/10 text-emerald-200 border border-emerald-500/20",
                  card: "border-emerald-500/20 bg-slate-900",
                },
                active: {
                  ring: "bg-sky-500 text-white border-sky-500",
                  badge: "bg-sky-500/10 text-sky-200 border border-sky-500/20",
                  card: "border-sky-500/20 bg-slate-900",
                },
                revision: {
                  ring: "bg-amber-500 text-slate-950 border-amber-500",
                  badge:
                    "bg-amber-500/10 text-amber-200 border border-amber-500/20",
                  card: "border-amber-500/20 bg-slate-900",
                },
                pending: {
                  ring: "bg-slate-700 text-slate-300 border-slate-600",
                  badge: "bg-slate-800 text-slate-500 border border-slate-700",
                  card: "border-slate-700 bg-slate-950",
                },
                rejected: {
                  ring: "bg-red-500 text-white border-red-500",
                  badge: "bg-red-500/10 text-red-200 border border-red-500/20",
                  card: "border-red-500/20 bg-slate-900",
                },
                cancelled: {
                  ring: "bg-red-500 text-white border-red-500",
                  badge: "bg-red-500/10 text-red-200 border border-red-500/20",
                  card: "border-red-500/20 bg-slate-900",
                },
              } as const;
              const styles =
                stateStyles[step.state as keyof typeof stateStyles];

              return (
                <div key={step.title} className="md:flex-1">
                  <div
                    className={`relative rounded-3xl border p-4 ${styles.card}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full border ${styles.ring}`}
                      >
                        <span className="text-sm font-semibold">
                          {index + 1}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">
                          {step.title}
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${styles.badge}`}
                        >
                          {step.statusLabel}
                        </span>
                        <p className="mt-2 text-xs text-slate-400">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </div>
                  {!isLast && (
                    <div className="hidden md:block h-px bg-slate-700 mt-4" />
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>
    </Card>
  );
};

export function PengajuanLemburClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] =
    useState<OvertimeSubmission | null>(null);
  const [formMode, setFormMode] = useState<"view" | "edit">("edit");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCancellationDialogOpen, setIsCancellationDialogOpen] =
    useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  const submissionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "overtime_submissions"),
      where("employeeUid", "==", userProfile.uid),
    );
  }, [userProfile?.uid, firestore]);

  const {
    data: submissions,
    isLoading,
    mutate,
  } = useCollection<OvertimeSubmission>(submissionsQuery);

  const { data: employeeProfile, isLoading: isLoadingProfile } =
    useDoc<EmployeeProfile>(
      useMemoFirebase(
        () =>
          userProfile
            ? doc(firestore, "employee_profiles", userProfile.uid)
            : null,
        [userProfile, firestore],
      ),
    );

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const latestSubmission = useMemo(() => {
    if (!submissions || submissions.length === 0) return null;
    return [...submissions].sort((a, b) => {
      const aTime =
        (a as any).submittedAt?.toMillis?.() ||
        a.updatedAt?.toMillis?.() ||
        a.createdAt?.toMillis?.() ||
        0;
      const bTime =
        (b as any).submittedAt?.toMillis?.() ||
        b.updatedAt?.toMillis?.() ||
        b.createdAt?.toMillis?.() ||
        0;
      return bTime - aTime;
    })[0];
  }, [submissions]);

  const summary = useMemo(() => {
    const kpis = {
      draft: 0,
      pending: 0,
      approved: 0,
      revision: 0,
      rejected: 0,
    };
    if (!submissions) return kpis;
    submissions.forEach((s) => {
      const status = getSubmissionStatus(s);
      if (isPendingStatus(status)) kpis.pending++;
      else if (isRevisionStatus(status)) kpis.revision++;
      else if (isRejectedStatus(status)) kpis.rejected++;
      else if (isApprovedStatus(status)) kpis.approved++;
      else if (status === "draft") kpis.draft++;
    });
    return kpis;
  }, [submissions]);

  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return [...submissions].sort((a, b) => {
      const aTime =
        (a as any).submittedAt?.toMillis?.() ||
        a.updatedAt?.toMillis?.() ||
        a.createdAt?.toMillis?.() ||
        0;
      const bTime =
        (b as any).submittedAt?.toMillis?.() ||
        b.updatedAt?.toMillis?.() ||
        b.createdAt?.toMillis?.() ||
        0;
      return bTime - aTime;
    });
  }, [submissions]);

  const handleCreate = () => {
    setSelectedSubmission(null);
    setFormMode("edit");
    setIsFormOpen(true);
  };

  const handleAction = (
    action: "view" | "edit",
    submission: OvertimeSubmission,
  ) => {
    setSelectedSubmission(submission);
    setFormMode(action);
    setIsFormOpen(true);
  };

  const handleCancel = (submission: OvertimeSubmission) => {
    setSelectedSubmission(submission);
    const status = getSubmissionStatus(submission);

    // If draft, show delete dialog directly
    if (status === "draft") {
      setIsDeleteDialogOpen(true);
    } else {
      // Otherwise show cancellation dialog with reason
      setCancellationReason("");
      setIsCancellationDialogOpen(true);
    }
  };

  const confirmCancel = async () => {
    if (!selectedSubmission) return;
    const status = getSubmissionStatus(selectedSubmission);

    try {
      if (status === "draft") {
        // Delete draft
        await deleteDocumentNonBlocking(
          doc(firestore, "overtime_submissions", selectedSubmission.id!),
        );
        toast({ title: "Draft Pengajuan Dihapus" });
      } else {
        // Update with cancellation status
        if (!cancellationReason.trim()) {
          toast({
            variant: "destructive",
            title: "Alasan Pembatalan Diperlukan",
            description: "Silakan isi alasan pembatalan.",
          });
          return;
        }

        await setDocumentNonBlocking(
          doc(firestore, "overtime_submissions", selectedSubmission.id!),
          {
            approvalStatus: "cancelled",
            cancelledAt: serverTimestamp(),
            cancelledBy: userProfile?.uid,
            cancellationReason: cancellationReason.trim(),
          },
          { merge: true },
        );
        toast({ title: "Pengajuan Dibatalkan" });
      }

      mutate();
      setIsDeleteDialogOpen(false);
      setIsCancellationDialogOpen(false);
      setCancellationReason("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Membatalkan",
        description: e.message,
      });
    }
  };

  if (isLoading || isLoadingProfile || isLoadingBrands) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pengajuan Lembur</h1>
            <p className="text-muted-foreground">
              Buat dan lacak status pengajuan lembur Anda.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <PlusCircle className="mr-2 h-4 w-4" /> Buat Pengajuan
          </Button>
        </div>

        <LatestSubmissionCard
          submission={latestSubmission}
          supervisorName={employeeProfile?.supervisorName || "Manajer Divisi"}
          onActionClick={handleAction}
        />

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard title="Draft" value={summary.draft} />
          <KpiCard title="Menunggu Persetujuan" value={summary.pending} />
          <KpiCard
            title="Perlu Revisi"
            value={summary.revision}
            deltaType="inverse"
          />
          <KpiCard title="Disetujui" value={summary.approved} />
          <KpiCard
            title="Ditolak"
            value={summary.rejected}
            deltaType="inverse"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Pengajuan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sortedSubmissions.length > 0 ? (
              <div className="grid gap-4">
                {sortedSubmissions.map((s) => {
                  const status = getSubmissionStatus(s);
                  const statusMeta = getStatusMeta(status);
                  const overtimeDate =
                    (s as any).overtimeDate?.toDate?.() ?? s.date?.toDate?.();
                  // Task count: use taskDetails if available, fallback to tasks length
                  const taskDetails = (s as any).taskDetails || s.tasks || [];
                  const taskCount = taskDetails.length || (s.reason ? 1 : 0);
                  const supervisor =
                    (s as any).directSupervisorName ||
                    employeeProfile?.supervisorName ||
                    "Belum Ditentukan";
                  const statusLabel =
                    approvalStatusLabel[status] || status.replace(/_/g, " ");
                  const supervisorViewedAt = (s as any).supervisorViewedAt;

                  // Determine which actions are available based on status and viewing state
                  const canEdit =
                    status === "draft" ||
                    status === "needs_revision" ||
                    status.startsWith("revision") ||
                    (status === "pending_supervisor" && !supervisorViewedAt);
                  const canCancel =
                    status === "draft" ||
                    (status === "pending_supervisor" && !supervisorViewedAt) ||
                    status === "pending_hrd" ||
                    status === "pending_manager" ||
                    status === "approved_by_manager" ||
                    status === "pending_approval";
                  const canRevise =
                    status === "needs_revision" ||
                    status.startsWith("revision");

                  return (
                    <Card key={s.id} className="border">
                      <CardHeader className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-xs uppercase text-muted-foreground">
                                Tanggal Lembur
                              </p>
                              <p className="text-base font-semibold">
                                {overtimeDate
                                  ? format(overtimeDate, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })
                                  : "-"}
                              </p>
                            </div>
                            <OvertimeStatusBadge status={status as any} />
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                            {s.reason || "Tidak ada alasan tambahan."}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-muted p-3">
                            <p className="text-xs uppercase text-muted-foreground">
                              Jam
                            </p>
                            <p className="font-semibold">
                              {s.startTime}–{s.endTime}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-muted p-3">
                            <p className="text-xs uppercase text-muted-foreground">
                              Durasi
                            </p>
                            <p className="font-semibold">
                              {s.totalDurationMinutes} menit
                            </p>
                          </div>
                          <div className="rounded-2xl bg-muted p-3">
                            <p className="text-xs uppercase text-muted-foreground">
                              Lokasi
                            </p>
                            <p className="font-semibold">
                              {(s as any).workLocationLabel ||
                                (s.location
                                  ? workLocationLabels[s.location]
                                  : undefined) ||
                                s.location}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-muted p-3">
                            <p className="text-xs uppercase text-muted-foreground">
                              Tipe Lembur
                            </p>
                            <p className="font-semibold">
                              {(s as any).overtimeTypeLabel ||
                                (s.overtimeType
                                  ? overtimeTypeLabels[s.overtimeType]
                                  : undefined) ||
                                s.overtimeType}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-muted p-3">
                            <p className="text-xs uppercase text-muted-foreground">
                              Total Tugas
                            </p>
                            <p className="font-semibold">{taskCount}</p>
                          </div>
                          <div className="rounded-2xl bg-muted p-3">
                            <p className="text-xs uppercase text-muted-foreground">
                              Atasan Tujuan
                            </p>
                            <p className="font-semibold">{supervisor}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase text-muted-foreground">
                            Alasan Lembur
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {s.reason || "Belum ada alasan."}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-muted-foreground">
                            Langkah Berikutnya
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {statusMeta.nextStep}
                          </p>
                        </div>
                      </CardContent>
                      <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                          Terakhir diupdate{" "}
                          {s.updatedAt?.toDate
                            ? formatDistanceToNow(s.updatedAt.toDate(), {
                                addSuffix: true,
                                locale: idLocale,
                              })
                            : "baru saja"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction("view", s)}
                          >
                            {status === "draft"
                              ? "Lihat Draf"
                              : status === "rejected"
                                ? "Lihat Alasan"
                                : "Lihat Detail"}
                          </Button>

                          {status === "pending_supervisor" &&
                            !supervisorViewedAt && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAction("edit", s)}
                                >
                                  Edit Pengajuan
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleCancel(s)}
                                >
                                  Batalkan
                                </Button>
                              </>
                            )}
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-muted-foreground">
                Belum ada pengajuan lembur.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <OvertimeSubmissionForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedSubmission}
        employeeProfile={employeeProfile}
        brands={brands || []}
        formMode={formMode}
        onSuccess={mutate}
      />

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="draft pengajuan lembur ini"
        itemType=""
      />

      <Dialog
        open={isCancellationDialogOpen}
        onOpenChange={setIsCancellationDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan Pengajuan Lembur</DialogTitle>
            <DialogDescription>
              Mohon berikan alasan pembatalan pengajuan lembur ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Alasan pembatalan..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="min-h-24"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCancellationDialogOpen(false);
                setCancellationReason("");
              }}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={!cancellationReason.trim()}
            >
              Batalkan Pengajuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
