import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import {
  validateStorageFile,
  compressImage,
  processPDF,
} from "@/lib/storage-utils";
import { serverTimestamp } from "firebase/firestore";

export type StorageProvider =
  | "firebaseStorage"
  | "googleDrive"
  | "googleDriveAppsScript";

export type StorageCategory =
  | "profile_photo"
  | "ktp"
  | "npwp"
  | "bpjs"
  | "bank_proof"
  | "cv"
  | "ijazah"
  | "sertifikat"
  | "user_document"
  | "employee_document"
  | "offering"
  | "job_offering"
  | "signed_offering"
  | "offering_template"
  | "job_cover"
  | "change_request_supporting"
  | "overtime"
  | "leave"
  | "permission"
  | "logo"
  | "section_asset";

export interface UploadOptions {
  compress?: boolean;
  category?: StorageCategory;
  ownerUid?: string;
  applicationId?: string;
  offeringId?: string;
  brandId?: string;
}

export interface UploadResult {
  storageProvider: StorageProvider;
  fileId?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  filePath?: string;
  driveFolderId?: string;
  driveFolderPath?: string;
  downloadUrl?: string;
  viewUrl?: string;
  webViewLink?: string;
  googleDriveWebViewLink?: string;
  thumbnailUrl?: string;
  directViewUrl?: string;
  uploadedAt: any;
  uploadedBy: string;
  originalFileName?: string;
  originalSize?: number;
  finalSize?: number;
}

const STORAGE_PROVIDER = (process.env.NEXT_PUBLIC_STORAGE_PROVIDER ||
  "firebaseStorage") as StorageProvider;

/**
 * Global upload function that handles Firebase, Google Drive API, and Apps Script.
 */
export async function uploadFile(
  file: File,
  path: string,
  userId: string,
  options: UploadOptions = { compress: true },
): Promise<UploadResult> {
  const originalSize = file.size;
  const originalFileName = file.name;

  // 1. Validation (Max 10MB)
  const validation = validateStorageFile(file);
  if (!validation.isValid) {
    throw new Error(validation.message || "File tidak valid");
  }

  // 2. Processing (Silent Compression/Rebuild)
  let processedFile = file;
  if (options.compress !== false && file.type.startsWith("image/")) {
    processedFile = await compressImage(file);
    if (processedFile.size > 1 * 1024 * 1024) {
      throw new Error("File terlalu besar.");
    }
  } else if (file.type === "application/pdf") {
    processedFile = await processPDF(file);
    if (processedFile.size > 2 * 1024 * 1024) {
      throw new Error(
        "File terlalu besar. Maksimal ukuran file PDF adalah 2 MB.",
      );
    }
  }

  // 3. Choose Provider
  let result: UploadResult;
  if (
    STORAGE_PROVIDER === "googleDrive" ||
    STORAGE_PROVIDER === "googleDriveAppsScript"
  ) {
    result = await uploadToGoogleDrive(processedFile, userId, options);
  } else {
    result = await uploadToFirebase(processedFile, path, userId);
  }

  result.originalFileName = originalFileName;
  result.originalSize = originalSize;
  result.finalSize = processedFile.size;

  // Normalize Google Drive image URL for webViewLink if available
  if (result.webViewLink) {
    const { normalizeGoogleDriveImageUrl } =
      await import("@/lib/profile-photo");
    result.thumbnailUrl = normalizeGoogleDriveImageUrl(result.webViewLink);
    result.googleDriveWebViewLink = result.webViewLink;
  }

  if (!result.viewUrl) {
    if (
      (result.storageProvider === "googleDrive" ||
        result.storageProvider === "googleDriveAppsScript") &&
      result.fileId
    ) {
      result.viewUrl = `/api/storage/view?fileId=${result.fileId}`;
    } else if (result.downloadUrl) {
      result.viewUrl = result.downloadUrl;
    }
  }

  return result;
}

/**
 * Uploads file to Firebase Storage (Legacy/Primary)
 */
async function uploadToFirebase(
  file: File,
  path: string,
  userId: string,
): Promise<UploadResult> {
  const storage = getStorage();
  const storageRef = ref(storage, path);
  const uploadTask = await uploadBytesResumable(storageRef, file);
  const downloadUrl = await getDownloadURL(uploadTask.ref);

  return {
    storageProvider: "firebaseStorage",
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    filePath: path,
    downloadUrl,
    uploadedAt: serverTimestamp(),
    uploadedBy: userId,
  };
}

/**
 * Uploads file to Google Drive via server-side API route.
 * Handles both Service Account and Apps Script modes based on server env.
 */
async function uploadToGoogleDrive(
  file: File,
  userId: string,
  options: UploadOptions,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);

  if (options.category) formData.append("category", options.category);
  if (options.ownerUid) formData.append("ownerUid", options.ownerUid);
  if (options.applicationId)
    formData.append("applicationId", options.applicationId);
  if (options.offeringId) formData.append("offeringId", options.offeringId);
  if (options.brandId) formData.append("brandId", options.brandId);

  const response = await fetch("/api/storage/google-drive-upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    let errorMessage =
      data?.message ||
      data?.error ||
      data?.details ||
      "Gagal upload ke Google Drive";

    // Add missing ENV details if provided
    if (data?.missingEnv && Array.isArray(data.missingEnv)) {
      errorMessage += ` (Missing ENV: ${data.missingEnv.join(", ")})`;
    }

    throw new Error(errorMessage);
  }

  return {
    storageProvider: data.storageProvider || STORAGE_PROVIDER,
    fileId: data.fileId,
    fileName: data.fileName,
    fileSize: data.fileSize,
    fileType: data.fileType,
    driveFolderId: data.driveFolderId,
    driveFolderPath: data.driveFolderPath,
    webViewLink: data.webViewLink,
    uploadedAt: data.uploadedAt || new Date().toISOString(),
    uploadedBy: data.uploadedBy,
  };
}
