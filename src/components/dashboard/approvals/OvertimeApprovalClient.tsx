"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import type { OvertimeSubmission, UserProfile, Brand } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { useRouter, usePathname, useSearchParams } from "@/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, UserCheck } from "lucide-react";
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

export function OvertimeApprovalClient({ mode }: OvertimeApprovalClientProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasHydratedParams = useRef(false);

  const [statusFilter, setStatusFilter] = useState<
    OvertimeSubmission["status"] | "all"
  >(mode === "manager" ? "pending_supervisor" : "all");
  const [activeTab, setActiveTab] = useState<
    | "pending_hrd"
    | "pending_supervisor"
    | "approved"
    | "rejected"
    | "all"
    | "perlu_diproses"
    | "riwayat_saya"
  >(mode === "hrd" ? "pending_hrd" : "perlu_diproses");
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

  const managerTabs = ["perlu_diproses", "riwayat_saya", "all"] as const;
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
        where("directSupervisorUid", "==", userProfile.uid),
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

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    submissions?.forEach((submission) => {
      const value = submission.brandId || submission.brandName || "unknown";
      const label = submission.brandName || submission.brandId || "Unknown";
      if (!map.has(value)) map.set(value, label);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [submissions]);

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
        case "perlu_diproses":
          return ["pending_supervisor"];
        case "riwayat_saya":
          return [
            "pending_hrd",
            "approved",
            "approved_hrd",
            "revision_manager",
            "rejected_manager",
            "revision_hrd",
            "rejected_hrd",
          ];
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
          if (effectiveStatus === "pending_supervisor") acc.pending++;
          if (effectiveStatus === "revision_manager") acc.revision++;

          const decisionDate = s.managerDecisionAt?.toDate();
          if (
            decisionDate &&
            decisionDate >= monthStart &&
            decisionDate < monthEnd
          ) {
            if (effectiveStatus === "approved_by_manager") acc.approved++;
            if (effectiveStatus === "rejected_manager") acc.rejected++;
          }
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
  }, [submissions, mode]);

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
                Tinjau dan setujui pengajuan lembur staff Anda sebagai Manager Divisi.
              </CardDescription>
            </div>
            {mode === "hrd" && (
              <div className="w-full">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setPersistedActiveTab(value as any)}
                >
                  <TabsList className="grid w-full grid-cols-5 gap-1">
                    <TabsTrigger value="pending_hrd">Menunggu HRD</TabsTrigger>
                    <TabsTrigger value="pending_supervisor">
                      Dalam Review Manager
                    </TabsTrigger>
                    <TabsTrigger value="approved">Disetujui</TabsTrigger>
                    <TabsTrigger value="rejected">Ditolak</TabsTrigger>
                    <TabsTrigger value="all">Semua Riwayat</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>

          {mode === "manager" && userProfile ? (
            <Card className="rounded-3xl border border-border bg-muted p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-900 dark:bg-slate-200/10 dark:text-slate-100">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Scope Persetujuan Anda
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sebagai Manager Divisi / Atasan Langsung
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Brand
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {userProfile.brandName || userProfile.brandId || "—"}
                  </p>
                </div>
                <div className="rounded-3xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Divisi
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {userProfile.divisionName || userProfile.division || "—"}
                  </p>
                </div>
                <div className="rounded-3xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Peran
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    Manager Divisi / Atasan Langsung
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <div
            className={`grid gap-3 items-end ${
              mode === "hrd"
                ? "md:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1.1fr_1.1fr_1.8fr]"
                : "lg:grid-cols-[1fr_1fr_1.8fr]"
            }`}
          >
            {mode === "manager" && (
              <Select
                value={activeTab}
                onValueChange={(val) => setPersistedActiveTab(val as any)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="perlu_diproses">Perlu Diproses</SelectItem>
                  <SelectItem value="riwayat_saya">Riwayat Saya</SelectItem>
                  <SelectItem value="all">Semua Pengajuan</SelectItem>
                </SelectContent>
              </Select>
            )}

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
                    const actionLabel =
                      mode === "hrd" && effectiveStatus !== "pending_hrd"
                        ? "Lihat"
                        : "Review";

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
                                {s.totalDurationMinutes} menit
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
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              {s.workLocationLabel ||
                                s.workLocation ||
                                s.location ||
                                "-"}
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
                          />
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSubmission(s);
                            }}
                          >
                            {actionLabel}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col h-64 items-center justify-center text-center p-8 bg-muted/20 rounded-3xl border-2 border-dashed border-border/50">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-slate-200">
                {mode === "manager" && activeTab === "perlu_diproses" 
                  ? "Tidak ada pengajuan yang perlu Anda proses saat ini."
                  : "Tidak ada pengajuan ditemukan."}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                {mode === "manager" && activeTab === "perlu_diproses"
                  ? "Semua pengajuan staff Anda telah diproses atau belum ada pengajuan baru."
                  : "Coba ubah filter atau periode untuk melihat data lainnya."}
              </p>
              {mode === "manager" && activeTab === "perlu_diproses" && (
                <Button 
                  variant="outline" 
                  className="mt-6 rounded-xl"
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
        />
      )}
    </div>
  );
}
