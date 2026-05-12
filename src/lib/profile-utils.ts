import { User as FirebaseAuthUser } from "firebase/auth";
import { UserProfile, EmployeeProfile } from "./types";
import { resolveProfilePhotoUrl } from "./profile-photo";

/**
 * Normalizes the employee profile photo URL from various potential sources.
 * Uses the centralized resolveProfilePhotoUrl helper for consistency.
 */
export function getEmployeePhotoUrl(
  employeeProfile?: EmployeeProfile | null,
  userProfile?: UserProfile | null,
  authUser?: FirebaseAuthUser | null
): string {
  return resolveProfilePhotoUrl(employeeProfile, userProfile, authUser);
}
