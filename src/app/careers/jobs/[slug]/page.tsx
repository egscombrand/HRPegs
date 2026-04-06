// This file path is for the new non-locale structure.
// The content is taken from the original [locale] equivalent.
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Briefcase, Building, Calendar, ChevronRight, LocateFixed, MapPin, Sparkles, Users } from 'lucide-react';
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { ROLES_INTERNAL } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

function JobDetailSkeleton() {
    return (
        <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
            <div className="mb-8">
                <Skeleton className="h-6 w-1/4" />
            </div>
            <div className="relative mb-8 h-[320px] w-full overflow-hidden rounded-2xl shadow-lg md:h-[420px]">
                <Skeleton className="h-full w-full" />
            </div>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Skeleton className="mb-4 h-12 w-3/4" />
                    <Skeleton className="mb-8 h-6 w-1/2" />
                    <Skeleton className="mb-8 h-px w-full" />
                    <Skeleton className="mb-6 h-8 w-48" />
                    <Skeleton className="mb-4 h-5 w-full" />
                    <Skeleton className="mb-4 h-5 w-5/6" />
                    <Skeleton className="h-5 w-4/5" />
                </div>
                <div className="space-y-6">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        </div>
    )
}

const OtherJobCard = ({ job }: { job: Job }) => (
    <Link href={`/careers/jobs/${job.slug}`} className="block transition-shadow hover:shadow-md rounded-lg">
        <Card className="flex items-center gap-4 p-3 h-full transition-colors hover:bg-muted/50">
            <div className="relative h-16 w-16 flex-shrink-0">
                <Image 
                    src={job.coverImageUrl || 'https://picsum.photos/seed/job-fallback/200/200'}
                    alt={job.position}
                    fill
                    className="rounded-md object-cover"
                    data-ai-hint="office building"
                />
            </div>
            <div className="flex-grow overflow-hidden">
                <p className="font-semibold leading-tight truncate">{job.position}</p>
                <p className="text-sm text-muted-foreground truncate">{job.brandName}</p>
                <div className="mt-2 flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {job.location}</span>
                    <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-3.5 w-3.5" /> {job.statusJob}</span>
                </div>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground ml-auto" />
        </Card>
    </Link>
);


const RichTextSection = ({ title, htmlContent, icon }: { title: string, htmlContent: string, icon: React.ReactNode }) => {
    const [sanitizedHtml, setSanitizedHtml] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setSanitizedHtml(DOMPurify.sanitize(htmlContent));
        }
    }, [htmlContent]);
    
    if (!sanitizedHtml) return null;

    return (
        <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {icon}
                {title}
            </h2>
            <div
                className="prose max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-li:my-1"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
        </section>
    );
};

export default function JobDetailPage() {
    const params = useParams();
    const slug = params.slug as string;
    const router = useRouter();
    const pathname = usePathname();
    const firestore = useFirestore();
    const { userProfile, firebaseUser, loading: authLoading } = useAuth();
    const { toast } = useToast();


    const isInternalUser = !authLoading && userProfile && ROLES_INTERNAL.includes(userProfile.role);

    const jobQuery = useMemoFirebase(() => {
        if (!slug) return null;
        const jobsCollection = collection(firestore, 'jobs');
        return query(jobsCollection, where('slug', '==', slug), limit(1));
    }, [firestore, slug]);


    const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
    
    const job = useMemo(() => {
        if (!jobs || jobs.length === 0) {
            return undefined;
        }
        const j = jobs[0];
        if (isInternalUser || j.publishStatus === 'published') {
            return j;
        }
        return undefined;
    }, [jobs, isInternalUser]);
    
    const otherJobsQuery = useMemoFirebase(() => {
        if (!firestore || !job) return null;
        return query(
            collection(firestore, 'jobs'),
            where('publishStatus', '==', 'published'),
            limit(4) // Fetch one more than needed
        );
    }, [firestore, job]);

    const { data: otherJobsData } = useCollection<Job>(otherJobsQuery);

    const otherJobs = useMemo(() => {
        if (!job || !otherJobsData) return [];
        // Filter out the current job and take the first 3
        return otherJobsData.filter(j => j.id !== job.id).slice(0, 3);
    }, [job, otherJobsData]);

    const isLoading = authLoading || isLoadingJob;

    const handleApplyClick = () => {
        // If auth is still loading, do nothing to prevent race conditions
        if (authLoading) {
            return;
        }

        // If there is no authenticated user, redirect to login, then to the portal dashboard.
        if (!firebaseUser) {
            router.push(`/careers/login?redirect=/careers/portal`);
            return;
        }

        // A user is authenticated, now check their profile/role.
        if (userProfile) {
            if (userProfile.role === 'kandidat') {
                // If they are a candidate, take them to the portal dashboard.
                router.push('/careers/portal');
                return;
            }
            
            if (ROLES_INTERNAL.includes(userProfile.role)) {
                 toast({
                    variant: 'destructive',
                    title: 'Akses Khusus Kandidat',
                    description: "Akun Anda terdaftar sebagai akun internal dan tidak dapat digunakan untuk melamar.",
                });
                return;
            }
        }
        
        // Fallback for cases where user is authenticated but profile is still loading.
        // Redirect to login flow which will handle the final redirect to the portal dashboard.
        router.push(`/careers/login?redirect=/careers/portal`);
    };

    if (isLoading) {
        return <JobDetailSkeleton />;
    }

    if (!job) {
        return (
            <div className="flex h-screen flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-bold">Lowongan tidak ditemukan</h2>
                <p className="text-muted-foreground mt-2">Lowongan yang Anda cari mungkin sudah ditutup atau tidak ada.</p>
                <Button asChild className="mt-6">
                    <Link href="/careers">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Halaman Karir
                    </Link>
                </Button>
            </div>
        );
    }

    const isDeadlinePassed = job.applyDeadline && job.applyDeadline.toDate() < new Date();

    return (
        <>
            <header className="border-b bg-background">
              <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="mr-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Button>
                 <div className="text-sm text-muted-foreground">
                    <Link href="/careers" className="hover:text-primary">Karir</Link>
                    <ChevronRight className="mx-1 inline-block h-4 w-4" />
                    <span className="font-medium text-foreground">{job.position}</span>
                </div>
              </div>
            </header>

            <main className="bg-secondary/50">
                <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
                    <div className="relative mb-8 w-full overflow-hidden rounded-2xl shadow-lg aspect-video bg-muted">
                        <Image
                            src={job.coverImageUrl || 'https://picsum.photos/seed/default-hero/1200/600'}
                            alt=""
                            fill
                            className="object-cover scale-110 blur-lg opacity-50"
                            data-ai-hint="abstract office background"
                        />
                        <div className="absolute inset-0 bg-black/20" />
                        <Image
                            src={job.coverImageUrl || 'https://picsum.photos/seed/default-hero/1200/600'}
                            alt={`${job.position} cover image`}
                            fill
                            className="object-contain"
                            priority
                            data-ai-hint="office building team"
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-3">
                        {/* Main Content */}
                        <div className="lg:col-span-2">
                             <div className="flex flex-col-reverse justify-between gap-4 md:flex-row md:items-start">
                                <div>
                                    <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{job.position}</h1>
                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                                        <span className="flex items-center gap-1.5"><Building className="h-4 w-4"/> {job.brandName}</span>
                                        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4"/> {job.location}</span>
                                        <span className="flex items-center gap-1.5 capitalize"><Briefcase className="h-4 w-4"/> {job.statusJob}</span>
                                    </div>
                                </div>
                             </div>
                             
                             <Separator className="my-8" />

                             <div className="space-y-10">
                                <RichTextSection 
                                    title="Kualifikasi Umum" 
                                    htmlContent={job.generalRequirementsHtml}
                                    icon={<Sparkles className="h-5 w-5 text-primary"/>} 
                                />
                                <RichTextSection 
                                    title="Kualifikasi Khusus"
                                    htmlContent={job.specialRequirementsHtml}
                                    icon={<LocateFixed className="h-5 w-5 text-primary"/>}
                                />
                             </div>
                        </div>

                        {/* Sidebar */}
                        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
                            <Card className="shadow-md">
                                <CardHeader>
                                    <CardTitle className="text-xl">Lamar Posisi Ini</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 text-sm">
                                    <span className="font-semibold text-foreground">Divisi</span>
                                    <span className="text-foreground">{job.division}</span>

                                    <span className="font-semibold text-foreground">Tipe</span>
                                    <span className="capitalize text-foreground">{job.statusJob}</span>

                                    <span className="font-semibold text-foreground">Lokasi</span>
                                    <span className="text-foreground">{job.location}</span>
                                    
                                    {job.workMode && <>
                                        <span className="font-semibold text-foreground">Mode</span>
                                        <span className="capitalize text-foreground">{job.workMode}</span>
                                    </>}
                                    {job.numberOfOpenings && job.numberOfOpenings > 0 && <>
                                        <span className="font-semibold text-foreground">Kebutuhan</span>
                                        <span className="text-foreground">{job.numberOfOpenings} orang</span>
                                    </>}
                                </CardContent>
                                <CardFooter className="flex-col items-stretch gap-2">
                                     {job.applyDeadline && (
                                        <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-destructive">
                                            <Calendar className="h-3 w-3"/> Lamar sebelum {format(job.applyDeadline.toDate(), 'dd MMM yyyy')}
                                        </p>
                                    )}
                                    <Button size="lg" onClick={handleApplyClick} className="w-full" disabled={isDeadlinePassed}>
                                        {isDeadlinePassed ? 'Pendaftaran Ditutup' : 'Lamar Sekarang'}
                                    </Button>
                                </CardFooter>
                            </Card>

                             {otherJobs && otherJobs.length > 0 && (
                                <Card>
                                     <CardHeader>
                                        <CardTitle className="text-xl">Lowongan Lainnya</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {otherJobs.map((otherJob) => (
                                            <OtherJobCard key={otherJob.id} job={otherJob} />
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </aside>
                    </div>
                </div>
            </main>
            
            {/* Mobile Sticky CTA */}
            <div className="sticky bottom-0 z-40 border-t bg-background/95 p-4 backdrop-blur md:hidden">
                {job.applyDeadline && (
                    <p className="mb-2 text-center text-xs text-destructive">
                        Lamar sebelum {format(job.applyDeadline.toDate(), 'dd MMM yyyy')}
                    </p>
                )}
                <Button size="lg" onClick={handleApplyClick} className="w-full" disabled={isDeadlinePassed}>
                    {isDeadlinePassed ? 'Pendaftaran Ditutup' : 'Lamar Sekarang'}
                </Button>
            </div>
        </>
    );
}
