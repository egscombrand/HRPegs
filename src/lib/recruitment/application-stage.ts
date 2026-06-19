import type { CandidatePersonalityTest, JobApplication, JobApplicationStatus } from "@/lib/types";

export type ApplicationDisplayStage = {
  displayStage: JobApplicationStatus | "evaluasi_hrd";
  displayStageLabel: string;
  candidateVisibleStatus: string;
  isPersonalityTestCompleted: boolean;
};

type PersonalityTestLike = Omit<Partial<CandidatePersonalityTest>, "status"> & {
  status?: string;
  isCompleted?: boolean;
  completedAt?: unknown;
  personalityTestCompleted?: boolean;
};

const PERSONALITY_TEST_STAGES = new Set(["tes_kepribadian", "personality_test", "personality"]);

const STAGE_LABELS: Record<string, string> = {
  draft: "Draf",
  submitted: "Lamaran Diterima",
  tes_kepribadian: "Tes Kepribadian",
  personality_test: "Tes Kepribadian",
  personality: "Tes Kepribadian",
  screening: "Evaluasi HRD",
  under_review: "Evaluasi HRD",
  evaluasi_hrd: "Evaluasi HRD",
  verification: "Verifikasi HRD",
  document_submission: "Dokumen",
  interview: "Wawancara",
  offered: "Penawaran Kerja",
  hired: "Diterima Kerja",
  rejected: "Ditolak",
};

export function isPersonalityTestCompleted(
  application?: Partial<JobApplication> | null,
  personalityTest?: PersonalityTestLike | null,
): boolean {
  return Boolean(
    personalityTest?.status === "completed" ||
      personalityTest?.status === "selesai" ||
      personalityTest?.isCompleted === true ||
      personalityTest?.completedAt != null ||
      personalityTest?.personalityTestCompleted === true ||
      application?.personalityTestCompleted === true ||
      application?.personalityTestStatus === "completed",
  );
}

export function getApplicationDisplayStage(
  application: Partial<JobApplication> & { status?: string; stage?: string },
  personalityTest?: PersonalityTestLike | null,
): ApplicationDisplayStage {
  const rawStage = String(application.stage || application.status || "screening");
  const completed = isPersonalityTestCompleted(application, personalityTest);

  if (PERSONALITY_TEST_STAGES.has(rawStage) && completed) {
    return {
      displayStage: "evaluasi_hrd",
      displayStageLabel: "Evaluasi HRD",
      candidateVisibleStatus: "Dalam Evaluasi",
      isPersonalityTestCompleted: true,
    };
  }

  const normalizedStage = rawStage === "under_review" ? "evaluasi_hrd" : rawStage;
  return {
    displayStage: normalizedStage as ApplicationDisplayStage["displayStage"],
    displayStageLabel: STAGE_LABELS[normalizedStage] || normalizedStage,
    candidateVisibleStatus: ["draft", "submitted", "tes_kepribadian", "personality_test", "personality"].includes(rawStage)
      ? "Menunggu Tes Kepribadian"
      : ["hired", "offered", "rejected"].includes(rawStage)
        ? STAGE_LABELS[rawStage]
        : "Dalam Evaluasi",
    isPersonalityTestCompleted: completed,
  };
}

export function getApplicationFilterStage(
  application: Partial<JobApplication> & { status?: string; stage?: string },
  personalityTest?: PersonalityTestLike | null,
): JobApplicationStatus {
  const display = getApplicationDisplayStage(application, personalityTest);
  if (display.displayStage === "evaluasi_hrd") return "screening";
  return display.displayStage as JobApplicationStatus;
}

export function shouldNormalizeCompletedPersonalityApplication(
  application: Partial<JobApplication> & { status?: string; stage?: string },
  personalityTest?: PersonalityTestLike | null,
): boolean {
  return (
    isPersonalityTestCompleted(application, personalityTest) &&
    (PERSONALITY_TEST_STAGES.has(application.status || "") ||
      PERSONALITY_TEST_STAGES.has(application.stage || ""))
  );
}
