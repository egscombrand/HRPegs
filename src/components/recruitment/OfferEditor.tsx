"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { OfferFormData, offerSchema } from "./OfferDialog";

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
      probationDurationMonths:
        application.probationDurationMonths ??
        (job.statusJob === "fulltime" ? 3 : null),
      offerDescription: application.offerDescription ?? "",
      workDays: application.workDays ?? "",
      offerNotes: application.offerNotes ?? "",
    },
  });

  const { watch, setValue, reset } = form;
  const startDate = watch("contractStartDate");
  const duration = watch("contractDurationMonths");
  const contractEndDate = watch("contractEndDate");

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
      probationDurationMonths:
        application.probationDurationMonths ??
        (job.statusJob === "fulltime" ? 3 : null),
      offerDescription: application.offerDescription ?? "",
      workDays: application.workDays ?? "",
      offerNotes: application.offerNotes ?? "",
    });
  }, [application, defaultStartTime, job.statusJob, reset]);

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
                  {job.department ?? job.location ?? "-"}
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
            onSubmit={form.handleSubmit(onSendOffer)}
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
          {isSendingOffer ? "Mengirim..." : "Kirim Penawaran"}
        </Button>
      </CardFooter>
    </Card>
  );
}
