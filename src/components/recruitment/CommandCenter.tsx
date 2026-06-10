'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { JobApplication, Job } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { differenceInDays, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ArrowRight, AlertCircle, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';

type NeedsActionItem = {
  app: JobApplication;
  reason: string;
  daysWaiting: number;
  actionLabel: string;
};

export function CommandCenter({ applications, jobs }: { applications: JobApplication[]; jobs?: Job[] }) {
    const now = new Date();

    const needsActionItems: NeedsActionItem[] = applications
      .map(app => {
          const daysWaiting = app.updatedAt ? differenceInDays(now, app.updatedAt.toDate()) : 0;
          let reason = '';
          let actionLabel = 'Review';

          if (app.status === 'verification') {
              reason = 'Belum diverifikasi';
              actionLabel = 'Verifikasi';
          } else if (app.status === 'tes_kepribadian' && daysWaiting > 3) {
              reason = 'Assessment menunggu';
              actionLabel = 'Review';
          } else if (app.status === 'interview') {
              const hasScheduledInterview = app.interviews?.some(iv => iv.status === 'scheduled');
              if (!hasScheduledInterview) {
                  reason = 'Interview belum dijadwalkan';
                  actionLabel = 'Jadwalkan';
              } else {
                  reason = '';
              }
          } else if (app.status === 'offered') {
              reason = 'Offering menunggu respon';
              actionLabel = 'Lihat Detail';
          } else if (daysWaiting > 7 && !['hired', 'rejected', 'draft'].includes(app.status)) {
              reason = `Terlalu lama di stage (${daysWaiting} hari)`;
              actionLabel = 'Review';
          }

          return { app, reason, daysWaiting, actionLabel };
      })
      .filter(item => item.reason.length > 0)
      .sort((a, b) => b.daysWaiting - a.daysWaiting)
      .slice(0, 10);

    const upcomingInterviews = applications
      .flatMap(app =>
          (app.interviews || [])
              .filter(iv => iv.status === 'scheduled' && new Date() < iv.startAt.toDate())
              .map(iv => ({ app, interview: iv }))
      )
      .sort((a, b) => a.interview.startAt.toDate().getTime() - b.interview.startAt.toDate().getTime())
      .slice(0, 5);

    const offersPending = applications
      .filter(app =>
          app.status === 'offered' ||
          (app as any).offerStatus?.includes('sent') ||
          (app as any).offerStatus?.includes('viewed')
      )
      .slice(0, 5);


    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                        Needs Action
                    </CardTitle>
                    <CardDescription>Kandidat yang membutuhkan tindakan segera</CardDescription>
                </CardHeader>
                <CardContent>
                    {needsActionItems.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kandidat</TableHead>
                                    <TableHead>Posisi</TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead>Menunggu</TableHead>
                                    <TableHead>Alasan</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {needsActionItems.map(item => (
                                    <TableRow key={item.app.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={item.app.candidatePhotoUrl} />
                                                    <AvatarFallback>{getInitials(item.app.candidateName)}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium text-sm">{item.app.candidateName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{item.app.jobPosition}</TableCell>
                                        <TableCell>
                                            <ApplicationStatusBadge status={item.app.status} />
                                        </TableCell>
                                        <TableCell className={cn('text-sm font-medium', item.daysWaiting > 5 && 'text-red-600')}>
                                            {item.daysWaiting} hari
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{item.reason}</TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild size="sm">
                                                <Link href={`/admin/recruitment/applications/${item.app.id}`}>
                                                    {item.actionLabel} <ArrowRight className="ml-1 h-4 w-4" />
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Tidak ada kandidat yang membutuhkan aksi</p>
                            <p className="text-xs text-muted-foreground mt-1">Semua kandidat dalam status baik</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Calendar className="h-4 w-4 text-blue-600" />
                            Wawancara Mendatang
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {upcomingInterviews.length > 0 ? (
                            upcomingInterviews.map((item, idx) => (
                                <Link
                                    key={`${item.app.id}-${idx}`}
                                    href={`/admin/recruitment/applications/${item.app.id}`}
                                    className="block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <Avatar className="h-7 w-7 flex-shrink-0">
                                                <AvatarImage src={item.app.candidatePhotoUrl} />
                                                <AvatarFallback className="text-xs">
                                                    {getInitials(item.app.candidateName)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold truncate">{item.app.candidateName}</p>
                                                <p className="text-xs text-muted-foreground truncate">{item.app.jobPosition}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        <span>{format(item.interview.startAt.toDate(), 'EEEE, d MMM · HH:mm')}</span>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Calendar className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-2" />
                                <p className="text-xs font-medium text-muted-foreground">Belum ada interview terjadwal</p>
                                <Link href="/admin/recruitment" className="text-xs text-teal-600 dark:text-teal-400 hover:underline mt-2">
                                    Jadwalkan sekarang
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Penawaran Aktif
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {offersPending.length > 0 ? (
                            offersPending.map(app => (
                                <Link
                                    key={app.id}
                                    href={`/admin/recruitment/applications/${app.id}`}
                                    className="block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold truncate">{app.candidateName}</p>
                                            <p className="text-xs text-muted-foreground truncate">{app.jobPosition}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Badge variant="secondary" className="text-xs">
                                            {app.status === 'offered' ? 'Menunggu Respon' : 'Terkirim'}
                                        </Badge>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <CheckCircle2 className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-2" />
                                <p className="text-xs font-medium text-muted-foreground">Tidak ada penawaran aktif</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
