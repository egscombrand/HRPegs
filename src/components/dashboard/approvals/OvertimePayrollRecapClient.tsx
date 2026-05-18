"use client";

import { useState, useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, writeBatch, serverTimestamp, query, where, getDocs, Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { sendNotification } from "@/lib/notifications";
import { Search, Loader2, Filter, FileSpreadsheet, Check, ReceiptText, ShieldCheck, User, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface OvertimePayrollRecap {
  id?: string;
  employeeId: string;
  employeeName: string;
  brand: string;
  division: string;
  managerId: string;
  managerName: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  submittedMinutes: number;
  estimatedMinutes: number;
  managerApprovedMinutes: number;
  hrdApprovedMinutes: number;
  location: string;
  workMode: string;
  taskSummary: string;
  reason: string;
  payrollMonth: string;
  payrollStatus: "pending_payroll" | "processing" | "paid" | "excluded";
  approvedByHrd: string;
  approvedAt: any;
  
  // Audit Trail
  payrollStatusUpdatedAt?: any;
  payrollStatusUpdatedBy?: string;
  payrollStatusUpdatedByName?: string;
  payrollNotes?: string;
  paidAt?: any;
  paidBy?: string;
  paidByName?: string;
  processedAt?: any;
  processedBy?: string;
  processedByName?: string;
}

interface EmployeeMaster {
  uid: string;
  employeeNumber?: string;
  nik?: string;
}

export function OvertimePayrollRecapClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Filters State
  const [periodFilter, setPeriodFilter] = useState(() => format(new Date(), "yyyy-MM"));
  const [brandFilter, setBrandFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Checkbox Selection State
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Details sheet and audit logs
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);

  // Mass action modal state
  const [massActionType, setMassActionType] = useState<"processing" | "paid" | "excluded" | null>(null);
  const [massNotes, setMassNotes] = useState("");

  // Individual update note state
  const [individualNote, setIndividualNote] = useState("");

  // Query all payroll recaps
  const recapsRef = useMemoFirebase(() => collection(firestore, "overtime_payroll_recaps"), [firestore]);
  const { data: recaps, isLoading } = useCollection<OvertimePayrollRecap>(recapsRef);

  // Query employees list to fetch NIK/Employee Numbers for export
  const employeesRef = useMemoFirebase(() => collection(firestore, "employees"), [firestore]);
  const { data: employeesData } = useCollection<EmployeeMaster>(employeesRef);

  const employeeMetadataMap = useMemo(() => {
    const map = new Map<string, string>();
    employeesData?.forEach((emp) => {
      map.set(emp.uid, emp.employeeNumber || emp.nik || "-");
    });
    return map;
  }, [employeesData]);

  // Dynamic filter options
  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    recaps?.forEach((r) => {
      if (r.brand) map.set(r.brand, r.brand);
    });
    return [...map.keys()];
  }, [recaps]);

  const divisionOptions = useMemo(() => {
    const map = new Map<string, string>();
    recaps?.forEach((r) => {
      if (r.division) map.set(r.division, r.division);
    });
    return [...map.keys()];
  }, [recaps]);

  // Group and filter recaps
  const filteredAndGroupedRecaps = useMemo(() => {
    if (!recaps) return [];

    const filtered = recaps.filter((r) => {
      if (periodFilter && r.payrollMonth !== periodFilter) return false;
      if (brandFilter !== "all" && r.brand !== brandFilter) return false;
      if (divisionFilter !== "all" && r.division !== divisionFilter) return false;
      if (payrollStatusFilter !== "all" && (r.payrollStatus || "pending_payroll") !== payrollStatusFilter) return false;
      if (searchTerm) {
        const normalized = searchTerm.toLowerCase();
        if (!r.employeeName?.toLowerCase().includes(normalized)) return false;
      }
      return true;
    });

    const groups: Record<string, {
      id: string;
      employeeId: string;
      employeeName: string;
      brand: string;
      division: string;
      payrollMonth: string;
      totalDays: number;
      totalMinutes: number;
      payrollStatus: "pending_payroll" | "processing" | "paid" | "excluded";
      processedAt: any;
      paidAt: any;
      items: OvertimePayrollRecap[];
    }> = {};

    filtered.forEach((r) => {
      const key = `${r.employeeId}-${r.payrollMonth}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          brand: r.brand || "-",
          division: r.division || "-",
          payrollMonth: r.payrollMonth,
          totalDays: 0,
          totalMinutes: 0,
          payrollStatus: r.payrollStatus || "pending_payroll",
          processedAt: null,
          paidAt: null,
          items: [],
        };
      }

      groups[key].totalDays += 1;
      groups[key].totalMinutes += r.hrdApprovedMinutes || 0;
      groups[key].items.push(r);

      // Keep latest audit timestamps for group display
      if (r.processedAt && (!groups[key].processedAt || r.processedAt.seconds > groups[key].processedAt.seconds)) {
        groups[key].processedAt = r.processedAt;
      }
      if (r.paidAt && (!groups[key].paidAt || r.paidAt.seconds > groups[key].paidAt.seconds)) {
        groups[key].paidAt = r.paidAt;
      }

      // Hierarchy of state representation for group
      const currentStatus = groups[key].payrollStatus;
      const itemStatus = r.payrollStatus || "pending_payroll";

      if (currentStatus === "paid" && itemStatus !== "paid") {
        groups[key].payrollStatus = itemStatus;
      } else if (currentStatus === "processing" && (itemStatus === "pending_payroll" || itemStatus === "excluded")) {
        groups[key].payrollStatus = itemStatus;
      } else if (currentStatus === "pending_payroll" && itemStatus === "excluded") {
        groups[key].payrollStatus = "excluded";
      }
    });

    return Object.values(groups).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [recaps, periodFilter, brandFilter, divisionFilter, payrollStatusFilter, searchTerm]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedGroupIds(new Set(filteredAndGroupedRecaps.map((g) => g.id)));
    } else {
      setSelectedGroupIds(new Set());
    }
  };

  const handleSelectRow = (groupId: string, checked: boolean) => {
    const next = new Set(selectedGroupIds);
    if (checked) {
      next.add(groupId);
    } else {
      next.delete(groupId);
    }
    setSelectedGroupIds(next);
  };

  // Perform Payroll Status Update (Single or Bulk)
  const performUpdateStatus = async (
    targetGroups: any[],
    newStatus: "pending_payroll" | "processing" | "paid" | "excluded",
    note: string
  ) => {
    setLoading(true);
    try {
      const batch = writeBatch(firestore);
      const now = new Date();
      const operatorId = userProfile?.uid || "hrd";
      const operatorName = userProfile?.fullName || "HRD Admin";

      // Collect maps to prevent spamming notifications
      const employeeIdsToNotify = new Set<string>();
      const managerActionsMap = new Map<string, { managerId: string, count: number }>();

      for (const group of targetGroups) {
        employeeIdsToNotify.add(group.employeeId);

        // Track managers to send a combined summary notification instead of spamming
        group.items.forEach((item: OvertimePayrollRecap) => {
          if (item.managerId) {
            const entry = managerActionsMap.get(item.managerId) || { managerId: item.managerId, count: 0 };
            entry.count += 1;
            managerActionsMap.set(item.managerId, entry);
          }

          // 1. Update `'overtime_payroll_recaps'` doc
          if (item.id) {
            const recapDocRef = doc(firestore, "overtime_payroll_recaps", item.id);
            const updateFields: any = {
              payrollStatus: newStatus,
              payrollStatusUpdatedAt: serverTimestamp(),
              payrollStatusUpdatedBy: operatorId,
              payrollStatusUpdatedByName: operatorName,
              payrollNotes: note || null,
            };

            if (newStatus === "processing") {
              updateFields.processedAt = serverTimestamp();
              updateFields.processedBy = operatorId;
              updateFields.processedByName = operatorName;
            } else if (newStatus === "paid") {
              updateFields.paidAt = serverTimestamp();
              updateFields.paidBy = operatorId;
              updateFields.paidByName = operatorName;
            }

            batch.update(recapDocRef, updateFields);
          }
        });

        // 2. Query and update corresponding documents in `'overtime_submissions'`
        try {
          const submissionsRef = collection(firestore, "overtime_submissions");
          const q = query(
            submissionsRef,
            where("employeeUid", "==", group.employeeId),
            where("status", "in", ["approved_hrd", "approved"])
          );
          const snap = await getDocs(q);
          snap.docs.forEach((docSnap) => {
            const subData = docSnap.data();
            // Match the month or let it match all approved items in the group period
            const subDate = subData.overtimeDate ? (typeof subData.overtimeDate.toDate === "function" ? subData.overtimeDate.toDate() : new Date(subData.overtimeDate)) : null;
            if (subDate && format(subDate, "yyyy-MM") === group.payrollMonth) {
              const submissionDocRef = doc(firestore, "overtime_submissions", docSnap.id);
              
              const updateFields: any = {
                payrollStatus: newStatus,
                payrollStatusUpdatedAt: serverTimestamp(),
                payrollStatusUpdatedBy: operatorId,
                payrollStatusUpdatedByName: operatorName,
                payrollNotes: note || null,
              };

              if (newStatus === "processing") {
                updateFields.processedAt = serverTimestamp();
                updateFields.processedBy = operatorId;
                updateFields.processedByName = operatorName;
              } else if (newStatus === "paid") {
                updateFields.paidAt = serverTimestamp();
                updateFields.paidBy = operatorId;
                updateFields.paidByName = operatorName;
              }

              batch.update(submissionDocRef, updateFields);
            }
          });
        } catch (subErr) {
          console.error("Error querying overtime_submissions to update payrollStatus:", subErr);
        }
      }

      await batch.commit();

      // 3. Send automated notifications to employees
      for (const empId of employeeIdsToNotify) {
        try {
          let title = "Status Payroll Lembur Diperbarui";
          let message = "Status proses lembur Anda telah diperbarui.";

          if (newStatus === "processing") {
            title = "Lembur Sedang Diproses Payroll";
            message = "Lembur Anda sedang diproses payroll.";
          } else if (newStatus === "paid") {
            title = "Lembur Telah Dibayarkan";
            message = "Lembur Anda telah ditandai sudah dibayarkan.";
          } else if (newStatus === "excluded") {
            title = "Lembur Tidak Masuk Payroll";
            message = "Pengajuan lembur Anda ditandai tidak masuk dalam payroll periode ini.";
          } else if (newStatus === "pending_payroll") {
            title = "Lembur Menunggu Payroll";
            message = "Pengajuan lembur Anda menunggu proses payroll kembali.";
          }

          await sendNotification(firestore, {
            userId: empId,
            type: "status_update",
            module: "employee",
            title,
            message,
            targetType: "user",
            targetId: "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: operatorId,
          });
        } catch (notifErr) {
          console.error("Error sending notification to employee:", notifErr);
        }
      }

      // 4. Send aggregated summary notifications to Managers
      for (const [managerId, entry] of managerActionsMap.entries()) {
        try {
          await sendNotification(firestore, {
            userId: managerId,
            type: "status_update",
            module: "employee",
            title: "Pembaruan Status Payroll Tim",
            message: `${entry.count} pengajuan lembur tim Anda telah diperbarui status payroll-nya menjadi ${
              newStatus === "pending_payroll" ? "Menunggu Payroll"
              : newStatus === "processing" ? "Sedang Diproses"
              : newStatus === "paid" ? "Sudah Dibayarkan"
              : "Tidak Masuk Payroll"
            }.`,
            targetType: "user",
            targetId: "",
            actionUrl: "/admin/manager/persetujuan-lembur",
            createdBy: operatorId,
          });
        } catch (notifErr) {
          console.error("Error sending notification to manager:", notifErr);
        }
      }

      toast({
        title: "Pembaruan Sukses",
        description: `Berhasil memperbarui status payroll untuk ${targetGroups.length} karyawan menjadi ${
          newStatus === "pending_payroll" ? "Menunggu Payroll"
          : newStatus === "processing" ? "Sedang Diproses"
          : newStatus === "paid" ? "Sudah Dibayarkan"
          : "Tidak Masuk Payroll"
        }.`,
      });

      // Clear selection
      setSelectedGroupIds(new Set());
      setMassActionType(null);
      setMassNotes("");
      setIndividualNote("");

      // Update active selected group details if open
      if (selectedGroup) {
        const updatedItems = selectedGroup.items.map((i: any) => ({
          ...i,
          payrollStatus: newStatus,
          payrollStatusUpdatedAt: Timestamp.fromDate(now),
          payrollStatusUpdatedBy: operatorId,
          payrollStatusUpdatedByName: operatorName,
          payrollNotes: note || null,
          processedAt: newStatus === "processing" ? Timestamp.fromDate(now) : i.processedAt,
          processedBy: newStatus === "processing" ? operatorId : i.processedBy,
          processedByName: newStatus === "processing" ? operatorName : i.processedByName,
          paidAt: newStatus === "paid" ? Timestamp.fromDate(now) : i.paidAt,
          paidBy: newStatus === "paid" ? operatorId : i.paidBy,
          paidByName: newStatus === "paid" ? operatorName : i.paidByName,
        }));

        setSelectedGroup({
          ...selectedGroup,
          payrollStatus: newStatus,
          processedAt: newStatus === "processing" ? Timestamp.fromDate(now) : selectedGroup.processedAt,
          paidAt: newStatus === "paid" ? Timestamp.fromDate(now) : selectedGroup.paidAt,
          items: updatedItems,
        });
      }
    } catch (error) {
      console.error("Error committing bulk update:", error);
      toast({
        title: "Gagal Memperbarui",
        description: "Terjadi kesalahan sistem ketika menyimpan status payroll.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Bulk execution
  const executeMassAction = () => {
    if (!massActionType) return;
    const targetGroups = filteredAndGroupedRecaps.filter((g) => selectedGroupIds.has(g.id));
    performUpdateStatus(targetGroups, massActionType, massNotes);
  };

  // CSV Export utility following active filters
  const handleExportCSV = () => {
    try {
      const headers = [
        "Nama Karyawan",
        "NIK / Employee ID",
        "Brand",
        "Divisi",
        "Bulan Payroll",
        "Total Hari Lembur",
        "Total Menit Payroll",
        "Total Durasi Format Jam",
        "Status Payroll",
        "Catatan Payroll",
      ];

      const csvRows = [headers.join(",")];

      filteredAndGroupedRecaps.forEach((g) => {
        const empNumber = employeeMetadataMap.get(g.employeeId) || "-";
        const totalHrs = Math.floor(g.totalMinutes / 60);
        const totalMins = g.totalMinutes % 60;
        const durationFormat = `${totalHrs} jam ${totalMins} menit`;

        const statusLabel =
          g.payrollStatus === "paid" ? "Sudah Dibayarkan"
          : g.payrollStatus === "processing" ? "Sedang Diproses"
          : g.payrollStatus === "excluded" ? "Tidak Masuk Payroll"
          : "Menunggu Payroll";

        const notes = g.items.map((i) => i.payrollNotes).filter(Boolean).join("; ") || "-";

        const row = [
          `"${g.employeeName.replace(/"/g, '""')}"`,
          `"${empNumber}"`,
          `"${g.brand.replace(/"/g, '""')}"`,
          `"${g.division.replace(/"/g, '""')}"`,
          `"${g.payrollMonth}"`,
          g.totalDays,
          g.totalMinutes,
          `"${durationFormat}"`,
          `"${statusLabel}"`,
          `"${notes.replace(/"/g, '""')}"`,
        ];

        csvRows.push(row.join(","));
      });

      const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Rekap_Lembur_Payroll_${periodFilter || "Semua"}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Berhasil",
        description: `Berhasil mengunduh dokumen rekap CSV untuk ${filteredAndGroupedRecaps.length} baris data.`,
      });
    } catch (err) {
      console.error("CSV Export failure:", err);
      toast({
        title: "Export Gagal",
        description: "Gagal melakukan export data ke CSV.",
        variant: "destructive",
      });
    }
  };

  const formatMinutesToHuman = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0 ? `${hrs} jam ${mins} menit` : `${mins} menit`;
  };

  const getStatusBadge = (status: "pending_payroll" | "processing" | "paid" | "excluded") => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold">Sudah Dibayarkan</Badge>;
      case "processing":
        return <Badge className="bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold">Sedang Diproses</Badge>;
      case "excluded":
        return <Badge className="bg-red-500/10 border-red-500/20 text-red-400 font-bold">Tidak Masuk Payroll</Badge>;
      case "pending_payroll":
      default:
        return <Badge className="bg-blue-500/10 border-blue-500/20 text-blue-400 font-bold">Menunggu Payroll</Badge>;
    }
  };

  const parseSafeFormattedDate = (val: any) => {
    if (!val) return "-";
    const date = typeof val.toDate === "function" ? val.toDate() : new Date(val);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  };

  return (
    <div className="space-y-6">
      {/* Title Block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-emerald-400" />
            Rekap Lembur Payroll
          </h1>
          <p className="text-sm text-slate-400">
            Kelola persetujuan lembur final secara massal atau semi-manual untuk dasar perhitungan penggajian karyawan.
          </p>
        </div>
        
        {/* Bulk Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleExportCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </Button>

          {selectedGroupIds.size > 0 && (
            <div className="flex items-center gap-1.5 border border-slate-800 bg-slate-900/60 p-1 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 px-2">{selectedGroupIds.size} Terpilih</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMassActionType("processing");
                  setMassNotes("");
                }}
                className="h-8 rounded-lg text-xs font-bold text-amber-400 hover:bg-amber-500/10"
              >
                Tandai Sedang Diproses
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMassActionType("paid");
                  setMassNotes("");
                }}
                className="h-8 rounded-lg text-xs font-bold text-emerald-400 hover:bg-emerald-500/10"
              >
                Tandai Sudah Dibayarkan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMassActionType("excluded");
                  setMassNotes("");
                }}
                className="h-8 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10"
              >
                Tandai Tidak Masuk Payroll
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filter panel */}
      <Card className="border-slate-800 bg-slate-950/20 rounded-[2rem] shadow-xl backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
            {/* Period Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Bulan Payroll</label>
              <Input
                type="month"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="bg-slate-900/50 border-slate-800 text-white rounded-xl"
              />
            </div>

            {/* Brand Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Brand</label>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="bg-slate-900/50 border-slate-800 text-white rounded-xl">
                  <SelectValue placeholder="Semua Brand" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="all">Semua Brand</SelectItem>
                  {brandOptions.map((brand) => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Division Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Divisi</label>
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger className="bg-slate-900/50 border-slate-800 text-white rounded-xl">
                  <SelectValue placeholder="Semua Divisi" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="all">Semua Divisi</SelectItem>
                  {divisionOptions.map((div) => (
                    <SelectItem key={div} value={div}>{div}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payroll Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Status Payroll</label>
              <Select value={payrollStatusFilter} onValueChange={setPayrollStatusFilter}>
                <SelectTrigger className="bg-slate-900/50 border-slate-800 text-white rounded-xl">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending_payroll">Menunggu Payroll</SelectItem>
                  <SelectItem value="processing">Sedang Diproses</SelectItem>
                  <SelectItem value="paid">Sudah Dibayarkan</SelectItem>
                  <SelectItem value="excluded">Tidak Masuk Payroll</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Cari Karyawan</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Nama karyawan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-slate-900/50 border-slate-800 text-white rounded-xl"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border-slate-800 bg-slate-950/20 rounded-[2rem] shadow-2xl backdrop-blur-xl">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-sm font-semibold">Mengambil Data Rekapitulasi Payroll...</p>
            </div>
          ) : filteredAndGroupedRecaps.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-900/50">
                  <TableRow className="border-slate-800/50 hover:bg-slate-900/50">
                    <TableHead className="px-4 py-4 w-12 text-center">
                      <Checkbox
                        checked={filteredAndGroupedRecaps.length > 0 && selectedGroupIds.size === filteredAndGroupedRecaps.length}
                        onCheckedChange={handleSelectAll}
                        className="border-slate-700 bg-slate-900 data-[state=checked]:bg-emerald-500"
                      />
                    </TableHead>
                    <TableHead className="px-4 py-4 text-left text-xs uppercase font-black text-slate-400">Nama Karyawan</TableHead>
                    <TableHead className="px-3 py-4 text-left text-xs uppercase font-black text-slate-400">Brand / Divisi</TableHead>
                    <TableHead className="px-3 py-4 text-center text-xs uppercase font-black text-slate-400">Bulan Payroll</TableHead>
                    <TableHead className="px-3 py-4 text-center text-xs uppercase font-black text-slate-400 w-32">Total Hari Lembur</TableHead>
                    <TableHead className="px-3 py-4 text-right text-xs uppercase font-black text-emerald-400">Durasi Final HRD</TableHead>
                    <TableHead className="px-3 py-4 text-right text-xs uppercase font-black text-slate-400">Total Menit</TableHead>
                    <TableHead className="px-3 py-4 text-center text-xs uppercase font-black text-slate-400">Status Payroll</TableHead>
                    <TableHead className="px-3 py-4 text-center text-xs uppercase font-black text-slate-400">Tanggal Diproses</TableHead>
                    <TableHead className="px-3 py-4 text-center text-xs uppercase font-black text-slate-400">Tanggal Dibayarkan</TableHead>
                    <TableHead className="px-6 py-4 text-right text-xs uppercase font-black text-slate-400 w-32">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndGroupedRecaps.map((group) => (
                    <TableRow key={group.id} className="border-slate-800/30 hover:bg-slate-900/10 transition-colors">
                      <TableCell className="px-4 py-4 text-center">
                        <Checkbox
                          checked={selectedGroupIds.has(group.id)}
                          onCheckedChange={(checked) => handleSelectRow(group.id, !!checked)}
                          className="border-slate-700 bg-slate-900 data-[state=checked]:bg-emerald-500"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-4 font-bold text-sm text-slate-200">
                        {group.employeeName}
                      </TableCell>
                      <TableCell className="px-3 py-4 text-sm text-slate-400">
                        {group.brand} / {group.division}
                      </TableCell>
                      <TableCell className="px-3 py-4 text-center text-sm font-mono text-slate-300">
                        {group.payrollMonth}
                      </TableCell>
                      <TableCell className="px-3 py-4 text-center">
                        <Badge variant="outline" className="bg-slate-900 border-slate-800 text-slate-300 font-bold px-2 py-0.5">
                          {group.totalDays} Hari
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-4 text-right font-black text-sm text-emerald-400">
                        {formatMinutesToHuman(group.totalMinutes)}
                      </TableCell>
                      <TableCell className="px-3 py-4 text-right font-mono text-sm text-slate-300">
                        {group.totalMinutes} menit
                      </TableCell>
                      <TableCell className="px-3 py-4 text-center">
                        {getStatusBadge(group.payrollStatus)}
                      </TableCell>
                      <TableCell className="px-3 py-4 text-center text-xs text-slate-400 font-mono">
                        {parseSafeFormattedDate(group.processedAt)}
                      </TableCell>
                      <TableCell className="px-3 py-4 text-center text-xs text-slate-400 font-mono">
                        {parseSafeFormattedDate(group.paidAt)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-slate-700 hover:bg-slate-800 hover:text-white rounded-xl text-xs"
                          onClick={() => {
                            setSelectedGroup(group);
                            setIndividualNote(group.items[0]?.payrollNotes || "");
                          }}
                        >
                          Rincian
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-20 text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 animate-pulse">
                🔍
              </div>
              <h3 className="text-lg font-bold text-slate-300">Belum Ada Rekap Payroll</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Tidak ada data lembur berstatus disetujui HRD yang cocok dengan penyaringan filter saat ini.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drawer Rincian Hari & Audit Trail */}
      <Sheet open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <SheetContent className="sm:max-w-2xl bg-slate-950 border-slate-800 text-white overflow-y-auto">
          {selectedGroup && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-lg font-black text-white flex items-center gap-2">
                  <span>📋</span> Detail Lembur Payroll
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  Rincian log lembur yang disetujui untuk {selectedGroup.employeeName} periode {selectedGroup.payrollMonth}.
                </SheetDescription>
              </SheetHeader>

              {/* Group summary card */}
              <div className="grid gap-3 grid-cols-3 rounded-2xl bg-slate-900/50 p-4 border border-slate-800/80">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Hari Kerja</span>
                  <span className="text-sm font-black text-slate-200">{selectedGroup.totalDays} Hari</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Akumulasi Payroll</span>
                  <span className="text-sm font-black text-emerald-400">{formatMinutesToHuman(selectedGroup.totalMinutes)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Status Saat Ini</span>
                  <span className="block mt-0.5">{getStatusBadge(selectedGroup.payrollStatus)}</span>
                </div>
              </div>

              {/* Input Catatan & Aksi Status Payroll */}
              <div className="space-y-3 bg-slate-900/30 p-4 rounded-2xl border border-slate-900">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Catatan & Aksi Status</span>
                
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Catatan Payroll (Opsional)</label>
                  <Textarea
                    placeholder="Masukkan catatan payroll..."
                    value={individualNote}
                    onChange={(e) => setIndividualNote(e.target.value)}
                    className="bg-slate-900 border-slate-800 rounded-xl text-xs h-16 text-white"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    disabled={loading || selectedGroup.payrollStatus === "pending_payroll"}
                    variant="outline"
                    className="border-blue-600/40 text-blue-400 hover:bg-blue-600/10 rounded-xl text-xs h-9"
                    onClick={() => performUpdateStatus([selectedGroup], "pending_payroll", individualNote)}
                  >
                    Tandai Menunggu Payroll
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading || selectedGroup.payrollStatus === "processing"}
                    variant="outline"
                    className="border-amber-600/40 text-amber-400 hover:bg-amber-600/10 rounded-xl text-xs h-9"
                    onClick={() => performUpdateStatus([selectedGroup], "processing", individualNote)}
                  >
                    Tandai Sedang Diproses
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading || selectedGroup.payrollStatus === "paid"}
                    variant="outline"
                    className="border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/10 rounded-xl text-xs h-9"
                    onClick={() => performUpdateStatus([selectedGroup], "paid", individualNote)}
                  >
                    Tandai Sudah Dibayarkan
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading || selectedGroup.payrollStatus === "excluded"}
                    variant="outline"
                    className="border-red-600/40 text-red-400 hover:bg-red-600/10 rounded-xl text-xs h-9"
                    onClick={() => performUpdateStatus([selectedGroup], "excluded", individualNote)}
                  >
                    Tandai Tidak Masuk Payroll
                  </Button>
                </div>
              </div>

              {/* Log Pengajuan Harian */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Log Pengajuan Harian</span>
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/20">
                  <Table>
                    <TableHeader className="bg-slate-900/60">
                      <TableRow className="border-slate-800/50">
                        <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Tanggal</TableHead>
                        <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Jam Kerja</TableHead>
                        <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Lokasi</TableHead>
                        <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Uraian Tugas</TableHead>
                        <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400 text-right">Durasi Ajuan</TableHead>
                        <TableHead className="py-2 text-[10px] uppercase font-bold text-emerald-400 text-right">Durasi Payroll</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedGroup.items.map((item: OvertimePayrollRecap, idx: number) => (
                        <TableRow key={item.id || idx} className="border-slate-800/30 hover:bg-slate-900/20">
                          <TableCell className="py-2 text-xs text-slate-200 font-medium">
                            {format(new Date(item.overtimeDate), "dd MMM yyyy", { locale: idLocale })}
                          </TableCell>
                          <TableCell className="py-2 text-xs font-mono text-slate-400">
                            {item.startTime} - {item.endTime}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-slate-300">
                            {item.location}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-slate-400 max-w-[120px] truncate" title={item.taskSummary}>
                            {item.taskSummary || item.reason || "-"}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-slate-400 text-right">
                            {formatMinutesToHuman(item.submittedMinutes || 0)}
                          </TableCell>
                          <TableCell className="py-2 text-xs font-bold text-emerald-400 text-right">
                            {formatMinutesToHuman(item.hrdApprovedMinutes || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Complete Audit Trail */}
              <div className="space-y-3 bg-slate-900/40 p-5 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block pb-1 border-b border-slate-800">
                  Audit Trail Lembur & Payroll
                </span>
                <div className="space-y-3 pt-2 text-xs">
                  {selectedGroup.items[0] && (
                    <>
                      <div className="flex justify-between items-start gap-4">
                        <span className="text-slate-400">Disetujui Manager:</span>
                        <span className="text-right font-medium text-slate-200">
                          {selectedGroup.items[0].managerName || "Manager"}
                        </span>
                      </div>

                      <div className="flex justify-between items-start gap-4">
                        <span className="text-slate-400">Disetujui HRD:</span>
                        <span className="text-right font-medium text-slate-200">
                          {selectedGroup.items[0].approvedByHrd || "HRD"} 
                          <span className="text-slate-500 block text-[10px]">
                            ({parseSafeFormattedDate(selectedGroup.items[0].approvedAt)})
                          </span>
                        </span>
                      </div>

                      {/* Display payroll status updates */}
                      {selectedGroup.items[0].payrollStatusUpdatedAt && (
                        <div className="flex justify-between items-start gap-4 border-t border-slate-800/50 pt-2">
                          <span className="text-slate-400">Perubahan Payroll Terakhir:</span>
                          <span className="text-right font-medium text-slate-200">
                            Oleh {selectedGroup.items[0].payrollStatusUpdatedByName || "HRD Admin"}
                            <span className="text-slate-500 block text-[10px]">
                              ({parseSafeFormattedDate(selectedGroup.items[0].payrollStatusUpdatedAt)})
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Display processed details */}
                      {selectedGroup.items[0].processedAt && (
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-slate-400">Masuk / Diproses Payroll:</span>
                          <span className="text-right font-medium text-slate-200">
                            {selectedGroup.items[0].processedByName || "HRD Admin"}
                            <span className="text-slate-500 block text-[10px]">
                              ({parseSafeFormattedDate(selectedGroup.items[0].processedAt)})
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Display paid details */}
                      {selectedGroup.items[0].paidAt && (
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-slate-400">Dibayarkan Oleh:</span>
                          <span className="text-right font-medium text-slate-200">
                            {selectedGroup.items[0].paidByName || "HRD Admin"}
                            <span className="text-slate-500 block text-[10px]">
                              ({parseSafeFormattedDate(selectedGroup.items[0].paidAt)})
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Payroll Notes display */}
                      {selectedGroup.items[0].payrollNotes && (
                        <div className="border-t border-slate-800/50 pt-2 space-y-1">
                          <span className="text-slate-400 block font-bold">Catatan Audit Payroll:</span>
                          <p className="bg-slate-950 p-2 rounded-xl text-slate-300 italic border border-slate-900/60">
                            "{selectedGroup.items[0].payrollNotes}"
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Mass Action Execution Dialog */}
      <Dialog open={massActionType !== null} onOpenChange={(open) => !open && setMassActionType(null)}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white font-black text-base flex items-center gap-2">
              <span>⚡</span> Pembaruan Massal Status Payroll
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Ubah status payroll untuk {selectedGroupIds.size} karyawan secara massal menjadi{" "}
              <span className="font-bold text-emerald-400">
                {massActionType === "processing" ? "Sedang Diproses"
                  : massActionType === "paid" ? "Sudah Dibayarkan"
                  : "Tidak Masuk Payroll"}
              </span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Catatan Payroll Massal (Opsional)</label>
              <Textarea
                placeholder="Masukkan catatan massal..."
                value={massNotes}
                onChange={(e) => setMassNotes(e.target.value)}
                className="bg-slate-900 border-slate-800 rounded-xl text-xs h-20 text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMassActionType(null)}
              className="text-slate-400 hover:text-white rounded-xl text-xs h-9"
            >
              Batal
            </Button>
            <Button
              size="sm"
              disabled={loading}
              onClick={executeMassAction}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-9"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Terapkan Massal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
