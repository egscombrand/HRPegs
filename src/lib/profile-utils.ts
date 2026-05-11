import { User as FirebaseAuthUser } from "firebase/auth";
import { UserProfile, EmployeeProfile } from "./types";

/**
 * Normalizes the employee profile photo URL from various potential sources.
 * Priority: 
 * 1. employee_profiles.photoUrl
 * 2. employee_profiles.profilePhotoUrl (legacy/form field)
 * 3. employee_profiles.avatarUrl
 * 4. userProfile.photoURL (Firestore users collection)
 * 5. authUser.photoURL (Firebase Auth)
 */
export function getEmployeePhotoUrl(
  employeeProfile?: EmployeeProfile | null,
  userProfile?: UserProfile | null,
  authUser?: FirebaseAuthUser | null
): string | null {
  // 1. Try from employeeProfile (main source)
  if (employeeProfile) {
    if (employeeProfile.photoUrl) return employeeProfile.photoUrl;
    
    // Check nested identities if they exist
    const iden = (employeeProfile as any).dataDiriIdentitas;
    if (iden?.profilePhotoUrl) return iden.profilePhotoUrl;
    if (iden?.photoUrl) return iden.photoUrl;
    
    if ((employeeProfile as any).profilePhotoUrl) return (employeeProfile as any).profilePhotoUrl;
    if ((employeeProfile as any).avatarUrl) return (employeeProfile as any).avatarUrl;
  }

  // 2. Try from userProfile (sync source)
  if (userProfile?.photoURL) return userProfile.photoURL;

  // 3. Try from authUser
  if (authUser?.photoURL) return authUser.photoURL;

  return null;
}
