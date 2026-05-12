import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

// Max file size: 1 MB
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/**
 * Helper to find or create a folder in Google Drive
 */
async function getOrCreateFolder(
  drive: drive_v3.Drive,
  parentId: string,
  folderName: string
): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`;
  
  const response = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
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
  });

  return createResponse.data.id!;
}

/**
 * Resolves the final folder ID based on category and options
 */
async function resolveDrivePath(
  drive: drive_v3.Drive,
  rootId: string,
  category: string,
  options: { ownerUid?: string; applicationId?: string; brandId?: string }
): Promise<{ folderId: string; folderPath: string }> {
  let pathSegments: string[] = [];

  switch (category) {
    case "profile_photo":
    case "ktp":
    case "npwp":
    case "bpjs":
    case "bank_proof":
      if (!options.ownerUid) throw new Error("ownerUid is required for employee profiles");
      pathSegments = ["employee_profiles", options.ownerUid, category];
      break;

    case "cv":
    case "ijazah":
    case "sertifikat":
      if (!options.ownerUid) throw new Error("ownerUid is required for candidate docs");
      pathSegments = ["candidate_docs", options.ownerUid, category];
      break;

    case "offering":
      if (!options.applicationId) throw new Error("applicationId is required for offerings");
      pathSegments = ["offerings", options.applicationId];
      break;

    case "offering_template":
      if (!options.brandId) throw new Error("brandId is required for offering templates");
      pathSegments = ["offering_templates", options.brandId];
      break;

    case "overtime":
      if (!options.ownerUid) throw new Error("ownerUid is required for overtime");
      pathSegments = ["overtime_attachments", options.ownerUid];
      break;

    case "leave":
      if (!options.ownerUid) throw new Error("ownerUid is required for leave");
      pathSegments = ["leave_attachments", options.ownerUid];
      break;

    case "permission":
      if (!options.ownerUid) throw new Error("ownerUid is required for permission");
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
    folderPath: pathSegments.join("/") 
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;
    
    // Stage 2 fields
    const category = formData.get("category") as string;
    const ownerUid = formData.get("ownerUid") as string;
    const applicationId = formData.get("applicationId") as string;
    const brandId = formData.get("brandId") as string;

    if (!file) {
      return NextResponse.json({ message: "File tidak ditemukan" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "Ukuran file melebihi 1 MB" }, { status: 400 });
    }

    // Google Drive Authentication
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

    // Debugging environment variables
    if (!clientEmail || !privateKeyRaw || !rootFolderId) {
      const missing = [];
      if (!clientEmail) missing.push("GOOGLE_DRIVE_CLIENT_EMAIL");
      if (!privateKeyRaw) missing.push("GOOGLE_DRIVE_PRIVATE_KEY");
      if (!rootFolderId) missing.push("GOOGLE_DRIVE_ROOT_FOLDER_ID");
      
      console.error(`Missing Google Drive environment variables: ${missing.join(", ")}`);
      return NextResponse.json({ 
        message: "Konfigurasi storage server bermasalah", 
        error: `Missing: ${missing.join(", ")}`
      }, { status: 500 });
    }

    // Process private key for multiline support
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Resolve target folder (Stage 2)
    let targetFolderId = rootFolderId;
    let driveFolderPath = "/";
    
    try {
      if (category) {
        const resolved = await resolveDrivePath(drive, rootFolderId, category, {
          ownerUid,
          applicationId,
          brandId,
        });
        targetFolderId = resolved.folderId;
        driveFolderPath = resolved.folderPath;
      }
    } catch (err: any) {
      console.error("Folder resolution error:", err);
      return NextResponse.json({ 
        message: `Gagal memproses folder tujuan: ${err.message}`,
        details: "Pastikan Folder ID di ENV benar dan Service Account memiliki akses 'Editor'."
      }, { status: 400 });
    }

    // Convert File to Buffer then to Readable Stream
    const buffer = Buffer.from(await file.arrayBuffer());
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    const driveResponse = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [targetFolderId],
      },
      media: {
        mimeType: file.type,
        body: bufferStream,
      },
      fields: "id, name, size, mimeType, webViewLink",
    });

    const driveFile = driveResponse.data;

    return NextResponse.json({
      fileId: driveFile.id,
      fileName: driveFile.name,
      fileSize: parseInt(driveFile.size || "0"),
      fileType: driveFile.mimeType,
      driveFolderId: targetFolderId,
      driveFolderPath: driveFolderPath,
      webViewLink: driveFile.webViewLink,
      uploadedBy: userId,
    });

  } catch (error: any) {
    console.error("Google Drive Upload Error:", error);
    
    let message = "Terjadi kesalahan server saat upload";
    let status = 500;

    if (error.message?.includes("invalid_grant")) {
      message = "Google Auth Failed: Credential atau Private Key tidak valid";
    } else if (error.message?.includes("access_denied") || error.code === 403) {
      message = "Google Drive Access Denied: Service Account tidak memiliki izin ke folder ini";
    } else if (error.message?.includes("File not found") || error.code === 404) {
      message = "Google Drive Error: Root folder ID tidak ditemukan atau tidak valid";
    } else if (error.code === 'ENOTFOUND') {
      message = "Network Error: Tidak dapat menghubungi server Google API";
    }

    return NextResponse.json(
      { message, error: error.message },
      { status: status }
    );
  }
}
