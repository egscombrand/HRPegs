
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import type { JobApplication, ApplicationInterview, Job } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link as LinkIcon, Calendar, Video, RefreshCw, Users, Info } from "lucide-react";
import { add, set, format, differenceInMinutes, isBefore } from 'date-fns';
import { id } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RescheduleRequestDialog } from '@/components/recruitment/RescheduleRequestDialog';
import Link from 'next/link';

interface EnrichedInterview extends ApplicationInterview {
  application: JobApplication;
  interviewIndex: number;
  isTemplate?: boolean;
}

function InterviewCard({ interview, onMutate }: { interview: EnrichedInterview, onMutate: () => void }) {
    const [isUpcoming, setIsUpcoming] = useState<boolean | null>(null);

    const safeToDate = (ts: any): Date | null => {
        if (!ts) return null;
        if (ts instanceof Date) return ts; // Already a Date object
        if (typeof ts.toDate === 'function') return ts.toDate(); // Firestore Timestamp
        return null;
    };
    
    const startDate = safeToDate(interview.startAt);
    const endDate = safeToDate(interview.endAt);

    useEffect(() => {
        const checkDate = () => {
            const now = new Date();
            if (startDate) {
                setIsUpcoming(startDate > now);
            } else {
                setIsUpcoming(null);
            }
        };
        checkDate();
        const timer = setInterval(checkDate, 60000); // Check every minute
        return () => clearInterval(timer);
    }, [startDate]);
    
    const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
    const { isTemplate } = interview;

    const rescheduleStatus = interview.rescheduleRequest?.status;

    // Show reschedule button ONLY if it's upcoming, scheduled, AND has NO prior reschedule request history.
    const showRescheduleButton = isUpcoming && interview.status === 'scheduled' && !interview.rescheduleRequest && !isTemplate;
    
    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            <CardTitle>{interview.application.jobPosition}</CardTitle>
                            <CardDescription>{interview.application.brandName}</CardDescription>
                        </div>
                        <div className="flex-shrink-0">
                             {isTemplate ? (
                                <Badge variant="outline" className="text-blue-600 border-blue-500">Jadwal Wawancara</Badge>
                            ) : rescheduleStatus === 'pending' ? (
                                <Badge variant="outline" className="text-amber-600 border-amber-500">Menunggu Konfirmasi HRD</Badge>
                            ) : rescheduleStatus === 'approved' ? (
                                <Badge className="bg-green-600">Jadwal Diperbarui</Badge>
                            ) : rescheduleStatus === 'denied' ? (
                                <Badge variant="destructive">Permintaan Ditolak</Badge>
                            ) : rescheduleStatus === 'countered' ? (
                                <Badge className="bg-blue-500">Usulan Jadwal Baru dari HRD</Badge>
                            ) : (isUpcoming === null ? <Skeleton className="h-6 w-20" /> : isUpcoming ? <Badge>Akan Datang</Badge> : <Badge variant="secondary">Telah Lewat</Badge>)}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-start gap-3">
                            <Calendar className="h-5 w-5 mt-0.5 text-primary" />
                            <div>
                                <p className="font-semibold">Tanggal & Waktu</p>
                                <p>{startDate ? format(startDate, 'eeee, dd MMMM yyyy', { locale: id }) : '-'}</p>
                                <p>
                                    {startDate ? format(startDate, 'HH:mm') : ''} - {endDate ? format(endDate, 'HH:mm') : ''} WIB
                                    {interview.isTemplate && <span className="text-muted-foreground font-normal ml-1">(Estimasi)</span>}
                                </p>
                            </div>
                        </div>
                         <div className="flex items-start gap-3">
                            <Users className="h-5 w-5 mt-0.5 text-primary" />
                            <div>
                                <p className="font-semibold">Pewawancara</p>
                                <p>{(interview.panelistNames || interview.interviewerNames || []).join(', ')}</p>
                            </div>
                        </div>
                    </div>
                    {interview.rescheduleRequest?.hrResponseNote && (
                        <div className="p-3 bg-muted/50 rounded-md text-sm">
                            <p className="font-semibold text-muted-foreground">Catatan dari HRD:</p>
                            <p className="italic">"{interview.rescheduleRequest.hrResponseNote}"</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row justify-end items-center gap-2 pt-4 border-t">
                    {showRescheduleButton && (
                        <Button onClick={() => setIsRescheduleDialogOpen(true)} variant="outline" size="sm" className="w-full sm:w-auto">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Minta Jadwal Ulang
                        </Button>
                    )}
                     {(isUpcoming || isTemplate) && interview.meetingLink && (
                        <Button asChild className="w-full sm:w-auto">
                            <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Buka Link Wawancara
                            </a>
                        </Button>
                     )}
                </CardFooter>
            </Card>
            <RescheduleRequestDialog
                open={isRescheduleDialogOpen}
                onOpenChange={setIsRescheduleDialogOpen}
                application={interview.application}
                interviewIndex={interview.interviewIndex}
                onSuccess={onMutate}
            />
        </>
    )
}

function InterviewsPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-80" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        </div>
    );
}

export default function InterviewsPage() {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const [isClient, setIsClient] = useState(false);
    useEffect(() => {
        setIsClient(true);
    }, []);

    const applicationsQuery = useMemoFirebase(() => {
        if (!userProfile?.uid) return null;
        return query(
            collection(firestore, 'applications'),
            where('candidateUid', '==', userProfile.uid),
            where('status', '==', 'interview')
        );
    }, [userProfile?.uid, firestore]);

    const { data: applications, isLoading: appsLoading, mutate } = useCollection<JobApplication>(applicationsQuery);

    const jobIds = useMemo(() => {
        if (!applications) return [];
        return Array.from(new Set(applications.map(app => app.jobId)));
    }, [applications]);

    const { data: jobs, isLoading: jobsLoading } = useCollection<Job>(useMemoFirebase(() => {
        if (jobIds.length === 0) return null;
        return query(collection(firestore, 'jobs'), where('__name__', 'in', jobIds.slice(0, 30)));
    }, [firestore, jobIds]));

    const jobMap = useMemo(() => {
        if (!jobs) return new Map<string, Job>();
        return new Map(jobs.map(job => [job.id!, job]));
    }, [jobs]);

    const [sortedInterviews, setSortedInterviews] = useState<EnrichedInterview[]>([]);

    useEffect(() => {
        if (!isClient || !applications || !jobMap) {
            setSortedInterviews([]);
            return;
        }

        const interviews: EnrichedInterview[] = [];
        applications.forEach(app => {
            let hasSpecificInterview = false;
            if (app.interviews) {
                app.interviews.forEach((interview, index) => {
                    if(interview.status !== 'canceled') {
                        interviews.push({ ...interview, application: app, interviewIndex: index });
                        hasSpecificInterview = true;
                    }
                });
            }
            
            if (!hasSpecificInterview) {
                const job = jobMap.get(app.jobId);
                if (job?.interviewTemplate && job.interviewTemplate.defaultStartDate) {
                    const template = job.interviewTemplate;
                    const templateDate = template.defaultStartDate.toDate();
                    
                    let finalStartDate = templateDate;
                    if (template.workdayStartTime) {
                        const [hours, minutes] = template.workdayStartTime.split(':').map(Number);
                        if (!isNaN(hours) && !isNaN(minutes)) {
                           finalStartDate = set(templateDate, { hours, minutes, seconds: 0, milliseconds: 0 });
                        }
                    }
                    
                    const virtualInterview: ApplicationInterview = {
                        interviewId: `template-${job.id}`,
                        startAt: finalStartDate,
                        endAt: add(finalStartDate, { minutes: template.slotDurationMinutes || 30 }),
                        meetingLink: template.meetingLink || '',
                        panelistNames: ['Tim Rekrutmen'],
                        panelistIds: [],
                        status: 'scheduled',
                    };
                    interviews.push({ ...virtualInterview, application: app, interviewIndex: -1, isTemplate: true });
                }
            }
        });
        
        const now = new Date().getTime();
        const sorted = [...interviews].sort((a, b) => {
            const aDate = a.startAt.toDate ? a.startAt.toDate() : a.startAt as Date;
            const bDate = b.startAt.toDate ? b.startAt.toDate() : b.startAt as Date;
            const aTime = aDate.getTime();
            const bTime = bDate.getTime();
            
            const aIsUpcoming = aTime >= now;
            const bIsUpcoming = bTime >= now;

            if (aIsUpcoming && !bIsUpcoming) return -1;
            if (!aIsUpcoming && bIsUpcoming) return 1;
            
            if (aIsUpcoming) {
                return aTime - bTime;
            } else {
                return bTime - aTime;
            }
        });

        setSortedInterviews(sorted);
    }, [isClient, applications, jobMap]);

    const isLoading = authLoading || appsLoading || jobsLoading;
    
    if (isLoading) {
        return <InterviewsPageSkeleton />;
    }
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Jadwal Wawancara</h1>
                <p className="text-muted-foreground">Berikut adalah semua jadwal wawancara Anda yang akan datang atau yang telah lewat.</p>
            </div>

            {sortedInterviews.length > 0 ? (
                <div className="space-y-4">
                    {sortedInterviews.map((interview, index) => (
                        <InterviewCard key={`${interview.application.id}-${interview.interviewId || index}`} interview={interview} onMutate={mutate} />
                    ))}
                </div>
            ) : (
                <Card className="h-64 flex flex-col items-center justify-center text-center">
                     <CardHeader>
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <Video className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <CardTitle className="mt-4">Belum Ada Jadwal Wawancara</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Jadwal wawancara Anda akan muncul di sini setelah diatur oleh tim HRD.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
