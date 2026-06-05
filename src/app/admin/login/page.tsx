'use client';

import { AdminLoginForm } from '@/components/auth/AdminLoginForm';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, Users, Clock, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

export default function AdminLoginPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userProfile && userProfile.role !== 'kandidat') {
      router.replace('/admin');
    }
  }, [userProfile, loading, router]);

  if (loading || (userProfile && userProfile.role !== 'kandidat')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#10141b] flex flex-col">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute -left-40 top-32 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden lg:flex flex-col h-screen relative">
        {/* HEADER SECTION - Logo (30% height) */}
        <div className="w-full flex items-center justify-center h-[30%] relative">
          {/* Glow Background - Behind Logo */}
          <div className="absolute inset-0 -z-10 left-1/2 -translate-x-1/2 transform">
            <div className="absolute rounded-full bg-gradient-to-b from-teal-500/40 via-teal-500/20 to-transparent blur-3xl" style={{ width: '800px', height: '350px', left: '-400px', top: '-20px' }} />
          </div>

          {/* Logo Image */}
          <Image
            src="/images/hrp-logo.svg"
            alt="HRP Environesia Logo"
            width={700}
            height={280}
            className="h-auto w-[600px] lg:w-[680px] xl:w-[750px] object-contain drop-shadow-2xl"
            priority
          />
        </div>

        {/* CONTENT SECTION - Two Panels (70% height) */}
        <div className="flex flex-1 justify-center px-6">
          {/* LEFT PANEL - Branding (50%) */}
          <div className="flex w-1/2 flex-col items-center justify-start border-r border-slate-200 dark:border-slate-800/50 bg-white dark:bg-transparent px-6 pt-4 pb-8 overflow-y-auto">
            <div className="w-full max-w-[500px] space-y-6">
              {/* Company Name & Title - Center Aligned */}
              <div className="space-y-3 text-center">
                <div>
                  <h1 className="text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white">
                    HRP
                  </h1>
                  <p className="mt-1 text-sm font-bold uppercase tracking-[0.5em] text-teal-600 dark:text-teal-400">
                    Environesia
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Human Resource Portal
                  </h2>
                  <p className="text-xs lg:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    Kelola kehadiran, izin, cuti, dinas, dan data karyawan dalam
                    satu portal internal yang terintegrasi.
                  </p>
                </div>
              </div>

              {/* Feature List - Center Aligned */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-800/50 pt-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-slate-500">
                  Fitur Utama
                </p>

                <div className="space-y-1.5">
                  {/* Feature 1 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <Users className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Data Karyawan</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Kelola profil dan informasi.
                    </p>
                  </div>

                  {/* Feature 2 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Izin & Cuti</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Pengajuan dan persetujuan.
                    </p>
                  </div>

                  {/* Feature 3 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <FileText className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Monitoring</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Laporan real-time akurat.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL - Login Form (50%) */}
          <div className="flex w-1/2 flex-col items-center justify-start pt-4 pb-8 px-6 overflow-y-auto">
            <div className="w-full max-w-[480px]">
              {/* Login Card */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/40 backdrop-blur-xl">
                {/* Card Header */}
                <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-8 py-5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                    Login Portal
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Masuk ke HRP
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Gunakan akun dari HRD atau Admin untuk mengakses portal.
                  </p>
                </div>

                {/* Card Body */}
                <div className="px-8 py-6">
                  <AdminLoginForm />
                </div>
              </div>

              {/* Footer - Centered below card */}
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-600">
                © Environesia Group — HRP Internal System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="flex lg:hidden flex-col h-screen overflow-y-auto">
        {/* HEADER SECTION - Logo */}
        <div className="w-full flex items-center justify-center py-6 relative flex-shrink-0">
          {/* Glow Behind Logo */}
          <div className="absolute inset-0 -z-10 left-1/2 -translate-x-1/2 transform">
            <div className="absolute rounded-full bg-gradient-to-b from-teal-500/35 to-transparent blur-2xl" style={{ width: '400px', height: '160px', left: '-200px', top: '0px' }} />
          </div>

          {/* Logo Image - Mobile Size */}
          <Image
            src="/images/hrp-logo.svg"
            alt="HRP Environesia Logo"
            width={320}
            height={128}
            className="h-auto w-72 sm:w-80 object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* CONTENT SECTION - Single Column */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-6">
          {/* Company Info Section */}
          <div className="mb-6 w-full max-w-md space-y-2 text-center">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
              HRP
            </h1>
            <p className="text-sm font-bold uppercase tracking-[0.45em] text-teal-600 dark:text-teal-400">
              Environesia
            </p>
            <h2 className="pt-2 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Human Resource Portal
            </h2>
          </div>

          {/* Login Card - Mobile */}
          <div className="w-full max-w-md flex-shrink-0">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-xl shadow-slate-200/40 dark:shadow-black/30 backdrop-blur-xl">
              {/* Card Header */}
              <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-6 py-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                  Login
                </p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Masuk ke HRP
                </h3>
              </div>

              {/* Card Body */}
              <div className="px-6 py-5">
                <AdminLoginForm />
              </div>
            </div>

            {/* Footer - Mobile */}
            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-600">
              © Environesia Group — HRP Internal System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
