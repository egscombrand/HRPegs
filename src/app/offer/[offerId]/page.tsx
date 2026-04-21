"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDoc, useFirestore, updateDocumentNonBlocking } from "@/firebase";
import { doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import type { Offering, JobApplication } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import SafeRichText from "@/components/ui/SafeRichText";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Download,
  Clock,
  DollarSign,
  Calendar,
  MapPin,
  User,
  Eye,
  Activity,
  FileText,
  Send,
  EyeOff,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function OfferPage() {
  const params = useParams();
  const offerId = params.offerId as string;
  const firestore = useFirestore();
  const { toast } = useToast();

  const offeringRef = doc(firestore, "offerings", offerId);
  const { data: offering, isLoading: isLoadingOffering } =
    useDoc<Offering>(offeringRef);

  // Get application data to check if this is the current offering
  const applicationRef = offering
    ? doc(firestore, "applications", offering.applicationId)
    : null;
  const { data: application, isLoading: isLoadingApplication } =
    useDoc<JobApplication>(applicationRef);

  const isLoading = isLoadingOffering || isLoadingApplication;

  // Check if this offering is valid for the candidate to view
  const isValidOffering =
    offering &&
    application &&
    offering.id === application.currentOfferingId &&
    offering.isActive === true;

  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [question, setQuestion] = useState("");
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const { userProfile } = useAuth();

  useEffect(() => {
    if (offering && isValidOffering) {
      // Check if offering is active - if not, don't proceed with any updates
      if (!offering.isActive) {
        return;
      }

      const now = new Date();
      const deadline = offering.responseDeadline.toDate();
      const isExpired = deadline < now;

      // Auto-expire if deadline passed and status is not final
      if (
        isExpired &&
        !["accepted", "rejected", "expired"].includes(offering.status)
      ) {
        updateDocumentNonBlocking(offeringRef, {
          status: "expired",
          history: [
            ...(offering.history || []),
            {
              type: "expired",
              description:
                "Penawaran kedaluwarsa (batas waktu respons terlewat)",
              at: Timestamp.now(),
            },
          ],
          updatedAt: serverTimestamp(),
        });
      } else if (offering.status === "sent") {
        // Mark as viewed and update tracking
        const currentViewCount = (offering.viewCount || 0) + 1;
        const viewTimestamp = serverTimestamp();

        updateDocumentNonBlocking(offeringRef, {
          status: "viewed",
          viewedAtFirst: offering.viewedAtFirst || viewTimestamp,
          viewedAtLast: viewTimestamp,
          viewCount: currentViewCount,
          history: [
            ...(offering.history || []),
            {
              type: "viewed",
              description: `Penawaran dibuka (${currentViewCount}x dibuka)`,
              at: Timestamp.now(),
            },
          ],
          updatedAt: viewTimestamp,
        });
      }
    }
  }, [offering, offeringRef]);

  const handleAccept = async () => {
    if (!offering) return;
    setIsAccepting(true);
    try {
      await updateDocumentNonBlocking(offeringRef, {
        status: "accepted",
        respondedAt: serverTimestamp(),
        responseType: "accepted",
        history: [
          ...(offering.history || []),
          {
            type: "accepted",
            description: "Penawaran diterima oleh kandidat",
            at: Timestamp.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });

      if (applicationRef) {
        await updateDocumentNonBlocking(applicationRef, {
          offerStatus: "accepted",
          candidateOfferDecisionAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      toast({
        title: "Penawaran Diterima",
        description:
          "Terima kasih telah menerima penawaran. HR akan segera menghubungi Anda.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!offering || !rejectionReason.trim()) return;
    setIsRejecting(true);
    try {
      await updateDocumentNonBlocking(offeringRef, {
        status: "rejected",
        respondedAt: serverTimestamp(),
        responseType: "rejected",
        history: [
          ...(offering.history || []),
          {
            type: "rejected",
            description: "Penawaran ditolak oleh kandidat",
            at: Timestamp.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });

      if (applicationRef) {
        await updateDocumentNonBlocking(applicationRef, {
          status: "rejected",
          offerStatus: "rejected",
          offerRejectionReason: rejectionReason.trim(),
          candidateOfferDecisionAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      toast({
        title: "Penawaran Ditolak",
        description: "Keputusan Anda telah dicatat.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsRejecting(false);
      setRejectionReason("");
    }
  };

  const handleAskQuestion = async () => {
    if (!offering || !question.trim()) return;
    setIsSubmittingQuestion(true);
    try {
      await updateDocumentNonBlocking(offeringRef, {
        interactions: [
          ...((offering as any).interactions || []),
          {
            type: "question",
            message: question,
            timestamp: Timestamp.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });
      toast({
        title: "Question Sent",
        description: "Your question has been sent to HR.",
      });
      setQuestion("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleHideOffering = async () => {
    if (!offering || !userProfile) return;
    setIsHiding(true);
    try {
      const userRef = doc(firestore, "users", userProfile.uid);
      const hiddenIds = userProfile.hiddenOfferingIds || [];

      // Only add if not already in the list
      if (!hiddenIds.includes(offerId)) {
        hiddenIds.push(offerId);
      }

      await updateDoc(userRef, {
        hiddenOfferingIds: hiddenIds,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Offering Disembunyikan",
        description: "Penawaran ini telah disembunyikan dari tampilan Anda.",
      });

      // Redirect after hiding
      setTimeout(() => {
        window.location.href = "/careers/portal/applications";
      }, 1000);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyembunyikan",
        description: error.message,
      });
    } finally {
      setIsHiding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!offering) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Offering not found or expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValidOffering) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Penawaran ini sudah tidak berlaku. Silakan periksa penawaran
              terbaru Anda.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!offering.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Saat ini belum ada penawaran kerja aktif.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userProfile?.hiddenOfferingIds?.includes(offerId)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Penawaran ini telah Anda sembunyikan. Hubungi HRD jika Anda ingin
              membuka kembali.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = offering.responseDeadline.toDate() < new Date();
  const statusColors: Record<string, string> = {
    draft: "bg-gray-500",
    sent: "bg-blue-500",
    viewed: "bg-yellow-500",
    responded: "bg-purple-500",
    accepted: "bg-green-500",
    rejected: "bg-red-500",
    withdrawn: "bg-orange-500",
    expired: "bg-gray-500",
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "draft_created":
      case "draft_updated":
        return <FileText className="h-4 w-4" />;
      case "document_uploaded":
        return <Download className="h-4 w-4" />;
      case "details_updated":
      case "deadline_updated":
        return <Clock className="h-4 w-4" />;
      case "notes_updated":
        return <MessageSquare className="h-4 w-4" />;
      case "sent":
        return <Send className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      case "viewed":
        return <Eye className="h-4 w-4" />;
      case "accepted":
        return <CheckCircle className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "expired":
        return <Clock className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Job Offer</CardTitle>
                <Badge
                  className={`${statusColors[offering.status]} text-white`}
                >
                  {offering.status.toUpperCase()}
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">{offering.candidateName}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Deadline:{" "}
                    {format(
                      offering.responseDeadline.toDate(),
                      "dd MMM yyyy HH:mm",
                      { locale: idLocale },
                    )}
                  </span>
                  {offering.viewCount && offering.viewCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      Viewed {offering.viewCount} time
                      {offering.viewCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {isExpired && <Badge variant="destructive">EXPIRED</Badge>}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Offering Details */}
          {offering.offeringDetails && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Offer Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {offering.offeringDetails.salary && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Salary</p>
                        <p className="text-sm text-muted-foreground">
                          {offering.offeringDetails.salary}
                        </p>
                      </div>
                    </div>
                  )}

                  {offering.offeringDetails.startDate && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium">Start Date</p>
                        <p className="text-sm text-muted-foreground">
                          {format(
                            new Date(offering.offeringDetails.startDate),
                            "dd MMMM yyyy",
                            { locale: idLocale },
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {offering.offeringDetails.firstDayTime && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <Clock className="h-5 w-5 text-orange-600" />
                      <div>
                        <p className="text-sm font-medium">First Day Time</p>
                        <p className="text-sm text-muted-foreground">
                          {offering.offeringDetails.firstDayTime}
                        </p>
                      </div>
                    </div>
                  )}

                  {offering.offeringDetails.firstDayLocation && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <MapPin className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="text-sm font-medium">
                          First Day Location
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {offering.offeringDetails.firstDayLocation}
                        </p>
                      </div>
                    </div>
                  )}

                  {offering.offeringDetails.hrContact && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg md:col-span-2">
                      <User className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="text-sm font-medium">HR Contact</p>
                        <p className="text-sm text-muted-foreground">
                          {offering.offeringDetails.hrContact}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* PDF Viewer */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Official Offer Letter</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={offering.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Dokumen
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[600px] border rounded-lg overflow-hidden">
                <iframe
                  src={offering.documentUrl}
                  className="w-full h-full"
                  title="Dokumen Penawaran"
                />
              </div>
            </CardContent>
          </Card>

          {/* Additional Notes */}
          {offering.additionalNotes && (
            <Card>
              <CardHeader>
                <CardTitle>Informasi Tambahan</CardTitle>
              </CardHeader>
              <CardContent>
                <SafeRichText html={offering.additionalNotes} />
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          {offering.history && offering.history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Riwayat Aktivitas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {offering.history
                    .sort((a, b) => b.at.toMillis() - a.at.toMillis())
                    .map((activity, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div
                          className={`mt-1 ${getActivityColor(activity.type)}`}
                        >
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {getActivityLabel(activity.type)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(
                                activity.at.toDate(),
                                "dd MMM yyyy HH:mm",
                                { locale: idLocale },
                              )}
                            </span>
                          </div>
                          {activity.description && (
                            <p className="text-sm text-muted-foreground">
                              {activity.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {!isExpired &&
            offering.status !== "accepted" &&
            offering.status !== "rejected" && (
              <Card>
                <CardHeader>
                  <CardTitle>Respons Anda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-4">
                      <Button
                        onClick={handleAccept}
                        disabled={isAccepting}
                        className="flex-1"
                        size="lg"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {isAccepting ? "Menerima..." : "Terima Penawaran"}
                      </Button>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            size="lg"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Tolak Penawaran
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tolak Penawaran</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Textarea
                              placeholder="Berikan alasan penolakan (opsional)"
                              value={rejectionReason}
                              onChange={(e: any) =>
                                setRejectionReason(e.target.value)
                              }
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={handleReject}
                                disabled={
                                  isRejecting || !rejectionReason.trim()
                                }
                                variant="destructive"
                                className="flex-1"
                              >
                                {isRejecting
                                  ? "Menolak..."
                                  : "Konfirmasi Penolakan"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <Button
                      onClick={handleHideOffering}
                      disabled={isHiding}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <EyeOff className="h-4 w-4 mr-2" />
                      {isHiding
                        ? "Menyembunyikan..."
                        : "Sembunyikan Offering Ini"}
                    </Button>
                  </div>

                  <Separator />

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Ajukan Pertanyaan
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Ajukan Pertanyaan</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Textarea
                          placeholder="Ketik pertanyaan Anda di sini..."
                          value={question}
                          onChange={(e: any) => setQuestion(e.target.value)}
                        />
                        <Button
                          onClick={handleAskQuestion}
                          disabled={isSubmittingQuestion || !question.trim()}
                          className="w-full"
                        >
                          {isSubmittingQuestion
                            ? "Mengirim..."
                            : "Kirim Pertanyaan"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            )}

          {/* Status Message */}
          {offering.status === "accepted" && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <p className="font-medium">You have accepted this offer.</p>
                </div>
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                  HR will contact you soon with next steps.
                </p>
              </CardContent>
            </Card>
          )}

          {offering.status === "rejected" && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <XCircle className="h-5 w-5" />
                  <p className="font-medium">You have rejected this offer.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {isExpired && (
            <Card className="border-gray-200 bg-gray-50 dark:bg-gray-950/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-400">
                  <Clock className="h-5 w-5" />
                  <p className="font-medium">This offer has expired.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
