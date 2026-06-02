"use client";

import { useState, useMemo, useEffect } from "react";
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
  type Firestore,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { useToast } from "@/hooks/use-toast";
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
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  CheckCircle2,
  FileText,
  MapPin,
  ClipboardCheck,
  ArrowRightCircle,
  Upload,
  XCircle,
  FileCheck,
  AlertTriangle,
  Navigation,
  Home,
  Activity,
  CheckSquare,
  X,
  Users,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import {
  buildEmployeeDirectory,
  type NormalizedDirectoryMember,
} from "@/lib/employee-directory";
import { resolveApprovalTarget } from "@/lib/approval-flow";
import { determineApprovalTarget } from "@/lib/travel-utils";
import { formatDestination, extractGoogleDriveFileId } from "@/lib/dinas-utils";
import type {
  Brand,
  EmployeeMasterData,
  EmployeeProfile,
  UserProfile,
} from "@/lib/types";
import type { MilestoneEvidence } from "./types";

const MISSION_STATUSES = [
  "draft_mission",
  "pending_manager_validation",
  "waiting_staff_confirmation",
  "pending_hrd_finalization",
  "approved_ready_to_depart",
  "on_duty",
  "returned_pending_report",
  "final_report_submitted",
  "report_submitted",
  "expense_submitted",
  "settlement_review",
  "completed",
  "rejected",
  "cancelled",
] as const;

const MEMBER_STATUSES = [
  "waiting_manager_validation",
  "approved_by_manager",
  "validated_by_assigner",
  "replacement_requested",
  "rejected_by_manager",
  "waiting_staff_confirmation",
  "confirmed_by_staff",
  "declined_by_staff",
  "ready_to_depart",
  "on_duty",
  "returned",
  "report_submitted",
  "completed",
] as const;

const TRIP_TYPES = [
  "Sampling",
  "Audit",
  "Meeting",
  "Survey",
  "Operasional",
  "Lainnya",
] as const;

const COST_SCHEMAS = ["advance", "reimburse", "company_paid", "mixed"] as const;

const EXPENSE_CATEGORIES = [
  "Transportasi",
  "Tiket perjalanan",
  "BBM",
  "Tol/Parkir",
  "Makan",
  "Penginapan",
  "Komunikasi",
  "Operasional lapangan",
  "Alat sampling kecil",
  "Print/Fotokopi dokumen",
  "Biaya masuk lokasi",
  "Pengiriman dokumen/sampel",
  "Lainnya",
] as const;

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEvidenceType(milestone: string): string {
  if (milestone === "departed") return "Bukti Keberangkatan";
  if (milestone === "arrived") return "Bukti Tiba di Lokasi";
  if (milestone === "activity_done") return "Bukti Kegiatan Selesai";
  if (milestone === "returned") return "Bukti Kepulangan";
  return milestone;
}

function getMilestonePhotoHelper(milestone: string): string {
  if (milestone === "departed") return "Upload foto tim, kendaraan, titik kumpul, atau kondisi siap berangkat.";
  if (milestone === "arrived") return "Upload foto lokasi proyek, gerbang, papan nama, atau area kerja.";
  if (milestone === "activity_done") return "Upload foto hasil kegiatan, alat kerja, dokumen lapangan, atau bukti pekerjaan selesai.";
  if (milestone === "returned") return "Upload foto tim siap pulang, kendaraan, titik pulang, atau bukti sudah kembali.";
  return "Upload foto bukti kondisi milestone ini.";
}

function computeTrustLevel(accuracy?: number, status?: string): "high" | "medium" | "low" {
  if (status !== "captured" || accuracy == null) return "low";
  if (accuracy <= 100) return "high";
  if (accuracy <= 300) return "medium";
  return "low";
}

async function compressMilestoneImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxWidth = 1200;
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.7,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export type BusinessTripType = (typeof TRIP_TYPES)[number];
export type CostSchema = (typeof COST_SCHEMAS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type BusinessTripMission = {
  id?: string;
  missionName?: string;
  assignmentNumber?: string;
  assignmentLetterUrl?: string;
  assignmentLetterFileName?: string;
  assignedByUid?: string;
  assignedByName?: string;
  assignedByPosition?: string;
  projectName?: string;
  clientName?: string;
  tripType?: BusinessTripType;
  destinationLabel?: string;
  destinationName?: string;
  destinationCity?: string;
  destinationRegency?: string;
  destinationKabupaten?: string;
  destinationProvince?: string;
  destination?: string;
  tujuan?: string;
  destinationAddress?: string;
  startDate?: any;
  endDate?: any;
  durationDays?: number;
  instructionNote?: string;
  instructionHtml?: string;
  costScheme?: CostSchema;
  advanceAmount?: number;
  budgetEstimate?: number;
  status?: MissionStatus;
  reportMode?: "team_report" | "individual_report" | "mixed_report";
  finalReportSubmittedAt?: any;
  finalReportSubmittedBy?: string;
  archivedAt?: any;
  archivedByUid?: string;
  archivedByName?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type BusinessTripMissionMember = {
  id?: string;
  missionId: string;
  missionName: string;
  assignmentNumber?: string;
  employeeUid: string;
  employeeName: string;
  employeePosition?: string;
  employeeType?: string;
  brandId?: string;
  brandName?: string;
  divisionId?: string;
  divisionName?: string;
  managerUid?: string;
  managerName?: string;
  directSupervisorUid?: string;
  directSupervisorName?: string;
  approvalTargetUid?: string;
  approvalTargetName?: string;
  approvalLevel?: "division_manager" | "director";
  isDivisionManager?: boolean;
  requiresApproval?: boolean;
  approvalStatus?:
    | "pending"
    | "approved"
    | "rejected"
    | "validated_by_assigner";
  memberStatus?: MemberStatus;
  managerValidationStatus?: MemberStatus;
  managerValidationNote?: string;
  managerReplacementSuggestion?: string;
  staffConfirmationStatus?: MemberStatus;
  staffConfirmationNote?: string;
  transportationPlan?: string;
  departurePoint?: string;
  contactDuringTrip?: string;
  cashAdvanceRequired?: boolean;
  advanceNeededAmount?: number;
  actualDepartureAt?: any;
  actualReturnAt?: any;
  reportStatus?: string;
  reportSummary?: string;
  reportOutcomes?: string;
  reportIssues?: string;
  reportRecommendations?: string;
  reportAttachmentUrl?: string;
  startDate?: any;
  endDate?: any;
  durationDays?: number;
  requiresManagerValidation?: boolean;
  samplingPointsCount?: number;
  sampleTypes?: string;
  locationPic?: string;
  baNumber?: string;
  fieldConditionNote?: string;
  missionStatus?: MissionStatus;
  // Trip tracking milestones (phase 2 detailed tracking)
  memberTripStatus?:
    | "ready"
    | "departed"
    | "arrived"
    | "activity_done"
    | "return_started"
    | "returned"
    | "issue_reported";
  lastTripUpdateAt?: any;
  lastTripUpdateByUid?: string;
  lastTripUpdateByName?: string;
  departedAt?: any;
  estimatedArrivalAt?: any;
  arrivedAt?: any;
  activityDoneAt?: any;
  returnStartedAt?: any;
  estimatedReturnAt?: any;
  returnedAt?: any;
  issueNote?: string;
  issueCategory?: string;
  issueUrgency?: "rendah" | "sedang" | "tinggi";
  issueAttachmentUrl?: string;
  issueAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

interface BusinessTripClientProps {
  mode: "management" | "manager" | "staff" | "hrd-monitor" | "hrd-finance";
}

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

function formatTime(value: any) {
  try {
    if (!value) return "";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "HH:mm", { locale: idLocale });
  } catch {
    return "";
  }
}

function formatCurrency(value?: number) {
  if (value == null) return "Rp 0";
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function getDestinationLabel(mission: any): string {
  return formatDestination(mission);
}

function getMemberApprovalStatusBadge(member: BusinessTripMissionMember) {
  const normalizedApproval = normalizeApprovalStatus(member);

  if (normalizedApproval === "approved_by_manager") {
    return <Badge variant="success">Disetujui atasan</Badge>;
  }
  if (normalizedApproval === "replacement_requested") {
    return <Badge variant="destructive">Diminta ganti staff</Badge>;
  }
  if (normalizedApproval === "rejected_by_manager") {
    return <Badge variant="destructive">Ditolak atasan</Badge>;
  }

  return <Badge variant="warning">Menunggu persetujuan atasan</Badge>;
}

function renderStatusLabel(status?: string) {
  if (!status) return <Badge variant="secondary">Belum diisi</Badge>;
  const styleMap: Record<string, BadgeProps["variant"]> = {
    draft_mission: "secondary",
    pending_manager_validation: "warning",
    waiting_staff_confirmation: "warning",
    pending_hrd_finalization: "warning",
    approved_ready_to_depart: "success",
    on_duty: "success",
    returned_pending_report: "warning",
    final_report_submitted: "info",
    report_submitted: "info",
    expense_submitted: "info",
    settlement_review: "warning",
    completed: "success",
    rejected: "destructive",
    cancelled: "destructive",
    waiting_manager_validation: "warning",
    approved_by_manager: "success",
    validated_by_assigner: "success",
    replacement_requested: "destructive",
    rejected_by_manager: "destructive",
    confirmed_by_staff: "success",
    declined_by_staff: "destructive",
    ready_to_depart: "success",
    returned: "success",
    // Legacy / normalized member statuses
    approved: "success",
    manager_approved: "success",
    confirmed: "success",
    staff_confirmed: "success",
    // Computed UI statuses (phase-1 tracking)
    in_progress: "success",
    needs_attention: "destructive",
    waiting_final_report: "warning",
  };

  const labelMap: Record<string, string> = {
    draft_mission: "Draft misi",
    pending_manager_validation: "Menunggu persetujuan atasan",
    waiting_staff_confirmation: "Menunggu konfirmasi staff",
    pending_hrd_finalization: "Menunggu finalisasi HRD",
    approved_ready_to_depart: "Siap Berangkat",
    on_duty: "Sedang dinas",
    returned_pending_report: "Menunggu Laporan Akhir",
    final_report_submitted: "Laporan Akhir Terkirim",
    report_submitted: "Laporan sudah dikirim",
    expense_submitted: "Pengeluaran dikirim",
    settlement_review: "Review settlement",
    completed: "Selesai",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
    approved_by_manager: "Disetujui oleh atasan",
    approved: "Disetujui atasan",
    manager_approved: "Disetujui atasan",
    validated_by_assigner: "Disetujui atasan",
    replacement_requested: "Diminta ganti staff",
    rejected_by_manager: "Ditolak oleh atasan",
    confirmed_by_staff: "Dikonfirmasi staff",
    confirmed: "Dikonfirmasi staff",
    staff_confirmed: "Dikonfirmasi staff",
    declined_by_staff: "Ditolak staff",
    ready_to_depart: "Siap Berangkat",
    returned: "Sudah kembali",
    // Computed UI statuses (phase-1 tracking)
    in_progress: "Sedang Berjalan",
    needs_attention: "Butuh Perhatian",
    waiting_final_report: "Menunggu Laporan Akhir",
  };

  const label = labelMap[status] || String(status).replace(/_/g, " ");
  return <Badge variant={styleMap[status] || "secondary"}>{label}</Badge>;
}

function normalizeApprovalStatus(member: BusinessTripMissionMember) {
  const raw = String(
    member.managerValidationStatus || member.approvalStatus || member.memberStatus || "",
  ).toLowerCase();
  if (
    [
      "approved",
      "approved_by_manager",
      "validated_by_assigner",
      "manager_approved",
      "disetujui",
    ].includes(raw)
  ) {
    return "approved_by_manager" as MemberStatus;
  }
  if (raw === "replacement_requested") {
    return "replacement_requested" as MemberStatus;
  }
  if (["rejected", "rejected_by_manager", "ditolak"].includes(raw)) {
    return "rejected_by_manager" as MemberStatus;
  }
  return "waiting_manager_validation" as MemberStatus;
}

function normalizeConfirmationStatus(member: BusinessTripMissionMember) {
  const raw = String(
    member.staffConfirmationStatus || (member as any).confirmationStatus || "",
  ).toLowerCase();
  if (["confirmed_by_staff", "confirmed", "staff_confirmed"].includes(raw)) {
    return "confirmed_by_staff" as MemberStatus;
  }
  if (["declined_by_staff", "declined", "not_confirmed"].includes(raw)) {
    return "declined_by_staff" as MemberStatus;
  }
  return "waiting_staff_confirmation" as MemberStatus;
}

function isMemberApproved(member: BusinessTripMissionMember) {
  return normalizeApprovalStatus(member) === "approved_by_manager";
}

function isMemberConfirmed(member: BusinessTripMissionMember) {
  return normalizeConfirmationStatus(member) === "confirmed_by_staff";
}

function computeMissionDisplayStatus(
  status: string | undefined,
  startDate: any,
  members: BusinessTripMissionMember[],
): string {
  if (!status) return "";
  // Issue overrides everything
  if (members.some((m) => m.memberTripStatus === "issue_reported")) {
    return "needs_attention";
  }
  // Computed in_progress: ready/approved + today >= startDate, or anyone departed/in-transit
  const anyActive = members.some((m) =>
    ["departed", "arrived", "activity_done", "return_started"].includes(
      m.memberTripStatus ?? "",
    ),
  );
  const allMembersApproved = members.length > 0 && members.every(isMemberApproved);
  const allMembersConfirmed = members.length > 0 && members.every(isMemberConfirmed);
  if (allMembersApproved && allMembersConfirmed && !anyActive) {
    return "approved_ready_to_depart";
  }
  if (!allMembersApproved) return "pending_manager_validation";
  if (!allMembersConfirmed) return "waiting_staff_confirmation";
  if (anyActive) return "in_progress";
  if (status === "ready_to_depart" || status === "approved_ready_to_depart") {
    const ts = (startDate as any)?.seconds
      ? (startDate as any).seconds * 1000
      : startDate
        ? new Date(startDate).getTime()
        : null;
    if (ts && Date.now() >= ts) return "in_progress";
  }
  // returned_pending_report maps to waiting_final_report label
  if (status === "returned_pending_report") return "waiting_final_report";
  return status;
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
      status: "approved" | "rejected" | "pending";
      notes?: string;
      decidedAt?: any;
    }
  >();

  members
    .filter((member) => String(member.memberStatus) !== "archived")
    .forEach((member) => {
      const approverUid = member.approvalTargetUid || "unassigned";
      const key = `${approverUid}::${member.divisionName || ""}`;
      const existing = managerMap.get(key);
      const approverName =
        member.approvalTargetName ||
        member.managerName ||
        "Approver belum terset - struktur organisasi perlu diperbaiki";
      const divisionName = member.divisionName || "Divisi belum diatur";
      const status = member.managerValidationStatus;
      const mappedStatus =
        status === "approved_by_manager" || member.approvalStatus === "approved"
          ? "approved"
          : status === "rejected_by_manager"
            ? "rejected"
            : "pending";

      if (!existing) {
        managerMap.set(key, {
          managerUid: approverUid === "unassigned" ? "" : approverUid,
          managerName: approverName,
          divisionName,
          memberUids: [member.employeeUid],
          memberNames: [member.employeeName],
          status: mappedStatus,
          notes: member.managerValidationNote || member.staffConfirmationNote,
          decidedAt: member.updatedAt,
        });
        return;
      }

      existing.memberUids = Array.from(
        new Set([...existing.memberUids, member.employeeUid]),
      );
      existing.memberNames = Array.from(
        new Set([...existing.memberNames, member.employeeName]),
      );
      if (existing.status !== "rejected" && mappedStatus === "rejected") {
        existing.status = "rejected";
      } else if (existing.status === "pending" && mappedStatus === "approved") {
        existing.status = "approved";
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

async function syncManagerValidationDocs(
  firestore: Firestore | null,
  missionId: string,
  members: BusinessTripMissionMember[],
) {
  if (!firestore || !missionId) return;
  const summaries = buildManagerValidationSummaries(members);
  const validationsRef = collection(
    firestore,
    "business_trip_missions",
    missionId,
    "manager_validations",
  );

  const existingSnap = await getDocs(validationsRef);

  await Promise.all(
    summaries.map((summary) => {
      const docId =
        summary.managerUid || `${summary.managerName}-${summary.divisionName}`;
      return setDoc(doc(validationsRef, docId), {
        managerUid: summary.managerUid || "",
        managerName: summary.managerName,
        divisionName: summary.divisionName,
        memberUids: summary.memberUids || [],
        memberNames: summary.memberNames || [],
        status: summary.status,
        notes: summary.notes || null,
        decidedAt: summary.decidedAt || null,
      });
    }),
  );

  await Promise.all(
    existingSnap.docs
      .filter(
        (docSnap) =>
          !summaries.some(
            (summary) =>
              summary.managerUid === docSnap.id ||
              `${summary.managerName}-${summary.divisionName}` === docSnap.id,
          ),
      )
      .map((docSnap) => deleteDoc(doc(validationsRef, docSnap.id))),
  );
}

export function BusinessTripClient({ mode }: BusinessTripClientProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedMission, setSelectedMission] =
    useState<BusinessTripMission | null>(null);
  const [selectedMember, setSelectedMember] =
    useState<BusinessTripMissionMember | null>(null);
  const [missionMembers, setMissionMembers] = useState<
    BusinessTripMissionMember[]
  >([]);
  const [missionTimeline, setMissionTimeline] = useState<
    Array<{
      id: string;
      message: string;
      createdAt: any;
      byUid?: string | null;
      byName?: string | null;
      category?: "tracking" | "approval" | "system";
      trustLevel?: "high" | "medium" | "low" | null;
      evidenceId?: string | null;
    }>
  >([]);
  const [timelineTab, setTimelineTab] = useState<"all" | "tracking" | "system">(
    "all",
  );
  const [missionDetailError, setMissionDetailError] = useState<string | null>(
    null,
  );
  const [selectedStaffUids, setSelectedStaffUids] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Real-time subscription for mission members when a mission is selected
  useEffect(() => {
    if (!firestore || !selectedMission?.id) return;
    const membersRef = collection(
      firestore,
      "business_trip_missions",
      selectedMission.id,
      "members",
    );
    const unsubscribe = onSnapshot(
      membersRef,
      (snap) => {
        setMissionMembers(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as BusinessTripMissionMember),
          })),
        );
      },
      (err) => console.error("Members snapshot error:", err),
    );
    return () => unsubscribe();
  }, [firestore, selectedMission?.id]);

  // Real-time subscription for mission timeline when a mission is selected
  useEffect(() => {
    if (!firestore || !selectedMission?.id) return;
    const timelineRef = collection(
      firestore,
      "business_trip_missions",
      selectedMission.id,
      "timeline",
    );
    const unsubscribe = onSnapshot(
      query(timelineRef, orderBy("createdAt", "desc")),
      (snap) => {
        setMissionTimeline(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
        );
      },
      (err) => console.error("Timeline snapshot error:", err),
    );
    return () => unsubscribe();
  }, [firestore, selectedMission?.id]);

  // Subscribe to repair requests for current member
  useEffect(() => {
    if (!firestore || !selectedMission?.id || !selectedMember?.employeeUid) {
      setRepairRequests([]);
      return;
    }
    loadRepairRequests(selectedMission.id, selectedMember.employeeUid, selectedMember.employeeName);
  }, [firestore, selectedMission?.id, selectedMember?.employeeUid, selectedMember?.employeeName]);

  // Subscribe to final report subcollections when a mission is selected
  useEffect(() => {
    if (!firestore || !selectedMission?.id) {
      setFinalReport(null);
      setMemberFinalReports({});
      setMemberNotes({});
      return;
    }
    const mId = selectedMission.id;
    const unsubFinal = onSnapshot(
      collection(firestore, "business_trip_missions", mId, "final_report"),
      (snap) => {
        const first = snap.docs[0];
        setFinalReport(first ? { id: first.id, ...first.data() } : null);
      },
      (err) => console.error("final_report snapshot error:", err),
    );
    const unsubMemberReports = onSnapshot(
      collection(
        firestore,
        "business_trip_missions",
        mId,
        "member_final_reports",
      ),
      (snap) => {
        const map: Record<string, any> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setMemberFinalReports(map);
      },
      (err) => console.error("member_final_reports snapshot error:", err),
    );
    const unsubMemberNotes = onSnapshot(
      collection(firestore, "business_trip_missions", mId, "member_notes"),
      (snap) => {
        const map: Record<string, any> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setMemberNotes(map);
      },
      (err) => console.error("member_notes snapshot error:", err),
    );
    return () => {
      unsubFinal();
      unsubMemberReports();
      unsubMemberNotes();
    };
  }, [firestore, selectedMission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getBusinessTripMissionCollection = () =>
    firestore ? collection(firestore, "business_trip_missions") : null;

  const getMissionMembersCollection = (missionId?: string) =>
    firestore && missionId
      ? collection(firestore, "business_trip_missions", missionId, "members")
      : null;

  const getMissionTimelineCollection = (missionId?: string) =>
    firestore && missionId
      ? collection(firestore, "business_trip_missions", missionId, "timeline")
      : null;

  const getBusinessTripMissionDoc = (missionId?: string) =>
    firestore && missionId
      ? doc(firestore, "business_trip_missions", missionId)
      : null;

  const getMissionMemberDoc = (missionId?: string, memberId?: string) =>
    firestore && missionId && memberId
      ? doc(firestore, "business_trip_missions", missionId, "members", memberId)
      : null;

  const [actionNote, setActionNote] = useState("");
  const [replacementSuggestion, setReplacementSuggestion] = useState("");
  const [showIssueInput, setShowIssueInput] = useState(false);
  const [issueForm, setIssueForm] = useState({
    category: "",
    urgency: "",
    note: "",
    attachment: null as File | null,
  });
  const [trackingForm, setTrackingForm] = useState({
    departurePoint: "",
    estimatedArrivalAt: "",
    estimatedReturnAt: "",
  });

  // Milestone evidence form state
  type MilestoneGps = {
    status: "idle" | "capturing" | "captured" | "unavailable";
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    capturedAt?: Date;
    trustLevel?: "high" | "medium" | "low";
    gpsPermissionStatus?: string;
    // Reverse-geocoded address
    addressText?: string;
    streetName?: string;
    village?: string;
    district?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country?: string;
    geocodeStatus?: "success" | "failed";
  };
  const [milestoneGps, setMilestoneGps] = useState<MilestoneGps>({ status: "idle" });
  const [milestoneNote, setMilestoneNote] = useState("");
  const [milestonePhotos, setMilestonePhotos] = useState<{ file: File; preview: string }[]>([]);
  const [milestoneManualLocation, setMilestoneManualLocation] = useState("");

  // Repair requests state
  const [repairRequests, setRepairRequests] = useState<MilestoneEvidence[]>([]);
  const [activeRepairRequest, setActiveRepairRequest] = useState<MilestoneEvidence | null>(null);
  const [repairUploadPhotos, setRepairUploadPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [repairGps, setRepairGps] = useState<MilestoneGps>({ status: "idle" });
  const [repairManualLocation, setRepairManualLocation] = useState("");

  // Group milestone modal state
  type PendingMilestone = {
    milestone:
      | "departed"
      | "arrived"
      | "activity_done"
      | "returned"
      | "issue_reported";
    eligible: BusinessTripMissionMember[];
  };
  const [pendingMilestone, setPendingMilestone] =
    useState<PendingMilestone | null>(null);
  const [groupSelectedUids, setGroupSelectedUids] = useState<string[]>([]);

  const [technicalForm, setTechnicalForm] = useState({
    contactDuringTrip: "",
    staffConfirmationNote: "",
  });
  const [reportForm, setReportForm] = useState({
    summary: "",
    outcomes: "",
    issues: "",
    recommendations: "",
    attachment: null as File | null,
  });

  // Final report state
  const [finalReport, setFinalReport] = useState<any | null>(null);
  const [memberFinalReports, setMemberFinalReports] = useState<
    Record<string, any>
  >({});
  const [memberNotes, setMemberNotes] = useState<Record<string, any>>({});
  const [teamReportForm, setTeamReportForm] = useState({
    ringkasanKegiatan: "",
    hasilOutput: "",
    kendalaDanSolusi: "",
    tindakLanjut: "",
    catatanUntukHRD: "",
    lampiranFile: null as File | null,
  });
  const [memberReportForm, setMemberReportForm] = useState({
    kegiatanDilakukan: "",
    hasilPribadi: "",
    kendalaPribadi: "",
    solusiPribadi: "",
    catatanTambahan: "",
    lampiranFile: null as File | null,
  });
  const [isSubmittingFinalReport, setIsSubmittingFinalReport] = useState(false);
  const [showFinalReportPanel, setShowFinalReportPanel] = useState(false);
  const [localReportMode, setLocalReportMode] = useState<
    "team_report" | "individual_report"
  >("team_report");
  const [missionForm, setMissionForm] = useState({
    missionName: "",
    assignmentNumber: "",
    projectName: "",
    clientName: "",
    tripType: "Sampling" as BusinessTripType,
    destinationCity: "",
    destinationAddress: "",
    startDate: "",
    endDate: "",
    instructionHtml: "",
    instructionText: "",
  });
  const [assignmentLetter, setAssignmentLetter] = useState<File | null>(null);

  const usersCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, "users") : null),
    [firestore],
  );

  const employeesCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, "employees") : null),
    [firestore],
  );

  const employeeProfilesRef = useMemoFirebase(
    () => (firestore ? collection(firestore, "employee_profiles") : null),
    [firestore],
  );

  const brandsCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, "brands") : null),
    [firestore],
  );

  const { data: usersData, isLoading: usersLoading } =
    useCollection<UserProfile>(usersCollectionRef);
  const { data: employeesData, isLoading: employeesLoading } =
    useCollection<EmployeeMasterData>(employeesCollectionRef);
  const { data: employeeProfilesData, isLoading: profilesLoading } =
    useCollection<EmployeeProfile>(employeeProfilesRef);
  const { data: brandsData, isLoading: brandsLoading } =
    useCollection<Brand>(brandsCollectionRef);

  const staffLoading =
    usersLoading || employeesLoading || profilesLoading || brandsLoading;

  const allStaff = useMemo<NormalizedDirectoryMember[]>(() => {
    return buildEmployeeDirectory(
      usersData,
      employeesData,
      employeeProfilesData,
      brandsData,
    );
  }, [usersData, employeesData, employeeProfilesData, brandsData]);

  const staffByBrand = useMemo(() => {
    const brands = new Map<string, Map<string, NormalizedDirectoryMember[]>>();

    allStaff.forEach((staff) => {
      const brand = staff.brandName || "Brand belum diatur";
      const division = staff.divisionName || "Divisi belum diatur";
      if (!brands.has(brand)) brands.set(brand, new Map());
      const divisionMap = brands.get(brand)!;
      if (!divisionMap.has(division)) divisionMap.set(division, []);
      divisionMap.get(division)!.push(staff);
    });

    return brands;
  }, [allStaff]);

  const missionQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile) return null;

    const missionCollection = getBusinessTripMissionCollection();
    if (!missionCollection) return null;

    if (mode === "manager") {
      return query(
        missionCollection,
        where("managerUids", "array-contains", userProfile.uid),
        where("status", "==", "pending_manager_validation"),
        orderBy("createdAt", "desc"),
      );
    }

    if (mode === "staff") {
      // For staff we'll fetch member docs client-side to allow fallback fields
      return null;
    }

    return query(missionCollection, orderBy("createdAt", "desc"));
  }, [firestore, userProfile, mode]);

  const {
    data: missionItems,
    isLoading,
    error: missionQueryError,
  } = useCollection<any>(missionQuery);

  // Staff-specific client-side fetch (to support multiple uid fields and avoid filtering by status)
  const [staffMemberDocs, setStaffMemberDocs] = useState<any[] | null>(null);
  const [staffMemberLoading, setStaffMemberLoading] = useState(false);
  const [staffError, setStaffError] = useState<any>(null);
  const [staffTasksRefreshKey, setStaffTasksRefreshKey] = useState(0);
  const refreshStaffTasks = () => setStaffTasksRefreshKey((k) => k + 1);
  const [staffMissionDataById, setStaffMissionDataById] = useState<
    Record<string, any>
  >({});

  useEffect(() => {
    if (mode !== "staff" || !firestore || !userProfile?.uid) {
      setStaffMemberDocs(null);
      setStaffMemberLoading(false);
      setStaffError(null);
      return;
    }

    setStaffMemberLoading(true);
    setStaffError(null);

    // Real-time subscription on primary field; covers all current member docs
    const q = query(
      collectionGroup(firestore, "members"),
      where("employeeUid", "==", userProfile.uid),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data() as any;
          data.employeeUid =
            data.employeeUid ||
            data.uid ||
            data.userId ||
            data.memberUid ||
            null;
          return { id: d.id, ...data };
        });
        setStaffMemberDocs(items);
        setStaffMemberLoading(false);
      },
      (err) => {
        console.error("Staff member docs snapshot error:", err);
        setStaffError(err);
        setStaffMemberLoading(false);
      },
    );

    return () => unsubscribe();
  }, [mode, firestore, userProfile?.uid]);

  // Fetch parent mission docs for staff member list to resolve destination fields
  useEffect(() => {
    if (mode !== "staff" || !firestore || !staffMemberDocs?.length) {
      setStaffMissionDataById({});
      return;
    }
    const missionIds = Array.from(
      new Set(staffMemberDocs.map((m) => m.missionId).filter(Boolean)),
    );
    if (!missionIds.length) return;
    Promise.all(
      missionIds.map(async (missionId) => {
        try {
          const snap = await getDoc(
            doc(firestore, "business_trip_missions", missionId),
          );
          return [missionId, snap.exists() ? snap.data() : null] as const;
        } catch {
          return [missionId, null] as const;
        }
      }),
    ).then((entries) =>
      setStaffMissionDataById(
        Object.fromEntries(entries.filter(([, v]) => v !== null)),
      ),
    );
  }, [mode, firestore, staffMemberDocs]);

  // Keep selectedMember in sync with live staffMemberDocs (e.g. after tracking update)
  useEffect(() => {
    if (!selectedMember?.id || !staffMemberDocs) return;
    const updated = staffMemberDocs.find((m) => m.id === selectedMember.id);
    if (updated && updated !== selectedMember) {
      setSelectedMember(updated as BusinessTripMissionMember);
    }
  }, [staffMemberDocs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync localReportMode from Firestore data only when the selected mission changes identity,
  // not on every Firestore write (which would overwrite the user's mid-session selection).
  useEffect(() => {
    const firestoreMode = selectedMission?.reportMode as string | undefined;
    setLocalReportMode(
      firestoreMode === "individual_report"
        ? "individual_report"
        : "team_report",
    );
  }, [selectedMission?.id]); // intentionally only on mission id change, not every reportMode update

  const missions = useMemo(() => {
    if (mode === "staff") return staffMemberDocs || [];
    if (!missionItems) return [];
    return missionItems as Array<
      BusinessTripMission | BusinessTripMissionMember
    >;
  }, [missionItems, staffMemberDocs, mode]);

  const isLoadingEffective = mode === "staff" ? staffMemberLoading : isLoading;
  const missionQueryErrorEffective =
    mode === "staff" ? staffError : missionQueryError;

  const resetMissionForm = () => {
    setMissionForm({
      missionName: "",
      assignmentNumber: "",
      projectName: "",
      clientName: "",
      tripType: "Sampling",
      destinationCity: "",
      destinationAddress: "",
      startDate: "",
      endDate: "",
      instructionHtml: "",
      instructionText: "",
    });
    setSelectedStaffUids([]);
    setAssignmentLetter(null);
  };

  const calculateDurationDays = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const ms = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  const captureMilestoneGps = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMilestoneGps({ status: "unavailable" });
      return;
    }
    // Clear all stale location data before re-capture
    setMilestoneGps({ status: "capturing" });

    // Query permission status if Permissions API available
    let permStatus = "unknown";
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      permStatus = perm.state; // "granted" | "denied" | "prompt"
    } catch {
      // Permissions API not supported
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const trustLevel = computeTrustLevel(accuracy, "captured");
        const base: MilestoneGps = {
          status: "captured",
          latitude: lat,
          longitude: lng,
          accuracy,
          capturedAt: new Date(),
          trustLevel,
          gpsPermissionStatus: permStatus,
          geocodeStatus: "failed",
        };
        setMilestoneGps(base);

        // Reverse geocode via Nominatim (no API key required)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=id`,
            { headers: { "User-Agent": "HRPEnvironesia/1.0" } },
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address ?? {};
            const road = addr.road || addr.pedestrian || addr.footway || addr.path || "";
            const houseNumber = addr.house_number ? ` No. ${addr.house_number}` : "";
            const streetName = road ? `${road}${houseNumber}` : "";
            const village = addr.village || addr.suburb || addr.neighbourhood || addr.quarter || "";
            const district = addr.city_district || addr.district || addr.subdistrict || addr.municipality || "";
            const city = addr.city || addr.town || addr.county || addr.regency || "";
            const province = addr.state || addr.province || "";
            const postalCode = addr.postcode || "";
            const country = addr.country || "";
            const parts = [streetName, village, district, city, province, postalCode, country].filter(Boolean);
            const addressText = data.display_name || parts.join(", ");
            setMilestoneGps({
              ...base,
              addressText,
              streetName: streetName || undefined,
              village: village || undefined,
              district: district || undefined,
              city: city || undefined,
              province: province || undefined,
              postalCode: postalCode || undefined,
              country: country || undefined,
              geocodeStatus: "success",
            });
          }
        } catch {
          // keep base (geocodeStatus: "failed") — coordinates still saved
        }
      },
      () => setMilestoneGps({ status: "unavailable" }),
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  const resetMilestoneEvidence = () => {
    setMilestoneGps({ status: "idle" });
    setMilestoneNote("");
    setMilestonePhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
    setMilestoneManualLocation("");
  };

  const appendTimelineEntry = async (
    missionId: string,
    message: string,
    category: "tracking" | "approval" | "system" = "system",
    meta?: Record<string, any>,
  ) => {
    if (!firestore || !missionId) return;
    try {
      const timelineCollection = getMissionTimelineCollection(missionId);
      if (!timelineCollection) return;
      await addDoc(timelineCollection, {
        message,
        category,
        createdAt: serverTimestamp(),
        byUid: userProfile?.uid || null,
        byName: userProfile?.fullName || null,
        ...(meta ?? {}),
      });
    } catch (error) {
      console.warn("Gagal menambahkan timeline misi", error);
    }
  };

  const findUserNameByUid = async (uid?: string | null) => {
    if (!firestore || !uid) return null;

    const userSnap = await getDoc(doc(firestore, "users", uid));
    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      return data.fullName || data.email || null;
    }

    return null;
  };

  const fetchMasterDivision = async (
    brandId?: string | null,
    divisionId?: string | null,
  ) => {
    if (!firestore || !brandId || !divisionId) return null;
    try {
      const snap = await getDoc(
        doc(firestore, "brands", brandId, "divisions", divisionId),
      );
      return snap.exists() ? (snap.data() as any) : null;
    } catch (err) {
      console.warn("Failed to fetch master division", brandId, divisionId, err);
      return null;
    }
  };

  const resolveApproverForStaff = async (staff: UserProfile) => {
    const employeeProfile =
      (employeeProfilesData || []).find((p: any) => p.uid === staff.uid) ||
      null;

    const masterDiv = await fetchMasterDivision(
      (employeeProfile as any)?.brandId || (staff as any).brandId || null,
      (employeeProfile as any)?.divisionId || (staff as any).divisionId || null,
    );

    // NO FALLBACK to old field values - only use master org resolution
    if (!masterDiv) {
      throw new Error(
        `Struktur organisasi tidak ditemukan untuk ${staff.fullName}. Periksa divisi dan brand.`,
      );
    }

    const isDivisionManager =
      (employeeProfile as any)?.isDivisionManager ||
      (staff as any).isDivisionManager ||
      (staff as any).structuralLevel === "division_manager" ||
      (staff as any).structuralPosition === "division_manager";

    let approvalTargetUid: string | null = null;
    let approvalTargetName: string | null = null;
    let approvalLevel: "director" | "division_manager" = "division_manager";

    if (isDivisionManager) {
      // Division Manager -> their supervisor
      approvalTargetUid =
        masterDiv.managerDirectSupervisorId ||
        masterDiv.managerDirectSupervisorUid ||
        null;
      approvalTargetName = masterDiv.managerDirectSupervisorName || null;
      approvalLevel = "director";
    } else {
      // Regular staff -> division manager
      approvalTargetUid = masterDiv.managerId || masterDiv.managerUid || null;
      approvalTargetName = masterDiv.managerName || null;
      approvalLevel = "division_manager";
    }

    if (!approvalTargetUid || !approvalTargetName) {
      throw new Error(
        `Struktur organisasi belum lengkap untuk ${staff.fullName}. Manager atau atasan tidak diatur di master organisasi.`,
      );
    }

    if (approvalTargetUid === staff.uid) {
      throw new Error(
        `${staff.fullName} tidak boleh menjadi approver untuk dirinya sendiri.`,
      );
    }

    const approverRole =
      approvalLevel === "director" ? "director" : "manager_division";

    return {
      approvalTargetUid,
      approvalTargetName,
      approvalLevel,
      approverRole,
      employeeProfile,
    };
  };

  const findManagerForStaff = async (staff: UserProfile) => {
    const employeeProfile =
      (employeeProfilesData || []).find((p: any) => p.uid === staff.uid) ||
      null;

    const masterDiv2 = await fetchMasterDivision(
      (employeeProfile as any)?.brandId || (staff as any).brandId || null,
      (employeeProfile as any)?.divisionId || (staff as any).divisionId || null,
    );
    const approval = resolveApprovalTarget(employeeProfile, staff, masterDiv2);
    const directSupervisorUid =
      (employeeProfile as any)?.directSupervisorUid ||
      (staff as any).directSupervisorUid ||
      (employeeProfile as any)?.managerUid ||
      (staff as any).managerUid ||
      null;

    const managerUid =
      approval.approvalTargetUid && approval.approvalTargetUid !== staff.uid
        ? approval.approvalTargetUid
        : directSupervisorUid && directSupervisorUid !== staff.uid
          ? directSupervisorUid
          : null;

    if (!firestore || !managerUid) return null;

    const managerSnap = await getDoc(doc(firestore, "users", managerUid));
    if (!managerSnap.exists()) return null;

    return managerSnap.data() as UserProfile;
  };

  const loadMissionDetail = async (missionId: string) => {
    if (!firestore || !missionId) return;
    setMissionDetailError(null);
    try {
      const missionRef = getBusinessTripMissionDoc(missionId);
      if (!missionRef) return;
      const missionSnap = await getDoc(missionRef);
      if (!missionSnap.exists()) {
        setSelectedMission(null);
        return;
      }
      setSelectedMission({
        id: missionId,
        ...(missionSnap.data() as BusinessTripMission),
      });
      // Members and timeline are kept real-time via onSnapshot subscriptions
      // that depend on selectedMission?.id — no extra getDocs needed here.
    } catch (error: any) {
      console.error("Gagal memuat detail misi", {
        missionId,
        uid: userProfile?.uid,
        role: userProfile?.role,
        jobTitle: userProfile?.jobTitle || userProfile?.positionTitle,
        structuralLevel: userProfile?.structuralLevel,
        error,
      });
      setMissionDetailError(
        "Anda tidak memiliki akses atau rules belum mengizinkan membaca detail perjalanan dinas.",
      );
      setSelectedMission(null);
      setMissionMembers([]);
      setMissionTimeline([]);
    }
  };

  const loadRepairRequests = async (missionId: string, memberUid: string, memberName?: string) => {
    if (!firestore || !missionId || !memberUid) return;
    try {
      const evidencesRef = collection(firestore, "business_trip_missions", missionId, "milestone_evidences");
      // Query for all evidence with repairStatus = "requested"
      const q = query(
        evidencesRef,
        where("repairStatus", "==", "requested"),
      );
      const snapshotUnsubscribe = onSnapshot(q, (snap) => {
        const repairs = snap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          } as MilestoneEvidence))
          .filter((repair) => {
            // Filter untuk evidence yang relevant untuk current user
            const targetUids = repair.targetMemberUids || [];
            const targetNames = repair.targetMemberNames || [];

            // Include jika:
            // 1. targetMemberUids contains current user
            // 2. OR targetMemberUids kosong dan targetMemberNames kosong (untuk mission member)
            // 3. OR targetMemberNames contains current user name
            return (
              targetUids.includes(memberUid) ||
              (targetUids.length === 0 && targetNames.length === 0) ||
              (memberName && targetNames.includes(memberName))
            );
          });
        setRepairRequests(repairs);
      });
      return snapshotUnsubscribe;
    } catch (error) {
      console.error("Gagal load repair requests:", error);
      setRepairRequests([]);
    }
  };

  const syncMissionStatus = async (missionId: string) => {
    if (!firestore || !missionId) return;
    const membersCollection = getMissionMembersCollection(missionId);
    if (!membersCollection) return;
    const membersSnap = await getDocs(membersCollection);
    const members = membersSnap.docs.map(
      (m) => m.data() as BusinessTripMissionMember,
    );
    const activeMembers = members.filter(
      (m) =>
        (m.memberStatus as string) !== "archived" &&
        (m.memberStatus as string) !== "cancelled" &&
        (m.memberStatus as string) !== "rejected",
    );
    const totalMembers = activeMembers.length;

    // Count per-member (not per-manager-group)
    const managerApprovedCount = activeMembers.filter(
      (m) =>
        (m.managerValidationStatus as string) === "approved_by_manager" ||
        (m.approvalStatus as string) === "approved" ||
        (m.approvalStatus as string) === "validated_by_assigner",
    ).length;

    const staffConfirmedCount = activeMembers.filter(
      (m) => m.staffConfirmationStatus === "confirmed_by_staff",
    ).length;

    const allApproved =
      totalMembers === 0 || managerApprovedCount === totalMembers;
    const allConfirmed =
      totalMembers === 0 || staffConfirmedCount === totalMembers;
    const anyOnDuty = activeMembers.some((m) => m.memberStatus === "on_duty");
    const allReturned =
      activeMembers.length > 0 &&
      activeMembers.every((m) => m.memberStatus === "returned");
    const allReported =
      activeMembers.length > 0 &&
      activeMembers.every((m) => m.reportStatus === "submitted");

    const missionRef = getBusinessTripMissionDoc(missionId);
    if (!missionRef) return;
    const missionSnap = await getDoc(missionRef);
    if (!missionSnap.exists()) return;
    const currentStatus = missionSnap.data()?.status as MissionStatus;

    // Don't downgrade terminal statuses
    const TERMINAL: string[] = [
      "on_duty",
      "returned_pending_report",
      "report_submitted",
      "completed",
    ];
    let nextStatus: string = currentStatus;

    if (allReported) {
      nextStatus = "report_submitted";
    } else if (allReturned) {
      nextStatus = "returned_pending_report";
    } else if (anyOnDuty) {
      nextStatus = "on_duty";
    } else if (!TERMINAL.includes(currentStatus)) {
      if (allApproved && allConfirmed) {
        nextStatus = "ready_to_depart";
      } else if (allApproved) {
        nextStatus = "waiting_staff_confirmation";
      } else {
        nextStatus = "pending_manager_validation";
      }
    }

    await updateDoc(missionRef, {
      managerApprovedCount,
      staffConfirmedCount,
      memberCount: totalMembers,
      totalMembers,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  };

  const handleCreateMission = async () => {
    if (!firestore || !userProfile) return;
    if (!assignmentLetter) {
      return toast({
        variant: "destructive",
        title: "Upload Surat Tugas/SPD wajib.",
      });
    }
    if (
      !missionForm.missionName ||
      !missionForm.clientName ||
      !missionForm.destinationCity ||
      !missionForm.startDate ||
      !missionForm.endDate ||
      !missionForm.instructionText
    ) {
      return toast({
        variant: "destructive",
        title: "Lengkapi semua informasi misi dinas.",
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
      const staffRecords = allStaff.filter((staff) =>
        selectedStaffUids.includes(staff.uid),
      );

      const approverMap = new Map<
        string,
        {
          approverUid: string;
          approverName: string;
          level: "division_manager" | "director";
        }
      >();

      for (const staff of staffRecords) {
        const approvalTarget = await determineApprovalTarget(
          firestore,
          {
            isDivisionManager: staff.isDivisionManager,
            brandId: staff.brandId,
            divisionId: staff.divisionId,
            employeeUid: staff.uid,
            fullName: staff.fullName,
          },
          userProfile.uid,
          userProfile.fullName || "",
        );
        approverMap.set(staff.uid, approvalTarget);
      }

      const filePath = assignmentLetter
        ? `business_trip_missions/${userProfile.uid}/${Date.now()}_${assignmentLetter.name}`
        : null;
      let uploadResult: any = null;
      let uploadError: any = null;
      if (assignmentLetter && filePath) {
        try {
          uploadResult = await uploadFile(
            assignmentLetter,
            filePath,
            userProfile.uid,
            { compress: false },
          );
        } catch (err: any) {
          uploadError = err;
          console.warn("SPD upload failed, continuing mission create:", err);
          toast({
            variant: "default",
            title: "Perjalanan Dinas dibuat (dokumen gagal diupload)",
            description:
              "Perjalanan dinas berhasil dibuat, tetapi dokumen SPD gagal diupload. Silakan upload ulang di menu edit.",
          });
        }
      }
      const missionCollection = getBusinessTripMissionCollection();
      if (!missionCollection) throw new Error("Firestore tidak siap.");
      const missionRef = doc(missionCollection);
      const durationDays = calculateDurationDays(
        missionForm.startDate,
        missionForm.endDate,
      );
      const assignmentNumber =
        missionForm.assignmentNumber || `SPD-${Date.now()}`;

      const assignedStaffUids = staffRecords.map((staff) => staff.uid);
      const assignedManagerUids = Array.from(
        new Set(
          Array.from(approverMap.values())
            .map((item) => item.approverUid)
            .filter(Boolean),
        ),
      );
      await setDoc(missionRef, {
        missionName: missionForm.missionName,
        assignmentNumber,
        assignmentLetterUrl: uploadResult?.downloadUrl || null,
        assignmentLetterFileName:
          uploadResult?.fileName || assignmentLetter?.name || null,
        documentStatus: uploadError ? "upload_failed" : "ok",
        documentError: uploadError
          ? uploadError?.message || String(uploadError)
          : null,
        assignedByUid: userProfile.uid,
        assignedByName: userProfile.fullName,
        assignedByPosition: userProfile.positionTitle || userProfile.role,
        projectName: missionForm.projectName,
        clientName: missionForm.clientName,
        tripType: missionForm.tripType,
        destinationCity: missionForm.destinationCity,
        destinationAddress: missionForm.destinationAddress,
        startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
        endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
        durationDays,
        instructionNote: missionForm.instructionHtml,
        instructionHtml: missionForm.instructionHtml,
        instructionText:
          missionForm.instructionText || stripHtml(missionForm.instructionHtml),
        assignedStaffUids,
        assignedStaffCount: assignedStaffUids.length,
        totalMembers: assignedStaffUids.length,
        managerApprovedCount: 0,
        staffConfirmedCount: 0,
        managerUids: assignedManagerUids,
        // initial member/approval counters - will be updated after subcollections are created
        memberUids: assignedStaffUids,
        memberCount: assignedStaffUids.length,
        pendingConfirmationCount: assignedStaffUids.length,
        approvalTargetUids: [],
        approvalRequestCount: 0,
        pendingApprovalCount: 0,
        status: "pending_manager_validation",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const approvalGroups = new Map<
        string,
        {
          approverName: string;
          approverRole: string;
          approvalLevel: string;
          memberUids: string[];
          memberNames: string[];
        }
      >();

      const memberDocs: BusinessTripMissionMember[] = [];

      await Promise.all(
        staffRecords.map(async (staff) => {
          const approver = approverMap.get(staff.uid)!;
          const membersCollection = getMissionMembersCollection(missionRef.id);
          if (!membersCollection) throw new Error("Firestore tidak siap.");

          const approvalTargetUid = approver.approverUid;
          const approvalTargetName = approver.approverName;

          // Never auto-validate: always require explicit approval through approval_requests
          const validatedByAssigner = false;

          // write member document with employee UID as doc ID
          const memberDocRef = getMissionMemberDoc(missionRef.id, staff.uid);
          if (!memberDocRef) throw new Error("Firestore tidak siap.");

          const memberData: BusinessTripMissionMember = {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeePosition: staff.jobTitle || "-",
            employeeType: staff.employeeType || "",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || "-",
            managerUid: approvalTargetUid || undefined,
            managerName: approvalTargetName || undefined,
            approvalTargetUid: approvalTargetUid || undefined,
            approvalTargetName: approvalTargetName || undefined,
            approvalLevel: approver.level,
            isDivisionManager: approver.level === "director",
            requiresApproval: !!approvalTargetUid && !validatedByAssigner,
            approvalStatus: validatedByAssigner
              ? "validated_by_assigner"
              : "pending",
            staffConfirmationStatus: "waiting_staff_confirmation",
            memberStatus: validatedByAssigner
              ? "validated_by_assigner"
              : "waiting_manager_validation",
            startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
            endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
            durationDays,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          memberDocs.push(memberData);
          await setDoc(memberDocRef, memberData);

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

          if (validatedByAssigner) return;

          if (approvalTargetUid) {
            const existing = approvalGroups.get(approvalTargetUid);
            if (!existing) {
              approvalGroups.set(approvalTargetUid, {
                approverName: approvalTargetName,
                approverRole:
                  approver.level === "division_manager"
                    ? "manager_division"
                    : "director",
                approvalLevel: approver.level,
                memberUids: [staff.uid],
                memberNames: [staff.fullName],
              });
            } else {
              existing.memberUids.push(staff.uid);
              existing.memberNames.push(staff.fullName);
            }
          }
        }),
      );

      const approvalsCollection = collection(
        firestore,
        "business_trip_missions",
        missionRef.id,
        "approval_requests",
      );

      for (const [approverUid, entry] of Array.from(approvalGroups.entries())) {
        const approvalRef = doc(approvalsCollection, approverUid);
        await setDoc(approvalRef, {
          missionId: missionRef.id,
          missionName: missionForm.missionName,
          approverUid,
          approverName: entry.approverName,
          approverRole: entry.approverRole,
          approvalLevel: entry.approvalLevel,
          memberUids: Array.from(new Set(entry.memberUids)),
          memberNames: Array.from(new Set(entry.memberNames)),
          status: "pending",
          notes: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Verify approval_request was created
        const verifyRef = doc(
          firestore,
          "business_trip_missions",
          missionRef.id,
          "approval_requests",
          approverUid,
        );
        const verifySnap = await getDoc(verifyRef);
        if (!verifySnap.exists()) {
          throw new Error(
            `CRITICAL: Approval request untuk approver ${approverUid} (${entry.approverName}) tidak tersimpan di Firestore. Operasi batch mungkin gagal.`,
          );
        }

        // Notify approver
        try {
          const notifRef = doc(
            collection(firestore, "users", approverUid, "notifications"),
          );
          await setDoc(notifRef, {
            type: "business_trip_approval_request",
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            approverUid,
            createdAt: serverTimestamp(),
            read: false,
            byUid: userProfile.uid,
            byName: userProfile.fullName,
          });
        } catch (e) {
          console.warn("Notify approver failed", e);
        }
      }

      const approvalTargetUids = Array.from(approvalGroups.keys());
      // Determine final mission status: if there are approvals required, pending_manager_validation, else waiting_staff_confirmation
      const initialStatus =
        approvalTargetUids.length > 0
          ? "pending_manager_validation"
          : "waiting_staff_confirmation";

      await updateDoc(missionRef, {
        approvalTargetUids,
        approvalRequestCount: approvalGroups.size,
        pendingApprovalCount: approvalGroups.size,
        memberUids: assignedStaffUids,
        memberCount: assignedStaffUids.length,
        pendingConfirmationCount: assignedStaffUids.length,
        status: initialStatus,
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
        Array.from(approvalGroups.entries()).map(([approverUid, entry]) => ({
          approverUid: approverUid.substring(0, 8) + "...",
          approverName: entry.approverName,
          approvalLevel: entry.approvalLevel,
          memberCount: entry.memberUids.length,
          memberNames: entry.memberNames.join(", ").substring(0, 80),
          status: "pending",
        })),
      );

      await appendTimelineEntry(
        missionRef.id,
        "Misi Dinas dibuat dan dikirim ke manager divisi masing-masing staff.",
        "system",
      );
      resetMissionForm();
      setSelectedMission(null);
      toast({
        title: "Misi Dinas berhasil dibuat",
        description: "Staff dan manager telah diberi notifikasi.",
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal membuat misi dinas",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectItem = async (item: any) => {
    if (!firestore) return;
    if (item?.missionId) {
      const member = item as BusinessTripMissionMember;
      setSelectedMember(member);
      await loadMissionDetail(member.missionId);
      return;
    }

    const mission = item as BusinessTripMission;
    if (!mission.id) return;
    setSelectedMember(null);
    await loadMissionDetail(mission.id);
  };

  const updateMissionWithStatus = async (
    missionId: string,
    status: MissionStatus,
  ) => {
    if (!firestore || !missionId) return;
    const missionRef = getBusinessTripMissionDoc(missionId);
    if (!missionRef) return;
    await updateDoc(missionRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  };

  const handleManagerDecision = async (
    member: BusinessTripMissionMember,
    decision: "approve" | "replace" | "reject",
  ) => {
    if (!firestore || !userProfile || !member.missionId || !member.id) return;
    if (member.employeeUid === userProfile.uid) {
      return toast({
        variant: "destructive",
        title: "Anda tidak bisa memvalidasi diri sendiri.",
        description:
          "Konfirmasi keikutsertaan Anda dilakukan sebagai anggota, bukan sebagai validator diri sendiri.",
      });
    }
    if ((decision === "replace" || decision === "reject") && !actionNote) {
      return toast({ variant: "destructive", title: "Alasan wajib diisi." });
    }

    setIsSaving(true);
    try {
      const memberRef = getMissionMemberDoc(member.missionId, member.id);
      if (!memberRef) return;
      const statusMap: Record<string, MemberStatus> = {
        approve: "approved_by_manager",
        replace: "replacement_requested",
        reject: "rejected_by_manager",
      };
      await updateDoc(memberRef, {
        managerValidationStatus: statusMap[decision],
        managerValidationNote: actionNote || null,
        managerReplacementSuggestion: replacementSuggestion || null,
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `Manager ${decision === "approve" ? "menyetujui" : decision === "replace" ? "meminta ganti anggota" : "menolak"} untuk ${member.employeeName}.`,
        "approval",
      );
      await syncMissionStatus(member.missionId);
      toast({ title: "Keputusan disimpan." });
      setActionNote("");
      setReplacementSuggestion("");
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal menyimpan keputusan",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStaffConfirmation = async (
    member: BusinessTripMissionMember,
    approved: boolean,
  ) => {
    if (!firestore || !userProfile || !member.missionId || !member.id) return;
    setIsSaving(true);
    try {
      const memberRef = getMissionMemberDoc(member.missionId, member.id);
      if (!memberRef) return;
      const confirmResult = approved
        ? "confirmed_by_staff"
        : "declined_by_staff";
      console.log("updating member path", memberRef.path);
      await updateDoc(memberRef, {
        staffConfirmationStatus: confirmResult,
        confirmationStatus: confirmResult,
        confirmedAt: serverTimestamp(),
        confirmedByUid: userProfile.uid,
        confirmedByName: userProfile.fullName || userProfile.email || null,
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        approved
          ? `${member.employeeName} mengkonfirmasi kesiapan misi.`
          : `${member.employeeName} menyatakan tidak bisa ikut misi.`,
        "approval",
      );
      toast({ title: "Konfirmasi staff tersimpan." });
      setTechnicalForm({
        contactDuringTrip: "",
        staffConfirmationNote: "",
      });
      refreshStaffTasks();
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal mengirim konfirmasi",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleHrdFinalize = async (mission: BusinessTripMission) => {
    if (!firestore || !userProfile || !mission.id || !selectedMission) return;
    const allApproved = missionMembers.every(
      (member) => member.managerValidationStatus === "approved_by_manager",
    );
    const allConfirmed = missionMembers.every(
      (member) => member.staffConfirmationStatus === "confirmed_by_staff",
    );
    if (!allApproved || !allConfirmed) {
      return toast({
        variant: "destructive",
        title: "Semua manager dan staff harus menyetujui terlebih dahulu.",
      });
    }
    setIsSaving(true);
    try {
      await updateMissionWithStatus(mission.id!, "approved_ready_to_depart");
      await appendTimelineEntry(
        mission.id!,
        "HRD menyelesaikan finalisasi administrasi.",
        "system",
      );
      toast({ title: "Finalisasi selesai." });
      await loadMissionDetail(mission.id!);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal finalisasi",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDepart = async (member: BusinessTripMissionMember) => {
    if (!firestore || !selectedMission || !member.missionId || !member.id)
      return;
    if (selectedMission.status !== "approved_ready_to_depart") {
      return toast({
        variant: "destructive",
        title: "HRD belum memfinalisasi misi.",
      });
    }
    setIsSaving(true);
    try {
      const memberRef = getMissionMemberDoc(member.missionId, member.id);
      if (!memberRef) return;
      await updateDoc(memberRef, {
        memberStatus: "on_duty",
        actualDepartureAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `${member.employeeName} mulai berangkat.`,
        "tracking",
      );
      await syncMissionStatus(member.missionId);
      toast({ title: "Check-in berhasil." });
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal check-in",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturn = async (member: BusinessTripMissionMember) => {
    if (!firestore || !member.missionId || !member.id) return;
    setIsSaving(true);
    try {
      const memberRef = getMissionMemberDoc(member.missionId, member.id);
      if (!memberRef) return;
      await updateDoc(memberRef, {
        memberStatus: "returned",
        actualReturnAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `${member.employeeName} menyelesaikan perjalanan dan pulang.`,
        "tracking",
      );
      await syncMissionStatus(member.missionId);
      toast({ title: "Check-out berhasil." });
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal check-out",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTripMilestone = async (
    member: BusinessTripMissionMember,
    milestone:
      | "departed"
      | "arrived"
      | "activity_done"
      | "returned"
      | "issue_reported",
    issueOpts?: {
      issueCategory?: string;
      issueUrgency?: string;
      issueNote?: string;
    },
  ) => {
    if (!firestore || !userProfile || !member.missionId || !member.id) return;
    setIsSaving(true);
    try {
      const memberRef = getMissionMemberDoc(member.missionId, member.id);
      if (!memberRef) return;

      const now = new Date();
      const nowDate = format(now, "dd MMM yyyy", { locale: idLocale });
      const nowTime = format(now, "HH:mm", { locale: idLocale });

      const updateData: Record<string, any> = {
        memberTripStatus: milestone,
        lastTripUpdateAt: serverTimestamp(),
        lastTripUpdateByUid: userProfile.uid,
        lastTripUpdateByName: userProfile.fullName || userProfile.email || "",
        updatedAt: serverTimestamp(),
      };

      let timelineMsg = "";

      if (milestone === "departed") {
        updateData.departedAt = serverTimestamp();
        updateData.actualDepartureAt = serverTimestamp();
        updateData.memberStatus = "on_duty";
        timelineMsg = `${member.employeeName} berangkat pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "arrived") {
        updateData.arrivedAt = serverTimestamp();
        timelineMsg = `${member.employeeName} sampai lokasi pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "activity_done") {
        updateData.activityDoneAt = serverTimestamp();
        timelineMsg = `${member.employeeName} menyelesaikan kegiatan pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "returned") {
        updateData.returnedAt = serverTimestamp();
        updateData.actualReturnAt = serverTimestamp();
        updateData.memberStatus = "returned";
        timelineMsg = `${member.employeeName} sudah kembali pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "issue_reported") {
        updateData.issueNote = issueOpts?.issueNote || "";
        updateData.issueCategory = issueOpts?.issueCategory || "";
        updateData.issueUrgency = issueOpts?.issueUrgency || "";
        updateData.issueAt = serverTimestamp();
        const urgencyLabel = issueOpts?.issueUrgency
          ? ` [urgensi: ${issueOpts.issueUrgency}]`
          : "";
        const cat = issueOpts?.issueCategory
          ? ` — kategori: ${issueOpts.issueCategory}`
          : "";
        timelineMsg = `${member.employeeName} melaporkan kendala${cat}${urgencyLabel}: ${issueOpts?.issueNote || "(tidak ada catatan)"}.`;
      }

      await updateDoc(memberRef, updateData);
      if (timelineMsg)
        await appendTimelineEntry(member.missionId, timelineMsg, "tracking");
      // Do NOT call syncMissionStatus here — staff cannot update the parent mission doc.
      // Mission status is derived on the fly from member tracking data.

      toast({ title: "Status perjalanan diperbarui." });
      setShowIssueInput(false);
      setIssueForm({ category: "", urgency: "", note: "", attachment: null });
      refreshStaffTasks();
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal memperbarui status",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk-update multiple members for the same milestone in one operation
  const handleGroupTripMilestone = async (
    missionId: string,
    members: BusinessTripMissionMember[],
    milestone:
      | "departed"
      | "arrived"
      | "activity_done"
      | "returned"
      | "issue_reported",
    issueOpts?: {
      issueCategory?: string;
      issueUrgency?: string;
      issueNote?: string;
    },
    evidenceOpts?: {
      latitude?: number;
      longitude?: number;
      locationAccuracy?: number;
      locationCapturedAt?: Date;
      locationStatus: "captured" | "unavailable" | "manual";
      addressText?: string;
      streetName?: string;
      village?: string;
      district?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      country?: string;
      geocodeStatus?: "success" | "failed";
      locationTrustLevel?: "high" | "medium" | "low";
      gpsPermissionStatus?: string;
      deviceTimestamp?: string;
      userAgent?: string;
      manualLocationNote?: string;
      note?: string;
      photos?: File[];
    },
  ) => {
    if (!firestore || !userProfile || members.length === 0) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const nowDate = format(now, "dd MMM yyyy", { locale: idLocale });
      const nowTime = format(now, "HH:mm", { locale: idLocale });
      const updaterName = userProfile.fullName || userProfile.email || "";
      const memberNames = members.map((m) => m.employeeName).join(", ");

      await Promise.all(
        members.map(async (member) => {
          if (!member.id) return;
          const memberRef = getMissionMemberDoc(missionId, member.id);
          if (!memberRef) return;

          const updateData: Record<string, any> = {
            memberTripStatus: milestone,
            lastTripUpdateAt: serverTimestamp(),
            lastTripUpdateByUid: userProfile.uid,
            lastTripUpdateByName: updaterName,
            updatedAt: serverTimestamp(),
          };

          if (milestone === "departed") {
            updateData.departedAt = serverTimestamp();
            updateData.actualDepartureAt = serverTimestamp();
            updateData.memberStatus = "on_duty";
          } else if (milestone === "arrived") {
            updateData.arrivedAt = serverTimestamp();
          } else if (milestone === "activity_done") {
            updateData.activityDoneAt = serverTimestamp();
          } else if (milestone === "returned") {
            updateData.returnedAt = serverTimestamp();
            updateData.actualReturnAt = serverTimestamp();
            updateData.memberStatus = "returned";
          } else if (milestone === "issue_reported") {
            updateData.issueNote = issueOpts?.issueNote || "";
            updateData.issueCategory = issueOpts?.issueCategory || "";
            updateData.issueUrgency = issueOpts?.issueUrgency || "";
            updateData.issueAt = serverTimestamp();
          }

          await updateDoc(memberRef, updateData);
        }),
      );

      // Save milestone evidence (location + photos to Google Drive)
      let savedPhotosCount = 0;
      let savedEvidenceId: string | null = null;
      let uploadedPhotos: Array<any> = [];

      if (evidenceOpts && milestone !== "issue_reported") {
        // 1. Upload photos to Google Drive
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        const photosToUpload = evidenceOpts.photos ?? [];

        // Validate: photo wajib ada
        if (photosToUpload.length === 0) {
          return toast({
            variant: "destructive",
            title: "Foto bukti milestone wajib dipilih",
            description: `Pilih minimal 1 foto untuk ${getEvidenceType(milestone)}`,
          });
        }

        // Upload each photo to Google Drive
        for (const photoFile of photosToUpload) {
          try {
            const compressed = await compressMilestoneImage(photoFile);
            const storagePath = `milestone_evidence/${missionId}/${userProfile.uid}/${milestone}_${Date.now()}_${uploadedPhotos.length}.jpg`;
            const result = await uploadFile(compressed, storagePath, userProfile.uid, {
              compress: false,
              category: "business_trip_spd",
              ownerUid: userProfile.uid,
            });

            // Normalize upload result (supports both Google Drive and Firebase Storage)
            uploadedPhotos.push({
              // Google Drive fields
              driveFileId: result.fileId ?? null,
              url: result.webViewLink ?? result.viewUrl ?? result.downloadUrl ?? null,
              downloadUrl: result.downloadUrl ?? null,
              directViewUrl: result.directViewUrl ?? null,
              thumbnailUrl: result.thumbnailUrl ?? null,
              // General fields
              storageProvider: result.storageProvider ?? "firebaseStorage",
              name: result.originalFileName ?? photoFile.name,
              size: result.finalSize ?? compressed.size,
              uploadedAt: result.uploadedAt ?? serverTimestamp(),
              expiresAt: expiresAt,
              // Fallback for compatibility
              photoUrl: result.webViewLink ?? result.viewUrl ?? result.downloadUrl ?? null,
              photoPath: result.fileId ?? storagePath,
            });
          } catch (uploadErr: any) {
            console.error("Gagal upload foto bukti milestone:", uploadErr);
            return toast({
              variant: "destructive",
              title: "Gagal upload foto bukti",
              description: uploadErr?.message || "Coba lagi",
            });
          }
        }

        savedPhotosCount = uploadedPhotos.length;
        console.log("upload milestone photo result", uploadedPhotos);

        // 2. Save evidence to Firestore (only if photos uploaded successfully)
        if (uploadedPhotos.length === 0) {
          return toast({
            variant: "destructive",
            title: "Tidak ada foto yang berhasil diupload",
          });
        }

        try {
          const evidencePayload = {
            milestoneType: milestone,
            evidenceType: getEvidenceType(milestone),
            confirmedByUid: userProfile.uid,
            confirmedByName: updaterName,
            targetMemberUids: members.map((m) => m.employeeUid),
            targetMemberNames: members.map((m) => m.employeeName),
            createdAt: serverTimestamp(),
            latitude: evidenceOpts.latitude ?? null,
            longitude: evidenceOpts.longitude ?? null,
            locationAccuracy: evidenceOpts.locationAccuracy ?? null,
            locationCapturedAt: evidenceOpts.locationCapturedAt
              ? Timestamp.fromDate(evidenceOpts.locationCapturedAt)
              : null,
            locationStatus: evidenceOpts.locationStatus,
            locationTrustLevel: evidenceOpts.locationTrustLevel ?? null,
            gpsPermissionStatus: evidenceOpts.gpsPermissionStatus ?? null,
            deviceTimestamp: evidenceOpts.deviceTimestamp ?? null,
            userAgent: evidenceOpts.userAgent ?? null,
            addressText: evidenceOpts.addressText || null,
            streetName: evidenceOpts.streetName || null,
            village: evidenceOpts.village || null,
            district: evidenceOpts.district || null,
            city: evidenceOpts.city || null,
            province: evidenceOpts.province || null,
            postalCode: evidenceOpts.postalCode || null,
            country: evidenceOpts.country || null,
            geocodeStatus: evidenceOpts.geocodeStatus || null,
            manualLocationNote: evidenceOpts.manualLocationNote || null,
            note: evidenceOpts.note || null,
            photos: uploadedPhotos,
          };

          console.log("saving milestone evidence payload", evidencePayload);

          const evidenceCol = collection(firestore, "business_trip_missions", missionId, "milestone_evidences");
          const evidenceDocRef = await addDoc(evidenceCol, evidencePayload);
          savedEvidenceId = evidenceDocRef.id;

          console.log("✅ Milestone evidence saved:", { evidenceId: savedEvidenceId, photosCount: uploadedPhotos.length });
        } catch (evidenceErr: any) {
          console.error("Gagal menyimpan bukti milestone:", evidenceErr);
          return toast({
            variant: "destructive",
            title: "Gagal menyimpan bukti milestone",
            description: evidenceErr?.message || "Coba lagi",
          });
        }
      }

      // One consolidated timeline entry for the whole group
      let timelineMsg = "";
      let timelineTrustLevel: "high" | "medium" | "low" | null = null;

      if (milestone === "departed") {
        timelineMsg = `${updaterName} mengonfirmasi keberangkatan untuk: ${memberNames} pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "arrived") {
        timelineMsg = `${updaterName} mengonfirmasi tiba di lokasi untuk: ${memberNames} pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "activity_done") {
        timelineMsg = `${updaterName} mengonfirmasi kegiatan selesai untuk: ${memberNames} pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "returned") {
        timelineMsg = `${updaterName} mengonfirmasi kembali untuk: ${memberNames} pada ${nowDate} pukul ${nowTime}.`;
      } else if (milestone === "issue_reported") {
        const cat = issueOpts?.issueCategory
          ? ` — kategori: ${issueOpts.issueCategory}`
          : "";
        const urgency = issueOpts?.issueUrgency
          ? ` [urgensi: ${issueOpts.issueUrgency}]`
          : "";
        timelineMsg = `${updaterName} melaporkan kendala untuk: ${memberNames}${cat}${urgency}: ${issueOpts?.issueNote || "(tidak ada catatan)"} pada ${nowDate} pukul ${nowTime}.`;
      }

      // Build timeline metadata — location/photos stored as fields only, NOT in message text
      if (evidenceOpts && milestone !== "issue_reported") {
        timelineTrustLevel = evidenceOpts.locationTrustLevel ?? null;
      }

      if (timelineMsg) {
        const timelineMeta: Record<string, any> = {
          ...(timelineTrustLevel ? { trustLevel: timelineTrustLevel } : {}),
          ...(savedEvidenceId ? { evidenceId: savedEvidenceId } : {}),
        };

        // Embed evidence data directly so HRD/Director can read without milestone_evidences access
        if (evidenceOpts && milestone !== "issue_reported" && uploadedPhotos.length > 0) {
          timelineMeta.milestoneType = milestone;
          timelineMeta.confirmedByName = updaterName;
          timelineMeta.confirmedByUid = userProfile.uid;
          timelineMeta.targetMemberNames = members.map((m) => m.employeeName);
          timelineMeta.targetMemberUids = members.map((m) => m.employeeUid);
          if (evidenceOpts.latitude != null) {
            timelineMeta.evidenceLat = evidenceOpts.latitude;
            timelineMeta.evidenceLng = evidenceOpts.longitude ?? null;
            timelineMeta.evidenceAccuracy = evidenceOpts.locationAccuracy ?? null;
            timelineMeta.evidenceAddress = evidenceOpts.addressText ?? null;
          }
          timelineMeta.evidenceLocationStatus = evidenceOpts.locationStatus;
          timelineMeta.evidenceLocationTrust = evidenceOpts.locationTrustLevel ?? null;
          if (evidenceOpts.manualLocationNote) {
            timelineMeta.evidenceManualNote = evidenceOpts.manualLocationNote;
          }
          // Embed photo URLs (support both Google Drive and Firebase Storage)
          timelineMeta.evidencePhotos = uploadedPhotos.map((p) => ({
            photoUrl: p.url ?? p.photoUrl ?? p.downloadUrl ?? null,
            googleDriveFileId: p.driveFileId ?? null,
            thumbnailUrl: p.thumbnailUrl ?? null,
            storageProvider: p.storageProvider ?? "firebaseStorage",
            expiresAt: p.expiresAt ?? null,
          }));
        }

        await appendTimelineEntry(missionId, timelineMsg, "tracking", timelineMeta);
      }

      toast({
        title: "Status perjalanan diperbarui untuk semua anggota terpilih.",
      });
      setPendingMilestone(null);
      setGroupSelectedUids([]);
      resetMilestoneEvidence();
      setShowIssueInput(false);
      setIssueForm({ category: "", urgency: "", note: "", attachment: null });
      refreshStaffTasks();
      await loadMissionDetail(missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal memperbarui status",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Request repair dari Director/HRD
  const handleRequestRepairEvidence = async (
    missionId: string,
    evidenceId: string,
    milestoneType: "departed" | "arrived" | "activity_done" | "returned",
    reason: string,
  ) => {
    if (!firestore || !userProfile) return;
    setIsSaving(true);
    try {
      const evidenceRef = doc(firestore, "business_trip_missions", missionId, "milestone_evidences", evidenceId);

      await setDoc(evidenceRef, {
        repairStatus: "requested",
        evidenceRepairRequested: true,
        repairRequestedByUid: userProfile.uid,
        repairRequestedByName: userProfile.fullName || userProfile.email || "Unknown",
        repairRequestedAt: serverTimestamp(),
        repairReason: reason || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const milestoneLabelMap: Record<string, string> = {
        departed: "Keberangkatan",
        arrived: "Kedatangan",
        activity_done: "Penyelesaian Aktivitas",
        returned: "Kepulangan",
      };
      const milestoneLabel = milestoneLabelMap[milestoneType] || milestoneType;

      await appendTimelineEntry(
        missionId,
        `${userProfile.fullName || "HRD/Direktur"} meminta upload ulang bukti ${milestoneLabel}${reason ? `: ${reason}` : ''}`,
        "system",
      );

      toast({
        title: "Permintaan upload ulang bukti dikirim",
      });

      await loadMissionDetail(missionId);
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
  };

  // Repair/upload ulang evidence yang kosong
  const handleRepairMilestoneEvidence = async (
    missionId: string,
    evidenceId: string,
    milestoneType: "departed" | "arrived" | "activity_done" | "returned",
    confirmedByName: string,
    targetMembers: BusinessTripMissionMember[],
    evidenceOpts: {
      latitude?: number;
      longitude?: number;
      locationAccuracy?: number;
      locationCapturedAt?: Date;
      locationStatus: "captured" | "unavailable" | "manual";
      addressText?: string;
      streetName?: string;
      village?: string;
      district?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      country?: string;
      geocodeStatus?: "success" | "failed";
      locationTrustLevel?: "high" | "medium" | "low";
      gpsPermissionStatus?: string;
      deviceTimestamp?: string;
      userAgent?: string;
      manualLocationNote?: string;
      note?: string;
      photos?: File[];
    },
  ) => {
    if (!firestore || !userProfile) return;
    setIsSaving(true);
    try {
      const photosToUpload = evidenceOpts.photos ?? [];

      // Validate: photo wajib ada untuk repair
      if (photosToUpload.length === 0) {
        return toast({
          variant: "destructive",
          title: "Foto bukti wajib dipilih",
          description: "Pilih minimal 1 foto untuk upload ulang",
        });
      }

      // Upload photos to Google Drive
      let uploadedPhotos: Array<any> = [];
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

      for (const photoFile of photosToUpload) {
        try {
          const compressed = await compressMilestoneImage(photoFile);
          const storagePath = `milestone_evidence/${missionId}/${userProfile.uid}/${milestoneType}_repair_${Date.now()}_${uploadedPhotos.length}.jpg`;
          const result = await uploadFile(compressed, storagePath, userProfile.uid, {
            compress: false,
            category: "business_trip_spd",
            ownerUid: userProfile.uid,
          });

          uploadedPhotos.push({
            driveFileId: result.fileId ?? null,
            url: result.webViewLink ?? result.viewUrl ?? result.downloadUrl ?? null,
            downloadUrl: result.downloadUrl ?? null,
            directViewUrl: result.directViewUrl ?? null,
            thumbnailUrl: result.thumbnailUrl ?? null,
            storageProvider: result.storageProvider ?? "firebaseStorage",
            name: result.originalFileName ?? photoFile.name,
            size: result.finalSize ?? compressed.size,
            uploadedAt: result.uploadedAt ?? serverTimestamp(),
            expiresAt: expiresAt,
            photoUrl: result.webViewLink ?? result.viewUrl ?? result.downloadUrl ?? null,
            photoPath: result.fileId ?? storagePath,
          });
        } catch (uploadErr: any) {
          console.error("Gagal upload foto bukti repair:", uploadErr);
          return toast({
            variant: "destructive",
            title: "Gagal upload foto bukti",
            description: uploadErr?.message || "Coba lagi",
          });
        }
      }

      if (uploadedPhotos.length === 0) {
        return toast({
          variant: "destructive",
          title: "Tidak ada foto yang berhasil diupload",
        });
      }

      // Update existing evidence document (merge mode)
      const evidenceRef = doc(firestore, "business_trip_missions", missionId, "milestone_evidences", evidenceId);
      const updatePayload = {
        latitude: evidenceOpts.latitude ?? null,
        longitude: evidenceOpts.longitude ?? null,
        locationAccuracy: evidenceOpts.locationAccuracy ?? null,
        locationCapturedAt: evidenceOpts.locationCapturedAt
          ? Timestamp.fromDate(evidenceOpts.locationCapturedAt)
          : null,
        locationStatus: evidenceOpts.locationStatus,
        locationTrustLevel: evidenceOpts.locationTrustLevel ?? null,
        addressText: evidenceOpts.addressText || null,
        streetName: evidenceOpts.streetName || null,
        village: evidenceOpts.village || null,
        district: evidenceOpts.district || null,
        city: evidenceOpts.city || null,
        province: evidenceOpts.province || null,
        postalCode: evidenceOpts.postalCode || null,
        country: evidenceOpts.country || null,
        geocodeStatus: evidenceOpts.geocodeStatus || null,
        manualLocationNote: evidenceOpts.manualLocationNote || null,
        note: evidenceOpts.note || null,
        photos: uploadedPhotos,
        repairStatus: "resolved",
        repairedByUid: userProfile?.uid || null,
        repairedByName: userProfile?.fullName || userProfile?.email || null,
        repairedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log("repair milestone evidence payload", updatePayload);

      await setDoc(evidenceRef, updatePayload, { merge: true });

      console.log("✅ Milestone evidence repaired:", { evidenceId, photosCount: uploadedPhotos.length });

      const milestoneLabelMap: Record<string, string> = {
        departed: "Keberangkatan",
        arrived: "Kedatangan",
        activity_done: "Penyelesaian Aktivitas",
        returned: "Kepulangan",
      };
      const milestoneLabel = milestoneLabelMap[milestoneType] || milestoneType;

      await appendTimelineEntry(
        missionId,
        `${userProfile?.fullName || "Staff"} mengupload ulang bukti ${milestoneLabel} (${uploadedPhotos.length} foto)`,
        "system",
      );

      toast({
        title: "Bukti milestone berhasil di-update",
      });

      // Reload mission detail
      await loadMissionDetail(missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal update bukti milestone",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitReport = async (member: BusinessTripMissionMember) => {
    if (
      !firestore ||
      !userProfile ||
      !member ||
      !member.missionId ||
      !member.id ||
      !selectedMission
    )
      return;
    if (!reportForm.summary || !reportForm.outcomes) {
      return toast({
        variant: "destructive",
        title: "Ringkasan dan hasil pekerjaan wajib diisi.",
      });
    }
    setIsSaving(true);
    try {
      let attachmentUrl = member.reportAttachmentUrl || null;
      if (reportForm.attachment) {
        const uploadResult = await uploadFile(
          reportForm.attachment,
          `business_trip_missions/${userProfile?.uid}/${Date.now()}_${reportForm.attachment.name}`,
          userProfile?.uid || "",
          { compress: false },
        );
        attachmentUrl = uploadResult.downloadUrl ?? null;
      }
      const memberRef = getMissionMemberDoc(member.missionId, member.id);
      if (!memberRef) return;
      await updateDoc(memberRef, {
        reportStatus: "submitted",
        reportSummary: reportForm.summary,
        reportOutcomes: reportForm.outcomes,
        reportIssues: reportForm.issues,
        reportRecommendations: reportForm.recommendations,
        reportAttachmentUrl: attachmentUrl,
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `${member.employeeName} mengirim laporan dinas global.`,
        "system",
      );
      await syncMissionStatus(member.missionId);
      toast({ title: "Laporan terkirim." });
      setReportForm({
        summary: "",
        outcomes: "",
        issues: "",
        recommendations: "",
        attachment: null,
      });
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal mengirim laporan",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitTeamReport = async () => {
    if (!firestore || !userProfile || !selectedMission?.id) return;
    if (!teamReportForm.ringkasanKegiatan || !teamReportForm.hasilOutput) {
      return toast({
        variant: "destructive",
        title: "Ringkasan kegiatan dan hasil output wajib diisi.",
      });
    }
    setIsSubmittingFinalReport(true);
    try {
      const mId = selectedMission.id;
      let lampiranUrl: string | null = null;
      if (teamReportForm.lampiranFile) {
        const res = await uploadFile(
          teamReportForm.lampiranFile,
          `business_trip_missions/${mId}/final_report_${Date.now()}_${teamReportForm.lampiranFile.name}`,
          userProfile.uid,
          { compress: false },
        );
        lampiranUrl = res.downloadUrl ?? null;
      }
      const reportMode =
        (selectedMission.reportMode as "team_report" | "individual_report") ??
        "team_report";
      const isResubmit =
        finalReport?.reportReviewStatus === "revision_requested";
      const reportRef = doc(
        collection(firestore, "business_trip_missions", mId, "final_report"),
        "main",
      );
      await setDoc(
        reportRef,
        {
          missionId: mId,
          reportMode,
          ringkasanKegiatan: teamReportForm.ringkasanKegiatan,
          hasilOutput: teamReportForm.hasilOutput,
          kendalaDanSolusi: teamReportForm.kendalaDanSolusi || null,
          tindakLanjut: teamReportForm.tindakLanjut || null,
          catatanUntukHRD: teamReportForm.catatanUntukHRD || null,
          lampiranUrl,
          dilaporkanOlehUid: userProfile.uid,
          dilaporkanOlehName: userProfile.fullName || userProfile.email || "",
          submittedAt: serverTimestamp(),
          reportReviewStatus: isResubmit ? "resubmitted" : null,
          revisionNote: isResubmit ? null : undefined,
          totalMembers: missionMembers.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      const missionRef = getBusinessTripMissionDoc(mId);
      if (missionRef) {
        await updateDoc(missionRef, {
          status: "final_report_submitted",
          reportMode,
          finalReportSubmittedAt: serverTimestamp(),
          finalReportSubmittedBy: userProfile.uid,
          updatedAt: serverTimestamp(),
        });
      }
      await appendTimelineEntry(
        mId,
        isResubmit
          ? `${userProfile.fullName || userProfile.email} mengirim ulang laporan akhir tim.`
          : `${userProfile.fullName || userProfile.email} membuat laporan akhir tim. Laporan akhir dikirim ke HRD.`,
        "system",
      );
      toast({
        title: isResubmit
          ? "Laporan dikirim ulang."
          : "Laporan akhir tim berhasil dikirim.",
      });
      setTeamReportForm({
        ringkasanKegiatan: "",
        hasilOutput: "",
        kendalaDanSolusi: "",
        tindakLanjut: "",
        catatanUntukHRD: "",
        lampiranFile: null,
      });
      setShowFinalReportPanel(false);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal mengirim laporan",
        description: error?.message,
      });
    } finally {
      setIsSubmittingFinalReport(false);
    }
  };

  const handleSubmitMemberReport = async () => {
    if (!firestore || !userProfile || !selectedMission?.id) return;
    if (!memberReportForm.kegiatanDilakukan || !memberReportForm.hasilPribadi) {
      return toast({
        variant: "destructive",
        title: "Kegiatan dilakukan dan hasil pribadi wajib diisi.",
      });
    }
    setIsSubmittingFinalReport(true);
    try {
      const mId = selectedMission.id;
      let lampiranUrl: string | null = null;
      if (memberReportForm.lampiranFile) {
        const res = await uploadFile(
          memberReportForm.lampiranFile,
          `business_trip_missions/${mId}/member_report_${userProfile.uid}_${Date.now()}`,
          userProfile.uid,
          { compress: false },
        );
        lampiranUrl = res.downloadUrl ?? null;
      }
      const myExistingReport = memberFinalReports[userProfile.uid];
      const isMemberResubmit =
        myExistingReport?.reportReviewStatus === "revision_requested";
      await setDoc(
        doc(
          firestore,
          "business_trip_missions",
          mId,
          "member_final_reports",
          userProfile.uid,
        ),
        {
          missionId: mId,
          memberUid: userProfile.uid,
          memberName: userProfile.fullName || userProfile.email || "",
          kegiatanDilakukan: memberReportForm.kegiatanDilakukan,
          hasilPribadi: memberReportForm.hasilPribadi,
          kendalaPribadi: memberReportForm.kendalaPribadi || null,
          solusiPribadi: memberReportForm.solusiPribadi || null,
          catatanTambahan: memberReportForm.catatanTambahan || null,
          lampiranUrl,
          submittedAt: serverTimestamp(),
          reportReviewStatus: isMemberResubmit ? "resubmitted" : null,
          revisionNote: isMemberResubmit ? null : undefined,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Check if all members have submitted
      const membersSnap = await getDocs(
        collection(
          firestore,
          "business_trip_missions",
          mId,
          "member_final_reports",
        ),
      );
      const activeMemberUids = missionMembers
        .filter(
          (m) =>
            m.memberTripStatus === "returned" || m.memberStatus === "returned",
        )
        .map((m) => m.employeeUid);
      const submittedUids = membersSnap.docs.map((d) => d.id);
      const allSubmitted =
        activeMemberUids.length > 0 &&
        activeMemberUids.every((uid) => submittedUids.includes(uid));

      if (allSubmitted && !isMemberResubmit) {
        const missionRef = getBusinessTripMissionDoc(mId);
        if (missionRef) {
          await updateDoc(missionRef, {
            status: "final_report_submitted",
            reportMode:
              (selectedMission.reportMode as
                | "team_report"
                | "individual_report") ?? "individual_report",
            finalReportSubmittedAt: serverTimestamp(),
            finalReportSubmittedBy: userProfile.uid,
            updatedAt: serverTimestamp(),
          });
          await appendTimelineEntry(
            mId,
            `Semua laporan individu terkumpul. Laporan akhir dikirim ke HRD.`,
            "system",
          );
        }
      } else {
        await appendTimelineEntry(
          mId,
          isMemberResubmit
            ? `${userProfile.fullName || userProfile.email} mengirim ulang laporan dinas individu.`
            : `${userProfile.fullName || userProfile.email} mengirim laporan dinas individu.`,
          "system",
        );
      }

      toast({
        title: isMemberResubmit
          ? "Laporan dikirim ulang."
          : "Laporan dinas individu berhasil dikirim.",
      });
      setMemberReportForm({
        kegiatanDilakukan: "",
        hasilPribadi: "",
        kendalaPribadi: "",
        solusiPribadi: "",
        catatanTambahan: "",
        lampiranFile: null,
      });
      setShowFinalReportPanel(false);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal mengirim laporan",
        description: error?.message,
      });
    } finally {
      setIsSubmittingFinalReport(false);
    }
  };

  const handleSetReportMode = async (
    mode: "team_report" | "individual_report",
  ) => {
    // Update local state immediately so UI responds without waiting for Firestore
    setLocalReportMode(mode);
    console.log("selected report mode", mode);
    if (!firestore || !selectedMission?.id) return;
    try {
      const missionRef = getBusinessTripMissionDoc(selectedMission.id);
      if (missionRef) {
        await updateDoc(missionRef, {
          reportMode: mode,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan mode laporan",
        description: error?.message,
      });
    }
  };

  const handleSaveDraftTeamReport = async () => {
    if (!firestore || !userProfile || !selectedMission?.id) return;
    setIsSubmittingFinalReport(true);
    try {
      const mId = selectedMission.id;
      const reportMode =
        (selectedMission.reportMode as "team_report" | "individual_report") ??
        "team_report";
      const reportRef = doc(
        collection(firestore, "business_trip_missions", mId, "final_report"),
        "main",
      );
      await setDoc(
        reportRef,
        {
          missionId: mId,
          reportMode,
          ringkasanKegiatan: teamReportForm.ringkasanKegiatan || null,
          hasilOutput: teamReportForm.hasilOutput || null,
          kendalaDanSolusi: teamReportForm.kendalaDanSolusi || null,
          tindakLanjut: teamReportForm.tindakLanjut || null,
          catatanUntukHRD: teamReportForm.catatanUntukHRD || null,
          dilaporkanOlehUid: userProfile.uid,
          dilaporkanOlehName: userProfile.fullName || userProfile.email || "",
          submittedAt: null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      toast({ title: "Draft laporan tim tersimpan." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan draft",
        description: error?.message,
      });
    } finally {
      setIsSubmittingFinalReport(false);
    }
  };

  const handleSaveDraftMemberReport = async () => {
    if (!firestore || !userProfile || !selectedMission?.id) return;
    setIsSubmittingFinalReport(true);
    try {
      const mId = selectedMission.id;
      await setDoc(
        doc(
          firestore,
          "business_trip_missions",
          mId,
          "member_final_reports",
          userProfile.uid,
        ),
        {
          missionId: mId,
          memberUid: userProfile.uid,
          memberName: userProfile.fullName || userProfile.email || "",
          kegiatanDilakukan: memberReportForm.kegiatanDilakukan || null,
          hasilPribadi: memberReportForm.hasilPribadi || null,
          kendalaPribadi: memberReportForm.kendalaPribadi || null,
          solusiPribadi: memberReportForm.solusiPribadi || null,
          catatanTambahan: memberReportForm.catatanTambahan || null,
          submittedAt: null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      toast({ title: "Draft laporan individu tersimpan." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal menyimpan draft",
        description: error?.message,
      });
    } finally {
      setIsSubmittingFinalReport(false);
    }
  };

  const handleOpenTeamReportForm = () => {
    if (finalReport && !finalReport.submittedAt) {
      setTeamReportForm({
        ringkasanKegiatan: finalReport.ringkasanKegiatan ?? "",
        hasilOutput: finalReport.hasilOutput ?? "",
        kendalaDanSolusi: finalReport.kendalaDanSolusi ?? "",
        tindakLanjut: finalReport.tindakLanjut ?? "",
        catatanUntukHRD: finalReport.catatanUntukHRD ?? "",
        lampiranFile: null,
      });
    }
    setShowFinalReportPanel(true);
  };

  const handleOpenMemberReportForm = () => {
    const existing = memberFinalReports[userProfile?.uid ?? ""];
    if (existing && !existing.submittedAt) {
      setMemberReportForm({
        kegiatanDilakukan: existing.kegiatanDilakukan ?? "",
        hasilPribadi: existing.hasilPribadi ?? "",
        kendalaPribadi: existing.kendalaPribadi ?? "",
        solusiPribadi: existing.solusiPribadi ?? "",
        catatanTambahan: existing.catatanTambahan ?? "",
        lampiranFile: null,
      });
    }
    setShowFinalReportPanel(true);
  };

  const summaryCounts = useMemo(() => {
    const items = missions;
    const all = items.length;

    if (mode === "staff") {
      const rejected = items.filter(
        (item: any) =>
          item.staffConfirmationStatus === "declined_by_staff" ||
          (item.managerValidationStatus as string) === "rejected_by_manager" ||
          (item.managerValidationStatus as string) ===
            "replacement_requested" ||
          item.memberStatus === "rejected" ||
          item.memberStatus === "cancelled",
      ).length;
      const completed = items.filter(
        (item: any) =>
          item.staffConfirmationStatus === "confirmed_by_staff" ||
          item.memberStatus === "completed",
      ).length;
      // Perlu Tindak Lanjut = belum konfirmasi & belum ditolak/dibatalkan
      const pending = items.filter((item: any) => {
        const sc = item.staffConfirmationStatus as string;
        if (sc === "confirmed_by_staff" || sc === "declined_by_staff")
          return false;
        if (
          (item.managerValidationStatus as string) === "rejected_by_manager" ||
          (item.managerValidationStatus as string) === "replacement_requested"
        )
          return false;
        if (
          item.memberStatus === "rejected" ||
          item.memberStatus === "cancelled"
        )
          return false;
        return true;
      }).length;
      return { all, pending, completed, rejected };
    }

    const pending = items.filter((item: any) =>
      [
        "pending_manager_validation",
        "waiting_staff_confirmation",
        "pending_hrd_finalization",
      ].includes(item.status),
    ).length;
    const completed = items.filter(
      (item: any) => item.status === "completed",
    ).length;
    const rejected = items.filter(
      (item: any) => item.status === "rejected" || item.status === "cancelled",
    ).length;
    return { all, pending, completed, rejected };
  }, [missions, mode]);

  const modeTitle = useMemo(() => {
    if (mode === "management") return "Misi Dinas";
    if (mode === "manager") return "Validasi Dinas Staff";
    if (mode === "staff") return "Konfirmasi & Laporan Dinas";
    if (mode === "hrd-monitor") return "Monitoring Dinas";
    return "Dinas";
  }, [mode]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{modeTitle}</CardTitle>
          <CardDescription>
            {mode === "management" &&
              "Buat misi dinas lintas brand/divisi, pilih staff, dan upload Surat Tugas/SPD."}
            {mode === "manager" &&
              "Tinjau staff divisi Anda yang ditunjuk dalam misi dinas."}
            {mode === "staff" &&
              "Lihat tugas Anda, konfirmasi kesiapan, dan kelola laporan serta nota."}
            {mode === "hrd-monitor" &&
              "Pantau semua misi dinas dan kelola finalisasi administrasi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-semibold">{summaryCounts.all}</p>
          </div>
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-sm text-muted-foreground">Perlu Tindak Lanjut</p>
            <p className="text-3xl font-semibold">{summaryCounts.pending}</p>
          </div>
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-sm text-muted-foreground">Selesai</p>
            <p className="text-3xl font-semibold">{summaryCounts.completed}</p>
          </div>
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-sm text-muted-foreground">Ditolak / Batal</p>
            <p className="text-3xl font-semibold">{summaryCounts.rejected}</p>
          </div>
        </CardContent>
      </Card>

      {mode === "management" && (
        <Card>
          <CardHeader>
            <CardTitle>Buat Misi Dinas</CardTitle>
            <CardDescription>
              Isi detail misi, upload Surat Tugas, dan pilih staff lintas
              brand/divisi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="missionName">Nama Misi</Label>
                <Input
                  id="missionName"
                  value={missionForm.missionName}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      missionName: event.target.value,
                    }))
                  }
                  placeholder="Contoh: Audit lapangan Surabaya"
                />
              </div>
              <div>
                <Label htmlFor="assignmentNumber">Nomor Surat Tugas</Label>
                <Input
                  id="assignmentNumber"
                  value={missionForm.assignmentNumber}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      assignmentNumber: event.target.value,
                    }))
                  }
                  placeholder="Isi nomor SPD atau biarkan kosong untuk auto"
                />
              </div>
              <div>
                <Label htmlFor="clientName">Klien / Proyek</Label>
                <Input
                  id="clientName"
                  value={missionForm.clientName}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      clientName: event.target.value,
                    }))
                  }
                  placeholder="Nama klien atau proyek"
                />
              </div>
              <div>
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={missionForm.projectName}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      projectName: event.target.value,
                    }))
                  }
                  placeholder="Nama proyek"
                />
              </div>
              <div>
                <Label htmlFor="tripType">Jenis Dinas</Label>
                <Select
                  value={missionForm.tripType}
                  onValueChange={(value) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      tripType: value as BusinessTripType,
                    }))
                  }
                >
                  <SelectTrigger id="tripType" className="mt-1 w-full">
                    <SelectValue placeholder="Pilih jenis dinas" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIP_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="destinationCity">Kota Tujuan</Label>
                <Input
                  id="destinationCity"
                  value={missionForm.destinationCity}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      destinationCity: event.target.value,
                    }))
                  }
                  placeholder="Kota tujuan"
                />
              </div>
              <div>
                <Label htmlFor="destinationAddress">Alamat Lokasi</Label>
                <Input
                  id="destinationAddress"
                  value={missionForm.destinationAddress}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      destinationAddress: event.target.value,
                    }))
                  }
                  placeholder="Alamat lengkap lokasi"
                />
              </div>
              <div>
                <Label htmlFor="startDate">Tanggal Mulai</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={missionForm.startDate}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="endDate">Tanggal Selesai</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={missionForm.endDate}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Instruksi / Catatan</Label>
              <RichTextEditor
                value={missionForm.instructionHtml}
                onChange={(value) =>
                  setMissionForm((prev) => ({
                    ...prev,
                    instructionHtml: value,
                    instructionText: stripHtml(value),
                  }))
                }
                placeholder="Tulis instruksi utama untuk tim lapangan"
              />
            </div>
            <div>
              <Label>Staff yang Ditugaskan</Label>
              <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
                {staffLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Memuat daftar staff operasional...
                  </p>
                ) : staffByBrand.size === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Tidak ada anggota operasional yang tersedia.
                  </p>
                ) : (
                  Array.from(staffByBrand.entries()).map(
                    ([brandName, divisionMap]) => (
                      <div key={brandName} className="space-y-3">
                        <div className="rounded-2xl border border-border bg-background p-3">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {brandName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Grup Brand
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {Array.from(divisionMap.values()).reduce(
                                (sum, members) => sum + members.length,
                                0,
                              )}{" "}
                              orang
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-3 pl-2">
                          {Array.from(divisionMap.entries()).map(
                            ([divisionName, members]) => (
                              <div
                                key={`${brandName}-${divisionName}`}
                                className="rounded-2xl border border-border bg-muted/10 p-3"
                              >
                                <p className="text-sm font-semibold text-foreground">
                                  {divisionName}
                                </p>
                                <div className="mt-3 space-y-2">
                                  {members.map((member) => {
                                    const warnings = [];
                                    if (!member.brandId)
                                      warnings.push("Brand belum diatur");
                                    if (!member.divisionId)
                                      warnings.push("Divisi belum diatur");
                                    if (
                                      !member.managerUid ||
                                      !member.managerName
                                    )
                                      warnings.push(
                                        "Approver belum ditentukan",
                                      );
                                    return (
                                      <label
                                        key={member.uid}
                                        className="flex cursor-pointer flex-col rounded-2xl border border-border bg-background p-3 shadow-sm transition hover:border-primary"
                                      >
                                        <div className="flex items-start gap-3">
                                          <input
                                            type="checkbox"
                                            checked={selectedStaffUids.includes(
                                              member.uid,
                                            )}
                                            onChange={(event) => {
                                              const next = event.target.checked
                                                ? [
                                                    ...selectedStaffUids,
                                                    member.uid,
                                                  ]
                                                : selectedStaffUids.filter(
                                                    (uid) => uid !== member.uid,
                                                  );
                                              setSelectedStaffUids(next);
                                            }}
                                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground">
                                              {member.fullName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {member.jobTitle || "-"} •{" "}
                                              {member.employeeType || "-"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {member.brandName ||
                                                "Brand belum diatur"}{" "}
                                              /{" "}
                                              {member.divisionName ||
                                                "Divisi belum diatur"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Manager Divisi:{" "}
                                              {member.managerName || "-"}
                                            </p>
                                            {warnings.length > 0 && (
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                {warnings.map((warning) => (
                                                  <span
                                                    key={warning}
                                                    className="rounded-full bg-yellow-500/10 px-2 py-1 text-[11px] font-medium text-yellow-700"
                                                  >
                                                    {warning}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="assignmentLetter">Upload Surat Tugas / SPD</Label>
              <input
                id="assignmentLetter"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(event) =>
                  setAssignmentLetter(event.target.files?.[0] || null)
                }
                className="mt-2"
              />
              {assignmentLetter ? (
                <p className="text-sm text-muted-foreground mt-2">
                  Dipilih: {assignmentLetter.name}
                </p>
              ) : null}
            </div>
            <Button onClick={handleCreateMission} disabled={isSaving}>
              <Upload className="mr-2 h-4 w-4" /> Buat Misi Dinas
              {selectedStaffUids.length > 0
                ? ` (${selectedStaffUids.length} orang)`
                : ""}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "staff" ? "Daftar Tugas Anda" : "Daftar Misi"}
          </CardTitle>
          <CardDescription>
            Lihat status misi, klik detail untuk melihat langkah selanjutnya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Misi</TableHead>
                  <TableHead>Tujuan</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Jumlah Anggota</TableHead>
                  <TableHead>
                    {mode === "staff"
                      ? "Status Approval Saya"
                      : "Status Approval"}
                  </TableHead>
                  <TableHead>
                    {mode === "staff"
                      ? "Status Konfirmasi Saya"
                      : "Status Konfirmasi"}
                  </TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingEffective ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Memuat...
                    </TableCell>
                  </TableRow>
                ) : missionQueryErrorEffective ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6">
                      <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                        <p className="text-sm font-bold text-amber-400">
                          Terjadi masalah saat memuat data perjalanan dinas.
                        </p>
                        <p className="text-sm text-amber-200 mt-2">
                          Silakan muat ulang halaman atau hubungi admin jika
                          masalah berlanjut.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : missions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <p className="text-muted-foreground">
                        Anda belum ditugaskan dalam perjalanan dinas apapun.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  missions.map((item: any) => {
                    const title = item.missionName || "-";
                    const approvalStatus = (() => {
                      if (mode === "staff") {
                        // Use member-level fields only — don't mix with mission global status
                        const mv = item.managerValidationStatus as string;
                        const ap = item.approvalStatus as string;
                        if (ap === "approved" || mv === "approved_by_manager")
                          return "approved_by_manager";
                        if (mv === "rejected_by_manager" || ap === "rejected")
                          return "rejected_by_manager";
                        if (mv === "replacement_requested")
                          return "replacement_requested";
                        return "waiting_manager_validation";
                      }
                      if (item.managerValidationStatus)
                        return item.managerValidationStatus;
                      if (item.approvalStatus) return item.approvalStatus;
                      if (
                        item.status &&
                        [
                          "waiting_staff_confirmation",
                          "pending_hrd_finalization",
                          "approved_ready_to_depart",
                          "on_duty",
                          "returned_pending_report",
                          "report_submitted",
                          "expense_submitted",
                          "settlement_review",
                          "completed",
                        ].includes(item.status)
                      ) {
                        return "approved_by_manager";
                      }
                      return item.memberStatus || item.status;
                    })();
                    const confirmationStatus = (() => {
                      if (mode === "staff") {
                        // Direct from member doc
                        return (
                          item.staffConfirmationStatus ||
                          item.confirmationStatus ||
                          "waiting_staff_confirmation"
                        );
                      }
                      if (item.staffConfirmationStatus)
                        return item.staffConfirmationStatus;
                      if (item.status === "waiting_staff_confirmation")
                        return "waiting_staff_confirmation";
                      if (
                        item.status &&
                        [
                          "pending_hrd_finalization",
                          "approved_ready_to_depart",
                          "on_duty",
                          "returned_pending_report",
                          "report_submitted",
                          "expense_submitted",
                          "settlement_review",
                          "completed",
                        ].includes(item.status)
                      ) {
                        return "confirmed_by_staff";
                      }
                      return item.memberStatus || item.status;
                    })();
                    const memberCount =
                      item.memberCount ??
                      item.totalMembers ??
                      item.assignedStaffCount ??
                      1;
                    // Staff can confirm at any time unless already finalized
                    const canConfirm =
                      mode === "staff"
                        ? confirmationStatus !== "confirmed_by_staff" &&
                          confirmationStatus !== "declined_by_staff" &&
                          (item.managerValidationStatus as string) !==
                            "rejected_by_manager" &&
                          (item.managerValidationStatus as string) !==
                            "replacement_requested"
                        : approvalStatus &&
                          approvalStatus !== "waiting_manager_validation" &&
                          confirmationStatus !== "confirmed_by_staff" &&
                          confirmationStatus !== "declined_by_staff";

                    return (
                      <TableRow
                        key={`${item.missionId ?? ""}-${item.id ?? item.employeeUid ?? ""}`}
                        className="hover:bg-muted cursor-pointer"
                        onClick={() => handleSelectItem(item)}
                      >
                        <TableCell className="font-medium">
                          <div>{title || "-"}</div>
                          {mode === "staff" &&
                            approvalStatus !== "approved_by_manager" &&
                            approvalStatus !== "rejected_by_manager" &&
                            approvalStatus !== "replacement_requested" &&
                            staffMissionDataById[item.missionId]?.status &&
                            staffMissionDataById[item.missionId].status !==
                              "completed" && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Status misi:{" "}
                                <span className="font-medium">
                                  {renderStatusLabel(
                                    staffMissionDataById[item.missionId].status,
                                  )}
                                </span>
                              </div>
                            )}
                        </TableCell>
                        <TableCell>
                          {getDestinationLabel(
                            mode === "staff"
                              ? (staffMissionDataById[item.missionId] ?? item)
                              : item,
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const src =
                              mode === "staff" &&
                              staffMissionDataById[item.missionId]
                                ? staffMissionDataById[item.missionId]
                                : item;
                            return `${formatDate(src.startDate)} – ${formatDate(src.endDate)}`;
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {memberCount}
                        </TableCell>
                        <TableCell>
                          {renderStatusLabel(approvalStatus)}
                        </TableCell>
                        <TableCell>
                          {renderStatusLabel(confirmationStatus)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSelectItem(item);
                              }}
                            >
                              Detail
                            </Button>
                            {mode === "staff" && (
                              <Button
                                variant={canConfirm ? "default" : "outline"}
                                size="sm"
                                disabled={!canConfirm}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleSelectItem(item);
                                }}
                              >
                                Konfirmasi Siap Dinas
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {missionDetailError ? (
        <Card>
          <CardHeader>
            <CardTitle>Akses Ditolak</CardTitle>
            <CardDescription>
              Anda tidak memiliki akses atau rules belum mengizinkan membaca
              detail perjalanan dinas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Jika ini adalah Direktur/Management dan Anda yakin sudah
              seharusnya bisa melihat data, periksa Firestore rules dan konsol
              browser untuk detail denied path.
            </p>
          </CardContent>
        </Card>
      ) : selectedMission ? (
        <>
          {/* Detail Header with Close Button */}
          <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight">
                {selectedMission.missionName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedMission.clientName ||
                  selectedMission.projectName ||
                  "-"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedMission(null)}
              >
                Tutup Detail
              </Button>
              {renderStatusLabel(
                computeMissionDisplayStatus(
                  selectedMission.status,
                  selectedMission.startDate,
                  missionMembers,
                ),
              )}
            </div>
          </div>

          {/* Mission update alert for staff — show if recently modified */}
          {mode === "staff" &&
            selectedMission.updatedAt &&
            (() => {
              const updatedMs = (selectedMission.updatedAt as any)?.seconds
                ? (selectedMission.updatedAt as any).seconds * 1000
                : 0;
              const createdMs = (selectedMission.createdAt as any)?.seconds
                ? (selectedMission.createdAt as any).seconds * 1000
                : 0;
              const isUpdated = updatedMs > createdMs + 60_000; // updated at least 1 min after creation
              if (!isUpdated) return null;
              return (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-400/50 bg-amber-50/40 dark:bg-amber-900/10 p-4">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Perjalanan dinas ini telah diperbarui oleh management.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Terakhir diubah: {formatDate(selectedMission.updatedAt)}.
                      Periksa detail terbaru di bawah.
                    </p>
                  </div>
                </div>
              );
            })()}

          {/* Summary Cards */}
          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {(() => {
              const approvedCount = missionMembers.filter(isMemberApproved).length;
              const confirmedCount = missionMembers.filter(isMemberConfirmed).length;
              return (
                <>
                  <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Nomor SPD
                    </p>
                    <p className="mt-3 text-lg font-semibold">
                      {selectedMission.assignmentNumber || "-"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Tujuan
                    </p>
                    <p className="mt-3 text-sm font-semibold line-clamp-2">
                      {getDestinationLabel(selectedMission)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Jumlah Anggota
                    </p>
                    <p className="mt-3 text-3xl font-bold text-primary">
                      {missionMembers.length}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Validasi Manager
                    </p>
                    <div className="mt-3 flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-primary">
                        {approvedCount}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        dari {missionMembers.length}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{
                          width: `${
                            missionMembers.length > 0
                              ? (approvedCount / missionMembers.length) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Konfirmasi Staff
                    </p>
                    <div className="mt-3 flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-primary">
                        {confirmedCount}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        dari {missionMembers.length}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{
                          width: `${
                            missionMembers.length > 0
                              ? (confirmedCount / missionMembers.length) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Period & Creation Info */}
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Periode Perjalanan
              </p>
              <p className="mt-2 font-medium">
                {formatDate(selectedMission.startDate)} —{" "}
                {formatDate(selectedMission.endDate)}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Durasi
              </p>
              <p className="mt-2 font-medium">
                {selectedMission.durationDays || 0} hari
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Dibuat
              </p>
              <p className="mt-2 font-medium">
                {formatDate(selectedMission.createdAt)}
              </p>
            </div>
          </div>

          <Separator className="mb-6" />

          {/* Informasi Perjalanan Section */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-xl">Informasi Perjalanan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">
                    Tujuan Lengkap
                  </h4>
                  <p className="text-sm text-foreground/80">
                    {getDestinationLabel(selectedMission)}
                  </p>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">
                    Alamat Tujuan
                  </h4>
                  <p className="text-sm text-foreground/80">
                    {selectedMission.destinationAddress || "-"}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Instruksi & Catatan
                </h4>
                <p className="rounded-lg bg-muted/30 p-3 text-sm leading-relaxed text-foreground/80">
                  {stripHtml(
                    selectedMission.instructionHtml ||
                      selectedMission.instructionNote ||
                      "Tidak ada instruksi khusus",
                  )}
                </p>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">
                  Dokumen SPD
                </h4>
                {selectedMission.assignmentLetterUrl ? (
                  <div className="space-y-3">
                    {(() => {
                      const fileId = extractGoogleDriveFileId(
                        selectedMission.assignmentLetterUrl,
                      );
                      if (!fileId) {
                        return (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                            <p className="text-xs text-amber-700 mb-2">
                              Format URL tidak dikenali. Hubungi admin untuk
                              memperbarui dokumen SPD.
                            </p>
                            <a
                              href={selectedMission.assignmentLetterUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition"
                            >
                              <FileText className="h-3.5 w-3.5" /> Buka Dokumen
                              (External)
                            </a>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/api/storage/google-drive-preview?fileId=${fileId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition"
                          >
                            <FileText className="h-3.5 w-3.5" /> Preview SPD
                          </a>
                          <a
                            href={`/api/storage/google-drive-preview?fileId=${fileId}&download=true`}
                            download
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
                          >
                            Download SPD
                          </a>
                        </div>
                      );
                    })()}
                    <p className="text-xs italic text-muted-foreground">
                      Jika preview gagal, silakan coba download atau hubungi
                      admin.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      Dokumen SPD belum diunggah
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Anggota Dinas Section */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-xl">Anggota Dinas</CardTitle>
              <CardDescription>
                {missionMembers.length} anggota dalam perjalanan ini
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Nama</TableHead>
                      <TableHead className="font-semibold">Posisi</TableHead>
                      <TableHead className="font-semibold">
                        Brand / Divisi
                      </TableHead>
                      <TableHead className="font-semibold">Approver</TableHead>
                      <TableHead className="font-semibold text-center">
                        Validasi Manager
                      </TableHead>
                      <TableHead className="font-semibold text-center">
                        Konfirmasi Staff
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missionMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6">
                          <p className="text-sm text-muted-foreground">
                            Belum ada anggota dalam perjalanan ini
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      missionMembers.map((member, idx) => (
                        <TableRow
                          key={member.id}
                          className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                            selectedMember?.id === member.id
                              ? "bg-primary/5"
                              : ""
                          } ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                          onClick={() => setSelectedMember(member)}
                        >
                          <TableCell className="font-medium">
                            {member.employeeName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {member.employeePosition || "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {member.brandName && member.divisionName
                              ? `${member.brandName} / ${member.divisionName}`
                              : member.brandName || member.divisionName || "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {member.approvalTargetName || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {getMemberApprovalStatusBadge(member)}
                          </TableCell>
                          <TableCell className="text-center">
                            {renderStatusLabel(normalizeConfirmationStatus(member))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Aktivitas Section */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Timeline Aktivitas</CardTitle>
                  <CardDescription className="mt-1">
                    Riwayat perubahan status dan aksi yang dilakukan
                  </CardDescription>
                </div>
                {/* Tab filter */}
                <div className="flex gap-1 self-start rounded-lg border border-border bg-muted/40 p-1">
                  {(["all", "tracking", "system"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTimelineTab(tab)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${timelineTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {tab === "all"
                        ? "Semua"
                        : tab === "tracking"
                          ? "Perjalanan"
                          : "Sistem"}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                // Helper: infer category from message for old entries without category field
                const getCategory = (
                  entry: (typeof missionTimeline)[number],
                ): "tracking" | "approval" | "system" => {
                  if (entry.category) return entry.category;
                  const msg = (entry.message || "").toLowerCase();
                  if (
                    msg.includes("berangkat") ||
                    msg.includes("sampai lokasi") ||
                    msg.includes("kembali") ||
                    msg.includes("kegiatan selesai") ||
                    msg.includes("kendala") ||
                    msg.includes("sudah kembali")
                  )
                    return "tracking";
                  if (
                    msg.includes("menyetujui") ||
                    msg.includes("meminta ganti") ||
                    msg.includes("menolak") ||
                    msg.includes("mengkonfirmasi") ||
                    msg.includes("tidak bisa ikut") ||
                    msg.includes("hrd menyelesaikan")
                  )
                    return "approval";
                  return "system";
                };

                const filtered = missionTimeline.filter((entry) => {
                  if (timelineTab === "all") return true;
                  const cat = getCategory(entry);
                  if (timelineTab === "tracking") return cat === "tracking";
                  // "system" tab shows both system and approval
                  return cat === "system" || cat === "approval";
                });

                if (filtered.length === 0) {
                  return (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        {timelineTab === "all"
                          ? "Belum ada riwayat aktivitas"
                          : timelineTab === "tracking"
                            ? "Belum ada log perjalanan"
                            : "Belum ada log sistem"}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {filtered.map((entry) => {
                      const cat = getCategory(entry);
                      const isTracking = cat === "tracking";
                      const isApproval = cat === "approval";
                      return (
                        <div
                          key={entry.id}
                          className={`flex gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 ${isTracking ? "border-l-4 border-l-blue-500 border-t-border border-r-border border-b-border" : isApproval ? "border-l-4 border-l-green-500 border-t-border border-r-border border-b-border" : "border-l-4 border-l-border border-t-border border-r-border border-b-border"}`}
                        >
                          {/* Category icon */}
                          <div
                            className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${isTracking ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : isApproval ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                          >
                            {isTracking ? (
                              <Navigation className="h-3.5 w-3.5" />
                            ) : isApproval ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Activity className="h-3.5 w-3.5" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-relaxed text-foreground">
                              {entry.message}
                            </p>
                            {/* Trust level badge — only on tracking entries with evidence */}
                            {isTracking && entry.trustLevel && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {entry.trustLevel === "high" && (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    GPS Valid
                                  </span>
                                )}
                                {entry.trustLevel === "medium" && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    GPS Lemah
                                  </span>
                                )}
                                {entry.trustLevel === "low" && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    Manual / Perlu Dicek
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span>
                                {formatDate(entry.createdAt)}
                                {formatTime(entry.createdAt)
                                  ? `, ${formatTime(entry.createdAt)}`
                                  : ""}
                              </span>
                              {entry.byName && (
                                <>
                                  <span>·</span>
                                  <span>{entry.byName}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Category badge */}
                          <div className="flex-shrink-0 self-start pt-0.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isTracking ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : isApproval ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                            >
                              {isTracking
                                ? "Perjalanan"
                                : isApproval
                                  ? "Approval"
                                  : "Sistem"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Action Sections (existing logic) */}
          <div className="space-y-4">
            {mode === "manager" && selectedMember ? (
              <div className="space-y-4">
                {selectedMember.employeeUid === userProfile?.uid && (
                  <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-900">
                    Anda juga ditugaskan dalam perjalanan dinas ini. Konfirmasi
                    keikutsertaan dilakukan sebagai anggota, bukan sebagai
                    validator diri sendiri.
                  </div>
                )}
                {selectedMember.managerUid === userProfile?.uid &&
                selectedMember.employeeUid !== userProfile?.uid &&
                selectedMember.managerValidationStatus ===
                  "waiting_manager_validation" ? (
                  <div className="space-y-4">
                    <p className="font-semibold">Keputusan Validasi</p>
                    <Textarea
                      value={actionNote}
                      onChange={(event) => setActionNote(event.target.value)}
                      placeholder="Alasan jika tolak atau minta ganti."
                      rows={4}
                    />
                    <Textarea
                      value={replacementSuggestion}
                      onChange={(event) =>
                        setReplacementSuggestion(event.target.value)
                      }
                      placeholder="Rekomendasi staff pengganti (opsional)."
                      rows={3}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          handleManagerDecision(selectedMember!, "approve")
                        }
                        disabled={isSaving}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          handleManagerDecision(selectedMember!, "replace")
                        }
                        disabled={isSaving}
                      >
                        <ArrowRightCircle className="mr-2 h-4 w-4" /> Minta
                        Ganti
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          handleManagerDecision(selectedMember!, "reject")
                        }
                        disabled={isSaving}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Tolak
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            !isMemberConfirmed(selectedMember) &&
            normalizeApprovalStatus(selectedMember) !== "rejected_by_manager" &&
            normalizeApprovalStatus(selectedMember) !== "replacement_requested" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Konfirmasi Siap Dinas
                  </CardTitle>
                  <CardDescription>
                    Konfirmasi kesiapan Anda, isi kontak aktif, dan catatan
                    kendala jika ada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="contactDuringTrip">
                      Kontak Aktif Selama Dinas
                    </Label>
                    <Input
                      id="contactDuringTrip"
                      type="text"
                      value={technicalForm.contactDuringTrip}
                      onChange={(event) =>
                        setTechnicalForm((prev) => ({
                          ...prev,
                          contactDuringTrip: event.target.value,
                        }))
                      }
                      placeholder="Contoh: +62 812 3456 7890"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="staffConfirmationNote">
                      Catatan Kesiapan / Kendala
                    </Label>
                    <Textarea
                      id="staffConfirmationNote"
                      value={technicalForm.staffConfirmationNote}
                      onChange={(event) =>
                        setTechnicalForm((prev) => ({
                          ...prev,
                          staffConfirmationNote: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Tulis catatan kesiapan atau kendala di perjalanan"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        handleStaffConfirmation(selectedMember!, true)
                      }
                      disabled={isSaving}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Konfirmasi Siap
                      Dinas
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        handleStaffConfirmation(selectedMember!, false)
                      }
                      disabled={isSaving}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Tidak Bisa Ikut
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            isMemberConfirmed(selectedMember) &&
            selectedMember.memberTripStatus !== "returned"
              ? (() => {
                  const tripStatus = selectedMember.memberTripStatus ?? "ready";
                  const isIssue = tripStatus === "issue_reported";

                  // Infer progress stage from timestamps when issue_reported overwrites the step
                  const effectiveStatus = isIssue
                    ? selectedMember.activityDoneAt
                      ? "activity_done"
                      : selectedMember.arrivedAt
                        ? "arrived"
                        : "departed"
                    : tripStatus;

                  const selfApproved = isMemberApproved(selectedMember);
                  const selfConfirmed = isMemberConfirmed(selectedMember);
                  const allMembersApproved =
                    missionMembers.length > 0 &&
                    missionMembers.every(isMemberApproved);
                  const allMembersConfirmed =
                    missionMembers.length > 0 &&
                    missionMembers.every(isMemberConfirmed);
                  const trackingReady =
                    selfApproved &&
                    selfConfirmed &&
                    allMembersApproved &&
                    allMembersConfirmed;

                  const ORDER = [
                    "ready",
                    "departed",
                    "arrived",
                    "activity_done",
                    "returned",
                  ];
                  const currentIdx = ORDER.indexOf(effectiveStatus);

                  type MilestoneDef = {
                    key: string;
                    label: string;
                    description: string;
                    icon: React.ElementType;
                    timestamp?: any;
                    actionLabel: string;
                    actionMilestone:
                      | "departed"
                      | "arrived"
                      | "activity_done"
                      | "returned";
                  };

                  const MILESTONES: MilestoneDef[] = [
                    {
                      key: "departed",
                      label: "Berangkat",
                      description: "Mulai perjalanan menuju lokasi tujuan",
                      icon: Navigation,
                      timestamp: selectedMember.departedAt,
                      actionLabel: "Saya sudah berangkat",
                      actionMilestone: "departed",
                    },
                    {
                      key: "arrived",
                      label: "Sampai Lokasi",
                      description: "Tiba di lokasi tujuan",
                      icon: MapPin,
                      timestamp: selectedMember.arrivedAt,
                      actionLabel: "Saya sudah sampai lokasi",
                      actionMilestone: "arrived",
                    },
                    {
                      key: "activity_done",
                      label: "Kegiatan Selesai",
                      description: "Seluruh kegiatan di lokasi telah selesai",
                      icon: CheckSquare,
                      timestamp: selectedMember.activityDoneAt,
                      actionLabel: "Kegiatan selesai",
                      actionMilestone: "activity_done",
                    },
                    {
                      key: "returned",
                      label: "Kembali",
                      description: "Perjalanan dinas selesai, sudah kembali",
                      icon: Home,
                      timestamp: selectedMember.returnedAt,
                      actionLabel: "Saya sudah kembali",
                      actionMilestone: "returned",
                    },
                  ];

                  return (
                    <Card className="overflow-hidden border-2 border-teal-500/30 dark:border-teal-400/20">
                      {/* Header */}
                      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500/10">
                          <Activity className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                          <p className="font-semibold leading-tight">
                            Tracking Perjalanan Saya
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Perbarui status perjalanan Anda secara real-time
                          </p>
                        </div>
                      </div>

                      <CardContent className="space-y-3 px-5 py-5">
                        {!trackingReady && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-600/30 dark:bg-amber-950/20 dark:text-amber-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4" />
                              <p>
                                Perjalanan belum bisa dimulai karena masih ada anggota yang menunggu persetujuan atau konfirmasi.
                              </p>
                            </div>
                          </div>
                        )}
                        {/* Journey milestone cards — vertical stack */}
                        {MILESTONES.map((ms, idx) => {
                          const msIdx = ORDER.indexOf(ms.key);
                          const isDone = msIdx <= currentIdx;
                          const isNext = msIdx === currentIdx + 1;
                          const isPending = msIdx > currentIdx + 1;

                          return (
                            <div key={ms.key} className="relative">
                              {/* Connector line between cards */}
                              {idx < MILESTONES.length - 1 && (
                                <div
                                  className={`absolute left-[27px] top-[60px] h-[calc(100%_-_8px)] w-0.5 ${isDone ? "bg-green-400" : "bg-border/60"}`}
                                  style={{
                                    top: "60px",
                                    height: "calc(100% - 4px)",
                                  }}
                                />
                              )}

                              <div
                                className={`relative flex items-start gap-4 rounded-2xl p-4 transition-all ${
                                  isDone
                                    ? "border border-green-200/80 bg-green-50/60 dark:border-green-800/40 dark:bg-green-900/10"
                                    : isNext
                                      ? "border-2 border-teal-400/70 bg-teal-50/60 shadow-sm dark:border-teal-500/50 dark:bg-teal-900/15"
                                      : "border border-border/40 bg-muted/20 opacity-55"
                                }`}
                              >
                                {/* Icon circle */}
                                <div
                                  className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full ${
                                    isDone
                                      ? "bg-green-500 text-white"
                                      : isNext
                                        ? "bg-teal-500 text-white"
                                        : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {isDone ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                  ) : (
                                    <ms.icon className="h-5 w-5" />
                                  )}
                                </div>

                                {/* Content */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p
                                        className={`text-sm font-semibold leading-tight ${
                                          isDone
                                            ? "text-green-800 dark:text-green-300"
                                            : isNext
                                              ? "text-teal-800 dark:text-teal-300"
                                              : "text-muted-foreground"
                                        }`}
                                      >
                                        {ms.label}
                                      </p>
                                      {isDone && ms.timestamp ? (
                                        <p className="mt-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                                          {formatDate(ms.timestamp)},{" "}
                                          {formatTime(ms.timestamp)}
                                        </p>
                                      ) : !isPending ? (
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {ms.description}
                                        </p>
                                      ) : null}
                                    </div>

                                    {/* Status badge */}
                                    <span
                                      className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                        isDone
                                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                          : isNext
                                            ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400"
                                            : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {isDone
                                        ? "Selesai ✓"
                                        : isNext
                                          ? "Selanjutnya"
                                          : "Menunggu"}
                                    </span>
                                  </div>

                                  {/* Action button inside the "next" card */}
                                  {isNext && !isIssue && (
                                    <Button
                                      className="mt-3 min-h-[44px] w-full bg-teal-600 font-semibold text-white hover:bg-teal-700"
                                      onClick={() => {
                                        const eligible = (
                                          missionMembers ?? []
                                        ).filter((m) => {
                                          const ms2 = m.memberTripStatus;
                                          const eligible2 =
                                            ms.actionMilestone === "departed"
                                              ? !ms2 || ms2 === "ready"
                                              : ms.actionMilestone === "arrived"
                                                ? ms2 === "departed"
                                                : ms.actionMilestone ===
                                                    "activity_done"
                                                  ? ms2 === "arrived"
                                                  : ms.actionMilestone ===
                                                      "returned"
                                                    ? ms2 === "activity_done" ||
                                                      ms2 === "arrived" ||
                                                      ms2 === "departed"
                                                    : false;
                                          return eligible2;
                                        });
                                        const selfUid = userProfile?.uid;
                                        resetMilestoneEvidence();
                                        setPendingMilestone({
                                          milestone: ms.actionMilestone,
                                          eligible,
                                        });
                                        setGroupSelectedUids(
                                          selfUid ? [selfUid] : [],
                                        );
                                        captureMilestoneGps();
                                      }}
                                      disabled={isSaving || !trackingReady}
                                    >
                                      <ms.icon className="mr-2 h-4 w-4" />
                                      {ms.actionLabel}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Active issue banner */}
                        {isIssue && (
                          <div className="rounded-2xl border border-amber-400/50 bg-amber-50/50 p-4 dark:border-amber-700/40 dark:bg-amber-900/15">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                                  Kendala Dilaporkan
                                </p>
                                {selectedMember.issueCategory && (
                                  <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                                    {selectedMember.issueCategory}
                                    {selectedMember.issueUrgency
                                      ? ` · Urgensi: ${selectedMember.issueUrgency}`
                                      : ""}
                                  </p>
                                )}
                                {selectedMember.issueNote && (
                                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                                    {selectedMember.issueNote}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Laporkan Kendala — compact warning card */}
                        {!isIssue &&
                          (!showIssueInput ? (
                            <button
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/40 px-4 py-3 text-left transition-colors hover:bg-amber-100/60 dark:border-amber-700/30 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
                              onClick={() => setShowIssueInput(true)}
                            >
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                                  Ada kendala dalam perjalanan?
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-500">
                                  Tap untuk melaporkan kendala
                                </p>
                              </div>
                              <ArrowRightCircle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                            </button>
                          ) : (
                            <div className="space-y-3 rounded-2xl border border-amber-400/50 bg-amber-50/30 p-4 dark:border-amber-700/40 dark:bg-amber-900/10">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                                  Laporan Kendala
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-muted-foreground">
                                    Kategori
                                  </Label>
                                  <Select
                                    value={issueForm.category}
                                    onValueChange={(v) =>
                                      setIssueForm((p) => ({
                                        ...p,
                                        category: v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="mt-1 border-amber-300 dark:border-amber-700">
                                      <SelectValue placeholder="Pilih..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[
                                        "Transportasi",
                                        "Jadwal",
                                        "Kesehatan",
                                        "Dokumen",
                                        "Lokasi",
                                        "Lainnya",
                                      ].map((c) => (
                                        <SelectItem key={c} value={c}>
                                          {c}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">
                                    Urgensi
                                  </Label>
                                  <Select
                                    value={issueForm.urgency}
                                    onValueChange={(v) =>
                                      setIssueForm((p) => ({
                                        ...p,
                                        urgency: v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="mt-1 border-amber-300 dark:border-amber-700">
                                      <SelectValue placeholder="Pilih..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="rendah">
                                        Rendah
                                      </SelectItem>
                                      <SelectItem value="sedang">
                                        Sedang
                                      </SelectItem>
                                      <SelectItem value="tinggi">
                                        Tinggi
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Catatan Kendala
                                </Label>
                                <Textarea
                                  value={issueForm.note}
                                  onChange={(e) =>
                                    setIssueForm((p) => ({
                                      ...p,
                                      note: e.target.value,
                                    }))
                                  }
                                  rows={3}
                                  className="mt-1 resize-none border-amber-300 dark:border-amber-700"
                                  placeholder="Tuliskan kendala yang dihadapi..."
                                />
                              </div>
                              <div className="flex gap-2 pt-1">
                                <Button
                                  className="min-h-[44px] flex-1 bg-amber-600 font-semibold text-white hover:bg-amber-700"
                                  onClick={() => {
                                    const eligible = (
                                      missionMembers ?? []
                                    ).filter((m) => {
                                      const ts = m.memberTripStatus;
                                      return (
                                        ts === "departed" ||
                                        ts === "arrived" ||
                                        ts === "activity_done" ||
                                        ts === "return_started"
                                      );
                                    });
                                    const selfUid = userProfile?.uid;
                                    resetMilestoneEvidence();
                                    setPendingMilestone({
                                      milestone: "issue_reported",
                                      eligible,
                                    });
                                    setGroupSelectedUids(
                                      selfUid ? [selfUid] : [],
                                    );
                                  }}
                                  disabled={isSaving || !issueForm.note.trim()}
                                >
                                  Kirim Laporan Kendala
                                </Button>
                                <Button
                                  variant="outline"
                                  className="min-h-[44px] border-amber-300 px-4 dark:border-amber-700"
                                  onClick={() => {
                                    setShowIssueInput(false);
                                    setIssueForm({
                                      category: "",
                                      urgency: "",
                                      note: "",
                                      attachment: null,
                                    });
                                  }}
                                >
                                  Batal
                                </Button>
                              </div>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  );
                })()
              : null}

            {/* ── Repair Requests Panel ──────────────────────────── */}
            {mode === "staff" && repairRequests.length > 0 && selectedMember && (
              <Card className="border-2 border-amber-400/50 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex items-center gap-3 border-b border-amber-200/40 dark:border-amber-800/40 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
                    <Upload className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold leading-tight text-amber-700 dark:text-amber-300">
                      Upload Ulang Bukti Perjalanan
                    </p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
                      HRD/Direktur meminta Anda untuk mengupload ulang bukti yang belum lengkap
                    </p>
                  </div>
                </div>
                <CardContent className="px-5 py-4 space-y-3">
                  {repairRequests.map((repair) => {
                    const milestoneLabelMap: Record<string, string> = {
                      departed: "Keberangkatan",
                      arrived: "Kedatangan",
                      activity_done: "Penyelesaian Aktivitas",
                      returned: "Kepulangan",
                    };
                    const milestoneLabel = milestoneLabelMap[repair.milestoneType] || repair.milestoneType;

                    return (
                      <div
                        key={repair.id}
                        className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-muted/20 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-foreground">{milestoneLabel}</p>
                            {repair.repairRequestedByName && (
                              <p className="text-xs text-muted-foreground">Diminta oleh: <span className="font-medium">{repair.repairRequestedByName}</span></p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setActiveRepairRequest(repair);
                              setRepairUploadPhotos([]);
                              setRepairGps({ status: "idle" });
                              setRepairManualLocation("");
                            }}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors whitespace-nowrap"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Upload Ulang
                          </button>
                        </div>

                        {repair.targetMemberNames && repair.targetMemberNames.length > 0 && (
                          <p className="text-xs text-muted-foreground">Untuk: <span className="font-medium">{repair.targetMemberNames.join(", ")}</span></p>
                        )}

                        {repair.repairReason && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20 rounded px-2 py-1">
                            📋 Alasan: {repair.repairReason}
                          </p>
                        )}

                        {repair.repairRequestedAt && (
                          <p className="text-[10px] text-muted-foreground">
                            🕐 {formatDateTime(repair.repairRequestedAt)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* ── Repair Upload Panel (when activeRepairRequest is set) ──────────────────────────── */}
            {mode === "staff" && activeRepairRequest && selectedMember && (
              <Card className="border-2 border-amber-400/50 dark:border-amber-500/30">
                <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
                    <Upload className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold leading-tight">
                      Upload Ulang Bukti
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const labels: Record<string, string> = {
                          departed: "Keberangkatan",
                          arrived: "Kedatangan",
                          activity_done: "Penyelesaian Aktivitas",
                          returned: "Kepulangan",
                        };
                        return labels[activeRepairRequest.milestoneType] || activeRepairRequest.milestoneType;
                      })()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-1 hover:bg-muted"
                    onClick={() => {
                      setActiveRepairRequest(null);
                      setRepairUploadPhotos([]);
                      setRepairGps({ status: "idle" });
                      setRepairManualLocation("");
                    }}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <CardContent className="px-5 py-4 space-y-3">
                  {/* GPS Lokasi */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MapPin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-foreground">Lokasi GPS</span>

                      {repairGps.status === "capturing" && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse">
                          Mendeteksi…
                        </span>
                      )}
                      {repairGps.status === "captured" && (
                        <>
                          <span className="text-[10px] text-green-600 dark:text-green-400">Terdeteksi ✓</span>
                          {repairGps.trustLevel === "high" && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              GPS Valid
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {repairGps.status === "captured" && (
                      <div className="text-xs font-mono text-muted-foreground bg-muted/50 dark:bg-muted/20 px-3 py-2 rounded-lg">
                        {repairGps.latitude?.toFixed(6)}, {repairGps.longitude?.toFixed(6)}
                      </div>
                    )}

                    {repairGps.status === "unavailable" && (
                      <div className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                        <p className="text-[11px] text-destructive">
                          Lokasi otomatis gagal. Laporan akan ditandai sebagai input manual.
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={repairGps.status === "capturing"}
                      onClick={async () => {
                        setRepairGps({ status: "capturing" });
                        try {
                          const position = await new Promise<GeolocationCoordinates>((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => resolve(pos.coords),
                              (err) => reject(err),
                              { timeout: 30000, maximumAge: 0 },
                            );
                          });

                          setRepairGps({
                            status: "captured",
                            latitude: position.latitude,
                            longitude: position.longitude,
                            accuracy: position.accuracy,
                            trustLevel: position.accuracy <= 15 ? "high" : position.accuracy <= 50 ? "medium" : "low",
                          });
                        } catch (error: any) {
                          console.error("GPS capture error:", error);
                          setRepairGps({ status: "unavailable" });
                        }
                      }}
                      className="text-xs text-amber-600 hover:underline dark:text-amber-400"
                    >
                      {repairGps.status === "capturing" ? "Mendeteksi..." : repairGps.status === "captured" ? "Deteksi Ulang" : "Deteksi Lokasi"}
                    </button>
                  </div>

                  {/* Catatan Lokasi */}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Catatan lokasi tambahan (opsional)
                    </Label>
                    <Textarea
                      value={repairManualLocation}
                      onChange={(e) => setRepairManualLocation(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                      placeholder="Contoh: Pintu gerbang depan, basement"
                    />
                  </div>

                  {/* Foto */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                      Foto Bukti <span className="text-destructive">*Wajib</span>
                      {repairUploadPhotos.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                          {repairUploadPhotos.length}/3 foto
                        </span>
                      )}
                    </p>

                    {repairUploadPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {repairUploadPhotos.map((p, idx) => (
                          <div key={idx} className="relative">
                            <div className="h-[72px] w-[72px] overflow-hidden rounded-lg border border-border">
                              <img src={p.preview} alt={`foto ${idx + 1}`} className="h-full w-full object-cover" />
                            </div>
                            <button
                              type="button"
                              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive shadow"
                              onClick={() => {
                                URL.revokeObjectURL(p.preview);
                                setRepairUploadPhotos((prev) => prev.filter((_, i) => i !== idx));
                              }}
                            >
                              <X className="h-2.5 w-2.5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {repairUploadPhotos.length < 3 ? (
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-400/60 px-4 py-3 text-sm text-amber-700 hover:bg-amber-50/50 dark:border-amber-600/40 dark:text-amber-400 dark:hover:bg-amber-900/20">
                        <Upload className="h-4 w-4 flex-shrink-0" />
                        <span>
                          {repairUploadPhotos.length === 0 ? "Pilih foto bukti" : "Tambah foto"}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          maks 3
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f || repairUploadPhotos.length >= 3) return;
                            setRepairUploadPhotos((prev) => [
                              ...prev,
                              { file: f, preview: URL.createObjectURL(f) },
                            ]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Maksimal 3 foto tercapai.
                      </p>
                    )}

                    {repairUploadPhotos.length === 0 && (
                      <p className="text-[11px] text-destructive">
                        Minimal 1 foto bukti wajib diunggah.
                      </p>
                    )}
                  </div>

                  {/* Submit Repair */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setActiveRepairRequest(null);
                        setRepairUploadPhotos([]);
                        setRepairGps({ status: "idle" });
                        setRepairManualLocation("");
                      }}
                    >
                      Batal
                    </Button>
                    <Button
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={isSaving || repairUploadPhotos.length === 0}
                      onClick={async () => {
                        if (!selectedMission?.id || !activeRepairRequest.id) return;
                        await handleRepairMilestoneEvidence(
                          selectedMission.id,
                          activeRepairRequest.id,
                          activeRepairRequest.milestoneType,
                          selectedMember.employeeName,
                          [selectedMember],
                          {
                            latitude: repairGps.latitude,
                            longitude: repairGps.longitude,
                            locationAccuracy: repairGps.accuracy,
                            locationCapturedAt: new Date(),
                            locationStatus: repairGps.status === "captured" ? "captured" : "manual",
                            locationTrustLevel: repairGps.trustLevel,
                            addressText: activeRepairRequest.addressText || undefined,
                            streetName: activeRepairRequest.streetName || undefined,
                            village: activeRepairRequest.village || undefined,
                            district: activeRepairRequest.district || undefined,
                            city: activeRepairRequest.city || undefined,
                            province: activeRepairRequest.province || undefined,
                            postalCode: activeRepairRequest.postalCode || undefined,
                            country: activeRepairRequest.country || undefined,
                            geocodeStatus: activeRepairRequest.geocodeStatus || undefined,
                            manualLocationNote: repairManualLocation,
                            note: activeRepairRequest.note || undefined,
                            photos: repairUploadPhotos.map((p) => p.file),
                          },
                        );
                        setActiveRepairRequest(null);
                        setRepairUploadPhotos([]);
                        setRepairGps({ status: "idle" });
                        setRepairManualLocation("");
                      }}
                    >
                      {isSaving ? "Mengupload..." : "Upload Bukti"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Group Milestone Selection Panel ──────────────────────────── */}
            {mode === "staff" && pendingMilestone && selectedMember && (
              <Card className="border-2 border-teal-400/50 dark:border-teal-500/30">
                <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500/10">
                    <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold leading-tight">
                      {pendingMilestone.milestone === "departed"
                        ? "Konfirmasi Keberangkatan"
                        : pendingMilestone.milestone === "arrived"
                          ? "Konfirmasi Tiba di Lokasi"
                          : pendingMilestone.milestone === "activity_done"
                            ? "Konfirmasi Kegiatan Selesai"
                            : pendingMilestone.milestone === "returned"
                              ? "Konfirmasi Kembali"
                              : "Laporan Kendala"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pilih anggota yang akan diperbarui statusnya
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-1 hover:bg-muted"
                    onClick={() => {
                      setPendingMilestone(null);
                      setGroupSelectedUids([]);
                      resetMilestoneEvidence();
                    }}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <CardContent className="px-5 py-4 space-y-3">
                  {pendingMilestone.eligible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Tidak ada anggota yang dapat diperbarui untuk langkah ini.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {groupSelectedUids.length} dari{" "}
                          {pendingMilestone.eligible.length} dipilih
                        </span>
                        <button
                          type="button"
                          className="text-xs text-teal-600 hover:underline dark:text-teal-400"
                          onClick={() => {
                            if (
                              groupSelectedUids.length ===
                              pendingMilestone.eligible.length
                            ) {
                              setGroupSelectedUids([]);
                            } else {
                              setGroupSelectedUids(
                                pendingMilestone.eligible.map(
                                  (m) => m.employeeUid,
                                ),
                              );
                            }
                          }}
                        >
                          {groupSelectedUids.length ===
                          pendingMilestone.eligible.length
                            ? "Batalkan semua"
                            : "Pilih semua"}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {pendingMilestone.eligible.map((member) => {
                          const checked = groupSelectedUids.includes(
                            member.employeeUid,
                          );
                          return (
                            <label
                              key={member.employeeUid}
                              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${checked ? "border-teal-400 bg-teal-50/60 dark:border-teal-500/50 dark:bg-teal-900/15" : "border-border hover:bg-muted/40"}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setGroupSelectedUids((prev) =>
                                    checked
                                      ? prev.filter(
                                          (u) => u !== member.employeeUid,
                                        )
                                      : [...prev, member.employeeUid],
                                  );
                                }}
                                className="h-4 w-4 rounded accent-teal-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {member.employeeName}
                                </p>
                                {member.employeePosition && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {member.employeePosition}
                                  </p>
                                )}
                              </div>
                              {member.employeeUid === userProfile?.uid && (
                                <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 flex-shrink-0">
                                  Saya
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {/* ── Bukti Milestone (GPS + Foto + Catatan) ── */}
                      {pendingMilestone.milestone !== "issue_reported" && (
                        <div className="mt-1 space-y-3 rounded-xl border border-teal-300/50 bg-teal-50/30 p-4 dark:border-teal-700/30 dark:bg-teal-900/10">
                          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide">
                            Bukti Milestone
                          </p>

                          {/* ── GPS Lokasi ── */}
                          <div className="space-y-2">
                            {/* Header row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <MapPin className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                              <span className="text-xs font-medium text-foreground">Lokasi GPS</span>

                              {milestoneGps.status === "capturing" && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse">
                                  Mendeteksi…
                                </span>
                              )}
                              {milestoneGps.status === "captured" && (
                                <>
                                  <span className="text-[10px] text-green-600 dark:text-green-400">Terdeteksi ✓</span>
                                  {milestoneGps.trustLevel === "high" && (
                                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                      GPS Valid
                                    </span>
                                  )}
                                  {milestoneGps.trustLevel === "medium" && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                      GPS Lemah
                                    </span>
                                  )}
                                  {milestoneGps.trustLevel === "low" && (
                                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                      Akurasi Rendah
                                    </span>
                                  )}
                                </>
                              )}
                              {milestoneGps.status === "unavailable" && (
                                <span className="text-[10px] text-destructive">Tidak tersedia</span>
                              )}

                              {/* Retry — type="button" + stopPropagation agar tidak trigger confirm */}
                              {milestoneGps.status !== "capturing" && (
                                <button
                                  type="button"
                                  className="ml-auto text-[10px] font-medium text-teal-600 hover:underline dark:text-teal-400"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void captureMilestoneGps();
                                  }}
                                >
                                  Ulangi Ambil Lokasi
                                </button>
                              )}
                            </div>

                            {/* GPS captured detail */}
                            {milestoneGps.status === "captured" && (
                              <div className="pl-5 space-y-1.5">
                                {(milestoneGps.trustLevel === "medium" || milestoneGps.trustLevel === "low") && (
                                  <div className="flex items-start gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50/50 px-3 py-2 dark:border-amber-700/30 dark:bg-amber-900/10">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                                    <p className="text-[11px] text-amber-800 dark:text-amber-300">
                                      Akurasi lokasi rendah ({Math.round(milestoneGps.accuracy ?? 0)}m). Ulangi GPS atau tambah catatan lokasi.
                                    </p>
                                  </div>
                                )}

                                {milestoneGps.geocodeStatus === "success" && milestoneGps.addressText ? (
                                  <p className="text-xs text-foreground leading-snug">{milestoneGps.addressText}</p>
                                ) : milestoneGps.geocodeStatus === "failed" ? (
                                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                    Alamat tidak berhasil dibaca, koordinat tetap tersimpan.
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground animate-pulse">Membaca alamat…</p>
                                )}

                                <p className="text-[11px] font-mono text-muted-foreground">
                                  {milestoneGps.latitude?.toFixed(6)}, {milestoneGps.longitude?.toFixed(6)}
                                  {milestoneGps.accuracy != null && ` · ±${Math.round(milestoneGps.accuracy)}m`}
                                </p>

                                {milestoneGps.latitude != null && milestoneGps.longitude != null && (
                                  <a
                                    href={`https://www.google.com/maps?q=${milestoneGps.latitude},${milestoneGps.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:underline dark:text-teal-400"
                                  >
                                    <MapPin className="h-3 w-3" />
                                    Buka Maps
                                  </a>
                                )}
                              </div>
                            )}

                            {/* GPS unavailable warning */}
                            {milestoneGps.status === "unavailable" && (
                              <div className="pl-5">
                                <div className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                                  <p className="text-[11px] text-destructive">
                                    Lokasi otomatis gagal. Laporan akan ditandai sebagai input manual.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* ── Catatan Lokasi (satu field, required jika GPS gagal) ── */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Catatan lokasi tambahan{" "}
                              {milestoneGps.status === "unavailable" ? (
                                <span className="text-destructive">*wajib</span>
                              ) : (
                                <span className="text-muted-foreground/60">
                                  (opsional{milestoneGps.trustLevel === "medium" || milestoneGps.trustLevel === "low" ? ", disarankan" : ""})
                                </span>
                              )}
                            </Label>
                            <p className="text-[10px] text-muted-foreground/70">
                              Isi jika GPS lemah/gagal atau lokasi perlu penjelasan tambahan, misalnya di basement, area parkir, pintu belakang, atau titik kumpul.
                            </p>
                            <Textarea
                              value={milestoneManualLocation}
                              onChange={(e) => setMilestoneManualLocation(e.target.value)}
                              rows={2}
                              className={`mt-0.5 text-sm resize-none ${milestoneGps.status === "unavailable" ? "border-destructive/50" : ""}`}
                              placeholder="Contoh: Pintu gerbang depan PT ABC, dekat area parkir basement"
                            />
                          </div>

                          {/* ── Foto Bukti Wajib ── */}
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">
                                {getEvidenceType(pendingMilestone.milestone)}{" "}
                                <span className="text-destructive">*Wajib</span>
                                {milestonePhotos.length > 0 && (
                                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                    {milestonePhotos.length}/3 foto
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {getMilestonePhotoHelper(pendingMilestone.milestone)}
                              </p>
                            </div>

                            {/* Thumbnail grid */}
                            {milestonePhotos.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {milestonePhotos.map((p, idx) => (
                                  <div key={idx} className="relative">
                                    <div className="h-[72px] w-[72px] overflow-hidden rounded-lg border border-border">
                                      <img
                                        src={p.preview}
                                        alt={`foto ${idx + 1}`}
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive shadow"
                                      onClick={() => {
                                        URL.revokeObjectURL(p.preview);
                                        setMilestonePhotos((prev) => prev.filter((_, i) => i !== idx));
                                      }}
                                    >
                                      <X className="h-2.5 w-2.5 text-white" />
                                    </button>
                                    <p className="mt-0.5 max-w-[72px] truncate text-[9px] text-muted-foreground">
                                      {Math.round(p.file.size / 1024)} KB
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add photo button — disabled at 3 */}
                            {milestonePhotos.length < 3 ? (
                              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-teal-400/60 px-4 py-3 text-sm text-teal-700 hover:bg-teal-50/50 dark:border-teal-600/40 dark:text-teal-400 dark:hover:bg-teal-900/20">
                                <Upload className="h-4 w-4 flex-shrink-0" />
                                <span>
                                  {milestonePhotos.length === 0 ? "Pilih foto bukti" : "Tambah foto"}
                                </span>
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  maks 3
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f || milestonePhotos.length >= 3) return;
                                    setMilestonePhotos((prev) => [
                                      ...prev,
                                      { file: f, preview: URL.createObjectURL(f) },
                                    ]);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                Maksimal 3 foto tercapai.
                              </p>
                            )}

                            {/* Validation message */}
                            {milestonePhotos.length === 0 && (
                              <p className="text-[11px] text-destructive">
                                Minimal 1 foto bukti wajib diunggah sebelum melanjutkan.
                              </p>
                            )}

                            {/* Info */}
                            <p className="text-[10px] text-muted-foreground/70">
                              Dikompres maks 1200px · kualitas 70% · disimpan 7 hari
                            </p>
                          </div>
                        </div>
                      )}

                      <Button
                        className="min-h-[44px] w-full bg-teal-600 font-semibold text-white hover:bg-teal-700 mt-2"
                        disabled={
                          isSaving ||
                          groupSelectedUids.length === 0 ||
                          (pendingMilestone.milestone !== "issue_reported" && milestonePhotos.length === 0) ||
                          (pendingMilestone.milestone !== "issue_reported" &&
                            milestoneGps.status === "unavailable" &&
                            !milestoneManualLocation.trim())
                        }
                        onClick={() => {
                          const targets = pendingMilestone.eligible.filter(
                            (m) => groupSelectedUids.includes(m.employeeUid),
                          );
                          handleGroupTripMilestone(
                            selectedMember!.missionId,
                            targets,
                            pendingMilestone.milestone,
                            pendingMilestone.milestone === "issue_reported"
                              ? {
                                  issueCategory: issueForm.category,
                                  issueUrgency: issueForm.urgency,
                                  issueNote: issueForm.note,
                                }
                              : undefined,
                            pendingMilestone.milestone !== "issue_reported"
                              ? {
                                  latitude: milestoneGps.latitude,
                                  longitude: milestoneGps.longitude,
                                  locationAccuracy: milestoneGps.accuracy,
                                  locationCapturedAt: milestoneGps.capturedAt,
                                  locationStatus:
                                    milestoneGps.status === "captured"
                                      ? "captured"
                                      : milestoneManualLocation.trim()
                                        ? "manual"
                                        : "unavailable",
                                  addressText: milestoneGps.addressText,
                                  streetName: milestoneGps.streetName,
                                  village: milestoneGps.village,
                                  district: milestoneGps.district,
                                  city: milestoneGps.city,
                                  province: milestoneGps.province,
                                  postalCode: milestoneGps.postalCode,
                                  country: milestoneGps.country,
                                  geocodeStatus: milestoneGps.geocodeStatus,
                                  locationTrustLevel: milestoneGps.trustLevel,
                                  gpsPermissionStatus: milestoneGps.gpsPermissionStatus,
                                  deviceTimestamp: new Date().toISOString(),
                                  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
                                  manualLocationNote:
                                    milestoneGps.status !== "captured"
                                      ? milestoneManualLocation
                                      : milestoneManualLocation.trim() || undefined,
                                  note: milestoneNote || undefined,
                                  photos: milestonePhotos.map((p) => p.file),
                                }
                              : undefined,
                          );
                        }}
                      >
                        {isSaving ? "Menyimpan…" : `Konfirmasi untuk ${groupSelectedUids.length} Anggota`}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Final Report Panel — shown when member has returned */}
            {mode === "staff" &&
            selectedMember &&
            selectedMission &&
            (selectedMember.memberTripStatus === "returned" ||
              selectedMember.memberStatus === "returned")
              ? (() => {
                  const reportMode = localReportMode;
                  const isTeamReportSubmitted = !!(
                    finalReport && finalReport.submittedAt
                  );
                  const isTeamReportDraft = !!(
                    finalReport && !finalReport.submittedAt
                  );
                  const myMemberReport =
                    memberFinalReports[userProfile?.uid ?? ""];
                  const isMyReportSubmitted = !!(
                    myMemberReport && myMemberReport.submittedAt
                  );
                  const isMyReportDraft = !!(
                    myMemberReport && !myMemberReport.submittedAt
                  );
                  const missionSubmitted =
                    selectedMission.status === "final_report_submitted" ||
                    selectedMission.status === "completed";
                  const totalMembers = missionMembers.length;
                  const submittedIndividualCount = Object.values(
                    memberFinalReports,
                  ).filter((r) => !!r.submittedAt).length;

                  return (
                    <Card className="overflow-hidden border-2 border-blue-500/30 dark:border-blue-400/20">
                      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10">
                          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold leading-tight">
                            Laporan Akhir Dinas
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {reportMode === "team_report"
                              ? "Laporan Tim"
                              : "Laporan Individu"}
                          </p>
                        </div>
                        {missionSubmitted && (
                          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Terkirim
                          </span>
                        )}
                      </div>

                      <CardContent className="space-y-5 px-5 py-5">
                        {/* ── Mode selector ── */}
                        {!missionSubmitted && (
                          <div className="space-y-2">
                            <label
                              htmlFor="report-mode-select"
                              className="block text-sm font-semibold"
                            >
                              Pilih Jenis Laporan
                            </label>
                            <select
                              id="report-mode-select"
                              value={reportMode}
                              onChange={(e) =>
                                handleSetReportMode(
                                  e.target.value as
                                    | "team_report"
                                    | "individual_report",
                                )
                              }
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="team_report">Laporan Tim</option>
                              <option value="individual_report">
                                Laporan Individu
                              </option>
                            </select>
                            <p className="text-xs text-muted-foreground px-0.5">
                              {reportMode === "team_report"
                                ? "Satu laporan mewakili seluruh anggota tim dalam perjalanan dinas ini."
                                : "Laporan ini hanya untuk pekerjaan dan catatan Anda sendiri."}
                            </p>
                          </div>
                        )}

                        {/* ── TEAM REPORT ── */}
                        {reportMode === "team_report" && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-foreground">
                                Laporan Tim
                              </p>
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                Mewakili {totalMembers} anggota
                              </span>
                            </div>

                            {isTeamReportSubmitted &&
                            finalReport!.reportReviewStatus ===
                              "revision_requested" &&
                            !showFinalReportPanel ? (
                              // Revision requested — show revision card with re-edit button
                              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2 dark:border-amber-700/30 dark:bg-amber-900/10">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                    Direktur meminta revisi laporan
                                  </p>
                                </div>
                                {finalReport!.revisionNote && (
                                  <div className="rounded border border-amber-200 bg-amber-50/60 px-2.5 py-2 dark:border-amber-700/20 dark:bg-amber-900/20">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                                      Catatan Revisi:
                                    </p>
                                    <p className="text-sm text-amber-800 dark:text-amber-300">
                                      {finalReport!.revisionNote}
                                    </p>
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  className="bg-amber-600 text-white hover:bg-amber-700 mt-1"
                                  onClick={handleOpenTeamReportForm}
                                >
                                  Edit &amp; Kirim Ulang
                                </Button>
                              </div>
                            ) : isTeamReportSubmitted &&
                              finalReport!.reportReviewStatus !==
                                "revision_requested" ? (
                              // Submitted and not needing revision
                              <div
                                className={`rounded-xl border p-4 space-y-2 ${
                                  finalReport!.reportReviewStatus === "approved"
                                    ? "border-green-200 bg-green-50/50 dark:border-green-800/40 dark:bg-green-900/10"
                                    : finalReport!.reportReviewStatus ===
                                        "resubmitted"
                                      ? "border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-900/10"
                                      : "border-border/60 bg-muted/20"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2
                                      className={`h-4 w-4 ${finalReport!.reportReviewStatus === "approved" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                                    />
                                    <p className="text-sm font-medium">
                                      {finalReport!.reportReviewStatus ===
                                      "approved"
                                        ? "Laporan disetujui"
                                        : finalReport!.reportReviewStatus ===
                                            "resubmitted"
                                          ? "Laporan dikirim ulang — menunggu review"
                                          : "Laporan sudah dikirim — menunggu review"}
                                    </p>
                                  </div>
                                  {finalReport!.reportReviewStatus ===
                                    "approved" && (
                                    <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                                      Disetujui
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Dilaporkan oleh:{" "}
                                  {finalReport!.dilaporkanOlehName}
                                </p>
                                {finalReport!.ringkasanKegiatan && (
                                  <div className="pt-1">
                                    <p className="text-xs font-medium text-muted-foreground">
                                      Ringkasan:
                                    </p>
                                    <p className="text-sm">
                                      {finalReport!.ringkasanKegiatan}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : showFinalReportPanel ? (
                              <div className="space-y-3">
                                {isTeamReportSubmitted &&
                                  finalReport!.reportReviewStatus ===
                                    "revision_requested" &&
                                  finalReport!.revisionNote && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-700/30 dark:bg-amber-900/10">
                                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                                        Catatan Revisi:
                                      </p>
                                      <p className="text-xs text-amber-800 dark:text-amber-300">
                                        {finalReport!.revisionNote}
                                      </p>
                                    </div>
                                  )}
                                {isTeamReportDraft && (
                                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/30 dark:bg-amber-900/10 dark:text-amber-400">
                                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                                    Draft tersimpan — lanjutkan mengisi atau
                                    kirim laporan.
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Label htmlFor="fr-ringkasan">
                                    Ringkasan kegiatan{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Textarea
                                    id="fr-ringkasan"
                                    rows={3}
                                    placeholder="Deskripsikan kegiatan utama yang dilakukan selama dinas."
                                    value={teamReportForm.ringkasanKegiatan}
                                    onChange={(e) =>
                                      setTeamReportForm((p) => ({
                                        ...p,
                                        ringkasanKegiatan: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="fr-hasil">
                                    Hasil / Output{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Textarea
                                    id="fr-hasil"
                                    rows={3}
                                    placeholder="Tuliskan hasil, output, atau pencapaian dari perjalanan dinas ini."
                                    value={teamReportForm.hasilOutput}
                                    onChange={(e) =>
                                      setTeamReportForm((p) => ({
                                        ...p,
                                        hasilOutput: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label htmlFor="fr-kendala">
                                      Kendala &amp; Solusi
                                    </Label>
                                    <Textarea
                                      id="fr-kendala"
                                      rows={2}
                                      placeholder="Kendala yang dihadapi dan bagaimana diselesaikan."
                                      value={teamReportForm.kendalaDanSolusi}
                                      onChange={(e) =>
                                        setTeamReportForm((p) => ({
                                          ...p,
                                          kendalaDanSolusi: e.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor="fr-tindaklanjut">
                                      Tindak Lanjut
                                    </Label>
                                    <Textarea
                                      id="fr-tindaklanjut"
                                      rows={2}
                                      placeholder="Rencana tindak lanjut setelah dinas ini."
                                      value={teamReportForm.tindakLanjut}
                                      onChange={(e) =>
                                        setTeamReportForm((p) => ({
                                          ...p,
                                          tindakLanjut: e.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="fr-hrd">
                                    Catatan untuk HRD
                                  </Label>
                                  <Textarea
                                    id="fr-hrd"
                                    rows={2}
                                    placeholder="Informasi tambahan khusus untuk HRD (opsional)."
                                    value={teamReportForm.catatanUntukHRD}
                                    onChange={(e) =>
                                      setTeamReportForm((p) => ({
                                        ...p,
                                        catatanUntukHRD: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="fr-lampiran">
                                    Upload Lampiran
                                  </Label>
                                  <input
                                    id="fr-lampiran"
                                    type="file"
                                    accept="image/*,.pdf,.doc,.docx"
                                    onChange={(e) =>
                                      setTeamReportForm((p) => ({
                                        ...p,
                                        lampiranFile:
                                          e.target.files?.[0] ?? null,
                                      }))
                                    }
                                    className="mt-1 block w-full text-sm"
                                  />
                                  <p className="text-[11px] text-muted-foreground">
                                    Format: gambar, PDF, atau dokumen Word.
                                    Maks. 10 MB.
                                  </p>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleSaveDraftTeamReport}
                                    disabled={isSubmittingFinalReport}
                                  >
                                    <FileText className="mr-2 h-4 w-4" /> Simpan
                                    Draft
                                  </Button>
                                  <Button
                                    className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                                    onClick={handleSubmitTeamReport}
                                    disabled={isSubmittingFinalReport}
                                  >
                                    <FileCheck className="mr-2 h-4 w-4" /> Kirim
                                    Laporan
                                  </Button>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-muted-foreground"
                                  onClick={() => setShowFinalReportPanel(false)}
                                >
                                  Batal
                                </Button>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-7 px-4 text-center space-y-3">
                                <div className="flex justify-center">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">
                                    {isTeamReportDraft
                                      ? "Draft laporan tim tersimpan"
                                      : "Belum ada laporan tim"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {isTeamReportDraft
                                      ? "Lanjutkan mengisi laporan atau kirim sekarang."
                                      : "Buat satu laporan utama yang mewakili hasil perjalanan dinas tim."}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={handleOpenTeamReportForm}
                                >
                                  <FileText className="mr-2 h-3.5 w-3.5" />
                                  {isTeamReportDraft
                                    ? "Lanjut Isi Laporan"
                                    : "+ Buat Laporan Tim"}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── INDIVIDUAL REPORT ── */}
                        {reportMode === "individual_report" && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">
                                Laporan Individu Saya
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {submittedIndividualCount}/{totalMembers}{" "}
                                laporan individu terkumpul
                              </span>
                            </div>

                            {isMyReportSubmitted &&
                            myMemberReport!.reportReviewStatus ===
                              "revision_requested" &&
                            !showFinalReportPanel ? (
                              // Revision requested for individual report
                              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2 dark:border-amber-700/30 dark:bg-amber-900/10">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                    Direktur meminta revisi laporan Anda
                                  </p>
                                </div>
                                {myMemberReport!.revisionNote && (
                                  <div className="rounded border border-amber-200 bg-amber-50/60 px-2.5 py-2 dark:border-amber-700/20 dark:bg-amber-900/20">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                                      Catatan Revisi:
                                    </p>
                                    <p className="text-sm text-amber-800 dark:text-amber-300">
                                      {myMemberReport!.revisionNote}
                                    </p>
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  className="bg-amber-600 text-white hover:bg-amber-700 mt-1"
                                  onClick={handleOpenMemberReportForm}
                                >
                                  Edit &amp; Kirim Ulang
                                </Button>
                              </div>
                            ) : isMyReportSubmitted &&
                              myMemberReport!.reportReviewStatus !==
                                "revision_requested" ? (
                              // Submitted normally
                              <div
                                className={`rounded-xl border p-4 space-y-1.5 ${
                                  myMemberReport!.reportReviewStatus ===
                                  "approved"
                                    ? "border-green-200 bg-green-50/50 dark:border-green-800/40 dark:bg-green-900/10"
                                    : myMemberReport!.reportReviewStatus ===
                                        "resubmitted"
                                      ? "border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-900/10"
                                      : "border-border/60 bg-muted/20"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <CheckCircle2
                                    className={`h-4 w-4 ${myMemberReport!.reportReviewStatus === "approved" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                                  />
                                  <p className="text-sm font-medium">
                                    {myMemberReport!.reportReviewStatus ===
                                    "approved"
                                      ? "Laporan disetujui"
                                      : myMemberReport!.reportReviewStatus ===
                                          "resubmitted"
                                        ? "Laporan dikirim ulang — menunggu review"
                                        : "Laporan sudah dikirim — menunggu review"}
                                  </p>
                                </div>
                                {myMemberReport!.kegiatanDilakukan && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {myMemberReport!.kegiatanDilakukan}
                                  </p>
                                )}
                              </div>
                            ) : showFinalReportPanel ? (
                              <div className="space-y-3">
                                {isMyReportSubmitted &&
                                  myMemberReport!.reportReviewStatus ===
                                    "revision_requested" &&
                                  myMemberReport!.revisionNote && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-700/30 dark:bg-amber-900/10">
                                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                                        Catatan Revisi:
                                      </p>
                                      <p className="text-xs text-amber-800 dark:text-amber-300">
                                        {myMemberReport!.revisionNote}
                                      </p>
                                    </div>
                                  )}
                                {isMyReportDraft && (
                                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/30 dark:bg-amber-900/10 dark:text-amber-400">
                                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                                    Draft tersimpan — lanjutkan mengisi atau
                                    kirim laporan.
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Label htmlFor="mr-kegiatan">
                                    Kegiatan yang dilakukan{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Textarea
                                    id="mr-kegiatan"
                                    rows={3}
                                    placeholder="Deskripsikan pekerjaan yang Anda lakukan selama dinas."
                                    value={memberReportForm.kegiatanDilakukan}
                                    onChange={(e) =>
                                      setMemberReportForm((p) => ({
                                        ...p,
                                        kegiatanDilakukan: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="mr-hasil">
                                    Hasil / Pencapaian{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Textarea
                                    id="mr-hasil"
                                    rows={2}
                                    placeholder="Hasil konkret yang Anda capai."
                                    value={memberReportForm.hasilPribadi}
                                    onChange={(e) =>
                                      setMemberReportForm((p) => ({
                                        ...p,
                                        hasilPribadi: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label htmlFor="mr-kendala">Kendala</Label>
                                    <Textarea
                                      id="mr-kendala"
                                      rows={2}
                                      placeholder="Hambatan atau masalah yang Anda hadapi."
                                      value={memberReportForm.kendalaPribadi}
                                      onChange={(e) =>
                                        setMemberReportForm((p) => ({
                                          ...p,
                                          kendalaPribadi: e.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor="mr-solusi">Solusi</Label>
                                    <Textarea
                                      id="mr-solusi"
                                      rows={2}
                                      placeholder="Cara Anda mengatasi kendala tersebut."
                                      value={memberReportForm.solusiPribadi}
                                      onChange={(e) =>
                                        setMemberReportForm((p) => ({
                                          ...p,
                                          solusiPribadi: e.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="mr-catatan">
                                    Catatan Tambahan
                                  </Label>
                                  <Textarea
                                    id="mr-catatan"
                                    rows={2}
                                    placeholder="Informasi lain yang perlu disampaikan."
                                    value={memberReportForm.catatanTambahan}
                                    onChange={(e) =>
                                      setMemberReportForm((p) => ({
                                        ...p,
                                        catatanTambahan: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="mr-lampiran">
                                    Upload Lampiran
                                  </Label>
                                  <input
                                    id="mr-lampiran"
                                    type="file"
                                    accept="image/*,.pdf,.doc,.docx"
                                    onChange={(e) =>
                                      setMemberReportForm((p) => ({
                                        ...p,
                                        lampiranFile:
                                          e.target.files?.[0] ?? null,
                                      }))
                                    }
                                    className="mt-1 block w-full text-sm"
                                  />
                                  <p className="text-[11px] text-muted-foreground">
                                    Format: gambar, PDF, atau dokumen Word.
                                    Maks. 10 MB.
                                  </p>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleSaveDraftMemberReport}
                                    disabled={isSubmittingFinalReport}
                                  >
                                    <FileText className="mr-2 h-4 w-4" /> Simpan
                                    Draft
                                  </Button>
                                  <Button
                                    className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                                    onClick={handleSubmitMemberReport}
                                    disabled={isSubmittingFinalReport}
                                  >
                                    <FileCheck className="mr-2 h-4 w-4" /> Kirim
                                    Laporan
                                  </Button>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-muted-foreground"
                                  onClick={() => setShowFinalReportPanel(false)}
                                >
                                  Batal
                                </Button>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-7 px-4 text-center space-y-3">
                                <div className="flex justify-center">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">
                                    {isMyReportDraft
                                      ? "Draft laporan Anda tersimpan"
                                      : "Belum ada laporan individu"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {isMyReportDraft
                                      ? "Lanjutkan mengisi laporan atau kirim sekarang."
                                      : "Isi laporan Anda untuk melengkapi pelaporan perjalanan dinas."}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={handleOpenMemberReportForm}
                                >
                                  <FileText className="mr-2 h-3.5 w-3.5" />
                                  {isMyReportDraft
                                    ? "Lanjut Isi Laporan"
                                    : "+ Buat Laporan Individu"}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()
              : null}

            {mode === "hrd-monitor" &&
            selectedMission &&
            selectedMission.status === "pending_hrd_finalization" ? (
              <div className="space-y-3">
                <Button
                  onClick={() => handleHrdFinalize(selectedMission!)}
                  disabled={isSaving}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Finalisasi
                  Administrasi
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-4">
              <Badge variant="secondary">
                Dibuat: {formatDate(selectedMission!.createdAt)}
              </Badge>
              <Badge variant="secondary">
                Terakhir diupdate: {formatDate(selectedMission!.updatedAt)}
              </Badge>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
