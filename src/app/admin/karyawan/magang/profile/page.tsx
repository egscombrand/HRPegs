'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { EmployeeProfile, OrganizationalExperience } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const orgExperienceSchema = z.object({
  id: z.string(),
  organization: z.string().min(1, "Nama organisasi harus diisi"),
  position: z.string().min(1, "Jabatan harus diisi"),
  startDate: z.string().min(4, "Tahun mulai harus diisi"),
  endDate: z.string().optional(),
  isCurrent: z.boolean().default(false),
  description: z.string().optional(),
}).refine(data => data.isCurrent || (data.endDate && data.endDate.length > 0), {
    message: "Tahun selesai harus diisi jika tidak aktif saat ini.",
    path: ["endDate"],
});

const profileSchema = z.object({
  fullName: z.string().min(2, "Nama lengkap harus diisi."),
  nickName: z.string().optional(),
  phone: z.string().min(10, "Nomor telepon tidak valid."),
  email: z.string().email(),
  gender: z.enum(['Laki-laki', 'Perempuan', 'Lainnya']).optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  
  internSubtype: z.enum(['sekolah', 'freshgraduate'], { required_error: "Tipe magang harus dipilih." }),
  schoolOrCampus: z.string().min(3, "Asal sekolah/kampus harus diisi."),
  educationLevel: z.enum(['SMA/SMK', 'D3', 'S1', 'S2', 'Lainnya'], { required_error: "Jenjang pendidikan harus dipilih." }),
  major: z.string().optional(),
  expectedEndDate: z.string().optional(),

  addressCurrent: z.string().min(10, "Alamat domisili harus diisi."),

  emergencyContactName: z.string().min(2, "Nama kontak darurat harus diisi."),
  emergencyContactRelation: z.string().min(2, "Hubungan kontak darurat harus diisi."),
  emergencyContactPhone: z.string().min(10, "Nomor telepon darurat tidak valid."),

  organizationalExperience: z.array(orgExperienceSchema).optional(),
  portfolioUrl: z.string().url({ message: "URL tidak valid. Harap gunakan format https://..."}).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof profileSchema>;

function ProfileFormSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-8">
                <div className="space-y-4">
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-4">
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="flex justify-end">
                    <Skeleton className="h-10 w-32" />
                </div>
            </CardContent>
        </Card>
    )
}

export default function InternProfilePage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const profileDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
    [firestore, userProfile]
  );
  const { data: initialProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(profileDocRef);

  const form = useForm<FormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
        email: userProfile?.email || '',
        organizationalExperience: [],
    },
  });

  const { fields: orgExpFields, append: appendOrgExp, remove: removeOrgExp } = useFieldArray({
    control: form.control,
    name: "organizationalExperience",
  });

  useEffect(() => {
    if (initialProfile) {
      form.reset({
        ...initialProfile,
        portfolioUrl: initialProfile.portfolioUrl || '',
        email: initialProfile.email || userProfile?.email,
      });
    } else if (userProfile) {
      form.reset({
        email: userProfile.email,
        fullName: userProfile.fullName,
      });
    }
  }, [initialProfile, userProfile, form]);
  
  const isLoading = authLoading || profileLoading;

  async function onSubmit(values: FormValues) {
    if (!userProfile) {
        toast({ variant: "destructive", title: "Error", description: "User not found. Please re-login." });
        return;
    }
    setIsSaving(true);
    
    const payload: Partial<EmployeeProfile> & { updatedAt: any, completeness: any } = {
        ...values,
        portfolioUrl: values.portfolioUrl || '',
        uid: userProfile.uid,
        employmentType: 'magang',
        updatedAt: serverTimestamp(),
        completeness: {
            isComplete: true,
            completedAt: serverTimestamp(),
        }
    };
    
    try {
        await setDocumentNonBlocking(profileDocRef!, payload, { merge: true });
        toast({ title: "Profil Disimpan", description: "Profil Anda telah berhasil diperbarui." });
        router.push('/admin/karyawan/dashboard-magang');
    } catch (error: any) {
        toast({ variant: "destructive", title: "Gagal menyimpan profil", description: error.message });
    } finally {
        setIsSaving(false);
    }
  }

  if (isLoading) {
    return <ProfileFormSkeleton />;
  }

  return (
    <Card>
        <CardHeader>
            <CardTitle>Lengkapi Profil Magang</CardTitle>
            <CardDescription>Data ini akan digunakan oleh tim HRD untuk keperluan administrasi dan komunikasi selama periode magang Anda.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    
                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Identitas</h3>
                        <div className="space-y-4">
                            <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Sesuai KTP" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="nickName" render={({ field }) => (<FormItem><FormLabel>Nama Panggilan</FormLabel><FormControl><Input placeholder="Nama panggilan Anda" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>No. HP Aktif <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="0812..." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="gender" render={({ field }) => (<FormItem><FormLabel>Jenis Kelamin</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis kelamin" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem><SelectItem value="Lainnya">Lainnya</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="birthPlace" render={({ field }) => (<FormItem><FormLabel>Tempat Lahir</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="birthDate" render={({ field }) => (<FormItem><FormLabel>Tanggal Lahir</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                        </div>
                    </section>

                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Status Magang</h3>
                        <div className="space-y-4">
                            <FormField control={form.control} name="internSubtype" render={({ field }) => (<FormItem><FormLabel>Tipe Magang <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe magang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="sekolah">Magang Sekolah</SelectItem><SelectItem value="freshgraduate">Magang Fresh Graduate</SelectItem></SelectContent></Select><FormDescription>
                                <strong>Magang Sekolah:</strong> Untuk siswa/i SMK/sederajat.
                                <br />
                                <strong>Magang Fresh Graduate:</strong> Untuk mahasiswa atau lulusan baru D3/S1.
                            </FormDescription><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="schoolOrCampus" render={({ field }) => (<FormItem><FormLabel>Asal Sekolah/Kampus <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="educationLevel" render={({ field }) => (<FormItem><FormLabel>Jenjang Pendidikan <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenjang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="SMA/SMK">SMA/SMK</SelectItem><SelectItem value="D3">D3</SelectItem><SelectItem value="S1">S1</SelectItem><SelectItem value="S2">S2</SelectItem><SelectItem value="Lainnya">Lainnya</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="major" render={({ field }) => (<FormItem><FormLabel>Jurusan</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                            <FormField control={form.control} name="expectedEndDate" render={({ field }) => (<FormItem><FormLabel>Perkiraan Selesai Magang</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormDescription>Ini adalah perkiraan dari Anda, tanggal resmi akan ditentukan oleh HRD.</FormDescription><FormMessage /></FormItem>)} />
                        </div>
                    </section>
                    
                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Pengalaman & Portofolio</h3>
                        <div className="space-y-4">
                           <FormField control={form.control} name="portfolioUrl" render={({ field }) => (<FormItem><FormLabel>URL Portofolio (Opsional)</FormLabel><FormControl><Input {...field} placeholder="https://behance.net/nama" value={field.value ?? ''} /></FormControl><FormDescription>Sangat direkomendasikan untuk posisi kreatif/teknis (contoh: desain, video, web).</FormDescription><FormMessage /></FormItem>)} />
                           
                           <div className="space-y-2">
                                 <Label>Pengalaman Organisasi/Proyek (Opsional)</Label>
                                <div className="space-y-4">
                                {orgExpFields.map((field, index) => (
                                    <div key={field.id} className="space-y-4 p-3 border rounded-md relative">
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => removeOrgExp(index)}><Trash2 className="h-4 w-4" /></Button>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name={`organizationalExperience.${index}.organization`} render={({ field }) => (<FormItem><FormLabel>Nama Organisasi/Proyek</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                            <FormField control={form.control} name={`organizationalExperience.${index}.position`} render={({ field }) => (<FormItem><FormLabel>Jabatan/Peran</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        </div>
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name={`organizationalExperience.${index}.startDate`} render={({ field }) => (<FormItem><FormLabel>Tahun Mulai</FormLabel><FormControl><Input type="number" {...field} placeholder="YYYY" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                            <FormField control={form.control} name={`organizationalExperience.${index}.endDate`} render={({ field }) => (<FormItem><FormLabel>Tahun Selesai</FormLabel><FormControl><Input type="number" {...field} placeholder="YYYY" disabled={form.watch(`organizationalExperience.${index}.isCurrent`)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        </div>
                                         <FormField control={form.control} name={`organizationalExperience.${index}.isCurrent`} render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3 space-y-0"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Masih aktif</FormLabel></div></FormItem>)} />
                                        <FormField control={form.control} name={`organizationalExperience.${index}.description`} render={({ field }) => (<FormItem><FormLabel>Deskripsi Singkat</FormLabel><FormControl><Textarea {...field} rows={2} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                ))}
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => appendOrgExp({ id: crypto.randomUUID(), organization: '', position: '', startDate: '', endDate: '', isCurrent: false, description: '' })}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Pengalaman</Button>
                           </div>

                        </div>
                    </section>
                    
                    <Separator />
                    
                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Domisili</h3>
                        <FormField control={form.control} name="addressCurrent" render={({ field }) => (<FormItem><FormLabel>Alamat Domisili Saat Ini <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={3} placeholder="Alamat lengkap tempat Anda tinggal sekarang" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                    </section>
                    
                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Kontak Darurat</h3>
                        <div className="space-y-4">
                            <FormField control={form.control} name="emergencyContactName" render={({ field }) => (<FormItem><FormLabel>Nama Kontak Darurat <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="emergencyContactRelation" render={({ field }) => (<FormItem><FormLabel>Hubungan <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Ibu, Ayah, Saudara, dll." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="emergencyContactPhone" render={({ field }) => (<FormItem><FormLabel>No. HP Kontak Darurat <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                        </div>
                    </section>

                    <div className="flex justify-end pt-4">
                        <Button type="submit" size="lg" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Simpan Profil
                        </Button>
                    </div>
                </form>
            </Form>
        </CardContent>
    </Card>
  )
}
