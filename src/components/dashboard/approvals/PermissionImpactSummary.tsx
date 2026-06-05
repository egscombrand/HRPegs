"use client";

import { useState, useMemo } from "react";
import type { PermissionRequest, Brand, Division } from "@/lib/types";
import {
  buildEmployeePermissionSummaries,
  classifyPermissionCategory,
  getPayrollImpactLabel,
  getFormTypeLabel,
  getReasonLabel,
  getFormType,
  getReason,
  resolveEmployeeBrand,
  resolveEmployeeDivision,
  type EmployeePermissionSummary,
  type PermissionCategory,
  type PayrollImpactLabel,
} from "@/lib/permission-impact";
import {
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
  subMonths,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
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
import { Calendar, ChevronDown, Filter, X } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  permissions: PermissionRequest[];
  employees: Map<string, any>;
  masterBrands?: Brand[];
  masterDivisionsByBrand?: Map<string, Division[]>;
}

type PeriodMode = "current_month" | "previous_month" | "custom";

const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  tidak_masuk_non_sakit: "Tidak Masuk Non-Sakit",
  sakit: "Sakit",
  duka_cita: "Duka Cita",
  administrasi_resmi: "Administrasi Resmi",
  keluar_kantor: "Keluar Kantor",
  datang_terlambat: "Terlambat",
  pulang_awal: "Pulang Awal",
  akademik: "Akademik",
  lainnya: "Lainnya",
};

const PAYROLL_IMPACT_LABELS: Record<
  PayrollImpactLabel,
  { label: string; color: string }
> = {
  potong_hari: { label: "Potong Hari", color: "bg-red-950 text-red-200" },
  potong_jam: { label: "Potong Jam", color: "bg-orange-950 text-orange-200" },
  tidak_dipotong: {
    label: "Tidak Dipotong",
    color: "bg-green-950 text-green-200",
  },
  perlu_review_hrd: {
    label: "Review HRD",
    color: "bg-yellow-950 text-yellow-200",
  },
  sesuai_kebijakan: {
    label: "Sesuai Kebijakan",
    color: "bg-blue-950 text-blue-200",
  },
};

export function PermissionImpactSummary({
  permissions,
  employees,
  masterBrands = [],
  masterDivisionsByBrand = new Map(),
}: Props) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current_month");
  const [customStart, setCustomStart] = useState<string>(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [customEnd, setCustomEnd] = useState<string>(
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );

  // Filters
  const [searchText, setSearchText] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<
    PermissionCategory | "all"
  >("all");
  const [payrollFilter, setPayrollFilter] = useState<
    PayrollImpactLabel | "all"
  >("all");

  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeePermissionSummary | null>(null);

  // Determine date range
  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodMode === "current_month") {
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: format(now, "MMMM yyyy", { locale: idLocale }),
      };
    } else if (periodMode === "previous_month") {
      const prev = subMonths(now, 1);
      return {
        start: startOfMonth(prev),
        end: endOfMonth(prev),
        label: format(prev, "MMMM yyyy", { locale: idLocale }),
      };
    } else {
      return {
        start: new Date(customStart),
        end: new Date(customEnd),
        label: `${format(new Date(customStart), "d MMM", { locale: idLocale })} - ${format(new Date(customEnd), "d MMM yyyy", { locale: idLocale })}`,
      };
    }
  }, [periodMode, customStart, customEnd]);

  // Build summaries
  const summaries = useMemo(() => {
    return buildEmployeePermissionSummaries(
      permissions,
      employees,
      startOfDay(dateRange.start),
      endOfDay(dateRange.end),
    );
  }, [permissions, employees, dateRange.start, dateRange.end]);

  // Extract brands from master data, fall back to summaries
  const availableBrands = useMemo(() => {
    if (masterBrands && masterBrands.length > 0) {
      return masterBrands
        .filter((b) => b.name && b.name !== "Brand belum diatur")
        .map((b) => b.name)
        .sort();
    }

    // Fallback to brands from summaries
    const brands = new Set<string>();
    summaries.forEach((s) => {
      if (s.brand && s.brand !== "Brand belum diatur") brands.add(s.brand);
    });
    return Array.from(brands).sort();
  }, [masterBrands, summaries]);

  // Extract divisions based on selected brand
  const availableDivisions = useMemo(() => {
    if (brandFilter !== "all" && masterDivisionsByBrand.size > 0) {
      // Get divisions for selected brand from master data
      const divisionsForBrand = masterDivisionsByBrand.get(brandFilter) || [];
      return divisionsForBrand
        .filter(
          (d) =>
            d.name && d.name !== "Divisi belum diatur" && d.isActive !== false,
        )
        .map((d) => d.name)
        .sort();
    }

    // Fallback: extract divisions from summaries that match selected brand
    if (brandFilter !== "all") {
      const divisions = new Set<string>();
      summaries.forEach((s) => {
        if (
          s.brand === brandFilter &&
          s.division &&
          s.division !== "Divisi belum diatur"
        ) {
          divisions.add(s.division);
        }
      });
      return Array.from(divisions).sort();
    }

    // No brand filter: get all divisions
    if (masterDivisionsByBrand.size > 0) {
      const allDivisions = new Set<string>();
      masterDivisionsByBrand.forEach((divs) => {
        divs.forEach((d) => {
          if (
            d.name &&
            d.name !== "Divisi belum diatur" &&
            d.isActive !== false
          ) {
            allDivisions.add(d.name);
          }
        });
      });
      return Array.from(allDivisions).sort();
    }

    // Fallback: extract from summaries
    const divisions = new Set<string>();
    summaries.forEach((s) => {
      if (s.division && s.division !== "Divisi belum diatur")
        divisions.add(s.division);
    });
    return Array.from(divisions).sort();
  }, [brandFilter, masterDivisionsByBrand, summaries]);

  // Filter by all criteria
  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      // Search
      if (searchText) {
        const lower = searchText.toLowerCase();
        if (!s.fullName.toLowerCase().includes(lower)) return false;
      }

      // Brand filter
      if (brandFilter !== "all" && s.brand !== brandFilter) return false;

      // Division filter
      if (divisionFilter !== "all" && s.division !== divisionFilter)
        return false;

      // Only show if has any permissions
      if (s.permissions.length === 0) return false;

      // Check if has relevant category
      if (categoryFilter !== "all") {
        const hasCategory = s.permissions.some(
          (p) => classifyPermissionCategory(p) === categoryFilter,
        );
        if (!hasCategory) return false;
      }

      // Check if has relevant payroll impact
      if (payrollFilter !== "all") {
        const hasPayroll = s.permissions.some(
          (p) => getPayrollImpactLabel(p) === payrollFilter,
        );
        if (!hasPayroll) return false;
      }

      return true;
    });
  }, [
    summaries,
    searchText,
    brandFilter,
    divisionFilter,
    categoryFilter,
    payrollFilter,
  ]);

  const hasActiveFilters =
    searchText ||
    brandFilter !== "all" ||
    divisionFilter !== "all" ||
    categoryFilter !== "all" ||
    payrollFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">
                Rekap Dampak Izin Bulanan
              </CardTitle>
              <CardDescription>
                Ringkasan pengaruh izin terhadap hari kerja efektif dan payroll
                karyawan per kategori izin
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              {filtered.length} / {summaries.length} karyawan
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 backdrop-blur-xl">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Period Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                  Periode
                </label>
                <Select
                  value={periodMode}
                  onValueChange={(v) => setPeriodMode(v as PeriodMode)}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="current_month">Bulan Ini</SelectItem>
                    <SelectItem value="previous_month">Bulan Lalu</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {periodMode === "custom" && (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                      Dari Tanggal
                    </label>
                    <Input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                      Sampai Tanggal
                    </label>
                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Search */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                Cari Karyawan
              </label>
              <Input
                placeholder="Nama karyawan..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Other Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                  Brand
                </label>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {availableBrands.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                  Divisi
                </label>
                <Select
                  value={divisionFilter}
                  onValueChange={setDivisionFilter}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {availableDivisions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                  Jenis Izin
                </label>
                <Select
                  value={categoryFilter as string}
                  onValueChange={(v) => setCategoryFilter(v as any)}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 block">
                  Dampak Payroll
                </label>
                <Select
                  value={payrollFilter as string}
                  onValueChange={(v) => setPayrollFilter(v as any)}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="all">Semua Dampak</SelectItem>
                    {Object.entries(PAYROLL_IMPACT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Period Display & Clear Filters */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  Periode: <strong>{dateRange.label}</strong>
                </span>
              </div>
              {hasActiveFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearchText("");
                    setBrandFilter("all");
                    setDivisionFilter("all");
                    setCategoryFilter("all");
                    setPayrollFilter("all");
                  }}
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300"
                >
                  <X className="h-4 w-4 mr-1" />
                  Bersihkan Filter
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Table */}
      {filtered.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <Filter className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400 mb-2">
                Tidak ada data sesuai filter
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Coba ubah filter atau tambahkan izin untuk periode yang dipilih
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold">
                    Nama Karyawan
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold">
                    Brand / Divisi
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-right">
                    Hari Kerja
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-right">
                    Hadir Efektif
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-right">
                    Tidak Masuk
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-right">
                    Sakit
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-right">
                    Duka / Admin
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-right">
                    Jam (K/T/A)
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold">
                    Dampak Payroll
                  </TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-300 font-bold text-center">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((summary) => {
                  const breakdown = summary.tidak_masuk_breakdown;
                  const pi = summary.payrollImpact;
                  const jamKTA = Math.ceil(
                    (summary.keluar_kantor_minutes +
                      summary.datang_terlambat_minutes +
                      summary.pulang_awal_minutes) /
                      60,
                  );

                  // Build rincian tidak masuk
                  const rincianItems = [];
                  if (breakdown.sakit > 0)
                    rincianItems.push(`Sakit: ${breakdown.sakit}h`);
                  if (breakdown.pribadi > 0)
                    rincianItems.push(`Pribadi: ${breakdown.pribadi}h`);
                  if (breakdown.duka_cita > 0)
                    rincianItems.push(`Duka: ${breakdown.duka_cita}h`);
                  if (breakdown.administrasi_resmi > 0)
                    rincianItems.push(
                      `Admin: ${breakdown.administrasi_resmi}h`,
                    );
                  if (breakdown.lainnya > 0)
                    rincianItems.push(`Lainnya: ${breakdown.lainnya}h`);

                  return (
                    <TableRow
                      key={summary.uid}
                      className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30"
                    >
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                        {summary.fullName}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                        <div>{summary.brand}</div>
                        <div className="text-xs">{summary.division}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-900 dark:text-slate-300">
                        {summary.totalWorkingDays}
                      </TableCell>
                      <TableCell className="text-right font-mono text-blue-600 dark:text-blue-300">
                        {summary.effectiveWorkingDays}
                      </TableCell>
                      <TableCell className="text-right">
                        {summary.tidak_masuk_total_days > 0 ? (
                          <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800">
                            {summary.tidak_masuk_total_days}h
                          </Badge>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-500">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-left text-xs">
                        {rincianItems.length > 0 ? (
                          <div className="space-y-0.5">
                            {rincianItems.map((item, idx) => (
                              <div
                                key={idx}
                                className="text-slate-600 dark:text-slate-400"
                              >
                                {item}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-500">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {jamKTA > 0 ? (
                          <div className="space-y-0.5">
                            {summary.keluar_kantor_minutes > 0 && (
                              <div className="text-slate-600 dark:text-slate-400">
                                Keluar:{" "}
                                {Math.ceil(summary.keluar_kantor_minutes / 60)}j
                              </div>
                            )}
                            {summary.datang_terlambat_minutes > 0 && (
                              <div className="text-slate-600 dark:text-slate-400">
                                Telat: {summary.datang_terlambat_minutes}m
                              </div>
                            )}
                            {summary.pulang_awal_minutes > 0 && (
                              <div className="text-slate-600 dark:text-slate-400">
                                Awal: {summary.pulang_awal_minutes}m
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-500">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {pi.potong_hari > 0 && (
                            <Badge
                              className={
                                PAYROLL_IMPACT_LABELS["potong_hari"].color
                              }
                            >
                              {pi.potong_hari}h
                            </Badge>
                          )}
                          {pi.perlu_review_hrd > 0 && (
                            <Badge
                              className={
                                PAYROLL_IMPACT_LABELS["perlu_review_hrd"].color
                              }
                            >
                              Review
                            </Badge>
                          )}
                          {pi.sesuai_kebijakan > 0 &&
                            !pi.potong_hari &&
                            !pi.perlu_review_hrd && (
                              <Badge
                                className={
                                  PAYROLL_IMPACT_LABELS["sesuai_kebijakan"]
                                    .color
                                }
                              >
                                Kebijakan
                              </Badge>
                            )}
                          {!pi.potong_hari &&
                            !pi.perlu_review_hrd &&
                            !pi.sesuai_kebijakan && (
                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                —
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedEmployee(summary)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                        >
                          Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Detail Dialog */}
      {selectedEmployee && (
        <PermissionDetailDialog
          summary={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

function PermissionDetailDialog({
  summary,
  onClose,
}: {
  summary: EmployeePermissionSummary;
  onClose: () => void;
}) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] md:w-[90vw] max-w-4xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {summary.fullName}
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-400">
            {summary.brand} • {summary.division}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 my-6">
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">
              Hari Kerja
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {summary.totalWorkingDays}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">
              Hadir Efektif
            </p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {summary.effectiveWorkingDays}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">
              Tidak Masuk
            </p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">
              {summary.tidak_masuk_total_days}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">
              Sakit
            </p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {summary.tidak_masuk_breakdown.sakit}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">
              Dampak Payroll
            </p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
              {summary.payrollImpact.potong_hari > 0
                ? `${summary.payrollImpact.potong_hari}h`
                : summary.payrollImpact.perlu_review_hrd > 0
                  ? "Review"
                  : "Tidak"}
            </p>
          </div>
        </div>

        {/* Permission Details */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-300 uppercase tracking-wider">
            Rincian Izin ({summary.permissions.length})
          </p>
          {summary.permissions.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-500">
              Tidak ada izin untuk periode ini
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {summary.permissions.map((perm) => {
                const formType = getFormType(perm);
                const reason = getReason(perm);
                const payrollLabel = getPayrollImpactLabel(perm);
                const startDt =
                  perm.startDate &&
                  typeof perm.startDate === "object" &&
                  "toDate" in perm.startDate
                    ? (perm.startDate as any).toDate()
                    : new Date(perm.startDate as any);
                const endDt =
                  perm.endDate &&
                  typeof perm.endDate === "object" &&
                  "toDate" in perm.endDate
                    ? (perm.endDate as any).toDate()
                    : new Date(perm.endDate as any);

                return (
                  <div
                    key={perm.id}
                    className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {getFormTypeLabel(formType)}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-500">
                          {format(startDt, "d MMM yyyy", { locale: idLocale })}{" "}
                          -{format(endDt, "d MMM yyyy", { locale: idLocale })}
                        </p>
                      </div>
                      <Badge
                        className={
                          PAYROLL_IMPACT_LABELS[payrollLabel].color + " text-xs"
                        }
                      >
                        {PAYROLL_IMPACT_LABELS[payrollLabel].label}
                      </Badge>
                    </div>
                    {reason && reason !== "lainnya" && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                        Alasan: <strong>{getReasonLabel(reason)}</strong>
                      </p>
                    )}
                    {perm.attachments && perm.attachments.length > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ Bukti tersedia
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
