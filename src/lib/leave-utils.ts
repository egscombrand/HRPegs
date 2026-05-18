import { differenceInCalendarDays, eachDayOfInterval, isSaturday, isSunday } from 'date-fns';
import { UserProfile, EmployeeProfile } from './types';

export type LeaveEligibility = {
  isEligible: boolean;
  reason?: string;
  allowance: number;
};

/**
 * Calculates leave duration excluding Saturdays and Sundays.
 */
export function calculateLeaveDuration(start: Date | string, end: Date | string): number {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) return 0;
    
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    return days.filter(d => !isSaturday(d) && !isSunday(d)).length;
  } catch (error) {
    console.error("Error in calculateLeaveDuration:", error);
    return 0;
  }
}

/**
 * Parses contract duration from many formats:
 * "12 Bulan", "12 bulan", 12, "12", "1 tahun", etc.
 */
export function parseContractDurationMonths(durasi?: string | number): number {
  if (!durasi) return 0;
  
  // Already a number
  if (typeof durasi === 'number') return durasi;
  
  const s = String(durasi).trim();
  
  // "12 Bulan" / "12 bulan"
  const bulanMatch = s.match(/^(\d+)\s*bulan$/i);
  if (bulanMatch) return parseInt(bulanMatch[1], 10);
  
  // "1 Tahun" / "1 tahun" → 12 months
  const tahunMatch = s.match(/^(\d+)\s*tahun$/i);
  if (tahunMatch) return parseInt(tahunMatch[1], 10) * 12;
  
  // Plain number string "12"
  const numMatch = s.match(/^(\d+)$/);
  if (numMatch) return parseInt(numMatch[1], 10);
  
  return 0;
}

/**
 * Helper to check if a user is eligible for annual leave based on their employment status.
 * Reads hrdEmploymentInfo from employeeProfile (employee_profiles collection).
 */
export function checkLeaveEligibility(
  user: UserProfile | null,
  profile?: EmployeeProfile | null
): LeaveEligibility {
  if (!user) return { isEligible: false, reason: "Sesi tidak valid.", allowance: 0 };
  
  if (!user.isActive) {
    return { isEligible: false, reason: "Status akun Anda tidak aktif.", allowance: 0 };
  }

  // Super Admin & HRD bypass for testing and operations
  if (user.role === 'super-admin' || user.role === 'hrd') {
    return { isEligible: true, allowance: 15 };
  }

  // Read hrdEmploymentInfo — the primary source (from employee_profiles)
  const hrdInfo: any = (profile as any)?.hrdEmploymentInfo || {};

  // Resolve employment type from all possible field names
  const employeeType = String(
    hrdInfo.employeeType ||
    hrdInfo.jenisKontrak ||
    hrdInfo.contractType ||
    hrdInfo.tipeKaryawan ||
    hrdInfo.employmentType ||
    user.employmentType ||
    ""
  ).toLowerCase().trim();

  // Resolve employment stage/status
  const stage = String(
    hrdInfo.employmentStatus ||
    hrdInfo.statusKerja ||
    hrdInfo.employmentStage ||
    user.employmentStage ||
    ""
  ).toLowerCase().trim();

  // Fast-pass: if annualLeaveAllowance or hakCutiTahunan is explicitly set > 0, immediately eligible
  const explicitAllowance = Number(
    hrdInfo.annualLeaveAllowance ||
    hrdInfo.hakCutiTahunan ||
    hrdInfo.leaveAllowance ||
    0
  );
  if (explicitAllowance > 0) {
    return { isEligible: true, allowance: explicitAllowance };
  }

  // 1. Magang does not get leave
  if (employeeType.includes('magang') || employeeType.includes('intern')) {
    return { isEligible: false, reason: "Magang tidak mendapat cuti tahunan.", allowance: 0 };
  }

  // 2. Probation/training does not get leave
  if (
    employeeType.includes('probation') || 
    employeeType.includes('training') || 
    stage.includes('probation') || 
    stage.includes('training')
  ) {
    return { isEligible: false, reason: "Probation/training tidak mendapat cuti tahunan.", allowance: 0 };
  }

  // 3. Karyawan Tetap gets 15 days
  if (employeeType.includes('tetap') || employeeType.includes('permanent')) {
    return { isEligible: true, allowance: 15 };
  }

  // 4. Karyawan Kontrak — check duration
  if (employeeType.includes('kontrak') || employeeType.includes('contract')) {
    // Try duration field first (many formats)
    const durasiRaw = hrdInfo.durasiKontrak || hrdInfo.contractDurationMonths || hrdInfo.contractDuration || "";
    let months = parseContractDurationMonths(durasiRaw);
    
    // Fallback: calculate from start/end dates
    if (months === 0) {
      const start = hrdInfo.contractStartDate || hrdInfo.kontrakMulai;
      const end = hrdInfo.contractEndDate || hrdInfo.kontrakSelesai;
      if (start && end) {
        const diff = differenceInCalendarDays(new Date(end), new Date(start));
        months = Math.round(diff / 30);
      }
    }

    if (months >= 12) {
      return { isEligible: true, allowance: 12 };
    } else {
      return { 
        isEligible: false, 
        reason: `Kontrak kurang dari 1 tahun (${months || 0} bulan) tidak mendapat cuti tahunan.`, 
        allowance: 0 
      };
    }
  }

  return { 
    isEligible: false, 
    reason: "Anda belum memiliki hak cuti tahunan berdasarkan status kerja saat ini.", 
    allowance: 0 
  };
}
