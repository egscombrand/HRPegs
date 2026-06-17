
// This file path is for the new non-locale structure.
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { sendHrdNotification } from '@/lib/notifications';
import {
  collection, query, where, limit, doc, getDocs, serverTimestamp, getDoc,
} from 'firebase/firestore';
import type { Job, JobApplication } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle, Briefcase, Building2, Calendar, CheckCircle2, Clock, Info,
  MapPin, Loader2,
} from 'lucide-react';
import { format, addMonths, differenceInDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { MAX_ACTIVE_APPLICATIONS, ACTIVE_APPLICATION_STATUSES, isApplicationActive } from '@/lib/application-rules';

function JobApplySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
      <Card className="sticky top-20">
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function JobApplyPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [isApplying, setIsApplying] = useState(false);
  const [blockingModal, setBlockingModal] = useState<{
    activeApps: JobApplication[];
  } | null>(null);

  // Fetch Job details
  const jobQuery = useMemoFirebase(() => {
    if (!slug) return null;
    return query(
      collection(firestore, 'jobs'),
      where('slug', '==', slug),
      where('publishStatus', 'in', ['published', 'reopened']),
      limit(1),
    );
  }, [firestore, slug]);
  const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
  const job = jobs?.[0];

  const handleApply = async () => {
    if (!userProfile || !job) return;
    setIsApplying(true);

    try {
      // ── Fetch all applications of this candidate ──────────────────────
      const appsRef = collection(firestore, 'applications');
      const q = query(appsRef, where('candidateUid', '==', userProfile.uid));
      const snap = await getDocs(q);
      const userApplications = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication));

      // 1. Block if already applied to this exact job ─────────────────
      const applicationId = `${job.id}_${userProfile.uid}`;
      if (userApplications.some(app => app.id === applicationId)) {
        toast({
          variant: 'destructive',
          title: 'Lamaran Sudah Ada',
          description: 'Anda sudah pernah melamar untuk posisi ini.',
        });
        router.push('/careers/portal/applications');
        return;
      }

      // 2. Block if active count >= MAX ───────────────────────────────
      const activeApps = userApplications.filter(app => isApplicationActive(app.status));
      if (activeApps.length >= MAX_ACTIVE_APPLICATIONS) {
        setBlockingModal({ activeApps });
        return;
      }

      // 3. Cooldown period (6 months after hired/rejected) ────────────
      const finalApps = userApplications.filter(app =>
        ['hired', 'rejected'].includes(app.status)
      );
      if (finalApps.length > 0) {
        finalApps.sort((a, b) =>
          (b.decisionAt?.toMillis() || b.updatedAt.toMillis()) -
          (a.decisionAt?.toMillis() || a.updatedAt.toMillis())
        );
        const cooldownEnd = addMonths(
          finalApps[0].decisionAt?.toDate() || finalApps[0].updatedAt.toDate(),
          6,
        );
        if (new Date() < cooldownEnd) {
          toast({
            variant: 'destructive',
            title: 'Masa Tunggu Aktif',
            description: `Anda baru dapat melamar lagi setelah ${format(cooldownEnd, 'dd MMMM yyyy', { locale: id })}.`,
          });
          return;
        }
      }

      // 4. Profile & document completeness ───────────────────────────
      const profileSnap = await getDoc(doc(firestore, 'profiles', userProfile.uid));
      if (!profileSnap.exists() || !profileSnap.data().cvUrl || !profileSnap.data().ijazahUrl) {
        toast({
          variant: 'destructive',
          title: 'Dokumen Belum Lengkap',
          description: 'Lengkapi profil dan unggah CV serta Ijazah sebelum melamar.',
        });
        router.push('/careers/portal/profile?step=5');
        return;
      }

      // 5. Check candidate-level personality test status ─────────────
      const candidateTestSnap = await getDoc(
        doc(firestore, 'candidate_personality_tests', userProfile.uid)
      );
      const hasCompletedPersonalityTest =
        candidateTestSnap.exists() && candidateTestSnap.data()?.status === 'completed';
      const existingTestSessionId = hasCompletedPersonalityTest
        ? candidateTestSnap.data()?.sessionId
        : undefined;

      // 6. Build and submit application ──────────────────────────────
      const applicationRef = doc(firestore, 'applications', applicationId);

      const applicationData: Omit<JobApplication, 'id'> = {
        candidateUid: userProfile.uid,
        candidateName: userProfile.fullName,
        candidateEmail: userProfile.email,
        jobId: job.id!,
        jobSlug: job.slug,
        jobPosition: job.position,
        brandId: job.brandId,
        brandName: job.brandName || '',
        jobType: job.statusJob,
        location: job.location,
        jobApplyDeadline: job.applyDeadline || undefined,
        // Personality test fields
        personalityTestRequired: !hasCompletedPersonalityTest,
        personalityTestCompleted: hasCompletedPersonalityTest,
        ...(existingTestSessionId && { personalityTestResultId: existingTestSessionId }),
        // If test already done → go straight to screening (HRD review)
        // If not → tes_kepribadian (must do test first)
        status: hasCompletedPersonalityTest ? 'screening' : 'tes_kepribadian',
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        submittedAt: serverTimestamp() as any,
      };

      await setDocumentNonBlocking(applicationRef, applicationData, { merge: false });

      // Notify HRD (non-blocking)
      sendHrdNotification(firestore, {
        type: 'new_application',
        module: 'recruitment',
        title: 'Lamaran baru masuk',
        message: `${userProfile.fullName} melamar posisi ${job.position}.`,
        targetType: 'application',
        targetId: applicationId,
        actionUrl: `/admin/recruitment/applications/${applicationId}`,
        createdBy: userProfile.uid,
        notificationType: 'recruitment',
        recruitmentEvent: 'new_application',
        priority: 'action_required',
        notifStatus: 'action_required',
        meta: {
          applicationId,
          candidateUid: userProfile.uid,
          candidateName: userProfile.fullName,
          jobId: job.id,
          jobTitle: job.position,
          brandName: job.brandName || '',
          personalityTestSkipped: hasCompletedPersonalityTest,
        },
      }).catch((e) => console.error('Failed to send new-application notification:', e));

      if (hasCompletedPersonalityTest) {
        // Test already done — go to applications page, show success
        toast({
          title: 'Lamaran Terkirim!',
          description: 'Lamaran berhasil dikirim. Hasil tes kepribadian Anda sebelumnya akan digunakan dalam evaluasi.',
        });
        router.push('/careers/portal/applications');
      } else {
        // Must do personality test
        toast({
          title: 'Lamaran Terkirim!',
          description: 'Langkah selanjutnya adalah tes kepribadian. Anda akan diarahkan sekarang.',
        });
        router.push(`/careers/portal/assessment/personality?applicationId=${applicationId}`);
      }

    } catch (error: any) {
      console.error('Application submission error:', error);
      toast({
        variant: 'destructive',
        title: 'Gagal Mengirim Lamaran',
        description: error.message || 'Terjadi kesalahan. Silakan coba lagi.',
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoadingJob || !job) {
    return <JobApplySkeleton />;
  }

  const deadlineDate = job.applyDeadline?.toDate();
  const isDeadlinePassed = deadlineDate && deadlineDate < new Date();
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

  const divisionLabel = job.divisionName || job.division;
  const jobTypeLabel =
    job.statusJob === 'fulltime' ? 'Full-time' :
    job.statusJob === 'internship' ? 'Internship' :
    job.statusJob ?? null;
  const workModeLabel =
    job.workMode === 'onsite' ? 'On-site' :
    job.workMode === 'hybrid' ? 'Hybrid' :
    job.workMode === 'remote' ? 'Remote' : null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* ── Left: Confirmation card ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">Konfirmasi Lamaran</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Periksa kembali ringkasan lowongan dan pastikan profil Anda sudah
                lengkap sebelum mengirim lamaran.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Info box */}
              <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
                  Saat lamaran dikirim, data profil, dokumen, pengalaman, dan
                  informasi pendukung Anda akan diteruskan ke tim rekrutmen untuk
                  proses seleksi.
                </p>
              </div>

              {isDeadlinePassed && (
                <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive font-medium">
                    Pendaftaran untuk lowongan ini telah ditutup.
                  </p>
                </div>
              )}

              <Separator />

              <div className="flex justify-between gap-3 pt-2">
                <Button onClick={() => router.back()} variant="outline">
                  Kembali
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={isApplying || !!isDeadlinePassed}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-8"
                >
                  {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isDeadlinePassed ? 'Pendaftaran Ditutup' : 'Kirim Lamaran'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Job summary card ── */}
        <Card className="sticky top-20 border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Ringkasan Lowongan
            </p>
            <CardTitle className="text-lg leading-snug">{job.position}</CardTitle>
            {job.brandName && (
              <CardDescription className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {job.brandName}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {divisionLabel ? (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{divisionLabel}</span>
              </div>
            ) : null}

            {job.location && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{job.location}</span>
              </div>
            )}

            {(jobTypeLabel || workModeLabel) && (
              <div className="flex items-center gap-2 pt-0.5">
                <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex flex-wrap gap-1.5">
                  {jobTypeLabel && (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {jobTypeLabel}
                    </Badge>
                  )}
                  {workModeLabel && (
                    <Badge variant="outline" className="text-xs font-medium">
                      {workModeLabel}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {deadlineDate && (
              <>
                <Separator className="my-1" />
                <div className="flex items-start gap-2 pt-1">
                  <Clock className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                  <div className="space-y-1">
                    <p className={isDeadlinePassed ? 'text-destructive font-medium' : 'text-slate-700 dark:text-slate-300'}>
                      Batas lamaran:{' '}
                      <span className="font-semibold">
                        {format(deadlineDate, 'd MMMM yyyy', { locale: id })}
                      </span>
                    </p>
                    {isUrgent && !isDeadlinePassed && (
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800 text-xs">
                        Segera berakhir · {daysLeft === 0 ? 'Hari ini' : `${daysLeft} hari lagi`}
                      </Badge>
                    )}
                    {isDeadlinePassed && (
                      <Badge variant="destructive" className="text-xs">Ditutup</Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Blocking modal: max active apps reached ── */}
      <Dialog open={!!blockingModal} onOpenChange={(o) => !o && setBlockingModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Batas Lamaran Aktif Tercapai</DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed">
              Anda sudah memiliki {MAX_ACTIVE_APPLICATIONS} lamaran aktif yang sedang diproses.
              Untuk menjaga kualitas proses seleksi, Anda belum dapat melamar posisi baru
              sampai salah satu lamaran selesai atau tidak dilanjutkan.
            </DialogDescription>
          </DialogHeader>
          {blockingModal && blockingModal.activeApps.length > 0 && (
            <div className="space-y-2 my-1">
              {blockingModal.activeApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{app.jobPosition}</p>
                    <p className="text-xs text-muted-foreground">{app.brandName}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                    {app.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => { setBlockingModal(null); router.push('/careers/portal/applications'); }}
            >
              Lihat Lamaran Saya
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
