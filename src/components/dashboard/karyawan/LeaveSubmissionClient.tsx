"use client";

import { useState, useMemo, useEffect } from "react";
import { getAuth } from "firebase/auth";
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  setDocumentNonBlocking,
  useDoc,
} from "@/firebase";
import {
  collection,
  query,
  where,
  doc,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CalendarOff,
  AlertTriangle,
  User,
  Landmark,
  Send,
  Info,
  CheckCircle2,
  ShieldCheck,
  X,
  FileUp,
  Phone,
} from "lucide-react";
import {
  format,
  differenceInCalendarDays,
  eachDayOfInterval,
  isSaturday,
  isSunday,
  addDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { validateStorageFile, compressImage } from "@/lib/storage-utils";
import {
  checkLeaveEligibility,
  calculateLeaveDuration,
  parseContractDurationMonths,
} from "@/lib/leave-utils";
import { sendLeaveNotification } from "@/lib/leave-notifications";
import {
  resolveApprovalTarget,
  type DivisionMasterOrganization,
} from "@/lib/approval-flow";
import {
  type EmployeeProfile,
  type LeaveRequest,
  type LeaveBalance,
  type UserProfile,
} from "@/lib/types";

import { LeaveDetailModalClient } from "@/components/ui/LeaveDetailModalClient";

// Validation helpers
function isAtLeast14DaysAhead(startDate: Date): boolean {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    // Minimum date must be at least 14 days from today
    const minimumDate = addDays(today, 14);
    return start >= minimumDate;
  } catch {
    return false;
  }
}

function getMinimumLeaveDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return addDays(today, 14);
}

function cleanUndefinedFields<T extends object>(obj: T): Partial<T> {
  const clean: any = {};
  Object.keys(obj).forEach((key) => {
    const val = (obj as any)[key];
    if (val === undefined) {
      // Omit completely
    } else if (
      val !== null &&
      typeof val === "object" &&
      !(val instanceof Date) &&
      !(val instanceof Timestamp)
    ) {
      clean[key] = cleanUndefinedFields(val);
    } else {
      clean[key] = val;
    }
  });
  return clean;
}

const formSchema = z
  .object({
    leaveType: z.enum(["tahunan", "besar", "menikah", "melahirkan"], {
      required_error: "Jenis cuti wajib dipilih.",
    }),
    startDate: z.date({ required_error: "Tanggal mulai cuti wajib diisi." }),
    endDate: z.date({ required_error: "Tanggal selesai cuti wajib diisi." }),
    reason: z.string().min(10, "Alasan cuti minimal 10 karakter."),
    leaveAddress: z
      .string()
      .min(10, "Alamat selama cuti wajib diisi (minimal 10 karakter)."),
    handoverEmployeeId: z.string().optional(),
    handoverEmployeeName: z
      .string()
      .min(2, "Nama pengganti sementara wajib diisi (minimal 2 karakter)."),
    handoverEmployeePosition: z
      .string()
      .min(2, "Jabatan pengganti sementara wajib diisi."),
    handoverNotes: z
      .string()
      .min(10, "Catatan serah terima tugas wajib diisi (minimal 10 karakter)."),
    emergencyContactName: z.string().min(2, "Nama kontak darurat wajib diisi."),
    emergencyContactPhone: z
      .string()
      .min(8, "Nomor kontak darurat wajib diisi (min 8 digit)."),
    attachment: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    // Check H-14 rule for start date
    if (!isAtLeast14DaysAhead(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "Pengajuan cuti minimal diajukan H-14 sebelum tanggal mulai cuti.",
      });
    }

    // Check end date is not before start date
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export function LeaveSubmissionClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(
    null,
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializingBalance, setIsInitializingBalance] = useState(false);

  // Fetch employee profile to read hrdEmploymentInfo
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

  const brandId = useMemo(() => {
    if (!employeeProfile?.brandId) return "";
    return Array.isArray(employeeProfile.brandId)
      ? employeeProfile.brandId[0]
      : employeeProfile.brandId;
  }, [employeeProfile?.brandId]);

  const divisionId = useMemo(() => {
    return (
      employeeProfile?.division ||
      employeeProfile?.hrdEmploymentInfo?.divisionId ||
      employeeProfile?.hrdEmploymentInfo?.divisionName ||
      ""
    );
  }, [
    employeeProfile?.division,
    employeeProfile?.hrdEmploymentInfo?.divisionId,
    employeeProfile?.hrdEmploymentInfo?.divisionName,
  ]);

  const divisionDocRef = useMemoFirebase(() => {
    if (!firestore || !brandId || !divisionId) return null;
    return doc(firestore, "brands", brandId, "divisions", divisionId);
  }, [firestore, brandId, divisionId]);

  const { data: divisionMasterRaw } =
    useDoc<DivisionMasterOrganization>(divisionDocRef);

  // Brand-level fallback for staff without a division
  const brandDocRef = useMemoFirebase(() => {
    if (!firestore || !brandId || divisionMasterRaw) return null;
    return doc(firestore, "brands", brandId);
  }, [firestore, brandId, divisionMasterRaw]);
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

  // Fetch balance
  const balanceDocRef = useMemoFirebase(() => {
    return userProfile
      ? doc(firestore, "leave_balances", userProfile.uid)
      : null;
  }, [userProfile, firestore]);
  const {
    data: leaveBalance,
    isLoading: isLoadingBalance,
    mutate: mutateBalance,
  } = useDoc<LeaveBalance>(balanceDocRef);

  // Colleagues query is removed to prevent Firestore "Missing or insufficient permissions" errors for standard employees.
  // Standard employees are not allowed to list all users. Handover is handled via a clean text input.
  const colleagues: any[] = [];
  const isLoadingColleagues = false;
  const handoverOptions: any[] = [];

  // Fetch requests submitted by current user
  const requestsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "leave_requests"),
      where("employeeId", "==", userProfile.uid),
    );
  }, [userProfile?.uid, firestore]);
  const {
    data: requests,
    isLoading: isLoadingRequests,
    mutate: mutateRequests,
  } = useCollection<LeaveRequest>(requestsQuery);

  const sortedRequests = useMemo(() => {
    if (!requests) return [];
    return [...requests].sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [requests]);

  // Self-healing / automatic balance initialization via secure API route
  useEffect(() => {
    if (
      isLoadingProfile ||
      isLoadingBalance ||
      leaveBalance ||
      isInitializingBalance ||
      !userProfile ||
      !firestore
    )
      return;

    const initializeQuota = async () => {
      setIsInitializingBalance(true);
      try {
        const eligibility = checkLeaveEligibility(userProfile, employeeProfile);
        if (!eligibility.isEligible) {
          setIsInitializingBalance(false);
          return;
        }

        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("Sesi login Anda tidak valid.");
        }

        const res = await fetch("/api/leave/initialize-balance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "Gagal melakukan inisialisasi kuota cuti.",
          );
        }

        mutateBalance();
        toast({
          title: "Inisialisasi Berhasil",
          description: `Jatah cuti tahunan Anda telah diatur sebesar ${data.balance?.annualAllowance || eligibility.allowance} Hari.`,
        });
      } catch (e: any) {
        console.error("Failed to initialize leave balance:", e);
      } finally {
        setIsInitializingBalance(false);
      }
    };

    initializeQuota();
  }, [
    isLoadingProfile,
    isLoadingBalance,
    leaveBalance,
    userProfile,
    employeeProfile,
    firestore,
    isInitializingBalance,
    mutateBalance,
    toast,
  ]);

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leaveType: "tahunan",
      startDate: new Date(),
      endDate: new Date(),
      reason: "",
      leaveAddress: "",
      handoverEmployeeId: "",
      handoverEmployeeName: "",
      handoverEmployeePosition: "",
      handoverNotes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    },
  });

  const watchLeaveType = form.watch("leaveType");
  const watchStartDate = form.watch("startDate");
  const watchEndDate = form.watch("endDate");
  const watchHandoverEmployeeId = form.watch("handoverEmployeeId");
  const watchLeaveAddress = form.watch("leaveAddress");
  const watchHandoverEmployeeName = form.watch("handoverEmployeeName");
  const watchHandoverEmployeePosition = form.watch("handoverEmployeePosition");

  const durationDays = useMemo(() => {
    if (!watchStartDate || !watchEndDate || watchEndDate < watchStartDate)
      return 0;
    return calculateLeaveDuration(watchStartDate, watchEndDate);
  }, [watchStartDate, watchEndDate]);

  const validationResult = useMemo(() => {
    if (!watchStartDate || !watchEndDate) {
      return {
        isValid: false,
        warning: "Silakan pilih tanggal mulai dan selesai cuti.",
        errorField: null,
        dur: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(watchStartDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(watchEndDate);
    end.setHours(0, 0, 0, 0);

    // 0. Eligibility Cuti Tahunan Check
    if (watchLeaveType === "tahunan") {
      const eligibility = checkLeaveEligibility(userProfile, employeeProfile);
      if (!eligibility.isEligible) {
        return {
          isValid: false,
          warning:
            "Status kepegawaian Anda tidak eligible untuk mengajukan Cuti Tahunan.",
          errorField: "leaveType" as const,
          dur: 0,
        };
      }
    }

    // 1. Pilih tanggal lampau
    if (start < today) {
      return {
        isValid: false,
        warning: "Tanggal cuti tidak boleh sebelum hari ini.",
        errorField: "startDate" as const,
        dur: 0,
      };
    }

    // 2. Check H-14 rule (at least 14 calendar days ahead)
    if (!isAtLeast14DaysAhead(watchStartDate)) {
      return {
        isValid: false,
        warning: "Pengajuan cuti minimal diajukan H-14 sebelum tanggal mulai cuti.",
        errorField: "startDate" as const,
        dur: 0,
      };
    }

    // 4. Selesai < Mulai
    if (end < start) {
      return {
        isValid: false,
        warning: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
        errorField: "endDate" as const,
        dur: 0,
      };
    }

    const dur = calculateLeaveDuration(watchStartDate, watchEndDate);

    // 5. Cuti tahunan maksimal 5 hari kerja
    if (watchLeaveType === "tahunan" && dur > 5) {
      return {
        isValid: false,
        warning:
          "Maksimal cuti tahunan dalam satu pengajuan adalah 5 hari kerja.",
        errorField: "endDate" as const,
        dur,
      };
    }

    // 6. Saldo tidak cukup (hanya untuk Cuti Tahunan)
    if (watchLeaveType === "tahunan") {
      const currentBal = leaveBalance?.currentBalance ?? 0;
      if (dur > currentBal) {
        return {
          isValid: false,
          warning: "Sisa saldo cuti tidak mencukupi.",
          errorField: "endDate" as const,
          dur,
        };
      }
    }

    // 7. Overlap
    if (sortedRequests) {
      const isOverlap = sortedRequests.some((r) => {
        if (selectedRequest && r.id === selectedRequest.id) return false;
        if (
          r.status === "cancelled" ||
          r.status.includes("rejected") ||
          r.status === "completed"
        )
          return false;
        const startA = start.getTime();
        const endA = end.getTime();
        const startB = r.startDate.toDate().getTime();
        const endB = r.endDate.toDate().getTime();
        return startA <= endB && startB <= endA;
      });

      if (isOverlap) {
        return {
          isValid: false,
          warning: "Tanggal cuti bertabrakan dengan pengajuan cuti lain.",
          errorField: "startDate" as const,
          dur,
        };
      }
    }

    // 8. Semua valid
    return {
      isValid: true,
      warning: `Pengajuan valid. Cuti akan diajukan untuk ${dur} hari kerja.`,
      errorField: null,
      dur,
    };
  }, [
    watchLeaveType,
    watchStartDate,
    watchEndDate,
    leaveBalance,
    sortedRequests,
    selectedRequest,
    userProfile,
    employeeProfile,
  ]);

  // Check same division overlap warning
  const [divisionOverlapWarning, setDivisionOverlapWarning] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (
      !watchStartDate ||
      !watchEndDate ||
      !userProfile ||
      !firestore ||
      watchEndDate < watchStartDate
    ) {
      setDivisionOverlapWarning(null);
      return;
    }

    const checkDivisionOverlap = async () => {
      try {
        const division =
          employeeProfile?.division || userProfile.division || "";
        if (!division || division === "N/A") return;

        const q = query(
          collection(firestore, "leave_requests"),
          where("divisionName", "==", division),
          where("status", "in", [
            "pending_manager",
            "pending_manager_review",
            "pending_hrd",
            "pending_hrd_review",
            "approved",
            "active_leave",
          ]),
        );
        const snapshot = await getDocs(q);
        const overlaps: string[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as LeaveRequest;
          if (data.employeeId === userProfile.uid) return;

          const startA = watchStartDate.getTime();
          const endA = watchEndDate.getTime();
          const startB = data.startDate.toDate().getTime();
          const endB = data.endDate.toDate().getTime();

          if (startA <= endB && startB <= endA) {
            overlaps.push(data.employeeName);
          }
        });

        if (overlaps.length > 0) {
          setDivisionOverlapWarning(
            `Peringatan: Karyawan satu divisi (${overlaps.join(", ")}) juga mengajukan cuti di tanggal yang berdekatan/sama.`,
          );
        } else {
          setDivisionOverlapWarning(null);
        }
      } catch (e) {
        console.error("Failed to check division overlap:", e);
      }
    };

    checkDivisionOverlap();
  }, [watchStartDate, watchEndDate, userProfile, employeeProfile, firestore]);

  const handleCreate = () => {
    setSelectedRequest(null);
    form.reset({
      leaveType: "tahunan",
      startDate: new Date(),
      endDate: new Date(),
      reason: "",
      leaveAddress: "",
      handoverEmployeeId: "",
      handoverEmployeeName: "",
      handoverEmployeePosition: "",
      handoverNotes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
    setIsFormOpen(true);
  };

  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const handleAction = (action: "edit", req: LeaveRequest) => {
    setSelectedRequest(req);
    form.reset({
      leaveType: req.leaveType || "tahunan",
      startDate: req.startDate.toDate(),
      endDate: req.endDate.toDate(),
      reason: req.reason,
      leaveAddress: req.leaveAddress || "",
      handoverEmployeeId: req.handoverEmployeeId,
      handoverEmployeeName: req.handoverEmployeeName || "",
      handoverEmployeePosition: req.handoverEmployeePosition || "",
      handoverNotes: req.handoverNotes || "",
      emergencyContactName: req.emergencyContactName,
      emergencyContactPhone: req.emergencyContactPhone,
    });
    setIsFormOpen(true);
  };

  const handleCancel = async (req: LeaveRequest) => {
    if (!firestore) return;
    if (!confirm("Apakah Anda yakin ingin membatalkan pengajuan cuti ini?"))
      return;

    try {
      const reqRef = doc(firestore, "leave_requests", req.id!);
      const batch = writeBatch(firestore);

      // Change status to cancelled
      batch.update(reqRef, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });

      // Employee cannot edit/update leave_balances directly due to Firestore Security Rules.
      // Quota updates are handled by HRD / Super Admin or an API server.

      await batch.commit();
      toast({ title: "Pengajuan Cuti Dibatalkan" });
      mutateRequests();
      mutateBalance();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Membatalkan Cuti",
        description: e.message,
      });
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile || !firestore || !leaveBalance) return;

    // Use our centralized, strict validationResult check as final guard
    if (!validationResult.isValid) {
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description:
          validationResult.warning ||
          "Silakan periksa kembali isian tanggal pengajuan cuti Anda.",
      });
      return;
    }

    const hrdInfo = employeeProfile?.hrdEmploymentInfo || {};
    if (!employeeProfile) {
      toast({
        variant: "destructive",
        title: "Data Profil Tidak Lengkap",
        description: "Profil kepegawaian belum tersedia. Hubungi HRD.",
      });
      return;
    }

    const approvalTarget = resolveApprovalTarget(
      employeeProfile,
      userProfile,
      divisionMaster,
    );
    if (!approvalTarget.approvalTargetUid) {
      toast({
        variant: "destructive",
        title: "Atasan Tidak Valid",
        description: "Atasan persetujuan belum diatur. Hubungi HRD untuk melengkapi struktur organisasi.",
      });
      return;
    }

    setIsSaving(true);
    let attachmentUrl = "";
    try {
      if (values.attachment instanceof File) {
        const validation = validateStorageFile(values.attachment);
        if (!validation.isValid) {
          toast({
            variant: "destructive",
            title: "Lampiran Gagal",
            description: validation.message,
          });
          setIsSaving(false);
          return;
        }

        const compressed = await compressImage(values.attachment);
        const filePath = `leave-attachments/${userProfile.uid}/${Date.now()}-${compressed.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const uploadResult = await uploadFile(
          compressed,
          filePath,
          userProfile.uid,
          {
            category: "leave",
            ownerUid: userProfile.uid,
            compress: false,
          },
        );
        attachmentUrl =
          uploadResult.webViewLink || uploadResult.downloadUrl || "";
      } else if (typeof values.attachment === "string") {
        attachmentUrl = values.attachment;
      }

      const submissionDateVal = new Date();

      const formattedSubmissionTime = format(
        submissionDateVal,
        "EEEE, dd MMMM yyyy 'pukul' HH:mm",
        { locale: idLocale },
      );
      const formattedStartDate = format(
        values.startDate,
        "EEEE, dd MMMM yyyy",
        { locale: idLocale },
      );
      const formattedEndDate = format(values.endDate, "EEEE, dd MMMM yyyy", {
        locale: idLocale,
      });

      const structuralPosition =
        employeeProfile?.hrdEmploymentInfo?.structuralPosition ||
        (employeeProfile as any)?.structuralPosition ||
        userProfile?.structuralLevel ||
        (employeeProfile?.isDivisionManager || userProfile?.isDivisionManager
          ? "division_manager"
          : "staff");

      const isDivisionManager = structuralPosition === "division_manager";

      const payload: any = {
        employeeId: userProfile.uid,
        employeeUid: userProfile.uid, // Required by Firestore Security Rules to map to auth.uid
        employeeName: userProfile.fullName,
        brandId: Array.isArray(employeeProfile?.brandId)
          ? employeeProfile.brandId[0]
          : employeeProfile?.brandId || "",
        brandName: hrdInfo.brandName || hrdInfo.brand || "",
        divisionId: hrdInfo.divisionId || "",
        divisionName: hrdInfo.divisionName || hrdInfo.divisi || "",
        employmentType:
          hrdInfo.employeeType ||
          hrdInfo.tipeKaryawan ||
          userProfile.employmentType ||
          "karyawan",
        contractDurationMonths: leaveBalance.contractDurationMonths,
        leaveType: values.leaveType,
        startDate: Timestamp.fromDate(values.startDate),
        endDate: Timestamp.fromDate(values.endDate),
        durationDays: durationDays,
        reason: values.reason,
        leaveAddress: values.leaveAddress,
        handoverEmployeeId: values.handoverEmployeeId || "manual",
        handoverEmployeeName: values.handoverEmployeeName || "",
        handoverEmployeePosition: values.handoverEmployeePosition,
        handoverNotes: values.handoverNotes,
        emergencyContactName: values.emergencyContactName,
        emergencyContactPhone: values.emergencyContactPhone,

        // Approver fields based on structural level
        status: isDivisionManager ? "pending_director_review" : "pending_manager_review",
        approvalFlowType: isDivisionManager ? "manager_to_director_to_hrd" : "staff_to_manager_to_hrd",
        currentApprovalStep: isDivisionManager ? "director" : "manager",
        currentApproverUid: approvalTarget.approvalTargetUid,
        approvalTargetUid: approvalTarget.approvalTargetUid,
        directSupervisorUid: isDivisionManager ? approvalTarget.approvalTargetUid : null,
        directorUid: isDivisionManager ? approvalTarget.approvalTargetUid : null,
        directorId: isDivisionManager ? approvalTarget.approvalTargetUid : null,
        directorName: isDivisionManager ? (approvalTarget.approvalTargetName || "") : "",

        managerId: approvalTarget.approvalTargetUid,
        managerUid: approvalTarget.approvalTargetUid,
        directManagerId: approvalTarget.approvalTargetUid,
        directManagerUid: approvalTarget.approvalTargetUid,
        managerName: approvalTarget.approvalTargetName || "",
        approvalLevel: approvalTarget.approvalLevel,
        requesterStructuralPosition: structuralPosition,

        // Safe optional fields - using null instead of undefined to satisfy Firestore requirements
        managerNotes: selectedRequest?.managerNotes || null,
        hrdNotes: selectedRequest?.hrdNotes || null,
        replacementEmployeeId:
          (selectedRequest as any)?.replacementEmployeeId || null,

        // Optional document attachment fields (sent only when attachmentUrl is provided)
        ...(attachmentUrl
          ? {
              attachmentUrl,
              attachmentFileId:
                (selectedRequest as any)?.attachmentFileId || null,
              attachmentFileName:
                (selectedRequest as any)?.attachmentFileName || null,
              attachmentMimeType:
                (selectedRequest as any)?.attachmentMimeType || null,
            }
          : {}),

        // Rich time tracking metadata (Asia/Jakarta Context)
        submittedAtStr: formattedSubmissionTime,
        submissionDay: format(submissionDateVal, "EEEE", { locale: idLocale }),
        submissionDate: format(submissionDateVal, "dd MMMM yyyy", {
          locale: idLocale,
        }),
        submissionTime: format(submissionDateVal, "HH:mm", {
          locale: idLocale,
        }),
        startDateStr: formattedStartDate,
        startDay: format(values.startDate, "EEEE", { locale: idLocale }),
        startDateFormatted: format(values.startDate, "dd MMMM yyyy", {
          locale: idLocale,
        }),
        endDateStr: formattedEndDate,
        endDay: format(values.endDate, "EEEE", { locale: idLocale }),
        endDateFormatted: format(values.endDate, "dd MMMM yyyy", {
          locale: idLocale,
        }),
        durationDaysStr: `${durationDays} hari kerja`,
        timezone: "Asia/Jakarta",
      };

      const docRef = selectedRequest
        ? doc(firestore, "leave_requests", selectedRequest.id!)
        : doc(collection(firestore, "leave_requests"));
      const batch = writeBatch(firestore);

      // Dynamically remove any undefined properties to avoid Firestore "Unsupported field value: undefined" errors
      const cleanedPayload = cleanUndefinedFields(payload);

      // Audit logs before Firestore write (auth.uid, employeeUid, and targeted Firestore paths)
      console.log("=== SUBMIT LEAVE REQUEST AUDIT LOGS ===");
      console.log("auth.uid:", userProfile.uid);
      console.log("payload.employeeUid:", cleanedPayload.employeeUid);
      console.log("Firestore Path written: leave_requests/" + docRef.id);

      // Save Request doc
      batch.set(
        docRef,
        {
          ...cleanedPayload,
          [selectedRequest ? "updatedAt" : "createdAt"]: serverTimestamp(),
        },
        { merge: true },
      );

      // Note: We DO NOT update leave_balances from the client here as standard employees are restricted by Security Rules.
      // Leave balance quota adjustments are handled by HRD / Super Admin or backend API.

      await batch.commit();

      // Trigger custom leaf notification workflow
      await sendLeaveNotification(firestore, "staff_submission", {
        employeeId: userProfile.uid,
        employeeName: userProfile.fullName,
        managerId: payload.managerId,
        managerName: payload.managerName,
        handoverEmployeeId: payload.handoverEmployeeId,
        handoverEmployeeName: payload.handoverEmployeeName,
        startDate: values.startDate,
        endDate: values.endDate,
        requestId: docRef.id,
      });

      toast({
        title: selectedRequest
          ? "Perubahan Disimpan"
          : "Pengajuan Cuti Berhasil",
        description: "Pengajuan cuti berhasil diajukan.",
      });

      setIsFormOpen(false);
      mutateRequests();
      mutateBalance();
    } catch (e: any) {
      console.error("=== SUBMIT LEAVE REQUEST PERMISSION ERROR ===");
      console.error("Error Code/Message:", e.message || e);
      console.error(
        "Firestore Path attempted: leave_requests/" +
          (selectedRequest?.id || "[NEW_DOCUMENT]"),
      );

      let errorDescription = e.message;
      if (
        e.message?.toLowerCase().includes("permission") ||
        e.code === "permission-denied"
      ) {
        errorDescription = `Missing or insufficient permissions on path 'leave_requests/${selectedRequest?.id || "[NEW_DOCUMENT]"}'. Please verify Firestore Security Rules.`;
      }

      toast({
        variant: "destructive",
        title: "Gagal Mengajukan Cuti",
        description: errorDescription,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
      case "approved_by_hrd":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600";
      case "active_leave":
        return "bg-blue-500/10 border-blue-500/20 text-blue-600";
      case "completed":
        return "bg-slate-500/10 border-slate-500/20 text-slate-600";
      case "cancelled":
        return "bg-gray-500/10 border-gray-500/20 text-gray-500";
      case "rejected_by_manager":
      case "rejected_by_hrd":
        return "bg-red-500/10 border-red-500/20 text-red-600";
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_hrd":
        return "bg-amber-500/10 border-amber-500/20 text-amber-600";
      case "pending_manager":
      case "pending_manager_review":
      default:
        return "bg-indigo-500/10 border-indigo-500/20 text-indigo-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending_manager":
      case "pending_manager_review":
        return "Menunggu Persetujuan Atasan";
      case "revision_requested":
      case "revision_requested_by_manager":
        return "Perlu Revisi";
      case "rejected_by_manager":
        return "Ditolak";
      case "pending_hrd":
      case "pending_hrd_review":
        return "Menunggu Verifikasi HRD";
      case "revision_requested_by_hrd":
        return "Perlu Revisi";
      case "rejected_by_hrd":
        return "Ditolak";
      case "approved":
      case "approved_by_hrd":
        return "Disetujui HRD";
      case "active_leave":
        return "Cuti Aktif";
      case "completed":
        return "Cuti Selesai";
      case "cancelled":
        return "Dibatalkan";
      default:
        return status;
    }
  };

  if (
    isLoadingProfile ||
    isLoadingBalance ||
    isLoadingColleagues ||
    isLoadingRequests ||
    isInitializingBalance
  ) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-slate-400">
          Menyiapkan dashboard cuti...
        </p>
      </div>
    );
  }

  if (!isLoadingBalance && !leaveBalance) {
    return (
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900/30">
              <CalendarOff className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Pengajuan Cuti Tahunan
              </h1>
              <p className="text-xs text-muted-foreground font-medium">
                Kelola saldo dan riwayat rencana cuti Anda secara aman.
              </p>
            </div>
          </div>
        </div>

        {/* Warning Alert Card */}
        <Card className="border-amber-100 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 shadow-sm max-w-2xl">
          <CardContent className="pt-6 flex gap-4 items-start">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Saldo Cuti Belum Tersedia
              </h3>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Saldo cuti belum tersedia. Silakan hubungi HRD.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900/30">
              <CalendarOff className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Pengajuan Cuti Tahunan
              </h1>
              <p className="text-xs text-muted-foreground font-medium">
                Kelola saldo dan riwayat rencana cuti Anda secara aman.
              </p>
            </div>
          </div>
          <Button
            onClick={handleCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 shadow-lg shadow-indigo-600/20"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Buat Pengajuan Cuti
          </Button>
        </div>

        {/* Quota & Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-indigo-100/50 dark:border-indigo-900/10 shadow-sm bg-gradient-to-br from-indigo-500/5 via-indigo-600/0 to-transparent">
            <CardContent className="pt-6">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Sisa Saldo Cuti
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400">
                  {leaveBalance?.currentBalance ?? 0}
                </span>
                <span className="text-sm font-bold text-slate-500">Hari</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-100/50 dark:border-emerald-900/10 shadow-sm bg-gradient-to-br from-emerald-500/5 via-emerald-600/0 to-transparent">
            <CardContent className="pt-6">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Cuti Terpakai
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
                  {leaveBalance?.allocatedLeave ?? 0}
                </span>
                <span className="text-sm font-bold text-slate-500">Hari</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-100/50 dark:border-amber-900/10 shadow-sm bg-gradient-to-br from-amber-500/5 via-amber-600/0 to-transparent">
            <CardContent className="pt-6">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Dalam Approval
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-amber-600 dark:text-amber-400">
                  {leaveBalance?.pendingLeave ?? 0}
                </span>
                <span className="text-sm font-bold text-slate-500">Hari</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-100 dark:border-slate-900 shadow-sm bg-slate-50/50 dark:bg-slate-900/50">
            <CardContent className="pt-6">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Jatah Awal Tahunan
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-slate-700 dark:text-slate-200">
                  {leaveBalance?.initialQuota ?? 0}
                </span>
                <span className="text-sm font-bold text-slate-500">Hari</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Requests Table Card */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-md">
          <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">
              Riwayat Pengajuan Cuti Anda
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Jenis Cuti</TableHead>
                    <TableHead>Tanggal Cuti</TableHead>
                    <TableHead>Hari Kerja</TableHead>
                    <TableHead>Pengganti</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-6">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRequests.length > 0 ? (
                    sortedRequests.map((r) => (
                      <TableRow
                        key={r.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <TableCell className="font-bold pl-6 capitalize text-indigo-600 dark:text-indigo-400">
                          Cuti{" "}
                          {r.leaveType === "tahunan"
                            ? "Tahunan"
                            : r.leaveType === "besar"
                              ? "Besar"
                              : r.leaveType === "menikah"
                                ? "Menikah"
                                : r.leaveType === "melahirkan"
                                  ? "Melahirkan"
                                  : "Tahunan"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {format(r.startDate.toDate(), "dd MMM yyyy", {
                            locale: idLocale,
                          })}{" "}
                          -{" "}
                          {format(r.endDate.toDate(), "dd MMM yyyy", {
                            locale: idLocale,
                          })}
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {r.durationDays} Hari
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-500">
                          {r.handoverEmployeeName || "-"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                          >
                            {getStatusLabel(r.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-slate-900 border-slate-800 text-white"
                            >
                              <DropdownMenuItem
                                onSelect={() => handleViewDetails(r)}
                                className="hover:bg-slate-800 focus:bg-slate-800"
                              >
                                <Eye className="mr-2 h-4 w-4" /> Detail Cuti
                              </DropdownMenuItem>
                              {(r.status === "pending_manager_review" ||
                                r.status.startsWith("revision_")) && (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => handleAction("edit", r)}
                                    className="hover:bg-slate-800 focus:bg-slate-800"
                                  >
                                    <Edit className="mr-2 h-4 w-4" /> Ubah
                                    Pengajuan
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => handleCancel(r)}
                                    className="text-red-400 hover:bg-slate-800 focus:bg-slate-800 hover:text-red-400"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Batalkan
                                    Cuti
                                  </DropdownMenuItem>
                                </>
                              )}
                              {(r.status === "approved" ||
                                r.status === "active_leave") && (
                                <DropdownMenuItem
                                  onSelect={() => handleCancel(r)}
                                  className="text-red-400 hover:bg-slate-800 focus:bg-slate-800 hover:text-red-400"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Batalkan
                                  Cuti
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <CalendarOff className="h-10 w-10 mb-3 opacity-20 text-slate-500" />
                          <p className="text-sm font-bold">
                            Belum ada riwayat pengajuan cuti.
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Gunakan tombol diatas untuk mengajukan cuti baru.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Form Submission Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl">
          <DialogHeader className="p-6 pb-2 border-b bg-slate-50/50 dark:bg-slate-900/50">
            <DialogTitle className="text-xl font-black text-slate-900 dark:text-white">
              {selectedRequest
                ? "Ubah Pengajuan Cuti"
                : "Form Pengajuan Cuti Tahunan"}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              Silakan lengkapi seluruh field dengan data yang valid.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <Form {...form}>
              <form
                id="leave-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Jenis Cuti Selection Dropdown */}
                <FormField
                  control={form.control}
                  name="leaveType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-black text-slate-500 uppercase tracking-wider">
                        Jenis Cuti*
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <SelectValue placeholder="Pilih jenis cuti..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <SelectItem value="tahunan">Cuti Tahunan</SelectItem>
                          <SelectItem value="besar">Cuti Besar</SelectItem>
                          <SelectItem value="menikah">Cuti Menikah</SelectItem>
                          <SelectItem value="melahirkan">
                            Cuti Melahirkan
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {validationResult.errorField === "leaveType" && (
                        <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />{" "}
                          {validationResult.warning}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 1. Date Range picker */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Mulai Cuti*
                        </FormLabel>
                        <FormControl>
                          <GoogleDatePicker
                            value={field.value}
                            onChange={field.onChange}
                            disabledDate={(date) => {
                              const minDate = getMinimumLeaveDate();
                              return date < minDate;
                            }}
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-muted-foreground mt-1">
                          Cuti hanya dapat diajukan minimal 14 hari sebelum tanggal mulai cuti.
                        </FormDescription>
                        {validationResult.errorField === "startDate" && (
                          <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />{" "}
                            {validationResult.warning}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Selesai Cuti*
                        </FormLabel>
                        <FormControl>
                          <GoogleDatePicker
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        {validationResult.errorField === "endDate" && (
                          <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />{" "}
                            {validationResult.warning}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Duration indicator */}
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 dark:border-indigo-900/30 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <Info className="h-4 w-4" />
                    <span className="text-xs font-bold">
                      Durasi cuti terhitung hari kerja (Senin-Jumat):
                    </span>
                  </div>
                  <span className="text-lg font-black text-indigo-700 dark:text-indigo-400">
                    {durationDays} Hari Kerja
                  </span>
                </div>

                {/* Premium Ringkasan Detail Cuti Panel */}
                {watchStartDate &&
                  watchEndDate &&
                  watchEndDate >= watchStartDate && (
                    <div className="p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-4 shadow-sm transition-all duration-200">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />{" "}
                        Ringkasan Pengajuan Cuti
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-bold text-slate-400 block mb-0.5">
                            Diajukan pada:
                          </span>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            {format(
                              new Date(),
                              "EEEE, dd MMMM yyyy 'pukul' HH:mm",
                              { locale: idLocale },
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 block mb-0.5">
                            Periode Cuti:
                          </span>
                          <p className="font-bold text-indigo-600 dark:text-indigo-400">
                            {format(watchStartDate, "EEEE, dd MMMM yyyy", {
                              locale: idLocale,
                            })}{" "}
                            –{" "}
                            {format(watchEndDate, "EEEE, dd MMMM yyyy", {
                              locale: idLocale,
                            })}
                          </p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 block mb-0.5">
                            Durasi Cuti:
                          </span>
                          <p className="font-bold text-slate-700 dark:text-slate-300">
                            {validationResult.dur} Hari Kerja
                          </p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 block mb-0.5">
                            Jenis Cuti:
                          </span>
                          <p className="font-bold text-indigo-600 dark:text-indigo-400 capitalize">
                            Cuti{" "}
                            {watchLeaveType === "tahunan"
                              ? "Tahunan"
                              : watchLeaveType === "besar"
                                ? "Besar"
                                : watchLeaveType === "menikah"
                                  ? "Menikah"
                                  : "Melahirkan"}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="font-bold text-slate-400 block mb-0.5">
                            Alamat Selama Cuti:
                          </span>
                          <p className="font-semibold text-slate-700 dark:text-slate-300 break-words">
                            {watchLeaveAddress || "—"}
                          </p>
                        </div>
                        <div className="sm:col-span-2 border-t pt-2.5 mt-1">
                          <span className="font-bold text-slate-400 block mb-0.5">
                            Digantikan Oleh:
                          </span>
                          <p className="font-bold text-slate-800 dark:text-slate-200">
                            {watchHandoverEmployeeName
                              ? `${watchHandoverEmployeeName} — ${watchHandoverEmployeePosition || "Jabatan Belum Diisi"}`
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Validation Info/Error Panel */}
                {validationResult.warning && (
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      validationResult.isValid
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {validationResult.isValid ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                    )}
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider">
                        {validationResult.isValid
                          ? "Pengajuan Valid"
                          : "Validasi Gagal"}
                      </p>
                      <p className="text-sm font-semibold mt-1">
                        {validationResult.warning}
                      </p>
                    </div>
                  </div>
                )}

                {divisionOverlapWarning && (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p className="text-xs font-medium">
                      {divisionOverlapWarning}
                    </p>
                  </div>
                )}

                {/* 2. Reason */}
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-black text-slate-500 uppercase">
                        Alasan Cuti*
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Jelaskan alasan pengajuan cuti tahunan Anda..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Alamat Selama Cuti */}
                <FormField
                  control={form.control}
                  name="leaveAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-black text-slate-500 uppercase">
                        Alamat Selama Cuti*
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder="Sebutkan alamat lengkap tempat Anda tinggal/singgah selama cuti..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 3. Handover Staff selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="handoverEmployeeName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Nama Pengganti Sementara*
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ketik nama rekan pengganti sementara..."
                            {...field}
                            className="rounded-xl border-slate-200 dark:border-slate-800"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="handoverEmployeePosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Jabatan Pengganti Sementara*
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: Senior Web Developer..."
                            {...field}
                            className="rounded-xl border-slate-200 dark:border-slate-800"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* File Upload (full width or single column in grid) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="attachment"
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Dokumen Pendukung (Opsional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => onChange(e.target.files?.[0])}
                            {...fieldProps}
                            className="rounded-xl border-slate-200 dark:border-slate-800"
                          />
                        </FormControl>
                        <FormDescription className="text-[10px]">
                          Format: PDF, JPG, PNG. Maksimal 2MB.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Handover notes */}
                <FormField
                  control={form.control}
                  name="handoverNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-black text-slate-500 uppercase">
                        Catatan Serah Terima Tugas*
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder="Sebutkan delegasi tugas utama selama Anda berhalangan..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Emergency Contact */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                  <FormField
                    control={form.control}
                    name="emergencyContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Nama Kontak Darurat*
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: Ibu Rina (Istri)"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyContactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          No. Telepon Kontak Darurat*
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: 0812XXXXXXXX"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Validation Summary Warning Alert at Bottom of Form */}
                {validationResult.warning && (
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 mt-4 ${
                      validationResult.isValid
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {validationResult.isValid ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                    )}
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider">
                        {validationResult.isValid
                          ? "Pengajuan Valid"
                          : "Validasi Gagal (Ajukan Cuti Dinonaktifkan)"}
                      </p>
                      <p className="text-sm font-semibold mt-1">
                        {validationResult.warning}
                      </p>
                    </div>
                  </div>
                )}
              </form>
            </Form>
          </div>

          <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50 dark:bg-slate-900/50 gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsFormOpen(false)}
              className="rounded-xl font-bold"
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="leave-form"
              disabled={isSaving || !validationResult.isValid}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-6"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Ajukan Cuti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details View Dialog */}
      <LeaveDetailModalClient
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        request={selectedRequest}
      />
    </>
  );
}
