import {
  Brand,
  EmployeeMasterData,
  EmployeeProfile,
  UserProfile,
} from "./types";
import { normalizeEmployeeRow } from "./employee-row-normalizer";

export type NormalizedDirectoryMember = {
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

const EXCLUDED_USER_ROLES = new Set([
  "super-admin",
  "super_admin",
  "superadmin",
  "hrd",
  "hr",
  "admin-system",
  "system-admin",
  "system_admin",
  "admin_system",
  "kandidat",
  "candidate",
]);

const EXCLUDED_STRUCTURAL_RE = /^(management|direktur|director)$/i;
const EXCLUDED_TITLE_RE = /direktur|director|manajemen|management/i;

function shouldExcludeStaff(
  userRole: string | undefined,
  structuralPosition?: string,
  jobTitle?: string,
) {
  if (userRole && EXCLUDED_USER_ROLES.has(userRole.toLowerCase())) return true;
  if (structuralPosition && EXCLUDED_STRUCTURAL_RE.test(structuralPosition))
    return true;
  if (jobTitle && EXCLUDED_TITLE_RE.test(jobTitle)) return true;
  return false;
}

function resolveDisplayName(
  user: UserProfile | undefined,
  employee: EmployeeMasterData | undefined,
  profile: EmployeeProfile | undefined,
) {
  return (
    employee?.fullName ||
    profile?.fullName ||
    (profile as any)?.employeeName ||
    (profile as any)?.name ||
    (profile?.dataDiriIdentitas as any)?.namaLengkap ||
    user?.fullName ||
    (user as any)?.displayName ||
    profile?.email ||
    user?.email ||
    ""
  ).trim();
}

export function buildEmployeeDirectory(
  users: UserProfile[] | null | undefined,
  employees: EmployeeMasterData[] | null | undefined,
  profiles: EmployeeProfile[] | null | undefined,
  brands: Brand[] | null | undefined,
): NormalizedDirectoryMember[] {
  const userMap = new Map<string, UserProfile>();
  (users || []).forEach((user) => userMap.set(user.uid, user));

  const employeeMap = new Map<string, EmployeeMasterData>();
  (employees || []).forEach((employee) =>
    employeeMap.set(employee.uid, employee),
  );

  const seenUids = new Set<string>();
  const result: NormalizedDirectoryMember[] = [];
  const brandList = brands || [];

  (profiles || []).forEach((profile) => {
    const uid = (profile as any).uid || (profile as any).id;
    if (!uid || seenUids.has(uid)) return;
    seenUids.add(uid);

    const user = userMap.get(uid);
    const employee = employeeMap.get(uid);
    const normalized = normalizeEmployeeRow(
      employee ?? {},
      profile,
      user ?? {},
      brandList,
    );
    if (
      shouldExcludeStaff(
        user?.role,
        normalized.structuralPosition,
        normalized.jabatan,
      )
    )
      return;

    const resolvedName = resolveDisplayName(user, employee, profile);
    if (!resolvedName) return;

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

  (users || []).forEach((user) => {
    if (seenUids.has(user.uid)) return;
    if (EXCLUDED_USER_ROLES.has((user.role || "").toLowerCase())) return;

    const isDivisionManager =
      user.isDivisionManager ||
      user.structuralLevel === "division_manager" ||
      user.structuralPosition === "division_manager";

    const isCandidate = (user.role || "").toLowerCase() === "kandidat";
    if (
      !isDivisionManager &&
      user.role !== "karyawan" &&
      !user.employmentType
    ) {
      return;
    }
    if (isCandidate) return;

    const employee = employeeMap.get(user.uid);
    const normalized = normalizeEmployeeRow(
      employee ?? user,
      null,
      user,
      brandList,
    );
    if (
      shouldExcludeStaff(
        user.role,
        normalized.structuralPosition,
        normalized.jabatan,
      )
    )
      return;

    const resolvedName = resolveDisplayName(user, employee, undefined);
    if (!resolvedName) return;

    seenUids.add(user.uid);
    result.push({
      uid: user.uid,
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
      isDivisionManager,
    });
  });

  return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
}
