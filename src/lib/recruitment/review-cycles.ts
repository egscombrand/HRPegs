'use client';

import {
  startOfDay,
  endOfDay,
  addMonths,
  subMonths,
  isBefore,
  isAfter,
  isSameDay,
  differenceInDays,
  format,
} from 'date-fns';
import type { EmployeeProfile, MonthlyEvaluation } from '@/lib/types';

export type ReviewCycle = {
  periodStart: Date;
  periodEnd: Date;
  reviewDueDate: Date;
  monthId: string; // YYYY-MM format based on period start
  isCurrent: boolean;
};

export type ReviewStatus =
  | 'Belum Waktunya'
  | 'Akan Jatuh Tempo'
  | 'Siap Direview'
  | 'Terlambat'
  | 'Sudah Dievaluasi';

export interface InternWithReviewStatus extends EmployeeProfile {
  reviewCycle: ReviewCycle | null;
  reviewStatus: ReviewStatus;
}

/**
 * Calculates the current or next review cycle for an intern.
 * @param startDate The intern's official start date.
 * @param now The current date, for determining the active cycle.
 * @returns The current review cycle object, or null if the internship hasn't started.
 */
export function getCurrentReviewCycle(
  startDate: Date | null | undefined,
  now: Date = new Date()
): ReviewCycle | null {
  if (!startDate) return null;
  startDate = startOfDay(startDate);

  if (isAfter(startDate, now)) {
    return null; // Internship hasn't started
  }

  let periodStart = new Date(startDate);
  let periodEnd = endOfDay(addMonths(periodStart, 1));
  periodEnd.setDate(periodEnd.getDate() - 1); // e.g., April 9 to May 8

  // Find the current period
  while (isBefore(periodEnd, now)) {
    periodStart = addMonths(periodStart, 1);
    periodEnd = endOfDay(addMonths(periodStart, 1));
    periodEnd.setDate(periodEnd.getDate() - 1);
  }

  return {
    periodStart,
    periodEnd,
    reviewDueDate: periodEnd,
    monthId: format(periodStart, 'yyyy-MM'),
    isCurrent: true, // This function always finds the current cycle
  };
}

/**
 * Determines the review status based on the current cycle and evaluation data.
 * @param cycle The intern's current review cycle.
 * @param evaluation The existing evaluation for the current cycle's monthId, if any.
 * @param now The current date.
 * @returns The calculated review status.
 */
export function getReviewStatus(
  cycle: ReviewCycle | null,
  evaluation: MonthlyEvaluation | undefined,
  now: Date = new Date()
): ReviewStatus {
  // An evaluation is only 'complete' if the HRD comment exists.
  if (evaluation && evaluation.hrdComment) {
    return 'Sudah Dievaluasi';
  }

  if (!cycle) {
    return 'Belum Waktunya';
  }

  if (isAfter(now, cycle.reviewDueDate)) {
    return 'Terlambat';
  }
  
  const daysUntilDue = differenceInDays(cycle.reviewDueDate, now);
  
  if (daysUntilDue <= 7) {
    return 'Akan Jatuh Tempo';
  }

  return 'Siap Direview';
}
