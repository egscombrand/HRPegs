"use client";

import { useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import type { EmployeeProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, InfoIcon, ShieldAlert, CheckCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { calculateProfileCompleteness } from "@/lib/employee-completeness";

export default function KaryawanDashboardPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const hasAccess = useRoleGuard("karyawan");

  const { data: employeeProfile, isLoading: profileLoading } =
    useDoc<EmployeeProfile>(
      useMemoFirebase(
        () =>
          userProfile
            ? doc(firestore, "employee_profiles", userProfile.uid)
            : null,
        [userProfile, firestore],
      ),
    );

  const isLoading = authLoading || profileLoading;

  // Calculate real-time completeness client-side
  const completeness = useMemo(
    () => calculateProfileCompleteness(employeeProfile),
    [employeeProfile]
  );

  // Extract structural values using comprehensive fallbacks to prevent incorrect warnings
  const hrdInfo = useMemo(() => (employeeProfile as any)?.hrdEmploymentInfo || {}, [employeeProfile]);

  const brandVal = useMemo(
    () => (employeeProfile as any)?.brandName || (employeeProfile as any)?.brand || hrdInfo.brandName || hrdInfo.brand,
    [employeeProfile, hrdInfo]
  );
  
  const divisionVal = useMemo(
    () => (employeeProfile as any)?.divisionName || (employeeProfile as any)?.division || hrdInfo.divisionName || hrdInfo.division,
    [employeeProfile, hrdInfo]
  );

  const positionVal = useMemo(
    () =>
      (employeeProfile as any)?.position ||
      (employeeProfile as any)?.role ||
      (employeeProfile as any)?.jobTitle ||
      (employeeProfile as any)?.positionTitle ||
      hrdInfo.position ||
      hrdInfo.workRole ||
      hrdInfo.positionTitle,
    [employeeProfile, hrdInfo]
  );

  const structuralPosVal = useMemo(
    () =>
      (employeeProfile as any)?.structuralPosition ||
      (employeeProfile as any)?.structuralLevel ||
      (employeeProfile as any)?.levelStruktural ||
      hrdInfo.structuralPosition ||
      hrdInfo.levelStruktural,
    [employeeProfile, hrdInfo]
  );

  const managerVal = useMemo(
    () =>
      (employeeProfile as any)?.directManagerName ||
      (employeeProfile as any)?.managerName ||
      (employeeProfile as any)?.atasanLangsungName ||
      (employeeProfile as any)?.directSupervisorName ||
      hrdInfo.directSupervisorName ||
      hrdInfo.directManagerName,
    [employeeProfile, hrdInfo]
  );

  const empTypeVal = useMemo(
    () =>
      hrdInfo.employeeType ||
      hrdInfo.tipeKaryawan ||
      hrdInfo.jenisKontrak ||
      hrdInfo.contractType ||
      (employeeProfile as any)?.employmentType ||
      userProfile?.employmentType,
    [hrdInfo, employeeProfile, userProfile]
  );

  // 1. Kepegawaian (Struktur Kerja) Incomplete Check
  const isStructuralIncomplete = useMemo(() => {
    return !brandVal || !divisionVal || !positionVal || !structuralPosVal || !managerVal || !empTypeVal;
  }, [brandVal, divisionVal, positionVal, structuralPosVal, managerVal, empTypeVal]);

  // 2. Administrasi (Dokumen & Profile) Complete Check
  const isProfileComplete = useMemo(() => {
    return completeness.status === "complete" || completeness.percentage >= 100;
  }, [completeness]);

  if (!hasAccess || !userProfile || isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Karyawan">
      <div className="space-y-6">
        {/* Welcome Card */}
        <Card className="overflow-hidden border-none bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 text-white shadow-xl relative">
          <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />
          <CardHeader className="relative z-10 pb-4">
            <CardDescription className="text-indigo-100 font-semibold uppercase tracking-widest text-[10px]">Portal Karyawan</CardDescription>
            <CardTitle className="text-3xl font-black tracking-tight">Halo, {userProfile.fullName}!</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 pb-6 space-y-4">
            <p className="text-indigo-50/80 text-sm leading-relaxed max-w-xl">
              Selamat datang di dashboard portal karyawan PT Environesia Global Saraya. Di sini Anda dapat memantau status kepegawaian, mengajukan cuti, izin, serta memperbarui berkas administratif Anda.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge className="bg-white/10 hover:bg-white/20 text-white border-none py-1 px-3 text-xs font-semibold rounded-lg backdrop-blur-md">
                {positionVal || "Karyawan"}
              </Badge>
              <Badge className="bg-white/10 hover:bg-white/20 text-white border-none py-1 px-3 text-xs font-semibold rounded-lg backdrop-blur-md capitalize">
                Status: {empTypeVal || "Belum Diatur"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Structural (Kepegawaian) Warning Card */}
        {isStructuralIncomplete && (
          <Card className="border-rose-200 bg-rose-50/30 dark:border-rose-900/30 dark:bg-rose-950/10 shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="h-6 w-6" />
                <CardTitle className="text-lg font-bold">Data Kepegawaian Belum Lengkap</CardTitle>
              </div>
              <CardDescription className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1 pl-9">
                Informasi jabatan, divisi, atasan langsung, atau jenis kontrak kerja Anda belum selesai diatur oleh HRD.
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-12 pb-5 text-sm text-slate-600 dark:text-slate-400">
              <p className="leading-relaxed">
                Beberapa fitur administrasi penting seperti **Pengajuan Cuti Tahunan** atau **Pengajuan Lembur** mungkin belum tersedia hingga HRD menyelesaikan konfigurasi penempatan Anda. Silakan hubungi tim HRD untuk pembaruan data struktur kepegawaian Anda.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Administrative (Profil & Dokumen) Warning Card */}
        {!isStructuralIncomplete && !isProfileComplete && (
          <Card className="border-amber-200 bg-amber-50/20 dark:border-amber-900/20 dark:bg-amber-950/10 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-6 w-6" />
                <div>
                  <CardTitle className="text-lg font-bold">Data Administrasi Belum Lengkap</CardTitle>
                  <CardDescription className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                    Beberapa berkas administratif Anda belum lengkap ({completeness.percentage}% terisi).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pl-12 pb-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Mohon lengkapi seluruh dokumen administratif (seperti NPWP, BPJS Kesehatan, BPJS Ketenagakerjaan, data rekening, kontak darurat, atau riwayat pendidikan) untuk memudahkan pemrosesan payroll dan pelaporan administrasi resmi.
              </p>

              {/* Completeness checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                {completeness.sections.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm"
                  >
                    {s.isComplete ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <InfoIcon className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <span className={`text-xs font-semibold ${s.isComplete ? "text-slate-700 dark:text-slate-300" : "text-slate-400"}`}>
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3">
                <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl px-5 py-2.5 shadow-md shadow-amber-600/10">
                  <Link href="/admin/karyawan/profile">
                    Lengkapi Berkas Sekarang <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

