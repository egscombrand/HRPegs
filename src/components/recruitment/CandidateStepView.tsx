"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  User,
  GraduationCap,
  Briefcase,
  Building,
  FileText,
  Info,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Eye,
  CheckCircle2,
  Clock,
  Target,
  Trophy,
  Globe,
  ShieldCheck,
  Sparkles,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CandidateFitAnalysis } from "./CandidateFitAnalysis";
import type {
  Profile,
  Education,
  WorkExperience,
  OrganizationalExperience,
  Certification,
  JobApplication,
  Job,
} from "@/lib/types";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn, parseDateValue } from "@/lib/utils";
import { JOB_TYPE_LABELS } from "@/lib/types";

interface CandidateStepViewProps {
  profile: Profile;
  application: JobApplication;
  job: Job;
  activeStep: number;
  onStepChange: (step: number) => void;
}

export const CANDIDATE_STEPS = [
  { id: 1, label: "Data Pribadi", icon: User },
  { id: 2, label: "Pendidikan", icon: GraduationCap },
  { id: 3, label: "Pengalaman Kerja", icon: Briefcase },
  { id: 4, label: "Pengalaman Organisasi", icon: Building },
  { id: 5, label: "Dokumen & Sertifikasi", icon: FileText },
  { id: 6, label: "Deskripsi Diri", icon: Info },
];

const InfoBlock = ({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: any;
  className?: string;
}) => (
  <div className={cn("space-y-1", className)}>
    <div className="flex items-center gap-2 text-muted-foreground/60">
      {Icon && <Icon className="h-3 w-3" />}
      <span className="text-[9px] font-bold uppercase tracking-[0.15em]">
        {label}
      </span>
    </div>
    <div className="text-base sm:text-lg font-bold text-foreground leading-snug break-words">
      {value || (
        <span className="text-muted-foreground/30 font-normal italic text-sm">
          Belum diisi kandidat
        </span>
      )}
    </div>
  </div>
);

const SectionHeader = ({ title, icon: Icon }: { title: string; icon: any }) => (
  <div className="flex items-center gap-3.5 mb-6 border-b pb-5">
    <div className="p-2.5 rounded-xl bg-primary/5 text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h3 className="text-xl sm:text-2xl font-black tracking-tight">{title}</h3>
      <p className="text-muted-foreground text-xs font-medium">
        Informasi mendalam mengenai data terkait.
      </p>
    </div>
  </div>
);

export function CandidateStepContent({
  profile,
  application,
  activeStep,
  job,
}: {
  profile: Profile;
  application: JobApplication;
  activeStep: number;
  job: Job;
}) {
  const birthDateValue = React.useMemo(() => {
    const date = parseDateValue(profile.birthDate);
    return date ? format(date, "dd MMMM yyyy", { locale: idLocale }) : null;
  }, [profile.birthDate]);

  switch (activeStep) {
    case 1:
      return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-10">
          <SectionHeader title="Data Pribadi" icon={User} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
            <InfoBlock label="Nama Lengkap" value={profile.fullName} />
            <InfoBlock label="Nama Panggilan" value={profile.nickname} />
            <InfoBlock
              label="Email"
              value={application.candidateEmail}
              icon={Mail}
            />
            <InfoBlock label="Telepon" value={profile.phone} icon={Phone} />
            <InfoBlock label="Jenis Kelamin" value={profile.gender} />
            <InfoBlock
              label="Tempat Lahir"
              value={profile.birthPlace}
              icon={MapPin}
            />
            <InfoBlock
              label="Tanggal Lahir"
              value={birthDateValue}
              icon={Calendar}
            />
            <InfoBlock label="No e-KTP (NIK)" value={profile.eKtpNumber} />
            <InfoBlock
              label="NPWP"
              value={profile.hasNpwp ? profile.npwpNumber : "Tidak Ada"}
            />
            <InfoBlock
              label="Status WFO"
              value={profile.willingToWfo ? "Bersedia (WFO)" : "Tidak Bersedia"}
            />
          </div>

          <div className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground/80 mb-4">
              <MapPin className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Alamat Lengkap
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 rounded-3xl bg-muted/30 border">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-4">
                  Alamat Sesuai KTP
                </p>
                <p className="text-sm font-bold leading-relaxed">
                  {profile.addressKtp?.street}, RT {profile.addressKtp?.rt}/RW{" "}
                  {profile.addressKtp?.rw}, {profile.addressKtp?.village},{" "}
                  {profile.addressKtp?.district}, {profile.addressKtp?.city},{" "}
                  {profile.addressKtp?.province}{" "}
                  {profile.addressKtp?.postalCode}
                </p>
              </div>
              <div className="p-6 rounded-3xl bg-muted/30 border">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-4">
                  Alamat Domisili
                </p>
                {profile.isDomicileSameAsKtp ? (
                  <p className="text-base font-medium text-muted-foreground italic">
                    Sama dengan alamat KTP
                  </p>
                ) : (
                  <p className="text-sm font-bold leading-relaxed">
                    {profile.addressDomicile?.street}, RT{" "}
                    {profile.addressDomicile?.rt}/RW{" "}
                    {profile.addressDomicile?.rw},{" "}
                    {profile.addressDomicile?.village},{" "}
                    {profile.addressDomicile?.district},{" "}
                    {profile.addressDomicile?.city},{" "}
                    {profile.addressDomicile?.province}{" "}
                    {profile.addressDomicile?.postalCode}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-8">
          <SectionHeader title="Riwayat Pendidikan" icon={GraduationCap} />
          <div className="space-y-6">
            {profile.education?.length ? (
              profile.education.map((edu, idx) => (
                <div
                  key={idx}
                  className="group flex gap-6 p-8 rounded-3xl border bg-card hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-xl"
                >
                  <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <GraduationCap className="h-8 w-8" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div>
                        <h4 className="text-xl font-black text-primary">
                          {edu.institution}
                        </h4>
                        <p className="text-base font-bold text-foreground/80">
                          {edu.level} — {edu.fieldOfStudy}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-2xl font-bold text-sm">
                        <Calendar className="h-4 w-4" />
                        {edu.startDate} —{" "}
                        {edu.isCurrent ? "Sekarang" : edu.endDate}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Badge
                        variant="secondary"
                        className="px-4 py-1.5 text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 border-transparent"
                      >
                        IPK: {edu.gpa || "-"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="px-4 py-1.5 text-sm font-bold border-2"
                      >
                        {edu.isCurrent ? "Masih Menempuh" : "Tamat / Lulus"}
                      </Badge>
                    </div>
                    {edu.thesisTitle && (
                      <div className="mt-4 p-5 rounded-2xl bg-muted/30 border-2 border-dashed border-muted-foreground/20">
                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">
                          Judul TA / Skripsi
                        </p>
                        <p className="text-base font-bold italic">
                          {edu.thesisTitle}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={GraduationCap}
                text="Belum ada data pendidikan"
              />
            )}
          </div>
        </div>
      );
    case 3:
      return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-8">
          <SectionHeader title="Pengalaman Kerja" icon={Briefcase} />
          <div className="space-y-6">
            {profile.workExperience?.length ? (
              profile.workExperience.map((exp, idx) => (
                <div
                  key={idx}
                  className="group flex gap-6 p-8 rounded-3xl border bg-card hover:border-blue-500/50 transition-all duration-300 shadow-sm hover:shadow-xl"
                >
                  <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Briefcase className="h-8 w-8" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div>
                        <h4 className="text-xl font-black">{exp.position}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-base font-bold text-blue-600">
                            {exp.company}
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                          <span className="text-sm text-muted-foreground font-medium">
                            {exp.jobType ? JOB_TYPE_LABELS[exp.jobType] : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-2xl font-bold text-sm">
                        <Calendar className="h-4 w-4" />
                        {exp.startDate} —{" "}
                        {exp.isCurrent ? "Sekarang" : exp.endDate}
                      </div>
                    </div>
                    {exp.description && (
                      <div className="text-lg leading-relaxed text-foreground/80 whitespace-pre-wrap p-6 rounded-2xl bg-muted/20 border-l-4 border-blue-600/30">
                        {exp.description}
                      </div>
                    )}
                    {!exp.isCurrent && exp.reasonForLeaving && (
                      <div className="flex items-start gap-2 text-muted-foreground bg-muted/10 p-4 rounded-xl">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <p className="text-sm font-medium italic">
                          Alasan Berhenti: {exp.reasonForLeaving}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState icon={Briefcase} text="Belum ada pengalaman kerja" />
            )}
          </div>
        </div>
      );
    case 4:
      return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-8">
          <SectionHeader title="Pengalaman Organisasi" icon={Building} />
          <div className="space-y-6">
            {profile.organizationalExperience?.length ? (
              profile.organizationalExperience.map((org, idx) => (
                <div
                  key={idx}
                  className="group flex gap-6 p-8 rounded-3xl border bg-card hover:border-orange-500/50 transition-all duration-300 shadow-sm hover:shadow-xl"
                >
                  <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-50 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                    <Building className="h-8 w-8" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                      <div>
                        <h4 className="text-xl font-black">{org.position}</h4>
                        <p className="text-base font-bold text-orange-600">
                          {org.organization}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-2xl font-bold text-sm">
                        <Calendar className="h-4 w-4" />
                        {org.startDate} —{" "}
                        {org.isCurrent ? "Sekarang" : org.endDate}
                      </div>
                    </div>
                    {org.description && (
                      <div className="text-lg leading-relaxed text-foreground/80 whitespace-pre-wrap p-6 rounded-2xl bg-muted/20 border-l-4 border-orange-600/30">
                        {org.description}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Building}
                text="Belum ada pengalaman organisasi"
              />
            )}
          </div>
        </div>
      );
    case 5:
      return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-10">
          <SectionHeader title="Dokumen & Sertifikasi" icon={FileText} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <Badge
                  variant="secondary"
                  className="px-2 py-0 text-[10px] uppercase font-black"
                >
                  Utama
                </Badge>
                <h4 className="text-xl font-black">Dokumen Digital</h4>
              </div>
              <div className="space-y-4">
                <HeavyDocumentCard
                  label="Curriculum Vitae (CV)"
                  url={profile.cvUrl}
                  verified={application.cvVerified}
                  job={job}
                  application={application}
                  profile={profile}
                  showAnalysis
                />
                <HeavyDocumentCard
                  label="Ijazah / SKL"
                  url={profile.ijazahUrl}
                  verified={application.ijazahVerified}
                />
                <HeavyDocumentCard
                  label="Portfolio / Website"
                  url={profile.websiteUrl}
                  isUrl
                />
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <Badge
                  variant="secondary"
                  className="px-2 py-0 text-[10px] uppercase font-black"
                >
                  Keahlian
                </Badge>
                <h4 className="text-xl font-black">Sertifikasi & Lisensi</h4>
              </div>
              <div className="grid gap-4">
                {profile.certifications?.length ? (
                  profile.certifications.map((cert, idx) => (
                    <div
                      key={idx}
                      className="group p-5 rounded-3xl border bg-card hover:border-primary transition-all flex items-center justify-between shadow-sm hover:shadow-md"
                    >
                      <div className="space-y-1">
                        <p className="font-black text-lg leading-tight group-hover:text-primary transition-colors">
                          {cert.name}
                        </p>
                        <p className="text-sm font-bold text-muted-foreground/80">
                          {cert.organization}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground/60 uppercase tracking-tighter mt-1">
                          <Clock className="h-3 w-3" />
                          {cert.issueDate}{" "}
                          {cert.expirationDate
                            ? `— ${cert.expirationDate}`
                            : "(No Expiry)"}
                        </div>
                      </div>
                      {cert.imageUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-12 w-12 rounded-full hover:bg-primary/10 hover:text-primary"
                          asChild
                        >
                          <a
                            href={cert.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="h-5 w-5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 bg-muted/10 rounded-3xl border border-dashed border-muted-foreground/30">
                    <Trophy className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-muted-foreground text-sm font-medium italic">
                      Belum mengunggah sertifikasi
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    case 6:
      return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-12">
          <SectionHeader title="Deskripsi Diri & Pernyataan" icon={Info} />

          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-2 py-0.5 rounded">
                Tentang Profil
              </span>
            </div>
            <div className="text-lg leading-relaxed font-medium text-foreground/90 whitespace-pre-wrap bg-muted/20 p-6 rounded-2xl border-2 border-dashed">
              {profile.selfDescription || (
                <span className="text-muted-foreground/30 font-normal italic text-sm">
                  Belum diisi kandidat
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
            <InfoBlock
              label="Ekspektasi Gaji"
              value={profile.salaryExpectation}
              icon={Clock}
            />
            <InfoBlock
              label="Ketersediaan Kerja"
              value={
                profile.availability === "Lainnya"
                  ? profile.availabilityOther
                  : profile.availability
              }
              icon={Clock}
            />

            <div className="md:col-span-2 p-8 rounded-3xl bg-primary/5 border border-primary/10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Justifikasi Gaji
              </p>
              <p className="text-lg font-bold leading-relaxed">
                {profile.salaryExpectationReason || "-"}
              </p>
            </div>

            <div className="md:col-span-2 space-y-4">
              <h4 className="text-lg font-black uppercase tracking-wider text-primary">
                Motivasi Bergabung
              </h4>
              <div className="text-lg leading-[1.8] font-medium text-foreground/80 bg-muted/10 p-8 rounded-3xl">
                {profile.motivation || "-"}
              </div>
            </div>

            <InfoBlock label="Gaya Kerja" value={profile.workStyle} />
            <InfoBlock
              label="Area Pengembangan"
              value={profile.improvementArea}
            />

            <div className="md:col-span-2 mt-4">
              <div className="p-8 rounded-[2.5rem] border-4 border-dotted border-primary/20 bg-primary/5 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
                <div className="h-16 w-16 shrink-0 rounded-full bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
                  <Target className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-lg font-bold">Target & Deadline</p>
                  <p className="text-lg text-muted-foreground font-medium mt-1">
                    {profile.usedToDeadline
                      ? "Kandidat terbiasa bekerja di bawah tekanan target/deadline ketat."
                      : "Kandidat belum terbiasa dengan ritme target yang masif."}
                  </p>
                  {profile.deadlineExperience && (
                    <p className="mt-4 text-base font-bold text-foreground bg-background p-5 rounded-2xl border-l-8 border-primary shadow-sm leading-relaxed">
                      &ldquo; {profile.deadlineExperience} &rdquo;
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-muted/5 rounded-[3rem] border-2 border-dashed border-muted-foreground/20">
      <Icon className="h-16 w-16 text-muted-foreground/10 mb-4" />
      <p className="text-xl font-bold text-muted-foreground/40 italic">
        {text}
      </p>
    </div>
  );
}

function HeavyDocumentCard({
  label,
  url,
  verified,
  isUrl,
  showAnalysis,
  job,
  application,
  profile,
}: {
  label: string;
  url?: string;
  verified?: boolean;
  isUrl?: boolean;
  showAnalysis?: boolean;
  job?: Job;
  application?: JobApplication;
  profile?: Profile;
}) {
  if (!url) {
    return (
      <div className="flex flex-col gap-2 p-6 rounded-3xl border-2 border-dashed bg-muted/10 items-center justify-center text-center opacity-60">
        <FileText className="h-8 w-8 text-muted-foreground/20" />
        <p className="text-sm font-bold text-muted-foreground/50">
          {label} tidak tersedia
        </p>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden flex items-center justify-between p-6 rounded-3xl border bg-card hover:shadow-2xl hover:border-primary/50 transition-all duration-500">
      <div className="flex items-center gap-5">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
          {isUrl ? (
            <Globe className="h-7 w-7" />
          ) : (
            <FileText className="h-7 w-7" />
          )}
        </div>
        <div>
          <p className="font-black text-xl leading-none mb-2">{label}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground/60 tracking-wider">
              {isUrl ? "LINK EKSTERNAL" : "ARSIP DOKUMEN"}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {showAnalysis && job && application && profile && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-2xl h-14 w-14 shrink-0 shadow-lg border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-500"
              >
                <Sparkles className="h-6 w-6" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto rounded-[3rem] p-0 border-none shadow-2xl">
              <div className="p-8 sm:p-12">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-4 rounded-[2rem] bg-primary text-white shadow-xl shadow-primary/20">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div>
                    <DialogTitle className="text-3xl font-black tracking-tighter">
                      AI Recruitment Analysis
                    </DialogTitle>
                    <p className="text-muted-foreground font-medium">
                      Laporan analisis kecocokan kandidat dengan syarat jabatan.
                    </p>
                  </div>
                </div>
                <CandidateFitAnalysis
                  job={job}
                  application={application}
                  profile={profile}
                  compact
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
        <Button
          variant="outline"
          size="icon"
          className="rounded-2xl h-14 w-14 shrink-0 shadow-lg group-hover:bg-primary group-hover:border-primary group-hover:text-primary-foreground transition-all duration-500"
          asChild
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            {isUrl ? (
              <ChevronRight className="h-7 w-7" />
            ) : (
              <Eye className="h-7 w-7" />
            )}
          </a>
        </Button>
      </div>
    </div>
  );
}

// Side Navigation Component
export function CandidateStepNav({
  activeStep,
  onStepChange,
}: {
  activeStep: number;
  onStepChange: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {CANDIDATE_STEPS.map((step) => {
        const Icon = step.icon;
        const isActive = activeStep === step.id;

        return (
          <button
            key={step.id}
            onClick={() => onStepChange(step.id)}
            className={cn(
              "group flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 text-left relative",
              isActive
                ? "bg-primary/5 text-primary"
                : "hover:bg-muted text-muted-foreground/70 hover:text-foreground",
            )}
          >
            {isActive && (
              <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
            )}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                isActive
                  ? "bg-primary text-primary-foreground scale-110"
                  : "bg-muted/50 group-hover:bg-muted-foreground/10",
              )}
            >
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p
                className={cn(
                  "text-[9px] font-black uppercase tracking-[0.2em] mb-0.5",
                  isActive
                    ? "opacity-100"
                    : "opacity-40 group-hover:opacity-100",
                )}
              >
                Step 0{step.id}
              </p>
              <p
                className={cn(
                  "text-sm font-bold truncate",
                  isActive ? "text-primary font-black" : "",
                )}
              >
                {step.label}
              </p>
            </div>
          </button>
        );
      })}

      <div className="mt-8 p-4 rounded-2xl bg-muted/30 border border-dashed border-muted-foreground/20 text-center">
        <ShieldCheck className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
          Read Only Mode
        </p>
      </div>
    </div>
  );
}

// Keeping the old exports for backward compatibility if needed,
// but we'll primarily use the individual parts for better layout flexibility in page.tsx
export function CandidateStepView({
  profile,
  application,
  job,
}: {
  profile: Profile;
  application: JobApplication;
  job: Job;
}) {
  const [activeStep, setActiveStep] = useState(1);
  return (
    <Card className="shadow-2xl border-none p-2 rounded-[2.5rem] bg-card/50 backdrop-blur-sm border-t-8 border-t-primary">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <div className="p-4 bg-muted/10 rounded-[2rem] border m-2">
          <CandidateStepNav
            activeStep={activeStep}
            onStepChange={setActiveStep}
          />
        </div>
        <div className="p-8 lg:p-12 min-h-[600px]">
          <CandidateStepContent
            profile={profile}
            application={application}
            activeStep={activeStep}
            job={job}
          />
        </div>
      </div>
    </Card>
  );
}
