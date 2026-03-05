'use client';

import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
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
  
  internshipStartDate: z.date().optional(),
  internshipEndDate: z.date().optional(),
});

type FormValues = z.infer<typeof profileSchema>;

function ProfileForm({ initialProfile, onSaveSuccess }: { initialProfile: Partial<EmployeeProfile>, onSaveSuccess: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
        ...initialProfile,
        email: initialProfile.email || userProfile?.email,
        internshipStartDate: initialProfile.internshipStartDate?.toDate(),
        internshipEndDate: initialProfile.internshipEndDate?.toDate(),
    },
  });

  async function onSubmit(values: FormValues) {
    if (!userProfile) {
        toast({ variant: "destructive", title: "Error", description: "User not found. Please re-login." });
        return;
    }
    setIsSaving(true);
    
    const batch = writeBatch(firestore);

    // 1. Update employee_profiles
    const profileDocRef = doc(firestore, 'employee_profiles', userProfile.uid);
    const profilePayload: Partial<EmployeeProfile> & { updatedAt: any, completeness: any } = {
        ...values,
        uid: userProfile.uid,
        employmentType: 'magang',
        updatedAt: serverTimestamp(),
        internshipStartDate: values.internshipStartDate ? Timestamp.fromDate(values.internshipStartDate) : undefined,
        internshipEndDate: values.internshipEndDate ? Timestamp.fromDate(values.internshipEndDate) : undefined,
        completeness: {
            isComplete: true,
            completedAt: serverTimestamp(),
        }
    };
    batch.set(profileDocRef, profilePayload, { merge: true });

    // 2. Update users collection with the correct employmentStage
    const userDocRef = doc(firestore, 'users', userProfile.uid);
    const newEmploymentStage = values.internSubtype === 'sekolah' ? 'intern_education' : 'intern_pre_probation';
    batch.set(userDocRef, { employmentStage: newEmploymentStage }, { merge: true });
    
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
                           <FormField control={form.control} name="internSubtype" render={({ field }) => (<FormItem><FormLabel>Tipe Magang <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe magang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="sekolah">Magang Terikat Pendidikan</SelectItem><SelectItem value="freshgraduate">Magang Pra-Probation</SelectItem></SelectContent></Select><FormDescription><strong>Magang Terikat Pendidikan:</strong> Peserta yang masih memiliki ikatan pendidikan (sekolah/kuliah) dan akan kembali studi setelah magang.<br/><strong>Magang Pra-Probation:</strong> Peserta yang sudah lulus dan mengikuti magang sebagai jalur menuju masa percobaan karyawan.</FormDescription><FormMessage /></FormItem>)} />
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

function ProfilePreview({ profile, onEdit }: { profile: EmployeeProfile, onEdit: () => void }) {
    const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <dd className="text-sm col-span-2">{value || '-'}</dd>
      </div>
    );
    const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="text-lg font-semibold tracking-tight border-b pb-2 mb-4">{children}</h3>
    );

    return (
         <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Profil Magang Anda</CardTitle>
                    <CardDescription>Data ini digunakan oleh HRD untuk keperluan administrasi.</CardDescription>
                </div>
                <Button variant="outline" onClick={onEdit}><Edit className="mr-2 h-4 w-4"/>Edit Profil</Button>
            </CardHeader>
            <CardContent className="space-y-6">
                {(profile.internshipStartDate || profile.internshipEndDate) && (
                    <Card className="bg-primary/5 text-primary-foreground border-primary/20">
                        <CardHeader>
                            <CardTitle className="text-lg text-primary">Periode Magang Anda</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-around text-center">
                                <div>
                                    <p className="text-xs text-primary/80">Mulai Magang</p>
                                    <p className="font-bold text-xl text-primary">{profile.internshipStartDate ? format(profile.internshipStartDate.toDate(), 'dd MMM yyyy', { locale: id }) : 'TBA'}</p>
                                </div>
                                <div className="h-12 w-px bg-primary/20" />
                                <div>
                                    <p className="text-xs text-primary/80">Selesai Magang</p>
                                    <p className="font-bold text-xl text-primary">{profile.internshipEndDate ? format(profile.internshipEndDate.toDate(), 'dd MMM yyyy', { locale: id }) : 'TBA'}</p>
                                </div>
                            </div>
                            {!profile.internshipStartDate && (
                                <p className="text-xs text-center text-primary/70 mt-3">Periode resmi magang Anda akan diatur dan ditampilkan di sini oleh HRD.</p>
                            )}
                        </CardContent>
                    </Card>
                )}
                
                <Separator />
                
                <div>
                    <SectionTitle>Identitas</SectionTitle>
                    <dl className="space-y-1">
                        <InfoRow label="Nama Lengkap" value={profile.fullName} />
                        <InfoRow label="Nama Panggilan" value={profile.nickName} />
                        <InfoRow label="Telepon" value={profile.phone} />
                        <InfoRow label="Jenis Kelamin" value={profile.gender} />
                        <InfoRow label="Tempat, Tanggal Lahir" value={`${profile.birthPlace || ''}, ${profile.birthDate ? format(new Date(profile.birthDate), 'dd MMMM yyyy', {locale: id}) : '-'}`} />
                    </dl>
                </div>
                <Separator/>
                <div>
                    <SectionTitle>Status Magang</SectionTitle>
                     <dl className="space-y-1">
                        <InfoRow label="Tipe Magang" value={profile.internSubtype === 'sekolah' ? 'Magang Terikat Pendidikan' : 'Magang Pra-Probation'} />
                        <InfoRow label="Asal Sekolah/Kampus" value={profile.schoolOrCampus} />
                        <InfoRow label="Jurusan" value={profile.major} />
                        <InfoRow label="Jenjang Pendidikan" value={profile.educationLevel} />
                    </dl>
                </div>
                <Separator/>
                 <div>
                    <SectionTitle>Domisili & Kontak Darurat</SectionTitle>
                    <dl className="space-y-1">
                        <InfoRow label="Alamat Domisili" value={profile.addressCurrent} />
                        <InfoRow label="Nama Kontak Darurat" value={profile.emergencyContactName} />
                        <InfoRow label="Hubungan" value={profile.emergencyContactRelation} />
                        <InfoRow label="Telepon Darurat" value={profile.emergencyContactPhone} />
                    </dl>
                </div>
            </CardContent>
        </Card>
    )
}

function InternProfilePageContent() {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();

    const profileDocRef = useMemoFirebase(
        () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
        [firestore, userProfile]
    );
    const { data: initialProfile, isLoading: profileLoading, mutate: refetchProfile } = useDoc<EmployeeProfile>(profileDocRef);

    const mode = searchParams.get('mode');
    const isLoading = authLoading || profileLoading;

    const handleSaveSuccess = () => {
        refetchProfile();
        router.push('/admin/karyawan/magang/profile');
    };

    if (isLoading) {
        return <Skeleton className="h-96 w-full" />;
    }
    
    const isProfileComplete = initialProfile?.completeness?.isComplete;
    const showForm = !isProfileComplete || mode === 'edit';

    const defaultProfile = {
        email: userProfile?.email || '',
        fullName: userProfile?.fullName || '',
        ...initialProfile,
    };

    return showForm ? (
        <ProfileForm initialProfile={defaultProfile} onSaveSuccess={handleSaveSuccess} />
    ) : (
        <ProfilePreview profile={initialProfile!} onEdit={() => router.push('/admin/karyawan/magang/profile?mode=edit')} />
    );
}

export default function InternProfilePage() {
    return (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <InternProfilePageContent />
        </Suspense>
    )
}
