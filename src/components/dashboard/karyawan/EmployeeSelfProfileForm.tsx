"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import {
  doc,
  serverTimestamp,
  writeBatch,
  Timestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import {
  validateStorageFile,
  compressImage,
  handleStorageError,
} from "@/lib/storage-utils";
import { normalizeGoogleDriveImageUrl } from "@/lib/profile-photo";
import { uploadFile } from "@/lib/storage/storage-adapter";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  Plus,
  Users,
  Baby,
  Heart,
  UserMinus,
  Calendar,
  Briefcase,
  GraduationCap,
  MapPin,
  Phone,
  User,
  CreditCard,
  ShieldCheck,
  Wallet,
  Car,
  Award,
  Info,
  Camera,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import type { EmployeeProfile } from "@/lib/types";
import { RegionSelector } from "./RegionSelector";
import { format } from "date-fns";
import { parseDateValue } from "@/lib/utils";
import { AlertTriangle, Clock, XCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { VerificationStatusGroup } from "@/lib/types";
import { BankChangeRequestModal } from "./BankChangeRequestModal";
import {
  EmployeeDataChangeRequestModal,
  type ChangeRequestCategory,
} from "./EmployeeDataChangeRequestModal";

function VerificationAlert({
  status,
  note,
  title,
  isPayroll = false,
}: {
  status?: VerificationStatusGroup;
  note?: string;
  title: string;
  isPayroll?: boolean;
}) {
  if (!status || status === "approved") return null;

  const isPending = status === "pending";
  const isRevision = status === "revision";
  const isRejected = status === "rejected";

  return (
    <Alert
      className={`mb-6 border-l-4 ${
        isPending
          ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400"
          : isRevision
            ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400"
            : "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400"
      }`}
    >
      {isPending && <Clock className="h-5 w-5" />}
      {isRevision && <AlertCircle className="h-5 w-5" />}
      {isRejected && <XCircle className="h-5 w-5" />}
      <div className="ml-3">
        <AlertTitle className="font-bold flex items-center gap-2">
          Status Verifikasi {title}:{" "}
          {isPending
            ? "Menunggu Verifikasi HRD"
            : isRevision
              ? "Perlu Revisi"
              : "Ditolak"}
        </AlertTitle>
        <AlertDescription className="mt-1 space-y-2">
          {isRevision && note && (
            <p className="font-medium">Catatan HRD: "{note}"</p>
          )}
          {isPayroll && (isPending || isRevision || isRejected) && (
            <p className="flex items-center gap-1.5 font-bold mt-2">
              <AlertTriangle className="h-4 w-4" />
              Rekening belum diverifikasi HRD. Jangan gunakan untuk payroll
              final.
            </p>
          )}
        </AlertDescription>
      </div>
    </Alert>
  );
}

const EDUCATION_OPTIONS = [
  "Tidak/Belum Sekolah",
  "SD",
  "SMP",
  "SMA/SMK",
  "D1",
  "D2",
  "D3",
  "D4",
  "S1",
  "S2",
  "S3",
];

const OCCUPATION_OPTIONS = [
  "Belum/Tidak Bekerja",
  "Pelajar/Mahasiswa",
  "Ibu Rumah Tangga",
  "Karyawan Swasta",
  "ASN/PNS",
  "TNI/Polri",
  "Guru/Dosen",
  "Tenaga Kesehatan",
  "Wiraswasta",
  "Freelancer",
  "Buruh/Karyawan Harian",
  "Petani/Pekebun",
  "Nelayan",
  "Sopir/Kurir/Ojek",
  "Pensiunan",
  "Lainnya",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1980 + 1 }, (_, i) =>
  (CURRENT_YEAR - i).toString(),
);
const EXPIRED_YEAR_OPTIONS = ["Tidak ada masa berlaku", ...YEAR_OPTIONS];

const OCCUPATION_STATUS_OPTIONS = [
  "Tetap",
  "Kontrak",
  "Harian",
  "Usaha Sendiri",
  "Tidak Bekerja",
  "Masih Sekolah",
];

const GENDER_OPTIONS = ["Laki-laki", "Perempuan", "Lainnya"];
const MARITAL_STATUS_OPTIONS = [
  "Belum Menikah",
  "Menikah",
  "Cerai Hidup",
  "Cerai Mati",
];
const RELIGION_OPTIONS = [
  "Islam",
  "Kristen",
  "Katolik",
  "Hindu",
  "Buddha",
  "Konghucu",
  "Lainnya",
];
const NATIONALITY_OPTIONS = ["WNI", "WNA"];

const PARENT_STATUS_OPTIONS = ["Masih Hidup", "Meninggal"];
const FAMILY_DOCUMENT_TYPES = [
  "Surat Cerai",
  "Akta Kematian",
  "Surat Keterangan Tanggungan",
  "Dokumen Wali",
  "Surat Adopsi",
  "Dokumen Lainnya",
];
const RELATIONSHIP_OPTIONS = ["Istri", "Suami", "Anak"];

const PARENT_ACTIVITY_OPTIONS = [
  "Bekerja",
  "Ibu Rumah Tangga",
  "Pensiunan",
  "Tidak Bekerja",
  "Lainnya",
];

const SIBLING_ACTIVITY_OPTIONS = [
  "Sekolah",
  "Kuliah",
  "Bekerja",
  "Belum Bekerja",
];

const EMERGENCY_RELATION_OPTIONS = [
  "Ayah",
  "Ibu",
  "Suami",
  "Istri",
  "Kakak",
  "Adik",
  "Paman",
  "Bibi",
  "Sepupu",
  "Wali",
  "Kerabat Lain",
];

const EMERGENCY_PRIORITY_OPTIONS = ["Utama", "Cadangan"];

const calculateAge = (birthDate?: string) => {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const now = new Date();
  if (isNaN(birth.getTime())) return "";
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? `${age} thn` : "";
};

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
      gender: z.string().min(1, "Jenis kelamin harus dipilih."),
      birthPlace: z.string().min(2, "Tempat lahir harus diisi."),
      birthDate: z
        .string()
        .min(1, "Tanggal lahir harus diisi.")
        .refine(
          (val) => {
            const date = new Date(val);
            return !isNaN(date.getTime()) && date <= new Date();
          },
          {
            message: "Tanggal lahir tidak boleh di masa depan.",
          },
        ),
      maritalStatus: z
        .string()
        .min(1, "Status pernikahan harus dipilih.")
        .optional(),
      religion: z.string().min(1, "Agama harus dipilih.").optional(),
      nationality: z
        .string()
        .min(1, "Kewarganegaraan harus dipilih.")
        .optional(),
      countryOfOrigin: z.string().optional(),
      golonganDarah: z.string().optional(),
      tinggiBadan: z
        .string()
        .optional()
        .refine((value) => !value || /^[0-9]+$/.test(value), {
          message: "Tinggi badan hanya boleh berisi angka.",
        }),
      beratBadan: z
        .string()
        .optional()
        .refine((value) => !value || /^[0-9]+(?:\.[0-9]+)?$/.test(value), {
          message: "Berat badan hanya boleh berisi angka.",
        }),
      hasPhysicalCondition: z
        .string()
        .min(1, "Pilihan kelainan fisik harus dipilih.")
        .optional(),
      physicalConditionDetails: z.string().optional(),
      nik: z
        .string()
        .transform((value) => value.replace(/\D/g, ""))
        .refine((val) => val.length === 16, {
          message: "Nomor KTP harus tepat 16 digit angka.",
        }),
      profilePhotoUrl: z
        .string()
        .min(1, "Foto Diri harus diunggah.")
        .url("URL foto profil tidak valid.")
        .refine((value) => !!extractFileIdFromViewUrl(value), {
          message: "Foto Diri belum memiliki fileId. Silakan unggah ulang.",
        }),
      ktpPhotoUrl: z
        .string()
        .min(1, "Foto KTP harus diunggah.")
        .url("URL foto KTP tidak valid.")
        .refine((value) => !!extractFileIdFromViewUrl(value), {
          message: "Foto KTP belum memiliki fileId. Silakan unggah ulang.",
        }),
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
    isDomicileSameAsKtp: z.boolean().optional(),
    ktp: z
      .object({
        street: z.string().optional(),
        rt: z.string().optional(),
        rw: z.string().optional(),
        kodePos: z.string().optional(),
        provinsi: z.object({ id: z.string(), name: z.string() }).optional(),
        kabupatenKota: z
          .object({ id: z.string(), name: z.string() })
          .optional(),
        kecamatan: z.object({ id: z.string(), name: z.string() }).optional(),
        kelurahan: z.object({ id: z.string(), name: z.string() }).optional(),
      })
      .optional(),
    domisili: z
      .object({
        street: z.string().optional(),
        rt: z.string().optional(),
        rw: z.string().optional(),
        kodePos: z.string().optional(),
        provinsi: z.object({ id: z.string(), name: z.string() }).optional(),
        kabupatenKota: z
          .object({ id: z.string(), name: z.string() })
          .optional(),
        kecamatan: z.object({ id: z.string(), name: z.string() }).optional(),
        kelurahan: z.object({ id: z.string(), name: z.string() }).optional(),
      })
      .optional(),
  }),
  dokumenAdministratif: z
    .object({
      noNpwp: z.boolean().optional(),
      npwpFilePending: z.boolean().optional(),
      npwp: z.string().optional(),
      npwpPhotoUrl: z.string().optional(),
      noBpjsKesehatan: z.boolean().optional(),
      bpjsKesehatanFilePending: z.boolean().optional(),
      bpjsKesehatan: z.string().optional(),
      bpjsKesehatanPhotoUrl: z.string().optional(),
      noBpjsKetenagakerjaan: z.boolean().optional(),
      bpjsKetenagakerjaanFilePending: z.boolean().optional(),
      bpjsKetenagakerjaan: z.string().optional(),
      bpjsKetenagakerjaanPhotoUrl: z.string().optional(),
      simNumber: z.string().optional(),
      simPhotoUrl: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      // 1. NPWP Logic
      if (!data.noNpwp) {
        if (!data.npwp || data.npwp.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Nomor NPWP harus diisi.",
            path: ["npwp"],
          });
        }
        if (
          !data.npwpFilePending &&
          (!data.npwpPhotoUrl || data.npwpPhotoUrl.trim().length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Foto NPWP harus diunggah.",
            path: ["npwpPhotoUrl"],
          });
        }
      }

      // 2. BPJS Kesehatan Logic
      if (!data.noBpjsKesehatan) {
        if (!data.bpjsKesehatan || data.bpjsKesehatan.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Nomor BPJS Kesehatan harus diisi.",
            path: ["bpjsKesehatan"],
          });
        }
        if (
          !data.bpjsKesehatanPhotoUrl ||
          data.bpjsKesehatanPhotoUrl.trim().length === 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Foto BPJS Kesehatan harus diunggah.",
            path: ["bpjsKesehatanPhotoUrl"],
          });
        }
      }

      // 3. BPJS Ketenagakerjaan Logic
      if (!data.noBpjsKetenagakerjaan) {
        if (
          !data.bpjsKetenagakerjaan ||
          data.bpjsKetenagakerjaan.trim().length === 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Nomor BPJS Ketenagakerjaan harus diisi.",
            path: ["bpjsKetenagakerjaan"],
          });
        }
        if (
          !data.bpjsKetenagakerjaanPhotoUrl ||
          data.bpjsKetenagakerjaanPhotoUrl.trim().length === 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Foto BPJS Ketenagakerjaan harus diunggah.",
            path: ["bpjsKetenagakerjaanPhotoUrl"],
          });
        }
      }

      // Helper for URL validation (only if not empty)
      const validateUrl = (
        url: string | undefined,
        path: string,
        label: string,
      ) => {
        if (url && url.trim().length > 0) {
          try {
            new URL(url);
          } catch (e) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `URL ${label} tidak valid.`,
              path: [path],
            });
          }
        }
      };

      validateUrl(data.npwpPhotoUrl, "npwpPhotoUrl", "NPWP");
      validateUrl(
        data.bpjsKesehatanPhotoUrl,
        "bpjsKesehatanPhotoUrl",
        "BPJS Kesehatan",
      );
      validateUrl(
        data.bpjsKetenagakerjaanPhotoUrl,
        "bpjsKetenagakerjaanPhotoUrl",
        "BPJS Ketenagakerjaan",
      );
      validateUrl(data.simPhotoUrl, "simPhotoUrl", "SIM");
    }),
  dataRekening: z.object({
    bankName: z.string().min(1, "Nama bank harus dipilih."),
    bankAccountNumber: z.string().optional(),
    bankAccountHolderName: z.string().optional(),
    bankDocumentUrl: z
      .string()
      .url("URL bukti rekening tidak valid.")
      .optional(),
    buktiRekeningUrl: z.string().optional(),
  }),
  dataKeluarga: z
    .object({
      orangTua: z.object({
        ayah: z.object({
          name: z.string().optional(),
          status: z.string().optional(),
          birthPlace: z.string().optional(),
          birthDate: z.string().optional(),
          activityStatus: z.string().optional(),
          education: z.string().optional(),
          occupation: z.string().optional(),
          occupationOther: z.string().optional(),
          address: z.string().optional(),
          phone: z.string().optional(),
        }),
        ibu: z.object({
          name: z.string().optional(),
          status: z.string().optional(),
          birthPlace: z.string().optional(),
          birthDate: z.string().optional(),
          activityStatus: z.string().optional(),
          education: z.string().optional(),
          occupation: z.string().optional(),
          occupationOther: z.string().optional(),
          address: z.string().optional(),
          phone: z.string().optional(),
        }),
      }),
      saudaraKandung: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            birthPlace: z.string().optional(),
            birthDate: z.string().optional(),
            order: z.string().optional(),
            education: z.string().optional(),
            activityStatus: z.string().optional(),
            occupation: z.string().optional(),
            occupationOther: z.string().optional(),
            occupationStatus: z.string().optional(),
            address: z.string().optional(),
          }),
        )
        .optional(),
      tanggungan: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            gender: z.string().optional(),
            birthPlace: z.string().optional(),
            birthDate: z.string().optional(),
            relation: z.string().optional(),
            childOrder: z.string().optional(),
            education: z.string().optional(),
            activityStatus: z.string().optional(),
            occupation: z.string().optional(),
            occupationOther: z.string().optional(),
            occupationStatus: z.string().optional(),
            status: z.string().optional(),
            address: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  pendidikanDanPengembangan: z
    .object({
      pendidikanTerakhir: z.object({
        jenjang: z.string().min(1, "Jenjang wajib diisi."),
        namaInstitusi: z.string().min(2, "Nama institusi wajib diisi."),
        jurusan: z.string().min(2, "Jurusan wajib diisi."),
        tahunLulus: z.string().min(4, "Tahun lulus wajib diisi."),
        ijazahUrl: z.string().optional(),
      }),
      riwayatPendidikan: z
        .array(
          z.object({
            id: z.string(),
            jenjang: z.string().optional(),
            namaInstitusi: z.string().optional(),
            jurusan: z.string().optional(),
            tahunLulus: z.string().optional(),
            ijazahUrl: z.string().optional(),
          }),
        )
        .optional(),
      sertifikasiPelatihan: z
        .array(
          z.object({
            id: z.string(),
            namaSertifikasi: z.string().optional(),
            penyelenggara: z.string().optional(),
            tahunPerolehan: z.string().optional(),
            tahunExpired: z.string().optional(),
            buktiUrl: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  kontakDarurat: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(2, "Nama lengkap harus diisi."),
        relation: z.string().min(1, "Hubungan harus dipilih."),
        relationOther: z.string().optional(),
        phone: z
          .string()
          .min(1, "Nomor telepon wajib diisi.")
          .transform((val) => val.replace(/[^0-9]/g, ""))
          .refine((val) => /^(08|62)[0-9]{8,12}$/.test(val), {
            message: "Format nomor HP Indonesia tidak valid (08... atau 62...)",
          }),
        address: z.string().optional(),
        priority: z.string().min(1, "Prioritas harus dipilih."),
      }),
    )
    .min(1, "Minimal 1 kontak darurat harus diisi.")
    .superRefine((contacts, ctx) => {
      const hasMain = contacts.some((c: any) => c.priority === "Utama");
      if (!hasMain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Harus ada minimal 1 kontak dengan prioritas 'Utama'.",
          path: [0, "priority"],
        });
      }
    }),
  familyDocuments: z
    .object({
      kk: z
        .object({
          fileUrl: z.string().optional(),
          fileName: z.string().optional(),
          uploadedAt: z.any().optional(),
          status: z.string().optional(),
        })
        .optional(),
      marriageCertificate: z
        .object({
          fileUrl: z.string().optional(),
          fileName: z.string().optional(),
          uploadedAt: z.any().optional(),
          status: z.string().optional(),
        })
        .optional(),
      spouseKtp: z
        .object({
          fileUrl: z.string().optional(),
          fileName: z.string().optional(),
          uploadedAt: z.any().optional(),
          status: z.string().optional(),
        })
        .optional(),
      familyBpjsMembers: z
        .array(
          z.object({
            dependentId: z.string().optional(),
            dependentName: z.string().optional(),
            relationship: z.string().optional(),
            bpjsNumber: z.string().optional(),
            fileUrl: z.string().optional(),
            fileName: z.string().optional(),
            uploadedAt: z.any().optional(),
            status: z.string().optional(),
          }),
        )
        .optional(),
      childBirthCertificates: z
        .array(
          z.object({
            childName: z.string().optional(),
            fileUrl: z.string().optional(),
            fileName: z.string().optional(),
            uploadedAt: z.any().optional(),
            status: z.string().optional(),
          }),
        )
        .optional(),
      additionalDocuments: z
        .array(
          z.object({
            documentType: z.string().optional(),
            documentName: z.string().optional(),
            fileUrl: z.string().optional(),
            fileName: z.string().optional(),
            uploadedAt: z.any().optional(),
            status: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

type FormValues = z.infer<typeof selfFormSchema>;

interface EmployeeSelfProfileFormProps {
  initialProfile: Partial<EmployeeProfile>;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

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

type FileMetadata = {
  fileId?: string;
  fileName: string;
  fileType: string;
  finalSize?: number;
  uploadedAt?: any;
  viewUrl: string;
};

type FileUploadFieldProps = {
  label: string;
  value?: string;
  onChange: (url: string, metadata?: FileMetadata) => void;
  userId: string;
  fieldKey: string;
  required?: boolean;
  helperText?: string;
};

type UploadStateContextValue = {
  setUploadStatus: (
    fieldKey: string,
    status: "uploading" | "success" | "error",
    errorMessage?: string,
  ) => void;
  setUploadMetadata: (fieldKey: string, metadata: FileMetadata | null) => void;
};

const UploadStateContext = createContext<UploadStateContextValue | null>(null);

function extractFileIdFromViewUrl(viewUrl?: string) {
  if (!viewUrl) return null;
  try {
    const url = new URL(
      viewUrl,
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin,
    );
    const fileId = url.searchParams.get("fileId");
    if (fileId) return fileId;
  } catch {
    // ignore invalid URL format
  }
  const match = viewUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

function DocumentUploadCard({
  title,
  description,
  value,
  onChange,
  userId,
  fieldKey,
  status,
  helperText,
  icon: Icon,
  disabled = false,
  hasError = false,
}: {
  title: string;
  description: string;
  value?: string;
  onChange: (url: string, metadata?: FileMetadata) => void;
  userId: string;
  fieldKey: string;
  status:
    | "Sudah Upload"
    | "Belum Upload"
    | "Tidak Punya"
    | "File Baru Belum Disimpan"
    | "Tidak Dibutuhkan"
    | "Perlu Review HRD";
  helperText: string;
  icon: any;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadContext = useContext(UploadStateContext);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateStorageFile(file);
    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "File tidak valid",
        description: validation.message,
      });
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setProgress(0);
    uploadContext?.setUploadStatus(fieldKey, "uploading");

    console.log("Upload started", {
      fieldKey,
      fileName: file.name,
      fileSize: file.size,
    });

    try {
      const processedFile = await compressImage(file);
      const storagePath = `employee_profiles/${userId}/${fieldKey}_${Date.now()}_${processedFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;

      const result = await uploadFile(processedFile, storagePath, userId, {
        category:
          fieldKey.includes("photo") || fieldKey.includes("profile")
            ? "profile_photo"
            : "employee_document",
        ownerUid: userId,
        compress: false,
      });

      const viewUrl = result.fileId
        ? `/api/storage/view?fileId=${result.fileId}`
        : result.downloadUrl || "";

      const metadata: FileMetadata = {
        fileId: result.fileId,
        fileName: result.fileName,
        fileType: result.fileType,
        finalSize: result.finalSize,
        uploadedAt: result.uploadedAt,
        viewUrl,
      };

      onChange(viewUrl, metadata);
      uploadContext?.setUploadMetadata(fieldKey, metadata);
      uploadContext?.setUploadStatus(fieldKey, "success");
      setProgress(100);
      console.log("Upload finished", { fieldKey, metadata });
      toast({
        title: "Berhasil",
        description: "File berhasil diunggah.",
      });
    } catch (error: any) {
      const errorMessage =
        error?.message ||
        "Upload dokumen gagal. Silakan coba lagi atau hubungi admin.";
      console.error("Upload error:", { fieldKey, error });
      setUploadError(errorMessage);
      uploadContext?.setUploadStatus(fieldKey, "error", errorMessage);
      toast({
        variant: "destructive",
        title: "Upload dokumen gagal",
        description: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const fileId = extractFileIdFromViewUrl(value);

  const openSecureFile = async () => {
    if (!fileId) {
      toast({
        variant: "destructive",
        title: "Dokumen tidak dapat dibuka",
        description: "FileId tidak tersedia untuk dokumen ini.",
      });
      return;
    }

    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Autentikasi tidak ditemukan.");
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/storage/view?fileId=${fileId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Gagal mengambil dokumen.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (error: any) {
      console.error("openSecureFile error:", error);
      toast({
        variant: "destructive",
        title: "Gagal membuka dokumen",
        description:
          error?.message || "Tidak dapat membuka dokumen. Silakan coba lagi.",
      });
    }
  };

  return (
    <Card
      className={`overflow-hidden rounded-3xl shadow-sm transition-all duration-300 ${
        disabled ? "opacity-70 cursor-not-allowed" : ""
      } ${hasError ? "border-red-500/40 bg-red-500/5 shadow-red-500/10" : "border-slate-800 bg-slate-900/40 hover:shadow-md"}`}
    >
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors ${
                    status === "Sudah Upload"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : status === "Belum Upload" ||
                          status === "Perlu Review HRD"
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-slate-500/10 text-slate-500"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-100 tracking-tight">
                    {title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        status === "Sudah Upload"
                          ? "bg-emerald-500"
                          : status === "Belum Upload" ||
                              status === "Perlu Review HRD"
                            ? "bg-amber-500"
                            : "bg-slate-500"
                      }`}
                    />
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        status === "Sudah Upload"
                          ? "text-emerald-500"
                          : status === "Belum Upload" ||
                              status === "Perlu Review HRD"
                            ? "text-amber-500"
                            : "text-slate-500"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed">
              {description}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                type="button"
                variant={status === "Sudah Upload" ? "outline" : "secondary"}
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || status === "Tidak Punya" || disabled}
                className="rounded-xl px-6 h-11 font-semibold group transition-all"
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-2 h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                )}
                {status === "Sudah Upload" ? "Ganti File" : "Upload Dokumen"}
              </Button>
              <p className="text-[10px] text-slate-500 italic font-medium">
                {helperText}
              </p>
            </div>

            {isUploading && (
              <div className="space-y-2 pt-2">
                <Progress value={progress} className="h-1.5 rounded-full" />
                <p className="text-[10px] text-right text-slate-400 font-medium">
                  Mengunggah file...
                </p>
              </div>
            )}

            {uploadError ? (
              <Alert className="bg-red-500/10 border-red-500 text-red-200">
                <AlertTitle className="text-sm font-semibold">
                  Upload gagal
                </AlertTitle>
                <AlertDescription className="text-sm text-red-100">
                  {uploadError}
                </AlertDescription>
              </Alert>
            ) : null}
            {hasError ? (
              <p className="text-sm font-medium text-destructive">
                Silakan periksa kembali dokumen dan unggah ulang jika perlu.
              </p>
            ) : null}
          </div>

          <div
            className={`lg:w-72 xl:w-80 border-l border-slate-800 flex items-center justify-center p-6 sm:p-8 transition-all ${
              !value
                ? "bg-slate-950/20 grayscale opacity-40"
                : "bg-slate-950/60"
            }`}
          >
            <div className="group relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl transition-all hover:border-primary/30">
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-slate-400 bg-slate-800/30">
                <div className="h-16 w-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 shadow-lg group-hover:scale-110 transition-transform duration-500">
                  <FileText className="h-10 w-10" />
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] block mb-1">
                    {value ? "File sudah diunggah" : "Belum Ada Dokumen"}
                  </span>
                  {title && (
                    <span className="text-[9px] text-slate-500 font-medium truncate max-w-[120px]">
                      {title}
                    </span>
                  )}
                </div>
              </div>
              {fileId ? (
                <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="rounded-full px-6 h-9 font-bold text-xs"
                    onClick={openSecureFile}
                  >
                    <Eye className="mr-2 h-4 w-4" /> Lihat Dokumen
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />
    </Card>
  );
}

function FileUploadField({
  label,
  value,
  onChange,
  userId,
  fieldKey,
  status,
  description,
  icon,
  helperText = "Format: JPG, PNG, PDF (Max 10MB)",
  disabled = false,
  hasError = false,
}: {
  label: string;
  value?: string;
  onChange: (url: string, metadata?: FileMetadata) => void;
  userId: string;
  fieldKey: string;
  status:
    | "Sudah Upload"
    | "Belum Upload"
    | "Tidak Punya"
    | "File Baru Belum Disimpan"
    | "Tidak Dibutuhkan"
    | "Perlu Review HRD";
  description: string;
  icon: any;
  helperText?: string;
  disabled?: boolean;
  hasError?: boolean;
}) {
  return (
    <DocumentUploadCard
      title={label}
      description={description}
      value={value}
      onChange={onChange}
      userId={userId}
      fieldKey={fieldKey}
      status={status}
      helperText={helperText}
      icon={icon}
      disabled={disabled}
      hasError={hasError}
    />
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
    title: "Data Keluarga & Tanggungan",
    description: "Lengkapi data keluarga dan kontak darurat Anda.",
    fields: ["dataKeluarga", "kontakDarurat", "familyDocuments"],
  },
  {
    title: "Pendidikan & Pengembangan",
    description:
      "Riwayat pendidikan dan sertifikasi atau pelatihan yang pernah diikuti (opsional).",
    fields: ["pendidikanDanPengembangan"],
  },
];

// ── Dropdown value canonicalizers ────────────────────────────────────────────
// Translate legacy / variant stored values → exact option string the Select uses.

function canonicalGender(raw: any): string {
  const VALID = ["Laki-laki", "Perempuan", "Lainnya"] as const;
  if (!raw && raw !== false) return "";
  const v = String(raw).trim();
  const MAP: Record<string, string> = {
    "laki-laki": "Laki-laki",
    "laki laki": "Laki-laki",
    l: "Laki-laki",
    m: "Laki-laki",
    male: "Laki-laki",
    perempuan: "Perempuan",
    p: "Perempuan",
    f: "Perempuan",
    female: "Perempuan",
    lainnya: "Lainnya",
    other: "Lainnya",
  };
  const found = VALID.find((o) => o === v);
  if (found) return found;
  return MAP[v.toLowerCase()] ?? "";
}

function canonicalMaritalStatus(raw: any): string {
  const VALID = [
    "Belum Menikah",
    "Menikah",
    "Cerai Hidup",
    "Cerai Mati",
  ] as const;
  if (!raw) return "";
  const v = String(raw).trim();
  const MAP: Record<string, string> = {
    "belum menikah": "Belum Menikah",
    "belum kawin": "Belum Menikah",
    single: "Belum Menikah",
    "tidak menikah": "Belum Menikah",
    menikah: "Menikah",
    kawin: "Menikah",
    married: "Menikah",
    "sudah menikah": "Menikah",
    "cerai hidup": "Cerai Hidup",
    divorced: "Cerai Hidup",
    "cerai mati": "Cerai Mati",
    janda: "Cerai Mati",
    duda: "Cerai Mati",
    widowed: "Cerai Mati",
  };
  const found = VALID.find((o) => o === v);
  if (found) return found;
  return MAP[v.toLowerCase()] ?? "";
}

function canonicalReligion(raw: any): string {
  const VALID = [
    "Islam",
    "Kristen",
    "Katolik",
    "Hindu",
    "Buddha",
    "Konghucu",
    "Lainnya",
  ] as const;
  if (!raw) return "";
  const v = String(raw).trim();
  const MAP: Record<string, string> = {
    islam: "Islam",
    muslim: "Islam",
    kristen: "Kristen",
    "kristen protestan": "Kristen",
    protestant: "Kristen",
    christian: "Kristen",
    katolik: "Katolik",
    catholic: "Katolik",
    "kristen katolik": "Katolik",
    hindu: "Hindu",
    buddha: "Buddha",
    budha: "Buddha",
    buddhist: "Buddha",
    konghucu: "Konghucu",
    confucian: "Konghucu",
    lainnya: "Lainnya",
    other: "Lainnya",
  };
  const found = VALID.find((o) => o === v);
  if (found) return found;
  return MAP[v.toLowerCase()] ?? "";
}

function canonicalNationality(raw: any): string {
  const VALID = ["WNI", "WNA"] as const;
  if (!raw) return "WNI";
  const v = String(raw).trim();
  const MAP: Record<string, string> = {
    wni: "WNI",
    indonesia: "WNI",
    "warga negara indonesia": "WNI",
    indonesian: "WNI",
    wna: "WNA",
    "warga negara asing": "WNA",
    foreigner: "WNA",
    foreign: "WNA",
  };
  const found = VALID.find((o) => o === v);
  if (found) return found;
  return MAP[v.toLowerCase()] ?? "WNI";
}

function canonicalGolonganDarah(raw: any): string {
  const VALID = [
    "A",
    "B",
    "AB",
    "O",
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
  ] as const;
  if (!raw) return "";
  const v = String(raw).trim().toUpperCase();
  return (VALID as readonly string[]).includes(v) ? v : "";
}

function canonicalHasPhysicalCondition(raw: any): string {
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return "Ya";
  if (raw === false || raw === "false" || raw === "0" || raw === 0)
    return "Tidak";
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "ya" || v === "yes") return "Ya";
  if (v === "tidak" || v === "no" || v === "none") return "Tidak";
  return "";
}
// ─────────────────────────────────────────────────────────────────────────────

function normalizeEmployeeProfileToFormValues(initialProfile: any): any {
  if (!initialProfile) return {};

  const dd = initialProfile.dataDiriIdentitas || {};
  const al = initialProfile.alamat || {};
  const docAdmin = initialProfile.dokumenAdministratif || {};
  const rek = initialProfile.dataRekening || {};
  const kd = initialProfile.kontakDarurat || {};
  const dk = initialProfile.dataKeluarga || {};
  const pp = initialProfile.pendidikanDanPengembangan || {};
  const fd = initialProfile.familyDocuments || {};

  const normalize = (val: any) => {
    if (val === null || val === undefined) return "";
    return String(val).trim();
  };

  const birthDate = initialProfile.birthDate
    ? parseDateValue(initialProfile.birthDate)
    : null;
  const formattedBirthDate = birthDate ? format(birthDate, "yyyy-MM-dd") : "";

  return {
    dataDiriIdentitas: {
      fullName: dd.fullName || initialProfile.fullName || "",
      nickName: dd.nickName || initialProfile.nickName || "",
      personalEmail:
        dd.personalEmail ||
        initialProfile.personalEmail ||
        initialProfile.email ||
        "",
      phone: dd.phone || initialProfile.phone || "",
      // ── Dropdown fields — use canonicalizers so legacy values map correctly ──
      gender: canonicalGender(dd.gender || initialProfile.gender),
      birthPlace: dd.birthPlace || initialProfile.birthPlace || "",
      birthDate: dd.birthDate || formattedBirthDate,
      maritalStatus: canonicalMaritalStatus(
        dd.maritalStatus || initialProfile.maritalStatus,
      ),
      religion: canonicalReligion(dd.religion || initialProfile.religion),
      nationality: canonicalNationality(
        dd.nationality || initialProfile.nationality,
      ),
      countryOfOrigin:
        dd.countryOfOrigin ||
        initialProfile.additionalFields?.countryOfOrigin ||
        initialProfile.countryOfOrigin ||
        "",
      golonganDarah: canonicalGolonganDarah(
        dd.golonganDarah ||
          initialProfile.additionalFields?.golonganDarah ||
          initialProfile.bloodType,
      ),
      tinggiBadan:
        dd.tinggiBadan ||
        initialProfile.additionalFields?.tinggiBadan ||
        initialProfile.heightCm ||
        "",
      beratBadan:
        dd.beratBadan ||
        initialProfile.additionalFields?.beratBadan ||
        initialProfile.weightKg ||
        "",
      hasPhysicalCondition: canonicalHasPhysicalCondition(
        dd.hasPhysicalCondition ??
          initialProfile.additionalFields?.hasPhysicalCondition ??
          initialProfile.hasPhysicalCondition ??
          "Tidak",
      ),
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
      isDomicileSameAsKtp:
        al.isDomicileSameAsKtp ?? initialProfile.isDomicileSameAsKtp ?? false,
      ktp: {
        street: al.ktp?.street || "",
        rt: al.ktp?.rt || "",
        rw: al.ktp?.rw || "",
        kodePos: al.ktp?.kodePos || "",
        provinsi: al.ktp?.provinsi || undefined,
        kabupatenKota: al.ktp?.kabupatenKota || undefined,
        kecamatan: al.ktp?.kecamatan || undefined,
        kelurahan: al.ktp?.kelurahan || undefined,
      },
      domisili: {
        street: al.domisili?.street || "",
        rt: al.domisili?.rt || "",
        rw: al.domisili?.rw || "",
        kodePos: al.domisili?.kodePos || "",
        provinsi: al.domisili?.provinsi || undefined,
        kabupatenKota: al.domisili?.kabupatenKota || undefined,
        kecamatan: al.domisili?.kecamatan || undefined,
        kelurahan: al.domisili?.kelurahan || undefined,
      },
    },
    dokumenAdministratif: {
      noNpwp: docAdmin.noNpwp ?? initialProfile.noNpwp ?? false,
      npwpFilePending:
        docAdmin.npwpFilePending ?? initialProfile.npwpFilePending ?? false,
      npwp: docAdmin.npwp || initialProfile.npwp || "",
      npwpPhotoUrl: docAdmin.npwpPhotoUrl || initialProfile.npwpPhotoUrl || "",
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
        rek.bankAccountHolderName || initialProfile.bankAccountHolderName || "",
      bankDocumentUrl:
        rek.bankDocumentUrl || initialProfile.bankDocumentUrl || "",
      buktiRekeningUrl:
        rek.buktiRekeningUrl || (initialProfile as any)?.buktiRekeningUrl || "",
    },
    kontakDarurat:
      Array.isArray(kd) && kd.length > 0
        ? kd.map((k: any) => ({
            id: k.id || crypto.randomUUID(),
            name: k.name || "",
            relation: k.relation || "",
            relationOther: k.relationOther || "",
            phone: k.phone || "",
            address: k.address || "",
            priority: k.priority || "Utama",
          }))
        : [
            {
              id: crypto.randomUUID(),
              name: initialProfile.emergencyContactName || "",
              relation: initialProfile.emergencyContactRelation || "",
              relationOther: "",
              phone: initialProfile.emergencyContactPhone || "",
              address: initialProfile.emergencyContactAddress || "",
              priority: "Utama",
            },
          ],
    dataKeluarga: {
      orangTua: {
        ayah: {
          name: dk.orangTua?.ayah?.name || "",
          status: dk.orangTua?.ayah?.status || "",
          birthPlace: dk.orangTua?.ayah?.birthPlace || "",
          birthDate: dk.orangTua?.ayah?.birthDate || "",
          activityStatus: dk.orangTua?.ayah?.activityStatus || "",
          education: dk.orangTua?.ayah?.education || "",
          occupation: dk.orangTua?.ayah?.occupation || "",
          occupationOther: dk.orangTua?.ayah?.occupationOther || "",
          address: dk.orangTua?.ayah?.address || "",
          phone: dk.orangTua?.ayah?.phone || "",
        },
        ibu: {
          name: dk.orangTua?.ibu?.name || "",
          status: dk.orangTua?.ibu?.status || "",
          birthPlace: dk.orangTua?.ibu?.birthPlace || "",
          birthDate: dk.orangTua?.ibu?.birthDate || "",
          activityStatus: dk.orangTua?.ibu?.activityStatus || "",
          education: dk.orangTua?.ibu?.education || "",
          occupation: dk.orangTua?.ibu?.occupation || "",
          occupationOther: dk.orangTua?.ibu?.occupationOther || "",
          address: dk.orangTua?.ibu?.address || "",
          phone: dk.orangTua?.ibu?.phone || "",
        },
      },
      saudaraKandung: (dk.saudaraKandung || []).map((s: any) => ({
        id: s.id || crypto.randomUUID(),
        name: s.name || "",
        birthPlace: s.birthPlace || "",
        birthDate: s.birthDate || "",
        order: s.order || "",
        education: s.education || "",
        activityStatus: s.activityStatus || "",
        occupation: s.occupation || "",
        occupationOther: s.occupationOther || "",
        occupationStatus: s.occupationStatus || "",
        address: s.address || "",
      })),
      tanggungan: (dk.tanggungan || []).map((t: any) => ({
        id: t.id || crypto.randomUUID(),
        name: t.name || "",
        gender: normalize(t.gender || ""),
        birthPlace: t.birthPlace || "",
        birthDate: t.birthDate || "",
        relation: t.relation || "",
        childOrder: t.childOrder || "",
        education: t.education || "",
        activityStatus: t.activityStatus || "",
        occupation: t.occupation || "",
        occupationOther: t.occupationOther || "",
        occupationStatus: t.occupationStatus || "",
        status: t.status || "",
        address: t.address || "",
      })),
    },
    pendidikanDanPengembangan: {
      pendidikanTerakhir: {
        jenjang: pp.pendidikanTerakhir?.jenjang || "",
        namaInstitusi: pp.pendidikanTerakhir?.namaInstitusi || "",
        jurusan: pp.pendidikanTerakhir?.jurusan || "",
        tahunLulus: pp.pendidikanTerakhir?.tahunLulus || "",
        ijazahUrl: pp.pendidikanTerakhir?.ijazahUrl || "",
      },
      riwayatPendidikan: (pp.riwayatPendidikan || []).map((p: any) => ({
        id: p.id || crypto.randomUUID(),
        jenjang: p.jenjang || "",
        namaInstitusi: p.namaInstitusi || "",
        jurusan: p.jurusan || "",
        tahunLulus: p.tahunLulus || "",
        ijazahUrl: p.ijazahUrl || "",
      })),
      sertifikasiPelatihan: (pp.sertifikasiPelatihan || []).map((s: any) => ({
        id: s.id || crypto.randomUUID(),
        namaSertifikasi: s.namaSertifikasi || "",
        penyelenggara: s.penyelenggara || "",
        tahunPerolehan: s.tahunPerolehan || s.tahun || "",
        tahunExpired: s.tahunExpired || "",
        buktiUrl: s.buktiUrl || "",
      })),
    },
    familyDocuments: {
      kk: {
        fileUrl: fd.kk?.fileUrl || "",
        fileName: fd.kk?.fileName || "",
        uploadedAt: fd.kk?.uploadedAt || null,
        status: fd.kk?.status || "missing",
      },
      marriageCertificate: {
        fileUrl: fd.marriageCertificate?.fileUrl || "",
        fileName: fd.marriageCertificate?.fileName || "",
        uploadedAt: fd.marriageCertificate?.uploadedAt || null,
        status: fd.marriageCertificate?.status || "missing",
      },
      spouseKtp: {
        fileUrl: fd.spouseKtp?.fileUrl || "",
        fileName: fd.spouseKtp?.fileName || "",
        uploadedAt: fd.spouseKtp?.uploadedAt || null,
        status: fd.spouseKtp?.status || "missing",
      },
      familyBpjsMembers: (fd.familyBpjsMembers || []).map((m: any) => ({
        dependentId: m.dependentId || "",
        dependentName: m.dependentName || "",
        relationship: m.relationship || "",
        bpjsNumber: m.bpjsNumber || "",
        fileUrl: m.fileUrl || "",
        fileName: m.fileName || "",
        uploadedAt: m.uploadedAt || null,
        status: m.status || "missing",
      })),
      childBirthCertificates: (fd.childBirthCertificates || []).map(
        (c: any) => ({
          childName: c.childName || "",
          fileUrl: c.fileUrl || "",
          fileName: c.fileName || "",
          uploadedAt: c.uploadedAt || null,
          status: c.status || "missing",
        }),
      ),
      additionalDocuments: (fd.additionalDocuments || [])
        .filter((d: any) => d.documentType || d.fileUrl)
        .map((d: any) => ({
          documentType: d.documentType || "",
          documentName: d.documentName || "",
          fileUrl: d.fileUrl || "",
          fileName: d.fileName || "",
          uploadedAt: d.uploadedAt || null,
          status: d.status || "missing",
        })),
    },
  };
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
  const lastResetKeyRef = useRef("");

  const [pendingBankRequest, setPendingBankRequest] = useState<any>(null);
  const [isBankRequestModalOpen, setIsBankRequestModalOpen] = useState(false);

  const [isChangeRequestModalOpen, setIsChangeRequestModalOpen] =
    useState(false);
  const [activeChangeCategory, setActiveChangeCategory] = useState<
    ChangeRequestCategory | undefined
  >();
  const [pendingRequests, setPendingRequests] = useState<Record<string, any>>(
    {},
  );

  const fetchPendingRequests = async () => {
    if (!firebaseUser?.uid) return;
    try {
      // Fetch Legacy Bank Requests
      const bankQ = query(
        collection(firestore, "bank_change_requests"),
        where("employeeUid", "==", firebaseUser.uid),
        orderBy("submittedAt", "desc"),
        limit(1),
      );
      const bankSnap = await getDocs(bankQ);
      if (!bankSnap.empty) {
        const doc = bankSnap.docs[0];
        const request = { id: doc.id, ...doc.data() } as any;
        setPendingBankRequest(request.status === "pending" ? request : null);
      } else {
        setPendingBankRequest(null);
      }

      // Fetch Generic Change Requests (exclude payroll requests, which use bank_change_requests)
      const q = query(
        collection(firestore, "employee_change_requests"),
        where("employeeUid", "==", firebaseUser.uid),
        where("status", "==", "pending"),
      );
      const snapshot = await getDocs(q);
      const requests: Record<string, any> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.category === "payroll") return;
        requests[data.category] = { id: doc.id, ...data };
      });
      setPendingRequests(requests);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, [firebaseUser?.uid, firestore]);

  const openChangeRequest = (category: ChangeRequestCategory) => {
    setActiveChangeCategory(category);
    setIsChangeRequestModalOpen(true);
  };

  const requiresSim = useMemo(() => {
    const position = (initialProfile.positionTitle || "").toLowerCase();
    const requiredKeywords = [
      "driver",
      "lapangan",
      "operasional",
      "sales lapangan",
    ];
    return (
      (initialProfile as any).requiresSIM === true ||
      requiredKeywords.some((kw) => position.includes(kw))
    );
  }, [initialProfile]);

  const isIdentityVerified =
    initialProfile.verificationStatus?.identity === "approved";
  const isTaxVerified = initialProfile.verificationStatus?.tax === "approved";
  const isBpjsVerified = initialProfile.verificationStatus?.bpjs === "approved";
  const isFamilyVerified =
    initialProfile.verificationStatus?.family === "approved";
  const isBankVerified =
    initialProfile.verificationStatus?.bankAccount === "approved";

  const form = useForm<FormValues>({
    resolver: zodResolver(selfFormSchema),
    defaultValues: {
      dataDiriIdentitas: {
        fullName: "",
        nickName: "",
        personalEmail: "",
        phone: "",
        gender: "",
        birthPlace: "",
        birthDate: "",
        maritalStatus: "",
        religion: "",
        nationality: "",
        countryOfOrigin: "",
        golonganDarah: "",
        tinggiBadan: "",
        beratBadan: "",
        hasPhysicalCondition: "",
        physicalConditionDetails: "",
        nik: "",
        profilePhotoUrl: "",
        ktpPhotoUrl: "",
      },
      alamat: {
        isDomicileSameAsKtp: false,
        ktp: {
          street: "",
          rt: "",
          rw: "",
          kodePos: "",
          provinsi: undefined,
          kabupatenKota: undefined,
          kecamatan: undefined,
          kelurahan: undefined,
        },
        domisili: {
          street: "",
          rt: "",
          rw: "",
          kodePos: "",
          provinsi: undefined,
          kabupatenKota: undefined,
          kecamatan: undefined,
          kelurahan: undefined,
        },
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
        buktiRekeningUrl: "",
      },
      dataKeluarga: {
        orangTua: {
          ayah: {
            name: "",
            status: "",
            birthPlace: "",
            birthDate: "",
            activityStatus: "",
            education: "",
            occupation: "",
            occupationOther: "",
            address: "",
            phone: "",
          },
          ibu: {
            name: "",
            status: "",
            birthPlace: "",
            birthDate: "",
            activityStatus: "",
            education: "",
            occupation: "",
            occupationOther: "",
            address: "",
            phone: "",
          },
        },
        saudaraKandung: [],
        tanggungan: [],
      },
      pendidikanDanPengembangan: {
        pendidikanTerakhir: {
          jenjang: "",
          namaInstitusi: "",
          jurusan: "",
          tahunLulus: "",
          ijazahUrl: "",
        },
        riwayatPendidikan: [],
        sertifikasiPelatihan: [],
      },
      kontakDarurat: [
        {
          id: crypto.randomUUID(),
          name: "",
          relation: "",
          relationOther: "",
          phone: "",
          address: "",
          priority: "Utama",
        },
      ],
      familyDocuments: {
        kk: { fileUrl: "", status: "missing" },
        marriageCertificate: { fileUrl: "", status: "missing" },
        spouseKtp: { fileUrl: "", status: "missing" },
        familyBpjsMembers: [],
        childBirthCertificates: [],
        additionalDocuments: [],
      },
    },
  });

  const {
    fields: saudaraFields,
    append: appendSaudara,
    remove: removeSaudara,
  } = useFieldArray({
    control: form.control,
    name: "dataKeluarga.saudaraKandung",
  });

  const {
    fields: tanggunganFields,
    append: appendTanggungan,
    remove: removeTanggungan,
  } = useFieldArray({
    control: form.control,
    name: "dataKeluarga.tanggungan",
  });

  const {
    fields: pendidikanFields,
    append: appendPendidikan,
    remove: removePendidikan,
  } = useFieldArray({
    control: form.control,
    name: "pendidikanDanPengembangan.riwayatPendidikan",
  });

  const {
    fields: sertifikasiFields,
    append: appendSertifikasi,
    remove: removeSertifikasi,
  } = useFieldArray({
    control: form.control,
    name: "pendidikanDanPengembangan.sertifikasiPelatihan",
  });

  const {
    fields: daruratFields,
    append: appendDarurat,
    remove: removeDarurat,
  } = useFieldArray({
    control: form.control,
    name: "kontakDarurat",
  });

  const {
    fields: additionalFamilyDocFields,
    append: appendAdditionalFamilyDoc,
    remove: removeAdditionalFamilyDoc,
  } = useFieldArray({
    control: form.control,
    name: "familyDocuments.additionalDocuments",
  });

  const {
    fields: familyBpjsMemberFields,
    append: appendFamilyBpjsMember,
    remove: removeFamilyBpjsMember,
  } = useFieldArray({
    control: form.control,
    name: "familyDocuments.familyBpjsMembers",
  });

  useEffect(() => {
    if (!initialProfile || !firebaseUser?.uid) return;

    const resetKey = JSON.stringify({
      uid: initialProfile.uid,
      updatedAt: initialProfile.updatedAt,
      dataDiriIdentitas: initialProfile.dataDiriIdentitas,
      alamat: initialProfile.alamat,
      dokumenAdministratif: initialProfile.dokumenAdministratif,
      dataRekening: initialProfile.dataRekening,
      pendidikanDanPengembangan: initialProfile.pendidikanDanPengembangan,
    });

    if (lastResetKeyRef.current === resetKey) return;

    lastResetKeyRef.current = resetKey;
    form.reset(normalizeEmployeeProfileToFormValues(initialProfile));
  }, [initialProfile, firebaseUser?.uid, form]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [uploadStatusByField, setUploadStatusByField] = useState<
    Record<string, boolean>
  >({});
  const [uploadErrorsByField, setUploadErrorsByField] = useState<
    Record<string, string>
  >({});
  const [uploadMetadataByField, setUploadMetadataByField] = useState<
    Record<string, FileMetadata>
  >({});

  const setUploadStatus = (
    fieldKey: string,
    status: "uploading" | "success" | "error",
    errorMessage?: string,
  ) => {
    setUploadStatusByField((prev) => ({
      ...prev,
      [fieldKey]: status === "uploading",
    }));
    setUploadErrorsByField((prev) => {
      const next = { ...prev };
      if (status === "error") {
        next[fieldKey] = errorMessage || "Upload dokumen gagal.";
      } else {
        delete next[fieldKey];
      }
      return next;
    });
  };

  const setUploadMetadata = (
    fieldKey: string,
    metadata: FileMetadata | null,
  ) => {
    setUploadMetadataByField((prev) => {
      const next = { ...prev };
      if (metadata) {
        next[fieldKey] = metadata;
      } else {
        delete next[fieldKey];
      }
      return next;
    });
  };

  const isAnyUploadInProgress =
    Object.values(uploadStatusByField).some(Boolean);
  const hasUploadErrors = Object.keys(uploadErrorsByField).length > 0;

  const watchedAddressKtp = form.watch("alamat.ktp");
  const watchedDomicileSame = form.watch("alamat.isDomicileSameAsKtp");
  const watchedHasPhysicalCondition = form.watch(
    "dataDiriIdentitas.hasPhysicalCondition",
  );
  const watchedNationality = form.watch("dataDiriIdentitas.nationality");

  const watchedGender = form.watch("dataDiriIdentitas.gender");
  const watchedReligion = form.watch("dataDiriIdentitas.religion");
  const watchedMaritalStatus = form.watch("dataDiriIdentitas.maritalStatus");

  const watchedNoNpwp = form.watch("dokumenAdministratif.noNpwp");
  const watchedNpwpFilePending = form.watch(
    "dokumenAdministratif.npwpFilePending",
  );
  const watchedNoBpjsKs = form.watch("dokumenAdministratif.noBpjsKesehatan");
  const watchedNoBpjsTk = form.watch(
    "dokumenAdministratif.noBpjsKetenagakerjaan",
  );

  useEffect(() => {
    if (!watchedDomicileSame) return;
    const ktp = form.getValues("alamat.ktp");
    form.setValue("alamat.domisili", ktp);
  }, [watchedDomicileSame, watchedAddressKtp, form]);

  const cleanUndefinedValues = (value: any): any => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) {
      return value
        .map(cleanUndefinedValues)
        .filter((item) => item !== undefined);
    }
    const isPlainObject =
      typeof value === "object" &&
      value !== null &&
      value.constructor === Object;
    if (isPlainObject) {
      return Object.fromEntries(
        Object.entries(value)
          .map(([key, nestedValue]) => [key, cleanUndefinedValues(nestedValue)])
          .filter(([, nestedValue]) => nestedValue !== undefined),
      );
    }
    return value;
  };

  const saveEmployeeProfile = async (values: FormValues, isDraft: boolean) => {
    if (!firebaseUser) {
      throw new Error("Authentication not found.");
    }

    const batch = writeBatch(firestore);
    const employeeProfileRef = doc(
      firestore,
      "employee_profiles",
      firebaseUser.uid,
    );
    const userRef = doc(firestore, "users", firebaseUser.uid);

    // Check for verification changes
    const initialValues = normalizeEmployeeProfileToFormValues(initialProfile);
    const isDifferent = (a: any, b: any) =>
      JSON.stringify(cleanUndefinedValues(a)) !==
      JSON.stringify(cleanUndefinedValues(b));

    const currentVerificationStatus = initialProfile.verificationStatus || {};
    const newVerificationStatus: any = { ...currentVerificationStatus };
    const changedGroups: string[] = [];

    const checkAndLogChange = (group: string, oldVal: any, newVal: any) => {
      if (isDifferent(oldVal, newVal)) {
        newVerificationStatus[group] = "pending";
        changedGroups.push(group);
      }
    };

    if (!isDraft) {
      checkAndLogChange(
        "bankAccount",
        initialValues.dataRekening,
        values.dataRekening,
      );
      checkAndLogChange(
        "identity",
        initialValues.dataDiriIdentitas,
        values.dataDiriIdentitas,
      );

      const oldTax = {
        noNpwp: initialValues.dokumenAdministratif.noNpwp,
        npwp: initialValues.dokumenAdministratif.npwp,
        npwpPhotoUrl: initialValues.dokumenAdministratif.npwpPhotoUrl,
      };
      const newTax = {
        noNpwp: values.dokumenAdministratif.noNpwp,
        npwp: values.dokumenAdministratif.npwp,
        npwpPhotoUrl: values.dokumenAdministratif.npwpPhotoUrl,
      };
      checkAndLogChange("tax", oldTax, newTax);

      const oldBpjs = {
        noBpjsKs: initialValues.dokumenAdministratif.noBpjsKesehatan,
        bpjsKs: initialValues.dokumenAdministratif.bpjsKesehatan,
        bpjsKsUrl: initialValues.dokumenAdministratif.bpjsKesehatanPhotoUrl,
        noBpjsTk: initialValues.dokumenAdministratif.noBpjsKetenagakerjaan,
        bpjsTk: initialValues.dokumenAdministratif.bpjsKetenagakerjaan,
        bpjsTkUrl:
          initialValues.dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl,
      };
      const newBpjs = {
        noBpjsKs: values.dokumenAdministratif.noBpjsKesehatan,
        bpjsKs: values.dokumenAdministratif.bpjsKesehatan,
        bpjsKsUrl: values.dokumenAdministratif.bpjsKesehatanPhotoUrl,
        noBpjsTk: values.dokumenAdministratif.noBpjsKetenagakerjaan,
        bpjsTk: values.dokumenAdministratif.bpjsKetenagakerjaan,
        bpjsTkUrl: values.dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl,
      };
      checkAndLogChange("bpjs", oldBpjs, newBpjs);

      checkAndLogChange(
        "education",
        initialValues.pendidikanDanPengembangan?.pendidikanTerakhir,
        values.pendidikanDanPengembangan?.pendidikanTerakhir,
      );
      checkAndLogChange("address", initialValues.alamat, values.alamat);
      checkAndLogChange(
        "family",
        initialValues.dataKeluarga,
        values.dataKeluarga,
      );
      checkAndLogChange(
        "emergencyContact",
        initialValues.kontakDarurat,
        values.kontakDarurat,
      );
      checkAndLogChange(
        "familyDocuments",
        initialValues.familyDocuments,
        values.familyDocuments,
      );
    }

    const getRegionValue = (region: any) =>
      region && region.id && region.name
        ? { id: region.id, name: region.name }
        : null;

    const resolveDocumentMetadata = (
      fieldKey: string,
      url?: string,
    ): {
      fileId?: string;
      fileName?: string;
      fileType?: string;
      finalSize?: number;
      uploadedAt?: any;
      viewUrl?: string;
    } => {
      const metadata = uploadMetadataByField[fieldKey];
      if (metadata?.fileId) {
        return {
          fileId: metadata.fileId,
          fileName: metadata.fileName,
          fileType: metadata.fileType,
          finalSize: metadata.finalSize,
          uploadedAt: metadata.uploadedAt,
          viewUrl: metadata.viewUrl,
        };
      }
      if (!url) return {};
      const fileId = extractFileIdFromViewUrl(url);
      return fileId ? { fileId, viewUrl: url } : {};
    };

    const employeeDocuments = [
      {
        name: "NPWP",
        url: values.dokumenAdministratif.npwpPhotoUrl,
        type: "npwp",
        ...resolveDocumentMetadata(
          "npwp",
          values.dokumenAdministratif.npwpPhotoUrl,
        ),
      },
      {
        name: "BPJS Kesehatan",
        url: values.dokumenAdministratif.bpjsKesehatanPhotoUrl,
        type: "bpjs_ks",
        ...resolveDocumentMetadata(
          "bpjs_kesehatan",
          values.dokumenAdministratif.bpjsKesehatanPhotoUrl,
        ),
      },
      {
        name: "BPJS Ketenagakerjaan",
        url: values.dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl,
        type: "bpjs_tk",
        ...resolveDocumentMetadata(
          "bpjs_ketenagakerjaan",
          values.dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl,
        ),
      },
      {
        name: "Bukti Rekening",
        url: values.dataRekening.bankDocumentUrl,
        type: "bank_proof",
        ...resolveDocumentMetadata(
          "bank_proof",
          values.dataRekening.bankDocumentUrl,
        ),
      },
      {
        name: "KTP",
        url: values.dataDiriIdentitas.ktpPhotoUrl,
        type: "ktp",
        ...resolveDocumentMetadata(
          "ktp_photo",
          values.dataDiriIdentitas.ktpPhotoUrl,
        ),
      },
      ...(values.pendidikanDanPengembangan?.riwayatPendidikan
        ?.filter((p: any) => p.ijazahUrl)
        .map((p: any) => ({
          name: `Ijazah ${p.jenjang || ""}`,
          url: p.ijazahUrl,
          type: "education_ijazah",
        })) || []),
      ...(values.pendidikanDanPengembangan?.pendidikanTerakhir?.ijazahUrl
        ? [
            {
              name: "Ijazah Terakhir",
              url: values.pendidikanDanPengembangan.pendidikanTerakhir
                .ijazahUrl,
              type: "education_ijazah_last",
            },
          ]
        : []),
      {
        name: "Kartu Keluarga",
        url: values.familyDocuments?.kk?.fileUrl,
        type: "family_kk",
        ...resolveDocumentMetadata("kk", values.familyDocuments?.kk?.fileUrl),
      },
      {
        name: "Buku/Akta Nikah",
        url: values.familyDocuments?.marriageCertificate?.fileUrl,
        type: "family_marriage_cert",
        ...resolveDocumentMetadata(
          "marriage_cert",
          values.familyDocuments?.marriageCertificate?.fileUrl,
        ),
      },
      {
        name: "KTP Pasangan",
        url: values.familyDocuments?.spouseKtp?.fileUrl,
        type: "family_spouse_ktp",
        ...resolveDocumentMetadata(
          "spouse_ktp",
          values.familyDocuments?.spouseKtp?.fileUrl,
        ),
      },
      ...(values.familyDocuments?.familyBpjsMembers || []).map((m: any) => ({
        name: `BPJS: ${m.dependentName} (${m.relationship})`,
        url: m.fileUrl,
        type: "family_bpjs_member",
      })),
      ...(values.familyDocuments?.childBirthCertificates || []).map(
        (c: any) => ({
          name: `Akta Lahir: ${c.childName}`,
          url: c.fileUrl,
          type: "family_child_birth_cert",
        }),
      ),
      ...(values.familyDocuments?.additionalDocuments || []).map((d: any) => ({
        name:
          d.documentType === "Dokumen Lainnya"
            ? d.documentName || "Dokumen Lainnya"
            : d.documentType || "Dokumen Keluarga Tambahan",
        url: d.fileUrl,
        type: "family_additional_doc",
      })),
    ].filter((doc) => doc.url);

    const employeePayload = cleanUndefinedValues({
      uid: firebaseUser.uid,
      dataDiriIdentitas: values.dataDiriIdentitas,
      alamat: {
        ...values.alamat,
        ktp: {
          ...values.alamat.ktp,
          provinsi: getRegionValue(values.alamat.ktp?.provinsi),
          kabupatenKota: getRegionValue(values.alamat.ktp?.kabupatenKota),
          kecamatan: getRegionValue(values.alamat.ktp?.kecamatan),
          kelurahan: getRegionValue(values.alamat.ktp?.kelurahan),
        },
        domisili: {
          ...values.alamat.domisili,
          provinsi: getRegionValue(values.alamat.domisili?.provinsi),
          kabupatenKota: getRegionValue(values.alamat.domisili?.kabupatenKota),
          kecamatan: getRegionValue(values.alamat.domisili?.kecamatan),
          kelurahan: getRegionValue(values.alamat.domisili?.kelurahan),
        },
      },
      dokumenAdministratif: values.dokumenAdministratif,
      dataRekening: values.dataRekening,
      dataKeluarga: values.dataKeluarga,
      kontakDarurat: values.kontakDarurat,
      familyDocuments: values.familyDocuments,
      pendidikanDanPengembangan: values.pendidikanDanPengembangan || {},
      employeeDocuments,
      updatedAt: serverTimestamp(),
      completeness: isDraft
        ? { isComplete: false }
        : { isComplete: true, completedAt: serverTimestamp() },
      fullName: values.dataDiriIdentitas.fullName,
      phone: values.dataDiriIdentitas.phone,
      ...(Object.keys(newVerificationStatus).length > 0
        ? { verificationStatus: newVerificationStatus }
        : {}),
    });

    console.log("Firestore payload preparation", {
      uid: firebaseUser.uid,
      isDraft,
      employeePayload,
    });

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

    console.log("Simpan draft diklik", {
      isSavingDraft,
      isSaving,
      isNavigating,
      isAnyUploadInProgress,
      hasUploadErrors,
    });
    if (isAnyUploadInProgress) {
      toast({
        variant: "destructive",
        title: "File masih diunggah",
        description:
          "Silakan tunggu sampai semua dokumen selesai diunggah sebelum menyimpan draft.",
      });
      return;
    }
    if (hasUploadErrors) {
      toast({
        variant: "destructive",
        title: "Upload dokumen gagal",
        description:
          "Beberapa unggahan dokumen mengalami masalah. Perbaiki dan coba lagi sebelum menyimpan.",
      });
      return;
    }
    setIsSavingDraft(true);
    const values = form.getValues();
    console.log("Draft payload", { values });
    try {
      await saveEmployeeProfile(values, true);
      toast({
        title: "Draft Tersimpan",
        description: "Data Anda telah disimpan sebagai draft.",
      });
    } catch (error: any) {
      console.error("handleSaveDraft error:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Draft",
        description:
          error?.message ||
          "Tidak dapat menyimpan draft. Periksa koneksi atau hak akses Anda.",
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

    console.log("Submit diklik", {
      values,
      isAnyUploadInProgress,
      hasUploadErrors,
    });
    if (isAnyUploadInProgress) {
      toast({
        variant: "destructive",
        title: "File masih diunggah",
        description:
          "Silakan tunggu sampai semua dokumen selesai diunggah sebelum menyimpan profil.",
      });
      return;
    }
    if (hasUploadErrors) {
      toast({
        variant: "destructive",
        title: "Upload dokumen gagal",
        description:
          "Beberapa unggahan dokumen mengalami masalah. Perbaiki dan coba lagi sebelum menyimpan.",
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
      console.error("handleSubmit error:", e);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Profil",
        description:
          e?.message ||
          "Tidak dapat menyimpan profil. Periksa koneksi atau hak akses Anda.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const flattenFieldErrors = (
    errors: FieldErrors<any>,
    parentPath = "",
  ): Array<{ path: string; message: string }> => {
    return Object.entries(errors).flatMap(([key, error]) => {
      const path = parentPath ? `${parentPath}.${key}` : key;
      if (!error || typeof error !== "object") {
        return [];
      }
      if ("message" in error && error.message) {
        return [{ path, message: String(error.message) }];
      }
      if (error.types && typeof error.types === "object") {
        return Object.values(error.types)
          .filter((message): message is string => typeof message === "string")
          .map((message) => ({ path, message }));
      }
      return flattenFieldErrors(error as FieldErrors<any>, path);
    });
  };

  const getReadableLabel = (path: string) => {
    const LABEL_OVERRIDES: Record<string, string> = {
      "dataDiriIdentitas.nik": "Nomor KTP",
      "dataDiriIdentitas.birthDate": "Tanggal Lahir",
      "dataDiriIdentitas.profilePhotoUrl": "Foto Diri",
      "dataDiriIdentitas.ktpPhotoUrl": "Foto KTP",
      "dataDiriIdentitas.fullName": "Nama Lengkap",
      "dataDiriIdentitas.nickName": "Nama Panggilan",
      "dataDiriIdentitas.birthPlace": "Tempat Lahir",
    };
    return (
      LABEL_OVERRIDES[path] ||
      path
        .split(".")
        .pop()
        ?.replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase()) ||
      path
    );
  };

  const showValidationErrors = (errors: FieldErrors<FormValues>) => {
    const invalidFields = flattenFieldErrors(errors);
    if (!invalidFields.length) return;

    const descriptions = invalidFields.slice(0, 3).map((item) => {
      return `${getReadableLabel(item.path)}: ${item.message}`;
    });
    const description =
      descriptions.join("; ") +
      (invalidFields.length > 3
        ? `; dan ${invalidFields.length - 3} lainnya.`
        : "");

    toast({
      variant: "destructive",
      title: "Validasi Gagal",
      description,
    });

    const firstField = invalidFields[0];
    if (firstField) {
      form.setFocus(firstField.path as any);
    }
  };

  const onInvalid: (errors: FieldErrors<FormValues>) => void = (errors) => {
    showValidationErrors(errors);
  };

  const stepCount = STEP_CONFIG.length;
  const currentStepConfig = STEP_CONFIG[currentStep];

  const handleNext = async () => {
    console.log("Lanjutkan diklik", {
      currentStep,
      isNavigating,
      isSaving,
      isSavingDraft,
      isAnyUploadInProgress,
      hasUploadErrors,
    });

    if (isNavigating || isSaving || isSavingDraft) {
      toast({
        variant: "destructive",
        title: "Tunggu proses berjalan",
        description:
          "Silakan selesaikan proses yang sedang berjalan sebelum melanjutkan.",
      });
      return;
    }

    if (isAnyUploadInProgress) {
      toast({
        variant: "destructive",
        title: "File masih diunggah",
        description:
          "Silakan tunggu sampai semua unggahan dokumen selesai sebelum melanjutkan.",
      });
      return;
    }

    if (hasUploadErrors) {
      toast({
        variant: "destructive",
        title: "Upload dokumen gagal",
        description:
          "Beberapa unggahan dokumen mengalami masalah. Periksa kembali dan coba lagi.",
      });
      return;
    }

    const isValid = await form.trigger(
      currentStepConfig.fields as unknown as Array<keyof FormValues>,
    );
    console.log("Hasil validasi langkah", { currentStep, isValid });

    const profilePhotoMetadata = uploadMetadataByField["profile_photo"];
    const ktpPhotoMetadata = uploadMetadataByField["ktp_photo"];
    const profilePhotoFileId =
      profilePhotoMetadata?.fileId ||
      extractFileIdFromViewUrl(
        form.getValues("dataDiriIdentitas.profilePhotoUrl"),
      );
    const ktpPhotoFileId =
      ktpPhotoMetadata?.fileId ||
      extractFileIdFromViewUrl(form.getValues("dataDiriIdentitas.ktpPhotoUrl"));

    console.log("Lanjutkan metadata", {
      profilePhotoMetadata,
      ktpPhotoMetadata,
      profilePhotoFileId,
      ktpPhotoFileId,
      currentStep,
      isValid,
    });

    if (!isValid) {
      showValidationErrors(form.formState.errors);
      return;
    }

    if (currentStep === 0) {
      if (!profilePhotoFileId) {
        toast({
          variant: "destructive",
          title: "Foto Diri belum lengkap",
          description: "Foto Diri belum memiliki fileId. Silakan unggah ulang.",
        });
        form.setFocus("dataDiriIdentitas.profilePhotoUrl" as any);
        return;
      }
      if (!ktpPhotoFileId) {
        toast({
          variant: "destructive",
          title: "Foto KTP belum lengkap",
          description: "Foto KTP belum memiliki fileId. Silakan unggah ulang.",
        });
        form.setFocus("dataDiriIdentitas.ktpPhotoUrl" as any);
        return;
      }
    }

    setIsNavigating(true);
    try {
      const values = form.getValues();
      await saveEmployeeProfile(values, true);
      setCurrentStep((prev) => Math.min(prev + 1, stepCount - 1));
    } catch (error: any) {
      console.error("handleNext error:", error);
      const message =
        error?.message ||
        "Gagal menyimpan progres. Periksa koneksi atau izin Firestore Anda.";
      toast({
        variant: "destructive",
        title: "Gagal melanjutkan",
        description: message,
      });
    } finally {
      setIsNavigating(false);
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

              <VerificationAlert
                status={initialProfile.verificationStatus?.identity}
                note={initialProfile.verificationNotes?.identity}
                title="Identitas Resmi"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 pt-6">
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
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jenis kelamin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GENDER_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
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
                      <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                        Status Pernikahan
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-slate-950/40 border-slate-800">
                            <SelectValue placeholder="Pilih status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-900 border-slate-800">
                          {MARITAL_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
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
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih agama" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RELIGION_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
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
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih kewarganegaraan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {NATIONALITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
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
                  name="dataDiriIdentitas.golonganDarah"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Golongan Darah</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
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
                  name="dataDiriIdentitas.tinggiBadan"
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
                  name="dataDiriIdentitas.beratBadan"
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
                        value={field.value || ""}
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
                <div className="lg:col-span-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      Nomor KTP (NIK)
                    </FormLabel>
                    {pendingRequests.ktp ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                      >
                        Menunggu Review
                      </Badge>
                    ) : (
                      isIdentityVerified &&
                      form.watch("dataDiriIdentitas.nik") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openChangeRequest("ktp")}
                          className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                        >
                          Ajukan Perubahan KTP
                        </Button>
                      )
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.nik"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={
                              !!pendingRequests.ktp || isIdentityVerified
                            }
                            value={field.value ?? ""}
                            placeholder="16 digit NIK"
                            maxLength={16}
                            inputMode="numeric"
                            className={`bg-slate-950/40 ${fieldState.error ? "border-red-500 ring-1 ring-red-500 focus:ring-red-500" : "border-slate-800"}`}
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
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FileUploadField
                          label="Foto Diri"
                          description="Unggah foto formal dengan latar belakang polos."
                          userId={firebaseUser?.uid ?? ""}
                          fieldKey="profile_photo"
                          value={field.value}
                          onChange={field.onChange}
                          icon={Camera}
                          status={field.value ? "Sudah Upload" : "Belum Upload"}
                          hasError={!!fieldState.error}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dataDiriIdentitas.ktpPhotoUrl"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FileUploadField
                          label="Foto KTP"
                          description="Unggah foto KTP asli yang terlihat jelas."
                          userId={firebaseUser?.uid ?? ""}
                          fieldKey="ktp_photo"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={!!pendingRequests.ktp || isIdentityVerified}
                          icon={CreditCard}
                          status={field.value ? "Sudah Upload" : "Belum Upload"}
                          hasError={!!fieldState.error}
                        />
                        <FormMessage />
                      </FormItem>
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

              <VerificationAlert
                status={initialProfile.verificationStatus?.address}
                note={initialProfile.verificationNotes?.address}
                title="Alamat Lengkap"
              />

              <RegionSelector form={form} basePath="alamat.ktp" />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <FormField
                  control={form.control}
                  name="alamat.ktp.street"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Jalan / Nama Jalan</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Jl. Raya Utama No. 123"
                          className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.ktp.rt"
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
                          className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.ktp.rw"
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
                          className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alamat.ktp.kodePos"
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
                          className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
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

                  <RegionSelector form={form} basePath="alamat.domisili" />

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <FormField
                      control={form.control}
                      name="alamat.domisili.street"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Jalan / Nama Jalan</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="Jl. Raya Utama No. 123"
                              className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="alamat.domisili.rt"
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
                              className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="alamat.domisili.rw"
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
                              className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="alamat.domisili.kodePos"
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
                              className="bg-slate-950/40 rounded-xl h-11 border-slate-800"
                            />
                          </FormControl>
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
          <div
            key="step-dokumen"
            className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            <div className="space-y-2">
              <h4 className="text-xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
                <div className="h-2 w-2 rounded-full bg-primary" />
                Dokumen Administratif
              </h4>
              <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                Silahkan lengkapi dokumen administratif di bawah ini. Dokumen
                ini sangat penting untuk proses penggajian (payroll), pajak, dan
                asuransi kesehatan Anda.
              </p>
            </div>

            <VerificationAlert
              status={initialProfile.verificationStatus?.tax}
              note={initialProfile.verificationNotes?.tax}
              title="NPWP"
            />
            <VerificationAlert
              status={initialProfile.verificationStatus?.bpjs}
              note={initialProfile.verificationNotes?.bpjs}
              title="BPJS"
            />

            <div className="grid grid-cols-1 gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex flex-col gap-1">
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.noNpwp"
                      render={({ field }) => (
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            id="no-npwp"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="h-5 w-5 rounded-md border-slate-700 data-[state=checked]:bg-primary"
                          />
                          <Label
                            htmlFor="no-npwp"
                            className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                          >
                            Saya belum memiliki NPWP
                          </Label>
                        </div>
                      )}
                    />
                  </div>
                </div>

                {!form.watch("dokumenAdministratif.noNpwp") && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-6">
                    <div className="bg-slate-900/20 border border-slate-800/60 p-6 rounded-3xl relative">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Data Pajak (NPWP)
                        </h5>
                        {pendingRequests.pajak ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-3 py-1.5 rounded-xl"
                          >
                            <Clock className="w-3.5 h-3.5 mr-1.5" /> Menunggu
                            Review
                          </Badge>
                        ) : (
                          isTaxVerified &&
                          form.watch("dokumenAdministratif.npwp") &&
                          !form.watch("dokumenAdministratif.noNpwp") && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openChangeRequest("pajak")}
                              className="rounded-xl border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/10"
                            >
                              Ajukan Perubahan NPWP
                            </Button>
                          )
                        )}
                      </div>
                      <FormField
                        control={form.control}
                        name="dokumenAdministratif.npwp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                              Nomor NPWP (15 Digit)*
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                disabled={
                                  !!pendingRequests.pajak || isTaxVerified
                                }
                                placeholder="00.000.000.0-000.000"
                                className="bg-slate-950/40 h-12 rounded-xl border-slate-800 focus:border-primary/50 transition-all font-mono tracking-wider"
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
                    </div>

                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.npwpPhotoUrl"
                      render={({ field }) => (
                        <FileUploadField
                          label="Bukti NPWP"
                          description="Foto atau scan kartu NPWP asli yang jelas."
                          userId={firebaseUser?.uid || ""}
                          fieldKey="npwp"
                          value={field.value}
                          disabled={!!pendingRequests.pajak || isTaxVerified}
                          onChange={field.onChange}
                          icon={CreditCard}
                          status={field.value ? "Sudah Upload" : "Belum Upload"}
                        />
                      )}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <FormField
                    control={form.control}
                    name="dokumenAdministratif.noBpjsKesehatan"
                    render={({ field }) => (
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="no-bpjs-ks"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="h-5 w-5 rounded-md border-slate-700 data-[state=checked]:bg-blue-500"
                        />
                        <Label
                          htmlFor="no-bpjs-ks"
                          className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                        >
                          Saya belum memiliki BPJS Kesehatan
                        </Label>
                      </div>
                    )}
                  />
                  {pendingRequests.bpjs_ks ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                    >
                      Menunggu Review
                    </Badge>
                  ) : (
                    isBpjsVerified &&
                    form.watch("dokumenAdministratif.bpjsKesehatan") &&
                    !form.watch("dokumenAdministratif.noBpjsKesehatan") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openChangeRequest("bpjs_ks")}
                        className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                      >
                        Ajukan Perubahan BPJS Kes
                      </Button>
                    )
                  )}
                </div>

                {!form.watch("dokumenAdministratif.noBpjsKesehatan") && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-6">
                    <div className="bg-slate-900/20 border border-slate-800/60 p-6 rounded-3xl">
                      <FormField
                        control={form.control}
                        name="dokumenAdministratif.bpjsKesehatan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                              Nomor BPJS Kesehatan*
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                disabled={
                                  !!pendingRequests.bpjs_ks || isBpjsVerified
                                }
                                placeholder="0001234567890"
                                className="bg-slate-950/40 h-12 rounded-xl border-slate-800 focus:border-blue-500/50 transition-all font-mono tracking-wider"
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
                    </div>

                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKesehatanPhotoUrl"
                      render={({ field }) => (
                        <FileUploadField
                          label="Kartu BPJS Kesehatan"
                          description="Foto atau scan kartu BPJS Kesehatan atau screenshot Mobile JKN."
                          userId={firebaseUser?.uid || ""}
                          fieldKey="bpjs_kesehatan"
                          value={field.value}
                          disabled={!!pendingRequests.bpjs_ks || isBpjsVerified}
                          onChange={field.onChange}
                          icon={ShieldCheck}
                          status={field.value ? "Sudah Upload" : "Belum Upload"}
                        />
                      )}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <FormField
                    control={form.control}
                    name="dokumenAdministratif.noBpjsKetenagakerjaan"
                    render={({ field }) => (
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="no-bpjs-tk"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="h-5 w-5 rounded-md border-slate-700 data-[state=checked]:bg-green-500"
                        />
                        <Label
                          htmlFor="no-bpjs-tk"
                          className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                        >
                          Saya belum memiliki BPJS Ketenagakerjaan
                        </Label>
                      </div>
                    )}
                  />
                  {pendingRequests.bpjs_tk ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                    >
                      Menunggu Review
                    </Badge>
                  ) : (
                    isBpjsVerified &&
                    form.watch("dokumenAdministratif.bpjsKetenagakerjaan") &&
                    !form.watch(
                      "dokumenAdministratif.noBpjsKetenagakerjaan",
                    ) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openChangeRequest("bpjs_tk")}
                        className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                      >
                        Ajukan Perubahan BPJS TK
                      </Button>
                    )
                  )}
                </div>

                {!form.watch("dokumenAdministratif.noBpjsKetenagakerjaan") && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-6">
                    <div className="bg-slate-900/20 border border-slate-800/60 p-6 rounded-3xl">
                      <FormField
                        control={form.control}
                        name="dokumenAdministratif.bpjsKetenagakerjaan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                              Nomor BPJS Ketenagakerjaan*
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                disabled={
                                  !!pendingRequests.bpjs_tk || isBpjsVerified
                                }
                                placeholder="0001234567890"
                                className="bg-slate-950/40 h-12 rounded-xl border-slate-800 focus:border-green-500/50 transition-all font-mono tracking-wider"
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
                    </div>

                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.bpjsKetenagakerjaanPhotoUrl"
                      render={({ field }) => (
                        <FileUploadField
                          label="Kartu BPJS Ketenagakerjaan"
                          description="Foto atau scan kartu fisik atau kartu digital dari aplikasi JMO."
                          userId={firebaseUser?.uid || ""}
                          fieldKey="bpjs_ketenagakerjaan"
                          value={field.value}
                          disabled={!!pendingRequests.bpjs_tk || isBpjsVerified}
                          onChange={field.onChange}
                          icon={ShieldCheck}
                          status={field.value ? "Sudah Upload" : "Belum Upload"}
                        />
                      )}
                    />
                  </div>
                )}
              </div>

              {requiresSim && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="bg-slate-900/20 border border-slate-800/60 p-6 rounded-3xl mb-6">
                    <FormField
                      control={form.control}
                      name="dokumenAdministratif.simNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                            Nomor SIM
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="Masukkan nomor SIM Anda"
                              className="bg-slate-950/40 h-12 rounded-xl border-slate-800"
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
                  </div>
                  <FormField
                    control={form.control}
                    name="dokumenAdministratif.simPhotoUrl"
                    render={({ field }) => (
                      <FileUploadField
                        label="Scan SIM"
                        description="Khusus untuk posisi yang memerlukan kendaraan operasional."
                        userId={firebaseUser?.uid || ""}
                        fieldKey="sim"
                        value={field.value}
                        onChange={field.onChange}
                        icon={CreditCard}
                        status={field.value ? "Sudah Upload" : "Belum Upload"}
                      />
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        );
      case 3:
        return (
          <div
            key="step-rekening"
            className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <Wallet className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-slate-100 tracking-tight">
                      Rekening Payroll
                    </h4>
                    <p className="text-sm text-slate-400 mt-1">
                      Data rekening yang digunakan untuk pengiriman gaji bulanan
                      Anda.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {pendingBankRequest ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-4 py-2 rounded-xl font-bold"
                    >
                      <Clock className="w-4 h-4 mr-2" /> Menunggu Persetujuan
                      HRD
                    </Badge>
                  ) : (
                    // Show button when all 4 core rekening fields are filled
                    // No need to wait for isBankVerified — verification may not always be set
                    !!form.watch("dataRekening.bankName") &&
                    !!form.watch("dataRekening.bankAccountNumber") &&
                    !!form.watch("dataRekening.bankAccountHolderName") &&
                    !!(
                      form.watch("dataRekening.bankDocumentUrl") ||
                      form.watch("dataRekening.buktiRekeningUrl")
                    ) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsBankRequestModalOpen(true)}
                        className="rounded-xl border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 h-11 px-6 font-bold"
                      >
                        Ajukan Perubahan Rekening
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/30 border border-slate-800/60 rounded-[2.5rem] p-8 md:p-10 shadow-xl space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="dataRekening.bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                          Nama Bank*
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={!!pendingBankRequest || isBankVerified}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                              <SelectValue placeholder="Pilih Bank" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-900 border-slate-800">
                            {INDONESIAN_BANKS.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dataRekening.bankAccountNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                          Nomor Rekening*
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!!pendingBankRequest || isBankVerified}
                            value={field.value ?? ""}
                            placeholder="Contoh: 1234567890"
                            className="bg-slate-950/40 h-12 rounded-xl border-slate-800"
                            inputMode="numeric"
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
                        <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                          Nama Pemilik Rekening*
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!!pendingBankRequest || isBankVerified}
                            value={field.value ?? ""}
                            className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                            placeholder="Sesuai yang tertera di buku tabungan"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <FormField
                    control={form.control}
                    name="dataRekening.bankDocumentUrl"
                    render={({ field }) => (
                      <FileUploadField
                        label="Bukti Rekening / Buku Tabungan"
                        description="Foto halaman depan buku tabungan atau screenshot detail rekening dari m-banking. Pastikan Nama dan Nomor Rekening terlihat jelas."
                        userId={firebaseUser?.uid || ""}
                        fieldKey="bank_proof"
                        value={field.value}
                        disabled={!!pendingBankRequest}
                        onChange={field.onChange}
                        icon={Wallet}
                        status={field.value ? "Sudah Upload" : "Belum Upload"}
                      />
                    )}
                  />
                </div>
              </div>
            </div>

            {isBankRequestModalOpen && (
              <BankChangeRequestModal
                open={isBankRequestModalOpen}
                onOpenChange={setIsBankRequestModalOpen}
                initialProfile={initialProfile}
                latestRequest={pendingBankRequest}
                onSuccess={fetchPendingRequests}
              />
            )}

            {isChangeRequestModalOpen && (
              <EmployeeDataChangeRequestModal
                open={isChangeRequestModalOpen}
                onOpenChange={setIsChangeRequestModalOpen}
                initialProfile={initialProfile}
                category={activeChangeCategory}
                onSuccess={fetchPendingRequests}
              />
            )}
          </div>
        );
      case 4:
        return (
          <div
            key="step-keluarga"
            className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-blue-500/5">
              <CardHeader className="bg-slate-900/40 border-b border-slate-800/60 p-8">
                <div className="flex items-center gap-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 shadow-inner">
                    <Users className="h-7 w-7" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-slate-100 tracking-tight">
                      Data Orang Tua
                    </CardTitle>
                    <CardDescription className="text-slate-400 mt-1 text-sm font-medium">
                      Informasi lengkap Ayah dan Ibu kandung Anda.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="p-6 pb-0">
                  <VerificationAlert
                    status={initialProfile.verificationStatus?.family}
                    note={initialProfile.verificationNotes?.family}
                    title="Data Keluarga"
                  />
                </div>
                <Tabs defaultValue="ayah" className="w-full">
                  <TabsList className="w-full justify-start rounded-none h-16 bg-slate-900/20 border-b border-slate-800/40 p-0">
                    <TabsTrigger
                      value="ayah"
                      className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-blue-500/5 text-slate-400 data-[state=active]:text-blue-400 font-bold uppercase tracking-widest text-xs transition-all duration-300"
                    >
                      Ayah Kandung
                    </TabsTrigger>
                    <TabsTrigger
                      value="ibu"
                      className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:bg-pink-500/5 text-slate-400 data-[state=active]:text-pink-400 font-bold uppercase tracking-widest text-xs transition-all duration-300"
                    >
                      Ibu Kandung
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="ayah"
                    className="p-10 space-y-8 animate-in fade-in duration-500"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Nama Lengkap Ayah
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="Nama sesuai KTP"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Kondisi
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih kondisi" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {PARENT_STATUS_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.birthPlace"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Tempat Lahir
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="Contoh: Jakarta"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.birthDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Tanggal Lahir
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                type="date"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.activityStatus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Aktivitas Saat Ini
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                              disabled={
                                form.watch(
                                  "dataKeluarga.orangTua.ayah.status",
                                ) === "Meninggal"
                              }
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih Aktivitas" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {PARENT_ACTIVITY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.occupation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Pekerjaan
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                              disabled={
                                form.watch(
                                  "dataKeluarga.orangTua.ayah.status",
                                ) === "Meninggal" ||
                                form.watch(
                                  "dataKeluarga.orangTua.ayah.activityStatus",
                                ) !== "Bekerja"
                              }
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih Pekerjaan" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {OCCUPATION_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Nomor Telepon
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="0812xxx"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                                disabled={
                                  form.watch(
                                    "dataKeluarga.orangTua.ayah.status",
                                  ) === "Meninggal"
                                }
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.education"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Pendidikan Terakhir
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih Pendidikan" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {EDUCATION_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ayah.address"
                        render={({ field }) => (
                          <FormItem className="col-span-1 md:col-span-2">
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Alamat Lengkap
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                placeholder="Masukkan alamat ayah"
                                className="bg-slate-900/40 rounded-xl border-slate-800/80 resize-none h-24"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent
                    value="ibu"
                    className="p-10 space-y-8 animate-in fade-in duration-500"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Nama Lengkap Ibu
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="Nama sesuai KTP"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Kondisi
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih kondisi" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {PARENT_STATUS_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.birthPlace"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Tempat Lahir
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="Contoh: Jakarta"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.birthDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Tanggal Lahir
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                type="date"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.activityStatus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Aktivitas Saat Ini
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                              disabled={
                                form.watch(
                                  "dataKeluarga.orangTua.ibu.status",
                                ) === "Meninggal"
                              }
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih Aktivitas" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {PARENT_ACTIVITY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.occupation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Pekerjaan
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                              disabled={
                                form.watch(
                                  "dataKeluarga.orangTua.ibu.status",
                                ) === "Meninggal" ||
                                form.watch(
                                  "dataKeluarga.orangTua.ibu.activityStatus",
                                ) !== "Bekerja"
                              }
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih Pekerjaan" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {OCCUPATION_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Nomor Telepon
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="0812xxx"
                                className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80"
                                disabled={
                                  form.watch(
                                    "dataKeluarga.orangTua.ibu.status",
                                  ) === "Meninggal"
                                }
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.education"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Pendidikan Terakhir
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-900/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih Pendidikan" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800">
                                {EDUCATION_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dataKeluarga.orangTua.ibu.address"
                        render={({ field }) => (
                          <FormItem className="col-span-1 md:col-span-2">
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Alamat Lengkap
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                placeholder="Masukkan alamat ibu"
                                className="bg-slate-900/40 rounded-xl border-slate-800/80 resize-none h-24"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <section className="space-y-8 pt-10">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
                      <FileText className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-100 tracking-tight">
                        Dokumen Pendukung Keluarga
                      </h4>
                      <p className="text-sm text-slate-400 mt-1">
                        Upload dokumen keluarga yang diperlukan untuk validasi
                        administrasi HRD.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {pendingRequests.legal_extra ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-4 py-2 rounded-xl font-bold"
                      >
                        <Clock className="w-4 h-4 mr-2" /> Menunggu Review HRD
                      </Badge>
                    ) : (
                      // Show only when verified AND at least one legal doc already exists
                      isFamilyVerified &&
                      (form.watch("familyDocuments.additionalDocuments") || [])
                        .length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openChangeRequest("legal_extra")}
                          className="rounded-xl border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 h-11 px-6 font-bold"
                        >
                          Ajukan Perubahan Dokumen Legal
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Kartu Keluarga (KK)
                    </FormLabel>
                    {pendingRequests.kk ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                      >
                        Menunggu Review
                      </Badge>
                    ) : (
                      isFamilyVerified &&
                      form.watch("familyDocuments.kk.fileUrl") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openChangeRequest("kk")}
                          className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                        >
                          Ajukan Perubahan KK
                        </Button>
                      )
                    )}
                  </div>
                  <FileUploadField
                    label="Kartu Keluarga (KK)*"
                    description="Upload scan/foto Kartu Keluarga yang masih berlaku."
                    value={form.watch("familyDocuments.kk.fileUrl")}
                    disabled={!!pendingRequests.kk || isFamilyVerified}
                    onChange={(url) => {
                      form.setValue("familyDocuments.kk.fileUrl", url);
                      form.setValue("familyDocuments.kk.status", "uploaded");
                      form.setValue(
                        "familyDocuments.kk.uploadedAt",
                        new Date(),
                      );
                    }}
                    userId={firebaseUser!.uid}
                    fieldKey="kk"
                    status={
                      form.watch("familyDocuments.kk.status") === "needs_review"
                        ? "Perlu Review HRD"
                        : form.watch("familyDocuments.kk.fileUrl")
                          ? "Sudah Upload"
                          : "Belum Upload"
                    }
                    helperText="Wajib untuk verifikasi data keluarga dan BPJS."
                    icon={FileText}
                  />
                </div>

                {watchedMaritalStatus === "Kawin" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Buku / Akta Nikah
                      </FormLabel>
                      {pendingRequests.marriage ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                        >
                          Menunggu Review
                        </Badge>
                      ) : (
                        isFamilyVerified &&
                        form.watch(
                          "familyDocuments.marriageCertificate.fileUrl",
                        ) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openChangeRequest("marriage")}
                            className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                          >
                            Ajukan Perubahan Akta Nikah
                          </Button>
                        )
                      )}
                    </div>
                    <FileUploadField
                      label="Buku Nikah / Akta Nikah"
                      description="Wajib diunggah jika status Anda Menikah/Cerai."
                      value={form.watch(
                        "familyDocuments.marriageCertificate.fileUrl",
                      )}
                      disabled={!!pendingRequests.marriage || isFamilyVerified}
                      onChange={(url) => {
                        form.setValue(
                          "familyDocuments.marriageCertificate.fileUrl",
                          url,
                        );
                        form.setValue(
                          "familyDocuments.marriageCertificate.status",
                          "uploaded",
                        );
                        form.setValue(
                          "familyDocuments.marriageCertificate.uploadedAt",
                          new Date(),
                        );
                      }}
                      userId={firebaseUser!.uid}
                      fieldKey="marriage_cert"
                      status={
                        form.watch(
                          "familyDocuments.marriageCertificate.status",
                        ) === "needs_review"
                          ? "Perlu Review HRD"
                          : form.watch(
                                "familyDocuments.marriageCertificate.fileUrl",
                              )
                            ? "Sudah Upload"
                            : "Belum Upload"
                      }
                      helperText="Digunakan untuk validasi hubungan keluarga dan data tanggungan."
                      icon={Heart}
                    />
                  </div>
                )}

                {(watchedMaritalStatus === "Kawin" ||
                  (tanggunganFields || []).some(
                    (t) => t.relation === "Istri" || t.relation === "Suami",
                  )) && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        KTP Pasangan
                      </FormLabel>
                      {pendingRequests.spouse_ktp ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                        >
                          Menunggu Review
                        </Badge>
                      ) : (
                        isFamilyVerified &&
                        form.watch("familyDocuments.spouseKtp.fileUrl") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openChangeRequest("spouse_ktp")}
                            className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                          >
                            Ajukan Perubahan KTP Pasangan
                          </Button>
                        )
                      )}
                    </div>
                    <FileUploadField
                      label="KTP Pasangan"
                      description="Upload scan/foto KTP asli Pasangan."
                      value={form.watch("familyDocuments.spouseKtp.fileUrl")}
                      disabled={
                        !!pendingRequests.spouse_ktp || isFamilyVerified
                      }
                      onChange={(url) => {
                        form.setValue("familyDocuments.spouseKtp.fileUrl", url);
                        form.setValue(
                          "familyDocuments.spouseKtp.status",
                          "uploaded",
                        );
                        form.setValue(
                          "familyDocuments.spouseKtp.uploadedAt",
                          new Date(),
                        );
                      }}
                      userId={firebaseUser!.uid}
                      fieldKey="spouse_ktp"
                      status={
                        form.watch("familyDocuments.spouseKtp.status") ===
                        "needs_review"
                          ? "Perlu Review HRD"
                          : form.watch("familyDocuments.spouseKtp.fileUrl")
                            ? "Sudah Upload"
                            : "Belum Upload"
                      }
                      helperText="Opsional, digunakan untuk validasi identitas pasangan."
                      icon={User}
                    />
                  </div>
                )}
              </div>

              {/* BPJS Kesehatan Keluarga Per Anggota */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-blue-500" />
                    <h5 className="text-base font-bold text-slate-200">
                      BPJS Kesehatan Keluarga
                    </h5>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendFamilyBpjsMember({
                        dependentId: `manual-${crypto.randomUUID()}`,
                        dependentName: "",
                        relationship: "Anak",
                        bpjsNumber: "",
                        fileUrl: "",
                        status: "missing",
                      })
                    }
                    className="rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Tambah BPJS
                    Anak/Tanggungan
                  </Button>
                </div>

                {(() => {
                  const hasDependents = (tanggunganFields || []).length > 0;
                  const isMarried = watchedMaritalStatus === "Kawin";

                  if (
                    !isMarried &&
                    !hasDependents &&
                    familyBpjsMemberFields.length === 0
                  ) {
                    return (
                      <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center space-y-3">
                        <ShieldCheck className="h-10 w-10 text-slate-700" />
                        <p className="text-slate-500 text-sm">
                          Tambahkan pasangan atau tanggungan terlebih dahulu
                          untuk mengunggah BPJS keluarga.
                        </p>
                      </div>
                    );
                  }

                  // Create a virtual list of members to show
                  const membersToShow: any[] = [];

                  // 1. Add Spouse if married
                  if (isMarried) {
                    const spouseFromTanggungan = (tanggunganFields || []).find(
                      (t) => t.relation === "Istri" || t.relation === "Suami",
                    );
                    const spouseId = spouseFromTanggungan?.id || "spouse-auto";
                    const spouseRel =
                      spouseFromTanggungan?.relation ||
                      (watchedGender === "Laki-laki" ? "Istri" : "Suami");

                    membersToShow.push({
                      id: spouseId,
                      name: spouseFromTanggungan?.name || "",
                      relation: spouseRel,
                      isAuto: true,
                      label: spouseFromTanggungan?.name || spouseRel,
                    });
                  }

                  // 2. Add Children from tanggungan
                  (tanggunganFields || []).forEach((t) => {
                    if (t.relation !== "Istri" && t.relation !== "Suami") {
                      membersToShow.push({
                        id: t.id,
                        name: t.name || "",
                        relation: t.relation,
                        isAuto: true,
                        label: t.name || `Anak ${t.childOrder || ""}`,
                      });
                    }
                  });

                  // 3. Add Manual Members from field array (excluding those that match auto IDs)
                  familyBpjsMemberFields.forEach((field, index) => {
                    const dependentId = form.watch(
                      `familyDocuments.familyBpjsMembers.${index}.dependentId`,
                    );
                    // Only add if not already in membersToShow
                    if (!membersToShow.some((m) => m.id === dependentId)) {
                      membersToShow.push({
                        id: field.id,
                        name: form.watch(
                          `familyDocuments.familyBpjsMembers.${index}.dependentName`,
                        ),
                        relation: form.watch(
                          `familyDocuments.familyBpjsMembers.${index}.relationship`,
                        ),
                        isAuto: false,
                        index,
                      });
                    }
                  });

                  // Ensure unique members by ID
                  const uniqueMembers = Array.from(
                    new Map(membersToShow.map((m) => [m.id, m])).values(),
                  );

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {uniqueMembers.map((member) => {
                        const memberBpjs =
                          (
                            form.watch("familyDocuments.familyBpjsMembers") ||
                            []
                          ).find((m: any) => m.dependentId === member.id) || {};

                        const memberIndex = member.isAuto ? -1 : member.index;

                        return (
                          <Card
                            key={`bpjs-${member.id}`}
                            className="border-slate-800 bg-slate-900/40 p-6 rounded-[2rem] relative overflow-hidden group"
                          >
                            {!member.isAuto && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  removeFamilyBpjsMember(member.index)
                                }
                                className="absolute top-4 right-4 h-8 w-8 p-0 text-slate-500 hover:text-red-400 z-10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}

                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity flex flex-col items-end gap-2">
                              <ShieldCheck className="h-12 w-12 text-blue-500" />
                              {pendingRequests.family_bpjs ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                                >
                                  Review
                                </Badge>
                              ) : (
                                isFamilyVerified &&
                                memberBpjs.fileUrl && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      openChangeRequest("family_bpjs")
                                    }
                                    className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                                  >
                                    Ajukan Perubahan
                                  </Button>
                                )
                              )}
                            </div>

                            <div className="space-y-6">
                              <div className="flex flex-col">
                                {member.isAuto ? (
                                  <>
                                    <span className="text-sm font-bold text-slate-200">
                                      {member.label}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-0.5">
                                      {member.relation}
                                    </span>
                                  </>
                                ) : (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <FormLabel className="text-[10px] font-bold uppercase text-slate-500">
                                        Nama
                                      </FormLabel>
                                      <Input
                                        placeholder="Nama..."
                                        value={
                                          form.watch(
                                            `familyDocuments.familyBpjsMembers.${member.index}.dependentName`,
                                          ) || ""
                                        }
                                        onChange={(e) =>
                                          form.setValue(
                                            `familyDocuments.familyBpjsMembers.${member.index}.dependentName`,
                                            e.target.value,
                                          )
                                        }
                                        className="bg-slate-950/40 border-slate-800 h-9 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <FormLabel className="text-[10px] font-bold uppercase text-slate-500">
                                        Hubungan
                                      </FormLabel>
                                      <Select
                                        onValueChange={(val) =>
                                          form.setValue(
                                            `familyDocuments.familyBpjsMembers.${member.index}.relationship`,
                                            val,
                                          )
                                        }
                                        value={
                                          form.watch(
                                            `familyDocuments.familyBpjsMembers.${member.index}.relationship`,
                                          ) || ""
                                        }
                                      >
                                        <FormControl>
                                          <SelectTrigger className="bg-slate-950/40 border-slate-800 h-9 rounded-xl text-xs">
                                            <SelectValue placeholder="Pilih..." />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                          {[
                                            "Suami",
                                            "Istri",
                                            "Anak",
                                            "Orang Tua",
                                            "Tanggungan Lainnya",
                                          ].map((rel) => (
                                            <SelectItem key={rel} value={rel}>
                                              {rel}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Nomor Kartu BPJS
                                  </FormLabel>
                                  <Input
                                    placeholder="Masukkan nomor BPJS..."
                                    value={memberBpjs.bpjsNumber || ""}
                                    onChange={(e) => {
                                      const currentMembers =
                                        form.getValues(
                                          "familyDocuments.familyBpjsMembers",
                                        ) || [];
                                      const existingIndex =
                                        currentMembers.findIndex(
                                          (m: any) =>
                                            m.dependentId === member.id,
                                        );
                                      const updatedMember = {
                                        ...memberBpjs,
                                        dependentId: member.id,
                                        dependentName: member.name,
                                        relationship: member.relation,
                                        bpjsNumber: e.target.value,
                                      };

                                      if (existingIndex > -1) {
                                        currentMembers[existingIndex] =
                                          updatedMember;
                                      } else {
                                        currentMembers.push(updatedMember);
                                      }
                                      form.setValue(
                                        "familyDocuments.familyBpjsMembers",
                                        currentMembers,
                                      );
                                    }}
                                    className="bg-slate-950/40 border-slate-800 h-10 rounded-xl"
                                  />
                                </div>

                                <FileUploadField
                                  label="Foto Kartu BPJS"
                                  description={`Upload scan kartu BPJS ${member.name || "anggota"}.`}
                                  value={memberBpjs.fileUrl}
                                  onChange={(url) => {
                                    const currentMembers =
                                      form.getValues(
                                        "familyDocuments.familyBpjsMembers",
                                      ) || [];
                                    const existingIndex =
                                      currentMembers.findIndex(
                                        (m: any) => m.dependentId === member.id,
                                      );
                                    const updatedMember = {
                                      ...memberBpjs,
                                      dependentId: member.id,
                                      dependentName: member.name,
                                      relationship: member.relation,
                                      fileUrl: url,
                                      status: "uploaded",
                                      uploadedAt: new Date(),
                                    };

                                    if (existingIndex > -1) {
                                      currentMembers[existingIndex] =
                                        updatedMember;
                                    } else {
                                      currentMembers.push(updatedMember);
                                    }
                                    form.setValue(
                                      "familyDocuments.familyBpjsMembers",
                                      currentMembers,
                                    );
                                  }}
                                  userId={firebaseUser!.uid}
                                  fieldKey={`family_bpjs_${member.id}`}
                                  status={
                                    memberBpjs.status === "needs_review"
                                      ? "Perlu Review HRD"
                                      : memberBpjs.fileUrl
                                        ? "Sudah Upload"
                                        : "Belum Upload"
                                  }
                                  helperText="Format: JPG, PNG, PDF (Max 10MB)"
                                  icon={ShieldCheck}
                                  disabled={
                                    !!pendingRequests.family_bpjs ||
                                    isFamilyVerified
                                  }
                                />
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Akta Kelahiran Anak */}
              {(tanggunganFields || []).some((t) => t.relation === "Anak") && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Baby className="h-5 w-5 text-amber-500" />
                    <h5 className="text-base font-bold text-slate-200">
                      Akta Kelahiran Anak
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(tanggunganFields || [])
                      .filter((t) => t.relation === "Anak")
                      .map((child, index) => {
                        const childDoc =
                          (
                            form.watch(
                              "familyDocuments.childBirthCertificates",
                            ) || []
                          ).find((d: any) => d.childName === child.name) || {};

                        return (
                          <div
                            key={`child-birth-cert-${child.id}`}
                            className="space-y-4"
                          >
                            <div className="flex items-center justify-between px-2">
                              <FormLabel className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Akta Kelahiran:{" "}
                                {child.name || `Anak ${index + 1}`}
                              </FormLabel>
                              {pendingRequests.birth_cert ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-2 py-1 rounded-lg text-[10px]"
                                >
                                  Menunggu Review
                                </Badge>
                              ) : (
                                isFamilyVerified &&
                                childDoc.fileUrl && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      openChangeRequest("birth_cert")
                                    }
                                    className="h-7 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 px-2"
                                  >
                                    Ajukan Perubahan Akta Anak
                                  </Button>
                                )
                              )}
                            </div>
                            <FileUploadField
                              label={`Akta Kelahiran: ${child.name || `Anak ${index + 1}`}`}
                              description={`Upload akta kelahiran untuk ${child.name || "anak Anda"}.`}
                              value={childDoc.fileUrl}
                              onChange={(url) => {
                                const currentDocs =
                                  form.getValues(
                                    "familyDocuments.childBirthCertificates",
                                  ) || [];
                                const existingIndex = currentDocs.findIndex(
                                  (d: any) => d.childName === child.name,
                                );
                                const newDoc = {
                                  childName: child.name,
                                  fileUrl: url,
                                  status: "uploaded",
                                  uploadedAt: new Date(),
                                };

                                if (existingIndex > -1) {
                                  currentDocs[existingIndex] = newDoc;
                                } else {
                                  currentDocs.push(newDoc);
                                }
                                form.setValue(
                                  "familyDocuments.childBirthCertificates",
                                  currentDocs,
                                );
                              }}
                              userId={firebaseUser!.uid}
                              fieldKey={`child_birth_cert_${index}`}
                              status={
                                childDoc.status === "needs_review"
                                  ? "Perlu Review HRD"
                                  : childDoc.fileUrl
                                    ? "Sudah Upload"
                                    : "Belum Upload"
                              }
                              helperText="Wajib jika anak dimasukkan sebagai tanggungan."
                              icon={Baby}
                              disabled={
                                !!pendingRequests.birth_cert || isFamilyVerified
                              }
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Dokumen Tambahan */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Plus className="h-5 w-5 text-slate-400" />
                    <h5 className="text-base font-bold text-slate-200">
                      Dokumen Tambahan Lainnya
                    </h5>
                  </div>
                  {additionalFamilyDocFields.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendAdditionalFamilyDoc({
                          documentType: "",
                          documentName: "",
                          fileUrl: "",
                          status: "missing",
                        })
                      }
                      className="rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Tambah Lagi
                    </Button>
                  )}
                </div>

                {additionalFamilyDocFields.length === 0 ? (
                  <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="h-16 w-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                      <FileText className="h-8 w-8" />
                    </div>
                    <div className="max-w-md">
                      <p className="text-slate-400 text-sm font-medium">
                        Belum ada dokumen tambahan. Tambahkan hanya jika
                        diperlukan.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        appendAdditionalFamilyDoc({
                          documentType: "",
                          documentName: "",
                          fileUrl: "",
                          status: "missing",
                        })
                      }
                      className="rounded-xl border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white px-8 h-12 font-bold shadow-lg transition-all"
                    >
                      <Plus className="mr-2 h-5 w-5" /> Tambah Dokumen Opsional
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {additionalFamilyDocFields.map((field, index) => {
                      const watchedType = form.watch(
                        `familyDocuments.additionalDocuments.${index}.documentType`,
                      );
                      return (
                        <Card
                          key={field.id}
                          className="border-slate-800 bg-slate-900/40 p-6 rounded-3xl relative animate-in fade-in slide-in-from-top-4 duration-500"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAdditionalFamilyDoc(index)}
                            className="absolute top-4 right-4 h-8 w-8 p-0 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-400/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>

                          <div className="space-y-6">
                            <FormField
                              control={form.control}
                              name={`familyDocuments.additionalDocuments.${index}.documentType`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                                    Jenis Dokumen
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/40 border-slate-800 h-12 rounded-xl">
                                        <SelectValue placeholder="Pilih jenis dokumen" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                      {FAMILY_DOCUMENT_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                          {type}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />

                            {watchedType === "Dokumen Lainnya" && (
                              <FormField
                                control={form.control}
                                name={`familyDocuments.additionalDocuments.${index}.documentName`}
                                render={({ field }) => (
                                  <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <FormLabel className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                                      Nama Dokumen Kustom
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        placeholder="Sebutkan nama dokumen..."
                                        className="bg-slate-950/40 border-slate-800 h-12 rounded-xl"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            )}

                            {watchedType && (
                              <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                                <FileUploadField
                                  label="File Dokumen"
                                  description="Pilih file dokumen pendukung."
                                  value={form.watch(
                                    `familyDocuments.additionalDocuments.${index}.fileUrl`,
                                  )}
                                  onChange={(url) => {
                                    form.setValue(
                                      `familyDocuments.additionalDocuments.${index}.fileUrl`,
                                      url,
                                    );
                                    form.setValue(
                                      `familyDocuments.additionalDocuments.${index}.status`,
                                      "uploaded",
                                    );
                                    form.setValue(
                                      `familyDocuments.additionalDocuments.${index}.uploadedAt`,
                                      new Date(),
                                    );
                                  }}
                                  userId={firebaseUser!.uid}
                                  fieldKey={`additional_family_doc_${index}`}
                                  status={
                                    form.watch(
                                      `familyDocuments.additionalDocuments.${index}.status`,
                                    ) === "needs_review"
                                      ? "Perlu Review HRD"
                                      : form.watch(
                                            `familyDocuments.additionalDocuments.${index}.fileUrl`,
                                          )
                                        ? "Sudah Upload"
                                        : "Belum Upload"
                                  }
                                  helperText="Format: JPG, PNG, PDF (Max 10MB)"
                                  icon={FileUp}
                                  disabled={
                                    !!pendingRequests.legal_extra ||
                                    isFamilyVerified
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <div className="space-y-6 pt-10 pb-10 border-b border-slate-800/40">
              <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <Heart className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-slate-100 tracking-tight">
                      Saudara Kandung
                    </h4>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-1">
                      Daftar Kakak & Adik Kandung (termasuk Anda)
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    appendSaudara({
                      id: crypto.randomUUID(),
                      name: "",
                      birthPlace: "",
                      birthDate: "",
                      education: "",
                      activityStatus: "",
                      occupation: "",
                      address: "",
                    })
                  }
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-6 h-11 shadow-lg shadow-emerald-500/20 transition-all duration-300"
                >
                  <Plus className="mr-2 h-5 w-5" /> Tambah Saudara
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {saudaraFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="group relative bg-slate-900/40 rounded-[2.5rem] border border-slate-800/60 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500/40 group-hover:bg-emerald-500 transition-colors duration-500" />

                    <div className="p-8 md:p-10">
                      <div className="flex items-center justify-between mb-10 pb-6 border-b border-slate-800/60">
                        <div className="flex items-center gap-4">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-emerald-400 font-black text-sm border border-slate-800/50 shadow-inner">
                            {index + 1}
                          </span>
                          <h5 className="text-lg font-bold text-slate-200 uppercase tracking-wider">
                            Saudara {index + 1}
                          </h5>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSaudara(index)}
                          className="h-10 w-10 rounded-xl hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-all duration-300"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-10 gap-y-8">
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.saudaraKandung.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Nama Lengkap
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Nama saudara"
                                  className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.saudaraKandung.${index}.order`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Anak Ke-
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  type="number"
                                  placeholder="Contoh: 1"
                                  className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-8">
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.saudaraKandung.${index}.birthPlace`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Tempat Lahir
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    placeholder="Contoh: Jakarta"
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.saudaraKandung.${index}.birthDate`}
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                    Tanggal Lahir
                                  </FormLabel>
                                </div>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    type="date"
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.saudaraKandung.${index}.activityStatus`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Status
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                      <SelectValue placeholder="Pilih Status" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-slate-900 border-slate-800">
                                    {SIBLING_ACTIVITY_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.saudaraKandung.${index}.education`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Pendidikan
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                    <SelectValue placeholder="Pilih Pendidikan" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                  {EDUCATION_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.saudaraKandung.${index}.occupation`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Pekerjaan
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                                disabled={
                                  form.watch(
                                    `dataKeluarga.saudaraKandung.${index}.activityStatus`,
                                  ) !== "Bekerja"
                                }
                              >
                                <FormControl>
                                  <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                    <SelectValue placeholder="Pilih Pekerjaan" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                  {OCCUPATION_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.saudaraKandung.${index}.address`}
                          render={({ field }) => (
                            <FormItem className="col-span-1 md:col-span-2">
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Alamat Lengkap
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Masukkan alamat saudara"
                                  className="bg-slate-950/40 rounded-xl border-slate-800/80 resize-none h-24"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6 pt-10 pb-10 border-b border-slate-800/40">
              <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-lg shadow-amber-500/5">
                    <Baby className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-slate-100 tracking-tight">
                      Tanggungan
                    </h4>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-1">
                      Data Pasangan & Anak
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    disabled={!!pendingRequests.kk}
                    onClick={() =>
                      appendTanggungan({
                        id: crypto.randomUUID(),
                        name: "",
                        relation: "",
                        childOrder: "",
                        birthPlace: "",
                        birthDate: "",
                        education: "",
                        activityStatus: "",
                        occupation: "",
                      })
                    }
                    className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 h-11 shadow-lg shadow-amber-500/20 transition-all duration-300"
                  >
                    <Plus className="mr-2 h-5 w-5" /> Tambah Tanggungan
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {tanggunganFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="group relative bg-slate-900/40 rounded-[2.5rem] border border-slate-800/60 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="absolute top-0 left-0 w-2 h-full bg-amber-500/40 group-hover:bg-amber-500 transition-colors duration-500" />

                    <div className="p-8 md:p-10">
                      <div className="flex items-center justify-between mb-10 pb-6 border-b border-slate-800/60">
                        <div className="flex items-center gap-4">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-amber-400 font-black text-sm border border-slate-800/50 shadow-inner">
                            {index + 1}
                          </span>
                          <h5 className="text-lg font-bold text-slate-200 uppercase tracking-wider">
                            Tanggungan {index + 1}
                          </h5>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTanggungan(index)}
                          className="h-10 w-10 rounded-xl hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-all duration-300"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.tanggungan.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Nama Lengkap
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Nama lengkap"
                                  className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.tanggungan.${index}.relation`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Hubungan
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                      <SelectValue placeholder="Pilih Hubungan" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-slate-900 border-slate-800">
                                    {["Istri", "Suami", "Anak"].map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.tanggungan.${index}.childOrder`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Anak Ke-
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    type="number"
                                    placeholder="-"
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                    disabled={
                                      form.watch(
                                        `dataKeluarga.tanggungan.${index}.relation`,
                                      ) !== "Anak"
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-8">
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.tanggungan.${index}.birthPlace`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Tempat Lahir
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    placeholder="Contoh: Jakarta"
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.tanggungan.${index}.birthDate`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Tanggal Lahir
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    value={field.value || ""}
                                    type="date"
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`dataKeluarga.tanggungan.${index}.activityStatus`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Status
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                      <SelectValue placeholder="Pilih Status" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-slate-900 border-slate-800">
                                    {SIBLING_ACTIVITY_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.tanggungan.${index}.education`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Pendidikan
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                    <SelectValue placeholder="Pilih Pendidikan" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                  {EDUCATION_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.tanggungan.${index}.occupation`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Pekerjaan
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                                disabled={
                                  form.watch(
                                    `dataKeluarga.tanggungan.${index}.activityStatus`,
                                  ) !== "Bekerja"
                                }
                              >
                                <FormControl>
                                  <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                    <SelectValue placeholder="Pilih Pekerjaan" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                  {OCCUPATION_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`dataKeluarga.tanggungan.${index}.address`}
                          render={({ field }) => (
                            <FormItem className="col-span-1 md:col-span-2">
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Alamat Lengkap
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Masukkan alamat tanggungan"
                                  className="bg-slate-950/40 rounded-xl border-slate-800/80 resize-none h-24"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6 pt-10 pb-10">
              <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/5">
                    <Phone className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                      Kontak Darurat
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-bold uppercase tracking-widest">
                        Wajib
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-1">
                      Siapa yang harus kami hubungi saat darurat?
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    appendDarurat({
                      id: crypto.randomUUID(),
                      name: "",
                      relation: "",
                      relationOther: "",
                      phone: "",
                      address: "",
                      priority:
                        daruratFields.length === 0 ? "Utama" : "Cadangan",
                    })
                  }
                  className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 h-11 shadow-lg shadow-primary/20 transition-all duration-300"
                >
                  <Plus className="mr-2 h-5 w-5" /> Tambah Kontak
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {daruratFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="group relative bg-slate-900/40 rounded-[2.5rem] border border-slate-800/60 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div
                      className={`absolute top-0 left-0 w-2 h-full transition-colors duration-500 ${form.watch(`kontakDarurat.${index}.priority`) === "Utama" ? "bg-primary" : "bg-slate-700 group-hover:bg-slate-600"}`}
                    />

                    <div className="p-8 md:p-10">
                      <div className="flex items-center justify-between mb-10 pb-6 border-b border-slate-800/60">
                        <div className="flex items-center gap-4">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-xl font-black text-sm border shadow-inner ${form.watch(`kontakDarurat.${index}.priority`) === "Utama" ? "bg-primary/10 text-primary border-primary/20" : "bg-slate-950 text-slate-400 border-slate-800/50"}`}
                          >
                            {index + 1}
                          </span>
                          <div>
                            <h5 className="text-lg font-bold text-slate-200 uppercase tracking-wider flex items-center gap-3">
                              Kontak {index + 1}
                              {form.watch(`kontakDarurat.${index}.priority`) ===
                                "Utama" && (
                                <span className="text-[9px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
                                  UTAMA
                                </span>
                              )}
                            </h5>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDarurat(index)}
                          className="h-10 w-10 rounded-xl hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-all duration-300"
                          disabled={daruratFields.length === 1}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                        <FormField
                          control={form.control}
                          name={`kontakDarurat.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Nama Lengkap*
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Contoh: Budi Santoso"
                                  className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`kontakDarurat.${index}.priority`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Prioritas Kontak*
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                    <SelectValue placeholder="Pilih Prioritas" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                  {EMERGENCY_PRIORITY_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name={`kontakDarurat.${index}.relation`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Hubungan*
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                      <SelectValue placeholder="Pilih Hubungan" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-slate-900 border-slate-800">
                                    {EMERGENCY_RELATION_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {form.watch(`kontakDarurat.${index}.relation`) ===
                            "Kerabat Lain" && (
                            <FormField
                              control={form.control}
                              name={`kontakDarurat.${index}.relationOther`}
                              render={({ field }) => (
                                <FormItem className="animate-in slide-in-from-top-2 duration-300">
                                  <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                    Hubungan Spesifik*
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      value={field.value || ""}
                                      placeholder="Sebutkan hubungan"
                                      className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                        <FormField
                          control={form.control}
                          name={`kontakDarurat.${index}.phone`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Nomor HP Indonesia*
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Contoh: 081234567890"
                                  className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                  onChange={(e) => {
                                    const cleaned = e.target.value.replace(
                                      /[^0-9]/g,
                                      "",
                                    );
                                    field.onChange(cleaned);
                                  }}
                                />
                              </FormControl>
                              <FormDescription className="text-[10px] text-slate-500 italic">
                                Gunakan format 08... atau 62...
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`kontakDarurat.${index}.address`}
                          render={({ field }) => (
                            <FormItem className="col-span-1 md:col-span-2">
                              <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                Alamat Lengkap
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="Masukkan alamat kontak darurat"
                                  className="bg-slate-950/40 rounded-xl border-slate-800/80 resize-none h-24"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div
            key="step-pendidikan"
            className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            <div className="space-y-6">
              <div className="space-y-1.5 px-2">
                <h4 className="text-xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  Pendidikan Terakhir
                </h4>
                <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                  Pendidikan terakhir wajib diisi. Data ini akan menjadi basis
                  kualifikasi utama Anda.
                </p>
              </div>

              <VerificationAlert
                status={initialProfile.verificationStatus?.education}
                note={initialProfile.verificationNotes?.education}
                title="Pendidikan Terakhir"
              />

              <div className="p-8 space-y-8 bg-slate-900/20 border-x border-b border-slate-800 rounded-b-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="pendidikanDanPengembangan.pendidikanTerakhir.jenjang"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                            Jenjang Pendidikan*
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                <SelectValue placeholder="Pilih jenjang" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-slate-900 border-slate-800">
                              {EDUCATION_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pendidikanDanPengembangan.pendidikanTerakhir.namaInstitusi"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                            Nama Sekolah/Universitas*
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                              placeholder="Contoh: Universitas Gadjah Mada"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="pendidikanDanPengembangan.pendidikanTerakhir.jurusan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Program Studi/Jurusan*
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                placeholder="Contoh: Teknik Informatika"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pendidikanDanPengembangan.pendidikanTerakhir.tahunLulus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                              Tahun Lulus*
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                  <SelectValue placeholder="Pilih tahun" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                {YEAR_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <FormField
                      control={form.control}
                      name="pendidikanDanPengembangan.pendidikanTerakhir.ijazahUrl"
                      render={({ field }) => (
                        <FileUploadField
                          label="Ijazah Terakhir"
                          description="Unggah scan ijazah asli atau legalisir. Pastikan Nama dan Tanggal Lulus terlihat jelas."
                          userId={firebaseUser?.uid || ""}
                          fieldKey="ijazah_terakhir"
                          value={field.value}
                          onChange={field.onChange}
                          icon={GraduationCap}
                          status={field.value ? "Sudah Upload" : "Belum Upload"}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-slate-800/50" />

            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-2">
                <div className="space-y-1.5">
                  <h4 className="text-xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                    Riwayat Pendidikan Lainnya
                  </h4>
                  <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                    Tambahkan riwayat pendidikan sebelumnya (SD, SMP, SMA, atau
                    kursus panjang).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    appendPendidikan({
                      id: crypto.randomUUID(),
                      jenjang: "",
                      namaInstitusi: "",
                      jurusan: "",
                      tahunLulus: "",
                      ijazahUrl: "",
                    })
                  }
                  className="rounded-2xl border-indigo-500/30 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 h-12 px-6 shadow-lg shadow-indigo-500/5 transition-all duration-300"
                >
                  <Plus className="mr-2 h-5 w-5" /> Tambah Pendidikan
                </Button>
              </div>

              <div className="space-y-8">
                {pendidikanFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="relative bg-slate-900/30 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-sm animate-in slide-in-from-right-4 duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="absolute top-10 left-0 w-1.5 h-12 bg-indigo-500/40 rounded-r-full" />
                    <div className="flex items-center justify-between p-8 sm:p-10 pb-0">
                      <h5 className="text-sm font-bold text-slate-300 uppercase tracking-[0.3em]">
                        Pendidikan #{index + 1}
                      </h5>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePendidikan(index)}
                        className="h-10 w-10 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="p-8 sm:p-10 space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name={`pendidikanDanPengembangan.riwayatPendidikan.${index}.jenjang`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                    Jenjang*
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                        <SelectValue placeholder="Jenjang" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                      {EDUCATION_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`pendidikanDanPengembangan.riwayatPendidikan.${index}.tahunLulus`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                    Tahun Lulus*
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                        <SelectValue placeholder="Pilih tahun" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                      {YEAR_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name={`pendidikanDanPengembangan.riwayatPendidikan.${index}.namaInstitusi`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Nama Sekolah/Universitas*
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                    placeholder="Nama Institusi"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`pendidikanDanPengembangan.riwayatPendidikan.${index}.jurusan`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Program Studi/Jurusan*
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                    placeholder="Contoh: Teknik Mesin"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div>
                          <FormField
                            control={form.control}
                            name={`pendidikanDanPengembangan.riwayatPendidikan.${index}.ijazahUrl`}
                            render={({ field }) => (
                              <FileUploadField
                                label={`Ijazah ${
                                  form.watch(
                                    `pendidikanDanPengembangan.riwayatPendidikan.${index}.jenjang`,
                                  ) || ""
                                }`}
                                description="Unggah scan ijazah asli atau legalisir."
                                userId={firebaseUser?.uid || ""}
                                fieldKey={`ijazah_riwayat_${index}`}
                                value={field.value}
                                onChange={field.onChange}
                                icon={FileText}
                                disabled={
                                  !!pendingRequests.birth_cert ||
                                  isFamilyVerified
                                }
                                status={
                                  field.value ? "Sudah Upload" : "Belum Upload"
                                }
                              />
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {pendidikanFields.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 rounded-[3rem] border-2 border-dashed border-slate-800/40 bg-slate-950/10 text-slate-500 space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-indigo-500/5 flex items-center justify-center border border-indigo-500/10">
                      <GraduationCap className="h-8 w-8 text-indigo-500/20" />
                    </div>
                    <div className="text-center max-w-sm px-6">
                      <p className="font-bold text-slate-300 text-lg tracking-tight">
                        Belum ada riwayat pendidikan tambahan
                      </p>
                      <p className="text-xs mt-2 text-slate-500 leading-relaxed italic">
                        Anda dapat menambahkan riwayat pendidikan lain jika
                        diperlukan.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-slate-800/50" />

            {/* Sertifikasi & Pelatihan */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-2">
                <div className="space-y-1.5">
                  <h4 className="text-xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    Sertifikasi & Pelatihan
                  </h4>
                  <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                    Tambahkan kompetensi tambahan atau sertifikasi profesional
                    yang Anda miliki.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    appendSertifikasi({
                      id: crypto.randomUUID(),
                      namaSertifikasi: "",
                      penyelenggara: "",
                      tahunPerolehan: "",
                      tahunExpired: "",
                      buktiUrl: "",
                    })
                  }
                  className="rounded-2xl border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 h-12 px-6 shadow-lg shadow-emerald-500/5 transition-all duration-300"
                >
                  <Plus className="mr-2 h-5 w-5" /> Tambah Sertifikasi
                </Button>
              </div>

              <div className="space-y-8">
                {sertifikasiFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="relative bg-slate-900/30 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-sm animate-in slide-in-from-right-4 duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="absolute top-10 left-0 w-1.5 h-12 bg-emerald-500/40 rounded-r-full" />

                    <div className="flex items-center justify-between p-8 sm:p-10 pb-0">
                      <h5 className="text-sm font-bold text-slate-300 uppercase tracking-[0.3em]">
                        Sertifikasi #{index + 1}
                      </h5>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSertifikasi(index)}
                        className="h-10 w-10 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="p-8 sm:p-10 space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <FormField
                            control={form.control}
                            name={`pendidikanDanPengembangan.sertifikasiPelatihan.${index}.namaSertifikasi`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Nama Sertifikasi/Pelatihan*
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                    placeholder="Nama Sertifikasi"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`pendidikanDanPengembangan.sertifikasiPelatihan.${index}.penyelenggara`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                  Penyelenggara*
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80"
                                    placeholder="Instansi Penyelenggara"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name={`pendidikanDanPengembangan.sertifikasiPelatihan.${index}.tahunPerolehan`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                    Tahun Perolehan*
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                        <SelectValue placeholder="Tahun" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                      {YEAR_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`pendidikanDanPengembangan.sertifikasiPelatihan.${index}.tahunExpired`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                    Masa Berlaku
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-slate-950/40 h-12 rounded-xl border-slate-800/80">
                                        <SelectValue placeholder="Expired" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                      {EXPIRED_YEAR_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div>
                          <FormField
                            control={form.control}
                            name={`pendidikanDanPengembangan.sertifikasiPelatihan.${index}.buktiUrl`}
                            render={({ field }) => (
                              <FileUploadField
                                label="File Sertifikat"
                                description="Unggah scan sertifikat asli. Pastikan Nama dan Masa Berlaku terlihat jelas."
                                userId={firebaseUser?.uid || ""}
                                fieldKey={`sertifikat_${index}`}
                                value={field.value}
                                onChange={field.onChange}
                                icon={Award}
                                status={
                                  field.value ? "Sudah Upload" : "Belum Upload"
                                }
                              />
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {sertifikasiFields.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 rounded-[3rem] border-2 border-dashed border-slate-800/40 bg-slate-950/10 text-slate-500 space-y-6">
                    <div className="h-16 w-16 rounded-2xl bg-emerald-500/5 flex items-center justify-center border border-emerald-500/10">
                      <Award className="h-8 w-8 text-emerald-500/20" />
                    </div>
                    <div className="text-center max-w-sm px-6">
                      <p className="font-bold text-slate-300 text-lg tracking-tight">
                        Belum ada sertifikasi yang ditambahkan
                      </p>
                      <p className="text-xs mt-2 text-slate-500 leading-relaxed italic">
                        Menambahkan sertifikasi dapat meningkatkan kredibilitas
                        profil profesional Anda.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
        <UploadStateContext.Provider
          value={{ setUploadStatus, setUploadMetadata }}
        >
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
                        disabled={isNavigating || isSaving || isSavingDraft}
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
        </UploadStateContext.Provider>
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
