"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  uploadFileToGoogleDrive,
  UploadOptions,
} from "@/lib/storage/storage-adapter";
import {
  extractFileIdFromUrl,
  openSecureFile,
} from "@/lib/candidate-docs-utils";
import { useToast } from "@/hooks/use-toast";
import { AppModal } from "@/components/ui/AppModal";
import { DialogTitle } from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Plus,
  X,
  Search,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  CheckSquare,
  MapPin,
  Calendar,
  FileText,
  Wallet,
  Activity,
  ArrowUpDown,
  Filter,
  Navigation,
  Home,
  TrendingUp,
  ExternalLink,
  Upload,
} from "lucide-react";
import {
  BusinessTripMission,
  BusinessTripMissionMember,
  BusinessTripType,
  TRIP_TYPES,
  type FinalReport,
  type MemberFinalReport,
  type MemberNote,
  type MilestoneEvidence,
  type ReportReviewStatus,
} from "./types";
import { determineApprovalTarget } from "@/lib/travel-utils";
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import type {
  Brand,
  EmployeeProfile,
  EmployeeMasterData,
  UserProfile,
} from "@/lib/types";

// ===== Normalized Staff type for internal use =====
type NormalizedStaff = {
  uid: string;
  fullName: string;
  employeeId: string;
  brandId: string;
  brandName: string;
  divisionId: string;
  divisionName: string;
  jobTitle: string;
  managerUid: string;
  managerName: string;
  employmentStatus: string;
  employeeType: string;
  structuralPosition: string;
  isDivisionManager: boolean;
};

// ===== Exclusion constants =====
// Roles that should never appear in the staff picker
const EXCLUDED_USER_ROLES = new Set([
  "super-admin",
  "super_admin",
  "hrd",
  "hr",
  "admin-system",
  "system-admin",
  "system_admin",
  "admin_system",
  "kandidat",
  "candidate",
]);

// Structural positions to exclude (direktur/management level)
const EXCLUDED_STRUCTURAL_RE = /^(management|direktur|director)$/i;

// Job-title keywords that signal direktur/management
const EXCLUDED_TITLE_RE = /direktur|director|manajemen|management/i;

// ===== Helpers =====
function formatDate(value: any) {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return "-";
  }
}

function formatDateTime(value: any) {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  } catch {
    return "-";
  }
}

function renderStatusLabel(status?: string) {
  if (!status) return <Badge variant="secondary">Belum diisi</Badge>;
  switch (status) {
    case "pending_manager_validation":
      return <Badge variant="warning">Menunggu validasi</Badge>;
    case "waiting_staff_confirmation":
      return <Badge variant="warning">Menunggu konfirmasi staff</Badge>;
    case "pending_hrd_finalization":
      return <Badge variant="warning">Menunggu finalisasi HRD</Badge>;
    case "ready_to_depart":
    case "approved_ready_to_depart":
      return <Badge variant="success">Siap Berangkat</Badge>;
    case "on_duty":
      return <Badge variant="success">Sedang Bertugas</Badge>;
    case "returned_pending_report":
      return <Badge variant="warning">Menunggu Laporan Akhir</Badge>;
    case "final_report_submitted":
      return <Badge variant="info">Laporan Akhir Terkirim</Badge>;
    case "report_submitted":
    case "completed":
      return <Badge variant="success">Selesai</Badge>;
    case "rejected":
    case "cancelled":
      return <Badge variant="destructive">Dibatalkan</Badge>;
    // Computed UI statuses (tracking)
    case "in_progress":
      return <Badge variant="success">Sedang Berjalan</Badge>;
    case "at_location":
      return <Badge variant="success">Sudah Sampai Lokasi</Badge>;
    case "activity_in_progress":
      return <Badge variant="success">Kegiatan Berjalan</Badge>;
    case "activity_done":
      return <Badge variant="success">Kegiatan Selesai</Badge>;
    case "needs_attention":
      return <Badge variant="destructive">Butuh Perhatian</Badge>;
    case "waiting_final_report":
      return <Badge variant="warning">Menunggu Laporan Akhir</Badge>;
    default:
      return <Badge variant="secondary">{status.replace(/_/g, " ")}</Badge>;
  }
}

type TrackingStats = {
  total: number;
  departed: number;
  arrived: number;
  activityDone: number;
  returned: number;
  issues: number;
  lastUpdateAt: any;
  lastUpdateByName: string;
  memberNames: string[];
};

function computeTrackingDisplayStatus(
  mission: BusinessTripMission,
  tracking?: TrackingStats,
): string {
  const stored = mission.status ?? "draft_mission";
  if (
    ["pending_manager_validation", "waiting_staff_confirmation",
     "pending_hrd_finalization", "draft_mission",
     "rejected", "cancelled", "archived_duplicate"].includes(stored)
  ) return stored;
  if (["completed", "final_report_submitted", "report_submitted", "expense_submitted", "settlement_review"].includes(stored))
    return stored;

  if (!tracking || tracking.total === 0) return stored;
  if (tracking.issues > 0) return "needs_attention";
  if (tracking.returned >= tracking.total && tracking.total > 0) return "returned_pending_report";
  if (tracking.activityDone >= tracking.total && tracking.total > 0) return "activity_done";
  if (tracking.activityDone > 0) return "activity_in_progress";
  if (tracking.arrived >= tracking.total && tracking.total > 0) return "at_location";
  if (tracking.departed > 0) return "in_progress";
  return stored;
}

const STATUS_PRIORITY: Record<string, number> = {
  on_duty: 0,
  needs_attention: 1,
  activity_done: 2,
  activity_in_progress: 3,
  at_location: 4,
  in_progress: 5,
  approved_ready_to_depart: 6,
  returned_pending_report: 7,
  final_report_submitted: 8,
  report_submitted: 9,
  expense_submitted: 10,
  settlement_review: 10,
  pending_hrd_finalization: 11,
  waiting_staff_confirmation: 12,
  pending_manager_validation: 13,
  draft_mission: 14,
  completed: 15,
  rejected: 16,
  cancelled: 17,
  archived_duplicate: 18,
};

// ── Timeline category inference ───────────────────────────────────────────────
type TimelineCategory = "tracking" | "approval" | "changes" | "issues" | "system";

function inferMilestoneTypeFromMsg(msg: string): MilestoneEvidence["milestoneType"] {
  const lower = (msg ?? "").toLowerCase();
  if (lower.includes("keberangkatan") || lower.includes("berangkat")) return "departed";
  if (lower.includes("tiba di lokasi") || lower.includes("sampai lokasi")) return "arrived";
  if (lower.includes("kegiatan selesai")) return "activity_done";
  if (lower.includes("kembali")) return "returned";
  return "departed";
}

function inferTimelineCategory(entry: { message?: string; category?: string }): TimelineCategory {
  if (entry.category === "tracking") return "tracking";
  if (entry.category === "approval") return "approval";
  if (entry.category === "changes") return "changes";
  if (entry.category === "issues") return "issues";

  const msg = (entry.message ?? "").toLowerCase();

  // Issue keywords first (more specific)
  if (msg.includes("kendala") || msg.includes("melaporkan kendala")) return "issues";

  // Tracking journey keywords
  if (
    msg.includes("berangkat") || msg.includes("sampai lokasi") || msg.includes("tiba") ||
    msg.includes("kegiatan selesai") || msg.includes("sudah kembali") ||
    msg.includes("mengonfirmasi keberangkatan") || msg.includes("mengonfirmasi tiba") ||
    msg.includes("mengonfirmasi kembali") || msg.includes("mengonfirmasi kegiatan") ||
    msg.includes("status perjalanan")
  ) return "tracking";

  // Approval keywords
  if (
    msg.includes("disetujui") || msg.includes("ditolak") || msg.includes("validasi") ||
    msg.includes("konfirmasi") || msg.includes("finalisasi") || msg.includes("menunggu") ||
    msg.includes("manager") || msg.includes("hrd") || msg.includes("direktur")
  ) return "approval";

  // Change keywords
  if (
    msg.includes("diubah") || msg.includes("diperbarui") || msg.includes("diupdate") ||
    msg.includes("tanggal") || msg.includes("tujuan") || msg.includes("anggota") ||
    msg.includes("dokumen") || msg.includes("instruksi") || msg.includes("spd") ||
    msg.includes("ditambahkan") || msg.includes("dihapus") || msg.includes("diganti")
  ) return "changes";

  return "system";
}

// Helper: Normalize evidence fields from multiple possible sources
function normalizeEvidence(raw: any): MilestoneEvidence {
  // ─ Photos: try multiple field names (comprehensive list)
  let photos: MilestoneEvidence["photos"] = [];
  let photoSource = raw.photos || raw.photoUrls || raw.photoUrl || raw.evidencePhotos ||
                     raw.evidencePhotoUrls || raw.photo || raw.attachments || raw.files || [];

  // Handle nested evidence object
  if (!photoSource && raw.evidence && typeof raw.evidence === "object") {
    photoSource = raw.evidence.photos || raw.evidence.photoUrl || raw.evidence.photoUrls || [];
  }

  if (Array.isArray(photoSource)) {
    photos = photoSource
      .filter((p: any) => p != null)
      .map((p: any) => {
        // Handle different photo object formats
        if (typeof p === "string") {
          return {
            photoUrl: p,
            photoPath: null,
            originalFileName: null,
            compressedSize: null,
            uploadedAt: null,
            expiresAt: null,
          };
        }
        return {
          photoUrl: p?.photoUrl ?? p?.url ?? (typeof p === "string" ? p : null),
          photoPath: p?.photoPath ?? p?.path ?? null,
          originalFileName: p?.originalFileName ?? p?.name ?? p?.filename ?? null,
          compressedSize: p?.compressedSize ?? p?.size ?? null,
          uploadedAt: p?.uploadedAt ?? null,
          expiresAt: p?.expiresAt ?? null,
        };
      });
  } else if (typeof photoSource === "string") {
    photos = [{
      photoUrl: photoSource,
      photoPath: null,
      originalFileName: null,
      compressedSize: null,
      uploadedAt: null,
      expiresAt: null,
    }];
  } else if (photoSource && typeof photoSource === "object") {
    // Handle single photo object
    photos = [{
      photoUrl: photoSource.photoUrl ?? photoSource.url ?? null,
      photoPath: photoSource.photoPath ?? photoSource.path ?? null,
      originalFileName: photoSource.originalFileName ?? photoSource.name ?? null,
      compressedSize: photoSource.compressedSize ?? photoSource.size ?? null,
      uploadedAt: photoSource.uploadedAt ?? null,
      expiresAt: photoSource.expiresAt ?? null,
    }];
  }

  // ─ Address: try multiple field names (comprehensive list)
  const addressText = raw.addressText || raw.locationAddress || raw.address || raw.fullAddress ||
                      (raw.location && raw.location.address) || null;

  // ─ Latitude: try multiple field names
  const latitude = raw.latitude ?? raw.lat ?? raw.evidenceLat ??
                   (raw.location && (raw.location.latitude ?? raw.location.lat)) ?? null;

  // ─ Longitude: try multiple field names
  const longitude = raw.longitude ?? raw.lng ?? raw.evidenceLng ??
                    (raw.location && (raw.location.longitude ?? raw.location.lng)) ?? null;

  // ─ Location accuracy: try multiple field names
  const locationAccuracy = raw.locationAccuracy ?? raw.accuracy ?? raw.evidenceAccuracy ?? null;

  // ─ Target members: fallback to message parsing if empty
  let targetMemberNames = raw.targetMemberNames || [];
  let targetMemberUids = raw.targetMemberUids || [];
  if ((!targetMemberNames || targetMemberNames.length === 0) && raw.message) {
    const forMatch = (raw.message as string).match(/untuk:\s*([^.]+?)\s+pada\s/i);
    if (forMatch) {
      targetMemberNames = [forMatch[1].trim()];
    }
  }

  const normalized = {
    id: raw.id ?? "",
    missionId: raw.missionId ?? "",
    milestoneType: raw.milestoneType ?? "departed",
    confirmedByUid: raw.confirmedByUid ?? raw.byUid ?? "",
    confirmedByName: raw.confirmedByName ?? raw.byName ?? "",
    targetMemberUids,
    targetMemberNames,
    createdAt: raw.createdAt,
    latitude,
    longitude,
    locationAccuracy,
    locationCapturedAt: raw.locationCapturedAt ?? null,
    locationStatus: raw.locationStatus ?? raw.evidenceLocationStatus ?? "unavailable",
    locationTrustLevel: raw.locationTrustLevel ?? raw.evidenceLocationTrust ?? raw.trustLevel ?? null,
    addressText,
    streetName: raw.streetName ?? null,
    village: raw.village ?? null,
    district: raw.district ?? null,
    city: raw.city ?? null,
    province: raw.province ?? null,
    postalCode: raw.postalCode ?? null,
    country: raw.country ?? null,
    geocodeStatus: raw.geocodeStatus ?? null,
    manualLocationNote: raw.manualLocationNote ?? null,
    note: raw.note ?? null,
    photos,
  };

  // Debug: log detailed structure (can be removed after fixing)
  if (!photos.some(p => p.photoUrl) && !addressText && latitude === null) {
    console.warn("⚠️ Evidence normalized but no photos/location found. Raw object keys:", Object.keys(raw));
  }

  return normalized;
}

// Helper: Collect evidence from multiple sources (timeline + milestone_evidences + members)
function collectEvidenceSources(
  activeMissionTimeline: any[],
  activeMissionEvidences: MilestoneEvidence[],
  activeMissionMembers: BusinessTripMissionMember[],
  missionId: string,
): MilestoneEvidence[] {
  // ─ Source 1: Built from timeline entries (has evidence metadata embedded)
  const timelineEvidence: MilestoneEvidence[] = activeMissionTimeline
    .filter((e: any) => {
      const cat = inferTimelineCategory(e);
      return cat === "tracking" && (e.milestoneType || inferMilestoneTypeFromMsg(e.message));
    })
    .map((e: any) => normalizeEvidence({
      id: e.evidenceId ?? e.id,
      missionId,
      milestoneType: e.milestoneType ?? inferMilestoneTypeFromMsg(e.message ?? ""),
      confirmedByUid: e.confirmedByUid ?? e.byUid,
      confirmedByName: e.confirmedByName ?? e.byName,
      targetMemberUids: e.targetMemberUids,
      targetMemberNames: e.targetMemberNames,
      createdAt: e.createdAt,
      evidenceLat: e.evidenceLat,
      evidenceLng: e.evidenceLng,
      evidenceAccuracy: e.evidenceAccuracy,
      evidenceAddress: e.evidenceAddress,
      evidenceLocationStatus: e.evidenceLocationStatus,
      evidenceLocationTrust: e.evidenceLocationTrust,
      evidenceManualNote: e.evidenceManualNote,
      evidencePhotos: e.evidencePhotos,
      trustLevel: e.trustLevel,
      message: e.message,
    }));

  // ─ Source 2: milestone_evidences from Firestore (normalize + prefer these)
  const normalizedMilestoneEvidence = activeMissionEvidences.map((e) => normalizeEvidence({ ...e, missionId }));

  console.log("📸 collectEvidenceSources debug:", {
    timelineEntriesTotal: activeMissionTimeline.length,
    timelineTrackingEntries: activeMissionTimeline.filter((e: any) => inferTimelineCategory(e) === "tracking").length,
    timelineEvidenceBuilt: timelineEvidence.length,
    timelineEvidenceWithPhotos: timelineEvidence.filter((e) => (e.photos?.length ?? 0) > 0).length,
    milestone_evidencesCount: activeMissionEvidences.length,
    milestone_evidencesWithPhotos: normalizedMilestoneEvidence.filter((e) => (e.photos?.length ?? 0) > 0).length,
  });

  const evidenceColIds = new Set(normalizedMilestoneEvidence.map((e) => e.id));

  // ─ Combine: prefer milestone_evidences, supplement with timeline evidence for fallback
  const allEvidence: MilestoneEvidence[] = [
    ...normalizedMilestoneEvidence,
    ...timelineEvidence.filter((e) => !evidenceColIds.has(e.id!)),
  ];

  // Detailed logging for debugging
  console.log("normalized evidence detail", JSON.stringify(allEvidence, null, 2));
  allEvidence.forEach((ev, idx) => {
    console.log(`Evidence ${idx}:`, {
      id: ev.id,
      milestoneType: ev.milestoneType,
      confirmedBy: ev.confirmedByName,
      photosCount: ev.photos?.length ?? 0,
      hasAddress: !!ev.addressText,
      hasCoordinates: ev.latitude != null,
      accuracy: ev.locationAccuracy,
    });
  });

  return allEvidence;
}

// ── Date overlap helper ───────────────────────────────────────────────────────
function toTimestampSecs(ts: any): number {
  if (!ts) return 0;
  if (ts?.seconds) return ts.seconds;
  if (ts instanceof Date) return ts.getTime() / 1000;
  try { return new Date(ts).getTime() / 1000; } catch { return 0; }
}

function datesOverlap(
  aStart: any, aEnd: any,
  bStart: any, bEnd: any,
): boolean {
  const aS = toTimestampSecs(aStart);
  const aE = toTimestampSecs(aEnd);
  const bS = toTimestampSecs(bStart);
  const bE = toTimestampSecs(bEnd);
  if (!aS || !aE || !bS || !bE) return false;
  return aS <= bE && bS <= aE;
}

// ── Date-only helper (strips time, returns midnight Date) ─────────────────────
function toSeconds(ts: any): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.seconds;
  if (typeof ts === "object" && ts?.seconds) return ts.seconds;
  try { return new Date(ts).getTime() / 1000; } catch { return 0; }
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  try {
    if (ts instanceof Timestamp) return ts.toDate();
    if (typeof ts === "object" && ts?.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  } catch { return null; }
}

function toDateOnly(ts: any): Date | null {
  if (!ts) return null;
  let d: Date;
  if (ts?.seconds != null) d = new Date(ts.seconds * 1000);
  else if (ts instanceof Date) d = new Date(ts);
  else { try { d = new Date(ts); } catch { return null; } }
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

// Converts any Timestamp / Date / string to YYYY-MM-DD string
function toDateString(ts: any): string | undefined {
  const d = toDateOnly(ts);
  return d ? d.toISOString().slice(0, 10) : undefined;
}

// ── Staff availability computation ────────────────────────────────────────────
function computeStaffAvailabilityInfo(
  entries: StaffBusyEntry[],
  newMissionStart?: string,  // YYYY-MM-DD
  newMissionEnd?: string,    // YYYY-MM-DD
  excludeMissionId?: string,
): StaffAvailabilityDetail {
  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const filtered = entries.filter(m => !excludeMissionId || m.missionId !== excludeMissionId);

  if (filtered.length === 0) return { status: "available", missions: [] };

  const newStart = newMissionStart ? toDateOnly(newMissionStart) : null;
  const newEnd   = newMissionEnd   ? toDateOnly(newMissionEnd)   : null;
  const ONE_DAY  = 24 * 60 * 60 * 1000;

  const processed: StaffMissionOverlap[] = filtered.map(m => {
    const oldStart = toDateOnly(m.startDate);
    const oldEnd   = toDateOnly(m.endDate);
    let overlapType: StaffMissionOverlap["overlapType"] = "no_overlap";

    if (newStart && newEnd && oldStart && oldEnd) {
      const nS = newStart.getTime(), nE = newEnd.getTime();
      const oS = oldStart.getTime(), oE = oldEnd.getTime();

      // Strict date conflict: new starts BEFORE old ends AND old starts BEFORE new ends
      const isConflict = nS < oE && oS < nE;

      if (isConflict) {
        // Same calendar day (newStart == oldEnd) counts as continuation, not conflict
        if (nS === oE) {
          overlapType = "continuation";
        } else {
          overlapType = "conflict";
        }
      } else if (nS >= oE) {
        // New mission starts on or after old ends
        const daysDiff = (nS - oE) / ONE_DAY;
        if (daysDiff <= 2) overlapType = "continuation";
        // else: no_overlap (available after enough gap)
      }
    }

    return { ...m, overlapType };
  });

  // Determine worst-case badge status
  const hasConflict     = processed.some(m => m.overlapType === "conflict");
  const hasContinuation = processed.some(m => m.overlapType === "continuation");

  // For non-overlap missions: is the staff currently on duty or future?
  const hasActiveNow = processed.some(m => {
    const oS = toDateOnly(m.startDate)?.getTime() ?? 0;
    const oE = toDateOnly(m.endDate)?.getTime()   ?? 0;
    return oS <= todayMs && todayMs <= oE;
  });

  let status: StaffAvailabilityStatus;
  if (hasConflict)       status = "conflict";
  else if (hasContinuation) status = "continuation";
  else if (hasActiveNow) status = "on_duty";
  else                   status = "will_be_on_duty";

  const latestEndDate = processed.reduce<any>((latest, m) => {
    return toTimestampSecs(m.endDate) > toTimestampSecs(latest) ? m.endDate : latest;
  }, processed[0].endDate);

  return { status, missions: processed, latestEndDate };
}

function formatMemberApprovalStatus(
  status: string | undefined,
  managerName?: string,
): string {
  switch (status) {
    case "approved_by_manager":
    case "approved":
      return managerName ? `Disetujui oleh ${managerName}` : "Disetujui";
    case "rejected_by_manager":
    case "rejected":
      return managerName ? `Ditolak oleh ${managerName}` : "Ditolak";
    case "replacement_requested":
      return "Penggantian diminta";
    case "validated_by_assigner":
      return "Disetujui otomatis";
    default:
      return "";
  }
}

function formatStaffConfirmationStatus(status: string | undefined): string {
  switch (status) {
    case "confirmed_by_staff":
      return "Sudah konfirmasi";
    case "declined_by_staff":
      return "Menolak dinas";
    case "waiting_staff_confirmation":
      return "Menunggu konfirmasi";
    default:
      return status ? status.replace(/_/g, " ") : "-";
  }
}

function formatMemberStatusLabel(status: string | undefined): string {
  switch (status) {
    case "waiting_manager_validation":
      return "Menunggu validasi";
    case "approved_by_manager":
      return "Disetujui atasan";
    case "rejected_by_manager":
      return "Ditolak atasan";
    case "replacement_requested":
      return "Penggantian diminta";
    case "ready_to_depart":
      return "Siap berangkat";
    case "on_duty":
      return "Sedang bertugas";
    case "completed":
      return "Selesai";
    case "rejected":
      return "Ditolak";
    case "cancelled":
      return "Dibatalkan";
    case "archived":
      return "Diarsipkan";
    default:
      return status ? status.replace(/_/g, " ") : "-";
  }
}

function buildManagerValidationSummaries(members: BusinessTripMissionMember[]) {
  const managerMap = new Map<
    string,
    {
      managerUid: string;
      managerName: string;
      divisionName: string;
      memberUids: string[];
      memberNames: string[];
      approverRole: "director" | "division_manager";
      memberDetails: Array<{
        uid: string;
        name: string;
        status: "approved" | "rejected" | "pending";
        isDivisionManager: boolean;
      }>;
      status: "approved" | "rejected" | "pending";
      notes?: string | null;
      decidedAt?: any;
    }
  >();

  members
    .filter((member) => member.memberStatus !== "archived")
    .forEach((member) => {
      const key = member.managerUid
        ? `${member.managerUid}::${member.divisionName || ""}`
        : `unassigned::${member.employeeUid}`;
      const existing = managerMap.get(key);
      const managerName = member.managerName || "Manager belum ditentukan";
      const divisionName = member.divisionName || "Divisi belum diatur";
      const status = member.managerValidationStatus;
      const derivedStatus: "approved" | "rejected" | "pending" =
        status === "approved_by_manager"
          ? "approved"
          : status === "rejected_by_manager"
            ? "rejected"
            : "pending";
      const isMemberDivMgr = !!(member.isDivisionManager || member.approvalLevel === "director");
      const approverRole: "director" | "division_manager" = isMemberDivMgr
        ? "director"
        : "division_manager";
      const memberDetail = {
        uid: member.employeeUid,
        name: member.employeeName || "Anggota",
        status: derivedStatus,
        isDivisionManager: isMemberDivMgr,
      };

      if (!existing) {
        const noteVal: string | null =
          member.managerValidationNote ?? member.staffConfirmationNote ?? null;
        managerMap.set(key, {
          managerUid: member.managerUid || "",
          managerName,
          divisionName,
          memberUids: [member.employeeUid],
          memberNames: [member.employeeName || "Anggota"],
          approverRole,
          memberDetails: [memberDetail],
          status: derivedStatus,
          notes: noteVal,
          decidedAt: member.updatedAt,
        });
        return;
      }

      existing.memberUids = Array.from(
        new Set([...existing.memberUids, member.employeeUid]),
      );
      if (!existing.memberNames.includes(member.employeeName || "Anggota")) {
        existing.memberNames.push(member.employeeName || "Anggota");
      }
      if (!existing.memberDetails.find((d) => d.uid === member.employeeUid)) {
        existing.memberDetails.push(memberDetail);
      }

      if (existing.status !== "approved" && derivedStatus === "approved") {
        existing.status = "approved";
      }
      if (existing.status !== "rejected" && derivedStatus === "rejected") {
        existing.status = "rejected";
      }
      if (!existing.notes && member.managerValidationNote) {
        existing.notes = member.managerValidationNote;
      }
      if (!existing.decidedAt && member.updatedAt) {
        existing.decidedAt = member.updatedAt;
      }
    });

  return Array.from(managerMap.values());
}

function computeManagerValidationProgress(
  members: BusinessTripMissionMember[],
) {
  const managerValidations = buildManagerValidationSummaries(members);
  return {
    managerValidations,
    managerCount: managerValidations.length,
    approvedCount: managerValidations.filter(
      (item) => item.status === "approved",
    ).length,
    rejectedCount: managerValidations.filter(
      (item) => item.status === "rejected",
    ).length,
  };
}

const ALLOWED_ASSIGNMENT_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function formatRupiah(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(parseInt(digits, 10));
}

function parseRupiahInput(value: string) {
  return value.replace(/\D/g, "");
}

function stripHtml(html = "") {
  return html.replace(/<[^>]+>/g, "").trim();
}

function validateAssignmentLetterFile(file: File) {
  if (!file) return { isValid: false, message: "File tidak boleh kosong." };
  if (!ALLOWED_ASSIGNMENT_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      message: "Format file tidak diperbolehkan. Pilih PDF, DOC, atau DOCX.",
    };
  }
  if (file.size === 0) {
    return { isValid: false, message: "File kosong tidak dapat diunggah." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return {
      isValid: false,
      message: "Ukuran file terlalu besar. Maksimal 10 MB.",
    };
  }
  return { isValid: true, file };
}

// ===== Section Header Component =====
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-border">
      <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ===== Staff Picker Component =====
type StaffBusyEntry = {
  missionId: string;
  missionName: string;
  startDate: any;
  endDate: any;
  destinationCity?: string;
  memberTripStatus?: string;
};

// ── Continuation & availability types ────────────────────────────────────────
type ContinuationData = {
  missionId: string;
  missionName: string;
  destination: string;
  endDate: any;
  transitionNote: string;
};

type StaffAvailabilityStatus =
  | "available"       // no active missions at all in busyMap
  | "on_duty"         // currently on duty in another mission, new dates don't overlap
  | "will_be_on_duty" // future approved mission, new dates don't overlap
  | "continuation"    // new mission can start right after old one ends (≤2 days gap)
  | "conflict";       // actual date overlap → needs override + reason

type StaffMissionOverlap = StaffBusyEntry & {
  overlapType: "conflict" | "continuation" | "no_overlap";
};

type StaffAvailabilityDetail = {
  status: StaffAvailabilityStatus;
  missions: StaffMissionOverlap[];
  latestEndDate?: any;
};

function StaffPicker({
  allStaff,
  selectedUids,
  onToggle,
  isLoading,
  error,
  missionStartDate,
  missionEndDate,
  busyMap,
  excludeMissionId,
  continuationSelections,
}: {
  allStaff: NormalizedStaff[];
  selectedUids: string[];
  onToggle: (uid: string, meta?: { continuation?: ContinuationData; overrideReason?: string }) => void;
  isLoading: boolean;
  error: any;
  missionStartDate?: string; // YYYY-MM-DD
  missionEndDate?: string;   // YYYY-MM-DD
  busyMap?: Record<string, StaffBusyEntry[]>;
  excludeMissionId?: string;
  continuationSelections?: Record<string, ContinuationData>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("__all__");
  const [divisionFilter, setDivisionFilter] = useState("__all__");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState("__all__");
  const [structuralPositionFilter, setStructuralPositionFilter] =
    useState("__all__");
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(
    new Set(),
  );

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [continuationPending, setContinuationPending] = useState<{
    uid: string;
    name: string;
    missions: StaffMissionOverlap[];
  } | null>(null);
  const [continuationChoice, setContinuationChoice] = useState<"normal" | "continuation">("normal");
  const [continuationFromMission, setContinuationFromMission] = useState<StaffMissionOverlap | null>(null);
  const [continuationNote, setContinuationNote] = useState("");

  const [overridePending, setOverridePending] = useState<{
    uid: string;
    name: string;
    missions: StaffMissionOverlap[];
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // ── Extract filter options ────────────────────────────────────────────────
  const { brands, divisions, employeeTypes, structuralPositions } =
    useMemo(() => {
      const brandSet = new Map<string, string>();
      const divisionSet = new Map<string, string>();
      const typeSet = new Map<string, string>();
      const structuralPositionSet = new Map<string, string>();

      allStaff.forEach((s) => {
        const bName =
          s.brandName && s.brandName !== "Brand belum diatur"
            ? s.brandName
            : null;
        const dName =
          s.divisionName && s.divisionName !== "Divisi belum diatur"
            ? s.divisionName
            : null;
        if (bName) brandSet.set(s.brandId || bName, bName);
        if (dName) divisionSet.set(s.divisionId || dName, dName);
        if (s.employeeType && s.employeeType !== "Staf")
          typeSet.set(s.employeeType, s.employeeType);
        if (s.structuralPosition)
          structuralPositionSet.set(s.structuralPosition, s.structuralPosition);
      });

      const structuralPositions = Array.from(
        structuralPositionSet.entries(),
      ).map(([id, name]) => ({
        id,
        name,
      }));

      return {
        brands: Array.from(brandSet.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        divisions: Array.from(divisionSet.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        employeeTypes: Array.from(typeSet.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        structuralPositions,
      };
    }, [allStaff]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    let result = allStaff;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.jobTitle.toLowerCase().includes(q) ||
          s.employeeType.toLowerCase().includes(q) ||
          s.brandName.toLowerCase().includes(q) ||
          s.divisionName.toLowerCase().includes(q) ||
          s.structuralPosition.toLowerCase().includes(q) ||
          s.managerName.toLowerCase().includes(q) ||
          s.employeeId.toLowerCase().includes(q),
      );
    }

    if (brandFilter !== "__all__") {
      if (brandFilter === "__empty__") {
        result = result.filter(
          (s) => !s.brandId && s.brandName === "Brand belum diatur",
        );
      } else {
        result = result.filter(
          (s) => (s.brandId || s.brandName) === brandFilter,
        );
      }
    }

    if (divisionFilter !== "__all__") {
      if (divisionFilter === "__empty__") {
        result = result.filter((s) => s.divisionName === "Divisi belum diatur");
      } else {
        result = result.filter(
          (s) => (s.divisionId || s.divisionName) === divisionFilter,
        );
      }
    }

    if (employeeTypeFilter !== "__all__") {
      result = result.filter((s) => s.employeeType === employeeTypeFilter);
    }

    if (structuralPositionFilter !== "__all__") {
      if (structuralPositionFilter === "__empty__") {
        result = result.filter((s) => !s.structuralPosition);
      } else {
        result = result.filter(
          (s) => s.structuralPosition === structuralPositionFilter,
        );
      }
    }

    return result;
  }, [
    allStaff,
    searchQuery,
    brandFilter,
    divisionFilter,
    employeeTypeFilter,
    structuralPositionFilter,
  ]);

  // ── Per-staff availability details ────────────────────────────────────────
  const staffAvailabilityMap = useMemo<Record<string, StaffAvailabilityDetail>>(() => {
    if (!busyMap) return {};
    const result: Record<string, StaffAvailabilityDetail> = {};
    Object.entries(busyMap).forEach(([uid, missions]) => {
      const detail = computeStaffAvailabilityInfo(missions, missionStartDate, missionEndDate, excludeMissionId);
      // Only store if there are active missions (available staff don't need an entry)
      if (detail.status !== "available") result[uid] = detail;
    });
    return result;
  }, [busyMap, missionStartDate, missionEndDate, excludeMissionId]);

  // ── Dialog handlers ───────────────────────────────────────────────────────
  const handleStaffClick = (staff: NormalizedStaff) => {
    const isSelected = selectedUids.includes(staff.uid);
    if (isSelected) {
      // Deselecting always works immediately
      onToggle(staff.uid);
      return;
    }
    const avail = staffAvailabilityMap[staff.uid];
    if (!avail) {
      onToggle(staff.uid);
      return;
    }
    if (avail.status === "conflict") {
      setOverridePending({ uid: staff.uid, name: staff.fullName, missions: avail.missions });
      setOverrideReason("");
    } else if (avail.status === "continuation") {
      const continuationMissions = avail.missions.filter(m => m.overlapType === "continuation");
      setContinuationPending({ uid: staff.uid, name: staff.fullName, missions: avail.missions });
      setContinuationChoice("normal");
      setContinuationFromMission(continuationMissions[0] ?? null);
      setContinuationNote("");
    } else {
      // on_duty / will_be_on_duty with no real conflict → normal toggle
      onToggle(staff.uid);
    }
  };

  const handleConfirmContinuation = () => {
    if (!continuationPending) return;
    if (continuationChoice === "continuation" && continuationFromMission) {
      onToggle(continuationPending.uid, {
        continuation: {
          missionId: continuationFromMission.missionId,
          missionName: continuationFromMission.missionName,
          destination: continuationFromMission.destinationCity ?? "",
          endDate: continuationFromMission.endDate,
          transitionNote: continuationNote.trim(),
        },
      });
    } else {
      onToggle(continuationPending.uid);
    }
    setContinuationPending(null);
  };

  const handleConfirmOverride = () => {
    if (!overridePending || !overrideReason.trim()) return;
    onToggle(overridePending.uid, { overrideReason: overrideReason.trim() });
    setOverridePending(null);
    setOverrideReason("");
  };

  // ── Group Brand → Division → Staff ────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, NormalizedStaff[]>>();

    filteredStaff.forEach((s) => {
      const bKey = s.brandName || "__no_brand__";
      const dKey = s.divisionName || "__no_division__";
      if (!map.has(bKey)) map.set(bKey, new Map());
      const divMap = map.get(bKey)!;
      if (!divMap.has(dKey)) divMap.set(dKey, []);
      divMap.get(dKey)!.push(s);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "Brand belum diatur" || a === "__no_brand__") return 1;
        if (b === "Brand belum diatur" || b === "__no_brand__") return -1;
        return a.localeCompare(b);
      })
      .map(([brand, divMap]) => ({
        brand,
        brandLabel: brand === "__no_brand__" ? "Brand belum diatur" : brand,
        isUnknownBrand:
          brand === "__no_brand__" || brand === "Brand belum diatur",
        divisions: Array.from(divMap.entries())
          .sort(([a], [b]) => {
            if (a === "Divisi belum diatur" || a === "__no_division__")
              return 1;
            if (b === "Divisi belum diatur" || b === "__no_division__")
              return -1;
            return a.localeCompare(b);
          })
          .map(([div, staff]) => ({
            division: div,
            divisionLabel:
              div === "__no_division__" ? "Divisi belum diatur" : div,
            isUnknownDivision:
              div === "__no_division__" || div === "Divisi belum diatur",
            staff: staff.sort((a, b) => a.fullName.localeCompare(b.fullName)),
          })),
      }));
  }, [filteredStaff]);

  const toggleBrandCollapse = (brand: string) => {
    setCollapsedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  const selectedStaff = useMemo(
    () => allStaff.filter((s) => selectedUids.includes(s.uid)),
    [allStaff, selectedUids],
  );

  // ── State renders ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Error memuat data karyawan</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {error?.message || "Terjadi kesalahan saat mengambil data karyawan."}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-8 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <div className="animate-spin h-7 w-7 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">
            Memuat data karyawan...
          </p>
        </div>
      </div>
    );
  }

  if (allStaff.length === 0) {
    return (
      <div className="border border-border rounded-lg p-8 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-foreground">
            Belum ada data karyawan.
          </p>
          <p className="text-xs text-muted-foreground">
            Pastikan collection employee_profiles sudah terisi.
          </p>
        </div>
      </div>
    );
  }

  // ── Availability badge helper ─────────────────────────────────────────────
  const renderAvailabilityBadge = (avail: StaffAvailabilityDetail | undefined) => {
    if (!avail) return null;
    switch (avail.status) {
      case "conflict":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300/60 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:border-red-700/40 dark:text-red-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            Bentrok Dinas
          </span>
        );
      case "continuation":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 border border-blue-300/60 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:border-blue-700/40 dark:text-blue-400">
            <TrendingUp className="h-2.5 w-2.5" />
            Lanjutan Dinas
          </span>
        );
      case "on_duty":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 border border-orange-300/60 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:border-orange-700/40 dark:text-orange-400">
            <Navigation className="h-2.5 w-2.5" />
            Sedang Dinas
          </span>
        );
      case "will_be_on_duty":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 border border-yellow-300/60 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700/40 dark:text-yellow-400">
            <Calendar className="h-2.5 w-2.5" />
            Akan Dinas
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Continuation Dialog */}
      {continuationPending && (
        <AppModal
          open={true}
          onOpenChange={(open) => { if (!open) setContinuationPending(null); }}
        >
          <div className="space-y-4 p-6">
            <div>
              <DialogTitle className="text-base font-semibold">Pilih Jenis Penugasan — {continuationPending.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Staff ini memiliki dinas aktif yang bisa dilanjutkan. Pilih jenis penugasan.</p>
            </div>
            {/* Mission info */}
            {continuationPending.missions
              .filter(m => m.overlapType === "continuation" || m.overlapType === "conflict")
              .map(m => (
                <div key={m.missionId} className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-0.5">
                  <p className="font-semibold text-foreground">{m.missionName || "(tanpa nama)"}</p>
                  {m.destinationCity && <p className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{m.destinationCity}</p>}
                  <p className="text-muted-foreground">{formatDate(m.startDate)} – {formatDate(m.endDate)}</p>
                </div>
              ))}

            {/* Choice buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setContinuationChoice("normal")}
                className={`w-full text-left rounded-lg border-2 p-3 transition-colors ${continuationChoice === "normal" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              >
                <p className="font-medium text-sm">Penugasan Normal</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ditugaskan secara terpisah, tidak ada kaitan dengan dinas sebelumnya.</p>
              </button>
              {continuationPending.missions.filter(m => m.overlapType === "continuation").length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setContinuationChoice("continuation");
                    setContinuationFromMission(continuationPending.missions.find(m => m.overlapType === "continuation") ?? null);
                  }}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-colors ${continuationChoice === "continuation" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-border hover:border-blue-400/50"}`}
                >
                  <p className="font-medium text-sm">Lanjutan dari Dinas Sebelumnya</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ditugaskan sebagai kelanjutan langsung dari{" "}
                    <span className="font-medium">{continuationPending.missions.find(m => m.overlapType === "continuation")?.missionName}</span>.
                  </p>
                </button>
              )}
            </div>

            {/* Transition note */}
            {continuationChoice === "continuation" && (
              <div className="space-y-1">
                <Label className="text-sm">Catatan Transisi (opsional)</Label>
                <Textarea
                  value={continuationNote}
                  onChange={e => setContinuationNote(e.target.value)}
                  placeholder="Contoh: Langsung dari lokasi Kota A ke Kota B tanpa kembali ke kantor."
                  className="min-h-[72px] text-sm"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setContinuationPending(null)}>Batal</Button>
              <Button size="sm" onClick={handleConfirmContinuation}>Konfirmasi</Button>
            </div>
          </div>
        </AppModal>
      )}

      {/* Override Dialog */}
      {overridePending && (
        <AppModal
          open={true}
          onOpenChange={(open) => { if (!open) setOverridePending(null); }}
        >
          <div className="space-y-4 p-6">
            <div>
              <DialogTitle className="text-base font-semibold">Override Konflik — {overridePending.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Staff ini memiliki jadwal dinas yang bentrok. Isi alasan override untuk melanjutkan.</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 space-y-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Bentrok tanggal dengan:
              </p>
              {overridePending.missions.filter(m => m.overlapType === "conflict").map(m => (
                <p key={m.missionId} className="text-xs text-red-600 dark:text-red-300 pl-5">
                  {m.missionName} ({formatDate(m.startDate)} – {formatDate(m.endDate)})
                  {m.destinationCity ? ` · ${m.destinationCity}` : ""}
                </p>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium">Alasan Override <span className="text-destructive">*</span></Label>
              <Textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Jelaskan alasan penugasan meskipun ada konflik jadwal..."
                className="min-h-[88px] text-sm"
              />
              {!overrideReason.trim() && (
                <p className="text-xs text-destructive">Alasan wajib diisi.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setOverridePending(null)}>Batal</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!overrideReason.trim()}
                onClick={handleConfirmOverride}
              >
                Override & Pilih
              </Button>
            </div>
          </div>
        </AppModal>
      )}

      {/* Selected Staff Chips */}
      {selectedStaff.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            Tim Terpilih ({selectedStaff.length} orang)
          </Label>
          <div className="flex flex-wrap gap-2">
            {selectedStaff.map((s) => {
              const contData = continuationSelections?.[s.uid];
              return (
                <div
                  key={s.uid}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-sm"
                >
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-primary">
                      {s.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-foreground">
                    {s.fullName}
                  </span>
                  {s.isDivisionManager && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">MGR</Badge>
                  )}
                  {contData && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 border border-blue-400/30 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 dark:text-blue-400">
                      <TrendingUp className="h-2 w-2" />
                      Lanjutan
                    </span>
                  )}
                  {!s.managerUid && !s.managerName && (
                    <span title="Manager belum ditentukan">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggle(s.uid)}
                    className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama, jabatan, brand, divisi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Brand</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">Brand belum diatur</SelectItem>
          </SelectContent>
        </Select>
        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter Divisi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Divisi</SelectItem>
            {divisions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">Divisi belum diatur</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={structuralPositionFilter}
          onValueChange={setStructuralPositionFilter}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter Status Struktur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Status Struktur</SelectItem>
            {structuralPositions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
            <SelectItem value="__empty__">
              Status Struktur belum diatur
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Staff List – Grouped by Brand → Division */}
      <div className="border border-border rounded-lg bg-card overflow-hidden max-h-[460px] overflow-y-auto">
        {filteredStaff.length === 0 ? (
          <div className="p-8 text-center">
            <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              Tidak ada staff sesuai filter.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Coba ubah kata kunci pencarian atau filter.
            </p>
          </div>
        ) : (
          <div>
            {grouped.map((brandGroup) => {
              const isCollapsed = collapsedBrands.has(brandGroup.brand);
              const totalInBrand = brandGroup.divisions.reduce(
                (sum, d) => sum + d.staff.length,
                0,
              );
              const selectedInBrand = brandGroup.divisions.reduce(
                (sum, d) =>
                  sum +
                  d.staff.filter((s) => selectedUids.includes(s.uid)).length,
                0,
              );

              return (
                <div
                  key={brandGroup.brand}
                  className="border-b border-border last:border-b-0"
                >
                  {/* Brand Header */}
                  <button
                    type="button"
                    onClick={() => toggleBrandCollapse(brandGroup.brand)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm flex items-center gap-1.5 flex-1 min-w-0">
                      {brandGroup.isUnknownBrand ? (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          Brand belum diatur
                        </span>
                      ) : (
                        <span className="text-foreground truncate">
                          {brandGroup.brandLabel}
                        </span>
                      )}
                    </span>
                    <Badge
                      variant="secondary"
                      className="ml-auto text-xs flex-shrink-0"
                    >
                      {selectedInBrand > 0
                        ? `${selectedInBrand}/${totalInBrand} dipilih`
                        : `${totalInBrand} orang`}
                    </Badge>
                  </button>

                  {!isCollapsed && (
                    <div>
                      {brandGroup.divisions.map((divGroup) => (
                        <div key={divGroup.division}>
                          {/* Division Sub-header */}
                          <div className="px-4 py-1.5 bg-muted/20 border-t border-border/60">
                            <span className="text-xs font-semibold uppercase tracking-wide pl-6 flex items-center gap-1.5 text-muted-foreground">
                              {divGroup.isUnknownDivision ? (
                                <span className="text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Divisi belum diatur
                                </span>
                              ) : (
                                divGroup.divisionLabel
                              )}
                            </span>
                          </div>

                          {/* Staff Items */}
                          {divGroup.staff.map((staff) => {
                            const isSelected = selectedUids.includes(staff.uid);
                            const avail = staffAvailabilityMap[staff.uid];
                            const availStatus = avail?.status ?? "available";
                            const isConflict = availStatus === "conflict";
                            const noBrand = !staff.brandId && staff.brandName === "Brand belum diatur";
                            const noDivision = staff.divisionName === "Divisi belum diatur";
                            const noManager = !staff.managerUid && !staff.managerName;
                            const hasWarning = noBrand || noDivision || noManager;
                            const noTitle = staff.jobTitle === "Jabatan belum diatur";

                            // For multi-mission info lines
                            const noOverlapMissions = avail?.missions.filter(m => m.overlapType === "no_overlap") ?? [];
                            const conflictMissions  = avail?.missions.filter(m => m.overlapType === "conflict")    ?? [];
                            const contMissions      = avail?.missions.filter(m => m.overlapType === "continuation") ?? [];

                            return (
                              <div
                                key={staff.uid}
                                onClick={() => handleStaffClick(staff)}
                                className={`flex items-start gap-3 px-4 py-3 border-t border-border/40 transition-colors cursor-pointer ${
                                  isConflict && !isSelected
                                    ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20"
                                    : isSelected
                                    ? "bg-primary/5 hover:bg-primary/10"
                                    : "hover:bg-muted/40"
                                }`}
                              >
                                {/* Checkbox */}
                                <div
                                  className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isConflict && !isSelected
                                      ? "border-red-300/60 bg-red-100/50 dark:border-red-700/40 dark:bg-red-900/20"
                                      : isSelected
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-border bg-background"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                  {isConflict && !isSelected && <AlertTriangle className="h-2.5 w-2.5 text-red-400" />}
                                </div>

                                {/* Staff Info */}
                                <div className="flex-1 min-w-0">
                                  {/* Name row */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground">
                                      {staff.fullName}
                                    </span>
                                    {renderAvailabilityBadge(avail)}
                                    {staff.isDivisionManager && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-400/50 text-blue-600 dark:text-blue-400 bg-blue-500/10">
                                        Manager Divisi
                                      </Badge>
                                    )}
                                    {staff.employeeId && (
                                      <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                        {staff.employeeId}
                                      </span>
                                    )}
                                  </div>

                                  {/* Details row */}
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                                    {noTitle ? (
                                      <span className="text-xs text-amber-600 dark:text-amber-400">Jabatan belum diatur</span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">{staff.jobTitle}</span>
                                    )}
                                    {staff.employeeType && staff.employeeType !== "Staf" && (
                                      <>
                                        <span className="text-muted-foreground/40 text-xs">•</span>
                                        <span className="text-xs text-muted-foreground">{staff.employeeType}</span>
                                      </>
                                    )}
                                    <span className="text-muted-foreground/40 text-xs">•</span>
                                    {noManager ? (
                                      <span className="text-xs text-amber-600 dark:text-amber-400">Manager belum ditentukan</span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Mgr: {staff.managerName}</span>
                                    )}
                                  </div>

                                  {/* Mission info lines */}
                                  {conflictMissions.map(m => (
                                    <p key={m.missionId} className="mt-1 text-xs text-red-600 dark:text-red-400">
                                      Bentrok dengan: {m.missionName}{m.destinationCity ? ` · ${m.destinationCity}` : ""}
                                      {" "}({formatDate(m.startDate)} – {formatDate(m.endDate)})
                                    </p>
                                  ))}
                                  {contMissions.map(m => (
                                    <p key={m.missionId} className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                      Dapat lanjut dari: {m.missionName} (selesai {formatDate(m.endDate)})
                                    </p>
                                  ))}
                                  {noOverlapMissions.map(m => {
                                    const isNowActive = (() => {
                                      const s = toDateOnly(m.startDate)?.getTime() ?? 0;
                                      const e = toDateOnly(m.endDate)?.getTime() ?? 0;
                                      const now = Date.now();
                                      return s <= now && now <= e;
                                    })();
                                    return (
                                      <p key={m.missionId} className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                        {isNowActive
                                          ? `Sedang dinas: ${m.missionName}${m.destinationCity ? ` · ${m.destinationCity}` : ""} (s/d ${formatDate(m.endDate)})`
                                          : `Akan dinas: ${m.missionName} (${formatDate(m.startDate)})`
                                        }
                                        {missionStartDate && missionEndDate && (
                                          <span className="text-green-600 dark:text-green-400"> · Tersedia setelah {formatDate(m.endDate)}</span>
                                        )}
                                      </p>
                                    );
                                  })}
                                </div>

                                {/* Warning indicator */}
                                {hasWarning && !avail && (
                                  <div className="flex-shrink-0 mt-0.5" title="Data belum lengkap">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Warning: selected staff without manager */}
      {selectedStaff.some((s) => !s.managerUid && !s.managerName) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">Perhatian:</span> Beberapa staff yang
            dipilih belum memiliki Manager Divisi. Perjalanan dinas tetap bisa
            dibuat, namun validasi manager akan menunggu.
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Total karyawan: {allStaff.length} | Ditampilkan: {filteredStaff.length}{" "}
        | Terpilih: {selectedStaff.length}
      </p>
    </div>
  );
}

// ===== Main Component =====
export function ManagementDinasClient() {
  const { userProfile, firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [missionForm, setMissionForm] = useState({
    missionName: "",
    assignmentNumber: "",
    projectName: "",
    clientName: "",
    tripType: "Sampling" as BusinessTripType,
    tripTypeOther: "",
    destinationProvince: "",
    destinationRegency: "",
    destinationAddress: "",
    destinationGoogleMaps: "",
    startDate: "",
    endDate: "",
    instructionNote: "", // stores TipTap HTML output
    googleDriveLink: "",
  });
  const [assignmentLetterFile, setAssignmentLetterFile] = useState<File | null>(
    null,
  );
  const [assignmentLetterError, setAssignmentLetterError] = useState<
    string | null
  >(null);
  const [editAssignmentLetterFile, setEditAssignmentLetterFile] =
    useState<File | null>(null);
  const [editAssignmentLetterError, setEditAssignmentLetterError] = useState<
    string | null
  >(null);
  const [selectedStaffUids, setSelectedStaffUids] = useState<string[]>([]);
  const [activeMode, setActiveMode] = useState<
    "list" | "create" | "detail" | "edit" | "manage"
  >("list");
  const [activeMission, setActiveMission] =
    useState<BusinessTripMission | null>(null);
  const [activeMissionMembers, setActiveMissionMembers] = useState<
    BusinessTripMissionMember[]
  >([]);
  const [activeMissionTimeline, setActiveMissionTimeline] = useState<any[]>([]);
  const [activeMissionStaffChanges, setActiveMissionStaffChanges] = useState<
    any[]
  >([]);
  const [activeMissionFinalReport, setActiveMissionFinalReport] = useState<FinalReport | null>(null);
  const [activeMissionMemberReports, setActiveMissionMemberReports] = useState<Record<string, MemberFinalReport>>({});
  const [activeMissionMemberNotes, setActiveMissionMemberNotes] = useState<Record<string, MemberNote>>({});
  const [activeMissionEvidences, setActiveMissionEvidences] = useState<MilestoneEvidence[]>([]);
  const [isArchivingMission, setIsArchivingMission] = useState(false);
  const [isReviewingReport, setIsReviewingReport] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [detailTimelineTab, setDetailTimelineTab] = useState<"all" | "approval" | "tracking" | "changes" | "issues">("all");
  const [detailLoading, setDetailLoading] = useState(false);
  const [missionRefreshId, setMissionRefreshId] = useState(0);
  const [manageSelectedStaffUids, setManageSelectedStaffUids] = useState<
    string[]
  >([]);
  const [manageStaffReason, setManageStaffReason] = useState("");
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [isDocumentPreviewing, setIsDocumentPreviewing] = useState(false);
  const [documentViewerError, setDocumentViewerError] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // Repair request modal
  const [repairRequestModal, setRepairRequestModal] = useState<{
    isOpen: boolean;
    missionId: string | null;
    evidenceId: string | null;
    milestoneType: "departed" | "arrived" | "activity_done" | "returned" | null;
  }>({ isOpen: false, missionId: null, evidenceId: null, milestoneType: null });
  const [repairReason, setRepairReason] = useState("");

  // Management list filters & tracking
  const [missionSearch, setMissionSearch] = useState("");
  const [missionStatusFilter, setMissionStatusFilter] = useState("all");
  const [missionSort, setMissionSort] = useState<"nearest" | "newest" | "az" | "status">("newest");
  const [memberTrackingMap, setMemberTrackingMap] = useState<Record<string, TrackingStats>>({});

  // staffBusyMap: uid → list of active missions the staff is in (for overlap checking)
  type StaffActiveMission = { missionId: string; missionName: string; startDate: any; endDate: any; destinationCity?: string; memberTripStatus?: string };
  const [staffBusyMap, setStaffBusyMap] = useState<Record<string, StaffActiveMission[]>>({});

  // Continuation/override metadata for create form
  const [staffContinuationSelections, setStaffContinuationSelections] = useState<Record<string, ContinuationData>>({});
  // Continuation/override metadata for manage (add member) form
  const [manageContinuationSelections, setManageContinuationSelections] = useState<Record<string, ContinuationData>>({});

  const activeMissionMemberUids = useMemo(
    () =>
      activeMissionMembers
        .filter((member) => member.memberStatus !== "archived")
        .map((member) => member.employeeUid),
    [activeMissionMembers],
  );

  const isGoogleDriveLink = (url?: string | null) =>
    !!url && /drive\.google\.com|docs\.google\.com/.test(url);

  const isApiStorageViewUrl = (url?: string) =>
    !!url?.includes("/api/storage/view?fileId=") ||
    /api\/storage\/view\?fileId=/.test(url || "");

  const activeDocumentUrl = useMemo(() => {
    if (!activeMission || !activeMission.id) return "";

    const manualLink = activeMission.googleDriveLink?.trim();
    const assignmentDriveUrl = activeMission.assignmentLetterDriveUrl?.trim();

    if (
      activeMission.assignmentLetterSource === "google_drive_link" ||
      activeMission.documentSource === "google_drive_link"
    ) {
      return manualLink || assignmentDriveUrl || "";
    }

    if (
      activeMission.assignmentLetterSource === "system_drive_upload" ||
      activeMission.assignmentLetterSource === "local_upload" ||
      activeMission.assignmentLetterSource === "google_drive" ||
      activeMission.assignmentLetterSource === "firebase_storage"
    ) {
      return `/api/business-trips/${activeMission.id}/document-preview`;
    }

    return manualLink || assignmentDriveUrl || "";
  }, [activeMission]);

  const activeDocumentLabel = useMemo(() => {
    if (!activeMission) return "Surat Tugas/SPD";
    return (
      activeMission.assignmentLetterFileName ||
      (activeMission.googleDriveLink
        ? "Google Drive Link Manual"
        : "Surat Tugas/SPD")
    );
  }, [activeMission]);

  const activeDocumentSourceLabel = useMemo(() => {
    if (!activeMission) return "";
    if (activeMission.assignmentLetterSource === "local_upload") {
      return "Upload File";
    }
    if (activeMission.assignmentLetterSource === "system_drive_upload") {
      return "Upload File via Drive HRP";
    }
    if (activeMission.assignmentLetterSource === "google_drive_link") {
      return "Google Drive Link Manual";
    }
    if (activeMission.assignmentLetterSource === "google_drive") {
      return "Upload File via Drive HRP";
    }
    if (activeMission.documentSource === "google_drive_link") {
      return "Google Drive Link Manual";
    }
    if (activeMission.documentSource === "firebase_storage") {
      return "Upload File";
    }
    return "Upload File via Drive HRP";
  }, [activeMission]);

  const handleOpenDocumentViewer = () => {
    setDocumentViewerError(null);
    setIsDocumentViewerOpen(true);
  };

  const handlePreviewDocument = async () => {
    if (!activeMission || !activeMission.id) return;
    setDocumentViewerError(null);

    const storedUrl = activeDocumentUrl;
    if (!storedUrl) {
      setDocumentViewerError(
        "Dokumen belum bisa dibuka lintas akun. Pastikan permission Google Drive sudah dibuka untuk viewer internal.",
      );
      return;
    }

    if (storedUrl.includes("/api/business-trips/")) {
      setIsDocumentPreviewing(true);
      try {
        if (!firebaseUser) {
          throw new Error(
            "Sesi login tidak terbaca. Silakan refresh halaman lalu coba lagi.",
          );
        }
        const token = await firebaseUser.getIdToken();
        const response = await fetch(storedUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Gagal memuat dokumen.");
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } catch (error: any) {
        console.error("Gagal pratinjau dokumen:", error);
        setDocumentViewerError(error?.message || "Gagal memuat dokumen.");
      } finally {
        setIsDocumentPreviewing(false);
      }
    } else {
      window.open(storedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const refreshMissionList = () => {
    setMissionRefreshId((prev) => prev + 1);
  };

  // ── Fetch all 4 collections in parallel ──────────────────────────────────
  const { data: usersData, isLoading: usersLoading } =
    useCollection<UserProfile>(
      useMemoFirebase(() => collection(firestore, "users"), [firestore]),
    );

  const { data: employeesData, isLoading: employeesLoading } =
    useCollection<EmployeeMasterData>(
      useMemoFirebase(() => collection(firestore, "employees"), [firestore]),
    );

  const {
    data: employeeProfilesData,
    isLoading: profilesLoading,
    error: profilesError,
  } = useCollection<EmployeeProfile>(
    useMemoFirebase(
      () => collection(firestore, "employee_profiles"),
      [firestore],
    ),
  );

  const { data: brandsData, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  const staffLoading =
    usersLoading || employeesLoading || profilesLoading || brandsLoading;

  // ── Helper: should this user/profile be excluded? ────────────────────────
  const shouldExclude = useCallback(
    (
      userRole: string | undefined,
      structuralPosition: string,
      jobTitle: string,
    ): boolean => {
      if (userRole && EXCLUDED_USER_ROLES.has(userRole.toLowerCase()))
        return true;
      if (structuralPosition && EXCLUDED_STRUCTURAL_RE.test(structuralPosition))
        return true;
      if (jobTitle && EXCLUDED_TITLE_RE.test(jobTitle)) return true;
      return false;
    },
    [],
  );

  // ── Build merged + normalized + filtered staff list ───────────────────────
  const allMergedStaff = useMemo<NormalizedStaff[]>(() => {
    if (staffLoading) return [];

    const brands = brandsData || [];

    // Build index maps for O(1) lookups
    const usersByUid = new Map<string, UserProfile>();
    (usersData ?? []).forEach((u) => usersByUid.set(u.uid, u));

    const employeesByUid = new Map<string, EmployeeMasterData>();
    (employeesData ?? []).forEach((e) => employeesByUid.set(e.uid, e));

    const seenUids = new Set<string>();
    const result: NormalizedStaff[] = [];

    // ── PASS 1: employee_profiles (primary source of truth) ──────────────
    (employeeProfilesData ?? []).forEach((profile) => {
      const uid = (profile as any).uid || (profile as any).id;
      if (!uid) return;
      if (seenUids.has(uid)) return;
      seenUids.add(uid);

      const user = usersByUid.get(uid);
      const emp = employeesByUid.get(uid);
      const normalized = normalizeEmployeeRow(
        emp ?? {},
        profile,
        user ?? {},
        brands,
      );

      // Apply exclusion filter
      if (
        shouldExclude(
          user?.role,
          normalized.structuralPosition || "",
          normalized.jabatan,
        )
      )
        return;

      // Resolve best available display name
      const resolvedName =
        emp?.fullName ||
        profile?.fullName ||
        (profile as any)?.employeeName ||
        (profile as any)?.name ||
        (profile?.dataDiriIdentitas as any)?.namaLengkap ||
        user?.fullName ||
        (user as any)?.displayName ||
        profile?.email ||
        user?.email ||
        "";

      if (!resolvedName) return; // skip nameless ghost docs

      result.push({
        uid,
        fullName: resolvedName,
        employeeId: normalized.employeeId || "",
        brandId: normalized.brandId || "",
        brandName: normalized.brandName,
        divisionId: normalized.divisionId || "",
        divisionName: normalized.divisi,
        jobTitle: normalized.jabatan,
        managerUid: normalized.directSupervisorUid || "",
        managerName: normalized.directSupervisorName || "",
        employmentStatus: normalized.employmentStatus || "",
        employeeType: normalized.tipeKaryawan,
        structuralPosition: normalized.structuralPosition || "",
        isDivisionManager:
          normalized.isDivisionManager ||
          normalized.structuralPosition === "division_manager" ||
          false,
      });
    });

    // ── PASS 2: users with 'karyawan' role that have NO profile yet ───────
    (usersData ?? []).forEach((u) => {
      if (seenUids.has(u.uid)) return;
      if (EXCLUDED_USER_ROLES.has((u.role || "").toLowerCase())) return;
      if (u.role === "kandidat") return;
      // Only include users that explicitly have a karyawan-level indicator
      if (
        u.role !== "karyawan" &&
        !(u as any).employmentType &&
        !(u as any).structuralLevel
      )
        return;

      seenUids.add(u.uid);

      const emp = employeesByUid.get(u.uid);
      const normalized = normalizeEmployeeRow(emp ?? u, null, u, brands);

      if (
        shouldExclude(
          u.role,
          normalized.structuralPosition || "",
          normalized.jabatan,
        )
      )
        return;

      result.push({
        uid: u.uid,
        fullName: u.fullName || (u as any)?.displayName || u.email || "",
        employeeId: normalized.employeeId || "",
        brandId: normalized.brandId || "",
        brandName: normalized.brandName,
        divisionId: normalized.divisionId || "",
        divisionName: normalized.divisi,
        jobTitle: normalized.jabatan,
        managerUid: normalized.directSupervisorUid || "",
        managerName: normalized.directSupervisorName || "",
        employmentStatus: normalized.employmentStatus || "",
        employeeType: normalized.tipeKaryawan,
        structuralPosition: normalized.structuralPosition || "",
        isDivisionManager:
          normalized.isDivisionManager ||
          normalized.structuralPosition === "division_manager" ||
          (u as any)?.isDivisionManager ||
          false,
      });
    });

    return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [
    usersData,
    employeesData,
    employeeProfilesData,
    brandsData,
    staffLoading,
    shouldExclude,
  ]);

  const availableStaffForAddition = useMemo(
    () =>
      allMergedStaff.filter(
        (staff) => !activeMissionMemberUids.includes(staff.uid),
      ),
    [allMergedStaff, activeMissionMemberUids],
  );

  // ── Mission list query ────────────────────────────────────────────────────
  const missionQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.uid) return null;

    // HRD and Super Admin can see all missions for monitoring
    const isHrdOrSuperAdmin =
      userProfile.role === "hrd" || userProfile.role === "super-admin";

    if (isHrdOrSuperAdmin) {
      return query(
        collection(firestore, "business_trip_missions"),
        orderBy("createdAt", "desc"),
      );
    }

    // Directors and managers only see missions they created
    return query(
      collection(firestore, "business_trip_missions"),
      where("assignedByUid", "==", userProfile.uid),
      orderBy("createdAt", "desc"),
    );
  }, [firestore, userProfile?.uid, userProfile?.role, missionRefreshId]);

  const { data: missionItems, isLoading } =
    useCollection<BusinessTripMission>(missionQuery);

  const mergedMissionItems = useMemo(() => {
    if (!missionItems) return [];

    const groups = new Map<string, BusinessTripMission[]>();

    missionItems
      .filter((mission) => mission.status !== "archived_duplicate")
      .forEach((mission) => {
        const key = [
          mission.missionName?.trim().toLowerCase() ?? "",
          mission.destinationProvince?.trim().toLowerCase() ?? "",
          mission.destinationRegency?.trim().toLowerCase() ?? "",
          mission.destinationAddress?.trim().toLowerCase() ?? "",
          mission.startDate
            ? String((mission.startDate as any)?.seconds ?? mission.startDate)
            : "",
          mission.endDate
            ? String((mission.endDate as any)?.seconds ?? mission.endDate)
            : "",
          mission.assignedByUid ?? "",
        ].join("|");

        const current = groups.get(key) || [];
        current.push(mission);
        groups.set(key, current);
      });

    const merged: BusinessTripMission[] = [];
    groups.forEach((group) => {
      if (group.length === 1) {
        merged.push(group[0]);
        return;
      }

      const primary = group.reduce((best, item) => {
        const bestTs = (best.createdAt as any)?.seconds ?? 0;
        const itemTs = (item.createdAt as any)?.seconds ?? 0;
        return itemTs < bestTs ? item : best;
      }, group[0]);

      const memberCount =
        group.reduce((sum, item) => sum + (item.memberCount ?? 0), 0) ||
        group.length;
      const managerApprovedCount = group.reduce(
        (sum, item) => sum + (item.managerApprovedCount ?? 0),
        0,
      );
      const staffConfirmedCount = group.reduce(
        (sum, item) => sum + (item.staffConfirmedCount ?? 0),
        0,
      );

      merged.push({
        ...primary,
        memberCount,
        managerApprovedCount,
        staffConfirmedCount,
        duplicateMissionIds: group
          .slice(1)
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
      });
    });

    return merged.sort(
      (a, b) =>
        ((b.createdAt as any)?.seconds ?? 0) -
        ((a.createdAt as any)?.seconds ?? 0),
    );
  }, [missionItems]);

  const hasDuplicateMissions =
    (missionItems?.length ?? 0) > mergedMissionItems.length;

  const cleanupMissionGroups = useMemo(() => {
    if (!missionItems) return [];

    const groups = new Map<string, BusinessTripMission[]>();
    missionItems.forEach((mission) => {
      const key = [
        mission.missionName?.trim().toLowerCase() ?? "",
        mission.destinationProvince?.trim().toLowerCase() ?? "",
        mission.destinationRegency?.trim().toLowerCase() ?? "",
        mission.destinationAddress?.trim().toLowerCase() ?? "",
        mission.startDate
          ? String((mission.startDate as any)?.seconds ?? mission.startDate)
          : "",
        mission.endDate
          ? String((mission.endDate as any)?.seconds ?? mission.endDate)
          : "",
        mission.assignedByUid ?? "",
      ].join("|");

      const current = groups.get(key) || [];
      current.push(mission);
      groups.set(key, current);
    });

    return Array.from(groups.values()).filter((group) => group.length > 1);
  }, [missionItems]);

  // ── Real-time tracking stats per mission + staff busy map ────────────────
  useEffect(() => {
    if (!firestore) return;
    const q = collectionGroup(firestore, "members");
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, TrackingStats> = {};
      // uid → active missions (for busy check)
      const busyMap: Record<string, StaffActiveMission[]> = {};

      snap.docs.forEach((d) => {
        const data = d.data() as BusinessTripMissionMember;
        const mId = data.missionId;
        if (!mId) return;

        if (!map[mId]) {
          map[mId] = { total: 0, departed: 0, arrived: 0, activityDone: 0, returned: 0, issues: 0, lastUpdateAt: null, lastUpdateByName: "", memberNames: [] };
        }
        const s = map[mId];
        const ms = data.memberStatus as string;
        if (["archived", "cancelled", "rejected_by_manager", "declined_by_staff"].includes(ms)) return;
        s.total++;
        s.memberNames.push(data.employeeName);
        const ts = data.memberTripStatus;
        if (ts === "departed" || ts === "arrived" || ts === "activity_done" || ts === "return_started" || ts === "returned") s.departed++;
        if (ts === "arrived" || ts === "activity_done" || ts === "return_started" || ts === "returned") s.arrived++;
        if (ts === "activity_done" || ts === "return_started" || ts === "returned") s.activityDone++;
        if (ts === "returned") s.returned++;
        if (ts === "issue_reported") s.issues++;
        const upd = data.lastTripUpdateAt;
        if (upd && (!s.lastUpdateAt || (upd?.seconds ?? 0) > (s.lastUpdateAt?.seconds ?? 0))) {
          s.lastUpdateAt = upd;
          s.lastUpdateByName = data.lastTripUpdateByName ?? "";
        }

        // Build busy map — only include if member is in an active (non-terminal) status and NOT yet returned
        const terminalMemberStatuses = ["archived", "cancelled", "rejected_by_manager", "declined_by_staff", "completed"];
        const terminalTripStatuses = ["returned"];
        const isTerminalMember = terminalMemberStatuses.includes(ms);
        const isReturned = ts === "returned";
        if (!isTerminalMember && !isReturned) {
          const uid = data.employeeUid;
          if (uid) {
            if (!busyMap[uid]) busyMap[uid] = [];
            busyMap[uid].push({
              missionId: mId,
              missionName: data.missionName,
              startDate: data.startDate,
              endDate: data.endDate,
              destinationCity: (data as any).destinationCity || undefined,
              memberTripStatus: ts,
            });
          }
        }
      });

      setMemberTrackingMap(map);
      setStaffBusyMap(busyMap);
    });
    return unsub;
  }, [firestore]);

  // Sync activeMission with latest data when missionItems updates (real-time fix)
  useEffect(() => {
    if (!activeMission?.id || !missionItems?.length) return;
    const updated = missionItems.find((m) => m.id === activeMission.id);
    if (updated) setActiveMission(updated);
  }, [missionItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to final report subcollections when activeMission changes
  useEffect(() => {
    if (!firestore || !activeMission?.id) {
      setActiveMissionFinalReport(null);
      setActiveMissionMemberReports({});
      setActiveMissionMemberNotes({});
      setActiveMissionEvidences([]);
      return;
    }
    const mId = activeMission.id;
    const unsubFinal = onSnapshot(
      collection(firestore, "business_trip_missions", mId, "final_report"),
      (snap) => {
        const first = snap.docs[0];
        setActiveMissionFinalReport(first ? ({ id: first.id, ...first.data() } as FinalReport) : null);
      },
      (err) => console.error("final_report snapshot error:", err),
    );
    const unsubMemberReports = onSnapshot(
      collection(firestore, "business_trip_missions", mId, "member_final_reports"),
      (snap) => {
        const map: Record<string, MemberFinalReport> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as MemberFinalReport; });
        setActiveMissionMemberReports(map);
      },
      (err) => console.error("member_final_reports snapshot error:", err),
    );
    const unsubMemberNotes = onSnapshot(
      collection(firestore, "business_trip_missions", mId, "member_notes"),
      (snap) => {
        const map: Record<string, MemberNote> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as MemberNote; });
        setActiveMissionMemberNotes(map);
      },
      (err) => console.error("member_notes snapshot error:", err),
    );
    const unsubEvidences = onSnapshot(
      query(collection(firestore, "business_trip_missions", mId, "milestone_evidences"), orderBy("createdAt", "asc")),
      (snap) => { setActiveMissionEvidences(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MilestoneEvidence))); },
      (err) => console.error("milestone_evidences snapshot error:", err),
    );
    return () => { unsubFinal(); unsubMemberReports(); unsubMemberNotes(); unsubEvidences(); };
  }, [firestore, activeMission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered + sorted mission list ────────────────────────────────────────
  const filteredAndSortedMissions = useMemo(() => {
    const search = missionSearch.toLowerCase().trim();
    let list = mergedMissionItems.filter((m) => {
      if (missionStatusFilter !== "all") {
        const ds = computeTrackingDisplayStatus(m, memberTrackingMap[m.id ?? ""]);
        if (ds !== missionStatusFilter) return false;
      }
      if (search) {
        const tracking = memberTrackingMap[m.id ?? ""];
        const nameMatch = (m.missionName ?? "").toLowerCase().includes(search);
        const destMatch = (m.destinationCity ?? m.destinationRegency ?? m.destinationProvince ?? "").toLowerCase().includes(search);
        const memberMatch = tracking?.memberNames.some((n) => n.toLowerCase().includes(search));
        if (!nameMatch && !destMatch && !memberMatch) return false;
      }
      return true;
    });

    list = list.slice().sort((a, b) => {
      if (missionSort === "nearest") {
        const aStart = (a.startDate as any)?.seconds ?? 0;
        const bStart = (b.startDate as any)?.seconds ?? 0;
        const now = Date.now() / 1000;
        return Math.abs(aStart - now) - Math.abs(bStart - now);
      }
      if (missionSort === "az") {
        return (a.missionName ?? "").localeCompare(b.missionName ?? "");
      }
      if (missionSort === "status") {
        const aDs = computeTrackingDisplayStatus(a, memberTrackingMap[a.id ?? ""]);
        const bDs = computeTrackingDisplayStatus(b, memberTrackingMap[b.id ?? ""]);
        return (STATUS_PRIORITY[aDs] ?? 99) - (STATUS_PRIORITY[bDs] ?? 99);
      }
      // newest (default)
      return ((b.createdAt as any)?.seconds ?? 0) - ((a.createdAt as any)?.seconds ?? 0);
    });

    return list;
  }, [mergedMissionItems, missionSearch, missionStatusFilter, missionSort, memberTrackingMap]);

  // ── Enrich staffBusyMap with destination from missionItems ───────────────
  const enrichedStaffBusyMap = useMemo<Record<string, StaffBusyEntry[]>>(() => {
    const destMap: Record<string, string> = {};
    mergedMissionItems.forEach(m => {
      if (m.id) {
        destMap[m.id] = [m.destinationRegency, m.destinationProvince]
          .filter(Boolean).join(", ");
      }
    });
    const result: Record<string, StaffBusyEntry[]> = {};
    Object.entries(staffBusyMap).forEach(([uid, missions]) => {
      result[uid] = missions.map(m => ({
        ...m,
        destinationCity: m.destinationCity || destMap[m.missionId] || undefined,
      }));
    });
    return result;
  }, [staffBusyMap, mergedMissionItems]);

  const deleteCollectionDocs = async (collectionRef: any) => {
    const snap = await getDocs(collectionRef);
    await Promise.all(
      snap.docs.map((docSnap: any) =>
        deleteDoc(doc(collectionRef, docSnap.id)),
      ),
    );
  };

  const handleCleanupDuplicateMissions = async () => {
    if (!firestore || cleanupMissionGroups.length === 0) return;
    setIsSaving(true);
    try {
      for (const group of cleanupMissionGroups) {
        const primary = group.reduce((best, item) => {
          const bestTs = (best.createdAt as any)?.seconds ?? 0;
          const itemTs = (item.createdAt as any)?.seconds ?? 0;
          return itemTs < bestTs ? item : best;
        }, group[0]);
        if (!primary.id) continue;

        const primaryDocRef = doc(
          firestore,
          "business_trip_missions",
          primary.id,
        );
        const primarySnapshot = await getDoc(primaryDocRef);
        if (!primarySnapshot.exists()) {
          continue;
        }

        const primaryMembersRef = collection(
          firestore,
          "business_trip_missions",
          primary.id,
          "members",
        );
        const primaryMembersSnap = await getDocs(primaryMembersRef);
        const existingUids = new Set(
          primaryMembersSnap.docs.map(
            (docSnap) => (docSnap.data() as any).employeeUid,
          ),
        );

        let addedMembers = 0;

        for (const duplicate of group.slice(1)) {
          if (!duplicate.id) continue;

          const duplicateDocRef = doc(
            firestore,
            "business_trip_missions",
            duplicate.id,
          );
          const duplicateSnapshot = await getDoc(duplicateDocRef);
          if (!duplicateSnapshot.exists()) continue;

          const duplicateMembersRef = collection(
            firestore,
            "business_trip_missions",
            duplicate.id,
            "members",
          );
          const duplicateMembersSnap = await getDocs(duplicateMembersRef);

          for (const dupMemberDoc of duplicateMembersSnap.docs) {
            const memberData = dupMemberDoc.data();
            const employeeUid = (memberData as any).employeeUid;
            if (!employeeUid || existingUids.has(employeeUid)) continue;

            const newMemberRef = doc(primaryMembersRef);
            await setDoc(newMemberRef, {
              ...memberData,
              missionId: primary.id,
              missionName: primary.missionName,
              assignmentNumber: primary.assignmentNumber,
              updatedAt: serverTimestamp(),
            });
            existingUids.add(employeeUid);
            addedMembers += 1;
          }

          await updateDoc(duplicateDocRef, {
            status: "archived_duplicate",
            duplicateOf: primary.id,
            updatedAt: serverTimestamp(),
          });
        }

        if (addedMembers > 0 || group.length > 1) {
          await updateDoc(primaryDocRef, {
            memberCount: existingUids.size,
            updatedAt: serverTimestamp(),
          });
        }
      }

      toast({
        title: "Pembersihan duplikat perjalanan dinas selesai",
        description:
          "Duplikat perjalanan dinas telah digabungkan ke dokumen utama.",
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membersihkan duplikat perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
      refreshMissionList();
    }
  };

  const loadActiveMissionData = async (mission: BusinessTripMission) => {
    if (!firestore || !mission.id) return;
    setDetailLoading(true);

    const formatErrorDetails = (reason: unknown) => {
      const out: {
        code?: string;
        name?: string;
        message?: string;
        stack?: string;
        raw?: string;
      } = {};

      if (!reason) {
        out.message = "Unknown error";
        out.raw = "undefined or null";
        return out;
      }

      if (reason instanceof Error) {
        out.name = reason.name;
        out.message = reason.message || reason.name;
        out.stack = reason.stack;
        out.code = (reason as any)?.code || undefined;
        out.raw = String(reason);
        return out;
      }

      if (typeof reason === "string") {
        out.message = reason;
        out.raw = reason;
        return out;
      }

      if (typeof reason === "object") {
        out.name = (reason as any)?.name || undefined;
        out.message =
          (reason as any)?.message ||
          (reason as any)?.error ||
          JSON.stringify(reason) ||
          String(reason);
        out.code = (reason as any)?.code || undefined;
        out.stack = (reason as any)?.stack || undefined;
        try {
          out.raw = JSON.stringify(reason);
        } catch {
          out.raw = String(reason);
        }
        return out;
      }

      out.message = String(reason);
      out.raw = String(reason);
      return out;
    };

    const membersPath = `business_trip_missions/${mission.id}/members`;
    const timelinePath = `business_trip_missions/${mission.id}/timeline`;
    const staffChangesPath = `business_trip_missions/${mission.id}/staff_changes`;

    try {
      const membersPromise = getDocs(
        collection(firestore, "business_trip_missions", mission.id, "members"),
      );
      const timelinePromise = getDocs(
        collection(firestore, "business_trip_missions", mission.id, "timeline"),
      );
      const staffChangesPromise = getDocs(
        collection(
          firestore,
          "business_trip_missions",
          mission.id,
          "staff_changes",
        ),
      );

      const results = await Promise.allSettled([
        membersPromise,
        timelinePromise,
        staffChangesPromise,
      ]);

      const [membersResult, timelineResult, staffChangesResult] = results;

      if (membersResult.status === "fulfilled") {
        const loadedMembers = membersResult.value.docs.map((memberDoc) => ({
          id: memberDoc.id,
          ...(memberDoc.data() as BusinessTripMissionMember),
        }));
        setActiveMissionMembers(loadedMembers);

        // Auto-sync parent mission summary from live member data (fixes stale counts)
        const TERMINAL = ["on_duty", "returned_pending_report", "report_submitted", "completed", "approved_ready_to_depart"];
        if (mission.id && !TERMINAL.includes(mission.status ?? "")) {
          const activeM = loadedMembers.filter(
            (m) =>
              (m.memberStatus as string) !== "archived" &&
              (m.memberStatus as string) !== "cancelled" &&
              (m.memberStatus as string) !== "rejected",
          );
          const totalM = activeM.length;
          const approvedM = activeM.filter(
            (m) =>
              (m.managerValidationStatus as string) === "approved_by_manager" ||
              (m.approvalStatus as string) === "approved" ||
              (m.approvalStatus as string) === "validated_by_assigner",
          ).length;
          const confirmedM = activeM.filter(
            (m) => m.staffConfirmationStatus === "confirmed_by_staff",
          ).length;
          let syncStatus: string;
          if (totalM > 0 && approvedM === totalM && confirmedM === totalM) {
            syncStatus = "ready_to_depart";
          } else if (totalM > 0 && approvedM === totalM) {
            syncStatus = "waiting_staff_confirmation";
          } else {
            syncStatus = "pending_manager_validation";
          }
          const needsSync =
            (mission.managerApprovedCount ?? -1) !== approvedM ||
            (mission.staffConfirmedCount ?? -1) !== confirmedM ||
            (mission.memberCount ?? -1) !== totalM ||
            mission.status !== syncStatus;
          if (needsSync) {
            updateDoc(doc(firestore, "business_trip_missions", mission.id), {
              managerApprovedCount: approvedM,
              staffConfirmedCount: confirmedM,
              memberCount: totalM,
              totalMembers: totalM,
              status: syncStatus,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
      } else {
        const membersErr = formatErrorDetails(membersResult.reason);
        console.error("[BusinessTripDetail] Failed to load members", {
          subcollection: "members",
          path: membersPath,
          missionId: mission.id,
          uid: userProfile?.uid,
          fullName: userProfile?.fullName,
          role: userProfile?.role,
          position: userProfile?.positionTitle || userProfile?.jobTitle,
          jobTitle: userProfile?.jobTitle,
          code: membersErr.code,
          message: membersErr.message,
          stack: membersErr.stack,
          raw: membersErr.raw,
        });
        setActiveMissionMembers([]);
      }

      if (timelineResult.status === "fulfilled") {
        setActiveMissionTimeline(
          timelineResult.value.docs
            .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
            .sort((a, b) => {
              const aTs = (a.createdAt as any)?.seconds ?? 0;
              const bTs = (b.createdAt as any)?.seconds ?? 0;
              return bTs - aTs;
            }),
        );
      } else {
        const timelineErr = formatErrorDetails(timelineResult.reason);
        console.error("[BusinessTripDetail] Failed to load timeline", {
          subcollection: "timeline",
          path: timelinePath,
          missionId: mission.id,
          uid: userProfile?.uid,
          fullName: userProfile?.fullName,
          role: userProfile?.role,
          position: userProfile?.positionTitle || userProfile?.jobTitle,
          jobTitle: userProfile?.jobTitle,
          code: timelineErr.code,
          message: timelineErr.message,
          stack: timelineErr.stack,
          raw: timelineErr.raw,
        });
        setActiveMissionTimeline([]);
      }

      if (staffChangesResult.status === "fulfilled") {
        setActiveMissionStaffChanges(
          staffChangesResult.value.docs
            .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
            .sort((a, b) => {
              const aTs = (a.requestedAt as any)?.seconds ?? 0;
              const bTs = (b.requestedAt as any)?.seconds ?? 0;
              return bTs - aTs;
            }),
        );
      } else {
        const scErr = formatErrorDetails(staffChangesResult.reason);
        console.warn(
          "[BusinessTripDetail] Failed to load staff_changes, continuing detail render",
          {
            subcollection: "staff_changes",
            path: staffChangesPath,
            missionId: mission.id,
            uid: userProfile?.uid,
            fullName: userProfile?.fullName,
            role: userProfile?.role,
            position: userProfile?.positionTitle || userProfile?.jobTitle,
            jobTitle: userProfile?.jobTitle,
            code: scErr.code,
            name: scErr.name,
            message: scErr.message,
            stack: scErr.stack,
            raw: scErr.raw,
            stringValue: String(staffChangesResult.reason),
          },
        );
        // staff_changes is optional for rendering — continue with empty array
        setActiveMissionStaffChanges([]);
      }
    } catch (error: any) {
      console.error("Failed to load active mission data", {
        missionId: mission.id,
        uid: userProfile?.uid,
        role: userProfile?.role,
        jobTitle: userProfile?.jobTitle || userProfile?.positionTitle,
        error: error?.message || error,
      });
      toast({
        variant: "destructive",
        title: "Gagal memuat detail perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const selectMissionForDetail = async (mission: BusinessTripMission) => {
    setActiveMission(mission);
    setActiveMode("detail");
    await loadActiveMissionData(mission);
  };


  const selectMissionForEdit = async (mission: BusinessTripMission) => {
    setActiveMission(mission);
    setMissionForm({
      missionName: mission.missionName || "",
      assignmentNumber: mission.assignmentNumber || "",
      projectName: mission.projectName || "",
      clientName: mission.clientName || "",
      tripType: mission.tripType || "Sampling",
      tripTypeOther: mission.tripTypeOther || "",
      destinationProvince: mission.destinationProvince || "",
      destinationRegency: mission.destinationRegency || "",
      destinationAddress: mission.destinationAddress || "",
      destinationGoogleMaps: mission.destinationGoogleMaps || "",
      startDate:
        mission.startDate instanceof Timestamp
          ? mission.startDate.toDate().toISOString().slice(0, 10)
          : mission.startDate || "",
      endDate:
        mission.endDate instanceof Timestamp
          ? mission.endDate.toDate().toISOString().slice(0, 10)
          : mission.endDate || "",
      instructionNote: mission.instructionNote || "",
      googleDriveLink: mission.googleDriveLink || "",
    });
    setEditAssignmentLetterFile(null);
    setEditAssignmentLetterError(null);
    setActiveMode("edit");
  };

  const selectMissionForManage = async (mission: BusinessTripMission) => {
    setActiveMission(mission);
    setManageSelectedStaffUids([]);
    setManageStaffReason("");
    setActiveMode("manage");
    await loadActiveMissionData(mission);
  };

  const notifyMissionMembers = async (
    missionId: string,
    type: string,
    missionName: string,
    message: string,
    memberUids: string[],
  ) => {
    if (!firestore) return;
    await Promise.all(
      memberUids.map(async (uid) => {
        try {
          const notifRef = doc(collection(firestore, "users", uid, "notifications"));
          await setDoc(notifRef, {
            type,
            missionId,
            missionName,
            message,
            createdAt: serverTimestamp(),
            read: false,
            byUid: userProfile?.uid || null,
            byName: userProfile?.fullName || null,
          });
        } catch (e) {
          console.warn("notifyMissionMembers failed for", uid, e);
        }
      }),
    );
  };

  const handleUpdateMission = async () => {
    if (!firestore || !activeMission?.id) return;
    if (
      activeMission.status === "completed" ||
      activeMission.status === "cancelled"
    ) {
      toast({
        variant: "destructive",
        title: "Perjalanan dinas tidak dapat diedit",
        description:
          "Perjalanan dinas yang sudah selesai atau dibatalkan tidak bisa diubah.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
      );
      const missionSnapshot = await getDoc(missionDocRef);
      if (!missionSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Perjalanan dinas tidak ditemukan",
          description: "Data perjalanan sudah tidak tersedia.",
        });
        return;
      }

      // Detect changed fields to generate targeted notifications
      const old = activeMission;
      const oldStartDate = old.startDate instanceof Timestamp
        ? old.startDate.toDate().toISOString().slice(0, 10)
        : old.startDate || "";
      const oldEndDate = old.endDate instanceof Timestamp
        ? old.endDate.toDate().toISOString().slice(0, 10)
        : old.endDate || "";
      const oldDestination = [old.destinationProvince, old.destinationRegency, old.destinationAddress]
        .filter(Boolean).join(", ");
      const newDestination = [missionForm.destinationProvince, missionForm.destinationRegency, missionForm.destinationAddress]
        .filter(Boolean).join(", ");

      const changeLog: string[] = [];

      if (missionForm.startDate !== oldStartDate || missionForm.endDate !== oldEndDate) {
        changeLog.push(`Tanggal perjalanan diubah dari ${oldStartDate}–${oldEndDate} menjadi ${missionForm.startDate}–${missionForm.endDate} oleh ${userProfile?.fullName || "management"}.`);
      }
      if (oldDestination !== newDestination && newDestination) {
        changeLog.push(`Tujuan perjalanan diubah dari "${oldDestination || "-"}" menjadi "${newDestination}" oleh ${userProfile?.fullName || "management"}.`);
      }
      const oldInstruction = stripHtml(old.instructionNote || "");
      const newInstruction = stripHtml(missionForm.instructionNote || "");
      if (oldInstruction !== newInstruction) {
        changeLog.push(`Instruksi perjalanan diperbarui oleh ${userProfile?.fullName || "management"}.`);
      }

      let assignmentLetterUrl = activeMission.assignmentLetterUrl || "";
      let assignmentLetterDriveUrl =
        activeMission.assignmentLetterDriveUrl ||
        activeMission.googleDriveLink ||
        "";
      let assignmentLetterDriveFileId =
        activeMission.assignmentLetterDriveFileId || "";
      let assignmentLetterFileName =
        activeMission.assignmentLetterFileName || "";
      let assignmentLetterSource:
        | "local_upload"
        | "system_drive_upload"
        | "google_drive"
        | "google_drive_link"
        | "firebase_storage" =
        activeMission.assignmentLetterSource ||
        activeMission.documentSource ||
        (missionForm.googleDriveLink
          ? "google_drive_link"
          : "system_drive_upload");
      let documentSource =
        activeMission.documentSource ||
        (missionForm.googleDriveLink ? "google_drive_link" : "google_drive");
      let assignmentLetterUploadedAt =
        activeMission.assignmentLetterUploadedAt || null;
      let assignmentLetterUploadedBy =
        activeMission.assignmentLetterUploadedBy || "";
      let assignmentLetterAccessMode:
        | "anyone_with_link"
        | "internal_viewer"
        | null = activeMission.assignmentLetterAccessMode || null;
      let documentUpdated = false;
      const existingDriveLink = activeMission.googleDriveLink || "";
      const newDriveLink = missionForm.googleDriveLink?.trim() || "";

      if (editAssignmentLetterFile) {
        const categoryUploadOptions: UploadOptions = {
          category: "business_trip_spd",
          ownerUid: userProfile?.uid || "",
        };
        const uploadResult = await uploadFileToGoogleDrive(
          editAssignmentLetterFile,
          userProfile?.uid || "",
          categoryUploadOptions,
        );
        assignmentLetterDriveUrl =
          uploadResult.googleDriveWebViewLink ||
          uploadResult.webViewLink ||
          uploadResult.directViewUrl ||
          uploadResult.viewUrl ||
          assignmentLetterDriveUrl;
        assignmentLetterDriveFileId = uploadResult.fileId || "";
        assignmentLetterUrl = assignmentLetterDriveUrl || assignmentLetterUrl;
        assignmentLetterFileName =
          uploadResult.fileName || editAssignmentLetterFile.name;
        documentSource = "google_drive";
        assignmentLetterSource = "system_drive_upload";
        assignmentLetterAccessMode =
          uploadResult.accessMode || "anyone_with_link";
        assignmentLetterUploadedAt = serverTimestamp();
        assignmentLetterUploadedBy = userProfile?.uid || "";
        documentUpdated = true;
      } else if (newDriveLink !== existingDriveLink) {
        assignmentLetterUrl = newDriveLink;
        assignmentLetterDriveUrl = newDriveLink;
        assignmentLetterDriveFileId = "";
        assignmentLetterFileName = "";
        documentSource = "google_drive_link";
        assignmentLetterSource = "google_drive_link";
        assignmentLetterUploadedAt = null;
        assignmentLetterUploadedBy = "";
        documentUpdated = true;
      }

      await updateDoc(missionDocRef, {
        missionName: missionForm.missionName,
        assignmentNumber: missionForm.assignmentNumber,
        projectName: missionForm.projectName,
        clientName: missionForm.clientName,
        tripType: missionForm.tripType,
        tripTypeOther:
          missionForm.tripType === "Lainnya" ? missionForm.tripTypeOther : "",
        destinationProvince: missionForm.destinationProvince,
        destinationRegency: missionForm.destinationRegency,
        destinationAddress: missionForm.destinationAddress,
        destinationGoogleMaps: missionForm.destinationGoogleMaps,
        startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
        endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
        durationDays: calculateDurationDays(
          missionForm.startDate,
          missionForm.endDate,
        ),
        instructionNote: missionForm.instructionNote,
        instructionHtml: missionForm.instructionNote,
        instructionText: stripHtml(missionForm.instructionNote),
        assignmentLetterUrl,
        assignmentLetterDriveUrl,
        assignmentLetterDriveFileId,
        assignmentLetterFileName,
        documentSource,
        assignmentLetterSource,
        assignmentLetterAccessMode,
        assignmentLetterUploadedAt,
        assignmentLetterUploadedBy,
        googleDriveLink: newDriveLink,
        updatedAt: serverTimestamp(),
      });

      if (documentUpdated) {
        changeLog.push(`Dokumen Surat Tugas/SPD diperbarui oleh ${userProfile?.fullName || "management"}.`);
      }

      // Check if date changed and any active member is now in conflict
      const dateChanged = missionForm.startDate !== oldStartDate || missionForm.endDate !== oldEndDate;
      if (dateChanged && missionForm.startDate && missionForm.endDate) {
        const newStart = new Date(missionForm.startDate);
        const newEnd = new Date(missionForm.endDate);
        newStart.setHours(0, 0, 0, 0);
        newEnd.setHours(23, 59, 59, 999);
        const newStartSec = newStart.getTime() / 1000;
        const newEndSec = newEnd.getTime() / 1000;

        // Check current mission members against busy map for other missions
        const conflictedNames: string[] = [];
        activeMissionMembers.forEach((member) => {
          const ms = member.memberStatus as string;
          if (["archived", "cancelled", "rejected_by_manager", "declined_by_staff"].includes(ms)) return;
          const busyEntries = staffBusyMap[member.employeeUid] ?? [];
          for (const entry of busyEntries) {
            if (entry.missionId === activeMission.id) continue; // same mission
            if (datesOverlap(newStartSec, newEndSec, entry.startDate, entry.endDate)) {
              conflictedNames.push(`${member.employeeName} (${entry.missionName})`);
              break;
            }
          }
        });

        if (conflictedNames.length > 0) {
          changeLog.push(
            `Perhatian: Tanggal baru bentrok untuk ${conflictedNames.length} anggota: ${conflictedNames.join("; ")}. Pertimbangkan untuk mengganti anggota yang bentrok.`
          );
        }
      }

      // Write all timeline entries for changes
      if (changeLog.length > 0) {
        const timelineRef = collection(
          firestore,
          "business_trip_missions",
          activeMission.id,
          "timeline",
        );
        await Promise.all(
          changeLog.map((msg) =>
            addDoc(timelineRef, {
              message: msg,
              category: "changes",
              createdAt: serverTimestamp(),
              byUid: userProfile?.uid || null,
              byName: userProfile?.fullName || null,
            }),
          ),
        );

        // Notify all active members about changes
        const membersSnap = await getDocs(
          collection(firestore, "business_trip_missions", activeMission.id, "members"),
        );
        const activeUids = membersSnap.docs
          .map((d) => d.data())
          .filter((m) => m.memberStatus !== "archived" && m.memberStatus !== "cancelled")
          .map((m) => m.employeeUid as string)
          .filter(Boolean);

        const changeTypes = [];
        if (changeLog.some((l) => l.startsWith("Tanggal"))) changeTypes.push("mission_date_changed");
        if (changeLog.some((l) => l.startsWith("Tujuan"))) changeTypes.push("mission_destination_changed");
        if (changeLog.some((l) => l.startsWith("Instruksi"))) changeTypes.push("mission_instruction_changed");
        if (changeLog.some((l) => l.startsWith("Dokumen"))) changeTypes.push("mission_document_changed");

        await notifyMissionMembers(
          activeMission.id,
          changeTypes[0] || "mission_updated",
          activeMission.missionName || "",
          changeLog.join(" "),
          activeUids,
        );
      }

      toast({
        title: "Perubahan perjalanan dinas tersimpan",
        description: changeLog.length > 0
          ? `${changeLog.length} perubahan dicatat dan anggota telah dinotifikasi.`
          : "Informasi perjalanan telah diperbarui.",
      });
      refreshMissionList();
      setActiveMode("list");
      setActiveMission(null);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal menyimpan perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveMission = async (mission: BusinessTripMission) => {
    if (!firestore || !mission.id) return;
    setIsSaving(true);
    try {
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        mission.id,
      );
      const missionSnapshot = await getDoc(missionDocRef);
      if (!missionSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Perjalanan dinas tidak ditemukan",
          description: "Perjalanan dinas sudah dihapus atau tidak tersedia.",
        });
        return;
      }
      await updateDoc(missionDocRef, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      toast({
        title: "Perjalanan dinas dibatalkan",
        description: "Perjalanan dinas berhasil dibatalkan.",
      });
      refreshMissionList();
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membatalkan perjalanan dinas",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStaffToMission = async () => {
    if (!firestore || !activeMission?.id) return;
    if (manageSelectedStaffUids.length === 0) {
      toast({
        variant: "destructive",
        title: "Pilih staff terlebih dahulu",
      });
      return;
    }
    if (!manageStaffReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan penambahan wajib diisi",
      });
      return;
    }

    setIsSaving(true);
    try {
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
      );
      const missionSnapshot = await getDoc(missionDocRef);
      if (!missionSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Perjalanan dinas tidak ditemukan",
        });
        return;
      }

      const selectedStaff = allMergedStaff.filter((staff) =>
        manageSelectedStaffUids.includes(staff.uid),
      );
      const membersRef = collection(
        firestore,
        "business_trip_missions",
        activeMission.id,
        "members",
      );

      const newMembers = await Promise.all(
        selectedStaff.map(async (staff) => {
          const memberRef = doc(membersRef);
          const memberManagerUid =
            staff.managerUid || (staff.isDivisionManager ? staff.uid : "");
          const contData = manageContinuationSelections[staff.uid];

          const memberData: BusinessTripMissionMember = {
            missionId: activeMission.id || "",
            missionName: activeMission.missionName || "",
            assignmentNumber: activeMission.assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeePosition: staff.jobTitle || "-",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || "-",
            managerUid: memberManagerUid,
            managerName: staff.managerName || staff.fullName,
            requiresManagerValidation: true,
            memberStatus: "waiting_manager_validation",
            managerValidationStatus: "waiting_manager_validation",
            managerValidationNote: null,
            staffConfirmationStatus: "waiting_staff_confirmation",
            missionStatus: activeMission.status || "pending_manager_validation",
            // Continuation fields
            ...(contData ? {
              isContinuationAssignment: true,
              continuedFromMissionId: contData.missionId,
              continuedFromMissionName: contData.missionName,
              continuedFromDestination: contData.destination,
              continuedFromEndDate: contData.endDate,
              transitionType: "direct_transfer" as const,
              transitionNote: contData.transitionNote || undefined,
            } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(memberRef, memberData);

          // Write timeline to OLD mission when continuation
          if (contData) {
            try {
              await addDoc(
                collection(firestore, "business_trip_missions", contData.missionId, "timeline"),
                {
                  message: `${staff.fullName} dijadwalkan lanjut ke misi "${activeMission.missionName || ""}".`,
                  category: "changes",
                  createdAt: serverTimestamp(),
                  byUid: userProfile?.uid || null,
                  byName: userProfile?.fullName || null,
                },
              );
            } catch (e) {
              console.warn("Continuation old-mission timeline write failed", e);
            }
          }

          return memberData;
        }),
      );

      await addDoc(
        collection(
          firestore,
          "business_trip_missions",
          activeMission.id,
          "staff_changes",
        ),
        {
          action: "add_staff",
          newEmployees: selectedStaff.map((s) => ({
            uid: s.uid,
            name: s.fullName,
            brandName: s.brandName,
            divisionName: s.divisionName,
          })),
          requestedBy: userProfile?.uid,
          requestedByName: userProfile?.fullName,
          reason: manageStaffReason,
          requestedAt: serverTimestamp(),
        },
      );

      // Timeline entry for new staff (including continuation notes)
      const newNames = selectedStaff.map((s) => s.fullName).join(", ");
      await addDoc(
        collection(firestore, "business_trip_missions", activeMission.id, "timeline"),
        {
          message: `Anggota baru ditambahkan: ${newNames}.`,
          category: "changes",
          createdAt: serverTimestamp(),
          byUid: userProfile?.uid || null,
          byName: userProfile?.fullName || null,
        },
      );

      // Write continuation entries to new mission's timeline
      for (const staff of selectedStaff) {
        const contData = manageContinuationSelections[staff.uid];
        if (contData) {
          try {
            await addDoc(
              collection(firestore, "business_trip_missions", activeMission.id, "timeline"),
              {
                message: `${staff.fullName} bergabung sebagai lanjutan dari misi "${contData.missionName}".`,
                category: "changes",
                createdAt: serverTimestamp(),
                byUid: userProfile?.uid || null,
                byName: userProfile?.fullName || null,
              },
            );
          } catch (e) {
            console.warn("Continuation new-mission timeline write failed", e);
          }
        }
      }

      // Notify new members about assignment
      await Promise.all(
        selectedStaff.map(async (staff) => {
          try {
            const notifRef = doc(collection(firestore, "users", staff.uid, "notifications"));
            await setDoc(notifRef, {
              type: "business_trip_assigned",
              missionId: activeMission.id,
              missionName: activeMission.missionName || "",
              message: `Anda ditambahkan ke perjalanan dinas ${activeMission.missionName || ""}.`,
              createdAt: serverTimestamp(),
              read: false,
              byUid: userProfile?.uid || null,
              byName: userProfile?.fullName || null,
            });
          } catch (e) {
            console.warn("Notify new member failed", e);
          }
        }),
      );

      const activeMembers = activeMissionMembers.filter(
        (member) => member.memberStatus !== "archived",
      );
      const combinedMembers = [...activeMembers, ...newMembers];
      const managerValidations =
        buildManagerValidationSummaries(combinedMembers);
      const assignedManagerUids = Array.from(
        new Set(
          combinedMembers.map((member) => member.managerUid).filter(Boolean),
        ),
      );
      const allApproved = managerValidations.every(
        (item) => item.status === "approved",
      );

      // Don't downgrade terminal statuses when adding members mid-mission
      const TERMINAL_STATUSES = ["on_duty", "returned_pending_report", "report_submitted", "completed", "ready_to_depart", "approved_ready_to_depart"];
      const newStatus = TERMINAL_STATUSES.includes(activeMission.status ?? "")
        ? activeMission.status
        : allApproved
          ? "waiting_staff_confirmation"
          : activeMission.status || "pending_manager_validation";

      await updateDoc(missionDocRef, {
        memberCount: (activeMission.memberCount ?? 0) + selectedStaff.length,
        managerValidationCount: managerValidations.length,
        managerApprovedCount: managerValidations.filter(
          (item) => item.status === "approved",
        ).length,
        managerUids: assignedManagerUids,
        managerValidations,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Anggota berhasil ditambahkan",
        description: `Berhasil menambah ${selectedStaff.length} anggota baru. Timeline diperbarui.`,
      });
      await loadActiveMissionData(activeMission);
      refreshMissionList();
      setManageSelectedStaffUids([]);
      setManageContinuationSelections({});
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal tambah staff",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveStaffMember = async (
    member: BusinessTripMissionMember,
  ) => {
    if (!firestore || !activeMission?.id || !member.id) return;
    if (!manageStaffReason.trim()) {
      toast({
        variant: "destructive",
        title: "Alasan pembatalan wajib diisi",
      });
      return;
    }
    setIsSaving(true);
    try {
      const memberRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
        "members",
        member.id,
      );
      const memberSnapshot = await getDoc(memberRef);
      if (!memberSnapshot.exists()) {
        toast({
          variant: "destructive",
          title: "Data anggota tidak ditemukan",
        });
        return;
      }

      await updateDoc(memberRef, {
        memberStatus: "archived",
        updatedAt: serverTimestamp(),
      });
      await addDoc(
        collection(
          firestore,
          "business_trip_missions",
          activeMission.id,
          "staff_changes",
        ),
        {
          action: "archive_staff",
          oldEmployee: {
            uid: member.employeeUid,
            name: member.employeeName,
          },
          requestedBy: userProfile?.uid,
          requestedByName: userProfile?.fullName,
          reason: manageStaffReason,
          requestedAt: serverTimestamp(),
        },
      );

      const remainingMembers = activeMissionMembers.filter(
        (m) => m.id !== member.id && m.memberStatus !== "archived",
      );
      const managerValidations =
        buildManagerValidationSummaries(remainingMembers);
      const missionDocRef = doc(
        firestore,
        "business_trip_missions",
        activeMission.id,
      );
      await updateDoc(missionDocRef, {
        managerValidationCount: managerValidations.length,
        managerApprovedCount: managerValidations.filter(
          (item) => item.status === "approved",
        ).length,
        managerValidations,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Staff diarsipkan",
        description: `${member.employeeName} berhasil diarsipkan.`,
      });
      await loadActiveMissionData(activeMission);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal arsipkan staff",
        description: error?.message || "Coba lagi nanti.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveReport = async () => {
    if (!firestore || !activeMission?.id || !activeMissionFinalReport || !userProfile) return;
    setIsReviewingReport(true);
    try {
      const reportRef = doc(firestore, "business_trip_missions", activeMission.id, "final_report", "main");
      await updateDoc(reportRef, {
        reportReviewStatus: "approved",
        reviewedByUid: userProfile.uid,
        reviewedByName: userProfile.fullName || userProfile.email || "",
        reviewedAt: serverTimestamp(),
        revisionNote: null,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, "business_trip_missions", activeMission.id, "timeline"), {
        message: `${userProfile.fullName || userProfile.email} menyetujui laporan akhir dinas.`,
        category: "approval",
        byName: userProfile.fullName || userProfile.email || null,
        byUid: userProfile.uid,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Laporan disetujui." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal menyetujui laporan", description: error?.message });
    } finally {
      setIsReviewingReport(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!firestore || !activeMission?.id || !activeMissionFinalReport || !userProfile) return;
    if (!revisionNote.trim()) {
      toast({ variant: "destructive", title: "Catatan revisi wajib diisi." });
      return;
    }
    setIsReviewingReport(true);
    try {
      const reportRef = doc(firestore, "business_trip_missions", activeMission.id, "final_report", "main");
      await updateDoc(reportRef, {
        reportReviewStatus: "revision_requested",
        reviewedByUid: userProfile.uid,
        reviewedByName: userProfile.fullName || userProfile.email || "",
        reviewedAt: serverTimestamp(),
        revisionNote: revisionNote.trim(),
        updatedAt: serverTimestamp(),
      });
      // Revert mission status so staff can re-submit
      await updateDoc(doc(firestore, "business_trip_missions", activeMission.id), {
        status: "returned_pending_report",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, "business_trip_missions", activeMission.id, "timeline"), {
        message: `${userProfile.fullName || userProfile.email} meminta revisi laporan akhir. Catatan: ${revisionNote.trim()}`,
        category: "approval",
        byName: userProfile.fullName || userProfile.email || null,
        byUid: userProfile.uid,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Permintaan revisi dikirim ke pelapor." });
      setRevisionNote("");
      setShowRevisionForm(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal meminta revisi", description: error?.message });
    } finally {
      setIsReviewingReport(false);
    }
  };

  const handleFinalizeMissionComplete = async () => {
    if (!firestore || !activeMission?.id || !userProfile) return;
    setIsArchivingMission(true);
    try {
      await updateDoc(doc(firestore, "business_trip_missions", activeMission.id), {
        status: "completed",
        archivedAt: serverTimestamp(),
        archivedByUid: userProfile.uid,
        archivedByName: userProfile.fullName || userProfile.email || "",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, "business_trip_missions", activeMission.id, "timeline"), {
        message: `${userProfile.fullName || userProfile.email} menutup dan mengarsipkan perjalanan dinas. Status: Selesai.`,
        category: "system",
        byName: userProfile.fullName || userProfile.email || null,
        byUid: userProfile.uid,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Perjalanan dinas berhasil diarsipkan." });
      refreshMissionList();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal mengarsipkan", description: error?.message });
    } finally {
      setIsArchivingMission(false);
    }
  };

  const handleCloseDetails = () => {
    setActiveMode("list");
    setActiveMission(null);
    setActiveMissionMembers([]);
    setActiveMissionTimeline([]);
    setActiveMissionStaffChanges([]);
  };

  const handleCancelEdit = () => {
    setActiveMode("list");
    setActiveMission(null);
  };

  const handleOpenCreate = () => {
    setActiveMode("create");
  };

  const handleCloseCreate = () => {
    setActiveMode("list");
  };

  const renderMissionDetailView = () => {
    if (!activeMission) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Detail Perjalanan Dinas</CardTitle>
            <CardDescription>
              Informasi lengkap perjalanan dinas, anggota, timeline, dan riwayat
              perubahan.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCloseDetails}>
              Kembali
            </Button>
            <Button
              variant="secondary"
              onClick={() => selectMissionForEdit(activeMission)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => selectMissionForManage(activeMission)}
            >
              Kelola Anggota
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {(() => {
            const activeMembers = activeMissionMembers.filter(
              (member) => member.memberStatus !== "archived",
            );
            const managerProgress =
              computeManagerValidationProgress(activeMembers);
            const confirmedCount = activeMembers.filter(
              (member) =>
                member.staffConfirmationStatus === "confirmed_by_staff",
            ).length;
            const documentUrl =
              activeMission.assignmentLetterDriveUrl?.trim() ||
              activeMission.googleDriveWebViewLink ||
              activeMission.googleDriveLink ||
              activeMission.assignmentLetterUrl ||
              "";
            const documentLabel =
              activeMission.assignmentLetterFileName ||
              (documentUrl ? "Surat Tugas/SPD" : "Surat Tugas/SPD");

            return (
              <>
                <section className="space-y-4">
                  <SectionHeader
                    icon={FileText}
                    title="Ringkasan Perjalanan Dinas"
                    description="Informasi utama perjalanan dan status saat ini."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Judul Perjalanan
                      </p>
                      <p className="mt-2 font-semibold text-foreground">
                        {activeMission.missionName}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Nomor Surat/SPD
                      </p>
                      <p className="mt-2 font-semibold text-foreground">
                        {activeMission.assignmentNumber || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Status Aktual</p>
                      <div className="mt-2">
                        {renderStatusLabel(computeTrackingDisplayStatus(activeMission, memberTrackingMap[activeMission.id ?? ""]))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── Monitoring Perjalanan ── */}
                {(() => {
                  const tracking = memberTrackingMap[activeMission.id ?? ""];
                  if (!tracking || tracking.total === 0) return null;
                  const activeMembers = activeMissionMembers.filter(
                    (m) => !["archived", "declined_by_staff", "rejected_by_manager"].includes(m.memberStatus as string),
                  );

                  type StepDef = {
                    key: string; label: string; icon: React.ElementType; count: number;
                    doneNames: string[]; notDoneNames: string[]; lastAt: any;
                    color: string; bg: string; border: string;
                  };
                  const stepsData: StepDef[] = [
                    {
                      key: "departed", label: "Berangkat", icon: Navigation, count: tracking.departed,
                      doneNames: activeMembers.filter(m => ["departed","arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
                      notDoneNames: activeMembers.filter(m => !["departed","arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
                      lastAt: activeMembers.filter(m => m.departedAt).reduce((best, m) => toSeconds(m.departedAt) > toSeconds(best) ? m.departedAt : best, null as any),
                      color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50/60 dark:bg-blue-900/20", border: "border-blue-200/60 dark:border-blue-800/40",
                    },
                    {
                      key: "arrived", label: "Sampai Lokasi", icon: MapPin, count: tracking.arrived,
                      doneNames: activeMembers.filter(m => ["arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
                      notDoneNames: activeMembers.filter(m => !["arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
                      lastAt: activeMembers.filter(m => m.arrivedAt).reduce((best, m) => toSeconds(m.arrivedAt) > toSeconds(best) ? m.arrivedAt : best, null as any),
                      color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50/60 dark:bg-indigo-900/20", border: "border-indigo-200/60 dark:border-indigo-800/40",
                    },
                    {
                      key: "activity_done", label: "Kegiatan Selesai", icon: CheckSquare, count: tracking.activityDone,
                      doneNames: activeMembers.filter(m => ["activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
                      notDoneNames: activeMembers.filter(m => !["activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
                      lastAt: activeMembers.filter(m => m.activityDoneAt).reduce((best, m) => toSeconds(m.activityDoneAt) > toSeconds(best) ? m.activityDoneAt : best, null as any),
                      color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50/60 dark:bg-purple-900/20", border: "border-purple-200/60 dark:border-purple-800/40",
                    },
                    {
                      key: "returned", label: "Kembali", icon: Home, count: tracking.returned,
                      doneNames: activeMembers.filter(m => m.memberTripStatus === "returned").map(m => m.employeeName),
                      notDoneNames: activeMembers.filter(m => m.memberTripStatus !== "returned").map(m => m.employeeName),
                      lastAt: activeMembers.filter(m => m.returnedAt).reduce((best, m) => toSeconds(m.returnedAt) > toSeconds(best) ? m.returnedAt : best, null as any),
                      color: "text-green-600 dark:text-green-400", bg: "bg-green-50/60 dark:bg-green-900/20", border: "border-green-200/60 dark:border-green-800/40",
                    },
                  ];

                  return (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-semibold">Monitoring Perjalanan</h3>
                        {tracking.issues > 0 && (
                          <span className="flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50/60 px-2.5 py-0.5 text-sm font-semibold text-red-700 dark:border-red-800/30 dark:bg-red-900/20 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {tracking.issues} kendala
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {stepsData.map((step) => {
                          const Icon = step.icon;
                          const allDone = step.count >= tracking.total;
                          const partDone = step.count > 0 && !allDone;
                          return (
                            <div key={step.key} className={`rounded-xl border p-4 space-y-2 ${allDone ? `${step.bg} ${step.border}` : partDone ? "border-border/60 bg-muted/10" : "border-border/40 bg-muted/5 opacity-60"}`}>
                              <div className="flex items-center gap-2">
                                <Icon className={`h-5 w-5 flex-shrink-0 ${step.count > 0 ? step.color : "text-muted-foreground/40"}`} />
                                <span className="text-sm font-semibold text-foreground">{step.label}</span>
                                <span className={`ml-auto text-lg font-bold tabular-nums ${step.count > 0 ? step.color : "text-muted-foreground/40"}`}>
                                  {step.count}<span className="text-xs font-normal text-muted-foreground">/{tracking.total}</span>
                                </span>
                              </div>
                              {step.doneNames.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-muted-foreground/60 mb-0.5">Sudah</p>
                                  <p className="text-sm text-foreground leading-snug">
                                    {step.doneNames.slice(0, 3).join(", ")}{step.doneNames.length > 3 && ` +${step.doneNames.length - 3}`}
                                  </p>
                                </div>
                              )}
                              {step.notDoneNames.length > 0 && step.count > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-muted-foreground/60 mb-0.5">Belum</p>
                                  <p className="text-sm text-muted-foreground leading-snug">
                                    {step.notDoneNames.slice(0, 2).join(", ")}{step.notDoneNames.length > 2 && ` +${step.notDoneNames.length - 2}`}
                                  </p>
                                </div>
                              )}
                              {step.lastAt && (
                                <p className="text-xs text-muted-foreground/70">Update: {formatDateTime(step.lastAt)}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })()}

                <section className="space-y-4">
                  <SectionHeader
                    icon={FileText}
                    title="Informasi Surat Tugas/SPD"
                    description="Tinjau dokumen Surat Tugas/SPD yang terlampir."
                  />
                  <div className="rounded-lg border border-border p-4 bg-muted/30">
                    {documentUrl ? (
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Nama dokumen
                          </p>
                          <p className="font-medium text-foreground">
                            {documentLabel}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Sumber dokumen
                          </p>
                          <p className="font-medium capitalize text-foreground">
                            {activeMission.assignmentLetterSource ===
                            "local_upload"
                              ? "Upload File"
                              : activeMission.assignmentLetterSource ===
                                  "system_drive_upload"
                                ? "Upload File via Drive HRP"
                                : activeMission.assignmentLetterSource ===
                                    "google_drive_link"
                                  ? "Google Drive Link Manual"
                                  : activeMission.documentSource ===
                                      "firebase_storage"
                                    ? "Upload File"
                                    : "Upload File via Drive HRP"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleOpenDocumentViewer}
                          >
                            Lihat Dokumen
                          </Button>
                          {activeMission.googleDriveLink &&
                            activeMission.googleDriveLink !== documentUrl && (
                              <a
                                href={activeMission.googleDriveLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button size="sm" variant="secondary">
                                  Buka Link
                                </Button>
                              </a>
                            )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Surat Tugas belum dilampirkan.
                      </p>
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={MapPin}
                    title="Tujuan & Jadwal"
                    description="Detail lokasi, alamat, dan tanggal perjalanan."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Tujuan</p>
                      <p className="font-medium">
                        {activeMission.destinationProvince}
                        {activeMission.destinationRegency
                          ? ` / ${activeMission.destinationRegency}`
                          : ""}
                      </p>
                      {activeMission.destinationAddress && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {activeMission.destinationAddress}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Tanggal</p>
                      <p className="font-medium">
                        {formatDate(activeMission.startDate)} –{" "}
                        {formatDate(activeMission.endDate)}
                      </p>
                      {activeMission.destinationGoogleMaps && (
                        <a
                          href={activeMission.destinationGoogleMaps}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline mt-2 block"
                        >
                          Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={FileText}
                    title="Instruksi Perjalanan"
                    description="Instruksi lengkap untuk seluruh anggota dinas."
                  />
                  <div
                    className="prose prose-neutral max-w-none text-foreground leading-relaxed prose-ol:list-decimal prose-ul:list-disc prose-ul:pl-5 prose-li:mt-2 prose-p:mt-2"
                    dangerouslySetInnerHTML={{
                      __html: activeMission.instructionHtml || "",
                    }}
                  />
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Anggota Dinas"
                    description="Daftar anggota aktif dalam perjalanan dinas ini."
                  />
                  {activeMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada anggota terdaftar.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Posisi</TableHead>
                            <TableHead>Brand / Divisi</TableHead>
                            <TableHead>Atasan / Approver</TableHead>
                            <TableHead>Approval Status</TableHead>
                            <TableHead>Confirmation Status</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeMembers.map((member) => (
                            <TableRow key={member.id}>
                              <TableCell>{member.employeeName}</TableCell>
                              <TableCell>
                                {member.employeePosition || "-"}
                              </TableCell>
                              <TableCell>
                                {member.brandName || "-"} /{" "}
                                {member.divisionName || "-"}
                              </TableCell>
                              <TableCell>
                                {member.approvalTargetName || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge className="capitalize">
                                  {formatMemberApprovalStatus(
                                    member.managerValidationStatus ||
                                      member.approvalStatus,
                                    member.managerName,
                                  ) ||
                                    formatMemberStatusLabel(
                                      member.managerValidationStatus ||
                                        member.approvalStatus,
                                    )}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className="capitalize">
                                  {formatStaffConfirmationStatus(
                                    member.staffConfirmationStatus,
                                  )}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className="capitalize">
                                  {formatMemberStatusLabel(member.memberStatus)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Validasi Manager Divisi"
                    description="Validasi dihitung per manager unik, bukan per anggota."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Manager unik
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {managerProgress.managerCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">
                        Sudah disetujui
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {managerProgress.approvedCount}/
                        {managerProgress.managerCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground">Ditolak</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {managerProgress.rejectedCount}
                      </p>
                    </div>
                  </div>
                  {managerProgress.managerValidations.length > 0 && (
                    <div className="rounded-lg border border-border p-4 space-y-4">
                      {managerProgress.managerValidations.map((item) => (
                        <div
                          key={`${item.managerUid}-${item.divisionName}`}
                          className="pb-4 last:pb-0 border-b border-border last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="font-semibold text-sm">
                                {item.managerName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.approverRole === "director"
                                  ? "Direktur"
                                  : "Manager Divisi"}{" "}
                                · {item.divisionName}
                              </p>
                            </div>
                            <Badge
                              variant={
                                item.status === "approved"
                                  ? "success"
                                  : item.status === "rejected"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className="text-xs shrink-0"
                            >
                              {item.status === "approved"
                                ? "Sudah disetujui"
                                : item.status === "rejected"
                                  ? "Ditolak"
                                  : "Menunggu"}
                            </Badge>
                          </div>
                          <div className="space-y-1 pl-2 border-l-2 border-border">
                            {item.memberDetails.map((detail) => {
                              const memberStatusLabel =
                                detail.status === "approved"
                                  ? `Disetujui oleh ${item.managerName}`
                                  : detail.status === "rejected"
                                    ? `Ditolak oleh ${item.managerName}`
                                    : detail.isDivisionManager
                                      ? "Menunggu persetujuan direktur"
                                      : "Menunggu persetujuan atasan";
                              return (
                                <div
                                  key={detail.uid}
                                  className="flex items-center justify-between gap-2 text-sm"
                                >
                                  <span className="text-foreground">
                                    {detail.name}
                                  </span>
                                  <span
                                    className={
                                      detail.status === "approved"
                                        ? "text-green-600 text-xs font-medium"
                                        : detail.status === "rejected"
                                          ? "text-red-600 text-xs font-medium"
                                          : "text-muted-foreground text-xs"
                                    }
                                  >
                                    {memberStatusLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader
                    icon={Users}
                    title="Konfirmasi Staff"
                    description="Tampilan progress konfirmasi staf aktif."
                  />
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm text-muted-foreground">
                      Staf yang sudah konfirmasi
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {confirmedCount}/{activeMembers.length}
                    </p>
                  </div>
                </section>

                {/* ── Detail Anggota ── */}
                {activeMembers.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-lg font-semibold">Detail Anggota</h3>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Nama</th>
                            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden sm:table-cell">Posisi / Divisi</th>
                            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Berangkat</th>
                            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground hidden md:table-cell">Sampai</th>
                            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground hidden lg:table-cell">Selesai</th>
                            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Kembali</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeMembers.map((m) => {
                            const tripStatusLabels: Record<string, { label: string; color: string }> = {
                              ready: { label: "Siap", color: "text-teal-600 dark:text-teal-400" },
                              departed: { label: "Berangkat", color: "text-blue-600 dark:text-blue-400" },
                              arrived: { label: "Sampai Lokasi", color: "text-indigo-600 dark:text-indigo-400" },
                              activity_done: { label: "Kegiatan Selesai", color: "text-purple-600 dark:text-purple-400" },
                              returned: { label: "Sudah Kembali", color: "text-green-600 dark:text-green-400" },
                              issue_reported: { label: "Ada Kendala", color: "text-red-600 dark:text-red-400" },
                            };
                            const { label, color } = tripStatusLabels[m.memberTripStatus ?? ""] ?? { label: m.memberTripStatus ?? "–", color: "text-muted-foreground" };
                            return (
                              <tr key={m.id} className="border-b border-border/30 hover:bg-muted/20">
                                <td className="py-3 px-3">
                                  <p className="font-medium">{m.employeeName}</p>
                                </td>
                                <td className="py-3 px-3 hidden sm:table-cell text-muted-foreground">
                                  <p>{m.employeePosition ?? "–"}</p>
                                  {m.divisionName && <p className="text-xs">{m.divisionName}</p>}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className={`font-semibold ${color}`}>{label}</span>
                                  {m.memberTripStatus === "issue_reported" && m.issueCategory && (
                                    <p className="text-xs text-red-500 mt-0.5">{m.issueCategory}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center text-muted-foreground text-sm">
                                  {m.departedAt ? formatDateTime(m.departedAt) : "–"}
                                </td>
                                <td className="py-3 px-3 text-center text-muted-foreground text-sm hidden md:table-cell">
                                  {m.arrivedAt ? formatDateTime(m.arrivedAt) : "–"}
                                </td>
                                <td className="py-3 px-3 text-center text-muted-foreground text-sm hidden lg:table-cell">
                                  {m.activityDoneAt ? formatDateTime(m.activityDoneAt) : "–"}
                                </td>
                                <td className="py-3 px-3 text-center text-muted-foreground text-sm">
                                  {m.returnedAt ? formatDateTime(m.returnedAt) : "–"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* ── Bukti Perjalanan ── */}
                {(() => {
                  const tracking = memberTrackingMap[activeMission.id ?? ""];
                  if (!tracking || tracking.total === 0) return null;

                  // Collect evidence from multiple sources (timeline + milestone_evidences)
                  const allEvidence: MilestoneEvidence[] = collectEvidenceSources(
                    activeMissionTimeline,
                    activeMissionEvidences,
                    activeMissionMembers,
                    activeMission.id!,
                  );

                  const milestoneOrder = ["departed", "arrived", "activity_done", "returned"] as const;
                  const evidenceTypeLabel: Record<string, string> = {
                    departed: "Bukti Keberangkatan", arrived: "Bukti Tiba di Lokasi",
                    activity_done: "Bukti Kegiatan Selesai", returned: "Bukti Kepulangan",
                  };
                  const milestoneIcon: Record<string, React.ElementType> = {
                    departed: Navigation, arrived: MapPin, activity_done: CheckSquare, returned: Home,
                  };
                  const milestoneColor: Record<string, string> = {
                    departed: "text-blue-600 dark:text-blue-400", arrived: "text-indigo-600 dark:text-indigo-400",
                    activity_done: "text-purple-600 dark:text-purple-400", returned: "text-green-600 dark:text-green-400",
                  };
                  function mkTrustBadge(ev: MilestoneEvidence) {
                    if (ev.locationTrustLevel === "high") return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">GPS Valid</span>;
                    if (ev.locationTrustLevel === "medium") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">GPS Lemah</span>;
                    if (ev.locationStatus === "manual") return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">Manual</span>;
                    if (ev.locationTrustLevel === "low") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">Akurasi Rendah</span>;
                    return null;
                  }
                  function EvidenceCard({ ev }: { ev: MilestoneEvidence }) {
                    const allPhotos = (ev.photos ?? []).filter((p) => p && (p.photoUrl || p.photoPath));
                    const photos = allPhotos.slice(0, 3);
                    const hasPhotos = allPhotos.length > 0;
                    const isExpired = hasPhotos && photos[0]?.expiresAt && toDate(photos[0].expiresAt) && (toDate(photos[0].expiresAt) as Date) < new Date();
                    const hasAddress = !!ev.addressText;
                    const hasCoordinates = ev.latitude != null && ev.longitude != null;
                    const hasLocation = hasAddress || hasCoordinates || !!ev.manualLocationNote;
                    const displayMembers = (ev.targetMemberNames ?? []).filter(Boolean).join(", ") || "–";

                    // Debug: if evidence found but no photos/location, show warning
                    const missingPhotoLocation = !hasPhotos && !hasLocation;
                    if (missingPhotoLocation) {
                      console.warn("Evidence card render: found evidence but no photos/location", {
                        evidenceId: ev.id,
                        milestoneType: ev.milestoneType,
                        photosLength: ev.photos?.length,
                        addressText: ev.addressText,
                        latitude: ev.latitude,
                      });
                    }

                    // Repair status badge
                    const getRepairStatusBadge = () => {
                      if (ev.repairStatus === "requested") {
                        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Perlu Upload Ulang</Badge>;
                      } else if (ev.repairStatus === "resolved") {
                        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Sudah Diperbaiki</Badge>;
                      } else if (hasPhotos && hasLocation) {
                        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Lengkap</Badge>;
                      }
                      return null;
                    };

                    return (
                      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
                        {/* Header: Dikonfirmasi oleh + Trust badge + Repair status badge + Tanggal */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">{ev.confirmedByName}</p>
                              {mkTrustBadge(ev)}
                              {getRepairStatusBadge()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              <div>Untuk: <span className="text-foreground font-medium">{displayMembers}</span></div>
                              <div>{formatDateTime(ev.createdAt)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Photo thumbnails */}
                        {hasPhotos && (
                          isExpired ? (
                            <div className="rounded-lg bg-amber-50/80 dark:bg-amber-900/10 p-3 border border-amber-200/50 dark:border-amber-800/30">
                              <p className="text-xs text-amber-700 dark:text-amber-400 italic">Foto bukti sudah kedaluwarsa, metadata tetap tersimpan.</p>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {photos.map((photo, idx) =>
                                photo?.photoUrl ? (
                                  <a key={idx} href={photo.photoUrl} target="_blank" rel="noreferrer"
                                    className="group relative h-24 w-24 overflow-hidden rounded-lg border border-border/60 hover:border-primary/60 transition-colors flex-shrink-0 bg-muted/40">
                                    <img src={photo.photoUrl} alt={`bukti ${idx + 1}`} className="h-full w-full object-cover" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                                      <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </a>
                                ) : null
                              )}
                              {allPhotos.length > 3 && (
                                <div className="h-24 w-24 rounded-lg border border-border/60 bg-muted/40 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-semibold text-muted-foreground">+{allPhotos.length - 3}</span>
                                </div>
                              )}
                            </div>
                          )
                        )}

                        {/* Tombol Lihat Foto jika ada foto tapi tidak tampil (expired) */}
                        {hasPhotos && isExpired && (
                          <button onClick={() => { /* open photo modal */ }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors">
                            <FileText className="h-3.5 w-3.5" />
                            Lihat {allPhotos.length} Foto
                          </button>
                        )}

                        {/* Address + Location details */}
                        <div className="space-y-2">
                          {/* Alamat lengkap */}
                          {ev.addressText && (
                            <div className="text-sm text-foreground leading-snug bg-muted/50 dark:bg-muted/20 px-3 py-2 rounded-lg">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Lokasi</p>
                              <p>{ev.addressText}</p>
                            </div>
                          )}

                          {/* Catatan manual */}
                          {ev.manualLocationNote && (
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">Catatan:</span> {ev.manualLocationNote}
                            </div>
                          )}

                          {/* Koordinat + Akurasi */}
                          {ev.latitude != null && (
                            <div className="text-xs font-mono text-muted-foreground bg-muted/50 dark:bg-muted/20 px-3 py-2 rounded-lg space-y-1">
                              <div>
                                <span className="font-semibold">Koordinat:</span> {(ev.latitude as number).toFixed(6)}, {(ev.longitude as number ?? 0).toFixed(6)}
                              </div>
                              {ev.locationAccuracy != null && (
                                <div><span className="font-semibold">Akurasi:</span> ±{Math.round(ev.locationAccuracy as number)}m</div>
                              )}
                            </div>
                          )}

                          {/* Tombol Buka Maps jika ada koordinat */}
                          {ev.latitude != null && (
                            <a href={`https://www.google.com/maps?q=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-700/40 dark:bg-teal-900/20 dark:text-teal-400 dark:hover:bg-teal-900/30 transition-colors">
                              <MapPin className="h-3.5 w-3.5" />
                              Buka di Maps
                            </a>
                          )}
                        </div>

                        {/* Empty state / Request repair button */}
                        {!hasPhotos && !hasLocation && (
                          <div className="rounded-lg border border-amber-200/50 bg-amber-50/60 dark:border-amber-800/30 dark:bg-amber-900/10 p-3 space-y-2.5">
                            <div>
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">⚠️ Evidence kosong atau belum lengkap</p>
                              <p className="text-[11px] text-amber-600 dark:text-amber-400/80">
                                Foto dan lokasi belum diupload untuk milestone ini. Minta staff untuk upload ulang bukti.
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                if (ev.id && activeMission?.id) {
                                  setRepairRequestModal({
                                    isOpen: true,
                                    missionId: activeMission.id,
                                    evidenceId: ev.id,
                                    milestoneType: ev.milestoneType,
                                  });
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-400 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-colors">
                              <Upload className="h-3.5 w-3.5" />
                              Minta Upload Ulang Bukti
                            </button>
                          </div>
                        )}

                        {/* Repair status indicator for ongoing/completed repair */}
                        {ev.repairStatus === "requested" && (
                          <div className="rounded-lg border border-amber-200/50 bg-amber-50/60 dark:border-amber-800/30 dark:bg-amber-900/10 p-3 space-y-2">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                              Permintaan upload ulang bukti menunggu respon staff.
                            </p>
                            {ev.repairReason && (
                              <p className="text-xs text-amber-600 dark:text-amber-400/80">Alasan: {ev.repairReason}</p>
                            )}
                            {ev.repairRequestedAt && (
                              <p className="text-[10px] text-amber-500 dark:text-amber-400/70">Diminta pada: {formatDateTime(ev.repairRequestedAt)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <section id="bukti-perjalanan" className="space-y-4 scroll-mt-4">
                      <h3 className="text-lg font-semibold">Bukti Perjalanan</h3>
                      <div className="space-y-5">
                        {milestoneOrder.map((key) => {
                          const Icon = milestoneIcon[key];
                          const items = allEvidence.filter((e) => e.milestoneType === key);
                          return (
                            <div key={key} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Icon className={`h-5 w-5 ${milestoneColor[key]}`} />
                                <p className="text-base font-semibold">{evidenceTypeLabel[key]}</p>
                              </div>
                              {items.length === 0 ? (
                                <p className="text-sm text-muted-foreground pl-7">Belum ada bukti untuk milestone ini.</p>
                              ) : items.map((ev) => <EvidenceCard key={ev.id} ev={ev} />)}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })()}

                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SectionHeader
                      icon={Calendar}
                      title="Timeline Aktivitas"
                      description="Rekam jejak perjalanan, approval, perubahan, dan kendala."
                    />
                    <div className="flex flex-wrap gap-1 rounded-lg border border-border overflow-hidden text-xs">
                      {(["all", "tracking", "approval", "changes", "issues"] as const).map((tab) => {
                        const labels: Record<string, string> = {
                          all: "Semua",
                          tracking: "Perjalanan",
                          approval: "Approval",
                          changes: "Perubahan",
                          issues: "Kendala",
                        };
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setDetailTimelineTab(tab)}
                            className={`px-3 py-1.5 transition-colors ${
                              detailTimelineTab === tab
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "text-muted-foreground hover:bg-muted/60"
                            }`}
                          >
                            {labels[tab]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {detailLoading ? (
                    <p className="text-sm text-muted-foreground">Memuat timeline...</p>
                  ) : (() => {
                    // Merge timeline + staff changes into one sorted list
                    const staffChangeEntries = activeMissionStaffChanges.map((c) => ({
                      id: `sc_${c.id}`,
                      message: [
                        c.action ? `Perubahan anggota: ${c.action}` : null,
                        c.reason ? c.reason : null,
                      ].filter(Boolean).join(" — "),
                      category: "changes" as TimelineCategory,
                      byName: c.requestedByName ?? null,
                      createdAt: c.requestedAt,
                    }));

                    const allEntries = [
                      ...activeMissionTimeline.map((e) => ({
                        id: e.id,
                        message: e.message ?? "",
                        category: inferTimelineCategory(e),
                        byName: e.byName ?? null,
                        byUid: e.byUid ?? null,
                        createdAt: e.createdAt,
                        // Evidence metadata embedded in timeline
                        trustLevel: e.trustLevel ?? null,
                        evidenceId: e.evidenceId ?? null,
                        milestoneType: e.milestoneType ?? null,
                        confirmedByName: e.confirmedByName ?? null,
                        confirmedByUid: e.confirmedByUid ?? null,
                        targetMemberNames: e.targetMemberNames ?? null,
                        targetMemberUids: e.targetMemberUids ?? null,
                        evidenceLat: e.evidenceLat ?? null,
                        evidenceLng: e.evidenceLng ?? null,
                        evidenceAccuracy: e.evidenceAccuracy ?? null,
                        evidenceAddress: e.evidenceAddress ?? null,
                        evidenceLocationStatus: e.evidenceLocationStatus ?? null,
                        evidenceLocationTrust: e.evidenceLocationTrust ?? null,
                        evidenceManualNote: e.evidenceManualNote ?? null,
                        evidencePhotos: e.evidencePhotos ?? null,
                      })),
                      ...staffChangeEntries,
                    ].sort((a, b) => {
                      const aTs = (a.createdAt as any)?.seconds ?? 0;
                      const bTs = (b.createdAt as any)?.seconds ?? 0;
                      return bTs - aTs;
                    });

                    const filtered = allEntries.filter((e) => {
                      if (detailTimelineTab === "all") return true;
                      return e.category === detailTimelineTab;
                    });

                    if (allEntries.length === 0) {
                      return <p className="text-sm text-muted-foreground">Belum ada aktivitas timeline.</p>;
                    }
                    if (filtered.length === 0) {
                      return <p className="text-sm text-muted-foreground">Tidak ada entri untuk kategori ini.</p>;
                    }

                    const borderColors: Record<string, string> = {
                      tracking: "border-l-blue-500", approval: "border-l-green-500",
                      changes: "border-l-purple-500", issues: "border-l-amber-500", system: "border-l-border",
                    };
                    const catColors: Record<string, string> = {
                      tracking: "text-blue-500", approval: "text-green-600",
                      changes: "text-purple-500", issues: "text-amber-600", system: "text-muted-foreground",
                    };
                    const catLabels: Record<string, string> = {
                      tracking: "Perjalanan", approval: "Approval",
                      changes: "Perubahan", issues: "Kendala", system: "Sistem",
                    };

                    function summariseTracking(msg: string): { title: string; sub: string } {
                      const lower = msg.toLowerCase();
                      let title = msg;
                      if (lower.includes("keberangkatan") || lower.includes("berangkat")) title = "Konfirmasi Keberangkatan";
                      else if (lower.includes("tiba di lokasi") || lower.includes("sampai lokasi")) title = "Konfirmasi Tiba di Lokasi";
                      else if (lower.includes("kegiatan selesai")) title = "Konfirmasi Kegiatan Selesai";
                      else if (lower.includes("kembali")) title = "Konfirmasi Kembali";
                      const forMatch = msg.match(/untuk:\s*([^.]+?)\s+pada\s/i);
                      const names = forMatch ? forMatch[1].trim() : "";
                      const dateMatch = msg.match(/pada\s+(.+?)\s+pukul\s+(.+?)\./i);
                      const when = dateMatch ? `${dateMatch[1]}, ${dateMatch[2]}` : "";
                      return { title, sub: [names, when].filter(Boolean).join(" · ") };
                    }

                    return (
                      <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {filtered.map((entry) => {
                          const isTracking = entry.category === "tracking";
                          if (isTracking) {
                            // Strip any evidence indicator text for clean timeline display
                            const cleanMsg = (entry.message ?? "").replace(/\s*\[\d+\s*bukti\s*foto\]/gi, "").trim();
                            const { title, sub } = summariseTracking(cleanMsg);
                            return (
                              <div key={entry.id} className={`rounded-lg border-l-4 border border-border/50 bg-card px-3 py-3 ${borderColors.tracking}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
                                    {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
                                  </div>
                                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatDateTime(entry.createdAt)}</span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={entry.id} className={`rounded-lg border-l-4 border border-border/50 bg-card px-3 py-2.5 ${borderColors[entry.category] ?? "border-l-border"}`}>
                              <p className="text-sm leading-relaxed">{entry.message}</p>
                              <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm text-muted-foreground">
                                  {entry.byName ? `${entry.byName} · ` : ""}
                                  {formatDateTime(entry.createdAt)}
                                </span>
                                {detailTimelineTab === "all" && (
                                  <span className={`text-xs font-semibold uppercase tracking-wide ${catColors[entry.category] ?? "text-muted-foreground"}`}>
                                    {catLabels[entry.category] ?? "Sistem"}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>

                {/* Final Report Section — always shown after mission starts */}
                {(activeMission.status === "returned_pending_report" || activeMission.status === "final_report_submitted" || activeMission.status === "completed" || activeMissionFinalReport || Object.keys(activeMissionMemberReports).length > 0) && (() => {
                  const rpt = activeMissionFinalReport;
                  const reviewStatus = rpt?.reportReviewStatus;
                  const canReview = !!rpt?.submittedAt && reviewStatus !== "approved" && (userProfile?.role === "super-admin" || userProfile?.role === "manager" || userProfile?.structuralLevel === "management");

                  const reviewBadge = () => {
                    if (!rpt?.submittedAt) return null;
                    if (reviewStatus === "approved") return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">Laporan Disetujui</span>;
                    if (reviewStatus === "revision_requested") return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Perlu Revisi</span>;
                    if (reviewStatus === "resubmitted") return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Dikirim Ulang</span>;
                    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Menunggu Review</span>;
                  };

                  return (
                    <section className="space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <SectionHeader
                          icon={FileText}
                          title="Laporan Akhir Dinas"
                          description="Laporan akhir yang dikirimkan oleh tim."
                        />
                        {rpt?.submittedAt && reviewBadge()}
                      </div>

                      {!rpt && Object.keys(activeMissionMemberReports).length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-muted/10 py-8 px-4 text-center space-y-1.5">
                          <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm font-medium text-muted-foreground">Belum ada laporan akhir</p>
                          <p className="text-xs text-muted-foreground/70">Laporan akan tampil setelah peserta mengirim laporan.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Mode & meta */}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {activeMission.reportMode && (
                              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                {activeMission.reportMode === "individual_report" ? "Laporan Individu" : "Laporan Tim"}
                              </span>
                            )}
                            {rpt?.dilaporkanOlehName && <span>Dilaporkan oleh: <strong className="text-foreground">{rpt.dilaporkanOlehName}</strong></span>}
                            {rpt?.submittedAt && <span>Dikirim: {formatDateTime(rpt.submittedAt)}</span>}
                            {rpt?.reviewedByName && reviewStatus !== "pending_review" && (
                              <span>Direview oleh: <strong className="text-foreground">{rpt.reviewedByName}</strong> · {formatDateTime(rpt.reviewedAt)}</span>
                            )}
                          </div>

                          {/* Revision note banner */}
                          {reviewStatus === "revision_requested" && rpt?.revisionNote && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-3 dark:border-amber-700/30 dark:bg-amber-900/10">
                              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Catatan Revisi</p>
                              <p className="text-sm text-amber-800 dark:text-amber-300">{rpt.revisionNote}</p>
                            </div>
                          )}

                          {/* Team report body */}
                          {rpt && (
                            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                              {rpt.ringkasanKegiatan && (
                                <div><p className="text-xs font-medium text-muted-foreground">Ringkasan Kegiatan</p><p className="text-sm whitespace-pre-wrap">{rpt.ringkasanKegiatan}</p></div>
                              )}
                              {rpt.hasilOutput && (
                                <div><p className="text-xs font-medium text-muted-foreground">Hasil / Output</p><p className="text-sm whitespace-pre-wrap">{rpt.hasilOutput}</p></div>
                              )}
                              {rpt.kendalaDanSolusi && (
                                <div><p className="text-xs font-medium text-muted-foreground">Kendala &amp; Solusi</p><p className="text-sm whitespace-pre-wrap">{rpt.kendalaDanSolusi}</p></div>
                              )}
                              {rpt.tindakLanjut && (
                                <div><p className="text-xs font-medium text-muted-foreground">Tindak Lanjut</p><p className="text-sm whitespace-pre-wrap">{rpt.tindakLanjut}</p></div>
                              )}
                              {rpt.catatanUntukHRD && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">Catatan untuk HRD</p>
                                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 whitespace-pre-wrap">{rpt.catatanUntukHRD}</p>
                                </div>
                              )}
                              {rpt.lampiranUrl && (
                                <a href={rpt.lampiranUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                                  <FileText className="h-3.5 w-3.5" /> Lihat Lampiran
                                </a>
                              )}
                            </div>
                          )}

                          {/* Per-member individual reports */}
                          {Object.keys(activeMissionMemberReports).length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Laporan Individu Anggota</p>
                                <span className="text-xs text-muted-foreground">
                                  {Object.values(activeMissionMemberReports).filter((r) => !!r.submittedAt).length}/{Object.keys(activeMissionMemberReports).length} terkumpul
                                </span>
                              </div>
                              {Object.values(activeMissionMemberReports).map((r) => {
                                const rrs = r.reportReviewStatus;
                                return (
                                  <div key={r.memberUid} className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <p className="text-sm font-semibold">{r.memberName}</p>
                                      <div className="flex items-center gap-1.5">
                                        {rrs === "approved" && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">Disetujui</span>}
                                        {rrs === "revision_requested" && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Perlu Revisi</span>}
                                        {rrs === "resubmitted" && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Dikirim Ulang</span>}
                                        {!rrs && r.submittedAt && <span className="text-[10px] font-semibold text-muted-foreground">Terkirim</span>}
                                        {r.submittedAt && <span className="text-[10px] text-muted-foreground">{formatDateTime(r.submittedAt)}</span>}
                                      </div>
                                    </div>
                                    {r.kegiatanDilakukan && <div><p className="text-xs font-medium text-muted-foreground">Kegiatan</p><p className="text-xs">{r.kegiatanDilakukan}</p></div>}
                                    {r.hasilPribadi && <div><p className="text-xs font-medium text-muted-foreground">Hasil</p><p className="text-xs">{r.hasilPribadi}</p></div>}
                                    {r.kendalaPribadi && <div><p className="text-xs font-medium text-muted-foreground">Kendala</p><p className="text-xs">{r.kendalaPribadi}</p></div>}
                                    {r.solusiPribadi && <div><p className="text-xs font-medium text-muted-foreground">Solusi</p><p className="text-xs">{r.solusiPribadi}</p></div>}
                                    {r.catatanTambahan && <div><p className="text-xs font-medium text-muted-foreground">Catatan</p><p className="text-xs">{r.catatanTambahan}</p></div>}
                                    {r.lampiranUrl && (
                                      <a href={r.lampiranUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">Lihat Lampiran</a>
                                    )}
                                    {r.revisionNote && (
                                      <div className="mt-1 rounded border border-amber-200 bg-amber-50/50 px-2 py-1 dark:border-amber-700/30 dark:bg-amber-900/10">
                                        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Catatan revisi: {r.revisionNote}</p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Management review actions */}
                          {canReview && rpt && (
                            <div className="border-t border-border pt-4 space-y-3">
                              <p className="text-sm font-semibold">Review Laporan</p>
                              {!showRevisionForm ? (
                                <div className="flex gap-2 flex-wrap">
                                  <Button
                                    className="bg-green-600 text-white hover:bg-green-700"
                                    onClick={handleApproveReport}
                                    disabled={isReviewingReport}
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui Laporan
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
                                    onClick={() => setShowRevisionForm(true)}
                                    disabled={isReviewingReport}
                                  >
                                    Minta Revisi
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Label htmlFor="revision-note">Catatan Revisi <span className="text-destructive">*</span></Label>
                                  <Textarea
                                    id="revision-note"
                                    rows={3}
                                    placeholder="Tuliskan bagian yang perlu diperbaiki atau dilengkapi…"
                                    value={revisionNote}
                                    onChange={(e) => setRevisionNote(e.target.value)}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      className="bg-amber-600 text-white hover:bg-amber-700"
                                      onClick={handleRequestRevision}
                                      disabled={isReviewingReport || !revisionNote.trim()}
                                    >
                                      Kirim Permintaan Revisi
                                    </Button>
                                    <Button variant="ghost" onClick={() => { setShowRevisionForm(false); setRevisionNote(""); }}>Batal</Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })()}
              </>
            );
          })()}
        </CardContent>
      </Card>
    );
  };

  const renderMissionEditView = () => {
    if (!activeMission) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <div>
            <CardTitle>Edit Perjalanan Dinas</CardTitle>
            <CardDescription>
              Ubah informasi perjalanan dinas dan simpan perubahan.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancelEdit}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-8">
          <section className="space-y-4">
            <SectionHeader
              icon={FileText}
              title="Informasi Perjalanan Dinas"
              description="Ubah data perjalanan dinas sesuai kebutuhan."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama Perjalanan Dinas</Label>
                <Input
                  value={missionForm.missionName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      missionName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nomor Surat Tugas/SPD</Label>
                <Input
                  value={missionForm.assignmentNumber}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      assignmentNumber: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Brand / Proyek</Label>
                <Input
                  value={missionForm.projectName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      projectName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nama Klien</Label>
                <Input
                  value={missionForm.clientName}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      clientName: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={MapPin}
              title="Tujuan & Jadwal"
              description="Perbarui lokasi dan tanggal perjalanan."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provinsi Tujuan</Label>
                <Input
                  value={missionForm.destinationProvince}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationProvince: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Kota / Kabupaten</Label>
                <Input
                  value={missionForm.destinationRegency}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationRegency: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Alamat Lengkap Tujuan</Label>
                <Textarea
                  value={missionForm.destinationAddress}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      destinationAddress: e.target.value,
                    })
                  }
                  className="min-h-[80px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Berangkat</Label>
                <Input
                  type="date"
                  value={missionForm.startDate}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      startDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Pulang</Label>
                <Input
                  type="date"
                  value={missionForm.endDate}
                  onChange={(e) =>
                    setMissionForm({ ...missionForm, endDate: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Conflict warning when dates are set */}
            {(() => {
              if (!missionForm.startDate || !missionForm.endDate) return null;
              const newStart = new Date(missionForm.startDate).getTime() / 1000;
              const newEnd = new Date(missionForm.endDate).setHours(23,59,59,999) / 1000;
              const conflicts: string[] = [];
              activeMissionMembers.forEach((member) => {
                const ms = member.memberStatus as string;
                if (["archived", "cancelled", "rejected_by_manager", "declined_by_staff"].includes(ms)) return;
                const busyEntries = staffBusyMap[member.employeeUid] ?? [];
                for (const entry of busyEntries) {
                  if (entry.missionId === activeMission?.id) continue;
                  if (datesOverlap(newStart, newEnd, entry.startDate, entry.endDate)) {
                    conflicts.push(`${member.employeeName} – sedang dinas di "${entry.missionName}"`);
                    break;
                  }
                }
              });
              if (conflicts.length === 0) return null;
              return (
                <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/50 dark:border-amber-700/40 dark:bg-amber-900/10 px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    {conflicts.length} anggota bentrok jadwal
                  </div>
                  <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-0.5 pl-6 list-disc">
                    {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                  <p className="text-xs text-amber-600 dark:text-amber-500 pl-1">Pertimbangkan mengganti anggota yang bentrok sebelum menyimpan.</p>
                </div>
              );
            })()}
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={FileText}
              title="Instruksi"
              description="Perbarui instruksi perjalanan dinas."
            />
            <RichTextEditor
              value={missionForm.instructionNote}
              onChange={(html) =>
                setMissionForm({ ...missionForm, instructionNote: html })
              }
            />
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={FileText}
              title="Surat Tugas/SPD"
              description="Lihat dokumen aktif dan ganti file atau link jika diperlukan."
            />
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-lg border border-border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  Dokumen Surat Tugas/SPD aktif
                </p>
                {activeMission.assignmentLetterDriveUrl ||
                activeMission.assignmentLetterUrl ||
                activeMission.googleDriveLink ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {activeMission.assignmentLetterFileName ||
                        activeMission.assignmentLetterDriveUrl ||
                        activeMission.googleDriveLink ||
                        "Surat Tugas aktif"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sumber dokumen:{" "}
                      {activeMission.assignmentLetterSource === "local_upload"
                        ? "Upload File"
                        : activeMission.assignmentLetterSource ===
                            "system_drive_upload"
                          ? "Upload File via Drive HRP"
                          : activeMission.assignmentLetterSource ===
                              "google_drive_link"
                            ? "Google Drive Link Manual"
                            : activeMission.documentSource ===
                                "firebase_storage"
                              ? "Upload File"
                              : "Upload File via Drive HRP"}
                    </p>
                    {activeMission.assignmentLetterSource ===
                    "google_drive_link" ? (
                      <p className="text-xs text-amber-700">
                        Pastikan link Google Drive sudah bisa diakses oleh akun
                        HRP lain.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenDocumentViewer}
                      >
                        Lihat Dokumen
                      </Button>
                      {activeMission.assignmentLetterSource ===
                        "google_drive_link" &&
                        activeMission.googleDriveLink && (
                          <a
                            href={activeMission.googleDriveLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button size="sm" variant="secondary">
                              Buka Link
                            </Button>
                          </a>
                        )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Surat Tugas belum dilampirkan.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ganti File Surat Tugas / SPD</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    Pilih File Baru
                  </Button>
                  <div className="min-w-0 text-sm">
                    {editAssignmentLetterFile ? (
                      <div>
                        <p className="font-medium text-foreground truncate">
                          {editAssignmentLetterFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(
                            editAssignmentLetterFile.size /
                            1024 /
                            1024
                          ).toFixed(2)}{" "}
                          MB
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        Pilih file PDF/DOC/DOCX untuk mengganti dokumen SPD.
                      </p>
                    )}
                  </div>
                  {editAssignmentLetterFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => {
                        setEditAssignmentLetterFile(null);
                        setEditAssignmentLetterError(null);
                        if (editFileInputRef.current)
                          editFileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) {
                      setEditAssignmentLetterFile(null);
                      return;
                    }
                    const validation = validateAssignmentLetterFile(file);
                    if (!validation.isValid) {
                      setEditAssignmentLetterFile(null);
                      setEditAssignmentLetterError(validation.message || null);
                      return;
                    }
                    setEditAssignmentLetterError(null);
                    setEditAssignmentLetterFile(file);
                  }}
                />
                {editAssignmentLetterError && (
                  <p className="text-sm text-destructive">
                    {editAssignmentLetterError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Update Link Google Drive</Label>
                <Input
                  value={missionForm.googleDriveLink}
                  onChange={(e) =>
                    setMissionForm({
                      ...missionForm,
                      googleDriveLink: e.target.value,
                    })
                  }
                  placeholder="https://drive.google.com/..."
                />
                <p className="text-xs text-muted-foreground">
                  Jika tidak mengganti file, Anda dapat menyimpan link baru.
                </p>
              </div>
            </div>
          </section>

          <div className="pt-2 border-t border-border">
            <Button
              onClick={handleUpdateMission}
              disabled={
                isSaving || !missionForm.missionName || !missionForm.clientName
              }
              className="w-full"
              size="lg"
            >
              {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderMissionManageView = () => {
    if (!activeMission) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kelola Anggota Dinas</CardTitle>
            <CardDescription>
              Tambah, arsipkan, atau tinjau riwayat perubahan anggota untuk
              perjalanan dinas ini.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleCloseDetails}>
            Kembali
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Anggota Saat Ini"
              description="Daftar anggota yang sudah terdaftar pada perjalanan dinas ini."
            />
            {activeMissionMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada anggota perjalanan dinas.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Posisi</TableHead>
                      <TableHead>Atasan/Approver</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeMissionMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>{member.employeeName}</TableCell>
                        <TableCell>{member.employeePosition || "-"}</TableCell>
                        <TableCell>
                          {member.approvalTargetName || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className="capitalize">
                            {member.memberStatus?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchiveStaffMember(member)}
                          >
                            Arsipkan
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Tambah Anggota Dinas"
              description="Pilih anggota baru yang belum terdaftar di perjalanan dinas ini."
            />
            <div className="grid grid-cols-1 gap-4">
              <StaffPicker
                allStaff={availableStaffForAddition}
                selectedUids={manageSelectedStaffUids}
                onToggle={(uid, meta) => {
                  setManageSelectedStaffUids((prev) => {
                    const isRemoving = prev.includes(uid);
                    if (isRemoving) {
                      setManageContinuationSelections(c => { const n = { ...c }; delete n[uid]; return n; });
                    } else if (meta?.continuation) {
                      setManageContinuationSelections(c => ({ ...c, [uid]: meta.continuation! }));
                    }
                    return isRemoving ? prev.filter((id) => id !== uid) : [...prev, uid];
                  });
                }}
                isLoading={staffLoading}
                error={profilesError}
                missionStartDate={toDateString(activeMission?.startDate)}
                missionEndDate={toDateString(activeMission?.endDate)}
                busyMap={enrichedStaffBusyMap}
                excludeMissionId={activeMission?.id}
                continuationSelections={manageContinuationSelections}
              />
              <div className="space-y-2">
                <Label>Alasan Penambahan / Perubahan</Label>
                <Textarea
                  value={manageStaffReason}
                  onChange={(e) => setManageStaffReason(e.target.value)}
                  className="min-h-[100px]"
                  placeholder="Tuliskan alasan wajib untuk perubahan anggota."
                />
              </div>
              <Button
                onClick={handleAddStaffToMission}
                disabled={
                  isSaving ||
                  manageSelectedStaffUids.length === 0 ||
                  !manageStaffReason.trim()
                }
              >
                {isSaving ? "Menyimpan..." : "Tambah Anggota Dinas"}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={Users}
              title="Riwayat Perubahan Staff"
              description="Catatan penambahan dan pengarsipan staf pada perjalanan dinas."
            />
            {activeMissionStaffChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada riwayat perubahan.
              </p>
            ) : (
              <div className="space-y-3">
                {activeMissionStaffChanges.map((change) => (
                  <div
                    key={change.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="font-medium capitalize">{change.action}</p>
                    <p className="text-sm text-muted-foreground">
                      {change.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(
                        (change.requestedAt as any)?.toDate?.() ??
                          change.requestedAt,
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    );
  };

  const calculateDurationDays = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const ms = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  const handleCreateMission = async () => {
    if (!firestore || !userProfile?.uid) return;

    if (!assignmentLetterFile && !missionForm.googleDriveLink) {
      return toast({
        variant: "destructive",
        title: "Upload Surat Tugas/SPD atau link Google Drive wajib.",
      });
    }
    if (
      !missionForm.missionName ||
      !missionForm.clientName ||
      !missionForm.destinationProvince ||
      !missionForm.destinationRegency ||
      !missionForm.destinationAddress ||
      !missionForm.startDate ||
      !missionForm.endDate ||
      !stripHtml(missionForm.instructionNote)
    ) {
      return toast({
        variant: "destructive",
        title: "Lengkapi semua informasi perjalanan dinas.",
      });
    }
    if (missionForm.tripType === "Lainnya" && !missionForm.tripTypeOther) {
      return toast({
        variant: "destructive",
        title: "Sebutkan jenis dinas lainnya jika dipilih Lainnya.",
      });
    }
    if (selectedStaffUids.length === 0) {
      return toast({
        variant: "destructive",
        title: "Pilih minimal satu staff.",
      });
    }

    setIsSaving(true);
    try {
      const selectedStaff = allMergedStaff.filter((staff) =>
        selectedStaffUids.includes(staff.uid),
      );

      // Upload assignment letter if provided
      let assignmentLetterUrl: string | null =
        missionForm.googleDriveLink || null;
      let assignmentLetterDriveUrl = "";
      let assignmentLetterDriveFileId = "";
      let assignmentLetterFileName = "";
      let documentSource:
        | "firebase_storage"
        | "google_drive_link"
        | "google_drive"
        | null = "google_drive_link";
      let assignmentLetterSource:
        | "local_upload"
        | "system_drive_upload"
        | "google_drive"
        | "google_drive_link"
        | "firebase_storage" = "google_drive_link";
      let assignmentLetterAccessMode:
        | "anyone_with_link"
        | "internal_viewer"
        | null = null;
      let assignmentLetterUploadedAt: any = null;
      let assignmentLetterUploadedBy: string = "";

      if (assignmentLetterFile) {
        try {
          const uploadResult = await uploadFileToGoogleDrive(
            assignmentLetterFile,
            userProfile.uid,
            {
              category: "business_trip_spd",
              ownerUid: userProfile.uid,
            },
          );
          assignmentLetterUrl =
            uploadResult.googleDriveWebViewLink ||
            uploadResult.webViewLink ||
            uploadResult.directViewUrl ||
            uploadResult.viewUrl ||
            "";
          assignmentLetterDriveUrl =
            uploadResult.googleDriveWebViewLink ||
            uploadResult.webViewLink ||
            uploadResult.directViewUrl ||
            uploadResult.viewUrl ||
            "";
          assignmentLetterDriveFileId = uploadResult.fileId || "";
          assignmentLetterFileName =
            uploadResult.fileName || assignmentLetterFile.name;
          documentSource = "google_drive";
          assignmentLetterSource = "system_drive_upload";
          assignmentLetterAccessMode =
            uploadResult.accessMode || "anyone_with_link";
          assignmentLetterUploadedAt = serverTimestamp();
          assignmentLetterUploadedBy = userProfile.uid;
        } catch (uploadError: any) {
          console.warn("Upload file gagal:", uploadError);
          // Do not fail the whole create flow; record upload failure and proceed.
          const errMsg =
            uploadError?.message || String(uploadError || "Upload error");
          assignmentLetterUrl = null;
          assignmentLetterDriveUrl = "";
          assignmentLetterDriveFileId = "";
          assignmentLetterFileName = assignmentLetterFile?.name || "";
          documentSource = null;
          assignmentLetterSource = "local_upload";
          assignmentLetterAccessMode = null;
          assignmentLetterUploadedAt = null;
          assignmentLetterUploadedBy = "";
          // Custom fields to record failure
          // documentStatus and documentError will be saved on mission doc
          // Notify user with a warning
          toast({
            title: "Perjalanan Dinas dibuat (dokumen gagal diupload)",
            description:
              "Perjalanan dinas berhasil dibuat, tetapi dokumen SPD gagal diupload. Silakan upload ulang di menu edit.",
          });
          // Also log locally
          console.warn("SPD upload failed, continuing mission create:", errMsg);
          // store error to attach later
          (assignmentLetterFile as any)._uploadError = errMsg;
        }
      } else if (missionForm.googleDriveLink) {
        assignmentLetterUrl = missionForm.googleDriveLink;
        assignmentLetterDriveUrl = missionForm.googleDriveLink;
        documentSource = "google_drive_link";
        assignmentLetterSource = "google_drive_link";
      }

      const missionCollection = collection(firestore, "business_trip_missions");
      const missionRef = doc(missionCollection);
      const durationDays = calculateDurationDays(
        missionForm.startDate,
        missionForm.endDate,
      );
      const assignmentNumber =
        missionForm.assignmentNumber || `SPD-${Date.now()}`;
      const instructionText = stripHtml(missionForm.instructionNote);
      const assignedManagerUids = Array.from(
        new Set(
          selectedStaff
            .map(
              (staff) =>
                staff.managerUid || (staff.isDivisionManager ? staff.uid : ""),
            )
            .filter(Boolean),
        ),
      );

      const managerValidationSummaries = buildManagerValidationSummaries(
        selectedStaff.map((staff) => ({
          missionId: missionRef.id,
          missionName: missionForm.missionName,
          assignmentNumber,
          employeeUid: staff.uid,
          employeeName: staff.fullName,
          brandId: staff.brandId || "",
          brandName: staff.brandName || "-",
          divisionId: staff.divisionId || "",
          divisionName: staff.divisionName || "-",
          managerUid:
            staff.managerUid || (staff.isDivisionManager ? staff.uid : ""),
          managerName: staff.managerName || staff.fullName,
          managerValidationStatus: "waiting_manager_validation",
          managerValidationNote: null,
          staffConfirmationStatus: "waiting_staff_confirmation",
        })) as BusinessTripMissionMember[],
      );

      const initialStatus = managerValidationSummaries.every(
        (item) => item.status === "approved",
      )
        ? "waiting_staff_confirmation"
        : "pending_manager_validation";

      await setDoc(missionRef, {
        missionName: missionForm.missionName,
        assignmentNumber,
        missionCode: assignmentNumber,
        assignmentLetterUrl,
        assignmentLetterDriveUrl,
        assignmentLetterDriveFileId,
        assignmentLetterFileName,
        documentSource,
        // Document upload status: 'ok' | 'upload_failed'
        documentStatus:
          assignmentLetterFile && (assignmentLetterFile as any)?._uploadError
            ? "upload_failed"
            : "ok",
        documentError: (assignmentLetterFile as any)?._uploadError || null,
        assignmentLetterSource,
        assignmentLetterAccessMode,
        assignmentLetterUploadedAt,
        assignmentLetterUploadedBy,
        googleDriveLink: missionForm.googleDriveLink || "",
        assignedByUid: userProfile.uid,
        assignedByName: userProfile.fullName,
        assignedByPosition: userProfile.positionTitle || userProfile.role,
        projectName: missionForm.projectName,
        clientName: missionForm.clientName,
        tripType: missionForm.tripType,
        tripTypeOther:
          missionForm.tripType === "Lainnya" ? missionForm.tripTypeOther : "",
        destinationProvince: missionForm.destinationProvince,
        destinationRegency: missionForm.destinationRegency,
        destinationAddress: missionForm.destinationAddress,
        destinationGoogleMaps: missionForm.destinationGoogleMaps,
        startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
        endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
        durationDays,
        instructionNote: missionForm.instructionNote, // HTML (legacy compat)
        instructionHtml: missionForm.instructionNote, // HTML (canonical)
        instructionText, // Plain text
        memberCount: selectedStaff.length,
        managerApprovedCount: managerValidationSummaries.filter(
          (item) => item.status === "approved",
        ).length,
        managerValidationCount: managerValidationSummaries.length,
        managerUids: assignedManagerUids,
        staffConfirmedCount: 0,
        status: initialStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const memberDocs: BusinessTripMissionMember[] = [];
      await Promise.all(
        selectedStaff.map(async (staff) => {
          const membersCollection = collection(
            firestore,
            "business_trip_missions",
            missionRef.id,
            "members",
          );
          const memberRef = doc(membersCollection, staff.uid);
          const memberManagerUid =
            staff.managerUid || (staff.isDivisionManager ? staff.uid : "");
          const approvalTarget = await determineApprovalTarget(
            firestore,
            { ...(staff as any), employeeUid: staff.uid },
            userProfile.uid,
            userProfile.fullName,
          );

          const approvalNeeded = !!approvalTarget.approverUid;

          const contData = staffContinuationSelections[staff.uid];

          const memberData: BusinessTripMissionMember = {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeePosition: staff.jobTitle || "-",
            employeeType: (staff as any).employeeType || "",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || "-",
            managerUid: approvalTarget.approverUid || undefined,
            managerName: approvalTarget.approverName || undefined,
            approvalTargetUid: approvalTarget.approverUid || undefined,
            approvalTargetName: approvalTarget.approverName || undefined,
            approvalLevel: approvalTarget.level,
            isDivisionManager: approvalTarget.level === "director",
            requiresApproval: approvalNeeded,
            approvalStatus: "pending",
            startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
            endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
            durationDays,
            memberStatus: approvalNeeded
              ? "waiting_manager_validation"
              : "waiting_staff_confirmation",
            managerValidationStatus: "waiting_manager_validation",
            managerValidationNote: null,
            staffConfirmationStatus: "waiting_staff_confirmation",
            missionStatus: "pending_manager_validation",
            // Continuation fields (only when selected as continuation)
            ...(contData ? {
              isContinuationAssignment: true,
              continuedFromMissionId: contData.missionId,
              continuedFromMissionName: contData.missionName,
              continuedFromDestination: contData.destination,
              continuedFromEndDate: contData.endDate,
              transitionType: "direct_transfer" as const,
              transitionNote: contData.transitionNote || undefined,
            } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          memberDocs.push(memberData);
          await setDoc(memberRef, memberData);

          // Write timeline to OLD mission when this is a continuation
          if (contData) {
            try {
              await addDoc(
                collection(firestore, "business_trip_missions", contData.missionId, "timeline"),
                {
                  message: `${staff.fullName} dijadwalkan lanjut ke misi "${missionForm.missionName}".`,
                  category: "changes",
                  createdAt: serverTimestamp(),
                  byUid: userProfile.uid,
                  byName: userProfile.fullName,
                },
              );
            } catch (e) {
              console.warn("Continuation old-mission timeline write failed", e);
            }
          }

          // Notify staff about assignment
          try {
            const staffNotifRef = doc(
              collection(firestore, "users", staff.uid, "notifications"),
            );
            await setDoc(staffNotifRef, {
              type: "business_trip_assigned",
              missionId: missionRef.id,
              missionName: missionForm.missionName,
              createdAt: serverTimestamp(),
              read: false,
              byUid: userProfile.uid,
              byName: userProfile.fullName,
            });
          } catch (e) {
            console.warn("Notify staff failed", e);
          }
        }),
      );

      // Validate that all members who require approval have an approver assigned
      const missingApprovers = memberDocs.filter(
        (m) => m.requiresApproval && !m.approvalTargetUid,
      );
      if (missingApprovers.length > 0) {
        const names = missingApprovers
          .slice(0, 5)
          .map((m) => m.employeeName)
          .join(", ");
        toast({
          variant: "destructive",
          title: "Gagal membuat misi",
          description:
            "Beberapa peserta belum memiliki approver yang valid: " +
            names +
            ". Periksa Struktur Organisasi.",
        });
        throw new Error(
          "Missing approvers for some members. Aborting mission create.",
        );
      }

      const approvalGroups = new Map<
        string,
        {
          approverName: string;
          approvalLevel: "division_manager" | "director";
          memberUids: string[];
          memberNames: string[];
        }
      >();

      for (const member of memberDocs) {
        if (
          !member.approvalTargetUid ||
          member.approvalTargetUid === userProfile.uid
        )
          continue;

        const key = member.approvalTargetUid;
        const existing = approvalGroups.get(key);
        if (existing) {
          existing.memberUids.push(member.employeeUid);
          existing.memberNames.push(member.employeeName);
        } else {
          approvalGroups.set(key, {
            approverName: member.approvalTargetName || member.managerName || "",
            approvalLevel: member.approvalLevel || "division_manager",
            memberUids: [member.employeeUid],
            memberNames: [member.employeeName],
          });
        }
      }

      // Create approval_requests documents keyed by approver UID
      await Promise.all(
        Array.from(approvalGroups.entries()).map(([approverUid, group]) => {
          const approvalCollection = collection(
            firestore,
            "business_trip_missions",
            missionRef.id,
            "approval_requests",
          );
          const approvalRef = doc(approvalCollection, approverUid);
          const byUid = userProfile?.uid ?? null;
          const byName = userProfile?.fullName ?? null;
          return setDoc(approvalRef, {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            approverUid,
            approverName: group.approverName,
            approverRole:
              group.approvalLevel === "division_manager"
                ? "manager_division"
                : "director",
            approvalLevel: group.approvalLevel,
            memberUids: group.memberUids,
            memberNames: group.memberNames,
            status: "pending",
            notes: "",
            decidedAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).then(() => {
            // Also create notification for approver
            const notifRef = doc(
              collection(firestore, "users", approverUid, "notifications"),
            );
            return setDoc(notifRef, {
              type: "business_trip_approval_request",
              missionId: missionRef.id,
              missionName: missionForm.missionName,
              approverUid,
              createdAt: serverTimestamp(),
              read: false,
              byUid,
              byName,
            }).catch((e) => {
              console.warn("Notify approver failed", e);
            });
          });
        }),
      );

      // Update mission doc with member and approval info
      const allMemberUids = memberDocs.map((m) => m.employeeUid);
      const approvalTargetUids = Array.from(approvalGroups.keys());
      const pendingApprovalCount = memberDocs.filter(
        (m) => m.approvalStatus === "pending",
      ).length;
      const pendingConfirmationCount = memberDocs.filter(
        (m) => m.staffConfirmationStatus === "waiting_staff_confirmation",
      ).length;

      await updateDoc(missionRef, {
        assignedStaffUids: allMemberUids,
        memberUids: allMemberUids,
        approvalTargetUids,
        memberCount: allMemberUids.length,
        approvalRequestCount: approvalTargetUids.length,
        pendingApprovalCount,
        pendingConfirmationCount,
        status: "pending_manager_validation",
        updatedAt: serverTimestamp(),
      });

      // ===== VERIFICATION AFTER MISSION CREATION =====
      console.log("🔍 Verifying mission creation...", {
        missionId: missionRef.id,
        expectedMemberCount: memberDocs.length,
        expectedApproverCount: approvalGroups.size,
      });

      // Verify members were created
      const verifyMembersSnap = await getDocs(
        collection(
          firestore,
          "business_trip_missions",
          missionRef.id,
          "members",
        ),
      );
      console.log(
        `✅ Members verified: ${verifyMembersSnap.docs.length} / ${memberDocs.length} created`,
      );

      // Verify approval_requests were created
      const verifyApprovalsSnap = await getDocs(
        collection(
          firestore,
          "business_trip_missions",
          missionRef.id,
          "approval_requests",
        ),
      );
      console.log(
        `✅ Approval requests verified: ${verifyApprovalsSnap.docs.length} / ${approvalGroups.size} created`,
      );

      if (verifyMembersSnap.docs.length === 0 && memberDocs.length > 0) {
        console.error(
          "❌ CRITICAL: Members not saved! Mission created but no member subcollections.",
        );
        throw new Error(
          "Mission created but no members subcollection. Check Firestore permissions.",
        );
      }

      // ===== DEBUG CONSOLE TABLES =====
      console.table(
        memberDocs.map((m) => ({
          missionId: missionRef.id.substring(0, 8) + "...",
          memberName: m.employeeName,
          memberUid: m.employeeUid.substring(0, 8) + "...",
          approvalTargetUid:
            m.approvalTargetUid?.substring(0, 8) + "..." || "MISSING",
          approvalTargetName: m.approvalTargetName || "MISSING",
          approvalRequestDocId: m.approvalTargetUid || "MISSING",
          approvalRequestApproverUid:
            m.approvalTargetUid?.substring(0, 8) + "..." || "MISSING",
          status: "pending",
        })),
      );

      console.table(
        Array.from(approvalGroups.entries()).map(([approverUid, group]) => ({
          approverUid: approverUid.substring(0, 8) + "...",
          approverName: group.approverName,
          approvalLevel: group.approvalLevel,
          memberCount: group.memberUids.length,
          memberNames: group.memberNames.join(", ").substring(0, 80),
          status: "pending",
        })),
      );

      const timelineCollection = collection(
        firestore,
        "business_trip_missions",
        missionRef.id,
        "timeline",
      );
      await addDoc(timelineCollection, {
        message: `Perjalanan Dinas dibuat dengan ${selectedStaff.length} anggota.`,
        category: "system",
        createdAt: serverTimestamp(),
        byUid: userProfile?.uid || "",
        byName: userProfile?.fullName || "",
      });

      // Write continuation entries to new mission's timeline
      for (const staff of selectedStaff) {
        const contData = staffContinuationSelections[staff.uid];
        if (contData) {
          try {
            await addDoc(timelineCollection, {
              message: `${staff.fullName} bergabung sebagai lanjutan dari misi "${contData.missionName}".`,
              category: "changes",
              createdAt: serverTimestamp(),
              byUid: userProfile?.uid || "",
              byName: userProfile?.fullName || "",
            });
          } catch (e) {
            console.warn("Continuation new-mission timeline write failed", e);
          }
        }
      }

      // Reset form
      setMissionForm({
        missionName: "",
        assignmentNumber: "",
        projectName: "",
        clientName: "",
        tripType: "Sampling",
        tripTypeOther: "",
        destinationProvince: "",
        destinationRegency: "",
        destinationAddress: "",
        destinationGoogleMaps: "",
        startDate: "",
        endDate: "",
        instructionNote: "",
        googleDriveLink: "",
      });
      setSelectedStaffUids([]);
      setStaffContinuationSelections({});
      setAssignmentLetterFile(null);
      setAssignmentLetterError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveMode("list");

      toast({
        title: "Perjalanan Dinas berhasil dibuat",
        description: `${selectedStaff.length} anggota telah ditambahkan ke perjalanan dinas.`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membuat perjalanan dinas",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStaffSelection = useCallback((
    uid: string,
    meta?: { continuation?: ContinuationData; overrideReason?: string },
  ) => {
    setSelectedStaffUids((prev) => {
      const isRemoving = prev.includes(uid);
      if (isRemoving) {
        setStaffContinuationSelections(c => { const n = { ...c }; delete n[uid]; return n; });
      } else if (meta?.continuation) {
        setStaffContinuationSelections(c => ({ ...c, [uid]: meta.continuation! }));
      }
      return isRemoving ? prev.filter((id) => id !== uid) : [...prev, uid];
    });
  }, []);

  if (!userProfile?.uid) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {activeMode === "list" ? (
        /* ===== MISSION LIST VIEW ===== */
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Daftar Perjalanan Dinas</CardTitle>
              <CardDescription>
                Kelola perjalanan dinas yang dibuat oleh Management.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasDuplicateMissions && (
                <Button
                  variant="outline"
                  onClick={handleCleanupDuplicateMissions}
                  disabled={isSaving || isLoading}
                >
                  Atasi Duplikat Perjalanan Dinas
                </Button>
              )}
              <Button onClick={() => handleOpenCreate()}>
                <Plus className="mr-2 h-4 w-4" /> Buat Perjalanan Dinas Baru
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search / filter / sort toolbar */}
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari nama, tujuan, atau anggota…"
                  value={missionSearch}
                  onChange={(e) => setMissionSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 w-full rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select
                value={missionStatusFilter}
                onChange={(e) => setMissionStatusFilter(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Semua Status</option>
                <option value="draft_mission">Draft</option>
                <option value="pending_manager_validation">Menunggu Validasi Manager</option>
                <option value="waiting_staff_confirmation">Menunggu Konfirmasi Staff</option>
                <option value="pending_hrd_finalization">Menunggu Finalisasi HRD</option>
                <option value="approved_ready_to_depart">Siap Berangkat</option>
                <option value="in_progress">Sedang Berjalan</option>
                <option value="at_location">Sudah Sampai Lokasi</option>
                <option value="activity_in_progress">Kegiatan Berjalan</option>
                <option value="activity_done">Kegiatan Selesai</option>
                <option value="needs_attention">Perlu Perhatian</option>
                <option value="on_duty">Sedang Dinas</option>
                <option value="returned_pending_report">Kembali – Belum Laporan</option>
                <option value="report_submitted">Laporan Dikirim</option>
                <option value="completed">Selesai</option>
                <option value="rejected">Ditolak</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
              <select
                value={missionSort}
                onChange={(e) => setMissionSort(e.target.value as typeof missionSort)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="newest">Terbaru</option>
                <option value="nearest">Tanggal Terdekat</option>
                <option value="az">A–Z</option>
                <option value="status">Prioritas Status</option>
              </select>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Memuat data...
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Perjalanan</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Anggota</TableHead>
                      <TableHead>Progress Tracking</TableHead>
                      <TableHead>Status Aktual</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedMissions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-muted-foreground py-8"
                        >
                          {missionSearch || missionStatusFilter !== "all"
                            ? "Tidak ada perjalanan dinas yang cocok dengan filter."
                            : "Belum ada perjalanan dinas"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAndSortedMissions.map((mission) => {
                        const tracking = memberTrackingMap[mission.id ?? ""];
                        const displayStatus = computeTrackingDisplayStatus(mission, tracking);
                        return (
                          <TableRow key={mission.id}>
                            <TableCell className="font-medium">
                              {mission.missionName}
                              <div className="text-xs text-muted-foreground">
                                {mission.assignmentNumber}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                {mission.destinationProvince || "-"}
                                {mission.destinationRegency
                                  ? ` / ${mission.destinationRegency}`
                                  : ""}
                              </div>
                              {mission.destinationAddress && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {mission.destinationAddress}
                                </div>
                              )}
                              {mission.destinationGoogleMaps && (
                                <a
                                  href={mission.destinationGoogleMaps}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary underline mt-1 block"
                                >
                                  Google Maps
                                </a>
                              )}
                            </TableCell>
                            <TableCell>
                              {formatDate(mission.startDate)} –{" "}
                              {formatDate(mission.endDate)}
                            </TableCell>
                            <TableCell>
                              <div>{mission.memberCount ?? 0} anggota</div>
                              <div className="text-xs text-muted-foreground">
                                {`${mission.managerApprovedCount ?? 0}/${mission.memberCount ?? 0} validasi`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {`${mission.staffConfirmedCount ?? 0}/${mission.memberCount ?? 0} konfirmasi`}
                              </div>
                            </TableCell>
                            <TableCell>
                              {tracking && tracking.total > 0 ? (
                                <div className="text-xs space-y-0.5 min-w-[120px]">
                                  <div className={`flex items-center gap-1 ${tracking.departed > 0 ? "" : "text-muted-foreground/50"}`}>
                                    <Navigation className={`h-3 w-3 flex-shrink-0 ${tracking.departed > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} />
                                    <span>{tracking.departed}/{tracking.total} berangkat</span>
                                  </div>
                                  <div className={`flex items-center gap-1 ${tracking.arrived > 0 ? "" : "text-muted-foreground/50"}`}>
                                    <MapPin className={`h-3 w-3 flex-shrink-0 ${tracking.arrived > 0 ? "text-indigo-500" : "text-muted-foreground/40"}`} />
                                    <span>{tracking.arrived}/{tracking.total} sampai lokasi</span>
                                  </div>
                                  <div className={`flex items-center gap-1 ${tracking.activityDone > 0 ? "" : "text-muted-foreground/50"}`}>
                                    <Activity className={`h-3 w-3 flex-shrink-0 ${tracking.activityDone > 0 ? "text-purple-600" : "text-muted-foreground/40"}`} />
                                    <span>{tracking.activityDone}/{tracking.total} kegiatan selesai</span>
                                  </div>
                                  <div className={`flex items-center gap-1 ${tracking.returned > 0 ? "" : "text-muted-foreground/50"}`}>
                                    <Home className={`h-3 w-3 flex-shrink-0 ${tracking.returned > 0 ? "text-green-600" : "text-muted-foreground/40"}`} />
                                    <span>{tracking.returned}/{tracking.total} kembali</span>
                                  </div>
                                  {tracking.issues > 0 && (
                                    <div className="flex items-center gap-1 text-amber-600 font-medium">
                                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                      <span>{tracking.issues} kendala</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">–</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {renderStatusLabel(displayStatus as any)}
                            </TableCell>
                            <TableCell className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => selectMissionForDetail(mission)}
                              >
                                Detail
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => selectMissionForEdit(mission)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => selectMissionForManage(mission)}
                              >
                                Kelola Anggota
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleArchiveMission(mission)}
                              >
                                Batalkan
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : activeMode === "create" ? (
        /* ===== MISSION CREATE FORM ===== */
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <div>
              <CardTitle>Buat Perjalanan Dinas Baru</CardTitle>
              <CardDescription>
                Isi form untuk membuat Surat Perintah Dinas.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseCreate}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="pt-6 space-y-8">
            {/* ── SECTION 1: INFORMASI PERJALANAN DINAS ─────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={FileText}
                title="1. Informasi Perjalanan Dinas"
                description="Nama perjalanan, nomor surat, brand/proyek, klien, dan jenis dinas."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Nama Perjalanan Dinas{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.missionName}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        missionName: e.target.value,
                      })
                    }
                    placeholder="Contoh: Audit Lapangan Q3 – Surabaya"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nomor Surat Tugas/SPD</Label>
                  <Input
                    value={missionForm.assignmentNumber}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        assignmentNumber: e.target.value,
                      })
                    }
                    placeholder="Opsional – otomatis jika kosong"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Brand / Proyek</Label>
                  <Input
                    value={missionForm.projectName}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        projectName: e.target.value,
                      })
                    }
                    placeholder="Nama brand atau proyek"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Nama Klien <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.clientName}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        clientName: e.target.value,
                      })
                    }
                    placeholder="Klien atau mitra tujuan dinas"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Jenis Dinas <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={missionForm.tripType}
                    onValueChange={(val: any) =>
                      setMissionForm({ ...missionForm, tripType: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {missionForm.tripType === "Lainnya" && (
                  <div className="space-y-2">
                    <Label>
                      Sebutkan jenis dinas lainnya{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={missionForm.tripTypeOther}
                      onChange={(e) =>
                        setMissionForm({
                          ...missionForm,
                          tripTypeOther: e.target.value,
                        })
                      }
                      placeholder="Jenis dinas lainnya"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ── SECTION 2: TUJUAN & JADWAL ───────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={MapPin}
                title="2. Tujuan & Jadwal"
                description="Lokasi tujuan, alamat lengkap, link Google Maps, dan tanggal perjalanan."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Provinsi Tujuan <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.destinationProvince}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationProvince: e.target.value,
                      })
                    }
                    placeholder="Provinsi"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Kota / Kabupaten <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={missionForm.destinationRegency}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationRegency: e.target.value,
                      })
                    }
                    placeholder="Kota atau Kabupaten"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>
                    Alamat Lengkap Tujuan{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={missionForm.destinationAddress}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationAddress: e.target.value,
                      })
                    }
                    className="min-h-[80px] resize-none"
                    placeholder="Alamat lengkap lokasi tugas"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Link Google Maps (opsional)</Label>
                  <Input
                    value={missionForm.destinationGoogleMaps}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        destinationGoogleMaps: e.target.value,
                      })
                    }
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Tanggal Berangkat{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={missionForm.startDate}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        startDate: e.target.value,
                      })
                    }
                    className="[color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Tanggal Pulang <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={missionForm.endDate}
                    onChange={(e) =>
                      setMissionForm({
                        ...missionForm,
                        endDate: e.target.value,
                      })
                    }
                    className="[color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                {missionForm.startDate &&
                  missionForm.endDate &&
                  new Date(missionForm.endDate) >=
                    new Date(missionForm.startDate) && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        Durasi perjalanan:{" "}
                        <span className="font-semibold text-foreground">
                          {calculateDurationDays(
                            missionForm.startDate,
                            missionForm.endDate,
                          )}{" "}
                          hari
                        </span>
                      </p>
                    </div>
                  )}
              </div>
            </section>

            {/* ── SECTION 3: INSTRUKSI ─────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={FileText}
                title="3. Instruksi Utama"
                description="Instruksi lengkap untuk seluruh anggota tim dinas."
              />
              <RichTextEditor
                value={missionForm.instructionNote}
                onChange={(html) =>
                  setMissionForm({ ...missionForm, instructionNote: html })
                }
                placeholder="Tulis instruksi pelaksanaan dinas di sini... (bold, italic, bullet list tersedia di toolbar)"
              />
              {!stripHtml(missionForm.instructionNote) && (
                <p className="text-xs text-muted-foreground">
                  Instruksi utama wajib diisi sebelum perjalanan dinas dapat
                  dibuat.
                </p>
              )}
            </section>

            {/* ── SECTION 4: DOKUMEN SURAT TUGAS/SPD ──────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={FileText}
                title="4. Dokumen Surat Tugas/SPD"
                description="Upload dokumen Surat Tugas/SPD atau berikan link Google Drive sebagai alternatif."
              />
              <div className="space-y-3">
                <Label>
                  Upload Surat Tugas / SPD{" "}
                  <span className="text-muted-foreground font-normal">
                    (wajib salah satu: file atau link Drive)
                  </span>
                </Label>
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Pilih File PDF/DOC/DOCX
                    </Button>
                    <div className="min-w-0 flex-1 text-sm">
                      {assignmentLetterFile ? (
                        <div>
                          <p className="font-medium text-foreground truncate">
                            {assignmentLetterFile.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(assignmentLetterFile.size / 1024 / 1024).toFixed(
                              2,
                            )}{" "}
                            MB
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          Pilih file PDF/DOC/DOCX, maks 10 MB.
                        </p>
                      )}
                    </div>
                    {assignmentLetterFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          setAssignmentLetterFile(null);
                          setAssignmentLetterError(null);
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) {
                        setAssignmentLetterFile(null);
                        return;
                      }
                      const validation = validateAssignmentLetterFile(file);
                      if (!validation.isValid) {
                        setAssignmentLetterFile(null);
                        setAssignmentLetterError(validation.message || null);
                        return;
                      }
                      setAssignmentLetterError(null);
                      setAssignmentLetterFile(file);
                    }}
                  />
                  {assignmentLetterError && (
                    <p className="text-sm text-destructive">
                      {assignmentLetterError}
                    </p>
                  )}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-muted/30 px-3 text-muted-foreground">
                        atau
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Link Google Drive (opsional)
                    </Label>
                    <Input
                      value={missionForm.googleDriveLink}
                      onChange={(e) =>
                        setMissionForm({
                          ...missionForm,
                          googleDriveLink: e.target.value,
                        })
                      }
                      placeholder="https://drive.google.com/..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Alternatif jika upload file tidak tersedia.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION 5: TIM DINAS ─────────────────────────────────── */}
            <section className="space-y-4">
              <SectionHeader
                icon={Users}
                title="5. Tim Dinas"
                description="Pilih anggota tim yang akan melaksanakan perjalanan dinas ini."
              />
              <StaffPicker
                allStaff={allMergedStaff}
                selectedUids={selectedStaffUids}
                onToggle={toggleStaffSelection}
                isLoading={staffLoading}
                error={profilesError}
                missionStartDate={missionForm.startDate || undefined}
                missionEndDate={missionForm.endDate || undefined}
                busyMap={enrichedStaffBusyMap}
                continuationSelections={staffContinuationSelections}
              />
            </section>

            {/* ── SUBMIT ───────────────────────────────────────────────── */}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={handleCreateMission}
                disabled={
                  isSaving ||
                  !missionForm.missionName ||
                  !missionForm.clientName ||
                  !missionForm.destinationProvince ||
                  !missionForm.destinationRegency ||
                  !missionForm.destinationAddress ||
                  !missionForm.startDate ||
                  !missionForm.endDate ||
                  !stripHtml(missionForm.instructionNote) ||
                  (missionForm.tripType === "Lainnya" &&
                    !missionForm.tripTypeOther) ||
                  (!assignmentLetterFile && !missionForm.googleDriveLink) ||
                  selectedStaffUids.length === 0
                }
                className="w-full"
                size="lg"
              >
                {isSaving
                  ? "Menyimpan..."
                  : selectedStaffUids.length > 0
                    ? `Buat Perjalanan Dinas (${selectedStaffUids.length} orang)`
                    : "Buat Perjalanan Dinas"}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Pastikan semua field wajib (*) sudah diisi dan minimal satu
                staff dipilih.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : activeMode === "detail" ? (
        renderMissionDetailView()
      ) : activeMode === "edit" ? (
        renderMissionEditView()
      ) : activeMode === "manage" ? (
        renderMissionManageView()
      ) : null}

      <AppModal
        open={isDocumentViewerOpen}
        onOpenChange={setIsDocumentViewerOpen}
      >
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Pratinjau Dokumen Surat Tugas/SPD
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Lihat dokumen dari dalam HRP tanpa membuka API mentah.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDocumentViewerOpen(false)}
            >
              Tutup
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Nama dokumen</p>
            <p className="font-medium text-foreground mt-1">
              {activeDocumentLabel}
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              Sumber dokumen: {activeDocumentSourceLabel}
            </p>
            {activeMission?.googleDriveLink ? (
              <a
                href={activeMission.googleDriveLink}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" variant="secondary" className="w-full">
                  Buka Google Drive
                </Button>
              </a>
            ) : null}

            <Button
              size="sm"
              variant="outline"
              onClick={handlePreviewDocument}
              disabled={isDocumentPreviewing || !activeDocumentUrl}
            >
              {isDocumentPreviewing ? "Memuat..." : "Pratinjau Dokumen"}
            </Button>

            {!activeDocumentUrl ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Dokumen belum bisa dipreview. Silakan buka melalui Google Drive
                atau hubungi admin.
              </div>
            ) : null}

            {documentViewerError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive-foreground">
                {documentViewerError}
              </div>
            ) : null}
          </div>
        </div>
      </AppModal>

      {/* Repair Request Modal */}
      <AppModal
        open={repairRequestModal.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRepairRequestModal({ isOpen: false, missionId: null, evidenceId: null, milestoneType: null });
            setRepairReason("");
          }
        }}
      >
        <div className="space-y-4 p-6">
          <div>
            <DialogTitle className="text-lg font-semibold">Minta Upload Ulang Bukti</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Minta staff untuk mengupload ulang bukti yang belum lengkap.
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="repair-reason">Alasan (Opsional)</Label>
            <Textarea
              id="repair-reason"
              placeholder="Contoh: Foto tidak jelas, lokasi tidak lengkap, dll"
              value={repairReason}
              onChange={(e) => setRepairReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRepairRequestModal({ isOpen: false, missionId: null, evidenceId: null, milestoneType: null });
                setRepairReason("");
              }}
            >
              Batal
            </Button>
            <Button
              disabled={isSaving || !repairRequestModal.missionId || !repairRequestModal.evidenceId}
              onClick={async () => {
                if (!repairRequestModal.missionId || !repairRequestModal.evidenceId || !repairRequestModal.milestoneType) return;
                if (!firestore || !userProfile) return;

                setIsSaving(true);
                try {
                  const evidenceRef = doc(
                    firestore,
                    "business_trip_missions",
                    repairRequestModal.missionId,
                    "milestone_evidences",
                    repairRequestModal.evidenceId,
                  );

                  await setDoc(
                    evidenceRef,
                    {
                      repairStatus: "requested",
                      evidenceRepairRequested: true,
                      repairRequestedByUid: userProfile.uid,
                      repairRequestedByName: userProfile.fullName || userProfile.email || "Unknown",
                      repairRequestedAt: serverTimestamp(),
                      repairReason: repairReason || null,
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true },
                  );

                  const milestoneLabelMap: Record<string, string> = {
                    departed: "Keberangkatan",
                    arrived: "Kedatangan",
                    activity_done: "Penyelesaian Aktivitas",
                    returned: "Kepulangan",
                  };
                  const milestoneLabel = milestoneLabelMap[repairRequestModal.milestoneType] || repairRequestModal.milestoneType;

                  // Add timeline entry
                  const timelineRef = doc(
                    firestore,
                    "business_trip_missions",
                    repairRequestModal.missionId,
                    "timeline",
                    `timeline_${Date.now()}`,
                  );
                  await setDoc(timelineRef, {
                    timestamp: serverTimestamp(),
                    type: "system",
                    message: `${userProfile.fullName || "HRD/Direktur"} meminta upload ulang bukti ${milestoneLabel}${repairReason ? `: ${repairReason}` : ''}`,
                    createdBy: userProfile.uid,
                    createdAt: serverTimestamp(),
                  });

                  toast({
                    title: "Permintaan upload ulang bukti dikirim",
                  });

                  setRepairRequestModal({ isOpen: false, missionId: null, evidenceId: null, milestoneType: null });
                  setRepairReason("");

                  // Reload mission detail
                  if (activeMission?.id) {
                    setMissionRefreshId((prev) => prev + 1);
                  }
                } catch (error: any) {
                  console.error(error);
                  toast({
                    variant: "destructive",
                    title: "Gagal mengirim permintaan",
                    description: error?.message || "Coba lagi.",
                  });
                } finally {
                  setIsSaving(false);
                }
              }}
              className="flex-1"
            >
              {isSaving ? "Mengirim..." : "Kirim Permintaan"}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
