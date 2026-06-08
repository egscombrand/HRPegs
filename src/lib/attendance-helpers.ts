/**
 * Helper functions untuk Monitoring Absensi HRP
 * Mengelola resolusi UID, event type, foto, dan alamat dari Web Absen data
 */

import type { EmployeeProfile, AttendanceEvent } from '@/lib/types';

/**
 * Resolve UID dari employee profile dengan fallback logic
 */
export function resolveProfileUid(profile: any): string | null {
  return (
    profile.uid ||
    profile.userId ||
    profile.authUid ||
    profile.employeeUid ||
    profile.id ||
    profile.__id ||
    null
  );
}

/**
 * Resolve UID dari attendance event dengan fallback logic
 */
export function resolveEventUid(event: any): string | null {
  return (
    event.employeeUid ||
    event.userId ||
    event.uid ||
    event.ownerUid ||
    event.createdBy ||
    event.employee?.uid ||
    null
  );
}

/**
 * Event type yang menunjukkan Kehadiran Masuk (Check In)
 */
export function isCheckInEvent(type: string): boolean {
  const checkInTypes = [
    'tap_in',
    'check_in',
    'kehadiran_masuk',
    'masuk',
    'in',
  ];
  return checkInTypes.includes((type || '').toLowerCase());
}

/**
 * Event type yang menunjukkan Kehadiran Pulang (Check Out)
 */
export function isCheckOutEvent(type: string): boolean {
  const checkOutTypes = [
    'tap_out',
    'check_out',
    'kehadiran_pulang',
    'pulang',
    'out',
  ];
  return checkOutTypes.includes((type || '').toLowerCase());
}

/**
 * Resolve foto/evidence dari attendance event
 */
export function resolvePhotoUrl(event: any): string | null {
  if (!event) return null;

  // Cari di evidence object
  if (event.evidence) {
    return (
      event.evidence.driveViewUrl ||
      event.evidence.driveDownloadUrl ||
      event.evidence.selfieUrl ||
      event.evidence.watermarkedSelfieUrl ||
      null
    );
  }

  // Fallback ke top-level fields
  return (
    event.photoUrl ||
    event.selfieUrl ||
    event.evidenceUrl ||
    null
  );
}

/**
 * Resolve alamat lengkap dari attendance event
 */
export function resolveAddress(event: any): string {
  if (!event) return '-';

  // Direct address fields
  if (event.address || event.fullAddress) {
    return event.address || event.fullAddress;
  }

  // Location object
  if (event.location?.address || event.location?.fullAddress) {
    return event.location.address || event.location.fullAddress;
  }

  // Address detail object
  if (event.addressDetail?.fullAddress) {
    return event.addressDetail.fullAddress;
  }

  // Build from components
  if (event.addressDetail) {
    const { road, village, city, state } = event.addressDetail;
    const parts = [road, village, city, state].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }

  // Fallback: show coordinates if address not available
  if (event.coordinates?.latitude && event.coordinates?.longitude) {
    return `${event.coordinates.latitude}, ${event.coordinates.longitude}`;
  }

  return '-';
}

/**
 * Resolve coordinates dari attendance event
 */
export function resolveCoordinates(event: any): { latitude: number; longitude: number } | null {
  if (!event) return null;

  if (event.coordinates?.latitude && event.coordinates?.longitude) {
    return {
      latitude: event.coordinates.latitude,
      longitude: event.coordinates.longitude,
    };
  }

  if (event.location?.latitude && event.location?.longitude) {
    return {
      latitude: event.location.latitude,
      longitude: event.location.longitude,
    };
  }

  return null;
}

/**
 * Format jam dari timestamp/Date
 */
export function formatTime(timestamp: any): string {
  if (!timestamp) return '-';

  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

/**
 * Hitung late minutes dari jam masuk vs jam kerja
 */
export function calculateLateMinutes(
  checkInTime: any,
  shiftStartTime: string // format "HH:mm"
): number | null {
  if (!checkInTime || !shiftStartTime) return null;

  try {
    const checkInDate = checkInTime.toDate ? checkInTime.toDate() : new Date(checkInTime);
    const [shiftHour, shiftMinute] = shiftStartTime.split(':').map(Number);

    const shiftStart = new Date(checkInDate);
    shiftStart.setHours(shiftHour, shiftMinute, 0, 0);

    if (checkInDate > shiftStart) {
      const diffMs = checkInDate.getTime() - shiftStart.getTime();
      return Math.round(diffMs / 60000); // Convert to minutes
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Hitung early leave minutes dari jam pulang vs jam kerja
 */
export function calculateEarlyLeaveMinutes(
  checkOutTime: any,
  shiftEndTime: string // format "HH:mm"
): number | null {
  if (!checkOutTime || !shiftEndTime) return null;

  try {
    const checkOutDate = checkOutTime.toDate ? checkOutTime.toDate() : new Date(checkOutTime);
    const [shiftHour, shiftMinute] = shiftEndTime.split(':').map(Number);

    const shiftEnd = new Date(checkOutDate);
    shiftEnd.setHours(shiftHour, shiftMinute, 0, 0);

    if (checkOutDate < shiftEnd) {
      const diffMs = shiftEnd.getTime() - checkOutDate.getTime();
      return Math.round(diffMs / 60000); // Convert to minutes
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Determine status dari check in/out events
 */
export function determineStatus(
  hasCheckIn: boolean,
  hasCheckOut: boolean,
  isOnLeave: boolean
): string {
  if (isOnLeave) return 'Cuti Tahunan';
  if (hasCheckIn && hasCheckOut) return 'Selesai';
  if (hasCheckIn && !hasCheckOut) return 'Sedang Bekerja';
  return 'Belum Tap In';
}
