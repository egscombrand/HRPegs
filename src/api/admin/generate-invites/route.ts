
'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { generateUniqueCode } from '@/lib/utils';
import { type InviteBatch } from '@/lib/types';
import { firestore } from 'firebase-admin';

const inviteEmploymentTypes = ['karyawan', 'magang', 'training'] as const;

const generateSchema = z.object({
  brandId: z.string().min(1, 'Brand is required.'),
  employmentType: z.enum(inviteEmploymentTypes),
  quantity: z.coerce.number().int().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    const db = admin.firestore();
    const adminRoleDoc = await db.collection('roles_admin').doc(decodedToken.uid).get();
    const hrdRoleDoc = await db.collection('roles_hrd').doc(decodedToken.uid).get();

    if (!adminRoleDoc.exists && !hrdRoleDoc.exists) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = generateSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }
    
    const { brandId, employmentType, quantity } = parseResult.data;
    
    const brandDoc = await db.collection('brands').doc(brandId).get();
    if (!brandDoc.exists) {
        return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    const brandName = brandDoc.data()?.name || 'Unknown Brand';
    
    const now = Timestamp.now();
    const batchId = generateUniqueCode(10);
    const batchRef = db.collection('invite_batches').doc(batchId);
    
    const batchData: Omit<InviteBatch, 'id'> = {
        brandId,
        brandName,
        employmentType,
        totalSlots: quantity,
        claimedSlots: 0,
        createdBy: decodedToken.uid,
        createdAt: now,
        updatedAt: now,
    };
    
    await batchRef.set(batchData);

    return NextResponse.json(
        { message: 'Invite batch generated successfully.', ...batchData },
        { status: 201 }
    );

  } catch (error: any) {
    console.error("Generate invites error:", error);
    if (error.code && error.code.startsWith('auth/')) {
        let message = 'Authentication error. Please try logging out and in again.';
        if (error.code === 'auth/id-token-expired') {
            message = 'Your session has expired. Please log in again.';
        }
        return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}

    