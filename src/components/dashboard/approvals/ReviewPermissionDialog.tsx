'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { PermissionRequest, isFinalStatus, isActionableStatus } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking, useCollection } from '@/firebase';
import { doc, serverTimestamp, query, collection, where, limit, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const reviewSchema = z.object({
    note: z.string().min(10, 'Catatan harus diisi saat menolak atau meminta revisi.'),
});

const PERMISSION_TYPE_LABELS = {
    tidak_masuk: 'Izin Tidak Masuk Bekerja',
    keluar_kantor: 'Izin Meninggalkan Kantor',
    sakit: 'Izin Sakit',
};

type FormValues = z.infer<typeof reviewSchema>;

interface ReviewPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: PermissionRequest;
  onSuccess: () => void;
  mode: 'manager' | 'hrd';
}

const InfoRow = ({ label, value }: { label: string, value?: string | number }) => (
    <div className="flex justify-between text-sm">
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium text-right">{value ?? '-'}</p>
    </div>
);

export function ReviewPermissionDialog({ open, onOpenChange, submission, onSuccess, mode }: ReviewPermissionDialogProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { userProfile } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({ 
        resolver: zodResolver(reviewSchema), 
        defaultValues: { 
            note: mode === 'manager' ? submission.managerNotes || '' : submission.hrdNotes || '' 
        } 
    });
    
    const isFinal = isFinalStatus(submission.status);
    const canAct = isActionableStatus(submission.status, mode);
    const isOfficeExit = submission.type === 'keluar_kantor';

    const returnEventsQuery = useMemo(() => {
        if (!isOfficeExit || submission.status !== 'reported' || !submission.reportedExitAt) return null;
        if (mode !== 'hrd' && userProfile?.role !== 'super-admin') return null; 
        
        return query(
            collection(firestore, 'attendance_events'),
            where('uid', '==', submission.uid),
            where('tsServer', '>', submission.reportedExitAt),
            orderBy('tsServer', 'asc'),
            limit(1)
        );
    }, [isOfficeExit, submission.status, submission.reportedExitAt, submission.uid, firestore, mode, userProfile]);

    const { data: returnEvents } = useCollection<any>(returnEventsQuery as any);
    const detectedReturnAt = returnEvents?.[0]?.tsServer || submission.returnTapInAt;

    const handleDecision = async (decision: 'approve' | 'reject' | 'revise') => {
        if (!userProfile) return;

        if (!canAct) {
            toast({ variant: 'destructive', title: 'Aksi Ditolak', description: 'Pengajuan ini sudah final atau tidak lagi dapat diproses.' });
            return;
        }

        if (decision !== 'approve') {
            const isNoteValid = await form.trigger('note');
            if (!isNoteValid) return;
        }

        setIsSaving(true);
        try {
            const submissionRef = doc(firestore, 'permission_requests', submission.id!);
            const note = form.getValues('note');
            
            let status: PermissionRequest['status'] = submission.status;
            let payload: Partial<PermissionRequest> = {};
            const isManagerAction = mode === 'manager';

            if (isManagerAction) {
                if (isOfficeExit) {
                    if (decision === 'approve') status = 'verified_manager';
                    else if (decision === 'reject') status = 'rejected_manager';
                } else {
                    if (decision === 'approve') status = 'approved_by_manager';
                    else if (decision === 'reject') status = 'rejected_manager';
                    else if (decision === 'revise') status = 'revision_manager';
                }
                payload = { status, managerNotes: note || null, managerDecisionAt: serverTimestamp() as any };
            } else {
                if (decision === 'approve') status = 'approved';
                else if (decision === 'reject') status = 'rejected_hrd';
                else if (decision === 'revise') status = 'revision_hrd';
                payload = { status, hrdNotes: note || null, hrdDecisionAt: serverTimestamp() as any };
            }
            
            if (isManagerAction && isOfficeExit && detectedReturnAt && !submission.returnTapInAt) {
                payload.returnTapInAt = detectedReturnAt;
            }

            await updateDocumentNonBlocking(submissionRef, payload);
            toast({ title: 'Keputusan Disimpan', description: `Pengajuan izin telah ${decision}.` });
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
            <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl">
                <DialogHeader className="p-6 pb-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b relative z-10">
                    <div className="flex items-center justify-between mb-1">
                        <div className="space-y-1">
                            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                                Review Pengajuan Izin
                            </DialogTitle>
                            <DialogDescription className="text-sm text-muted-foreground">
                                Tinjau detail data operasional sebelum memberikan keputusan.
                            </DialogDescription>
                        </div>
                        <Badge variant="outline" className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                            {submission.status.replace(/_/g, ' ')}
                        </Badge>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-6 space-y-6">
                        <section className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Alur Proses</h3>
                            <div className="flex items-center gap-6">
                                {[
                                    { label: 'Karyawan Lapor', done: true },
                                    { label: 'Kembali & Tap-In', done: !!detectedReturnAt || submission.status === 'returned', skip: !isOfficeExit },
                                    { label: 'Verifikasi Manager', done: submission.status === 'verified_manager' || submission.status === 'approved' }
                                ].filter(s => !s.skip).map((step, i, arr) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className={cn(
                                            "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
                                            step.done ? "bg-emerald-500 border-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                                        )}>
                                            {step.done ? <CheckCircle className="h-3 w-3" /> : (i + 1)}
                                        </div>
                                        <span className={cn("text-xs font-semibold", step.done ? "text-slate-900 dark:text-slate-100" : "text-slate-400")}>
                                            {step.label}
                                        </span>
                                        {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                            <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Informasi Pengajuan</CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                <InfoRow label="Nama Karyawan" value={submission.fullName} />
                                <InfoRow label="Divisi / Posisi" value={`${submission.division} / ${submission.positionTitle}`} />
                                <InfoRow label="Jenis Izin" value={PERMISSION_TYPE_LABELS[submission.type as keyof typeof PERMISSION_TYPE_LABELS] || submission.type} />
                                <InfoRow label="Dibuat Pada" value={format(submission.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: idLocale })} />
                                <div className="md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Alasan / Keterangan</p>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">"{submission.reason}"</p>
                                </div>
                            </CardContent>
                        </Card>

                        {isOfficeExit && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                                    <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Informasi Keluar Kantor</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 space-y-4">
                                        <InfoRow label="Jam Laporan Keluar" value={submission.reportedExitAt ? format(submission.reportedExitAt.toDate(), 'HH:mm') : '-'} />
                                        <InfoRow label="Perkiraan Kembali" value={format(submission.endDate.toDate(), 'HH:mm')} />
                                    </CardContent>
                                </Card>

                                <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                                    <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Informasi Kembali ke Kantor</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 space-y-4">
                                        <InfoRow label="Status Kembali" value={detectedReturnAt ? "Sudah Kembali" : "Belum Kembali"} />
                                        <InfoRow label="Jam Tap-In Kembali" value={detectedReturnAt ? (typeof detectedReturnAt === 'object' && 'toDate' in detectedReturnAt ? format((detectedReturnAt as any).toDate(), 'HH:mm') : format(new Date(detectedReturnAt as any), 'HH:mm')) : '-'} />
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {!isOfficeExit && (
                            <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Detail Waktu</CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                    <InfoRow label="Dari Tanggal" value={format(submission.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} />
                                    <InfoRow label="Sampai Tanggal" value={format(submission.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} />
                                    <InfoRow label="Total Durasi" value={`${submission.totalDurationMinutes} menit`} />
                                </CardContent>
                            </Card>
                        )}

                        {submission.managerNotes && (
                            <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                                <CardHeader className="py-2 border-b border-slate-200 dark:border-slate-800">
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Catatan Reviu Manager</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <p className="text-sm italic">"{submission.managerNotes}"</p>
                                </CardContent>
                            </Card>
                        )}

                        {canAct && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                <Form {...form}>
                                    <form className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="note"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Catatan Reviu (Wajib untuk Tolak/Revisi)</FormLabel>
                                                    <FormControl>
                                                        <Textarea 
                                                            placeholder="Berikan catatan terkait keputusan Anda..." 
                                                            className="resize-none text-sm border-slate-200 dark:border-slate-800 focus:ring-slate-100" 
                                                            rows={3}
                                                            {...field} 
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </form>
                                </Form>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="p-6 border-t bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md sm:justify-between items-center gap-4">
                    <Button variant="ghost" className="px-6 h-10 text-xs font-bold uppercase tracking-widest" onClick={() => onOpenChange(false)}>Tutup</Button>
                    
                    {canAct && (
                        <div className="flex gap-2">
                            {!isOfficeExit && (
                                <Button
                                    variant="outline"
                                    className="h-10 border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-500 hover:dark:bg-amber-950/20 px-4 text-xs font-bold uppercase tracking-wider"
                                    onClick={() => handleDecision('revise')}
                                    disabled={isSaving}
                                >
                                    Reviu / Revisi
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                className="h-10 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-500 hover:dark:bg-red-950/20 px-4 text-xs font-bold uppercase tracking-wider"
                                onClick={() => handleDecision('reject')}
                                disabled={isSaving}
                            >
                                Tolak
                            </Button>
                            <Button
                                className={cn(
                                    "h-10 px-8 text-xs font-bold uppercase tracking-widest text-white shadow-sm",
                                    isOfficeExit ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"
                                )}
                                onClick={() => handleDecision('approve')}
                                disabled={isSaving}
                            >
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isOfficeExit ? <ShieldCheck className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />)}
                                {isOfficeExit ? 'Verifikasi Kehadiran' : 'Setujui Pengajuan'}
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
