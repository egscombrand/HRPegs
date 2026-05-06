"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, where, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileUp, Info, Clock, CheckCircle2, XCircle, Wallet, ShieldCheck, CreditCard } from "lucide-react";
import type { EmployeeProfile } from "@/lib/types";

const INDONESIAN_BANKS = [
  "Bank Mandiri",
  "Bank BRI",
  "Bank BNI",
  "Bank BTN",
  "Bank Central Asia (BCA)",
  "Bank CIMB Niaga",
  "Bank Danamon",
  "Bank Permata",
  "Bank Panin",
  "Bank Mega",
  "Bank OCBC NISP",
  "Bank Maybank Indonesia",
  "Bank Sinarmas",
  "Bank Bukopin",
  "Bank BTPN",
  "Bank Syariah Indonesia (BSI)",
  "Bank Muamalat",
  "Bank DKI",
  "Bank Jabar Banten (BJB)",
  "Bank Jateng",
  "Bank Jatim",
  "Bank Sumut",
  "Bank Nagari",
  "Bank NTB Syariah",
  "Bank Papua",
  "Bank Kalbar",
  "Bank Kaltimtara",
  "Bank Kalsel",
  "Bank Sulselbar",
  "Bank Sulteng",
  "Bank Sultra",
  "Bank SulutGo",
  "Bank Maluku Malut",
  "Bank Bengkulu",
  "Bank Lampung",
];

const formSchema = z.object({
  reason: z.string().min(5, "Alasan wajib diisi dengan jelas"),
  requestedBankName: z.string().min(1, "Nama bank wajib dipilih"),
  requestedAccountNumber: z.string().min(5, "Nomor rekening wajib diisi dan minimal 5 digit").regex(/^[0-9]+$/, "Hanya angka"),
  requestedAccountHolderName: z.string().min(3, "Nama pemilik wajib diisi"),
  requestedProofUrl: z.string().url("Bukti rekening wajib diunggah"),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProfile: Partial<EmployeeProfile>;
  latestRequest: any | null;
  onSuccess: () => void;
}

const maskAccountNumber = (num: string) => {
  if (!num) return "-";
  if (num.length <= 4) return num;
  return "*".repeat(num.length - 4) + num.slice(-4);
};

export function BankChangeRequestModal({ open, onOpenChange, initialProfile, latestRequest, onSuccess }: Props) {
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
      requestedBankName: "",
      requestedAccountNumber: "",
      requestedAccountHolderName: "",
      requestedProofUrl: "",
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Terlalu Besar",
        description: "Maksimal 5MB",
      });
      return;
    }

    const storage = getStorage();
    const storageRef = ref(storage, `bank_proofs/${firebaseUser.uid}_${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Gagal upload",
          description: error.message,
        });
        setUploadProgress(0);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        form.setValue("requestedProofUrl", url, { shouldValidate: true });
        setUploadProgress(0);
        toast({ title: "Berhasil", description: "Bukti rekening terunggah" });
      }
    );
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!firebaseUser) return;
    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(firestore, "bank_change_requests"), {
        employeeUid: firebaseUser.uid,
        employeeName: initialProfile.fullName || firebaseUser.displayName || "",
        currentBankName: initialProfile.dataRekening?.bankName || "",
        currentAccountNumber: initialProfile.dataRekening?.bankAccountNumber || "",
        currentAccountHolderName: initialProfile.dataRekening?.bankAccountHolderName || "",
        requestedBankName: values.requestedBankName,
        requestedAccountNumber: values.requestedAccountNumber,
        requestedAccountHolderName: values.requestedAccountHolderName,
        requestedProofUrl: values.requestedProofUrl,
        reason: values.reason,
        status: "pending",
        submittedAt: serverTimestamp(),
      });
      
      // Kirim notifikasi ke HRD
      try {
        const hrdQuery = query(
          collection(firestore, "users"),
          where("role", "in", ["hrd", "super-admin"])
        );
        const hrdSnap = await getDocs(hrdQuery);
        
        const notifPromises = hrdSnap.docs.map(doc => {
          return addDoc(collection(firestore, "users", doc.id, "notifications"), {
            title: "Pengajuan Perubahan Rekening Baru",
            message: `${initialProfile.fullName || firebaseUser.displayName || 'Karyawan'} mengajukan perubahan data rekening payroll. Mohon periksa dan lakukan verifikasi.`,
            type: "bank_change_request",
            targetRole: "hrd",
            employeeUid: firebaseUser.uid,
            employeeName: initialProfile.fullName || firebaseUser.displayName || "",
            requestId: docRef.id,
            isRead: false,
            link: `/admin/hrd/employee-data/bank-requests`,
            createdAt: serverTimestamp(),
          });
        });
        await Promise.all(notifPromises);
      } catch (notifErr) {
        console.error("Gagal kirim notifikasi ke HRD", notifErr);
      }

      toast({
        title: "Berhasil",
        description: "Pengajuan perubahan rekening berhasil dikirim.",
      });
      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = latestRequest?.status === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] md:w-[92vw] max-w-[1280px] h-[90vh] bg-slate-950 border-slate-800 p-0 overflow-hidden flex flex-col shadow-2xl">
        
        {/* HEADER STICKY */}
        <div className="shrink-0 z-10 px-6 py-5 md:px-10 md:py-6 border-b border-slate-800/60 bg-slate-900/90 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Wallet className="h-7 w-7 lg:h-8 lg:w-8 text-blue-500" />
              Ajukan Perubahan Data Rekening
            </DialogTitle>
            <DialogDescription className="text-sm lg:text-base text-slate-400 mt-2 max-w-3xl leading-relaxed">
              Gunakan form ini jika Anda ingin mengganti rekening payroll. Data baru tidak langsung aktif dan harus diverifikasi HRD terlebih dahulu.
            </DialogDescription>
          </DialogHeader>
        </div>
        
        {/* BODY SCROLLABLE */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-6 md:p-10">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14">
              
              {/* KOLOM KIRI (60%) - FORM */}
              <div className="lg:col-span-3 space-y-8">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-800/60">
                  <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide">Data Rekening Baru</h3>
                </div>

                <Form {...form}>
                  <form id="bank-change-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    
                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">Alasan Perubahan</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Contoh: Rekening lama terblokir / hilang" 
                              className="bg-slate-900/50 border-slate-800/80 min-h-[100px] resize-none rounded-xl focus:border-blue-500/50 text-base"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField
                        control={form.control}
                        name="requestedBankName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">Bank Tujuan Baru</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/50 border-slate-800/80 h-14 rounded-xl focus:border-blue-500/50 text-base">
                                  <SelectValue placeholder="Pilih Bank" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800 max-h-[300px]">
                                {INDONESIAN_BANKS.map(b => (
                                  <SelectItem key={b} value={b} className="text-base py-3">{b}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="requestedAccountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">Nomor Rekening Baru</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Masukkan angka saja" 
                                className="bg-slate-900/50 border-slate-800/80 h-14 rounded-xl focus:border-blue-500/50 font-mono text-base"
                                {...field}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, "");
                                  field.onChange(val);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="requestedAccountHolderName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">Nama Pemilik Rekening Baru</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Sesuai yang tertera di buku tabungan" 
                              className="bg-slate-900/50 border-slate-800/80 h-14 rounded-xl focus:border-blue-500/50 uppercase text-base" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="requestedProofUrl"
                      render={({ field }) => (
                        <FormItem className="space-y-4">
                          <div>
                            <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">Bukti Rekening / Buku Tabungan Baru</FormLabel>
                            <FormDescription className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                              Upload foto buku tabungan, screenshot m-banking, atau dokumen bank yang menampilkan nama dan nomor rekening.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <div className="mt-4">
                              {field.value ? (
                                <div className="relative group w-full rounded-xl overflow-hidden border border-slate-700 bg-slate-900/50 p-3">
                                  <img src={field.value} alt="Bukti" className="w-full h-56 object-contain rounded-lg" />
                                  <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                    <Button type="button" variant="outline" onClick={() => form.setValue("requestedProofUrl", "")} className="rounded-xl border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 h-12 px-6">
                                      <XCircle className="w-5 h-5 mr-2" /> Hapus & Ganti File
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative w-full h-56 rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-900/20 hover:bg-slate-900/40 hover:border-slate-600 transition-all flex flex-col items-center justify-center p-8 text-center cursor-pointer group">
                                  <Input 
                                    type="file" 
                                    accept="image/*,application/pdf"
                                    onChange={handleFileUpload}
                                    disabled={uploadProgress > 0}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                                  />
                                  <div className="h-16 w-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-500/10 transition-all">
                                    <FileUp className="w-8 h-8 text-slate-400 group-hover:text-blue-400 transition-colors" />
                                  </div>
                                  <div className="text-base font-bold text-slate-300 mb-1.5">Klik atau Drag & Drop dokumen ke sini</div>
                                  <div className="text-sm text-slate-500 font-medium">Max. ukuran file: 5MB (JPG, PNG, PDF)</div>
                                  
                                  {uploadProgress > 0 && (
                                    <div className="absolute inset-x-8 bottom-8 mt-4">
                                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                      </div>
                                      <div className="text-xs font-bold text-blue-400 mt-2 uppercase tracking-wider">
                                        Sedang mengunggah... {uploadProgress}%
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              </div>

              {/* KOLOM KANAN (40%) - INFORMASI */}
              <div className="lg:col-span-2 space-y-8">

                {/* Card 0: Status Pengajuan */}
                <div className={`rounded-2xl border p-6 lg:p-7 shadow-lg ${
                  !latestRequest ? "bg-slate-900/40 border-slate-800/60" :
                  latestRequest.status === "pending" ? "bg-amber-500/10 border-amber-500/30" :
                  latestRequest.status === "approved" ? "bg-emerald-500/10 border-emerald-500/30" :
                  "bg-red-500/10 border-red-500/30"
                }`}>
                  <h4 className="text-sm font-bold text-white mb-3 tracking-wide">Status Pengajuan Terakhir</h4>
                  {!latestRequest && (
                    <div>
                      <div className="inline-flex items-center px-3 py-1 rounded-md bg-slate-800 text-slate-300 text-[11px] font-bold uppercase tracking-wider mb-2">
                        Belum Ada Pengajuan
                      </div>
                      <p className="text-sm text-slate-400">Anda belum memiliki pengajuan perubahan rekening aktif.</p>
                    </div>
                  )}
                  {latestRequest?.status === "pending" && (
                    <div>
                      <div className="inline-flex items-center px-3 py-1 rounded-md bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[11px] font-bold uppercase tracking-wider mb-2">
                        <Clock className="w-3 h-3 mr-1.5" /> Menunggu Persetujuan HRD
                      </div>
                      <p className="text-sm text-amber-500/80">Pengajuan Anda sedang diperiksa oleh HRD.</p>
                    </div>
                  )}
                  {latestRequest?.status === "approved" && (
                    <div>
                      <div className="inline-flex items-center px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider mb-2">
                        <CheckCircle2 className="w-3 h-3 mr-1.5" /> Disetujui
                      </div>
                      <p className="text-sm text-emerald-500/80">Data rekening terbaru sudah menjadi data aktif payroll.</p>
                    </div>
                  )}
                  {latestRequest?.status === "rejected" && (
                    <div>
                      <div className="inline-flex items-center px-3 py-1 rounded-md bg-red-500/20 text-red-500 border border-red-500/30 text-[11px] font-bold uppercase tracking-wider mb-2">
                        <XCircle className="w-3 h-3 mr-1.5" /> Ditolak
                      </div>
                      <p className="text-sm text-red-400">Pengajuan belum dapat disetujui. Silakan lihat catatan HRD.</p>
                      {latestRequest.hrdNote && (
                        <div className="mt-3 p-3 bg-red-950/50 rounded-lg border border-red-900/50 text-xs text-red-300">
                          <strong>Catatan HRD:</strong> {latestRequest.hrdNote}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Card 1: Data Aktif */}
                <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-7 lg:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/60">
                    <h4 className="text-base font-bold text-white flex items-center gap-2.5 tracking-wide">
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                      Data Rekening Aktif
                    </h4>
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                      Data Payroll
                    </span>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Bank Aktif</p>
                      <p className="text-base font-semibold text-slate-200">
                        {initialProfile.dataRekening?.bankName || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nomor Rekening</p>
                      <p className="text-base font-semibold text-slate-200 font-mono tracking-widest">
                        {maskAccountNumber(initialProfile.dataRekening?.bankAccountNumber || "")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nama Pemilik</p>
                      <p className="text-base font-semibold text-slate-200 uppercase">
                        {initialProfile.dataRekening?.bankAccountHolderName || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card 2: Alur Persetujuan */}
                <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-7 lg:p-8">
                  <h4 className="text-base font-bold text-white mb-6 flex items-center gap-2.5 tracking-wide pb-4 border-b border-slate-800/60">
                    <Info className="w-5 h-5 text-blue-500" />
                    Alur Persetujuan
                  </h4>
                  
                  <div className="space-y-5">
                    <div className="flex gap-4">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">1</div>
                      <div>
                        <p className="text-sm font-bold text-slate-200">Pengajuan Dikirim</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Karyawan mengirim data rekening baru.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">2</div>
                      <div>
                        <p className="text-sm font-bold text-slate-200">Verifikasi HRD</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">HRD memeriksa data dan bukti rekening.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-900/30 text-emerald-500 border border-emerald-500/30 flex items-center justify-center text-xs font-bold">3</div>
                      <div>
                        <p className="text-sm font-bold text-slate-200">Disetujui / Ditolak</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Jika disetujui, rekening payroll diperbarui. Jika ditolak, rekening lama tetap digunakan.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: Catatan Penting */}
                <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-6 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">
                      Catatan Penting
                    </p>
                    <p className="text-sm text-amber-500/90 leading-relaxed font-medium">
                      Selama pengajuan belum disetujui HRD, payroll tetap menggunakan rekening aktif sebelumnya.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* FOOTER STICKY */}
        <div className="shrink-0 z-10 px-6 py-5 md:px-10 md:py-6 border-t border-slate-800/60 bg-slate-900/90 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4 mt-auto">
          <div>
            {isPending && (
              <p className="text-sm text-amber-500 font-medium">
                Anda masih memiliki pengajuan rekening yang menunggu persetujuan HRD.
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse md:flex-row gap-3 w-full md:w-auto">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 h-14 md:px-8 font-bold text-base w-full md:w-auto"
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              form="bank-change-form"
              disabled={isSubmitting || uploadProgress > 0 || isPending}
              className={`rounded-xl h-14 md:px-10 font-bold text-base w-full md:w-auto shadow-lg ${
                isPending ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
              }`}
            >
              {isSubmitting ? (
                <><Loader2 className="mr-3 h-5 w-5 animate-spin" /> Sedang Memproses...</>
              ) : (
                "Kirim Pengajuan"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
