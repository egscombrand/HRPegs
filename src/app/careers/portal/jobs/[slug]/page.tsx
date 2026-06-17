"use client";

import { useParams, useRouter } from "next/navigation";
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase";
import { collection, query, where, limit, doc, serverTimestamp } from "firebase/firestore";
import type { Job, SavedJob, JobApplication } from "@/lib/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Building,
  Calendar,
  LocateFixed,
  MapPin,
  Sparkles,
  Users,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import SafeRichText from "@/components/ui/SafeRichText";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MAX_ACTIVE_APPLICATIONS,
  ACTIVE_APPLICATION_STATUSES,
  isApplicationActive,
} from "@/lib/application-rules";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";

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

// ── Active application status label (candidate-facing) ─────────────────────
function activeStatusLabel(status: string): string {
  return (statusDisplayLabels as Record<string, string>)[status] || status;
}

export default function PortalJobDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Modal state: null | 'warning' (1–2 active) | 'blocked' (≥ MAX_ACTIVE_APPLICATIONS)
  const [activeModal, setActiveModal] = useState<null | "warning" | "blocked">(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const jobQuery = useMemoFirebase(() => {
    if (!slug) return null;
    return query(
      collection(firestore, "jobs"),
      where("slug", "==", slug),
      where("publishStatus", "in", ["published", "reopened"]),
      limit(1),
    );
  }, [firestore, slug]);
  const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
  const job = jobs?.[0];

  // Whether this specific job was already applied to
  const appQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || !job?.id) return null;
    return query(
      collection(firestore, "applications"),
      where("candidateUid", "==", userProfile.uid),
      where("jobId", "==", job.id),
      limit(1),
    );
  }, [userProfile?.uid, job?.id, firestore]);
  const { data: thisJobApplications } = useCollection<JobApplication>(appQuery);
  const hasApplied = (thisJobApplications?.length ?? 0) > 0;

  // ALL applications for this user (needed for active-count check + modal list)
  const allAppsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "applications"),
      where("candidateUid", "==", userProfile.uid),
    );
  }, [userProfile?.uid, firestore]);
  const { data: allApplications } = useCollection<JobApplication>(allAppsQuery);

  const activeApplications = useMemo(
    () => (allApplications || []).filter((app) => isApplicationActive(app.status)),
    [allApplications],
  );

  // Saved jobs
  const savedJobQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || !job?.id) return null;
    return collection(firestore, "users", userProfile.uid, "saved_jobs");
  }, [userProfile?.uid, job?.id, firestore]);
  const { data: savedJobs } = useCollection<SavedJob>(savedJobQuery);
  const isSaved = savedJobs?.some((s) => s.jobId === job?.id) ?? false;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleToggleSave = async () => {
    if (!userProfile || !job) return;
    const savedJobRef = doc(firestore, "users", userProfile.uid, "saved_jobs", job.id!);
    setIsSaving(true);
    try {
      if (isSaved) {
        await deleteDocumentNonBlocking(savedJobRef);
        toast({ title: "Dihapus dari tersimpan" });
      } else {
        const data: Omit<SavedJob, "id"> = {
          userId: userProfile.uid,
          jobId: job.id!,
          jobPosition: job.position,
          jobSlug: job.slug,
          brandName: job.brandName || "",
          savedAt: serverTimestamp() as any,
        };
        await setDocumentNonBlocking(savedJobRef, data, { merge: false });
        toast({ title: "Lowongan disimpan" });
      }
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan" });
    } finally {
      setIsSaving(false);
    }
  };

  /** Called when user taps "Lamar Sekarang" */
  const handleApplyClick = () => {
    if (!job) return;
    const count = activeApplications.length;
    if (count >= MAX_ACTIVE_APPLICATIONS) {
      setActiveModal("blocked");
    } else if (count > 0) {
      setActiveModal("warning");
    } else {
      router.push(`/careers/jobs/${job.slug}/apply`);
    }
  };

  // ── Loading / not-found ──────────────────────────────────────────────────

  if (isLoadingJob) return <JobDetailSkeleton />;

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

  // ── Render ───────────────────────────────────────────────────────────────

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
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSave}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaved ? (
                  <><BookmarkCheck className="h-4 w-4 text-teal-600" /> Tersimpan</>
                ) : (
                  <><Bookmark className="h-4 w-4" /> Simpan</>
                )}
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

        <CardFooter className="flex-col items-stretch gap-3 border-t pt-6">
          {job.applyDeadline && (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm font-medium text-destructive">
              <Calendar className="h-4 w-4" /> Lamar sebelum{" "}
              {format(job.applyDeadline.toDate(), "dd MMM yyyy")}
            </p>
          )}

          {/* Active-app info hint */}
          {!hasApplied && activeApplications.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Anda memiliki{" "}
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {activeApplications.length} lamaran aktif
              </span>
              {activeApplications.length >= MAX_ACTIVE_APPLICATIONS && (
                <> · batas {MAX_ACTIVE_APPLICATIONS} tercapai</>
              )}
            </p>
          )}

          {hasApplied ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-medium text-teal-700 dark:text-teal-400">
                  Sudah Dilamar
                </span>
              </div>
              <Button asChild size="lg" variant="secondary" className="w-full">
                <Link href="/careers/portal/applications">
                  Lihat Lamaran
                </Link>
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              onClick={handleApplyClick}
              className={cn(
                "w-full",
                activeApplications.length >= MAX_ACTIVE_APPLICATIONS
                  ? "bg-slate-400 hover:bg-slate-500 text-white cursor-not-allowed"
                  : "bg-teal-600 hover:bg-teal-700 text-white",
              )}
            >
              Lamar Sekarang
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* ── Modal: 1–2 active applications (warning, can still proceed) ──── */}
      <Dialog open={activeModal === "warning"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <DialogTitle>Anda masih memiliki lamaran aktif</DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed">
              Saat ini Anda masih memiliki lamaran yang sedang diproses. Anda
              tetap dapat melamar posisi ini, namun pastikan posisi yang dipilih
              sesuai dengan minat dan kualifikasi Anda.
            </DialogDescription>
          </DialogHeader>

          {/* Active applications list */}
          <div className="space-y-2 my-1">
            {activeApplications.map((app) => (
              <div
                key={app.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{app.jobPosition}</p>
                  <p className="text-xs text-muted-foreground truncate">{app.brandName}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {activeStatusLabel(app.status)}
                </Badge>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setActiveModal(null);
                router.push("/careers/portal/applications");
              }}
            >
              Lihat Lamaran Saya
            </Button>
            <Button
              className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => {
                setActiveModal(null);
                router.push(`/careers/jobs/${job.slug}/apply`);
              }}
            >
              Lanjutkan Melamar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: 3 active applications (blocking) ─────────────────────── */}
      <Dialog open={activeModal === "blocked"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Batas Lamaran Aktif Tercapai</DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed">
              Anda sudah memiliki {MAX_ACTIVE_APPLICATIONS} lamaran aktif yang
              sedang diproses. Untuk menjaga kualitas proses seleksi, Anda belum
              dapat melamar posisi baru sampai salah satu lamaran selesai atau
              tidak dilanjutkan.
            </DialogDescription>
          </DialogHeader>

          {/* Active applications list */}
          <div className="space-y-2 my-1">
            {activeApplications.map((app) => (
              <div
                key={app.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{app.jobPosition}</p>
                  <p className="text-xs text-muted-foreground truncate">{app.brandName}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {activeStatusLabel(app.status)}
                </Badge>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => {
                setActiveModal(null);
                router.push("/careers/portal/applications");
              }}
            >
              Lihat Lamaran Saya
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
