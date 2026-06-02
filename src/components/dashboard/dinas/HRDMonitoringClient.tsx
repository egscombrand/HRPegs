"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AppModal } from "@/components/ui/AppModal";
import { DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowLeft,
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Home,
  Navigation,
  Search,
  TrendingUp,
  Users,
  X,
  CheckSquare,
  MapPin,
  ExternalLink,
  Filter,
  Upload,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessTripMission, BusinessTripMissionMember, FinalReport, MemberFinalReport, MemberNote, MilestoneEvidence } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: any): string {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return "-";
  }
}

function formatDateTime(value: any): string {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  } catch {
    return "-";
  }
}

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

// ── Types ─────────────────────────────────────────────────────────────────────

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

type HrdDisplayStatus =
  | "draft_mission"
  | "pending_manager_validation"
  | "waiting_staff_confirmation"
  | "pending_hrd_finalization"
  | "approved_ready_to_depart"
  | "in_progress"
  | "at_location"
  | "activity_in_progress"
  | "activity_done"
  | "needs_attention"
  | "returned_pending_report"
  | "final_report_submitted"
  | "report_submitted"
  | "settlement_review"
  | "completed"
  | "rejected"
  | "cancelled";

type TimelineEntry = {
  id: string;
  message: string;
  category?: "tracking" | "approval" | "system";
  byUid?: string | null;
  byName?: string | null;
  createdAt: any;
  trustLevel?: "high" | "medium" | "low" | null;
  evidenceId?: string | null;
  // Evidence fields embedded in timeline for cross-role access
  milestoneType?: string | null;
  confirmedByName?: string | null;
  confirmedByUid?: string | null;
  targetMemberNames?: string[] | null;
  targetMemberUids?: string[] | null;
  evidenceLat?: number | null;
  evidenceLng?: number | null;
  evidenceAccuracy?: number | null;
  evidenceAddress?: string | null;
  evidenceLocationStatus?: string | null;
  evidenceLocationTrust?: string | null;
  evidenceManualNote?: string | null;
  evidencePhotos?: Array<{ photoUrl?: string | null; expiresAt?: any }> | null;
};

// ── Status computation ─────────────────────────────────────────────────────────

function computeDisplayStatus(
  mission: BusinessTripMission,
  tracking: TrackingStats | undefined,
): HrdDisplayStatus {
  const stored = (mission.status ?? "draft_mission") as HrdDisplayStatus;

  // Terminal / approval-flow statuses — always use stored
  if (
    ["pending_manager_validation", "waiting_staff_confirmation",
     "pending_hrd_finalization", "draft_mission",
     "rejected", "cancelled"].includes(stored)
  ) return stored;

  if (["completed", "final_report_submitted", "settlement_review"].includes(stored)) return stored;
  if (stored === "report_submitted") return stored;

  if (!tracking || tracking.total === 0) return stored;

  if (tracking.issues > 0) return "needs_attention";
  if (tracking.returned >= tracking.total && tracking.total > 0) return "returned_pending_report";
  if (tracking.activityDone >= tracking.total && tracking.total > 0) return "activity_done";
  if (tracking.activityDone > 0) return "activity_in_progress";
  if (tracking.arrived >= tracking.total && tracking.total > 0) return "at_location";
  if (tracking.departed > 0) return "in_progress";
  if (stored === "approved_ready_to_depart") return "approved_ready_to_depart";

  return stored;
}

const STATUS_PRIORITY: Record<string, number> = {
  needs_attention: 0,
  activity_done: 1,
  activity_in_progress: 2,
  at_location: 3,
  in_progress: 4,
  approved_ready_to_depart: 5,
  returned_pending_report: 6,
  final_report_submitted: 7,
  report_submitted: 8,
  pending_hrd_finalization: 9,
  waiting_staff_confirmation: 9,
  pending_manager_validation: 10,
  draft_mission: 11,
  settlement_review: 12,
  completed: 13,
  rejected: 14,
  cancelled: 15,
};

// ── Status label + badge ───────────────────────────────────────────────────────

function statusLabel(s: string): string {
  const MAP: Record<string, string> = {
    draft_mission: "Draft",
    pending_manager_validation: "Menunggu Validasi Manager",
    waiting_staff_confirmation: "Menunggu Konfirmasi Staff",
    pending_hrd_finalization: "Menunggu Finalisasi HRD",
    approved_ready_to_depart: "Siap Berangkat",
    in_progress: "Sedang Berjalan",
    at_location: "Sudah Sampai Lokasi",
    activity_in_progress: "Kegiatan Berjalan",
    activity_done: "Kegiatan Selesai",
    needs_attention: "Butuh Perhatian",
    returned_pending_report: "Menunggu Laporan Akhir",
    final_report_submitted: "Laporan Akhir Terkirim",
    report_submitted: "Laporan Dikirim",
    settlement_review: "Review Penyelesaian",
    completed: "Selesai",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
    on_duty: "Sedang Bertugas",
  };
  return MAP[s] ?? s.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    needs_attention: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/40",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40",
    at_location: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/40",
    activity_in_progress: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40",
    activity_done: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/40",
    approved_ready_to_depart: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800/40",
    returned_pending_report: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40",
    final_report_submitted: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40",
    report_submitted: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40",
    settlement_review: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40",
    completed: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/40",
    pending_hrd_finalization: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/40",
    pending_manager_validation: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/40",
    waiting_staff_confirmation: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/40",
    rejected: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/40",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800/40",
    draft_mission: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800/40",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${variants[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {statusLabel(status)}
    </span>
  );
}

// ── Member trip status ─────────────────────────────────────────────────────────

function memberTripLabel(ts?: string): { label: string; color: string } {
  const MAP: Record<string, { label: string; color: string }> = {
    ready: { label: "Siap", color: "text-teal-600 dark:text-teal-400" },
    departed: { label: "Berangkat", color: "text-blue-600 dark:text-blue-400" },
    arrived: { label: "Sampai Lokasi", color: "text-blue-700 dark:text-blue-300" },
    activity_done: { label: "Kegiatan Selesai", color: "text-indigo-600 dark:text-indigo-400" },
    return_started: { label: "Dalam Perjalanan Pulang", color: "text-purple-600 dark:text-purple-400" },
    returned: { label: "Sudah Kembali", color: "text-green-600 dark:text-green-400" },
    issue_reported: { label: "Ada Kendala", color: "text-red-600 dark:text-red-400" },
  };
  return MAP[ts ?? ""] ?? { label: ts ? ts.replace(/_/g, " ") : "–", color: "text-muted-foreground" };
}

// ── Timeline category helpers ──────────────────────────────────────────────────

type HrdTimelineCategory = "tracking" | "approval" | "changes" | "issues" | "system";

function inferCategory(entry: TimelineEntry): HrdTimelineCategory {
  if (entry.category === "tracking") return "tracking";
  if (entry.category === "approval") return "approval";
  if ((entry.category as string) === "changes") return "changes";
  if ((entry.category as string) === "issues") return "issues";

  const msg = (entry.message ?? "").toLowerCase();

  // Issues first (specific)
  if (msg.includes("kendala") || msg.includes("melaporkan kendala")) return "issues";

  // Tracking journey
  if (
    msg.includes("berangkat") || msg.includes("sampai lokasi") || msg.includes("tiba") ||
    msg.includes("kegiatan selesai") || msg.includes("sudah kembali") ||
    msg.includes("mengonfirmasi keberangkatan") || msg.includes("mengonfirmasi tiba") ||
    msg.includes("mengonfirmasi kembali") || msg.includes("mengonfirmasi kegiatan")
  ) return "tracking";

  // Approval
  if (
    msg.includes("disetujui") || msg.includes("ditolak") || msg.includes("validasi") ||
    msg.includes("konfirmasi") || msg.includes("finalisasi") || msg.includes("menunggu") ||
    msg.includes("manager") || msg.includes("hrd") || msg.includes("direktur")
  ) return "approval";

  // Changes
  if (
    msg.includes("diubah") || msg.includes("diperbarui") || msg.includes("diupdate") ||
    msg.includes("tanggal") || msg.includes("tujuan") || msg.includes("anggota") ||
    msg.includes("dokumen") || msg.includes("instruksi") || msg.includes("spd") ||
    msg.includes("ditambahkan") || msg.includes("dihapus") || msg.includes("diganti")
  ) return "changes";

  return "system";
}

function inferMilestoneTypeFromMsg(msg: string): MilestoneEvidence["milestoneType"] {
  const lower = (msg ?? "").toLowerCase();
  if (lower.includes("keberangkatan") || lower.includes("berangkat")) return "departed";
  if (lower.includes("tiba di lokasi") || lower.includes("sampai lokasi")) return "arrived";
  if (lower.includes("kegiatan selesai")) return "activity_done";
  if (lower.includes("kembali")) return "returned";
  return "departed";
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
  detailTimeline: TimelineEntry[],
  detailEvidences: MilestoneEvidence[],
  detailMembers: BusinessTripMissionMember[],
  missionId: string,
): MilestoneEvidence[] {
  // ─ Source 1: Built from timeline entries (has evidence metadata embedded)
  const timelineEvidence: MilestoneEvidence[] = detailTimeline
    .filter((e) => {
      const cat = inferCategory(e);
      return cat === "tracking" && (e.milestoneType || inferMilestoneTypeFromMsg(e.message));
    })
    .map((e) => normalizeEvidence({
      id: e.evidenceId ?? e.id,
      missionId,
      milestoneType: e.milestoneType ?? inferMilestoneTypeFromMsg(e.message),
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
  const normalizedMilestoneEvidence = detailEvidences.map((e) => normalizeEvidence({ ...e, missionId }));

  console.log("📸 collectEvidenceSources debug:", {
    timelineEntriesTotal: detailTimeline.length,
    timelineTrackingEntries: detailTimeline.filter((e) => inferCategory(e) === "tracking").length,
    timelineEvidenceBuilt: timelineEvidence.length,
    timelineEvidenceWithPhotos: timelineEvidence.filter((e) => (e.photos?.length ?? 0) > 0).length,
    milestone_evidencesCount: detailEvidences.length,
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function HRDMonitoringClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();

  // ── Data state ───────────────────────────────────────────────────────────
  const [missions, setMissions] = useState<BusinessTripMission[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [memberTrackingMap, setMemberTrackingMap] = useState<Record<string, TrackingStats>>({});
  const [brandSet, setBrandSet] = useState<Set<string>>(new Set());

  // ── Detail state ─────────────────────────────────────────────────────────
  const [selectedMission, setSelectedMission] = useState<BusinessTripMission | null>(null);
  const [detailMembers, setDetailMembers] = useState<BusinessTripMissionMember[]>([]);
  const [detailTimeline, setDetailTimeline] = useState<TimelineEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineTab, setTimelineTab] = useState<"all" | "tracking" | "approval" | "changes" | "issues">("tracking");
  const [detailFinalReport, setDetailFinalReport] = useState<FinalReport | null>(null);
  const [detailMemberReports, setDetailMemberReports] = useState<Record<string, MemberFinalReport>>({});
  const [detailMemberNotes, setDetailMemberNotes] = useState<Record<string, MemberNote>>({});
  const [isArchivingMission, setIsArchivingMission] = useState(false);
  const [detailEvidences, setDetailEvidences] = useState<MilestoneEvidence[]>([]);

  // ── Filter / sort state ──────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "nearest" | "az" | "status">("newest");
  const [showFilters, setShowFilters] = useState(false);

  // Repair request modal
  const [repairRequestModal, setRepairRequestModal] = useState<{
    isOpen: boolean;
    missionId: string | null;
    evidenceId: string | null;
    milestoneType: "departed" | "arrived" | "activity_done" | "returned" | null;
  }>({ isOpen: false, missionId: null, evidenceId: null, milestoneType: null });
  const [repairReason, setRepairReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ── Subscriptions ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, "business_trip_missions"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessTripMission));
      setMissions(docs);
      setIsLoadingMissions(false);
      // Keep selectedMission in sync with latest Firestore data
      setSelectedMission((prev) => {
        if (!prev?.id) return prev;
        const updated = docs.find((d) => d.id === prev.id);
        return updated ?? prev;
      });
    });
    return unsub;
  }, [firestore]);

  useEffect(() => {
    if (!firestore) return;
    const q = collectionGroup(firestore, "members");
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, TrackingStats> = {};
      const brands = new Set<string>();

      snap.docs.forEach((d) => {
        const data = d.data() as BusinessTripMissionMember;
        const mId = data.missionId;
        if (!mId) return;

        const ms = data.memberStatus as string;
        if (["archived", "cancelled", "rejected_by_manager", "declined_by_staff"].includes(ms)) return;

        if (!map[mId]) {
          map[mId] = { total: 0, departed: 0, arrived: 0, activityDone: 0, returned: 0, issues: 0, lastUpdateAt: null, lastUpdateByName: "", memberNames: [] };
        }
        const s = map[mId];
        s.total++;
        s.memberNames.push(data.employeeName);

        if (data.brandName) brands.add(data.brandName);

        const ts = data.memberTripStatus;
        if (ts === "departed" || ts === "arrived" || ts === "activity_done" || ts === "return_started" || ts === "returned") s.departed++;
        if (ts === "arrived" || ts === "activity_done" || ts === "return_started" || ts === "returned") s.arrived++;
        if (ts === "activity_done" || ts === "return_started" || ts === "returned") s.activityDone++;
        if (ts === "returned") s.returned++;
        if (ts === "issue_reported") s.issues++;

        const upd = data.lastTripUpdateAt;
        if (upd && (!s.lastUpdateAt || toSeconds(upd) > toSeconds(s.lastUpdateAt))) {
          s.lastUpdateAt = upd;
          s.lastUpdateByName = data.lastTripUpdateByName ?? "";
        }
      });

      setMemberTrackingMap(map);
      setBrandSet(brands);
    });
    return unsub;
  }, [firestore]);

  // Detail subscriptions
  useEffect(() => {
    if (!firestore || !selectedMission?.id) {
      setDetailMembers([]);
      setDetailTimeline([]);
      setDetailFinalReport(null);
      setDetailMemberReports({});
      setDetailMemberNotes({});
      setDetailEvidences([]);
      return;
    }
    setDetailLoading(true);
    const mId = selectedMission.id;

    const unsubMembers = onSnapshot(
      query(collection(firestore, `business_trip_missions/${mId}/members`), orderBy("createdAt", "asc")),
      (snap) => {
        setDetailMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessTripMissionMember)));
        setDetailLoading(false);
      },
      (err) => { console.error("members snapshot error:", err); setDetailLoading(false); },
    );

    const unsubTimeline = onSnapshot(
      query(collection(firestore, `business_trip_missions/${mId}/timeline`), orderBy("createdAt", "desc")),
      (snap) => {
        setDetailTimeline(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimelineEntry)));
      },
      (err) => console.error("timeline snapshot error:", err),
    );

    const unsubFinalReport = onSnapshot(
      collection(firestore, `business_trip_missions/${mId}/final_report`),
      (snap) => {
        const first = snap.docs[0];
        setDetailFinalReport(first ? ({ id: first.id, ...first.data() } as FinalReport) : null);
      },
      (err) => console.error("final_report snapshot error:", err),
    );

    const unsubMemberReports = onSnapshot(
      collection(firestore, `business_trip_missions/${mId}/member_final_reports`),
      (snap) => {
        const map: Record<string, MemberFinalReport> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as MemberFinalReport; });
        setDetailMemberReports(map);
      },
      (err) => console.error("member_final_reports snapshot error:", err),
    );

    const unsubMemberNotes = onSnapshot(
      collection(firestore, `business_trip_missions/${mId}/member_notes`),
      (snap) => {
        const map: Record<string, MemberNote> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as MemberNote; });
        setDetailMemberNotes(map);
      },
      (err) => console.error("member_notes snapshot error:", err),
    );

    const unsubEvidences = onSnapshot(
      query(collection(firestore, `business_trip_missions/${mId}/milestone_evidences`), orderBy("createdAt", "asc")),
      (snap) => {
        setDetailEvidences(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MilestoneEvidence)));
      },
      (err) => console.error("milestone_evidences snapshot error:", err),
    );

    return () => { unsubMembers(); unsubTimeline(); unsubFinalReport(); unsubMemberReports(); unsubMemberNotes(); unsubEvidences(); };
  }, [firestore, selectedMission?.id]);

  // ── Summary stats ──────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    let total = 0, readyToDepart = 0, inProgress = 0, needsAttention = 0, pendingReport = 0, done = 0, cancelled = 0;
    missions.forEach((m) => {
      if ((m.status as string) === "archived_duplicate") return;
      const ds = computeDisplayStatus(m, memberTrackingMap[m.id ?? ""]);
      if (ds === "cancelled" || ds === "rejected") { cancelled++; return; }
      total++;
      if (ds === "approved_ready_to_depart") readyToDepart++;
      else if (ds === "in_progress" || ds === "at_location" || ds === "activity_in_progress" || ds === "activity_done") inProgress++;
      else if (ds === "needs_attention") needsAttention++;
      else if (ds === "returned_pending_report" || ds === "final_report_submitted" || ds === "report_submitted") pendingReport++;
      else if (ds === "completed" || ds === "settlement_review") done++;
    });
    return { total, readyToDepart, inProgress, needsAttention, pendingReport, done, cancelled };
  }, [missions, memberTrackingMap]);

  // ── Filtered + sorted missions ─────────────────────────────────────────────

  const filteredMissions = useMemo(() => {
    const q = search.toLowerCase().trim();
    const now = new Date();

    let list = missions.filter((m) => {
      if ((m.status as string) === "archived_duplicate") return false;

      // Status filter
      if (statusFilter !== "all") {
        const ds = computeDisplayStatus(m, memberTrackingMap[m.id ?? ""]);
        if (ds !== statusFilter) return false;
      }

      // Date filter
      if (dateFilter !== "all") {
        const start = toDate(m.startDate);
        if (!start) return false;
        if (dateFilter === "today") {
          if (start < startOfDay(now) || start > endOfDay(now)) return false;
        } else if (dateFilter === "thisweek") {
          if (start < startOfWeek(now, { weekStartsOn: 1 }) || start > endOfWeek(now, { weekStartsOn: 1 })) return false;
        } else if (dateFilter === "thismonth") {
          if (start < startOfMonth(now) || start > endOfMonth(now)) return false;
        }
      }

      // Brand filter
      if (brandFilter !== "all") {
        const tracking = memberTrackingMap[m.id ?? ""];
        // We need to check members for this mission — this is approximate from tracking map
        // For proper brand filter we rely on mission-level data if available
        // skip if we can't determine
      }

      // Search
      if (q) {
        const tracking = memberTrackingMap[m.id ?? ""];
        const nameMatch = (m.missionName ?? "").toLowerCase().includes(q);
        const destMatch = [m.destinationProvince, m.destinationRegency, m.destinationAddress]
          .filter(Boolean).join(" ").toLowerCase().includes(q);
        const memberMatch = tracking?.memberNames.some((n) => n.toLowerCase().includes(q));
        const spdMatch = (m.assignmentNumber ?? "").toLowerCase().includes(q);
        if (!nameMatch && !destMatch && !memberMatch && !spdMatch) return false;
      }

      return true;
    });

    return list.slice().sort((a, b) => {
      if (sortBy === "nearest") {
        const nowSec = Date.now() / 1000;
        return Math.abs(toSeconds(a.startDate) - nowSec) - Math.abs(toSeconds(b.startDate) - nowSec);
      }
      if (sortBy === "az") return (a.missionName ?? "").localeCompare(b.missionName ?? "");
      if (sortBy === "status") {
        const da = computeDisplayStatus(a, memberTrackingMap[a.id ?? ""]);
        const db = computeDisplayStatus(b, memberTrackingMap[b.id ?? ""]);
        return (STATUS_PRIORITY[da] ?? 99) - (STATUS_PRIORITY[db] ?? 99);
      }
      return toSeconds(b.createdAt) - toSeconds(a.createdAt);
    });
  }, [missions, memberTrackingMap, search, statusFilter, dateFilter, brandFilter, sortBy]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectMission = useCallback((m: BusinessTripMission) => {
    setSelectedMission(m);
    setTimelineTab("tracking");
  }, []);

  const handleBack = useCallback(() => {
    setSelectedMission(null);
    setDetailMembers([]);
    setDetailTimeline([]);
  }, []);

  const handleHrdArchiveMission = async () => {
    if (!firestore || !selectedMission?.id || !userProfile) return;
    setIsArchivingMission(true);
    try {
      await updateDoc(doc(firestore, "business_trip_missions", selectedMission.id), {
        status: "completed",
        archivedAt: serverTimestamp(),
        archivedByUid: userProfile.uid,
        archivedByName: userProfile.fullName || userProfile.email || "",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, "business_trip_missions", selectedMission.id, "timeline"), {
        message: `HRD (${userProfile.fullName || userProfile.email}) menutup dan mengarsipkan perjalanan dinas. Status: Selesai.`,
        category: "system",
        byName: userProfile.fullName || userProfile.email || null,
        byUid: userProfile.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsArchivingMission(false);
    }
  };

  // ── Render: stat card ─────────────────────────────────────────────────────

  const StatCard = ({
    label, value, icon: Icon, accent, onClick, active
  }: {
    label: string; value: number; icon: React.ElementType;
    accent: string; onClick?: () => void; active?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all w-full ${
        active
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
    </button>
  );

  // ── Render: DETAIL VIEW ───────────────────────────────────────────────────

  if (selectedMission) {
    const tracking = memberTrackingMap[selectedMission.id ?? ""];
    const displayStatus = computeDisplayStatus(selectedMission, tracking);
    const activeMembers = detailMembers.filter(
      (m) => !["archived", "declined_by_staff", "rejected_by_manager"].includes(m.memberStatus as string),
    );
    const filteredTimeline = detailTimeline.filter((e) => {
      if (timelineTab === "all") return true;
      return inferCategory(e) === timelineTab;
    });

    return (
      <div className="space-y-4">
        {/* Back header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar
          </Button>
        </div>

        {/* Mission header card */}
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold leading-tight">{selectedMission.missionName}</h2>
                  <StatusBadge status={displayStatus} />
                </div>
                {selectedMission.assignmentNumber && (
                  <p className="text-sm text-muted-foreground font-mono">SPD: {selectedMission.assignmentNumber}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
                  {(selectedMission.destinationProvince || selectedMission.destinationRegency) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      {[selectedMission.destinationRegency, selectedMission.destinationProvince].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                    {formatDate(selectedMission.startDate)} – {formatDate(selectedMission.endDate)}
                  </span>
                  {selectedMission.tripType && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                      {selectedMission.tripType}{selectedMission.tripTypeOther ? ` – ${selectedMission.tripTypeOther}` : ""}
                    </span>
                  )}
                  {selectedMission.assignedByName && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      Oleh: {selectedMission.assignedByName}
                    </span>
                  )}
                </div>
              </div>

              {/* Computed display status from member milestones */}
              {tracking && tracking.total > 0 && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{tracking.departed}/{tracking.total} berangkat</span>
                  {tracking.issues > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {tracking.issues} kendala
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Document link */}
            {(selectedMission.googleDriveLink || selectedMission.assignmentLetterDriveUrl) && (
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border/40">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a
                  href={selectedMission.googleDriveLink || selectedMission.assignmentLetterDriveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline underline-offset-2 flex items-center gap-1 hover:text-primary/80"
                >
                  Lihat Surat Tugas / SPD
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Monitoring Perjalanan ── */}
        {tracking && tracking.total > 0 && (() => {
          type StepDef = {
            key: string;
            label: string;
            icon: React.ElementType;
            milestoneKey: string;
            count: number;
            doneNames: string[];
            notDoneNames: string[];
            lastAt: any;
            color: string; bg: string; border: string;
          };

          const stepsData: StepDef[] = [
            {
              key: "departed", label: "Berangkat", icon: Navigation, milestoneKey: "departed",
              count: tracking.departed,
              doneNames: activeMembers.filter(m => ["departed","arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              notDoneNames: activeMembers.filter(m => !["departed","arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              lastAt: activeMembers.filter(m => m.departedAt).reduce((best, m) => toSeconds(m.departedAt) > toSeconds(best) ? m.departedAt : best, null as any),
              color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50/60 dark:bg-blue-900/20", border: "border-blue-200/60 dark:border-blue-800/40",
            },
            {
              key: "arrived", label: "Sampai Lokasi", icon: MapPin, milestoneKey: "arrived",
              count: tracking.arrived,
              doneNames: activeMembers.filter(m => ["arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              notDoneNames: activeMembers.filter(m => !["arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              lastAt: activeMembers.filter(m => m.arrivedAt).reduce((best, m) => toSeconds(m.arrivedAt) > toSeconds(best) ? m.arrivedAt : best, null as any),
              color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50/60 dark:bg-indigo-900/20", border: "border-indigo-200/60 dark:border-indigo-800/40",
            },
            {
              key: "activity_done", label: "Kegiatan Selesai", icon: CheckSquare, milestoneKey: "activity_done",
              count: tracking.activityDone,
              doneNames: activeMembers.filter(m => ["activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              notDoneNames: activeMembers.filter(m => !["activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              lastAt: activeMembers.filter(m => m.activityDoneAt).reduce((best, m) => toSeconds(m.activityDoneAt) > toSeconds(best) ? m.activityDoneAt : best, null as any),
              color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50/60 dark:bg-purple-900/20", border: "border-purple-200/60 dark:border-purple-800/40",
            },
            {
              key: "returned", label: "Kembali", icon: Home, milestoneKey: "returned",
              count: tracking.returned,
              doneNames: activeMembers.filter(m => m.memberTripStatus === "returned").map(m => m.employeeName),
              notDoneNames: activeMembers.filter(m => m.memberTripStatus !== "returned").map(m => m.employeeName),
              lastAt: activeMembers.filter(m => m.returnedAt).reduce((best, m) => toSeconds(m.returnedAt) > toSeconds(best) ? m.returnedAt : best, null as any),
              color: "text-green-600 dark:text-green-400", bg: "bg-green-50/60 dark:bg-green-900/20", border: "border-green-200/60 dark:border-green-800/40",
            },
          ];

          return (
            <Card className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                    Monitoring Perjalanan
                  </h3>
                  {tracking.issues > 0 && (
                    <span className="flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50/60 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-800/30 dark:bg-red-900/20 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {tracking.issues} kendala
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {stepsData.map((step) => {
                    const Icon = step.icon;
                    const allDone = step.count >= tracking.total;
                    const partDone = step.count > 0 && !allDone;
                    return (
                      <div
                        key={step.key}
                        className={`rounded-xl border p-3 space-y-2 ${
                          allDone ? `${step.bg} ${step.border}` :
                          partDone ? "border-border/60 bg-muted/10" :
                          "border-border/40 bg-muted/5 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 flex-shrink-0 ${step.count > 0 ? step.color : "text-muted-foreground/40"}`} />
                          <span className="text-xs font-semibold text-foreground">{step.label}</span>
                          <span className={`ml-auto text-sm font-bold tabular-nums ${step.count > 0 ? step.color : "text-muted-foreground/40"}`}>
                            {step.count}<span className="text-[10px] font-normal text-muted-foreground">/{tracking.total}</span>
                          </span>
                        </div>

                        {step.doneNames.length > 0 && (
                          <div>
                            <p className="text-[9px] font-semibold uppercase text-muted-foreground/60 mb-0.5">Sudah</p>
                            <p className="text-[11px] text-foreground leading-snug">
                              {step.doneNames.slice(0, 3).join(", ")}
                              {step.doneNames.length > 3 && ` +${step.doneNames.length - 3}`}
                            </p>
                          </div>
                        )}

                        {step.notDoneNames.length > 0 && step.count > 0 && (
                          <div>
                            <p className="text-[9px] font-semibold uppercase text-muted-foreground/60 mb-0.5">Belum</p>
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              {step.notDoneNames.slice(0, 2).join(", ")}
                              {step.notDoneNames.length > 2 && ` +${step.notDoneNames.length - 2}`}
                            </p>
                          </div>
                        )}

                        {step.lastAt && (
                          <p className="text-[9px] text-muted-foreground/70">
                            Update terakhir: {formatDateTime(step.lastAt)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Detail Anggota ── */}
        {activeMembers.length > 0 && (
          <Card className="border-border/60">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Detail Anggota
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Nama</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium hidden sm:table-cell">Posisi</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Berangkat</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium hidden md:table-cell">Sampai</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium hidden lg:table-cell">Selesai</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Kembali</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMembers.map((m) => {
                      const { label, color } = memberTripLabel(m.memberTripStatus);
                      return (
                        <tr key={m.id} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-2.5 px-2">
                            <p className="font-medium text-foreground">{m.employeeName}</p>
                            {m.divisionName && <p className="text-[10px] text-muted-foreground">{m.divisionName}</p>}
                          </td>
                          <td className="py-2.5 px-2 hidden sm:table-cell text-muted-foreground">
                            {m.employeePosition ?? "–"}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`font-semibold ${color}`}>{label}</span>
                            {m.memberTripStatus === "issue_reported" && m.issueCategory && (
                              <p className="text-[9px] text-red-500 mt-0.5">{m.issueCategory}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center text-muted-foreground">
                            {m.departedAt ? formatDateTime(m.departedAt) : "–"}
                          </td>
                          <td className="py-2.5 px-2 text-center text-muted-foreground hidden md:table-cell">
                            {m.arrivedAt ? formatDateTime(m.arrivedAt) : "–"}
                          </td>
                          <td className="py-2.5 px-2 text-center text-muted-foreground hidden lg:table-cell">
                            {m.activityDoneAt ? formatDateTime(m.activityDoneAt) : "–"}
                          </td>
                          <td className="py-2.5 px-2 text-center text-muted-foreground">
                            {m.returnedAt ? formatDateTime(m.returnedAt) : "–"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Bukti Perjalanan ── */}
        {(() => {
          const tracking = memberTrackingMap[selectedMission.id ?? ""];
          if (!tracking || tracking.total === 0) return null;

          // Collect evidence from multiple sources (timeline + milestone_evidences)
          const allEvidence = collectEvidenceSources(
            detailTimeline,
            detailEvidences,
            detailMembers,
            selectedMission.id!,
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
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
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
                        if (ev.id && selectedMission?.id) {
                          setRepairRequestModal({
                            isOpen: true,
                            missionId: selectedMission.id,
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
            <Card id="bukti-perjalanan" className="border-border/60 scroll-mt-4">
              <CardContent className="p-4 space-y-5">
                <h3 className="font-semibold text-base">Bukti Perjalanan</h3>
                {milestoneOrder.map((key) => {
                  const Icon = milestoneIcon[key];
                  const items = allEvidence.filter((e) => e.milestoneType === key);
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${milestoneColor[key]}`} />
                        <p className="text-sm font-semibold">{evidenceTypeLabel[key]}</p>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">Belum ada bukti untuk milestone ini.</p>
                      ) : items.map((ev) => <EvidenceCard key={ev.id} ev={ev} />)}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })()}

        {/* Final Report Section — always show when mission is at/past returned stage */}
        {(selectedMission.status === "returned_pending_report" || selectedMission.status === "final_report_submitted" || selectedMission.status === "completed" || detailFinalReport || Object.keys(detailMemberReports).length > 0) && (() => {
          const rpt = detailFinalReport;
          const reviewStatus = rpt?.reportReviewStatus;
          const isApproved = reviewStatus === "approved";
          const canArchive = selectedMission.status === "final_report_submitted" || selectedMission.status === "completed";

          const reviewBadge = () => {
            if (!rpt?.submittedAt) return null;
            if (reviewStatus === "approved") return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">Laporan Disetujui</span>;
            if (reviewStatus === "revision_requested") return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Perlu Revisi</span>;
            if (reviewStatus === "resubmitted") return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Dikirim Ulang</span>;
            if (rpt?.submittedAt) return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Menunggu Review</span>;
            return null;
          };

          return (
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-base">Laporan Akhir Dinas</CardTitle>
                    {selectedMission.reportMode && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {selectedMission.reportMode === "individual_report" ? "Individu" : "Tim"}
                      </span>
                    )}
                    {reviewBadge()}
                  </div>
                  {canArchive && (
                    <div className="flex items-center gap-2">
                      {!isApproved && (
                        <span className="text-xs text-muted-foreground">Belum disetujui direktur</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-500 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                        onClick={handleHrdArchiveMission}
                        disabled={isArchivingMission}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Tutup &amp; Arsipkan
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4">
                {!rpt && Object.keys(detailMemberReports).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10 py-8 px-4 text-center space-y-1.5">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">Belum ada laporan akhir</p>
                    <p className="text-xs text-muted-foreground/70">Laporan akan tampil setelah peserta mengirim laporan.</p>
                  </div>
                ) : (
                  <>
                    {/* Meta info */}
                    {rpt && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {rpt.dilaporkanOlehName && <span>Dilaporkan oleh: <strong className="text-foreground">{rpt.dilaporkanOlehName}</strong></span>}
                        {rpt.submittedAt && <span>Dikirim: {formatDateTime(rpt.submittedAt)}</span>}
                        {rpt.reviewedByName && reviewStatus !== "pending_review" && (
                          <span>Direview: <strong className="text-foreground">{rpt.reviewedByName}</strong> · {formatDateTime(rpt.reviewedAt)}</span>
                        )}
                      </div>
                    )}

                    {/* Revision note */}
                    {reviewStatus === "revision_requested" && rpt?.revisionNote && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-3 dark:border-amber-700/30 dark:bg-amber-900/10">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Catatan Revisi dari Direktur</p>
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
                    {Object.keys(detailMemberReports).length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Laporan Individu Anggota</p>
                          <span className="text-xs text-muted-foreground">
                            {Object.values(detailMemberReports).filter((r) => !!r.submittedAt).length}/{Object.keys(detailMemberReports).length} terkumpul
                          </span>
                        </div>
                        {Object.values(detailMemberReports).map((r) => (
                          <div key={r.memberUid} className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{r.memberName}</p>
                              <div className="flex items-center gap-1.5">
                                {r.reportReviewStatus === "approved" && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">Disetujui</span>}
                                {r.reportReviewStatus === "revision_requested" && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Perlu Revisi</span>}
                                {r.reportReviewStatus === "resubmitted" && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Dikirim Ulang</span>}
                                {!r.reportReviewStatus && r.submittedAt && <span className="text-[10px] font-semibold text-muted-foreground">Terkirim</span>}
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
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Timeline Aktivitas ── */}
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Timeline Aktivitas
              </h3>
              <div className="flex flex-wrap gap-1 rounded-lg border border-border overflow-hidden text-xs">
                {(["tracking", "approval", "changes", "issues", "all"] as const).map((tab) => {
                  const tabLabels: Record<string, string> = {
                    tracking: "Perjalanan", approval: "Approval",
                    changes: "Perubahan", issues: "Kendala", all: "Semua",
                  };
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTimelineTab(tab)}
                      className={`px-2.5 py-1.5 transition-colors ${
                        timelineTab === tab ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {tabLabels[tab]}
                    </button>
                  );
                })}
              </div>
            </div>

            {(() => {
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
              const noDataLabels: Record<string, string> = {
                tracking: "Belum ada log perjalanan.", approval: "Belum ada log approval.",
                changes: "Belum ada log perubahan.", issues: "Tidak ada kendala.", all: "Belum ada riwayat.",
              };

              // Summarise long tracking messages into a compact title + sub
              function summariseTracking(msg: string): { title: string; sub: string } {
                const lower = msg.toLowerCase();
                let title = msg;
                if (lower.includes("keberangkatan") || lower.includes("berangkat")) title = "Konfirmasi Keberangkatan";
                else if (lower.includes("tiba di lokasi") || lower.includes("sampai lokasi")) title = "Konfirmasi Tiba di Lokasi";
                else if (lower.includes("kegiatan selesai") || lower.includes("kegiatan selesai")) title = "Konfirmasi Kegiatan Selesai";
                else if (lower.includes("kembali")) title = "Konfirmasi Kembali";
                // Extract member names (before the date phrase)
                const forMatch = msg.match(/untuk:\s*([^.]+?)\s+pada\s/i);
                const names = forMatch ? forMatch[1].trim() : "";
                const dateMatch = msg.match(/pada\s+(.+?)\s+pukul\s+(.+?)\./i);
                const when = dateMatch ? `${dateMatch[1]}, ${dateMatch[2]}` : "";
                const sub = [names, when].filter(Boolean).join(" · ");
                return { title, sub };
              }

              return (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-0.5">
                  {filteredTimeline.length === 0 ? (
                    <div className="rounded-xl border border-border/60 p-6 text-center text-sm text-muted-foreground">
                      {noDataLabels[timelineTab] ?? "Tidak ada entri."}
                    </div>
                  ) : filteredTimeline.map((entry) => {
                    const cat = inferCategory(entry);
                    const isTrackingEntry = cat === "tracking";

                    if (isTrackingEntry) {
                      // Strip any evidence indicator text from message for clean display
                      const cleanMsg = entry.message.replace(/\s*\[\d+\s*bukti\s*foto\]/gi, "").trim();
                      const { title, sub } = summariseTracking(cleanMsg);
                      return (
                        <div key={entry.id} className={`rounded-xl border-l-4 border border-border/40 bg-card px-3 py-3 ${borderColors[cat]}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
                              {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatDateTime(entry.createdAt)}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={entry.id} className={`rounded-xl border-l-4 border border-border/40 bg-card px-3 py-2.5 ${borderColors[cat] ?? "border-l-border"}`}>
                        <p className="text-sm leading-relaxed text-foreground/90">{entry.message}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-sm text-muted-foreground">
                            {entry.byName ? `${entry.byName} · ` : ""}{formatDateTime(entry.createdAt)}
                          </span>
                          {timelineTab === "all" && (
                            <span className={`text-xs font-semibold uppercase tracking-wide ${catColors[cat] ?? "text-muted-foreground"}`}>
                              {catLabels[cat] ?? "Sistem"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render: LIST VIEW ─────────────────────────────────────────────────────

  const activeFilterCount = [
    statusFilter !== "all",
    dateFilter !== "all",
    brandFilter !== "all",
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Misi"
          value={summary.total}
          icon={FileText}
          accent="bg-muted text-muted-foreground"
          onClick={() => setStatusFilter("all")}
          active={statusFilter === "all"}
        />
        <StatCard
          label="Siap Berangkat"
          value={summary.readyToDepart}
          icon={Navigation}
          accent="bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400"
          onClick={() => setStatusFilter(statusFilter === "approved_ready_to_depart" ? "all" : "approved_ready_to_depart")}
          active={statusFilter === "approved_ready_to_depart"}
        />
        <StatCard
          label="Sedang Berjalan"
          value={summary.inProgress}
          icon={Activity}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
          onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")}
          active={statusFilter === "in_progress"}
        />
        <StatCard
          label="Butuh Perhatian"
          value={summary.needsAttention}
          icon={AlertTriangle}
          accent="bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
          onClick={() => setStatusFilter(statusFilter === "needs_attention" ? "all" : "needs_attention")}
          active={statusFilter === "needs_attention"}
        />
        <StatCard
          label="Menunggu Laporan"
          value={summary.pendingReport}
          icon={Clock}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
          onClick={() => setStatusFilter(statusFilter === "returned_pending_report" ? "all" : "returned_pending_report")}
          active={statusFilter === "returned_pending_report"}
        />
        <StatCard
          label="Selesai"
          value={summary.done}
          icon={CheckCircle2}
          accent="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
          onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
          active={statusFilter === "completed"}
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama misi, SPD, tujuan, atau nama anggota…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="newest">Terbaru Dibuat</option>
            <option value="nearest">Tanggal Terdekat</option>
            <option value="az">A–Z</option>
            <option value="status">Prioritas Status</option>
          </select>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Status</option>
                <option value="approved_ready_to_depart">Siap Berangkat</option>
                <option value="in_progress">Sedang Berjalan</option>
                <option value="at_location">Sudah Sampai Lokasi</option>
                <option value="activity_in_progress">Kegiatan Berjalan</option>
                <option value="activity_done">Kegiatan Selesai</option>
                <option value="needs_attention">Butuh Perhatian</option>
                <option value="returned_pending_report">Menunggu Laporan Akhir</option>
                <option value="final_report_submitted">Laporan Akhir Terkirim</option>
                <option value="report_submitted">Laporan Dikirim</option>
                <option value="pending_hrd_finalization">Menunggu Finalisasi HRD</option>
                <option value="waiting_staff_confirmation">Menunggu Konfirmasi Staff</option>
                <option value="pending_manager_validation">Menunggu Validasi Manager</option>
                <option value="completed">Selesai</option>
                <option value="rejected">Ditolak</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tanggal Berangkat</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Waktu</option>
                <option value="today">Hari Ini</option>
                <option value="thisweek">Minggu Ini</option>
                <option value="thismonth">Bulan Ini</option>
              </select>
            </div>

            {brandSet.size > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">Semua Brand</option>
                  {Array.from(brandSet).sort().map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            {activeFilterCount > 0 && (
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => { setStatusFilter("all"); setDateFilter("all"); setBrandFilter("all"); }}
                  className="h-8 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  Reset Filter
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground pl-1">
          Menampilkan {filteredMissions.length} dari {missions.filter(m => (m.status as string) !== "archived_duplicate").length} misi
        </p>
      </div>

      {/* ── Mission table ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoadingMissions ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Memuat data misi…</div>
        ) : filteredMissions.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {search || activeFilterCount > 0
              ? "Tidak ada misi yang cocok dengan filter."
              : "Belum ada perjalanan dinas."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="min-w-[200px]">Nama Misi</TableHead>
                  <TableHead className="min-w-[140px]">Tujuan</TableHead>
                  <TableHead className="min-w-[130px]">Periode</TableHead>
                  <TableHead className="min-w-[90px] text-center">Anggota</TableHead>
                  <TableHead className="min-w-[150px]">Progress Perjalanan</TableHead>
                  <TableHead className="min-w-[160px]">Update Terakhir</TableHead>
                  <TableHead className="min-w-[110px]">Kendala</TableHead>
                  <TableHead className="min-w-[140px]">Status Aktual</TableHead>
                  <TableHead className="min-w-[70px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMissions.map((mission) => {
                  const tracking = memberTrackingMap[mission.id ?? ""];
                  const displayStatus = computeDisplayStatus(mission, tracking);
                  const hasIssue = (tracking?.issues ?? 0) > 0;

                  return (
                    <TableRow
                      key={mission.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => handleSelectMission(mission)}
                    >
                      {/* Nama Misi */}
                      <TableCell>
                        <div className="font-medium leading-tight">{mission.missionName || "–"}</div>
                        {mission.assignmentNumber && (
                          <div className="mt-0.5 text-xs font-mono text-muted-foreground">{mission.assignmentNumber}</div>
                        )}
                        {mission.tripType && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{mission.tripType}</div>
                        )}
                      </TableCell>

                      {/* Tujuan */}
                      <TableCell>
                        <div className="text-sm">
                          {mission.destinationRegency || mission.destinationProvince || "–"}
                        </div>
                        {mission.destinationProvince && mission.destinationRegency && (
                          <div className="text-xs text-muted-foreground">{mission.destinationProvince}</div>
                        )}
                      </TableCell>

                      {/* Periode */}
                      <TableCell>
                        <div className="text-xs">
                          {formatDate(mission.startDate)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          s/d {formatDate(mission.endDate)}
                        </div>
                        {mission.durationDays && (
                          <div className="text-xs text-muted-foreground">{mission.durationDays}h</div>
                        )}
                      </TableCell>

                      {/* Anggota */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{tracking?.total ?? mission.memberCount ?? 0}</span>
                        </div>
                      </TableCell>

                      {/* Progress Perjalanan */}
                      <TableCell>
                        {tracking && tracking.total > 0 ? (
                          <div className="space-y-0.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Navigation className={`h-3 w-3 flex-shrink-0 ${tracking.departed > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} />
                              <span className={tracking.departed > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.departed}/{tracking.total} berangkat
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin className={`h-3 w-3 flex-shrink-0 ${tracking.arrived > 0 ? "text-indigo-500" : "text-muted-foreground/40"}`} />
                              <span className={tracking.arrived > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.arrived}/{tracking.total} sampai lokasi
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CheckSquare className={`h-3 w-3 flex-shrink-0 ${tracking.activityDone > 0 ? "text-indigo-600" : "text-muted-foreground/40"}`} />
                              <span className={tracking.activityDone > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.activityDone}/{tracking.total} kegiatan selesai
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Home className={`h-3 w-3 flex-shrink-0 ${tracking.returned > 0 ? "text-green-600" : "text-muted-foreground/40"}`} />
                              <span className={tracking.returned > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.returned}/{tracking.total} kembali
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Belum ada data tracking</span>
                        )}
                      </TableCell>

                      {/* Update Terakhir */}
                      <TableCell>
                        {tracking?.lastUpdateAt ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium leading-tight">
                              {tracking.lastUpdateByName || "–"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDateTime(tracking.lastUpdateAt)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </TableCell>

                      {/* Kendala */}
                      <TableCell>
                        {hasIssue ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            {tracking!.issues} kendala
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Tidak ada</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={displayStatus} />
                      </TableCell>

                      {/* Aksi */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 px-2 text-xs"
                          onClick={() => handleSelectMission(mission)}
                        >
                          Detail
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

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
    </div>
  );
}
