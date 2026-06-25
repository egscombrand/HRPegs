"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, or, orderBy } from "firebase/firestore";
import type { OvertimeSubmission, UserProfile, Brand } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { useRouter, usePathname, useSearchParams } from "@/navigation";
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
import { Search, UserCheck, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { addMonths, format, formatDistanceToNow, startOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { KpiCard } from "@/components/recruitment/KpiCard";
import { ReviewOvertimeDialog } from "./ReviewOvertimeDialog";
import { OVERTIME_SUBMISSION_STATUSES, isFinalStatus } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { OvertimeApprovalStatusBadge } from "./OvertimeApprovalStatusBadge";

interface OvertimeApprovalClientProps {
  mode: "manager" | "hrd";
}

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

export function OvertimeApprovalClient({ mode }: OvertimeApprovalClientProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasHydratedParams = useRef(false);

  const [statusFilter, setStatusFilter] = useState<
    OvertimeSubmission["status"] | "all"
  >(mode === "manager" ? "pending_coordinator" : "all");
  const [activeTab, setActiveTab] = useState<
    | "pending_hrd"
    | "pending_supervisor"
    | "pending_coordinator"
    | "approved"
    | "rejected"
    | "rekap_payroll"
    | "all"
    | "riwayat_saya"
  >(mode === "hrd" ? "pending_hrd" : "pending_coordinator");
  const [brandFilter, setBrandFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState(() =>
    format(new Date(), "yyyy-MM"),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<
    "recent" | "duration" | "overtime_date"
  >("recent");
  const [selectedSubmission, setSelectedSubmission] =
    useState<OvertimeSubmission | null>(null);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(
    null,
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

  const getSearchParam = (key: string) => searchParams?.get(key) ?? null;

  const normalizeQueryValue = (value: string | null) =>
    value ? value.replace(/-/g, "_") : null;

  const managerTabs = [
    "pending_coordinator",
    "pending_supervisor",
    "riwayat_saya",
    "all",
  ] as const;
  const hrdTabs = [
    "pending_hrd",
    "pending_supervisor",
    "approved",
    "rejected",
    "all",
  ] as const;
  const hrdStatusFilters = [
    "all",
    "pending_hrd",
    "pending_supervisor",
    "approved",
    "approved_hrd",
    "rejected_manager",
    "rejected_hrd",
    "revision_manager",
    "revision_hrd",
  ] as const;

  const queryStatePrefix = `overtime-approval-${mode}`;

  const updateUrlParam = (key: string, value: string | null) => {
    if (!router || !pathname) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    if (value === null || value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    router.replace(newUrl);
  };

  const setLocalStorageValue = (key: string, value: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  };

  const readLocalStorageValue = (key: string) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  };

  useEffect(() => {
    if (hasHydratedParams.current || typeof window === "undefined") return;

    const tabParam = normalizeQueryValue(getSearchParam("tab"));
    const statusParam = getSearchParam("status");
    const monthParam = getSearchParam("month");
    const searchParam = getSearchParam("search");
    const brandParam = getSearchParam("brand");
    const divisionParam = getSearchParam("division");
    const managerParam = getSearchParam("manager");

    if (mode === "hrd") {
      if (tabParam && hrdTabs.includes(tabParam as any)) {
        setActiveTab(tabParam as any);
      } else {
        const storedTab = readLocalStorageValue(`${queryStatePrefix}-tab`);
        if (storedTab && hrdTabs.includes(storedTab as any)) {
          setActiveTab(storedTab as any);
          updateUrlParam("tab", storedTab);
        }
      }

      if (statusParam && hrdStatusFilters.includes(statusParam as any)) {
        setStatusFilter(statusParam as any);
      } else {
        const storedStatus = readLocalStorageValue(
          `${queryStatePrefix}-status`,
        );
        if (storedStatus && hrdStatusFilters.includes(storedStatus as any)) {
          setStatusFilter(storedStatus as any);
          updateUrlParam("status", storedStatus);
        }
      }

      if (brandParam) {
        setBrandFilter(brandParam);
      } else {
        const storedBrand = readLocalStorageValue(`${queryStatePrefix}-brand`);
        if (storedBrand) {
          setBrandFilter(storedBrand);
          updateUrlParam("brand", storedBrand);
        }
      }

      if (divisionParam) {
        setDivisionFilter(divisionParam);
      } else {
        const storedDivision = readLocalStorageValue(
          `${queryStatePrefix}-division`,
        );
        if (storedDivision) {
          setDivisionFilter(storedDivision);
          updateUrlParam("division", storedDivision);
        }
      }

      if (managerParam) {
        setManagerFilter(managerParam);
      } else {
        const storedManager = readLocalStorageValue(
          `${queryStatePrefix}-manager`,
        );
        if (storedManager) {
          setManagerFilter(storedManager);
          updateUrlParam("manager", storedManager);
        }
      }
    } else {
      const statusTabParam = tabParam || normalizeQueryValue(statusParam);
      if (statusTabParam && managerTabs.includes(statusTabParam as any)) {
        setActiveTab(statusTabParam as any);
      } else {
        const storedTab = readLocalStorageValue(`${queryStatePrefix}-tab`);
        if (storedTab && managerTabs.includes(storedTab as any)) {
          setActiveTab(storedTab as any);
          updateUrlParam("status", storedTab.replace(/_/g, "-"));
        } else {
          setActiveTab("pending_coordinator");
        }
      }
    }

    if (monthParam) {
      setPeriodFilter(monthParam);
    } else {
      const storedMonth = readLocalStorageValue(`${queryStatePrefix}-month`);
      if (storedMonth) {
        setPeriodFilter(storedMonth);
        updateUrlParam("month", storedMonth);
      }
    }

    if (searchParam) {
      setSearchTerm(searchParam);
    } else {
      const storedSearch = readLocalStorageValue(`${queryStatePrefix}-search`);
      if (storedSearch) {
        setSearchTerm(storedSearch);
        updateUrlParam("search", storedSearch);
      }
    }

    hasHydratedParams.current = true;
  }, [mode, searchParams, queryStatePrefix, router, pathname]);

  const setPersistedActiveTab = (value: typeof activeTab) => {
    setActiveTab(value);
    setLocalStorageValue(`${queryStatePrefix}-tab`, value);
    if (mode === "hrd") {
      updateUrlParam("tab", value);
    } else {
      updateUrlParam("status", value.replace(/_/g, "-"));
    }
  };

  const setPersistedStatusFilter = (value: typeof statusFilter) => {
    setStatusFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-status`, value);
    updateUrlParam("status", value === "all" ? null : value);
  };

  const setPersistedBrandFilter = (value: string) => {
    setBrandFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-brand`, value);
    updateUrlParam("brand", value === "all" ? null : value);
  };

  const setPersistedDivisionFilter = (value: string) => {
    setDivisionFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-division`, value);
    updateUrlParam("division", value === "all" ? null : value);
  };

  const setPersistedManagerFilter = (value: string) => {
    setManagerFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-manager`, value);
    updateUrlParam("manager", value === "all" ? null : value);
  };

  const setPersistedPeriodFilter = (value: string) => {
    setPeriodFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-month`, value);
    updateUrlParam("month", value);
  };

  const setPersistedSearchTerm = (value: string) => {
    setSearchTerm(value);
    setLocalStorageValue(`${queryStatePrefix}-search`, value);
    updateUrlParam("search", value || null);
  };

  const getEffectiveStatus = (submission: OvertimeSubmission) =>
    (submission as any).approvalStatus || submission.status || "draft";

  const getSubmittedAt = (submission: OvertimeSubmission) =>
    parseSafeDate((submission as any).submittedAt ?? submission.createdAt) ??
    new Date(0);

  const getOvertimeDate = (submission: OvertimeSubmission) =>
    parseSafeDate((submission as any).overtimeDate ?? submission.date) ?? null;

  const submissionsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;

    if (mode === "manager") {
      return query(
        collection(firestore, "overtime_submissions"),
        or(
          where("directSupervisorUid", "==", userProfile.uid),
          where("managerUid", "==", userProfile.uid),
          where("overtimeCoordinatorUid", "==", userProfile.uid),
        ),
        orderBy("submittedAt", "desc"),
      );
    }

    if (mode === "hrd") {
      return query(
        collection(firestore, "overtime_submissions"),
        orderBy("submittedAt", "desc"),
      );
    }

    return null;
  }, [userProfile, firestore, mode]);

  const {
    data: submissions,
    isLoading,
    mutate,
  } = useCollection<OvertimeSubmission>(submissionsQuery);

  // Fetch all brands dari master data
  const brandsQuery = useMemo(
    () => query(collection(firestore, "brands")),
    [firestore]
  );

  const {
    data: allBrands = [],
    isLoading: brandsLoading,
  } = useCollection<Brand>(brandsQuery);

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();

    // Prioritas 1: Ambil dari master brands
    allBrands?.forEach((brand) => {
      const value = brand.id;
      const label = brand.name || brand.id || "Unknown";
      if (value && !map.has(value)) map.set(value, label);
    });

    // Prioritas 2: Tambahkan brand dari submissions yang belum ada di master
    submissions?.forEach((submission) => {
      const value = submission.brandId || submission.brandName || "unknown";
      const label = submission.brandName || submission.brandId || "Unknown";
      if (value && !map.has(value)) map.set(value, label);
    });

    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [allBrands, submissions]);

  const divisionOptions = useMemo(() => {
    const map = new Map<string, string>();
    submissions?.forEach((submission) => {
      const value =
        submission.divisionId ||
        submission.divisionName ||
        submission.division ||
        "unknown";
      const label = submission.divisionName || submission.division || "Unknown";
      if (!map.has(value)) map.set(value, label);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [submissions]);

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    submissions?.forEach((submission) => {
      const value =
        submission.directSupervisorUid ||
        submission.supervisorUid ||
        submission.directSupervisorName ||
        submission.supervisorName ||
        "unknown";
      const label =
        submission.directSupervisorName ||
        submission.supervisorName ||
        value ||
        "Unknown";
      if (!map.has(value)) map.set(value, label);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [submissions]);

  const activeTabStatuses = useMemo(() => {
    if (mode === "manager") {
      switch (activeTab) {
        case "pending_coordinator":
          return ["pending_coordinator"];
        case "pending_supervisor":
          return ["pending_supervisor"];
        case "riwayat_saya":
          return OVERTIME_SUBMISSION_STATUSES.filter(
            (status) =>
              status !== "pending_coordinator" &&
              status !== "pending_supervisor",
          );
        case "all":
        default:
          return OVERTIME_SUBMISSION_STATUSES;
      }
    }

    if (mode !== "hrd") return ["pending_supervisor"];

    switch (activeTab) {
      case "pending_hrd":
        return ["pending_hrd"];
      case "pending_supervisor":
        return ["pending_supervisor"];
      case "approved":
      case "rekap_payroll":
        return ["approved_hrd", "approved"];
      case "rejected":
        return ["rejected_manager", "rejected_hrd"];
      case "all":
      default:
        return OVERTIME_SUBMISSION_STATUSES;
    }
  }, [activeTab, mode]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];

    const selectedPeriodStart = periodFilter
      ? new Date(`${periodFilter}-01`)
      : null;
    const selectedPeriodEnd = selectedPeriodStart
      ? addMonths(selectedPeriodStart, 1)
      : null;

    return submissions.filter((s) => {
      const effectiveStatus = getEffectiveStatus(s);
      const overtimeDate = getOvertimeDate(s);

      // Tab filtering
      const activeTabMatch =
        mode === "manager"
          ? activeTabStatuses.includes(effectiveStatus as any)
          : mode !== "hrd" || activeTab === "all"
            ? true
            : activeTabStatuses.includes(effectiveStatus as any);
      if (!activeTabMatch) return false;

      // Role-specific filtering in manager mode
      if (mode === "manager") {
        if (activeTab === "pending_coordinator") {
          if (s.overtimeCoordinatorUid !== userProfile.uid) return false;
        } else if (activeTab === "pending_supervisor") {
          if (
            s.directSupervisorUid !== userProfile.uid &&
            s.managerUid !== userProfile.uid
          )
            return false;
        } else if (activeTab === "riwayat_saya") {
          const hasDecision =
            s.coordinatorDecisionBy === userProfile.uid ||
            (s as any).coordinatorApprovedBy === userProfile.uid ||
            s.supervisorApprovedBy === userProfile.uid ||
            s.rejectedBy === userProfile.uid ||
            s.revisionRequestedBy === userProfile.uid;
          if (!hasDecision) return false;
        }
      }

      // Status filter (only for HRD if set)
      if (
        mode === "hrd" &&
        statusFilter !== "all" &&
        effectiveStatus !== statusFilter
      )
        return false;

      // Brand and division filters (only for HRD)
      if (mode === "hrd") {
        if (brandFilter !== "all") {
          if ((s.brandId || s.brandName || "") !== brandFilter) return false;
        }

        if (divisionFilter !== "all") {
          if (
            (s.divisionId || s.divisionName || s.division || "") !==
            divisionFilter
          )
            return false;
        }

        if (managerFilter !== "all") {
          const managerId =
            s.directSupervisorUid ||
            s.supervisorUid ||
            s.directSupervisorName ||
            s.supervisorName ||
            "";
          if (managerId !== managerFilter) return false;
        }
      }

      // Period filter (both manager and HRD)
      if (selectedPeriodStart && selectedPeriodEnd) {
        if (!overtimeDate) return false;
        if (
          overtimeDate.getTime() < selectedPeriodStart.getTime() ||
          overtimeDate.getTime() >= selectedPeriodEnd.getTime()
        )
          return false;
      }

      // Search filter
      if (searchTerm) {
        const normalized = searchTerm.toLowerCase();
        const target = [s.employeeName, s.fullName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!target.includes(normalized)) return false;
      }

      return true;
    });
  }, [
    submissions,
    statusFilter,
    searchTerm,
    brandFilter,
    divisionFilter,
    periodFilter,
    activeTab,
    mode,
    activeTabStatuses,
  ]);

  const sortedSubmissions = useMemo(() => {
    const list = [...filteredSubmissions];

    if (sortOption === "duration") {
      return list.sort(
        (a, b) => (b.totalDurationMinutes || 0) - (a.totalDurationMinutes || 0),
      );
    }

    if (sortOption === "overtime_date") {
      return list.sort((a, b) => {
        const aDate = getOvertimeDate(a)?.getTime() ?? 0;
        const bDate = getOvertimeDate(b)?.getTime() ?? 0;
        return aDate - bDate;
      });
    }

    return list.sort(
      (a, b) => getSubmittedAt(b).getTime() - getSubmittedAt(a).getTime(),
    );
  }, [filteredSubmissions, sortOption]);

  const DAILY_LIMIT_MINUTES = 240; // 4 jam

  // Map: "${employeeUid}_${overtimeDateStr}" → total submitted minutes across ALL submissions for that employee+date
  const dailyOvertimeTotalMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!submissions) return map;
    submissions.forEach((s) => {
      const uid = s.employeeUid || s.uid || "";
      if (!uid) return;
      const dateVal: any = (s as any).overtimeDate ?? s.date;
      let dateStr = "";
      if (dateVal && typeof dateVal === "object" && typeof dateVal.toDate === "function") {
        dateStr = format(dateVal.toDate(), "yyyy-MM-dd");
      } else if (typeof dateVal === "string") {
        dateStr = dateVal.slice(0, 10);
      }
      if (!dateStr) return;
      const key = `${uid}_${dateStr}`;
      map.set(key, (map.get(key) || 0) + (s.totalDurationMinutes || 0));
    });
    return map;
  }, [submissions]);

  const getDailyTotal = (s: OvertimeSubmission): number => {
    const uid = s.employeeUid || s.uid || "";
    const dateVal: any = (s as any).overtimeDate ?? s.date;
    let dateStr = "";
    if (dateVal && typeof dateVal === "object" && typeof dateVal.toDate === "function") {
      dateStr = format(dateVal.toDate(), "yyyy-MM-dd");
    } else if (typeof dateVal === "string") {
      dateStr = dateVal.slice(0, 10);
    }
    if (!uid || !dateStr) return 0;
    return dailyOvertimeTotalMap.get(`${uid}_${dateStr}`) || 0;
  };

  const payrollRecapGrouped = useMemo(() => {
    if (activeTab !== "rekap_payroll") return [];

    const groups: Record<
      string,
      {
        employeeUid: string;
        employeeName: string;
        divisionName: string;
        brandName: string;
        count: number;
        totalMinutes: number;
        hasOverLimit: boolean;
        items: OvertimeSubmission[];
      }
    > = {};

    filteredSubmissions.forEach((s) => {
      const empId = s.employeeUid || s.uid || "unknown";
      const name = s.employeeName || s.fullName || "Karyawan";
      const div = s.divisionName || s.division || "-";
      const brand = s.brandName || "-";
      const approvedMinutes =
        s.approvedMinutesFinal !== undefined && s.approvedMinutesFinal !== null
          ? s.approvedMinutesFinal
          : s.totalDurationMinutes || 0;

      if (!groups[empId]) {
        groups[empId] = {
          employeeUid: empId,
          employeeName: name,
          divisionName: div,
          brandName: brand,
          count: 0,
          totalMinutes: 0,
          hasOverLimit: false,
          items: [],
        };
      }
      groups[empId].count += 1;
      groups[empId].totalMinutes += approvedMinutes;
      if (s.isOverDailyLimit) groups[empId].hasOverLimit = true;
      groups[empId].items.push(s);
    });

    return Object.values(groups).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName),
    );
  }, [filteredSubmissions, activeTab]);

  const kpis = useMemo(() => {
    if (!submissions)
      return {
        pendingHrd: 0,
        pendingManager: 0,
        approved: 0,
        rejected: 0,
        total: 0,
        pending: 0,
        revision: 0,
      };

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = addMonths(monthStart, 1);

    return submissions.reduce(
      (acc, s) => {
        const effectiveStatus = getEffectiveStatus(s);
        const overtimeDate = getOvertimeDate(s);

        if (mode === "hrd") {
          if (effectiveStatus === "pending_hrd") acc.pendingHrd++;
          if (effectiveStatus === "pending_supervisor") acc.pendingManager++;

          const decisionDate = s.hrdDecisionAt?.toDate();
          if (
            decisionDate &&
            decisionDate >= monthStart &&
            decisionDate < monthEnd
          ) {
            if (["approved", "approved_hrd"].includes(effectiveStatus))
              acc.approved++;
            if (["rejected_manager", "rejected_hrd"].includes(effectiveStatus))
              acc.rejected++;
          }

          if (
            overtimeDate &&
            overtimeDate >= monthStart &&
            overtimeDate < monthEnd
          ) {
            acc.total++;
          }
        } else {
          const isPendingCoordinator =
            effectiveStatus === "pending_coordinator" &&
            s.overtimeCoordinatorUid === userProfile.uid;
          const isPendingSupervisor =
            effectiveStatus === "pending_supervisor" &&
            (s.directSupervisorUid === userProfile.uid ||
              s.managerUid === userProfile.uid);

          if (isPendingCoordinator || isPendingSupervisor) acc.pending++;

          if (
            effectiveStatus === "revision_manager" ||
            effectiveStatus === "revision_requested_by_coordinator"
          ) {
            acc.revision++;
          }

          const coordinatorDecisionDate =
            s.coordinatorDecisionAt?.toDate?.() ||
            (typeof s.coordinatorDecisionAt === "string"
              ? new Date(s.coordinatorDecisionAt)
              : null);
          const supervisorDecisionDate =
            s.supervisorApprovedAt?.toDate?.() ||
            (typeof s.supervisorApprovedAt === "string"
              ? new Date(s.supervisorApprovedAt)
              : null);
          const managerDecisionDate =
            s.managerDecisionAt?.toDate?.() ||
            (typeof s.managerDecisionAt === "string"
              ? new Date(s.managerDecisionAt)
              : null);

          const hasApprovedThisMonth =
            (s.coordinatorDecision === "approved" &&
              (s.coordinatorDecisionBy === userProfile.uid ||
                (s as any).coordinatorApprovedBy === userProfile.uid) &&
              coordinatorDecisionDate &&
              coordinatorDecisionDate >= monthStart &&
              coordinatorDecisionDate < monthEnd) ||
            (s.supervisorApprovedBy === userProfile.uid &&
              supervisorDecisionDate &&
              supervisorDecisionDate >= monthStart &&
              supervisorDecisionDate < monthEnd) ||
            (effectiveStatus === "approved_by_manager" &&
              managerDecisionDate &&
              managerDecisionDate >= monthStart &&
              managerDecisionDate < monthEnd);

          if (hasApprovedThisMonth) acc.approved++;

          const rejectedDate =
            s.rejectedAt?.toDate?.() ||
            (typeof s.rejectedAt === "string" ? new Date(s.rejectedAt) : null);
          const hasRejectedThisMonth =
            s.rejectedBy === userProfile.uid &&
            rejectedDate &&
            rejectedDate >= monthStart &&
            rejectedDate < monthEnd;

          if (hasRejectedThisMonth) acc.rejected++;
        }

        return acc;
      },
      {
        pendingHrd: 0,
        pendingManager: 0,
        approved: 0,
        rejected: 0,
        total: 0,
        pending: 0,
        revision: 0,
      },
    );
  }, [submissions, userProfile]);

  const userRoles = useMemo(() => {
    if (!submissions || !userProfile)
      return { isCoordinator: false, isManager: false };
    let isCoordinator = false;
    let isManager = false;
    for (const s of submissions) {
      if (s.overtimeCoordinatorUid === userProfile.uid) isCoordinator = true;
      if (
        s.directSupervisorUid === userProfile.uid ||
        s.managerUid === userProfile.uid
      )
        isManager = true;
    }
    return { isCoordinator, isManager };
  }, [submissions, userProfile]);

  const organizationTitle = useMemo(() => {
    if (!userProfile) return "—";
    const lookup = [
      userProfile.jobTitle,
      (userProfile as any).jabatan,
      (userProfile as any).position,
      (userProfile as any).structuralPositionLabel,
      userProfile.workRole,
      (userProfile as any).title,
      (userProfile as any).roleDisplayName,
      (userProfile as any).organizationRoleName,
    ];

    const value = lookup.find(
      (item) => typeof item === "string" && item.trim() !== "",
    ) as string | undefined;

    return value || userProfile.positionTitle || "—";
  }, [userProfile]);

  const dynamicRoleLabel = useMemo(() => {
    if (activeTab === "pending_coordinator") {
      return "Koordinator / Pengawas Lembur";
    }
    if (activeTab === "pending_supervisor") {
      return "Manager Divisi / Atasan Langsung";
    }
    const { isCoordinator, isManager } = userRoles;
    if (isCoordinator && isManager) {
      return "Koordinator & Manager Divisi";
    }
    if (isCoordinator) {
      return "Koordinator / Pengawas Lembur";
    }
    return "Manager Divisi / Atasan Langsung";
  }, [activeTab, userRoles]);

  const isUserTurn = (s: OvertimeSubmission) => {
    if (!userProfile) return false;
    const status = s.status || (s as any).approvalStatus || "draft";

    if (mode === "hrd") {
      return [
        "pending_hrd",
        "approved_by_manager",
        "revision_hrd",
        "revision_requested_by_hrd",
        "verified_manager",
      ].includes(status);
    }

    if (mode === "manager") {
      if (status === "pending_coordinator") {
        return s.overtimeCoordinatorUid === userProfile.uid;
      }
      if (
        status === "pending_supervisor" ||
        status === "pending_manager" ||
        status === "revision_manager"
      ) {
        return (
          s.directSupervisorUid === userProfile.uid ||
          s.managerUid === userProfile.uid
        );
      }
    }

    return false;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {mode === "hrd" ? (
          <>
            <KpiCard title="Menunggu Review HRD" value={kpis.pendingHrd} />
            <KpiCard
              title="Dalam Review Manager"
              value={kpis.pendingManager}
              deltaType="inverse"
            />
            <KpiCard title="Disetujui Bulan Ini" value={kpis.approved} />
            <KpiCard
              title="Ditolak Bulan Ini"
              value={kpis.rejected}
              deltaType="inverse"
            />
            <KpiCard title="Total Lembur Bulan Ini" value={kpis.total} />
          </>
        ) : (
          <>
            <KpiCard title="Menunggu Persetujuan Anda" value={kpis.pending} />
            <KpiCard title="Disetujui Bulan Ini" value={kpis.approved} />
            <KpiCard
              title="Ditolak Bulan Ini"
              value={kpis.rejected}
              deltaType="inverse"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Persetujuan Lembur Tim</CardTitle>
              <CardDescription>
                {mode === "manager"
                  ? "Tinjau dan setujui pengajuan lembur staff Anda sebagai Koordinator atau Manager Divisi."
                  : "Tinjau dan setujui pengajuan lembur staff Anda sebagai HRD."}
              </CardDescription>
            </div>
            <div className="w-full">
              {mode === "hrd" ? (
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setPersistedActiveTab(value as any)}
                >
                  <TabsList className="grid w-full grid-cols-6 gap-1">
                    <TabsTrigger value="pending_hrd">Menunggu HRD</TabsTrigger>
                    <TabsTrigger value="pending_supervisor">
                      Dalam Review Manager
                    </TabsTrigger>
                    <TabsTrigger value="approved">Disetujui</TabsTrigger>
                    <TabsTrigger value="rejected">Ditolak</TabsTrigger>
                    <TabsTrigger value="rekap_payroll">
                      Rekap Payroll
                    </TabsTrigger>
                    <TabsTrigger value="all">Semua Riwayat</TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : (
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setPersistedActiveTab(value as any)}
                >
                  <TabsList className="grid w-full grid-cols-4 gap-1">
                    <TabsTrigger value="pending_coordinator">
                      Sebagai Koordinator
                    </TabsTrigger>
                    <TabsTrigger value="pending_supervisor">
                      Sebagai Manager Divisi
                    </TabsTrigger>
                    <TabsTrigger value="riwayat_saya">
                      Riwayat Keputusan Saya
                    </TabsTrigger>
                    <TabsTrigger value="all">Semua Pengajuan</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
          </div>

          {mode === "manager" && userProfile ? (
            <div className="rounded-2xl border border-teal-200/60 bg-teal-50/40 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Scope Persetujuan Anda
                  </p>
                  <p className="text-xs text-slate-500">
                    Sebagai {dynamicRoleLabel}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Brand
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">
                    {userProfile.brandName || userProfile.brandId || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Divisi
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">
                    {userProfile.divisionName || userProfile.division || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Jabatan Organisasi
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">
                    {organizationTitle}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Fungsi Approval Saat Ini
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-teal-700">
                    {dynamicRoleLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={`grid gap-3 items-end ${
              mode === "hrd"
                ? "md:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1.1fr_1.1fr_1.8fr]"
                : "lg:grid-cols-[1fr_1.8fr]"
            }`}
          >
            {mode === "hrd" && (
              <>
                <Select
                  value={brandFilter}
                  onValueChange={(val) => setPersistedBrandFilter(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brandOptions.map((brand) => (
                      <SelectItem key={brand.value} value={brand.value}>
                        {brand.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={divisionFilter}
                  onValueChange={(val) => setPersistedDivisionFilter(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {divisionOptions.map((division) => (
                      <SelectItem key={division.value} value={division.value}>
                        {division.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={managerFilter}
                  onValueChange={(val) => setPersistedManagerFilter(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Manager Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Manager</SelectItem>
                    {managerOptions.map((manager) => (
                      <SelectItem key={manager.value} value={manager.value}>
                        {manager.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {mode === "hrd" && (
              <Select
                value={statusFilter}
                onValueChange={(val) => setPersistedStatusFilter(val as any)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending_hrd">Menunggu HRD</SelectItem>
                  <SelectItem value="pending_supervisor">
                    Dalam Review Manager Divisi
                  </SelectItem>
                  <SelectItem value="approved">Disetujui</SelectItem>
                  <SelectItem value="approved_hrd">Disetujui HRD</SelectItem>
                  <SelectItem value="rejected_manager">
                    Ditolak Manager Divisi
                  </SelectItem>
                  <SelectItem value="rejected_hrd">Ditolak HRD</SelectItem>
                  <SelectItem value="revision_manager">
                    Revisi Manager Divisi
                  </SelectItem>
                  <SelectItem value="revision_hrd">Revisi HRD</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Input
              type="month"
              value={periodFilter}
              onChange={(event) => setPersistedPeriodFilter(event.target.value)}
              placeholder="Periode"
            />
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={
                  mode === "hrd" ? "Cari karyawan..." : "Cari nama staff..."
                }
                value={searchTerm}
                onChange={(e) => setPersistedSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {mode === "hrd" && activeTab === "pending_supervisor" && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <AlertTitle>Menunggu Manager Divisi</AlertTitle>
              <AlertDescription>
                Belum masuk antrean HRD karena belum disetujui Manager Divisi.
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Memuat daftar pengajuan...
            </div>
          ) : activeTab === "rekap_payroll" ? (
            payrollRecapGrouped.length > 0 ? (
              <div className="space-y-4">
                {/* Rekap Payroll Header Card */}
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-teal-200/70 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-200/60">
                      <span className="text-base">📊</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        Rekapitulasi Lembur Bulanan
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Total akumulasi jam lembur yang disetujui (siap payroll)
                        untuk periode {periodFilter}.
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-teal-50 border border-teal-200 text-teal-700 font-bold px-3 py-1 text-xs">
                    {payrollRecapGrouped.length} Karyawan Terdaftar
                  </Badge>
                </div>

                {/* Main Payroll Table */}
                <div className="min-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="border-slate-200 hover:bg-slate-50">
                        <TableHead className="px-6 py-4 text-left text-xs uppercase font-bold text-slate-500 w-10"></TableHead>
                        <TableHead className="px-3 py-4 text-left text-xs uppercase font-bold text-slate-500">
                          Nama Karyawan
                        </TableHead>
                        <TableHead className="px-3 py-4 text-left text-xs uppercase font-bold text-slate-500">
                          Brand / Divisi
                        </TableHead>
                        <TableHead className="px-3 py-4 text-center text-xs uppercase font-bold text-slate-500 w-32">
                          Frekuensi Lembur
                        </TableHead>
                        <TableHead className="px-3 py-4 text-right text-xs uppercase font-bold text-teal-600 w-48">
                          Total Durasi Payroll
                        </TableHead>
                        <TableHead className="px-6 py-4 text-right text-xs uppercase font-bold text-slate-500 w-32">
                          Aksi
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollRecapGrouped.map((g) => {
                        const isExpanded = expandedEmployeeId === g.employeeUid;
                        const totalHours = Math.floor(g.totalMinutes / 60);
                        const totalMins = g.totalMinutes % 60;
                        const durationLabel =
                          totalHours > 0
                            ? `${totalHours} jam ${totalMins} menit`
                            : `${totalMins} menit`;

                        return (
                          <Fragment key={g.employeeUid}>
                            <TableRow
                              className="border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                              onClick={() =>
                                setExpandedEmployeeId(
                                  isExpanded ? null : g.employeeUid,
                                )
                              }
                            >
                              <TableCell className="px-6 py-4 text-center">
                                <span className="text-slate-400 font-mono text-xs group-hover:text-teal-500 transition-colors">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              </TableCell>
                              <TableCell className="px-3 py-4 font-semibold text-sm text-slate-900">
                                {g.employeeName}
                              </TableCell>
                              <TableCell className="px-3 py-4 text-sm text-slate-500">
                                {g.brandName} / {g.divisionName}
                              </TableCell>
                              <TableCell className="px-3 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <Badge
                                    variant="outline"
                                    className="bg-slate-50 border-slate-200 text-slate-600 font-bold px-2 py-0.5"
                                  >
                                    {g.count}x Kerja
                                  </Badge>
                                  {g.hasOverLimit && (
                                    <Badge
                                      variant="outline"
                                      className="bg-amber-50 border-amber-200 text-amber-700 font-semibold px-2 py-0.5 text-[10px] flex items-center gap-1"
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Ada Durasi Tinggi
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-4 text-right font-black text-sm text-teal-600">
                                {durationLabel}
                              </TableCell>
                              <TableCell
                                className="px-6 py-4 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl text-xs transition-colors"
                                  onClick={() =>
                                    setExpandedEmployeeId(
                                      isExpanded ? null : g.employeeUid,
                                    )
                                  }
                                >
                                  {isExpanded ? "Tutup" : "Rincian"}
                                </Button>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow
                                key={`${g.employeeUid}-details`}
                                className="bg-teal-50/30 border-teal-100 hover:bg-teal-50/30"
                              >
                                <TableCell colSpan={6} className="px-8 py-4">
                                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                                      <span>📋</span> Rincian Lembur Disetujui
                                    </h5>
                                    <Table>
                                      <TableHeader className="bg-slate-50">
                                        <TableRow className="border-slate-200">
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Tanggal
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Jam Kerja
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Lokasi
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Pekerjaan
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500 text-right">
                                            Diajukan
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-teal-600 text-right">
                                            Disetujui Payroll
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-amber-600 text-right">
                                            Kelebihan &gt;4 Jam
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500 text-right">
                                            Aksi
                                          </TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {g.items.map((item) => {
                                          const ovDate = getOvertimeDate(item);
                                          const itemMinutes =
                                            item.approvedMinutesFinal !==
                                              undefined &&
                                            item.approvedMinutesFinal !== null
                                              ? item.approvedMinutesFinal
                                              : item.totalDurationMinutes || 0;

                                          const itemHours = Math.floor(
                                            itemMinutes / 60,
                                          );
                                          const itemMins = itemMinutes % 60;
                                          const itemDurationLabel =
                                            itemHours > 0
                                              ? `${itemHours} jam ${itemMins} menit`
                                              : `${itemMins} menit`;

                                          const taskDesc =
                                            (item.taskDetails &&
                                              item.taskDetails[0]
                                                ?.description) ||
                                            (item.tasks &&
                                              item.tasks[0]?.description) ||
                                            item.reason ||
                                            "-";

                                          return (
                                            <TableRow
                                              key={item.id}
                                              className="border-slate-100 hover:bg-slate-50/60"
                                            >
                                              <TableCell className="py-2 text-xs text-slate-700">
                                                {ovDate
                                                  ? format(
                                                      ovDate,
                                                      "dd MMMM yyyy",
                                                      { locale: idLocale },
                                                    )
                                                  : "-"}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-slate-500 font-mono">
                                                {item.startTime} -{" "}
                                                {item.endTime}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-slate-700">
                                                {getWorkLocationDisplay(item)}
                                              </TableCell>
                                              <TableCell
                                                className="py-2 text-xs text-slate-500 truncate max-w-[200px]"
                                                title={taskDesc}
                                              >
                                                {taskDesc}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-slate-500 text-right">
                                                {item.totalDurationMinutes
                                                  ? `${Math.floor(item.totalDurationMinutes / 60)}j ${item.totalDurationMinutes % 60}m`
                                                  : "-"}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs font-bold text-teal-600 text-right">
                                                {itemDurationLabel}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-right">
                                                {item.isOverDailyLimit && item.overtimeExcessMinutes ? (
                                                  <div className="flex items-center justify-end gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                                    <span className="font-semibold text-amber-600">
                                                      +{Math.floor((item.overtimeExcessMinutes || 0) / 60)}j {(item.overtimeExcessMinutes || 0) % 60}m
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className="text-slate-300">—</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-right">
                                                <Button
                                                  variant="link"
                                                  size="sm"
                                                  className="h-auto p-0 text-teal-600 hover:text-teal-700 font-semibold"
                                                  onClick={() =>
                                                    setSelectedSubmission(item)
                                                  }
                                                >
                                                  Lihat Dialog
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-64 items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">
                  Tidak ada rekap payroll ditemukan.
                </h3>
                <p className="text-sm text-slate-500 mt-2 max-w-xs">
                  Coba ubah periode atau filter pencarian untuk melihat data
                  payroll disetujui lainnya.
                </p>
              </div>
            )
          ) : sortedSubmissions.length > 0 ? (
            <div className="min-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      {mode === "hrd" ? "Karyawan" : "Staff"}
                    </TableHead>
                    {mode === "hrd" ? (
                      <>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Brand / Divisi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Manager Divisi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Tanggal & Durasi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Status
                        </TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Tanggal & Jam Lembur
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Durasi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Lokasi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Ringkasan Pekerjaan
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Status
                        </TableHead>
                      </>
                    )}
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSubmissions.map((s) => {
                    const effectiveStatus = getEffectiveStatus(s) as any;
                    const overtimeDate = getOvertimeDate(s);
                    const summaryTask =
                      (s.taskDetails && s.taskDetails[0]?.description) ||
                      (s.tasks && s.tasks[0]?.description) ||
                      s.reason ||
                      "-";
                    const isTurn = isUserTurn(s);
                    const actionLabel = isTurn ? "Review" : "Detail";

                    const dailyTotal = getDailyTotal(s);
                    const isOverLimit = dailyTotal > DAILY_LIMIT_MINUTES;

                    return (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => setSelectedSubmission(s)}
                      >
                        <TableCell className="px-3 py-3 align-top">
                          <div className="font-medium text-sm truncate">
                            {s.employeeName || s.fullName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {s.workRole || s.positionTitle || "-"}
                          </div>
                          {mode === "manager" ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {s.overtimeCoordinatorUid === userProfile?.uid ? (
                                <Badge
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px] font-semibold"
                                >
                                  Sebagai Koordinator
                                </Badge>
                              ) : null}
                              {s.directSupervisorUid === userProfile?.uid ||
                              s.managerUid === userProfile?.uid ? (
                                <Badge
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px] font-semibold"
                                >
                                  Sebagai Manager Divisi
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                        {mode === "hrd" ? (
                          <>
                            <TableCell className="px-3 py-3 align-top">
                              {(s.brandName || "-") +
                                " / " +
                                (s.divisionName || s.division || "-")}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              {s.directSupervisorName ||
                                s.supervisorName ||
                                "-"}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm truncate">
                                {overtimeDate
                                  ? format(overtimeDate, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })
                                  : "-"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.startTime} - {s.endTime} ·{" "}
                                {s.approvedMinutesFinal !== undefined &&
                                s.approvedMinutesFinal !== null
                                  ? `${s.approvedMinutesFinal}m final`
                                  : `${s.totalDurationMinutes}m ajuan`}
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm truncate">
                                {overtimeDate
                                  ? format(overtimeDate, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })
                                  : "-"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.startTime} - {s.endTime}
                              </div>
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              {s.totalDurationMinutes} menit
                              {s.approvedMinutesFinal !== undefined &&
                                s.approvedMinutesFinal !== null &&
                                s.approvedMinutesFinal !==
                                  s.totalDurationMinutes && (
                                  <div className="text-[10px] text-amber-500 font-medium mt-1">
                                    Durasi final HRD:{" "}
                                    {Math.floor(s.approvedMinutesFinal / 60)}{" "}
                                    jam {s.approvedMinutesFinal % 60}m, dari
                                    pengajuan{" "}
                                    {Math.floor(s.totalDurationMinutes / 60)}{" "}
                                    jam {s.totalDurationMinutes % 60}m
                                  </div>
                                )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              {getWorkLocationDisplay(s)}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <p className="text-sm truncate">{summaryTask}</p>
                            </TableCell>
                          </>
                        )}
                        <TableCell className="px-3 py-3 align-top">
                          <OvertimeApprovalStatusBadge
                            status={effectiveStatus}
                            mode={mode}
                            divisionName={s.divisionName || s.division}
                            payrollStatus={s.payrollStatus}
                          />
                          {isOverLimit && (
                            <div className="mt-1.5 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 w-fit">
                              <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              <span className="text-[10px] font-semibold text-amber-700 leading-tight">
                                {s.isOverDailyLimit !== undefined ? "Melebihi Acuan 4 Jam" : "Perlu Review Durasi"}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top text-right">
                          <Button
                            variant={isTurn ? "default" : "outline"}
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSubmission(s);
                            }}
                            className={
                              isTurn
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                                : ""
                            }
                          >
                            {actionLabel}
                          </Button>
                          {mode === "manager" &&
                            !isTurn &&
                            effectiveStatus === "pending_coordinator" &&
                            (s.directSupervisorUid === userProfile?.uid ||
                              s.managerUid === userProfile?.uid) && (
                              <div className="text-[10px] text-amber-500 font-medium mt-1 leading-tight max-w-[120px] ml-auto">
                                Menunggu persetujuan Koordinator terlebih
                                dahulu.
                              </div>
                            )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col h-64 items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">
                {mode === "manager" && activeTab === "perlu_diproses"
                  ? "Tidak ada pengajuan yang perlu Anda proses saat ini."
                  : "Tidak ada pengajuan ditemukan."}
              </h3>
              <p className="text-sm text-slate-500 mt-2 max-w-xs">
                {mode === "manager" && activeTab === "perlu_diproses"
                  ? "Semua pengajuan staff Anda telah diproses atau belum ada pengajuan baru."
                  : "Coba ubah filter atau periode untuk melihat data lainnya."}
              </p>
              {mode === "manager" && activeTab === "perlu_diproses" && (
                <Button
                  variant="outline"
                  className="mt-6 rounded-xl border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600"
                  onClick={() => setPersistedActiveTab("riwayat_saya")}
                >
                  Lihat Riwayat Saya
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSubmission && (
        <ReviewOvertimeDialog
          open={!!selectedSubmission}
          onOpenChange={(open) => !open && setSelectedSubmission(null)}
          submission={selectedSubmission}
          onSuccess={() => {
            mutate();
            if (mode === "manager") {
              setPersistedActiveTab("riwayat_saya");
            }
          }}
          mode={mode}
          dailyTotalMinutes={getDailyTotal(selectedSubmission)}
        />
      )}
    </div>
  );
}
