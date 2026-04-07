import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

// Helper to verify that the requester is a super-admin
async function verifySuperAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token.', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'super-admin') {
            return { error: 'Forbidden: Only super-admins can delete users.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error) {
        return { error: 'Invalid token.', status: 401 };
    }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authResult = await verifySuperAdmin(req);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { uid } = params;
  if (!uid) {
    return NextResponse.json({ error: 'User UID is required.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    
    // CORRECT ORDER: Delete from Firestore first
    const batch = db.batch();
    const userDocRef = db.collection('users').doc(uid);
    const adminRoleDocRef = db.collection('roles_admin').doc(uid);
    const hrdRoleDocRef = db.collection('roles_hrd').doc(uid);

    batch.delete(userDocRef);
    batch.delete(adminRoleDocRef);
    batch.delete(hrdRoleDocRef);
    
    await batch.commit();

    // Now, delete the user from Firebase Authentication
    await admin.auth().deleteUser(uid);

    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error(`Failed to delete user ${uid}:`, error);

    if (error.code === 'auth/user-not-found') {
        // This case is now less likely to be a "partial success" since we delete Auth last.
        // It's more likely the user was deleted in a separate action.
        // We can still try to clean up Firestore just in case.
        const db = admin.firestore();
        const batch = db.batch();
        const userDocRef = db.collection('users').doc(uid);
        const adminRoleDocRef = db.collection('roles_admin').doc(uid);
        const hrdRoleDocRef = db.collection('roles_hrd').doc(uid);

        batch.delete(userDocRef);
        batch.delete(adminRoleDocRef);
        batch.delete(hrdRoleDocRef);
        
        await batch.commit().catch(e => console.error("Firestore cleanup failed after auth user not found:", e));

        // Return a success response as the user is gone.
        return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
