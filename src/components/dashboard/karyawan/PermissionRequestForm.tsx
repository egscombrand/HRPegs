'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, Trash2, Clock, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import { PERMISSION_TYPES, type PermissionRequest, type UserProfile, type EmployeeProfile, type Brand, type PermissionType } from '@/lib/types';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { format, differenceInMinutes, set, addDays, startOfDay, endOfDay, isBefore } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Timer, ArrowRight, ShieldCheck, User, Users, Landmark, Send } from 'lucide-react';

const PERMISSION_TYPE_LABELS = {
    tidak_masuk: 'Izin Tidak Masuk Bekerja',
    keluar_kantor: 'Izin Meninggalkan Kantor',
    sakit: 'Izin Sakit',
    cuti: 'Izin Cuti Tahunan',
};

// Base schema for all permission requests
// Schema for all permission requests

const formSchema = z.object({
  type: z.enum(PERMISSION_TYPES, { required_error: 'Jenis izin harus dipilih.' }),
  reason: z.string().min(10, "Alasan/keterangan harus diisi (minimal 10 karakter)."),
  startDate: z.date({ required_error: "Tanggal mulai harus diisi." }),
  endDate: z.date({ required_error: "Tanggal selesai harus diisi." }),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attachment: z.any().optional(),
}).superRefine((data, ctx) => {
    // Sick leave requires an attachment
    if (data.type === 'sakit' && !data.attachment) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Lampiran bukti pendukung wajib untuk izin sakit.",
            path: ["attachment"]
        });
    }
    
    // Office Exit (keluar_kantor) specific validations
    if (data.type === 'keluar_kantor') {
        if (!data.startTime || !data.endTime) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endTime"],
                message: "Jam mulai dan selesai harus diisi.",
            });
            return;
        }

        const [startH, startM] = data.startTime.split(':').map(Number);
        const [endH, endM] = data.endTime.split(':').map(Number);
        
        // Use a dummy date for time comparison
        const dummyDate = new Date(2000, 0, 1);
        const start = set(dummyDate, { hours: startH, minutes: startM, seconds: 0, milliseconds: 0 });
        const end = set(dummyDate, { hours: endH, minutes: endM, seconds: 0, milliseconds: 0 });
        
        const durationMinutes = differenceInMinutes(end, start);
        
        if (durationMinutes <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endTime"],
                message: "Jam selesai harus setelah jam mulai.",
            });
        } else if (durationMinutes > 1440) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endTime"],
                message: "Izin meninggalkan kantor maksimal 24 jam.",
            });
        }
    }
    
    // Check dates for other types
    if (data.type !== 'keluar_kantor' && data.endDate < data.startDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endDate"],
            message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
        });
    }
});


type FormValues = z.infer<typeof formSchema>;

interface PermissionRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: PermissionRequest | null;
  employeeProfile: EmployeeProfile | null;
  brands: Brand[];
  onSuccess: () => void;
  defaultType?: PermissionType;
}

const InfoRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex justify-between text-sm"><p className="text-muted-foreground">{label}</p><p className="font-medium text-right">{value}</p></div>
);

export function PermissionRequestForm({ open, onOpenChange, submission, employeeProfile, brands, onSuccess, defaultType }: PermissionRequestFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const isEditing = !!submission && (submission.status === 'draft' || submission.status.startsWith('revision'));
  const isViewing = !!submission && !isEditing;
  const isCreating = !submission;
  const mode = isCreating ? 'Buat' : (isEditing ? 'Edit' : 'Detail');

  const defaultTimes = useMemo(() => {
    const now = new Date();
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    return {
        start: format(now, 'HH:mm'),
        end: format(fourHoursLater, 'HH:mm')
    };
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        type: defaultType || 'tidak_masuk', 
        reason: '', 
        startDate: new Date(), 
        endDate: new Date(), 
        startTime: defaultTimes.start, 
        endTime: defaultTimes.end 
    }
  });

  const selectedType = form.watch('type');
  const selectedAttachment = form.watch('attachment');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');

  const durationMinutes = useMemo(() => {
    if (selectedType !== 'keluar_kantor' || !startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const start = set(new Date(), { hours: startH, minutes: startM, seconds: 0, milliseconds: 0 });
    const end = set(new Date(), { hours: endH, minutes: endM, seconds: 0, milliseconds: 0 });
    return differenceInMinutes(end, start);
  }, [selectedType, startTime, endTime]);

  // Proactive Time Suggestion
  useEffect(() => {
    if (selectedType === 'keluar_kantor' && startTime && !endTime) {
       const [h, m] = startTime.split(':').map(Number);
       const endH = Math.min(h + 4, 17); // Suggest +4 hours or max 17:00
       form.setValue('endTime', `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }, [selectedType, startTime, form, endTime]);

  // Reset times when switching type
  useEffect(() => {
     if (selectedType === 'keluar_kantor') {
        const currentStartTime = form.getValues('startTime');
        if (!currentStartTime) form.setValue('startTime', '09:00');
        const [h, m] = (currentStartTime || '09:00').split(':').map(Number);
        const endH = Math.min(h + 4, 17);
        form.setValue('endTime', `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
     }
  }, [selectedType, form]);

  useEffect(() => {
    if(open) {
        if (!submission) {
            form.reset({
                type: 'tidak_masuk',
                startDate: new Date(),
                endDate: new Date(),
                startTime: defaultTimes.start,
                endTime: defaultTimes.end,
                reason: '',
            });
        } else {
            form.reset({
                type: submission.type,
                reason: submission.reason,
                startDate: submission.startDate.toDate(),
                endDate: submission.endDate.toDate(),
                startTime: format(submission.startDate.toDate(), 'HH:mm'),
                endTime: format(submission.endDate.toDate(), 'HH:mm'),
                attachment: submission.attachments?.[0] || undefined,
            });
        }
    }
  }, [open, submission, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile || !employeeProfile) return;
    setIsSaving(true);
    try {
        let attachmentUrl = '';
        if (values.type === 'sakit' && values.attachment instanceof File) {
            const storage = getStorage();
            const storageRef = ref(storage, `medical_proofs/${userProfile.uid}/${Date.now()}-${values.attachment.name}`);
            const uploadSnapshot = await uploadBytes(storageRef, values.attachment);
            attachmentUrl = await getDownloadURL(uploadSnapshot.ref);
        }

        const docRef = submission ? doc(firestore, 'permission_requests', submission.id!) : doc(collection(firestore, 'permission_requests'));
        let startDate = startOfDay(values.startDate);
        let endDate = endOfDay(values.endDate);

        if (values.type === 'keluar_kantor') {
            const [startH, startM] = values.startTime?.split(':').map(Number) || [9, 0];
            const [endH, endM] = values.endTime?.split(':').map(Number) || [17, 0];
            startDate = set(values.startDate, { hours: startH, minutes: startM });
            endDate = set(values.startDate, { hours: endH, minutes: endM });
        }

        const totalDurationMinutes = differenceInMinutes(endDate, startDate);

        // Operational workflow logic
        const isOfficeExit = values.type === 'keluar_kantor';
        const initialStatus: PermissionRequest['status'] = isOfficeExit 
            ? 'reported' 
            : (userProfile.isDivisionManager ? 'pending_hrd' : 'pending_manager');

        const payload: Omit<PermissionRequest, 'id' | 'createdAt' | 'updatedAt'> = {
            uid: userProfile.uid,
            fullName: userProfile.fullName,
            brandId: Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : (employeeProfile.brandId || ''),
            division: employeeProfile.division || 'N/A',
            positionTitle: employeeProfile.positionTitle || (userProfile.employmentType === 'magang' ? 'Magang' : 'Karyawan'),
            type: values.type,
            reason: values.reason,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            totalDurationMinutes: totalDurationMinutes,
            attachments: attachmentUrl ? [attachmentUrl] : [],
            status: initialStatus,
            managerUid: employeeProfile.supervisorUid || null,
            // Plan fields for office exit
            reportedExitAt: isOfficeExit ? Timestamp.fromDate(startDate) : null,
            expectedReturnAt: isOfficeExit ? Timestamp.fromDate(endDate) : null,
            estimatedDurationMinutes: isOfficeExit ? totalDurationMinutes : undefined,
        };

        await setDocumentNonBlocking(docRef, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        
        toast({ title: isEditing ? 'Perubahan Disimpan' : 'Pengajuan Terkirim' });
        onSuccess();
        onOpenChange(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  const handleReportReturn = async () => {
    if (!submission || !userProfile) return;
    setIsSaving(true);
    try {
        const now = new Date();
        const startAt = submission.reportedExitAt?.toDate() || submission.startDate.toDate();
        const expectedAt = submission.expectedReturnAt?.toDate() || submission.endDate.toDate();
        const actualDuration = differenceInMinutes(now, startAt);
        const isLate = isBefore(expectedAt, now);
        const isOverFourHours = actualDuration > 240;

        const docRef = doc(firestore, 'permission_requests', submission.id!);
        await setDocumentNonBlocking(docRef, { 
            status: 'returned', 
            actualReturnAt: Timestamp.fromDate(now),
            returnSource: 'manual_button',
            actualDurationMinutes: actualDuration,
            exceededEstimatedReturn: isLate,
            exceededFourHours: isOverFourHours,
            overtimeReturnMinutes: isLate ? differenceInMinutes(now, expectedAt) : 0,
            needsManagerAttention: isLate || isOverFourHours,
            updatedAt: serverTimestamp() 
        }, { merge: true });
        
        toast({ title: 'Laporan Kembali Terkirim', description: 'Selamat kembali bekerja!' });
        onSuccess();
        onOpenChange(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: 'Gagal Mengirim Laporan', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader className="p-6 pb-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b relative z-10">
          <div className="flex items-center justify-between mb-1">
            <div className="space-y-1">
                <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Detail Izin
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                    {isViewing ? "Informasi lengkap status pengajuan izin Anda." : "Silakan lengkapi data pengajuan izin."}
                </DialogDescription>
            </div>
            {submission && <Badge variant="outline" className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700">{submission.status.replace(/_/g, ' ')}</Badge>}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-8 max-w-4xl mx-auto space-y-8">
            
            {/* Alur Proses (Minimal & Corporate) */}
            <section className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-slate-50/50 dark:bg-slate-900/50">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Alur Proses</h3>
                <div className="flex items-center gap-6">
                    {[
                        { label: 'Karyawan Lapor', done: true },
                        { label: 'Kembali & Tap-In', done: !!submission?.actualReturnAt || submission?.status === 'returned', skip: submission?.type !== 'keluar_kantor' },
                        { label: 'Verifikasi Manager', done: submission?.status === 'verified_manager' || submission?.status === 'approved' }
                    ].filter(s => !s.skip).map((step, i, arr) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className={cn(
                                "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
                                step.done ? "bg-emerald-500 border-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                            )}>
                                {step.done ? <CheckCircle2 className="h-3 w-3" /> : (i + 1)}
                            </div>
                            <span className={cn("text-xs font-semibold", step.done ? "text-slate-900 dark:text-slate-100" : "text-slate-400")}>
                                {step.label}
                            </span>
                            {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                        </div>
                    ))}
                </div>
                {submission?.status === 'reported' && (
                    <div className="mt-4 p-4 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Info className="h-4 w-4 text-indigo-500" />
                            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Anda sedang dalam status izin keluar. Silakan lapor kembali jika sudah di kantor.</p>
                        </div>
                        <Button 
                            onClick={handleReportReturn}
                            disabled={isSaving}
                            variant="secondary"
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white border-none h-8 font-bold text-[10px] uppercase px-4 whitespace-nowrap"
                        >
                            {isSaving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
                            Lapor Kembali
                        </Button>
                    </div>
                )}
            </section>

            {isViewing ? (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                        <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Informasi Pengajuan</CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                            <InfoRow label="Nama Karyawan" value={submission!.fullName} />
                            <InfoRow label="Divisi / Posisi" value={`${submission!.division} / ${submission!.positionTitle}`} />
                            <InfoRow label="Jenis Izin" value={PERMISSION_TYPE_LABELS[submission!.type as keyof typeof PERMISSION_TYPE_LABELS] || submission!.type} />
                            <InfoRow label="Alasan" value={submission!.reason} />
                            <InfoRow label="Dibuat Pada" value={format(submission!.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: idLocale })} />
                        </CardContent>
                    </Card>

                    {submission!.type === 'keluar_kantor' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Informasi Keluar Kantor</CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 space-y-4">
                                    <InfoRow label="Jam Laporan Keluar" value={submission!.reportedExitAt ? format(submission!.reportedExitAt.toDate(), 'HH:mm') : '-'} />
                                    <InfoRow label="Perkiraan Kembali" value={format(submission!.endDate.toDate(), 'HH:mm')} />
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Informasi Kembali ke Kantor</CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 space-y-4">
                                    <InfoRow label="Status Kembali" value={submission!.actualReturnAt ? "Sudah Kembali" : "Belum Kembali"} />
                                    <InfoRow label="Jam Tap-In Kembali" value={submission!.actualReturnAt ? format(submission!.actualReturnAt.toDate(), 'HH:mm') : '-'} />
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {submission!.type !== 'keluar_kantor' && (
                        <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                            <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Detail Waktu</CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                <InfoRow label="Dari Tanggal" value={format(submission!.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} />
                                <InfoRow label="Sampai Tanggal" value={format(submission!.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} />
                                <InfoRow label="Total Durasi" value={`${submission!.totalDurationMinutes} menit`} />
                            </CardContent>
                        </Card>
                    )}

                    {submission!.attachments && submission!.attachments.length > 0 && (
                        <div className="space-y-2">
                             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Lampiran / Dokumen</p>
                             <Button variant="outline" size="sm" asChild className="h-10 text-xs gap-2">
                                <a href={submission!.attachments[0]} target="_blank" rel="noopener noreferrer">
                                    <FileUp className="h-3 w-3" /> Lihat Lampiran
                                </a>
                             </Button>
                        </div>
                    )}
                </div>
            ) : (
                <Form {...form}>
                  <form id="permission-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                    <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                        <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Form Pengajuan</CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-6">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500">Jenis Izin</FormLabel>
                                    <Select 
                                        onValueChange={field.onChange} 
                                        value={field.value} 
                                        disabled={!!defaultType || isViewing}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="h-14 text-base transition-all focus:ring-4 focus:ring-primary/10 rounded-xl border-slate-100 dark:border-slate-800">
                                                <SelectValue placeholder="Pilih jenis izin" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        {Object.entries(PERMISSION_TYPE_LABELS).map(([key, label]) => (
                                            <SelectItem key={key} value={key} className="py-3 cursor-pointer">{label}</SelectItem>
                                        ))}
                                        </SelectContent>
                                    </Select>

                                    <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {selectedType === 'keluar_kantor' && (
                                <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2">
                                            <Timer className="h-4 w-4 text-indigo-500" />
                                            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Estimasi Durasi Izin</span>
                                        </div>
                                        <Badge variant="secondary" className="font-bold px-4 py-1 rounded-full text-[10px] bg-indigo-50 text-indigo-600 border-indigo-100">
                                            {Math.floor(durationMinutes / 60)}j {durationMinutes % 60}m
                                        </Badge>
                                    </div>
                                    <Progress 
                                        value={Math.min((durationMinutes / 240) * 100, 100)} 
                                        className="h-2 rounded-full transition-all duration-700 border-none bg-slate-100 dark:bg-slate-800 [&>div]:bg-indigo-500 shadow-none"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                                <FormField 
                                    control={form.control} 
                                    name="startDate" 
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500">
                                                {selectedType === 'keluar_kantor' ? 'Tanggal Izin' : 'Tanggal Mulai'}
                                            </FormLabel>
                                            <FormControl>
                                                <GoogleDatePicker value={field.value} onChange={field.onChange} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {selectedType === 'keluar_kantor' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField 
                                            control={form.control} 
                                            name="startTime" 
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500">Mulai</FormLabel>
                                                    <FormControl>
                                                        <Input type="time" className="h-14 font-mono text-lg rounded-xl border-slate-100 dark:border-slate-800" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField 
                                            control={form.control} 
                                            name="endTime" 
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500">Kembali</FormLabel>
                                                    <FormControl>
                                                        <Input type="time" className="h-14 font-mono text-lg rounded-xl border-slate-100 dark:border-slate-800" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                ) : (
                                    <FormField 
                                        control={form.control} 
                                        name="endDate" 
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500">Selesai</FormLabel>
                                                <FormControl>
                                                    <GoogleDatePicker value={field.value} onChange={field.onChange} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="border-none shadow-md bg-white dark:bg-slate-900 rounded-3xl">
                        <CardContent className="p-8 space-y-8">
                            <FormField 
                                control={form.control} 
                                name="reason" 
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500">Keterangan / Alasan</FormLabel>
                                        <FormControl>
                                            <Textarea 
                                                rows={4} 
                                                className="resize-none text-base rounded-xl border-slate-100 dark:border-slate-800 transition-all focus:ring-4 focus:ring-primary/10" 
                                                placeholder="Jelaskan keperluan Anda secara rinci..." 
                                                {...field} 
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {selectedType === 'sakit' && (
                                <FormField
                                  control={form.control}
                                  name="attachment"
                                  render={({ field: { value, onChange, ...fieldProps } }) => (
                                    <FormItem className="space-y-4">
                                      <FormLabel className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                                          <span>Lampiran Surat Sakit</span>
                                          <Badge variant="destructive" className="font-black text-[9px] px-3">WAJIB</Badge>
                                      </FormLabel>
                                      <FormControl>
                                        <div className="relative">
                                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="medical-attachment" onChange={(e) => onChange(e.target.files?.[0])} {...fieldProps} />
                                            <div onClick={() => document.getElementById('medical-attachment')?.click()} className="w-full h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer">
                                                <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-white", selectedAttachment ? "bg-emerald-500" : "bg-primary")}>
                                                    {selectedAttachment ? <CheckCircle2 className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
                                                </div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                    {selectedAttachment ? selectedAttachment.name : "Klik untuk upload lampiran"}
                                                </p>
                                            </div>
                                        </div>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                            )}
                        </CardContent>
                    </Card>
                  </form>
                </Form>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md sm:justify-between items-center gap-4">
          <Button variant="outline" className="px-6 h-10 text-xs font-semibold uppercase tracking-wider" onClick={() => onOpenChange(false)}>
              {isViewing ? 'Tutup' : 'Batal'}
          </Button>
          
          {!isViewing && (
              <Button 
                type="submit" 
                form="permission-form" 
                disabled={isSaving}
                className={cn(
                    "px-8 h-10 font-bold text-xs uppercase tracking-widest shadow-sm",
                    selectedType === 'keluar_kantor' ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100" : "bg-primary shadow-primary/10"
                )}
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {selectedType === 'keluar_kantor' ? 'Laporkan Keluar Kantor' : 'Kirim Pengajuan Izin'}
              </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
