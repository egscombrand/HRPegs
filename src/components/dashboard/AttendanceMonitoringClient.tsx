'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, type Timestamp, serverTimestamp } from 'firebase/firestore';
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
import { XCircle, Search, Eye, Camera, RefreshCw } from 'lucide-react';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { AttendanceSyncDialog } from './AttendanceSyncDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AttendanceDetailModal } from './AttendanceDetailModal';
import { getAttendanceImageUrl } from '@/lib/google-drive-image';
import { extractProfileSyncData } from '@/lib/attendance-sync';
import {
  resolveProfileUid,
  resolveEventUid,
  isCheckInEvent,
  isCheckOutEvent,
  resolvePhotoUrl,
  resolveAddress,
  resolveCoordinates,
  formatTime,
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  determineStatus,
  getEventTimestamp,
} from '@/lib/attendance-helpers';

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
  status: 'Sedang Bekerja' | 'Selesai' | 'Belum Tap In' | 'Cuti Tahunan' | 'Fingerprint' | 'Metode Belum Diatur' | 'Terlambat' | 'Offsite';
  mode: 'onsite' | 'offsite' | '-';
  photoUrl?: string | null;
  address: string;
  location: { lat: number; lng: number } | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  rawEvent?: any; // Original event data for accessing drive info
  profileComplete: boolean; // Whether employee profile has complete data
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null, tapOutId: string | null, userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [recordToSync, setRecordToSync] = useState<any>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  // Helper: Resolve profile UID dengan fallback logic (backward compat)
  const getProfileUid = (profile: any): string | null => {
    return resolveProfileUid(profile);
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
    // Query by datetime.date field (format: YYYY-MM-DD)
    const selectedDateString = format(date, 'yyyy-MM-dd');
    return query(
      collection(firestore, 'attendance_events'),
      where('datetime.date', '==', selectedDateString)
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

  // Helper: resolve name from profile with comprehensive fallback
  const resolveName = (profile: any): string => {
    // Priority order: fullName variants
    if (profile.fullName) return profile.fullName;
    if (profile.dataDiriIdentitas?.fullName) return profile.dataDiriIdentitas.fullName;

    // Check alternative naming fields
    if (profile.namaLengkap) return profile.namaLengkap;
    if (profile.displayName) return profile.displayName;
    if (profile.name) return profile.name;

    // Last resort: use email or employeeNumber
    if (profile.email) return profile.email;
    if (profile.employeeNumber) return `ID: ${profile.employeeNumber}`;
    if (profile.employeeId) return `ID: ${profile.employeeId}`;

    // Only if completely empty, indicate need for profile sync
    return 'Profil tidak ditemukan';
  };

  // Helper: check if profile has complete data
  const hasCompleteProfile = (profile: any): boolean => {
    const hasName = profile.fullName ||
                   profile.dataDiriIdentitas?.fullName ||
                   profile.namaLengkap ||
                   profile.displayName ||
                   profile.name;
    const hasEmployeeId = profile.employeeNumber ||
                         profile.employeeId ||
                         profile.employeeCode;
    return !!(hasName && hasEmployeeId);
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

    // Safe format time helper
    const safeFormatTime = (timestamp: Date | null): string => {
      if (!timestamp) return '-';
      try {
        if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
          return '-';
        }
        return format(timestamp, 'HH:mm');
      } catch {
        return '-';
      }
    };

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

    // Debug: collect matching stats
    const debugMatchStats: any[] = [];

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

      // Join with attendance events - using robust UID matching
      const userEvents = attendanceEvents?.filter((e: any) => {
        const eventUid = resolveEventUid(e);
        if (!eventUid || !profileUid) return false;
        return eventUid === profileUid;
      }) || [];

      // Find check-in and check-out events using robust type detection
      const checkInEvent = userEvents.find((e: any) => isCheckInEvent(e.type));
      const checkOutEvent = userEvents.find((e: any) => isCheckOutEvent(e.type));

      // Debug: log for first few matches
      if (debugMatchStats.length < 3) {
        debugMatchStats.push({
          name: resolvedName,
          profileUid,
          allEventsCount: attendanceEvents?.length || 0,
          userEventsCount: userEvents.length,
          checkInFound: !!checkInEvent,
          checkOutFound: !!checkOutEvent,
          checkInType: checkInEvent?.type,
          checkOutType: checkOutEvent?.type,
          sampleEventUids: attendanceEvents?.slice(0, 3).map(e => ({
            uid: resolveEventUid(e),
            type: e.type,
            timestamp: e.tsServer || e.createdAt,
          })),
        });
      }

      const tapInTimestamp = checkInEvent ? getEventTimestamp(checkInEvent) : null;
      const tapOutTimestamp = checkOutEvent ? getEventTimestamp(checkOutEvent) : null;

      // Extract photo URL and address from events (priority: check-in, then check-out)
      const photoUrl = resolvePhotoUrl(checkInEvent) || resolvePhotoUrl(checkOutEvent);
      const eventAddress = resolveAddress(checkInEvent) || resolveAddress(checkOutEvent);

      // Keep old variable names for backward compatibility with rest of code
      const tapIn = checkInEvent;
      const tapOut = checkOutEvent;

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
        status = 'ID Card';
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
          const shiftStart = new Date(tapInTimestamp);
          const [startHour, startMinute] = activeSite.shift.startTime.split(':').map(Number);
          shiftStart.setHours(startHour, startMinute + activeSite.shift.graceLateMinutes, 0, 0);

          if (tapInTimestamp > shiftStart) {
            lateMinutes = differenceInMinutes(tapInTimestamp, shiftStart);
            summary.terlambat++;
          }
        }
      }

      if (tapOut && tapOutTimestamp && activeSite) {
        const shiftEnd = new Date(tapOutTimestamp);
        const [endHour, endMinute] = activeSite.shift.endTime.split(':').map(Number);
        shiftEnd.setHours(endHour, endMinute, 0, 0);
        if (tapOutTimestamp < shiftEnd) {
          earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTimestamp);
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
        tapIn: safeFormatTime(tapInTimestamp),
        tapOut: safeFormatTime(tapOutTimestamp),
        tapInId: tapIn?.id || null,
        tapOutId: tapOut?.id || null,
        status: status,
        mode: ((tapIn?.mode as string)?.toLowerCase() || '-') as AttendanceRecord['mode'],
        photoUrl: photoUrl,
        address: eventAddress,
        location: tapIn?.location || null,
        lateMinutes,
        earlyLeaveMinutes,
        rawEvent: checkInEvent || checkOutEvent, // Store original event for getting best image URL
        profileComplete: hasCompleteProfile(profile), // Track whether profile has complete data
      };
    });

    const filteredTableData = processedData.filter(row => {
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchSearch =
          row.name.toLowerCase().includes(query) ||
          row.employeeNumber.toLowerCase().includes(query) ||
          row.brandName.toLowerCase().includes(query);
        if (!matchSearch) return false;
      }

      // Apply status filter
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
    const sampleEvent = attendanceEvents?.[0];
    const sampleEventUid = sampleEvent ? resolveEventUid(sampleEvent) : null;

    console.log({
      module: "monitoring-absen-hrd",
      selectedDate: date ? format(date, 'yyyy-MM-dd') : null,
      employeeProfilesCount: employeeProfiles?.length || 0,
      webAbsenProfilesCount: webAbsenProfiles?.length || 0,
      relevantProfilesCount: relevantProfiles.length,
      attendanceEventsCount: attendanceEvents?.length || 0,
      processedDataCount: processedData.length,
      filteredTableDataCount: filteredTableData.length,
      matchStats: debugMatchStats,
      sampleProfile: sampleProfile ? {
        name: resolveName(sampleProfile),
        uid: resolveProfileUid(sampleProfile),
        attendanceMethod: resolveAttendanceMethod(sampleProfile),
        brand: resolveBrandName(sampleProfile, brandMap),
        employeeNumber: resolveEmployeeNumber(sampleProfile),
      } : null,
      sampleEvent: sampleEvent ? {
        uid: sampleEventUid,
        type: sampleEvent.type,
        tsClient: sampleEvent.tsClient ? 'exists' : 'null',
        tsServer: sampleEvent.tsServer ? 'exists' : 'null',
        datetimeIso: (sampleEvent as any).datetime?.iso ? 'exists' : 'null',
        datetimeDate: (sampleEvent as any).datetime?.date ? (sampleEvent as any).datetime.date : 'null',
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
  }, [employeeProfiles, attendanceEvents, sites, brands, brandFilter, statusFilter, searchQuery, date, leaveRequests]);

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

  // Handle profile synchronization
  const handleSyncProfile = async (attendanceUid: string, selectedProfileId: string) => {
    if (!firestore || !allEmployeeProfiles) return;

    const selectedProfile = allEmployeeProfiles.find(p => p.id === selectedProfileId);
    if (!selectedProfile) {
      throw new Error('Profile tidak ditemukan');
    }

    try {
      const syncData = extractProfileSyncData(selectedProfile);

      // Update attendance_settings document (using uid as doc id)
      const attendanceSettingsRef = doc(firestore, 'attendance_settings', attendanceUid);
      await setDocumentNonBlocking(
        attendanceSettingsRef,
        {
          ...syncData,
          lastSyncedAt: serverTimestamp(),
          syncStatus: 'synced',
        },
        { merge: true }
      );

      toast({
        title: 'Sinkronisasi Berhasil',
        description: `Profil ${selectedProfile.fullName} telah terhubung.`,
      });

      // Refresh events to update table
      mutateEvents();
    } catch (error: any) {
      console.error('[AttendanceSync] Error:', error);
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="space-y-3">
        {/* Search & Date */}
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
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
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
              <span className="font-semibold">ℹ️ Monitoring ini hanya menampilkan karyawan dengan metode Web Absen.</span> Karyawan ID Card tidak ditampilkan di halaman ini.
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
                      <div className="space-y-1">
                        <p className="font-semibold">{row.name}</p>
                        {!row.profileComplete && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                            Perlu sinkronisasi data
                          </Badge>
                        )}
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
                        {row.attendanceMethod === 'fingerprint' ? 'ID Card' :
                         row.attendanceMethod === 'web_absen' ? 'Web Absen' :
                         'Belum Diatur'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.photoUrl && row.rawEvent ? (
                        <button
                          onClick={() => {
                            setSelectedRecord(row);
                            setIsDetailModalOpen(true);
                          }}
                          className="relative group"
                          title="Klik untuk melihat bukti absensi"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.photoUrl}
                            alt="Bukti selfie"
                            className="h-12 w-12 rounded object-cover bg-slate-200 dark:bg-slate-700"
                            onError={(e) => {
                              // On error, show camera icon instead
                              e.currentTarget.style.display = 'none';
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.classList.add('flex', 'items-center', 'justify-center');
                                const icon = document.createElement('div');
                                icon.className = 'h-5 w-5 text-slate-400';
                                icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';
                                parent.appendChild(icon);
                              }
                            }}
                          />
                          {/* Overlay icon mata saat hover */}
                          <div className="absolute inset-0 flex items-center justify-center rounded bg-black/0 group-hover:bg-black/40 transition-colors">
                            <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedRecord(row);
                            setIsDetailModalOpen(true);
                          }}
                          className="h-12 w-12 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
                          title="Foto tersedia - klik untuk melihat"
                        >
                          <Camera className="h-5 w-5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                        </button>
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
                      <Badge className={
                        row.status === 'Sedang Bekerja'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 font-semibold'
                          : row.status === 'Selesai'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : row.status === 'Belum Tap In'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : row.status === 'Cuti Tahunan'
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
                          : row.status === 'ID Card'
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
                      }>
                        {row.status}
                        {row.lateMinutes && row.lateMinutes > 0 && ' ⚠️'}
                        {row.mode === 'offsite' && ' 📍'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.lateMinutes !== null && row.lateMinutes > 0 && (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            Terlambat {row.lateMinutes}m
                          </Badge>
                        )}
                        {row.earlyLeaveMinutes !== null && row.earlyLeaveMinutes > 0 && (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                            Pulang Awal {row.earlyLeaveMinutes}m
                          </Badge>
                        )}
                        {(!row.lateMinutes || row.lateMinutes <= 0) && (!row.earlyLeaveMinutes || row.earlyLeaveMinutes <= 0) && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.name === 'Profil tidak ditemukan' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            onClick={() => {
                              setRecordToSync(row);
                              setIsSyncDialogOpen(true);
                            }}
                            title="Sinkronkan profil karyawan"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Sinkronkan
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => {
                                setSelectedRecord(row);
                                setIsDetailModalOpen(true);
                              }}
                              title="Lihat detail absensi"
                            >
                              Detail
                            </Button>
                            {row.tapInId || row.tapOutId ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCancelClick(row)}
                                title="Batalkan absensi"
                                className="h-9 w-9"
                              >
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
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

      {/* Detail Modal */}
      <AttendanceDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedRecord(null);
        }}
        record={selectedRecord}
      />

      {/* Sync Dialog */}
      <AttendanceSyncDialog
        open={isSyncDialogOpen}
        onOpenChange={setIsSyncDialogOpen}
        attendanceRecord={recordToSync}
        employeeProfiles={allEmployeeProfiles || []}
        onSync={handleSyncProfile}
      />
    </div>
  );
}
