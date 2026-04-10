'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { EcosystemSection, UserProfile } from '@/lib/types';
import imagePlaceholders from '@/lib/placeholder-images.json';
import { ROLES_INTERNAL } from '@/lib/types';

async function verifyUserRole(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) {
            return { error: 'User profile not found.', status: 404 };
        }
        const userProfile = userDoc.data() as UserProfile;
        if (!ROLES_INTERNAL.includes(userProfile.role) || !['super-admin'].includes(userProfile.role)) {
            return { error: 'Forbidden', status: 403 };
        }
        return { user: userProfile };
    } catch (error) {
        return { error: 'Invalid token or authentication error.', status: 401 };
    }
}

export async function POST(req: NextRequest) {
    const roleCheck = await verifyUserRole(req);
    if (roleCheck.error) {
        return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const db = admin.firestore();
    const batch = db.batch();
    const now = Timestamp.now();
    
    const sectionsRef = db.collection('ecosystem_sections');
    const sectionsToCreate: Omit<EcosystemSection, 'id' | 'createdAt' | 'updatedAt'>[] = [
        {
            sectionKey: 'hero',
            title: "Mari Buat Perubahan Bersama Kami",
            subtitle: "Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi lingkungan berkelanjutan. Temukan karier berdampak Anda di Environesia.",
            imageUrls: [imagePlaceholders.careers_hero.src],
            isActive: true,
            sortOrder: 1,
        },
        {
            sectionKey: 'basecamp',
            title: "Basecamp Environesia",
            description: "Tempat ide-ide hebat lahir. Kantor pusat kami di Yogyakarta adalah pusat kolaborasi, inovasi, dan aksi nyata untuk lingkungan.",
            imageUrls: [imagePlaceholders.careers_office_spotlight.src],
            isActive: true,
            sortOrder: 2,
        },
    ];

    let createdCount = 0;

    for (const sectionData of sectionsToCreate) {
        const docRef = sectionsRef.doc(sectionData.sectionKey);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            batch.set(docRef, { ...sectionData, createdAt: now, updatedAt: now });
            createdCount++;
        }
    }
    
    if (createdCount > 0) {
        await batch.commit();
    }
    
    return NextResponse.json({
        message: 'Default sections initialized successfully.',
        created: createdCount,
    });
}
