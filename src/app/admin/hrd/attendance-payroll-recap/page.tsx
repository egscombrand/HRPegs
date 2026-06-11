"use client";

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, AlertCircle, RotateCcw, CalendarDays } from "lucide-react";
import type { EmployeeProfile, Brand } from "@/lib/types";
import {
  calculatePayrollPeriod,
  generatePayrollRecap,
  type PeriodMode,
} from "@/lib/payroll-recap";
import { Badge } from "@/components/ui/badge";

const PERIOD_MODES: Array<{ value: PeriodMode; label: string }> = [
  { value: "payroll", label: "Periode Payroll (26–25)" },
  { value: "calendar", label: "Bulan Kalender" },
  { value: "custom", label: "Custom Range" },
];

export default function RekapAbsensiPayrollPage() {
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();

  // ── Period state ──
  const [periodMode, setPeriodMode] = useState<PeriodMode>("payroll");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // ── Filter state ──
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [searchName, setSearchName] = useState("");

  // ── Data fetching ──
  const { data: employees, isLoading: loadingEmployees } =
    useCollection<EmployeeProfile>(
      useMemoFirebase(() => collection(firestore, "employee_profiles"), [firestore])
    );

  const { data: brands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore])
  );

  const { data: attendanceEvents, isLoading: loadingAttendance } =
    useCollection<any>(
      useMemoFirebase(() => collection(firestore, "attendance_events"), [firestore])
    );

  const { data: permissionRequests } = useCollection<any>(
    useMemoFirebase(() => {
      return query(
        collection(firestore, "permission_requests"),
        where("status", "in", ["approved", "closed", "approved_hrd", "approved_by_hrd"])
      );
    }, [firestore])
  );

  const isLoading = loadingEmployees || loadingAttendance;

  // ── Active period ──
  const activePeriod = useMemo(() => {
    return calculatePayrollPeriod(
      periodMode,
      selectedYear,
      selectedMonth,
      customStartDate ? new Date(customStartDate) : undefined,
      customEndDate ? new Date(customEndDate) : undefined
    );
  }, [periodMode, selectedYear, selectedMonth, customStartDate, customEndDate]);

  // ── Generate recap ──
  const { recapRows, uniqueDivisions } = useMemo(() => {
    if (!employees || !attendanceEvents || !brands) {
      return { recapRows: [], uniqueDivisions: [] };
    }

    const allRows = generatePayrollRecap(
      employees,
      activePeriod,
      attendanceEvents,
      permissionRequests || [],
      brands
    );

    const divs = new Set<string>();
    allRows.forEach(r => { if (r.divisionName && r.divisionName !== '-') divs.add(r.divisionName); });

    const filtered = allRows.filter(row => {
      if (selectedBrand !== "all" && row.brandId !== selectedBrand) return false;
      if (selectedDivision !== "all" && row.divisionName !== selectedDivision) return false;
      if (searchName.trim() &&
        !row.fullName.toLowerCase().includes(searchName.toLowerCase()) &&
        !row.employeeNumber.toLowerCase().includes(searchName.toLowerCase())) return false;
      return true;
    });

    return { recapRows: filtered, uniqueDivisions: Array.from(divs).sort() };
  }, [employees, attendanceEvents, permissionRequests, brands, activePeriod, selectedBrand, selectedDivision, searchName]);

  // ── Summary stats ──
  const summary = useMemo(() => ({
    total: recapRows.length,
    hadir: recapRows.reduce((s, r) => s + r.hadir, 0),
    terlambat: recapRows.reduce((s, r) => s + r.terlambat, 0),
    alpha: recapRows.reduce((s, r) => s + r.alpha, 0),
    izin: recapRows.reduce((s, r) => s + r.izin, 0),
  }), [recapRows]);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  if (isLoading) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Rekap Absensi Payroll">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Rekap Absensi Payroll
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Rekap kehadiran karyawan Web Absen
            </p>
          </div>
          <Button variant="outline" className="gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* ── Unified Filter Card ── */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardContent className="pt-5 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

              {/* Mode Periode */}
              <div className="lg:col-span-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  Mode
                </label>
                <Select value={periodMode} onValueChange={v => setPeriodMode(v as PeriodMode)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_MODES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month (calendar/payroll) */}
              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Bulan
                  </label>
                  <Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {format(new Date(selectedYear, i, 1), "MMMM", { locale: idLocale })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Year (calendar/payroll) */}
              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Tahun
                  </label>
                  <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = new Date().getFullYear() - i;
                        return <SelectItem key={y} value={y.toString()}>{y}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Custom dates */}
              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Mulai
                  </label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Selesai
                  </label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {/* Brand */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  Brand
                </label>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brands?.map(b => (
                      <SelectItem key={b.id} value={b.id || ""}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Division */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  Divisi
                </label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {uniqueDivisions.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name search + Reset */}
              <div className="flex gap-2 items-end sm:col-span-2 md:col-span-1">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Cari
                  </label>
                  <Input
                    placeholder="Nama / NIK..."
                    value={searchName}
                    onChange={e => setSearchName(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="shrink-0">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 invisible">
                    &nbsp;
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    title="Reset filter"
                    onClick={() => {
                      setSelectedBrand("all");
                      setSelectedDivision("all");
                      setSearchName("");
                      setPeriodMode("payroll");
                      setSelectedMonth(new Date().getMonth());
                      setSelectedYear(new Date().getFullYear());
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Period Preview ── */}
        <div className="flex items-center gap-2 px-1">
          <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-blue-700 dark:text-blue-400">Periode Aktif:</span>{" "}
            {format(activePeriod.startDate, "d MMM yyyy", { locale: idLocale })} – {format(activePeriod.endDate, "d MMM yyyy", { locale: idLocale })}
            <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">
              ({recapRows.length} karyawan Web Absen)
            </span>
          </p>
        </div>

        {/* ── Summary Cards ── */}
        {recapRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: "Karyawan", value: summary.total, color: "text-slate-900 dark:text-white" },
              { label: "Total Hadir", value: summary.hadir, color: "text-green-700 dark:text-green-400" },
              { label: "Terlambat", value: summary.terlambat, color: "text-orange-700 dark:text-orange-400" },
              { label: "Alpha", value: summary.alpha, color: "text-red-700 dark:text-red-400" },
              { label: "Izin", value: summary.izin, color: "text-blue-700 dark:text-blue-400" },
            ].map(card => (
              <Card key={card.label} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow className="border-slate-200 dark:border-slate-800/50">
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 px-4 w-[220px]">
                      Nama / NIK
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11">Brand</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11">Divisi</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Hari Kerja</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Hadir</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Terlambat</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Izin</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Alpha</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right pr-4">Total Jam</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recapRows.length > 0 ? (
                    recapRows.map(row => (
                      <TableRow
                        key={row.employeeId}
                        className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <TableCell className="px-4 py-3">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">{row.fullName}</div>
                          {row.employeeNumber ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400">NIK: {row.employeeNumber}</div>
                          ) : null}
                          {row.isPartial && (
                            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Partial periode</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{row.brandName}</TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{row.divisionName}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">{row.hariKerja}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold text-slate-900 dark:text-white">{row.hadir}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.terlambat > 0 ? (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 text-xs">
                              {row.terlambat}x / {row.menitTerlambat}m
                            </Badge>
                          ) : <span className="text-sm text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                          {row.izin || <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.alpha > 0 ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                              {row.alpha}
                            </Badge>
                          ) : <span className="text-sm text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-300 pr-4">
                          {row.totalJamKerja > 0 ? `${row.totalJamKerja}h` : <span className="text-slate-400">—</span>}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm">Tidak ada data karyawan Web Absen untuk periode ini</p>
                          <p className="text-xs text-slate-400">Pastikan employee_profiles sudah punya attendanceMethod = web_absen</p>
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
    </DashboardLayout>
  );
}
