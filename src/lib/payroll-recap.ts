/**
 * Payroll Recap Calculation
 * Generates attendance summary for payroll processing
 */

import { startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, differenceInDays, isWithinInterval, isBefore, isAfter } from 'date-fns';
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

  // Leave stats
  izin: number;
  cuti: number;
  sakit: number;
  dinas: number;
  alpha: number;

  // Work stats
  totalJamKerja: number;

  // Metadata
  joinDate?: Date;
  resignDate?: Date;
  effectiveStart: Date;
  effectiveEnd: Date;
  isPartial: boolean;
}

/**
 * Calculate payroll period based on mode
 */
export function calculatePayrollPeriod(
  mode: PeriodMode,
  monthOffset: number = 0,
  customStart?: Date,
  customEnd?: Date
): PayrollPeriod {
  const today = new Date();
  const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  let startDate: Date;
  let endDate: Date;
  let displayLabel: string;

  if (mode === 'calendar') {
    startDate = startOfMonth(targetMonth);
    endDate = endOfMonth(targetMonth);
    displayLabel = `${startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
  } else if (mode === 'payroll') {
    // Payroll: 26th of previous month to 25th of current month
    const prevMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 26);
    startDate = new Date(prevMonth);
    endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 25);
    displayLabel = `Payroll ${targetMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
  } else {
    // Custom range
    startDate = customStart || startOfMonth(today);
    endDate = customEnd || endOfMonth(today);
    displayLabel = `${startDate.toLocaleDateString('id-ID')} – ${endDate.toLocaleDateString('id-ID')}`;
  }

  return { mode, startDate, endDate, displayLabel };
}

/**
 * Get all working days (Mon-Fri) in period
 */
export function getWorkingDays(startDate: Date, endDate: Date): number {
  const allDays = eachDayOfInterval({ start: startDate, end: endDate });
  return allDays.filter(d => !isWeekend(d)).length;
}

/**
 * Helper: resolve employee brand
 */
function resolveBrandId(profile: any): string | null {
  const id = profile.hrdEmploymentInfo?.brandId || profile.brandId;
  return typeof id === 'string' ? id : null;
}

function resolveBrandName(profile: any, brandMap: Map<string, string>): string {
  const bId = resolveBrandId(profile);
  if (bId) return brandMap.get(bId) || bId;
  return profile.hrdEmploymentInfo?.brandName || profile.brandName || 'Unknown';
}

function resolveDivision(profile: any): string {
  return profile.hrdEmploymentInfo?.divisionName ||
         profile.hrdEmploymentInfo?.divisi ||
         profile.divisionName ||
         profile.division ||
         '-';
}

/**
 * Generate payroll recap for a single employee
 */
export function generateEmployeePayrollRecap(
  employee: EmployeeProfile,
  period: PayrollPeriod,
  attendanceEvents: AttendanceEvent[],
  approvedLeaves: any[],
  brandMap: Map<string, string>,
  overtimeData: any[] = [],
  otherAbsenceData: any[] = []
): PayrollRecapRow {
  // Calculate effective period for this employee
  let effectiveStart = period.startDate;
  let effectiveEnd = period.endDate;
  let isPartial = false;

  if (employee.joinDate) {
    const joinDate = employee.joinDate instanceof Date ? employee.joinDate : new Date((employee.joinDate as any).toDate?.() || employee.joinDate);
    if (isAfter(joinDate, period.startDate)) {
      effectiveStart = joinDate;
      isPartial = true;
    }
  }

  if ((employee as any).resignDate) {
    const resignDate = (employee as any).resignDate instanceof Date ? (employee as any).resignDate : new Date(((employee as any).resignDate as any).toDate?.() || (employee as any).resignDate);
    if (isBefore(resignDate, period.endDate)) {
      effectiveEnd = resignDate;
      isPartial = true;
    }
  }

  // Count working days in effective period
  const hariKerja = getWorkingDays(effectiveStart, effectiveEnd);

  // Get employee attendance events in period
  const employeeUid = (employee as any).id || (employee as any).uid;
  const employeeNumber = employee.employeeNumber || (employee as any).employeeId;

  const employeeEvents = attendanceEvents.filter(e => {
    const eventUid = (e as any).uid || (e as any).userId || (e as any).employeeUid;
    const eventEmpNo = (e as any).employeeNumber || (e as any).nomorIndukKaryawan;

    const eventDate = new Date((e as any).datetime?.date || new Date());
    const inPeriod = isWithinInterval(eventDate, { start: effectiveStart, end: effectiveEnd });

    return inPeriod && (eventUid === employeeUid || eventEmpNo === employeeNumber);
  });

  // Count attendance days
  const attendanceDays = new Set<string>();
  let terlambat = 0;
  let menitTerlambat = 0;
  let pulangAwal = 0;
  let lupaHapIn = 0;
  let lupaHapOut = 0;
  let totalJamKerja = 0;

  for (const event of employeeEvents) {
    const dateStr = (event as any).datetime?.date || new Date().toISOString().split('T')[0];
    const eventType = (event as any).type || '';

    if (eventType === 'check-in' || eventType === 'tapIn') {
      attendanceDays.add(dateStr);
      if ((event as any).lateMinutes && (event as any).lateMinutes > 0) {
        terlambat++;
        menitTerlambat += (event as any).lateMinutes;
      }
    } else if (eventType === 'check-out' || eventType === 'tapOut') {
      attendanceDays.add(dateStr);
      if ((event as any).earlyLeaveMinutes && (event as any).earlyLeaveMinutes > 0) {
        pulangAwal++;
      }
    }

    // Sum work duration
    if ((event as any).workDurationMinutes) {
      totalJamKerja += (event as any).workDurationMinutes;
    }
  }

  // Detect incomplete attendance
  const checkInDays = new Set<string>();
  const checkOutDays = new Set<string>();
  for (const event of employeeEvents) {
    const dateStr = (event as any).datetime?.date || new Date().toISOString().split('T')[0];
    const eventType = (event as any).type || '';
    if (eventType === 'check-in' || eventType === 'tapIn') checkInDays.add(dateStr);
    if (eventType === 'check-out' || eventType === 'tapOut') checkOutDays.add(dateStr);
  }

  for (const day of checkInDays) {
    if (!checkOutDays.has(day)) lupaHapOut++;
  }
  for (const day of checkOutDays) {
    if (!checkInDays.has(day)) lupaHapIn++;
  }

  const hadir = attendanceDays.size;

  // Count approved leaves
  const employeeId = (employee as any).id;
  const approvedInPeriod = approvedLeaves.filter(leave => {
    if (leave.employeeId !== employeeId) return false;
    const startDate = leave.startDate?.toDate?.() || new Date(leave.startDate);
    const endDate = leave.endDate?.toDate?.() || new Date(leave.endDate);
    return isWithinInterval(startDate, { start: effectiveStart, end: effectiveEnd }) ||
           isWithinInterval(endDate, { start: effectiveStart, end: effectiveEnd }) ||
           (isBefore(startDate, effectiveStart) && isAfter(endDate, effectiveEnd));
  });

  const izin = approvedInPeriod.filter(l => l.type === 'izin' || l.leaveType === 'izin').length;
  const cuti = approvedInPeriod.filter(l => l.type === 'cuti' || l.leaveType === 'cuti').length;
  const sakit = approvedInPeriod.filter(l => l.type === 'sakit' || l.leaveType === 'sakit').length;
  const dinas = approvedInPeriod.filter(l => l.type === 'dinas' || l.leaveType === 'dinas').length;

  // Calculate alpha
  const alpha = Math.max(0, hariKerja - hadir - izin - cuti - sakit - dinas);

  // Convert minutes to hours for totalJamKerja
  const totalJamKerjaHours = Math.floor(totalJamKerja / 60);

  return {
    employeeId: employeeId || '',
    fullName: employee.fullName || employee.name || 'Unknown',
    employeeNumber: employeeNumber || 'N/A',
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
    cuti,
    sakit,
    dinas,
    alpha,
    totalJamKerja: totalJamKerjaHours,
    joinDate: employee.joinDate instanceof Date ? employee.joinDate : undefined,
    resignDate: (employee as any).resignDate instanceof Date ? (employee as any).resignDate : undefined,
    effectiveStart,
    effectiveEnd,
    isPartial,
  };
}

/**
 * Helper: normalize and check if attendance method is Web Absen
 */
function isWebAbsenMethod(method: any): boolean {
  if (!method) return false;
  const normalized = String(method).toLowerCase().trim();
  return normalized === 'web_absen' || normalized === 'web_absen' || normalized === 'web';
}

/**
 * Generate payroll recap for multiple employees
 */
export function generatePayrollRecap(
  employees: EmployeeProfile[],
  period: PayrollPeriod,
  attendanceEvents: AttendanceEvent[],
  approvedLeaves: any[],
  brands: any[],
  overtimeData: any[] = [],
  otherAbsenceData: any[] = []
): PayrollRecapRow[] {
  const brandMap = new Map(brands.map((b: any) => [b.id, b.name]));

  const rows = employees
    .filter(emp => {
      // Only active employees
      if ((emp as any).isActive === false) return false;
      const status = (emp as any).status || (emp as any).employmentStatus || '';
      if (status === 'inactive' || status === 'nonaktif') return false;

      // Only Web Absen employees
      const attendanceMethod = (emp as any).attendanceMethod ||
                              (emp as any).hrdEmploymentInfo?.attendanceMethod;
      if (!isWebAbsenMethod(attendanceMethod)) return false;

      return true;
    })
    .map(emp => generateEmployeePayrollRecap(
      emp,
      period,
      attendanceEvents,
      approvedLeaves,
      brandMap,
      overtimeData,
      otherAbsenceData
    ))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return rows;
}
