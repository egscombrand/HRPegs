'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { generateUniqueCode } from '@/lib/utils';
import { EMPLOYMENT_TYPES, type Invite } from '@/lib/types';

// Schema for request body validation
const generateSchema = z.object({
  brandId: z.string().min(1, 'Brand is required.'),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  quantity: z.coerce.number().int().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const batch = db.batch();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    for (let i = 0; i < quantity; i++) {
        const code = generateUniqueCode(8);
        const inviteRef = db.collection('invites').doc(code);
        
        const inviteData: Omit<Invite, 'id'> = {
            code,
            brandId,
            employmentType,
            createdBy: decodedToken.uid,
            createdAt: now,
            expiresAt,
            usedAt: null,
            usedByUid: null,
            isActive: true,
        };

        batch.set(inviteRef, inviteData);
    }
    
    await batch.commit();

    return NextResponse.json({ message: 'Invites generated successfully.', count: quantity }, { status: 201 });

  } catch (error: any) {
    console.error("Generate invites error:", error);
    return NextResponse.json({ error: 'Invalid token or server error.' }, { status: 401 });
  }
}
