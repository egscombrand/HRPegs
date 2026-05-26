"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  getDoc,
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
import { Check, RefreshCcw, XCircle } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  formatDestination as formatDestinationHelper,
  extractGoogleDriveFileId,
} from "@/lib/dinas-utils";

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
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "destructive";
    case "partial_approved":
    case "replacement_requested":
      return "warning";
    default:
      return "secondary";
  }
}

function normalizeApprovalRequestStatus(status?: string) {
  if (!status) return "Menunggu persetujuan atasan";
  const normalized = String(status).toLowerCase();
  const labelMap: Record<string, string> = {
    pending: "Menunggu persetujuan atasan",
    waiting: "Menunggu persetujuan atasan",
    waiting_manager_validation: "Menunggu persetujuan atasan",
    pending_manager_validation: "Menunggu persetujuan atasan",
    approved: "Disetujui",
    rejected: "Ditolak",
    partial_approved: "Disetujui sebagian",
    replacement_requested: "Diminta ganti staff",
  };
  return labelMap[normalized] || status;
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

  const approvalQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.uid) return null;
    // Include common pending-like statuses so managers see requests
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

  const {
    data: approvalRequests,
    isLoading: isLoadingRequests,
    error: approvalQueryError,
  } = useCollection<BusinessTripApprovalRequest>(approvalQuery || null);

  // Local approvals state populated from the approvalQuery snapshots
  const [approvals, setApprovals] = useState<
    Array<BusinessTripApprovalRequest & { id: string; _ref?: any }>
  >([]);
  const [isFetchingApprovals, setIsFetchingApprovals] = useState(false);
  const [approvalFetchError, setApprovalFetchError] = useState<any>(null);

  useEffect(() => {
    if (!firestore || !approvalQuery) {
      setApprovals([]);
      return;
    }

    let active = true;
    setIsFetchingApprovals(true);
    setApprovalFetchError(null);

    (async () => {
      try {
        const snap = await getDocs(approvalQuery);
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
          _ref: d.ref,
        }));
        if (!active) return;
        setApprovals(items);
      } catch (err) {
        console.error("Gagal memuat approvals:", err);
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
  }, [firestore, approvalQuery]);

  // silently keep local approvals in sync; no debug logs in UI
  useEffect(() => {
    if (!userProfile?.uid || !approvalRequests) return;
    // no-op: approvalRequests used to populate UI via snapshot hook
  }, [approvalRequests, userProfile?.uid]);

  useEffect(() => {
    if (!firestore || approvals.length === 0) {
      setMissionDetailsById({});
      return;
    }

    let active = true;
    const missionIds = Array.from(
      new Set(approvals.map((request) => request.missionId).filter(Boolean)),
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
  }, [approvals, firestore]);

  const updateApprovalRequest = useCallback(
    async (
      request: BusinessTripApprovalRequest & { id: string },
      changes: Partial<BusinessTripApprovalRequest>,
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
      if (!request.id || !firestore) return;

      setIsSaving(true);
      try {
        // Update approval_requests
        await updateApprovalRequest(request, {
          status: "approved",
          decidedAt: serverTimestamp(),
          notes: "Disetujui semua.",
          approvedMemberUids: request.memberUids,
          rejectedMemberUids: [],
        });

        // Update all members with approval status
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
            memberStatus: "waiting_staff_confirmation",
            updatedAt: serverTimestamp(),
          });
        }

        toast({
          title: "Persetujuan berhasil",
          description:
            "Semua anggota disetujui dan siap untuk konfirmasi staff.",
        });

        // Close modal - user can click Detail again to see updated data
        setSelectedRequestForModal(null);
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
    [firestore, toast, updateApprovalRequest],
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
      const selected = selectedMemberUidsByRequest[request.id] || [];
      const note = decisionNotesByRequest[request.id]?.trim();

      if (!selected.length) {
        toast({
          variant: "destructive",
          title: "Pilih anggota terlebih dahulu",
          description:
            "Pilih satu atau beberapa anggota untuk meminta pengganti.",
        });
        return;
      }
      if (!note) {
        toast({
          variant: "destructive",
          title: "Tulis alasan atau saran pengganti",
          description: "Masukkan catatan sebelum meminta pengganti staff.",
        });
        return;
      }

      if (!firestore) return;

      setIsSaving(true);
      try {
        const replacementSuggestions = {
          ...(request.replacementSuggestions || {}),
        } as Record<string, string>;
        selected.forEach((memberUid) => {
          replacementSuggestions[memberUid] = note;
        });

        // Update approval_requests
        await updateApprovalRequest(request, {
          status: "replacement_requested",
          decidedAt: serverTimestamp(),
          notes: note,
          replacementSuggestions,
        });

        // Update selected members with replacement_requested status
        for (const memberUid of selected) {
          const memberRef = doc(
            firestore,
            "business_trip_missions",
            request.missionId,
            "members",
            memberUid,
          );
          await updateDoc(memberRef, {
            approvalStatus: "replacement_requested",
            memberStatus: "replacement_requested",
            replacementReason: note,
            updatedAt: serverTimestamp(),
          });
        }

        toast({
          title: "Permintaan ganti staff terkirim",
          description: `Permintaan pengganti untuk ${selected.length} anggota telah dicatat.`,
        });

        // Clear selection and close modal
        setSelectedMemberUidsByRequest((prev) => ({
          ...prev,
          [request.id]: [],
        }));
        setDecisionNotesByRequest((prev) => ({
          ...prev,
          [request.id]: "",
        }));
        setSelectedRequestForModal(null);
      } catch (error: any) {
        console.error("Gagal request replacement:", error);
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
      selectedMemberUidsByRequest,
      decisionNotesByRequest,
      toast,
      updateApprovalRequest,
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

        toast({
          title: "Permintaan ditolak",
          description:
            "Permintaan persetujuan dan semua anggota telah ditolak.",
        });

        // Close modal - user can click Detail again to see updated data
        setSelectedRequestForModal(null);
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
    [decisionNotesByRequest, firestore, toast, updateApprovalRequest],
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

  const requestRowsWithMissionName = useMemo(
    () =>
      approvals.map((request) => ({
        ...request,
        missionDetails: missionDetailsById[request.missionId],
        missionName:
          request.missionName ||
          missionDetailsById[request.missionId]?.missionName ||
          "-",
      })),
    [approvals, missionDetailsById],
  );

  if (isLoadingRequests) {
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
          <CardTitle>Persetujuan Perjalanan Dinas</CardTitle>
          <CardDescription>
            Lihat permintaan persetujuan yang ditugaskan kepada Anda dan ambil
            tindakan jika diperlukan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isLoadingRequests &&
          !approvalQueryError &&
          approvals.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tidak ada permintaan persetujuan saat ini.
              </p>
              {approvalQueryError || approvalFetchError ? (
                <div className="p-4 rounded bg-amber-500/10 border border-amber-500/20 mt-4">
                  <p className="text-sm font-bold text-amber-400">
                    Terjadi error saat memuat persetujuan:
                  </p>
                  <pre className="text-xs text-amber-200 mt-2 break-words">
                    {String(
                      (approvalQueryError as any)?.message ||
                        String(approvalFetchError) ||
                        approvalQueryError,
                    )}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Perjalanan</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Anggota yang perlu disetujui</TableHead>
                      <TableHead>Dibuat oleh</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestRowsWithMissionName.map((request) => {
                      const missionDetails = request.missionDetails;
                      const anggotaText =
                        request.memberNames.length > 0
                          ? request.memberNames.join(", ")
                          : `${request.memberUids.length} anggota`;
                      const createdBy =
                        missionDetails?.assignedByName ||
                        missionDetails?.assignedByPosition ||
                        "-";

                      return (
                        <TableRow key={request.id}>
                          <TableCell>{request.missionName}</TableCell>
                          <TableCell>
                            {missionDetails?.destinationCity || "-"}
                          </TableCell>
                          <TableCell>
                            {formatDate(missionDetails?.startDate)} -{" "}
                            {formatDate(missionDetails?.endDate)}
                          </TableCell>
                          <TableCell>{anggotaText}</TableCell>
                          <TableCell>{createdBy}</TableCell>
                          <TableCell>
                            <Badge
                              variant={getStatusVariant(
                                normalizeApprovalRequestStatus(request.status),
                              )}
                            >
                              {normalizeApprovalRequestStatus(request.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleDetails(request)}
                              >
                                Detail
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApproveAll(request)}
                                disabled={
                                  isSaving ||
                                  request.status === "approved" ||
                                  request.status === "rejected"
                                }
                              >
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRejectRequest(request)}
                                disabled={
                                  isSaving ||
                                  request.status === "approved" ||
                                  request.status === "rejected"
                                }
                              >
                                Tolak
                              </Button>
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

      {/* Detail Modal */}
      <Dialog
        open={!!selectedRequestForModal}
        onOpenChange={(open) => {
          if (!open) setSelectedRequestForModal(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 text-slate-100 border border-slate-700">
          <DialogHeader>
            <DialogTitle>{selectedRequestForModal?.missionName}</DialogTitle>
            <DialogDescription>
              Detail lengkap permintaan persetujuan perjalanan dinas
            </DialogDescription>
          </DialogHeader>

          {isLoadingModalDetails ? (
            <div className="space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-700" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-700" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-700" />
            </div>
          ) : selectedRequestForModal ? (
            <div className="space-y-6">
              {/* Mission Summary */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Ringkasan Perjalanan</h3>
                <div className="grid gap-4 md:grid-cols-2 p-4 rounded-2xl border border-slate-700 bg-slate-950/80">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Nama Perjalanan
                    </p>
                    <p className="text-sm font-medium">
                      {selectedRequestForModal.missionName || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Nomor SPD
                    </p>
                    <p className="text-sm font-medium">
                      {selectedRequestForModal.missionDetails
                        ?.assignmentNumber || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Tujuan
                    </p>
                    <p className="text-sm font-medium">
                      {formatDestination(
                        selectedRequestForModal.missionDetails,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Periode
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(
                        selectedRequestForModal.missionDetails?.startDate,
                      )}{" "}
                      s/d{" "}
                      {formatDate(
                        selectedRequestForModal.missionDetails?.endDate,
                      )}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Alamat Tujuan
                    </p>
                    <p className="text-sm">
                      {selectedRequestForModal.missionDetails
                        ?.destinationAddress || "-"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Instruksi
                    </p>
                    <p className="text-sm">
                      {stripHtml(
                        selectedRequestForModal.missionDetails
                          ?.instructionNote ||
                          selectedRequestForModal.missionDetails
                            ?.instructionHtml ||
                          "-",
                      )}
                    </p>
                  </div>
                  {selectedRequestForModal.missionDetails
                    ?.assignmentLetterUrl ? (
                    <div className="md:col-span-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Dokumen SPD
                      </p>
                      <a
                        href={
                          selectedRequestForModal.missionDetails
                            .assignmentLetterUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-primary underline"
                      >
                        Buka lampiran SPD
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>

              <Separator />

              {/* Members List with Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">
                  Daftar Anggota ({selectedRequestForModal.memberUids.length})
                </h3>
                <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Posisi</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Divisi</TableHead>
                        <TableHead>Approver</TableHead>
                        <TableHead>Status Approval</TableHead>
                        <TableHead>Status Konfirmasi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRequestForModal.memberDetails &&
                      selectedRequestForModal.memberDetails.length > 0 ? (
                        selectedRequestForModal.memberDetails.map(
                          (member: any) => {
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
                              selectedRequestForModal.memberNames[
                                memberIndex
                              ] ||
                              member.id ||
                              "Tidak diketahui";

                            return (
                              <TableRow key={member.id || member.employeeUid}>
                                <TableCell>{memberName}</TableCell>
                                <TableCell>
                                  {member.employeePosition || "-"}
                                </TableCell>
                                <TableCell>{member.brandName || "-"}</TableCell>
                                <TableCell>
                                  {member.divisionName || "-"}
                                </TableCell>
                                <TableCell>
                                  {member.managerName || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={getStatusVariant(
                                      memberApprovalStatus,
                                    )}
                                  >
                                    {normalizeApprovalRequestStatus(
                                      memberApprovalStatus,
                                    )}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={getStatusVariant(
                                      memberConfirmationStatus,
                                    )}
                                  >
                                    {normalizeApprovalRequestStatus(
                                      memberConfirmationStatus,
                                    )}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          },
                        )
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center py-6 text-muted-foreground"
                          >
                            Memuat detail anggota...
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Timeline */}
              {selectedRequestForModal.timeline &&
                selectedRequestForModal.timeline.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Timeline</h3>
                    <div className="space-y-2">
                      {selectedRequestForModal.timeline.map((entry: any) => (
                        <div
                          key={entry.id}
                          className="text-xs p-3 rounded-2xl border border-slate-700 bg-slate-950/80 flex justify-between"
                        >
                          <span>{entry.message}</span>
                          <span className="text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {selectedRequestForModal.staffChanges &&
                selectedRequestForModal.staffChanges.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">
                        Riwayat Perubahan Staff
                      </h3>
                      <div className="space-y-2">
                        {selectedRequestForModal.staffChanges.map(
                          (change: any) => (
                            <div
                              key={change.id}
                              className="text-xs p-3 rounded-2xl border border-slate-700 bg-slate-950/80"
                            >
                              <p className="font-medium">
                                {change.originalStaffName} →{" "}
                                {change.newStaffName}
                              </p>
                              <p className="text-muted-foreground">
                                {change.reason}
                              </p>
                              <p className="text-muted-foreground text-[11px] mt-1">
                                {formatDate(change.createdAt)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </>
                )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
