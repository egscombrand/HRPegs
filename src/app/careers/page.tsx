'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, FileText, Search, User, UserCheck, ShieldCheck, BarChart, Globe, Menu, Users, Loader2, TrendingUp, Globe2, CheckSquare, MapPin } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { JobExplorerSkeleton } from '@/components/careers/JobExplorer';
import dynamic from 'next/dynamic';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { EcosystemCompany } from '@/lib/types';
import { getCompanyLogoSrc, getLocalCompanyLogo } from '@/lib/ecosystem-logo';


const DynamicJobExplorerClient = dynamic(
  () => import('@/components/careers/JobExplorer').then((mod) => mod.JobExplorerClient),
  {
    ssr: false,
    loading: () => <JobExplorerSkeleton />,
  }
);


const t = {
  Header: {
    jobs: "Lowongan",
    process: "Proses",
    faq: "FAQ",
    ecosystem: "Ekosistem",
    companyProfile: "Profil Perusahaan",
    signIn: "Masuk Kandidat",
    signUp: "Daftar"
  },
  Hero: {
    title: "Mari Buat Perubahan Bersama Kami",
    subtitle: "Jadilah bagian dari tim inovatif yang berdedikasi untuk menciptakan solusi lingkungan berkelanjutan. Temukan karier berdampak Anda di Environesia.",
    ctaPrimary: "Lihat Lowongan",
    ctaSecondary: "Kirim Lamaran Cepat",
    badgeProjects: "560+ Proyek",
    badgeProvinces: "38 Provinsi",
    badgeServices: "Lab & Konsultan"
  },
  JobExplorer: {
    title: "Temukan Peluang Anda",
    subtitle: "Kami mencari individu berbakat untuk bergabung dengan berbagai tim kami. Jelajahi posisi yang sesuai dengan keahlian Anda.",
    searchPlaceholder: "Cari posisi atau divisi...",
    filters: {
      fulltime: "Full-time",
      internship: "Internship",
      contract: "Contract"
    },
    emptyState: {
      title: "Belum Ada Lowongan yang Sesuai",
      subtitle: "Coba sesuaikan kata kunci atau filter Anda."
    }
  },
  ValueProps: {
    title: "Mengapa Environesia?",
    subtitle: "Kami lebih dari sekadar tempat kerja. Kami adalah komunitas yang berkomitmen untuk masa depan bumi.",
    values: [
      {
        title: "Karier Berdampak",
        description: "Bekerja pada proyek-proyek lingkungan nyata di seluruh Indonesia."
      },
      {
        title: "Pertumbuhan Profesional",
        description: "Kami berinvestasi pada pengembangan diri Anda melalui pelatihan dan sertifikasi."
      },
      {
        title: "Kolaborasi Inovatif",
        description: "Bergabunglah dengan tim ahli yang solid dan saling mendukung."
      },
      {
        title: "Keseimbangan Hidup",
        description: "Kami menghargai waktu pribadi Anda untuk menciptakan lingkungan kerja yang sehat."
      }
    ]
  },
  RecruitmentProcess: {
    title: "Proses Rekrutmen Kami",
    subtitle: "Kami merancang proses yang adil dan transparan untuk menemukan talenta terbaik.",
    steps: [
      {
        title: "Daftar Online",
        description: "Lengkapi profil dan kirimkan lamaran Anda melalui portal karir kami."
      },
      {
        title: "Psikotes",
        description: "Kerjakan tes psikologi untuk mengukur potensi dan kesesuaian Anda."
      },
      {
        title: "Seleksi Administrasi",
        description: "Tim rekrutmen akan meninjau kelengkapan profil dan hasil psikotes Anda."
      },
      {
        title: "Wawancara",
        description: "Bertemu dengan HR dan calon user untuk diskusi lebih mendalam."
      },
      {
        title: "Tawaran Kerja",
        description: "Kandidat terpilih akan menerima tawaran kerja resmi dari kami."
      }
    ]
  },
  OfficeSpotlight: {
    title: "Kantor Pusat Environesia",
    subtitle: "Berpusat di Yogyakarta, kantor Environesia menjadi ruang kolaborasi, koordinasi, dan pengembangan inovasi untuk menghadirkan solusi lingkungan yang berdampak."
  },
  HowToApply: {
    title: "Cara Mudah Melamar",
    subtitle: "Ikuti langkah-langkah sederhana ini untuk memulai perjalanan karir Anda di Environesia.",
    cta: "Daftar Akun Sekarang",
    steps: [
      {
        title: "Buat Akun",
        description: "Daftarkan diri Anda dengan email dan buat kata sandi."
      },
      {
        title: "Cari Lowongan",
        description: "Jelajahi berbagai posisi yang tersedia dan temukan yang cocok."
      },
      {
        title: "Kirim Lamaran",
        description: "Unggah CV terbaru Anda dan kirimkan lamaran dengan mudah."
      },
      {
        title: "Pantau Proses",
        description: "Lacak status lamaran Anda langsung dari dasbor kandidat."
      }
    ]
  },
  FAQ: {
    title: "Pertanyaan Umum (FAQ)",
    subtitle: "Jawaban atas pertanyaan umum seputar proses lamaran kerja di Environesia.",
    contactCta: "Hubungi HR",
    questions: [
      {
        q: "Apa saja yang harus saya siapkan sebelum melamar?",
        a: "Pastikan Anda telah menyiapkan CV (Curriculum Vitae) terbaru dalam format PDF, surat lamaran (opsional), dan portofolio jika posisi yang dilamar memerlukannya."
      },
      {
        q: "Berapa lama proses rekrutmen biasanya berlangsung?",
        a: "Proses rekrutmen kami biasanya memakan waktu 2-4 minggu dari penutupan lowongan, namun bisa bervariasi. Kami akan memberikan informasi terbaru melalui email."
      },
      {
        q: "Apakah saya bisa melamar lebih dari satu posisi?",
        a: "Ya, Anda dapat melamar hingga 3 posisi yang berbeda secara bersamaan. Namun, kami sarankan fokus pada posisi yang paling sesuai kualifikasi Anda."
      },
      {
        q: "Siapa yang bisa saya hubungi jika ada pertanyaan?",
        a: "Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi tim rekrutmen kami melalui email di careers@environesia.co.id."
      }
    ]
  },
  Footer: {
    tagline: "Membangun karier, menjaga bumi.",
    navigation: "Navigasi",
    company: "Perusahaan",
    internalAccess: "Akses Internal",
    copyright: "© {year} Environesia. All Rights Reserved."
  },
  Ecosystem: {
    title: "Perusahaan dalam Ekosistem Kami",
    subtitle: "Bagian dari grup bisnis yang berkolaborasi untuk menciptakan solusi berkelanjutan bagi masa depan bumi."
  }
};


// --- Header Component ---
const Header = () => {
    const [scrolled, setScrolled] = React.useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

    React.useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const menuItems = [
        { href: '#lowongan', label: t.Header.jobs },
        { href: '#proses', label: t.Header.process },
        { href: '#ekosistem', label: t.Header.ecosystem },
        { href: '#faq', label: t.Header.faq },
        { href: 'https://environesia.co.id/', label: t.Header.companyProfile, external: true },
    ];

    return (
        <header className={cn("sticky top-0 z-50 w-full transition-all duration-300", scrolled ? "bg-background/80 backdrop-blur-lg border-b" : "bg-transparent")}>
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-20 items-center justify-between">
               <Link href="/careers" className="flex items-center">
  <Image
    src="/images/Environesia Vacancies.png"
    alt="Environesia Vacancies"
    width={160}
    height={36}
    className="h-8 w-auto object-contain"
    priority
  />
</Link>     <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
                        {menuItems.map((item) => (
                           <a key={item.label} href={item.href} target={item.external ? '_blank' : '_self'} rel={item.external ? 'noopener noreferrer' : ''} className="text-muted-foreground transition-colors hover:text-primary">
                                {item.label}
                           </a>
                        ))}
                    </nav>
                    <div className="hidden items-center gap-2 md:flex">
                        <ThemeToggle />
                        <Button variant="secondary" asChild>
                            <Link href="/careers/login">{t.Header.signIn}</Link>
                        </Button>
                        <Button asChild>
                            <Link href="/careers/register">{t.Header.signUp}</Link>
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 md:hidden">
                        <ThemeToggle />
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Menu />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[80vw] p-0">
                                <div className="flex flex-col h-full">
                                    <div className="p-4 border-b">
                                        <Link href="/careers" className="flex items-center" onClick={() => setMobileMenuOpen(false)}>
                                            <Image
                                                src="/images/Environesia Vacancies.png"
                                                alt="Environesia Vacancies"
                                                width={120}
                                                height={28}
                                                className="h-7 w-auto object-contain"
                                                priority
                                            />
                                        </Link>
                                    </div>
                                    <nav className="flex flex-col gap-4 p-4">
                                        {menuItems.map((item) => (
                                           <a key={item.label} href={item.href} target={item.external ? '_blank' : '_self'} rel={item.external ? 'noopener noreferrer' : ''} className="text-lg font-medium text-foreground transition-colors hover:text-primary" onClick={() => setMobileMenuOpen(false)}>
                                                {item.label}
                                           </a>
                                        ))}
                                    </nav>
                                    <div className="mt-auto p-4 space-y-2 border-t">
                                        <Button variant="secondary" asChild className="w-full">
                                            <Link href="/careers/login">{t.Header.signIn}</Link>
                                        </Button>
                                        <Button asChild className="w-full">
                                            <Link href="/careers/register">{t.Header.signUp}</Link>
                                        </Button>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </div>
        </header>
    );
};


const statsData = [
    { label: 'Fast Growth', value: 'Since 2016', icon: TrendingUp },
    { label: 'International Projects', value: '10+ Countries', icon: Globe2 },
    { label: 'Project Delivered', value: '1000+', icon: CheckSquare },
    { label: 'Customer Served About', value: '500+', icon: Users },
    { label: 'Project Distribution', value: '38 Provinces', icon: MapPin },
];

const HeroStatsFloating = () => (
    <div className="absolute bottom-0 left-1/2 z-20 w-full max-w-6xl -translate-x-1/2 translate-y-1/2 px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-xl dark:border-slate-700/80">
            <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-700/80 lg:grid-cols-5">
                {statsData.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={stat.label}
                            className={cn(
                                "flex items-center gap-3 bg-white px-5 py-5 dark:bg-slate-900",
                                index === 4 && "col-span-2 lg:col-span-1"
                            )}
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
                                <Icon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                                <p className="text-xl font-bold leading-tight text-slate-900 dark:text-white">{stat.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
);

// --- Hero Section ---
const HeroSection = ({ backgroundImageUrl }: { backgroundImageUrl?: string }) => {
    return (
        <section id="hero" className="relative" style={{ minHeight: 'calc(100vh - 76px)' }}>
            {/* Background image */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: "url('/images/LP-1.jpg')",
                    backgroundSize: 'cover',
                    backgroundPosition: 'center 18%',
                    backgroundRepeat: 'no-repeat',
                }}
            />

            {/* Cinematic overlays — consistent across light & dark mode */}
            <div className="absolute inset-0 bg-slate-950/45" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/20 to-slate-950/60" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/35 via-transparent to-slate-950/25" />

            {/* Content */}
            <div
                className="relative z-10 mx-auto flex max-w-7xl flex-col items-center justify-center px-6 pb-40 pt-28 text-center sm:px-8"
                style={{ minHeight: 'calc(100vh - 76px)' }}
            >
                <h1 className="max-w-6xl text-5xl font-bold leading-[0.95] tracking-tight text-white drop-shadow-lg md:text-7xl lg:text-8xl">
                    {t.Hero.title}
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-100 drop-shadow-md">
                    {t.Hero.subtitle}
                </p>

                <div className="mt-10 flex w-full max-w-xs flex-col items-center justify-center gap-4 sm:max-w-none sm:flex-row">
                    <Button
                        size="lg"
                        className="h-12 w-full border-0 bg-teal-500 px-8 text-base text-white hover:bg-teal-600 sm:w-auto"
                        asChild
                    >
                        <a href="#lowongan">{t.Hero.ctaPrimary}</a>
                    </Button>
                    <Button
                        size="lg"
                        className="h-12 w-full border-0 bg-white/90 px-8 text-base text-slate-950 hover:bg-white sm:w-auto"
                        asChild
                    >
                        <Link href="/careers/login">{t.Hero.ctaSecondary}</Link>
                    </Button>
                </div>
            </div>

            {/* Floating stats bar — overlaps hero bottom and next section top */}
            <HeroStatsFloating />
        </section>
    );
}

// --- Job Explorer Section ---
const JobExplorerSection = () => {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => {
        setIsClient(true);
    }, []);
    
    return (
        <section id="lowongan" className="w-full scroll-mt-20 pt-36 pb-16 lg:pt-24 lg:pb-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.JobExplorer.title}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t.JobExplorer.subtitle}</p>
                </div>
                {isClient ? <DynamicJobExplorerClient /> : <JobExplorerSkeleton />}
            </div>
        </section>
    );
}

// --- Value Props Section ---
const ValuePropsSection = () => {
    const values = t.ValueProps.values;
    const icons = [Globe, BarChart, Users, ShieldCheck];
    return (
        <section className="w-full py-16 lg:py-24 bg-card">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.ValueProps.title}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t.ValueProps.subtitle}</p>
                </div>
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {values.map((v, i) => (
                        <div key={v.title} className="text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                                {React.createElement(icons[i], { className: "h-8 w-8" })}
                            </div>
                            <h3 className="font-semibold text-lg">{v.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{v.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// --- Ecosystem Section ---
const EcosystemSection = () => {
    const firestore = useFirestore();
    const ecosystemQuery = useMemoFirebase(
      () => query(
        collection(firestore, 'ecosystem_companies'),
        where('isActive', '==', true)
      ),
      [firestore]
    );
    const { data: companiesFromHook, isLoading } = useCollection<EcosystemCompany>(ecosystemQuery);

    const companies = React.useMemo(() => {
        if (!companiesFromHook) return [];
        return [...companiesFromHook].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }, [companiesFromHook]);

    return (
        <section id="ekosistem" className="w-full relative py-24 lg:py-40 overflow-hidden bg-background scroll-mt-20">
            <div className="absolute inset-0 -z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-gradient-to-b from-primary/[0.05] to-transparent" />
                <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] opacity-40 animate-pulse" />
                <div className="absolute bottom-1/4 -right-20 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[150px] opacity-30" />
            </div>
            
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col items-center text-center mb-16 lg:mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold tracking-widest uppercase mb-6">
                        <Globe className="h-3 w-3" /> Our Corporate Universe
                    </div>
                    <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
                        {t.Ecosystem.title}
                    </h2>
                    <p className="mt-4 max-w-2xl text-lg text-muted-foreground/70 font-medium">
                        {t.Ecosystem.subtitle}
                    </p>
                </div>
                
                {isLoading && (
                    <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <Card key={i} className="rounded-[3.5rem] h-[300px]"><CardContent className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></CardContent></Card>
                        ))}
                    </div>
                )}
                
                {companies && companies.length > 0 && (
                    <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
                        {companies.map((company) => (
                            <a 
                                key={company.id} 
                                href={company.websiteUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="group relative flex flex-col bg-card rounded-[3.5rem] p-1.5 border border-border/40 hover:border-primary/40 transition-all duration-1000 hover:shadow-[0_80px_120px_-30px_rgba(0,0,0,0.2)] md:hover:-translate-y-8"
                            >
                                <div className="relative flex flex-col h-full bg-background rounded-[3.2rem] overflow-hidden">
                                    <div className="flex h-40 w-full items-center justify-center px-4">
                                        <img
                                            src={getCompanyLogoSrc(company)}
                                            alt={`${company.name || (company as any).companyName} logo`}
                                            className="block h-auto max-h-32 min-h-[90px] w-auto min-w-[240px] max-w-[380px] object-contain opacity-100"
                                            onError={(e) => {
                                                e.currentTarget.src = getLocalCompanyLogo(company.name || (company as any).companyName);
                                            }}
                                        />
                                    </div>
                                    <div className="flex-1 p-8 pt-0 flex flex-col justify-center items-center text-center">
                                        <h3 className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors duration-300">
                                            {company.name}
                                        </h3>
                                        
                                        <div className="mt-6 flex items-center gap-2 text-primary font-bold text-xs tracking-wide group-hover:gap-4 transition-all duration-300">
                                            Lihat Selengkapnya <ArrowRight className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

// --- Recruitment Process Section ---
const RecruitmentProcessSection = () => {
    const steps = t.RecruitmentProcess.steps;

    return (
        <section id="proses" className="w-full scroll-mt-14 py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.RecruitmentProcess.title}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t.RecruitmentProcess.subtitle}</p>
                </div>
                <div className="relative mt-16 max-w-2xl mx-auto">
                    <div className="absolute left-6 top-0 h-full w-0.5 bg-border/40 md:left-1/2 md:-translate-x-1/2" />
                    <div className="space-y-12">
                        {steps.map((step, index) => (
                            <div key={index} className="relative flex items-start gap-6 md:gap-8">
                               <div className="z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-lg md:absolute md:left-1/2 md:-translate-x-1/2">
                                    {index + 1}
                                </div>
                                <div className={cn("flex-1", index % 2 === 0 ? "md:pl-[calc(50%+2.5rem)]" : "md:text-right md:pr-[calc(50%+2.5rem)]")}>
                                     <h3 className="text-xl font-semibold">{step.title}</h3>
                                     <p className="mt-1 text-muted-foreground">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};


// --- Office Spotlight Section ---
const OfficeSpotlightSection = () => {
    return (
    <section className="w-full py-16 lg:py-24 bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl shadow-lg min-h-[460px] flex items-end">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: "url('/images/Banner%20Kantor.jpg')",
                        backgroundSize: 'cover',
                        backgroundPosition: 'center center',
                        backgroundRepeat: 'no-repeat',
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-l from-slate-950/75 via-slate-950/35 to-slate-950/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                <div className="relative z-10 flex min-h-[460px] w-full items-center justify-end px-10 md:px-14">
                    <div className="max-w-[520px] text-left">
                        <h2 className="text-4xl font-bold leading-tight text-white md:text-5xl">
                            {t.OfficeSpotlight.title}
                        </h2>
                        <p className="mt-4 text-base leading-relaxed text-slate-100 md:text-lg">
                            {t.OfficeSpotlight.subtitle}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </section>
)};


// --- How To Apply Section ---
const HowToApplySection = () => {
    const steps = t.HowToApply.steps;
    const icons = [User, Search, FileText, UserCheck];
    return (
        <section className="w-full py-16 lg:py-24">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.HowToApply.title}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{t.HowToApply.subtitle}</p>
                </div>
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {steps.map((step, i) => (
                        <div key={step.title} className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-md border">
                                {React.createElement(icons[i], { className: "h-8 w-8 text-primary" })}
                            </div>
                            <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                            <p className="text-sm text-muted-foreground">{step.description}</p>
                        </div>
                    ))}
                </div>
                 <div className="mt-16 text-center">
                    <Button size="lg" asChild>
                        <Link href="/careers/register">{t.HowToApply.cta} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                </div>
            </div>
        </section>
    );
};

// --- FAQ Section ---
const FaqSection = () => {
    const questions = t.FAQ.questions;
    return (
    <section id="faq" className="w-full scroll-mt-14 py-16 lg:py-24 bg-card">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-xl text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.FAQ.title}</h2>
                <p className="mt-4 text-lg text-muted-foreground">{t.FAQ.subtitle}</p>
            </div>
            <Accordion type="single" collapsible className="mt-12 w-full space-y-4">
                {questions.map((item, i) => (
                    <AccordionItem key={i} value={`item-${i}`} className="rounded-xl border bg-background px-6 shadow-sm">
                        <AccordionTrigger className="py-5 text-lg text-left">{item.q}</AccordionTrigger>
                        <AccordionContent className="pt-2 text-base text-muted-foreground">{item.a}</AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    </section>
)};


// --- Footer Component ---
const Footer = () => {
    return (
    <footer className="border-t">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
       <div>
  <div className="flex flex-col items-start overflow-visible">
    <Image
      src="/images/Environesia Vacancies.png"
      alt="Environesia Vacancies"
      width={160}
      height={36}
      className="h-9 w-auto object-contain"
      priority
    />
  </div>

  <p className="mt-2 text-sm text-muted-foreground">
    {t.Footer.tagline}
  </p>
</div>
                <div className="grid grid-cols-2 gap-8 md:col-span-2">
                    <div>
                        <h4 className="font-semibold">{t.Footer.navigation}</h4>
                        <ul className="mt-4 space-y-2 text-sm">
                            <li><a href="#lowongan" className="text-muted-foreground hover:text-primary">{t.Header.jobs}</a></li>
                            <li><a href="#proses" className="text-muted-foreground hover:text-primary">{t.Header.process}</a></li>
                            <li><a href="#faq" className="text-muted-foreground hover:text-primary">{t.Header.faq}</a></li>
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold">{t.Footer.company}</h4>
                        <ul className="mt-4 space-y-2 text-sm">
                             <li><a href="#ekosistem" className="text-muted-foreground hover:text-primary">{t.Header.ecosystem}</a></li>
                             <li><a href="/admin/login" className="text-muted-foreground hover:text-primary">{t.Footer.internalAccess}</a></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="py-6 border-t">
                <p className="text-sm text-center text-muted-foreground">
                    {t.Footer.copyright.replace('{year}', new Date().getFullYear().toString())}
                </p>
            </div>
        </div>
    </footer>
)};

// --- Main Page Component ---
export default function CareersPage() {
  const firestore = useFirestore();
  const heroQuery = useMemoFirebase(
    () => query(collection(firestore, 'landing_sections'), where('sectionKey', '==', 'hero')),
    [firestore]
  );
  const { data: heroSections } = useCollection(heroQuery);
  const heroData = heroSections?.[0];

  return (
    <div className="flex min-h-dvh flex-col bg-background font-body text-foreground">
      <Header />
      <main className="flex-1">
        <HeroSection backgroundImageUrl={heroData?.backgroundImageUrl} />
        <JobExplorerSection />
        <ValuePropsSection />
        <EcosystemSection />
        <RecruitmentProcessSection />
        <OfficeSpotlightSection />
        <HowToApplySection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
