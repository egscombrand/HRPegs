'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// This page is now replaced by the main HRD dashboard.
// This component will redirect to the correct page.
export default function MonitoringRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/hrd/dashboard');
    }, [router]);

    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Redirecting to the main dashboard...</p>
        </div>
      </div>
    );
}
