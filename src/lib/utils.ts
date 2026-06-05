import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { add, addDays, format } from "date-fns";
import { id as idLocale } from 'date-fns/locale';
import type { JobApplication } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string = ""): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function parseDateValue(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const anyValue = value as any;
    if (typeof anyValue.toDate === "function") {
      return anyValue.toDate();
    }
    if (
      typeof anyValue.seconds === "number" &&
      typeof anyValue.nanoseconds === "number"
    ) {
      return new Date(anyValue.seconds * 1000 + anyValue.nanoseconds / 1e6);
    }
  }
  return null;
}

export interface ScheduleConfig {
  startDate: Date;
  startTime: string; // "HH:mm"
  slotDuration: number;
  buffer: number;
  workdayEndTime: string; // "HH:mm"
}

export interface GeneratedSlot {
  candidate: JobApplication;
  startAt: Date;
  endAt: Date;
}

export function generateTimeSlots(
  candidates: JobApplication[],
  config: ScheduleConfig,
): GeneratedSlot[] {
  const { startDate, startTime, slotDuration, buffer, workdayEndTime } = config;

  let currentDay = new Date(startDate);
  const [startHour, startMinute] = startTime.split(":").map(Number);
  currentDay.setHours(startHour, startMinute, 0, 0);

  const [endHour, endMinute] = workdayEndTime.split(":").map(Number);

  let currentTime = new Date(currentDay);

  const slots: GeneratedSlot[] = [];

  for (const candidate of candidates) {
    const slotEndTime = add(currentTime, { minutes: slotDuration });

    // Check if the slot exceeds the workday end time
    if (
      slotEndTime.getHours() > endHour ||
      (slotEndTime.getHours() === endHour &&
        slotEndTime.getMinutes() > endMinute)
    ) {
      // Move to the next day and reset the time
      currentDay = addDays(currentDay, 1);
      currentDay.setHours(startHour, startMinute, 0, 0);
      currentTime = new Date(currentDay);
    }

    slots.push({
      candidate,
      startAt: new Date(currentTime),
      endAt: add(currentTime, { minutes: slotDuration }),
    });

    // Move to the start of the next slot
    currentTime = add(currentTime, { minutes: slotDuration + buffer });
  }

  return slots;
}

export function generateUniqueCode(length = 8): string {
  const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Standardizes Indonesian date and time formatting across the application.
 * Escapes the literal 'pukul' to prevent unescaped latin alphabet character errors.
 */
export function formatIndonesianDateTime(date: Date | null | undefined | string | number): string {
  if (!date) return '-';
  try {
    const parsedDate = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return format(parsedDate, "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale });
  } catch (error) {
    return '-';
  }
}

/**
 * Normalizes a job cover image URL so it always resolves to a serveable image.
 *
 * Problem: Google Drive `uc?export=view` URLs redirect to lh3.googleusercontent.com
 * which Next.js <Image> doesn't follow, and /api/storage/view requires auth (401 on
 * public pages). The /api/storage/google-drive-preview route uses the service account
 * and needs no end-user auth, making it safe for both admin and public pages.
 *
 * Handles:
 *   - https://drive.google.com/uc?export=view&id=FILE_ID
 *   - https://drive.google.com/file/d/FILE_ID/view
 *   - /api/storage/view?fileId=FILE_ID  (auth-gated – convert to preview)
 *   - /api/storage/google-drive-preview?fileId=FILE_ID  (already correct)
 *   - https://firebasestorage.googleapis.com/…  (pass through)
 *   - blob: / relative  (pass through, only used during preview)
 */
export function normalizeJobCoverImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already the correct proxy — leave unchanged
  if (url.includes('/api/storage/google-drive-preview')) return url;

  // Auth-gated view route → swap to preview route (no auth required)
  const viewMatch = url.match(/\/api\/storage\/view\?fileId=([a-zA-Z0-9_-]+)/);
  if (viewMatch) {
    return `/api/storage/google-drive-preview?fileId=${viewMatch[1]}`;
  }

  // drive.google.com/uc?export=view&id=FILE_ID  (and variants)
  const ucMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (url.includes('drive.google.com') && ucMatch) {
    return `/api/storage/google-drive-preview?fileId=${ucMatch[1]}`;
  }

  // drive.google.com/file/d/FILE_ID/…
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch) {
    return `/api/storage/google-drive-preview?fileId=${fileMatch[1]}`;
  }

  // Firebase Storage, blob, or any other URL — pass through unchanged
  return url;
}
