'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, Send } from 'lucide-react';
import type { OvertimeSubmission } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

const reviewSchema = z.object({
    note: z.string().min(10, 'Catatan harus diisi saat menolak atau meminta revisi.'),
});

type FormValues = z.infer<typeof reviewSchema>;

interface ReviewOvertimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission;
  onSuccess: () => void;
  mode: 'manager' | 'hrd';
}

const InfoRow = ({ label, value }: { label: string, value: string | number }) => (
    <div className="flex justify-between text-sm">
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium text-right">{value}</p>
    </div>
);

export function ReviewOvertimeDialog({ open, onOpenChange, submission, onSuccess, mode }: ReviewOvertimeDialogProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { userProfile } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({ resolver: zodResolver(reviewSchema) });
    
    const handleDecision = async (decision: 'approve' | 'reject' | 'revise') => {
        if (!userProfile) return;

        if (decision !== 'approve') {
            const isNoteValid = await form.trigger('note');
            if (!isNoteValid) return;
        }

        setIsSaving(true);
        try {
            const submissionRef = doc(firestore, 'overtime_submissions', submission.id!);
            const note = form.getValues('note');
            
            let status: OvertimeSubmission['status'] = submission.status;
            let payload: Partial<OvertimeSubmission> = {};
            const isManagerAction = mode === 'manager';

            if (isManagerAction) {
                if (decision === 'approve') status = 'approved_by_manager';
                else if (decision === 'reject') status = 'rejected_manager';
                else if (decision === 'revise') status = 'revision_manager';
                payload = { status, managerNotes: note || null, managerDecisionAt: serverTimestamp() };
            } else { // HRD action
                if (decision === 'approve') status = 'approved';
                else if (decision === 'reject') status = 'rejected_hrd';
                else if (decision === 'revise') status = 'revision_hrd';
                payload = { status, hrdNotes: note || null, hrdDecisionAt: serverTimestamp() };
            }
            
            await updateDocumentNonBlocking(submissionRef, payload);
            toast({ title: 'Keputusan Disimpan', description: `Pengajuan telah ${decision}.` });
            onSuccess();
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal Menyimpan Keputusan', description: e.message });
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Review Pengajuan Lembur</DialogTitle>
                    <DialogDescription>Tinjau detail pengajuan dan berikan keputusan.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-grow pr-6 -mr-6">
                    <div className="space-y-6 pr-6">
                        <Card>
                             <CardHeader>
                                <CardTitle className="text-lg">Detail Pengaju</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <InfoRow label="Nama" value={submission.fullName} />
                                <InfoRow label="Posisi" value={submission.positionTitle} />
                                <InfoRow label="Divisi" value={submission.division} />
                                <InfoRow label="Brand" value={submission.brandName} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">Detail Pengajuan</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                <InfoRow label="Tanggal" value={format(submission.date.toDate(), 'eeee, dd MMM yyyy', { locale: idLocale })} />
                                <InfoRow label="Waktu" value={`${submission.startTime} - ${submission.endTime} (${submission.totalDurationMinutes} menit)`} />
                                <InfoRow label="Tipe Lembur" value={submission.overtimeType.replace('_', ' ')} />
                                <InfoRow label="Lokasi" value={submission.location} />
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle className="text-base">Alasan & Catatan Karyawan</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-sm font-medium">{submission.reason}</p>
                                {submission.employeeNotes && <p className="text-xs text-muted-foreground italic mt-2">Catatan: {submission.employeeNotes}</p>}
                            </CardContent>
                        </Card>
                        
                        <Card>
                            <CardHeader><CardTitle className="text-base">Rincian Tugas</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader><TableRow><TableHead>Tugas</TableHead><TableHead>Estimasi</TableHead><TableHead>Aktual</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {submission.tasks.map((task, i) => (
                                            <TableRow key={i}>
                                                <TableCell>{task.description}</TableCell>
                                                <TableCell>{task.estimatedMinutes} mnt</TableCell>
                                                <TableCell>{task.actualMinutes || '-'} mnt</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                        
                        <Separator />
                        
                        <Form {...form}>
                            <form className="space-y-2">
                                <FormField control={form.control} name="note" render={({ field }) => (
                                <FormItem><FormLabel>Catatan Anda (Wajib untuk Tolak/Revisi)</FormLabel><FormControl><Textarea rows={3} placeholder="Berikan alasan atau catatan..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            </form>
                        </Form>
                    </div>
                </ScrollArea>
                <DialogFooter className="pt-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
                    <Button variant="secondary" onClick={() => handleDecision('revise')} disabled={isSaving}>Minta Revisi</Button>
                    <Button variant="destructive" onClick={() => handleDecision('reject')} disabled={isSaving}>Tolak</Button>
                    <Button onClick={() => handleDecision('approve')} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                        Setujui
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
