'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const patchSchema = z.object({
  additionalQuantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});

// Helper to verify user role
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


export async function PATCH(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { batchId } = params;
  if (!batchId) {
    return NextResponse.json({ error: 'Batch ID is required.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parseResult = patchSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { additionalQuantity } = parseResult.data;
    const db = admin.firestore();
    const batchRef = db.collection('invite_batches').doc(batchId);

    // Use a transaction to safely read and update
    await db.runTransaction(async (transaction) => {
        const batchDoc = await transaction.get(batchRef);
        if (!batchDoc.exists) {
            throw new Error('Batch not found.');
        }

        transaction.update(batchRef, {
            totalSlots: FieldValue.increment(additionalQuantity),
            updatedAt: Timestamp.now(),
        });
    });

    return NextResponse.json({ message: 'Quota added successfully.' });

  } catch (error: any) {
    console.error('Error adding quota to batch:', error);
    return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}
