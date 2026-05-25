"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  uploadFileToGoogleDrive,
  UploadOptions,
} from "@/lib/storage/storage-adapter";
import {
  extractFileIdFromUrl,
  openSecureFile,
} from "@/lib/candidate-docs-utils";
import { useToast } from "@/hooks/use-toast";
import { AppModal } from "@/components/ui/AppModal";
import { DialogTitle } from "@/components/ui/dialog";
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
  MapPin,
  Calendar,
  FileText,
  Wallet,
} from "lucide-react";
import {
  BusinessTripMission,
  BusinessTripMissionMember,
  BusinessTripType,
  TRIP_TYPES,
} from "./types";
import { determineApprovalTarget } from "@/lib/travel-utils";
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import type {
  Brand,
  EmployeeProfile,
  EmployeeMasterData,
  UserProfile,
} from "@/lib/types";

// ===== Normalized Staff type for internal use =====
type NormalizedStaff = {
  uid: string;
  fullName: string;
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
  structuralPosition: string;
  isDivisionManager: boolean;
};

// ===== Exclusion constants =====
// Roles that should never appear in the staff picker
const EXCLUDED_USER_ROLES = new Set([
  "super-admin",
  "super_admin",
  "hrd",
  "hr",
  "admin-system",
  "system-admin",
  "system_admin",
  "admin_system",
  "kandidat",
  "candidate",
]);

// Structural positions to exclude (direktur/management level)
const EXCLUDED_STRUCTURAL_RE = /^(management|direktur|director)$/i;

// Job-title keywords that signal direktur/management
const EXCLUDED_TITLE_RE = /direktur|director|manajemen|management/i;

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

function buildManagerValidationSummaries(members: BusinessTripMissionMember[]) {
  const managerMap = new Map<
    string,
    {
      managerUid: string;
      managerName: string;
      divisionName: string;
      memberUids: string[];
      status: "approved" | "rejected" | "pending";
      notes?: string | null;
      decidedAt?: any;
    }
  >();

  members
    .filter((member) => member.memberStatus !== "archived")
    .forEach((member) => {
      const key = member.managerUid
        ? `${member.managerUid}::${member.divisionName || ""}`
        : `unassigned::${member.employeeUid}`;
      const existing = managerMap.get(key);
      const managerName = member.managerName || "Manager belum ditentukan";
      const divisionName = member.divisionName || "Divisi belum diatur";
      const status = member.managerValidationStatus;
      const derivedStatus =
        status === "approved_by_manager"
          ? "approved"
          : status === "rejected_by_manager"
            ? "rejected"
            : "pending";

      if (!existing) {
        const noteVal: string | null =
          member.managerValidationNote ?? member.staffConfirmationNote ?? null;
        managerMap.set(key, {
          managerUid: member.managerUid || "",
          managerName,
          divisionName,
          memberUids: [member.employeeUid],
          status: derivedStatus,
          notes: noteVal,
          decidedAt: member.updatedAt,
        });
        return;
      }

      existing.memberUids = Array.from(
        new Set([...existing.memberUids, member.employeeUid]),
      );

      if (existing.status !== "approved" && derivedStatus === "approved") {
        existing.status = "approved";
      }
      if (existing.status !== "rejected" && derivedStatus === "rejected") {
        existing.status = "rejected";
      }
      if (!existing.notes && member.managerValidationNote) {
        existing.notes = member.managerValidationNote;
      }
      if (!existing.decidedAt && member.updatedAt) {
        existing.decidedAt = member.updatedAt;
      }
    });

  return Array.from(managerMap.values());
}

function computeManagerValidationProgress(
  members: BusinessTripMissionMember[],
) {
  const managerValidations = buildManagerValidationSummaries(members);
  return {
    managerValidations,
    managerCount: managerValidations.length,
    approvedCount: managerValidations.filter(
      (item) => item.status === "approved",
    ).length,
    rejectedCount: managerValidations.filter(
      (item) => item.status === "rejected",
    ).length,
  };
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
  if (!file) return { isValid: false, message: "File tidak boleh kosong." };
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

// ===== Section Header Component =====
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-border">
      <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
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
  const [structuralPositionFilter, setStructuralPositionFilter] =
    useState("__all__");
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(
    new Set(),
  );

  // ── Extract filter options ────────────────────────────────────────────────
  const { brands, divisions, employeeTypes, structuralPositions } =
    useMemo(() => {
      const brandSet = new Map<string, string>();
      const divisionSet = new Map<string, string>();
      const typeSet = new Map<string, string>();
      const structuralPositionSet = new Map<string, string>();

      allStaff.forEach((s) => {
        const bName =
          s.brandName && s.brandName !== "Brand belum diatur"
            ? s.brandName
            : null;
        const dName =
          s.divisionName && s.divisionName !== "Divisi belum diatur"
            ? s.divisionName
            : null;
        if (bName) brandSet.set(s.brandId || bName, bName);
        if (dName) divisionSet.set(s.divisionId || dName, dName);
        if (s.employeeType && s.employeeType !== "Staf")
          typeSet.set(s.employeeType, s.employeeType);
        if (s.structuralPosition)
          structuralPositionSet.set(s.structuralPosition, s.structuralPosition);
      });

      const structuralPositions = Array.from(
        structuralPositionSet.entries(),
      ).map(([id, name]) => ({
        id,
        name,
      }));

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
        structuralPositions,
      };
    }, [allStaff]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    let result = allStaff;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.jobTitle.toLowerCase().includes(q) ||
          s.employeeType.toLowerCase().includes(q) ||
          s.brandName.toLowerCase().includes(q) ||
          s.divisionName.toLowerCase().includes(q) ||
          s.structuralPosition.toLowerCase().includes(q) ||
          s.managerName.toLowerCase().includes(q) ||
          s.employeeId.toLowerCase().includes(q),
      );
    }

    if (brandFilter !== "__all__") {
      if (brandFilter === "__empty__") {
        result = result.filter(
          (s) => !s.brandId && s.brandName === "Brand belum diatur",
        );
      } else {
        result = result.filter(
          (s) => (s.brandId || s.brandName) === brandFilter,
        );
      }
    }

    if (divisionFilter !== "__all__") {
      if (divisionFilter === "__empty__") {
        result = result.filter((s) => s.divisionName === "Divisi belum diatur");
      } else {
        result = result.filter(
          (s) => (s.divisionId || s.divisionName) === divisionFilter,
        );
      }
    }

    if (employeeTypeFilter !== "__all__") {
      result = result.filter((s) => s.employeeType === employeeTypeFilter);
    }

    if (structuralPositionFilter !== "__all__") {
      if (structuralPositionFilter === "__empty__") {
        result = result.filter((s) => !s.structuralPosition);
      } else {
        result = result.filter(
          (s) => s.structuralPosition === structuralPositionFilter,
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
    structuralPositionFilter,
  ]);

  // ── Group Brand → Division → Staff ────────────────────────────────────────
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

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "Brand belum diatur" || a === "__no_brand__") return 1;
        if (b === "Brand belum diatur" || b === "__no_brand__") return -1;
        return a.localeCompare(b);
      })
      .map(([brand, divMap]) => ({
        brand,
        brandLabel: brand === "__no_brand__" ? "Brand belum diatur" : brand,
        isUnknownBrand:
          brand === "__no_brand__" || brand === "Brand belum diatur",
        divisions: Array.from(divMap.entries())
          .sort(([a], [b]) => {
            if (a === "Divisi belum diatur" || a === "__no_division__")
              return 1;
            if (b === "Divisi belum diatur" || b === "__no_division__")
              return -1;
            return a.localeCompare(b);
          })
          .map(([div, staff]) => ({
            division: div,
            divisionLabel:
              div === "__no_division__" ? "Divisi belum diatur" : div,
            isUnknownDivision:
              div === "__no_division__" || div === "Divisi belum diatur",
            staff: staff.sort((a, b) => a.fullName.localeCompare(b.fullName)),
          })),
      }));
  }, [filteredStaff]);

  const toggleBrandCollapse = (brand: string) => {
    setCollapsedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  const selectedStaff = useMemo(
    () => allStaff.filter((s) => selectedUids.includes(s.uid)),
    [allStaff, selectedUids],
  );

  // ── State renders ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Error memuat data karyawan</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {error?.message || "Terjadi kesalahan saat mengambil data karyawan."}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-8 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <div className="animate-spin h-7 w-7 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">
            Memuat data karyawan...
          </p>
        </div>
      </div>
    );
  }

  if (allStaff.length === 0) {
    return (
      <div className="border border-border rounded-lg p-8 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-foreground">
            Belum ada data karyawan.
          </p>
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
          <Label className="text-sm font-medium text-foreground">
            Tim Terpilih ({selectedStaff.length} orang)
          </Label>
          <div className="flex flex-wrap gap-2">
            {selectedStaff.map((s) => (
              <div
                key={s.uid}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-sm"
              >
                <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-primary">
                    {s.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="font-medium text-foreground">
                  {s.fullName}
                </span>
                {s.isDivisionManager && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                    MGR
                  </Badge>
                )}
                {!s.managerUid && !s.managerName && (
                  <span title="Manager belum ditentukan">
                    <AlertTriangle
                      className="h-3 w-3 text-amber-500"
                      aria-label="Manager belum ditentukan"
                    />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggle(s.uid)}
                  className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama, jabatan, brand, divisi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter Brand" />
          </SelectTrigger>
          <SelectContent>
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
          <SelectTrigger>
            <SelectValue placeholder="Filter Divisi" />
          </SelectTrigger>
          <SelectContent>
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
          value={structuralPositionFilter}
          onValueChange={setStructuralPositionFilter}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter Status Struktur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Status Struktur</SelectItem>
            {structuralPositions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">
              Status Struktur belum diatur
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Staff List – Grouped by Brand → Division */}
      <div className="border border-border rounded-lg bg-card overflow-hidden max-h-[460px] overflow-y-auto">
        {filteredStaff.length === 0 ? (
          <div className="p-8 text-center">
            <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              Tidak ada staff sesuai filter.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Coba ubah kata kunci pencarian atau filter.
            </p>
          </div>
        ) : (
          <div>
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
                <div
                  key={brandGroup.brand}
                  className="border-b border-border last:border-b-0"
                >
                  {/* Brand Header */}
                  <button
                    type="button"
                    onClick={() => toggleBrandCollapse(brandGroup.brand)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm flex items-center gap-1.5 flex-1 min-w-0">
                      {brandGroup.isUnknownBrand ? (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          Brand belum diatur
                        </span>
                      ) : (
                        <span className="text-foreground truncate">
                          {brandGroup.brandLabel}
                        </span>
                      )}
                    </span>
                    <Badge
                      variant="secondary"
                      className="ml-auto text-xs flex-shrink-0"
                    >
                      {selectedInBrand > 0
                        ? `${selectedInBrand}/${totalInBrand} dipilih`
                        : `${totalInBrand} orang`}
                    </Badge>
                  </button>

                  {!isCollapsed && (
                    <div>
                      {brandGroup.divisions.map((divGroup) => (
                        <div key={divGroup.division}>
                          {/* Division Sub-header */}
                          <div className="px-4 py-1.5 bg-muted/20 border-t border-border/60">
                            <span className="text-xs font-semibold uppercase tracking-wide pl-6 flex items-center gap-1.5 text-muted-foreground">
                              {divGroup.isUnknownDivision ? (
                                <span className="text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Divisi belum diatur
                                </span>
                              ) : (
                                divGroup.divisionLabel
                              )}
                            </span>
                          </div>

                          {/* Staff Items */}
                          {divGroup.staff.map((staff) => {
                            const isSelected = selectedUids.includes(staff.uid);
                            const noBrand =
                              !staff.brandId &&
                              staff.brandName === "Brand belum diatur";
                            const noDivision =
                              staff.divisionName === "Divisi belum diatur";
                            const noManager =
                              !staff.managerUid && !staff.managerName;
                            const hasWarning =
                              noBrand || noDivision || noManager;
                            const noTitle =
                              staff.jobTitle === "Jabatan belum diatur";

                            return (
                              <div
                                key={staff.uid}
                                onClick={() => onToggle(staff.uid)}
                                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-t border-border/40 ${
                                  isSelected
                                    ? "bg-primary/5 hover:bg-primary/10"
                                    : "hover:bg-muted/40"
                                }`}
                              >
                                {/* Checkbox */}
                                <div
                                  className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-border bg-background"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>

                                {/* Staff Info */}
                                <div className="flex-1 min-w-0">
                                  {/* Name row */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground">
                                      {staff.fullName}
                                    </span>
                                    {staff.isDivisionManager && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] h-4 px-1.5 border-blue-400/50 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                                      >
                                        Manager Divisi
                                      </Badge>
                                    )}
                                    {staff.employeeId && (
                                      <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                        {staff.employeeId}
                                      </span>
                                    )}
                                  </div>

                                  {/* Details row */}
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                                    {/* Jabatan */}
                                    {noTitle ? (
                                      <span className="text-xs text-amber-600 dark:text-amber-400">
                                        Jabatan belum diatur
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        {staff.jobTitle}
                                      </span>
                                    )}

                                    {staff.employeeType &&
                                      staff.employeeType !== "Staf" && (
                                        <>
                                          <span className="text-muted-foreground/40 text-xs">
                                            •
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {staff.employeeType}
                                          </span>
                                        </>
                                      )}

                                    {/* Manager */}
                                    <span className="text-muted-foreground/40 text-xs">
                                      •
                                    </span>
                                    {noManager ? (
                                      <span className="text-xs text-amber-600 dark:text-amber-400">
                                        Manager belum ditentukan
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        Mgr: {staff.managerName}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Warning indicator */}
                                {hasWarning && (
                                  <div
                                    className="flex-shrink-0 mt-0.5"
                                    title="Data belum lengkap"
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

      {/* Warning: selected staff without manager */}
      {selectedStaff.some((s) => !s.managerUid && !s.managerName) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">Perhatian:</span> Beberapa staff yang
            dipilih belum memiliki Manager Divisi. Perjalanan dinas tetap bisa
            dibuat, namun validasi manager akan menunggu.
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Total karyawan: {allStaff.length} | Ditampilkan: {filteredStaff.length}{" "}
        | Terpilih: {selectedStaff.length}
      </p>
    </div>
  );
}

// ===== Main Component =====
export function ManagementDinasClient() {
  const { userProfile, firebaseUser } = useAuth();
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
    instructionNote: "", // stores TipTap HTML output
    googleDriveLink: "",
  });
  const [assignmentLetterFile, setAssignmentLetterFile] = useState<File | null>(
    null,
  );
  const [assignmentLetterError, setAssignmentLetterError] = useState<
    string | null
  >(null);
  const [editAssignmentLetterFile, setEditAssignmentLetterFile] =
    useState<File | null>(null);
  const [editAssignmentLetterError, setEditAssignmentLetterError] = useState<
    string | null
  >(null);
  const [selectedStaffUids, setSelectedStaffUids] = useState<string[]>([]);
  const [activeMode, setActiveMode] = useState<
    "list" | "create" | "detail" | "edit" | "manage"
  >("list");
  const [activeMission, setActiveMission] =
    useState<BusinessTripMission | null>(null);
  const [activeMissionMembers, setActiveMissionMembers] = useState<
    BusinessTripMissionMember[]
  >([]);
  const [activeMissionTimeline, setActiveMissionTimeline] = useState<any[]>([]);
  const [activeMissionStaffChanges, setActiveMissionStaffChanges] = useState<
    any[]
  >([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [missionRefreshId, setMissionRefreshId] = useState(0);
  const [manageSelectedStaffUids, setManageSelectedStaffUids] = useState<
    string[]
  >([]);
  const [manageStaffReason, setManageStaffReason] = useState("");
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [isDocumentPreviewing, setIsDocumentPreviewing] = useState(false);
  const [documentViewerError, setDocumentViewerError] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMissionMemberUids = useMemo(
    () =>
      activeMissionMembers
        .filter((member) => member.memberStatus !== "archived")
        .map((member) => member.employeeUid),
    [activeMissionMembers],
  );

  const isGoogleDriveLink = (url?: string | null) =>
    !!url && /drive\.google\.com|docs\.google\.com/.test(url);

  const isApiStorageViewUrl = (url?: string) =>
    !!url?.includes("/api/storage/view?fileId=") ||
    /api\/storage\/view\?fileId=/.test(url || "");

  const activeDocumentUrl = useMemo(() => {
    if (!activeMission || !activeMission.id) return "";

    const manualLink = activeMission.googleDriveLink?.trim();
    const assignmentDriveUrl = activeMission.assignmentLetterDriveUrl?.trim();

    if (
      activeMission.assignmentLetterSource === "google_drive_link" ||
      activeMission.documentSource === "google_drive_link"
    ) {
      return manualLink || assignmentDriveUrl || "";
    }

    if (
      activeMission.assignmentLetterSource === "system_drive_upload" ||
      activeMission.assignmentLetterSource === "local_upload" ||
      activeMission.assignmentLetterSource === "google_drive" ||
      activeMission.assignmentLetterSource === "firebase_storage"
    ) {
      return `/api/business-trips/${activeMission.id}/document-preview`;
    }

    return manualLink || assignmentDriveUrl || "";
  }, [activeMission]);

  const activeDocumentLabel = useMemo(() => {
    if (!activeMission) return "Surat Tugas/SPD";
    return (
      activeMission.assignmentLetterFileName ||
      (activeMission.googleDriveLink
        ? "Google Drive Link Manual"
        : "Surat Tugas/SPD")
    );
  }, [activeMission]);

  const activeDocumentSourceLabel = useMemo(() => {
    if (!activeMission) return "";
    if (activeMission.assignmentLetterSource === "local_upload") {
      return "Upload File";
    }
    if (activeMission.assignmentLetterSource === "system_drive_upload") {
      return "Upload File via Drive HRP";
    }
    if (activeMission.assignmentLetterSource === "google_drive_link") {
      return "Google Drive Link Manual";
    }
    if (activeMission.assignmentLetterSource === "google_drive") {
      return "Upload File via Drive HRP";
    }
    if (activeMission.documentSource === "google_drive_link") {
      return "Google Drive Link Manual";
    }
    if (activeMission.documentSource === "firebase_storage") {
      return "Upload File";
    }
    return "Upload File via Drive HRP";
  }, [activeMission]);

  const handleOpenDocumentViewer = () => {
    setDocumentViewerError(null);
    setIsDocumentViewerOpen(true);
  };

  const handlePreviewDocument = async () => {
    if (!activeMission || !activeMission.id) return;
    setDocumentViewerError(null);

    const storedUrl = activeDocumentUrl;
    if (!storedUrl) {
      setDocumentViewerError(
        "Dokumen belum bisa dibuka lintas akun. Pastikan permission Google Drive sudah dibuka untuk viewer internal.",
      );
      return;
    }

    if (storedUrl.includes("/api/business-trips/")) {
      setIsDocumentPreviewing(true);
      try {
        if (!firebaseUser) {
          throw new Error(
            "Sesi login tidak terbaca. Silakan refresh halaman lalu coba lagi.",
          );
        }
        const token = await firebaseUser.getIdToken();
        const response = await fetch(storedUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Gagal memuat dokumen.");
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } catch (error: any) {
        console.error("Gagal pratinjau dokumen:", error);
        setDocumentViewerError(error?.message || "Gagal memuat dokumen.");
      } finally {
        setIsDocumentPreviewing(false);
      }
    } else {
      window.open(storedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const refreshMissionList = () => {
    setMissionRefreshId((prev) => prev + 1);
  };

  // ── Fetch all 4 collections in parallel ──────────────────────────────────
  const { data: usersData, isLoading: usersLoading } =
    useCollection<UserProfile>(
      useMemoFirebase(() => collection(firestore, "users"), [firestore]),
    );

  const { data: employeesData, isLoading: employeesLoading } =
    useCollection<EmployeeMasterData>(
      useMemoFirebase(() => collection(firestore, "employees"), [firestore]),
    );

  const {
    data: employeeProfilesData,
    isLoading: profilesLoading,
    error: profilesError,
  } = useCollection<EmployeeProfile>(
    useMemoFirebase(
      () => collection(firestore, "employee_profiles"),
      [firestore],
    ),
  );

  const { data: brandsData, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const staffLoading =
    usersLoading || employeesLoading || profilesLoading || brandsLoading;

  // ── Helper: should this user/profile be excluded? ────────────────────────
  const shouldExclude = useCallback(
    (
      userRole: string | undefined,
      structuralPosition: string,
      jobTitle: string,
    ): boolean => {
      if (userRole && EXCLUDED_USER_ROLES.has(userRole.toLowerCase()))
        return true;
      if (structuralPosition && EXCLUDED_STRUCTURAL_RE.test(structuralPosition))
        return true;
      if (jobTitle && EXCLUDED_TITLE_RE.test(jobTitle)) return true;
      return false;
    },
    [],
  );

  // ── Build merged + normalized + filtered staff list ───────────────────────
  const allMergedStaff = useMemo<NormalizedStaff[]>(() => {
    if (staffLoading) return [];

    const brands = brandsData || [];

    // Build index maps for O(1) lookups
    const usersByUid = new Map<string, UserProfile>();
    (usersData ?? []).forEach((u) => usersByUid.set(u.uid, u));

    const employeesByUid = new Map<string, EmployeeMasterData>();
    (employeesData ?? []).forEach((e) => employeesByUid.set(e.uid, e));

    const seenUids = new Set<string>();
    const result: NormalizedStaff[] = [];

    // ── PASS 1: employee_profiles (primary source of truth) ──────────────
    (employeeProfilesData ?? []).forEach((profile) => {
      const uid = (profile as any).uid || (profile as any).id;
      if (!uid) return;
      if (seenUids.has(uid)) return;
      seenUids.add(uid);

      const user = usersByUid.get(uid);
      const emp = employeesByUid.get(uid);
      const normalized = normalizeEmployeeRow(
        emp ?? {},
        profile,
        user ?? {},
        brands,
      );

      // Apply exclusion filter
      if (
        shouldExclude(
          user?.role,
          normalized.structuralPosition || "",
          normalized.jabatan,
        )
      )
        return;

      // Resolve best available display name
      const resolvedName =
        emp?.fullName ||
        profile?.fullName ||
        (profile as any)?.employeeName ||
        (profile as any)?.name ||
        (profile?.dataDiriIdentitas as any)?.namaLengkap ||
        user?.fullName ||
        (user as any)?.displayName ||
        profile?.email ||
        user?.email ||
        "";

      if (!resolvedName) return; // skip nameless ghost docs

      result.push({
        uid,
        fullName: resolvedName,
        employeeId: normalized.employeeId || "",
        brandId: normalized.brandId || "",
        brandName: normalized.brandName,
        divisionId: normalized.divisionId || "",
        divisionName: normalized.divisi,
        jobTitle: normalized.jabatan,
        managerUid: normalized.directSupervisorUid || "",
        managerName: normalized.directSupervisorName || "",
        employmentStatus: normalized.employmentStatus || "",
        employeeType: normalized.tipeKaryawan,
        structuralPosition: normalized.structuralPosition || "",
        isDivisionManager:
          normalized.isDivisionManager ||
          normalized.structuralPosition === "division_manager" ||
          false,
      });
    });

    // ── PASS 2: users with 'karyawan' role that have NO profile yet ───────
    (usersData ?? []).forEach((u) => {
      if (seenUids.has(u.uid)) return;
      if (EXCLUDED_USER_ROLES.has((u.role || "").toLowerCase())) return;
      if (u.role === "kandidat") return;
      // Only include users that explicitly have a karyawan-level indicator
      if (
        u.role !== "karyawan" &&
        !(u as any).employmentType &&
        !(u as any).structuralLevel
      )
        return;

      seenUids.add(u.uid);

      const emp = employeesByUid.get(u.uid);
      const normalized = normalizeEmployeeRow(emp ?? u, null, u, brands);

      if (
        shouldExclude(
          u.role,
          normalized.structuralPosition || "",
          normalized.jabatan,
        )
      )
        return;

      result.push({
        uid: u.uid,
        fullName: u.fullName || (u as any)?.displayName || u.email || "",
        employeeId: normalized.employeeId || "",
        brandId: normalized.brandId || "",
        brandName: normalized.brandName,
        divisionId: normalized.divisionId || "",
        divisionName: normalized.divisi,
        jobTitle: normalized.jabatan,
        managerUid: normalized.directSupervisorUid || "",
        managerName: normalized.directSupervisorName || "",
        employmentStatus: normalized.employmentStatus || "",
        employeeType: normalized.tipeKaryawan,
        structuralPosition: normalized.structuralPosition || "",
        isDivisionManager:
          normalized.isDivisionManager ||
          normalized.structuralPosition === "division_manager" ||
          (u as any)?.isDivisionManager ||
          false,
      });
    });

    return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [
    usersData,
    employeesData,
    employeeProfilesData,
    brandsData,
    staffLoading,
    shouldExclude,
  ]);

  const availableStaffForAddition = useMemo(
    () =>
      allMergedStaff.filter(
        (staff) => !activeMissionMemberUids.includes(staff.uid),
      ),
    [allMergedStaff, activeMissionMemberUids],
  );

  // ── Mission list query ────────────────────────────────────────────────────
  const missionQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.uid) return null;

    // HRD and Super Admin can see all missions for monitoring
    const isHrdOrSuperAdmin =
      userProfile.role === "hrd" || userProfile.role === "super_admin";

    if (isHrdOrSuperAdmin) {
      return query(
        collection(firestore, "business_trip_missions"),
        orderBy("createdAt", "desc"),
      );
    }

    // Directors and managers only see missions they created
    return query(
      collection(firestore, "business_trip_missions"),
      where("assignedByUid", "==", userProfile.uid),
      orderBy("createdAt", "desc"),
    );
  }, [firestore, userProfile?.uid, userProfile?.role, missionRefreshId]);

  const { data: missionItems, isLoading } =
    useCollection<BusinessTripMission>(missionQuery);

  const mergedMissionItems = useMemo(() => {
    if (!missionItems) return [];

    const groups = new Map<string, BusinessTripMission[]>();

    missionItems
      .filter((mission) => mission.status !== "archived_duplicate")
      .forEach((mission) => {
        const key = [
          mission.missionName?.trim().toLowerCase() ?? "",
          mission.destinationProvince?.trim().toLowerCase() ?? "",
          mission.destinationRegency?.trim().toLowerCase() ?? "",
          mission.destinationAddress?.trim().toLowerCase() ?? "",
          mission.startDate
            ? String((mission.startDate as any)?.seconds ?? mission.startDate)
            : "",
          mission.endDate
            ? String((mission.endDate as any)?.seconds ?? mission.endDate)
            : "",
          mission.assignedByUid ?? "",
        ].join("|");

        const current = groups.get(key) || [];
        current.push(mission);
        groups.set(key, current);
      });

    const merged: BusinessTripMission[] = [];
    groups.forEach((group) => {
      if (group.length === 1) {
        merged.push(group[0]);
        return;
      }

      const primary = group.reduce((best, item) => {
        const bestTs = (best.createdAt as any)?.seconds ?? 0;
        const itemTs = (item.createdAt as any)?.seconds ?? 0;
        return itemTs < bestTs ? item : best;
      }, group[0]);

      const memberCount =
        group.reduce((sum, item) => sum + (item.memberCount ?? 0), 0) ||
        group.length;
      const managerApprovedCount = group.reduce(
        (sum, item) => sum + (item.managerApprovedCount ?? 0),
        0,
      );
      const staffConfirmedCount = group.reduce(
        (sum, item) => sum + (item.staffConfirmedCount ?? 0),
        0,
      );

      merged.push({
        ...primary,
        memberCount,
        managerApprovedCount,
        staffConfirmedCount,
        duplicateMissionIds: group
          .slice(1)
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
      });
    });

    return merged.sort(
      (a, b) =>
        ((b.createdAt as any)?.seconds ?? 0) -
        ((a.createdAt as any)?.seconds ?? 0),
    );
  }, [missionItems]);

  const hasDuplicateMissions =
    (missionItems?.length ?? 0) > mergedMissionItems.length;

  const cleanupMissionGroups = useMemo(() => {
    if (!missionItems) return [];

    const groups = new Map<string, BusinessTripMission[]>();
    missionItems.forEach((mission) => {
      const key = [
        mission.missionName?.trim().toLowerCase() ?? "",
        mission.destinationProvince?.trim().toLowerCase() ?? "",
        mission.destinationRegency?.trim().toLowerCase() ?? "",
        mission.destinationAddress?.trim().toLowerCase() ?? "",
        mission.startDate
          ? String((mission.startDate as any)?.seconds ?? mission.startDate)
          : "",
        mission.endDate
          ? String((mission.endDate as any)?.seconds ?? mission.endDate)
          : "",
        mission.assignedByUid ?? "",
      ].join("|");

      const current = groups.get(key) || [];
      current.push(mission);
      groups.set(key, current);
    });

    return Array.from(groups.values()).filter((group) => group.length > 1);
  }, [missionItems]);

  const deleteCollectionDocs = async (collectionRef: any) => {
    const snap = await getDocs(collectionRef);
    await Promise.all(
      snap.docs.map((docSnap: any) =>
        deleteDoc(doc(collectionRef, docSnap.id)),
      ),
    );
  };

  const handleCleanupDuplicateMissions = async () => {
    if (!firestore || cleanupMissionGroups.length === 0) return;
    setIsSaving(true);
    try {
      for (const group of cleanupMissionGroups) {
        const primary = group.reduce((best, item) => {
          const bestTs = (best.createdAt as any)?.seconds ?? 0;
          const itemTs = (item.createdAt as any)?.seconds ?? 0;
          return itemTs < bestTs ? item : best;
        }, group[0]);
        if (!primary.id) continue;

        const primaryDocRef = doc(
          firestore,
          "business_trip_missions",
          primary.id,
        );
        const primarySnapshot = await getDoc(primaryDocRef);
        if (!primarySnapshot.exists()) {
          continue;
        }

        const primaryMembersRef = collection(
          firestore,
          "business_trip_missions",
          primary.id,
          "members",
        );
        const primaryMembersSnap = await getDocs(primaryMembersRef);
        const existingUids = new Set(
          primaryMembersSnap.docs.map(
            (docSnap) => (docSnap.data() as any).employeeUid,
          ),
        );

        let addedMembers = 0;

        for (const duplicate of group.slice(1)) {
          if (!duplicate.id) continue;

          const duplicateDocRef = doc(
            firestore,
            "business_trip_missions",
            duplicate.id,
          );
          const duplicateSnapshot = await getDoc(duplicateDocRef);
          if (!duplicateSnapshot.exists()) continue;

          const duplicateMembersRef = collection(
            firestore,
            "business_trip_missions",
            duplicate.id,
            "members",
          );
          const duplicateMembersSnap = await getDocs(duplicateMembersRef);

          for (const dupMemberDoc of duplicateMembersSnap.docs) {
            const memberData = dupMemberDoc.data();
            const employeeUid = (memberData as any).employeeUid;
            if (!employeeUid || existingUids.has(employeeUid)) continue;

            const newMemberRef = doc(primaryMembersRef);
            await setDoc(newMemberRef, {
              ...memberData,
              missionId: primary.id,
              missionName: primary.missionName,
              assignmentNumber: primary.assignmentNumber,
              updatedAt: serverTimestamp(),
            });
            existingUids.add(employeeUid);
            addedMembers += 1;
          }

          await updateDoc(duplicateDocRef, {
            status: "archived_duplicate",
            duplicateOf: primary.id,
            updatedAt: serverTimestamp(),
          });
        }

        if (addedMembers > 0 || group.length > 1) {
          await updateDoc(primaryDocRef, {
            memberCount: existingUids.size,
            updatedAt: serverTimestamp(),
          });
        }
      }

      toast({
        title: "Pembersihan duplikat perjalanan dinas selesai",
        description:
          "Duplikat perjalanan dinas telah digabungkan ke dokumen utama.",
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membersihkan duplikat perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
      refreshMissionList();
    }
  };

  const loadActiveMissionData = async (mission: BusinessTripMission) => {
    if (!firestore || !mission.id) return;
    setDetailLoading(true);
    try {
      const membersSnap = await getDocs(
        collection(firestore, "business_trip_missions", mission.id, "members"),
      );
      const timelineSnap = await getDocs(
        collection(firestore, "business_trip_missions", mission.id, "timeline"),
      );
      const staffChangesSnap = await getDocs(
        collection(
          firestore,
          "business_trip_missions",
          mission.id,
          "staff_changes",
        ),
      );

      setActiveMissionMembers(
        membersSnap.docs.map((memberDoc) => ({
          id: memberDoc.id,
          ...(memberDoc.data() as BusinessTripMissionMember),
        })),
      );
      setActiveMissionTimeline(
        timelineSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
          .sort((a, b) => {
            const aTs = (a.createdAt as any)?.seconds ?? 0;
            const bTs = (b.createdAt as any)?.seconds ?? 0;
            return bTs - aTs;
          }),
      );
      setActiveMissionStaffChanges(
        staffChangesSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
          .sort((a, b) => {
            const aTs = (a.requestedAt as any)?.seconds ?? 0;
            const bTs = (b.requestedAt as any)?.seconds ?? 0;
            return bTs - aTs;
          }),
      );
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal memuat detail perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const selectMissionForDetail = async (mission: BusinessTripMission) => {
    setActiveMission(mission);
    setActiveMode("detail");
    await loadActiveMissionData(mission);
  };

  const selectMissionForEdit = async (mission: BusinessTripMission) => {
    setActiveMission(mission);
    setMissionForm({
      missionName: mission.missionName || "",
      assignmentNumber: mission.assignmentNumber || "",
      projectName: mission.projectName || "",
      clientName: mission.clientName || "",
      tripType: mission.tripType || "Sampling",
      tripTypeOther: mission.tripTypeOther || "",
      destinationProvince: mission.destinationProvince || "",
      destinationRegency: mission.destinationRegency || "",
      destinationAddress: mission.destinationAddress || "",
      destinationGoogleMaps: mission.destinationGoogleMaps || "",
      startDate:
        mission.startDate instanceof Timestamp
          ? mission.startDate.toDate().toISOString().slice(0, 10)
          : mission.startDate || "",
      endDate:
        mission.endDate instanceof Timestamp
          ? mission.endDate.toDate().toISOString().slice(0, 10)
          : mission.endDate || "",
      instructionNote: mission.instructionNote || "",
      googleDriveLink: mission.googleDriveLink || "",
    });
    setEditAssignmentLetterFile(null);
    setEditAssignmentLetterError(null);
    setActiveMode("edit");
  };

  const selectMissionForManage = async (mission: BusinessTripMission) => {
    setActiveMission(mission);
    setManageSelectedStaffUids([]);
    setManageStaffReason("");
    setActiveMode("manage");
    await loadActiveMissionData(mission);
  };

  const handleUpdateMission = async () => {
    if (!firestore || !activeMission?.id) return;
    if (
      activeMission.status === "completed" ||
      activeMission.status === "cancelled"
    ) {
      toast({
        variant: "destructive",
        title: "Perjalanan dinas tidak dapat diedit",
        description:
          "Perjalanan dinas yang sudah selesai atau dibatalkan tidak bisa diubah.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
      );
      const missionSnapshot = await getDoc(missionDocRef);
      if (!missionSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Perjalanan dinas tidak ditemukan",
          description: "Data perjalanan sudah tidak tersedia.",
        });
        return;
      }

      let assignmentLetterUrl = activeMission.assignmentLetterUrl || "";
      let assignmentLetterDriveUrl =
        activeMission.assignmentLetterDriveUrl ||
        activeMission.googleDriveLink ||
        "";
      let assignmentLetterDriveFileId =
        activeMission.assignmentLetterDriveFileId || "";
      let assignmentLetterFileName =
        activeMission.assignmentLetterFileName || "";
      let assignmentLetterSource:
        | "local_upload"
        | "system_drive_upload"
        | "google_drive"
        | "google_drive_link"
        | "firebase_storage" =
        activeMission.assignmentLetterSource ||
        activeMission.documentSource ||
        (missionForm.googleDriveLink
          ? "google_drive_link"
          : "system_drive_upload");
      let documentSource =
        activeMission.documentSource ||
        (missionForm.googleDriveLink ? "google_drive_link" : "google_drive");
      let assignmentLetterUploadedAt =
        activeMission.assignmentLetterUploadedAt || null;
      let assignmentLetterUploadedBy =
        activeMission.assignmentLetterUploadedBy || "";
      let assignmentLetterAccessMode:
        | "anyone_with_link"
        | "internal_viewer"
        | null = activeMission.assignmentLetterAccessMode || null;
      let documentUpdated = false;
      const existingDriveLink = activeMission.googleDriveLink || "";
      const newDriveLink = missionForm.googleDriveLink?.trim() || "";

      if (editAssignmentLetterFile) {
        const categoryUploadOptions: UploadOptions = {
          category: "business_trip_spd",
          ownerUid: userProfile?.uid || "",
        };
        const uploadResult = await uploadFileToGoogleDrive(
          editAssignmentLetterFile,
          userProfile?.uid || "",
          categoryUploadOptions,
        );
        assignmentLetterDriveUrl =
          uploadResult.googleDriveWebViewLink ||
          uploadResult.webViewLink ||
          uploadResult.directViewUrl ||
          uploadResult.viewUrl ||
          assignmentLetterDriveUrl;
        assignmentLetterDriveFileId = uploadResult.fileId || "";
        assignmentLetterUrl = assignmentLetterDriveUrl || assignmentLetterUrl;
        assignmentLetterFileName =
          uploadResult.fileName || editAssignmentLetterFile.name;
        documentSource = "google_drive";
        assignmentLetterSource = "system_drive_upload";
        assignmentLetterAccessMode =
          uploadResult.accessMode || "anyone_with_link";
        assignmentLetterUploadedAt = serverTimestamp();
        assignmentLetterUploadedBy = userProfile?.uid || "";
        documentUpdated = true;
      } else if (newDriveLink !== existingDriveLink) {
        assignmentLetterUrl = newDriveLink;
        assignmentLetterDriveUrl = newDriveLink;
        assignmentLetterDriveFileId = "";
        assignmentLetterFileName = "";
        documentSource = "google_drive_link";
        assignmentLetterSource = "google_drive_link";
        assignmentLetterUploadedAt = null;
        assignmentLetterUploadedBy = "";
        documentUpdated = true;
      }

      await updateDoc(missionDocRef, {
        missionName: missionForm.missionName,
        assignmentNumber: missionForm.assignmentNumber,
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
        durationDays: calculateDurationDays(
          missionForm.startDate,
          missionForm.endDate,
        ),
        instructionNote: missionForm.instructionNote,
        instructionHtml: missionForm.instructionNote,
        instructionText: stripHtml(missionForm.instructionNote),
        assignmentLetterUrl,
        assignmentLetterDriveUrl,
        assignmentLetterDriveFileId,
        assignmentLetterFileName,
        documentSource,
        assignmentLetterSource,
        assignmentLetterAccessMode,
        assignmentLetterUploadedAt,
        assignmentLetterUploadedBy,
        googleDriveLink: newDriveLink,
        updatedAt: serverTimestamp(),
      });

      if (documentUpdated) {
        const timelineCollection = collection(
          firestore,
          "business_trip_missions",
          activeMission.id,
          "timeline",
        );
        await addDoc(timelineCollection, {
          message: "Dokumen Surat Tugas/SPD diperbarui.",
          createdAt: serverTimestamp(),
          byUid: userProfile?.uid,
          byName: userProfile?.fullName,
        });
      }

      toast({
        title: "Perubahan perjalanan dinas tersimpan",
        description: "Informasi perjalanan telah diperbarui.",
      });
      refreshMissionList();
      setActiveMode("list");
      setActiveMission(null);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal menyimpan perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveMission = async (mission: BusinessTripMission) => {
    if (!firestore || !mission.id) return;
    setIsSaving(true);
    try {
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        mission.id,
      );
      const missionSnapshot = await getDoc(missionDocRef);
      if (!missionSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Perjalanan dinas tidak ditemukan",
          description: "Perjalanan dinas sudah dihapus atau tidak tersedia.",
        });
        return;
      }
      await updateDoc(missionDocRef, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      toast({
        title: "Perjalanan dinas dibatalkan",
        description: "Perjalanan dinas berhasil dibatalkan.",
      });
      refreshMissionList();
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membatalkan perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStaffToMission = async () => {
    if (!firestore || !activeMission?.id) return;
    if (manageSelectedStaffUids.length === 0) {
      toast({
        variant: "destructive",
        title: "Pilih staff terlebih dahulu",
      });
      return;
    }
    if (!manageStaffReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan penambahan wajib diisi",
      });
      return;
    }

    setIsSaving(true);
    try {
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
      );
      const missionSnapshot = await getDoc(missionDocRef);
      if (!missionSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Perjalanan dinas tidak ditemukan",
        });
        return;
      }

      const selectedStaff = allMergedStaff.filter((staff) =>
        manageSelectedStaffUids.includes(staff.uid),
      );
      const membersRef = collection(
        firestore,
        "business_trip_missions",
        activeMission.id,
        "members",
      );

      const newMembers = await Promise.all(
        selectedStaff.map(async (staff) => {
          const memberRef = doc(membersRef);
          const memberManagerUid =
            staff.managerUid || (staff.isDivisionManager ? staff.uid : "");
          const isManagerAsStaff = staff.isDivisionManager;
          const memberData: BusinessTripMissionMember = {
            missionId: activeMission.id || "",
            missionName: activeMission.missionName || "",
            assignmentNumber: activeMission.assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeePosition: staff.jobTitle || "-",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || "-",
            managerUid: memberManagerUid,
            managerName: staff.managerName || staff.fullName,
            requiresManagerValidation: !isManagerAsStaff,
            memberStatus: "waiting_staff_confirmation",
            managerValidationStatus: isManagerAsStaff
              ? "validated_by_assigner"
              : "waiting_manager_validation",
            managerValidationNote: isManagerAsStaff
              ? "Disetujui oleh pemberi tugas"
              : null,
            staffConfirmationStatus: "waiting_staff_confirmation",
            missionStatus: activeMission.status || "pending_manager_validation",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(memberRef, memberData);
          return memberData;
        }),
      );

      await addDoc(
        collection(
          firestore,
          "business_trip_missions",
          activeMission.id,
          "staff_changes",
        ),
        {
          action: "add_staff",
          newEmployees: selectedStaff.map((s) => ({
            uid: s.uid,
            name: s.fullName,
            brandName: s.brandName,
            divisionName: s.divisionName,
          })),
          requestedBy: userProfile?.uid,
          requestedByName: userProfile?.fullName,
          reason: manageStaffReason,
          requestedAt: serverTimestamp(),
        },
      );

      const activeMembers = activeMissionMembers.filter(
        (member) => member.memberStatus !== "archived",
      );
      const combinedMembers = [...activeMembers, ...newMembers];
      const managerValidations =
        buildManagerValidationSummaries(combinedMembers);
      const assignedManagerUids = Array.from(
        new Set(
          combinedMembers.map((member) => member.managerUid).filter(Boolean),
        ),
      );
      const allApproved = managerValidations.every(
        (item) => item.status === "approved",
      );

      await updateDoc(missionDocRef, {
        memberCount: (activeMission.memberCount ?? 0) + selectedStaff.length,
        managerValidationCount: managerValidations.length,
        managerApprovedCount: managerValidations.filter(
          (item) => item.status === "approved",
        ).length,
        managerUids: assignedManagerUids,
        managerValidations,
        status: allApproved
          ? "waiting_staff_confirmation"
          : activeMission.status || "pending_manager_validation",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Anggota berhasil ditambahkan",
        description: `Berhasil menambah ${selectedStaff.length} anggota baru.`,
      });
      await loadActiveMissionData(activeMission);
      refreshMissionList();
      setManageSelectedStaffUids([]);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal tambah staff",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveStaffMember = async (
    member: BusinessTripMissionMember,
  ) => {
    if (!firestore || !activeMission?.id || !member.id) return;
    if (!manageStaffReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan pembatalan wajib diisi",
      });
      return;
    }
    setIsSaving(true);
    try {
      const memberRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
        "members",
        member.id,
      );
      const memberSnapshot = await getDoc(memberRef);
      if (!memberSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Data anggota tidak ditemukan",
        });
        return;
      }

      await updateDoc(memberRef, {
        memberStatus: "archived",
        updatedAt: serverTimestamp(),
      });
      await addDoc(
        collection(
          firestore,
          "business_trip_missions",
          activeMission.id,
          "staff_changes",
        ),
        {
          action: "archive_staff",
          oldEmployee: {
            uid: member.employeeUid,
            name: member.employeeName,
          },
          requestedBy: userProfile?.uid,
          requestedByName: userProfile?.fullName,
          reason: manageStaffReason,
          requestedAt: serverTimestamp(),
        },
      );

      const remainingMembers = activeMissionMembers.filter(
        (m) => m.id !== member.id && m.memberStatus !== "archived",
      );
      const managerValidations =
        buildManagerValidationSummaries(remainingMembers);
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
      );
      await updateDoc(missionDocRef, {
        managerValidationCount: managerValidations.length,
        managerApprovedCount: managerValidations.filter(
          (item) => item.status === "approved",
        ).length,
        managerValidations,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Staff diarsipkan",
        description: `${member.employeeName} berhasil diarsipkan.`,
      });
      await loadActiveMissionData(activeMission);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal arsipkan staff",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseDetails = () => {
    setActiveMode("list");
    setActiveMission(null);
    setActiveMissionMembers([]);
    setActiveMissionTimeline([]);
    setActiveMissionStaffChanges([]);
  };

  const handleCancelEdit = () => {
    setActiveMode("list");
    setActiveMission(null);
  };

  const handleOpenCreate = () => {
    setActiveMode("create");
  };

  const handleCloseCreate = () => {
    setActiveMode("list");
  };

  const renderMissionDetailView = () => {
    if (!activeMission) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Detail Perjalanan Dinas</CardTitle>
            <CardDescription>
              Informasi lengkap perjalanan dinas, anggota, timeline, dan riwayat
              perubahan.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCloseDetails}>
              Kembali
            </Button>
            <Button
              variant="secondary"
              onClick={() => selectMissionForEdit(activeMission)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => selectMissionForManage(activeMission)}
            >
              Kelola Anggota
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {(() => {
            const activeMembers = activeMissionMembers.filter(
              (member) => member.memberStatus !== "archived",
            );
            const managerProgress =
              computeManagerValidationProgress(activeMembers);
            const confirmedCount = activeMembers.filter(
              (member) =>
                member.staffConfirmationStatus === "confirmed_by_staff",
            ).length;
            const documentUrl =
              activeMission.assignmentLetterDriveUrl?.trim() ||
              activeMission.googleDriveWebViewLink ||
              activeMission.googleDriveLink ||
              activeMission.assignmentLetterUrl ||
              "";
            const documentLabel =
              activeMission.assignmentLetterFileName ||
              (documentUrl ? "Surat Tugas/SPD" : "Surat Tugas/SPD");

            return (
              <>
                <section className="space-y-4">
                  <SectionHeader
                    icon={FileText}
                    title="Ringkasan Perjalanan Dinas"
                    description="Informasi utama perjalanan dan status saat ini."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Judul Perjalanan
                      </p>
                      <p className="mt-2 font-semibold text-foreground">
                        {activeMission.missionName}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Nomor Surat/SPD
                      </p>
                      <p className="mt-2 font-semibold text-foreground">
                        {activeMission.assignmentNumber || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <div className="mt-2">
                        {renderStatusLabel(activeMission.status)}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={FileText}
                    title="Informasi Surat Tugas/SPD"
                    description="Tinjau dokumen Surat Tugas/SPD yang terlampir."
                  />
                  <div className="rounded-lg border border-border p-4 bg-muted/30">
                    {documentUrl ? (
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Nama dokumen
                          </p>
                          <p className="font-medium text-foreground">
                            {documentLabel}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Sumber dokumen
                          </p>
                          <p className="font-medium capitalize text-foreground">
                            {activeMission.assignmentLetterSource ===
                            "local_upload"
                              ? "Upload File"
                              : activeMission.assignmentLetterSource ===
                                  "system_drive_upload"
                                ? "Upload File via Drive HRP"
                                : activeMission.assignmentLetterSource ===
                                    "google_drive_link"
                                  ? "Google Drive Link Manual"
                                  : activeMission.documentSource ===
                                      "firebase_storage"
                                    ? "Upload File"
                                    : "Upload File via Drive HRP"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleOpenDocumentViewer}
                          >
                            Lihat Dokumen
                          </Button>
                          {activeMission.googleDriveLink &&
                            activeMission.googleDriveLink !== documentUrl && (
                              <a
                                href={activeMission.googleDriveLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button size="sm" variant="secondary">
                                  Buka Link
                                </Button>
                              </a>
                            )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Surat Tugas belum dilampirkan.
                      </p>
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={MapPin}
                    title="Tujuan & Jadwal"
                    description="Detail lokasi, alamat, dan tanggal perjalanan."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Tujuan</p>
                      <p className="font-medium">
                        {activeMission.destinationProvince}
                        {activeMission.destinationRegency
                          ? ` / ${activeMission.destinationRegency}`
                          : ""}
                      </p>
                      {activeMission.destinationAddress && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {activeMission.destinationAddress}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Tanggal</p>
                      <p className="font-medium">
                        {formatDate(activeMission.startDate)} –{" "}
                        {formatDate(activeMission.endDate)}
                      </p>
                      {activeMission.destinationGoogleMaps && (
                        <a
                          href={activeMission.destinationGoogleMaps}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline mt-2 block"
                        >
                          Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={FileText}
                    title="Instruksi Perjalanan"
                    description="Instruksi lengkap untuk seluruh anggota dinas."
                  />
                  <div
                    className="prose prose-neutral max-w-none text-foreground leading-relaxed prose-ol:list-decimal prose-ul:list-disc prose-ul:pl-5 prose-li:mt-2 prose-p:mt-2"
                    dangerouslySetInnerHTML={{
                      __html: activeMission.instructionHtml || "",
                    }}
                  />
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Anggota Dinas"
                    description="Daftar anggota aktif dalam perjalanan dinas ini."
                  />
                  {activeMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada anggota terdaftar.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Posisi</TableHead>
                            <TableHead>Brand / Divisi</TableHead>
                            <TableHead>Atasan / Approver</TableHead>
                            <TableHead>Approval Status</TableHead>
                            <TableHead>Confirmation Status</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeMembers.map((member) => (
                            <TableRow key={member.id}>
                              <TableCell>{member.employeeName}</TableCell>
                              <TableCell>
                                {member.employeePosition || "-"}
                              </TableCell>
                              <TableCell>
                                {member.brandName || "-"} /{" "}
                                {member.divisionName || "-"}
                              </TableCell>
                              <TableCell>
                                {member.approvalTargetName ||
                                  member.managerName ||
                                  "-"}
                              </TableCell>
                              <TableCell>
                                <Badge className="capitalize">
                                  {(
                                    member.approvalStatus ||
                                    member.managerValidationStatus ||
                                    "-"
                                  ).replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className="capitalize">
                                  {(
                                    member.staffConfirmationStatus || "-"
                                  ).replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className="capitalize">
                                  {(member.memberStatus || "-").replace(
                                    /_/g,
                                    " ",
                                  )}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Validasi Manager Divisi"
                    description="Validasi dihitung per manager unik, bukan per anggota."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Manager unik
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {managerProgress.managerCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Sudah disetujui
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {managerProgress.approvedCount}/
                        {managerProgress.managerCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Ditolak</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {managerProgress.rejectedCount}
                      </p>
                    </div>
                  </div>
                  {managerProgress.managerValidations.length > 0 && (
                    <div className="rounded-lg border border-border p-4">
                      {managerProgress.managerValidations.map((item) => (
                        <div
                          key={`${item.managerUid}-${item.divisionName}`}
                          className="mb-3 last:mb-0"
                        >
                          <p className="font-medium">{item.managerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.divisionName}
                          </p>
                          <p className="text-sm">
                            Status:{" "}
                            <span className="font-semibold capitalize">
                              {item.status}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.memberUids.length} anggota
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Konfirmasi Staff"
                    description="Tampilan progress konfirmasi staf aktif."
                  />
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm text-muted-foreground">
                      Staf yang sudah konfirmasi
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {confirmedCount}/{activeMembers.length}
                    </p>
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Calendar}
                    title="Timeline"
                    description="Rekam jejak aktivitas perjalanan dinas."
                  />
                  {detailLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Memuat timeline...
                    </p>
                  ) : activeMissionTimeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada aktivitas timeline.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {activeMissionTimeline.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-lg border border-border p-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-medium">{event.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(
                                (event.createdAt as any)?.toDate?.() ??
                                  event.createdAt,
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Riwayat Perubahan Staff"
                    description="Catatan perubahan anggota dinas."
                  />
                  {activeMissionStaffChanges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada perubahan staff.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {activeMissionStaffChanges.map((change) => (
                        <div
                          key={change.id}
                          className="rounded-lg border border-border p-3"
                        >
                          <p className="font-medium capitalize">
                            {change.action}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {change.reason}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(
                              (change.requestedAt as any)?.toDate?.() ??
                                change.requestedAt,
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            );
          })()}
        </CardContent>
      </Card>
    );
  };

  const renderMissionEditView = () => {
    if (!activeMission) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <div>
            <CardTitle>Edit Perjalanan Dinas</CardTitle>
            <CardDescription>
              Ubah informasi perjalanan dinas dan simpan perubahan.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancelEdit}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-8">
          <section className="space-y-4">
            <SectionHeader
              icon={FileText}
              title="Informasi Perjalanan Dinas"
              description="Ubah data perjalanan dinas sesuai kebutuhan."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama Perjalanan Dinas</Label>
                <Input
                  value={missionForm.missionName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      missionName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nomor Surat Tugas/SPD</Label>
                <Input
                  value={missionForm.assignmentNumber}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      assignmentNumber: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Brand / Proyek</Label>
                <Input
                  value={missionForm.projectName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      projectName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nama Klien</Label>
                <Input
                  value={missionForm.clientName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      clientName: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={MapPin}
              title="Tujuan & Jadwal"
              description="Perbarui lokasi dan tanggal perjalanan."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provinsi Tujuan</Label>
                <Input
                  value={missionForm.destinationProvince}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationProvince: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Kota / Kabupaten</Label>
                <Input
                  value={missionForm.destinationRegency}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationRegency: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Alamat Lengkap Tujuan</Label>
                <Textarea
                  value={missionForm.destinationAddress}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationAddress: e.target.value,
                    })
                  }
                  className="min-h-[80px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Berangkat</Label>
                <Input
                  type="date"
                  value={missionForm.startDate}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      startDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Pulang</Label>
                <Input
                  type="date"
                  value={missionForm.endDate}
                  onChange={(e) =>
                    setMissionForm({ ...missionForm, endDate: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={FileText}
              title="Instruksi"
              description="Perbarui instruksi perjalanan dinas."
            />
            <RichTextEditor
              value={missionForm.instructionNote}
              onChange={(html) =>
                setMissionForm({ ...missionForm, instructionNote: html })
              }
            />
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={FileText}
              title="Surat Tugas/SPD"
              description="Lihat dokumen aktif dan ganti file atau link jika diperlukan."
            />
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-lg border border-border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  Dokumen Surat Tugas/SPD aktif
                </p>
                {activeMission.assignmentLetterDriveUrl ||
                activeMission.assignmentLetterUrl ||
                activeMission.googleDriveLink ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {activeMission.assignmentLetterFileName ||
                        activeMission.assignmentLetterDriveUrl ||
                        activeMission.googleDriveLink ||
                        "Surat Tugas aktif"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sumber dokumen:{" "}
                      {activeMission.assignmentLetterSource === "local_upload"
                        ? "Upload File"
                        : activeMission.assignmentLetterSource ===
                            "system_drive_upload"
                          ? "Upload File via Drive HRP"
                          : activeMission.assignmentLetterSource ===
                              "google_drive_link"
                            ? "Google Drive Link Manual"
                            : activeMission.documentSource ===
                                "firebase_storage"
                              ? "Upload File"
                              : "Upload File via Drive HRP"}
                    </p>
                    {activeMission.assignmentLetterSource ===
                    "google_drive_link" ? (
                      <p className="text-xs text-amber-700">
                        Pastikan link Google Drive sudah bisa diakses oleh akun
                        HRP lain.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenDocumentViewer}
                      >
                        Lihat Dokumen
                      </Button>
                      {activeMission.assignmentLetterSource ===
                        "google_drive_link" &&
                        activeMission.googleDriveLink && (
                          <a
                            href={activeMission.googleDriveLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button size="sm" variant="secondary">
                              Buka Link
                            </Button>
                          </a>
                        )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Surat Tugas belum dilampirkan.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ganti File Surat Tugas / SPD</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    Pilih File Baru
                  </Button>
                  <div className="min-w-0 text-sm">
                    {editAssignmentLetterFile ? (
                      <div>
                        <p className="font-medium text-foreground truncate">
                          {editAssignmentLetterFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(
                            editAssignmentLetterFile.size /
                            1024 /
                            1024
                          ).toFixed(2)}{" "}
                          MB
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        Pilih file PDF/DOC/DOCX untuk mengganti dokumen SPD.
                      </p>
                    )}
                  </div>
                  {editAssignmentLetterFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => {
                        setEditAssignmentLetterFile(null);
                        setEditAssignmentLetterError(null);
                        if (editFileInputRef.current)
                          editFileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) {
                      setEditAssignmentLetterFile(null);
                      return;
                    }
                    const validation = validateAssignmentLetterFile(file);
                    if (!validation.isValid) {
                      setEditAssignmentLetterFile(null);
                      setEditAssignmentLetterError(validation.message || null);
                      return;
                    }
                    setEditAssignmentLetterError(null);
                    setEditAssignmentLetterFile(file);
                  }}
                />
                {editAssignmentLetterError && (
                  <p className="text-sm text-destructive">
                    {editAssignmentLetterError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Update Link Google Drive</Label>
                <Input
                  value={missionForm.googleDriveLink}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      googleDriveLink: e.target.value,
                    })
                  }
                  placeholder="https://drive.google.com/..."
                />
                <p className="text-xs text-muted-foreground">
                  Jika tidak mengganti file, Anda dapat menyimpan link baru.
                </p>
              </div>
            </div>
          </section>

          <div className="pt-2 border-t border-border">
            <Button
              onClick={handleUpdateMission}
              disabled={
                isSaving || !missionForm.missionName || !missionForm.clientName
              }
              className="w-full"
              size="lg"
            >
              {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderMissionManageView = () => {
    if (!activeMission) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kelola Anggota Dinas</CardTitle>
            <CardDescription>
              Tambah, arsipkan, atau tinjau riwayat perubahan anggota untuk
              perjalanan dinas ini.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleCloseDetails}>
            Kembali
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Anggota Saat Ini"
              description="Daftar anggota yang sudah terdaftar pada perjalanan dinas ini."
            />
            {activeMissionMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada anggota perjalanan dinas.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Posisi</TableHead>
                      <TableHead>Atasan/Approver</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeMissionMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>{member.employeeName}</TableCell>
                        <TableCell>{member.employeePosition || "-"}</TableCell>
                        <TableCell>
                          {member.approvalTargetName ||
                            member.directSupervisorName ||
                            member.managerName ||
                            "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className="capitalize">
                            {member.memberStatus?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchiveStaffMember(member)}
                          >
                            Arsipkan
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Tambah Anggota Dinas"
              description="Pilih anggota baru yang belum terdaftar di perjalanan dinas ini."
            />
            <div className="grid grid-cols-1 gap-4">
              <StaffPicker
                allStaff={availableStaffForAddition}
                selectedUids={manageSelectedStaffUids}
                onToggle={(uid) =>
                  setManageSelectedStaffUids((prev) =>
                    prev.includes(uid)
                      ? prev.filter((id) => id !== uid)
                      : [...prev, uid],
                  )
                }
                isLoading={staffLoading}
                error={profilesError}
              />
              <div className="space-y-2">
                <Label>Alasan Penambahan / Perubahan</Label>
                <Textarea
                  value={manageStaffReason}
                  onChange={(e) => setManageStaffReason(e.target.value)}
                  className="min-h-[100px]"
                  placeholder="Tuliskan alasan wajib untuk perubahan anggota."
                />
              </div>
              <Button
                onClick={handleAddStaffToMission}
                disabled={
                  isSaving ||
                  manageSelectedStaffUids.length === 0 ||
                  !manageStaffReason.trim()
                }
              >
                {isSaving ? "Menyimpan..." : "Tambah Anggota Dinas"}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Riwayat Perubahan Staff"
              description="Catatan penambahan dan pengarsipan staf pada perjalanan dinas."
            />
            {activeMissionStaffChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada riwayat perubahan.
              </p>
            ) : (
              <div className="space-y-3">
                {activeMissionStaffChanges.map((change) => (
                  <div
                    key={change.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="font-medium capitalize">{change.action}</p>
                    <p className="text-sm text-muted-foreground">
                      {change.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(
                        (change.requestedAt as any)?.toDate?.() ??
                          change.requestedAt,
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    );
  };

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
        title: "Lengkapi semua informasi perjalanan dinas.",
      });
    }
    if (missionForm.tripType === "Lainnya" && !missionForm.tripTypeOther) {
      return toast({
        variant: "destructive",
        title: "Sebutkan jenis dinas lainnya jika dipilih Lainnya.",
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
      const selectedStaff = allMergedStaff.filter((staff) =>
        selectedStaffUids.includes(staff.uid),
      );

      // Upload assignment letter if provided
      let assignmentLetterUrl: string | null =
        missionForm.googleDriveLink || null;
      let assignmentLetterDriveUrl = "";
      let assignmentLetterDriveFileId = "";
      let assignmentLetterFileName = "";
      let documentSource:
        | "firebase_storage"
        | "google_drive_link"
        | "google_drive"
        | null = "google_drive_link";
      let assignmentLetterSource:
        | "local_upload"
        | "system_drive_upload"
        | "google_drive"
        | "google_drive_link"
        | "firebase_storage" = "google_drive_link";
      let assignmentLetterAccessMode:
        | "anyone_with_link"
        | "internal_viewer"
        | null = null;
      let assignmentLetterUploadedAt: any = null;
      let assignmentLetterUploadedBy: string = "";

      if (assignmentLetterFile) {
        try {
          const uploadResult = await uploadFileToGoogleDrive(
            assignmentLetterFile,
            userProfile.uid,
            {
              category: "business_trip_spd",
              ownerUid: userProfile.uid,
            },
          );
          assignmentLetterUrl =
            uploadResult.googleDriveWebViewLink ||
            uploadResult.webViewLink ||
            uploadResult.directViewUrl ||
            uploadResult.viewUrl ||
            "";
          assignmentLetterDriveUrl =
            uploadResult.googleDriveWebViewLink ||
            uploadResult.webViewLink ||
            uploadResult.directViewUrl ||
            uploadResult.viewUrl ||
            "";
          assignmentLetterDriveFileId = uploadResult.fileId || "";
          assignmentLetterFileName =
            uploadResult.fileName || assignmentLetterFile.name;
          documentSource = "google_drive";
          assignmentLetterSource = "system_drive_upload";
          assignmentLetterAccessMode =
            uploadResult.accessMode || "anyone_with_link";
          assignmentLetterUploadedAt = serverTimestamp();
          assignmentLetterUploadedBy = userProfile.uid;
        } catch (uploadError: any) {
          console.warn("Upload file gagal:", uploadError);
          // Do not fail the whole create flow; record upload failure and proceed.
          const errMsg =
            uploadError?.message || String(uploadError || "Upload error");
          assignmentLetterUrl = null;
          assignmentLetterDriveUrl = "";
          assignmentLetterDriveFileId = "";
          assignmentLetterFileName = assignmentLetterFile?.name || "";
          documentSource = null;
          assignmentLetterSource = "local_upload";
          assignmentLetterAccessMode = null;
          assignmentLetterUploadedAt = null;
          assignmentLetterUploadedBy = "";
          // Custom fields to record failure
          // documentStatus and documentError will be saved on mission doc
          // Notify user with a warning
          toast({
            title: "Perjalanan Dinas dibuat (dokumen gagal diupload)",
            description:
              "Perjalanan dinas berhasil dibuat, tetapi dokumen SPD gagal diupload. Silakan upload ulang di menu edit.",
          });
          // Also log locally
          console.warn("SPD upload failed, continuing mission create:", errMsg);
          // store error to attach later
          (assignmentLetterFile as any)._uploadError = errMsg;
        }
      } else if (missionForm.googleDriveLink) {
        assignmentLetterUrl = missionForm.googleDriveLink;
        assignmentLetterDriveUrl = missionForm.googleDriveLink;
        documentSource = "google_drive_link";
        assignmentLetterSource = "google_drive_link";
      }

      const missionCollection = collection(firestore, "business_trip_missions");
      const missionRef = doc(missionCollection);
      const durationDays = calculateDurationDays(
        missionForm.startDate,
        missionForm.endDate,
      );
      const assignmentNumber =
        missionForm.assignmentNumber || `SPD-${Date.now()}`;
      const instructionText = stripHtml(missionForm.instructionNote);
      const assignedManagerUids = Array.from(
        new Set(
          selectedStaff
            .map(
              (staff) =>
                staff.managerUid || (staff.isDivisionManager ? staff.uid : ""),
            )
            .filter(Boolean),
        ),
      );

      const managerValidationSummaries = buildManagerValidationSummaries(
        selectedStaff.map((staff) => ({
          missionId: missionRef.id,
          missionName: missionForm.missionName,
          assignmentNumber,
          employeeUid: staff.uid,
          employeeName: staff.fullName,
          brandId: staff.brandId || "",
          brandName: staff.brandName || "-",
          divisionId: staff.divisionId || "",
          divisionName: staff.divisionName || "-",
          managerUid:
            staff.managerUid || (staff.isDivisionManager ? staff.uid : ""),
          managerName: staff.managerName || staff.fullName,
          managerValidationStatus: staff.isDivisionManager
            ? "validated_by_assigner"
            : "waiting_manager_validation",
          managerValidationNote: staff.isDivisionManager
            ? "Disetujui oleh pemberi tugas"
            : null,
          staffConfirmationStatus: "waiting_staff_confirmation",
        })) as BusinessTripMissionMember[],
      );

      const initialStatus = managerValidationSummaries.every(
        (item) => item.status === "approved",
      )
        ? "waiting_staff_confirmation"
        : "pending_manager_validation";

      await setDoc(missionRef, {
        missionName: missionForm.missionName,
        assignmentNumber,
        missionCode: assignmentNumber,
        assignmentLetterUrl,
        assignmentLetterDriveUrl,
        assignmentLetterDriveFileId,
        assignmentLetterFileName,
        documentSource,
        // Document upload status: 'ok' | 'upload_failed'
        documentStatus:
          assignmentLetterFile && (assignmentLetterFile as any)?._uploadError
            ? "upload_failed"
            : "ok",
        documentError: (assignmentLetterFile as any)?._uploadError || null,
        assignmentLetterSource,
        assignmentLetterAccessMode,
        assignmentLetterUploadedAt,
        assignmentLetterUploadedBy,
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
        instructionNote: missionForm.instructionNote, // HTML (legacy compat)
        instructionHtml: missionForm.instructionNote, // HTML (canonical)
        instructionText, // Plain text
        memberCount: selectedStaff.length,
        managerApprovedCount: managerValidationSummaries.filter(
          (item) => item.status === "approved",
        ).length,
        managerValidationCount: managerValidationSummaries.length,
        managerUids: assignedManagerUids,
        staffConfirmedCount: 0,
        status: initialStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const memberDocs: BusinessTripMissionMember[] = [];
      await Promise.all(
        selectedStaff.map(async (staff) => {
          const membersCollection = collection(
            firestore,
            "business_trip_missions",
            missionRef.id,
            "members",
          );
          const memberRef = doc(membersCollection, staff.uid);
          const memberManagerUid =
            staff.managerUid || (staff.isDivisionManager ? staff.uid : "");
          const isManagerAsStaff = staff.isDivisionManager;
          const approvalTarget = await determineApprovalTarget(
            staff,
            userProfile.uid,
            userProfile.fullName,
          );

          const approverIsCreator =
            !!approvalTarget.approverUid &&
            approvalTarget.approverUid === userProfile.uid;
          const approvalNeeded =
            !!approvalTarget.approverUid && !approverIsCreator;

          const memberData: BusinessTripMissionMember = {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeePosition: staff.jobTitle || "-",
            employeeType: (staff as any).employeeType || "",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || "-",
            managerUid: memberManagerUid,
            managerName: staff.managerName || staff.fullName,
            approvalTargetUid: approvalTarget.approverUid || null,
            approvalTargetName: approvalTarget.approverName || null,
            approvalLevel: approvalTarget.level,
            requiresApproval: approvalNeeded,
            approvalStatus: "pending",
            startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
            endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
            durationDays,
            memberStatus: approvalNeeded
              ? "waiting_manager_validation"
              : "waiting_staff_confirmation",
            managerValidationStatus: isManagerAsStaff
              ? "validated_by_assigner"
              : "waiting_manager_validation",
            managerValidationNote: isManagerAsStaff
              ? "Disetujui oleh pemberi tugas"
              : null,
            staffConfirmationStatus: "waiting_staff_confirmation",
            missionStatus: "pending_manager_validation",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          memberDocs.push(memberData);
          await setDoc(memberRef, memberData);
          // Notify staff about assignment
          try {
            const staffNotifRef = doc(
              collection(firestore, "users", staff.uid, "notifications"),
            );
            await setDoc(staffNotifRef, {
              type: "business_trip_assigned",
              missionId: missionRef.id,
              missionName: missionForm.missionName,
              createdAt: serverTimestamp(),
              read: false,
              byUid: userProfile.uid,
              byName: userProfile.fullName,
            });
          } catch (e) {
            console.warn("Notify staff failed", e);
          }
        }),
      );

      // Validate that all members who require approval have an approver assigned
      const missingApprovers = memberDocs.filter(
        (m) => m.requiresApproval && !m.approvalTargetUid,
      );
      if (missingApprovers.length > 0) {
        const names = missingApprovers
          .slice(0, 5)
          .map((m) => m.employeeName)
          .join(", ");
        toast({
          variant: "destructive",
          title: "Gagal membuat misi",
          description:
            "Beberapa peserta belum memiliki approver yang valid: " +
            names +
            ". Periksa Struktur Organisasi.",
        });
        throw new Error(
          "Missing approvers for some members. Aborting mission create.",
        );
      }

      const approvalGroups = new Map<
        string,
        {
          approverName: string;
          approvalLevel: "division_manager" | "director";
          memberUids: string[];
          memberNames: string[];
        }
      >();

      for (const member of memberDocs) {
        if (
          !member.approvalTargetUid ||
          member.approvalTargetUid === userProfile.uid
        )
          continue;

        const key = member.approvalTargetUid;
        const existing = approvalGroups.get(key);
        if (existing) {
          existing.memberUids.push(member.employeeUid);
          existing.memberNames.push(member.employeeName);
        } else {
          approvalGroups.set(key, {
            approverName: member.approvalTargetName || member.managerName || "",
            approvalLevel: member.approvalLevel || "division_manager",
            memberUids: [member.employeeUid],
            memberNames: [member.employeeName],
          });
        }
      }

      // Create approval_requests documents keyed by approver UID
      await Promise.all(
        Array.from(approvalGroups.entries()).map(([approverUid, group]) => {
          const approvalCollection = collection(
            firestore,
            "business_trip_missions",
            missionRef.id,
            "approval_requests",
          );
          const approvalRef = doc(approvalCollection, approverUid);
          const byUid = userProfile?.uid ?? null;
          const byName = userProfile?.fullName ?? null;
          return setDoc(approvalRef, {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            approverUid,
            approverName: group.approverName,
            approverRole:
              group.approvalLevel === "division_manager"
                ? "manager_division"
                : "director",
            approvalLevel: group.approvalLevel,
            memberUids: group.memberUids,
            memberNames: group.memberNames,
            status: "pending",
            notes: "",
            decidedAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).then(() => {
            // Also create notification for approver
            const notifRef = doc(
              collection(firestore, "users", approverUid, "notifications"),
            );
            return setDoc(notifRef, {
              type: "business_trip_approval_request",
              missionId: missionRef.id,
              missionName: missionForm.missionName,
              approverUid,
              createdAt: serverTimestamp(),
              read: false,
              byUid,
              byName,
            }).catch((e) => {
              console.warn("Notify approver failed", e);
            });
          });
        }),
      );

      // Update mission doc with member and approval info
      const allMemberUids = memberDocs.map((m) => m.employeeUid);
      const approvalTargetUids = Array.from(approvalGroups.keys());
      const pendingApprovalCount = memberDocs.filter(
        (m) => m.approvalStatus === "pending",
      ).length;
      const pendingConfirmationCount = memberDocs.filter(
        (m) => m.staffConfirmationStatus === "waiting_staff_confirmation",
      ).length;

      await updateDoc(missionRef, {
        assignedStaffUids: allMemberUids,
        memberUids: allMemberUids,
        approvalTargetUids,
        memberCount: allMemberUids.length,
        approvalRequestCount: approvalTargetUids.length,
        pendingApprovalCount,
        pendingConfirmationCount,
        status: "pending_manager_validation",
        updatedAt: serverTimestamp(),
      });

      console.log("Created mission", {
        tripId: missionRef.id,
        selectedStaffUids: selectedStaff.map((s) => s.uid),
        createdMemberCount: allMemberUids.length,
        createdApprovalRequestCount: approvalTargetUids.length,
        approvalTargetUids,
      });

      const timelineCollection = collection(
        firestore,
        "business_trip_missions",
        missionRef.id,
        "timeline",
      );
      await addDoc(timelineCollection, {
        message: `Perjalanan Dinas dibuat dengan ${selectedStaff.length} anggota.`,
        createdAt: serverTimestamp(),
        byUid: userProfile?.uid || "",
        byName: userProfile?.fullName || "",
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
        googleDriveLink: "",
      });
      setSelectedStaffUids([]);
      setAssignmentLetterFile(null);
      setAssignmentLetterError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveMode("list");

      toast({
        title: "Perjalanan Dinas berhasil dibuat",
        description: `${selectedStaff.length} anggota telah ditambahkan ke perjalanan dinas.`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membuat perjalanan dinas",
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
      {activeMode === "list" ? (
        /* ===== MISSION LIST VIEW ===== */
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Daftar Perjalanan Dinas</CardTitle>
              <CardDescription>
                Kelola perjalanan dinas yang dibuat oleh Management.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasDuplicateMissions && (
                <Button
                  variant="outline"
                  onClick={handleCleanupDuplicateMissions}
                  disabled={isSaving || isLoading}
                >
                  Atasi Duplikat Perjalanan Dinas
                </Button>
              )}
              <Button onClick={() => handleOpenCreate()}>
                <Plus className="mr-2 h-4 w-4" /> Buat Perjalanan Dinas Baru
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Memuat data...
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Perjalanan</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Jumlah Anggota</TableHead>
                      <TableHead>Progress Validasi Manager</TableHead>
                      <TableHead>Progress Konfirmasi Staff</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mergedMissionItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center text-muted-foreground py-8"
                        >
                          Belum ada perjalanan dinas
                        </TableCell>
                      </TableRow>
                    ) : (
                      mergedMissionItems.map((mission) => (
                        <TableRow key={mission.id}>
                          <TableCell className="font-medium">
                            {mission.missionName}
                            <div className="text-xs text-muted-foreground">
                              {mission.assignmentNumber}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              {mission.destinationProvince || "-"}
                              {mission.destinationRegency
                                ? ` / ${mission.destinationRegency}`
                                : ""}
                            </div>
                            {mission.destinationAddress && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {mission.destinationAddress}
                              </div>
                            )}
                            {mission.destinationGoogleMaps && (
                              <a
                                href={mission.destinationGoogleMaps}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline mt-1 block"
                              >
                                Google Maps
                              </a>
                            )}
                          </TableCell>
                          <TableCell>
                            {formatDate(mission.startDate)} –{" "}
                            {formatDate(mission.endDate)}
                          </TableCell>
                          <TableCell>
                            {mission.memberCount ?? 0} anggota
                          </TableCell>
                          <TableCell>
                            {`${mission.managerApprovedCount ?? 0}/${
                              mission.memberCount ?? 0
                            } validasi`}
                          </TableCell>
                          <TableCell>
                            {`${mission.staffConfirmedCount ?? 0}/${
                              mission.memberCount ?? 0
                            } konfirmasi`}
                          </TableCell>
                          <TableCell>
                            {renderStatusLabel(mission.status)}
                          </TableCell>
                          <TableCell className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => selectMissionForDetail(mission)}
                            >
                              Detail
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => selectMissionForEdit(mission)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => selectMissionForManage(mission)}
                            >
                              Kelola Anggota
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleArchiveMission(mission)}
                            >
                              Batalkan
                            </Button>
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
      ) : activeMode === "create" ? (
        /* ===== MISSION CREATE FORM ===== */
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <div>
              <CardTitle>Buat Perjalanan Dinas Baru</CardTitle>
              <CardDescription>
                Isi form untuk membuat Surat Perintah Dinas.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseCreate}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="pt-6 space-y-8">
            {/* ── SECTION 1: INFORMASI PERJALANAN DINAS ─────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={FileText}
                title="1. Informasi Perjalanan Dinas"
                description="Nama perjalanan, nomor surat, brand/proyek, klien, dan jenis dinas."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Nama Perjalanan Dinas{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.missionName}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        missionName: e.target.value,
                      })
                    }
                    placeholder="Contoh: Audit Lapangan Q3 – Surabaya"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nomor Surat Tugas/SPD</Label>
                  <Input
                    value={missionForm.assignmentNumber}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        assignmentNumber: e.target.value,
                      })
                    }
                    placeholder="Opsional – otomatis jika kosong"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Brand / Proyek</Label>
                  <Input
                    value={missionForm.projectName}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        projectName: e.target.value,
                      })
                    }
                    placeholder="Nama brand atau proyek"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Nama Klien <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.clientName}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        clientName: e.target.value,
                      })
                    }
                    placeholder="Klien atau mitra tujuan dinas"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Jenis Dinas <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={missionForm.tripType}
                    onValueChange={(val: any) =>
                      setMissionForm({ ...missionForm, tripType: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    <Label>
                      Sebutkan jenis dinas lainnya{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={missionForm.tripTypeOther}
                      onChange={(e) =>
                        setMissionForm({
                          ...missionForm,
                          tripTypeOther: e.target.value,
                        })
                      }
                      placeholder="Jenis dinas lainnya"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ── SECTION 2: TUJUAN & JADWAL ───────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={MapPin}
                title="2. Tujuan & Jadwal"
                description="Lokasi tujuan, alamat lengkap, link Google Maps, dan tanggal perjalanan."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Provinsi Tujuan <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.destinationProvince}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationProvince: e.target.value,
                      })
                    }
                    placeholder="Provinsi"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Kota / Kabupaten <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.destinationRegency}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationRegency: e.target.value,
                      })
                    }
                    placeholder="Kota atau Kabupaten"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>
                    Alamat Lengkap Tujuan{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={missionForm.destinationAddress}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationAddress: e.target.value,
                      })
                    }
                    className="min-h-[80px] resize-none"
                    placeholder="Alamat lengkap lokasi tugas"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Link Google Maps (opsional)</Label>
                  <Input
                    value={missionForm.destinationGoogleMaps}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationGoogleMaps: e.target.value,
                      })
                    }
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Tanggal Berangkat{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={missionForm.startDate}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        startDate: e.target.value,
                      })
                    }
                    className="[color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Tanggal Pulang <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={missionForm.endDate}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        endDate: e.target.value,
                      })
                    }
                    className="[color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                {missionForm.startDate &&
                  missionForm.endDate &&
                  new Date(missionForm.endDate) >=
                    new Date(missionForm.startDate) && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        Durasi perjalanan:{" "}
                        <span className="font-semibold text-foreground">
                          {calculateDurationDays(
                            missionForm.startDate,
                            missionForm.endDate,
                          )}{" "}
                          hari
                        </span>
                      </p>
                    </div>
                  )}
              </div>
            </section>

            {/* ── SECTION 3: INSTRUKSI ─────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={FileText}
                title="3. Instruksi Utama"
                description="Instruksi lengkap untuk seluruh anggota tim dinas."
              />
              <RichTextEditor
                value={missionForm.instructionNote}
                onChange={(html) =>
                  setMissionForm({ ...missionForm, instructionNote: html })
                }
                placeholder="Tulis instruksi pelaksanaan dinas di sini... (bold, italic, bullet list tersedia di toolbar)"
              />
              {!stripHtml(missionForm.instructionNote) && (
                <p className="text-xs text-muted-foreground">
                  Instruksi utama wajib diisi sebelum perjalanan dinas dapat
                  dibuat.
                </p>
              )}
            </section>

            {/* ── SECTION 4: DOKUMEN SURAT TUGAS/SPD ──────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={FileText}
                title="4. Dokumen Surat Tugas/SPD"
                description="Upload dokumen Surat Tugas/SPD atau berikan link Google Drive sebagai alternatif."
              />
              <div className="space-y-3">
                <Label>
                  Upload Surat Tugas / SPD{" "}
                  <span className="text-muted-foreground font-normal">
                    (wajib salah satu: file atau link Drive)
                  </span>
                </Label>
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Pilih File PDF/DOC/DOCX
                    </Button>
                    <div className="min-w-0 flex-1 text-sm">
                      {assignmentLetterFile ? (
                        <div>
                          <p className="font-medium text-foreground truncate">
                            {assignmentLetterFile.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(assignmentLetterFile.size / 1024 / 1024).toFixed(
                              2,
                            )}{" "}
                            MB
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          Pilih file PDF/DOC/DOCX, maks 10 MB.
                        </p>
                      )}
                    </div>
                    {assignmentLetterFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
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
                    <p className="text-sm text-destructive">
                      {assignmentLetterError}
                    </p>
                  )}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-muted/30 px-3 text-muted-foreground">
                        atau
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
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
                      placeholder="https://drive.google.com/..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Alternatif jika upload file tidak tersedia.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION 5: TIM DINAS ─────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={Users}
                title="5. Tim Dinas"
                description="Pilih anggota tim yang akan melaksanakan perjalanan dinas ini."
              />
              <StaffPicker
                allStaff={allMergedStaff}
                selectedUids={selectedStaffUids}
                onToggle={toggleStaffSelection}
                isLoading={staffLoading}
                error={profilesError}
              />
            </section>

            {/* ── SUBMIT ───────────────────────────────────────────────── */}
            <div className="pt-2 border-t border-border">
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
                  : selectedStaffUids.length > 0
                    ? `Buat Perjalanan Dinas (${selectedStaffUids.length} orang)`
                    : "Buat Perjalanan Dinas"}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Pastikan semua field wajib (*) sudah diisi dan minimal satu
                staff dipilih.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : activeMode === "detail" ? (
        renderMissionDetailView()
      ) : activeMode === "edit" ? (
        renderMissionEditView()
      ) : activeMode === "manage" ? (
        renderMissionManageView()
      ) : null}

      <AppModal
        open={isDocumentViewerOpen}
        onOpenChange={setIsDocumentViewerOpen}
      >
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Pratinjau Dokumen Surat Tugas/SPD
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Lihat dokumen dari dalam HRP tanpa membuka API mentah.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDocumentViewerOpen(false)}
            >
              Tutup
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Nama dokumen</p>
            <p className="font-medium text-foreground mt-1">
              {activeDocumentLabel}
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              Sumber dokumen: {activeDocumentSourceLabel}
            </p>
            {activeMission?.googleDriveLink ? (
              <a
                href={activeMission.googleDriveLink}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" variant="secondary" className="w-full">
                  Buka Google Drive
                </Button>
              </a>
            ) : null}

            <Button
              size="sm"
              variant="outline"
              onClick={handlePreviewDocument}
              disabled={isDocumentPreviewing || !activeDocumentUrl}
            >
              {isDocumentPreviewing ? "Memuat..." : "Pratinjau Dokumen"}
            </Button>

            {!activeDocumentUrl ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Dokumen belum bisa dipreview. Silakan buka melalui Google Drive
                atau hubungi admin.
              </div>
            ) : null}

            {documentViewerError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive-foreground">
                {documentViewerError}
              </div>
            ) : null}
          </div>
        </div>
      </AppModal>
    </div>
  );
}
