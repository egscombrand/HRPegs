
'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, limit, serverTimestamp, Timestamp, getDocs, doc, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BrainCircuit } from 'lucide-react';
import type { Assessment, AssessmentSession, JobApplication, AssessmentConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


function StartTestForApplication({ applicationId }: { applicationId: string }) {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const isRetry = searchParams.get('retry') === 'true';

    const appRef = useMemoFirebase(() => doc(firestore, 'applications', applicationId), [firestore, applicationId]);
    const { data: application, isLoading: appLoading, error: appError } = useDoc<JobApplication>(appRef);

    const assessmentRef = useMemoFirebase(() => doc(firestore, 'assessments', 'default'), [firestore]);
    const { data: activeAssessment, isLoading: assessmentLoading } = useDoc<Assessment>(assessmentRef);

    const configDocRef = useMemoFirebase(() => doc(firestore, 'assessment_config', 'main'), [firestore]);
    const { data: assessmentConfig, isLoading: configLoading } = useDoc<AssessmentConfig>(configDocRef);


    useEffect(() => {
        if (appLoading || assessmentLoading || authLoading || configLoading) return;

        if (!application || !userProfile || !activeAssessment || !activeAssessment.isActive || activeAssessment.publishStatus !== 'published') {
            if (appError) {
                toast({ variant: 'destructive', title: 'Error', description: `Gagal memuat detail lamaran: ${appError.message}` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Gagal mempersiapkan tes. Lamaran, tes, atau konfigurasi tidak valid.' });
            }
            router.push('/careers/portal/applications');
            return;
        }
        
        if (application.candidateUid !== userProfile.uid) {
             toast({ variant: 'destructive', title: 'Akses Ditolak', description: 'Anda tidak diizinkan untuk memulai sesi tes ini.' });
             router.push('/careers/portal/applications');
             return;
        }

        const handleStart = async () => {
            const deadline = application.personalityTestAssignedAt ? new Date(application.personalityTestAssignedAt.toDate().getTime() + 24 * 60 * 60 * 1000) : null;
            const isExpired = deadline ? new Date() > deadline : false;
            
            const sessionsQuery = query(
                collection(firestore, 'assessment_sessions'),
                where('applicationId', '==', applicationId),
                limit(1)
            );
            const existingSessionsSnap = await getDocs(sessionsQuery);
            const existingSessionDoc = existingSessionsSnap.docs[0];
            const existingSessionData = existingSessionDoc?.data() as AssessmentSession;
            
            if (isExpired && existingSessionData?.status !== 'submitted') {
                toast({ variant: 'destructive', title: 'Waktu Habis', description: 'Waktu pengerjaan tes untuk lamaran ini telah berakhir.' });
                router.push('/careers/portal/applications');
                return;
            }

            const questionsCollection = collection(firestore, 'assessment_questions');
            
            // Helper function to shuffle an array
            const shuffle = (array: string[]) => {
              for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
              }
              return array;
            };

            // Fetch latest question banks
            const likertQuery = query(questionsCollection, where('assessmentId', '==', 'default'), where('isActive', '==', true), where('type', '==', 'likert'));
            const forcedChoiceQuery = query(questionsCollection, where('assessmentId', '==', 'default'), where('isActive', '==', true), where('type', '==', 'forced-choice'));
            
            const [likertQuestionsSnap, forcedChoiceQuestionsSnap] = await Promise.all([
                getDocs(likertQuery),
                getDocs(forcedChoiceQuery)
            ]);

            const likertIds = likertQuestionsSnap.docs.map(d => d.id);
            const forcedChoiceIds = forcedChoiceQuestionsSnap.docs.map(doc => doc.id);
            
            const likertCount = (assessmentConfig?.bigfiveCount || 30) + (assessmentConfig?.discCount || 20);
            const forcedChoiceCount = assessmentConfig?.forcedChoiceCount || 20;

            if (likertIds.length < likertCount || forcedChoiceIds.length < forcedChoiceCount) {
                const errorMessage = `Bank soal tidak mencukupi. Likert: ${likertIds.length}/${likertCount}, Forced-Choice: ${forcedChoiceIds.length}/${forcedChoiceCount}. Hubungi HRD.`;
                if (isRetry) {
                    toast({ variant: 'destructive', title: 'Gagal Memperbaiki Sesi', description: errorMessage });
                } else {
                    toast({ variant: 'destructive', title: 'Bank Soal Tidak Cukup', description: errorMessage });
                }
                router.push('/careers/portal/applications');
                return;
            }

            if (existingSessionDoc) {
                const isOldSession = !existingSessionData.selectedQuestionIds?.forcedChoice || existingSessionData.selectedQuestionIds.forcedChoice.length === 0;

                if (isOldSession || isRetry) {
                    toast({ title: 'Sesi Tes Diperbarui', description: 'Sesi lama Anda tidak valid. Membuat ulang sesi tes untuk Anda.' });
                    
                    const newSelectedQuestionIds = {
                        likert: shuffle(likertIds).slice(0, likertCount),
                        forcedChoice: shuffle(forcedChoiceIds).slice(0, forcedChoiceCount),
                    };

                    const deadlineToSet = deadline ? Timestamp.fromDate(deadline) : null;

                    await setDocumentNonBlocking(existingSessionDoc.ref, {
                        selectedQuestionIds: newSelectedQuestionIds,
                        answers: {}, // Reset answers
                        currentTestPart: 'likert', // Start from the beginning
                        part1GuideAck: false,
                        part2GuideAck: false,
                        status: 'draft',
                        updatedAt: serverTimestamp(),
                        deadlineAt: deadlineToSet,
                    }, { merge: true });

                    router.push(`/careers/portal/assessment/personality/${existingSessionDoc.id}`);
                    return;
                }

                // If session is valid and already submitted
                if (existingSessionData.status === 'submitted') {
                    toast({ title: 'Tes Selesai', description: 'Anda sudah menyelesaikan tes untuk lowongan ini. Melihat hasil...' });
                    router.push(`/careers/portal/assessment/personality/result/${existingSessionDoc.id}`);
                } else { // If session is valid and in draft
                    toast({ title: 'Melanjutkan Sesi', description: 'Anda akan melanjutkan tes yang sedang berjalan.' });
                    router.push(`/careers/portal/assessment/personality/${existingSessionDoc.id}`);
                }
                return;
            }

            // If no existing session, create a new one
            const sessionData: Omit<AssessmentSession, 'id'> = {
                assessmentId: activeAssessment.id!,
                candidateUid: userProfile.uid,
                candidateName: userProfile.fullName,
                candidateEmail: userProfile.email,
                applicationId: applicationId,
                jobPosition: application.jobPosition,
                brandName: application.brandName,
                status: 'draft',
                deadlineAt: deadline ? Timestamp.fromDate(deadline) : undefined,
                part1GuideAck: false,
                part2GuideAck: false,
                currentTestPart: 'likert',
                selectedQuestionIds: {
                    likert: shuffle(likertIds).slice(0, likertCount),
                    forcedChoice: shuffle(forcedChoiceIds).slice(0, forcedChoiceCount),
                },
                answers: {},
                scores: { disc: {}, bigfive: {} },
                startedAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp,
            };

            const docRef = await addDocumentNonBlocking(collection(firestore, 'assessment_sessions'), sessionData);
            toast({ title: 'Tes Dimulai!', description: 'Selamat mengerjakan.' });
            router.push(`/careers/portal/assessment/personality/${docRef.id}`);
        };

        handleStart().catch(e => {
            console.error("Failed to start assessment:", e);
            const title = isRetry ? 'Gagal Memperbaiki Sesi' : 'Gagal Memulai Tes';
            toast({ variant: 'destructive', title: title, description: e.message });
            router.push('/careers/portal/applications');
        });

    }, [appLoading, assessmentLoading, authLoading, configLoading, application, userProfile, activeAssessment, assessmentConfig, applicationId, router, toast, firestore, appError, isRetry]);

    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-4 text-muted-foreground">Mempersiapkan sesi tes untuk<br/><span className="font-bold text-foreground">{application?.jobPosition || '...'}</span></p>
      </div>
    );
}

function StartGeneralTest() {
    const { userProfile } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isStarting, setIsStarting] = useState(false);

    const handleStartTest = async () => {
        if (!userProfile) {
            toast({ variant: "destructive", title: "Error", description: "Anda harus login untuk memulai tes." });
            return;
        }
        setIsStarting(true);
        try {
            // Check for any existing session first
            const existingSessionQuery = query(
                collection(firestore, 'assessment_sessions'),
                where('candidateUid', '==', userProfile.uid),
                limit(1)
            );
            const existingSessionsSnap = await getDocs(existingSessionQuery);
            if (!existingSessionsSnap.empty) {
                const sessionDoc = existingSessionsSnap.docs[0];
                const session = sessionDoc.data() as AssessmentSession;
                
                // If it's expired and not submitted, block it.
                if (session.deadlineAt && new Date() > session.deadlineAt.toDate() && session.status !== 'submitted') {
                     toast({ variant: 'destructive', title: 'Waktu Habis', description: 'Waktu pengerjaan tes untuk lamaran ini telah berakhir.' });
                     router.push('/careers/portal/applications');
                     setIsStarting(false);
                     return;
                }

                toast({ title: "Sesi Ditemukan", description: "Anda akan diarahkan ke sesi tes yang sudah ada." });
                if (session.status === 'submitted') {
                    router.push(`/careers/portal/assessment/personality/result/${sessionDoc.id}`);
                } else {
                    router.push(`/careers/portal/assessment/personality/${sessionDoc.id}`);
                }
                return;
            }

            // If no existing session, create a new one.
            const assessmentDoc = await getDoc(doc(firestore, 'assessments', 'default'));
            if (!assessmentDoc.exists() || !assessmentDoc.data().isActive) {
                throw new Error("Default assessment is not active or not found.");
            }
            const activeAssessment = {id: assessmentDoc.id, ...assessmentDoc.data()} as Assessment;

            const configDoc = await getDoc(doc(firestore, 'assessment_config', 'main'));
            if (!configDoc.exists()) {
                throw new Error("Assessment configuration not found.");
            }
            const assessmentConfig = configDoc.data() as AssessmentConfig;

            const questionsCollection = collection(firestore, 'assessment_questions');
            const shuffle = (array: string[]) => {
              for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
              }
              return array;
            };

            const likertQuery = query(questionsCollection, where('assessmentId', '==', 'default'), where('isActive', '==', true), where('type', '==', 'likert'));
            const forcedChoiceQuery = query(questionsCollection, where('assessmentId', '==', 'default'), where('isActive', '==', true), where('type', '==', 'forced-choice'));
            
            const [likertQuestionsSnap, forcedChoiceQuestionsSnap] = await Promise.all([getDocs(likertQuery), getDocs(forcedChoiceQuery)]);
            const likertIds = likertQuestionsSnap.docs.map(d => d.id);
            const forcedChoiceIds = forcedChoiceQuestionsSnap.docs.map(doc => doc.id);
            
            const likertCount = (assessmentConfig?.bigfiveCount || 30) + (assessmentConfig?.discCount || 20);
            const forcedChoiceCount = assessmentConfig?.forcedChoiceCount || 20;

            if (likertIds.length < likertCount || forcedChoiceIds.length < forcedChoiceCount) {
                throw new Error(`Bank soal tidak mencukupi. Hubungi HRD.`);
            }

            // General test has no deadline
            const sessionData: Omit<AssessmentSession, 'id'> = {
                assessmentId: activeAssessment.id,
                candidateUid: userProfile.uid,
                candidateName: userProfile.fullName,
                candidateEmail: userProfile.email,
                status: 'draft',
                part1GuideAck: false,
                part2GuideAck: false,
                currentTestPart: 'likert',
                selectedQuestionIds: {
                    likert: shuffle(likertIds).slice(0, likertCount),
                    forcedChoice: shuffle(forcedChoiceIds).slice(0, forcedChoiceCount),
                },
                answers: {},
                scores: { disc: {}, bigfive: {} },
                startedAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp,
            };

            const docRef = await addDocumentNonBlocking(collection(firestore, 'assessment_sessions'), sessionData);
            toast({ title: 'Tes Dimulai!', description: 'Selamat mengerjakan.' });
            router.push(`/careers/portal/assessment/personality/${docRef.id}`);

        } catch (error: any) {
            console.error("Failed to start general assessment:", error);
            toast({ variant: 'destructive', title: 'Gagal Memulai Tes', description: error.message });
        } finally {
            setIsStarting(false);
        }
    };
    
    return (
        <Card className="max-w-3xl mx-auto">
            <CardHeader>
                <CardTitle className="text-2xl">Tes Kepribadian</CardTitle>
                <CardDescription>Tes ini dirancang untuk membantu kami memahami preferensi dan gaya kerja Anda. Hasil tes ini akan menjadi patokan umum untuk semua lamaran Anda.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Hanya Satu Kali Pengerjaan</AlertTitle>
                    <AlertDescription>Anda hanya perlu mengerjakan tes ini satu kali. Hasilnya akan kami simpan dan gunakan sebagai referensi untuk lamaran-lamaran Anda selanjutnya. Jika Anda sudah pernah mengerjakan, kami akan melanjutkan sesi Anda atau menampilkan hasilnya.</AlertDescription>
                </Alert>
                <div className="text-center pt-4">
                    <Button size="lg" onClick={handleStartTest} disabled={isStarting}>
                        {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                        {isStarting ? "Mempersiapkan..." : "Mulai atau Lanjutkan Tes"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function AssessmentStartPageContent() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId');
  
  // New: Query for active applications that need a test.
  const activeTestApplicationQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid),
      where('status', '==', 'tes_kepribadian'),
      limit(1)
    );
  }, [firestore, userProfile]);
  const { data: activeTestApplications, isLoading: activeTestAppsLoading } = useCollection<JobApplication>(activeTestApplicationQuery);
  const activeTestApplication = activeTestApplications?.[0];

  const isLoading = authLoading || activeTestAppsLoading;

  // If an applicationId is in the URL, that takes top priority.
  if (applicationId) {
      return <StartTestForApplication applicationId={applicationId} />;
  }

  // If not, but we found an active application that needs a test, start that one.
  if (!isLoading && activeTestApplication) {
      return <StartTestForApplication applicationId={activeTestApplication.id!} />;
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <StartGeneralTest />;
}

export default function AssessmentPage() {
    return (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <AssessmentStartPageContent />
        </Suspense>
    )
}
