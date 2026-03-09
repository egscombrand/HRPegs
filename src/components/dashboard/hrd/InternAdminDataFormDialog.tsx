'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch, query, collection, where } from 'firebase/firestore';
import type { EmployeeProfile, Brand, UserProfile, JobApplication } from '@/lib/types';
import { ROLES_INTERNAL } from '@/lib/types';
import { addMonths } from 'date-fns';

const adminFormSchema = z.object({
  brandId: z.string().min(1, 'Brand penempatan harus dipilih.'),
  division: z.string().optional(),
  supervisorName: z.string().optional(),
  internSubtype: z.enum(['intern_education', 'intern_pre_probation'], { required_error: "Tipe magang harus dipilih." }),
  compensationAmount: z.coerce.number().min(0, 'Kompensasi tidak boleh negatif.').optional(),
  internshipStartDate: z.date().optional().nullable(),
  contractDurationMonths: z.coerce.number().int().min(1, 'Durasi kontrak minimal 1 bulan.').optional().nullable(),
  internshipEndDate: z.date().optional().nullable(),
  hrdNotes: z.string().optional(),
});

type AdminFormValues = z.infer<typeof adminFormSchema>;

interface InternAdminDataFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: EmployeeProfile;
  application: JobApplication | null;
  onSuccess: () => void;
}

const formatSalary = (value: number | string | undefined | null) => {
    if (value === undefined || value === null || value === '') return '';
    const num = typeof value === 'string' ? parseInt(value.replace(/\./g, ''), 10) : value;
    if (isNaN(num)) return '';
    return num.toLocaleString('id-ID');
};

const unformatSalary = (value: string) => {
    return parseInt(value.replace(/\./g, ''), 10) || 0;
};

export function InternAdminDataFormDialog({ open, onOpenChange, profile, application, onSuccess }: InternAdminDataFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile: hrdProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );
  
  const { data: supervisors, isLoading: isLoadingSupervisors } = useCollection<UserProfile>(
    useMemoFirebase(() => query(collection(firestore, 'users'), where('role', 'in', ['manager', 'karyawan'])), [firestore])
  );

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
  });
  
  const { watch, setValue } = form;
  const startDate = watch('internshipStartDate');
  const duration = watch('contractDurationMonths');
  const selectedBrandId = watch('brandId');

  const filteredSupervisors = useMemo(() => {
    if (!supervisors || !selectedBrandId) return [];

    return supervisors.filter(user => {
      // Exclude the intern themselves from being their own supervisor
      if (user.uid === profile.uid) {
        return false;
      }
      
      // Must be an active manager or employee
      if (!user.isActive || !['manager', 'karyawan'].includes(user.role)) {
        return false;
      }
      
      // Must match the brand
      if (Array.isArray(user.brandId)) {
        return user.brandId.includes(selectedBrandId);
      }
      return user.brandId === selectedBrandId;
    });
  }, [supervisors, selectedBrandId, profile.uid]);

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
      form.reset({
        brandId: profile.brandId || application?.brandId || '',
        division: profile.division || '',
        supervisorName: profile.supervisorName || '',
        internSubtype: profile.internSubtype || 'intern_education',
        compensationAmount: profile.compensationAmount ?? application?.offeredSalary ?? 0,
        internshipStartDate: profile.internshipStartDate?.toDate() || application?.contractStartDate?.toDate() || null,
        contractDurationMonths: profile.contractDurationMonths ?? application?.contractDurationMonths ?? null,
        internshipEndDate: profile.internshipEndDate?.toDate() || application?.contractEndDate?.toDate() || null,
        hrdNotes: profile.hrdNotes || application?.offerNotes || '',
      });
    }
  }, [profile, application, open, form]);

  const onSubmit = async (values: AdminFormValues) => {
    if (!hrdProfile) return;
    setIsSaving(true);
    try {
        const batch = writeBatch(firestore);

        const employeeProfileRef = doc(firestore, 'employee_profiles', profile.uid);
        const employeePayload = {
            ...values,
            brandId: values.brandId,
            brandName: brands?.find(b => b.id === values.brandId)?.name || '',
            internshipStartDate: values.internshipStartDate ? Timestamp.fromDate(values.internshipStartDate) : null,
            internshipEndDate: values.internshipEndDate ? Timestamp.fromDate(values.internshipEndDate) : null,
            updatedAt: serverTimestamp(),
        };
        batch.set(employeeProfileRef, employeePayload, { merge: true });

        const userRef = doc(firestore, 'users', profile.uid);
        batch.set(userRef, {
            employmentStage: values.internSubtype,
            brandId: values.brandId,
        }, { merge: true });
        
        await batch.commit();
        toast({ title: 'Data Administrasi Disimpan' });
        onSuccess();
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal menyimpan data', description: error.message });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Data Administrasi: {profile.fullName}</DialogTitle>
          <DialogDescription>
            Data ini hanya dapat diubah oleh HRD dan akan digunakan untuk keperluan internal.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="intern-admin-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField control={form.control} name="brandId" render={({ field }) => (
                <FormItem><FormLabel>Penempatan Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl><SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )}/>
             <FormField control={form.control} name="division" render={({ field }) => (<FormItem><FormLabel>Divisi</FormLabel><FormControl><Input placeholder="e.g., Creative, Finance" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
             <FormField control={form.control} name="supervisorName" render={({ field }) => (
                <FormItem><FormLabel>Supervisor / PIC</FormLabel><Select onValueChange={field.onChange} value={field.value || ''} disabled={isLoadingSupervisors}><FormControl><SelectTrigger><SelectValue placeholder="Pilih Supervisor" /></SelectTrigger></FormControl><SelectContent>{filteredSupervisors.map(s => <SelectItem key={s.uid} value={s.fullName}>{s.fullName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="internSubtype" render={({ field }) => (
                <FormItem><FormLabel>Tipe Magang</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe magang" /></SelectTrigger></FormControl><SelectContent><SelectItem value="intern_education">Terikat Pendidikan</SelectItem><SelectItem value="intern_pre_probation">Pra-Probation</SelectItem></SelectContent></Select><FormMessage /></FormItem>
            )}/>
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
                            type="text" inputMode="numeric" placeholder="300.000" className="pl-8"
                            value={formatSalary(field.value)}
                            onChange={(e) => field.onChange(unformatSalary(e.target.value))}
                        />
                    </div>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="internshipStartDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Mulai Magang</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField
                    control={form.control}
                    name="contractDurationMonths"
                    render={({ field }) => (
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
                    )}
                  />
            </div>
             <FormField control={form.control} name="internshipEndDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Selesai Magang</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
             <FormField control={form.control} name="hrdNotes" render={({ field }) => (<FormItem><FormLabel>Catatan HRD (Internal)</FormLabel><FormControl><Textarea placeholder="Catatan internal..." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
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
