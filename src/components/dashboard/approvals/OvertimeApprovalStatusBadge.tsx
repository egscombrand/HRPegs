"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type OvertimeSubmissionStatus } from "@/lib/types";

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
  pending_coordinator: {
    managerLabel: "Menunggu Review Anda",
    hrdLabel: "Menunggu Koordinator",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  },
  pending_supervisor: {
    managerLabel: "Menunggu Review Anda",
    hrdLabel: "Menunggu Manager Divisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  },
  pending_manager: {
    managerLabel: "Menunggu Review Anda",
    hrdLabel: "Menunggu Manager Divisi",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  },
  rejected_manager: {
    managerLabel: "Ditolak Manager",
    hrdLabel: "Ditolak Manager",
    className: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
  rejected_by_coordinator: {
    managerLabel: "Ditolak Koordinator",
    hrdLabel: "Ditolak Koordinator",
    className: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
  revision_requested_by_coordinator: {
    managerLabel: "Revisi dari Koordinator",
    hrdLabel: "Revisi dari Koordinator",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  },
  rejected_by_manager: {
    managerLabel: "Ditolak Manager",
    hrdLabel: "Ditolak Manager",
    className: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
  revision_requested_by_manager: {
    managerLabel: "Revisi dari Manager",
    hrdLabel: "Revisi dari Manager",
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
    managerLabel: "Diteruskan ke HRD",
    hrdLabel: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  },
  pending_hrd: {
    managerLabel: "Diteruskan ke HRD",
    hrdLabel: "Menunggu Review HRD",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  },
  rejected_hrd: {
    managerLabel: "Ditolak HRD",
    hrdLabel: "Ditolak HRD",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-500/20",
  },
  revision_hrd: {
    managerLabel: "Revisi dari HRD",
    hrdLabel: "Revisi Diminta",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-500/20",
  },
  approved_hrd: {
    managerLabel: "Disetujui HRD",
    hrdLabel: "Disetujui HRD (Final)",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-500/20",
  },
  rejected_by_hrd: {
    managerLabel: "Ditolak HRD",
    hrdLabel: "Ditolak HRD",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-500/20",
  },
  revision_requested_by_hrd: {
    managerLabel: "Revisi dari HRD",
    hrdLabel: "Revisi Diminta",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-500/20",
  },
  approved: {
    managerLabel: "Disetujui HRD",
    hrdLabel: "Disetujui HRD",
    className:
      "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300 border border-green-500/20",
  },
};

const payrollStatusConfig: Record<
  string,
  {
    managerLabel: string;
    hrdLabel: string;
    className: string;
  }
> = {
  pending_payroll: {
    managerLabel: "Masuk Payroll",
    hrdLabel: "Menunggu Payroll",
    className: "bg-blue-500/10 border-blue-500/20 text-blue-400 font-bold",
  },
  processing: {
    managerLabel: "Sedang Diproses Payroll",
    hrdLabel: "Sedang Diproses",
    className: "bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold",
  },
  paid: {
    managerLabel: "Sudah Dibayarkan",
    hrdLabel: "Lunas (Paid)",
    className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold",
  },
  excluded: {
    managerLabel: "Tidak Masuk Payroll",
    hrdLabel: "Tidak Masuk Payroll",
    className: "bg-red-500/10 border-red-500/20 text-red-400 font-bold",
  },
};

interface OvertimeApprovalStatusBadgeProps {
  status: OvertimeSubmissionStatus;
  mode: "manager" | "hrd";
  divisionName?: string;
  payrollStatus?: "pending_payroll" | "processing" | "paid" | "excluded" | null;
  className?: string;
}

export function OvertimeApprovalStatusBadge({
  status,
  mode,
  divisionName,
  payrollStatus,
  className,
}: OvertimeApprovalStatusBadgeProps) {
  // If approved and payrollStatus is set, show payroll-specific status badge
  if ((status === "approved" || status === "approved_hrd") && payrollStatus) {
    const config = payrollStatusConfig[payrollStatus];
    if (config) {
      const label = mode === "manager" ? config.managerLabel : config.hrdLabel;
      return (
        <Badge
          className={cn(
            "border font-medium",
            config.className,
            className
          )}
        >
          {label}
        </Badge>
      );
    }
  }

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
        "border font-medium",
        config.className,
        className
      )}
    >
      {label}
    </Badge>
  );
}
