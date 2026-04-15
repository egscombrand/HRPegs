import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type {
  JobApplication,
  UserProfile,
  Job,
  Notification,
} from "@/lib/types";

export const runtime = "nodejs";

async function verifyAdmin(req: NextRequest) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { error: "Unauthorized: Missing token.", status: 401 };
  }
  const idToken = authorization.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDocSnapshot = await admin
      .firestore()
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!userDocSnapshot.exists) {
      return { error: "Forbidden: User profile not found.", status: 403 };
    }

    const userDocData = userDocSnapshot.data();
    if (!["super-admin", "hrd"].includes(userDocData?.role)) {
      return { error: "Forbidden.", status: 403 };
    }

    return { uid: decodedToken.uid };
  } catch (error: any) {
    if (
      error.code === "auth/id-token-expired" ||
      error.code === "auth/invalid-id-token"
    ) {
      return {
        error:
          "Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.",
        status: 401,
      };
    }
    console.error("Token verification failed unexpectedly:", error);
    return { error: `Verifikasi token gagal: ${error.message}`, status: 500 };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  try {
    const { userIds }: { userIds: string[] } = await req.json();
    const db = admin.firestore();
    const batch = db.batch();

    // 1. Get the current job data to find out who is already assigned
    const jobRef = db.doc(`jobs/${params.jobId}`);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    const currentJobData = jobSnap.data() as Job;
    const existingUserIds = new Set(currentJobData.assignedUserIds || []);

    // 2. Identify newly added users
    const addedUserIds = userIds.filter((id) => !existingUserIds.has(id));

    // 3. Update the Job document with the new full list
    batch.update(jobRef, {
      assignedUserIds: userIds,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authResult.uid,
    });

    // 4. Create notifications for newly added users
    addedUserIds.forEach((userId) => {
      const notificationRef = db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .doc();
      const notificationData: Omit<Notification, "id" | "createdAt"> & {
        createdAt: FieldValue;
      } = {
        userId: userId,
        type: "recruitment_assignment",
        module: "recruitment",
        title: "Penugasan Tim Rekrutmen",
        message: `Anda telah ditugaskan untuk membantu proses rekrutmen pada lowongan "${currentJobData.position}".`,
        targetType: "job",
        targetId: params.jobId,
        actionUrl: `/admin/recruitment/my-tasks`,
        isRead: false,
        createdBy: authResult.uid!,
        createdAt: FieldValue.serverTimestamp(),
        meta: {
          jobId: params.jobId,
          jobTitle: currentJobData.position,
        },
      };
      batch.set(notificationRef, notificationData);
    });

    // 5. Update all related applications
    const appsQuery = db
      .collection("applications")
      .where("jobId", "==", params.jobId);
    const appsSnap = await appsQuery.get();

    const newPanelistIds = new Set(userIds);

    appsSnap.forEach((appDoc) => {
      const appData = appDoc.data() as JobApplication;
      const existingPanelists =
        appData.interviews?.flatMap((iv) => iv.panelistIds || []) || [];
      const combinedIds = Array.from(
        new Set([...existingPanelists, ...newPanelistIds]),
      );

      batch.update(appDoc.ref, {
        allPanelistIds: combinedIds,
        "internalReviewConfig.enabled": userIds.length > 0,
        "internalReviewConfig.assignedReviewerUids": userIds,
        "internalReviewConfig.visibilityMode": "shared_internal",
        "internalReviewConfig.reviewLocked":
          appData.internalReviewConfig?.reviewLocked ?? false,
        "internalReviewConfig.lastUpdatedAt": FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    return NextResponse.json({
      message: "Assigned users updated successfully.",
    });
  } catch (error: any) {
    console.error("Error assigning users:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan data. Silakan coba lagi." },
      { status: 500 },
    );
  }
}
