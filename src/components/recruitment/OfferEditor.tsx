"use client";

import { useEffect, useState, useRef } from "react";
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
  Trash2,
} from "lucide-react";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  writeBatch,
  updateDoc,
  deleteDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirestore, useStorage } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updateDocumentNonBlocking } from "@/firebase";

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  allOfferings?: Offering[];
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
  allOfferings = [],
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

  useEffect(() => {
    if (!offering) return;

    const documentMetadata = {
      url: offering.documentUrl,
      name: offering.documentName || "Penawaran Kandidat",
      size: 0,
      type: offering.documentType || "application/pdf",
    };

    const deadlineDate = offering.responseDeadline?.toDate
      ? offering.responseDeadline.toDate()
      : new Date();
    const deadlineTime = `${String(deadlineDate.getHours()).padStart(
      2,
      "0",
    )}:${String(deadlineDate.getMinutes()).padStart(2, "0")}`;

    setSelectedFile(null);
    setFilePreview(documentMetadata);
    form.reset({
      documentFile: documentMetadata,
      responseDeadline: deadlineDate,
      responseDeadlineTime: deadlineTime,
      salary: offering.offeringDetails?.salary ?? "",
      startDate: offering.offeringDetails?.startDate ?? "",
      contractDurationMonths:
        offering.offeringDetails?.contractDurationMonths ?? "",
      firstDayTime: offering.offeringDetails?.firstDayTime ?? "",
      firstDayLocation: offering.offeringDetails?.firstDayLocation ?? "",
      hrContact: offering.offeringDetails?.hrContact ?? "",
      additionalNotes: offering.additionalNotes ?? "",
    });
  }, [offering, form]);

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

      const offeringPayload = {
        applicationId: application.id!,
        candidateName,
        candidateEmail: application.candidateEmail,
        documentUrl,
        documentName: data.documentFile.name,
        documentType: data.documentFile.type,
        responseDeadline,
        status: "draft" as const,
        isActive: true, // Always active if it's the current draft being edited
        offeringDetails: {
          salary: data.salary,
          startDate: data.startDate,
          contractDurationMonths: data.contractDurationMonths,
          firstDayTime: data.firstDayTime,
          firstDayLocation: data.firstDayLocation,
          hrContact: data.hrContact,
        },
        additionalNotes: data.additionalNotes,
        updatedAt: serverTimestamp(),
        candidateUid: application.candidateUid, // Critical for security rules
      };

      const batch = writeBatch(firestore);

      // 1. Deactivate ALL other offerings for this application
      const otherOfferings =
        allOfferings?.filter((o) => o.id !== offering?.id) || [];
      otherOfferings.forEach((o) => {
        if (o.id && o.isActive) {
          const oRef = doc(firestore, "offerings", o.id);
          batch.update(oRef, { isActive: false, updatedAt: serverTimestamp() });
        }
      });

      let finalOfferingId = offering?.id;

      // 2. Prepare/Update the offering document
      if (offering?.id) {
        const offeringRef = doc(firestore, "offerings", offering.id);
        batch.update(offeringRef, {
          ...offeringPayload,
          candidateUid: application.candidateUid,
          applicationId: application.id!,
          candidateEmail: application.candidateEmail,
          status: offeringPayload.status,
          isActive: offeringPayload.isActive,
          history: [
            ...(offering.history || []),
            {
              type: "draft_updated",
              description: "Draft penawaran kerja disimpan",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
        });
      } else {
        const newOfferingRef = doc(collection(firestore, "offerings"));
        finalOfferingId = newOfferingRef.id;
        batch.set(newOfferingRef, {
          ...offeringPayload,
          history: [
            {
              type: "draft_created",
              description: "Draft penawaran kerja dibuat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
            {
              type: "document_uploaded",
              description: `Dokumen "${data.documentFile.name}" diunggah`,
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
        });
      }

      // 3. ATOMICALLY update the application pointer and status
      const appRef = doc(firestore, "applications", application.id!);
      batch.update(appRef, {
        activeOfferingId: finalOfferingId,
        currentOfferingId: finalOfferingId, // Backward compatibility
        offerStatus: "draft" as const,
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(new Date(responseDeadline))
          : null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      toast({
        title: "Draft Tersimpan",
        description: "Draft penawaran berhasil disimpan.",
      });

      await onSaveDraft({ ...data, offeringId: finalOfferingId });
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

  const handleWithdrawOffer = async (offeringId: string) => {
    if (!userProfile) return;

    try {
      setIsUndoing(true); // Using isUndoing for loading state
      const offeringRef = doc(firestore, "offerings", offeringId);
      // Batch update to keep offering and application in sync
      const batch = writeBatch(firestore);

      batch.update(offeringRef, {
        status: "withdrawn",
        isActive: false,
        withdrawnAt: serverTimestamp(),
        withdrawnBy: userProfile.uid,
        history: [
          ...(allOfferings?.find((o) => o.id === offeringId)?.history || []),
          {
            type: "withdrawn",
            description: "Penawaran kerja ditarik oleh HRD",
            at: Timestamp.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });

      // Reset offering fields in application document to prevent ghost offerings
      const appRef = doc(firestore, "applications", application.id!);
      batch.update(appRef, {
        offerStatus: deleteField(),
        offeredSalary: null,
        contractStartDate: null,
        contractDurationMonths: null,
        probationDurationMonths: null,
        offerNotes: null,
        offerDescription: null,
        activeOfferingId: null,
        currentOfferingId: null,
        finalOfferingUrl: null,
        offerSentAt: null,
        offerViewedAt: null,
        offerSections: deleteField(),
        contractEndDate: null,
        workDays: null,
        responseDeadline: null,
        offerRejectionReason: null,
        candidateOfferDecisionAt: null,
        // Also revert status if currently in offered/offering stage
        status:
          application.status === "offered" ? "interview" : application.status,
      });

      await batch.commit();

      toast({
        title: "Penawaran Ditarik",
        description:
          "Penawaran telah dinonaktifkan dan tidak lagi tampil di kandidat.",
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

  const handleDeleteOffering = async (offeringId: string) => {
    if (!userProfile) return;

    try {
      setIsUndoing(true);
      const offeringRef = doc(firestore, "offerings", offeringId);

      const batch = writeBatch(firestore);
      batch.delete(offeringRef);

      // If this was the current offering, reset the application fields
      if (application.currentOfferingId === offeringId) {
        const appRef = doc(firestore, "applications", application.id!);
        batch.update(appRef, {
          offerStatus: deleteField(),
          offeredSalary: null,
          contractStartDate: null,
          contractDurationMonths: null,
          probationDurationMonths: null,
          offerNotes: null,
          offerDescription: null,
          activeOfferingId: null,
          currentOfferingId: null,
          finalOfferingUrl: null,
          offerSentAt: null,
          offerViewedAt: null,
          offerSections: deleteField(),
          contractEndDate: null,
          workDays: null,
          responseDeadline: null,
          offerRejectionReason: null,
          candidateOfferDecisionAt: null,
          status:
            application.status === "offered" ? "interview" : application.status,
        });
      }

      await batch.commit();

      toast({
        title: "Riwayat Dihapus",
        description: "Dokumen penawaran telah dihapus secara permanen.",
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

      const offeringPayload = {
        applicationId: application.id!,
        candidateName,
        candidateEmail: application.candidateEmail,
        documentUrl,
        documentName: data.documentFile.name,
        documentType: data.documentFile.type,
        responseDeadline,
        status: "sent" as const,
        isActive: true,
        offeringDetails: {
          salary: data.salary,
          startDate: data.startDate,
          contractDurationMonths: data.contractDurationMonths,
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
        updatedAt: serverTimestamp(),
        candidateUid: application.candidateUid, // Critical for security rules
      };

      const batch = writeBatch(firestore);

      // 1. Deactivate ALL other offerings for this application
      const otherOfferings =
        allOfferings?.filter((o) => o.id !== offering?.id) || [];
      otherOfferings.forEach((o) => {
        if (o.id && o.isActive) {
          const oRef = doc(firestore, "offerings", o.id);
          batch.update(oRef, {
            isActive: false,
            status:
              o.status === "sent" || o.status === "viewed"
                ? "withdrawn"
                : o.status,
            updatedAt: serverTimestamp(),
          });
        }
      });

      let finalOfferingId = offering?.id;

      // 2. Prepare/Update the offering document
      if (offering?.id) {
        const offeringRef = doc(firestore, "offerings", offering.id);
        batch.update(offeringRef, {
          ...offeringPayload,
          candidateUid: application.candidateUid,
          applicationId: application.id!,
          candidateEmail: application.candidateEmail,
          status: offeringPayload.status,
          isActive: offeringPayload.isActive,
          history: [
            ...(offering?.history || []),
            {
              type: "sent",
              description: "Penawaran kerja dikirim ke kandidat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
        });
      } else {
        const newOfferingRef = doc(collection(firestore, "offerings"));
        finalOfferingId = newOfferingRef.id;
        batch.set(newOfferingRef, {
          ...offeringPayload,
          history: [
            {
              type: "draft_created",
              description: "Draft penawaran kerja dibuat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
            {
              type: "document_uploaded",
              description: `Dokumen "${data.documentFile.name}" diunggah`,
              at: Timestamp.now(),
              by: userProfile.uid,
            },
            {
              type: "sent",
              description: "Penawaran kerja dikirim ke kandidat",
              at: Timestamp.now(),
              by: userProfile.uid,
            },
          ],
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
        });
      }

      // 3. ATOMICALLY update the application status and pointer
      const appRef = doc(firestore, "applications", application.id!);
      const timelineEvent = {
        type: "offered" as const,
        status: "offered" as const,
        description: "Penawaran kerja telah dikirim",
        at: Timestamp.now(),
        by: userProfile.uid,
      };

      batch.update(appRef, {
        status: "offered" as const,
        offerStatus: "sent" as const,
        activeOfferingId: finalOfferingId,
        currentOfferingId: finalOfferingId, // Backward compatibility
        responseDeadline: responseDeadline
          ? Timestamp.fromDate(new Date(responseDeadline))
          : null,
        offerSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      });

      await batch.commit();

      const offerLink = `${window.location.origin}/offer/${finalOfferingId}`;

      toast({
        title: "Penawaran Dikirim",
        description: `Link penawaran: ${offerLink}`,
      });

      await onSendOffer({ ...data, offeringId: finalOfferingId, offerLink });
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

                  const startDateStr =
                    typeof startDate === "string" ? startDate : "";

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

                {(currentOfferingStatus === "sent" ||
                  currentOfferingStatus === "viewed") &&
                  currentOfferingId && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleWithdrawOffer(currentOfferingId)}
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

        {/* Offering List Section (Active and History) */}
        {allOfferings && allOfferings.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b pb-2">
              <FileCheck className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold">Semua Penawaran (Audit Log)</h3>
            </div>

            {/* SECTION 1: OFFERING AKTIF */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Offering Aktif
                </h4>
                <Badge
                  variant="outline"
                  className="bg-green-50/50 text-green-700 border-green-200"
                >
                  {allOfferings.filter((o: Offering) => o.isActive).length}{" "}
                  Aktif
                </Badge>
              </div>

              <div className="grid gap-4">
                {allOfferings
                  .filter((o: Offering) => o.isActive)
                  .map((offeringItem: Offering) => (
                    <OfferingAuditCard
                      key={offeringItem.id}
                      offering={offeringItem}
                      isActive
                    />
                  ))}
                {allOfferings.filter((o: Offering) => o.isActive).length ===
                  0 && (
                  <p className="text-sm text-muted-foreground italic p-4 border border-dashed rounded-md text-center">
                    Tidak ada penawaran aktif saat ini.
                  </p>
                )}
              </div>
            </div>

            {/* SECTION 2: RIWAYAT OFFERING */}
            <div className="space-y-4 pt-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <RotateCcw className="h-3 w-3" />
                Riwayat Offering / Nonaktif
              </h4>
              <div className="grid gap-4">
                {allOfferings
                  .filter((o: Offering) => !o.isActive)
                  .sort((a: Offering, b: Offering) => {
                    const dateA = a.updatedAt?.toDate?.() || new Date(0);
                    const dateB = b.updatedAt?.toDate?.() || new Date(0);
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((offeringItem: Offering) => (
                    <OfferingAuditCard
                      key={offeringItem.id}
                      offering={offeringItem}
                      onDelete={() => handleDeleteOffering(offeringItem.id!)}
                    />
                  ))}
                {allOfferings.filter((o: Offering) => !o.isActive).length ===
                  0 && (
                  <p className="text-sm text-muted-foreground italic">
                    Belum ada riwayat penawaran lainnya.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Form>
  );
}

interface OfferingAuditCardProps {
  offering: Offering;
  isActive?: boolean;
  onDelete?: () => void;
}

function OfferingAuditCard({
  offering,
  isActive = false,
  onDelete,
}: OfferingAuditCardProps) {
  const formatDate = (ts: any) => {
    if (!ts) return "-";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="outline" className="bg-gray-100">
            Draft
          </Badge>
        );
      case "sent":
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-700 border-blue-200"
          >
            Dikirim
          </Badge>
        );
      case "viewed":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-100 text-yellow-700 border-yellow-200"
          >
            Dilihat
          </Badge>
        );
      case "accepted":
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-700 border-green-200"
          >
            Diterima
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-700 border-red-200"
          >
            Ditolak
          </Badge>
        );
      case "withdrawn":
        return (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-700 border-orange-200"
          >
            Ditarik
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-gray-200 text-gray-700">
            Kedaluwarsa
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all border-l-4",
        isActive
          ? "border-l-green-500 shadow-sm"
          : "border-l-muted opacity-80 grayscale-[0.3]",
      )}
    >
      <CardHeader className="py-3 px-4 bg-muted/20">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                {offering.documentName || "Penawaran Kerja"}
                {getStatusBadge(offering.status)}
              </CardTitle>
              <CardDescription className="text-xs truncate max-w-[200px]">
                ID: {offering.id}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => window.open(offering.documentUrl, "_blank")}
            >
              <Eye className="h-3 w-3" />
              Lihat File
            </Button>

            {onDelete && !isActive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus Riwayat Offering?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini tidak dapat dibatalkan. Dokumen penawaran "
                      {offering.documentName}" akan dihapus secara permanen dari
                      sistem.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      Hapus Permanen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TimelineInfo
            label="Dibuat"
            value={formatDate(offering.createdAt)}
            icon={<Calendar className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Dikirim"
            value={formatDate(offering.sentAt)}
            icon={<Send className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Pertama Dibuka"
            value={formatDate(offering.viewedAtFirst)}
            icon={<Eye className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Terakhir Dibuka"
            value={formatDate(offering.viewedAtLast)}
            icon={<Clock className="h-3 w-3" />}
          />

          <TimelineInfo
            label="Total Dibuka"
            value={offering.viewCount?.toString() || "0"}
            icon={<Eye className="h-3 w-3" />}
          />
          <TimelineInfo
            label="Respons"
            value={
              offering.respondedAt ? formatDate(offering.respondedAt) : "-"
            }
            subValue={
              offering.responseType === "accepted"
                ? "Diterima"
                : offering.responseType === "rejected"
                  ? "Ditolak"
                  : undefined
            }
            icon={<CheckCircle className="h-3 w-3" />}
          />
          {offering.withdrawnAt && (
            <TimelineInfo
              label="Ditarik"
              value={formatDate(offering.withdrawnAt)}
              icon={<XCircle className="h-3 w-3 text-red-500" />}
            />
          )}
          {offering.expiredAt && (
            <TimelineInfo
              label="Kedaluwarsa"
              value={formatDate(offering.expiredAt)}
              icon={<AlertCircle className="h-3 w-3" />}
            />
          )}
        </div>

        {offering.history && offering.history.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h5 className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Timeline Audit
            </h5>
            <div className="flex flex-wrap gap-2">
              {offering.history.slice(0, 8).map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded border border-muted-foreground/10"
                  title={h.description}
                >
                  <span className="font-bold">
                    {format(
                      h.at.toDate ? h.at.toDate() : new Date(h.at as any),
                      "HH:mm",
                    )}
                  </span>
                  <span className="text-muted-foreground">{h.type}</span>
                </div>
              ))}
              {offering.history.length > 8 && (
                <span className="text-[10px] text-muted-foreground">
                  +{offering.history.length - 8} lainnya
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineInfo({
  label,
  value,
  subValue,
  icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-xs font-medium leading-none">{value}</p>
      {subValue && (
        <Badge variant="secondary" className="text-[9px] h-4 py-0 px-1 mt-1">
          {subValue}
        </Badge>
      )}
    </div>
  );
}
