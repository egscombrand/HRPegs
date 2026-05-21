"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  addDoc,
  collection,
  collectionGroup,
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
  DollarSign,
  Upload,
  XCircle,
  FileCheck,
} from "lucide-react";
import type { UserProfile } from "@/lib/types";

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
  destinationCity?: string;
  destinationAddress?: string;
  startDate?: any;
  endDate?: any;
  durationDays?: number;
  instructionNote?: string;
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
  brandId?: string;
  brandName?: string;
  divisionId?: string;
  divisionName?: string;
  managerUid?: string;
  managerName?: string;
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
    replacement_requested: "destructive",
    rejected_by_manager: "destructive",
    confirmed_by_staff: "success",
    declined_by_staff: "destructive",
    ready_to_depart: "success",
    returned: "success",
  };

  return (
    <Badge variant={styleMap[status] || "secondary"}>
      {status.replace(/_/g, " ")}
    </Badge>
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

  const getMissionExpensesCollection = (missionId?: string) =>
    firestore && missionId
      ? collection(firestore, "business_trip_missions", missionId, "expenses")
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
    transportationPlan: "",
    departurePoint: "",
    contactDuringTrip: "",
    cashAdvanceRequired: false,
    advanceNeededAmount: "",
    staffConfirmationNote: "",
  });
  const [reportForm, setReportForm] = useState({
    summary: "",
    outcomes: "",
    issues: "",
    recommendations: "",
    attachment: null as File | null,
  });
  const [expenseForm, setExpenseForm] = useState({
    category: "Transportasi" as ExpenseCategory,
    amount: "",
    description: "",
    receipt: null as File | null,
    note: "",
  });
  const [settlementForm, setSettlementForm] = useState({
    decision: "approved" as "approved" | "partial" | "rejected",
    approvedAmount: "",
    note: "",
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
    instructionNote: "",
    costScheme: "reimburse" as CostSchema,
    advanceAmount: "",
    budgetEstimate: "",
  });
  const [assignmentLetter, setAssignmentLetter] = useState<File | null>(null);

  const staffQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, "users"),
      where("role", "==", "karyawan"),
      where("isActive", "==", true),
    );
  }, [firestore]);

  const { data: staffList } = useCollection<UserProfile>(staffQuery);

  const missionQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile) return null;

    if (mode === "manager") {
      return query(
        collectionGroup(firestore, "members"),
        where("managerUid", "==", userProfile.uid),
        orderBy("createdAt", "desc"),
      );
    }

    if (mode === "staff") {
      return query(
        collectionGroup(firestore, "members"),
        where("employeeUid", "==", userProfile.uid),
        orderBy("createdAt", "desc"),
      );
    }

    const missionCollection = getBusinessTripMissionCollection();
    if (!missionCollection) return null;
    return query(missionCollection, orderBy("createdAt", "desc"));
  }, [firestore, userProfile, mode]);

  const { data: missionItems, isLoading } = useCollection<any>(missionQuery);

  const missions = useMemo(() => {
    if (!missionItems) return [];
    return missionItems as Array<
      BusinessTripMission | BusinessTripMissionMember
    >;
  }, [missionItems]);

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
      instructionNote: "",
      costScheme: "reimburse",
      advanceAmount: "",
      budgetEstimate: "",
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

  const findManagerForStaff = async (staff: UserProfile) => {
    if (!firestore) return null;
    const managerSnapshot = await getDocs(
      query(collection(firestore, "users"), where("role", "==", "manager")),
    );
    const staffDivision =
      staff.divisionId || staff.division || staff.divisionName || "";
    return (
      managerSnapshot.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() as UserProfile) }))
        .find((manager) => {
          return [
            manager.managedDivisionId,
            manager.managedDivision,
            manager.divisionId,
            manager.division,
            manager.divisionName,
          ].includes(staffDivision);
        }) || null
    );
  };

  const loadMissionDetail = async (missionId: string) => {
    if (!firestore || !missionId) return;
    try {
      const missionRef = getBusinessTripMissionDoc(missionId);
      if (!missionRef) return;
      const missionSnap = await getDoc(missionRef);
      if (!missionSnap.exists()) return;
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
    } catch (error) {
      console.error("Gagal memuat detail misi", error);
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
    const allApproved = members.every(
      (member) => member.managerValidationStatus === "approved_by_manager",
    );
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

    if (nextStatus !== currentStatus) {
      await updateDoc(missionRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    }
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
      !missionForm.instructionNote
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
      const staffRecords = await Promise.all(
        selectedStaffUids.map(async (uid) => {
          const staffSnap = await getDoc(doc(firestore, "users", uid));
          if (!staffSnap.exists())
            throw new Error("Data staff tidak ditemukan.");
          return staffSnap.data() as UserProfile;
        }),
      );

      const managerMap = new Map<string, UserProfile>();
      for (const staff of staffRecords) {
        const manager = await findManagerForStaff(staff);
        if (!manager) {
          throw new Error(
            `Tidak dapat menemukan Manager Divisi untuk ${staff.fullName}.`,
          );
        }
        managerMap.set(staff.uid, manager);
      }

      const filePath = `business_trip_missions/${userProfile.uid}/${Date.now()}_${assignmentLetter.name}`;
      const uploadResult = await uploadFile(
        assignmentLetter,
        filePath,
        userProfile.uid,
        { compress: false },
      );
      const missionCollection = getBusinessTripMissionCollection();
      if (!missionCollection) throw new Error("Firestore tidak siap.");
      const missionRef = doc(missionCollection);
      const durationDays = calculateDurationDays(
        missionForm.startDate,
        missionForm.endDate,
      );
      const assignmentNumber =
        missionForm.assignmentNumber || `SPD-${Date.now()}`;

      await setDoc(missionRef, {
        missionName: missionForm.missionName,
        assignmentNumber,
        assignmentLetterUrl: uploadResult.downloadUrl,
        assignmentLetterFileName: uploadResult.fileName,
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
        instructionNote: missionForm.instructionNote,
        costScheme: missionForm.costScheme,
        advanceAmount: Number(missionForm.advanceAmount) || 0,
        budgetEstimate: Number(missionForm.budgetEstimate) || 0,
        status: "pending_manager_validation",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await Promise.all(
        staffRecords.map(async (staff) => {
          const manager = managerMap.get(staff.uid)!;
          const membersCollection = getMissionMembersCollection(missionRef.id);
          if (!membersCollection) throw new Error("Firestore tidak siap.");
          const memberRef = doc(membersCollection);
          await setDoc(memberRef, {
            missionId: missionRef.id,
            missionName: missionForm.missionName,
            assignmentNumber,
            employeeUid: staff.uid,
            employeeName: staff.fullName,
            employeePosition: staff.jobTitle || staff.positionTitle || "-",
            brandId: staff.brandId || "",
            brandName: staff.brandName || "-",
            divisionId: staff.divisionId || "",
            divisionName: staff.divisionName || staff.division || "-",
            managerUid: manager.uid,
            managerName: manager.fullName,
            startDate: Timestamp.fromDate(new Date(missionForm.startDate)),
            endDate: Timestamp.fromDate(new Date(missionForm.endDate)),
            durationDays,
            memberStatus: "waiting_manager_validation",
            managerValidationStatus: "waiting_manager_validation",
            staffConfirmationStatus: "waiting_staff_confirmation",
            missionStatus: "pending_manager_validation",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }),
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
    if (mode === "manager" || mode === "staff") {
      const member = item as BusinessTripMissionMember;
      if (!member.missionId) return;
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
        managerValidationNote: actionNote,
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
        transportationPlan: technicalForm.transportationPlan,
        departurePoint: technicalForm.departurePoint,
        contactDuringTrip: technicalForm.contactDuringTrip,
        cashAdvanceRequired: technicalForm.cashAdvanceRequired,
        advanceNeededAmount: Number(technicalForm.advanceNeededAmount) || 0,
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `${member.employeeName} ${approved ? "mengonfirmasi kesiapan" : "menolak ikut"} misi.`,
      );
      await syncMissionStatus(member.missionId);
      toast({ title: "Konfirmasi staff tersimpan." });
      setTechnicalForm({
        transportationPlan: "",
        departurePoint: "",
        contactDuringTrip: "",
        cashAdvanceRequired: false,
        advanceNeededAmount: "",
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

  const handleSubmitExpense = async (member: BusinessTripMissionMember) => {
    if (!firestore || !userProfile || !member || !member.missionId) return;
    const amount = Number(expenseForm.amount);
    if (!expenseForm.description || !amount || amount <= 0) {
      return toast({
        variant: "destructive",
        title: "Isi deskripsi dan jumlah biaya dengan benar.",
      });
    }
    if (
      !expenseForm.receipt &&
      selectedMission?.costScheme !== "company_paid"
    ) {
      return toast({
        variant: "destructive",
        title: "Upload nota diperlukan untuk skema biaya ini.",
      });
    }

    setIsSaving(true);
    try {
      let receiptUrl: string | null = null;
      if (expenseForm.receipt) {
        const uploaded = await uploadFile(
          expenseForm.receipt,
          `business_trip_missions/${userProfile?.uid}/${Date.now()}_${expenseForm.receipt.name}`,
          userProfile?.uid || "",
          { compress: false },
        );
        receiptUrl = uploaded.downloadUrl ?? null;
      }
      const expensesCollection = getMissionExpensesCollection(member.missionId);
      if (!expensesCollection) return;
      await addDoc(expensesCollection, {
        employeeUid: member.employeeUid,
        employeeName: member.employeeName,
        category: expenseForm.category,
        amount,
        description: expenseForm.description,
        receiptUrl,
        receiptFileName: expenseForm.receipt?.name || null,
        submittedAt: serverTimestamp(),
        submittedBy: userProfile?.uid,
        submittedByName: userProfile?.fullName,
      });
      const missionRef = getBusinessTripMissionDoc(member.missionId);
      if (!missionRef) return;
      await updateDoc(missionRef, {
        status: "expense_submitted",
        updatedAt: serverTimestamp(),
      });
      await appendTimelineEntry(
        member.missionId,
        `${member.employeeName} mengirim nota/reimburse.`,
      );
      toast({ title: "Nota terkirim." });
      setExpenseForm({
        category: "Transportasi",
        amount: "",
        description: "",
        receipt: null,
        note: "",
      });
      await loadMissionDetail(member.missionId);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal mengirim expense",
        description: error?.message || "Coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinanceDecision = async (mission: BusinessTripMission) => {
    if (!firestore || !userProfile || !mission.id) return;
    if (
      settlementForm.decision === "partial" &&
      !settlementForm.approvedAmount
    ) {
      return toast({
        variant: "destructive",
        title: "Jumlah disetujui wajib diisi untuk approve sebagian.",
      });
    }
    setIsSaving(true);
    try {
      const status =
        settlementForm.decision === "approved"
          ? "completed"
          : "settlement_review";
      const missionRef = getBusinessTripMissionDoc(mission.id!);
      if (!missionRef) return;
      await updateDoc(missionRef, {
        status,
        updatedAt: serverTimestamp(),
        settlement: {
          status: settlementForm.decision,
          approvedAmount:
            settlementForm.decision === "partial"
              ? Number(settlementForm.approvedAmount)
              : mission.budgetEstimate || 0,
          note: settlementForm.note,
          approvedAt: serverTimestamp(),
          byUid: userProfile?.uid,
          byName: userProfile?.fullName,
        },
      });
      await appendTimelineEntry(
        mission.id!,
        `Finance memutuskan biaya: ${settlementForm.decision}.`,
      );
      toast({ title: "Keputusan biaya tersimpan." });
      setSettlementForm({ decision: "approved", approvedAmount: "", note: "" });
      await loadMissionDetail(mission.id!);
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

  const summaryCounts = useMemo(() => {
    const items = missionItems || [];
    const all = items.length;
    const pending = items.filter((item: any) =>
      [
        "pending_manager_validation",
        "waiting_staff_confirmation",
        "pending_hrd_finalization",
        "expense_submitted",
        "settlement_review",
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
    if (mode === "hrd-finance") return "Verifikasi Biaya Dinas";
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
            {mode === "hrd-finance" &&
              "Verifikasi biaya dinas dan selesaikan pengajuan reimburse."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Total</p>
            <p className="text-3xl font-semibold">{summaryCounts.all}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Perlu Tindak Lanjut</p>
            <p className="text-3xl font-semibold">{summaryCounts.pending}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Selesai</p>
            <p className="text-3xl font-semibold">{summaryCounts.completed}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Ditolak / Batal</p>
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
                <Label htmlFor="costScheme">Skema Biaya</Label>
                <Select
                  value={missionForm.costScheme}
                  onValueChange={(value) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      costScheme: value as CostSchema,
                    }))
                  }
                >
                  <SelectTrigger id="costScheme" className="mt-1 w-full">
                    <SelectValue placeholder="Pilih skema biaya" />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_SCHEMAS.map((schema) => (
                      <SelectItem key={schema} value={schema}>
                        {schema}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="advanceAmount">Advance (Rp)</Label>
                <Input
                  id="advanceAmount"
                  type="number"
                  value={missionForm.advanceAmount}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      advanceAmount: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="budgetEstimate">Estimasi Anggaran (Rp)</Label>
                <Input
                  id="budgetEstimate"
                  type="number"
                  value={missionForm.budgetEstimate}
                  onChange={(event) =>
                    setMissionForm((prev) => ({
                      ...prev,
                      budgetEstimate: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
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
              <Label htmlFor="instructionNote">Instruksi / Catatan</Label>
              <Textarea
                id="instructionNote"
                value={missionForm.instructionNote}
                onChange={(event) =>
                  setMissionForm((prev) => ({
                    ...prev,
                    instructionNote: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Detail arahan untuk tim lapangan"
              />
            </div>
            <div>
              <Label>Staff yang Ditugaskan</Label>
              <div className="overflow-x-auto rounded-2xl border border-slate-700 p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead> </TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Divisi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffList?.map((staff) => (
                      <TableRow key={staff.uid}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedStaffUids.includes(staff.uid)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selectedStaffUids, staff.uid]
                                : selectedStaffUids.filter(
                                    (uid) => uid !== staff.uid,
                                  );
                              setSelectedStaffUids(next);
                            }}
                          />
                        </TableCell>
                        <TableCell>{staff.fullName}</TableCell>
                        <TableCell>{staff.brandName || "-"}</TableCell>
                        <TableCell>
                          {staff.divisionName || staff.division || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                <p className="text-sm text-slate-400 mt-2">
                  Dipilih: {assignmentLetter.name}
                </p>
              ) : null}
            </div>
            <Button onClick={handleCreateMission} disabled={isSaving}>
              <Upload className="mr-2 h-4 w-4" /> Buat Misi Dinas
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
                  <TableHead>Periode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      Memuat...
                    </TableCell>
                  </TableRow>
                ) : missions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      Tidak ada data.
                    </TableCell>
                  </TableRow>
                ) : (
                  missions.map((item: any) => {
                    const title = item.missionName;
                    const status =
                      mode === "manager" || mode === "staff"
                        ? item.managerValidationStatus ||
                          item.staffConfirmationStatus ||
                          item.memberStatus ||
                          item.missionStatus
                        : item.status;
                    return (
                      <TableRow
                        key={item.id}
                        className="hover:bg-slate-950 cursor-pointer"
                        onClick={() => handleSelectItem(item)}
                      >
                        <TableCell>{title}</TableCell>
                        <TableCell>
                          {formatDate(item.startDate)} -{" "}
                          {formatDate(item.endDate)}
                        </TableCell>
                        <TableCell>{renderStatusLabel(status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectItem(item);
                            }}
                          >
                            Detail
                          </Button>
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

      {selectedMission ? (
        <Card>
          <CardHeader>
            <CardTitle>Detail Misi</CardTitle>
            <CardDescription>
              Lihat anggota, status, timeline, dan action yang tersedia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-400">Nama Misi</p>
                <p className="font-semibold">{selectedMission.missionName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Nomor SPD</p>
                <p className="font-semibold">
                  {selectedMission.assignmentNumber}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Klien / Proyek</p>
                <p className="font-semibold">
                  {selectedMission.clientName ||
                    selectedMission.projectName ||
                    "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Periode</p>
                <p className="font-semibold">
                  {formatDate(selectedMission.startDate)} -{" "}
                  {formatDate(selectedMission.endDate)} (
                  {selectedMission.durationDays || 0} hari)
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Tujuan</p>
                <p className="font-semibold">
                  {selectedMission.destinationCity || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Alamat</p>
                <p className="font-semibold">
                  {selectedMission.destinationAddress || "-"}
                </p>
              </div>
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-slate-400">Status Misi</p>
                {renderStatusLabel(selectedMission.status)}
              </div>
              <div>
                <p className="text-sm text-slate-400">Skema Biaya</p>
                <p className="font-semibold">
                  {selectedMission.costScheme || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Estimasi Anggaran</p>
                <p className="font-semibold">
                  {formatCurrency(selectedMission.budgetEstimate)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-400">Instruksi</p>
              <p className="whitespace-pre-wrap">
                {selectedMission.instructionNote || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Surat Tugas</p>
              {selectedMission.assignmentLetterUrl ? (
                <a
                  href={selectedMission.assignmentLetterUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-400 underline"
                >
                  {selectedMission.assignmentLetterFileName || "Lihat file"}
                </a>
              ) : (
                <p className="text-slate-500">Belum tersedia</p>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Anggota Misi</CardTitle>
                <CardDescription>
                  Statues validasi manager dan konfirmasi staff per anggota.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Divisi</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Status Manager</TableHead>
                      <TableHead>Status Staff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missionMembers.map((member) => (
                      <TableRow
                        key={member.id}
                        className={
                          selectedMember?.id === member.id ? "bg-slate-950" : ""
                        }
                      >
                        <TableCell>{member.employeeName}</TableCell>
                        <TableCell>{member.divisionName || "-"}</TableCell>
                        <TableCell>{member.managerName || "-"}</TableCell>
                        <TableCell>
                          {renderStatusLabel(member.managerValidationStatus)}
                        </TableCell>
                        <TableCell>
                          {renderStatusLabel(member.staffConfirmationStatus)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {mode === "manager" &&
            selectedMember &&
            selectedMember.managerUid === userProfile?.uid &&
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
                      handleManagerDecision(selectedMember, "approve")
                    }
                    disabled={isSaving}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      handleManagerDecision(selectedMember, "replace")
                    }
                    disabled={isSaving}
                  >
                    <ArrowRightCircle className="mr-2 h-4 w-4" /> Minta Ganti
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      handleManagerDecision(selectedMember, "reject")
                    }
                    disabled={isSaving}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Tolak
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            selectedMember.staffConfirmationStatus ===
              "waiting_staff_confirmation" ? (
              <div className="space-y-4">
                <p className="font-semibold">Konfirmasi Staff</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="transportationPlan">
                      Rencana Transportasi
                    </Label>
                    <Input
                      id="transportationPlan"
                      value={technicalForm.transportationPlan}
                      onChange={(event) =>
                        setTechnicalForm((prev) => ({
                          ...prev,
                          transportationPlan: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="departurePoint">Titik Berangkat</Label>
                    <Input
                      id="departurePoint"
                      value={technicalForm.departurePoint}
                      onChange={(event) =>
                        setTechnicalForm((prev) => ({
                          ...prev,
                          departurePoint: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactDuringTrip">
                      Kontak Saat Perjalanan
                    </Label>
                    <Input
                      id="contactDuringTrip"
                      value={technicalForm.contactDuringTrip}
                      onChange={(event) =>
                        setTechnicalForm((prev) => ({
                          ...prev,
                          contactDuringTrip: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="advanceNeededAmount">Uang Muka (Rp)</Label>
                    <Input
                      id="advanceNeededAmount"
                      type="number"
                      value={technicalForm.advanceNeededAmount}
                      onChange={(event) =>
                        setTechnicalForm((prev) => ({
                          ...prev,
                          advanceNeededAmount: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <Textarea
                  id="staffConfirmationNote"
                  value={technicalForm.staffConfirmationNote}
                  onChange={(event) =>
                    setTechnicalForm((prev) => ({
                      ...prev,
                      staffConfirmationNote: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Catatan tambahan atau kendala"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      handleStaffConfirmation(selectedMember, true)
                    }
                    disabled={isSaving}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Konfirmasi Siap
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      handleStaffConfirmation(selectedMember, false)
                    }
                    disabled={isSaving}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Tidak Bisa Ikut
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            selectedMember.memberStatus === "ready_to_depart" &&
            selectedMission?.status === "approved_ready_to_depart" ? (
              <div className="space-y-3">
                <Button
                  onClick={() => handleDepart(selectedMember)}
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
                  onClick={() => handleReturn(selectedMember)}
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
                  onClick={() => handleSubmitReport(selectedMember)}
                  disabled={isSaving}
                >
                  <FileCheck className="mr-2 h-4 w-4" /> Kirim Laporan
                </Button>
              </div>
            ) : null}

            {mode === "staff" &&
            selectedMember &&
            selectedMember.reportStatus === "submitted" ? (
              <div className="space-y-4">
                <p className="font-semibold">Upload Nota / Reimburse</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="category">Kategori Nota</Label>
                    <Select
                      value={expenseForm.category}
                      onValueChange={(value) =>
                        setExpenseForm((prev) => ({
                          ...prev,
                          category: value as ExpenseCategory,
                        }))
                      }
                    >
                      <SelectTrigger id="category" className="mt-1 w-full">
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="amount">Jumlah (Rp)</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={expenseForm.amount}
                      onChange={(event) =>
                        setExpenseForm((prev) => ({
                          ...prev,
                          amount: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="receipt">Bukti Nota</Label>
                    <input
                      id="receipt"
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(event) =>
                        setExpenseForm((prev) => ({
                          ...prev,
                          receipt: event.target.files?.[0] || null,
                        }))
                      }
                      className="mt-2"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Deskripsi Biaya</Label>
                  <Textarea
                    id="description"
                    value={expenseForm.description}
                    onChange={(event) =>
                      setExpenseForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                  />
                </div>
                <Button
                  onClick={() => handleSubmitExpense(selectedMember)}
                  disabled={isSaving}
                >
                  <DollarSign className="mr-2 h-4 w-4" /> Kirim Nota
                </Button>
              </div>
            ) : null}

            {mode === "hrd-monitor" &&
            selectedMission &&
            selectedMission.status === "pending_hrd_finalization" ? (
              <div className="space-y-3">
                <Button
                  onClick={() => handleHrdFinalize(selectedMission)}
                  disabled={isSaving}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Finalisasi
                  Administrasi
                </Button>
              </div>
            ) : null}

            {mode === "hrd-finance" &&
            selectedMission &&
            [
              "report_submitted",
              "expense_submitted",
              "settlement_review",
            ].includes(selectedMission.status || "") ? (
              <div className="space-y-4">
                <p className="font-semibold">Verifikasi Biaya</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="settlementDecision">Keputusan</Label>
                    <Select
                      value={settlementForm.decision}
                      onValueChange={(value) =>
                        setSettlementForm((prev) => ({
                          ...prev,
                          decision: value as
                            | "approved"
                            | "partial"
                            | "rejected",
                        }))
                      }
                    >
                      <SelectTrigger
                        id="settlementDecision"
                        className="mt-1 w-full"
                      >
                        <SelectValue placeholder="Pilih keputusan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approve</SelectItem>
                        <SelectItem value="partial">
                          Approve Sebagian
                        </SelectItem>
                        <SelectItem value="rejected">Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {settlementForm.decision === "partial" ? (
                    <div>
                      <Label htmlFor="approvedAmount">Jumlah Disetujui</Label>
                      <Input
                        id="approvedAmount"
                        type="number"
                        value={settlementForm.approvedAmount}
                        onChange={(event) =>
                          setSettlementForm((prev) => ({
                            ...prev,
                            approvedAmount: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                  <div className="md:col-span-3">
                    <Label htmlFor="settlementNote">Catatan Finance</Label>
                    <Textarea
                      id="settlementNote"
                      value={settlementForm.note}
                      onChange={(event) =>
                        setSettlementForm((prev) => ({
                          ...prev,
                          note: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => handleFinanceDecision(selectedMission)}
                  disabled={isSaving}
                >
                  <DollarSign className="mr-2 h-4 w-4" /> Simpan Keputusan
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">
                Dibuat: {formatDate(selectedMission.createdAt)}
              </Badge>
              <Badge variant="secondary">
                Terakhir diupdate: {formatDate(selectedMission.updatedAt)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
