import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  type StorageError 
} from "firebase/storage";
import { toast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

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
      message: "Ukuran file terlalu besar. Maksimal 1 MB." 
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

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Resize if wider than 800px
        const MAX_WIDTH = 800;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to blob with quality 0.75
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg", // Convert to JPEG for better compression
                lastModified: Date.now(),
              });
              
              // If compressed file is larger than original, return original
              if (compressedFile.size >= file.size) {
                resolve(file);
              } else {
                resolve(compressedFile);
              }
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
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
