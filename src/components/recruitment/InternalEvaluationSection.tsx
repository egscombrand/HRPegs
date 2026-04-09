'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, collection, serverTimestamp, getDocs, Timestamp } from 'firebase/firestore';
import { type JobApplication, type InternalReview, type InternalReviewScore, type InternalReviewSummary, type Job, type UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { type WithId } from '@/firebase';
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
  Plus,
  CheckCircle,
  XCircle,
  Activity,
  Loader2
} from 'lucide-react';
import { 
  Avatar, 
  AvatarFallback, 
} from "@/components/ui/avatar";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface InternalEvaluationSectionProps {
  application: JobApplication;
  job?: WithId<Job> | null;
  internalUsers?: WithId<UserProfile>[] | null;
}

export const scoreLabels: Record<InternalReviewScore, string> = {
  direkomendasikan: 'Direkomendasikan',
  dipertimbangkan: 'Dipertimbangkan',
  belum_sesuai: 'Belum Sesuai',
};

export const scoreColors: Record<InternalReviewScore, string> = {
  direkomendasikan: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dipertimbangkan: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  belum_sesuai: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export function InternalEvaluationSection({ application, job, internalUsers }: InternalEvaluationSectionProps) {
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

  const { data: reviews } = useCollection<InternalReview>(reviewsRef);

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

  // Define potential reviewers (Panelists + assigned reviewers + job assigned)
  const potentialReviewers = useMemo(() => {
    const list: { uid: string; name: string; source: string }[] = [];
    const seenUids = new Set<string>();

    const addReviewer = (uid: string, name: string, source: string) => {
        if (!uid || seenUids.has(uid)) {
            // If already seen, maybe update source if more relevant
            if (uid && seenUids.has(uid)) {
                const existing = list.find(item => item.uid === uid);
                if (existing && source === 'Panelist' && existing.source !== 'Panelist') {
                    existing.source = source;
                }
            }
            return;
        }
        
        let finalName = name;
        if (!finalName || finalName === 'Reviewer' || finalName === 'Panelist') {
            // Try fallback from internalUsers
            const user = internalUsers?.find(u => u.uid === uid);
            if (user) finalName = user.fullName;
            // Try fallback from existing reviews
            else {
                const review = reviews?.find(r => r.reviewerUid === uid);
                if (review) finalName = review.reviewerName;
            }
        }

        list.push({ uid, name: finalName || 'Team Member', source });
        seenUids.add(uid);
    };

    // 1. From Config
    application.internalReviewConfig?.assignedReviewerUids?.forEach((uid, index) => {
        addReviewer(uid, application.internalReviewConfig?.assignedReviewerNames?.[index] || '', 'Reviewer');
    });

    // 2. From Active Interviews
    application.interviews?.forEach(interview => {
        if (interview.status !== 'canceled') {
            interview.panelistIds?.forEach((uid, index) => {
                addReviewer(uid, interview.panelistNames?.[index] || '', 'Panelist');
            });
        }
    });

    // 3. Fallback: allPanelistIds from application
    application.allPanelistIds?.forEach((uid: string) => {
        addReviewer(uid, '', 'Recruitment Team');
    });

    // 4. From Job Assignment
    job?.assignedUserIds?.forEach((uid: string) => {
        addReviewer(uid, '', 'Job Assigned');
    });

    return list;
  }, [application, job, internalUsers, reviews]);

  const canReview = useMemo(() => {
    if (!userProfile) return false;
    if (userProfile.role === 'hrd' || userProfile.role === 'super-admin') return true;
    return potentialReviewers.some(p => p.uid === userProfile.uid);
  }, [userProfile, potentialReviewers]);

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

      // 1. Save/Update the individual Review (Should be allowed for all panelists)
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

      await setDocumentNonBlocking(reviewRef, reviewData, { merge: true });

      // 2. Attempt to update the Application Summary (Might fail for non-HRD due to Firestore rules)
      try {
        const reviewsSnap = await getDocs(collection(firestore, 'applications', application.id!, 'internal_reviews'));
        const allReviews = reviewsSnap.docs.map(d => d.data() as InternalReview);
        
        // Ensure current update is included in summary calculation
        const existingIdx = allReviews.findIndex(r => r.reviewerUid === userProfile.uid);
        if (existingIdx >= 0) allReviews[existingIdx] = reviewData;
        else allReviews.push(reviewData);

        const assignedUids = potentialReviewers.map(p => p.uid);
        const submittedUids = allReviews.map(r => r.reviewerUid);
        const pendingUids = assignedUids.filter(uid => !submittedUids.includes(uid));

        const summary: InternalReviewSummary = {
          totalAssigned: assignedUids.length,
          totalSubmitted: allReviews.length,
          totalDirekomendasikan: allReviews.filter(r => r.score === 'direkomendasikan').length,
          totalDipertimbangkan: allReviews.filter(r => r.score === 'dipertimbangkan').length,
          totalBelumSesuai: allReviews.filter(r => r.score === 'belum_sesuai').length,
          pendingReviewerUids: pendingUids,
          allSubmitted: assignedUids.length > 0 && allReviews.length >= assignedUids.length,
          lastUpdatedAt: Timestamp.now(),
        };

        // Try updating parent doc - silently fail if no permission (review is already saved)
        await updateDocumentNonBlocking(appRef, {
          internalReviewSummary: summary,
          updatedAt: serverTimestamp(),
        });
      } catch (summaryError) {
        console.warn("Review saved, but summary sync failed (likely permission):", summaryError);
      }

      toast({ title: 'Berhasil', description: 'Penilaian internal telah disimpan.' });
    } catch (error: any) {
      console.error("Critical error saving review:", error);
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message || 'Check connection or permissions.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canReview && (!reviews || reviews.length === 0) && !isHRD) return null;

  const submittedReviewers = potentialReviewers.filter(p => reviews?.some(r => r.reviewerUid === p.uid));
  const pendingReviewers = potentialReviewers.filter(p => !reviews?.some(r => r.reviewerUid === p.uid));

  return (
    <Card className="shadow-2xl border-none rounded-[3rem] bg-[#020617]/40 backdrop-blur-xl overflow-hidden border-t-8 border-indigo-500/20 ring-1 ring-white/5">
      <CardHeader className="bg-indigo-500/[0.03] pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
                <div className="p-4 rounded-[1.5rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/20">
                    <ClipboardCheck className="h-7 w-7" />
                </div>
                <div>
                    <CardTitle className="text-3xl font-black tracking-tighter uppercase text-slate-100">Evaluasi Internal</CardTitle>
                    <CardDescription className="text-slate-400 font-bold italic">Panel kendali & monitoring kualitatif tim rekrutmen.</CardDescription>
                </div>
            </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-12 space-y-20">
        {/* Monitoring Dashboard for HRD */}
        {isHRD && (
            <div className="space-y-12 animate-in fade-in slide-in-from-top-6 duration-1000">
                {/* 1. Dashboard Header - Dark Theme Harmonized */}
                <div className="flex flex-col lg:flex-row items-center justify-between gap-8 p-10 rounded-[2.5rem] bg-slate-950/40 border border-slate-800 shadow-2xl ring-1 ring-white/5">
                    <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-[1.8rem] bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/20">
                            <Activity className="h-8 w-8" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-100 italic">Progress Penilaian Tim</h3>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
                                <span className="text-indigo-400">{reviews?.length || 0}</span> dari <span className="text-slate-300">{potentialReviewers.length}</span> reviewer sudah submit
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap justify-center gap-4">
                        <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                            <Badge className="bg-emerald-500/90 hover:bg-emerald-500 text-white px-6 py-2 rounded-2xl font-black text-xs shadow-lg shadow-emerald-500/20 w-full justify-center">{reviews?.length || 0} SELESAI</Badge>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Penilaian</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                            <Badge className="bg-amber-500/90 hover:bg-amber-500 text-white px-6 py-2 rounded-2xl font-black text-xs shadow-lg shadow-amber-500/20 w-full justify-center">{pendingReviewers.length} MENUNGGU</Badge>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">TIM</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                            <Badge variant="outline" className="border-slate-700 bg-slate-900/50 text-slate-300 px-6 py-2 rounded-2xl font-black text-xs w-full justify-center">{potentialReviewers.length} TOTAL</Badge>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Team Size</span>
                        </div>
                    </div>
                </div>

                {/* 2. Reviewer Detail Lists */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                    {/* Column: Already Submitted */}
                    <div className="space-y-8">
                        <div className="flex items-center justify-between px-6">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-[1rem] bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                                    <CheckCircle className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-black uppercase tracking-widest text-slate-200">Sudah Menilai</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-black px-4 py-1 bg-emerald-500/5 text-emerald-400 border-emerald-500/20 rounded-full">{submittedReviewers.length} PERSONIL</Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-5">
                            {submittedReviewers.map(p => {
                                const review = reviews?.find(r => r.reviewerUid === p.uid)!;
                                return (
                                    <div key={p.uid} className="p-6 rounded-[2.2rem] bg-slate-900/40 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6 group hover:border-emerald-500/40 hover:bg-slate-900/60 transition-all duration-500">
                                        <div className="flex items-center gap-6">
                                            <Avatar className="h-16 w-16 rounded-[1.4rem] border-4 border-slate-800 shadow-2xl group-hover:scale-105 transition-transform duration-500 ring-2 ring-emerald-500/10">
                                                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-green-600 text-white font-black text-xl">{p.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-black text-lg uppercase tracking-tight text-slate-100 leading-none mb-2">{p.name}</p>
                                                <div className="flex items-center gap-3">
                                                    <Badge className={cn("text-[8px] px-3 py-1 rounded-full font-black uppercase border-0 shadow-lg", scoreColors[review.score])}>
                                                        {scoreLabels[review.score]}
                                                    </Badge>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5 bg-slate-950/40 px-3 py-1 rounded-full border border-slate-800/50">
                                                        <Clock className="h-3 w-3 text-emerald-400" />
                                                        {format(review.updatedAt.toDate(), 'dd MMM, HH:mm')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Progress</span>
                                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                SUBMITTED
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            {submittedReviewers.length === 0 && (
                                <div className="p-16 text-center rounded-[2.5rem] bg-slate-900/20 border-2 border-dashed border-slate-800">
                                    <AlertCircle className="h-12 w-12 mx-auto text-slate-700 mb-4" />
                                    <p className="text-slate-500 text-sm font-bold italic uppercase tracking-widest">Belum ada tim yang submit.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Column: Pending Submission */}
                    <div className="space-y-8">
                         <div className="flex items-center justify-between px-6">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-[1rem] bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                                    <Clock className="h-5 w-5 animate-pulse" />
                                </div>
                                <span className="text-sm font-black uppercase tracking-widest text-slate-200">Menunggu Penilaian</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-black px-4 py-1 bg-amber-500/5 text-amber-400 border-amber-500/20 rounded-full">{pendingReviewers.length} PERSONIL</Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-5">
                            {pendingReviewers.map(p => (
                                <div key={p.uid} className="p-6 rounded-[2.2rem] bg-slate-900/20 border border-slate-800/60 flex items-center justify-between gap-6 group hover:bg-slate-900/40 hover:border-amber-500/40 transition-all duration-500">
                                    <div className="flex items-center gap-6 opacity-60 group-hover:opacity-100 transition-all duration-500">
                                        <Avatar className="h-16 w-16 rounded-[1.4rem] border-4 border-slate-900/50 shadow-sm opacity-40 filter grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                                            <AvatarFallback className="bg-slate-800 text-slate-500 font-black text-xl">{p.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-black text-lg uppercase tracking-tight text-slate-400 group-hover:text-slate-100 transition-colors leading-none mb-2">{p.name}</p>
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className="text-[8px] px-3 py-1 rounded-full font-black uppercase border-slate-800 text-slate-500 group-hover:text-amber-400 group-hover:border-amber-500/20 transition-all">
                                                    {p.source}
                                                </Badge>
                                                <p className="text-[9px] font-black uppercase text-amber-500/40 tracking-widest animate-pulse">Awaiting assessment...</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Status</span>
                                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/5 border border-amber-500/10 text-amber-500/40 text-[9px] font-black uppercase">
                                            PENDING
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {pendingReviewers.length === 0 && (
                                <div className="p-16 text-center rounded-[2.5rem] bg-emerald-500/5 border-2 border-emerald-500/20 shadow-2xl shadow-emerald-500/5">
                                    <ShieldCheck className="h-12 w-12 mx-auto text-emerald-500/40 mb-4 animate-bounce" />
                                    <p className="text-emerald-400 text-sm font-black uppercase tracking-widest italic">All Assessments Completed!</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <Separator className="bg-slate-800/50" />
            </div>
        )}

        {/* 1. Summary Cards Section - Dark Harmonized */}
        {application.internalReviewSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                 {[
                    { key: 'totalDirekomendasikan', label: 'Merekomendasikan', color: 'bg-emerald-600 shadow-emerald-500/30', icon: UserCheck },
                    { key: 'totalDipertimbangkan', label: 'Dipertimbangkan', color: 'bg-amber-600 shadow-amber-500/30', icon: AlertCircle },
                    { key: 'totalBelumSesuai', label: 'Belum Sesuai', color: 'bg-rose-600 shadow-rose-500/30', icon: XCircle }
                 ].map((item) => (
                    <div key={item.key} className={cn("p-10 rounded-[3rem] border-2 border-white/5 shadow-2xl space-y-3 group hover:-translate-y-3 transition-all duration-500 overflow-hidden relative", item.color)}>
                        <p className="text-[11px] font-black text-white/50 uppercase tracking-[0.25em] relative z-10">{item.label}</p>
                        <p className="text-6xl font-black text-white relative z-10 antialiased">
                            { (application.internalReviewSummary as any)[item.key] || 0 }
                        </p>
                        <item.icon className="absolute -bottom-6 -right-6 h-32 w-32 text-white/10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-700" />
                    </div>
                 ))}
            </div>
        )}

        {/* 2. My Review Form - Professional Dark Container */}
        {canReview && (
            <div className="space-y-12 p-12 rounded-[3.5rem] bg-slate-950/40 border border-slate-800 shadow-2xl ring-1 ring-white/5">
                 <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-[1.2rem] bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                        <Brain className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black tracking-tight text-slate-100 uppercase italic">Form Penilaian Saya</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Kontribusi Anda sangat berharga bagi tim rekrutmen.</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="lg:col-span-2 space-y-6">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-indigo-500">HASIL EVALUASI INTERAL</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                            {(Object.keys(scoreLabels) as InternalReviewScore[]).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setScore(s)}
                                    className={cn(
                                        "px-8 py-8 rounded-[2rem] border-2 text-sm font-black transition-all text-left flex items-center justify-between group relative overflow-hidden",
                                        score === s 
                                            ? "border-emerald-500 bg-emerald-600 text-white shadow-2xl shadow-emerald-500/40 scale-[1.05]" 
                                            : "border-slate-800 bg-slate-950/40 hover:border-emerald-500/30 text-slate-400"
                                    )}
                                >
                                    <span className="uppercase tracking-tight leading-tight relative z-10">{scoreLabels[s]}</span>
                                    {score === s ? <UserCheck className="h-6 w-6 relative z-10" /> : <Plus className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />}
                                    {score === s && <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent -rotate-12 translate-y-4" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-indigo-500">ANALISIS KUALITATIF (MIN. 15 KARAKTER)</label>
                        <Textarea 
                            placeholder="Tuliskan analisis kualitatif Anda mengenai kandidat ini secara detail..." 
                            className="min-h-[180px] rounded-[2.5rem] resize-none p-8 text-lg font-medium border-2 border-slate-800 bg-slate-950/60 text-slate-200 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-inner"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>

                    <div className="space-y-5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-emerald-500">Kekuatan Utama</label>
                        <Textarea 
                            placeholder="Apa keunggulan mencolok kandidat ini?" 
                            className="min-h-[110px] rounded-[2rem] text-sm border-2 border-slate-800 bg-emerald-500/[0.02] text-slate-300 focus:border-emerald-500/50 transition-all shadow-sm"
                            value={strengths}
                            onChange={(e) => setStrengths(e.target.value)}
                        />
                    </div>

                    <div className="space-y-5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-amber-500">Hal yang Perlu Diperhatikan</label>
                        <Textarea 
                            placeholder="Potensi risiko atau area pengembangan..." 
                            className="min-h-[110px] rounded-[2rem] text-sm border-2 border-slate-800 bg-amber-500/[0.02] text-slate-300 focus:border-amber-500/50 transition-all shadow-sm"
                            value={concerns}
                            onChange={(e) => setConcerns(e.target.value)}
                        />
                    </div>
                 </div>

                 <div className="flex flex-col sm:flex-row items-center justify-between gap-8 p-10 rounded-[2.5rem] bg-indigo-950/20 border border-indigo-500/10 shadow-inner">
                    <div className="flex items-center gap-5 text-indigo-200/60 text-sm font-bold uppercase tracking-tight italic">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 shadow-sm border border-indigo-500/20">
                            <AlertCircle className="h-7 w-7 text-indigo-400 shrink-0" />
                        </div>
                        Penilaian ini bersifat rahasia dan hanya digunakan untuk kepentingan rekrutmen internal.
                    </div>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || !score || note.length < 15}
                        className="w-full sm:w-auto px-16 h-18 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-500/40 transition-all hover:scale-105 hover:bg-indigo-500 bg-indigo-600 text-white border-0"
                    >
                        {isSubmitting ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : null}
                        {isSubmitting ? 'MEMPROSES...' : myReview ? 'UPDATE EVALUASI' : 'KIRIM EVALUASI'}
                    </Button>
                 </div>
            </div>
        )}

        {/* 3. Review List Section - Glass Aesthetics */}
        <div className="space-y-12">
            <div className="flex items-center justify-between px-6">
                <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-[1.2rem] bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                        <MessageSquare className="h-6 w-6" />
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-100 italic">Esei Penilaian Tim</h3>
                </div>
                <Button variant="outline" size="lg" onClick={() => setShowAllReviews(!showAllReviews)} className="rounded-[1.5rem] font-black uppercase border-2 border-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all text-[10px] tracking-widest px-8">
                    {showAllReviews ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                    {showAllReviews ? 'Sembunyikan' : 'Lihat Semua'}
                </Button>
            </div>

            {showAllReviews && (
                <div className="space-y-10">
                    {reviews && reviews.length > 0 ? (
                        [...reviews].sort((a,b) => b.updatedAt.toMillis() - a.updatedAt.toMillis()).map((review) => (
                            <div key={review.reviewerUid} className="p-12 rounded-[4rem] bg-slate-950/20 border border-slate-800 shadow-2xl space-y-10 group transition-all duration-700 hover:bg-slate-950/40 hover:border-indigo-500/20 relative overflow-hidden ring-1 ring-white/5">
                                <div className="flex flex-col sm:flex-row items-start justify-between gap-8 relative z-10">
                                    <div className="flex items-center gap-6">
                                        <div className="h-20 w-20 rounded-[1.8rem] bg-slate-900 border border-slate-800 shadow-inner flex items-center justify-center font-black text-3xl text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-700">
                                            {review.reviewerName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-black text-3xl uppercase tracking-tighter leading-tight text-slate-100 group-hover:translate-x-1 transition-transform duration-500 italic">{review.reviewerName}</p>
                                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">
                                                <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 font-black uppercase bg-indigo-500/5 px-4 py-1 rounded-full">{review.reviewerRole}</Badge>
                                                <span className="text-slate-800">|</span>
                                                <div className="flex items-center gap-2 font-bold opacity-60">
                                                    <Clock className="h-4 w-4 text-indigo-500" />
                                                    {format(review.updatedAt.toDate(), 'dd MMM yyyy, HH:mm')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <Badge className={cn("px-10 py-4 rounded-full text-[10px] font-black uppercase shadow-2xl scale-110 sm:scale-100", scoreColors[review.score])}>
                                        {scoreLabels[review.score]}
                                    </Badge>
                                </div>

                                <div className="text-2xl leading-[1.6] text-slate-300 font-medium bg-slate-900/40 p-12 rounded-[3.5rem] relative border-l-8 border-indigo-500/30 group-hover:bg-slate-900/60 transition-all shadow-inner italic">
                                    <div className="absolute -top-4 left-10 px-6 bg-slate-950 text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] border border-slate-800 rounded-full shadow-2xl">Catatan Analogi</div>
                                    &ldquo; {review.note} &rdquo;
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                    <div className="p-10 rounded-[2.5rem] border border-emerald-500/10 bg-emerald-500/[0.02] group-hover:bg-emerald-500/[0.04] transition-all">
                                        <p className="text-[10px] font-black uppercase text-emerald-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4" /> Kekuatan Utama
                                        </p>
                                        <p className="text-lg font-bold text-slate-400 leading-relaxed italic">{review.strengths || '-'}</p>
                                    </div>
                                    <div className="p-10 rounded-[2.5rem] border border-rose-500/10 bg-rose-500/[0.02] group-hover:bg-rose-500/[0.04] transition-all">
                                        <p className="text-[10px] font-black uppercase text-rose-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" /> Perlu Perhatian
                                        </p>
                                        <p className="text-lg font-bold text-slate-400 leading-relaxed italic">{review.concerns || '-'}</p>
                                    </div>
                                </div>

                                {/* Abstract Background Decoration */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-full pointer-events-none overflow-hidden opacity-5 group-hover:opacity-10 transition-opacity">
                                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500 filter blur-[100px]" />
                                    <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-purple-500 filter blur-[100px]" />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-40 bg-slate-900/20 rounded-[5rem] border-4 border-dashed border-slate-800 relative overflow-hidden ring-1 ring-white/5">
                             <MessageSquare className="h-28 w-28 mx-auto text-slate-800 mb-8 opacity-20" />
                             <p className="text-slate-600 text-2xl font-black uppercase tracking-[0.3em] opacity-40">Belum Ada Esei Penilaian</p>
                             <div className="absolute inset-0 bg-grid-white/[0.02] [mask-image:linear-gradient(0deg,#000,rgba(0,0,0,0.5))] -z-10" />
                        </div>
                    )}
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
