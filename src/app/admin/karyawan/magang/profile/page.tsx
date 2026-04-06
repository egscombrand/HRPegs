'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import type { EmployeeProfile, Profile, Address } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Edit } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Label } from '@/components/ui/label';
import { ProfilePreview } from '@/components/profile/ProfilePreview';


const profileSchema = z.object({
  fullName: z.string().min(2, "Nama lengkap harus diisi."),
  nickName: z.string().optional(),
  phone: z.string().min(10, "Nomor telepon tidak valid."),
  email: z.string().email(),
  gender: z.enum(['Laki-laki', 'Perempuan', 'Lainnya']).optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  
  internSubtype: z.enum(['intern_education', 'intern_pre_probation'], { required_error: "Tipe magang harus dipilih." }),
  schoolOrCampus: z.string().min(3, "Asal sekolah/kampus harus diisi."),
  educationLevel: z.enum(['SMA/SMK', 'D3', 'S1', 'S2', 'Lainnya'], { required_error: "Jenjang pendidikan harus dipilih." }),
  major: z.string().optional(),
  expectedEndDate: z.string().optional(),

  addressCurrent: z.string().min(10, "Alamat domisili harus diisi."),

  emergencyContactName: z.string().min(2, "Nama kontak darurat harus diisi."),
  emergencyContactRelation: z.string().min(2, "Hubungan kontak darurat harus diisi."),
  emergencyContactPhone: z.string().min(10, "Nomor telepon darurat tidak valid."),
  
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountHolderName: z.string().optional(),

  internshipStartDate: z.date().optional().nullable(),
  internshipEndDate: z.date().optional().nullable(),
});

type FormValues = z.infer<typeof profileSchema>;

function ProfileForm({ initialProfile, onSaveSuccess }: { initialProfile: Partial<EmployeeProfile>, onSaveSuccess: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
        ...initialProfile,
        email: initialProfile.email || '',
        internshipStartDate: initialProfile.internshipStartDate?.toDate() || null,
        internshipEndDate: initialProfile.internshipEndDate?.toDate() || null,
    },
  });

  useEffect(() => {
    form.reset({
        ...initialProfile,
        email: initialProfile.email || '',
        internshipStartDate: initialProfile.internshipStartDate?.toDate() || null,
        internshipEndDate: initialProfile.internshipEndDate?.toDate() || null,
    });
  }, [initialProfile, form]);

  async function onSubmit(values: FormValues) {
    if (!firebaseUser) {
        toast({ variant: "destructive", title: "Error", description: "User not found. Please re-login." });
        return;
    }
    setIsSaving(true);
    
    const batch = writeBatch(firestore);
    const profileDocRef = doc(firestore, 'employee_profiles', firebaseUser.uid);

    const profilePayload = {
      fullName: values.fullName,
      nickName: values.nickName || null,
      phone: values.phone,
      email: values.email,
      gender: values.gender || null,
      birthPlace: values.birthPlace || null,
      birthDate: values.birthDate || null,
      internSubtype: values.internSubtype,
      schoolOrCampus: values.schoolOrCampus,
      educationLevel: values.educationLevel,
      major: values.major || null,
      expectedEndDate: values.expectedEndDate || null,
      addressCurrent: values.addressCurrent,
      emergencyContactName: values.emergencyContactName,
      emergencyContactRelation: values.emergencyContactRelation,
      emergencyContactPhone: values.emergencyContactPhone,
      bankName: values.bankName || null,
      bankAccountNumber: values.bankAccountNumber || null,
      bankAccountHolderName: values.bankAccountHolderName || null,
      internshipStartDate: values.internshipStartDate ? Timestamp.fromDate(values.internshipStartDate) : null,
      internshipEndDate: values.internshipEndDate ? Timestamp.fromDate(values.internshipEndDate) : null,
      uid: firebaseUser.uid,
      employmentType: 'magang' as const,
      updatedAt: serverTimestamp(),
      completeness: {
        isComplete: true,
        completedAt: serverTimestamp(),
      },
    };

    batch.set(profileDocRef, profilePayload, { merge: true });

    const userDocRef = doc(firestore, 'users', firebaseUser.uid);
    const newEmploymentStage = values.internSubtype === 'intern_education' ? 'intern_education' : 'intern_pre_probation';
    batch.set(userDocRef, { employmentStage: newEmploymentStage, employmentType: 'magang' }, { merge: true });
    
    try {
        await batch.commit();
        toast({ title: "Profil Disimpan", description: "Profil Anda telah berhasil diperbarui." });
        onSaveSuccess();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Gagal menyimpan profil", description: error.message });
    } finally {
        setIsSaving(false);
    }
  }
  
  return (
      <Card>
        <CardHeader>
            <CardTitle>Lengkapi Profil Magang</CardTitle>
            <CardDescription>Data ini akan digunakan oleh tim HRD untuk keperluan administrasi dan komunikasi selama periode magang Anda. Kolom dengan tanda <span className="text-destructive">*</span> adalah kolom yang wajib diisi.</CardDescription>
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
                           <FormField control={form.control} name="internSubtype" render={({ field }) => (<FormItem><FormLabel>Tipe Magang <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe magang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="intern_education">Magang Terikat Pendidikan</SelectItem><SelectItem value="intern_pre_probation">Magang Pra-Probation</SelectItem></SelectContent></Select><FormDescription><strong>Magang Terikat Pendidikan:</strong> Peserta yang masih memiliki ikatan pendidikan (sekolah/kuliah) dan akan kembali studi setelah magang.<br/><strong>Magang Pra-Probation:</strong> Peserta yang sudah lulus dan mengikuti magang sebagai jalur menuju masa percobaan karyawan.</FormDescription><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="schoolOrCampus" render={({ field }) => (<FormItem><FormLabel>Asal Sekolah/Kampus <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="educationLevel" render={({ field }) => (<FormItem><FormLabel>Jenjang Pendidikan <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenjang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="SMA/SMK">SMA/SMK</SelectItem><SelectItem value="D3">D3</SelectItem><SelectItem value="S1">S1</SelectItem><SelectItem value="S2">S2</SelectItem><SelectItem value="Lainnya">Lainnya</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="major" render={({ field }) => (<FormItem><FormLabel>Jurusan</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                            <FormField control={form.control} name="expectedEndDate" render={({ field }) => (<FormItem><FormLabel>Perkiraan Selesai (Opsional)</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormDescription>Jika terikat pendidikan, isi perkiraan tanggal selesai masa studi/magang.</FormDescription><FormMessage /></FormItem>)} />
                        </div>
                    </section>
                    
                    <Separator />

                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Informasi Finansial (Uang Saku)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name="bankName" render={({ field }) => (<FormItem><FormLabel>Nama Bank</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="bankAccountNumber" render={({ field }) => (<FormItem><FormLabel>Nomor Rekening</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="bankAccountHolderName" render={({ field }) => (<FormItem><FormLabel>Nama Pemilik Rekening</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
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

function InternProfilePageContent() {
    const { userProfile, loading: authLoading, refreshUserProfile } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();

    const employeeProfileDocRef = useMemoFirebase(
        () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
        [firestore, userProfile]
    );
    const { data: employeeProfile, isLoading: employeeProfileLoading, mutate: refetchProfile } = useDoc<EmployeeProfile>(employeeProfileDocRef);

    const recruitmentProfileDocRef = useMemoFirebase(
      () => (userProfile ? doc(firestore, 'profiles', userProfile.uid) : null),
      [firestore, userProfile]
    );
    const { data: recruitmentProfile, isLoading: recruitmentProfileLoading } = useDoc<Profile>(recruitmentProfileDocRef);

    const mode = searchParams.get('mode');
    const isLoading = authLoading || employeeProfileLoading || recruitmentProfileLoading;

    const combinedInitialProfile = useMemo(() => {
        if (!userProfile) return {};

        const formatAddress = (addr?: Partial<Address>): string => {
            if (!addr || !addr.street) return '';
            return [
                addr.street,
                addr.rt && addr.rw ? `RT ${addr.rt}/RW ${addr.rw}` : '',
                addr.village,
                addr.district,
                `${addr.city || ''}, ${addr.province || ''} ${addr.postalCode || ''}`.trim(),
            ].filter(Boolean).join(', ');
        };
        
        const latestEducation = recruitmentProfile?.education?.[0];
        const addressToUse = recruitmentProfile?.isDomicileSameAsKtp ? recruitmentProfile?.addressKtp : recruitmentProfile?.addressDomicile;

        return {
            fullName: employeeProfile?.fullName || recruitmentProfile?.fullName || userProfile.fullName,
            email: userProfile.email,
            nickName: employeeProfile?.nickName || recruitmentProfile?.nickname,
            phone: employeeProfile?.phone || recruitmentProfile?.phone,
            gender: employeeProfile?.gender || recruitmentProfile?.gender,
            birthPlace: employeeProfile?.birthPlace || recruitmentProfile?.birthPlace,
            birthDate: employeeProfile?.birthDate || (recruitmentProfile?.birthDate instanceof Timestamp ? format(recruitmentProfile.birthDate.toDate(), 'yyyy-MM-dd') : undefined),
            addressCurrent: employeeProfile?.addressCurrent || formatAddress(addressToUse),
            schoolOrCampus: employeeProfile?.schoolOrCampus || latestEducation?.institution,
            major: employeeProfile?.major || latestEducation?.fieldOfStudy,
            educationLevel: employeeProfile?.educationLevel || latestEducation?.level,
            internSubtype: employeeProfile?.internSubtype,
            expectedEndDate: employeeProfile?.expectedEndDate,
            internshipStartDate: employeeProfile?.internshipStartDate,
            internshipEndDate: employeeProfile?.internshipEndDate,
            emergencyContactName: employeeProfile?.emergencyContactName,
            emergencyContactRelation: employeeProfile?.emergencyContactRelation,
            emergencyContactPhone: employeeProfile?.emergencyContactPhone,
            bankName: employeeProfile?.bankName,
            bankAccountNumber: employeeProfile?.bankAccountNumber,
            bankAccountHolderName: employeeProfile?.bankAccountHolderName,
        };
    }, [employeeProfile, recruitmentProfile, userProfile]);

    const handleSaveSuccess = () => {
        refetchProfile();
        refreshUserProfile();
        router.push('/admin/karyawan/magang/profile');
    };

    if (isLoading) {
        return <Skeleton className="h-96 w-full" />;
    }
    
    const isProfileComplete = employeeProfile?.completeness?.isComplete;
    const showForm = !isProfileComplete || mode === 'edit';

    return showForm ? (
        <ProfileForm initialProfile={combinedInitialProfile} onSaveSuccess={handleSaveSuccess} />
    ) : (
        <ProfilePreview profile={employeeProfile as EmployeeProfile} onEditRequest={() => router.push('/admin/karyawan/magang/profile?mode=edit')} />
    );
}

export default function InternProfilePage() {
    return (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <InternProfilePageContent />
        </Suspense>
    )
}
