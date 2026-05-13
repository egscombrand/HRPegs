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
 */
export async function openSecureFile(
  fileId: string | null | undefined,
  fileName?: string,
): Promise<void> {
  if (!fileId) {
    throw new Error("FileId tidak ditemukan untuk dokumen ini.");
  }

  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("Autentikasi tidak ditemukan. Silakan login kembali.");
    }

    const token = await currentUser.getIdToken();
    const response = await fetch(`/api/storage/view?fileId=${fileId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      let errorMessage = "Gagal memuat dokumen";

      if (response.status === 401) {
        errorMessage =
          "Sesi telah berakhir. Silakan login kembali untuk melihat dokumen.";
      } else if (response.status === 403) {
        errorMessage =
          "Anda tidak memiliki akses untuk melihat dokumen ini. Hubungi administrator.";
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
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noreferrer noopener";

    if (fileName) {
      link.download = fileName;
    }

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Cleanup object URL after a delay
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (error: any) {
    console.error("openSecureFile error:", error);
    throw error;
  }
}
