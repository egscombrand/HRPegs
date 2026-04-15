import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { add, addDays } from "date-fns";
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
