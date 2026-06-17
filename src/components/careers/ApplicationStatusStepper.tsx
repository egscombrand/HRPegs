"use client";

import {
  Check,
  Lock,
  Hourglass,
  Calendar,
  FileText,
  Award,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { JobApplication, JobApplicationStatus } from "@/lib/types";
import { Skeleton } from "../ui/skeleton";
import { format } from "date-fns";
import { useMemo } from "react";

// 4 canonical stages shown to the candidate
const CANDIDATE_STAGES = [
  "start",
  "eval",
  "interview",
  "decision",
] as const;

type CandidateStage = (typeof CANDIDATE_STAGES)[number];
type StepStatus = "completed" | "active" | "waiting" | "locked";

// Map a Firestore status → candidate stage, given whether the test is done
function mapStage(
  status: JobApplicationStatus,
  hasCompletedTest: boolean,
): CandidateStage {
  if (["submitted", "tes_kepribadian"].includes(status)) return "start";
  if (["screening", "verification", "document_submission"].includes(status)) {
    return hasCompletedTest ? "eval" : "start";
  }
  if (status === "interview") return "interview";
  if (["offered", "hired", "rejected"].includes(status)) return "decision";
  return "start";
}

interface ApplicationStatusStepperProps {
  application: JobApplication | null;
  highestStatus: JobApplicationStatus | null;
  isProfileComplete: boolean;
  hasCompletedTest: boolean;
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

const STAGE_META: Record<
  CandidateStage,
  { label: string; icon: React.ElementType }
> = {
  start:     { label: "Lamaran & Tes Kepribadian", icon: FileText  },
  eval:      { label: "Evaluasi HRD",              icon: Search    },
  interview: { label: "Wawancara",                 icon: Calendar  },
  decision:  { label: "Keputusan Akhir",           icon: Award     },
};

export function ApplicationStatusStepper({
  application,
  highestStatus,
  isProfileComplete,
  hasCompletedTest,
  isLoading,
}: ApplicationStatusStepperProps) {
  if (isLoading) return <StepperSkeleton />;

  const currentStage: CandidateStage | null = highestStatus
    ? mapStage(highestStatus, hasCompletedTest)
    : null;

  const currentStageIdx = currentStage
    ? CANDIDATE_STAGES.indexOf(currentStage)
    : -1;

  const isRejected = highestStatus === "rejected";

  const getStepDetails = useMemo(
    () =>
      (stage: CandidateStage): { status: StepStatus; reason?: string; cta?: React.ReactNode } => {
        if (!highestStatus) {
          return {
            status: "locked",
            reason: isProfileComplete
              ? "Lamar pekerjaan pertama Anda untuk memulai proses seleksi."
              : "Lengkapi profil Anda untuk dapat memulai proses seleksi.",
          };
        }

        const stageIdx = CANDIDATE_STAGES.indexOf(stage);

        if (isRejected) {
          return stageIdx === 0
            ? { status: "waiting", reason: "Lamaran ini tidak dilanjutkan. Silakan coba posisi lain." }
            : { status: "locked", reason: "Lamaran belum mencapai tahap ini." };
        }

        if (stageIdx < currentStageIdx) return { status: "completed" };

        if (stageIdx === currentStageIdx) {
          switch (stage) {
            case "start":
              if (highestStatus === "tes_kepribadian") {
                return {
                  status: "active",
                  reason: "Selesaikan tes kepribadian untuk melanjutkan proses seleksi.",
                  cta: (
                    <Button asChild size="sm">
                      <Link href="/careers/portal/assessment/personality">
                        Kerjakan Tes
                      </Link>
                    </Button>
                  ),
                };
              }
              return {
                status: "active",
                reason: "Lamaran diterima. Pantau portal ini untuk pembaruan status.",
              };

            case "eval":
              return {
                status: "active",
                reason:
                  "Lamaran dan hasil tes kepribadian Anda sedang ditinjau oleh tim rekrutmen melalui sistem HRP.",
              };

            case "interview": {
              const now = new Date();
              const scheduled = application?.interviews
                ?.filter((i) => i.status === "scheduled")
                .sort(
                  (a, b) =>
                    a.startAt.toDate().getTime() - b.startAt.toDate().getTime(),
                );
              const upcoming = scheduled?.find(
                (i) => i.startAt.toDate() >= now,
              );
              if (upcoming) {
                return {
                  status: "active",
                  reason: `Wawancara terjadwal: ${format(
                    upcoming.startAt.toDate(),
                    "dd MMM yyyy, HH:mm",
                  )} WIB`,
                  cta: (
                    <Button asChild size="sm">
                      <Link href="/careers/portal/interviews">Lihat Detail</Link>
                    </Button>
                  ),
                };
              }
              if (scheduled && scheduled.length > 0) {
                return {
                  status: "waiting",
                  reason: "Wawancara selesai, sedang dalam peninjauan.",
                };
              }
              return {
                status: "waiting",
                reason:
                  "Menunggu jadwal wawancara. Pantau portal ini secara berkala.",
              };
            }

            case "decision":
              if (application?.status === "offered") {
                return {
                  status: "active",
                  reason:
                    "Anda menerima penawaran kerja. Tinjau dan berikan keputusan di halaman Lamaran Saya.",
                  cta: (
                    <Button asChild size="sm">
                      <Link href="/careers/portal/applications">
                        Lihat Penawaran
                      </Link>
                    </Button>
                  ),
                };
              }
              if (application?.status === "hired") {
                return {
                  status: "active",
                  reason:
                    application.offerStatus === "accepted"
                      ? "Selamat! Penawaran diterima. Menunggu aktivasi akun oleh HRD."
                      : "Proses akhir sedang disiapkan oleh HRD.",
                };
              }
              return { status: "waiting", reason: "Proses keputusan akhir sedang berlangsung." };
          }
        }

        return {
          status: "locked",
          reason: "Selesaikan tahap sebelumnya untuk melanjutkan.",
        };
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highestStatus, currentStageIdx, isRejected, application, isProfileComplete],
  );

  if (!highestStatus && isProfileComplete) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">
          Profil Anda sudah lengkap! Lamar pekerjaan pertama Anda untuk memulai
          proses seleksi.
        </p>
        <Button asChild>
          <Link href="/careers/portal/jobs">Cari Lowongan</Link>
        </Button>
      </div>
    );
  }

  if (!highestStatus && !isProfileComplete) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">
          Lengkapi profil Anda untuk dapat memulai proses seleksi dan
          mengerjakan tes kepribadian.
        </p>
        <Button asChild>
          <Link href="/careers/portal/profile">Lengkapi Profil</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {CANDIDATE_STAGES.map((stage) => {
        const details = getStepDetails(stage);
        const meta = STAGE_META[stage];
        const Icon =
          details.status === "completed"
            ? Check
            : details.status === "locked"
              ? Lock
              : details.status === "waiting"
                ? Hourglass
                : meta.icon;

        return (
          <div key={stage} className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                details.status === "completed" &&
                  "bg-teal-500 border-teal-500 text-white",
                details.status === "active" &&
                  "bg-teal-50 dark:bg-teal-950/20 border-teal-500 text-teal-600",
                details.status === "waiting" &&
                  "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500",
                details.status === "locked" &&
                  "bg-muted border-border text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-grow pt-1">
              <h4 className="font-semibold text-sm">{meta.label}</h4>
              {details.reason && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {details.reason}
                </p>
              )}
            </div>
            {details.cta && (
              <div className="flex-shrink-0">{details.cta}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
