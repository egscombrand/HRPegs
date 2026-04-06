'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Briefcase, User, CheckCircle2, Circle, BrainCircuit, ClipboardList, ShieldCheck } from 'lucide-react';
import React, { useMemo } from 'react';
import { ApplicationStatusStepper } from '@/components/careers/ApplicationStatusStepper';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, JobApplicationStatus, AssessmentSession } from '@/lib/types';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export default function CandidateDashboardPage() {
  const { userProfile, loading } = useAuth();
  const firestore = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'applications'), where('candidateUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const { data: applications, isLoading: isLoadingApps } = useCollection<JobApplication>(applicationsQuery);

  const sessionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'assessment_sessions'), where('candidateUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const { data: assessmentSessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(sessionsQuery);

  const isProfileComplete = userProfile?.isProfileComplete || false;
  const hasApplied = applications && applications.length > 0;
  const hasFinishedTest = assessmentSessions?.some((s: AssessmentSession) => s.status === 'submitted') || false;

  const allStepsCompleted = isProfileComplete && hasApplied && hasFinishedTest;

  const { highestStatus, highestStatusApplication } = useMemo(() => {
    if (!applications) return { highestStatus: null, highestStatusApplication: null };
    const nonRejectedApps = applications.filter(app => app.status !== 'rejected');
    if (nonRejectedApps.length === 0) return { highestStatus: null, highestStatusApplication: null };

    let highestApp: JobApplication | null = null;
    let highestStageIndex = -1;

    nonRejectedApps.forEach(app => {
      const currentIndex = ORDERED_RECRUITMENT_STAGES.indexOf(app.status);
      if (currentIndex > highestStageIndex) {
        highestStageIndex = currentIndex;
        highestApp = app;
      }
    });

    return { highestStatus: highestApp?.status || null, highestStatusApplication: highestApp };
  }, [applications]);
  
  return (
    <div className="space-y-8">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Halo, {userProfile?.fullName}!</h1>
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Selesaikan semua langkah untuk memulai proses screening.</p>
        </div>

        {/* Unified Recruitment Steps */}
        <Card className={cn("border-2", allStepsCompleted ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/10" : "border-primary/20 shadow-lg")}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-primary" />
                            Langkah Pendaftaran Anda
                        </CardTitle>
                        <CardDescription>Selesaikan 3 langkah di bawah ini untuk dapat diproses oleh tim HRD.</CardDescription>
                    </div>
                    {allStepsCompleted && (
                         <div className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold animate-pulse">
                            <ShieldCheck className="h-4 w-4" />
                            SIAP SCREENING
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Step 1: Profile */}
                    <div className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        isProfileComplete ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-muted/50 border-transparent"
                    )}>
                        <div className="flex items-center justify-between mb-2">
                             <User className={cn("h-8 w-8", isProfileComplete ? "text-green-600" : "text-muted-foreground")} />
                             {isProfileComplete ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <h4 className="font-bold">Lengkapi Profil</h4>
                        <p className="text-xs text-muted-foreground mb-3">Data diri, dokumen CV, Ijazah, dan sertifikasi pendukung.</p>
                        {!isProfileComplete && (
                            <Button asChild size="sm" className="w-full">
                                <Link href="/careers/portal/profile">Lengkapi Sekarang</Link>
                            </Button>
                        )}
                        {isProfileComplete && <p className="text-[10px] font-bold text-green-600 uppercase">Selesai</p>}
                    </div>

                    {/* Step 2: Apply */}
                    <div className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        hasApplied ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : (isProfileComplete ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-transparent")
                    )}>
                        <div className="flex items-center justify-between mb-2">
                             <Briefcase className={cn("h-8 w-8", hasApplied ? "text-green-600" : (isProfileComplete ? "text-primary" : "text-muted-foreground"))} />
                             {hasApplied ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <h4 className="font-bold">Lamar Pekerjaan</h4>
                        <p className="text-xs text-muted-foreground mb-3">Pilih setidaknya satu posisi yang sesuai dengan minat dan kualifikasi Anda.</p>
                        {!hasApplied && isProfileComplete && (
                            <Button asChild size="sm" className="w-full">
                                <Link href="/careers/portal/jobs">Cari Lowongan</Link>
                            </Button>
                        )}
                        {hasApplied && <p className="text-[10px] font-bold text-green-600 uppercase">Sudah Melamar</p>}
                        {!isProfileComplete && <p className="text-[10px] text-muted-foreground italic">Selesaikan profil dulu</p>}
                    </div>

                    {/* Step 3: Test */}
                    <div className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        hasFinishedTest ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : (hasApplied ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-transparent")
                    )}>
                        <div className="flex items-center justify-between mb-2">
                             <BrainCircuit className={cn("h-8 w-8", hasFinishedTest ? "text-green-600" : (hasApplied ? "text-primary" : "text-muted-foreground"))} />
                             {hasFinishedTest ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <h4 className="font-bold">Tes Kepribadian</h4>
                        <p className="text-xs text-muted-foreground mb-3">Analisis gaya kerja dan kecocokan budaya kerja di Environesia.</p>
                        {!hasFinishedTest && hasApplied && (
                             <Button asChild size="sm" className="w-full">
                                <Link href="/careers/portal/assessment/personality">Mulai Tes</Link>
                            </Button>
                        )}
                        {hasFinishedTest && <p className="text-[10px] font-bold text-green-600 uppercase">Selesai</p>}
                        {!hasApplied && <p className="text-[10px] text-muted-foreground italic">Lamar pekerjaan dulu</p>}
                    </div>
                </div>

                {allStepsCompleted && (
                    <div className="mt-6">
                        <Alert className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900">
                            <ShieldCheck className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800 dark:text-green-400 font-bold">Langkah Pendaftaran Selesai!</AlertTitle>
                            <AlertDescription className="text-green-700 dark:text-green-500">
                                Berkas Anda telah masuk ke dalam antrean sistem untuk dilakukan <strong>Screning awal</strong> oleh tim HRD Environesia. Kami akan memberikan update via portal ini atau email jika Anda lolos ke tahap Wawancara.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
            </CardContent>
        </Card>
        
        {hasApplied && (
            <Card>
                <CardHeader>
                    <CardTitle>Progres Lamaran Detail</CardTitle>
                    <CardDescription>Cek detail status per tahapan rekrutmen di bawah ini.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ApplicationStatusStepper 
                        application={highestStatusApplication}
                        highestStatus={highestStatus} 
                        isProfileComplete={userProfile?.isProfileComplete || false}
                        isLoading={loading || isLoadingApps}
                    />
                </CardContent>
            </Card>
        )}
    </div>
  );
}
