import { Profile, EmployeeProfile } from "./types";

/**
 * Normalizes a Google Drive URL to a direct image thumbnail URL.
 * Converts: https://drive.google.com/file/d/{fileId}/view
 * To: https://drive.google.com/thumbnail?id={fileId}&sz=w512
 */
export function normalizeGoogleDriveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  
  // If it's already a direct link or thumbnail, return as is
  if (url.includes("drive.google.com/thumbnail") || url.includes("drive.google.com/uc?")) {
    return url;
  }

  // Extract File ID from webViewLink (e.g., https://drive.google.com/file/d/FILE_ID/view)
  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    const fileId = fileIdMatch[1];
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w512`;
  }

  return url;
}

/**
 * Resolves the profile photo URL based on a strict priority list.
 * 1. profile.profilePhotoFile.thumbnailUrl
 * 2. profile.profilePhotoFile.directViewUrl
 * 3. profile.dataDiriIdentitas.profilePhotoUrl
 * 4. profile.dataDiriIdentitas.photoUrl
 * 5. profile.profilePhotoUrl
 * 6. profile.photoUrl
 * 7. fallback (empty string)
 */
export function resolveProfilePhotoUrl(profile: any, userProfile?: any, authUser?: any): string {
  if (!profile && !userProfile && !authUser) return "";

  // 1 & 2: Drive-specific direct links from employee_profiles
  const file = profile?.profilePhotoFile;
  if (file?.thumbnailUrl) return file.thumbnailUrl;
  if (file?.directViewUrl) return file.directViewUrl;

  // 3 & 4: Nested profile metadata fields (prioritized for Drive URLs)
  const dataDiri = profile?.dataDiriIdentitas;
  if (dataDiri?.profilePhotoUrl) return normalizeGoogleDriveImageUrl(dataDiri.profilePhotoUrl);
  if (dataDiri?.photoUrl) return normalizeGoogleDriveImageUrl(dataDiri.photoUrl);

  // 5 & 6: Root level fields on employee_profiles
  if (profile?.profilePhotoUrl) return normalizeGoogleDriveImageUrl(profile.profilePhotoUrl);
  if (profile?.photoUrl) return normalizeGoogleDriveImageUrl(profile.photoUrl);
  
  // 7. Try from userProfile (sync source from Firestore users collection)
  if (userProfile?.photoUrl) return normalizeGoogleDriveImageUrl(userProfile.photoUrl);
  if (userProfile?.photoURL) return normalizeGoogleDriveImageUrl(userProfile.photoURL);

  // 8. Try from Firebase Auth
  if (authUser?.photoURL) return normalizeGoogleDriveImageUrl(authUser.photoURL);

  // 9. Generic candidate photo field (from applications)
  if (profile?.candidatePhotoUrl) return normalizeGoogleDriveImageUrl(profile.candidatePhotoUrl);

  return "";
}
