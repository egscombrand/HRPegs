"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, updateDocumentNonBlocking } from "@/firebase";
import { doc, serverTimestamp } from "firebase/firestore";
import {
  type JobApplication,
  type RecruitmentInternalDecisionStatus,
  type PostInterviewDecisionStatus,
  type Notification as ApplicationNotification,
} from "@/lib/types";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  MessageSquareDiff,
  Loader2,
  CalendarCheck,
  PauseCircle,
  XCircle,
  Briefcase,
  History,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { collection, addDoc, Timestamp } from "firebase/firestore";

interface UnifiedInternalDecisionProps {
  application: JobApplication;
  onStageChange?: (
    newStage: JobApplication["status"],
    reason: string,
  ) => Promise<boolean>;
}

export function UnifiedInternalDecision({
  application,
  onStageChange,
}: UnifiedInternalDecisionProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"pra" | "pasca">("pra");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pra States
  const [praDecision, setPraDecision] = useState<
    RecruitmentInternalDecisionStatus | ""
  >("");
  const [praNote, setPraNote] = useState("");

  // Pasca States
  const [pascaDecision, setPascaDecision] = useState<
    PostInterviewDecisionStatus | ""
  >("");
  const [pascaNote, setPascaNote] = useState("");

  const isHRD =
    userProfile?.role === "hrd" || userProfile?.role === "super-admin";

  const existingPra = application.recruitmentInternalDecision;
  const existingPasca = application.postInterviewDecision;

  const isPascaAvailable = useMemo(() => {
    // Always available if in interview status or beyond
    const stages = [
      "interview",
      "verification",
      "document_submission",
      "offered",
      "hired",
      "rejected",
    ];
    return stages.includes(application.status);
  }, [application.status]);

  const isLocked = application.candidateStatus === "lolos";
  const isFinalDecisionLocked = application.finalDecisionLocked === true;

  // Sync state
  useEffect(() => {
    if (existingPra) {
      setPraDecision(existingPra.status);
      setPraNote(existingPra.note);
    }
    if (existingPasca) {
      setPascaDecision(existingPasca.status);
      setPascaNote(existingPasca.note || "");
    }
  }, [existingPra, existingPasca]);

  // Auto-switch to pasca if available and pra is done
  useEffect(() => {
    if (
      isPascaAvailable &&
      existingPra &&
      activeTab === "pra" &&
      !existingPasca
    ) {
      setActiveTab("pasca");
    }
  }, [isPascaAvailable, existingPra, existingPasca]);

  const handleSavePra = async () => {
    if (!userProfile || !application.id || !praDecision) return;
    if (praNote.length < 5) {
      toast({
        variant: "destructive",
        title: "Catatan Wajib",
        description: "Mohon berikan alasan/catatan internal.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const appRef = doc(firestore, "applications", application.id);

      if (praDecision === "lanjut_ke_tahap_selanjutnya" && onStageChange) {
        if (
          application.status === "screening" ||
          application.status === "tes_kepribadian"
        ) {
          await onStageChange(
            "interview",
            "Kandidat diloloskan evaluasi internal dan maju ke tahap wawancara.",
          );
        }
      }

      await updateDocumentNonBlocking(appRef, {
        recruitmentInternalDecision: {
          status: praDecision,
          note: praNote,
          decidedBy: userProfile.uid,
          decidedByName: userProfile.fullName,
          decidedAt: serverTimestamp(),
        },
        candidateStatus:
          praDecision === "lanjut_ke_tahap_selanjutnya"
            ? "interview_scheduled"
            : "menunggu",
        "internalReviewConfig.reviewLocked": true,
        updatedAt: serverTimestamp(),
      });

      // Send Notif to Candidate if Lolos ke interview
      if (praDecision === "lanjut_ke_tahap_selanjutnya") {
        const nextStageLabel = statusDisplayLabels.interview;
        const notifRef = collection(
          firestore,
          "users",
          application.candidateUid,
          "notifications",
        );
        await addDoc(notifRef, {
          userId: application.candidateUid,
          type: "stage_advanced",
          title: `Anda lolos ke tahap ${nextStageLabel}`,
          message: `Lamaran Anda untuk posisi ${application.jobPosition} telah lolos ke tahap ${nextStageLabel}.`,
          module: "recruitment",
          targetType: "application",
          targetId: application.id!,
          isRead: false,
          createdAt: Timestamp.now(),
          createdBy: userProfile.uid,
          actionUrl: `/careers/portal/applications`,
        });
      }

      toast({ title: "Keputusan Pra-Wawancara Disimpan" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePasca = async () => {
    if (!userProfile || !application.id || !pascaDecision) return;

    setIsSubmitting(true);
    try {
      const appRef = doc(firestore, "applications", application.id);

      const nextStage =
        pascaDecision === "lanjut" 
          ? "offered" 
          : pascaDecision === "tidak_lanjut" 
            ? "rejected" 
            : application.status;
            
      const updatePayload: any = {
        postInterviewDecision: {
          status: pascaDecision,
          note: pascaNote,
          decidedBy: userProfile.uid,
          decidedByName: userProfile.fullName,
          decidedAt: serverTimestamp(),
        },
        candidateStatus: 
          pascaDecision === "lanjut" 
            ? "lolos" 
            : pascaDecision === "tidak_lanjut"
              ? "rejected"
              : "menunggu",
        finalDecisionLocked: pascaDecision === "lanjut" || pascaDecision === "tidak_lanjut",
        status: nextStage,
        updatedAt: serverTimestamp(),
        timeline: [
          ...(application.timeline || []),
          {
            type:
              pascaDecision === "lanjut" || pascaDecision === "tidak_lanjut" 
                ? "stage_changed" 
                : "status_changed",
            at: Timestamp.now(),
            by: userProfile.uid,
            meta: {
              from: application.status,
              to: nextStage,
              note:
                pascaDecision === "lanjut"
                  ? "Kandidat lolos pasca wawancara dan maju ke tahap offering."
                  : pascaDecision === "pending"
                    ? "Keputusan pasca wawancara ditunda; kandidat tetap berada di tahap wawancara."
                    : "Kandidat tidak dilanjutkan setelah wawancara (Rejected).",
            },
          },
        ],
      };

      await updateDocumentNonBlocking(appRef, updatePayload);

      // Send Notif to Candidate if Lolos
      if (pascaDecision === "lanjut") {
        const nextStageLabel = statusDisplayLabels.offered;
        const notifRef = collection(
          firestore,
          "users",
          application.candidateUid,
          "notifications",
        );
        await addDoc(notifRef, {
          userId: application.candidateUid,
          type: "stage_advanced",
          title: `Anda lolos ke tahap ${nextStageLabel}`,
          message: `Lamaran Anda untuk posisi ${application.jobPosition} telah lolos ke tahap ${nextStageLabel}.`,
          module: "recruitment",
          targetType: "application",
          targetId: application.id!,
          isRead: false,
          createdAt: Timestamp.now(),
          createdBy: userProfile.uid,
          actionUrl: `/careers/portal/applications`,
        });
      }

      toast({ title: "Keputusan Pasca-Wawancara Disimpan" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Visibility Filter
  if (!isHRD && !existingPra && !existingPasca) return null;

  const getStatusLabelPra = (status?: string) => {
    if (status === "lanjut_ke_tahap_selanjutnya") return "Lanjut Stage";
    if (status === "pending_internal") return "Pending";
    if (status === "tidak_dilanjutkan_saat_ini") return "Gugur";
    return "-";
  };

  const getStatusLabelPasca = (status?: string) => {
    if (status === "lanjut") return "Offering";
    if (status === "pending") return "Discussion";
    if (status === "tidak_lanjut") return "Gugur";
    return "-";
  };

  return (
    <Card className="shadow-2xl border-none rounded-[3rem] bg-[#020617]/50 backdrop-blur-xl overflow-hidden border-t-8 border-violet-500/20 ring-1 ring-white/5 relative">
      <div className="absolute top-0 right-0 p-32 bg-violet-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      <CardHeader className="bg-violet-500/[0.03] pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-3.5 rounded-2xl bg-indigo-600 text-white shadow-2xl shadow-indigo-500/20">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black tracking-tighter uppercase text-slate-100 flex items-center gap-3">
                Keputusan Internal
                {(existingPra || existingPasca) && (
                  <History className="h-5 w-5 text-indigo-400" />
                )}
              </CardTitle>
              <div className="flex items-center gap-4 mt-2 overflow-x-auto whitespace-nowrap pb-1 no-scrollbar">
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-800">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                    Pra:
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase",
                      existingPra?.status === "lanjut_ke_tahap_selanjutnya"
                        ? "text-emerald-400"
                        : existingPra
                          ? "text-rose-400"
                          : "text-slate-600",
                    )}
                  >
                    {getStatusLabelPra(existingPra?.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-800">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                    Pasca:
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase",
                      existingPasca?.status === "lanjut"
                        ? "text-teal-400"
                        : existingPasca
                          ? "text-rose-400"
                          : "text-slate-600",
                    )}
                  >
                    {getStatusLabelPasca(existingPasca?.status)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800"
          >
            <TabsList className="bg-transparent border-0 gap-1 h-12">
              <TabsTrigger
                value="pra"
                className="rounded-xl px-5 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all h-full"
              >
                Pra-Wawancara
              </TabsTrigger>
              <TabsTrigger
                value="pasca"
                disabled={!isPascaAvailable && !isHRD}
                className={cn(
                  "rounded-xl px-5 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-teal-600 data-[state=active]:text-white transition-all h-full",
                  !isPascaAvailable && !isHRD ? "opacity-40" : "",
                )}
              >
                {isPascaAvailable ? "Pasca-Wawancara" : "Pasca (Belum Ada)"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="p-8 md:p-12">
        <Tabs value={activeTab} className="w-full">
          <TabsContent
            value="pra"
            className="m-0 space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 focus-visible:outline-none"
          >
            <DecisionPanel
              decision={praDecision}
              onDecisionChange={setPraDecision}
              note={praNote}
              onNoteChange={setPraNote}
              isLocked={
                !isHRD ||
                isFinalDecisionLocked ||
                (existingPra?.status === "lanjut_ke_tahap_selanjutnya" &&
                  !["screening", "tes_kepribadian"].includes(
                    application.status,
                  ))
              }
              isHRD={isHRD}
              isSubmitting={isSubmitting}
              onSave={handleSavePra}
              existingData={existingPra}
              type="pra"
            />
          </TabsContent>

          <TabsContent
            value="pasca"
            className="m-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 focus-visible:outline-none"
          >
            {!isPascaAvailable ? (
              <div className="text-center py-20 bg-slate-900/40 rounded-[2.5rem] border-2 border-dashed border-slate-800">
                <AlertCircle className="h-10 w-10 mx-auto text-amber-500/40 mb-4" />
                <h4 className="text-slate-300 font-bold uppercase tracking-widest text-sm">
                  Belum Tersedia
                </h4>
                <p className="text-slate-500 text-xs mt-2 italic px-8">
                  Kandidat harus menyelesaikan tahap interview dan tim evaluator
                  harus submit penilaian terlebih dahulu.
                </p>
              </div>
            ) : (
              <DecisionPanel
                decision={pascaDecision}
                onDecisionChange={setPascaDecision}
                note={pascaNote}
                onNoteChange={setPascaNote}
                isLocked={!isHRD || isLocked}
                isHRD={isHRD}
                isSubmitting={isSubmitting}
                onSave={handleSavePasca}
                existingData={existingPasca}
                type="pasca"
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface DecisionPanelProps {
  type: "pra" | "pasca";
  decision: string;
  onDecisionChange: (v: any) => void;
  note: string;
  onNoteChange: (v: string) => void;
  isLocked: boolean;
  isHRD: boolean;
  isSubmitting: boolean;
  onSave: () => void;
  existingData: any;
}

function DecisionPanel({
  type,
  decision,
  onDecisionChange,
  note,
  onNoteChange,
  isLocked,
  isHRD,
  isSubmitting,
  onSave,
  existingData,
}: DecisionPanelProps) {
  const options =
    type === "pra"
      ? [
          {
            id: "lanjut_ke_tahap_selanjutnya" as const,
            label: "Lanjut Tahap Selanjutnya",
            color: "emerald" as const,
            icon: CalendarCheck,
            desc: "Lolos ke tahap interview",
          },
          {
            id: "pending_internal" as const,
            label: "Pending Internal",
            color: "amber" as const,
            icon: PauseCircle,
            desc: "Butuh diskusi tim",
          },
          {
            id: "tidak_dilanjutkan_saat_ini" as const,
            label: "Tidak Dilanjutkan",
            color: "rose" as const,
            icon: XCircle,
            desc: "Gugur seleksi berkas",
          },
        ]
      : [
          {
            id: "lanjut" as const,
            label: "Lanjut ke Tahap Berikutnya",
            color: "teal" as const,
            icon: CalendarCheck,
            desc: "Lolos ke tahap offering",
          },
          {
            id: "pending" as const,
            label: "Butuh Diskusi Lanjutan",
            color: "amber" as const,
            icon: PauseCircle,
            desc: "Butuh rapat internal",
          },
          {
            id: "tidak_lanjut" as const,
            label: "Tidak Dilanjutkan",
            color: "rose" as const,
            icon: XCircle,
            desc: "Gugur setelah interview",
          },
        ];

  // Tailwind Class Mappings to ensure JIT picks them up
  const colorConfigs = {
    emerald: {
      border: "border-emerald-500",
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      shadow: "shadow-emerald-500/20",
      badge: "bg-emerald-500",
      hover: "hover:border-emerald-500/30",
    },
    amber: {
      border: "border-amber-500",
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      shadow: "shadow-amber-500/20",
      badge: "bg-amber-500",
      hover: "hover:border-amber-500/30",
    },
    rose: {
      border: "border-rose-500",
      bg: "bg-rose-500/10",
      text: "text-rose-400",
      shadow: "shadow-rose-500/20",
      badge: "bg-rose-500",
      hover: "hover:border-rose-500/30",
    },
    teal: {
      border: "border-teal-500",
      bg: "bg-teal-500/10",
      text: "text-teal-400",
      shadow: "shadow-teal-500/20",
      badge: "bg-teal-500",
      hover: "hover:border-teal-500/30",
    },
  };

  const mainColor =
    type === "pra"
      ? {
          border: "border-indigo-500",
          text: "text-indigo-400",
          focus: "focus:border-indigo-500/50 focus:ring-indigo-500/10",
          btn: "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20",
        }
      : {
          border: "border-teal-500",
          text: "text-teal-400",
          focus: "focus:border-teal-500/50 focus:ring-teal-500/10",
          btn: "bg-teal-600 hover:bg-teal-500 shadow-teal-500/20",
        };

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = decision === opt.id;
          const cfg = colorConfigs[opt.color];

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => !isLocked && onDecisionChange(opt.id)}
              disabled={isLocked}
              className={cn(
                "p-6 rounded-[2rem] border-2 flex flex-col items-start gap-4 transition-all duration-300 relative overflow-hidden text-left h-full",
                isActive
                  ? `${cfg.border} ${cfg.bg} ${cfg.text} shadow-2xl ${cfg.shadow} scale-[1.02]`
                  : `border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700 hover:bg-slate-900/60`,
                isLocked && "opacity-60 cursor-not-allowed",
              )}
            >
              <div
                className={cn(
                  "p-3 rounded-xl",
                  isActive
                    ? `${cfg.badge} text-white shadow-lg`
                    : "bg-slate-800 text-slate-400",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h4
                  className={cn(
                    "text-base font-black uppercase tracking-tight leading-tight",
                    isActive && cfg.text,
                  )}
                >
                  {opt.label}
                </h4>
                <p className="text-[10px] font-medium mt-1.5 leading-relaxed opacity-70 italic">
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-end">
        <div className="space-y-4">
          <label
            className={cn(
              "text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] pl-4 border-l-4 flex items-center gap-2",
              mainColor.border,
            )}
          >
            <MessageSquareDiff className={cn("h-3 w-3", mainColor.text)} />
            Catatan Keputusan
          </label>
          <Textarea
            placeholder="Tuliskan alasan/diskusi internal..."
            className={cn(
              "min-h-[100px] rounded-[1.8rem] text-sm border-2 border-slate-800 bg-slate-900/50 text-slate-200 focus:ring-4 transition-all p-5 shadow-inner",
              mainColor.focus,
              isLocked && "opacity-70",
            )}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            disabled={isLocked}
          />
        </div>

        <div className="space-y-6">
          {type === "pasca" && isLocked && (
            <div className="rounded-[1.8rem] border border-teal-500/20 bg-teal-500/10 p-4 text-sm text-teal-100">
              <p className="font-semibold">
                Keputusan telah ditetapkan dan tidak dapat diubah.
              </p>
              <p className="mt-1 text-slate-300">
                Hasil evaluasi tetap dapat dilihat oleh tim, sementara pilihan
                keputusan dan tombol simpan dikunci.
              </p>
            </div>
          )}
          {existingData && (
            <div className="p-6 rounded-[1.8rem] bg-slate-950/60 border border-slate-800 ring-1 ring-white/5 space-y-4">
              <div className="flex items-center gap-2">
                <History className={cn("h-4 w-4", mainColor.text)} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Log Keputusan
                </span>
              </div>
              <div className="space-y-2">
                <div className="space-y-0.5">
                  <p className="text-[9px] text-slate-500 font-black uppercase">
                    Decided By
                  </p>
                  <p className="text-sm font-bold text-slate-200">
                    {existingData.decidedByName}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] text-slate-500 font-black uppercase">
                    Timestamp
                  </p>
                  <p className="text-xs font-medium text-slate-400">
                    {existingData.decidedAt &&
                    (existingData.decidedAt as any).toDate
                      ? format(
                          (existingData.decidedAt as any).toDate(),
                          "dd MMM yyyy, HH:mm",
                        )
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isHRD && !isLocked && (
            <Button
              onClick={onSave}
              disabled={isSubmitting || !decision}
              className={cn(
                "w-full h-14 rounded-[1.8rem] font-black uppercase tracking-widest text-[11px] shadow-2xl transition-all hover:scale-105 text-white border-0",
                mainColor.btn,
              )}
            >
              {isSubmitting ? (
                <Loader2 className="mr-3 h-4 w-4 animate-spin" />
              ) : null}
              {isSubmitting
                ? "MENYIMPAN..."
                : existingData
                  ? "Update Keputusan"
                  : "Simpan Keputusan"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
