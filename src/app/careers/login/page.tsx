'use client';

import { CandidateLoginForm } from '@/components/auth/CandidateLoginForm';
import { CandidateRegisterForm } from '@/components/auth/CandidateRegisterForm';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, Briefcase, FileText, CheckCircle2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useState } from 'react';
import Image from 'next/image';

function CandidateLoginContent() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    if (!loading && userProfile && userProfile.role === 'kandidat') {
      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.replace('/careers/portal');
      }
    }
  }, [userProfile, loading, router, redirect]);

  if (loading || (userProfile && userProfile.role === 'kandidat')) {
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
        {/* HEADER SECTION - Logo (25% height) */}
        <div className="w-full flex items-center justify-center h-[25%] relative">
          {/* Glow Background - Behind Logo */}
          <div className="absolute inset-0 -z-10 left-1/2 -translate-x-1/2 transform">
            <div className="absolute rounded-full bg-gradient-to-b from-teal-500/40 via-teal-500/20 to-transparent blur-3xl" style={{ width: '800px', height: '350px', left: '-400px', top: '-20px' }} />
          </div>

          {/* Logo Image */}
          <Image
            src="/images/hrp-logo.svg"
            alt="Environesia Logo"
            width={700}
            height={280}
            className="h-auto w-[600px] lg:w-[680px] xl:w-[750px] object-contain drop-shadow-2xl"
            priority
          />
        </div>

        {/* CONTENT SECTION - Two Panels (75% height) */}
        <div className="flex flex-1 justify-center px-6">
          {/* LEFT PANEL - Branding (50%) */}
          <div className="flex w-1/2 flex-col items-center justify-start border-r border-slate-200 dark:border-slate-800/50 bg-white dark:bg-transparent px-6 pt-4 pb-6 overflow-y-auto">
            <div className="w-full max-w-[500px] space-y-6">
              {/* Company Name & Title - Center Aligned */}
              <div className="space-y-3 text-center">
                <div>
                  <h1 className="text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white">
                    Environesia
                  </h1>
                  <p className="mt-1 text-sm font-bold uppercase tracking-[0.5em] text-teal-600 dark:text-teal-400">
                    Career Portal
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Portal Rekrutmen
                  </h2>
                  <p className="text-xs lg:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    Jelajahi peluang karir, kelola lamaran, dan pantau proses seleksi Anda dengan mudah.
                  </p>
                </div>
              </div>

              {/* Feature List - Center Aligned */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-800/50 pt-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-600 dark:text-slate-500">
                  Fitur Portal
                </p>

                <div className="space-y-1.5">
                  {/* Feature 1 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <Briefcase className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Lowongan Tersedia</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Cari pekerjaan yang sesuai.
                    </p>
                  </div>

                  {/* Feature 2 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <FileText className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Lamaran Saya</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Kelola lamaran kerja.
                    </p>
                  </div>

                  {/* Feature 3 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Status Seleksi</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Pantau progres Anda.
                    </p>
                  </div>

                  {/* Feature 4 */}
                  <div className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/5 px-2.5 py-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-300 dark:border-teal-500/25 bg-teal-100 dark:bg-teal-500/10">
                      <User className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Profil Kandidat</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">
                      Kelola data profil Anda.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL - Form (50%) */}
          <div className="flex w-1/2 flex-col items-center justify-start pt-4 pb-6 px-6 overflow-y-auto">
            <div className="w-full max-w-[480px] relative">
              {/* Form Container with Animation */}
              <div className="relative">
                {/* LOGIN FORM */}
                <div
                  className={`absolute inset-0 transition-all duration-300 ease-out ${
                    authMode === 'login'
                      ? 'opacity-100 pointer-events-auto translate-x-0'
                      : 'opacity-0 pointer-events-none translate-x-8'
                  }`}
                  style={{ perspective: '1000px' }}
                >
                  {authMode === 'login' && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/40 backdrop-blur-xl">
                      {/* Card Header */}
                      <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-8 py-5">
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                          Login Kandidat
                        </p>
                        <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                          Masuk ke Portal
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          Masuk dengan akun Anda untuk melanjutkan proses lamaran.
                        </p>
                      </div>

                      {/* Card Body */}
                      <div className="px-8 py-6">
                        <CandidateLoginForm onSwitchToRegister={() => setAuthMode('register')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* REGISTER FORM */}
                <div
                  className={`transition-all duration-300 ease-out ${
                    authMode === 'register'
                      ? 'opacity-100 pointer-events-auto translate-x-0'
                      : 'opacity-0 pointer-events-none -translate-x-8'
                  }`}
                  style={{ perspective: '1000px' }}
                >
                  {authMode === 'register' && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/40 backdrop-blur-xl">
                      {/* Card Header */}
                      <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-8 py-5">
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                          Daftar Kandidat
                        </p>
                        <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                          Buat Akun Baru
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          Daftar untuk memulai proses lamaran Anda.
                        </p>
                      </div>

                      {/* Card Body */}
                      <div className="px-8 py-6 max-h-[calc(100vh-400px)] overflow-y-auto">
                        <CandidateRegisterForm onSwitchToLogin={() => setAuthMode('login')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Spacer for Register Form (taller) */}
                {authMode === 'register' && (
                  <div className="invisible">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/40 backdrop-blur-xl">
                      <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-8 py-5">
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                          Daftar Kandidat
                        </p>
                        <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                          Buat Akun Baru
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          Daftar untuk memulai proses lamaran Anda.
                        </p>
                      </div>
                      <div className="px-8 py-6">
                        <CandidateRegisterForm onSwitchToLogin={() => setAuthMode('login')} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="flex lg:hidden flex-col h-screen overflow-y-auto">
        {/* HEADER SECTION - Logo */}
        <div className="w-full flex items-center justify-center py-4 relative flex-shrink-0">
          {/* Glow Behind Logo */}
          <div className="absolute inset-0 -z-10 left-1/2 -translate-x-1/2 transform">
            <div className="absolute rounded-full bg-gradient-to-b from-teal-500/35 to-transparent blur-2xl" style={{ width: '400px', height: '160px', left: '-200px', top: '0px' }} />
          </div>

          {/* Logo Image - Mobile Size */}
          <Image
            src="/images/hrp-logo.svg"
            alt="Environesia Logo"
            width={320}
            height={128}
            className="h-auto w-72 sm:w-80 object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* CONTENT SECTION - Single Column */}
        <div className="flex-1 flex flex-col items-center justify-start px-6 py-4 pb-8">
          {/* Company Info Section */}
          <div className="mb-6 w-full max-w-md space-y-2 text-center">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
              Environesia
            </h1>
            <p className="text-sm font-bold uppercase tracking-[0.45em] text-teal-600 dark:text-teal-400">
              Career Portal
            </p>
            <h2 className="pt-2 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Portal Rekrutmen
            </h2>
          </div>

          {/* Form Card - Mobile with Animation */}
          <div className="w-full max-w-md flex-shrink-0 relative">
            {/* LOGIN FORM MOBILE */}
            <div
              className={`transition-all duration-300 ease-out ${
                authMode === 'login'
                  ? 'opacity-100 pointer-events-auto translate-x-0'
                  : 'opacity-0 pointer-events-none translate-x-8'
              }`}
            >
              {authMode === 'login' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-xl shadow-slate-200/40 dark:shadow-black/30 backdrop-blur-xl">
                  {/* Card Header */}
                  <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-6 py-5">
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                      Login
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Masuk ke Portal
                    </h3>
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-5">
                    <CandidateLoginForm onSwitchToRegister={() => setAuthMode('register')} />
                  </div>
                </div>
              )}
            </div>

            {/* REGISTER FORM MOBILE */}
            <div
              className={`absolute inset-0 transition-all duration-300 ease-out ${
                authMode === 'register'
                  ? 'opacity-100 pointer-events-auto translate-x-0'
                  : 'opacity-0 pointer-events-none -translate-x-8'
              }`}
            >
              {authMode === 'register' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-xl shadow-slate-200/40 dark:shadow-black/30 backdrop-blur-xl">
                  {/* Card Header */}
                  <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-6 py-5">
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                      Daftar
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Buat Akun Baru
                    </h3>
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-5 max-h-[calc(100vh-300px)] overflow-y-auto">
                    <CandidateRegisterForm onSwitchToLogin={() => setAuthMode('login')} />
                  </div>
                </div>
              )}
            </div>

            {/* Spacer for Register Form */}
            {authMode === 'register' && (
              <div className="invisible">
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 shadow-lg dark:shadow-xl shadow-slate-200/40 dark:shadow-black/30 backdrop-blur-xl">
                  <div className="border-b border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-transparent px-6 py-5">
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-teal-600 dark:text-teal-400">
                      Daftar
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Buat Akun Baru
                    </h3>
                  </div>
                  <div className="px-6 py-5">
                    <CandidateRegisterForm onSwitchToLogin={() => setAuthMode('login')} />
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default function CandidateLoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#10141b]"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>}>
      <CandidateLoginContent />
    </Suspense>
  )
}
