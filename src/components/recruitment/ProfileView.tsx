'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Profile, Education, WorkExperience, OrganizationalExperience } from "@/lib/types";
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { User, Home, GraduationCap, Briefcase, Building, Link as LinkIcon, Info } from 'lucide-react';
import React from 'react';
import { JOB_TYPE_LABELS } from '@/lib/types';

// Helper to display info rows consistently
const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="text-base font-semibold mt-0.5">{value || '-'}</dd>
  </div>
);

// Helper for section titles
const SectionTitle = ({ icon, children }: { icon: React.ReactNode, children: React.ReactNode }) => (
    <CardTitle className="text-lg flex items-center gap-3 mb-4">
        {icon}
        {children}
    </CardTitle>
);

// Helper to display address object
const AddressView = ({ title, address }: { title: string; address?: Partial<Profile['addressKtp']> | string }) => {
    if (!address) return <InfoRow label={title} value="-" />;
    if (typeof address === 'string') return <InfoRow label={title} value={address} />;
    if (!address.street) return <InfoRow label={title} value="-" />;
    
    return (
         <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="text-sm font-semibold">
                <p>{address.street}, RT {address.rt}/RW {address.rw}</p>
                <p>{address.village}, {address.district}</p>
                <p>{address.city}, {address.province} {address.postalCode}</p>
            </div>
        </div>
    )
};

// Helper for Education items
const EducationView = ({ item }: { item: Education }) => (
    <div className="text-sm border-b pb-3 last:border-0 last:pb-0">
        <p className="font-semibold text-base">{item.institution}</p>
        <p className="text-muted-foreground">{item.level} - {item.fieldOfStudy}</p>
        {item.gpa && <p className="text-xs text-muted-foreground">IPK/Nilai: {item.gpa}</p>}
        <p className="text-muted-foreground text-xs mt-1">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.thesisTitle && <p className="mt-1 text-xs italic">Judul TA: {item.thesisTitle}</p>}
    </div>
);

// Helper for Work Experience items
const WorkExperienceView = ({ item }: { item: WorkExperience }) => (
     <div className="text-sm border-b pb-3 last:border-0 last:pb-0">
        <p className="font-semibold text-base">{item.position}</p>
        <p className="capitalize font-medium text-muted-foreground">{item.jobType ? JOB_TYPE_LABELS[item.jobType] : ''} di {item.company}</p>
        <p className="text-muted-foreground text-xs mt-1">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
        {!item.isCurrent && item.reasonForLeaving && <p className="mt-1 text-sm italic text-muted-foreground">Alasan berhenti: {item.reasonForLeaving}</p>}
    </div>
);

// Helper for Organizational Experience
const OrgExperienceView = ({ item }: { item: OrganizationalExperience }) => (
    <div className="text-sm border-b pb-3 last:border-0 last:pb-0">
        <p className="font-semibold text-base">{item.position}</p>
        <p className="text-muted-foreground">{item.organization}</p>
        <p className="text-muted-foreground text-xs mt-1">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
    </div>
);


export function ProfileView({ profile }: { profile: Profile }) {
  const birthDateValue = React.useMemo(() => {
    if (!profile.birthDate) return '-';
    const date = (profile.birthDate as any).toDate ? (profile.birthDate as any).toDate() : new Date(profile.birthDate);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return format(date, 'dd MMMM yyyy', { locale: idLocale });
  }, [profile.birthDate]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <SectionTitle icon={<User className="h-5 w-5" />}>Data Pribadi</SectionTitle>
        </CardHeader>
        <CardContent>
            <dl className="grid md:grid-cols-2 gap-x-6 gap-y-6">
                <InfoRow label="Nama Panggilan" value={profile.nickname} />
                <InfoRow label="Jenis Kelamin" value={profile.gender} />
                <InfoRow label="Tempat Lahir" value={profile.birthPlace} />
                <InfoRow label="Tanggal Lahir" value={birthDateValue} />
                <InfoRow label="Nomor e-KTP" value={profile.eKtpNumber} />
                <InfoRow label="NPWP" value={profile.hasNpwp ? profile.npwpNumber : 'Tidak Ada'} />
                <InfoRow label="Bersedia WFO" value={profile.willingToWfo ? 'Ya' : 'Tidak'} />
                {profile.linkedinUrl && <InfoRow label="LinkedIn" value={<a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Profil LinkedIn</a>} />}
                {profile.websiteUrl && <InfoRow label="Website/Portfolio" value={<a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Link Portofolio</a>} />}
            </dl>
        </CardContent>
      </Card>
      
      <Card>
          <CardHeader>
            <SectionTitle icon={<Home className="h-5 w-5" />}>Alamat</SectionTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AddressView title="Alamat KTP" address={profile.addressKtp} />
              {profile.isDomicileSameAsKtp ? <p className="text-sm text-muted-foreground self-center">Alamat domisili sama dengan alamat KTP.</p> : <AddressView title="Alamat Domisili" address={profile.addressDomicile} />}
          </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <SectionTitle icon={<Info className="h-5 w-5" />}>Tentang Saya & Ekspektasi</SectionTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            <InfoRow label="Profil Singkat" value={<p className="whitespace-pre-wrap leading-relaxed">{profile.selfDescription}</p>} />
            <div className="grid md:grid-cols-2 gap-6">
                <InfoRow label="Ekspektasi Gaji" value={profile.salaryExpectation} />
                <InfoRow label="Alasan Ekspektasi" value={<p className="whitespace-pre-wrap leading-relaxed">{profile.salaryExpectationReason}</p>} />
            </div>
            <InfoRow label="Motivasi Melamar" value={<p className="whitespace-pre-wrap leading-relaxed">{profile.motivation}</p>} />
            <div className="grid md:grid-cols-2 gap-6">
                <InfoRow label="Gaya Kerja" value={profile.workStyle} />
                <InfoRow label="Area Pengembangan" value={profile.improvementArea} />
            </div>
             <div className="grid md:grid-cols-2 gap-6">
                <InfoRow label="Ketersediaan" value={profile.availability === 'Lainnya' ? profile.availabilityOther : profile.availability} />
                <div>
                    <InfoRow label="Bekerja dengan Target/Deadline" value={profile.usedToDeadline ? 'Ya' : 'Tidak'} />
                    {profile.usedToDeadline && <p className="text-sm mt-2 text-muted-foreground">{profile.deadlineExperience}</p>}
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
          <CardHeader>
            <SectionTitle icon={<GraduationCap className="h-5 w-5" />}>Pendidikan</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-4">
              {profile.education?.length > 0 ? profile.education?.map((item, i) => <EducationView key={i} item={item} />) : <p className="text-sm text-muted-foreground p-4 text-center">Belum ada riwayat pendidikan.</p>}
          </CardContent>
      </Card>
        
      {profile.workExperience && profile.workExperience.length > 0 && (
          <Card>
              <CardHeader>
                <SectionTitle icon={<Briefcase className="h-5 w-5" />}>Pengalaman Kerja</SectionTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile.workExperience.map((item, i) => <WorkExperienceView key={i} item={item} />)}
              </CardContent>
          </Card>
      )}

      {profile.organizationalExperience && profile.organizationalExperience.length > 0 && (
          <Card>
              <CardHeader>
                <SectionTitle icon={<Building className="h-5 w-5" />}>Pengalaman Organisasi</SectionTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 {profile.organizationalExperience.map((item, i) => (<OrgExperienceView key={i} item={item} />))}
              </CardContent>
          </Card>
      )}
    </div>
  );
}
