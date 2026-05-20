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
  isDivisionManager: z.boolean().optional(),
  managedDivision: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDocRef = admin.firestore().collection('users').doc(decodedToken.uid);
    const userDoc = await userDocRef.get();
    const userDocData = userDoc.data();

    if (!userDocData || !['super-admin', 'hrd'].includes(userDocData.role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions.' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = createSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { email, password, fullName, role, employmentType, brandId, isActive, isDivisionManager, managedDivision } = parseResult.data;
    const requesterRole = userDocData.role;

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
      createdBy: decodedToken.uid,
    };
    
    if (role === 'hrd') {
      userProfile.brandId = Array.isArray(brandId) ? brandId : [];
    } else if (role !== 'super-admin' && brandId) {
      userProfile.brandId = brandId;
    }

    if (role === 'manager' && isDivisionManager) {
      if (!brandId || Array.isArray(brandId)) {
        return NextResponse.json({ error: 'Manager Divisi harus memiliki satu brand penempatan.' }, { status: 400 });
      }
      if (!managedDivision) {
        return NextResponse.json({ error: 'Manager Divisi harus memiliki divisi yang dikelola.' }, { status: 400 });
      }

      const brandDoc = await db.collection('brands').doc(brandId).get();
      if (!brandDoc.exists) {
        return NextResponse.json({ error: 'Brand penempatan tidak ditemukan.' }, { status: 400 });
      }

      const divQuery = await db.collection('brands').doc(brandId).collection('divisions').where('name', '==', managedDivision).get();
      if (divQuery.empty) {
        return NextResponse.json({ error: 'Divisi tidak ditemukan.' }, { status: 400 });
      }

      const divisionDoc = divQuery.docs[0];

      userProfile.isDivisionManager = true;
      userProfile.managedBrandId = brandId;
      userProfile.managedBrandName = brandDoc.data()?.name || null;
      userProfile.managedDivision = managedDivision;
      userProfile.managedDivisionId = divisionDoc.id;
      userProfile.managedDivisionName = managedDivision;
      userProfile.managedDivisionIds = [divisionDoc.id];
      userProfile.division = managedDivision;
      userProfile.divisionId = divisionDoc.id;
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
    if (error.code === 'auth/id-token-expired') {
      message = 'Your session has expired. Please log in again.';
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
