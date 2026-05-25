"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  collectionGroup,
  doc,
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
import { Check, ChevronDown, RefreshCcw, XCircle } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

function formatDate(value: any) {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return "-";
  }
}

function getStatusVariant(status?: BusinessTripApprovalRequest["status"]) {
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

export function BusinessTripApprovalClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(
    null,
  );
  const [selectedMemberUidsByRequest, setSelectedMemberUidsByRequest] =
    useState<Record<string, string[]>>({});
  const [decisionNotesByRequest, setDecisionNotesByRequest] = useState<
    Record<string, string>
  >({});
  const [missionNamesById, setMissionNamesById] = useState<
    Record<string, string>
  >({});

  const approvalQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile?.uid) return null;
    return query(
      collectionGroup(firestore, "approval_requests"),
      where("approverUid", "==", userProfile.uid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
    );
  }, [firestore, userProfile?.uid]);

  const {
    data: approvalRequests,
    isLoading: isLoadingRequests,
    error: approvalQueryError,
  } = useCollection<BusinessTripApprovalRequest>(approvalQuery);

  const approvalRows = useMemo(
    () => approvalRequests || [],
    [approvalRequests],
  );

  useEffect(() => {
    if (!userProfile?.uid || !approvalRequests) return;
    console.debug("BusinessTripApprovalClient debug", {
      currentUserUid: userProfile.uid,
      approvalRequestsLength: approvalRequests.length,
      approvalRequests,
      approverUids: approvalRequests.map((request) => request.approverUid),
    });
  }, [approvalRequests, userProfile?.uid]);

  useEffect(() => {
    if (!firestore || approvalRows.length === 0) {
      setMissionNamesById({});
      return;
    }

    let active = true;
    const missionIds = Array.from(
      new Set(approvalRows.map((request) => request.missionId).filter(Boolean)),
    );

    Promise.all(
      missionIds.map(async (missionId) => {
        const missionRef = doc(firestore, "business_trip_missions", missionId);
        const missionSnap = await getDoc(missionRef);
        return [
          missionId,
          missionSnap.exists()
            ? ((missionSnap.data() as any).missionName as string) || ""
            : "",
        ] as const;
      }),
    )
      .then((entries) => {
        if (!active) return;
        setMissionNamesById(Object.fromEntries(entries));
      })
      .catch((error) => {
        console.warn("Gagal memuat nama misi", error);
      });

    return () => {
      active = false;
    };
  }, [approvalRows, firestore]);

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
      if (!request.id) return;
      await updateApprovalRequest(request, {
        status: "approved",
        decidedAt: serverTimestamp(),
        notes: "Disetujui semua.",
        approvedMemberUids: request.memberUids,
        rejectedMemberUids: [],
      });
      toast({
        title: "Persetujuan berhasil",
        description: "Semua anggota disetujui.",
      });
    },
    [toast, updateApprovalRequest],
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

      const replacementSuggestions = {
        ...(request.replacementSuggestions || {}),
      } as Record<string, string>;
      selected.forEach((memberUid) => {
        replacementSuggestions[memberUid] = note;
      });

      await updateApprovalRequest(request, {
        status: "replacement_requested",
        decidedAt: serverTimestamp(),
        notes: note,
        replacementSuggestions,
      });
      toast({
        title: "Permintaan ganti staff terkirim",
        description: "Permintaan pengganti telah dicatat.",
      });
    },
    [
      decisionNotesByRequest,
      selectedMemberUidsByRequest,
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

      await updateApprovalRequest(request, {
        status: "rejected",
        decidedAt: serverTimestamp(),
        notes: note,
        rejectionReason: note,
      });
      toast({
        title: "Permintaan ditolak",
        description: "Permintaan persetujuan telah ditolak.",
      });
    },
    [decisionNotesByRequest, toast, updateApprovalRequest],
  );

  const handleToggleDetails = useCallback((requestId: string) => {
    setExpandedRequestId((current) =>
      current === requestId ? null : requestId,
    );
  }, []);

  const requestRowsWithMissionName = useMemo(
    () =>
      approvalRows.map((request) => ({
        ...request,
        missionName:
          request.missionName || missionNamesById[request.missionId] || "-",
      })),
    [approvalRows, missionNamesById],
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
          {requestRowsWithMissionName.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tidak ada permintaan persetujuan saat ini.
              </p>
              {approvalQueryError ? (
                <div className="p-4 rounded bg-amber-500/10 border border-amber-500/20 mb-4">
                  <p className="text-sm font-bold text-amber-400">
                    Terjadi error saat memuat persetujuan:
                  </p>
                  <pre className="text-xs text-amber-200 mt-2 break-words">
                    {String(
                      (approvalQueryError as any)?.message ||
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
                      <TableHead>Mission</TableHead>
                      <TableHead>Level Approver</TableHead>
                      <TableHead>Anggota</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dibuat</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestRowsWithMissionName.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>{request.missionName}</TableCell>
                        <TableCell>
                          {request.approverName} ({request.approvalLevel || "-"}
                          )
                        </TableCell>
                        <TableCell>{request.memberUids.length}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(request.status)}>
                            {request.status || "pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(request.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApproveAll(request)}
                              disabled={
                                isSaving ||
                                request.status === "approved" ||
                                request.status === "rejected"
                              }
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Setujui Semua
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleToggleDetails(request.id!)}
                            >
                              <ChevronDown className="mr-2 h-4 w-4" />
                              Lihat Detail
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {requestRowsWithMissionName.map((request) => {
                const isExpanded = request.id === expandedRequestId;
                const selectedMemberUids =
                  selectedMemberUidsByRequest[request.id!] || [];
                const note = decisionNotesByRequest[request.id!] || "";
                return (
                  <div
                    key={request.id}
                    className={`rounded-lg border p-4 ${isExpanded ? "bg-slate-50" : "bg-white"}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {request.missionName}
                        </p>
                        <p className="text-base font-semibold">
                          {request.approverName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusVariant(request.status)}>
                          {request.status || "pending"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleDetails(request.id!)}
                        >
                          {isExpanded ? "Sembunyikan" : "Detail"}
                        </Button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-sm font-medium">Misi</p>
                            <p className="text-sm text-muted-foreground">
                              {request.missionName}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              Jumlah anggota
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.memberUids.length}
                            </p>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <p className="text-sm font-medium">Pilih anggota</p>
                          <div className="grid gap-2">
                            {request.memberUids.map((memberUid, index) => {
                              const memberName =
                                request.memberNames[index] || memberUid;
                              const selected =
                                selectedMemberUids.includes(memberUid);
                              return (
                                <label
                                  key={memberUid}
                                  className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2"
                                >
                                  <span>
                                    <span className="font-medium">
                                      {memberName}
                                    </span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {memberUid}
                                    </span>
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      toggleMemberSelection(
                                        request.id!,
                                        memberUid,
                                      )
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            Catatan keputusan
                          </p>
                          <Textarea
                            value={note}
                            onChange={(event) =>
                              setDecisionNotesByRequest((prev) => ({
                                ...prev,
                                [request.id!]: event.target.value,
                              }))
                            }
                            placeholder="Tuliskan alasan, instruksi, atau saran pengganti..."
                            rows={4}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => handleApproveSelected(request)}
                            disabled={
                              isSaving ||
                              request.status === "approved" ||
                              request.status === "rejected"
                            }
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Setujui Sebagian
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleRequestReplacement(request)}
                            disabled={
                              isSaving ||
                              request.status === "approved" ||
                              request.status === "rejected"
                            }
                          >
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Minta Ganti Staff
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleRejectRequest(request)}
                            disabled={
                              isSaving ||
                              request.status === "approved" ||
                              request.status === "rejected"
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Tolak
                          </Button>
                        </div>

                        {request.replacementSuggestions &&
                        Object.keys(request.replacementSuggestions).length >
                          0 ? (
                          <div className="rounded border bg-slate-50 p-3">
                            <p className="text-sm font-medium">
                              Saran pengganti
                            </p>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                              {Object.entries(
                                request.replacementSuggestions,
                              ).map(([uid, suggestion]) => {
                                const index = request.memberUids.indexOf(uid);
                                const name = request.memberNames[index] || uid;
                                return (
                                  <li key={uid}>
                                    <span className="font-medium">{name}:</span>{" "}
                                    {suggestion}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
