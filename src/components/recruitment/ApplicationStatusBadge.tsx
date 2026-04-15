
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobApplicationStatus } from "@/lib/types";
import { ORDERED_RECRUITMENT_STAGES } from "@/lib/types";

export const statusDisplayLabels: Record<JobApplicationStatus | 'waiting_evaluation', string> = {
    draft: 'Draf',
    screening: 'Screening',
    interview: 'Wawancara',
    offered: 'Penawaran Kerja',
    hired: 'Diterima Kerja',
    rejected: 'Ditolak',
    waiting_evaluation: 'Menunggu Evaluasi',
    // Deprecated but kept for safety
    submitted: 'Lamaran Diterima',
    tes_kepribadian: 'Tes Kepribadian',
    verification: 'Verifikasi HRD',
    document_submission: 'Dokumen',
};

interface ApplicationStatusBadgeProps {
  status: JobApplicationStatus | 'waiting_evaluation';
  className?: string;
}

export function ApplicationStatusBadge({ status, className }: ApplicationStatusBadgeProps) {
  const statusConfig = {
    draft: { label: statusDisplayLabels.draft, variant: 'secondary' as const },
    screening: { label: statusDisplayLabels.screening, variant: 'default' as const, className: 'bg-cyan-600 hover:bg-cyan-700' },
    interview: { label: statusDisplayLabels.interview, variant: 'default' as const, className: 'bg-orange-500 hover:bg-orange-600' },
    offered: { label: statusDisplayLabels.offered, variant: 'default' as const, className: 'bg-pink-600 hover:bg-pink-700' },
    hired: { label: statusDisplayLabels.hired, variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    rejected: { label: statusDisplayLabels.rejected, variant: 'destructive' as const },
    waiting_evaluation: { label: statusDisplayLabels.waiting_evaluation, variant: 'default' as const, className: 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20' },
    // Deprecated
    submitted: { label: statusDisplayLabels.submitted, variant: 'default' as const },
    tes_kepribadian: { label: statusDisplayLabels.tes_kepribadian, variant: 'default' as const, className: 'bg-blue-600 hover:bg-blue-700' },
    verification: { label: statusDisplayLabels.verification, variant: 'default' as const, className: 'bg-purple-600 hover:bg-purple-700' },
    document_submission: { label: statusDisplayLabels.document_submission, variant: 'default' as const, className: 'bg-indigo-500 hover:bg-indigo-600' },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge variant={config.variant} className={cn((config as any).className, className)}>
      {config.label}
    </Badge>
  );
}
