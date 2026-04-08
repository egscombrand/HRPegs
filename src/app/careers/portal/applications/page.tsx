'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp } from 'firebase/firestore';
import type { JobApplication, JobApplicationStatus, AssessmentSession } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Check, Briefcase, Building, FileSignature, FileUp, ClipboardCheck, Users, Award, XCircle, BrainCircuit, FileText, Search, Calendar, Link as LinkIcon, FileClock, Loader2 } from "lucide-react";
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { useToast } from '@/hooks/use-toast';


function ApplicationCard({ application, hasCompletedTest }: { application: JobApplication, hasCompletedTest: boolean }) {
  const [now, setNow] = useState(new Date());
  const [isDeciding, setIsDeciding] = React.useState(false);
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); 
    return () => clearInterval(timer);
  }, []);

  const handleDecision = async (decision: 'accepted' | 'rejected') => {
    if (!firebaseUser) {
      toast({ variant: 'destructive', title: 'Error', description: 'Anda harus login.' });
      return;
    }
    setIsDeciding(true);
    try {
      const appRef = doc(firestore, 'applications', application.id!);
      const payload: any = {
        offerStatus: decision,
        candidateOfferDecisionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (decision === 'rejected') {
        payload.status = 'rejected';
      }
      await updateDocumentNonBlocking(appRef, payload);
      toast({ title: 'Keputusan Terkirim', description: `Anda telah berhasil ${decision === 'accepted' ? 'menerima' : 'menolak'} penawaran ini.` });
    } catch (error: any) {
      console.error('Failed to submit decision:', error);
      toast({ variant: 'destructive', title: 'Gagal Menyimpan Keputusan', description: error.message });
    } finally {
      setIsDeciding(false);
    }
  };

  const formatSalary = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '-';
    return `Rp ${value.toLocaleString('id-ID')}`;
  };

  const scheduledInterview = useMemo(() => {
    if (!application.interviews || application.interviews.length === 0) return null;
    const now = new Date().getTime();
    const scheduledInterviews = application.interviews.filter(i => i.status === 'scheduled');
    if (scheduledInterviews.length === 0) return null;
    
    const upcoming = scheduledInterviews
      .filter(i => i.startAt.toDate().getTime() >= now)
      .sort((a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime());
      
    if (upcoming.length > 0) return upcoming[0];

    const past = scheduledInterviews
      .filter(i => i.startAt.toDate().getTime() < now)
      .sort((a, b) => b.startAt.toDate().getTime() - a.startAt.toDate().getTime());

    if (past.length > 0) return past[0];
    
    return null;
  }, [application.interviews]);
  
  const isRejected = application.status === 'rejected';
  const isHired = application.status === 'hired' && application.internalAccessEnabled === true;
  const isOffered = application.status === 'offered';
  const isInterviewStage = application.status === 'interview';
  const isAssessmentStage = application.status === 'tes_kepribadian';
  const isProcessing = ['screening', 'verification', 'document_submission', 'interview'].includes(application.status);

  if (isOffered) {
    const salaryLabel = application.jobType === 'internship' ? 'Uang Saku' : 'Gaji';
    if (application.offerStatus === 'sent') {
      return (
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                <div>
                    <CardTitle className="text-xl">Penawaran Kerja: {application.jobPosition}</CardTitle>
                    <CardDescription>
                    Berdasarkan hasil tahapan seleksi yang telah Anda ikuti, kami menyampaikan penawaran kerja untuk posisi ini. Mohon tinjau seluruh detail penawaran dengan saksama. Keputusan yang Anda berikan bersifat final dan tidak dapat diubah melalui sistem.
                    </CardDescription>
                </div>
                <Badge className="w-fit bg-primary/80">Menunggu Keputusan Anda</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-4 text-sm">
                <div><p className="text-muted-foreground">{salaryLabel}</p><p className="font-bold text-lg">{formatSalary(application.offeredSalary)} / bulan</p></div>
                <div><p className="text-muted-foreground">Tipe Pekerjaan</p><p className="font-semibold capitalize">{application.jobType}</p></div>
                <div><p className="text-muted-foreground">Durasi Kontrak</p><p className="font-semibold">{application.contractDurationMonths} bulan</p></div>
                {application.probationDurationMonths && <div><p className="text-muted-foreground">Masa Percobaan</p><p className="font-semibold">{application.probationDurationMonths} bulan</p></div>}
                <div><p className="text-muted-foreground">Tanggal Mulai</p><p className="font-semibold">{application.contractStartDate ? format(application.contractStartDate.toDate(), 'dd MMMM yyyy, HH:mm', { locale: id }) : '-'}</p></div>
                <div><p className="text-muted-foreground">Tanggal Selesai</p><p className="font-semibold">{application.contractEndDate ? format(application.contractEndDate.toDate(), 'dd MMMM yyyy', { locale: id }) : '-'}</p></div>
            </div>
            {application.offerNotes && <p className="text-xs text-muted-foreground italic pt-2"><strong>Catatan:</strong> {application.offerNotes}</p>}
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-end items-center gap-2">
            <Button onClick={() => handleDecision('rejected')} variant="outline" disabled={isDeciding} className="w-full sm:w-auto">Tolak Penawaran</Button>
            <Button onClick={() => handleDecision('accepted')} disabled={isDeciding} className="w-full sm:w-auto">
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Terima Penawaran
            </Button>
          </CardFooter>
        </Card>
      );
    }
    
    if (application.offerStatus === 'accepted') {
        return (
            <Card className="flex flex-col bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="text-xl text-blue-800 dark:text-blue-200">{application.jobPosition}</CardTitle>
                            <CardDescription className="flex items-center gap-2 pt-1 text-blue-700 dark:text-blue-300"><Building className="h-4 w-4" /> {application.brandName}</CardDescription>
                        </div>
                        <Badge className="w-fit bg-blue-600 hover:bg-blue-700">Penawaran Diterima</Badge>
                    </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-4">
                    <div className="p-4 rounded-md border-dashed border-blue-400 bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100">
                        <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><FileClock className="h-5 w-5" /> Anda telah menyetujui penawaran kerja ini.</h3>
                        <p className="text-sm">Silakan menunggu proses aktivasi akun dan arahan onboarding dari tim HRD.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }
  }

  if (isHired) {
    return (
        <Card className="flex flex-col bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                    <div>
                        <CardTitle className="text-xl text-green-800 dark:text-green-200">{application.jobPosition}</CardTitle>
                        <CardDescription className="flex items-center gap-2 pt-1 text-green-700 dark:text-green-300"><Building className="h-4 w-4" /> {application.brandName}</CardDescription>
                    </div>
                    <Badge className="w-fit bg-green-600 hover:bg-green-700">Akun Diaktifkan</Badge>
                </div>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                <div className="p-4 rounded-md border-dashed border-green-400 bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100">
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Award className="h-5 w-5" /> Selamat! Anda sekarang adalah bagian dari tim.</h3>
                    <p className="text-sm">Akun Anda telah diaktifkan. Silakan logout, kemudian login kembali melalui Portal Karyawan untuk mengakses dasbor internal Anda.</p>
                </div>
            </CardContent>
            <CardFooter className="bg-green-100/50 dark:bg-green-900/20 p-4 border-t border-green-200 dark:border-green-800 flex justify-end">
                <Button asChild><Link href="/admin/login">Ke Portal Karyawan <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardFooter>
        </Card>
    );
  }

  if (isAssessmentStage) {
    return (
        <Card className="flex flex-col border-yellow-500/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                <div>
                    <CardTitle className="text-xl">Langkah Selanjutnya: {application.jobPosition}</CardTitle>
                    <CardDescription>
                    Anda diundang untuk menyelesaikan tes kepribadian sebagai bagian dari proses seleksi.
                    </CardDescription>
                </div>
                <Badge className="w-fit bg-yellow-500/80 text-yellow-900">Menunggu Tes</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
             <div className="p-4 rounded-md border-dashed border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100">
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><BrainCircuit className="h-5 w-5" /> Tes Kepribadian</h3>
                <p className="text-sm">Hasil tes ini merupakan bagian penting dari proses seleksi kami. Silakan selesaikan tes ini untuk melanjutkan ke tahap berikutnya. Tes ini tidak memiliki batas waktu, namun kami sarankan untuk menyelesaikannya sesegera mungkin.</p>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex justify-end">
            <Button asChild>
              <Link href={`/careers/portal/assessment/personality?applicationId=${application.id}`}>
                Mulai Tes Kepribadian <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
                <CardTitle className="text-xl">{application.jobPosition}</CardTitle>
                <CardDescription className="flex items-center gap-2 pt-1">
                    <Building className="h-4 w-4" /> {application.brandName}
                </CardDescription>
            </div>
             <Badge variant={isRejected ? 'destructive' : isHired ? 'default' : 'secondary'} className={cn("w-fit", application.offerStatus === 'accepted' && "bg-blue-600 hover:bg-blue-600")}>
                {application.offerStatus === 'accepted' ? 'Penawaran Diterima' : statusDisplayLabels[application.status]}
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <Separator />
        
        {isRejected ? (
            <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                <XCircle className="h-5 w-5" />
                <div className="text-sm font-medium">
                    <p>
                        {application.offerStatus === 'rejected'
                        ? 'Anda telah menolak penawaran kerja ini. Proses rekrutmen untuk posisi ini telah selesai.'
                        : 'Terima kasih atas minat Anda. Saat ini kami belum dapat melanjutkan proses lamaran Anda.'}
                    </p>
                </div>
            </div>
        ) : (
             <div className="p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100">
                <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800 dark:text-blue-100"><FileClock className="h-5 w-5" /> Lamaran Anda Sedang Diproses</h3>
                <p className="text-sm mt-2 leading-relaxed">Terima kasih telah melamar posisi <strong>{application.jobPosition}</strong>. Lamaran Anda telah kami terima dan sedang dalam proses peninjauan oleh tim rekrutmen.</p>
                <ul className="mt-3 space-y-2 text-sm list-disc list-inside text-blue-800/80 dark:text-blue-200/80">
                    <li>Proses evaluasi membutuhkan waktu karena banyaknya aplikasi yang masuk.</li>
                    <li>Kami akan menghubungi Anda jika profil Anda sesuai untuk tahap selanjutnya.</li>
                    <li>Anda dapat memantau status lamaran Anda di halaman ini.</li>
                </ul>
                <p className="text-xs mt-3 italic text-blue-800/80 dark:text-blue-200/80">
                   Profil Anda akan kami simpan untuk pertimbangan di masa depan.
                </p>
                {isProcessing && !hasCompletedTest && (
                  <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/50">
                    <p className="font-bold text-blue-900 dark:text-blue-200">
                      Percepat proses Anda
                    </p>
                    <p className="text-xs mt-1">
                      Selesaikan tes kepribadian untuk mempercepat proses screening. Hasil tes ini akan berlaku untuk semua lamaran Anda.
                    </p>
                    <Button asChild size="sm" className="mt-3">
                        <Link href="/careers/portal/assessment/personality">
                            Lanjut ke Tes Kepribadian <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                  </div>
                )}
            </div>
        )}

      </CardContent>
      <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-between items-center min-h-[76px] gap-4">
        <div className="flex-1">
          {isInterviewStage && scheduledInterview ? (
            <div>
                <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> JADWAL WAWANCARA</p>
                <p className="text-sm font-semibold">{format(scheduledInterview.startAt.toDate(), 'eeee, dd MMM yyyy', { locale: id })}</p>
                <p className="text-sm font-semibold">{format(scheduledInterview.startAt.toDate(), 'HH:mm', { locale: id })} - {format(scheduledInterview.endAt.toDate(), 'HH:mm')} WIB</p>
            </div>
          ) : application.submittedAt ? (
            <div>
                <p className="text-xs text-muted-foreground">Lamaran Dikirim:</p>
                <p className="text-sm font-semibold">{format(application.submittedAt.toDate(), 'dd MMM yyyy, HH:mm', { locale: id })} WIB</p>
            </div>
          ) : (
            <div></div> // Placeholder for alignment
          )}
        </div>
        
        <div className="flex-shrink-0 w-full sm:w-auto">
          {isInterviewStage && scheduledInterview && (
             <Button asChild size="sm" className="w-full">
                <a href={scheduledInterview.meetingLink} target="_blank" rel="noopener noreferrer">
                    <LinkIcon className="mr-2 h-4 w-4" /> Buka Link Wawancara
                </a>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function ApplicationsPageSkeleton() {
    return (
        <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-48" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-6 w-24" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-16 w-full" />
                    </CardContent>
                    <CardFooter className="bg-muted/50 p-4 border-t flex justify-between items-center">
                         <Skeleton className="h-4 w-40" />
                         <Skeleton className="h-9 w-32" />
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

export default function ApplicationsPage() {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const uid = userProfile?.uid;

    const applicationsQuery = useMemoFirebase(() => {
        if (!uid) return null;
        return query(
            collection(firestore, 'applications'),
            where('candidateUid', '==', uid)
        );
    }, [uid, firestore]);

    const { data: applications, isLoading: applicationsLoading, error } = useCollection<JobApplication>(applicationsQuery);

    const sessionsQuery = useMemoFirebase(() => {
      if (!uid) return null;
      return query(
        collection(firestore, 'assessment_sessions'),
        where('candidateUid', '==', uid),
        where('status', '==', 'submitted')
      );
    }, [uid, firestore]);
    const { data: submittedSessions, isLoading: sessionsLoading } = useCollection<AssessmentSession>(sessionsQuery);

    const hasCompletedTest = useMemo(() => (submittedSessions?.length ?? 0) > 0, [submittedSessions]);

    const sortedApplications = useMemo(() => {
        if (!applications) return [];
        return [...applications].sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });
    }, [applications]);

    const isLoading = authLoading || applicationsLoading || sessionsLoading;

    if (error) {
        return (
            <div className="p-4 border-2 border-dashed border-destructive/50 rounded-lg bg-red-50 text-destructive-foreground">
                <h3 className="font-bold text-lg mb-2 text-destructive">Terjadi Kesalahan</h3>
                <p>Gagal memuat data lamaran Anda. Silakan coba lagi nanti.</p>
                <pre className="mt-4 text-xs bg-white p-2 rounded overflow-auto text-destructive">{error.message}</pre>
            </div>
        )
    }

    return (
        <div className="space-y-6">
             <div>
                <h1 className="text-3xl font-bold tracking-tight">Lamaran Saya</h1>
                <p className="text-muted-foreground">Riwayat dan status lamaran pekerjaan yang telah Anda kirimkan atau simpan sebagai draf.</p>
            </div>
            
            {isLoading ? (
                <ApplicationsPageSkeleton />
            ) : sortedApplications && sortedApplications.length > 0 ? (
                <div className="space-y-6">
                    {sortedApplications.map(app => (
                        <ApplicationCard 
                            key={app.id} 
                            application={app} 
                            hasCompletedTest={hasCompletedTest}
                        />
                    ))}
                </div>
            ) : (
                <Card className="h-64 flex flex-col items-center justify-center text-center">
                     <CardHeader>
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <Briefcase className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <CardTitle className="mt-4">Anda Belum Pernah Melamar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Semua lamaran Anda akan muncul di sini.</p>
                    </CardContent>
                    <CardFooter>
                        <Button asChild>
                            <Link href="/careers/portal/jobs">Cari Lowongan Sekarang</Link>
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}
    
