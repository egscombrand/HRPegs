import {
  Brand,
  EmployeeMasterData,
  EmployeeProfile,
  UserProfile,
} from "./types";
import {
  normalizeEmployeeOperationalStatus,
  OperationalStatus,
} from "./employee-status";

export interface NormalizedEmployeeRow {
  brandId: string;
  brandName: string;
  divisi: string;
  jabatan: string;
  tipeKaryawan: string;
  statusKerja: OperationalStatus;
  needsHrdAttention: boolean;

  // New structure fields
  employeeId?: string;
  divisionId?: string;
  structuralPosition?: string;
  isDivisionManager?: boolean;
  fullName?: string;
  workRole?: string;
  employeeType?: string;
  employmentStatus?: string;
  directSupervisorUid?: string;
  directSupervisorName?: string;
  workSystem?: string;
}

/**
 * Single Source of Truth for normalizing employee data for list rows and filtering.
 */
export function normalizeEmployeeRow(
  employee: any,
  profile: any,
  user: any,
  brands: Brand[] = [],
): NormalizedEmployeeRow {
  // 1. Resolve Brand
  const hrdInfo = profile?.hrdEmploymentInfo || employee?.hrdEmploymentInfo || {};
  
  const rawBrandId =
    hrdInfo.brandId ||
    employee?.brandId ||
    employee?.companyId ||
    (typeof user?.brandId === "string"
      ? user?.brandId
      : Array.isArray(user?.brandId)
        ? user?.brandId[0]
        : "");

  const rawBrandName =
    hrdInfo.brandName ||
    hrdInfo.brand ||
    employee?.brandName ||
    employee?.companyName ||
    user?.brandName ||
    "";

  let brandId = String(rawBrandId || "").trim();
  let brandName = String(rawBrandName || "").trim();

  // If we have ID but no name, or name is a placeholder, resolve from brands collection
  if (brandId && (!brandName || brandName === "Belum diatur" || brandName === "Brand belum diatur")) {
    const foundBrand = brands.find((b) => b.id === brandId);
    if (foundBrand) {
      brandName = foundBrand.name;
    }
  }

  // If we have name but no ID, resolve ID from brands collection
  if (!brandId && brandName) {
    const foundBrand = brands.find((b) => b.name === brandName);
    if (foundBrand) {
      brandId = foundBrand.id!;
    }
  }

  // 2. Resolve Division
  const divisi = String(
    hrdInfo.divisionName ||
      employee?.divisionName ||
      employee?.division ||
      hrdInfo.divisi ||
      user?.division ||
      "",
  ).trim();

  const divisionId = String(
    hrdInfo.divisionId ||
      employee?.divisionId ||
      "",
  ).trim();

  // 3. Resolve Jabatan (Position) / Work Role
  const jabatan = String(
    hrdInfo.workRole ||
      employee?.workRole ||
      hrdInfo.jabatan ||
      employee?.jabatan ||
      employee?.jobTitle ||
      employee?.positionTitle ||
      user?.positionTitle ||
      "",
  ).trim();

  // 4. Resolve Type & Status
  const tipeKaryawan = String(
    hrdInfo.employeeType ||
      employee?.employeeType ||
      hrdInfo.tipeKaryawan ||
      employee?.tipeKaryawan ||
      employee?.employmentType ||
      user?.employmentType ||
      "",
  ).trim();
  
  const employeeType = tipeKaryawan;

  const employmentStatus = String(
    hrdInfo.employmentStatus ||
      employee?.employmentStatus ||
      hrdInfo.statusKerja ||
      employee?.statusKerja ||
      "",
  ).trim();

  // 5. System & Structure fields
  const workSystem = String(
    hrdInfo.sistemKerja ||
      hrdInfo.workSystem ||
      employee?.sistemKerja ||
      employee?.workSystem ||
      "",
  ).trim();

  const employeeId = String(
    hrdInfo.employeeId ||
      employee?.employeeId ||
      "",
  ).trim();

  const structuralPosition = String(
    hrdInfo.structuralPosition ||
      employee?.structuralPosition ||
      (profile as any)?.structuralPosition ||
      (profile as any)?.structuralLevel ||
      (user as any)?.structuralPosition ||
      (user as any)?.structuralLevel ||
      employee?.position ||
      "",
  ).trim();

  const workRole = jabatan; // Sync with resolved jabatan

  const directSupervisorUid = String(
    hrdInfo.directSupervisorUid ||
      employee?.directSupervisorUid ||
      employee?.supervisorUid ||
      profile?.supervisorUid ||
      "",
  ).trim();

  const directSupervisorName = String(
    hrdInfo.directSupervisorName ||
      employee?.directSupervisorName ||
      employee?.supervisorName ||
      hrdInfo.atasanLangsung ||
      "",
  ).trim();

  const statusKerja = normalizeEmployeeOperationalStatus(
    employee,
    profile,
    user,
  );

  // 6. Determine if HRD attention is needed
  const needsHrdAttention =
    !brandId || !divisi || !jabatan || statusKerja === "unknown";

  return {
    brandId,
    brandName: brandName || "Brand belum diatur",
    divisi: divisi || "Divisi belum diatur",
    jabatan: jabatan || "Jabatan belum diatur",
    tipeKaryawan: tipeKaryawan || "Staf",
    statusKerja,
    needsHrdAttention,
    employeeId: employeeId || undefined,
    divisionId: divisionId || undefined,
    structuralPosition: structuralPosition || undefined,
    isDivisionManager: hrdInfo.isDivisionManager || employee?.isDivisionManager || user?.isDivisionManager || false,
    fullName: employee?.fullName || profile?.fullName || user?.fullName || undefined,
    workRole: workRole || undefined,
    employeeType: employeeType || undefined,
    employmentStatus: employmentStatus || undefined,
    directSupervisorUid: directSupervisorUid || undefined,
    directSupervisorName: directSupervisorName || undefined,
    workSystem: workSystem || undefined,
  };
}
