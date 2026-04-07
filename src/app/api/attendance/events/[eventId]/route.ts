
'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

async function verifyAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token.', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error) {
        return { error: 'Invalid token.', status: 401 };
    }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { eventId } = params;
  if (!eventId) {
    return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    await db.collection('attendance_events').doc(eventId).delete();
    return NextResponse.json({ message: 'Attendance event deleted successfully.' });
  } catch (error: any) {
    console.error(`Error deleting attendance event ${eventId}:`, error);
    return NextResponse.json({ error: 'Failed to delete event from server.' }, { status: 500 });
  }
}
