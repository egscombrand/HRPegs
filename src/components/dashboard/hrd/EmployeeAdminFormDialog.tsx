'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch, query, collection, where } from 'firebase/firestore';
import type { EmployeeProfile, Brand, UserProfile, JobApplication, Job, Division, EmploymentStatus } from '@/lib/types';
import { EMPLOYMENT_TYPES, EMPLOYMENT_STAGES, ROLES, EMPLOYMENT_STATUSES } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

const adminFormSchema = z.object({
  fullName: z.string().min(2, "Nama lengkap wajib diisi."),
  email: z.string().email(),
  role: z.enum(ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  employmentStage: z.enum(EMPLOYMENT_STAGES).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  employeeNumber: z.string().optional(),
  positionTitle: z.string().min(3, "Jabatan wajib diisi."),
  division: z.string().min(2, "Divisi wajib diisi."),
  brandId: z.string().min(1, "Brand wajib dipilih."),
  joinDate: z.date().optional().nullable(),
  managerUid: z.string().optional().nullable(),
});

type AdminFormValues = z.infer<typeof adminFormSchema>;

interface EmployeeAdminFormDialogProps {
  profile: EmployeeProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EmployeeAdminFormDialog({ open, onOpenChange, profile, onSuccess }: EmployeeAdminFormDialogProps) {
  const { userProfile: hrdProfile } = useAuth();
  const firestore = useFirestore();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { data: user, isLoading: isLoadingUser } = useDoc<UserProfile>(
    useMemoFirebase(() => profile ? doc(firestore, 'users', profile.uid) : null, [firestore, profile])
  );
  
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const form = useForm<AdminFormValues>({ resolver: zodResolver(adminFormSchema) });

  const selectedBrandId = form.watch('brandId');
  
  const { data: supervisors, isLoading: isLoadingSupervisors } = useCollection<UserProfile>(
    useMemoFirebase(() => query(collection(firestore, 'users'), where('role', 'in', ['manager', 'hrd', 'super-admin']), where('isActive', '==', true)), [firestore])
  );

  const { data: divisions, isLoading: isLoadingDivisions } = useCollection<Division>(
    useMemoFirebase(() => selectedBrandId ? query(collection(firestore, 'brands', selectedBrandId, 'divisions'), where('isActive', '==', true)) : null, [selectedBrandId, firestore])
  );

  useEffect(() => {
    if (open) {
      if (profile) {
        form.reset({
          fullName: profile.fullName,
          email: profile.email,
          role: user?.role || 'karyawan',
          employmentType: profile.employmentType || user?.employmentType || 'karyawan',
          employmentStage: user?.employmentStage || 'active',
          employmentStatus: profile.employmentStatus || 'active',
          employeeNumber: profile.employeeNumber || '',
          positionTitle: profile.positionTitle || '',
          division: profile.division || '',
          brandId: profile.brandId || user?.brandId as string || '',
          joinDate: profile.joinDate?.toDate(),
          managerUid: profile.managerUid || '',
        });
      } else {
        // Reset for create mode
        form.reset({
          fullName: '',
          email: '',
          role: 'karyawan',
          employmentType: 'karyawan',
          employmentStage: 'probation',
          employmentStatus: 'probation',
          employeeNumber: '',
          positionTitle: '',
          division: '',
          brandId: '',
          joinDate: new Date(),
          managerUid: '',
        });
      }
    }
  }, [open, profile, user, form]);

  const onSubmit = async (values: AdminFormValues) => {
    if (!hrdProfile || !profile) return;
    setIsSaving(true);
    
    const batch = writeBatch(firestore);
    const employeeProfileRef = doc(firestore, 'employee_profiles', profile.uid);
    const userRef = doc(firestore, 'users', profile.uid);

    const supervisor = supervisors?.find(s => s.uid === values.managerUid);
    const brand = brands?.find(b => b.id === values.brandId);

    const employeePayload = {
      uid: profile.uid,
      fullName: values.fullName,
      email: values.email,
      employmentType: values.employmentType,
      employmentStatus: values.employmentStatus,
      employeeNumber: values.employeeNumber,
      positionTitle: values.positionTitle,
      division: values.division,
      brandId: values.brandId,
      brandName: brand?.name || '',
      joinDate: values.joinDate ? Timestamp.fromDate(values.joinDate) : null,
      managerUid: supervisor?.uid || null,
      managerName: supervisor?.fullName || null,
      updatedAt: serverTimestamp(),
      createdAt: profile?.createdAt || serverTimestamp(),
    };
    batch.set(employeeProfileRef, employeePayload, { merge: true });

    const userPayload = {
        fullName: values.fullName,
        role: values.role,
        employmentType: values.employmentType,
        employmentStage: values.employmentStage,
        brandId: values.brandId,
        division: values.division,
        positionTitle: values.positionTitle,
    };
    batch.update(userRef, userPayload);
    
    try {
      await batch.commit();
      toast({ title: 'Data Karyawan Disimpan' });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan Data', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Data Administrasi: {profile?.fullName}</DialogTitle>
          <DialogDescription>
            Ubah data kepegawaian dan administrasi untuk pengguna ini. Perubahan akan disimpan di profil karyawan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="employee-admin-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            <h3 className="text-lg font-semibold border-b pb-2">Informasi Dasar</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem>)} />
            </div>

            <Separator className="my-6" />
            <h3 className="text-lg font-semibold border-b pb-2">Informasi Kepegawaian</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="employeeNumber" render={({ field }) => (<FormItem><FormLabel>NIK (Internal)</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="Contoh: 202407001" /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="positionTitle" render={({ field }) => (<FormItem><FormLabel>Jabatan</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="Contoh: Staff Keuangan" /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="joinDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Bergabung</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="employmentType" render={({ field }) => (<FormItem><FormLabel>Tipe Karyawan</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{EMPLOYMENT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="employmentStatus" render={({ field }) => (<FormItem><FormLabel>Status Kerja</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{EMPLOYMENT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>

            <Separator className="my-6" />
            <h3 className="text-lg font-semibold border-b pb-2">Struktur & Penempatan</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="brandId" render={({ field }) => (<FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl><SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="division" render={({ field }) => (<FormItem><FormLabel>Divisi</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedBrandId || isLoadingDivisions}><FormControl><SelectTrigger><SelectValue placeholder="Pilih divisi" /></SelectTrigger></FormControl><SelectContent>{divisions?.map(d => <SelectItem key={d.id!} value={d.name}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="managerUid" render={({ field }) => (<FormItem><FormLabel>Atasan Langsung</FormLabel><Select onValueChange={field.onChange} value={field.value ?? undefined}><FormControl><SelectTrigger><SelectValue placeholder="Pilih atasan" /></SelectTrigger></FormControl><SelectContent><SelectGroup><SelectLabel>Managers</SelectLabel>{supervisors?.filter(s => s.role === 'manager').map(s => <SelectItem key={s.uid} value={s.uid}>{s.fullName}</SelectItem>)}</SelectGroup><SelectGroup><SelectLabel>Lainnya</SelectLabel>{supervisors?.filter(s => s.role !== 'manager').map(s => <SelectItem key={s.uid} value={s.uid}>{s.fullName}</SelectItem>)}</SelectGroup></SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
          </form>
        </Form>
        <DialogFooter className="pt-4 mt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="employee-admin-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Data Karyawan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    