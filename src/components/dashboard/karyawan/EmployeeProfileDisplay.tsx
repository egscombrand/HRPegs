"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit, User, Home, Banknote, ShieldAlert } from "lucide-react";
import type { UserProfile, EmployeeProfile } from "@/lib/types";
import { format } from "date-fns";
import { parseDateValue } from "@/lib/utils";

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
  className?: string;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="text-sm col-span-2 font-semibold">{value || "-"}</dd>
  </div>
);

const SectionTitle = ({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) => (
  <h3 className="text-lg font-semibold tracking-tight flex items-center gap-3 mb-4 text-primary">
    {icon}
    {children}
  </h3>
);

const formatAddress = (address?: {
  street?: string;
  rt?: string;
  rw?: string;
  village?: string;
  district?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}) => {
  if (!address) return "Belum diisi.";
  const parts = [
    address.street,
    address.rt ? `RT ${address.rt}` : undefined,
    address.rw ? `RW ${address.rw}` : undefined,
    address.village,
    address.district,
    address.city,
    address.province,
    address.postalCode,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Belum diisi.";
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
  const isProfileComplete = employeeProfile?.completeness?.isComplete;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">
                {employeeProfile.fullName}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                <span>{employeeProfile.email}</span>
                <span className="hidden sm:inline">•</span>
                <span>{employeeProfile.phone}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={isProfileComplete ? "default" : "secondary"}>
                {isProfileComplete ? "Profil Lengkap" : "Profil Belum Lengkap"}
              </Badge>
              <Button onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" /> Edit Profil
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <SectionTitle icon={<User className="h-5 w-5" />}>
                Identitas Pribadi
              </SectionTitle>
              <CardDescription>
                Dapat diubah oleh Anda melalui tombol "Edit Profil".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow
                label="Nama Panggilan"
                value={employeeProfile.nickName}
              />
              <InfoRow
                label="Email Pribadi"
                value={employeeProfile.personalEmail}
              />
              <InfoRow
                label="Tempat, Tgl Lahir"
                value={`${employeeProfile.birthPlace || "-"}, ${
                  employeeProfile.birthDate
                    ? (() => {
                        const date = parseDateValue(employeeProfile.birthDate);
                        return date
                          ? format(date, "dd MMM yyyy")
                          : "Invalid Date";
                      })()
                    : "-"
                }`}
              />
              <InfoRow
                label="Status Pernikahan"
                value={employeeProfile.maritalStatus}
              />
              <InfoRow label="Jenis Kelamin" value={employeeProfile.gender} />
              <InfoRow label="Agama" value={employeeProfile.religion} />
              <InfoRow
                label="Kewarganegaraan"
                value={employeeProfile.nationality}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionTitle icon={<ShieldAlert className="h-5 w-5" />}>
                Identitas & Dokumen
              </SectionTitle>
              <CardDescription>
                Ringkasan dokumen yang Anda unggah atau sambungkan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="NIK" value={employeeProfile.nik} />
              <InfoRow label="Nomor SIM" value={employeeProfile.simNumber} />
              <InfoRow label="NPWP" value={employeeProfile.npwp} />
              <InfoRow
                label="No. BPJS Kesehatan"
                value={employeeProfile.bpjsKesehatan}
              />
              <InfoRow
                label="No. BPJS Ketenagakerjaan"
                value={employeeProfile.bpjsKetenagakerjaan}
              />
              <InfoRow
                label="URL Foto Profil"
                value={employeeProfile.profilePhotoUrl}
              />
              <InfoRow
                label="URL Foto KTP"
                value={employeeProfile.ktpPhotoUrl}
              />
              <InfoRow
                label="URL Foto SIM"
                value={employeeProfile.simPhotoUrl}
              />
              <InfoRow
                label="URL Bukti NPWP"
                value={employeeProfile.npwpPhotoUrl}
              />
              <InfoRow
                label="URL Bukti Rekening"
                value={employeeProfile.bankDocumentUrl}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 space-y-6">
          <Card>
            <CardHeader>
              <SectionTitle icon={<Home className="h-5 w-5" />}>
                Alamat Domisili
              </SectionTitle>
              <CardDescription>
                Dapat diubah oleh Anda melalui tombol "Edit Profil".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {typeof employeeProfile.addressCurrent === "string"
                  ? employeeProfile.addressCurrent
                  : "Belum diisi."}
              </p>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground">
                <strong>Alamat KTP:</strong>{" "}
                {formatAddress(employeeProfile.addressKtp)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionTitle icon={<Banknote className="h-5 w-5" />}>
                Informasi Finansial
              </SectionTitle>
              <CardDescription>
                Dapat diubah oleh Anda melalui tombol "Edit Profil".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1">
                <InfoRow label="Nama Bank" value={employeeProfile.bankName} />
                <InfoRow
                  label="No. Rekening"
                  value={employeeProfile.bankAccountNumber}
                />
                <InfoRow
                  label="Nama Pemilik"
                  value={employeeProfile.bankAccountHolderName}
                />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionTitle icon={<ShieldAlert className="h-5 w-5" />}>
                Kontak Darurat
              </SectionTitle>
              <CardDescription>
                Dapat diubah oleh Anda melalui tombol "Edit Profil".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow
                label="Nama"
                value={employeeProfile.emergencyContactName}
              />
              <InfoRow
                label="Hubungan"
                value={employeeProfile.emergencyContactRelation}
              />
              <InfoRow
                label="Telepon"
                value={employeeProfile.emergencyContactPhone}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
