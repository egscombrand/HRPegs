import { checkLeaveEligibility } from './leave-utils';
import { UserProfile, EmployeeProfile } from './types';

/**
 * Helper to check if a user is eligible for leave (Cuti).
 * Pass employeeProfile so hrdEmploymentInfo (contractType, duration etc.) is read.
 */
export function isActiveEmployeeEligibleForLeave(
  user: UserProfile | null,
  profile?: EmployeeProfile | null
): { 
  isEligible: boolean; 
  reason?: string;
  debugInfo?: any;
} {
  const result = checkLeaveEligibility(user, profile);
  return {
    isEligible: result.isEligible,
    reason: result.reason,
    debugInfo: { allowance: result.allowance }
  };
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

