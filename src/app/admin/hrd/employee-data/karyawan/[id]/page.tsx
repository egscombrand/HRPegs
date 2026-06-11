"use client";

import React, { useMemo, useState, useEffect } from "react";

// Helper functions for Rupiah formatting
const formatRupiah = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "Rp 0";
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (isNaN(num)) return "Rp 0";
  return `Rp ${num.toLocaleString("id-ID")}`;
};

const parseRupiah = (value: string): number => {
  const cleaned = value.replace(/[^\d]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
};
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { MENU_CONFIG } from "@/lib/menu-config";
import {
  useDoc,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from "@/firebase";
import {
  doc,
  collection,
  setDoc,
  addDoc,
  updateDoc,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import type {
  UserProfile,
  EmployeeMasterData,
  EmployeeProfile,
  Brand,
  HrdEmploymentInfo,
  VerificationStatusGroup,
  OvertimeSubmission,
  AttendanceSite,
} from "@/lib/types";
import {
  ATTENDANCE_METHODS,
  ATTENDANCE_METHOD_LABELS,
  ATTENDANCE_LOCATION_MODE_LABELS,
  type AttendanceSettings,
} from "@/lib/attendance-methods";
import { OvertimeStatusBadge } from "@/components/dashboard/karyawan/OvertimeStatusBadge";
import { AttendanceMethodEditDialog } from "@/components/dashboard/hrd/AttendanceMethodEditDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  MapPin,
  Save,
  Loader2,
  ArrowLeft,
  History,
  Briefcase,
  Building2,
  ShieldCheck,
  CreditCard,
  ClipboardList,
  User,
  Heart,
  Mail,
  FileText,
  Phone,
  GraduationCap,
  Pencil,
  Settings,
  AlertOctagon,
  Eye,
  Download,
  Image as ImageIcon,
  Plus,
  X,
  Trash2,
  Users as UsersIcon,
  AlertCircle,
  Info,
  FileX,
  Calendar,
  DollarSign,
  BarChart3,
  Clock,
  CreditCard,
  Monitor,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { calculateProfileCompleteness } from "@/lib/employee-completeness";
import {
  getEmployeeDocumentUrls,
  getDocumentStatus,
  getEducationDocumentUrl,
  getCertificationDocumentUrl,
} from "@/lib/employee-documents";
import { openSecureFile, extractFileIdFromUrl } from "@/lib/candidate-docs-utils";
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { getHrdEmployeeStruktur } from "@/lib/employee-hrd-profile";
import { cn } from "@/lib/utils";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  format,
  differenceInMonths,
  differenceInDays,
  addMonths,
  addDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";

const TIPE_KARYAWAN_OPTIONS = ["Magang", "Probation", "Kontrak", "Tetap"];

const STATUS_KERJA_OPTIONS = [
  "Training",
  "Masa Percobaan",
  "Aktif",
  "Kontrak",
  "Magang",
  "Resigned",
  "Terminated",
];

const DURASI_OPTIONS = [
  "1 Bulan",
  "3 Bulan",
  "6 Bulan",
  "12 Bulan",
  "24 Bulan",
  "Custom",
];

function formatAddress(addr?: any): string | null {
  if (!addr) return null;
  // If addr is actually the profile object (error mapping fallback), return null to avoid showing irrelevant data
  if (addr.fullName || addr.email || addr.dataDiriIdentitas) return null;

  const parts = [
    addr.street ? `Jl. ${addr.street}` : null,
    addr.kelurahan?.name ? `Kel. ${addr.kelurahan.name}` : null,
    addr.kecamatan?.name ? `Kec. ${addr.kecamatan.name}` : null,
    addr.kabupatenKota?.name,
    addr.provinsi?.name,
    addr.kodePos,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// Helper function to extract address components from address object
function extractAddressComponents(addr?: any) {
  return {
    province: addr?.provinsi?.name || null,
    city: addr?.kabupatenKota?.name || null,
    district: addr?.kecamatan?.name || null,
    village: addr?.kelurahan?.name || null,
    street: addr?.street || null,
    rt: addr?.rt || null,
    rw: addr?.rw || null,
    postalCode: addr?.kodePos || null,
  };
}

function formatCurrency(value: string | number): string {
  if (!value && value !== 0) return "";
  const numValue = typeof value === "string" ? value.replace(/\D/g, "") : String(value);
  if (!numValue) return "";
  return `Rp ${parseInt(numValue, 10).toLocaleString("id-ID")}`;
}

function parseCurrency(value: string): number {
  const numValue = value.replace(/\D/g, "");
  return numValue ? parseInt(numValue, 10) : 0;
}

const DataRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null | number;
  className?: string;
}) => (
  <div className="py-2.5 group transition-all">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1 group-hover:text-emerald-500/50 transition-colors">
      {label}
    </p>
    <p
      className={`text-sm font-medium text-slate-800 dark:text-slate-200 truncate ${className || ""}`}
      title={String(value || "Belum diisi")}
    >
      {value !== undefined && value !== null && value !== ""
        ? String(value)
        : "Belum diisi"}
    </p>
  </div>
);

import { SecureDriveImage } from "@/components/SecureDriveImage";

const DocumentPreviewCard = ({
  label,
  url,
  status,
  type = "Document",
  value,
}: {
  label: string;
  url?: string | null;
  status?: string;
  type?: string;
  value?: string | null;
}) => {
  const [imageError, setImageError] = React.useState(false);
  const isImage = false; // Disabled preview as per new UX rules
  const { toast } = useToast();

  const fileId = extractFileIdFromUrl(url);

  const handleOpenSecure = async () => {
    try {
      if (fileId) {
        await openSecureFile(fileId);
      } else {
        toast({
          title: "File tidak dapat dibuka",
          description: "File ID tidak ditemukan untuk dokumen ini.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Gagal membuka dokumen",
        description: err.message || "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="group border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300">
      <CardHeader className="pb-4 border-b border-slate-200 dark:border-slate-800/50">
        <div className="flex justify-between items-start">
          <Badge
            variant="outline"
            className="text-[9px] uppercase tracking-tighter border-slate-300 dark:border-slate-800 text-slate-500"
          >
            {type}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[9px] uppercase tracking-tighter ${
              status === "Valid" || status === "Sudah Upload"
                ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"
                : status === "Tidak Punya"
                  ? "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50"
                  : "border-red-500/20 text-red-500 bg-red-500/5"
            }`}
          >
            {status}
          </Badge>
        </div>
        <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-2">
          {label}
        </CardTitle>
        {value && (
          <p className="text-[10px] font-mono text-slate-500 mt-1">{value}</p>
        )}
      </CardHeader>
      <CardContent className="pt-6">
        {fileId ? (
          <div className="space-y-4">
            <div
              className="aspect-video rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors text-center p-4 group"
              onClick={handleOpenSecure}
            >
              <FileText className="h-8 w-8 mb-2 opacity-40 group-hover:scale-110 transition-transform duration-500" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                File sudah diunggah
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-[10px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 h-9"
                onClick={handleOpenSecure}
              >
                <Eye className="h-3.5 w-3.5 mr-2" />
                Lihat Dokumen
              </Button>
            </div>
          </div>
        ) : (
          <div className="aspect-video rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 flex flex-col items-center justify-center text-slate-500 p-4 text-center">
            <FileX className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              File belum tersedia
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const VerificationActionCard = ({
  employeeId,
  group,
  title,
  currentStatus,
  currentNotes,
}: {
  employeeId: string;
  group: keyof NonNullable<EmployeeProfile["verificationStatus"]>;
  title: string;
  currentStatus?: VerificationStatusGroup;
  currentNotes?: string;
}) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [status, setStatus] = useState<VerificationStatusGroup>(
    currentStatus || "approved",
  );
  const [note, setNote] = useState(currentNotes || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentStatus) setStatus(currentStatus);
    if (currentNotes) setNote(currentNotes);
  }, [currentStatus, currentNotes]);

  const handleSave = async (newStatus: VerificationStatusGroup) => {
    if (newStatus === "revision" && !note.trim()) {
      toast({
        variant: "destructive",
        title: "Catatan Wajib Diisi",
        description: "Mohon berikan catatan jika meminta revisi atau menolak.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const ref = doc(firestore, "employee_profiles", employeeId);
      await updateDoc(ref, {
        [`verificationStatus.${group}`]: newStatus,
        [`verificationNotes.${group}`]: newStatus === "approved" ? "" : note,
      });
      setStatus(newStatus);
      toast({
        title: "Status Verifikasi Diperbarui",
        description: `Status ${title} telah diubah menjadi ${newStatus}.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentStatus || currentStatus === "approved") return null;

  const isPending = status === "pending";
  const isRevision = status === "revision";

  return (
    <Card
      className={`mb-8 border-l-4 ${
        isPending
          ? "border-amber-500 bg-amber-500/5"
          : isRevision
            ? "border-blue-500 bg-blue-500/5"
            : "border-red-500 bg-red-500/5"
      }`}
    >
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          {isPending && <AlertTriangle className="h-5 w-5 text-amber-500" />}
          {isRevision && <AlertCircle className="h-5 w-5 text-blue-500" />}
          {!isPending && !isRevision && (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          Verifikasi Data: {title}
        </CardTitle>
        <CardDescription className="text-slate-400">
          Karyawan telah melakukan perubahan pada data {title.toLowerCase()}.
          Mohon direview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-widest text-slate-500">
            Catatan Revisi / Penolakan
          </Label>
          <Textarea
            placeholder="Masukkan catatan jika data perlu direvisi atau ditolak..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-20"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={isSaving}
            onClick={() => handleSave("approved")}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Setujui Perubahan
          </Button>
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => handleSave("revision")}
            className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
          >
            Minta Revisi
          </Button>
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => handleSave("rejected")}
            className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
          >
            Tolak
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userProfile, firebaseUser } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const handleOpenSecureUrl = async (url?: string | null) => {
    try {
      const fileId = extractFileIdFromUrl(url);
      if (fileId) {
        await openSecureFile(fileId);
      } else {
        toast({
          title: "File tidak dapat dibuka",
          description: "File ID tidak ditemukan untuk dokumen ini.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Gagal membuka dokumen",
        description: err.message || "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ringkasan");
  const [divisions, setDivisions] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [warningNoManager, setWarningNoManager] = useState(false);
  const [managerWarningMessage, setManagerWarningMessage] = useState("Belum ada atasan yang sesuai. Atur Manager Divisi atau Direksi/Manajemen pada Organisasi Perusahaan terlebih dahulu.");
  const [isOverrideActive, setIsOverrideActive] = useState(false);
  const [allPossibleSupervisors, setAllPossibleSupervisors] = useState<any[]>([]);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [sites, setSites] = useState<AttendanceSite[]>([]);

  const resolvedParams = React.use(params);
  const employeeId = resolvedParams.id;

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Fetch data
  const {
    data: userDoc,
    isLoading: userLoading,
    mutate: mutateUser,
  } = useDoc<UserProfile>(
    useMemoFirebase(
      () => (employeeId ? doc(firestore, "users", employeeId) : null),
      [firestore, employeeId],
    ),
  );
  const {
    data: empDoc,
    isLoading: empLoading,
    mutate: mutateEmp,
  } = useDoc<EmployeeMasterData>(
    useMemoFirebase(
      () => (employeeId ? doc(firestore, "employees", employeeId) : null),
      [firestore, employeeId],
    ),
  );
  const {
    data: profileDoc,
    isLoading: profileLoading,
    mutate: mutateProfile,
  } = useDoc<EmployeeProfile>(
    useMemoFirebase(
      () =>
        employeeId ? doc(firestore, "employee_profiles", employeeId) : null,
      [firestore, employeeId],
    ),
  );
  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  // Fetch attendance sites
  const { data: sitesData, isLoading: sitesLoading } =
    useCollection<AttendanceSite>(
      useMemoFirebase(
        () => collection(firestore, "attendance_sites"),
        [firestore]
      )
    );

  useEffect(() => {
    if (sitesData) {
      setSites(sitesData);
    }
  }, [sitesData]);

  // History query
  const historyQuery = useMemoFirebase(() => {
    if (!employeeId) return null;
    return query(
      collection(firestore, "employees", employeeId, "employment_history"),
      orderBy("changedAt", "desc"),
    );
  }, [firestore, employeeId]);

  const { data: historyData } = useCollection(historyQuery);

  // Overtime query
  const overtimeQuery = useMemoFirebase(() => {
    if (!employeeId) return null;
    return query(
      collection(firestore, "overtime_submissions"),
      where("employeeUid", "==", employeeId)
    );
  }, [firestore, employeeId]);

  const { data: overtimeDataRaw } = useCollection<OvertimeSubmission>(overtimeQuery);

  // Client-side sort by overtimeDate desc
  const overtimeData = useMemo(() => {
    if (!overtimeDataRaw) return [];
    return [...overtimeDataRaw].sort((a, b) => {
      const dateA = a.overtimeDate ? (typeof a.overtimeDate === "object" && typeof (a.overtimeDate as any).toDate === "function" ? (a.overtimeDate as any).toDate().getTime() : new Date(a.overtimeDate as any).getTime()) : 0;
      const dateB = b.overtimeDate ? (typeof b.overtimeDate === "object" && typeof (b.overtimeDate as any).toDate === "function" ? (b.overtimeDate as any).toDate().getTime() : new Date(b.overtimeDate as any).getTime()) : 0;
      return dateB - dateA;
    });
  }, [overtimeDataRaw]);

  const isLoading =
    userLoading || empLoading || profileLoading || brandsLoading;

  // Derive master/hrd data
  const normalizedData = useMemo(() => {
    if (isLoading) return null;
    const norm = normalizeEmployeeRow(
      empDoc,
      profileDoc,
      userDoc,
      brands || [],
    );
    return norm;
  }, [empDoc, profileDoc, userDoc, brands, isLoading]);

  const hrdStruktur = useMemo(() => {
    if (isLoading) return null;
    return getHrdEmployeeStruktur(empDoc, profileDoc, userDoc, brands || []);
  }, [empDoc, profileDoc, userDoc, brands, isLoading]);

  const hrdInfo = profileDoc?.hrdEmploymentInfo || {};

  const employmentDefaultValues = useMemo(
    () => ({
      brandId: normalizedData?.brandId || "",
      brand: normalizedData?.brandName || "",
      divisi: normalizedData?.divisi || "",
      jabatan: normalizedData?.jabatan || "",
      tipeKaryawan: normalizedData?.tipeKaryawan || "",
      statusKerja: normalizedData?.statusKerja || "",
      atasanLangsung: hrdInfo.atasanLangsung || "",
      sistemKerja: String(
        hrdInfo.sistemKerja ||
          hrdInfo.workSystem ||
          empDoc?.sistemKerja ||
          empDoc?.workSystem ||
          "",
      ).trim(),
      lokasiKerja: hrdInfo.lokasiKerja || "",
      tanggalMasuk: hrdInfo.tanggalMasuk || "",
      nomorKontrakSK: hrdInfo.nomorKontrakSK || "",
      masaPercobaanMulai: hrdInfo.masaPercobaanMulai || "",
      masaPercobaanSelesai: hrdInfo.masaPercobaanSelesai || "",
      masaPercobaan: hrdInfo.masaPercobaan || "",
      kontrakMulai: hrdInfo.kontrakMulai || "",
      kontrakSelesai: hrdInfo.kontrakSelesai || "",
      durasiKontrak: hrdInfo.durasiKontrak || "",
      statusKontrak: hrdInfo.statusKontrak || "Draft",
      catatanKontrak: hrdInfo.catatanKontrak || "",
      contractDocumentUrl: hrdInfo.contractDocumentUrl || "",
      mentor: hrdInfo.mentor || "",
      evaluator: hrdInfo.evaluator || "",
      tanggalEvaluasi: hrdInfo.tanggalEvaluasi || "",
      nomorSK: hrdInfo.nomorSK || "",
      hariKerja: hrdInfo.hariKerja || "",
      jamKerja: hrdInfo.jamKerja || "",

      // New structure fields
      employeeId: normalizedData?.employeeId || "",
      divisionId: normalizedData?.divisionId || "",
      structuralPosition: normalizedData?.structuralPosition || "",
      workRole: normalizedData?.workRole || "",
      employeeType:
        normalizedData?.employeeType || normalizedData?.tipeKaryawan || "",
      employmentStatus:
        normalizedData?.employmentStatus || normalizedData?.statusKerja || "",
      directSupervisorUid: normalizedData?.directSupervisorUid || "",
      structureEffectiveDate: format(new Date(), "yyyy-MM-dd"),
      structureChangeReason: "",

      // Payroll
      gajiPokok: hrdInfo.gajiPokok || 0,
      allowances: hrdInfo.allowances || [],
      bonusInsentif: hrdInfo.bonusInsentif || 0,
      thr: hrdInfo.thr || 0,

      // Granular BPJS
      bpjsKesPerusahaan: hrdInfo.bpjsKesPerusahaan || 0,
      bpjsKesKaryawan: hrdInfo.bpjsKesKaryawan || 0,
      bpjsTkPerusahaan: hrdInfo.bpjsTkPerusahaan || 0,
      bpjsTkKaryawan: hrdInfo.bpjsTkKaryawan || 0,

      potonganPPh21: hrdInfo.potonganPPh21 || 0,
      potonganLain: hrdInfo.potonganLain || 0,
      catatanPayroll: hrdInfo.catatanPayroll || "",

      // Payroll Account Override
      useDifferentPayrollAccount: hrdInfo.useDifferentPayrollAccount || false,
      customPayrollBank: hrdInfo.customPayrollBank || "",
      customPayrollAccountNumber: hrdInfo.customPayrollAccountNumber || "",
      customPayrollAccountHolder: hrdInfo.customPayrollAccountHolder || "",

      // Kehadiran & Cuti
      jadwalKerja: hrdInfo.jadwalKerja || "",
      shift: hrdInfo.shift || "",
      hadir: hrdInfo.hadir || 0,
      terlambat: hrdInfo.terlambat || 0,
      izin: hrdInfo.izin || 0,
      sakit: hrdInfo.sakit || 0,
      alpha: hrdInfo.alpha || 0,
      jatahCuti: hrdInfo.jatahCuti || 12,
      sisaCuti: hrdInfo.sisaCuti || 12,
      carryOverCuti: (hrdInfo as any).carryOverCuti || 0,
      cutiEffectiveDate: format(new Date(), "yyyy-MM-dd"),
      cutiChangeReason: "",

      asetPerusahaan: hrdInfo.asetPerusahaan || "",
      catatanBenefit: hrdInfo.catatanBenefit || "",
      catatanInternalHrd: hrdInfo.catatanInternalHrd || "",
      catatanAdministrasi: hrdInfo.catatanAdministrasi || "",
      tanggalEfektif: format(new Date(), "yyyy-MM-dd"),
      // New contract fields
      contractCycleStatus:
        hrdInfo.contractCycleStatus || hrdInfo.statusKontrak || "Draft",
      contractNumber: hrdInfo.contractNumber || hrdInfo.nomorKontrakSK || "",
      contractStartDate:
        hrdInfo.contractStartDate || hrdInfo.kontrakMulai || "",
      contractEndDate: hrdInfo.contractEndDate || hrdInfo.kontrakSelesai || "",
      contractDurationType: (hrdInfo as any).contractDurationType || "custom",
      contractDurationMonths: (hrdInfo as any).contractDurationMonths || 0,
      probationStartDate:
        hrdInfo.probationStartDate || hrdInfo.masaPercobaanMulai || "",
      probationEndDate:
        hrdInfo.probationEndDate || hrdInfo.masaPercobaanSelesai || "",
      finalEvaluationDate:
        hrdInfo.finalEvaluationDate || hrdInfo.tanggalEvaluasi || "",
      leaveQuotaAnnual: hrdInfo.leaveQuotaAnnual ?? hrdInfo.jatahCuti ?? 0,
      workLocation: hrdInfo.workLocation || hrdInfo.lokasiKerja || "",
      contractNotes: hrdInfo.contractNotes || hrdInfo.catatanKontrak || "",

      // Internship-specific fields
      internId: hrdInfo.internId || "",
      internshipBrandId: hrdInfo.internshipBrandId || normalizedData?.brandId || "",
      internshipBrandName: hrdInfo.internshipBrandName || hrdInfo.brandName || normalizedData?.brandName || "",
      internshipDivisionId: hrdInfo.internshipDivisionId || normalizedData?.divisionId || "",
      internshipDivisionName: hrdInfo.internshipDivisionName || hrdInfo.divisionName || normalizedData?.divisi || "",
      internshipRole: hrdInfo.internshipRole || hrdInfo.workRole || "",
      internshipMentorUid: hrdInfo.internshipMentorUid || normalizedData?.directSupervisorUid || "",
      internshipMentorName: hrdInfo.internshipMentorName || hrdInfo.directSupervisorName || "",
      internshipLocation: hrdInfo.internshipLocation || hrdInfo.workLocation || "",
      internshipProgramType: hrdInfo.internshipProgramType || "",
      internshipStartDate: hrdInfo.internshipStartDate || hrdInfo.contractStartDate || "",
      internshipEndDate: hrdInfo.internshipEndDate || hrdInfo.contractEndDate || "",
      internshipStatus: hrdInfo.internshipStatus || hrdInfo.employmentStatus || "",
      internshipNotes: hrdInfo.internshipNotes || "",
      internshipChangeReason: hrdInfo.internshipChangeReason || "",

      additionalFields: {
        historyType: "promotion",
        historyTitle: "",
        historyDescription: "",
        historyDate: format(new Date(), "yyyy-MM-dd"),
      },
    }),
    [normalizedData, hrdInfo],
  );

  const form = useForm<any>({
    defaultValues: employmentDefaultValues,
  });

  const lastResetKeyRef = React.useRef("");

  // Re-init form when data loaded
  useEffect(() => {
    if (isLoading || !employeeId) return;

    const resetKey = JSON.stringify(employmentDefaultValues);
    if (lastResetKeyRef.current === resetKey) return;

    lastResetKeyRef.current = resetKey;
    form.reset(employmentDefaultValues);
  }, [isLoading, employeeId, employmentDefaultValues, form]);

  // Auto-calculate Contract End Date logic
  const watchEmployeeType = form.watch("employeeType");
  const watchContractDurationType = form.watch("contractDurationType");
  const watchContractStartDate = form.watch("contractStartDate");
  const watchProbationStartDate = form.watch("probationStartDate");

  useEffect(() => {
    const employeeType = watchEmployeeType;
    const durationType = watchContractDurationType;
    // Skip auto-calculation for Tetap or custom duration
    if (employeeType === "Tetap" || durationType === "custom" || !durationType)
      return;

    const months = parseInt(durationType);
    if (isNaN(months)) return;

    let startDateStr = "";
    let targetField = "";

    if (employeeType === "Magang") {
      startDateStr = form.getValues("contractStartDate");
      targetField = "contractEndDate";
    } else if (employeeType === "Probation") {
      startDateStr = watchProbationStartDate;
      targetField = "probationEndDate";
    } else if (employeeType === "Kontrak") {
      startDateStr = watchContractStartDate;
      targetField = "contractEndDate";
    }

    if (startDateStr && targetField) {
      const start = new Date(startDateStr);
      if (!isNaN(start.getTime())) {
        const end = new Date(start);
        end.setMonth(start.getMonth() + months);
        // Subtract 1 day to make it exactly X months
        end.setDate(end.getDate() - 1);
        form.setValue(targetField as any, format(end, "yyyy-MM-dd"));
      }
    }
  }, [
    watchEmployeeType,
    watchContractDurationType,
    watchContractStartDate,
    watchProbationStartDate,
    form,
  ]);

  // Sync contractDurationMonths with contractDurationType when not custom
  useEffect(() => {
    const durationType = watchContractDurationType;
    if (durationType && durationType !== "custom") {
      const months = parseInt(durationType);
      if (!isNaN(months)) {
        form.setValue("contractDurationMonths", months as any);
      }
    }
  }, [watchContractDurationType]);
  // Watch brandId for divisions
  const watchBrandIdForDivisions = form.watch("brandId");

  useEffect(() => {
    const brandId = watchBrandIdForDivisions;
    if (!brandId) {
      setDivisions([]);
      return;
    }

    // Load divisions from brands/{brandId}/divisions subcollection
    const loadDivisions = async () => {
      try {
        const divisionsRef = collection(
          firestore,
          "brands",
          brandId,
          "divisions",
        );
        const divisionsSnap = await getDocs(divisionsRef);
        const divisionsData = divisionsSnap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          // Filter active divisions if isActive field exists
          .filter((d: any) => d.isActive !== false)
          // Sort by sortOrder first, then by name
          .sort((a: any, b: any) => {
            if (a.sortOrder && b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return (a.name || "").localeCompare(b.name || "");
          });
        setDivisions(divisionsData);
      } catch (error) {
        console.error("Error loading divisions:", error);
        setDivisions([]);
      }
    };

    loadDivisions();
  }, [watchBrandIdForDivisions, firestore]);

  // Watch values outside to stabilize useEffect dependencies
  const watchBrandIdForManagers = form.watch("brandId");
  const watchDivisionIdForManagers = form.watch("divisionId");
  const watchStructuralPositionForManagers = form.watch("structuralPosition");

  // Load managers when brand and division change
  useEffect(() => {
    const brandId = watchBrandIdForManagers;
    const divisionId = watchDivisionIdForManagers;

    if (!brandId || !divisionId) {
      setManagers([]);
      setWarningNoManager(false);
      return;
    }

    const loadManagers = async () => {
      try {
        const selectedDivision = divisions.find((d) => d.id === divisionId);
        if (!selectedDivision) {
          setWarningNoManager(true);
          setManagers([]);
          return;
        }

        const sp = watchStructuralPositionForManagers;

        // Management level: no supervisor required
        if (sp === "management") {
          setManagers([]);
          setWarningNoManager(false);
          if (!isOverrideActive) form.setValue("directSupervisorUid", "");
          return;
        }

        const candidates: any[] = [];
        const seenUids = new Set<string>();

        // A) For division_manager: find management-level users only
        // For staff/supervisor/koordinator: find division managers + management users
        if (sp === "division_manager") {
          // Division manager's superior = management/direksi
          const mgmtSnap = await getDocs(query(collection(firestore, "users"), where("structuralLevel", "==", "management")));
          const mgmtUsers = mgmtSnap.docs.map(d => ({ uid: d.id, ...d.data() })) as any[];
          for (const m of mgmtUsers) {
            if (m.uid === employeeId || seenUids.has(m.uid)) continue;
            if (m.isActive === false) continue;
            // Priority: scope matches brand exactly
            const scopes: any[] = m.managementScopes || [];
            const hasExact = scopes.some((s: any) => (s.brandId === brandId || s.brandId === "all") && (s.divisionIds?.includes(divisionId) || s.divisionIds?.includes("all")));
            const hasBrand = scopes.some((s: any) => s.brandId === brandId || s.brandId === "all");
            if (hasExact || hasBrand) {
              candidates.push({ ...m, _source: "management_scope_exact", _sourceLabel: `Direksi/Manajemen · ${m.workRole || m.positionTitle || "Manajemen"}` });
              seenUids.add(m.uid);
            }
          }
          // If no scope match, include all management
          if (candidates.length === 0) {
            for (const m of mgmtUsers) {
              if (m.uid === employeeId || seenUids.has(m.uid)) continue;
              if (m.isActive === false) continue;
              candidates.push({ ...m, _source: "management_scope_brand", _sourceLabel: `Direksi/Manajemen · ${m.workRole || "Manajemen"}` });
              seenUids.add(m.uid);
            }
          }
        } else {
          // Staff / Supervisor / Koordinator
          // B1) Division manager of same division (highest priority)
          const divMgrSnap = await getDocs(query(
            collection(firestore, "users"),
            where("structuralPosition", "==", "division_manager"),
            where("divisionId", "==", divisionId)
          ));
          for (const d of divMgrSnap.docs) {
            const m = { uid: d.id, ...d.data() } as any;
            if (m.uid === employeeId || seenUids.has(m.uid)) continue;
            if (m.isActive === false) continue;
            candidates.push({ ...m, _source: "division_manager", _sourceLabel: `Manager Divisi ${selectedDivision?.name || ""}` });
            seenUids.add(m.uid);
          }

          // B1b) Supervisor of same division (for staff level)
          if (sp === "staff") {
            const supSnap = await getDocs(query(
              collection(firestore, "users"),
              where("structuralPosition", "==", "supervisor"),
              where("divisionId", "==", divisionId)
            ));
            for (const d of supSnap.docs) {
              const m = { uid: d.id, ...d.data() } as any;
              if (m.uid === employeeId || seenUids.has(m.uid)) continue;
              if (m.isActive === false) continue;
              candidates.push({ ...m, _source: "division_manager", _sourceLabel: `Supervisor · ${selectedDivision?.name || ""}` });
              seenUids.add(m.uid);
            }
          }

          // B2) Management users with exact scope (brand + division)
          const mgmtSnap = await getDocs(query(collection(firestore, "users"), where("structuralLevel", "==", "management")));
          const mgmtUsers = mgmtSnap.docs.map(d => ({ uid: d.id, ...d.data() })) as any[];

          for (const m of mgmtUsers) {
            if (m.uid === employeeId || seenUids.has(m.uid)) continue;
            if (m.isActive === false) continue;
            const scopes: any[] = m.managementScopes || [];
            const hasExact = scopes.some((s: any) =>
              s.brandId === brandId &&
              s.scopeType === "selected_divisions" &&
              s.divisionIds?.includes(divisionId)
            );
            if (hasExact) {
              const brandLabel = scopes.find((s: any) => s.brandId === brandId)?.brandName || brandId;
              const divLabel = selectedDivision?.name || divisionId;
              candidates.push({ ...m, _source: "management_scope_exact", _sourceLabel: `Direksi/Manajemen · ${brandLabel} / ${divLabel}` });
              seenUids.add(m.uid);
            }
          }

          // B3) Management users with brand-level scope
          for (const m of mgmtUsers) {
            if (m.uid === employeeId || seenUids.has(m.uid)) continue;
            if (m.isActive === false) continue;
            const scopes: any[] = m.managementScopes || [];
            const hasBrand = scopes.some((s: any) =>
              (s.brandId === brandId && (s.scopeType === "brand" || s.divisionIds?.includes("all"))) ||
              s.brandId === "all" || s.scopeType === "all"
            );
            if (hasBrand) {
              const scopeEntry = scopes.find((s: any) => s.brandId === brandId || s.brandId === "all");
              const brandLabel = scopeEntry?.brandName || brandId;
              const scopeDesc = (scopeEntry?.brandId === "all" || scopeEntry?.scopeType === "all") ? "Seluruh Brand" : brandLabel;
              candidates.push({ ...m, _source: "management_scope_brand", _sourceLabel: `Direksi/Manajemen · ${scopeDesc}` });
              seenUids.add(m.uid);
            }
          }
        }

        const hasDivManager = candidates.some(c => c._source === "division_manager");
        const hasMgmt = candidates.some(c => c._source?.startsWith("management"));

        setManagers(candidates);

        if (candidates.length === 0) {
          setWarningNoManager(true);
          setManagerWarningMessage("Belum ada atasan yang sesuai. Atur Manager Divisi atau Direksi/Manajemen pada Organisasi Perusahaan terlebih dahulu.");
          if (!isOverrideActive) {
            const currentSupervisor = form.getValues("directSupervisorUid");
            if (currentSupervisor === employeeId) form.setValue("directSupervisorUid", "");
          }
        } else if (!hasDivManager && hasMgmt) {
          // No division manager but management users exist — show info, not warning
          setWarningNoManager(true);
          setManagerWarningMessage("Manager divisi belum tersedia. Anda dapat memilih Direksi/Manajemen yang menaungi brand/divisi ini.");
          if (!isOverrideActive) {
            const currentVal = form.getValues("directSupervisorUid");
            if (!candidates.find(c => c.uid === currentVal)) {
              form.setValue("directSupervisorUid", candidates[0].uid);
            }
          }
        } else {
          setWarningNoManager(false);
          if (!isOverrideActive) {
            const currentVal = form.getValues("directSupervisorUid");
            if (!candidates.find(c => c.uid === currentVal)) {
              form.setValue("directSupervisorUid", candidates[0].uid);
            }
          }
        }
      } catch (error) {
        console.error("Error loading managers:", error);
        setManagers([]);
      }
    };

    loadManagers();
  }, [
    watchBrandIdForManagers,
    watchDivisionIdForManagers,
    watchStructuralPositionForManagers,
    isOverrideActive,
    firestore,
    form,
    divisions,
    employeeId,
    normalizedData
  ]);

  // Load all possible supervisors for override
  useEffect(() => {
    if (!isOverrideActive) return;
    const loadAllSupervisors = async () => {
      try {
        const q = query(collection(firestore, "users"), where("isActive", "!=", false));
        const snap = await getDocs(q);
        const filtered = snap.docs
          .map(doc => ({ uid: doc.id, ...doc.data() }))
          .filter((u: any) => u.uid !== employeeId);
        setAllPossibleSupervisors(filtered);
      } catch (err) {
        console.error("Error loading all supervisors:", err);
      }
    };
    loadAllSupervisors();
  }, [isOverrideActive, firestore, employeeId]);

  // Auto-calculate contract duration or end date
  const watchKontrakMulai = form.watch("kontrakMulai");
  const watchKontrakSelesai = form.watch("kontrakSelesai");
  const watchDurasiKontrak = form.watch("durasiKontrak");

  // Effect 1: Calculate End Date from Duration if standard preset is used
  useEffect(() => {
    if (!watchKontrakMulai || !watchDurasiKontrak) return;

    const match = watchDurasiKontrak.match(/^(\d+)\s*Bulan$/i);
    if (match) {
      const months = parseInt(match[1], 10);
      try {
        const startDate = new Date(watchKontrakMulai);
        const endDate = addMonths(startDate, months);
        const formattedEnd = format(endDate, "yyyy-MM-dd");

        if (formattedEnd !== watchKontrakSelesai) {
          form.setValue("kontrakSelesai", formattedEnd);
        }
      } catch (e) {}
    }
  }, [watchKontrakMulai, watchDurasiKontrak, form]);

  // Effect 2: Calculate Duration string if end date is changed manually
  useEffect(() => {
    if (watchKontrakMulai && watchKontrakSelesai) {
      try {
        const startDate = new Date(watchKontrakMulai);
        const endDate = new Date(watchKontrakSelesai);

        if (endDate > startDate) {
          const totalDays = differenceInDays(endDate, startDate);
          const months = Math.floor(totalDays / 30);
          const days = totalDays % 30;
          let duration = "";
          if (months > 0) duration += `${months} Bulan `;
          if (days > 0) duration += `${days} Hari`;

          const finalDuration = duration.trim() || "0 Hari";
          // Only update if it doesn't match a standard preset or is different
          const currentDuration = watchDurasiKontrak || "";
          if (
            finalDuration !== currentDuration &&
            !currentDuration.endsWith("Bulan")
          ) {
            form.setValue("durasiKontrak", finalDuration);
          }
        }
      } catch (e) {}
    }
  }, [watchKontrakMulai, watchKontrakSelesai, form]);

  // Duplicate watchEmployeeType removed
  useEffect(() => {
    if (!watchEmployeeType) return;
    let leave = 0;
    if (watchEmployeeType === "Magang" || watchEmployeeType === "Probation") {
      leave = 0;
    } else if (watchEmployeeType === "Kontrak") {
      leave = 12;
    } else if (watchEmployeeType === "Tetap") {
      leave = 15;
    }

    if (form.getValues("leaveQuotaAnnual") !== leave) {
      form.setValue("leaveQuotaAnnual", leave, { shouldDirty: true });
      form.setValue("jatahCuti", leave, { shouldDirty: true });
    }
  }, [watchEmployeeType, form]);

  const handleSaveHrd = async (
    values: HrdEmploymentInfo,
    additionalHistory?: any,
  ) => {
    if (!firebaseUser || !userProfile || !employeeId) return;

    if (editingSection === "struktur") {
      const isSavingAsManager = values.structuralPosition === "division_manager";
      const wasManager = normalizedData?.structuralPosition === "division_manager" || normalizedData?.isDivisionManager === true;

      if (isSavingAsManager) {
        const selectedDiv = divisions?.find(d => d.id === values.divisionId);
        if (selectedDiv && selectedDiv.managerId && selectedDiv.managerId !== employeeId) {
          const confirmReplace = window.confirm(`Divisi ini sudah memiliki Manager Divisi (${selectedDiv.managerName}). Apakah ingin mengganti manager divisi?`);
          if (!confirmReplace) {
            return;
          }
        }
      } else if (wasManager && values.structuralPosition !== "division_manager") {
        const confirmRemove = window.confirm("Karyawan ini sebelumnya tercatat sebagai Manager Divisi. Jika dilanjutkan, status Manager Divisi di Organisasi Perusahaan akan dilepas. Lanjutkan?");
        if (!confirmRemove) {
          return;
        }
      }
    }

    // Validasi untuk Ubah Cuti
    if (editingSection === "cuti") {
      const jatahCuti = (values as any).jatahCuti || 0;
      const sisaCuti = (values as any).sisaCuti || 0;
      const cutiEffectiveDate = (values as any).cutiEffectiveDate;
      const cutiChangeReason = (values as any).cutiChangeReason || "";

      if (jatahCuti < 0) {
        toast({
          variant: "destructive",
          title: "Hak Cuti Tidak Valid",
          description: "Hak cuti tidak boleh negatif.",
        });
        return;
      }

      if (sisaCuti < 0) {
        toast({
          variant: "destructive",
          title: "Sisa Cuti Tidak Valid",
          description: "Sisa cuti tidak boleh negatif.",
        });
        return;
      }

      if (!cutiEffectiveDate) {
        toast({
          variant: "destructive",
          title: "Tanggal Efektif Wajib Diisi",
          description: "Mohon isi tanggal efektif perubahan cuti.",
        });
        return;
      }

      if (!cutiChangeReason || cutiChangeReason.trim().length < 10) {
        toast({
          variant: "destructive",
          title: "Alasan Perubahan Wajib Diisi",
          description: "Mohon isi alasan perubahan (minimal 10 karakter).",
        });
        return;
      }
    }

    if (values.directSupervisorUid === employeeId) {
      toast({
        variant: "destructive",
        title: "Atasan Tidak Valid",
        description: "Atasan langsung tidak boleh mengarah ke diri sendiri.",
      });
      return;
    }

    if (isOverrideActive && !values.directManagerOverrideReason?.trim() && editingSection === "struktur") {
      toast({
        variant: "destructive",
        title: "Alasan Override Wajib Diisi",
        description: "Mohon isi alasan override atasan langsung.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const b = brands?.find((b) => b.id === values.brandId);
      const d = divisions?.find((div) => div.id === values.divisionId);
      const possibleMgrs = isOverrideActive ? allPossibleSupervisors : managers;
      const s = possibleMgrs?.find((m) => m.uid === values.directSupervisorUid);

      // Determine directSuperiorSource
      const isManagementLevel = values.structuralPosition === "management";
      let directSuperiorSource: string | null = null;
      if (isManagementLevel) {
        directSuperiorSource = "not_required_management_level";
      } else if (isOverrideActive) {
        directSuperiorSource = "manual_override";
      } else if (s?._source === "division_manager") {
        directSuperiorSource = "division_manager";
      } else if (s?._source?.startsWith("management")) {
        directSuperiorSource = "management_scope";
      } else if (s) {
        directSuperiorSource = "division_manager";
      }

      const updatedValues = {
        ...values,
        brand: b ? b.name : (values as any).brandName || "",
        brandName: b ? b.name : (values as any).brandName || "",
        divisionName: d ? d.name : (values as any).divisionName || "",
        directSupervisorName: isManagementLevel ? null : (s ? s.fullName : (values as any).directSupervisorName || ""),
        directSupervisorUid: isManagementLevel ? null : values.directSupervisorUid,
        directSuperiorSource,
        // Include cuti fields if updating cuti section
        ...(editingSection === "cuti" && {
          jatahCuti: (values as any).jatahCuti,
          sisaCuti: (values as any).sisaCuti,
          carryOverCuti: (values as any).carryOverCuti,
        }),
      };

      // Determine what changed for history
      const changes: any[] = [];
      const trackChange = (
        field: string,
        label: string,
        oldVal: any,
        newVal: any,
      ) => {
        const ov = String(oldVal || "");
        const nv = String(newVal || "");
        if (ov !== nv) {
          changes.push({
            field,
            label,
            oldValue: ov || "-",
            newValue: nv || "-",
            title: `Perbarui ${label}`,
          });
        }
      };

      // Special handling for cuti section
      if (editingSection === "cuti") {
        trackChange(
          "jatahCuti",
          "Hak Cuti Tahunan",
          hrdInfo.jatahCuti,
          (values as any).jatahCuti,
        );
        trackChange(
          "sisaCuti",
          "Sisa Cuti",
          hrdInfo.sisaCuti,
          (values as any).sisaCuti,
        );
        trackChange(
          "carryOverCuti",
          "Sisa Tahun Lalu (Carry Over)",
          (hrdInfo as any).carryOverCuti,
          (values as any).carryOverCuti,
        );
      }

      trackChange(
        "brandId",
        "Brand",
        normalizedData?.brandId,
        updatedValues.brandId,
      );
      trackChange(
        "divisionId",
        "Division ID",
        normalizedData?.divisionId,
        updatedValues.divisionId,
      );
      trackChange(
        "structuralPosition",
        "Jabatan Struktural",
        normalizedData?.structuralPosition,
        updatedValues.structuralPosition,
      );
      trackChange(
        "workRole",
        "Role / Fungsi Kerja",
        normalizedData?.workRole,
        updatedValues.workRole,
      );
      trackChange(
        "employeeType",
        "Tipe Karyawan",
        normalizedData?.employeeType,
        updatedValues.employeeType,
      );
      trackChange(
        "employmentStatus",
        "Status Kerja",
        normalizedData?.employmentStatus,
        updatedValues.employmentStatus,
      );
      trackChange(
        "directSupervisorUid",
        "Atasan Langsung",
        normalizedData?.directSupervisorUid,
        updatedValues.directSupervisorUid,
      );
      trackChange(
        "employeeId",
        "Nomor Induk Karyawan",
        normalizedData?.employeeId,
        updatedValues.employeeId,
      );
      trackChange(
        "divisi",
        "Divisi",
        normalizedData?.divisi,
        updatedValues.divisi,
      );
      trackChange(
        "jabatan",
        "Jabatan",
        normalizedData?.jabatan,
        updatedValues.jabatan,
      );
      trackChange(
        "tipeKaryawan",
        "Tipe Karyawan",
        normalizedData?.tipeKaryawan,
        updatedValues.tipeKaryawan,
      );
      trackChange(
        "statusKerja",
        "Status Kerja",
        normalizedData?.statusKerja,
        updatedValues.statusKerja,
      );
      trackChange(
        "nomorKontrakSK",
        "No Kontrak/SK",
        hrdInfo.nomorKontrakSK,
        updatedValues.nomorKontrakSK,
      );
      trackChange(
        "kontrakMulai",
        "Kontrak Mulai",
        hrdInfo.kontrakMulai,
        updatedValues.kontrakMulai,
      );
      trackChange(
        "kontrakSelesai",
        "Kontrak Selesai",
        hrdInfo.kontrakSelesai,
        updatedValues.kontrakSelesai,
      );
      trackChange(
        "statusKontrak",
        "Status Kontrak",
        hrdInfo.statusKontrak,
        updatedValues.statusKontrak,
      );
      trackChange(
        "sistemKerja",
        "Sistem Kerja",
        hrdInfo.sistemKerja,
        updatedValues.sistemKerja,
      );
      trackChange(
        "lokasiKerja",
        "Lokasi Kerja",
        hrdInfo.lokasiKerja,
        updatedValues.lokasiKerja,
      );
      trackChange("mentor", "Mentor", hrdInfo.mentor, updatedValues.mentor);
      trackChange(
        "evaluator",
        "Evaluator",
        hrdInfo.evaluator,
        updatedValues.evaluator,
      );
      trackChange(
        "nomorSK",
        "No SK Pengangkatan",
        hrdInfo.nomorSK,
        updatedValues.nomorSK,
      );
      trackChange(
        "tanggalEvaluasi",
        "Tanggal Evaluasi",
        hrdInfo.tanggalEvaluasi,
        updatedValues.tanggalEvaluasi,
      );

      // Payroll changes
      trackChange(
        "gajiPokok",
        "Gaji Pokok",
        hrdInfo.gajiPokok,
        updatedValues.gajiPokok,
      );
      trackChange(
        "bonusInsentif",
        "Bonus/Insentif",
        hrdInfo.bonusInsentif,
        updatedValues.bonusInsentif,
      );

      if (editingSection === "kontrak") {
        const type = updatedValues.employeeType || "Belum Diatur";
        let start = "";
        let end = "";
        if (type === "Magang") {
          start =
            updatedValues.contractStartDate ||
            (updatedValues as any).internshipStartDate ||
            "";
          end =
            updatedValues.contractEndDate ||
            (updatedValues as any).internshipEndDate ||
            "";
        } else if (type === "Probation" || type === "Percobaan") {
          start =
            updatedValues.probationStartDate ||
            updatedValues.contractStartDate ||
            "";
          end =
            updatedValues.probationEndDate ||
            updatedValues.contractEndDate ||
            "";
        } else {
          start =
            updatedValues.contractStartDate || updatedValues.kontrakMulai || "";
          end =
            updatedValues.contractEndDate || updatedValues.kontrakSelesai || "";
        }

        let status = "Draft";
        if (start) {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const startDate = new Date(start);
          startDate.setHours(0, 0, 0, 0);

          if (now < startDate) {
            status = "Terjadwal";
          } else if (type === "Tetap" || type === "Karyawan Tetap") {
            status = "Aktif";
          } else {
            if (!end) {
              status = "Draft";
            } else {
              const endDate = new Date(end);
              endDate.setHours(0, 0, 0, 0);
              if (now > endDate) {
                status = "Expired";
              } else {
                status = "Aktif";
              }
            }
          }
        }

        if (updatedValues.contractCycleStatus !== "Selesai") {
          updatedValues.contractCycleStatus = status;
          (updatedValues as any).contractCycleStatusLabel = status;
          updatedValues.statusKontrak = status;
        }
      }

      // Save to employee_profiles.hrdEmploymentInfo
      const profileRef = doc(firestore, "employee_profiles", employeeId);
      await setDoc(
        profileRef,
        {
          hrdEmploymentInfo: { ...updatedValues, updatedAt: serverTimestamp() },
        },
        { merge: true },
      );

      // Save to employees collection for master data sync
      const empRef = doc(firestore, "employees", employeeId);
      await setDoc(
        empRef,
        {
          brandId: updatedValues.brandId,
          brandName: updatedValues.brandName,
          divisionId: updatedValues.divisionId,
          divisionName: updatedValues.divisionName,
          structuralPosition: updatedValues.structuralPosition,
          workRole: updatedValues.workRole,
          employeeType:
            updatedValues.employeeType || updatedValues.tipeKaryawan,
          employeeId: updatedValues.employeeId,
          employmentStatus:
            updatedValues.employmentStatus || updatedValues.statusKerja,
          sistemKerja: updatedValues.sistemKerja,
          workSystem: updatedValues.sistemKerja,
          directSupervisorUid: updatedValues.directSupervisorUid,
          directSupervisorName: updatedValues.directSupervisorName,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Sync root profile — ONLY structural fields, never touch identity fields
      const isDM = updatedValues.structuralPosition === 'division_manager';
      
      // Helper: remove undefined/null/empty-string values to prevent Firestore overwrite
      const sanitizePayload = (obj: Record<string, any>) => {
        return Object.fromEntries(
          Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        );
      };

      // Build a structural-only payload — NEVER includes identity fields
      const supervisorFields = isManagementLevel
        ? { directManagerId: null, directManagerName: null, directSupervisorUid: null, directSupervisorName: null, directSuperiorSource: "not_required_management_level" }
        : {
            directManagerId: (updatedValues as any).directSupervisorUid || undefined,
            directManagerName: (updatedValues as any).directSupervisorName || undefined,
            directSupervisorUid: (updatedValues as any).directSupervisorUid || undefined,
            directSupervisorName: (updatedValues as any).directSupervisorName || undefined,
            directSuperiorSource: (updatedValues as any).directSuperiorSource || undefined,
          };

      const structuralPayload = {
        ...sanitizePayload({
          brandId: updatedValues.brandId,
          brandName: updatedValues.brandName || undefined,
          divisionId: updatedValues.divisionId,
          divisionName: updatedValues.divisionName || undefined,
          structuralPosition: updatedValues.structuralPosition,
          structuralLevel: updatedValues.structuralPosition || undefined,
          position: updatedValues.workRole || undefined,
          workRole: updatedValues.workRole || undefined,
          isDivisionManager: isDM,
          directManagerOverrideReason: isOverrideActive ? ((updatedValues as any).directManagerOverrideReason || undefined) : undefined,
          isOverrideActive: isOverrideActive,
          structureUpdatedAt: serverTimestamp(),
          structureUpdatedBy: userProfile?.uid || undefined,
        }),
        ...supervisorFields,
      };
      
      // Use merge:true to guarantee identity fields are NEVER overwritten
      await setDoc(profileRef, structuralPayload, { merge: true });
      const userRef = doc(firestore, "users", employeeId);
      await setDoc(userRef, structuralPayload, { merge: true });

      if (isDM && updatedValues.brandId && updatedValues.divisionId) {
        const selectedDiv = divisions?.find(d => d.id === updatedValues.divisionId);
        if (selectedDiv && selectedDiv.managerId && selectedDiv.managerId !== employeeId) {
          const oldResetData = {
              isDivisionManager: false,
              structuralLevel: 'staff',
              structuralPosition: 'staff',
              updatedAt: serverTimestamp()
          };
          await updateDoc(doc(firestore, 'users', selectedDiv.managerId), oldResetData);
          await setDoc(doc(firestore, 'employee_profiles', selectedDiv.managerId), oldResetData, { merge: true });
        }

        const divDocRef = doc(firestore, 'brands', updatedValues.brandId, 'divisions', updatedValues.divisionId);
        await setDoc(divDocRef, {
          managerId: employeeId,
          managerName: normalizedData?.fullName || "",
          managerEmployeeId: updatedValues.employeeId || "",
          managerDirectSupervisorId: updatedValues.directSupervisorUid || null,
          managerDirectSupervisorName: updatedValues.directSupervisorName || null,
          brandId: updatedValues.brandId,
          divisionId: updatedValues.divisionId,
          divisionName: updatedValues.divisionName
        }, { merge: true });
        const otherManagersQuery = query(
          collection(firestore, 'users'),
          where('structuralLevel', '==', 'division_manager'),
          where('brandId', '==', updatedValues.brandId),
          where('divisionId', '==', updatedValues.divisionId)
        );
        const snap = await getDocs(otherManagersQuery);
        for (const docObj of snap.docs) {
          if (docObj.id !== employeeId) {
            const resetData = {
              isDivisionManager: false,
              structuralLevel: 'staff',
              structuralPosition: 'Staff',
              workRole: 'Staff',
              updatedAt: serverTimestamp()
            };
            await setDoc(doc(firestore, 'users', docObj.id), resetData, { merge: true });
            await setDoc(doc(firestore, 'employee_profiles', docObj.id), resetData, { merge: true });
          }
        }
      } else if (!isDM && (normalizedData?.structuralPosition === 'division_manager' || normalizedData?.isDivisionManager)) {
        if (normalizedData?.brandId && normalizedData?.divisionId) {
          const oldDivRef = doc(firestore, 'brands', normalizedData.brandId, 'divisions', normalizedData.divisionId);
          await setDoc(oldDivRef, {
            managerId: null,
            managerName: null,
            managerEmployeeId: null,
            managerDirectSupervisorId: null,
            managerDirectSupervisorName: null,
            managerDirectSupervisorTitle: null
          }, { merge: true });
        }
      }
      if (normalizedData?.structuralPosition === 'division_manager' && 
          (normalizedData.brandId !== updatedValues.brandId || normalizedData.divisionId !== updatedValues.divisionId)) {
        if (normalizedData.brandId && normalizedData.divisionId) {
          const oldDivDocRef = doc(firestore, 'brands', normalizedData.brandId, 'divisions', normalizedData.divisionId);
          await setDoc(oldDivDocRef, { managerId: "", managerName: "", managerEmployeeId: "" }, { merge: true });
        }
      }

      // Save history
      if (changes.length > 0) {
        const historyCol = collection(
          firestore,
          "employees",
          employeeId,
          "employment_history",
        );
        for (const change of changes) {
          // Use cuti-specific fields if available
          const effectiveDate = editingSection === "cuti"
            ? (values as any).cutiEffectiveDate || format(new Date(), "yyyy-MM-dd")
            : updatedValues.tanggalEfektif || format(new Date(), "yyyy-MM-dd");
          const note = editingSection === "cuti"
            ? (values as any).cutiChangeReason || "Update data cuti"
            : updatedValues.catatanAdministrasi || "Update administrasi HRD rutin";

          await addDoc(historyCol, {
            ...change,
            type: editingSection || "payroll_update",
            effectiveDate,
            note,
            changedAt: serverTimestamp(),
            changedBy: firebaseUser.uid,
            changedByName: userProfile.fullName,
          });
        }
      }

      toast({
        title: "Tersimpan",
        description: `Data ${editingSection || "kepegawaian"} berhasil diperbarui.`,
      });

      // Force immediate re-fetch for all relevant data
      mutateProfile?.();
      mutateEmp?.();
      mutateUser?.();

      setEditingSection(null);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAttendanceSettings = async (
    settings: AttendanceSettings,
  ) => {
    if (!firebaseUser || !userProfile || !employeeId) return;
    try {
      const profileRef = doc(firestore, "employee_profiles", employeeId);
      await setDoc(
        profileRef,
        {
          attendanceMethod: settings.method,
          attendanceRequired: settings.required,
          attendanceLocationMode: settings.locationMode,
          attendanceSiteIds: settings.siteIds,
          attendancePolicyNote: settings.policyNote || "",
          attendanceUpdatedAt: serverTimestamp(),
          attendanceUpdatedBy: firebaseUser.uid,
          attendanceUpdatedByName: userProfile.fullName,
        },
        { merge: true }
      );

      // Trigger re-fetch
      mutateProfile?.();

      setAttendanceDialogOpen(false);
    } catch (error) {
      console.error("Error saving attendance settings:", error);
      throw error;
    }
  };

  const handleAddCareerHistory = async (data: {
    type: string;
    title: string;
    description: string;
    effectiveDate: string;
    notes: string;
  }) => {
    if (!firebaseUser || !userProfile || !employeeId) return;
    setIsSaving(true);
    try {
      const historyCol = collection(
        firestore,
        "employees",
        employeeId,
        "employment_history",
      );
      await addDoc(historyCol, {
        type: data.type,
        title: data.title,
        field: "career_event",
        oldValue: "-",
        newValue: data.description,
        note: data.notes,
        effectiveDate: data.effectiveDate,
        changedAt: serverTimestamp(),
        changedBy: firebaseUser.uid,
        changedByName: userProfile.fullName,
      });

      toast({
        title: "Riwayat Ditambahkan",
        description: "Event karier baru telah dicatat dalam timeline.",
      });
      setEditingSection(null);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menambah Riwayat",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasAccess) return null;

  if (isLoading) {
    return (
      <>
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-96 w-full" />
      </>
    );
  }

  // Derive display name/email — comprehensive fallback to survive identity field loss
  const fullName =
    empDoc?.fullName ||
    (empDoc as any)?.employeeName ||
    (empDoc as any)?.name ||
    profileDoc?.fullName ||
    (profileDoc as any)?.employeeName ||
    (profileDoc as any)?.name ||
    (profileDoc as any)?.displayName ||
    (profileDoc?.dataDiriIdentitas as any)?.namaLengkap ||
    (profileDoc?.dataDiriIdentitas as any)?.namaPanggilan ||
    (profileDoc?.dataDiriIdentitas as any)?.fullName ||
    userDoc?.fullName ||
    (userDoc as any)?.displayName ||
    (userDoc as any)?.name ||
    "Nama belum tersedia";
  const email =
    empDoc?.email ||
    profileDoc?.email ||
    (profileDoc?.dataDiriIdentitas as any)?.personalEmail ||
    (profileDoc?.dataDiriIdentitas as any)?.email ||
    userDoc?.email ||
    "";
  const completeness = calculateProfileCompleteness(profileDoc ?? null);

  const dd: any = profileDoc?.dataDiriIdentitas ?? {};
  const al: any = profileDoc?.alamat ?? {};
  const docAdmin: any = profileDoc?.dokumenAdministratif ?? {};
  const rek: any = profileDoc?.dataRekening ?? {};
  const contacts: any[] = profileDoc?.kontakDarurat ?? [];
  const pp: any = profileDoc?.pendidikanDanPengembangan ?? {};
  const docsObj: any = (profileDoc as any)?.documents ?? {};

  const docUrls = getEmployeeDocumentUrls(profileDoc);
  const profilePhotoUrl = docUrls.profilePhotoUrl;
  const ktpPhotoUrl = docUrls.ktpPhotoUrl;
  const ijazahUrl = docUrls.ijazahUrl;
  const npwpUrl = docUrls.npwpUrl;
  const bpjsKesUrl = docUrls.bpjsKesehatanUrl;
  const bpjsKetUrl = docUrls.bpjsKetenagakerjaanUrl;
  const buktiRekeningUrl = docUrls.bankProofUrl;

  const safeSrc = (src?: unknown): string | null =>
    typeof src === "string" && src.trim().length > 0 ? src.trim() : null;

  const extractProfilePhotoFileId = (): string | null => {
    const profilePhotoFile =
      (profileDoc as any)?.dataDiriIdentitas?.profilePhotoFile ||
      (profileDoc as any)?.profilePhotoFile;
    const profilePhotoFileId = safeSrc(profilePhotoFile?.fileId);
    if (profilePhotoFileId) return profilePhotoFileId;

    const safeProfilePhotoUrl = safeSrc(profilePhotoUrl);
    if (safeProfilePhotoUrl) {
      const match = safeProfilePhotoUrl.match(/fileId=([^&]+)/);
      if (match?.[1]) return match[1].trim();
    }

    return null;
  };

  const profilePhotoFileId = safeSrc(extractProfilePhotoFileId());

  const employeePhone = dd.phone || "";
  const employeeIdLabel =
    hrdInfo.employeeId ||
    (empDoc as any)?.employeeId ||
    (empDoc as any)?.employeeCode ||
    (empDoc as any)?.nomorIndukKaryawan ||
    "-";

  const rawEmployeeType =
    hrdInfo.employeeType ||
    (empDoc as any)?.employeeType ||
    normalizedData?.tipeKaryawan ||
    "Belum Diatur";
  let employeeTypeBadgeLabel = rawEmployeeType;
  const _lowerType = rawEmployeeType.toLowerCase();
  if (_lowerType.includes("kontrak")) employeeTypeBadgeLabel = "Kontrak";
  else if (_lowerType.includes("tetap") || _lowerType === "karyawan tetap")
    employeeTypeBadgeLabel = "Tetap";
  else if (_lowerType.includes("probation") || _lowerType === "percobaan")
    employeeTypeBadgeLabel = "Probation";
  else if (_lowerType.includes("magang")) employeeTypeBadgeLabel = "Magang";

  const isMagang = _lowerType.includes("magang") || _lowerType.includes("training");

  const rawEmploymentStatus =
    hrdInfo.employmentStatus ||
    (empDoc as any)?.employmentStatus ||
    normalizedData?.statusKerja ||
    "Belum Diatur";

  // Detect if employee is at direction level
  const isDirectionLevel = (pos?: string) => {
    if (!pos) return false;
    const p = pos.toLowerCase();
    return p.includes("direksi") || p.includes("direktur") || p.includes("director");
  };

  // Detect management/director level for division handling
  const isManagementLevel = (value?: string | null) => {
    const normalized = String(value || "").toLowerCase();
    return (
      normalized.includes("direksi") ||
      normalized.includes("direktur") ||
      normalized.includes("director") ||
      normalized.includes("manajemen") ||
      normalized.includes("management")
    );
  };

  const structuralPos = hrdStruktur?.structuralPosition || normalizedData?.structuralPosition || "";

  const brandLabel = hrdInfo.brandName ||
    (empDoc as any)?.brandName ||
    (empDoc as any)?.brand ||
    "Belum diisi";

  const divisionLabel = isManagementLevel(structuralPos)
    ? "Tidak berlaku untuk Direksi"
    : hrdInfo.divisionName ||
        (empDoc as any)?.divisionName ||
        normalizedData?.divisi ||
        "Belum diisi";
  const positionLabel =
    hrdInfo.workRole ||
    (empDoc as any)?.workRole ||
    normalizedData?.jabatan ||
    (empDoc as any)?.jobTitle ||
    "Belum diisi";
  const supervisorLabel =
    hrdInfo.directSupervisorName ||
    (empDoc as any)?.directSupervisorName ||
    (empDoc as any)?.supervisorName ||
    "Belum diisi";

  const employmentStatusLabel = rawEmploymentStatus;
  const employmentStatusClass = (employmentStatusLabel || "")
    .toLowerCase()
    .includes("aktif")
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
    : (employmentStatusLabel || "").toLowerCase().includes("resigned") ||
        (employmentStatusLabel || "").toLowerCase().includes("terminated")
      ? "bg-red-500/15 text-red-400 border-red-500/20"
      : "bg-blue-500/15 text-blue-400 border-blue-500/20";

  const employeeTypeBadgeClass =
    employeeTypeBadgeLabel === "Tetap"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
      : employeeTypeBadgeLabel === "Kontrak"
        ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
        : employeeTypeBadgeLabel === "Probation"
          ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
          : employeeTypeBadgeLabel === "Magang"
            ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/20"
            : employeeTypeBadgeLabel.toLowerCase().includes("nonaktif") ||
                employeeTypeBadgeLabel.toLowerCase().includes("resigned")
              ? "bg-red-500/15 text-red-400 border-red-500/20"
              : "bg-slate-500/15 text-slate-400 border-slate-500/20";

  const actionItems: string[] = [];
  if (!isManagementLevel(structuralPos) && !hrdStruktur?.brandName)
    actionItems.push("Brand / Perusahaan belum diatur.");
  if (!isManagementLevel(structuralPos) && !hrdStruktur?.divisi)
    actionItems.push("Divisi belum diatur.");
  if (!hrdStruktur?.jabatan)
    actionItems.push("Jabatan belum diatur.");

  if (hrdStruktur?.statusKerja === "Belum diatur")
    actionItems.push("Status Kerja belum diatur.");
  if (!buktiRekeningUrl)
    actionItems.push("Bukti rekening payroll belum diunggah karyawan.");
  if (!ktpPhotoUrl) actionItems.push("KTP karyawan belum diunggah.");
  if (completeness.status !== "complete")
    actionItems.push("Karyawan belum melengkapi profil mandiri 100%.");

  const sidebarMenuItems = [
    { id: "ringkasan", label: "Ringkasan", icon: Briefcase },
    { id: "pribadi", label: "Profil Pribadi", icon: User },
    { id: "alamat", label: "Alamat & Kontak", icon: MapPin },
    { id: "kehadiran", label: "Kehadiran & Absensi", icon: Clock },
    { id: "rekening", label: "Rekening & Payroll", icon: CreditCard },
    { id: "pendidikan", label: "Pendidikan", icon: GraduationCap },
    { id: "dokumen", label: "Dokumen", icon: FileText },
    { id: "hrd", label: "Kepegawaian HRD", icon: ShieldCheck },
    { id: "lembur", label: "Riwayat Lembur", icon: ClipboardList },
    { id: "riwayat", label: "Riwayat", icon: History },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-[100px]"></div>
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500/5 blur-[100px]"></div>

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-emerald-500/80">
                  NIK: {employeeIdLabel}
                </p>
                <Badge
                  variant="outline"
                  className={`rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest ${employeeTypeBadgeClass}`}
                >
                  {employeeTypeBadgeLabel}
                </Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
                {fullName}
              </h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 text-sm">
                  <Mail className="h-4 w-4 text-slate-500" />
                  {email || "-"}
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Phone className="h-4 w-4 text-slate-500" />
                  {employeePhone || "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              className="rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-6 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              onClick={() => router.push("/admin/hrd/employee-data/karyawan")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
            <Button
              className="rounded-2xl bg-emerald-600 px-6 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
              onClick={() => {
                setActiveTab("hrd");
                setEditingSection("struktur");
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Quick Action
            </Button>
            <div className="h-10 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2 hidden sm:block"></div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-72 flex-shrink-0">
          <div className="sticky top-8 space-y-2 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 p-4 backdrop-blur-xl">
            <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
              Navigation
            </p>
            {sidebarMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium transition-all duration-300 ${
                  activeTab === item.id
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 ${activeTab === item.id ? "text-white" : "text-slate-400 dark:text-slate-500"}`}
                />
                {item.label}
                {item.id === "dokumen" && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">
                    8
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <TabsContent value="ringkasan" className="space-y-8">
                {actionItems.length > 0 && (
                  <Card className="overflow-hidden border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 backdrop-blur-md">
                    <div className="flex">
                      <div className="w-1.5 bg-amber-500"></div>
                      <div className="flex-1 p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-200 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
                            <AlertOctagon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-amber-900 dark:text-amber-200">
                              Perhatian: Data Belum Lengkap
                            </h3>
                            <p className="text-sm text-amber-800 dark:text-amber-400/80">
                              Terdapat beberapa item yang memerlukan tindakan
                              administrasi HRD.
                            </p>
                          </div>
                        </div>
                        <ul className="grid gap-3 sm:grid-cols-2">
                          {actionItems.map((item, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3 rounded-2xl bg-amber-100 dark:bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200/80 ring-1 ring-amber-300 dark:ring-amber-500/10"
                            >
                              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Summary Column */}
                  <div className="space-y-8">
                    <Card className="overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <User className="h-5 w-5 text-emerald-500" />
                          Quick Profile
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="p-6 flex flex-col items-center text-center border-b border-slate-200 dark:border-slate-800/50">
                          <div className="relative mb-4 group">
                            <div className="h-32 w-32 rounded-[2.5rem] bg-slate-100 dark:bg-slate-800 p-1 ring-1 ring-slate-200 dark:ring-slate-700 shadow-2xl transition-transform duration-500 group-hover:scale-105 flex items-center justify-center overflow-hidden">
                              {profilePhotoFileId ? (
                                <SecureDriveImage
                                  fileId={profilePhotoFileId}
                                  alt={fullName}
                                  className="w-full h-full object-cover rounded-[2.5rem]"
                                  fallbackIcon={
                                    <User className="h-12 w-12 text-slate-400" />
                                  }
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center rounded-[2.5rem] bg-slate-100 dark:bg-slate-800">
                                  <User className="h-12 w-12 text-slate-400" />
                                </div>
                              )}
                            </div>
                          </div>
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                            {fullName}
                          </h2>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            {positionLabel}
                          </p>
                          <div className="flex gap-2">
                            <Badge className={employmentStatusClass}>
                              {employmentStatusLabel}
                            </Badge>
                          </div>
                        </div>
                        <div className="p-6 space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">
                              Profile Completeness
                            </span>
                            <span className="text-emerald-400 font-bold">
                              {completeness.percentage}%
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                              style={{ width: `${completeness.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader>
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
                          Informasi Dasar
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <DataRow label="NIK (KTP)" value={dd.nik} />
                        <DataRow
                          label="Nomor Induk Karyawan"
                          value={employeeIdLabel}
                        />
                        <DataRow label="Phone" value={employeePhone} />
                        <DataRow label="Work Email" value={email} />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detail Column */}
                  <div className="lg:col-span-2 space-y-8">
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                            Struktur & Penempatan
                          </CardTitle>
                          <CardDescription className="text-slate-500">
                            Detail hierarki dan lokasi kerja saat ini.
                          </CardDescription>
                        </div>
                        <Building2 className="h-8 w-8 text-slate-800 opacity-20" />
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                          <DataRow label="Brand / Unit" value={brandLabel} />
                          {!isManagementLevel(structuralPos) && <DataRow label="Division" value={divisionLabel} />}
                          <DataRow label="Position" value={positionLabel} />
                          <DataRow
                            label="Manager/Atasan"
                            value={supervisorLabel}
                          />
                          <DataRow
                            label="Lokasi Kerja"
                            value={
                              hrdInfo.workLocation ||
                              hrdInfo.lokasiKerja ||
                              "Belum diisi"
                            }
                          />
                          <DataRow
                            label="Sistem Kerja"
                            value={
                              hrdInfo.sistemKerja ||
                              hrdInfo.workSystem ||
                              "Belum diisi"
                            }
                          />
                          <DataRow
                            label="Tipe Karyawan"
                            value={employeeTypeBadgeLabel}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl overflow-hidden">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                          Ringkasan Payroll
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="rounded-3xl bg-slate-50 dark:bg-slate-900/50 p-6 border border-slate-200 dark:border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                              Rekening
                            </p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white truncate">
                              {rek.bankName || "N/A"}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">
                              {rek.bankAccountNumber || "N/A"}
                            </p>
                          </div>
                          <div className="rounded-3xl bg-slate-50 dark:bg-slate-900/50 p-6 border border-slate-200 dark:border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                              Gaji Pokok
                            </p>
                            <p className="text-lg font-bold text-emerald-400">
                              {hrdInfo.gajiPokok
                                ? `Rp ${hrdInfo.gajiPokok.toLocaleString()}`
                                : "Confidential"}
                            </p>
                          </div>
                          <div className="rounded-3xl bg-slate-50 dark:bg-slate-900/50 p-6 border border-slate-200 dark:border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                              Masa Kerja
                            </p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">
                              {hrdInfo.tanggalMasuk
                                ? format(
                                    new Date(hrdInfo.tanggalMasuk),
                                    "dd MMM yyyy",
                                  )
                                : "N/A"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pribadi" className="space-y-8">
                <VerificationActionCard
                  employeeId={employeeId}
                  group="identity"
                  title="Identitas Pribadi & Fisik"
                  currentStatus={profileDoc?.verificationStatus?.identity}
                  currentNotes={profileDoc?.verificationNotes?.identity}
                />
                <VerificationActionCard
                  employeeId={employeeId}
                  group="family"
                  title="Data Keluarga"
                  currentStatus={profileDoc?.verificationStatus?.family}
                  currentNotes={profileDoc?.verificationNotes?.family}
                />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                          <User className="h-5 w-5 text-blue-500" />
                          Identitas Pribadi
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                          <DataRow label="Nama Lengkap" value={dd.fullName} />
                          <DataRow label="Nama Panggilan" value={dd.nickName} />
                          <DataRow label="Jenis Kelamin" value={dd.gender} />
                          <DataRow label="Tempat Lahir" value={dd.birthPlace} />
                          <DataRow label="Tanggal Lahir" value={dd.birthDate} />
                          <DataRow label="Agama" value={dd.religion} />
                          <DataRow
                            label="Status Pernikahan"
                            value={dd.maritalStatus}
                          />
                          <DataRow
                            label="Kewarganegaraan"
                            value={dd.nationality}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                          <Heart className="h-5 w-5 text-red-500" />
                          Kesehatan & Fisik
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                          <DataRow
                            label="Golongan Darah"
                            value={dd.bloodType || dd.golonganDarah}
                          />
                          <DataRow
                            label="Tinggi Badan (cm)"
                            value={dd.heightCm || dd.tinggiBadan}
                          />
                          <DataRow
                            label="Berat Badan (kg)"
                            value={dd.weightKg || dd.beratBadan}
                          />
                          <DataRow
                            label="Kondisi Fisik"
                            value={dd.hasPhysicalCondition}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <UsersIcon className="h-5 w-5 text-purple-500" />
                          Keluarga & Tanggungan
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        {(profileDoc?.dataKeluarga?.saudaraKandung?.length ??
                          0) > 0 ||
                        (profileDoc?.dataKeluarga?.tanggungan?.length ?? 0) >
                          0 ? (
                          <div className="space-y-8">
                            {/* Saudara Kandung */}
                            {profileDoc?.dataKeluarga?.saudaraKandung &&
                              profileDoc.dataKeluarga.saudaraKandung.length >
                                0 && (
                                <div className="space-y-4">
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Saudara Kandung
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {profileDoc.dataKeluarga.saudaraKandung.map(
                                      (k: any, i: number) => (
                                        <div
                                          key={i}
                                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6"
                                        >
                                          <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-bold text-slate-900 dark:text-white">
                                              {k.name}
                                            </h4>
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] uppercase border-blue-500/20 text-blue-400"
                                            >
                                              Saudara
                                            </Badge>
                                          </div>
                                          <DataRow
                                            label="Pekerjaan"
                                            value={k.occupation}
                                          />
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                            {/* Tanggungan / Istri / Suami / Anak */}
                            {profileDoc?.dataKeluarga?.tanggungan &&
                              profileDoc.dataKeluarga.tanggungan.length > 0 && (
                                <div className="space-y-4">
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Tanggungan (Istri/Suami/Anak)
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {profileDoc.dataKeluarga.tanggungan.map(
                                      (k: any, i: number) => (
                                        <div
                                          key={i}
                                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6"
                                        >
                                          <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-bold text-slate-900 dark:text-white">
                                              {k.name}
                                            </h4>
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] uppercase border-emerald-500/20 text-emerald-400"
                                            >
                                              {k.relation || "Tanggungan"}
                                            </Badge>
                                          </div>
                                          <DataRow
                                            label="Pekerjaan"
                                            value={k.occupation}
                                          />
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                          </div>
                        ) : (
                          <div className="text-center py-10 text-slate-500 italic text-sm">
                            Data keluarga belum diisi.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-8">
                    <DocumentPreviewCard
                      label="Foto KTP"
                      url={ktpPhotoUrl}
                      status={ktpPhotoUrl ? "Sudah Upload" : "Belum Upload"}
                      type="Identity"
                      value={dd.nik}
                    />

                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader>
                        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Kontak Darurat
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {contacts.length > 0 ? (
                          contacts.map((c, i) => (
                            <div
                              key={i}
                              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800"
                            >
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {c.name}
                              </p>
                              <p className="text-[10px] text-emerald-500 uppercase font-bold">
                                {c.relation}
                              </p>
                              <p className="text-xs text-slate-400 mt-2">
                                {c.phone}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-600 italic">
                            Belum ada kontak darurat.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="alamat" className="space-y-8">
                <VerificationActionCard
                  employeeId={employeeId}
                  group="address"
                  title="Alamat Lengkap"
                  currentStatus={profileDoc?.verificationStatus?.address}
                  currentNotes={profileDoc?.verificationNotes?.address}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                        <MapPin className="h-5 w-5 text-emerald-500" />
                        Alamat Sesuai KTP
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 p-8 min-h-[120px] flex items-center shadow-inner">
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed italic text-lg">
                          {formatAddress(al.ktp) ||
                            "Alamat KTP belum dilengkapi."}
                        </p>
                      </div>
                      {/* Address Breakdown - KTP */}
                      {(() => {
                        const ktpComponents = extractAddressComponents(al.ktp);
                        return (
                          <div className="mt-6 space-y-4">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Detail Alamat KTP</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Provinsi</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.province || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Kabupaten/Kota</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.city || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Kecamatan</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.district || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Desa/Kelurahan</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.village || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Jalan / Nama Jalan</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.street || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">RT</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.rt || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">RW</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.rw || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Kode Pos</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{ktpComponents.postalCode || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                        <MapPin className="h-5 w-5 text-blue-500" />
                        Alamat Domisili
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 p-8 min-h-[120px] flex items-center shadow-inner">
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed italic text-lg">
                          {formatAddress(al.domisili) ||
                            "Alamat domisili belum dilengkapi."}
                        </p>
                      </div>
                      {/* Address Breakdown - Domisili */}
                      {(() => {
                        const domicileComponents = extractAddressComponents(al.domisili);
                        return (
                          <div className="mt-6 space-y-4">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Detail Alamat Domisili</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Provinsi</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.province || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Kabupaten/Kota</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.city || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Kecamatan</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.district || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Desa/Kelurahan</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.village || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Jalan / Nama Jalan</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.street || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">RT</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.rt || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">RW</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.rw || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Kode Pos</p>
                                <p className="text-sm text-slate-800 dark:text-slate-200">{domicileComponents.postalCode || <span className="text-slate-500">Belum diisi</span>}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="kehadiran" className="space-y-8">
                <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 overflow-hidden">
                  <CardHeader className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                        <Clock className="h-5 w-5 text-teal-500" />
                        Kehadiran & Absensi
                      </CardTitle>
                      {(userProfile?.role === "hrd" ||
                        userProfile?.role === "super-admin") && (
                        <Button
                          size="sm"
                          className="bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-800"
                          onClick={() => setAttendanceDialogOpen(true)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Atur Metode Absensi
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    {profileDoc?.attendanceMethod ? (
                      <div className="space-y-5">
                        {/* Method display card */}
                        <div className={`flex items-center gap-4 p-4 rounded-xl border-2 ${
                          profileDoc.attendanceMethod === "fingerprint"
                            ? "border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20"
                            : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
                        }`}>
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            profileDoc.attendanceMethod === "fingerprint"
                              ? "bg-teal-100 dark:bg-teal-800 text-teal-600 dark:text-teal-300"
                              : "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300"
                          }`}>
                            {profileDoc.attendanceMethod === "fingerprint" || profileDoc.attendanceMethod === "id_card"
                              ? <CreditCard className="h-5 w-5" />
                              : <Monitor className="h-5 w-5" />
                            }
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-0.5">
                              Metode Absensi
                            </p>
                            <p className={`text-sm font-semibold ${
                              profileDoc.attendanceMethod === "fingerprint" || profileDoc.attendanceMethod === "id_card"
                                ? "text-teal-700 dark:text-teal-300"
                                : "text-blue-700 dark:text-blue-300"
                            }`}>
                              {profileDoc.attendanceMethod === "fingerprint" || profileDoc.attendanceMethod === "id_card" ? "ID Card" : "Web Absen"}
                            </p>
                          </div>
                        </div>

                        {/* Audit Trail */}
                        {profileDoc?.attendanceUpdatedAt && (
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                              Diatur oleh{" "}
                              <span className="font-medium text-slate-700 dark:text-slate-400">
                                {profileDoc.attendanceUpdatedByName || "-"}
                              </span>
                              {" pada "}
                              <span className="font-medium text-slate-700 dark:text-slate-400">
                                {profileDoc.attendanceUpdatedAt
                                  ? format(
                                      new Date(
                                        (
                                          profileDoc.attendanceUpdatedAt as any
                                        ).seconds * 1000
                                      ),
                                      "dd MMM yyyy HH:mm",
                                      { locale: idLocale }
                                    )
                                  : "-"}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                        <Clock className="h-12 w-12 text-slate-400 dark:text-slate-600 mx-auto mb-4 opacity-50" />
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                          Metode absensi belum diatur untuk karyawan ini
                        </p>
                        {(userProfile?.role === "hrd" ||
                          userProfile?.role === "super-admin") && (
                          <Button
                            className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-600 dark:hover:bg-teal-500"
                            onClick={() => setAttendanceDialogOpen(true)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Atur Metode Absensi
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="rekening" className="space-y-8">
                <VerificationActionCard
                  employeeId={employeeId}
                  group="bankAccount"
                  title="Rekening Payroll"
                  currentStatus={profileDoc?.verificationStatus?.bankAccount}
                  currentNotes={profileDoc?.verificationNotes?.bankAccount}
                />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl overflow-hidden">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                          <CreditCard className="h-5 w-5 text-emerald-500" />
                          Informasi Rekening & Finansial
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                          <DataRow label="Nama Bank" value={rek.bankName} />
                          <DataRow
                            label="Nomor Rekening"
                            value={rek.bankAccountNumber}
                            className="font-mono text-lg text-emerald-400"
                          />
                          <DataRow
                            label="Atas Nama"
                            value={rek.bankAccountHolderName}
                          />
                          <DataRow label="Cabang" value={rek.bankBranch} />
                        </div>
                      </CardContent>
                    </Card>

                    <VerificationActionCard
                      employeeId={employeeId}
                      group="tax"
                      title="Pajak (NPWP)"
                      currentStatus={profileDoc?.verificationStatus?.tax}
                      currentNotes={profileDoc?.verificationNotes?.tax}
                    />
                    <VerificationActionCard
                      employeeId={employeeId}
                      group="bpjs"
                      title="BPJS"
                      currentStatus={profileDoc?.verificationStatus?.bpjs}
                      currentNotes={profileDoc?.verificationNotes?.bpjs}
                    />
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl overflow-hidden">
                      <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Dokumen Administratif
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                          <DataRow label="Nomor NPWP" value={docAdmin.npwp} />
                          <DataRow
                            label="Nomor BPJS Kesehatan"
                            value={docAdmin.bpjsKesehatan}
                          />
                          <DataRow
                            label="Nomor BPJS Ketenagakerjaan"
                            value={docAdmin.bpjsKetenagakerjaan}
                          />
                          <DataRow
                            label="Nomor SIM"
                            value={docAdmin.simNumber}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-8">
                    <DocumentPreviewCard
                      label="Bukti Rekening / Tabungan"
                      url={buktiRekeningUrl}
                      status={
                        buktiRekeningUrl ? "Sudah Upload" : "Belum Upload"
                      }
                      type="Financial"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pendidikan" className="space-y-8">
                <VerificationActionCard
                  employeeId={employeeId}
                  group="education"
                  title="Pendidikan Terakhir"
                  currentStatus={profileDoc?.verificationStatus?.education}
                  currentNotes={profileDoc?.verificationNotes?.education}
                />
                {/* Pendidikan Terakhir */}
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <div className="h-8 w-1 bg-emerald-500 rounded-full" />
                    Pendidikan Terakhir
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl">
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                          <DataRow
                            label="Jenjang"
                            value={pp.pendidikanTerakhir?.jenjang}
                          />
                          <DataRow
                            label="Institusi"
                            value={pp.pendidikanTerakhir?.namaInstitusi}
                          />
                          <DataRow
                            label="Jurusan"
                            value={pp.pendidikanTerakhir?.jurusan}
                          />
                          <DataRow
                            label="Tahun Lulus"
                            value={pp.pendidikanTerakhir?.tahunLulus}
                          />
                        </div>
                      </CardContent>
                    </Card>
                    <DocumentPreviewCard
                      label="Ijazah Terakhir"
                      url={getEducationDocumentUrl(pp.pendidikanTerakhir)}
                      status={
                        getEducationDocumentUrl(pp.pendidikanTerakhir)
                          ? "Sudah Upload"
                          : "Belum Upload"
                      }
                      type="Education"
                    />
                  </div>
                </div>

                {/* Riwayat Pendidikan Lainnya */}
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <div className="h-8 w-1 bg-blue-500 rounded-full" />
                    Riwayat Pendidikan Lainnya
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pp.riwayatPendidikan?.length ? (
                      pp.riwayatPendidikan.map((edu: any, idx: number) => (
                        <Card
                          key={idx}
                          className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 overflow-hidden"
                        >
                          <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                              {edu.jenjang} - {edu.namaInstitusi}
                            </CardTitle>
                            {getEducationDocumentUrl(edu) ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px]">
                                Sudah Upload
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] opacity-50"
                              >
                                Ijazah belum diunggah
                              </Badge>
                            )}
                          </CardHeader>
                          <CardContent className="p-6">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <DataRow label="Jurusan" value={edu.jurusan} />
                              <DataRow
                                label="Tahun Lulus"
                                value={edu.tahunLulus}
                              />
                            </div>
                            {getEducationDocumentUrl(edu) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50"
                                onClick={() =>
                                   handleOpenSecureUrl(getEducationDocumentUrl(edu))
                                 }
                              >
                                <Eye className="h-3 w-3 mr-2" /> Lihat Bukti
                                Ijazah
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-2 text-center py-10 text-slate-600 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                        Belum ada riwayat tambahan.
                      </div>
                    )}
                  </div>
                </div>

                {/* Sertifikasi */}
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <div className="h-8 w-1 bg-purple-500 rounded-full" />
                    Sertifikasi & Pelatihan
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pp.sertifikasiPelatihan?.length ? (
                      pp.sertifikasiPelatihan.map((cert: any, idx: number) => (
                        <Card
                          key={idx}
                          className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 overflow-hidden"
                        >
                          <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                              {cert.namaSertifikasi}
                            </CardTitle>
                            {getCertificationDocumentUrl(cert) ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px]">
                                Sudah Upload
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] opacity-50"
                              >
                                Sertifikat belum diunggah
                              </Badge>
                            )}
                          </CardHeader>
                          <CardContent className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <DataRow
                                label="Penyelenggara"
                                value={cert.penyelenggara}
                              />
                              <DataRow
                                label="Masa Berlaku"
                                value={`${cert.tahunPerolehan} s/d ${cert.tahunExpired || "Selamanya / Tanpa Masa Berlaku"}`}
                              />
                            </div>
                            {getCertificationDocumentUrl(cert) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50"
                                onClick={() =>
                                   handleOpenSecureUrl(getCertificationDocumentUrl(cert))
                                 }
                              >
                                <Eye className="h-3 w-3 mr-2" /> Lihat
                                Sertifikat
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-2 text-center py-10 text-slate-600 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                        Belum ada sertifikasi.
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dokumen" className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  <DocumentPreviewCard
                    label="Pas Foto Profil"
                    url={profilePhotoUrl}
                    status={profilePhotoUrl ? "Sudah Upload" : "Belum Upload"}
                    type="Photo"
                  />
                  <DocumentPreviewCard
                    label="KTP"
                    url={ktpPhotoUrl}
                    status={ktpPhotoUrl ? "Sudah Upload" : "Belum Upload"}
                    type="Identity"
                    value={dd.nik}
                  />
                  <DocumentPreviewCard
                    label="NPWP"
                    url={npwpUrl}
                    status={getDocumentStatus(
                      docAdmin.npwp,
                      !docAdmin.noNpwp,
                      npwpUrl,
                    )}
                    type="Tax"
                    value={docAdmin.npwp}
                  />
                  <DocumentPreviewCard
                    label="BPJS Kesehatan"
                    url={bpjsKesUrl}
                    status={getDocumentStatus(
                      docAdmin.bpjsKesehatan,
                      !docAdmin.noBpjsKesehatan,
                      bpjsKesUrl,
                    )}
                    type="Insurance"
                    value={docAdmin.bpjsKesehatan}
                  />
                  <DocumentPreviewCard
                    label="BPJS Ketenagakerjaan"
                    url={bpjsKetUrl}
                    status={getDocumentStatus(
                      docAdmin.bpjsKetenagakerjaan,
                      !docAdmin.noBpjsKetenagakerjaan,
                      bpjsKetUrl,
                    )}
                    type="Insurance"
                    value={docAdmin.bpjsKetenagakerjaan}
                  />
                  <DocumentPreviewCard
                    label="Ijazah Terakhir"
                    url={getEducationDocumentUrl(pp.pendidikanTerakhir)}
                    status={
                      getEducationDocumentUrl(pp.pendidikanTerakhir)
                        ? "Sudah Upload"
                        : "Belum Upload"
                    }
                    type="Education"
                  />
                  <DocumentPreviewCard
                    label="Bukti Rekening"
                    url={buktiRekeningUrl}
                    status={buktiRekeningUrl ? "Sudah Upload" : "Belum Upload"}
                    type="Payroll"
                  />
                </div>
              </TabsContent>

              <TabsContent value="hrd" className="space-y-8">
                {isMagang ? (
                  <>
                    {/* MAGANG LAYOUT */}
                    {/* Header Dashboard Magang */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                          Administrasi Magang
                        </h3>
                        <p className="text-sm text-slate-500">
                          Penempatan, periode, dan monitoring magang.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {/* 1. Penempatan Magang */}
                      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-amber-500/30 transition-all duration-300">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                              <MapPin className="h-5 w-5" />
                            </div>
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                              Penempatan Magang
                            </CardTitle>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                            onClick={() => setEditingSection("struktur")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-1 gap-y-2">
                            <DataRow label="Nomor Induk Magang" value={hrdInfo.internId || "Belum diisi"} />
                            <DataRow label="Brand / Unit" value={brandLabel} />
                            {!isManagementLevel(structuralPos) && <DataRow label="Divisi" value={divisionLabel} />}
                            <DataRow label="Role / Posisi Magang" value={hrdInfo.workRole || hrdInfo.internshipRole || "Belum diisi"} />
                            <DataRow label="PIC / Pembimbing Internal" value={supervisorLabel} />
                            <DataRow label="Lokasi Penempatan" value={hrdInfo.internshipLocation || hrdInfo.workLocation || "Belum diisi"} />
                          </div>
                        </CardContent>
                      </Card>

                      {/* 2. Periode Magang */}
                      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-blue-500/30 transition-all duration-300">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                              <Calendar className="h-5 w-5" />
                            </div>
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                              Periode Magang
                            </CardTitle>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                            onClick={() => setEditingSection("kontrak")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-1 gap-y-2">
                            <DataRow label="Jenis Program Magang" value={hrdInfo.internshipProgramType || "Belum diisi"} />
                            <DataRow label="Tanggal Mulai Magang" value={hrdInfo.internshipStartDate || hrdInfo.contractStartDate || "-"} />
                            <DataRow label="Tanggal Selesai Magang" value={hrdInfo.internshipEndDate || hrdInfo.contractEndDate || "-"} />
                            {hrdInfo.internshipStartDate && hrdInfo.internshipEndDate && (
                              <DataRow
                                label="Durasi Magang"
                                value={(() => {
                                  const start = new Date(hrdInfo.internshipStartDate);
                                  const end = new Date(hrdInfo.internshipEndDate);
                                  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                  return `${days} Hari`;
                                })()}
                              />
                            )}
                            <DataRow label="Status Magang" value={hrdInfo.internshipStatus || hrdInfo.employmentStatus || "Aktif"} />
                          </div>
                        </CardContent>
                      </Card>

                      {/* 3. Uang Saku / Insentif */}
                      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-emerald-500/30 transition-all duration-300">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                              <DollarSign className="h-5 w-5" />
                            </div>
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                              Uang Saku / Insentif
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-1 gap-y-2">
                            {hrdInfo.gajiPokok && hrdInfo.gajiPokok > 0 ? (
                              <>
                                <DataRow label="Ada/Tidak Uang Saku" value="Ada" />
                                <DataRow label="Nominal Uang Saku" value={`Rp ${hrdInfo.gajiPokok.toLocaleString("id-ID")}`} />
                              </>
                            ) : (
                              <DataRow label="Ada/Tidak Uang Saku" value="Tidak ada uang saku" />
                            )}
                            <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800/50 mt-2">
                              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                                Rekening Uang Saku
                              </p>
                              {rek.bankName ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white">{rek.bankName}</p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">{rek.bankAccountNumber || "-"}</p>
                                  <p className="text-[10px] text-slate-500 italic">a.n. {rek.bankAccountHolderName || "-"}</p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-600 dark:text-slate-400">Belum diisi</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* 4. Monitoring Magang */}
                      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-purple-500/30 transition-all duration-300">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                              <BarChart3 className="h-5 w-5" />
                            </div>
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                              Monitoring Magang
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-800/50">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Laporan Harian</p>
                              <p className="text-[10px] text-slate-500">Belum tersedia</p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-800/50">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Rekap Kehadiran</p>
                              <p className="text-[10px] text-slate-500">Belum tersedia</p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-800/50">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Evaluasi Pembimbing</p>
                              <p className="text-[10px] text-slate-500">Belum tersedia</p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-800/50">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Feedback Akhir</p>
                              <p className="text-[10px] text-slate-500">Belum tersedia</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <>
                    {/* KARYAWAN LAYOUT */}
                    {/* Header Dashboard HRD */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                          Administrasi Kepegawaian
                        </h3>
                        <p className="text-sm text-slate-500">
                          Pusat data kepegawaian, payroll, dan riwayat karier
                          karyawan.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {/* 1. Struktur & Status Kerja */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-emerald-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Struktur & Status
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => setEditingSection("struktur")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 gap-y-2">
                        <DataRow label="Brand / Unit" value={brandLabel} />
                        {!isManagementLevel(structuralPos) && <DataRow label="Divisi" value={divisionLabel} />}
                        <DataRow
                          label="Jabatan / Fungsi"
                          value={positionLabel}
                        />
                        <DataRow
                          label="Level Struktural"
                          value={
                            hrdStruktur?.structuralPosition ||
                            normalizedData?.structuralPosition
                          }
                        />
                        <DataRow
                          label="Sistem Kerja"
                          value={
                            hrdInfo.sistemKerja ||
                            hrdStruktur?.sistemKerja ||
                            "Belum diatur"
                          }
                        />
                        <DataRow
                          label="Atasan Langsung"
                          value={supervisorLabel}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* 2. Masa Kerja & Kontrak */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-blue-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                          <History className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Masa Kerja & Kontrak
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                        onClick={() => setEditingSection("kontrak")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 gap-y-2">
                        <DataRow
                          label="Jenis Kontrak / Tipe"
                          value={employeeTypeBadgeLabel}
                        />
                        <DataRow
                          label="Status Siklus"
                          value={
                            hrdInfo.contractCycleStatus ||
                            hrdInfo.statusKontrak ||
                            "-"
                          }
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <DataRow
                            label="Tanggal Mulai"
                            value={
                              hrdInfo.contractStartDate ||
                              hrdInfo.probationStartDate ||
                              hrdInfo.kontrakMulai ||
                              hrdInfo.tanggalMasuk ||
                              "-"
                            }
                          />
                          <DataRow
                            label="Tanggal Selesai"
                            value={
                              hrdInfo.contractEndDate ||
                              hrdInfo.probationEndDate ||
                              hrdInfo.kontrakSelesai ||
                              "-"
                            }
                          />
                        </div>
                        <DataRow
                          label="Durasi"
                          value={hrdInfo.durasiKontrak || "-"}
                        />
                        <DataRow
                          label="Hak Cuti Tahunan"
                          value={`${hrdInfo.leaveQuotaAnnual ?? hrdInfo.jatahCuti ?? 0} Hari`}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* 3. Payroll & Benefit */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-emerald-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Payroll & Benefit
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => setEditingSection("payroll")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid grid-cols-1 gap-y-2">
                        <DataRow
                          label="Gaji Pokok"
                          value={
                            hrdInfo.gajiPokok
                              ? `Rp ${hrdInfo.gajiPokok.toLocaleString()}`
                              : "N/A"
                          }
                        />

                        {hrdInfo.allowances &&
                          hrdInfo.allowances.length > 0 && (
                            <div className="space-y-2 mt-2">
                              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                                Rincian Tunjangan
                              </p>
                              {hrdInfo.allowances.map((al: any) => (
                                <div
                                  key={al.id}
                                  className="flex justify-between items-center text-xs py-1 border-b border-slate-200 dark:border-slate-800/50 last:border-0"
                                >
                                  <span className="text-slate-600 dark:text-slate-400">
                                    {al.name}
                                  </span>
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    Rp {al.amount.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <DataRow
                            label="Bonus / Insentif"
                            value={
                              hrdInfo.bonusInsentif
                                ? `Rp ${hrdInfo.bonusInsentif.toLocaleString()}`
                                : "N/A"
                            }
                          />
                          <DataRow
                            label="THR"
                            value={
                              hrdInfo.thr
                                ? `Rp ${hrdInfo.thr.toLocaleString()}`
                                : "N/A"
                            }
                          />
                        </div>

                        <div className="h-px bg-slate-200 dark:bg-slate-800/50 my-2"></div>

                        <div className="space-y-3">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                            BPJS (Kesehatan & TK)
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase">
                                Potongan Karyawan
                              </p>
                              <p className="text-xs font-bold text-red-400">
                                Rp{" "}
                                {(
                                  (hrdInfo.bpjsKesKaryawan || 0) +
                                  (hrdInfo.bpjsTkKaryawan || 0)
                                ).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-500 uppercase">
                                Beban Perusahaan
                              </p>
                              <p className="text-xs font-bold text-emerald-400">
                                Rp{" "}
                                {(
                                  (hrdInfo.bpjsKesPerusahaan || 0) +
                                  (hrdInfo.bpjsTkPerusahaan || 0)
                                ).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/50">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                          Rekening Payroll
                        </p>
                        {hrdInfo.useDifferentPayrollAccount ? (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              {hrdInfo.customPayrollBank || "Belum diatur"}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                              {hrdInfo.customPayrollAccountNumber || "-"}
                            </p>
                            <p className="text-[10px] text-slate-500 italic">
                              a.n. {hrdInfo.customPayrollAccountHolder || "-"}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              {rek.bankName || "N/A"}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                              {rek.bankAccountNumber || "-"}
                            </p>
                            <p className="text-[10px] text-slate-500 italic">
                              a.n. {rek.bankAccountHolderName || "-"}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 4. Kehadiran & Cuti */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-purple-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Kehadiran & Cuti
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-500/10"
                        onClick={() => setEditingSection("cuti")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/50">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                            Sisa Cuti
                          </p>
                          <p className="text-xl font-black text-emerald-400">
                            {hrdInfo.sisaCuti || 0}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              Hari
                            </span>
                          </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/50">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                            Jadwal
                          </p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            {hrdInfo.jadwalKerja || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50">
                          <p className="text-[9px] text-slate-500 uppercase mb-1">
                            Hadir
                          </p>
                          <p className="text-sm font-bold text-emerald-400">
                            {hrdInfo.hadir || 0}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50">
                          <p className="text-[9px] text-slate-500 uppercase mb-1">
                            Telat
                          </p>
                          <p className="text-sm font-bold text-amber-400">
                            {hrdInfo.terlambat || 0}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50">
                          <p className="text-[9px] text-slate-500 uppercase mb-1">
                            Izin/Sakit
                          </p>
                          <p className="text-sm font-bold text-blue-400">
                            {(hrdInfo.izin || 0) + (hrdInfo.sakit || 0)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 5. Karier & Kinerja */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-sky-500/30 transition-all duration-300 xl:col-span-2">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 border border-sky-500/20">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Riwayat Karier & Kinerja
                        </CardTitle>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        onClick={() => setEditingSection("tambah_riwayat")}
                      >
                        <Plus className="h-3.5 w-3.5 mr-2" /> Event Karier
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-8">
                      {historyData && historyData.length > 0 ? (
                        <div className="relative pl-6 space-y-8 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800/50">
                          {historyData.slice(0, 5).map((h: any) => (
                            <div key={h.id} className="relative">
                              <div className="absolute -left-[22px] top-1 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 shadow-lg bg-emerald-500"></div>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                                      {h.title || h.label || h.type}
                                    </p>
                                    <Badge
                                      variant="outline"
                                      className="text-[8px] py-0 border-slate-200 dark:border-slate-800 text-slate-500 uppercase"
                                    >
                                      {h.type}
                                    </Badge>
                                  </div>
                                  <p className="text-[10px] text-slate-500">
                                    {h.changedAt?.toDate
                                      ? format(
                                          h.changedAt.toDate(),
                                          "dd MMM yyyy",
                                        )
                                      : h.effectiveDate}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  {h.newValue || h.note}
                                </p>
                                {h.note && h.newValue && (
                                  <p className="text-[10px] text-slate-500 italic mt-1 italic">
                                    "{h.note}"
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
                          <History className="h-10 w-10 text-slate-600 mb-2" />
                          <p className="text-sm font-medium text-slate-500">
                            Belum ada riwayat karier yang tercatat.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* 6. Catatan Internal HRD */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 backdrop-blur-xl group hover:border-red-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                          <AlertOctagon className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                          Catatan Internal
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => setEditingSection("catatan")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/50 min-h-[150px]">
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed italic">
                          {hrdInfo.catatanInternalHrd ||
                            "Catatan rahasia HRD belum diisi."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                    </div>
                  </>
                )}

                {/* Editing Dialogs */}
                {isMagang ? (
                  <Dialog
                    open={!!editingSection}
                    onOpenChange={(open) => !open && setEditingSection(null)}
                  >
                    <DialogContent className="w-[95vw] md:w-[90vw] max-w-4xl h-[95vh] md:h-[90vh] bg-slate-950 border-slate-800 text-slate-100 flex flex-col p-0 overflow-hidden">
                      {/* Header */}
                      <div className="shrink-0 bg-white dark:bg-slate-900/50 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60 px-6 py-5">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                              <Pencil className="h-5 w-5" />
                            </div>
                            Edit Administrasi Magang
                          </DialogTitle>
                          <DialogDescription className="text-sm text-slate-400 mt-2">
                            Update informasi penempatan dan periode magang.
                          </DialogDescription>
                        </DialogHeader>
                      </div>

                      {/* Form Content */}
                      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                        <Form {...form}>
                          <form
                            onSubmit={form.handleSubmit((data) => {
                              // Validate catatan if important fields changed
                              const importantFieldsChanged =
                                (data.brandId !== hrdInfo.internshipBrandId && data.brandId !== hrdInfo.brandId) ||
                                (data.divisionId !== hrdInfo.internshipDivisionId && data.divisionId !== hrdInfo.divisionId) ||
                                (data.workRole !== hrdInfo.internshipRole) ||
                                (data.directSupervisorUid !== hrdInfo.internshipMentorUid && data.directSupervisorUid !== hrdInfo.directSupervisorUid) ||
                                (data.contractStartDate !== hrdInfo.internshipStartDate && data.contractStartDate !== hrdInfo.contractStartDate) ||
                                (data.contractEndDate !== hrdInfo.internshipEndDate && data.contractEndDate !== hrdInfo.contractEndDate) ||
                                (data.employmentStatus !== hrdInfo.internshipStatus && data.employmentStatus !== hrdInfo.employmentStatus) ||
                                (data.gajiPokok !== hrdInfo.gajiPokok && data.gajiPokok !== 0);

                              if (importantFieldsChanged && !data.structureChangeReason?.trim()) {
                                toast({
                                  variant: "destructive",
                                  title: "Catatan / Alasan Perubahan Wajib Diisi",
                                  description:
                                    "Mohon isi catatan atau alasan perubahan untuk setiap perubahan data penting.",
                                });
                                return;
                              }

                              handleSaveHrd(data);
                            })}
                            className="space-y-6"
                          >
                            {/* Penempatan Magang */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-300 uppercase mb-4">Penempatan Magang</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="internId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Nomor Induk Magang</FormLabel>
                                      <FormControl>
                                        <Input {...field} className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="INT-2024-001" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="brandId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Brand / Unit *</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                            <SelectValue placeholder="Pilih Brand" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          {brands?.map((b) => (
                                            <SelectItem key={b.id} value={b.id || ""}>
                                              {b.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="divisionId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Divisi *</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch("brandId")}>
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                            <SelectValue placeholder="Pilih Divisi" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          {divisions.map((d) => (
                                            <SelectItem key={d.id} value={d.id}>
                                              {d.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="workRole"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Role / Posisi Magang *</FormLabel>
                                      <FormControl>
                                        <Input {...field} className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="Web Developer Intern" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="directSupervisorUid"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">PIC / Pembimbing Internal *</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch("divisionId")}>
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                            <SelectValue placeholder="Pilih PIC" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          {managers.map((m) => (
                                            <SelectItem key={m.uid} value={m.uid}>
                                              {m.fullName}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="workLocation"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Lokasi Penempatan</FormLabel>
                                      <FormControl>
                                        <Input {...field} className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="Jakarta Office" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>

                            {/* Periode Magang */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-300 uppercase mb-4">Periode Magang</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="internshipProgramType"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Jenis Program Magang</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                            <SelectValue placeholder="Pilih Jenis Program" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          <SelectItem value="PKL">PKL (Praktik Kerja Lapangan)</SelectItem>
                                          <SelectItem value="Kampus Merdeka">Kampus Merdeka</SelectItem>
                                          <SelectItem value="Mandiri">Mandiri</SelectItem>
                                          <SelectItem value="Internal">Internal</SelectItem>
                                          <SelectItem value="Lainnya">Lainnya</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="contractStartDate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Tanggal Mulai Magang *</FormLabel>
                                      <FormControl>
                                        <Input type="date" {...field} className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="contractEndDate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Tanggal Selesai Magang *</FormLabel>
                                      <FormControl>
                                        <Input type="date" {...field} className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="employmentStatus"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Status Magang *</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                            <SelectValue placeholder="Pilih Status" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          <SelectItem value="Draft">Draft</SelectItem>
                                          <SelectItem value="Aktif">Aktif</SelectItem>
                                          <SelectItem value="Selesai">Selesai</SelectItem>
                                          <SelectItem value="Diperpanjang">Diperpanjang</SelectItem>
                                          <SelectItem value="Dihentikan">Dihentikan</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>

                            {/* Uang Saku */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-300 uppercase mb-4">Uang Saku / Insentif</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="gajiPokok"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase text-slate-500">Nominal Uang Saku</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          inputMode="numeric"
                                          value={formatCurrency(field.value)}
                                          onChange={(e) => {
                                            const parsed = parseCurrency(e.target.value);
                                            field.onChange(parsed);
                                          }}
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                                          placeholder="Rp 0"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>

                            {/* Catatan / Alasan Perubahan */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-300 uppercase mb-4">Catatan & Alasan Perubahan</h3>
                              <FormField
                                control={form.control}
                                name="structureChangeReason"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase text-slate-500">Catatan / Alasan Perubahan *</FormLabel>
                                    <FormControl>
                                      <Textarea
                                        {...field}
                                        className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                                        placeholder="Contoh: Penyesuaian periode magang, perubahan PIC, atau update nominal uang saku."
                                        rows={4}
                                      />
                                    </FormControl>
                                    <p className="text-xs text-slate-500 mt-2">Wajib diisi jika ada perubahan pada data penempatan, periode, status, atau nominal uang saku.</p>
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-slate-800">
                              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                                <Save className="h-4 w-4 mr-2" />
                                Simpan Perubahan
                              </Button>
                              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingSection(null)}>
                                Batal
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Dialog
                    open={!!editingSection}
                    onOpenChange={(open) => !open && setEditingSection(null)}
                  >
                  <DialogContent className="w-[95vw] md:w-[90vw] max-w-5xl h-[95vh] md:h-[90vh] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex flex-col p-0 overflow-hidden shadow-2xl">
                    {/* Sticky Header */}
                    <div className="shrink-0 z-50 bg-white dark:bg-slate-900/50 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60 px-6 py-5 md:px-10 md:py-7">
                      <DialogHeader>
                        <DialogTitle className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-4">
                          <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner">
                            <Pencil className="h-5 w-5 md:h-6 md:w-6" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span>
                              {editingSection === "struktur"
                                ? "Ubah Struktur Kepegawaian"
                                : `Ubah ${editingSection?.charAt(0).toUpperCase()}${editingSection?.slice(1)}`}
                            </span>
                            <p className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-[0.2em]">
                              Management & Administration
                            </p>
                          </div>
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-400 mt-1 md:mt-2 leading-relaxed max-w-2xl">
                          {editingSection === "struktur"
                            ? "Sesuaikan penempatan brand, divisi, dan jabatan karyawan untuk menjaga akurasi data struktur organisasi."
                            : "Pastikan data sesuai dengan Single Source of Truth (SSOT) dan dokumen pendukung yang sah."}
                        </DialogDescription>
                      </DialogHeader>
                    </div>

                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit((data) => {
                          // Validation for struktur section
                          if (editingSection === "struktur") {
                            if (!data.structureEffectiveDate) {
                              toast({
                                variant: "destructive",
                                title: "Tanggal Efektif Wajib Diisi",
                                description:
                                  "Mohon isi tanggal efektif perubahan struktur.",
                              });
                              return;
                            }
                            if (!data.structureChangeReason?.trim()) {
                              toast({
                                variant: "destructive",
                                title: "Alasan Perubahan Wajib Diisi",
                                description:
                                  "Mohon isi alasan perubahan untuk log audit.",
                              });
                              return;
                            }
                          }

                          if (editingSection === "tambah_riwayat") {
                            handleSaveHrd(data, {
                              type:
                                data.additionalFields?.historyType ||
                                "promotion",
                              title: data.additionalFields?.historyTitle || "",
                              description:
                                data.additionalFields?.historyDescription || "",
                              effectiveDate:
                                data.additionalFields?.historyDate ||
                                format(new Date(), "yyyy-MM-dd"),
                              notes: data.catatanAdministrasi || "",
                            });
                          } else {
                            handleSaveHrd(data);
                          }
                        })}
                        className="flex flex-col flex-1 min-h-0"
                      >
                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10 md:py-10 custom-scrollbar">
                          {editingSection === "struktur" ? (
                            <div className="space-y-8">
                              {/* Info Box - Full Width */}
                              <div className="p-5 md:p-6 bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50 rounded-2xl flex gap-4 items-start">
                                <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                  <Info className="h-5 w-5" />
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                  Perubahan struktur akan memperbarui penempatan
                                  karyawan dan tersimpan sebagai riwayat audit
                                  HRD. Pastikan brand, divisi, jabatan
                                  struktural, dan atasan langsung sudah sesuai
                                  dengan kebijakan perusahaan.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                                {/* Employee ID */}
                                <FormField
                                  control={form.control}
                                  name="employeeId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Nomor Induk Karyawan
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          {...field}
                                          placeholder="Contoh: EMP-0001 atau EGS-2026-001"
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Nomor identitas internal karyawan yang
                                        digunakan untuk administrasi HRD.
                                      </p>
                                    </FormItem>
                                  )}
                                />

                                {/* Brand / Perusahaan */}
                                <FormField
                                  control={form.control}
                                  name="brandId"
                                  render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                          Brand / Perusahaan
                                        </FormLabel>
                                        <Select
                                          onValueChange={(value) => {
                                            field.onChange(value);
                                            // Reset division and supervisor when brand changes
                                            form.setValue("divisionId", "");
                                            form.setValue("directSupervisorUid", "");
                                          }}
                                          value={field.value}
                                        >
                                          <FormControl>
                                            <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl">
                                              <SelectValue placeholder="Pilih Brand" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            {brands?.map((b) => (
                                              <SelectItem key={b.id!} value={b.id!}>
                                                {b.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <p className="text-xs text-slate-500 mt-1">
                                          Pilih perusahaan/brand tempat karyawan ditempatkan.
                                        </p>
                                      </FormItem>
                                  )}
                                />

                                {/* Divisi - Hidden for management level */}
                                {form.watch("structuralPosition") !== "management" && (
                                  <FormField
                                    control={form.control}
                                    name="divisionId"
                                    render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                            Divisi
                                          </FormLabel>
                                          <Select
                                            onValueChange={(value) => {
                                              field.onChange(value);
                                              form.setValue("directSupervisorUid", "");
                                            }}
                                            value={field.value}
                                            disabled={!form.watch("brandId")}
                                          >
                                            <FormControl>
                                              <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl">
                                                <SelectValue placeholder="Pilih Divisi" />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                              {divisions.map((d) => (
                                                <SelectItem key={d.id} value={d.id}>
                                                  {d.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <p className="text-xs text-slate-500 mt-1">
                                            Divisi menentukan struktur tim dan atasan langsung karyawan.
                                          </p>
                                        </FormItem>
                                    )}
                                  />
                                )}

                                {/* Jabatan Struktural */}
                                <FormField
                                  control={form.control}
                                  name="structuralPosition"
                                  render={({ field }) => (
                                      <FormItem>
                                        <div className="flex items-center gap-2">
                                          <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                            Jabatan Struktural
                                          </FormLabel>
                                        </div>
                                        <Select
                                          onValueChange={(val) => {
                                            field.onChange(val);
                                            form.setValue("directSupervisorUid", "");
                                            if (val === "management") {
                                              form.setValue("divisionId", "");
                                            }
                                          }}
                                          value={field.value}
                                        >
                                          <FormControl>
                                            <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl">
                                              <SelectValue placeholder="Pilih Jabatan Struktural" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            <SelectItem value="staff">Staff</SelectItem>
                                            <SelectItem value="supervisor">Supervisor</SelectItem>
                                            <SelectItem value="division_manager">Manager Divisi</SelectItem>
                                            <SelectItem value="management">Direktur/Manajemen</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <p className="text-xs text-slate-500 mt-1">
                                          Jabatan struktural digunakan untuk membedakan level tanggung jawab dan memfilter daftar atasan.
                                        </p>
                                      </FormItem>
                                  )}
                                />

                                {/* Role / Fungsi Kerja */}
                                <FormField
                                  control={form.control}
                                  name="workRole"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Role / Fungsi Kerja
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          {...field}
                                          placeholder="Contoh: Web Developer, Creative Staff, Finance Staff"
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Isi fungsi kerja spesifik karyawan di
                                        dalam divisi.
                                      </p>
                                    </FormItem>
                                  )}
                                />

                                {/* Atasan Langsung */}
                                <FormField
                                  control={form.control}
                                  name="directSupervisorUid"
                                  render={({ field }) => {
                                    const spValue = form.watch("structuralPosition");
                                    const isManagementLevel = spValue === "management";
                                    return (
                                      <FormItem>
                                        <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                          Atasan Langsung
                                          {isManagementLevel && (
                                            <span className="ml-2 text-[10px] font-normal normal-case text-slate-400">(tidak wajib)</span>
                                          )}
                                        </FormLabel>
                                        {isManagementLevel ? (
                                          <div className="flex items-center gap-3 h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                            <span className="text-sm text-slate-400 dark:text-slate-500 italic">Tidak wajib untuk level manajemen</span>
                                          </div>
                                        ) : (
                                          <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                            disabled={!form.watch("brandId") || !form.watch("divisionId")}
                                          >
                                            <FormControl>
                                              <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl">
                                                <SelectValue placeholder="Pilih Atasan Langsung" />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 max-h-64">
                                              {isOverrideActive
                                                ? allPossibleSupervisors.map((m) => (
                                                    <SelectItem key={m.uid} value={m.uid}>
                                                      {m.fullName}
                                                    </SelectItem>
                                                  ))
                                                : (() => {
                                                    const divManagers = managers.filter(m => m._source === "division_manager");
                                                    const mgmtExact = managers.filter(m => m._source === "management_scope_exact");
                                                    const mgmtBrand = managers.filter(m => m._source === "management_scope_brand");
                                                    return (
                                                      <>
                                                        {divManagers.length > 0 && (
                                                          <SelectGroup>
                                                            <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Manager Divisi</SelectLabel>
                                                            {divManagers.map((m) => (
                                                              <SelectItem key={m.uid} value={m.uid}>
                                                                {m.fullName} — {m._sourceLabel || "Manager Divisi"}
                                                              </SelectItem>
                                                            ))}
                                                          </SelectGroup>
                                                        )}
                                                        {mgmtExact.length > 0 && (
                                                          <SelectGroup>
                                                            <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Direksi / Manajemen (Divisi ini)</SelectLabel>
                                                            {mgmtExact.map((m) => (
                                                              <SelectItem key={m.uid} value={m.uid}>
                                                                {m.fullName} — {m._sourceLabel}
                                                              </SelectItem>
                                                            ))}
                                                          </SelectGroup>
                                                        )}
                                                        {mgmtBrand.length > 0 && (
                                                          <SelectGroup>
                                                            <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400">Direksi / Manajemen (Brand)</SelectLabel>
                                                            {mgmtBrand.map((m) => (
                                                              <SelectItem key={m.uid} value={m.uid}>
                                                                {m.fullName} — {m._sourceLabel}
                                                              </SelectItem>
                                                            ))}
                                                          </SelectGroup>
                                                        )}
                                                      </>
                                                    );
                                                  })()
                                              }
                                            </SelectContent>
                                          </Select>
                                        )}

                                        <p className="text-xs text-slate-500 mt-1">
                                          {isManagementLevel
                                            ? "Level Direktur/Manajemen tidak memerlukan atasan langsung dalam sistem."
                                            : isOverrideActive
                                              ? "Pilih atasan langsung dari seluruh karyawan aktif (mode override)."
                                              : "Atasan otomatis disesuaikan berdasarkan brand, divisi, dan Jabatan Struktural."}
                                        </p>

                                        {warningNoManager && form.watch("divisionId") && !isManagementLevel && (
                                          <div className="flex items-center gap-2 mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs font-medium">
                                            <span className="text-lg">⚠️</span>
                                            <span>{managerWarningMessage}</span>
                                          </div>
                                        )}

                                        {!isManagementLevel && form.watch("brandId") && form.watch("divisionId") && (
                                          <div className="flex items-center space-x-2 py-3 mt-2 border-t border-slate-200 dark:border-slate-800/50">
                                            <input
                                              type="checkbox"
                                              id="override-manager"
                                              checked={isOverrideActive}
                                              onChange={(e) => {
                                                setIsOverrideActive(e.target.checked);
                                                if (!e.target.checked) {
                                                  form.setValue("directManagerOverrideReason", "");
                                                  if (managers.length > 0) {
                                                    form.setValue("directSupervisorUid", managers[0].uid);
                                                  } else {
                                                    form.setValue("directSupervisorUid", "");
                                                  }
                                                }
                                              }}
                                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-white dark:focus:ring-offset-slate-900 cursor-pointer"
                                            />
                                            <label htmlFor="override-manager" className="text-xs font-bold uppercase tracking-widest text-slate-400 cursor-pointer">
                                              Override Atasan Langsung (Di luar Master Organisasi)
                                            </label>
                                          </div>
                                        )}
                                      </FormItem>
                                  );
                                  }}
                                />

                                {isOverrideActive && (
                                  <FormField
                                    control={form.control}
                                    name="directManagerOverrideReason"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                          Alasan Override Atasan Langsung <span className="text-red-500">*</span>
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            placeholder="Wajib diisi: Alasan atasan berbeda dari master struktur..."
                                            className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-amber-500/50"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                )}

                                {/* Sistem Kerja */}
                                <FormField
                                  control={form.control}
                                  name="sistemKerja"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Sistem Kerja
                                      </FormLabel>
                                      <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl">
                                            <SelectValue placeholder="Pilih Sistem Kerja" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          <SelectItem value="WFO">
                                            WFO (Office)
                                          </SelectItem>
                                          <SelectItem value="WFH">
                                            WFH (Remote)
                                          </SelectItem>
                                          <SelectItem value="Hybrid">
                                            Hybrid
                                          </SelectItem>
                                          <SelectItem value="Shift">
                                            Shift
                                          </SelectItem>
                                          <SelectItem value="Lapangan">
                                            Lapangan / On-Site
                                          </SelectItem>
                                          <SelectItem value="Fleksibel">
                                            Fleksibel
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Tentukan metode kehadiran atau pola
                                        kerja karyawan.
                                      </p>
                                    </FormItem>
                                  )}
                                />

                                {/* Tanggal Efektif Perubahan */}
                                <FormField
                                  control={form.control}
                                  name="structureEffectiveDate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Tanggal Efektif Perubahan *
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="date"
                                          {...field}
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Tanggal mulai berlakunya perubahan
                                        struktur karyawan.
                                      </p>
                                    </FormItem>
                                  )}
                                />

                                {/* Alasan Perubahan - Full Width */}
                                <FormField
                                  control={form.control}
                                  name="structureChangeReason"
                                  render={({ field }) => (
                                    <FormItem className="lg:col-span-2">
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Alasan Perubahan *
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          {...field}
                                          placeholder="Contoh: Mutasi internal, promosi, penyesuaian struktur, koreksi data HRD"
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white min-h-[80px] rounded-xl focus:border-emerald-500/50"
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Alasan ini akan disimpan sebagai log
                                        audit perubahan struktur.
                                      </p>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          ) : null}

                          {editingSection === "tambah_riwayat" ? (
                            <div className="space-y-6">
                              <FormField
                                control={form.control}
                                name="additionalFields.historyType"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-500">
                                      Tipe Event
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value || "promotion"}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                        <SelectItem value="promotion">
                                          Promotion
                                        </SelectItem>
                                        <SelectItem value="mutation">
                                          Mutation
                                        </SelectItem>
                                        <SelectItem value="award">
                                          Award
                                        </SelectItem>
                                        <SelectItem value="sanction">
                                          Sanction
                                        </SelectItem>
                                        <SelectItem value="appraisal">
                                          Appraisal
                                        </SelectItem>
                                        <SelectItem value="other">
                                          Other
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="additionalFields.historyTitle"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-500">
                                      Judul Event
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value || ""}
                                        placeholder="Contoh: Kenaikan Jabatan Senior"
                                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="additionalFields.historyDescription"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-500">
                                      Deskripsi Singkat
                                    </FormLabel>
                                    <FormControl>
                                      <Textarea
                                        {...field}
                                        value={field.value || ""}
                                        placeholder="Detail perubahan..."
                                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white min-h-[100px]"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="additionalFields.historyDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-500">
                                      Tanggal Efektif
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="date"
                                        {...field}
                                        value={field.value || ""}
                                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                          ) : null}

                          {editingSection === "cuti" ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Hak Cuti Tahunan */}
                                <FormField
                                  control={form.control}
                                  name="jatahCuti"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Hak Cuti Tahunan *
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          {...field}
                                          min="0"
                                          step="0.5"
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                          onChange={(e) =>
                                            field.onChange(
                                              e.target.value ? parseFloat(e.target.value) : 0
                                            )
                                          }
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Jumlah hari cuti yang berhak diperoleh per tahun.
                                      </p>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Sisa Cuti */}
                                <FormField
                                  control={form.control}
                                  name="sisaCuti"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Sisa Cuti *
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          {...field}
                                          min="0"
                                          step="0.5"
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                          onChange={(e) =>
                                            field.onChange(
                                              e.target.value ? parseFloat(e.target.value) : 0
                                            )
                                          }
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Jumlah hari cuti yang masih tersisa.
                                      </p>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Cuti Terpakai (Readonly Calculated) */}
                                <div>
                                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Cuti Terpakai
                                  </FormLabel>
                                  <div className="mt-2 h-12 px-3 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex items-center">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                      {(form.watch("jatahCuti") || 0) -
                                        (form.watch("sisaCuti") || 0)}{" "}
                                      hari
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">
                                    Otomatis dihitung (Hak - Sisa).
                                  </p>
                                </div>

                                {/* Carry Over (Optional) */}
                                <FormField
                                  control={form.control}
                                  name="carryOverCuti"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Sisa Tahun Lalu (Carry Over)
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          {...field}
                                          min="0"
                                          step="0.5"
                                          className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                          onChange={(e) =>
                                            field.onChange(
                                              e.target.value ? parseFloat(e.target.value) : 0
                                            )
                                          }
                                        />
                                      </FormControl>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Cuti dari tahun sebelumnya yang dibawa ke tahun ini.
                                      </p>
                                    </FormItem>
                                  )}
                                />
                              </div>

                              {/* Tanggal Efektif Perubahan */}
                              <FormField
                                control={form.control}
                                name="cutiEffectiveDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                      Tanggal Efektif Perubahan *
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="date"
                                        {...field}
                                        className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-12 rounded-xl focus:border-emerald-500/50"
                                      />
                                    </FormControl>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Tanggal mulai berlakunya perubahan data cuti.
                                    </p>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Alasan Perubahan */}
                              <FormField
                                control={form.control}
                                name="cutiChangeReason"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                      Alasan Perubahan / Log Audit *
                                    </FormLabel>
                                    <FormControl>
                                      <Textarea
                                        {...field}
                                        placeholder="Contoh: Koreksi saldo cuti tahun fiskal 2026, Penyesuaian carry over, Penambahan cuti khusus, dll."
                                        className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white min-h-[100px] rounded-xl focus:border-emerald-500/50"
                                      />
                                    </FormControl>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Alasan ini akan disimpan sebagai catatan audit untuk
                                      perubahan data cuti.
                                    </p>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          ) : null}

                          {editingSection === "catatan" ? (
                            <div className="space-y-6">
                              <FormField
                                control={form.control}
                                name="catatanInternalHrd"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-500">
                                      Catatan Internal HRD (Rahasia)
                                    </FormLabel>
                                    <FormControl>
                                      <Textarea
                                        {...field}
                                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white min-h-[300px] text-sm leading-relaxed"
                                        placeholder="Masukkan catatan rahasia terkait performa, behavior, atau informasi sensitif lainnya..."
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                          ) : null}

                          {editingSection === "kontrak" ? (
                            <div className="space-y-6">
                              {/* 1. Tipe & Status Utama */}
                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="employeeType"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-black text-slate-500 uppercase">
                                        Jenis Kontrak / Tipe
                                      </FormLabel>
                                      <Select
                                        onValueChange={field.onChange}
                                        value={field.value || ""}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                          {TIPE_KARYAWAN_OPTIONS.map((o) => (
                                            <SelectItem key={o} value={o}>
                                              {o}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {(normalizedData?.employeeType ===
                                        "Tetap" ||
                                        normalizedData?.tipeKaryawan ===
                                          "Karyawan Tetap") &&
                                        field.value !== "Tetap" && (
                                          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                                            <p className="text-[10px] text-amber-200 font-medium">
                                              Warning: Perubahan dari Tetap ke{" "}
                                              {field.value} tidak umum.
                                            </p>
                                          </div>
                                        )}
                                    </FormItem>
                                  )}
                                />
                                {(() => {
                                  const vals = form.watch() as any;
                                  const type = vals.employeeType;
                                  let start = "";
                                  let end = "";
                                  if (type === "Magang") {
                                    start =
                                      vals.internshipStartDate ||
                                      vals.contractStartDate ||
                                      "";
                                    end =
                                      vals.internshipEndDate ||
                                      vals.contractEndDate ||
                                      "";
                                  } else if (
                                    type === "Probation" ||
                                    type === "Percobaan"
                                  ) {
                                    start =
                                      vals.probationStartDate ||
                                      vals.contractStartDate ||
                                      "";
                                    end =
                                      vals.probationEndDate ||
                                      vals.contractEndDate ||
                                      "";
                                  } else {
                                    start =
                                      vals.contractStartDate ||
                                      vals.kontrakMulai ||
                                      "";
                                    end =
                                      vals.contractEndDate ||
                                      vals.kontrakSelesai ||
                                      "";
                                  }

                                  let status = "Draft";
                                  const now = new Date();
                                  now.setHours(0, 0, 0, 0);

                                  if (start) {
                                    const startDate = new Date(start);
                                    startDate.setHours(0, 0, 0, 0);
                                    if (now < startDate) {
                                      status = "Terjadwal";
                                    } else if (
                                      type === "Tetap" ||
                                      type === "Karyawan Tetap"
                                    ) {
                                      status = "Aktif";
                                    } else {
                                      if (!end) {
                                        status = "Draft";
                                      } else {
                                        const endDate = new Date(end);
                                        endDate.setHours(0, 0, 0, 0);
                                        if (now > endDate) {
                                          status = "Expired";
                                        } else {
                                          status = "Aktif";
                                        }
                                      }
                                    }
                                  }

                                  return (
                                    <div className="flex flex-col gap-2">
                                      <FormLabel className="text-xs font-black text-slate-500 uppercase">
                                        Status Siklus (Auto)
                                      </FormLabel>
                                      <div className="flex items-center gap-3 h-10 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md">
                                        <Badge
                                          variant="outline"
                                          className={
                                            status === "Aktif"
                                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                              : status === "Expired"
                                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                : status === "Terjadwal"
                                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                  : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                          }
                                        >
                                          {status}
                                        </Badge>
                                        <span className="text-[10px] text-slate-500 italic flex-1 truncate">
                                          Dihitung otomatis berdasar tgl.
                                        </span>
                                      </div>
                                      {status === "Expired" && (
                                        <div className="flex items-start gap-2 mt-1 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                          <p className="text-[10px] text-red-300 leading-tight">
                                            Masa berlaku habis. Perpanjang atau
                                            tandai selesai jika offboarding.
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* 2. Kondisional berdasarkan Tipe */}
                              <div className="space-y-4 pt-4 border-t border-slate-800">
                                {/* Magang / Intern */}
                                {form.watch("employeeType") === "Magang" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="contractStartDate"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Mulai Magang
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="contractDurationType"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Durasi
                                            </FormLabel>
                                            <Select
                                              onValueChange={field.onChange}
                                              value={field.value || "custom"}
                                            >
                                              <FormControl>
                                                <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                  <SelectValue placeholder="Pilih Durasi" />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                <SelectItem value="1">
                                                  1 Bulan
                                                </SelectItem>
                                                <SelectItem value="3">
                                                  3 Bulan
                                                </SelectItem>
                                                <SelectItem value="6">
                                                  6 Bulan
                                                </SelectItem>
                                                <SelectItem value="12">
                                                  12 Bulan
                                                </SelectItem>
                                                <SelectItem value="24">
                                                  24 Bulan
                                                </SelectItem>
                                                <SelectItem value="custom">
                                                  Custom
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                              Pilih durasi agar tanggal selesai
                                              otomatis terisi.
                                            </p>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="contractEndDate"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Selesai Magang
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                readOnly={
                                                  form.watch(
                                                    "contractDurationType",
                                                  ) !== "custom"
                                                }
                                                className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white ${form.watch("contractDurationType") !== "custom" ? "opacity-70 cursor-not-allowed" : ""}`}
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="mentor"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Mentor Pembimbing
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              value={field.value || ""}
                                              placeholder="Nama Mentor"
                                              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* Probation */}
                                {form.watch("employeeType") === "Probation" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="probationStartDate"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Mulai Probation
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="contractDurationType"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Durasi
                                            </FormLabel>
                                            <Select
                                              onValueChange={field.onChange}
                                              value={field.value || "custom"}
                                            >
                                              <FormControl>
                                                <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                  <SelectValue placeholder="Pilih Durasi" />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                <SelectItem value="1">
                                                  1 Bulan
                                                </SelectItem>
                                                <SelectItem value="3">
                                                  3 Bulan
                                                </SelectItem>
                                                <SelectItem value="6">
                                                  6 Bulan
                                                </SelectItem>
                                                <SelectItem value="12">
                                                  12 Bulan
                                                </SelectItem>
                                                <SelectItem value="24">
                                                  24 Bulan
                                                </SelectItem>
                                                <SelectItem value="custom">
                                                  Custom
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                              Pilih durasi agar tanggal selesai
                                              otomatis terisi.
                                            </p>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="probationEndDate"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Selesai Probation
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                readOnly={
                                                  form.watch(
                                                    "contractDurationType",
                                                  ) !== "custom"
                                                }
                                                className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white ${form.watch("contractDurationType") !== "custom" ? "opacity-70 cursor-not-allowed" : ""}`}
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="finalEvaluationDate"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Jadwal Evaluasi
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* Kontrak / PKWT */}
                                {form.watch("employeeType") === "Kontrak" && (
                                  <>
                                    <FormField
                                      control={form.control}
                                      name="contractNumber"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Nomor Kontrak
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              value={field.value || ""}
                                              placeholder="Contoh: 001/HRD/KONTRAK/2024"
                                              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="contractStartDate"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Mulai Kontrak
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="contractDurationType"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Durasi
                                            </FormLabel>
                                            <Select
                                              onValueChange={field.onChange}
                                              value={field.value || "custom"}
                                            >
                                              <FormControl>
                                                <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                  <SelectValue placeholder="Pilih Durasi" />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                <SelectItem value="1">
                                                  1 Bulan
                                                </SelectItem>
                                                <SelectItem value="3">
                                                  3 Bulan
                                                </SelectItem>
                                                <SelectItem value="6">
                                                  6 Bulan
                                                </SelectItem>
                                                <SelectItem value="12">
                                                  12 Bulan
                                                </SelectItem>
                                                <SelectItem value="24">
                                                  24 Bulan
                                                </SelectItem>
                                                <SelectItem value="custom">
                                                  Custom
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                              Pilih durasi agar tanggal selesai
                                              otomatis terisi.
                                            </p>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="contractEndDate"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Selesai Kontrak
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                readOnly={
                                                  form.watch(
                                                    "contractDurationType",
                                                  ) !== "custom"
                                                }
                                                className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white ${form.watch("contractDurationType") !== "custom" ? "opacity-70 cursor-not-allowed" : ""}`}
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                  </>
                                )}

                                {/* Tetap */}
                                {form.watch("employeeType") === "Tetap" && (
                                  <>
                                    <FormField
                                      control={form.control}
                                      name="contractStartDate"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Tanggal Efektif Pengangkatan
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="contractNumber"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Nomor SK Pengangkatan
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              value={field.value || ""}
                                              placeholder="Contoh: 001/SK-P/ENV/2024"
                                              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* General Schedule & Location */}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                                  <FormField
                                    control={form.control}
                                    name="sistemKerja"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs font-bold text-slate-500">
                                          Sistem Kerja
                                        </FormLabel>
                                        <Select
                                          onValueChange={field.onChange}
                                          value={field.value || ""}
                                        >
                                          <FormControl>
                                            <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                              <SelectValue />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            <SelectItem value="WFO">
                                              WFO
                                            </SelectItem>
                                            <SelectItem value="WFH">
                                              WFH
                                            </SelectItem>
                                            <SelectItem value="Hybrid">
                                              Hybrid
                                            </SelectItem>
                                            <SelectItem value="Shift">
                                              Shift
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="workLocation"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs font-bold text-slate-500">
                                          Lokasi Kerja
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            value={field.value || ""}
                                            className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                <FormField
                                  control={form.control}
                                  name="contractNotes"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold text-slate-500">
                                        Catatan Khusus
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          {...field}
                                          value={field.value || ""}
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          ) : null}

                          {editingSection === "payroll" ? (
                            <div className="space-y-6">
                              <FormField
                                control={form.control}
                                name="gajiPokok"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-500">
                                      Gaji Pokok
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="text"
                                        placeholder="Rp 0"
                                        value={formatRupiah(field.value)}
                                        onChange={(e) => {
                                          const parsed = parseRupiah(e.target.value);
                                          field.onChange(parsed);
                                        }}
                                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />

                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-bold text-white">
                                    Daftar Tunjangan
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[10px] uppercase font-bold"
                                    onClick={() => {
                                      const current =
                                        form.getValues("allowances") || [];
                                      form.setValue("allowances", [
                                        ...current,
                                        {
                                          id: Math.random()
                                            .toString(36)
                                            .substr(2, 9),
                                          name: "",
                                          category: "tetap",
                                          amount: 0,
                                          period: "bulanan",
                                        },
                                      ]);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> Tambah
                                  </Button>
                                </div>
                                <div className="space-y-3">
                                  {(form.watch("allowances") || []).map(
                                    (al: any, idx: number) => (
                                      <div
                                        key={al.id}
                                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex flex-col gap-3"
                                      >
                                        <div className="flex items-center gap-2">
                                          <Input
                                            placeholder="Nama Tunjangan"
                                            value={al.name}
                                            onChange={(e) => {
                                              const current = [
                                                ...(form.getValues(
                                                  "allowances",
                                                ) || []),
                                              ];
                                              current[idx].name =
                                                e.target.value;
                                              form.setValue(
                                                "allowances",
                                                current,
                                              );
                                            }}
                                            className="flex-1 h-9 text-sm"
                                          />
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-500"
                                            onClick={() => {
                                              const current = [
                                                ...(form.getValues(
                                                  "allowances",
                                                ) || []),
                                              ];
                                              current.splice(idx, 1);
                                              form.setValue(
                                                "allowances",
                                                current,
                                              );
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <Select
                                            value={al.category}
                                            onValueChange={(val) => {
                                              const current = [
                                                ...(form.getValues(
                                                  "allowances",
                                                ) || []),
                                              ];
                                              current[idx].category =
                                                val as any;
                                              form.setValue(
                                                "allowances",
                                                current,
                                              );
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-[10px]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                              <SelectItem value="tetap">
                                                Tetap
                                              </SelectItem>
                                              <SelectItem value="tidak_tetap">
                                                Tidak Tetap
                                              </SelectItem>
                                              <SelectItem value="fasilitas">
                                                Fasilitas
                                              </SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Input
                                            type="text"
                                            placeholder="Rp 0"
                                            value={formatRupiah(al.amount)}
                                            onChange={(e) => {
                                              const current = [
                                                ...(form.getValues(
                                                  "allowances",
                                                ) || []),
                                              ];
                                              current[idx].amount = parseRupiah(
                                                e.target.value,
                                              );
                                              form.setValue(
                                                "allowances",
                                                current,
                                              );
                                            }}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>

                              <div className="h-px bg-slate-200 dark:bg-slate-800 my-4"></div>

                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="bpjsKesKaryawan"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        BPJS Kes (Karyawan)
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="bpjsKesPerusahaan"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        BPJS Kes (Persh)
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="bpjsTkKaryawan"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        BPJS TK (Karyawan)
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="bpjsTkPerusahaan"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        BPJS TK (Persh)
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>

                              <div className="grid grid-cols-3 gap-4">
                                <FormField
                                  control={form.control}
                                  name="thr"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        THR
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="potonganPPh21"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        PPh 21
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="potonganLain"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-[10px] font-bold text-slate-500 uppercase">
                                        Potongan Lain
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="text"
                                          placeholder="Rp 0"
                                          value={formatRupiah(field.value)}
                                          onChange={(e) =>
                                            field.onChange(
                                              parseRupiah(e.target.value),
                                            )
                                          }
                                          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          ) : null}

                          <div className="pt-6 border-t border-slate-800 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="tanggalEfektif"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-black text-blue-500 uppercase">
                                      Tanggal Efektif Perubahan
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="date"
                                        {...field}
                                        className="bg-blue-500/5 border-blue-500/20"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="catatanAdministrasi"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-black text-amber-500 uppercase">
                                      Alasan Perubahan (Log Audit)
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        required
                                        className="bg-amber-500/5 border-amber-500/20"
                                        placeholder="Contoh: Penyesuaian Gaji Tahunan"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Sticky Footer */}
                        <div className="shrink-0 z-50 bg-white dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/60 px-6 py-5 md:px-10 md:py-6 flex justify-end items-center gap-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-12 px-8 rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            onClick={() => setEditingSection(null)}
                          >
                            Batal
                          </Button>
                          <Button
                            type="submit"
                            disabled={isSaving}
                            className="h-12 px-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
                          >
                            {isSaving ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Menyimpan...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Save className="h-4 w-4" />
                                <span>Simpan Data</span>
                              </div>
                            )}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
                )}
              </TabsContent>

              <TabsContent value="lembur">
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 rounded-[2rem] shadow-2xl backdrop-blur-xl">
                  <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 p-6 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-emerald-400" />
                        Riwayat Pengajuan Lembur
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-1">
                        Berikut adalah daftar pengajuan lembur karyawan ini beserta durasi payroll dan statusnya.
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                      Total: {overtimeData?.length || 0} Lembur
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    {overtimeData && overtimeData.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                            <TableRow className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 px-6">
                                Tanggal
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12">
                                Jam Kerja
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12">
                                Durasi Diajukan
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 text-emerald-400">
                                Durasi Final Payroll
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12">
                                Lokasi
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12">
                                Status
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 h-12 px-6">
                                Catatan HRD
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {overtimeData.map((ov: any, index: number) => {
                              const ovDate = ov.overtimeDate
                                ? (typeof ov.overtimeDate === "object" && typeof ov.overtimeDate.toDate === "function" 
                                    ? ov.overtimeDate.toDate() 
                                    : new Date(ov.overtimeDate))
                                : null;
                              
                              const hoursSubmitted = Math.floor((ov.totalDurationMinutes || 0) / 60);
                              const minsSubmitted = (ov.totalDurationMinutes || 0) % 60;
                              const submittedLabel = hoursSubmitted > 0 
                                ? `${hoursSubmitted} jam ${minsSubmitted} menit` 
                                : `${minsSubmitted} menit`;

                              const finalMinutes = ov.approvedMinutesFinal !== undefined && ov.approvedMinutesFinal !== null
                                ? ov.approvedMinutesFinal 
                                : null;
                              
                              const finalLabel = finalMinutes !== null
                                ? (Math.floor(finalMinutes / 60) > 0 
                                    ? `${Math.floor(finalMinutes / 60)} jam ${finalMinutes % 60} menit` 
                                    : `${finalMinutes % 60} menit`)
                                : "-";

                              return (
                                <TableRow
                                  key={ov.id || index}
                                  className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                                >
                                  <TableCell className="px-6 font-medium text-slate-800 dark:text-slate-200 text-sm">
                                    {ovDate ? format(ovDate, "eeee, dd MMMM yyyy", { locale: idLocale }) : "-"}
                                  </TableCell>
                                  <TableCell className="text-slate-700 dark:text-slate-300 text-sm font-semibold">
                                    {ov.startTime || "-"} - {ov.endTime || "-"}
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                                    {submittedLabel}
                                  </TableCell>
                                  <TableCell className="text-emerald-400 text-sm font-bold">
                                    {finalLabel}
                                  </TableCell>
                                  <TableCell className="text-slate-700 dark:text-slate-300 text-sm capitalize">
                                    {ov.location === "kantor" ? "💻 Kantor (WFO)"
                                      : ov.location === "remote" ? "🏡 Remote (WFH)" 
                                      : ov.location === "site" ? "🚗 Dinas" 
                                      : ov.location || "-"}
                                  </TableCell>
                                  <TableCell>
                                    <OvertimeStatusBadge status={ov.status} payrollStatus={ov.payrollStatus} />
                                  </TableCell>
                                  <TableCell className="px-6 text-xs text-slate-400 italic max-w-[200px] truncate" title={ov.hrdNotes || ""}>
                                    {ov.hrdNotes ? `"${ov.hrdNotes}"` : "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-12 text-center">
                        <ClipboardList className="h-12 w-12 text-slate-600 mb-3 animate-pulse" />
                        <p className="text-slate-400 font-medium text-sm">Belum Ada Riwayat Lembur</p>
                        <p className="text-slate-500 text-xs mt-1">Karyawan ini belum memiliki riwayat atau pengajuan lembur yang tercatat.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="riwayat">
                {/* Extended History View */}
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
                  <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
                    <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                      Audit Trail Lengkap
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                        <TableRow className="border-slate-200 dark:border-slate-800/50">
                          <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 px-6">
                            Waktu
                          </TableHead>
                          <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">
                            Tipe
                          </TableHead>
                          <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">
                            Perubahan
                          </TableHead>
                          <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">
                            Alasan / Catatan
                          </TableHead>
                          <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-right px-6">
                            Admin
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyData?.map((h: any) => (
                          <TableRow
                            key={h.id}
                            className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/30"
                          >
                            <TableCell className="px-6 text-[10px] text-slate-500 font-mono">
                              {h.changedAt?.toDate
                                ? format(
                                    h.changedAt.toDate(),
                                    "dd/MM/yyyy HH:mm",
                                  )
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[9px] uppercase border-slate-200 dark:border-slate-800 text-slate-500"
                              >
                                {h.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {h.label ? (
                                <p>
                                  <span className="text-slate-500">
                                    {h.label}:
                                  </span>{" "}
                                  <span className="text-slate-800 dark:text-white font-medium">
                                    {h.oldValue}
                                  </span>{" "}
                                  →{" "}
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    {h.newValue}
                                  </span>
                                </p>
                              ) : (
                                h.title
                              )}
                            </TableCell>
                            <TableCell className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                              "{h.note || "-"}"
                            </TableCell>
                            <TableCell className="px-6 text-right text-[10px] font-bold text-slate-700 dark:text-slate-300">
                              {h.changedByName}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </div>

      {/* Attendance Method Dialog */}
      <AttendanceMethodEditDialog
        open={attendanceDialogOpen}
        onOpenChange={setAttendanceDialogOpen}
        employee={profileDoc}
        sites={sites}
        onSave={handleSaveAttendanceSettings}
      />
    </div>
  );
}
