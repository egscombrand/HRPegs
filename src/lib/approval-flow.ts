import type { EmployeeProfile, UserProfile } from "@/lib/types";

// Helper to detect management/director level
export const isManagementLevel = (value?: string | null): boolean => {
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.includes("direksi") ||
    normalized.includes("direktur") ||
    normalized.includes("director") ||
    normalized.includes("manajemen") ||
    normalized.includes("management")
  );
};

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

  // HRD as requester: approval must NOT go to HRD themselves.
  // Route to directSupervisorUid → managerUid (from master) → directorUid → null.
  const requesterRole = userProfile?.role || "";
  if (requesterRole === "hrd") {
    const supervisorCandidates = [
      masterOrganization?.directSupervisorUid,
      masterOrganization?.managerId,
      masterOrganization?.managerUid,
      masterOrganization?.directorUid,
      directSupervisorUid,
    ].filter(Boolean) as string[];

    for (const uid of supervisorCandidates) {
      if (uid && uid !== employeeUid) {
        const name =
          masterOrganization?.directSupervisorName ||
          masterOrganization?.managerName ||
          masterOrganization?.directorName ||
          directSupervisorName ||
          null;
        return {
          approvalTargetUid: uid,
          approvalTargetName: name,
          approvalLevel: "management_to_hrd",
        };
      }
    }

    return {
      approvalTargetUid: null,
      approvalTargetName: null,
      approvalLevel: "management_to_hrd",
      reason:
        "Atasan HRD belum ditentukan. Hubungi Direktur atau Super Admin untuk mengatur struktur organisasi HRD.",
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
  // Also check brand-level manager stored on brand doc (for brands without divisions)
  const brandManagerUid = (masterOrganization as any)?.brandManagerId || null;
  const brandManagerName = (masterOrganization as any)?.brandManagerName || null;

  const masterManagerUid =
    masterOrganization?.managerId ||
    masterOrganization?.managerUid ||
    masterOrganization?.supervisorUid ||
    masterOrganization?.directSupervisorUid ||
    brandManagerUid ||
    null;
  const masterManagerName =
    masterOrganization?.managerName ||
    masterOrganization?.supervisorName ||
    masterOrganization?.directSupervisorName ||
    brandManagerName ||
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
  const masterMgrUid = masterOrganization?.managerId || (masterOrganization as any)?.brandManagerId || null;
  const masterMgrName = masterOrganization?.managerName || (masterOrganization as any)?.brandManagerName || null;
  if (masterOrganization && masterMgrUid) {
    return {
      uid: masterMgrUid,
      name: masterMgrName || null,
      role: masterOrganization.managerId ? "division_manager" : "brand_manager",
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

/**
 * Resolve approver for permission request, skipping self-approval.
 * If the direct manager would be the applicant themselves, escalates to next level.
 *
 * Flow:
 * - Staff → Manager Divisi → HRD
 * - Manager Divisi → Direktur/Manajemen → HRD
 * - Direktur/Manajemen → HRD
 */
export function resolveApproverSkippingSelf(
  applicantUid: string | null | undefined,
  employeeProfile: EmployeeProfile | null | undefined,
  userProfile: UserProfile | null | undefined,
  masterOrganization?: DivisionMasterOrganization | null,
  allUsers?: Array<any> | null,
): DirectManager {
  if (!applicantUid || (!employeeProfile && !userProfile)) {
    return { uid: null, name: null, reason: "Applicant or profile missing" };
  }

  const structuralPosition =
    (employeeProfile as any)?.structuralPosition ||
    (employeeProfile as any)?.hrdEmploymentInfo?.structuralPosition ||
    userProfile?.structuralLevel ||
    (employeeProfile?.isDivisionManager || userProfile?.isDivisionManager
      ? "division_manager"
      : "staff");

  // HRD as requester: skip self-approval by routing to supervisor/director
  if (userProfile?.role === "hrd") {
    const directSupervisorUid =
      (employeeProfile as any)?.directSupervisorUid ||
      (employeeProfile as any)?.supervisorUid ||
      masterOrganization?.directSupervisorUid ||
      masterOrganization?.directorUid ||
      null;
    const directSupervisorName =
      (employeeProfile as any)?.directSupervisorName ||
      (employeeProfile as any)?.supervisorName ||
      masterOrganization?.directSupervisorName ||
      masterOrganization?.directorName ||
      null;

    if (directSupervisorUid && directSupervisorUid !== applicantUid) {
      return { uid: directSupervisorUid, name: directSupervisorName, role: "director" };
    }

    // Fallback to any director in allUsers
    const director = allUsers?.find(
      (u: any) =>
        u.structuralLevel === "management" ||
        u.role === "manager" ||
        u.role === "super-admin",
    );
    if (director && director.uid !== applicantUid) {
      return {
        uid: director.uid,
        name: director.fullName || director.displayName || null,
        role: "director",
        reason: "Fallback ke Direktur/Super Admin karena atasan HRD belum dikonfigurasi.",
      };
    }

    return {
      uid: null,
      name: null,
      reason:
        "Atasan HRD belum ditentukan. Hubungi Direktur atau Super Admin.",
    };
  }

  // For management-level users: route directly to HRD, no division/manager search
  if (isManagementLevel(structuralPosition)) {
    // Try to find HRD user first
    const hrdUser = allUsers?.find(
      (u: any) => u.role === "hrd" || u.roles?.includes("hrd"),
    );
    if (hrdUser && hrdUser.uid !== applicantUid) {
      return {
        uid: hrdUser.uid,
        name: hrdUser.fullName || hrdUser.displayName || null,
        role: "hrd",
      };
    }

    // Fallback to Super Admin if no HRD found
    const superAdmin = allUsers?.find(
      (u: any) => u.role === "super-admin",
    );
    if (superAdmin && superAdmin.uid !== applicantUid) {
      return {
        uid: superAdmin.uid,
        name: superAdmin.fullName || superAdmin.displayName || null,
        role: "super-admin",
        reason: "Management level: routed to Super Admin (no HRD available)",
      };
    }

    // No HRD or Super Admin found
    return {
      uid: null,
      name: null,
      reason: "Tidak ada HRD atau Super Admin yang tersedia untuk persetujuan. Hubungi administrator.",
    };
  }

  // Get the initial direct manager for non-management staff
  const initialManager = getDirectManagerForEmployee(employeeProfile, masterOrganization);

  // If no manager found, return null
  if (!initialManager.uid) {
    return initialManager;
  }

  // Check for self-approval
  if (initialManager.uid === applicantUid) {
    // Applicant is their own manager, escalate to next level

    if (structuralPosition === "division_manager") {
      // Manager Divisi → Direktur/Manajemen
      const nextLevelUid =
        masterOrganization?.managerDirectSupervisorId ||
        masterOrganization?.managerDirectSupervisorUid ||
        masterOrganization?.directorUid ||
        (employeeProfile as any)?.directSupervisorUid ||
        null;
      const nextLevelName =
        masterOrganization?.managerDirectSupervisorName ||
        masterOrganization?.directorName ||
        (employeeProfile as any)?.directSupervisorName ||
        null;

      if (nextLevelUid && nextLevelUid !== applicantUid) {
        return {
          uid: nextLevelUid,
          name: nextLevelName || null,
          role: "director",
          reason: "Escalated from division manager to director to avoid self-approval",
        };
      }

      // No director found, return error
      return {
        uid: null,
        name: null,
        reason: "Atasan level berikutnya belum ditemukan. Periksa Struktur Organisasi untuk Direktur/Manajemen.",
      };
    }

    if (structuralPosition === "management") {
      // Direktur/Manajemen → HRD
      const directSupervisorUid =
        (employeeProfile as any)?.directSupervisorUid ||
        (employeeProfile as any)?.supervisorUid ||
        null;

      if (directSupervisorUid && directSupervisorUid !== applicantUid) {
        return {
          uid: directSupervisorUid,
          name: (employeeProfile as any)?.directSupervisorName || null,
          role: "hrd",
          reason: "Escalated from management to HRD to avoid self-approval",
        };
      }

      // Try to find HRD user
      const hrdUser = allUsers?.find(
        (u: any) => u.role === "hrd" || u.roles?.includes("hrd"),
      );
      if (hrdUser && hrdUser.uid !== applicantUid) {
        return {
          uid: hrdUser.uid,
          name: hrdUser.fullName || hrdUser.displayName || null,
          role: "hrd",
          reason: "Escalated to HRD as no direct supervisor found",
        };
      }

      return {
        uid: null,
        name: null,
        reason: "Atasan level berikutnya belum ditemukan. Periksa Struktur Organisasi atau hubungi HRD.",
      };
    }

    // For staff, this shouldn't happen normally, but handle it
    return {
      uid: null,
      name: null,
      reason: "Atasan langsung tidak dapat ditentukan dengan jelas. Hubungi HRD.",
    };
  }

  // Normal case: approver is different from applicant
  return initialManager;
}
