import { extractFileIdFromUrl } from "./candidate-docs-utils";

export function resolveMetadataFileId(fileObj: any): string | null {
  if (!fileObj) return null;
  if (typeof fileObj === "string") {
    return extractFileIdFromUrl(fileObj);
  }
  if (typeof fileObj === "object") {
    if (fileObj.fileId) return fileObj.fileId;
    if (fileObj.id) return fileObj.id;
    if (fileObj.viewUrl) return extractFileIdFromUrl(fileObj.viewUrl);
    if (fileObj.directViewUrl) return extractFileIdFromUrl(fileObj.directViewUrl);
    if (fileObj.url) return extractFileIdFromUrl(fileObj.url);
  }
  return null;
}

export function getEmployeeDocumentFileIds(profile: any) {
  if (!profile) {
    return {
      profilePhotoFileId: null,
      ktpPhotoFileId: null,
      npwpFileId: null,
      bpjsKesehatanFileId: null,
      bpjsKetenagakerjaanFileId: null,
      simFileId: null,
      bankProofFileId: null,
      kkFileId: null,
      ijazahTerakhirFileId: null,
    };
  }

  return {
    profilePhotoFileId: resolveMetadataFileId(profile.dataDiriIdentitas?.profilePhotoFile) || resolveMetadataFileId(profile.dataDiriIdentitas?.profilePhotoUrl) || resolveMetadataFileId(profile.profilePhotoFile) || resolveMetadataFileId(profile.profilePhotoUrl),
    ktpPhotoFileId: resolveMetadataFileId(profile.dataDiriIdentitas?.ktpPhotoFile) || resolveMetadataFileId(profile.dataDiriIdentitas?.ktpPhotoUrl) || resolveMetadataFileId(profile.ktpPhotoFile) || resolveMetadataFileId(profile.ktpPhotoUrl),
    npwpFileId: resolveMetadataFileId(profile.dokumenAdministratif?.npwpFile) || resolveMetadataFileId(profile.dokumenAdministratif?.npwpPhotoUrl) || resolveMetadataFileId(profile.npwpFile) || resolveMetadataFileId(profile.npwpPhotoUrl),
    bpjsKesehatanFileId: resolveMetadataFileId(profile.dokumenAdministratif?.bpjsKesehatanFile) || resolveMetadataFileId(profile.dokumenAdministratif?.bpjsKesehatanPhotoUrl) || resolveMetadataFileId(profile.bpjsKesehatanFile) || resolveMetadataFileId(profile.bpjsKesehatanPhotoUrl),
    bpjsKetenagakerjaanFileId: resolveMetadataFileId(profile.dokumenAdministratif?.bpjsKetenagakerjaanFile) || resolveMetadataFileId(profile.dokumenAdministratif?.bpjsKetenagakerjaanPhotoUrl) || resolveMetadataFileId(profile.bpjsKetenagakerjaanFile) || resolveMetadataFileId(profile.bpjsKetenagakerjaanPhotoUrl),
    simFileId: resolveMetadataFileId(profile.dokumenAdministratif?.simFile) || resolveMetadataFileId(profile.dokumenAdministratif?.simUrl) || resolveMetadataFileId(profile.simFile) || resolveMetadataFileId(profile.simUrl),
    bankProofFileId: resolveMetadataFileId(profile.dataRekening?.bankProofFile) || resolveMetadataFileId(profile.dataRekening?.bankDocumentUrl) || resolveMetadataFileId(profile.dataRekening?.buktiRekeningUrl) || resolveMetadataFileId(profile.bankProofFile) || resolveMetadataFileId(profile.buktiRekeningUrl),
    kkFileId: resolveMetadataFileId(profile.dataKeluarga?.kkFile) || resolveMetadataFileId(profile.dataKeluarga?.kkUrl) || resolveMetadataFileId(profile.kkFile) || resolveMetadataFileId(profile.kkUrl),
    ijazahTerakhirFileId: resolveMetadataFileId(profile.pendidikanDanPengembangan?.ijazahTerakhirFile) || resolveMetadataFileId(profile.pendidikanDanPengembangan?.pendidikanTerakhir?.ijazahUrl) || resolveMetadataFileId(profile.ijazahTerakhirFile) || resolveMetadataFileId(profile.ijazahUrl),
  };
}

/**
 * Robustly resolves document URLs from various potential paths in the employee profile.
 * Handles legacy fields, nested objects, and different naming conventions.
 */
function resolveMetadataFileUrl(fileObj: any): string | null {
  if (!fileObj || typeof fileObj !== "object") return null;
  if (fileObj.viewUrl) return fileObj.viewUrl;
  if (fileObj.storageProvider === "google_drive" && fileObj.fileId) {
    return `/api/storage/view?fileId=${fileObj.fileId}`;
  }
  if (fileObj.directViewUrl) return fileObj.directViewUrl;
  if (fileObj.url && typeof fileObj.url === "string") {
    return fileObj.url;
  }
  return null;
}

export function getEmployeeDocumentUrls(profile: any) {
  if (!profile)
    return {
      profilePhotoUrl: null,
      ktpPhotoUrl: null,
      ijazahUrl: null,
      npwpUrl: null,
      bpjsKesehatanUrl: null,
      bpjsKetenagakerjaanUrl: null,
      bankProofUrl: null,
    };

  const resolve = (paths: string[]) => {
    for (const path of paths) {
      const fileKey = path.replace(/Url$/, "File");
      if (fileKey !== path) {
        const fileObj = fileKey
          .split(".")
          .reduce((obj, key) => obj?.[key], profile);
        const metadataUrl = resolveMetadataFileUrl(fileObj);
        if (metadataUrl) return metadataUrl;
      }
    }

    for (const path of paths) {
      const value = path.split(".").reduce((obj, key) => obj?.[key], profile);
      if (value && typeof value === "object") {
        const metadataUrl = resolveMetadataFileUrl(value);
        if (metadataUrl) return metadataUrl;
      }
      if (
        value &&
        typeof value === "string" &&
        (value.startsWith("http") ||
          value.startsWith("https") ||
          value.startsWith("/api/storage/view"))
      ) {
        return value;
      }
    }
    return null;
  };

  return {
    profilePhotoUrl: resolve([
      "dataDiriIdentitas.profilePhotoUrl",
      "dataDiriIdentitas.profilePhotoFile",
      "profilePhotoUrl",
      "profilePhotoFile",
      "documents.profilePhotoUrl",
    ]),
    ktpPhotoUrl: resolve([
      "dataDiriIdentitas.ktpPhotoUrl",
      "dataDiriIdentitas.ktpPhotoFile",
      "ktpPhotoUrl",
      "dokumenAdministratif.ktpPhotoUrl",
      "documents.ktpUrl",
    ]),
    ijazahUrl: resolve([
      "dokumenAdministratif.ijazahUrl",
      "employeeDocuments.ijazahUrl",
      "pendidikanDanPengembangan.pendidikanTerakhir.ijazahUrl",
      "documents.ijazahUrl",
      "ijazahUrl",
    ]),
    npwpUrl: resolve([
      "dokumenAdministratif.npwpPhotoUrl",
      "npwpPhotoUrl",
      "documents.npwpUrl",
    ]),
    bpjsKesehatanUrl: resolve([
      "dokumenAdministratif.bpjsKesehatanPhotoUrl",
      "bpjsKesehatanPhotoUrl",
      "documents.bpjsKesUrl",
    ]),
    bpjsKetenagakerjaanUrl: resolve([
      "dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl",
      "bpjsKetenagakerjaanPhotoUrl",
      "documents.bpjsKetUrl",
    ]),
    bankProofUrl: resolve([
      "dataRekening.bankDocumentUrl",
      "dataRekening.buktiRekeningUrl",
      "dataRekening.photoUrl",
      "dataRekening.proofUrl",
      "dataRekening.bankBookPhotoUrl",
      "rekening.buktiRekeningUrl",
      "rekening.photoUrl",
      "rekening.bankBookPhotoUrl",
      "bankAccount.proofUrl",
      "documents.rekeningUrl",
      "employeeDocuments.rekeningUrl",
      "dokumenAdministratif.rekeningUrl",
    ]),
  };
}

/**
 * Helper to determine the status of a document (NPWP/BPJS) based on fields and URL.
 */
export function getDocumentStatus(
  fieldValue: string | null | undefined,
  hasField: boolean | undefined,
  url: string | null | undefined,
  verificationStatus?: string,
) {
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
  return (
    item.ijazahUrl ||
    item.ijazahFileUrl ||
    item.fileUrl ||
    item.buktiUrl ||
    null
  );
}

/**
 * Resolves the document URL for a certification item.
 */
export function getCertificationDocumentUrl(item: any): string | null {
  if (!item) return null;
  return (
    item.buktiUrl ||
    item.fileUrl ||
    item.certificateUrl ||
    item.ijazahUrl ||
    null
  );
}
