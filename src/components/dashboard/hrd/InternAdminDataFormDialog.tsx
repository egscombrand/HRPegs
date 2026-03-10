'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch, query, collection, where } from 'firebase/firestore';
import type { EmployeeProfile, Brand, UserProfile, JobApplication, Job } from '@/lib/types';
import { addMonths } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const adminFormSchema = z.object({
  division: z.string().optional(),
  supervisorName: z.string().optional(),
  internSubtype: z.enum(['intern_education', 'intern_pre_probation'], { required_error: "Tipe magang harus dipilih." }),
  internshipStartDate: z.date().optional().nullable(),
  contractDurationMonths: z.coerce.number().int().min(1, 'Durasi kontrak minimal 1 bulan.').optional().nullable(),
  internshipEndDate: z.date().optional().nullable(),
  compensationAmount: z.coerce.number().int().min(0, 'Kompensasi tidak boleh negatif.').optional().nullable(),
  hrdNotes: z.string().optional(),
});

type AdminFormValues = z.infer<typeof adminFormSchema>;

interface InternAdminDataFormDialogProps {
  profile: EmployeeProfile;
  onSuccess: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="flex justify-between items-center py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-right">{value || '-'}</dd>
    </div>
);

const formatSalary = (value: number | string | undefined | null) => {
  if (value === undefined || value === null || value === '') return '';
  const num = typeof value === 'string' ? parseInt(value.replace(/\./g, ''), 10) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('id-ID');
};

const unformatSalary = (value: string) => {
  return parseInt(value.replace(/\./g, ''), 10) || 0;
};


export function InternAdminDataFormDialog({ open, onOpenChange, profile, onSuccess }: InternAdminDataFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile: hrdProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const applicationQuery = useMemoFirebase(() => {
    if (!profile) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', profile.uid),
      where('status', '==', 'hired'),
      where('jobType', '==', 'internship')
    );
  }, [firestore, profile]);
  const { data: applications } = useCollection<JobApplication>(applicationQuery);
  const application = useMemo(() => applications?.[0] || null, [applications]);
  
  const userRef = useMemoFirebase(() => {
    if (!profile) return null;
    return doc(firestore, 'users', profile.uid);
  }, [firestore, profile]);
  const { data: userProfile } = useDoc<UserProfile>(userRef);

  const { data: brands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );
  
  const { data: supervisors } = useCollection<UserProfile>(
    useMemoFirebase(() => query(collection(firestore, 'users'), where('role', 'in', ['manager', 'karyawan']), where('isActive', '==', true)), [firestore])
  );
  
  const jobRef = useMemoFirebase(() => {
    if (!application) return null;
    return doc(firestore, 'jobs', application.jobId);
  }, [firestore, application]);
  const { data: job } = useDoc<Job>(jobRef);

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
  });
  
  const { watch, setValue } = form;
  const startDate = watch('internshipStartDate');
  const duration = watch('contractDurationMonths');
  
  const { finalBrandId, finalBrandName } = useMemo(() => {
    const brandMap = new Map(brands?.map(b => [b.id!, b.name]) || []);
    let id = profile.brandId || userProfile?.brandId || application?.brandId;
    const singleId = Array.isArray(id) ? id[0] : id;

    let name = 'N/A';
    if (profile.brandName) {
        name = profile.brandName;
    } else if (singleId && brands) {
        name = brandMap.get(singleId) || 'Unknown';
    } else if (application?.brandName) {
        name = application.brandName;
    }
    
    return { finalBrandId: singleId, finalBrandName: name };
  }, [profile, userProfile, application, brands]);

  const { managers, employees } = useMemo(() => {
    const managers: UserProfile[] = [];
    const employees: UserProfile[] = [];
    if (!supervisors || !finalBrandId) return { managers, employees };

    for (const user of supervisors) {
        if (user.uid === profile.uid || !user.isActive) continue;

        const userIsInBrand = Array.isArray(user.brandId) 
            ? user.brandId.includes(finalBrandId) 
            : user.brandId === finalBrandId;

        if (userIsInBrand) {
            if (user.role === 'manager') {
                managers.push(user);
            } else if (user.role === 'karyawan') {
                employees.push(user);
            }
        }
    }
    return { managers, employees };
  }, [supervisors, finalBrandId, profile.uid]);


  useEffect(() => {
    if (startDate && duration && duration > 0) {
        const parsedDuration = typeof duration === 'string' ? parseInt(duration, 10) : duration;
        if (!isNaN(parsedDuration)) {
            const endDate = addMonths(startDate, parsedDuration);
            setValue('internshipEndDate', endDate);
        }
    }
  }, [startDate, duration, setValue]);
  
  useEffect(() => {
    if (open) {
        const defaultValues = {
            division: profile.division || job?.division || '',
            supervisorName: profile.supervisorName || '',
            internSubtype: profile.internSubtype || userProfile?.employmentStage || 'intern_education',
            hrdNotes: profile.hrdNotes || application?.offerNotes || '',
            internshipStartDate: profile.internshipStartDate?.toDate() || application?.contractStartDate?.toDate() || null,
            contractDurationMonths: profile.contractDurationMonths ?? application?.contractDurationMonths ?? null,
            internshipEndDate: profile.internshipEndDate?.toDate() || application?.contractEndDate?.toDate() || null,
            compensationAmount: profile.compensationAmount ?? application?.offeredSalary ?? 0,
        };
        form.reset(defaultValues);
    }
  }, [open, profile, application, job, form, userProfile]);


  const onSubmit = async (values: AdminFormValues) => {
    if (!hrdProfile || !finalBrandId) return;
    setIsSaving(true);
    try {
        const batch = writeBatch(firestore);
        const employeeProfileRef = doc(firestore, 'employee_profiles', profile.uid);

        // Explicitly build the payload to ensure pristine default values are included.
        const employeePayload = {
            division: values.division,
            supervisorName: values.supervisorName,
            internSubtype: values.internSubtype,
            hrdNotes: values.hrdNotes,
            internshipStartDate: values.internshipStartDate ? Timestamp.fromDate(values.internshipStartDate) : null,
            contractDurationMonths: values.contractDurationMonths ?? null,
            internshipEndDate: values.internshipEndDate ? Timestamp.fromDate(values.internshipEndDate) : null,
            compensationAmount: values.compensationAmount ?? 0,
            // Non-form values that need to be set
            brandId: finalBrandId, 
            brandName: finalBrandName,
            updatedAt: serverTimestamp(),
        };

        batch.set(employeeProfileRef, employeePayload, { merge: true });

        const userRef = doc(firestore, 'users', profile.uid);
        batch.set(userRef, { employmentStage: values.internSubtype }, { merge: true });
        
        await batch.commit();
        toast({ title: 'Data Administrasi Disimpan' });
        onSuccess();
        onOpenChange(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal menyimpan data', description: error.message });
    } finally {
        setIsSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Edit Data Administrasi: {profile.fullName}</DialogTitle>
          <DialogDescription>
            Data ini hanya dapat diubah oleh HRD dan akan digunakan untuk keperluan internal.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
            <div className="space-y-4 py-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Ringkasan Penempatan</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <InfoRow label="Penempatan Brand" value={finalBrandName} />
                    </CardContent>
                </Card>

                <Form {...form}>
                <form id="intern-admin-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                    
                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Informasi Penempatan</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                            <FormField control={form.control} name="division" render={({ field }) => (<FormItem><FormLabel>Divisi</FormLabel><FormControl><Input placeholder="e.g., Creative, Finance" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="supervisorName" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Pilih Mentor / Supervisor</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Pilih dari daftar" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {managers.length > 0 && (
                                                <SelectGroup>
                                                    <SelectLabel>Manager</SelectLabel>
                                                    {managers.map(s => <SelectItem key={s.uid} value={s.fullName}>{s.fullName}</SelectItem>)}
                                                </SelectGroup>
                                            )}
                                            {employees.length > 0 && (
                                                <SelectGroup>
                                                    <SelectLabel>Karyawan</SelectLabel>
                                                    {employees.map(s => <SelectItem key={s.uid} value={s.fullName}>{s.fullName}</SelectItem>)}
                                                </SelectGroup>
                                            )}
                                            {managers.length === 0 && employees.length === 0 && (
                                                <SelectItem value="no-options" disabled>Tidak ada user yang cocok di brand ini.</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="internSubtype" render={({ field }) => (
                                <FormItem><FormLabel>Tipe Magang</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe magang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="intern_education">Terikat Pendidikan</SelectItem><SelectItem value="intern_pre_probation">Pra-Probation</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                            )}/>
                        </div>
                    </section>
                    
                    <Separator />
                    
                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Informasi Kontrak & Kompensasi</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                             <FormField
                                control={form.control}
                                name="compensationAmount"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Uang Saku (per bulan)</FormLabel>
                                    <FormControl>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground pointer-events-none">Rp</span>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="500.000"
                                            className="pl-8"
                                            value={formatSalary(field.value)}
                                            onChange={(e) => {
                                                const numericValue = unformatSalary(e.target.value);
                                                field.onChange(numericValue);
                                            }}
                                        />
                                    </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <div />
                            <FormField control={form.control} name="internshipStartDate" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Mulai Magang</FormLabel>
                                    <FormControl>
                                        <GoogleDatePicker 
                                            value={field.value} 
                                            onChange={field.onChange}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="contractDurationMonths" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Durasi (bulan)</FormLabel>
                                    <FormControl>
                                        <Input 
                                            type="number" 
                                            {...field} 
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <div className="md:col-span-2">
                                <FormField control={form.control} name="internshipEndDate" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Selesai Magang (Otomatis)</FormLabel>
                                    <FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} disabled /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )} />
                            </div>
                        </div>
                    </section>
                    
                    <Separator />
                    
                    <section>
                        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Catatan Internal HRD</h3>
                        <FormField control={form.control} name="hrdNotes" render={({ field }) => (<FormItem><FormControl><Textarea placeholder="Catatan internal..." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    </section>

                </form>
                </Form>
            </div>
        </div>
        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="intern-admin-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    