"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  PlusCircle,
  Trash2,
  Send,
  UserCheck,
  Mail,
  MapPin,
  Zap,
  AlertTriangle,
  Upload,
  X,
  FileText,
  Image,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
} from "@/firebase";
import { sendNotification } from "@/lib/notifications";
import {
  doc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
} from "firebase/firestore";
import { OvertimeStatusBadge } from "./OvertimeStatusBadge";
import type {
  OvertimeSubmission,
  UserProfile,
  EmployeeProfile,
  Brand,
} from "@/lib/types";
import {
  resolveApprovalTarget,
  type DivisionMasterOrganization,
} from "@/lib/approval-flow";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { format, differenceInMinutes, set, addDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const taskSchema = z.object({
  description: z.string().min(1, "Uraian tugas harus diisi."),
  estimatedMinutes: z.coerce
    .number()
    .int()
    .min(1, "Estimasi harus lebih dari 0 menit."),
});

const submissionSchema = z
  .object({
    date: z.date({ required_error: "Tanggal lembur harus diisi." }),
    startTime: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
    endTime: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
    overtimeType: z.enum(["hari_kerja", "hari_libur", "urgent"], {
      required_error: "Tipe lembur harus dipilih.",
    }),
    tasks: z.array(taskSchema).min(1, "Minimal harus ada satu rincian tugas."),
    reason: z
      .string()
      .min(10, { message: "Alasan lembur harus diisi (minimal 10 karakter)." }),
    location: z.enum(["kantor", "remote", "site"], {
      required_error: "Lokasi harus dipilih.",
    }),
    overtimeCoordinatorUid: z
      .string({ required_error: "Koordinator/Pengawas lembur harus dipilih." })
      .min(1, "Koordinator/Pengawas lembur harus dipilih."),
    overtimeInstructionNote: z.string().optional().default(""),
    employeeNotes: z.string().optional(),
    attachments: z.array(z.string()).optional().default([]),
  })
  .refine(
    (data) => {
      // Validate that end time is after start time
      if (!data.startTime || !data.endTime) return true;
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return endMinutes > startMinutes;
    },
    {
      message: "Jam selesai harus lebih besar dari jam mulai.",
      path: ["endTime"],
    },
  )
  .refine(
    (data) => {
      // Validate that total duration is greater than 0
      if (!data.startTime || !data.endTime) return true;
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return endMinutes - startMinutes > 0;
    },
    {
      message: "Durasi lembur tidak boleh 0 menit.",
      path: ["endTime"],
    },
  );

type FormValues = z.infer<typeof submissionSchema>;

// Helper function to normalize employee type labels
const normalizeEmployeeType = (employeeType?: string): string => {
  if (!employeeType) return "Belum Diatur";

  const normalized = employeeType.toLowerCase().trim();

  switch (normalized) {
    case "tetap":
    case "karyawan tetap":
      return "Tetap";
    case "kontrak":
      return "Kontrak";
    case "probation":
    case "percobaan":
      return "Probation";
    case "magang":
      return "Magang";
    default:
      // Return original with first letter capitalized
      return employeeType.charAt(0).toUpperCase() + employeeType.slice(1);
  }
};

interface OvertimeSubmissionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission | null;
  employeeProfile: EmployeeProfile | null;
  brands: Brand[];
  onSuccess: () => void;
  formMode: "view" | "edit";
  onRequestEdit?: () => void;
}

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div className="flex justify-between items-start gap-4">
    <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    <p className="text-base font-semibold text-right">{value || "-"}</p>
  </div>
);

const parseSafeDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string" || value instanceof Date) {
    return new Date(value);
  }
  return null;
};

const ReviewCard = ({
  title,
  decisionAt,
  notes,
}: {
  title: string;
  decisionAt?: Timestamp | null;
  notes?: string | null;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-semibold flex items-center gap-2">
        <UserCheck className="h-4 w-4" /> {title}
      </CardTitle>
      <p className="text-xs text-muted-foreground pt-1">
        {decisionAt
          ? format(decisionAt.toDate(), "dd MMM yyyy, HH:mm", {
              locale: idLocale,
            })
          : "Belum direview"}
      </p>
    </CardHeader>
    <CardContent>
      {notes ? (
        <p className="text-sm italic text-muted-foreground">"{notes}"</p>
      ) : (
        <p className="text-sm text-muted-foreground">Tidak ada catatan.</p>
      )}
    </CardContent>
  </Card>
);

const OvertimeSubmissionDetailView = ({
  submission,
  onRequestEdit,
  canEdit,
  onClose,
}: {
  submission: OvertimeSubmission;
  onRequestEdit?: () => void;
  canEdit: boolean;
  onClose: () => void;
}) => {
  const currentStatus =
    (submission as any)?.approvalStatus || submission.status || "draft";
  const submittedAt = parseSafeDate(
    (submission as any)?.submittedAt ?? submission.createdAt,
  );
  const supervisorViewedAt = parseSafeDate(
    (submission as any)?.supervisorViewedAt,
  );
  const managerReviewAt = parseSafeDate(
    submission.managerDecisionAt || submission.supervisorApprovedAt,
  );
  const hrdReviewAt = parseSafeDate(submission.hrdDecisionAt);
  const finalAt = parseSafeDate(
    submission.hrdDecisionAt ||
      submission.rejectedAt ||
      (submission as any)?.cancelledAt ||
      submission.updatedAt,
  );
  const coordinatorName =
    (submission as any).overtimeCoordinatorName ||
    (submission as any).overtimeCoordinatorDisplayName ||
    "Koordinator/Pengawas";
  const coordinatorPosition =
    (submission as any).overtimeCoordinatorPosition ||
    (submission as any).overtimeCoordinatorRole ||
    "Pengawas/Koordinator";
  const managerName =
    (submission as any).managerName ||
    (submission as any).directSupervisorName ||
    (submission as any).supervisorName ||
    "Manager Divisi";
  const managerDivisionName =
    (submission as any).managerDivisionName || submission.divisionName || "-";
  const managerUid =
    submission.managerUid || (submission as any).directSupervisorUid || null;
  const coordinatorUid = submission.overtimeCoordinatorUid || null;
  const isCoordinatorSameAsManager =
    !!coordinatorUid && !!managerUid && coordinatorUid === managerUid;
  const taskList = submission.tasks || (submission as any).taskDetails || [];
  const totalEstimated = taskList.reduce(
    (sum: number, task: any) => sum + (task.estimatedMinutes || 0),
    0,
  );
  const totalDuration = submission.totalDurationMinutes || 0;
  const remainingDuration = totalDuration - totalEstimated;
  const locationLabel =
    submission.workLocationLabel ||
    submission.workLocation ||
    (submission.location === "kantor"
      ? "Kantor"
      : submission.location === "remote"
        ? "Remote"
        : submission.location === "site"
          ? "Site/Lokasi Klien"
          : submission.location || "-");
  const overtimeTypeLabel =
    submission.overtimeType === "hari_kerja"
      ? "Hari Kerja"
      : submission.overtimeType === "hari_libur"
        ? "Hari Libur"
        : submission.overtimeType === "urgent"
          ? "Urgent"
          : "-";
  const reasonText = submission.reason || "-";
  const employeeNoteText = submission.employeeNotes || "-";
  const revisionNoteText = submission.revisionNote;
  const rejectionReasonText = submission.rejectionReason;
  const hrdNotesText = submission.hrdNotes;
  const managerNotesText = submission.managerNotes;

  const stepStyles = (state: string) => {
    switch (state) {
      case "Selesai":
        return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
      case "Sedang Berjalan":
        return "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
      case "Menunggu":
        return "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
      case "Ditolak":
        return "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300";
      case "Revisi":
      case "Revisi Diminta":
        return "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
      case "Dibatalkan":
        return "bg-slate-500/10 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300";
      default:
        return "bg-slate-500/10 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300";
    }
  };

  const getStageStatus = (stage: string) => {
    if (stage === "coordinator") {
      if (currentStatus === "pending_coordinator") {
        return "Menunggu";
      }
      if (
        currentStatus === "rejected" ||
        currentStatus === "rejected_coordinator"
      ) {
        return "Ditolak";
      }
      if (
        currentStatus === "needs_revision" ||
        currentStatus === "revision_coordinator"
      ) {
        return "Revisi Diminta";
      }
      return submittedAt ? "Selesai" : "Menunggu";
    }

    if (stage === "manager") {
      if (currentStatus === "pending_coordinator") {
        return "Menunggu";
      }
      if (currentStatus === "pending_supervisor") {
        return supervisorViewedAt ? "Sedang Berjalan" : "Menunggu";
      }
      if (
        currentStatus === "rejected" ||
        currentStatus === "rejected_manager"
      ) {
        return "Ditolak";
      }
      if (
        currentStatus === "needs_revision" ||
        currentStatus === "revision_manager"
      ) {
        return "Revisi Diminta";
      }
      return managerReviewAt ? "Selesai" : "Menunggu";
    }

    if (stage === "hrd") {
      if (
        currentStatus === "pending_hrd" ||
        currentStatus === "approved_by_manager"
      ) {
        return "Sedang Berjalan";
      }
      if (currentStatus === "revision_hrd") {
        return "Revisi Diminta";
      }
      if (currentStatus === "rejected_hrd") {
        return "Ditolak";
      }
      if (["approved", "approved_hrd"].includes(currentStatus)) {
        return "Selesai";
      }
      return hrdReviewAt ? "Selesai" : "Menunggu";
    }

    if (stage === "complete") {
      if (["approved", "approved_hrd"].includes(currentStatus))
        return "Disetujui";
      if (["rejected", "rejected_hrd"].includes(currentStatus))
        return "Ditolak";
      if (currentStatus === "cancelled") return "Dibatalkan";
      if (
        currentStatus === "needs_revision" ||
        currentStatus === "revision_manager" ||
        currentStatus === "revision_hrd"
      )
        return "Revisi Diminta";
      return "Belum selesai";
    }

    return "Menunggu";
  };

  const timeline = [
    {
      title: "Pengajuan Dikirim",
      state: submittedAt ? "Selesai" : "Menunggu",
      date: submittedAt,
      description:
        submittedAt != null
          ? "Pengajuan telah dikirim dan menunggu proses selanjutnya."
          : "Pengajuan belum dikirim.",
      icon: <CheckCircle className="h-4 w-4" />,
    },
    {
      title: isCoordinatorSameAsManager
        ? "Review Koordinator & Manager Divisi"
        : "Review Koordinator",
      state: getStageStatus("coordinator"),
      date: parseSafeDate(
        (submission as any)?.coordinatorViewedAt ||
          (submission as any)?.coordinatorApprovedAt,
      ),
      detail: coordinatorName,
      description:
        currentStatus === "pending_coordinator"
          ? "Koordinator belum meninjau pengajuan."
          : currentStatus === "pending_supervisor" ||
              currentStatus === "pending_hrd"
            ? "Koordinator telah menyetujui pengajuan."
            : currentStatus === "needs_revision" ||
                currentStatus === "revision_coordinator"
              ? "Koordinator meminta revisi pengajuan."
              : currentStatus === "rejected" ||
                  currentStatus === "rejected_coordinator"
                ? "Koordinator menolak pengajuan."
                : "Koordinator telah menyetujui pengajuan.",
      icon: <UserCheck className="h-4 w-4" />,
    },
    ...(!isCoordinatorSameAsManager
      ? [
          {
            title: "Review Manager Divisi",
            state: getStageStatus("manager"),
            date: managerReviewAt,
            detail: managerName,
            description:
              currentStatus === "pending_coordinator"
                ? "Manager divisi menunggu keputusan koordinator."
                : currentStatus === "pending_supervisor"
                  ? supervisorViewedAt
                    ? "Manager divisi sudah membaca pengajuan dan sedang meninjaunya."
                    : "Manager divisi belum membaca pengajuan."
                  : currentStatus === "needs_revision" ||
                      currentStatus === "revision_manager"
                    ? "Manager meminta revisi pengajuan."
                    : currentStatus === "rejected" ||
                        currentStatus === "rejected_manager"
                      ? "Manager menolak pengajuan."
                      : "Manager divisi telah menyetujui pengajuan.",
            icon: <UserCheck className="h-4 w-4" />,
          },
        ]
      : []),
    {
      title: "Review HRD",
      state: getStageStatus("hrd"),
      date: hrdReviewAt,
      detail: "HRD",
      description:
        currentStatus === "pending_hrd" ||
        currentStatus === "approved_by_manager"
          ? "Pengajuan sudah diteruskan ke HRD dan menunggu review."
          : currentStatus === "revision_hrd"
            ? "HRD meminta revisi pengajuan."
            : currentStatus === "rejected_hrd"
              ? "HRD menolak pengajuan."
              : "HRD telah meninjau pengajuan.",
      icon: <Mail className="h-4 w-4" />,
    },
    {
      title: "Selesai",
      state: getStageStatus("complete"),
      date: finalAt,
      description:
        currentStatus === "approved" || currentStatus === "approved_hrd"
          ? "Pengajuan telah disetujui dan selesai."
          : currentStatus === "rejected" || currentStatus === "rejected_hrd"
            ? "Pengajuan ditolak dan proses selesai."
            : currentStatus === "cancelled"
              ? "Pengajuan dibatalkan."
              : "Proses masih berjalan.",
      icon: <CheckCircle className="h-4 w-4" />,
    },
  ];

  return (
    <DialogContent className="w-[90vw] max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <DialogTitle>Detail Pengajuan Lembur</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Bukti dan progres persetujuan lembur Anda.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
        {/* Timeline Persetujuan - First Section */}
        <section className="rounded-3xl border border-border bg-muted p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-border mb-4">
            <div>
              <p className="text-sm font-semibold">Timeline Persetujuan</p>
              <p className="text-xs text-muted-foreground">
                Lihat progres pengajuan Anda secara real-time.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {timeline.map((step, index) => (
              <div
                key={step.title}
                className="relative rounded-3xl border border-border bg-background p-4"
              >
                {index < timeline.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-2 w-4 h-0.5 bg-border transform -translate-y-1/2 z-0" />
                )}
                <div className="flex flex-col items-center text-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl ${step.state === "Selesai" ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : step.state === "Sedang Berjalan" ? "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "bg-slate-500/10 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300"}`}
                  >
                    {step.icon}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${stepStyles(step.state)}`}
                    >
                      {step.state}
                    </span>
                    {step.detail && (
                      <p className="text-xs text-muted-foreground">
                        {step.detail}
                      </p>
                    )}
                    {step.date && (
                      <p className="text-xs text-muted-foreground">
                        {format(step.date, "dd MMM yyyy, HH:mm", {
                          locale: idLocale,
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ringkasan Lembur */}
        <Card className="rounded-3xl border border-border bg-muted p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Informasi Lembur
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Detail pengajuan lembur Anda.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  {
                    label: "Tanggal lembur",
                    value: submittedAt
                      ? format(submittedAt, "dd MMM yyyy", {
                          locale: idLocale,
                        })
                      : "-",
                    icon: <Clock className="h-4 w-4 text-slate-500" />,
                  },
                  {
                    label: "Jam mulai - selesai",
                    value:
                      submission.startTime && submission.endTime
                        ? `${submission.startTime} - ${submission.endTime}`
                        : "-",
                    icon: <Clock className="h-4 w-4 text-slate-500" />,
                  },
                  {
                    label: "Total durasi",
                    value: `${totalDuration} menit`,
                    icon: <CheckCircle className="h-4 w-4 text-slate-500" />,
                  },
                  {
                    label: "Lokasi kerja",
                    value: locationLabel,
                    icon: <MapPin className="h-4 w-4 text-slate-500" />,
                  },
                  {
                    label: "Tipe lembur",
                    value: overtimeTypeLabel,
                    icon: <Zap className="h-4 w-4 text-slate-500" />,
                  },
                  ...(submission.approvedMinutesFinal !== undefined &&
                  submission.approvedMinutesFinal !== null
                    ? [
                        {
                          label: "Durasi Final HRD",
                          value: `${Math.floor(submission.approvedMinutesFinal / 60)} jam ${submission.approvedMinutesFinal % 60} menit`,
                          icon: (
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                          ),
                        },
                        {
                          label: "Status Proses Payroll",
                          value:
                            submission.payrollStatus === "paid"
                              ? "Sudah Dibayarkan"
                              : submission.payrollStatus === "processing"
                                ? "Lembur sedang diproses payroll."
                                : submission.payrollStatus === "excluded"
                                  ? "Tidak Masuk Payroll"
                                  : "Lembur sudah disetujui HRD dan menunggu proses payroll.",
                          icon: <Zap className="h-4 w-4 text-emerald-400" />,
                        },
                      ]
                    : []),
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                      {item.icon}
                      <p className="text-sm font-medium">{item.label}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Alur Tujuan
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Proses persetujuan pengajuan.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <UserCheck className="h-4 w-4" />
                    <p className="text-sm font-medium">Koordinator/Pengawas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {coordinatorName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {coordinatorPosition}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <UserCheck className="h-4 w-4" />
                    <p className="text-sm font-medium">Manager Divisi</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {managerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {managerDivisionName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Mail className="h-4 w-4" />
                    <p className="text-sm font-medium">HRD</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Final approval
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <section className="rounded-3xl border border-border bg-muted p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-border mb-4">
            <div>
              <p className="text-sm font-semibold">Rincian Pekerjaan</p>
              <p className="text-xs text-muted-foreground">
                Rincian tugas lembur yang Anda ajukan.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              Total estimasi: {totalEstimated} menit
              <br />
              Sisa durasi: {remainingDuration} menit
            </div>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground w-12">
                    No
                  </TableHead>
                  <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    Uraian Tugas
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground w-28">
                    Estimasi menit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskList.length > 0 ? (
                  taskList.map((task: any, index: number) => (
                    <TableRow key={index} className="border-b last:border-0">
                      <TableCell className="px-3 py-3 text-sm text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-sm">
                        {task.description || "-"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right text-sm font-semibold">
                        {task.estimatedMinutes ?? 0}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="px-3 py-4 text-sm text-muted-foreground text-center"
                    >
                      Tidak ada rincian tugas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-3xl border border-border bg-muted p-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Alasan Lembur
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {reasonText}
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border bg-muted p-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Catatan Karyawan
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {employeeNoteText}
            </CardContent>
          </Card>
        </section>

        {(revisionNoteText ||
          rejectionReasonText ||
          hrdNotesText ||
          managerNotesText) && (
          <section className="grid gap-4 lg:grid-cols-2">
            {revisionNoteText && (
              <Card className="rounded-3xl border border-border bg-muted p-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Catatan Revisi
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {revisionNoteText}
                </CardContent>
              </Card>
            )}
            {rejectionReasonText && (
              <Card className="rounded-3xl border border-border bg-muted p-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Alasan Ditolak
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {rejectionReasonText}
                </CardContent>
              </Card>
            )}
            {hrdNotesText && (
              <Card className="rounded-3xl border border-border bg-muted p-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Catatan HRD
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {hrdNotesText}
                </CardContent>
              </Card>
            )}
            {managerNotesText && (
              <Card className="rounded-3xl border border-border bg-muted p-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Catatan Manager
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {managerNotesText}
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>

      <DialogFooter className="sticky bottom-0 z-10 border-t bg-background/95 px-6 py-4 backdrop-blur flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Tutup
        </Button>
        {canEdit && onRequestEdit && (
          <Button variant="secondary" onClick={onRequestEdit}>
            Edit Pengajuan
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
};

export function OvertimeSubmissionForm({
  open,
  onOpenChange,
  submission,
  employeeProfile,
  brands,
  onSuccess,
  formMode,
  onRequestEdit,
}: OvertimeSubmissionFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
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

  const staffBrandId = useMemo(() => {
    // Try employeeProfile first, then userProfile
    const brandId = employeeProfile?.brandId || userProfile?.brandId;
    if (!brandId) return "";
    return Array.isArray(brandId) ? brandId[0] : brandId;
  }, [employeeProfile?.brandId, userProfile?.brandId]);

  const staffDivisionId = useMemo(() => {
    const hrd = employeeProfile?.hrdEmploymentInfo;
    return (
      hrd?.divisionName ||
      hrd?.divisionId ||
      employeeProfile?.division ||
      (userProfile as any)?.managedDivision ||
      (userProfile as any)?.division ||
      ""
    );
  }, [
    employeeProfile?.hrdEmploymentInfo,
    employeeProfile?.division,
    (userProfile as any)?.managedDivision,
    (userProfile as any)?.division,
  ]);

  const staffBrandName = useMemo(() => {
    const hrd = employeeProfile?.hrdEmploymentInfo;
    return (
      hrd?.brandName ||
      (employeeProfile as any)?.brandName ||
      brands.find((b) => b.id === staffBrandId)?.name ||
      ""
    );
  }, [employeeProfile, staffBrandId, brands]);

  // Fetch division master document — try query by name, also try by doc ID
  const divisionNameQuery = useMemoFirebase(() => {
    if (!firestore || !staffBrandId || !staffDivisionId) return null;
    return query(
      collection(firestore, "brands", staffBrandId, "divisions"),
      where("name", "==", staffDivisionId),
    );
  }, [firestore, staffBrandId, staffDivisionId]);

  const { data: divisionsResult } =
    useCollection<DivisionMasterOrganization>(divisionNameQuery);

  // Also try fetching by document ID (in case the doc ID IS the division name)
  const divisionDocRef = useMemoFirebase(() => {
    if (!firestore || !staffBrandId || !staffDivisionId) return null;
    return doc(firestore, "brands", staffBrandId, "divisions", staffDivisionId);
  }, [firestore, staffBrandId, staffDivisionId]);

  const { data: divisionDocById } =
    useDoc<DivisionMasterOrganization>(divisionDocRef);

  const divisionMaster = useMemo(() => {
    // Prefer result from name query, fallback to doc-by-ID
    return divisionsResult?.[0] || divisionDocById || null;
  }, [divisionsResult, divisionDocById]);

  const coordinatorsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "users"));
  }, [firestore]);

  const { data: allUsers } = useCollection<any>(coordinatorsQuery);

  const eligibleCoordinators = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter((u) => {
      const role = u.role;
      const level = u.structuralLevel;
      // Exclude super-admin
      const isEligibleRole =
        role === "manager" ||
        role === "direktur" ||
        role === "management" ||
        role === "director";
      const isEligibleLevel =
        level === "management" ||
        level === "division_manager" ||
        level === "coordinator" ||
        level === "supervisor" ||
        level === "mandor";
      return (isEligibleRole || isEligibleLevel) && u.uid !== userProfile?.uid;
    });
  }, [allUsers, userProfile?.uid]);

  const mode = submission ? (formMode === "view" ? "View" : "Edit") : "Buat";
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(submissionSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      tasks: [{ description: "", estimatedMinutes: 60 }],
      attachments: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tasks",
  });

  const { watch, setValue } = form;
  const startTimeStr = watch("startTime");
  const endTimeStr = watch("endTime");
  const tasks = watch("tasks");

  const displayInfo = useMemo(() => {
    const brandMap = new Map(brands.map((b) => [b.id!, b.name]));
    const hrd = employeeProfile?.hrdEmploymentInfo;

    // Get employee type from HRD data, fallback to user profile
    const employeeType = hrd?.employeeType || userProfile?.employmentType;
    const normalizedEmployeeType = normalizeEmployeeType(employeeType);

    // Priority: HRD Employment Info → Profile → User Profile
    const brandName =
      hrd?.brandName ||
      employeeProfile?.brandName ||
      (() => {
        const brandId = employeeProfile?.brandId || userProfile?.brandId;
        const singleBrandId = Array.isArray(brandId) ? brandId[0] : brandId;
        return singleBrandId ? brandMap.get(singleBrandId) : "-";
      })() ||
      "-";

    const divisionName =
      hrd?.divisionName ||
      employeeProfile?.division ||
      userProfile?.managedDivision ||
      userProfile?.division ||
      "-";

    const rawStructuralLevel =
      hrd?.structuralLevel ||
      (employeeProfile as any)?.structuralLevel ||
      userProfile?.structuralLevel;
    const structuralLabel =
      rawStructuralLevel === "management"
        ? "Manajemen"
        : rawStructuralLevel === "division_manager"
          ? "Manager Divisi"
          : rawStructuralLevel === "staff"
            ? "Staf"
            : undefined;

    const fallbackWorkRole = (() => {
      if (userProfile?.positionTitle) {
        return userProfile.positionTitle;
      } else if (
        userProfile?.isDivisionManager &&
        userProfile.managedDivision
      ) {
        return `Manager Divisi ${userProfile.managedDivision}`;
      } else {
        let baseTitle = "Staf";
        const stage =
          userProfile?.employmentStage || userProfile?.employmentType;
        switch (stage) {
          case "intern_education":
            baseTitle = "Peserta Magang";
            break;
          case "intern_pre_probation":
            baseTitle = "Peserta Magang Pra-Probation";
            break;
          case "probation":
          case "training":
            baseTitle = "Staf Probation";
            break;
          case "karyawan":
          case "active":
            baseTitle = "Staf";
            break;
          case "magang":
            baseTitle = "Peserta Magang";
            break;
          default:
            if (userProfile?.role === "manager") baseTitle = "Manager";
            break;
        }

        if (divisionName && divisionName !== "-") {
          return `${baseTitle} ${divisionName}`;
        } else {
          return baseTitle;
        }
      }
    })();

    const rawWorkRole =
      hrd?.workRole ||
      (employeeProfile as any)?.workRole ||
      userProfile?.workRole ||
      employeeProfile?.positionTitle ||
      fallbackWorkRole;

    const positionTitle = structuralLabel
      ? rawWorkRole
        ? `${structuralLabel} / ${rawWorkRole}`
        : structuralLabel
      : rawWorkRole || "-";

    return {
      fullName: employeeProfile?.fullName || userProfile?.fullName || "",
      employmentStatus: normalizedEmployeeType,
      brandName: brandName,
      division: divisionName,
      positionTitle,
    };
  }, [userProfile, employeeProfile, brands]);

  const selectedCoordinatorUid = form.watch("overtimeCoordinatorUid");
  const selectedCoordinator = useMemo(() => {
    if (!allUsers || !selectedCoordinatorUid) return null;
    return allUsers.find((u) => u.uid === selectedCoordinatorUid);
  }, [allUsers, selectedCoordinatorUid]);

  const coordinatorPosition =
    selectedCoordinator?.positionTitle ||
    selectedCoordinator?.structuralLevel ||
    selectedCoordinator?.role ||
    "-";

  // === RESOLVED DIVISION MANAGER ===
  // Primary: from master organization Firestore doc (brands/{brandId}/divisions)
  // Fallback: from users list where isDivisionManager + brand/division match
  const resolvedDivisionManager = useMemo(() => {
    const employeeBrandId = staffBrandId;
    const employeeBrandName = staffBrandName;
    const employeeDivisionId = staffDivisionId;
    const employeeDivisionName = staffDivisionId; // same value used as name

    // Priority 1: Master Organization document from Firestore
    const divDocData = divisionMaster as any;
    const divMgrUid =
      divDocData?.managerId ||
      divDocData?.managerUid ||
      divDocData?.supervisorUid ||
      divDocData?.directSupervisorUid ||
      null;
    const divMgrName =
      divDocData?.managerName ||
      divDocData?.supervisorName ||
      divDocData?.directSupervisorName ||
      null;

    // Priority 2: Lookup from users collection by brand/division match
    let fallbackUser: any = null;
    if (!divMgrUid && allUsers && employeeDivisionId) {
      fallbackUser = allUsers.find((u) => {
        // Match brand: if employeeBrandId is known, require match; otherwise skip brand check
        const brandMatch =
          !employeeBrandId ||
          u.managedBrandId === employeeBrandId ||
          (Array.isArray(u.brandId)
            ? u.brandId.includes(employeeBrandId)
            : u.brandId === employeeBrandId);

        const divisionMatch =
          u.managedDivision === employeeDivisionId ||
          u.managedDivisionName === employeeDivisionId ||
          u.division === employeeDivisionId ||
          u.divisionId === employeeDivisionId ||
          u.managedDivisionId === employeeDivisionId;

        const isManager =
          u.isDivisionManager === true ||
          u.structuralLevel === "division_manager" ||
          u.role === "manager" ||
          (u.positionTitle || "").toLowerCase().includes("manager divisi");

        return isManager && divisionMatch && brandMatch;
      });
    }

    // Priority 3: Fallback from employee profile
    const profileManagerUid =
      (employeeProfile as any)?.directSupervisorUid ||
      employeeProfile?.supervisorUid ||
      (employeeProfile as any)?.managerUid ||
      null;
    const profileManagerName =
      (employeeProfile as any)?.directSupervisorName ||
      employeeProfile?.supervisorName ||
      (employeeProfile as any)?.managerName ||
      null;

    const finalUid =
      divMgrUid || fallbackUser?.uid || profileManagerUid || null;
    const finalName =
      divMgrName ||
      (fallbackUser
        ? fallbackUser.fullName || fallbackUser.displayName
        : null) ||
      profileManagerName ||
      null;
    const finalDivision =
      fallbackUser?.managedDivision ||
      fallbackUser?.division ||
      employeeDivisionId;
    const finalBrandName = fallbackUser?.managedBrandName || employeeBrandName;

    console.log("RESOLVE MANAGER DIVISI LEMBUR", {
      employeeBrandId,
      employeeBrandName,
      employeeDivisionId,
      employeeDivisionName,
      selectedCoordinator: selectedCoordinator
        ? { uid: selectedCoordinator.uid, name: selectedCoordinator.fullName }
        : null,
      divisionDocData: divDocData,
      resolvedDivisionManagerUid: finalUid,
      resolvedDivisionManagerName: finalName,
      fallbackUsersMatched: fallbackUser
        ? { uid: fallbackUser.uid, name: fallbackUser.fullName }
        : null,
    });

    if (!finalUid) return null;

    return {
      uid: finalUid,
      name: finalName || "Manager Divisi",
      divisionName: finalDivision,
      brandName: finalBrandName,
    };
  }, [
    divisionMaster,
    allUsers,
    staffBrandId,
    staffBrandName,
    staffDivisionId,
    employeeProfile,
    selectedCoordinator,
  ]);

  const approvalFlow = useMemo(() => {
    const mgr = resolvedDivisionManager;

    if (!mgr?.uid) {
      return {
        hasValidFlow: false,
        managerUid: null as string | null,
        managerName: "Belum Ditentukan",
        isCoordinatorSameAsManager: false,
        approvalFlowType: "staff_to_coordinator_to_manager_to_hrd" as string,
        initialStatus: "pending_coordinator" as string,
      };
    }

    const isSame = !!selectedCoordinator && selectedCoordinator.uid === mgr.uid;

    return {
      hasValidFlow: true,
      managerUid: mgr.uid,
      managerName: mgr.name,
      isCoordinatorSameAsManager: isSame,
      approvalFlowType: isSame
        ? "staff_to_manager_to_hrd"
        : "staff_to_coordinator_to_manager_to_hrd",
      initialStatus: isSame ? "pending_supervisor" : "pending_coordinator",
    };
  }, [resolvedDivisionManager, selectedCoordinator]);

  // Keep legacy supervisorName for old code references that use it
  const legacySupervisorName = approvalFlow.managerName;

  const totalDuration = useMemo(() => {
    if (!startTimeStr || !endTimeStr) return 0;
    try {
      const [startH, startM] = startTimeStr.split(":").map(Number);
      const [endH, endM] = endTimeStr.split(":").map(Number);
      const start = set(new Date(), { hours: startH, minutes: startM });
      let end = set(new Date(), { hours: endH, minutes: endM });

      if (end < start) {
        end = addDays(end, 1);
      }

      return differenceInMinutes(end, start);
    } catch (e) {
      return 0;
    }
  }, [startTimeStr, endTimeStr]);

  const tasksEstimate = useMemo(() => {
    if (!tasks || tasks.length === 0) return 0;
    return tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);
  }, [tasks]);

  const remainingDuration = totalDuration - tasksEstimate;

  const durationValidation = useMemo(() => {
    if (tasksEstimate === 0) return { status: "incomplete", message: "" };
    if (tasksEstimate === totalDuration) {
      return {
        status: "valid",
        message: "Estimasi tugas sudah sesuai dengan total durasi lembur.",
      };
    }
    if (tasksEstimate < totalDuration) {
      return {
        status: "warning",
        message: `Masih ada ${remainingDuration} menit yang belum dirinci. Anda tetap bisa mengirim pengajuan jika uraian utama sudah jelas.`,
      };
    }
    return {
      status: "error",
      message: "Total estimasi tugas melebihi durasi lembur.",
    };
  }, [tasksEstimate, totalDuration, remainingDuration]);

  const overtimeCoordinatorUid = watch("overtimeCoordinatorUid");
  const overtimeType = watch("overtimeType");
  const location = watch("location");
  const reasonValue = watch("reason");
  const dateValue = watch("date");
  const startTime = watch("startTime");
  const endTime = watch("endTime");

  const isDateValid =
    dateValue instanceof Date && !Number.isNaN(dateValue.getTime());
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  const isTimeRangeValid =
    timeRegex.test(startTime || "") &&
    timeRegex.test(endTime || "") &&
    (() => {
      const [startH, startM] = (startTime || "").split(":").map(Number);
      const [endH, endM] = (endTime || "").split(":").map(Number);
      return endH * 60 + endM > startH * 60 + startM;
    })();

  const hasTaskDescriptions =
    Array.isArray(tasks) &&
    tasks.some((task) => task?.description?.trim().length > 0);

  const validationReasons = useMemo(() => {
    const reasons: string[] = [];

    if (!overtimeCoordinatorUid) {
      reasons.push("Pengawas/Koordinator belum dipilih");
    }
    if (!approvalFlow.hasValidFlow) {
      reasons.push("Manager Divisi belum ditemukan");
    }
    if (!overtimeType) {
      reasons.push("Tipe lembur belum dipilih");
    }
    if (!location) {
      reasons.push("Lokasi kerja belum dipilih");
    }
    if (!Array.isArray(tasks) || tasks.length === 0 || !hasTaskDescriptions) {
      reasons.push("Rincian pekerjaan belum diisi");
    }
    if (!reasonValue?.trim()) {
      reasons.push("Alasan lembur wajib diisi");
    }
    if (!isDateValid || !isTimeRangeValid) {
      reasons.push("Tanggal/jam lembur belum valid");
    }
    if (durationValidation.status === "error") {
      reasons.push("Total estimasi tugas melebihi durasi lembur.");
    }

    return reasons;
  }, [
    approvalFlow.hasValidFlow,
    dateValue,
    durationValidation.status,
    hasTaskDescriptions,
    isDateValid,
    isTimeRangeValid,
    location,
    overtimeCoordinatorUid,
    overtimeType,
    reasonValue,
    tasks,
  ]);

  const isApprovalFlowInvalid = submitAttempted && !approvalFlow.hasValidFlow;
  const isSubmitDisabled = isSaving || uploadingAttachments;

  const handleInvalidSubmit = () => {
    setSubmitAttempted(true);
    const reasons = [...validationReasons];

    if (
      !approvalFlow.hasValidFlow &&
      !reasons.includes("Manager Divisi belum ditemukan")
    ) {
      reasons.unshift("Manager Divisi belum ditemukan");
    }

    toast({
      variant: "destructive",
      title: "Pengajuan belum bisa dikirim",
      description: (
        <div className="space-y-1 text-sm">
          {reasons.map((reason) => (
            <p key={reason}>- {reason}</p>
          ))}
        </div>
      ),
    });
  };

  useEffect(() => {
    if (open) {
      if (submission) {
        const submissionTasks =
          submission.tasks || (submission as any).taskDetails || [];

        form.reset({
          date:
            ((submission as any).overtimeDate?.toDate?.() ??
              submission.date?.toDate?.()) ||
            new Date(),
          startTime: submission.startTime,
          endTime: submission.endTime,
          overtimeType: submission.overtimeType,
          tasks: submissionTasks.map((t: any) => ({
            description: t.description,
            estimatedMinutes: t.estimatedMinutes,
          })) || [{ description: "", estimatedMinutes: 60 }],
          reason: submission.reason,
          location: submission.location,
          employeeNotes: submission.employeeNotes || "",
          attachments: submission.attachments || [],
          overtimeCoordinatorUid:
            (submission as any).overtimeCoordinatorUid || "",
          overtimeInstructionNote:
            (submission as any).overtimeInstructionNote || "",
        });
        // Reset attachments state for edit mode
        setAttachments([]);
      } else {
        form.reset({
          date: new Date(),
          startTime: "17:00",
          endTime: "19:00",
          overtimeType: "hari_kerja",
          tasks: [{ description: "", estimatedMinutes: 60 }],
          reason: "",
          location: "kantor",
          employeeNotes: "",
          attachments: [],
          overtimeCoordinatorUid: "",
          overtimeInstructionNote: "",
        });
        setAttachments([]);
      }
    }
  }, [open, submission, form]);

  // Helper functions for file handling
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter((file) => {
      const isValidType =
        file.type.startsWith("image/") || file.type === "application/pdf";
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB limit
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast({
        variant: "destructive",
        title: "File Tidak Valid",
        description:
          "Hanya file gambar (PNG, JPG, JPEG) dan PDF yang diperbolehkan, maksimal 5MB per file.",
      });
    }

    setAttachments((prev) => [...prev, ...validFiles]);
    event.target.value = ""; // Reset input
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (): Promise<string[]> => {
    if (attachments.length === 0) return [];

    setUploadingAttachments(true);
    try {
      const uploadPromises = attachments.map(async (file) => {
        // For now, we'll simulate upload - in real implementation, you'd upload to Firebase Storage
        // and return the download URL
        return `uploaded_${file.name}_${Date.now()}`;
      });

      const urls = await Promise.all(uploadPromises);
      return urls;
    } catch (error) {
      throw new Error("Gagal mengupload lampiran");
    } finally {
      setUploadingAttachments(false);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Authentication not found.",
      });
      return;
    }

    if (!approvalFlow.hasValidFlow) {
      setSubmitAttempted(true);
      toast({
        variant: "destructive",
        title: "Pengajuan belum bisa dikirim",
        description: "Manager Divisi belum ditemukan.",
      });
      return;
    }

    if (durationValidation.status === "error") {
      setSubmitAttempted(true);
      toast({
        variant: "destructive",
        title: "Pengajuan belum bisa dikirim",
        description: "Total estimasi tugas melebihi durasi lembur.",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Upload attachments first
      const attachmentUrls = await uploadAttachments();

      const docRef = submission
        ? doc(firestore, "overtime_submissions", submission.id!)
        : doc(collection(firestore, "overtime_submissions"));

      const hrd = employeeProfile?.hrdEmploymentInfo;

      console.log("OVERTIME APPROVER DEBUG", {
        employeeBrandId: staffBrandId,
        employeeBrandName: displayInfo.brandName,
        employeeDivisionId: staffDivisionId,
        employeeDivisionName: displayInfo.division,
        selectedCoordinator,
        resolvedManagerUid: resolvedDivisionManager?.uid,
        resolvedManagerName: resolvedDivisionManager?.name,
        resolvedManagerDivisionName: resolvedDivisionManager?.divisionName,
        employeeProfileManagerUid: employeeProfile?.managerUid,
        employeeProfileManagerName: employeeProfile?.managerName,
      });

      const payload: any = {
        employeeUid: userProfile.uid,
        employeeName: userProfile.fullName || "",
        employeeType: hrd?.employeeType || userProfile?.employmentType,

        // Brand info
        brandId:
          hrd?.brandId || employeeProfile?.brandId || userProfile?.brandId,
        brandName: displayInfo.brandName,

        // Division info
        divisionId: hrd?.divisionId,
        divisionName: displayInfo.division,

        // Position info
        workRole: hrd?.workRole || displayInfo.positionTitle,

        // Supervisor info
        directSupervisorUid: approvalFlow.managerUid,
        directSupervisorName: approvalFlow.managerName,
        managerUid: approvalFlow.managerUid,
        managerName: approvalFlow.managerName,
        managerDivisionName:
          resolvedDivisionManager?.divisionName || displayInfo.division,
        overtimeCoordinatorUid:
          selectedCoordinator?.uid || values.overtimeCoordinatorUid || null,
        overtimeCoordinatorName:
          selectedCoordinator?.fullName ||
          selectedCoordinator?.displayName ||
          "",
        overtimeCoordinatorPosition:
          selectedCoordinator?.positionTitle ||
          selectedCoordinator?.structuralLevel ||
          selectedCoordinator?.role ||
          "",
        overtimeInstructionNote: values.overtimeInstructionNote,

        approvalLevel: "coordinator",
        requesterStructuralPosition:
          employeeProfile?.hrdEmploymentInfo?.structuralPosition ||
          userProfile?.structuralLevel ||
          "staff",

        // Overtime details
        overtimeDate: Timestamp.fromDate(values.date),
        startTime: values.startTime,
        endTime: values.endTime,
        totalDurationMinutes: totalDuration,
        overtimeType: values.overtimeType,
        overtimeTypeLabel:
          values.overtimeType === "hari_kerja"
            ? "Hari Kerja"
            : values.overtimeType === "hari_libur"
              ? "Hari Libur"
              : "Urgent",
        workLocation: values.location,
        workLocationLabel:
          values.location === "kantor"
            ? "Kantor"
            : values.location === "remote"
              ? "Remote"
              : "Site/Lokasi Klien",

        // Task details
        taskDetails: values.tasks,

        // Reason and notes
        reason: values.reason,
        notes: values.employeeNotes || null,

        // Attachments
        attachments: [...(values.attachments || []), ...attachmentUrls],

        // Approval flow
        approvalFlowType: approvalFlow.approvalFlowType,
        approvalFlow: approvalFlow.isCoordinatorSameAsManager
          ? `${approvalFlow.managerName} → HRD`
          : `${selectedCoordinator?.fullName || "Koordinator"} → ${approvalFlow.managerName} → HRD`,
        approvalStatus: approvalFlow.initialStatus,
        status: approvalFlow.initialStatus,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (mode === "Buat") {
        payload.createdAt = serverTimestamp();
      }

      await setDocumentNonBlocking(docRef, payload, { merge: true });

      try {
        const notificationRecipientUid =
          selectedCoordinator?.uid || approvalFlow.managerUid;

        if (notificationRecipientUid) {
          await sendNotification(firestore, {
            userId: notificationRecipientUid,
            type: "status_update",
            module: "employee",
            title: "Pengajuan Lembur Baru Menunggu Persetujuan",
            message: `${employeeProfile?.fullName || userProfile.fullName} mengajukan lembur dan menunggu persetujuan Anda.`,
            targetType: "user",
            targetId: docRef.id,
            actionUrl: "/admin/manager/persetujuan-lembur",
            createdBy: userProfile.uid,
            meta: {
              submissionId: docRef.id,
              employeeUid:
                userProfile.uid ||
                (submission as any)?.employeeUid ||
                (submission as any)?.uid,
            },
          });
        }
      } catch (notificationError) {
        console.error("Gagal mengirim notifikasi ke atasan", notificationError);
      }

      toast({
        title: `Pengajuan ${mode === "Edit" ? "Diperbarui" : "Dibuat"}`,
        description: "Pengajuan lembur Anda telah dikirim untuk persetujuan.",
      });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const currentStatus =
    (submission as any)?.approvalStatus || submission?.status || "draft";

  const supervisorViewedAt = parseSafeDate(
    (submission as any)?.supervisorViewedAt,
  );
  const isViewMode = formMode === "view";
  const canEditSubmission =
    !submission ||
    currentStatus === "draft" ||
    currentStatus === "needs_revision" ||
    (currentStatus === "pending_supervisor" && !supervisorViewedAt);
  const isReadOnly = isViewMode || !canEditSubmission;

  if (!canSubmitOvertime && formMode === "edit") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle>Pengajuan Lembur Tidak Tersedia</DialogTitle>
            <DialogDescription>
              Pengajuan lembur hanya tersedia untuk staff/karyawan operasional.
              Akun dengan jabatan manajerial atau HRD hanya dapat memproses
              persetujuan lembur.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="rounded-3xl border border-border bg-muted p-6">
              <p className="text-lg font-semibold">Akses Ditolak</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Anda tidak memiliki izin untuk membuat atau mengedit pengajuan
                lembur. Silakan gunakan fitur persetujuan jika Anda berada di
                posisi manajerial atau HRD.
              </p>
            </div>
          </div>
          <div className="shrink-0 border-t px-6 py-4 bg-background flex justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const viewOvertimeDate = parseSafeDate(
    (submission as any)?.overtimeDate ?? submission?.date,
  );
  const locationLabel =
    submission?.workLocationLabel ||
    submission?.workLocation ||
    (submission?.location === "kantor"
      ? "Kantor"
      : submission?.location === "remote"
        ? "Remote"
        : submission?.location === "site"
          ? "Site/Lokasi Klien"
          : submission?.location || "-");
  const overtimeTypeLabel =
    submission?.overtimeType === "hari_kerja"
      ? "Hari Kerja"
      : submission?.overtimeType === "hari_libur"
        ? "Hari Libur"
        : submission?.overtimeType === "urgent"
          ? "Urgent"
          : "-";
  const submissionTasks =
    submission?.tasks || (submission as any)?.taskDetails || [];
  const reasonText = submission?.reason || "-";
  const employeeNoteText = submission?.employeeNotes || "-";
  const revisionNoteText = submission?.revisionNote;
  const rejectionReasonText = submission?.rejectionReason;
  const hrdNotesText = submission?.hrdNotes;
  const managerNotesText = submission?.managerNotes;
  const submittedAt = parseSafeDate(
    (submission as any)?.submittedAt ?? submission?.createdAt,
  );
  const managerReviewAt = parseSafeDate(
    submission?.managerDecisionAt || submission?.supervisorApprovedAt,
  );
  const hrdReviewAt = parseSafeDate(submission?.hrdDecisionAt);

  const timelineSteps = [
    {
      title: "Pengajuan Dikirim",
      date: submittedAt,
      status: submittedAt != null ? "Selesai" : "Menunggu pengajuan dikirim",
      description:
        submittedAt != null
          ? "Pengajuan telah dikirim dan menunggu proses selanjutnya."
          : "Pengajuan belum dikirim.",
    },
    {
      title: "Review Manager Divisi",
      date: managerReviewAt,
      status:
        currentStatus === "pending_supervisor"
          ? supervisorViewedAt
            ? "Dalam Review Manager"
            : "Menunggu Manager membaca"
          : managerReviewAt
            ? "Selesai"
            : "Belum dimulai",
      description:
        currentStatus === "pending_supervisor"
          ? supervisorViewedAt
            ? "Manager divisi sudah membaca pengajuan dan sedang meninjaunya."
            : "Manager divisi belum membaca pengajuan."
          : managerReviewAt
            ? "Manager divisi telah memberikan keputusan atau permintaan revisi."
            : "Pengajuan belum sampai ke manager divisi.",
    },
    {
      title: "Review HRD",
      date: hrdReviewAt,
      status:
        currentStatus === "pending_hrd" ||
        currentStatus === "approved_by_manager"
          ? "Menunggu HRD"
          : hrdReviewAt
            ? "Selesai"
            : "Belum dimulai",
      description:
        currentStatus === "pending_hrd" ||
        currentStatus === "approved_by_manager"
          ? "Pengajuan sudah diteruskan ke HRD dan menunggu review."
          : hrdReviewAt
            ? "HRD telah meninjau pengajuan."
            : "Pengajuan belum sampai ke HRD.",
    },
    {
      title: "Selesai",
      date: [
        "approved",
        "approved_hrd",
        "rejected",
        "rejected_hrd",
        "cancelled",
      ].includes(currentStatus)
        ? parseSafeDate(
            submission?.hrdDecisionAt ||
              submission?.rejectedAt ||
              (submission as any)?.cancelledAt ||
              submission?.updatedAt,
          )
        : undefined,
      status: ["approved", "approved_hrd"].includes(currentStatus)
        ? "Disetujui"
        : ["rejected", "rejected_hrd"].includes(currentStatus)
          ? "Ditolak"
          : currentStatus === "cancelled"
            ? "Dibatalkan"
            : "Belum selesai",
      description: ["approved", "approved_hrd"].includes(currentStatus)
        ? "Pengajuan telah disetujui."
        : ["rejected", "rejected_hrd"].includes(currentStatus)
          ? "Pengajuan ditolak."
          : currentStatus === "cancelled"
            ? "Pengajuan dibatalkan."
            : "Pengajuan masih dalam proses.",
    },
  ];

  if (isViewMode && submission) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <OvertimeSubmissionDetailView
          submission={submission}
          canEdit={canEditSubmission}
          onRequestEdit={onRequestEdit}
          onClose={() => onOpenChange(false)}
        />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle>
            {submission
              ? isReadOnly
                ? "Detail Pengajuan Lembur"
                : "Edit Pengajuan Lembur"
              : "Form Pengajuan Lembur"}
          </DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? "Detail pengajuan lembur Anda."
              : "Lengkapi informasi berikut untuk mengajukan lembur. Pengajuan akan diteruskan sesuai alur persetujuan yang berlaku."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6 pb-10">
          <Form {...form}>
            <form
              id="overtime-form"
              onSubmit={form.handleSubmit(handleSubmit, handleInvalidSubmit)}
              className="space-y-8"
            >
              {isApprovalFlowInvalid && !isReadOnly && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Data Atasan Belum Tersedia</AlertTitle>
                  <AlertDescription>
                    Manager Divisi untuk divisi{" "}
                    <strong>{displayInfo.division}</strong> belum ditentukan.
                    Hubungi HRD atau pilih koordinator yang sesuai.
                  </AlertDescription>
                </Alert>
              )}

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="p-5 space-y-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    Profil Anda
                  </p>
                  <InfoRow label="Nama" value={displayInfo.fullName} />
                  <InfoRow
                    label="Tipe Karyawan"
                    value={displayInfo.employmentStatus}
                  />
                  <InfoRow label="Brand" value={displayInfo.brandName} />
                  <InfoRow
                    label="Jabatan / Bagian"
                    value={displayInfo.positionTitle}
                  />
                </Card>
                <Card className="p-5 space-y-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    Pengawas/Koordinator
                  </p>
                  <FormField
                    control={form.control}
                    name="overtimeCoordinatorUid"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isReadOnly}
                        >
                          <FormControl>
                            <SelectTrigger
                              className={`w-full ${
                                submitAttempted && !overtimeCoordinatorUid
                                  ? "border-destructive ring-1 ring-destructive"
                                  : ""
                              }`}
                            >
                              <SelectValue placeholder="Pilih Pengawas/Koordinator" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eligibleCoordinators.map((c) => {
                              const position =
                                c.positionTitle ||
                                c.workRole ||
                                c.structuralLevel ||
                                (c.role === "manager"
                                  ? "Manager Divisi"
                                  : c.role === "management"
                                    ? "Direktur/Manajemen"
                                    : c.role);
                              const divisionLabel =
                                c.division ||
                                c.managedDivision ||
                                c.divisionName ||
                                "";
                              const displayLabel = divisionLabel
                                ? `${position} ${divisionLabel}`
                                : position;
                              return (
                                <SelectItem key={c.uid} value={c.uid}>
                                  {c.fullName || "Tanpa Nama"} &mdash;{" "}
                                  {displayLabel}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Card>
                <Card className="p-5 space-y-3 flex flex-col items-center justify-center">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Total Estimasi Durasi
                  </p>
                  <p className="text-5xl font-bold">
                    {totalDuration > 0 ? `${totalDuration}` : "-"}
                  </p>
                  <p className="text-sm font-semibold text-muted-foreground">
                    menit
                  </p>
                </Card>
              </section>

              <section>
                <Card className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                      Alur Persetujuan
                    </p>
                    <p
                      className={`text-sm font-semibold ${approvalFlow.hasValidFlow ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      {approvalFlow.hasValidFlow ? "Lengkap" : "Belum lengkap"}
                    </p>
                  </div>

                  <div className="relative pl-8 space-y-4">
                    <div className="absolute left-2 top-5 bottom-5 w-px bg-border/70" />
                    {approvalFlow.isCoordinatorSameAsManager ? (
                      <div className="relative z-10 rounded-2xl border border-border bg-background/80 p-4">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                          <p className="text-sm font-semibold">
                            Pengawas/Koordinator & Manager Divisi
                          </p>
                        </div>
                        <div className="space-y-1 pl-6 pt-3">
                          <p
                            title={approvalFlow.managerName}
                            className="text-sm font-semibold leading-snug line-clamp-2"
                          >
                            {approvalFlow.managerName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Divisi:{" "}
                            {resolvedDivisionManager?.divisionName ||
                              displayInfo.division}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="relative z-10 rounded-2xl border border-border bg-background/80 p-4">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                            <p className="text-sm font-semibold">
                              Pengawas/Koordinator
                            </p>
                          </div>
                          <div className="space-y-1 pl-6 pt-3">
                            <p
                              title={
                                selectedCoordinator?.fullName || "Belum dipilih"
                              }
                              className="text-sm font-semibold leading-snug line-clamp-2"
                            >
                              {selectedCoordinator?.fullName || "Belum dipilih"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Jabatan:{" "}
                              {selectedCoordinator ? coordinatorPosition : "-"}
                            </p>
                          </div>
                        </div>
                        <div className="relative z-10 rounded-2xl border border-border bg-background/80 p-4">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                            <p className="text-sm font-semibold">
                              Manager Divisi
                            </p>
                          </div>
                          <div className="space-y-1 pl-6 pt-3">
                            <p
                              title={approvalFlow.managerName}
                              className="text-sm font-semibold leading-snug line-clamp-2"
                            >
                              {approvalFlow.managerName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Divisi:{" "}
                              {resolvedDivisionManager?.divisionName ||
                                displayInfo.division}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                    <div className="relative z-10 rounded-2xl border border-border bg-background/80 p-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                        <p className="text-sm font-semibold">HRD</p>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6 pt-3">
                        Final approval
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-2">
                    <p className="text-sm font-semibold">Alur</p>
                    <p className="text-sm text-muted-foreground">
                      {approvalFlow.isCoordinatorSameAsManager
                        ? "Koordinator & Manager Divisi → HRD"
                        : "Koordinator → Manager Divisi → HRD"}
                    </p>
                  </div>

                  {isApprovalFlowInvalid && (
                    <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive-foreground">
                      Manager Divisi belum ditemukan. Pilih koordinator yang
                      valid atau lengkapi data divisi Anda.
                    </div>
                  )}
                </Card>
              </section>

              {submission && currentStatus !== "draft" && (
                <section>
                  <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                    Jejak Persetujuan
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ReviewCard
                      title="Review Manajer Divisi"
                      decisionAt={submission.managerDecisionAt}
                      notes={submission.managerNotes}
                    />
                    <ReviewCard
                      title="Review HRD"
                      decisionAt={submission.hrdDecisionAt}
                      notes={submission.hrdNotes}
                    />
                  </div>
                </section>
              )}

              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Tanggal Lembur</FormLabel>
                      <FormControl>
                        <GoogleDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jam Mulai</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          {...field}
                          readOnly={isReadOnly}
                          className={`${
                            submitAttempted && !isTimeRangeValid
                              ? "border-destructive ring-1 ring-destructive"
                              : ""
                          }`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jam Selesai</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          {...field}
                          readOnly={isReadOnly}
                          className={`${
                            submitAttempted && !isTimeRangeValid
                              ? "border-destructive ring-1 ring-destructive"
                              : ""
                          }`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
              <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="overtimeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipe Lembur</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger
                            className={`${
                              submitAttempted && !overtimeType
                                ? "border-destructive ring-1 ring-destructive"
                                : ""
                            }`}
                          >
                            <SelectValue placeholder="Pilih tipe" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hari_kerja">Hari Kerja</SelectItem>
                          <SelectItem value="hari_libur">Hari Libur</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lokasi Kerja</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger
                            className={`${
                              submitAttempted && !location
                                ? "border-destructive ring-1 ring-destructive"
                                : ""
                            }`}
                          >
                            <SelectValue placeholder="Pilih lokasi" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="kantor">Kantor</SelectItem>
                          <SelectItem value="remote">Remote</SelectItem>
                          <SelectItem value="site">
                            Site/Lokasi Klien
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <section className="md:col-span-2 lg:col-span-3 space-y-6">
                <div className="space-y-3">
                  <FormLabel className="text-base">Rincian Pekerjaan</FormLabel>

                  {/* Summary Card */}
                  <Card className="p-4 bg-muted/50 border-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Total Durasi Lembur
                        </p>
                        <p className="text-2xl font-bold">{totalDuration}</p>
                        <p className="text-xs text-muted-foreground">menit</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Total Estimasi Tugas
                        </p>
                        <p className="text-2xl font-bold">{tasksEstimate}</p>
                        <p className="text-xs text-muted-foreground">menit</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Sisa Durasi
                        </p>
                        <p
                          className={`text-2xl font-bold ${
                            remainingDuration === 0
                              ? "text-green-600"
                              : remainingDuration > 0
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {remainingDuration}
                        </p>
                        <p className="text-xs text-muted-foreground">menit</p>
                      </div>
                    </div>
                  </Card>

                  {/* Validation Status */}
                  {durationValidation.message && (
                    <Alert
                      variant={
                        durationValidation.status === "error"
                          ? "destructive"
                          : "default"
                      }
                      className={
                        durationValidation.status === "warning"
                          ? "border border-amber-500/40 bg-amber-500/10"
                          : durationValidation.status === "valid"
                            ? "border border-green-500/40 bg-green-500/10"
                            : ""
                      }
                    >
                      {durationValidation.status === "error" && (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      {durationValidation.status === "valid" && (
                        <UserCheck className="h-4 w-4 text-green-300" />
                      )}
                      {durationValidation.status === "warning" && (
                        <AlertTriangle className="h-4 w-4 text-amber-300" />
                      )}
                      <AlertTitle
                        className={
                          durationValidation.status === "warning"
                            ? "text-amber-300"
                            : durationValidation.status === "valid"
                              ? "text-green-300"
                              : ""
                        }
                      >
                        {durationValidation.status === "error"
                          ? "Estimasi Melebihi Durasi"
                          : durationValidation.status === "valid"
                            ? "Estimasi Sesuai"
                            : "Estimasi Belum Lengkap"}
                      </AlertTitle>
                      <AlertDescription
                        className={
                          durationValidation.status === "error"
                            ? ""
                            : "text-slate-200"
                        }
                      >
                        {durationValidation.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Tasks List */}
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <Card key={field.id} className="p-4 relative">
                      {!isReadOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="space-y-4 pr-8">
                        <FormField
                          control={form.control}
                          name={`tasks.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Uraian Tugas</FormLabel>
                              <FormControl>
                                <Textarea
                                  rows={2}
                                  placeholder="Deskripsikan pekerjaan yang akan dilakukan..."
                                  {...field}
                                  readOnly={isReadOnly}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`tasks.${index}.estimatedMinutes`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Estimasi Durasi (menit)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="Berapa menit untuk menyelesaikan tugas ini?"
                                  {...field}
                                  readOnly={isReadOnly}
                                  value={field.value ?? ""}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                    )
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </Card>
                  ))}
                </div>

                {!isReadOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        description: "",
                        estimatedMinutes: 60,
                      })
                    }
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Tambah Tugas
                  </Button>
                )}
              </section>

              <section>
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alasan Lembur</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Jelaskan kenapa pekerjaan ini perlu dilemburkan..."
                          {...field}
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormDescription>
                        Alasan lembur digunakan untuk membantu atasan menilai
                        pengajuan.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
              <section>
                <FormField
                  control={form.control}
                  name="employeeNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catatan (Opsional)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder="Catatan tambahan jika ada..."
                          {...field}
                          readOnly={isReadOnly}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {!isReadOnly && (
                <section className="space-y-4">
                  <FormLabel>Lampiran Pendukung (Opsional)</FormLabel>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        onChange={handleFileSelect}
                        className="flex-1"
                        disabled={uploadingAttachments}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingAttachments}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Pilih File
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Upload foto, screenshot, atau dokumen pendukung (PNG, JPG,
                      JPEG, PDF, maksimal 5MB per file)
                    </p>

                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          File yang akan diupload:
                        </p>
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-muted rounded-md"
                          >
                            {file.type.startsWith("image/") ? (
                              <Image className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="text-sm flex-1 truncate">
                              {file.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(1)}MB
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAttachment(index)}
                              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </form>
          </Form>
        </div>
        <div className="shrink-0 border-t px-6 py-4 flex justify-end gap-3 bg-background">
          {!isReadOnly && (
            <div className="flex-1 mr-4">
              <div className="text-sm text-muted-foreground">
                Anda mengajukan lembur{" "}
                <span className="font-semibold text-foreground">
                  {totalDuration > 0 ? `${totalDuration} menit` : "-"}
                </span>{" "}
                pada{" "}
                <span className="font-semibold text-foreground">
                  {form.watch("date")
                    ? format(form.watch("date"), "dd MMMM yyyy", {
                        locale: idLocale,
                      })
                    : "-"}
                </span>
                , pukul{" "}
                <span className="font-semibold text-foreground">
                  {form.watch("startTime") || "-"}–
                  {form.watch("endTime") || "-"}
                </span>
                , dengan alur persetujuan{" "}
                <span className="font-semibold text-foreground">
                  {approvalFlow.isCoordinatorSameAsManager
                    ? "Koordinator & Manager Divisi → HRD"
                    : "Koordinator → Manager Divisi → HRD"}
                </span>
                .
              </div>
            </div>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          {!isReadOnly && (
            <Button
              type="submit"
              form="overtime-form"
              disabled={isSubmitDisabled}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" />
              {submission ? "Simpan Perubahan" : "Kirim Pengajuan"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
