"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMonths, format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import type { Job, JobApplication } from "@/lib/types";
import type { OfferFormData } from "./OfferDialog";
export type { OfferFormData } from "./OfferDialog";
import { offerSchema } from "./OfferDialog";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import type { OfferingTemplate } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileCheck,
  FileText,
  UserCheck,
  Leaf,
  Globe,
  GraduationCap,
  PlusCircle,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layout,
  Download,
} from "lucide-react";
import {
  generateOfferingPDF,
  buildOfferingHtml,
} from "@/lib/recruitment/pdf-generator";

const OFFER_TEMPLATES = {
  internship: `
    <p>Halo [Nama Kandidat],</p>
    <p>Kami sangat berkesan dengan kualifikasi dan pengalaman Anda di bidang <strong>[Posisi]</strong>. Oleh karena itu, kami dengan senang hati menawarkan posisi <strong>Magang (Internship)</strong> di [Nama Perusahaan].</p>
    <p><strong>Ketentuan Umum:</strong></p>
    <ul>
      <li>Durasi Magang: [Durasi] bulan.</li>
      <li>Lokasi: [Lokasi].</li>
      <li>Jam Kerja: [Jam Kerja].</li>
    </ul>
    <p><strong>Uang Saku & Fasilitas:</strong></p>
    <ul>
      <li>Uang saku bulanan sebesar Rp [Gaji].</li>
      <li>Surat keterangan magang (setelah periode selesai).</li>
      <li>Akses ke training internal.</li>
    </ul>
    <p>Silakan tinjau penawaran ini dan berikan respons Anda melalui portal ini.</p>
  `,
  fulltime: `
    <p>Halo [Nama Kandidat],</p>
    <p>Selamat! Kami senang dapat menawarkan posisi <strong>Karyawan Full-time</strong> sebagai <strong>[Posisi]</strong> di [Nama Perusahaan]. Kami percaya kontribusi Anda akan menjadi aset berharga bagi tim kami.</p>
    <p><strong>Ketentuan Pekerjaan:</strong></p>
    <ul>
      <li>Tanggal Mulai: [Tanggal].</li>
      <li>Masa Percobaan: [Masa Probation] bulan.</li>
      <li>Waktu Kerja: [Hari Kerja], [Jam Kerja].</li>
    </ul>
    <p><strong>Kompensasi & Benefit:</strong></p>
    <ul>
      <li>Gaji bulanan: Rp [Gaji] (Gross/Nett).</li>
      <li>BPJS Kesehatan & Ketenagakerjaan.</li>
      <li>Tunjangan Hari Raya (THR).</li>
      <li>Cuti Tahunan sesuai kebijakan perusahaan.</li>
    </ul>
    <p>Kami sangat menantikan kehadiran Anda sebagai bagian dari tim kami.</p>
  `,
  greenskills: `
    <p>Halo [Nama Kandidat],</p>
    <p>Kami dengan senang hati mengajak Anda bergabung dalam inisiatif <strong>GreenSkill Program</strong> sebagai <strong>[Posisi]</strong>. Program ini bertujuan untuk mengembangkan kompetensi di bidang lingkungan dan keberlanjutan.</p>
    <p><strong>Detail Program:</strong></p>
    <ul>
      <li>Fokus: Keberlanjutan Lingkungan.</li>
      <li>Kompensasi: Rp [Gaji].</li>
      <li>Sertifikasi: Sertifikat Kompetensi GreenSkill.</li>
    </ul>
    <p>Mari berkontribusi untuk masa depan yang lebih hijau.</p>
  `,
  egs: `
    <p>Halo [Nama Kandidat],</p>
    <p>Terkait dengan evaluasi yang telah dilakukan, kami menawarkan posisi dalam tim <strong>EGS (Environmental, Global, Social)</strong> sebagai <strong>[Posisi]</strong>.</p>
    <p><strong>Ketentuan Utama:</strong></p>
    <ul>
      <li>Gaji: Rp [Gaji].</li>
      <li>Cakupan Kerja: Global & Social Impact.</li>
      <li>Lokasi: [Lokasi].</li>
    </ul>
    <p>Kami yakin passion Anda sejalan dengan nilai-nilai EGS kami.</p>
  `,
};

const DESCRIPTION_TEMPLATES = {
  addition: `
    <p>Dalam peran ini, Anda akan menjadi kontributor utama untuk proyek inti tim. Pekerjaan meliputi:</p>
    <ul>
      <li>Koordinasi dengan tim lintas fungsi.</li>
      <li>Penyusunan laporan berkala.</li>
      <li>Pengembangan skill profesional di area yang relevan.</li>
    </ul>
    <p>Silakan gunakan kesempatan ini untuk menunjukkan inisiatif dan etos kerja yang proaktif.</p>
  `,
  benefits: `
    <p>Benefit tambahan yang akan Anda peroleh:</p>
    <ul>
      <li>Tunjangan transportasi dan makan.</li>
      <li>BPJS Kesehatan dan Ketenagakerjaan.</li>
      <li>Program pelatihan internal dan pengembangan karier.</li>
    </ul>
  `,
  policies: `
    <p>Sebagai bagian dari tim, Anda harus mematuhi peraturan kerja berikut:</p>
    <ul>
      <li>Presensi masuk sesuai jadwal yang sudah ditetapkan.</li>
      <li>Etika komunikasi profesional di lingkungan kerja.</li>
      <li>Penggunaan fasilitas perusahaan hanya untuk keperluan pekerjaan.</li>
    </ul>
  `,
  notes: `
    <p>Catatan penting:</p>
    <ul>
      <li>Permintaan perubahan jadwal kerja harus disampaikan minimal 2 hari kerja sebelumnya.</li>
      <li>Evaluasi kinerja akan dilakukan secara berkala.</li>
      <li>Semua dokumen pendukung harus diserahkan pada saat orientasi.</li>
    </ul>
  `,
};

interface DescriptionSnippet {
  id: string;
  name: string;
  content: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

interface DescriptionHistoryItem {
  id: string;
  title: string;
  content: string;
  createdAt: Timestamp;
}

interface OfferEditorProps {
  id?: string;
  application: JobApplication;
  job: Job;
  candidateName: string;
  onSaveDraft: (data: OfferFormData) => Promise<void>;
  onSendOffer: (data: OfferFormData) => Promise<void>;
  isSavingDraft?: boolean;
  isSendingOffer?: boolean;
}

const formatSalary = (value: number | string | undefined | null) => {
  if (value === undefined || value === null || value === "") return "";
  const num =
    typeof value === "string" ? parseInt(value.replace(/\./g, ""), 10) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("id-ID");
};

const unformatSalary = (value: string) => {
  return parseInt(value.replace(/\./g, ""), 10) || 0;
};

export function OfferEditor({
  id,
  application,
  job,
  candidateName,
  onSaveDraft,
  onSendOffer,
  isSavingDraft = false,
  isSendingOffer = false,
}: OfferEditorProps) {
  const [masterTemplates, setMasterTemplates] = useState<OfferingTemplate[]>(
    [],
  );
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");
  const [descriptionMode, setDescriptionMode] = useState<
    "template" | "history" | "manual"
  >("template");
  const [descriptionTemplates, setDescriptionTemplates] = useState<
    DescriptionSnippet[]
  >([]);
  const [descriptionHistory, setDescriptionHistory] = useState<
    DescriptionHistoryItem[]
  >([]);
  const [selectedDescriptionSource, setSelectedDescriptionSource] =
    useState<string>("");
  const [isSavingDescriptionTemplate, setIsSavingDescriptionTemplate] =
    useState(false);
  const firestore = useFirestore();
  const { userProfile } = useAuth();

  const isEditable = !["sent", "accepted", "rejected"].includes(
    application.offerStatus ?? "",
  );

  const defaultStartTime = application.contractStartDate
    ? format(application.contractStartDate.toDate(), "HH:mm")
    : "09:00";

  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      offeredSalary: application.offeredSalary ?? 0,
      contractStartDate: application.contractStartDate?.toDate() ?? new Date(),
      startTime: defaultStartTime,
      contractDurationMonths: application.contractDurationMonths ?? 12,
      contractEndDate:
        application.contractEndDate?.toDate() ??
        addMonths(
          application.contractStartDate?.toDate() ?? new Date(),
          application.contractDurationMonths ?? 12,
        ),
      offerSections: application.offerSections?.length
        ? application.offerSections
        : [
            {
              title: "Isi Penawaran / Ketentuan Penawaran",
              content:
                application.offerDescription || application.offerNotes || "",
            },
          ],
      probationDurationMonths:
        application.probationDurationMonths ??
        (job.statusJob === "fulltime" ? 3 : null),
      offerDescription: application.offerDescription ?? "",
      workDays: application.workDays ?? "",
      offerNotes: application.offerNotes ?? "",
      masterTemplateId: application.masterTemplateId ?? null,
      offerLetterNumber: application.offerLetterNumber ?? "",
      responseDeadline: application.responseDeadline?.toDate() ?? null,
      signerName: application.signerName ?? userProfile?.fullName ?? "",
      signerTitle: application.signerTitle ?? "HRD",
    },
  });

  const { watch, setValue, reset } = form;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [hasConfirmedPreview, setHasConfirmedPreview] = useState(false);
  const [previewData, setPreviewData] = useState<OfferFormData | null>(null);
  const startDate = watch("contractStartDate");
  const duration = watch("contractDurationMonths");
  const contractEndDate = watch("contractEndDate");

  const openPreview = form.handleSubmit((data) => {
    setPreviewData(data);
    setHasConfirmedPreview(false);
    setIsPreviewOpen(true);
  });

  const getDescriptionTitle = (content: string) => {
    const plain = content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!plain) return "Deskripsi Penawaran";
    return plain.length > 60 ? `${plain.slice(0, 57)}...` : plain;
  };

  const saveDescriptionHistory = async (content: string) => {
    if (!userProfile || !content?.trim()) return;

    const payload = {
      title: getDescriptionTitle(content),
      content,
      createdAt: serverTimestamp(),
      createdBy: userProfile.uid,
    };

    try {
      const docRef = await addDoc(
        collection(firestore, "recruitment_offer_description_history"),
        payload,
      );

      setDescriptionHistory((prev) => [
        {
          id: docRef.id,
          title: payload.title,
          content: payload.content,
          createdAt: Timestamp.now(),
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Failed to save description history:", err);
    }
  };

  const saveDescriptionTemplate = async (content: string) => {
    if (!userProfile || !content?.trim()) return;

    const payload = {
      name: getDescriptionTitle(content),
      content,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userProfile.uid,
    };

    try {
      setIsSavingDescriptionTemplate(true);
      const docRef = await addDoc(
        collection(firestore, "recruitment_offer_description_templates"),
        payload,
      );

      setDescriptionTemplates((prev) => [
        {
          id: docRef.id,
          name: payload.name,
          content: payload.content,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        ...prev,
      ]);
      setSelectedDescriptionSource(docRef.id);
      setDescriptionMode("template");
    } catch (err) {
      console.error("Failed to save description template:", err);
    } finally {
      setIsSavingDescriptionTemplate(false);
    }
  };

  const handleSaveDraft = async (data: OfferFormData) => {
    await saveDescriptionHistory(data.offerSections?.[0]?.content || "");
    await onSaveDraft({
      ...data,
      masterTemplateId: selectedMasterId || null,
    });
  };

  const handleConfirmSend = async () => {
    if (!previewData) return;
    await saveDescriptionHistory(previewData.offerSections?.[0]?.content || "");
    await onSendOffer({
      ...previewData,
      masterTemplateId: selectedMasterId || null,
      offerLetterNumber:
        previewData.offerLetterNumber ||
        `OL/${(masterTemplates.find((t) => t.id === selectedMasterId)?.brandName || "ENV").substring(0, 3).toUpperCase()}/${format(new Date(), "yyyyMMdd")}/${application.id?.substring(0, 4)}`,
    });
    setIsPreviewOpen(false);
    setHasConfirmedPreview(false);
  };

  const getFinalOfferHtml = (data: OfferFormData) => {
    const master = masterTemplates.find((t) => t.id === selectedMasterId);
    const descriptionHtml = data.offerSections?.[0]?.content || "";
    const templateHtml = master?.htmlTemplate || master?.htmlContent || "";

    return buildOfferingHtml(
      templateHtml,
      {
        letterNumber:
          data.offerLetterNumber ||
          `OL/${(master?.brandName || "ENV").substring(0, 3).toUpperCase()}/${format(new Date(), "yyyyMMdd")}/${application.id?.substring(0, 4)}`,
        candidateName,
        jobTitle: application.jobPosition,
        brandName: master?.brandName || application.brandName || "",
        startDate: data.contractStartDate
          ? format(data.contractStartDate, "dd MMMM yyyy", {
              locale: idLocale,
            })
          : "",
        contractEndDate: data.contractEndDate
          ? format(data.contractEndDate, "dd MMMM yyyy", {
              locale: idLocale,
            })
          : "",
        salary: formatSalary(data.offeredSalary),
        signerName: data.signerName || userProfile?.fullName || "",
        signerTitle: data.signerTitle || "",
        responseDeadline: data.responseDeadline
          ? format(data.responseDeadline, "dd MMMM yyyy", {
              locale: idLocale,
            })
          : "",
      },
      descriptionHtml,
    );
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const masterQuery = query(
          collection(firestore, "recruitment_offering_templates"),
          where("isActive", "==", true),
        );
        const masterSnapshot = await getDocs(masterQuery);
        const templates = masterSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as OfferingTemplate,
        );
        setMasterTemplates(templates);

        if (!userProfile) return;

        const descriptionTemplateQuery = query(
          collection(firestore, "recruitment_offer_description_templates"),
          where("createdBy", "==", userProfile.uid),
        );
        const historyQuery = query(
          collection(firestore, "recruitment_offer_description_history"),
          where("createdBy", "==", userProfile.uid),
        );

        const [descriptionSnapshot, historySnapshot] = await Promise.all([
          getDocs(descriptionTemplateQuery),
          getDocs(historyQuery),
        ]);

        setDescriptionTemplates(
          descriptionSnapshot.docs.map(
            (doc) =>
              ({
                id: doc.id,
                ...(doc.data() as Omit<DescriptionSnippet, "id">),
              }) as DescriptionSnippet,
          ),
        );

        setDescriptionHistory(
          historySnapshot.docs
            .map(
              (doc) =>
                ({
                  id: doc.id,
                  ...(doc.data() as Omit<DescriptionHistoryItem, "id">),
                }) as DescriptionHistoryItem,
            )
            .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()),
        );
      } catch (err) {
        console.error("Error fetching templates and history:", err);
      }
    };
    fetchTemplates();
  }, [firestore, userProfile]);

  const applyMasterTemplate = (templateId: string) => {
    const template = masterTemplates.find((t) => t.id === templateId);
    if (!template) return;

    setSelectedMasterId(templateId);
    setValue(
      "offerLetterNumber",
      `OL/${template.brandName.substring(0, 3).toUpperCase()}/${format(new Date(), "yyyyMMdd")}/${application.id?.substring(0, 4)}`,
    );
    setValue(
      "offerNotes",
      `Menggunakan Master Template: ${template.templateName}`,
    );
  };

  useEffect(() => {
    reset({
      offeredSalary: application.offeredSalary ?? 0,
      contractStartDate: application.contractStartDate?.toDate() ?? new Date(),
      startTime: defaultStartTime,
      contractDurationMonths: application.contractDurationMonths ?? 12,
      contractEndDate:
        application.contractEndDate?.toDate() ??
        addMonths(
          application.contractStartDate?.toDate() ?? new Date(),
          application.contractDurationMonths ?? 12,
        ),
      offerSections: application.offerSections?.length
        ? application.offerSections
        : [
            {
              title: "Isi Penawaran / Ketentuan Penawaran",
              content:
                application.offerDescription || application.offerNotes || "",
            },
          ],
      probationDurationMonths:
        application.probationDurationMonths ??
        (job.statusJob === "fulltime" ? 3 : null),
      offerDescription: application.offerDescription ?? "",
      workDays: application.workDays ?? "",
      offerNotes: application.offerNotes ?? "",
      masterTemplateId: application.masterTemplateId ?? null,
      offerLetterNumber: application.offerLetterNumber ?? "",
      responseDeadline: application.responseDeadline?.toDate() ?? null,
      signerName: application.signerName ?? userProfile?.fullName ?? "",
      signerTitle: application.signerTitle ?? "HRD",
    });
  }, [application, defaultStartTime, job.statusJob, reset, userProfile]);

  const applyTemplate = (templateKey: keyof typeof OFFER_TEMPLATES) => {
    let content = OFFER_TEMPLATES[templateKey];

    content = content
      .replace(/\[Nama Kandidat\]/g, candidateName)
      .replace(/\[Posisi\]/g, application.jobPosition || "")
      .replace(/\[Nama Perusahaan\]/g, job.brandName || "Environesia")
      .replace(/\[Gaji\]/g, formatSalary(watch("offeredSalary")))
      .replace(/\[Durasi\]/g, watch("contractDurationMonths").toString())
      .replace(
        /\[Masa Probation\]/g,
        (watch("probationDurationMonths") || 3).toString(),
      )
      .replace(/\[Hari Kerja\]/g, watch("workDays") || "Senin - Jumat")
      .replace(/\[Jam Kerja\]/g, watch("startTime") || "09:00")
      .replace(/\[Lokasi\]/g, job.location || "Kantor")
      .replace(
        /\[Tanggal\]/g,
        startDate
          ? format(startDate, "dd MMMM yyyy", { locale: idLocale })
          : "",
      );

    setValue("offerSections.0.content", content);
    setValue("offerSections.0.title", "Isi Penawaran / Ketentuan Penawaran");
  };

  useEffect(() => {
    if (startDate && duration > 0) {
      const parsedDuration =
        typeof duration === "string" ? parseInt(duration, 10) : duration;
      if (!isNaN(parsedDuration)) {
        const endDate = addMonths(startDate, parsedDuration);
        setValue("contractEndDate", endDate);
      }
    }
  }, [startDate, duration, setValue]);

  return (
    <Card id={id} className="border-primary/30">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Editor Penawaran Kerja</CardTitle>
            <CardDescription>
              Kelola penawaran kerja HRD untuk kandidat: simpan sebagai draf
              atau kirim penawaran resmi.
            </CardDescription>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge className="capitalize">
              {application.offerStatus ?? "draft"}
            </Badge>
            <p className="text-sm text-muted-foreground max-w-xl">
              {application.offerStatus === "sent"
                ? "Penawaran telah dikirim dan menunggu respons kandidat."
                : application.offerStatus === "accepted"
                  ? "Kandidat telah menerima penawaran."
                  : application.offerStatus === "rejected"
                    ? "Kandidat telah menolak penawaran."
                    : "Simpan draf sebelum mengirim penawaran."}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-muted/50 bg-muted/50 p-4 text-sm">
            <p className="font-semibold">Detail Kandidat</p>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <div className="flex justify-between">
                <span>Nama</span>
                <span className="font-medium">{candidateName}</span>
              </div>
              <div className="flex justify-between">
                <span>Posisi</span>
                <span className="font-medium">{application.jobPosition}</span>
              </div>
              <div className="flex justify-between">
                <span>Tipe pekerjaan</span>
                <span className="font-medium capitalize">{job.statusJob}</span>
              </div>
              <div className="flex justify-between">
                <span>Divisi</span>
                <span className="font-medium capitalize">
                  {job.division ?? job.location ?? "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-muted/50 bg-muted/50 p-4 text-sm">
            <p className="font-semibold">Ringkasan</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Tentukan gaji, durasi kontrak, dan informasi kerja yang jelas.
              Kandidat akan melihat detail ini saat meninjau penawaran.
            </p>
          </div>
        </div>

        <Form {...form}>
          <form
            id="offer-editor-form"
            onSubmit={openPreview}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="offeredSalary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gaji yang Ditawarkan</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground pointer-events-none">
                        Rp
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="5.000.000"
                        className="pl-8"
                        value={formatSalary(field.value)}
                        onChange={(e) => {
                          const numericValue = unformatSalary(e.target.value);
                          field.onChange(numericValue);
                        }}
                        disabled={!isEditable}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="contractStartDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tanggal Mulai</FormLabel>
                    <FormControl>
                      <GoogleDatePicker
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!isEditable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jam Mulai Hari Pertama</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} disabled={!isEditable} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="contractDurationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Durasi Kontrak</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          disabled={!isEditable}
                        />
                      </FormControl>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                        bulan
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {contractEndDate && (
                <div className="flex flex-col">
                  <FormLabel>Perkiraan Selesai</FormLabel>
                  <div className="h-10 px-3 py-2 text-sm text-muted-foreground">
                    {format(contractEndDate, "eeee, dd MMMM yyyy", {
                      locale: idLocale,
                    })}
                  </div>
                </div>
              )}
            </div>

            {job.statusJob === "fulltime" && (
              <FormField
                control={form.control}
                name="probationDurationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Masa Percobaan</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                          className="pr-16"
                          disabled={!isEditable}
                        />
                      </FormControl>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                        bulan
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="space-y-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold">
                    Sistem Template Deskripsi
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Pilih template deskripsi, gunakan riwayat HRD, atau tulis
                    manual untuk mengisi bagian deskripsi penawaran.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["template", "history", "manual"] as const).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      variant={descriptionMode === mode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDescriptionMode(mode)}
                      disabled={!isEditable}
                    >
                      {mode === "template"
                        ? "Pilih Template"
                        : mode === "history"
                          ? "Pilih dari Riwayat"
                          : "Tulis Manual"}
                    </Button>
                  ))}
                </div>
              </div>

              {descriptionMode === "template" && (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isEditable}
                      onClick={() =>
                        setValue(
                          "offerSections.0.content",
                          DESCRIPTION_TEMPLATES.addition,
                        )
                      }
                    >
                      Tambahan
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isEditable}
                      onClick={() =>
                        setValue(
                          "offerSections.0.content",
                          DESCRIPTION_TEMPLATES.benefits,
                        )
                      }
                    >
                      Benefit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isEditable}
                      onClick={() =>
                        setValue(
                          "offerSections.0.content",
                          DESCRIPTION_TEMPLATES.policies,
                        )
                      }
                    >
                      Peraturan Kantor
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isEditable}
                      onClick={() =>
                        setValue(
                          "offerSections.0.content",
                          DESCRIPTION_TEMPLATES.notes,
                        )
                      }
                    >
                      Catatan Umum
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Template Deskripsi Resmi
                    </div>
                    <Select
                      onValueChange={(value) => {
                        const selected = descriptionTemplates.find(
                          (item) => item.id === value,
                        );
                        if (selected) {
                          setValue("offerSections.0.content", selected.content);
                          setSelectedDescriptionSource(value);
                        }
                      }}
                      value={selectedDescriptionSource}
                      disabled={!isEditable}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih template deskripsi..." />
                      </SelectTrigger>
                      <SelectContent>
                        {descriptionTemplates.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {descriptionMode === "history" && (
                <div className="space-y-3">
                  {descriptionHistory.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {descriptionHistory.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-muted/50 bg-background p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm">
                              {item.title}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setValue(
                                  "offerSections.0.content",
                                  item.content,
                                );
                                setSelectedDescriptionSource(item.id);
                              }}
                              disabled={!isEditable}
                            >
                              Gunakan
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.createdAt
                              .toDate()
                              .toLocaleDateString("id-ID", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              })}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Belum ada riwayat deskripsi. Simpan penulisan deskripsi
                      Anda saat menyimpan draf atau mengirim penawaran.
                    </p>
                  )}
                </div>
              )}

              {descriptionMode === "manual" && (
                <div className="rounded-2xl border border-muted/50 bg-background p-4 text-sm text-muted-foreground">
                  Gunakan editor di bawah untuk menulis deskripsi secara
                  langsung. Konten ini disimpan secara otomatis ke riwayat saat
                  Anda menyimpan atau mengirim penawaran.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    saveDescriptionTemplate(
                      watch("offerSections.0.content") || "",
                    )
                  }
                  disabled={!isEditable || isSavingDescriptionTemplate}
                >
                  {isSavingDescriptionTemplate
                    ? "Menyimpan..."
                    : "Simpan sebagai Template"}
                </Button>
              </div>
            </div>

            <div className="space-y-6 rounded-3xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-bold text-primary">
                    Isi & Ketentuan Penawaran
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tulis detail penawaran secara profesional atau gunakan
                    template yang tersedia.
                  </p>
                </div>
              </div>

              {isEditable && masterTemplates.length > 0 && (
                <div className="space-y-3 p-4 border rounded-2xl bg-background shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Layout className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">
                      Gunakan Master Template Perusahaan
                    </span>
                  </div>
                  <Select
                    onValueChange={applyMasterTemplate}
                    value={selectedMasterId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Master Template Resmi..." />
                    </SelectTrigger>
                    <SelectContent>
                      {masterTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id!}>
                          {t.templateName} ({t.brandName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileCheck className="h-3 w-3" />
                    Menggunakan master template memastikan output PDF 1:1 dengan
                    format resmi perusahaan.
                  </p>
                </div>
              )}

              {isEditable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-background hover:bg-primary/10"
                    onClick={() => applyTemplate("fulltime")}
                  >
                    <UserCheck className="h-4 w-4 text-blue-500" />
                    Template Fulltime
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-background hover:bg-primary/10"
                    onClick={() => applyTemplate("internship")}
                  >
                    <GraduationCap className="h-4 w-4 text-amber-500" />
                    Template Internship
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-background hover:bg-primary/10"
                    onClick={() => applyTemplate("greenskills")}
                  >
                    <Leaf className="h-4 w-4 text-emerald-500" />
                    Template GreenSkill
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-background hover:bg-primary/10"
                    onClick={() => applyTemplate("egs")}
                  >
                    <Globe className="h-4 w-4 text-indigo-500" />
                    Template EGS
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="offerSections.0.content"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RichTextEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Tuliskan detail informasi penawaran di sini..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <input
                  type="hidden"
                  {...form.register("offerSections.0.title")}
                  value="Isi Penawaran / Ketentuan Penawaran"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="workDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hari Kerja</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: Senin - Jumat"
                        {...field}
                        disabled={!isEditable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="offerLetterNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nomor Surat Offering</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: OL/ENV/20260417/ABCD"
                        {...field}
                        value={field.value ?? ""}
                        disabled={!isEditable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="signerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Penandatangan</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: Budi Santoso"
                        {...field}
                        value={field.value ?? ""}
                        disabled={!isEditable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="signerTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jabatan Penandatangan</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contoh: HR Manager"
                        {...field}
                        value={field.value ?? ""}
                        disabled={!isEditable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="responseDeadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batas Respons</FormLabel>
                    <FormControl>
                      <GoogleDatePicker
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!isEditable}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="offerDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deskripsi Singkat Penawaran</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contoh: Kontrak ini mencakup fleksibilitas jam kerja dan tunjangan transportasi."
                      {...field}
                      value={field.value ?? ""}
                      disabled={!isEditable}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="offerNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catatan Penawaran (Opsional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contoh: Termasuk tunjangan transportasi dan makan."
                      {...field}
                      value={field.value ?? ""}
                      disabled={!isEditable}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEditable && (
              <Alert variant="default" className="bg-muted/50 border-muted/70">
                <AlertDescription>
                  Penawaran ini tidak dapat diubah karena sudah dikirim atau
                  kandidat telah membuat keputusan.
                </AlertDescription>
              </Alert>
            )}
          </form>
        </Form>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 sm:flex-row justify-end">
        <Button
          variant="secondary"
          onClick={form.handleSubmit(handleSaveDraft)}
          disabled={!isEditable || isSavingDraft}
        >
          {isSavingDraft ? "Menyimpan..." : "Simpan Draf"}
        </Button>
        <Button
          type="submit"
          form="offer-editor-form"
          disabled={!isEditable || isSendingOffer}
        >
          {isSendingOffer ? "Mengirim..." : "Preview Penawaran"}
        </Button>
      </CardFooter>
      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) setHasConfirmedPreview(false);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <DialogTitle>Preview Penawaran</DialogTitle>
                <DialogDescription>
                  Tinjau kembali semua detail sebelum mengirim penawaran resmi
                  ke kandidat.
                </DialogDescription>
              </div>
              <Badge className="self-start bg-primary/10 text-primary">
                Preview – Belum Dikirim
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  if (!previewData) return;
                  const template = masterTemplates.find(
                    (t) => t.id === selectedMasterId,
                  );
                  const content = getFinalOfferHtml(previewData);
                  generateOfferingPDF(
                    content,
                    `Offering_${candidateName.replace(/\s+/g, "_")}.pdf`,
                    template?.cssTemplate || "",
                  );
                }}
              >
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-3xl border border-muted/70 bg-muted/50 p-6 shadow-sm">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Nama Kandidat
                      </p>
                      <p className="text-lg font-semibold">{candidateName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Posisi</p>
                      <p className="font-semibold">{application.jobPosition}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-muted/60 bg-background p-4">
                      <p className="text-sm text-muted-foreground">
                        Status Penawaran
                      </p>
                      <p className="mt-2 font-semibold">Preview</p>
                    </div>
                    <div className="rounded-2xl border border-muted/60 bg-background p-4">
                      <p className="text-sm text-muted-foreground">
                        Hari Kerja
                      </p>
                      <p className="mt-2 font-semibold">
                        {previewData?.workDays || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-primary/50 bg-primary/5 p-6 text-center">
                    <p className="text-sm uppercase tracking-[0.18em] text-primary-foreground/70">
                      Gaji yang Ditawarkan
                    </p>
                    <p className="mt-3 text-3xl font-semibold leading-tight text-primary">
                      Rp {formatSalary(previewData?.offeredSalary)}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-muted/60 bg-background p-4">
                      <p className="text-sm text-muted-foreground">
                        Durasi Kontrak
                      </p>
                      <p className="mt-2 font-semibold">
                        {previewData?.contractDurationMonths} bulan
                      </p>
                    </div>
                    <div className="rounded-2xl border border-muted/60 bg-background p-4">
                      <p className="text-sm text-muted-foreground">
                        Masa Probation
                      </p>
                      <p className="mt-2 font-semibold">
                        {previewData?.probationDurationMonths != null
                          ? `${previewData.probationDurationMonths} bulan`
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-muted/70 bg-muted/50 p-6 shadow-sm">
                  <p className="text-sm text-muted-foreground">
                    Ringkasan Penawaran
                  </p>
                  <div className="mt-4 space-y-6 text-sm">
                    {previewData?.offerSections?.map(
                      (
                        section: { title: string; content: string },
                        index: number,
                      ) => {
                        const template = masterTemplates.find(
                          (t) => t.id === selectedMasterId,
                        );
                        return (
                          <div
                            key={index}
                            className="rounded-2xl border border-muted/50 bg-background p-4 overflow-hidden"
                          >
                            <p className="font-bold text-primary mb-3">
                              {section.title}
                            </p>
                            <div
                              className={
                                selectedMasterId
                                  ? ""
                                  : "prose prose-sm max-w-none dark:prose-invert"
                              }
                              dangerouslySetInnerHTML={{
                                __html: `
                              ${template?.cssTemplate ? `<style>${template.cssTemplate}</style>` : ""}
                              ${getFinalOfferHtml(previewData || ({} as OfferFormData))}
                            `,
                              }}
                            />
                          </div>
                        );
                      },
                    )}
                    <div className="rounded-2xl border border-muted/60 bg-background p-4">
                      <p className="text-sm text-muted-foreground">
                        Estimasi Pengiriman
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        Penawaran ini akan dikirim ke kandidat dan menunggu
                        konfirmasi.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-muted/70 bg-background p-5">
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={hasConfirmedPreview}
                  onCheckedChange={(checked) =>
                    setHasConfirmedPreview(checked === true)
                  }
                />
                <span className="text-sm leading-6">
                  Saya sudah memastikan semua data penawaran benar.
                </span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsPreviewOpen(false)}
              disabled={isSendingOffer}
            >
              Kembali Edit
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={!hasConfirmedPreview || isSendingOffer}
            >
              {isSendingOffer ? "Mengirim..." : "Kirim Penawaran ke Kandidat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
