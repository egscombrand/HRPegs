import type { EmployeeProfile, UserProfile } from "@/lib/types";

export type ApprovalLevel =
  | "staff_to_manager"
  | "manager_to_director"
  | "management_to_hrd"
  | "unknown";

export type DivisionMasterOrganization = {
  // Primary manager fields
  managerId?: string | null;
  managerUid?: string | null;
  managerName?: string | null;
  supervisorUid?: string | null;
  supervisorName?: string | null;
  directSupervisorUid?: string | null;
  directSupervisorName?: string | null;
  // Manager's own supervisor (for division manager role)
  managerDirectSupervisorId?: string | null;
  managerDirectSupervisorUid?: string | null;
  managerDirectSupervisorName?: string | null;
  managerDirectSupervisorTitle?: string | null;
  directorUid?: string | null;
  directorName?: string | null;
};

export type ApprovalTarget = {
  approvalTargetUid: string | null;
  approvalTargetName: string | null;
  approvalLevel: ApprovalLevel;
  reason?: string;
};

export function resolveApprovalTarget(
  employeeProfile: EmployeeProfile | null | undefined,
  userProfile: UserProfile | null | undefined,
  masterOrganization?: DivisionMasterOrganization | null,
): ApprovalTarget {
  const employeeUid = employeeProfile?.uid || userProfile?.uid || "";
  const structuralPosition =
    (employeeProfile as any)?.structuralPosition ||
    userProfile?.structuralLevel ||
    (employeeProfile?.isDivisionManager || userProfile?.isDivisionManager
      ? "division_manager"
      : "staff");

  const directSupervisorUid =
    employeeProfile?.supervisorUid ||
    (employeeProfile as any)?.directSupervisorUid ||
    userProfile?.directSupervisorUid ||
    null;
  const directSupervisorName =
    employeeProfile?.supervisorName ||
    (employeeProfile as any)?.directSupervisorName ||
    userProfile?.directSupervisorName ||
    null;

  const invalidSelf = (uid?: string | null) => !!uid && uid === employeeUid;

  if (!employeeUid) {
    return {
      approvalTargetUid: null,
      approvalTargetName: null,
      approvalLevel: "unknown",
      reason: "Employee UID tidak tersedia.",
    };
  }

  if (structuralPosition === "division_manager") {
    const managerDirectSupervisorId =
      masterOrganization?.managerDirectSupervisorId ||
      masterOrganization?.managerDirectSupervisorUid ||
      masterOrganization?.directorUid ||
      null;
    const managerDirectSupervisorName =
      masterOrganization?.managerDirectSupervisorName ||
      masterOrganization?.directorName ||
      null;

    if (managerDirectSupervisorId) {
      if (invalidSelf(managerDirectSupervisorId)) {
        return {
          approvalTargetUid: null,
          approvalTargetName: null,
          approvalLevel: "unknown",
          reason:
            "Atasan langsung tidak valid karena mengarah ke diri sendiri. Hubungi HRD untuk memperbaiki struktur organisasi.",
        };
      }

      return {
        approvalTargetUid: managerDirectSupervisorId,
        approvalTargetName: managerDirectSupervisorName || null,
        approvalLevel: "manager_to_director",
      };
    }

    if (directSupervisorUid) {
      if (invalidSelf(directSupervisorUid)) {
        return {
          approvalTargetUid: null,
          approvalTargetName: null,
          approvalLevel: "unknown",
          reason:
            "Atasan langsung tidak valid karena mengarah ke diri sendiri. Hubungi HRD untuk memperbaiki struktur organisasi.",
        };
      }

      return {
        approvalTargetUid: directSupervisorUid,
        approvalTargetName: directSupervisorName || null,
        approvalLevel: "manager_to_director",
        reason:
          "Fallback ke directSupervisorUid karena struktur organisasi master belum lengkap.",
      };
    }

    return {
      approvalTargetUid: null,
      approvalTargetName: null,
      approvalLevel: "manager_to_director",
      reason:
        "Direktur/Manajemen belum ditentukan. Manager Divisi belum bisa melakukan pengajuan cuti/izin/lembur.",
    };
  }

  if (structuralPosition === "management") {
    if (directSupervisorUid) {
      if (invalidSelf(directSupervisorUid)) {
        return {
          approvalTargetUid: null,
          approvalTargetName: null,
          approvalLevel: "unknown",
          reason:
            "Atasan langsung tidak valid karena mengarah ke diri sendiri. Hubungi HRD untuk memperbaiki struktur organisasi.",
        };
      }

      return {
        approvalTargetUid: directSupervisorUid,
        approvalTargetName: directSupervisorName || null,
        approvalLevel: "management_to_hrd",
      };
    }

    return {
      approvalTargetUid: null,
      approvalTargetName: null,
      approvalLevel: "management_to_hrd",
      reason:
        "Jalur approval untuk Direktur/Manajemen belum ditentukan. Hubungi HRD.",
    };
  }

  // Default: staff — try all known manager fields from masterOrganization
  const masterManagerUid =
    masterOrganization?.managerId ||
    masterOrganization?.managerUid ||
    masterOrganization?.supervisorUid ||
    masterOrganization?.directSupervisorUid ||
    null;
  const masterManagerName =
    masterOrganization?.managerName ||
    masterOrganization?.supervisorName ||
    masterOrganization?.directSupervisorName ||
    null;

  if (masterManagerUid) {
    if (invalidSelf(masterManagerUid)) {
      return {
        approvalTargetUid: null,
        approvalTargetName: null,
        approvalLevel: "unknown",
        reason:
          "Atasan langsung tidak valid karena mengarah ke diri sendiri. Hubungi HRD untuk memperbaiki struktur organisasi.",
      };
    }

    return {
      approvalTargetUid: masterManagerUid,
      approvalTargetName: masterManagerName || null,
      approvalLevel: "staff_to_manager",
    };
  }

  if (directSupervisorUid) {
    if (invalidSelf(directSupervisorUid)) {
      return {
        approvalTargetUid: null,
        approvalTargetName: null,
        approvalLevel: "unknown",
        reason:
          "Atasan langsung tidak valid karena mengarah ke diri sendiri. Hubungi HRD untuk memperbaiki struktur organisasi.",
      };
    }

    return {
      approvalTargetUid: directSupervisorUid,
      approvalTargetName: directSupervisorName || null,
      approvalLevel: "staff_to_manager",
      reason:
        "Fallback ke directSupervisorUid dari employee profile karena master organisasi belum lengkap.",
    };
  }

  return {
    approvalTargetUid: null,
    approvalTargetName: null,
    approvalLevel: "staff_to_manager",
    reason:
      "Atasan langsung belum ditentukan. Hubungi HRD untuk memperbaiki struktur organisasi.",
  };
}

export type DirectManager = {
  uid: string | null;
  name: string | null;
  role?: string | null;
  reason?: string | null;
};

/**
 * Resolve permission manager using prioritized employee profile fields,
 * falling back to division master then resolveApprovalTarget.
 */
export function resolvePermissionManager(
  employeeProfile: EmployeeProfile | null | undefined,
  userProfile: UserProfile | null | undefined,
  masterOrganization?: DivisionMasterOrganization | null,
): DirectManager {
  if (!employeeProfile && !userProfile)
    return { uid: null, name: null, reason: "Employee missing" };

  // Prefer master organization structure (latest org mapping)
  if (masterOrganization && masterOrganization.managerId) {
    return {
      uid: masterOrganization.managerId || null,
      name: masterOrganization.managerName || null,
      role: "division_manager",
    };
  }

  // Candidate fields from profile (fallback)
  const candidates: Array<{
    uid?: string | null;
    name?: string | null;
    role?: string | null;
  }> = [
    {
      uid: employeeProfile?.managerUid || null,
      name: employeeProfile?.managerName || null,
      role: "manager",
    },
    {
      uid: (employeeProfile as any)?.directManagerUid || null,
      name: (employeeProfile as any)?.directManagerName || null,
      role: "manager",
    },
    {
      uid: employeeProfile?.supervisorUid || null,
      name: employeeProfile?.supervisorName || null,
      role: "supervisor",
    },
    {
      uid: (employeeProfile as any)?.reportingToUid || null,
      name: (employeeProfile as any)?.reportingToName || null,
      role: "reporting_to",
    },
    {
      uid: (employeeProfile as any)?.approverUid || null,
      name: (employeeProfile as any)?.approverName || null,
      role: "approver",
    },
  ];

  for (const c of candidates) {
    if (c.uid)
      return { uid: c.uid, name: c.name || null, role: c.role || null };
  }

  // As a last resort, try resolveApprovalTarget
  const resolved = resolveApprovalTarget(
    employeeProfile,
    userProfile,
    masterOrganization,
  );
  if (resolved.approvalTargetUid) {
    return {
      uid: resolved.approvalTargetUid,
      name: resolved.approvalTargetName || null,
      role: resolved.approvalLevel || null,
    };
  }

  return { uid: null, name: null, reason: "Direct manager not found" };
}

/**
 * Return the most appropriate direct manager for an employee based on
 * prioritized fields. Does not fallback to director unless employee is division manager.
 */
export function getDirectManagerForEmployee(
  employeeProfile: EmployeeProfile | null | undefined,
  masterOrganization?: DivisionMasterOrganization | null,
): DirectManager {
  if (!employeeProfile)
    return { uid: null, name: null, reason: "Employee profile missing" };

  const candidates: Array<{
    uid?: string | null;
    name?: string | null;
    role?: string | null;
  }> = [
    {
      uid: employeeProfile.managerUid || null,
      name: employeeProfile.managerName || null,
      role: "manager",
    },
    {
      uid: (employeeProfile as any).directManagerUid || null,
      name: (employeeProfile as any).directManagerName || null,
      role: "manager",
    },
    {
      uid: employeeProfile.supervisorUid || null,
      name: employeeProfile.supervisorName || null,
      role: "supervisor",
    },
    {
      uid: (employeeProfile as any).reportingToUid || null,
      name: (employeeProfile as any).reportingToName || null,
      role: "reporting_to",
    },
    {
      uid: (employeeProfile as any).approverUid || null,
      name: (employeeProfile as any).approverName || null,
      role: "approver",
    },
  ];

  // Prefer explicit profile fields
  for (const c of candidates) {
    if (c.uid)
      return { uid: c.uid, name: c.name || null, role: c.role || null };
  }

  // Fallback to division master/manager from masterOrganization
  if (masterOrganization?.managerId) {
    return {
      uid: masterOrganization.managerId || null,
      name: masterOrganization.managerName || null,
      role: "division_manager",
    };
  }

  // If employee is division manager, try to return managerDirectSupervisor
  if ((employeeProfile as any).isDivisionManager) {
    if (masterOrganization?.managerDirectSupervisorId) {
      return {
        uid: masterOrganization.managerDirectSupervisorId || null,
        name: masterOrganization.managerDirectSupervisorName || null,
        role: "director",
      };
    }
  }

  return { uid: null, name: null, reason: "Direct manager not found" };
}
