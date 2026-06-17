"use client";

import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Loader2 } from "lucide-react";
import { Textarea } from "../ui/textarea";
import type { Profile, Address } from "@/lib/types";
import { Timestamp, serverTimestamp } from "firebase/firestore";
import { GoogleDatePicker } from "../ui/google-date-picker";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Checkbox } from "../ui/checkbox";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { parseDateValue } from "@/lib/utils";
import { useFirestore, setDocumentNonBlocking } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { doc } from "firebase/firestore";
import {
  RegionCascadeSelect,
  type RegionValue,
  emptyRegionValue,
} from "./RegionCascadeSelect";

// ── Zod schema ──────────────────────────────────────────────────────────────

const addressRegionSchema = z.object({
  provinceCode: z.string().min(1, "Provinsi harus dipilih."),
  provinceName: z.string().min(1, "Provinsi harus dipilih."),
  regencyCode: z.string().min(1, "Kota/Kabupaten harus dipilih."),
  regencyName: z.string().min(1, "Kota/Kabupaten harus dipilih."),
  districtCode: z.string().min(1, "Kecamatan harus dipilih."),
  districtName: z.string().min(1, "Kecamatan harus dipilih."),
  villageCode: z.string().min(1, "Kelurahan/Desa harus dipilih."),
  villageName: z.string().min(1, "Kelurahan/Desa harus dipilih."),
  street: z.string().min(5, "Alamat jalan harus diisi (min 5 karakter)."),
  rt: z
    .string()
    .regex(/^\d{1,3}$/, "RT hanya angka, maks 3 digit.")
    .min(1, "RT harus diisi."),
  rw: z
    .string()
    .regex(/^\d{1,3}$/, "RW hanya angka, maks 3 digit.")
    .min(1, "RW harus diisi."),
  postalCode: z.string().regex(/^\d{5}$/, "Kode Pos harus 5 digit angka."),
});

const personalDataSchema = z
  .object({
    fullName: z.string().min(2, { message: "Nama lengkap harus diisi." }),
    nickname: z.string().min(1, { message: "Nama panggilan harus diisi." }),
    email: z.string().email({ message: "Email tidak valid." }),
    phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
    eKtpNumber: z
      .string()
      .length(16, { message: "Nomor e-KTP harus 16 digit." }),
    gender: z.enum(["Laki-laki", "Perempuan"], {
      required_error: "Jenis kelamin harus dipilih.",
    }),
    birthPlace: z.string().min(2, { message: "Tempat lahir harus diisi." }),
    birthDate: z.coerce.date({ required_error: "Tanggal lahir harus diisi." }),
    addressKtp: addressRegionSchema,
    isDomicileSameAsKtp: z.boolean().default(true),
    addressDomicile: addressRegionSchema.partial().optional(),
    hasNpwp: z.boolean().default(false),
    npwpNumber: z.string().optional().or(z.literal("")),
    willingToWfo: z.enum(["ya", "tidak"], {
      required_error: "Pilihan ini harus diisi.",
    }),
    linkedinUrl: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url({ message: "URL LinkedIn tidak valid." }).optional(),
    ),
    websiteUrl: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z
        .string()
        .url({ message: "URL Website/Portfolio tidak valid." })
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.isDomicileSameAsKtp) {
      const result = addressRegionSchema.safeParse(data.addressDomicile);
      if (!result.success) {
        result.error.errors.forEach((e) => {
          ctx.addIssue({ ...e, path: ["addressDomicile", ...e.path] });
        });
      }
    }
    if (data.hasNpwp) {
      const digits = data.npwpNumber?.replace(/[\.\-]/g, "");
      if (!digits || (digits.length !== 15 && digits.length !== 16)) {
        ctx.addIssue({
          path: ["npwpNumber"],
          message: "NPWP tidak valid. Harap masukkan 15 atau 16 digit.",
          code: "custom",
        });
      }
    }
  });

type FormValues = z.infer<typeof personalDataSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

interface PersonalDataFormProps {
  initialData: Partial<Profile>;
  onSaveSuccess: () => void;
}

const addressDefaultValues = {
  provinceCode: "",
  provinceName: "",
  regencyCode: "",
  regencyName: "",
  districtCode: "",
  districtName: "",
  villageCode: "",
  villageName: "",
  street: "",
  rt: "",
  rw: "",
  postalCode: "",
};

function getAddressFormValues(raw: any): typeof addressDefaultValues {
  if (!raw) return { ...addressDefaultValues };
  if (typeof raw === "string") return { ...addressDefaultValues, street: raw };
  return {
    provinceCode: raw.provinceCode || "",
    provinceName: raw.provinceName || raw.province || "",
    regencyCode: raw.regencyCode || "",
    regencyName: raw.regencyName || raw.city || "",
    districtCode: raw.districtCode || "",
    districtName: raw.districtName || raw.district || "",
    villageCode: raw.villageCode || "",
    villageName: raw.villageName || raw.village || "",
    street: raw.street || "",
    rt: raw.rt || "",
    rw: raw.rw || "",
    postalCode: raw.postalCode || "",
  };
}

function regionFromFormAddress(addr: typeof addressDefaultValues): RegionValue {
  return {
    provinceCode: addr.provinceCode,
    provinceName: addr.provinceName,
    regencyCode: addr.regencyCode,
    regencyName: addr.regencyName,
    districtCode: addr.districtCode,
    districtName: addr.districtName,
    villageCode: addr.villageCode,
    villageName: addr.villageName,
  };
}

// ── AddressSection sub-component ────────────────────────────────────────────

interface AddressSectionProps {
  prefix: "addressKtp" | "addressDomicile";
  form: ReturnType<typeof useForm<FormValues>>;
  disabled?: boolean;
}

function AddressSection({ prefix, form, disabled }: AddressSectionProps) {
  const addr = form.watch(prefix) as typeof addressDefaultValues | undefined;
  const errors = (form.formState.errors as any)[prefix];

  const regionValue: RegionValue = addr
    ? regionFromFormAddress(addr as typeof addressDefaultValues)
    : emptyRegionValue;

  const handleRegionChange = (region: RegionValue) => {
    // Validate only the field that now has a value (so existing errors clear if fixed).
    // For fields that were reset to '' (downstream cascades), clear errors instead of
    // validating — avoids showing "harus dipilih" before user has a chance to choose.
    form.setValue(`${prefix}.provinceCode` as any, region.provinceCode, {
      shouldValidate: !!region.provinceCode,
    });
    form.setValue(`${prefix}.provinceName` as any, region.provinceName);

    form.setValue(`${prefix}.regencyCode` as any, region.regencyCode, {
      shouldValidate: !!region.regencyCode,
    });
    form.setValue(`${prefix}.regencyName` as any, region.regencyName);
    if (!region.regencyCode) form.clearErrors(`${prefix}.regencyCode` as any);

    form.setValue(`${prefix}.districtCode` as any, region.districtCode, {
      shouldValidate: !!region.districtCode,
    });
    form.setValue(`${prefix}.districtName` as any, region.districtName);
    if (!region.districtCode) form.clearErrors(`${prefix}.districtCode` as any);

    form.setValue(`${prefix}.villageCode` as any, region.villageCode, {
      shouldValidate: !!region.villageCode,
    });
    form.setValue(`${prefix}.villageName` as any, region.villageName);
    if (!region.villageCode) form.clearErrors(`${prefix}.villageCode` as any);
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      {/* Region dropdowns */}
      <RegionCascadeSelect
        value={regionValue}
        onChange={handleRegionChange}
        disabled={disabled}
        errors={{
          province: errors?.provinceCode?.message,
          regency: errors?.regencyCode?.message,
          district: errors?.districtCode?.message,
          village: errors?.villageCode?.message,
        }}
      />

      {/* Manual fields */}
      <FormField
        control={form.control}
        name={`${prefix}.street` as any}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Jalan / Detail Alamat <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ""}
                placeholder="Nama jalan, nomor rumah, RT/RW, dll..."
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name={`${prefix}.rt` as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                RT <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="001"
                  maxLength={3}
                  {...field}
                  value={field.value ?? ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                    field.onChange(v);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`${prefix}.rw` as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                RW <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="002"
                  maxLength={3}
                  {...field}
                  value={field.value ?? ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                    field.onChange(v);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`${prefix}.postalCode` as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Kode Pos <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="55281"
                  maxLength={5}
                  {...field}
                  value={field.value ?? ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                    field.onChange(v);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

// ── Main Form ────────────────────────────────────────────────────────────────

export function PersonalDataForm({
  initialData,
  onSaveSuccess,
}: PersonalDataFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(personalDataSchema),
    defaultValues: {
      fullName: initialData.fullName || "",
      nickname: initialData.nickname || "",
      email: initialData.email || "",
      phone: initialData.phone || (initialData as any).whatsappNumber || (initialData as any).noTelp || (initialData as any).mobileNumber || "",
      eKtpNumber: initialData.eKtpNumber || "",
      gender: initialData.gender,
      birthPlace: initialData.birthPlace || "",
      birthDate: parseDateValue(initialData.birthDate) || undefined,
      addressKtp: getAddressFormValues(initialData.addressKtp),
      isDomicileSameAsKtp: initialData.isDomicileSameAsKtp ?? true,
      addressDomicile: getAddressFormValues(initialData.addressDomicile),
      hasNpwp: initialData.hasNpwp || false,
      npwpNumber: initialData.npwpNumber || "",
      willingToWfo:
        initialData.willingToWfo === true
          ? "ya"
          : initialData.willingToWfo === false
            ? "tidak"
            : undefined,
      linkedinUrl: initialData.linkedinUrl || "",
      websiteUrl: initialData.websiteUrl || "",
    },
  });

  const isDomicileSameAsKtp = form.watch("isDomicileSameAsKtp");
  const hasNpwp = form.watch("hasNpwp");
  const addressKtp = form.watch("addressKtp");

  // Auto-sync domicile when "same as KTP" is checked
  useEffect(() => {
    if (isDomicileSameAsKtp && addressKtp) {
      form.setValue("addressDomicile", addressKtp as any, {
        shouldValidate: false,
      });
    }
  }, [isDomicileSameAsKtp, addressKtp, form]);

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    console.error("Form validation errors:", errors);
    const firstKey = Object.keys(errors)[0] as keyof FormValues | undefined;
    if (firstKey) {
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: `Harap periksa kembali isian Anda. Ada kolom yang belum lengkap atau tidak valid.`,
      });
    }
  };

  const cleanUndefined = (val: any): any => {
    if (val === undefined) return null;
    if (val === null) return null;
    if (Array.isArray(val)) return val.map(cleanUndefined).filter((v) => v !== undefined);
    if (typeof val === "object") {
      return Object.fromEntries(
        Object.entries(val)
          .map(([k, v]) => [k, cleanUndefined(v)])
          .filter(([, v]) => v !== undefined),
      );
    }
    return val;
  };

  const buildAddress = (addr: typeof addressDefaultValues): Address => ({
    street: addr.street || "",
    rt: addr.rt || "",
    rw: addr.rw || "",
    postalCode: addr.postalCode || "",
    // New structured region
    provinceCode: addr.provinceCode || "",
    provinceName: addr.provinceName || "",
    regencyCode: addr.regencyCode || "",
    regencyName: addr.regencyName || "",
    districtCode: addr.districtCode || "",
    districtName: addr.districtName || "",
    villageCode: addr.villageCode || "",
    villageName: addr.villageName || "",
    // Legacy backward-compat aliases
    province: addr.provinceName || "",
    city: addr.regencyName || "",
    district: addr.districtName || "",
    village: addr.villageName || "",
  });

  const handleSubmit = async (values: FormValues) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to save your profile.",
      });
      return;
    }
    setIsSaving(true);
    try {
      const ktpAddr = buildAddress(values.addressKtp as typeof addressDefaultValues);
      const domicileAddr = values.isDomicileSameAsKtp
        ? ktpAddr
        : buildAddress(values.addressDomicile as typeof addressDefaultValues);

      const { willingToWfo, addressKtp: _ktp, addressDomicile: _dom, ...rest } = values;
      const dataToSave: Partial<Profile> = {
        ...rest,
        willingToWfo: willingToWfo === "ya",
        birthDate: Timestamp.fromDate(values.birthDate!),
        addressKtp: ktpAddr,
        addressDomicile: domicileAddr,
        isDomicileSameAsKtp: values.isDomicileSameAsKtp,
        // Keep whatsappNumber in sync with phone so both fields are consistent
        whatsappNumber: values.phone || "",
        profileStatus: "draft",
        profileStep: 2,
        updatedAt: serverTimestamp() as Timestamp,
      };

      const clean = cleanUndefined(dataToSave);
      const profileDocRef = doc(firestore, "profiles", firebaseUser.uid);
      await setDocumentNonBlocking(profileDocRef, clean, { merge: true });

      toast({
        title: "Data Pribadi Disimpan",
        description: "Melanjutkan ke langkah berikutnya...",
      });
      onSaveSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informasi Pribadi</CardTitle>
        <CardDescription>
          Pastikan semua data yang Anda masukkan sudah benar. Kolom dengan tanda{" "}
          <span className="text-destructive">*</span> wajib diisi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit, onInvalid)}
            className="space-y-8"
          >
            {/* ── Data Diri ── */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold tracking-tight border-b pb-2">
                Data Diri
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Nama Lengkap <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Nama Panggilan <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Email <span className="text-destructive">*</span>
                      </FormLabel>
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
                      <FormLabel>
                        Nomor Telepon <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="0812..."
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="birthPlace"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Tempat Lahir <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Kota lahir"
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
                  name="birthDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        Tanggal Lahir <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <GoogleDatePicker
                          mode="dob"
                          value={field.value || null}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="eKtpNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Nomor e-KTP <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          maxLength={16}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value.replace(/\D/g, "").slice(0, 16))
                          }
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
                      <FormLabel>
                        Jenis Kelamin <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                          className="flex items-center space-x-4 pt-2"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="Laki-laki" />
                            </FormControl>
                            <FormLabel className="font-normal">Laki-laki</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="Perempuan" />
                            </FormControl>
                            <FormLabel className="font-normal">Perempuan</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Alamat ── */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold tracking-tight border-b pb-2">
                Alamat
              </h3>

              {/* KTP Address */}
              <div className="space-y-3">
                <FormLabel className="text-base font-semibold">
                  Alamat Sesuai KTP <span className="text-destructive">*</span>
                </FormLabel>
                <AddressSection prefix="addressKtp" form={form} />
              </div>

              {/* Same as KTP checkbox */}
              <FormField
                control={form.control}
                name="isDomicileSameAsKtp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      Alamat domisili sama dengan alamat KTP
                    </FormLabel>
                  </FormItem>
                )}
              />

              {/* Domicile Address */}
              <div className="space-y-3">
                <FormLabel className="text-base font-semibold">
                  Alamat Domisili <span className="text-destructive">*</span>
                </FormLabel>
                {isDomicileSameAsKtp ? (
                  <p className="text-sm text-muted-foreground italic">
                    Alamat domisili mengikuti alamat KTP.
                  </p>
                ) : (
                  <AddressSection
                    prefix="addressDomicile"
                    form={form}
                    disabled={false}
                  />
                )}
              </div>
            </div>

            {/* ── Informasi Tambahan ── */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold tracking-tight border-b pb-2">
                Informasi Tambahan
              </h3>
              <FormField
                control={form.control}
                name="hasNpwp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      Saya memiliki NPWP
                    </FormLabel>
                  </FormItem>
                )}
              />
              {hasNpwp && (
                <FormField
                  control={form.control}
                  name="npwpNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Nomor NPWP <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Masukkan nomor NPWP Anda"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="willingToWfo"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>
                      Apakah Anda bersedia Work From Office (WFO)?{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="ya" />
                          </FormControl>
                          <FormLabel className="font-normal">Ya</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="tidak" />
                          </FormControl>
                          <FormLabel className="font-normal">Tidak</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="linkedinUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profil LinkedIn (Opsional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="https://linkedin.com/in/..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="websiteUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Situs Web/Portofolio (Opsional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="https://github.com/..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan & Lanjut
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
