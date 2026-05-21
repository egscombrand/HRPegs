"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Plus,
  X,
  Search,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  BusinessTripMission,
  BusinessTripType,
  CostSchema,
  TRIP_TYPES,
  COST_SCHEMAS,
} from "./types";

// ===== Normalized Staff type for internal use =====
type NormalizedStaff = {
  uid: string;
  fullName: string;
  email: string;
  employeeId: string;
  brandId: string;
  brandName: string;
  divisionId: string;
  divisionName: string;
  jobTitle: string;
  managerUid: string;
  managerName: string;
  employmentStatus: string;
  employeeType: string;
  roleName: string;
};

// ===== Helper: Normalize employee_profiles document to a consistent shape =====
function normalizeStaff(data: any): NormalizedStaff | null {
  // Get UID from multiple possible fields
  const uid = data.uid || data.userId || data.employeeUid || data.id || "";

  // Get name from multiple possible fields (including nested dataDiriIdentitas)
  const fullName =
    data.fullName ||
    data.name ||
    data.displayName ||
    data.dataDiriIdentitas?.fullName ||
    "";

  // If no UID or name, skip this record
  if (!uid || !fullName) return null;

  const email =
    data.email ||
    data.personalEmail ||
    data.dataDiriIdentitas?.personalEmail ||
    "";

  const employeeId =
    data.employeeId ||
    data.nomorIndukKaryawan ||
    data.employeeNumber ||
    data.hrdEmploymentInfo?.employeeId ||
    "";

  const brandId = data.brandId || data.hrdEmploymentInfo?.brandId || "";

  const brandName =
    data.brandName ||
    data.brand ||
    data.hrdEmploymentInfo?.brand ||
    data.hrdEmploymentInfo?.brandName ||
    "";

  const divisionId =
    data.divisionId || data.hrdEmploymentInfo?.divisionId || "";

  const divisionName =
    data.division ||
    data.divisionName ||
    data.hrdEmploymentInfo?.divisi ||
    data.hrdEmploymentInfo?.divisionName ||
    data.department ||
    "";

  const jobTitle =
    data.positionTitle ||
    data.jobTitle ||
    data.jabatan ||
    data.workRole ||
    data.position ||
    data.hrdEmploymentInfo?.jabatan ||
    data.hrdEmploymentInfo?.workRole ||
    data.hrdEmploymentInfo?.structuralPosition ||
    "";

  const managerUid =
    data.managerUid ||
    data.directSupervisorUid ||
    data.supervisorUid ||
    data.hrdEmploymentInfo?.directSupervisorUid ||
    "";

  const managerName =
    data.managerName ||
    data.directSupervisorName ||
    data.supervisorName ||
    data.hrdEmploymentInfo?.directSupervisorName ||
    data.hrdEmploymentInfo?.atasanLangsung ||
    "";

  const employmentStatus =
    data.employmentStatus ||
    data.statusKerja ||
    data.hrdEmploymentInfo?.statusKerja ||
    data.hrdEmploymentInfo?.employmentStatus ||
    "";

  const employeeType =
    data.employeeType ||
    data.tipeKaryawan ||
    data.employmentType ||
    data.hrdEmploymentInfo?.tipeKaryawan ||
    data.hrdEmploymentInfo?.employeeType ||
    "";

  const roleName =
    data.role ||
    data.userRole ||
    data.roleName ||
    (Array.isArray(data.roles) ? data.roles[0] : "") ||
    data.accountRole ||
    "";

  // Collect all role/position/jabatan fields to check for exclusion
  const checkTexts = [
    roleName,
    jobTitle,
    data.workRole,
    data.hrdEmploymentInfo?.workRole,
    data.structuralPosition,
    data.hrdEmploymentInfo?.structuralPosition,
    data.role,
    data.userRole,
    data.accountRole,
  ].filter(Boolean).map(t => String(t).toLowerCase());

  const isExcluded = checkTexts.some(text =>
    /(hrd|super-admin|kandidat|direktur|director|management)/i.test(text)
  );

  if (isExcluded) return null;

  return {
    uid,
    fullName,
    email,
    employeeId,
    brandId,
    brandName,
    divisionId,
    divisionName,
    jobTitle,
    managerUid,
    managerName,
    employmentStatus,
    employeeType,
    roleName,
  };
}

// ===== Helpers =====
function formatDate(value: any) {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return "-";
  }
}

function renderStatusLabel(status?: string) {
  if (!status) return <Badge variant="secondary">Belum diisi</Badge>;
  const normalized = status.replace(/_/g, " ");

  if (status.includes("pending") || status.includes("waiting"))
    return <Badge variant="warning">{normalized}</Badge>;
  if (
    status.includes("rejected") ||
    status.includes("cancelled") ||
    status.includes("declined")
  )
    return <Badge variant="destructive">{normalized}</Badge>;
  if (
    status.includes("approved") ||
    status.includes("completed") ||
    status.includes("ready") ||
    status.includes("on_duty")
  )
    return <Badge variant="success">{normalized}</Badge>;

  return <Badge variant="secondary">{normalized}</Badge>;
}

const ALLOWED_ASSIGNMENT_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function formatRupiah(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(parseInt(digits, 10));
}

function parseRupiahInput(value: string) {
  return value.replace(/\D/g, "");
}

function stripHtml(html = "") {
  return html.replace(/<[^>]+>/g, "").trim();
}

function validateAssignmentLetterFile(file: File) {
  if (!file) {
    return { isValid: false, message: "File tidak boleh kosong." };
  }

  if (!ALLOWED_ASSIGNMENT_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      message: "Format file tidak diperbolehkan. Pilih PDF, DOC, atau DOCX.",
    };
  }

  if (file.size === 0) {
    return { isValid: false, message: "File kosong tidak dapat diunggah." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      isValid: false,
      message: "Ukuran file terlalu besar. Maksimal 10 MB.",
    };
  }

  return { isValid: true, file };
}

// ===== Staff Picker Component =====
function StaffPicker({
  allStaff,
  selectedUids,
  onToggle,
  isLoading,
  error,
}: {
  allStaff: NormalizedStaff[];
  selectedUids: string[];
  onToggle: (uid: string) => void;
  isLoading: boolean;
  error: any;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("__all__");
  const [divisionFilter, setDivisionFilter] = useState("__all__");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState("__all__");
  const [employmentStatusFilter, setEmploymentStatusFilter] =
    useState("__all__");
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(
    new Set(),
  );

  // Extract unique brands, divisions, types, and statuses for filter dropdowns
  const { brands, divisions, employeeTypes, employmentStatuses } =
    useMemo(() => {
      const brandSet = new Map<string, string>();
      const divisionSet = new Map<string, string>();
      const typeSet = new Map<string, string>();
      const statusSet = new Map<string, string>();
      allStaff.forEach((s) => {
        if (s.brandName) brandSet.set(s.brandId || s.brandName, s.brandName);
        if (s.divisionName)
          divisionSet.set(s.divisionId || s.divisionName, s.divisionName);
        if (s.employeeType) typeSet.set(s.employeeType, s.employeeType);
        if (s.employmentStatus)
          statusSet.set(s.employmentStatus, s.employmentStatus);
      });
      return {
        brands: Array.from(brandSet.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        divisions: Array.from(divisionSet.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        employeeTypes: Array.from(typeSet.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        employmentStatuses: Array.from(statusSet.entries()).map(
          ([id, name]) => ({ id, name }),
        ),
      };
    }, [allStaff]);

  // Filter staff based on search and filters
  const filteredStaff = useMemo(() => {
    let result = allStaff;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.jobTitle.toLowerCase().includes(q) ||
          s.employeeType.toLowerCase().includes(q) ||
          s.brandName.toLowerCase().includes(q) ||
          s.divisionName.toLowerCase().includes(q) ||
          s.managerName.toLowerCase().includes(q) ||
          s.employeeId.toLowerCase().includes(q),
      );
    }

    // Brand filter
    if (brandFilter !== "__all__") {
      if (brandFilter === "__empty__") {
        result = result.filter((s) => !s.brandName);
      } else {
        result = result.filter(
          (s) => (s.brandId || s.brandName) === brandFilter,
        );
      }
    }

    // Division filter
    if (divisionFilter !== "__all__") {
      if (divisionFilter === "__empty__") {
        result = result.filter((s) => !s.divisionName);
      } else {
        result = result.filter(
          (s) => (s.divisionId || s.divisionName) === divisionFilter,
        );
      }
    }

    // Employee type filter
    if (employeeTypeFilter !== "__all__") {
      if (employeeTypeFilter === "__empty__") {
        result = result.filter((s) => !s.employeeType);
      } else {
        result = result.filter(
          (s) => (s.employeeType || "") === employeeTypeFilter,
        );
      }
    }

    // Employment status filter
    if (employmentStatusFilter !== "__all__") {
      if (employmentStatusFilter === "__empty__") {
        result = result.filter((s) => !s.employmentStatus);
      } else {
        result = result.filter(
          (s) => (s.employmentStatus || "") === employmentStatusFilter,
        );
      }
    }

    return result;
  }, [
    allStaff,
    searchQuery,
    brandFilter,
    divisionFilter,
    employeeTypeFilter,
    employmentStatusFilter,
  ]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, NormalizedStaff[]>>();

    filteredStaff.forEach((s) => {
      const bKey = s.brandName || "__no_brand__";
      const dKey = s.divisionName || "__no_division__";

      if (!map.has(bKey)) map.set(bKey, new Map());
      const divMap = map.get(bKey)!;
      if (!divMap.has(dKey)) divMap.set(dKey, []);
      divMap.get(dKey)!.push(s);
    });

    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "__no_brand__") return 1;
        if (b === "__no_brand__") return -1;
        return a.localeCompare(b);
      })
      .map(([brand, divMap]) => ({
        brand,
        brandLabel: brand === "__no_brand__" ? "Brand belum diatur" : brand,
        divisions: Array.from(divMap.entries())
          .sort(([a], [b]) => {
            if (a === "__no_division__") return 1;
            if (b === "__no_division__") return -1;
            return a.localeCompare(b);
          })
          .map(([div, staff]) => ({
            division: div,
            divisionLabel:
              div === "__no_division__" ? "Divisi belum diatur" : div,
            staff: staff.sort((a, b) => a.fullName.localeCompare(b.fullName)),
          })),
      }));

    return sorted;
  }, [filteredStaff]);

  const toggleBrandCollapse = (brand: string) => {
    setCollapsedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  // Selected staff chips
  const selectedStaff = useMemo(
    () => allStaff.filter((s) => selectedUids.includes(s.uid)),
    [allStaff, selectedUids],
  );

  // Error state
  if (error) {
    return (
      <div className="border border-destructive/50 rounded-md p-4 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Error memuat data karyawan</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {error?.message ||
            "Terjadi kesalahan saat mengambil data employee_profiles."}
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="border rounded-md p-8 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">
            Memuat data karyawan...
          </p>
        </div>
      </div>
    );
  }

  // Empty state - no employees at all
  if (allStaff.length === 0) {
    return (
      <div className="border rounded-md p-8 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Belum ada data karyawan.</p>
          <p className="text-xs text-muted-foreground">
            Pastikan collection employee_profiles sudah terisi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selected Staff Chips */}
      {selectedStaff.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Staff Terpilih ({selectedStaff.length})
          </Label>
          <div className="flex flex-wrap gap-2">
            {selectedStaff.map((s) => (
              <div
                key={s.uid}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm"
              >
                <span className="font-medium">{s.fullName}</span>
                {s.jobTitle && (
                  <span className="text-muted-foreground">| {s.jobTitle}</span>
                )}
                {!s.managerUid && !s.managerName && (
                  <AlertTriangle
                    className="h-3 w-3 text-amber-500"
                    title="Manager belum ditentukan"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onToggle(s.uid)}
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama, jabatan, tipe, brand, divisi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
            <SelectValue placeholder="Filter Brand" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            <SelectItem value="__all__">Semua Brand</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">Brand belum diatur</SelectItem>
          </SelectContent>
        </Select>
        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
            <SelectValue placeholder="Filter Divisi" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            <SelectItem value="__all__">Semua Divisi</SelectItem>
            {divisions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">Divisi belum diatur</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={employeeTypeFilter}
          onValueChange={setEmployeeTypeFilter}
        >
          <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
            <SelectValue placeholder="Filter Tipe" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            <SelectItem value="__all__">Semua Tipe</SelectItem>
            {employeeTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">Tipe belum diatur</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={employmentStatusFilter}
          onValueChange={setEmploymentStatusFilter}
        >
          <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
            <SelectValue placeholder="Filter Status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
            <SelectItem value="__all__">Semua Status</SelectItem>
            {employmentStatuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">Status belum diatur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Staff List - Grouped */}
      <div className="border border-slate-700 rounded-md bg-slate-900 max-h-[400px] overflow-y-auto">
        {filteredStaff.length === 0 ? (
          <div className="p-8 text-center">
            <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">
              Tidak ada staff sesuai filter.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Coba ubah kata kunci pencarian atau filter brand/divisi.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {grouped.map((brandGroup) => {
              const isCollapsed = collapsedBrands.has(brandGroup.brand);
              const totalInBrand = brandGroup.divisions.reduce(
                (sum, d) => sum + d.staff.length,
                0,
              );
              const selectedInBrand = brandGroup.divisions.reduce(
                (sum, d) =>
                  sum +
                  d.staff.filter((s) => selectedUids.includes(s.uid)).length,
                0,
              );

              return (
                <div key={brandGroup.brand}>
                  {/* Brand Header */}
                  <button
                    type="button"
                    onClick={() => toggleBrandCollapse(brandGroup.brand)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-950 hover:bg-slate-800 transition-colors text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-semibold text-sm flex items-center gap-1.5">
                      {brandGroup.brand === "__no_brand__" ? (
                        <span className="text-amber-500 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Brand belum diatur
                        </span>
                      ) : (
                        brandGroup.brandLabel
                      )}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {selectedInBrand > 0
                        ? `${selectedInBrand}/${totalInBrand} dipilih`
                        : `${totalInBrand} staff`}
                    </Badge>
                  </button>

                  {!isCollapsed && (
                    <div>
                      {brandGroup.divisions.map((divGroup) => (
                        <div key={divGroup.division}>
                          {/* Division Header */}
                          <div className="px-4 py-1.5 bg-slate-950 border-b border-slate-700">
                            <span className="text-xs font-semibold uppercase tracking-wide pl-6 flex items-center gap-1.5">
                              {divGroup.division === "__no_division__" ? (
                                <span className="text-amber-500/90 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Divisi belum diatur
                                </span>
                              ) : (
                                <span className="text-slate-300">{divGroup.divisionLabel}</span>
                              )}
                            </span>
                          </div>

                          {/* Staff Items */}
                          {divGroup.staff.map((staff) => {
                            const isSelected = selectedUids.includes(staff.uid);
                            const noManager =
                              !staff.managerUid && !staff.managerName;

                            return (
                              <div
                                key={staff.uid}
                                onClick={() => onToggle(staff.uid)}
                                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-800/60 last:border-b-0 ${
                                  isSelected
                                    ? "bg-primary/5 hover:bg-primary/10"
                                    : "hover:bg-slate-800/40"
                                }`}
                              >
                                {/* Checkbox indicator */}
                                <div
                                  className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-slate-600"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>

                                {/* Staff Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-100 font-medium">
                                    <span className="font-semibold text-slate-100">
                                      {staff.fullName}
                                    </span>
                                    <span className="text-slate-600 text-xs font-normal">|</span>
                                    <span className="text-slate-300 text-xs font-normal">
                                      {staff.jobTitle ? (
                                        staff.jobTitle
                                      ) : (
                                        <span className="text-amber-500 font-medium">
                                          Jabatan belum diatur
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-slate-600 text-xs font-normal">|</span>
                                    <span className="text-slate-300 text-xs font-normal">
                                      {staff.employeeType ? (
                                        staff.employeeType
                                      ) : (
                                        <span className="text-amber-500 font-medium">
                                          Tipe belum diatur
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-slate-600 text-xs font-normal">|</span>
                                    <span className="text-slate-300 text-xs font-normal">
                                      {staff.brandName ? (
                                        staff.brandName
                                      ) : (
                                        <span className="text-amber-500 font-medium">
                                          Brand belum diatur
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-slate-600 text-xs font-normal">|</span>
                                    <span className="text-slate-300 text-xs font-normal">
                                      {staff.divisionName ? (
                                        staff.divisionName
                                      ) : (
                                        <span className="text-amber-500 font-medium">
                                          Divisi belum diatur
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-slate-600 text-xs font-normal">|</span>
                                    <span className="text-slate-300 text-xs font-normal">
                                      {staff.managerName ? (
                                        `Manager: ${staff.managerName}`
                                      ) : (
                                        <span className="text-amber-500 font-medium">
                                          Manager belum ditentukan
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>

                                {/* Manager Warning */}
                                {noManager && (
                                  <div
                                    className="flex-shrink-0"
                                    title="Manager Divisi belum ditentukan untuk staff ini."
                                  >
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Warning for selected staff without manager */}
      {selectedStaff.some((s) => !s.managerUid && !s.managerName) && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">Perhatian:</span> Beberapa staff yang
            dipilih belum memiliki Manager Divisi. Misi tetap bisa dibuat, namun
            validasi manager akan menunggu sampai manager ditentukan.
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Total: {allStaff.length} karyawan | Ditampilkan: {filteredStaff.length}{" "}
        | Terpilih: {selectedStaff.length}
      </p>
    </div>
  );
}

// ===== Main Component =====
export function ManagementDinasClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [missionForm, setMissionForm] = useState({
    missionName: "",
    assignmentNumber: "",
    projectName: "",
    clientName: "",
    tripType: "Sampling" as BusinessTripType,
    tripTypeOther: "",
    destinationProvince: "",
    destinationRegency: "",
    destinationAddress: "",
    destinationGoogleMaps: "",
    startDate: "",
    endDate: "",
    instructionNote: "",
    costScheme: "reimburse" as CostSchema,
    advanceAmount: "",
    budgetEstimate: "",
    googleDriveLink: "",
  });
  const [assignmentLetterFile, setAssignmentLetterFile] = useState<File | null>(
    null,
  );
  const [assignmentLetterError, setAssignmentLetterError] = useState<
    string | null
  >(null);
  const [selectedStaffUids, setSelectedStaffUids] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch ALL employee_profiles - NO restrictive where clause
  const staffQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, "employee_profiles");
  }, [firestore]);

  const {
    data: rawStaffList,
    isLoading: staffLoading,
    error: staffError,
  } = useCollection<any>(staffQuery);

  // Normalize all employee profiles
  const normalizedStaff = useMemo(() => {
    if (!rawStaffList) return [];
    return rawStaffList
      .map((doc: any) => normalizeStaff(doc))
      .filter((s: NormalizedStaff | null): s is NormalizedStaff => s !== null);
  }, [rawStaffList]);

  // Mission list query
  const missionQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, "business_trip_missions"),
      orderBy("createdAt", "desc"),
    );
  }, [firestore]);

  const { data: missionItems, isLoading } =
    useCollection<BusinessTripMission>(missionQuery);

  const calculateDurationDays = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const ms = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  const handleCreateMission = async () => {
    if (!firestore || !userProfile?.uid) return;
    if (!assignmentLetterFile && !missionForm.googleDriveLink) {
      return toast({
        variant: "destructive",
        title: "Upload Surat Tugas/SPD atau link Google Drive wajib.",
      });
    }
    if (
      !missionForm.missionName ||
      !missionForm.clientName ||
      !missionForm.destinationProvince ||
      !missionForm.destinationRegency ||
      !missionForm.destinationAddress ||
      !missionForm.startDate ||
      !missionForm.endDate ||
      !stripHtml(missionForm.instructionNote)
    ) {
      return toast({
        variant: "destructive",
        title: "Lengkapi semua informasi misi dinas.",
      });
    }
    if (missionForm.tripType === "Lainnya" && !missionForm.tripTypeOther) {
      return toast({
        variant: "destructive",
        title: "Sebutkan jenis dinas lainya jika dipilih Lainnya.",
      });
    }
    if (selectedStaffUids.length === 0) {
      return toast({
        variant: "destructive",
        title: "Pilih minimal satu staff.",
      });
    }

    setIsSaving(true);
    try {
      // Get selected staff from normalized data (no extra Firestore read needed)
      const selectedStaffData = normalizedStaff.filter((s) =>
        selectedStaffUids.includes(s.uid),
      );

      if (selectedStaffData.length === 0) {
        throw new Error("Data staff terpilih tidak ditemukan.");
      }

      let assignmentLetterUrl = missionForm.googleDriveLink;
      let assignmentLetterFileName = assignmentLetterFile?.name || "";
      let documentSource: "firebase_storage" | "google_drive_link" =
        missionForm.googleDriveLink ? "google_drive_link" : "firebase_storage";

      if (assignmentLetterFile) {
        try {
          const filePath = `business_trip_missions/${userProfile.uid}/${Date.now()}_${assignmentLetterFile.name}`;
          const uploadResult = await uploadFile(
            assignmentLetterFile,
            filePath,
            userProfile.uid,
            {
              compress: false,
            },
          );
          assignmentLetterUrl =
            uploadResult.downloadUrl ||
            uploadResult.viewUrl ||
            assignmentLetterUrl;
          assignmentLetterFileName = uploadResult.fileName;
          documentSource =
            uploadResult.storageProvider === "firebaseStorage"
              ? "firebase_storage"
              : "google_drive_link";
        } catch (uploadError: any) {
          console.warn("Upload file gagal:", uploadError);
          if (missionForm.googleDriveLink) {
            toast({
              title: "Upload file gagal",
              description:
                "File tidak dapat diunggah, menggunakan link Google Drive sebagai sumber dokumen.",
            });
            assignmentLetterUrl = missionForm.googleDriveLink;
            assignmentLetterFileName = "";
            documentSource = "google_drive_link";
          } else {
            throw uploadError;
          }
        }
      }

      const missionCollection = collection(firestore, "business_trip_missions");
      const missionRef = doc(missionCollection);
      const durationDays = calculateDurationDays(
        missionForm.startDate,
        missionForm.endDate,
      );
      const assignmentNumber =
        missionForm.assignmentNumber || `SPD-${Date.now()}`;

      // Create main mission document
      await setDoc(missionRef, {
        missionName: missionForm.missionName,
        assignmentNumber,
        assignmentLetterUrl,
        assignmentLetterFileName,
        documentSource,
        googleDriveLink: missionForm.googleDriveLink || "",
        assignedByUid: userProfile.uid,
        assignedByName: userProfile.fullName,
        assignedByPosition: userProfile.positionTitle || userProfile.role,
        projectName: missionForm.projectName,
        clientName: missionForm.clientName,
        tripType: missionForm.tripType,
        tripTypeOther:
          missionForm.tripType === "Lainnya" ? missionForm.tripTypeOther : "",
        destinationProvince: missionForm.destinationProvince,
        destinationRegency: missionForm.destinationRegency,
        destinationAddress: missionForm.destinationAddress,
        destinationGoogleMaps: missionForm.destinationGoogleMaps,
        startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
        endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
        durationDays,
        instructionNote: missionForm.instructionNote,
        costScheme: missionForm.costScheme,
        advanceAmount: Number(missionForm.advanceAmount) || 0,
        budgetEstimate:
          Number(parseRupiahInput(missionForm.budgetEstimate)) || 0,
        memberCount: selectedStaffData.length,
        status: "pending_manager_validation",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create subcollection members for each selected staff
      await Promise.all(
        selectedStaffData.map(async (staff) => {
          const membersCollection = collection(
            firestore,
            "business_trip_missions",
            missionRef.id,
            "members",
          );
          const memberRef = doc(membersCollection);
          await setDoc(memberRef, {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeeEmail: staff.email || "",
            employeePosition: staff.jobTitle || "-",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || "-",
            managerUid: staff.managerUid || "",
            managerName: staff.managerName || "",
            startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
            endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
            durationDays,
            memberStatus: "waiting_manager_validation",
            managerValidationStatus: staff.managerUid
              ? "pending"
              : "pending_no_manager",
            staffConfirmationStatus: "waiting",
            missionStatus: "pending_manager_validation",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }),
      );

      // Add timeline entry
      const timelineCollection = collection(
        firestore,
        "business_trip_missions",
        missionRef.id,
        "timeline",
      );
      await addDoc(timelineCollection, {
        message: `Misi Dinas dibuat dengan ${selectedStaffData.length} anggota.`,
        createdAt: serverTimestamp(),
        byUid: userProfile.uid,
        byName: userProfile.fullName,
      });

      // Reset form
      setMissionForm({
        missionName: "",
        assignmentNumber: "",
        projectName: "",
        clientName: "",
        tripType: "Sampling",
        tripTypeOther: "",
        destinationProvince: "",
        destinationRegency: "",
        destinationAddress: "",
        destinationGoogleMaps: "",
        startDate: "",
        endDate: "",
        instructionNote: "",
        costScheme: "reimburse",
        advanceAmount: "",
        budgetEstimate: "",
        googleDriveLink: "",
      });
      setSelectedStaffUids([]);
      setAssignmentLetterFile(null);
      setAssignmentLetterError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsCreating(false);
      toast({
        title: "Misi Dinas berhasil dibuat",
        description: `${selectedStaffData.length} anggota telah ditambahkan ke misi.`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membuat misi dinas",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStaffSelection = useCallback((uid: string) => {
    setSelectedStaffUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  }, []);

  if (!userProfile?.uid) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {!isCreating ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Daftar Misi Dinas</CardTitle>
              <CardDescription>
                Kelola misi dinas yang dibuat oleh Management.
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Buat Misi Baru
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div>Loading data...</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Misi</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Skema Biaya</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missionItems?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">
                          Belum ada misi dinas
                        </TableCell>
                      </TableRow>
                    ) : (
                      missionItems?.map((mission) => (
                        <TableRow key={mission.id}>
                          <TableCell className="font-medium">
                            {mission.missionName}
                            <div className="text-xs text-muted-foreground">
                              {mission.assignmentNumber}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              {mission.destinationRegency ||
                                mission.destinationCity ||
                                "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {mission.destinationProvince || ""}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {mission.destinationAddress}
                            </div>
                            {mission.destinationGoogleMaps && (
                              <div className="text-xs text-primary underline mt-1">
                                <a
                                  href={mission.destinationGoogleMaps}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Google Maps
                                </a>
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">
                              {mission.clientName}
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDate(mission.startDate)} -{" "}
                            {formatDate(mission.endDate)}
                          </TableCell>
                          <TableCell className="capitalize">
                            {mission.costScheme?.replace("_", " ")}
                          </TableCell>
                          <TableCell>
                            {renderStatusLabel(mission.status)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#111827] border-slate-700 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-700 pb-4">
            <div>
              <CardTitle className="text-slate-100">Buat Misi Dinas Baru</CardTitle>
              <CardDescription className="text-slate-400">
                Isi form untuk membuat Surat Perintah Dinas.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              onClick={() => setIsCreating(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Nama Misi Dinas</Label>
                <Input
                  value={missionForm.missionName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      missionName: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Contoh: Audit Lapangan Q3"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Nomor Surat Tugas/SPD</Label>
                <Input
                  value={missionForm.assignmentNumber}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      assignmentNumber: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Opsional (Otomatis jika kosong)"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Brand / Proyek</Label>
                <Input
                  value={missionForm.projectName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      projectName: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Nama Proyek/Brand"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Nama Klien</Label>
                <Input
                  value={missionForm.clientName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      clientName: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Klien tujuan"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Jenis Dinas</Label>
                <Select
                  value={missionForm.tripType}
                  onValueChange={(val: any) =>
                    setMissionForm({ ...missionForm, tripType: val })
                  }
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                    {TRIP_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {missionForm.tripType === "Lainnya" && (
                <div className="space-y-2">
                  <Label className="text-slate-200">Sebutkan jenis dinas lainnya</Label>
                  <Input
                    value={missionForm.tripTypeOther}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        tripTypeOther: e.target.value,
                      })
                    }
                    className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                    placeholder="Jenis dinas lainnya"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-slate-200">Provinsi Tujuan</Label>
                <Input
                  value={missionForm.destinationProvince}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationProvince: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Provinsi"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Kota / Kabupaten Tujuan</Label>
                <Input
                  value={missionForm.destinationRegency}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationRegency: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Kota atau Kabupaten"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-slate-200">Alamat Lengkap Tujuan</Label>
                <Textarea
                  value={missionForm.destinationAddress}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationAddress: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 min-h-[100px]"
                  placeholder="Alamat lengkap lokasi tugas"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-slate-200">Link Google Maps (opsional)</Label>
                <Input
                  value={missionForm.destinationGoogleMaps}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationGoogleMaps: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="https://maps.google.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Tanggal Berangkat</Label>
                <Input
                  type="date"
                  value={missionForm.startDate}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      startDate: e.target.value,
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Tanggal Pulang</Label>
                <Input
                  type="date"
                  value={missionForm.endDate}
                  onChange={(e) =>
                    setMissionForm({ ...missionForm, endDate: e.target.value })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 [color-scheme:dark]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-slate-200">Instruksi Utama</Label>
                <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-100">
                  <div className="flex flex-wrap gap-2 border-b border-slate-700 bg-slate-950 p-2">
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("bold")}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("italic")}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("underline")}
                    >
                      U
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() =>
                        document.execCommand("insertUnorderedList")
                      }
                    >
                      • List
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("insertOrderedList")}
                    >
                      1. List
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("justifyLeft")}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("justifyCenter")}
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("justifyRight")}
                    >
                      Right
                    </button>
                    <button
                      type="button"
                      className="rounded px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      onClick={() => document.execCommand("justifyFull")}
                    >
                      Justify
                    </button>
                  </div>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="min-h-[180px] p-3 outline-none text-sm leading-6 text-slate-100 rich-editor"
                    onInput={(e) =>
                      setMissionForm({
                        ...missionForm,
                        instructionNote: (e.currentTarget as HTMLDivElement)
                          .innerHTML,
                      })
                    }
                    dangerouslySetInnerHTML={{
                      __html: missionForm.instructionNote,
                    }}
                    placeholder="Instruksi untuk anggota dinas..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">Skema Biaya</Label>
                <Select
                  value={missionForm.costScheme}
                  onValueChange={(val: any) =>
                    setMissionForm({ ...missionForm, costScheme: val })
                  }
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                    {COST_SCHEMAS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Estimasi Anggaran</Label>
                <Input
                  type="text"
                  value={formatRupiah(missionForm.budgetEstimate)}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      budgetEstimate: parseRupiahInput(e.target.value),
                    })
                  }
                  className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Rp 1.000.000"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-slate-200">Upload Surat Tugas / SPD</Label>
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      className="bg-primary hover:bg-primary/90 text-white font-medium"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Pilih File
                    </Button>
                    <div className="min-w-0 flex-1 text-sm">
                      {assignmentLetterFile ? (
                        <div className="space-y-1">
                          <p className="font-medium text-slate-200">
                            {assignmentLetterFile.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {(assignmentLetterFile.size / 1024 / 1024).toFixed(
                              2,
                            )}{" "}
                            MB • {assignmentLetterFile.type}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">
                          Pilih file PDF/DOC/DOCX maksimal 10 MB.
                        </p>
                      )}
                    </div>
                    {assignmentLetterFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                        onClick={() => {
                          setAssignmentLetterFile(null);
                          setAssignmentLetterError(null);
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) {
                        setAssignmentLetterFile(null);
                        return;
                      }
                      const validation = validateAssignmentLetterFile(file);
                      if (!validation.isValid) {
                        setAssignmentLetterFile(null);
                        setAssignmentLetterError(validation.message || null);
                        return;
                      }
                      setAssignmentLetterError(null);
                      setAssignmentLetterFile(file);
                    }}
                  />
                  {assignmentLetterError && (
                    <p className="text-sm text-destructive mt-2">
                      {assignmentLetterError}
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-2 mt-4">
                    <Label className="text-sm font-medium text-slate-200">
                      Link Google Drive (opsional)
                    </Label>
                    <Input
                      value={missionForm.googleDriveLink}
                      onChange={(e) =>
                        setMissionForm({
                          ...missionForm,
                          googleDriveLink: e.target.value,
                        })
                      }
                      className="bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500"
                      placeholder="https://drive.google.com/..."
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Jika upload file tidak tersedia atau quota Firebase penuh,
                      gunakan link Google Drive sebagai sumber dokumen.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== STAFF PICKER SECTION ===== */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <h3 className="text-lg font-semibold">
                  Pilih Staff (Lintas Brand/Divisi)
                </h3>
              </div>
              <StaffPicker
                allStaff={normalizedStaff}
                selectedUids={selectedStaffUids}
                onToggle={toggleStaffSelection}
                isLoading={staffLoading}
                error={staffError}
              />
            </div>

            <Button
              onClick={handleCreateMission}
              disabled={
                isSaving ||
                !missionForm.missionName ||
                !missionForm.clientName ||
                !missionForm.destinationProvince ||
                !missionForm.destinationRegency ||
                !missionForm.destinationAddress ||
                !missionForm.startDate ||
                !missionForm.endDate ||
                !stripHtml(missionForm.instructionNote) ||
                (missionForm.tripType === "Lainnya" &&
                  !missionForm.tripTypeOther) ||
                (!assignmentLetterFile && !missionForm.googleDriveLink) ||
                selectedStaffUids.length === 0
              }
              className="w-full"
              size="lg"
            >
              {isSaving
                ? "Menyimpan..."
                : `Buat Misi Dinas (${selectedStaffUids.length} staff)`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
