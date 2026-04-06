'use server';

import type { JobApplication, Profile } from '@/lib/types';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import pdf from 'pdf-parse';
import { Readable } from 'stream';

const ALLOWED_DOMAINS = [
    'firebasestorage.googleapis.com',
    'storage.googleapis.com'
];
const MIN_CHAR_COUNT_FOR_READABLE = 500;
const CACHE_STALE_DAYS = 30;

/**
 * Extracts text from a CV URL, using a cache if available.
 * 
 * @param application The job application object containing the cvUrl.
 * @returns The extracted text and metadata.
 */
export async function extractCvText(
    application: JobApplication,
    profile: Profile
): Promise<{ cvText: string; source: string; charCount: number; fileName: string; }> {
    const db = admin.firestore();
    const appRef = db.collection('applications').doc(application.id!);
    
    // 1. Check for fresh cache
    if (application.cvText && application.cvTextExtractedAt) {
        const cacheDate = application.cvTextExtractedAt.toDate();
        const daysSinceCache = (new Date().getTime() - cacheDate.getTime()) / (1000 * 3600 * 24);
        if (daysSinceCache < CACHE_STALE_DAYS) {
            return {
                cvText: application.cvText,
                source: application.cvTextSource || 'cached',
                charCount: application.cvCharCount || application.cvText.length,
                fileName: application.cvFileName || profile.cvFileName || 'cv.pdf',
            };
        }
    }
    
    // 2. Validate URL
    const cvUrl = profile.cvUrl; // Prioritize profile URL
    if (!cvUrl) {
        throw new Error('CV URL is missing.');
    }
    const url = new URL(cvUrl);
    if (!ALLOWED_DOMAINS.includes(url.hostname)) {
        throw new Error('CV URL domain is not allowed for security reasons.');
    }

    // 3. Fetch and Parse CV
    let cvText = '';
    let source: JobApplication['cvTextSource'] = 'unknown';

    try {
        const response = await fetch(cvUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch CV: ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();

        // Use pdf-parse
        const data = await pdf(buffer);
        cvText = data.text.replace(/\s{2,}/g, ' ').replace(/(\r\n|\n|\r){2,}/g, '\n').trim();
        source = 'pdf-parse';

        // Basic check for scanned PDF
        if (cvText.length < MIN_CHAR_COUNT_FOR_READABLE) {
            // Placeholder for future OCR implementation
            // For now, we just acknowledge it's likely a scan but return the (short) text
            console.warn(`CV for application ${application.id} has low character count, likely a scanned PDF.`);
        }

    } catch (error) {
        console.error(`Failed to parse CV for application ${application.id}:`, error);
        throw new Error('Could not read the provided CV file. It may be corrupted or an unsupported format.');
    }
    
    // 4. Cache the result in Firestore (don't block the return)
    const cacheData: Partial<JobApplication> = {
        cvText,
        cvTextSource: source,
        cvCharCount: cvText.length,
        cvTextExtractedAt: Timestamp.now(),
        // Also backfill the cvUrl to the application if it's missing
        cvUrl: application.cvUrl || cvUrl,
        cvFileName: application.cvFileName || profile.cvFileName || 'cv.pdf',
    };

    appRef.update(cacheData).catch(err => {
        console.error(`Failed to cache CV text for application ${application.id}:`, err);
    });

    return {
        cvText,
        source,
        charCount: cvText.length,
        fileName: profile.cvFileName || application.cvFileName || 'cv.pdf',
    };
}
