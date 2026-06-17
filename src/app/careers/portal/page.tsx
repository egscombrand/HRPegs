'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  ArrowRight, Briefcase, FileText, User, CheckCircle2, Circle,
  BrainCircuit, ClipboardList, ShieldCheck, Clock, Calendar,
  MapPin, Building, ChevronRight, Sparkles, TrendingUp,
  AlertCircle, Video, XCircle
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, AssessmentSession, Job } from '@/lib/types';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, differenceInDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draf',
  submitted: 'Lamaran Dikirim',
  tes_kepribadian: 'Tes Kepribadian',
  screening: 'Dalam Evaluasi',
  verification: 'Dalam Evaluasi',
  document_submission: 'Dalam Evaluasi',
  interview: 'Wawancara',
  offered: 'Penawaran Kerja',
  hired: 'Diterima',
  rejected: 'Tidak Dilanjutkan',
};

const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
  tes_kepribadian: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
  screening: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300',
  verification: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300',
  document_submission: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300',
  interview: 'bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
  offered: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300',
  hired: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300',
  rejected: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
};

// 4-stage candidate-facing timeline (matches Lamaran Saya page)
const TIMELINE_STAGES = [
  { key: 'start',     label: 'Lamaran & Tes Kepribadian' },
  { key: 'eval',      label: 'Evaluasi HRD'              },
  { key: 'interview', label: 'Wawancara'                 },
  { key: 'decision',  label: 'Keputusan Akhir'           },
];

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();
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
  const { data: assessmentSessions } = useCollection<AssessmentSession>(sessionsQuery);

  const jobsQuery = useMemoFirebase(
    () => query(collection(firestore, 'jobs'), where('publishStatus', 'in', ['published', 'reopened'])),
    [firestore]
  );
  const { data: allJobs } = useCollection<Job>(jobsQuery);

  const hasFinishedTest = assessmentSessions?.some(s => s.status === 'submitted') || false;
  const isProfileComplete = !!userProfile?.isProfileComplete;

  const stats = useMemo(() => {
    if (!applications) return { total: 0, active: 0, interview: 0, offered: 0, rejected: 0 };
    return {
      total: applications.length,
      active: applications.filter(a => !['rejected', 'hired', 'draft'].includes(a.status)).length,
      interview: applications.filter(a => a.status === 'interview').length,
      offered: applications.filter(a => a.status === 'offered').length,
      rejected: applications.filter(a => a.status === 'rejected').length,
    };
  }, [applications]);

  const recentApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications]
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, 3);
  }, [applications]);

  const highestStatusApp = useMemo(() => {
    if (!applications) return null;
    const active = applications.filter(a => a.status !== 'rejected');
    if (!active.length) return null;
    return active.reduce((best, app) => {
      const i = ORDERED_RECRUITMENT_STAGES.indexOf(app.status);
      const bestI = ORDERED_RECRUITMENT_STAGES.indexOf(best.status);
      return i > bestI ? app : best;
    });
  }, [applications]);

  const upcomingInterviews = useMemo(() => {
    if (!applications) return [];
    const now = new Date();
    return applications
      .flatMap(app => (app.interviews || []).map(iv => ({ ...iv, app })))
      .filter(iv => iv.status === 'scheduled' && iv.startAt?.toDate() > now)
      .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
      .slice(0, 3);
  }, [applications]);

  const appliedJobIds = useMemo(() => new Set(applications?.map(a => a.jobId) || []), [applications]);

  const recommendedJobs = useMemo(() => {
    if (!allJobs) return [];
    return allJobs
      .filter(job => {
        if (appliedJobIds.has(job.id!)) return false;
        const deadline = job.applyDeadline || job.applicationDeadline;
        if (deadline && isPast(deadline.toDate())) return false;
        return true;
      })
      .slice(0, 3);
  }, [allJobs, appliedJobIds]);

  const profileProgress = useMemo(() => {
    const steps = [
      { done: isProfileComplete, label: 'Profil Pribadi' },
      { done: hasFinishedTest, label: 'Tes Kepribadian' },
      { done: stats.total > 0, label: 'Lamaran Pekerjaan' },
    ];
    const done = steps.filter(s => s.done).length;
    return { steps, percent: Math.round((done / steps.length) * 100) };
  }, [isProfileComplete, hasFinishedTest, stats.total]);

  const firstName = userProfile?.fullName?.split(' ')[0] || 'Kandidat';
  const isRejected = highestStatusApp?.status === 'rejected';

  // Map application status → 4-stage timeline index (0-3), -1 = rejected/none
  const timelineIndex = useMemo(() => {
    if (!highestStatusApp || isRejected) return -1;
    const s = highestStatusApp.status;
    if (['submitted', 'tes_kepribadian'].includes(s)) return 0;
    // Once test is done and still in processing stages → stage 0 complete, stage 1 active
    if (['screening', 'verification', 'document_submission'].includes(s)) {
      return hasFinishedTest ? 1 : 0;
    }
    if (s === 'interview') return 2;
    if (['offered', 'hired'].includes(s)) return 3;
    return 0;
  }, [highestStatusApp, isRejected, hasFinishedTest]);

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Halo, {firstName}! 👋
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Berikut ringkasan status lamaran dan aktivitas Anda.
          </p>
        </div>
        <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700 text-white shrink-0">
          <Link href="/careers/portal/jobs">
            <Briefcase className="h-3.5 w-3.5 mr-1.5" />
            Cari Lowongan
          </Link>
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Lamaran', value: stats.total, icon: Briefcase, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: 'Sedang Diproses', value: stats.active, icon: TrendingUp, color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Jadwal Wawancara', value: upcomingInterviews.length, icon: Calendar, color: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-50 dark:bg-teal-950/30' },
          { label: 'Penawaran', value: stats.offered, icon: Sparkles, color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'Tidak Lanjut', value: stats.rejected, icon: XCircle, color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-4">
              <div className={cn('inline-flex items-center justify-center h-8 w-8 rounded-lg mb-3', bg)}>
                <Icon className={cn('h-4 w-4', color)} />
              </div>
              <div className={cn('text-2xl font-bold', color)}>{value}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Applications */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-teal-600" />
                  Lamaran Terbaru
                </CardTitle>
                {recentApplications.length > 0 && (
                  <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-teal-600 hover:text-teal-700">
                    <Link href="/careers/portal/applications">
                      Lihat Semua <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingApps ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  ))}
                </div>
              ) : recentApplications.length > 0 ? (
                recentApplications.map(app => (
                  <div key={app.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {app.jobPosition}
                        </p>
                        <Badge className={cn('shrink-0 text-xs border-0', STATUS_COLOR[app.status])}>
                          {STATUS_LABEL[app.status] || app.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {app.brandName}
                        </span>
                        {app.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {app.location}
                          </span>
                        )}
                        {app.createdAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(app.createdAt.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/careers/portal/applications/${app.id}`}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center space-y-3">
                  <Briefcase className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Belum ada lamaran aktif</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Mulai cari lowongan yang sesuai dengan minat Anda.
                    </p>
                  </div>
                  <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Link href="/careers/portal/jobs">Lihat Lowongan</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selection Timeline */}
          {highestStatusApp && (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                  Tahap Seleksi — {highestStatusApp.jobPosition}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isRejected ? (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <XCircle className="h-5 w-5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Lamaran ini tidak dilanjutkan</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tetap semangat! Masih banyak peluang karir lainnya.</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center justify-between relative">
                      {/* base connecting line */}
                      <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-800 z-0" />
                      {/* filled progress line */}
                      <div
                        className="absolute top-4 left-0 h-0.5 bg-teal-500 z-0 transition-all duration-500"
                        style={{ width: timelineIndex >= 0 ? `${(timelineIndex / (TIMELINE_STAGES.length - 1)) * 100}%` : '0%' }}
                      />
                      {TIMELINE_STAGES.map((stage, i) => {
                        const done = i < timelineIndex;
                        const active = i === timelineIndex;
                        return (
                          <div key={stage.key} className="flex flex-col items-center gap-2 z-10 flex-1">
                            <div className={cn(
                              'h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all',
                              done  ? 'bg-teal-500 border-teal-500 text-white' :
                              active ? 'bg-white dark:bg-slate-900 border-teal-500 text-teal-600 ring-4 ring-teal-100 dark:ring-teal-950' :
                                       'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                            )}>
                              {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                            </div>
                            <span className={cn(
                              'text-[10px] text-center leading-tight',
                              i === 0 ? 'max-w-[72px]' : 'max-w-[56px]',
                              active ? 'font-bold text-teal-600 dark:text-teal-400' :
                              done   ? 'text-slate-600 dark:text-slate-400' :
                                       'text-slate-400 dark:text-slate-600'
                            )}>
                              {stage.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recommended Jobs */}
          {recommendedJobs.length > 0 && (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    Rekomendasi Lowongan
                  </CardTitle>
                  <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-teal-600 hover:text-teal-700">
                    <Link href="/careers/portal/jobs">
                      Semua <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {recommendedJobs.map(job => {
                  const deadline = job.applyDeadline || job.applicationDeadline;
                  const daysLeft = deadline ? differenceInDays(deadline.toDate(), new Date()) : null;
                  return (
                    <div key={job.id} className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{job.position}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Building className="h-3 w-3" />{job.brandName}
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{job.location}
                          </span>
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            {job.statusJob === 'fulltime' ? 'Full-time' : 'Internship'}
                          </Badge>
                          {daysLeft !== null && (
                            <span className={cn('text-[10px] font-medium',
                              daysLeft <= 7 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'
                            )}>
                              {daysLeft === 0 ? 'Berakhir hari ini' : `${daysLeft} hari lagi`}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button asChild size="sm" className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700 text-white shrink-0">
                        <Link href={`/careers/portal/jobs/${job.slug}`}>
                          Lihat
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Upcoming Interview */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-teal-600" />
                Jadwal Wawancara
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingInterviews.length > 0 ? (
                <div className="space-y-3">
                  {upcomingInterviews.map((iv, i) => (
                    <div key={i} className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 space-y-2">
                      <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">{iv.app.jobPosition}</p>
                      <div className="text-xs text-teal-700 dark:text-teal-400 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(iv.startAt.toDate(), "EEEE, dd MMM yyyy", { locale: idLocale })}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {format(iv.startAt.toDate(), "HH:mm", { locale: idLocale })} WIB
                        </div>
                        {iv.meetingLink && (
                          <div className="flex items-center gap-1.5">
                            <Video className="h-3.5 w-3.5" />
                            <a href={iv.meetingLink} target="_blank" rel="noopener noreferrer"
                              className="underline underline-offset-2 truncate">
                              Link Meeting
                            </a>
                          </div>
                        )}
                      </div>
                      <Button asChild size="sm" className="h-7 w-full text-xs bg-teal-600 hover:bg-teal-700 text-white mt-1">
                        <Link href={`/careers/portal/applications/${iv.app.id}`}>
                          Lihat Detail
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center space-y-2">
                  <Calendar className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Belum ada jadwal wawancara.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evaluasi & Status */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Evaluasi & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  label: 'Profil Pelamar',
                  status: isProfileComplete ? 'Lengkap' : 'Belum Lengkap',
                  done: isProfileComplete,
                  href: '/careers/portal/profile',
                },
                {
                  label: 'Tes Kepribadian',
                  status: hasFinishedTest ? 'Selesai' :
                    assessmentSessions?.some(s => s.status === 'draft') ? 'Sedang Dikerjakan' : 'Belum Dikerjakan',
                  done: hasFinishedTest,
                  href: '/careers/portal/assessment/personality',
                },
                {
                  label: 'Analisis CV',
                  status: isProfileComplete && stats.total > 0 ? 'Dalam Review HRD' : 'Menunggu Lamaran',
                  done: false,
                  neutral: true,
                },
                {
                  label: 'Kesesuaian Posisi',
                  status: stats.active > 0 ? 'Dalam Review HRD' : stats.total === 0 ? 'Belum Ada Lamaran' : 'Selesai',
                  done: false,
                  neutral: true,
                },
              ].map(({ label, status, done, neutral, href }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                    ) : neutral ? (
                      <AlertCircle className="h-4 w-4 text-blue-400 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                    )}
                    <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                  </div>
                  {href ? (
                    <Link href={href} className={cn('text-xs font-medium shrink-0',
                      done ? 'text-teal-600 dark:text-teal-400' : 'text-orange-500 dark:text-orange-400 underline underline-offset-2'
                    )}>
                      {status}
                    </Link>
                  ) : (
                    <span className={cn('text-xs font-medium shrink-0',
                      neutral ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                    )}>
                      {status}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Registration Progress */}
          <Card className={cn('border-2',
            profileProgress.percent === 100
              ? 'border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10'
              : 'border-slate-200 dark:border-slate-800'
          )}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-teal-600" />
                  Kelengkapan Pendaftaran
                </CardTitle>
                <span className={cn('text-sm font-bold',
                  profileProgress.percent === 100 ? 'text-green-600' : 'text-teal-600'
                )}>
                  {profileProgress.percent}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${profileProgress.percent}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {profileProgress.steps.map(({ done, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                  )}
                  <span className={cn('text-sm', done ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600')}>
                    {label}
                  </span>
                  {done && <span className="ml-auto text-[10px] font-bold text-teal-500 uppercase">✓ Selesai</span>}
                </div>
              ))}
              {profileProgress.percent < 100 && (
                <Button asChild size="sm" className="w-full mt-2 h-8 bg-teal-600 hover:bg-teal-700 text-white text-xs">
                  <Link href={!isProfileComplete ? '/careers/portal/profile' : !stats.total ? '/careers/portal/jobs' : '/careers/portal/assessment/personality'}>
                    Lanjutkan Pendaftaran <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              )}
              {profileProgress.percent === 100 && (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium text-center pt-1">
                  🎉 Pendaftaran lengkap! Tim HRD akan menghubungi Anda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
