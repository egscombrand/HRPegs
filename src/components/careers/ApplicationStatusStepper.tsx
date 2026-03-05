'use client';

import { Check, Lock, Pencil, Hourglass, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { JobApplication, JobApplicationStatus } from '@/lib/types';
import { statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { Skeleton } from '../ui/skeleton';
import { format } from 'date-fns';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';

// The key stages a candidate sees, in order.
const candidateStages: JobApplicationStatus[] = [
    'submitted', // Represents profile completion and first application
    'tes_kepribadian',
    'document_submission',
    'interview',
    'hired',
];

type StepStatus = 'completed' | 'active' | 'locked' | 'waiting';

interface ApplicationStatusStepperProps {
    application: JobApplication | null;
    highestStatus: JobApplicationStatus | null;
    isProfileComplete: boolean;
    isLoading: boolean;
}

const StepperSkeleton = () => (
    <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-grow pt-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                </div>
            </div>
        ))}
    </div>
);

export function ApplicationStatusStepper({ application, highestStatus, isProfileComplete, isLoading }: ApplicationStatusStepperProps) {
    if (isLoading) {
        return <StepperSkeleton />;
    }

    const getStepDetails = (stage: JobApplicationStatus): { status: StepStatus; cta?: React.ReactNode; reason?: string } => {
        if (!highestStatus) { // Case where user has account but never applied
            if (stage === 'tes_kepribadian' && !isProfileComplete) {
                return { status: 'locked', reason: 'Lengkapi profil Anda untuk membuka tes kepribadian.'};
            }
            return { status: 'locked', reason: 'Lamar pekerjaan pertama Anda untuk memulai tahap ini.' };
        }
        
        const currentHighestIndex = ORDERED_RECRUITMENT_STAGES.indexOf(highestStatus);
        const stepIndex = ORDERED_RECRUITMENT_STAGES.indexOf(stage);

        if (highestStatus === 'rejected') {
            return { status: 'locked', reason: 'Proses lamaran Anda tidak dapat dilanjutkan saat ini.' };
        }

        if (stepIndex < currentHighestIndex) {
            return { status: 'completed' };
        }

        if (stepIndex === currentHighestIndex) {
             switch (stage) {
                case 'submitted':
                case 'screening': // Grouped for candidate view
                    return { status: 'waiting', reason: 'Lamaran Anda sedang ditinjau oleh tim HRD.' };
                case 'tes_kepribadian':
                    return { status: 'active', cta: <Button asChild size="sm"><Link href="/careers/portal/assessment/personality">Kerjakan Tes</Link></Button> };
                case 'document_submission':
                    return { status: 'active', cta: <Button asChild size="sm"><Link href="/careers/portal/documents">Unggah Dokumen</Link></Button> };
                case 'interview':
                     const scheduledInterview = application?.interviews?.find(i => i.status === 'scheduled' && i.startAt.toDate() > new Date());
                    if (scheduledInterview) {
                        return { 
                            status: 'active', 
                            reason: `Wawancara terjadwal: ${format(scheduledInterview.startAt.toDate(), 'dd MMM yyyy, HH:mm')}`, 
                            cta: <Button asChild size="sm"><Link href="/careers/portal/interviews">Lihat Detail</Link></Button> 
                        };
                    }
                     return { status: 'waiting', reason: 'Menunggu jadwal wawancara dari HRD. Jadwal akan muncul di halaman Jadwal Wawancara.' };
                case 'hired':
                    return { status: 'completed', reason: 'Selamat! Anda telah diterima.' };
                case 'verification':
                     return { status: 'waiting', reason: 'Dokumen dan hasil tes Anda sedang diverifikasi oleh HRD.' };
                default:
                    return { status: 'locked' };
            }
        }
        
        return { status: 'locked', reason: 'Selesaikan tahap sebelumnya untuk melanjutkan.' };
    }

    if (!highestStatus && isProfileComplete) {
         return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Profil Anda sudah lengkap! Lamar pekerjaan pertama Anda untuk memulai proses seleksi.</p>
                <Button asChild>
                    <Link href="/careers/portal/jobs">Cari Lowongan</Link>
                </Button>
            </div>
        )
    }

     if (!highestStatus && !isProfileComplete) {
         return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Lengkapi profil Anda untuk dapat memulai proses seleksi dan mengerjakan tes kepribadian.</p>
                <Button asChild>
                    <Link href="/careers/portal/profile">Lengkapi Profil</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {candidateStages.slice(1).map((stage) => { // slice(1) to skip 'submitted'
                 const stepDetails = getStepDetails(stage);
                 const Icon = stepDetails.status === 'completed' ? Check : stage === 'interview' ? Calendar : stepDetails.status === 'active' ? Pencil : stepDetails.status === 'waiting' ? Hourglass : Lock;
                 const stageLabel = statusDisplayLabels[stage] || stage.replace('_', ' ');

                return (
                    <div key={stage} className="flex items-start gap-4">
                        <div className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2',
                            stepDetails.status === 'completed' && 'bg-primary border-primary text-primary-foreground',
                            stepDetails.status === 'active' && 'bg-primary/10 border-primary text-primary',
                            (stepDetails.status === 'locked' || stepDetails.status === 'waiting') && 'bg-muted border-border text-muted-foreground'
                        )}>
                            <Icon className="h-5 w-5"/>
                        </div>
                        <div className="flex-grow pt-1">
                            <h4 className="font-semibold capitalize">{stageLabel}</h4>
                            <p className="text-sm text-muted-foreground">{stepDetails.reason}</p>
                        </div>
                        {stepDetails.cta && (
                            <div className="flex-shrink-0">
                                {stepDetails.cta}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    );
}
