'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Briefcase, User } from 'lucide-react';
import React, { useMemo } from 'react';
import { ApplicationStatusStepper } from '@/components/careers/ApplicationStatusStepper';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, JobApplicationStatus } from '@/lib/types';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';

export default function CandidateDashboardPage() {
  const { userProfile, loading } = useAuth();
  const firestore = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'applications'), where('candidateUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const { data: applications, isLoading: isLoadingApps } = useCollection<JobApplication>(applicationsQuery);

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
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Lacak progres lamaran dan selesaikan langkah selanjutnya.</p>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle>Proses Lamaran Anda</CardTitle>
                <CardDescription>Berikut adalah status dan langkah selanjutnya dalam proses seleksi Anda secara keseluruhan.</CardDescription>
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

        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <Briefcase className="h-6 w-6 text-primary" />
                        Daftar Lowongan
                    </CardTitle>
                    <CardDescription>Jelajahi semua lowongan yang tersedia dan temukan yang cocok untuk Anda.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild className="w-full">
                        <Link href="/careers/portal/jobs">
                            Lihat Semua Lowongan
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <User className="h-6 w-6 text-primary" />
                        Kelola Profil
                    </CardTitle>
                    <CardDescription>Perbarui informasi pribadi dan kelola dokumen pendukung Anda.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Button asChild className="w-full">
                        <Link href="/careers/portal/profile">
                            Pergi ke Profil
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
