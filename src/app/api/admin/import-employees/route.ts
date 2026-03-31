'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { EmployeeProfile, UserProfile } from '@/lib/types';
import { HRP_FIELDS } from '@/lib/hrp-fields';

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
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
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

    const { rows, mapping, customFields } = await req.json();

    const db = admin.firestore();
    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[] };
    
    const headerToHrpField: Record<string, string> = {};
    for (const header in mapping) {
        const hrpField = mapping[header];
        if (hrpField && hrpField !== '__skip__') {
            headerToHrpField[header] = hrpField;
        }
    }

    const findHeaderByHrpField = (field: string) => Object.keys(headerToHrpField).find(h => headerToHrpField[h] === field);

    const employeeProfilesRef = db.collection('employee_profiles');
    const usersRef = db.collection('users');

    const processingPromises = rows.map(async (row: Record<string, any>, index: number) => {
        try {
            const fullNameHeader = findHeaderByHrpField('fullName');
            if (!fullNameHeader || !row[fullNameHeader]) {
                results.skipped++;
                return;
            }
            
            const employeeNumberHeader = findHeaderByHrpField('employeeNumber');
            const emailHeader = findHeaderByHrpField('email');
            
            const employeeNumber = employeeNumberHeader ? row[employeeNumberHeader] : null;
            const email = emailHeader ? row[emailHeader] : null;

            let existingProfileSnap: admin.firestore.DocumentSnapshot | null = null;
            let userRecord: admin.auth.UserRecord | null = null;
            let foundBy: 'nik' | 'email' | 'none' = 'none';

            // 1. Try to find by Employee Number (NIK)
            if (employeeNumber) {
                const querySnapshot = await employeeProfilesRef.where('employeeNumber', '==', employeeNumber).limit(1).get();
                if (!querySnapshot.empty) {
                    existingProfileSnap = querySnapshot.docs[0];
                    foundBy = 'nik';
                }
            }

            // 2. If not found by NIK, try by email
            if (!existingProfileSnap && email) {
                userRecord = await admin.auth().getUserByEmail(email).catch(() => null);
                if (userRecord) {
                    const profileByUid = await employeeProfilesRef.doc(userRecord.uid).get();
                    if (profileByUid.exists) {
                        existingProfileSnap = profileByUid;
                        foundBy = 'email';
                    }
                }
            }
            
            const payload: Partial<EmployeeProfile> & { additionalFields: Record<string, any> } = { additionalFields: {} };
            let hasData = false;

            for (const header in row) {
                const hrpFieldKey = headerToHrpField[header];
                if (hrpFieldKey) {
                    const value = row[header];
                    if (value !== undefined && value !== null && value !== '') {
                        hasData = true;
                        if (hrpFieldKey === '__custom__') {
                           const customFieldName = customFields[header];
                           if (customFieldName) {
                               payload.additionalFields[customFieldName] = value;
                           }
                        } else {
                           (payload as any)[hrpFieldKey] = value;
                        }
                    }
                }
            }
            
            if (!hasData) {
                results.skipped++;
                return;
            }
            
            const batch = db.batch();
            
            if (existingProfileSnap) { // --- UPDATE ---
                const docRef = existingProfileSnap.ref;
                batch.set(docRef, { ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                results.updated++;
            } else { // --- CREATE ---
                const newDocRef = employeeProfilesRef.doc(userRecord ? userRecord.uid : undefined); // Use UID if found, else generate new ID
                const uid = userRecord ? userRecord.uid : newDocRef.id;
                batch.set(newDocRef, { 
                    ...payload, 
                    uid: uid,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
                results.created++;
            }
            
            await batch.commit();

        } catch (e: any) {
            results.failed++;
            results.errors.push(`Baris ${index + 2}: ${e.message}`);
        }
    });

    await Promise.all(processingPromises);

    return NextResponse.json(results);
}
```