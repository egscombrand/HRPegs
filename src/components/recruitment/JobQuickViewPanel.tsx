'use client';

import { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit, orderBy } from 'firebase/firestore';
import type { Job, JobApplication, UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { ArrowRight, Users, Briefcase, FileText, CheckCircle, Clock } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import Link from 'next/link';
import { Skeleton } from '../ui/skeleton';
import { Loader2 } from 'lucide-react';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { getApplicationDisplayStage, getApplicationFilterStage } from '@/lib/recruitment/application-stage';

interface JobQuickViewPanelProps {
  job: Job & { brandName?: string };
  assignedUsers: UserProfile[];
}

const StatCard = ({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) => (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
        </div>
        <div>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
        </div>
    </div>
);


export function JobQuickViewPanel({ job, assignedUsers }: JobQuickViewPanelProps) {
  const firestore = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    return query(
      collection(firestore, 'applications'),
      where('jobId', '==', job.id!)
    );
  }, [firestore, job.id]);

  const { data: applications, isLoading } = useCollection<JobApplication>(applicationsQuery);

  const summary = useMemo(() => {
    if (!applications) {
      return { total: 0, screening: 0, interview: 0, offer: 0 };
    }
    
    const screening = applications.filter(a => getApplicationFilterStage(a) === 'screening').length;
    const interview = applications.filter(a => getApplicationFilterStage(a) === 'interview').length;
    const offer = applications.filter(a => getApplicationFilterStage(a) === 'offered').length;
    
    return {
      total: applications.length,
      screening,
      interview,
      offer,
    };
  }, [applications]);

  const latestApplicants = useMemo(() => {
    if (!applications) return [];
    return [...applications]
        .sort((a,b) => (b.submittedAt?.toMillis() || b.createdAt.toMillis()) - (a.submittedAt?.toMillis() || a.createdAt.toMillis()))
  }, [applications]);

  return (
    <div className="p-6 space-y-6">
        <div className="space-y-3">
            <h4 className="font-semibold text-xs uppercase text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" /> Tim Rekrutmen</h4>
            <div className="flex flex-wrap gap-2">
                {assignedUsers.map(user => (
                    <div key={user.uid} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/50 text-xs">
                        <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">{getInitials(user.fullName)}</AvatarFallback>
                        </Avatar>
                        <span>{user.fullName}</span>
                    </div>
                ))}
                {assignedUsers.length === 0 && <p className="text-xs text-muted-foreground">Belum ada tim yang ditugaskan.</p>}
            </div>
        </div>

        <Separator />
        
        <div className="space-y-3">
            <h4 className="font-semibold text-xs uppercase text-muted-foreground flex items-center gap-2"><Briefcase className="h-4 w-4" /> Ringkasan Kandidat</h4>
            {isLoading ? <div className="h-24 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
            <div className="grid grid-cols-2 gap-3">
                <StatCard title="Total" value={summary.total} icon={<Users className="h-5 w-5" />} />
                <StatCard title="Screening" value={summary.screening} icon={<CheckCircle className="h-5 w-5" />} />
                <StatCard title="Interview" value={summary.interview} icon={<FileText className="h-5 w-5" />} />
                <StatCard title="Offer" value={summary.offer} icon={<Clock className="h-5 w-5" />} />
            </div>
            }
        </div>
        
        <Separator />

        <div className="space-y-3">
            <h4 className="font-semibold text-xs uppercase text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" /> Kandidat Terbaru</h4>
             {isLoading ? <div className="h-24 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
             latestApplicants.length > 0 ? (
                <div className="space-y-2">
                    {latestApplicants.slice(0, 3).map(app => (
                        <div key={app.id} className="flex items-center gap-3">
                             <Avatar className="h-8 w-8 border">
                                <AvatarFallback>{getInitials(app.candidateName)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-sm">
                                <p className="font-medium truncate">{app.candidateName}</p>
                            </div>
                            <ApplicationStatusBadge status={getApplicationDisplayStage(app).displayStage} className="text-[10px]" />
                        </div>
                    ))}
                    {latestApplicants.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center pt-2">
                            + {latestApplicants.length - 3} kandidat lainnya
                        </p>
                    )}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada kandidat untuk lowongan ini.</p>
            )}
        </div>
        
        <Separator />

        <Button asChild className="w-full">
            <Link href={`/admin/recruitment/jobs/${job.id}`}>
                Lihat Detail Lowongan <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
        </Button>
    </div>
  );
}
