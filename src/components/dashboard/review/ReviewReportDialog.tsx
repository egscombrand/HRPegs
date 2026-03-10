'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Send, XCircle } from 'lucide-react';
import type { DailyReport } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';

const reviewSchema = z.object({
  reviewerNotes: z.string().min(10, { message: 'Catatan revisi harus diisi, minimal 10 karakter.' }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface ReviewReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DailyReport & { internName?: string; };
  onSuccess: () => void;
}

export function ReviewReportDialog({ open, onOpenChange, report, onSuccess }: ReviewReportDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { reviewerNotes: report.reviewerNotes || '' },
  });

  const handleReview = async (newStatus: 'approved' | 'needs_revision') => {
    if (!userProfile) return;

    if (newStatus === 'needs_revision') {
      const isNotesValid = await form.trigger('reviewerNotes');
      if (!isNotesValid) return;
    }
    
    setIsSaving(true);
    try {
      const reportRef = doc(firestore, 'daily_reports', report.id!);
      
      const payload: Partial<DailyReport> = {
        status: newStatus,
        reviewedAt: serverTimestamp() as Timestamp,
        reviewedByUid: userProfile.uid,
        reviewedByName: userProfile.fullName,
        reviewerNotes: form.getValues('reviewerNotes') || null,
      };

      await updateDocumentNonBlocking(reportRef, payload);
      
      toast({ title: 'Laporan Direview', description: `Status laporan telah diubah menjadi "${newStatus}".` });
      onSuccess();

    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal mereview laporan', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{value || '-'}</dd>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Laporan: {report.internName}</DialogTitle>
          <DialogDescription>
            Tanggal: {format(report.date.toDate(), 'eeee, dd MMMM yyyy', { locale: id })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 -mr-6 pl-1 py-4">
          <div className="space-y-4 pr-4">
            <InfoRow label="Aktivitas" value={<p className="whitespace-pre-wrap">{report.activity}</p>} />
            <InfoRow label="Pembelajaran" value={<p className="whitespace-pre-wrap">{report.learning}</p>} />
            <InfoRow label="Kendala" value={<p className="whitespace-pre-wrap">{report.obstacle}</p>} />
            <Separator className="my-4"/>
            <Form {...form}>
              <form id="review-form">
                <FormField
                  control={form.control}
                  name="reviewerNotes"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Catatan Reviewer <span className="text-destructive">*</span> (wajib untuk revisi)</Label>
                      <FormControl>
                        <Textarea placeholder="Berikan feedback atau arahan untuk revisi..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </div>
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="destructive" onClick={() => handleReview('needs_revision')} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            <XCircle className="mr-2 h-4 w-4" /> Minta Revisi
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleReview('approved')} disabled={isSaving}>
             {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            <CheckCircle className="mr-2 h-4 w-4" /> Setujui
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
