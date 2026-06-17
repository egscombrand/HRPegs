'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { UserProfile, Job, Brand } from '@/lib/types';
import { GoogleDatePicker } from '../ui/google-date-picker';
import { Timestamp } from 'firebase/firestore';

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const templateSchema = z.object({
  meetingLink: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  slotDurationMinutes: z.coerce.number().int().min(5),
  breakMinutes: z.coerce.number().int().min(0),
  workdayStartTime: z.string().regex(TIME_REGEX, "Format waktu harus HH:MM."),
  workdayEndTime: z.string().regex(TIME_REGEX, "Format waktu harus HH:MM."),
  defaultStartDate: z.date().optional(),
  lunchBreakStart: z.string().regex(TIME_REGEX, "Format waktu harus HH:MM.").optional().or(z.literal('')),
  lunchBreakEnd: z.string().regex(TIME_REGEX, "Format waktu harus HH:MM.").optional().or(z.literal('')),
});

type FormValues = z.infer<typeof templateSchema>;

interface EditInterviewTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  initialTemplateData?: Partial<Job['interviewTemplate']>;
  onSave: (templateData: Partial<Job['interviewTemplate']>) => void;
  readOnly?: boolean;
}

export function EditInterviewTemplateDialog({ open, onOpenChange, job, initialTemplateData, onSave, readOnly = false }: EditInterviewTemplateDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(templateSchema),
  });

  useEffect(() => {
    if (open) {
      const template = initialTemplateData || job.interviewTemplate;
      form.reset({
        meetingLink: template?.meetingLink || '',
        slotDurationMinutes: template?.slotDurationMinutes || 30,
        breakMinutes: template?.breakMinutes || 10,
        workdayStartTime: template?.workdayStartTime || '09:00',
        workdayEndTime: template?.workdayEndTime || '17:00',
        defaultStartDate: template?.defaultStartDate?.toDate(),
        lunchBreakStart: template?.lunchBreakStart || '',
        lunchBreakEnd: template?.lunchBreakEnd || '',
      });
    }
  }, [open, job, initialTemplateData, form]);

  const handleSubmit = (values: FormValues) => {
    if(readOnly) return;
    setIsSaving(true);
    const dataToSave: Partial<Job['interviewTemplate']> = {
        ...values,
        defaultStartDate: values.defaultStartDate ? Timestamp.fromDate(values.defaultStartDate) : undefined,
    };
    onSave(dataToSave);
    setIsSaving(false);
  };
  
  const title = `${readOnly ? 'Detail' : 'Edit'} Interview Template untuk: ${job.position}`;
  const description = readOnly ? 'Ini adalah pengaturan default untuk wawancara pada lowongan ini.' : 'Pengaturan ini akan menjadi default untuk semua wawancara yang dijadwalkan pada lowongan ini.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
            <Form {...form}>
                <form id="template-form" onSubmit={form.handleSubmit(handleSubmit)} className="py-4">
                  <fieldset disabled={readOnly} className="space-y-4">
                    <FormField control={form.control} name="meetingLink" render={({ field }) => ( <FormItem><FormLabel>Default Meeting Link</FormLabel><FormControl><Input placeholder="https://zoom.us/j/..." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="defaultStartDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Default Start Date</FormLabel><FormControl><GoogleDatePicker portalled={false} value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="workdayStartTime" render={({ field }) => ( <FormItem><FormLabel>Workday Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="workdayEndTime" render={({ field }) => ( <FormItem><FormLabel>Workday End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="slotDurationMinutes" render={({ field }) => (<FormItem><FormLabel>Durasi Slot (menit)</FormLabel><Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent portalled={false}><SelectItem value="15">15</SelectItem><SelectItem value="30">30</SelectItem><SelectItem value="45">45</SelectItem><SelectItem value="60">60</SelectItem><SelectItem value="90">90</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="breakMinutes" render={({ field }) => (<FormItem><FormLabel>Jeda antar Slot (menit)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium pt-1">Istirahat Makan Siang (opsional)</p>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="lunchBreakStart" render={({ field }) => (<FormItem><FormLabel>Mulai Istirahat</FormLabel><FormControl><Input type="time" {...field} value={field.value || ''} placeholder="12:00" /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="lunchBreakEnd" render={({ field }) => (<FormItem><FormLabel>Selesai Istirahat</FormLabel><FormControl><Input type="time" {...field} value={field.value || ''} placeholder="13:00" /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                  </fieldset>
                </form>
            </Form>
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant={readOnly ? 'default' : 'ghost'} onClick={() => onOpenChange(false)}>
            {readOnly ? 'Tutup' : 'Batal'}
          </Button>
          {!readOnly && (
            <Button type="submit" form="template-form" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Template
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
