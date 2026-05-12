import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from "firebase/storage";
import { validateStorageFile, compressImage } from "@/lib/storage-utils";
import { serverTimestamp } from "firebase/firestore";

export type StorageProvider = "firebaseStorage" | "googleDrive" | "googleDriveAppsScript";

export type StorageCategory = 
  | "profile_photo" | "ktp" | "npwp" | "bpjs" | "bank_proof"
  | "cv" | "ijazah" | "sertifikat"
  | "offering" | "offering_template"
  | "overtime" | "leave" | "permission"
  | "logo" | "section_asset";

export interface UploadOptions {
  compress?: boolean;
  category?: StorageCategory;
  ownerUid?: string;
  applicationId?: string;
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
  webViewLink?: string;
  uploadedAt: any;
  uploadedBy: string;
}

const STORAGE_PROVIDER = (process.env.NEXT_PUBLIC_STORAGE_PROVIDER || "firebaseStorage") as StorageProvider;

/**
 * Global upload function that handles Firebase, Google Drive API, and Apps Script.
 */
export async function uploadFile(
  file: File, 
  path: string, 
  userId: string,
  options: UploadOptions = { compress: true }
): Promise<UploadResult> {
  // 1. Validation (Max 1MB)
  const validation = validateStorageFile(file);
  if (!validation.isValid) {
    throw new Error(validation.message || "File tidak valid");
  }

  // 2. Compression (if enabled)
  let processedFile = file;
  if (options.compress !== false && file.type.startsWith('image/')) {
    processedFile = await compressImage(file);
  }

  // 3. Choose Provider
  if (STORAGE_PROVIDER === "googleDrive" || STORAGE_PROVIDER === "googleDriveAppsScript") {
    return uploadToGoogleDrive(processedFile, userId, options);
  } else {
    return uploadToFirebase(processedFile, path, userId);
  }
}

/**
 * Uploads file to Firebase Storage (Legacy/Primary)
 */
async function uploadToFirebase(file: File, path: string, userId: string): Promise<UploadResult> {
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
  options: UploadOptions
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);
  
  if (options.category) formData.append("category", options.category);
  if (options.ownerUid) formData.append("ownerUid", options.ownerUid);
  if (options.applicationId) formData.append("applicationId", options.applicationId);
  if (options.brandId) formData.append("brandId", options.brandId);

  const response = await fetch("/api/storage/google-drive-upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    let errorMessage = data?.message || data?.error || data?.details || "Gagal upload ke Google Drive";
    
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
