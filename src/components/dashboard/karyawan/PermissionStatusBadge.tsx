'use client';

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type PermissionRequestStatus } from "@/lib/types";

// Using a more generic naming convention for labels to be reusable.
export const permissionStatusDisplay: Record<PermissionRequestStatus, { label: string; className: string }> = {
    draft: { label: 'Draf', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
    pending_manager: { label: 'Menunggu Manajer', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' },
    rejected_manager: { label: 'Ditolak Manajer', className: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200' },
    revision_manager: { label: 'Revisi dari Manajer', className: 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200' },
    approved_by_manager: { label: 'Disetujui Manajer', className: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200' },
    pending_hrd: { label: 'Menunggu HRD', className: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200' },
    rejected_hrd: { label: 'Ditolak HRD', className: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200' },
    revision_hrd: { label: 'Revisi dari HRD', className: 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200' },
    approved: { label: 'Disetujui', className: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200' },
    
    // Non-blocking office exit statuses
    reported: { label: 'Dilaporkan Keluar', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-200 shadow-sm' },
    returned: { label: 'Sudah Kembali', className: 'bg-violet-100 text-violet-800 dark:bg-violet-800 dark:text-violet-200 shadow-sm animate-pulse' },
    verified_manager: { label: 'Terverifikasi Manajer', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200 border-emerald-200 shadow-sm' },
    closed: { label: 'Selesai (Arsip)', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 opacity-60 border-slate-200' },
};

interface PermissionStatusBadgeProps {
  status: PermissionRequestStatus;
  className?: string;
}

export function PermissionStatusBadge({ status, className }: PermissionStatusBadgeProps) {
  const config = permissionStatusDisplay[status] || permissionStatusDisplay.draft;
  return (
    <Badge className={cn("border-transparent font-medium", config.className, className)}>
      {config.label}
    </Badge>
  );
}
