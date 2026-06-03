'use client';

import { useState, useMemo, Fragment, type ReactNode } from 'react';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  deleteDocumentNonBlocking,
  useDoc,
} from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { PermissionRequest, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  PlusCircle,
  Edit,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  Paperclip,
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileText,
  Search,
  SortAsc,
  SortDesc,
  X,
} from 'lucide-react';
import {
  format,
  differenceInCalendarDays,
  isAfter,
  isBefore,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { PermissionRequestForm } from './PermissionRequestForm';
import { PermissionStatusBadge, getHumanStatusLabel } from './PermissionStatusBadge';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  transportasi: 'Transportasi / Kendaraan',
  keperluan_pribadi: 'Keperluan Pribadi',
  lainnya: 'Lainnya',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'draft', label: 'Draf' },
  { value: 'pending_manager', label: 'Menunggu Atasan' },
  { value: 'revision_manager', label: 'Perlu Revisi' },
  { value: 'rejected_manager', label: 'Ditolak Atasan' },
  { value: 'approved_by_manager', label: 'Disetujui Atasan' },
  { value: 'pending_hrd', label: 'Menunggu HRD' },
  { value: 'revision_hrd', label: 'Perlu Revisi (HRD)' },
  { value: 'rejected_hrd', label: 'Ditolak HRD' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'closed', label: 'Selesai' },
];

const FORM_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Bentuk' },
  { value: 'tidak_masuk', label: 'Tidak Masuk Kerja' },
  { value: 'datang_terlambat', label: 'Datang Terlambat' },
  { value: 'pulang_awal', label: 'Pulang Lebih Awal' },
  { value: 'keluar_kantor', label: 'Meninggalkan Kantor' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  if (formType === 'keluar_kantor') {
    const mins = s.totalDurationMinutes || 0;
    if (mins < 60) return `${mins} menit`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
  }
  const days = differenceInCalendarDays(s.endDate.toDate(), s.startDate.toDate()) + 1;
  return days === 1 ? '1 hari' : `${days} hari`;
}

function resolveAttachmentSrc(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/')) return url;
  const m =
    url.match(/[?&]fileId=([^&]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
    url.match(/id=([a-zA-Z0-9-_]+)/);
  if (m) return `/api/storage/google-drive-preview?fileId=${m[1]}`;
  return url;
}

type StepState = 'done' | 'active' | 'rejected' | 'pending';

function getWaitingFor(s: PermissionRequest): string | null {
  switch (s.status) {
    case 'pending_manager':
    case 'revision_manager':
      return s.managerName
        ? `Menunggu persetujuan ${s.managerName}`
        : 'Menunggu persetujuan atasan';
    case 'approved_by_manager':
    case 'pending_hrd':
    case 'revision_hrd':
      return 'Menunggu validasi HRD';
    default:
      return null;
  }
}

function getNodeState(nodeIndex: number, status: string): StepState {
  if (nodeIndex === 0) return 'done';
  if (nodeIndex === 1) {
    if (status === 'rejected_manager') return 'rejected';
    if (status === 'pending_manager' || status === 'revision_manager') return 'active';
    if (
      ['approved_by_manager', 'pending_hrd', 'revision_hrd', 'rejected_hrd',
        'approved', 'closed', 'reported', 'returned', 'verified_manager'].includes(status)
    ) return 'done';
    return 'pending';
  }
  if (nodeIndex === 2) {
    if (status === 'rejected_hrd') return 'rejected';
    if (['pending_hrd', 'revision_hrd', 'approved_by_manager'].includes(status)) return 'active';
    if (['approved', 'closed', 'reported', 'returned', 'verified_manager'].includes(status)) return 'done';
    return 'pending';
  }
  return 'pending';
}

// ─── ApprovalProgress (mini, for table cell) ──────────────────────────────────

function ApprovalProgress({
  status,
  managerName,
}: {
  status: string;
  managerName?: string | null;
}) {
  const steps = ['Staff', managerName ? managerName.split(' ')[0] : 'Atasan', 'HRD'];
  return (
    <div className="flex items-center gap-0.5">
      {steps.map((label, i) => {
        const state = getNodeState(i, status);
        return (
          <div key={i} className="flex items-center gap-0.5">
            <span
              className={cn(
                'px-1.5 py-px rounded text-[9px] font-semibold whitespace-nowrap leading-4',
                state === 'done' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                state === 'active' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ring-1 ring-amber-400/30',
                state === 'rejected' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                state === 'pending' && 'bg-muted text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <ArrowRight className="h-2 w-2 text-muted-foreground/40 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TimelinePanel ────────────────────────────────────────────────────────────

function TimelinePanel({ timeline }: { timeline?: PermissionRequest['timeline'] }) {
  if (!timeline?.length) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Belum ada catatan aktivitas.
      </p>
    );
  }
  return (
    <ol className="space-y-4">
      {timeline.map((item, i) => {
        const isLast = i === timeline.length - 1;
        const firstWord = item.by?.split(' ')[0]?.toLowerCase() ?? '';
        const eventAlreadyIncludeBy =
          firstWord.length > 2 && item.event.toLowerCase().includes(firstWord);
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0 w-3.5">
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full mt-1 flex-shrink-0',
                  isLast ? 'bg-primary' : 'bg-muted-foreground/40',
                )}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-border/60 mt-1 min-h-[18px]" />
              )}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">
                {item.by && !eventAlreadyIncludeBy && (
                  <span className="font-semibold">{item.by} — </span>
                )}
                {item.event}
              </p>
              {item.note && (
                <p className="text-sm text-muted-foreground mt-1 italic">"{item.note}"</p>
              )}
              {item.at && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {format(item.at.toDate(), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── DetailPanel (expandable row content) ─────────────────────────────────────

interface DetailPanelProps {
  s: PermissionRequest;
  onEdit: () => void;
  onCancel: () => void;
}

function DetailPanel({ s, onEdit, onCancel }: DetailPanelProps) {
  const formLabel = FORM_TYPE_LABELS[s.formType || s.type] || s.formType || s.type || '—';
  const reasonLabel = REASON_LABELS[s.reasonType || ''] || '';
  const attachments = (s.attachments || []).filter(Boolean);
  const canRevise = Boolean(s.status?.startsWith('revision'));
  const canCancel = s.status === 'draft';
  const waitingFor = getWaitingFor(s);
  const humanStatus = getHumanStatusLabel(s.status, s);
  const decisionNote =
    s.managerNotes ||
    s.hrdNotes ||
    s.managerReviewNote ||
    s.hrdReviewNote ||
    (s.approvalFlow as any)?.decisionNotes ||
    null;

  const df: Record<string, any> = s.dynamicFields || {};
  const extras: { label: string; value: string }[] = [];
  const push = (label: string, v: string | null | undefined) => {
    if (v) extras.push({ label, value: v });
  };
  push('Keluhan', df.sicknessDescription || s.sicknessDescription);
  push('Hubungan Keluarga', df.familyRelation || s.familyRelation);
  push('Nama Keluarga', df.familyName || s.familyName);
  push('Lokasi', df.location || s.location);
  push('Kegiatan', df.academicActivityName || s.academicActivityName);
  push('Institusi', df.academicInstitution || s.academicInstitution);
  push('Tujuan', s.destination || df.destination);
  push('Jenis Urusan', df.officialAffairType || s.officialAffairType);
  push('Judul Izin', s.otherTitle || df.otherTitle);

  const startDt = s.startDate.toDate();
  const endDt = s.endDate.toDate();
  const multiDay = differenceInCalendarDays(endDt, startDt) > 0;

  // Build summary rows — only include rows where value is meaningful
  const summaryRows: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Bentuk Izin', value: formLabel },
    ...(reasonLabel ? [{ label: 'Alasan', value: reasonLabel }] : []),
    {
      label: 'Periode',
      value: multiDay
        ? `${format(startDt, 'dd MMM yyyy', { locale: idLocale })} — ${format(endDt, 'dd MMM yyyy', { locale: idLocale })}`
        : format(startDt, 'dd MMM yyyy', { locale: idLocale }),
    },
    { label: 'Durasi', value: formatDuration(s) },
    { label: 'Status saat ini', value: humanStatus, highlight: true },
    ...(waitingFor ? [{ label: 'Sedang menunggu', value: waitingFor, highlight: true }] : []),
    ...(s.managerName ? [{ label: 'Atasan', value: s.managerName }] : []),
    ...(s.createdAt?.toDate
      ? [{ label: 'Diajukan pada', value: format(s.createdAt.toDate(), "dd MMM yyyy, HH:mm", { locale: idLocale }) }]
      : []),
  ];

  const SectionHeading = ({ children }: { children: ReactNode }) => (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </p>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 bg-muted/10 border-t border-border/50">
      {/* ── Kiri: Ringkasan + Keterangan + Lampiran ── */}
      <div className="p-5 space-y-6">

        {/* 1. Ringkasan Izin */}
        <section>
          <SectionHeading>Ringkasan Izin</SectionHeading>
          <div className="space-y-2">
            {summaryRows.map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                <span className={cn(
                  'text-sm font-medium text-right',
                  highlight && 'text-foreground',
                )}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Keterangan Lengkap */}
        <section>
          <SectionHeading>Keterangan Lengkap</SectionHeading>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {s.reason || s.detailedReason || (
              <span className="text-muted-foreground italic">Tidak ada keterangan tambahan.</span>
            )}
          </p>
          {/* Extras (keluhan, lokasi, dll.) */}
          {extras.length > 0 && (
            <div className="mt-3 space-y-2 pt-3 border-t border-border/50">
              {extras.map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                  <span className="text-sm font-medium text-right">{value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Lampiran */}
        <section>
          <SectionHeading>Lampiran</SectionHeading>
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada lampiran untuk pengajuan ini.</p>
          ) : (
            <div className="space-y-2">
              {attachments.map((url, idx) => {
                const src = resolveAttachmentSrc(url);
                const isImg = /\.(jpg|jpeg|png|gif|webp)/i.test(url) || url.includes('image');
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    {isImg ? (
                      <img
                        src={src}
                        alt="lampiran"
                        className="h-10 w-10 rounded object-cover border flex-shrink-0"
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm text-foreground/70 flex-1 truncate">
                      Lampiran {idx + 1}
                    </span>
                    <Button size="sm" variant="outline" asChild>
                      <a href={src} target="_blank" rel="noopener noreferrer">
                        Lihat Lampiran
                      </a>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Catatan keputusan */}
        {decisionNote && (
          <section className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">
              Catatan Keputusan
            </p>
            <p className="text-sm text-foreground leading-relaxed">{decisionNote}</p>
          </section>
        )}

        {/* Aksi */}
        {(canRevise || canCancel) && (
          <div className="flex gap-2 pt-1 border-t border-border/50">
            {canRevise && (
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                <Edit className="h-3.5 w-3.5" /> Perbaiki Pengajuan
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Batalkan Pengajuan
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Kanan: Alur Persetujuan + Timeline ── */}
      <div className="p-5 space-y-6 border-t lg:border-t-0 lg:border-l border-border/50">

        {/* 4. Alur Persetujuan */}
        <section>
          <SectionHeading>Alur Persetujuan</SectionHeading>
          <div className="grid grid-cols-3 gap-2">
            {[
              { role: 'Pengaju', name: s.fullName || 'Staff' },
              { role: 'Atasan', name: s.managerName || 'Belum ditentukan' },
              { role: 'HRD', name: 'HRD' },
            ].map((node, i) => {
              const state = getNodeState(i, s.status);
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3 text-center transition-colors',
                    state === 'done' && 'border-green-300/60 bg-green-50/60 dark:border-green-800/40 dark:bg-green-900/20',
                    state === 'active' && 'border-amber-300/60 bg-amber-50/70 dark:border-amber-800/40 dark:bg-amber-900/25 ring-1 ring-amber-400/30',
                    state === 'rejected' && 'border-red-300/60 bg-red-50/60 dark:border-red-800/40 dark:bg-red-900/20',
                    state === 'pending' && 'border-border bg-muted/30',
                  )}
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                    {node.role}
                  </p>
                  <p className="text-sm font-semibold truncate">{node.name}</p>
                  <div className="flex justify-center items-center gap-1 mt-2">
                    {state === 'done' && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-xs text-green-600 dark:text-green-400">Selesai</span>
                      </>
                    )}
                    {state === 'active' && (
                      <>
                        <Clock className="h-4 w-4 text-amber-500 animate-pulse flex-shrink-0" />
                        <span className="text-xs text-amber-600 dark:text-amber-400">Proses</span>
                      </>
                    )}
                    {state === 'rejected' && (
                      <>
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <span className="text-xs text-red-600 dark:text-red-400">Ditolak</span>
                      </>
                    )}
                    {state === 'pending' && (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">Menunggu</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Riwayat Aktivitas */}
        <section>
          <SectionHeading>Riwayat Aktivitas</SectionHeading>
          <TimelinePanel timeline={s.timeline} />
        </section>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PermissionSubmissionClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PermissionRequest | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFormType, setFilterFormType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const submissionsQuery = useMemoFirebase(
    () => {
      if (!userProfile?.uid) return null;
      return query(
        collection(firestore, 'permission_requests'),
        where('uid', '==', userProfile.uid),
      );
    },
    [userProfile?.uid, firestore],
  );

  const { data: submissions, isLoading, mutate } = useCollection<PermissionRequest>(submissionsQuery);

  const { data: employeeProfile } = useDoc<EmployeeProfile>(
    useMemoFirebase(
      () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
      [userProfile, firestore],
    ),
  );

  const { data: brands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore]),
  );

  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    const toMs = (t: any): number =>
      typeof t?.toMillis === 'function' ? t.toMillis() : (t?.seconds ?? 0) * 1000;
    return [...submissions].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  }, [submissions]);

  const hasActiveFilters = Boolean(
    searchQuery ||
      filterStatus !== 'all' ||
      filterFormType !== 'all' ||
      filterDateFrom ||
      filterDateTo ||
      sortOrder !== 'newest',
  );

  const filteredSubmissions = useMemo(() => {
    let items = sortedSubmissions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(s => {
        const formLabel = FORM_TYPE_LABELS[s.formType || s.type] || '';
        const reasonLabel = REASON_LABELS[s.reasonType || ''] || '';
        const humanStatus = getHumanStatusLabel(s.status, s);
        const reason = (s.reason || s.detailedReason || '').toLowerCase();
        const manager = (s.managerName || s.waitingForName || '').toLowerCase();
        const other = (s.otherTitle || '').toLowerCase();
        return (
          formLabel.toLowerCase().includes(q) ||
          reasonLabel.toLowerCase().includes(q) ||
          humanStatus.toLowerCase().includes(q) ||
          reason.includes(q) ||
          manager.includes(q) ||
          other.includes(q)
        );
      });
    }

    if (filterStatus !== 'all') {
      items = items.filter(s => s.status === filterStatus);
    }

    if (filterFormType !== 'all') {
      items = items.filter(s => (s.formType || s.type) === filterFormType);
    }

    if (filterDateFrom) {
      const from = startOfDay(new Date(filterDateFrom));
      items = items.filter(s => !isBefore(s.startDate.toDate(), from));
    }

    if (filterDateTo) {
      const to = endOfDay(new Date(filterDateTo));
      items = items.filter(s => !isAfter(s.startDate.toDate(), to));
    }

    return sortOrder === 'oldest' ? [...items].reverse() : items;
  }, [sortedSubmissions, searchQuery, filterStatus, filterFormType, filterDateFrom, filterDateTo, sortOrder]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterFormType('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSortOrder('newest');
  };

  const handleCreate = () => {
    setSelectedRequest(null);
    setIsFormOpen(true);
  };

  const handleEdit = (request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsFormOpen(true);
  };

  const handleCancelRequest = (request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsDeleteDialogOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedRowId(prev => (prev === id ? null : id));
  };

  const confirmCancel = async () => {
    if (!selectedRequest) return;
    try {
      await deleteDocumentNonBlocking(
        doc(firestore, 'permission_requests', selectedRequest.id!),
      );
      toast({ title: 'Pengajuan Dibatalkan' });
      mutate();
      if (expandedRowId === selectedRequest.id) setExpandedRowId(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Membatalkan', description: e.message });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Pengajuan Izin</h1>
            <p className="text-sm text-muted-foreground">Buat dan lacak status pengajuan izin Anda.</p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Buat Pengajuan
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Riwayat Pengajuan</CardTitle>
              {sortedSubmissions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {filteredSubmissions.length} dari {sortedSubmissions.length} pengajuan
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Cari jenis, alasan, status, atasan..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[170px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterFormType} onValueChange={setFilterFormType}>
                <SelectTrigger className="w-[170px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPE_FILTER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="w-[140px] h-9 text-sm"
                title="Dari tanggal"
              />
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="w-[140px] h-9 text-sm"
                title="Sampai tanggal"
              />

              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-3 text-sm"
                onClick={() =>
                  setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'))
                }
              >
                {sortOrder === 'newest' ? (
                  <>
                    <SortDesc className="h-3.5 w-3.5" /> Terbaru
                  </>
                ) : (
                  <>
                    <SortAsc className="h-3.5 w-3.5" /> Terlama
                  </>
                )}
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-3 text-sm text-muted-foreground"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" /> Reset
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="rounded-lg border overflow-x-auto">
              <Table className="min-w-[1060px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Izin</TableHead>
                    <TableHead className="w-[155px]">Periode</TableHead>
                    <TableHead className="w-[180px]">Keterangan</TableHead>
                    <TableHead className="w-[110px]">Lampiran</TableHead>
                    <TableHead className="w-[195px]">Status</TableHead>
                    <TableHead className="w-[175px]">Alur</TableHead>
                    <TableHead className="w-[95px]">Diajukan</TableHead>
                    <TableHead className="w-[150px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.length > 0 ? (
                    filteredSubmissions.map(s => {
                      const id = s.id!;
                      const isExpanded = expandedRowId === id;
                      const formLabel =
                        FORM_TYPE_LABELS[s.formType || s.type] || s.formType || s.type || '—';
                      const reasonLabel = REASON_LABELS[s.reasonType || ''] || '';
                      const attachments = (s.attachments || []).filter(Boolean);
                      const hasAttachment = attachments.length > 0;
                      const reasonText = s.reason || s.detailedReason || '';
                      const canRevise = Boolean(s.status?.startsWith('revision'));
                      const canCancel = s.status === 'draft';
                      const formType = s.formType || s.type;
                      const startDt = s.startDate.toDate();
                      const endDt = s.endDate.toDate();
                      const sameDay = differenceInCalendarDays(endDt, startDt) === 0;

                      return (
                        <Fragment key={id}>
                          <TableRow
                            className={cn(
                              'cursor-pointer transition-colors',
                              isExpanded && 'bg-muted/20',
                            )}
                            onClick={() => toggleExpand(id)}
                          >
                            {/* 1. Izin */}
                            <TableCell>
                              <div className="min-w-0">
                                <p className="font-medium text-sm leading-snug">{formLabel}</p>
                                {reasonLabel && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {reasonLabel}
                                  </p>
                                )}
                                {s.otherTitle && (
                                  <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[160px]">
                                    {s.otherTitle}
                                  </p>
                                )}
                              </div>
                            </TableCell>

                            {/* 2. Periode */}
                            <TableCell>
                              <div className="text-sm leading-snug">
                                {formType === 'keluar_kantor' ? (
                                  <>
                                    <p>{format(startDt, 'dd MMM yyyy', { locale: idLocale })}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {format(startDt, 'HH:mm')} — {format(endDt, 'HH:mm')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDuration(s)}
                                    </p>
                                  </>
                                ) : sameDay ? (
                                  <>
                                    <p>{format(startDt, 'dd MMM yyyy', { locale: idLocale })}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {formatDuration(s)}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p>
                                      {format(startDt, 'dd MMM', { locale: idLocale })} —{' '}
                                      {format(endDt, 'dd MMM yyyy', { locale: idLocale })}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {formatDuration(s)}
                                    </p>
                                  </>
                                )}
                              </div>
                            </TableCell>

                            {/* 3. Keterangan */}
                            <TableCell>
                              <p className="text-sm text-foreground/75 line-clamp-2 leading-relaxed">
                                {reasonText || (
                                  <span className="italic text-muted-foreground text-xs">Tidak ada keterangan.</span>
                                )}
                              </p>
                            </TableCell>

                            {/* 4. Lampiran */}
                            <TableCell>
                              {hasAttachment ? (
                                <div className="flex flex-col gap-1">
                                  <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1 w-fit">
                                    <Paperclip className="h-2.5 w-2.5" />
                                    Ada
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] text-primary w-fit"
                                    onClick={e => {
                                      e.stopPropagation();
                                      window.open(resolveAttachmentSrc(attachments[0]), '_blank');
                                    }}
                                  >
                                    Lihat
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
                            </TableCell>

                            {/* 5. Status */}
                            <TableCell>
                              <PermissionStatusBadge status={s.status} submission={s} />
                            </TableCell>

                            {/* 6. Alur */}
                            <TableCell>
                              <ApprovalProgress
                                status={s.status}
                                managerName={s.managerName || s.waitingForName}
                              />
                            </TableCell>

                            {/* 7. Diajukan */}
                            <TableCell>
                              <div className="text-xs text-muted-foreground leading-snug">
                                {s.createdAt?.toDate ? (
                                  <>
                                    <p>
                                      {format(s.createdAt.toDate(), 'dd MMM yyyy', {
                                        locale: idLocale,
                                      })}
                                    </p>
                                    <p className="opacity-60">
                                      {format(s.createdAt.toDate(), 'HH:mm')}
                                    </p>
                                  </>
                                ) : (
                                  'Baru saja'
                                )}
                              </div>
                            </TableCell>

                            {/* 8. Aksi */}
                            <TableCell className="text-right">
                              <div
                                className="flex flex-col items-end gap-1"
                                onClick={e => e.stopPropagation()}
                              >
                                {/* Tombol utama: Lihat/Tutup Detail */}
                                <Button
                                  variant={isExpanded ? 'secondary' : 'outline'}
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs w-full justify-center"
                                >
                                  {isExpanded ? (
                                    <><ChevronUp className="h-3.5 w-3.5" /> Tutup Detail</>
                                  ) : (
                                    <><ChevronDown className="h-3.5 w-3.5" /> Lihat Detail</>
                                  )}
                                </Button>
                                {/* Aksi tambahan */}
                                {canRevise && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs w-full justify-center"
                                    onClick={() => handleEdit(s)}
                                  >
                                    <Edit className="h-3 w-3" /> Perbaiki
                                  </Button>
                                )}
                                {canCancel && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs w-full justify-center text-destructive hover:text-destructive border-destructive/30"
                                    onClick={() => handleCancelRequest(s)}
                                  >
                                    <Trash2 className="h-3 w-3" /> Batalkan
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expandable detail row */}
                          {isExpanded && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={8} className="p-0">
                                <DetailPanel
                                  s={s}
                                  onEdit={() => handleEdit(s)}
                                  onCancel={() => handleCancelRequest(s)}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-36 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-25" />
                          <p className="text-sm font-medium">
                            {hasActiveFilters
                              ? 'Tidak ada pengajuan yang sesuai filter.'
                              : 'Belum ada pengajuan izin.'}
                          </p>
                          {hasActiveFilters && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={clearFilters}
                              className="text-xs h-auto p-0"
                            >
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
      </div>

      <PermissionRequestForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedRequest}
        employeeProfile={employeeProfile || null}
        brands={brands || []}
        onSuccess={mutate}
      />

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="pengajuan izin ini"
        itemType=""
      />
    </>
  );
}
