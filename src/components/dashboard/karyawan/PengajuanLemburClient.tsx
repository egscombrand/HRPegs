"use client";

import { useEffect, useState, useMemo } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Pause,
  Play,
  Square,
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
import { Badge } from "@/components/ui/badge";

const approvalStatusLabel: Record<string, string> = {
  draft: "Draft",
  pending_coordinator: "Menunggu Pengawas/Koordinator",
  pending_supervisor: "Menunggu Manager Divisi",
  pending_manager: "Menunggu Manager Divisi",
  approved_by_manager: "Menunggu Review HRD",
  pending_hrd: "Menunggu Review HRD",
  needs_revision: "Perlu Revisi",
  revision_coordinator: "Perlu Revisi",
  revision_manager: "Perlu Revisi",
  revision_hrd: "Perlu Revisi",
  rejected_coordinator: "Ditolak",
  rejected_manager: "Ditolak",
  rejected_hrd: "Ditolak",
  approved: "Disetujui",
  approved_hrd: "Disetujui",
  cancelled: "Dibatalkan",
};

const overtimeTypeLabels: Record<string, string> = {
  hari_kerja: "Hari Kerja",
  hari_libur: "Hari Libur",
  urgent: "Urgent",
};

const workLocationLabels: Record<string, string> = {
  kantor: "Kantor",
  rumah_wfh: "Rumah / WFH",
  luar_kantor: "Luar Kantor",
  site_klien: "Site / Lokasi Klien",
  lainnya: "Lainnya",
  remote: "Rumah / WFH",
  site: "Site / Lokasi Klien",
};

const getWorkLocationDisplay = (submission: OvertimeSubmission) => {
  const rawLocation =
    (submission as any).workLocation || submission.location || "kantor";
  const label =
    workLocationLabels[rawLocation] ||
    (submission as any).workLocationLabel ||
    rawLocation;
  const detail = (submission as any).workLocationDetail?.trim?.();
  return rawLocation === "lainnya" && detail ? `${label} - ${detail}` : label;
};

const getSubmissionStatus = (submission: OvertimeSubmission) =>
  (submission as any).approvalStatus || submission.status || "draft";

const realtimeLifecycleLabels: Record<string, string> = {
  draft: "Draft Persiapan",
  timer_running: "Sedang Berjalan",
  timer_paused: "Dijeda",
  timer_finished_pending_submit: "Siap Diajukan",
};

const getRealtimeLifecycleStatus = (submission: OvertimeSubmission) => {
  const status = getSubmissionStatus(submission);
  if ((submission as any).inputMode !== "realtime") return null;
  if (status === "draft") return "draft";
  if (status === "timer_running") return "timer_running";
  if (status === "timer_paused") return "timer_paused";
  if (status === "timer_finished_pending_submit") {
    return "timer_finished_pending_submit";
  }
  return null;
};

const isRealtimeLifecycleStatus = (submission: OvertimeSubmission) =>
  getRealtimeLifecycleStatus(submission) != null;

const isRealtimeActiveStatus = (submission: OvertimeSubmission) => {
  const lifecycle = getRealtimeLifecycleStatus(submission);
  return lifecycle === "timer_running" || lifecycle === "timer_paused";
};

const isRealtimeReadyToSubmit = (submission: OvertimeSubmission) =>
  getRealtimeLifecycleStatus(submission) === "timer_finished_pending_submit";

const toDateSafe = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const formatClock = (value: any) => {
  const date = toDateSafe(value);
  return date ? format(date, "HH:mm", { locale: idLocale }) : "-";
};

const formatDateTime = (value: any) => {
  const date = toDateSafe(value);
  return date ? format(date, "dd MMM yyyy, HH:mm", { locale: idLocale }) : "-";
};

const formatDurationFromMinutes = (minutes?: number | null) => {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours <= 0) return `${mins} menit`;
  if (mins === 0) return `${hours} jam`;
  return `${hours} jam ${mins} menit`;
};

const formatElapsedSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hours, minutes, secs]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
};

const getPauseLogs = (submission: OvertimeSubmission) =>
  (((submission as any).pauseLogs || []) as Array<{
    pauseStart?: any;
    pauseEnd?: any;
    startedAt?: any;
    endedAt?: any;
    durationMs?: number;
    durationSeconds?: number;
    durationMinutes?: number;
    reason?: string;
    note?: string | null;
  }>);

const getCompletedPausedSeconds = (submission: OvertimeSubmission) =>
  getPauseLogs(submission).reduce((sum, log) => {
    if (typeof log.durationMs === "number") {
      return sum + Math.max(0, Math.floor(log.durationMs / 1000));
    }
    if (typeof log.durationSeconds === "number") {
      return sum + Math.max(0, Math.floor(log.durationSeconds));
    }
    if (typeof log.durationMinutes === "number") {
      return sum + Math.max(0, Math.floor(log.durationMinutes * 60));
    }
    const start = toDateSafe(log.pauseStart || log.startedAt);
    const end = toDateSafe(log.pauseEnd || log.endedAt);
    if (!start || !end) return sum;
    return sum + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  }, 0);

const getCurrentPauseSeconds = (submission: OvertimeSubmission, nowMs: number) => {
  if (getRealtimeLifecycleStatus(submission) !== "timer_paused") return 0;
  const activePauseStartedAt = toDateSafe((submission as any).pauseStartedAt);
  if (activePauseStartedAt) {
    return Math.max(0, Math.floor((nowMs - activePauseStartedAt.getTime()) / 1000));
  }
  const lastPause = [...getPauseLogs(submission)]
    .reverse()
    .find(
      (log) =>
        (log.pauseStart || log.startedAt) && !(log.pauseEnd || log.endedAt),
    );
  const pauseStart = toDateSafe(lastPause?.pauseStart || lastPause?.startedAt);
  if (!pauseStart) return 0;
  return Math.max(0, Math.floor((nowMs - pauseStart.getTime()) / 1000));
};

const getLiveGrossSeconds = (submission: OvertimeSubmission, nowMs: number) => {
  const started = toDateSafe((submission as any).timerStartedAt);
  if (!started) return Math.max(0, (submission.totalDurationMinutes || 0) * 60);
  const finished = toDateSafe((submission as any).timerFinishedAt);
  const endMs = finished?.getTime() || nowMs;
  return Math.max(0, Math.floor((endMs - started.getTime()) / 1000));
};

const getLiveNetSeconds = (submission: OvertimeSubmission, nowMs: number) => {
  const pausedSeconds =
    getCompletedPausedSeconds(submission) + getCurrentPauseSeconds(submission, nowMs);
  return Math.max(0, getLiveGrossSeconds(submission, nowMs) - pausedSeconds);
};

const getRealtimeBadgeClass = (status: string | null) => {
  if (status === "timer_running") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "timer_paused") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "timer_finished_pending_submit") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const isRevisionStatus = (status: string) =>
  status === "needs_revision" || status.startsWith("revision");

const getTimelineSteps = (
  status: string,
  supervisorName: string,
  submission: OvertimeSubmission,
) => {
  const realtimeLifecycle = getRealtimeLifecycleStatus(submission);
  if (realtimeLifecycle) {
    const states = {
      draft: {
        title: "Draft Persiapan",
        statusLabel: "Aktif",
        state: "active",
        description: "Timer belum dimulai.",
      },
      timer_running: {
        title: "Timer Berjalan",
        statusLabel: "Sedang Berjalan",
        state: "active",
        description: "Timer lembur sedang mencatat durasi kerja.",
      },
      timer_paused: {
        title: "Sedang Dijeda",
        statusLabel: "Dijeda",
        state: "revision",
        description: "Timer lembur sedang dijeda sementara.",
      },
      timer_finished_pending_submit: {
        title: "Siap Diajukan",
        statusLabel: "Siap Diajukan",
        state: "active",
        description: "Timer selesai. Tinjau preview sebelum mengirim pengajuan.",
      },
    } as const;
    const activeIndex =
      realtimeLifecycle === "draft"
        ? 0
        : realtimeLifecycle === "timer_running"
          ? 1
          : realtimeLifecycle === "timer_paused"
            ? 2
            : 4;
    const realtimeSteps = [
      {
        title: "Draft Persiapan",
        description: "Timer belum dimulai.",
      },
      {
        title: "Timer Berjalan",
        description: "Timer lembur sedang mencatat durasi kerja.",
      },
      {
        title: "Dijeda",
        description: "Opsional jika timer perlu dihentikan sementara.",
      },
      {
        title: "Selesai Timer",
        description: "Timer selesai mencatat durasi lembur.",
      },
      {
        title: "Preview & Kirim",
        description: "Tinjau preview lalu kirim sebagai pengajuan.",
      },
    ];

    return realtimeSteps.map((step, index) => {
      if (index === activeIndex) return states[realtimeLifecycle];
      return {
        title: step.title,
        statusLabel: index < activeIndex ? "Selesai" : "Menunggu",
        state: index < activeIndex ? "completed" : "pending",
        description: step.description,
      };
    });
  }

  const coordinatorDisplay =
    (submission as any).overtimeCoordinatorName || "pengawas/koordinator";
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
    title: "Review Koordinator",
    state:
      status === "pending_coordinator"
        ? "active"
        : status === "revision_coordinator"
          ? "revision"
          : status === "pending_supervisor" ||
              status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval" ||
              status === "approved" ||
              status === "approved_hrd" ||
              status === "needs_revision" ||
              status === "revision_manager" ||
              status === "revision_hrd" ||
              status === "rejected_manager" ||
              status === "rejected_hrd"
            ? "completed"
            : status === "rejected_coordinator" || status === "rejected"
              ? "rejected"
              : status === "cancelled"
                ? "cancelled"
                : "pending",
    statusLabel:
      status === "pending_coordinator"
        ? "Sedang Berjalan"
        : status === "revision_coordinator"
          ? "Revisi"
          : status === "pending_supervisor" ||
              status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval" ||
              status === "approved" ||
              status === "approved_hrd" ||
              status === "needs_revision" ||
              status === "revision_manager" ||
              status === "revision_hrd" ||
              status === "rejected_manager" ||
              status === "rejected_hrd"
            ? "Selesai"
            : status === "rejected_coordinator" || status === "rejected"
              ? "Ditolak"
              : status === "cancelled"
                ? "Dibatalkan"
                : "Menunggu",
    description:
      status === "pending_coordinator"
        ? `Menunggu persetujuan dari ${coordinatorDisplay}.`
        : status === "revision_coordinator"
          ? "Perlu direvisi sesuai catatan koordinator."
          : status === "rejected_coordinator" || status === "rejected"
            ? rejectionReason
              ? `Ditolak: ${rejectionReason}`
              : "Pengajuan ditolak dan tidak dilanjutkan."
            : status === "cancelled"
              ? cancellationReason
                ? `Dibatalkan: ${cancellationReason}`
                : "Pengajuan dibatalkan."
              : status !== "draft"
                ? "Koordinator telah menyetujui pengajuan."
                : "Akan dimulai setelah pengajuan dikirim.",
  };

  const step3 = {
    title: "Review Manager Divisi",
    state:
      status === "pending_supervisor"
        ? "active"
        : status === "needs_revision" || status === "revision_manager"
          ? "revision"
          : status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval"
            ? "completed"
            : status === "approved" ||
                status === "approved_hrd" ||
                status === "revision_hrd" ||
                status === "rejected_hrd"
              ? "completed"
              : status === "rejected_manager" ||
                  (status === "rejected" &&
                    !(submission as any).rejected_by_coordinator)
                ? "rejected"
                : status === "cancelled"
                  ? "cancelled"
                  : "pending",
    statusLabel:
      status === "pending_supervisor"
        ? "Sedang Berjalan"
        : status === "needs_revision" || status === "revision_manager"
          ? "Revisi"
          : status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval"
            ? "Selesai"
            : status === "approved" ||
                status === "approved_hrd" ||
                status === "revision_hrd" ||
                status === "rejected_hrd"
              ? "Selesai"
              : status === "rejected_manager" ||
                  (status === "rejected" &&
                    !(submission as any).rejected_by_coordinator)
                ? "Ditolak"
                : status === "cancelled"
                  ? "Dibatalkan"
                  : "Menunggu",
    description:
      status === "pending_supervisor"
        ? `Menunggu persetujuan dari ${supervisorDisplay}.`
        : status === "needs_revision" || status === "revision_manager"
          ? "Perlu direvisi sesuai catatan atasan sebelum dilanjutkan."
          : status === "pending_hrd" ||
              status === "pending_manager" ||
              status === "pending_approval" ||
              status === "approved" ||
              status === "approved_hrd" ||
              status === "revision_hrd" ||
              status === "rejected_hrd"
            ? "Atasan telah menyetujui pengajuan."
            : status === "rejected_manager" ||
                (status === "rejected" &&
                  !(submission as any).rejected_by_coordinator)
              ? rejectionReason
                ? `Ditolak: ${rejectionReason}`
                : "Pengajuan ditolak oleh manager."
              : status === "cancelled"
                ? cancellationReason
                  ? `Dibatalkan: ${cancellationReason}`
                  : "Pengajuan dibatalkan."
                : "Akan dimulai setelah koordinator menyetujui.",
  };

  const step4 = {
    title: "Review HRD",
    state:
      status === "pending_hrd" ||
      status === "pending_manager" ||
      status === "pending_approval"
        ? "active"
        : status === "approved" || status === "approved_hrd"
          ? "completed"
          : status === "revision_hrd"
            ? "revision"
            : status === "rejected_hrd"
              ? "rejected"
              : "pending",
    statusLabel:
      status === "pending_hrd" ||
      status === "pending_manager" ||
      status === "pending_approval"
        ? "Sedang Berjalan"
        : status === "approved" || status === "approved_hrd"
          ? "Selesai"
          : status === "revision_hrd"
            ? "Revisi"
            : status === "rejected_hrd"
              ? "Ditolak"
              : "Menunggu",
    description:
      status === "pending_hrd" ||
      status === "pending_manager" ||
      status === "pending_approval"
        ? "Menunggu review HRD."
        : status === "approved" || status === "approved_hrd"
          ? "HRD telah mereview dan menyetujui pengajuan."
          : status === "revision_hrd"
            ? "HRD meminta revisi pengajuan."
            : status === "rejected_hrd"
              ? "HRD menolak pengajuan."
              : "Akan diteruskan ke HRD setelah persetujuan atasan.",
  };

  const step5 = {
    title: "Selesai",
    state:
      status === "approved" || status === "approved_hrd"
        ? "completed"
        : status === "rejected" ||
            status === "rejected_coordinator" ||
            status === "rejected_manager" ||
            status === "rejected_hrd" ||
            status === "cancelled"
          ? "pending"
          : "pending",
    statusLabel:
      status === "approved" || status === "approved_hrd"
        ? "Selesai"
        : status === "rejected" ||
            status === "rejected_coordinator" ||
            status === "rejected_manager" ||
            status === "rejected_hrd"
          ? "Tidak Selesai"
          : status === "cancelled"
            ? "Dibatalkan"
            : "Menunggu",
    description:
      status === "approved" || status === "approved_hrd"
        ? "Pengajuan lembur telah disetujui."
        : status === "rejected" ||
            status === "rejected_coordinator" ||
            status === "rejected_manager" ||
            status === "rejected_hrd"
          ? "Pengajuan tidak selesai karena ditolak."
          : status === "cancelled"
            ? "Pengajuan dibatalkan sebelum proses selesai."
            : "Pengajuan selesai setelah review HRD.",
  };

  return [step1, step2, step3, step4, step5];
};

const isPendingStatus = (status: string) =>
  status === "pending_coordinator" ||
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
  if (status === "timer_running") {
    return {
      waitingFor: "Anda",
      nextStep: "Timer sedang mencatat durasi lembur. Pause atau selesaikan timer saat pekerjaan selesai.",
      alertVariant: "default" as const,
      activeStep: 0,
    };
  }

  if (status === "timer_paused") {
    return {
      waitingFor: "Anda",
      nextStep: "Timer sedang dijeda. Durasi bersih berhenti sampai timer dilanjutkan.",
      alertVariant: "warning" as const,
      activeStep: 0,
    };
  }

  if (status === "timer_finished_pending_submit") {
    return {
      waitingFor: "Anda",
      nextStep: "Timer selesai. Tinjau preview lalu kirim pengajuan untuk approval.",
      alertVariant: "warning" as const,
      activeStep: 0,
    };
  }

  if (status === "draft") {
    return {
      waitingFor: "Anda",
      nextStep: "Lengkapi draf dan kirim pengajuan lembur.",
      alertVariant: "warning" as const,
      activeStep: 0,
    };
  }

  if (status === "pending_coordinator") {
    return {
      waitingFor: "Pengawas/Koordinator",
      nextStep: "Menunggu review pengawas/koordinator.",
      alertVariant: "default" as const,
      activeStep: 1,
    };
  }

  if (status === "pending_supervisor" || status === "pending_manager") {
    return {
      waitingFor: "Manager Divisi",
      nextStep: "Menunggu persetujuan dari manager divisi.",
      alertVariant: "default" as const,
      activeStep: 2,
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
      activeStep: 3,
    };
  }

  if (
    status === "revision_coordinator" ||
    status === "revision_manager" ||
    status === "revision_hrd"
  ) {
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
      activeStep: 4,
    };
  }

  if (isRejectedStatus(status)) {
    return {
      waitingFor: "Selesai",
      nextStep: "Pengajuan lembur ditolak. Lihat detail untuk alasan.",
      alertVariant: "destructive" as const,
      activeStep: 4,
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
  const realtimeLifecycle = getRealtimeLifecycleStatus(submission);
  const statusMeta = getStatusMeta(status);
  waitingFor = statusMeta.waitingFor;
  nextStep = statusMeta.nextStep;
  alertVariant = statusMeta.alertVariant;
  const supervisorDisplay =
    status === "pending_supervisor" || status === "pending_manager"
      ? (submission as any).directSupervisorName || supervisorName
      : waitingFor;
  const workLocationLabel = getWorkLocationDisplay(submission);
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
          {realtimeLifecycle ? (
            <Badge className={getRealtimeBadgeClass(realtimeLifecycle)}>
              {realtimeLifecycleLabels[realtimeLifecycle]}
            </Badge>
          ) : (
            <OvertimeStatusBadge status={status} />
          )}
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
      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 p-4">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-300 mb-3">
          Timeline Status
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          {getTimelineSteps(status, supervisorDisplay, submission).map(
            (step, index) => {
              const isLast = index === 4;
              const stateStyles = {
                completed: {
                  ring: "bg-emerald-500 text-white border-emerald-500",
                  badge:
                    "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/20",
                  card: "border-emerald-200 dark:border-emerald-500/20 bg-white dark:bg-slate-900",
                },
                active: {
                  ring: "bg-sky-500 text-white border-sky-500",
                  badge: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-200 border border-sky-200 dark:border-sky-500/20",
                  card: "border-sky-200 dark:border-sky-500/20 bg-white dark:bg-slate-900",
                },
                revision: {
                  ring: "bg-amber-500 text-slate-950 border-amber-500",
                  badge:
                    "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-500/20",
                  card: "border-amber-200 dark:border-amber-500/20 bg-white dark:bg-slate-900",
                },
                pending: {
                  ring: "bg-slate-400 dark:bg-slate-700 text-white dark:text-slate-300 border-slate-300 dark:border-slate-600",
                  badge: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-500 border border-slate-200 dark:border-slate-700",
                  card: "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950",
                },
                rejected: {
                  ring: "bg-red-500 text-white border-red-500",
                  badge: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-500/20",
                  card: "border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-900",
                },
                cancelled: {
                  ring: "bg-red-500 text-white border-red-500",
                  badge: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-500/20",
                  card: "border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-900",
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
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {step.title}
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${styles.badge}`}
                        >
                          {step.statusLabel}
                        </span>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </div>
                  {!isLast && (
                    <div className="hidden md:block h-px bg-slate-200 dark:bg-slate-700 mt-4" />
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

const RealtimeActiveCard = ({
  submission,
  nowMs,
  onOpen,
}: {
  submission: OvertimeSubmission;
  nowMs: number;
  onOpen: (submission: OvertimeSubmission) => void;
}) => {
  const lifecycle = getRealtimeLifecycleStatus(submission);
  const statusLabel = realtimeLifecycleLabels[lifecycle || ""] || "Realtime";
  const isPaused = lifecycle === "timer_paused";
  const pausedSeconds =
    getCompletedPausedSeconds(submission) + getCurrentPauseSeconds(submission, nowMs);
  const overtimeTypeLabel =
    (submission as any).overtimeTypeLabel ||
    (submission.overtimeType ? overtimeTypeLabels[submission.overtimeType] : "-");
  const taskSummary =
    submission.reason ||
    (submission.tasks || (submission as any).taskDetails || [])
      .map((task: any) => task.description)
      .filter(Boolean)
    .join(", ") ||
    "Belum ada ringkasan pekerjaan.";
  const currentPauseReason =
    (submission as any).currentPauseReason ||
    [...getPauseLogs(submission)]
      .reverse()
      .find((log) => (log.pauseStart || log.startedAt) && !(log.pauseEnd || log.endedAt))
      ?.reason;

  return (
    <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm">
      <CardHeader className="border-b border-emerald-100">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">
                {isPaused ? "Lembur Sedang Dijeda" : "Lembur Sedang Berjalan"}
              </CardTitle>
              <Badge className={getRealtimeBadgeClass(lifecycle)}>
                {statusLabel}
              </Badge>
            </div>
            <CardDescription>
              {isPaused
                ? "Timer lembur sedang dijeda. Durasi lembur bersih berhenti sementara sampai Anda melanjutkan timer."
                : "Timer realtime tetap berjalan meskipun modal ditutup. Buka timer untuk menjeda atau menyelesaikan sesi."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onOpen(submission)}>
              <Clock className="mr-2 h-4 w-4" />
              Buka Timer
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpen(submission)}>
              {isPaused ? (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Lanjutkan Timer
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </>
              )}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onOpen(submission)}>
              <Square className="mr-2 h-4 w-4" />
              Selesaikan
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-emerald-100 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Durasi Bersih
          </p>
          <p className="mt-2 font-mono text-4xl font-bold text-emerald-700">
            {formatElapsedSeconds(getLiveNetSeconds(submission, nowMs))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mulai {formatClock((submission as any).timerStartedAt)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isPaused ? "Jeda Saat Ini" : "Total Jeda"}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatElapsedSeconds(
              isPaused ? getCurrentPauseSeconds(submission, nowMs) : pausedSeconds,
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Total jeda: {formatElapsedSeconds(pausedSeconds)}
          </p>
          {isPaused && currentPauseReason && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              Alasan jeda: {currentPauseReason}
            </p>
          )}
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
          <div>
            <p className="text-xs text-muted-foreground">Lokasi Kerja</p>
            <p className="font-semibold">{getWorkLocationDisplay(submission)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tipe Lembur</p>
            <p className="font-semibold">{overtimeTypeLabel}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ringkasan Pekerjaan
          </p>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-700">
            {taskSummary}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export function PengajuanLemburClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const normalizedUserRole = userProfile?.role?.toLowerCase() || "";
  const normalizedStructuralLevel = (
    userProfile?.structuralLevel || ""
  ).toLowerCase();
  const blockedOvertimeRoles = new Set([
    "manager",
    "manager divisi",
    "hrd",
    "super-admin",
    "management",
    "manajemen",
    "director",
    "direktur",
  ]);
  const blockedOvertimeLevels = new Set(["management", "division_manager"]);
  const canSubmitOvertime =
    !!userProfile &&
    !blockedOvertimeRoles.has(normalizedUserRole) &&
    !blockedOvertimeLevels.has(normalizedStructuralLevel);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] =
    useState<OvertimeSubmission | null>(null);
  const [formMode, setFormMode] = useState<"view" | "edit">("edit");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCancellationDialogOpen, setIsCancellationDialogOpen] =
    useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

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

  const { data: employeeProfileDoc, isLoading: isLoadingProfileDoc } =
    useDoc<EmployeeProfile>(
      useMemoFirebase(
        () =>
          userProfile
            ? doc(firestore, "employee_profiles", userProfile.uid)
            : null,
        [userProfile, firestore],
      ),
    );

  const { data: employeesDoc, isLoading: isLoadingEmployeesDoc } =
    useDoc<EmployeeProfile>(
      useMemoFirebase(
        () =>
          userProfile && !employeeProfileDoc
            ? doc(firestore, "employees", userProfile.uid)
            : null,
        [userProfile, firestore, employeeProfileDoc],
      ),
    );

  const employeeProfile =
    employeeProfileDoc ||
    employeesDoc ||
    (userProfile as unknown as EmployeeProfile);
  const isLoadingProfile = isLoadingProfileDoc || isLoadingEmployeesDoc;

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
      timerActive: 0,
      timerPaused: 0,
      readyToSubmit: 0,
      pending: 0,
      approved: 0,
      revision: 0,
      rejected: 0,
    };
    if (!submissions) return kpis;
    submissions.forEach((s) => {
      const status = getSubmissionStatus(s);
      const lifecycle = getRealtimeLifecycleStatus(s);
      if (lifecycle === "timer_running") {
        kpis.timerActive++;
        return;
      }
      if (lifecycle === "timer_paused") {
        kpis.timerPaused++;
        return;
      }
      if (lifecycle === "timer_finished_pending_submit") {
        kpis.readyToSubmit++;
        return;
      }
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

  const existingRealtimeDrafts = useMemo(() => {
    if (!submissions) return [];
    return submissions
      .filter((s) => {
        const inputMode = (s as any).inputMode;
        const status = getSubmissionStatus(s);
        return (
          inputMode === "realtime" &&
          ["draft", "timer_running", "timer_paused", "timer_finished_pending_submit"].includes(status)
        );
      })
      .sort((a, b) => {
        const aTime =
          (a as any).updatedAt?.toMillis?.() ||
          (a as any).createdAt?.toMillis?.() ||
          0;
        const bTime =
          (b as any).updatedAt?.toMillis?.() ||
          (b as any).createdAt?.toMillis?.() ||
          0;
        return bTime - aTime;
      });
  }, [submissions]);

  const activeRealtimeSubmission = useMemo(() => {
    if (!submissions) return null;
    return [...submissions]
      .filter(isRealtimeActiveStatus)
      .sort((a, b) => {
        const aTime =
          (a as any).timerStartedAt?.toMillis?.() ||
          (a as any).updatedAt?.toMillis?.() ||
          0;
        const bTime =
          (b as any).timerStartedAt?.toMillis?.() ||
          (b as any).updatedAt?.toMillis?.() ||
          0;
        return bTime - aTime;
      })[0] || null;
  }, [submissions]);

  const handleCreate = () => {
    if (!canSubmitOvertime) return;
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

  const handleCloseModal = () => {
    setIsFormOpen(false);
    setSelectedSubmission(null);
    setFormMode("edit");
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
          <Button
            onClick={handleCreate}
            disabled={!canSubmitOvertime}
            title={
              !canSubmitOvertime
                ? "Hanya staff/karyawan operasional dapat mengajukan lembur."
                : undefined
            }
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Buat Pengajuan
          </Button>
        </div>

        <LatestSubmissionCard
          submission={latestSubmission}
          supervisorName={employeeProfile?.supervisorName || "Manajer Divisi"}
          onActionClick={handleAction}
        />

        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <KpiCard title="Draft Persiapan" value={summary.draft} />
          <KpiCard title="Timer Aktif" value={summary.timerActive} />
          <KpiCard
            title="Dijeda"
            value={summary.timerPaused}
            deltaType="inverse"
          />
          <KpiCard title="Siap Diajukan" value={summary.readyToSubmit} />
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

        {activeRealtimeSubmission && (
          <RealtimeActiveCard
            submission={activeRealtimeSubmission}
            nowMs={nowMs}
            onOpen={(submission) => handleAction("edit", submission)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Pengajuan</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {sortedSubmissions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Tanggal
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Jam
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Durasi
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Lokasi
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Ringkasan Pekerjaan
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSubmissions.map((s) => {
                    const status = getSubmissionStatus(s);
                    const lifecycle = getRealtimeLifecycleStatus(s);
                    const isActiveRealtime = isRealtimeActiveStatus(s);
                    const isReadyRealtime = isRealtimeReadyToSubmit(s);
                    const overtimeDate =
                      (s as any).overtimeDate?.toDate?.() ?? s.date?.toDate?.();
                    const locationLabel = getWorkLocationDisplay(s);
                    const rowStatusLabel =
                      realtimeLifecycleLabels[lifecycle || ""] ||
                      approvalStatusLabel[status] ||
                      status;
                    const actionLabel =
                      lifecycle === "timer_paused"
                        ? "Lanjutkan Timer"
                        : lifecycle === "timer_running"
                          ? "Buka Timer"
                          : lifecycle === "timer_finished_pending_submit"
                            ? "Preview & Kirim"
                            : status === "draft"
                              ? "Lihat Draf"
                              : status === "rejected"
                                ? "Lihat Alasan"
                                : "Lihat Detail";

                    return (
                      <TableRow
                        key={s.id}
                        className={`border-b transition-colors hover:bg-muted ${
                          isActiveRealtime
                            ? "bg-emerald-50/70 hover:bg-emerald-50"
                            : isReadyRealtime
                              ? "bg-blue-50/60 hover:bg-blue-50"
                              : lifecycle === "draft"
                                ? "bg-slate-50/60 hover:bg-slate-100/70"
                                : ""
                        }`}
                      >
                        <TableCell className="px-3 py-3 align-top">
                          {overtimeDate
                            ? format(overtimeDate, "dd MMM yyyy", {
                                locale: idLocale,
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          <div className="text-sm">{s.startTime || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.endTime || '-'}
                          </div>
                          {(s as any).inputMode === "realtime" && (
                            <span
                              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isActiveRealtime
                                  ? "bg-emerald-100 text-emerald-700"
                                  : isReadyRealtime
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              Realtime
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {isActiveRealtime ? (
                            <div>
                              <p className="font-mono font-semibold text-emerald-700">
                                {formatElapsedSeconds(getLiveNetSeconds(s, nowMs))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {lifecycle === "timer_paused"
                                  ? `Total jeda: ${formatElapsedSeconds(
                                      getCompletedPausedSeconds(s) +
                                        getCurrentPauseSeconds(s, nowMs),
                                    )}`
                                  : "Timer Aktif"}
                              </p>
                            </div>
                          ) : (
                            formatDurationFromMinutes(s.totalDurationMinutes)
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {locationLabel}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top text-sm text-muted-foreground truncate">
                          {s.reason || "Tidak ada ringkasan pekerjaan."}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {lifecycle ? (
                            <Badge className={getRealtimeBadgeClass(lifecycle)}>
                              {rowStatusLabel}
                            </Badge>
                          ) : (
                            <OvertimeStatusBadge
                              status={status as any}
                              payrollStatus={s.payrollStatus}
                            />
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top text-right">
                          <Button
                            size="sm"
                            variant={lifecycle ? "default" : "secondary"}
                            onClick={() =>
                              handleAction(lifecycle ? "edit" : "view", s)
                            }
                          >
                            {actionLabel}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
        onOpenChange={handleCloseModal}
        submission={selectedSubmission}
        employeeProfile={employeeProfile}
        brands={brands || []}
        formMode={formMode}
        onSuccess={mutate}
        onRequestEdit={() => setFormMode("edit")}
        existingRealtimeDrafts={existingRealtimeDrafts}
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
