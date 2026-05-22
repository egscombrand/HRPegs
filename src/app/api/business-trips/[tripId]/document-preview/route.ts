import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import admin from "@/lib/firebase/admin";

const AUTH_ROLES = [
  "super-admin",
  "superadmin",
  "admin",
  "administrator",
  "hrd",
  "manager",
  "director",
  "management",
];

function getTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cookieToken =
    req.cookies.get("firebase-token")?.value ||
    req.cookies.get("__session")?.value;
  return authHeader?.replace("Bearer ", "") || cookieToken || null;
}

function normalizeRole(role: unknown): string {
  if (!role) return "";
  return String(role).toLowerCase();
}

function parseGoogleDriveFileId(url?: string | null): string | null {
  if (!url) return null;
  const normalized = url.trim();
  const patterns = [/[-\w]{25,}/, /file\/d\/([\w-]+)/, /id=([\w-]+)/];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
}

async function isAuthorizedToView(tripId: string, uid: string) {
  const missionDoc = await admin
    .firestore()
    .collection("business_trip_missions")
    .doc(tripId)
    .get();

  if (!missionDoc.exists) return false;

  const mission = missionDoc.data() as any;
  if (!mission) return false;

  // 1. Check assignedByUid
  if (mission.assignedByUid === uid) return true;

  // 2. Check approvalTargetUids
  if (Array.isArray(mission.approvalTargetUids) && mission.approvalTargetUids.includes(uid)) return true;

  // 3. Check managerUids
  if (Array.isArray(mission.managerUids) && mission.managerUids.includes(uid)) return true;

  // 4. Check Roles (HRD, Super Admin, Management/Direktur)
  const userDoc = await admin.firestore().collection("users").doc(uid).get();
  const userData = userDoc.data();
  const userRole = normalizeRole(
    userData?.role || userData?.roles?.[0],
  );
  if (AUTH_ROLES.some((role) => userRole.includes(role))) return true;
  if (userData?.isDivisionManager) return true;

  // 5. Check if member (employee or manager) in subcollection
  const membersRef = admin
    .firestore()
    .collection("business_trip_missions")
    .doc(tripId)
    .collection("members");

  const [employeeSnap, managerSnap] = await Promise.all([
    membersRef.where("employeeUid", "==", uid).limit(1).get(),
    membersRef.where("managerUid", "==", uid).limit(1).get(),
  ]);

  if (!employeeSnap.empty || !managerSnap.empty) return true;

  return false;
}

export async function GET(
  req: NextRequest,
  context: { params: { tripId: string } },
) {
  try {
    const { tripId } = context.params;
    if (!tripId) {
      return new NextResponse("Missing tripId parameter", { status: 400 });
    }

    const token = getTokenFromRequest(req);
    if (!token) {
      return new NextResponse("Unauthorized. Please login to HRP.", {
        status: 401,
      });
    }

    let uid: string | null = null;
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return new NextResponse("Unauthorized. Invalid login token.", {
        status: 401,
      });
    }

    const missionDoc = await admin
      .firestore()
      .collection("business_trip_missions")
      .doc(tripId)
      .get();

    if (!missionDoc.exists) {
      return new NextResponse("Perjalanan dinas tidak ditemukan.", {
        status: 404,
      });
    }

    if (!(await isAuthorizedToView(tripId, uid))) {
      return new NextResponse("Forbidden. Anda tidak memiliki akses.", {
        status: 403,
      });
    }

    const mission = missionDoc.data() as any;
    const manualLink =
      mission.googleDriveLink?.trim() ||
      mission.assignmentLetterDriveUrl?.trim() ||
      mission.assignmentLetterUrl?.trim() ||
      "";

    const fileId =
      mission.assignmentLetterDriveFileId ||
      parseGoogleDriveFileId(mission.assignmentLetterDriveUrl) ||
      parseGoogleDriveFileId(mission.assignmentLetterUrl) ||
      parseGoogleDriveFileId(mission.googleDriveLink);

    if (!fileId) {
      if (manualLink) {
        const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Pratinjau Dokumen SPD</title></head><body style="font-family:system-ui,sans-serif;padding:24px;line-height:1.6;color:#111"><h1>Pratinjau Dokumen SPD</h1><p>Dokumen ini menggunakan link Google Drive manual.</p><p style="color:#92400e;font-weight:600;">Pastikan link Google Drive dapat diakses oleh akun HRP lain.</p><p><a href="${manualLink}" target="_blank" rel="noreferrer">Buka Link Google Drive Manual</a></p></body></html>`;
        return new NextResponse(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      return new NextResponse(
        "Tidak ada file Google Drive yang dapat dipreview.",
        {
          status: 404,
        },
      );
    }

    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

    if (!clientEmail || !privateKeyRaw) {
      return new NextResponse("Server storage credentials not configured", {
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

    const fileMeta = await drive.files.get({
      fileId,
      fields: "mimeType,name,size",
      supportsAllDrives: true,
    });

    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const mimeType = fileMeta.data.mimeType || "application/octet-stream";
    const fileName = fileMeta.data.name || "dokumen";

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=1800",
      },
    });
  } catch (error: any) {
    console.error(
      "[/api/business-trips/[tripId]/document-preview]",
      error?.message || error,
    );
    return new NextResponse("Gagal memuat dokumen SPD.", { status: 500 });
  }
}
