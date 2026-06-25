import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Send, Info } from "lucide-react";
import {
  OvertimeSubmission,
  isFinalStatus,
  isActionableStatus,
} from "@/lib/types";
import { OvertimeApprovalStatusBadge } from "./OvertimeApprovalStatusBadge";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, updateDocumentNonBlocking } from "@/firebase";
import {
  doc,
  serverTimestamp,
  collection,
  addDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { sendNotification, sendHrdNotification } from "@/lib/notifications";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReviewOvertimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission;
  onSuccess: () => void;
  mode: "manager" | "hrd";
  dailyTotalMinutes?: number;
}

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) => (
  <div className="flex justify-between text-sm">
    <p className="text-muted-foreground">{label}</p>
    <p className="font-medium text-right">{value ?? "-"}</p>
  </div>
);

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
    submission.workLocationLabel ||
    rawLocation;
  const detail = (submission as any).workLocationDetail?.trim?.();
  return rawLocation === "lainnya" && detail ? `${label} - ${detail}` : label;
};

const SummaryTile = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-1 text-sm font-bold leading-5 text-slate-900">
      {value || "-"}
    </p>
  </div>
);

export function ReviewOvertimeDialog({
  open,
  onOpenChange,
  submission,
  onSuccess,
  mode,
  dailyTotalMinutes = 0,
}: ReviewOvertimeDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showProxyDialog, setShowProxyDialog] = useState(false);
  const [proxyMethod, setProxyMethod] = useState("lisan");
  const [proxyNote, setProxyNote] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [hrdHours, setHrdHours] = useState(0);
  const [hrdMinutes, setHrdMinutes] = useState(0);
  const [hrdNotes, setHrdNotes] = useState("");
  const [overLimitDecision, setOverLimitDecision] = useState<"full_approved" | "partial_approved" | "">("");
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const formatMinutesToHuman = (minutes: number): string => {
    if (!minutes) return "0 menit";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs} jam ${mins} menit`;
    if (hrs > 0) return `${hrs} jam`;
    return `${mins} menit`;
  };

  useEffect(() => {
    if (open && submission) {
      const initialMinutes =
        submission.approvedMinutesFinal !== undefined &&
        submission.approvedMinutesFinal !== null
          ? submission.approvedMinutesFinal
          : submission.totalDurationMinutes || 0;
      setHrdHours(Math.floor(initialMinutes / 60));
      setHrdMinutes(initialMinutes % 60);
      setHrdNotes(submission.hrdNotes || "");
      setRevisionNote(submission.revisionNote || "");
      setRejectionReason(submission.rejectionReason || "");
      setOverLimitDecision(submission.overLimitDecision || "");
    }
  }, [open, submission]);

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

  const resolvedStatus =
    (submission as any).approvalStatus || submission.status || "draft";
  const isCoordinatorReview =
    mode === "manager" && resolvedStatus === "pending_coordinator";
  const tasks = submission.taskDetails || submission.tasks || [];
  const totalEstimatedMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimatedMinutes || 0),
    0,
  );
  const submittedAt =
    parseSafeDate((submission as any).submittedAt ?? submission.createdAt) ||
    new Date();
  const overtimeDate =
    parseSafeDate((submission as any).overtimeDate ?? submission.date) || null;
  const managerDecisionAt = parseSafeDate(submission.managerDecisionAt);
  const isFinal = isFinalStatus(resolvedStatus);

  const getCanActStrict = () => {
    if (isFinal) return false;
    if (!userProfile) return false;
    if (mode === "manager") {
      if (resolvedStatus === "pending_coordinator") {
        return submission.overtimeCoordinatorUid === userProfile.uid;
      }
      if (resolvedStatus === "pending_supervisor" || resolvedStatus === "pending_manager" || resolvedStatus === "revision_manager") {
        return submission.directSupervisorUid === userProfile.uid || submission.managerUid === userProfile.uid;
      }
    }
    if (mode === "hrd") {
      return ["pending_hrd", "approved_by_manager", "revision_hrd", "revision_requested_by_hrd", "verified_manager"].includes(resolvedStatus);
    }
    return false;
  };

  const canAct = getCanActStrict();
  const operatorName = userProfile?.fullName || userProfile?.email || "";

  const isManagerOrHrd = mode === "hrd" || (userProfile && (submission.directSupervisorUid === userProfile.uid || submission.managerUid === userProfile.uid));
  const canRecordProxyApproval = resolvedStatus === "pending_coordinator" && !!isManagerOrHrd && submission.overtimeCoordinatorUid !== userProfile?.uid;

  const approvalStatusLabels: Record<string, string> = {
    pending_coordinator: "Menunggu Review Koordinator",
    pending_supervisor: "Menunggu Review Manager Divisi",
    pending_hrd: "Diteruskan ke HRD",
    needs_revision: "Perlu Revisi",
    revision_manager: "Perlu Revisi",
    revision_hrd: "Perlu Revisi",
    approved_hrd: "Disetujui HRD",
    approved: "Disetujui HRD",
    rejected_manager: "Ditolak Manager Divisi",
    rejected_hrd: "Ditolak HRD",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
    draft: "Draft",
  };

  const getApprovalStatusLabel = (status: string) =>
    approvalStatusLabels[status] || status || "-";

  const workLocationLabel = getWorkLocationDisplay(submission);

  const overtimeTypeLabel =
    submission.overtimeTypeLabel ||
    (submission.overtimeType === "hari_kerja"
      ? "Hari Kerja"
      : submission.overtimeType === "hari_libur"
        ? "Hari Libur"
        : submission.overtimeType === "urgent"
          ? "Urgent"
          : submission.overtimeType || "-");

  const getTimelineBadgeClass = (state: string) => {
    if (state === "Selesai") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (state === "Ditolak") return "border-red-200 bg-red-50 text-red-700";
    if (state === "Revisi") return "border-orange-200 bg-orange-50 text-orange-700";
    return "border-amber-200 bg-amber-50 text-amber-700";
  };

  const approvalTimelineSteps = [
    {
      title: "Pengajuan Dibuat",
      reviewer: submission.employeeName || submission.fullName || "Karyawan",
      state: "Selesai",
    },
    {
      title: "Review Koordinator/Pengawas",
      reviewer: (submission as any).overtimeCoordinatorName || "Koordinator/Pengawas",
      state:
        resolvedStatus === "pending_coordinator"
          ? "Menunggu"
          : resolvedStatus.includes("rejected") &&
              (submission as any).rejected_by_coordinator
            ? "Ditolak"
            : resolvedStatus.includes("revision") &&
                resolvedStatus.includes("coordinator")
              ? "Revisi"
              : submission.coordinatorApprovedAt ||
                  resolvedStatus === "pending_supervisor" ||
                  resolvedStatus === "pending_manager" ||
                  resolvedStatus === "pending_hrd" ||
                  resolvedStatus === "approved_by_manager" ||
                  resolvedStatus === "approved" ||
                  resolvedStatus === "approved_hrd"
                ? "Selesai"
                : "Menunggu",
    },
    {
      title: "Review Manager Divisi",
      reviewer:
        submission.supervisorApprovedByName ||
        submission.directSupervisorName ||
        "Manager Divisi",
      state:
        resolvedStatus === "pending_supervisor" ||
        resolvedStatus === "pending_manager"
          ? "Menunggu"
          : resolvedStatus === "revision_manager"
            ? "Revisi"
            : resolvedStatus === "rejected_manager"
              ? "Ditolak"
              : submission.supervisorApprovedAt ||
                  resolvedStatus === "pending_hrd" ||
                  resolvedStatus === "approved_by_manager" ||
                  resolvedStatus === "approved" ||
                  resolvedStatus === "approved_hrd"
                ? "Selesai"
                : "Menunggu",
    },
    {
      title: "Review HRD",
      reviewer: "Final approval",
      state:
        resolvedStatus === "pending_hrd" || resolvedStatus === "approved_by_manager"
          ? "Menunggu"
          : resolvedStatus === "revision_hrd"
            ? "Revisi"
            : resolvedStatus === "rejected_hrd"
              ? "Ditolak"
              : resolvedStatus === "approved" || resolvedStatus === "approved_hrd"
                ? "Selesai"
                : "Menunggu",
    },
    {
      title: "Selesai",
      reviewer: getApprovalStatusLabel(resolvedStatus),
      state:
        resolvedStatus === "approved" || resolvedStatus === "approved_hrd"
          ? "Selesai"
          : resolvedStatus.includes("rejected")
            ? "Ditolak"
            : resolvedStatus.includes("revision")
              ? "Revisi"
              : "Menunggu",
    },
  ];

  const handleDecision = async (
    decision: "approve" | "reject" | "revise",
    note?: string,
  ) => {
    if (!userProfile) return;
    if (!submission.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Submission ID tidak ditemukan.",
      });
      return;
    }

    if (!canAct) {
      toast({
        variant: "destructive",
        title: "Aksi Ditolak",
        description:
          "Pengajuan ini sudah final atau tidak lagi dapat diproses.",
      });
      return;
    }

    try {
      const submissionRef = doc(
        firestore,
        "overtime_submissions",
        submission.id!,
      );
      let payload: any = {};
      const isManagerAction = mode === "manager";
      const isCoordinatorAction =
        isManagerAction && resolvedStatus === "pending_coordinator";

      if (isManagerAction) {
        if (isCoordinatorAction) {
          const coordinatorUid = submission.overtimeCoordinatorUid;
          const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
          const isSame = !!(coordinatorUid && managerUid && coordinatorUid === managerUid);

          if (decision === "approve") {
            if (isSame) {
              payload = {
                approvalStatus: "pending_hrd",
                status: "pending_hrd",
                coordinatorDecision: "approved",
                coordinatorDecisionAt: serverTimestamp() as any,
                coordinatorDecisionBy: userProfile.uid,
                coordinatorDecisionByName: userProfile.displayName || userProfile.email || operatorName || null,
                supervisorApprovedAt: serverTimestamp() as any,
                supervisorApprovedBy: userProfile.uid,
                supervisorApprovedByName: userProfile.displayName || userProfile.email || operatorName || null,
                coordinatorNotes: note || null,
                managerNotes: note || null,
                managerDecisionAt: serverTimestamp() as any,
              };
            } else {
              payload = {
                approvalStatus: "pending_supervisor",
                status: "pending_supervisor",
                coordinatorDecision: "approved",
                coordinatorDecisionAt: serverTimestamp() as any,
                coordinatorDecisionBy: userProfile.uid,
                coordinatorDecisionByName: userProfile.displayName || userProfile.email || operatorName || null,
                coordinatorApprovedAt: serverTimestamp() as any,
                coordinatorApprovedBy: userProfile.uid,
                coordinatorApprovedByName: userProfile.displayName || userProfile.email || operatorName || null,
                coordinatorNotes: note || null,
              };
            }
          } else if (decision === "reject") {
            payload = {
              approvalStatus: "rejected_by_coordinator",
              status: "rejected_by_coordinator",
              rejectedAt: serverTimestamp() as any,
              rejectedBy: userProfile.uid,
              rejectionReason: note || null,
              coordinatorDecision: "rejected",
              coordinatorDecisionAt: serverTimestamp() as any,
            } as any;
          } else if (decision === "revise") {
            payload = {
              approvalStatus: "revision_requested_by_coordinator",
              status: "revision_requested_by_coordinator",
              revisionRequestedAt: serverTimestamp() as any,
              revisionRequestedBy: userProfile.uid,
              revisionNote: note || null,
              coordinatorDecision: "revision",
              coordinatorDecisionAt: serverTimestamp() as any,
            } as any;
          }
        } else {
          if (decision === "approve") {
            payload = {
              approvalStatus: "pending_hrd",
              status: "pending_hrd",
              supervisorApprovedAt: serverTimestamp() as any,
              supervisorApprovedBy: userProfile.uid,
              supervisorApprovedByName: operatorName || null,
              managerNotes: note || null,
              managerDecisionAt: serverTimestamp() as any,
            };
          } else if (decision === "reject") {
            payload = {
              approvalStatus: "rejected_manager",
              status: "rejected_manager",
              rejectedAt: serverTimestamp() as any,
              rejectedBy: userProfile.uid,
              rejectionReason: note || null,
              managerDecisionAt: serverTimestamp() as any,
            };
          } else if (decision === "revise") {
            payload = {
              approvalStatus: "revision_manager",
              status: "revision_manager",
              revisionRequestedAt: serverTimestamp() as any,
              revisionRequestedBy: userProfile.uid,
              revisionNote: note || null,
              managerDecisionAt: serverTimestamp() as any,
            };
          }
        }
      } else {
        let status: OvertimeSubmission["status"] =
          resolvedStatus as OvertimeSubmission["status"];
        if (decision === "approve") status = "approved_hrd";
        else if (decision === "reject") status = "rejected_hrd";
        else if (decision === "revise") status = "revision_hrd";

        const finalApprovedMinutes = decision === "approve" ? approvedMinutesFinal : null;
        payload = {
          status,
          approvalStatus: status,
          hrdReviewerUid: userProfile.uid,
          hrdNotes: note || null,
          hrdDecisionAt: serverTimestamp() as any,
          approvedMinutesFinal: finalApprovedMinutes,
          // Over-limit audit fields
          ...(isOverLimit && {
            isOverDailyLimit: true,
            dailyOvertimeLimitMinutes: DAILY_LIMIT_MINUTES,
            overtimeRequestedMinutes: submission.totalDurationMinutes || 0,
            overtimeApprovedMinutes: finalApprovedMinutes,
            overtimeRejectedMinutes: finalApprovedMinutes != null
              ? Math.max(0, (submission.totalDurationMinutes || 0) - finalApprovedMinutes)
              : null,
            overtimeExcessMinutes: excessMinutes,
            overLimitDecision: decision === "approve" ? (overLimitDecision || "full_approved") : null,
            hrdOverLimitNote: note || null,
          }),
        };

        // Create payroll recap & update employee history if approved by HRD
        if (decision === "approve") {
          const payrollMonth = overtimeDate
            ? format(overtimeDate, "yyyy-MM")
            : format(new Date(), "yyyy-MM");
          const workMode = workLocationLabel;

          const taskSummary = tasks
            .map((t: any) => t.description)
            .filter(Boolean)
            .join("; ");

          const recapColRef = collection(firestore, "overtime_payroll_recaps");
          await addDoc(recapColRef, {
            employeeId: submission.employeeUid || submission.uid!,
            employeeName: submission.employeeName || submission.fullName || "",
            brand: submission.brandName || "",
            division: submission.divisionName || submission.division || "",
            managerId:
              submission.directSupervisorUid || submission.supervisorUid || "",
            managerName:
              submission.directSupervisorName ||
              submission.supervisorName ||
              "",
            overtimeDate: overtimeDate
              ? format(overtimeDate, "yyyy-MM-dd")
              : format(new Date(), "yyyy-MM-dd"),
            startTime: submission.startTime || "",
            endTime: submission.endTime || "",
            submittedMinutes: submission.totalDurationMinutes || 0,
            estimatedMinutes: totalEstimatedMinutes,
            managerApprovedMinutes: submission.totalDurationMinutes || 0,
            hrdApprovedMinutes: approvedMinutesFinal,
            location: workLocationLabel,
            workMode,
            taskSummary,
            reason: submission.reason || "",
            payrollMonth,
            payrollStatus: "pending_payroll",
            approvedByHrd: operatorName,
            approvedAt: serverTimestamp(),
            // Over-limit fields for rekap payroll
            isOverDailyLimit: isOverLimit,
            overtimeExcessMinutes: isOverLimit ? excessMinutes : 0,
            overLimitDecision: isOverLimit ? (overLimitDecision || "full_approved") : null,
            hrdOverLimitNote: isOverLimit ? (note || null) : null,
          });

          // Append to employee's overtimeHistory
          const empId = submission.employeeUid || submission.uid!;
          const historyItem = {
            date: overtimeDate ? format(overtimeDate, "yyyy-MM-dd") : "-",
            startTime: submission.startTime || "",
            endTime: submission.endTime || "",
            approvedMinutesFinal: approvedMinutesFinal,
            status: "approved_hrd",
            location: workLocationLabel,
            notes: note || "",
            timestamp: new Date().toISOString(),
          };

          await updateDoc(doc(firestore, "employees", empId), {
            overtimeHistory: arrayUnion(historyItem),
          }).catch((err) => console.error("Error employees history:", err));

          await updateDoc(doc(firestore, "employee_profiles", empId), {
            overtimeHistory: arrayUnion(historyItem),
          }).catch((err) =>
            console.error("Error employee_profiles history:", err),
          );
        }
      }

      await updateDocumentNonBlocking(submissionRef, payload);

      try {
        if (isManagerAction) {
          if (isCoordinatorAction) {
            if (decision === "approve") {
              const coordinatorUid = submission.overtimeCoordinatorUid;
              const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
              const isSame = !!(coordinatorUid && managerUid && coordinatorUid === managerUid);

              if (isSame) {
                await Promise.all([
                  sendHrdNotification(firestore, {
                    type: "status_update",
                    module: "employee",
                    title: "Pengajuan Lembur Diteruskan ke HRD",
                    message: `${submission.employeeName || submission.fullName} telah disetujui oleh koordinator (merangkap manager) dan menunggu review HRD.`,
                    targetType: "employee",
                    targetId: submission.id || "",
                    actionUrl: "/admin/hrd/persetujuan-lembur",
                    createdBy: userProfile.uid,
                    meta: {
                      submissionId: submission.id,
                      employeeUid: submission.employeeUid || submission.uid,
                    },
                  }),
                  sendNotification(firestore, {
                    userId: submission.employeeUid || submission.uid!,
                    type: "status_update",
                    module: "employee",
                    title: "Pengajuan Lembur Diteruskan ke HRD",
                    message:
                      "Pengajuan lembur Anda telah disetujui oleh koordinator (merangkap manager) dan sedang menunggu persetujuan HRD.",
                    targetType: "user",
                    targetId: submission.id || "",
                    actionUrl: "/admin/karyawan/pengajuan-lembur",
                    createdBy: userProfile.uid,
                  }),
                ]);
              } else {
                await Promise.all([
                  managerUid
                    ? sendNotification(firestore, {
                        userId: managerUid,
                        type: "status_update",
                        module: "employee",
                        title: "Pengajuan Lembur Diteruskan ke Manager Divisi",
                        message: note
                          ? `Koordinator menyetujui pengajuan lembur dan meneruskannya ke manager: ${note}`
                          : "Pengajuan lembur telah disetujui oleh koordinator dan sedang menunggu review manager.",
                        targetType: "user",
                        targetId: submission.id || "",
                        actionUrl: "/admin/manager/persetujuan-lembur",
                        createdBy: userProfile.uid,
                      })
                    : Promise.resolve(),
                  sendNotification(firestore, {
                    userId: submission.employeeUid || submission.uid!,
                    type: "status_update",
                    module: "employee",
                    title: "Pengajuan Lembur Diteruskan ke Manager Divisi",
                    message:
                      "Pengajuan lembur Anda telah disetujui oleh koordinator dan sedang menunggu review manager.",
                    targetType: "user",
                    targetId: submission.id || "",
                    actionUrl: "/admin/karyawan/pengajuan-lembur",
                    createdBy: userProfile.uid,
                  }),
                ]);
              }
            } else if (decision === "reject") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Pengajuan Lembur Ditolak oleh Koordinator",
                message: note
                  ? `Koordinator menolak pengajuan lembur Anda: ${note}`
                  : "Koordinator menolak pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            } else if (decision === "revise") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Revisi Pengajuan Lembur Diperlukan",
                message: note
                  ? `Koordinator meminta revisi: ${note}`
                  : "Koordinator meminta revisi untuk pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            }
          } else {
            if (decision === "approve") {
              await Promise.all([
                sendHrdNotification(firestore, {
                  type: "status_update",
                  module: "employee",
                  title: "Pengajuan Lembur Diteruskan ke HRD",
                  message: `${submission.employeeName || submission.fullName} telah disetujui oleh manager dan menunggu review HRD.`,
                  targetType: "employee",
                  targetId: submission.id || "",
                  actionUrl: "/admin/hrd/persetujuan-lembur",
                  createdBy: userProfile.uid,
                  meta: {
                    submissionId: submission.id,
                    employeeUid: submission.employeeUid || submission.uid,
                  },
                }),
                sendNotification(firestore, {
                  userId: submission.employeeUid || submission.uid!,
                  type: "status_update",
                  module: "employee",
                  title: "Pengajuan Lembur Diteruskan ke HRD",
                  message:
                    "Pengajuan lembur Anda telah disetujui oleh manager dan sedang menunggu persetujuan HRD.",
                  targetType: "user",
                  targetId: submission.id || "",
                  actionUrl: "/admin/karyawan/pengajuan-lembur",
                  createdBy: userProfile.uid,
                }),
              ]);
            } else if (decision === "reject") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Pengajuan Lembur Ditolak oleh Manager Divisi",
                message: note
                  ? `Manager Divisi menolak pengajuan lembur Anda: ${note}`
                  : "Manager Divisi menolak pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            } else if (decision === "revise") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Revisi Pengajuan Lembur Diperlukan",
                message: note
                  ? `Manager meminta revisi: ${note}`
                  : "Manager meminta revisi untuk pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            }
          }
        } else {
          const titles = {
            approve: "Pengajuan Lembur Disetujui HRD",
            reject: "Pengajuan Lembur Ditolak oleh HRD",
            revise: "HRD Meminta Revisi Pengajuan Lembur",
          };
          const messages = {
            approve:
              "HRD telah menyetujui secara final pengajuan lembur Anda untuk payroll.",
            reject: note
              ? `HRD menolak pengajuan lembur Anda: ${note}`
              : "HRD menolak pengajuan lembur Anda.",
            revise: note
              ? `HRD meminta revisi: ${note}`
              : "HRD meminta revisi untuk pengajuan lembur Anda.",
          };

          // Notify employee
          await sendNotification(firestore, {
            userId: submission.employeeUid || submission.uid!,
            type: "status_update",
            module: "employee",
            title: titles[decision],
            message: messages[decision],
            targetType: "user",
            targetId: submission.id || "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: userProfile.uid,
          });

          // Notify Manager who reviewed/approved it
          const managerUid =
            submission.directSupervisorUid ||
            submission.supervisorUid ||
            submission.supervisorApprovedBy;
          if (managerUid) {
            const managerTitles = {
              approve: `Lembur ${submission.employeeName || submission.fullName} Disetujui HRD`,
              reject: `Lembur ${submission.employeeName || submission.fullName} Ditolak HRD`,
              revise: `Lembur ${submission.employeeName || submission.fullName} Diminta Revisi oleh HRD`,
            };
            const managerMessages = {
              approve: `Pengajuan lembur staff Anda telah disetujui HRD dan masuk ke rekap payroll.`,
              reject: `Pengajuan lembur staff Anda ditolak oleh HRD. Catatan: ${note || "-"}`,
              revise: `Pengajuan lembur staff Anda meminta revisi oleh HRD. Catatan: ${note || "-"}`,
            };

            await sendNotification(firestore, {
              userId: managerUid,
              type: "status_update",
              module: "employee",
              title: managerTitles[decision],
              message: managerMessages[decision],
              targetType: "user",
              targetId: submission.id || "",
              actionUrl: "/admin/manager/persetujuan-lembur",
              createdBy: userProfile.uid,
            });
          }
        }
      } catch (notificationError) {
        console.error("Gagal mengirim notifikasi", notificationError);
      }

      let toastDesc = "";
      if (decision === "approve") {
        if (mode === "hrd") {
          toastDesc = "Pengajuan lembur berhasil disetujui secara final & masuk rekap payroll.";
        } else if (isCoordinatorAction) {
          const coordinatorUid = submission.overtimeCoordinatorUid;
          const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
          const isSame = !!(coordinatorUid && managerUid && coordinatorUid === managerUid);
          toastDesc = isSame 
            ? "Pengajuan lembur berhasil disetujui dan langsung diteruskan ke HRD."
            : "Pengajuan lembur berhasil disetujui dan diteruskan ke Manager Divisi.";
        } else {
          toastDesc = "Pengajuan lembur berhasil disetujui dan diteruskan ke HRD.";
        }
      } else {
        toastDesc = `Pengajuan telah ${decision === "reject" ? "ditolak" : "diminta revisi"}.`;
      }

      toast({
        title: "Keputusan Disimpan",
        description: toastDesc,
      });
      onSuccess();
      onOpenChange(false);
      setShowRevisionDialog(false);
      setShowRejectDialog(false);
      setRevisionNote("");
      setRejectionReason("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Keputusan",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const DAILY_LIMIT_MINUTES = 240;
  const approvedMinutesFinal = hrdHours * 60 + Number(hrdMinutes || 0);
  const isDurationChanged =
    approvedMinutesFinal !== (submission.totalDurationMinutes || 0);
  const isOverLimit = dailyTotalMinutes > DAILY_LIMIT_MINUTES;
  const excessMinutes = isOverLimit ? dailyTotalMinutes - DAILY_LIMIT_MINUTES : 0;

  const handleApprove = () => {
    if (mode === "hrd" && isDurationChanged && !hrdNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Catatan HRD Wajib Diisi",
        description:
          "Harap berikan penjelasan mengapa durasi final diubah dari durasi pengajuan.",
      });
      return;
    }
    if (mode === "hrd" && isOverLimit && !hrdNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Catatan HRD Wajib Diisi",
        description:
          "Pengajuan ini melebihi acuan 4 jam per hari. Harap berikan catatan keputusan.",
      });
      return;
    }
    if (mode === "hrd" && isOverLimit && !overLimitDecision) {
      toast({
        variant: "destructive",
        title: "Pilih Jenis Persetujuan",
        description:
          "Pilih apakah lembur ini disetujui penuh atau sebagian untuk rekap payroll.",
      });
      return;
    }
    setShowApproveDialog(true);
  };

  const handleApproveConfirm = async () => {
    setShowApproveDialog(false);
    setIsSaving(true);
    await handleDecision("approve", hrdNotes);
  };

  const handleRevisionSubmit = async () => {
    const finalNote = revisionNote.trim() || hrdNotes.trim();
    if (!finalNote) {
      toast({
        variant: "destructive",
        title: "Catatan Diperlukan",
        description: "Harap isi catatan revisi.",
      });
      return;
    }
    setIsSaving(true);
    await handleDecision("revise", finalNote);
  };

  const handleRejectSubmit = async () => {
    const finalNote = rejectionReason.trim() || hrdNotes.trim();
    if (!finalNote) {
      toast({
        variant: "destructive",
        title: "Alasan Diperlukan",
        description: "Harap isi alasan penolakan.",
      });
      return;
    }
    setIsSaving(true);
    await handleDecision("reject", finalNote);
  };

  const handleProxySubmit = async () => {
    if (!userProfile) return;
    if (!submission.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Submission ID tidak ditemukan.",
      });
      return;
    }

    const note = proxyNote.trim();
    if (!note) {
      toast({
        variant: "destructive",
        title: "Catatan Diperlukan",
        description: "Harap isi catatan konfirmasi manual.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const submissionRef = doc(firestore, "overtime_submissions", submission.id);
      
      const payload = {
        approvalStatus: "pending_supervisor",
        status: "pending_supervisor",
        coordinatorDecision: "approved_manual",
        coordinatorApprovedByProxy: true,
        coordinatorProxyApprovedBy: userProfile.uid,
        coordinatorProxyApprovedByName: userProfile.fullName || userProfile.displayName || userProfile.email || operatorName || "Manager",
        coordinatorProxyNote: note,
        coordinatorProxyMethod: proxyMethod,
        coordinatorApprovedAt: serverTimestamp() as any,
        coordinatorApprovedBy: userProfile.uid,
        coordinatorApprovedByName: (submission as any).overtimeCoordinatorName || "Koordinator",
      };

      await updateDocumentNonBlocking(submissionRef, payload);

      // Send notifications
      try {
        const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
        await Promise.all([
          managerUid
            ? sendNotification(firestore, {
                userId: managerUid,
                type: "status_update",
                module: "employee",
                title: "Konfirmasi Koordinator Dicatat (Proxy)",
                message: `${operatorName} mencatat konfirmasi manual dari koordinator. Pengajuan kini menunggu persetujuan Anda sebagai Manager Divisi.`,
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/manager/persetujuan-lembur",
                createdBy: userProfile.uid,
              })
            : Promise.resolve(),
          sendNotification(firestore, {
            userId: submission.employeeUid || submission.uid!,
            type: "status_update",
            module: "employee",
            title: "Konfirmasi Koordinator Dicatat",
            message: `Konfirmasi manual dari koordinator telah dicatat oleh ${operatorName}. Pengajuan sedang menunggu review Manager Divisi.`,
            targetType: "user",
            targetId: submission.id || "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: userProfile.uid,
          }),
        ]);
      } catch (notificationError) {
        console.error("Gagal mengirim notifikasi proxy:", notificationError);
      }

      toast({
        title: "Konfirmasi Dicatat",
        description: "Konfirmasi manual koordinator berhasil disimpan. Status kini menunggu review Manager Divisi.",
      });

      onSuccess();
      onOpenChange(false);
      setShowProxyDialog(false);
      setProxyNote("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Konfirmasi",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[94vw] max-w-[1200px] h-[92vh] max-h-[92vh] overflow-hidden rounded-[28px] border border-slate-200 bg-white p-0 shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-white via-emerald-50/50 to-white px-7 py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950">
                  {submission.employeeName || submission.fullName}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-600">
                  {mode === "manager"
                    ? isCoordinatorReview
                      ? "Tinjau detail pengajuan untuk membuat keputusan persetujuan sebagai Koordinator."
                      : "Tinjau detail pengajuan untuk membuat keputusan persetujuan sebagai Manager Divisi."
                    : "Tinjau detail pengajuan dan bukti approval sebelum memutuskan."}
                </DialogDescription>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                {canAct && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    Menunggu Review Anda
                  </span>
                )}
                <OvertimeApprovalStatusBadge
                  status={resolvedStatus as any}
                  mode={mode}
                  divisionName={submission.divisionName || submission.division}
                />
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/70 px-7 py-6 pb-32">
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile
                  label="Pengaju"
                  value={submission.employeeName || submission.fullName}
                />
                <SummaryTile
                  label="Brand / Divisi"
                  value={`${submission.brandName || "-"} / ${
                    submission.divisionName || submission.division || "-"
                  }`}
                />
                <SummaryTile
                  label="Jabatan"
                  value={submission.workRole || submission.positionTitle}
                />
                <SummaryTile
                  label="Tanggal Lembur"
                  value={
                    overtimeDate
                      ? format(overtimeDate, "dd MMMM yyyy", { locale: idLocale })
                      : "-"
                  }
                />
                <SummaryTile label="Tipe Lembur" value={overtimeTypeLabel} />
                <SummaryTile label="Lokasi Kerja" value={workLocationLabel} />
                <SummaryTile
                  label="Koordinator/Pengawas"
                  value={(submission as any).overtimeCoordinatorName || "Koordinator"}
                />
                <SummaryTile
                  label="Status Saat Ini"
                  value={getApprovalStatusLabel(resolvedStatus)}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.9fr)]">
                <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-100 px-6 py-5">
                    <CardTitle className="text-lg text-slate-950">
                      Detail Pekerjaan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 px-6 py-5">
                    {tasks.length > 0 ? (
                      <>
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                          <Table className="text-sm">
                            <TableHeader>
                              <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-500 w-10">
                                  No
                                </TableHead>
                                <TableHead className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-500">
                                  Uraian Tugas
                                </TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs uppercase tracking-wide text-slate-500 w-32">
                                  Estimasi
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tasks.map((task, index) => (
                                <TableRow
                                  key={index}
                                  className="border-b border-slate-100 last:border-0"
                                >
                                  <TableCell className="px-4 py-3 text-xs text-slate-500">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-sm leading-6 text-slate-700">
                                    {task.description || "-"}
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                    {task.estimatedMinutes || 0} menit
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-emerald-50/70 font-semibold hover:bg-emerald-50/70">
                                <TableCell
                                  colSpan={2}
                                  className="px-4 py-3 text-right text-sm text-emerald-800"
                                >
                                  Total Estimasi:
                                </TableCell>
                                <TableCell className="px-4 py-3 text-right text-sm font-bold text-emerald-800">
                                  {totalEstimatedMinutes} menit
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>

                        <div className="pt-2">
                          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Total Durasi Aktual
                              </p>
                              <p className="mt-1 text-3xl font-bold text-slate-950">
                                {formatMinutesToHuman(submission.totalDurationMinutes || 0)}
                              </p>
                            </div>
                            {totalEstimatedMinutes !==
                              (submission.totalDurationMinutes || 0) && (
                              <Alert className="w-auto border-amber-200 bg-amber-50 px-3 py-2">
                                <AlertDescription className="text-xs font-semibold text-amber-800">
                                  ⚠️ Selisih:{" "}
                                  {Math.abs(
                                    totalEstimatedMinutes -
                                      (submission.totalDurationMinutes || 0),
                                  )}{" "}
                                  menit
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Tidak ada rincian tugas.
                      </p>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-bold text-slate-950">
                        Alasan Lembur
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-700">
                        {submission.reason || "Tidak ada alasan tambahan."}
                      </p>
                    </div>

                    {submission.employeeNotes && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-bold text-slate-950">
                          Catatan Karyawan
                        </p>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                          {submission.employeeNotes}
                        </p>
                      </div>
                    )}

                    {submission.attachments?.length ? (
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Lampiran
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {submission.attachments.map((attachment, index) => (
                            <span
                              key={index}
                              className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-600"
                            >
                              {attachment}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {/* Over-limit warning */}
                  {isOverLimit && (
                    <Alert className="border-amber-300 bg-amber-50">
                      <AlertTitle className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                        <Info className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        Melebihi Acuan Lembur 4 Jam/Hari
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 text-xs mt-1 space-y-1">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
                          <span className="text-amber-600">Total diajukan hari ini:</span>
                          <span className="font-semibold">{formatMinutesToHuman(dailyTotalMinutes)}</span>
                          <span className="text-amber-600">Acuan maksimal:</span>
                          <span className="font-semibold">{formatMinutesToHuman(DAILY_LIMIT_MINUTES)}</span>
                          <span className="text-amber-600">Kelebihan:</span>
                          <span className="font-semibold text-red-600">+{formatMinutesToHuman(excessMinutes)}</span>
                        </div>
                        <p className="mt-2 text-amber-700">HRD perlu menentukan durasi payroll dan memberikan catatan keputusan.</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {mode === "hrd" && canAct && (
                    <Card className="rounded-3xl border border-emerald-200 bg-white shadow-sm">
                      <CardHeader className="px-5 py-4 border-b border-emerald-100">
                        <CardTitle className="text-base text-emerald-700 font-bold flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-emerald-600" />
                          Keputusan & Penyesuaian HRD
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 px-5 py-4">
                        {/* Over-limit decision selector */}
                        {isOverLimit && (
                          <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wide text-amber-700 font-bold flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5" />
                              Jenis Persetujuan Lembur (Wajib)
                            </Label>
                            <Select
                              value={overLimitDecision}
                              onValueChange={(v) => setOverLimitDecision(v as any)}
                            >
                              <SelectTrigger className="bg-white border-slate-200">
                                <SelectValue placeholder="Pilih jenis persetujuan..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full_approved">Setujui Penuh — bayar seluruh durasi diajukan</SelectItem>
                                <SelectItem value="partial_approved">Setujui Sebagian — atur durasi final di bawah</SelectItem>
                              </SelectContent>
                            </Select>
                            {overLimitDecision === "partial_approved" && (
                              <p className="text-[10px] text-amber-400 italic">
                                Atur jam &amp; menit di bawah untuk menentukan durasi yang akan dibayar ke payroll.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-emerald-700 font-bold">
                            Durasi Final HRD untuk Payroll
                          </Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500">
                                Jam
                              </span>
                              <Input
                                type="number"
                                min={0}
                                value={hrdHours}
                                onChange={(e) =>
                                  setHrdHours(
                                    Math.max(0, parseInt(e.target.value) || 0),
                                  )
                                }
                                className="focus:border-emerald-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500">
                                Menit
                              </span>
                              <Input
                                type="number"
                                min={0}
                                max={59}
                                value={hrdMinutes}
                                onChange={(e) =>
                                  setHrdMinutes(
                                    Math.max(
                                      0,
                                      Math.min(
                                        59,
                                        parseInt(e.target.value) || 0,
                                      ),
                                    ),
                                  )
                                }
                                className="focus:border-emerald-500"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 italic">
                            Konversi:{" "}
                            <span className="font-semibold text-emerald-700">
                              {formatMinutesToHuman(approvedMinutesFinal)}
                            </span>{" "}
                            ({approvedMinutesFinal} menit)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-slate-600 font-bold flex justify-between">
                            <span>Catatan HRD</span>
                            {isDurationChanged && (
                              <span className="text-[10px] text-amber-600 font-normal">
                                Wajib diisi *
                              </span>
                            )}
                          </Label>
                          <textarea
                            value={hrdNotes}
                            onChange={(e) => setHrdNotes(e.target.value)}
                            placeholder="Berikan catatan persetujuan, penolakan, atau alasan perubahan durasi..."
                            className="w-full min-h-[90px] rounded-lg border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                          {isDurationChanged && !hrdNotes.trim() && (
                            <p className="text-[10px] text-amber-500 italic">
                              * Catatan wajib diisi karena durasi final diubah
                              dari durasi pengajuan (
                              {formatMinutesToHuman(
                                submission.totalDurationMinutes || 0,
                              )}
                              ).
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Realtime Timer Breakdown */}
                  {(submission as any).inputMode === 'realtime' &&
                    (submission as any).totalGrossDurationMinutes != null && (
                    <Card className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50 shadow-sm">
                      <CardHeader className="px-5 py-4 border-b border-teal-100">
                        <CardTitle className="text-base text-teal-800 flex items-center gap-2">
                          <Info className="h-4 w-4 text-teal-600" />
                          Rincian Durasi Realtime
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 px-5 py-4 text-sm">
                        <div className="rounded-2xl border border-teal-200 bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                            Durasi Bersih (yang diajukan)
                          </p>
                          <p className="mt-1 text-3xl font-bold text-teal-700">
                            {formatMinutesToHuman((submission as any).totalNetDurationMinutes ?? 0)}
                          </p>
                        </div>
                        <div className="flex justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <span className="text-muted-foreground">Durasi Kotor</span>
                          <span className="font-medium">{formatMinutesToHuman((submission as any).totalGrossDurationMinutes ?? 0)}</span>
                        </div>
                        <div className="flex justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <span className="text-muted-foreground">
                            Total Jeda ({((submission as any).pauseLogs?.length ?? 0)} sesi)
                          </span>
                          <span className="font-medium text-amber-600">{formatMinutesToHuman((submission as any).totalPausedDurationMinutes ?? 0)}</span>
                        </div>
                        {((submission as any).pauseLogs?.length ?? 0) > 0 && (
                          <details className="mt-2 rounded-2xl border border-teal-200 bg-white p-3">
                            <summary className="cursor-pointer text-xs font-bold text-teal-700">Lihat rincian jeda</summary>
                            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 text-xs">
                              {(submission as any).pauseLogs.map((log: any, i: number) => {
                                const startStr = log.startedAt?.toDate ?
                                  `${String(log.startedAt.toDate().getHours()).padStart(2,'0')}:${String(log.startedAt.toDate().getMinutes()).padStart(2,'0')}` : '?';
                                const endStr = log.endedAt?.toDate ?
                                  `${String(log.endedAt.toDate().getHours()).padStart(2,'0')}:${String(log.endedAt.toDate().getMinutes()).padStart(2,'0')}` : '?';
                                return (
                                  <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 bg-white">
                                    <span className="text-muted-foreground w-4">{i + 1}</span>
                                    <span className="font-medium text-slate-700">{log.reason}</span>
                                    <span className="text-muted-foreground">{startStr} – {endStr}</span>
                                    {log.note && <span className="italic text-muted-foreground">{log.note}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="border-b border-slate-100 px-5 py-4">
                      <CardTitle className="text-base text-slate-950">
                        Validasi Durasi Kerja
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 py-4">
                      <InfoRow
                        label="Durasi Pengajuan"
                        value={formatMinutesToHuman(
                          submission.totalDurationMinutes || 0,
                        )}
                      />
                      <InfoRow
                        label="Estimasi Pekerjaan"
                        value={formatMinutesToHuman(totalEstimatedMinutes)}
                      />
                      <InfoRow
                        label="Selisih Durasi"
                        value={formatMinutesToHuman(
                          Math.abs(
                            (submission.totalDurationMinutes || 0) -
                              totalEstimatedMinutes,
                          ),
                        )}
                      />
                      {submission.approvedMinutesFinal !== undefined &&
                        submission.approvedMinutesFinal !== null && (
                          <InfoRow
                            label="Durasi Final HRD"
                            value={formatMinutesToHuman(
                              submission.approvedMinutesFinal,
                            )}
                          />
                        )}

                      {approvedMinutesFinal > totalEstimatedMinutes && (
                        <Alert className="mt-2 w-full border-amber-200 bg-amber-50">
                          <AlertTitle className="text-xs font-bold text-amber-800">
                            Selisih durasi cukup besar
                          </AlertTitle>
                          <AlertDescription className="text-xs leading-5 text-amber-700">
                            Mohon tinjau apakah durasi aktual sesuai dengan rincian tugas.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
                        {totalEstimatedMinutes !==
                        (submission.totalDurationMinutes || 0) ? (
                          <p className="text-amber-700 dark:text-amber-200">
                            ⚠️ Selisih durasi terdeteksi. Durasi pengajuan
                            berbeda dengan estimasi rincian tugas.
                          </p>
                        ) : (
                          <p className="text-emerald-700 dark:text-emerald-200">
                            Durasi pengajuan sudah sesuai dengan estimasi
                            rincian tugas.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Audit Trail Waktu */}
                  {((submission as any).formCreatedAt || (submission as any).startTimeAdjusted || (submission as any).actualEndTime) && (
                    <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <CardHeader className="px-5 py-4 border-b border-slate-100">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-700">
                          <Info className="h-4 w-4 text-teal-600" />
                          Audit Trail Waktu
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 px-5 py-4 text-sm">
                        {(submission as any).formCreatedAt && (
                          <InfoRow label="Form dibuka pukul" value={(submission as any).formCreatedAt} />
                        )}
                        {(submission as any).originalStartTimeAuto && (
                          <InfoRow label="Jam mulai otomatis awal" value={(submission as any).originalStartTimeAuto} />
                        )}
                        <InfoRow label="Jam mulai diajukan" value={submission.startTime} />
                        {(submission as any).startTimeAdjusted && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Penyesuaian jam mulai</span>
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
                        {!(submission as any).startTimeAdjusted && (submission as any).formCreatedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Penyesuaian jam mulai</span>
                            <span className="font-medium text-teal-600">Tidak ada (sesuai otomatis)</span>
                          </div>
                        )}
                        <InfoRow label="Jam selesai estimasi" value={submission.endTime} />
                        {(submission as any).actualEndTime && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Jam selesai realisasi</span>
                            <span className={`font-semibold ${(submission as any).completionStatus === "confirmed_late" ? "text-orange-600" : "text-teal-600"}`}>
                              {(submission as any).actualEndTime}
                              {(submission as any).completionStatus === "confirmed_late" && " ⚠️"}
                            </span>
                          </div>
                        )}
                        {(submission as any).actualDurationMinutes && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Durasi realisasi</span>
                            <span className={`font-semibold ${(submission as any).actualDurationMinutes > submission.totalDurationMinutes ? "text-orange-600" : "text-teal-600"}`}>
                              {formatMinutesToHuman((submission as any).actualDurationMinutes)}
                            </span>
                          </div>
                        )}
                        {(submission as any).completionNote && (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                            <p className="text-xs text-orange-700 font-medium mb-0.5">Catatan koreksi staff:</p>
                            <p className="text-xs text-orange-800">{(submission as any).completionNote}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="border-b border-slate-100 px-5 py-4">
                      <CardTitle className="text-base text-slate-950">
                        Timeline Persetujuan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 py-4">
                      <div className="space-y-3">
                        {approvalTimelineSteps.map((step, index) => (
                          <div
                            key={step.title}
                            className={`rounded-2xl border p-4 ${
                              step.state === "Menunggu" && canAct
                                ? "border-amber-200 bg-amber-50/70"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">
                                    {step.title}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {step.reviewer}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getTimelineBadgeClass(
                                  step.state,
                                )}`}
                              >
                                {step.state}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Separator className="my-2 bg-slate-200" />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground">
                          Status Saat Ini
                        </span>
                        <OvertimeApprovalStatusBadge
                          status={resolvedStatus as any}
                          mode={mode}
                        />
                      </div>
                      <Separator className="my-2 opacity-50" />
                      <InfoRow
                        label="Waktu Pengajuan"
                        value={format(submittedAt, "eeee, dd MMMM yyyy HH:mm", {
                          locale: idLocale,
                        })}
                      />

                      {submission.coordinatorApprovedAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label={submission.coordinatorApprovedByProxy ? "Disetujui Koordinator (Konfirmasi Manual)" : "Disetujui Koordinator oleh"}
                            value={
                              submission.coordinatorApprovedByName ||
                              (submission as any).overtimeCoordinatorName ||
                              "Koordinator/Pengawas"
                            }
                          />
                          <InfoRow
                            label="Waktu Persetujuan Koordinator"
                            value={format(
                              parseSafeDate(submission.coordinatorApprovedAt) ||
                                new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale },
                            )}
                          />
                          {submission.coordinatorApprovedByProxy && (
                            <div className="mt-1 space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Metode Konfirmasi:</span>
                                <span className="font-semibold text-emerald-700 capitalize">
                                  {submission.coordinatorProxyMethod === "lisan" && "🗣️ Lisan / Tatap Muka"}
                                  {submission.coordinatorProxyMethod === "whatsapp" && "💬 WhatsApp / Chat"}
                                  {submission.coordinatorProxyMethod === "telepon" && "📞 Telepon"}
                                  {submission.coordinatorProxyMethod === "manual" && "📝 Dokumen Manual"}
                                  {!["lisan", "whatsapp", "telepon", "manual"].includes(submission.coordinatorProxyMethod || "") && (submission.coordinatorProxyMethod || "-")}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Dicatat Oleh:</span>
                                <span className="font-medium text-slate-700">
                                  {submission.coordinatorProxyApprovedByName || "Atasan / HRD"}
                                </span>
                              </div>
                              {submission.coordinatorProxyNote && (
                                <div className="pt-1 border-t border-border/20 mt-1">
                                  <span className="text-muted-foreground block mb-0.5">Catatan Konfirmasi:</span>
                                  <p className="rounded-lg bg-white p-2 italic leading-relaxed text-slate-600">
                                    "{submission.coordinatorProxyNote}"
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {submission.supervisorApprovedAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label="Disetujui Manager Divisi oleh"
                            value={
                              submission.supervisorApprovedByName ||
                              "Manager Divisi"
                            }
                          />
                          <InfoRow
                            label="Waktu Persetujuan Manager"
                            value={format(
                              parseSafeDate(submission.supervisorApprovedAt) ||
                                new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale },
                            )}
                          />
                          <div className="flex justify-between text-sm">
                            <p className="text-muted-foreground">
                              Status Lanjutan
                            </p>
                            <p className="font-bold text-blue-500">
                              Diteruskan ke HRD
                            </p>
                          </div>
                        </div>
                      )}

                      {submission.revisionRequestedAt && (
                        <InfoRow
                          label="Revisi Diminta Pada"
                          value={format(
                            parseSafeDate(submission.revisionRequestedAt) ||
                              new Date(),
                            "eeee, dd MMMM yyyy HH:mm",
                            { locale: idLocale },
                          )}
                        />
                      )}
                      {submission.rejectedAt && (
                        <InfoRow
                          label="Ditolak Pada"
                          value={format(
                            parseSafeDate(submission.rejectedAt) || new Date(),
                            "eeee, dd MMMM yyyy HH:mm",
                            { locale: idLocale },
                          )}
                        />
                      )}
                      {submission.hrdDecisionAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label="Keputusan Final HRD"
                            value={format(
                              parseSafeDate(submission.hrdDecisionAt) ||
                                new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale },
                            )}
                          />
                        </div>
                      )}
                      {submission.coordinatorNotes && (
                        <div className="pt-2 border-t border-border/50 mt-2">
                          <p className="text-xs uppercase text-muted-foreground">
                            Catatan Koordinator
                          </p>
                          <p className="mt-1 text-sm leading-6 italic">
                            "{submission.coordinatorNotes}"
                          </p>
                        </div>
                      )}

                      {submission.managerNotes && (
                        <div className="pt-2">
                          <p className="text-xs uppercase text-muted-foreground">
                            Catatan Manager Divisi
                          </p>
                          <p className="mt-1 text-sm leading-6 italic">
                            "{submission.managerNotes}"
                          </p>
                        </div>
                      )}
                      {submission.hrdNotes && (
                        <div className="pt-2">
                          <p className="text-xs uppercase text-muted-foreground">
                            Catatan HRD
                          </p>
                          <p className="mt-1 text-sm leading-6 italic">
                            "{submission.hrdNotes}"
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-100">
                  Persetujuan Digital Internal
                </AlertTitle>
                <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                  Persetujuan ini akan tercatat sebagai approval digital
                  internal perusahaan dengan audit trail lengkap.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200 bg-white/95 px-7 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-xl border-slate-300 px-5"
            >
              Tutup
            </Button>
            {canRecordProxyApproval && (
              <Button
                variant="secondary"
                onClick={() => setShowProxyDialog(true)}
                disabled={isSaving}
                className="h-11 rounded-xl border border-amber-200 bg-amber-50 px-5 font-semibold text-amber-700 hover:bg-amber-100"
              >
                Catat Konfirmasi Koordinator
              </Button>
            )}
            {canAct && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRevisionDialog(true)}
                  disabled={isSaving}
                  className="h-11 rounded-xl border-amber-300 px-5 font-semibold text-amber-700 hover:bg-amber-50"
                >
                  Minta Revisi
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isSaving}
                  className="h-11 rounded-xl px-5 font-semibold"
                >
                  Tolak
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isSaving}
                  className="h-11 rounded-xl bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Setujui
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="w-[min(90vw,500px)] max-w-[500px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "hrd"
                ? "Setujui Lembur Secara Final?"
                : "Setujui Pengajuan Lembur?"}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {mode === "hrd"
                ? "Pengajuan lembur ini akan disetujui secara final dan datanya dimasukkan ke rekap payroll bulanan."
                : isCoordinatorReview
                  ? (submission.overtimeCoordinatorUid === (submission.managerUid || submission.directSupervisorUid || submission.supervisorUid)
                    ? "Pengajuan ini akan disetujui sebagai Koordinator & Manager Divisi dan diteruskan ke HRD."
                    : "Pengajuan ini akan disetujui sebagai Koordinator dan diteruskan ke Manager Divisi.")
                  : "Pengajuan ini akan disetujui dan diteruskan ke HRD untuk review final."}
            </DialogDescription>
            {mode === "hrd" && (
              <div className="mt-4 p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Karyawan:</span>
                  <span className="font-bold text-slate-900">
                    {submission.employeeName || submission.fullName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Durasi Final HRD:</span>
                  <span className="font-bold text-emerald-700">
                    {formatMinutesToHuman(approvedMinutesFinal)}
                  </span>
                </div>
                {hrdNotes.trim() && (
                  <div className="space-y-1">
                    <span className="text-slate-600">Catatan HRD:</span>
                    <p className="italic text-slate-700">"{hrdNotes}"</p>
                  </div>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Keputusan ini akan tercatat dalam riwayat persetujuan & audit
              trail karyawan.
            </p>
          </DialogHeader>
          <DialogFooter className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowApproveDialog(false)}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button onClick={handleApproveConfirm} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              {mode === "hrd"
                ? "Setujui Secara Final"
                : isCoordinatorReview
                  ? (submission.overtimeCoordinatorUid === (submission.managerUid || submission.directSupervisorUid || submission.supervisorUid)
                    ? "Setujui & Teruskan ke HRD"
                    : "Setujui & Teruskan ke Manager")
                  : "Setujui & Teruskan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Minta Revisi Pengajuan</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan catatan revisi agar karyawan dapat memperbaiki
              pengajuannya.
            </DialogDescription>
          </DialogHeader>
          {/* Summary Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Karyawan:</span>
              <span className="font-semibold text-slate-900">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tanggal Lembur:</span>
              <span className="font-semibold text-slate-900">
                {overtimeDate
                  ? format(overtimeDate, "dd MMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Durasi:</span>
              <span className="font-semibold text-slate-900">
                {formatMinutesToHuman(submission.totalDurationMinutes || 0)}
              </span>
            </div>
          </div>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="revision-note">Catatan Revisi</Label>
              <textarea
                id="revision-note"
                placeholder="Contoh: Tolong revisi jam selesai / rincian tugas / alasan lembur."
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevisionDialog(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleRevisionSubmit}
              disabled={isSaving || !revisionNote.trim()}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Kirim Revisi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan Lembur</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan alasan penolakan agar karyawan memahami keputusan Anda.
            </DialogDescription>
          </DialogHeader>
          {/* Summary Section */}
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Karyawan</span>
              <span className="font-semibold text-slate-900">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tanggal Lembur</span>
              <span className="font-semibold text-slate-900">
                {overtimeDate
                  ? format(overtimeDate, "dd MMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Durasi</span>
              <span className="font-semibold text-slate-900">
                {formatMinutesToHuman(submission.totalDurationMinutes || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Lokasi</span>
              <span className="font-semibold text-slate-900">
                {workLocationLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipe</span>
              <span className="font-semibold text-slate-900">
                {overtimeTypeLabel}
              </span>
            </div>
          </div>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rejection-reason">Alasan Penolakan</Label>
              <textarea
                id="rejection-reason"
                placeholder="Tuliskan alasan penolakan agar karyawan memahami keputusan."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={isSaving || !rejectionReason.trim()}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Tolak Pengajuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proxy/Assisted Approval Confirmation Dialog */}
      <Dialog open={showProxyDialog} onOpenChange={setShowProxyDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <span className="text-amber-500">✍️</span> Catat Konfirmasi Manual Koordinator
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Jika Koordinator telah menyetujui secara manual/lisan (tanda tangan kertas/WhatsApp/lisan), Anda dapat meneruskan alur ke Manager Divisi dengan mencatat audit trail di bawah ini.
            </DialogDescription>
          </DialogHeader>

          {/* Summary Section */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Karyawan:</span>
              <span className="font-semibold text-slate-950">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Koordinator Lembur:</span>
              <span className="font-semibold text-amber-400">
                {(submission as any).overtimeCoordinatorName || "Koordinator"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal Lembur:</span>
              <span className="font-medium text-slate-950">
                {overtimeDate
                  ? format(overtimeDate, "dd MMMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durasi Lembur:</span>
              <span className="font-medium text-slate-950">
                {submission.totalDurationMinutes} menit ({formatMinutesToHuman(submission.totalDurationMinutes || 0)})
              </span>
            </div>
          </div>

          <div className="space-y-4 py-3">
            <div className="grid gap-2">
              <Label htmlFor="proxy-method" className="text-sm font-semibold text-slate-700">
                Metode Konfirmasi <span className="text-amber-500">*</span>
              </Label>
              <Select value={proxyMethod} onValueChange={setProxyMethod}>
                <SelectTrigger id="proxy-method" className="w-full border-slate-200 bg-white text-slate-950 focus:border-amber-500">
                  <SelectValue placeholder="Pilih metode konfirmasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lisan">🗣️ Lisan / Tatap Muka</SelectItem>
                  <SelectItem value="whatsapp">💬 WhatsApp / Chat</SelectItem>
                  <SelectItem value="telepon">📞 Telepon / Panggilan Suara</SelectItem>
                  <SelectItem value="manual">📝 Dokumen Manual / Tanda Tangan Kertas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="proxy-note" className="text-sm font-semibold text-slate-700">
                Catatan Konfirmasi Manual <span className="text-amber-500">*</span>
              </Label>
              <textarea
                id="proxy-note"
                placeholder="Contoh: Disetujui lisan oleh Pak Ariyan saat koordinasi lapangan. Dokumen fisik menyusul."
                value={proxyNote}
                onChange={(e) => setProxyNote(e.target.value)}
                className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowProxyDialog(false);
                setProxyNote("");
              }}
              disabled={isSaving}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Batal
            </Button>
            <Button
              onClick={handleProxySubmit}
              disabled={isSaving || !proxyNote.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white border-none"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Catat Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

