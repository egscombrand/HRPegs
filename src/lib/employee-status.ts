import { EmployeeMasterData, EmployeeProfile, UserProfile } from "./types";

/**
 * OperationalStatus defines the high-level operational status for filtering and grouping.
 */
export type OperationalStatus = 
  | "active" 
  | "training" 
  | "intern" 
  | "probation" 
  | "contract" 
  | "resigned" 
  | "terminated" 
  | "unknown";

/**
 * Normalizes various status and type fields from employees, profiles, and users 
 * into a single operational status string.
 */
export function normalizeEmployeeOperationalStatus(
  employee?: any,
  profile?: any,
  user?: any
): OperationalStatus {
  // Extract and clean values from multiple possible locations
  const getCleanVal = (val: any) => String(val || "").toLowerCase().trim();

  const statusFields = [
    employee?.employmentStatus,
    employee?.hrdEmploymentInfo?.employmentStatus,
    employee?.status,
    employee?.statusKerja,
    employee?.hrdEmploymentInfo?.statusKerja,
    profile?.hrdEmploymentInfo?.statusKerja,
    profile?.hrdEmploymentInfo?.employmentStatus,
    employee?.workStatus,
  ];

  const typeFields = [
    employee?.employeeType,
    employee?.hrdEmploymentInfo?.employeeType,
    employee?.employmentType,
    employee?.hrdEmploymentInfo?.tipeKaryawan,
    profile?.hrdEmploymentInfo?.tipeKaryawan,
    profile?.hrdEmploymentInfo?.employeeType,
  ];

  const roleFallback = getCleanVal(user?.role);

  // Check Resigned / Terminated first as they are final states
  for (const s of statusFields) {
    const val = getCleanVal(s);
    if (val === "resigned") return "resigned";
    if (val === "terminated") return "terminated";
  }

  // Check Training
  for (const s of [...statusFields, ...typeFields]) {
    const val = getCleanVal(s);
    if (val === "training") return "training";
  }

  // Check Magang / Intern
  for (const s of [...statusFields, ...typeFields]) {
    const val = getCleanVal(s);
    if (["magang", "intern", "internship"].includes(val)) return "intern";
  }

  // Check Probation
  for (const s of [...statusFields, ...typeFields]) {
    const val = getCleanVal(s);
    if (["probation", "masa percobaan", "percobaan"].includes(val)) return "probation";
  }

  // Check Contract
  for (const s of [...statusFields, ...typeFields]) {
    const val = getCleanVal(s);
    if (["kontrak", "contract"].includes(val)) return "contract";
  }

  // Check Active / Karyawan
  for (const s of [...statusFields, ...typeFields]) {
    const val = getCleanVal(s);
    if (["karyawan", "active", "aktif"].includes(val)) return "active";
  }

  // Fallback logic
  if (roleFallback === "karyawan") return "active";

  return "unknown";
}

/**
 * Helper to get user-friendly label for the operational status
 */
export function getOperationalStatusLabel(status: OperationalStatus): string {
  switch (status) {
    case "active": return "Aktif";
    case "training": return "Training";
    case "intern": return "Magang";
    case "probation": return "Percobaan";
    case "contract": return "Kontrak";
    case "resigned": return "Resigned";
    case "terminated": return "Terminated";
    default: return "Belum diatur";
  }
}

/**
 * Helper to get color/variant for status badges
 */
export function getOperationalStatusVariant(status: OperationalStatus): string {
  switch (status) {
    case "active": return "success";
    case "training": return "warning";
    case "intern": return "info";
    case "probation": return "warning";
    case "contract": return "default";
    case "resigned": return "destructive";
    case "terminated": return "destructive";
    default: return "outline";
  }
}
