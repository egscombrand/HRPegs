"use client";

import { useState, useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import type { OvertimeSubmission, UserProfile, Brand } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
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

  const [statusFilter, setStatusFilter] = useState<
    OvertimeSubmission["status"] | "all"
  >(mode === "manager" ? "pending_supervisor" : "all");
  const [activeTab, setActiveTab] = useState<
    "pending_hrd" | "pending_supervisor" | "approved" | "rejected" | "all"
  >(mode === "hrd" ? "pending_hrd" : "pending_supervisor");
  const [brandFilter, setBrandFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
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
        where("approvalStatus", "==", "pending_supervisor"),
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

  const activeTabStatuses = useMemo(() => {
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

      const activeTabMatch =
        mode !== "hrd" || activeTab === "all"
          ? true
          : activeTabStatuses.includes(effectiveStatus as any);
      if (!activeTabMatch) return false;

      if (statusFilter !== "all" && effectiveStatus !== statusFilter)
        return false;

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

      if (selectedPeriodStart && selectedPeriodEnd) {
        if (!overtimeDate) return false;
        if (
          overtimeDate.getTime() < selectedPeriodStart.getTime() ||
          overtimeDate.getTime() >= selectedPeriodEnd.getTime()
        )
          return false;
      }

      if (searchTerm) {
        const normalized = searchTerm.toLowerCase();
        const target = [
          s.employeeName,
          s.fullName,
          s.workRole,
          s.positionTitle,
          s.brandName,
          s.divisionName,
          s.directSupervisorName,
        ]
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
            <KpiCard
              title="Perlu Revisi"
              value={kpis.revision}
              deltaType="inverse"
            />
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
              <CardTitle>Persetujuan & Monitoring Lembur</CardTitle>
              <CardDescription>
                {mode === "hrd"
                  ? "Pantau proses lembur dan review pengajuan yang sudah disetujui manager divisi."
                  : "Tinjau pengajuan lembur dari tim Anda."}
              </CardDescription>
            </div>
            {mode === "hrd" && (
              <div className="w-full">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as any)}
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

          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr_1.8fr] items-end">
            <Select
              value={brandFilter}
              onValueChange={(val) => setBrandFilter(val)}
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
              onValueChange={(val) => setDivisionFilter(val)}
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
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as any)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending_hrd">Menunggu HRD</SelectItem>
                <SelectItem value="pending_supervisor">
                  Dalam Review Manager
                </SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="approved_hrd">Disetujui HRD</SelectItem>
                <SelectItem value="rejected_manager">
                  Ditolak Manager
                </SelectItem>
                <SelectItem value="rejected_hrd">Ditolak HRD</SelectItem>
                <SelectItem value="revision_manager">Revisi Manager</SelectItem>
                <SelectItem value="revision_hrd">Revisi HRD</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="month"
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value)}
              placeholder="Periode"
            />
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama karyawan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
                      Nama Karyawan
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Brand / Divisi
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Manager Divisi
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Tanggal Lembur
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Jam & Durasi
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Lokasi
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Tipe Lembur
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      Diajukan
                    </TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSubmissions.map((s) => {
                    const effectiveStatus = getEffectiveStatus(s) as any;
                    const overtimeDate = getOvertimeDate(s);
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
                        <TableCell className="px-3 py-3 align-top">
                          {(s.brandName || "-") +
                            " / " +
                            (s.divisionName || s.division || "-")}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {s.directSupervisorName || s.supervisorName || "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {overtimeDate
                            ? format(overtimeDate, "dd MMM yyyy", {
                                locale: idLocale,
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          <div className="text-sm truncate">
                            {s.startTime} - {s.endTime}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.totalDurationMinutes} menit
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {s.workLocationLabel ||
                            s.workLocation ||
                            s.location ||
                            "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          {s.overtimeTypeLabel || s.overtimeType || "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          <OvertimeApprovalStatusBadge
                            status={effectiveStatus}
                            mode={mode}
                            divisionName={s.divisionName || s.division}
                          />
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top text-sm text-muted-foreground">
                          {formatDistanceToNow(getSubmittedAt(s), {
                            addSuffix: true,
                            locale: idLocale,
                          })}
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
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Tidak ada pengajuan yang sesuai kriteria.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSubmission && (
        <ReviewOvertimeDialog
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
