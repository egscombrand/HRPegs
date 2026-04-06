
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
    
    // Process rows sequentially to avoid Firestore race conditions with lookups
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
            const fullNameHeader = findHeaderByHrpField('fullName');
            if (!fullNameHeader || !row[fullNameHeader]) {
                results.skipped++;
                results.errors.push(`Baris ${i + 2}: Dilewati karena nama lengkap tidak ada atau tidak dipetakan.`);
                continue;
            }
            
            const employeeNumberHeader = findHeaderByHrpField('employeeNumber');
            const emailHeader = findHeaderByHrpField('email');
            
            const employeeNumber = employeeNumberHeader ? row[employeeNumberHeader] : null;
            const email = emailHeader ? row[emailHeader] : null;

            let existingProfileSnap: admin.firestore.DocumentSnapshot | null = null;
            let userRecord: admin.auth.UserRecord | null = null;
            
            if (employeeNumber) {
                const querySnapshot = await employeeProfilesRef.where('employeeNumber', '==', employeeNumber).limit(1).get();
                if (!querySnapshot.empty) {
                    existingProfileSnap = querySnapshot.docs[0];
                }
            }

            if (!existingProfileSnap && email) {
                try {
                    userRecord = await admin.auth().getUserByEmail(email);
                    if (userRecord) {
                        const profileByUid = await employeeProfilesRef.doc(userRecord.uid).get();
                        if (profileByUid.exists) {
                            existingProfileSnap = profileByUid;
                        }
                    }
                } catch (authError: any) {
                    if (authError.code !== 'auth/user-not-found') {
                        console.warn(`Auth lookup for ${email} failed, but continuing import:`, authError.message);
                    }
                    // If user not found in Auth, proceed to create profile without UID link for now
                    userRecord = null;
                }
            }
            
            const payload: Partial<EmployeeProfile> = {};
            let hasData = false;

            for (const header in row) {
                const hrpFieldKey = headerToHrpField[header];
                if (hrpFieldKey && hrpFieldKey !== '__custom__') {
                    const value = row[header];
                    if (value !== undefined && value !== null && value !== '') {
                        hasData = true;
                        (payload as any)[hrpFieldKey] = value;
                    }
                }
            }
            
            if (!hasData) {
                results.skipped++;
                results.errors.push(`Baris ${i + 2}: Tidak ada data untuk diimpor.`);
                continue;
            }
            
            const batch = db.batch();
            
            if (existingProfileSnap) { // --- UPDATE ---
                const docRef = existingProfileSnap.ref;
                batch.set(docRef, { ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                results.updated++;
            } else { // --- CREATE ---
                let uid;
                let newDocRef;

                if (userRecord) {
                    uid = userRecord.uid;
                    newDocRef = employeeProfilesRef.doc(uid);
                } else {
                    newDocRef = employeeProfilesRef.doc();
                    uid = newDocRef.id;
                }
                
                const finalPayload = {
                    employmentType: 'karyawan' as const,
                    employmentStatus: 'active' as const,
                    ...payload, 
                    uid: uid,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                };
                
                batch.set(newDocRef, finalPayload);
                results.created++;
            }
            
            await batch.commit();

        } catch (e: any) {
            results.failed++;
            results.errors.push(`Baris ${i + 2}: ${e.message}`);
        }
    }

    return NextResponse.json(results);
}
