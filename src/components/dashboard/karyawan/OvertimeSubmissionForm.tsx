"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Info,
  PlayCircle,
  StopCircle,
  ChevronRight,
  RotateCcw,
  Timer,
  CheckCircle2,
  PenLine,
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
  updateDoc,
} from "firebase/firestore";
import { OvertimeStatusBadge } from "./OvertimeStatusBadge";
import { RealtimeOvertimeTimer } from "./RealtimeOvertimeTimer";
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

const workLocationOptions = [
  { value: "kantor", label: "Kantor" },
  { value: "rumah_wfh", label: "Rumah / WFH" },
  { value: "luar_kantor", label: "Luar Kantor" },
  { value: "site_klien", label: "Site / Lokasi Klien" },
  { value: "lainnya", label: "Lainnya" },
] as const;

type WorkLocationValue = (typeof workLocationOptions)[number]["value"];

const normalizeWorkLocation = (value?: string | null): WorkLocationValue => {
  if (value === "remote") return "rumah_wfh";
  if (value === "site") return "site_klien";
  if (workLocationOptions.some((option) => option.value === value)) {
    return value as WorkLocationValue;
  }
  return "kantor";
};

const getWorkLocationLabel = (
  value?: string | null,
  detail?: string | null,
) => {
  const normalized = normalizeWorkLocation(value);
  const label =
    workLocationOptions.find((option) => option.value === normalized)?.label ||
    "Kantor";
  const cleanDetail = detail?.trim();
  return normalized === "lainnya" && cleanDetail
    ? `${label} - ${cleanDetail}`
    : label;
};

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
    location: z.enum(["kantor", "rumah_wfh", "luar_kantor", "site_klien", "lainnya"], {
      required_error: "Lokasi harus dipilih.",
    }),
    workLocationDetail: z.string().optional().default(""),
    overtimeCoordinatorUid: z
      .string({ required_error: "Koordinator/Pengawas lembur harus dipilih." })
      .min(1, "Koordinator/Pengawas lembur harus dipilih."),
    overtimeInstructionNote: z.string().optional().default(""),
    employeeNotes: z.string().optional(),
    attachments: z.array(z.string()).optional().default([]),
  })
  .refine(
    (data) => data.location !== "lainnya" || !!data.workLocationDetail?.trim(),
    {
      message: "Detail lokasi kerja harus diisi jika memilih Lainnya.",
      path: ["workLocationDetail"],
    },
  )
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
  existingRealtimeDrafts?: OvertimeSubmission[];
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
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [completionType, setCompletionType] = useState<"on_time" | "early" | "late" | "">("");
  const [actualEndTimeInput, setActualEndTimeInput] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [isSavingConfirm, setIsSavingConfirm] = useState(false);

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
  const locationLabel = getWorkLocationLabel(
    submission.workLocation || submission.location,
    (submission as any).workLocationDetail,
  );
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

  // Deteksi apakah jam selesai estimasi sudah lewat
  const isApproved = ["approved", "approved_hrd"].includes(currentStatus);
  const isEndTimePassed = useMemo(() => {
    if (!isApproved) return false;
    if (!submission.endTime) return false;
    const dateVal: any = (submission as any).overtimeDate ?? submission.date;
    let overtimeDay: Date | null = null;
    if (dateVal && typeof dateVal === "object" && typeof dateVal.toDate === "function") {
      overtimeDay = dateVal.toDate();
    } else if (dateVal instanceof Date) {
      overtimeDay = dateVal;
    } else if (typeof dateVal === "string") {
      overtimeDay = new Date(dateVal);
    }
    if (!overtimeDay) return false;
    const [endH, endM] = submission.endTime.split(":").map(Number);
    const endDate = new Date(overtimeDay);
    endDate.setHours(endH, endM, 0, 0);
    return new Date() > endDate;
  }, [isApproved, submission]);

  const needsConfirmation = isEndTimePassed &&
    !["completed_confirmed", "duration_needs_review", "pending_completion_confirmation"].includes(currentStatus) &&
    !(submission as any).confirmedCompletedAt;

  const handleConfirmCompletion = async () => {
    if (!completionType) {
      toast({ variant: "destructive", title: "Pilih status penyelesaian", description: "Pilih apakah lembur selesai sesuai estimasi, lebih cepat, atau lebih lama." });
      return;
    }
    if ((completionType === "early" || completionType === "late") && !actualEndTimeInput) {
      toast({ variant: "destructive", title: "Jam selesai realisasi wajib diisi" });
      return;
    }
    if (completionType === "late" && !completionNote.trim()) {
      toast({ variant: "destructive", title: "Catatan koreksi wajib diisi", description: "Karena lembur lebih lama dari estimasi, harap jelaskan penyebabnya." });
      return;
    }
    setIsSavingConfirm(true);
    try {
      const docRef = doc(firestore, "overtime_submissions", submission.id!);
      const actualEnd = completionType === "on_time" ? submission.endTime : actualEndTimeInput;
      let actualDuration = submission.totalDurationMinutes || 0;
      if (actualEnd && submission.startTime) {
        const [sH, sM] = submission.startTime.split(":").map(Number);
        const [eH, eM] = actualEnd.split(":").map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff < 0) diff += 24 * 60;
        actualDuration = diff;
      }
      const newStatus = completionType === "late" ? "duration_needs_review" : "completed_confirmed";
      await updateDoc(docRef, {
        actualEndTime: actualEnd || submission.endTime,
        completionStatus: completionType === "on_time" ? "confirmed_on_time" : completionType === "early" ? "confirmed_early" : "confirmed_late",
        completionNote: completionNote.trim() || null,
        actualDurationMinutes: actualDuration,
        confirmedCompletedAt: serverTimestamp(),
        confirmedByUid: userProfile?.uid || null,
        confirmedByName: userProfile?.fullName || null,
        status: newStatus,
        approvalStatus: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Konfirmasi tersimpan", description: "Status lembur diperbarui." });
      setShowConfirmDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: e.message });
    } finally {
      setIsSavingConfirm(false);
    }
  };

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

        {/* Audit Trail Waktu */}
        {((submission as any).formCreatedAt || (submission as any).startTimeAdjusted) && (
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
              <Clock className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Audit Waktu</p>
            </div>
            <div className="grid gap-2 text-sm">
              {(submission as any).formCreatedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Form dibuka pukul</span>
                  <span className="font-medium">{(submission as any).formCreatedAt}</span>
                </div>
              )}
              {(submission as any).originalStartTimeAuto && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Jam mulai otomatis awal</span>
                  <span className="font-medium">{(submission as any).originalStartTimeAuto}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Jam mulai diajukan</span>
                <span className="font-medium">{submission.startTime}</span>
              </div>
              {(submission as any).startTimeAdjusted && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Penyesuaian jam mulai</span>
                    <span className="font-semibold text-amber-600">
                      {Math.abs((submission as any).startTimeAdjustmentMinutes || 0)} menit dimundurkan
                    </span>
                  </div>
                  {(submission as any).startTimeAdjustmentReason && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs text-amber-700 font-medium mb-0.5">Alasan penyesuaian:</p>
                      <p className="text-xs text-amber-800">{(submission as any).startTimeAdjustmentReason}</p>
                    </div>
                  )}
                </>
              )}
              {(submission as any).actualEndTime && (submission as any).actualEndTime !== submission.endTime && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Jam selesai estimasi</span>
                    <span className="font-medium">{submission.endTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Jam selesai realisasi</span>
                    <span className="font-semibold text-orange-600">{(submission as any).actualEndTime}</span>
                  </div>
                </>
              )}
              {(submission as any).actualDurationMinutes && (submission as any).actualDurationMinutes !== submission.totalDurationMinutes && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Durasi diajukan</span>
                    <span className="font-medium">{submission.totalDurationMinutes} menit</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Durasi realisasi</span>
                    <span className="font-semibold text-orange-600">{(submission as any).actualDurationMinutes} menit</span>
                  </div>
                </>
              )}
              {(submission as any).approvedMinutesFinal != null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Durasi disetujui payroll</span>
                  <span className="font-semibold text-teal-600">{(submission as any).approvedMinutesFinal} menit</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Konfirmasi Selesai Banner */}
        {needsConfirmation && (
          <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-sky-100 p-2 flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-sky-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sky-800 text-sm">Konfirmasi Selesai Lembur</p>
                <p className="text-xs text-sky-600 mt-1">
                  Estimasi jam selesai ({submission.endTime}) sudah lewat. Konfirmasi apakah lembur telah selesai dan berapa durasi aktualnya.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
                  onClick={() => setShowConfirmDialog(true)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Konfirmasi Sekarang
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Konfirmasi Selesai — status info */}
        {(submission as any).confirmedCompletedAt && (
          <section className="rounded-3xl border border-teal-200 bg-teal-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-teal-600" />
              <p className="text-sm font-semibold text-teal-800">Selesai Dikonfirmasi</p>
            </div>
            <div className="text-xs text-teal-700 space-y-1">
              {(submission as any).completionStatus === "confirmed_late" && (
                <p className="text-orange-600 font-medium">⚠️ Lembur selesai lebih lama dari estimasi — sedang menunggu review HRD.</p>
              )}
              {(submission as any).actualEndTime && (
                <p>Jam selesai realisasi: <strong>{(submission as any).actualEndTime}</strong></p>
              )}
              {(submission as any).completionNote && (
                <p>Catatan: {(submission as any).completionNote}</p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Dialog Konfirmasi Selesai */}
      {showConfirmDialog && (
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Konfirmasi Selesai Lembur</DialogTitle>
              <DialogDescription>
                Lembur {submission.startTime}–{submission.endTime}. Pilih status penyelesaian aktual.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Pilihan status */}
              <div className="grid gap-2">
                {[
                  { value: "on_time" as const, label: "✅ Selesai sesuai estimasi", desc: `Selesai tepat pukul ${submission.endTime}` },
                  { value: "early" as const, label: "⏩ Selesai lebih cepat", desc: "Isi jam selesai aktual" },
                  { value: "late" as const, label: "⏰ Selesai lebih lama", desc: "Memerlukan review HRD" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCompletionType(opt.value)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${completionType === opt.value ? "border-teal-400 bg-teal-50" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Jam selesai aktual */}
              {(completionType === "early" || completionType === "late") && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-slate-500">Jam Selesai Aktual</label>
                  <Input
                    type="time"
                    value={actualEndTimeInput}
                    onChange={(e) => setActualEndTimeInput(e.target.value)}
                  />
                </div>
              )}

              {/* Catatan koreksi (wajib jika late) */}
              {completionType && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-slate-500">
                    Catatan {completionType === "late" ? "(Wajib)" : "(Opsional)"}
                  </label>
                  <textarea
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                    placeholder={completionType === "late" ? "Jelaskan mengapa lembur melebihi estimasi..." : "Tambahkan catatan jika perlu..."}
                    rows={2}
                    className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-teal-500 resize-none"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowConfirmDialog(false)}>Batal</Button>
              <Button
                onClick={handleConfirmCompletion}
                disabled={isSavingConfirm || !completionType}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {isSavingConfirm ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan Konfirmasi"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
  existingRealtimeDrafts = [],
}: OvertimeSubmissionFormProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const draftStorageKey = useMemo(
    () =>
      userProfile?.uid
        ? `overtime-realtime-draft:${userProfile.uid}`
        : "overtime-realtime-draft",
    [userProfile?.uid],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [startTimeAdjustmentReason, setStartTimeAdjustmentReason] = useState("");
  const formCreatedAtRef = useRef<string>(""); // "HH:MM" saat form dibuka, set sekali

  // inputMode: null = not yet chosen (only when creating new), 'manual' or 'realtime'
  const [inputMode, setInputMode] = useState<'manual' | 'realtime' | null>(null);
  const [pendingMode, setPendingMode] = useState<'manual' | 'realtime' | null>(null);
  const [realtimeDraftDoc, setRealtimeDraftDoc] = useState<OvertimeSubmission | null>(null);
  const [isCreatingRealtimeDraft, setIsCreatingRealtimeDraft] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [hasLocalRealtimeDraft, setHasLocalRealtimeDraft] = useState(false);

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

  const divisionMasterRaw = useMemo(() => {
    return divisionsResult?.[0] || divisionDocById || null;
  }, [divisionsResult, divisionDocById]);

  // Brand-level fallback: for staff in brands without divisions
  const brandDocRef = useMemoFirebase(() => {
    if (!firestore || !staffBrandId || divisionMasterRaw) return null;
    return doc(firestore, "brands", staffBrandId);
  }, [firestore, staffBrandId, divisionMasterRaw]);
  const { data: brandDoc } = useDoc<any>(brandDocRef);

  const divisionMaster = useMemo((): DivisionMasterOrganization | null => {
    if (divisionMasterRaw) return divisionMasterRaw;
    if (brandDoc?.brandManagerId) {
      return {
        managerId: brandDoc.brandManagerId,
        managerName: brandDoc.brandManagerName || null,
        managerDirectSupervisorId: brandDoc.brandManagerDirectorId || null,
        managerDirectSupervisorName: brandDoc.brandManagerDirectorName || null,
      } as DivisionMasterOrganization;
    }
    return null;
  }, [divisionMasterRaw, brandDoc]);

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

  const persistRealtimeDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    if (submission) return;
    if (inputMode !== "realtime") return;
    const values = form.getValues();
    const payload = {
      date: values.date?.toISOString?.() || new Date().toISOString(),
      startTime: values.startTime || "",
      endTime: values.endTime || "",
      overtimeType: values.overtimeType || "hari_kerja",
      tasks: values.tasks || [],
      reason: values.reason || "",
      location: normalizeWorkLocation(values.location),
      workLocationDetail: values.workLocationDetail || "",
      overtimeCoordinatorUid: values.overtimeCoordinatorUid || "",
      overtimeInstructionNote: values.overtimeInstructionNote || "",
      employeeNotes: values.employeeNotes || "",
      attachments: values.attachments || [],
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    setHasLocalRealtimeDraft(true);
  }, [draftStorageKey, form, inputMode, submission]);

  const clearRealtimeDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(draftStorageKey);
    setHasLocalRealtimeDraft(false);
  }, [draftStorageKey]);

  const { watch, setValue } = form;
  const startTimeStr = watch("startTime");
  const endTimeStr = watch("endTime");
  const tasks = watch("tasks");

  const getNowTimeStr = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const setStartTimeNow = () => {
    setValue("startTime", getNowTimeStr(), { shouldValidate: true });
  };

  const setEndTimeNow = () => {
    setValue("endTime", getNowTimeStr(), { shouldValidate: true });
  };

  const applyEndTimeShortcut = (addMinutes: number) => {
    const base = startTimeStr || getNowTimeStr();
    const [h, m] = base.split(":").map(Number);
    const total = h * 60 + m + addMinutes;
    const newH = Math.floor(total / 60) % 24;
    const newM = total % 60;
    setValue("endTime", `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`, { shouldValidate: true });
  };

  // Deteksi apakah jam mulai dimundurkan lebih awal dari waktu form dibuka
  const isStartTimeAdjustedBack = useMemo(() => {
    if (!startTimeStr || !formCreatedAtRef.current || !!submission) return false;
    const [fH, fM] = formCreatedAtRef.current.split(":").map(Number);
    const [sH, sM] = startTimeStr.split(":").map(Number);
    return (sH * 60 + sM) < (fH * 60 + fM);
  }, [startTimeStr, submission]);

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
  const workLocationDetail = watch("workLocationDetail");
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
    if (location === "lainnya" && !workLocationDetail?.trim()) {
      reasons.push("Detail lokasi kerja belum diisi");
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
    workLocationDetail,
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

  // Reset inputMode when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setInputMode(null);
      setPendingMode(null);
      setRealtimeDraftDoc(null);
      setShowResumeDialog(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || submission) return;
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      setHasLocalRealtimeDraft(false);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setHasLocalRealtimeDraft(true);
      if (parsed?.date || parsed?.startTime || parsed?.reason) {
        form.reset({
          date: parsed.date ? new Date(parsed.date) : new Date(),
          startTime: parsed.startTime || "",
          endTime: parsed.endTime || "",
          overtimeType: parsed.overtimeType || "hari_kerja",
          tasks: Array.isArray(parsed.tasks) && parsed.tasks.length > 0
            ? parsed.tasks
            : [{ description: "", estimatedMinutes: 60 }],
          reason: parsed.reason || "",
          location: normalizeWorkLocation(parsed.location),
          workLocationDetail: parsed.workLocationDetail || "",
          employeeNotes: parsed.employeeNotes || "",
          attachments: parsed.attachments || [],
          overtimeCoordinatorUid: parsed.overtimeCoordinatorUid || "",
          overtimeInstructionNote: parsed.overtimeInstructionNote || "",
        });
      }
    } catch {
      setHasLocalRealtimeDraft(false);
    }
  }, [open, submission, draftStorageKey, form]);

  useEffect(() => {
    if (!open || submission || inputMode !== "realtime") return;
    const subscription = form.watch(() => {
      persistRealtimeDraft();
    });
    persistRealtimeDraft();
    return () => subscription.unsubscribe();
  }, [open, submission, inputMode, form, persistRealtimeDraft]);

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
          location: normalizeWorkLocation(submission.location),
          workLocationDetail: (submission as any).workLocationDetail || "",
          employeeNotes: submission.employeeNotes || "",
          attachments: (submission.attachments || []).map((a: any) =>
            typeof a === "string" ? a : (a.fileUrl || a.url || a.driveFileId || "")
          ).filter(Boolean),
          overtimeCoordinatorUid:
            (submission as any).overtimeCoordinatorUid || "",
          overtimeInstructionNote:
            (submission as any).overtimeInstructionNote || "",
        });
        // Reset attachments state for edit mode
        setAttachments([]);
      } else {
        const nowStr = getNowTimeStr();
        formCreatedAtRef.current = nowStr;
        setStartTimeAdjustmentReason("");
        form.reset({
          date: new Date(),
          startTime: nowStr,
          endTime: "",
          overtimeType: "hari_kerja",
          tasks: [{ description: "", estimatedMinutes: 60 }],
          reason: "",
          location: "kantor",
          workLocationDetail: "",
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

  const handleCreateRealtimeDraft = async () => {
    if (!userProfile) return;
    setIsCreatingRealtimeDraft(true);
    try {
      const hrd = employeeProfile?.hrdEmploymentInfo;
      const newDocRef = doc(collection(firestore, "overtime_submissions"));
      const brandId = hrd?.brandId || employeeProfile?.brandId || userProfile?.brandId;
      const brandName = staffBrandName || "";
      const divisionName = displayInfo.division || "";
      let restoredDraft: any = null;
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(draftStorageKey);
          restoredDraft = raw ? JSON.parse(raw) : null;
        } catch {}
      }
      const draftPayload: any = {
        employeeUid: userProfile.uid,
        employeeName: userProfile.fullName || "",
        brandId: Array.isArray(brandId) ? brandId[0] : brandId ?? "",
        brandName,
        divisionName,
        workRole: hrd?.workRole || displayInfo.positionTitle,
        inputMode: "realtime",
        timerStatus: "draft",
        status: "draft",
        approvalStatus: "draft",
        overtimeDate: restoredDraft?.date ? Timestamp.fromDate(new Date(restoredDraft.date)) : null,
        startTime: restoredDraft?.startTime || "",
        endTime: restoredDraft?.endTime || "",
        totalDurationMinutes: 0,
        reason: restoredDraft?.reason || "",
        overtimeType: restoredDraft?.overtimeType || "hari_kerja",
        location: normalizeWorkLocation(restoredDraft?.location),
        workLocation: normalizeWorkLocation(restoredDraft?.location),
        workLocationDetail: restoredDraft?.workLocationDetail || "",
        overtimeTypeLabel:
          restoredDraft?.overtimeType === "hari_libur"
            ? "Hari Libur"
            : restoredDraft?.overtimeType === "urgent"
              ? "Urgent"
              : "Hari Kerja",
        workLocationLabel: getWorkLocationLabel(
          restoredDraft?.location,
          restoredDraft?.workLocationDetail,
        ),
        tasks: restoredDraft?.tasks || [{ description: "", estimatedMinutes: 60 }],
        taskDetails: restoredDraft?.tasks || [{ description: "", estimatedMinutes: 60 }],
        overtimeCoordinatorUid: restoredDraft?.overtimeCoordinatorUid || "",
        overtimeInstructionNote: restoredDraft?.overtimeInstructionNote || "",
        employeeNotes: restoredDraft?.employeeNotes || "",
        pauseLogs: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDocumentNonBlocking(newDocRef, draftPayload, { merge: false });
      const nowTs = Timestamp.now();
      setRealtimeDraftDoc({
        id: newDocRef.id,
        ...draftPayload,
        createdAt: nowTs,
        updatedAt: nowTs,
      } as OvertimeSubmission);
      setInputMode("realtime");
      setHasLocalRealtimeDraft(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal membuat draft realtime", description: e.message });
    } finally {
      setIsCreatingRealtimeDraft(false);
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

    // Validasi alasan penyesuaian jam mulai
    if (isStartTimeAdjustedBack && !startTimeAdjustmentReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan penyesuaian jam mulai wajib diisi",
        description: "Jam mulai dimundurkan dari waktu form dibuka. Harap jelaskan alasannya.",
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

        // Start-time audit trail
        ...(mode === "Buat" && {
          formCreatedAt: formCreatedAtRef.current || values.startTime,
          originalStartTimeAuto: formCreatedAtRef.current || values.startTime,
          startTimeAdjusted: isStartTimeAdjustedBack,
          startTimeAdjustmentMinutes: isStartTimeAdjustedBack
            ? (() => {
                const [fH, fM] = (formCreatedAtRef.current || "0:0").split(":").map(Number);
                const [sH, sM] = values.startTime.split(":").map(Number);
                return (sH * 60 + sM) - (fH * 60 + fM);
              })()
            : 0,
          startTimeAdjustmentReason: isStartTimeAdjustedBack ? startTimeAdjustmentReason.trim() : null,
        }),
        overtimeType: values.overtimeType,
        overtimeTypeLabel:
          values.overtimeType === "hari_kerja"
            ? "Hari Kerja"
            : values.overtimeType === "hari_libur"
              ? "Hari Libur"
              : "Urgent",
        location: normalizeWorkLocation(values.location),
        workLocation: normalizeWorkLocation(values.location),
        workLocationDetail:
          values.location === "lainnya" ? values.workLocationDetail?.trim() || "" : "",
        workLocationLabel: getWorkLocationLabel(
          values.location,
          values.workLocationDetail,
        ),

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
  const locationLabel = getWorkLocationLabel(
    submission?.workLocation || submission?.location,
    (submission as any)?.workLocationDetail,
  );
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

  // If existing submission with realtime inputMode and timer still active
  const isRealtimeActive = submission &&
    (submission as any).inputMode === "realtime" &&
    ["draft", "timer_running", "timer_paused", "timer_finished_pending_submit"].includes(
      (submission as any).approvalStatus || submission.status || "draft"
    );

  const realtimeModalHeader = (
    <DialogHeader className="shrink-0 border-b px-7 py-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/40">
          <Timer className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <DialogTitle className="text-[17px] font-semibold">Timer Lembur Realtime</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-0.5">
            Catat lembur saat sedang berlangsung. Data belum menjadi pengajuan sampai timer selesai dan Anda menekan Kirim Pengajuan.
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );

  if (isRealtimeActive && submission) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-[20px]">
          {realtimeModalHeader}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            <RealtimeOvertimeTimer
              submission={submission}
              onSubmitted={() => { onSuccess(); onOpenChange(false); }}
              onCancelled={() => { onSuccess(); onOpenChange(false); }}
              eligibleCoordinators={eligibleCoordinators}
              resolvedDivisionManager={resolvedDivisionManager}
              employeeDisplayInfo={displayInfo}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // If creating new and user chose realtime mode
  if (!submission && inputMode === "realtime" && realtimeDraftDoc) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-[20px]">
          {realtimeModalHeader}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            <RealtimeOvertimeTimer
              submission={realtimeDraftDoc}
              onSubmitted={() => { onSuccess(); onOpenChange(false); }}
              onCancelled={() => { onSuccess(); onOpenChange(false); }}
              eligibleCoordinators={eligibleCoordinators}
              resolvedDivisionManager={resolvedDivisionManager}
              employeeDisplayInfo={displayInfo}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Mode selection screen — only for new submissions
  if (!submission && inputMode === null && canSubmitOvertime) {
    const handleLanjutkan = async () => {
      if (!pendingMode) return;
      if (pendingMode === "manual") {
        setInputMode("manual");
      } else {
        // Check for existing unfinished realtime drafts
        if (existingRealtimeDrafts.length > 0) {
          setShowResumeDialog(true);
        } else {
          await handleCreateRealtimeDraft();
        }
      }
    };

    const handleResumeDraft = () => {
      const draft = existingRealtimeDrafts[0];
      setRealtimeDraftDoc(draft);
      setInputMode("realtime");
      setShowResumeDialog(false);
    };

    const modeCards: Array<{
      id: "manual" | "realtime";
      icon: React.ReactNode;
      title: string;
      badge: string;
      badgeStyle: string;
      description: string;
      points: string[];
    }> = [
      {
        id: "manual",
        icon: <PenLine className="h-5 w-5" />,
        title: "Manual",
        badge: "Input setelah selesai",
        badgeStyle: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
        description: "Untuk lembur yang sudah selesai dilakukan.",
        points: [
          "Isi tanggal dan jam secara manual",
          "Cocok untuk lembur yang sudah selesai",
          "Masuk preview sebelum dikirim",
        ],
      },
      {
        id: "realtime",
        icon: <Timer className="h-5 w-5" />,
        title: "Realtime Timer",
        badge: "Belum langsung diajukan",
        badgeStyle: "bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700/40",
        description: "Untuk mencatat lembur yang sedang berlangsung.",
        points: [
          "Isi rencana pekerjaan dulu",
          "Timer mulai setelah konfirmasi",
          "Bisa pause dan lanjut",
          "Kirim setelah preview akhir",
        ],
      },
    ];

    return (
      <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[880px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[20px] shadow-2xl gap-0">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b border-border/60 px-8 py-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/40">
                <Timer className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[17px] font-semibold leading-tight">
                  Pilih Mode Pengajuan Lembur
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                  Pilih cara mencatat lembur sesuai kondisi pekerjaan Anda saat ini.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Card grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {modeCards.map((card) => {
                const isActive = pendingMode === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setPendingMode(card.id)}
                    className={`relative flex flex-col rounded-2xl border-2 p-6 text-left transition-all duration-150 ${
                      isActive
                        ? "border-teal-500 bg-teal-50/70 dark:bg-teal-900/15 shadow-sm"
                        : "border-slate-200 dark:border-slate-700 bg-background hover:border-teal-300 hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    }`}
                  >
                    {/* Active check */}
                    <span className={`absolute top-4 right-4 transition-opacity duration-100 ${isActive ? "opacity-100" : "opacity-0"}`}>
                      <CheckCircle2 className="h-5 w-5 text-teal-500" />
                    </span>

                    {/* Icon + Title row */}
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isActive ? "bg-teal-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}>
                        {card.icon}
                      </div>
                      <span className="text-[15px] font-bold tracking-tight">{card.title}</span>
                    </div>

                    {/* Badge */}
                    <div className="mb-3 pl-[48px]">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        isActive ? "bg-teal-100 text-teal-700 dark:bg-teal-800/50 dark:text-teal-300" : card.badgeStyle
                      }`}>
                        {card.badge}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                      {card.description}
                    </p>

                    {/* Divider */}
                    <div className={`mb-4 border-t ${isActive ? "border-teal-200 dark:border-teal-700/50" : "border-slate-100 dark:border-slate-700/50"}`} />

                    {/* Points */}
                    <ul className="space-y-2.5">
                      {card.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            isActive
                              ? "bg-teal-500 text-white"
                              : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-400"
                          }`}>
                            ✓
                          </span>
                          <span className="text-[13px] text-muted-foreground leading-snug">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Info box */}
            <div className="flex gap-3 rounded-[14px] border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/30 px-5 py-4">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-px" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300 mb-1">Catatan penting</p>
                <p className="text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong>Realtime Timer</strong> hanya mencatat durasi lembur. Pengajuan baru dikirim setelah timer selesai, preview ditinjau, dan tombol <strong>Kirim Pengajuan</strong> ditekan.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border/60 px-8 py-4 flex items-center justify-between bg-background">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleLanjutkan}
              disabled={!pendingMode || isCreatingRealtimeDraft}
              className="h-11 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white gap-2 px-8 text-[14px] font-semibold shadow-sm"
            >
              {isCreatingRealtimeDraft ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyiapkan...
                </>
              ) : (
                <>
                  Lanjutkan
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resume draft dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Draft Realtime Belum Selesai</DialogTitle>
            <DialogDescription>
              Anda memiliki {existingRealtimeDrafts.length} draft lembur realtime yang belum selesai. Lanjutkan draft tersebut atau buat sesi baru?
            </DialogDescription>
          </DialogHeader>
          {existingRealtimeDrafts.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
              {existingRealtimeDrafts.slice(0, 3).map((d) => {
                const ts = (d as any).createdAt?.toDate?.();
                const timerStatus = (d as any).timerStatus ?? 'draft';
                const statusLabel = timerStatus === 'running' ? '⏱ Sedang Berjalan' : timerStatus === 'paused' ? '⏸ Dijeda' : timerStatus === 'finished_pending_submit' ? '✅ Selesai, Belum Diajukan' : '📝 Draft Persiapan';
                return (
                  <div key={d.id} className="flex justify-between items-center text-xs">
                    <span className="font-medium">{statusLabel}</span>
                    <span className="text-muted-foreground">{ts ? format(ts, 'dd MMM yyyy HH:mm', { locale: idLocale }) : '-'}</span>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={async () => { setShowResumeDialog(false); await handleCreateRealtimeDraft(); }}>
              Buat Sesi Baru
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleResumeDraft}>
              Lanjutkan Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
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

              <section className="space-y-4">
                {/* Row 1: Tanggal */}
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

                {/* Row 2: Jam Mulai */}
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Jam Mulai
                        {!isReadOnly && formCreatedAtRef.current && (
                          <span className="text-[10px] font-normal text-muted-foreground">
                            (otomatis terisi {formCreatedAtRef.current})
                          </span>
                        )}
                      </FormLabel>
                      <div className="flex gap-2 items-center">
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            readOnly={isReadOnly}
                            className={`flex-1 ${
                              submitAttempted && !isTimeRangeValid
                                ? "border-destructive ring-1 ring-destructive"
                                : ""
                            }`}
                          />
                        </FormControl>
                        {!isReadOnly && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-shrink-0 text-xs gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
                            onClick={setStartTimeNow}
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            Sekarang
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Alasan penyesuaian jam mulai — muncul jika dimundurkan */}
                {isStartTimeAdjustedBack && !isReadOnly && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <RotateCcw className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800">Jam mulai dimundurkan dari {formCreatedAtRef.current}</p>
                        <p className="text-[11px] text-amber-600">Harap jelaskan alasan penyesuaian ini untuk keperluan audit.</p>
                      </div>
                    </div>
                    <textarea
                      value={startTimeAdjustmentReason}
                      onChange={(e) => setStartTimeAdjustmentReason(e.target.value)}
                      placeholder="Contoh: Saya mulai lembur pukul 17.00, tetapi baru mengisi pengajuan setelah pekerjaan berjalan."
                      rows={2}
                      className="w-full text-xs rounded-lg border border-amber-300 bg-white px-3 py-2 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
                    />
                  </div>
                )}

                {/* Row 3: Estimasi Durasi (Shortcuts) + Jam Selesai */}
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimasi Jam Selesai</FormLabel>
                      {/* Shortcut buttons */}
                      {!isReadOnly && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {[
                            { label: "+30m", minutes: 30 },
                            { label: "+1 jam", minutes: 60 },
                            { label: "+1j 30m", minutes: 90 },
                            { label: "+2 jam", minutes: 120 },
                            { label: "+3 jam", minutes: 180 },
                            { label: "+4 jam", minutes: 240 },
                          ].map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => applyEndTimeShortcut(s.minutes)}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 items-center">
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            readOnly={isReadOnly}
                            className={`flex-1 ${
                              submitAttempted && !isTimeRangeValid
                                ? "border-destructive ring-1 ring-destructive"
                                : ""
                            }`}
                          />
                        </FormControl>
                        {!isReadOnly && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-shrink-0 text-xs gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50"
                            onClick={setEndTimeNow}
                          >
                            <StopCircle className="h-3.5 w-3.5" />
                            Sekarang
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Durasi otomatis */}
                {totalDuration > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-teal-500" />
                    <span>Total Durasi: <strong className="text-teal-600">{Math.floor(totalDuration / 60) > 0 ? `${Math.floor(totalDuration / 60)} jam ` : ""}{totalDuration % 60 > 0 ? `${totalDuration % 60} menit` : ""}</strong></span>
                  </div>
                )}
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
                          {workLocationOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {location === "lainnya" && (
                  <FormField
                    control={form.control}
                    name="workLocationDetail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Detail Lokasi Kerja</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: perjalanan dinas, event, gudang, lokasi project, dll."
                            {...field}
                            readOnly={isReadOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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
                          ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                          : durationValidation.status === "valid"
                            ? "border-green-300 bg-green-50 dark:border-green-500/40 dark:bg-green-500/10"
                            : ""
                      }
                    >
                      {durationValidation.status === "error" && (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      {durationValidation.status === "valid" && (
                        <UserCheck className="h-4 w-4 text-green-600 dark:text-green-300" />
                      )}
                      {durationValidation.status === "warning" && (
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      )}
                      <AlertTitle
                        className={
                          durationValidation.status === "warning"
                            ? "text-amber-800 font-semibold dark:text-amber-300"
                            : durationValidation.status === "valid"
                              ? "text-green-800 font-semibold dark:text-green-300"
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
                            : durationValidation.status === "warning"
                              ? "text-amber-700 dark:text-amber-200"
                              : "text-green-700 dark:text-green-200"
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
