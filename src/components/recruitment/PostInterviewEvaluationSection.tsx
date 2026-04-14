"use client";

import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  useCollection,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
} from "@/firebase";
import {
  doc,
  collection,
  serverTimestamp,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import {
  type JobApplication,
  type PostInterviewReview,
  type PostInterviewReviewScore,
  type PostInterviewEvaluationSummary,
  type Job,
  type UserProfile,
} from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { type WithId } from "@/firebase";
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
  Loader2,
  Star,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PostInterviewEvaluationSectionProps {
  application: JobApplication;
  job?: WithId<Job> | null;
  internalUsers?: WithId<UserProfile>[] | null;
}

export const postScoreLabels: Record<PostInterviewReviewScore, string> = {
  direkomendasikan: "Direkomendasikan",
  dipertimbangkan: "Dipertimbangkan",
  belum_direkomendasikan: "Belum Direkomendasikan",
};

export const postScoreColors: Record<PostInterviewReviewScore, string> = {
  direkomendasikan: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  dipertimbangkan: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  belum_direkomendasikan: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const StarRating = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) => (
  <div className="space-y-2">
    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
      {label}
    </p>
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            "p-1 transition-all duration-200",
            s <= value
              ? "text-teal-400 scale-110"
              : "text-slate-700 hover:text-teal-400/50",
          )}
        >
          <Star className="h-6 w-6 fill-current" />
        </button>
      ))}
    </div>
  </div>
);

export function PostInterviewEvaluationSection({
  application,
  job,
  internalUsers,
}: PostInterviewEvaluationSectionProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(true);

  // Form State
  const [recommendation, setRecommendation] = useState<
    PostInterviewReviewScore | ""
  >("");
  const [notes, setNotes] = useState("");
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [communicationScore, setCommunicationScore] = useState(0);
  const [attitudeScore, setAttitudeScore] = useState(0);
  const [fitScore, setFitScore] = useState(0);

  const isHRD =
    userProfile?.role === "hrd" || userProfile?.role === "super-admin";

  const reviewsRef = useMemo(
    () =>
      application.id
        ? collection(
            firestore,
            "applications",
            application.id,
            "post_interview_reviews",
          )
        : null,
    [firestore, application.id],
  );

  const { data: reviews } = useCollection<PostInterviewReview>(reviewsRef);

  const myReview = useMemo(
    () => reviews?.find((r) => r.reviewerUid === userProfile?.uid),
    [reviews, userProfile?.uid],
  );

  const otherReviews = useMemo(
    () =>
      reviews?.filter((review) => review.reviewerUid !== userProfile?.uid) ??
      [],
    [reviews, userProfile?.uid],
  );

  const sortedOtherReviews = useMemo(
    () =>
      [...otherReviews].sort(
        (a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis(),
      ),
    [otherReviews],
  );

  // Set form state from existing review if available
  React.useEffect(() => {
    if (myReview) {
      setRecommendation(myReview.recommendation);
      setNotes(myReview.notes);
      setStrengths(myReview.strengths);
      setConcerns(myReview.concerns);
      setCommunicationScore(myReview.communicationScore);
      setAttitudeScore(myReview.attitudeScore);
      setFitScore(myReview.fitScore);
    }
  }, [myReview]);

  // Define potential reviewers (Panelists only for Post-Interview)
  const potentialReviewers = useMemo(() => {
    const list: { uid: string; name: string; source: string }[] = [];
    const seenUids = new Set<string>();

    const addReviewer = (uid: string, name: string, source: string) => {
      if (!uid || seenUids.has(uid)) return;

      let finalName = name;
      if (!finalName || finalName === "Panelist") {
        const user = internalUsers?.find((u) => u.uid === uid);
        if (user) finalName = user.fullName;
        else {
          const review = reviews?.find((r) => r.reviewerUid === uid);
          if (review) finalName = review.reviewerName;
        }
      }

      list.push({ uid, name: finalName || "Team Member", source });
      seenUids.add(uid);
    };

    // 1. From Active Interviews
    application.interviews?.forEach((interview) => {
      if (interview.status !== "canceled") {
        interview.panelistIds?.forEach((uid, index) => {
          addReviewer(uid, interview.panelistNames?.[index] || "", "Panelist");
        });
      }
    });

    // 2. Fallback: allPanelistIds from application
    application.allPanelistIds?.forEach((uid: string) => {
      addReviewer(uid, "", "Recruitment Team");
    });

    return list;
  }, [application, internalUsers, reviews]);

  const isReviewer = useMemo(() => {
    return potentialReviewers.some((p) => p.uid === userProfile?.uid);
  }, [potentialReviewers, userProfile?.uid]);

  const canSeeDashboard = isHRD || isReviewer;

  const canReview = useMemo(() => {
    if (!userProfile) return false;
    if (userProfile.role === "hrd" || userProfile.role === "super-admin")
      return true;
    return potentialReviewers.some((p) => p.uid === userProfile.uid);
  }, [userProfile, potentialReviewers]);

  const handleSubmit = async () => {
    if (!userProfile || !application.id || !recommendation) return;

    if (notes.length < 20) {
      toast({
        variant: "destructive",
        title: "Catatan Terlalu Pendek",
        description: "Catatan hasil interview wajib diisi minimal 20 karakter.",
      });
      return;
    }

    if (communicationScore === 0 || attitudeScore === 0 || fitScore === 0) {
      toast({
        variant: "destructive",
        title: "Aspek Belum Dinilai",
        description:
          "Mohon berikan nilai untuk aspek komunikasi, attitude, dan kesesuaian role.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const reviewRef = doc(
        firestore,
        "applications",
        application.id,
        "post_interview_reviews",
        userProfile.uid,
      );
      const appRef = doc(firestore, "applications", application.id);

      const reviewData: PostInterviewReview = {
        applicationId: application.id!,
        reviewerUid: userProfile.uid,
        reviewerName: userProfile.fullName,
        reviewerRole: userProfile.role as any,
        recommendation: recommendation as PostInterviewReviewScore,
        notes,
        strengths,
        concerns,
        communicationScore,
        attitudeScore,
        fitScore,
        submittedAt: myReview?.submittedAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDocumentNonBlocking(reviewRef, reviewData, { merge: true });

      // Update Summary
      try {
        const reviewsSnap = await getDocs(
          collection(
            firestore,
            "applications",
            application.id!,
            "post_interview_reviews",
          ),
        );
        const allReviews = reviewsSnap.docs.map(
          (d) => d.data() as PostInterviewReview,
        );

        // Include current in calculation
        const existingIdx = allReviews.findIndex(
          (r) => r.reviewerUid === userProfile.uid,
        );
        if (existingIdx >= 0) allReviews[existingIdx] = reviewData;
        else allReviews.push(reviewData);

        const assignedUids = potentialReviewers.map((p) => p.uid);

        const summary: PostInterviewEvaluationSummary = {
          evaluators: assignedUids,
          submissions: allReviews.length,
          progress:
            assignedUids.length > 0
              ? (allReviews.length / assignedUids.length) * 100
              : 100,
          recommendation: recommendation as PostInterviewReviewScore, // Last one for quick view or logic
          lastUpdatedAt: Timestamp.now(),
        };

        await updateDocumentNonBlocking(appRef, {
          postInterviewEvaluation: summary,
          updatedAt: serverTimestamp(),
        });
      } catch (summaryError) {
        console.warn(
          "Post-interview review saved, but summary sync failed:",
          summaryError,
        );
      }

      toast({
        title: "Berhasil",
        description: "Penilaian pasca-wawancara telah disimpan.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error.message || "Error saving post-interview review.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canReview && (!reviews || reviews.length === 0) && !isHRD) return null;

  const submittedReviewers = potentialReviewers.filter((p) =>
    reviews?.some((r) => r.reviewerUid === p.uid),
  );
  const pendingReviewers = potentialReviewers.filter(
    (p) => !reviews?.some((r) => r.reviewerUid === p.uid),
  );

  return (
    <Card className="shadow-2xl border-none rounded-[3rem] bg-[#020617]/40 backdrop-blur-xl overflow-hidden border-t-8 border-teal-500/20 ring-1 ring-white/5">
      <CardHeader className="bg-teal-500/[0.03] pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-[1.5rem] bg-teal-600 text-white shadow-2xl shadow-teal-500/20">
              <Users className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-3xl font-black tracking-tighter uppercase text-slate-100">
                Evaluasi Pasca-Wawancara
              </CardTitle>
              <CardDescription className="text-teal-400 font-bold italic">
                Penilaian berdasarkan hasil interview langsung
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest">
              Interview Stage
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-12 space-y-20">
        {/* Progress Assessment Team (PASCA) */}
        {canSeeDashboard && (
          <div className="space-y-12 animate-in fade-in slide-in-from-top-6 duration-1000">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 p-10 rounded-[2.5rem] bg-slate-950/40 border border-slate-800 shadow-2xl ring-1 ring-white/5">
              <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-[1.8rem] bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-2xl shadow-teal-500/20">
                  <Activity className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-100 italic">
                    Progress Penilaian Tim (Pasca)
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                      <span className="text-teal-400">
                        {reviews?.length || 0}
                      </span>{" "}
                      dari{" "}
                      <span className="text-slate-300">
                        {potentialReviewers.length}
                      </span>{" "}
                      evaluator sudah submit
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                  <Badge className="bg-teal-500/90 hover:bg-teal-500 text-white px-6 py-2 rounded-2xl font-black text-xs shadow-lg shadow-teal-500/20 w-full justify-center">
                    {reviews?.length || 0} SELESAI
                  </Badge>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Submit
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                  <Badge className="bg-amber-500/90 hover:bg-amber-500 text-white px-6 py-2 rounded-2xl font-black text-xs shadow-lg shadow-amber-500/20 w-full justify-center">
                    {pendingReviewers.length} BELUM
                  </Badge>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Submit
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                  <Badge
                    variant="outline"
                    className="border-slate-700 bg-slate-900/50 text-slate-300 px-6 py-2 rounded-2xl font-black text-xs w-full justify-center"
                  >
                    {potentialReviewers.length} TOTAL
                  </Badge>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Evaluators
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Form Penilaian Saya (PASCA) */}
        {canReview && (
          <div className="space-y-12 p-12 rounded-[3.5rem] bg-slate-950/40 border border-slate-800 shadow-2xl ring-1 ring-white/5">
            <div className="flex items-center gap-5">
              <div className="h-12 w-12 rounded-[1.2rem] bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shadow-inner">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-100 uppercase italic">
                  Form Penilaian Saya (Pasca)
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                  Berikan feedback mendalam setelah berinteraksi langsung.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="lg:col-span-2 space-y-6">
                <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-teal-500">
                  REKOMENDASI AKHIR
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(
                    Object.keys(postScoreLabels) as PostInterviewReviewScore[]
                  ).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRecommendation(s)}
                      className={cn(
                        "px-8 py-8 rounded-[2rem] border-2 text-sm font-black transition-all text-left flex items-center justify-between group relative overflow-hidden",
                        recommendation === s
                          ? "border-teal-500 bg-teal-600 text-white shadow-2xl shadow-teal-500/40 scale-[1.05]"
                          : "border-slate-800 bg-slate-950/40 hover:border-teal-500/30 text-slate-400",
                      )}
                    >
                      <span className="uppercase tracking-tight leading-tight relative z-10">
                        {postScoreLabels[s]}
                      </span>
                      {recommendation === s ? (
                        <UserCheck className="h-6 w-6 relative z-10" />
                      ) : (
                        <Plus className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-8 p-10 rounded-[2.5rem] bg-teal-500/[0.03] border border-teal-500/10 shadow-inner">
                <StarRating
                  label="Komunikasi"
                  value={communicationScore}
                  onChange={setCommunicationScore}
                />
                <StarRating
                  label="Attitude / Perilaku"
                  value={attitudeScore}
                  onChange={setAttitudeScore}
                />
                <StarRating
                  label="Kesesuaian dengan Role"
                  value={fitScore}
                  onChange={setFitScore}
                />
              </div>

              <div className="md:col-span-2 space-y-5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-teal-500">
                  CATATAN UMUM (WAJIB)
                </label>
                <div className="relative">
                  <Textarea
                    placeholder="Tuliskan analisis kualitatif Anda setelah wawancara..."
                    className="min-h-[150px] rounded-[2.5rem] resize-none p-8 text-lg font-medium border-2 border-slate-800 bg-slate-950/60 text-slate-200 focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/5 transition-all shadow-inner"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="absolute bottom-6 right-8 text-[10px] font-black text-slate-600 uppercase">
                    {notes.length} / 20 MIN
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-emerald-500">
                  Kekuatan Utama
                </label>
                <Textarea
                  placeholder="Apa keunggulan yang terlihat saat interview?"
                  className="min-h-[110px] rounded-[2rem] text-sm border-2 border-slate-800 bg-emerald-500/[0.02] text-slate-300 focus:border-emerald-500/50 transition-all shadow-sm"
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                />
              </div>

              <div className="space-y-5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-amber-500">
                  Hal yang Perlu Diperhatikan
                </label>
                <Textarea
                  placeholder="Kekhawatiran atau area yang butuh klarifikasi..."
                  className="min-h-[110px] rounded-[2rem] text-sm border-2 border-slate-800 bg-amber-500/[0.02] text-slate-300 focus:border-amber-500/50 transition-all shadow-sm"
                  value={concerns}
                  onChange={(e) => setConcerns(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 p-4 rounded-3xl bg-teal-900/10 border border-teal-500/10">
              <div className="flex items-center gap-3 text-sm text-teal-300">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
                <span className="font-semibold italic">
                  Penilaian interview bersifat final dan rahasia.
                </span>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !recommendation || notes.length < 20}
                className="px-10 h-14 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-black uppercase tracking-widest shadow-xl shadow-teal-500/20"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : null}
                {myReview ? "UPDATE EVALUASI" : "KIRIM EVALUASI INTERVIEW"}
              </Button>
            </div>
          </div>
        )}

        {/* 3. Hasil Penilaian Tim (PASCA) */}
        <div className="space-y-12">
          <div className="flex items-center justify-between px-6">
            <div className="flex items-center gap-5">
              <div className="h-12 w-12 rounded-[1.2rem] bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-100 italic">
                Penilaian Tim
              </h3>
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowAllReviews(!showAllReviews)}
              className="rounded-[1.5rem] font-black uppercase border-2 border-slate-800 text-slate-400 hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-all text-[10px] tracking-widest px-8"
            >
              {showAllReviews ? (
                <ChevronUp className="mr-2 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-2 h-4 w-4" />
              )}
              {showAllReviews ? "Sembunyikan" : "Lihat Hasil"}
            </Button>
          </div>

          {showAllReviews && (
            <div className="space-y-10">
              {myReview && (
                <div className="space-y-8 px-6">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-[1.2rem] bg-slate-900/80 text-teal-400 flex items-center justify-center border border-teal-500/20">
                      <UserCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tighter text-slate-100">
                        Penilaian Saya
                      </h4>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                        Hanya menampilkan penilaian Anda sendiri.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-5">
                    <div
                      key={myReview.reviewerUid}
                      className="p-12 rounded-[4rem] bg-slate-950/20 border border-slate-800 shadow-2xl space-y-10 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-8 relative z-10">
                        <div className="flex items-center gap-6">
                          <div className="h-20 w-20 rounded-[1.8rem] bg-slate-900 border border-slate-800 shadow-inner flex items-center justify-center font-black text-3xl text-slate-600 group-hover:bg-teal-600 group-hover:text-white transition-all duration-700">
                            {myReview.reviewerName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-3xl uppercase tracking-tighter leading-tight text-slate-100 italic">
                              {myReview.reviewerName}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">
                              <Badge
                                variant="outline"
                                className="border-teal-500/30 text-teal-400 font-black uppercase bg-teal-500/5 px-4 py-1 rounded-full"
                              >
                                {myReview.reviewerRole}
                              </Badge>
                              <span className="text-slate-800">|</span>
                              <div className="flex items-center gap-2 font-bold opacity-60">
                                <Clock className="h-4 w-4 text-teal-500" />
                                {format(
                                  myReview.updatedAt.toDate(),
                                  "dd MMM yyyy, HH:mm",
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "px-10 py-4 rounded-full text-[10px] font-black uppercase shadow-2xl scale-110 sm:scale-100",
                            postScoreColors[myReview.recommendation],
                          )}
                        >
                          {postScoreLabels[myReview.recommendation]}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 rounded-[2.5rem] bg-slate-950/40 border border-slate-800 shadow-inner">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            Komunikasi
                          </p>
                          <div className="flex text-teal-400 pb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-4 w-4 fill-current",
                                  i > myReview.communicationScore &&
                                    "text-slate-800",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            Attitude
                          </p>
                          <div className="flex text-teal-400 pb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-4 w-4 fill-current",
                                  i > myReview.attitudeScore &&
                                    "text-slate-800",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            Role Fit
                          </p>
                          <div className="flex text-teal-400 pb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-4 w-4 fill-current",
                                  i > myReview.fitScore && "text-slate-800",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="text-2xl leading-[1.6] text-slate-300 font-medium bg-slate-900/40 p-12 rounded-[3.5rem] relative border-l-8 border-teal-500/30 group-hover:bg-slate-900/60 transition-all shadow-inner italic">
                        &ldquo; {myReview.notes} &rdquo;
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                        <div className="p-10 rounded-[2.5rem] border border-emerald-500/10 bg-emerald-500/[0.02] transition-all">
                          <p className="text-[10px] font-black uppercase text-emerald-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" /> Kekuatan Utama
                          </p>
                          <p className="text-lg font-bold text-slate-400 leading-relaxed italic">
                            {myReview.strengths || "-"}
                          </p>
                        </div>
                        <div className="p-10 rounded-[2.5rem] border border-rose-500/10 bg-rose-500/[0.02] transition-all">
                          <p className="text-[10px] font-black uppercase text-rose-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" /> Perlu Perhatian
                          </p>
                          <p className="text-lg font-bold text-slate-400 leading-relaxed italic">
                            {myReview.concerns || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6 px-6">
                <div className="flex items-center gap-5">
                  <div className="h-12 w-12 rounded-[1.2rem] bg-slate-900/80 text-teal-400 flex items-center justify-center border border-teal-500/20">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tighter text-slate-100">
                      Penilaian Tim
                    </h4>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                      Hanya menampilkan penilaian evaluator lain.
                    </p>
                  </div>
                </div>

                {sortedOtherReviews.length > 0 ? (
                  sortedOtherReviews.map((review) => (
                    <div
                      key={review.reviewerUid}
                      className="p-12 rounded-[4rem] bg-slate-950/20 border border-slate-800 shadow-2xl space-y-10 group transition-all duration-700 hover:bg-slate-950/40 hover:border-teal-500/20 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-8 relative z-10">
                        <div className="flex items-center gap-6">
                          <div className="h-20 w-20 rounded-[1.8rem] bg-slate-900 border border-slate-800 shadow-inner flex items-center justify-center font-black text-3xl text-slate-600 group-hover:bg-teal-600 group-hover:text-white transition-all duration-700">
                            {review.reviewerName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-3xl uppercase tracking-tighter leading-tight text-slate-100 group-hover:translate-x-1 transition-transform duration-500 italic">
                              {review.reviewerName}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">
                              <Badge
                                variant="outline"
                                className="border-teal-500/30 text-teal-400 font-black uppercase bg-teal-500/5 px-4 py-1 rounded-full"
                              >
                                {review.reviewerRole}
                              </Badge>
                              <span className="text-slate-800">|</span>
                              <div className="flex items-center gap-2 font-bold opacity-60">
                                <Clock className="h-4 w-4 text-teal-500" />
                                {format(
                                  review.updatedAt.toDate(),
                                  "dd MMM yyyy, HH:mm",
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "px-10 py-4 rounded-full text-[10px] font-black uppercase shadow-2xl scale-110 sm:scale-100",
                            postScoreColors[review.recommendation],
                          )}
                        >
                          {postScoreLabels[review.recommendation]}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 rounded-[2.5rem] bg-slate-950/40 border border-slate-800 shadow-inner">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            Komunikasi
                          </p>
                          <div className="flex text-teal-400 pb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-4 w-4 fill-current",
                                  i > review.communicationScore &&
                                    "text-slate-800",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            Attitude
                          </p>
                          <div className="flex text-teal-400 pb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-4 w-4 fill-current",
                                  i > review.attitudeScore && "text-slate-800",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            Role Fit
                          </p>
                          <div className="flex text-teal-400 pb-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-4 w-4 fill-current",
                                  i > review.fitScore && "text-slate-800",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="text-2xl leading-[1.6] text-slate-300 font-medium bg-slate-900/40 p-12 rounded-[3.5rem] relative border-l-8 border-teal-500/30 group-hover:bg-slate-900/60 transition-all shadow-inner italic">
                        &ldquo; {review.notes} &rdquo;
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                        <div className="p-10 rounded-[2.5rem] border border-emerald-500/10 bg-emerald-500/[0.02] group-hover:bg-emerald-500/[0.04] transition-all">
                          <p className="text-[10px] font-black uppercase text-emerald-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" /> Kekuatan Utama
                          </p>
                          <p className="text-lg font-bold text-slate-400 leading-relaxed italic">
                            {review.strengths || "-"}
                          </p>
                        </div>
                        <div className="p-10 rounded-[2.5rem] border border-rose-500/10 bg-rose-500/[0.02] group-hover:bg-rose-500/[0.04] transition-all">
                          <p className="text-[10px] font-black uppercase text-rose-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" /> Perlu Perhatian
                          </p>
                          <p className="text-lg font-bold text-slate-400 leading-relaxed italic">
                            {review.concerns || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-16 text-center rounded-[2.5rem] bg-slate-900/20 border-2 border-dashed border-slate-800">
                    <AlertCircle className="h-12 w-12 mx-auto text-slate-700 mb-4" />
                    <p className="text-slate-500 text-sm font-bold italic uppercase tracking-widest">
                      Belum ada penilaian dari evaluator lain
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
