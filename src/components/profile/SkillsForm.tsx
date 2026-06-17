"use client";

import {
  useState,
  useCallback,
  ChangeEvent,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Loader2,
  X,
  PlusCircle,
  Trash2,
  FileUp,
  Eye,
  Globe,
  Info,
  Edit,
  FileText,
} from "lucide-react";
import { Separator } from "../ui/separator";
import {
  extractFileIdFromUrl,
  openSecureFile,
} from "@/lib/candidate-docs-utils";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, setDocumentNonBlocking } from "@/firebase";
import {
  doc,
  serverTimestamp,
  Timestamp,
  query,
  collection,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { uploadFile } from "@/lib/storage/storage-adapter";
import {
  validateStorageFile,
  compressImage,
  handleStorageError,
} from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "../ui/progress";
import { Alert, AlertDescription } from "../ui/alert";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const certFileObjectSchema = z.object({
  url: z.string(),
  fileId: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  googleDriveWebViewLink: z.string().optional(),
});

const certificationSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nama sertifikasi harus diisi"),
  organization: z.string().min(1, "Nama organisasi harus diisi"),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, { message: "Format YYYY-MM harus diisi" }),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" })
    .optional()
    .or(z.literal("")),
  imageUrl: z.union([z.string(), certFileObjectSchema]).optional(),
});

const formSchema = z.object({
  cvUrl: z
    .union([
      z.string(),
      z.object({
        url: z.string(),
        fileId: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        googleDriveWebViewLink: z.string().optional(),
      }),
    ])
    .refine((val) => {
      if (typeof val === "string") return val.length > 0;
      return val.url && val.url.length > 0;
    }, "CV harus diunggah atau dilampirkan via link"),
  ijazahUrl: z
    .union([
      z.string(),
      z.object({
        url: z.string(),
        fileId: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        googleDriveWebViewLink: z.string().optional(),
      }),
    ])
    .refine((val) => {
      if (typeof val === "string") return val.length > 0;
      return val.url && val.url.length > 0;
    }, "Ijazah harus diunggah atau dilampirkan via link"),
  certifications: z.array(certificationSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FILE_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB

interface FileUploadFieldProps {
  label: string;
  value?:
    | string
    | {
        url: string;
        fileId?: string;
        fileName?: string;
        mimeType?: string;
        googleDriveWebViewLink?: string;
      };
  onChange: (
    value:
      | string
      | {
          url: string;
          fileId?: string;
          fileName?: string;
          mimeType?: string;
          googleDriveWebViewLink?: string;
        },
  ) => void;
  userId: string;
  pathPrefix: string;
  required?: boolean;
}

function FileUploadField({
  label,
  value,
  onChange,
  userId,
  pathPrefix,
  required = false,
}: FileUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      if (typeof value === "string") {
        try {
          const url = new URL(value);
          if (url.hostname.includes("firebasestorage.googleapis.com")) {
            const pathParts = decodeURIComponent(url.pathname).split("/");
            const lastPart = pathParts[pathParts.length - 1];
            const name = lastPart.split("?")[0].split("_").slice(2).join("_");
            setFileName(name || "File terunggah");
          } else {
            setFileName(url.pathname.split("/").pop() || "Link eksternal");
          }
        } catch (e) {
          setFileName("Link eksternal");
        }
      } else {
        // Object format
        setFileName(value.fileName || "File terunggah");
      }
    } else {
      setFileName(null);
    }
  }, [value]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateStorageFile(file);
    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "File Terlalu Besar",
        description: validation.message,
      });
      return;
    }

    const processedFile = await compressImage(file);
    setFileName(processedFile.name);
    setIsUploading(true);

    try {
      setProgress(10);

      const filePath = `user_docs/${userId}/${pathPrefix}_${Date.now()}_${processedFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;

      const result = await uploadFile(processedFile, filePath, userId, {
        category: "user_document",
        ownerUid: userId,
        compress: false, // Already compressed
      });

      const fileId = result.fileId;
      const secureUrl = fileId ? "/api/storage/view?fileId=" + fileId : "";

      const fileData = {
        url: secureUrl,
        fileId,
        fileName: processedFile.name,
        mimeType: result.fileType,
        googleDriveWebViewLink: result.webViewLink,
      };

      onChange(fileData);
      setIsUploading(false);

      // Immediately persist metadata to Firestore to enable secure viewing
      setIsSavingMetadata(true);
      try {
        const profileRef = doc(firestore, "profiles", userId);
        const metadataUpdate: any = {
          updatedAt: serverTimestamp(),
        };

        if (pathPrefix === "cv") {
          metadataUpdate.cvUrl = secureUrl;
          metadataUpdate.cvFileId = fileId;
          metadataUpdate.cvFileName = processedFile.name;
          metadataUpdate.cvGoogleDriveWebViewLink = result.webViewLink;
        } else if (pathPrefix === "ijazah") {
          metadataUpdate.ijazahUrl = secureUrl;
          metadataUpdate.ijazahFileId = fileId;
          metadataUpdate.ijazahFileName = processedFile.name;
          metadataUpdate.ijazahGoogleDriveWebViewLink = result.webViewLink;
        } else if (pathPrefix.startsWith("cert_") && fileId) {
          // Register cert fileId immediately so /api/storage/view can verify ownership
          // before the user clicks Simpan & Lanjut
          metadataUpdate.certFileIds = arrayUnion(fileId);
        }

        await setDocumentNonBlocking(profileRef, metadataUpdate, {
          merge: true,
        });

        toast({
          title: "Upload Berhasil",
          description: `${label} telah diunggah dan siap dilihat.`,
        });
      } catch (metadataError: any) {
        console.error("Autosave metadata failed:", metadataError);
        toast({
          variant: "destructive",
          title: "Metadata Belum Tersimpan",
          description:
            "File berhasil diunggah, tetapi metadata belum tersimpan. Silakan unggah ulang.",
        });
      } finally {
        setIsSavingMetadata(false);
      }
    } catch (error: any) {
      console.error("Skill document upload error:", error);
      handleStorageError(error);
      setIsUploading(false);
      setIsSavingMetadata(false);
    }
  };

  const getDisplayUrl = () => {
    if (typeof value === "string") return value;
    return value?.url || "";
  };

  const isImage = (() => {
    const url = getDisplayUrl();
    if (!url) return false;
    try {
      // If it's an absolute URL
      if (url.startsWith("http")) {
        return /\.(jpg|jpeg|png|webp|gif)$/i.test(new URL(url).pathname);
      }
      // If it's a relative URL or path
      return /\.(jpg|jpeg|png|webp|gif)$/i.test(url.split("?")[0]);
    } catch (e) {
      return false;
    }
  })();

  return (
    <FormItem>
      <FormLabel>
        {label} {required && <span className="text-destructive">*</span>}
      </FormLabel>
      {value ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/50">
            {isImage ? (
              <Image
                src={getDisplayUrl()}
                alt="Preview"
                width={40}
                height={40}
                className="rounded-md object-cover aspect-square"
              />
            ) : (
              <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
            )}
            <p
              className="text-sm font-medium truncate flex-1"
              title={fileName || ""}
            >
              {fileName || "File terunggah"}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isUploading || isSavingMetadata || !value}
                onClick={async () => {
                  const url = getDisplayUrl();
                  const fileId =
                    (typeof value !== "string" && value?.fileId) ||
                    extractFileIdFromUrl(url);
                  
                  if (!fileId) {
                    toast({
                      variant: "destructive",
                      title: "FileId Tidak Ditemukan",
                      description: "Silakan unggah ulang file untuk mengaktifkan akses aman.",
                    });
                    return;
                  }

                  try {
                    await openSecureFile(fileId, fileName || "dokumen");
                  } catch (err: any) {
                    toast({
                      variant: "destructive",
                      title: "Gagal Membuka File",
                      description: err.message,
                    });
                  }
                }}
                title={isSavingMetadata ? "Menyimpan metadata..." : "Lihat File"}
              >
                {isSavingMetadata ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onChange("")}
                disabled={isUploading || isSavingMetadata}
                title="Hapus File"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isSavingMetadata}
          >
            {isUploading || isSavingMetadata ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {isSavingMetadata ? "Menyimpan..." : "Ganti File"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              Unggah File
            </Button>
            <span className="text-sm text-muted-foreground">atau</span>
            <Input
              placeholder="Tempel link external (Google Drive, dll)"
              onChange={(e) => onChange(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          {isUploading && <Progress value={progress} className="h-1 mt-2" />}
        </div>
      )}
      <Input
        id={`${pathPrefix}-upload`}
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        disabled={isUploading}
      />
      <FormMessage />
    </FormItem>
  );
}

const MonthYearPicker = ({
  value,
  onChange,
  disabled,
  required,
}: {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) => {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");

  useEffect(() => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) {
      setYear("");
      setMonth("");
      return;
    }

    const [nextYear, nextMonth] = value.split("-");
    setYear(nextYear);
    setMonth(nextMonth);
  }, [value]);

  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    if (newYear && month) {
      onChange(`${newYear}-${month}`);
    }
  };

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    if (year && newMonth) {
      onChange(`${year}-${newMonth}`);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 60 }, (_, i) =>
    (currentYear + 5 - i).toString(),
  );
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString().padStart(2, "0"),
    label: new Date(2000, i).toLocaleString("id-ID", { month: "long" }),
  }));

  return (
    <div className="flex gap-2">
      <Select
        onValueChange={handleMonthChange}
        value={month}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Bulan" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={handleYearChange} value={year} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Tahun" />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

interface SkillsFormProps {
  initialData: {
    skills?: string[];
    certifications?: any[];
    cvUrl?:
      | string
      | {
          url: string;
          fileId?: string;
          fileName?: string;
          mimeType?: string;
          googleDriveWebViewLink?: string;
        };
    ijazahUrl?:
      | string
      | {
          url: string;
          fileId?: string;
          fileName?: string;
          mimeType?: string;
          googleDriveWebViewLink?: string;
        };
  };
  onSaveSuccess: () => void;
  onBack: () => void;
}

export function SkillsForm({
  initialData,
  onSaveSuccess,
  onBack,
}: SkillsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cvUrl: initialData?.cvUrl || "",
      ijazahUrl: initialData?.ijazahUrl || "",
      certifications: initialData?.certifications || [],
    },
  });

  const {
    fields: certFields,
    append: appendCert,
    remove: removeCert,
  } = useFieldArray({
    control: form.control,
    name: "certifications",
  });

  const handleSubmit = async (values: FormValues) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in.",
      });
      return;
    }
    setIsSaving(true);
    try {
      // Normalize cert imageUrl: FileUploadField returns an object but Firestore
      // needs a consistent structure so /api/storage/view can find the fileId.
      const normalizedCerts = (values.certifications || []).map((cert) => {
        const img = cert.imageUrl;
        if (img && typeof img === "object" && "url" in img) {
          return {
            ...cert,
            imageUrl: img.url || "",
            imageFileId: img.fileId || null,
            imageFileName: img.fileName || null,
            imageGoogleDriveWebViewLink: img.googleDriveWebViewLink || null,
          };
        }
        return cert;
      });

      const payload: any = {
        certifications: normalizedCerts,
        profileStatus: "draft",
        profileStep: 6,
        updatedAt: serverTimestamp() as Timestamp,
      };

      // Handle CV data
      if (typeof values.cvUrl === "string") {
        if (values.cvUrl.includes("drive.google.com")) {
          const extractedId = extractFileIdFromUrl(values.cvUrl);
          if (extractedId) {
            payload.cvFileId = extractedId;
            payload.cvUrl = `/api/storage/view?fileId=${extractedId}`;
          } else {
            payload.cvUrl = values.cvUrl;
          }
        } else {
          payload.cvUrl = values.cvUrl;
        }
      } else if (values.cvUrl) {
        payload.cvUrl = values.cvUrl.url;
        payload.cvFileId = values.cvUrl.fileId;
        payload.cvFileName = values.cvUrl.fileName;
        payload.cvGoogleDriveWebViewLink = values.cvUrl.googleDriveWebViewLink;
      }

      // Handle Ijazah data
      if (typeof values.ijazahUrl === "string") {
        if (values.ijazahUrl.includes("drive.google.com")) {
          const extractedId = extractFileIdFromUrl(values.ijazahUrl);
          if (extractedId) {
            payload.ijazahFileId = extractedId;
            payload.ijazahUrl = `/api/storage/view?fileId=${extractedId}`;
          } else {
            payload.ijazahUrl = values.ijazahUrl;
          }
        } else {
          payload.ijazahUrl = values.ijazahUrl;
        }
      } else if (values.ijazahUrl) {
        payload.ijazahUrl = values.ijazahUrl.url;
        payload.ijazahFileId = values.ijazahUrl.fileId;
        payload.ijazahFileName = values.ijazahUrl.fileName;
        payload.ijazahGoogleDriveWebViewLink =
          values.ijazahUrl.googleDriveWebViewLink;
      }

      const profileDocRef = doc(firestore, "profiles", firebaseUser.uid);
      await setDocumentNonBlocking(profileDocRef, payload, { merge: true });

      // Sync to Active Application (if any) to ensure HRD sees current documents
      try {
        // No orderBy to avoid composite index requirement; sort client-side
        const appsQuery = query(
          collection(firestore, "applications"),
          where("candidateUid", "==", firebaseUser.uid),
        );
        const appSnap = await getDocs(appsQuery);
        if (!appSnap.empty) {
          const sorted = appSnap.docs.sort((a, b) => {
            const aTs = a.data().createdAt?.toMillis?.() ?? 0;
            const bTs = b.data().createdAt?.toMillis?.() ?? 0;
            return bTs - aTs;
          });
          const appDoc = sorted[0];
          const appRef = doc(firestore, "applications", appDoc.id);
          
          // Sync only document fields that are present in payload
          const appSyncPayload: any = {
            updatedAt: serverTimestamp(),
          };
          
          if (payload.cvUrl) appSyncPayload.cvUrl = payload.cvUrl;
          if (payload.cvFileId) appSyncPayload.cvFileId = payload.cvFileId;
          if (payload.cvFileName) appSyncPayload.cvFileName = payload.cvFileName;
          if (payload.cvGoogleDriveWebViewLink) appSyncPayload.cvGoogleDriveWebViewLink = payload.cvGoogleDriveWebViewLink;
          
          if (payload.ijazahUrl) appSyncPayload.ijazahUrl = payload.ijazahUrl;
          if (payload.ijazahFileId) appSyncPayload.ijazahFileId = payload.ijazahFileId;
          if (payload.ijazahFileName) appSyncPayload.ijazahFileName = payload.ijazahFileName;
          if (payload.ijazahGoogleDriveWebViewLink) appSyncPayload.ijazahGoogleDriveWebViewLink = payload.ijazahGoogleDriveWebViewLink;
          
          await updateDoc(appRef, appSyncPayload);
        }
      } catch (syncError) {
        console.error("Failed to sync documents to application:", syncError);
      }

      toast({
        title: "Dokumen & Sertifikasi Disimpan",
        description: "Melanjutkan ke langkah terakhir.",
      });
      onSaveSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Unggah Dokumen Wajib</CardTitle>
            <CardDescription>
              Lampirkan dokumen pendukung lamaran Anda. Ukuran file maksimal 1MB
              per file atau lampirkan link external jika ukuran file lebih
              besar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
              <FormField
                control={form.control}
                name="cvUrl"
                render={({ field }) => (
                  <FileUploadField
                    label="Curriculum Vitae (CV)"
                    value={field.value}
                    onChange={field.onChange}
                    userId={firebaseUser?.uid || ""}
                    pathPrefix="cv"
                    required
                  />
                )}
              />
              <FormField
                control={form.control}
                name="ijazahUrl"
                render={({ field }) => (
                  <FileUploadField
                    label="Ijazah / SKL"
                    value={field.value}
                    onChange={field.onChange}
                    userId={firebaseUser?.uid || ""}
                    pathPrefix="ijazah"
                    required
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sertifikasi & Pelatihan (Opsional)</CardTitle>
            <CardDescription>
              Sebutkan sertifikasi profesional atau kursus yang relevan dan
              lampirkan bukti foto/sertifikat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                Untuk setiap sertifikat, Anda bisa mengunggah file bukti atau
                menempelkan link external. <strong>Penting:</strong> Jika
                menggunakan link, pastikan pengaturannya adalah "Siapa saja yang
                memiliki link dapat melihat".
              </AlertDescription>
            </Alert>
            <div className="space-y-6">
              {certFields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-4 p-5 border rounded-xl relative bg-muted/20"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:bg-destructive/10 h-8 w-8"
                    onClick={() => removeCert(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`certifications.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Nama Sertifikasi{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Contoh: Certified Cloud Practitioner"
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`certifications.${index}.organization`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Lembaga Penerbit{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Contoh: Amazon Web Services"
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`certifications.${index}.issueDate`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Tgl Terbit{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <MonthYearPicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`certifications.${index}.expirationDate`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tgl Kedaluwarsa</FormLabel>
                          <FormControl>
                            <MonthYearPicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name={`certifications.${index}.imageUrl`}
                    render={({ field }) => (
                      <FileUploadField
                        label="Bukti Sertifikat (File/Link)"
                        value={field.value}
                        onChange={field.onChange}
                        userId={firebaseUser?.uid || ""}
                        pathPrefix={`cert_${index}`}
                      />
                    )}
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={() =>
                appendCert({
                  id: crypto.randomUUID(),
                  name: "",
                  organization: "",
                  issueDate: "",
                })
              }
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Tambah Sertifikasi
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="secondary" onClick={onBack}>
            Kembali
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            size="lg"
            className="min-w-[150px]"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Simpan & Lanjut"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
