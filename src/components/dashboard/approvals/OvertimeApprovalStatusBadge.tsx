"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type OvertimeSubmissionStatus } from "@/lib/types";

// Define a more detailed status configuration
const statusConfig: Record<
  OvertimeSubmissionStatus,
  {
    managerLabel: string;
    hrdLabel: string;
    className: string;
  }
> = {
  draft: {
    managerLabel: "Draf",
    hrdLabel: "Draf",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  pending_supervisor: {
    managerLabel: "Menunggu Persetujuan Anda",
    hrdLabel: "Menunggu Manager Divisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  },
  pending_manager: {
    managerLabel: "Menunggu Persetujuan Anda",
    hrdLabel: "Menunggu Manager Divisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  },
  rejected_manager: {
    managerLabel: "Ditolak",
    hrdLabel: "Ditolak",
    className: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
  needs_revision: {
    managerLabel: "Perlu Revisi",
    hrdLabel: "Perlu Revisi",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  revision_manager: {
    managerLabel: "Revisi Diminta",
    hrdLabel: "Revisi dari Manajer",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  approved_by_manager: {
    managerLabel: "Disetujui Anda",
    hrdLabel: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  },
  pending_hrd: {
    managerLabel: "Menunggu Review HRD",
    hrdLabel: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  },
  rejected_hrd: {
    managerLabel: "Ditolak",
    hrdLabel: "Ditolak",
    className: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
  revision_hrd: {
    managerLabel: "Revisi dari HRD",
    hrdLabel: "Revisi Diminta",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  approved: {
    managerLabel: "Disetujui",
    hrdLabel: "Disetujui HRD",
    className:
      "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",
  },
  approved_hrd: {
    managerLabel: "Disetujui",
    hrdLabel: "Disetujui HRD",
    className:
      "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",
  },
};

interface OvertimeApprovalStatusBadgeProps {
  status: OvertimeSubmissionStatus;
  mode: "manager" | "hrd";
  divisionName?: string;
  className?: string;
}

export function OvertimeApprovalStatusBadge({
  status,
  mode,
  divisionName,
  className,
}: OvertimeApprovalStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  const label = (() => {
    if (status === "pending_supervisor" && mode === "hrd") {
      return divisionName
        ? `Menunggu Manager Divisi ${divisionName}`
        : "Menunggu Manager Divisi";
    }

    return mode === "manager" ? config.managerLabel : config.hrdLabel;
  })();

  return (
    <Badge
      className={cn(
        "border-transparent font-medium",
        config.className,
        className,
      )}
    >
      {label}
    </Badge>
  );
}
