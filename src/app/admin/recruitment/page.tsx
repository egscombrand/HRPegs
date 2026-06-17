'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { Job, JobApplication, Brand, UserProfile, Notification } from '@/lib/types';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Eye, Users, Briefcase, CheckCircle2, XCircle, Clock, AlertTriangle,
  CalendarClock, ChevronDown, Edit, Copy, RefreshCw, EyeOff, Building2,
  Tag, TrendingUp, UserCheck, Search, X, SlidersHorizontal, Inbox,
} from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn, getInitials } from '@/lib/utils';
import { updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

// ─── Status helpers ───────────────────────────────────────────────────────────

function resolveEffectiveStatus(job: Job): Job['publishStatus'] {
  if (job.publishStatus === 'published' || job.publishStatus === 'reopened') {
    const deadline = job.applyDeadline || job.applicationDeadline;
    if (deadline && isPast(deadline.toDate())) return 'expired';
  }
  return job.publishStatus;
}

const STATUS_CFG: Record<string, { label: string; dot: string; pill: string }> = {
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
  deleted: {
    label: 'Deleted',
    dot: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-500 dark:ring-slate-700',
  },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 px-4 py-4 shadow-sm ${color}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums leading-none">{value}</p>
          {sub && <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{sub}</p>}
        </div>
        <div className="rounded-xl p-2 shrink-0">
          <Icon className="h-5 w-5 opacity-70" />
        </div>
      </div>
    </div>
  );
}

// ─── Deadline cell ────────────────────────────────────────────────────────────

function DeadlineCell({ job }: { job: Job }) {
  const deadline = job.applyDeadline || job.applicationDeadline;
  if (!deadline) return <span className="text-slate-400 text-xs italic">—</span>;
  const date = deadline.toDate();
  const expired = isPast(date);
  const today = isToday(date);
  const daysLeft = differenceInDays(date, new Date());
  return (
    <div className="space-y-1">
      <p className={`text-xs font-medium ${expired ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {format(date, 'dd MMM yyyy', { locale: idLocale })}
      </p>
      {expired ? (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
          <Clock className="h-2.5 w-2.5" /> Expired
        </span>
      ) : today ? (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-red-100 text-red-700">Hari ini!</span>
      ) : daysLeft <= 7 ? (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <AlertTriangle className="h-2.5 w-2.5" /> {daysLeft}h lagi
        </span>
      ) : (
        <span className="text-[9px] text-slate-400">{daysLeft}h lagi</span>
      )}
    </div>
  );
}

// ─── Assigned avatars ─────────────────────────────────────────────────────────

function AssignedAvatars({ uids, userMap }: { uids: string[]; userMap: Map<string, UserProfile> }) {
  const users = uids.map(u => userMap.get(u)).filter((u): u is UserProfile => !!u);
  if (!users.length) return <span className="text-[11px] text-slate-400 italic">—</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex -space-x-2 cursor-default">
            {users.slice(0, 3).map(u => (
              <Avatar key={u.uid} className="h-6 w-6 border-2 border-white dark:border-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
                <AvatarFallback className="text-[8px] bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold">
                  {getInitials(u.fullName)}
                </AvatarFallback>
              </Avatar>
            ))}
            {users.length > 3 && (
              <Avatar className="h-6 w-6 border-2 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800">
                <AvatarFallback className="text-[8px] text-slate-500">+{users.length - 3}</AvatarFallback>
              </Avatar>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">{users.map(u => u.fullName).join(', ')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Job row ─────────────────────────────────────────────────────────────────

function JobRow({ job, userMap, onStatusChange, isSuperAdmin }: {
  job: any;
  userMap: Map<string, UserProfile>;
  onStatusChange: (j: Job, s: Job['publishStatus']) => void;
  isSuperAdmin: boolean;
}) {
  const needsReview = job.counts.new > 0;
  const deadline = job.applyDeadline || job.applicationDeadline;
  const daysLeft = deadline ? differenceInDays(deadline.toDate(), new Date()) : null;
  const needsExtension = job.effectiveStatus === 'expired' || (daysLeft !== null && daysLeft <= 3 && job.counts.total < (job.numberOfOpenings || 1));
  const isClosed = job.effectiveStatus === 'closed' || job.effectiveStatus === 'archived';
  const divisionLabel = job.divisionName || job.division || null;

  return (
    <tr className={cn(
      'group border-b border-slate-100 dark:border-slate-800 transition-colors',
      isClosed
        ? 'opacity-60 hover:opacity-80 bg-slate-50/50 dark:bg-slate-900/50'
        : needsReview
        ? 'hover:bg-amber-50/40 dark:hover:bg-amber-950/10 bg-amber-50/20 dark:bg-amber-950/5'
        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
    )}>
      {/* Posisi */}
      <td className="px-4 py-3.5 align-top">
        <div className="space-y-1 max-w-[200px]">
          <p className="font-semibold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2">{job.position}</p>
          {job.jobCode && <p className="text-[10px] font-mono text-slate-400">{job.jobCode}</p>}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {needsReview && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                Butuh Review
              </span>
            )}
            {needsExtension && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 ring-1 ring-orange-200 dark:ring-orange-800">
                Perlu Perpanjang
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Brand / Divisi */}
      <td className="px-4 py-3.5 align-top">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{job.brandName}</p>
          </div>
          {divisionLabel ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-700">
              <Tag className="h-2.5 w-2.5" /> {divisionLabel}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Level Brand</span>
          )}
        </div>
      </td>

      {/* Tipe */}
      <td className="px-4 py-3.5 align-top">
        <span className="inline-block text-[11px] font-semibold capitalize rounded-md px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {job.statusJob === 'fulltime' ? 'Full-time' : 'Internship'}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 align-top">
        <StatusPill status={job.effectiveStatus} />
      </td>

      {/* Pelamar */}
      <td className="px-4 py-3.5 align-top">
        {job.counts.total > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xl font-bold text-slate-800 dark:text-white leading-none">{job.counts.total}</p>
            <div className="flex flex-wrap gap-1">
              {job.counts.new > 0 && (
                <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 rounded-full px-1.5 py-0.5 ring-1 ring-blue-200 dark:ring-blue-800">
                  Baru: {job.counts.new}
                </span>
              )}
              {job.counts.interview > 0 && (
                <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 rounded-full px-1.5 py-0.5 ring-1 ring-purple-200 dark:ring-purple-800">
                  Interview: {job.counts.interview}
                </span>
              )}
              {job.counts.hired > 0 && (
                <span className="text-[9px] font-bold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/60 rounded-full px-1.5 py-0.5 ring-1 ring-green-200 dark:ring-green-800">
                  Diterima: {job.counts.hired}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">Belum ada</span>
        )}
      </td>

      {/* Deadline */}
      <td className="px-4 py-3.5 align-top">
        <DeadlineCell job={job} />
      </td>

      {/* Update terakhir */}
      <td className="px-4 py-3.5 align-top">
        {job.updatedAt?.toDate ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {format(job.updatedAt.toDate(), 'dd MMM yy', { locale: idLocale })}
          </p>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>

      {/* Assigned */}
      <td className="px-4 py-3.5 align-top">
        <AssignedAvatars uids={job.assignedUserIds || []} userMap={userMap} />
      </td>

      {/* Aksi */}
      <td className="px-3 py-3.5 align-top text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs font-medium border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:text-teal-700 dark:hover:border-teal-600 dark:hover:text-teal-300 transition-colors">
              Aksi <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border-slate-200 dark:border-slate-700">
            <DropdownMenuItem asChild>
              <Link href={`/admin/recruitment/jobs/${job.id}`} className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-slate-500" /> Lihat Pelamar
              </Link>
            </DropdownMenuItem>
            {job.counts.new > 0 && (
              <DropdownMenuItem asChild>
                <Link href={`/admin/recruitment/jobs/${job.id}?filter=new`} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Review Pelamar Baru ({job.counts.new})
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/admin/hrd/job-postings?edit=${job.id}`} className="flex items-center gap-2 text-sm">
                <Edit className="h-4 w-4 text-slate-500" /> Edit Lowongan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(job.effectiveStatus === 'expired' || job.effectiveStatus === 'closed') && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'reopened')} className="gap-2 text-sm">
                <RefreshCw className="h-4 w-4 text-teal-600" /> Buka Lagi
              </DropdownMenuItem>
            )}
            {(job.effectiveStatus === 'draft' || job.effectiveStatus === 'expired') && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'published')} className="gap-2 text-sm">
                <Eye className="h-4 w-4 text-green-600" /> Publish
              </DropdownMenuItem>
            )}
            {(job.publishStatus === 'published' || job.publishStatus === 'reopened') && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'draft')} className="gap-2 text-sm">
                <EyeOff className="h-4 w-4 text-slate-500" /> Jadikan Draft
              </DropdownMenuItem>
            )}
            {job.publishStatus !== 'closed' && (
              <DropdownMenuItem onSelect={() => onStatusChange(job, 'closed')} className="gap-2 text-sm text-red-600 dark:text-red-400">
                <XCircle className="h-4 w-4" /> Tutup Lowongan
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ─── Quick filter chips ───────────────────────────────────────────────────────

const QUICK_FILTERS = [
  { key: 'all',         label: 'Semua' },
  { key: 'active',      label: 'Aktif' },
  { key: 'draft',       label: 'Draft' },
  { key: 'expired',     label: 'Expired' },
  { key: 'closed',      label: 'Closed' },
  { key: 'archived',    label: 'Archived' },
  { key: 'needsReview', label: 'Butuh Review' },
] as const;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RecruitmentJobSelectionPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin', 'manager']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [quickFilter, setQuickFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'updated' | 'applicants' | 'deadline'>('updated');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const jobsQuery = useMemoFirebase(() => collection(firestore, 'jobs'), [firestore]);
  const { data: jobs, isLoading: isLoadingJobs, error: jobsError } = useCollection<Job>(jobsQuery);

  const appsQuery = useMemoFirebase(() => collection(firestore, 'applications'), [firestore]);
  const { data: applications, isLoading: isLoadingApps, error: appsError } = useCollection<JobApplication>(appsQuery);

  const brandsQuery = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: isLoadingBrands, error: brandsError } = useCollection<Brand>(brandsQuery);

  const usersQuery = useMemoFirebase(() =>
    query(collection(firestore, 'users'), where('isActive', '==', true)),
    [firestore]
  );
  const { data: users } = useCollection<UserProfile>(usersQuery);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  // Unread recruitment notifications (new_application + personality_test_completed)
  const recruitmentNotifsQuery = useMemoFirebase(() => {
    if (!userProfile?.role || !['hrd', 'super-admin'].includes(userProfile.role)) return null;
    return query(
      collection(firestore, 'hrd_notifications'),
      where('notificationType', '==', 'recruitment'),
      where('isRead', '==', false),
    );
  }, [userProfile?.role, firestore]);
  const { data: unreadRecruitmentNotifs } = useCollection<Notification>(recruitmentNotifsQuery);

  const newApplicationCount = useMemo(
    () => (unreadRecruitmentNotifs || []).filter(n => n.recruitmentEvent === 'new_application').length,
    [unreadRecruitmentNotifs],
  );
  const testCompletedCount = useMemo(
    () => (unreadRecruitmentNotifs || []).filter(n => n.recruitmentEvent === 'personality_test_completed').length,
    [unreadRecruitmentNotifs],
  );

  const isSuperAdmin = userProfile?.role === 'super-admin';
  const isLoading = isLoadingJobs || isLoadingApps || isLoadingBrands;
  const error = jobsError || appsError || brandsError;

  const userMap = useMemo(() => new Map((users || []).map(u => [u.uid, u])), [users]);

  // App counts per job
  const appCountsByJob = useMemo(() => {
    const counts = new Map<string, { total: number; new: number; interview: number; hired: number; rejected: number }>();
    (applications || []).forEach((app: any) => {
      const jobId = app.jobId;
      if (!jobId) return;
      const prev = counts.get(jobId) || { total: 0, new: 0, interview: 0, hired: 0, rejected: 0 };
      prev.total++;
      const s = app.status || app.stage || '';
      if (s === 'submitted' || s === 'draft' || s === 'verification' || s === 'tes_kepribadian') prev.new++;
      else if (s === 'interview') prev.interview++;
      else if (s === 'hired') prev.hired++;
      else if (s === 'rejected') prev.rejected++;
      counts.set(jobId, prev);
    });
    return counts;
  }, [applications]);

  // Enriched + sorted+filtered jobs
  const enrichedJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.map(j => ({
      ...j,
      effectiveStatus: resolveEffectiveStatus(j),
      counts: appCountsByJob.get(j.id!) || { total: 0, new: 0, interview: 0, hired: 0, rejected: 0 },
    }));
  }, [jobs, appCountsByJob]);

  const summary = useMemo(() => ({
    total: enrichedJobs.filter(j => !j.isDeleted).length,
    published: enrichedJobs.filter(j => (j.effectiveStatus === 'published' || j.effectiveStatus === 'reopened') && !j.isDeleted).length,
    closed: enrichedJobs.filter(j => j.effectiveStatus === 'closed' && !j.isDeleted).length,
    expired: enrichedJobs.filter(j => j.effectiveStatus === 'expired' && !j.isDeleted).length,
    totalApps: (applications || []).length,
    newApps: enrichedJobs.filter(j => !j.isDeleted).reduce((s, j) => s + j.counts.new, 0),
    needsReview: enrichedJobs.filter(j => j.counts.new > 0 && !j.isDeleted).length,
  }), [enrichedJobs, applications]);

  const filteredJobs = useMemo(() => {
    let result = enrichedJobs.filter(j => !j.isDeleted);

    // Quick filter
    if (quickFilter === 'active') result = result.filter(j => j.effectiveStatus === 'published' || j.effectiveStatus === 'reopened');
    else if (quickFilter === 'archived') result = result.filter(j => j.publishStatus === 'archived');
    else if (quickFilter === 'needsReview') result = result.filter(j => j.counts.new > 0);
    else if (quickFilter !== 'all') result = result.filter(j => j.effectiveStatus === quickFilter);

    if (brandFilter !== 'all') result = result.filter(j => j.brandId === brandFilter);
    if (typeFilter !== 'all') result = result.filter(j => j.statusJob === typeFilter);
    if (statusFilter !== 'all') result = result.filter(j => j.effectiveStatus === statusFilter);

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(j =>
        j.position.toLowerCase().includes(q) ||
        (j.brandName || '').toLowerCase().includes(q) ||
        (j.division || j.divisionName || '').toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'applicants') return b.counts.total - a.counts.total;
      if (sortBy === 'deadline') {
        const dA = (a.applyDeadline || a.applicationDeadline)?.toMillis() ?? Infinity;
        const dB = (b.applyDeadline || b.applicationDeadline)?.toMillis() ?? Infinity;
        return dA - dB;
      }
      return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0);
    });
  }, [enrichedJobs, quickFilter, brandFilter, typeFilter, statusFilter, searchTerm, sortBy]);

  const handleStatusChange = async (job: Job, status: Job['publishStatus']) => {
    if (!job.id || !userProfile) return;
    try {
      await updateDocumentNonBlocking(doc(firestore, 'jobs', job.id), {
        publishStatus: status, updatedAt: serverTimestamp(), updatedBy: userProfile.uid,
      });
      toast({ title: 'Status Diperbarui', description: `"${job.position}" → ${STATUS_CFG[status]?.label || status}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: e.message });
    }
  };

  const hasFilter = searchTerm || brandFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all';

  // ── Loading ───────────────────────────────────────────────────────────────

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Manajemen Lamaran" menuConfig={menuConfig}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout pageTitle="Manajemen Lamaran" menuConfig={menuConfig}>
        <Alert variant="destructive">
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout pageTitle="Manajemen Lamaran" menuConfig={menuConfig}>
      <div className="space-y-6">

        {/* ── KPI strip ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="Total Lowongan" value={summary.total} icon={Briefcase}
            color="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" />
          <KpiCard label="Aktif" value={summary.published} icon={CheckCircle2}
            color="border-green-200 dark:border-green-900 text-green-700 dark:text-green-400" />
          <KpiCard label="Expired" value={summary.expired} icon={Clock}
            color="border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400" />
          <KpiCard label="Closed" value={summary.closed} icon={XCircle}
            color="border-red-200 dark:border-red-900 text-red-600 dark:text-red-400" />
          <KpiCard label="Total Pelamar" value={summary.totalApps} icon={Users}
            color="border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400" />
          <KpiCard label="Pelamar Baru" value={summary.newApps} icon={TrendingUp}
            color="border-teal-200 dark:border-teal-900 text-teal-700 dark:text-teal-400" />
          <KpiCard label="Perlu Review" value={summary.needsReview} icon={AlertTriangle}
            color="border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400"
            sub="lowongan" />
        </div>

        {/* ── Recruitment notification alert ───────────────────── */}
        {(newApplicationCount > 0 || testCompletedCount > 0) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 px-4 py-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/50">
                <Inbox className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
                  {newApplicationCount > 0 && testCompletedCount > 0
                    ? `${newApplicationCount} lamaran baru · ${testCompletedCount} tes selesai menunggu review`
                    : newApplicationCount > 0
                      ? `${newApplicationCount} lamaran baru menunggu review`
                      : `${testCompletedCount} kandidat menyelesaikan tes kepribadian`}
                </p>
                <p className="text-xs text-teal-700/80 dark:text-teal-400 mt-0.5">
                  Segera tinjau untuk melanjutkan proses seleksi.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40"
              onClick={() => {
                setQuickFilter('needs_review');
                setStatusFilter('all');
              }}
            >
              Lihat Lamaran Baru
            </Button>
          </div>
        )}

        {/* ── Toolbar ──────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Quick filter chips */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_FILTERS.map(f => {
              const count = f.key === 'all' ? summary.total
                : f.key === 'active' ? summary.published
                : f.key === 'draft' ? enrichedJobs.filter(j => j.effectiveStatus === 'draft').length
                : f.key === 'expired' ? summary.expired
                : f.key === 'closed' ? summary.closed
                : f.key === 'archived' ? enrichedJobs.filter(j => j.publishStatus === 'archived').length
                : summary.needsReview;
              return (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                    quickFilter === f.key
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-400'
                  )}
                >
                  {f.label}
                  <span className={cn(
                    'rounded-full px-1.5 py-0 text-[10px] font-bold',
                    quickFilter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  )}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search + advanced filters + sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <input
                placeholder="Cari posisi, brand, divisi..."
                className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Toggle advanced */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 rounded-xl px-3 text-xs font-semibold border transition-all',
                showFilters
                  ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
            </button>

            {/* Sort */}
            <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
              <SelectTrigger className="h-9 w-48 rounded-xl border-slate-200 dark:border-slate-700 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Terbaru Diupdate</SelectItem>
                <SelectItem value="applicants">Pelamar Terbanyak</SelectItem>
                <SelectItem value="deadline">Deadline Terdekat</SelectItem>
              </SelectContent>
            </Select>

            {/* Result count */}
            <span className="ml-auto text-xs text-slate-400">
              {filteredJobs.length} lowongan
              {hasFilter && (
                <button onClick={() => { setBrandFilter('all'); setTypeFilter('all'); setStatusFilter('all'); setSearchTerm(''); }}
                  className="ml-2 inline-flex items-center gap-0.5 text-red-500 hover:text-red-700">
                  <X className="h-3 w-3" /> Hapus filter
                </button>
              )}
            </span>
          </div>

          {/* Advanced filter row */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-3">
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-9 w-44 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                  <SelectValue placeholder="Semua Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Brand</SelectItem>
                  {brands?.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-36 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                  <SelectValue placeholder="Semua Tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tipe</SelectItem>
                  <SelectItem value="fulltime">Full-time</SelectItem>
                  <SelectItem value="internship">Internship</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-40 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="reopened">Reopened</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                  {['Posisi', 'Brand / Divisi', 'Tipe', 'Status', 'Pelamar', 'Deadline', 'Update', 'Assigned', 'Aksi'].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">
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
                    userMap={userMap}
                    onStatusChange={handleStatusChange}
                    isSuperAdmin={isSuperAdmin}
                  />
                )) : (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
                        <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-5">
                          <Briefcase className="h-10 w-10 text-slate-400" />
                        </div>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">Tidak ada lowongan ditemukan</p>
                        <p className="text-sm text-slate-400 text-center">
                          {hasFilter ? 'Coba ubah filter untuk melihat lowongan lainnya.' : 'Buat lowongan baru di menu Job Postings.'}
                        </p>
                        {hasFilter && (
                          <Button variant="outline" size="sm" className="rounded-xl"
                            onClick={() => { setBrandFilter('all'); setTypeFilter('all'); setStatusFilter('all'); setSearchTerm(''); setQuickFilter('all'); }}>
                            <X className="h-3.5 w-3.5 mr-1" /> Hapus Semua Filter
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
