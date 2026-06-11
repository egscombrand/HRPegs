'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp } from 'firebase/firestore';
import type { Brand, EmployeeProfile, AttendanceEvent } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Badge } from '../ui/badge';
import { Search } from 'lucide-react';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { MarkAttendanceInvalidDialog } from './MarkAttendanceInvalidDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AttendanceDetailModal } from './AttendanceDetailModal';
import { AttendanceSummaryCard } from './AttendanceSummaryCard';
import { useAuth } from '@/providers/auth-provider';
import {
  resolveProfileUid,
  resolveEventUid,
  isCheckInEvent,
  isCheckOutEvent,
  resolvePhotoUrl,
  resolveAddress,
  getEventTimestamp,
} from '@/lib/attendance-helpers';

// Quick status filter tabs
const STATUS_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'belum-tap-in', label: 'Belum Tap In' },
  { key: 'sedang-bekerja', label: 'Sedang Bekerja' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'terlambat', label: 'Terlambat' },
  { key: 'tidak-valid', label: 'Tidak Valid' },
  { key: 'perlu-review', label: 'Perlu Review' },
] as const;

type StatusTabKey = typeof STATUS_TABS[number]['key'];

interface AttendanceRecord {
  id: string;
  name: string;
  employeeNumber: string;
  brandName: string;
  brandId?: string;
  divisionName: string;
  attendanceMethod: 'fingerprint' | 'web_absen' | 'not_set';
  tapIn: string;
  tapOut: string;
  tapInId: string | null;
  tapOutId: string | null;
  status: string;
  mode: 'onsite' | 'offsite' | '-';
  photoUrl?: string | null;
  address: string;
  location: { lat: number; lng: number } | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  workDurationMinutes: number | null;
  isInvalid: boolean;
  isOnLeave: boolean;
  rawEvent?: any;
}

function MonitoringSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function isPerluReview(row: AttendanceRecord): boolean {
  return row.isInvalid ||
    (row.lateMinutes !== null && row.lateMinutes > 15) ||
    (row.status === 'Selesai' && row.workDurationMinutes !== null && row.workDurationMinutes < 420);
}

export function AttendanceMonitoringClient() {
  const [date, setDate] = useState<Date | null>(new Date());
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusTab, setStatusTab] = useState<StatusTabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null; tapOutId: string | null; userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [isMarkInvalidDialogOpen, setIsMarkInvalidDialogOpen] = useState(false);
  const [recordToMarkInvalid, setRecordToMarkInvalid] = useState<any>(null);

  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // --- Data Fetching ---
  const { data: sites, isLoading: isLoadingConfig } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, 'attendance_sites'), [firestore])
  );

  const { data: allEmployeeProfiles, isLoading: isLoadingProfiles } = useCollection<EmployeeProfile>(
    useMemoFirebase(() => collection(firestore, 'employee_profiles'), [firestore])
  );

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const eventsQuery = useMemoFirebase(() => {
    if (!date) return null;
    const selectedDateString = format(date, 'yyyy-MM-dd');
    return query(
      collection(firestore, 'attendance_events'),
      where('datetime.date', '==', selectedDateString)
    );
  }, [firestore, date]);
  const { data: attendanceEvents, isLoading: isLoadingEvents, mutate: mutateEvents } = useCollection<AttendanceEvent>(eventsQuery);

  const leavesQuery = useMemoFirebase(() => {
    return query(
      collection(firestore, 'leave_requests'),
      where('status', 'in', ['approved', 'active_leave'])
    );
  }, [firestore]);
  const { data: leaveRequests, isLoading: isLoadingLeaves } = useCollection<any>(leavesQuery);

  const isLoading = isLoadingConfig || isLoadingProfiles || isLoadingBrands || isLoadingEvents || isLoadingLeaves;

  // --- Data Processing ---
  const { tableData, summaryStats, brandOptions } = useMemo(() => {
    const empty = {
      tableData: [] as AttendanceRecord[],
      summaryStats: { total: 0, hadir: 0, belumTapIn: 0, sedangBekerja: 0, selesai: 0, terlambat: 0, tidakValid: 0, perluReview: 0 },
      brandOptions: [] as string[],
    };
    if (!allEmployeeProfiles || !brands) return empty;

    const safeFormatTime = (timestamp: Date | null): string => {
      if (!timestamp) return '-';
      try {
        if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) return '-';
        return format(timestamp, 'HH:mm');
      } catch {
        return '-';
      }
    };

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const activeSite = sites?.find((s: any) => s.isActive);

    // Only active employees, not candidates
    const activeProfiles = allEmployeeProfiles.filter((p: any) => {
      if (p.isActive === false) return false;
      const status = p.status || p.employmentStatus || '';
      if (status === 'inactive' || status === 'nonaktif' || status === 'Nonaktif') return false;
      const role = p.role || '';
      if (role === 'candidate' || role === 'kandidat') return false;
      return true;
    });

    // Only Web Absen employees
    const webAbsenProfiles = activeProfiles.filter((p: any) => {
      const method = p.attendanceMethod || p.hrdEmploymentInfo?.attendanceMethod;
      return method === 'web_absen';
    });

    const uniqueBrandIds = Array.from(new Set(
      webAbsenProfiles
        .map((p: any) => p.hrdEmploymentInfo?.brandId || p.brandId)
        .filter((id): id is string => typeof id === 'string')
    ));

    // Deduplicate by uid
    const seenUids = new Set<string>();
    const dedupedProfiles = webAbsenProfiles.filter((p: any) => {
      const uid = resolveProfileUid(p);
      if (!uid || seenUids.has(uid)) return false;
      seenUids.add(uid);
      return true;
    });

    const rows: AttendanceRecord[] = [];

    for (const profile of dedupedProfiles) {
      const profileUid = resolveProfileUid(profile as any)!;
      const brandId = (profile as any).hrdEmploymentInfo?.brandId || (profile as any).brandId;

      // Brand filter
      if (brandFilter !== 'all' && brandId !== brandFilter) continue;

      // Find events for this employee
      const userEvents = attendanceEvents?.filter((e: any) => {
        const eventUid = resolveEventUid(e);
        return eventUid && eventUid === profileUid;
      }) || [];

      const checkInEvent = userEvents.find((e: any) => isCheckInEvent(e.type));
      const checkOutEvent = userEvents.find((e: any) => isCheckOutEvent(e.type));
      const eventData = checkInEvent || checkOutEvent;

      // Resolve names and IDs
      const resolveName = (p: any, e?: any): string => {
        return p.fullName || p.dataDiriIdentitas?.fullName || p.namaLengkap || p.displayName || p.name ||
          e?.employeeName || e?.fullName || e?.name || e?.displayName || e?.userName ||
          p.email || e?.email ||
          p.employeeNumber || p.employeeId || e?.employeeNumber || e?.employeeId ||
          'Data karyawan belum lengkap';
      };

      const resolveEmployeeNumber = (p: any, e?: any): string =>
        p.hrdEmploymentInfo?.employeeId || p.employeeNumber || p.employeeId || p.employeeCode ||
        p.nomorIndukKaryawan || p.dataDiriIdentitas?.employeeNumber || p.dataDiriIdentitas?.employeeId ||
        e?.employeeNumber || e?.employeeId || e?.nomorIndukKaryawan || 'ID belum diatur';

      const resolveBrand = (p: any, e?: any): string => {
        const bId = p.hrdEmploymentInfo?.brandId || p.brandId;
        return (bId && brandMap.get(bId)) ||
          p.hrdEmploymentInfo?.brandName || p.brandName || p.companyName || p.company ||
          e?.brandName || e?.company || '-';
      };

      const resolveDivision = (p: any, e?: any): string =>
        p.hrdEmploymentInfo?.divisionName || p.hrdEmploymentInfo?.divisi ||
        p.divisionName || p.division ||
        e?.divisionName || e?.division || e?.divisi || '-';

      const resolvedName = resolveName(profile, eventData);
      const resolvedEmployeeNumber = resolveEmployeeNumber(profile, eventData);
      const resolvedBrand = resolveBrand(profile, eventData);
      const resolvedDivision = resolveDivision(profile, eventData);

      const tapInTimestamp = checkInEvent ? getEventTimestamp(checkInEvent) : null;
      const tapOutTimestamp = checkOutEvent ? getEventTimestamp(checkOutEvent) : null;

      const isInvalid = !!(checkInEvent?.isInvalid || checkOutEvent?.isInvalid);

      // Check leave
      const isOnLeave = leaveRequests?.some((req: any) => {
        if (req.employeeId !== profileUid) return false;
        if (!date) return false;
        const selectedDateTime = startOfDay(date).getTime();
        const reqStart = startOfDay(req.startDate.toDate()).getTime();
        const reqEnd = endOfDay(req.endDate.toDate()).getTime();
        return selectedDateTime >= reqStart && selectedDateTime <= reqEnd;
      }) ?? false;

      // Status
      let status: string;
      if (isInvalid) {
        status = 'Tidak Valid';
      } else if (isOnLeave) {
        status = 'Cuti Tahunan';
      } else if (tapInTimestamp && tapOutTimestamp) {
        status = 'Selesai';
      } else if (tapInTimestamp && !tapOutTimestamp) {
        status = 'Sedang Bekerja';
      } else {
        status = 'Belum Tap In';
      }

      // Late calculation
      let lateMinutes: number | null = null;
      if (tapInTimestamp && activeSite) {
        const shiftStart = new Date(tapInTimestamp);
        const [startHour, startMinute] = (activeSite.shift?.startTime || '09:00').split(':').map(Number);
        const graceMins = activeSite.shift?.graceLateMinutes || 0;
        shiftStart.setHours(startHour, startMinute + graceMins, 0, 0);
        if (tapInTimestamp > shiftStart) {
          lateMinutes = differenceInMinutes(tapInTimestamp, shiftStart);
        }
      } else if (tapInTimestamp) {
        // Default 09:00 with 0 grace
        const shiftStart = new Date(tapInTimestamp);
        shiftStart.setHours(9, 0, 0, 0);
        if (tapInTimestamp > shiftStart) {
          lateMinutes = differenceInMinutes(tapInTimestamp, shiftStart);
        }
      }

      // Early leave calculation
      let earlyLeaveMinutes: number | null = null;
      if (tapOutTimestamp && activeSite) {
        const shiftEnd = new Date(tapOutTimestamp);
        const [endHour, endMinute] = (activeSite.shift?.endTime || '17:00').split(':').map(Number);
        shiftEnd.setHours(endHour, endMinute, 0, 0);
        if (tapOutTimestamp < shiftEnd) {
          earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTimestamp);
        }
      } else if (tapOutTimestamp) {
        const shiftEnd = new Date(tapOutTimestamp);
        shiftEnd.setHours(17, 0, 0, 0);
        if (tapOutTimestamp < shiftEnd) {
          earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTimestamp);
        }
      }

      // Work duration
      let workDurationMinutes: number | null = null;
      if (tapInTimestamp && tapOutTimestamp) {
        workDurationMinutes = differenceInMinutes(tapOutTimestamp, tapInTimestamp);
      }

      rows.push({
        id: profileUid,
        name: resolvedName,
        employeeNumber: resolvedEmployeeNumber,
        brandId,
        brandName: resolvedBrand,
        divisionName: resolvedDivision,
        attendanceMethod: 'web_absen',
        tapIn: safeFormatTime(tapInTimestamp),
        tapOut: safeFormatTime(tapOutTimestamp),
        tapInId: checkInEvent?.id || null,
        tapOutId: checkOutEvent?.id || null,
        status,
        mode: ((checkInEvent as any)?.mode as string)?.toLowerCase() === 'offsite' ? 'offsite' : '-',
        photoUrl: resolvePhotoUrl(checkInEvent) || resolvePhotoUrl(checkOutEvent),
        address: resolveAddress(checkInEvent) || resolveAddress(checkOutEvent),
        location: (checkInEvent as any)?.location || null,
        lateMinutes,
        earlyLeaveMinutes,
        workDurationMinutes,
        isInvalid,
        isOnLeave,
        rawEvent: checkInEvent || checkOutEvent,
      });
    }

    const stats = {
      total: rows.length,
      hadir: rows.filter(r => r.status === 'Selesai' || r.status === 'Sedang Bekerja').length,
      belumTapIn: rows.filter(r => r.status === 'Belum Tap In').length,
      sedangBekerja: rows.filter(r => r.status === 'Sedang Bekerja').length,
      selesai: rows.filter(r => r.status === 'Selesai').length,
      terlambat: rows.filter(r => r.lateMinutes !== null && r.lateMinutes > 0).length,
      tidakValid: rows.filter(r => r.isInvalid).length,
      perluReview: rows.filter(isPerluReview).length,
    };

    return { tableData: rows, summaryStats: stats, brandOptions: uniqueBrandIds };
  }, [allEmployeeProfiles, attendanceEvents, sites, brands, brandFilter, date, leaveRequests]);

  // Apply tab + search filter
  const filteredRows = useMemo(() => {
    return tableData.filter(row => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = row.name.toLowerCase().includes(q) ||
          row.employeeNumber.toLowerCase().includes(q) ||
          row.brandName.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Status tab filter
      switch (statusTab) {
        case 'belum-tap-in': return row.status === 'Belum Tap In';
        case 'sedang-bekerja': return row.status === 'Sedang Bekerja';
        case 'selesai': return row.status === 'Selesai';
        case 'terlambat': return row.lateMinutes !== null && row.lateMinutes > 0;
        case 'tidak-valid': return row.isInvalid;
        case 'perlu-review': return isPerluReview(row);
        default: return true;
      }
    });
  }, [tableData, statusTab, searchQuery]);

  const handleMarkInvalid = async (attendanceUid: string, reason: string, note: string) => {
    if (!firestore || !userProfile) throw new Error('Tidak terautentikasi');
    const attendanceRef = doc(firestore, 'attendance_events', attendanceUid);
    await setDocumentNonBlocking(
      attendanceRef,
      {
        isInvalid: true,
        invalidatedAt: serverTimestamp(),
        invalidatedByUid: userProfile.uid,
        invalidatedByName: userProfile.displayName || userProfile.email,
        invalidReason: reason,
        invalidNote: note,
        payrollExcluded: true,
        status: 'invalid',
      },
      { merge: true }
    );
    mutateEvents();
  };

  const handleOpenDetail = (row: AttendanceRecord) => {
    setSelectedRecord(row);
    setIsDetailModalOpen(true);
  };

  const handleOpenMarkInvalid = (row: AttendanceRecord) => {
    setRecordToMarkInvalid({
      id: row.tapInId || row.tapOutId || row.id,
      name: row.name,
      tapIn: row.tapIn,
      employeeNumber: row.employeeNumber,
    });
    setIsMarkInvalidDialogOpen(true);
  };

  const statusBadgeClass = (row: AttendanceRecord) => {
    if (row.isInvalid) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 font-semibold';
    switch (row.status) {
      case 'Sedang Bekerja': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 font-semibold';
      case 'Selesai': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Belum Tap In': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'Cuti Tahunan': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300';
    }
  };

  const tabCountMap: Record<StatusTabKey, number> = {
    all: tableData.length,
    'belum-tap-in': summaryStats.belumTapIn,
    'sedang-bekerja': summaryStats.sedangBekerja,
    selesai: summaryStats.selesai,
    terlambat: summaryStats.terlambat,
    'tidak-valid': summaryStats.tidakValid,
    'perlu-review': summaryStats.perluReview,
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Cari nama, ID, atau brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <GoogleDatePicker value={date} onChange={setDate} />
          <Select value={brandFilter} onValueChange={setBrandFilter} disabled={isLoadingBrands}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Semua Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Brand</SelectItem>
              {brands?.filter(b => brandOptions.includes(b.id!)).map(brand => (
                <SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? <MonitoringSkeleton /> : (
        <>
          {/* Summary Cards */}
          <AttendanceSummaryCard stats={summaryStats} />

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map(tab => {
              const count = tabCountMap[tab.key];
              const isActive = statusTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <span className="font-semibold">Monitoring ini hanya menampilkan karyawan dengan metode Web Absen.</span>{' '}
              Menampilkan {tableData.length} karyawan, {filteredRows.length} sesuai filter.
            </p>
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11 px-4">Karyawan</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11">Brand / Divisi</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11">Metode</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11">Tap In</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11">Tap Out</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11">Status</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11">Flags</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-11 pr-4">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length > 0 ? filteredRows.map((row, idx) => (
                  <TableRow
                    key={`${row.id}-${idx}`}
                    className={`border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      row.isInvalid ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Karyawan */}
                    <TableCell className="px-4 py-3">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">{row.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{row.employeeNumber}</p>
                    </TableCell>

                    {/* Brand / Divisi */}
                    <TableCell className="py-3">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{row.brandName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{row.divisionName}</p>
                    </TableCell>

                    {/* Metode */}
                    <TableCell className="py-3">
                      <Badge variant="secondary" className="text-xs">Web Absen</Badge>
                    </TableCell>

                    {/* Tap In */}
                    <TableCell className="py-3 text-sm text-slate-700 dark:text-slate-200 tabular-nums">
                      {row.tapIn !== '-' ? (
                        <span className="font-medium">{row.tapIn}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Tap Out */}
                    <TableCell className="py-3 text-sm text-slate-700 dark:text-slate-200 tabular-nums">
                      {row.tapOut !== '-' ? (
                        <span className="font-medium">{row.tapOut}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      <Badge className={statusBadgeClass(row)}>
                        {row.isInvalid ? 'Tidak Valid' : row.status}
                      </Badge>
                    </TableCell>

                    {/* Flags */}
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.lateMinutes !== null && row.lateMinutes > 0 && (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
                            Terlambat {row.lateMinutes}m
                          </Badge>
                        )}
                        {row.earlyLeaveMinutes !== null && row.earlyLeaveMinutes > 0 && (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                            Pulang Awal {row.earlyLeaveMinutes}m
                          </Badge>
                        )}
                        {row.isOnLeave && (
                          <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                            Cuti
                          </Badge>
                        )}
                        {row.mode === 'offsite' && (
                          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
                            Offsite
                          </Badge>
                        )}
                        {!row.lateMinutes && !row.earlyLeaveMinutes && !row.isOnLeave && row.mode !== 'offsite' && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Aksi */}
                    <TableCell className="py-3 text-right pr-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleOpenDetail(row)}
                      >
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-slate-600 dark:text-slate-400">
                      {statusTab !== 'all'
                        ? `Tidak ada karyawan dengan filter "${STATUS_TABS.find(t => t.key === statusTab)?.label}".`
                        : brandFilter !== 'all'
                        ? 'Tidak ada karyawan Web Absen di brand yang dipilih.'
                        : 'Belum ada karyawan dengan metode Web Absen.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={async () => {
          const { tapInId, tapOutId } = eventsToDelete;
          if (!tapInId && !tapOutId) return;
          try {
            const promises: Promise<any>[] = [];
            if (tapInId) promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapInId)));
            if (tapOutId) promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapOutId)));
            await Promise.all(promises);
            toast({ title: 'Absensi Dibatalkan', description: `Catatan absensi untuk ${eventsToDelete.userName} telah dihapus.` });
            mutateEvents();
          } catch (error: any) {
            toast({ variant: 'destructive', title: 'Gagal Membatalkan', description: error.message || 'Terjadi kesalahan pada server.' });
          } finally {
            setIsDeleteConfirmOpen(false);
          }
        }}
        itemName={`catatan absensi untuk ${eventsToDelete.userName}`}
        itemType=""
      />

      <AttendanceDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => { setIsDetailModalOpen(false); setSelectedRecord(null); }}
        record={selectedRecord}
        onMarkInvalid={selectedRecord && (selectedRecord.tapInId || selectedRecord.tapOutId) && !selectedRecord.isInvalid
          ? () => handleOpenMarkInvalid(selectedRecord)
          : undefined
        }
      />

      <MarkAttendanceInvalidDialog
        open={isMarkInvalidDialogOpen}
        onOpenChange={setIsMarkInvalidDialogOpen}
        attendanceRecord={recordToMarkInvalid}
        onConfirm={handleMarkInvalid}
      />
    </div>
  );
}
