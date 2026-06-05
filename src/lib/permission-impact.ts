import type { PermissionRequest } from "@/lib/types";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
  isBefore,
  isAfter,
} from "date-fns";

/**
 * FORM TYPE: Determines the pattern of absence/impact (bentuk izin)
 */
export type PermissionFormType =
  | "tidak_masuk" // Tidak Masuk Kerja (full day)
  | "keluar_kantor" // Meninggalkan Kantor (time-based)
  | "datang_terlambat" // Datang Terlambat (time-based)
  | "pulang_awal" // Pulang Lebih Awal (time-based)
  | "akademik" // Izin Akademik (full day, no payroll impact)
  | "lainnya"; // Other

/**
 * REASON: Explains why the absence happened (alasan izin)
 * Only relevant for breakdown and payroll impact rules
 */
export type PermissionReason =
  | "sakit" // Sakit
  | "duka_cita" // Duka Cita
  | "administrasi_resmi" // Administrasi Resmi
  | "pribadi" // Urusan Pribadi / Keperluan Pribadi
  | "lainnya"; // Other

export type PayrollImpactLabel =
  | "potong_hari"
  | "potong_jam"
  | "tidak_dipotong"
  | "perlu_review_hrd"
  | "sesuai_kebijakan";

/**
 * CATEGORY: For filtering by type of absence/impact
 * Breaks down tidak_masuk by reason, treats other form types as-is
 */
export type PermissionCategory =
  | "sakit" // Tidak masuk - Sakit
  | "duka_cita" // Tidak masuk - Duka Cita
  | "administrasi_resmi" // Tidak masuk - Administrasi Resmi
  | "tidak_masuk_non_sakit" // Tidak masuk - Pribadi / Lainnya
  | "keluar_kantor" // Meninggalkan Kantor
  | "datang_terlambat" // Datang Terlambat
  | "pulang_awal" // Pulang Awal
  | "akademik" // Akademik
  | "lainnya"; // Other

/**
 * Classify permission into category for filtering
 * Breaks down tidak_masuk by reason, other types use form type
 */
export function classifyPermissionCategory(
  permission: PermissionRequest,
): PermissionCategory {
  const formType = getFormType(permission);
  const reason = getReason(permission);

  // Break down tidak_masuk by reason
  if (formType === "tidak_masuk") {
    if (reason === "sakit") return "sakit";
    if (reason === "duka_cita") return "duka_cita";
    if (reason === "administrasi_resmi") return "administrasi_resmi";
    // pribadi, lainnya -> tidak_masuk_non_sakit
    return "tidak_masuk_non_sakit";
  }

  // Other form types map directly
  if (formType === "keluar_kantor") return "keluar_kantor";
  if (formType === "datang_terlambat") return "datang_terlambat";
  if (formType === "pulang_awal") return "pulang_awal";
  if (formType === "akademik") return "akademik";

  return "lainnya";
}

/**
 * Extract form type from permission
 * Form type determines the pattern of absence
 */
export function getFormType(permission: PermissionRequest): PermissionFormType {
  const formType = permission.formType || permission.type;

  if (formType === "keluar_kantor") return "keluar_kantor";
  if (formType === "datang_terlambat") return "datang_terlambat";
  if (formType === "pulang_awal") return "pulang_awal";
  if (formType === "akademik") return "akademik";
  if (formType === "tidak_masuk" || formType === "sakit") return "tidak_masuk";

  return "lainnya";
}

/**
 * Extract reason from permission
 * Reason explains why, used for breakdown and payroll rules
 */
export function getReason(permission: PermissionRequest): PermissionReason {
  const reasonType = permission.reasonType || permission.reason;
  const formType = getFormType(permission);

  // For tidak_masuk, check the reason
  if (formType === "tidak_masuk") {
    if (reasonType === "sakit") return "sakit";
    if (reasonType === "duka" || reasonType === "duka_cita") return "duka_cita";
    if (reasonType === "administrasi_resmi") return "administrasi_resmi";
    if (
      reasonType === "pribadi" ||
      reasonType === "keperluan_pribadi" ||
      reasonType === "urusan_pribadi"
    )
      return "pribadi";
  }

  // For other form types, check if there's a reason
  if (reasonType === "sakit") return "sakit";
  if (reasonType === "duka" || reasonType === "duka_cita") return "duka_cita";
  if (reasonType === "administrasi_resmi") return "administrasi_resmi";
  if (
    reasonType === "pribadi" ||
    reasonType === "keperluan_pribadi" ||
    reasonType === "urusan_pribadi"
  )
    return "pribadi";

  return "lainnya";
}

/**
 * Get human-readable label for reason
 */
export function getReasonLabel(reason: PermissionReason): string {
  const labels: Record<PermissionReason, string> = {
    sakit: "Sakit",
    duka_cita: "Duka Cita",
    administrasi_resmi: "Administrasi Resmi",
    pribadi: "Urusan Pribadi",
    lainnya: "Lainnya",
  };
  return labels[reason];
}

/**
 * Get human-readable label for form type
 */
export function getFormTypeLabel(formType: PermissionFormType): string {
  const labels: Record<PermissionFormType, string> = {
    tidak_masuk: "Tidak Masuk Kerja",
    keluar_kantor: "Meninggalkan Kantor",
    datang_terlambat: "Datang Terlambat",
    pulang_awal: "Pulang Lebih Awal",
    akademik: "Akademik",
    lainnya: "Lainnya",
  };
  return labels[formType];
}

/**
 * Get payroll impact label based on form type and reason
 * Form type determines primary impact, reason determines rules
 */
export function getPayrollImpactLabel(
  permission: PermissionRequest,
): PayrollImpactLabel {
  const formType = getFormType(permission);
  const reason = getReason(permission);

  // Not masuk determines day impact
  if (formType === "tidak_masuk") {
    if (reason === "sakit") {
      // Sakit: check if has proof
      const hasAttachment =
        permission.attachments && permission.attachments.length > 0;
      const attachmentStatus = permission.attachmentStatus;
      const hasProof =
        hasAttachment ||
        attachmentStatus === "provided" ||
        attachmentStatus === "verification_needed";

      if (hasProof) {
        return "sesuai_kebijakan";
      } else {
        return "perlu_review_hrd";
      }
    }

    if (reason === "duka_cita") {
      return "sesuai_kebijakan";
    }

    if (reason === "administrasi_resmi") {
      return "tidak_dipotong";
    }

    // Default for pribadi/lainnya
    return "potong_hari";
  }

  // Time-based forms
  if (["keluar_kantor", "datang_terlambat", "pulang_awal"].includes(formType)) {
    return "potong_jam";
  }

  // Akademik
  if (formType === "akademik") {
    return "tidak_dipotong";
  }

  return "perlu_review_hrd";
}

export function getDurationInDays(permission: PermissionRequest): number {
  const formType = getFormType(permission);

  // Only tidak_masuk and akademik count as full days
  if (formType !== "tidak_masuk" && formType !== "akademik") {
    return 0;
  }

  if (!permission.startDate || !permission.endDate) return 0;

  const start =
    permission.startDate &&
    typeof permission.startDate === "object" &&
    "toDate" in permission.startDate
      ? (permission.startDate as any).toDate()
      : new Date(permission.startDate as any);

  const end =
    permission.endDate &&
    typeof permission.endDate === "object" &&
    "toDate" in permission.endDate
      ? (permission.endDate as any).toDate()
      : new Date(permission.endDate as any);

  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

export function getDurationInMinutes(permission: PermissionRequest): number {
  const formType = getFormType(permission);

  // Only time-based forms
  if (["keluar_kantor", "datang_terlambat", "pulang_awal"].includes(formType)) {
    return permission.totalDurationMinutes || 0;
  }

  return 0;
}

/**
 * Resolve employee brand with proper fallback
 * Priority: resolved snapshot → employee profile → user profile → N/A
 */
export function resolveEmployeeBrand(emp: any): string {
  // Prefer enriched/resolved fields
  if (
    emp._resolvedApplicantBrand &&
    emp._resolvedApplicantBrand !== "N/A" &&
    emp._resolvedApplicantBrand !== "Brand belum diatur"
  )
    return emp._resolvedApplicantBrand;
  if (emp.applicantBrandName && emp.applicantBrandName !== "N/A")
    return emp.applicantBrandName;

  // Employee profile
  if (
    emp._enrichedEmployeeProfile?.hrdEmploymentInfo?.brandName &&
    emp._enrichedEmployeeProfile.hrdEmploymentInfo.brandName !== "N/A"
  )
    return emp._enrichedEmployeeProfile.hrdEmploymentInfo.brandName;
  if (
    emp._enrichedEmployeeProfile?.brandName &&
    emp._enrichedEmployeeProfile.brandName !== "N/A"
  )
    return emp._enrichedEmployeeProfile.brandName;

  // Fallback to field without enrichment
  if (emp.brandName && emp.brandName !== "N/A") return emp.brandName;

  // User profile
  if (
    emp._enrichedUserProfile?.brandName &&
    emp._enrichedUserProfile.brandName !== "N/A"
  )
    return emp._enrichedUserProfile.brandName;

  return "Brand belum diatur";
}

/**
 * Resolve employee division with proper fallback
 * Priority: resolved snapshot → employee profile → user profile → N/A
 */
export function resolveEmployeeDivision(emp: any): string {
  // Prefer enriched/resolved fields (from snapshot or query resolution)
  if (
    emp._resolvedApplicantDivision &&
    emp._resolvedApplicantDivision !== "N/A" &&
    emp._resolvedApplicantDivision !== "Divisi belum diatur"
  )
    return emp._resolvedApplicantDivision;
  if (emp.applicantDivisionName && emp.applicantDivisionName !== "N/A")
    return emp.applicantDivisionName;

  // Employee profile HRD employment info
  if (
    emp._enrichedEmployeeProfile?.hrdEmploymentInfo?.divisi &&
    emp._enrichedEmployeeProfile.hrdEmploymentInfo.divisi !== "N/A"
  )
    return emp._enrichedEmployeeProfile.hrdEmploymentInfo.divisi;

  // Employee profile division field
  if (
    emp._enrichedEmployeeProfile?.division &&
    emp._enrichedEmployeeProfile.division !== "N/A"
  )
    return emp._enrichedEmployeeProfile.division;

  // Fallback to field without enrichment
  if (emp.division && emp.division !== "N/A") return emp.division;

  // User profile
  if (
    emp._enrichedUserProfile?.divisionName &&
    emp._enrichedUserProfile.divisionName !== "N/A"
  )
    return emp._enrichedUserProfile.divisionName;

  return "Divisi belum diatur";
}

export interface PermissionDetailBreakdown {
  tidak_masuk_sakit: number; // days
  tidak_masuk_duka: number; // days
  tidak_masuk_admin: number; // days
  tidak_masuk_pribadi: number; // days
  tidak_masuk_lainnya: number; // days
  keluar_kantor_minutes: number;
  datang_terlambat_minutes: number;
  pulang_awal_minutes: number;
  akademik_days: number;
}

export interface EmployeePermissionSummary {
  uid: string;
  fullName: string;
  positionTitle: string;
  division: string;
  brand: string;
  brandId: string;
  // Metrics
  totalWorkingDays: number;
  effectiveWorkingDays: number;
  // Total tidak_masuk (all reasons combined)
  tidak_masuk_total_days: number;
  // Breakdown of tidak_masuk by reason
  tidak_masuk_breakdown: {
    sakit: number;
    duka_cita: number;
    administrasi_resmi: number;
    pribadi: number;
    lainnya: number;
  };
  // Time-based
  keluar_kantor_minutes: number;
  datang_terlambat_minutes: number;
  pulang_awal_minutes: number;
  // Academic
  akademik_days: number;
  // Payroll impact
  payrollImpact: {
    potong_hari: number;
    potong_jam: number;
    tidak_dipotong: number;
    perlu_review_hrd: number;
    sesuai_kebijakan: number;
  };
  // All permissions for detail view
  permissions: PermissionRequest[];
}

export function countWorkingDaysInMonth(year: number, month: number): number {
  const startDate = startOfMonth(new Date(year, month - 1, 1));
  const endDate = endOfMonth(startDate);

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const workingDays = days.filter((day) => !isWeekend(day));

  return workingDays.length;
}

export function buildEmployeePermissionSummaries(
  permissions: PermissionRequest[],
  employees: Map<string, any>,
  startDate: Date,
  endDate: Date,
): EmployeePermissionSummary[] {
  // Group by uid
  const byUid = new Map<string, PermissionRequest[]>();

  for (const perm of permissions) {
    const uid = perm.uid;
    if (!uid) continue;

    // Check if permission falls within date range
    let permStart: Date;
    if (
      perm.startDate &&
      typeof perm.startDate === "object" &&
      "toDate" in perm.startDate
    ) {
      permStart = (perm.startDate as any).toDate();
    } else {
      permStart = new Date(perm.startDate as any);
    }

    let permEnd: Date;
    if (
      perm.endDate &&
      typeof perm.endDate === "object" &&
      "toDate" in perm.endDate
    ) {
      permEnd = (perm.endDate as any).toDate();
    } else {
      permEnd = new Date(perm.endDate as any);
    }

    // Only include if at least partially in range
    if (!isAfter(permEnd, startDate) || !isBefore(permStart, endDate)) {
      continue;
    }

    if (!byUid.has(uid)) {
      byUid.set(uid, []);
    }
    byUid.get(uid)!.push(perm);
  }

  // Build summaries
  const summaries: EmployeePermissionSummary[] = [];

  for (const [uid, perms] of byUid.entries()) {
    const emp = employees.get(uid);
    if (!emp) continue;

    const summary: EmployeePermissionSummary = {
      uid,
      fullName: emp.fullName || "—",
      positionTitle: emp.positionTitle || "—",
      division: resolveEmployeeDivision(emp),
      brand: resolveEmployeeBrand(emp),
      brandId: emp.brandId || "",
      totalWorkingDays: countWorkingDaysInMonth(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
      ),
      effectiveWorkingDays: 0,
      tidak_masuk_total_days: 0,
      tidak_masuk_breakdown: {
        sakit: 0,
        duka_cita: 0,
        administrasi_resmi: 0,
        pribadi: 0,
        lainnya: 0,
      },
      keluar_kantor_minutes: 0,
      datang_terlambat_minutes: 0,
      pulang_awal_minutes: 0,
      akademik_days: 0,
      payrollImpact: {
        potong_hari: 0,
        potong_jam: 0,
        tidak_dipotong: 0,
        perlu_review_hrd: 0,
        sesuai_kebijakan: 0,
      },
      permissions: perms,
    };

    // Aggregate stats
    for (const perm of perms) {
      const formType = getFormType(perm);
      const reason = getReason(perm);
      const days = getDurationInDays(perm);
      const minutes = getDurationInMinutes(perm);
      const payrollLabel = getPayrollImpactLabel(perm);

      // Categorize by form type
      if (formType === "tidak_masuk") {
        summary.tidak_masuk_total_days += days;

        // Break down by reason
        if (reason === "sakit") {
          summary.tidak_masuk_breakdown.sakit += days;
        } else if (reason === "duka_cita") {
          summary.tidak_masuk_breakdown.duka_cita += days;
        } else if (reason === "administrasi_resmi") {
          summary.tidak_masuk_breakdown.administrasi_resmi += days;
        } else if (reason === "pribadi") {
          summary.tidak_masuk_breakdown.pribadi += days;
        } else {
          summary.tidak_masuk_breakdown.lainnya += days;
        }
      } else if (formType === "keluar_kantor") {
        summary.keluar_kantor_minutes += minutes;
      } else if (formType === "datang_terlambat") {
        summary.datang_terlambat_minutes += minutes;
      } else if (formType === "pulang_awal") {
        summary.pulang_awal_minutes += minutes;
      } else if (formType === "akademik") {
        summary.akademik_days += days;
      }

      // Payroll impact (based on form type + reason)
      if (payrollLabel === "potong_hari") {
        summary.payrollImpact.potong_hari += days;
      } else if (payrollLabel === "potong_jam") {
        summary.payrollImpact.potong_jam += minutes;
      } else if (payrollLabel === "tidak_dipotong") {
        summary.payrollImpact.tidak_dipotong +=
          formType === "akademik" ? days : 0;
      } else if (payrollLabel === "perlu_review_hrd") {
        summary.payrollImpact.perlu_review_hrd += days;
      } else if (payrollLabel === "sesuai_kebijakan") {
        summary.payrollImpact.sesuai_kebijakan += days;
      }
    }

    // Calculate effective working days
    // Only tidak_masuk affects hadir efektif
    // akademik also affects, but separately
    const daysAffectingPresence =
      summary.tidak_masuk_total_days + summary.akademik_days;
    summary.effectiveWorkingDays =
      summary.totalWorkingDays - daysAffectingPresence;

    summaries.push(summary);
  }

  // Sort by fullName
  return summaries.sort((a, b) => a.fullName.localeCompare(b.fullName));
}
