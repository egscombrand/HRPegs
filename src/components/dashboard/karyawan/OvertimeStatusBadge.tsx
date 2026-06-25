"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type OvertimeSubmissionStatus } from "@/lib/types";

export const statusDisplay: Record<
  string,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  timer_running: {
    label: "Sedang Berjalan",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-500/10",
  },
  timer_paused: {
    label: "Dijeda",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-500/10",
  },
  timer_finished_pending_submit: {
    label: "Siap Diajukan",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-500/10",
  },
  pending_coordinator: {
    label: "Menunggu Review Koordinator",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-500/10",
  },
  pending_supervisor: {
    label: "Menunggu Review Manager",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-500/10",
  },
  pending_manager: {
    label: "Menunggu Review Manager",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-500/10",
  },
  approved_by_manager: {
    label: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-500/10",
  },
  pending_hrd: {
    label: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-500/10",
  },
  needs_revision: {
    label: "Perlu Revisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  revision_requested: {
    label: "Perlu Revisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  revision_manager: {
    label: "Perlu Revisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  revision_hrd: {
    label: "Perlu Revisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  rejected: {
    label: "Ditolak",
    className: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-500/10",
  },
  rejected_manager: {
    label: "Ditolak Manager",
    className: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-500/10",
  },
  rejected_hrd: {
    label: "Ditolak HRD",
    className: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-500/10",
  },
  rejected_by_coordinator: {
    label: "Ditolak Koordinator",
    className: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-500/10",
  },
  revision_requested_by_coordinator: {
    label: "Perlu Revisi (Koordinator)",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  rejected_by_manager: {
    label: "Ditolak Manager",
    className: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-500/10",
  },
  revision_requested_by_manager: {
    label: "Perlu Revisi (Manager)",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  rejected_by_hrd: {
    label: "Ditolak HRD",
    className: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-500/10",
  },
  revision_requested_by_hrd: {
    label: "Perlu Revisi (HRD)",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-500/10",
  },
  approved: {
    label: "Disetujui HRD",
    className:
      "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300 border border-green-500/10",
  },
  approved_hrd: {
    label: "Disetujui HRD",
    className:
      "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300 border border-green-500/10",
  },
  pending_completion_confirmation: {
    label: "Menunggu Konfirmasi Selesai",
    className:
      "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-500/10",
  },
  completed_confirmed: {
    label: "Selesai Dikonfirmasi",
    className:
      "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-500/10",
  },
  duration_needs_review: {
    label: "Perlu Review Tambahan Durasi",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-500/10",
  },
};

const payrollStatusDisplay: Record<
  string,
  { label: string; className: string }
> = {
  pending_payroll: {
    label: "Masuk Payroll",
    className: "bg-blue-500/10 border-blue-500/20 text-blue-400 font-bold",
  },
  processing: {
    label: "Sedang Diproses Payroll",
    className: "bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold",
  },
  paid: {
    label: "Sudah Dibayarkan",
    className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold",
  },
  excluded: {
    label: "Tidak Masuk Payroll",
    className: "bg-red-500/10 border-red-500/20 text-red-400 font-bold",
  },
};

interface OvertimeStatusBadgeProps {
  status: OvertimeSubmissionStatus;
  payrollStatus?: "pending_payroll" | "processing" | "paid" | "excluded" | null;
  className?: string;
}

export function OvertimeStatusBadge({
  status,
  payrollStatus,
  className,
}: OvertimeStatusBadgeProps) {
  // If submission is approved, check for payrollStatus override
  if ((status === "approved" || status === "approved_hrd") && payrollStatus) {
    const config = payrollStatusDisplay[payrollStatus];
    if (config) {
      return (
        <Badge
          className={cn(
            "border font-medium",
            config.className,
            className
          )}
        >
          {config.label}
        </Badge>
      );
    }
  }

  const config = statusDisplay[status] || statusDisplay.draft;
  return (
    <Badge
      className={cn(
        "border font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
