"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import {
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from "@/firebase";
import { doc, serverTimestamp } from "firebase/firestore";
import type { JobApplication, Profile, Job } from "@/lib/types";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Mail,
  Phone,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
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
import { ApplicationProgressStepper } from "@/components/recruitment/ApplicationProgressStepper";
import { Separator } from "@/components/ui/separator";
import { CandidateDocumentsCard } from "@/components/recruitment/CandidateDocumentsCard";
import { CandidateFitAnalysis } from "@/components/recruitment/CandidateFitAnalysis";
import { ROLES_INTERNAL } from "@/lib/types";
import { Lock } from "lucide-react";

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

function StatusManager({ application }: { application: JobApplication }) {
  const [selectedStatus, setSelectedStatus] = useState(application.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const statusGroups = [
    {
      label: "Aplikasi Masuk",
      statuses: ["draft", "submitted"],
    },
    {
      label: "Proses Seleksi",
      statuses: [
        "tes_kepribadian",
        "document_submission",
        "verification",
        "interview",
      ],
    },
    {
      label: "Keputusan Akhir",
      statuses: ["hired", "rejected"],
    },
  ];

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const appRef = doc(firestore, "applications", application.id!);
      const updatePayload: any = {
        status: selectedStatus,
        updatedAt: serverTimestamp(),
      };

      if (
        selectedStatus === "tes_kepribadian" &&
        !application.personalityTestAssignedAt
      ) {
        updatePayload.personalityTestAssignedAt = serverTimestamp();
      }

      await updateDocumentNonBlocking(appRef, updatePayload);

      toast({
        title: "Success",
        description: "Application status has been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedStatus}
        onValueChange={(v) => setSelectedStatus(v as JobApplication["status"])}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Update status" />
        </SelectTrigger>
        <SelectContent>
          {statusGroups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusDisplayLabels[status as JobApplication["status"]]}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Button
        onClick={handleUpdate}
        disabled={selectedStatus === application.status || isUpdating}
      >
        {isUpdating ? "Updating..." : "Update Status"}
      </Button>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard([...ROLES_INTERNAL]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const applicationId = params.applicationId as string;

  const applicationRef = useMemoFirebase(
    () =>
      applicationId ? doc(firestore, "applications", applicationId) : null,
    [firestore, applicationId],
  );
  const { data: application, isLoading: isLoadingApp } =
    useDoc<JobApplication>(applicationRef);

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

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === "super-admin") return MENU_CONFIG["super-admin"];
    if (userProfile.role === "hrd") return MENU_CONFIG["hrd"];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const isAssigned = useMemo(() => {
    if (!userProfile || !application || !job) return false;
    if (userProfile.role === "super-admin" || userProfile.role === "hrd")
      return true;

    // Check if user is in allPanelistIds or assigned to job
    if (application.allPanelistIds?.includes(userProfile.uid)) return true;
    if (job.assignedUserIds?.includes(userProfile.uid)) return true;

    return false;
  }, [userProfile, application, job]);

  const isLoading = isLoadingApp || isLoadingProfile || isLoadingJob;

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Loading..." menuConfig={[]}>
        <ApplicationDetailSkeleton />
      </DashboardLayout>
    );
  }

  if (!isLoading && !isAssigned) {
    return (
      <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <div className="bg-destructive/10 p-4 rounded-full">
            <Lock className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Akses Ditolak</h1>
          <p className="text-slate-700 max-w-md mx-auto">
            Anda tidak memiliki akses ke data aplikasi ini.
          </p>
          <Button variant="outline" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
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
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to List
            </Button>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border">
                    <AvatarImage
                      src={`https://picsum.photos/seed/${application.candidateUid}/100/100`}
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
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-600 dark:text-muted-foreground" />
                        {application.candidateEmail}
                      </span>
                      <span className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-600 dark:text-muted-foreground" />
                        {profile.phone}
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
                    <p className="text-sm text-slate-700 dark:text-muted-foreground">
                      Applied on{" "}
                      {format(application.submittedAt.toDate(), "dd MMM yyyy")}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="border-t pt-6 space-y-6">
              {application.status !== "rejected" && (
                <ApplicationProgressStepper
                  currentStatus={application.status}
                />
              )}

              {application.status === "rejected" && (
                <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                  <XCircle className="h-5 w-5" />
                  <p className="text-sm font-medium">
                    This application was rejected.
                  </p>
                </div>
              )}

              <Separator />

              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    Applied for: {application.jobPosition}
                  </h3>
                  <p className="flex items-center gap-2 text-slate-700">
                    <Briefcase className="h-4 w-4 text-slate-600" />
                    {application.brandName} - {application.location}
                  </p>
                </div>
                <StatusManager application={application} />
              </div>
            </CardContent>
          </Card>
          <CandidateDocumentsCard
            profile={profile as any}
            application={application}
            onVerificationChange={() => {}}
          />
          <CandidateFitAnalysis
            profile={profile}
            job={job}
            application={application}
          />
          <ProfileView profile={profile} />
        </div>
      )}
    </DashboardLayout>
  );
}
