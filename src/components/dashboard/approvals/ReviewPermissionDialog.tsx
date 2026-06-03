"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  Loader2,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  FileText,
  X,
  Eye,
} from "lucide-react";
import {
  PermissionRequest,
  isFinalStatus,
  isActionableStatus,
} from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  updateDocumentNonBlocking,
  useCollection,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  query,
  collection,
  where,
  limit,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import {
  format,
  differenceInMinutes,
  isBefore,
  differenceInCalendarDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/** Extract Google Drive fileId from a URL (handles multiple formats) */
function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  // Already a proxy URL — extract fileId param
  const proxyMatch = url.match(/[?&]fileId=([^&]+)/);
  if (proxyMatch) return proxyMatch[1];
  // Drive URL patterns
  const patterns = [/\/d\/([a-zA-Z0-9-_]+)/, /id=([a-zA-Z0-9-_]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // Bare fileId (no slashes or common chars)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url)) return url;
  return null;
}

/** Safely converts a Firestore Timestamp or plain {seconds, nanoseconds} to Date. */
function safeToDate(t: any): Date | undefined {
  if (!t) return undefined;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  if (t instanceof Date) return t;
  return undefined;
}

/** Returns the internal proxy URL for an attachment string. Falls back to original if not Drive. */
function resolveAttachmentSrc(url: string): string {
  if (!url) return url;
  // Already an internal proxy URL
  if (url.startsWith("/api/")) return url;
  const fileId = extractDriveFileId(url);
  if (fileId) return `/api/storage/google-drive-preview?fileId=${fileId}`;
  return url; // Firebase Storage or other — use as-is
}

function isImageUrl(url: string): boolean {
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(url) || url.includes("image")
  );
}

/**
 * Parse a raw attachment (string or object) into a normalized shape
 */
function parseAttachment(raw: any, fallbackIndex = 0) {
  if (!raw) return null;
  const out: any = { raw };
  if (typeof raw === "string") {
    out.url = raw;
    out.driveFileId = extractDriveFileId(raw) || undefined;
    const parts = raw.split("/");
    out.name =
      decodeURIComponent(parts[parts.length - 1]) ||
      `Lampiran ${fallbackIndex + 1}`;
  } else if (typeof raw === "object") {
    out.id = raw.id || raw.fileId || undefined;
    out.driveFileId =
      raw.driveFileId ||
      raw.fileId ||
      raw.id ||
      raw.googleDriveFileId ||
      undefined;
    out.url =
      raw.url || raw.fileUrl || raw.downloadUrl || raw.storageUrl || undefined;
    out.name =
      raw.name ||
      raw.fileName ||
      raw.originalFileName ||
      raw.filename ||
      out.id ||
      `Lampiran ${fallbackIndex + 1}`;
    out.mimeType = raw.mimeType || raw.contentType || undefined;
  }

  // prefer internal proxy if driveFileId available
  if (out.driveFileId)
    out.proxySrc = `/api/storage/google-drive-preview?fileId=${out.driveFileId}`;
  else if (out.url) out.proxySrc = out.url;
  else out.proxySrc = undefined;

  out.isImage = out.proxySrc
    ? isImageUrl(out.proxySrc) || /image\//.test(out.mimeType || "")
    : false;
  out.isPdf =
    (out.proxySrc && /\.pdf(\?|$)/i.test(out.proxySrc)) ||
    /pdf/.test(out.mimeType || "");
  // Clean display name
  const rawName = out.name || "";
  out.cleanName = decodeURIComponent(String(rawName))
    .replace(/\?.*$/, "")
    .replace(/view$/i, "")
    .replace(/(\?|&)?usp=.*$/i, "")
    .trim();
  if (!out.cleanName) out.cleanName = `Lampiran ${fallbackIndex + 1}`;
  return out;
}

function getApplicantInfo(submission: any) {
  const clean = (v: any) => {
    if (!v && v !== 0) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (["N/A", "NA", "-", "Staf", "Staff"].includes(s)) return null;
    return s;
  };

  // Try multiple sources similar to approval resolver logic
  const ep = submission.employeeProfile || submission.employee_profile || null;

  // Priority: snapshot fields on submission -> employeeProfile -> approvalFlow -> fallbacks
  const position =
    clean(submission._resolvedApplicantPosition) ||
    clean(submission.applicantPosition) ||
    clean(ep?.positionTitle) ||
    clean(ep?.hrdEmploymentInfo?.positionName) ||
    clean(submission.position) ||
    clean(submission.positionTitle) ||
    clean(submission.jobTitle) ||
    clean(submission.roleName) ||
    clean(submission.hrdEmploymentInfo?.positionName) ||
    clean(submission.requesterStructuralPosition) ||
    clean(submission.approvalFlow?.requesterStructuralPosition) ||
    null;

  const division =
    clean(submission._resolvedApplicantDivision) ||
    clean(submission.applicantDivisionName) ||
    clean(ep?.division) ||
    clean(ep?.divisionName) ||
    clean(submission.division) ||
    clean(submission.divisionName) ||
    clean(submission.hrdEmploymentInfo?.divisionName) ||
    clean(submission.approvalFlow?.divisionName) ||
    null;

  const brand =
    clean(submission._resolvedApplicantBrand) ||
    clean(submission.applicantBrandName) ||
    clean(submission.applicantCompanyName) ||
    clean(ep?.brandName) ||
    clean(ep?.companyName) ||
    clean(submission.brandName) ||
    clean(submission.companyName) ||
    clean(submission.hrdEmploymentInfo?.brandName) ||
    clean(submission.approvalFlow?.brandName) ||
    null;

  return {
    position: position || "Belum diatur",
    division: division || "Belum diatur",
    brand: brand || "Belum diatur",
  };
}

function getApplicantName(submission: any) {
  return (
    submission.fullName ||
    submission.requesterName ||
    submission.approvalFlow?.requesterName ||
    submission.employeeProfile?.dataDiriIdentitas?.fullName ||
    submission.employeeProfile?.fullName ||
    "—"
  );
}

function formatDurationDisplay(submission: any) {
  const formType = submission.formType || submission.type || "tidak_masuk";
  const start = safeToDate(submission.startDate);
  const end = safeToDate(submission.endDate);

  if (formType === "tidak_masuk") {
    if (!start || !end) return "—";
    const days = differenceInCalendarDays(end, start) + 1;
    return `${days} hari`;
  }

  // Hour-based types
  const minutes =
    typeof submission.totalDurationMinutes === "number"
      ? submission.totalDurationMinutes
      : (() => {
          if (!start || !end) return 0;
          return Math.max(0, differenceInMinutes(end, start));
        })();

  if (minutes <= 0) return "0 menit";
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hrs > 0 && rem > 0) return `${hrs} jam ${rem} menit`;
  if (hrs > 0) return `${hrs} jam`;
  return `${rem} menit`;
}

const reviewSchema = z.object({
  note: z
    .string()
    .min(10, "Catatan harus diisi saat menolak atau meminta revisi."),
});

const PERMISSION_TYPE_LABELS = {
  sakit: "Izin Sakit",
  tidak_masuk: "Izin Tidak Masuk",
  datang_terlambat: "Izin Datang Terlambat",
  pulang_awal: "Izin Pulang Lebih Awal",
  keluar_kantor: "Izin Meninggalkan Kantor Sementara",
  duka: "Izin Duka Cita",
  akademik: "Izin Akademik",
  administrasi_resmi: "Izin Administrasi Resmi",
  lainnya: "Izin Lainnya",
};

function isHrdValidationPhase(s: PermissionRequest): boolean {
  const isHrdStep = s.currentApprovalStep === "hrd" || s.waitingForRole === "hrd" || s.waitingForName === "HRD";
  const isHrdStatus = [
    "pending_hrd",
    "pending_hrd_validation",
    "approved_by_manager",
    "verified_manager",
    "revision_hrd"
  ].includes(s.status);
  
  return isHrdStep || isHrdStatus;
}

const HUMAN_STATUS_LABELS: Record<
  string,
  (submission: PermissionRequest) => string
> = {
  draft: () => "Draft",
  pending_manager: (s) => `Menunggu persetujuan ${s.waitingForName || s.managerName || "Manager"}`,
  rejected_manager: () => "Ditolak",
  revision_manager: () => "Perlu Revisi",
  approved_by_manager: () => "Menunggu validasi HRD",
  pending_hrd: () => "Menunggu validasi HRD",
  rejected_hrd: () => "Ditolak",
  revision_hrd: () => "Perlu Revisi",
  approved: () => "Disetujui",
  reported: () => "Dilaporkan Keluar",
  returned: () => "Sudah Kembali",
  verified_manager: () => "Menunggu validasi HRD",
  closed: () => "Disetujui",
};

const buildTimeline = (submission: PermissionRequest) => {
  const items: {
    label: string;
    date?: Date;
    by?: string;
    notes?: string;
    icon?: "ok" | "warn" | "info";
  }[] = [];

  // 1. Pengajuan dibuat
  if (submission.createdAt) {
    items.push({
      label: "Pengajuan dibuat",
      date: safeToDate(submission.createdAt),
      by: getApplicantName(submission),
      icon: "info",
    });
  }

  // 2. Dikirim ke manager
  if (submission.createdAt) {
    items.push({
      label: `Dikirim ke manager (${submission.managerName || "Atasan"})`,
      date: safeToDate(submission.createdAt),
      icon: "info",
    });
  }

  // 3. Manager action
  if (submission.managerDecisionAt) {
    const decDate = safeToDate(submission.managerDecisionAt);
    const mName = submission.managerName || "Manager";
    let eventLabel = `Manager ${mName} menyetujui pengajuan`;
    let icon: "ok" | "warn" = "ok";
    if (submission.status === "rejected_manager") {
      eventLabel = `Manager ${mName} menolak pengajuan`;
      icon = "warn";
    } else if (submission.status === "revision_manager") {
      eventLabel = `Manager ${mName} meminta revisi`;
      icon = "warn";
    }
    items.push({
      label: eventLabel,
      date: decDate,
      by: mName,
      notes: submission.managerNotes || undefined,
      icon,
    });

    // 4. Masuk validasi HRD (immediately after manager approval)
    if (
      ![
        "pending_manager",
        "rejected_manager",
        "revision_manager",
        "draft",
      ].includes(submission.status)
    ) {
      items.push({
        label: "Masuk validasi HRD",
        date: decDate,
        icon: "info",
      });
    }
  }

  // 5. HRD action
  if (submission.hrdDecisionAt) {
    const decDate = safeToDate(submission.hrdDecisionAt);
    let eventLabel = "HRD menyetujui pengajuan";
    let icon: "ok" | "warn" = "ok";
    if (submission.status === "rejected_hrd") {
      eventLabel = "HRD menolak pengajuan";
      icon = "warn";
    } else if (submission.status === "revision_hrd") {
      eventLabel = "HRD meminta revisi";
      icon = "warn";
    }
    items.push({
      label: eventLabel,
      date: decDate,
      notes: submission.hrdNotes || undefined,
      icon,
    });
  }

  // Deduplicate and sort by date
  const uniqueItems: typeof items = [];
  const labelsSeen = new Set<string>();
  
  const sortedRaw = items
    .filter(item => item.date)
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  for (const item of sortedRaw) {
    if (!labelsSeen.has(item.label)) {
      labelsSeen.add(item.label);
      uniqueItems.push(item);
    }
  }
  
  return uniqueItems;
};

type FormValues = z.infer<typeof reviewSchema>;

interface ReviewPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: PermissionRequest;
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

export function ReviewPermissionDialog({
  open,
  onOpenChange,
  submission,
  onSuccess,
  mode,
}: ReviewPermissionDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      note:
        mode === "manager"
          ? submission.managerNotes || ""
          : submission.hrdNotes || "",
    },
  });

  // We'll open attachments in a new tab via internal preview endpoint.

  const isFinal = isFinalStatus(submission.status);
  const canAct = useMemo(() => {
    if (isFinal) return false;
    if (mode === "manager") {
      return isActionableStatus(submission.status, "manager");
    }
    if (mode === "hrd") {
      return isHrdValidationPhase(submission);
    }
    return false;
  }, [submission, mode, isFinal]);

  const canShowActions = useMemo(() => {
    if (isFinal) return false;
    if (mode === "manager") {
      return (
        submission.waitingForUid === userProfile?.uid &&
        submission.status === "pending_manager"
      );
    }
    if (mode === "hrd") {
      return isHrdValidationPhase(submission);
    }
    return false;
  }, [submission, userProfile, mode, isFinal]);
  const isOfficeExit =
    submission.type === "keluar_kantor" ||
    submission.formType === "keluar_kantor";

  const returnEventsQuery = useMemo(() => {
    if (
      !isOfficeExit ||
      submission.status !== "reported" ||
      !submission.reportedExitAt
    )
      return null;
    if (mode !== "hrd" && userProfile?.role !== "super-admin") return null;

    return query(
      collection(firestore, "attendance_events"),
      where("uid", "==", submission.uid),
      where("tsServer", ">", submission.reportedExitAt),
      orderBy("tsServer", "asc"),
      limit(1),
    );
  }, [
    isOfficeExit,
    submission.status,
    submission.reportedExitAt,
    submission.uid,
    firestore,
    mode,
    userProfile,
  ]);

  const { data: returnEvents } = useCollection<any>(returnEventsQuery as any);
  const detectedReturnAt =
    returnEvents?.[0]?.tsServer || submission.actualReturnAt;

  const syncReturnFromAttendance = async () => {
    if (
      !detectedReturnAt ||
      submission.status !== "reported" ||
      !isOfficeExit ||
      isSaving
    )
      return;

    setIsSaving(true);
    try {
      const submissionRef = doc(
        firestore,
        "permission_requests",
        submission.id!,
      );
      const now =
        typeof detectedReturnAt === "object" && "toDate" in detectedReturnAt
          ? (detectedReturnAt as any).toDate()
          : new Date(detectedReturnAt);
      const startAt =
        submission.reportedExitAt?.toDate() || submission.startDate.toDate();
      const expectedAt =
        submission.expectedReturnAt?.toDate() || submission.endDate.toDate();

      const actualDuration = differenceInMinutes(now, startAt);
      const isLate = isBefore(expectedAt, now);
      const isOverFourHours = actualDuration > 240;

      await updateDocumentNonBlocking(submissionRef, {
        status: "returned",
        actualReturnAt: Timestamp.fromDate(now),
        returnSource: "attendance_auto",
        returnDetectedFromAttendance: true,
        actualDurationMinutes: actualDuration,
        exceededEstimatedReturn: isLate,
        exceededFourHours: isOverFourHours,
        overtimeReturnMinutes: isLate
          ? differenceInMinutes(now, expectedAt)
          : 0,
        needsManagerAttention: isLate || isOverFourHours,
        updatedAt: serverTimestamp(),
      });
      onSuccess();
    } catch (e: any) {
      console.error("Auto-sync return failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDecision = async (decision: "approve" | "reject" | "revise") => {
    if (!userProfile) return;

    if (!canAct) {
      toast({
        variant: "destructive",
        title: "Aksi Ditolak",
        description:
          "Pengajuan ini sudah final atau tidak lagi dapat diproses.",
      });
      return;
    }

    if (decision !== "approve") {
      const isNoteValid = await form.trigger("note");
      if (!isNoteValid) return;
    }

    setIsSaving(true);
    try {
      const submissionRef = doc(
        firestore,
        "permission_requests",
        submission.id!,
      );
      const note = form.getValues("note");

      let status: PermissionRequest["status"] = submission.status;
      let payload: Partial<PermissionRequest> = {};
      const isManagerAction = mode === "manager";

      const nowTs = Timestamp.now();

      if (isManagerAction) {
        if (isOfficeExit) {
          if (decision === "approve") status = "verified_manager";
          else if (decision === "reject") status = "rejected_manager";
        } else {
          if (decision === "approve") status = "approved_by_manager";
          else if (decision === "reject") status = "rejected_manager";
          else if (decision === "revise") status = "revision_manager";
        }

        // Build timeline entry for the decision
        const decisionEventLabel =
          decision === "approve"
            ? isOfficeExit
              ? `${userProfile.fullName} memverifikasi pengajuan keluar kantor`
              : `${userProfile.fullName} menyetujui pengajuan`
            : decision === "reject"
              ? `${userProfile.fullName} menolak pengajuan`
              : `${userProfile.fullName} meminta revisi`;

        const updatedTimeline = [
          ...(submission.timeline || []),
          {
            event: decisionEventLabel,
            by: userProfile.fullName,
            byUid: userProfile.uid,
            at: nowTs,
            note: note || null,
          },
          ...(decision === "approve" && !isOfficeExit
            ? [
                {
                  event: "Pengajuan diteruskan ke HRD untuk validasi",
                  by: userProfile.fullName,
                  byUid: userProfile.uid,
                  at: nowTs,
                  note: null,
                },
              ]
            : []),
        ];

        payload = {
          status,
          managerReviewNote: note || null,
          managerNotes: note || null,
          managerDecisionAt: serverTimestamp() as any,
          timeline: updatedTimeline,
          // Update approval routing when manager approves (non-office-exit)
          ...(decision === "approve" && !isOfficeExit
            ? {
                currentApprovalStep: "hrd",
                waitingForUid: null,
                waitingForName: "HRD",
              }
            : {}),
        };
      } else {
        if (decision === "approve") status = "closed";
        else if (decision === "reject") status = "rejected_hrd";
        else if (decision === "revise") status = "revision_hrd";

        const hrdEventLabel =
          decision === "approve"
            ? "HRD memvalidasi dan menutup pengajuan"
            : decision === "reject"
              ? "HRD menolak pengajuan"
              : "HRD meminta revisi pengajuan";

        const updatedTimeline = [
          ...(submission.timeline || []),
          {
            event: hrdEventLabel,
            by: userProfile.fullName,
            byUid: userProfile.uid,
            at: nowTs,
            note: note || null,
          },
        ];

        payload = {
          status,
          hrdReviewNote: note || null,
          hrdNotes: note || null,
          hrdDecisionAt: serverTimestamp() as any,
          timeline: updatedTimeline,
          ...(decision === "approve"
            ? {
                currentApprovalStep: "done",
                waitingForUid: null,
                waitingForName: null,
              }
            : {}),
        };
      }

      if (
        isManagerAction &&
        isOfficeExit &&
        detectedReturnAt &&
        !submission.actualReturnAt
      ) {
        const now =
          typeof detectedReturnAt === "object" && "toDate" in detectedReturnAt
            ? (detectedReturnAt as any).toDate()
            : new Date(detectedReturnAt);
        const startAt =
          submission.reportedExitAt?.toDate() || submission.startDate.toDate();
        const expectedAt =
          submission.expectedReturnAt?.toDate() || submission.endDate.toDate();
        const actualDuration = differenceInMinutes(now, startAt);
        const isLate = isBefore(expectedAt, now);
        const isOverFourHours = actualDuration > 240;

        payload.actualReturnAt = Timestamp.fromDate(now);
        payload.returnSource = "attendance_auto";
        payload.returnDetectedFromAttendance = true;
        payload.actualDurationMinutes = actualDuration;
        payload.exceededEstimatedReturn = isLate;
        payload.exceededFourHours = isOverFourHours;
        payload.overtimeReturnMinutes = isLate
          ? differenceInMinutes(now, expectedAt)
          : 0;
      }

      await updateDocumentNonBlocking(submissionRef, payload);
      toast({
        title: "Keputusan Disimpan",
        description: `Pengajuan izin telah ${decision}.`,
      });
      onSuccess();
      onOpenChange(false);
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[90vw] h-[90vh] p-0 overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader className="p-6 pb-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b relative z-10">
            <div className="flex items-center justify-between mb-1">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Review Pengajuan Izin
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Tinjau detail data operasional sebelum memberikan keputusan.
                </DialogDescription>
              </div>
              <Badge
                variant="outline"
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              >
                {(
                  HUMAN_STATUS_LABELS[submission.status] ||
                  (() => submission.status.replace(/_/g, " "))
                )(submission)}
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 space-y-6">
              {/* Alur Proses removed — keep only Alur Persetujuan */}

              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Informasi Pengajuan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                  <InfoRow
                    label="Nama Karyawan"
                    value={getApplicantName(submission)}
                  />
                  {(() => {
                    const info = getApplicantInfo(submission);
                    return (
                      <>
                        <InfoRow label="Jabatan" value={info.position} />
                        <InfoRow label="Divisi" value={info.division} />
                        <InfoRow label="Brand" value={info.brand} />
                      </>
                    );
                  })()}
                  <InfoRow
                    label="Jenis Izin"
                    value={
                      PERMISSION_TYPE_LABELS[
                        submission.type as keyof typeof PERMISSION_TYPE_LABELS
                      ] || submission.type
                    }
                  />
                  {safeToDate(submission.createdAt) && (
                    <InfoRow
                      label="Dibuat Pada"
                      value={format(
                        safeToDate(submission.createdAt)!,
                        "dd MMM yyyy HH:mm",
                        { locale: idLocale },
                      )}
                    />
                  )}
                  <div className="md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Alasan / Keterangan
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                      "{submission.reason}"
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Alur Persetujuan */}
              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Alur Persetujuan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Dibuka melalui preview internal HRP
                  </p>
                  {/* Step visual */}
                  <div className="flex items-center gap-3 flex-wrap text-sm">
                    {(() => {
                      const steps = [
                        {
                          uid: submission.uid,
                          name: submission.fullName,
                          role: "Pengaju",
                          done: true,
                          at: safeToDate(submission.createdAt),
                        },
                        {
                          uid: submission.managerUid,
                          name: submission.managerName || "Atasan",
                          role: "Atasan Langsung",
                          done: !!submission.managerDecisionAt,
                          at: safeToDate(submission.managerDecisionAt),
                        },
                        {
                          uid: submission.hrdReviewerUid,
                          name: submission.approvalFlow?.hrdName || "HRD",
                          role: "Validasi Akhir",
                          done: !!submission.hrdDecisionAt,
                          at: safeToDate(submission.hrdDecisionAt),
                        },
                      ];
                      return steps.map((step, i, arr) => {
                        const isActive =
                          submission.waitingForUid &&
                          userProfile &&
                          submission.waitingForUid === userProfile.uid &&
                          i === 1;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="text-center">
                              <div
                                className={cn(
                                  "h-10 w-10 rounded-md flex items-center justify-center text-sm font-semibold border-2 mx-auto",
                                  isActive
                                    ? "bg-amber-500 border-amber-600 text-white shadow"
                                    : step.done
                                      ? "bg-emerald-500 border-emerald-600 text-white"
                                      : "bg-muted border-border text-muted-foreground",
                                )}
                              >
                                {step.done ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : (
                                  i + 1
                                )}
                              </div>
                              <p className="text-[11px] font-semibold mt-1 max-w-[100px] truncate">
                                {step.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {step.role}
                              </p>
                              {step.at && (
                                <p className="text-[10px] text-muted-foreground">
                                  {format(step.at, "dd MMM HH:mm", {
                                    locale: idLocale,
                                  })}
                                </p>
                              )}
                            </div>
                            {i < arr.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Info rows */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-3">
                    <InfoRow label="Pengaju" value={submission.fullName} />
                    <InfoRow
                      label="Atasan Langsung"
                      value={submission.managerName || "—"}
                    />
                    <InfoRow
                      label="Status Atasan"
                      value={
                        submission.managerDecisionAt
                          ? submission.status.includes("approved") ||
                            submission.status === "closed"
                            ? "Disetujui"
                            : submission.status.includes("rejected")
                              ? "Ditolak"
                              : submission.status.includes("revision")
                                ? "Minta Revisi"
                                : "Diputuskan"
                          : "Menunggu"
                      }
                    />
                    <InfoRow
                      label="Status HRD"
                      value={
                        submission.hrdDecisionAt
                          ? submission.status === "approved" ||
                            submission.status === "closed"
                            ? "Disetujui"
                            : submission.status === "rejected_hrd"
                              ? "Ditolak"
                              : "Diputuskan"
                          : submission.status === "pending_hrd" ||
                              submission.status === "approved_by_manager"
                            ? "Menunggu validasi"
                            : "—"
                      }
                    />
                    <InfoRow
                      label="Menunggu"
                      value={submission.waitingForName || "—"}
                    />
                    {(submission.managerNotes || submission.hrdNotes) && (
                      <div className="col-span-2 pt-1">
                        {submission.managerNotes && (
                          <div className="text-xs">
                            <span className="text-muted-foreground font-medium">
                              Catatan atasan:{" "}
                            </span>
                            <span className="italic">
                              {submission.managerNotes}
                            </span>
                          </div>
                        )}
                        {submission.hrdNotes && (
                          <div className="text-xs mt-1">
                            <span className="text-muted-foreground font-medium">
                              Catatan HRD:{" "}
                            </span>
                            <span className="italic">
                              {submission.hrdNotes}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Timeline Aktivitas */}
              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Timeline Aktivitas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <div className="relative space-y-0">
                    {buildTimeline(submission).map((t, i, arr) => (
                      <div key={i} className="flex gap-3 relative">
                        {/* Vertical line */}
                        {i < arr.length - 1 && (
                          <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />
                        )}
                        {/* Dot */}
                        <div
                          className={cn(
                            "relative z-10 mt-0.5 h-5 w-5 rounded-full flex-shrink-0 flex items-center justify-center border-2",
                            t.icon === "ok"
                              ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-900/30"
                              : t.icon === "warn"
                                ? "bg-red-50 border-red-400 dark:bg-red-900/30"
                                : "bg-muted border-border",
                          )}
                        >
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              t.icon === "ok"
                                ? "bg-emerald-500"
                                : t.icon === "warn"
                                  ? "bg-red-500"
                                  : "bg-muted-foreground",
                            )}
                          />
                        </div>
                        {/* Content */}
                        <div className="pb-4 flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {t.label}
                            </p>
                            <p className="text-xs text-muted-foreground flex-shrink-0">
                              {t.date
                                ? format(t.date, "dd MMM yyyy, HH:mm", {
                                    locale: idLocale,
                                  })
                                : "—"}
                            </p>
                          </div>
                          {t.by && (
                            <p className="text-xs text-muted-foreground">
                              oleh {t.by}
                            </p>
                          )}
                          {t.notes && (
                            <p className="text-xs italic text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1">
                              "{t.notes}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {buildTimeline(submission).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Belum ada aktivitas tercatat.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {isOfficeExit && (
                <div className="space-y-6">
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                    <CardHeader className="bg-slate-100 dark:bg-slate-900/50 py-3 border-b flex flex-row items-center justify-between">
                      <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Rencana vs Realisasi
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {submission.status === "reported" &&
                          detectedReturnAt && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px]"
                              onClick={syncReturnFromAttendance}
                              disabled={isSaving}
                            >
                              <ShieldCheck className="h-3 w-3 mr-1 text-emerald-500" />{" "}
                              Sync Return
                            </Button>
                          )}
                        {submission.returnSource && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] uppercase tracking-tighter"
                          >
                            Source: {submission.returnSource.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-1 md:grid-cols-2">
                        <div className="p-5 border-b md:border-b-0 md:border-r space-y-4">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase">
                            A. RENCANA IZIN KELUAR
                          </h4>
                          <InfoRow
                            label="Jam Keluar"
                            value={
                              safeToDate(submission.reportedExitAt)
                                ? format(
                                    safeToDate(submission.reportedExitAt)!,
                                    "HH:mm",
                                  )
                                : "-"
                            }
                          />
                          <InfoRow
                            label="Estimasi Kembali"
                            value={
                              safeToDate(submission.expectedReturnAt)
                                ? format(
                                    safeToDate(submission.expectedReturnAt)!,
                                    "HH:mm",
                                  )
                                : "-"
                            }
                          />
                          <InfoRow
                            label="Estimasi Durasi"
                            value={
                              submission.estimatedDurationMinutes
                                ? `${submission.estimatedDurationMinutes} menit`
                                : "-"
                            }
                          />
                        </div>
                        <div className="p-5 space-y-4 bg-slate-50/30 dark:bg-slate-900/10">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase">
                            B. REALISASI KEMBALI
                          </h4>
                          <InfoRow
                            label="Jam Kembali Aktual"
                            value={
                              safeToDate(submission.actualReturnAt)
                                ? format(
                                    safeToDate(submission.actualReturnAt)!,
                                    "HH:mm",
                                  )
                                : detectedReturnAt
                                  ? typeof detectedReturnAt === "object" &&
                                    "toDate" in detectedReturnAt
                                    ? format(
                                        (detectedReturnAt as any).toDate(),
                                        "HH:mm",
                                      )
                                    : format(
                                        new Date(detectedReturnAt as any),
                                        "HH:mm",
                                      )
                                  : "-"
                            }
                          />
                          <InfoRow
                            label="Durasi Aktual"
                            value={
                              submission.actualDurationMinutes
                                ? `${submission.actualDurationMinutes} menit`
                                : "-"
                            }
                          />
                          <div className="flex justify-between items-center text-sm pt-1">
                            <p className="text-muted-foreground">
                              Bukti Kembali
                            </p>
                            {submission.actualReturnAt || detectedReturnAt ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200">
                                Terdeteksi
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-slate-400 border-slate-200"
                              >
                                Belum Ada
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-amber-100 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/10 shadow-none rounded-lg overflow-hidden">
                    <CardHeader className="py-3 border-b border-amber-100 dark:border-amber-900/30">
                      <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500">
                        Analisis Monitoring
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-muted-foreground">
                          Sesuai Estimasi?
                        </p>
                        <div className="flex items-center gap-1.5">
                          {submission.actualReturnAt &&
                          !submission.exceededEstimatedReturn ? (
                            <>
                              <CheckCircle className="h-3 w-3 text-emerald-500" />{" "}
                              <span className="font-semibold text-emerald-600 text-xs">
                                Ya
                              </span>
                            </>
                          ) : submission.exceededEstimatedReturn ? (
                            <span className="font-bold text-rose-500 text-xs">
                              Terlambat (+{submission.overtimeReturnMinutes}m)
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-muted-foreground">Batas 4 Jam</p>
                        <div className="flex items-center gap-1.5">
                          {submission.actualReturnAt &&
                          !submission.exceededFourHours ? (
                            <span className="font-semibold text-emerald-600 text-xs">
                              Aman (&le; 4j)
                            </span>
                          ) : submission.exceededFourHours ? (
                            <span className="font-bold text-amber-600 text-xs">
                              Melebihi 4 Jam
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </div>
                      </div>
                      {submission.needsManagerAttention && (
                        <div className="md:col-span-2 pt-2 border-t border-amber-100 dark:border-amber-900/30 flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                          <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase italic">
                            Perhatian: Membutuhkan verifikasi khusus dari
                            Manager atas deviasi durasi.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {!isOfficeExit && (
                <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                  <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Detail Waktu
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                    <InfoRow
                      label="Dari Tanggal"
                      value={
                        safeToDate(submission.startDate)
                          ? format(
                              safeToDate(submission.startDate)!,
                              "dd MMM yyyy",
                              { locale: idLocale },
                            )
                          : "—"
                      }
                    />
                    <InfoRow
                      label="Sampai Tanggal"
                      value={
                        safeToDate(submission.endDate)
                          ? format(
                              safeToDate(submission.endDate)!,
                              "dd MMM yyyy",
                              { locale: idLocale },
                            )
                          : "—"
                      }
                    />
                    <InfoRow
                      label="Total Durasi"
                      value={formatDurationDisplay(submission)}
                    />
                  </CardContent>
                </Card>
              )}

              {submission.attachments?.length ? (
                <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                  <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {submission.reasonType === "sakit"
                        ? "Bukti Pendukung Sakit"
                        : "Lampiran"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-3">
                    {submission.attachments.map((raw: any, i: number) => {
                      const a = parseAttachment(raw, i) || {
                        proxySrc: undefined,
                        name: `Lampiran ${i + 1}`,
                      };
                      const showBadge = submission.reasonType === "sakit";
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-3 border border-border rounded"
                        >
                          <div className="w-16 h-12 flex-shrink-0 overflow-hidden rounded-md bg-muted/30 flex items-center justify-center">
                            {a.isImage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (a.driveFileId) {
                                    window.open(
                                      `/api/storage/google-drive-preview?fileId=${a.driveFileId}`,
                                      "_blank",
                                    );
                                  } else if (
                                    a.proxySrc &&
                                    a.proxySrc.startsWith(
                                      "/api/storage/google-drive-preview",
                                    )
                                  ) {
                                    window.open(a.proxySrc, "_blank");
                                  } else {
                                    toast({
                                      title:
                                        "File lampiran belum memiliki ID preview.",
                                      description:
                                        "Tidak dapat membuka preview internal.",
                                      variant: "default",
                                    });
                                  }
                                }}
                                className="w-full h-full block"
                              >
                                <img
                                  src={a.proxySrc}
                                  alt={a.name}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ) : (
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {a.cleanName || a.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {a.mimeType ||
                                (a.isPdf
                                  ? "PDF"
                                  : a.cleanName && /\./.test(a.cleanName)
                                    ? a.cleanName.split(".").pop()
                                    : "Dokumen")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {showBadge && (
                              <Badge className="text-xs bg-rose-50 text-rose-600">
                                Bukti Pendukung Sakit
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (a.driveFileId) {
                                  window.open(
                                    `/api/storage/google-drive-preview?fileId=${a.driveFileId}`,
                                    "_blank",
                                  );
                                } else if (
                                  a.proxySrc &&
                                  a.proxySrc.startsWith(
                                    "/api/storage/google-drive-preview",
                                  )
                                ) {
                                  window.open(a.proxySrc, "_blank");
                                } else {
                                  toast({
                                    title:
                                      "File lampiran belum memiliki ID preview.",
                                    description:
                                      "File tidak tersedia untuk preview internal.",
                                    variant: "default",
                                  });
                                }
                              }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" /> Lihat
                              Lampiran
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : null}

              {submission.managerNotes && (
                <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                  <CardHeader className="py-2 border-b border-slate-200 dark:border-slate-800">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Catatan Reviu Manager
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <p className="text-sm italic">
                      "{submission.managerNotes}"
                    </p>
                  </CardContent>
                </Card>
              )}

              {canShowActions && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Form {...form}>
                    <form className="space-y-4">
                      <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Catatan Reviu (Wajib untuk Tolak/Revisi)
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Berikan catatan terkait keputusan Anda..."
                                className="resize-none text-sm border-slate-200 dark:border-slate-800 focus:ring-slate-100"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 border-t bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md sm:justify-between items-center gap-4">
            <Button
              variant="ghost"
              className="px-6 h-10 text-xs font-bold uppercase tracking-widest"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>

            {canShowActions && (
              <div className="flex gap-2">
                {!isOfficeExit && (
                  <Button
                    variant="outline"
                    className="h-10 border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-500 hover:dark:bg-amber-950/20 px-4 text-xs font-bold uppercase tracking-wider"
                    onClick={() => handleDecision("revise")}
                    disabled={isSaving}
                  >
                    Reviu / Revisi
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-500 hover:dark:bg-red-950/20 px-4 text-xs font-bold uppercase tracking-wider"
                  onClick={() => handleDecision("reject")}
                  disabled={isSaving}
                >
                  Tolak
                </Button>
                <Button
                  className={cn(
                    "h-10 px-8 text-xs font-bold uppercase tracking-widest text-white shadow-sm",
                    isOfficeExit
                      ? "bg-indigo-600 hover:bg-indigo-700"
                      : "bg-emerald-600 hover:bg-emerald-700",
                  )}
                  onClick={() => handleDecision("approve")}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : isOfficeExit ? (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {isOfficeExit ? "Verifikasi Kehadiran" : "Setujui Pengajuan"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachment preview now opens internal preview endpoint in new tab; modal removed */}
    </>
  );
}
