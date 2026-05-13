import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import admin from "@/lib/firebase/admin";

/**
 * GET /api/storage/view?fileId={fileId}
 * 
 * Proxies Google Drive files through the server so users can view
 * private Drive files without needing the Drive owner's Google account.
 * 
 * Access control:
 * - User must be authenticated (Firebase ID token in cookie/header)
 * - Super Admin / HRD can view all documents
 * - Regular employees can only view their own documents
 */
export async function GET(req: NextRequest) {
  try {
    const fileId = req.nextUrl.searchParams.get("fileId");
    if (!fileId) {
      return new NextResponse("Missing fileId parameter", { status: 400 });
    }

    // --- AUTH: Verify user is logged into HRP ---
    let uid: string | null = null;
    let userRole: string | null = null;

    const authHeader = req.headers.get("authorization");
    const cookieToken = req.cookies.get("firebase-token")?.value 
      || req.cookies.get("__session")?.value;
    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (token) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        // Token invalid/expired
      }
    }

    if (!uid) {
      return new NextResponse("Unauthorized. Please login to HRP.", { status: 401 });
    }

    // --- ROLE CHECK: Get user role from Firestore ---
    try {
      const userDoc = await admin.firestore().collection("users").doc(uid).get();
      const userData = userDoc.data();
      userRole = userData?.role || userData?.roles?.[0] || "employee";
    } catch {
      userRole = "employee";
    }

    const isPrivileged = userRole === "Super Admin" 
      || userRole === "superadmin"
      || userRole === "HRD" 
      || userRole === "hrd"
      || userRole === "admin";

    // For non-privileged users, verify they own the file
    if (!isPrivileged) {
      try {
        // Check if this fileId belongs to the user's employee_profiles
        const profileDoc = await admin.firestore()
          .collection("employee_profiles")
          .doc(uid)
          .get();
        const profileData = profileDoc.data();
        
        if (profileData) {
          const profileJson = JSON.stringify(profileData);
          if (!profileJson.includes(fileId)) {
            return new NextResponse("Forbidden. You don't have access to this file.", { status: 403 });
          }
        } else {
          return new NextResponse("Forbidden. Profile not found.", { status: 403 });
        }
      } catch {
        return new NextResponse("Forbidden. Access check failed.", { status: 403 });
      }
    }

    // --- FETCH FILE FROM GOOGLE DRIVE ---
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

    if (!clientEmail || !privateKeyRaw) {
      return new NextResponse("Server storage credentials not configured", { status: 500 });
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Get file metadata
    const fileMeta = await drive.files.get({
      fileId,
      fields: "mimeType, name, size",
      supportsAllDrives: true,
    });

    const mimeType = fileMeta.data.mimeType || "application/octet-stream";

    // Download file content
    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${fileMeta.data.name || "file"}"`,
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=1800",
        "X-Content-Type-Options": "nosniff",
      },
    });

  } catch (error: any) {
    console.error("[/api/storage/view] Error:", error.message);
    if (error.code === 404) {
      return new NextResponse("File not found", { status: 404 });
    }
    return new NextResponse("Failed to fetch file", { status: 500 });
  }
}
