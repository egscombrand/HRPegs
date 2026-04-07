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
import { Loader2, PlusCircle, Trash2, Send, UserCheck, Mail } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import type { OvertimeSubmission, UserProfile, EmployeeProfile, Brand } from '@/lib/types';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { format, differenceInMinutes, set, addDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OvertimeStatusBadge } from './OvertimeStatusBadge';

const taskSchema = z.object({
  description: z.string().min(1, "Uraian tugas harus diisi."),
  estimatedMinutes: z.coerce.number().int().min(0, "Estimasi harus angka positif."),
  actualMinutes: z.coerce.number().int().min(0, "Aktual harus angka positif.").optional().nullable(),
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

const InfoRow = ({ label, value }: { label: string, value: string | number | null | undefined }) => (
    <div className="flex justify-between text-sm">
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium text-right">{value}</p>
    </div>
);

const ReviewCard = ({ title, decisionAt, notes }: { title: string, decisionAt?: Timestamp | null, notes?: string | null }) => (
    <Card>
        <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> {title}
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
                {decisionAt ? format(decisionAt.toDate(), 'dd MMM yyyy, HH:mm', { locale: idLocale }) : 'Belum direview'}
            </p>
        </CardHeader>
        <CardContent>
            {notes ? <p className="text-sm italic text-muted-foreground">"{notes}"</p> : <p className="text-sm text-muted-foreground">Tidak ada catatan.</p>}
        </CardContent>
    </Card>
);


export function OvertimeSubmissionForm({ open, onOpenChange, submission, employeeProfile, brands, onSuccess }: OvertimeSubmissionFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = submission ? 'Edit' : 'Buat';

  const form = useForm<FormValues>({
    resolver: zodResolver(submissionSchema),
    defaultValues: { tasks: [{ description: '', estimatedMinutes: 60, actualMinutes: null }] },
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
      return "Manager Divisi → HRD";
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
          tasks: submission.tasks.map(t => ({ ...t, actualMinutes: t.actualMinutes ?? null })) || [{ description: '', estimatedMinutes: 60, actualMinutes: null }],
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
          tasks: [{ description: '', estimatedMinutes: 60, actualMinutes: null }],
          reason: '',
          location: 'kantor',
          employeeNotes: '',
        });
      }
    }
  }, [open, submission, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile) {
        toast({ variant: 'destructive', title: 'Error', description: 'Authentication not found.' });
        return;
    };
    setIsSaving(true);
    try {
      const docRef = submission ? doc(firestore, 'overtime_submissions', submission.id!) : doc(collection(firestore, 'overtime_submissions'));
      
      const payload: any = {
        date: Timestamp.fromDate(values.date),
        startTime: values.startTime,
        endTime: values.endTime,
        overtimeType: values.overtimeType,
        tasks: values.tasks.map(task => ({
            description: task.description,
            estimatedMinutes: task.estimatedMinutes,
            actualMinutes: task.actualMinutes ?? null,
        })),
        reason: values.reason,
        location: values.location,
        employeeNotes: values.employeeNotes || null,
        totalDurationMinutes: totalDuration,
        status: userProfile.isDivisionManager ? 'pending_hrd' : 'pending_manager',
        updatedAt: serverTimestamp(),
      };

      if (mode === 'Buat') {
        const userBrandId = Array.isArray(userProfile.brandId) ? userProfile.brandId[0] : userProfile.brandId;
        if (!userBrandId) {
            throw new Error("Brand penempatan Anda belum diatur. Harap hubungi HRD.");
        }
        
        payload.uid = userProfile.uid;
        payload.fullName = userProfile.fullName;
        payload.brandId = userBrandId;
        payload.division = displayInfo.division;
        payload.positionTitle = displayInfo.positionTitle;
        payload.managerUid = employeeProfile?.managerUid || employeeProfile?.supervisorUid || null;
        payload.createdAt = serverTimestamp();
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

  const isReadOnly = !!(submission && submission.status !== 'draft' && !submission.status.startsWith('revision'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{submission ? (isReadOnly ? 'Detail Pengajuan Lembur' : 'Edit Pengajuan Lembur') : 'Form Pengajuan Lembur'}</DialogTitle>
          <DialogDescription>
            {isReadOnly ? 'Detail pengajuan lembur Anda.' : 'Lengkapi informasi berikut untuk mengajukan lembur. Pengajuan akan diteruskan sesuai alur persetujuan yang berlaku.'}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow">
          <div className="space-y-8 px-6 py-4">
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-4 space-y-2 text-sm">
                    <p className="font-semibold mb-2">Profil Anda</p>
                    <InfoRow label="Nama" value={displayInfo.fullName} />
                    <InfoRow label="Status" value={displayInfo.employmentStatus} />
                    <InfoRow label="Brand" value={displayInfo.brandName} />
                    <InfoRow label="Jabatan" value={displayInfo.positionTitle} />
                </Card>
                <Card className="p-4 space-y-2 text-sm">
                    <p className="font-semibold mb-2">Alur Persetujuan</p>
                    <InfoRow label="Manager Divisi" value={employeeProfile?.managerName || employeeProfile?.supervisorName || 'Belum Ditentukan'} />
                    <InfoRow label="Divisi Approval" value={displayInfo.division} />
                     <div className="flex justify-between text-sm pt-2 border-t mt-2">
                        <p className="text-muted-foreground">Alur</p>
                        <p className="font-medium text-right">{approvalFlow}</p>
                    </div>
                </Card>
                <Card className="p-4 space-y-2 text-sm flex flex-col items-center justify-center">
                    <p className="text-muted-foreground">Total Estimasi Durasi:</p>
                    <p className="font-bold text-5xl">{totalDuration > 0 ? `${totalDuration}` : '-'}</p>
                     <p className="font-semibold text-muted-foreground">menit</p>
                </Card>
            </section>
            
            {submission && submission.status !== 'draft' && (
                <section>
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">Jejak Persetujuan</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ReviewCard title="Review Manajer Divisi" decisionAt={submission.managerDecisionAt} notes={submission.managerNotes} />
                        <ReviewCard title="Review HRD" decisionAt={submission.hrdDecisionAt} notes={submission.hrdNotes} />
                    </div>
                </section>
            )}

            <Form {...form}>
              <form id="overtime-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField control={form.control} name="date" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Lembur</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="startTime" render={({ field }) => (<FormItem><FormLabel>Jam Mulai</FormLabel><FormControl><Input type="time" {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="endTime" render={({ field }) => (<FormItem><FormLabel>Jam Selesai</FormLabel><FormControl><Input type="time" {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)}/>
                </section>
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="overtimeType" render={({ field }) => (<FormItem><FormLabel>Tipe Lembur</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl><SelectContent><SelectItem value="hari_kerja">Hari Kerja</SelectItem><SelectItem value="hari_libur">Hari Libur</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="location" render={({ field }) => (<FormItem><FormLabel>Lokasi Kerja</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}><FormControl><SelectTrigger><SelectValue placeholder="Pilih lokasi" /></SelectTrigger></FormControl><SelectContent><SelectItem value="kantor">Kantor</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="site">Site/Lokasi Klien</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                </section>

                <section className="space-y-4">
                    <FormLabel>Rincian Pekerjaan</FormLabel>
                    <div className="space-y-6">
                        {fields.map((field, index) => (
                            <Card key={field.id} className="p-4 relative">
                                {!isReadOnly && <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>}
                                <div className="space-y-4">
                                <FormField control={form.control} name={`tasks.${index}.description`} render={({ field }) => (<FormItem><FormLabel>Uraian Tugas</FormLabel><FormControl><Textarea rows={2} placeholder="Deskripsikan pekerjaan yang akan dilakukan..." {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)}/>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={form.control} name={`tasks.${index}.estimatedMinutes`} render={({ field }) => (<FormItem><FormLabel>Estimasi (menit)</FormLabel><FormDescription>Perkiraan waktu untuk menyelesaikan.</FormDescription><FormControl><Input type="number" {...field} readOnly={isReadOnly} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name={`tasks.${index}.actualMinutes`} render={({ field }) => (<FormItem><FormLabel>Aktual (menit)</FormLabel><FormDescription>Diisi setelah lembur selesai.</FormDescription><FormControl><Input type="number" {...field} readOnly={isReadOnly} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                    {!isReadOnly && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({ description: '', estimatedMinutes: 60, actualMinutes: null })}><PlusCircle className="mr-2 h-4 w-4"/> Tambah Tugas</Button>}
                </section>
                
                <section>
                    <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Alasan Lembur</FormLabel><FormControl><Textarea rows={3} placeholder="Jelaskan kenapa pekerjaan ini perlu dilemburkan..." {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)}/>
                </section>
                <section>
                    <FormField control={form.control} name="employeeNotes" render={({ field }) => (<FormItem><FormLabel>Catatan (Opsional)</FormLabel><FormControl><Textarea rows={2} placeholder="Catatan tambahan jika ada..." {...field} readOnly={isReadOnly} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                </section>
              </form>
            </Form>
          </div>
        </ScrollArea>
        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Tutup</Button>
          {!isReadOnly && (
          <Button type="submit" form="overtime-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4"/> Kirim Pengajuan
          </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
