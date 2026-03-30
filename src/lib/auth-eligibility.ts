import { differenceInYears } from 'date-fns';
import { UserProfile } from './types';
import { Timestamp } from 'firebase/firestore';

/**
 * Helper to check if a user is eligible for leave (Cuti).
 * 
 * Rules:
 * 1. Must be an active employee (isActive: true).
 * 2. Role must be internal (karyawan, manager, hrd, or super-admin).
 * 3. Employment Type must be 'karyawan' (not intern/training).
 * 4. Employment Stage must be 'active' (not probation/pre-probation).
 * 5. tenure must be at least 1 year (calculated from createdAt or a hire date if available).
 */
export function isActiveEmployeeEligibleForLeave(user: UserProfile | null): { 
  isEligible: boolean; 
  reason?: string;
  debugInfo?: any;
} {
  if (!user) return { isEligible: false, reason: "Sesi tidak valid." };
  
  // 1. Check Active Status
  if (!user.isActive) {
    return { isEligible: false, reason: "Status akun tidak aktif." };
  }

  // 2. Check Role (Candidate cannot access)
  const allowedRoles = ['karyawan', 'manager', 'hrd', 'super-admin'];
  if (!allowedRoles.includes(user.role)) {
    return { isEligible: false, reason: "Peran Anda tidak memiliki akses ke fitur ini." };
  }

  // 3. Check Employment Type (Internship/Training cannot access leave)
  if (user.employmentType && user.employmentType !== 'karyawan') {
    return { isEligible: false, reason: "Fitur cuti hanya untuk karyawan tetap/aktif (bukan magang/training)." };
  }

  // 4. Check Employment Stage (Probation cannot access leave)
  // Even if they are 'karyawan' type, they must be in 'active' stage
  // If stage is missing, we check if it's a legacy account or simply not set (common in initial dev)
  if (user.employmentStage && user.employmentStage !== 'active') {
    const stageDisplay = user.employmentStage === 'probation' ? 'Probation' : 'Pra-Probation / Intern';
    return { isEligible: false, reason: `Status Anda masih dalam masa ${stageDisplay}. Cuti hanya dapat diajukan setelah menjadi karyawan aktif.` };
  }

  // 5. Tenure Check (Minimum 1 Year)
  // [DISABLED TEMPORARILY FOR TESTING/ROLLOUT]
  // In a real production scenario, we calculate tenure from createdAt or hireDate.
  /*
  let joinDate: Date;
  if (user.createdAt instanceof Timestamp) {
    joinDate = user.createdAt.toDate();
  } else if ((user.createdAt as any)?.seconds) {
    joinDate = new Date((user.createdAt as any).seconds * 1000);
  } else if (user.createdAt instanceof Date) {
    joinDate = user.createdAt;
  } else {
    joinDate = new Date(); 
  }

  const tenureYears = differenceInYears(new Date(), joinDate);

  if (tenureYears < 1) {
    return { 
      isEligible: false, 
      reason: "Anda belum mencapai masa kerja minimum 1 tahun untuk mengajukan cuti.",
      debugInfo: { joinDate, tenureYears }
    };
  }
  */

  return { isEligible: true };
}

/**
 * Helper to check if a user has authority to review/approve requests.
 * Used for sidebar visibility and page guards.
 * 
 * Eligible Reviewers:
 * 1. Super Admin
 * 2. HRD
 * 3. Manager (Role-based)
 * 4. Division Manager (Field-based: isDivisionManager === true)
 */
export function canUserReview(user: UserProfile | null): boolean {
  if (!user) return false;
  
  // Must be active to perform reviews
  if (!user.isActive) return false;

  // 1. Check explicit roles that have inherent review power
  const rolesWithReviewAccess = ['super-admin', 'hrd', 'manager'];
  if (rolesWithReviewAccess.includes(user.role)) return true;

  // 2. Check for Division Manager privilege on 'karyawan' role
  // Project logic uses isDivisionManager field (boolean) to identify employee-level reviewers
  if (user.role === 'karyawan' && user.isDivisionManager === true) return true;

  // 3. Optional: Fallback check for managed division fields (security in depth)
  // Only if they actually have content in these strings
  if (user.managedDivision && user.managedDivision.trim() !== "") return true;
  if (user.managedBrandId && user.managedBrandId.length > 0) return true;

  return false;
}

