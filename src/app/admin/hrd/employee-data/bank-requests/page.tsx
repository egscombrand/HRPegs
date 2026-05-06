"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, updateDoc, writeBatch } from "firebase/firestore";
import type { BankChangeRequest } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function BankChangeRequestsPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [selectedRequest, setSelectedRequest] = useState<BankChangeRequest | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [hrdNote, setHrdNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const { data: requests, isLoading, mutate } = useCollection<BankChangeRequest>(
    useMemoFirebase(() => collection(firestore, "bank_change_requests"), [firestore])
  );

  const handleReview = (req: BankChangeRequest) => {
    setSelectedRequest(req);
    setHrdNote(req.hrdNote || "");
    setIsReviewOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest || !userProfile) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(firestore);
      
      const reqRef = doc(firestore, "bank_change_requests", selectedRequest.id!);
      batch.update(reqRef, {
        status: "approved",
        hrdNote,
        reviewedAt: new Date(),
        reviewedBy: userProfile.uid,
      });

      const profileRef = doc(firestore, "employee_profiles", selectedRequest.employeeUid);
      batch.update(profileRef, {
        "dataRekening.bankName": selectedRequest.requestedBankName,
        "dataRekening.bankAccountNumber": selectedRequest.requestedAccountNumber,
        "dataRekening.bankAccountHolderName": selectedRequest.requestedAccountHolderName,
        "dataRekening.bankDocumentUrl": selectedRequest.requestedProofUrl,
      });

      await batch.commit();
      toast({ title: "Berhasil", description: "Pengajuan disetujui." });
      setIsReviewOpen(false);
      mutate?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !userProfile) return;
    if (!hrdNote.trim()) {
      toast({ variant: "destructive", title: "Catatan Wajib", description: "Berikan catatan alasan penolakan." });
      return;
    }
    setIsProcessing(true);
    try {
      const reqRef = doc(firestore, "bank_change_requests", selectedRequest.id!);
      await updateDoc(reqRef, {
        status: "rejected",
        hrdNote,
        reviewedAt: new Date(),
        reviewedBy: userProfile.uid,
      });

      toast({ title: "Berhasil", description: "Pengajuan ditolak." });
      setIsReviewOpen(false);
      mutate?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Pengajuan Perubahan Rekening" menuConfig={menuConfig}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  const sortedRequests = (requests || []).sort((a, b) => {
    // pending first
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0);
  });

  return (
    <DashboardLayout pageTitle="Pengajuan Perubahan Rekening" menuConfig={menuConfig}>
      <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Pengajuan Rekening</h1>
            <p className="text-xs text-slate-500 mt-1">Review dan approval perubahan data rekening karyawan</p>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-950/50 backdrop-blur-xl">
          <CardHeader className="p-4 border-b border-slate-800/50" />
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-20 text-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mx-auto" />
                <p className="text-sm text-slate-500 font-medium">Memuat data pengajuan...</p>
              </div>
            ) : sortedRequests.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-900/40">
                    <TableRow className="border-slate-800/50 hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase font-black text-slate-500 px-6 h-10">Karyawan</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Tanggal</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Rekening Baru</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Alasan</TableHead>
                      <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Status</TableHead>
                      <TableHead className="text-right px-6 h-10">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRequests.map((req) => (
                      <TableRow key={req.id} className="border-slate-800/50 hover:bg-slate-900/30 transition-colors group">
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white">{req.employeeName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] text-slate-400">
                            {req.submittedAt?.toDate ? format(req.submittedAt.toDate(), "dd MMM yyyy HH:mm") : "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-300">{req.requestedBankName}</span>
                            <span className="text-[10px] text-slate-500">{req.requestedAccountNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] text-slate-400 line-clamp-2 max-w-[200px]" title={req.reason}>
                            {req.reason}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={
                              req.status === "pending" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                              req.status === "approved" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                              "bg-red-500/10 text-red-500 border-red-500/20"
                            }
                          >
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-3 rounded-lg text-xs font-bold bg-slate-900 border border-slate-800 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all"
                            onClick={() => handleReview(req)}
                          >
                            <Eye className="mr-2 h-3.5 w-3.5" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-20 text-center space-y-4">
                <FileSpreadsheet className="h-12 w-12 text-slate-800 mx-auto" />
                <p className="text-sm text-slate-500 font-medium">Belum ada pengajuan perubahan rekening.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="sm:max-w-[700px] bg-slate-950 border-slate-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Pengajuan Perubahan Rekening</DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Data Rekening Aktif</p>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-200">{selectedRequest.currentBankName || "-"}</p>
                    <p className="text-xs text-slate-400">{selectedRequest.currentAccountNumber || "-"}</p>
                    <p className="text-xs text-slate-400">{selectedRequest.currentAccountHolderName || "-"}</p>
                  </div>
                </div>
                
                <div className="p-4 bg-blue-900/20 rounded-xl border border-blue-500/20">
                  <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">Data Rekening Pengajuan</p>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-200">{selectedRequest.requestedBankName}</p>
                    <p className="text-xs text-blue-300">{selectedRequest.requestedAccountNumber}</p>
                    <p className="text-xs text-blue-300">{selectedRequest.requestedAccountHolderName}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Alasan Perubahan</p>
                <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  {selectedRequest.reason}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Bukti Rekening / Tabungan</p>
                <div className="group relative w-full aspect-[4/3] max-w-[300px] rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                  <img src={selectedRequest.requestedProofUrl} alt="Bukti Baru" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-slate-950/60 transition-opacity">
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={() => window.open(selectedRequest.requestedProofUrl, "_blank")}
                    >
                      Buka Penuh
                    </Button>
                  </div>
                </div>
              </div>

              {selectedRequest.status === "pending" && (
                <div className="space-y-2 pt-4 border-t border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Catatan HRD (Wajib jika menolak)</p>
                  <Textarea 
                    value={hrdNote} 
                    onChange={(e) => setHrdNote(e.target.value)}
                    placeholder="Masukkan catatan persetujuan / penolakan..."
                    className="bg-slate-900 border-slate-800"
                  />
                </div>
              )}
              {selectedRequest.status !== "pending" && selectedRequest.hrdNote && (
                 <div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Catatan HRD</p>
                 <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                   {selectedRequest.hrdNote}
                 </p>
               </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-6 border-t border-slate-800 pt-4">
            {selectedRequest?.status === "pending" ? (
              <div className="flex w-full justify-between">
                <Button variant="destructive" onClick={handleReject} disabled={isProcessing}>
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tolak
                </Button>
                <Button variant="default" className="bg-emerald-600 hover:bg-emerald-500" onClick={handleApprove} disabled={isProcessing}>
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Setujui Perubahan
                </Button>
              </div>
            ) : (
              <Button onClick={() => setIsReviewOpen(false)}>Tutup</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
