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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { add, addMonths, format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { GoogleDatePicker } from '../ui/google-date-picker';
import type { Job, JobApplication } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';


export const offerSchema = z.object({
  offeredSalary: z.coerce.number().min(1, "Gaji yang ditawarkan harus diisi."),
  contractStartDate: z.date({ required_error: 'Tanggal mulai harus diisi.' }),
  contractDurationMonths: z.coerce.number().int().min(1, 'Durasi kontrak minimal 1 bulan.'),
  contractEndDate: z.date().optional(),
  probationDurationMonths: z.coerce.number().int().min(0).optional().nullable(),
  offerNotes: z.string().optional(),
});

export type OfferFormData = z.infer<typeof offerSchema>;

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: OfferFormData) => Promise<void>;
  candidateName: string;
  job: Job;
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

export function OfferDialog({ open, onOpenChange, onConfirm, candidateName, job }: OfferDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
        offeredSalary: 0,
        contractStartDate: new Date(),
        contractDurationMonths: 12,
        probationDurationMonths: job.statusJob === 'fulltime' ? 3 : null,
        offerNotes: '',
    }
  });

  const { watch, setValue } = form;
  const startDate = watch('contractStartDate');
  const duration = watch('contractDurationMonths');
  
  useEffect(() => {
    if (startDate && duration && duration > 0) {
        const parsedDuration = typeof duration === 'string' ? parseInt(duration, 10) : duration;
        if (!isNaN(parsedDuration)) {
            const endDate = addMonths(startDate, parsedDuration);
            setValue('contractEndDate', endDate);
        }
    }
  }, [startDate, duration, setValue]);
  
  const contractEndDate = watch('contractEndDate');


  const handleSubmit = async (values: OfferFormData) => {
    setIsSaving(true);
    await onConfirm(values);
    setIsSaving(false);
    onOpenChange(false);
  };
  
  const title = `Penawaran Kontrak Kerja: ${candidateName}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Lengkapi detail penawaran kerja final. Informasi ini akan dikirim ke kandidat untuk ditinjau. Kandidat hanya dapat memberikan satu keputusan final: menerima atau menolak penawaran ini.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
        <Form {...form}>
          <form id="offer-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
                <div className='flex justify-between'>
                    <p>Posisi:</p> <p className="font-semibold">{job.position}</p>
                </div>
                <div className='flex justify-between'>
                    <p>Tipe:</p> <p className="font-semibold capitalize">{job.statusJob}</p>
                </div>
            </div>
            
             <FormField
                control={form.control}
                name="offeredSalary"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Gaji / Kompensasi (per bulan)</FormLabel>
                    <FormControl>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground pointer-events-none">
                        Rp
                        </span>
                        <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="5.000.000"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="contractStartDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Tanggal Mulai Kerja</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField
                  control={form.control}
                  name="contractDurationMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durasi Kontrak</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === '' ? undefined : parseInt(val, 10));
                            }}
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                          bulan
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            
            {contractEndDate && (
                <div className="text-sm text-muted-foreground">
                    Perkiraan Selesai Kontrak: <span className="font-semibold text-foreground">{format(contractEndDate, 'eeee, dd MMMM yyyy', { locale: idLocale })}</span>
                </div>
            )}
            
            {job.statusJob === 'fulltime' && (
                 <FormField
                  control={form.control}
                  name="probationDurationMonths"
                  render={({ field }) => (
                    <FormItem>
                        <FormLabel>Masa Percobaan</FormLabel>
                         <div className="relative">
                            <FormControl>
                                <Input
                                type="number"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                className="pr-16"
                                />
                            </FormControl>
                             <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                                bulan
                            </span>
                        </div>
                        <FormMessage />
                    </FormItem>
                )}/>
            )}
            
            <FormField control={form.control} name="offerNotes" render={({ field }) => ( <FormItem><FormLabel>Catatan Penawaran (Opsional)</FormLabel><FormControl><Textarea placeholder="Contoh: Termasuk tunjangan transportasi dan makan." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
            
            <Alert variant="default" className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
                    Setelah penawaran dikirim, kandidat hanya dapat memilih menerima atau menolak. Tidak ada negosiasi ulang melalui sistem.
                </AlertDescription>
            </Alert>
          </form>
        </Form>
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="offer-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Penawaran Kontrak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
