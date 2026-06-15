// This file path is for the new non-locale structure.
// The content is taken from the original [locale] equivalent.
'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';
import { CandidatePortalLayout } from '@/components/careers/CandidatePortalLayout';

export default function CandidateApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // Not logged in, redirect to the candidate login page, preserving the apply url
      router.replace(`/careers/login?redirect=${pathname}`);
      return;
    }
    
    if (userProfile.role !== 'kandidat' && ROLES_INTERNAL.includes(userProfile.role as any)) {
      // Logged in, but is an internal user. Redirect to admin portal.
      // This path is outside the i18n segment, so we need to use window.location for a full redirect.
      window.location.href = '/admin';
    }

  }, [userProfile, loading, router, pathname]);

  // Render a loading state while checking for user and role
  if (loading || !userProfile || userProfile.role !== 'kandidat') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If checks pass, render the child components inside the portal layout
  return <CandidatePortalLayout>{children}</CandidatePortalLayout>;
}
