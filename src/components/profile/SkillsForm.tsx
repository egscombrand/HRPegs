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
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, setDocumentNonBlocking } from "@/firebase";
import { doc, serverTimestamp, Timestamp } from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from "firebase/storage";
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
  imageUrl: z.string().optional().or(z.literal("")),
});

const formSchema = z.object({
  cvUrl: z.string().min(1, "CV harus diunggah atau dilampirkan via link"),
  ijazahUrl: z
    .string()
    .min(1, "Ijazah harus diunggah atau dilampirkan via link"),
  certifications: z.array(certificationSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

interface FileUploadFieldProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
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
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
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
      setFileName(null);
    }
  }, [value]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > FILE_SIZE_LIMIT) {
      toast({
        variant: "destructive",
        title: "File Terlalu Besar",
        description: `Maksimal ukuran file adalah 5MB. Untuk file lebih besar, gunakan link external.`,
      });
      return;
    }

    setFileName(file.name);
    setIsUploading(true);
    const storage = getStorage();
    const storageRef = ref(
      storage,
      `user_docs/${userId}/${pathPrefix}_${Date.now()}_${file.name}`,
    );
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) =>
        setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error) => {
        toast({
          variant: "destructive",
          title: "Upload Gagal",
          description: error.message,
        });
        setIsUploading(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        onChange(downloadUrl);
        setIsUploading(false);
        toast({
          title: "Upload Berhasil",
          description: `${label} telah diunggah.`,
        });
      },
    );
  };

  const isImage =
    value && /\.(jpg|jpeg|png|webp|gif)$/i.test(new URL(value).pathname);

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
                src={value}
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
                asChild
              >
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Lihat File"
                >
                  <Eye className="h-4 w-4" />
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onChange("")}
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
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            Ganti File
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
    cvUrl?: string;
    ijazahUrl?: string;
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
      const payload = {
        cvUrl: values.cvUrl,
        ijazahUrl: values.ijazahUrl,
        certifications: values.certifications,
        profileStatus: "draft",
        profileStep: 6,
        updatedAt: serverTimestamp() as Timestamp,
      };
      const profileDocRef = doc(firestore, "profiles", firebaseUser.uid);
      await setDocumentNonBlocking(profileDocRef, payload, { merge: true });

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
              Lampirkan dokumen pendukung lamaran Anda. Ukuran file maksimal 5MB
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
