
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
import type { JobApplication, Assessment, AssessmentQuestion, AssessmentSession, AssessmentTemplate, ForcedChoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// --- Guide Component ---
function AssessmentGuide({
  title,
  children,
  buttonText,
  onConfirm,
  isConfirming,
  description,
}: {
  title: string;
  children: React.ReactNode;
  buttonText: string;
  onConfirm: () => void;
  isConfirming: boolean;
  description?: string;
}) {
  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
      <CardFooter>
        <Button onClick={onConfirm} disabled={isConfirming} size="lg" className="w-full sm:w-auto ml-auto">
          {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
}


// Helper function to chunk an array into smaller arrays of a specified size.
const chunkArray = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

function AssessmentSkeleton() {
  return (
    <Card className="p-6 md:p-8">
      <Skeleton className="h-4 w-1/4 mb-2" />
      <Skeleton className="h-3 w-1/5 mb-8" />
      <Skeleton className="h-16 w-full mb-8" />
      <div className="flex justify-center items-center gap-4 mb-8">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-12 rounded-full" />
        ))}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </Card>
  );
}

const likertOptions = [
  { value: 7, size: 'h-14 w-14', color: 'border-green-500 bg-green-500/10 data-[state=checked]:bg-green-500' },
  { value: 6, size: 'h-12 w-12', color: 'border-green-400 bg-green-400/10 data-[state=checked]:bg-green-400' },
  { value: 5, size: 'h-10 w-10', color: 'border-green-300 bg-green-300/10 data-[state=checked]:bg-green-300' },
  { value: 4, size: 'h-8 w-8', color: 'border-gray-400 bg-gray-400/10 data-[state=checked]:bg-gray-400' },
  { value: 3, size: 'h-10 w-10', color: 'border-purple-300 bg-purple-300/10 data-[state=checked]:bg-purple-300' },
  { value: 2, size: 'h-12 w-12', color: 'border-purple-400 bg-purple-400/10 data-[state=checked]:bg-purple-400' },
  { value: 1, size: 'h-14 w-14', color: 'border-purple-500 bg-purple-500/10 data-[state=checked]:bg-purple-500' },
];

function ForcedChoiceSelector({
  statements,
  value,
  onChange,
}: {
  statements: ForcedChoice[];
  value: { most: string; least: string };
  onChange: (value: { most: string; least: string }) => void;
}) {
    const handleSelect = (type: 'most' | 'least', text: string) => {
        const otherType = type === 'most' ? 'least' : 'most';
        if (value[otherType] === text) {
            onChange({ ...value, [type]: text, [otherType]: '' });
        } else {
            onChange({ ...value, [type]: text });
        }
    };
    
  return (
    <div className="space-y-3">
      {statements.map((stmt, index) => (
        <div key={index} className="flex items-center justify-between rounded-lg border p-3">
          <span className="flex-1 pr-4">{stmt.text}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={value.most === stmt.text ? 'default' : 'outline'}
              className={cn("w-10 h-10 rounded-full", value.most === stmt.text && 'bg-green-600 hover:bg-green-700')}
              onClick={() => handleSelect('most', stmt.text)}
            >V</Button>
            <Button
              size="sm"
              variant={value.least === stmt.text ? 'destructive' : 'outline'}
              className="w-10 h-10 rounded-full"
              onClick={() => handleSelect('least', stmt.text)}
            >X</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TakeAssessmentPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { userProfile, loading: authLoading } = useAuth();

  const sessionId = params.sessionId as string;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | { most: string; least: string }>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const [currentPart, setCurrentPart] = useState<'likert' | 'forced-choice' | null>(null);
  const [guideState, setGuideState] = useState<'loading' | 'part1' | 'part2' | 'assessment'>('loading');
  const [isConfirmingGuide, setIsConfirmingGuide] = useState(false);
  
  const reversedLikertOptions = useMemo(() => [...likertOptions].reverse(), []);
  
  // 1. Fetch session
  const sessionRef = useMemoFirebase(() => doc(firestore, 'assessment_sessions', sessionId), [firestore, sessionId]);
  const { data: session, isLoading: sessionLoading } = useDoc<AssessmentSession>(sessionRef);
  const applicationId = session?.applicationId;
  
  const appRef = useMemoFirebase(() => {
    if (!applicationId) return null;
    return doc(firestore, 'applications', applicationId);
  }, [firestore, applicationId]);
  const { data: application, isLoading: appLoading } = useDoc<JobApplication>(appRef);

  const assessmentRef = useMemoFirebase(() => {
    if (!session) return null;
    return doc(firestore, 'assessments', session.assessmentId);
  }, [firestore, session]);
  const { data: assessment, isLoading: assessmentLoading } = useDoc<Assessment>(assessmentRef);

  const templateRef = useMemoFirebase(() => {
    if (!assessment) return null;
    return doc(firestore, 'assessment_templates', assessment.templateId);
  }, [firestore, assessment]);
  const { data: template, isLoading: templateLoading } = useDoc<AssessmentTemplate>(templateRef);
  
  const deadline = useMemo(() => {
    if (session?.deadlineAt) return session.deadlineAt.toDate();
    if (application?.personalityTestAssignedAt) {
      return new Date(application.personalityTestAssignedAt.toDate().getTime() + 24 * 60 * 60 * 1000);
    }
    return null;
  }, [application, session]);

  const isExpired = useMemo(() => {
    if (!deadline) return false; // If no deadline, not expired
    return new Date() > deadline;
  }, [deadline]);

  // Fetch questions using chunking
  useEffect(() => {
    const fetchQuestions = async () => {
      if (sessionLoading) return;
      if (!session?.selectedQuestionIds) {
          setQuestionsError('Sesi asesmen tidak valid atau tidak memiliki daftar soal.');
          setQuestionsLoading(false);
        return;
      }
      setQuestionsLoading(true);
      setQuestionsError(null);
      
      try {
        const allIds = [
            ...(session.selectedQuestionIds.likert || []), 
            ...(session.selectedQuestionIds.forcedChoice || [])
        ];
        
        if (allIds.length === 0) {
          toast({ variant: 'destructive', title: 'Sesi Tes Usang', description: 'Mencoba memperbaiki dan memulai ulang sesi...' });
          if (applicationId) {
            router.replace(`/careers/portal/assessment/personality?applicationId=${applicationId}&retry=true`);
          } else {
            setQuestionsError('Sesi tidak valid dan tidak dapat diperbaiki secara otomatis. Silakan kembali ke halaman Lamaran Saya.');
          }
          setQuestions([]);
          setQuestionsLoading(false);
          return;
        }

        const idChunks = chunkArray(allIds, 30);
        const promises = idChunks.map(chunk =>
          getDocs(query(collection(firestore, 'assessment_questions'), where('__name__', 'in', chunk)))
        );
        const querySnapshots = await Promise.all(promises);
        const fetchedQuestions = querySnapshots.flatMap(snap => 
          snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as AssessmentQuestion))
        );

        setQuestions(fetchedQuestions);

      } catch (e: any) {
        console.error("Error fetching questions:", e);
        setQuestionsError(`Gagal memuat soal: ${e.message}`);
      } finally {
        setQuestionsLoading(false);
      }
    };

    if (!sessionLoading) {
      fetchQuestions();
    }
  }, [session, sessionLoading, firestore, applicationId, router, toast]);
  
  // Reconstruct the question order based on the session's ID list
  const sortedQuestions = useMemo(() => {
      if (questions.length === 0 || !session?.selectedQuestionIds) return [];
      const questionMap = new Map(questions.map(q => [q.id, q]));
      
      const allIds = [
        ...(session.selectedQuestionIds.likert || []), 
        ...(session.selectedQuestionIds.forcedChoice || [])
      ];

      return allIds.map(id => questionMap.get(id)).filter((q): q is AssessmentQuestion => !!q);
  }, [questions, session]);

  useEffect(() => {
    if (session) {
        const initialPart = session.currentTestPart || 'likert';
        const likertQs = sortedQuestions.filter(q => q.type === 'likert');
        const forcedChoiceQs = sortedQuestions.filter(q => q.type === 'forced-choice');

        if (initialPart === 'likert' && likertQs.length === 0 && forcedChoiceQs.length > 0) {
            setCurrentPart('forced-choice');
        } else {
            setCurrentPart(initialPart);
        }
        setAnswers(session.answers || {});
    }
  }, [session, sortedQuestions]);

    useEffect(() => {
        if (sessionLoading || questionsLoading) {
            setGuideState('loading');
            return;
        }
        if (!session?.part1GuideAck) {
            setGuideState('part1');
        } else if (currentPart === 'forced-choice' && !session.part2GuideAck) {
            setGuideState('part2');
        } else {
            setGuideState('assessment');
        }
    }, [session, sessionLoading, questionsLoading, currentPart]);
    
    // Add beforeunload listener for focus mode
    useEffect(() => {
        const isTestInProgress = session?.status === 'draft' && !isExpired;

        if (isTestInProgress) {
            const handleBeforeUnload = (e: BeforeUnloadEvent) => {
                e.preventDefault();
                e.returnValue = 'Apakah Anda yakin ingin meninggalkan halaman ini? Progres yang belum disimpan mungkin akan hilang.';
            };
            window.addEventListener('beforeunload', handleBeforeUnload);
            return () => {
                window.removeEventListener('beforeunload', handleBeforeUnload);
            };
        }
    }, [session, isExpired]);


    const handleConfirmPart1 = async () => {
        setIsConfirmingGuide(true);
        try {
            await updateDocumentNonBlocking(sessionRef, { part1GuideAck: true });
            setGuideState('assessment');
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal melanjutkan, silakan coba lagi.' });
        } finally {
            setIsConfirmingGuide(false);
        }
    };
    
    const handleConfirmPart2 = async () => {
        setIsConfirmingGuide(true);
        try {
            await updateDocumentNonBlocking(sessionRef, { part2GuideAck: true });
            setGuideState('assessment');
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal melanjutkan, silakan coba lagi.' });
        } finally {
            setIsConfirmingGuide(false);
        }
    };

  const questionsForCurrentPart = useMemo(() => {
      if (!sortedQuestions.length || !currentPart) return [];
      const partQuestions = sortedQuestions.filter(q => q.type === currentPart);
      return partQuestions;
  }, [sortedQuestions, currentPart]);
  
  const isLoading = authLoading || sessionLoading || assessmentLoading || templateLoading || questionsLoading || appLoading;

  const handleAnswerChange = (questionId: string, value: string | { most: string, least: string }) => {
    if (isExpired) {
      toast({ variant: 'destructive', title: 'Waktu Habis', description: 'Tidak dapat mengubah jawaban setelah waktu habis.' });
      return;
    }
    const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
    const newAnswers = { ...answers, [questionId]: numericValue };
    setAnswers(newAnswers);
  };

  const handleNext = async () => {
    if (isExpired) {
        toast({ variant: 'destructive', title: 'Waktu Habis', description: 'Waktu pengerjaan tes telah berakhir.' });
        return;
    }
    updateDocumentNonBlocking(sessionRef, { answers: answers }).catch(error => {
        console.error("Autosave on next failed:", error);
    });
    if (currentQuestionIndex < questionsForCurrentPart.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const moveToNextPart = async () => {
    if (isExpired) {
        toast({ variant: 'destructive', title: 'Waktu Habis', description: 'Waktu pengerjaan tes telah berakhir.' });
        return;
    }
    setIsTransitioning(true);
    try {
        await updateDocumentNonBlocking(sessionRef, { 
            answers: answers,
            currentTestPart: 'forced-choice' 
        });
        setCurrentPart('forced-choice');
        setCurrentQuestionIndex(0);
        toast({ title: "Bagian 1 Selesai", description: "Lanjut ke bagian 2." });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Gagal pindah ke bagian selanjutnya.' });
    } finally {
        setIsTransitioning(false);
    }
  };

  const handleFinish = async () => {
    if (isExpired) {
        toast({ variant: 'destructive', title: 'Waktu Habis', description: 'Waktu pengerjaan tes telah berakhir.' });
        return;
    }
    setIsFinishing(true);
    try {
        await updateDocumentNonBlocking(sessionRef, { answers: answers });
        
        const res = await fetch('/api/assessment/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Gagal menyelesaikan tes.');
        }

        toast({ title: 'Tes Selesai!', description: 'Hasil Anda sedang diproses.' });
        router.push(`/careers/portal/assessment/personality/result/${sessionId}`);

    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        setIsFinishing(false);
    }
  };
  
  if (isLoading || guideState === 'loading') return <AssessmentSkeleton />;
  
   if (isExpired && session?.status !== 'submitted') {
    return (
        <Card className="max-w-2xl mx-auto text-center">
            <CardHeader>
                <CardTitle>Waktu Pengerjaan Habis</CardTitle>
                <CardDescription>Batas waktu 24 jam untuk pengerjaan tes ini telah berakhir.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground mb-4">Silakan hubungi tim HRD jika Anda merasa ini adalah sebuah kesalahan.</p>
                <Button asChild>
                    <Link href="/careers/portal/applications">Kembali ke Lamaran Saya</Link>
                </Button>
            </CardContent>
        </Card>
    );
  }

   if (guideState === 'part1') {
    return (
      <AssessmentGuide
        title="Panduan Mengerjakan Tes Kepribadian"
        description="Harap baca panduan ini dengan saksama sebelum memulai."
        buttonText="Saya Mengerti, Mulai Bagian 1"
        onConfirm={handleConfirmPart1}
        isConfirming={isConfirmingGuide}
      >
        <div className="not-prose space-y-4">
          <Card className="bg-muted/50">
            <CardHeader className="p-4">
              <CardTitle className="text-base">Tujuan Tes</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-sm">
              <p>Tes ini dirancang untuk membantu kami memahami preferensi dan gaya kerja Anda. Jawablah dengan jujur sesuai dengan diri Anda saat ini. Tidak ada jawaban yang benar atau salah.</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardHeader className="p-4">
              <CardTitle className="text-base">Aturan Pengerjaan</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-sm">
                <ul className="list-disc space-y-2 pl-5">
                    <li>Tes terdiri dari 2 bagian dengan format soal yang berbeda.</li>
                    <li>Jangan terlalu lama berpikir pada satu soal, jawaban spontan seringkali yang terbaik.</li>
                    <li>Pastikan koneksi internet Anda stabil. Progres Anda akan tersimpan setiap kali menekan tombol "Lanjut".</li>
                </ul>
            </CardContent>
          </Card>
        </div>
      </AssessmentGuide>
    );
  }

  if (guideState === 'part2') {
    return (
      <AssessmentGuide
        title="Panduan Mengerjakan Bagian 2"
        description="Anda akan mengerjakan soal dengan format Forced-Choice."
        buttonText="Saya Mengerti, Lanjutkan"
        onConfirm={handleConfirmPart2}
        isConfirming={isConfirmingGuide}
      >
        <div className="not-prose space-y-4">
            <Card className="bg-muted/50">
                <CardHeader className="p-4"><CardTitle className="text-base">Cara Menjawab</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 text-sm">
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Anda akan disajikan 4 pernyataan dalam satu kelompok.</li>
                        <li>Pilih <b>satu</b> pernyataan yang <b>PALING SESUAI</b> dengan diri Anda dengan menekan tombol <Button size="xs" className="w-6 h-6 p-0 bg-green-600 hover:bg-green-700 pointer-events-none">V</Button>.</li>
                        <li>Pilih <b>satu</b> pernyataan yang <b>PALING TIDAK SESUAI</b> dengan diri Anda dengan menekan tombol <Button size="xs" variant="destructive" className="w-6 h-6 p-0 pointer-events-none">X</Button>.</li>
                        <li>Anda harus memilih tepat satu 'V' dan satu 'X' di setiap kelompok untuk dapat melanjutkan.</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
      </AssessmentGuide>
    );
  }

  if (questionsError) {
     return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Gagal Memuat Tes</AlertTitle>
                <AlertDescription>
                    {questionsError}
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!isTransitioning && questionsForCurrentPart.length === 0) {
    const hasLikertQuestions = sortedQuestions.some(q => q.type === 'likert');
    const hasForcedChoiceQuestions = sortedQuestions.some(q => q.type === 'forced-choice');
    const isErrorState = (!hasLikertQuestions && !hasForcedChoiceQuestions);

    if (isErrorState) {
       return (
        <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Bank Soal Kosong</AlertTitle>
                    <AlertDescription>Tidak ada soal yang dapat dimuat untuk sesi ini. Sesi tes mungkin sudah usang atau rusak. Mencoba memperbaiki...</AlertDescription>
                </Alert>
            </CardContent>
        </Card>
       )
    }
    
    // This case happens when one part is finished but the other part is empty.
    if (currentPart === 'likert' && hasForcedChoiceQuestions) {
        moveToNextPart();
        return <AssessmentSkeleton />;
    } else if (currentPart === 'forced-choice' || !hasForcedChoiceQuestions) {
        handleFinish();
        return <AssessmentSkeleton />;
    }
  }
  
  const currentQuestion = questionsForCurrentPart[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questionsForCurrentPart.length) * 100;
  const isLikert = currentQuestion.type === 'likert';

  let currentAnswer = answers[currentQuestion.id!];
  let isAnswered = false;
  if (isLikert) {
      isAnswered = !!currentAnswer;
  } else {
      const fcAnswer = currentAnswer as { most: string; least: string } | undefined;
      isAnswered = !!(fcAnswer && fcAnswer.most && fcAnswer.least);
  }

  const isLastQuestionOfPart = currentQuestionIndex === questionsForCurrentPart.length - 1;
  const hasNextPart = currentPart === 'likert' && sortedQuestions.some(q => q.type === 'forced-choice');

  return (
    <Card className="max-w-4xl mx-auto shadow-lg">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center mb-2">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentQuestionIndex === 0}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Halaman Sebelumnya
            </Button>
            <div className='text-center'>
                 <p className="text-sm font-medium">Bagian: {currentPart === 'likert' ? '1 dari 2' : '2 dari 2'}</p>
                 <p className="text-sm text-muted-foreground">Langkah {currentQuestionIndex + 1} dari {questionsForCurrentPart.length}</p>
            </div>
            <span></span>
        </div>
        <Progress value={progress} className="w-full h-2" />
      </div>
      <CardContent className="p-6 md:p-12 text-center">
        {isLikert ? (
            <>
                <p className="text-lg md:text-xl text-foreground mb-12 max-w-2xl mx-auto">{currentQuestion.text}</p>
                <RadioGroup
                value={currentAnswer?.toString()}
                onValueChange={(value) => handleAnswerChange(currentQuestion.id!, value)}
                className="flex justify-between items-center max-w-2xl mx-auto"
                >
                    <span className="text-purple-600 font-medium text-right">Sangat<br/>Tidak Setuju</span>
                    <div className="flex items-center gap-2 md:gap-4">
                        {reversedLikertOptions.map(opt => (
                        <RadioGroupItem 
                            key={opt.value} 
                            value={opt.value.toString()} 
                            id={`${currentQuestion.id}-${opt.value}`}
                            className={cn('rounded-full transition-all duration-200 ease-in-out transform hover:scale-110 data-[state=checked]:text-white', opt.size, opt.color )}
                        />
                        ))}
                    </div>
                    <span className="text-green-600 font-medium">Sangat<br/>Setuju</span>
                </RadioGroup>
            </>
        ) : (
             <ForcedChoiceSelector
                statements={currentQuestion.forcedChoices || []}
                value={(currentAnswer as { most: string; least: string }) || { most: '', least: '' }}
                onChange={(value) => handleAnswerChange(currentQuestion.id!, value)}
             />
        )}


        <div className="mt-16 flex justify-center">
            {!isLastQuestionOfPart ? (
                <Button size="lg" onClick={handleNext} disabled={!isAnswered}>
                    Lanjut
                </Button>
            ) : hasNextPart ? (
                <Button size="lg" onClick={moveToNextPart} disabled={isTransitioning || !isAnswered}>
                    {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lanjut ke Bagian 2
                </Button>
            ) : (
                <Button size="lg" onClick={handleFinish} disabled={isFinishing || !isAnswered}>
                    {isFinishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Selesaikan Tes
                </Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TakeAssessmentPage;
