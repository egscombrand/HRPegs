'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import type { OvertimeSubmission, UserProfile } from '@/lib/types';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { format, differenceInMinutes, set } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const taskSchema = z.object({
  description: z.string().min(1, "Uraian tugas harus diisi."),
  estimatedMinutes: z.coerce.number().int().min(0, "Estimasi harus angka positif."),
  actualMinutes: z.coerce.number().int().min(0, "Aktual harus angka positif.").optional(),
  output: z.string().optional(),
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
  onSuccess: () => void;
}

export function OvertimeSubmissionForm({ open, onOpenChange, submission, onSuccess }: OvertimeSubmissionFormProps) {
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

  const totalDuration = useMemo(() => {
    if (!startTimeStr || !endTimeStr) return 0;
    try {
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const start = set(new Date(), { hours: startH, minutes: startM });
        let end = set(new Date(), { hours: endH, minutes: endM });

        // Handle overnight case
        if (end < start) {
            end = set(addDays(new Date(), 1), { hours: endH, minutes: endM });
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
        status: 'pending_manager',
        updatedAt: serverTimestamp() as Timestamp,
      };

      if (mode === 'create') {
        payload.uid = userProfile.uid;
        payload.fullName = userProfile.fullName;
        payload.brandId = userProfile.brandId as string;
        payload.division = userProfile.managedDivision || 'N/A';
        payload.positionTitle = userProfile.positionTitle || userProfile.role;
        payload.managerUid = userProfile.supervisorUid || 'NO_MANAGER_ASSIGNED'; // Fallback
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode} Pengajuan Lembur</DialogTitle>
          <DialogDescription>
            Isi semua detail yang diperlukan untuk pengajuan lembur.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 -mr-6 pl-1">
        <Form {...form}>
          <form id="overtime-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pr-4 py-4">
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg space-y-2 text-sm">
                    <p className="text-muted-foreground">Nama: <span className="font-semibold text-foreground">{userProfile?.fullName}</span></p>
                    <p className="text-muted-foreground">Divisi: <span className="font-semibold text-foreground">{userProfile?.managedDivision || 'N/A'}</span></p>
                    <p className="text-muted-foreground">Jabatan: <span className="font-semibold text-foreground">{userProfile?.positionTitle || userProfile?.role}</span></p>
                </div>
                <div className="p-4 border rounded-lg space-y-2 text-sm">
                    <p className="text-muted-foreground">Total Durasi:</p>
                    <p className="font-bold text-2xl">{totalDuration > 0 ? `${totalDuration} menit` : '-'}</p>
                </div>
            </section>
            
             <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="date" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Lembur</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="startTime" render={({ field }) => (<FormItem><FormLabel>Jam Mulai</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="endTime" render={({ field }) => (<FormItem><FormLabel>Jam Selesai</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)}/>
             </section>
             <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField control={form.control} name="overtimeType" render={({ field }) => (<FormItem><FormLabel>Tipe Lembur</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl><SelectContent><SelectItem value="hari_kerja">Hari Kerja</SelectItem><SelectItem value="hari_libur">Hari Libur</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                 <FormField control={form.control} name="location" render={({ field }) => (<FormItem><FormLabel>Lokasi Kerja</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih lokasi" /></SelectTrigger></FormControl><SelectContent><SelectItem value="kantor">Kantor</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="site">Site/Lokasi Klien</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
             </section>

             <section>
                <FormLabel>Rincian Pekerjaan</FormLabel>
                <div className="mt-2 space-y-2">
                    {fields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                            <FormField control={form.control} name={`tasks.${index}.description`} render={({ field }) => (<FormItem className="col-span-6"><FormControl><Textarea rows={1} placeholder="Uraian tugas..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            <FormField control={form.control} name={`tasks.${index}.estimatedMinutes`} render={({ field }) => (<FormItem className="col-span-2"><FormControl><Input type="number" placeholder="Estimasi" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            <FormField control={form.control} name={`tasks.${index}.actualMinutes`} render={({ field }) => (<FormItem className="col-span-2"><FormControl><Input type="number" placeholder="Aktual" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            <FormField control={form.control} name={`tasks.${index}.output`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input placeholder="Hasil/Link" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
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
        <DialogFooter className="border-t p-6">
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
