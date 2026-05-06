import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import {
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BankChangeReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: any; // the bank_change_requests doc
  employeeData: any; // the merged employee data
  onSuccess: () => void;
}

export function BankChangeReviewModal({
  open,
  onOpenChange,
  request,
  employeeData,
  onSuccess,
}: BankChangeReviewModalProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  const handleAction = async (action: "approve" | "reject") => {
    if (action === "reject" && !rejectNote.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Catatan penolakan wajib diisi.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(firestore);
      const reqRef = doc(firestore, "bank_change_requests", request.id);
      
      batch.update(reqRef, {
        status: action === "approve" ? "approved" : "rejected",
        hrdNote: rejectNote,
        reviewedAt: serverTimestamp(),
        reviewedBy: userProfile?.uid,
        reviewedByName: userProfile?.fullName,
      });

      if (action === "approve") {
        // Update employee profile
        const profileRef = doc(firestore, "employee_profiles", request.employeeUid);
        batch.update(profileRef, {
          "dataRekening.bankName": request.requestedBankName,
          "dataRekening.bankAccountNumber": request.requestedAccountNumber,
          "dataRekening.bankAccountHolderName": request.requestedAccountHolderName,
          "dataRekening.bankDocumentUrl": request.requestedProofUrl || "",
        });
      }

      await batch.commit();

      toast({
        title: action === "approve" ? "Berhasil Disetujui" : "Berhasil Ditolak",
        description: `Pengajuan perubahan rekening telah ${action === "approve" ? "disetujui" : "ditolak"}.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Terjadi kesalahan sistem.",
      });
    } finally {
      setIsSubmitting(false);
      setActionType(null);
    }
  };

  const maskAccount = (num: string) => {
    if (!num) return "-";
    if (num.length <= 4) return "***" + num;
    return "******" + num.slice(-4);
  };

  if (!request || !employeeData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Review Perubahan Data Rekening</DialogTitle>
          <DialogDescription>
            Silakan periksa pengajuan perubahan rekening dari karyawan berikut.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Employee Info */}
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Informasi Karyawan</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Nama Lengkap</p>
                <p className="text-sm font-medium text-white">{employeeData.fullName}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Email</p>
                <p className="text-sm font-medium text-white truncate" title={employeeData.email}>{employeeData.email}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Brand / Divisi</p>
                <p className="text-sm font-medium text-white">{employeeData.brandName} - {employeeData.division}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Status Kerja</p>
                <p className="text-sm font-medium text-white capitalize">{employeeData.employmentStatus}</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Rekening Lama */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Rekening Aktif Saat Ini</h3>
                <Badge variant="outline" className="border-slate-700 text-slate-400">Current</Badge>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Nama Bank</p>
                  <p className="text-sm font-medium text-white">{request.currentBankName || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Nomor Rekening</p>
                  <p className="text-sm font-medium text-white">{maskAccount(request.currentAccountNumber)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Nama Pemilik</p>
                  <p className="text-sm font-medium text-white">{request.currentAccountHolderName || "-"}</p>
                </div>
              </div>
            </div>

            {/* Rekening Baru */}
            <div className="bg-emerald-900/10 p-4 rounded-xl border border-emerald-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-bl-full -z-10" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider">Rekening Baru (Pengajuan)</h3>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10">New Request</Badge>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-emerald-500/70 uppercase font-bold">Nama Bank</p>
                  <p className="text-sm font-medium text-emerald-50">{request.requestedBankName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-500/70 uppercase font-bold">Nomor Rekening</p>
                  <p className="text-sm font-medium text-emerald-50">{request.requestedAccountNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-500/70 uppercase font-bold">Nama Pemilik</p>
                  <p className="text-sm font-medium text-emerald-50">{request.requestedAccountHolderName}</p>
                </div>
                {request.requestedProofUrl && (
                  <div>
                    <p className="text-[10px] text-emerald-500/70 uppercase font-bold mb-1">Bukti Rekening</p>
                    <a href={request.requestedProofUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">
                      Lihat Dokumen / Foto
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Alasan Perubahan</h3>
            <p className="text-sm text-slate-300 italic">"{request.reason}"</p>
          </div>

          {actionType === "reject" ? (
            <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/30 space-y-4">
              <Label className="text-red-500">Catatan Penolakan (Wajib)</Label>
              <Textarea 
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="bg-slate-950 border-red-500/30 text-white"
                placeholder="Berikan alasan kenapa pengajuan ini ditolak..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setActionType(null)} disabled={isSubmitting}>Batal</Button>
                <Button variant="destructive" onClick={() => handleAction("reject")} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Konfirmasi Tolak"}
                </Button>
              </div>
            </div>
          ) : actionType === "approve" ? (
            <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/30 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-500">Konfirmasi Persetujuan</h4>
                  <p className="text-sm text-slate-300 mt-1">Data rekening utama karyawan akan langsung diupdate dengan data baru ini.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setActionType(null)} disabled={isSubmitting}>Batal</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleAction("approve")} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ya, Setujui Perubahan"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" className="border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={() => setActionType("reject")}>
                <XCircle className="mr-2 h-4 w-4" /> Tolak Pengajuan
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActionType("approve")}>
                <CheckCircle className="mr-2 h-4 w-4" /> Setujui Perubahan
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
