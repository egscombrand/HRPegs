'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Send, XCircle, FileClock, AlertCircle, UserCheck } from 'lucide-react';
import type { DailyReport } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const reviewSchema = z.object({
  reviewerNotes: z.string().min(10, { message: 'Catatan revisi harus diisi, minimal 10 karakter.' }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface ReviewReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DailyReport & { internName?: string; supervisorName?: string };
  onSuccess: () => void;
}

const ContentSection = ({ title, content }: { title: string, content: string }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {content}
          </div>
      </CardContent>
    </Card>
);

const statusInfo: Record<DailyReport['status'], { icon: React.ReactNode; title: string; description: string; variant: 'default' | 'destructive' | 'warning' }> = {
  submitted: { icon: <FileClock className="h-4 w-4" />, title: 'Menunggu Review Anda', description: 'Tinjau laporan aktivitas harian dari intern dan berikan persetujuan atau permintaan revisi.', variant: 'default' },
  needs_revision: { icon: <AlertCircle className="h-4 w-4" />, title: 'Menunggu Revisi dari Intern', description: 'Anda telah mengirimkan catatan revisi. Laporan ini akan kembali ke antrian Anda setelah intern mengirimkan perbaikannya.', variant: 'warning' },
  approved: { icon: <CheckCircle className="h-4 w-4" />, title: 'Laporan Disetujui', description: 'Anda telah menyetujui laporan ini. Tidak ada tindakan lebih lanjut yang diperlukan.', variant: 'default' },
  draft: { icon: <FileClock className="h-4 w-4" />, title: 'Draf', description: 'Laporan ini belum dikirim oleh intern.', variant: 'default' }
};


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

  const currentStatusInfo = statusInfo[report.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl">{report.internName}</DialogTitle>
           <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>{format(report.date.toDate(), 'eeee, dd MMMM yyyy', { locale: idLocale })}</span>
              <span className="text-muted-foreground">•</span>
              <span>Mentor: {report.supervisorName}</span>
           </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow">
        <div className="px-6 py-4 space-y-6">
            <Alert variant={currentStatusInfo.variant === 'warning' ? 'default' : currentStatusInfo.variant} className={cn(
                currentStatusInfo.variant === 'warning' && 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
                currentStatusInfo.variant === 'default' && 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
            )}>
                {currentStatusInfo.icon}
                <AlertTitle className={cn(
                    currentStatusInfo.variant === 'warning' && 'text-yellow-800 dark:text-yellow-200',
                    currentStatusInfo.variant === 'default' && 'text-blue-800 dark:text-blue-300',
                )}>{currentStatusInfo.title}</AlertTitle>
                <AlertDescription className={cn(
                     currentStatusInfo.variant === 'warning' && 'text-yellow-700 dark:text-yellow-300',
                     currentStatusInfo.variant === 'default' && 'text-blue-700 dark:text-blue-400',
                )}>{currentStatusInfo.description}</AlertDescription>
            </Alert>
            
            <ContentSection title="Uraian Aktivitas" content={report.activity} />
            <ContentSection title="Pembelajaran yang Diperoleh" content={report.learning} />
            <ContentSection title="Kendala yang Dialami" content={report.obstacle} />
            
             {report.status === 'needs_revision' && report.reviewerNotes && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <UserCheck className="h-5 w-5 text-primary" />
                            Feedback Anda Sebelumnya
                        </CardTitle>
                        <CardDescription>{report.reviewedByName} &bull; {report.reviewedAt ? format(report.reviewedAt.toDate(), 'dd MMM, HH:mm') : ''}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <blockquote className="border-l-4 pl-4 italic text-muted-foreground">
                            {report.reviewerNotes}
                        </blockquote>
                    </CardContent>
                </Card>
            )}

            <Separator />
            
            <Form {...form}>
              <form id="review-form" className="space-y-2">
                <FormField
                  control={form.control}
                  name="reviewerNotes"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="text-base font-semibold">Catatan Reviewer</Label>
                      <FormDescription className="text-xs">Wajib diisi saat meminta revisi.</FormDescription>
                      <FormControl>
                        <Textarea placeholder="Berikan feedback atau arahan untuk revisi..." {...field} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
        </div>
        </ScrollArea>
        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t bg-background">
          <div className="flex w-full justify-between items-center">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Tutup</Button>
            <div className="flex gap-2">
              <Button variant="destructive" className="w-full sm:w-auto" onClick={() => handleReview('needs_revision')} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                <XCircle className="mr-2 h-4 w-4" /> Minta Revisi
              </Button>
              <Button className="bg-green-600 hover:bg-green-700 w-full sm:w-auto" onClick={() => handleReview('approved')} disabled={isSaving}>
                 {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                <CheckCircle className="mr-2 h-4 w-4" /> Setujui
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
