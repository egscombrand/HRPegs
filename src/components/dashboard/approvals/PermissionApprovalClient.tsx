'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { PermissionRequest, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Search,
  Paperclip,
  FileText,
  SortAsc,
  SortDesc,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  format,
  formatDistanceToNow,
  startOfMonth,
  differenceInCalendarDays,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { isFinalStatus } from '@/lib/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { PermissionStatusBadge } from '@/components/dashboard/karyawan/PermissionStatusBadge';
import { ReviewPermissionDialog } from './ReviewPermissionDialog';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ManagerTab = 'action_needed' | 'approved_by_me' | 'rejected_by_me' | 'revision_by_me' | 'all';

// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<string, string> = {
  tidak_masuk: 'Tidak Masuk Kerja',
  datang_terlambat: 'Datang Terlambat',
  pulang_awal: 'Pulang Lebih Awal',
  keluar_kantor: 'Meninggalkan Kantor',
  sakit: 'Izin Sakit',
  duka: 'Izin Duka Cita',
  akademik: 'Izin Akademik',
  administrasi_resmi: 'Administrasi Resmi',
  lainnya: 'Izin Lainnya',
};

const REASON_LABELS: Record<string, string> = {
  sakit: 'Sakit',
  duka: 'Duka Cita',
  urusan_keluarga: 'Urusan Keluarga',
  administrasi_resmi: 'Administrasi Resmi',
  akademik: 'Akademik',
  transportasi: 'Transportasi',
  keperluan_pribadi: 'Keperluan Pribadi',
  lainnya: 'Lainnya',
};

const FORM_TYPE_OPTIONS = [
  { value: 'all', label: 'Semua Bentuk' },
  { value: 'tidak_masuk', label: 'Tidak Masuk Kerja' },
  { value: 'datang_terlambat', label: 'Datang Terlambat' },
  { value: 'pulang_awal', label: 'Pulang Lebih Awal' },
  { value: 'keluar_kantor', label: 'Meninggalkan Kantor' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}

function resolveDate(t: any): Date | null {
  if (!t) return null;
  if (typeof t.toDate === 'function') return t.toDate();
  if (t.seconds) return new Date(t.seconds * 1000);
  return null;
}

function formatDuration(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  if (formType === 'keluar_kantor') {
    const mins = s.totalDurationMinutes || 0;
    if (mins < 60) return `${mins} menit`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
  }
  const startDt = resolveDate(s.startDate);
  const endDt = resolveDate(s.endDate);
  if (!startDt || !endDt) return '—';
  const days = differenceInCalendarDays(endDt, startDt) + 1;
  return days === 1 ? '1 hari' : `${days} hari`;
}

function getFormLabel(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  return FORM_TYPE_LABELS[formType] || formType?.replace(/_/g, ' ') || '—';
}

function getReasonLabel(s: PermissionRequest): string | null {
  if (!s.reasonType) return null;
  return REASON_LABELS[s.reasonType] || s.reasonType.replace(/_/g, ' ');
}

// ── Tab classification ────────────────────────────────────────────────────────

function isActionNeeded(s: PermissionRequest, uid: string): boolean {
  const isOfficeExit = s.formType === 'keluar_kantor' || s.type === 'keluar_kantor';
  if (s.status === 'pending_manager' && s.waitingForUid === uid) return true;
  if (isOfficeExit && (s.status === 'reported' || s.status === 'returned') && s.managerUid === uid) return true;
  return false;
}

function isApprovedByMe(s: PermissionRequest, uid: string): boolean {
  return (
    s.managerUid === uid &&
    ['approved_by_manager', 'pending_hrd', 'revision_hrd', 'approved', 'closed', 'verified_manager'].includes(s.status)
  );
}

function isRejectedByMe(s: PermissionRequest, uid: string): boolean {
  return s.managerUid === uid && s.status === 'rejected_manager';
}

function isRevisionByMe(s: PermissionRequest, uid: string): boolean {
  return s.managerUid === uid && s.status === 'revision_manager';
}

// ── "Menunggu" column data ─────────────────────────────────────────────────────

interface WaitingInfo {
  text: string;
  icon: 'clock' | 'check' | 'x' | 'warning' | 'none';
  colorClass: string;
}

function getWaitingInfo(s: PermissionRequest, uid: string): WaitingInfo {
  switch (s.status) {
    case 'pending_manager':
      if (s.waitingForUid === uid)
        return { text: 'Menunggu Anda', icon: 'clock', colorClass: 'text-amber-600 dark:text-amber-400' };
      return { text: `Menunggu ${s.waitingForName || 'atasan'}`, icon: 'clock', colorClass: 'text-amber-600 dark:text-amber-400' };
    case 'revision_manager':
      return { text: 'Menunggu revisi staff', icon: 'warning', colorClass: 'text-orange-600 dark:text-orange-400' };
    case 'approved_by_manager':
    case 'pending_hrd':
    case 'revision_hrd':
      return { text: 'Menunggu HRD', icon: 'clock', colorClass: 'text-blue-600 dark:text-blue-400' };
    case 'rejected_manager':
    case 'rejected_hrd':
      return { text: 'Ditolak', icon: 'x', colorClass: 'text-red-600 dark:text-red-400' };
    case 'approved':
    case 'closed':
    case 'verified_manager':
      return { text: 'Selesai', icon: 'check', colorClass: 'text-green-600 dark:text-green-400' };
    case 'reported':
      return { text: 'Laporan keluar diterima', icon: 'clock', colorClass: 'text-indigo-600 dark:text-indigo-400' };
    case 'returned':
      if (s.managerUid === uid)
        return { text: 'Menunggu Anda verifikasi', icon: 'clock', colorClass: 'text-amber-600 dark:text-amber-400' };
      return { text: 'Sudah kembali', icon: 'check', colorClass: 'text-green-600 dark:text-green-400' };
    default:
      return { text: '—', icon: 'none', colorClass: 'text-muted-foreground' };
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface PermissionApprovalClientProps {
  mode: 'manager' | 'hrd';
}

export function PermissionApprovalClient({ mode }: PermissionApprovalClientProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  // Tab state (manager only)
  const [activeTab, setActiveTab] = useState<ManagerTab>('action_needed');

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFormType, setFilterFormType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');

  const [selectedSubmission, setSelectedSubmission] = useState<PermissionRequest | null>(null);

  // ── Queries (3 for manager + 1 for HRD) ──────────────────────────────────

  const byManagerUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || mode !== 'manager') return null;
    return query(collection(firestore, 'permission_requests'), where('managerUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore, mode]);

  const byWaitingForUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || mode !== 'manager') return null;
    return query(collection(firestore, 'permission_requests'), where('waitingForUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore, mode]);

  const hasLegacyScope = !!(
    mode === 'manager' && userProfile?.managedDivision?.trim() && userProfile?.managedBrandId
  );
  const legacyDivBrandQuery = useMemoFirebase(() => {
    if (!hasLegacyScope || !userProfile) return null;
    return query(
      collection(firestore, 'permission_requests'),
      where('division', '==', userProfile.managedDivision),
      where('brandId', '==', userProfile.managedBrandId),
    );
  }, [hasLegacyScope, userProfile?.managedDivision, userProfile?.managedBrandId, firestore]);

  const hrdQuery = useMemoFirebase(() => {
    if (mode !== 'hrd') return null;
    return query(collection(firestore, 'permission_requests'));
  }, [firestore, mode]);

  const { data: byManagerUid, isLoading: l1, mutate: m1 } = useCollection<PermissionRequest>(byManagerUidQuery);
  const { data: byWaitingFor, isLoading: l2, mutate: m2 } = useCollection<PermissionRequest>(byWaitingForUidQuery);
  const { data: byDivBrand, mutate: m3 } = useCollection<PermissionRequest>(legacyDivBrandQuery);
  const { data: hrdData, isLoading: l4, mutate: m4 } = useCollection<PermissionRequest>(hrdQuery);

  const submissions = useMemo(() => {
    if (mode === 'hrd') return hrdData || [];
    const combined = [
      ...(byManagerUid || []),
      ...(byWaitingFor || []),
      ...(byDivBrand || []),
    ];
    const seen = new Set<string>();
    return combined.filter(s => {
      if (!s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [mode, hrdData, byManagerUid, byWaitingFor, byDivBrand]);

  const isLoading = mode === 'manager' ? l1 && l2 : l4;
  const mutate = () => { m1(); m2(); m3(); m4(); };

  // ── Supporting data ───────────────────────────────────────────────────────

  const { data: brandsList } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore]),
  );

  const availableDivisions = useMemo(() => {
    const divs = new Set<string>();
    submissions.forEach(s => { if (s.division) divs.add(s.division); });
    return Array.from(divs).sort();
  }, [submissions]);

  // ── Tab counts (manager only) ─────────────────────────────────────────────

  const uid = userProfile?.uid || '';

  const tabCounts = useMemo(() => {
    if (mode !== 'manager') return { action_needed: 0, approved_by_me: 0, rejected_by_me: 0, revision_by_me: 0 };
    return {
      action_needed: submissions.filter(s => isActionNeeded(s, uid)).length,
      approved_by_me: submissions.filter(s => isApprovedByMe(s, uid)).length,
      rejected_by_me: submissions.filter(s => isRejectedByMe(s, uid)).length,
      revision_by_me: submissions.filter(s => isRevisionByMe(s, uid)).length,
    };
  }, [submissions, uid, mode]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const monthStart = startOfMonth(new Date());

    if (mode === 'manager') {
      const actionNeeded = submissions.filter(s => isActionNeeded(s, uid)).length;
      const waitingHrd = submissions.filter(
        s => s.managerUid === uid && (s.status === 'approved_by_manager' || s.status === 'pending_hrd'),
      ).length;
      const approvedMonth = submissions.filter(s => {
        if (s.managerUid !== uid) return false;
        if (!['approved_by_manager', 'verified_manager', 'approved', 'closed'].includes(s.status)) return false;
        const d = resolveDate(s.managerDecisionAt);
        return d && d >= monthStart;
      }).length;
      const rejectedMonth = submissions.filter(s => {
        if (s.managerUid !== uid || s.status !== 'rejected_manager') return false;
        const d = resolveDate(s.managerDecisionAt);
        return d && d >= monthStart;
      }).length;
      const revision = submissions.filter(s => isRevisionByMe(s, uid)).length;
      return { actionNeeded, waitingHrd, approvedMonth, rejectedMonth, revision };
    } else {
      const actionNeeded = submissions.filter(
        s => s.status === 'pending_hrd' || s.status === 'approved_by_manager' || s.status === 'verified_manager',
      ).length;
      const approvedMonth = submissions.filter(s => {
        if (!['approved', 'closed'].includes(s.status)) return false;
        const d = resolveDate(s.hrdDecisionAt);
        return d && d >= monthStart;
      }).length;
      const rejectedMonth = submissions.filter(s => {
        if (s.status !== 'rejected_hrd') return false;
        const d = resolveDate(s.hrdDecisionAt);
        return d && d >= monthStart;
      }).length;
      const revision = submissions.filter(s => s.status === 'revision_hrd').length;
      return { actionNeeded, waitingHrd: 0, approvedMonth, rejectedMonth, revision };
    }
  }, [submissions, mode, uid]);

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const hasActiveFilters = Boolean(
    searchTerm || filterFormType !== 'all' || filterDateFrom || filterDateTo || sortOrder !== 'newest' ||
    (mode === 'hrd' && (brandFilter !== 'all' || divisionFilter !== 'all')),
  );

  const filteredSubmissions = useMemo(() => {
    let items = submissions.filter(s => {
      // ── Tab filter (manager) ──
      if (mode === 'manager') {
        switch (activeTab) {
          case 'action_needed':
            if (!isActionNeeded(s, uid)) return false;
            break;
          case 'approved_by_me':
            if (!isApprovedByMe(s, uid)) return false;
            break;
          case 'rejected_by_me':
            if (!isRejectedByMe(s, uid)) return false;
            break;
          case 'revision_by_me':
            if (!isRevisionByMe(s, uid)) return false;
            break;
          case 'all':
            break;
        }
      }

      // ── HRD status filter ──
      if (mode === 'hrd') {
        const hrdPending = s.status === 'pending_hrd' || s.status === 'approved_by_manager' || s.status === 'verified_manager' || s.status === 'revision_hrd';
        // Default "all" view for HRD — no filter applied
      }

      // ── Form type filter ──
      if (filterFormType !== 'all') {
        const formType = s.formType || s.type;
        if (formType !== filterFormType) return false;
      }

      // ── Brand + Division (HRD) ──
      if (brandFilter !== 'all' && s.brandId !== brandFilter) return false;
      if (divisionFilter !== 'all' && s.division !== divisionFilter) return false;

      // ── Date range ──
      if (filterDateFrom || filterDateTo) {
        const startDt = resolveDate(s.startDate);
        if (!startDt) return false;
        if (filterDateFrom) {
          const from = startOfDay(new Date(filterDateFrom));
          if (isBefore(startDt, from)) return false;
        }
        if (filterDateTo) {
          const to = endOfDay(new Date(filterDateTo));
          if (isAfter(startDt, to)) return false;
        }
      }

      // ── Search ──
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const name = (s.fullName || '').toLowerCase();
        const formLabel = getFormLabel(s).toLowerCase();
        const reasonLabel = (getReasonLabel(s) || '').toLowerCase();
        const reason = (s.reason || s.detailedReason || '').toLowerCase();
        const division = (s.division || '').toLowerCase();
        if (
          !name.includes(q) &&
          !formLabel.includes(q) &&
          !reasonLabel.includes(q) &&
          !reason.includes(q) &&
          !division.includes(q)
        ) return false;
      }

      return true;
    });

    // Sort
    items = [...items].sort((a, b) =>
      sortOrder === 'oldest'
        ? toMs(a.createdAt) - toMs(b.createdAt)
        : toMs(b.createdAt) - toMs(a.createdAt),
    );

    return items;
  }, [submissions, activeTab, mode, uid, filterFormType, brandFilter, divisionFilter, filterDateFrom, filterDateTo, searchTerm, sortOrder]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterFormType('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSortOrder('newest');
    setBrandFilter('all');
    setDivisionFilter('all');
  };

  // ─── Manager tab definitions ──────────────────────────────────────────────

  const managerTabs: { id: ManagerTab; label: string; count?: number; urgent?: boolean }[] = [
    { id: 'action_needed', label: 'Butuh Tindakan Saya', count: tabCounts.action_needed, urgent: true },
    { id: 'approved_by_me', label: 'Sudah Saya Setujui', count: tabCounts.approved_by_me },
    { id: 'revision_by_me', label: 'Perlu Revisi', count: tabCounts.revision_by_me },
    { id: 'rejected_by_me', label: 'Saya Tolak', count: tabCounts.rejected_by_me },
    { id: 'all', label: 'Semua Riwayat' },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  const colSpan = mode === 'manager' ? 8 : 7;

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title={mode === 'manager' ? 'Butuh Tindakan Saya' : 'Butuh Tindakan'}
          value={kpis.actionNeeded}
          deltaType={kpis.actionNeeded > 0 ? 'inverse' : undefined}
        />
        {mode === 'manager' && (
          <KpiCard title="Menunggu HRD" value={kpis.waitingHrd} />
        )}
        <KpiCard title="Disetujui Bulan Ini" value={kpis.approvedMonth} />
        <KpiCard title="Ditolak Bulan Ini" value={kpis.rejectedMonth} deltaType="inverse" />
        <KpiCard title="Perlu Revisi" value={kpis.revision} deltaType={kpis.revision > 0 ? 'inverse' : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>
                {mode === 'manager' ? 'Persetujuan Izin Tim' : 'Validasi Pengajuan Izin'}
              </CardTitle>
              <CardDescription className="mt-1">
                {mode === 'manager'
                  ? 'Proses pengajuan izin dari anggota tim Anda.'
                  : 'Validasi pengajuan yang telah disetujui atasan divisi.'}
              </CardDescription>
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground">
                {filteredSubmissions.length} dari {submissions.length} pengajuan
              </span>
            )}
          </div>

          {/* ── Tab bar (manager only) ── */}
          {mode === 'manager' && (
            <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border/50">
              {managerTabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={cn(
                        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : tab.urgent
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-muted-foreground/15 text-muted-foreground',
                      )}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Filter controls ── */}
          <div className="flex flex-wrap gap-2 mt-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Cari nama, keterangan, divisi..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Bentuk izin */}
            <Select value={filterFormType} onValueChange={setFilterFormType}>
              <SelectTrigger className="w-[170px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORM_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Brand + Division (HRD only) */}
            {mode === 'hrd' && (
              <>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="w-[145px] h-9 text-sm">
                    <SelectValue placeholder="Semua Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brandsList?.map((b: Brand) => (
                      <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                  <SelectTrigger className="w-[145px] h-9 text-sm">
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {availableDivisions.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Date from */}
            <Input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="w-[135px] h-9 text-sm"
              title="Dari tanggal"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="w-[135px] h-9 text-sm"
              title="Sampai tanggal"
            />

            {/* Sort */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-sm px-3"
              onClick={() => setSortOrder(p => p === 'newest' ? 'oldest' : 'newest')}
            >
              {sortOrder === 'newest'
                ? <><SortDesc className="h-3.5 w-3.5" /> Terbaru</>
                : <><SortAsc className="h-3.5 w-3.5" /> Terlama</>
              }
            </Button>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-sm text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table className={mode === 'manager' ? 'min-w-[1100px]' : 'min-w-[960px]'}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[175px]">Pengaju</TableHead>
                  <TableHead className="w-[190px]">Izin</TableHead>
                  <TableHead className="w-[140px]">Periode</TableHead>
                  <TableHead className="w-[165px]">Keterangan</TableHead>
                  <TableHead className="w-[90px]">Lampiran</TableHead>
                  <TableHead className="w-[185px]">Status</TableHead>
                  {mode === 'manager' && (
                    <TableHead className="w-[155px]">Menunggu</TableHead>
                  )}
                  <TableHead className="w-[100px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="h-28 text-center text-muted-foreground">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : filteredSubmissions.length > 0 ? (
                  filteredSubmissions.map(s => {
                    const formType = s.formType || s.type;
                    const formLabel = getFormLabel(s);
                    const reasonLabel = getReasonLabel(s);
                    const reasonText = s.reason || s.detailedReason || '';
                    const attachments = (s.attachments || []).filter(Boolean);
                    const hasAttachment = attachments.length > 0;
                    const startDt = resolveDate(s.startDate);
                    const endDt = resolveDate(s.endDate);
                    const isOfficeExit = formType === 'keluar_kantor';
                    const sameDay = startDt && endDt && differenceInCalendarDays(endDt, startDt) === 0;
                    const needsMyAction = mode === 'manager' && isActionNeeded(s, uid);
                    const waitingInfo = mode === 'manager' ? getWaitingInfo(s, uid) : null;
                    const isActionable = !isFinalStatus(s.status);
                    const isMyApproval = mode === 'manager' && isActionNeeded(s, uid);

                    return (
                      <TableRow
                        key={s.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          needsMyAction
                            ? 'border-l-2 border-l-amber-400 bg-amber-50/25 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/15'
                            : 'hover:bg-muted/40',
                        )}
                        onClick={() => setSelectedSubmission(s)}
                      >
                        {/* Pengaju */}
                        <TableCell>
                          <p className="font-medium text-sm leading-snug">{s.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.division || '—'}
                            {s.positionTitle && s.positionTitle !== 'N/A' && s.positionTitle !== 'Staf' && (
                              <span className="ml-1 opacity-75">· {s.positionTitle}</span>
                            )}
                          </p>
                          {isOfficeExit && s.needsManagerAttention && (
                            <Badge variant="outline" className="mt-1 px-1 py-0 h-4 text-[9px] bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40">
                              Deviasi Durasi
                            </Badge>
                          )}
                        </TableCell>

                        {/* Izin */}
                        <TableCell>
                          <p className="text-sm font-medium leading-snug">{formLabel}</p>
                          {reasonLabel && (
                            <p className="text-xs text-muted-foreground mt-0.5">{reasonLabel}</p>
                          )}
                          {s.otherTitle && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[160px]">
                              {s.otherTitle}
                            </p>
                          )}
                        </TableCell>

                        {/* Periode */}
                        <TableCell>
                          <div className="text-sm leading-snug">
                            {startDt && endDt ? (
                              isOfficeExit ? (
                                <>
                                  <p>{format(startDt, 'dd MMM yyyy', { locale: idLocale })}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {format(startDt, 'HH:mm')} — {format(endDt, 'HH:mm')}
                                  </p>
                                </>
                              ) : sameDay ? (
                                <p>{format(startDt, 'dd MMM yyyy', { locale: idLocale })}</p>
                              ) : (
                                <p>
                                  {format(startDt, 'dd MMM', { locale: idLocale })} —{' '}
                                  {format(endDt, 'dd MMM yyyy', { locale: idLocale })}
                                </p>
                              )
                            ) : (
                              <p className="text-muted-foreground">—</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">{formatDuration(s)}</p>
                          </div>
                        </TableCell>

                        {/* Keterangan */}
                        <TableCell>
                          <p className="text-sm text-foreground/75 line-clamp-2 leading-relaxed">
                            {reasonText || (
                              <span className="text-muted-foreground text-xs italic">Tidak ada keterangan.</span>
                            )}
                          </p>
                          {s.createdAt && resolveDate(s.createdAt) && (
                            <p className="text-[10px] text-muted-foreground/55 mt-0.5">
                              {formatDistanceToNow(resolveDate(s.createdAt)!, { addSuffix: true, locale: idLocale })}
                            </p>
                          )}
                        </TableCell>

                        {/* Lampiran */}
                        <TableCell>
                          {hasAttachment ? (
                            <div className="flex flex-col gap-1">
                              <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1 w-fit">
                                <Paperclip className="h-2.5 w-2.5" /> Ada
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <PermissionStatusBadge status={s.status} submission={s} />
                          {/* Extra context badge */}
                          {mode === 'manager' && isApprovedByMe(s, uid) && (s.status === 'approved_by_manager' || s.status === 'pending_hrd') && (
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                              Sudah Anda setujui
                            </p>
                          )}
                        </TableCell>

                        {/* Menunggu (manager only) */}
                        {mode === 'manager' && waitingInfo && (
                          <TableCell>
                            <span className={cn('text-xs font-medium flex items-center gap-1', waitingInfo.colorClass)}>
                              {waitingInfo.icon === 'clock' && <Clock className="h-3 w-3 flex-shrink-0" />}
                              {waitingInfo.icon === 'check' && <CheckCircle2 className="h-3 w-3 flex-shrink-0" />}
                              {waitingInfo.icon === 'x' && <XCircle className="h-3 w-3 flex-shrink-0" />}
                              {waitingInfo.icon === 'warning' && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
                              {waitingInfo.text}
                            </span>
                          </TableCell>
                        )}

                        {/* Aksi */}
                        <TableCell
                          className="text-right"
                          onClick={e => e.stopPropagation()}
                        >
                          <Button
                            variant={isMyApproval ? 'default' : isFinalStatus(s.status) ? 'ghost' : 'outline'}
                            size="sm"
                            className={cn(
                              'h-8 text-sm',
                              isMyApproval && 'bg-amber-500 hover:bg-amber-600 text-white border-0',
                            )}
                            onClick={() => setSelectedSubmission(s)}
                          >
                            {isMyApproval ? 'Review' : isFinalStatus(s.status) ? 'Lihat Detail' : 'Review'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="h-36 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8 opacity-25" />
                        <p className="text-sm font-medium">
                          {mode === 'manager' && activeTab === 'action_needed'
                            ? 'Tidak ada pengajuan yang perlu Anda tindaklanjuti.'
                            : hasActiveFilters
                            ? 'Tidak ada pengajuan yang sesuai filter.'
                            : 'Belum ada data pengajuan izin.'}
                        </p>
                        {hasActiveFilters && (
                          <Button variant="link" size="sm" onClick={clearFilters} className="text-xs h-auto p-0">
                            Bersihkan filter
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedSubmission && (
        <ReviewPermissionDialog
          open={!!selectedSubmission}
          onOpenChange={open => !open && setSelectedSubmission(null)}
          submission={selectedSubmission}
          onSuccess={mutate}
          mode={mode}
        />
      )}
    </div>
  );
}
