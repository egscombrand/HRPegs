'use server';

import type { JobApplication, Profile } from '@/lib/types';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import pdf from 'pdf-parse';
import { google } from 'googleapis';

const FIREBASE_STORAGE_DOMAINS = [
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
];

const MIN_CHAR_COUNT_FOR_READABLE = 500;
const CACHE_STALE_DAYS = 30;

// ─── Google Drive client (service account) ────────────────────────────────────

function getDriveClient() {
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
    if (!clientEmail || !privateKeyRaw) return null;
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return google.drive({ version: 'v3', auth });
}

async function fetchFromGoogleDrive(fileId: string): Promise<ArrayBuffer | null> {
    const drive = getDriveClient();
    if (!drive) {
        console.warn('[CV Extract] Google Drive credentials not configured.');
        return null;
    }
    try {
        const res = await drive.files.get(
            { fileId, alt: 'media', supportsAllDrives: true },
            { responseType: 'arraybuffer' }
        );
        return res.data as ArrayBuffer;
    } catch (err: any) {
        console.error(`[CV Extract] Failed to download from Google Drive fileId=${fileId}:`, err.message);
        return null;
    }
}

// ─── URL validator ────────────────────────────────────────────────────────────

function isValidHttpUrl(value: unknown): value is string {
    if (!value || typeof value !== 'string') return false;
    const s = value.trim();
    if (!s.startsWith('http://') && !s.startsWith('https://')) return false;
    try { new URL(s); return true; } catch { return false; }
}

function isFirebaseStorageUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname;
        return FIREBASE_STORAGE_DOMAINS.includes(hostname);
    } catch { return false; }
}

// ─── Core resolver — tries every source in priority order ────────────────────

async function resolveCvBuffer(
    application: JobApplication,
    profile: Profile
): Promise<{ buffer: ArrayBuffer; fileName: string; source: string }> {

    const fileName =
        profile.cvFileName || application.cvFileName || 'cv.pdf';

    // DEBUG log (no API keys exposed)
    console.log('[CV Extract] Resolving CV:', {
        applicationId: application.id,
        profileCvUrl: profile.cvUrl || null,
        profileCvFileId: profile.cvFileId || null,
        appCvUrl: application.cvUrl || null,
        appCvFileId: application.cvFileId || null,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasDriveEmail: !!process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    });

    // 1. profile.cvUrl — Firebase Storage (most reliable)
    if (isValidHttpUrl(profile.cvUrl)) {
        const url = profile.cvUrl!.trim();
        if (isFirebaseStorageUrl(url)) {
            const res = await fetch(url);
            if (res.ok) {
                console.log('[CV Extract] Source: profile.cvUrl (Firebase Storage)');
                return { buffer: await res.arrayBuffer(), fileName, source: 'profile.cvUrl' };
            }
            console.warn(`[CV Extract] profile.cvUrl fetch failed: ${res.status} ${res.statusText}`);
        } else {
            console.warn(`[CV Extract] profile.cvUrl domain not in allowlist: ${new URL(url).hostname}`);
        }
    }

    // 2. profile.cvFileId — Google Drive via service account
    if (profile.cvFileId && typeof profile.cvFileId === 'string') {
        const buf = await fetchFromGoogleDrive(profile.cvFileId);
        if (buf) {
            console.log('[CV Extract] Source: profile.cvFileId (Google Drive)');
            return { buffer: buf, fileName, source: 'profile.cvFileId' };
        }
    }

    // 3. application.cvUrl — Firebase Storage
    if (isValidHttpUrl(application.cvUrl)) {
        const url = application.cvUrl!.trim();
        if (isFirebaseStorageUrl(url)) {
            const res = await fetch(url);
            if (res.ok) {
                console.log('[CV Extract] Source: application.cvUrl (Firebase Storage)');
                return { buffer: await res.arrayBuffer(), fileName, source: 'application.cvUrl' };
            }
            console.warn(`[CV Extract] application.cvUrl fetch failed: ${res.status} ${res.statusText}`);
        }
    }

    // 4. application.cvFileId — Google Drive
    if (application.cvFileId && typeof application.cvFileId === 'string') {
        const buf = await fetchFromGoogleDrive(application.cvFileId);
        if (buf) {
            console.log('[CV Extract] Source: application.cvFileId (Google Drive)');
            return { buffer: buf, fileName, source: 'application.cvFileId' };
        }
    }

    // 5. profile.cvGoogleDriveWebViewLink — extract fileId and download
    if (profile.cvGoogleDriveWebViewLink && typeof profile.cvGoogleDriveWebViewLink === 'string') {
        const match = profile.cvGoogleDriveWebViewLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match?.[1]) {
            const buf = await fetchFromGoogleDrive(match[1]);
            if (buf) {
                console.log('[CV Extract] Source: profile.cvGoogleDriveWebViewLink (Google Drive)');
                return { buffer: buf, fileName, source: 'cvGoogleDriveWebViewLink' };
            }
        }
    }

    // Exhausted all sources
    const hasSomeUrl = profile.cvUrl || profile.cvFileId || application.cvUrl || application.cvFileId;

    if (!hasSomeUrl) {
        throw new Error('CV_NOT_FOUND: CV kandidat belum tersedia atau belum berhasil diunggah.');
    }
    throw new Error('CV_INACCESSIBLE: File CV tidak bisa diakses server. Coba upload ulang CV kandidat.');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function extractCvText(
    application: JobApplication,
    profile: Profile
): Promise<{ cvText: string; source: string; charCount: number; fileName: string }> {

    const db = admin.firestore();
    const appRef = db.collection('applications').doc(application.id!);

    // 1. Return cached text if fresh
    if (application.cvText && application.cvTextExtractedAt) {
        const daysSince = (Date.now() - application.cvTextExtractedAt.toDate().getTime()) / 86_400_000;
        if (daysSince < CACHE_STALE_DAYS) {
            console.log(`[CV Extract] Cache hit for application ${application.id}`);
            return {
                cvText: application.cvText,
                source: application.cvTextSource || 'cached',
                charCount: application.cvCharCount || application.cvText.length,
                fileName: application.cvFileName || profile.cvFileName || 'cv.pdf',
            };
        }
    }

    if (!process.env.GEMINI_API_KEY) {
        throw new Error('CONFIG_ERROR: GEMINI_API_KEY belum terbaca di server. Pastikan sudah dipasang di environment variable dan server sudah di-restart.');
    }

    // 2. Resolve CV buffer
    const { buffer, fileName, source } = await resolveCvBuffer(application, profile);

    // 3. Parse PDF
    let cvText = '';
    let textSource: JobApplication['cvTextSource'] = 'pdf-parse';
    try {
        const data = await pdf(buffer);
        cvText = data.text.replace(/\s{2,}/g, ' ').replace(/(\r\n|\n|\r){2,}/g, '\n').trim();
    } catch (err: any) {
        console.error(`[CV Extract] pdf-parse failed for application ${application.id}:`, err.message);
        throw new Error('PDF_PARSE_ERROR: File CV tidak bisa dibaca. Pastikan file adalah PDF yang valid dan tidak terproteksi password.');
    }

    if (cvText.length < MIN_CHAR_COUNT_FOR_READABLE) {
        console.warn(`[CV Extract] Low char count (${cvText.length}) for application ${application.id} — likely scanned PDF.`);
    }

    // 4. Cache result (non-blocking)
    const cacheData: Partial<JobApplication> = {
        cvText,
        cvTextSource: textSource,
        cvCharCount: cvText.length,
        cvTextExtractedAt: Timestamp.now(),
        cvUrl: application.cvUrl || profile.cvUrl || '',
        cvFileName: application.cvFileName || profile.cvFileName || 'cv.pdf',
    };
    appRef.update(cacheData).catch(err =>
        console.error(`[CV Extract] Failed to cache CV text for application ${application.id}:`, err)
    );

    return { cvText, source, charCount: cvText.length, fileName };
}
