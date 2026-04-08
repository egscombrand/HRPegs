'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Edit, User, Home, BookOpen, Briefcase, Sparkles, Building, Info as InfoIcon, Eye, EyeOff, Banknote, GraduationCap, Lock, Loader2 } from 'lucide-react';
import type {
  Profile,
  Address,
  Education,
  WorkExperience,
  OrganizationalExperience,
  Certification,
  JobApplication,
  JobApplicationStatus,
} from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { JOB_TYPE_LABELS } from '@/lib/types';
import Link from 'next/link';

// Helper to mask NIK for display
const maskNik = (nik?: string): string => {
  if (!nik || nik.length < 4) return '----';
  return '************' + nik.slice(-4);
};

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="text-base font-semibold mt-0.5">{value || '-'}</dd>
  </div>
);

const SectionTitle = ({ children, icon, onEditClick, isLocked }: { children: React.ReactNode, icon: React.ReactNode, onEditClick: () => void, isLocked: boolean }) => (
    <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-3">
            {icon}
            {children}
        </h3>
        {!isLocked && (
            <Button variant="ghost" size="sm" onClick={onEditClick}>
                <Edit className="h-3 w-3 mr-2" />
                Edit
            </Button>
        )}
    </div>
);

const AddressView = ({ title, address }: { title: string; address?: Partial<Address> | string }) => {
    if (!address || (typeof address === 'object' && !address.street)) {
        return (
            <div>
                <p className="text-xs font-medium text-muted-foreground">{title}</p>
                <p className="text-base font-semibold mt-0.5">-</p>
            </div>
        );
    }
    if (typeof address === 'string') {
        return (
            <div>
                <p className="text-xs font-medium text-muted-foreground">{title}</p>
                <p className="text-base font-semibold mt-0.5">{address}</p>
            </div>
        );
    }
    
    const fullAddress = `${address.street}, RT ${address.rt}/RW ${address.rw}, ${address.village}, ${address.district}, ${address.city}, ${address.province} ${address.postalCode}`;

    return (
        <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-base font-semibold mt-0.5 whitespace-pre-line">{fullAddress}</p>
        </div>
    );
};


const EducationView = ({ item }: { item: Education }) => (
    <div className="py-3 border-b last:border-b-0 last:pb-0 first:pt-0">
        <p className="font-semibold text-base">{item.institution}</p>
        <p className="text-sm text-muted-foreground">{item.level} - {item.fieldOfStudy}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span>{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</span>
            {item.gpa && <span>• IPK/Nilai: {item.gpa}</span>}
        </div>
    </div>
);

const WorkExperienceView = ({ item }: { item: WorkExperience }) => (
     <div className="py-3 border-b last:border-b-0 last:pb-0 first:pt-0">
        <p className="font-semibold text-base">{item.position}</p>
        <p className="text-sm text-muted-foreground capitalize">{item.jobType ? JOB_TYPE_LABELS[item.jobType] : ''} di {item.company}</p>
        <p className="text-muted-foreground text-xs mt-1">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
        {item.description && <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{item.description}</p>}
        {!item.isCurrent && item.reasonForLeaving && <p className="mt-1 text-sm italic text-muted-foreground">Alasan berhenti: {item.reasonForLeaving}</p>}
    </div>
);

const OrgExperienceView = ({ item }: { item: OrganizationalExperience }) => (
    <div className="py-3 border-b last:border-b-0 last:pb-0 first:pt-0">
        <p className="font-semibold text-base">{item.position}</p>
        <p className="text-sm text-muted-foreground">{item.organization}</p>
        <p className="text-muted-foreground text-xs mt-1">{item.startDate} - {item.isCurrent ? 'Sekarang' : item.endDate}</p>
    </div>
);

const CertificationView = ({ item }: { item: Certification }) => (
    <div className="text-sm flex justify-between items-start gap-2 py-2 border-b last:border-b-0">
        <div>
            <p className="font-semibold">{item.name}</p>
            <p className="text-muted-foreground text-xs">Penerbit: {item.organization}</p>
            <p className="text-muted-foreground text-xs">Tanggal: {item.issueDate} {item.expirationDate ? ` - ${item.expirationDate}` : ''}</p>
        </div>
        {item.imageUrl && (
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" asChild>
                <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" title="Lihat Sertifikat">
                    <Eye className="h-4 w-4" />
                </a>
            </Button>
        )}
    </div>
);

export function ProfilePreview({
  profile,
  onEditRequest,
}: {
  profile: Profile;
  onEditRequest: (step: number) => void;
}) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid)
    );
  }, [userProfile?.uid, firestore]);

  const { data: applications, isLoading: isLoadingApps } = useCollection<JobApplication>(applicationsQuery);

  const isProfileLocked = React.useMemo(() => {
    if (!applications) return false;
    const lockStages: JobApplicationStatus[] = ['verification', 'interview', 'offered', 'hired'];
    return applications.some(app => lockStages.includes(app.status));
  }, [applications]);

  const isProfileComplete = profile.profileStatus === 'completed';
  const nextStep = profile.profileStep || 1;
  const [isNikVisible, setIsNikVisible] = React.useState(false);

  const handleCTAClick = () => {
    if (isProfileLocked) return;
    onEditRequest(isProfileComplete ? 1 : nextStep);
  };

  const birthDateValue = React.useMemo(() => {
    if (!profile.birthDate) return '-';
    const date = (profile.birthDate as any).toDate ? (profile.birthDate as any).toDate() : new Date(profile.birthDate);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return format(date, 'dd MMMM yyyy', { locale: idLocale });
  }, [profile.birthDate]);

  return (
    <div className="space-y-6">
      {isProfileLocked && (
        <Alert variant="default" className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <Lock className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">Profil Dikunci</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
                Profil Anda telah dikunci karena sedang dalam tahap seleksi lanjutan. Perubahan data tidak dapat dilakukan saat ini.
            </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
              <CardDescription>
                {profile.email} &bull; {profile.phone}
                <br />
                <span className="text-xs">Terakhir diperbarui: {profile.updatedAt ? format(profile.updatedAt.toDate(), 'dd MMM yyyy, HH:mm') : 'Baru saja'}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
                <Badge variant={isProfileComplete ? 'default' : 'secondary'}>
                    {isProfileComplete ? 'Profil Lengkap' : 'Profil Belum Lengkap'}
                </Badge>
                <Button onClick={handleCTAClick} disabled={isProfileLocked || isLoadingApps}>
                    {isLoadingApps ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4" />}
                    {isProfileComplete ? 'Perbarui Profil' : 'Lanjutkan Pengisian'}
                </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
            <Card>
                <CardHeader>
                    <SectionTitle icon={<User className="h-5 w-5" />} onEditClick={() => onEditRequest(1)} isLocked={isProfileLocked}>Data Pribadi</SectionTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid md:grid-cols-2 gap-x-6 gap-y-6">
                        <InfoRow label="Nama Panggilan" value={profile.nickname} />
                        <InfoRow label="Jenis Kelamin" value={profile.gender} />
                        <InfoRow label="Tempat Lahir" value={profile.birthPlace} />
                        <InfoRow label="Tanggal Lahir" value={birthDateValue} />
                        <div>
                            <dt className="text-xs font-medium text-muted-foreground">Nomor e-KTP</dt>
                            <dd className="text-base font-semibold mt-0.5 flex items-center gap-2">
                                <span>{isNikVisible ? profile.eKtpNumber : maskNik(profile.eKtpNumber)}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsNikVisible(!isNikVisible)}>
                                    {isNikVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </dd>
                        </div>
                        <InfoRow label="NPWP" value={profile.hasNpwp ? profile.npwpNumber : 'Tidak Ada'} />
                        <InfoRow label="Bersedia WFO" value={profile.willingToWfo ? 'Ya' : 'Tidak'} />
                        {profile.linkedinUrl && <InfoRow label="LinkedIn" value={<a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Profil LinkedIn</a>} />}
                        {profile.websiteUrl && <InfoRow label="Website/Portfolio" value={<a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Link Portofolio</a>} />}
                    </dl>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <SectionTitle icon={<Home className="h-5 w-5" />} onEditClick={() => onEditRequest(1)} isLocked={isProfileLocked}>Alamat</SectionTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <AddressView title="Alamat KTP" address={profile.addressKtp} />
                    {profile.isDomicileSameAsKtp ? <p className="text-sm text-muted-foreground self-center">Alamat domisili sama dengan alamat KTP.</p> : <AddressView title="Alamat Domisili" address={profile.addressDomicile} />}
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><SectionTitle icon={<InfoIcon className="h-5 w-5" />} onEditClick={() => onEditRequest(6)} isLocked={isProfileLocked}>Tentang Saya</SectionTitle></CardHeader>
                <CardContent className="space-y-6">
                    <InfoRow label="Profil Singkat" value={<p className="whitespace-pre-wrap leading-relaxed">{profile.selfDescription}</p>} />
                    <Separator/>
                    <div className="grid md:grid-cols-2 gap-6">
                        <InfoRow label="Ekspektasi Gaji" value={profile.salaryExpectation} />
                        <InfoRow label="Alasan Ekspektasi" value={<p className="whitespace-pre-wrap leading-relaxed">{profile.salaryExpectationReason}</p>} />
                    </div>
                    <Separator/>
                    <InfoRow label="Motivasi Melamar" value={<p className="whitespace-pre-wrap leading-relaxed">{profile.motivation}</p>} />
                    <Separator/>
                    <div className="grid md:grid-cols-2 gap-6">
                        <InfoRow label="Gaya Kerja" value={profile.workStyle} />
                        <InfoRow label="Area Pengembangan" value={profile.improvementArea} />
                    </div>
                    <Separator/>
                    <div className="grid md:grid-cols-2 gap-6">
                        <InfoRow label="Ketersediaan" value={profile.availability === 'Lainnya' ? profile.availabilityOther : profile.availability} />
                        <div>
                            <InfoRow label="Bekerja dengan Target/Deadline" value={profile.usedToDeadline ? 'Ya' : 'Tidak'} />
                            {profile.usedToDeadline && <p className="text-sm mt-2 text-muted-foreground">{profile.deadlineExperience}</p>}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
        <div className="lg:sticky lg:top-24 space-y-6">
            <Card>
                <CardHeader><SectionTitle icon={<GraduationCap className="h-5 w-5" />} onEditClick={() => onEditRequest(2)} isLocked={isProfileLocked}>Pendidikan</SectionTitle></CardHeader>
                <CardContent className="space-y-4">
                    {profile.education?.length > 0 ? profile.education?.map((item, i) => <EducationView key={i} item={item} />) : <p className="text-sm text-muted-foreground p-4 text-center">Belum ada riwayat pendidikan. Tambahkan untuk meningkatkan peluang Anda.</p>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader><SectionTitle icon={<Briefcase className="h-5 w-5" />} onEditClick={() => onEditRequest(3)} isLocked={isProfileLocked}>Pengalaman Kerja</SectionTitle></CardHeader>
                <CardContent className="space-y-4">
                     {profile.workExperience && profile.workExperience.length > 0 ? profile.workExperience.map((item, i) => <WorkExperienceView key={i} item={item} />) : <p className="text-sm text-muted-foreground p-4 text-center">Belum ada pengalaman kerja. Tambahkan untuk meningkatkan peluang Anda.</p>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader><SectionTitle icon={<Building className="h-5 w-5" />} onEditClick={() => onEditRequest(4)} isLocked={isProfileLocked}>Pengalaman Organisasi</SectionTitle></CardHeader>
                <CardContent className="space-y-4">
                     {profile.organizationalExperience && profile.organizationalExperience.length > 0 ? profile.organizationalExperience.map((item, i) => <OrgExperienceView key={i} item={item} />) : <p className="text-sm text-muted-foreground p-4 text-center">Belum ada pengalaman organisasi.</p>}
                </CardContent>
            </Card>
             <Card>
                <CardHeader><SectionTitle icon={<Sparkles className="h-5 w-5" />} onEditClick={() => onEditRequest(5)} isLocked={isProfileLocked}>Dokumen & Keahlian</SectionTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <h4 className="font-semibold text-xs text-muted-foreground uppercase">Dokumen Utama</h4>
                        <div className="grid grid-cols-1 gap-2">
                            <a href={profile.cvUrl || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-2 rounded-md border hover:bg-muted transition-colors">
                                <span className="text-sm font-medium">Curriculum Vitae (CV)</span>
                                {profile.cvUrl ? <Eye className="h-4 w-4 text-primary"/> : <X className="h-4 w-4 text-destructive"/>}
                            </a>
                            <a href={profile.ijazahUrl || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-2 rounded-md border hover:bg-muted transition-colors">
                                <span className="text-sm font-medium">Ijazah / SKL</span>
                                {profile.ijazahUrl ? <Eye className="h-4 w-4 text-primary"/> : <X className="h-4 w-4 text-destructive"/>}
                            </a>
                        </div>
                    </div>
                     {profile.skills && profile.skills.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-semibold text-xs text-muted-foreground uppercase">Keahlian</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {profile.skills.map(skill => <Badge key={skill} variant="secondary" className="font-normal">{skill}</Badge>)}
                            </div>
                        </div>
                     )}
                     {profile.certifications && profile.certifications.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="font-semibold text-xs text-muted-foreground uppercase">Sertifikasi</h4>
                            <div className="space-y-2">
                                {profile.certifications.map((cert, i) => (<CertificationView key={cert.id || i} item={cert} />))}
                            </div>
                        </div>
                     )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
