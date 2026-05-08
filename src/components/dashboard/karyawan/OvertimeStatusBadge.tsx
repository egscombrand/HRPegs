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
  pending_supervisor: {
    label: "Menunggu Manager Divisi",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  pending_manager: {
    label: "Menunggu Manager Divisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  },
  approved_by_manager: {
    label: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  },
  pending_hrd: {
    label: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  },
  needs_revision: {
    label: "Perlu Revisi",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  revision_requested: {
    label: "Perlu Revisi",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  revision_manager: {
    label: "Perlu Revisi",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  revision_hrd: {
    label: "Perlu Revisi",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  rejected: {
    label: "Ditolak",
    className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200",
  },
  rejected_manager: {
    label: "Ditolak Manajer",
    className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200",
  },
  rejected_hrd: {
    label: "Ditolak HRD",
    className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200",
  },
  approved: {
    label: "Disetujui HRD",
    className:
      "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200",
  },
  approved_hrd: {
    label: "Disetujui HRD",
    className:
      "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200",
  },
};

interface OvertimeStatusBadgeProps {
  status: OvertimeSubmissionStatus;
  className?: string;
}

export function OvertimeStatusBadge({
  status,
  className,
}: OvertimeStatusBadgeProps) {
  const config = statusDisplay[status] || statusDisplay.draft;
  return (
    <Badge
      className={cn(
        "border-transparent font-medium",
        config.className,
        className,
      )}
    >
      {config.label}
    </Badge>
  );
}
