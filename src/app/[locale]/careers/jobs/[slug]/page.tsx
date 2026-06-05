"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, limit } from "firebase/firestore";
import type { Job } from "@/lib/types";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Briefcase,
  Building,
  Calendar,
  ChevronRight,
  LocateFixed,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import SafeRichText from "@/components/ui/SafeRichText";
import { format } from "date-fns";
import { ROLES_INTERNAL } from "@/lib/types";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Link, useRouter, usePathname } from "@/navigation";
import { normalizeJobCoverImageUrl } from "@/lib/utils";

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
  );
}

const OtherJobCard = ({ job }: { job: Job }) => {
  const cardCoverUrl = normalizeJobCoverImageUrl(job.coverImageUrl);
  return (
  <Link
    href={`/careers/jobs/${job.slug}`}
    className="block transition-shadow hover:shadow-md rounded-lg"
  >
    <Card className="flex items-center gap-4 p-3 h-full transition-colors hover:bg-muted/50">
      <div className="relative h-16 w-16 flex-shrink-0 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-border">
        {cardCoverUrl ? (
          <img
            src={cardCoverUrl}
            alt={job.position}
            className="h-full w-full object-contain object-center"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>('.card-img-fallback');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className="card-img-fallback hidden absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
          <div className="text-xs text-muted-foreground">—</div>
        </div>
      </div>
      <div className="flex-grow overflow-hidden">
        <p className="font-semibold leading-tight truncate">{job.position}</p>
        <p className="text-sm text-muted-foreground truncate">
          {job.brandName}
        </p>
        <div className="mt-2 flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {job.location}
          </span>
          <span className="flex items-center gap-1.5 capitalize">
            <Briefcase className="h-3.5 w-3.5" /> {job.statusJob}
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground ml-auto" />
    </Card>
  </Link>
  );
};

const RichTextSection = ({
  title,
  htmlContent,
  icon,
}: {
  title: string;
  htmlContent: string;
  icon: React.ReactNode;
}) => {
  return (
    <section className="rounded-3xl border border-muted/70 bg-slate-950/5 dark:bg-slate-950/80 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">
        {icon}
        {title}
      </h2>
      <SafeRichText html={htmlContent} />
    </section>
  );
};

export default function JobDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const locale = params.locale as string;
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { userProfile, firebaseUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const isInternalUser =
    !authLoading && userProfile && userProfile.role && ROLES_INTERNAL.includes(userProfile.role as any);

  const jobQuery = useMemoFirebase(() => {
    if (!slug) return null;
    const jobsCollection = collection(firestore, "jobs");
    return query(jobsCollection, where("slug", "==", slug), limit(1));
  }, [firestore, slug]);

  const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);

  const job = useMemo(() => {
    if (!jobs || jobs.length === 0) {
      return undefined;
    }
    const j = jobs[0];
    if (isInternalUser || j.publishStatus === "published") {
      return j;
    }
    return undefined;
  }, [jobs, isInternalUser]);

  const otherJobsQuery = useMemoFirebase(() => {
    if (!firestore || !job) return null;
    return query(
      collection(firestore, "jobs"),
      where("publishStatus", "==", "published"),
      limit(4), // Fetch one more than needed
    );
  }, [firestore, job]);

  const { data: otherJobsData } = useCollection<Job>(otherJobsQuery);

  const otherJobs = useMemo(() => {
    if (!job || !otherJobsData) return [];
    // Filter out the current job and take the first 3
    return otherJobsData.filter((j) => j.id !== job.id).slice(0, 3);
  }, [job, otherJobsData]);

  const isLoading = authLoading || isLoadingJob;

  const handleApplyClick = () => {
    if (!job) return;
    // Redirect to candidate login page with return URL to the job application.
    // All users (authenticated or not) go through the candidate login gateway.
    // The login page handles:
    // - Unauthenticated users: shows login/register forms
    // - Candidates already logged in: auto-redirects to apply page
    // - Internal users: can log out and re-login as candidate
    const applyPageUrl = `/${locale}/careers/jobs/${job.slug}/apply`;
    router.push(`/careers/login?redirect=${encodeURIComponent(applyPageUrl)}`);
  };

  if (isLoading) {
    return <JobDetailSkeleton />;
  }

  if (!job) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold">Lowongan tidak ditemukan</h2>
        <p className="text-muted-foreground mt-2">
          Lowongan yang Anda cari mungkin sudah ditutup atau tidak ada.
        </p>
        <Button asChild className="mt-6">
          <Link href="/careers">
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Halaman Karir
          </Link>
        </Button>
      </div>
    );
  }

  const isDeadlinePassed =
    job.applyDeadline && job.applyDeadline.toDate() < new Date();

  return (
    <>
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
          </Button>
          <div className="text-sm text-muted-foreground">
            <Link href="/careers" className="hover:text-primary">
              Karir
            </Link>
            <ChevronRight className="mx-1 inline-block h-4 w-4" />
            <span className="font-medium text-foreground">{job.position}</span>
          </div>
        </div>
      </header>

      <main className="bg-secondary/50">
        <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
          {(() => {
            const coverUrl = normalizeJobCoverImageUrl(job.coverImageUrl);
            return (
              <div className="relative mb-8 w-full overflow-hidden rounded-2xl shadow-lg aspect-video bg-muted flex items-center justify-center">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={`${job.position} cover image`}
                    className="w-full h-full object-contain object-center p-6"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>('.cover-fallback-locale');
                      if (fallback) fallback.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className="cover-fallback-locale hidden absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-40" />
                    <span className="text-sm">No cover image</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <div className="flex flex-col-reverse justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                    {job.position}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Building className="h-4 w-4" /> {job.brandName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" /> {job.location}
                    </span>
                    <span className="flex items-center gap-1.5 capitalize">
                      <Briefcase className="h-4 w-4" /> {job.statusJob}
                    </span>
                  </div>
                </div>
              </div>

              <Separator className="my-8" />

              <div className="space-y-10">
                <RichTextSection
                  title="Kualifikasi Umum"
                  htmlContent={job.generalRequirementsHtml}
                  icon={<Sparkles className="h-5 w-5 text-primary" />}
                />
                <RichTextSection
                  title="Kualifikasi Khusus"
                  htmlContent={job.specialRequirementsHtml}
                  icon={<LocateFixed className="h-5 w-5 text-primary" />}
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
                  <span className="capitalize text-foreground">
                    {job.statusJob}
                  </span>

                  <span className="font-semibold text-foreground">Lokasi</span>
                  <span className="text-foreground">{job.location}</span>

                  {job.workMode && (
                    <>
                      <span className="font-semibold text-foreground">
                        Mode
                      </span>
                      <span className="capitalize text-foreground">
                        {job.workMode}
                      </span>
                    </>
                  )}
                  {job.numberOfOpenings && job.numberOfOpenings > 0 && (
                    <>
                      <span className="font-semibold text-foreground">
                        Kebutuhan
                      </span>
                      <span className="text-foreground">
                        {job.numberOfOpenings} orang
                      </span>
                    </>
                  )}
                </CardContent>
                <CardFooter className="flex-col items-stretch gap-2">
                  {job.applyDeadline && (
                    <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-destructive">
                      <Calendar className="h-3 w-3" /> Lamar sebelum{" "}
                      {format(job.applyDeadline.toDate(), "dd MMM yyyy")}
                    </p>
                  )}
                  <Button
                    size="lg"
                    onClick={handleApplyClick}
                    className="w-full"
                    disabled={isDeadlinePassed}
                  >
                    {isDeadlinePassed
                      ? "Pendaftaran Ditutup"
                      : "Lamar Sekarang"}
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
            Lamar sebelum {format(job.applyDeadline.toDate(), "dd MMM yyyy")}
          </p>
        )}
        <Button
          size="lg"
          onClick={handleApplyClick}
          className="w-full"
          disabled={isDeadlinePassed}
        >
          {isDeadlinePassed ? "Pendaftaran Ditutup" : "Lamar Sekarang"}
        </Button>
      </div>
    </>
  );
}
