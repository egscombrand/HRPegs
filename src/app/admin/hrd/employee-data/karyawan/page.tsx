"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type {
  UserProfile,
  Brand,
  EmployeeProfile,
  EmployeeMasterData,
} from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Upload,
  Download,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Loader2,
  FileSpreadsheet,
  GraduationCap,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  CreditCard,
  Shield,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { ImportDialog } from "@/components/dashboard/hrd/ImportDialog";
import { calculateProfileCompleteness } from "@/lib/employee-completeness";
import { useRouter, useSearchParams } from "next/navigation";
import { BankChangeReviewModal } from "@/components/dashboard/hrd/BankChangeReviewModal";
import {
  normalizeEmployeeOperationalStatus,
  getOperationalStatusLabel,
  getOperationalStatusVariant,
  OperationalStatus,
} from "@/lib/employee-status";
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { cn } from "@/lib/utils";

/** Merged view of a single employee from all 3 sources */
interface MergedEmployee {
  uid: string;
  fullName: string;
  email: string;
  employeeNumber?: string;
  positionTitle?: string;
  division?: string;
  brandId?: string;
  brandName?: string;
  employmentStatus?: string;
  employmentType?: string;
  joinDate?: any;
  employeeProfile?: EmployeeProfile | null;
  hrdEmploymentInfo?: any;
  hasProfile: boolean;
  operationalStatus: OperationalStatus;
  operationalStatusLabel: string;
  needsHrdAttention: boolean;
  pendingBankRequest?: any;
}

function StatusKepegawaanBadge({ status }: { status: OperationalStatus }) {
  const label = getOperationalStatusLabel(status);
  const variant = getOperationalStatusVariant(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0 h-5 text-[10px] font-semibold uppercase tracking-wider",
        variant === "success"
          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          : variant === "warning"
            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
            : variant === "info"
              ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
              : variant === "destructive"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-slate-500/10 text-slate-400 border-slate-500/20",
      )}
    >
      {label}
    </Badge>
  );
}

function AdminCheckIcons({
  profile,
  pendingBankRequest,
}: {
  profile?: EmployeeProfile | null;
  pendingBankRequest?: any;
}) {
  const rek = profile?.dataRekening;
  const doc = profile?.dokumenAdministratif;

  return (
    <div className="flex flex-wrap gap-1">
      {pendingBankRequest ? (
        <Badge
          variant="outline"
          className="border-amber-500/30 text-amber-500 bg-amber-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          REK: Pending
        </Badge>
      ) : rek?.bankName ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          REK: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          REK: Belum Ada
        </Badge>
      )}

      {doc?.npwpPhotoUrl ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          NPWP: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          NPWP: Belum Ada
        </Badge>
      )}

      {doc?.bpjsKesehatanPhotoUrl ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS Kes: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS Kes: Belum Ada
        </Badge>
      )}

      {doc?.bpjsKetenagakerjaanPhotoUrl ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS TK: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS TK: Belum Ada
        </Badge>
      )}
    </div>
  );
}

function getActionNeededStatus(employee: MergedEmployee): {
  status: string;
  priority: number;
  color: string;
  bgColor: string;
  textColor: string;
} {
  const profile = employee.employeeProfile;
  const rek = profile?.dataRekening;
  const doc = profile?.dokumenAdministratif;

  // Priority order: pending review > missing required docs > incomplete data > complete
  if (employee.pendingBankRequest) {
    return {
      status: "Rekening Pending Review",
      priority: 4,
      color: "border-amber-500/30",
      bgColor: "bg-amber-500/10",
      textColor: "text-amber-500",
    };
  }

  const missingDocs = [];
  if (!doc?.npwpPhotoUrl) missingDocs.push("NPWP");
  if (!doc?.bpjsKesehatanPhotoUrl) missingDocs.push("BPJS Kes");
  if (!doc?.bpjsKetenagakerjaanPhotoUrl) missingDocs.push("BPJS TK");

  if (missingDocs.length > 0) {
    return {
      status: `${missingDocs.join(", ")} Belum Ada`,
      priority: 3,
      color: "border-red-500/30",
      bgColor: "bg-red-500/10",
      textColor: "text-red-500",
    };
  }

  const completeness = calculateProfileCompleteness(profile ?? null);
  if (completeness.status === "not_started") {
    return {
      status: "Data Belum Lengkap",
      priority: 2,
      color: "border-orange-500/30",
      bgColor: "bg-orange-500/10",
      textColor: "text-orange-500",
    };
  }

  if (completeness.status === "partial") {
    return {
      status: "Data Tidak Lengkap",
      priority: 1,
      color: "border-slate-500/30",
      bgColor: "bg-slate-500/10",
      textColor: "text-slate-400",
    };
  }

  return {
    status: "Tidak Ada Masalah",
    priority: 0,
    color: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-500",
  };
}

function generateEmployeeId(employee: MergedEmployee, index: number): string {
  if (employee.employeeNumber) {
    return employee.employeeNumber;
  }
  // Generate fallback ID based on index
  return `EMP-${String(index + 1).padStart(4, "0")}`;
}

function SummaryCard({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="flex-1 min-w-[120px] bg-slate-900/40 border border-slate-800/50 p-3 rounded-xl hover:border-slate-700 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2 rounded-lg", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl md:text-3xl font-black text-white">
          {count}
        </span>
      </div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
        {label}
      </p>
    </div>
  );
}

export default function KaryawanDataPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();
  const { toast } = useToast();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const [activeTab, setActiveTab] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [completenessFilter, setCompletenessFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [actionNeededFilter, setActionNeededFilter] = useState("all");
  const [sortBy, setSortBy] = useState<
    | "name-asc"
    | "name-desc"
    | "completeness-asc"
    | "completeness-desc"
    | "needs-review"
  >("name-asc");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Set initial tab from query param if available
  useMemo(() => {
    const filter = searchParams.get("filter");
    if (filter === "review") {
      setActiveTab("review");
    }
  }, [searchParams]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [completenessFilter, actionNeededFilter, searchTerm, sortBy]);

  const [selectedReviewEmp, setSelectedReviewEmp] =
    useState<MergedEmployee | null>(null);
  const [selectedReviewReq, setSelectedReviewReq] = useState<any | null>(null);

  const { data: pendingBankRequests, mutate: mutateBankRequests } =
    useCollection<any>(
      useMemoFirebase(
        () =>
          query(
            collection(firestore, "bank_change_requests"),
            where("status", "==", "pending"),
          ),
        [firestore],
      ),
    );

  const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(
    useMemoFirebase(() => collection(firestore, "users"), [firestore]),
  );

  const {
    data: employees,
    isLoading: employeesLoading,
    mutate,
  } = useCollection<EmployeeMasterData>(
    useMemoFirebase(() => collection(firestore, "employees"), [firestore]),
  );

  const { data: employeeProfiles, isLoading: profilesLoading } =
    useCollection<EmployeeProfile>(
      useMemoFirebase(
        () => collection(firestore, "employee_profiles"),
        [firestore],
      ),
    );

  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const isLoading = usersLoading || employeesLoading || profilesLoading;

  const allMerged = useMemo<MergedEmployee[]>(() => {
    if (isLoading) return [];

    const profilesByUid = new Map<string, EmployeeProfile>();
    const profilesByEmail = new Map<string, EmployeeProfile>();
    (employeeProfiles ?? []).forEach((p) => {
      if (p.uid) profilesByUid.set(p.uid, p);
      if (p.email) profilesByEmail.set(p.email.toLowerCase(), p);
    });

    const seen = new Set<string>();
    const result: MergedEmployee[] = [];
    const systemRoles = [
      "super-admin",
      "system-admin",
      "admin-system",
      "super_admin",
      "system_admin",
      "admin_system",
    ];

    const getProfile = (uid: string, email?: string) => {
      return (
        profilesByUid.get(uid) ??
        (email ? profilesByEmail.get(email.toLowerCase()) : undefined) ??
        null
      );
    };

    (employees ?? []).forEach((emp) => {
      const user = users?.find((u) => u.uid === emp.uid);
      if (user && user.role && systemRoles.includes(user.role)) return;

      const profile = getProfile(emp.uid, emp.email);
      seen.add(emp.uid);

      const normalized = normalizeEmployeeRow(emp, profile, user, brands || []);

      result.push({
        uid: emp.uid,
        fullName:
          emp.fullName ||
          profile?.fullName ||
          profile?.dataDiriIdentitas?.fullName ||
          "",
        email: emp.email || profile?.email || "",
        employeeNumber:
          (emp.employeeNumber || profile?.employeeNumber) ?? undefined,
        positionTitle: normalized.jabatan,
        division: normalized.divisi,
        brandId: normalized.brandId,
        brandName: normalized.brandName,
        employmentStatus:
          emp.employmentStatus || profile?.hrdEmploymentInfo?.statusKerja || "",
        employmentType: normalized.tipeKaryawan,
        joinDate: emp.joinDate ?? emp.startDate,
        employeeProfile: profile,
        hrdEmploymentInfo: profile?.hrdEmploymentInfo || {},
        hasProfile: !!profile,
        operationalStatus: normalized.statusKerja,
        operationalStatusLabel: getOperationalStatusLabel(
          normalized.statusKerja,
        ),
        needsHrdAttention: normalized.needsHrdAttention,
        pendingBankRequest: pendingBankRequests?.find(
          (r) => r.employeeUid === emp.uid,
        ),
      });
    });

    (users ?? []).forEach((u) => {
      if (seen.has(u.uid)) return;
      if (u.role && systemRoles.includes(u.role)) return;
      if (u.role === "kandidat") return;

      const profile = getProfile(u.uid, u.email);
      seen.add(u.uid);

      const normalized = normalizeEmployeeRow(u, profile, u, brands || []);

      result.push({
        uid: u.uid,
        fullName: u.fullName || profile?.fullName || "",
        email: u.email || "",
        employeeNumber: profile?.employeeNumber ?? undefined,
        positionTitle: normalized.jabatan,
        division: normalized.divisi,
        brandId: normalized.brandId,
        brandName: normalized.brandName,
        employmentStatus: profile?.hrdEmploymentInfo?.statusKerja || "",
        employmentType: normalized.tipeKaryawan,
        employeeProfile: profile,
        hrdEmploymentInfo: profile?.hrdEmploymentInfo || {},
        hasProfile: !!profile,
        operationalStatus: normalized.statusKerja,
        operationalStatusLabel: getOperationalStatusLabel(
          normalized.statusKerja,
        ),
        needsHrdAttention: normalized.needsHrdAttention,
        pendingBankRequest: pendingBankRequests?.find(
          (r) => r.employeeUid === u.uid,
        ),
      });
    });

    return result;
  }, [
    employees,
    users,
    employeeProfiles,
    brands,
    pendingBankRequests,
    isLoading,
  ]);

  const filteredEmployees = useMemo(() => {
    let filtered = allMerged.filter((emp) => {
      const status = emp.operationalStatus;
      let tabMatch = false;
      if (activeTab === "all") tabMatch = true;
      else if (activeTab === "review") tabMatch = !!emp.pendingBankRequest;
      else if (activeTab === "active") tabMatch = status === "active";
      else if (activeTab === "training") tabMatch = status === "training";
      else if (activeTab === "intern") tabMatch = status === "intern";
      else if (activeTab === "probation") tabMatch = status === "probation";
      else if (activeTab === "contract") tabMatch = status === "contract";
      else if (activeTab === "inactive")
        tabMatch = status === "resigned" || status === "terminated";

      if (!tabMatch) return false;
      const brandMatch = brandFilter === "all" || emp.brandId === brandFilter;
      if (!brandMatch) return false;
      const searchMatch =
        searchTerm === "" ||
        emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase());
      if (!searchMatch) return false;
      if (completenessFilter !== "all") {
        const c = calculateProfileCompleteness(emp.employeeProfile ?? null);
        if (completenessFilter === "complete" && c.status !== "complete")
          return false;
        if (completenessFilter === "partial" && c.status !== "partial")
          return false;
        if (completenessFilter === "not_started" && c.status !== "not_started")
          return false;
      }

      // Action needed filter
      if (actionNeededFilter !== "all") {
        const actionStatus = getActionNeededStatus(emp);
        if (actionNeededFilter === "review" && actionStatus.priority !== 4)
          return false;
        if (
          actionNeededFilter === "bank_pending" &&
          actionStatus.priority !== 4
        )
          return false;
        if (
          actionNeededFilter === "npwp_missing" &&
          !actionStatus.status.includes("NPWP")
        )
          return false;
        if (
          actionNeededFilter === "bpjs_missing" &&
          !actionStatus.status.includes("BPJS")
        )
          return false;
        if (
          actionNeededFilter === "data_incomplete" &&
          actionStatus.priority < 2
        )
          return false;
        if (
          actionNeededFilter === "data_complete" &&
          actionStatus.priority !== 0
        )
          return false;
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.fullName
            .toLowerCase()
            .localeCompare(b.fullName.toLowerCase());
        case "name-desc":
          return b.fullName
            .toLowerCase()
            .localeCompare(a.fullName.toLowerCase());
        case "completeness-asc": {
          const aComp = calculateProfileCompleteness(a.employeeProfile ?? null);
          const bComp = calculateProfileCompleteness(b.employeeProfile ?? null);
          return aComp.percentage - bComp.percentage;
        }
        case "completeness-desc": {
          const aComp = calculateProfileCompleteness(a.employeeProfile ?? null);
          const bComp = calculateProfileCompleteness(b.employeeProfile ?? null);
          return bComp.percentage - aComp.percentage;
        }
        case "needs-review": {
          const aStatus = getActionNeededStatus(a);
          const bStatus = getActionNeededStatus(b);
          // Sort by priority (higher priority first), then by name
          if (aStatus.priority !== bStatus.priority) {
            return bStatus.priority - aStatus.priority;
          }
          return a.fullName
            .toLowerCase()
            .localeCompare(b.fullName.toLowerCase());
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [
    allMerged,
    activeTab,
    brandFilter,
    searchTerm,
    completenessFilter,
    actionNeededFilter,
    sortBy,
  ]);

  // Pagination logic
  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(startIndex, startIndex + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const pendingReviewCount = allMerged.filter(
    (e) => e.pendingBankRequest,
  ).length;

  const groupedEmployees = useMemo(() => {
    const groups: Record<string, MergedEmployee[]> = {
      active: [],
      training: [],
      intern: [],
      probation: [],
      contract: [],
      resigned: [],
      terminated: [],
      unknown: [],
    };
    paginatedEmployees.forEach((emp) => {
      if (groups[emp.operationalStatus])
        groups[emp.operationalStatus].push(emp);
      else groups.unknown.push(emp);
    });
    return groups;
  }, [paginatedEmployees]);

  const stats = useMemo(() => {
    return {
      total: allMerged.length,
      active: allMerged.filter((e) => e.operationalStatus === "active").length,
      training: allMerged.filter((e) => e.operationalStatus === "training")
        .length,
      intern: allMerged.filter((e) => e.operationalStatus === "intern").length,
      probation: allMerged.filter((e) => e.operationalStatus === "probation")
        .length,
      contract: allMerged.filter((e) => e.operationalStatus === "contract")
        .length,
      inactive: allMerged.filter((e) =>
        ["resigned", "terminated"].includes(e.operationalStatus),
      ).length,
      // Administrative stats
      needsReview: allMerged.filter((e) => e.pendingBankRequest).length,
      bankPending: allMerged.filter((e) => e.pendingBankRequest).length,
      npwpMissing: allMerged.filter(
        (e) => !e.employeeProfile?.dokumenAdministratif?.npwpPhotoUrl,
      ).length,
      bpjsMissing: allMerged.filter(
        (e) =>
          !e.employeeProfile?.dokumenAdministratif?.bpjsKesehatanPhotoUrl ||
          !e.employeeProfile?.dokumenAdministratif?.bpjsKetenagakerjaanPhotoUrl,
      ).length,
      dataIncomplete: allMerged.filter((e) => {
        const c = calculateProfileCompleteness(e.employeeProfile ?? null);
        return c.status === "not_started" || c.status === "partial";
      }).length,
      dataComplete: allMerged.filter((e) => {
        const c = calculateProfileCompleteness(e.employeeProfile ?? null);
        return c.status === "complete";
      }).length,
    };
  }, [allMerged]);

  const handleExport = () => {
    if (!filteredEmployees.length) {
      toast({
        title: "Tidak Ada Data",
        description: "Tidak ada data untuk diekspor.",
      });
      return;
    }
    const headers = [
      "fullName",
      "email",
      "positionTitle",
      "division",
      "brandName",
      "employmentStatus",
      "employeeNumber",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredEmployees.map((e) =>
        headers
          .map(
            (h) => `"${((e as any)[h] || "").toString().replace(/"/g, '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `karyawan-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const headers =
      "fullName,email,phone,employeeNumber,positionTitle,division,brandName,joinDate(YYYY-MM-DD),employmentStatus(active/probation/resigned/terminated)";
    const blob = new Blob([headers], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "template-karyawan.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout pageTitle="Employee Directory" menuConfig={menuConfig}>
        <div className="space-y-8 w-full max-w-[1800px] mx-auto px-4 md:px-8 pb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Data Karyawan
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Directory administrasi karyawan terpusat PT. HRP Environesia
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white"
                onClick={() => setIsImportOpen(true)}
              >
                <Upload className="mr-2 h-3.5 w-3.5" /> Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white"
                onClick={handleExport}
              >
                <Download className="mr-2 h-3.5 w-3.5" /> Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white"
                onClick={handleDownloadTemplate}
              >
                <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Template
              </Button>
            </div>
          </div>

          {pendingReviewCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                </div>
                <p className="text-[15px] font-medium text-amber-500/90">
                  Ada{" "}
                  <span className="font-bold text-amber-500 text-base">
                    {pendingReviewCount}
                  </span>{" "}
                  perubahan data rekening karyawan yang membutuhkan tindakan
                  HRD.
                </p>
              </div>
              <Button
                size="lg"
                variant="default"
                className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold h-11 px-6 rounded-xl text-sm w-full md:w-auto"
                onClick={() => setActiveTab("review")}
              >
                Lihat yang Perlu Direview
              </Button>
            </div>
          )}

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <SummaryCard
              label="Total Karyawan"
              count={stats.total}
              icon={Users}
              color="bg-slate-500/10 text-slate-500"
            />
            <SummaryCard
              label="Aktif"
              count={stats.active}
              icon={CheckCircle}
              color="bg-emerald-500/10 text-emerald-500"
            />
            <SummaryCard
              label="Training"
              count={stats.training}
              icon={GraduationCap}
              color="bg-amber-500/10 text-amber-500"
            />
            <SummaryCard
              label="Magang"
              count={stats.intern}
              icon={Briefcase}
              color="bg-indigo-500/10 text-indigo-500"
            />
            <SummaryCard
              label="Percobaan"
              count={stats.probation}
              icon={AlertTriangle}
              color="bg-orange-500/10 text-orange-500"
            />
            <SummaryCard
              label="Kontrak"
              count={stats.contract}
              icon={FileSpreadsheet}
              color="bg-blue-500/10 text-blue-500"
            />
            <SummaryCard
              label="Nonaktif"
              count={stats.inactive}
              icon={XCircle}
              color="bg-red-500/10 text-red-500"
            />
          </div>

          {/* Administrative Summary Cards */}
          <div className="bg-slate-900/40 border border-slate-800/50 p-4 rounded-xl">
            <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">
              Status Administrasi
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              <SummaryCard
                label="Perlu Review HRD"
                count={stats.needsReview}
                icon={Clock}
                color="bg-amber-500/10 text-amber-500"
              />
              <SummaryCard
                label="Rekening Pending"
                count={stats.bankPending}
                icon={CreditCard}
                color="bg-amber-500/10 text-amber-500"
              />
              <SummaryCard
                label="NPWP Belum Ada"
                count={stats.npwpMissing}
                icon={FileText}
                color="bg-red-500/10 text-red-500"
              />
              <SummaryCard
                label="BPJS Belum Ada"
                count={stats.bpjsMissing}
                icon={Shield}
                color="bg-red-500/10 text-red-500"
              />
              <SummaryCard
                label="Data Lengkap"
                count={stats.dataComplete}
                icon={CheckCircle}
                color="bg-emerald-500/10 text-emerald-500"
              />
            </div>
          </div>

          <Card className="border-slate-800 bg-slate-950/50 backdrop-blur-xl">
            <CardHeader className="p-5 border-b border-slate-800/50">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3.5 top-3 h-5 w-5 text-slate-500" />
                  <Input
                    placeholder="Cari nama atau email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-slate-900/50 border-slate-800 h-11 pl-11 rounded-xl focus:border-emerald-500/50 transition-all text-sm"
                  />
                </div>

                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-800 h-11 rounded-xl text-sm font-medium">
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brands?.map((b) => (
                      <SelectItem key={b.id!} value={b.id!}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={completenessFilter}
                  onValueChange={setCompletenessFilter}
                >
                  <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-800 h-11 rounded-xl text-sm font-medium">
                    <SelectValue placeholder="Kelengkapan" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="all">Semua Kelengkapan</SelectItem>
                    <SelectItem value="complete">Lengkap</SelectItem>
                    <SelectItem value="partial">Sebagian</SelectItem>
                    <SelectItem value="not_started">Belum Isi</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={actionNeededFilter}
                  onValueChange={setActionNeededFilter}
                >
                  <SelectTrigger className="w-[200px] bg-slate-900/50 border-slate-800 h-11 rounded-xl text-sm font-medium">
                    <SelectValue placeholder="Action Needed" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="review">Perlu Review HRD</SelectItem>
                    <SelectItem value="bank_pending">
                      Rekening Pending
                    </SelectItem>
                    <SelectItem value="npwp_missing">NPWP Belum Ada</SelectItem>
                    <SelectItem value="bpjs_missing">BPJS Belum Ada</SelectItem>
                    <SelectItem value="data_incomplete">
                      Data Tidak Lengkap
                    </SelectItem>
                    <SelectItem value="data_complete">Data Lengkap</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sortBy}
                  onValueChange={(value: any) => setSortBy(value)}
                >
                  <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-800 h-11 rounded-xl text-sm font-medium">
                    <SelectValue placeholder="Urutkan" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="name-asc">Nama A-Z</SelectItem>
                    <SelectItem value="name-desc">Nama Z-A</SelectItem>
                    <SelectItem value="completeness-desc">
                      Kelengkapan Tertinggi
                    </SelectItem>
                    <SelectItem value="completeness-asc">
                      Kelengkapan Terendah
                    </SelectItem>
                    <SelectItem value="needs-review">
                      Perlu Review Dulu
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="bg-slate-900/50 p-1.5 rounded-xl border border-slate-800/50"
                >
                  <TabsList className="h-9 bg-transparent gap-1.5">
                    <TabsTrigger
                      value="all"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Semua
                    </TabsTrigger>
                    <TabsTrigger
                      value="review"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-amber-500 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400"
                    >
                      Perlu Review HRD
                    </TabsTrigger>
                    <TabsTrigger
                      value="active"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Aktif
                    </TabsTrigger>
                    <TabsTrigger
                      value="training"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Training
                    </TabsTrigger>
                    <TabsTrigger
                      value="intern"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Magang
                    </TabsTrigger>
                    <TabsTrigger
                      value="probation"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Percobaan
                    </TabsTrigger>
                    <TabsTrigger
                      value="contract"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Kontrak
                    </TabsTrigger>
                    <TabsTrigger
                      value="inactive"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4"
                    >
                      Nonaktif
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {(searchTerm ||
                  brandFilter !== "all" ||
                  completenessFilter !== "all" ||
                  actionNeededFilter !== "all" ||
                  sortBy !== "name-asc" ||
                  activeTab !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-white"
                    onClick={() => {
                      setSearchTerm("");
                      setBrandFilter("all");
                      setCompletenessFilter("all");
                      setActionNeededFilter("all");
                      setActiveTab("all");
                      setSortBy("name-asc");
                      setCurrentPage(1);
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-20 text-center space-y-4">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mx-auto" />
                  <p className="text-sm text-slate-500 font-medium">
                    Menyusun direktori karyawan...
                  </p>
                </div>
              ) : filteredEmployees.length > 0 ? (
                <Accordion
                  type="multiple"
                  defaultValue={Object.keys(groupedEmployees)}
                  className="w-full"
                >
                  {Object.entries(groupedEmployees)
                    .filter(([_, emps]) => emps.length > 0)
                    .map(([status, emps]) => (
                      <AccordionItem
                        value={status}
                        key={status}
                        className="border-b border-slate-800/50 last:border-0"
                      >
                        <AccordionTrigger className="px-6 py-3 bg-slate-900/20 hover:no-underline group">
                          <div className="flex items-center gap-3">
                            <StatusKepegawaanBadge
                              status={status as OperationalStatus}
                            />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                              {emps.length} Personel
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-0 pb-0">
                          <div className="overflow-x-auto w-full">
                            <Table className="w-full table-fixed min-w-[1200px]">
                              <TableHeader className="bg-slate-900/40">
                                <TableRow className="border-slate-800/50 hover:bg-transparent">
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 px-6 h-12 w-[60px] sticky left-0 bg-slate-900/40 z-10">
                                    No
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 w-[120px]">
                                    Employee ID
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 min-w-[300px]">
                                    Karyawan
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 min-w-[200px]">
                                    Brand/Divisi
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 w-[120px]">
                                    Status
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 w-[160px]">
                                    Kelengkapan
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 min-w-[250px]">
                                    Action Needed
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-400 h-12 min-w-[300px]">
                                    Admin Check
                                  </TableHead>
                                  <TableHead className="text-right px-6 h-12 min-w-[200px]">
                                    Aksi
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {emps.map((emp, index) => {
                                  const globalIndex =
                                    (currentPage - 1) * pageSize + index + 1;
                                  const c = calculateProfileCompleteness(
                                    emp.employeeProfile ?? null,
                                  );
                                  const actionStatus =
                                    getActionNeededStatus(emp);
                                  const employeeId = generateEmployeeId(
                                    emp,
                                    globalIndex,
                                  );
                                  const hasPendingReq =
                                    !!emp.pendingBankRequest;
                                  return (
                                    <TableRow
                                      key={emp.uid}
                                      className={cn(
                                        "border-slate-800/50 hover:bg-slate-800/40 transition-colors group min-h-[88px]",
                                        hasPendingReq && "bg-amber-500/[0.04]",
                                      )}
                                    >
                                      <TableCell className="px-6 py-6 text-center align-middle sticky left-0 bg-slate-950/50 backdrop-blur-sm z-10">
                                        <span className="text-sm font-bold text-slate-400">
                                          {String(globalIndex).padStart(2, "0")}
                                        </span>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <span className="text-sm font-mono font-bold text-slate-300">
                                          {employeeId}
                                        </span>
                                      </TableCell>
                                      <TableCell className="px-6 py-6 align-middle">
                                        <div className="flex flex-col gap-1">
                                          <span className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                                            {emp.fullName}
                                          </span>
                                          <span className="text-sm text-slate-400 font-medium">
                                            {emp.email}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <div className="flex flex-col gap-1">
                                          <span className="text-sm font-semibold text-slate-200">
                                            {emp.brandName}
                                          </span>
                                          <span className="text-xs text-slate-500 font-medium">
                                            {emp.division}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <StatusKepegawaanBadge
                                          status={emp.operationalStatus}
                                        />
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <div className="flex flex-col gap-2">
                                          <div className="w-28 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                              className={cn(
                                                "h-full transition-all",
                                                c.status === "complete"
                                                  ? "bg-emerald-500"
                                                  : "bg-amber-500",
                                              )}
                                              style={{
                                                width: `${c.percentage}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                            {c.percentage}%
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <div className="flex flex-wrap gap-1">
                                          {actionStatus.priority === 4 && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-amber-500/30 bg-amber-500/10 text-amber-500"
                                            >
                                              Rekening Pending
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "NPWP",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-red-500/30 bg-red-500/10 text-red-500"
                                            >
                                              NPWP Belum Ada
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "BPJS Kes",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-red-500/30 bg-red-500/10 text-red-500"
                                            >
                                              BPJS Kes Belum Ada
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "BPJS TK",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-red-500/30 bg-red-500/10 text-red-500"
                                            >
                                              BPJS TK Belum Ada
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "Data Belum Lengkap",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-orange-500/30 bg-orange-500/10 text-orange-500"
                                            >
                                              Data Belum Lengkap
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "Data Tidak Lengkap",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-slate-500/30 bg-slate-500/10 text-slate-400"
                                            >
                                              Data Tidak Lengkap
                                            </Badge>
                                          )}
                                          {actionStatus.priority === 0 && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                            >
                                              Tidak Ada Masalah
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <AdminCheckIcons
                                          profile={emp.employeeProfile}
                                          pendingBankRequest={
                                            emp.pendingBankRequest
                                          }
                                        />
                                      </TableCell>
                                      <TableCell className="text-right px-6 py-6 align-middle">
                                        <div className="flex items-center justify-end gap-3">
                                          {emp.pendingBankRequest && (
                                            <Button
                                              variant="default"
                                              size="sm"
                                              className="h-9 px-4 rounded-xl text-[13px] font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-md shadow-amber-900/20"
                                              onClick={() => {
                                                setSelectedReviewEmp(emp);
                                                setSelectedReviewReq(
                                                  emp.pendingBankRequest,
                                                );
                                              }}
                                            >
                                              Review Perubahan
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 px-4 rounded-xl text-[13px] font-bold bg-slate-900 border border-slate-800 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                                            onClick={() =>
                                              router.push(
                                                `/admin/hrd/employee-data/karyawan/${emp.uid}`,
                                              )
                                            }
                                          >
                                            Lihat Detail
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              ) : (
                <div className="p-20 text-center space-y-4">
                  <Users className="h-12 w-12 text-slate-800 mx-auto" />
                  <p className="text-sm text-slate-500 font-medium">
                    Tidak ada data yang sesuai dengan filter saat ini.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-slate-800"
                    onClick={() => {
                      setSearchTerm("");
                      setBrandFilter("all");
                      setCompletenessFilter("all");
                      setActionNeededFilter("all");
                      setActiveTab("all");
                      setSortBy("name-asc");
                      setCurrentPage(1);
                    }}
                  >
                    Bersihkan Filter
                  </Button>
                </div>
              )}
            </CardContent>

            {/* Pagination Controls */}
            {filteredEmployees.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-800/50 bg-slate-900/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[120px] bg-slate-900/50 border-slate-800 h-9 rounded-lg text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="25">25 per halaman</SelectItem>
                        <SelectItem value="50">50 per halaman</SelectItem>
                        <SelectItem value="100">100 per halaman</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-slate-400">
                      Menampilkan{" "}
                      {Math.min(
                        (currentPage - 1) * pageSize + 1,
                        filteredEmployees.length,
                      )}{" "}
                      -{" "}
                      {Math.min(
                        currentPage * pageSize,
                        filteredEmployees.length,
                      )}{" "}
                      dari {filteredEmployees.length} karyawan
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      className="h-9 px-3 rounded-lg border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          const pageNum =
                            Math.max(
                              1,
                              Math.min(totalPages - 4, currentPage - 2),
                            ) + i;
                          if (pageNum > totalPages) return null;
                          return (
                            <Button
                              key={pageNum}
                              variant={
                                currentPage === pageNum ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className={cn(
                                "h-9 w-9 rounded-lg text-sm font-bold",
                                currentPage === pageNum
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                  : "border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white",
                              )}
                            >
                              {pageNum}
                            </Button>
                          );
                        },
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="h-9 px-3 rounded-lg border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </DashboardLayout>

      <ImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportSuccess={() => mutate?.()}
      />

      {selectedReviewEmp && selectedReviewReq && (
        <BankChangeReviewModal
          open={!!selectedReviewReq}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReviewEmp(null);
              setSelectedReviewReq(null);
            }
          }}
          request={selectedReviewReq}
          employeeData={selectedReviewEmp}
          onSuccess={() => {
            mutateBankRequests();
          }}
        />
      )}
    </>
  );
}
