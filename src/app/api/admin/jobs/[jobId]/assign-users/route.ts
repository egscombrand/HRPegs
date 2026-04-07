'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { JobApplication, UserProfile } from '@/lib/types';


async function verifyAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token.', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists() || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        console.error("Token verification failed unexpectedly:", error);
        return { error: `Verifikasi token gagal: ${error.message}`, status: 500 };
    }
}


export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { userIds }: { userIds: string[] } = await req.json();
    const db = admin.firestore();
    const batch = db.batch();

    // 1. Update the Job document
    const jobRef = db.doc(`jobs/${params.jobId}`);
    batch.update(jobRef, {
      assignedUserIds: userIds,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authResult.uid,
    });

    // 2. Update all related applications
    const appsQuery = db.collection('applications').where('jobId', '==', params.jobId);
    const appsSnap = await appsQuery.get();

    const newPanelistIds = new Set(userIds);

    appsSnap.forEach(appDoc => {
      const appData = appDoc.data() as JobApplication;
      // Combine existing interview panelists with new assigned users
      const existingPanelists = appData.interviews?.flatMap(iv => iv.panelistIds || []) || [];
      const combinedIds = Array.from(new Set([...existingPanelists, ...newPanelistIds]));
      
      batch.update(appDoc.ref, {
        allPanelistIds: combinedIds,
      });
    });

    await batch.commit();
    return NextResponse.json({ message: 'Assigned users updated successfully.' });

  } catch (error: any) {
    console.error("Error assigning users:", error);
    return NextResponse.json({ error: 'Gagal menyimpan data. Silakan coba lagi.' }, { status: 500 });
  }
}
