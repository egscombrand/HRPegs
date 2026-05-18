"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Edit,
  User,
  Home,
  Banknote,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Users,
  Heart,
  FileText,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  GraduationCap,
  Award,
} from "lucide-react";
import type { UserProfile, EmployeeProfile } from "@/lib/types";
import { format } from "date-fns";
import { parseDateValue } from "@/lib/utils";
import { calculateProfileCompleteness } from "@/lib/employee-completeness";
import { SecureDriveImage } from "@/components/SecureDriveImage";
import { useToast } from "@/hooks/use-toast";
import { openSecureFile, extractFileIdFromUrl } from "@/lib/candidate-docs-utils";

const SectionTitle = ({
  children,
  icon,
  description,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  description?: string;
}) => (
  <div className="flex flex-col gap-1 mb-6">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-bold tracking-tight text-slate-100">
          {children}
        </h3>
        {description && (
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            {description}
          </p>
        )}
      </div>
    </div>
  </div>
);

const DataRow = ({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value?: string | number | null;
  icon?: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`group flex flex-col gap-1.5 py-3 border-b border-slate-800/40 last:border-0 ${className}`}
  >
    <div className="flex items-center gap-2 text-slate-500 font-semibold uppercase tracking-[0.08em] text-[10px]">
      {icon}
      {label}
    </div>
    <div className="text-sm font-bold text-slate-200 min-h-[1.25rem]">
      {value || (
        <span className="text-slate-600 font-medium italic text-xs">
          Belum diisi
        </span>
      )}
    </div>
  </div>
);

const FileStatus = ({
  label,
  url,
  pending = false,
  notOwned = false,
}: {
  label: string;
  url?: string;
  pending?: boolean;
  notOwned?: boolean;
}) => {
  const { toast } = useToast();

  if (notOwned) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-slate-800/40 last:border-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <Badge
          variant="outline"
          className="bg-slate-900/50 text-slate-500 border-slate-800 text-[10px]"
        >
          File belum tersedia
        </Badge>
      </div>
    );
  }

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
    <div className="flex items-center justify-between py-3 border-b border-slate-800/40 last:border-0 group">
      <div className="flex items-center gap-3">
        {fileId ? (
          <div className="h-8 w-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700 shrink-0 text-slate-500">
            <FileText className="h-4 w-4" />
          </div>
        ) : null}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {fileId ? (
          <>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] gap-1 px-2 py-0.5 font-bold"
            >
              <CheckCircle2 className="h-3 w-3" /> Sudah diunggah
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] text-primary hover:bg-primary/10 font-bold"
              onClick={handleOpenSecure}
            >
              <Eye className="mr-1 h-3 w-3" /> Lihat Dokumen
            </Button>
          </>
        ) : pending ? (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] gap-1 px-2 py-0.5 font-bold"
          >
            <Clock className="h-3 w-3" /> Menyusul
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] gap-1 px-2 py-0.5 font-bold"
          >
            <XCircle className="h-3 w-3" /> File belum tersedia
          </Badge>
        )}
      </div>
    </div>
  );
};

const formatStructuredAddress = (addr?: {
  street?: string;
  rt?: string;
  rw?: string;
  kodePos?: string;
  provinsi?: { id: string; name: string };
  kabupatenKota?: { id: string; name: string };
  kecamatan?: { id: string; name: string };
  kelurahan?: { id: string; name: string };
}) => {
  if (!addr) return null;

  const parts: string[] = [];

  // Tambahkan nama jalan dengan prefix "Jl." jika ada
  if (addr.street?.trim()) {
    parts.push(`Jl. ${addr.street.trim()}`);
  }

  // Tambahkan RT/RW jika ada
  const rtRwParts: string[] = [];
  if (addr.rt?.trim()) rtRwParts.push(`RT ${addr.rt.trim()}`);
  if (addr.rw?.trim()) rtRwParts.push(`RW ${addr.rw.trim()}`);
  if (rtRwParts.length > 0) {
    parts.push(rtRwParts.join("/"));
  }

  // Tambahkan kelurahan
  if (addr.kelurahan?.name?.trim()) {
    parts.push(`Kel. ${addr.kelurahan.name.trim()}`);
  }

  // Tambahkan kecamatan
  if (addr.kecamatan?.name?.trim()) {
    parts.push(`Kec. ${addr.kecamatan.name.trim()}`);
  }

  // Tambahkan kabupaten/kota
  if (addr.kabupatenKota?.name?.trim()) {
    parts.push(addr.kabupatenKota.name.trim());
  }

  // Tambahkan provinsi
  if (addr.provinsi?.name?.trim()) {
    parts.push(addr.provinsi.name.trim());
  }

  // Tambahkan kode pos
  if (addr.kodePos?.trim()) {
    parts.push(addr.kodePos.trim());
  }

  // Jika tidak ada bagian sama sekali, return null
  return parts.length > 0 ? parts.join(", ") : null;
};

export function EmployeeProfileDisplay({
  employeeProfile,
  userProfile,
  onEdit,
  onPhotoChange,
}: {
  employeeProfile: EmployeeProfile;
  userProfile: UserProfile;
  onEdit: () => void;
  onPhotoChange?: () => void;
}) {
  const isProfileComplete = employeeProfile?.completeness?.isComplete;
  const iden = employeeProfile?.dataDiriIdentitas || ({} as any);
  const addr = employeeProfile?.alamat || ({} as any);
  const docAdmin = employeeProfile?.dokumenAdministratif || ({} as any);
  const rek = employeeProfile?.dataRekening || ({} as any);
  const family = employeeProfile?.dataKeluarga || {};
  const contacts = employeeProfile?.kontakDarurat || [];
  const pp = employeeProfile?.pendidikanDanPengembangan || ({} as any);

  const totalSiblings = family.saudaraKandung?.length || 0;
  const totalDependents = family.tanggungan?.length || 0;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = parseDateValue(dateStr);
    return date ? format(date, "dd MMMM yyyy") : null;
  };

  const requiresSim = (() => {
    const position = (employeeProfile.positionTitle || "").toLowerCase();
    const requiredKeywords = [
      "driver",
      "lapangan",
      "operasional",
      "sales lapangan",
    ];
    return (
      (employeeProfile as any).requiresSIM === true ||
      requiredKeywords.some((kw) => position.includes(kw))
    );
  })();

  // Use SSOT helper — same calculation as HRD view
  const _completeness = calculateProfileCompleteness(employeeProfile);
  const completeness = {
    completedMandatoryCount: _completeness.sections.filter(
      (s) => s.mandatory && s.isComplete,
    ).length,
    totalMandatoryCount: _completeness.sections.filter((s) => s.mandatory)
      .length,
    isFullyComplete: _completeness.status === "complete",
    percentage: _completeness.percentage,
    missingBlocks: _completeness.sections
      .filter((s) => s.mandatory && !s.isComplete)
      .map((s) => s.name),
  };

  // Safe file/url helper for image sources
  const safeSrc = (src?: unknown): string | null =>
    typeof src === "string" && src.trim().length > 0 ? src.trim() : null;

  // Extract profile photo fileId from metadata or viewUrl
  const extractProfilePhotoFileId = (): string | null => {
    const file = (iden as any)?.profilePhotoFile;
    const profilePhotoFileId = safeSrc(file?.fileId);
    if (profilePhotoFileId) {
      return profilePhotoFileId;
    }
    const safeProfilePhotoUrl = safeSrc(iden.profilePhotoUrl);
    if (safeProfilePhotoUrl) {
      const match = safeProfilePhotoUrl.match(/fileId=([a-zA-Z0-9_-]+)/);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return null;
  };

  const profilePhotoFileId = safeSrc(extractProfilePhotoFileId());

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-700">
      {/* 1. Header Profile */}
      <div className="relative group overflow-hidden rounded-[2.5rem] bg-slate-900/40 border border-slate-800/60 p-8 md:p-10 shadow-2xl shadow-blue-500/5">
        <div className="absolute top-0 right-0 -m-8 h-64 w-64 rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-colors duration-1000" />
        <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-10">
          <div className="relative group/avatar">
            <Avatar className="h-32 w-32 md:h-40 md:w-40 rounded-[2.5rem] border-4 border-slate-800 shadow-2xl transition-all duration-500 group-hover/avatar:scale-[1.02] group-hover/avatar:border-primary/30">
              {profilePhotoFileId ? (
                <SecureDriveImage
                  fileId={profilePhotoFileId}
                  alt="Profile Photo"
                  className="w-full h-full object-cover rounded-[2.5rem]"
                  fallbackIcon={<User className="h-16 w-16 text-slate-400" />}
                />
              ) : (
                <AvatarFallback className="bg-slate-800 text-slate-400">
                  <User className="h-16 w-16" />
                </AvatarFallback>
              )}
            </Avatar>
          </div>

          <div className="flex-1 text-center md:text-left space-y-4">
            <div className="space-y-1">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-100">
                  {iden.fullName || employeeProfile.fullName}
                </h1>
                <Badge
                  variant={
                    completeness.isFullyComplete ? "default" : "secondary"
                  }
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${completeness.isFullyComplete ? "bg-emerald-500 hover:bg-emerald-600" : "bg-orange-500 text-white hover:bg-orange-600"}`}
                >
                  {completeness.isFullyComplete
                    ? "Profil Lengkap"
                    : `Belum Lengkap (${completeness.completedMandatoryCount}/${completeness.totalMandatoryCount})`}
                </Badge>
              </div>
              <p className="text-slate-400 font-bold tracking-wider uppercase text-xs flex items-center justify-center md:justify-start gap-4">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-primary" />{" "}
                  {iden.personalEmail || employeeProfile.email}
                </span>
                <span className="hidden md:inline text-slate-700">|</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-primary" />{" "}
                  {iden.phone || employeeProfile.phone}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
              <Button
                onClick={onEdit}
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 h-11 shadow-lg shadow-primary/20 transition-all duration-300"
              >
                <Edit className="mr-2 h-4 w-4" /> Edit Profil Saya
              </Button>
            </div>

            {!completeness.isFullyComplete && (
              <div className="mt-4 flex flex-col md:flex-row items-center md:items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-left">
                <div className="flex-1">
                  <p className="text-xs text-orange-400 font-semibold mb-1">
                    Blok yang belum lengkap:
                  </p>
                  <ul className="text-xs text-slate-300 flex flex-wrap gap-2">
                    {completeness.missingBlocks.map((block, i) => (
                      <li
                        key={i}
                        className="bg-slate-900/50 px-2 py-1 rounded-md"
                      >
                        • {block}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    Progress
                  </p>
                  <p className="text-lg font-black text-orange-400">
                    {completeness.percentage}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column (Main Data) */}
        <div className="space-y-8">
          {/* Section: Data Pribadi */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-blue-500/20">
            <CardContent className="p-8 md:p-10">
              <SectionTitle
                icon={<User className="h-5 w-5" />}
                description="Informasi Identitas"
              >
                Data Pribadi
              </SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2">
                <DataRow
                  label="Nama Panggilan"
                  value={iden.nickName}
                  icon={<Heart className="h-3 w-3" />}
                />
                <DataRow
                  label="Tempat, Tanggal Lahir"
                  value={
                    iden.birthPlace
                      ? `${iden.birthPlace}, ${formatDate(iden.birthDate)}`
                      : null
                  }
                  icon={<Calendar className="h-3 w-3" />}
                />
                <DataRow
                  label="Jenis Kelamin"
                  value={iden.gender}
                  icon={<User className="h-3 w-3" />}
                />
                <DataRow
                  label="Status Pernikahan"
                  value={iden.maritalStatus}
                  icon={<Users className="h-3 w-3" />}
                />
                <DataRow
                  label="Agama"
                  value={iden.religion}
                  icon={<ShieldCheck className="h-3 w-3" />}
                />
                <DataRow
                  label="Kewarganegaraan"
                  value={iden.nationality}
                  icon={<MapPin className="h-3 w-3" />}
                />
                <DataRow label="Golongan Darah" value={iden.golonganDarah} />
                <DataRow
                  label="Tinggi & Berat"
                  value={
                    iden.tinggiBadan
                      ? `${iden.tinggiBadan} cm / ${iden.beratBadan} kg`
                      : null
                  }
                />
                {iden.hasPhysicalCondition === "Ya" && (
                  <DataRow
                    label="Kelainan Fisik"
                    value={iden.physicalConditionDetails}
                    className="col-span-2"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section: Alamat */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-emerald-500/20">
            <CardContent className="p-8 md:p-10">
              <SectionTitle
                icon={<Home className="h-5 w-5" />}
                description="Domisili & KTP"
              >
                Alamat Lengkap
              </SectionTitle>
              <div className="space-y-6">
                <div className="group space-y-2">
                  <div className="flex items-center gap-2 text-slate-500 font-semibold uppercase tracking-[0.08em] text-[10px]">
                    <MapPin className="h-3 w-3" /> Alamat Domisili Saat Ini
                  </div>
                  <p className="text-sm font-bold text-slate-200 leading-relaxed bg-slate-900/30 p-4 rounded-2xl border border-slate-800/40 group-hover:border-primary/20 transition-colors line-clamp-3">
                    {formatStructuredAddress(addr.domisili) ||
                      addr.addressCurrent || (
                        <span className="text-slate-600 font-medium italic">
                          Belum diisi
                        </span>
                      )}
                  </p>
                </div>
                <div className="group space-y-2">
                  <div className="flex items-center gap-2 text-slate-500 font-semibold uppercase tracking-[0.08em] text-[10px]">
                    <MapPin className="h-3 w-3" /> Alamat Sesuai KTP
                  </div>
                  <p className="text-sm font-bold text-slate-200 leading-relaxed bg-slate-900/30 p-4 rounded-2xl border border-slate-800/40 group-hover:border-primary/20 transition-colors line-clamp-3">
                    {formatStructuredAddress(addr.ktp) || (
                      <span className="text-slate-600 font-medium italic">
                        Belum diisi
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Pendidikan & Pengembangan */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-indigo-500/20">
            <CardContent className="p-8 md:p-10">
              <SectionTitle
                icon={<GraduationCap className="h-5 w-5" />}
                description="Riwayat Akademik & Sertifikasi"
              >
                Pendidikan & Pengembangan
              </SectionTitle>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Pendidikan Terakhir */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <GraduationCap className="h-3 w-3" /> Pendidikan Terakhir
                  </h4>
                  {pp.pendidikanTerakhir?.jenjang ? (
                    <div className="space-y-1 bg-slate-900/20 p-5 rounded-[2rem] border border-slate-800/40">
                      <DataRow
                        label="Jenjang"
                        value={pp.pendidikanTerakhir.jenjang}
                        className="py-2"
                      />
                      <DataRow
                        label="Institusi"
                        value={pp.pendidikanTerakhir.namaInstitusi}
                        className="py-2"
                      />
                      <DataRow
                        label="Jurusan"
                        value={pp.pendidikanTerakhir.jurusan}
                        className="py-2"
                      />
                      <DataRow
                        label="Tahun Lulus"
                        value={pp.pendidikanTerakhir.tahunLulus}
                        className="py-2"
                      />
                      <FileStatus
                        label="Bukti Ijazah"
                        url={pp.pendidikanTerakhir.ijazahUrl}
                      />
                    </div>
                  ) : (
                    <div className="bg-slate-900/20 p-5 rounded-[2rem] border border-dashed border-slate-800/40 text-center">
                      <p className="text-xs text-slate-500 font-bold italic">
                        Belum diisi
                      </p>
                    </div>
                  )}
                </div>

                {/* Sertifikasi & Pelatihan */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Award className="h-3 w-3" /> Sertifikasi & Pelatihan
                  </h4>
                  {pp.sertifikasiPelatihan &&
                  pp.sertifikasiPelatihan.length > 0 ? (
                    <div className="space-y-3">
                      {pp.sertifikasiPelatihan
                        .slice(0, 3)
                        .map((cert: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-slate-900/20 p-4 rounded-[1.5rem] border border-slate-800/40"
                          >
                            <p className="text-sm font-bold text-slate-200 mb-1">
                              {cert.namaSertifikasi || "-"}
                            </p>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate mr-2">
                                {cert.penyelenggara || "-"}
                              </span>
                              <div className="text-right flex-shrink-0">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                                  Diperoleh:{" "}
                                  {cert.tahunPerolehan || cert.tahun || "-"}
                                </span>
                                <span className="text-[9px] font-bold text-slate-500 block">
                                  Exp: {cert.tahunExpired || "Tidak ada"}
                                </span>
                              </div>
                            </div>
                            <FileStatus
                              label="Sertifikat"
                              url={cert.buktiUrl}
                            />
                          </div>
                        ))}
                      {pp.sertifikasiPelatihan.length > 3 && (
                        <p className="text-[10px] text-center text-slate-500 font-bold italic pt-2">
                          + {pp.sertifikasiPelatihan.length - 3} sertifikasi
                          lainnya
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-900/20 p-5 rounded-[2rem] border border-dashed border-slate-800/40 text-center flex flex-col justify-center min-h-[80px]">
                      <p className="text-xs text-slate-500 font-bold italic">
                        Belum diisi
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {pp.riwayatPendidikan && pp.riwayatPendidikan.length > 0 && (
                <div className="mt-8 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <GraduationCap className="h-3 w-3" /> Riwayat Pendidikan
                    Lainnya
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pp.riwayatPendidikan.map((edu: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-slate-900/20 p-5 rounded-[2rem] border border-slate-800/40"
                      >
                        <DataRow
                          label="Jenjang"
                          value={edu.jenjang}
                          className="py-2"
                        />
                        <DataRow
                          label="Institusi"
                          value={edu.namaInstitusi}
                          className="py-2"
                        />
                        <DataRow
                          label="Jurusan"
                          value={edu.jurusan}
                          className="py-2"
                        />
                        <DataRow
                          label="Tahun Lulus"
                          value={edu.tahunLulus}
                          className="py-2"
                        />
                        <FileStatus label="Bukti Ijazah" url={edu.ijazahUrl} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Sidebar Cards) */}
        <div className="space-y-8">
          {/* Section: Dokumen Administratif */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-amber-500/20">
            <CardContent className="p-8">
              <SectionTitle
                icon={<FileText className="h-5 w-5" />}
                description="Legalitas & Berkas"
              >
                Dokumen
              </SectionTitle>
              <div className="space-y-1 mb-6">
                <DataRow label="NIK (Nomor KTP)" value={iden.nik} />
                <DataRow label="Nomor NPWP" value={docAdmin.npwp} />
                <DataRow
                  label="No. BPJS Kesehatan"
                  value={docAdmin.bpjsKesehatan}
                />
                <DataRow
                  label="No. BPJS Ketenagakerjaan"
                  value={docAdmin.bpjsKetenagakerjaan}
                />
                {requiresSim && (
                  <DataRow label="Nomor SIM" value={docAdmin.simNumber} />
                )}
              </div>
              <Separator className="bg-slate-800/60 mb-6" />
              <div className="space-y-0.5">
                <FileStatus label="Foto KTP" url={iden.ktpPhotoUrl} />
                <FileStatus
                  label="Berkas NPWP"
                  url={docAdmin.npwpPhotoUrl}
                  notOwned={docAdmin.noNpwp}
                  pending={docAdmin.npwpFilePending}
                />
                <FileStatus
                  label="Berkas BPJS Kesehatan"
                  url={docAdmin.bpjsKesehatanPhotoUrl}
                  notOwned={docAdmin.noBpjsKesehatan}
                  pending={docAdmin.bpjsKesehatanFilePending}
                />
                <FileStatus
                  label="Berkas BPJS Ketenagakerjaan"
                  url={docAdmin.bpjsKetenagakerjaanPhotoUrl}
                  notOwned={docAdmin.noBpjsKetenagakerjaan}
                  pending={docAdmin.bpjsKetenagakerjaanFilePending}
                />
                {requiresSim && (
                  <FileStatus label="Foto SIM" url={docAdmin.simPhotoUrl} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section: Keuangan */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-rose-500/20">
            <CardContent className="p-8">
              <SectionTitle
                icon={<Banknote className="h-5 w-5" />}
                description="Payroll & Bank"
              >
                Finansial
              </SectionTitle>
              <div className="space-y-1 mb-6">
                <DataRow label="Nama Bank" value={rek.bankName} />
                <DataRow label="Nomor Rekening" value={rek.bankAccountNumber} />
                <DataRow label="Atas Nama" value={rek.bankAccountHolderName} />
              </div>
              <Separator className="bg-slate-800/60 mb-6" />
              <FileStatus label="Bukti Rekening" url={rek.bankDocumentUrl} />
            </CardContent>
          </Card>

          {/* Section: Data Keluarga */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-purple-500/20">
            <CardContent className="p-8 md:p-10">
              <SectionTitle
                icon={<Users className="h-5 w-5" />}
                description="Orang Tua & Tanggungan"
              >
                Keluarga & Tanggungan
              </SectionTitle>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-900/60 rounded-3xl p-4 border border-slate-800/60 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter mb-1">
                    Saudara
                  </p>
                  <p className="text-xl font-black text-slate-200">
                    {totalSiblings}
                  </p>
                </div>
                <div className="bg-slate-900/60 rounded-3xl p-4 border border-slate-800/60 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter mb-1">
                    Tanggungan
                  </p>
                  <p className="text-xl font-black text-slate-200">
                    {totalDependents}
                  </p>
                </div>
                <div className="bg-slate-900/60 rounded-3xl p-4 border border-slate-800/60 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter mb-1">
                    Status Ayah
                  </p>
                  <p className="text-sm font-bold text-slate-200 truncate px-1">
                    {family.orangTua?.ayah?.status || "-"}
                  </p>
                </div>
                <div className="bg-slate-900/60 rounded-3xl p-4 border border-slate-800/60 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter mb-1">
                    Status Ibu
                  </p>
                  <p className="text-sm font-bold text-slate-200 truncate px-1">
                    {family.orangTua?.ibu?.status || "-"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <User className="h-3 w-3" /> Data Ayah
                  </h4>
                  <div className="space-y-1 bg-slate-900/20 p-5 rounded-[2rem] border border-slate-800/40">
                    <DataRow
                      label="Nama"
                      value={family.orangTua?.ayah?.name}
                      className="py-2"
                    />
                    <DataRow
                      label="Pekerjaan"
                      value={family.orangTua?.ayah?.occupation}
                      className="py-2"
                    />
                    <DataRow
                      label="Pendidikan"
                      value={family.orangTua?.ayah?.education}
                      className="py-2 border-0"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <User className="h-3 w-3" /> Data Ibu
                  </h4>
                  <div className="space-y-1 bg-slate-900/20 p-5 rounded-[2rem] border border-slate-800/40">
                    <DataRow
                      label="Nama"
                      value={family.orangTua?.ibu?.name}
                      className="py-2"
                    />
                    <DataRow
                      label="Pekerjaan"
                      value={family.orangTua?.ibu?.occupation}
                      className="py-2"
                    />
                    <DataRow
                      label="Pendidikan"
                      value={family.orangTua?.ibu?.education}
                      className="py-2 border-0"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Kontak Darurat */}
          <Card className="border-slate-800 bg-slate-950/40 rounded-[2.5rem] overflow-hidden shadow-xl border-t-4 border-t-cyan-500/20">
            <CardContent className="p-8">
              <SectionTitle
                icon={<Phone className="h-5 w-5" />}
                description="Emergency Contacts"
              >
                Kontak Darurat
              </SectionTitle>
              <div className="space-y-4">
                {contacts.length > 0 ? (
                  contacts.map((contact, idx) => (
                    <div
                      key={contact.id}
                      className={`p-4 rounded-3xl border border-slate-800/40 ${contact.priority === "Utama" ? "bg-primary/5 border-primary/20 shadow-inner shadow-primary/5" : "bg-slate-900/30"}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                          {contact.priority}
                        </span>
                        {contact.priority === "Utama" && (
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-100 mb-1">
                        {contact.name}
                      </p>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Heart className="h-3 w-3" /> {contact.relation}
                          {contact.relationOther
                            ? ` (${contact.relationOther})`
                            : ""}
                        </span>
                        <span className="text-xs text-slate-300 font-black flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-primary" />{" "}
                          {contact.phone}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800/60">
                    <AlertCircle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-bold italic">
                      Belum ada kontak darurat
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
