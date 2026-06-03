'use client';

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type PermissionRequestStatus, type PermissionRequest } from "@/lib/types";

export const permissionStatusDisplay: Record<PermissionRequestStatus, { label: string; className: string }> = {
    draft: { label: 'Draf', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
    pending_manager: { label: 'Menunggu Atasan', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    rejected_manager: { label: 'Ditolak Atasan', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    revision_manager: { label: 'Perlu Revisi', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
    approved_by_manager: { label: 'Disetujui Atasan', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    pending_hrd: { label: 'Menunggu HRD', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    rejected_hrd: { label: 'Ditolak HRD', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    revision_hrd: { label: 'Perlu Revisi (HRD)', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
    approved: { label: 'Disetujui', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    reported: { label: 'Dilaporkan Keluar', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
    returned: { label: 'Sudah Kembali', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
    verified_manager: { label: 'Terverifikasi', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
    closed: { label: 'Selesai', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

/** Returns a human-readable status label, optionally including names from the submission. */
export function getHumanStatusLabel(status: string, submission?: Pick<PermissionRequest, 'managerName' | 'waitingForName'>): string {
    const managerName = submission?.waitingForName || submission?.managerName || null;
    switch (status) {
        case 'pending_manager': return managerName ? `Menunggu persetujuan ${managerName}` : 'Menunggu Atasan';
        case 'rejected_manager': return managerName ? `Ditolak oleh ${managerName}` : 'Ditolak Atasan';
        case 'revision_manager': return managerName ? `Perlu revisi dari ${managerName}` : 'Perlu Revisi';
        case 'approved_by_manager': return 'Disetujui Atasan → Menunggu HRD';
        case 'pending_hrd': return 'Menunggu validasi HRD';
        case 'rejected_hrd': return 'Ditolak HRD';
        case 'revision_hrd': return 'Perlu revisi dari HRD';
        case 'approved': return 'Disetujui';
        case 'reported': return 'Dilaporkan Keluar';
        case 'returned': return 'Sudah Kembali';
        case 'verified_manager': return 'Terverifikasi';
        case 'closed': return 'Selesai';
        case 'draft': return 'Draf';
        default: return status.replace(/_/g, ' ');
    }
}

interface PermissionStatusBadgeProps {
  status: PermissionRequestStatus;
  submission?: Pick<PermissionRequest, 'managerName' | 'waitingForName'>;
  className?: string;
}

export function PermissionStatusBadge({ status, submission, className }: PermissionStatusBadgeProps) {
  const config = permissionStatusDisplay[status] || permissionStatusDisplay.draft;
  const label = submission ? getHumanStatusLabel(status, submission) : config.label;
  return (
    <Badge className={cn("border-transparent font-medium text-xs", config.className, className)}>
      {label}
    </Badge>
  );
}
