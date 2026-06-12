/**
 * Payroll Recap Calculation
 * Generates attendance summary for payroll processing from existing collections
 */

import { startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isWithinInterval, isBefore, isAfter, format, startOfDay, endOfDay } from 'date-fns';
import type { EmployeeProfile, AttendanceEvent } from '@/lib/types';

export type PeriodMode = 'calendar' | 'payroll' | 'custom';

export interface PayrollPeriod {
  mode: PeriodMode;
  startDate: Date;
  endDate: Date;
  displayLabel: string;
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
  pulangAwal: number;
  lupaHapIn: number;
  lupaHapOut: number;

  // Leave stats (sakit included in izin)
  izin: number;
  dinas: number;
  alpha: number;

  // Work stats
  totalJamKerja: number;

  // Detail izin untuk modal
  leaveDetails: Array<{
    date: string;
    type: string;
    formType?: string;
    reasonType?: string;
    keterangan?: string;
    days?: number;
    status: string;
  }>;

  // Metadata
  effectiveStart: Date;
  effectiveEnd: Date;
  isPartial: boolean;
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
    // 26th of previous month → 25th of current month
    startDate = new Date(year, month - 1, 26, 0, 0, 0);
    endDate = new Date(year, month, 25, 23, 59, 59);
    displayLabel = `Payroll ${new Date(year, month, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
  } else {
    // Custom
    startDate = customStart ? startOfDay(customStart) : startOfMonth(new Date());
    endDate = customEnd ? endOfDay(customEnd) : endOfMonth(new Date());
    displayLabel = `${format(startDate, 'd MMM yyyy')} – ${format(endDate, 'd MMM yyyy')}`;
  }

  return { mode, startDate, endDate, displayLabel };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getWorkingDays(startDate: Date, endDate: Date): number {
  try {
    const allDays = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    return allDays.filter(d => !isWeekend(d)).length;
  } catch {
    return 0;
  }
}

function isWebAbsenMethod(method: any): boolean {
  if (!method) return false;
  const n = String(method).toLowerCase().trim();
  return n === 'web_absen' || n === 'web';
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

function resolveName(employee: any, firstEvent?: any): string {
  // Profile name - comprehensive fallback
  if (employee.fullName?.trim()) return employee.fullName.trim();
  if (employee.namaLengkap?.trim()) return employee.namaLengkap.trim();
  if (employee.displayName?.trim()) return employee.displayName.trim();
  if (employee.name?.trim()) return employee.name.trim();
  if (employee.dataDiriIdentitas?.fullName?.trim()) return employee.dataDiriIdentitas.fullName.trim();
  if (employee.hrdEmploymentInfo?.fullName?.trim()) return employee.hrdEmploymentInfo.fullName.trim();
  // Event name
  if (firstEvent?.employeeName?.trim()) return firstEvent.employeeName.trim();
  if (firstEvent?.fullName?.trim()) return firstEvent.fullName.trim();
  if (firstEvent?.name?.trim()) return firstEvent.name.trim();
  if (firstEvent?.displayName?.trim()) return firstEvent.displayName.trim();
  if (firstEvent?.email?.trim()) return firstEvent.email.trim();
  if (employee.email?.trim()) return employee.email.trim();
  // Fallback to employee number
  if (employee.employeeNumber) return employee.employeeNumber;
  if (firstEvent?.employeeNumber) return firstEvent.employeeNumber;
  // Last resort
  return 'Data karyawan';
}

function resolveEmployeeNumber(employee: any, event?: any): string {
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
  if (event?.employeeNumber) return event.employeeNumber;
  if (event?.employeeId) return event.employeeId;
  if (event?.nomorIndukKaryawan) return event.nomorIndukKaryawan;
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

/**
 * Get event date string (YYYY-MM-DD) from event — tries multiple fields
 */
function getEventDateStr(event: any): string | null {
  // Primary: datetime.date field (attendance_events format)
  if (event.datetime?.date) return event.datetime.date;

  // Fallback: parse from timestamps
  const ts = event.tsServer || event.tsClient || event.createdAt;
  if (!ts) return null;

  try {
    let d: Date;
    if (ts instanceof Date) d = ts;
    else if (typeof ts === 'number') d = new Date(ts);
    else if (typeof ts === 'string') d = new Date(ts);
    else if (typeof ts.toDate === 'function') d = ts.toDate();
    else return null;

    return format(d, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

/**
 * Normalize event type for matching
 */
function getEventKind(type: string): 'in' | 'out' | null {
  const t = String(type).toLowerCase().trim();
  if (t === 'check-in' || t === 'tapin' || t === 'tap_in' || t === 'in') return 'in';
  if (t === 'check-out' || t === 'tapout' || t === 'tap_out' || t === 'out') return 'out';
  return null;
}

// ─── Per-employee Recap ────────────────────────────────────────────────────────

export function generateEmployeePayrollRecap(
  employee: EmployeeProfile,
  period: PayrollPeriod,
  allEvents: AttendanceEvent[],
  approvedPermissions: any[],
  brandMap: Map<string, string>
): PayrollRecapRow {
  const employeeId = (employee as any).id || (employee as any).uid || '';
  const employeeNumber = resolveEmployeeNumber(employee);
  const normalizedEmployeeNumber = normalizeEmployeeNumber(employeeNumber);

  // ── Effective date range ──
  let effectiveStart = startOfDay(period.startDate);
  let effectiveEnd = endOfDay(period.endDate);
  let isPartial = false;

  if (employee.joinDate) {
    try {
      const jd = employee.joinDate instanceof Date
        ? employee.joinDate
        : typeof (employee.joinDate as any).toDate === 'function'
          ? (employee.joinDate as any).toDate()
          : new Date(employee.joinDate as any);
      if (isAfter(jd, effectiveStart)) { effectiveStart = startOfDay(jd); isPartial = true; }
    } catch { /* skip */ }
  }

  if ((employee as any).resignDate) {
    try {
      const rd = (employee as any).resignDate instanceof Date
        ? (employee as any).resignDate
        : typeof (employee as any).resignDate.toDate === 'function'
          ? (employee as any).resignDate.toDate()
          : new Date((employee as any).resignDate);
      if (isBefore(rd, effectiveEnd)) { effectiveEnd = endOfDay(rd); isPartial = true; }
    } catch { /* skip */ }
  }

  const hariKerja = getWorkingDays(effectiveStart, effectiveEnd);

  // ── Filter events for this employee ──
  const myEvents = allEvents.filter(e => {
    const ev = e as any;
    // Match employee by UID
    const uid = ev.uid || ev.userId || ev.employeeUid;
    if (uid && uid === employeeId) return true;

    // Match employee by normalized employee number
    const empNo = ev.employeeNumber || ev.nomorIndukKaryawan;
    if (empNo && normalizeEmployeeNumber(empNo) === normalizedEmployeeNumber) return true;

    return false;

    // Date range filter
    const dateStr = getEventDateStr(ev);
    if (!dateStr) return false;

    try {
      const d = new Date(dateStr);
      return d >= startOfDay(effectiveStart) && d <= endOfDay(effectiveEnd);
    } catch {
      return false;
    }
  });

  const firstEvent = myEvents[0];

  // ── Build per-day maps ──
  const checkInByDay = new Map<string, any>();   // dateStr → event
  const checkOutByDay = new Map<string, any>();  // dateStr → event

  for (const ev of myEvents) {
    const dateStr = getEventDateStr(ev as any) || '';
    const kind = getEventKind((ev as any).type || '');
    if (kind === 'in' && !checkInByDay.has(dateStr)) checkInByDay.set(dateStr, ev);
    if (kind === 'out' && !checkOutByDay.has(dateStr)) checkOutByDay.set(dateStr, ev);
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ── Attendance stats ──
  const hadirDays = new Set<string>();
  let terlambat = 0;
  let menitTerlambat = 0;
  let pulangAwal = 0;
  let lupaHapIn = 0;
  let lupaHapOut = 0;
  let totalMinutes = 0;

  // Days with check-in = hadir
  for (const [dateStr, ev] of checkInByDay) {
    hadirDays.add(dateStr);

    // Late check-in
    const late = (ev as any).lateMinutes ?? 0;
    if (late > 0) { terlambat++; menitTerlambat += late; }

    // No check-out (only count as "lupa tap out" for past days, not today)
    if (!checkOutByDay.has(dateStr) && dateStr !== todayStr) {
      lupaHapOut++;
    }
  }

  // Days with check-out but no check-in
  for (const [dateStr] of checkOutByDay) {
    hadirDays.add(dateStr);
    if (!checkInByDay.has(dateStr) && dateStr !== todayStr) {
      lupaHapIn++;
    }

    // Early leave
    const ev = checkOutByDay.get(dateStr);
    const early = (ev as any).earlyLeaveMinutes ?? 0;
    if (early > 0) pulangAwal++;
  }

  // Work duration: only days with both in+out
  for (const [dateStr, inEv] of checkInByDay) {
    const outEv = checkOutByDay.get(dateStr);
    if (!outEv) continue;
    const workDur = (inEv as any).workDurationMinutes || (outEv as any).workDurationMinutes;
    if (workDur) {
      totalMinutes += workDur;
    }
  }

  const hadir = hadirDays.size;

  // ── Approved permissions in period ──
  const permissionsInPeriod = approvedPermissions.filter(perm => {
    // Match employee
    const permUid = perm.uid || perm.applicantUid || perm.requesterUid || perm.employeeUid;
    const permEmpNo = perm.employeeNumber || perm.nomorIndukKaryawan;

    const uidMatch = permUid && permUid === employeeId;
    const empNoMatch = permEmpNo && normalizeEmployeeNumber(permEmpNo) === normalizedEmployeeNumber;

    if (!uidMatch && !empNoMatch) return false;

    // Date check
    try {
      const ps = perm.startDate?.toDate?.() || new Date(perm.startDate);
      const pe = perm.endDate?.toDate?.() || new Date(perm.endDate);
      return isWithinInterval(ps, { start: effectiveStart, end: effectiveEnd }) ||
             isWithinInterval(pe, { start: effectiveStart, end: effectiveEnd }) ||
             (isBefore(ps, effectiveStart) && isAfter(pe, effectiveEnd));
    } catch { return false; }
  });

  // ── Count permission days (izin including sakit) ──
  let izin = 0;
  const leaveDetails: any[] = [];

  for (const perm of permissionsInPeriod) {
    const formType = perm.formType || perm.type || 'izin';
    // Include specific forms
    const isPermission = [
      'sakit', 'tidak_masuk', 'datang_terlambat', 'pulang_awal',
      'keluar_kantor', 'duka', 'akademik', 'administrasi_resmi',
      'lainnya', 'keperluan_pribadi', 'izin', 'permission', 'sick'
    ].some(t => String(formType).toLowerCase().includes(t));

    if (!isPermission) continue;

    try {
      const ps = startOfDay(perm.startDate?.toDate?.() || new Date(perm.startDate));
      const pe = endOfDay(perm.endDate?.toDate?.() || new Date(perm.endDate));

      // Count working days in permission that fall within period
      const permDays = eachDayOfInterval({ start: ps, end: pe })
        .filter(d => d >= startOfDay(effectiveStart) && d <= endOfDay(effectiveEnd))
        .filter(d => !isWeekend(d));

      izin += permDays.length;

      // Record details
      for (const day of permDays) {
        leaveDetails.push({
          date: format(day, 'yyyy-MM-dd'),
          type: formType,
          formType: perm.formType,
          reasonType: perm.reasonType || '',
          keterangan: perm.keterangan || perm.notes || perm.reason || '',
          days: 1,
          status: perm.status || 'approved',
        });
      }
    } catch { /* skip */ }
  }

  const dinas = permissionsInPeriod.filter(p => {
    const t = (p.type || p.formType || '').toLowerCase();
    return t === 'dinas' || t === 'business_trip';
  }).length;

  // ── Alpha: past working days only ──
  const effectiveWorkingDays = eachDayOfInterval({
    start: startOfDay(effectiveStart),
    end: startOfDay(effectiveEnd),
  }).filter(d => !isWeekend(d));

  let alpha = 0;
  for (const day of effectiveWorkingDays) {
    const dateStr = format(day, 'yyyy-MM-dd');
    // Skip today and future dates
    if (dateStr >= todayStr) continue;
    // Skip if has attendance
    if (hadirDays.has(dateStr)) continue;
    // Skip if has approved permission on that day
    const hasPermission = permissionsInPeriod.some(perm => {
      try {
        const ps = startOfDay(perm.startDate?.toDate?.() || new Date(perm.startDate));
        const pe = endOfDay(perm.endDate?.toDate?.() || new Date(perm.endDate));
        return day >= ps && day <= pe;
      } catch { return false; }
    });
    if (hasPermission) continue;
    alpha++;
  }

  return {
    employeeId,
    fullName: resolveName(employee, firstEvent) || 'Data karyawan',
    employeeNumber: employeeNumber || '',
    brandId: resolveBrandId(employee) || '',
    brandName: resolveBrandName(employee, brandMap),
    divisionId: (employee as any).divisionId,
    divisionName: resolveDivision(employee),
    hariKerja,
    hadir,
    terlambat,
    menitTerlambat,
    pulangAwal,
    lupaHapIn,
    lupaHapOut,
    izin,
    dinas,
    alpha,
    totalJamKerja: Math.floor(totalMinutes / 60),
    leaveDetails,
    effectiveStart,
    effectiveEnd,
    isPartial,
  };
}

// ─── Batch Recap ──────────────────────────────────────────────────────────────

export function generatePayrollRecap(
  employees: EmployeeProfile[],
  period: PayrollPeriod,
  attendanceEvents: AttendanceEvent[],
  approvedPermissions: any[],
  brands: any[]
): PayrollRecapRow[] {
  const brandMap = new Map(brands.map((b: any) => [b.id, b.name]));

  return employees
    .filter(emp => {
      if ((emp as any).isActive === false) return false;
      const status = ((emp as any).status || (emp as any).employmentStatus || '').toLowerCase();
      if (status === 'inactive' || status === 'nonaktif') return false;

      // Must be Web Absen
      const method = (emp as any).attendanceMethod || (emp as any).hrdEmploymentInfo?.attendanceMethod;
      if (!isWebAbsenMethod(method)) return false;

      // Exclude non-operational roles
      const role = (emp as any).role || (emp as any).hrdEmploymentInfo?.role || '';
      if (isExcludedRole(role)) return false;

      return true;
    })
    .map(emp => generateEmployeePayrollRecap(emp, period, attendanceEvents, approvedPermissions, brandMap))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
}
