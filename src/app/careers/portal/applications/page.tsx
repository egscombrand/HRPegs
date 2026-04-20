"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from "@/firebase";
import {
  collection,
  query,
  where,
  doc,
  serverTimestamp,
  writeBatch,
  deleteField,
  deleteDoc,
} from "firebase/firestore";
import type {
  Job,
  JobApplication,
  JobApplicationStatus,
  AssessmentSession,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { format, addMonths, differenceInMinutes } from "date-fns";
import { id } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Briefcase,
  Building,
  FileSignature,
  FileUp,
  ClipboardCheck,
  Users,
  Award,
  XCircle,
  BrainCircuit,
  FileText,
  Search,
  Calendar,
  Link as LinkIcon,
  FileClock,
  Loader2,
  Clock,
  Download,
  Trash2,
} from "lucide-react";
import { generateOfferingPDF } from "@/lib/recruitment/pdf-generator";
import { cn } from "@/lib/utils";
import { sendNotification } from "@/lib/notifications";
import { Separator } from "@/components/ui/separator";
import { ORDERED_RECRUITMENT_STAGES } from "@/lib/types";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";

function ApplicationCard({
  application,
  job,
  hasCompletedTest,
}: {
  application: JobApplication;
  job?: Job;
  hasCompletedTest: boolean;
}) {
  const [now, setNow] = useState(new Date());
  const [isDeciding, setIsDeciding] = React.useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Gaji tidak sesuai");
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      application.status === "offered" &&
      application.offerStatus === "sent" &&
      application.id
    ) {
      const appRef = doc(firestore, "applications", application.id);
      updateDocumentNonBlocking(appRef, {
        offerStatus: "viewed",
        offerViewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(console.error);
    }
  }, [application, firestore]);

  const handleDecision = async (
    decision: "accepted" | "rejected",
    reason?: string,
  ) => {
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login.",
      });
      return;
    }
    setIsDeciding(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);
      const payload: any = {
        offerStatus: decision,
        candidateOfferDecisionAt: serverTimestamp(),
        offerRejectionReason: reason ?? null,
        updatedAt: serverTimestamp(),
      };
      if (decision === "rejected") {
        payload.status = "rejected";
      }
      await updateDocumentNonBlocking(appRef, payload);

      const hrRecipient = application.assignedRecruiterId;
      if (hrRecipient) {
        await sendNotification(firestore, {
          userId: hrRecipient,
          type: "decision",
          module: "recruitment",
          title:
            decision === "accepted"
              ? "Kandidat telah menerima penawaran kerja."
              : "Kandidat menolak penawaran kerja.",
          message:
            decision === "accepted"
              ? "Kandidat telah menerima penawaran kerja."
              : "Kandidat menolak penawaran kerja.",
          targetType: "application",
          targetId: application.id!,
          actionUrl: `/admin/recruitment/applications/${application.id}`,
          createdBy: firebaseUser.uid,
          meta: {
            applicationId: application.id,
            candidateUid: application.candidateUid,
            candidateName: application.candidateName,
          },
        });
      }

      toast({
        title: "Keputusan Terkirim",
        description: `Anda telah berhasil ${decision === "accepted" ? "menerima" : "menolak"} penawaran ini.`,
      });
    } catch (error: any) {
      console.error("Failed to submit decision:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Keputusan",
        description: error.message,
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleDismissOffering = async () => {
    if (!firebaseUser || !application.id) return;
    
    if (!window.confirm("Apakah Anda yakin ingin menghapus tampilan penawaran ini? Tindakan ini bersifat permanen untuk tampilan Anda.")) {
      return;
    }

    setIsDeciding(true);
    try {
      const batch = writeBatch(firestore);
      
      // 1. Deactivate/Delete the offering document if possible
      if (application.activeOfferingId) {
        const offeringRef = doc(firestore, "offerings", application.activeOfferingId);
        batch.update(offeringRef, { 
          isActive: false,
          status: "withdrawn", // Or dismissed
          updatedAt: serverTimestamp()
        });
      }

      // 2. Clear all offering fields in the application document
      const appRef = doc(firestore, "applications", application.id);
      batch.update(appRef, {
        offerStatus: deleteField(),
        offeredSalary: null,
        contractStartDate: null,
        contractDurationMonths: null,
        probationDurationMonths: null,
        offerNotes: null,
        offerDescription: null,
        activeOfferingId: null,
        // Revert status to something neutral so the card doesn't show as 'offered'
        status: "interview" 
      });

      await batch.commit();
      
      toast({
        title: "Tampilan Dihapus",
        description: "Penawaran kerja telah dihapus dari tampilan Anda.",
      });
    } catch (error: any) {
      console.error("Failed to dismiss offering:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: error.message,
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const formatSalary = (value: number | undefined | null) => {
    if (value === undefined || value === null) return "-";
    return `Rp ${value.toLocaleString("id-ID")}`;
  };

  const formatSalaryInput = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return `Rp ${parseInt(digits, 10).toLocaleString("id-ID")}`;
  };

  const scheduledInterview = useMemo(() => {
    if (!application.interviews || application.interviews.length === 0)
      return null;
    const now = new Date().getTime();
    const scheduledInterviews = application.interviews.filter(
      (i) => i.status === "scheduled",
    );
    if (scheduledInterviews.length === 0) return null;

    const upcoming = scheduledInterviews
      .filter((i) => i.startAt.toDate().getTime() >= now)
      .sort(
        (a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime(),
      );

    if (upcoming.length > 0) return upcoming[0];

    const past = scheduledInterviews
      .filter((i) => i.startAt.toDate().getTime() < now)
      .sort(
        (a, b) => b.startAt.toDate().getTime() - a.startAt.toDate().getTime(),
      );

    if (past.length > 0) return past[0];

    return null;
  }, [application.interviews]);

  const isRejected = application.status === "rejected";
  const isHired =
    application.status === "hired" &&
    application.internalAccessEnabled === true;
  const isOffered = application.status === "offered";
  const isInterviewStage = application.status === "interview";
  const isAssessmentStage = application.status === "tes_kepribadian";
  const isProcessing = [
    "submitted",
    "screening",
    "verification",
    "document_submission",
  ].includes(application.status);
  const hasFinalPositive = application.candidateStatus === "lolos";
  const hasInternalEvaluation =
    !!application.postInterviewDecision ||
    !!application.recruitmentInternalDecision;

  // Status mapping for candidates
  const displayStatus = useMemo(() => {
    if (application.candidateStatus === "lolos") {
      return { text: "Lolos ke Tahap Berikutnya", color: "bg-emerald-600" };
    }
    if (isHired || isOffered) return { text: "Lolos", color: "bg-green-600" };

    const internalPra = application.recruitmentInternalDecision?.status;
    const internalPasca = application.postInterviewDecision?.status;

    if (
      internalPasca === "lanjut" ||
      internalPra === "lanjut_ke_tahap_selanjutnya"
    ) {
      return { text: "Lolos ke Tahap Berikutnya", color: "bg-emerald-600" };
    }

    // Everything else (pending, tidak_lanjut, or processing) is mapped to 'Menunggu' or 'Ditinjau'
    return {
      text: "Menunggu Hasil Evaluasi",
      color: "bg-secondary text-secondary-foreground",
    };
  }, [application, isHired, isOffered]);

  if (isOffered) {
    const salaryLabel =
      application.jobType === "internship" ? "Uang Saku" : "Gaji";
    const offerSections = application.offerSections?.length
      ? application.offerSections
      : [
          {
            title: "Detail Penawaran",
            content:
              application.offerDescription ||
              application.offerNotes ||
              "Tidak ada informasi penawaran tambahan.",
          },
        ];

    if (
      application.offerStatus === "sent" ||
      application.offerStatus === "viewed" ||
      !application.offerStatus
    ) {
      return (
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">
                  Penawaran Kerja: {application.jobPosition}
                </CardTitle>
                <CardDescription>
                  Berdasarkan hasil tahapan seleksi yang telah Anda ikuti, kami
                  menyampaikan penawaran kerja final untuk posisi ini. Mohon
                  tinjau semua detail dengan saksama sebelum mengambil
                  keputusan.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2">
                <Badge className="w-fit bg-primary/80">
                  Menunggu Keputusan Anda
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2 h-8"
                  onClick={() => {
                    if (application.finalOfferingUrl) {
                      window.open(application.finalOfferingUrl, "_blank");
                    } else {
                      const content = application.offerSections?.[0]?.content;
                      if (content) {
                        generateOfferingPDF(content, `Offering_${application.jobPosition.replace(/\s+/g, '_')}.pdf`);
                      }
                    }
                  }}
                >
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-6">
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-4 text-sm">
              <div>
                <p className="text-muted-foreground">{salaryLabel}</p>
                <p className="font-bold text-lg">
                  {formatSalary(application.offeredSalary)} / bulan
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipe Pekerjaan</p>
                <p className="font-semibold capitalize">
                  {application.jobType}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Durasi Kontrak</p>
                <p className="font-semibold">
                  {application.contractDurationMonths} bulan
                </p>
              </div>
              {application.probationDurationMonths && (
                <div>
                  <p className="text-muted-foreground">Masa Percobaan</p>
                  <p className="font-semibold">
                    {application.probationDurationMonths} bulan
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Tanggal Mulai</p>
                <p className="font-semibold">
                  {application.contractStartDate
                    ? format(
                        application.contractStartDate.toDate(),
                        "dd MMMM yyyy, HH:mm",
                        { locale: id },
                      )
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Selesai</p>
                <p className="font-semibold">
                  {application.contractEndDate
                    ? format(
                        application.contractEndDate.toDate(),
                        "dd MMMM yyyy",
                        { locale: id },
                      )
                    : "-"}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {offerSections.map((section, index) => (
                <div
                  key={index}
                  className="rounded-3xl border border-muted/70 bg-muted/50 p-5"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {section.title}
                  </p>
                  <div 
                    className="mt-3 text-sm text-slate-700 prose prose-sm max-w-none dark:text-slate-300"
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-end items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsRejectDialogOpen(true)}
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              Tolak Penawaran
            </Button>
            <Button
              onClick={() => handleDecision("accepted")}
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Terima Penawaran
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissOffering}
              disabled={isDeciding}
              className="w-full sm:w-auto text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Hapus Offering Ini
            </Button>
          </CardFooter>

          <Dialog
            open={isRejectDialogOpen}
            onOpenChange={setIsRejectDialogOpen}
          >
            <DialogContent className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tolak Penawaran</DialogTitle>
                <DialogDescription>
                  Pilih alasan penolakan yang paling sesuai. Kandidat dapat
                  memberikan catatan tambahan sebelum mengirimkan keputusan.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 p-4">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-muted/70 bg-muted/50 p-5">
                    <p className="text-sm font-semibold">Ringkasan Penawaran</p>
                    <div className="mt-4 space-y-4 text-sm text-slate-700">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          Posisi
                        </p>
                        <p className="mt-1 font-semibold">
                          {application.jobPosition}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          Gaji yang ditawarkan
                        </p>
                        <p className="mt-1 font-semibold">
                          {formatSalary(application.offeredSalary)} / bulan
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          Tipe kerja
                        </p>
                        <p className="mt-1 font-semibold capitalize">
                          {application.jobType}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-muted/70 bg-background p-5 shadow-sm">
                    <p className="text-sm font-semibold">Alasan Penolakan</p>
                    <div className="mt-4 space-y-3 text-sm">
                      {[
                        "Gaji tidak sesuai",
                        "Jenis pekerjaan atau lokasi tidak sesuai",
                        "Memilih kesempatan lain",
                        "Alasan lain",
                      ].map((option) => (
                        <label
                          key={option}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-muted/60 bg-white px-4 py-3"
                        >
                          <input
                            type="radio"
                            name="rejectReason"
                            value={option}
                            checked={rejectReason === option}
                            onChange={() => setRejectReason(option)}
                            className="mt-1 h-4 w-4"
                          />
                          <div>
                            <p className="font-semibold">{option}</p>
                            {option === "Alasan lain" ? (
                              <p className="text-xs text-muted-foreground">
                                Jelaskan alasan lain jika pilihan ini dipilih.
                              </p>
                            ) : null}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {rejectReason === "Alasan lain" ? (
                  <div>
                    <label className="text-sm font-medium text-slate-600">
                      Alasan Penolakan
                    </label>
                    <Textarea
                      value={customRejectReason}
                      onChange={(event) =>
                        setCustomRejectReason(event.target.value)
                      }
                      placeholder="Jelaskan alasan penolakan Anda"
                      rows={4}
                      className="mt-2"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Catatan tambahan (opsional)
                  </label>
                  <Textarea
                    value={rejectionNotes}
                    onChange={(event) => setRejectionNotes(event.target.value)}
                    placeholder="Tambahkan catatan singkat kepada HRD"
                    rows={4}
                    className="mt-2"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsRejectDialogOpen(false)}
                  disabled={isDeciding}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const finalReason =
                      rejectReason === "Alasan lain"
                        ? customRejectReason.trim() || rejectReason
                        : rejectReason;
                    handleDecision(
                      "rejected",
                      `${finalReason}${rejectionNotes.trim() ? `: ${rejectionNotes.trim()}` : ""}`,
                    );
                  }}
                  disabled={isDeciding}
                >
                  {isDeciding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Konfirmasi Tolak
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      );
    }



    if (application.offerStatus === "accepted") {
      return (
        <Card className="flex flex-col bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl text-blue-800 dark:text-blue-200">
                  {application.jobPosition}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 pt-1 text-blue-700 dark:text-blue-300">
                  <Building className="h-4 w-4" /> {application.brandName}
                </CardDescription>
              </div>
              <Badge className="w-fit bg-blue-600 hover:bg-blue-700">
                Penawaran Diterima
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <div className="p-4 rounded-md border-dashed border-blue-400 bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <FileClock className="h-5 w-5" /> Anda telah menyetujui
                penawaran kerja ini.
              </h3>
              <p className="text-sm">
                Silakan menunggu proses aktivasi akun dan arahan onboarding dari
                tim HRD.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="p-8 text-center border-dashed">
        <CardContent className="space-y-4 pt-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <FileClock className="text-muted-foreground h-6 w-6" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-lg">Penawaran Kerja</CardTitle>
            <CardDescription>
              Saat ini belum ada penawaran kerja aktif.
            </CardDescription>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isHired) {
    return (
      <Card className="flex flex-col bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl text-green-800 dark:text-green-200">
                {application.jobPosition}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 pt-1 text-green-700 dark:text-green-300">
                <Building className="h-4 w-4" /> {application.brandName}
              </CardDescription>
            </div>
            <Badge className="w-fit bg-green-600 hover:bg-green-700">
              Akun Diaktifkan
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-4">
          <div className="p-4 rounded-md border-dashed border-green-400 bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Award className="h-5 w-5" /> Selamat! Anda sekarang adalah bagian
              dari tim.
            </h3>
            <p className="text-sm">
              Akun Anda telah diaktifkan. Silakan logout, kemudian login kembali
              melalui Portal Karyawan untuk mengakses dasbor internal Anda.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-green-100/50 dark:bg-green-900/20 p-4 border-t border-green-200 dark:border-green-800 flex justify-end">
          <Button asChild>
            <Link href="/admin/login">
              Ke Portal Karyawan <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isAssessmentStage) {
    return (
      <Card className="flex flex-col border-yellow-500/50">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-xl">
                Langkah Selanjutnya: {application.jobPosition}
              </CardTitle>
              <CardDescription>
                Anda diundang untuk menyelesaikan tes kepribadian sebagai bagian
                dari proses seleksi.
              </CardDescription>
            </div>
            <Badge className="w-fit bg-yellow-500/80 text-yellow-900">
              Menunggu Tes
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-grow space-y-4">
          <div className="p-4 rounded-md border-dashed border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <BrainCircuit className="h-5 w-5" /> Tes Kepribadian
            </h3>
            <p className="text-sm">
              Hasil tes ini merupakan bagian penting dari proses seleksi kami.
              Silakan selesaikan tes ini untuk melanjutkan ke tahap berikutnya.
              Tes ini tidak memiliki batas waktu, namun kami sarankan untuk
              menyelesaikannya sesegera mungkin.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/50 p-4 border-t flex justify-end">
          <Button asChild>
            <Link
              href={`/careers/portal/assessment/personality?applicationId=${application.id}`}
            >
              Mulai Tes Kepribadian <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isInterviewStage) {
    if (hasInternalEvaluation) {
      return (
        <div className="p-6 rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100">
          <h3 className="font-bold text-lg flex items-center gap-3">
            <Users className="h-6 w-6" />
            Wawancara telah selesai
          </h3>
          <div className="mt-4 space-y-4 text-sm leading-relaxed">
            <p>
              Terima kasih, Anda telah menyelesaikan tahap wawancara. Saat ini
              tim rekrutmen kami sedang melakukan evaluasi lebih lanjut terhadap
              hasil wawancara Anda.
            </p>
            <p>
              Kami akan menginformasikan hasilnya melalui portal ini setelah
              proses penilaian selesai. Mohon menunggu informasi selanjutnya.
            </p>
          </div>
        </div>
      );
    }

    if (scheduledInterview) {
      const interviewStart = scheduledInterview.startAt.toDate();
      const interviewEnd = scheduledInterview.endAt.toDate();
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      const isActuallyCompleted =
        (application.postInterviewEvaluation?.submissions ?? 0) > 0 ||
        now.getTime() > interviewEnd.getTime() + twoHoursInMs;

      if (!isActuallyCompleted) {
        // Before or during interview
        const isDuring = now >= interviewStart && now < interviewEnd;

        return (
          <div
            className={cn(
              "p-6 rounded-2xl border",
              isDuring
                ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
                : "border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 shadow-sm",
            )}
          >
            <h3 className="font-bold text-lg flex items-center gap-3">
              {isDuring ? (
                <Clock className="h-6 w-6 animate-spin" />
              ) : (
                <Calendar className="h-6 w-6" />
              )}
              {isDuring
                ? "Wawancara Sedang Berlangsung"
                : "Jadwal Wawancara Tersedia"}
            </h3>
            <div className="mt-4 space-y-4 text-sm leading-relaxed">
              <p>
                {isDuring
                  ? "Tahap wawancara Anda sedang berlangsung. Silakan mengikuti sesi sesuai jadwal yang telah ditentukan."
                  : `Anda dijadwalkan untuk mengikuti tahap wawancara untuk posisi ${application.jobPosition}.`}
              </p>

              {!isDuring && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-500/60 mb-1">
                      Hari & Tanggal
                    </p>
                    <p className="font-bold">
                      {format(interviewStart, "eeee, dd MMMM yyyy", {
                        locale: id,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-500/60 mb-1">
                      Jam (WIB)
                    </p>
                    <p className="font-bold">
                      {format(interviewStart, "HH:mm")} -{" "}
                      {format(interviewEnd, "HH:mm")} (
                      {differenceInMinutes(interviewEnd, interviewStart)} mnt)
                    </p>
                  </div>
                  {scheduledInterview.meetingLink && (
                    <div className="sm:col-span-2 pt-2">
                      <p className="text-[10px] font-black uppercase text-blue-500/60 mb-2">
                        Link Wawancara
                      </p>
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <a
                          href={scheduledInterview.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <LinkIcon className="mr-2 h-4 w-4" /> Gabung Sesi
                          Wawancara
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!isDuring && (
                <p className="italic text-xs text-blue-700/70 dark:text-blue-300/60">
                  Mohon pastikan Anda hadir tepat waktu dan mempersiapkan diri
                  dengan baik.
                </p>
              )}
            </div>
          </div>
        );
      } else {
        // After interview (completed manually or by time)
        const isLolos = application.postInterviewDecision?.status === "lanjut";

        return (
          <div className="p-6 rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100">
            <h3 className="font-bold text-lg flex items-center gap-3">
              <Users className="h-6 w-6" />
              {isLolos ? "Tahap Wawancara Selesai" : "Sedang Ditinjau"}
            </h3>
            <div className="mt-4 space-y-4 text-sm leading-relaxed">
              <p>
                Terima kasih telah mengikuti wawancara. Saat ini tim kami sedang
                meninjau hasil evaluasi Anda.
              </p>
              <p>
                Kami akan memberikan informasi perkembangan selanjutnya melalui
                portal ini atau email apabila terdapat pembaruan status. Terima
                kasih atas pengertian dan antusiasme Anda.
              </p>
            </div>
          </div>
        );
      }
    } else if (job?.interviewTemplate?.defaultStartDate) {
      const template = job.interviewTemplate;
      const templateDate = template.defaultStartDate!.toDate();
      const templateTime = template.workdayStartTime || "N/A";
      const templateLink = template.meetingLink;

      return (
        <div className="p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100">
          <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800 dark:text-blue-100">
            <Calendar className="h-5 w-5" /> Jadwal Wawancara Tersedia
          </h3>
          <div className="text-sm mt-3 space-y-3 text-blue-800/90 dark:text-blue-200/90 text-justify">
            <p>
              Selamat! Anda telah lolos ke tahap wawancara. Berdasarkan jadwal
              yang telah ditentukan oleh tim HRD, wawancara Anda akan
              dilaksanakan pada:
            </p>
            <ul className="list-disc pl-5 font-semibold">
              <li>
                Tanggal:{" "}
                {format(templateDate, "eeee, dd MMMM yyyy", { locale: id })}
              </li>
              <li>Waktu: {templateTime} WIB</li>
              <li>Media: Zoom Meeting</li>
            </ul>
            <p>
              Silakan mempersiapkan diri dengan baik. Jika terdapat pembaruan
              jadwal atau link wawancara, kami akan menginformasikannya melalui
              portal ini dan email.
            </p>
            {templateLink && (
              <div className="pt-2">
                <Button asChild size="sm">
                  <a
                    href={templateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LinkIcon className="mr-2 h-4 w-4" /> Buka Link Wawancara
                    (Template)
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      // No interview scheduled yet for this 'interview' stage application
      return (
        <div className="p-4 rounded-md border border-muted-foreground/20 bg-muted/50 text-muted-foreground">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" /> Menunggu Penjadwalan Wawancara
          </h3>
          <div className="text-sm mt-3 space-y-3">
            <p>
              Selamat! Anda telah lolos ke tahap wawancara. Tim HRD kami sedang
              mengatur jadwal yang sesuai.
            </p>
            <p>
              Anda akan menerima notifikasi di portal ini dan melalui email
              setelah jadwal wawancara Anda dikonfirmasi. Mohon periksa secara
              berkala.
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div>
            <CardTitle className="text-xl">{application.jobPosition}</CardTitle>
            <CardDescription className="flex items-center gap-2 pt-1">
              <Building className="h-4 w-4" /> {application.brandName}
            </CardDescription>
          </div>
          <Badge className={cn("w-fit", displayStatus.color)}>
            {displayStatus.text}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <Separator />

        {isRejected ? (
          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <FileClock className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold text-lg">Menunggu Hasil Evaluasi</h3>
            </div>
            <div className="text-sm space-y-3 text-slate-600 dark:text-slate-400 text-justify">
              <p>
                {application.offerStatus === "rejected"
                  ? "Anda telah menolak penawaran kerja ini. Proses rekrutmen untuk posisi ini telah selesai."
                  : "Terima kasih telah berpartisipasi dalam proses seleksi. Saat ini lamaran Anda sedang dalam tahap evaluasi lanjutan oleh tim kami."}
              </p>
              {application.offerStatus !== "rejected" && (
                <>
                  <p>
                    Lamaran Anda telah kami terima dengan baik dan saat ini
                    sedang dalam proses evaluasi oleh tim rekrutmen kami. Kami
                    sedang meninjau kesesuaian profil dan hasil tahapan seleksi
                    Anda untuk menentukan proses selanjutnya.
                  </p>
                  <p>
                    Mohon menunggu informasi berikutnya yang akan kami sampaikan
                    melalui portal ini. Kami akan memberikan informasi
                    perkembangan selanjutnya melalui portal ini atau email
                    apabila terdapat pembaruan status. Terima kasih atas
                    kesabaran dan minat Anda.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : hasFinalPositive ? (
          <div className="p-4 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100">
            <h3 className="font-semibold text-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-100">
              <Check className="h-5 w-5" /> Selamat! Anda lolos ke tahap
              berikutnya
            </h3>
            <div className="text-sm mt-3 space-y-3 text-emerald-900/90 dark:text-emerald-200/90 text-justify">
              <p>
                Hasil evaluasi wawancara Anda telah dinyatakan lolos. Silakan
                tunggu informasi lanjutan mengenai tahap Offering yang akan
                segera kami kirimkan.
              </p>
              <p>
                Kami akan menghubungi Anda melalui portal ini atau email setelah
                detail penawaran siap.
              </p>
            </div>
            {isProcessing && !hasCompletedTest && (
              <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/50">
                <p className="font-bold text-blue-900 dark:text-blue-200">
                  Percepat proses Anda
                </p>
                <p className="text-xs mt-1">
                  Selesaikan tes kepribadian untuk mempercepat proses screening.
                  Hasil tes ini akan berlaku untuk semua lamaran Anda.
                </p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/careers/portal/assessment/personality">
                    Lanjut ke Tes Kepribadian{" "}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-between items-center min-h-[76px] gap-4">
        <div className="flex-1">
          {isInterviewStage && scheduledInterview ? (
            <div>
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> JADWAL WAWANCARA
              </p>
              <p className="text-sm font-semibold">
                {format(
                  scheduledInterview.startAt.toDate(),
                  "eeee, dd MMM yyyy",
                  { locale: id },
                )}
              </p>
              <p className="text-sm font-semibold">
                {format(scheduledInterview.startAt.toDate(), "HH:mm", {
                  locale: id,
                })}{" "}
                - {format(scheduledInterview.endAt.toDate(), "HH:mm")} WIB
              </p>
            </div>
          ) : application.submittedAt ? (
            <div>
              <p className="text-xs text-muted-foreground">Lamaran Dikirim:</p>
              <p className="text-sm font-semibold">
                {format(
                  application.submittedAt.toDate(),
                  "dd MMM yyyy, HH:mm",
                  { locale: id },
                )}{" "}
                WIB
              </p>
            </div>
          ) : (
            <div></div> // Placeholder for alignment
          )}
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto">
          {isInterviewStage && scheduledInterview && (
            <Button asChild size="sm" className="w-full">
              <a
                href={scheduledInterview.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon className="mr-2 h-4 w-4" /> Buka Link Wawancara
              </a>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function ApplicationsPageSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full" />
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-32" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export default function ApplicationsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const uid = userProfile?.uid;

  const applicationsQuery = useMemoFirebase(() => {
    if (!uid) return null;
    return query(
      collection(firestore, "applications"),
      where("candidateUid", "==", uid),
    );
  }, [uid, firestore]);

  const {
    data: applications,
    isLoading: applicationsLoading,
    error,
  } = useCollection<JobApplication>(applicationsQuery);

  const jobIds = useMemo(() => {
    if (!applications) return [];
    return Array.from(new Set(applications.map((app) => app.jobId)));
  }, [applications]);

  const { data: jobs, isLoading: jobsLoading } = useCollection<Job>(
    useMemoFirebase(() => {
      if (jobIds.length === 0) return null;
      // Chunking would be needed for > 30 job applications to different jobs
      return query(
        collection(firestore, "jobs"),
        where("__name__", "in", jobIds.slice(0, 30)),
      );
    }, [firestore, jobIds]),
  );

  const jobMap = useMemo(() => {
    if (!jobs) return new Map<string, Job>();
    return new Map(jobs.map((job) => [job.id!, job]));
  }, [jobs]);

  const sessionsQuery = useMemoFirebase(() => {
    if (!uid) return null;
    return query(
      collection(firestore, "assessment_sessions"),
      where("candidateUid", "==", uid),
      where("status", "==", "submitted"),
    );
  }, [uid, firestore]);
  const { data: submittedSessions, isLoading: sessionsLoading } =
    useCollection<AssessmentSession>(sessionsQuery);

  const hasCompletedTest = useMemo(
    () => (submittedSessions?.length ?? 0) > 0,
    [submittedSessions],
  );

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [applications]);

  const isLoading =
    authLoading || applicationsLoading || sessionsLoading || jobsLoading;

  if (error) {
    return (
      <div className="p-4 border-2 border-dashed border-destructive/50 rounded-lg bg-red-50 text-destructive-foreground">
        <h3 className="font-bold text-lg mb-2 text-destructive">
          Terjadi Kesalahan
        </h3>
        <p>Gagal memuat data lamaran Anda. Silakan coba lagi nanti.</p>
        <pre className="mt-4 text-xs bg-white p-2 rounded overflow-auto text-destructive">
          {error.message}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lamaran Saya</h1>
        <p className="text-muted-foreground">
          Riwayat dan status lamaran pekerjaan yang telah Anda kirimkan atau
          simpan sebagai draf.
        </p>
      </div>

      {isLoading ? (
        <ApplicationsPageSkeleton />
      ) : sortedApplications && sortedApplications.length > 0 ? (
        <div className="space-y-6">
          {sortedApplications.map((app) => {
            const job = jobMap.get(app.jobId);
            return (
              <ApplicationCard
                key={app.id}
                application={app}
                job={job}
                hasCompletedTest={hasCompletedTest}
              />
            );
          })}
        </div>
      ) : (
        <Card className="h-64 flex flex-col items-center justify-center text-center">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="mt-4">Anda Belum Pernah Melamar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Semua lamaran Anda akan muncul di sini.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/careers/portal/jobs">Cari Lowongan Sekarang</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
