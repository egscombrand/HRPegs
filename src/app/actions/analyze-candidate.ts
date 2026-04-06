'use server';

import { analyzeCandidateFit } from "@/ai/flows/analyze-candidate-fit-flow";
import type { CandidateFitAnalysisOutput, Job, JobApplication, Profile } from "@/lib/types";
import { extractCvText } from "@/lib/cv/extract-cv-text";
import admin from '@/lib/firebase/admin';

/**
 * Server action to get candidate analysis.
 * It orchestrates fetching data, extracting CV text, and calling the AI flow.
 */
export async function getCandidateAnalysis(applicationId: string): Promise<CandidateFitAnalysisOutput> {
    const db = admin.firestore();

    try {
        // 1. Fetch application, job, and profile data
        const appRef = db.collection('applications').doc(applicationId);
        const appSnap = await appRef.get();
        if (!appSnap.exists) {
            throw new Error('Application not found.');
        }
        const application = { id: appSnap.id, ...appSnap.data() } as JobApplication;

        const jobRef = db.collection('jobs').doc(application.jobId);
        const jobSnap = await jobRef.get();
        if (!jobSnap.exists) {
            throw new Error('Job not found.');
        }
        const job = jobSnap.data() as Job;

        const profileRef = db.collection('profiles').doc(application.candidateUid);
        const profileSnap = await profileRef.get();
        if (!profileSnap.exists) {
            throw new Error('Candidate profile not found.');
        }
        const profile = profileSnap.data() as Profile;

        // 2. Extract text from CV (uses caching mechanism)
        const { cvText, ...cvMeta } = await extractCvText(application, profile);

        // 3. Prepare structured profile data as supplemental info
        const candidateProfileJson = {
            skills: profile.skills || [],
            workExperience: profile.workExperience?.map(exp => ({
                company: exp.company,
                position: exp.position,
                jobType: exp.jobType,
                startDate: exp.startDate,
                endDate: exp.endDate,
                isCurrent: exp.isCurrent,
                description: exp.description
            })) || [],
            education: profile.education?.map(edu => ({
                institution: edu.institution,
                level: edu.level,
                fieldOfStudy: edu.fieldOfStudy
            })) || []
        };
        
        // 4. Call the Genkit flow with the correct data
        const analysisResult = await analyzeCandidateFit({
            jobRequirementsHtml: job.specialRequirementsHtml,
            cvText: cvText,
            cvMeta: cvMeta,
            candidateProfileJson: candidateProfileJson,
        });

        return analysisResult;

    } catch (error: any) {
        console.error(`[Server Action Error] getCandidateAnalysis for app ${applicationId}:`, error);
        // Re-throw the error to be caught by the client component
        throw new Error(error.message || 'An unknown error occurred during analysis.');
    }
}
