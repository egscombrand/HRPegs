import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  type StorageError 
} from "firebase/storage";
import { toast } from "@/hooks/use-toast";

import imageCompression from 'browser-image-compression';
import { PDFDocument } from 'pdf-lib';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface StorageValidationResult {
  isValid: boolean;
  message?: string;
  file?: File;
}

/**
 * Validates a file before uploading to Firebase Storage.
 * Ensures file exists, is not empty, and is within the 1MB limit.
 */
export function validateStorageFile(file: File): StorageValidationResult {
  if (!file) {
    return { isValid: false, message: "File tidak boleh kosong." };
  }

  if (file.size === 0) {
    return { isValid: false, message: "File kosong tidak dapat diunggah." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { 
      isValid: false, 
      message: "Ukuran file terlalu besar. Maksimal 10 MB." 
    };
  }

  return { isValid: true, file };
}

/**
 * Compresses an image file before upload.
 * Max width 800px, quality 0.7-0.8.
 */
export async function compressImage(file: File): Promise<File> {
  // If not an image, return as is
  if (!file.type.startsWith("image/")) return file;
  
  // If it's a GIF, don't compress as it might lose animation
  if (file.type === "image/gif") return file;

  // Only compress if > 1MB
  if (file.size <= 1024 * 1024) {
    return file;
  }

  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/webp"
  };

  try {
    const compressedFile = await imageCompression(file, options);
    const newName = file.name.replace(/\.[^/.]+$/, ".webp");
    return new File([compressedFile], newName, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("Image process error:", error);
    return file;
  }
}

/**
 * Attempts to rebuild PDF to strip unnecessary metadata and optimize size without degrading quality.
 */
export async function processPDF(file: File): Promise<File> {
  if (file.type !== "application/pdf") return file;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    
    const processedFile = new File([pdfBytes as any], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });
    
    return processedFile.size < file.size ? processedFile : file;
  } catch (error) {
    console.error("PDF process error:", error);
    return file;
  }
}

/**
 * Handles Firebase Storage errors gracefully.
 */
export function handleStorageError(error: any) {
  console.error("Firebase Storage Error:", error);
  
  const storageError = error as StorageError;
  
  if (storageError.code === "storage/quota-exceeded") {
    toast({
      variant: "destructive",
      title: "Penyimpanan Penuh",
      description: "Penyimpanan file sedang penuh. Silakan hubungi admin untuk membersihkan storage atau menambah kapasitas.",
    });
    return;
  }

  toast({
    variant: "destructive",
    title: "Gagal Mengunggah",
    description: "Terjadi kesalahan saat mengunggah file. Silakan coba lagi.",
  });
}

/**
 * Deletes a file from storage if the path exists.
 */
export async function safeDeleteObject(path: string) {
  if (!path) return;
  try {
    const storage = getStorage();
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.warn("Failed to delete old object:", path, error);
    // Non-blocking, don't show toast as it's just cleanup
  }
}
