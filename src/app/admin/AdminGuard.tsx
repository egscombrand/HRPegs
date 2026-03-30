'use client';

import { useAuth } from '@/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';

export function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only run redirection logic if we are NOT on the login page.
    if (pathname === '/admin/login') {
      return;
    }

    if (loading) {
      return; // Wait until loading is complete
    }

    if (!userProfile) {
      // Not logged in, redirect to the internal login page
      router.replace('/admin/login');
      return;
    }

    if (!ROLES_INTERNAL.includes(userProfile.role as any)) {
      // Logged in, but is a candidate. Redirect to candidate portal.
      router.replace('/careers/login');
    }
  }, [userProfile, loading, router, pathname]);

  // If we are on the login page, render it directly.
  // It has its own logic for redirecting already-logged-in users.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // For all other /admin/* routes, show a loader while we verify the user's role.
  if (loading || !userProfile || !ROLES_INTERNAL.includes(userProfile.role as any)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If all checks pass, render the protected page.
  return <>{children}</>;
}
