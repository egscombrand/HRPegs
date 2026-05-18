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
import { doc, serverTimestamp, collection, addDoc, updateDoc, arrayUnion } from "firebase/firestore";
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

interface ReviewOvertimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission;
  onSuccess: () => void;
  mode: "manager" | "hrd";
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

export function ReviewOvertimeDialog({
  open,
  onOpenChange,
  submission,
  onSuccess,
  mode,
}: ReviewOvertimeDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [hrdHours, setHrdHours] = useState(0);
  const [hrdMinutes, setHrdMinutes] = useState(0);
  const [hrdNotes, setHrdNotes] = useState("");
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
      const initialMinutes = submission.approvedMinutesFinal !== undefined && submission.approvedMinutesFinal !== null
        ? submission.approvedMinutesFinal 
        : (submission.totalDurationMinutes || 0);
      setHrdHours(Math.floor(initialMinutes / 60));
      setHrdMinutes(initialMinutes % 60);
      setHrdNotes(submission.hrdNotes || "");
      setRevisionNote(submission.revisionNote || "");
      setRejectionReason(submission.rejectionReason || "");
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
  const canAct = isActionableStatus(resolvedStatus, mode);
  const operatorName = userProfile?.fullName || userProfile?.email || "";

  const approvalStatusLabels: Record<string, string> = {
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

  const workLocationLabel =
    submission.workLocationLabel ||
    submission.workLocation ||
    (submission.location === "kantor"
      ? "Kantor"
      : submission.location === "remote"
        ? "Remote"
        : submission.location === "site"
          ? "Site"
          : submission.location || "-");

  const overtimeTypeLabel =
    submission.overtimeTypeLabel ||
    (submission.overtimeType === "hari_kerja"
      ? "Hari Kerja"
      : submission.overtimeType === "hari_libur"
        ? "Hari Libur"
        : submission.overtimeType === "urgent"
          ? "Urgent"
          : submission.overtimeType || "-");

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
      let payload: Partial<OvertimeSubmission> = {};
      const isManagerAction = mode === "manager";

      if (isManagerAction) {
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
      } else {
        let status: OvertimeSubmission["status"] =
          resolvedStatus as OvertimeSubmission["status"];
        if (decision === "approve") status = "approved_hrd";
        else if (decision === "reject") status = "rejected_hrd";
        else if (decision === "revise") status = "revision_hrd";
        
        payload = {
          status,
          approvalStatus: status,
          hrdReviewerUid: userProfile.uid,
          hrdNotes: note || null,
          hrdDecisionAt: serverTimestamp() as any,
          approvedMinutesFinal: decision === "approve" ? approvedMinutesFinal : null,
        };

        // Create payroll recap & update employee history if approved by HRD
        if (decision === "approve") {
          const payrollMonth = overtimeDate ? format(overtimeDate, "yyyy-MM") : format(new Date(), "yyyy-MM");
          const workMode = submission.location === "kantor" ? "Kantor" 
            : submission.location === "remote" ? "WFH" 
            : submission.location === "site" ? "Dinas" 
            : "Kantor";
          
          const taskSummary = tasks.map((t: any) => t.description).filter(Boolean).join("; ");

          const recapColRef = collection(firestore, "overtime_payroll_recaps");
          await addDoc(recapColRef, {
            employeeId: submission.employeeUid || submission.uid!,
            employeeName: submission.employeeName || submission.fullName || "",
            brand: submission.brandName || "",
            division: submission.divisionName || submission.division || "",
            managerId: submission.directSupervisorUid || submission.supervisorUid || "",
            managerName: submission.directSupervisorName || submission.supervisorName || "",
            overtimeDate: overtimeDate ? format(overtimeDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
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
            timestamp: new Date().toISOString()
          };

          await updateDoc(doc(firestore, "employees", empId), {
            overtimeHistory: arrayUnion(historyItem)
          }).catch(err => console.error("Error employees history:", err));

          await updateDoc(doc(firestore, "employee_profiles", empId), {
            overtimeHistory: arrayUnion(historyItem)
          }).catch(err => console.error("Error employee_profiles history:", err));
        }
      }

      await updateDocumentNonBlocking(submissionRef, payload);

      try {
        if (isManagerAction) {
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
        } else {
          const titles = {
            approve: "Pengajuan Lembur Disetujui HRD",
            reject: "Pengajuan Lembur Ditolak oleh HRD",
            revise: "HRD Meminta Revisi Pengajuan Lembur",
          };
          const messages = {
            approve: "HRD telah menyetujui secara final pengajuan lembur Anda untuk payroll.",
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
          const managerUid = submission.directSupervisorUid || submission.supervisorUid || submission.supervisorApprovedBy;
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

      toast({
        title: "Keputusan Disimpan",
        description: decision === "approve" 
          ? (mode === "hrd" ? "Pengajuan lembur berhasil disetujui secara final & masuk rekap payroll." : "Pengajuan lembur berhasil disetujui dan diteruskan ke HRD.")
          : `Pengajuan telah ${decision === "reject" ? "ditolak" : "diminta revisi"}`,
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

  const approvedMinutesFinal = (hrdHours * 60) + Number(hrdMinutes || 0);
  const isDurationChanged = approvedMinutesFinal !== (submission.totalDurationMinutes || 0);

  const handleApprove = () => {
    if (mode === "hrd" && isDurationChanged && !hrdNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Catatan HRD Wajib Diisi",
        description: "Harap berikan penjelasan mengapa durasi final diubah dari durasi pengajuan.",
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-[1100px] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-xl">
                  {submission.employeeName || submission.fullName}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {mode === "manager"
                    ? "Tinjau detail pengajuan untuk membuat keputusan persetujuan sebagai Manager Divisi."
                    : "Tinjau detail pengajuan dan bukti approval Manager Divisi sebelum memutuskan."}
                </DialogDescription>
              </div>
              <OvertimeApprovalStatusBadge
                status={resolvedStatus as any}
                mode={mode}
                divisionName={submission.divisionName || submission.division}
              />
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 pb-32">
            <div className="space-y-6">
              <div className="rounded-3xl border border-border bg-muted/30 p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-border pb-2">
                  Detail Informasi Pengaju & Pengajuan Lembur
                </h3>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground uppercase font-semibold">Profil Karyawan</div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Nama Lengkap</p>
                      <p className="text-sm font-medium text-white">{submission.employeeName || submission.fullName || "-"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Jabatan / Peran</p>
                      <p className="text-sm font-medium text-white">{submission.workRole || submission.positionTitle || "-"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Brand / Divisi</p>
                      <p className="text-sm font-medium text-white">
                        {submission.brandName || "-"} / {submission.divisionName || submission.division || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground uppercase font-semibold">Waktu & Lokasi Lembur</div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Tanggal Lembur</p>
                      <p className="text-sm font-medium text-white">
                        {overtimeDate
                          ? format(overtimeDate, "eeee, dd MMMM yyyy", { locale: idLocale })
                          : "-"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Jam Kerja Lembur</p>
                      <p className="text-sm font-medium text-white">{submission.startTime} - {submission.endTime}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Lokasi Lembur</p>
                      <p className="text-sm font-medium text-white">{workLocationLabel}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground uppercase font-semibold">Persetujuan Atasan & Alasan</div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Manager Divisi Yang Menyetujui</p>
                      <p className="text-sm font-medium text-emerald-400">
                        {submission.supervisorApprovedByName || submission.directSupervisorName || "Manager Divisi"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase">Alasan Pengajuan Lembur</p>
                      <p className="text-xs font-medium text-slate-300 leading-relaxed italic">
                        "{submission.reason || "Tidak ada alasan tambahan."}"
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                  <CardHeader className="px-5 py-4">
                    <CardTitle className="text-base">
                      Detail Pekerjaan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 px-5 pb-5 pt-0">
                    {tasks.length > 0 ? (
                      <>
                        <div className="overflow-x-auto rounded-lg border border-border bg-background">
                          <Table className="text-sm">
                            <TableHeader>
                              <TableRow className="bg-muted hover:bg-muted">
                                <TableHead className="px-3 py-2 text-left text-xs text-muted-foreground uppercase tracking-wide w-8">
                                  No
                                </TableHead>
                                <TableHead className="px-3 py-2 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                  Uraian Tugas
                                </TableHead>
                                <TableHead className="px-3 py-2 text-right text-xs text-muted-foreground uppercase tracking-wide w-32">
                                  Estimasi
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tasks.map((task, index) => (
                                <TableRow
                                  key={index}
                                  className="border-b last:border-0"
                                >
                                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className="px-3 py-2 text-sm">
                                    {task.description || "-"}
                                  </TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm font-medium">
                                    {task.estimatedMinutes || 0} menit
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-muted/50 font-semibold">
                                <TableCell
                                  colSpan={2}
                                  className="px-3 py-2 text-right text-sm"
                                >
                                  Total Estimasi:
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right text-sm font-semibold">
                                  {totalEstimatedMinutes} menit
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>

                        <div className="pt-2">
                          <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase">
                                Total Durasi Aktual
                              </p>
                              <p className="font-semibold text-base">
                                {submission.totalDurationMinutes} menit
                              </p>
                            </div>
                            {totalEstimatedMinutes !==
                              (submission.totalDurationMinutes || 0) && (
                              <Alert className="border-amber-200 bg-amber-50 w-auto dark:border-amber-900 dark:bg-amber-950">
                                <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
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

                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Alasan
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {submission.reason || "Tidak ada alasan tambahan."}
                      </p>
                    </div>

                    {submission.employeeNotes && (
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Catatan Karyawan
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
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
                              className="rounded-full bg-muted px-3 py-1 text-xs"
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
                  {mode === "hrd" && canAct && (
                    <Card className="rounded-3xl border border-emerald-500/30 bg-emerald-950/20 shadow-md">
                      <CardHeader className="px-5 py-4 border-b border-emerald-500/10">
                        <CardTitle className="text-base text-emerald-400 font-bold flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-emerald-400" />
                          Keputusan & Penyesuaian HRD
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 px-5 py-4">
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-emerald-300 font-bold">
                            Durasi Final HRD untuk Payroll
                          </Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400">Jam</span>
                              <Input
                                type="number"
                                min={0}
                                value={hrdHours}
                                onChange={(e) => setHrdHours(Math.max(0, parseInt(e.target.value) || 0))}
                                className="bg-slate-900 border-slate-700 focus:border-emerald-500 text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400">Menit</span>
                              <Input
                                type="number"
                                min={0}
                                max={59}
                                value={hrdMinutes}
                                onChange={(e) => setHrdMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                className="bg-slate-900 border-slate-700 focus:border-emerald-500 text-white"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 italic">
                            Konversi: <span className="font-semibold text-emerald-400">{formatMinutesToHuman(approvedMinutesFinal)}</span> ({approvedMinutesFinal} menit)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-slate-300 font-bold flex justify-between">
                            <span>Catatan HRD</span>
                            {isDurationChanged && (
                              <span className="text-[10px] text-amber-400 font-normal">Wajib diisi *</span>
                            )}
                          </Label>
                          <textarea
                            value={hrdNotes}
                            onChange={(e) => setHrdNotes(e.target.value)}
                            placeholder="Berikan catatan persetujuan, penolakan, atau alasan perubahan durasi..."
                            className="w-full min-h-[90px] rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                          {isDurationChanged && !hrdNotes.trim() && (
                            <p className="text-[10px] text-amber-500 italic">
                              * Catatan wajib diisi karena durasi final diubah dari durasi pengajuan ({formatMinutesToHuman(submission.totalDurationMinutes || 0)}).
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                    <CardHeader className="px-5 py-4">
                      <CardTitle className="text-base">
                        Validasi Durasi Kerja
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 pb-5 pt-0">
                      <InfoRow
                        label="Durasi Pengajuan"
                        value={formatMinutesToHuman(submission.totalDurationMinutes || 0)}
                      />
                      <InfoRow
                        label="Estimasi Pekerjaan"
                        value={formatMinutesToHuman(totalEstimatedMinutes)}
                      />
                      <InfoRow
                        label="Selisih Durasi"
                        value={formatMinutesToHuman(Math.abs((submission.totalDurationMinutes || 0) - totalEstimatedMinutes))}
                      />
                      {submission.approvedMinutesFinal !== undefined && submission.approvedMinutesFinal !== null && (
                        <InfoRow
                          label="Durasi Final HRD"
                          value={formatMinutesToHuman(submission.approvedMinutesFinal)}
                        />
                      )}
                      
                      {approvedMinutesFinal > totalEstimatedMinutes && (
                        <Alert className="border-amber-500 bg-amber-500/10 w-full mt-2">
                          <AlertTitle className="text-xs font-bold text-amber-500">Peringatan Selisih Durasi</AlertTitle>
                          <AlertDescription className="text-xs text-amber-600 dark:text-amber-400">
                            Durasi pengajuan lebih tinggi dari estimasi pekerjaan. HRD dapat menyesuaikan durasi final untuk payroll.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="rounded-xl border border-border bg-background p-3 text-xs">
                        {totalEstimatedMinutes !== (submission.totalDurationMinutes || 0) ? (
                          <p className="text-amber-700 dark:text-amber-200">
                            ⚠️ Selisih durasi terdeteksi. Durasi pengajuan berbeda dengan estimasi rincian tugas.
                          </p>
                        ) : (
                          <p className="text-emerald-700 dark:text-emerald-200">
                            Durasi pengajuan sudah sesuai dengan estimasi rincian tugas.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                    <CardHeader className="px-5 py-4">
                      <CardTitle className="text-base">
                        Timeline Persetujuan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 pb-5 pt-0">
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
                      
                      {submission.supervisorApprovedAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label="Disetujui Manager Divisi oleh"
                            value={submission.supervisorApprovedByName || "Manager Divisi"}
                          />
                          <InfoRow
                            label="Waktu Persetujuan Manager"
                            value={format(
                              parseSafeDate(submission.supervisorApprovedAt) || new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale }
                            )}
                          />
                          <div className="flex justify-between text-sm">
                            <p className="text-muted-foreground">Status Lanjutan</p>
                            <p className="font-bold text-blue-500">Diteruskan ke HRD</p>
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
                              parseSafeDate(submission.hrdDecisionAt) || new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale }
                            )}
                          />
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

          <DialogFooter className="shrink-0 border-t bg-[#111827] px-6 py-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
            {canAct && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowRevisionDialog(true)}
                  disabled={isSaving}
                >
                  Minta Revisi
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isSaving}
                >
                  Tolak
                </Button>
                <Button onClick={handleApprove} disabled={isSaving}>
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
        <DialogContent className="w-[min(90vw,500px)] max-w-[500px] rounded-3xl border border-border bg-slate-950 text-slate-50 p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "hrd" ? "Setujui Lembur Secara Final?" : "Setujui Pengajuan Lembur?"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {mode === "hrd" 
                ? "Pengajuan lembur ini akan disetujui secara final dan datanya dimasukkan ke rekap payroll bulanan."
                : "Pengajuan ini akan disetujui dan diteruskan ke HRD untuk review final."}
            </DialogDescription>
            {mode === "hrd" && (
              <div className="mt-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/60 text-xs space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span>Karyawan:</span>
                  <span className="font-bold text-white">{submission.employeeName || submission.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Durasi Final HRD:</span>
                  <span className="font-bold text-emerald-400">{formatMinutesToHuman(approvedMinutesFinal)}</span>
                </div>
                {hrdNotes.trim() && (
                  <div className="space-y-1">
                    <span>Catatan HRD:</span>
                    <p className="italic text-slate-400">"{hrdNotes}"</p>
                  </div>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Keputusan ini akan tercatat dalam riwayat persetujuan & audit trail karyawan.
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
              {mode === "hrd" ? "Setujui Secara Final" : "Setujui & Teruskan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-border bg-slate-950 text-slate-50 p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Minta Revisi Pengajuan</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan catatan revisi agar karyawan dapat memperbaiki
              pengajuannya.
            </DialogDescription>
          </DialogHeader>
          {/* Summary Section */}
          <div className="rounded-lg border border-border bg-muted p-3 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Karyawan:</span>
              <span className="font-medium">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal Lembur:</span>
              <span className="font-medium">
                {overtimeDate
                  ? format(overtimeDate, "dd MMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durasi:</span>
              <span className="font-medium">
                {submission.totalDurationMinutes} menit
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
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-border bg-slate-950 text-slate-50 p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan Lembur</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan alasan penolakan agar karyawan memahami keputusan Anda.
            </DialogDescription>
          </DialogHeader>
          {/* Summary Section */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300 space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Karyawan</span>
              <span className="font-medium text-slate-100">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal Lembur</span>
              <span className="font-medium text-slate-100">
                {overtimeDate
                  ? format(overtimeDate, "dd MMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durasi</span>
              <span className="font-medium text-slate-100">
                {submission.totalDurationMinutes} menit
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lokasi</span>
              <span className="font-medium text-slate-100">
                {workLocationLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipe</span>
              <span className="font-medium text-slate-100">
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
    </>
  );
}
