'use client';

import React, { useState, useMemo } from 'react';
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
import { Loader2, Edit } from 'lucide-react';
import { InternAdminDataFormDialog } from './InternAdminDataFormDialog';


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
  onAdminDataChange: () => void;
}

export function InternProfileDetailDialog({ profile, open, onOpenChange, onAdminDataChange }: InternProfileDetailDialogProps) {
  const [isEditAdminOpen, setIsEditAdminOpen] = useState(false);

  if (!profile) return null;

  const firestore = useFirestore();

  const applicationQuery = useMemoFirebase(() => {
    if (!profile) return null;
    // REMOVED orderBy to prevent needing a composite index.
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', profile.uid),
      where('status', '==', 'hired')
    );
  }, [firestore, profile]);

  const { data: applications, isLoading: isLoadingApplication } = useCollection<JobApplication>(applicationQuery);

  const application = useMemo(() => {
    if (!applications || applications.length === 0) return null;
    // Sort on the client to find the most recent application.
    const sortedApps = [...applications].sort((a, b) => {
        const timeA = a.updatedAt?.toMillis() || 0;
        const timeB = b.updatedAt?.toMillis() || 0;
        return timeB - timeA;
    });
    return sortedApps[0];
  }, [applications]);
  
  const handleAdminFormSuccess = () => {
    onAdminDataChange();
    setIsEditAdminOpen(false);
  }

  // --- UNIFIED DATA LOGIC ---
  // Priority: Official HR data > Data from recruitment offer
  const brandNameToDisplay = profile.brandName || application?.brandName;
  const divisionToDisplay = profile.division || application?.jobPosition; // jobPosition as fallback for division
  const supervisorToDisplay = profile.supervisorName;

  const startDateToDisplay = profile.internshipStartDate?.toDate() || application?.contractStartDate?.toDate();
  const endDateToDisplay = profile.internshipEndDate?.toDate() || application?.contractEndDate?.toDate();
  const compensationToDisplay = profile.compensationAmount ?? application?.offeredSalary;
  const notesToDisplay = profile.hrdNotes || application?.offerNotes;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b flex-row items-center justify-between">
            <div>
              <DialogTitle>Detail Profil Magang: {profile.fullName}</DialogTitle>
              <DialogDescription>{profile.email}</DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditAdminOpen(true)}><Edit className="mr-2 h-4 w-4"/> Edit Data Administrasi</Button>
          </DialogHeader>
          <ScrollArea className="flex-grow pr-6 -mr-6 pl-6">
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
                  <InfoRow label="Tipe Magang" value={profile.internSubtype === 'intern_education' ? 'Terikat Pendidikan' : 'Pra-Probation'} />
                  <InfoRow label="Tipe Pekerja" value={profile.employmentType} />
                  <InfoRow label="Penempatan Brand" value={brandNameToDisplay} />
                  <InfoRow label="Divisi" value={divisionToDisplay} />
                  <InfoRow label="Supervisor / PIC" value={supervisorToDisplay} />
                </dl>
              </div>
               
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Detail Kontrak & Kompensasi</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingApplication ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <dl className="space-y-1 text-sm">
                      <InfoRow label="Uang Saku / Kompensasi" value={compensationToDisplay ? `Rp ${compensationToDisplay.toLocaleString('id-ID')}` : 'Belum diatur'} />
                      <InfoRow label="Tanggal Mulai Magang" value={startDateToDisplay ? format(startDateToDisplay, 'dd MMMM yyyy', { locale: id }) : 'Belum diatur'} />
                      <InfoRow label="Tanggal Selesai Magang" value={endDateToDisplay ? format(endDateToDisplay, 'dd MMMM yyyy', { locale: id }) : 'Belum diatur'} />
                      {notesToDisplay && <InfoRow label="Catatan Tambahan" value={notesToDisplay} />}
                    </dl>
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
            </div>
          </ScrollArea>
          <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isEditAdminOpen && (
        <InternAdminDataFormDialog
            open={isEditAdminOpen}
            onOpenChange={setIsEditAdminOpen}
            profile={profile}
            application={application}
            onSuccess={handleAdminFormSuccess}
        />
      )}
    </>
  );
}
