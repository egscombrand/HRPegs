'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowRight, Clock, MapPin, Building2, Search, Briefcase, Monitor,
  Users, CalendarDays, AlertTriangle, Tag, SlidersHorizontal, X,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { format, isPast, differenceInDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 9;

// ─── Location normalization ───────────────────────────────────────────────────

const CITY_MAP: [RegExp, string][] = [
  [/jogja/i,                  'Yogyakarta'],
  [/yogya(?!karta)/i,         'Yogyakarta'],
  [/\byogyakarta\b/i,         'Yogyakarta'],
  [/\bjakarta\b/i,            'Jakarta'],
  [/\bbandung\b/i,            'Bandung'],
  [/\bsurabaya\b/i,           'Surabaya'],
  [/\bsemarang\b/i,           'Semarang'],
  [/\bmedan\b/i,              'Medan'],
  [/\bbalikpapan\b/i,         'Balikpapan'],
  [/\bsamarinda\b/i,          'Samarinda'],
  [/\bmakassar\b/i,           'Makassar'],
  [/\bpalembang\b/i,          'Palembang'],
  [/\bdenpasar\b/i,           'Denpasar'],
  [/\bbali\b/i,               'Bali'],
  [/\bpekanbaru\b/i,          'Pekanbaru'],
  [/\bmalang\b/i,             'Malang'],
  [/\bbogor\b/i,              'Bogor'],
  [/\bbekasi\b/i,             'Bekasi'],
  [/\bdepok\b/i,              'Depok'],
  [/\btangerang\b/i,          'Tangerang'],
];

function normalizeCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  for (const [pattern, city] of CITY_MAP) {
    if (pattern.test(text)) return city;
  }
  // Fallback: title-case the cleaned string
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Visibility ───────────────────────────────────────────────────────────────

// Only show published/reopened and not yet expired
function isJobVisible(job: Job): boolean {
  if (job.publishStatus !== 'published' && job.publishStatus !== 'reopened') return false;
  const deadline = job.applyDeadline || job.applicationDeadline;
  if (deadline && isPast(deadline.toDate())) return false;
  return true;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function JobTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    fulltime:   { label: 'Full-time',  cls: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800' },
    internship: { label: 'Internship', cls: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800' },
    contract:   { label: 'Kontrak',    cls: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800' },
  };
  const cfg = map[type] || { label: type, cls: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function WorkModeBadge({ mode }: { mode?: string }) {
  if (!mode) return null;
  const labels: Record<string, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
      {labels[mode] || mode}
    </span>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

const JobCard = ({ job }: { job: Job }) => {
  const deadline = job.applyDeadline || job.applicationDeadline;
  const daysLeft = deadline ? differenceInDays(deadline.toDate(), new Date()) : null;
  const urgent = daysLeft !== null && daysLeft <= 7;
  const divisionLabel = job.divisionName || job.division || null;

  return (
    <div className="group relative flex flex-col rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-teal-400/60 dark:hover:border-teal-600/50 transition-all duration-300 overflow-hidden">
      {/* Top accent line */}
      <div className="h-0.5 w-full bg-gradient-to-r from-teal-400 via-teal-500 to-teal-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Card header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          {/* Brand badge */}
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 max-w-[140px] truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            {(job as any).brandName || 'Environesia'}
          </span>
          <JobTypeBadge type={job.statusJob} />
        </div>

        {/* Position title */}
        <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors line-clamp-2">
          {job.position}
        </h3>

        {/* Division */}
        {divisionLabel ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate">{divisionLabel}</span>
          </p>
        ) : (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 italic">
            <Tag className="h-3 w-3 shrink-0" />
            Level Brand/Unit
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-slate-100 dark:border-slate-800" />

      {/* Card body — meta info */}
      <div className="flex-1 p-5 pt-4 space-y-2">
        {job.location && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{job.location}</span>
          </div>
        )}
        {job.workMode && (
          <div className="flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <WorkModeBadge mode={job.workMode} />
          </div>
        )}
        {job.numberOfOpenings && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{job.numberOfOpenings} posisi tersedia</span>
          </div>
        )}

        {/* Deadline */}
        {deadline ? (
          <div className={cn(
            'flex items-center gap-2 text-sm',
            urgent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          )}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>Deadline: {format(deadline.toDate(), 'dd MMM yyyy', { locale: idLocale })}</span>
            {urgent && daysLeft !== null && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800 shrink-0">
                <AlertTriangle className="h-2.5 w-2.5" />
                {daysLeft === 0 ? 'Hari ini!' : `${daysLeft}h lagi`}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400 italic">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>Deadline tidak ditentukan</span>
          </div>
        )}
      </div>

      {/* CTA button */}
      <div className="p-5 pt-0">
        <Button
          asChild
          className="w-full h-10 gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 group/btn"
        >
          <Link href={`/careers/jobs/${job.slug}`}>
            Lihat Detail
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const JobCardSkeleton = () => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
    <div className="flex justify-between">
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <Skeleton className="h-6 w-3/4 rounded-lg" />
    <Skeleton className="h-4 w-1/2 rounded-lg" />
    <div className="space-y-2 pt-1">
      <Skeleton className="h-4 w-40 rounded" />
      <Skeleton className="h-4 w-32 rounded" />
      <Skeleton className="h-4 w-48 rounded" />
    </div>
    <Skeleton className="h-10 w-full rounded-xl" />
  </div>
);

export function JobExplorerSkeleton() {
  return (
    <div className="mt-8 space-y-6">
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-36 rounded-full" />)}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton />
      </div>
    </div>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({ value, label, selected, onClick }: {
  value: string; label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all border',
        selected
          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-400'
      )}
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JobExplorerClient() {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterMode, setFilterMode] = useState('all');
  const [filterSort, setFilterSort] = useState<'terbaru' | 'deadline' | 'az' | 'brand'>('terbaru');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [page, setPage] = useState(1);

  const jobsQuery = useMemoFirebase(
    () => query(collection(firestore, 'jobs'),
      where('publishStatus', 'in', ['published', 'reopened'])),
    [firestore]
  );
  const { data: allJobs, isLoading } = useCollection<Job>(jobsQuery);

  const visibleJobs = useMemo(() => (allJobs || []).filter(isJobVisible), [allJobs]);

  // Brand options: only brands that have at least one visible job
  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    visibleJobs.forEach(j => {
      if (j.brandId && !seen.has(j.brandId)) {
        seen.add(j.brandId);
        opts.push({ id: j.brandId, name: (j as any).brandName || j.brandId });
      }
    });
    return opts.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [visibleJobs]);

  // Location options: deduplicated by normalized city name
  const locationOptions = useMemo(() => {
    const citySet = new Set<string>();
    visibleJobs.forEach(j => {
      const city = normalizeCity(j.location);
      if (city) citySet.add(city);
    });
    return [...citySet].sort((a, b) => a.localeCompare(b, 'id'));
  }, [visibleJobs]);

  const [filterLocation, setFilterLocation] = useState('all');

  const filteredJobs = useMemo(() => {
    let result = visibleJobs;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(j =>
        j.position.toLowerCase().includes(q) ||
        ((j as any).brandName || '').toLowerCase().includes(q) ||
        (j.division || j.divisionName || '').toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      );
    }
    if (filterBrand !== 'all') result = result.filter(j => j.brandId === filterBrand);
    if (filterType !== 'all') result = result.filter(j => j.statusJob === filterType);
    if (filterMode !== 'all') result = result.filter(j => j.workMode === filterMode);
    if (filterLocation !== 'all') result = result.filter(j => normalizeCity(j.location) === filterLocation);

    return [...result].sort((a, b) => {
      if (filterSort === 'deadline') {
        const dA = (a.applyDeadline || a.applicationDeadline)?.toMillis() ?? Infinity;
        const dB = (b.applyDeadline || b.applicationDeadline)?.toMillis() ?? Infinity;
        return dA - dB;
      }
      if (filterSort === 'az') return a.position.localeCompare(b.position, 'id');
      if (filterSort === 'brand') return ((a as any).brandName || '').localeCompare((b as any).brandName || '', 'id');
      // terbaru
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    });
  }, [visibleJobs, searchTerm, filterBrand, filterType, filterMode, filterLocation, filterSort]);

  const paginatedJobs = filteredJobs.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filteredJobs.length;
  const hasActiveFilter = searchTerm || filterBrand !== 'all' || filterType !== 'all' || filterMode !== 'all' || filterLocation !== 'all';

  const resetFilters = () => {
    setSearchTerm(''); setFilterBrand('all'); setFilterType('all');
    setFilterMode('all'); setFilterLocation('all'); setPage(1);
  };

  const handleFilterChange = (fn: () => void) => { fn(); setPage(1); };

  // Grid class based on result count
  const gridClass = cn(
    'grid gap-5 sm:gap-6',
    paginatedJobs.length === 1
      ? 'max-w-sm mx-auto'
      : paginatedJobs.length === 2
      ? 'sm:grid-cols-2 max-w-2xl mx-auto'
      : 'sm:grid-cols-2 lg:grid-cols-3'
  );

  return (
    <div className="mt-10 space-y-6">

      {/* ── Search bar ───────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Cari posisi, brand, lokasi, atau divisi..."
          className="h-14 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-12 pr-14 text-base text-slate-800 dark:text-slate-200 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          value={searchTerm}
          onChange={e => handleFilterChange(() => setSearchTerm(e.target.value))}
        />
        {searchTerm && (
          <button
            onClick={() => handleFilterChange(() => setSearchTerm(''))}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Filters row ──────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Type quick chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'fulltime', 'internship', 'contract'] as const).map(v => (
            <FilterChip
              key={v}
              value={v}
              label={v === 'all' ? 'Semua Tipe' : v === 'fulltime' ? 'Full-time' : v === 'internship' ? 'Internship' : 'Kontrak'}
              selected={filterType === v}
              onClick={() => handleFilterChange(() => setFilterType(v))}
            />
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setShowMoreFilters(v => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all',
                showMoreFilters
                  ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter Lainnya
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        {showMoreFilters && (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-3">
            <Select value={filterBrand} onValueChange={v => handleFilterChange(() => setFilterBrand(v))}>
              <SelectTrigger className="h-9 w-44 rounded-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                <SelectValue placeholder="Semua Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Brand</SelectItem>
                {brandOptions.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterMode} onValueChange={v => handleFilterChange(() => setFilterMode(v))}>
              <SelectTrigger className="h-9 w-36 rounded-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                <SelectValue placeholder="Mode Kerja" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Mode</SelectItem>
                <SelectItem value="onsite">On-site</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>

            {locationOptions.length > 0 && (
              <Select value={filterLocation} onValueChange={v => handleFilterChange(() => setFilterLocation(v))}>
                <SelectTrigger className="h-9 w-40 rounded-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                  <SelectValue placeholder="Lokasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Lokasi</SelectItem>
                  {locationOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={filterSort} onValueChange={v => handleFilterChange(() => setFilterSort(v as any))}>
              <SelectTrigger className="h-9 w-48 rounded-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
                <SelectValue placeholder="Urutkan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terbaru">Terbaru</SelectItem>
                <SelectItem value="deadline">Deadline Terdekat</SelectItem>
                <SelectItem value="az">A–Z Posisi</SelectItem>
                <SelectItem value="brand">Brand</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Reset Filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Results count ─────────────────────────────────────── */}
      {!isLoading && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Menampilkan{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(paginatedJobs.length, filteredJobs.length)}</span>
            {' '}dari{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredJobs.length}</span>
            {' '}lowongan
            {hasActiveFilter && (
              <button onClick={resetFilters} className="ml-3 inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline">
                <X className="h-3 w-3" /> Hapus filter
              </button>
            )}
          </p>
          {/* Sort shortcut when filters not expanded */}
          {!showMoreFilters && (
            <Select value={filterSort} onValueChange={v => handleFilterChange(() => setFilterSort(v as any))}>
              <SelectTrigger className="h-8 w-44 rounded-full border-slate-200 dark:border-slate-700 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terbaru">Terbaru</SelectItem>
                <SelectItem value="deadline">Deadline Terdekat</SelectItem>
                <SelectItem value="az">A–Z Posisi</SelectItem>
                <SelectItem value="brand">Brand</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* ── Job grid ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton />
        </div>
      ) : filteredJobs.length > 0 ? (
        <>
          <div className={gridClass}>
            {paginatedJobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                className="h-11 rounded-full border-slate-200 dark:border-slate-700 px-8 text-sm font-semibold hover:border-teal-400 hover:text-teal-700 dark:hover:border-teal-600 dark:hover:text-teal-400 transition-colors"
              >
                Muat Lebih Banyak
                <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {filteredJobs.length - paginatedJobs.length} lagi
                </span>
              </Button>
            </div>
          )}
        </>
      ) : (
        /* ── Empty state ─────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-5">
            <Briefcase className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">Belum Ada Lowongan yang Sesuai</h3>
          <p className="mt-2 text-sm text-slate-400 max-w-xs">
            Coba ubah kata kunci atau filter Anda, atau cek kembali nanti untuk lowongan terbaru.
          </p>
          {hasActiveFilter && (
            <Button
              variant="outline"
              onClick={resetFilters}
              className="mt-5 h-9 rounded-full border-slate-200 dark:border-slate-700 text-sm font-medium hover:border-teal-400 hover:text-teal-700 dark:hover:border-teal-600 dark:hover:text-teal-400"
            >
              <X className="h-3.5 w-3.5 mr-1.5" /> Hapus Semua Filter
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
