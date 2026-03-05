'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

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
    },
  });

  useEffect(() => {
    if (initialProfile) {
      form.reset({
        ...initialProfile,
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
                            <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Sesuai KTP" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="nickName" render={({ field }) => (<FormItem><FormLabel>Nama Panggilan</FormLabel><FormControl><Input placeholder="Nama panggilan Anda" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>No. HP Aktif <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="0812..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="gender" render={({ field }) => (<FormItem><FormLabel>Jenis Kelamin</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis kelamin" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem><SelectItem value="Lainnya">Lainnya</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="birthPlace" render={({ field }) => (<FormItem><FormLabel>Tempat Lahir</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="birthDate" render={({ field }) => (<FormItem><FormLabel>Tanggal Lahir</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                        </div>
                    </section>

                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Status Magang</h3>
                        <div className="space-y-4">
                            <FormField control={form.control} name="internSubtype" render={({ field }) => (<FormItem><FormLabel>Tipe Magang <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe magang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="sekolah">Magang Sekolah</SelectItem><SelectItem value="freshgraduate">Magang Fresh Graduate</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="schoolOrCampus" render={({ field }) => (<FormItem><FormLabel>Asal Sekolah/Kampus <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="educationLevel" render={({ field }) => (<FormItem><FormLabel>Jenjang Pendidikan <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenjang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="SMA/SMK">SMA/SMK</SelectItem><SelectItem value="D3">D3</SelectItem><SelectItem value="S1">S1</SelectItem><SelectItem value="S2">S2</SelectItem><SelectItem value="Lainnya">Lainnya</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="major" render={({ field }) => (<FormItem><FormLabel>Jurusan</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                            <FormField control={form.control} name="expectedEndDate" render={({ field }) => (<FormItem><FormLabel>Perkiraan Selesai Magang</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </section>
                    
                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Domisili</h3>
                        <FormField control={form.control} name="addressCurrent" render={({ field }) => (<FormItem><FormLabel>Alamat Domisili Saat Ini <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={3} placeholder="Alamat lengkap tempat Anda tinggal sekarang" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </section>
                    
                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Kontak Darurat</h3>
                        <div className="space-y-4">
                            <FormField control={form.control} name="emergencyContactName" render={({ field }) => (<FormItem><FormLabel>Nama Kontak Darurat <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="emergencyContactRelation" render={({ field }) => (<FormItem><FormLabel>Hubungan <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Ibu, Ayah, Saudara, dll." {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="emergencyContactPhone" render={({ field }) => (<FormItem><FormLabel>No. HP Kontak Darurat <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
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
