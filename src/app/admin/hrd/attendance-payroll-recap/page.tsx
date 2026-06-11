"use client";

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, Calendar, Users, Filter, AlertCircle } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import type { EmployeeProfile, Brand } from "@/lib/types";
import { calculatePayrollPeriod, generatePayrollRecap, type PeriodMode } from "@/lib/payroll-recap";
import { Badge } from "@/components/ui/badge";

const PERIOD_MODES: Array<{ value: PeriodMode; label: string }> = [
  { value: "calendar", label: "Bulan Kalender" },
  { value: "payroll", label: "Periode Payroll" },
  { value: "custom", label: "Custom Range" },
];

export default function RekapAbsensiPayrollPage() {
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  // Period settings
  const [periodMode, setPeriodMode] = useState<PeriodMode>("payroll");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Filters
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [searchName, setSearchName] = useState("");

  // Fetch data
  const employeesQuery = useMemoFirebase(
    () => collection(firestore, "employee_profiles"),
    [firestore]
  );
  const { data: employees, isLoading: loadingEmployees } =
    useCollection<EmployeeProfile>(employeesQuery);

  const brandsQuery = useMemoFirebase(
    () => collection(firestore, "brands"),
    [firestore]
  );
  const { data: brands } = useCollection<Brand>(brandsQuery);

  const attendanceQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "attendance_events"));
  }, [firestore]);
  const { data: attendanceEvents, isLoading: loadingAttendance } =
    useCollection<any>(attendanceQuery);

  const leavesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, "leave_requests"),
      where("status", "in", ["approved", "active_leave"])
    );
  }, [firestore]);
  const { data: leaveRequests } = useCollection<any>(leavesQuery);

  const isLoading = loadingEmployees || loadingAttendance;

  // Calculate active period
  const activePeriod = useMemo(() => {
    const targetDate = new Date(selectedYear, selectedMonth, 1);
    return calculatePayrollPeriod(
      periodMode,
      0,
      customStartDate ? new Date(customStartDate) : undefined,
      customEndDate ? new Date(customEndDate) : undefined
    );
  }, [periodMode, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Generate recap data
  const { recapRows, uniqueDivisions } = useMemo(() => {
    if (!employees || !attendanceEvents || !leaveRequests || !brands) {
      return { recapRows: [], uniqueDivisions: [] };
    }

    const allRows = generatePayrollRecap(
      employees,
      activePeriod,
      attendanceEvents,
      leaveRequests,
      brands
    );

    // Apply filters
    const filtered = allRows.filter((row) => {
      if (selectedBrand !== "all" && row.brandId !== selectedBrand) return false;
      if (selectedDivision !== "all" && row.divisionName !== selectedDivision) return false;
      if (searchName && !row.fullName.toLowerCase().includes(searchName.toLowerCase())) return false;
      return true;
    });

    // Get unique divisions for current brand
    const divs = new Set<string>();
    allRows.forEach((row) => {
      if (selectedBrand === "all" || row.brandId === selectedBrand) {
        divs.add(row.divisionName);
      }
    });

    return { recapRows: filtered, uniqueDivisions: Array.from(divs).sort() };
  }, [employees, attendanceEvents, leaveRequests, brands, activePeriod, selectedBrand, selectedDivision, searchName]);

  const handleExport = () => {
    // TODO: Implement CSV/Excel export
    console.log("Export clicked");
  };

  const handleResetFilters = () => {
    setSelectedBrand("all");
    setSelectedDivision("all");
    setSearchName("");
  };

  // Conditional renders after all hooks
  if (!hasAccess) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  if (isLoading) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Rekap Absensi Payroll">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Rekap Absensi Payroll
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Ringkasan kehadiran karyawan untuk keperluan payroll
            </p>
          </div>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
        </div>

        {/* Period Selection */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Pilih Periode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* Mode */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                  Mode Periode
                </label>
                <Select value={periodMode} onValueChange={(val) => setPeriodMode(val as PeriodMode)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month - shown for calendar/payroll */}
              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                    Bulan
                  </label>
                  <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
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

              {/* Year - shown for calendar/payroll */}
              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                    Tahun
                  </label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = new Date().getFullYear() - i;
                        return (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Custom Start Date */}
              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                    Tanggal Mulai
                  </label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {/* Custom End Date */}
              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                    Tanggal Selesai
                  </label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Period Preview */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-semibold">Periode Aktif:</span> {format(activePeriod.startDate, "d MMM yyyy", { locale: idLocale })} – {format(activePeriod.endDate, "d MMM yyyy", { locale: idLocale })}
          </p>
        </div>

        {/* Filters */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <CardTitle className="text-base">Filter</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Brand */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                  Brand
                </label>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brands?.map((b) => (
                      <SelectItem key={b.id} value={b.id || ""}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Division */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                  Divisi
                </label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {uniqueDivisions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name Search */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1.5 block">
                  Nama Karyawan
                </label>
                <Input
                  placeholder="Cari nama..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="h-9 text-sm bg-white dark:bg-slate-900"
                />
              </div>

              {/* Reset Button */}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs w-full"
                  onClick={handleResetFilters}
                >
                  Reset Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 px-4">
                      Nama / NIK
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12">
                      Brand
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12">
                      Divisi
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Hari Kerja
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Hadir
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Terlambat
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Izin
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Cuti
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Sakit
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Alpha
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Total Jam
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recapRows.length > 0 ? (
                    recapRows.map((row) => (
                      <TableRow
                        key={row.employeeId}
                        className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <TableCell className="px-4 font-medium text-slate-900 dark:text-white text-sm">
                          <div>{row.fullName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{row.employeeNumber}</div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200">
                          {row.brandName}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200">
                          {row.divisionName}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums">
                          {row.hariKerja}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums font-medium">
                          {row.hadir}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums">
                          {row.terlambat > 0 ? (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                              {row.terlambat}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums">
                          {row.izin || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums">
                          {row.cuti || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums">
                          {row.sakit || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums">
                          {row.alpha > 0 ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                              {row.alpha}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right tabular-nums font-medium">
                          {row.totalJamKerja}h
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-slate-600 dark:text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-slate-400" />
                          <p>Tidak ada data untuk periode dan filter yang dipilih</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {recapRows.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20">
            <CardHeader>
              <CardTitle className="text-sm">Ringkasan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Karyawan Web Absen</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{recapRows.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Rata-rata Hadir</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {(recapRows.reduce((sum, r) => sum + r.hadir, 0) / recapRows.length).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Alpha</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">
                    {recapRows.reduce((sum, r) => sum + r.alpha, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
