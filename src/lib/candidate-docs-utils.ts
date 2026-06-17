import { getAuth } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";

/**
 * Extract fileId from Google Drive URLs:
 * - https://drive.google.com/file/d/FILEID/view
 * - /api/storage/view?fileId=FILEID
 * - Other patterns
 */
export function extractFileIdFromUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;

  // Pattern 1: /api/storage/view?fileId=FILEID
  const apiMatch = url.match(/fileId=([a-zA-Z0-9_-]+)/);
  if (apiMatch?.[1]) {
    return apiMatch[1].trim();
  }

  // Pattern 1b: /api/storage/view?field=FILEID
  const fieldMatch = url.match(/field=([a-zA-Z0-9_-]+)/);
  if (fieldMatch?.[1]) {
    return fieldMatch[1].trim();
  }

  // Pattern 2: drive.google.com/file/d/FILEID/view
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)\//);
  if (driveMatch?.[1]) {
    return driveMatch[1].trim();
  }

  // Pattern 3: id=FILEID
  const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) {
    return idMatch[1].trim();
  }

  return null;
}

/**
 * Open secure file with Firebase authentication.
 * Fetches from /api/storage/view with Bearer token.
 * Used for candidate documents and employee documents.
 *
 * Accepts a fileId string or a file metadata object with one of:
 * fileId, driveFileId, secureFileId, or a URL containing fileId.
 */
export async function openSecureFile(
  fileIdOrMeta:
    | string
    | null
    | undefined
    | {
        fileId?: string;
        driveFileId?: string;
        secureFileId?: string;
        fileUrl?: string;
        downloadUrl?: string;
        url?: string;
      },
  fileName?: string,
): Promise<void> {
  // Resolve fileId from various input shapes
  let fileId: string | null | undefined;
  if (!fileIdOrMeta) {
    fileId = null;
  } else if (typeof fileIdOrMeta === "string") {
    // If the string looks like a URL, extract fileId from it; otherwise use it directly
    fileId = fileIdOrMeta.includes("/") || fileIdOrMeta.includes("?")
      ? extractFileIdFromUrl(fileIdOrMeta)
      : fileIdOrMeta;
  } else {
    fileId =
      fileIdOrMeta.fileId ||
      fileIdOrMeta.driveFileId ||
      fileIdOrMeta.secureFileId ||
      extractFileIdFromUrl(fileIdOrMeta.fileUrl) ||
      extractFileIdFromUrl(fileIdOrMeta.downloadUrl) ||
      extractFileIdFromUrl(fileIdOrMeta.url) ||
      null;
  }
  if (!fileId) {
    throw new Error("FileId tidak ditemukan untuk dokumen ini.");
  }

  // Open a blank window IMMEDIATELY before any async await calls
  // This satisfies browser's requirement for user-triggered gestures
  const newWindow = window.open("", "_blank");
  if (newWindow) {
    newWindow.document.title = "Memuat Dokumen...";
  }

  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      if (newWindow) newWindow.close();
      throw new Error("Autentikasi tidak ditemukan. Silakan login kembali.");
    }

    const token = await currentUser.getIdToken();
    const response = await fetch(`/api/storage/view?fileId=${fileId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (newWindow) newWindow.close();
      let errorMessage = "Gagal memuat dokumen";

      if (response.status === 401) {
        errorMessage =
          "Sesi telah berakhir. Silakan login kembali untuk melihat dokumen.";
      } else if (response.status === 403) {
        errorMessage =
          "File sertifikat belum tersimpan. Klik Simpan & Lanjut terlebih dahulu agar file terdaftar ke akun Anda.";
      } else if (response.status === 404) {
        errorMessage =
          "Dokumen tidak ditemukan. File mungkin telah dihapus atau fileId tidak valid.";
      } else if (response.status >= 500) {
        errorMessage =
          "Server penyimpanan sedang bermasalah. Silakan coba lagi nanti.";
      }

      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    if (newWindow) {
      newWindow.location.href = blobUrl;
    } else {
      // Fallback if the initial window was somehow blocked or closed
      const fallbackWin = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!fallbackWin) {
        URL.revokeObjectURL(blobUrl);
        throw new Error("Popup diblokir browser. Izinkan popup untuk melihat dokumen.");
      }
    }

    // Cleanup object URL after a longer delay (60s) to allow browser to load the preview
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (error: any) {
    if (newWindow && !newWindow.closed) newWindow.close();
    console.error("openSecureFile error:", error);
    throw error;
  }
}
