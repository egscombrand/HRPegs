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
        if (!userDoc.exists() || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        return { error: 'Invalid token.', status: 401 };
    }
}

export async function POST(req: NextRequest) {
    const authResult = await verifyAdmin(req);
    if (authResult.error) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { rows, mapping, customFields } = await req.json();

    const db = admin.firestore();
    const batch = db.batch();
    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[] };
    
    // Reverse mapping for easier lookup
    const headerToHrpField: Record<string, string> = {};
    for (const header in mapping) {
        const hrpField = mapping[header];
        if (hrpField && hrpField !== '__skip__') {
            headerToHrpField[header] = hrpField;
        }
    }

    // Process rows in chunks to avoid overwhelming the system
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const email = row[Object.keys(headerToHrpField).find(h => headerToHrpField[h] === 'email')!];

        if (!email) {
            results.failed++;
            results.errors.push(`Baris ${i + 2}: Email tidak ditemukan atau tidak dipetakan. Baris ini dilewati.`);
            continue;
        }

        try {
            const userRecord = await admin.auth().getUserByEmail(email).catch(() => null);
            if (!userRecord) {
                results.failed++;
                results.errors.push(`Baris ${i + 2}: Pengguna dengan email ${email} tidak ditemukan di sistem otentikasi. Baris ini dilewati.`);
                continue;
            }

            const employeeProfileRef = db.collection('employee_profiles').doc(userRecord.uid);
            const userRef = db.collection('users').doc(userRecord.uid);
            const existingProfileSnap = await employeeProfileRef.get();

            const payload: Partial<EmployeeProfile> & { additionalFields: Record<string, any> } = { additionalFields: {} };
            let hasData = false;

            for (const header in row) {
                const hrpFieldKey = headerToHrpField[header];
                if (hrpFieldKey) {
                    const value = row[header];
                    if (value) {
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
                continue;
            }
            
            payload.updatedAt = serverTimestamp() as any;

            if (existingProfileSnap.exists) {
                batch.set(employeeProfileRef, payload, { merge: true });
                results.updated++;
            } else {
                payload.uid = userRecord.uid;
                payload.createdAt = serverTimestamp() as any;
                batch.set(employeeProfileRef, payload);
                results.created++;
            }
            
            // Also update the main user document with critical info if available
            const userUpdatePayload: Partial<UserProfile> = {};
            if(payload.positionTitle) userUpdatePayload.positionTitle = payload.positionTitle;
            if(payload.division) userUpdatePayload.division = payload.division;
            if(payload.brandId) userUpdatePayload.brandId = payload.brandId;
            if(Object.keys(userUpdatePayload).length > 0) {
                 batch.update(userRef, userUpdatePayload);
            }

        } catch (e: any) {
            results.failed++;
            results.errors.push(`Baris ${i + 2} (${email}): ${e.message}`);
        }
    }

    try {
        await batch.commit();
        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: 'Gagal menyimpan data ke database.', details: e.message }, { status: 500 });
    }
}
