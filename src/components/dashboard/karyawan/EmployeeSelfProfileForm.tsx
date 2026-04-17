"use client";

import { useEffect, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, setDocumentNonBlocking } from "@/firebase";
import {
  doc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Undo } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { EmployeeProfile, Address } from "@/lib/types";
import { format } from "date-fns";
import { parseDateValue } from "@/lib/utils";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const selfFormSchema = z.object({
  fullName: z.string().min(2, "Nama lengkap harus diisi."),
  nickName: z.string().min(1, "Nama panggilan harus diisi."),
  personalEmail: z
    .string()
    .optional()
    .refine((value) => !value || /^\S+@\S+\.\S+$/.test(value), {
      message: "Email pribadi tidak valid.",
    }),
  phone: z.string().min(10, "Nomor telepon tidak valid."),
  gender: z.enum(["Laki-laki", "Perempuan", "Lainnya"]),
  birthPlace: z.string().min(2, "Tempat lahir harus diisi."),
  birthDate: z
    .string()
    .refine((val) => val, { message: "Tanggal lahir harus diisi." }),
  maritalStatus: z
    .enum(["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"])
    .optional(),
  religion: z.string().optional(),
  nationality: z.string().optional(),
  profilePhotoUrl: z.string().optional().url("URL foto profil tidak valid."),
  addressKtp: z
    .object({
      street: z.string().optional(),
      rt: z.string().optional(),
      rw: z.string().optional(),
      village: z.string().optional(),
      district: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
  nik: z.string().optional(),
  ktpPhotoUrl: z.string().optional().url("URL foto KTP tidak valid."),
  simNumber: z.string().optional(),
  simPhotoUrl: z.string().optional().url("URL foto SIM tidak valid."),
  npwp: z.string().optional(),
  npwpPhotoUrl: z.string().optional().url("URL dokumen NPWP tidak valid."),
  bpjsKesehatan: z.string().optional(),
  bpjsKetenagakerjaan: z.string().optional(),
  bankDocumentUrl: z.string().optional().url("URL bukti rekening tidak valid."),
  addressCurrent: z.string().min(10, "Alamat domisili harus diisi."),

  // Bank
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountHolderName: z.string().optional(),

  // Kontak Darurat
  emergencyContactName: z.string().min(2, "Nama kontak darurat harus diisi."),
  emergencyContactRelation: z
    .string()
    .min(2, "Hubungan kontak darurat harus diisi."),
  emergencyContactPhone: z
    .string()
    .min(10, "Nomor telepon darurat tidak valid."),
  emergencyContactAddress: z.string().optional(),
});

type FormValues = z.infer<typeof selfFormSchema>;

interface EmployeeSelfProfileFormProps {
  initialProfile: Partial<EmployeeProfile>;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

const INDONESIAN_BANKS = [
  "Bank Central Asia (BCA)",
  "Bank Mandiri",
  "Bank Rakyat Indonesia (BRI)",
  "Bank Negara Indonesia (BNI)",
  "Bank Tabungan Negara (BTN)",
  "CIMB Niaga",
  "Bank Syariah Indonesia (BSI)",
  "Bank Danamon",
  "PermataBank",
  "OCBC NISP",
  "Panin Bank",
  "Bank BTPN",
  "Maybank Indonesia",
  "Bank Sinarmas",
  "Bank Muamalat",
];

export function EmployeeSelfProfileForm({
  initialProfile,
  onSaveSuccess,
  onCancel,
}: EmployeeSelfProfileFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { firebaseUser, refreshUserProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(selfFormSchema),
    defaultValues: {
      fullName: "",
      nickName: "",
      personalEmail: "",
      phone: "",
      gender: "Laki-laki",
      birthPlace: "",
      birthDate: "",
      maritalStatus: "Belum Kawin",
      religion: "",
      nationality: "",
      profilePhotoUrl: "",
      addressKtp: {
        street: "",
        rt: "",
        rw: "",
        village: "",
        district: "",
        city: "",
        province: "",
        postalCode: "",
      },
      nik: "",
      ktpPhotoUrl: "",
      simNumber: "",
      simPhotoUrl: "",
      npwp: "",
      npwpPhotoUrl: "",
      bpjsKesehatan: "",
      bpjsKetenagakerjaan: "",
      bankDocumentUrl: "",
      addressCurrent: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolderName: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
      emergencyContactAddress: "",
    },
  });

  useEffect(() => {
    const birthDate = initialProfile.birthDate
      ? parseDateValue(initialProfile.birthDate)
      : null;
    const formattedBirthDate = birthDate ? format(birthDate, "yyyy-MM-dd") : "";

    form.reset({
      fullName: initialProfile.fullName || "",
      nickName: initialProfile.nickName || "",
      personalEmail: initialProfile.personalEmail || "",
      phone: initialProfile.phone || "",
      gender: initialProfile.gender || "Laki-laki",
      birthPlace: initialProfile.birthPlace || "",
      birthDate: formattedBirthDate,
      maritalStatus: initialProfile.maritalStatus || "Belum Kawin",
      religion: initialProfile.religion || "",
      nationality: initialProfile.nationality || "",
      profilePhotoUrl: initialProfile.profilePhotoUrl || "",
      addressKtp: {
        street: initialProfile.addressKtp?.street || "",
        rt: initialProfile.addressKtp?.rt || "",
        rw: initialProfile.addressKtp?.rw || "",
        village: initialProfile.addressKtp?.village || "",
        district: initialProfile.addressKtp?.district || "",
        city: initialProfile.addressKtp?.city || "",
        province: initialProfile.addressKtp?.province || "",
        postalCode: initialProfile.addressKtp?.postalCode || "",
      },
      nik: initialProfile.nik || "",
      ktpPhotoUrl: initialProfile.ktpPhotoUrl || "",
      simNumber: initialProfile.simNumber || "",
      simPhotoUrl: initialProfile.simPhotoUrl || "",
      npwp: initialProfile.npwp || "",
      npwpPhotoUrl: initialProfile.npwpPhotoUrl || "",
      bpjsKesehatan: initialProfile.bpjsKesehatan || "",
      bpjsKetenagakerjaan: initialProfile.bpjsKetenagakerjaan || "",
      bankDocumentUrl: initialProfile.bankDocumentUrl || "",
      isDomicileSameAsKtp: initialProfile.isDomicileSameAsKtp || false,
      addressCurrent: initialProfile.addressCurrent || "",
      bankName: initialProfile.bankName || "",
      bankAccountNumber: initialProfile.bankAccountNumber || "",
      bankAccountHolderName: initialProfile.bankAccountHolderName || "",
      npwp: initialProfile.npwp || "",
      bpjsKesehatan: initialProfile.bpjsKesehatan || "",
      bpjsKetenagakerjaan: initialProfile.bpjsKetenagakerjaan || "",
      emergencyContactName: initialProfile.emergencyContactName || "",
      emergencyContactRelation: initialProfile.emergencyContactRelation || "",
      emergencyContactPhone: initialProfile.emergencyContactPhone || "",
      emergencyContactAddress: initialProfile.emergencyContactAddress || "",
    });
  }, [initialProfile, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Authentication not found.",
      });
      return;
    }
    setIsSaving(true);
    try {
      const batch = writeBatch(firestore);
      const employeeProfileRef = doc(
        firestore,
        "employee_profiles",
        firebaseUser.uid,
      );
      const userRef = doc(firestore, "users", firebaseUser.uid);

      const employeePayload: Partial<EmployeeProfile> = {
        ...values,
        updatedAt: serverTimestamp(),
        completeness: {
          isComplete: true,
          completedAt: serverTimestamp(),
        },
      };
      batch.set(employeeProfileRef, employeePayload, { merge: true });

      batch.update(userRef, {
        isProfileComplete: true,
        fullName: values.fullName,
      });

      await batch.commit();

      toast({
        title: "Profil Diperbarui",
        description: "Data diri Anda telah berhasil disimpan.",
      });
      refreshUserProfile();
      onSaveSuccess();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Profil",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const onInvalid: (errors: FieldErrors<FormValues>) => void = (errors) => {
    console.error("Form validation errors:", errors);
    const firstErrorKey = Object.keys(errors)[0] as
      | keyof FormValues
      | undefined;
    if (firstErrorKey) {
      const readableFieldName = firstErrorKey
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase());
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: `Harap periksa kembali isian Anda. Kolom "${readableFieldName}" sepertinya belum valid.`,
      });
      (form.setFocus as any)(firstErrorKey);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Data Diri Anda</CardTitle>
        <CardDescription>
          Lengkapi atau perbarui informasi pribadi Anda. Kolom dengan tanda{" "}
          <span className="text-destructive">*</span> adalah wajib diisi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            id="employee-self-form"
            onSubmit={form.handleSubmit(handleSubmit, onInvalid)}
            className="space-y-8"
          >
            <section>
              <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                Identitas Pribadi
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Lengkap*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nickName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Panggilan*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="personalEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Pribadi</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profilePhotoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Foto Profil</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription>
                        Link gambar profil untuk ditampilkan di dashboard.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Telepon*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthPlace"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tempat Lahir*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maritalStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status Pernikahan</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Belum Kawin">
                              Belum Kawin
                            </SelectItem>
                            <SelectItem value="Kawin">Kawin</SelectItem>
                            <SelectItem value="Cerai Hidup">
                              Cerai Hidup
                            </SelectItem>
                            <SelectItem value="Cerai Mati">
                              Cerai Mati
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="religion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agama</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kewarganegaraan</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tanggal Lahir*</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jenis Kelamin*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Laki-laki">Laki-laki</SelectItem>
                          <SelectItem value="Perempuan">Perempuan</SelectItem>
                          <SelectItem value="Lainnya">Lainnya</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                Alamat KTP
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="addressKtp.street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jalan / Nama Jalan</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.rt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RT</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.rw"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RW</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.village"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desa / Kelurahan</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kecamatan</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kabupaten / Kota</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provinsi</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressKtp.postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kode Pos</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                Dokumen Identitas & Administrasi
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nik"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIK / Nomor KTP</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ktpPhotoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Foto KTP</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="simNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor SIM</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="simPhotoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Foto SIM</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="npwpPhotoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Bukti NPWP</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankDocumentUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Bukti Rekening</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                Alamat Domisili
              </h3>
              <FormField
                control={form.control}
                name="addressCurrent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alamat Lengkap Domisili*</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Contoh: Jl. Anggrek No. 123, RT 01/RW 02, Caturtunggal, Depok, Sleman, Yogyakarta 55281"
                        value={field.value ?? ""}
                        rows={4}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isDomicileSameAsKtp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">
                        Alamat domisili sama dengan KTP
                      </FormLabel>
                      <FormDescription>
                        Jika dipilih, alamat domisili akan dianggap sama dengan
                        alamat KTP.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                Informasi Finansial (Uang Saku)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Bank</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih bank" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDONESIAN_BANKS.map((bank) => (
                            <SelectItem key={bank} value={bank}>
                              {bank}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankAccountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Rekening</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankAccountHolderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Pemilik Rekening</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="npwp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NPWP</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bpjsKesehatan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>No. BPJS Kesehatan</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bpjsKetenagakerjaan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>No. BPJS Ketenagakerjaan</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 mb-4">
                Kontak Darurat
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="emergencyContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyContactRelation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hubungan*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telepon*</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="emergencyContactAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alamat Kontak Darurat</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Alamat lengkap kontak darurat"
                        value={field.value ?? ""}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost" onClick={onCancel}>
          <Undo className="mr-2 h-4 w-4" /> Batal
        </Button>
        <Button type="submit" form="employee-self-form" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" /> Simpan Perubahan
        </Button>
      </CardFooter>
    </Card>
  );
}
