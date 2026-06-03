import { Profile, EmployeeProfile } from "./types";

/**
 * Normalizes a Google Drive URL to a direct image thumbnail URL.
 * Converts: https://drive.google.com/file/d/{fileId}/view
 * To: https://drive.google.com/thumbnail?id={fileId}&sz=w512
 */
export function normalizeGoogleDriveImageUrl(
  url: string | null | undefined,
): string {
  if (!url) return "";

  // If it's already a direct link or thumbnail, return as is
  if (
    url.includes("drive.google.com/thumbnail") ||
    url.includes("drive.google.com/uc?")
  ) {
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
export function resolveProfilePhotoUrl(
  profile: any,
  userProfile?: any,
  authUser?: any,
): string {
  if (!profile && !userProfile && !authUser) return "";

  const file = profile?.profilePhoto || profile?.profilePhotoFile;
  if (file?.viewUrl) return file.viewUrl;
  if (file?.fileId) return `/api/storage/view?fileId=${file.fileId}`;
  if (file?.thumbnailUrl) return file.thumbnailUrl;
  if (file?.directViewUrl) return file.directViewUrl;

  // 3 & 4: Nested profile metadata fields (prioritized for Drive URLs)
  const dataDiri = profile?.dataDiriIdentitas;
  if (dataDiri?.profilePhotoUrl)
    return normalizeGoogleDriveImageUrl(dataDiri.profilePhotoUrl);
  if (dataDiri?.photoUrl)
    return normalizeGoogleDriveImageUrl(dataDiri.photoUrl);

  // 5 & 6: Root level fields on employee_profiles
  if (profile?.profilePhotoUrl)
    return normalizeGoogleDriveImageUrl(profile.profilePhotoUrl);
  if (profile?.photoUrl) return normalizeGoogleDriveImageUrl(profile.photoUrl);

  // 7. Try from userProfile (sync source from Firestore users collection)
  if (userProfile?.photoUrl)
    return normalizeGoogleDriveImageUrl(userProfile.photoUrl);
  if (userProfile?.photoURL)
    return normalizeGoogleDriveImageUrl(userProfile.photoURL);

  // 8. Try from Firebase Auth
  if (authUser?.photoURL)
    return normalizeGoogleDriveImageUrl(authUser.photoURL);

  // 9. Generic candidate photo field (from applications)
  if (profile?.candidatePhotoUrl)
    return normalizeGoogleDriveImageUrl(profile.candidatePhotoUrl);

  return "";
}

/**
 * Extracts fileId from various field formats and attachment objects.
 * Handles: driveFileId, fileId, googleDriveFileId, id, and viewUrl
 */
export function extractFileId(
  attachment: any
): string | null {
  if (!attachment) return null;

  // If it's a string URL, try to extract fileId
  if (typeof attachment === "string") {
    // Try to extract from URL format (e.g., /api/storage/view?fileId=...)
    const urlParams = new URL(attachment, "http://localhost").searchParams;
    const fileIdFromUrl = urlParams.get("fileId");
    if (fileIdFromUrl) return fileIdFromUrl;

    // Try to extract from Google Drive URL format (/d/{fileId}/view)
    const match = attachment.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return match[1];

    return null;
  }

  // If it's an object, try various field names
  if (typeof attachment === "object") {
    // Priority order: driveFileId > fileId > googleDriveFileId > id
    if (attachment.driveFileId) return attachment.driveFileId;
    if (attachment.fileId) return attachment.fileId;
    if (attachment.googleDriveFileId) return attachment.googleDriveFileId;
    if (attachment.id) return attachment.id;

    // Try to extract from viewUrl field
    if (attachment.viewUrl) {
      const match = attachment.viewUrl.match(/fileId=([a-zA-Z0-9_-]+)/);
      if (match?.[1]) return match[1];

      const match2 = attachment.viewUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match2?.[1]) return match2[1];
    }

    // Try to extract from webViewLink
    if (attachment.webViewLink) {
      const match = attachment.webViewLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match?.[1]) return match[1];
    }
  }

  return null;
}

/**
 * Gets the preview URL for a document based on fileId and file type.
 * Uses internal HRP preview endpoint instead of Google Drive direct links.
 */
export function getDocumentPreviewUrl(
  fileId: string | null | undefined,
  fileType?: string
): string {
  if (!fileId) return "";

  // For images, use preview endpoint
  if (fileType?.startsWith("image/")) {
    return `/api/storage/google-drive-preview?fileId=${fileId}&type=image`;
  }

  // For PDFs, use preview endpoint
  if (fileType === "application/pdf" || fileType?.includes("pdf")) {
    return `/api/storage/google-drive-preview?fileId=${fileId}&type=pdf`;
  }

  // Default: use google-drive-preview endpoint
  return `/api/storage/google-drive-preview?fileId=${fileId}`;
}
