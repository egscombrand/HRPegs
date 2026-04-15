"use client";

import {
  Check,
  Lock,
  Pencil,
  Hourglass,
  Calendar,
  FileText,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { JobApplication, JobApplicationStatus } from "@/lib/types";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";
import { Skeleton } from "../ui/skeleton";
import { format } from "date-fns";

import { useMemo } from "react";

// The key stages a candidate sees, in order.
const candidateStages = [
  "application",
  "interview",
  "offering",
  "hired",
] as const;

function mapStage(status: JobApplicationStatus): CandidateStage {
  const applicationStages: JobApplicationStatus[] = [
    "draft",
    "submitted",
    "tes_kepribadian",
    "screening",
    "verification",
    "document_submission",
  ];

  if (applicationStages.includes(status)) return "application";
  if (status === "interview") return "interview";
  if (status === "offered") return "offering";
  if (status === "hired") return "hired";
  return "application";
}

type CandidateStage = (typeof candidateStages)[number];

type StepStatus = "completed" | "active" | "locked" | "waiting";

interface ApplicationStatusStepperProps {
  application: JobApplication | null;
  highestStatus: JobApplicationStatus | null;
  isProfileComplete: boolean;
  isLoading: boolean;
}

const StepperSkeleton = () => (
  <div className="space-y-6">
    {[...Array(5)].map((_, i) => (
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

export function ApplicationStatusStepper({
  application,
  highestStatus,
  isProfileComplete,
  isLoading,
}: ApplicationStatusStepperProps) {
  if (isLoading) {
    return <StepperSkeleton />;
  }

  const getStepDetails = (
    stage: CandidateStage,
  ): { status: StepStatus; cta?: React.ReactNode; reason?: string } => {
    if (!highestStatus) {
      // Case where user has account but never applied
      if (!isProfileComplete) {
        return {
          status: "locked",
          reason: "Lengkapi profil Anda untuk dapat memulai proses seleksi.",
        };
      }
      return {
        status: "locked",
        reason: "Lamar pekerjaan pertama Anda untuk memulai proses seleksi.",
      };
    }

    const currentStage = mapStage(highestStatus);
    const stepIndex = candidateStages.indexOf(stage);
    const currentStageIndex = candidateStages.indexOf(currentStage);

    if (highestStatus === "rejected") {
      if (stage === "application") {
        return {
          status: "waiting",
          reason:
            "Lamaran Anda ditolak. Silakan coba lagi dengan posisi lain atau perbarui dokumen Anda.",
        };
      }
      return {
        status: "locked",
        reason: "Lamaran belum mencapai tahap ini.",
      };
    }

    if (stepIndex < currentStageIndex) {
      return { status: "completed" };
    }

    if (stepIndex === currentStageIndex) {
      switch (stage) {
        case "application":
          if (highestStatus === "tes_kepribadian") {
            return {
              status: "active",
              reason: "Tes kepribadian Anda perlu diselesaikan.",
              cta: (
                <Button asChild size="sm">
                  <Link href="/careers/portal/assessment/personality">
                    Kerjakan Tes
                  </Link>
                </Button>
              ),
            };
          }
          if (highestStatus === "document_submission") {
            return {
              status: "active",
              reason:
                "Lengkapi dokumen lamaran Anda untuk melanjutkan proses seleksi.",
              cta: (
                <Button asChild size="sm">
                  <Link href="/careers/portal/documents">Unggah Dokumen</Link>
                </Button>
              ),
            };
          }
          if (highestStatus === "verification") {
            return {
              status: "waiting",
              reason:
                "Dokumen dan hasil tes Anda sedang diverifikasi oleh HRD.",
            };
          }
          if (highestStatus === "screening" || highestStatus === "submitted") {
            return {
              status: "waiting",
              reason: "Lamaran Anda sedang ditinjau oleh tim HRD.",
            };
          }
          return {
            status: "waiting",
            reason:
              "Aplikasi Anda sedang diproses. Pastikan profil dan dokumen sudah lengkap.",
          };
        case "interview":
          const getMostRelevantInterview = () => {
            if (!application?.interviews || application.interviews.length === 0)
              return null;
            const now = new Date();
            const scheduledInterviews = application.interviews.filter(
              (i) => i.status === "scheduled",
            );
            if (scheduledInterviews.length === 0) return null;

            const upcoming = scheduledInterviews
              .filter((i) => i.startAt.toDate() >= now)
              .sort(
                (a, b) =>
                  a.startAt.toDate().getTime() - b.startAt.toDate().getTime(),
              );

            if (upcoming.length > 0) return upcoming[0];

            const past = scheduledInterviews
              .filter((i) => i.startAt.toDate() < now)
              .sort(
                (a, b) =>
                  b.startAt.toDate().getTime() - a.startAt.toDate().getTime(),
              );

            return past.length > 0 ? past[0] : null;
          };
          const scheduledInterview = getMostRelevantInterview();

          if (scheduledInterview) {
            return {
              status: "active",
              reason: `Wawancara terjadwal: ${format(
                scheduledInterview.startAt.toDate(),
                "dd MMM yyyy, HH:mm",
              )}`,
              cta: (
                <Button asChild size="sm">
                  <Link href="/careers/portal/interviews">Lihat Detail</Link>
                </Button>
              ),
            };
          }
          return {
            status: "waiting",
            reason:
              "Menunggu jadwal wawancara dari HRD. Jadwal akan muncul di halaman Jadwal Wawancara.",
          };
        case "offering":
          return {
            status: "active",
            reason:
              "Anda telah menerima penawaran kerja. Tinjau dan berikan keputusan di halaman Lamaran Saya.",
            cta: (
              <Button asChild size="sm">
                <Link href="/careers/portal/applications">Lihat Penawaran</Link>
              </Button>
            ),
          };
        case "hired":
          return {
            status: "waiting",
            reason:
              application?.offerStatus === "accepted"
                ? "Selamat! Penawaran diterima. Menunggu aktivasi akun oleh HRD."
                : "Proses akhir sedang disiapkan oleh HRD.",
          };
        default:
          return { status: "locked" };
      }
    }

    return {
      status: "locked",
      reason: "Selesaikan tahap sebelumnya untuk melanjutkan.",
    };
  };

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
      {candidateStages.map((stage) => {
        const stepDetails = getStepDetails(stage);
        const Icon =
          stepDetails.status === "completed"
            ? Check
            : stage === "interview"
              ? Calendar
              : stage === "offering"
                ? Award
                : stage === "application"
                  ? FileText
                  : stepDetails.status === "active"
                    ? Pencil
                    : stepDetails.status === "waiting"
                      ? Hourglass
                      : Lock;
        const stageLabel = {
          application: "Application",
          interview: "Interview",
          offering: "Offering",
          hired: "Hired",
        }[stage];

        return (
          <div key={stage} className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                stepDetails.status === "completed" &&
                  "bg-primary border-primary text-primary-foreground",
                stepDetails.status === "active" &&
                  "bg-primary/10 border-primary text-primary",
                (stepDetails.status === "locked" ||
                  stepDetails.status === "waiting") &&
                  "bg-muted border-border text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-grow pt-1">
              <h4 className="font-semibold capitalize">{stageLabel}</h4>
              <p className="text-sm text-muted-foreground">
                {stepDetails.reason}
              </p>
            </div>
            {stepDetails.cta && (
              <div className="flex-shrink-0">{stepDetails.cta}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
