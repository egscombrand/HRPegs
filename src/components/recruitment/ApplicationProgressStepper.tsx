'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { JobApplicationStatus } from '@/lib/types';
import { Check, Users, Award, Search, BrainCircuit, CheckCircle } from 'lucide-react';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';

// The visual steps for the candidate, in order.
const VISUAL_STEPS = [
  { stage: 'screening', label: 'Screening', icon: Search },
  { stage: 'tes_kepribadian', label: 'Assessment', icon: BrainCircuit },
  { stage: 'interview', label: 'Interview', icon: Users },
  { stage: 'offered', label: 'Offering', icon: Award },
  { stage: 'hired', label: 'Hired', icon: CheckCircle },
];

// Map internal statuses to the index of the visual step.
const statusToVisualStepIndex = (status: JobApplicationStatus): number => {
  switch (status) {
    case 'draft':
    case 'submitted':
    case 'screening':
    case 'verification':
    case 'document_submission':
      return 0; // All these map to the "Screening" visual step
    case 'tes_kepribadian':
      return 1; // Maps to "Assessment"
    case 'interview':
      return 2; // Maps to "Interview"
    case 'offered':
      return 3; // Maps to "Offering"
    case 'hired':
      return 4; // Maps to "Hired"
    case 'rejected':
      return -1; // Rejected state
    default:
      return 0; // Default to the first step
  }
};


interface ApplicationProgressStepperProps {
  currentStatus: JobApplicationStatus;
}

export function ApplicationProgressStepper({ currentStatus }: ApplicationProgressStepperProps) {
  const currentVisualIndex = statusToVisualStepIndex(currentStatus);
  const isRejected = currentStatus === 'rejected';

  // If rejected, we don't show a linear progress bar.
  if (isRejected) {
    return null; 
  }

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
                    'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                    isCompleted ? 'bg-primary border-primary' : (isActive ? 'bg-primary/10 border-primary' : 'bg-card border-border')
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-primary-foreground" />
                  ) : (
                    <step.icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  )}
                </div>
                <p className={cn(
                  'mt-2 text-xs font-medium transition-colors duration-300',
                  (isCompleted || isActive) ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {step.label}
                </p>
              </div>

              {index < VISUAL_STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-1 transition-colors duration-300 -mx-1",
                  isCompleted ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
