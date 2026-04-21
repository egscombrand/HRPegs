"use client";

import { useRouter, Link } from "@/navigation";
import { useParams } from "next/navigation";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, limit } from "firebase/firestore";
import type { Job } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  LocateFixed,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import SafeRichText from "@/components/ui/SafeRichText";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";

function JobDetailSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-32" />
      </CardFooter>
    </Card>
  );
}

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

export default function PortalJobDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const firestore = useFirestore();

  const jobQuery = useMemoFirebase(() => {
    if (!slug) return null;
    const jobsCollection = collection(firestore, "jobs");

    // In the portal, we assume only published jobs are shown, but let's be explicit
    let q = query(
      jobsCollection,
      where("slug", "==", slug),
      where("publishStatus", "==", "published"),
      limit(1),
    );

    return q;
  }, [firestore, slug]);

  const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
  const job = jobs?.[0];

  if (isLoadingJob) {
    return <JobDetailSkeleton />;
  }

  if (!job) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold">Lowongan tidak ditemukan</h2>
        <p className="text-muted-foreground mt-2">
          Lowongan yang Anda cari mungkin sudah ditutup atau tidak ada.
        </p>
        <Button asChild className="mt-6">
          <Link href="/careers/portal/jobs">
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar Lowongan
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col-reverse justify-between gap-4 md:flex-row md:items-start">
            <div>
              <CardTitle className="text-3xl tracking-tight">
                {job.position}
              </CardTitle>
              <CardDescription className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-base">
                <span className="flex items-center gap-1.5">
                  <Building className="h-4 w-4" /> {job.brandName}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {job.location}
                </span>
                <span className="flex items-center gap-1.5 capitalize">
                  <Briefcase className="h-4 w-4" /> {job.statusJob}
                </span>
                {job.numberOfOpenings && job.numberOfOpenings > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> {job.numberOfOpenings} orang
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex-shrink-0">
              <Button asChild size="lg">
                <Link href={`/careers/jobs/${job.slug}/apply`}>
                  Lamar Sekarang
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="my-6" />

          <div className="space-y-8">
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
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2 border-t pt-6">
          {job.applyDeadline && (
            <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-sm font-medium text-destructive">
              <Calendar className="h-4 w-4" /> Lamar sebelum{" "}
              {format(job.applyDeadline.toDate(), "dd MMM yyyy")}
            </p>
          )}
          <Button asChild size="lg">
            <Link href={`/careers/jobs/${job.slug}/apply`}>Lamar Sekarang</Link>
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
