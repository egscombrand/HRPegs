'use client';

import { useEffect, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Undo } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { EmployeeProfile, Address } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';

const addressObjectSchema = z.object({
    street: z.string().min(5, "Alamat jalan harus diisi.").optional().or(z.literal('')),
    rt: z.string().optional().or(z.literal('')),
    rw: z.string().optional().or(z.literal('')),
    village: z.string().optional().or(z.literal('')),
    district: z.string().optional().or(z.literal('')),
    city: z.string().optional().or(z.literal('')),
    province: z.string().optional().or(z.literal('')),
    postalCode: z.string().optional().or(z.literal('')),
});

const selfFormSchema = z.object({
  nickName: z.string().min(1, "Nama panggilan harus diisi."),
  phone: z.string().min(10, "Nomor telepon tidak valid."),
  gender: z.enum(['Laki-laki', 'Perempuan', 'Lainnya']),
  birthPlace: z.string().min(2, "Tempat lahir harus diisi."),
  birthDate: z.string().refine((val) => val, { message: "Tanggal lahir harus diisi." }),
  nik: z.string().length(16, "NIK harus 16 digit."),
  maritalStatus: z.enum(['Belum Kawin', 'Kawin', 'Cerai Hidup', 'Cerai Mati']),
  religion: z.string().min(3, "Agama harus diisi."),
  address: addressObjectSchema,
  
  // Administrasi
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountHolderName: z.string().optional(),
  
  hasNpwp: z.boolean().default(false),
  npwp: z.string().optional(),
  hasBpjsKesehatan: z.boolean().default(false),
  bpjsKesehatan: z.string().optional(),
  hasBpjsKetenagakerjaan: z.boolean().default(false),
  bpjsKetenagakerjaan: z.string().optional(),

  // Kontak Darurat
  emergencyContactName: z.string().min(2, "Nama kontak darurat harus diisi."),
  emergencyContactRelation: z.string().min(2, "Hubungan kontak darurat harus diisi."),
  emergencyContactPhone: z.string().min(10, "Nomor telepon darurat tidak valid."),
}).refine(data => !data.hasNpwp || (data.npwp && data.npwp.length > 0), {
    message: "Nomor NPWP harus diisi jika Anda memilikinya.",
    path: ["npwp"],
}).refine(data => !data.hasBpjsKesehatan || (data.bpjsKesehatan && data.bpjsKesehatan.length > 0), {
    message: "Nomor BPJS Kesehatan harus diisi jika Anda memilikinya.",
    path: ["bpjsKesehatan"],
}).refine(data => !data.hasBpjsKetenagakerjaan || (data.bpjsKetenagakerjaan && data.bpjsKetenagakerjaan.length > 0), {
    message: "Nomor BPJS Ketenagakerjaan harus diisi jika Anda memilikinya.",
    path: ["bpjsKetenagakerjaan"],
});

type FormValues = z.infer<typeof selfFormSchema>;

interface EmployeeSelfProfileFormProps {
  initialProfile: Partial<EmployeeProfile>;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

const addressDefaultValues: Address = {
    street: '', rt: '', rw: '', village: '', district: '', city: '', province: '', postalCode: '',
};

const getAddressObject = (address: any): Address => {
    if (typeof address === 'string') return { ...addressDefaultValues, street: address };
    return address ? { ...addressDefaultValues, ...address } : addressDefaultValues;
};

export function EmployeeSelfProfileForm({ initialProfile, onSaveSuccess, onCancel }: EmployeeSelfProfileFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { firebaseUser, refreshUserProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(selfFormSchema),
    defaultValues: {
      nickName: '', phone: '', gender: 'Laki-laki', birthPlace: '', birthDate: '', nik: '',
      maritalStatus: 'Belum Kawin', religion: '', address: { ...addressDefaultValues }, bankName: '',
      bankAccountNumber: '', bankAccountHolderName: '', hasNpwp: false, npwp: '',
      hasBpjsKesehatan: false, bpjsKesehatan: '', hasBpjsKetenagakerjaan: false, bpjsKetenagakerjaan: '',
      emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
    },
  });
  
  const hasNpwp = form.watch('hasNpwp');
  const hasBpjsKesehatan = form.watch('hasBpjsKesehatan');
  const hasBpjsKetenagakerjaan = form.watch('hasBpjsKetenagakerjaan');

  useEffect(() => {
    const formattedBirthDate = initialProfile.birthDate
      ? format(new Date(initialProfile.birthDate), 'yyyy-MM-dd')
      : '';
      
    form.reset({
      nickName: initialProfile.nickName || '',
      phone: initialProfile.phone || '',
      gender: initialProfile.gender || 'Laki-laki',
      birthPlace: initialProfile.birthPlace || '',
      birthDate: formattedBirthDate,
      nik: initialProfile.nik || '',
      maritalStatus: initialProfile.maritalStatus || 'Belum Kawin',
      religion: initialProfile.religion || '',
      address: getAddressObject(initialProfile.address),
      bankName: initialProfile.bankName || '',
      bankAccountNumber: initialProfile.bankAccountNumber || '',
      bankAccountHolderName: initialProfile.bankAccountHolderName || '',
      hasNpwp: initialProfile.hasNpwp || false,
      npwp: initialProfile.npwp || '',
      hasBpjsKesehatan: initialProfile.hasBpjsKesehatan || false,
      bpjsKesehatan: initialProfile.bpjsKesehatan || '',
      hasBpjsKetenagakerjaan: initialProfile.hasBpjsKetenagakerjaan || false,
      bpjsKetenagakerjaan: initialProfile.bpjsKetenagakerjaan || '',
      emergencyContactName: initialProfile.emergencyContactName || '',
      emergencyContactRelation: initialProfile.emergencyContactRelation || '',
      emergencyContactPhone: initialProfile.emergencyContactPhone || '',
    });
  }, [initialProfile, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!firebaseUser) {
        toast({ variant: 'destructive', title: 'Error', description: 'Authentication not found.' });
        return;
    }
    setIsSaving(true);
    try {
        const batch = writeBatch(firestore);
        const employeeProfileRef = doc(firestore, 'employee_profiles', firebaseUser.uid);
        const userRef = doc(firestore, 'users', firebaseUser.uid);
        
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

        toast({ title: "Profil Diperbarui", description: "Data diri Anda telah berhasil disimpan." });
        refreshUserProfile();
        onSaveSuccess();
    } catch(e: any) {
        toast({ variant: 'destructive', title: "Gagal Menyimpan Profil", description: e.message });
    } finally {
        setIsSaving(false);
    }
  }

  return (
      <Card>
        <CardHeader>
            <CardTitle>Edit Data Diri Anda</CardTitle>
            <CardDescription>Lengkapi atau perbarui informasi pribadi Anda. Kolom dengan tanda <span className="text-destructive">*</span> adalah wajib diisi.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
                <form id="employee-self-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Identitas Pribadi</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="nickName" render={({ field }) => (<FormItem><FormLabel>Nama Panggilan*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Nomor Telepon*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="birthPlace" render={({ field }) => (<FormItem><FormLabel>Tempat Lahir*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="birthDate" render={({ field }) => (<FormItem><FormLabel>Tanggal Lahir*</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="gender" render={({ field }) => (<FormItem><FormLabel>Jenis Kelamin*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem><SelectItem value="Lainnya">Lainnya</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="maritalStatus" render={({ field }) => (<FormItem><FormLabel>Status Pernikahan*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Belum Kawin">Belum Kawin</SelectItem><SelectItem value="Kawin">Kawin</SelectItem><SelectItem value="Cerai Hidup">Cerai Hidup</SelectItem><SelectItem value="Cerai Mati">Cerai Mati</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="religion" render={({ field }) => (<FormItem><FormLabel>Agama*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </section>
                    
                    <Separator/>

                    <section className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Alamat</h3>
                        <FormField control={form.control} name="address.street" render={({ field }) => (<FormItem><FormLabel>Alamat Lengkap (Jalan, Nomor, Blok)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <FormField control={form.control} name="address.rt" render={({ field }) => (<FormItem><FormLabel>RT</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="address.rw" render={({ field }) => (<FormItem><FormLabel>RW</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="address.village" render={({ field }) => (<FormItem><FormLabel>Kelurahan/Desa</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="address.district" render={({ field }) => (<FormItem><FormLabel>Kecamatan</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="address.city" render={({ field }) => (<FormItem><FormLabel>Kota/Kabupaten</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="address.province" render={({ field }) => (<FormItem><FormLabel>Provinsi</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="address.postalCode" render={({ field }) => (<FormItem><FormLabel>Kode Pos</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </section>
                    
                    <Separator/>

                    <section className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Administrasi Personal</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="nik" render={({ field }) => (<FormItem><FormLabel>Nomor KTP (NIK)*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="space-y-4">
                                <FormField control={form.control} name="hasNpwp" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Saya memiliki NPWP</FormLabel></FormItem>)} />
                                {hasNpwp && <FormField control={form.control} name="npwp" render={({ field }) => (<FormItem><FormControl><Input {...field} placeholder="Nomor NPWP" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />}
                            </div>
                            <div className="space-y-4">
                                <FormField control={form.control} name="hasBpjsKesehatan" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Saya memiliki BPJS Kesehatan</FormLabel></FormItem>)} />
                                {hasBpjsKesehatan && <FormField control={form.control} name="bpjsKesehatan" render={({ field }) => (<FormItem><FormControl><Input {...field} placeholder="Nomor BPJS Kesehatan" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />}
                            </div>
                             <div className="space-y-4">
                                <FormField control={form.control} name="hasBpjsKetenagakerjaan" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Saya memiliki BPJS Ketenagakerjaan</FormLabel></FormItem>)} />
                                {hasBpjsKetenagakerjaan && <FormField control={form.control} name="bpjsKetenagakerjaan" render={({ field }) => (<FormItem><FormControl><Input {...field} placeholder="Nomor BPJS Ketenagakerjaan" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />}
                            </div>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                            <FormField control={form.control} name="bankName" render={({ field }) => (<FormItem><FormLabel>Nama Bank</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="bankAccountNumber" render={({ field }) => (<FormItem><FormLabel>Nomor Rekening</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="bankAccountHolderName" render={({ field }) => (<FormItem><FormLabel>Nama Pemilik Rekening</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </section>

                    <Separator/>

                     <section className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Kontak Darurat</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name="emergencyContactName" render={({ field }) => (<FormItem><FormLabel>Nama*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="emergencyContactRelation" render={({ field }) => (<FormItem><FormLabel>Hubungan*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="emergencyContactPhone" render={({ field }) => (<FormItem><FormLabel>Telepon*</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
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
  )
}
