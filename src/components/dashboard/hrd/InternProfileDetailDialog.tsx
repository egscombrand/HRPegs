'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { EmployeeProfile } from '@/lib/types';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
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
                <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace || ''}, ${profile.birthDate || ''}`} />
              </dl>
            </div>
            
            <Separator />

            <div>
                <SectionTitle>Status Magang</SectionTitle>
                <dl className="space-y-1">
                    <InfoRow label="Sub-tipe Magang" value={profile.internSubtype} />
                    <InfoRow label="Asal Sekolah/Kampus" value={profile.schoolOrCampus} />
                    <InfoRow label="Jurusan" value={profile.major} />
                    <InfoRow label="Jenjang Pendidikan" value={profile.educationLevel} />
                    <InfoRow label="Perkiraan Selesai" value={profile.expectedEndDate} />
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
                    {!profile.documents && <p className="text-sm text-muted-foreground">Tidak ada dokumen yang diunggah.</p>}
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
