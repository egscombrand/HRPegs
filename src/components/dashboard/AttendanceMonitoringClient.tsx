'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, type Timestamp } from 'firebase/firestore';
import type { Brand, EmployeeProfile, AttendanceEvent } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { getInitials } from '@/lib/utils';
import { normalizeGoogleDriveImageUrl } from '@/lib/profile-photo';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface AttendanceRecord {
  id: string; // uid
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
  status: 'Sedang Bekerja' | 'Selesai' | 'Belum Tap In' | 'Cuti Tahunan' | 'Fingerprint' | 'Metode Belum Diatur';
  mode: 'onsite' | 'offsite' | '-';
  photoUrl?: string | null;
  address: string;
  location: { lat: number; lng: number } | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
}

const kpiCardsData = [
  { title: "Hadir", value: 0 },
  { title: "Belum Tap In", value: 0 },
  { title: "Offsite", value: 0 },
  { title: "Anomali", value: 0 },
  { title: "Terlambat", value: 0 },
];

function MonitoringSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export function AttendanceMonitoringClient() {
  const [date, setDate] = useState<Date | null>(new Date());
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null, tapOutId: string | null, userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });
  const firestore = useFirestore();
  const { toast } = useToast();

  // Helper: Resolve profile UID dengan fallback logic
  const getProfileUid = (profile: any): string | null => {
    return (
      profile.uid ||
      profile.userId ||
      profile.authUid ||
      profile.employeeUid ||
      profile.id ||
      profile.__id ||
      profile.docId ||
      null
    );
  };

  // Helper: Resolve event UID dengan fallback logic
  const getEventUid = (event: any): string | null => {
    return (
      event.uid ||
      event.userId ||
      event.employeeUid ||
      event.authUid ||
      null
    );
  };

  // --- Data Fetching ---
  const { data: sites, isLoading: isLoadingConfig } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, 'attendance_sites'), [firestore])
  );

  // Query employee_profiles (single source of truth) - ambil semua, filter di client
  const { data: allEmployeeProfiles, isLoading: isLoadingProfiles } = useCollection<EmployeeProfile>(
    useMemoFirebase(() =>
      collection(firestore, 'employee_profiles'),
      [firestore]
    )
  );

  // Filter client-side dengan fallback logic untuk inconsistent fields
  const employeeProfiles = useMemo(() => {
    if (!allEmployeeProfiles) return null;

    return allEmployeeProfiles
      .filter((profile: any) => {
        // CRITICAL: Must have valid UID
        const profileUid = getProfileUid(profile);
        if (!profileUid) {
          console.warn("[Monitoring Absen] Profile tanpa uid:", profile);
          return false;
        }

        // Fallback logic untuk isActive
        const isActive = profile.isActive !== false;

        // Fallback logic untuk status
        const status = profile.status || profile.employmentStatus || '';
        const isNotInactive = status !== 'inactive' && status !== 'nonaktif' && status !== 'Nonaktif';

        // Fallback logic untuk role - jangan include kandidat
        const role = profile.role || '';
        const isNotCandidate = role !== 'candidate' && role !== 'kandidat';

        return isActive && isNotInactive && isNotCandidate;
      });
  }, [allEmployeeProfiles]);

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const eventsQuery = useMemoFirebase(() => {
    if (!date) return null;
    const start = startOfDay(date);
    const end = endOfDay(date);
    return query(
      collection(firestore, 'attendance_events'),
      where('tsServer', '>=', start),
      where('tsServer', '<=', end)
    );
  }, [firestore, date]);
  const { data: attendanceEvents, isLoading: isLoadingEvents, mutate: mutateEvents } = useCollection<AttendanceEvent>(eventsQuery);

  // Query active/approved leaves
  const leavesQuery = useMemoFirebase(() => {
    return query(
      collection(firestore, 'leave_requests'),
      where('status', 'in', ['approved', 'active_leave'])
    );
  }, [firestore]);
  const { data: leaveRequests, isLoading: isLoadingLeaves } = useCollection<any>(leavesQuery);

  const isLoading = isLoadingConfig || isLoadingProfiles || isLoadingBrands || isLoadingEvents || isLoadingLeaves;

  // Helper: resolve name from profile
  const resolveName = (profile: any): string => {
    return profile.fullName ||
           profile.dataDiriIdentitas?.fullName ||
           profile.name ||
           'Tidak Diketahui';
  };

  // Helper: resolve employee number
  const resolveEmployeeNumber = (profile: any): string => {
    return profile.hrdEmploymentInfo?.employeeId ||
           profile.employeeNumber ||
           profile.employeeId ||
           profile.employeeCode ||
           profile.nomorIndukKaryawan ||
           profile.nomorInduk ||
           profile.nip ||
           'ID belum diatur';
  };

  // Helper: resolve brand/PT
  const resolveBrandName = (profile: any, brandMap: Map<string, string>): string => {
    const brandId = profile.hrdEmploymentInfo?.brandId || profile.brandId;
    if (brandId) {
      return brandMap.get(brandId) ||
             profile.hrdEmploymentInfo?.brandName ||
             profile.brandName ||
             profile.companyName ||
             profile.company ||
             profile.brand ||
             '-';
    }
    return profile.hrdEmploymentInfo?.brandName ||
           profile.brandName ||
           profile.companyName ||
           profile.company ||
           profile.brand ||
           '-';
  };

  // Helper: resolve division
  const resolveDivisionName = (profile: any): string => {
    return profile.hrdEmploymentInfo?.divisionName ||
           profile.hrdEmploymentInfo?.divisi ||
           profile.divisionName ||
           profile.division ||
           '-';
  };

  // Helper: resolve attendance method
  const resolveAttendanceMethod = (profile: any): 'fingerprint' | 'web_absen' | 'not_set' => {
    const method = profile.attendanceMethod || profile.hrdEmploymentInfo?.attendanceMethod;
    if (method === 'fingerprint' || method === 'web_absen') {
      return method as 'fingerprint' | 'web_absen';
    }
    return 'not_set';
  };

  // --- Data Processing ---
  const { tableData, summaryData, uniqueBrands } = useMemo(() => {
    if (!employeeProfiles || !attendanceEvents || !sites || !brands) {
      const defaultSummary = kpiCardsData.map(c => ({ title: c.title, value: 0 }));
      return { tableData: [], summaryData: defaultSummary, uniqueBrands: new Set<string>() };
    }

    const getTimestamp = (event: any): Timestamp | undefined => event.tsServer || event.timestamp || event.ts || event.createdAt;
    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const activeSite = sites.find(s => s.isActive);

    // CRITICAL: Filter hanya Web Absen karyawan
    const webAbsenProfiles = employeeProfiles.filter((profile: any) => {
      const attendanceMethod = resolveAttendanceMethod(profile);
      return attendanceMethod === 'web_absen';
    });

    // Collect unique brand IDs from Web Absen profiles for filter dropdown
    const uniqueBrandIds = new Set<string>();
    webAbsenProfiles.forEach((profile: any) => {
      const brandId = profile.hrdEmploymentInfo?.brandId || profile.brandId;
      if (brandId && typeof brandId === 'string') {
        uniqueBrandIds.add(brandId);
      }
    });

    // 1. Filter profiles by brand (dari web_absen profiles saja)
    const relevantProfiles = brandFilter === 'all'
      ? webAbsenProfiles
      : webAbsenProfiles.filter((profile: any) => {
        const brandId = profile.hrdEmploymentInfo?.brandId || profile.brandId;
        return brandId === brandFilter;
      });

    const summary = { hadir: 0, offsite: 0, anomali: 0, terlambat: 0, belumTapIn: 0, cuti: 0, fingerprint: 0, notSet: 0 };

    // Deduplicate by uid to avoid duplicate rows
    const seenUids = new Set<string>();

    const processedData = relevantProfiles
      .filter((profile: any) => {
        const profileUid = getProfileUid(profile);
        if (!profileUid) {
          console.warn("[Monitoring Absen] Profile tanpa uid saat build processedData:", profile);
          return false;
        }
        if (seenUids.has(profileUid)) {
          console.warn(`[Monitoring Absen] Duplicate uid: ${profileUid} (${resolveName(profile)})`);
          return false;
        }
        seenUids.add(profileUid);
        return true;
      })
      .map((profile: any) => {
      const profileUid = getProfileUid(profile)!;
      const resolvedName = resolveName(profile);
      const resolvedEmployeeNumber = resolveEmployeeNumber(profile);
      const resolvedBrand = resolveBrandName(profile, brandMap);
      const resolvedBrandId = profile.hrdEmploymentInfo?.brandId || profile.brandId;
      const resolvedDivision = resolveDivisionName(profile);
      const attendanceMethod = resolveAttendanceMethod(profile);

      // Join with attendance events
      const userEvents = attendanceEvents.filter(e => {
        const eventUid = getEventUid(e);
        return eventUid === profileUid || e.userId === profileUid || e.uid === profileUid;
      });
      const tapIn = userEvents.find(e => e.type === 'tap_in' || e.type === 'IN');
      const tapOut = userEvents.find(e => e.type === 'tap_out' || e.type === 'OUT');

      const tapInTimestamp = tapIn ? getTimestamp(tapIn) : null;
      const tapOutTimestamp = tapOut ? getTimestamp(tapOut) : null;

      // Check if user is on approved leave today
      const isOnLeaveToday = leaveRequests?.some(req => {
        if (req.employeeId !== profileUid) return false;
        if (!date) return false;

        const selectedDateTime = startOfDay(date).getTime();
        const reqStart = startOfDay(req.startDate.toDate()).getTime();
        const reqEnd = endOfDay(req.endDate.toDate()).getTime();

        return selectedDateTime >= reqStart && selectedDateTime <= reqEnd;
      });

      // Status logic based on attendance method
      // Prioritas: cuti > ada attendance event > metode absensi
      let status: AttendanceRecord['status'] = 'Belum Tap In';

      if (isOnLeaveToday) {
        status = 'Cuti Tahunan';
        summary.cuti++;
      } else if (attendanceMethod === 'not_set') {
        status = 'Metode Belum Diatur';
        summary.notSet++;
      } else if (tapIn && !tapOut) {
        status = 'Sedang Bekerja';
        summary.hadir++;
      } else if (tapIn && tapOut) {
        status = 'Selesai';
        summary.hadir++;
      } else if (attendanceMethod === 'fingerprint' && !tapIn) {
        status = 'Fingerprint';
        summary.fingerprint++;
      } else if (attendanceMethod === 'web_absen' && !tapIn) {
        status = 'Belum Tap In';
        summary.belumTapIn++;
      }

      let lateMinutes: number | null = null;
      let earlyLeaveMinutes: number | null = null;

      if (tapIn && tapInTimestamp) {
        const modeString = (tapIn.mode as string)?.toLowerCase();
        if (modeString === 'offsite') {
          summary.offsite++;
        }

        if (activeSite) {
          const tapInTime = tapInTimestamp.toDate();
          const shiftStart = new Date(tapInTime);
          const [startHour, startMinute] = activeSite.shift.startTime.split(':').map(Number);
          shiftStart.setHours(startHour, startMinute + activeSite.shift.graceLateMinutes, 0, 0);

          if (tapInTime > shiftStart) {
            lateMinutes = differenceInMinutes(tapInTime, shiftStart);
            summary.terlambat++;
          }
        }
      }

      if (tapOut && tapOutTimestamp && activeSite) {
        const tapOutTime = tapOutTimestamp.toDate();
        const shiftEnd = new Date(tapOutTime);
        const [endHour, endMinute] = activeSite.shift.endTime.split(':').map(Number);
        shiftEnd.setHours(endHour, endMinute, 0, 0);
        if (tapOutTime < shiftEnd) {
          earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTime);
        }
      }

      return {
        id: profileUid,
        name: resolvedName,
        employeeNumber: resolvedEmployeeNumber,
        brandId: resolvedBrandId,
        brandName: resolvedBrand,
        divisionName: resolvedDivision,
        attendanceMethod,
        tapIn: tapInTimestamp ? format(tapInTimestamp.toDate(), 'HH:mm') : '-',
        tapOut: tapOutTimestamp ? format(tapOutTimestamp.toDate(), 'HH:mm') : '-',
        tapInId: tapIn?.id || null,
        tapOutId: tapOut?.id || null,
        status: status,
        mode: ((tapIn?.mode as string)?.toLowerCase() || '-') as AttendanceRecord['mode'],
        photoUrl: tapIn?.photoUrl,
        address: tapIn?.address || '-',
        location: tapIn?.location || null,
        lateMinutes,
        earlyLeaveMinutes,
      };
    });

    const filteredTableData = processedData.filter(row => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'present') return row.status === 'Sedang Bekerja' || row.status === 'Selesai';
      if (statusFilter === 'absent') return row.status === 'Belum Tap In';
      if (statusFilter === 'leave') return row.status === 'Cuti Tahunan';
      if (statusFilter === 'late') return row.lateMinutes !== null && row.lateMinutes > 0;
      if (statusFilter === 'offsite') return row.mode === 'offsite';
      return false;
    });

    // Debug log - after all data is defined
    const sampleProfile = employeeProfiles?.[0];
    const sampleProfileUid = sampleProfile ? getProfileUid(sampleProfile) : null;
    const sampleEvent = attendanceEvents?.[0];
    const sampleEventUid = sampleEvent ? getEventUid(sampleEvent) : null;

    console.log({
      module: "monitoring-absen-hrd",
      allEmployeeProfilesCount: allEmployeeProfiles?.length || 0,
      filteredEmployeeProfilesCount: employeeProfiles?.length || 0,
      relevantProfilesCount: relevantProfiles.length,
      processedDataCount: processedData.length,
      filteredTableDataCount: filteredTableData.length,
      attendanceEventsCount: attendanceEvents?.length || 0,
      selectedDate: date ? format(date, 'yyyy-MM-dd') : null,
      activeSite: activeSite?.name,
      brandFilter,
      statusFilter,
      sampleProfile: sampleProfile ? {
        name: resolveName(sampleProfile),
        uid: sampleProfileUid,
        brand: resolveBrandName(sampleProfile, brandMap),
        employeeNumber: resolveEmployeeNumber(sampleProfile),
      } : null,
      sampleEvent: sampleEvent ? {
        uid: sampleEventUid,
        type: sampleEvent.type,
      } : null,
    });

    // Check for duplicate UIDs
    const uidsInProcessedData = processedData.map(r => r.id);
    const duplicateUids = uidsInProcessedData.filter((uid, idx) => uidsInProcessedData.indexOf(uid) !== idx);
    if (duplicateUids.length > 0) {
      console.error('[Monitoring Absen] Duplicate UIDs after processing:', [...new Set(duplicateUids)]);
    }

    return {
      tableData: filteredTableData,
      summaryData: [
        { title: "Hadir", value: summary.hadir },
        { title: "Belum Tap In", value: summary.belumTapIn },
        { title: "Offsite", value: summary.offsite },
        { title: "Cuti Tahunan", value: summary.cuti },
        { title: "Terlambat", value: summary.terlambat },
      ],
      uniqueBrands: uniqueBrandIds,
    };
  }, [employeeProfiles, attendanceEvents, sites, brands, brandFilter, statusFilter, date, leaveRequests]);

  const handleCancelClick = (row: AttendanceRecord) => {
    setEventsToDelete({ tapInId: row.tapInId, tapOutId: row.tapOutId, userName: row.name });
    setIsDeleteConfirmOpen(true);
  };

  const confirmCancelAttendance = async () => {
    const { tapInId, tapOutId } = eventsToDelete;
    if (!tapInId && !tapOutId) return;

    try {
      const promises: Promise<any>[] = [];
      if (tapInId) {
        promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapInId)));
      }
      if (tapOutId) {
        promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapOutId)));
      }

      await Promise.all(promises);

      toast({
        title: 'Absensi Dibatalkan',
        description: `Catatan absensi untuk ${eventsToDelete.userName} telah dihapus.`,
      });
      mutateEvents(); // Re-fetch the events
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Membatalkan',
        description: error.message || 'Terjadi kesalahan pada server.',
      });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  // Get unique brands from employee_profiles
  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    employeeProfiles?.forEach(profile => {
      const brandId = profile.hrdEmploymentInfo?.brandId || profile.brandId;
      if (brandId && typeof brandId === 'string') {
        brands.add(brandId);
      }
    });
    return Array.from(brands);
  }, [employeeProfiles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="present">Hadir</SelectItem>
            <SelectItem value="absent">Belum Tap In</SelectItem>
            <SelectItem value="leave">Cuti Tahunan</SelectItem>
            <SelectItem value="late">Terlambat</SelectItem>
            <SelectItem value="offsite">Offsite</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <MonitoringSkeleton /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {summaryData.map(card => (
              <KpiCard key={card.title} title={card.title} value={card.value} />
            ))}
          </div>

          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <span className="font-semibold">ℹ️ Monitoring ini hanya menampilkan karyawan dengan metode Web Absen.</span> Karyawan Fingerprint tidak ditampilkan di halaman ini.
            </p>
          </div>

          <div className="rounded-lg border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <TableHead className="text-slate-700 dark:text-slate-200">Karyawan</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">ID</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Brand / Divisi</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Metode Absen</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Foto</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Lokasi</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Tap In</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Tap Out</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Status</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-200">Flags</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-200">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.length > 0 ? tableData.map((row, idx) => (
                  <TableRow key={`${row.id}-${idx}`} className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      <div>
                        <p className="font-semibold">{row.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                      {row.employeeNumber}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                      <div>
                        <p className="font-medium">{row.brandName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{row.divisionName}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        row.attendanceMethod === 'fingerprint' ? 'default' :
                        row.attendanceMethod === 'web_absen' ? 'secondary' :
                        'outline'
                      } className={
                        row.attendanceMethod === 'not_set' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : ''
                      }>
                        {row.attendanceMethod === 'fingerprint' ? 'Fingerprint' :
                         row.attendanceMethod === 'web_absen' ? 'Web Absen' :
                         'Belum Diatur'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.photoUrl ? (
                        <Link href={row.photoUrl} target="_blank">
                          <Avatar>
                            <AvatarImage src={normalizeGoogleDriveImageUrl(row.photoUrl)} alt={`Foto ${row.name}`} />
                            <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                          </Avatar>
                        </Link>
                      ) : (
                        <Avatar>
                          <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                        </Avatar>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate text-slate-700 dark:text-slate-200" title={row.address}>
                      {row.location ? (
                        <a href={`https://maps.google.com/?q=${row.location.lat},${row.location.lng}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 dark:text-blue-400">
                          {row.address}
                        </a>
                      ) : row.address}
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{row.tapIn}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{row.tapOut}</TableCell>
                    <TableCell>
                      <Badge variant={
                        row.status === 'Belum Tap In' || row.status === 'Metode Belum Diatur' ? 'secondary' :
                        row.status === 'Cuti Tahunan' ? 'outline' :
                        row.status === 'Fingerprint' ? 'secondary' :
                        'default'
                      } className={
                        row.status === 'Cuti Tahunan' ? 'bg-indigo-500/10 dark:bg-indigo-900/30 border-indigo-500/20 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold' :
                        row.status === 'Metode Belum Diatur' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' :
                        ''
                      }>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.lateMinutes !== null && row.lateMinutes > 0 && <Badge variant="destructive" className="bg-red-600 dark:bg-red-700">⏰ {row.lateMinutes}m</Badge>}
                        {row.earlyLeaveMinutes !== null && row.earlyLeaveMinutes > 0 && <Badge variant="destructive" className="bg-amber-600 dark:bg-amber-700">🚪 Pulang Awal</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleCancelClick(row)} disabled={!row.tapInId && !row.tapOutId} title="Batalkan Absensi">
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-slate-600 dark:text-slate-400">
                      {brandFilter !== 'all'
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
        onConfirm={confirmCancelAttendance}
        itemName={`catatan absensi untuk ${eventsToDelete.userName}`}
        itemType=""
      />
    </div>
  );
}
