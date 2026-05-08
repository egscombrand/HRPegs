import { useState } from "react";
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
import { doc, serverTimestamp } from "firebase/firestore";
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
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

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
  const submittedAt =
    parseSafeDate((submission as any).submittedAt ?? submission.createdAt) ||
    new Date();
  const overtimeDate =
    parseSafeDate((submission as any).overtimeDate ?? submission.date) || null;
  const managerDecisionAt = parseSafeDate(submission.managerDecisionAt);
  const isFinal = isFinalStatus(resolvedStatus);
  const canAct = isActionableStatus(resolvedStatus, mode);
  const operatorName = userProfile?.fullName || userProfile?.email || "";

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
        if (decision === "approve") status = "approved";
        else if (decision === "reject") status = "rejected_hrd";
        else if (decision === "revise") status = "revision_hrd";
        payload = {
          status,
          approvalStatus: status,
          hrdReviewerUid: userProfile.uid,
          hrdNotes: note || null,
          hrdDecisionAt: serverTimestamp() as any,
        };
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
                  employeeUid: submission.uid,
                },
              }),
              sendNotification(firestore, {
                userId: submission.uid,
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
              userId: submission.uid,
              type: "status_update",
              module: "employee",
              title: "Pengajuan Lembur Ditolak oleh Manager",
              message: note
                ? `Manager menolak pengajuan lembur Anda: ${note}`
                : "Manager menolak pengajuan lembur Anda.",
              targetType: "user",
              targetId: submission.id || "",
              actionUrl: "/admin/karyawan/pengajuan-lembur",
              createdBy: userProfile.uid,
            });
          } else if (decision === "revise") {
            await sendNotification(firestore, {
              userId: submission.uid,
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
            approve: "Pengajuan Lembur Disetujui",
            reject: "Pengajuan Lembur Ditolak oleh HRD",
            revise: "HRD Meminta Revisi Pengajuan Lembur",
          };
          const messages = {
            approve: "HRD telah menyetujui pengajuan lembur Anda.",
            reject: note
              ? `HRD menolak pengajuan lembur Anda: ${note}`
              : "HRD menolak pengajuan lembur Anda.",
            revise: note
              ? `HRD meminta revisi: ${note}`
              : "HRD meminta revisi untuk pengajuan lembur Anda.",
          };

          await sendNotification(firestore, {
            userId: submission.uid,
            type: "status_update",
            module: "employee",
            title: titles[decision],
            message: messages[decision],
            targetType: "user",
            targetId: submission.id || "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: userProfile.uid,
          });
        }
      } catch (notificationError) {
        console.error("Gagal mengirim notifikasi", notificationError);
      }

      toast({
        title: "Keputusan Disimpan",
        description: `Pengajuan telah ${
          decision === "approve"
            ? "disetujui"
            : decision === "reject"
              ? "ditolak"
              : "diminta revisi"
        }`,
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

  const handleApprove = async () => {
    const confirmed = window.confirm(
      "Setujui pengajuan lembur ini dan teruskan ke HRD?",
    );
    if (!confirmed) return;
    setIsSaving(true);
    await handleDecision("approve");
  };

  const handleRevisionSubmit = async () => {
    if (!revisionNote.trim()) {
      toast({
        variant: "destructive",
        title: "Catatan Diperlukan",
        description: "Harap isi catatan revisi.",
      });
      return;
    }
    setIsSaving(true);
    await handleDecision("revise", revisionNote);
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan Diperlukan",
        description: "Harap isi alasan penolakan.",
      });
      return;
    }
    setIsSaving(true);
    await handleDecision("reject", rejectionReason);
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
                  Tinjau detail pengajuan sebelum mengambil keputusan.
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
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-border bg-muted p-4 shadow-sm">
                  <p className="text-xs uppercase text-muted-foreground">
                    Ringkasan Cepat
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tanggal</span>
                      <span>
                        {overtimeDate
                          ? format(overtimeDate, "eeee, dd MMM yyyy", {
                              locale: idLocale,
                            })
                          : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Jam</span>
                      <span>
                        {submission.startTime} - {submission.endTime}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Durasi</span>
                      <span>{submission.totalDurationMinutes} menit</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Lokasi</span>
                      <span>
                        {submission.workLocationLabel ||
                          submission.workLocation ||
                          submission.location ||
                          "-"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-muted p-4 shadow-sm">
                  <p className="text-xs uppercase text-muted-foreground">
                    Profil Pengaju
                  </p>
                  <div className="mt-3 space-y-3 text-sm">
                    <InfoRow
                      label="Jabatan"
                      value={submission.workRole || submission.positionTitle}
                    />
                    <InfoRow label="Brand" value={submission.brandName} />
                    <InfoRow
                      label="Divisi"
                      value={submission.divisionName || submission.division}
                    />
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
                    <div className="space-y-3">
                      {tasks.length > 0 ? (
                        tasks.map((task, index) => (
                          <div
                            key={index}
                            className="rounded-3xl border border-border bg-background p-4"
                          >
                            <p className="font-medium">{task.description}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Estimasi: {task.estimatedMinutes} menit
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Tidak ada rincian tugas.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Total Estimasi
                      </p>
                      <p className="mt-2 font-semibold">
                        {tasks.reduce(
                          (sum, task) => sum + (task.estimatedMinutes || 0),
                          0,
                        )}{" "}
                        menit
                      </p>
                    </div>

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

                <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                  <CardHeader className="px-5 py-4">
                    <CardTitle className="text-base">
                      Timeline Persetujuan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5 pt-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <OvertimeApprovalStatusBadge
                        status={resolvedStatus as any}
                        mode={mode}
                      />
                    </div>
                    <InfoRow
                      label="Diajukan"
                      value={format(submittedAt, "eeee, dd MMM yyyy HH:mm", {
                        locale: idLocale,
                      })}
                    />
                    {managerDecisionAt ? (
                      <InfoRow
                        label="Keputusan Manager"
                        value={format(
                          managerDecisionAt,
                          "eeee, dd MMM yyyy HH:mm",
                          {
                            locale: idLocale,
                          },
                        )}
                      />
                    ) : (
                      <InfoRow
                        label="Keputusan Manager"
                        value="Belum ada keputusan"
                      />
                    )}
                    {submission.revisionRequestedAt && (
                      <InfoRow
                        label="Revisi Diminta"
                        value={format(
                          parseSafeDate(submission.revisionRequestedAt) ||
                            new Date(),
                          "eeee, dd MMM yyyy HH:mm",
                          { locale: idLocale },
                        )}
                      />
                    )}
                    {submission.rejectedAt && (
                      <InfoRow
                        label="Ditolak"
                        value={format(
                          parseSafeDate(submission.rejectedAt) || new Date(),
                          "eeee, dd MMM yyyy HH:mm",
                          { locale: idLocale },
                        )}
                      />
                    )}
                    {submission.managerNotes && (
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Catatan Manager
                        </p>
                        <p className="mt-2 text-sm leading-6">
                          {submission.managerNotes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Digital Approval Note */}
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

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="w-[90vw] max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Minta Revisi Pengajuan</DialogTitle>
            <DialogDescription>
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
        <DialogContent className="w-[90vw] max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan Lembur</DialogTitle>
            <DialogDescription>
              Berikan alasan penolakan agar karyawan memahami keputusan Anda.
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
