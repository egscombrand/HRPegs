/**
 * Attendance data synchronization utilities
 * Handles joining attendance_settings with employee_profiles
 */

import type { EmployeeProfile } from '@/lib/types';

/**
 * Normalize employee number for matching
 * Remove spaces, dashes, convert to uppercase for consistent comparison
 */
export function normalizeEmployeeNumber(employeeNumber: string | null | undefined): string {
  if (!employeeNumber) return '';
  return employeeNumber
    .toString()
    .trim()
    .replace(/[\s\-_]/g, '') // Remove spaces, dashes, underscores
    .toUpperCase();
}

/**
 * Search for employee profile with fallback chain
 */
export function findEmployeeProfile(
  profiles: EmployeeProfile[],
  searchCriteria: {
    uid?: string;
    employeeProfileId?: string;
    employeeNumber?: string;
    email?: string;
  }
): EmployeeProfile[] {
  const results: EmployeeProfile[] = [];
  const seen = new Set<string>();

  // Helper to add unique results
  const addResult = (profile: EmployeeProfile) => {
    if (profile.id && !seen.has(profile.id)) {
      results.push(profile);
      seen.add(profile.id);
    }
  };

  // 1. Try uid first (most direct match)
  if (searchCriteria.uid) {
    const match = profiles.find(p => p.id === searchCriteria.uid);
    if (match) {
      addResult(match);
      return results;
    }
  }

  // 2. Try employeeProfileId
  if (searchCriteria.employeeProfileId) {
    const match = profiles.find(
      p => p.id === searchCriteria.employeeProfileId ||
           (p as any).employeeProfileId === searchCriteria.employeeProfileId
    );
    if (match) {
      addResult(match);
      return results;
    }
  }

  // 3. Try normalized employeeNumber (most flexible)
  if (searchCriteria.employeeNumber) {
    const normalized = normalizeEmployeeNumber(searchCriteria.employeeNumber);
    const matches = profiles.filter(p => {
      const empNum = p.employeeNumber || (p as any).employeeId || (p as any).employeeCode;
      return normalizeEmployeeNumber(empNum) === normalized;
    });
    matches.forEach(addResult);
    if (results.length > 0) return results;
  }

  // 4. Try email
  if (searchCriteria.email) {
    const emailLower = searchCriteria.email.toLowerCase();
    const matches = profiles.filter(
      p => p.email?.toLowerCase() === emailLower ||
           (p as any).contactInfo?.email?.toLowerCase() === emailLower
    );
    matches.forEach(addResult);
    if (results.length > 0) return results;
  }

  return results;
}

/**
 * Extract sync data from profile
 */
export function extractProfileSyncData(profile: EmployeeProfile) {
  return {
    uid: profile.id,
    employeeProfileId: profile.id,
    employeeName:
      profile.fullName ||
      profile.dataDiriIdentitas?.fullName ||
      (profile as any).namaLengkap ||
      profile.name ||
      '',
    email: profile.email || '',
    brandId: (profile as any).hrdEmploymentInfo?.brandId || profile.brandId || '',
    brandName: (profile as any).hrdEmploymentInfo?.brandName || profile.brandName || '',
    divisionId: (profile as any).hrdEmploymentInfo?.divisionId || '',
    divisionName:
      (profile as any).hrdEmploymentInfo?.divisionName ||
      (profile as any).hrdEmploymentInfo?.divisi ||
      profile.divisionName ||
      profile.division ||
      '',
  };
}

/**
 * Type for attendance settings document
 */
export interface AttendanceSettings {
  id?: string;
  uid: string;
  employeeProfileId?: string;
  employeeNumber?: string;
  employeeName?: string;
  email?: string;
  brandId?: string;
  brandName?: string;
  divisionId?: string;
  divisionName?: string;
  attendanceMethod?: 'id_card' | 'web_absen' | 'fingerprint' | 'not_set';
  lastSyncedAt?: Date;
  syncStatus?: 'synced' | 'pending' | 'error';
  [key: string]: any; // Allow other fields from original document
}
