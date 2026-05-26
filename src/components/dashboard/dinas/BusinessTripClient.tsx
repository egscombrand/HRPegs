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

const MISSION_STATUSES = [
  "draft_mission",
  "pending_manager_validation",
  "waiting_staff_confirmation",
  "pending_hrd_finalization",
  "approved_ready_to_depart",
  "on_duty",
  "returned_pending_report",
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

function formatCurrency(value?: number) {
  if (value == null) return "Rp 0";
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function getDestinationLabel(mission: any): string {
  return formatDestination(mission);
}

function renderStatusLabel(status?: MissionStatus | MemberStatus) {
  if (!status) return <Badge variant="secondary">Belum diisi</Badge>;
  const styleMap: Record<string, BadgeProps["variant"]> = {
    draft_mission: "secondary",
    pending_manager_validation: "warning",
    waiting_staff_confirmation: "warning",
    pending_hrd_finalization: "warning",
    approved_ready_to_depart: "success",
    on_duty: "success",
    returned_pending_report: "warning",
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
  };

  const labelMap: Record<string, string> = {
    draft_mission: "Draft misi",
    pending_manager_validation: "Menunggu persetujuan atasan",
    waiting_staff_confirmation: "Menunggu konfirmasi staff",
    pending_hrd_finalization: "Menunggu finalisasi HRD",
    approved_ready_to_depart: "Sudah siap berangkat",
    on_duty: "Sedang dinas",
    returned_pending_report: "Kembali, menunggu laporan",
    report_submitted: "Laporan sudah dikirim",
    expense_submitted: "Pengeluaran dikirim",
    settlement_review: "Review settlement",
    completed: "Selesai",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
    approved_by_manager: "Disetujui oleh atasan",
    validated_by_assigner: "Tervalidasi oleh pemberi tugas",
    replacement_requested: "Diminta ganti staff",
    rejected_by_manager: "Ditolak oleh atasan",
    confirmed_by_staff: "Dikonfirmasi staff",
    declined_by_staff: "Ditolak staff",
    ready_to_depart: "Siap berangkat",
    returned: "Sudah kembali",
  };

  const label = labelMap[status] || String(status).replace(/_/g, " ");
  return <Badge variant={styleMap[status] || "secondary"}>{label}</Badge>;
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
        status === "approved_by_manager" || status === "validated_by_assigner"
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
    }>
  >([]);
  const [missionDetailError, setMissionDetailError] = useState<string | null>(
    null,
  );
  const [selectedStaffUids, setSelectedStaffUids] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    if (mode !== "staff" || !firestore || !userProfile?.uid) {
      setStaffMemberDocs(null);
      setStaffMemberLoading(false);
      setStaffError(null);
      return;
    }

    let active = true;
    setStaffMemberLoading(true);
    setStaffError(null);

    (async () => {
      try {
        const uid = userProfile.uid;
        const candidateFields = ["employeeUid", "uid", "userId", "memberUid"];
        const docMap = new Map<string, any>();

        // Query with fallback fields - NO status filtering, get ALL assigned tasks
        for (const field of candidateFields) {
          try {
            const q = query(
              collectionGroup(firestore, "members"),
              where(field, "==", uid),
              orderBy("createdAt", "desc"),
            );
            const snap = await getDocs(q);
            snap.forEach((d) => {
              const key = d.ref.path;
              if (!docMap.has(key)) {
                const data = d.data() as any;
                // normalize employeeUid to match currentUser.uid
                data.employeeUid =
                  data.employeeUid ||
                  data.uid ||
                  data.userId ||
                  data.memberUid ||
                  null;
                docMap.set(key, { id: d.id, ...data });
              }
            });
          } catch (err) {
            // ignore individual field errors, continue
            console.warn("member field query failed", field, err);
          }
        }

        if (!active) return;
        // Sort by createdAt descending
        const items = Array.from(docMap.values()).sort((a: any, b: any) => {
          const aTime =
            a.createdAt && a.createdAt.toDate
              ? a.createdAt.toDate().getTime()
              : a.createdAt
                ? new Date(a.createdAt).getTime()
                : 0;
          const bTime =
            b.createdAt && b.createdAt.toDate
              ? b.createdAt.toDate().getTime()
              : b.createdAt
                ? new Date(b.createdAt).getTime()
                : 0;
          return bTime - aTime;
        });
        setStaffMemberDocs(items);
        console.log(
          `[Staff Mode] Loaded ${items.length} tugas untuk ${userProfile.fullName}:`,
          items.map((m) => ({
            missionName: m.missionName,
            status: m.memberStatus,
          })),
        );
      } catch (error) {
        console.error("Gagal memuat tugas staff:", error);
        if (!active) return;
        setStaffError(error);
      } finally {
        if (!active) return;
        setStaffMemberLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, firestore, userProfile?.uid, userProfile?.fullName]);

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

  const appendTimelineEntry = async (missionId: string, message: string) => {
    if (!firestore || !missionId) return;
    try {
      const timelineCollection = getMissionTimelineCollection(missionId);
      if (!timelineCollection) return;
      await addDoc(timelineCollection, {
        message,
        createdAt: serverTimestamp(),
        byUid: userProfile?.uid || null,
        byName: userProfile?.fullName || null,
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
      const membersCollection = getMissionMembersCollection(missionId);
      if (!membersCollection) return;
      const membersSnap = await getDocs(membersCollection);
      setMissionMembers(
        membersSnap.docs.map((memberDoc) => ({
          id: memberDoc.id,
          ...(memberDoc.data() as BusinessTripMissionMember),
        })),
      );

      const timelineCollection = getMissionTimelineCollection(missionId);
      if (timelineCollection) {
        const timelineSnap = await getDocs(
          query(timelineCollection, orderBy("createdAt", "desc")),
        );
        setMissionTimeline(
          timelineSnap.docs.map((entryDoc) => ({
            id: entryDoc.id,
            ...(entryDoc.data() as {
              message: string;
              createdAt: any;
              byUid?: string | null;
              byName?: string | null;
            }),
          })),
        );
      }
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

  const syncMissionStatus = async (missionId: string) => {
    if (!firestore || !missionId) return;
    const membersCollection = getMissionMembersCollection(missionId);
    if (!membersCollection) return;
    const membersSnap = await getDocs(membersCollection);
    const members = membersSnap.docs.map(
      (m) => m.data() as BusinessTripMissionMember,
    );
    const managerValidations = buildManagerValidationSummaries(members);
    const managerApprovedCount = managerValidations.filter(
      (item) => item.status === "approved",
    ).length;
    const managerValidationCount = managerValidations.length;
    const staffConfirmedCount = members.filter(
      (member) => member.staffConfirmationStatus === "confirmed_by_staff",
    ).length;
    const totalMembers = members.length;
    const allApproved =
      managerValidationCount === 0 ||
      managerValidations.every((item) => item.status === "approved");
    const allConfirmed = members.every(
      (member) => member.staffConfirmationStatus === "confirmed_by_staff",
    );
    const anyOnDuty = members.some(
      (member) => member.memberStatus === "on_duty",
    );
    const allReturned = members.every(
      (member) => member.memberStatus === "returned",
    );
    const allReported = members.every(
      (member) => member.reportStatus === "submitted",
    );

    const missionRef = getBusinessTripMissionDoc(missionId);
    if (!missionRef) return;
    const missionSnap = await getDoc(missionRef);
    if (!missionSnap.exists()) return;
    const currentStatus = missionSnap.data()?.status as MissionStatus;
    let nextStatus = currentStatus;

    if (allReported) {
      nextStatus = "report_submitted";
    } else if (allReturned) {
      nextStatus = "returned_pending_report";
    } else if (anyOnDuty) {
      nextStatus = "on_duty";
    } else if (allConfirmed && currentStatus === "waiting_staff_confirmation") {
      nextStatus = "pending_hrd_finalization";
    } else if (allApproved && currentStatus === "pending_manager_validation") {
      nextStatus = "waiting_staff_confirmation";
    }

    const updatePayload: Record<string, any> = {
      managerApprovedCount,
      managerValidationCount,
      staffConfirmedCount,
      totalMembers,
      updatedAt: serverTimestamp(),
    };

    if (nextStatus !== currentStatus) {
      updatePayload.status = nextStatus;
    }

    await updateDoc(missionRef, updatePayload);
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

          const validatedByAssigner =
            approvalTargetUid && approvalTargetUid === userProfile.uid;

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
      await updateDoc(memberRef, {
        staffConfirmationStatus: approved
          ? "confirmed_by_staff"
          : "declined_by_staff",
        memberStatus: approved ? "ready_to_depart" : "declined_by_staff",
        staffConfirmationNote: technicalForm.staffConfirmationNote,
        contactDuringTrip: technicalForm.contactDuringTrip,
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `${member.employeeName} ${approved ? "mengonfirmasi kesiapan" : "menolak ikut"} misi.`,
      );
      await syncMissionStatus(member.missionId);
      toast({ title: "Konfirmasi staff tersimpan." });
      setTechnicalForm({
        contactDuringTrip: "",
        staffConfirmationNote: "",
      });
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

  const summaryCounts = useMemo(() => {
    const items = missionItems || [];
    const all = items.length;
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
  }, [missionItems]);

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
                  <TableHead>Status Approval</TableHead>
                  <TableHead>Status Konfirmasi</TableHead>
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
                    const approvalStatus =
                      item.managerValidationStatus ||
                      item.approvalStatus ||
                      item.memberStatus ||
                      item.status;
                    const confirmationStatus =
                      item.staffConfirmationStatus ||
                      item.memberStatus ||
                      item.status;
                    const memberCount =
                      item.memberCount ??
                      item.totalMembers ??
                      item.assignedStaffCount ??
                      1;
                    // For staff mode: can confirm if manager validated
                    // For other modes: original logic
                    const canConfirm =
                      mode === "staff"
                        ? approvalStatus &&
                          approvalStatus !== "waiting_manager_validation" &&
                          confirmationStatus !== "confirmed_by_staff" &&
                          confirmationStatus !== "declined_by_staff"
                        : approvalStatus &&
                          approvalStatus !== "waiting_manager_validation" &&
                          confirmationStatus !== "confirmed_by_staff" &&
                          confirmationStatus !== "declined_by_staff";

                    return (
                      <TableRow
                        key={item.id || item.missionId}
                        className="hover:bg-muted cursor-pointer"
                        onClick={() => handleSelectItem(item)}
                      >
                        <TableCell className="font-medium">
                          {title || "-"}
                        </TableCell>
                        <TableCell>{getDestinationLabel(item)}</TableCell>
                        <TableCell className="text-sm">
                          {formatDate(item.startDate)} -{" "}
                          {formatDate(item.endDate)}
                        </TableCell>
                        <TableCell className="text-center">
                          {memberCount}
                        </TableCell>
                        <TableCell>
                          {mode === "staff" &&
                          approvalStatus === "waiting_manager_validation" ? (
                            <Badge variant="warning">
                              Menunggu persetujuan atasan
                            </Badge>
                          ) : (
                            renderStatusLabel(approvalStatus)
                          )}
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
              {renderStatusLabel(selectedMission.status)}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {(() => {
              const approvedCount = missionMembers.filter(
                (m) => m.managerValidationStatus === "approved_by_manager",
              ).length;
              const confirmedCount = missionMembers.filter(
                (m) => m.staffConfirmationStatus === "confirmed_by_staff",
              ).length;
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
                            {renderStatusLabel(member.managerValidationStatus)}
                          </TableCell>
                          <TableCell className="text-center">
                            {renderStatusLabel(member.staffConfirmationStatus)}
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
            <CardHeader>
              <CardTitle className="text-xl">Timeline Aktivitas</CardTitle>
              <CardDescription>
                Riwayat perubahan status dan aksi yang dilakukan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {missionTimeline.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Belum ada riwayat aktivitas
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {missionTimeline.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="relative flex gap-4 pb-4 last:pb-0"
                    >
                      {/* Timeline line connector */}
                      {idx < missionTimeline.length - 1 && (
                        <div className="absolute left-[15px] top-10 h-8 w-px bg-gradient-to-b from-primary/50 to-transparent" />
                      )}

                      {/* Timeline dot */}
                      <div className="relative mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-primary bg-primary/10" />
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>

                      {/* Timeline content */}
                      <div className="flex-1 rounded-lg border border-border/50 bg-card/50 p-4 transition-all hover:bg-card hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex-1 text-sm font-medium text-foreground">
                            {entry.message}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(entry.createdAt)}</span>
                          <span>•</span>
                          <span>{entry.byName || "System"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            selectedMember.staffConfirmationStatus ===
              "waiting_staff_confirmation" ? (
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
                      disabled={
                        isSaving ||
                        selectedMember!.managerValidationStatus ===
                          "waiting_manager_validation"
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Konfirmasi Siap
                      Dinas
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        handleStaffConfirmation(selectedMember!, false)
                      }
                      disabled={
                        isSaving ||
                        selectedMember!.managerValidationStatus ===
                          "waiting_manager_validation"
                      }
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Tidak Bisa Ikut
                    </Button>
                  </div>
                  {selectedMember!.managerValidationStatus ===
                    "waiting_manager_validation" && (
                    <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                        Menunggu Persetujuan Atasan
                      </p>
                      <p className="text-sm text-amber-700/80">
                        Anda dapat mengkonfirmasi kesiapan setelah manager
                        atasan menyetujui penugasan ini.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            selectedMember.memberStatus === "ready_to_depart" &&
            selectedMission?.status === "approved_ready_to_depart" ? (
              <div className="space-y-3">
                <Button
                  onClick={() => handleDepart(selectedMember!)}
                  disabled={isSaving}
                >
                  <MapPin className="mr-2 h-4 w-4" /> Check-in Berangkat
                </Button>
              </div>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            selectedMember.memberStatus === "on_duty" ? (
              <div className="space-y-3">
                <Button
                  onClick={() => handleReturn(selectedMember!)}
                  disabled={isSaving}
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" /> Check-out Pulang
                </Button>
              </div>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            selectedMember.memberStatus === "returned" ? (
              <div className="space-y-4">
                <p className="font-semibold">Laporan Dinas Global</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="summary">Ringkasan kegiatan</Label>
                    <Textarea
                      id="summary"
                      value={reportForm.summary}
                      onChange={(event) =>
                        setReportForm((prev) => ({
                          ...prev,
                          summary: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="outcomes">Hasil pekerjaan</Label>
                    <Textarea
                      id="outcomes"
                      value={reportForm.outcomes}
                      onChange={(event) =>
                        setReportForm((prev) => ({
                          ...prev,
                          outcomes: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="issues">Kendala</Label>
                    <Textarea
                      id="issues"
                      value={reportForm.issues}
                      onChange={(event) =>
                        setReportForm((prev) => ({
                          ...prev,
                          issues: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="recommendations">
                      Rekomendasi/Tindak lanjut
                    </Label>
                    <Textarea
                      id="recommendations"
                      value={reportForm.recommendations}
                      onChange={(event) =>
                        setReportForm((prev) => ({
                          ...prev,
                          recommendations: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="reportAttachment">
                    Dokumentasi foto / lampiran
                  </Label>
                  <input
                    id="reportAttachment"
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(event) =>
                      setReportForm((prev) => ({
                        ...prev,
                        attachment: event.target.files?.[0] || null,
                      }))
                    }
                    className="mt-2"
                  />
                </div>
                <Button
                  onClick={() => handleSubmitReport(selectedMember!)}
                  disabled={isSaving}
                >
                  <FileCheck className="mr-2 h-4 w-4" /> Kirim Laporan
                </Button>
              </div>
            ) : null}

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
