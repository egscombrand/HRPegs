import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Cached Google Drive client (per cold-start)
let driveClient: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (driveClient) return driveClient;
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) return null;
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  if (!fileId || fileId === "undefined" || fileId === "null") {
    return new NextResponse("Invalid fileId", { status: 400 });
  }

  const drive = getDriveClient();
  if (!drive) {
    return new NextResponse("Google Drive credentials not configured", { status: 500 });
  }

  try {
    // Get file metadata for mimeType
    const meta = await drive.files.get({
      fileId,
      fields: "mimeType,name",
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType || "application/octet-stream";
    const fileName = meta.data.name || "file";

    // Download file content
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=43200",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error(`[/api/google-drive/file/${fileId}] Error:`, err.message);
    if (err.code === 404 || err.status === 404) {
      return new NextResponse("File not found", { status: 404 });
    }
    return new NextResponse("Failed to fetch file", { status: 500 });
  }
}
