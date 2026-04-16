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
  type InternalReview,
  type InternalReviewScore,
  type InternalReviewSummary,
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
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface InternalEvaluationSectionProps {
  application: JobApplication;
  job?: WithId<Job> | null;
  internalUsers?: WithId<UserProfile>[] | null;
}

export const scoreLabels: Record<InternalReviewScore, string> = {
  direkomendasikan: "Direkomendasikan",
  dipertimbangkan: "Dipertimbangkan",
  belum_sesuai: "Belum Sesuai",
};

export const scoreColors: Record<InternalReviewScore, string> = {
  direkomendasikan: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  dipertimbangkan: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  belum_sesuai: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

export function InternalEvaluationSection({
  application,
  job,
  internalUsers,
}: InternalEvaluationSectionProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(true);

  // Form State
  const [score, setScore] = useState<InternalReviewScore | "">("");
  const [note, setNote] = useState("");
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");

  const isHRD =
    userProfile?.role === "hrd" || userProfile?.role === "super-admin";

  const reviewsRef = useMemo(
    () =>
      application.id
        ? collection(
            firestore,
            "applications",
            application.id,
            "internal_reviews",
          )
        : null,
    [firestore, application.id],
  );

  const { data: reviews } = useCollection<InternalReview>(reviewsRef);

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
      setScore(myReview.score);
      setNote(myReview.note);
      setStrengths(myReview.strengths || "");
      setConcerns(myReview.concerns || "");
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
          const existing = list.find((item) => item.uid === uid);
          if (
            existing &&
            source === "Panelist" &&
            existing.source !== "Panelist"
          ) {
            existing.source = source;
          }
        }
        return;
      }

      let finalName = name;
      if (!finalName || finalName === "Reviewer" || finalName === "Panelist") {
        // Try fallback from internalUsers
        const user = internalUsers?.find((u) => u.uid === uid);
        if (user) finalName = user.fullName;
        // Try fallback from existing reviews
        else {
          const review = reviews?.find((r) => r.reviewerUid === uid);
          if (review) finalName = review.reviewerName;
        }
      }

      list.push({ uid, name: finalName || "Team Member", source });
      seenUids.add(uid);
    };

    // 1. From Config
    application.internalReviewConfig?.assignedReviewerUids?.forEach(
      (uid, index) => {
        addReviewer(
          uid,
          application.internalReviewConfig?.assignedReviewerNames?.[index] ||
            "",
          "Reviewer",
        );
      },
    );

    // 2. From Active Interviews
    application.interviews?.forEach((interview) => {
      if (interview.status !== "canceled") {
        interview.panelistIds?.forEach((uid, index) => {
          addReviewer(uid, interview.panelistNames?.[index] || "", "Panelist");
        });
      }
    });

    // 3. Fallback: allPanelistIds from application
    application.allPanelistIds?.forEach((uid: string) => {
      addReviewer(uid, "", "Recruitment Team");
    });

    // 4. From Job Assignment
    job?.assignedUserIds?.forEach((uid: string) => {
      addReviewer(uid, "", "Job Assigned");
    });

    return list;
  }, [application, job, internalUsers, reviews]);

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
    if (!userProfile || !application.id || !score) return;

    if (note.length < 15) {
      toast({
        variant: "destructive",
        title: "Catatan Terlalu Pendek",
        description: "Catatan penilaian wajib diisi minimal 15 karakter.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const reviewRef = doc(
        firestore,
        "applications",
        application.id,
        "internal_reviews",
        userProfile.uid,
      );
      const appRef = doc(firestore, "applications", application.id);

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
        const reviewsSnap = await getDocs(
          collection(
            firestore,
            "applications",
            application.id!,
            "internal_reviews",
          ),
        );
        const allReviews = reviewsSnap.docs.map(
          (d) => d.data() as InternalReview,
        );

        // Ensure current update is included in summary calculation
        const existingIdx = allReviews.findIndex(
          (r) => r.reviewerUid === userProfile.uid,
        );
        if (existingIdx >= 0) allReviews[existingIdx] = reviewData;
        else allReviews.push(reviewData);

        const assignedUids = potentialReviewers.map((p) => p.uid);
        const submittedUids = allReviews.map((r) => r.reviewerUid);
        const pendingUids = assignedUids.filter(
          (uid) => !submittedUids.includes(uid),
        );

        const summary: InternalReviewSummary = {
          totalAssigned: assignedUids.length,
          totalSubmitted: allReviews.length,
          totalDirekomendasikan: allReviews.filter(
            (r) => r.score === "direkomendasikan",
          ).length,
          totalDipertimbangkan: allReviews.filter(
            (r) => r.score === "dipertimbangkan",
          ).length,
          totalBelumSesuai: allReviews.filter((r) => r.score === "belum_sesuai")
            .length,
          pendingReviewerUids: pendingUids,
          submittedReviewerUids: submittedUids,
          allSubmitted:
            assignedUids.length > 0 && allReviews.length >= assignedUids.length,
          lastUpdatedAt: Timestamp.now(),
        };

        // Try updating parent doc - silently fail if no permission (review is already saved)
        await updateDocumentNonBlocking(appRef, {
          internalReviewSummary: summary,
          updatedAt: serverTimestamp(),
        });
      } catch (summaryError) {
        console.warn(
          "Review saved, but summary sync failed (likely permission):",
          summaryError,
        );
      }

      toast({
        title: "Berhasil",
        description: "Penilaian internal telah disimpan.",
      });
    } catch (error: any) {
      console.error("Critical error saving review:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error.message || "Check connection or permissions.",
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
    <Card className="shadow-2xl rounded-[3rem] overflow-hidden border border-slate-200/70 bg-slate-50/90 ring-1 ring-slate-200/60 border-t-8 border-indigo-500/15 dark:bg-[#020617]/40 dark:border-none dark:ring-white/5 dark:border-t-indigo-500/20">
      <CardHeader className="bg-indigo-500/10 pb-10 dark:bg-indigo-500/[0.03]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-[1.5rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/20">
              <ClipboardCheck className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-3xl font-black tracking-tighter uppercase text-slate-900 dark:text-slate-100">
                Evaluasi Internal
              </CardTitle>
              <CardDescription className="text-slate-600 font-bold italic dark:text-slate-400">
                Panel kendali & monitoring kualitatif tim rekrutmen.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-12 space-y-20">
        {/* Monitoring Dashboard for HRD & Assigned Reviewers */}
        {canSeeDashboard && (
          <div className="space-y-12 animate-in fade-in slide-in-from-top-6 duration-1000">
            {/* 1. Dashboard Header - Dark Theme Harmonized */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 p-10 rounded-[2.5rem] bg-white shadow-lg border border-slate-200/80 ring-1 ring-slate-200/60 dark:bg-slate-950/40 dark:border-slate-800 dark:ring-white/5">
              <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-[1.8rem] bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/20">
                  <Activity className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 italic dark:text-slate-100">
                    Progress Penilaian Tim
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-600 uppercase tracking-widest dark:text-slate-500">
                      <span className="text-indigo-700 dark:text-indigo-400">
                        {reviews?.length || 0}
                      </span>{" "}
                      dari{" "}
                      <span className="text-slate-700 dark:text-slate-300">
                        {potentialReviewers.length}
                      </span>{" "}
                      reviewer sudah submit
                    </p>
                    {reviews && reviews.length > 0 && (
                      <p className="text-[10px] font-bold text-slate-600 uppercase dark:text-slate-500">
                        Terakhir oleh:{" "}
                        <span className="text-emerald-400">
                          {
                            [...reviews].sort(
                              (a, b) =>
                                b.updatedAt.toMillis() - a.updatedAt.toMillis(),
                            )[0].reviewerName
                          }
                        </span>{" "}
                        •{" "}
                        {format(
                          [...reviews]
                            .sort(
                              (a, b) =>
                                b.updatedAt.toMillis() - a.updatedAt.toMillis(),
                            )[0]
                            .updatedAt.toDate(),
                          "HH:mm - dd MMM",
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                  <Badge className="bg-emerald-500/90 hover:bg-emerald-500 text-white px-6 py-2 rounded-2xl font-black text-xs shadow-lg shadow-emerald-500/20 w-full justify-center">
                    {reviews?.length || 0} SELESAI
                  </Badge>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Penilaian
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                  <Badge className="bg-amber-500/90 hover:bg-amber-500 text-white px-6 py-2 rounded-2xl font-black text-xs shadow-lg shadow-amber-500/20 w-full justify-center">
                    {pendingReviewers.length} MENUNGGU
                  </Badge>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    TIM
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                  <Badge
                    variant="outline"
                    className="border-slate-300 bg-slate-100 text-slate-900 px-6 py-2 rounded-2xl font-black text-xs w-full justify-center dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                  >
                    {potentialReviewers.length} TOTAL
                  </Badge>
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest dark:text-slate-500">
                    Team Size
                  </span>
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
                    <span className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-200">
                      Sudah Menilai
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-black px-4 py-1 bg-emerald-500/5 text-emerald-400 border-emerald-500/20 rounded-full"
                  >
                    {submittedReviewers.length} PERSONIL
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-5">
                  {submittedReviewers.map((p) => {
                    const review = reviews?.find(
                      (r) => r.reviewerUid === p.uid,
                    )!;
                    return (
                      <div
                        key={p.uid}
                        className="p-6 rounded-[2.2rem] bg-white/90 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-6 group hover:border-emerald-500/40 hover:bg-slate-50 transition-all duration-500 dark:bg-slate-900/40 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-6">
                          <Avatar className="h-16 w-16 rounded-[1.4rem] border-4 border-slate-200 shadow-2xl group-hover:scale-105 transition-transform duration-500 ring-2 ring-emerald-500/10 dark:border-slate-800">
                            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-green-600 text-white font-black text-xl">
                              {p.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-black text-lg uppercase tracking-tight text-slate-900 leading-none mb-2 dark:text-slate-100">
                              {p.name}
                            </p>
                            <div className="flex items-center gap-3">
                              <Badge
                                className={cn(
                                  "text-[8px] px-3 py-1 rounded-full font-black uppercase border-0 shadow-lg",
                                  scoreColors[review.score],
                                )}
                              >
                                {scoreLabels[review.score]}
                              </Badge>
                              <p className="text-[10px] font-bold text-slate-600 uppercase flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-full border border-slate-200/60 dark:bg-slate-950/40 dark:border-slate-800/50 dark:text-slate-500">
                                <Clock className="h-3 w-3 text-emerald-500" />
                                {format(
                                  review.updatedAt.toDate(),
                                  "dd MMM, HH:mm",
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest dark:text-slate-300">
                            Progress
                          </span>
                          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-[9px] font-black uppercase dark:text-emerald-400">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            SUBMITTED
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {submittedReviewers.length === 0 && (
                    <div className="p-16 text-center rounded-[2.5rem] bg-slate-100 border-2 border-dashed border-slate-300 dark:bg-slate-900/20 dark:border-slate-800">
                      <AlertCircle className="h-12 w-12 mx-auto text-slate-600 mb-4 dark:text-slate-300" />
                      <p className="text-slate-700 text-sm font-bold italic uppercase tracking-widest dark:text-slate-500">
                        Belum ada tim yang submit.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Column: Pending Submission */}
              <div className="space-y-8">
                <div className="flex items-center justify-between px-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-[1rem] bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                      <Clock className="h-5 w-5 animate-pulse" />
                    </div>
                    <span className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-200">
                      Menunggu Penilaian
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-black px-4 py-1 bg-amber-500/5 text-amber-400 border-amber-500/20 rounded-full"
                  >
                    {pendingReviewers.length} PERSONIL
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-5">
                  {pendingReviewers.map((p) => (
                    <div
                      key={p.uid}
                      className="p-6 rounded-[2.2rem] bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-6 group hover:bg-slate-100 hover:border-amber-500/40 transition-all duration-500 dark:bg-slate-900/20 dark:border-slate-800/60"
                    >
                      <div className="flex items-center gap-6 opacity-80 group-hover:opacity-100 transition-all duration-500">
                        <Avatar className="h-16 w-16 rounded-[1.4rem] border-4 border-slate-200 shadow-sm opacity-70 filter grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all dark:border-slate-800">
                          <AvatarFallback className="bg-slate-800 text-slate-200 font-black text-xl">
                            {p.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-black text-lg uppercase tracking-tight text-slate-900 group-hover:text-slate-900 transition-colors leading-none mb-2 dark:text-slate-100">
                            {p.name}
                          </p>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="text-[8px] px-3 py-1 rounded-full font-black uppercase border-slate-300 text-slate-700 group-hover:text-amber-600 group-hover:border-amber-500/20 transition-all dark:border-slate-700 dark:text-slate-400"
                            >
                              {p.source}
                            </Badge>
                            <p className="text-[9px] font-black uppercase text-amber-700 tracking-widest animate-pulse dark:text-amber-400">
                              Awaiting assessment...
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest dark:text-slate-300">
                          Status
                        </span>
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[9px] font-black uppercase dark:text-amber-400">
                          PENDING
                        </div>
                      </div>
                    </div>
                  ))}
                  {pendingReviewers.length === 0 && (
                    <div className="p-16 text-center rounded-[2.5rem] bg-emerald-100 border-2 border-emerald-200 shadow-2xl shadow-emerald-200/70 dark:bg-emerald-500/5 dark:border-emerald-500/20 dark:shadow-emerald-500/5">
                      <ShieldCheck className="h-12 w-12 mx-auto text-emerald-600 mb-4 animate-bounce dark:text-emerald-500/40" />
                      <p className="text-emerald-700 text-sm font-black uppercase tracking-widest italic dark:text-emerald-400">
                        All Assessments Completed!
                      </p>
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
              {
                key: "totalDirekomendasikan",
                label: "Merekomendasikan",
                color: "bg-emerald-600 shadow-emerald-500/30",
                icon: UserCheck,
              },
              {
                key: "totalDipertimbangkan",
                label: "Dipertimbangkan",
                color: "bg-amber-600 shadow-amber-500/30",
                icon: AlertCircle,
              },
              {
                key: "totalBelumSesuai",
                label: "Belum Sesuai",
                color: "bg-rose-600 shadow-rose-500/30",
                icon: XCircle,
              },
            ].map((item) => (
              <div
                key={item.key}
                className={cn(
                  "p-10 rounded-[3rem] border-2 border-white/5 shadow-2xl space-y-3 group hover:-translate-y-3 transition-all duration-500 overflow-hidden relative",
                  item.color,
                )}
              >
                <p className="text-[11px] font-black text-white/50 uppercase tracking-[0.25em] relative z-10">
                  {item.label}
                </p>
                <p className="text-6xl font-black text-white relative z-10 antialiased">
                  {(application.internalReviewSummary as any)[item.key] || 0}
                </p>
                <item.icon className="absolute -bottom-6 -right-6 h-32 w-32 text-white/10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-700" />
              </div>
            ))}
          </div>
        )}

        {/* 2. My Review Form - Professional Dark Container */}
        {canReview &&
          (!application.internalReviewConfig?.reviewLocked || myReview) && (
            <div className="space-y-12 p-12 rounded-[3.5rem] bg-white/90 border border-slate-200/80 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-950/40 dark:border-slate-800 dark:ring-white/5">
              <div className="flex items-center gap-5">
                <div className="h-12 w-12 rounded-[1.2rem] bg-indigo-500/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20 shadow-inner dark:text-indigo-400">
                  <Brain className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-900 uppercase italic dark:text-slate-100">
                    Form Penilaian Saya
                  </h3>
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1 dark:text-slate-500">
                    Kontribusi Anda sangat berharga bagi tim rekrutmen.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="lg:col-span-2 space-y-6">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-[0.25em] pl-4 border-l-4 border-indigo-500 dark:text-slate-500">
                    HASIL EVALUASI INTERAL
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                    {(Object.keys(scoreLabels) as InternalReviewScore[]).map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setScore(s)}
                          className={cn(
                            "px-8 py-8 rounded-[2rem] border-2 text-sm font-black transition-all text-left flex items-center justify-between group relative overflow-hidden",
                            score === s
                              ? "border-emerald-500 bg-emerald-600 text-white shadow-2xl shadow-emerald-500/40 scale-[1.05]"
                              : "border-slate-200 bg-slate-100 hover:border-emerald-500/30 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400",
                          )}
                        >
                          <span className="uppercase tracking-tight leading-tight relative z-10">
                            {scoreLabels[s]}
                          </span>
                          {score === s ? (
                            <UserCheck className="h-6 w-6 relative z-10" />
                          ) : (
                            <Plus className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                          )}
                          {score === s && (
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent -rotate-12 translate-y-4" />
                          )}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-5">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-[0.25em] pl-4 border-l-4 border-indigo-500 dark:text-slate-400">
                    ANALISIS KUALITATIF (MIN. 15 KARAKTER)
                  </label>
                  <Textarea
                    placeholder="Tuliskan analisis kualitatif Anda mengenai kandidat ini secara detail..."
                    className="min-h-[180px] rounded-[2.5rem] resize-none p-8 text-lg font-medium border-2 border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-sm dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-200 dark:placeholder:text-slate-500"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <div className="space-y-5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] pl-4 border-l-4 border-emerald-500">
                    Kekuatan Utama
                  </label>
                  <Textarea
                    placeholder="Apa keunggulan mencolok kandidat ini?"
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
                    placeholder="Potensi risiko atau area pengembangan..."
                    className="min-h-[110px] rounded-[2rem] text-sm border-2 border-slate-800 bg-amber-500/[0.02] text-slate-300 focus:border-amber-500/50 transition-all shadow-sm"
                    value={concerns}
                    onChange={(e) => setConcerns(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-8 p-4 rounded-3xl bg-indigo-900/10">
                <div className="flex items-center gap-3 text-sm text-indigo-300">
                  <AlertCircle className="w-5 h-5 text-indigo-400" />
                  <span className="font-semibold">
                    {application.internalReviewConfig?.reviewLocked
                      ? "Evaluasi telah dikunci oleh HRD."
                      : "Penilaian ini bersifat rahasia."}
                  </span>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    !score ||
                    note.length < 15 ||
                    !!application.internalReviewConfig?.reviewLocked
                  }
                  className="px-10 h-14 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  ) : null}
                  {isSubmitting
                    ? "MEMPROSES..."
                    : application.internalReviewConfig?.reviewLocked
                      ? "TERKUNCI"
                      : myReview
                        ? "UPDATE EVALUASI"
                        : "KIRIM EVALUASI"}
                </Button>
              </div>
            </div>
          )}

        {/* 3. Review List Section - Glass Aesthetics */}
        <div className="space-y-12">
          <div className="flex items-center justify-between px-6">
            <div className="flex items-center gap-5">
              <div className="h-12 w-12 rounded-[1.2rem] bg-indigo-500/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20 dark:text-indigo-400">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 italic dark:text-slate-100">
                Penilaian Tim
              </h3>
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowAllReviews(!showAllReviews)}
              className="rounded-[1.5rem] font-black uppercase border-2 border-slate-200 text-slate-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all text-[10px] tracking-widest px-8 dark:border-slate-800 dark:text-slate-400"
            >
              {showAllReviews ? (
                <ChevronUp className="mr-2 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-2 h-4 w-4" />
              )}
              {showAllReviews ? "Sembunyikan" : "Lihat Semua"}
            </Button>
          </div>

          {showAllReviews && (
            <div className="space-y-10">
              {myReview && (
                <div className="space-y-8 px-6">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-[1.2rem] bg-slate-100 text-indigo-600 flex items-center justify-center border border-slate-200/70 dark:bg-slate-900/80 dark:text-indigo-400 dark:border-indigo-500/20">
                      <UserCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-slate-100">
                        Penilaian Saya
                      </h4>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1 dark:text-slate-500">
                        Hanya menampilkan penilaian Anda sendiri.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-5">
                    <div
                      key={myReview.reviewerUid}
                      className="p-12 rounded-[4rem] bg-white/90 border border-slate-200/80 shadow-2xl space-y-10 relative overflow-hidden ring-1 ring-slate-200/60 dark:bg-slate-950/20 dark:border-slate-800 dark:ring-white/5"
                    >
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-8 relative z-10">
                        <div className="flex items-center gap-6">
                          <div className="h-20 w-20 rounded-[1.8rem] bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center font-black text-3xl text-slate-900 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-600">
                            {myReview.reviewerName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-3xl uppercase tracking-tighter leading-tight text-slate-900 italic dark:text-slate-100">
                              {myReview.reviewerName}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-600 uppercase tracking-widest mt-2 dark:text-slate-500">
                              <Badge
                                variant="outline"
                                className="border-indigo-500/30 text-indigo-400 font-black uppercase bg-indigo-500/5 px-4 py-1 rounded-full"
                              >
                                {myReview.reviewerRole}
                              </Badge>
                              <span className="text-slate-800">|</span>
                              <div className="flex items-center gap-2 font-bold opacity-60">
                                <Clock className="h-4 w-4 text-indigo-500" />
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
                            scoreColors[myReview.score],
                          )}
                        >
                          {scoreLabels[myReview.score]}
                        </Badge>
                      </div>

                      <div className="text-2xl leading-[1.6] text-slate-900 font-medium bg-slate-100 p-12 rounded-[3.5rem] relative border-l-8 border-indigo-500/30 transition-all shadow-inner italic dark:text-slate-300 dark:bg-slate-900/40">
                        <div className="absolute -top-4 left-10 px-6 bg-white text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] border border-slate-200 rounded-full shadow-2xl dark:bg-slate-950 dark:text-indigo-400 dark:border-slate-800">
                          Catatan Analogi
                        </div>
                        &ldquo; {myReview.note} &rdquo;
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
                  <div className="h-12 w-12 rounded-[1.2rem] bg-slate-100 text-indigo-600 flex items-center justify-center border border-slate-200/70 dark:bg-slate-900/80 dark:text-indigo-400 dark:border-indigo-500/20">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-slate-100">
                      Penilaian Tim
                    </h4>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1 dark:text-slate-500">
                      Hanya menampilkan penilaian evaluator lain.
                    </p>
                  </div>
                </div>

                {sortedOtherReviews.length > 0 ? (
                  sortedOtherReviews.map((review) => (
                    <div
                      key={review.reviewerUid}
                      className="p-12 rounded-[4rem] bg-white/90 border border-slate-200/80 shadow-2xl space-y-10 group transition-all duration-700 hover:bg-slate-100 hover:border-indigo-500/20 relative overflow-hidden ring-1 ring-slate-200/60 dark:bg-slate-950/20 dark:border-slate-800 dark:ring-white/5"
                    >
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-8 relative z-10">
                        <div className="flex items-center gap-6">
                          <div className="h-20 w-20 rounded-[1.8rem] bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center font-black text-3xl text-slate-900 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300">
                            {review.reviewerName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-3xl uppercase tracking-tighter leading-tight text-slate-900 group-hover:translate-x-1 transition-transform duration-500 italic dark:text-slate-100">
                              {review.reviewerName}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-600 uppercase tracking-widest mt-2 dark:text-slate-500">
                              <Badge
                                variant="outline"
                                className="border-indigo-500/30 text-indigo-400 font-black uppercase bg-indigo-500/5 px-4 py-1 rounded-full"
                              >
                                {review.reviewerRole}
                              </Badge>
                              <span className="text-slate-800">|</span>
                              <div className="flex items-center gap-2 font-bold opacity-60">
                                <Clock className="h-4 w-4 text-indigo-500" />
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
                            scoreColors[review.score],
                          )}
                        >
                          {scoreLabels[review.score]}
                        </Badge>
                      </div>

                      <div className="text-2xl leading-[1.6] text-slate-900 font-medium bg-slate-100 p-12 rounded-[3.5rem] relative border-l-8 border-indigo-500/30 group-hover:bg-slate-100 transition-all shadow-inner italic dark:text-slate-300 dark:bg-slate-900/40">
                        <div className="absolute -top-4 left-10 px-6 bg-white text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] border border-slate-200 rounded-full shadow-2xl dark:bg-slate-950 dark:text-indigo-400 dark:border-slate-800">
                          Catatan Analogi
                        </div>
                        &ldquo; {review.note} &rdquo;
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                        <div className="p-10 rounded-[2.5rem] border border-emerald-500/10 bg-emerald-500/[0.02] transition-all">
                          <p className="text-[10px] font-black uppercase text-emerald-500/60 mb-4 tracking-[0.3em] flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" /> Kekuatan Utama
                          </p>
                          <p className="text-lg font-bold text-slate-400 leading-relaxed italic">
                            {review.strengths || "-"}
                          </p>
                        </div>
                        <div className="p-10 rounded-[2.5rem] border border-rose-500/10 bg-rose-500/[0.02] transition-all">
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
