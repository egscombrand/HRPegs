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
 * 1. super-admin / hrd / manager roles
 * 2. Structural level: director / direktur / direksi / management / manajemen
 * 3. employeeProfile.isDivisionManager === true
 * 4. employeeProfile.isDirectSupervisor === true
 * 5. employeeProfile.reviewerForInterns === true
 *
 * NOTE: stale userProfile.managedDivision / managedBrandId strings are intentionally
 * NOT used here — they are not maintained and grant unintended access.
 */
export function canUserReview(
  user: UserProfile | null,
  employeeProfile?: EmployeeProfile | null,
): boolean {
  if (!user) return false;
  if (!user.isActive) return false;

  // 1. Role-based — always authoritative
  if (['super-admin', 'hrd', 'manager'].includes(user.role)) return true;

  // 2. Structural level (from employeeProfile first, then userProfile fallback)
  const structural = (
    (employeeProfile as any)?.structuralLevel ||
    (user as any)?.structuralLevel ||
    ''
  ).toLowerCase();
  if (/director|direktur|direksi|management|manajemen/.test(structural)) return true;

  // 3. Explicit reviewer flags from employeeProfile (authoritative, not stale)
  if ((employeeProfile as any)?.isDivisionManager === true) return true;
  if ((employeeProfile as any)?.isDirectSupervisor === true) return true;
  if ((employeeProfile as any)?.reviewerForInterns === true) return true;

  // 4. userProfile.isDivisionManager as secondary check (kept for backwards-compat)
  if (user.isDivisionManager === true) return true;

  return false;
}

