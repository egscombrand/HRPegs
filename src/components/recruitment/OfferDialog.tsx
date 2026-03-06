'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { add, addMonths, format } from 'date-fns';
import { GoogleDatePicker } from '../ui/google-date-picker';

const offerSchema = z.object({
  offeredSalary: z.coerce.number().min(1, "Gaji yang ditawarkan harus diisi."),
  contractStartDate: z.date({ required_error: 'Tanggal mulai harus diisi.' }),
  contractDurationMonths: z.coerce.number().int().min(1, 'Durasi kontrak minimal 1 bulan.'),
  offerNotes: z.string().optional(),
});

export type OfferFormData = z.infer<typeof offerSchema>;

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: OfferFormData) => Promise<void>;
  candidateName: string;
}

export function OfferDialog({ open, onOpenChange, onConfirm, candidateName }: OfferDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
        offeredSalary: 0,
        contractStartDate: new Date(),
        contractDurationMonths: 12,
        offerNotes: '',
    }
  });

  const { watch } = form;
  const startDate = watch('contractStartDate');
  const duration = watch('contractDurationMonths');
  
  const contractEndDate = React.useMemo(() => {
    if (startDate && duration) {
        return addMonths(startDate, duration);
    }
    return null;
  }, [startDate, duration]);


  const handleSubmit = async (values: OfferFormData) => {
    setIsSaving(true);
    await onConfirm(values);
    setIsSaving(false);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kirim Penawaran Kerja untuk {candidateName}</DialogTitle>
          <DialogDescription>
            Masukkan detail penawaran kerja. Kandidat akan melihat informasi ini dan harus memberikan keputusan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="offer-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="offeredSalary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gaji yang Ditawarkan (per bulan)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 5000000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="contractStartDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Tanggal Mulai Kerja</FormLabel>
                            <FormControl>
                                <GoogleDatePicker value={field.value} onChange={field.onChange} portalled={false} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="contractDurationMonths"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Durasi Kontrak (bulan)</FormLabel>
                            <FormControl>
                                <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            {contractEndDate && (
                <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
                    Perkiraan Selesai Kontrak: <span className="font-semibold text-foreground">{format(contractEndDate, 'dd MMMM yyyy')}</span>
                </div>
            )}
            <FormField
              control={form.control}
              name="offerNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catatan Penawaran (Opsional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Contoh: Termasuk tunjangan transportasi dan makan." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="offer-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Penawaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
