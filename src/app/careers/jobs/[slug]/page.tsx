// This file path is for the new non-locale structure.
// The content is taken from the original [locale] equivalent.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
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
  FileText,
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
import Link from "next/link";
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
    className="block transition-all hover:shadow-md rounded-lg"
  >
    <Card className="flex items-center gap-4 p-3 h-full transition-colors bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
      <div className="relative h-16 w-16 flex-shrink-0 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-700 border border-border">
        {cardCoverUrl ? (
          <img
            src={cardCoverUrl}
            alt={job.position}
            className="h-full w-full object-contain object-center"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>('.card-job-fallback');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className="card-job-fallback hidden absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400">—</div>
        </div>
      </div>
      <div className="flex-grow overflow-hidden">
        <p className="font-semibold leading-tight truncate text-slate-900 dark:text-slate-100">{job.position}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
          {job.brandName}
        </p>
        <div className="mt-2 flex items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {job.location}
          </span>
          <span className="flex items-center gap-1.5 capitalize">
            <Briefcase className="h-3.5 w-3.5" /> {job.statusJob}
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-600 dark:text-slate-400 ml-auto" />
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
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6">
      <h2 className="mb-4 flex items-center gap-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-2xl">
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
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { userProfile, firebaseUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const isInternalUser =
    !authLoading && userProfile && ROLES_INTERNAL.includes(userProfile.role);

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
    // Redirect to candidate login page with return URL to the job application.
    // All users (authenticated or not) go through the candidate login gateway.
    // The login page handles:
    // - Unauthenticated users: shows login/register forms
    // - Candidates already logged in: auto-redirects to apply page
    // - Internal users: can log out and re-login as candidate
    const applyPageUrl = `/careers/jobs/${job.slug}/apply`;
    router.push(`/careers/login?redirect=${encodeURIComponent(applyPageUrl)}`);
  };

  if (isLoading) {
    return <JobDetailSkeleton />;
  }

  if (!job) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center bg-white dark:bg-slate-950">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Lowongan tidak ditemukan</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
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
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
          </Button>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <Link href="/careers" className="hover:text-slate-900 dark:hover:text-slate-50 transition-colors">
              Karir
            </Link>
            <ChevronRight className="mx-1 inline-block h-4 w-4" />
            <span className="font-medium text-slate-900 dark:text-slate-50">{job.position}</span>
          </div>
        </div>
      </header>

      <main className="bg-white dark:bg-slate-950">
        <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
          {(() => {
            const coverUrl = normalizeJobCoverImageUrl(job.coverImageUrl);
            console.log('[CareerJobDetail] coverImageUrl (raw):', job.coverImageUrl);
            console.log('[CareerJobDetail] coverImageUrl (normalized):', coverUrl);
            return (
              <div className="relative mb-8 w-full overflow-hidden rounded-2xl shadow-lg aspect-video bg-slate-50 dark:bg-slate-900 border border-border flex items-center justify-center">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={`${job.position} cover image`}
                    className="w-full h-full object-contain object-center p-6"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>('.cover-fallback-detail');
                      if (fallback) fallback.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className="cover-fallback-detail hidden absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-slate-500 dark:text-slate-400">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <span className="text-sm font-medium">No cover image available</span>
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
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl">
                    {job.position}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-600 dark:text-slate-400">
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
              <Card className="shadow-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-50">Lamar Posisi Ini</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-50">Divisi</span>
                  <span className="text-slate-700 dark:text-slate-300">{job.division}</span>

                  <span className="font-semibold text-slate-900 dark:text-slate-50">Tipe</span>
                  <span className="capitalize text-slate-700 dark:text-slate-300">
                    {job.statusJob}
                  </span>

                  <span className="font-semibold text-slate-900 dark:text-slate-50">Lokasi</span>
                  <span className="text-slate-700 dark:text-slate-300">{job.location}</span>

                  {job.workMode && (
                    <>
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        Mode
                      </span>
                      <span className="capitalize text-slate-700 dark:text-slate-300">
                        {job.workMode}
                      </span>
                    </>
                  )}
                  {job.numberOfOpenings && job.numberOfOpenings > 0 && (
                    <>
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        Kebutuhan
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {job.numberOfOpenings} orang
                      </span>
                    </>
                  )}
                </CardContent>
                <CardFooter className="flex-col items-stretch gap-2 border-t border-slate-200 dark:border-slate-700">
                  {job.applyDeadline && (
                    <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-red-600 dark:text-red-400">
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
                <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-xl text-slate-900 dark:text-slate-50">Lowongan Lainnya</CardTitle>
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
      <div className="sticky bottom-0 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur md:hidden">
        <div className="container mx-auto max-w-6xl px-4 py-3">
          {job.applyDeadline && (
            <p className="mb-2 text-center text-xs text-red-600 dark:text-red-400">
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
      </div>
    </>
  );
}
