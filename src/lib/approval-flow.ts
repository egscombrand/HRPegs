import type { EmployeeProfile, UserProfile } from "@/lib/types";

export type ApprovalLevel =
  | "staff_to_manager"
  | "manager_to_director"
  | "management_to_hrd"
  | "unknown";

export type DivisionMasterOrganization = {
  managerId?: string | null;
  managerName?: string | null;
  managerDirectSupervisorId?: string | null;
  managerDirectSupervisorName?: string | null;
  managerDirectSupervisorTitle?: string | null;
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
      masterOrganization?.managerDirectSupervisorId || null;
    const managerDirectSupervisorName =
      masterOrganization?.managerDirectSupervisorName || null;

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

  // Default: staff
  const managerId = masterOrganization?.managerId || null;
  const managerName = masterOrganization?.managerName || null;

  if (managerId) {
    if (invalidSelf(managerId)) {
      return {
        approvalTargetUid: null,
        approvalTargetName: null,
        approvalLevel: "unknown",
        reason:
          "Atasan langsung tidak valid karena mengarah ke diri sendiri. Hubungi HRD untuk memperbaiki struktur organisasi.",
      };
    }

    return {
      approvalTargetUid: managerId,
      approvalTargetName: managerName || null,
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
        "Fallback ke directSupervisorUid karena master organisasi belum lengkap.",
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
