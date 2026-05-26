import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: NextRequest) {
  try {
    const fileId = req.nextUrl.searchParams.get("fileId");
    const download = req.nextUrl.searchParams.get("download");

    if (!fileId) {
      return new NextResponse("Missing fileId", { status: 400 });
    }

    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

    if (!clientEmail || !privateKeyRaw) {
      return new NextResponse("Server credentials not configured", {
        status: 500,
      });
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Try to get the file metadata for mimeType and name
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: "mimeType, size, name",
      supportsAllDrives: true,
    });

    const mimeType = fileMetadata.data.mimeType || "application/octet-stream";
    const fileName = fileMetadata.data.name || "document";

    const response = await drive.files.get(
      { fileId: fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200",
    };

    // Add Content-Disposition header for download requests
    if (download === "true") {
      headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    }

    return new NextResponse(buffer as any, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("Google Drive Preview API Error:", error.message);
    return new NextResponse("Failed to fetch file", { status: 500 });
  }
}
