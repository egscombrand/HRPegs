'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { UserProfile, Job } from '@/lib/types';
import { add, format } from 'date-fns';

export const scheduleSchema = z.object({
  dateTime: z.coerce.date({ required_error: 'Tanggal dan waktu harus diisi.' }),
  duration: z.coerce.number().int().min(5, 'Durasi minimal 5 menit.').default(30),
  meetingLink: z.preprocess(
    (v) => {
        if (typeof v !== "string") return v;
        const s = v.trim();
        if (!s || s.includes("...")) return "";
        return s;
    },
    z.string().url({ message: "URL meeting tidak valid." }).optional().or(z.literal(''))
  ),
  notes: z.string().optional(),
});

export type ScheduleInterviewData = z.infer<typeof scheduleSchema>;

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: ScheduleInterviewData) => Promise<boolean>;
  initialData?: Partial<ScheduleInterviewData>;
  candidateName: string;
  recruiter: UserProfile;
  job: Job;
}

export function ScheduleInterviewDialog({ open, onOpenChange, onConfirm, initialData, candidateName, recruiter, job }: ScheduleInterviewDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ScheduleInterviewData>({
    resolver: zodResolver(scheduleSchema),
  });

  const { watch } = form;
  const startTime = watch('dateTime');
  const duration = watch('duration');

  const endTime = useMemo(() => {
    if (startTime && duration) {
        return add(startTime, { minutes: duration });
    }
    return null;
  }, [startTime, duration]);


  useEffect(() => {
    if (open) {
      const templateLink = job?.interviewTemplate?.meetingLink || '';
      form.reset({
        dateTime: initialData?.dateTime,
        duration: initialData?.duration || job?.interviewTemplate?.slotDurationMinutes || 30,
        meetingLink: initialData?.meetingLink || templateLink,
        notes: initialData?.notes || '',
      });
    }
  }, [open, initialData, form, job]);

  const handleSubmit = async (values: ScheduleInterviewData) => {
    setIsSaving(true);
    const success = await onConfirm(values);
    setIsSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };
  
  const title = `Edit Wawancara untuk ${candidateName}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Ubah detail untuk jadwal wawancara.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-2 -mr-6 pl-1">
            <Form {...form}>
            <form id="schedule-interview-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4 pr-4">
                <FormField
                control={form.control}
                name="dateTime"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Tanggal & Waktu Mulai</FormLabel>
                    <FormControl>
                        <Input
                            type="datetime-local"
                            value={field.value ? format(new Date(field.value), "yyyy-MM-dd'T'HH:mm") : ''}
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                        />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField control={form.control} name="duration" render={({ field }) => (<FormItem><FormLabel>Durasi (menit)</FormLabel><Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="15">15</SelectItem><SelectItem value="30">30</SelectItem><SelectItem value="45">45</SelectItem><SelectItem value="60">60</SelectItem><SelectItem value="90">90</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                
                 {endTime && (
                    <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
                        Selesai pada: <span className="font-semibold text-foreground">{format(endTime, 'dd MMM yyyy, HH:mm')} WIB</span>
                    </div>
                )}
                
                <FormField
                control={form.control}
                name="meetingLink"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Link Meeting (Opsional)</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="https://zoom.us/j/..." /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />

                <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Catatan (Opsional)</FormLabel>
                    <FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Catatan tambahan untuk internal..." /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </form>
            </Form>
        </div>
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="schedule-interview-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Jadwal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
