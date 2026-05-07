"use client";

import React, { useMemo, useState, useEffect } from "react";
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
} from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { getHrdEmployeeStruktur } from "@/lib/employee-hrd-profile";

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

const TIPE_KARYAWAN_OPTIONS = [
  "Karyawan Tetap",
  "Kontrak",
  "Probation",
  "Magang",
  "Freelance",
];

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
      className={`text-sm font-medium text-slate-200 truncate ${className || ""}`}
      title={String(value || "Belum diisi")}
    >
      {value !== undefined && value !== null && value !== ""
        ? String(value)
        : "Belum diisi"}
    </p>
  </div>
);

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
  const isImage = url && /\.(jpg|jpeg|png|webp|gif)/i.test(url);

  return (
    <Card className="group border-slate-800 bg-slate-950/40 backdrop-blur-xl hover:border-slate-700 transition-all duration-300">
      <CardHeader className="pb-4 border-b border-slate-800/50">
        <div className="flex justify-between items-start">
          <Badge
            variant="outline"
            className="text-[9px] uppercase tracking-tighter border-slate-800 text-slate-500"
          >
            {type}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[9px] uppercase tracking-tighter ${
              status === "Valid" || status === "Sudah Upload"
                ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"
                : status === "Tidak Punya"
                  ? "border-slate-700 text-slate-500 bg-slate-800/50"
                  : "border-red-500/20 text-red-500 bg-red-500/5"
            }`}
          >
            {status}
          </Badge>
        </div>
        <CardTitle className="text-sm font-bold text-slate-200 mt-2">
          {label}
        </CardTitle>
        {value && (
          <p className="text-[10px] font-mono text-slate-500 mt-1">{value}</p>
        )}
      </CardHeader>
      <CardContent className="pt-6">
        {url ? (
          <div className="space-y-4">
            {isImage ? (
              <div
                className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 bg-slate-900/50 cursor-pointer group-hover:ring-1 group-hover:ring-emerald-500/30 transition-all"
                onClick={() => window.open(url, "_blank")}
              >
                <img
                  src={url}
                  className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  alt={label}
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="h-5 w-5 text-white" />
                </div>
              </div>
            ) : (
              <div
                className="aspect-video rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => window.open(url, "_blank")}
              >
                <FileText className="h-8 w-8 mb-2 opacity-20" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  PDF / Document
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl border-slate-800 bg-slate-900/30 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 h-9"
                onClick={() => window.open(url, "_blank")}
              >
                <Eye className="h-3.5 w-3.5 mr-2" />
                Lihat
              </Button>
              <a
                href={url}
                download={label}
                target="_blank"
                rel="noreferrer"
                className="flex-1"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl border-slate-800 bg-slate-900/30 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 h-9"
                >
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Download
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="aspect-video rounded-xl border-2 border-dashed border-slate-800 bg-slate-900/20 flex flex-col items-center justify-center text-slate-600">
            <AlertOctagon className="h-6 w-6 mb-2 opacity-20" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-center px-4">
              {status === "Tidak Punya"
                ? "Karyawan Tidak Memiliki"
                : "Belum Diunggah"}
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
          <FormLabel className="text-xs uppercase tracking-widest text-slate-500">
            Catatan Revisi / Penolakan
          </FormLabel>
          <Textarea
            placeholder="Masukkan catatan jika data perlu direvisi atau ditolak..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-slate-900/50 border-slate-800 h-20"
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
  const [isSaving, setIsSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ringkasan");
  const [divisions, setDivisions] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);

  const resolvedParams = React.use(params);
  const employeeId = resolvedParams.id;

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Fetch data
  const { data: userDoc, isLoading: userLoading, mutate: mutateUser } = useDoc<UserProfile>(
    useMemoFirebase(
      () => (employeeId ? doc(firestore, "users", employeeId) : null),
      [firestore, employeeId],
    ),
  );
  const { data: empDoc, isLoading: empLoading, mutate: mutateEmp } = useDoc<EmployeeMasterData>(
    useMemoFirebase(
      () => (employeeId ? doc(firestore, "employees", employeeId) : null),
      [firestore, employeeId],
    ),
  );
  const { data: profileDoc, isLoading: profileLoading, mutate: mutateProfile } =
    useDoc<EmployeeProfile>(
      useMemoFirebase(
        () =>
          employeeId ? doc(firestore, "employee_profiles", employeeId) : null,
        [firestore, employeeId],
      ),
    );
  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, "brands"), [firestore]),
  );

  // History query
  const historyQuery = useMemoFirebase(() => {
    if (!employeeId) return null;
    return query(
      collection(firestore, "employees", employeeId, "employment_history"),
      orderBy("changedAt", "desc"),
    );
  }, [firestore, employeeId]);

  const { data: historyData } = useCollection(historyQuery);

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

      asetPerusahaan: hrdInfo.asetPerusahaan || "",
      catatanBenefit: hrdInfo.catatanBenefit || "",
      catatanInternalHrd: hrdInfo.catatanInternalHrd || "",
      catatanAdministrasi: hrdInfo.catatanAdministrasi || "",
      tanggalEfektif: format(new Date(), "yyyy-MM-dd"),
      additionalFields: {
        historyType: "promotion",
        historyTitle: "",
        historyDescription: "",
        historyDate: format(new Date(), "yyyy-MM-dd"),
      },
    }),
    [normalizedData, hrdInfo],
  );

  const form = useForm<HrdEmploymentInfo>({
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

  // Load divisions when brand changes
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

  // Load managers when brand and division change
  useEffect(() => {
    const brandId = watchBrandIdForManagers;
    const divisionId = watchDivisionIdForManagers;

    if (!brandId || !divisionId) {
      setManagers([]);
      return;
    }

    // Load managers (users with role that are division managers for this brand/division)
    const loadManagers = async () => {
      try {
        const selectedDivision = divisions.find(d => d.id === divisionId);
        const divisionName = selectedDivision?.name || "";

        // Query users who are marked as Division Managers
        const managersQuery = query(
          collection(firestore, "users"),
          where("isDivisionManager", "==", true),
        );
        
        const managersSnap = await getDocs(managersQuery);
        const allManagers = managersSnap.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        })) as any[];

        // Filter in memory for precise brand & division matching
        const filteredManagers = allManagers.filter(u => {
          // Brand match
          const brandMatch = u.brandId === brandId || u.managedBrandId === brandId;
          if (!brandMatch) return false;

          // Division match (by ID or Name fallback)
          const idMatch = u.divisionId === divisionId || u.managedDivisionId === divisionId;
          const nameMatch = (u.managedDivision?.toLowerCase() === divisionName.toLowerCase()) || 
                           (u.divisionName?.toLowerCase() === divisionName.toLowerCase());
          
          return idMatch || nameMatch;
        });

        setManagers(filteredManagers);

        // Auto-select if only one manager found
        if (filteredManagers.length === 1) {
          form.setValue("directSupervisorUid", filteredManagers[0].uid);
        } else {
          // If the current supervisor is not in the new list, clear it
          const currentSupervisor = form.getValues("directSupervisorUid");
          if (currentSupervisor && !filteredManagers.find(m => m.uid === currentSupervisor)) {
            form.setValue("directSupervisorUid", "");
          }
        }
      } catch (error) {
        console.error("Error loading managers:", error);
        setManagers([]);
      }
    };

    loadManagers();
  }, [watchBrandIdForManagers, watchDivisionIdForManagers, firestore, form, divisions]);

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

  const handleSaveHrd = async (values: HrdEmploymentInfo, additionalHistory?: any) => {
    if (!firebaseUser || !userProfile || !employeeId) return;
    setIsSaving(true);
    try {
      const b = brands?.find((b) => b.id === values.brandId);
      const d = divisions?.find((div) => div.id === values.divisionId);
      const s = managers?.find((m) => m.uid === values.directSupervisorUid);
      
      const updatedValues = { 
        ...values, 
        brand: b ? b.name : (values as any).brandName || "",
        brandName: b ? b.name : (values as any).brandName || "",
        divisionName: d ? d.name : (values as any).divisionName || "",
        directSupervisorName: s ? s.fullName : (values as any).directSupervisorName || ""
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

      // Save history
      if (changes.length > 0) {
        const historyCol = collection(
          firestore,
          "employees",
          employeeId,
          "employment_history",
        );
        for (const change of changes) {
          await addDoc(historyCol, {
            ...change,
            type: editingSection || "payroll_update",
            effectiveDate:
              updatedValues.tanggalEfektif || format(new Date(), "yyyy-MM-dd"),
            note:
              updatedValues.catatanAdministrasi ||
              "Update administrasi HRD rutin",
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

  // Derive display name/email
  const fullName =
    empDoc?.fullName ||
    profileDoc?.dataDiriIdentitas?.fullName ||
    userDoc?.fullName ||
    "Karyawan Tidak Dikenal";
  const email =
    empDoc?.email ||
    profileDoc?.dataDiriIdentitas?.personalEmail ||
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

  const employeePhone = dd.phone || "";
  const brandLabel = hrdStruktur?.brandName || "Belum diatur";
  const divisionLabel = hrdStruktur?.divisi || "Belum diatur";
  const positionLabel = hrdStruktur?.jabatan || "Belum diatur";
  const employmentStatusLabel = hrdStruktur?.statusKerja || "Belum diatur";

  const profileStatusLabel =
    completeness.status === "complete"
      ? "Lengkap"
      : completeness.status === "partial"
        ? "Sebagian"
        : "Belum Mengisi";

  const profileStatusClass =
    completeness.status === "complete"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
      : completeness.status === "partial"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
        : "bg-red-500/15 text-red-400 border-red-500/20";

  const employmentStatusClass = (employmentStatusLabel || "")
    .toLowerCase()
    .includes("aktif")
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
    : (employmentStatusLabel || "").toLowerCase().includes("resigned") ||
        (employmentStatusLabel || "").toLowerCase().includes("terminated")
      ? "bg-red-500/15 text-red-400 border-red-500/20"
      : "bg-blue-500/15 text-blue-400 border-blue-500/20";

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  const actionItems: string[] = [];
  if (!hrdStruktur?.brandName)
    actionItems.push("Brand / Perusahaan belum diatur.");
  else if (!hrdStruktur?.divisi) actionItems.push("Divisi belum diatur.");
  else if (!hrdStruktur?.jabatan) actionItems.push("Jabatan belum diatur.");

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
    { id: "rekening", label: "Rekening & Payroll", icon: CreditCard },
    { id: "pendidikan", label: "Pendidikan", icon: GraduationCap },
    { id: "dokumen", label: "Dokumen", icon: FileText },
    { id: "hrd", label: "Kepegawaian HRD", icon: ShieldCheck },
    { id: "riwayat", label: "Riwayat", icon: History },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-800 bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-[100px]"></div>
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500/5 blur-[100px]"></div>

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-slate-800 to-slate-900 text-3xl font-bold text-white shadow-2xl ring-1 ring-slate-700">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt={fullName}
                    className="h-full w-full object-cover rounded-[2rem]"
                  />
                ) : (
                  initials || "HR"
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full border-4 border-slate-950 bg-emerald-500 flex items-center justify-center shadow-lg">
                <CheckCircle className="h-4 w-4 text-white" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-emerald-500/80">
                  Employee ID: {employeeId.substring(0, 8).toUpperCase()}
                </p>
                <Badge
                  variant="outline"
                  className={`rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest ${employmentStatusClass}`}
                >
                  {employmentStatusLabel}
                </Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white mb-1">
                {fullName}
              </h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-slate-400">
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
              className="rounded-2xl border-slate-800 bg-slate-900/50 px-6 text-slate-300 hover:bg-slate-800 hover:text-white"
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
            <div className="h-10 w-[1px] bg-slate-800 mx-2 hidden sm:block"></div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-72 flex-shrink-0">
          <div className="sticky top-8 space-y-2 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 backdrop-blur-xl">
            <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
              Navigation
            </p>
            {sidebarMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium transition-all duration-300 ${
                  activeTab === item.id
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 ${activeTab === item.id ? "text-white" : "text-slate-500"}`}
                />
                {item.label}
                {item.id === "dokumen" && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] text-slate-400">
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
                  <Card className="overflow-hidden border-amber-500/30 bg-amber-500/5 backdrop-blur-md">
                    <div className="flex">
                      <div className="w-1.5 bg-amber-500"></div>
                      <div className="flex-1 p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500">
                            <AlertOctagon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-amber-200">
                              Perhatian: Data Belum Lengkap
                            </h3>
                            <p className="text-sm text-amber-500/70">
                              Terdapat beberapa item yang memerlukan tindakan
                              administrasi HRD.
                            </p>
                          </div>
                        </div>
                        <ul className="grid gap-3 sm:grid-cols-2">
                          {actionItems.map((item, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3 rounded-2xl bg-amber-500/5 p-3 text-sm text-amber-200/80 ring-1 ring-amber-500/10"
                            >
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
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
                    <Card className="overflow-hidden border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                          <User className="h-5 w-5 text-emerald-500" />
                          Quick Profile
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="p-6 flex flex-col items-center text-center border-b border-slate-800/50">
                          <div className="relative mb-4 group">
                            <div className="h-32 w-32 rounded-[2.5rem] bg-slate-800 p-1 ring-1 ring-slate-700 shadow-2xl transition-transform duration-500 group-hover:scale-105">
                              {profilePhotoUrl ? (
                                <img
                                  src={profilePhotoUrl}
                                  alt={fullName}
                                  className="h-full w-full object-cover rounded-[2.3rem]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-slate-600">
                                  {initials}
                                </div>
                              )}
                            </div>
                          </div>
                          <h2 className="text-xl font-bold text-white mb-1">
                            {fullName}
                          </h2>
                          <p className="text-sm text-slate-400 mb-4">
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
                          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                              style={{ width: `${completeness.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader>
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
                          Informasi Dasar
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <DataRow label="NIK" value={dd.nik} />
                        <DataRow label="Phone" value={employeePhone} />
                        <DataRow label="Work Email" value={email} />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detail Column */}
                  <div className="lg:col-span-2 space-y-8">
                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-bold text-white">
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
                          <DataRow label="Division" value={divisionLabel} />
                          <DataRow label="Position" value={positionLabel} />
                          <DataRow
                            label="Manager/Atasan"
                            value={hrdInfo.atasanLangsung}
                          />
                          <DataRow
                            label="Lokasi Kerja"
                            value={hrdInfo.lokasiKerja}
                          />
                          <DataRow
                            label="Sistem Kerja"
                            value={hrdInfo.sistemKerja || hrdInfo.workSystem || "WFO"}
                          />
                          <DataRow
                            label="Tipe Karyawan"
                            value={normalizedData?.tipeKaryawan}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl overflow-hidden">
                      <CardHeader className="border-b border-slate-800/50">
                        <CardTitle className="text-lg font-bold text-white">
                          Ringkasan Payroll
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                              Rekening
                            </p>
                            <p className="text-lg font-bold text-white truncate">
                              {rek.bankName || "N/A"}
                            </p>
                            <p className="text-xs text-slate-400 font-mono mt-1">
                              {rek.bankAccountNumber || "N/A"}
                            </p>
                          </div>
                          <div className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                              Gaji Pokok
                            </p>
                            <p className="text-lg font-bold text-emerald-400">
                              {hrdInfo.gajiPokok
                                ? `Rp ${hrdInfo.gajiPokok.toLocaleString()}`
                                : "Confidential"}
                            </p>
                          </div>
                          <div className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                              Masa Kerja
                            </p>
                            <p className="text-lg font-bold text-white">
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
                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
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

                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
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

                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                      <CardHeader className="border-b border-slate-800/50">
                        <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
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
                                          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
                                        >
                                          <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-bold text-white">
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
                                          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
                                        >
                                          <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-bold text-white">
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

                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
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
                              className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800"
                            >
                              <p className="text-sm font-bold text-white">
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
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                    <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
                        <MapPin className="h-5 w-5 text-emerald-500" />
                        Alamat Sesuai KTP
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-8 min-h-[120px] flex items-center shadow-inner">
                        <p className="text-slate-200 leading-relaxed italic text-lg">
                          {formatAddress(al.ktp) ||
                            "Alamat KTP belum dilengkapi."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl">
                    <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                      <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
                        <MapPin className="h-5 w-5 text-blue-500" />
                        Alamat Domisili
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-8 min-h-[120px] flex items-center shadow-inner">
                        <p className="text-slate-200 leading-relaxed italic text-lg">
                          {formatAddress(al.domisili) ||
                            "Alamat domisili belum dilengkapi."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
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
                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl overflow-hidden">
                      <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
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
                    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl overflow-hidden">
                      <CardHeader className="border-b border-slate-800/50 bg-slate-900/20">
                        <CardTitle className="text-base font-bold text-white">
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
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <div className="h-8 w-1 bg-emerald-500 rounded-full" />
                    Pendidikan Terakhir
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Card className="lg:col-span-2 border-slate-800 bg-slate-950/40 backdrop-blur-xl">
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
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <div className="h-8 w-1 bg-blue-500 rounded-full" />
                    Riwayat Pendidikan Lainnya
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pp.riwayatPendidikan?.length ? (
                      pp.riwayatPendidikan.map((edu: any, idx: number) => (
                        <Card
                          key={idx}
                          className="border-slate-800 bg-slate-950/40 overflow-hidden"
                        >
                          <CardHeader className="border-b border-slate-800/50 bg-slate-900/20 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-white">
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
                                className="w-full rounded-xl border-slate-800 bg-slate-900/50"
                                onClick={() =>
                                  window.open(
                                    getEducationDocumentUrl(edu)!,
                                    "_blank",
                                  )
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
                      <div className="col-span-2 text-center py-10 text-slate-600 border-2 border-dashed border-slate-800 rounded-3xl">
                        Belum ada riwayat tambahan.
                      </div>
                    )}
                  </div>
                </div>

                {/* Sertifikasi */}
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <div className="h-8 w-1 bg-purple-500 rounded-full" />
                    Sertifikasi & Pelatihan
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pp.sertifikasiPelatihan?.length ? (
                      pp.sertifikasiPelatihan.map((cert: any, idx: number) => (
                        <Card
                          key={idx}
                          className="border-slate-800 bg-slate-950/40 overflow-hidden"
                        >
                          <CardHeader className="border-b border-slate-800/50 bg-slate-900/20 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-white">
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
                                className="w-full rounded-xl border-slate-800 bg-slate-900/50"
                                onClick={() =>
                                  window.open(
                                    getCertificationDocumentUrl(cert)!,
                                    "_blank",
                                  )
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
                      <div className="col-span-2 text-center py-10 text-slate-600 border-2 border-dashed border-slate-800 rounded-3xl">
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
                {/* Header Dashboard HRD */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">
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
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl group hover:border-emerald-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-white">
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
                          <DataRow
                            label="Brand / Unit"
                            value={hrdStruktur?.brandName}
                          />
                          <DataRow label="Divisi" value={hrdStruktur?.divisi} />
                          <DataRow label="Jabatan / Fungsi" value={hrdStruktur?.jabatan} />
                          <DataRow label="Level Struktural" value={hrdStruktur?.structuralPosition} />
                          <DataRow
                            label="Tipe Karyawan"
                            value={hrdStruktur?.tipeKaryawan}
                          />
                          <DataRow
                            label="Status Kerja"
                            value={hrdStruktur?.statusKerja}
                            className={employmentStatusClass}
                          />
                          <DataRow
                            label="Sistem Kerja"
                            value={hrdStruktur?.sistemKerja}
                          />
                          <DataRow
                            label="Atasan Langsung"
                            value={hrdStruktur?.atasanLangsung}
                          />
                        </div>
                    </CardContent>
                  </Card>

                  {/* 2. Masa Kerja & Kontrak */}
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl group hover:border-blue-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                          <History className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-white">
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
                          label="Tanggal Masuk"
                          value={hrdInfo.tanggalMasuk || "N/A"}
                        />
                        <DataRow
                          label="Tipe Kepegawaian"
                          value={hrdStruktur?.tipeKaryawan}
                        />

                        {hrdStruktur?.tipeKaryawan === "Karyawan Tetap" ? (
                          <>
                            <DataRow
                              label="SK Pengangkatan"
                              value={
                                hrdInfo.nomorSK || hrdInfo.nomorKontrakSK || "-"
                              }
                            />
                            <DataRow
                              label="Status"
                              value="Pegawai Tetap"
                              className="text-emerald-400 font-bold"
                            />
                          </>
                        ) : (
                          <>
                            <DataRow
                              label="No Kontrak / SK"
                              value={hrdInfo.nomorKontrakSK || "-"}
                            />
                            <div className="grid grid-cols-2 gap-4">
                              <DataRow
                                label="Mulai"
                                value={hrdInfo.kontrakMulai || "-"}
                              />
                              <DataRow
                                label="Selesai"
                                value={
                                  hrdInfo.kontrakSelesai ||
                                  (hrdStruktur?.tipeKaryawan ===
                                  "Karyawan Tetap"
                                    ? "Tidak terbatas"
                                    : "-")
                                }
                              />
                            </div>
                            <DataRow
                              label="Durasi"
                              value={hrdInfo.durasiKontrak || "-"}
                            />
                          </>
                        )}

                        {/* Conditional Info */}
                        {hrdStruktur?.tipeKaryawan === "Magang" &&
                          hrdInfo.mentor && (
                            <DataRow label="Mentor" value={hrdInfo.mentor} />
                          )}
                        {hrdStruktur?.tipeKaryawan === "Training" &&
                          hrdInfo.evaluator && (
                            <DataRow
                              label="Evaluator"
                              value={hrdInfo.evaluator}
                            />
                          )}
                        {hrdStruktur?.tipeKaryawan === "Probation" && (
                          <DataRow
                            label="Periode Probation"
                            value={`${hrdInfo.masaPercobaanMulai || "?"} s/d ${hrdInfo.masaPercobaanSelesai || "?"}`}
                          />
                        )}

                        <div className="h-px bg-slate-800/50 my-2"></div>
                        <DataRow
                          label="Jadwal & Lokasi"
                          value={`${hrdInfo.hariKerja || "Senin-Jumat"} | ${hrdInfo.lokasiKerja || "Office"}`}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* 3. Payroll & Benefit */}
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl group hover:border-emerald-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-white">
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
                                  className="flex justify-between items-center text-xs py-1 border-b border-slate-800/50 last:border-0"
                                >
                                  <span className="text-slate-400">
                                    {al.name}
                                  </span>
                                  <span className="font-bold text-white">
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

                        <div className="h-px bg-slate-800/50 my-2"></div>

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

                      <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                          Rekening Payroll
                        </p>
                        {hrdInfo.useDifferentPayrollAccount ? (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-white">
                              {hrdInfo.customPayrollBank || "Belum diatur"}
                            </p>
                            <p className="text-xs text-slate-400 font-mono">
                              {hrdInfo.customPayrollAccountNumber || "-"}
                            </p>
                            <p className="text-[10px] text-slate-500 italic">
                              a.n. {hrdInfo.customPayrollAccountHolder || "-"}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-white">
                              {rek.bankName || "N/A"}
                            </p>
                            <p className="text-xs text-slate-400 font-mono">
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
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl group hover:border-purple-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-white">
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
                        <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-800/50">
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
                        <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-800/50">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                            Jadwal
                          </p>
                          <p className="text-sm font-bold text-white">
                            {hrdInfo.jadwalKerja || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-xl bg-slate-900/40 border border-slate-800/50">
                          <p className="text-[9px] text-slate-500 uppercase mb-1">
                            Hadir
                          </p>
                          <p className="text-sm font-bold text-emerald-400">
                            {hrdInfo.hadir || 0}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-900/40 border border-slate-800/50">
                          <p className="text-[9px] text-slate-500 uppercase mb-1">
                            Telat
                          </p>
                          <p className="text-sm font-bold text-amber-400">
                            {hrdInfo.terlambat || 0}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-900/40 border border-slate-800/50">
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
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl group hover:border-sky-500/30 transition-all duration-300 xl:col-span-2">
                    <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 border border-sky-500/20">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-white">
                          Riwayat Karier & Kinerja
                        </CardTitle>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white"
                        onClick={() => setEditingSection("tambah_riwayat")}
                      >
                        <Plus className="h-3.5 w-3.5 mr-2" /> Event Karier
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-8">
                      {historyData && historyData.length > 0 ? (
                        <div className="relative pl-6 space-y-8 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800/50">
                          {historyData.slice(0, 5).map((h: any) => (
                            <div key={h.id} className="relative">
                              <div className="absolute -left-[22px] top-1 h-4 w-4 rounded-full border-2 border-slate-900 shadow-lg bg-emerald-500"></div>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold text-white uppercase tracking-wider">
                                      {h.title || h.label || h.type}
                                    </p>
                                    <Badge
                                      variant="outline"
                                      className="text-[8px] py-0 border-slate-800 text-slate-500 uppercase"
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
                  <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl group hover:border-red-500/30 transition-all duration-300">
                    <CardHeader className="border-b border-slate-800/50 flex flex-row items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                          <AlertOctagon className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base font-bold text-white">
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
                      <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50 min-h-[150px]">
                        <p className="text-sm text-slate-400 leading-relaxed italic">
                          {hrdInfo.catatanInternalHrd ||
                            "Catatan rahasia HRD belum diisi."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Editing Dialogs */}
                <Dialog
                  open={!!editingSection}
                  onOpenChange={(open) => !open && setEditingSection(null)}
                >
                  <DialogContent className="w-[95vw] md:w-[90vw] max-w-5xl h-[95vh] md:h-[90vh] bg-slate-950 border-slate-800 text-slate-100 flex flex-col p-0 overflow-hidden shadow-2xl">
                    {/* Sticky Header */}
                    <div className="shrink-0 z-50 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800/60 px-6 py-5 md:px-10 md:py-7">
                      <DialogHeader>
                        <DialogTitle className="text-xl md:text-2xl font-black text-white flex items-center gap-4">
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
                              <div className="p-5 md:p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl flex gap-4 items-start">
                                <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                  <Info className="h-5 w-5" />
                                </div>
                                <p className="text-sm text-slate-400 leading-relaxed">
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
                                        className="bg-slate-900/50 border-slate-800 h-12 rounded-xl focus:border-emerald-500/50"
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
                                        form.setValue(
                                          "directSupervisorUid",
                                          "",
                                        );
                                      }}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Brand" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        {brands?.map((b) => (
                                          <SelectItem key={b.id!} value={b.id!}>
                                            {b.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Pilih perusahaan/brand tempat karyawan
                                      ditempatkan.
                                    </p>
                                  </FormItem>
                                )}
                              />

                              {/* Divisi */}
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
                                        // Reset supervisor when division changes
                                        form.setValue(
                                          "directSupervisorUid",
                                          "",
                                        );
                                      }}
                                      value={field.value}
                                      disabled={!form.watch("brandId")}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Divisi" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        {divisions.map((d) => (
                                          <SelectItem key={d.id} value={d.id}>
                                            {d.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Divisi akan menentukan struktur tim dan
                                      atasan langsung karyawan.
                                    </p>
                                    {divisions.length === 0 && (
                                      <p className="text-xs text-amber-600 mt-2">
                                        ⚠️ Belum ada divisi untuk brand ini.
                                        Tambahkan terlebih dahulu di Master
                                        Data.
                                      </p>
                                    )}
                                  </FormItem>
                                )}
                              />

                              {/* Jabatan Struktural */}
                              <FormField
                                control={form.control}
                                name="structuralPosition"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                      Jabatan Struktural
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Jabatan Struktural" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="staff">
                                          Staff
                                        </SelectItem>
                                        <SelectItem value="division_manager">
                                          Manager Divisi
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Jabatan struktural digunakan untuk
                                      membedakan level tanggung jawab karyawan.
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
                                        className="bg-slate-900/50 border-slate-800 h-12 rounded-xl focus:border-emerald-500/50"
                                      />
                                    </FormControl>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Isi fungsi kerja spesifik karyawan di
                                      dalam divisi.
                                    </p>
                                  </FormItem>
                                )}
                              />

                              {/* Tipe Karyawan */}
                              <FormField
                                control={form.control}
                                name="employeeType"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                      Tipe Karyawan
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Tipe Karyawan" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="Karyawan Tetap">
                                          Karyawan Tetap
                                        </SelectItem>
                                        <SelectItem value="Kontrak">
                                          Kontrak
                                        </SelectItem>
                                        <SelectItem value="Probation">
                                          Probation
                                        </SelectItem>
                                        <SelectItem value="Magang">
                                          Magang
                                        </SelectItem>
                                        <SelectItem value="Freelance">
                                          Freelance
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Tipe karyawan menjelaskan jenis hubungan
                                      kerja dengan perusahaan.
                                    </p>
                                  </FormItem>
                                )}
                              />

                              {/* Status Kerja */}
                              <FormField
                                control={form.control}
                                name="employmentStatus"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                      Status Kerja
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Status Kerja" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="Training">
                                          Training
                                        </SelectItem>
                                        <SelectItem value="Masa Percobaan">
                                          Masa Percobaan
                                        </SelectItem>
                                        <SelectItem value="Aktif">
                                          Aktif
                                        </SelectItem>
                                        <SelectItem value="Kontrak">
                                          Kontrak
                                        </SelectItem>
                                        <SelectItem value="Magang">
                                          Magang
                                        </SelectItem>
                                        <SelectItem value="Resigned">
                                          Resigned
                                        </SelectItem>
                                        <SelectItem value="Terminated">
                                          Terminated
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Status kerja menjelaskan kondisi aktif
                                      karyawan saat ini.
                                    </p>
                                  </FormItem>
                                )}
                              />

                              {/* Atasan Langsung */}
                              <FormField
                                control={form.control}
                                name="directSupervisorUid"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                      Atasan Langsung
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                      disabled={
                                        !form.watch("brandId") ||
                                        !form.watch("divisionId")
                                      }
                                    >
                                      <FormControl>
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Atasan Langsung" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        {managers.map((m) => (
                                          <SelectItem key={m.uid} value={m.uid}>
                                            {m.fullName}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Atasan langsung diambil dari Manager
                                      Divisi sesuai brand dan divisi karyawan.
                                    </p>
                                    {managers.length === 0 &&
                                      form.watch("divisionId") && (
                                        <p className="text-xs text-amber-600 mt-2">
                                          ⚠️ Belum ada Manager Divisi untuk
                                          divisi ini. Silakan tetapkan melalui
                                          User Management.
                                        </p>
                                      )}
                                  </FormItem>
                                )}
                              />
                          
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
                                        <SelectTrigger className="bg-slate-900/50 border-slate-800 h-12 rounded-xl">
                                          <SelectValue placeholder="Pilih Sistem Kerja" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="WFO">WFO (Office)</SelectItem>
                                        <SelectItem value="WFH">WFH (Remote)</SelectItem>
                                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                                        <SelectItem value="Shift">Shift</SelectItem>
                                        <SelectItem value="Lapangan">Lapangan / On-Site</SelectItem>
                                        <SelectItem value="Fleksibel">Fleksibel</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Tentukan metode kehadiran atau pola kerja karyawan.
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
                                        className="bg-slate-900/50 border-slate-800 h-12 rounded-xl focus:border-emerald-500/50"
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
                                        className="bg-slate-900/50 border-slate-800 min-h-[80px] rounded-xl focus:border-emerald-500/50"
                                      />
                                    </FormControl>
                                    <p className="text-xs text-slate-500 mt-1">
                                      Alasan ini akan disimpan sebagai log audit
                                      perubahan struktur.
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
                                        <SelectTrigger className="bg-slate-900 border-slate-800">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-slate-900 border-slate-800">
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
                                        className="bg-slate-900 border-slate-800"
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
                                        className="bg-slate-900 border-slate-800 min-h-[100px]"
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
                                        className="bg-slate-900 border-slate-800"
                                      />
                                    </FormControl>
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
                                        className="bg-slate-900 border-slate-800 min-h-[300px] text-sm leading-relaxed"
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
                                  name="tipeKaryawan"
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
                                          <SelectTrigger className="bg-slate-900 border-slate-800">
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                          {TIPE_KARYAWAN_OPTIONS.map((o) => (
                                            <SelectItem key={o} value={o}>
                                              {o}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {normalizedData?.tipeKaryawan ===
                                        "Karyawan Tetap" &&
                                        field.value !== "Karyawan Tetap" && (
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
                                <FormField
                                  control={form.control}
                                  name="statusKontrak"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-black text-slate-500 uppercase">
                                        Status Siklus
                                      </FormLabel>
                                      <Select
                                        onValueChange={field.onChange}
                                        value={field.value || ""}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="bg-slate-900 border-slate-800">
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                          <SelectItem value="Draft">
                                            Draft
                                          </SelectItem>
                                          <SelectItem value="Aktif">
                                            Aktif
                                          </SelectItem>
                                          <SelectItem value="Diperpanjang">
                                            Diperpanjang
                                          </SelectItem>
                                          <SelectItem value="Selesai">
                                            Selesai
                                          </SelectItem>
                                          <SelectItem value="Expired">
                                            Expired
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              </div>

                              {/* 2. Kondisional berdasarkan Tipe */}
                              <div className="space-y-4 pt-4 border-t border-slate-800">
                                {/* Magang / Intern */}
                                {form.watch("tipeKaryawan") === "Magang" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="kontrakMulai"
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
                                                className="bg-slate-900 border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="durasiKontrak"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Durasi Magang
                                            </FormLabel>
                                            <Select
                                              onValueChange={field.onChange}
                                              value={
                                                DURASI_OPTIONS.includes(
                                                  field.value || "",
                                                )
                                                  ? field.value
                                                  : "Custom"
                                              }
                                            >
                                              <FormControl>
                                                <SelectTrigger className="bg-slate-900 border-slate-800">
                                                  <SelectValue />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent className="bg-slate-900 border-slate-800">
                                                {DURASI_OPTIONS.map((o) => (
                                                  <SelectItem key={o} value={o}>
                                                    {o}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            {!DURASI_OPTIONS.includes(
                                              field.value || "",
                                            ) &&
                                              field.value !== "Custom" && (
                                                <Input
                                                  {...field}
                                                  value={field.value || ""}
                                                  className="mt-2 bg-slate-900 border-slate-800"
                                                  placeholder="Isi durasi manual..."
                                                />
                                              )}
                                            {field.value === "Custom" && (
                                              <Input
                                                onChange={(e) =>
                                                  field.onChange(e.target.value)
                                                }
                                                className="mt-2 bg-slate-900 border-slate-800"
                                                placeholder="Contoh: 45 Hari"
                                              />
                                            )}
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="kontrakSelesai"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Selesai Magang (Auto)
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="mentor"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Mentor / Pembimbing
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              value={field.value || ""}
                                              placeholder="Nama Mentor"
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* Training */}
                                {form.watch("tipeKaryawan") === "Training" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="kontrakMulai"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Mulai Training
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-slate-900 border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="durasiKontrak"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Durasi Training
                                            </FormLabel>
                                            <Select
                                              onValueChange={field.onChange}
                                              value={
                                                DURASI_OPTIONS.includes(
                                                  field.value || "",
                                                )
                                                  ? field.value
                                                  : "Custom"
                                              }
                                            >
                                              <FormControl>
                                                <SelectTrigger className="bg-slate-900 border-slate-800">
                                                  <SelectValue />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent className="bg-slate-900 border-slate-800">
                                                {DURASI_OPTIONS.map((o) => (
                                                  <SelectItem key={o} value={o}>
                                                    {o}
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
                                      name="kontrakSelesai"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Selesai Training (Auto)
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="evaluator"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Evaluator / Penanggung Jawab
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              value={field.value || ""}
                                              placeholder="Nama Evaluator"
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* Probation */}
                                {form.watch("tipeKaryawan") === "Probation" && (
                                  <>
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="masaPercobaanMulai"
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
                                                className="bg-slate-900 border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="masaPercobaanSelesai"
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
                                                className="bg-slate-900 border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="tanggalEvaluasi"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Tanggal Evaluasi Akhir
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* Kontrak */}
                                {form.watch("tipeKaryawan") === "Kontrak" && (
                                  <>
                                    <FormField
                                      control={form.control}
                                      name="nomorKontrakSK"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Nomor Kontrak
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              value={field.value || ""}
                                              placeholder="Contoh: 001/KTR/ENV/2024"
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="kontrakMulai"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Kontrak Mulai
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-slate-900 border-slate-800"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="durasiKontrak"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-500">
                                              Durasi Kontrak
                                            </FormLabel>
                                            <Select
                                              onValueChange={field.onChange}
                                              value={
                                                DURASI_OPTIONS.includes(
                                                  field.value || "",
                                                )
                                                  ? field.value
                                                  : "Custom"
                                              }
                                            >
                                              <FormControl>
                                                <SelectTrigger className="bg-slate-900 border-slate-800">
                                                  <SelectValue />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent className="bg-slate-900 border-slate-800">
                                                {DURASI_OPTIONS.map((o) => (
                                                  <SelectItem key={o} value={o}>
                                                    {o}
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
                                      name="kontrakSelesai"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Kontrak Selesai (Auto)
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </>
                                )}

                                {/* Karyawan Tetap */}
                                {form.watch("tipeKaryawan") ===
                                  "Karyawan Tetap" && (
                                  <>
                                    <FormField
                                      control={form.control}
                                      name="tanggalMasuk"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-slate-500">
                                            Tanggal Efektif Aktif / Pengangkatan
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              {...field}
                                              value={field.value || ""}
                                              className="bg-slate-900 border-slate-800"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="nomorSK"
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
                                              className="bg-slate-900 border-slate-800"
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
                                            <SelectTrigger className="bg-slate-900 border-slate-800">
                                              <SelectValue />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent className="bg-slate-900 border-slate-800">
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
                                    name="lokasiKerja"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs font-bold text-slate-500">
                                          Lokasi Kerja
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            value={field.value || ""}
                                            className="bg-slate-900 border-slate-800"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                <FormField
                                  control={form.control}
                                  name="catatanKontrak"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs font-bold text-slate-500">
                                        Catatan Khusus
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          {...field}
                                          value={field.value || ""}
                                          className="bg-slate-900 border-slate-800"
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
                                        type="number"
                                        {...field}
                                        value={field.value || ""}
                                        onChange={(e) =>
                                          field.onChange(Number(e.target.value))
                                        }
                                        className="bg-slate-900 border-slate-800"
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
                                    (al, idx) => (
                                      <div
                                        key={al.id}
                                        className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col gap-3"
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
                                            <SelectContent className="bg-slate-900">
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
                                            type="number"
                                            placeholder="Nominal"
                                            value={al.amount || ""}
                                            onChange={(e) => {
                                              const current = [
                                                ...(form.getValues(
                                                  "allowances",
                                                ) || []),
                                              ];
                                              current[idx].amount = Number(
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

                              <div className="h-px bg-slate-800 my-4"></div>

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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                                          type="number"
                                          {...field}
                                          value={field.value || ""}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value),
                                            )
                                          }
                                          className="bg-slate-900 border-slate-800"
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
                        <div className="shrink-0 z-50 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800/60 px-6 py-5 md:px-10 md:py-6 flex justify-end items-center gap-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-12 px-8 rounded-xl border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
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
              </TabsContent>

              <TabsContent value="riwayat">
                {/* Extended History View */}
                <Card className="border-slate-800 bg-slate-950/40">
                  <CardHeader className="border-b border-slate-800/50">
                    <CardTitle className="text-lg font-bold">
                      Audit Trail Lengkap
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-900/50">
                        <TableRow className="border-slate-800/50">
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
                            className="border-slate-800/50 hover:bg-slate-900/30"
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
                                className="text-[9px] uppercase border-slate-800 text-slate-500"
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
                                  <span className="text-white font-medium">
                                    {h.oldValue}
                                  </span>{" "}
                                  →{" "}
                                  <span className="text-emerald-400 font-bold">
                                    {h.newValue}
                                  </span>
                                </p>
                              ) : (
                                h.title
                              )}
                            </TableCell>
                            <TableCell className="text-[11px] text-slate-400 italic">
                              "{h.note || "-"}"
                            </TableCell>
                            <TableCell className="px-6 text-right text-[10px] font-bold text-slate-300">
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
    </div>
  );
}
