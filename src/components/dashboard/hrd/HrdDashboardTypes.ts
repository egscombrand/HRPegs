import type { Timestamp } from 'firebase/firestore';

export interface FilterState {
  date: Date;
  brandId?: string;
  siteId?: string;
  employmentType?: 'karyawan' | 'magang' | 'training';
  searchTerm: string;
  needsActionOnly: boolean;
}

export interface Kpi {
    title: string;
    value: string | number;
    delta?: string;
    deltaType?: 'default' | 'inverse';
    description?: string;
}

export interface AttendanceRecord {
  id: string; // userId
  name: string;
  brandName: string;
  brandId?: string | string[];
  siteId?: string;
  siteName?: string;
  employmentType?: 'karyawan' | 'magang' | 'training';
  tapIn: string;
  tapOut: string;
  tapInId: string | null;
  tapOutId: string | null;
  status: 'Sedang Bekerja' | 'Selesai' | 'Belum Tap In' | 'Belum Tap Out' | 'Cuti/Izin';
  mode: 'onsite' | 'offsite' | '-';
  photoUrl?: string | null;
  address: string;
  location: { lat: number; lng: number } | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  flags: ('late' | 'early' | 'no_tap_out')[];
}

export interface ChartData {
    trend: { date: string; hadir: number; terlambat: number; offsite: number }[];
    statusDistribution: { name: string; value: number; color: string }[];
    topLate: { name: string; totalLateMinutes: number }[];
}
