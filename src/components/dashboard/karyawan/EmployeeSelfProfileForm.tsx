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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
  nickName: z.string().min(1, "Nama panggilan harus diisi."),
  phone: z.string().min(10, "Nomor telepon tidak valid."),
  gender: z.enum(["Laki-laki", "Perempuan", "Lainnya"]),
  birthPlace: z.string().min(2, "Tempat lahir harus diisi."),
  birthDate: z
    .string()
    .refine((val) => val, { message: "Tanggal lahir harus diisi." }),
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
      nickName: "",
      phone: "",
      gender: "Laki-laki",
      birthPlace: "",
      birthDate: "",
      addressCurrent: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolderName: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
    },
  });

  useEffect(() => {
    const birthDate = initialProfile.birthDate
      ? parseDateValue(initialProfile.birthDate)
      : null;
    const formattedBirthDate = birthDate ? format(birthDate, "yyyy-MM-dd") : "";

    form.reset({
      nickName: initialProfile.nickName || "",
      phone: initialProfile.phone || "",
      gender: initialProfile.gender || "Laki-laki",
      birthPlace: initialProfile.birthPlace || "",
      birthDate: formattedBirthDate,
      addressCurrent: initialProfile.addressCurrent || "",
      bankName: initialProfile.bankName || "",
      bankAccountNumber: initialProfile.bankAccountNumber || "",
      bankAccountHolderName: initialProfile.bankAccountHolderName || "",
      emergencyContactName: initialProfile.emergencyContactName || "",
      emergencyContactRelation: initialProfile.emergencyContactRelation || "",
      emergencyContactPhone: initialProfile.emergencyContactPhone || "",
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

      batch.update(userRef, { isProfileComplete: true });

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
