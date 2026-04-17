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
import { collection, query, where, getDocs } from "firebase/firestore";
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
  Download
} from "lucide-react";
import { generateOfferingPDF } from "@/lib/recruitment/pdf-generator";

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
  const [masterTemplates, setMasterTemplates] = useState<OfferingTemplate[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");
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

  const handleConfirmSend = async () => {
    if (!previewData) return;
    await onSendOffer({
      ...previewData,
      masterTemplateId: selectedMasterId || null,
      offerLetterNumber: `OL/${(masterTemplates.find(t => t.id === selectedMasterId)?.brandName || "ENV").substring(0,3).toUpperCase()}/${format(new Date(), "yyyyMMdd")}/${application.id?.substring(0,4)}`
    });
    setIsPreviewOpen(false);
    setHasConfirmedPreview(false);
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const q = query(
          collection(firestore, "recruitment_offering_templates"),
          where("isActive", "==", true)
        );
        const snapshot = await getDocs(q);
        const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OfferingTemplate));
        setMasterTemplates(templates);
      } catch (err) {
        console.error("Error fetching master templates:", err);
      }
    };
    fetchTemplates();
  }, [firestore]);

  const applyMasterTemplate = (templateId: string) => {
    const template = masterTemplates.find(t => t.id === templateId);
    if (!template) return;

    setSelectedMasterId(templateId);
    
    // Process placeholders
    let content = template.htmlContent;
    const data: any = {
      candidateName,
      jobTitle: application.jobPosition,
      brandName: template.brandName,
      startDate: startDate ? format(startDate, "dd MMMM yyyy", { locale: idLocale }) : "[Tanggal Mulai]",
      contractEndDate: contractEndDate ? format(contractEndDate, "dd MMMM yyyy", { locale: idLocale }) : "[Tanggal Selesai]",
      salary: formatSalary(watch("offeredSalary")),
      signerName: userProfile?.fullName || "[Signer Name]",
      signerTitle: "HR Manager",
      letterNumber: `OL/${template.brandName.substring(0,3).toUpperCase()}/${format(new Date(), "yyyyMMdd")}/${application.id?.substring(0,4)}`,
      responseDeadline: format(addMonths(new Date(), 1), "dd MMMM yyyy", { locale: idLocale })
    };

    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, "g");
      content = content.replace(regex, data[key]);
    });

    setValue("offerSections.0.content", content);
    setValue("offerSections.0.title", "Ketentuan Penawaran (Master Template)");
    setValue("offerNotes", `Menggunakan Master Template: ${template.templateName}`);
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
    });
  }, [application, defaultStartTime, job.statusJob, reset]);

  const applyTemplate = (templateKey: keyof typeof OFFER_TEMPLATES) => {
    let content = OFFER_TEMPLATES[templateKey];

    content = content
      .replace(/\[Nama Kandidat\]/g, candidateName)
      .replace(/\[Posisi\]/g, application.jobPosition || "")
      .replace(/\[Nama Perusahaan\]/g, job.brandName || "Environesia")
      .replace(/\[Gaji\]/g, formatSalary(watch("offeredSalary")))
      .replace(/\[Durasi\]/g, watch("contractDurationMonths").toString())
      .replace(/\[Masa Probation\]/g, (watch("probationDurationMonths") || 3).toString())
      .replace(/\[Hari Kerja\]/g, watch("workDays") || "Senin - Jumat")
      .replace(/\[Jam Kerja\]/g, watch("startTime") || "09:00")
      .replace(/\[Lokasi\]/g, job.location || "Kantor")
      .replace(
        /\[Tanggal\]/g,
        startDate ? format(startDate, "dd MMMM yyyy", { locale: idLocale }) : ""
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

            <div className="space-y-6 rounded-3xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-bold text-primary">Isi & Ketentuan Penawaran</p>
                  <p className="text-sm text-muted-foreground">
                    Tulis detail penawaran secara profesional atau gunakan template yang tersedia.
                  </p>
                </div>
              </div>

              {isEditable && masterTemplates.length > 0 && (
                <div className="space-y-3 p-4 border rounded-2xl bg-background shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Layout className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Gunakan Master Template Perusahaan</span>
                  </div>
                  <Select onValueChange={applyMasterTemplate} value={selectedMasterId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Master Template Resmi..." />
                    </SelectTrigger>
                    <SelectContent>
                      {masterTemplates.map(t => (
                        <SelectItem key={t.id} value={t.id!}>
                          {t.templateName} ({t.brandName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileCheck className="h-3 w-3" /> 
                    Menggunakan master template memastikan output PDF 1:1 dengan format resmi perusahaan.
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
                <input type="hidden" {...form.register("offerSections.0.title")} value="Isi Penawaran / Ketentuan Penawaran" />
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
            </div>

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
          onClick={form.handleSubmit(onSaveDraft)}
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
                  if (previewData?.offerSections?.[0]?.content) {
                    generateOfferingPDF(
                      previewData.offerSections[0].content, 
                      `Offering_${candidateName.replace(/\s+/g, '_')}.pdf`
                    );
                  }
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
                    {previewData?.offerSections?.map((section: { title: string; content: string }, index: number) => (
                      <div key={index} className="rounded-2xl border border-muted/50 bg-background p-4">
                        <p className="font-bold text-primary mb-3">
                          {section.title}
                        </p>
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: section.content }}
                        />
                      </div>
                    ))}
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
