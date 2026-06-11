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
  useDoc,
} from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, Calendar, Users, Filter } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import type { EmployeeProfile, Brand } from "@/lib/types";

interface AttendanceSummary {
  employeeId: string;
  fullName: string;
  employeeNumber: string;
  brandId: string;
  brandName: string;
  divisionId: string;
  divisionName: string;

  // Kehadiran
  hariKerja: number;
  hadir: number;
  terlambat: number;
  menitTerlambat: number;
  pulangAwal: number;
  lupaHapIn: number;
  lupaHapOut: number;

  // Cuti & Izin
  izin: number;
  cuti: number;
  sakit: number;
  dinas: number;
  alpha: number;

  // Lembur
  lembur: number;
  totalJamKerja: number;
}

export default function RekapAbsensiPayrollPage() {
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [searchName, setSearchName] = useState("");

  // Fetch data
  const employeesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const conditions = [where("isActive", "==", true)];
    if (selectedBrand) {
      conditions.push(where("brandId", "==", selectedBrand));
    }
    return query(collection(firestore, "employee_profiles"), ...conditions);
  }, [firestore, selectedBrand]);

  const { data: employees, isLoading: loadingEmployees } =
    useCollection<EmployeeProfile>(employeesQuery);

  const brandsQuery = useMemoFirebase(
    () => collection(firestore, "brands"),
    [firestore]
  );
  const { data: brands } = useCollection<Brand>(brandsQuery);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees
      .filter((emp) => {
        if (selectedDivision && emp.division !== selectedDivision) return false;
        if (searchName && !emp.fullName?.toLowerCase().includes(searchName.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
  }, [employees, selectedDivision, searchName]);

  // Get unique divisions for current brand
  const divisions = useMemo(() => {
    if (!employees) return [];
    const divs = new Set(
      employees
        .filter((emp) => !selectedBrand || emp.brandId === selectedBrand)
        .map((emp) => emp.division)
        .filter((d) => d)
    );
    return Array.from(divs).sort();
  }, [employees, selectedBrand]);

  const handleExport = () => {
    // TODO: Implement Excel export
    console.log("Export clicked");
  };

  // Conditional renders after all hooks
  if (!hasAccess) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  if (loadingEmployees) {
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

        {/* Filters */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <CardTitle className="text-base">Filter</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Month */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Bulan
                </label>
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger>
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

              {/* Year */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Tahun
                </label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger>
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

              {/* Brand */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Brand
                </label>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Brand</SelectItem>
                    {brands?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Division */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Divisi
                </label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Divisi</SelectItem>
                    {divisions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name Search */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Nama Karyawan
                </label>
                <Input
                  placeholder="Cari nama..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="bg-white dark:bg-slate-900"
                />
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
                      Dinas
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Alpha
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-right">
                      Lembur (Jam)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((emp) => (
                      <TableRow key={emp.id} className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors">
                        <TableCell className="px-4 font-medium text-slate-800 dark:text-slate-200 text-sm">
                          <div>{emp.fullName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{emp.employeeNumber}</div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200">
                          {emp.brandName || emp.brandId || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200">
                          {emp.division || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                        <TableCell className="text-sm text-slate-800 dark:text-slate-200 text-right">—</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-slate-600 dark:text-slate-400">
                        Tidak ada data karyawan
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
