"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { BusinessTripApprovalRequest } from "@/components/dashboard/dinas/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Check, RefreshCcw, XCircle } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  formatBusinessTripStatus,
  formatDestination as formatDestinationHelper,
  extractGoogleDriveFileId,
} from "@/lib/dinas-utils";

type ApprovalRequestWithExtras = BusinessTripApprovalRequest & {
  id: string;
  _ref?: any;
  missionDetails?: any;
  missionName?: string;
  approvedAt?: any;
  approvedByName?: string;
  decidedAt?: any;
  rejectedAt?: any;
  notes?: string;
  rejectionReason?: string;
};

function formatDate(value: any) {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return "-";
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDestination(missionDetails?: any) {
  return formatDestinationHelper(missionDetails);
}

function getStatusVariant(status?: string) {
  const normalized = String(status).toLowerCase();

  // Approved states = green/success
  if (normalized.includes("approved") || normalized.includes("confirmed")) {
    return "success";
  }

  // Rejected/Declined states = red/destructive
  if (normalized.includes("rejected") || normalized.includes("declined")) {
    return "destructive";
  }

  // Waiting staff confirmation or replacement = blue/secondary
  if (
    normalized.includes("waiting_staff") ||
    normalized.includes("replacement") ||
    normalized.includes("partial")
  ) {
    return "secondary";
  }

  // Pending/Waiting approval = warning/amber
  if (
    normalized.includes("pending") ||
    normalized.includes("waiting") ||
    normalized.includes("menunggu")
  ) {
    return "warning";
  }

  return "secondary";
}

function dedupeById(items: ApprovalRequestWithExtras[]): ApprovalRequestWithExtras[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export function BusinessTripApprovalClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRequestForModal, setSelectedRequestForModal] = useState<
    | (BusinessTripApprovalRequest & {
        id: string;
        missionDetails?: any;
        memberDetails?: any[];
        timeline?: any[];
        staffChanges?: any[];
      })
    | null
  >(null);
  const [selectedMemberUidsByRequest, setSelectedMemberUidsByRequest] =
    useState<Record<string, string[]>>({});
  const [decisionNotesByRequest, setDecisionNotesByRequest] = useState<
    Record<string, string>
  >({});
  const [missionDetailsById, setMissionDetailsById] = useState<
    Record<string, any | null>
  >({});
  const [isLoadingModalDetails, setIsLoadingModalDetails] = useState(false);
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [selectedMemberForReplacement, setSelectedMemberForReplacement] =
    useState<any>(null);
  const [selectedMemberDivisionName, setSelectedMemberDivisionName] =
    useState<string>("");
  const [replacementCandidates, setReplacementCandidates] = useState<any[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedReplacementUid, setSelectedReplacementUid] = useState<
    string | null
  >(null);
  const [replacementReason, setReplacementReason] = useState("");
  const [modalTimeline, setModalTimeline] = useState<any[]>([]);

  // Real-time timeline subscription for the open approval modal
  useEffect(() => {
    if (!firestore || !selectedRequestForModal?.missionId) {
      setModalTimeline([]);
      return;
    }
    const timelineRef = collection(
      firestore,
      "business_trip_missions",
      selectedRequestForModal.missionId,
      "timeline",
    );
    const unsubscribe = onSnapshot(
      query(timelineRef, orderBy("createdAt", "desc")),
      (snap) => setModalTimeline(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Modal timeline snapshot error:", err),
    );
    return () => unsubscribe();
  }, [firestore, selectedRequestForModal?.missionId]);

  // Query for approval requests needing action (pending)
  const pendingQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.uid) return null;
    return query(
      collectionGroup(firestore, "approval_requests"),
      where("approverUid", "==", userProfile.uid),
      where("status", "in", [
        "pending",
        "waiting_manager_validation",
        "pending_manager_validation",
      ]),
      orderBy("createdAt", "desc"),
    );
  }, [firestore, userProfile?.uid]);

  // Query for approval history (completed approvals by this user)
  const historyQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.uid) return null;
    return query(
      collectionGroup(firestore, "approval_requests"),
      where("approverUid", "==", userProfile.uid),
      where("status", "in", [
        "approved",
        "rejected",
        "replacement_requested",
        "cancelled",
      ]),
      orderBy("decidedAt", "desc"),
    );
  }, [firestore, userProfile?.uid]);

  const {
    data: approvalRequests,
    isLoading: isLoadingRequests,
    error: approvalQueryError,
  } = useCollection<BusinessTripApprovalRequest>(pendingQuery || null);

  // Local approvals state for pending requests
  const [approvals, setApprovals] = useState<ApprovalRequestWithExtras[]>([]);
  const [isFetchingApprovals, setIsFetchingApprovals] = useState(false);
  const [approvalFetchError, setApprovalFetchError] = useState<any>(null);

  // Local approvals state for history
  const [historyApprovals, setHistoryApprovals] = useState<
    ApprovalRequestWithExtras[]
  >([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [historyFetchError, setHistoryFetchError] = useState<any>(null);

  useEffect(() => {
    if (!firestore || !pendingQuery) {
      setApprovals([]);
      return;
    }

    let active = true;
    setIsFetchingApprovals(true);
    setApprovalFetchError(null);

    (async () => {
      try {
        const snap = await getDocs(pendingQuery);
        const raw = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
          _ref: d.ref,
        }));
        const items = dedupeById(raw);
        const ids = raw.map((r) => r.id);
        const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
        if (dupIds.length) console.log("duplicate pending approval ids", dupIds);
        console.log("approval request ids (pending)", ids);
        if (!active) return;
        setApprovals(items);
      } catch (err) {
        console.error("Gagal memuat approvals pending:", err);
        if (!active) return;
        setApprovalFetchError(err);
      } finally {
        if (!active) return;
        setIsFetchingApprovals(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [firestore, pendingQuery]);

  // Fetch history approvals
  useEffect(() => {
    if (!firestore || !historyQuery) {
      setHistoryApprovals([]);
      return;
    }

    let active = true;
    setIsFetchingHistory(true);
    setHistoryFetchError(null);

    (async () => {
      try {
        const snap = await getDocs(historyQuery);
        const raw = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
          _ref: d.ref,
        }));
        const items = dedupeById(raw);
        const ids = raw.map((r) => r.id);
        const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
        if (dupIds.length) console.log("duplicate history approval ids", dupIds);
        console.log("approval request ids (history)", ids);
        if (!active) return;
        setHistoryApprovals(items);
      } catch (err) {
        console.error("Gagal memuat approval history:", err);
        if (!active) return;
        setHistoryFetchError(err);
      } finally {
        if (!active) return;
        setIsFetchingHistory(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [firestore, historyQuery]);

  // silently keep local approvals in sync; no debug logs in UI
  useEffect(() => {
    if (!userProfile?.uid || !approvalRequests) return;
    // no-op: approvalRequests used to populate UI via snapshot hook
  }, [approvalRequests, userProfile?.uid]);

  useEffect(() => {
    if (
      !firestore ||
      (approvals.length === 0 && historyApprovals.length === 0)
    ) {
      setMissionDetailsById({});
      return;
    }

    let active = true;
    const allApprovals = [...approvals, ...historyApprovals];
    const missionIds = Array.from(
      new Set(allApprovals.map((request) => request.missionId).filter(Boolean)),
    );

    Promise.all(
      missionIds.map(async (missionId) => {
        try {
          const missionRef = doc(
            firestore,
            "business_trip_missions",
            missionId,
          );
          const missionSnap = await getDoc(missionRef);
          if (!missionSnap.exists()) return [missionId, null] as const;
          return [missionId, missionSnap.data() as any] as const;
        } catch (error) {
          console.warn("Gagal memuat detail misi", missionId, error);
          return [missionId, null] as const;
        }
      }),
    )
      .then((entries) => {
        if (!active) return;
        setMissionDetailsById(Object.fromEntries(entries));
      })
      .catch((error) => {
        console.warn("Gagal memuat detail misi", error);
      });

    return () => {
      active = false;
    };
  }, [approvals, historyApprovals, firestore]);

  // Helper to refetch both pending and history
  const refetchApprovals = useCallback(async () => {
    if (!firestore || !pendingQuery || !historyQuery) return;

    try {
      // Refetch pending
      const pendingSnap = await getDocs(pendingQuery);
      const pendingRaw = pendingSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        _ref: d.ref,
      }));
      setApprovals(dedupeById(pendingRaw));

      // Refetch history
      const historySnap = await getDocs(historyQuery);
      const historyRaw = historySnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        _ref: d.ref,
      }));
      setHistoryApprovals(dedupeById(historyRaw));
    } catch (error) {
      console.error("Gagal refresh approvals:", error);
    }
  }, [firestore, pendingQuery, historyQuery]);

  const syncMissionSummaryFromMembers = useCallback(
    async (missionId: string) => {
      if (!firestore || !missionId) return;
      try {
        const membersSnap = await getDocs(
          collection(firestore, "business_trip_missions", missionId, "members"),
        );
        const allDocs = membersSnap.docs.map((d) => d.data() as any);
        const active = allDocs.filter(
          (m: any) =>
            m.memberStatus !== "archived" &&
            m.memberStatus !== "cancelled" &&
            m.memberStatus !== "rejected",
        );
        const totalM = active.length;
        const approvedM = active.filter(
          (m: any) =>
            m.managerValidationStatus === "approved_by_manager" ||
            m.approvalStatus === "approved" ||
            m.approvalStatus === "validated_by_assigner",
        ).length;
        const confirmedM = active.filter(
          (m: any) => m.staffConfirmationStatus === "confirmed_by_staff",
        ).length;

        let newStatus: string;
        if (totalM > 0 && approvedM === totalM && confirmedM === totalM) {
          newStatus = "ready_to_depart";
        } else if (totalM > 0 && approvedM === totalM) {
          newStatus = "waiting_staff_confirmation";
        } else {
          newStatus = "pending_manager_validation";
        }

        const missionRef = doc(firestore, "business_trip_missions", missionId);
        const missionSnap = await getDoc(missionRef);
        if (!missionSnap.exists()) return;
        const currentStatus: string = missionSnap.data()?.status ?? "";
        const TERMINAL = ["on_duty", "returned_pending_report", "report_submitted", "completed", "approved_ready_to_depart"];
        if (TERMINAL.includes(currentStatus)) return;

        await updateDoc(missionRef, {
          managerApprovedCount: approvedM,
          staffConfirmedCount: confirmedM,
          memberCount: totalM,
          totalMembers: totalM,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn("syncMissionSummaryFromMembers error:", err);
      }
    },
    [firestore],
  );

  const updateApprovalRequest = useCallback(
    async (
      request: BusinessTripApprovalRequest & { id: string },
      changes: Partial<BusinessTripApprovalRequest> & Record<string, any>,
    ) => {
      if (!firestore) return false;
      setIsSaving(true);
      try {
        const requestRef = doc(
          firestore,
          "business_trip_missions",
          request.missionId,
          "approval_requests",
          request.id,
        );
        await updateDoc(requestRef, {
          ...changes,
          updatedAt: serverTimestamp(),
        });
        return true;
      } catch (error: any) {
        console.error("Gagal memperbarui persetujuan:", error);
        toast({
          variant: "destructive",
          title: "Gagal memperbarui persetujuan",
          description: error?.message || "Silakan coba lagi.",
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [firestore, toast],
  );

  const toggleMemberSelection = useCallback(
    (requestId: string, memberUid: string) => {
      setSelectedMemberUidsByRequest((prev) => {
        const current = new Set(prev[requestId] || []);
        if (current.has(memberUid)) {
          current.delete(memberUid);
        } else {
          current.add(memberUid);
        }
        return {
          ...prev,
          [requestId]: Array.from(current),
        };
      });
    },
    [],
  );

  const handleApproveAll = useCallback(
    async (request: BusinessTripApprovalRequest & { id: string }) => {
      if (!request.id || !firestore || !userProfile?.uid) return;

      setIsSaving(true);
      try {
        const approverName = userProfile.fullName || "Approver";

        // 1. Update approval_requests with approval metadata
        const requestRef = doc(
          firestore,
          "business_trip_missions",
          request.missionId,
          "approval_requests",
          request.id,
        );
        await updateDoc(requestRef, {
          status: "approved",
          decidedAt: serverTimestamp(),
          approvedAt: serverTimestamp(),
          approvedByUid: userProfile.uid,
          approvedByName: approverName,
          notes: "Disetujui semua.",
          approvedMemberUids: request.memberUids,
          rejectedMemberUids: [],
          updatedAt: serverTimestamp(),
        });

        // 2. Update all members with approval status and metadata
        for (const memberUid of request.memberUids) {
          const memberRef = doc(
            firestore,
            "business_trip_missions",
            request.missionId,
            "members",
            memberUid,
          );
          await updateDoc(memberRef, {
            approvalStatus: "approved",
            managerValidationStatus: "approved_by_manager",
            approvedByUid: userProfile.uid,
            approvedByName: approverName,
            approvedAt: serverTimestamp(),
            memberStatus: "waiting_staff_confirmation",
            updatedAt: serverTimestamp(),
          });
        }

        // 3. Add timeline entry for approval
        const timelineRef = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "timeline",
        );
        await addDoc(timelineRef, {
          message: `${approverName} menyetujui perjalanan dinas untuk ${request.memberNames?.join(", ") || request.memberUids.length + " anggota"}.`,
          createdAt: serverTimestamp(),
          byUid: userProfile.uid,
          byName: approverName,
          actionType: "approval_approved",
        });

        // 4. Sync parent mission summary from live member data
        await syncMissionSummaryFromMembers(request.missionId);

        toast({
          title: "Persetujuan berhasil",
          description:
            "Semua anggota disetujui dan siap untuk konfirmasi staff.",
        });

        // 5. Close modal and refresh both sections
        setSelectedRequestForModal(null);
        await refetchApprovals();
      } catch (error: any) {
        console.error("Gagal approve:", error);
        toast({
          variant: "destructive",
          title: "Gagal menyetujui",
          description: error?.message || "Silakan coba lagi.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [firestore, userProfile, toast, refetchApprovals, syncMissionSummaryFromMembers],
  );

  const handleApproveSelected = useCallback(
    async (request: BusinessTripApprovalRequest & { id: string }) => {
      const selected = selectedMemberUidsByRequest[request.id] || [];
      if (!selected.length) {
        toast({
          variant: "destructive",
          title: "Pilih anggota terlebih dahulu",
          description:
            "Pilih satu atau beberapa anggota untuk disetujui sebagian.",
        });
        return;
      }

      await updateApprovalRequest(request, {
        status: "partial_approved",
        decidedAt: serverTimestamp(),
        notes: `Disetujui sebagian untuk ${selected.length} anggota.`,
        approvedMemberUids: selected,
      });
      toast({
        title: "Persetujuan parsial berhasil",
        description: "Anggota terpilih telah disetujui.",
      });
    },
    [selectedMemberUidsByRequest, toast, updateApprovalRequest],
  );

  const handleRequestReplacement = useCallback(
    async (request: BusinessTripApprovalRequest & { id: string }) => {
      // Open replacement modal instead of direct submission
      setShowReplacementModal(true);
    },
    [],
  );

  const loadReplacementCandidates = useCallback(
    async (member: any) => {
      if (!firestore || !member.brandId || !member.divisionId) {
        toast({
          variant: "destructive",
          title: "Data tidak lengkap",
          description: "Brand atau divisi anggota tidak ditemukan.",
        });
        return;
      }

      setIsLoadingCandidates(true);
      try {
        // Fetch division name if not available
        let divisionName = member.divisionName;
        if (!divisionName) {
          try {
            const divisionRef = doc(
              firestore,
              "brands",
              member.brandId,
              "divisions",
              member.divisionId,
            );
            const divSnap = await getDoc(divisionRef);
            divisionName = divSnap.data()?.name || member.divisionId;
          } catch (err) {
            console.warn("Failed to fetch division name:", err);
            divisionName = member.divisionId;
          }
        }
        setSelectedMemberDivisionName(divisionName);

        // Get all members currently in the mission
        let excludedUids: string[] = [];
        const missionId = selectedRequestForModal?.missionId;
        if (missionId) {
          try {
            const membersRef = collection(
              firestore,
              "business_trip_missions",
              missionId,
              "members",
            );
            const memberSnap = await getDocs(membersRef);
            excludedUids = memberSnap.docs
              .map((d) => d.data().employeeUid || d.data().uid || d.id)
              .filter((uid: string) => uid && uid.length > 0);
          } catch (err) {
            console.warn("Failed to fetch mission members:", err);
          }
        } else {
          console.warn(
            "Mission ID tidak tersedia untuk pengecualian anggota dinas",
          );
        }

        // Query employees in same division with active status
        const employeesRef = collection(firestore, "employees");
        const q = query(
          employeesRef,
          where("brandId", "==", member.brandId),
          where("divisionId", "==", member.divisionId),
          where("employmentStatus", "==", "active"),
        );
        const snap = await getDocs(q);
        const candidates = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((emp: any) => {
            const empUid = emp.uid || emp.userId || emp.id;
            const empName =
              emp.fullName || emp.name || emp.displayName || emp.email;

            // Exclude if: same as selected member, already in mission, or has no valid name
            return (
              empUid !== member.employeeUid &&
              empUid !== member.id &&
              !excludedUids.includes(empUid) &&
              empName &&
              empName.trim() !== "-" &&
              empName.trim().toLowerCase() !== "division_manager" &&
              empName.trim().length > 0
            );
          })
          .map((emp: any) => ({
            id: emp.id,
            uid: emp.uid || emp.userId || emp.id,
            fullName: emp.fullName || emp.name || emp.displayName || emp.email,
            position:
              emp.position ||
              emp.jobTitle ||
              emp.jabatan ||
              emp.structuralPosition ||
              "-",
            brandId: emp.brandId,
            brandName: emp.brandName || "-",
            divisionId: emp.divisionId,
            divisionName: emp.divisionName || divisionName,
            employmentStatus: emp.employmentStatus,
          }));
        setReplacementCandidates(candidates);
      } catch (error: any) {
        console.error("Error loading replacement candidates:", error);
        toast({
          variant: "destructive",
          title: "Gagal memuat kandidat pengganti",
          description: error?.message || "Silakan coba lagi.",
        });
      } finally {
        setIsLoadingCandidates(false);
      }
    },
    [firestore, toast, selectedRequestForModal],
  );

  const handleSubmitReplacement = useCallback(
    async (request: BusinessTripApprovalRequest & { id: string }) => {
      if (
        !selectedMemberForReplacement ||
        !selectedReplacementUid ||
        !replacementReason.trim()
      ) {
        toast({
          variant: "destructive",
          title: "Data tidak lengkap",
          description: "Pilih anggota, pengganti, dan tulis alasan.",
        });
        return;
      }

      if (!firestore) return;

      setIsSaving(true);
      try {
        // Get replacement candidate details
        const replacementCandidate = replacementCandidates.find(
          (c) => c.uid === selectedReplacementUid,
        );
        if (!replacementCandidate) {
          throw new Error("Kandidat pengganti tidak ditemukan");
        }

        // 1. Create staff_changes document with full details
        const staffChangesRef = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "staff_changes",
        );

        await addDoc(staffChangesRef, {
          missionId: request.missionId,
          oldMemberUid: selectedMemberForReplacement.employeeUid,
          oldMemberName: selectedMemberForReplacement.employeeName,
          replacementUid: selectedReplacementUid,
          replacementName: replacementCandidate.fullName,
          replacementPosition: replacementCandidate.position,
          brandId: selectedMemberForReplacement.brandId,
          brandName: selectedMemberForReplacement.brandName || "-",
          divisionId: selectedMemberForReplacement.divisionId,
          divisionName: selectedMemberDivisionName,
          requestedByUid: userProfile?.uid,
          requestedByName: userProfile?.fullName,
          reason: replacementReason,
          status: "requested",
          createdAt: serverTimestamp(),
        });

        await updateApprovalRequest(request, {
          status: "replacement_requested",
          decidedAt: serverTimestamp(),
          notes: replacementReason,
          replacementReason,
          approvedByUid: userProfile?.uid,
          approvedByName: userProfile?.fullName,
        });

        // 2. Update old member
        const memberRef = doc(
          firestore,
          "business_trip_missions",
          request.missionId,
          "members",
          selectedMemberForReplacement.employeeUid ||
            selectedMemberForReplacement.id,
        );
        await updateDoc(memberRef, {
          memberStatus: "replacement_requested",
          approvalStatus: "replacement_requested",
          replacementReason,
          updatedAt: serverTimestamp(),
        });

        // 3. Add timeline entry
        const timelineRef = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "timeline",
        );
        await addDoc(timelineRef, {
          message: `${userProfile?.fullName} meminta penggantian staff ${selectedMemberForReplacement.employeeName}.`,
          createdAt: serverTimestamp(),
          byUid: userProfile?.uid,
          byName: userProfile?.fullName,
        });

        toast({
          title: "Permintaan penggantian terkirim",
          description: `Penggantian untuk ${selectedMemberForReplacement.employeeName} telah dicatat.`,
        });

        // Close modals and refresh both sections
        setShowReplacementModal(false);
        setSelectedMemberForReplacement(null);
        setSelectedReplacementUid(null);
        setReplacementReason("");
        setSelectedRequestForModal(null);
        await refetchApprovals();
      } catch (error: any) {
        console.error("Gagal submit replacement:", error);
        toast({
          variant: "destructive",
          title: "Gagal meminta ganti staff",
          description: error?.message || "Silakan coba lagi.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      firestore,
      selectedMemberForReplacement,
      selectedMemberDivisionName,
      selectedReplacementUid,
      replacementReason,
      replacementCandidates,
      userProfile,
      toast,
      refetchApprovals,
    ],
  );

  const handleRejectRequest = useCallback(
    async (request: BusinessTripApprovalRequest & { id: string }) => {
      const note = decisionNotesByRequest[request.id]?.trim();
      if (!note) {
        toast({
          variant: "destructive",
          title: "Tulis alasan penolakan",
          description: "Masukkan catatan sebelum menolak permintaan.",
        });
        return;
      }

      if (!firestore) return;

      setIsSaving(true);
      try {
        // Update approval_requests
        await updateApprovalRequest(request, {
          status: "rejected",
          decidedAt: serverTimestamp(),
          rejectedAt: serverTimestamp(),
          notes: note,
          rejectionReason: note,
          rejectedMemberUids: request.memberUids,
        });

        // Update all members with rejection status
        for (const memberUid of request.memberUids) {
          const memberRef = doc(
            firestore,
            "business_trip_missions",
            request.missionId,
            "members",
            memberUid,
          );
          await updateDoc(memberRef, {
            approvalStatus: "rejected",
            memberStatus: "rejected",
            rejectionReason: note,
            updatedAt: serverTimestamp(),
          });
        }

        // Write timeline entry for rejection
        const rejectTimelineRef = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "timeline",
        );
        await addDoc(rejectTimelineRef, {
          message: `${userProfile?.fullName || "Approver"} menolak perjalanan dinas untuk ${request.memberNames?.join(", ") || request.memberUids.length + " anggota"}.`,
          createdAt: serverTimestamp(),
          byUid: userProfile?.uid,
          byName: userProfile?.fullName,
          actionType: "approval_rejected",
        });

        // Sync parent mission summary
        await syncMissionSummaryFromMembers(request.missionId);

        toast({
          title: "Permintaan ditolak",
          description:
            "Permintaan persetujuan dan semua anggota telah ditolak.",
        });

        // Close modal and refresh both sections
        setSelectedRequestForModal(null);
        await refetchApprovals();
      } catch (error: any) {
        console.error("Gagal reject:", error);
        toast({
          variant: "destructive",
          title: "Gagal menolak",
          description: error?.message || "Silakan coba lagi.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      decisionNotesByRequest,
      firestore,
      toast,
      updateApprovalRequest,
      refetchApprovals,
      syncMissionSummaryFromMembers,
    ],
  );

  const handleToggleDetails = useCallback(
    async (
      request: BusinessTripApprovalRequest & {
        id: string;
        missionDetails?: any;
      },
    ) => {
      if (!firestore) return;

      setIsLoadingModalDetails(true);
      try {
        // Fetch member details from members subcollection
        const membersCollection = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "members",
        );
        const memberDocs = await getDocs(membersCollection);
        const memberDetails = memberDocs.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter(
            (member: any) =>
              request.memberUids.includes(member.employeeUid) ||
              request.memberUids.includes(member.id),
          );

        // Fetch timeline
        const timelineCollection = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "timeline",
        );
        const timelineDocs = await getDocs(
          query(timelineCollection, orderBy("createdAt", "desc")),
        );
        const timeline = timelineDocs.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Fetch staff changes
        const staffChangesCollection = collection(
          firestore,
          "business_trip_missions",
          request.missionId,
          "staff_changes",
        );
        const staffChangesDocs = await getDocs(
          query(staffChangesCollection, orderBy("createdAt", "desc")),
        );
        const staffChanges = staffChangesDocs.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setSelectedRequestForModal({
          ...request,
          memberDetails,
          timeline,
          staffChanges,
        });
      } catch (error) {
        console.error("Gagal memuat detail modal:", error);
        // Still open modal even if detail fetch fails
        setSelectedRequestForModal(request);
      } finally {
        setIsLoadingModalDetails(false);
      }
    },
    [firestore],
  );

  const requestRowsWithMissionName = useMemo(() => {
    const unique = dedupeById(approvals);
    return unique.map((request) => ({
      ...request,
      missionDetails: missionDetailsById[request.missionId],
      missionName:
        request.missionName ||
        missionDetailsById[request.missionId]?.missionName ||
        "-",
    }));
  }, [approvals, missionDetailsById]);

  const historyRowsWithMissionName = useMemo(() => {
    const unique = dedupeById(historyApprovals);
    return unique.map((request) => ({
      ...request,
      missionDetails: missionDetailsById[request.missionId],
      missionName:
        request.missionName ||
        missionDetailsById[request.missionId]?.missionName ||
        "-",
    }));
  }, [historyApprovals, missionDetailsById]);

  if (isLoadingRequests && isFetchingHistory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Persetujuan Perjalanan Dinas</CardTitle>
          <CardDescription>Memuat permintaan persetujuan Anda…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Permintaan Perlu Tindakan</CardTitle>
          <CardDescription>
            Perjalanan dinas yang menunggu persetujuan Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isFetchingApprovals ? (
            <div className="space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tidak ada permintaan yang perlu tindakan.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/80 shadow-sm dark:shadow-lg dark:shadow-slate-950/20">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-900/90">
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Perjalanan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Tujuan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Periode
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Anggota
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Diajukan oleh
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Status
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestRowsWithMissionName.map((request) => {
                      const missionDetails = request.missionDetails;
                      const anggotaNames = request.memberNames.length
                        ? request.memberNames
                        : [];
                      const createdBy =
                        missionDetails?.assignedByName ||
                        missionDetails?.assignedByPosition ||
                        "-";

                      return (
                        <TableRow
                          key={request.id}
                          className="border-t border-slate-200 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
                        >
                          <TableCell className="py-5 px-4 align-top">
                            <div className="font-semibold text-slate-900 dark:text-slate-50">
                              {request.missionName}
                            </div>
                            {missionDetails?.spdNumber ? (
                              <div className="mt-1 text-xs text-slate-500">
                                SPD {missionDetails.spdNumber}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="text-sm leading-6 text-slate-700 dark:text-slate-300 max-w-xs">
                              {missionDetails
                                ? formatDestinationHelper(missionDetails)
                                : "-"}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="text-sm text-slate-700 dark:text-slate-300">
                              {formatDate(missionDetails?.startDate)}
                              <span className="text-slate-400 dark:text-slate-500"> - </span>
                              {formatDate(missionDetails?.endDate)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {missionDetails?.startDate &&
                              missionDetails?.endDate
                                ? (() => {
                                    const startDate = missionDetails.startDate
                                      .seconds
                                      ? new Date(
                                          missionDetails.startDate.seconds *
                                            1000,
                                        )
                                      : new Date(missionDetails.startDate);
                                    const endDate = missionDetails.endDate
                                      .seconds
                                      ? new Date(
                                          missionDetails.endDate.seconds * 1000,
                                        )
                                      : new Date(missionDetails.endDate);
                                    const daysDiff = Math.ceil(
                                      (endDate.getTime() -
                                        startDate.getTime()) /
                                        (1000 * 60 * 60 * 24),
                                    );
                                    return `${daysDiff} hari`;
                                  })()
                                : "Durasi tidak tersedia"}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              {anggotaNames.length > 0 ? (
                                anggotaNames.slice(0, 5).map((name) => (
                                  <span
                                    key={name}
                                    className="rounded-full bg-slate-100 dark:bg-slate-900/70 px-3 py-1 text-xs text-slate-700 dark:text-slate-200"
                                  >
                                    {name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                  {request.memberUids.length} anggota
                                </span>
                              )}
                              {anggotaNames.length > 5 ? (
                                <span className="rounded-full bg-slate-100 dark:bg-slate-900/70 px-3 py-1 text-xs text-slate-700 dark:text-slate-200">
                                  +{anggotaNames.length - 5} lainnya
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {createdBy}
                            </span>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <Badge
                              variant={getStatusVariant(
                                formatBusinessTripStatus(request.status),
                              )}
                              className="text-xs"
                            >
                              {formatBusinessTripStatus(request.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleDetails(request)}
                                className="h-9 px-3 text-xs"
                              >
                                Detail
                              </Button>
                              {request.status !== "approved" &&
                              request.status !== "rejected" ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleApproveAll(request)}
                                    disabled={isSaving}
                                    className="h-9 px-3 text-xs"
                                  >
                                    Setujui
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleRejectRequest(request)}
                                    disabled={isSaving}
                                    className="h-9 px-3 text-xs"
                                  >
                                    Tolak
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Persetujuan Saya</CardTitle>
          <CardDescription>
            Approval requests yang sudah Anda proses dengan keputusan final.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isFetchingHistory ? (
            <div className="space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </div>
          ) : historyApprovals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Belum ada riwayat persetujuan.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/80 shadow-sm dark:shadow-lg dark:shadow-slate-950/20">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-900/90">
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Perjalanan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Tujuan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Periode
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Anggota
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Keputusan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Tanggal Keputusan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Catatan
                      </TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-[0.18em] py-3 px-4">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRowsWithMissionName.map((request) => {
                      const missionDetails = request.missionDetails;
                      const anggotaNames = request.memberNames.length
                        ? request.memberNames
                        : [];

                      return (
                        <TableRow
                          key={request.id}
                          className="border-t border-slate-200 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
                        >
                          <TableCell className="py-5 px-4 align-top">
                            <div className="font-semibold text-slate-900 dark:text-slate-50">
                              {request.missionName}
                            </div>
                            {missionDetails?.spdNumber ? (
                              <div className="mt-1 text-xs text-slate-500">
                                SPD {missionDetails.spdNumber}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="text-sm leading-6 text-slate-700 dark:text-slate-300 max-w-xs">
                              {missionDetails
                                ? formatDestinationHelper(missionDetails)
                                : "-"}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="text-sm text-slate-700 dark:text-slate-300">
                              {formatDate(missionDetails?.startDate)}
                              <span className="text-slate-400 dark:text-slate-500"> - </span>
                              {formatDate(missionDetails?.endDate)}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              {anggotaNames.length > 0 ? (
                                anggotaNames.slice(0, 3).map((name) => (
                                  <span
                                    key={name}
                                    className="rounded-full bg-slate-100 dark:bg-slate-900/70 px-3 py-1 text-xs text-slate-700 dark:text-slate-200"
                                  >
                                    {name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                  {request.memberUids.length} anggota
                                </span>
                              )}
                              {anggotaNames.length > 3 ? (
                                <span className="rounded-full bg-slate-100 dark:bg-slate-900/70 px-3 py-1 text-xs text-slate-700 dark:text-slate-200">
                                  +{anggotaNames.length - 3}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="flex flex-col gap-1.5">
                              <Badge
                                variant={getStatusVariant(request.status)}
                                className="text-xs font-semibold"
                              >
                                {request.status === "approved"
                                  ? "Disetujui atasan"
                                  : request.status === "rejected"
                                    ? "Ditolak"
                                    : request.status === "replacement_requested"
                                      ? "Minta Ganti Staff"
                                      : formatBusinessTripStatus(request.status)}
                              </Badge>
                              {request.status === "approved" &&
                                request.missionDetails?.status ===
                                  "waiting_staff_confirmation" && (
                                  <Badge variant="warning" className="text-xs">
                                    Menunggu konfirmasi staff
                                  </Badge>
                                )}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="text-sm text-slate-700 dark:text-slate-300">
                              {formatDate(
                                request.decidedAt || request.approvedAt,
                              )}
                            </div>
                            {request.approvedByName && (
                              <div className="text-xs text-slate-500 mt-1">
                                oleh {request.approvedByName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <div className="text-sm text-slate-700 dark:text-slate-300 max-w-xs">
                              {request.status === "approved" &&
                              request.missionDetails?.status ===
                                "waiting_staff_confirmation"
                                ? "Approval atasan selesai, menunggu konfirmasi staff."
                                : request.status === "rejected"
                                  ? request.notes ||
                                    request.rejectionReason ||
                                    "-"
                                  : request.notes || "-"}
                            </div>
                          </TableCell>
                          <TableCell className="py-5 px-4 align-top">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleDetails(request)}
                              className="h-9 px-3 text-xs"
                            >
                              Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Panel - Redesigned for Approvers */}
      <Dialog
        open={!!selectedRequestForModal}
        onOpenChange={(open) => {
          if (!open) setSelectedRequestForModal(null);
        }}
      >
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-800">
          <VisuallyHidden.Root>
            <DialogTitle>Detail Persetujuan Perjalanan Dinas</DialogTitle>
          </VisuallyHidden.Root>
          {isLoadingModalDetails ? (
            <div className="space-y-3 p-6">
              <div className="h-8 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          ) : selectedRequestForModal ? (
            <div className="space-y-6 p-6">
              {/* Header Section */}
              <div className="space-y-5 pb-6 border-b border-slate-200 dark:border-slate-800/60">
                <div>
                  <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                    {selectedRequestForModal.missionName || "-"}
                  </h1>
                  <p className="text-sm text-slate-500 mt-3 font-medium">
                    {formatDestination(selectedRequestForModal.missionDetails)}{" "}
                    •{" "}
                    {formatDate(
                      selectedRequestForModal.missionDetails?.startDate,
                    )}{" "}
                    s/d{" "}
                    {formatDate(
                      selectedRequestForModal.missionDetails?.endDate,
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                  <Badge
                    variant={getStatusVariant(selectedRequestForModal.status)}
                    className="text-xs font-semibold"
                  >
                    {formatBusinessTripStatus(selectedRequestForModal.status)}
                  </Badge>
                  <div className="flex gap-2 items-center text-xs text-slate-500">
                    <span>Dibuat oleh:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {selectedRequestForModal.missionDetails?.assignedByName ||
                        "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Summary Cards Grid */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {/* SPD Number */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/40 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Nomor SPD
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-3">
                    {selectedRequestForModal.missionDetails?.assignmentNumber ||
                      "-"}
                  </p>
                </div>

                {/* Destination */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/40 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Tujuan
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-3 line-clamp-2">
                    {formatDestination(selectedRequestForModal.missionDetails)}
                  </p>
                </div>

                {/* Total Members */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/40 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Total Anggota
                  </p>
                  <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-3">
                    {selectedRequestForModal.memberUids?.length || 0}
                  </p>
                </div>

                {/* Members Needing My Approval */}
                <div className="rounded-lg border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-500/15 p-4 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Perlu Persetujuan Saya
                  </p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-3">
                    {selectedRequestForModal.memberUids?.length || 0}
                  </p>
                </div>

                {/* Approval Status */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/40 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-3">
                    {formatBusinessTripStatus(selectedRequestForModal.status)}
                  </p>
                </div>
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800/60" />

              {/* Mission Details Section */}
              <div className="space-y-5">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                  Informasi Perjalanan
                </h2>
                <div className="grid gap-5 p-5 rounded-lg border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Periode
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 mt-2">
                        {formatDate(
                          selectedRequestForModal.missionDetails?.startDate,
                        )}{" "}
                        <span className="text-slate-500 dark:text-slate-400">s/d</span>{" "}
                        {formatDate(
                          selectedRequestForModal.missionDetails?.endDate,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Dibuat Oleh
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 mt-2">
                        {selectedRequestForModal.missionDetails
                          ?.assignedByName || "-"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Alamat Tujuan
                    </p>
                    <p className="text-sm text-slate-900 dark:text-slate-100 mt-2">
                      {selectedRequestForModal.missionDetails
                        ?.destinationAddress || "-"}
                    </p>
                  </div>

                  {selectedRequestForModal.missionDetails?.instructionNote ||
                  selectedRequestForModal.missionDetails?.instructionHtml ? (
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Instruksi
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 mt-2">
                        {stripHtml(
                          selectedRequestForModal.missionDetails
                            .instructionNote ||
                            selectedRequestForModal.missionDetails
                              .instructionHtml,
                        )}
                      </p>
                    </div>
                  ) : null}

                  {selectedRequestForModal.missionDetails
                    ?.assignmentLetterUrl ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Dokumen SPD
                      </p>
                      {(() => {
                        const fileId = extractGoogleDriveFileId(
                          selectedRequestForModal.missionDetails
                            .assignmentLetterUrl,
                        );
                        const previewUrl = fileId
                          ? `/api/storage/google-drive-preview?fileId=${fileId}`
                          : null;

                        return fileId && previewUrl ? (
                          <div className="flex flex-wrap gap-3 mt-3">
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-medium bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-500/30 transition border border-cyan-300 dark:border-cyan-500/30"
                            >
                              📄 Preview SPD
                            </a>
                            <a
                              href={`${previewUrl}&download=true`}
                              download
                              className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition border border-slate-300 dark:border-slate-700"
                            >
                              ⬇️ Download SPD
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                            ⚠️ Dokumen belum bisa dipreview lintas akun. Hubungi
                            admin untuk membuka akses.
                          </p>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800/60" />

              {/* Members Section - Approval Flow */}
              <div className="space-y-6">
                {/* Approval Flow Explanation */}
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                    Arus Persetujuan
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Staff → Manager */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/30 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/40 transition">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-xs font-semibold"
                        >
                          Staff Biasa
                        </Badge>
                        <span className="text-slate-400 dark:text-slate-500">→</span>
                        <Badge
                          variant="secondary"
                          className="text-xs font-semibold"
                        >
                          Manager Divisi
                        </Badge>
                      </div>
                    </div>

                    {/* Manager → Director */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/30 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/40 transition">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-xs font-semibold"
                        >
                          Manager Divisi
                        </Badge>
                        <span className="text-slate-400 dark:text-slate-500">→</span>
                        <Badge
                          variant="secondary"
                          className="text-xs font-semibold"
                        >
                          Direktur
                        </Badge>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/30 p-4 hover:bg-slate-100 dark:hover:bg-slate-900/40 transition">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Status Request
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-3">
                        {formatBusinessTripStatus(
                          selectedRequestForModal.status,
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Members Needing Approval */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                      ✓ Perlu Persetujuan Anda
                    </h3>
                    <Badge variant="default" className="text-xs">
                      {selectedRequestForModal.memberUids?.length || 0} orang
                    </Badge>
                  </div>

                  {selectedRequestForModal.memberDetails &&
                  selectedRequestForModal.memberDetails.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800/50">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-900/60">
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Nama
                            </TableHead>
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Posisi
                            </TableHead>
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Brand / Divisi
                            </TableHead>
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Tipe
                            </TableHead>
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Approver
                            </TableHead>
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Status Approval
                            </TableHead>
                            <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">
                              Konfirmasi Staff
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedRequestForModal.memberDetails.map(
                            (member: any, idx: number) => {
                              const memberApprovalStatus =
                                member.approvalStatus ||
                                selectedRequestForModal.status;
                              const memberConfirmationStatus =
                                member.staffConfirmationStatus ||
                                member.memberStatus ||
                                "-";
                              const memberIndex =
                                selectedRequestForModal.memberUids.indexOf(
                                  member.employeeUid || member.id,
                                );
                              const memberName =
                                member.employeeName ||
                                selectedRequestForModal.memberNames?.[
                                  memberIndex
                                ] ||
                                member.id ||
                                "Tidak diketahui";

                              // Determine if member is Staff or Manager
                              const isMemberManager =
                                member.role
                                  ?.toLowerCase()
                                  .includes("manager") ||
                                member.position
                                  ?.toLowerCase()
                                  .includes("manager");
                              const memberType = isMemberManager
                                ? "Manager Divisi"
                                : "Staff";

                              return (
                                <TableRow
                                  key={member.id || member.employeeUid}
                                  className={
                                    idx % 2 === 1 ? "bg-slate-50 dark:bg-slate-900/40" : "bg-white dark:bg-transparent"
                                  }
                                >
                                  <TableCell className="text-slate-900 dark:text-slate-50 font-medium">
                                    {memberName}
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                                    {member.employeePosition || "-"}
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                                    {member.brandName && member.divisionName
                                      ? `${member.brandName} / ${member.divisionName}`
                                      : member.brandName ||
                                        member.divisionName ||
                                        "-"}
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                                    <Badge
                                      variant="outline"
                                      className="text-xs font-semibold"
                                    >
                                      {memberType}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                                    {member.managerName || "-"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={getStatusVariant(
                                        memberApprovalStatus,
                                      )}
                                      className="text-xs"
                                    >
                                      {formatBusinessTripStatus(
                                        memberApprovalStatus,
                                      )}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={getStatusVariant(
                                        memberConfirmationStatus,
                                      )}
                                      className="text-xs"
                                    >
                                      {formatBusinessTripStatus(
                                        memberConfirmationStatus,
                                      )}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            },
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 p-6 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Memuat detail anggota...
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline Section */}
              {modalTimeline.length > 0 && (
                  <>
                    <Separator className="bg-slate-200 dark:bg-slate-800/60" />
                    <div className="space-y-5">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                        Timeline Aktivitas
                      </h2>
                      <div className="space-y-3">
                        {modalTimeline.map(
                          (entry: any, idx: number) => (
                            <div
                              key={entry.id}
                              className="relative flex gap-4 pb-3 last:pb-0"
                            >
                              {/* Timeline connector line */}
                              {idx < modalTimeline.length - 1 && (
                                <div className="absolute left-[15px] top-10 h-6 w-px bg-gradient-to-b from-cyan-500/30 to-transparent" />
                              )}

                              {/* Timeline dot */}
                              <div className="relative mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/50 bg-cyan-100 dark:bg-cyan-500/10" />
                                <div className="h-2 w-2 rounded-full bg-cyan-500 dark:bg-cyan-400" />
                              </div>

                              {/* Timeline content */}
                              <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/30 p-4">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                                  {entry.message}
                                </p>
                                <p className="text-xs text-slate-500 mt-2">
                                  {formatDate(entry.createdAt)}
                                </p>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </>
                )}

              {/* Staff Changes History */}
              {selectedRequestForModal.staffChanges &&
                selectedRequestForModal.staffChanges.length > 0 && (
                  <>
                    <Separator className="bg-slate-200 dark:bg-slate-700/50" />
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                        Riwayat Perubahan Staff
                      </h2>
                      <div className="space-y-2">
                        {selectedRequestForModal.staffChanges.map(
                          (change: any) => (
                            <div
                              key={change.id}
                              className="rounded-lg border border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-900/30 p-3"
                            >
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {change.originalStaffName}{" "}
                                <span className="text-slate-400">→</span>{" "}
                                {change.newStaffName}
                              </p>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                {change.reason}
                              </p>
                              <p className="text-xs text-slate-500 mt-2">
                                {formatDate(change.createdAt)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </>
                )}

              {/* Action Buttons Section */}
              <div className="border-t border-slate-200 dark:border-slate-800/60 pt-6 mt-6">
                <div className="space-y-4">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50 uppercase tracking-wide">
                    Tindakan Persetujuan
                  </p>

                  <div className="space-y-4">
                    {/* Notes Section */}
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Catatan (untuk tolak atau minta ganti)
                      </label>
                      <Textarea
                        value={
                          decisionNotesByRequest[selectedRequestForModal.id] ||
                          ""
                        }
                        onChange={(e) =>
                          setDecisionNotesByRequest((prev) => ({
                            ...prev,
                            [selectedRequestForModal.id]: e.target.value,
                          }))
                        }
                        placeholder="Tulis alasan jika Anda menolak atau meminta penggantian..."
                        rows={3}
                        className="mt-3 text-sm bg-white dark:bg-slate-900/50 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() =>
                          handleApproveAll(selectedRequestForModal)
                        }
                        disabled={
                          isSaving ||
                          selectedRequestForModal.status === "approved" ||
                          selectedRequestForModal.status === "rejected"
                        }
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="mr-2 h-4 w-4" /> Setujui Semua
                      </Button>

                      <Button
                        onClick={() =>
                          handleRequestReplacement(selectedRequestForModal)
                        }
                        disabled={
                          isSaving ||
                          selectedRequestForModal.status === "approved" ||
                          selectedRequestForModal.status === "rejected"
                        }
                        variant="secondary"
                      >
                        <RefreshCcw className="mr-2 h-4 w-4" /> Minta Ganti
                        Staff
                      </Button>

                      <Button
                        onClick={() =>
                          handleRejectRequest(selectedRequestForModal)
                        }
                        disabled={
                          isSaving ||
                          selectedRequestForModal.status === "approved" ||
                          selectedRequestForModal.status === "rejected"
                        }
                        variant="destructive"
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Tolak
                      </Button>

                      <Button
                        onClick={() => setSelectedRequestForModal(null)}
                        variant="outline"
                        className="ml-auto"
                      >
                        Tutup
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Replacement Modal Dialog */}
      <Dialog
        open={showReplacementModal}
        onOpenChange={setShowReplacementModal}
      >
        <DialogContent className="max-w-2xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-800">
          <VisuallyHidden.Root>
            <DialogTitle>Ganti Staff Perjalanan Dinas</DialogTitle>
          </VisuallyHidden.Root>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                Ganti Staff Perjalanan Dinas
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Pilih anggota yang akan diganti dan kandidat pengganti dari
                divisi yang sama
              </p>
            </div>

            <div className="space-y-4">
              {/* Member Selection */}
              <div className="space-y-2">
                <Label htmlFor="member-select" className="text-slate-700 dark:text-slate-200">
                  Anggota yang akan diganti
                </Label>
                <Select
                  value={selectedMemberForReplacement?.employeeUid || ""}
                  onValueChange={(uid) => {
                    const member = selectedRequestForModal?.memberDetails?.find(
                      (m: any) => m.employeeUid === uid,
                    );
                    if (member) {
                      setSelectedMemberForReplacement(member);
                      setSelectedReplacementUid(null);
                      loadReplacementCandidates(member);
                    }
                  }}
                >
                  <SelectTrigger
                    id="member-select"
                    className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50"
                  >
                    <SelectValue placeholder="Pilih anggota..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    {selectedRequestForModal?.memberDetails?.map(
                      (member: any) => (
                        <SelectItem
                          key={member.employeeUid}
                          value={member.employeeUid}
                          className="text-slate-900 dark:text-slate-50"
                        >
                          {member.employeeName} - {member.employeePosition}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Candidate Selection */}
              <div className="space-y-2">
                <Label htmlFor="candidate-select" className="text-slate-700 dark:text-slate-200">
                  Pengganti dari Divisi{" "}
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                    {selectedMemberDivisionName || "divisi"}
                  </span>
                </Label>
                {!selectedMemberForReplacement ? (
                  <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-sm text-slate-500 dark:text-slate-400">
                    Pilih anggota terlebih dahulu untuk melihat kandidat
                    pengganti
                  </div>
                ) : isLoadingCandidates ? (
                  <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-sm text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-cyan-500 dark:border-cyan-400 border-t-transparent rounded-full" />
                      Memuat kandidat pengganti...
                    </div>
                  </div>
                ) : replacementCandidates.length === 0 ? (
                  <div className="bg-amber-50 dark:bg-slate-900/50 border border-amber-200 dark:border-slate-800/80 rounded-md p-3 text-sm text-amber-700 dark:text-amber-400">
                    Tidak ada kandidat pengganti aktif di divisi ini
                  </div>
                ) : (
                  <Select
                    value={selectedReplacementUid || ""}
                    onValueChange={setSelectedReplacementUid}
                  >
                    <SelectTrigger
                      id="candidate-select"
                      className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50"
                    >
                      <SelectValue placeholder="Pilih pengganti..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                      {replacementCandidates.map((candidate: any) => {
                        const displayName =
                          candidate.fullName &&
                          candidate.fullName.trim() !== "-" &&
                          candidate.fullName.trim().toLowerCase() !==
                            "division_manager"
                            ? candidate.fullName
                            : null;

                        return displayName ? (
                          <SelectItem
                            key={candidate.id || candidate.uid}
                            value={candidate.uid}
                            className="text-slate-900 dark:text-slate-50 cursor-pointer py-2"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{displayName}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {candidate.position !== "-"
                                  ? candidate.position
                                  : "Posisi tidak terdaftar"}
                              </span>
                              {candidate.brandName &&
                                candidate.brandName !== "-" && (
                                  <span className="text-xs text-slate-500">
                                    {candidate.brandName} /
                                    {candidate.divisionName}
                                  </span>
                                )}
                            </div>
                          </SelectItem>
                        ) : null;
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Replacement Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason-textarea" className="text-slate-700 dark:text-slate-200">
                  Alasan penggantian
                </Label>
                <Textarea
                  id="reason-textarea"
                  value={replacementReason}
                  onChange={(e) => setReplacementReason(e.target.value)}
                  placeholder="Jelaskan alasan mengapa staff ini perlu diganti..."
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  rows={4}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button
                onClick={() => {
                  setShowReplacementModal(false);
                  setSelectedMemberForReplacement(null);
                  setSelectedMemberDivisionName("");
                  setSelectedReplacementUid(null);
                  setReplacementReason("");
                  setReplacementCandidates([]);
                }}
                variant="outline"
                className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                Batal
              </Button>
              <Button
                onClick={() => {
                  if (!selectedRequestForModal) return;
                  handleSubmitReplacement(selectedRequestForModal);
                }}
                disabled={
                  isSaving ||
                  !selectedMemberForReplacement ||
                  !selectedReplacementUid ||
                  !replacementReason.trim()
                }
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                <Check className="mr-2 h-4 w-4" /> Konfirmasi Penggantian
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
