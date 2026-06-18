/**
 * Payroll Recap Calculation
 * Source of truth for identity: employee_profiles + users + employees (same as Data Karyawan)
 * Source of truth for attendance: attendance_events only
 */

import {
  startOfMonth, endOfMonth, eachDayOfInterval, isWeekend,
  isWithinInterval, isBefore, isAfter, format, startOfDay, endOfDay,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import type { EmployeeProfile, AttendanceEvent, AttendanceSite } from '@/lib/types';

export type PeriodMode = 'calendar' | 'payroll' | 'custom';

export interface PayrollPeriod {
  mode: PeriodMode;
  startDate: Date;
  endDate: Date;
  displayLabel: string;
}

export interface LateDetail {
  date: string;          // YYYY-MM-DD
  tapInTime: string;     // HH:mm
  lateMinutes: number;
  scheduledStartTime?: string; // HH:mm — derived as tapInTime minus lateMinutes
}

export interface HolidayDetail {
  date: string;
  type: 'national_holiday' | 'collective_leave' | 'company_holiday';
  name: string;
}

export interface AttendanceDetail {
  date: string;          // YYYY-MM-DD
  dayName: string;       // e.g., "Senin"
  tapInTime: string | null;
  tapOutTime: string | null;
  status: 'tepat_waktu' | 'terlambat';
  source: string;        // "Web Absen" | "Manual HRD" | "Sistem"
  notes: string;
  lateMinutes?: number;
  workDurationMinutes?: number;
}

export interface CalendarAttendanceDetail {
  date: string;
  dayName: string;
  status:
    | 'Belum Berjalan'
    | 'Libur Nasional'
    | 'Cuti Bersama'
    | 'Libur Perusahaan'
    | 'Akhir Pekan'
    | 'Tepat Waktu'
    | 'Terlambat'
    | 'Izin'
    | 'Cuti'
    | 'Dinas'
    | 'Dinas + Tepat Waktu'
    | 'Dinas + Terlambat'
    | 'Dinas + Libur Nasional'
    | 'Dinas + Cuti Bersama'
    | 'Dinas + Libur Perusahaan'
    | 'Dinas + Akhir Pekan'
    | 'Dinas + Libur Nasional + Tepat Waktu'
    | 'Dinas + Libur Nasional + Terlambat'
    | 'Dinas + Cuti Bersama + Tepat Waktu'
    | 'Dinas + Cuti Bersama + Terlambat'
    | 'Dinas + Libur Perusahaan + Tepat Waktu'
    | 'Dinas + Libur Perusahaan + Terlambat'
    | 'Dinas + Akhir Pekan + Tepat Waktu'
    | 'Dinas + Akhir Pekan + Terlambat'
    | 'Alpha';
  tapInTime: string | null;
  tapOutTime: string | null;
  keterangan: string;
}

export interface AlphaDetail {
  date: string;          // YYYY-MM-DD
  dayName: string;
  keterangan: string;
}

export interface LeaveDetail {
  date: string;
  type: string;
  formType?: string;
  reasonType?: string;
  keterangan?: string;
  days?: number;
  status: string;
  approvedBy?: string;
  spdNumber?: string;
  // Dinas-specific fields
  missionId?: string;
  missionName?: string;
  destination?: string;
  activity?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface PayrollRecapRow {
  employeeId: string;
  fullName: string;
  employeeNumber: string;
  brandId: string;
  brandName: string;
  divisionId?: string;
  divisionName: string;

  // Attendance stats
  hariKerja: number;
  hadir: number;
  terlambat: number;
  menitTerlambat: number;
  lateDetails: LateDetail[];
  hadirDetails: AttendanceDetail[];   // per-day hadir with in/out times
  alphaDetails: AlphaDetail[];        // per-day alpha dates
  calendarDetails: CalendarAttendanceDetail[];
  pulangAwal: number;
  lupaHapIn: number;
  lupaHapOut: number;

  // Leave stats (sakit included in izin)
  izin: number;
  cuti: number;
  dinas: number;
  alpha: number;

  // Work stats
  totalJamKerja: number;
  totalMenitLembur?: number;

  // Detail izin/cuti/dinas untuk modal
  leaveDetails: LeaveDetail[];

  // Metadata
  effectiveStart: Date;
  effectiveEnd: Date;
  isPartial: boolean;
  notYetActive: boolean;
}

// ─── Period Calculation ────────────────────────────────────────────────────────

export function calculatePayrollPeriod(
  mode: PeriodMode,
  year: number,
  month: number,
  customStart?: Date,
  customEnd?: Date
): PayrollPeriod {
  let startDate: Date;
  let endDate: Date;
  let displayLabel: string;

  if (mode === 'calendar') {
    startDate = startOfMonth(new Date(year, month, 1));
    endDate = endOfMonth(new Date(year, month, 1));
    displayLabel = startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  } else if (mode === 'payroll') {
    startDate = new Date(year, month - 1, 26, 0, 0, 0);
    endDate = new Date(year, month, 25, 23, 59, 59);
    displayLabel = `Payroll ${new Date(year, month, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
  } else {
    startDate = customStart ? startOfDay(customStart) : startOfMonth(new Date());
    endDate = customEnd ? endOfDay(customEnd) : endOfMonth(new Date());
    displayLabel = `${format(startDate, 'd MMM yyyy')} – ${format(endDate, 'd MMM yyyy')}`;
  }

  return { mode, startDate, endDate, displayLabel };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getWorkingDays(startDate: Date, endDate: Date, holidays: Array<string | HolidayDetail> = []): number {
  try {
    const today = startOfDay(new Date());
    const activeEnd = isBefore(today, startOfDay(endDate)) ? today : startOfDay(endDate);
    if (isBefore(activeEnd, startOfDay(startDate))) return 0;
    const allDays = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    return allDays.filter(d => d <= activeEnd && !isWeekend(d)).length;
  } catch {
    return 0;
  }
}

export const INDONESIA_PUBLIC_HOLIDAYS_2026: HolidayDetail[] = [
  { date: '2026-01-01', type: 'national_holiday', name: 'Tahun Baru Masehi' },
  { date: '2026-01-16', type: 'national_holiday', name: 'Isra Mikraj Nabi Muhammad SAW' },
  { date: '2026-02-16', type: 'collective_leave', name: 'Tahun Baru Imlek 2577 Kongzili' },
  { date: '2026-02-17', type: 'national_holiday', name: 'Tahun Baru Imlek 2577 Kongzili' },
  { date: '2026-03-18', type: 'collective_leave', name: 'Hari Suci Nyepi' },
  { date: '2026-03-19', type: 'national_holiday', name: 'Hari Suci Nyepi' },
  { date: '2026-03-20', type: 'collective_leave', name: 'Idul Fitri 1447 H' },
  { date: '2026-03-21', type: 'national_holiday', name: 'Idul Fitri 1447 H' },
  { date: '2026-03-22', type: 'national_holiday', name: 'Idul Fitri 1447 H' },
  { date: '2026-03-23', type: 'collective_leave', name: 'Idul Fitri 1447 H' },
  { date: '2026-03-24', type: 'collective_leave', name: 'Idul Fitri 1447 H' },
  { date: '2026-04-03', type: 'national_holiday', name: 'Wafat Yesus Kristus' },
  { date: '2026-04-05', type: 'national_holiday', name: 'Hari Paskah' },
  { date: '2026-05-01', type: 'national_holiday', name: 'Hari Buruh Internasional' },
  { date: '2026-05-14', type: 'national_holiday', name: 'Kenaikan Yesus Kristus' },
  { date: '2026-05-15', type: 'collective_leave', name: 'Kenaikan Yesus Kristus' },
  { date: '2026-05-27', type: 'national_holiday', name: 'Idul Adha 1447 H' },
  { date: '2026-05-28', type: 'collective_leave', name: 'Idul Adha 1447 H' },
  { date: '2026-05-31', type: 'national_holiday', name: 'Hari Raya Waisak' },
  { date: '2026-06-01', type: 'national_holiday', name: 'Hari Lahir Pancasila' },
  { date: '2026-06-16', type: 'national_holiday', name: 'Tahun Baru Islam 1448 H' },
  { date: '2026-08-17', type: 'national_holiday', name: 'Hari Kemerdekaan Republik Indonesia' },
  { date: '2026-08-25', type: 'national_holiday', name: 'Maulid Nabi Muhammad SAW' },
  { date: '2026-12-24', type: 'collective_leave', name: 'Natal' },
  { date: '2026-12-25', type: 'national_holiday', name: 'Hari Raya Natal' },
];

function isWebAbsenMethod(method: any): boolean {
  if (!method) return false;
  const n = String(method).toLowerCase().trim();
  return n === 'web_absen' || n === 'web' || n === 'web absen';
}

function isExcludedRole(role: any): boolean {
  if (!role) return false;
  const n = String(role).toLowerCase().trim();
  return ['hrd', 'super_admin', 'superadmin', 'admin', 'direktur', 'direksi', 'management', 'director'].includes(n);
}

/**
 * Normalize employee number for matching (uppercase, remove spaces/dashes/underscores)
 */
export function normalizeEmployeeNumber(value: any): string {
  if (!value) return '';
  return String(value).toUpperCase().replace(/[\s\-_]/g, '');
}

/**
 * Merge identity data from all three collections — same priority as Data Karyawan page.
 * Mutates the profile object with enriched name/identity from users + employees.
 */
export function mergeEmployeeIdentity(
  profile: any,
  user?: any,
  employeeDoc?: any
): any {
  if (!profile) return profile;
  // Resolve best name across all three sources
  const resolvedName =
    employeeDoc?.fullName?.trim() ||
    profile?.fullName?.trim() ||
    profile?.namaLengkap?.trim() ||
    (profile as any)?.employeeName?.trim() ||
    (profile as any)?.name?.trim() ||
    (profile as any)?.displayName?.trim() ||
    (profile as any)?.nama?.trim() ||
    (profile?.dataDiriIdentitas as any)?.fullName?.trim() ||
    (profile?.dataDiriIdentitas as any)?.namaLengkap?.trim() ||
    (profile?.dataDiriIdentitas as any)?.namaPanggilan?.trim() ||
    (profile?.dataDiriIdentitas as any)?.nama?.trim() ||
    (profile?.hrdEmploymentInfo as any)?.fullName?.trim() ||
    (profile?.hrdEmploymentInfo as any)?.namaLengkap?.trim() ||
    user?.fullName?.trim() ||
    (user as any)?.displayName?.trim() ||
    employeeDoc?.name?.trim() ||
    employeeDoc?.email?.trim() ||
    profile?.email?.trim() ||
    user?.email?.trim() ||
    '';

  // Collect all candidate IDs for flexible matching — auth UID has highest priority
  const authUid =
    (profile as any).uid?.trim() ||
    user?.uid?.trim() ||
    employeeDoc?.uid?.trim() ||
    '';
  const docId = ((profile as any).id || '').trim();

  // Return enriched copy — don't mutate original
  return {
    ...profile,
    _resolvedName: resolvedName || null,
    // Primary matching ID: prefer auth UID over document ID
    _uid: authUid || docId,
    // Secondary fallback (document ID may differ from auth UID in some setups)
    _docId: docId,
    // All candidates for multi-key matching
    _candidateIds: Array.from(new Set([authUid, docId].filter(Boolean))),
  };
}

/**
 * Resolve name from merged employee object.
 * Never falls back to employeeNumber to keep name/NIK rows visually distinct.
 */
function resolveName(employee: any): string {
  // Pre-resolved name from mergeEmployeeIdentity
  if (employee._resolvedName) return employee._resolvedName;

  // Direct profile fields
  if (employee.fullName?.trim()) return employee.fullName.trim();
  if (employee.namaLengkap?.trim()) return employee.namaLengkap.trim();
  if (employee.nama?.trim()) return employee.nama.trim();
  if (employee.displayName?.trim()) return employee.displayName.trim();
  if (employee.name?.trim()) return employee.name.trim();
  if (employee.employeeName?.trim()) return employee.employeeName.trim();
  if (employee.namakaryawan?.trim()) return employee.namakaryawan.trim();
  if (employee.namaKaryawan?.trim()) return employee.namaKaryawan.trim();
  // Nested objects
  if (employee.dataDiriIdentitas?.fullName?.trim()) return employee.dataDiriIdentitas.fullName.trim();
  if (employee.dataDiriIdentitas?.namaLengkap?.trim()) return employee.dataDiriIdentitas.namaLengkap.trim();
  if (employee.dataDiriIdentitas?.namaPanggilan?.trim()) return employee.dataDiriIdentitas.namaPanggilan.trim();
  if (employee.dataDiriIdentitas?.nama?.trim()) return employee.dataDiriIdentitas.nama.trim();
  if (employee.hrdEmploymentInfo?.fullName?.trim()) return employee.hrdEmploymentInfo.fullName.trim();
  if (employee.hrdEmploymentInfo?.namaLengkap?.trim()) return employee.hrdEmploymentInfo.namaLengkap.trim();
  // Email as penultimate fallback
  if (employee.email?.trim()) return employee.email.trim();
  // Never return employeeNumber — that duplicates the NIK row
  return 'Data karyawan';
}

function resolveEmployeeNumber(employee: any): string {
  if (employee.employeeNumber) return employee.employeeNumber;
  if (employee.employeeId) return employee.employeeId;
  if (employee.employeeCode) return employee.employeeCode;
  if (employee.nomorIndukKaryawan) return employee.nomorIndukKaryawan;
  if (employee.nomorInduk) return employee.nomorInduk;
  if (employee.nip) return employee.nip;
  if (employee.dataDiriIdentitas?.employeeNumber) return employee.dataDiriIdentitas.employeeNumber;
  if (employee.dataDiriIdentitas?.employeeId) return employee.dataDiriIdentitas.employeeId;
  if (employee.hrdEmploymentInfo?.employeeNumber) return employee.hrdEmploymentInfo.employeeNumber;
  if (employee.hrdEmploymentInfo?.employeeId) return employee.hrdEmploymentInfo.employeeId;
  return '';
}

function resolveBrandId(profile: any): string | null {
  const id = profile.hrdEmploymentInfo?.brandId || profile.brandId;
  return typeof id === 'string' && id ? id : null;
}

function resolveBrandName(profile: any, brandMap: Map<string, string>): string {
  const bId = resolveBrandId(profile);
  if (bId) return brandMap.get(bId) || bId;
  return profile.hrdEmploymentInfo?.brandName || profile.brandName || profile.companyName || '-';
}

function resolveDivision(profile: any): string {
  return profile.hrdEmploymentInfo?.divisionName ||
    profile.hrdEmploymentInfo?.divisi ||
    profile.divisionName ||
    profile.division ||
    '-';
}

function resolveJoinDate(employee: any): Date | null {
  const raw =
    employee.joinDate ||
    employee.startWorkDate ||
    employee.tanggalMulaiKerja ||
    employee.startDate ||
    employee.hrdEmploymentInfo?.joinDate ||
    employee.hrdEmploymentInfo?.startWorkDate ||
    employee.hrdEmploymentInfo?.tanggalMulaiKerja ||
    employee.dataDiriIdentitas?.joinDate ||
    null;
  if (!raw) return null;
  try {
    if (raw instanceof Date) return raw;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function resolveResignDate(employee: any): Date | null {
  const raw =
    employee.resignDate ||
    employee.endDate ||
    employee.tanggalBerhenti ||
    employee.lastWorkDate ||
    employee.hrdEmploymentInfo?.resignDate ||
    employee.hrdEmploymentInfo?.endDate ||
    null;
  if (!raw) return null;
  try {
    if (raw instanceof Date) return raw;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function getEventDateStr(event: any): string | null {
  if (event.dateKey) return event.dateKey;
  if (event.date && typeof event.date === 'string') return event.date;
  if (event.datetime?.date) return event.datetime.date;
  const ts = event.timestamp || event.ts || event.tsServer || event.tsClient || event.createdAt;
  if (!ts) return null;
  try {
    let d: Date;
    if (ts instanceof Date) d = ts;
    else if (typeof ts === 'number') d = new Date(ts);
    else if (typeof ts === 'string') d = new Date(ts);
    else if (typeof ts.toDate === 'function') d = ts.toDate();
    else return null;
    return format(d, 'yyyy-MM-dd');
  } catch { return null; }
}

function getEventTimeStr(event: any): string {
  const directTime =
    event?.datetime?.time ||
    event?.time ||
    event?.tapInTime ||
    event?.checkInTime ||
    event?.clockInTime ||
    event?.jamMasuk;
  const directMatch = String(directTime || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (directMatch) return `${String(Number(directMatch[1])).padStart(2, '0')}:${directMatch[2]}`;

  const ts = event.timestamp || event.ts || event.tsServer || event.tsClient || event.createdAt;
  if (!ts) return '-';
  try {
    let d: Date;
    if (ts instanceof Date) d = ts;
    else if (typeof ts === 'number') d = new Date(ts);
    else if (typeof ts === 'string') d = new Date(ts);
    else if (typeof ts.toDate === 'function') d = ts.toDate();
    else return '-';
    return format(d, 'HH:mm');
  } catch { return '-'; }
}

function getDayName(date: Date): string {
  return format(date, 'EEEE', { locale: idLocale });
}

function getEventSource(event: any): string {
  const raw = event?.source || event?.dataSource || event?.inputSource || event?.createdByRole || '';
  const normalized = String(raw).toLowerCase();
  if (normalized.includes('manual') || normalized.includes('hrd')) return 'Manual HRD';
  if (normalized.includes('system') || normalized.includes('sistem')) return 'Sistem';
  return 'Web Absen';
}

function parseTimeToMinutes(time: any): number | null {
  if (!time) return null;
  const match = String(time).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function hasValidTapInTime(event: any): boolean {
  return parseTimeToMinutes(getEventTimeStr(event)) != null;
}

function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function resolveEmployeeDivisionId(employee: any): string | null {
  const id = employee.hrdEmploymentInfo?.divisionId || employee.divisionId || employee.divisiId;
  return typeof id === 'string' && id ? id : null;
}

function siteHasId(site: any, ids: string[]): boolean {
  const siteId = String(site?.id || site?.siteId || '').trim();
  return Boolean(siteId && ids.includes(siteId));
}

function siteMatchesBrand(site: any, brandId: string | null): boolean {
  if (!brandId) return false;
  const brandIds = [
    ...(Array.isArray(site?.brandIds) ? site.brandIds : []),
    site?.brandId,
    site?.brand,
  ].filter(Boolean).map(String);
  return brandIds.includes(brandId);
}

function siteMatchesDivision(site: any, divisionId: string | null): boolean {
  if (!divisionId) return false;
  const divisionIds = [
    ...(Array.isArray(site?.divisionIds) ? site.divisionIds : []),
    site?.divisionId,
    site?.divisiId,
  ].filter(Boolean).map(String);
  return divisionIds.includes(divisionId);
}

function resolveAttendanceSite(employee: any, events: any[], attendanceSites: AttendanceSite[]): AttendanceSite | null {
  const activeSites = (attendanceSites || []).filter((site: any) => site?.isActive !== false);
  if (!activeSites.length) return null;

  const explicitSiteIds = [
    employee.attendanceSiteId,
    employee.siteId,
    employee.hrdEmploymentInfo?.attendanceSiteId,
    employee.hrdEmploymentInfo?.siteId,
    ...(Array.isArray(employee.attendanceSiteIds) ? employee.attendanceSiteIds : []),
    ...(Array.isArray(employee.hrdEmploymentInfo?.attendanceSiteIds) ? employee.hrdEmploymentInfo.attendanceSiteIds : []),
  ].filter(Boolean).map(String);
  const byEmployeeSite = activeSites.find(site => siteHasId(site, explicitSiteIds));
  if (byEmployeeSite) return byEmployeeSite;

  const eventSiteIds = events.map(event => event?.siteId).filter(Boolean).map(String);
  const byEventSite = activeSites.find(site => siteHasId(site, eventSiteIds));
  if (byEventSite) return byEventSite;

  const brandId = resolveBrandId(employee);
  const divisionId = resolveEmployeeDivisionId(employee);
  const byBrandAndDivision = activeSites.find(site => siteMatchesBrand(site, brandId) && siteMatchesDivision(site, divisionId));
  if (byBrandAndDivision) return byBrandAndDivision;

  const byBrand = activeSites.find(site => siteMatchesBrand(site, brandId));
  if (byBrand) return byBrand;

  return activeSites.find((site: any) => site?.isDefault || site?.default || site?.isPrimary) || activeSites[0] || null;
}

function resolveAttendancePolicy(site: AttendanceSite | null) {
  const rawSite = site as any;
  const startTime =
    rawSite?.workStartTime ||
    rawSite?.jamMasuk ||
    rawSite?.startTime ||
    rawSite?.shift?.startTime ||
    '09:00';
  const endTime =
    rawSite?.workEndTime ||
    rawSite?.jamPulang ||
    rawSite?.endTime ||
    rawSite?.shift?.endTime ||
    '17:00';
  const tolerance = Number(
    rawSite?.lateToleranceMinutes ??
    rawSite?.batasTelat ??
    rawSite?.batasToleransiTelat ??
    rawSite?.batasToleransiMenit ??
    rawSite?.shift?.graceLateMinutes ??
    0
  );
  const startMinutes = parseTimeToMinutes(startTime) ?? 9 * 60;
  const lateToleranceMinutes = Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0;
  return {
    startTime: minutesToTime(startMinutes),
    endTime: String(endTime || '17:00').slice(0, 5),
    lateToleranceMinutes,
    effectiveLateLimitTime: minutesToTime(startMinutes + lateToleranceMinutes),
    effectiveLateLimitMinutes: startMinutes + lateToleranceMinutes,
  };
}

function calculateAttendanceTiming(tapInTime: string | null, policy: ReturnType<typeof resolveAttendancePolicy>) {
  const tapInMinutes = parseTimeToMinutes(tapInTime);
  if (tapInMinutes == null) {
    return {
      status: 'invalid' as const,
      lateMinutes: 0,
      notes: '',
    };
  }

  const officialStartMinutes = parseTimeToMinutes(policy.startTime) ?? policy.effectiveLateLimitMinutes;
  if (tapInMinutes <= officialStartMinutes) {
    return {
      status: 'tepat_waktu' as const,
      lateMinutes: 0,
      notes: 'Absen masuk tercatat tepat waktu.',
    };
  }

  if (tapInMinutes <= policy.effectiveLateLimitMinutes) {
    return {
      status: 'tepat_waktu' as const,
      lateMinutes: 0,
      notes: 'Masuk dalam batas toleransi.',
    };
  }

  const lateMinutes = tapInMinutes - policy.effectiveLateLimitMinutes;
  return {
    status: 'terlambat' as const,
    lateMinutes,
      notes: `Terlambat ${lateMinutes} menit dari batas toleransi.`,
  };
}

function isValidAttendanceTiming(timing: ReturnType<typeof calculateAttendanceTiming> | undefined): boolean {
  return Boolean(timing && timing.status !== 'invalid');
}

function getApprovedBy(record: any): string {
  return record?.approvedByName ||
    record?.approvedBy ||
    record?.approvedByDisplayName ||
    record?.hrdApprovedByName ||
    record?.hrdName ||
    record?.hrdReviewedByName ||
    record?.approvedByName ||
    record?.managerName ||
    record?.managerApprovedByName ||
    record?.directorReviewedByName ||
    record?.reviewedByName ||
    record?.assignedByName ||
    '-';
}

function getLeaveKind(record: any): 'Izin' | 'Cuti' | 'Dinas' {
  const category = String(record?.category || '').toLowerCase().trim();
  const type = String(record?.type || '').toLowerCase().trim();

  if (category === 'cuti') return 'Cuti';
  if (category === 'dinas' || type === 'business_trip') return 'Dinas';

  const raw = String(record?.kind || record?.formType || record?.leaveType || '').toLowerCase();
  if (raw.includes('cuti') || ['tahunan', 'besar', 'menikah', 'melahirkan'].includes(raw)) return 'Cuti';
  if (raw.includes('dinas') || raw.includes('business_trip')) return 'Dinas';

  if (record?.leaveType) return 'Cuti';

  return 'Izin';
}

function parseDateValue(raw: any): Date | null {
  try {
    if (!raw) return null;
    const date = raw instanceof Date ? raw : raw?.toDate?.() || new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function normalizeDateRange(record: any): { start: Date; end: Date } | null {
  const startCandidates = [
    record.startDate,
    record.leaveStartDate,
    record.departureDate,
    record.tripStartDate,
    record.missionStartDate,
    record.date,
    record.overtimeDate,
  ];
  const endCandidates = [
    record.endDate,
    record.leaveEndDate,
    record.returnDate,
    record.tripEndDate,
    record.missionEndDate,
    record.date,
    record.startDate,
    record.leaveStartDate,
    record.departureDate,
    record.tripStartDate,
    record.missionStartDate,
    record.overtimeDate,
  ];
  const rawStart = startCandidates.find(Boolean);
  const rawEnd = endCandidates.find(Boolean) || rawStart;
  const parsedStart = parseDateValue(rawStart);
  const parsedEnd = parseDateValue(rawEnd);
  if (!parsedStart || !parsedEnd) return null;
  return {
    start: startOfDay(parsedStart),
    end: endOfDay(parsedEnd),
  };
}

function normalizeComparableId(value: any): string {
  return value == null ? '' : String(value).trim();
}

function normalizeForNameMatch(value: any): string {
  if (!value) return '';
  return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function collectParticipantCandidates(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(item => collectParticipantCandidates(item));
  if (typeof value === 'object') {
    const direct = [
      value.uid,
      value.id,
      value.employeeId,
      value.employeeUid,
      value.employeeProfileId,
      value.requesterUid,
      value.userId,
      value.nik,
      value.employeeNumber,
      value.nomorIndukKaryawan,
    ].filter(Boolean);
    const nested = [
      value.members,
      value.participants,
      value.participantIds,
      value.assignedEmployeeIds,
      value.employees,
      value.travelers,
      value.memberUids,       // ← business_trip_missions top-level UID array
      value.memberDetails,    // ← business_trip_missions member detail objects
      value.selectedEmployees,
      value.assignedStaff,
      value.teamMembers,
      value.staff,
    ].flatMap(item => collectParticipantCandidates(item));
    return [...direct, ...nested];
  }
  return [value];
}

const APPROVED_FINAL_STATUSES = [
  'approved',
  'disetujui',
  'hrd_approved',
  'approved_hrd',
  'approved_by_hrd',
  'completed',
  'selesai',
  'accepted',
  'active',
  'approved_by_manager',
  'approved_by_director',
  'confirmed_by_staff',
  'validated_by_manager',
  'validated',
  'in_progress',
  'departed',
  'arrived',
  'activity_done',
  'return_started',
  'closed',
  'active_leave',
  'approved_ready_to_depart',
  'ready_to_depart',
  'on_duty',
  'returned',
  'returned_pending_report',
  'report_submitted',
  'final_report_submitted',
];

function isApprovedStatusValue(status: any): boolean {
  return APPROVED_FINAL_STATUSES.includes(String(status || '').toLowerCase().trim());
}

function getRecordApprovalStatus(record: any): string {
  const statuses = [
    record.approvalStatus,
    record.memberStatus,
    record.managerValidationStatus,
    record.staffConfirmationStatus,
    record.finalStatus,
    record.status,
  ].map(status => String(status || '').toLowerCase().trim()).filter(Boolean);
  return statuses.find(isApprovedStatusValue) || String(record.status || record.memberStatus || 'approved');
}

function isApprovedFinalRecord(record: any): boolean {
  const statuses = [
    record.status,
    record.approvalStatus,
    record.memberStatus,
    record.managerValidationStatus,
    record.staffConfirmationStatus,
    record.finalStatus,
  ].map(status => String(status || '').toLowerCase().trim()).filter(Boolean);
  if (statuses.some(status => /reject|rejected|ditolak|cancel|cancelled|batal|revision|revisi|archived|declined_by_staff/.test(status))) {
    return false;
  }
  return statuses.some(isApprovedStatusValue);
}

function isRecordForEmployee(
  record: any,
  employeeIds: string[],
  normalizedEmployeeNumber: string,
  employeeNames?: string[],
  employeeEmails?: string[],
): boolean {
  const candidateIds = employeeIds.filter(Boolean).map(normalizeComparableId).filter(Boolean);

  // 1. Direct UID / ID field match
  const directCandidates = [
    record.uid,
    record.id,
    record.applicantUid,
    record.requesterUid,
    record.employeeUid,
    record.employeeProfileId,
    record.employeeId,
    record.userId,
  ].map(normalizeComparableId).filter(Boolean);
  if (candidateIds.some(id => directCandidates.includes(id))) return true;

  // 2. Participant / member array match (UIDs & NIKs)
  const participantCandidates = [
    record.members,
    record.participants,
    record.participantIds,
    record.assignedEmployeeIds,
    record.employees,
    record.travelers,
    record.memberUids,
    record.memberDetails,
    record.selectedEmployees,
    record.assignedStaff,
    record.teamMembers,
    record.staff,
  ].flatMap(item => collectParticipantCandidates(item)).map(normalizeComparableId).filter(Boolean);
  if (candidateIds.some(id => participantCandidates.includes(id))) return true;

  // 3. NIK / employee number match
  if (normalizedEmployeeNumber) {
    const nikCandidates = [
      record.employeeNumber,
      record.nomorIndukKaryawan,
      ...participantCandidates,
    ].map(normalizeEmployeeNumber).filter(Boolean);
    if (nikCandidates.includes(normalizedEmployeeNumber)) return true;
  }

  // 4. Name fallback (case-insensitive, trimmed) — for dinas missions that only store names
  if (employeeNames && employeeNames.length > 0) {
    const recordNames = [
      record.employeeName,
      record.fullName,
      record.name,
      record.namaPegawai,
      record.namaKaryawan,
    ].map(normalizeForNameMatch).filter(Boolean);
    if (employeeNames.some(n => n && recordNames.includes(normalizeForNameMatch(n)))) return true;

    // Also check inside participant objects
    const participantNameCandidates = [
      record.members,
      record.participants,
      record.memberDetails,
      record.selectedEmployees,
      record.assignedStaff,
      record.teamMembers,
      record.staff,
    ].flatMap((arr: any) => {
      if (!Array.isArray(arr)) return [];
      return arr.map((item: any) => [item?.employeeName, item?.fullName, item?.name].filter(Boolean)).flat();
    }).map(normalizeForNameMatch).filter(Boolean);
    if (employeeNames.some(n => n && participantNameCandidates.includes(normalizeForNameMatch(n)))) return true;
  }

  // 5. Email fallback
  if (employeeEmails && employeeEmails.length > 0) {
    const recordEmails = [record.email, record.employeeEmail].map(normalizeForNameMatch).filter(Boolean);
    if (employeeEmails.some(e => e && recordEmails.includes(normalizeForNameMatch(e)))) return true;
  }

  return false;
}

function isRecordInEmployeePeriod(
  record: any,
  employeeIds: string[],
  normalizedEmployeeNumber: string,
  effectiveStart: Date,
  effectiveEnd: Date,
  employeeNames?: string[],
  employeeEmails?: string[],
): boolean {
  if (!isApprovedFinalRecord(record)) return false;
  if (!isRecordForEmployee(record, employeeIds, normalizedEmployeeNumber, employeeNames, employeeEmails)) return false;

  const range = normalizeDateRange(record);
  if (!range) return false;
  return isWithinInterval(range.start, { start: effectiveStart, end: effectiveEnd }) ||
    isWithinInterval(range.end, { start: effectiveStart, end: effectiveEnd }) ||
    (isBefore(range.start, effectiveStart) && isAfter(range.end, effectiveEnd));
}

function mapApprovedAbsenceDetails(
  records: any[],
  employeeIds: string[],
  normalizedEmployeeNumber: string,
  effectiveStart: Date,
  effectiveEnd: Date,
  employeeNames?: string[],
  employeeEmails?: string[],
): LeaveDetail[] {
  const details: LeaveDetail[] = [];
  for (const record of records) {
    if (!isRecordInEmployeePeriod(record, employeeIds, normalizedEmployeeNumber, effectiveStart, effectiveEnd, employeeNames, employeeEmails)) continue;
    const range = normalizeDateRange(record);
    if (!range) continue;

    const kind = getLeaveKind(record);
    const days = eachDayOfInterval({ start: range.start, end: range.end })
      .filter(d => d >= startOfDay(effectiveStart) && d <= endOfDay(effectiveEnd))
      // Dinas includes weekends — employee is still on official duty on Sat/Sun
      .filter(d => kind === 'Dinas' ? true : !isWeekend(d));

    // Build Dinas-specific metadata once per record (not per day)
    const spdNumber = record.assignmentNumber || record.spdNumber || record.missionCode || '';
    const missionId = record.id || record.missionId || '';
    const missionName = record.missionName || record.title || record.name || '';
    const destination = [
      record.destinationCity,
      record.destinationRegency,
      record.destinationProvince,
      record.destinationAddress,
    ].filter(Boolean).join(', ');
    const activity = record.activity || record.kegiatan || record.projectName || record.instructionNote || '';

    // Build per-day keterangan for Dinas: include mission name + SPD number
    const buildDinasKet = (): string => {
      let s = 'Sedang menjalankan perjalanan dinas';
      if (missionName) s += `: ${missionName}`;
      if (spdNumber) s += ` — SPD: ${spdNumber}`;
      s += '.';
      if (destination) s += ` Tujuan: ${destination}.`;
      if (activity) s += ` Kegiatan: ${activity}.`;
      return s;
    };

    const periodStart = format(range.start, 'yyyy-MM-dd');
    const periodEnd   = format(range.end,   'yyyy-MM-dd');

    for (const day of days) {
      details.push({
        date: format(day, 'yyyy-MM-dd'),
        type: kind,
        formType: record.formType || record.type || record.leaveType || kind,
        reasonType: record.reasonType || '',
        keterangan: kind === 'Dinas'
          ? buildDinasKet()
          : record.keterangan || record.notes || record.reason || record.leaveType || record.formType || '',
        days: 1,
        status: getRecordApprovalStatus(record),
        approvedBy: getApprovedBy(record),
        spdNumber,
        ...(kind === 'Dinas' ? { missionId, missionName, destination, activity, periodStart, periodEnd } : {}),
      });
    }
  }
  return details;
}

function normalizeHolidayDetails(holidays: Array<string | HolidayDetail>): HolidayDetail[] {
  return holidays.map(h => {
    if (typeof h !== 'string') return h;
    return { date: h, type: 'company_holiday', name: 'Libur perusahaan' };
  });
}

const WEEKEND_DINAS_STATUSES: ReadonlySet<string> = new Set([
  'Dinas + Akhir Pekan',
  'Dinas + Akhir Pekan + Tepat Waktu',
  'Dinas + Akhir Pekan + Terlambat',
]);

const WEEKDAY_HOLIDAY_DINAS_STATUSES: ReadonlySet<string> = new Set([
  'Dinas + Libur Nasional',
  'Dinas + Cuti Bersama',
  'Dinas + Libur Perusahaan',
  'Dinas + Libur Nasional + Tepat Waktu',
  'Dinas + Libur Nasional + Terlambat',
  'Dinas + Cuti Bersama + Tepat Waktu',
  'Dinas + Cuti Bersama + Terlambat',
  'Dinas + Libur Perusahaan + Tepat Waktu',
  'Dinas + Libur Perusahaan + Terlambat',
]);

function isWorkdayStatus(status: CalendarAttendanceDetail['status']): boolean {
  // Dinas on weekday holidays: counted as workday (official duty)
  if (WEEKDAY_HOLIDAY_DINAS_STATUSES.has(status)) return true;
  // Dinas on weekends: NOT a regular workday, only counted in dinas separately
  if (WEEKEND_DINAS_STATUSES.has(status)) return false;
  return !['Belum Berjalan', 'Libur Nasional', 'Cuti Bersama', 'Libur Perusahaan', 'Akhir Pekan'].includes(status);
}

function getEventKind(type: string): 'in' | 'out' | null {
  const t = String(type).toLowerCase().trim();
  if (t === 'check-in' || t === 'tapin' || t === 'tap_in' || t === 'in') return 'in';
  if (t === 'check-out' || t === 'tapout' || t === 'tap_out' || t === 'out') return 'out';
  return null;
}

// ─── Deduplicate by NIK ───────────────────────────────────────────────────────

/**
 * Score how "complete" a profile is — higher = prefer this record when deduplicating.
 */
function profileCompleteness(emp: any): number {
  let score = 0;
  if (resolveName(emp) !== 'Data karyawan') score += 8;
  if (emp._uid || emp.uid || emp.id) score += 4;
  const method = emp.attendanceMethod || emp.hrdEmploymentInfo?.attendanceMethod;
  if (isWebAbsenMethod(method)) score += 2;
  if (resolveBrandId(emp)) score += 1;
  return score;
}

/**
 * Deduplicate a list of merged employee objects by normalized NIK.
 * Keeps the record with the highest completeness score.
 */
export function deduplicateByNik(employees: any[]): any[] {
  const best = new Map<string, any>();
  for (const emp of employees) {
    const empNo = resolveEmployeeNumber(emp);
    if (!empNo) continue; // no NIK → include as-is later
    const key = normalizeEmployeeNumber(empNo);
    const existing = best.get(key);
    if (!existing || profileCompleteness(emp) > profileCompleteness(existing)) {
      best.set(key, emp);
    }
  }
  // Include employees with no NIK (they can't be deduped by NIK)
  const noNik = employees.filter(emp => !resolveEmployeeNumber(emp));
  return [...best.values(), ...noNik];
}

// ─── Per-employee Recap ────────────────────────────────────────────────────────

export function generateEmployeePayrollRecap(
  employee: EmployeeProfile,
  period: PayrollPeriod,
  allEvents: AttendanceEvent[],
  approvedPermissions: any[],
  brandMap: Map<string, string>,
  holidays: Array<string | HolidayDetail> = [],
  attendanceSites: AttendanceSite[] = []
): PayrollRecapRow {
  const employeeId = (employee as any)._uid || (employee as any).uid || (employee as any).id || '';
  const employeeNumber = resolveEmployeeNumber(employee);
  const normalizedEmployeeNumber = normalizeEmployeeNumber(employeeNumber);
  // All candidate IDs for flexible leave/dinas matching
  const employeeIds: string[] = (employee as any)._candidateIds?.length
    ? (employee as any)._candidateIds
    : [employeeId, (employee as any)._docId].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  // Candidate names for name-based fallback matching
  const employeeNames: string[] = [
    (employee as any)._resolvedName,
    (employee as any).fullName,
    (employee as any).namaLengkap,
    (employee as any).name,
    (employee as any).displayName,
    (employee as any).dataDiriIdentitas?.fullName,
    (employee as any).dataDiriIdentitas?.namaLengkap,
  ].filter((n): n is string => Boolean(n && String(n).trim()));
  // Candidate emails
  const employeeEmails: string[] = [
    (employee as any).email,
    (employee as any).emailKantor,
    (employee as any).workEmail,
  ].filter((e): e is string => Boolean(e && String(e).trim()));

  // ── Effective date range ──
  let effectiveStart = startOfDay(period.startDate);
  let effectiveEnd = endOfDay(period.endDate);
  let isPartial = false;
  let notYetActive = false;

  const joinDate = resolveJoinDate(employee);
  if (joinDate) {
    const joinDay = startOfDay(joinDate);
    if (isAfter(joinDay, endOfDay(period.endDate))) {
      notYetActive = true;
    } else if (isAfter(joinDay, effectiveStart)) {
      effectiveStart = joinDay;
      isPartial = true;
    }
  }

  const resignDate = resolveResignDate(employee);
  if (resignDate) {
    const resignDay = endOfDay(resignDate);
    if (isBefore(resignDay, effectiveStart)) {
      notYetActive = true;
    } else if (isBefore(resignDay, effectiveEnd)) {
      effectiveEnd = resignDay;
      isPartial = true;
    }
  }

  if (notYetActive) {
    return {
      employeeId,
      fullName: resolveName(employee),
      employeeNumber,
      brandId: resolveBrandId(employee) || '',
      brandName: resolveBrandName(employee, brandMap),
      divisionId: (employee as any).divisionId,
      divisionName: resolveDivision(employee),
      hariKerja: 0, hadir: 0, terlambat: 0, menitTerlambat: 0, lateDetails: [],
      hadirDetails: [], alphaDetails: [], calendarDetails: [],
      pulangAwal: 0, lupaHapIn: 0, lupaHapOut: 0,
      izin: 0, cuti: 0, dinas: 0, alpha: 0, totalJamKerja: 0,
      leaveDetails: [], effectiveStart: period.startDate, effectiveEnd: period.endDate,
      isPartial: false, notYetActive: true,
    };
  }

  const holidayDetails = normalizeHolidayDetails(holidays);
  const holidayMap = new Map(holidayDetails.map(h => [h.date, h]));
  const holidayDates = holidayDetails.map(h => h.date);
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const hariKerja = getWorkingDays(effectiveStart, effectiveEnd, holidayDetails);

  // ── Filter events: date range FIRST, then employee match ──
  const myEvents = allEvents.filter(e => {
    const ev = e as any;

    // Date range filter — reject outside effective period
    const dateStr = getEventDateStr(ev);
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      if (d < startOfDay(effectiveStart) || d > endOfDay(effectiveEnd)) return false;
    } catch { return false; }

    // Employee match by UID (primary)
    const evUid = ev.uid || ev.userId || ev.employeeUid;
    if (evUid && evUid === employeeId) return true;

    // Employee match by normalized NIK (secondary, only when NIK is available)
    if (normalizedEmployeeNumber) {
      const evEmpNo = ev.employeeNumber || ev.nomorIndukKaryawan;
      if (evEmpNo && normalizeEmployeeNumber(evEmpNo) === normalizedEmployeeNumber) return true;
    }

    return false;
  });
  const attendanceSite = resolveAttendanceSite(employee, myEvents, attendanceSites);
  const attendancePolicy = resolveAttendancePolicy(attendanceSite);

  // ── Build per-day maps ──
  const checkInByDay = new Map<string, any>();
  const checkOutByDay = new Map<string, any>();

  for (const ev of myEvents) {
    const dateStr = getEventDateStr(ev as any) || '';
    const kind = getEventKind((ev as any).type || '');
    if (kind === 'in' && dateStr && hasValidTapInTime(ev) && !checkInByDay.has(dateStr)) checkInByDay.set(dateStr, ev);
    if (kind === 'out' && !checkOutByDay.has(dateStr)) checkOutByDay.set(dateStr, ev);
  }

  // ── Attendance stats ──
  const hadirDays = new Set<string>();
  let terlambat = 0;
  let menitTerlambat = 0;
  const lateDetails: LateDetail[] = [];
  let pulangAwal = 0;
  let lupaHapIn = 0;
  let lupaHapOut = 0;
  let totalMinutes = 0;
  let totalMenitLembur = 0;
  const hadirDetails: AttendanceDetail[] = [];
  const attendanceTimingByDay = new Map<string, ReturnType<typeof calculateAttendanceTiming>>();

  for (const [dateStr, ev] of checkInByDay) {
    hadirDays.add(dateStr);

    const tapInTime = getEventTimeStr(ev);
    const timing = calculateAttendanceTiming(tapInTime, attendancePolicy);
    attendanceTimingByDay.set(dateStr, timing);
    if (timing.lateMinutes > 0) {
      terlambat++;
      menitTerlambat += timing.lateMinutes;
      lateDetails.push({
        date: dateStr,
        tapInTime,
        lateMinutes: timing.lateMinutes,
        scheduledStartTime: attendancePolicy.effectiveLateLimitTime,
      });
    }

    if (!checkOutByDay.has(dateStr) && dateStr !== todayStr) {
      lupaHapOut++;
    }
  }

  for (const [dateStr] of checkOutByDay) {
    if (!checkInByDay.has(dateStr) && dateStr !== todayStr) lupaHapIn++;
    const ev = checkOutByDay.get(dateStr);
    const early = (ev as any).earlyLeaveMinutes ?? 0;
    if (early > 0) pulangAwal++;
  }

  for (const [dateStr, inEv] of checkInByDay) {
    const outEv = checkOutByDay.get(dateStr);
    totalMenitLembur += Number((inEv as any).overtimeMinutes || (outEv as any)?.overtimeMinutes || 0);
    if (!outEv) continue;
    const workDur = (inEv as any).workDurationMinutes || (outEv as any).workDurationMinutes;
    if (workDur) totalMinutes += workDur;
  }

  for (const dateStr of Array.from(hadirDays).sort()) {
    const inEv = checkInByDay.get(dateStr);
    const outEv = checkOutByDay.get(dateStr);
    if (!inEv) continue;
    const timing = attendanceTimingByDay.get(dateStr) || calculateAttendanceTiming(getEventTimeStr(inEv), attendancePolicy);
    if (!isValidAttendanceTiming(timing)) continue;
    const workDur = (inEv as any)?.workDurationMinutes || (outEv as any)?.workDurationMinutes;
    hadirDetails.push({
      date: dateStr,
      dayName: getDayName(new Date(dateStr)),
      tapInTime: inEv ? getEventTimeStr(inEv) : null,
      tapOutTime: outEv ? getEventTimeStr(outEv) : null,
      status: timing.status === 'terlambat' ? 'terlambat' : 'tepat_waktu',
      source: getEventSource(inEv || outEv),
      notes: (inEv as any)?.notes || (outEv as any)?.notes || timing.notes,
      lateMinutes: timing.lateMinutes || undefined,
      workDurationMinutes: workDur || undefined,
    });
  }

  const hadir = hadirDays.size;

  // ── Approved permissions in period ──
  const leaveDetails = mapApprovedAbsenceDetails(
    approvedPermissions,
    employeeIds,
    normalizedEmployeeNumber,
    effectiveStart,
    effectiveEnd,
    employeeNames,
    employeeEmails,
  ).sort((a, b) => a.date.localeCompare(b.date));
  const izin = leaveDetails.filter(d => d.type === 'Izin').length;
  const cuti = leaveDetails.filter(d => d.type === 'Cuti').length;
  const dinas = leaveDetails.filter(d => d.type === 'Dinas').length;
  // DEBUG: log result for every employee that has any cuti/dinas/izin or who has matching leave records
  if (typeof window !== 'undefined' && (cuti > 0 || dinas > 0 || izin > 0)) {
    console.log(`[PAYROLL RESULT] ${resolveName(employee)} | ids:[${employeeIds.join(',')}] | nik:${normalizedEmployeeNumber} | izin:${izin} cuti:${cuti} dinas:${dinas}`);
  }

  // ── Alpha: past working days only ──
  const effectiveWorkingDays = eachDayOfInterval({
    start: startOfDay(effectiveStart),
    end: startOfDay(effectiveEnd),
  }).filter(d => d <= today && !isWeekend(d) && !holidayDates.includes(format(d, 'yyyy-MM-dd')));

  let alpha = 0;
  const alphaDetails: AlphaDetail[] = [];
  for (const day of effectiveWorkingDays) {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (dateStr > todayStr) continue;
    if (hadirDays.has(dateStr)) continue;
    const hasPermission = leaveDetails.some(detail => detail.date === dateStr);
    if (hasPermission) continue;
    alpha++;
    alphaDetails.push({
      date: dateStr,
      dayName: getDayName(day),
      keterangan: 'Tidak ada data absen dan tidak ada izin/cuti/dinas approved.',
    });
  }

  const leaveByDay = new Map<string, LeaveDetail>();
  const cutiByDay = new Map<string, LeaveDetail>();
  const izinByDay = new Map<string, LeaveDetail>();
  const dinasByDay = new Map<string, LeaveDetail>();
  for (const detail of leaveDetails) {
    if (!leaveByDay.has(detail.date)) leaveByDay.set(detail.date, detail);
    if (detail.type === 'Cuti' && !cutiByDay.has(detail.date)) cutiByDay.set(detail.date, detail);
    if (detail.type === 'Izin' && !izinByDay.has(detail.date)) izinByDay.set(detail.date, detail);
    if (detail.type === 'Dinas' && !dinasByDay.has(detail.date)) dinasByDay.set(detail.date, detail);
  }
  const alphaByDay = new Set(alphaDetails.map(d => d.date));
  const calendarDetails: CalendarAttendanceDetail[] = eachDayOfInterval({
    start: startOfDay(effectiveStart),
    end: startOfDay(effectiveEnd),
  }).map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const inEv = checkInByDay.get(dateStr);
    const outEv = checkOutByDay.get(dateStr);
    const cuti = cutiByDay.get(dateStr);
    const izin = izinByDay.get(dateStr);
    const dinas = dinasByDay.get(dateStr);
    const holiday = holidayMap.get(dateStr);
    const hasAttendance = hadirDays.has(dateStr);
    const timing = inEv ? attendanceTimingByDay.get(dateStr) : undefined;
    const isLate = timing?.status === 'terlambat';
    let status: CalendarAttendanceDetail['status'] = 'Alpha';
    let keterangan = '';

    // Helper: build the holiday suffix for keterangan
    const holidaySuffix = (): string => {
      if (holiday?.type === 'national_holiday') return ` Bertepatan dengan Libur Nasional: ${holiday.name}.`;
      if (holiday?.type === 'collective_leave')  return ` Bertepatan dengan Cuti Bersama: ${holiday.name}.`;
      if (holiday?.type === 'company_holiday')   return ` Bertepatan dengan Libur Perusahaan: ${holiday.name}.`;
      if (isWeekend(day))                        return ' Bertepatan dengan Akhir Pekan.';
      return '';
    };

    if (dateStr > todayStr) {
      status = 'Belum Berjalan';
      keterangan = 'Tanggal belum berjalan dan belum masuk perhitungan payroll.';
    } else if (dinas) {
      // Dinas takes priority over holiday and weekend; combine status if needed
      const dinasKet = dinas.keterangan || 'Sedang menjalankan perjalanan dinas approved.';
      const attendancePart = isLate ? 'Terlambat' : 'Tepat Waktu';
      const latePrefix = isLate ? `${timing?.notes || 'Terlambat dari batas toleransi.'} ` : '';

      if (holiday?.type === 'national_holiday') {
        status = hasAttendance
          ? isLate ? 'Dinas + Libur Nasional + Terlambat' : 'Dinas + Libur Nasional + Tepat Waktu'
          : 'Dinas + Libur Nasional';
        keterangan = `${latePrefix}${dinasKet}${holidaySuffix()}`;
      } else if (holiday?.type === 'collective_leave') {
        status = hasAttendance
          ? isLate ? 'Dinas + Cuti Bersama + Terlambat' : 'Dinas + Cuti Bersama + Tepat Waktu'
          : 'Dinas + Cuti Bersama';
        keterangan = `${latePrefix}${dinasKet}${holidaySuffix()}`;
      } else if (holiday?.type === 'company_holiday') {
        status = hasAttendance
          ? isLate ? 'Dinas + Libur Perusahaan + Terlambat' : 'Dinas + Libur Perusahaan + Tepat Waktu'
          : 'Dinas + Libur Perusahaan';
        keterangan = `${latePrefix}${dinasKet}${holidaySuffix()}`;
      } else if (isWeekend(day)) {
        status = hasAttendance
          ? isLate ? 'Dinas + Akhir Pekan + Terlambat' : 'Dinas + Akhir Pekan + Tepat Waktu'
          : 'Dinas + Akhir Pekan';
        keterangan = `${latePrefix}${dinasKet}${holidaySuffix()}`;
      } else if (hasAttendance) {
        status = isLate ? 'Dinas + Terlambat' : 'Dinas + Tepat Waktu';
        keterangan = `${latePrefix}${dinasKet}`;
      } else {
        status = 'Dinas';
        keterangan = dinasKet;
      }
    } else if (holiday?.type === 'national_holiday') {
      status = 'Libur Nasional';
      keterangan = `${holiday.name}.`;
    } else if (holiday?.type === 'collective_leave') {
      status = 'Cuti Bersama';
      keterangan = `Cuti Bersama ${holiday.name}.`;
    } else if (holiday?.type === 'company_holiday') {
      status = 'Libur Perusahaan';
      keterangan = `${holiday.name}.`;
    } else if (isWeekend(day)) {
      status = 'Akhir Pekan';
      keterangan = 'Akhir pekan.';
    } else if (cuti) {
      status = 'Cuti';
      keterangan = cuti.keterangan || 'Cuti approved.';
    } else if (izin) {
      status = 'Izin';
      keterangan = izin.keterangan || 'Izin approved.';
    } else if (alphaByDay.has(dateStr)) {
      status = 'Alpha';
      keterangan = 'Tidak ada data absen dan tidak ada izin/cuti/dinas approved.';
    } else if (hasAttendance) {
      status = isLate ? 'Terlambat' : 'Tepat Waktu';
      keterangan = timing?.notes || 'Absen tercatat.';
    } else {
      status = 'Alpha';
      keterangan = 'Tidak ada data absen dan tidak ada izin/cuti/dinas approved.';
    }

    return {
      date: dateStr,
      dayName: getDayName(day),
      status,
      tapInTime: dateStr > todayStr ? null : inEv ? getEventTimeStr(inEv) : null,
      tapOutTime: dateStr > todayStr ? null : outEv ? getEventTimeStr(outEv) : null,
      keterangan,
    };
  });

  const countedCalendarDetails = calendarDetails.filter(d => isWorkdayStatus(d.status));
  // Use string-contains so all current and future compound statuses are covered
  const countedHadirDates = new Set(
    countedCalendarDetails
      .filter(d => (d.status as string).includes('Tepat Waktu') || (d.status as string).includes('Terlambat'))
      .map(d => d.date)
  );
  const countedLateDates = new Set(
    countedCalendarDetails
      .filter(d => (d.status as string).includes('Terlambat'))
      .map(d => d.date)
  );
  const finalLateDetails = lateDetails
    .filter(d => countedLateDates.has(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const finalHadirDetails = hadirDetails.filter(d => countedHadirDates.has(d.date));
  const finalAlphaDetails = calendarDetails
    .filter(d => d.status === 'Alpha')
    .map(d => ({
      date: d.date,
      dayName: d.dayName,
      keterangan: d.keterangan,
    }));
  const finalMenitTerlambat = finalLateDetails.reduce((sum, detail) => sum + detail.lateMinutes, 0);
  const finalTotalMinutes = finalHadirDetails.reduce((sum, detail) => sum + (detail.workDurationMinutes || 0), 0);

  return {
    employeeId,
    fullName: resolveName(employee),
    employeeNumber,
    brandId: resolveBrandId(employee) || '',
    brandName: resolveBrandName(employee, brandMap),
    divisionId: (employee as any).divisionId,
    divisionName: resolveDivision(employee),
    hariKerja,
    hadir: countedHadirDates.size,
    terlambat: finalLateDetails.length,
    menitTerlambat: finalMenitTerlambat,
    lateDetails: finalLateDetails,
    hadirDetails: finalHadirDetails,
    alphaDetails: finalAlphaDetails,
    calendarDetails,
    pulangAwal,
    lupaHapIn,
    lupaHapOut,
    izin: countedCalendarDetails.filter(d => d.status === 'Izin').length,
    cuti: countedCalendarDetails.filter(d => d.status === 'Cuti').length,
    // Count ALL dinas days including weekends and holidays (full trip duration)
    dinas: calendarDetails.filter(d => (d.status as string).startsWith('Dinas')).length,
    alpha: finalAlphaDetails.length,
    totalJamKerja: Math.floor(finalTotalMinutes / 60),
    totalMenitLembur,
    leaveDetails,
    effectiveStart,
    effectiveEnd,
    isPartial,
    notYetActive: false,
  };
}

// ─── Batch Recap ──────────────────────────────────────────────────────────────

export function generatePayrollRecap(
  employees: EmployeeProfile[],
  period: PayrollPeriod,
  attendanceEvents: AttendanceEvent[],
  approvedPermissions: any[],
  brands: any[],
  holidays: Array<string | HolidayDetail> = [],
  attendanceSites: AttendanceSite[] = []
): PayrollRecapRow[] {
  const brandMap = new Map(brands.map((b: any) => [b.id, b.name]));

  const webAbsenEmployees = (employees as any[]).filter(emp => {
    if (emp.isActive === false) return false;
    const status = (emp.status || emp.employmentStatus || '').toLowerCase();
    if (status === 'inactive' || status === 'nonaktif') return false;
    const method = emp.attendanceMethod || emp.hrdEmploymentInfo?.attendanceMethod;
    if (!isWebAbsenMethod(method)) return false;
    const role = emp.role || emp.hrdEmploymentInfo?.role || '';
    if (isExcludedRole(role)) return false;
    return true;
  });

  // Deduplicate by NIK before generating recap
  const deduped = deduplicateByNik(webAbsenEmployees);

  return deduped
    .map(emp => generateEmployeePayrollRecap(emp, period, attendanceEvents, approvedPermissions, brandMap, holidays, attendanceSites))
    .filter(row => !row.notYetActive)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
}
