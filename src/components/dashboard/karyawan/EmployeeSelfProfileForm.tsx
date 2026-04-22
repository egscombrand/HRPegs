"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import {
  doc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Save,
  Undo,
  FileUp,
  Eye,
  Trash2,
  FileText,
  Check,
  ArrowRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import type { EmployeeProfile, Address } from "@/lib/types";
import { format } from "date-fns";
import { parseDateValue } from "@/lib/utils";

const selfFormSchema = z.object({
  dataDiriIdentitas: z
    .object({
      fullName: z.string().min(2, "Nama lengkap harus diisi."),
      nickName: z.string().min(1, "Nama panggilan harus diisi."),
      personalEmail: z
        .string()
        .optional()
        .refine((value) => !value || /^\S+@\S+\.\S+$/.test(value), {
          message: "Email pribadi tidak valid.",
        }),
      phone: z.string().min(10, "Nomor telepon tidak valid."),
      gender: z.enum(["Laki-laki", "Perempuan", "Lainnya"]),
      birthPlace: z.string().min(2, "Tempat lahir harus diisi."),
      birthDate: z
        .string()
        .refine((val) => val, { message: "Tanggal lahir harus diisi." }),
      maritalStatus: z
        .enum(["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"])
        .optional(),
      religion: z.string().optional(),
      nationality: z.string().optional(),
      countryOfOrigin: z.string().optional(),
      bloodType: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
      heightCm: z
        .string()
        .optional()
        .refine((value) => !value || /^[0-9]+$/.test(value), {
          message: "Tinggi badan hanya boleh berisi angka.",
        }),
      weightKg: z
        .string()
        .optional()
        .refine((value) => !value || /^[0-9]+(?:\.[0-9]+)?$/.test(value), {
          message: "Berat badan hanya boleh berisi angka.",
        }),
      hasPhysicalCondition: z.enum(["Ya", "Tidak"]).optional(),
      physicalConditionDetails: z.string().optional(),
      nik: z
        .string()
        .optional()
        .refine((val) => !val || /^[0-9]{16}$/.test(val), {
          message: "NIK harus tepat 16 digit angka.",
        }),
      profilePhotoUrl: z
        .string()
        .url("URL foto profil tidak valid.")
        .optional(),
      ktpPhotoUrl: z.string().url("URL foto KTP tidak valid.").optional(),
    })
    .superRefine((data, ctx) => {
      if (
        data.hasPhysicalCondition === "Ya" &&
        !data.physicalConditionDetails?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["physicalConditionDetails"],
          message: "Keterangan kelainan fisik harus diisi jika memilih Ya.",
        });
      }
    }),
  alamat: z.object({
    addressKtp: z
      .object({
        street: z.string().optional(),
        rt: z.string().optional(),
        rw: z.string().optional(),
        village: z.string().optional(),
        district: z.string().optional(),
        city: z.string().optional(),
        province: z.string().optional(),
        postalCode: z.string().optional(),
      })
      .optional(),
    isDomicileSameAsKtp: z.boolean().optional(),
    addressCurrent: z.string().min(10, "Alamat domisili harus diisi."),
  }),
  dokumenAdministratif: z.object({
    noNpwp: z.boolean().optional(),
    npwpFilePending: z.boolean().optional(),
    npwp: z.string().optional(),
    npwpPhotoUrl: z.string().url("URL dokumen NPWP tidak valid.").optional(),
    noBpjsKesehatan: z.boolean().optional(),
    bpjsKesehatanFilePending: z.boolean().optional(),
    bpjsKesehatan: z.string().optional(),
    bpjsKesehatanPhotoUrl: z
      .string()
      .url("URL foto BPJS Kesehatan tidak valid.")
      .optional(),
    noBpjsKetenagakerjaan: z.boolean().optional(),
    bpjsKetenagakerjaanFilePending: z.boolean().optional(),
    bpjsKetenagakerjaan: z.string().optional(),
    bpjsKetenagakerjaanPhotoUrl: z
      .string()
      .url("URL foto BPJS Ketenagakerjaan tidak valid.")
      .optional(),
    simNumber: z.string().optional(),
    simPhotoUrl: z.string().url("URL foto SIM tidak valid.").optional(),
  }),
  dataRekening: z.object({
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountHolderName: z.string().optional(),
    bankDocumentUrl: z
      .string()
      .url("URL bukti rekening tidak valid.")
      .optional(),
  }),
  kontakDarurat: z.object({
    emergencyContactName: z.string().min(2, "Nama kontak darurat harus diisi."),
    emergencyContactRelation: z
      .string()
      .min(2, "Hubungan kontak darurat harus diisi."),
    emergencyContactPhone: z
      .string()
      .min(10, "Nomor telepon darurat tidak valid."),
    emergencyContactAddress: z.string().optional(),
  }),
});

type FormValues = z.infer<typeof selfFormSchema>;

interface EmployeeSelfProfileFormProps {
  initialProfile: Partial<EmployeeProfile>;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

const INDONESIAN_BANKS = [
  "Bank Central Asia (BCA)",
  "Bank Mandiri",
  "Bank Rakyat Indonesia (BRI)",
  "Bank Negara Indonesia (BNI)",
  "Bank Tabungan Negara (BTN)",
  "CIMB Niaga",
  "Bank Syariah Indonesia (BSI)",
  "Bank Danamon",
  "PermataBank",
  "OCBC NISP",
  "Panin Bank",
  "Bank BTPN",
  "Maybank Indonesia",
  "Bank Sinarmas",
  "Bank Muamalat",
];

type FileUploadFieldProps = {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  userId: string;
  fieldKey: string;
  required?: boolean;
  helperText?: string;
};

function FileUploadField({
  label,
  value,
  onChange,
  userId,
  fieldKey,
  required = false,
  helperText,
}: FileUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value && !previewUrl) {
      setFileName(null);
      return;
    }

    if (previewUrl && value && value !== previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (value) {
      try {
        const url = new URL(value);
        const name =
          url.pathname.split("/").pop()?.split("?")[0] || "File terunggah";
        setFileName(decodeURIComponent(name));
      } catch {
        setFileName("File terunggah");
      }
    }
  }, [value, previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Terlalu Besar",
        description:
          "Ukuran file maksimal 10MB. Pilih file lain atau kompres terlebih dahulu.",
      });
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setFileName(file.name);
    setIsUploading(true);
    const storage = getStorage();
    const storageRef = ref(
      storage,
      `employee_profiles/${userId}/${fieldKey}_${Date.now()}_${file.name}`,
    );
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        setProgress(
          Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
        );
      },
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

  const isImage = previewUrl
    ? true
    : value
      ? /\.(jpg|jpeg|png|webp|gif)$/i.test(value)
      : false;

  const displayUrl = previewUrl || value;
  const hasUploadPreview = Boolean(displayUrl);

  return (
    <FormItem>
      <FormLabel>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </FormLabel>
      {hasUploadPreview ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/80 p-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-slate-300">
              {isImage && displayUrl ? (
                <img
                  src={displayUrl}
                  alt={fileName || label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-100 truncate">
                {fileName}
              </p>
              <p className="text-sm text-slate-400">
                Klik ganti jika ingin memperbarui file.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              Ganti
            </Button>
          </div>
          {isUploading ? (
            <Progress value={progress} className="h-2 rounded-full" />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-300">
            <p className="font-medium text-slate-100">Unggah {label}</p>
            <p className="mt-1 text-slate-400">
              Pilih file langsung dari perangkat Anda. File akan disimpan secara
              aman.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            Upload File
          </Button>
          {helperText ? (
            <p className="text-xs text-slate-500">{helperText}</p>
          ) : null}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </FormItem>
  );
}

const STEP_CONFIG = [
  {
    title: "Data Diri & Identitas",
    description: "Lengkapi data pribadi dan identitas Anda secara singkat.",
    fields: ["dataDiriIdentitas"],
  },
  {
    title: "Alamat",
    description: "Isi data alamat KTP dan domisili Anda.",
    fields: ["alamat"],
  },
  {
    title: "Dokumen Administratif",
    description: "Unggah bukti administratif yang diperlukan.",
    fields: ["dokumenAdministratif"],
  },
  {
    title: "Data Rekening & Finansial",
    description: "Isi data bank untuk administrasi pembayaran.",
    fields: ["dataRekening"],
  },
  {
    title: "Kontak Darurat",
    description: "Berikan kontak darurat yang bisa dihubungi.",
    fields: ["kontakDarurat"],
  },
];

function buildAddressString(address: Address | undefined) {
  if (!address) return "";
  return [
    address.street,
    address.rt && `RT ${address.rt}`,
    address.rw && `RW ${address.rw}`,
    address.village,
    address.district,
    address.city,
    address.province,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function EmployeeSelfProfileForm({
  initialProfile,
  onSaveSuccess,
  onCancel,
}: EmployeeSelfProfileFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { firebaseUser, refreshUserProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(selfFormSchema),
    defaultValues: {
      dataDiriIdentitas: {
        fullName: "",
        nickName: "",
        personalEmail: "",
        phone: "",
        gender: "Laki-laki",
        birthPlace: "",
        birthDate: "",
        maritalStatus: "Belum Kawin",
        religion: "",
        nationality: "WNI",
        countryOfOrigin: "",
        bloodType: null,
        heightCm: "",
        weightKg: "",
        hasPhysicalCondition: "Tidak",
        physicalConditionDetails: "",
        nik: "",
        profilePhotoUrl: "",
        ktpPhotoUrl: "",
      },
      alamat: {
        addressKtp: {
          street: "",
          rt: "",
          rw: "",
          village: "",
          district: "",
          city: "",
          province: "",
          postalCode: "",
        },
        isDomicileSameAsKtp: false,
        addressCurrent: "",
      },
      dokumenAdministratif: {
        noNpwp: false,
        npwpFilePending: false,
        npwp: "",
        npwpPhotoUrl: "",
        noBpjsKesehatan: false,
        bpjsKesehatanFilePending: false,
        bpjsKesehatan: "",
        bpjsKesehatanPhotoUrl: "",
        noBpjsKetenagakerjaan: false,
        bpjsKetenagakerjaanFilePending: false,
        bpjsKetenagakerjaan: "",
        bpjsKetenagakerjaanPhotoUrl: "",
        simNumber: "",
        simPhotoUrl: "",
      },
      dataRekening: {
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolderName: "",
        bankDocumentUrl: "",
      },
      kontakDarurat: {
        emergencyContactName: "",
        emergencyContactRelation: "",
        emergencyContactPhone: "",
        emergencyContactAddress: "",
      },
    },
  });

  useEffect(() => {
    const birthDate = initialProfile.birthDate
      ? parseDateValue(initialProfile.birthDate)
      : null;
    const formattedBirthDate = birthDate ? format(birthDate, "yyyy-MM-dd") : "";

    const dd = (initialProfile as any)?.dataDiriIdentitas || {};
    const al = (initialProfile as any)?.alamat || {};
    const docAdmin = (initialProfile as any)?.dokumenAdministratif || {};
    const rek = (initialProfile as any)?.dataRekening || {};
    const kd = (initialProfile as any)?.kontakDarurat || {};

    console.log("DEBUG: Initial profile data:", initialProfile);
    console.log("DEBUG: Extracted dataDiriIdentitas:", dd);

    form.reset({
      dataDiriIdentitas: {
        fullName: dd.fullName || initialProfile.fullName || "",
        nickName: dd.nickName || initialProfile.nickName || "",
        personalEmail: dd.personalEmail || initialProfile.personalEmail || "",
        phone: dd.phone || initialProfile.phone || "",
        gender: dd.gender || initialProfile.gender || "Laki-laki",
        birthPlace: dd.birthPlace || initialProfile.birthPlace || "",
        birthDate: dd.birthDate || formattedBirthDate,
        maritalStatus:
          dd.maritalStatus || initialProfile.maritalStatus || "Belum Kawin",
        religion: dd.religion || initialProfile.religion || "",
        nationality: dd.nationality || initialProfile.nationality || "",
        countryOfOrigin:
          dd.countryOfOrigin ||
          initialProfile.additionalFields?.countryOfOrigin ||
          initialProfile.countryOfOrigin ||
          "",
        bloodType:
          dd.bloodType ||
          initialProfile.additionalFields?.bloodType ||
          initialProfile.bloodType ||
          null,
        heightCm:
          dd.heightCm ||
          initialProfile.additionalFields?.heightCm ||
          initialProfile.heightCm ||
          "",
        weightKg:
          dd.weightKg ||
          initialProfile.additionalFields?.weightKg ||
          initialProfile.weightKg ||
          "",
        hasPhysicalCondition:
          dd.hasPhysicalCondition ||
          initialProfile.additionalFields?.hasPhysicalCondition ||
          initialProfile.hasPhysicalCondition ||
          "Tidak",
        physicalConditionDetails:
          dd.physicalConditionDetails ||
          initialProfile.additionalFields?.physicalConditionDetails ||
          initialProfile.physicalConditionDetails ||
          "",
        nik: dd.nik || initialProfile.nik || "",
        profilePhotoUrl:
          dd.profilePhotoUrl || initialProfile.profilePhotoUrl || "",
        ktpPhotoUrl: dd.ktpPhotoUrl || initialProfile.ktpPhotoUrl || "",
      },
      alamat: {
        addressKtp: {
          street:
            al.addressKtp?.street || initialProfile.addressKtp?.street || "",
          rt: al.addressKtp?.rt || initialProfile.addressKtp?.rt || "",
          rw: al.addressKtp?.rw || initialProfile.addressKtp?.rw || "",
          village:
            al.addressKtp?.village || initialProfile.addressKtp?.village || "",
          district:
            al.addressKtp?.district ||
            initialProfile.addressKtp?.district ||
            "",
          city: al.addressKtp?.city || initialProfile.addressKtp?.city || "",
          province:
            al.addressKtp?.province ||
            initialProfile.addressKtp?.province ||
            "",
          postalCode:
            al.addressKtp?.postalCode ||
            initialProfile.addressKtp?.postalCode ||
            "",
        },
        isDomicileSameAsKtp:
          al.isDomicileSameAsKtp ?? initialProfile.isDomicileSameAsKtp ?? false,
        addressCurrent:
          al.addressCurrent || initialProfile.addressCurrent || "",
      },
      dokumenAdministratif: {
        noNpwp: docAdmin.noNpwp ?? initialProfile.noNpwp ?? false,
        npwpFilePending:
          docAdmin.npwpFilePending ?? initialProfile.npwpFilePending ?? false,
        npwp: docAdmin.npwp || initialProfile.npwp || "",
        npwpPhotoUrl:
          docAdmin.npwpPhotoUrl || initialProfile.npwpPhotoUrl || "",
        noBpjsKesehatan:
          docAdmin.noBpjsKesehatan ?? initialProfile.noBpjsKesehatan ?? false,
        bpjsKesehatanFilePending:
          docAdmin.bpjsKesehatanFilePending ??
          initialProfile.bpjsKesehatanFilePending ??
          false,
        bpjsKesehatan:
          docAdmin.bpjsKesehatan || initialProfile.bpjsKesehatan || "",
        bpjsKesehatanPhotoUrl:
          docAdmin.bpjsKesehatanPhotoUrl ||
          initialProfile.bpjsKesehatanPhotoUrl ||
          "",
        noBpjsKetenagakerjaan:
          docAdmin.noBpjsKetenagakerjaan ??
          initialProfile.noBpjsKetenagakerjaan ??
          false,
        bpjsKetenagakerjaanFilePending:
          docAdmin.bpjsKetenagakerjaanFilePending ??
          initialProfile.bpjsKetenagakerjaanFilePending ??
          false,
        bpjsKetenagakerjaan:
          docAdmin.bpjsKetenagakerjaan ||
          initialProfile.bpjsKetenagakerjaan ||
          "",
        bpjsKetenagakerjaanPhotoUrl:
          docAdmin.bpjsKetenagakerjaanPhotoUrl ||
          initialProfile.bpjsKetenagakerjaanPhotoUrl ||
          "",
        simNumber: docAdmin.simNumber || initialProfile.simNumber || "",
        simPhotoUrl: docAdmin.simPhotoUrl || initialProfile.simPhotoUrl || "",
      },
      dataRekening: {
        bankName: rek.bankName || initialProfile.bankName || "",
        bankAccountNumber:
          rek.bankAccountNumber || initialProfile.bankAccountNumber || "",
        bankAccountHolderName:
          rek.bankAccountHolderName ||
          initialProfile.bankAccountHolderName ||
          "",
        bankDocumentUrl:
          rek.bankDocumentUrl || initialProfile.bankDocumentUrl || "",
      },
      kontakDarurat: {
        emergencyContactName:
          kd.emergencyContactName || initialProfile.emergencyContactName || "",
        emergencyContactRelation:
          kd.emergencyContactRelation ||
          initialProfile.emergencyContactRelation ||
          "",
        emergencyContactPhone:
          kd.emergencyContactPhone ||
          initialProfile.emergencyContactPhone ||
          "",
        emergencyContactAddress:
          kd.emergencyContactAddress ||
          initialProfile.emergencyContactAddress ||
          "",
      },
    });
    console.log("DEBUG: Form reset values:", form.getValues());
  }, [initialProfile, form]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const watchedAddressKtp = form.watch("alamat.addressKtp");
  const watchedDomicileSame = form.watch("alamat.isDomicileSameAsKtp");
  const watchedHasPhysicalCondition = form.watch(
    "dataDiriIdentitas.hasPhysicalCondition",
  );
  const watchedNationality = form.watch("dataDiriIdentitas.nationality");

  const watchedNoNpwp = form.watch("dokumenAdministratif.noNpwp");
  const watchedNpwpFilePending = form.watch(
    "dokumenAdministratif.npwpFilePending",
  );
  const watchedNoBpjsKs = form.watch("dokumenAdministratif.noBpjsKesehatan");
  const watchedBpjsKsFilePending = form.watch(
    "dokumenAdministratif.bpjsKesehatanFilePending",
  );
  const watchedNoBpjsTk = form.watch(
    "dokumenAdministratif.noBpjsKetenagakerjaan",
  );
  const watchedBpjsTkFilePending = form.watch(
    "dokumenAdministratif.bpjsKetenagakerjaanFilePending",
  );

  useEffect(() => {
    if (!watchedDomicileSame) return;
    const addressValue = buildAddressString(watchedAddressKtp);
    if (addressValue) {
      form.setValue("alamat.addressCurrent", addressValue);
    }
  }, [watchedDomicileSame, watchedAddressKtp, form]);

  const saveEmployeeProfile = async (values: FormValues, isDraft: boolean) => {
    if (!firebaseUser) {
      throw new Error("Authentication not found.");
    }

    console.log("DEBUG: Form values before save:", values);

    const batch = writeBatch(firestore);
    const employeeProfileRef = doc(
      firestore,
      "employee_profiles",
      firebaseUser.uid,
    );
    const userRef = doc(firestore, "users", firebaseUser.uid);

    // Payload HARUS hanya nested objects sesuai Firestore Rules
    // JANGAN tambahkan field flat seperti ...values.dataDiriIdentitas
    const employeePayload = {
      uid: firebaseUser.uid,
      dataDiriIdentitas: values.dataDiriIdentitas,
      alamat: values.alamat,
      dokumenAdministratif: values.dokumenAdministratif,
      dataRekening: values.dataRekening,
      kontakDarurat: values.kontakDarurat,
      updatedAt: serverTimestamp(),
      completeness: isDraft
        ? { isComplete: false }
        : { isComplete: true, completedAt: serverTimestamp() },
    };

    console.log("employeePayload", employeePayload);

    batch.set(employeeProfileRef, employeePayload, { merge: true });
    batch.update(userRef, {
      fullName: values.dataDiriIdentitas.fullName,
      ...(isDraft ? {} : { isProfileComplete: true }),
    });
    await batch.commit();
  };

  const handleSaveDraft = async () => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Authentication not found.",
      });
      return;
    }

    setIsSavingDraft(true);
    const values = form.getValues();
    try {
      await saveEmployeeProfile(values, true);
      toast({
        title: "Draft Tersimpan",
        description: "Data Anda telah disimpan sebagai draft.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Draft",
        description: error.message,
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Authentication not found.",
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveEmployeeProfile(values, false);
      toast({
        title: "Profil Diperbarui",
        description: "Data diri Anda telah berhasil disimpan.",
      });
      refreshUserProfile();
      onSaveSuccess();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Profil",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const onInvalid: (errors: FieldErrors<FormValues>) => void = (errors) => {
    console.error("Form validation errors:", errors);
    const firstErrorKey = Object.keys(errors)[0] as
      | keyof FormValues
      | undefined;
    if (firstErrorKey) {
      // Find the specific field that error happened in
      let actualErrorKey: string = firstErrorKey;
      const stepErrors = (errors as any)[firstErrorKey];
      if (stepErrors && typeof stepErrors === "object") {
        const firstNestedKey = Object.keys(stepErrors)[0];
        actualErrorKey = firstNestedKey;
      }

      const readableFieldName = actualErrorKey
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase());
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: `Harap periksa kembali isian Anda. Kolom "${readableFieldName}" sepertinya belum valid.`,
      });
      (form.setFocus as any)(firstErrorKey);
    }
  };

  const stepCount = STEP_CONFIG.length;
  const currentStepConfig = STEP_CONFIG[currentStep];

  const handleNext = async () => {
    const isValid = await form.trigger(
      currentStepConfig.fields as unknown as Array<keyof FormValues>,
    );
    if (isValid) {
      setIsNavigating(true);
      try {
        // Auto-save draft when moving to next step to prevent data loss on refresh
        const values = form.getValues();
        await saveEmployeeProfile(values, true);
        setCurrentStep((prev) => Math.min(prev + 1, stepCount - 1));
      } catch (error: any) {
        console.error("Auto-save failed:", error);
        // Still allow transition so user isn't stuck, but they are warned
        setCurrentStep((prev) => Math.min(prev + 1, stepCount - 1));
        toast({
          variant: "destructive",
          title: "Gagal Menyimpan Progres",
          description:
            "Data Anda belum tersimpan secara otomatis. Silakan coba klik 'Simpan Draft' secara manual.",
        });
      } finally {
        setIsNavigating(false);
      }
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div key="step-identitas" className="space-y-12">
            {/* 1. Informasi Pribadi */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Informasi Pribadi
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Data dasar untuk identifikasi dan administrasi kepegawaian.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Lengkap*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Contoh: John Doe"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.nickName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Panggilan*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="John"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.birthPlace"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tempat Lahir*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Jakarta"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.birthDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tanggal Lahir*</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jenis Kelamin*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jenis kelamin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Laki-laki">Laki-laki</SelectItem>
                          <SelectItem value="Perempuan">Perempuan</SelectItem>
                          <SelectItem value="Lainnya">Lainnya</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.maritalStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status Pernikahan</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Belum Kawin">
                            Belum Kawin
                          </SelectItem>
                          <SelectItem value="Kawin">Kawin</SelectItem>
                          <SelectItem value="Cerai Hidup">
                            Cerai Hidup
                          </SelectItem>
                          <SelectItem value="Cerai Mati">Cerai Mati</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.religion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agama</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih agama" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Islam">Islam</SelectItem>
                          <SelectItem value="Kristen">Kristen</SelectItem>
                          <SelectItem value="Katolik">Katolik</SelectItem>
                          <SelectItem value="Hindu">Hindu</SelectItem>
                          <SelectItem value="Buddha">Buddha</SelectItem>
                          <SelectItem value="Konghucu">Konghucu</SelectItem>
                          <SelectItem value="Lainnya">Lainnya</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kewarganegaraan</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih kewarganegaraan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="WNI">WNI</SelectItem>
                          <SelectItem value="WNA">WNA</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {watchedNationality === "WNA" && (
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.countryOfOrigin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Negara Asal</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Masukkan negara asal"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </section>

            <Separator className="bg-slate-800/50" />

            {/* 2. Kontak Pribadi */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Kontak Pribadi
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Informasi untuk keperluan komunikasi internal dan darurat.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Telepon*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="0812xxxx (WhatsApp)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.personalEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Pribadi</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="example@email.com"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator className="bg-slate-800/50" />

            {/* 3. Informasi Fisik */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Informasi Fisik
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Data fisik untuk kelengkapan rekam medis dan asuransi.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.bloodType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Golongan Darah</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih golongan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="AB">AB</SelectItem>
                          <SelectItem value="O">O</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.heightCm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tinggi Badan (cm)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Contoh: 170"
                          inputMode="numeric"
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            field.onChange(val);
                          }}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Hanya angka (cm).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.weightKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Berat Badan (kg)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Contoh: 65"
                          inputMode="decimal"
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, "");
                            field.onChange(val);
                          }}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Hanya angka (kg).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataDiriIdentitas.hasPhysicalCondition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ada Kelainan Fisik?</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jawaban" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Tidak">Tidak</SelectItem>
                          <SelectItem value="Ya">Ya</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {watchedHasPhysicalCondition === "Ya" && (
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.physicalConditionDetails"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2 xl:col-span-4">
                        <FormLabel>Keterangan Kelainan Fisik</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={3}
                            placeholder="Jelaskan kondisi fisik yang perlu diketahui"
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </section>

            <Separator className="bg-slate-800/50" />

            {/* 4. Identitas Resmi */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Identitas Resmi
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Dokumen identitas legal dan foto resmi terbaru.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1 space-y-8">
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.nik"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nomor KTP (NIK)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="16 digit NIK"
                            maxLength={16}
                            inputMode="numeric"
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, "");
                              field.onChange(val);
                            }}
                          />
                        </FormControl>
                        <FormDescription className="text-[10px]">
                          Pastikan tepat 16 digit angka.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.profilePhotoUrl"
                    render={({ field }) => (
                      <FileUploadField
                        label="Foto Diri"
                        value={field.value}
                        onChange={field.onChange}
                        userId={firebaseUser?.uid ?? ""}
                        fieldKey="profile_photo"
                        helperText="Unggah foto formal dengan latar belakang polos."
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.ktpPhotoUrl"
                    render={({ field }) => (
                      <FileUploadField
                        label="Foto KTP"
                        value={field.value}
                        onChange={field.onChange}
                        userId={firebaseUser?.uid ?? ""}
                        fieldKey="ktp_photo"
                        helperText="Unggah foto KTP asli yang terlihat jelas."
                      />
                    )}
                  />
                </div>
              </div>
            </section>
          </div>
        );
      case 1:
        return (
          <div key="step-alamat" className="space-y-12">
            {/* Alamat KTP */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Alamat Sesuai KTP
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Pastikan alamat yang diisi sesuai dengan dokumen identitas
                  resmi Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.street"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Jalan / Nama Jalan</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Jl. Raya Utama No. 123"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.rt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RT</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="001"
                          maxLength={3}
                          inputMode="numeric"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.rw"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RW</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="002"
                          maxLength={3}
                          inputMode="numeric"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.village"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desa / Kelurahan</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Mekar Jaya"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kecamatan</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Serpong"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kabupaten / Kota</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Tangerang Selatan"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provinsi</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Banten"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.addressKtp.postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kode Pos</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="15310"
                          maxLength={5}
                          inputMode="numeric"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 mt-4">
                <FormField
                  control={form.control}
                  name="alamat.isDomicileSameAsKtp"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          className="h-5 w-5 rounded-md border-slate-700 data-[state=checked]:bg-primary"
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="text-sm font-semibold cursor-pointer">
                          Alamat domisili sama dengan KTP
                        </FormLabel>
                        <p className="text-[10px] text-slate-400">
                          Centang ini jika Anda tinggal di alamat yang sama
                          dengan yang tertera di KTP.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </section>

            {!watchedDomicileSame && (
              <>
                <Separator className="bg-slate-800/50" />
                <section className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-1.5 rounded-full bg-primary" />
                      <h4 className="text-lg font-bold text-slate-100">
                        Alamat Domisili
                      </h4>
                    </div>
                    <p className="text-sm text-slate-400">
                      Alamat tempat tinggal Anda saat ini (jika berbeda dengan
                      KTP).
                    </p>
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="alamat.addressCurrent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alamat Lengkap Domisili*</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={4}
                              placeholder="Contoh: Jl. Sudirman No. 1, Apartemen X Tower Y Unit Z, Jakarta Pusat"
                              value={field.value ?? ""}
                              className="rounded-2xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>
              </>
            )}
          </div>
        );
      case 2:
        return (
          <div key="step-dokumen" className="space-y-12">
            {/* NPWP */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Dokumen Perpajakan (NPWP)
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Data ini digunakan untuk pelaporan pajak penghasilan sesuai
                  peraturan yang berlaku.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1 space-y-6">
                  <FormField
                    control={form.control}
                    name="dokumenAdministratif.noNpwp"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium cursor-pointer">
                            Saya belum memiliki NPWP
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {!watchedNoNpwp && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.npwp"
                      render={({ field }) => (
                        <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                          <FormLabel>Nomor NPWP</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="15 digit angka NPWP"
                              inputMode="numeric"
                              onChange={(e) => {
                                const val = e.target.value.replace(
                                  /[^0-9]/g,
                                  "",
                                );
                                field.onChange(val);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="lg:col-span-2 space-y-6">
                  {!watchedNoNpwp && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.npwpFilePending"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-medium cursor-pointer text-slate-300">
                              Saya akan melengkapi file dokumen nanti
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}

                  {!watchedNoNpwp && !watchedNpwpFilePending && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.npwpPhotoUrl"
                      render={({ field }) => (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                          <FileUploadField
                            label="Foto / Scan Kartu NPWP"
                            value={field.value}
                            onChange={field.onChange}
                            userId={firebaseUser?.uid ?? ""}
                            fieldKey="npwp_photo"
                            helperText="Unggah bukti fisik NPWP dalam format JPG/PNG atau PDF."
                          />
                        </div>
                      )}
                    />
                  )}
                </div>
              </div>
            </section>

            <Separator className="bg-slate-800/50" />

            {/* BPJS */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Asuransi & Jaminan Sosial (BPJS)
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Data BPJS diperlukan untuk pendaftaran jaminan kesehatan dan
                  ketenagakerjaan perusahaan.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* BPJS Kesehatan */}
                <div className="space-y-6">
                  <h5 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    BPJS Kesehatan
                  </h5>

                  <FormField
                    control={form.control}
                    name="dokumenAdministratif.noBpjsKesehatan"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium cursor-pointer">
                            Saya belum memiliki BPJS Kesehatan
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {!watchedNoBpjsKs && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKesehatan"
                      render={({ field }) => (
                        <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                          <FormLabel>No. BPJS Kesehatan</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="Nomor kartu BPJS Kesehatan"
                              inputMode="numeric"
                              onChange={(e) => {
                                const val = e.target.value.replace(
                                  /[^0-9]/g,
                                  "",
                                );
                                field.onChange(val);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {!watchedNoBpjsKs && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKesehatanFilePending"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-medium cursor-pointer text-slate-300">
                              Saya akan melengkapi file kartu nanti
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}

                  {!watchedNoBpjsKs && !watchedBpjsKsFilePending && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKesehatanPhotoUrl"
                      render={({ field }) => (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                          <FileUploadField
                            label="Upload Kartu BPJS Kesehatan"
                            value={field.value}
                            onChange={field.onChange}
                            userId={firebaseUser?.uid ?? ""}
                            fieldKey="bpjs_ks_photo"
                            helperText="Kartu digital atau foto kartu fisik."
                          />
                        </div>
                      )}
                    />
                  )}
                </div>

                {/* BPJS Ketenagakerjaan */}
                <div className="space-y-6">
                  <h5 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    BPJS Ketenagakerjaan
                  </h5>

                  <FormField
                    control={form.control}
                    name="dokumenAdministratif.noBpjsKetenagakerjaan"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium cursor-pointer">
                            Saya belum memiliki BPJS Ketenagakerjaan
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {!watchedNoBpjsTk && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKetenagakerjaan"
                      render={({ field }) => (
                        <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                          <FormLabel>No. BPJS Ketenagakerjaan</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="Nomor kartu BPJS Ketenagakerjaan"
                              inputMode="numeric"
                              onChange={(e) => {
                                const val = e.target.value.replace(
                                  /[^0-9]/g,
                                  "",
                                );
                                field.onChange(val);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {!watchedNoBpjsTk && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKetenagakerjaanFilePending"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-medium cursor-pointer text-slate-300">
                              Saya akan melengkapi file kartu nanti
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}

                  {!watchedNoBpjsTk && !watchedBpjsTkFilePending && (
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl"
                      render={({ field }) => (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                          <FileUploadField
                            label="Upload Kartu BPJS Ketenagakerjaan"
                            value={field.value}
                            onChange={field.onChange}
                            userId={firebaseUser?.uid ?? ""}
                            fieldKey="bpjs_tk_photo"
                            helperText="Kartu digital atau foto kartu fisik."
                          />
                        </div>
                      )}
                    />
                  )}
                </div>
              </div>
            </section>
          </div>
        );
      case 3:
        return (
          <div key="step-rekening" className="space-y-12">
            {/* Rekening Bank */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Data Rekening Bank
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Informasi rekening untuk keperluan pembayaran gaji (payroll).
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <FormField
                  control={form.control}
                  name="dataRekening.bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Bank</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Contoh: Bank BCA"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataRekening.bankAccountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Rekening</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Contoh: 1234567890"
                          inputMode="numeric"
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
                <FormField
                  control={form.control}
                  name="dataRekening.bankAccountHolderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Pemilik Rekening</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Harus sesuai dengan nama di buku tabungan"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-8">
                <FormField
                  control={form.control}
                  name="dataRekening.bankDocumentUrl"
                  render={({ field }) => (
                    <FileUploadField
                      label="Upload Bukti Rekening / Buku Tabungan"
                      value={field.value}
                      onChange={field.onChange}
                      userId={firebaseUser?.uid ?? ""}
                      fieldKey="bank_doc"
                      helperText="Unggah halaman depan buku tabungan atau screenshot detail rekening M-Banking."
                    />
                  )}
                />
              </div>
            </section>
          </div>
        );
      case 4:
        return (
          <div key="step-darurat" className="space-y-12">
            {/* Kontak Darurat */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-primary" />
                  <h4 className="text-lg font-bold text-slate-100">
                    Kontak Darurat
                  </h4>
                </div>
                <p className="text-sm text-slate-400">
                  Hubungan dan kontak yang dapat dihubungi dalam keadaan
                  darurat.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="kontakDarurat.emergencyContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Lengkap Kontak Darurat*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Nama orang terdekat"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="kontakDarurat.emergencyContactRelation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hubungan*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Contoh: Orang Tua, Istri, Suami, atau Saudara"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="kontakDarurat.emergencyContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Telepon Darurat*</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Nomor aktif orang terdekat"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="kontakDarurat.emergencyContactAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alamat Kontak Darurat</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="Masukkan alamat lengkap kontak darurat"
                          value={field.value ?? ""}
                          className="rounded-2xl"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-none">
      <CardHeader className="space-y-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Lengkapi data diri Anda</CardTitle>
            <CardDescription>
              Isi setiap bagian secara bertahap agar tidak terasa berat.
            </CardDescription>
          </div>
          <div className="text-sm text-slate-400">
            Langkah {currentStep + 1} dari {stepCount}
          </div>
        </div>
        <div className="space-y-3">
          <Progress
            value={((currentStep + 1) / stepCount) * 100}
            className="h-2 rounded-full"
          />
          <div className="grid gap-2 sm:grid-cols-5">
            {STEP_CONFIG.map((item, index) => {
              const isCompleted = index < currentStep;
              const isActive = index === currentStep;
              return (
                <div
                  key={item.title}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-[0.72rem] ${
                    isActive
                      ? "bg-slate-950 text-slate-100"
                      : isCompleted
                        ? "bg-slate-900/90 text-slate-300"
                        : "bg-slate-950/70 text-slate-500"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.72rem] font-semibold ${
                      isActive
                        ? "bg-primary text-white"
                        : isCompleted
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <p className="min-w-0 truncate font-medium">{item.title}</p>
                </div>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-10 px-10 py-10">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            {currentStepConfig.title}
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-400">
            {currentStepConfig.description}
          </p>
        </div>
        <Form {...form}>
          <form
            id="employee-self-form"
            onSubmit={form.handleSubmit(handleSubmit, onInvalid)}
            className="space-y-10"
          >
            {renderStepContent()}
            <div className="space-y-5 border-t border-slate-800/60 pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleBack}
                    disabled={currentStep === 0 || isNavigating}
                  >
                    Kembali
                  </Button>
                  {currentStep < stepCount - 1 ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={isNavigating}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 rounded-xl font-semibold shadow-lg shadow-primary/20 min-w-[140px]"
                    >
                      {isNavigating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Lanjutkan
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveDraft}
                    disabled={isSavingDraft || isSaving}
                  >
                    {isSavingDraft ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Simpan Draft
                  </Button>
                </div>
                {currentStep === stepCount - 1 ? (
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Simpan Perubahan
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-slate-500">
                {currentStep === stepCount - 1
                  ? "Semua langkah selesai. Tekan Simpan Perubahan untuk menyimpan data Anda."
                  : "Isi langkah ini, lalu lanjutkan ke bagian berikutnya dengan nyaman."}
              </p>
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 border-t border-slate-800/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" type="button" onClick={onCancel}>
          <Undo className="mr-2 h-4 w-4" /> Keluar
        </Button>
        <p className="text-sm text-slate-500">
          {currentStep === stepCount - 1
            ? "Semua langkah selesai. Tekan Simpan Perubahan untuk menyimpan data Anda."
            : "Form disusun per langkah supaya Anda bisa mengisi dengan lebih santai dan fokus."}
        </p>
      </CardFooter>
    </Card>
  );
}
