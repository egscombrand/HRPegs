"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { JobApplicationStatus } from "@/lib/types";
import { Check, Users, Award, Search, CheckCircle } from "lucide-react";

// The visual steps for the candidate, in order.
const VISUAL_STEPS = [
  { stage: "screening", label: "Screening", icon: Search },
  { stage: "interview", label: "Interview", icon: Users },
  { stage: "offered", label: "Offering", icon: Award },
  { stage: "hired", label: "Hired", icon: CheckCircle },
];

function mapStage(
  status: string,
): "screening" | "interview" | "offering" | "hired" {
  const screeningStages = [
    "screening",
    "document_submission",
    "tes_kepribadian",
    "assessment",
    "verification",
  ];

  if (screeningStages.includes(status)) return "screening";
  if (status === "interview" || status === "waiting_evaluation")
    return "interview";
  if (status === "offered") return "offering";
  if (status === "hired") return "hired";

  return "screening";
}

const statusToVisualStepIndex = (status: string): number => {
  const mapped = mapStage(status);
  return VISUAL_STEPS.findIndex((step) => step.stage === mapped);
};

interface ApplicationProgressStepperProps {
  currentStatus: JobApplicationStatus | "waiting_evaluation";
}

export function ApplicationProgressStepper({
  currentStatus,
}: ApplicationProgressStepperProps) {
  const currentVisualIndex = statusToVisualStepIndex(currentStatus);

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center min-w-[500px]">
        {VISUAL_STEPS.map((step, index) => {
          const isActive = currentVisualIndex === index;
          const isCompleted = currentVisualIndex > index;

          return (
            <React.Fragment key={step.stage}>
              <div className="flex flex-col items-center text-center w-24 flex-shrink-0 z-10 rounded-md p-1">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                    isCompleted
                      ? "bg-primary border-primary"
                      : isActive
                        ? "bg-primary/10 border-primary"
                        : "bg-slate-50 border-slate-200 dark:bg-card dark:border-border",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-primary-foreground" />
                  ) : (
                    <step.icon
                      className={cn(
                        "h-5 w-5",
                        isActive
                          ? "text-primary"
                          : "text-slate-600 dark:text-muted-foreground",
                      )}
                    />
                  )}
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs font-medium transition-colors duration-300",
                    isCompleted || isActive
                      ? "text-primary"
                      : "text-slate-700 dark:text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
              </div>

              {index < VISUAL_STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-1 transition-colors duration-300 -mx-1",
                    isCompleted ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
