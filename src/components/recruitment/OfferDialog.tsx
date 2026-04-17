"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { add, addMonths, format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { GoogleDatePicker } from "../ui/google-date-picker";
import type { Job, JobApplication } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { UserCheck, Leaf, Globe, GraduationCap } from "lucide-react";

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

export const offerSchema = z.object({
  offeredSalary: z.coerce.number().min(1, "Gaji yang ditawarkan harus diisi."),
  contractStartDate: z.date({ required_error: "Tanggal mulai harus diisi." }),
  startTime: z
    .string()
    .regex(
      /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
      "Waktu mulai harus diisi dengan format HH:MM.",
    ),
  contractDurationMonths: z.coerce
    .number()
    .int()
    .min(1, "Durasi kontrak minimal 1 bulan."),
  contractEndDate: z.date().optional(),
  probationDurationMonths: z.coerce.number().int().min(0).optional().nullable(),
  offerSections: z
    .array(
      z.object({
        title: z.string().min(1, "Judul bagian harus diisi."),
        content: z.string().min(1, "Isi bagian harus diisi."),
      }),
    )
    .min(1, "Setidaknya satu bagian penawaran harus ditambahkan."),
  offerDescription: z.string().optional(),
  workDays: z.string().optional(),
  offerNotes: z.string().optional(),
  masterTemplateId: z.string().optional().nullable(),
  offerLetterNumber: z.string().optional().nullable(),
  responseDeadline: z.date().optional().nullable(),
  signerName: z.string().optional().nullable(),
  signerTitle: z.string().optional().nullable(),
});

export type OfferFormData = z.infer<typeof offerSchema>;

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: OfferFormData) => Promise<void>;
  candidateName: string;
  job: Job;
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

export function OfferDialog({
  open,
  onOpenChange,
  onConfirm,
  candidateName,
  job,
}: OfferDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [stagedOfferData, setStagedOfferData] = useState<OfferFormData | null>(
    null,
  );

  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      offeredSalary: 0,
      contractStartDate: new Date(),
      startTime: "09:00",
      contractDurationMonths: 12,
      probationDurationMonths: job.statusJob === "fulltime" ? 3 : null,
      offerSections: [
        {
          title: "Ringkasan Penawaran",
          content: "",
        },
      ],
      offerDescription: "",
      workDays: "",
      offerNotes: "",
    },
  });

  const { watch, setValue } = form;
  const startDate = watch("contractStartDate");
  const duration = watch("contractDurationMonths");

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

  const contractEndDate = watch("contractEndDate");

  const handleSubmit = (values: OfferFormData) => {
    setStagedOfferData(values);
    setIsConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!stagedOfferData) return;

    setIsSaving(true);
    await onConfirm(stagedOfferData);
    setIsSaving(false);
    setIsConfirmOpen(false);
    onOpenChange(false);
  };

  const title = `Penawaran Kontrak Kerja: ${candidateName}`;
  const salaryLabel =
    job.statusJob === "internship"
      ? "Uang Saku (per bulan)"
      : "Gaji / Kompensasi (per bulan)";

  const applyTemplate = (templateKey: keyof typeof OFFER_TEMPLATES) => {
    let content = OFFER_TEMPLATES[templateKey];

    content = content
      .replace(/\[Nama Kandidat\]/g, candidateName)
      .replace(/\[Posisi\]/g, job.position || "")
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Lengkapi detail penawaran kerja final. Informasi ini akan dikirim
              ke kandidat untuk ditinjau. Kandidat hanya dapat memberikan satu
              keputusan final: menerima atau menolak penawaran ini.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto px-6">
            <Form {...form}>
              <form
                id="offer-form"
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4 py-4"
              >
                <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
                  <div className="flex justify-between">
                    <p>Posisi:</p>{" "}
                    <p className="font-semibold">{job.position}</p>
                  </div>
                  <div className="flex justify-between">
                    <p>Tipe:</p>{" "}
                    <p className="font-semibold capitalize">{job.statusJob}</p>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="offeredSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{salaryLabel}</FormLabel>
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
                              const numericValue = unformatSalary(
                                e.target.value,
                              );
                              field.onChange(numericValue);
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractStartDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Tanggal Mulai Kerja</FormLabel>
                        <FormControl>
                          <GoogleDatePicker
                            value={field.value}
                            onChange={field.onChange}
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
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractDurationMonths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Durasi Kontrak</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input type="number" {...field} />
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
                      <FormLabel>Perkiraan Selesai Kontrak</FormLabel>
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

                <FormField
                  control={form.control}
                  name="workDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hari Kerja</FormLabel>
                      <FormControl>
                        <Input placeholder="Contoh: Senin - Jumat" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 mt-6">
                  <div>
                    <p className="text-sm font-bold text-primary">
                      Isi & Ketentuan Penawaran
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Gunakan template untuk mempercepat penulisan.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] gap-1 bg-background"
                      onClick={() => applyTemplate("fulltime")}
                    >
                      <UserCheck className="h-3 w-3 text-blue-500" />
                      Fulltime
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] gap-1 bg-background"
                      onClick={() => applyTemplate("internship")}
                    >
                      <GraduationCap className="h-3 w-3 text-amber-500" />
                      Internship
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] gap-1 bg-background"
                      onClick={() => applyTemplate("greenskills")}
                    >
                      <Leaf className="h-3 w-3 text-emerald-500" />
                      GreenSkill
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] gap-1 bg-background"
                      onClick={() => applyTemplate("egs")}
                    >
                      <Globe className="h-3 w-3 text-indigo-500" />
                      EGS
                    </Button>
                  </div>

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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="offerDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deskripsi Singkat (Opsional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Contoh: Kontrak ini mencakup fleksibilitas jam kerja..."
                            {...field}
                            value={field.value ?? ""}
                            rows={2}
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
                        <FormLabel>Catatan (Opsional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Contoh: Termasuk tunjangan transportasi..."
                            {...field}
                            value={field.value ?? ""}
                            rows={2}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Alert
                  variant="default"
                  className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
                >
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
                    Setelah penawaran dikirim, kandidat hanya dapat memilih
                    menerima atau menolak. Tidak ada negosiasi ulang melalui
                    sistem.
                  </AlertDescription>
                </Alert>
              </form>
            </Form>
          </div>
          <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" form="offer-form" disabled={isSaving}>
              Kirim Penawaran Kontrak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pengiriman Penawaran</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan mengirimkan penawaran kontrak kepada {candidateName}.
              Setelah dikirim, penawaran ini tidak dapat diubah. Pastikan semua
              detail sudah benar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSubmit}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ya, Kirim Penawaran
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
