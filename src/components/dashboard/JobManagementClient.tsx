'use client';

import { useMemo, useState } from 'react';
import {
  collection, doc, serverTimestamp, query, where, Timestamp, arrayUnion,
} from 'firebase/firestore';
import {
  useCollection, useFirestore, useMemoFirebase,
  updateDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking,
} from '@/firebase';
import type { Job, Brand, UserProfile } from '@/lib/types';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  PlusCircle, Trash2, Edit, Eye, EyeOff, XCircle, Users,
  Copy, CalendarClock, ArchiveIcon, RefreshCw, AlertTriangle,
  Clock, CheckCircle2, UserCheck, ChevronDown, Briefcase,
  Building2, Tag, TrendingUp,
} from 'lucide-react';
import { JobFormDialog } from './JobFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssignedUsersDialog } from '../recruitment/AssignedUsersDialog';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { GoogleDatePicker } from '../ui/google-date-picker';

// ─── Status helpers ───────────────────────────────────────────────────────────

function resolveEffectiveStatus(job: Job): Job['publishStatus'] {
  if (job.publishStatus === 'published' || job.publishStatus === 'reopened') {
    const deadline = job.applyDeadline || job.applicationDeadline;
    if (deadline && isPast(deadline.toDate())) return 'expired';
  }
  return job.publishStatus;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; pill: string }> = {
  published: {
    label: 'Published',
    dot: 'bg-green-500',
    pill: 'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-800',
  },
  reopened: {
    label: 'Reopened',
    dot: 'bg-teal-500',
    pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800',
  },
  draft: {
    label: 'Draft',
    dot: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  },
  expired: {
    label: 'Expired',
    dot: 'bg-orange-400',
    pill: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-800',
  },
  closed: {
    label: 'Closed',
    dot: 'bg-red-500',
    pill: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800',
  },
  archived: {
    label: 'Archived',
    dot: 'bg-slate-300',
    pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-500 dark:ring-slate-700',
  },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Deadline cell ────────────────────────────────────────────────────────────

function DeadlineCell({ job }: { job: Job }) {
  const deadline = job.applyDeadline || job.applicationDeadline;
  if (!deadline) {
    return <span className="text-slate-400 text-xs italic">Tidak ada</span>;
  }
  const date = deadline.toDate();
  const expired = isPast(date);
  const today = isToday(date);
  const daysLeft = differenceInDays(date, new Date());

  return (
    <div className="space-y-1">
      <p className={`text-sm font-medium ${expired ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {format(date, 'dd MMM yyyy', { locale: idLocale })}
      </p>
      {expired ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
          <Clock className="h-2.5 w-2.5" /> Expired
        </span>
      ) : today ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
          Hari ini!
        </span>
      ) : daysLeft <= 7 ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <AlertTriangle className="h-2.5 w-2.5" /> Segera Berakhir · {daysLeft}h
        </span>
      ) : (
        <span className="text-[10px] text-slate-400">{daysLeft} hari lagi</span>
      )}
    </div>
  );
}

// ─── Applicant pipeline cell ──────────────────────────────────────────────────

function ApplicantCell({ counts }: {
  counts: { total: number; new: number; inProgress: number; interview: number; offered: number; hired: number; rejected: number };
}) {
  if (counts.total === 0) {
    return <span className="text-xs text-slate-400 italic">Belum ada pelamar</span>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-none">{counts.total}</p>
      <div className="flex flex-wrap gap-1">
        {counts.new > 0 && (
          <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 rounded-full px-1.5 py-0.5 ring-1 ring-blue-200 dark:ring-blue-800">
            Baru: {counts.new}
          </span>
        )}
        {counts.interview > 0 && (
          <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 rounded-full px-1.5 py-0.5 ring-1 ring-purple-200 dark:ring-purple-800">
            Interview: {counts.interview}
          </span>
        )}
        {counts.hired > 0 && (
          <span className="text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/60 rounded-full px-1.5 py-0.5 ring-1 ring-green-200 dark:ring-green-800">
            Diterima: {counts.hired}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 px-4 py-4 shadow-sm ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums">{value}</p>
        </div>
        <div className="rounded-xl p-2 bg-current/8 opacity-80">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Quick filter chips ───────────────────────────────────────────────────────

const QUICK_FILTERS = [
  { key: 'all',         label: 'Semua' },
  { key: 'published',   label: 'Published' },
  { key: 'draft',       label: 'Draft' },
  { key: 'expired',     label: 'Expired' },
  { key: 'closed',      label: 'Closed' },
  { key: 'needsReview', label: 'Butuh Review' },
  { key: 'needsExtend', label: 'Perlu Perpanjangan' },
] as const;

// ─── Extend Deadline Dialog ───────────────────────────────────────────────────

function ExtendDeadlineDialog({
  job, open, onOpenChange, onSave,
}: {
  job: Job | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (newDeadline: Date, reason: string) => Promise<void>;
}) {
  const [newDeadline, setNewDeadline] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const oldDeadline = job?.applyDeadline || job?.applicationDeadline;

  const handleSave = async () => {
    if (!newDeadline || !reason.trim()) return;
    setLoading(true);
    try { await onSave(newDeadline, reason); onOpenChange(false); setReason(''); setNewDeadline(null); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Perpanjang Deadline Lamaran</DialogTitle>
          <DialogDescription>Perpanjang deadline untuk "{job?.position}".</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {oldDeadline && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Deadline lama: </span>
              <span className="font-semibold">{format(oldDeadline.toDate(), 'dd MMMM yyyy', { locale: idLocale })}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label>Deadline Baru <span className="text-red-500">*</span></Label>
            <GoogleDatePicker value={newDeadline} onChange={setNewDeadline} portalled={false} />
          </div>
          <div className="space-y-2">
            <Label>Alasan Perpanjangan <span className="text-red-500">*</span></Label>
            <Textarea
              placeholder="Contoh: Kandidat yang masuk belum memenuhi kualifikasi..."
              value={reason} onChange={e => setReason(e.target.value)} rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={!newDeadline || !reason.trim() || loading}>
            {loading && <span className="mr-2 h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full inline-block" />}
            Perpanjang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Job row — desktop ────────────────────────────────────────────────────────

function JobRow({ job, userProfileMap, onEdit, onDelete, onAssign, onExtend, onDuplicate, onStatusChange, isSuperAdmin }: {
  job: any;
  userProfileMap: Map<string, UserProfile>;
  onEdit: (j: Job) => void;
  onDelete: (j: Job) => void;
  onAssign: (j: Job) => void;
  onExtend: (j: Job) => void;
  onDuplicate: (j: Job) => void;
  onStatusChange: (j: Job, s: Job['publishStatus']) => void;
  isSuperAdmin: boolean;
}) {
  const assignedUsers = (job.assignedUserIds || [])
    .map((uid: string) => userProfileMap.get(uid))
    .filter((u: any): u is UserProfile => !!u);

  const deadline = job.applyDeadline || job.applicationDeadline;
  const daysLeft = deadline ? differenceInDays(deadline.toDate(), new Date()) : null;
  const expired = deadline ? isPast(deadline.toDate()) : false;
  const needsExtension = job.effectiveStatus === 'expired' || (daysLeft !== null && daysLeft <= 3 && job.appCounts.total < (job.numberOfOpenings || 1));
  const needsReview = job.appCounts.new > 0;
  const divisionLabel = job.divisionName || job.division || null;

  return (
    <tr className="group border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
      {/* Position */}
      <td className="px-5 py-4 align-top">
        <div className="space-y-1 max-w-[220px]">
          <p className="font-semibold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2">{job.position}</p>
          {job.jobCode && (
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{job.jobCode}</p>
          )}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {needsReview && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                Butuh Review
              </span>
            )}
            {needsExtension && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 ring-1 ring-orange-200 dark:ring-orange-800">
                Perlu Perpanjangan
              </span>
            )}
            {job.deadlineExtended && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800">
                Diperpanjang
              </span>
            )}
          </div>
          {job.createdAt?.toDate && (
            <p className="text-[10px] text-slate-400">
              Dibuat {format(job.createdAt.toDate(), 'dd MMM yyyy', { locale: idLocale })}
            </p>
          )}
        </div>
      </td>

      {/* Brand & Division */}
      <td className="px-5 py-4 align-top">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{job.brandName}</p>
          </div>
          {divisionLabel ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-700">
              <Tag className="h-2.5 w-2.5" /> {divisionLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-full px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-700 italic">
              Level Brand/Unit
            </span>
          )}
        </div>
      </td>

      {/* Type + Mode */}
      <td className="px-5 py-4 align-top">
        <div className="space-y-1.5">
          <span className="inline-block text-[11px] font-semibold capitalize rounded-md px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {job.statusJob === 'fulltime' ? 'Full-time' : job.statusJob === 'internship' ? 'Internship' : 'Kontrak'}
          </span>
          {job.workMode && (
            <span className="block text-[10px] capitalize text-slate-400">{job.workMode}</span>
          )}
          {job.numberOfOpenings && (
            <span className="block text-[10px] text-slate-400">{job.numberOfOpenings} posisi</span>
          )}
        </div>
      </td>

      {/* Applicants */}
      <td className="px-5 py-4 align-top">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default">
                <ApplicantCell counts={job.appCounts} />
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs space-y-0.5 p-3">
              <p className="font-semibold mb-1">Pipeline Detail</p>
              <p>Total: <strong>{job.appCounts.total}</strong></p>
              <p>Baru: <strong>{job.appCounts.new}</strong></p>
              <p>Proses: <strong>{job.appCounts.inProgress}</strong></p>
              <p>Interview: <strong>{job.appCounts.interview}</strong></p>
              <p>Offering: <strong>{job.appCounts.offered}</strong></p>
              <p>Diterima: <strong>{job.appCounts.hired}</strong></p>
              <p>Ditolak: <strong>{job.appCounts.rejected}</strong></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>

      {/* Status */}
      <td className="px-5 py-4 align-top">
        <StatusPill status={job.effectiveStatus} />
      </td>

      {/* Deadline */}
      <td className="px-5 py-4 align-top">
        <DeadlineCell job={job} />
      </td>

      {/* Assigned */}
      <td className="px-5 py-4 align-top">
        {assignedUsers.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center -space-x-2 cursor-default">
                  {assignedUsers.slice(0, 3).map((u: UserProfile) => (
                    <Avatar key={u.uid} className="h-7 w-7 border-2 border-white dark:border-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
                      <AvatarFallback className="text-[9px] bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold">
                        {getInitials(u.fullName)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {assignedUsers.length > 3 && (
                    <Avatar className="h-7 w-7 border-2 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800">
                      <AvatarFallback className="text-[9px] text-slate-600 dark:text-slate-400">+{assignedUsers.length - 3}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{assignedUsers.map((u: UserProfile) => u.fullName).join(', ')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-slate-400 italic">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-4 align-top text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 px-3 text-xs font-medium border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:text-teal-700 dark:hover:border-teal-600 dark:hover:text-teal-300 transition-colors">
              Kelola <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border-slate-200 dark:border-slate-700">
            <DropdownMenuItem asChild>
              <Link href={`/admin/recruitment/jobs/${job.id}`} className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-slate-500" /> Lihat Pelamar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onEdit(job)} className="gap-2 text-sm">
              <Edit className="h-4 w-4 text-slate-500" /> Edit Lowongan
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(job)} className="gap-2 text-sm">
              <Copy className="h-4 w-4 text-slate-500" /> Duplikat
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAssign(job)} className="gap-2 text-sm">
              <UserCheck className="h-4 w-4 text-slate-500" /> Kelola Tim
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onExtend(job)} className="gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-blue-500" /> Perpanjang Deadline
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(job.effectiveStatus === 'draft' || job.effectiveStatus === 'closed' || job.effectiveStatus === 'expired') && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'published')} className="gap-2 text-sm">
                <Eye className="h-4 w-4 text-green-600" /> Publish
              </DropdownMenuItem>
            )}
            {(job.publishStatus === 'closed' || job.effectiveStatus === 'expired') && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'reopened')} className="gap-2 text-sm">
                <RefreshCw className="h-4 w-4 text-teal-600" /> Buka Ulang
              </DropdownMenuItem>
            )}
            {(job.publishStatus === 'published' || job.publishStatus === 'reopened') && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'draft')} className="gap-2 text-sm">
                <EyeOff className="h-4 w-4 text-slate-500" /> Jadikan Draft
              </DropdownMenuItem>
            )}
            {job.publishStatus !== 'closed' && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'closed')} className="gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-500" /> Tutup Lowongan
              </DropdownMenuItem>
            )}
            {job.publishStatus !== 'archived' && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'archived')} className="gap-2 text-sm text-slate-500">
                <ArchiveIcon className="h-4 w-4" /> Arsipkan
              </DropdownMenuItem>
            )}
            {isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDelete(job)} className="gap-2 text-sm text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950/30">
                  <Trash2 className="h-4 w-4" /> Hapus Permanen
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ─── Mobile job card ──────────────────────────────────────────────────────────

function JobMobileCard({ job, onEdit, onExtend, onStatusChange }: {
  job: any;
  onEdit: (j: Job) => void;
  onExtend: (j: Job) => void;
  onStatusChange: (j: Job, s: Job['publishStatus']) => void;
}) {
  const deadline = job.applyDeadline || job.applicationDeadline;
  const divisionLabel = job.divisionName || job.division || null;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-900 dark:text-white">{job.position}</p>
          {job.jobCode && <p className="text-[10px] font-mono text-slate-400 mt-0.5">{job.jobCode}</p>}
        </div>
        <StatusPill status={job.effectiveStatus} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{job.brandName}</span>
        {divisionLabel && <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{divisionLabel}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-[11px] font-medium capitalize rounded-md px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          {job.statusJob}
        </span>
        {job.workMode && <span className="text-[11px] capitalize rounded-md px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500">{job.workMode}</span>}
      </div>

      <div className="flex items-center justify-between pt-1">
        <div>
          {job.appCounts.total > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-800 dark:text-white">{job.appCounts.total}</span>
              <span className="text-xs text-slate-400">pelamar</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">Belum ada pelamar</span>
          )}
        </div>
        {deadline && <DeadlineCell job={job} />}
      </div>

      <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => onEdit(job)}>
          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => onExtend(job)}>
          <CalendarClock className="h-3.5 w-3.5 mr-1" /> Perpanjang
        </Button>
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" asChild>
          <Link href={`/admin/recruitment/jobs/${job.id}`}>
            <Users className="h-3.5 w-3.5 mr-1" /> Pelamar
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JobManagementClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isAssignUsersOpen, setIsAssignUsersOpen] = useState(false);
  const [isExtendOpen, setIsExtendOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [quickFilter, setQuickFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const jobsRef = useMemoFirebase(() => collection(firestore, 'jobs'), [firestore]);
  const { data: jobs, isLoading: isLoadingJobs, mutate: mutateJobs } = useCollection<Job>(jobsRef);

  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsRef);

  const usersQuery = useMemoFirebase(() =>
    query(collection(firestore, 'users'), where('role', 'in', ['hrd', 'super-admin', 'manager', 'karyawan']), where('isActive', '==', true)),
    [firestore]
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  const appsRef = useMemoFirebase(() => collection(firestore, 'applications'), [firestore]);
  const { data: applications } = useCollection<any>(appsRef);

  const isLoading = isLoadingJobs || isLoadingBrands || isLoadingUsers;
  const isSuperAdmin = userProfile?.role === 'super-admin';

  const brandMap = useMemo(() => new Map((brands || []).map(b => [b.id!, b.name])), [brands]);
  const userProfileMap = useMemo(() => new Map((users || []).map(u => [u.uid, u])), [users]);
  const assignableUsers = useMemo(() => (users || []).filter(u => u.role === 'manager' || u.role === 'karyawan'), [users]);

  const appCountsByJob = useMemo(() => {
    const counts = new Map<string, { total: number; new: number; inProgress: number; interview: number; offered: number; hired: number; rejected: number }>();
    (applications || []).forEach((app: any) => {
      const jobId = app.jobId;
      if (!jobId) return;
      const prev = counts.get(jobId) || { total: 0, new: 0, inProgress: 0, interview: 0, offered: 0, hired: 0, rejected: 0 };
      prev.total++;
      if (app.status === 'submitted' || app.status === 'draft') prev.new++;
      else if (app.status === 'interview') prev.interview++;
      else if (app.status === 'offered') prev.offered++;
      else if (app.status === 'hired') prev.hired++;
      else if (app.status === 'rejected') prev.rejected++;
      else prev.inProgress++;
      counts.set(jobId, prev);
    });
    return counts;
  }, [applications]);

  const enrichedJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.map(j => ({
      ...j,
      brandName: brandMap.get(j.brandId) || 'N/A',
      effectiveStatus: resolveEffectiveStatus(j),
      appCounts: appCountsByJob.get(j.id!) || { total: 0, new: 0, inProgress: 0, interview: 0, offered: 0, hired: 0, rejected: 0 },
    }));
  }, [jobs, brandMap, appCountsByJob]);

  const summary = useMemo(() => ({
    total: enrichedJobs.length,
    published: enrichedJobs.filter(j => j.effectiveStatus === 'published' || j.effectiveStatus === 'reopened').length,
    draft: enrichedJobs.filter(j => j.effectiveStatus === 'draft').length,
    closed: enrichedJobs.filter(j => j.effectiveStatus === 'closed').length,
    expired: enrichedJobs.filter(j => j.effectiveStatus === 'expired').length,
    totalApps: (applications || []).length,
    needsReview: enrichedJobs.filter(j => j.appCounts.new > 0).length,
    needsExtend: enrichedJobs.filter(j => {
      const d = j.applyDeadline || j.applicationDeadline;
      const days = d ? differenceInDays(d.toDate(), new Date()) : null;
      return j.effectiveStatus === 'expired' || (days !== null && days <= 3 && j.appCounts.total < (j.numberOfOpenings || 1));
    }).length,
  }), [enrichedJobs, applications]);

  const filteredJobs = useMemo(() => {
    let result = enrichedJobs;

    // Quick filter
    if (quickFilter === 'needsReview') result = result.filter(j => j.appCounts.new > 0);
    else if (quickFilter === 'needsExtend') {
      result = result.filter(j => {
        const d = j.applyDeadline || j.applicationDeadline;
        const days = d ? differenceInDays(d.toDate(), new Date()) : null;
        return j.effectiveStatus === 'expired' || (days !== null && days <= 3 && j.appCounts.total < (j.numberOfOpenings || 1));
      });
    } else if (quickFilter !== 'all') {
      result = result.filter(j => j.effectiveStatus === quickFilter);
    }

    if (brandFilter !== 'all') result = result.filter(j => j.brandId === brandFilter);
    if (typeFilter !== 'all') result = result.filter(j => j.statusJob === typeFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(j =>
        j.position.toLowerCase().includes(q) ||
        (j.brandName || '').toLowerCase().includes(q) ||
        (j.division || j.divisionName || '').toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
  }, [enrichedJobs, quickFilter, brandFilter, typeFilter, searchTerm]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreate = () => { setSelectedJob(null); setIsFormOpen(true); };
  const handleEdit = (job: Job) => { setSelectedJob(job); setIsFormOpen(true); };
  const handleDelete = (job: Job) => { setSelectedJob(job); setIsDeleteConfirmOpen(true); };
  const handleAssignUsers = (job: Job) => { setSelectedJob(job); setIsAssignUsersOpen(true); };
  const handleExtend = (job: Job) => { setSelectedJob(job); setIsExtendOpen(true); };

  const handleDuplicate = async (job: Job) => {
    if (!userProfile) return;
    try {
      const newId = doc(collection(firestore, 'jobs')).id;
      const shortId = Math.random().toString(36).substring(2, 6);
      const baseSlug = job.baseSlug || job.position.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const posParts = job.position.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
      const brandParts = ((job as any).brandName || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
      const num = Math.floor(Math.random() * 900 + 100);
      const { id: _id, ...rest } = job;
      await setDocumentNonBlocking(doc(firestore, 'jobs', newId), {
        ...rest, slug: `${baseSlug}-${shortId}`, baseSlug,
        jobCode: `${posParts}-${brandParts}-${num}`,
        publishStatus: 'draft',
        position: `${job.position} (Salinan)`,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        createdBy: userProfile.uid, updatedBy: userProfile.uid,
        deadlineExtended: false, extensionHistory: [], originalDeadline: undefined,
      }, { merge: false });
      toast({ title: 'Lowongan Diduplikat', description: 'Draft baru telah dibuat.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: e.message });
    }
  };

  const handleStatusChange = async (job: Job, status: Job['publishStatus']) => {
    if (!job.id || !userProfile) return;
    try {
      await updateDocumentNonBlocking(doc(firestore, 'jobs', job.id), {
        publishStatus: status, updatedAt: serverTimestamp(), updatedBy: userProfile.uid,
      });
      toast({ title: 'Status Diperbarui', description: `"${job.position}" → ${STATUS_CONFIG[status]?.label || status}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: e.message });
    }
  };

  const handleExtendDeadline = async (newDeadline: Date, reason: string) => {
    if (!selectedJob?.id || !userProfile) return;
    const oldDeadline = selectedJob.applyDeadline || selectedJob.applicationDeadline;
    const newTs = Timestamp.fromDate(newDeadline);
    await updateDocumentNonBlocking(doc(firestore, 'jobs', selectedJob.id), {
      applyDeadline: newTs, applicationDeadline: newTs, deadlineExtended: true,
      originalDeadline: selectedJob.originalDeadline || oldDeadline || null,
      extensionHistory: arrayUnion({
        oldDeadline: oldDeadline || null, newDeadline: newTs, reason,
        extendedBy: userProfile.uid, extendedAt: Timestamp.now(),
      }),
      publishStatus: selectedJob.publishStatus === 'closed' ? 'reopened' : selectedJob.publishStatus,
      updatedAt: serverTimestamp(), updatedBy: userProfile.uid,
    });
    toast({ title: 'Deadline Diperpanjang', description: format(newDeadline, 'dd MMM yyyy', { locale: idLocale }) });
  };

  const confirmDelete = async () => {
    if (!selectedJob?.id) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'jobs', selectedJob.id));
      toast({ title: 'Lowongan Dihapus', description: `"${selectedJob.position}" telah dihapus.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: e.message });
    } finally { setIsDeleteConfirmOpen(false); setSelectedJob(null); }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Total" value={summary.total} icon={Briefcase}
          color="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" />
        <KpiCard label="Published" value={summary.published} icon={CheckCircle2}
          color="border-green-200 dark:border-green-900 text-green-700 dark:text-green-400" />
        <KpiCard label="Draft" value={summary.draft} icon={EyeOff}
          color="border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" />
        <KpiCard label="Closed" value={summary.closed} icon={XCircle}
          color="border-red-200 dark:border-red-900 text-red-600 dark:text-red-400" />
        <KpiCard label="Expired" value={summary.expired} icon={Clock}
          color="border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400" />
        <KpiCard label="Total Pelamar" value={summary.totalApps} icon={Users}
          color="border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400" />
        <KpiCard label="Butuh Review" value={summary.needsReview} icon={AlertTriangle}
          color="border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400" />
        <KpiCard label="Perlu Perpanjang" value={summary.needsExtend} icon={CalendarClock}
          color="border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400" />
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        {/* Quick filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map(f => {
            const count = f.key === 'all' ? summary.total
              : f.key === 'published' ? summary.published
              : f.key === 'draft' ? summary.draft
              : f.key === 'expired' ? summary.expired
              : f.key === 'closed' ? summary.closed
              : f.key === 'needsReview' ? summary.needsReview
              : summary.needsExtend;

            return (
              <button
                key={f.key}
                onClick={() => setQuickFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  quickFilter === f.key
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-400'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${quickFilter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + dropdowns + create */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <input
              placeholder="Cari posisi, brand..."
              className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="h-9 w-44 rounded-xl border-slate-200 dark:border-slate-700 text-sm">
              <SelectValue placeholder="Semua Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Brand</SelectItem>
              {brands?.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-36 rounded-xl border-slate-200 dark:border-slate-700 text-sm">
              <SelectValue placeholder="Semua Tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="fulltime">Full-time</SelectItem>
              <SelectItem value="internship">Internship</SelectItem>
              <SelectItem value="contract">Kontrak</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Button onClick={handleCreate} className="h-9 gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm px-4">
              <PlusCircle className="h-4 w-4" /> Buat Lowongan
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
              {['Posisi', 'Brand / Divisi', 'Tipe', 'Pelamar', 'Status', 'Deadline', 'Tim', 'Aksi'].map(h => (
                <th key={h} className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length > 0 ? filteredJobs.map(job => (
              <JobRow
                key={job.id}
                job={job}
                userProfileMap={userProfileMap}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAssign={handleAssignUsers}
                onExtend={handleExtend}
                onDuplicate={handleDuplicate}
                onStatusChange={handleStatusChange}
                isSuperAdmin={isSuperAdmin}
              />
            )) : (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
                    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-5">
                      <Briefcase className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Tidak ada lowongan ditemukan</p>
                    <p className="text-sm text-slate-400 text-center">Coba ubah filter atau buat lowongan baru untuk memulai rekrutmen.</p>
                    <Button onClick={handleCreate} size="sm" className="mt-1 gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
                      <PlusCircle className="h-4 w-4" /> Buat Lowongan
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filteredJobs.length > 0 ? filteredJobs.map(job => (
          <JobMobileCard
            key={job.id}
            job={job}
            onEdit={handleEdit}
            onExtend={handleExtend}
            onStatusChange={handleStatusChange}
          />
        )) : (
          <div className="flex flex-col items-center gap-3 py-12 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <Briefcase className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="font-semibold text-slate-600 dark:text-slate-400">Tidak ada lowongan ditemukan</p>
            <Button onClick={handleCreate} size="sm" className="gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
              <PlusCircle className="h-4 w-4" /> Buat Lowongan
            </Button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <JobFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} job={selectedJob} brands={brands || []} />
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete} itemName={selectedJob?.position} itemType="Lowongan"
      />
      {userProfile && (
        <AssignedUsersDialog
          open={isAssignUsersOpen} onOpenChange={setIsAssignUsersOpen}
          job={selectedJob} allUsers={assignableUsers} allBrands={brands || []}
          currentUser={userProfile} onSuccess={mutateJobs}
        />
      )}
      <ExtendDeadlineDialog
        job={selectedJob} open={isExtendOpen}
        onOpenChange={setIsExtendOpen} onSave={handleExtendDeadline}
      />
    </div>
  );
}
