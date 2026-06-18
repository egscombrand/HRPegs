"use client";

import { useState, useMemo, type ReactNode } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, collectionGroup } from "firebase/firestore";
import { format, eachDayOfInterval } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, AlertCircle, RotateCcw, CalendarDays, Info, Eye, FileSpreadsheet, Clock } from "lucide-react";
import type { EmployeeProfile, Brand } from "@/lib/types";
import {
  calculatePayrollPeriod,
  generatePayrollRecap,
  INDONESIA_PUBLIC_HOLIDAYS_2026,
  mergeEmployeeIdentity,
  type HolidayDetail,
  type PeriodMode,
  type PayrollRecapRow,
} from "@/lib/payroll-recap";
import { Badge } from "@/components/ui/badge";

const PERIOD_MODES: Array<{ value: PeriodMode; label: string }> = [
  { value: "payroll", label: "Periode Payroll (26–25)" },
  { value: "calendar", label: "Bulan Kalender" },
  { value: "custom", label: "Custom Range" },
];

// ── Late Details Modal ──────────────────────────────────────────────────────

function LateDetailsModal({
  row,
  open,
  onClose,
}: {
  row: PayrollRecapRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Rincian Keterlambatan — {row.fullName}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <p className="text-xs text-slate-500 mb-3">
            Total: <span className="font-semibold text-orange-600">{row.terlambat}×</span>{" "}
            / <span className="font-semibold text-orange-600">{row.menitTerlambat} menit</span>
          </p>
          {row.lateDetails.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Tidak ada keterlambatan</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {row.lateDetails.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {format(new Date(d.date), "d MMMM yyyy", { locale: idLocale })}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <Clock className="h-3 w-3" />
                      Jam masuk: {d.tapInTime}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 text-xs"
                  >
                    Terlambat {d.lateMinutes}m
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function formatDateId(dateStr: string) {
  return format(new Date(dateStr), "d MMMM yyyy", { locale: idLocale });
}

function escapeCsv(value: any) {
  const text = value == null || value === "" ? "-" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "Belum Berjalan":
      return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700";
    case "Libur Nasional":
      return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
    case "Cuti Bersama":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800";
    case "Libur Perusahaan":
    case "Akhir Pekan":
      return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700";
    case "Tepat Waktu":
    case "Hadir":
      return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
    case "Terlambat":
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800";
    case "Izin":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
    case "Cuti":
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800";
    case "Dinas":
    case "Dinas + Tepat Waktu":
    case "Dinas + Hadir":
    case "Dinas + Terlambat":
      return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800";
    case "Alpha":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700";
  }
}

function calendarRowClass(status: string, index: number) {
  const zebra = index % 2 === 0 ? "bg-white dark:bg-slate-950/30" : "bg-slate-50/50 dark:bg-slate-900/20";
  switch (status) {
    case "Alpha":
      return "bg-red-50/70 dark:bg-red-950/20";
    case "Terlambat":
    case "Dinas + Terlambat":
      return "bg-orange-50/70 dark:bg-orange-950/20";
    case "Izin":
      return "bg-blue-50/70 dark:bg-blue-950/20";
    case "Cuti":
      return "bg-purple-50/70 dark:bg-purple-950/20";
    case "Dinas":
    case "Dinas + Tepat Waktu":
    case "Dinas + Hadir":
      return "bg-teal-50/70 dark:bg-teal-950/20";
    case "Tepat Waktu":
    case "Hadir":
      return "bg-green-50/70 dark:bg-green-950/20";
    case "Libur Nasional":
    case "Cuti Bersama":
    case "Libur Perusahaan":
    case "Akhir Pekan":
      return "bg-slate-100/70 dark:bg-slate-900/50";
    case "Belum Berjalan":
      return "bg-slate-50 dark:bg-slate-900/30";
    default:
      return zebra;
  }
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
      {children}
    </div>
  );
}

function DetailTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="max-h-[52vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(148,163,184,0.25)] dark:bg-slate-900">
          <TableRow>
            {headers.map(header => (
              <TableHead key={header} className="h-9 whitespace-nowrap text-[10px] font-black uppercase text-slate-500">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex} className={`border-slate-200 dark:border-slate-800/50 ${rowIndex % 2 === 0 ? "bg-white dark:bg-slate-950/20" : "bg-slate-50/50 dark:bg-slate-900/20"}`}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="whitespace-nowrap py-2 text-xs text-slate-700 dark:text-slate-300">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const CALENDAR_FILTERS = [
  { value: "Semua", label: "Semua" },
  { value: "Tepat Waktu", label: "Tepat Waktu" },
  { value: "Terlambat", label: "Terlambat" },
  { value: "Izin/Cuti/Dinas", label: "Izin/Cuti/Dinas" },
  { value: "Alpha", label: "Alpha" },
  { value: "Libur", label: "Libur" },
  { value: "Belum Berjalan", label: "Belum Berjalan" },
] as const;
type CalendarFilterValue = (typeof CALENDAR_FILTERS)[number]["value"];

function matchesCalendarFilter(status: string, filter: CalendarFilterValue) {
  if (filter === "Semua") return true;
  if (filter === "Tepat Waktu") return ["Tepat Waktu", "Dinas + Tepat Waktu"].includes(status);
  if (filter === "Terlambat") return ["Terlambat", "Dinas + Terlambat"].includes(status);
  if (filter === "Izin/Cuti/Dinas") return ["Izin", "Cuti", "Dinas", "Dinas + Tepat Waktu", "Dinas + Terlambat", "Dinas + Hadir"].includes(status);
  if (filter === "Libur") return ["Libur Nasional", "Cuti Bersama", "Libur Perusahaan", "Akhir Pekan"].includes(status);
  return status === filter;
}

function CalendarSummaryTable({
  rows,
  filter,
  search,
  onFilterChange,
  onSearchChange,
}: {
  rows: PayrollRecapRow["calendarDetails"];
  filter: CalendarFilterValue;
  search: string;
  onFilterChange: (value: CalendarFilterValue) => void;
  onSearchChange: (value: string) => void;
}) {
  const filteredRows = rows.filter(row => {
    const query = search.trim().toLowerCase();
    const matchesFilter = matchesCalendarFilter(row.status, filter);
    if (!query) return matchesFilter;
    const haystack = [
      formatDateId(row.date),
      row.dayName,
      row.status,
      row.tapInTime || "",
      row.tapOutTime || "",
      row.keterangan || "",
    ].join(" ").toLowerCase();
    return matchesFilter && haystack.includes(query);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
          <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Filter detail tanggal:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {CALENDAR_FILTERS.map(item => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={filter === item.value ? "default" : "outline"}
                className={`h-7 shrink-0 rounded-full px-2.5 text-[11px] ${filter === item.value ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-white dark:bg-slate-950"}`}
                onClick={() => onFilterChange(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Cari tanggal, status, atau keterangan..."
          className="h-8 w-full text-xs lg:w-[320px]"
        />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState>Tidak ada data kalender yang sesuai filter.</EmptyState>
      ) : (
        <div className="max-h-[52vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table className="min-w-[980px] table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(148,163,184,0.25)] dark:bg-slate-900">
              <TableRow>
                <TableHead className="w-[56px] text-center text-[10px] font-black uppercase text-slate-500">No</TableHead>
                <TableHead className="w-[160px] text-[10px] font-black uppercase text-slate-500">Tanggal</TableHead>
                <TableHead className="w-[120px] text-[10px] font-black uppercase text-slate-500">Hari</TableHead>
                <TableHead className="w-[170px] text-[10px] font-black uppercase text-slate-500">Status</TableHead>
                <TableHead className="w-[100px] text-[10px] font-black uppercase text-slate-500">Jam Masuk</TableHead>
                <TableHead className="w-[100px] text-[10px] font-black uppercase text-slate-500">Jam Pulang</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-500">Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((day, index) => (
                <TableRow key={day.date} className={`border-slate-200 transition-colors dark:border-slate-800/50 ${calendarRowClass(day.status, index)}`}>
                  <TableCell className="text-center text-xs tabular-nums text-slate-500">{index + 1}</TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">{formatDateId(day.date)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-xs text-slate-700 dark:text-slate-300">{day.dayName}</TableCell>
                  <TableCell className="py-2.5">
                    <Badge variant="outline" className={`whitespace-nowrap text-xs ${statusBadgeClass(day.status)}`}>
                      {day.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">{day.tapInTime || "-"}</TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">{day.tapOutTime || "-"}</TableCell>
                  <TableCell className="py-2.5 text-xs leading-5 text-slate-700 dark:text-slate-300">{day.keterangan || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AttendancePayrollDetailModal({
  row,
  period,
  open,
  onClose,
}: {
  row: PayrollRecapRow | null;
  period: { startDate: Date; endDate: Date };
  open: boolean;
  onClose: () => void;
}) {
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilterValue>("Semua");
  const [calendarSearch, setCalendarSearch] = useState("");
  if (!row) return null;
  const periodLabel = `${format(period.startDate, "d MMM yyyy", { locale: idLocale })} - ${format(period.endDate, "d MMM yyyy", { locale: idLocale })}`;
  const countedLeaveDates = new Set(
    row.calendarDetails
      .filter(d => ["Izin", "Cuti", "Dinas", "Dinas + Tepat Waktu", "Dinas + Terlambat", "Dinas + Hadir"].includes(d.status))
      .map(d => d.date)
  );
  const approvedLeaveDetails = row.leaveDetails.filter(d =>
    countedLeaveDates.has(d.date) &&
    ["approved", "disetujui", "hrd_approved", "approved_by_hrd", "approved_hrd", "approved_by_manager", "approved_by_director", "confirmed_by_staff", "validated_by_manager", "validated", "active", "in_progress", "departed", "arrived", "activity_done", "return_started", "closed", "completed", "selesai", "accepted", "active_leave", "approved_ready_to_depart", "ready_to_depart", "on_duty", "returned", "returned_pending_report", "report_submitted", "final_report_submitted"].includes(String(d.status || "").toLowerCase())
  );
  const totalTepatWaktu = row.calendarDetails.filter(d => ["Tepat Waktu", "Dinas + Tepat Waktu"].includes(d.status)).length;

  const exportDetail = () => {
    const csvRows = [
      ["Section", "Tanggal", "Hari", "Status/Jenis", "Jam Masuk", "Jam Pulang", "Batas Jam Masuk", "Menit Terlambat", "Sumber Data", "Keterangan", "Approval", "Disetujui Oleh"].map(escapeCsv).join(","),
      ...row.calendarDetails.map(d => ["Ringkasan Kalender", formatDateId(d.date), d.dayName, d.status, d.tapInTime || "-", d.tapOutTime || "-", "-", "-", "-", d.keterangan || "-", "-", "-"].map(escapeCsv).join(",")),
      ...row.hadirDetails.map(d => ["Hadir", formatDateId(d.date), d.dayName, d.status === "terlambat" ? "Terlambat" : "Tepat Waktu", d.tapInTime || "-", d.tapOutTime || "-", "-", d.lateMinutes || "-", d.source, d.notes || "-", "-", "-"].map(escapeCsv).join(",")),
      ...row.lateDetails.map(d => ["Terlambat", formatDateId(d.date), format(new Date(d.date), "EEEE", { locale: idLocale }), "Terlambat", d.tapInTime, "-", d.scheduledStartTime || "-", d.lateMinutes, "-", `Terlambat ${d.lateMinutes} menit dari batas toleransi`, "-", "-"].map(escapeCsv).join(",")),
      ...approvedLeaveDetails.map(d => ["Izin/Cuti/Dinas", formatDateId(d.date), format(new Date(d.date), "EEEE", { locale: idLocale }), d.type, "-", "-", "-", "-", "-", d.spdNumber ? `${d.keterangan || "-"} | Nomor SPD: ${d.spdNumber}` : d.keterangan || "-", d.status, d.approvedBy || "-"].map(escapeCsv).join(",")),
      ...row.alphaDetails.map(d => ["Alpha", formatDateId(d.date), d.dayName, "Alpha", "-", "-", "-", "-", "-", d.keterangan, "-", "-"].map(escapeCsv).join(",")),
    ];
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csvRows.join("\n"));
    link.download = `Detail_Absensi_Payroll_${row.employeeNumber || row.employeeId}_${format(period.startDate, "yyyyMMdd")}_${format(period.endDate, "yyyyMMdd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-7xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="text-lg">Detail Absensi Payroll - {row.fullName}</DialogTitle>
              <DialogDescription>Periode {periodLabel}</DialogDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2 self-start" onClick={exportDetail}>
              <FileSpreadsheet className="h-4 w-4" />
              Export Detail
            </Button>
          </div>
        </DialogHeader>
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
            {[
              { label: "Total Hari Kerja", value: row.hariKerja, subtext: `${row.hariKerja} hari` },
              { label: "Total Hadir", value: row.hadir, subtext: `${row.hadir} hari` },
              { label: "Tepat Waktu", value: totalTepatWaktu, subtext: `${totalTepatWaktu} hari` },
              { label: "Terlambat", value: row.terlambat, subtext: `${row.terlambat} kali` },
              { label: "Izin", value: row.izin, subtext: `${row.izin} hari` },
              { label: "Cuti", value: row.cuti, subtext: `${row.cuti} hari` },
              { label: "Dinas", value: row.dinas, subtext: `${row.dinas} hari` },
              { label: "Alpha", value: row.alpha, subtext: `${row.alpha} hari` },
              { label: "Total Menit Terlambat", value: row.menitTerlambat, subtext: `${row.menitTerlambat} menit` },
            ].map(card => (
              <div key={card.label} className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/30">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-bold leading-none text-slate-900 dark:text-white">{card.value}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{card.subtext}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Rekap dihitung berdasarkan periode payroll yang dipilih. Tanggal masa depan belum masuk perhitungan.</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-5 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Rincian Tanggal</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gunakan filter chip untuk melihat tanggal tepat waktu, terlambat, izin/cuti/dinas, alpha, libur, atau belum berjalan.
            </p>
          </div>
          <CalendarSummaryTable
            rows={row.calendarDetails}
            filter={calendarFilter}
            search={calendarSearch}
            onFilterChange={setCalendarFilter}
            onSearchChange={setCalendarSearch}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

  // ── Modal state ──
  const [lateDetailRow, setLateDetailRow] = useState<PayrollRecapRow | null>(null);

  // ── Data fetching (same 3 collections as Data Karyawan) ──
  const { data: employeeProfiles, isLoading: loadingProfiles } =
    useCollection<EmployeeProfile>(
      useMemoFirebase(() => collection(firestore, "employee_profiles"), [firestore])
    );

  const { data: users, isLoading: loadingUsers } =
    useCollection<any>(
      useMemoFirebase(() => collection(firestore, "users"), [firestore])
    );

  const { data: employeesDocs, isLoading: loadingEmployeesDocs } =
    useCollection<any>(
      useMemoFirebase(() => collection(firestore, "employees"), [firestore])
    );

  const { data: brands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore])
  );

  const { data: attendanceEvents, isLoading: loadingAttendance } =
    useCollection<any>(
      useMemoFirebase(() => collection(firestore, "attendance_events"), [firestore])
    );

  const { data: attendanceSites } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "attendance_sites"), [firestore])
  );

  const { data: permissionRequests } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "permission_requests"), [firestore])
  );

  const { data: leaveRequests } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "leave_requests"), [firestore])
  );

  const { data: businessTripMissions } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "business_trip_missions"), [firestore])
  );

  const { data: businessTripMembers } = useCollection<any>(
    useMemoFirebase(() => collectionGroup(firestore, "members"), [firestore])
  );

  const { data: companyHolidays } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "company_holidays"), [firestore])
  );

  const isLoading = loadingProfiles || loadingUsers || loadingEmployeesDocs || loadingAttendance;

  // ── Build lookup maps: uid → user / uid → employeeDoc ──
  const { usersByUid, employeeDocsByUid } = useMemo(() => {
    const usersByUid = new Map<string, any>();
    (users ?? []).forEach(u => { if (u.uid) usersByUid.set(u.uid, u); });
    const employeeDocsByUid = new Map<string, any>();
    (employeesDocs ?? []).forEach(e => { if (e.uid) employeeDocsByUid.set(e.uid, e); });
    return { usersByUid, employeeDocsByUid };
  }, [users, employeesDocs]);

  // ── Merge employee identity (same logic as Data Karyawan) ──
  const mergedEmployees = useMemo(() => {
    if (!employeeProfiles) return [];
    return (employeeProfiles as any[]).map(profile => {
      const uid = profile.uid || profile.id;
      const user = uid ? usersByUid.get(uid) : undefined;
      const empDoc = uid ? employeeDocsByUid.get(uid) : undefined;
      return mergeEmployeeIdentity(profile, user, empDoc);
    });
  }, [employeeProfiles, usersByUid, employeeDocsByUid]);

  // ── Holiday dates ──
  const holidayDetails = useMemo<HolidayDetail[]>(() => {
    const companyHolidayDetails = (companyHolidays || []).flatMap((h: any) => {
      const dates: HolidayDetail[] = [];
      const holidayType = h.type === "national_holiday" || h.type === "collective_leave" ? h.type : "company_holiday";
      const holidayName = h.name || h.title || h.description || "Libur perusahaan";
      if (h.date) {
        dates.push({
          date: typeof h.date === 'string' ? h.date : format(h.date.toDate?.() || new Date(h.date), 'yyyy-MM-dd'),
          type: holidayType,
          name: holidayName,
        });
      }
      if (h.startDate && h.endDate) {
        try {
          const s = h.startDate.toDate?.() || new Date(h.startDate);
          const e = h.endDate.toDate?.() || new Date(h.endDate);
          eachDayOfInterval({ start: s, end: e }).forEach((d: Date) => dates.push({
            date: format(d, 'yyyy-MM-dd'),
            type: holidayType,
            name: holidayName,
          }));
        } catch { /* skip */ }
      }
      return dates;
    }).filter(Boolean);
    const byDate = new Map<string, HolidayDetail>();
    [...INDONESIA_PUBLIC_HOLIDAYS_2026, ...companyHolidayDetails].forEach(holiday => {
      byDate.set(holiday.date, holiday);
    });
    return Array.from(byDate.values());
  }, [companyHolidays]);

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
    if (!mergedEmployees.length || !attendanceEvents || !brands) {
      return { recapRows: [], uniqueDivisions: [] };
    }

    const missionById = new Map<string, any>();
    (businessTripMissions || []).forEach((mission: any) => {
      const missionId = mission.id || mission.missionId;
      if (missionId) missionById.set(String(missionId), mission);
    });
    const enrichedBusinessTripMembers = (businessTripMembers || []).map((member: any) => {
      const mission = missionById.get(String(member.missionId || member.parentId || ""));
      return {
        ...(mission || {}),
        ...member,
        category: "dinas",
        type: "business_trip",
        startDate: member.startDate || mission?.startDate,
        endDate: member.endDate || mission?.endDate,
        missionName: member.missionName || mission?.missionName,
        destinationCity: member.destinationCity || mission?.destinationCity,
        destinationRegency: member.destinationRegency || mission?.destinationRegency,
        destinationProvince: member.destinationProvince || mission?.destinationProvince,
        destinationAddress: member.destinationAddress || mission?.destinationAddress,
        projectName: member.projectName || mission?.projectName,
        instructionNote: member.instructionNote || mission?.instructionNote,
        assignmentNumber: member.assignmentNumber || mission?.assignmentNumber,
        spdNumber: member.spdNumber || mission?.spdNumber || mission?.assignmentNumber,
      };
    });

    const approvedAbsences = [
      ...(permissionRequests || []),
      ...(leaveRequests || []).map((leave: any) => ({ ...leave, category: "cuti" })),
      ...(businessTripMissions || []).map((mission: any) => ({ ...mission, category: "dinas", type: "business_trip" })),
      ...enrichedBusinessTripMembers,
    ];

    const allRows = generatePayrollRecap(
      mergedEmployees as any,
      activePeriod,
      attendanceEvents,
      approvedAbsences,
      brands,
      holidayDetails,
      attendanceSites || []
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
  }, [mergedEmployees, attendanceEvents, permissionRequests, leaveRequests, businessTripMissions, businessTripMembers, brands, activePeriod, holidayDetails, attendanceSites, selectedBrand, selectedDivision, searchName]);

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

        {/* ── Filter Card ── */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardContent className="pt-5 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

              <div className="lg:col-span-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Mode</label>
                <Select value={periodMode} onValueChange={v => setPeriodMode(v as PeriodMode)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_MODES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Bulan</label>
                  <Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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

              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Tahun</label>
                  <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = new Date().getFullYear() - i;
                        return <SelectItem key={y} value={y.toString()}>{y}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Mulai</label>
                  <Input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="h-9 text-sm" />
                </div>
              )}

              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Selesai</label>
                  <Input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="h-9 text-sm" />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Brand</label>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brands?.map(b => (
                      <SelectItem key={b.id} value={b.id || ""}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Divisi</label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {uniqueDivisions.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 items-end sm:col-span-2 md:col-span-1">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Cari</label>
                  <Input placeholder="Nama / NIK..." value={searchName} onChange={e => setSearchName(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="shrink-0">
                  <label className="text-xs invisible block mb-1.5">&nbsp;</label>
                  <Button
                    variant="outline" size="sm" className="h-9 px-3" title="Reset filter"
                    onClick={() => {
                      setSelectedBrand("all"); setSelectedDivision("all"); setSearchName("");
                      setPeriodMode("payroll"); setSelectedMonth(new Date().getMonth());
                      setSelectedYear(new Date().getFullYear()); setCustomStartDate(""); setCustomEndDate("");
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Period Preview + disclaimer ── */}
        <div className="flex flex-col gap-1.5 px-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-blue-700 dark:text-blue-400">Periode Aktif:</span>{" "}
              {format(activePeriod.startDate, "d MMM yyyy", { locale: idLocale })} – {format(activePeriod.endDate, "d MMM yyyy", { locale: idLocale })}
              <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">
                ({recapRows.length} karyawan Web Absen)
              </span>
            </p>
          </div>
          {holidayDetails.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>Hari kerja dihitung berdasarkan Senin–Jumat, belum termasuk kalender libur perusahaan.</span>
            </div>
          )}
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
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 px-4 w-[220px]">Nama / NIK</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11">Brand</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11">Divisi</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Hari Kerja</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Hadir</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Terlambat</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Izin</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Alpha</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Total Jam</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right pr-4">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recapRows.length > 0 ? (
                    recapRows.map(row => (
                      <TableRow
                        key={row.employeeId || row.employeeNumber}
                        className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <TableCell className="px-4 py-3">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">{row.fullName}</div>
                          {row.employeeNumber && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">NIK: {row.employeeNumber}</div>
                          )}
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
                            <button
                              onClick={() => setLateDetailRow(row)}
                              title="Klik untuk lihat rincian"
                            >
                              <Badge
                                variant="outline"
                                className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 text-xs cursor-pointer hover:bg-orange-100 transition-colors"
                              >
                                {row.terlambat}x / {row.menitTerlambat}m
                              </Badge>
                            </button>
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
                        <TableCell className="text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          {row.totalJamKerja > 0 ? `${row.totalJamKerja}h` : <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setLateDetailRow(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Lihat Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-10 text-slate-500 dark:text-slate-400">
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

      {/* ── Late Details Modal ── */}
      <AttendancePayrollDetailModal
        row={lateDetailRow}
        period={activePeriod}
        open={!!lateDetailRow}
        onClose={() => setLateDetailRow(null)}
      />
    </DashboardLayout>
  );
}
