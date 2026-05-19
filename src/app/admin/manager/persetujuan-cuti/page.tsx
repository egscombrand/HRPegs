"use client";

import { useState, useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import {
  collection,
  query,
  doc,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { resolveApprovalTarget } from "@/lib/approval-flow";
import { useAuth } from "@/providers/auth-provider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  CalendarOff,
  Eye,
  CheckCircle2,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { sendLeaveNotification } from "@/lib/leave-notifications";
import { type LeaveRequest } from "@/lib/types";
import { LeaveDetailModal } from "@/components/ui/LeaveDetailModal";

export default function ManagerLeaveApprovalPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(
    null,
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [actionType, setActionType] = useState<
    "approve" | "reject" | "revise" | null
  >(null);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [managerNameFilter, setManagerNameFilter] = useState<string>("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const isDirectorMode = useMemo(() => {
    if (!userProfile) return false;

    const normalizedHierarchy = [
      userProfile.structuralLevel,
      userProfile.positionTitle,
      userProfile.jobTitle,
      userProfile.workRole,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const hasDirectorKeywords = /direktur|director|manajemen|management/.test(
      normalizedHierarchy,
    );

    return userProfile.structuralLevel === "management" || hasDirectorKeywords;
  }, [userProfile]);

  const pageTitle = isDirectorMode
    ? "Persetujuan Cuti Manager Divisi"
    : "Persetujuan Cuti Tim";

  const pageSubtitle = isDirectorMode
    ? "Tinjau pengajuan cuti Manager Divisi lintas brand dan divisi."
    : "Tinjau pengajuan cuti staff di divisi Anda.";

  const currentUserUid = userProfile?.uid || "";

  const filterInputClass =
    "w-full rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500 focus:outline-none focus:ring-1 px-3 py-2 text-sm shadow-none";

  const filterSelectClass =
    "w-full rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500 focus:outline-none focus:ring-1 px-3 py-2 text-sm shadow-none appearance-none";

  const getRequesterLevel = (req: LeaveRequest) => {
    return ((req as any).requesterStructuralPosition as string) || "staff";
  };

  const isSelfRequest = (req: LeaveRequest) =>
    req.employeeId === currentUserUid;

  const isDivisionManagerRequest = (req: LeaveRequest) =>
    getRequesterLevel(req) === "division_manager";

  const getApproverUids = (req: LeaveRequest) => {
    return [
      req.managerId,
      (req as any).managerUid,
      req.directManagerId,
      (req as any).directManagerUid,
      (req as any).directSupervisorUid,
      (req as any).approvalTargetUid,
      (req as any).currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);
  };

  const isAssignedManager = (req: LeaveRequest) => {
    const managerApprovers = [
      req.managerId,
      (req as any).managerUid,
      (req as any).currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);
    return managerApprovers.includes(currentUserUid);
  };

  const isAssignedDirector = (req: LeaveRequest) => {
    const directorApprovers = [
      (req as any).approvalTargetUid,
      (req as any).directSupervisorUid,
      req.directManagerUid,
      (req as any).directManagerUid,
      (req as any).currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);
    return directorApprovers.includes(currentUserUid);
  };

  const isDirectorRequest = (req: LeaveRequest) => {
    const requesterLevel = getRequesterLevel(req);
    const approvalLevel =
      ((req as any).approvalLevel as string | undefined) || "";

    return (
      requesterLevel === "division_manager" ||
      approvalLevel === "manager_to_director" ||
      isAssignedDirector(req)
    );
  };

  const pendingStatuses = new Set([
    "pending_manager",
    "pending_manager_review",
    "pending_director",
    "pending_director_review",
    "pending_supervisor",
    "menunggu_approval_atasan",
    "waiting_manager_approval",
    "waiting_director_approval",
  ]);

  const isPendingStatus = (status: string) =>
    pendingStatuses.has(status);

  const isActionEnabledForRole = (req: LeaveRequest) => {
    const status = req.status;
    const requesterStructuralLevel = String(
      (req as any).requesterStructuralPosition ||
      (req as any).structuralLevel ||
      ""
    ).toLowerCase();

    const isDivisionManager = requesterStructuralLevel.includes("manager");

    if (isDivisionManager) {
      return [
        "pending_director",
        "pending_director_review",
        "waiting_director_approval"
      ].includes(status);
    } else {
      return [
        "pending_manager",
        "pending_manager_review",
        "waiting_manager_approval",
        "menunggu_approval_atasan",
        "pending_supervisor"
      ].includes(status);
    }
  };

  const isPendingForCurrentApprover = (req: LeaveRequest, userUid: string) => {
    if (!isActionEnabledForRole(req)) return false;

    const managerId = req.managerId;
    const managerUid = (req as any).managerUid;
    const directManagerId = req.directManagerId;
    const directManagerUid = (req as any).directManagerUid;
    const directSupervisorUid = (req as any).directSupervisorUid;
    const approvalTargetUid = (req as any).approvalTargetUid;
    const currentApproverUid = (req as any).currentApproverUid;
    const approverIds = [
      managerId,
      managerUid,
      directManagerId,
      directManagerUid,
      directSupervisorUid,
      approvalTargetUid,
      currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);

    return approverIds.includes(userUid);
  };

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case "division_manager":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "management":
        return "bg-slate-500/10 border-slate-500/20 text-slate-300";
      default:
        return "bg-slate-700/10 border-slate-750 text-slate-400";
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case "division_manager":
        return "Manager Divisi";
      case "management":
        return "Direktur / Manajemen";
      default:
        return "Staff";
    }
  };

  // 1. Fetch leave requests (filtered client-side to ensure all fallback manager fields work)
  const managerRequestsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"));
  }, [userProfile?.uid, firestore]);

  const {
    data: requests,
    isLoading: isLoadingRequests,
    mutate: mutateRequests,
  } = useCollection<LeaveRequest>(managerRequestsQuery);

  // 2. Strict Relationship Gating:
  // Only display requests matching the manager's UID directly across any field
  const filteredRequests = useMemo(() => {
    if (!requests || !currentUserUid) return [];

    return requests.filter((r) => {
      if (isSelfRequest(r)) return false;

      if (isDirectorMode) {
        return isDirectorRequest(r);
      }

      return isAssignedManager(r) && !isDivisionManagerRequest(r);
    });
  }, [requests, currentUserUid, isDirectorMode]);

  const availableBrandOptions = useMemo(() => {
    return Array.from(new Set(filteredRequests.map((r) => r.brandName))).sort();
  }, [filteredRequests]);

  const availableDivisionOptions = useMemo(() => {
    return Array.from(
      new Set(filteredRequests.map((r) => r.divisionName)),
    ).sort();
  }, [filteredRequests]);

  const availableYearOptions = useMemo(() => {
    const years = new Set<number>();
    filteredRequests.forEach((r) => {
      const year =
        r.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredRequests]);

  const getStatusCategory = (status: string) => {
    if (isPendingStatus(status)) return "pending";
    if (status.includes("rejected")) return "rejected";
    if (status.includes("revision")) return "revision";
    if (status.includes("approved")) return "approved";
    return status;
  };

  const visibleRequests = useMemo(() => {
    return filteredRequests.filter((r) => {
      if (brandFilter !== "all" && r.brandName !== brandFilter) return false;
      if (divisionFilter !== "all" && r.divisionName !== divisionFilter)
        return false;
      if (
        managerNameFilter &&
        !((r as any).managerName || r.managerName || "")
          .toLowerCase()
          .includes(managerNameFilter.toLowerCase())
      ) {
        return false;
      }
      if (leaveTypeFilter !== "all" && r.leaveType !== leaveTypeFilter)
        return false;
      if (
        statusFilter !== "all" &&
        getStatusCategory(r.status) !== statusFilter
      )
        return false;

      if (monthFilter !== "all" || yearFilter !== "all") {
        const createdAt = r.createdAt?.toDate?.();
        if (!createdAt) return false;
        if (
          monthFilter !== "all" &&
          createdAt.getMonth() + 1 !== Number(monthFilter)
        )
          return false;
        if (
          yearFilter !== "all" &&
          createdAt.getFullYear() !== Number(yearFilter)
        )
          return false;
      }

      if (
        searchTerm &&
        ![
          r.employeeName,
          r.brandName,
          r.divisionName,
          (r as any).managerName || r.managerName || "",
          r.leaveType,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [
    filteredRequests,
    brandFilter,
    divisionFilter,
    managerNameFilter,
    leaveTypeFilter,
    statusFilter,
    monthFilter,
    yearFilter,
    searchTerm,
  ]);

  const activeRequests = useMemo(() => {
    return visibleRequests.filter((r) =>
      isPendingForCurrentApprover(r, currentUserUid),
    );
  }, [visibleRequests, currentUserUid]);

  const hasInvalidApproverPending = useMemo(() => {
    return filteredRequests.some(
      (r) => isPendingStatus(r.status) && !getApproverUids(r).length,
    );
  }, [filteredRequests]);

  const historyRequests = useMemo(() => {
    return visibleRequests
      .filter((r) => !isPendingStatus(r.status))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return bTime - aTime;
      });
  }, [visibleRequests]);

  // Helpers for exact formatting
  const formatSubmissionDate = (req: LeaveRequest) => {
    try {
      const date = req.createdAt ? req.createdAt.toDate() : new Date();
      return format(date, "EEEE, dd MMMM yyyy 'pukul' HH:mm", {
        locale: idLocale,
      });
    } catch {
      return req.submittedAtStr || "-";
    }
  };

  const getSubmissionDateParts = (req: LeaveRequest) => {
    try {
      const date = req.createdAt ? req.createdAt.toDate() : new Date();
      return {
        day: format(date, "EEEE, dd MMMM yyyy", { locale: idLocale }),
        time: format(date, "'pukul' HH:mm", { locale: idLocale }),
      };
    } catch {
      return {
        day: req.submittedAtStr || "-",
        time: "",
      };
    }
  };

  const formatPeriodDate = (req: LeaveRequest) => {
    try {
      const start = req.startDate.toDate();
      const end = req.endDate.toDate();
      return `${format(start, "EEEE, dd MMMM yyyy", { locale: idLocale })} – ${format(end, "EEEE, dd MMMM yyyy", { locale: idLocale })}`;
    } catch {
      return "-";
    }
  };

  const getPeriodDateParts = (req: LeaveRequest) => {
    try {
      const start = req.startDate.toDate();
      const end = req.endDate.toDate();
      return {
        start: format(start, "EEEE, dd MMMM yyyy", { locale: idLocale }),
        end: format(end, "EEEE, dd MMMM yyyy", { locale: idLocale }),
      };
    } catch {
      return {
        start: "-",
        end: "-",
      };
    }
  };

  const formatDuration = (req: LeaveRequest) => {
    return `${req.durationDays} hari kerja`;
  };

  const getOperationalImpact = (req: LeaveRequest) => {
    const replacementName = req.handoverEmployeeName?.trim();
    const replacementPosition = req.handoverEmployeePosition?.trim();
    const handoverNotes = req.handoverNotes?.trim();

    if (!replacementName) {
      return {
        status: "Risiko Tinggi",
        description: "Belum ada pengganti sementara.",
      };
    }

    if (replacementName && replacementPosition && handoverNotes) {
      return {
        status: "Aman",
        description: "Delegasi dan handover sudah lengkap.",
      };
    }

    return {
      status: "Perlu Dicek",
      description: "Data pengganti atau handover belum lengkap.",
    };
  };

  const getOperationalImpactBadgeClass = (impact: string) => {
    switch (impact) {
      case "Aman":
        return "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400";
      case "Perlu Dicek":
        return "bg-amber-500/10 border border-amber-500/20 text-amber-400";
      case "Risiko Tinggi":
      default:
        return "bg-red-500/10 border border-red-500/20 text-red-400";
    }
  };

  const getTimelineApproverName = (req: LeaveRequest) => {
    return (
      (req as any).directSupervisorName ||
      (req as any).approvalTargetName ||
      req.managerName ||
      "Atasan"
    );
  };

  const getTimelineStepState = (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => {
    const status = req.status;

    if (step === "approval") {
      if (
        [
          "pending_manager",
          "pending_manager_review",
          "pending_director",
          "pending_director_review",
          "pending_supervisor",
          "menunggu_approval_atasan",
          "waiting_manager_approval",
          "waiting_director_approval",
        ].includes(status)
      ) {
        return "current";
      }
      if (["rejected_by_manager", "rejected_by_director"].includes(status)) {
        return "rejected";
      }
      if (
        [
          "revision_requested",
          "revision_requested_by_manager",
          "revision_requested_by_director",
        ].includes(status)
      ) {
        return "revision";
      }
      if (
        [
          "approved_by_manager",
          "approved_by_director",
          "pending_hrd",
          "pending_hrd_review",
          "approved_by_hrd",
          "active_leave",
          "completed",
        ].includes(status)
      ) {
        return "completed";
      }
      return "waiting";
    }

    if (step === "hrd") {
      if (["pending_hrd", "pending_hrd_review"].includes(status)) {
        return "current";
      }
      if (status === "rejected_by_hrd") {
        return "rejected";
      }
      if (status === "revision_requested_by_hrd") {
        return "revision";
      }
      if (["approved_by_hrd", "active_leave", "completed"].includes(status)) {
        return "completed";
      }
      return "waiting";
    }

    if (step === "realization") {
      if (status === "active_leave") return "current";
      if (status === "completed") return "completed";
      return "waiting";
    }

    return "waiting";
  };

  const getTimelineStepDetail = (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => {
    const status = req.status;
    const approverName = getTimelineApproverName(req);
    const decisionTime = req.updatedAt?.toDate
      ? format(req.updatedAt.toDate(), "dd MMM yyyy 'pukul' HH:mm", {
          locale: idLocale,
        })
      : "-";
    const managerNote =
      (req as any).managerNotes ||
      (req as any).directorNotes ||
      (req as any).notes ||
      "";

    if (step === "approval") {
      if (
        [
          "pending_manager",
          "pending_manager_review",
          "pending_director",
          "pending_director_review",
          "pending_supervisor",
          "menunggu_approval_atasan",
          "waiting_manager_approval",
          "waiting_director_approval",
        ].includes(status)
      ) {
        return `Menunggu persetujuan ${approverName}`;
      }
      if (
        status === "rejected_by_manager" ||
        status === "rejected_by_director"
      ) {
        return `Ditolak oleh ${approverName} pada ${decisionTime}${managerNote ? ` — ${managerNote}` : ""}`;
      }
      if (
        [
          "revision_requested",
          "revision_requested_by_manager",
          "revision_requested_by_director",
        ].includes(status)
      ) {
        return `Revisi diminta oleh ${approverName} pada ${decisionTime}${managerNote ? ` — ${managerNote}` : ""}`;
      }
      if (
        [
          "approved_by_manager",
          "approved_by_director",
          "pending_hrd",
          "pending_hrd_review",
          "approved_by_hrd",
          "active_leave",
          "completed",
        ].includes(status)
      ) {
        return `Disetujui oleh ${approverName}`;
      }
      return `Menunggu persetujuan ${approverName}`;
    }

    if (step === "hrd") {
      if (["pending_hrd", "pending_hrd_review"].includes(status)) {
        return "Menunggu Verifikasi HRD";
      }
      if (status === "rejected_by_hrd") {
        return `Ditolak HRD pada ${decisionTime}`;
      }
      if (status === "revision_requested_by_hrd") {
        return `Revisi HRD diminta pada ${decisionTime}`;
      }
      if (["approved_by_hrd", "active_leave", "completed"].includes(status)) {
        return `Disetujui HRD pada ${decisionTime}`;
      }
      return "Menunggu proses HRD";
    }

    if (step === "realization") {
      if (status === "active_leave") {
        return `Cuti sedang berlangsung sejak ${formatPeriodDate(req)}`;
      }
      if (status === "completed") {
        return `Cuti selesai setelah periode ${formatPeriodDate(req)}`;
      }
      return "Menunggu realisasi cuti";
    }

    return "";
  };

  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const handleOpenAction = (
    type: "approve" | "reject" | "revise",
    req: LeaveRequest,
  ) => {
    if (req.employeeId === userProfile?.uid) {
      toast({
        variant: "destructive",
        title: "Aksi Tidak Diizinkan",
        description: "Anda tidak dapat memproses pengajuan milik sendiri.",
      });
      return;
    }

    if ((req as any).approvalTargetUid === req.employeeId) {
      toast({
        variant: "destructive",
        title: "Aksi Tidak Diizinkan",
        description:
          "Pengajuan ini memiliki target approval yang sama dengan pemohon dan tidak dapat diproses.",
      });
      return;
    }

    if (req.status === "pending_hrd" || req.status === "pending_hrd_review") {
      toast({
        variant: "destructive",
        title: "Sudah Diproses",
        description: isDirectorMode
          ? "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Direktur."
          : "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Manager.",
      });
      return;
    }

    if (!isActionEnabledForRole(req)) {
      toast({
        variant: "destructive",
        title: "Aksi Tidak Diizinkan",
        description: isDirectorMode
          ? "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Direktur."
          : "Pengajuan ini tidak berada dalam status pending yang dapat Anda proses.",
      });
      return;
    }

    setSelectedRequest(req);
    setActionType(type);
    setNotes("");
    setIsActionOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !actionType || !userProfile || !firestore) return;

    const currentUser = userProfile;
    const req = selectedRequest as any;

    // 1. Self approval validation check
    const isSelfApproval = currentUser.uid === req.employeeUid || currentUser.uid === req.employeeId;
    if (isSelfApproval) {
      toast({
        variant: "destructive",
        title: "Self-approval blocked",
        description: "Anda tidak dapat menyetujui pengajuan Anda sendiri.",
      });
      return;
    }

    // Role check / structural level of the requester
    const requesterStructuralLevel = String(
      req.requesterStructuralPosition ||
      req.structuralLevel ||
      ""
    ).toLowerCase();

    const isDivisionManagerRequest =
      requesterStructuralLevel.includes("manager") ||
      req.approvalFlowType === "manager_to_director_to_hrd" ||
      req.approvalLevel === "manager_to_director";

    const currentApproverUid = req.currentApproverUid || null;
    const approvalTargetUid = req.approvalTargetUid || null;
    const directorUid = req.directorUid || null;
    const directorId = req.directorId || null;
    const directorName = req.directorName || "";
    const directSupervisorUid = req.directSupervisorUid || null;

    // 1 & 2. Block legacy/incomplete requests from being approved directly
    const isLegacyRequestMissingApprover =
      isDivisionManagerRequest &&
      !currentApproverUid &&
      !approvalTargetUid &&
      !directorUid &&
      !directorId &&
      !directSupervisorUid;

    if (isLegacyRequestMissingApprover) {
      toast({
        variant: "destructive",
        title: "Migrasi Diperlukan",
        description: "Pengajuan lama ini belum memiliki approver Direktur. HRD/Super Admin perlu memigrasi data approver terlebih dahulu.",
      });
      return;
    }

    // 2. Strict UID validation (do not allow role bypass!)
    const allowedUids = [
      currentApproverUid,
      approvalTargetUid,
      directorUid,
      directorId,
      directSupervisorUid,
      // For staff requests, include directManagerUid / directManagerId / managerId / managerUid
      ...(!isDivisionManagerRequest ? [
        req.directManagerUid,
        req.directManagerId,
        req.managerUid,
        req.managerId,
      ] : [])
    ]
      .filter(Boolean)
      .map(String);

    const isAssigned = allowedUids.includes(currentUser.uid);

    if (!isAssigned) {
      toast({
        variant: "destructive",
        title: "Akses Ditolak",
        description: `UID akun Anda (${currentUser.uid}) belum tercatat sebagai approver untuk pengajuan ini. Hubungi HRD untuk mendaftarkan Anda sebagai atasan/direktur yang sah.`,
      });
      return;
    }

    if (
      (actionType === "reject" || actionType === "revise") &&
      notes.trim().length < 5
    ) {
      toast({
        variant: "destructive",
        title: "Keterangan Wajib Diisi",
        description: "Harap masukkan keterangan/alasan minimal 5 karakter.",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (!isActionEnabledForRole(selectedRequest)) {
        toast({
          variant: "destructive",
          title: "Gagal Memproses",
          description: isDirectorMode
            ? "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Direktur."
            : "Pengajuan ini tidak berada dalam status pending yang dapat Anda proses.",
        });
        setIsActionOpen(false);
        setIsDetailOpen(false);
        return;
      }

      let payload: any = {};
      let notificationType: any = "manager_approval";

      const displayNameOrEmail = (currentUser as any).displayName || currentUser.email || currentUser.fullName || "Direktur/Manajemen";

      if (isDivisionManagerRequest) {
        if (actionType === "approve") {
          payload = {
            status: "pending_hrd",
            directorDecision: "approved",
            directorReviewedAt: serverTimestamp(),
            directorReviewedBy: currentUser.uid,
            directorReviewedByName: (currentUser as any).displayName || currentUser.email,
            directorNotes: notes || "",
            currentApprovalStep: "hrd",
            currentApproverUid: null,
            approvalTargetUid: null,
            updatedAt: serverTimestamp(),
            
            // Compatibility manager fields
            managerDecision: "approved",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: (currentUser as any).displayName || currentUser.email,
          };
          notificationType = "director_approval";
        } else if (actionType === "reject") {
          payload = {
            status: "rejected_by_director",
            directorDecision: "rejected",
            directorReviewedAt: serverTimestamp(),
            directorReviewedBy: currentUser.uid,
            directorReviewedByName: (currentUser as any).displayName || currentUser.email,
            directorNotes: notes,
            updatedAt: serverTimestamp(),

            // Compatibility manager fields
            managerDecision: "rejected",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: (currentUser as any).displayName || currentUser.email,
            managerNotes: notes,
          };
          notificationType = "director_rejection";
        } else if (actionType === "revise") {
          payload = {
            status: "revision_requested_by_director",
            directorDecision: "revision_requested",
            directorReviewedAt: serverTimestamp(),
            directorReviewedBy: currentUser.uid,
            directorReviewedByName: (currentUser as any).displayName || currentUser.email,
            directorNotes: notes,
            updatedAt: serverTimestamp(),

            // Compatibility manager fields
            managerDecision: "revision_requested",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: (currentUser as any).displayName || currentUser.email,
            managerNotes: notes,
          };
          notificationType = "director_revision";
        }
      } else {
        if (actionType === "approve") {
          payload = {
            status: "pending_hrd",
            managerDecision: "approved",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: displayNameOrEmail,
            managerNotes: notes || "",
            currentApprovalStep: "hrd",
            updatedAt: serverTimestamp(),
          };
          notificationType = "manager_approval";
        } else if (actionType === "reject") {
          payload = {
            status: "rejected_by_manager",
            managerDecision: "rejected",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: displayNameOrEmail,
            managerNotes: notes,
            updatedAt: serverTimestamp(),
          };
          notificationType = "manager_rejection";
        } else if (actionType === "revise") {
          payload = {
            status: "revision_requested",
            managerDecision: "revision_requested",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: displayNameOrEmail,
            managerNotes: notes,
            updatedAt: serverTimestamp(),
          };
          notificationType = "manager_revision";
        }
      }

      // 7. Debug log before update
      console.log("APPROVE DIRECTOR LEAVE", {
        requestId: selectedRequest.id,
        currentUserUid: currentUser.uid,
        currentUserRole: currentUser.role || "",
        employeeUid: (selectedRequest as any).employeeUid || selectedRequest.employeeId,
        statusBefore: selectedRequest.status,
        approvalFlowType: req.approvalFlowType || "",
        currentApprovalStep: req.currentApprovalStep || "",
        currentApproverUid: currentApproverUid || "",
        approvalTargetUid: approvalTargetUid || "",
        directorUid: directorUid || "",
        directorId: directorId || "",
        directSupervisorUid: directSupervisorUid || "",
        payload
      });

      const reqRef = doc(firestore, "leave_requests", selectedRequest.id!);
      await updateDoc(reqRef, payload);
      console.log("Approve success");

      try {
        await sendLeaveNotification(firestore, notificationType, {
          employeeId: selectedRequest.employeeId,
          employeeName: selectedRequest.employeeName,
          managerId: currentUser.uid,
          managerName: displayNameOrEmail,
          startDate: selectedRequest.startDate,
          endDate: selectedRequest.endDate,
          notes: actionType === "revise" ? notes : undefined,
          reason: actionType === "reject" ? notes : undefined,
          requestId: selectedRequest.id!,
        });
      } catch (notifErr: any) {
        console.error("Failed to send separate notification:", notifErr);
      }

      toast({
        title:
          actionType === "approve"
            ? "Persetujuan Dikirim"
            : actionType === "reject"
              ? "Pengajuan Ditolak"
              : "Permintaan Revisi Dikirim",
        description:
          actionType === "approve"
            ? "Pengajuan cuti berhasil disetujui dan diteruskan ke HRD."
            : `Pengajuan cuti ${selectedRequest.employeeName} berhasil diproses.`,
      });

      // Update state locally first for immediate responsiveness
      setSelectedRequest({
        ...selectedRequest,
        status: payload.status || "pending_hrd",
        currentApprovalStep: payload.currentApprovalStep || "hrd",
        currentApproverUid: payload.currentApproverUid !== undefined ? payload.currentApproverUid : null,
        approvalTargetUid: payload.approvalTargetUid !== undefined ? payload.approvalTargetUid : null,
      } as any);

      setIsActionOpen(false);
      setIsDetailOpen(false);
      mutateRequests();
    } catch (e: any) {
      console.error("Error matching director approval update leave request:", e);
      toast({
        variant: "destructive",
        title: "Gagal Memproses",
        description: "Gagal menyetujui pengajuan cuti. Periksa rules atau data approver.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
      case "approved_by_hrd":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "active_leave":
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case "completed":
        return "bg-slate-500/10 border-slate-700 text-slate-400";
      case "cancelled":
        return "bg-gray-500/10 border-gray-700 text-gray-400";
      case "rejected_by_manager":
      case "rejected_by_director":
      case "rejected_by_hrd":
        return "bg-red-500/10 border-red-500/20 text-red-400";
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_director":
      case "revision_requested_by_hrd":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      case "pending_manager":
      case "pending_manager_review":
      case "pending_director":
      case "pending_director_review":
      case "pending_supervisor":
      case "menunggu_approval_atasan":
      case "waiting_manager_approval":
      case "waiting_director_approval":
      case "pending_hrd":
      case "pending_hrd_review":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      default:
        return "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400";
    }
  };

  const getStatusLabel = (status: string) => {
    if (isDirectorMode && isPendingStatus(status)) {
      return "Menunggu Persetujuan Direktur";
    }

    switch (status) {
      case "pending_manager":
      case "pending_manager_review":
        return "Menunggu Persetujuan Manager Divisi";
      case "pending_director":
      case "pending_director_review":
        return "Menunggu Persetujuan Direktur";
      case "pending_supervisor":
        return "Menunggu Persetujuan Atasan";
      case "menunggu_approval_atasan":
        return "Menunggu Persetujuan Atasan (Mandor)";
      case "waiting_manager_approval":
        return "Menunggu Persetujuan Manager";
      case "waiting_director_approval":
        return "Menunggu Persetujuan Direktur";
      case "revision_requested":
      case "revision_requested_by_manager":
        return "Perlu Revisi (Atasan)";
      case "revision_requested_by_director":
        return "Perlu Revisi (Direktur)";
      case "rejected_by_manager":
        return "Ditolak Atasan";
      case "rejected_by_director":
        return "Ditolak Direktur";
      case "pending_hrd":
      case "pending_hrd_review":
        return "Menunggu Verifikasi HRD";
      case "revision_requested_by_hrd":
        return "Perlu Revisi (HRD)";
      case "rejected_by_hrd":
        return "Ditolak HRD";
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

  const currentDate = new Date();
  const thisMonth = currentDate.getMonth() + 1;
  const thisYear = currentDate.getFullYear();

  const managerDivisionLeavesThisMonth = visibleRequests.filter((r) => {
    if (!isDivisionManagerRequest(r)) return false;
    const createdAt = r.createdAt?.toDate?.();
    return (
      createdAt &&
      createdAt.getMonth() + 1 === thisMonth &&
      createdAt.getFullYear() === thisYear
    );
  }).length;

  const affectedDivisionCount = new Set(
    visibleRequests.map((r) => r.divisionName || "").filter(Boolean),
  ).size;

  const activeLeaveTodayCount = visibleRequests.filter((r) => {
    const start = r.startDate?.toDate?.();
    const end = r.endDate?.toDate?.();
    const today = new Date();
    return (
      start &&
      end &&
      start <= today &&
      end >= today &&
      r.status === "active_leave"
    );
  }).length;

  const operationalAttentionCount = visibleRequests.filter(
    (r) =>
      !Boolean(r.handoverEmployeeName?.trim()) ||
      !Boolean(r.handoverNotes?.trim()) ||
      !Boolean(r.emergencyContactName?.trim()),
  ).length;

  return (
    <DashboardLayout pageTitle={pageTitle} menuConfig={undefined}>
      <div className="w-full space-y-6 px-4 md:px-8 max-w-[1600px] mx-auto text-slate-100 pb-10">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-950/30 rounded-2xl border border-indigo-900/30 shadow-sm">
              <CalendarOff className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {pageTitle}
              </h1>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                {pageSubtitle}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className="rounded-2xl border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
          >
            {isFilterOpen ? "Tutup Filter" : "Buka Filter"}
          </Button>
        </div>

        {/* Filters Section (Collapsible) */}
        {isFilterOpen && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 p-5 bg-slate-950 rounded-2xl border border-slate-800 animate-in fade-in duration-200">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Brand
              </label>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Brand</option>
                {availableBrandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Divisi
              </label>
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Divisi</option>
                {availableDivisionOptions.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Nama Manager Divisi
              </label>
              <input
                type="text"
                value={managerNameFilter}
                onChange={(e) => setManagerNameFilter(e.target.value)}
                placeholder="Cari nama manager"
                className={filterInputClass}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Jenis Cuti
              </label>
              <select
                value={leaveTypeFilter}
                onChange={(e) => setLeaveTypeFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Jenis</option>
                <option value="tahunan">Tahunan</option>
                <option value="besar">Besar</option>
                <option value="menikah">Menikah</option>
                <option value="melahirkan">Melahirkan</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
                <option value="revision">Revisi</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Bulan
              </label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Bulan</option>
                {[...Array(12)].map((_, idx) => {
                  const month = idx + 1;
                  return (
                    <option key={month} value={String(month)}>
                      {String(month).padStart(2, "0")}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Tahun
              </label>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Tahun</option>
                {availableYearOptions.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2 md:col-span-3 lg:col-span-4">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Cari
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama, brand, divisi, atau jenis cuti..."
                className={filterInputClass}
              />
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {isDirectorMode && (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5 w-full">
            {[
              {
                title: "Menunggu Persetujuan Direktur",
                value: activeRequests.length,
              },
              {
                title: "Manager Divisi Cuti Bulan Ini",
                value: managerDivisionLeavesThisMonth,
              },
              {
                title: "Divisi Terdampak",
                value: affectedDivisionCount,
              },
              {
                title: "Cuti Cuti Aktif Hari Ini",
                value: activeLeaveTodayCount,
              },
              {
                title: "Perlu Perhatian Operasional",
                value: operationalAttentionCount,
              },
            ].map((item) => (
              <Card
                key={item.title}
                className="rounded-2xl border border-slate-800 bg-slate-950 shadow-sm"
              >
                <CardContent className="p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    {item.title}
                  </p>
                  <p className="text-2xl font-black text-white">
                    {item.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 1. ACTIVE REQUESTS CARD */}
        <Card className="border-slate-850 bg-slate-950 shadow-md rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-800 pb-4 bg-slate-900/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                {isDirectorMode
                  ? "Menunggu Persetujuan Direktur"
                  : "Menunggu Persetujuan Anda"}
                <Badge className="bg-indigo-600 hover:bg-indigo-650 text-white font-black text-xs rounded-full px-2.5 py-0.5">
                  {activeRequests.length}
                </Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 bg-slate-950">
            {/* Desktop Readable Table */}
            <div className="hidden md:block overflow-x-auto w-full">
              <Table className="w-full min-w-[1200px] border-collapse bg-slate-950">
                <TableHeader className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
                  <TableRow className="border-b border-slate-800 hover:bg-slate-900">
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Pengaju
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Unit Kerja
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Jenis Cuti
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Tanggal Pengajuan
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Periode Cuti
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Durasi
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Pengganti Sementara
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Dampak Operasional
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Status
                    </TableHead>
                    <TableHead className="px-5 py-4 text-right font-bold text-slate-300 text-sm">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRequests.length > 0 ? (
                    activeRequests.map((r) => {
                      const impact = getOperationalImpact(r);
                      const subDate = getSubmissionDateParts(r);
                      const period = getPeriodDateParts(r);
                      return (
                        <TableRow
                          key={r.id}
                          className="hover:bg-slate-900/40 transition-colors border-b border-slate-800/80"
                        >
                          <TableCell className="px-5 py-4 align-top text-sm">
                            <div className="space-y-1">
                              <span className="text-slate-100 font-bold block">
                                {r.employeeName}
                              </span>
                              <Badge
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getLevelBadgeClass(
                                  getRequesterLevel(r),
                                )}`}
                              >
                                {getLevelLabel(getRequesterLevel(r))}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm font-semibold text-slate-300">
                            <div className="space-y-0.5">
                              <p className="text-slate-100">{r.brandName || "-"}</p>
                              <p className="text-slate-400 text-xs">{r.divisionName || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm font-bold text-indigo-400 capitalize">
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
                          <TableCell className="px-5 py-4 align-top text-sm text-slate-300">
                            <p className="font-semibold text-slate-200">{subDate.day}</p>
                            {subDate.time && (
                              <p className="text-slate-500 text-xs mt-0.5">{subDate.time}</p>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm text-slate-300">
                            <p className="font-semibold text-slate-200">{period.start}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{period.end}</p>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top font-bold text-slate-200 text-sm">
                            {formatDuration(r)}
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm text-slate-300">
                            <p className="font-bold text-slate-250">{r.handoverEmployeeName || "-"}</p>
                            {r.handoverEmployeePosition && (
                              <p className="text-slate-450 text-xs mt-0.5">{r.handoverEmployeePosition}</p>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getOperationalImpactBadgeClass(
                                impact.status,
                              )}`}
                            >
                              {impact.status}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                            >
                              {getStatusLabel(r.status)}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(r)}
                                className="rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs gap-1"
                              >
                                <Eye className="h-3.5 w-3.5" /> Tinjau
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenAction("approve", r)}
                                disabled={isSaving || !isActionEnabledForRole(r)}
                                className="rounded-xl border-emerald-500/20 hover:bg-emerald-950/20 text-emerald-400 font-bold text-xs"
                              >
                                Setujui
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenAction("reject", r)}
                                disabled={isSaving || !isActionEnabledForRole(r)}
                                className="rounded-xl border-red-500/20 hover:bg-red-950/20 text-red-400 font-bold text-xs"
                              >
                                Tolak
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenAction("revise", r)}
                                disabled={isSaving || !isActionEnabledForRole(r)}
                                className="rounded-xl border-amber-500/20 hover:bg-amber-950/20 text-amber-400 font-bold text-xs"
                              >
                                Revisi
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={10}
                        className="h-44 text-center text-slate-500"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="h-10 w-10 text-slate-600 opacity-40" />
                          <p className="text-sm font-bold">
                            Tidak ada pengajuan pending yang perlu diproses saat ini.
                          </p>
                          {hasInvalidApproverPending && (
                            <p className="text-xs text-amber-450 mt-2">
                              Pengajuan belum memiliki approver valid. Cek data atasan langsung.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List (Active) */}
            <div className="block md:hidden space-y-4 px-4 py-4 bg-slate-900/20">
              {activeRequests.length > 0 ? (
                activeRequests.map((r) => {
                  const impact = getOperationalImpact(r);
                  return (
                    <div
                      key={r.id}
                      className="p-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-sm space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-slate-100 text-base">
                            {r.employeeName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            {r.divisionName || "N/A"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                        >
                          {getStatusLabel(r.status)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs py-3 border-y border-slate-800">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                            Jenis Cuti
                          </span>
                          <span className="font-black text-indigo-400 capitalize">
                            {r.leaveType === "tahunan"
                              ? "Cuti Tahunan"
                              : r.leaveType === "besar"
                                ? "Cuti Besar"
                                : r.leaveType === "menikah"
                                  ? "Cuti Menikah"
                                  : r.leaveType === "melahirkan"
                                    ? "Cuti Melahirkan"
                                    : "Cuti Tahunan"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                            Durasi
                          </span>
                          <span className="font-bold text-slate-200">
                            {formatDuration(r)}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                            Periode Cuti
                          </span>
                          <span className="font-semibold text-slate-300">
                            {formatPeriodDate(r)}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                            Dampak Operasional
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getOperationalImpactBadgeClass(
                              impact.status,
                            )}`}
                          >
                            {impact.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(r)}
                          className="rounded-xl flex items-center gap-2 justify-center font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2"
                        >
                          <Eye className="h-3.5 w-3.5" /> Tinjau
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAction("approve", r)}
                            disabled={isSaving || !isActionEnabledForRole(r)}
                            className="rounded-xl border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/20 font-bold text-xs"
                          >
                            Setujui
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAction("reject", r)}
                            disabled={isSaving || !isActionEnabledForRole(r)}
                            className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-950/20 font-bold text-xs"
                          >
                            Tolak
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle2 className="h-8 w-8 text-slate-650 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold">
                    Tidak ada pengajuan pending yang perlu diproses saat ini.
                  </p>
                  {hasInvalidApproverPending && (
                    <p className="text-[11px] mt-2 text-amber-450">
                      Pengajuan belum memiliki approver valid. Cek data atasan langsung.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. HISTORY REQUESTS CARD */}
        <Card className="border-slate-850 bg-slate-950 shadow-md rounded-2xl overflow-hidden mt-6">
          <CardHeader className="border-b border-slate-800 pb-4 bg-slate-900/50">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              {isDirectorMode
                ? "Riwayat Keputusan Cuti Manager Divisi"
                : "Riwayat Keputusan Cuti Tim"}
              <Badge className="bg-slate-800 text-slate-300 border border-slate-700 font-black text-xs rounded-full px-2.5 py-0.5">
                {historyRequests.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 bg-slate-950">
            {/* Desktop History Table */}
            <div className="hidden md:block overflow-x-auto w-full">
              <Table className="w-full min-w-[1200px] border-collapse bg-slate-950">
                <TableHeader className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
                  <TableRow className="border-b border-slate-800 hover:bg-slate-900">
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Pengaju
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Unit Kerja
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Jenis Cuti
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Tanggal Pengajuan
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Periode Cuti
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Durasi
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Pengganti Sementara
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Dampak Operasional
                    </TableHead>
                    <TableHead className="px-5 py-4 text-left font-bold text-slate-300 text-sm">
                      Status
                    </TableHead>
                    <TableHead className="px-5 py-4 text-right font-bold text-slate-300 text-sm">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRequests.length > 0 ? (
                    historyRequests.map((r) => {
                      const impact = getOperationalImpact(r);
                      const subDate = getSubmissionDateParts(r);
                      const period = getPeriodDateParts(r);
                      return (
                        <TableRow
                          key={r.id}
                          className="hover:bg-slate-900/40 transition-colors border-b border-slate-800/80"
                        >
                          <TableCell className="px-5 py-4 align-top text-sm">
                            <div className="space-y-1">
                              <span className="text-slate-100 font-bold block">
                                {r.employeeName}
                              </span>
                              <Badge
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getLevelBadgeClass(
                                  getRequesterLevel(r),
                                )}`}
                              >
                                {getLevelLabel(getRequesterLevel(r))}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm font-semibold text-slate-300">
                            <div className="space-y-0.5">
                              <p className="text-slate-100">{r.brandName || "-"}</p>
                              <p className="text-slate-400 text-xs">{r.divisionName || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm font-bold text-indigo-400 capitalize">
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
                          <TableCell className="px-5 py-4 align-top text-sm text-slate-300">
                            <p className="font-semibold text-slate-200">{subDate.day}</p>
                            {subDate.time && (
                              <p className="text-slate-500 text-xs mt-0.5">{subDate.time}</p>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm text-slate-300">
                            <p className="font-semibold text-slate-200">{period.start}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{period.end}</p>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top font-bold text-slate-200 text-sm">
                            {formatDuration(r)}
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-sm text-slate-300">
                            <p className="font-bold text-slate-250">{r.handoverEmployeeName || "-"}</p>
                            {r.handoverEmployeePosition && (
                              <p className="text-slate-455 text-xs mt-0.5">{r.handoverEmployeePosition}</p>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getOperationalImpactBadgeClass(
                                impact.status,
                              )}`}
                            >
                              {impact.status}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                            >
                              {getStatusLabel(r.status)}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4 align-top text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(r)}
                              className="rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" /> Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={10}
                        className="h-28 text-center text-slate-500"
                      >
                        Belum ada riwayat keputusan cuti yang diproses.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List (History) */}
            <div className="block md:hidden space-y-4 px-4 py-4 bg-slate-900/20">
              {historyRequests.length > 0 ? (
                historyRequests.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-sm space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-slate-100 text-base">
                          {r.employeeName}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          {r.divisionName || "N/A"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                      >
                        {getStatusLabel(r.status)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs py-3 border-y border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          Jenis Cuti
                        </span>
                        <span className="font-black text-indigo-400 capitalize">
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
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          Durasi
                        </span>
                        <span className="font-bold text-slate-200">
                          {formatDuration(r)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          Periode Cuti
                        </span>
                        <span className="font-semibold text-slate-300">
                          {formatPeriodDate(r)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(r)}
                        className="rounded-xl flex items-center gap-1 font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2"
                      >
                        <Eye className="h-3.5 w-3.5" /> Detail
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-500">
                  Belum ada riwayat keputusan cuti yang diproses.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DETAIL MODAL (Rendered using React Portal to document.body) */}
      <LeaveDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        request={selectedRequest}
        currentUserUid={currentUserUid}
        isPendingForCurrentApprover={isPendingForCurrentApprover}
        onAction={handleOpenAction}
        formatSubmissionDate={formatSubmissionDate}
        formatPeriodDate={formatPeriodDate}
        formatDuration={formatDuration}
        getRequesterLevel={getRequesterLevel}
        getLevelBadgeClass={getLevelBadgeClass}
        getLevelLabel={getLevelLabel}
        getStatusBadgeClass={getStatusBadgeClass}
        getStatusLabel={getStatusLabel}
        getTimelineStepState={getTimelineStepState}
        getTimelineStepDetail={getTimelineStepDetail}
      />

      {/* ACTION CONFIRMATION DIALOG (Approve/Reject/Revise) */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl my-auto top-[50%] translate-y-[-50%] p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-black text-slate-50">
              {actionType === "approve"
                ? "Setujui Pengajuan Cuti"
                : actionType === "reject"
                  ? "Tolak Pengajuan Cuti"
                  : "Minta Revisi Pengajuan"}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-400 mt-1">
              {actionType === "approve"
                ? "Apakah Anda yakin ingin menyetujui pengajuan cuti ini?"
                : actionType === "reject"
                  ? "Harap berikan alasan penolakan di bawah ini. Alasan penolakan ini wajib diisi oleh Manager."
                  : "Harap berikan catatan revisi di bawah ini."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <Textarea
              rows={3}
              placeholder={
                actionType === "approve"
                  ? "Catatan persetujuan (opsional)..."
                  : "Keterangan/alasan (wajib, minimal 5 karakter)..."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsActionOpen(false)}
              className="rounded-xl font-bold hover:bg-slate-800 text-slate-400 hover:text-slate-100"
            >
              Batal
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={isSaving}
              className={`font-bold rounded-xl px-5 ${
                actionType === "approve"
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : actionType === "reject"
                    ? "bg-red-650 hover:bg-red-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
              }`}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Proses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
