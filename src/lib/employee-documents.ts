import type { EmployeeProfile } from "./types";

/**
 * Robustly resolves document URLs from various potential paths in the employee profile.
 * Handles legacy fields, nested objects, and different naming conventions.
 */
export function getEmployeeDocumentUrls(profile: any) {
  if (!profile) return {
    profilePhotoUrl: null,
    ktpPhotoUrl: null,
    ijazahUrl: null,
    npwpUrl: null,
    bpjsKesehatanUrl: null,
    bpjsKetenagakerjaanUrl: null,
    bankProofUrl: null
  };

  const resolve = (paths: string[]) => {
    for (const path of paths) {
      const value = path.split('.').reduce((obj, key) => obj?.[key], profile);
      if (value && typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'))) {
        return value;
      }
    }
    return null;
  };

  return {
    profilePhotoUrl: resolve([
      'dataDiriIdentitas.profilePhotoUrl',
      'profilePhotoUrl',
      'photoUrl'
    ]),
    ktpPhotoUrl: resolve([
      'dataDiriIdentitas.ktpPhotoUrl',
      'ktpPhotoUrl',
      'dokumenAdministratif.ktpPhotoUrl',
      'documents.ktpUrl'
    ]),
    ijazahUrl: resolve([
      'dokumenAdministratif.ijazahUrl',
      'employeeDocuments.ijazahUrl',
      'pendidikanDanPengembangan.pendidikanTerakhir.ijazahUrl',
      'documents.ijazahUrl',
      'ijazahUrl'
    ]),
    npwpUrl: resolve([
      'dokumenAdministratif.npwpPhotoUrl',
      'npwpPhotoUrl',
      'documents.npwpUrl'
    ]),
    bpjsKesehatanUrl: resolve([
      'dokumenAdministratif.bpjsKesehatanPhotoUrl',
      'bpjsKesehatanPhotoUrl',
      'documents.bpjsKesUrl'
    ]),
    bpjsKetenagakerjaanUrl: resolve([
      'dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl',
      'bpjsKetenagakerjaanPhotoUrl',
      'documents.bpjsKetUrl'
    ]),
    bankProofUrl: resolve([
      'dataRekening.bankDocumentUrl',
      'dataRekening.buktiRekeningUrl',
      'dataRekening.photoUrl',
      'dataRekening.proofUrl',
      'dataRekening.bankBookPhotoUrl',
      'rekening.buktiRekeningUrl',
      'rekening.photoUrl',
      'rekening.bankBookPhotoUrl',
      'bankAccount.proofUrl',
      'documents.rekeningUrl',
      'employeeDocuments.rekeningUrl',
      'dokumenAdministratif.rekeningUrl'
    ])
  };
}

/**
 * Helper to determine the status of a document (NPWP/BPJS) based on fields and URL.
 */
export function getDocumentStatus(fieldValue: string | null | undefined, hasField: boolean | undefined, url: string | null | undefined, verificationStatus?: string) {
  if (hasField === false) return "Tidak Punya";
  if (url) {
    if (verificationStatus === "valid") return "Valid";
    if (verificationStatus === "perlu_verifikasi") return "Perlu Verifikasi";
    return "Sudah Upload";
  }
  if (fieldValue && fieldValue.trim().length > 0) return "Belum Upload Bukti";
  return "Belum Upload";
}

/**
 * Resolves the document URL for an education item.
 */
export function getEducationDocumentUrl(item: any): string | null {
  if (!item) return null;
  return item.ijazahUrl || item.ijazahFileUrl || item.fileUrl || item.buktiUrl || null;
}

/**
 * Resolves the document URL for a certification item.
 */
export function getCertificationDocumentUrl(item: any): string | null {
  if (!item) return null;
  return item.buktiUrl || item.fileUrl || item.certificateUrl || item.ijazahUrl || null;
}
