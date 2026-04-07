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
        if (error.code === 'auth/id-token-expired') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        return { error: `Verifikasi token gagal: ${error.message}`, status: 401 };
    }
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const db = admin.firestore();
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
    if (!brandDoc.exists) {
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
        createdBy: authResult.uid,
        createdAt: now as any,
        updatedAt: now as any,
    };
    
    console.log(`Writing batch ${batchId} to Firestore...`);
    await batchRef.set(batchData);

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
