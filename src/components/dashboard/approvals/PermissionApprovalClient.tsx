"use client";

import { useState, useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { PermissionRequest, Brand, EmployeeProfile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Search,
  Paperclip,
  FileText,
  SortAsc,
  SortDesc,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  startOfMonth,
  differenceInCalendarDays,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { KpiCard } from "@/components/recruitment/KpiCard";
import { isFinalStatus } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { PermissionStatusBadge } from "@/components/dashboard/karyawan/PermissionStatusBadge";
import { ReviewPermissionDialog } from "./ReviewPermissionDialog";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ManagerTab =
  | "action_needed"
  | "approved_by_me"
  | "rejected_by_me"
  | "revision_by_me"
  | "all";

// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<string, string> = {
  tidak_masuk: "Tidak Masuk Kerja",
  datang_terlambat: "Datang Terlambat",
  pulang_awal: "Pulang Lebih Awal",
  keluar_kantor: "Meninggalkan Kantor",
  sakit: "Izin Sakit",
  duka: "Izin Duka Cita",
  akademik: "Izin Akademik",
  administrasi_resmi: "Administrasi Resmi",
  lainnya: "Izin Lainnya",
};

const REASON_LABELS: Record<string, string> = {
  sakit: "Sakit",
  duka: "Duka Cita",
  urusan_keluarga: "Urusan Keluarga",
  administrasi_resmi: "Administrasi Resmi",
  akademik: "Akademik",
  transportasi: "Transportasi",
  keperluan_pribadi: "Keperluan Pribadi",
  lainnya: "Lainnya",
};

const FORM_TYPE_OPTIONS = [
  { value: "all", label: "Semua Bentuk" },
  { value: "tidak_masuk", label: "Tidak Masuk Kerja" },
  { value: "datang_terlambat", label: "Datang Terlambat" },
  { value: "pulang_awal", label: "Pulang Lebih Awal" },
  { value: "keluar_kantor", label: "Meninggalkan Kantor" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}

function resolveDate(t: any): Date | null {
  if (!t) return null;
  if (typeof t.toDate === "function") return t.toDate();
  if (t.seconds) return new Date(t.seconds * 1000);
  return null;
}

function formatDuration(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  if (formType === "keluar_kantor") {
    const mins = s.totalDurationMinutes || 0;
    if (mins < 60) return `${mins} menit`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
  }
  const startDt = resolveDate(s.startDate);
  const endDt = resolveDate(s.endDate);
  if (!startDt || !endDt) return "—";
  const days = differenceInCalendarDays(endDt, startDt) + 1;
  return days === 1 ? "1 hari" : `${days} hari`;
}

function getFormLabel(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  return FORM_TYPE_LABELS[formType] || formType?.replace(/_/g, " ") || "—";
}

function getReasonLabel(s: PermissionRequest): string | null {
  if (!s.reasonType) return null;
  return REASON_LABELS[s.reasonType] || s.reasonType.replace(/_/g, " ");
}

// Compute a clean subtitle for applicant: prefer enriched/resolved snapshot fields,
// avoid raw IDs or generic 'Staf'/'N/A'. Returns string or null.
function getApplicantSubtitle(s: PermissionRequest): string | null {
  const clean = (v: any) => {
    if (!v && v !== 0) return null;
    const str = String(v).trim();
    if (!str) return null;
    if (["N/A", "NA", "-", "Staf", "Staff"].includes(str)) return null;
    // raw id heuristic (like b9067Q...)
    if (/^[A-Za-z0-9_-]{6,}$/.test(str)) return null;
    return str;
  };

  const anyS = s as any;
  const position =
    clean(anyS._resolvedApplicantPosition) ||
    clean(anyS.applicantPosition) ||
    clean(anyS.positionTitle) ||
    clean(anyS.position) ||
    clean(anyS.jobTitle) ||
    (anyS._enrichedEmployeeProfile &&
      (clean((anyS._enrichedEmployeeProfile as any).positionTitle) ||
        clean((anyS._enrichedEmployeeProfile as any).position))) ||
    null;

  const division =
    clean(anyS._resolvedApplicantDivision) ||
    clean(anyS.applicantDivisionName) ||
    clean(anyS.division) ||
    (anyS._enrichedEmployeeProfile &&
      clean(
        (anyS._enrichedEmployeeProfile as any).hrdEmploymentInfo?.divisionName,
      )) ||
    null;

  if (position && division) return `${position} • ${division}`;
  if (position) return position;
  if (division) return division;
  return null;
}

// ── Tab classification ────────────────────────────────────────────────────────

function isActionNeeded(s: PermissionRequest, uid: string): boolean {
  const isOfficeExit =
    s.formType === "keluar_kantor" || s.type === "keluar_kantor";
  if (s.status === "pending_manager" && s.waitingForUid === uid) return true;
  if (
    isOfficeExit &&
    (s.status === "reported" || s.status === "returned") &&
    s.managerUid === uid
  )
    return true;
  return false;
}

function isApprovedByMe(s: PermissionRequest, uid: string): boolean {
  return (
    s.managerUid === uid &&
    [
      "approved_by_manager",
      "pending_hrd",
      "revision_hrd",
      "approved",
      "closed",
      "verified_manager",
    ].includes(s.status)
  );
}

function isRejectedByMe(s: PermissionRequest, uid: string): boolean {
  return s.managerUid === uid && s.status === "rejected_manager";
}

function isRevisionByMe(s: PermissionRequest, uid: string): boolean {
  return s.managerUid === uid && s.status === "revision_manager";
}

// ── "Menunggu" column data ─────────────────────────────────────────────────────

interface WaitingInfo {
  text: string;
  icon: "clock" | "check" | "x" | "warning" | "none";
  colorClass: string;
}

function getWaitingInfo(s: PermissionRequest, uid: string): WaitingInfo {
  switch (s.status) {
    case "pending_manager":
      if (s.waitingForUid === uid)
        return {
          text: "Menunggu Anda",
          icon: "clock",
          colorClass: "text-amber-600 dark:text-amber-400",
        };
      return {
        text: `Menunggu ${s.waitingForName || "atasan"}`,
        icon: "clock",
        colorClass: "text-amber-600 dark:text-amber-400",
      };
    case "revision_manager":
      return {
        text: "Menunggu revisi staff",
        icon: "warning",
        colorClass: "text-orange-600 dark:text-orange-400",
      };
    case "approved_by_manager":
    case "pending_hrd":
    case "revision_hrd":
      return {
        text: "Menunggu HRD",
        icon: "clock",
        colorClass: "text-blue-600 dark:text-blue-400",
      };
    case "rejected_manager":
    case "rejected_hrd":
      return {
        text: "Ditolak",
        icon: "x",
        colorClass: "text-red-600 dark:text-red-400",
      };
    case "approved":
    case "closed":
    case "verified_manager":
      return {
        text: "Selesai",
        icon: "check",
        colorClass: "text-green-600 dark:text-green-400",
      };
    case "reported":
      return {
        text: "Laporan keluar diterima",
        icon: "clock",
        colorClass: "text-indigo-600 dark:text-indigo-400",
      };
    case "returned":
      if (s.managerUid === uid)
        return {
          text: "Menunggu Anda verifikasi",
          icon: "clock",
          colorClass: "text-amber-600 dark:text-amber-400",
        };
      return {
        text: "Sudah kembali",
        icon: "check",
        colorClass: "text-green-600 dark:text-green-400",
      };
    default:
      return { text: "—", icon: "none", colorClass: "text-muted-foreground" };
  }
}

function isHrdValidationPhase(s: PermissionRequest): boolean {
  const isHrdStep =
    s.currentApprovalStep === "hrd" ||
    s.waitingForRole === "hrd" ||
    s.waitingForName === "HRD";
  const isHrdStatus = [
    "pending_hrd",
    "pending_hrd_validation",
    "approved_by_manager",
    "verified_manager",
    "revision_hrd",
  ].includes(s.status);

  return isHrdStep || isHrdStatus;
}

function getHumanStatusLabel(s: PermissionRequest): string {
  switch (s.status) {
    case "draft":
      return "Draft";
    case "pending_manager":
      return `Menunggu persetujuan ${s.waitingForName || s.managerName || "Manager"}`;
    case "rejected_manager":
    case "rejected_hrd":
      return "Ditolak";
    case "revision_manager":
    case "revision_hrd":
      return "Perlu Revisi";
    case "approved_by_manager":
    case "pending_hrd":
    case "verified_manager":
      return "Menunggu validasi HRD";
    case "approved":
    case "closed":
      return "Disetujui";
    case "reported":
      return "Dilaporkan Keluar";
    case "returned":
      return "Sudah Kembali (Menunggu Verifikasi)";
    default:
      return s.status.replace(/_/g, " ");
  }
}

function getTahapLabel(s: PermissionRequest): string {
  if (s.status === "pending_manager") return "Menunggu Manager";
  if (isHrdValidationPhase(s) && !isFinalStatus(s.status))
    return "Butuh Validasi HRD";
  if (s.status === "approved" || s.status === "closed") return "Selesai";
  if (s.status === "rejected_manager" || s.status === "rejected_hrd")
    return "Ditolak";
  if (s.status === "revision_manager" || s.status === "revision_hrd")
    return "Perlu Revisi";
  return "Lainnya";
}

function isThisMonth(t: any): boolean {
  const d = resolveDate(t);
  if (!d) return false;
  const monthStart = startOfMonth(new Date());
  return d >= monthStart;
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface PermissionApprovalClientProps {
  mode: "manager" | "hrd";
}

export function PermissionApprovalClient({
  mode,
}: PermissionApprovalClientProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  // Tab state (manager only)
  const [activeTab, setActiveTab] = useState<ManagerTab>("action_needed");

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFormType, setFilterFormType] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");

  // HRD extra filter states
  const [statusFilter, setStatusFilter] = useState("all");
  const [tahapFilter, setTahapFilter] = useState("all");
  const [filterReasonType, setFilterReasonType] = useState("all");
  const [waitingForFilter, setWaitingForFilter] = useState("");

  const [selectedSubmission, setSelectedSubmission] =
    useState<PermissionRequest | null>(null);

  // ── Queries (3 for manager + 1 for HRD) ──────────────────────────────────

  const byManagerUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || mode !== "manager") return null;
    return query(
      collection(firestore, "permission_requests"),
      where("managerUid", "==", userProfile.uid),
    );
  }, [userProfile?.uid, firestore, mode]);

  const byWaitingForUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || mode !== "manager") return null;
    return query(
      collection(firestore, "permission_requests"),
      where("waitingForUid", "==", userProfile.uid),
    );
  }, [userProfile?.uid, firestore, mode]);

  const hasLegacyScope = !!(
    mode === "manager" &&
    userProfile?.managedDivision?.trim() &&
    userProfile?.managedBrandId
  );
  const legacyDivBrandQuery = useMemoFirebase(() => {
    if (!hasLegacyScope || !userProfile) return null;
    return query(
      collection(firestore, "permission_requests"),
      where("division", "==", userProfile.managedDivision),
      where("brandId", "==", userProfile.managedBrandId),
    );
  }, [
    hasLegacyScope,
    userProfile?.managedDivision,
    userProfile?.managedBrandId,
    firestore,
  ]);

  const hrdQuery = useMemoFirebase(() => {
    if (mode !== "hrd") return null;
    return query(collection(firestore, "permission_requests"));
  }, [firestore, mode]);

  const {
    data: byManagerUid,
    isLoading: l1,
    mutate: m1,
  } = useCollection<PermissionRequest>(byManagerUidQuery);
  const {
    data: byWaitingFor,
    isLoading: l2,
    mutate: m2,
  } = useCollection<PermissionRequest>(byWaitingForUidQuery);
  const { data: byDivBrand, mutate: m3 } =
    useCollection<PermissionRequest>(legacyDivBrandQuery);
  const {
    data: hrdData,
    isLoading: l4,
    mutate: m4,
  } = useCollection<PermissionRequest>(hrdQuery);

  // Combined raw submissions (deduped)
  const combinedRaw = useMemo(() => {
    if (mode === "hrd") return hrdData || [];
    const combined = [
      ...(byManagerUid || []),
      ...(byWaitingFor || []),
      ...(byDivBrand || []),
    ];
    const seen = new Set<string>();
    return combined.filter((s) => {
      if (!s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [mode, hrdData, byManagerUid, byWaitingFor, byDivBrand]);

  const isLoading = mode === "manager" ? l1 && l2 : l4;
  const mutate = () => {
    m1();
    m2();
    m3();
    m4();
  };

  // Load employee profiles and users to enrich legacy submissions
  const { data: employeeProfiles } = useCollection<EmployeeProfile>(
    useMemoFirebase(
      () => collection(firestore, "employee_profiles"),
      [firestore],
    ),
  );
  const { data: usersList } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "users"), [firestore]),
  );

  // ── Supporting data ───────────────────────────────────────────────────────

  const { data: brandsList } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  // Enrich submissions with profile/brand/division resolution for older records
  const submissions = useMemo(() => {
    const brands = brandsList || [];
    const eps = employeeProfiles || [];
    const users = usersList || [];

    return (combinedRaw || []).map((s) => {
      const uid = s.applicantUid || s.uid || s.requesterUid || s.requesterUid;
      const ep = eps.find((e) => e.uid === uid) || null;
      const user = users.find((u) => u.uid === uid) || null;

      // Resolve position (priority per spec)
      const position =
        s.applicantPosition ||
        ep?.positionTitle ||
        (ep as any)?.position ||
        (ep as any)?.jobTitle ||
        (ep as any)?.roleName ||
        ep?.hrdEmploymentInfo?.positionName ||
        ep?.hrdEmploymentInfo?.jabatan ||
        user?.positionTitle ||
        user?.roleName ||
        null;

      // Resolve division name: avoid showing raw IDs
      let division =
        s.applicantDivisionName ||
        ep?.hrdEmploymentInfo?.divisionName ||
        (ep as any)?.divisionName ||
        (ep as any)?.division ||
        null;
      if (division && /^[A-Za-z0-9_-]{6,}$/.test(String(division)))
        division = null;

      // Resolve brand name with flexible matching
      let brand = s.applicantBrandName || s.applicantCompanyName || null;
      if (!brand) {
        const staffBrandId =
          s.applicantBrandId ||
          s.brandId ||
          (ep as any)?.brandId ||
          (ep as any)?.companyName ||
          null;
        if (staffBrandId) {
          const b = brands.find(
            (bx) =>
              bx.id === staffBrandId ||
              bx.name === staffBrandId ||
              (bx as any).companyName === staffBrandId,
          );
          if (b) brand = (b as any).name || (b as any).companyName || null;
        }
      }
      if (!brand)
        brand =
          ep?.hrdEmploymentInfo?.brandName ||
          ep?.brandName ||
          (ep as any)?.companyName ||
          user?.brandName ||
          null;

      return {
        ...s,
        _resolvedApplicantPosition: position || null,
        _resolvedApplicantDivision: division || null,
        _resolvedApplicantBrand: brand || null,
        _enrichedEmployeeProfile: ep || null,
        _enrichedUserProfile: user || null,
      } as PermissionRequest & {
        _resolvedApplicantPosition?: string | null;
        _resolvedApplicantDivision?: string | null;
        _resolvedApplicantBrand?: string | null;
        _enrichedEmployeeProfile?: EmployeeProfile | null;
        _enrichedUserProfile?: any | null;
      };
    });
  }, [combinedRaw, brandsList, employeeProfiles, usersList]);

  const availableDivisions = useMemo(() => {
    const divs = new Set<string>();
    submissions.forEach((s) => {
      if (s.division) divs.add(s.division);
    });
    return Array.from(divs).sort();
  }, [submissions]);

  // ── Tab counts (manager only) ─────────────────────────────────────────────

  const uid = userProfile?.uid || "";

  const tabCounts = useMemo(() => {
    if (mode !== "manager")
      return {
        action_needed: 0,
        approved_by_me: 0,
        rejected_by_me: 0,
        revision_by_me: 0,
      };
    return {
      action_needed: submissions.filter((s) => isActionNeeded(s, uid)).length,
      approved_by_me: submissions.filter((s) => isApprovedByMe(s, uid)).length,
      rejected_by_me: submissions.filter((s) => isRejectedByMe(s, uid)).length,
      revision_by_me: submissions.filter((s) => isRevisionByMe(s, uid)).length,
    };
  }, [submissions, uid, mode]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const monthStart = startOfMonth(new Date());

    if (mode === "manager") {
      const actionNeeded = submissions.filter((s) =>
        isActionNeeded(s, uid),
      ).length;
      const waitingHrd = submissions.filter(
        (s) =>
          s.managerUid === uid &&
          (s.status === "approved_by_manager" || s.status === "pending_hrd"),
      ).length;
      const approvedMonth = submissions.filter((s) => {
        if (s.managerUid !== uid) return false;
        if (
          ![
            "approved_by_manager",
            "verified_manager",
            "approved",
            "closed",
          ].includes(s.status)
        )
          return false;
        const d = resolveDate(s.managerDecisionAt);
        return d && d >= monthStart;
      }).length;
      const rejectedMonth = submissions.filter((s) => {
        if (s.managerUid !== uid || s.status !== "rejected_manager")
          return false;
        const d = resolveDate(s.managerDecisionAt);
        return d && d >= monthStart;
      }).length;
      const revision = submissions.filter((s) => isRevisionByMe(s, uid)).length;
      return {
        actionNeeded,
        waitingHrd,
        approvedMonth,
        rejectedMonth,
        revision,
      };
    } else {
      const waitingManager = submissions.filter(
        (s) => s.status === "pending_manager",
      ).length;
      const actionNeeded = submissions.filter(
        (s) => isHrdValidationPhase(s) && !isFinalStatus(s.status),
      ).length;
      const approvedMonth = submissions.filter((s) => {
        if (!["approved", "closed"].includes(s.status)) return false;
        return isThisMonth(s.hrdDecisionAt || s.managerDecisionAt);
      }).length;
      const rejectedMonth = submissions.filter((s) => {
        if (!["rejected_hrd", "rejected_manager"].includes(s.status))
          return false;
        return isThisMonth(s.hrdDecisionAt || s.managerDecisionAt);
      }).length;
      const revision = submissions.filter((s) =>
        ["revision_hrd", "revision_manager"].includes(s.status),
      ).length;
      return {
        waitingManager,
        actionNeeded,
        waitingHrd: 0,
        approvedMonth,
        rejectedMonth,
        revision,
      };
    }
  }, [submissions, mode, uid]);

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const hasActiveFilters = Boolean(
    searchTerm ||
    filterFormType !== "all" ||
    filterDateFrom ||
    filterDateTo ||
    sortOrder !== "newest" ||
    brandFilter !== "all" ||
    divisionFilter !== "all" ||
    statusFilter !== "all" ||
    tahapFilter !== "all" ||
    filterReasonType !== "all" ||
    (waitingForFilter && waitingForFilter !== "all"),
  );

  const filteredSubmissions = useMemo(() => {
    let items = submissions.filter((s) => {
      // ── Tab filter (manager) ──
      if (mode === "manager") {
        switch (activeTab) {
          case "action_needed":
            if (!isActionNeeded(s, uid)) return false;
            break;
          case "approved_by_me":
            if (!isApprovedByMe(s, uid)) return false;
            break;
          case "rejected_by_me":
            if (!isRejectedByMe(s, uid)) return false;
            break;
          case "revision_by_me":
            if (!isRevisionByMe(s, uid)) return false;
            break;
          case "all":
            break;
        }
      }

      // ── HRD Tahap filter ──
      if (mode === "hrd" && tahapFilter !== "all") {
        switch (tahapFilter) {
          case "pending_manager":
            if (s.status !== "pending_manager") return false;
            break;
          case "pending_hrd":
            if (!isHrdValidationPhase(s) || isFinalStatus(s.status))
              return false;
            break;
          case "done":
            if (!["approved", "closed"].includes(s.status)) return false;
            break;
          case "rejected":
            if (!["rejected_manager", "rejected_hrd"].includes(s.status))
              return false;
            break;
          case "revision":
            if (!["revision_manager", "revision_hrd"].includes(s.status))
              return false;
            break;
        }
      }

      // ── Status filter ──
      if (statusFilter !== "all") {
        if (s.status !== statusFilter) return false;
      }

      // ── Form type filter ──
      if (filterFormType !== "all") {
        const formType = s.formType || s.type;
        if (formType !== filterFormType) return false;
      }

      // ── Reason type filter ──
      if (filterReasonType !== "all") {
        if (s.reasonType !== filterReasonType) return false;
      }

      // ── Brand + Division ──
      if (brandFilter !== "all" && s.brandId !== brandFilter) return false;
      if (divisionFilter !== "all" && s.division !== divisionFilter)
        return false;

      // ── Penanggung Jawab Saat Ini filter ──
      if (mode === "hrd" && waitingForFilter && waitingForFilter !== "all") {
        if (waitingForFilter === "pending_manager") {
          if (s.status !== "pending_manager") return false;
        } else if (waitingForFilter === "pending_hrd") {
          if (!isHrdValidationPhase(s) || isFinalStatus(s.status)) return false;
        } else if (waitingForFilter === "done") {
          if (!isFinalStatus(s.status) && ![
            "approved",
            "closed",
            "rejected_manager",
            "rejected_hrd",
            "reported",
            "returned",
          ].includes(s.status)) return false;
        }
      }

      // ── Date range ──
      if (filterDateFrom || filterDateTo) {
        const startDt = resolveDate(s.startDate);
        if (!startDt) return false;
        if (filterDateFrom) {
          const from = startOfDay(new Date(filterDateFrom));
          if (isBefore(startDt, from)) return false;
        }
        if (filterDateTo) {
          const to = endOfDay(new Date(filterDateTo));
          if (isAfter(startDt, to)) return false;
        }
      }

      // ── Search ──
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const name = (s.fullName || "").toLowerCase();
        const formLabel = getFormLabel(s).toLowerCase();
        const reasonLabel = (getReasonLabel(s) || "").toLowerCase();
        const reason = (s.reason || s.detailedReason || "").toLowerCase();
        const division = (s.division || "").toLowerCase();
        if (
          !name.includes(q) &&
          !formLabel.includes(q) &&
          !reasonLabel.includes(q) &&
          !reason.includes(q) &&
          !division.includes(q)
        )
          return false;
      }

      return true;
    });

    // Sort
    items = [...items].sort((a, b) =>
      sortOrder === "oldest"
        ? toMs(a.createdAt) - toMs(b.createdAt)
        : toMs(b.createdAt) - toMs(a.createdAt),
    );

    return items;
  }, [
    submissions,
    activeTab,
    mode,
    uid,
    filterFormType,
    brandFilter,
    divisionFilter,
    filterDateFrom,
    filterDateTo,
    searchTerm,
    sortOrder,
    statusFilter,
    tahapFilter,
    filterReasonType,
    waitingForFilter,
  ]);

  const hrdPendingValidation = useMemo(
    () =>
      filteredSubmissions.filter(
        (s) => isHrdValidationPhase(s) && !isFinalStatus(s.status),
      ),
    [filteredSubmissions],
  );

  const hrdPendingManagerSubmissions = useMemo(
    () => filteredSubmissions.filter((s) => s.status === "pending_manager"),
    [filteredSubmissions],
  );

  const hrdNeedRevision = useMemo(
    () =>
      filteredSubmissions.filter((s) =>
        ["revision_manager", "revision_hrd"].includes(s.status),
      ),
    [filteredSubmissions],
  );

  const hrdFinishedSubmissions = useMemo(
    () =>
      filteredSubmissions.filter(
        (s) =>
          isFinalStatus(s.status) ||
          ["rejected_manager", "rejected_hrd", "reported", "returned"].includes(
            s.status,
          ),
      ),
    [filteredSubmissions],
  );

  const clearFilters = () => {
    setSearchTerm("");
    setFilterFormType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSortOrder("newest");
    setBrandFilter("all");
    setDivisionFilter("all");
    setStatusFilter("all");
    setTahapFilter("all");
    setFilterReasonType("all");
    setWaitingForFilter("");
  };

  const renderHrdSection = (
    title: string,
    description: string,
    items: PermissionRequest[],
    emptyMessage: string,
    highlightClass: string,
    buttonLabel: string,
  ) => (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-background shadow-sm">
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between p-4 border-b",
          highlightClass,
        )}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-foreground">
            {items.length}
          </p>
          <p className="text-sm text-muted-foreground">Pengajuan</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 opacity-30" />
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Pengaju</TableHead>
                <TableHead className="w-[190px]">Izin</TableHead>
                <TableHead className="w-[130px]">Periode</TableHead>
                <TableHead className="w-[150px]">Brand / Divisi</TableHead>
                <TableHead className="w-[170px]">Keterangan</TableHead>
                <TableHead className="w-[90px]">Lampiran</TableHead>
                <TableHead className="w-[210px]">Status / Menunggu</TableHead>
                <TableHead className="w-[100px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const formType = s.formType || s.type;
                const formLabel = getFormLabel(s);
                const reasonLabel = getReasonLabel(s);
                const reasonText = s.reason || s.detailedReason || "";
                const attachments = (s.attachments || []).filter(Boolean);
                const hasAttachment = attachments.length > 0;
                const startDt = resolveDate(s.startDate);
                const endDt = resolveDate(s.endDate);
                const isOfficeExit = formType === "keluar_kantor";
                const sameDay =
                  startDt &&
                  endDt &&
                  differenceInCalendarDays(endDt, startDt) === 0;
                const statusLabel = getHumanStatusLabel(s);
                const isValidation =
                  isHrdValidationPhase(s) && !isFinalStatus(s.status);
                const waitingLabel = (() => {
                  if (s.status === "pending_manager") {
                    return `Menunggu persetujuan ${s.waitingForName || s.managerName || "Manager"}`;
                  }
                  if (s.status === "revision_manager") {
                    return `Diminta revisi oleh ${s.managerName || "Manager"}`;
                  }
                  if (s.status === "revision_hrd") {
                    return "Diminta revisi oleh HRD";
                  }
                  if (isValidation) {
                    return "Menunggu validasi HRD";
                  }
                  if (isFinalStatus(s.status)) {
                    return "Proses selesai";
                  }
                  return s.waitingForName || s.managerName || "Manager";
                })();
                const statusVariant = (() => {
                  if (s.status === "pending_manager") {
                    return "bg-amber-100 text-amber-800";
                  }
                  if (isValidation) {
                    return "bg-teal-100 text-teal-800";
                  }
                  if (["approved", "closed"].includes(s.status)) {
                    return "bg-emerald-100 text-emerald-800";
                  }
                  if (["rejected_manager", "rejected_hrd"].includes(s.status)) {
                    return "bg-rose-100 text-rose-800";
                  }
                  if (["revision_manager", "revision_hrd"].includes(s.status)) {
                    return "bg-orange-100 text-orange-800";
                  }
                  return "bg-slate-100 text-slate-800";
                })();
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer transition-colors hover:bg-slate-800/40 dark:hover:bg-slate-700/30"
                    onClick={() => setSelectedSubmission(s)}
                  >
                    <TableCell>
                      <p className="font-medium text-sm leading-snug">
                        {s.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getApplicantSubtitle(s) || "Data jabatan belum diatur"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug">
                        {formLabel}
                      </p>
                      {reasonLabel && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {reasonLabel}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm leading-snug">
                        {startDt && endDt ? (
                          isOfficeExit ? (
                            <>
                              <p>
                                {format(startDt, "dd MMM yyyy", {
                                  locale: idLocale,
                                })}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(startDt, "HH:mm")} —{" "}
                                {format(endDt, "HH:mm")}
                              </p>
                            </>
                          ) : sameDay ? (
                            <p>
                              {format(startDt, "dd MMM yyyy", {
                                locale: idLocale,
                              })}
                            </p>
                          ) : (
                            <p>
                              {format(startDt, "dd MMM", { locale: idLocale })}{" "}
                              —{" "}
                              {format(endDt, "dd MMM yyyy", {
                                locale: idLocale,
                              })}
                            </p>
                          )
                        ) : (
                          <p className="text-muted-foreground">—</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDuration(s)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">
                        {s._resolvedApplicantBrand || s.brandName || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s._resolvedApplicantDivision || s.division || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-foreground/75 line-clamp-2 leading-relaxed">
                        {reasonText || (
                          <span className="text-muted-foreground text-xs italic">
                            Tidak ada keterangan.
                          </span>
                        )}
                      </p>
                    </TableCell>
                    <TableCell>
                      {hasAttachment ? (
                        <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1 w-fit">
                          <Paperclip className="h-2.5 w-2.5" /> Ada
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          className={cn(
                            "border-transparent font-medium text-xs",
                            statusVariant,
                          )}
                        >
                          {statusLabel}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {waitingLabel}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant={
                          buttonLabel === "Validasi" ? "default" : "outline"
                        }
                        size="sm"
                        className={
                          buttonLabel === "Validasi"
                            ? "h-8 text-sm bg-teal-600 hover:bg-teal-700 text-white border-0"
                            : "h-8 text-sm"
                        }
                        onClick={() => setSelectedSubmission(s)}
                      >
                        {buttonLabel}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  // ─── Manager tab definitions ──────────────────────────────────────────────

  const managerTabs: {
    id: ManagerTab;
    label: string;
    count?: number;
    urgent?: boolean;
  }[] = [
    {
      id: "action_needed",
      label: "Butuh Tindakan Saya",
      count: tabCounts.action_needed,
      urgent: true,
    },
    {
      id: "approved_by_me",
      label: "Sudah Saya Setujui",
      count: tabCounts.approved_by_me,
    },
    {
      id: "revision_by_me",
      label: "Perlu Revisi",
      count: tabCounts.revision_by_me,
    },
    {
      id: "rejected_by_me",
      label: "Saya Tolak",
      count: tabCounts.rejected_by_me,
    },
    { id: "all", label: "Semua Riwayat" },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  const colSpan = mode === "manager" ? 8 : 10;

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {mode === "manager" ? (
          <>
            <KpiCard
              title="Butuh Tindakan Saya"
              value={kpis.actionNeeded}
              deltaType={kpis.actionNeeded > 0 ? "inverse" : undefined}
            />
            <KpiCard title="Menunggu HRD" value={kpis.waitingHrd} />
            <KpiCard title="Disetujui Bulan Ini" value={kpis.approvedMonth} />
            <KpiCard
              title="Ditolak Bulan Ini"
              value={kpis.rejectedMonth}
              deltaType="inverse"
            />
            <KpiCard
              title="Perlu Revisi"
              value={kpis.revision}
              deltaType={kpis.revision > 0 ? "inverse" : undefined}
            />
          </>
        ) : (
          <>
            <KpiCard title="Menunggu Manager" value={kpis.waitingManager} />
            <KpiCard
              title="Butuh Validasi HRD"
              value={kpis.actionNeeded}
              deltaType={kpis.actionNeeded > 0 ? "inverse" : undefined}
            />
            <KpiCard title="Disetujui Bulan Ini" value={kpis.approvedMonth} />
            <KpiCard
              title="Ditolak Bulan Ini"
              value={kpis.rejectedMonth}
              deltaType="inverse"
            />
            <KpiCard
              title="Perlu Revisi"
              value={kpis.revision}
              deltaType={kpis.revision > 0 ? "inverse" : undefined}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>
                {mode === "manager"
                  ? "Persetujuan Izin Tim"
                  : "Validasi Pengajuan Izin"}
              </CardTitle>
              <CardDescription className="mt-1">
                {mode === "manager"
                  ? "Proses pengajuan izin dari anggota tim Anda."
                  : "Validasi pengajuan yang telah disetujui atasan divisi."}
              </CardDescription>
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground">
                {filteredSubmissions.length} dari {submissions.length} pengajuan
              </span>
            )}
          </div>

          {/* ── Tab bar (manager only) ── */}
          {mode === "manager" && (
            <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border/50">
              {managerTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : tab.urgent
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-muted-foreground/15 text-muted-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Filter controls (2 rows) ── */}
          <div className="space-y-3 mt-3">
            {/* Row 1: Search, Status, Tahap, Penanggung Jawab */}
            <div className="flex flex-wrap gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Cari nama, keterangan, divisi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Status (HRD only) */}
              {mode === "hrd" && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_manager">
                      Menunggu Manager
                    </SelectItem>
                    <SelectItem value="rejected_manager">
                      Ditolak Manager
                    </SelectItem>
                    <SelectItem value="revision_manager">
                      Revisi Manager
                    </SelectItem>
                    <SelectItem value="approved_by_manager">
                      Disetujui Manager
                    </SelectItem>
                    <SelectItem value="pending_hrd">Menunggu HRD</SelectItem>
                    <SelectItem value="rejected_hrd">Ditolak HRD</SelectItem>
                    <SelectItem value="revision_hrd">Revisi HRD</SelectItem>
                    <SelectItem value="approved">Disetujui</SelectItem>
                    <SelectItem value="reported">Dilaporkan Keluar</SelectItem>
                    <SelectItem value="returned">Sudah Kembali</SelectItem>
                    <SelectItem value="verified_manager">
                      Terverifikasi Manager
                    </SelectItem>
                    <SelectItem value="closed">Selesai</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Tahap (HRD only) */}
              {mode === "hrd" && (
                <Select value={tahapFilter} onValueChange={setTahapFilter}>
                  <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder="Tahap" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tahap</SelectItem>
                    <SelectItem value="pending_manager">
                      Menunggu Manager
                    </SelectItem>
                    <SelectItem value="pending_hrd">Menunggu HRD</SelectItem>
                    <SelectItem value="done">Selesai</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                    <SelectItem value="revision">Perlu Revisi</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Penanggung Jawab Saat Ini (HRD only) */}
              {mode === "hrd" && (
                <Select value={waitingForFilter} onValueChange={setWaitingForFilter}>
                  <SelectTrigger className="w-[180px] h-9 text-sm">
                    <SelectValue placeholder="Penanggung Jawab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Penanggung Jawab</SelectItem>
                    <SelectItem value="pending_manager">Menunggu Manager</SelectItem>
                    <SelectItem value="pending_hrd">Menunggu HRD</SelectItem>
                    <SelectItem value="done">Selesai</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Row 2: Bentuk, Alasan, Brand, Divisi, Tanggal, Sort */}
            {mode === "hrd" && (
              <div className="flex flex-wrap gap-2">
                {/* Bentuk izin */}
                <Select value={filterFormType} onValueChange={setFilterFormType}>
                  <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder="Bentuk Izin" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Alasan Izin */}
                <Select
                  value={filterReasonType}
                  onValueChange={setFilterReasonType}
                >
                  <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder="Alasan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Alasan</SelectItem>
                    <SelectItem value="sakit">Sakit</SelectItem>
                    <SelectItem value="duka">Duka Cita</SelectItem>
                    <SelectItem value="urusan_keluarga">
                      Urusan Keluarga
                    </SelectItem>
                    <SelectItem value="administrasi_resmi">
                      Administrasi Resmi
                    </SelectItem>
                    <SelectItem value="akademik">Akademik</SelectItem>
                    <SelectItem value="transportasi">Transportasi</SelectItem>
                    <SelectItem value="keperluan_pribadi">
                      Keperluan Pribadi
                    </SelectItem>
                    <SelectItem value="lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>

                {/* Brand */}
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brandsList?.map((b: Brand) => (
                      <SelectItem key={b.id} value={b.id!}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Divisi */}
                <Select
                  value={divisionFilter}
                  onValueChange={setDivisionFilter}
                >
                  <SelectTrigger className="w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {availableDivisions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Periode Pengajuan */}
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Dari</label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-[130px] h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Sampai</label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-[130px] h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Sort */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm px-3"
                  onClick={() =>
                    setSortOrder((p) => (p === "newest" ? "oldest" : "newest"))
                  }
                >
                  {sortOrder === "newest" ? (
                    <>
                      <SortDesc className="h-3.5 w-3.5" /> Terbaru
                    </>
                  ) : (
                    <>
                      <SortAsc className="h-3.5 w-3.5" /> Terlama
                    </>
                  )}
                </Button>

                {/* Clear filters */}
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1.5 text-sm text-muted-foreground"
                    onClick={clearFilters}
                  >
                    <X className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
              </div>
            )}

            {/* Manager mode single row */}
            {mode === "manager" && (
              <div className="flex flex-wrap gap-2">
                {/* Bentuk izin */}
                <Select value={filterFormType} onValueChange={setFilterFormType}>
                  <SelectTrigger className="w-[150px] h-9 text-sm">
                    <SelectValue placeholder="Bentuk Izin" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Periode Pengajuan */}
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Dari</label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-[130px] h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Sampai</label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-[130px] h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Sort */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm px-3"
                  onClick={() =>
                    setSortOrder((p) => (p === "newest" ? "oldest" : "newest"))
                  }
                >
                  {sortOrder === "newest" ? (
                    <>
                      <SortDesc className="h-3.5 w-3.5" /> Terbaru
                    </>
                  ) : (
                    <>
                      <SortAsc className="h-3.5 w-3.5" /> Terlama
                    </>
                  )}
                </Button>

                {/* Clear filters */}
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1.5 text-sm text-muted-foreground"
                    onClick={clearFilters}
                  >
                    <X className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

                <CardContent className="space-y-6">
          {mode === "hrd" ? (
            <div className="space-y-6">
              {renderHrdSection(
                "Butuh Validasi HRD",
                "Pengajuan izin yang sudah disetujui manager dan menunggu langkah HRD.",
                hrdPendingValidation,
                "Tidak ada pengajuan yang perlu divalidasi HRD saat ini.",
                "bg-teal-50/80 border-teal-200 dark:bg-teal-950/10",
                "Validasi",
              )}
              {renderHrdSection(
                "Sedang Proses di Manager",
                "Pengajuan yang masih menunggu persetujuan manager sebelum HRD dapat memvalidasi.",
                hrdPendingManagerSubmissions,
                "Tidak ada pengajuan yang saat ini menunggu manager.",
                "bg-amber-50/80 border-amber-200 dark:bg-amber-950/10",
                "Lihat Detail",
              )}
              {renderHrdSection(
                "Perlu Revisi",
                "Pengajuan yang diminta revisi oleh manager atau HRD.",
                hrdNeedRevision,
                "Tidak ada pengajuan yang diminta revisi saat ini.",
                "bg-orange-50/80 border-orange-200 dark:bg-orange-950/10",
                "Lihat Detail",
              )}
              {renderHrdSection(
                "Riwayat Selesai",
                "Pengajuan izin yang sudah ditutup: disetujui, terverifikasi, ditolak, atau dibatalkan.",
                hrdFinishedSubmissions,
                "Belum ada riwayat selesai untuk periode saat ini.",
                "bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/10",
                "Lihat Detail",
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[175px]">Pengaju</TableHead>
                    <TableHead className="w-[190px]">Izin</TableHead>
                    <TableHead className="w-[140px]">Periode</TableHead>
                    {mode === "hrd" && (
                      <TableHead className="w-[140px]">Brand / Divisi</TableHead>
                    )}
                    <TableHead className="w-[165px]">Keterangan</TableHead>
                    <TableHead className="w-[90px]">Lampiran</TableHead>
                    {mode === "hrd" && (
                      <TableHead className="w-[130px]">Tahap</TableHead>
                    )}
                    <TableHead className="w-[185px]">Status</TableHead>
                    <TableHead className="w-[155px]">Menunggu</TableHead>
                    <TableHead className="w-[100px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={colSpan}
                        className="h-28 text-center text-muted-foreground"
                      >
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : filteredSubmissions.length > 0 ? (
                    filteredSubmissions.map((s) => {
                      const formType = s.formType || s.type;
                      const formLabel = getFormLabel(s);
                      const reasonLabel = getReasonLabel(s);
                      const reasonText = s.reason || s.detailedReason || "";
                      const attachments = (s.attachments || []).filter(Boolean);
                      const hasAttachment = attachments.length > 0;
                      const startDt = resolveDate(s.startDate);
                      const endDt = resolveDate(s.endDate);
                      const isOfficeExit = formType === "keluar_kantor";
                      const sameDay =
                        startDt &&
                        endDt &&
                        differenceInCalendarDays(endDt, startDt) === 0;
                      const needsMyAction =
                        mode === "manager" && isActionNeeded(s, uid);

                      const isHrdActionable =
                        isHrdValidationPhase(s) && !isFinalStatus(s.status);

                      let rowClass = "hover:bg-slate-800/40 dark:hover:bg-slate-700/30";
                      if (mode === "hrd") {
                        if (isHrdActionable) {
                          rowClass =
                            "bg-teal-50/20 hover:bg-teal-800/40 border-l-2 border-l-teal-500 dark:bg-teal-950/10 dark:hover:bg-slate-700/30";
                        } else if (s.status === "pending_manager") {
                          rowClass =
                            "bg-amber-50/10 hover:bg-slate-800/40 border-l-2 border-l-amber-400 dark:bg-amber-950/5 dark:hover:bg-slate-700/30";
                        } else if (
                          s.status === "approved" ||
                          s.status === "closed"
                        ) {
                          rowClass =
                            "bg-emerald-50/10 hover:bg-slate-800/40 dark:bg-emerald-950/5 dark:hover:bg-slate-700/30";
                        } else if (
                          s.status === "rejected_manager" ||
                          s.status === "rejected_hrd"
                        ) {
                          rowClass =
                            "bg-rose-50/10 hover:bg-slate-800/40 dark:bg-rose-950/5 dark:hover:bg-slate-700/30";
                        } else if (
                          s.status === "revision_manager" ||
                          s.status === "revision_hrd"
                        ) {
                          rowClass =
                            "bg-orange-50/10 hover:bg-slate-800/40 dark:bg-orange-950/5 dark:hover:bg-slate-700/30";
                        }
                      } else {
                        if (needsMyAction) {
                          rowClass =
                            "border-l-2 border-l-amber-400 bg-amber-50/25 dark:bg-amber-900/10 hover:bg-slate-800/40 dark:hover:bg-slate-700/30";
                        }
                      }

                      return (
                        <TableRow
                          key={s.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            rowClass,
                          )}
                          onClick={() => setSelectedSubmission(s)}
                        >
                          {/* Pengaju */}
                          <TableCell>
                            <p className="font-medium text-sm leading-snug">
                              {s.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {(() => {
                                const subtitle = getApplicantSubtitle(s);
                                return subtitle || "Data jabatan belum diatur";
                              })()}
                            </p>
                            {isOfficeExit && s.needsManagerAttention && (
                              <Badge
                                variant="outline"
                                className="mt-1 px-1 py-0 h-4 text-[9px] bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40"
                              >
                                Deviasi Durasi
                              </Badge>
                            )}
                          </TableCell>

                          {/* Izin */}
                          <TableCell>
                            <p className="text-sm font-medium leading-snug">
                              {formLabel}
                            </p>
                            {reasonLabel && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {reasonLabel}
                              </p>
                            )}
                            {s.otherTitle && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[160px]">
                                {s.otherTitle}
                              </p>
                            )}
                          </TableCell>

                          {/* Periode */}
                          <TableCell>
                            <div className="text-sm leading-snug">
                              {startDt && endDt ? (
                                isOfficeExit ? (
                                  <>
                                    <p>
                                      {format(startDt, "dd MMM yyyy", {
                                        locale: idLocale,
                                      })}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {format(startDt, "HH:mm")} —{" "}
                                      {format(endDt, "HH:mm")}
                                    </p>
                                  </>
                                ) : sameDay ? (
                                  <p>
                                    {format(startDt, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })}
                                  </p>
                                ) : (
                                  <p>
                                    {format(startDt, "dd MMM", {
                                      locale: idLocale,
                                    })} {" "}
                                    — {" "}
                                    {format(endDt, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })}
                                  </p>
                                )
                              ) : (
                                <p className="text-muted-foreground">—</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDuration(s)}
                              </p>
                            </div>
                          </TableCell>

                          {/* Brand / Divisi (HRD only) */}
                          {mode === "hrd" && (
                            <TableCell>
                              <p className="text-sm font-medium text-foreground">
                                {s._resolvedApplicantBrand || s.brandName || "—"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {s._resolvedApplicantDivision || s.division || "—"}
                              </p>
                            </TableCell>
                          )}

                          {/* Keterangan */}
                          <TableCell>
                            <p className="text-sm text-foreground/75 line-clamp-2 leading-relaxed">
                              {reasonText || (
                                <span className="text-muted-foreground text-xs italic">
                                  Tidak ada keterangan.
                                </span>
                              )}
                            </p>
                            {s.createdAt && resolveDate(s.createdAt) && (
                              <p className="text-[10px] text-muted-foreground/55 mt-0.5">
                                {formatDistanceToNow(resolveDate(s.createdAt)!, {
                                  addSuffix: true,
                                  locale: idLocale,
                                })}
                              </p>
                            )}
                          </TableCell>

                          {/* Lampiran */}
                          <TableCell>
                            {hasAttachment ? (
                              <div className="flex flex-col gap-1">
                                <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1 w-fit">
                                  <Paperclip className="h-2.5 w-2.5" /> Ada
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">
                                —
                              </span>
                            )}
                          </TableCell>

                          {/* Tahap (HRD only) */}
                          {mode === "hrd" && (
                            <TableCell>
                              {(() => {
                                const tahap = getTahapLabel(s);
                                let tahapClass = "bg-slate-100 text-slate-700";
                                if (tahap === "Menunggu Manager") {
                                  tahapClass = "bg-amber-100 text-amber-700";
                                } else if (tahap === "Butuh Validasi HRD") {
                                  tahapClass = "bg-teal-100 text-teal-700";
                                } else if (tahap === "Selesai") {
                                  tahapClass = "bg-emerald-100 text-emerald-700";
                                } else if (tahap === "Ditolak") {
                                  tahapClass = "bg-rose-100 text-rose-700";
                                } else if (tahap === "Perlu Revisi") {
                                  tahapClass = "bg-orange-100 text-orange-700";
                                }
                                return (
                                  <Badge
                                    className={cn(
                                      "border-transparent font-medium text-[10px] px-2 py-0.5",
                                      tahapClass,
                                    )}
                                  >
                                    {tahap}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                          )}

                          {/* Status */}
                          <TableCell>
                            {(() => {
                              const label = getHumanStatusLabel(s);
                              let statusClass = "bg-slate-100 text-slate-800";
                              if (s.status === "pending_manager") {
                                statusClass =
                                  "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/30";
                              } else if (
                                isHrdValidationPhase(s) &&
                                !isFinalStatus(s.status)
                              ) {
                                statusClass =
                                  "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/30";
                              } else if (
                                s.status === "approved" ||
                                s.status === "closed"
                              ) {
                                statusClass =
                                  "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/30";
                              } else if (
                                s.status === "rejected_manager" ||
                                s.status === "rejected_hrd"
                              ) {
                                statusClass =
                                  "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/30";
                              } else if (
                                s.status === "revision_manager" ||
                                s.status === "revision_hrd"
                              ) {
                                statusClass =
                                  "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/30";
                              }
                              return (
                                <Badge
                                  className={cn(
                                    "border-transparent font-medium text-xs",
                                    statusClass,
                                  )}
                                >
                                  {label}
                                </Badge>
                              );
                            })()}
                            {mode === "manager" &&
                              isApprovedByMe(s, uid) &&
                              (s.status === "approved_by_manager" ||
                                s.status === "pending_hrd") && (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                  Sudah Anda setujui
                                </p>
                              )}
                          </TableCell>

                          {/* Menunggu */}
                          <TableCell>
                            {(() => {
                              if (isFinalStatus(s.status)) {
                                return (
                                  <span className="text-xs text-muted-foreground">
                                    Selesai
                                  </span>
                                );
                              }
                              if (isHrdValidationPhase(s)) {
                                return (
                                  <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                                    HRD
                                  </span>
                                );
                              }
                              return (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                  {s.waitingForName || s.managerName || "Manager"}
                                </span>
                              );
                            })()}
                          </TableCell>

                          {/* Aksi */}
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              let btnText = "Lihat Detail";
                              let btnVariant: "default" | "outline" | "ghost" =
                                "outline";
                              let btnClass = "";

                              if (mode === "hrd") {
                                if (isHrdActionable) {
                                  btnText = "Validasi";
                                  btnVariant = "default";
                                  btnClass =
                                    "bg-teal-600 hover:bg-teal-700 text-white border-0 shadow-sm";
                                } else {
                                  btnText = "Lihat Detail";
                                  btnVariant = "outline";
                                }
                              } else {
                                if (needsMyAction) {
                                  btnText = "Review";
                                  btnVariant = "default";
                                  btnClass =
                                    "bg-amber-500 hover:bg-amber-600 text-white border-0";
                                } else {
                                  btnText = "Lihat Detail";
                                  btnVariant = "outline";
                                }
                              }

                              return (
                                <Button
                                  variant={btnVariant}
                                  size="sm"
                                  className={cn("h-8 text-sm", btnClass)}
                                  onClick={() => setSelectedSubmission(s)}
                                >
                                  {btnText}
                                </Button>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="h-36 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-25" />
                          <p className="text-sm font-medium">
                            {mode === "manager" && activeTab === "action_needed"
                              ? "Tidak ada pengajuan yang perlu Anda tindaklanjuti."
                              : hasActiveFilters
                                ? "Tidak ada pengajuan yang sesuai filter."
                                : "Belum ada data pengajuan izin."}
                          </p>
                          {hasActiveFilters && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={clearFilters}
                              className="text-xs h-auto p-0"
                            >
                              Bersihkan filter
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

      </Card>

      {selectedSubmission && (
        <ReviewPermissionDialog
          open={!!selectedSubmission}
          onOpenChange={(open) => !open && setSelectedSubmission(null)}
          submission={selectedSubmission}
          onSuccess={mutate}
          mode={mode}
        />
      )}
    </div>
  );
}
