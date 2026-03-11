'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { MonthlyEvaluation, RatingScale, EvaluationCriteria } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { ThumbsUp, Lightbulb, MessageSquare, ListTodo, Star, CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


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

const RatingDisplay = ({ rating }: { rating: RatingScale }) => {
    const config = {
        "Sangat Baik": "text-green-600",
        "Baik": "text-blue-600",
        "Cukup": "text-yellow-600",
        "Perlu Perbaikan": "text-red-600"
    };
    return <span className={`font-semibold ${config[rating] || 'text-muted-foreground'}`}>{rating}</span>
}

const FeedbackSection = ({ title, content, icon }: { title: string, content?: string, icon: React.ReactNode }) => {
    if (!content) return null;
    return (
        <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">{icon} {title}</h4>
            <p className="text-sm text-muted-foreground pl-7 whitespace-pre-wrap">{content}</p>
        </div>
    );
};

export default function EvaluasiPage() {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const evaluationsQuery = useMemoFirebase(() => {
        if (!userProfile?.uid) return null;
        return query(
            collection(firestore, 'monthly_evaluations'), 
            where('internUid', '==', userProfile.uid),
        );
    }, [userProfile?.uid, firestore]);

    const { data: fetchedEvaluations, isLoading: evalsLoading } = useCollection<MonthlyEvaluation>(evaluationsQuery);
    
    const evaluations = useMemo(() => {
        if (!fetchedEvaluations) return null;
        return [...fetchedEvaluations]
          .filter(e => e.hrdComment)
          .sort((a, b) => (b.evaluationMonth?.toMillis() || 0) - (a.evaluationMonth?.toMillis() || 0));
    }, [fetchedEvaluations]);
    
    const isLoading = authLoading || evalsLoading;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-6 w-2/3" />
                <div className="space-y-2 pt-4">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </div>
            </div>
        );
    }
    
    if (!evaluations || evaluations.length === 0) {
        return (
             <Card className="h-80 flex flex-col items-center justify-center text-center">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <CheckCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <CardTitle className="mt-4">Belum Ada Evaluasi</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Evaluasi bulanan Anda dari HRD akan muncul di sini setelah dibuat.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Evaluasi & Feedback</h1>
                <p className="text-muted-foreground">Kumpulan feedback dan evaluasi dari HRD selama periode magang.</p>
            </div>

            <Accordion type="single" collapsible className="w-full space-y-4" defaultValue={evaluations[0]?.id}>
                {evaluations.map(evaluation => (
                    <AccordionItem value={evaluation.id!} key={evaluation.id} className="border rounded-xl bg-card shadow-sm">
                        <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
                           Evaluasi Periode: {format(evaluation.evaluationMonth.toDate(), 'MMMM yyyy', { locale: id })}
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                            <Separator className="mb-6" />
                            <div className="space-y-6">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Periode: <span className="font-medium text-foreground">{format(evaluation.evaluationMonth.toDate(), 'MMMM yyyy', { locale: id })}</span></p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Terakhir diperbarui: {evaluation.updatedAt ? formatDistanceToNow(evaluation.updatedAt.toDate(), { addSuffix: true, locale: id }) : '-'}</p>
                                </div>
                                
                                <div className="space-y-4">
                                    <h4 className="font-semibold flex items-center gap-2"><Star className="h-5 w-5 text-yellow-500" /> Penilaian Parameter</h4>
                                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
                                        {EVALUATION_CRITERIA.map(crit => (
                                            <div key={crit.key} className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground">{crit.label}</span>
                                                <RatingDisplay rating={(evaluation.ratings?.[crit.key] as RatingScale) || 'Cukup'} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <Separator />

                                <div className="space-y-4">
                                     <FeedbackSection
                                        title="Komentar HRD"
                                        content={evaluation.hrdComment}
                                        icon={<MessageSquare className="h-5 w-5 text-primary" />}
                                    />
                                     <FeedbackSection
                                        title="Kelebihan Utama"
                                        content={evaluation.mainStrengths}
                                        icon={<ThumbsUp className="h-5 w-5 text-green-500" />}
                                    />
                                     <FeedbackSection
                                        title="Area untuk Perbaikan"
                                        content={evaluation.improvementAreas}
                                        icon={<Lightbulb className="h-5 w-5 text-yellow-500" />}
                                    />
                                     <FeedbackSection
                                        title="Rekomendasi Bulan Berikutnya"
                                        content={evaluation.nextMonthRecommendation}
                                        icon={<CheckCircle className="h-5 w-5 text-blue-500" />}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    )
}
