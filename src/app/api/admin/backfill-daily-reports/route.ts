'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { ROLES_INTERNAL, type UserProfile, type EmployeeProfile, type DailyReport } from '@/lib/types';

// Helper to verify user role
async function verifyAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error) {
        return { error: 'Invalid token.', status: 401 };
    }
}

export async function POST(req: NextRequest) {
    const authResult = await verifyAdmin(req);
    if (authResult.error) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const db = admin.firestore();
    let updatedCount = 0;
    let skippedCount = 0;
    
    try {
        // Get all reports that are missing a supervisorUid
        const reportsToUpdateQuery = db.collection('daily_reports').where('supervisorUid', '==', null);
        const snapshot = await reportsToUpdateQuery.get();

        if (snapshot.empty) {
            return NextResponse.json({ message: 'No reports needed backfilling.', updated: 0, skipped: 0 });
        }

        // Create a map of intern profiles for quick lookup
        const internProfilesSnap = await db.collection('employee_profiles').get();
        const internProfilesMap = new Map<string, EmployeeProfile>();
        internProfilesSnap.forEach(doc => {
            internProfilesMap.set(doc.id, { id: doc.id, ...doc.data() } as EmployeeProfile);
        });

        const batch = db.batch();
        snapshot.docs.forEach(reportDoc => {
            const report = reportDoc.data() as DailyReport;
            const internProfile = internProfilesMap.get(report.uid);
            
            // If intern has a profile and a supervisor assigned in that profile
            if (internProfile && internProfile.supervisorUid) {
                batch.update(reportDoc.ref, {
                    supervisorUid: internProfile.supervisorUid,
                    supervisorName: internProfile.supervisorName || null,
                });
                updatedCount++;
            } else {
                skippedCount++;
            }
        });

        await batch.commit();

        return NextResponse.json({
            message: 'Backfill complete.',
            updated: updatedCount,
            skipped: skippedCount,
        });

    } catch (error: any) {
        console.error('Error during daily reports backfill:', error);
        return NextResponse.json({ error: 'Failed to backfill reports: ' + error.message }, { status: 500 });
    }
}
