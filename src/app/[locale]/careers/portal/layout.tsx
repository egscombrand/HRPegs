"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "@/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ROLES_INTERNAL } from "@/lib/types";
import { CandidatePortalLayout } from "@/components/careers/CandidatePortalLayout";

export default function CandidatePortalMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!firebaseUser || !userProfile) {
      // Not logged in or profile still unavailable, redirect to the candidate login page.
      router.replace("/careers/login");
      return;
    }

    if (ROLES_INTERNAL.includes(userProfile.role)) {
      // Logged in, but is an internal user. Redirect to admin portal.
      // This path is outside the i18n segment, so we need to use window.location for a full redirect.
      window.location.href = "/admin";
    }
  }, [firebaseUser, userProfile, loading, router]);

  // Render a loading state while checking for user and role
  if (
    loading ||
    !firebaseUser ||
    !userProfile ||
    userProfile.role !== "kandidat"
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If checks pass, render the child components within the portal layout
  return <CandidatePortalLayout>{children}</CandidatePortalLayout>;
}
