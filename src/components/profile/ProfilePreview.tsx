'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Edit, User, Home, BookOpen, Briefcase, Sparkles, Building, Info as InfoIcon, Eye, EyeOff, Banknote } from 'lucide-react';
import type {
  Profile,
  Address,
  Education,
  WorkExperience,
  OrganizationalExperience,
  Certification,
  EmployeeProfile
} from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

// Helper to mask NIK for display
const maskNik = (nik?: string): string => {
  if (!nik || nik.length < 4) return '----';
  return '************' + nik.slice(-4);
};

const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2">{value || '-'}</dd>
  </div>
);

const SectionTitle = ({ children, icon }: { children: React.ReactNode, icon: React.ReactNode }) => (
    <h3 className="text-lg font-semibold tracking-tight flex items-center gap-3 mb-4 text-primary">
        {icon}
        {children}
    </h3>
);

const AddressView = ({ title, address }: { title: string; address?: Partial<Address> | string }) => {
    if (!address) return <p className="text-sm text-muted-foreground">Belum diisi.</p>;

    if (typeof address === 'string') {
        return (
            <div>
                <h4 className="font-medium text-sm mb-1">{title}</h4>
                <p className="text-sm text-muted-foreground">{address}</p>
            </div>
        )
    }

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
    <div className="text-sm">
        <p className="font-semibold">{item.institution}</p>
        <p>{item.level} - {item.fieldOfStudy}</p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.gpa && <p className="text-muted-foreground text-xs">IPK/Nilai: {item.gpa}</p>}
    </div>
);

const WorkExperienceView = ({ item }: { item: WorkExperience }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.company}</span></p>
        <p className="capitalize text-xs">{item.jobType}</p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
        {!item.isCurrent && item.reasonForLeaving && <p className="mt-1 text-sm italic text-muted-foreground">Alasan berhenti: {item.reasonForLeaving}</p>}
    </div>
);

const OrgExperienceView = ({ item }: { item: OrganizationalExperience }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.position} <span className="font-normal text-muted-foreground">di {item.organization}</span></p>
        <p className="text-muted-foreground text-xs">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-xs">{item.description}</p>}
    </div>
);

const CertificationView = ({ item }: { item: Certification }) => (
    <div className="text-sm">
        <p className="font-semibold">{item.name}</p>
        <p className="text-muted-foreground text-xs">Penerbit: {item.organization}</p>
        <p className="text-muted-foreground text-xs">Tanggal: {item.issueDate} {item.expirationDate ? ` - ${item.expirationDate}` : ''}</p>
    </div>
);

export function ProfilePreview({
  profile,
  onEditRequest,
}: {
  profile: Profile & Partial<EmployeeProfile>;
  onEditRequest: (step: number) => void;
}) {
  const isProfileComplete = profile.profileStatus === 'completed' || profile.completeness?.isComplete === true;
  const nextStep = profile.profileStep || 1;
  const [isNikVisible, setIsNikVisible] = React.useState(false);

  const handleCTAClick = () => {
    if (isProfileComplete) {
      onEditRequest(1);
    } else {
      onEditRequest(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
              <CardDescription>
                {profile.email} &bull; {profile.phone}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
                <Badge variant={isProfileComplete ? 'default' : 'secondary'}>
                    {isProfileComplete ? 'Lengkap' : 'Draf'}
                </Badge>
                <Button onClick={handleCTAClick}>
                    <Edit className="mr-2 h-4 w-4" />
                    {isProfileComplete ? 'Perbarui Profil' : 'Lanjutkan Pengisian'}
                </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3"><User className="h-5 w-5 text-primary" />Data Pribadi</CardTitle>
        </CardHeader>
        <CardContent>
            <dl>
                <InfoRow label="Nama Panggilan" value={profile.nickname} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1">
                    <dt className="text-sm font-medium text-muted-foreground">Nomor e-KTP</dt>
                    <dd className="text-sm col-span-2 flex items-center gap-2">
                        <span>{isNikVisible ? profile.eKtpNumber : maskNik(profile.eKtpNumber)}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setIsNikVisible(!isNikVisible)}
                        >
                            {isNikVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span className="sr-only">{isNikVisible ? 'Sembunyikan' : 'Tampilkan'} NIK</span>
                        </Button>
                    </dd>
                </div>
                <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace}, ${profile.birthDate ? format(profile.birthDate.toDate(), 'dd MMMM yyyy', {locale: idLocale}) : '-'}`} />
                <InfoRow label="Jenis Kelamin" value={profile.gender} />
            </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3"><Home className="h-5 w-5 text-primary" />Alamat</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AddressView title="Alamat KTP" address={profile.addressKtp} />
            {profile.isDomicileSameAsKtp ? <p className="text-sm text-muted-foreground self-center">Alamat domisili sama dengan alamat KTP.</p> : <AddressView title="Alamat Domisili" address={profile.addressDomicile} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3"><Banknote className="h-5 w-5 text-primary" />Informasi Finansial</CardTitle>
        </CardHeader>
        <CardContent>
            <dl className="space-y-1">
                <InfoRow label="Nama Bank" value={profile.bankName} />
                <InfoRow label="Nomor Rekening" value={profile.bankAccountNumber} />
                <InfoRow label="Nama Pemilik Rekening" value={profile.bankAccountHolderName} />
            </dl>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-3"><BookOpen className="h-5 w-5 text-primary" />Pendidikan</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                {profile.education?.length > 0 ? (
                    <>
                        <EducationView item={profile.education[0]} />
                        {profile.education.length > 1 && <p className="text-xs text-muted-foreground pt-2">...dan {profile.education.length - 1} riwayat lainnya.</p>}
                    </>
                ) : <p className="text-sm text-muted-foreground">Belum diisi.</p>}
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-3"><Briefcase className="h-5 w-5 text-primary" />Pengalaman Kerja</CardTitle></CardHeader>
            <CardContent>
                 {profile.workExperience?.length > 0 ? `${profile.workExperience.length} item pengalaman kerja` : <p className="text-sm text-muted-foreground">Belum diisi.</p>}
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-3"><Building className="h-5 w-5 text-primary" />Pengalaman Organisasi</CardTitle></CardHeader>
            <CardContent>
                 {profile.organizationalExperience?.length > 0 ? `${profile.organizationalExperience.length} item pengalaman organisasi` : <p className="text-sm text-muted-foreground">Belum diisi.</p>}
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" />Keahlian & Sertifikasi</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                 <div>
                    <h4 className="font-semibold text-sm mb-2">Keahlian</h4>
                    <div className="flex flex-wrap gap-2">
                        {profile.skills?.length > 0 ? (
                            <>
                                {profile.skills.slice(0, 8).map(skill => <Badge key={skill} variant="secondary">{skill}</Badge>)}
                                {profile.skills.length > 8 && <Badge variant="outline">+{profile.skills.length - 8}</Badge>}
                            </>
                        ) : <p className="text-sm text-muted-foreground">Belum diisi.</p>}
                    </div>
                </div>
                 <Separator/>
                 <div>
                    <h4 className="font-semibold text-sm mb-2">Sertifikasi</h4>
                     {profile.certifications?.length > 0 ? `${profile.certifications.length} sertifikasi` : <p className="text-sm text-muted-foreground">Belum diisi.</p>}
                </div>
            </CardContent>
        </Card>
      </div>

       <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-3"><InfoIcon className="h-5 w-5 text-primary" />Tentang Saya</CardTitle></CardHeader>
            <CardContent>
                 <dl>
                    <InfoRow label="Profil Singkat" value={profile.selfDescription} />
                    <InfoRow label="Ekspektasi Gaji" value={profile.salaryExpectation} />
                    <InfoRow label="Motivasi" value={profile.motivation} />
                </dl>
            </CardContent>
       </Card>
    </div>
  );
}
