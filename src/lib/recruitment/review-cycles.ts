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
import type { EmployeeProfile, MonthlyEvaluation, ReviewCycle, ReviewStatus } from '@/lib/types';

const PAYROLL_CUTOFF_DAY = 24;

/**
 * Calculates the review cycle for an intern based on a company-wide payroll cycle.
 * @param internStartDate The intern's official start date.
 * @param internEndDate The intern's official end date (optional).
 * @param selectedDate A date within the month of interest for the review.
 * @returns The review cycle object, or null if the intern is not active in that cycle.
 */
export function getReviewCycleForMonth(
  internStartDate: Date | null | undefined,
  internEndDate: Date | null | undefined,
  selectedDate: Date
): ReviewCycle | null {
  if (!internStartDate) return null;

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  // The payroll period ends on the 24th of the selected month.
  const payrollPeriodEnd = endOfDay(new Date(year, month, PAYROLL_CUTOFF_DAY));
  // It starts on the 25th of the previous month.
  const prevMonthDate = subMonths(new Date(year, month, 1), 1);
  const payrollPeriodStart = startOfDay(new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), PAYROLL_CUTOFF_DAY + 1));
  
  const effectiveStartDate = startOfDay(internStartDate);
  const effectiveEndDate = internEndDate ? endOfDay(internEndDate) : null;

  // Check for overlap between intern's employment and the payroll cycle
  // No overlap if internship ends before cycle starts, or starts after cycle ends.
  if (effectiveEndDate && isBefore(effectiveEndDate, payrollPeriodStart)) return null;
  if (isAfter(effectiveStartDate, payrollPeriodEnd)) return null;

  // Calculate the intern's active period within this payroll cycle
  const activePeriodStart = isAfter(effectiveStartDate, payrollPeriodStart) ? effectiveStartDate : payrollPeriodStart;
  const activePeriodEnd = (effectiveEndDate && isBefore(effectiveEndDate, payrollPeriodEnd)) ? effectiveEndDate : payrollPeriodEnd;

  return {
    payrollPeriodStart,
    payrollPeriodEnd,
    activePeriodStart,
    activePeriodEnd,
    reviewDueDate: payrollPeriodEnd,
    monthId: format(selectedDate, 'yyyy-MM'),
    isCurrent: isAfter(new Date(), payrollPeriodStart) && isBefore(new Date(), payrollPeriodEnd),
  };
}

/**
 * Determines the review status based on the current cycle and evaluation data.
 * An evaluation is considered "done" only if hrdComment exists.
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

  // If we are past the due date and it's not evaluated
  if (isAfter(now, cycle.reviewDueDate)) {
    return 'Terlambat';
  }
  
  const daysUntilDue = differenceInDays(cycle.reviewDueDate, now);
  
  // If due within the next 7 days (or is today)
  if (daysUntilDue <= 7) {
    return 'Akan Jatuh Tempo';
  }

  // Otherwise, it's ready to be reviewed anytime before the "due soon" window.
  return 'Siap Direview';
}
