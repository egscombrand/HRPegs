'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Profile, Education, WorkExperience, OrganizationalExperience, Certification } from "@/lib/types";
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Badge } from "../ui/badge";
import { User, Home, BookOpen, Briefcase, Sparkles, Building, Link as LinkIcon, GraduationCap } from 'lucide-react';

type InfoRowProps = {
  label: string;
  value?: string | number | null | React.ReactNode;
};

const InfoRow = ({ label, value }: InfoRowProps) => (
  <div>
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm mt-0.5">{typeof value === 'string' && value.startsWith('http') ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Link</a> : (value || '-')}</dd>
  </div>
);

const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode, children: React.ReactNode }) => (
    <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2 text-primary">{icon} {title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

const AddressView = ({ title, address }: { title: string; address?: Partial<Profile['addressKtp']> | string }) => {
    if (!address) return <p className="text-sm text-muted-foreground">Belum diisi.</p>;
    if (typeof address === 'string') return <p className="text-sm text-muted-foreground">{address}</p>;
    if (!address.street) return <p className="text-sm text-muted-foreground">Belum diisi.</p>;
    
    return (
         <div>
            <h4 className="font-medium text-sm mb-1">{title}</h4>
            <div className="text-sm text-muted-foreground">
                <p>{address.street}, RT {address.rt}/RW {address.rw}</p>
                <p>{address.village}, {address.district}</p>
                <p>{address.city}, {address.province} {address.postalCode}</p>
            </div>
        </div>
    )
};

const EducationView = ({ item }: { item: Education }) => (
    <div className="text-sm border-b pb-3 last:border-0 last:pb-0">
        <p className="font-semibold">{item.institution}</p>
        <p className="text-muted-foreground">{item.level} - {item.fieldOfStudy}</p>
        {item.gpa && <p className="text-xs text-muted-foreground">IPK/Nilai: {item.gpa}</p>}
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
    </div>
);

const WorkExperienceView = ({ item }: { item: WorkExperience }) => (
     <div className="text-sm border-b pb-3 last:border-0 last:pb-0">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.company}</span></p>
        <p className="capitalize text-xs">{item.jobType}</p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
        {!item.isCurrent && item.reasonForLeaving && <p className="mt-1 text-sm italic text-muted-foreground">Alasan berhenti: {item.reasonForLeaving}</p>}
    </div>
);


export function ProfileView({ profile }: { profile: Profile }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-8">
        <Section title="Data Pribadi" icon={<User className="h-5 w-5" />}>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow label="Nama Panggilan" value={profile.nickname} />
            <InfoRow label="Jenis Kelamin" value={profile.gender} />
            <InfoRow label="Tempat Lahir" value={profile.birthPlace} />
            <InfoRow label="Tanggal Lahir" value={profile.birthDate ? format(profile.birthDate.toDate(), 'dd MMMM yyyy', {locale: idLocale}) : '-'} />
            <InfoRow label="Nomor e-KTP" value={profile.eKtpNumber} />
            <InfoRow label="NPWP" value={profile.hasNpwp ? profile.npwpNumber : 'Tidak ada'} />
            <InfoRow label="Bersedia WFO" value={profile.willingToWfo ? 'Ya' : 'Tidak'} />
          </div>
        </Section>

        <Section title="Alamat" icon={<Home className="h-5 w-5" />}>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AddressView title="Alamat KTP" address={profile.addressKtp} />
                {profile.isDomicileSameAsKtp ? <p className="text-sm text-muted-foreground self-center">Alamat domisili sama dengan alamat KTP.</p> : <AddressView title="Alamat Domisili" address={profile.addressDomicile} />}
            </div>
        </Section>
        
        <Section title="Pendidikan" icon={<GraduationCap className="h-5 w-5" />}>
            {profile.education?.length > 0 ? profile.education?.map((item, i) => <EducationView key={i} item={item} />) : <p className="text-sm text-muted-foreground">Belum diisi.</p>}
        </Section>

        {profile.workExperience && profile.workExperience.length > 0 && (
          <Section title="Pengalaman Kerja" icon={<Briefcase className="h-5 w-5" />}>
            {profile.workExperience.map((item, i) => <WorkExperienceView key={i} item={item} />)}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}
