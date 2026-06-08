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
  | "section_asset"
  | "business_trip_spd";

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
  accessMode?: "anyone_with_link" | "internal_viewer";
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

  // 3. Choose Provider - NO FALLBACK TO FIREBASE
  let result: UploadResult;
  if (
    STORAGE_PROVIDER === "googleDrive" ||
    STORAGE_PROVIDER === "googleDriveAppsScript"
  ) {
    // STRICT: No fallback to Firebase Storage
    result = await uploadToGoogleDrive(processedFile, userId, options);
  } else if (STORAGE_PROVIDER === "firebaseStorage") {
    result = await uploadToFirebase(processedFile, path, userId);
  } else {
    throw new Error(
      `Storage provider tidak dikenal: ${STORAGE_PROVIDER}. Gunakan 'googleDrive', 'googleDriveAppsScript', atau 'firebaseStorage'.`,
    );
  }

  result.originalFileName = originalFileName;
  result.originalSize = originalSize;
  result.finalSize = processedFile.size;

  // Normalize Google Drive image URL for webViewLink if available
  if (result.webViewLink) {
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

export async function uploadFileToGoogleDrive(
  file: File,
  userId: string,
  options: UploadOptions = {},
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

  try {
    const response = await fetch("/api/storage/google-drive-upload", {
      method: "POST",
      body: formData,
    });

    // attempt to parse JSON body, but fall back to text when JSON parse fails
    let data: any = null;
    try {
      data = await response.json();
    } catch (err) {
      // ignore JSON parse error
      data = null;
    }

    if (!response.ok || !data?.success) {
      // try to read raw body text for more details
      let bodyText: string | null = null;
      try {
        bodyText = await response.text();
      } catch (e) {
        bodyText = null;
      }

      let message =
        data?.message ||
        data?.error ||
        data?.details ||
        `Gagal upload file ke Google Drive. ${bodyText ? `Response: ${bodyText}` : ""}`;

      if (data?.missingEnv && Array.isArray(data.missingEnv)) {
        message += ` (Missing ENV: ${data.missingEnv.join(", ")})`;
      }

      throw new Error(message);
    }

    return {
      storageProvider: data.storageProvider || "googleDrive",
      fileId: data.fileId,
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileType: data.fileType,
      driveFolderId: data.driveFolderId,
      driveFolderPath: data.driveFolderPath,
      downloadUrl: data.downloadUrl,
      viewUrl: data.viewUrl,
      webViewLink: data.webViewLink,
      googleDriveWebViewLink: data.googleDriveWebViewLink,
      directViewUrl: data.directViewUrl,
      thumbnailUrl: data.thumbnailUrl,
      accessMode: data.accessMode,
      uploadedAt: data.uploadedAt,
      uploadedBy: data.uploadedBy,
    };
  } catch (err: any) {
    // Network or unexpected error
    const message =
      err?.message || "Network error saat mengupload ke Google Drive";
    throw new Error(message);
  }
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

  try {
    const response = await fetch("/api/storage/google-drive-upload", {
      method: "POST",
      body: formData,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      let bodyText: string | null = null;
      try {
        bodyText = await response.text();
      } catch (e) {
        bodyText = null;
      }

      let errorMessage =
        data?.message ||
        data?.error ||
        data?.details ||
        `Gagal upload ke Google Drive. ${bodyText ? `Response: ${bodyText}` : ""}`;

      if (data?.missingEnv && Array.isArray(data.missingEnv)) {
        errorMessage += ` (Missing ENV: ${data.missingEnv.join(", ")})`;
      }

      // Clear error message - NO fallback to Firebase Storage
      throw new Error(
        `Upload Google Drive gagal. Periksa konfigurasi Google Drive Apps Script. Detail: ${errorMessage}`,
      );
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
  } catch (err: any) {
    // NO fallback - throw error as-is
    const message =
      err?.message || "Network error saat mengupload ke Google Drive";
    throw new Error(
      `Upload Google Drive gagal. Periksa konfigurasi Google Drive Apps Script. Detail: ${message}`,
    );
  }
}
