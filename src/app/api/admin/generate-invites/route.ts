

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
    
    // Check authority from the main 'users' collection
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    // Using exists() to be consistent with other routes in this project
    if (typeof (userDoc as any).exists === 'function' ? !(userDoc as any).exists() : !userDoc.exists) {
        console.error(`User doc not found for UID: ${decodedToken.uid}`);
        return NextResponse.json({ error: 'User profile not found.' }, { status: 403 });
    }

    const userData = userDoc.data();
    const role = userData?.role;
    const authorizedRoles = ['super-admin', 'hrd'];

    if (!authorizedRoles.includes(role)) {
        console.error(`Unauthorized access attempt by UID: ${decodedToken.uid} with role: ${role}`);
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions.' }, { status: 403 });
    }

    const body = await req.json();
    console.log("Generating invites for body:", body);
    
    const parseResult = generateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ 
        error: 'Invalid request body.', 
        details: parseResult.error.flatten() 
      }, { status: 400 });
    }
    
    const { brandId, employmentType, quantity } = parseResult.data;
    
    const brandDoc = await db.collection('brands').doc(brandId).get();
    if (typeof (brandDoc as any).exists === 'function' ? !(brandDoc as any).exists() : !brandDoc.exists) {
        return NextResponse.json({ error: `Brand ${brandId} not found.` }, { status: 404 });
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
        createdAt: now as any,
        updatedAt: now as any,
    };
    
    console.log(`Writing batch ${batchId} to Firestore...`);
    await batchRef.set(batchData);

    // Omit Timestamp objects from JSON as they can cause serialization errors in some environments
    const { createdAt, updatedAt, ...restOfData } = batchData;

    return NextResponse.json(
        { 
            message: 'Invite batch generated successfully.', 
            id: batchId, 
            ...restOfData,
            createdAt: now.toDate().toISOString(),
            updatedAt: now.toDate().toISOString()
        },
        { status: 201 }
    );


  } catch (error: any) {
    console.error("CRITICAL: Generate invites error:", error);
    
    // Improved diagnostic messages for the user
    let userFriendlyError = 'Terjadi kesalahan sistem saat mencoba membuat batch undangan.';
    if (error.message?.includes('The default Firebase app does not exist') || error.message?.includes('projectId')) {
        userFriendlyError = 'Konfigurasi Firebase Admin SDK belum lengkap atau tidak valid di .env.local.';
    } else if (error.message?.includes('privateKey')) {
        userFriendlyError = 'FIREBASE_PRIVATE_KEY tidak valid atau format penulisan (\\n) salah.';
    }

    return NextResponse.json({ 
        error: userFriendlyError,
        message: error.message
    }, { status: 500 });
  }
}



    