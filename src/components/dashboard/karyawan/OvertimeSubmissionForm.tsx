'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import type { OvertimeSubmission, UserProfile, EmployeeProfile, Brand } from '@/lib/types';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { format, differenceInMinutes, set, addDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const taskSchema = z.object({
  description: z.string().min(1, "Uraian tugas harus diisi."),
  estimatedMinutes: z.coerce.number().int().min(0, "Estimasi harus angka positif."),
  actualMinutes: z.coerce.number().int().min(0, "Aktual harus angka positif.").optional(),
});

const submissionSchema = z.object({
  date: z.date({ required_error: "Tanggal lembur harus diisi." }),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  overtimeType: z.enum(['hari_kerja', 'hari_libur', 'urgent'], { required_error: 'Tipe lembur harus dipilih.' }),
  tasks: z.array(taskSchema).min(1, "Minimal harus ada satu rincian tugas."),
  reason: z.string().min(10, { message: 'Alasan lembur harus diisi (minimal 10 karakter).' }),
  location: z.enum(['kantor', 'remote', 'site'], { required_error: 'Lokasi harus dipilih.' }),
  employeeNotes: z.string().optional(),
});

type FormValues = z.infer<typeof submissionSchema>;

interface OvertimeSubmissionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission | null;
  employeeProfile: EmployeeProfile | null;
  brands: Brand[];
  onSuccess: () => void;
}

export function OvertimeSubmissionForm({ open, onOpenChange, submission, employeeProfile, brands, onSuccess }: OvertimeSubmissionFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = submission ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(submissionSchema),
    defaultValues: { tasks: [{ description: '', estimatedMinutes: 60 }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tasks",
  });

  const { watch, setValue } = form;
  const startTimeStr = watch('startTime');
  const endTimeStr = watch('endTime');

  const displayInfo = useMemo(() => {
    const brandMap = new Map(brands.map(b => [b.id!, b.name]));
    
    let statusLabel = 'Karyawan';
    const empType = userProfile?.employmentType;
    const empStage = userProfile?.employmentStage;
    
    if (empType === 'magang') {
        if (empStage === 'intern_education') statusLabel = 'Magang (Pendidikan)';
        else if (empStage === 'intern_pre_probation') statusLabel = 'Magang (Pra-Probation)';
        else statusLabel = 'Magang';
    } else if (empType === 'training') {
        if (empStage === 'probation') statusLabel = 'Karyawan (Probation)';
        else statusLabel = 'Karyawan (Training)';
    } else if (userProfile?.role === 'karyawan') {
        statusLabel = 'Karyawan Aktif';
    }

    let finalPositionTitle = '-';
    if (userProfile?.positionTitle) {
      finalPositionTitle = userProfile.positionTitle;
    } else if (userProfile?.isDivisionManager && userProfile.managedDivision) {
      finalPositionTitle = `Manager Divisi ${userProfile.managedDivision}`;
    } else {
      let baseTitle = 'Staf';
      const stage = userProfile?.employmentStage || userProfile?.employmentType;
      switch (stage) {
        case 'intern_education': baseTitle = 'Peserta Magang'; break;
        case 'intern_pre_probation': baseTitle = 'Peserta Magang Pra-Probation'; break;
        case 'probation': 
        case 'training':
            baseTitle = 'Staf Probation'; break;
        case 'karyawan':
        case 'active': 
            baseTitle = 'Staf'; break;
        case 'magang': baseTitle = 'Peserta Magang'; break;
        default:
          if (userProfile?.role === 'manager') baseTitle = 'Manager';
          break;
      }
      
      const divisionName = employeeProfile?.division || userProfile?.managedDivision || userProfile?.division;
      if (divisionName) {
        finalPositionTitle = `${baseTitle} ${divisionName}`;
      } else {
        finalPositionTitle = baseTitle;
      }
    }

    const brandId = employeeProfile?.brandId || userProfile?.brandId;
    const singleBrandId = Array.isArray(brandId) ? brandId[0] : brandId;
    
    return {
        fullName: userProfile?.fullName || '',
        employmentStatus: statusLabel,
        brandName: employeeProfile?.brandName || (singleBrandId ? brandMap.get(singleBrandId) : 'N/A'),
        division: employeeProfile?.division || userProfile?.managedDivision || userProfile?.division || 'N/A',
        positionTitle: finalPositionTitle,
    }
  }, [userProfile, employeeProfile, brands]);
  
  const approvalFlow = useMemo(() => {
      if (userProfile?.isDivisionManager) return "Langsung ke HRD";
      return "Manager Divisi -> HRD";
  }, [userProfile]);

  const totalDuration = useMemo(() => {
    if (!startTimeStr || !endTimeStr) return 0;
    try {
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const start = set(new Date(), { hours: startH, minutes: startM });
        let end = set(new Date(), { hours: endH, minutes: endM });

        if (end < start) {
            end = addDays(end, 1);
        }

        return differenceInMinutes(end, start);
    } catch(e) {
        return 0;
    }
  }, [startTimeStr, endTimeStr]);

  useEffect(() => {
    if (open) {
      if (submission) {
        form.reset({
          date: submission.date.toDate(),
          startTime: submission.startTime,
          endTime: submission.endTime,
          overtimeType: submission.overtimeType,
          tasks: submission.tasks || [{ description: '', estimatedMinutes: 60 }],
          reason: submission.reason,
          location: submission.location,
          employeeNotes: submission.employeeNotes || '',
        });
      } else {
        form.reset({
          date: new Date(),
          startTime: '17:00',
          endTime: '19:00',
          overtimeType: 'hari_kerja',
          tasks: [{ description: '', estimatedMinutes: 60 }],
          reason: '',
          location: 'kantor',
          employeeNotes: '',
        });
      }
    }
  }, [open, submission, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const docRef = submission ? doc(firestore, 'overtime_submissions', submission.id!) : doc(collection(firestore, 'overtime_submissions'));
      
      const payload: Partial<OvertimeSubmission> = {
        ...values,
        date: Timestamp.fromDate(values.date),
        totalDurationMinutes: totalDuration,
        status: userProfile.isDivisionManager ? 'pending_hrd' : 'pending_manager',
        updatedAt: serverTimestamp() as Timestamp,
      };

      if (mode === 'create') {
        payload.uid = userProfile.uid;
        payload.fullName = userProfile.fullName;
        payload.brandId = Array.isArray(userProfile.brandId) ? userProfile.brandId[0] : userProfile.brandId as string;
        payload.division = displayInfo.division;
        payload.positionTitle = displayInfo.positionTitle;
        payload.managerUid = employeeProfile?.supervisorUid || 'NO_MANAGER_ASSIGNED'; // Fallback
        payload.createdAt = serverTimestamp() as Timestamp;
      }
      
      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({ title: `Pengajuan ${mode === 'Edit' ? 'Diperbarui' : 'Dibuat'}`, description: 'Pengajuan lembur Anda telah dikirim untuk persetujuan.' });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Form Pengajuan Lembur</DialogTitle>
          <DialogDescription>
            Lengkapi informasi berikut untuk mengajukan lembur. Pengajuan akan diteruskan sesuai alur persetujuan yang berlaku.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
        <Form {...form}>
          <form id="overtime-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8 py-4">
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="p-4 border rounded-lg space-y-2 text-sm">
                    <p className="font-semibold mb-2">Profil Anda</p>
                    <p className="text-muted-foreground">Nama: <span className="font-medium text-foreground">{displayInfo.fullName}</span></p>
                    <p className="text-muted-foreground">Status: <span className="font-medium text-foreground">{displayInfo.employmentStatus}</span></p>
                    <p className="text-muted-foreground">Brand: <span className="font-medium text-foreground">{displayInfo.brandName}</span></p>
                    <p className="text-muted-foreground">Divisi: <span className="font-medium text-foreground">{displayInfo.division}</span></p>
                    <p className="text-muted-foreground">Jabatan: <span className="font-medium text-foreground">{displayInfo.positionTitle}</span></p>
                </div>
                 <div className="p-4 border rounded-lg space-y-2 text-sm">
                    <p className="font-semibold mb-2">Informasi Persetujuan</p>
                    <p className="text-muted-foreground">Manager Divisi:</p>
                    <p className="font-medium text-foreground">{employeeProfile?.supervisorName || 'Belum Ditentukan'}</p>
                    <p className="text-muted-foreground mt-2">Divisi Approval Awal:</p>
                    <p className="font-medium text-foreground">{displayInfo.division}</p>
                     <p className="text-muted-foreground mt-2">Alur Persetujuan:</p>
                    <p className="font-medium text-foreground">{approvalFlow}</p>
                </div>
                <div className="p-4 border rounded-lg space-y-2 text-sm flex flex-col items-center justify-center">
                    <p className="text-muted-foreground">Total Estimasi Durasi:</p>
                    <p className="font-bold text-5xl">{totalDuration > 0 ? `${totalDuration}` : '-'}</p>
                     <p className="font-semibold text-muted-foreground">menit</p>
                </div>
            </section>
            
             <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="date" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Lembur</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="startTime" render={({ field }) => (<FormItem><FormLabel>Jam Mulai</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="endTime" render={({ field }) => (<FormItem><FormLabel>Jam Selesai</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)}/>
             </section>
             <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <FormField control={form.control} name="overtimeType" render={({ field }) => (<FormItem><FormLabel>Tipe Lembur</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl><SelectContent><SelectItem value="hari_kerja">Hari Kerja</SelectItem><SelectItem value="hari_libur">Hari Libur</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                 <FormField control={form.control} name="location" render={({ field }) => (<FormItem><FormLabel>Lokasi Kerja</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih lokasi" /></SelectTrigger></FormControl><SelectContent><SelectItem value="kantor">Kantor</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="site">Site/Lokasi Klien</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
             </section>

             <section className="space-y-4">
                <FormLabel>Rincian Pekerjaan</FormLabel>
                <div className="space-y-4">
                    {fields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-md relative space-y-4">
                            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <FormField control={form.control} name={`tasks.${index}.description`} render={({ field }) => (<FormItem><FormLabel>Uraian Tugas</FormLabel><FormControl><Textarea rows={2} placeholder="Deskripsikan pekerjaan yang akan dilakukan..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name={`tasks.${index}.estimatedMinutes`} render={({ field }) => (<FormItem><FormLabel>Estimasi (menit)</FormLabel><FormDescription>Perkiraan waktu untuk menyelesaikan.</FormDescription><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={form.control} name={`tasks.${index}.actualMinutes`} render={({ field }) => (<FormItem><FormLabel>Aktual (menit)</FormLabel><FormDescription>Diisi setelah lembur selesai.</FormDescription><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            </div>
                        </div>
                    ))}
                </div>
                 <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ description: '', estimatedMinutes: 60 })}><PlusCircle className="mr-2 h-4 w-4"/>Tambah Tugas</Button>
             </section>
             
             <section>
                <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Alasan Lembur</FormLabel><FormControl><Textarea rows={3} placeholder="Jelaskan kenapa pekerjaan ini perlu dilemburkan..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
             </section>
             <section>
                <FormField control={form.control} name="employeeNotes" render={({ field }) => (<FormItem><FormLabel>Catatan (Opsional)</FormLabel><FormControl><Textarea rows={2} placeholder="Catatan tambahan jika ada..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
             </section>
          </form>
        </Form>
        </div>
        <DialogFooter className="p-6 pt-6 border-t flex-shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="overtime-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4"/> Kirim Pengajuan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
