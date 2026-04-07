import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { UserRole, ROLES, EMPLOYMENT_TYPES, EmploymentType } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  isActive: z.boolean().default(true),
  brandId: z.union([z.string(), z.array(z.string())]).optional(),
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
        if (!userDoc.exists || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden: Insufficient permissions.', status: 403 };
        }
        return { uid: decodedToken.uid, role: userDoc.data()?.role };
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        return { error: `Verifikasi token gagal: ${error.message}`, status: 401 };
    }
}

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authResult = await verifyAdmin(req);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await req.json();
    const parseResult = createSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { email, password, fullName, role, employmentType, brandId, isActive } = parseResult.data;
    const requesterRole = authResult.role;

    // --- New Validation Logic ---
    if (requesterRole === 'super-admin' && !['hrd', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Super Admins can only create HRD or Manager accounts via this form.' }, { status: 403 });
    }
    // --- End New Validation ---

    const db = admin.firestore();

    try {
      await admin.auth().getUserByEmail(email);
      return NextResponse.json({ error: 'User with this email already exists.' }, { status: 409 });
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
      displayName: fullName,
    });

    const userProfile: any = {
      uid: userRecord.uid,
      email,
      fullName,
      nameLower: fullName.toLowerCase(),
      role,
      employmentType,
      isActive,
      createdAt: Timestamp.now(),
      createdBy: authResult.uid,
    };
    
    if (role === 'hrd') {
      userProfile.brandId = Array.isArray(brandId) ? brandId : [];
    } else if (role !== 'super-admin' && brandId) {
      userProfile.brandId = brandId;
    }

    await db.collection('users').doc(userRecord.uid).set(userProfile);

    if (role === 'super-admin') {
      await db.collection('roles_admin').doc(userRecord.uid).set({ role: 'super-admin' });
    }
    if (role === 'hrd') {
        await db.collection('roles_hrd').doc(userRecord.uid).set({ role: 'hrd' });
    }

    return NextResponse.json({ message: 'User created successfully.', uid: userRecord.uid }, { status: 201 });

  } catch (error: any) {
    console.error(`Failed to create user:`, error);
    let message = error.message || 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
