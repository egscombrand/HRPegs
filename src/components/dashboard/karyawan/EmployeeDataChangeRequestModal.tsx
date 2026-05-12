"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { 
  validateStorageFile, 
  compressImage, 
  handleStorageError 
} from "@/lib/storage-utils";
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
import {
  Loader2,
  FileUp,
  Info,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertCircle,
  FileText,
  UserPlus,
  Heart,
  CreditCard,
  FileBadge,
} from "lucide-react";
import type { EmployeeProfile } from "@/lib/types";

export type ChangeRequestCategory =
  | "ktp"
  | "pajak"
  | "bpjs_ks"
  | "bpjs_tk"
  | "payroll"
  | "kk"
  | "marriage"
  | "birth_cert"
  | "spouse_ktp"
  | "family_bpjs"
  | "legal_extra";

const MARITAL_STATUS_OPTIONS = [
  "Belum Menikah",
  "Menikah",
  "Cerai Hidup",
  "Cerai Mati",
];

const CATEGORY_LABELS: Record<ChangeRequestCategory, string> = {
  ktp: "Data KTP (NIK / Foto KTP)",
  pajak: "Data Pajak (NPWP)",
  bpjs_ks: "BPJS Kesehatan",
  bpjs_tk: "BPJS Ketenagakerjaan",
  payroll: "Rekening Payroll",
  kk: "Kartu Keluarga (KK)",
  marriage: "Buku Nikah / Akta Nikah",
  birth_cert: "Akta Kelahiran Anak",
  spouse_ktp: "KTP Pasangan",
  family_bpjs: "BPJS Keluarga / Tanggungan",
  legal_extra: "Dokumen Legal Tambahan",
};

const CATEGORY_ICONS: Record<ChangeRequestCategory, any> = {
  ktp: CreditCard,
  pajak: FileBadge,
  bpjs_ks: ShieldCheck,
  bpjs_tk: ShieldCheck,
  payroll: CreditCard,
  kk: FileText,
  marriage: Heart,
  birth_cert: UserPlus,
  spouse_ktp: CreditCard,
  family_bpjs: ShieldCheck,
  legal_extra: FileText,
};

const formSchema = z.object({
  category: z.string().min(1, "Kategori wajib dipilih"),
  reason: z.string().min(5, "Alasan wajib diisi dengan jelas"),
  requestedData: z.any(),
  supportingDocuments: z
    .array(z.string())
    .min(1, "Minimal 1 dokumen pendukung wajib diunggah"),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProfile: Partial<EmployeeProfile>;
  category?: ChangeRequestCategory;
  requestedData?: any;
  onSuccess?: () => void;
}

export function EmployeeDataChangeRequestModal({
  open,
  onOpenChange,
  initialProfile,
  category: initialCategory,
  requestedData: initialRequestedData,
  onSuccess,
}: Props) {
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [latestRequest, setLatestRequest] = useState<any>(null);
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: initialCategory || "",
      reason: "",
      requestedData: initialRequestedData || {},
      supportingDocuments: [],
    },
  });

  const documentCategoryMap: Record<ChangeRequestCategory, string> = {
    pajak: "npwp",
    bpjs_ks: "bpjs_kesehatan",
    bpjs_tk: "bpjs_ketenagakerjaan",
    ktp: "",
    payroll: "",
    kk: "",
    marriage: "",
    birth_cert: "",
    spouse_ktp: "",
    family_bpjs: "",
    legal_extra: "",
  };

  const isDocumentRequest = (cat: ChangeRequestCategory) =>
    ["pajak", "bpjs_ks", "bpjs_tk"].includes(cat);

  // Fetch latest request for this category
  useEffect(() => {
    const fetchLatestRequest = async () => {
      const cat = (initialCategory ||
        form.getValues("category")) as ChangeRequestCategory;
      if (!firebaseUser || !cat || !open) return;

      setIsLoadingLatest(true);
      try {
        const requestCollection = isDocumentRequest(cat)
          ? "employee_document_change_requests"
          : "employee_change_requests";

        const q = query(
          collection(firestore, requestCollection),
          where("employeeUid", "==", firebaseUser.uid),
          where(
            isDocumentRequest(cat) ? "documentType" : "category",
            "==",
            isDocumentRequest(cat) ? documentCategoryMap[cat] : cat,
          ),
          orderBy("submittedAt", "desc"),
          limit(1),
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setLatestRequest({
            id: snapshot.docs[0].id,
            ...snapshot.docs[0].data(),
          });
        } else {
          setLatestRequest(null);
        }
      } catch (err) {
        console.error("Error fetching latest request:", err);
      } finally {
        setIsLoadingLatest(false);
      }
    };

    fetchLatestRequest();
  }, [firebaseUser, initialCategory, open, form.watch("category")]);

  useEffect(() => {
    if (initialCategory) form.setValue("category", initialCategory);
    if (initialRequestedData)
      form.setValue("requestedData", initialRequestedData);
  }, [initialCategory, initialRequestedData, form]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !firebaseUser) return;

    const fileList = Array.from(files);

    for (const file of fileList) {
      const validation = validateStorageFile(file);
      if (!validation.isValid) {
        toast({
          variant: "destructive",
          title: "File Terlalu Besar",
          description: `${file.name}: ${validation.message}`,
        });
        continue;
      }

      const processedFile = await compressImage(file);
      const fileId = Math.random().toString(36).substring(7);
      
      try {
        setUploadProgress((prev) => ({ ...prev, [fileId]: 10 }));
        
        const filePath = `change_requests/${firebaseUser.uid}/${Date.now()}_${processedFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        
        const result = await uploadFile(processedFile, filePath, firebaseUser.uid, {
          category: 'change_request_supporting',
          ownerUid: firebaseUser.uid,
          compress: false // Already compressed
        });

        const url = result.webViewLink || result.downloadUrl || "";
        
        const currentDocs = form.getValues("supportingDocuments") || [];
        form.setValue("supportingDocuments", [...currentDocs, url], {
          shouldValidate: true,
        });
        
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      } catch (error: any) {
        console.error("Change request upload error:", error);
        toast({
          variant: "destructive",
          title: "Upload Gagal",
          description: `Gagal mengunggah ${file.name} ke Google Drive.`,
        });
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!firebaseUser) return;

    // Check for pending request again just in case
    if (latestRequest?.status === "pending") {
      toast({
        variant: "destructive",
        title: "Pengajuan Tertunda",
        description: "Anda masih memiliki pengajuan aktif untuk kategori ini.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const isDocRequest = isDocumentRequest(
        values.category as ChangeRequestCategory,
      );
      const collectionName = isDocRequest
        ? "employee_document_change_requests"
        : "employee_change_requests";

      const payload: any = {
        employeeUid: firebaseUser.uid,
        employeeName: initialProfile.fullName || firebaseUser.displayName || "",
        currentData: getCategoryCurrentData(
          values.category as ChangeRequestCategory,
          initialProfile,
        ),
        requestedData: values.requestedData,
        reason: values.reason,
        status: "pending",
        submittedAt: serverTimestamp(),
      };

      if (isDocRequest) {
        payload.documentType =
          documentCategoryMap[values.category as ChangeRequestCategory];
        payload.requestedFileUrl = values.supportingDocuments?.[0] || "";
        payload.supportingDocuments = values.supportingDocuments;
        payload.hrdNote = "";
        payload.reviewedAt = null;
        payload.reviewedBy = null;
      } else {
        payload.category = values.category;
        payload.supportingDocuments = values.supportingDocuments;
      }

      const docRef = await addDoc(
        collection(firestore, collectionName),
        payload,
      );

      // Kirim notifikasi ke HRD
      try {
        await addDoc(collection(firestore, "hrd_notifications"), {
          type: isDocRequest
            ? "employee_document_change_request"
            : "employee_change_request",
          category: values.category,
          documentType: isDocRequest ? payload.documentType : undefined,
          title: "Pengajuan Perubahan Data Baru",
          message: `${initialProfile.fullName || firebaseUser.displayName || "Karyawan"} mengajukan perubahan ${CATEGORY_LABELS[values.category as ChangeRequestCategory]}.`,
          employeeUid: firebaseUser.uid,
          employeeName:
            initialProfile.fullName || firebaseUser.displayName || "",
          requestId: docRef.id,
          isRead: false,
          link: `/admin/hrd/employee-data/karyawan`,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.error("Gagal kirim notifikasi ke HRD", notifErr);
      }

      toast({
        title: "Berhasil",
        description: "Pengajuan perubahan data berhasil dikirim ke HRD.",
      });
      form.reset();
      onSuccess?.();
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

  const getCategoryCurrentData = (
    cat: ChangeRequestCategory,
    profile: Partial<EmployeeProfile>,
  ) => {
    switch (cat) {
      case "ktp":
        return {
          nik: profile.dataDiriIdentitas?.nik || "",
          ktpPhotoUrl: profile.dataDiriIdentitas?.ktpPhotoUrl || "",
        };
      case "pajak":
        return {
          npwp: profile.dokumenAdministratif?.npwp || "",
          npwpPhotoUrl: profile.dokumenAdministratif?.npwpPhotoUrl || "",
        };
      case "bpjs_ks":
        return {
          bpjsKes: profile.dokumenAdministratif?.bpjsKesehatan || "",
          bpjsKesPhotoUrl:
            profile.dokumenAdministratif?.bpjsKesehatanPhotoUrl || "",
        };
      case "bpjs_tk":
        return {
          bpjsTk: profile.dokumenAdministratif?.bpjsKetenagakerjaan || "",
          bpjsTkPhotoUrl:
            profile.dokumenAdministratif?.bpjsKetenagakerjaanPhotoUrl || "",
        };
      case "payroll":
        return profile.dataRekening || {};
      case "kk":
        return {
          noKK: (profile.familyDocuments as any)?.kk?.number || "",
          fileUrl: (profile.familyDocuments as any)?.kk?.fileUrl || "",
        };
      case "marriage":
        return {
          noDokumen:
            (profile.familyDocuments as any)?.marriageCertificate?.number || "",
          fileUrl:
            (profile.familyDocuments as any)?.marriageCertificate?.fileUrl ||
            "",
        };
      case "birth_cert":
        return (profile.familyDocuments as any)?.childBirthCertificates || [];
      case "spouse_ktp":
        return {
          nikPasangan: (profile.familyDocuments as any)?.spouseKtp?.nik || "",
          fileUrl: (profile.familyDocuments as any)?.spouseKtp?.fileUrl || "",
        };
      case "family_bpjs":
        return (profile.familyDocuments as any)?.familyBpjsMembers || [];
      case "legal_extra":
        return (profile.familyDocuments as any)?.additionalDocuments || [];
      default:
        return {};
    }
  };

  const getRequestLabel = (request: any) => {
    if (!request) return "kategori ini";
    if (request.category) {
      return (
        CATEGORY_LABELS[request.category as ChangeRequestCategory] ||
        request.category
      );
    }
    if (request.documentType) {
      return (
        CATEGORY_LABELS[
          Object.keys(documentCategoryMap).find(
            (key) =>
              documentCategoryMap[key as ChangeRequestCategory] ===
              request.documentType,
          ) as ChangeRequestCategory
        ] || request.documentType
      );
    }
    return "kategori ini";
  };

  const isPending = latestRequest?.status === "pending";
  const SelectedIcon =
    CATEGORY_ICONS[form.watch("category") as ChangeRequestCategory] || Info;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] md:w-[92vw] max-w-[1000px] max-h-[90vh] bg-slate-950 border-slate-800 p-0 overflow-hidden flex flex-col shadow-2xl">
        <div className="shrink-0 z-10 px-6 py-5 md:px-10 md:py-6 border-b border-slate-800/60 bg-slate-900/90 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
              <SelectedIcon className="h-7 w-7 text-blue-500" />
              Ajukan Perubahan Data Penting
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-400 mt-2 leading-relaxed">
              Perubahan pada data sensitif memerlukan tinjauan HRD. Data Anda
              akan diperbarui setelah pengajuan ini disetujui.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-6 md:p-10">
            {isLoadingLatest ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                <p className="text-slate-400 font-medium">
                  Memeriksa status pengajuan...
                </p>
              </div>
            ) : isPending ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-10 flex flex-col items-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-10 w-10 text-amber-500" />
                </div>
                <div className="max-w-md">
                  <h4 className="text-xl font-bold text-amber-500 mb-2">
                    Pengajuan Sedang Diproses
                  </h4>
                  <p className="text-slate-400 leading-relaxed">
                    Anda sudah memiliki pengajuan aktif untuk
                    <strong> {getRequestLabel(latestRequest)} </strong>
                    yang dikirim pada{" "}
                    {new Date(
                      latestRequest.submittedAt?.seconds * 1000,
                    ).toLocaleDateString("id-ID")}
                    . Mohon tunggu persetujuan HRD sebelum membuat pengajuan
                    baru.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="rounded-xl border-slate-800 bg-slate-900/50"
                >
                  Tutup Modal
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                <div className="lg:col-span-3 space-y-8">
                  <Form {...form}>
                    <form
                      id="change-request-form"
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-8"
                    >
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">
                              Kategori Perubahan
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!!initialCategory}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/50 border-slate-800/80 h-14 rounded-xl text-base">
                                  <SelectValue placeholder="Pilih Kategori" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {Object.entries(CATEGORY_LABELS).map(
                                  ([val, label]) => (
                                    <SelectItem
                                      key={val}
                                      value={val}
                                      className="py-3"
                                    >
                                      {label}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">
                              Alasan Perubahan
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Jelaskan alasan Anda melakukan perubahan data ini secara detail..."
                                className="bg-slate-900/50 border-slate-800/80 min-h-[120px] resize-none rounded-xl text-base"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Category Specific Inputs */}
                      <div className="bg-slate-900/30 rounded-2xl border border-slate-800/60 p-6 space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-5 w-1 rounded-full bg-blue-500" />
                          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                            Data Baru yang Diajukan
                          </h4>
                        </div>

                        {form.watch("category") === "pajak" && (
                          <FormField
                            control={form.control}
                            name="requestedData.npwp"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  Nomor NPWP Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/50 border-slate-800 h-12"
                                    placeholder="Contoh: 12.345.678.9-012.000"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "ktp" && (
                          <FormField
                            control={form.control}
                            name="requestedData.nik"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  Nomor NIK Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    maxLength={16}
                                    className="bg-slate-950/50 border-slate-800 h-12 font-mono"
                                    placeholder="16 digit angka NIK"
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.value.replace(/[^0-9]/g, ""),
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "bpjs_ks" && (
                          <FormField
                            control={form.control}
                            name="requestedData.bpjsKes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  BPJS Kesehatan Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/50 border-slate-800 h-12"
                                    placeholder="Nomor kartu BPJS Kes"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "bpjs_tk" && (
                          <FormField
                            control={form.control}
                            name="requestedData.bpjsTk"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  BPJS Ketenagakerjaan Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/50 border-slate-800 h-12"
                                    placeholder="Nomor kartu BPJS TK"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "payroll" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name="requestedData.bankName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                    Bank Baru
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="bg-slate-950/50 border-slate-800 h-12"
                                      placeholder="Contoh: BCA"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="requestedData.bankAccountNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                    Nomor Rekening Baru
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="bg-slate-950/50 border-slate-800 h-12"
                                      placeholder="000111222"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="requestedData.bankAccountHolderName"
                              render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                  <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                    Nama Pemilik Rekening Baru
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="bg-slate-950/50 border-slate-800 h-12"
                                      placeholder="Sesuai buku tabungan"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        {form.watch("category") === "kk" && (
                          <FormField
                            control={form.control}
                            name="requestedData.noKK"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  Nomor Kartu Keluarga Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/50 border-slate-800 h-12"
                                    placeholder="16 digit No KK"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "marriage" && (
                          <FormField
                            control={form.control}
                            name="requestedData.noDokumen"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  Nomor Buku / Akta Nikah Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/50 border-slate-800 h-12"
                                    placeholder="Sesuai dokumen"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "birth_cert" && (
                          <FormField
                            control={form.control}
                            name="requestedData.childName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  Nama Anak
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-slate-950/50 border-slate-800 h-12 text-white">
                                      <SelectValue placeholder="Pilih Nama Anak" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-slate-900 border-slate-800">
                                    {(
                                      initialProfile.familyDocuments as any
                                    )?.childBirthCertificates?.map((c: any) => (
                                      <SelectItem
                                        key={c.childName}
                                        value={c.childName}
                                      >
                                        {c.childName}
                                      </SelectItem>
                                    )) || (
                                      <div className="p-4 text-xs text-slate-500 italic">
                                        Belum ada data anak terverifikasi.
                                      </div>
                                    )}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "spouse_ktp" && (
                          <FormField
                            control={form.control}
                            name="requestedData.nikPasangan"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                  NIK Pasangan Baru
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/50 border-slate-800 h-12"
                                    placeholder="16 digit NIK Pasangan"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {form.watch("category") === "family_bpjs" && (
                          <div className="space-y-6">
                            <FormField
                              control={form.control}
                              name="requestedData.dependentName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                    Anggota Tanggungan
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/50 border-slate-800 h-12 text-white">
                                        <SelectValue placeholder="Pilih Anggota" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                      {(
                                        initialProfile.familyDocuments as any
                                      )?.familyBpjsMembers?.map((m: any) => (
                                        <SelectItem
                                          key={m.dependentName}
                                          value={m.dependentName}
                                        >
                                          {m.dependentName} ({m.relationship})
                                        </SelectItem>
                                      )) || (
                                        <div className="p-4 text-xs text-slate-500 italic">
                                          Belum ada data tanggungan
                                          terverifikasi.
                                        </div>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="requestedData.bpjsNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                    Nomor BPJS Baru
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="bg-slate-950/50 border-slate-800 h-12"
                                      placeholder="No kartu BPJS"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        {form.watch("category") === "legal_extra" && (
                          <div className="space-y-6">
                            <FormField
                              control={form.control}
                              name="requestedData.documentType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                    Jenis Dokumen
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/50 border-slate-800 h-12 text-white">
                                        <SelectValue placeholder="Pilih Jenis" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                      {[
                                        "Surat Cerai",
                                        "Akta Kematian",
                                        "Dokumen Wali / Adopsi",
                                        "Dokumen Lainnya",
                                      ].map((t) => (
                                        <SelectItem key={t} value={t}>
                                          {t}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            {form.watch("requestedData.documentType") ===
                              "Dokumen Lainnya" && (
                              <FormField
                                control={form.control}
                                name="requestedData.documentName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-slate-400 text-xs font-bold uppercase">
                                      Nama Dokumen
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        className="bg-slate-950/50 border-slate-800 h-12"
                                        placeholder="Tulis nama dokumen"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      <FormField
                        control={form.control}
                        name="supportingDocuments"
                        render={({ field }) => (
                          <FormItem className="space-y-4">
                            <div>
                              <FormLabel className="text-slate-300 font-bold text-sm tracking-wide">
                                Dokumen Pendukung
                              </FormLabel>
                              <FormDescription className="text-xs text-slate-400 mt-1 leading-relaxed">
                                Wajib mengunggah bukti legal (KTP, NPWP, Akta,
                                dll) sesuai kategori yang diajukan.
                              </FormDescription>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {field.value.map((url, index) => (
                                <div
                                  key={index}
                                  className="relative group rounded-xl overflow-hidden border border-slate-800 bg-slate-900/50 p-2"
                                >
                                  <div className="h-32 w-full rounded-lg bg-slate-950 flex items-center justify-center">
                                    <img
                                      src={url}
                                      alt="Proof"
                                      className="h-full w-full object-contain"
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      const next = [...field.value];
                                      next.splice(index, 1);
                                      form.setValue(
                                        "supportingDocuments",
                                        next,
                                      );
                                    }}
                                    className="absolute top-4 right-4 h-8 w-8 p-0 rounded-lg"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}

                              <div className="relative h-36 rounded-xl border-2 border-dashed border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 transition-all flex flex-col items-center justify-center p-4 text-center cursor-pointer group">
                                <Input
                                  type="file"
                                  multiple
                                  accept="image/*,application/pdf"
                                  onChange={handleFileUpload}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <FileUp className="w-6 h-6 text-slate-500 mb-2 group-hover:text-blue-400" />
                                <span className="text-xs font-bold text-slate-400">
                                  Klik untuk upload
                                </span>
                              </div>
                            </div>

                            {Object.entries(uploadProgress).map(
                              ([id, progress]) => (
                                <div key={id} className="space-y-1">
                                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500 transition-all"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-blue-400 font-bold uppercase">
                                    Uploading... {progress}%
                                  </p>
                                </div>
                              ),
                            )}

                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-6">
                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Informasi Penting
                    </h4>
                    <ul className="space-y-3">
                      {[
                        "Data lama tetap berlaku sampai HRD menyetujui pengajuan ini.",
                        "Pastikan dokumen pendukung terbaca dengan jelas.",
                        "Proses verifikasi biasanya memakan waktu 1-3 hari kerja.",
                        "HRD mungkin akan menghubungi Anda untuk validasi lebih lanjut.",
                      ].map((txt, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-400 leading-relaxed flex gap-2"
                        >
                          <span className="text-blue-500 mt-1.5 h-1 w-1 rounded-full bg-blue-500 shrink-0" />
                          {txt}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {latestRequest && latestRequest.status === "rejected" && (
                    <div className="bg-red-500/5 rounded-2xl border border-red-500/20 p-6">
                      <h4 className="text-xs font-bold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Pengajuan Sebelumnya Ditolak
                      </h4>
                      <div className="p-3 bg-red-950/30 rounded-xl border border-red-900/30 text-xs text-red-300 italic">
                        "{latestRequest.hrdNote}"
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isPending && !isLoadingLatest && (
          <div className="shrink-0 z-10 px-6 py-5 md:px-10 md:py-6 border-t border-slate-800/60 bg-slate-900/90 backdrop-blur-xl flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-slate-800 bg-transparent hover:bg-slate-900 h-12 px-6"
            >
              Batal
            </Button>
            <Button
              form="change-request-form"
              disabled={isSubmitting || Object.keys(uploadProgress).length > 0}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white h-12 px-8 font-bold shadow-lg shadow-blue-900/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...
                </>
              ) : (
                "Kirim Pengajuan"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
