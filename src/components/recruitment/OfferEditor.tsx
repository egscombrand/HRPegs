"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { Job, JobApplication, Offering } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FileText,
  Send,
  Save,
  Upload,
  Eye,
  X,
  Calendar,
  DollarSign,
  Clock,
  MapPin,
  User,
  FileCheck,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { addDoc, collection, serverTimestamp, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirestore, useStorage } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updateDocumentNonBlocking } from "@/firebase";

const fileMetadataSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
});

const offerSchema = z.object({
  documentFile: z
    .union([z.instanceof(File), fileMetadataSchema])
    .refine((file) => {
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
      ];
      return allowedTypes.includes(
        file instanceof File ? file.type : file.type,
      );
    }, "File harus berupa dokumen (PDF, Word, DOCX) atau gambar (JPG, PNG)"),
  responseDeadline: z.date({
    required_error: "Batas waktu respons diperlukan",
  }),
  responseDeadlineTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format waktu harus HH:mm"),
  // Detail penawaran
  salary: z.string().optional(),
  startDate: z.string().optional(),
  contractDurationMonths: z.string().optional(),
  firstDayTime: z.string().optional(),
  firstDayLocation: z.string().optional(),
  hrContact: z.string().optional(),
  // Catatan tambahan (rich text)
  additionalNotes: z.string().optional(),
});

export type OfferFormData = z.infer<typeof offerSchema>;

interface OfferEditorProps {
  id?: string;
  application: JobApplication;
  job: Job;
  candidateName: string;
  onSaveDraft: (data: any) => Promise<void>;
  onSendOffer: (data: any) => Promise<void>;
  isSavingDraft?: boolean;
  isSendingOffer?: boolean;
  currentOfferingId?: string;
  currentOfferingStatus?: "draft" | "sent" | "viewed" | "accepted" | "rejected";
  offering?: Offering;
}

// Helper function to format numbers in Indonesian format (with period separators)
function formatNumberIDR(value: string): string {
  if (!value) return "";
  // Remove all non-numeric characters
  const numericValue = value.replace(/\D/g, "");
  // Format with period separators (Indonesian thousands separator)
  return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function combineDateAndTime(date: Date, time?: string): Date {
  const timeStr = typeof time === "string" ? time : "";
  
  if (!timeStr || !timeStr.includes(":")) {
    return new Date(date);
  }
  try {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  } catch {
    return new Date(date);
  }
}

export function OfferEditor({
  id,
  application,
  job,
  candidateName,
  onSaveDraft,
  onSendOffer,
  isSavingDraft = false,
  isSendingOffer = false,
  currentOfferingId,
  currentOfferingStatus,
  offering,
}: OfferEditorProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<z.infer<
    typeof fileMetadataSchema
  > | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firestore = useFirestore();
  const storage = useStorage();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      responseDeadlineTime: getCurrentTimeString(),
      salary: "",
      startDate: "",
      contractDurationMonths: "",
      firstDayTime: "",
      firstDayLocation: "",
      hrContact: "",
      additionalNotes: "",
    },
  });

  const uploadDocument = async (
    fileOrMetadata: File | z.infer<typeof fileMetadataSchema>,
  ): Promise<string> => {
    if (fileOrMetadata instanceof File) {
      const storageRef = ref(
        storage,
        `offerings/${application.id}/${Date.now()}-${fileOrMetadata.name}`,
      );
      await uploadBytes(storageRef, fileOrMetadata);
      return getDownloadURL(storageRef);
    }
    return fileOrMetadata.url;
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      const metadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
      };
      setSelectedFile(file);
      setFilePreview(metadata);
      form.setValue("documentFile", file, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } else {
      setSelectedFile(null);
      setFilePreview(null);
      form.setValue("documentFile", null as any, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find((file) => file.type === "application/pdf");

    if (pdfFile) {
      handleFileSelect(pdfFile);
    } else {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please select a PDF file.",
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleFileSelect(file || null);
  };

  const previewPDF = () => {
    const url = selectedFile
      ? URL.createObjectURL(selectedFile)
      : filePreview?.url;

    if (url) {
      window.open(url, "_blank");
    }
  };

  const handleSaveDraft = async (data: OfferFormData) => {
    if (!userProfile) return;

    setIsUploading(true);
    try {
      const documentUrl = await uploadDocument(data.documentFile);

      const responseDeadline = combineDateAndTime(
        data.responseDeadline,
        data.responseDeadlineTime,
      );

      const offeringData = {
        applicationId: application.id!,
        candidateName,
        candidateEmail: application.candidateEmail,
        documentUrl,
        documentName: data.documentFile.name,
        documentType: data.documentFile.type,
        responseDeadline,
        status: "draft",
        offeringDetails: {
          salary: data.salary,
          startDate: data.startDate,
          firstDayTime: data.firstDayTime,
          firstDayLocation: data.firstDayLocation,
          hrContact: data.hrContact,
        },
        additionalNotes: data.additionalNotes,
        history: [
          {
            type: "draft_created",
            description: "Draft penawaran kerja dibuat",
            at: Date.now(),
            by: userProfile.uid,
          },
          {
            type: "document_uploaded",
            description: `Dokumen "${data.documentFile.name}" diunggah`,
            at: Date.now(),
            by: userProfile.uid,
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userProfile.uid,
      };

      // Save to offerings collection
      const docRef = await addDoc(
        collection(firestore, "offerings"),
        offeringData,
      );

      toast({
        title: "Draft Tersimpan",
        description: "Draft penawaran berhasil disimpan.",
      });

      // Call the original onSaveDraft if needed
      await onSaveDraft({ ...data, offeringId: docRef.id });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUndoSend = async (offeringId: string) => {
    if (!userProfile) return;

    try {
      setIsUndoing(true);
      const offeringRef = doc(firestore, "offerings", offeringId);
      await updateDocumentNonBlocking(offeringRef, {
        status: "draft",
        sentAt: null,
        sentBy: null,
        viewedAtFirst: null,
        viewedAtLast: null,
        viewCount: 0,
        history: [
          {
            type: "cancelled",
            description:
              "Pengiriman penawaran dibatalkan, kembali ke status draft",
            at: Date.now(),
            by: userProfile.uid,
          },
        ],
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Pengiriman Dibatalkan",
        description: "Penawaran telah dikembalikan ke status draft.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUndoing(false);
    }
  };

  const handleSendOffer = async (data: OfferFormData) => {
    if (!userProfile) return;

    setIsUploading(true);
    try {
      const documentUrl = await uploadDocument(data.documentFile);

      const responseDeadline = combineDateAndTime(
        data.responseDeadline,
        data.responseDeadlineTime,
      );

      const offeringData = {
        applicationId: application.id!,
        candidateName,
        candidateEmail: application.candidateEmail,
        documentUrl,
        documentName: data.documentFile.name,
        documentType: data.documentFile.type,
        responseDeadline,
        status: "sent",
        offeringDetails: {
          salary: data.salary,
          startDate: data.startDate,
          firstDayTime: data.firstDayTime,
          firstDayLocation: data.firstDayLocation,
          hrContact: data.hrContact,
        },
        additionalNotes: data.additionalNotes,
        sentAt: serverTimestamp(),
        sentBy: userProfile.uid,
        viewedAtFirst: null,
        viewedAtLast: null,
        viewCount: 0,
        respondedAt: null,
        responseType: null,
        history: [
          {
            type: "draft_created",
            description: "Draft penawaran kerja dibuat",
            at: Date.now(),
            by: userProfile.uid,
          },
          {
            type: "document_uploaded",
            description: `Dokumen "${data.documentFile.name}" diunggah`,
            at: Date.now(),
            by: userProfile.uid,
          },
          {
            type: "sent",
            description: "Penawaran kerja dikirim ke kandidat",
            at: Date.now(),
            by: userProfile.uid,
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userProfile.uid,
      };

      // Save to offerings collection
      const docRef = await addDoc(
        collection(firestore, "offerings"),
        offeringData,
      );

      // Generate link
      const offerLink = `${window.location.origin}/offer/${docRef.id}`;

      toast({
        title: "Penawaran Dikirim",
        description: `Link penawaran: ${offerLink}`,
      });

      // Call the original onSendOffer if needed
      await onSendOffer({ ...data, offeringId: docRef.id, offerLink });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Helper functions for activity history display
  const getActivityLabel = (type: string): string => {
    switch (type) {
      case "draft_created":
        return "Draft Dibuat";
      case "draft_updated":
        return "Draft Diperbarui";
      case "document_uploaded":
        return "Dokumen Diunggah";
      case "details_updated":
        return "Detail Penawaran Diubah";
      case "notes_updated":
        return "Catatan Diubah";
      case "deadline_updated":
        return "Batas Waktu Diubah";
      case "sent":
        return "Penawaran Dikirim";
      case "cancelled":
        return "Pengiriman Dibatalkan";
      case "viewed":
        return "Penawaran Dibuka";
      case "accepted":
        return "Penawaran Diterima";
      case "rejected":
        return "Penawaran Ditolak";
      case "expired":
        return "Penawaran Kedaluwarsa";
      default:
        return type;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "draft_created":
      case "draft_updated":
        return <FileText className="h-5 w-5 text-gray-500" />;
      case "document_uploaded":
        return <Upload className="h-5 w-5 text-blue-500" />;
      case "details_updated":
      case "notes_updated":
      case "deadline_updated":
        return <Calendar className="h-5 w-5 text-purple-500" />;
      case "sent":
        return <Send className="h-5 w-5 text-blue-600" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-orange-500" />;
      case "viewed":
        return <Eye className="h-5 w-5 text-yellow-500" />;
      case "accepted":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "rejected":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "expired":
        return <Clock className="h-5 w-5 text-gray-500" />;
      default:
        return <FileCheck className="h-5 w-5 text-gray-500" />;
    }
  };

  const getActivityColor = (type: string): string => {
    switch (type) {
      case "draft_created":
      case "draft_updated":
        return "text-gray-600";
      case "document_uploaded":
        return "text-blue-600";
      case "details_updated":
      case "deadline_updated":
        return "text-purple-600";
      case "notes_updated":
        return "text-indigo-600";
      case "sent":
        return "text-blue-600";
      case "cancelled":
        return "text-orange-600";
      case "viewed":
        return "text-yellow-600";
      case "accepted":
        return "text-green-600";
      case "rejected":
        return "text-red-600";
      case "expired":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <Form {...form}>
      <div className="space-y-6">
        {/* Document Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Dokumen Penawaran Resmi
            </CardTitle>
            <CardDescription>
              Upload dokumen penawaran kerja yang sudah final. Ini akan menjadi
              dokumen utama yang diterima kandidat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="documentFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>File Dokumen *</FormLabel>
                  <FormControl>
                    <div className="space-y-4">
                      {/* Drag & Drop Area */}
                      <div
                        className={cn(
                          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                          isDragOver
                            ? "border-primary bg-primary/10"
                            : selectedFile
                              ? "border-primary/50 bg-primary/5"
                              : "border-muted-foreground/30 hover:border-muted-foreground/50",
                        )}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={handleFileInputChange}
                          className="hidden"
                        />

                        {selectedFile || filePreview ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <FileText className="h-8 w-8" />
                              <span className="font-medium">PDF Selected</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <p className="font-medium">
                                {selectedFile?.name ?? filePreview?.name}
                              </p>
                              <p>
                                {(
                                  ((selectedFile?.size ?? filePreview?.size) ||
                                    0) /
                                  1024 /
                                  1024
                                ).toFixed(2)}{" "}
                                MB
                              </p>
                            </div>
                            <div className="flex gap-2 justify-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  previewPDF();
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFileSelect(null);
                                }}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                Seret file ke sini atau klik untuk memilih file
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Hanya mendukung file dokumen (PDF, Word, DOCX)
                                dan gambar (JPG, PNG)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Detail Penawaran Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Detail Penawaran
            </CardTitle>
            <CardDescription>
              Ringkasan singkat informasi utama penawaran. Detail lengkap
              tersedia di dokumen penawaran.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gaji yang Ditawarkan */}
              <FormField
                control={form.control}
                name="salary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Gaji yang Ditawarkan
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center border rounded-md bg-background">
                        <span className="px-3 py-2 text-sm font-medium text-muted-foreground">
                          Rp
                        </span>
                        <Input
                          placeholder="1.000.000"
                          {...field}
                          onChange={(e) => {
                            const formatted = formatNumberIDR(e.target.value);
                            field.onChange(formatted);
                          }}
                          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tanggal Mulai */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Tanggal Mulai
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Durasi Kontrak (bulan) */}
              <FormField
                control={form.control}
                name="contractDurationMonths"
                render={({ field }) => {
                  const startDate = form.watch("startDate");
                  const duration = parseInt(field.value || "0");
                  let endDateText = "";
                  
                  const startDateStr = typeof startDate === "string" ? startDate : "";

                  if (
                    startDateStr &&
                    startDateStr.includes("-") &&
                    duration > 0
                  ) {
                    try {
                      // Parse ISO date string (YYYY-MM-DD) to avoid timezone issues
                      const [year, month, day] = startDateStr
                        .split("-")
                        .map(Number);
                      const start = new Date(year, month - 1, day);

                      // Calculate end date by adding months
                      const end = new Date(
                        start.getFullYear(),
                        start.getMonth() + duration,
                        start.getDate(),
                      );

                      // Validate the date is valid
                      if (!isNaN(end.getTime())) {
                        const formatter = new Intl.DateTimeFormat("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        });
                        endDateText = formatter.format(end);
                      }
                    } catch (error) {
                      // Silent fail - invalid date format
                    }
                  }

                  return (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Durasi Kontrak (bulan)
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            placeholder="12"
                            {...field}
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {field.value ? "bulan" : ""}
                          </span>
                        </div>
                      </FormControl>
                      {endDateText && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Berakhir pada:{" "}
                          <span className="font-semibold">{endDateText}</span>
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Jam Masuk Hari Pertama */}
              <FormField
                control={form.control}
                name="firstDayTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Jam Masuk Hari Pertama (HH:mm)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        step="60"
                        placeholder="08:00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Lokasi Hari Pertama */}
              <FormField
                control={form.control}
                name="firstDayLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Lokasi Hari Pertama
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="contoh: Kantor Pusat, Jakarta"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Kontak HRD */}
              <FormField
                control={form.control}
                name="hrContact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Kontak HRD
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., John Doe - HR Manager (08123456789)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Additional Notes Section */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
            <CardDescription>
              Rich text information for candidates about company policies,
              benefits, dress code, onboarding process, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="additionalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catatan Tambahan</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Add information about:
• Company policies and regulations
• Benefits and compensation details
• Dress code and work attire
• First day procedures and requirements
• Onboarding process
• Contact information
• Any other relevant information"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Response Deadline Section */}
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Respons</CardTitle>
            <CardDescription>
              Tentukan batas waktu kandidat untuk memberikan respons. Penawaran
              akan otomatis kedaluwarsa jika tidak ada respons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <FormField
                control={form.control}
                name="responseDeadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batas Waktu Respons *</FormLabel>
                    <FormControl>
                      <GoogleDatePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Pilih batas waktu"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responseDeadlineTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jam Batas Respons *</FormLabel>
                    <FormControl>
                      <Input type="time" step="60" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(() => {})} className="space-y-4">
              <div className="flex gap-4 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={form.handleSubmit(handleSaveDraft)}
                  disabled={isSavingDraft || isUploading}
                  className="flex-1 min-w-[150px]"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSavingDraft || isUploading
                    ? "Menyimpan..."
                    : "Simpan Draft"}
                </Button>

                <Button
                  type="button"
                  onClick={form.handleSubmit(handleSendOffer)}
                  disabled={isSendingOffer || isUploading}
                  className="flex-1 min-w-[150px]"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isSendingOffer || isUploading
                    ? "Mengirim..."
                    : "Kirim Penawaran"}
                </Button>

                {currentOfferingStatus === "sent" && currentOfferingId && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleUndoSend(currentOfferingId)}
                    disabled={isUndoing}
                    className="flex-1 min-w-[150px]"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {isUndoing ? "Menarik..." : "Tarik Penawaran"}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Aktivitas Terakhir (Compact) */}
        {offering?.history && offering.history.length > 0 && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-muted-foreground/10">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Aktivitas Terakhir</h3>
              <span className="text-xs text-muted-foreground ml-auto">
                {offering.history.length} aktivitas
              </span>
            </div>
            <div className="space-y-2">
              {offering.history
                .slice(-5)
                .reverse()
                .map((activity, index) => {
                  const activityDate = activity.at
                    ? new Date(
                        (activity.at as any).seconds
                          ? (activity.at as any).seconds * 1000
                          : (activity.at as any),
                      )
                    : new Date();
                  const timeAgo = (() => {
                    const now = new Date();
                    const diffMs = now.getTime() - activityDate.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);

                    if (diffMins < 1) return "Baru saja";
                    if (diffMins < 60) return `${diffMins}m lalu`;
                    if (diffHours < 24) return `${diffHours}j lalu`;
                    return `${diffDays}h lalu`;
                  })();

                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-sm pb-2 border-b border-muted-foreground/5 last:border-0 last:pb-0"
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-medium ${getActivityColor(activity.type)}`}
                        >
                          {getActivityLabel(activity.type)}
                        </p>
                        {activity.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {activity.description}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap ml-2">
                        {timeAgo}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </Form>
  );
}
