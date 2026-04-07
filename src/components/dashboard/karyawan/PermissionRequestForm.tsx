'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, Info, CheckCircle2, AlertCircle, Timer, ArrowRight, ShieldCheck, User, Users, Landmark, Send, X, CalendarCheck } from 'lucide-react';
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
import { compressAndResizeImage } from '@/lib/image-compression';


const PERMISSION_TYPE_LABELS: Record<PermissionType, string> = {
    keluar_kantor: 'Izin Meninggalkan Kantor',
    sakit: 'Izin Sakit',
    tidak_masuk: 'Izin Tidak Masuk',
    duka: 'Izin Duka Cita',
    akademik: 'Izin Akademik',
    lainnya: 'Izin Lainnya',
    cuti: 'Izin Cuti Tahunan',
};

const formSchema = z.object({
  type: z.enum(PERMISSION_TYPES, { required_error: 'Jenis izin harus dipilih.' }),
  reason: z.string().min(10, "Alasan/keterangan harus diisi (minimal 10 karakter)."),
  startDate: z.date({ required_error: "Tanggal mulai harus diisi." }),
  endDate: z.date({ required_error: "Tanggal selesai harus diisi." }),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attachment: z.any().optional(),

  // --- Field Khusus ---
  sicknessDescription: z.string().optional(),
  familyRelation: z.string().optional(),
  academicActivityName: z.string().optional(),
  academicInstitution: z.string().optional(),
  otherLeaveTitle: z.string().optional(),
  destination: z.string().optional(),

}).superRefine((data, ctx) => {
    const durationDays = differenceInMinutes(data.endDate, data.startDate) / 1440;
    
    // Izin Sakit
    if (data.type === 'sakit' && durationDays > 1 && !data.attachment) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Lampiran wajib untuk izin sakit lebih dari 1 hari.", path: ["attachment"] });
    }

    // Izin Keluar
    if (data.type === 'keluar_kantor') {
        if (!data.startTime || !data.endTime) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "Jam mulai dan selesai harus diisi." });
            return;
        }
        const [startH, startM] = data.startTime.split(':').map(Number);
        const [endH, endM] = data.endTime.split(':').map(Number);
        const start = set(new Date(), { hours: startH, minutes: startM });
        let end = set(new Date(), { hours: endH, minutes: endM });
        if (end < start) end = addDays(end, 1);
        
        if (differenceInMinutes(end, start) <= 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "Jam selesai harus setelah jam mulai." });
        }
    }
    
    // Validasi field khusus lainnya
    if (data.type === 'duka' && !data.familyRelation) ctx.addIssue({ code: 'custom', path: ['familyRelation'], message: 'Hubungan keluarga harus diisi.' });
    if (data.type === 'akademik' && !data.academicActivityName) ctx.addIssue({ code: 'custom', path: ['academicActivityName'], message: 'Nama kegiatan harus diisi.' });
    if (data.type === 'lainnya' && !data.otherLeaveTitle) ctx.addIssue({ code: 'custom', path: ['otherLeaveTitle'], message: 'Judul izin harus diisi.' });
    if (data.type === 'keluar_kantor' && !data.destination) ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Tujuan harus diisi.' });

    // Cek tanggal
    if (data.type !== 'keluar_kantor' && data.endDate < data.startDate) {
        ctx.addIssue({ code: 'custom', path: ["endDate"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai." });
    }
});

// ... (rest of the component)
// ...

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

const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="flex justify-between text-sm"><p className="text-muted-foreground">{label}</p><p className="font-medium text-right">{value ?? '-'}</p></div>
);

export function PermissionRequestForm({ open, onOpenChange, submission, employeeProfile, brands, onSuccess, defaultType }: PermissionRequestFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const isEditing = !!submission && (submission.status === 'draft' || submission.status.startsWith('revision'));
  const isViewing = !!submission && !isEditing;
  const isCreating = !submission;
  const mode = isCreating ? 'Buat' : (isEditing ? 'Edit' : 'Detail');
  const isReadOnly = isViewing;

  const defaultTimes = useMemo(() => ({ start: '09:00', end: '17:00' }), []);

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

  const { watch, setValue } = form;
  const selectedType = watch('type');
  const selectedAttachment = watch('attachment');
  const startTime = watch('startTime');
  const endTime = watch('endTime');
  const startDate = watch('startDate');
  const endDate = watch('endDate');

  const durationMinutes = useMemo(() => {
      if (selectedType === 'keluar_kantor') {
          if (!startTime || !endTime) return 0;
          const [startH, startM] = startTime.split(':').map(Number);
          const [endH, endM] = endTime.split(':').map(Number);
          const start = set(new Date(), { hours: startH, minutes: startM, seconds: 0, milliseconds: 0 });
          let end = set(new Date(), { hours: endH, minutes: endM, seconds: 0, milliseconds: 0 });
          if (end < start) end = addDays(end, 1);
          return differenceInMinutes(end, start);
      } else {
          if (!startDate || !endDate) return 0;
          return differenceInMinutes(endOfDay(endDate), startOfDay(startDate)) + 1; // Inclusive of start day
      }
  }, [selectedType, startTime, endTime, startDate, endDate]);

  useEffect(() => {
    if (open) {
        if (!submission) {
            form.reset({
                type: defaultType || 'tidak_masuk', startDate: new Date(), endDate: new Date(),
                startTime: defaultTimes.start, endTime: defaultTimes.end, reason: '',
            });
        } else {
            form.reset({
                type: submission.type, reason: submission.reason,
                startDate: submission.startDate.toDate(), endDate: submission.endDate.toDate(),
                startTime: format(submission.startDate.toDate(), 'HH:mm'),
                endTime: format(submission.endDate.toDate(), 'HH:mm'),
                attachment: submission.attachments?.[0] || undefined,
                sicknessDescription: submission.sicknessDescription || '',
                familyRelation: submission.familyRelation || '',
                academicActivityName: submission.academicActivityName || '',
                academicInstitution: submission.academicInstitution || '',
                otherLeaveTitle: submission.otherLeaveTitle || '',
                destination: submission.destination || '',
            });
        }
    }
  }, [open, submission, form, defaultType, defaultTimes]);
  
  const handleSubmit = async (values: FormValues) => {
    if (!userProfile || !employeeProfile) return;
    setIsSaving(true);
    let attachmentUrl = '';
    try {
        if (values.attachment instanceof File) {
            const compressedFile = await compressAndResizeImage(values.attachment, 1024, 0.8);
            const storage = getStorage();
            const storageRef = ref(storage, `permission-attachments/${userProfile.uid}/${Date.now()}-${compressedFile.name}`);
            const uploadSnapshot = await uploadBytes(storageRef, compressedFile);
            attachmentUrl = await getDownloadURL(uploadSnapshot.ref);
        } else if (typeof values.attachment === 'string') {
            attachmentUrl = values.attachment; // Keep existing URL if file not changed
        }

        const docRef = submission ? doc(firestore, 'permission_requests', submission.id!) : doc(collection(firestore, 'permission_requests'));
        let finalStartDate = startOfDay(values.startDate);
        let finalEndDate = endOfDay(values.endDate);

        if (values.type === 'keluar_kantor') {
            const [startH, startM] = values.startTime?.split(':').map(Number) || [9, 0];
            const [endH, endM] = values.endTime?.split(':').map(Number) || [17, 0];
            finalStartDate = set(values.startDate, { hours: startH, minutes: startM });
            finalEndDate = set(values.startDate, { hours: endH, minutes: endM });
        }
        
        const finalDurationMinutes = differenceInMinutes(finalEndDate, finalStartDate);

        const initialStatus: PermissionRequest['status'] = userProfile.isDivisionManager ? 'pending_hrd' : 'pending_manager';

        const payload: Omit<PermissionRequest, 'id' | 'createdAt' | 'updatedAt'> = {
            uid: userProfile.uid, fullName: userProfile.fullName,
            brandId: Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : (employeeProfile.brandId || ''),
            division: employeeProfile.division || 'N/A', positionTitle: employeeProfile.positionTitle || 'Staf',
            type: values.type, reason: values.reason,
            startDate: Timestamp.fromDate(finalStartDate), endDate: Timestamp.fromDate(finalEndDate),
            totalDurationMinutes: finalDurationMinutes,
            attachments: attachmentUrl ? [attachmentUrl] : [],
            status: submission?.status === 'draft' || isCreating ? initialStatus : submission.status,
            managerUid: employeeProfile.managerUid || employeeProfile.supervisorUid || null,
            attachmentStatus: values.attachment ? 'provided' : (values.type === 'sakit' && durationMinutes / 1440 <= 1 ? 'verification_needed' : 'not_provided'),
            ...getSpecificFields(values),
        };

        await setDocumentNonBlocking(docRef, { ...payload, [isCreating ? 'createdAt' : 'updatedAt']: serverTimestamp() }, { merge: true });
        
        toast({ title: isEditing ? 'Perubahan Disimpan' : 'Pengajuan Terkirim' });
        onSuccess();
        onOpenChange(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  const getSpecificFields = (values: FormValues) => {
    const specificFields: Partial<PermissionRequest> = {};
    switch (values.type) {
        case 'sakit': specificFields.sicknessDescription = values.sicknessDescription; break;
        case 'duka': specificFields.familyRelation = values.familyRelation; break;
        case 'akademik': 
            specificFields.academicActivityName = values.academicActivityName;
            specificFields.academicInstitution = values.academicInstitution;
            break;
        case 'lainnya': specificFields.otherLeaveTitle = values.otherLeaveTitle; break;
        case 'keluar_kantor': specificFields.destination = values.destination; break;
    }
    return specificFields;
  };
  
  // ... (rest of the component JSX, which is quite large and complex)
  // The existing JSX structure can largely be preserved, but will need conditional rendering for the new specific fields.
  
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>{mode} Pengajuan Izin</DialogTitle>
            <DialogDescription>{isReadOnly ? 'Detail pengajuan izin Anda.' : 'Lengkapi detail pengajuan Anda.'}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-grow">
            <div className="px-6 py-4 space-y-6">
              {/* Form Section */}
              <Form {...form}>
                <form id="permission-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  {/* General Fields */}
                  <FormField control={form.control} name="type" render={({ field }) => (<FormItem><FormLabel>Jenis Izin*</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!!defaultType || isReadOnly}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis izin" /></SelectTrigger></FormControl><SelectContent>{PERMISSION_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{PERMISSION_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Alasan/Keterangan*</FormLabel><FormControl><Textarea rows={3} placeholder="Jelaskan keperluan Anda..." {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />

                  {/* Date & Time Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="startDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>{selectedType === 'keluar_kantor' ? 'Tanggal Izin*' : 'Tanggal Mulai*'}</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                    {selectedType !== 'keluar_kantor' && <FormField control={form.control} name="endDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Selesai*</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />}
                    {selectedType === 'keluar_kantor' && (
                        <div className="grid grid-cols-2 gap-2">
                            <FormField control={form.control} name="startTime" render={({ field }) => (<FormItem><FormLabel>Jam Mulai*</FormLabel><FormControl><Input type="time" {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="endTime" render={({ field }) => (<FormItem><FormLabel>Jam Selesai*</FormLabel><FormControl><Input type="time" {...field} readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    )}
                  </div>
                  
                  {/* Specific Fields */}
                  {selectedType === 'sakit' && <FormField control={form.control} name="sicknessDescription" render={({ field }) => (<FormItem><FormLabel>Keluhan Singkat</FormLabel><FormControl><Input {...field} placeholder="Contoh: Demam dan batuk" readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />}
                  {selectedType === 'duka' && <FormField control={form.control} name="familyRelation" render={({ field }) => (<FormItem><FormLabel>Hubungan Keluarga*</FormLabel><FormControl><Input {...field} placeholder="Contoh: Orang Tua, Kakek/Nenek" readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />}
                  {selectedType === 'akademik' && <><FormField control={form.control} name="academicActivityName" render={({ field }) => (<FormItem><FormLabel>Nama Kegiatan*</FormLabel><FormControl><Input {...field} placeholder="Contoh: Sidang Skripsi, Seminar Nasional" readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="academicInstitution" render={({ field }) => (<FormItem><FormLabel>Institusi</FormLabel><FormControl><Input {...field} placeholder="Nama kampus/penyelenggara" readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} /></>}
                  {selectedType === 'lainnya' && <FormField control={form.control} name="otherLeaveTitle" render={({ field }) => (<FormItem><FormLabel>Judul Izin*</FormLabel><FormControl><Input {...field} placeholder="Contoh: Izin Mengurus Administrasi Bank" readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />}
                  {selectedType === 'keluar_kantor' && <FormField control={form.control} name="destination" render={({ field }) => (<FormItem><FormLabel>Tujuan / Lokasi*</FormLabel><FormControl><Input {...field} placeholder="Contoh: Bank BCA, Kantor Pajak" readOnly={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />}
                  
                  {/* Attachment Field */}
                  <FormField control={form.control} name="attachment" render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Lampiran {selectedType === 'sakit' && 'Surat Dokter'}</FormLabel>
                      {isViewing && !value && <p className="text-sm text-muted-foreground">Tidak ada lampiran.</p>}
                      {isViewing && value && <Button variant="outline" asChild><a href={value} target="_blank" rel="noopener noreferrer">Lihat Lampiran</a></Button>}
                      {!isViewing && (
                        <>
                        <FormControl>
                          <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onChange(e.target.files?.[0])} {...fieldProps} />
                        </FormControl>
                        <FormDescription>Maks. 2MB. Format JPG, PNG, PDF.</FormDescription>
                        {selectedType === 'sakit' && <FormDescription className="text-destructive">Wajib jika izin lebih dari 1 hari.</FormDescription>}
                        <FormMessage />
                        </>
                      )}
                    </FormItem>
                  )} />
                </form>
              </Form>
            </div>
          </ScrollArea>
          
          <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Tutup</Button>
            {!isViewing && (
              <Button type="submit" form="permission-form" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Kirim Pengajuan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
