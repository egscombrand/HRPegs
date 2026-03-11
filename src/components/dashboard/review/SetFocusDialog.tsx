'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

const focusSchema = z.object({
  monthlyFocus: z.string().min(10, { message: "Deskripsi fokus harus diisi, minimal 10 karakter." }),
});

type FormValues = z.infer<typeof focusSchema>;

interface SetFocusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  internId: string;
  internName: string;
  currentFocus?: string | null;
  onSuccess: () => void;
}

export function SetFocusDialog({ open, onOpenChange, internId, internName, currentFocus, onSuccess }: SetFocusDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(focusSchema),
    defaultValues: { monthlyFocus: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ monthlyFocus: currentFocus || '' });
    }
  }, [open, currentFocus, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile) return;
    
    setIsSaving(true);
    const monthId = format(new Date(), 'yyyy-MM');
    const evalDocId = `${internId}_${monthId}`;
    const evalRef = doc(firestore, 'monthly_evaluations', evalDocId);

    try {
      await setDocumentNonBlocking(evalRef, {
        monthlyFocus: values.monthlyFocus,
        internUid: internId,
        internName: internName,
        evaluationMonth: Timestamp.fromDate(new Date(new Date().setDate(1))),
        updatedAt: serverTimestamp(),
        evaluatorUid: userProfile.uid,
        evaluatorName: userProfile.fullName,
        createdAt: serverTimestamp(),
      }, { merge: true });

      toast({ title: 'Fokus Bulanan Disimpan' });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atur Fokus Bulanan untuk {internName}</DialogTitle>
          <DialogDescription>
            Tuliskan deskripsi singkat mengenai target atau area fokus utama untuk intern ini selama bulan berjalan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="set-focus-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="monthlyFocus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deskripsi Fokus</FormLabel>
                  <FormControl>
                    <Textarea rows={5} placeholder="Contoh: Fokus menyelesaikan fitur X dan membuat dokumentasi." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="set-focus-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Fokus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
