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
  useDoc,
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
} from "firebase/firestore";
import type {
  JobApplication,
  JobApplicationStatus,
  AssessmentSession,
  Offering,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { format, addMonths } from "date-fns";
import { id } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ORDERED_RECRUITMENT_STAGES } from "@/lib/types";
import { statusDisplayLabels } from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";

function ApplicationCard({
  application,
  hasCompletedTest,
}: {
  application: JobApplication;
  hasCompletedTest: boolean;
}) {
  const [now, setNow] = useState(new Date());
  const [isDeciding, setIsDeciding] = React.useState(false);
  const [isNegotiationOpen, setIsNegotiationOpen] = useState(false);
  const [selectedNegotiationAreas, setSelectedNegotiationAreas] = useState<
    string[]
  >([]);
  const [requestedStartDate, setRequestedStartDate] = useState("");
  const [requestedLocation, setRequestedLocation] = useState("");
  const [requestedWorkModel, setRequestedWorkModel] = useState("");
  const [requestedWorkDays, setRequestedWorkDays] = useState("");
  const [requestedWorkTime, setRequestedWorkTime] = useState("");
  const [requestedEntryLocation, setRequestedEntryLocation] = useState("");
  const [requestedContractDuration, setRequestedContractDuration] =
    useState("");
  const [requestedBenefitNotes, setRequestedBenefitNotes] = useState("");
  const [requestedScopeNotes, setRequestedScopeNotes] = useState("");
  const [requestedOtherNotes, setRequestedOtherNotes] = useState("");
  const [negotiationReason, setNegotiationReason] = useState("");
  const [isSubmittingNegotiation, setIsSubmittingNegotiation] = useState(false);
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const negotiationAreas = [
    { key: "startDate", label: "Tanggal Mulai Kerja" },
    { key: "location", label: "Lokasi Kerja" },
    { key: "workModel", label: "Sistem Kerja" },
    { key: "contractDuration", label: "Durasi Kontrak" },
    { key: "benefitNotes", label: "Benefit / Fasilitas" },
    { key: "scopeNotes", label: "Ruang Lingkup Peran" },
    { key: "otherNotes", label: "Lainnya" },
  ];

  const activeOfferingId =
    application.activeOfferingId ?? application.currentOfferingId;
  const activeOfferingDocRef = useMemoFirebase(() => {
    if (!activeOfferingId) return null;
    return doc(firestore, "offerings", activeOfferingId);
  }, [activeOfferingId, firestore]);

  const { data: activeOffering, isLoading: activeOfferingLoading } =
    useDoc<Offering>(activeOfferingDocRef);

  const offerDetails = activeOffering?.offeringDetails || {};
  const offerSalaryLabel =
    application.jobType === "internship" ? "Uang Saku" : "Gaji";
  const offerSalary = offerDetails.salary || "-";
  const offerStartDate = offerDetails.startDate
    ? new Date(offerDetails.startDate)
    : null;
  const offerContractDuration = offerDetails.contractDurationMonths || "-";
  const offerFirstDayTime = offerDetails.firstDayTime || "-";
  const offerFirstDayLocation = offerDetails.firstDayLocation || "-";
  const offerHrContact = offerDetails.hrContact || "-";
  const offerAdditionalNotes = activeOffering?.additionalNotes || "";
  const activeOfferIsAvailable = !!activeOfferingId && activeOffering?.isActive;
  const offerDocumentUrl = activeOffering?.documentUrl;
  const offerDocumentName =
    activeOffering?.documentName ||
    `Offering_${application.jobPosition.replace(/\s+/g, "_")}.pdf`;
  const offerContractEndDate =
    offerStartDate && offerDetails.contractDurationMonths
      ? addMonths(
          offerStartDate,
          parseInt(offerDetails.contractDurationMonths, 10),
        )
      : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleDecision = async (decision: "accepted" | "rejected") => {
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
        updatedAt: serverTimestamp(),
      };
      if (decision === "rejected") {
        payload.status = "rejected";
      }
      await updateDocumentNonBlocking(appRef, payload);
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

  const canRequestNegotiation =
    ["sent", "viewed"].includes(application.offerStatus ?? "") &&
    !application.candidateNegotiationUsed;

  const resetNegotiationForm = () => {
    setSelectedNegotiationAreas([]);
    setRequestedStartDate("");
    setRequestedLocation("");
    setRequestedWorkModel("");
    setRequestedWorkDays("");
    setRequestedWorkTime("");
    setRequestedEntryLocation("");
    setRequestedContractDuration("");
    setRequestedBenefitNotes("");
    setRequestedScopeNotes("");
    setRequestedOtherNotes("");
    setNegotiationReason("");
  };

  const handleNegotiationSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda harus login.",
      });
      return;
    }

    if (selectedNegotiationAreas.length === 0) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Negosiasi",
        description: "Pilih area yang ingin Anda ajukan untuk dibahas.",
      });
      return;
    }

    if (!negotiationReason.trim()) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Negosiasi",
        description: "Alasan negosiasi harus diisi.",
      });
      return;
    }

    const payloadCounter: any = {
      requestedAreas: selectedNegotiationAreas,
      requestedStartDate: null,
      requestedWorkModel: null,
      requestedLocation: null,
      requestedContractDurationMonths: null,
      requestedBenefitNotes: null,
      requestedScopeNotes: null,
      requestedOtherNotes: null,
      reason: negotiationReason.trim(),
      submittedAt: serverTimestamp(),
    };

    if (selectedNegotiationAreas.includes("startDate")) {
      if (!requestedStartDate) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Tanggal mulai yang diharapkan harus diisi.",
        });
        return;
      }
      payloadCounter.requestedStartDate = requestedStartDate;
    }

    if (selectedNegotiationAreas.includes("location")) {
      if (!requestedLocation.trim()) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Lokasi kerja yang diharapkan harus diisi.",
        });
        return;
      }
      payloadCounter.requestedLocation = requestedLocation.trim();
    }

    if (selectedNegotiationAreas.includes("workModel")) {
      if (!requestedWorkModel.trim()) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Sistem kerja yang diharapkan harus dipilih.",
        });
        return;
      }

      payloadCounter.requestedWorkModel = [
        requestedWorkModel.trim(),
        requestedWorkDays.trim()
          ? `Hari kerja: ${requestedWorkDays.trim()}`
          : null,
        requestedWorkTime.trim()
          ? `Jam kerja: ${requestedWorkTime.trim()}`
          : null,
        requestedEntryLocation.trim()
          ? `Lokasi masuk: ${requestedEntryLocation.trim()}`
          : null,
      ]
        .filter(Boolean)
        .join(" • ");
    }

    if (selectedNegotiationAreas.includes("contractDuration")) {
      const duration = parseInt(requestedContractDuration, 10);
      if (isNaN(duration) || duration <= 0) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Masukkan durasi kontrak yang valid.",
        });
        return;
      }
      payloadCounter.requestedContractDurationMonths = duration;
    }

    if (selectedNegotiationAreas.includes("benefitNotes")) {
      if (!requestedBenefitNotes.trim()) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Harap jelaskan benefit atau fasilitas yang Anda minta.",
        });
        return;
      }
      payloadCounter.requestedBenefitNotes = requestedBenefitNotes.trim();
    }

    if (selectedNegotiationAreas.includes("scopeNotes")) {
      if (!requestedScopeNotes.trim()) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Harap jelaskan ruang lingkup peran yang Anda harapkan.",
        });
        return;
      }
      payloadCounter.requestedScopeNotes = requestedScopeNotes.trim();
    }

    if (selectedNegotiationAreas.includes("otherNotes")) {
      if (!requestedOtherNotes.trim()) {
        toast({
          variant: "destructive",
          title: "Gagal Mengirim Negosiasi",
          description: "Harap jelaskan area lain yang ingin Anda bahas.",
        });
        return;
      }
      payloadCounter.requestedOtherNotes = requestedOtherNotes.trim();
    }

    setIsSubmittingNegotiation(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);
      const payload: any = {
        offerStatus: "negotiation_requested",
        candidateNegotiationUsed: true,
        candidateCounterOffer: payloadCounter,
        updatedAt: serverTimestamp(),
      };
      await updateDocumentNonBlocking(appRef, payload);
      toast({
        title: "Permintaan Negosiasi Dikirim",
        description: "Tim HRD akan meninjau usulan Anda dan merespons segera.",
      });
      setIsNegotiationOpen(false);
      resetNegotiationForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Negosiasi",
        description: error.message,
      });
    } finally {
      setIsSubmittingNegotiation(false);
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

  const isHired =
    application.status === "hired" &&
    application.internalAccessEnabled === true;
  const isOffered = application.status === "offered";
  const isInterviewStage = application.status === "interview";
  const offerHasBeenPresented = [
    "sent",
    "negotiation_requested",
    "negotiation_approved",
    "negotiation_countered",
    "accepted",
    "rejected",
  ].includes(application.offerStatus ?? "");
  const isProcessing = [
    "submitted",
    "screening",
    "verification",
    "document_submission",
    "tes_kepribadian",
    "rejected",
  ].includes(application.status);

  const currentStageLabel =
    statusDisplayLabels[application.status] ?? "Sedang dalam proses";

  const interviewWindowEnd = scheduledInterview
    ? new Date(
        scheduledInterview.startAt.toDate().getTime() + 2 * 60 * 60 * 1000,
      )
    : null;
  const isInterviewUpcoming = scheduledInterview
    ? now < scheduledInterview.startAt.toDate().getTime()
    : false;
  const isInterviewInProgress = scheduledInterview
    ? now >= scheduledInterview.startAt.toDate().getTime() &&
      now < interviewWindowEnd!.getTime()
    : false;
  const showInterviewCard =
    isInterviewStage &&
    (!scheduledInterview || isInterviewUpcoming || isInterviewInProgress);

  if (isOffered) {
    const salaryLabel =
      application.jobType === "internship" ? "Uang Saku" : "Gaji";
    if (!offerHasBeenPresented) {
      return (
        <Card className="flex flex-col border-slate-300/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">
                  Lolos ke Tahap Offering
                </CardTitle>
                <CardDescription>
                  Selamat, Anda telah lolos ke tahap offering. Saat ini tim HRD
                  kami sedang menyiapkan detail penawaran kerja untuk Anda.
                  Apabila diperlukan, proses ini dapat mencakup penyesuaian atau
                  pembahasan lebih lanjut sebelum penawaran resmi dikirimkan.
                </CardDescription>
              </div>
              <Badge className="w-fit bg-slate-700 text-white">
                Lolos ke Tahap Offering
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-muted/70 bg-muted/50 p-4 text-sm">
              <p>
                Tim HRD kami sedang menyiapkan penawaran kerja resmi untuk Anda.
                Mohon menunggu informasi berikutnya melalui portal ini atau
                email.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (["sent", "viewed"].includes(application.offerStatus ?? "")) {
      if (!activeOfferIsAvailable) {
        return (
          <Card className="flex flex-col border-primary/50">
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                <div>
                  <CardTitle className="text-xl">
                    Penawaran Kerja Telah Dikirim
                  </CardTitle>
                  <CardDescription>
                    Penawaran kerja telah dikirim, tetapi detail penawaran aktif
                    belum tersedia. Silakan tunggu HRD mempublikasikan offering
                    aktif.
                  </CardDescription>
                </div>
                <Badge className="w-fit bg-primary/80">
                  Penawaran Kerja Telah Dikirim
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Separator />
              <div className="rounded-lg border border-muted/70 bg-muted/50 p-4 text-sm">
                <p>
                  Detail penawaran tidak dapat ditampilkan saat ini karena
                  offering aktif belum ditemukan atau belum diaktifkan.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      }

      return (
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">
                  Penawaran Kerja Telah Dikirim
                </CardTitle>
                <CardDescription>
                  Penawaran kerja untuk posisi yang Anda lamar telah kami
                  kirimkan. Silakan tinjau detail penawaran yang tersedia pada
                  halaman ini dan berikan respon Anda sesuai pilihan yang
                  tersedia.
                </CardDescription>
              </div>
              <Badge className="w-fit bg-primary/80">
                Penawaran Kerja Telah Dikirim
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-4 text-sm">
              <div>
                <p className="text-muted-foreground">{salaryLabel}</p>
                <p className="font-bold text-lg">{offerSalary} / bulan</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipe Pekerjaan</p>
                <p className="font-semibold capitalize">
                  {application.jobType}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Durasi Kontrak</p>
                <p className="font-semibold">{offerContractDuration} bulan</p>
              </div>
              {offerFirstDayTime && (
                <div>
                  <p className="text-muted-foreground">Jam Hari Pertama</p>
                  <p className="font-semibold">{offerFirstDayTime}</p>
                </div>
              )}
              {offerFirstDayLocation && (
                <div>
                  <p className="text-muted-foreground">Lokasi Hari Pertama</p>
                  <p className="font-semibold">{offerFirstDayLocation}</p>
                </div>
              )}
              {offerHrContact && (
                <div>
                  <p className="text-muted-foreground">Kontak HRD</p>
                  <p className="font-semibold">{offerHrContact}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Tanggal Mulai</p>
                <p className="font-semibold">
                  {offerStartDate
                    ? format(offerStartDate, "dd MMMM yyyy, HH:mm", {
                        locale: id,
                      })
                    : "-"}
                </p>
              </div>
              {offerContractEndDate ? (
                <div>
                  <p className="text-muted-foreground">Tanggal Selesai</p>
                  <p className="font-semibold">
                    {format(offerContractEndDate, "dd MMMM yyyy", {
                      locale: id,
                    })}
                  </p>
                </div>
              ) : null}
            </div>
            {offerAdditionalNotes && (
              <div className="rounded-md border border-muted/80 bg-muted/50 p-4 text-sm">
                <p className="font-semibold">Rangkuman Penawaran</p>
                <p className="mt-2 text-muted-foreground">
                  {offerAdditionalNotes}
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-end items-center gap-2">
            {offerDocumentUrl ? (
              <Button
                variant="outline"
                onClick={() => window.open(offerDocumentUrl, "_blank")}
                className="w-full sm:w-auto"
              >
                <Download className="mr-2 h-4 w-4" /> Lihat Dokumen PDF
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => handleDecision("rejected")}
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              Tolak Penawaran
            </Button>
            {canRequestNegotiation ? (
              <Button
                onClick={() => setIsNegotiationOpen(true)}
                variant="outline"
                disabled={isDeciding}
                className="w-full sm:w-auto"
              >
                Ajukan Negosiasi
              </Button>
            ) : (
              <div className="rounded-lg border border-muted/70 bg-muted/50 px-4 py-3 text-sm text-muted-foreground w-full sm:w-auto text-center">
                {application.candidateNegotiationUsed
                  ? "Anda telah mengajukan negosiasi. Mohon tunggu respons HRD."
                  : "Negosiasi hanya dapat dilakukan satu kali selama penawaran masih dalam tahap awal."}
              </div>
            )}
            <Button
              onClick={() => handleDecision("accepted")}
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Setujui & Lanjutkan
            </Button>
          </CardFooter>

          <Dialog
            open={isNegotiationOpen}
            onOpenChange={(open) => {
              if (!open) resetNegotiationForm();
              setIsNegotiationOpen(open);
            }}
          >
            <DialogContent className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>Ajukan Negosiasi Penawaran</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-400">
                  Ajukan pembahasan area penawaran yang ingin diselaraskan.
                  Diskusi ini fokus pada detail kerja, bukan perubahan gaji.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={handleNegotiationSubmit}
                className="space-y-6 px-6 pb-6 pt-4"
              >
                <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
                    <p className="text-sm font-semibold text-slate-100">
                      Pilih area pembahasan
                    </p>
                    <div className="mt-4 space-y-3">
                      {negotiationAreas.map((area) => (
                        <label
                          key={area.key}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-slate-950/70 px-3 py-3 text-sm transition hover:border-slate-700"
                        >
                          <Checkbox
                            checked={selectedNegotiationAreas.includes(
                              area.key,
                            )}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedNegotiationAreas((current) => [
                                  ...current,
                                  area.key,
                                ]);
                                return;
                              }
                              setSelectedNegotiationAreas((current) =>
                                current.filter((item) => item !== area.key),
                              );
                            }}
                          />
                          <span>{area.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5 shadow-lg shadow-slate-950/30">
                    <p className="text-sm font-semibold text-slate-100">
                      Rincian usulan
                    </p>
                    <div className="mt-4 space-y-4 text-sm text-slate-300">
                      {selectedNegotiationAreas.includes("startDate") && (
                        <div>
                          <label className="text-sm font-medium text-slate-900">
                            Tanggal mulai yang diinginkan
                          </label>
                          <Input
                            type="date"
                            value={requestedStartDate}
                            onChange={(event) =>
                              setRequestedStartDate(event.target.value)
                            }
                            className="mt-2"
                          />
                        </div>
                      )}
                      {selectedNegotiationAreas.includes("location") && (
                        <div>
                          <label className="text-sm font-medium text-slate-900">
                            Lokasi kerja yang Anda harapkan
                          </label>
                          <Input
                            value={requestedLocation}
                            onChange={(event) =>
                              setRequestedLocation(event.target.value)
                            }
                            placeholder="Misal: Remote, Jakarta, atau Surabaya"
                            className="mt-2"
                          />
                        </div>
                      )}
                      {selectedNegotiationAreas.includes("workModel") && (
                        <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">
                              Sistem kerja yang diharapkan
                            </p>
                            <p className="text-sm text-slate-400 mt-1">
                              Pilih model kerja dan jelaskan hari kerja, jam
                              kerja, serta lokasi masuk jika perlu.
                            </p>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-sm font-medium text-slate-100">
                                Model kerja
                              </label>
                              <Select
                                value={requestedWorkModel}
                                onValueChange={setRequestedWorkModel}
                              >
                                <SelectTrigger className="mt-2 bg-slate-950 border-slate-800 text-slate-100">
                                  <SelectValue placeholder="Pilih sistem kerja" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Remote">Remote</SelectItem>
                                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                                  <SelectItem value="On-site">
                                    On-site
                                  </SelectItem>
                                  <SelectItem value="Fleksibel">
                                    Fleksibel
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="text-sm font-medium text-slate-100">
                                  Hari kerja
                                </label>
                                <Input
                                  placeholder="Contoh: Senin - Jumat"
                                  value={requestedWorkDays}
                                  onChange={(event) =>
                                    setRequestedWorkDays(event.target.value)
                                  }
                                  className="mt-2 bg-slate-950 border-slate-800 text-slate-100"
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-slate-100">
                                  Jam kerja
                                </label>
                                <Input
                                  placeholder="Contoh: 09:00 - 18:00"
                                  value={requestedWorkTime}
                                  onChange={(event) =>
                                    setRequestedWorkTime(event.target.value)
                                  }
                                  className="mt-2 bg-slate-950 border-slate-800 text-slate-100"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-slate-100">
                                Lokasi masuk / penempatan
                              </label>
                              <Input
                                placeholder="Contoh: Kantor pusat / remote sepenuhnya"
                                value={requestedEntryLocation}
                                onChange={(event) =>
                                  setRequestedEntryLocation(event.target.value)
                                }
                                className="mt-2 bg-slate-950 border-slate-800 text-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedNegotiationAreas.includes(
                        "contractDuration",
                      ) && (
                        <div>
                          <label className="text-sm font-medium text-slate-900">
                            Durasi kontrak yang Anda inginkan (bulan)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            value={requestedContractDuration}
                            onChange={(event) =>
                              setRequestedContractDuration(event.target.value)
                            }
                            placeholder="Contoh: 12"
                            className="mt-2"
                          />
                        </div>
                      )}
                      {selectedNegotiationAreas.includes("benefitNotes") && (
                        <div>
                          <label className="text-sm font-medium text-slate-900">
                            Benefit / fasilitas yang diharapkan
                          </label>
                          <Textarea
                            value={requestedBenefitNotes}
                            onChange={(event) =>
                              setRequestedBenefitNotes(event.target.value)
                            }
                            placeholder="Jelaskan benefit atau fasilitas yang penting bagi Anda"
                            className="mt-2"
                            rows={4}
                          />
                        </div>
                      )}
                      {selectedNegotiationAreas.includes("scopeNotes") && (
                        <div>
                          <label className="text-sm font-medium text-slate-900">
                            Ruang lingkup peran yang diusulkan
                          </label>
                          <Textarea
                            value={requestedScopeNotes}
                            onChange={(event) =>
                              setRequestedScopeNotes(event.target.value)
                            }
                            placeholder="Tuliskan penyesuaian ruang lingkup yang Anda harapkan"
                            className="mt-2"
                            rows={4}
                          />
                        </div>
                      )}
                      {selectedNegotiationAreas.includes("otherNotes") && (
                        <div>
                          <label className="text-sm font-medium text-slate-900">
                            Area lain yang ingin dibahas
                          </label>
                          <Textarea
                            value={requestedOtherNotes}
                            onChange={(event) =>
                              setRequestedOtherNotes(event.target.value)
                            }
                            placeholder="Sebutkan hal lain yang ingin Anda diskusikan"
                            className="mt-2"
                            rows={4}
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium text-slate-900">
                          Catatan profesional untuk HRD
                        </label>
                        <Textarea
                          value={negotiationReason}
                          onChange={(event) =>
                            setNegotiationReason(event.target.value)
                          }
                          placeholder="Jelaskan dengan singkat dan profesional mengapa area ini penting bagi Anda"
                          className="mt-2"
                          rows={5}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 text-sm text-slate-300">
                  Negosiasi adalah tahap diskusi profesional. Harap fokus pada
                  penyesuaian yang jelas agar HRD dapat merespons dengan cepat.
                </div>

                <DialogFooter className="gap-3">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setIsNegotiationOpen(false)}
                    disabled={isSubmittingNegotiation}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmittingNegotiation}>
                    {isSubmittingNegotiation ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Kirim Negosiasi
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </Card>
      );
    }

    if (application.offerStatus === "negotiation_requested") {
      if (!activeOfferIsAvailable) {
        return renderMissingOfferDetails();
      }
      const counter = application.candidateCounterOffer;
      return (
        <Card className="flex flex-col border-amber-500/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">Negosiasi Dikirim</CardTitle>
                <CardDescription>
                  Pengajuan negosiasi Anda telah dikirim dan sedang ditinjau
                  oleh tim HRD.
                </CardDescription>
              </div>
              <Badge className="w-fit bg-amber-600 hover:bg-amber-700 text-white">
                Negosiasi Dikirim
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              <p className="font-semibold">Status Review</p>
              <p className="mt-2 text-muted-foreground">
                Pengajuan negosiasi Anda telah dikirim dan sedang ditinjau oleh
                tim HRD.
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                Setelah pengajuan dikirim, Anda tidak dapat mengubah atau
                mengajukan ulang.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 text-sm">
              <div className="rounded-3xl border border-muted/70 bg-muted/50 p-5">
                <p className="font-semibold">Penawaran Awal HRD</p>
                <div className="mt-4 space-y-3 text-muted-foreground">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Gaji</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {offerSalary} / bulan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Posisi</p>
                    <p className="mt-1 font-semibold capitalize">
                      {application.jobPosition}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-muted/70 bg-background p-5 shadow-sm">
                <p className="font-semibold">Permintaan Anda</p>
                <div className="mt-4 space-y-3 text-muted-foreground">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">
                      Gaji yang diminta
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatSalary(counter?.requestedSalary)} / bulan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">
                      Selisih nominal
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {counter?.requestedSalary != null
                        ? `Rp ${(
                            counter.requestedSalary -
                            parseInt(offerDetails.salary || "0", 10)
                          ).toLocaleString("id-ID")}`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">
                      Catatan Anda
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {counter?.reason || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (application.offerStatus === "offered_final") {
      if (!activeOfferIsAvailable) {
        return renderMissingOfferDetails();
      }
      const hrdResponse = application.candidateNegotiationResponse;
      return (
        <Card className="flex flex-col border-blue-500/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">
                  Penawaran Final Tersedia
                </CardTitle>
                <CardDescription>
                  HRD telah menyiapkan revisi final penawaran berdasarkan
                  diskusi. Silakan tinjau kembali detail dan berikan persetujuan
                  akhir.
                </CardDescription>
              </div>
              <Badge className="w-fit bg-blue-600 text-white">
                Penawaran Final Tersedia
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hrdResponse?.note ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
                <p className="font-semibold">Catatan HRD</p>
                <p className="mt-2 text-muted-foreground">{hrdResponse.note}</p>
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2 text-sm">
              <div className="rounded-3xl border border-muted/70 bg-muted/50 p-5">
                <p className="font-semibold">Penawaran Saat Ini</p>
                <div className="mt-4 space-y-3 text-muted-foreground">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Gaji</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {offerSalary} / bulan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Posisi</p>
                    <p className="mt-1 font-semibold capitalize">
                      {application.jobPosition}
                    </p>
                  </div>
                </div>
              </div>
              {application.candidateCounterOffer ? (
                <div className="rounded-3xl border border-muted/70 bg-background p-5 shadow-sm">
                  <p className="font-semibold">Usulan Negosiasi Anda</p>
                  <div className="mt-4 space-y-3 text-muted-foreground">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em]">
                        Area yang diminta
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {(
                          application.candidateCounterOffer.requestedAreas || []
                        )
                          .map((area) =>
                            area
                              .replace(/([A-Z])/g, " $1")
                              .replace(/Notes$/, "")
                              .trim(),
                          )
                          .join(", ")}
                      </p>
                    </div>
                    {application.candidateCounterOffer.requestedSalary !=
                      null && (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Gaji yang diminta
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {formatSalary(
                            application.candidateCounterOffer.requestedSalary,
                          )}{" "}
                          / bulan
                        </p>
                      </div>
                    )}
                    {application.candidateCounterOffer.requestedStartDate && (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Tanggal mulai yang diusulkan
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {application.candidateCounterOffer.requestedStartDate}
                        </p>
                      </div>
                    )}
                    {application.candidateCounterOffer.requestedLocation && (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Lokasi yang diusulkan
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {application.candidateCounterOffer.requestedLocation}
                        </p>
                      </div>
                    )}
                    {application.candidateCounterOffer.requestedWorkModel && (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Sistem kerja yang diusulkan
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {application.candidateCounterOffer.requestedWorkModel}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-end items-center gap-2">
            <Button
              onClick={() => handleDecision("rejected")}
              variant="outline"
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tolak Penawaran Final
            </Button>
            <Button
              onClick={() => handleDecision("accepted")}
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Setujui & Lanjutkan
            </Button>
          </CardFooter>
        </Card>
      );
    }

    if (
      application.offerStatus === "negotiation_approved" ||
      application.offerStatus === "negotiation_countered" ||
      application.offerStatus === "negotiation_rejected"
    ) {
      if (!activeOfferIsAvailable) {
        return renderMissingOfferDetails();
      }
      const counter = application.candidateCounterOffer;
      const isCountered = application.offerStatus === "negotiation_countered";
      const isApproved = application.offerStatus === "negotiation_approved";
      const isRejected = application.offerStatus === "negotiation_rejected";
      const title = isApproved
        ? "Negosiasi Disetujui"
        : isCountered
          ? "HRD Mengajukan Penawaran Final"
          : "Negosiasi Ditolak HRD";
      const description = isApproved
        ? "HRD menyetujui usulan Anda. Silakan terima atau tolak penawaran final."
        : isCountered
          ? "HRD mengajukan penawaran akhir. Silakan tinjau dan pilih terima atau tolak final."
          : "HRD menolak usulan negosiasi. Anda dapat menerima atau menolak penawaran saat ini.";
      return (
        <Card className="flex flex-col border-slate-300/80">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-xl">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
              <Badge className="w-fit bg-slate-700 text-white">
                {application.offerStatus.replaceAll("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2 text-sm">
              <div className="rounded-3xl border border-muted/70 bg-muted/50 p-5">
                <p className="font-semibold">Penawaran Akhir</p>
                <div className="mt-4 space-y-3 text-muted-foreground">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Gaji</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {offerSalary} / bulan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Posisi</p>
                    <p className="mt-1 font-semibold capitalize">
                      {application.jobPosition}
                    </p>
                  </div>
                </div>
              </div>
              {counter ? (
                <div className="rounded-3xl border border-muted/70 bg-background p-5 shadow-sm">
                  <p className="font-semibold">Usulan Anda</p>
                  <div className="mt-4 space-y-3 text-muted-foreground">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em]">
                        Gaji yang diminta
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {formatSalary(counter.requestedSalary)} / bulan
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em]">
                        Catatan Anda
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {counter.reason || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 border-t flex flex-col sm:flex-row justify-end items-center gap-2">
            <Button
              onClick={() => handleDecision("rejected")}
              variant="outline"
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              {isDeciding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tolak Final
            </Button>
            <Button
              onClick={() => handleDecision("accepted")}
              disabled={isDeciding}
              className="w-full sm:w-auto"
            >
              Terima Penawaran
            </Button>
          </CardFooter>
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

  if (showInterviewCard) {
    if (scheduledInterview) {
      const interviewStart = scheduledInterview.startAt.toDate();
      const interviewEnd = interviewWindowEnd!;
      const interviewMedia = scheduledInterview.meetingLink
        ? "Zoom / Online"
        : application.jobLocation || application.location || "Offline";
      const interviewDetail = scheduledInterview.meetingLink
        ? scheduledInterview.meetingLink
        : application.location || "Detail lokasi akan diinformasikan";

      if (now < interviewStart) {
        return (
          <div className="p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100">
            <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800 dark:text-blue-100">
              <Calendar className="h-5 w-5" /> Lolos ke Tahap Wawancara
            </h3>
            <div className="text-sm mt-3 space-y-3 text-blue-800/90 dark:text-blue-200/90">
              <p>
                Selamat, Anda telah lolos ke tahap wawancara untuk posisi yang
                Anda lamar.
              </p>
              <div className="rounded-lg border border-muted/70 bg-muted/50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Hari/Tanggal
                </p>
                <p className="font-semibold">
                  {format(interviewStart, "eeee, dd MMMM yyyy", { locale: id })}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-3">
                  Waktu
                </p>
                <p className="font-semibold">
                  {format(interviewStart, "HH:mm", { locale: id })} WIB
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-3">
                  Media
                </p>
                <p className="font-semibold">{interviewMedia}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-3">
                  Link/Detail
                </p>
                <p className="font-semibold break-words">{interviewDetail}</p>
              </div>
              <p>
                Mohon hadir tepat waktu dan mempersiapkan diri sebaik mungkin.
                Jika terdapat perubahan jadwal, kami akan menginformasikannya
                melalui portal ini dan email.
              </p>
            </div>
            {scheduledInterview.meetingLink ? (
              <div className="mt-4">
                <Button asChild size="sm">
                  <a
                    href={scheduledInterview.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LinkIcon className="mr-2 h-4 w-4" /> Buka Link Wawancara
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        );
      }

      if (now >= interviewStart && now < interviewEnd.getTime()) {
        return (
          <div className="p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100">
            <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800 dark:text-blue-100">
              <Clock className="h-5 w-5 animate-spin" /> Lolos ke Tahap
              Wawancara
            </h3>
            <div className="text-sm mt-3 space-y-3 text-blue-800/90 dark:text-blue-200/90">
              <p>
                Wawancara Anda sedang berlangsung untuk posisi{" "}
                <strong>{application.jobPosition}</strong>.
              </p>
              <p>
                Mohon tetap fokus dan ikuti sesi sesuai jadwal yang telah
                ditentukan.
              </p>
            </div>
          </div>
        );
      }
    }

    return (
      <div className="p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100">
        <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800 dark:text-blue-100">
          <Calendar className="h-5 w-5" /> Lolos ke Tahap Wawancara
        </h3>
        <div className="text-sm mt-3 space-y-3 text-blue-800/90 dark:text-blue-200/90">
          <p>
            Selamat, Anda telah lolos ke tahap wawancara. Tim HRD kami sedang
            mengatur jadwal yang sesuai.
          </p>
          <p>
            Anda akan menerima notifikasi melalui portal ini dan email setelah
            jadwal wawancara dikonfirmasi. Mohon periksa secara berkala.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex flex-col border-slate-300/50">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div>
            <CardTitle className="text-xl">Menunggu Hasil Evaluasi</CardTitle>
            <CardDescription>
              Terima kasih, data dan dokumen lamaran Anda telah kami terima
              dengan baik. Saat ini tim rekrutmen kami sedang melakukan evaluasi
              terhadap profil, dokumen, dan hasil tes Anda secara menyeluruh.
            </CardDescription>
          </div>
          <Badge className="w-fit bg-slate-700 text-white">
            Menunggu Hasil Evaluasi
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <div className="p-4 rounded-md border-dashed border-slate-300 bg-slate-50 text-slate-900 dark:bg-slate-900/20 dark:text-slate-100">
          <p className="text-sm leading-7">
            Terima kasih, data dan dokumen lamaran Anda telah kami terima dengan
            baik. Saat ini tim rekrutmen kami sedang melakukan evaluasi terhadap
            profil, dokumen, dan hasil tes Anda secara menyeluruh.
          </p>
          <p className="text-sm leading-7 mt-3">
            Mohon menunggu informasi selanjutnya melalui portal ini atau email.
            Anda juga dapat memantau perkembangan lamaran Anda secara berkala
            pada halaman ini.
          </p>
        </div>
      </CardContent>
      {application.status === "tes_kepribadian" && !hasCompletedTest ? (
        <CardFooter className="bg-muted/50 p-4 border-t flex justify-end">
          <Button asChild>
            <Link
              href={`/careers/portal/assessment/personality?applicationId=${application.id}`}
            >
              Mulai Tes Kepribadian <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      ) : null}
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

  const isLoading = authLoading || applicationsLoading || sessionsLoading;

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
          {sortedApplications.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              hasCompletedTest={hasCompletedTest}
            />
          ))}
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
