'use server';

import { analyzeCandidateFit } from "@/ai/flows/analyze-candidate-fit-flow";
import type { CandidateFitAnalysisOutput, Job, JobApplication, Profile } from "@/lib/types";
import { extractCvText } from "@/lib/cv/extract-cv-text";
import admin from '@/lib/firebase/admin';

// Maps internal error codes (thrown by extractCvText) to user-friendly messages.
function humanizeError(error: any): string {
    const msg: string = error?.message || '';

    if (msg.includes('CV_NOT_FOUND'))
        return 'CV kandidat belum tersedia atau belum berhasil diunggah. Minta kandidat untuk mengupload ulang CV-nya.';

    if (msg.includes('CV_INACCESSIBLE'))
        return 'File CV tidak bisa diakses server. Coba upload ulang CV kandidat atau periksa hak akses file di Google Drive.';

    if (msg.includes('CONFIG_ERROR') || msg.includes('GEMINI_API_KEY'))
        return 'GEMINI_API_KEY belum terkonfigurasi di server. Hubungi administrator sistem.';

    if (msg.includes('PDF_PARSE_ERROR'))
        return 'File CV tidak bisa dibaca. Pastikan file adalah PDF yang valid dan tidak terproteksi password.';

    if (msg.includes('Invalid URL'))
        return 'Link CV tidak valid. Periksa dokumen kandidat atau minta kandidat upload ulang.';

    if (msg.includes('domain is not allowed'))
        return 'URL CV berasal dari domain yang tidak diizinkan. Pastikan file disimpan di Firebase Storage atau Google Drive yang terhubung.';

    if (msg.includes('Application not found'))
        return 'Data lamaran tidak ditemukan. Coba muat ulang halaman.';

    if (msg.includes('profile not found') || msg.includes('Candidate profile'))
        return 'Profil kandidat belum lengkap atau belum ditemukan.';

    if (msg.includes('Job not found'))
        return 'Data lowongan tidak ditemukan.';

    return msg || 'Terjadi kesalahan tidak dikenal saat analisis. Coba lagi beberapa saat.';
}

export async function getCandidateAnalysis(applicationId: string): Promise<CandidateFitAnalysisOutput> {
    const db = admin.firestore();

    console.log(`[analyze-candidate] Starting analysis for applicationId=${applicationId}`);

    try {
        // 1. Fetch application
        const appSnap = await db.collection('applications').doc(applicationId).get();
        if (!appSnap.exists) throw new Error('Application not found.');
        const application = { id: appSnap.id, ...appSnap.data() } as JobApplication;

        // 2. Fetch job
        const jobSnap = await db.collection('jobs').doc(application.jobId).get();
        if (!jobSnap.exists) throw new Error('Job not found.');
        const job = jobSnap.data() as Job;

        // 3. Fetch profile
        const profileSnap = await db.collection('profiles').doc(application.candidateUid).get();
        if (!profileSnap.exists) throw new Error('Candidate profile not found.');
        const profile = profileSnap.data() as Profile;

        console.log(`[analyze-candidate] Data fetched. cvUrl=${profile.cvUrl || '(none)'}, cvFileId=${profile.cvFileId || '(none)'}`);

        // 4. Extract CV text (multi-source with caching)
        const { cvText, ...cvMeta } = await extractCvText(application, profile);

        // 5. Build structured profile supplement
        const candidateProfileJson = {
            skills: profile.skills || [],
            workExperience: (profile.workExperience || []).map(exp => ({
                company: exp.company,
                position: exp.position,
                jobType: exp.jobType,
                startDate: exp.startDate,
                endDate: exp.endDate,
                isCurrent: exp.isCurrent,
                description: exp.description,
            })),
            education: (profile.education || []).map(edu => ({
                institution: edu.institution,
                level: edu.level,
                fieldOfStudy: edu.fieldOfStudy,
            })),
        };

        console.log(`[analyze-candidate] CV extracted: ${cvMeta.charCount} chars from ${cvMeta.source}. Calling Gemini…`);

        // 6. Call AI
        const analysisResult = await analyzeCandidateFit({
            jobRequirementsHtml: job.specialRequirementsHtml,
            cvText,
            cvMeta,
            candidateProfileJson,
        });

        console.log(`[analyze-candidate] Analysis complete for applicationId=${applicationId}`);
        return analysisResult;

    } catch (error: any) {
        console.error(`[analyze-candidate] Error for applicationId=${applicationId}:`, error?.message);
        throw new Error(humanizeError(error));
    }
}
