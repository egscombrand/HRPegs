'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useCollection, updateDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, setDoc, serverTimestamp, getDocs, Timestamp, runTransaction, where } from 'firebase/firestore';
import { type JobApplication, type InternalReview, type InternalReviewScore, type InternalReviewSummary } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { 
  ClipboardCheck, 
  MessageSquare, 
  UserCheck, 
  AlertCircle, 
  ShieldCheck, 
  Clock, 
  ChevronDown,
  ChevronUp,
  Brain,
  Settings,
  Plus
} from 'lucide-react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter,
    DialogTrigger 
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface InternalEvaluationSectionProps {
  application: JobApplication;
}

export const scoreLabels: Record<InternalReviewScore, string> = {
  sangat_direkomendasikan: 'Sangat Direkomendasikan',
  direkomendasikan: 'Direkomendasikan',
  dipertimbangkan: 'Dipertimbangkan',
  belum_sesuai: 'Belum Sesuai',
};

export const scoreColors: Record<InternalReviewScore, string> = {
  sangat_direkomendasikan: 'bg-green-600 text-white',
  direkomendasikan: 'bg-green-100 text-green-700 border-green-200',
  dipertimbangkan: 'bg-amber-100 text-amber-700 border-amber-200',
  belum_sesuai: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function InternalEvaluationSection({ application }: InternalEvaluationSectionProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(true);

  // Form State
  const [score, setScore] = useState<InternalReviewScore | ''>('');
  const [note, setNote] = useState('');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');

  const isHRD = userProfile?.role === 'hrd' || userProfile?.role === 'super-admin';

  const reviewsRef = useMemo(() => 
    application.id ? collection(firestore, 'applications', application.id, 'internal_reviews') : null
  , [firestore, application.id]);

  const { data: reviews, isLoading: isLoadingReviews } = useCollection<InternalReview>(reviewsRef);

  const myReview = useMemo(() => 
    reviews?.find(r => r.reviewerUid === userProfile?.uid)
  , [reviews, userProfile?.uid]);

  // Set form state from existing review if available
  React.useEffect(() => {
    if (myReview) {
      setScore(myReview.score);
      setNote(myReview.note);
      setStrengths(myReview.strengths || '');
      setConcerns(myReview.concerns || '');
    }
  }, [myReview]);

  const canReview = useMemo(() => {
    if (!userProfile) return false;
    if (userProfile.role === 'hrd' || userProfile.role === 'super-admin') return true;
    return application.internalReviewConfig?.assignedReviewerUids?.includes(userProfile.uid) || false;
  }, [userProfile, application]);

  const handleSubmit = async () => {
    if (!userProfile || !application.id || !score) return;

    if (note.length < 15) {
      toast({ 
        variant: 'destructive', 
        title: 'Catatan Terlalu Pendek', 
        description: 'Catatan penilaian wajib diisi minimal 15 karakter.' 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const reviewRef = doc(firestore, 'applications', application.id, 'internal_reviews', userProfile.uid);
      const appRef = doc(firestore, 'applications', application.id);

      await runTransaction(firestore, async (transaction) => {
        // 1. Save/Update Review
        const reviewData: InternalReview = {
          applicationId: application.id!,
          reviewerUid: userProfile.uid,
          reviewerName: userProfile.fullName,
          reviewerRole: userProfile.role as any,
          score: score as InternalReviewScore,
          note,
          strengths,
          concerns,
          submittedAt: myReview?.submittedAt || Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        transaction.set(reviewRef, reviewData);

        // 2. Fetch all reviews to recalculate summary
        const reviewsSnap = await getDocs(collection(firestore, 'applications', application.id!, 'internal_reviews'));
        const allReviews = reviewsSnap.docs.map(d => d.data() as InternalReview);
        
        // Add current review to the list if it's new
        const existingIdx = allReviews.findIndex(r => r.reviewerUid === userProfile.uid);
        if (existingIdx >= 0) {
            allReviews[existingIdx] = reviewData;
        } else {
            allReviews.push(reviewData);
        }

        const assignedUids = application.internalReviewConfig?.assignedReviewerUids || [];
        const submittedUids = allReviews.map(r => r.reviewerUid);
        const pendingUids = assignedUids.filter(uid => !submittedUids.includes(uid));

        const summary: InternalReviewSummary = {
          totalAssigned: assignedUids.length,
          totalSubmitted: allReviews.length,
          totalSangatDirekomendasikan: allReviews.filter(r => r.score === 'sangat_direkomendasikan').length,
          totalDirekomendasikan: allReviews.filter(r => r.score === 'direkomendasikan').length,
          totalDipertimbangkan: allReviews.filter(r => r.score === 'dipertimbangkan').length,
          totalBelumSesuai: allReviews.filter(r => r.score === 'belum_sesuai').length,
          pendingReviewerUids: pendingUids,
          allSubmitted: assignedUids.length > 0 && allReviews.length >= assignedUids.length,
          lastUpdatedAt: Timestamp.now(),
        };

        transaction.update(appRef, {
          internalReviewSummary: summary,
          updatedAt: serverTimestamp(),
        });
      });

      toast({ title: 'Berhasil', description: 'Penilaian internal telah disimpan.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canReview && (!reviews || reviews.length === 0) && !isHRD) return null;

  return (
    <Card className="shadow-xl border-none rounded-[2rem] bg-card/60 backdrop-blur-sm overflow-hidden border-t-8 border-primary/20">
      <CardHeader className="bg-primary/5 pb-8">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                    <ClipboardCheck className="h-6 w-6" />
                </div>
                <div>
                    <CardTitle className="text-2xl font-black">Evaluasi Internal Kandidat</CardTitle>
                    <CardDescription className="text-muted-foreground">Analisis kualitatif tim rekrutmen terhadap kompetensi kandidat.</CardDescription>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {application.internalReviewConfig?.assignedReviewerUids?.map((uid, index) => {
                    const name = application.internalReviewConfig?.assignedReviewerNames?.[index] || 'Reviewer';
                    const hasSubmitted = reviews?.some(r => r.reviewerUid === uid);
                    return (
                        <div key={uid} className="flex items-center gap-2 px-3 py-1.5 bg-background/50 rounded-xl border text-[11px] font-bold">
                            <span className="text-muted-foreground">{name}</span>
                            {hasSubmitted ? (
                                <Badge variant="outline" className="h-4 px-1 text-[8px] bg-green-50 text-green-600 border-green-200 uppercase font-black">Sudah Menilai</Badge>
                            ) : (
                                <Badge variant="outline" className="h-4 px-1 text-[8px] bg-amber-50 text-amber-600 border-amber-200 uppercase font-black">Belum Menilai</Badge>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-10 space-y-10">
        {/* 1. Summary Section */}
        {application.internalReviewSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div className="p-4 rounded-2xl bg-white/50 border shadow-sm space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase uppercase tracking-widest">Sangat Merekomendasikan</p>
                    <p className="text-2xl font-black text-green-600">{application.internalReviewSummary.totalSangatDirekomendasikan}</p>
                 </div>
                 <div className="p-4 rounded-2xl bg-white/50 border shadow-sm space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase uppercase tracking-widest">Merekomendasikan</p>
                    <p className="text-2xl font-black text-green-500">{application.internalReviewSummary.totalDirekomendasikan}</p>
                 </div>
                 <div className="p-4 rounded-2xl bg-white/50 border shadow-sm space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase uppercase tracking-widest">Dipertimbangkan</p>
                    <p className="text-2xl font-black text-amber-500">{application.internalReviewSummary.totalDipertimbangkan}</p>
                 </div>
                 <div className="p-4 rounded-2xl bg-white/50 border shadow-sm space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase uppercase tracking-widest">Belum Sesuai</p>
                    <p className="text-2xl font-black text-destructive">{application.internalReviewSummary.totalBelumSesuai}</p>
                 </div>
            </div>
        )}

        {/* 2. My Review Form (Visible if canReview) */}
        {canReview && (
            <div className="space-y-6">
                 <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <Brain className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold">Form Penilaian Saya</h3>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2 space-y-3">
                        <label className="text-sm font-bold text-muted-foreground">HASIL EVALUASI</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {(Object.keys(scoreLabels) as InternalReviewScore[]).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setScore(s)}
                                    className={cn(
                                        "px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all text-left flex items-center justify-between",
                                        score === s 
                                            ? "border-primary bg-primary/5 text-primary shadow-md" 
                                            : "border-muted bg-white hover:border-primary/30 text-muted-foreground"
                                    )}
                                >
                                    {scoreLabels[s]}
                                    {score === s && <UserCheck className="h-4 w-4" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-3">
                        <label className="text-sm font-bold text-muted-foreground">CATATAN PENILAIAN (Min. 15 Karakter)</label>
                        <Textarea 
                            placeholder="Tuliskan analisis kualitatif Anda mengenai kandidat ini secara detail..." 
                            className="min-h-[120px] rounded-2xl resize-none p-4"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-muted-foreground uppercase">Kekuatan Utama</label>
                        <Textarea 
                            placeholder="Apa keunggulan mencolok kandidat ini?" 
                            className="min-h-[80px] rounded-xl text-sm"
                            value={strengths}
                            onChange={(e) => setStrengths(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-muted-foreground uppercase">Hal yang Perlu Diperhatikan</label>
                        <Textarea 
                            placeholder="Potensi risiko atau area pengembangan..." 
                            className="min-h-[80px] rounded-xl text-sm"
                            value={concerns}
                            onChange={(e) => setConcerns(e.target.value)}
                        />
                    </div>
                 </div>

                 <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                        <AlertCircle className="h-4 w-4" />
                        Penilaian ini bersifat internal dan tidak langsung menentukan hasil akhir kandidat.
                    </div>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || !score || note.length < 15}
                        className="w-full sm:w-auto px-10 rounded-xl"
                    >
                        {isSubmitting ? 'Menyimpan...' : myReview ? 'Perbarui Penilaian' : 'Kirim Penilaian'}
                    </Button>
                 </div>
            </div>
        )}

        <Separator />

        {/* 3. Review List Section */}
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <MessageSquare className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold">Semua Penilaian Tim</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowAllReviews(!showAllReviews)}>
                    {showAllReviews ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                    {showAllReviews ? 'Sembunyikan' : 'Lihat Semua'}
                </Button>
            </div>

            {showAllReviews && (
                <div className="space-y-6">
                    {reviews && reviews.length > 0 ? (
                        reviews.sort((a,b) => b.updatedAt.toMillis() - a.updatedAt.toMillis()).map((review) => (
                            <div key={review.reviewerUid} className="p-6 rounded-[2rem] bg-white border shadow-sm space-y-6 group hover:shadow-md transition-shadow">
                                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center font-bold text-lg">
                                            {review.reviewerName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-black text-lg">{review.reviewerName}</p>
                                            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase opacity-60">
                                                <span>{review.reviewerRole}</span>
                                                <span>•</span>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {format(review.updatedAt.toDate(), 'dd MMM yyyy, HH:mm')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <Badge className={cn("px-4 py-1.5 rounded-full text-xs font-black uppercase ring-2 ring-offset-2", scoreColors[review.score])}>
                                        {scoreLabels[review.score]}
                                    </Badge>
                                </div>

                                <div className="text-base leading-relaxed text-foreground/90 bg-muted/20 p-5 rounded-2xl italic">
                                    &ldquo; {review.note} &rdquo;
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl border border-green-100 bg-green-50/30">
                                        <p className="text-[10px] font-black uppercase text-green-700/60 mb-2 tracking-widest">Kekuatan</p>
                                        <p className="text-sm font-medium text-green-900">{review.strengths || '-'}</p>
                                    </div>
                                    <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/30">
                                        <p className="text-[10px] font-black uppercase text-amber-700/60 mb-2 tracking-widest">Perlu Perhatian</p>
                                        <p className="text-sm font-medium text-amber-900">{review.concerns || '-'}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-20 bg-muted/10 rounded-[2.5rem] border-2 border-dashed">
                             <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/10 mb-2" />
                             <p className="text-muted-foreground font-medium italic">Belum ada penilaian internal untuk kandidat ini.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
