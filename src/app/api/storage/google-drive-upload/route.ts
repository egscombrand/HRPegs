import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

// Max file size: 1 MB
const MAX_FILE_SIZE = 1 * 1024 * 1024;
const DRIVE_ACCESS_MODE =
  (process.env.GOOGLE_DRIVE_ACCESS_MODE as
    | "anyone_with_link"
    | "internal_viewer") || "anyone_with_link";
const DRIVE_INTERNAL_DOMAIN = process.env.GOOGLE_DRIVE_INTERNAL_DOMAIN || "";

/**
 * Helper to find or create a folder in Google Drive (Service Account Mode)
 */
async function getOrCreateFolder(
  drive: drive_v3.Drive,
  parentId: string,
  folderName: string,
): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`;

  const response = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const folders = response.data.files;
  if (folders && folders.length > 0) {
    return folders[0].id!;
  }

  const createResponse = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return createResponse.data.id!;
}

/**
 * Resolves the final folder ID based on category and options (Service Account Mode)
 */
async function resolveDrivePath(
  drive: drive_v3.Drive,
  rootId: string,
  category: string,
  options: { ownerUid?: string; applicationId?: string; brandId?: string },
): Promise<{ folderId: string; folderPath: string }> {
  let pathSegments: string[] = [];

  switch (category) {
    case "profile_photo":
    case "ktp":
    case "npwp":
    case "bpjs":
    case "bank_proof":
      if (!options.ownerUid)
        throw new Error("ownerUid is required for employee profiles");
      pathSegments = ["employee_profiles", options.ownerUid, category];
      break;

    case "cv":
    case "ijazah":
    case "sertifikat":
      if (!options.ownerUid)
        throw new Error("ownerUid is required for candidate docs");
      pathSegments = ["candidate_docs", options.ownerUid, category];
      break;

    case "offering":
      if (!options.applicationId)
        throw new Error("applicationId is required for offerings");
      pathSegments = ["offerings", options.applicationId];
      break;

    case "offering_template":
      if (!options.brandId)
        throw new Error("brandId is required for offering templates");
      pathSegments = ["offering_templates", options.brandId];
      break;

    case "business_trip_spd":
      pathSegments = ["business_trip_spd"];
      break;

    case "overtime":
      if (!options.ownerUid)
        throw new Error("ownerUid is required for overtime");
      pathSegments = ["overtime_attachments", options.ownerUid];
      break;

    case "leave":
      if (!options.ownerUid) throw new Error("ownerUid is required for leave");
      pathSegments = ["leave_attachments", options.ownerUid];
      break;

    case "permission":
      if (!options.ownerUid)
        throw new Error("ownerUid is required for permission");
      pathSegments = ["permission_attachments", options.ownerUid];
      break;

    case "logo":
      pathSegments = ["ecosystem_assets", "logos"];
      break;

    case "section_asset":
      pathSegments = ["ecosystem_assets", "sections"];
      break;

    default:
      // Default to root if no category
      return { folderId: rootId, folderPath: "/" };
  }

  let currentParentId = rootId;
  for (const segment of pathSegments) {
    currentParentId = await getOrCreateFolder(drive, currentParentId, segment);
  }

  return {
    folderId: currentParentId,
    folderPath: pathSegments.join("/"),
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;

    const category = (formData.get("category") as string) || "";
    const ownerUid = (formData.get("ownerUid") as string) || "";
    const applicationId = (formData.get("applicationId") as string) || "";
    const offeringId = (formData.get("offeringId") as string) || "";
    const brandId = (formData.get("brandId") as string) || "";

    if (!file) {
      return NextResponse.json(
        { success: false, message: "File tidak ditemukan" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: "Ukuran file terlalu besar. Maksimal 1 MB.",
        },
        { status: 400 },
      );
    }

    const storageProvider = process.env.STORAGE_PROVIDER || "firebaseStorage";

    // --- CASE A: Google Drive Apps Script Mode (Bridge Account) ---
    if (storageProvider === "googleDriveAppsScript") {
      const appsScriptUrl = process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL;
      const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
      const uploadSecret = process.env.GOOGLE_DRIVE_UPLOAD_SECRET;

      // Tugas 2: Validasi URL Apps Script
      if (!appsScriptUrl || appsScriptUrl.includes("ISI_WEB_APP_URL")) {
        return NextResponse.json(
          {
            success: false,
            message:
              "GOOGLE_DRIVE_APPS_SCRIPT_URL belum diisi dengan Web app URL Apps Script.",
          },
          { status: 500 },
        );
      }

      if (
        !appsScriptUrl.startsWith("https://script.google.com/macros/s/") ||
        !appsScriptUrl.endsWith("/exec")
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "GOOGLE_DRIVE_APPS_SCRIPT_URL harus Web app URL Apps Script yang berakhir /exec.",
          },
          { status: 500 },
        );
      }

      if (!uploadSecret || uploadSecret.includes("ISI_SECRET")) {
        return NextResponse.json(
          {
            success: false,
            message:
              "GOOGLE_DRIVE_UPLOAD_SECRET belum diganti dengan secret asli yang sama dengan Code.gs.",
          },
          { status: 500 },
        );
      }

      if (!rootFolderId) {
        return NextResponse.json(
          {
            success: false,
            message: "GOOGLE_DRIVE_ROOT_FOLDER_ID belum diisi.",
          },
          { status: 500 },
        );
      }

      // Convert file to base64 for Apps Script
      const arrayBuffer = await file.arrayBuffer();
      const base64File = Buffer.from(arrayBuffer).toString("base64");

      const appsScriptPayload = {
        secret: uploadSecret,
        fileName: file.name,
        fileType: file.type,
        base64: base64File,
        rootFolderId: rootFolderId,
        category: category,
        ownerUid: ownerUid,
        applicationId: applicationId,
        offeringId: offeringId,
        brandId: brandId,
        uploadedBy: userId,
      };

      const appsScriptResponse = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appsScriptPayload),
      });

      // Tugas 1: Ambil response sebagai text dulu untuk menghindari JSON parse error
      const rawText = await appsScriptResponse.text();
      const contentType = appsScriptResponse.headers.get("content-type") || "";

      // Tugas 3: Log aman server-side
      console.log("Apps Script Upload Debug:", {
        urlStart: appsScriptUrl.slice(0, 50) + "...",
        provider: storageProvider,
        hasSecret: !!uploadSecret,
        status: appsScriptResponse.status,
        contentType,
        rawTextStart: rawText.slice(0, 120).replace(/\n/g, " "),
      });

      // Tugas 1.4: Cek jika response adalah HTML
      if (
        rawText.trim().startsWith("<!DOCTYPE") ||
        rawText.trim().startsWith("<html")
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Apps Script mengembalikan HTML, bukan JSON. Cek Web app URL harus /exec, akses harus Anyone, dan deployment harus Web App.",
            debug: rawText.slice(0, 200),
          },
          { status: 502 },
        ); // Bad Gateway
      }

      let appsScriptData;
      try {
        appsScriptData = JSON.parse(rawText);
      } catch (parseError) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Apps Script mengembalikan format tidak valid (Bukan JSON).",
            rawResponse: rawText.slice(0, 300),
          },
          { status: 502 },
        );
      }

      if (!appsScriptResponse.ok || !appsScriptData.success) {
        let message =
          appsScriptData.message || "Gagal upload via Apps Script bridge";
        if (message.toLowerCase().includes("unauthorized")) {
          message = "Secret upload tidak sesuai dengan Apps Script.";
        }
        return NextResponse.json(
          {
            success: false,
            message,
            error: appsScriptData.error,
          },
          { status: appsScriptResponse.status || 500 },
        );
      }

      return NextResponse.json({
        success: true,
        storageProvider: "googleDriveAppsScript",
        fileId: appsScriptData.fileId,
        fileName: appsScriptData.fileName,
        fileSize: appsScriptData.fileSize || file.size,
        fileType: appsScriptData.fileType || file.type,
        driveFolderId: appsScriptData.driveFolderId,
        driveFolderPath: appsScriptData.driveFolderPath,
        webViewLink: appsScriptData.webViewLink,
        googleDriveWebViewLink: appsScriptData.webViewLink,
        directViewUrl: appsScriptData.directViewUrl,
        viewUrl:
          appsScriptData.webViewLink || appsScriptData.directViewUrl || "",
        thumbnailUrl: appsScriptData.thumbnailUrl,
        accessMode: DRIVE_ACCESS_MODE,
        uploadedAt: appsScriptData.uploadedAt || new Date().toISOString(),
        uploadedBy: userId,
      });
    }

    // --- CASE B: Google Drive Service Account Mode (Legacy/Direct) ---
    if (storageProvider === "googleDrive") {
      const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
      const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

      if (!clientEmail || !privateKeyRaw || !rootFolderId) {
        return NextResponse.json(
          {
            success: false,
            message: "Konfigurasi Service Account belum lengkap",
            missingEnv: [
              !clientEmail && "GOOGLE_DRIVE_CLIENT_EMAIL",
              !privateKeyRaw && "GOOGLE_DRIVE_PRIVATE_KEY",
              !rootFolderId && "GOOGLE_DRIVE_ROOT_FOLDER_ID",
            ].filter(Boolean),
          },
          { status: 500 },
        );
      }

      const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });

      const drive = google.drive({ version: "v3", auth });

      const resolved = await resolveDrivePath(drive, rootFolderId, category, {
        ownerUid,
        applicationId,
        brandId,
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      const bufferStream = new Readable();
      bufferStream.push(buffer);
      bufferStream.push(null);

      const driveResponse = await drive.files.create({
        requestBody: { name: file.name, parents: [resolved.folderId] },
        media: { mimeType: file.type, body: bufferStream },
        fields: "id, name, size, mimeType, webViewLink",
        supportsAllDrives: true,
      });

      const driveFile = driveResponse.data;

      if (!driveFile.id) {
        throw new Error("Google Drive upload gagal: file id tidak ditemukan.");
      }

      if (DRIVE_ACCESS_MODE === "anyone_with_link") {
        await drive.permissions.create({
          fileId: driveFile.id,
          requestBody: { type: "anyone", role: "reader" },
          supportsAllDrives: true,
        });
      } else if (DRIVE_ACCESS_MODE === "internal_viewer") {
        if (!DRIVE_INTERNAL_DOMAIN) {
          throw new Error(
            "GOOGLE_DRIVE_INTERNAL_DOMAIN belum diisi untuk internal_viewer mode.",
          );
        }
        await drive.permissions.create({
          fileId: driveFile.id,
          requestBody: {
            type: "domain",
            role: "reader",
            domain: DRIVE_INTERNAL_DOMAIN,
          },
          supportsAllDrives: true,
        });
      }

      return NextResponse.json({
        success: true,
        storageProvider: "googleDrive",
        fileId: driveFile.id,
        fileName: driveFile.name,
        fileSize: parseInt(driveFile.size || "0"),
        fileType: driveFile.mimeType,
        driveFolderId: resolved.folderId,
        driveFolderPath: resolved.folderPath,
        webViewLink: driveFile.webViewLink,
        googleDriveWebViewLink: driveFile.webViewLink,
        viewUrl: driveFile.webViewLink || "",
        accessMode: DRIVE_ACCESS_MODE,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userId,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: "Storage provider tidak valid atau belum diatur",
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Google Drive API Proxy Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Terjadi kesalahan server saat proxy upload",
      },
      { status: 500 },
    );
  }
}
