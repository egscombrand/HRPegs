'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { EmployeeProfile, DailyReport, MonthlyEvaluation, EvaluationCriteria, UserProfile, RatingScale, InternWithReviewStatus } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { Loader2 } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { RATING_SCALE } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const EVALUATION_CRITERIA: { key: keyof EvaluationCriteria, label: string }[] = [
    { key: 'attendance', label: 'Kehadiran dan ketepatan waktu' },
    { key: 'discipline', label: 'Kedisiplinan' },
    { key: 'attitude', label: 'Sikap dan etika kerja' },
    { key: 'responsibility', label: 'Tanggung jawab' },
    { key: 'communication', label: 'Komunikasi' },
    { key: 'initiative', label: 'Inisiatif' },
    { key: 'teamwork', label: 'Kerja sama tim' },
    { key: 'workQuality', label: 'Kualitas pekerjaan' },
    { key: 'learningAbility', label: 'Kecepatan belajar / adaptasi' },
    { key: 'consistency', label: 'Konsistensi laporan dan progres kerja' },
];

const evaluationSchema = z.object({
  ratings: z.object(
    EVALUATION_CRITERIA.reduce((acc, crit) => {
        acc[crit.key] = z.enum(RATING_SCALE);
        return acc;
    }, {} as Record<keyof EvaluationCriteria, z.ZodEnum<typeof RATING_SCALE>>)
  ),
  hrdComment: z.string().min(10, 'Komentar HRD harus diisi.'),
});

type FormValues = z.infer<typeof evaluationSchema>;

interface MonthlyEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  internData: InternWithReviewStatus & { reportSummary: { total: number; submitted: number; needs_revision: number; approved: number; }};
  onSuccess: () => void;
}

export function MonthlyEvaluationDialog({ open, onOpenChange, internData, onSuccess }: MonthlyEvaluationDialogProps) {
    const { userProfile } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    
    const evaluation = internData.evaluation;

    const { reviewCycle, reportSummary } = internData;
    
    const reportsQuery = useMemoFirebase(() => {
      if (!reviewCycle) return null;
      return query(
        collection(firestore, 'daily_reports'), 
        where('uid', '==', internData.uid),
        where('date', '>=', reviewCycle.periodStart),
        where('date', '<=', reviewCycle.periodEnd)
      );
    }, [firestore, internData.uid, reviewCycle]);
    
    const { data: reports, isLoading: isLoadingReports } = useCollection<DailyReport>(reportsQuery);

    const form = useForm<FormValues>({
        resolver: zodResolver(evaluationSchema),
    });
    
    useEffect(() => {
        if(open) {
            form.reset({
                ratings: evaluation?.ratings || EVALUATION_CRITERIA.reduce((acc, crit) => ({...acc, [crit.key]: 'Cukup'}), {} as EvaluationCriteria),
                hrdComment: evaluation?.hrdComment || '',
            });
        }
    }, [open, evaluation, form]);

    const onSubmit = async (values: FormValues) => {
        if (!userProfile || !reviewCycle) return;
        setIsSaving(true);
        try {
            const docId = `${internData.uid}_${reviewCycle.monthId}`;
            const evalRef = doc(firestore, 'monthly_evaluations', docId);

            const payload: Partial<MonthlyEvaluation> = {
                internUid: internData.uid,
                evaluationMonth: Timestamp.fromDate(reviewCycle.periodStart),
                evaluatorUid: userProfile.uid,
                evaluatorName: userProfile.fullName,
                ...values,
                updatedAt: serverTimestamp(),
            };
            
            if (!evaluation) {
                payload.createdAt = serverTimestamp();
            }
            
            await setDocumentNonBlocking(evalRef, payload, { merge: true });
            toast({ title: 'Evaluasi Disimpan', description: `Evaluasi untuk ${internData.fullName} pada periode ini telah disimpan.` });
            onSuccess();
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (!reviewCycle) return null;
    
    const isReadOnly = !!(evaluation && evaluation.hrdComment);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-4 border-b">
                    <DialogTitle>Evaluasi Bulanan: {internData.fullName}</DialogTitle>
                    <DialogDescription>
                        Periode Review: {format(reviewCycle.periodStart, 'dd MMM yyyy', { locale: idLocale })} - {format(reviewCycle.periodEnd, 'dd MMM yyyy', { locale: idLocale })}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-grow">
                    <div className="px-6 py-4 space-y-6">
                        <h3 className="font-semibold">Ringkasan Laporan Harian Periode Ini</h3>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <KpiCard title="Disetujui Mentor" value={reportSummary.approved} />
                            <KpiCard title="Menunggu Review" value={reportSummary.submitted} />
                            <KpiCard title="Perlu Revisi" value={reportSummary.needs_revision} deltaType="inverse" />
                            <KpiCard title="Total Laporan" value={reportSummary.total} />
                        </div>
                        <Separator />
                        <Form {...form}>
                            <form id="evaluation-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                <section>
                                    <h3 className="font-semibold mb-4">Parameter Penilaian</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                                        {EVALUATION_CRITERIA.map(crit => (
                                            <FormField
                                                key={crit.key}
                                                control={form.control}
                                                name={`ratings.${crit.key}`}
                                                render={({ field }) => (
                                                    <FormItem className="space-y-3">
                                                    <FormLabel>{crit.label}</FormLabel>
                                                    <FormControl>
                                                        <RadioGroup
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                        className="flex flex-wrap gap-x-4 gap-y-2 pt-1"
                                                        disabled={isReadOnly}
                                                        >
                                                        {RATING_SCALE.map((value) => (
                                                            <FormItem key={value} className="flex items-center space-x-2 space-y-0">
                                                            <FormControl>
                                                                <RadioGroupItem value={value} />
                                                            </FormControl>
                                                            <FormLabel className="font-normal text-sm">{value}</FormLabel>
                                                            </FormItem>
                                                        ))}
                                                        </RadioGroup>
                                                    </FormControl>
                                                    <FormMessage />
                                                    </FormItem>
                                                )}
                                                />
                                        ))}
                                    </div>
                                </section>
                                <section className="space-y-4">
                                    <h3 className="font-semibold">Feedback Kualitatif</h3>
                                     <FormField control={form.control} name="hrdComment" render={({ field }) => (<FormItem><FormLabel>Komentar HRD</FormLabel><FormControl><Textarea {...field} rows={5} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                                </section>
                            </form>
                        </Form>
                    </div>
                </ScrollArea>
                <DialogFooter className="p-6 pt-4 border-t">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Tutup</Button>
                    {!isReadOnly && <Button type="submit" form="evaluation-form" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Simpan Evaluasi</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
