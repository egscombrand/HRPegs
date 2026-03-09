'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { EmployeeProfile, JobApplication } from '@/lib/types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import React, { useMemo } from 'react';


const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2">{value || '-'}</dd>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-lg font-semibold tracking-tight border-b pb-2 mb-4">{children}</h3>
);

interface InternProfileDetailDialogProps {
  profile: EmployeeProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InternProfileDetailDialog({ profile, open, onOpenChange }: InternProfileDetailDialogProps) {
  if (!profile) return null;

  const firestore = useFirestore();

  const applicationQuery = useMemoFirebase(() => {
    if (!profile) return null;
    // Remove orderBy to prevent needing a composite index. Sorting will be done client-side.
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', profile.uid),
      where('status', '==', 'hired')
    );
  }, [firestore, profile]);

  const { data: applications, isLoading: isLoadingApplication } = useCollection<JobApplication>(applicationQuery);

  const application = useMemo(() => {
    if (!applications || applications.length === 0) {
      return null;
    }
    // Sort client-side to find the most recent hired application
    const sortedApps = [...applications].sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
    return sortedApps[0];
  }, [applications]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Detail Profil Magang: {profile.fullName}</DialogTitle>
          <DialogDescription>{profile.email}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow pr-6 -mr-6">
          <div className="space-y-6 py-4">
            <div>
              <SectionTitle>Identitas</SectionTitle>
              <dl className="space-y-1">
                <InfoRow label="Nama Lengkap" value={profile.fullName} />
                <InfoRow label="Nama Panggilan" value={profile.nickName} />
                <InfoRow label="Telepon" value={profile.phone} />
                <InfoRow label="Jenis Kelamin" value={profile.gender} />
                <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace || ''}, ${profile.birthDate ? format(new Date(profile.birthDate), 'dd MMMM yyyy', {locale: id}) : '-'}`} />
              </dl>
            </div>
            
            <Separator />
            
            <div>
                <SectionTitle>Status & Penempatan</SectionTitle>
                 <dl className="space-y-1">
                    <InfoRow label="Penempatan Brand" value={application?.brandName || '-'} />
                    <InfoRow label="Tipe Magang" value={profile.internSubtype === 'intern_education' ? 'Terikat Pendidikan' : 'Pra-Probation'} />
                    <InfoRow label="Tipe Pekerja" value={profile.employmentType} />
                </dl>
             </div>
             
             <Separator />

             <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Detail Kontrak & Penawaran</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingApplication ? (
                        <div className="flex items-center justify-center h-24">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : application ? (
                         <div className="space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Periode Magang Resmi</h4>
                                <dl className="space-y-1 text-sm">
                                    <InfoRow label="Mulai Magang" value={profile.internshipStartDate ? format(profile.internshipStartDate.toDate(), 'dd MMMM yyyy', { locale: id }) : 'Belum diatur'} />
                                    <InfoRow label="Selesai Magang" value={profile.internshipEndDate ? format(profile.internshipEndDate.toDate(), 'dd MMMM yyyy', { locale: id }) : 'Belum diatur'} />
                                </dl>
                            </div>
                            <Separator />
                             <div>
                                <h4 className="text-sm font-semibold mb-2">Detail Penawaran Awal</h4>
                                <dl className="space-y-1 text-sm">
                                    <InfoRow label="Uang Saku" value={application.offeredSalary ? `Rp ${application.offeredSalary.toLocaleString('id-ID')}` : '-'} />
                                    <InfoRow label="Durasi Kontrak" value={application.contractDurationMonths ? `${application.contractDurationMonths} bulan` : '-'} />
                                    <InfoRow label="Tanggal Mulai (Offer)" value={application.contractStartDate ? format(application.contractStartDate.toDate(), 'dd MMM yyyy, HH:mm') : '-'} />
                                    <InfoRow label="Tanggal Selesai (Offer)" value={application.contractEndDate ? format(application.contractEndDate.toDate(), 'dd MMMM yyyy') : '-'} />
                                    <InfoRow label="Catatan Penawaran" value={application.offerNotes} />
                                </dl>
                             </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">Tidak ditemukan data penawaran kerja terkait di sistem rekrutmen.</p>
                    )}
                </CardContent>
            </Card>

            <Separator />

            <div>
                <SectionTitle>Pendidikan</SectionTitle>
                 <dl className="space-y-1">
                    <InfoRow label="Asal Sekolah/Kampus" value={profile.schoolOrCampus} />
                    <InfoRow label="Jurusan" value={profile.major} />
                    <InfoRow label="Jenjang Pendidikan" value={profile.educationLevel} />
                    <InfoRow label="Perkiraan Selesai (Studi)" value={profile.expectedEndDate ? format(new Date(profile.expectedEndDate), 'dd MMMM yyyy', {locale: id}) : '-'} />
                </dl>
            </div>
            
            <Separator />
            
            <div>
                <SectionTitle>Domisili & Kontak Darurat</SectionTitle>
                 <dl className="space-y-1">
                    <InfoRow label="Alamat Domisili" value={profile.addressCurrent} />
                    <InfoRow label="Nama Kontak Darurat" value={profile.emergencyContactName} />
                    <InfoRow label="Hubungan" value={profile.emergencyContactRelation} />
                    <InfoRow label="Telepon Darurat" value={profile.emergencyContactPhone} />
                </dl>
            </div>
            
             <Separator />

            <div>
                <SectionTitle>Dokumen</SectionTitle>
                <div className="flex gap-4">
                    {profile.documents?.cvUrl && <Button variant="outline" asChild><a href={profile.documents.cvUrl} target="_blank">Lihat CV</a></Button>}
                    {profile.documents?.idCardUrl && <Button variant="outline" asChild><a href={profile.documents.idCardUrl} target="_blank">Lihat KTP</a></Button>}
                    {profile.documents?.studentCardUrl && <Button variant="outline" asChild><a href={profile.documents.studentCardUrl} target="_blank">Lihat KTM</a></Button>}
                    {(!profile.documents || (!profile.documents.cvUrl && !profile.documents.idCardUrl && !profile.documents.studentCardUrl)) && <p className="text-sm text-muted-foreground">Tidak ada dokumen yang diunggah.</p>}
                </div>
            </div>

          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
