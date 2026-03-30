'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { isActiveEmployeeEligibleForLeave } from '@/lib/auth-eligibility';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CalendarOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LeaveSubmissionClient } from '@/components/dashboard/karyawan/LeaveSubmissionClient';

export default function PengajuanCutiPage() {
  const { userProfile, loading } = useAuth();


  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.employmentType === 'magang') return MENU_CONFIG['karyawan-magang'];
    if (userProfile.employmentType === 'training') return MENU_CONFIG['karyawan-training'];
    return MENU_CONFIG['karyawan'];
  }, [userProfile]);

  const eligibility = useMemo(() => isActiveEmployeeEligibleForLeave(userProfile), [userProfile]);

  if (loading) {
    return (
      <DashboardLayout pageTitle="Pengajuan Cuti" menuConfig={menuConfig}>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Memuat data...</div>
      </DashboardLayout>
    );
  }

  // --- ACCESS GUARD ---
  if (!eligibility.isEligible) {
    return (
      <DashboardLayout pageTitle="Akses Dibatasi" menuConfig={menuConfig}>
        <div className="max-w-2xl mx-auto mt-8">
            <Card className="border-rose-100 dark:border-rose-900/30 overflow-hidden shadow-xl">
                <CardHeader className="bg-rose-50 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-900/30 py-8 text-center">
                    <div className="mx-auto bg-rose-100 dark:bg-rose-900/40 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <Lock className="h-8 w-8 text-rose-600 dark:text-rose-400" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-rose-900 dark:text-rose-100">Akses Dibatasi</CardTitle>
                    <CardDescription className="text-rose-600/70 dark:text-rose-400/70">Anda belum memenuhi kriteria untuk mengajukan cuti.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    <Alert variant="destructive" className="border-rose-200 bg-white dark:bg-slate-900">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-bold">Alasan Penolakan:</AlertTitle>
                        <AlertDescription className="mt-2 text-sm leading-relaxed">
                            {eligibility.reason}
                        </AlertDescription>
                    </Alert>

                    <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4">
                        <h4 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Persyaratan Umum Cuti:</h4>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
                            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Karyawan Tetap / Aktif</li>
                            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Bukan Masa Probation</li>
                            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Masa Kerja &ge; 1 Tahun</li>
                            <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Dokumen Lengkap</li>
                        </ul>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button asChild className="flex-1" variant="outline">
                            <Link href="/admin/karyawan/dashboard">Kembali ke Dashboard</Link>
                        </Button>
                        <Button asChild className="flex-1 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900">
                            <Link href="/admin/karyawan/pengajuan-izin">Gunakan Izin Biasa</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Pengajuan Cuti" menuConfig={menuConfig}>
       <LeaveSubmissionClient />
    </DashboardLayout>
  );
}

