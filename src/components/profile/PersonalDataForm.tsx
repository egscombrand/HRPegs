'use client';

import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { Profile, Address } from '@/lib/types';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { GoogleDatePicker } from '../ui/google-date-picker';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Checkbox } from '../ui/checkbox';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc } from 'firebase/firestore';

const addressObjectSchema = z.object({
    street: z.string().min(5, "Alamat jalan harus diisi."),
    rt: z.string().min(1, "RT harus diisi."),
    rw: z.string().min(1, "RW harus diisi."),
    village: z.string().min(2, "Kelurahan/Desa harus diisi."),
    district: z.string().min(2, "Kecamatan harus diisi."),
    city: z.string().min(2, "Kota/Kabupaten harus diisi."),
    province: z.string().min(2, "Provinsi harus diisi."),
    postalCode: z.string().min(5, "Kode Pos harus diisi."),
});

const personalDataSchema = z.object({
    fullName: z.string().min(2, { message: "Nama lengkap harus diisi." }),
    nickname: z.string().min(1, { message: "Nama panggilan harus diisi." }),
    email: z.string().email({ message: "Email tidak valid." }),
    phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
    eKtpNumber: z.string().length(16, { message: "Nomor e-KTP harus 16 digit." }),
    gender: z.enum(['Laki-laki', 'Perempuan'], { required_error: "Jenis kelamin harus dipilih." }),
    birthPlace: z.string().min(2, { message: "Tempat lahir harus diisi." }),
    birthDate: z.coerce.date({ required_error: 'Tanggal lahir harus diisi.'}),
    addressKtp: addressObjectSchema,
    isDomicileSameAsKtp: z.boolean().default(true),
    addressDomicile: addressObjectSchema.deepPartial().optional(),
    hasNpwp: z.boolean().default(false),
    npwpNumber: z.string().optional().or(z.literal('')),
    willingToWfo: z.enum(['ya', 'tidak'], { required_error: 'Pilihan ini harus diisi.' }),
    linkedinUrl: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "") ? undefined : v,
      z.string().url({ message: "URL LinkedIn tidak valid." }).optional()
    ),
    websiteUrl: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "") ? undefined : v,
      z.string().url({ message: "URL Website/Portfolio tidak valid." }).optional()
    ),
}).superRefine((data, ctx) => {
    if (!data.isDomicileSameAsKtp) {
        const domicileResult = addressObjectSchema.safeParse(data.addressDomicile);
        if (!domicileResult.success) {
            domicileResult.error.errors.forEach((error) => {
                ctx.addIssue({
                    ...error,
                    path: ['addressDomicile', ...error.path],
                });
            });
        }
    }
    if (data.hasNpwp) {
        const npwpDigits = data.npwpNumber?.replace(/[\.\-]/g, '');
        if (!npwpDigits || (npwpDigits.length !== 15 && npwpDigits.length !== 16)) {
             ctx.addIssue({
                path: ["npwpNumber"],
                message: "NPWP tidak valid. Harap masukkan 15 atau 16 digit.",
                code: 'custom'
            });
        }
    }
});


type FormValues = z.infer<typeof personalDataSchema>;

interface PersonalDataFormProps {
    initialData: Partial<Profile>;
    onSaveSuccess: () => void;
}

const addressDefaultValues: Address = {
    street: '', rt: '', rw: '', village: '', district: '', city: '', province: '', postalCode: '',
};

const getAddressObject = (address: any): Address => {
    if (typeof address === 'string') return { ...addressDefaultValues, street: address };
    return address ? { ...addressDefaultValues, ...address } : addressDefaultValues;
};

export function PersonalDataForm({ initialData, onSaveSuccess }: PersonalDataFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(personalDataSchema),
        defaultValues: {
            fullName: initialData.fullName || '',
            nickname: initialData.nickname || '',
            email: initialData.email || '',
            phone: initialData.phone || '',
            eKtpNumber: initialData.eKtpNumber || '',
            gender: initialData.gender,
            birthPlace: initialData.birthPlace || '',
            birthDate: initialData.birthDate instanceof Timestamp ? initialData.birthDate.toDate() : undefined,
            addressKtp: getAddressObject(initialData.addressKtp),
            isDomicileSameAsKtp: initialData.isDomicileSameAsKtp ?? true,
            addressDomicile: getAddressObject(initialData.addressDomicile),
            hasNpwp: initialData.hasNpwp || false,
            npwpNumber: initialData.npwpNumber || '',
            willingToWfo: initialData.willingToWfo === true ? 'ya' : initialData.willingToWfo === false ? 'tidak' : undefined,
            linkedinUrl: initialData.linkedinUrl || '',
            websiteUrl: initialData.websiteUrl || '',
        },
    });

    const isDomicileSameAsKtp = form.watch('isDomicileSameAsKtp');
    const hasNpwp = form.watch('hasNpwp');
    const addressKtp = form.watch('addressKtp');

    useEffect(() => {
        if (isDomicileSameAsKtp) {
            form.setValue("addressDomicile", addressKtp, { shouldValidate: true });
        }
    }, [isDomicileSameAsKtp, addressKtp, form]);

    const onInvalid = (errors: FieldErrors<FormValues>) => {
        console.error("Form validation errors:", errors);
        const firstErrorKey = Object.keys(errors)[0] as keyof FormValues | undefined;
        if (firstErrorKey) {
            const readableFieldName = firstErrorKey.replace(/([A-Z])/g, ' $1').replace(/\./g, ' -> ').replace(/^./, str => str.toUpperCase());
            toast({
                variant: 'destructive',
                title: 'Validasi Gagal',
                description: `Harap periksa kembali isian Anda. Kolom "${readableFieldName}" sepertinya belum valid.`,
            });
            try {
                form.setFocus(firstErrorKey as any);
            } catch (e) {
                console.warn("Could not set focus on invalid field:", firstErrorKey);
            }
        }
    };

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to save your profile.' });
            return;
        }
        setIsSaving(true);
        try {
            const { willingToWfo, ...restOfValues } = values;
            const dataToSave: Partial<Profile> = {
                ...restOfValues,
                willingToWfo: willingToWfo === 'ya',
                birthDate: Timestamp.fromDate(values.birthDate!),
                addressDomicile: values.isDomicileSameAsKtp ? values.addressKtp : (values.addressDomicile as Address),
                profileStatus: 'draft',
                profileStep: 2,
                updatedAt: serverTimestamp() as Timestamp,
            };

            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            await setDocumentNonBlocking(profileDocRef, dataToSave, { merge: true });
            
            toast({ title: 'Data Pribadi Disimpan', description: 'Melanjutkan ke langkah berikutnya...' });
            onSaveSuccess();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Informasi Pribadi</CardTitle>
                <CardDescription>
                    Pastikan semua data yang Anda masukkan sudah benar.
                    NB: Kolom dengan tanda <span className="text-destructive">*</span> adalah kolom yang wajib diisi.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit, onInvalid)} className="space-y-8">
                        <div className="space-y-6">
                            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Data Diri</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="nickname" render={({ field }) => (<FormItem><FormLabel>Nama Panggilan <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Nomor Telepon <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="0812..." value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="birthPlace" render={({ field }) => (<FormItem><FormLabel>Tempat Lahir <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Kota lahir" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="birthDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Lahir <span className="text-destructive">*</span></FormLabel><FormControl><GoogleDatePicker mode="dob" value={field.value || null} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="eKtpNumber" render={({ field }) => (<FormItem><FormLabel>Nomor e-KTP <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} maxLength={16} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="gender" render={({ field }) => (<FormItem><FormLabel>Jenis Kelamin <span className="text-destructive">*</span></FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex items-center space-x-4 pt-2"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Laki-laki" /></FormControl><FormLabel className="font-normal">Laki-laki</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Perempuan" /></FormControl><FormLabel className="font-normal">Perempuan</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)} />
                            </div>
                        </div>
                        <div className="space-y-6">
                            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Alamat</h3>
                            <div className="space-y-4">
                                <FormLabel>Alamat Sesuai KTP <span className="text-destructive">*</span></FormLabel>
                                <div className="p-4 border rounded-lg space-y-4">
                                    <FormField control={form.control} name="addressKtp.street" render={({ field }) => (<FormItem><FormLabel>Jalan <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} placeholder="Masukkan nama jalan, nomor rumah, dll..." value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <div className="grid grid-cols-2 gap-4"><FormField control={form.control} name="addressKtp.rt" render={({ field }) => (<FormItem><FormLabel>RT <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="001" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="addressKtp.rw" render={({ field }) => (<FormItem><FormLabel>RW <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="002" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /></div>
                                    <FormField control={form.control} name="addressKtp.village" render={({ field }) => (<FormItem><FormLabel>Kelurahan/Desa <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Caturtunggal" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="addressKtp.district" render={({ field }) => (<FormItem><FormLabel>Kecamatan <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Depok" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <div className="grid grid-cols-2 gap-4"><FormField control={form.control} name="addressKtp.city" render={({ field }) => (<FormItem><FormLabel>Kota/Kabupaten <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Sleman" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="addressKtp.province" render={({ field }) => (<FormItem><FormLabel>Provinsi <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="D.I. Yogyakarta" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /></div>
                                    <FormField control={form.control} name="addressKtp.postalCode" render={({ field }) => (<FormItem><FormLabel>Kode Pos <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="55281" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                            </div>
                            <FormField control={form.control} name="isDomicileSameAsKtp" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3 space-y-0"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Alamat domisili sama dengan alamat KTP</FormLabel></div></FormItem>)} />
                            {!isDomicileSameAsKtp && (
                                <div className="space-y-4">
                                    <FormLabel>Alamat Domisili <span className="text-destructive">*</span></FormLabel>
                                    <div className="p-4 border rounded-lg space-y-4">
                                        <FormField control={form.control} name="addressDomicile.street" render={({ field }) => (<FormItem><FormLabel>Jalan <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Masukkan nama jalan, nomor rumah, dll..." /></FormControl><FormMessage /></FormItem>)} />
                                        <div className="grid grid-cols-2 gap-4"><FormField control={form.control} name="addressDomicile.rt" render={({ field }) => (<FormItem><FormLabel>RT <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="001" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="addressDomicile.rw" render={({ field }) => (<FormItem><FormLabel>RW <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="002" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /></div>
                                        <FormField control={form.control} name="addressDomicile.village" render={({ field }) => (<FormItem><FormLabel>Kelurahan/Desa <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Caturtunggal" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="addressDomicile.district" render={({ field }) => (<FormItem><FormLabel>Kecamatan <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Depok" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <div className="grid grid-cols-2 gap-4"><FormField control={form.control} name="addressDomicile.city" render={({ field }) => (<FormItem><FormLabel>Kota/Kabupaten <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Sleman" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="addressDomicile.province" render={({ field }) => (<FormItem><FormLabel>Provinsi <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="D.I. Yogyakarta" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} /></div>
                                        <FormField control={form.control} name="addressDomicile.postalCode" render={({ field }) => (<FormItem><FormLabel>Kode Pos <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="55281" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-6">
                            <h3 className="text-xl font-semibold tracking-tight border-b pb-2">Informasi Tambahan</h3>
                            <FormField control={form.control} name="hasNpwp" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3 space-y-0"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Saya memiliki NPWP</FormLabel></div></FormItem>)} />
                            {hasNpwp && (<FormField control={form.control} name="npwpNumber" render={({ field }) => (<FormItem><FormLabel>Nomor NPWP <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Masukkan nomor NPWP Anda" /></FormControl><FormMessage /></FormItem>)} />)}
                            <FormField
                                control={form.control}
                                name="willingToWfo"
                                render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Apakah Anda bersedia Work From Office (WFO)? <span className="text-destructive">*</span></FormLabel>
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
                                <FormField control={form.control} name="linkedinUrl" render={({ field }) => (<FormItem><FormLabel>Profil LinkedIn (Opsional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="https://linkedin.com/in/..." /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="websiteUrl" render={({ field }) => (<FormItem><FormLabel>Situs Web/Portofolio (Opsional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="https://github.com/..." /></FormControl><FormMessage /></FormItem>)} />
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
    )
}
