
import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { Invite, UserProfile } from '@/lib/types';

const registerSchema = z.object({
  code: z.string().min(1, 'Invite code is required.'),
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email({ message: 'A valid email is required.' }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { code, fullName, email, password } = parseResult.data;
    const db = admin.firestore();
    const batch = db.batch();

    // 1. Re-validate the invite code
    const inviteRef = db.collection('invites').doc(code);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return NextResponse.json({ error: 'Kode undangan tidak ditemukan.' }, { status: 404 });
    }
    const invite = inviteDoc.data() as Invite;

    if (!invite.isActive || invite.usedAt || invite.expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: 'Kode undangan sudah tidak valid.' }, { status: 410 });
    }

    // 2. Check if email is already in use
    try {
      await admin.auth().getUserByEmail(email);
      return NextResponse.json({ error: 'Email ini sudah terdaftar.' }, { status: 409 });
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // 3. Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
    });

    // 4. Create user profile in Firestore
    const userRef = db.collection('users').doc(userRecord.uid);
    const userProfile: Omit<UserProfile, 'id' | 'createdAt'> & { createdAt: Timestamp } = {
      uid: userRecord.uid,
      fullName,
      email,
      role: invite.employmentType === 'training' ? 'karyawan' : 'karyawan', // Map to a default internal role
      employmentType: invite.employmentType,
      brandId: invite.brandId,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy: invite.createdBy, // UID of the HRD who created the invite
    };
    batch.set(userRef, userProfile);

    // 5. Update invite to be used
    batch.update(inviteRef, {
      isActive: false,
      usedAt: Timestamp.now(),
      usedByUid: userRecord.uid,
    });
    
    // 6. Commit all changes
    await batch.commit();
    
    return NextResponse.json({ message: 'User registered successfully!', uid: userRecord.uid }, { status: 201 });

  } catch (error: any) {
    console.error('Error during registration with code:', error);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
