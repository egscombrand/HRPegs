"use client";

import { useState, useEffect, useMemo } from "react";
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
  AlertTriangle,
  Upload,
  X,
  FileText,
  Image,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, setDocumentNonBlocking } from "@/firebase";
import { sendNotification } from "@/lib/notifications";
import {
  doc,
  serverTimestamp,
  Timestamp,
  collection,
} from "firebase/firestore";
import type {
  OvertimeSubmission,
  UserProfile,
  EmployeeProfile,
  Brand,
} from "@/lib/types";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { format, differenceInMinutes, set, addDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
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

export function OvertimeSubmissionForm({
  open,
  onOpenChange,
  submission,
  employeeProfile,
  brands,
  onSuccess,
  formMode,
}: OvertimeSubmissionFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = submission ? (formMode === "view" ? "View" : "Edit") : "Buat";

  const form = useForm<FormValues>({
    resolver: zodResolver(submissionSchema),
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

    const workRole =
      hrd?.workRole ||
      employeeProfile?.positionTitle ||
      (() => {
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
      })() ||
      "-";

    return {
      fullName: employeeProfile?.fullName || userProfile?.fullName || "",
      employmentStatus: normalizedEmployeeType,
      brandName: brandName,
      division: divisionName,
      positionTitle: workRole,
    };
  }, [userProfile, employeeProfile, brands]);

  const approvalFlow = useMemo(() => {
    const hrd = employeeProfile?.hrdEmploymentInfo;
    const directSupervisorUid = hrd?.directSupervisorUid;

    // Jika HRD sudah punya direktur supervisor, alur: Atasan Langsung → HRD
    if (directSupervisorUid) {
      return {
        flowText: "Atasan Langsung → HRD",
        hasValidFlow: true,
        supervisorName: hrd?.directSupervisorName || "Atasan Langsung",
        supervisorUid: directSupervisorUid,
      };
    }

    // Fallback ke logika lama jika belum ada data HRD
    if (userProfile?.isDivisionManager) {
      return {
        flowText: "Langsung ke HRD",
        hasValidFlow: true,
        supervisorName: "Tim HRD",
        supervisorUid: null,
      };
    }

    // Jika tidak ada supervisor data, warning
    return {
      flowText: "Atasan langsung belum ditentukan di data kepegawaian HRD",
      hasValidFlow: false,
      supervisorName: "Belum Ditentukan",
      supervisorUid: null,
    };
  }, [userProfile, employeeProfile]);
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

    // Check if supervisor data is available
    if (!approvalFlow.hasValidFlow) {
      toast({
        variant: "destructive",
        title: "Data Atasan Belum Tersedia",
        description:
          "Atasan langsung belum ditentukan di data kepegawaian HRD. Harap hubungi HRD untuk melengkapi data Anda.",
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

      const payload: any = {
        // Required fields for employee POV
        employeeUid: userProfile.uid,
        employeeName: employeeProfile?.fullName || userProfile.fullName,
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
        directSupervisorUid: approvalFlow.supervisorUid,
        directSupervisorName: approvalFlow.supervisorName,

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
        approvalFlow: approvalFlow.flowText,
        approvalStatus: "pending_supervisor",
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (mode === "Buat") {
        payload.createdAt = serverTimestamp();
      }

      await setDocumentNonBlocking(docRef, payload, { merge: true });

      try {
        if (approvalFlow.supervisorUid) {
          await sendNotification(firestore, {
            userId: approvalFlow.supervisorUid,
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
              employeeUid: userProfile.uid,
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

  const supervisorViewedAt = (submission as any)?.supervisorViewedAt;
  const isReadOnly =
    formMode === "view" ||
    !!(
      submission &&
      currentStatus !== "draft" &&
      !currentStatus.startsWith("revision") &&
      !(currentStatus === "pending_supervisor" && !supervisorViewedAt)
    );

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
          <div className="space-y-8">
            {!approvalFlow.hasValidFlow && !isReadOnly && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Data Atasan Belum Tersedia</AlertTitle>
                <AlertDescription>
                  Atasan langsung belum ditentukan di data kepegawaian HRD.
                  Pengajuan lembur tidak dapat dikirim sampai data Anda
                  dilengkapi oleh HRD.
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
                <InfoRow label="Jabatan" value={displayInfo.positionTitle} />
              </Card>
              <Card className="p-5 space-y-4">
                <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Alur Persetujuan
                </p>
                <InfoRow
                  label="Atasan Langsung"
                  value={approvalFlow.supervisorName}
                />
                <InfoRow label="Divisi" value={displayInfo.division} />
                <div className="flex justify-between items-start gap-4 pt-2 border-t mt-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Alur
                  </p>
                  <p
                    className={`text-base font-semibold text-right ${!approvalFlow.hasValidFlow ? "text-amber-600" : ""}`}
                  >
                    {approvalFlow.flowText}
                  </p>
                </div>
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

            <Form {...form}>
              <form
                id="overtime-form"
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-8"
              >
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
                          <Input type="time" {...field} readOnly={isReadOnly} />
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
                          <Input type="time" {...field} readOnly={isReadOnly} />
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
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tipe" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="hari_kerja">
                              Hari Kerja
                            </SelectItem>
                            <SelectItem value="hari_libur">
                              Hari Libur
                            </SelectItem>
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
                            <SelectTrigger>
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
                    <FormLabel className="text-base">
                      Rincian Pekerjaan
                    </FormLabel>

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
                        Upload foto, screenshot, atau dokumen pendukung (PNG,
                        JPG, JPEG, PDF, maksimal 5MB per file)
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
                  {approvalFlow.supervisorName || "Belum Ditentukan"} → HRD
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
              disabled={
                isSaving ||
                !approvalFlow.hasValidFlow ||
                uploadingAttachments ||
                durationValidation.status === "error"
              }
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
