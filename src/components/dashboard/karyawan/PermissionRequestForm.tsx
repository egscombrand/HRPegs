"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
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
  FileUp,
  FileText,
  Info,
  CheckCircle2,
  AlertCircle,
  Timer,
  ArrowRight,
  ShieldCheck,
  User,
  Users,
  Landmark,
  Send,
  X,
  CalendarCheck,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
} from "firebase/firestore";
import {
  resolveApprovalTarget,
  resolveApproverSkippingSelf,
  isManagementLevel,
  type DivisionMasterOrganization,
} from "@/lib/approval-flow";
import {
  PERMISSION_TYPES,
  type PermissionRequest,
  type UserProfile,
  type EmployeeProfile,
  type Brand,
  type PermissionType,
} from "@/lib/types";
import { uploadFile } from "@/lib/storage/storage-adapter";
import {
  validateStorageFile,
  compressImage,
  handleStorageError,
} from "@/lib/storage-utils";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import {
  format,
  differenceInMinutes,
  set,
  addDays,
  startOfDay,
  endOfDay,
  isBefore,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { compressAndResizeImage } from "@/lib/image-compression";

/** Recursively remove all undefined values from an object/array so Firestore doesn't reject. */
function removeUndefinedDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
  }
  if (
    obj !== null &&
    typeof obj === "object" &&
    !(obj instanceof Date) &&
    !("seconds" in obj && "nanoseconds" in obj)
  ) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedDeep(v)]),
    );
  }
  return obj;
}

const PERMISSION_TYPE_LABELS: Record<PermissionType, string> = {
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

const FORM_TYPES = [
  "tidak_masuk",
  "datang_terlambat",
  "pulang_awal",
  "keluar_kantor",
] as const;
type FormType = (typeof FORM_TYPES)[number];

const REASON_TYPES = [
  "sakit",
  "duka",
  "urusan_keluarga",
  "administrasi_resmi",
  "akademik",
  "transportasi",
  "keperluan_pribadi",
  "lainnya",
] as const;
type ReasonType = (typeof REASON_TYPES)[number];

const REASON_LABELS: Record<ReasonType, string> = {
  sakit: "Sakit",
  duka: "Duka Cita",
  urusan_keluarga: "Urusan Keluarga",
  administrasi_resmi: "Administrasi Resmi",
  akademik: "Akademik",
  transportasi: "Transportasi / Kendaraan",
  keperluan_pribadi: "Keperluan Pribadi Mendesak",
  lainnya: "Lainnya",
};

const formSchema = z
  .object({
    formType: z.enum(FORM_TYPES as any, {
      required_error: "Bentuk izin harus dipilih.",
    }),
    reasonType: z.enum(REASON_TYPES as any, {
      required_error: "Alasan izin harus dipilih.",
    }),
    reasonDetail: z
      .string()
      .min(10, "Alasan/keterangan harus diisi (minimal 10 karakter)."),
    startDate: z.date({ required_error: "Tanggal mulai harus diisi." }),
    endDate: z.date({ required_error: "Tanggal selesai harus diisi." }),
    // Time fields (HH:mm)
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    scheduledWorkTime: z.string().optional(),
    estimatedArrivalTime: z.string().optional(),
    scheduledEndTime: z.string().optional(),
    proposedLeaveTime: z.string().optional(),
    attachment: z.any().optional(),

    // --- Field Khusus ---
    sicknessDescription: z.string().optional(),
    familyRelation: z.string().optional(),
    familyName: z.string().optional(),
    location: z.string().optional(),
    academicActivityName: z.string().optional(),
    academicInstitution: z.string().optional(),
    otherLeaveTitle: z.string().optional(),
    detailedReason: z.string().optional(),
    destination: z.string().optional(),
    officialAffairType: z.string().optional(),
    estimatedFinishTime: z.string().optional(),
    contactInfo: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const durationDays =
      differenceInMinutes(data.endDate, data.startDate) / 1440;

    // Izin Sakit: attachment/bukti pendukung wajib for all durations
    if (data.reasonType === "sakit" && !data.attachment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Izin sakit wajib menyertakan bukti pendukung.",
        path: ["attachment"],
      });
    }

    // no JSX should be inside superRefine — validation only
    // Izin Keluar
    if (data.formType === "keluar_kantor") {
      if (!data.startTime || !data.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message: "Jam mulai dan selesai harus diisi.",
        });
        return;
      }
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const start = set(new Date(), { hours: startH, minutes: startM });
      let end = set(new Date(), { hours: endH, minutes: endM });
      if (end < start) end = addDays(end, 1);

      if (differenceInMinutes(end, start) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message: "Jam selesai harus setelah jam mulai.",
        });
      }
      // Maks 4 jam
      if (differenceInMinutes(end, start) > 240) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message:
            "Izin meninggalkan kantor sementara maksimal 4 jam. Untuk durasi lebih panjang gunakan Izin Pulang Lebih Awal atau Izin Tidak Masuk.",
        });
      }
    }

    // Validasi field khusus berdasarkan reasonType
    if (data.reasonType === "duka" && !data.familyRelation)
      ctx.addIssue({
        code: "custom",
        path: ["familyRelation"],
        message: "Hubungan keluarga harus diisi.",
      });
    if (data.reasonType === "akademik" && !data.academicActivityName)
      ctx.addIssue({
        code: "custom",
        path: ["academicActivityName"],
        message: "Nama kegiatan harus diisi.",
      });
    if (data.reasonType === "lainnya") {
      if (!data.otherLeaveTitle)
        ctx.addIssue({
          code: "custom",
          path: ["otherLeaveTitle"],
          message: "Judul izin harus diisi.",
        });
      if (!data.detailedReason || data.detailedReason.length < 20)
        ctx.addIssue({
          code: "custom",
          path: ["detailedReason"],
          message: "Alasan harus minimal 20 karakter.",
        });
    }
    if (data.formType === "datang_terlambat") {
      if (!data.scheduledWorkTime || !data.estimatedArrivalTime)
        ctx.addIssue({
          code: "custom",
          path: ["estimatedArrivalTime"],
          message: "Jam kerja seharusnya dan estimasi jam datang harus diisi.",
        });
      else {
        // We validate presence of scheduled/estimated times above. Do not block
        // automatically for lateness > 4 hours here; UI will show a warning instead.
      }
    }
    if (data.formType === "pulang_awal") {
      if (!data.scheduledEndTime || !data.proposedLeaveTime)
        ctx.addIssue({
          code: "custom",
          path: ["proposedLeaveTime"],
          message: "Jam pulang seharusnya dan jam pulang diajukan harus diisi.",
        });
      else {
        // Do not block automatically for pulang_awal > 4 hours; show warning in UI instead.
      }
    }
    if (data.formType === "keluar_kantor" && !data.destination)
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Tujuan harus diisi.",
      });

    // Cek tanggal
    if (data.formType !== "keluar_kantor" && data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      });
    }
  });

// ... (rest of the component)
// ...

type FormValues = z.infer<typeof formSchema>;

interface PermissionRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: PermissionRequest | null;
  employeeProfile: EmployeeProfile | null;
  brands: Brand[];
  onSuccess: () => void;
  defaultType?: PermissionType;
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

export function PermissionRequestForm({
  open,
  onOpenChange,
  submission,
  employeeProfile,
  brands,
  onSuccess,
  defaultType,
}: PermissionRequestFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const staffBrandId = useMemo(() => {
    if (!employeeProfile) return "";
    const ep = employeeProfile as any;
    const raw =
      ep.brandId ||
      ep.companyId ||
      ep.hrdEmploymentInfo?.brandId ||
      ep.hrdEmploymentInfo?.companyId ||
      ep.brand ||
      ep.companyName ||
      "";
    return Array.isArray(raw) ? raw[0] : raw;
  }, [employeeProfile]);

  // Check if user is management level
  const structuralPos =
    (employeeProfile as any)?.structuralPosition ||
    (employeeProfile as any)?.hrdEmploymentInfo?.structuralPosition ||
    userProfile?.structuralLevel ||
    "staff";
  const isUserManagement = isManagementLevel(structuralPos);

  const staffDivisionId = useMemo(() => {
    // Skip division for management-level users
    if (isUserManagement) return "";

    const ep = employeeProfile as any;
    // Priority mirrors LeaveSubmissionClient: employeeProfile.division first
    return (
      ep?.division ||
      ep?.hrdEmploymentInfo?.divisionId ||
      ep?.divisionId ||
      ep?.hrdEmploymentInfo?.divisionName ||
      ep?.hrdEmploymentInfo?.divisi ||
      ""
    );
  }, [employeeProfile, isUserManagement]);

  // Layer 1: getDoc by ID — brands/{brandId}/divisions/{divisionId}
  const divisionDocRef = useMemoFirebase(() => {
    // Skip division lookup for management-level users
    if (!firestore || !staffBrandId || !staffDivisionId || isUserManagement) return null;
    return doc(firestore, "brands", staffBrandId, "divisions", staffDivisionId);
  }, [firestore, staffBrandId, staffDivisionId, isUserManagement]);
  const { data: divisionDocById } =
    useDoc<DivisionMasterOrganization>(divisionDocRef);

  // Layer 2: query by name — in case the doc ID is different from the division name/value
  const divisionNameQuery = useMemoFirebase(() => {
    // Skip division lookup for management-level users
    if (!firestore || !staffBrandId || !staffDivisionId || isUserManagement) return null;
    return query(
      collection(firestore, "brands", staffBrandId, "divisions"),
      where("name", "==", staffDivisionId),
    );
  }, [firestore, staffBrandId, staffDivisionId, isUserManagement]);
  const { data: divisionsByName } =
    useCollection<DivisionMasterOrganization>(divisionNameQuery);

  // Merge: prefer name-query result, fallback to doc-by-ID (same as OvertimeSubmissionForm)
  const divisionMaster = useMemo(
    () => divisionsByName?.[0] || divisionDocById || null,
    [divisionsByName, divisionDocById],
  );

  // Layer 3: users collection fallback (identical to Lembur)
  const allUsersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "users"));
  }, [firestore]);
  const { data: allUsers } = useCollection<any>(allUsersQuery);
  const isEditing =
    !!submission &&
    (submission.status === "draft" || submission.status.startsWith("revision"));
  const isViewing = !!submission && !isEditing;
  const isCreating = !submission;
  const mode = isCreating ? "Buat" : isEditing ? "Edit" : "Detail";
  const isReadOnly = isViewing;

  const defaultTimes = useMemo(() => ({ start: "09:00", end: "17:00" }), []);
  const defaultFormType: FormType = ((): FormType => {
    if (
      defaultType &&
      (FORM_TYPES as readonly string[]).includes(defaultType as any)
    )
      return defaultType as any;
    return "tidak_masuk";
  })();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      formType: defaultFormType,
      reasonType: "sakit",
      reasonDetail: "",
      startDate: new Date(),
      endDate: new Date(),
      startTime: defaultTimes.start,
      endTime: defaultTimes.end,
    },
  });

  const { watch, setValue } = form;
  const selectedForm = watch("formType");
  const selectedReason = watch("reasonType");
  const selectedAttachment = watch("attachment");
  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const startDate = watch("startDate");
  const endDate = watch("endDate");

  const durationMinutes = useMemo(() => {
    if (selectedForm === "keluar_kantor") {
      if (!startTime || !endTime) return 0;
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      const start = set(new Date(), {
        hours: startH,
        minutes: startM,
        seconds: 0,
        milliseconds: 0,
      });
      let end = set(new Date(), {
        hours: endH,
        minutes: endM,
        seconds: 0,
        milliseconds: 0,
      });
      if (end < start) end = addDays(end, 1);
      return differenceInMinutes(end, start);
    } else {
      if (!startDate || !endDate) return 0;
      return differenceInMinutes(endOfDay(endDate), startOfDay(startDate)) + 1; // Inclusive of start day
    }
  }, [selectedForm, startTime, endTime, startDate, endDate]);

  // Additional watches for warnings and computed fields
  const reasonDetail = watch("reasonDetail");
  const otherLeaveTitle = watch("otherLeaveTitle");
  const detailedReason = watch("detailedReason");
  const scheduledWorkTime = watch("scheduledWorkTime");
  const estimatedArrivalTime = watch("estimatedArrivalTime");
  const scheduledEndTime = watch("scheduledEndTime");
  const proposedLeaveTime = watch("proposedLeaveTime");

  const computedDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const minutes =
      differenceInMinutes(endOfDay(endDate), startOfDay(startDate)) + 1;
    return Math.max(1, Math.ceil(minutes / 1440));
  }, [startDate, endDate]);

  const lateMinutes = useMemo(() => {
    if (!scheduledWorkTime || !estimatedArrivalTime) return 0;
    const [sH, sM] = scheduledWorkTime.split(":").map(Number);
    const [aH, aM] = estimatedArrivalTime.split(":").map(Number);
    const start = set(new Date(), { hours: sH, minutes: sM });
    const arrive = set(new Date(), { hours: aH, minutes: aM });
    return differenceInMinutes(arrive, start);
  }, [scheduledWorkTime, estimatedArrivalTime]);

  const earlyMinutes = useMemo(() => {
    if (!scheduledEndTime || !proposedLeaveTime) return 0;
    const [sH, sM] = scheduledEndTime.split(":").map(Number);
    const [pH, pM] = proposedLeaveTime.split(":").map(Number);
    const scheduled = set(new Date(), { hours: sH, minutes: sM });
    const proposed = set(new Date(), { hours: pH, minutes: pM });
    let diff = differenceInMinutes(scheduled, proposed);
    if (diff < 0) diff = 0;
    return diff;
  }, [scheduledEndTime, proposedLeaveTime]);

  // Determine if any attachment is present (cover multiple states)
  const attachmentPresent = Boolean(
    // direct form field (File | string | FileList)
    selectedAttachment ||
    // file list or array
    (Array.isArray(selectedAttachment) && selectedAttachment.length > 0) ||
    // File-like object
    (selectedAttachment &&
      typeof selectedAttachment === "object" &&
      ("name" in selectedAttachment || "size" in selectedAttachment)) ||
    // string URL
    (typeof selectedAttachment === "string" && selectedAttachment.length > 0) ||
    // existing uploaded attachments on submission
    (submission && submission.attachments && submission.attachments.length > 0),
  );

  const hasAttachment = attachmentPresent;

  const warnTidakMasukMultiDayNonSakit =
    selectedForm === "tidak_masuk" &&
    selectedReason !== "sakit" &&
    computedDays > 1;
  const warnDatangTerlambatOver4 =
    selectedForm === "datang_terlambat" && lateMinutes > 240;
  const warnPulangAwalOver4 =
    selectedForm === "pulang_awal" && earlyMinutes > 240;

  // For sakit, block if no attachment is present (covers local file, existing URL, etc.)
  const blockSickNoAttachment =
    selectedReason === "sakit" && !attachmentPresent;
  const blockKeluarOver4 =
    selectedForm === "keluar_kantor" && durationMinutes > 240;

  const missingRequired =
    !selectedForm ||
    !selectedReason ||
    !startDate ||
    !endDate ||
    (selectedReason === "lainnya" &&
      (!otherLeaveTitle || (detailedReason?.length || 0) < 20)) ||
    (reasonDetail?.length || 0) < 10;

  const canSubmit =
    !isSaving &&
    !missingRequired &&
    !blockSickNoAttachment &&
    !blockKeluarOver4;

  // Resolve manager using new function that skips self-approval
  const directManager = useMemo(() => {
    if (!userProfile?.uid) {
      return { uid: null, name: null, reason: "User profile missing" };
    }

    const manager = resolveApproverSkippingSelf(
      userProfile.uid,
      employeeProfile,
      userProfile,
      divisionMaster,
      allUsers,
    );

    return manager;
  }, [
    divisionMaster,
    allUsers,
    employeeProfile,
    userProfile,
  ]);

  const managerValid = !!directManager.uid;

  // include manager validity in final submit enable
  const canSubmitFinal = canSubmit && managerValid;

  useEffect(() => {
    if (open) {
      if (!submission) {
        form.reset({
          formType:
            defaultType &&
            (FORM_TYPES as readonly string[]).includes(defaultType as any)
              ? (defaultType as any)
              : "tidak_masuk",
          startDate: new Date(),
          endDate: new Date(),
          startTime: defaultTimes.start,
          endTime: defaultTimes.end,
          reasonType: "sakit",
          reasonDetail: "",
        });
      } else {
        form.reset({
          formType:
            (submission.formType as FormType) ||
            (FORM_TYPES.includes(submission.type as any)
              ? (submission.type as any)
              : "tidak_masuk"),
          reasonType:
            (submission.reasonType as any) ||
            (submission.type as any) ||
            "sakit",
          reasonDetail:
            (submission.reason as string) ||
            (submission.detailedReason as string) ||
            "",
          startDate: submission.startDate.toDate(),
          endDate: submission.endDate.toDate(),
          startTime: format(submission.startDate.toDate(), "HH:mm"),
          endTime: format(submission.endDate.toDate(), "HH:mm"),
          attachment: submission.attachments?.[0] || undefined,
          sicknessDescription: submission.sicknessDescription || "",
          familyRelation: submission.familyRelation || "",
          academicActivityName: submission.academicActivityName || "",
          academicInstitution: submission.academicInstitution || "",
          otherLeaveTitle: submission.otherTitle || "",
          destination: submission.destination || "",
        });
      }
    }
  }, [open, submission, form, defaultType, defaultTimes]);

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile || !employeeProfile) return;
    setIsSaving(true);
    let attachmentUrl = "";
    try {
      if (values.attachment instanceof File) {
        const validation = validateStorageFile(values.attachment);
        if (!validation.isValid) {
          toast({
            variant: "destructive",
            title: "File Terlalu Besar",
            description: validation.message,
          });
          setIsSaving(false);
          return;
        }

        const compressedFile = await compressImage(values.attachment);

        const filePath = `permission-attachments/${userProfile.uid}/${Date.now()}-${compressedFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;

        const result = await uploadFile(
          compressedFile,
          filePath,
          userProfile.uid,
          {
            category: "permission",
            ownerUid: userProfile.uid,
            compress: false, // Already compressed
          },
        );

        // Use internal proxy URL so file is accessible cross-account without Google login
        if (result.fileId) {
          attachmentUrl = `/api/storage/google-drive-preview?fileId=${result.fileId}`;
        } else {
          attachmentUrl =
            result.viewUrl || result.downloadUrl || result.webViewLink || "";
        }
      } else if (typeof values.attachment === "string") {
        attachmentUrl = values.attachment; // Keep existing URL if file not changed
      }

      const docRef = submission
        ? doc(firestore, "permission_requests", submission.id!)
        : doc(collection(firestore, "permission_requests"));
      let finalStartDate = startOfDay(values.startDate);
      let finalEndDate = endOfDay(values.endDate);

      if (values.formType === "keluar_kantor") {
        const [startH, startM] = values.startTime?.split(":").map(Number) || [
          9, 0,
        ];
        const [endH, endM] = values.endTime?.split(":").map(Number) || [17, 0];
        finalStartDate = set(values.startDate, {
          hours: startH,
          minutes: startM,
        });
        finalEndDate = set(values.startDate, { hours: endH, minutes: endM });
      }

      const finalDurationMinutes = differenceInMinutes(
        finalEndDate,
        finalStartDate,
      );

      // Use the same 3-layer resolved manager (same as preview in UI)
      const managerUid = directManager.uid;
      const managerName = directManager.name || null;

      if (!managerUid) {
        // For management level: HRD or Super Admin not found
        // For regular staff: manager not found
        const errorMsg = directManager.reason ||
          (isUserManagement
            ? `Tidak ada HRD atau Super Admin yang tersedia. Hubungi administrator.`
            : `Atasan belum ditemukan. Brand: ${staffBrandId || "—"}, Divisi: ${staffDivisionId || "belum terisi"}. Periksa mapping divisi/brand karyawan.`);
        toast({
          variant: "destructive",
          title: isUserManagement ? "Persetujuan Tidak Tersedia" : "Atasan Tidak Ditemukan",
          description: errorMsg,
        });
        setIsSaving(false);
        return;
      }

      // Verify approver is not the applicant (safety check)
      if (managerUid === userProfile.uid) {
        toast({
          variant: "destructive",
          title: "Persetujuan Diri Tidak Diizinkan",
          description: "Anda tidak dapat menyetujui pengajuan izin Anda sendiri. Hubungi atasan atau HRD.",
        });
        setIsSaving(false);
        return;
      }

      const initialStatus: PermissionRequest["status"] = "pending_manager";

      const payload: Omit<PermissionRequest, "id" | "createdAt" | "updatedAt"> =
        {
          uid: userProfile.uid,
          fullName: userProfile.fullName,
          brandId: Array.isArray(employeeProfile.brandId)
            ? employeeProfile.brandId[0]
            : employeeProfile.brandId || "",
          division: isUserManagement ? "N/A (Management Level)" : (employeeProfile.division || "N/A"),
          positionTitle: employeeProfile.positionTitle || "Staf",
          // legacy compatibility: keep `type` but set to reasonType
          type: values.reasonType as any,
          formType: values.formType as any,
          reasonType: values.reasonType as any,
          reason: values.reasonDetail,
          startDate: Timestamp.fromDate(finalStartDate),
          endDate: Timestamp.fromDate(finalEndDate),
          totalDurationMinutes: finalDurationMinutes,
          numberOfDays: Math.ceil(finalDurationMinutes / 1440),
          attachments: attachmentUrl ? [attachmentUrl] : [],
          status:
            submission?.status === "draft" || isCreating
              ? initialStatus
              : submission.status,
          managerUid: managerUid,
          managerName: managerName || "",
          waitingForUid: managerUid,
          waitingForName: managerName || "",
          approvalLevel: directManager.role || "staff_to_manager",
          currentApprovalStep: "manager",
          requesterStructuralPosition:
            employeeProfile?.hrdEmploymentInfo?.structuralPosition ||
            userProfile?.structuralLevel ||
            "staff",
          attachmentStatus: values.attachment
            ? "provided"
            : values.reasonType === "sakit" && durationMinutes / 1440 <= 1
              ? "verification_needed"
              : "not_provided",
          dynamicFields: getSpecificFields(values),
          timeline: [
            {
              event: "Pengajuan dibuat",
              by: userProfile.fullName,
              byUid: userProfile.uid,
              at: Timestamp.now(),
              note: null,
            },
            {
              event: `Pengajuan dikirim ke ${managerName || "atasan"}`,
              by: userProfile.fullName,
              byUid: userProfile.uid,
              at: Timestamp.now(),
              note: null,
            },
          ],
        };

      // Applicant snapshot fields — use prioritized sources (employeeProfile, divisionMaster, brands list)
      const applicantBrandId = staffBrandId || null;
      const brandObj =
        brands?.find(
          (b) =>
            b.id === applicantBrandId ||
            b.name === applicantBrandId ||
            (b as any).companyName === applicantBrandId,
        ) || null;
      const applicantBrandName =
        brandObj?.name ||
        (brandObj as any)?.companyName ||
        (employeeProfile as any)?.hrdEmploymentInfo?.brandName ||
        employeeProfile?.brandName ||
        null;

      const applicantDivisionId = staffDivisionId || null;
      const applicantDivisionName =
        (divisionMaster as any)?.name ||
        (divisionMaster as any)?.divisionName ||
        (divisionMaster as any)?.title ||
        (employeeProfile as any)?.hrdEmploymentInfo?.divisionName ||
        employeeProfile?.division ||
        (employeeProfile?.division &&
        !/^[A-Za-z0-9_-]{6,}$/.test(employeeProfile.division)
          ? employeeProfile.division
          : null) ||
        null;

      const applicantPosition =
        employeeProfile?.positionTitle ||
        (employeeProfile as any)?.position ||
        (employeeProfile as any)?.jobTitle ||
        (employeeProfile as any)?.roleName ||
        (employeeProfile as any)?.hrdEmploymentInfo?.jabatan ||
        userProfile?.positionTitle ||
        userProfile?.jobTitle ||
        userProfile?.workRole ||
        null;

      // Merge snapshot into payload
      (payload as any).applicantUid = userProfile.uid;
      (payload as any).applicantName = userProfile.fullName;
      (payload as any).applicantPosition = applicantPosition;
      (payload as any).applicantDivisionId =
        applicantDivisionId || staffDivisionId || null;
      (payload as any).applicantDivisionName = applicantDivisionName || null;
      (payload as any).applicantBrandId = applicantBrandId || null;
      (payload as any).applicantBrandName = applicantBrandName || null;
      (payload as any).applicantCompanyName =
        employeeProfile?.brandName || null;
      (payload as any).managerUid = managerUid;
      (payload as any).managerName = managerName || null;
      (payload as any).managerRole = directManager.role || null;
      (payload as any).requesterRole = userProfile.role;

      await setDocumentNonBlocking(
        docRef,
        removeUndefinedDeep({
          ...payload,
          [isCreating ? "createdAt" : "updatedAt"]: serverTimestamp(),
        }),
        { merge: true },
      );

      toast({ title: isEditing ? "Perubahan Disimpan" : "Pengajuan Terkirim" });
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

  const getSpecificFields = (
    values: FormValues,
  ): Record<string, string | null> => {
    const sf = values.formType;
    const rt = values.reasonType;
    const fields: Record<string, string | null> = {};

    // Only include fields relevant to the selected types — use null instead of undefined
    if (rt === "sakit") {
      fields.sicknessDescription =
        values.sicknessDescription || values.reasonDetail || null;
    }
    if (rt === "duka") {
      fields.familyRelation = values.familyRelation || null;
      fields.familyName = values.familyName || null;
      fields.location = values.location || null;
    }
    if (rt === "akademik") {
      fields.academicActivityName = values.academicActivityName || null;
      fields.academicInstitution = values.academicInstitution || null;
    }
    if (rt === "lainnya") {
      fields.otherTitle = values.otherLeaveTitle || null;
      fields.detailedReason = values.detailedReason || null;
    }
    if (rt === "administrasi_resmi") {
      fields.officialAffairType = values.officialAffairType || null;
      fields.location = values.location || null;
      fields.estimatedFinishTime = values.estimatedFinishTime || null;
    }
    if (sf === "datang_terlambat") {
      fields.scheduledWorkTime = values.scheduledWorkTime || null;
      fields.estimatedArrivalTime = values.estimatedArrivalTime || null;
    }
    if (sf === "pulang_awal") {
      fields.scheduledEndTime = values.scheduledEndTime || null;
      fields.proposedLeaveTime = values.proposedLeaveTime || null;
      fields.detailedReason = values.detailedReason || null;
    }
    if (sf === "keluar_kantor") {
      fields.destination = values.destination || null;
      fields.contactInfo = values.contactInfo || null;
    }

    return fields;
  };

  // ... (rest of the component JSX, which is quite large and complex)
  // The existing JSX structure can largely be preserved, but will need conditional rendering for the new specific fields.

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{mode} Pengajuan Izin</DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? "Detail pengajuan izin Anda."
              : "Lengkapi detail pengajuan Anda."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow">
          <div className="px-6 py-4 space-y-6">
            {/* Form Section */}
            <Form {...form}>
              <form
                id="permission-form"
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-6"
              >
                {/* General Fields */}
                <FormField
                  control={form.control}
                  name="formType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bentuk Izin*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!!defaultType || isReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih bentuk izin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FORM_TYPES.map((t) => (
                            <SelectItem
                              key={t}
                              value={t}
                              className="capitalize"
                            >
                              {PERMISSION_TYPE_LABELS[t] || t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reasonType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alasan Izin*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih alasan izin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REASON_TYPES.map((r) => (
                            <SelectItem
                              key={r}
                              value={r}
                              className="capitalize"
                            >
                              {REASON_LABELS[r as ReasonType]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reasonDetail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alasan/Keterangan*</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Jelaskan keperluan Anda..."
                          {...field}
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Warnings */}
                {warnTidakMasukMultiDayNonSakit && (
                  <Alert className="my-2">
                    <AlertTitle>Peringatan</AlertTitle>
                    <AlertDescription>
                      Untuk izin tidak masuk lebih dari 1 hari selain sakit,
                      silakan gunakan cuti atau hubungi HRD.
                    </AlertDescription>
                  </Alert>
                )}
                {warnDatangTerlambatOver4 && (
                  <Alert className="my-2">
                    <AlertTitle>Peringatan</AlertTitle>
                    <AlertDescription>
                      Anda tercatat terlambat lebih dari 4 jam. HRD akan
                      meninjau pengajuan ini; pertimbangkan menggunakan Izin
                      Tidak Masuk jika relevan.
                    </AlertDescription>
                  </Alert>
                )}
                {warnPulangAwalOver4 && (
                  <Alert className="my-2">
                    <AlertTitle>Peringatan</AlertTitle>
                    <AlertDescription>
                      Pulang lebih awal lebih dari 4 jam akan ditandai untuk
                      peninjauan HRD.
                    </AlertDescription>
                  </Alert>
                )}
                {blockSickNoAttachment && (
                  <Alert className="my-2">
                    <AlertTitle className="text-destructive">
                      Diperlukan Lampiran
                    </AlertTitle>
                    <AlertDescription>
                      Izin sakit wajib menyertakan bukti pendukung.
                    </AlertDescription>
                  </Alert>
                )}
                {blockKeluarOver4 && (
                  <Alert className="my-2">
                    <AlertTitle className="text-destructive">
                      Batas Durasi Terlampaui
                    </AlertTitle>
                    <AlertDescription>
                      Izin meninggalkan kantor sementara maksimal 4 jam. Silakan
                      gunakan izin lain jika durasi lebih panjang.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Alur Persetujuan Card */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Alur Persetujuan
                  </p>

                  {directManager?.uid ? (
                    <>
                      {/* Step indicator */}
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
                            1
                          </div>
                          <span className="font-medium text-foreground">
                            {userProfile?.fullName || "Anda"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            (Pengaju)
                          </span>
                        </div>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        {!isUserManagement && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <div className="h-5 w-5 rounded-full bg-amber-500/10 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-400/30">
                                2
                              </div>
                              <span className="font-semibold text-foreground">
                                {directManager.name || "Atasan Langsung"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ({directManager.role === "director" ? "Direktur" : directManager.role === "hrd" ? "HRD" : "Atasan"})
                              </span>
                            </div>
                            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <div className="flex items-center gap-1.5">
                              <div className="h-5 w-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-400/30">
                                3
                              </div>
                              <span className="text-muted-foreground">HRD</span>
                            </div>
                          </>
                        )}
                        {isUserManagement && (
                          <div className="flex items-center gap-1.5">
                            <div className="h-5 w-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-400/30">
                              2
                            </div>
                            <span className="font-semibold text-foreground">HRD</span>
                            <span className="text-[10px] text-muted-foreground">
                              (Persetujuan Langsung)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info rows */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm border-t border-border/50 pt-3">
                        <p className="text-muted-foreground text-xs">Pengaju</p>
                        <p className="font-medium text-xs text-right">
                          {userProfile?.fullName || "—"}
                        </p>
                        {!isUserManagement && (
                          <>
                            <p className="text-muted-foreground text-xs">
                              Tahap persetujuan
                            </p>
                            <p className="font-medium text-xs text-right">
                              {directManager.name || "—"}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Tahap berikutnya
                            </p>
                            <p className="font-medium text-xs text-right">
                              HRD (setelah disetujui)
                            </p>
                          </>
                        )}
                        {isUserManagement && (
                          <>
                            <p className="text-muted-foreground text-xs">
                              Persetujuan langsung
                            </p>
                            <p className="font-medium text-xs text-right">
                              HRD
                            </p>
                          </>
                        )}
                        <p className="text-muted-foreground text-xs">
                          Status awal
                        </p>
                        <p className="font-medium text-xs text-right text-amber-600 dark:text-amber-400">
                          {isUserManagement ? "Menunggu HRD" : directManager.role === "director" ? "Menunggu direktur" : directManager.role === "hrd" ? "Menunggu HRD" : "Menunggu atasan"}
                        </p>
                      </div>

                      {directManager.reason && !isUserManagement && (
                        <div className="rounded-lg bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                          <p className="font-medium mb-1">ℹ️ {directManager.reason}</p>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                        {isUserManagement
                          ? "Pengajuan ini akan dikirim langsung ke HRD untuk diproses."
                          : "Pengajuan ini akan dikirim terlebih dahulu ke approver, lalu diteruskan ke HRD setelah disetujui."}
                      </p>
                      <div className="rounded-lg bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                        Setelah dikirim, status pengajuan akan menjadi:{" "}
                        <strong>
                          {isUserManagement
                            ? "Menunggu persetujuan HRD"
                            : `Menunggu persetujuan ${directManager.name}`}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
                      <p className="text-sm font-semibold text-destructive">
                        {directManager.reason || "Atasan belum ditemukan"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Periksa struktur organisasi karyawan di Data Karyawan ›
                        Info Kepegawaian.
                      </p>
                      <div className="text-xs text-muted-foreground/70 font-mono space-y-0.5">
                        <p>Brand: {staffBrandId || "—"}</p>
                        <p>Divisi: {staffDivisionId || "belum terisi"}</p>
                        <p>
                          Dok divisi:{" "}
                          {divisionMaster ? "✓ ditemukan" : "✗ tidak ditemukan"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-sm text-muted-foreground mb-2">
                  Durasi: {computedDays} hari
                  {selectedForm === "keluar_kantor" &&
                    ` — ${Math.round(durationMinutes / 60)} jam`}
                </div>

                {/* Date & Time Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>
                          {selectedForm === "keluar_kantor"
                            ? "Tanggal Izin*"
                            : "Tanggal Mulai*"}
                        </FormLabel>
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
                  {selectedForm !== "keluar_kantor" && (
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Tanggal Selesai*</FormLabel>
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
                  )}
                  {selectedForm === "keluar_kantor" && (
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jam Mulai*</FormLabel>
                            <FormControl>
                              <Input
                                type="time"
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
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jam Selesai*</FormLabel>
                            <FormControl>
                              <Input
                                type="time"
                                {...field}
                                readOnly={isReadOnly}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                {/* Specific Fields */}
                {selectedForm === "sakit" && (
                  <FormField
                    control={form.control}
                    name="sicknessDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Keluhan Singkat</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Contoh: Demam dan batuk"
                            readOnly={isReadOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {selectedForm === "duka" && (
                  <FormField
                    control={form.control}
                    name="familyRelation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hubungan Keluarga*</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Contoh: Orang Tua, Kakek/Nenek"
                            readOnly={isReadOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {selectedForm === "duka" && (
                  <>
                    <FormField
                      control={form.control}
                      name="familyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Keluarga</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Nama almarhum"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lokasi</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Kota / Lokasi"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                {selectedForm === "akademik" && (
                  <>
                    <FormField
                      control={form.control}
                      name="academicActivityName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Kegiatan*</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Contoh: Sidang Skripsi, Seminar Nasional"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="academicInstitution"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Institusi</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Nama kampus/penyelenggara"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                {selectedForm === "datang_terlambat" && (
                  <>
                    <FormField
                      control={form.control}
                      name="scheduledWorkTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jam Kerja Seharusnya*</FormLabel>
                          <FormControl>
                            <Input
                              type="time"
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
                      name="estimatedArrivalTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimasi Jam Datang*</FormLabel>
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {selectedForm === "pulang_awal" && (
                  <>
                    <FormField
                      control={form.control}
                      name="scheduledEndTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jam Pulang Seharusnya*</FormLabel>
                          <FormControl>
                            <Input
                              type="time"
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
                      name="proposedLeaveTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jam Pulang Diajukan*</FormLabel>
                          <FormControl>
                            <Input
                              type="time"
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
                      name="detailedReason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status Pekerjaan Hari Itu</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Contoh: Sedang menyelesaikan report"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {selectedForm === "administrasi_resmi" && (
                  <>
                    <FormField
                      control={form.control}
                      name="officialAffairType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jenis Urusan*</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Contoh: Mengurus Dokumen"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instansi Tujuan</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Nama instansi"
                              readOnly={isReadOnly}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-2">
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
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="estimatedFinishTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimasi Selesai</FormLabel>
                            <FormControl>
                              <Input
                                type="time"
                                {...field}
                                readOnly={isReadOnly}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}
                {selectedForm === "lainnya" && (
                  <FormField
                    control={form.control}
                    name="otherLeaveTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Judul Izin*</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Contoh: Izin Mengurus Administrasi Bank"
                            readOnly={isReadOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {selectedForm === "keluar_kantor" && (
                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tujuan / Lokasi*</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Contoh: Bank BCA, Kantor Pajak"
                            readOnly={isReadOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Attachment Field */}
                <FormField
                  control={form.control}
                  name="attachment"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>
                        Lampiran{" "}
                        {selectedReason === "sakit" &&
                          "— Bukti Pendukung Sakit"}
                      </FormLabel>
                      {isViewing && !value && (
                        <p className="text-sm text-muted-foreground">
                          Tidak ada lampiran.
                        </p>
                      )}
                      {isViewing && value && (
                        <div className="space-y-2">
                          {typeof value === "string" &&
                            (() => {
                              // Resolve to internal proxy URL
                              const proxySrc = value.startsWith("/api/")
                                ? value
                                : (() => {
                                    const m =
                                      value.match(/[?&]fileId=([^&]+)/) ||
                                      value.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
                                      value.match(/id=([a-zA-Z0-9-_]+)/);
                                    return m
                                      ? `/api/storage/google-drive-preview?fileId=${m[1]}`
                                      : value;
                                  })();
                              const isImg =
                                /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(
                                  value,
                                ) || value.includes("image");
                              return isImg ? (
                                <img
                                  src={proxySrc}
                                  alt="preview lampiran"
                                  className="h-28 rounded-lg border object-cover"
                                />
                              ) : (
                                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                                  <FileText className="h-6 w-6 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground flex-1">
                                    Dokumen lampiran
                                  </span>
                                  <Button size="sm" variant="outline" asChild>
                                    <a
                                      href={proxySrc}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Lihat
                                    </a>
                                  </Button>
                                </div>
                              );
                            })()}
                        </div>
                      )}
                      {!isViewing && (
                        <>
                          <FormControl>
                            <Input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => onChange(e.target.files?.[0])}
                              {...fieldProps}
                            />
                          </FormControl>
                          {value instanceof File && (
                            <div className="mt-2">
                              {value.type.match(/image\//) ? (
                                <img
                                  src={URL.createObjectURL(value)}
                                  alt="preview"
                                  className="h-24 rounded-md border"
                                />
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  {value.name}
                                </div>
                              )}
                            </div>
                          )}
                          <FormDescription>
                            {selectedReason === "sakit"
                              ? "Bukti bisa berupa surat dokter, resep obat, bukti konsultasi dokter/telemedicine, hasil pemeriksaan, atau bukti lain yang relevan."
                              : "Maks. 2MB. Format JPG, PNG, PDF. (Preview untuk gambar)"}
                          </FormDescription>
                          {selectedReason === "sakit" && computedDays > 1 && (
                            <FormDescription className="text-sm text-muted-foreground">
                              Untuk sakit lebih dari 1 hari, disarankan
                              melampirkan surat dokter jika tersedia.
                            </FormDescription>
                          )}
                          <FormMessage />
                        </>
                      )}
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          {!isViewing && (
            <Button
              type="submit"
              form="permission-form"
              disabled={!canSubmitFinal}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Kirim Pengajuan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
