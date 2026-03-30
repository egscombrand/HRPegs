'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Edit, User, Home, BookOpen, Briefcase, Sparkles, Building, Info as InfoIcon, File, Banknote, ShieldAlert, FileText } from 'lucide-react';
import type { UserProfile, EmployeeProfile, Address } from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const InfoRow = ({ label, value }: { label: string; value?: string | number | null; className?: string }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5 border-b border-border/50">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2 font-semibold">{value || '-'}</dd>
  </div>
);

const SectionTitle = ({ children, icon }: { children: React.ReactNode, icon: React.ReactNode }) => (
    <h3 className="text-lg font-semibold tracking-tight flex items-center gap-3 mb-4 text-primary">
        {icon}
        {children}
    </h3>
);

const AddressView = ({ title, address }: { title: string; address?: Partial<Address> }) => {
    if (!address || !address.street) return <div className="text-sm text-muted-foreground italic">Belum diisi.</div>;
    return (
         <div className="space-y-1">
            <h4 className="font-semibold text-sm">{title}</h4>
            <div className="text-sm text-muted-foreground">
                <p>{address.street}, RT {address.rt}/RW {address.rw}</p>
                <p>{address.village}, {address.district}</p>
                <p>{address.city}, {address.province} {address.postalCode}</p>
            </div>
        </div>
    )
};


export function EmployeeProfileDisplay({
  employeeProfile,
  userProfile,
  onEdit,
}: {
  employeeProfile: EmployeeProfile;
  userProfile: UserProfile;
  onEdit: () => void;
}) {

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{employeeProfile.fullName}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                <span>{employeeProfile.email}</span>
                <span className="hidden sm:inline">•</span>
                <span>{employeeProfile.phone}</span>
              </CardDescription>
            </div>
            <Button onClick={onEdit}><Edit className="mr-2 h-4 w-4" /> Edit Profil</Button>
          </div>
        </CardHeader>
      </Card>
      
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
            <Card>
                <CardHeader>
                    <SectionTitle icon={<User className="h-5 w-5" />}>Identitas Pribadi</SectionTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Nama Panggilan" value={employeeProfile.nickName} />
                    <InfoRow label="Tempat, Tgl Lahir" value={`${employeeProfile.birthPlace || '-'}, ${employeeProfile.birthDate ? format(new Date(employeeProfile.birthDate), 'dd MMM yyyy', {locale: idLocale}) : '-'}`} />
                    <InfoRow label="Jenis Kelamin" value={employeeProfile.gender} />
                    <InfoRow label="NIK" value={employeeProfile.nik} />
                    <InfoRow label="Status Pernikahan" value={employeeProfile.maritalStatus} />
                    <InfoRow label="Agama" value={employeeProfile.religion} />
                    <div className="pt-4">
                        <AddressView title="Alamat" address={employeeProfile.address} />
                    </div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <SectionTitle icon={<Banknote className="h-5 w-5" />}>Administrasi & Finansial</SectionTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Bank" value={employeeProfile.bankName} />
                    <InfoRow label="No. Rekening" value={employeeProfile.bankAccountNumber} />
                    <InfoRow label="Nama Pemilik Rekening" value={employeeProfile.bankAccountHolderName} />
                    <Separator className="my-4"/>
                    <InfoRow label="NPWP" value={employeeProfile.npwp} />
                    <InfoRow label="BPJS Kesehatan" value={employeeProfile.bpjsKesehatan} />
                    <InfoRow label="BPJS Ketenagakerjaan" value={employeeProfile.bpjsKetenagakerjaan} />
                </CardContent>
            </Card>
        </div>

        <div className="lg:sticky lg:top-24 space-y-6">
             <Card>
                <CardHeader>
                    <SectionTitle icon={<Briefcase className="h-5 w-5" />}>Informasi Kepegawaian</SectionTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Jabatan" value={employeeProfile.positionTitle} />
                    <InfoRow label="Divisi" value={employeeProfile.division} />
                    <InfoRow label="Brand" value={employeeProfile.brandName} />
                    <InfoRow label="Atasan Langsung" value={employeeProfile.managerName} />
                    <Separator className="my-4"/>
                    <InfoRow label="Nomor Induk" value={employeeProfile.employeeNumber} />
                    <InfoRow label="Tanggal Bergabung" value={employeeProfile.joinDate ? format(employeeProfile.joinDate.toDate(), 'dd MMMM yyyy') : '-'} />
                    <InfoRow label="Tipe Karyawan" value={employeeProfile.employmentType} />
                    <InfoRow label="Status" value={employeeProfile.employmentStatus} />
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <SectionTitle icon={<ShieldAlert className="h-5 w-5" />}>Kontak Darurat</SectionTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="Nama" value={employeeProfile.emergencyContactName} />
                    <InfoRow label="Hubungan" value={employeeProfile.emergencyContactRelation} />
                    <InfoRow label="Telepon" value={employeeProfile.emergencyContactPhone} />
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <SectionTitle icon={<FileText className="h-5 w-5" />}>Dokumen</SectionTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">Seksi dokumen sedang dalam pengembangan.</p>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}

    