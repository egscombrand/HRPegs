"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import {
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  generateOfferingPDFBlob,
  buildOfferingHtml,
} from "@/lib/recruitment/pdf-generator";
import type {
  JobApplication,
  Profile,
  Job,
  ApplicationTimelineEvent,
  ApplicationInterview,
  UserProfile,
  Offering,
} from "@/lib/types";
import { useCollection } from "@/firebase";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, XCircle, CheckCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { MENU_CONFIG } from "@/lib/menu-config";
import { ProfileView } from "@/components/recruitment/ProfileView";
import {
  ApplicationStatusBadge,
  statusDisplayLabels,
} from "@/components/recruitment/ApplicationStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ApplicationProgressStepper } from "@/components/recruitment/ApplicationProgressStepper";
import { CandidateDocumentsCard } from "@/components/recruitment/CandidateDocumentsCard";
import { CandidateFitAnalysis } from "@/components/recruitment/CandidateFitAnalysis";
import { ApplicationActionBar } from "./ApplicationActionBar";
import { ApplicationNotes } from "./ApplicationNotes";
import { OfferEditor, type OfferFormData } from "./OfferEditor";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;
  const [hasTriggeredAutoScreen, setHasTriggeredAutoScreen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const applicationRef = useMemoFirebase(
    () =>
      applicationId ? doc(firestore, "applications", applicationId) : null,
    [firestore, applicationId],
  );
  const {
    data: application,
    isLoading: isLoadingApp,
    mutate: mutateApplication,
  } = useDoc<JobApplication>(applicationRef);

  const profileRef = useMemoFirebase(
    () =>
      application ? doc(firestore, "profiles", application.candidateUid) : null,
    [firestore, application],
  );
  const { data: profile, isLoading: isLoadingProfile } =
    useDoc<Profile>(profileRef);

  const jobRef = useMemoFirebase(
    () => (application ? doc(firestore, "jobs", application.jobId) : null),
    [firestore, application],
  );
  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobRef);

  const offeringsQuery = useMemoFirebase(
    () =>
      applicationId
        ? query(
            collection(firestore, "offerings"),
            where("applicationId", "==", applicationId),
          )
        : null,
    [firestore, applicationId],
  );
  const { data: offerings, isLoading: isLoadingOfferings } = useCollection<
    Offering
  >(offeringsQuery);

  const activeOffering = useMemo(() => {
    return offerings?.find((o) => o.isActive && o.status !== "draft") || 
           offerings?.find((o) => o.isActive) || 
           offerings?.[0];
  }, [offerings]);

  const isLoadingTotal = isLoadingApp || isLoadingProfile || isLoadingJob || isLoadingOfferings;

  const menuConfig = useMemo(() => {
    if (userProfile?.role === "super-admin") return MENU_CONFIG["super-admin"];
    if (userProfile?.role === "hrd") {
      return MENU_CONFIG["hrd"];
    }
    return [];
  }, [userProfile]);

  const handleStageChange = async (
    newStage: JobApplication["status"],
    reason: string,
  ) => {
    if (!application || !userProfile) return false;

    // 'offered' is now handled through the offer editor panel.
    if (newStage === "offered") {
      return false;
    }

    const timelineEvent: ApplicationTimelineEvent = {
      type: "stage_changed",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: { from: application.status, to: newStage, note: reason },
    };

    const updatePayload: any = {
      status: newStage,
      updatedAt: serverTimestamp(),
      timeline: [...(application.timeline || []), timelineEvent],
    };

    if (
      newStage === "tes_kepribadian" &&
      !application.personalityTestAssignedAt
    ) {
      updatePayload.personalityTestAssignedAt = serverTimestamp();
    }
    if (newStage === "rejected") {
      updatePayload.decisionAt = serverTimestamp();
    }

    try {
      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      toast({
        title: "Status Diperbarui",
        description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".`,
      });
      return true;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Memperbarui",
        description: error.message,
      });
      return false;
    }
  };

  const handleSaveOfferDraft = async (offerData: any) => {
    if (!application) return;

    try {
      setIsSavingDraft(true);
      // Update application with draft details for candidate visibility (if needed)
      const updatePayload: any = {
        activeOfferingId: offerData.offeringId,
        offeredSalary: offerData.salary || null,
        contractStartDate: offerData.startDate ? Timestamp.fromDate(new Date(offerData.startDate)) : null,
        contractDurationMonths: offerData.contractDurationMonths || null,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Draf",
        description: e.message,
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSendOffer = async (offerData: any) => {
    if (!application || !userProfile) return;

    const timelineEvent: ApplicationTimelineEvent = {
      type: "offer_sent",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: { note: "Penawaran kerja resmi telah dikirimkan kepada kandidat." },
    };

    try {
      setIsSendingOffer(true);

      const updatePayload = {
        status: "offered" as const,
        offerStatus: "sent" as const,
        activeOfferingId: offerData.offeringId,
        offeredSalary: offerData.salary || null,
        contractStartDate: offerData.startDate ? Timestamp.fromDate(new Date(offerData.startDate)) : null,
        contractDurationMonths: offerData.contractDurationMonths || null,
        offerSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      };

      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
    } catch (e: any) {
      console.error("Error sending offer:", e);
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Penawaran",
        description: e.message,
      });
    } finally {
      setIsSendingOffer(false);
    }
  };

  const handleActivateEmployee = async () => {
    if (!application || !userProfile || application.offerStatus !== "accepted")
      return;

    setIsActivating(true);
    const batch = writeBatch(firestore);

    const userRef = doc(firestore, "users", application.candidateUid);
    const appRef = doc(firestore, "applications", application.id!);

    const userUpdatePayload: Partial<UserProfile> = {
      role: "karyawan",
      brandId: application.brandId,
    };
    if (application.jobType === "internship") {
      userUpdatePayload.employmentType = "magang";
      userUpdatePayload.employmentStage = "intern_pre_probation";
    } else {
      // fulltime or contract
      userUpdatePayload.employmentType = "karyawan";
      userUpdatePayload.employmentStage = "probation";
    }
    batch.set(userRef, userUpdatePayload, { merge: true });

    const timelineEvent: ApplicationTimelineEvent = {
      type: "status_changed",
      at: Timestamp.now(),
      by: userProfile.uid,
      meta: {
        from: "offered",
        to: "hired",
        note: "Akun kandidat telah diaktifkan sebagai karyawan internal.",
      },
    };
    batch.update(appRef, {
      status: "hired",
      internalAccessEnabled: true,
      timeline: [...(application.timeline || []), timelineEvent],
    });

    try {
      await batch.commit();
      mutateApplication();
      toast({
        title: "Akun Diaktifkan!",
        description: `${application.candidateName} sekarang memiliki akses sebagai karyawan.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Aktivasi",
        description: e.message,
      });
    } finally {
      setIsActivating(false);
    }
  };

  useEffect(() => {
    const autoScreening = async () => {
      if (
        isLoadingApp ||
        !application ||
        !userProfile ||
        application.status !== "submitted" ||
        hasTriggeredAutoScreen
      )
        return;

      setHasTriggeredAutoScreen(true);
      const timelineEvent: ApplicationTimelineEvent = {
        type: "stage_changed",
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: {
          from: "submitted",
          to: "screening",
          note: "Application automatically moved to screening upon HR review.",
        },
      };
      await updateDocumentNonBlocking(applicationRef!, {
        status: "screening",
        timeline: [...(application.timeline || []), timelineEvent],
      });
      mutateApplication();
    };
    autoScreening().catch(console.error);
  }, [
    application,
    isLoadingApp,
    userProfile,
    hasTriggeredAutoScreen,
    applicationRef,
    mutateApplication,
    toast,
  ]);

  const isLoading = isLoadingTotal;

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Loading..." menuConfig={[]}>
        <ApplicationDetailSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Application Detail" menuConfig={menuConfig}>
      {isLoading ? (
        <ApplicationDetailSkeleton />
      ) : !application || !profile || !job ? (
        <p>Application, profile, or job details not found.</p>
      ) : (
        <>
          <div className="space-y-6">
            <ApplicationActionBar
              application={application}
              onStageChange={handleStageChange}
              onSendOfferClick={() =>
                document
                  .getElementById("offer-editor")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            />
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16 border">
                      <AvatarImage
                        src={
                          application.candidatePhotoUrl ||
                          `https://picsum.photos/seed/${application.candidateUid}/100/100`
                        }
                        alt={profile.fullName}
                        data-ai-hint="profile avatar"
                      />
                      <AvatarFallback className="text-xl">
                        {getInitials(profile.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-2xl">
                        {profile.fullName}
                      </CardTitle>
                      <CardDescription className="text-base">
                        {profile.nickname}
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />{" "}
                          {application.candidateEmail}
                        </span>
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4" /> {profile.phone}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ApplicationStatusBadge
                      status={application.status}
                      className="text-base px-4 py-1"
                    />
                    {application.submittedAt && (
                      <p className="text-sm text-muted-foreground">
                        Applied on{" "}
                        {format(
                          application.submittedAt.toDate(),
                          "dd MMM yyyy",
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="border-t pt-6 space-y-6">
                <h3 className="font-semibold text-lg">
                  Applied for: {application.jobPosition}
                </h3>
                {application.status !== "rejected" ? (
                  <ApplicationProgressStepper
                    currentStatus={application.status}
                  />
                ) : (
                  <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                    <XCircle className="h-5 w-5" />
                    <p className="text-sm font-medium">
                      This application was rejected.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {application.status === "offered" &&
              application.offerStatus === "accepted" &&
              !application.internalAccessEnabled && (
                <Card className="border-green-500">
                  <CardHeader>
                    <CardTitle className="text-green-600 flex items-center gap-2">
                      <CheckCircle /> Penawaran Diterima
                    </CardTitle>
                    <CardDescription>
                      Kandidat telah menerima penawaran kerja. Anda sekarang
                      dapat mengaktifkan akun internal mereka.
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button
                      onClick={handleActivateEmployee}
                      disabled={isActivating}
                    >
                      {isActivating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Aktifkan sebagai Karyawan
                    </Button>
                  </CardFooter>
                </Card>
              )}

            {application.status !== "rejected" &&
              application.offerStatus === "rejected" && (
                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                      <XCircle /> Penawaran Ditolak
                    </CardTitle>
                    <CardDescription>
                      Kandidat telah menolak penawaran kerja pada{" "}
                      {application.candidateOfferDecisionAt
                        ? format(
                            application.candidateOfferDecisionAt.toDate(),
                            "dd MMM yyyy",
                          )
                        : ""}
                      . Proses rekrutmen untuk kandidat ini telah selesai.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

            {application.status !== "rejected" && (
              <OfferEditor
                id="offer-editor"
                application={application}
                job={job}
                candidateName={application.candidateName}
                onSaveDraft={handleSaveOfferDraft}
                onSendOffer={handleSendOffer}
                isSavingDraft={isSavingDraft}
                isSendingOffer={isSendingOffer}
                offering={activeOffering}
                allOfferings={offerings || []}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                <CandidateFitAnalysis
                  profile={profile}
                  job={job}
                  application={application}
                />
                <ProfileView profile={profile} />
              </div>
              <div className="lg:sticky lg:top-24 space-y-6">
                <CandidateDocumentsCard
                  application={application}
                  profile={profile}
                  onVerificationChange={mutateApplication}
                />
                <ApplicationNotes
                  application={application}
                  onNoteAdded={mutateApplication}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
