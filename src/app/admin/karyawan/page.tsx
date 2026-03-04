'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function KaryawanDashboardRedirect() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !userProfile) {
      return; // Wait for user profile to load
    }

    if (userProfile.role !== 'karyawan') {
        // This is a safeguard, the main guard should handle this.
        router.replace('/admin');
        return;
    }

    const { employmentType } = userProfile;
    
    switch (employmentType) {
        case 'magang':
            router.replace('/admin/karyawan/dashboard-magang');
            break;
        case 'training':
            router.replace('/admin/karyawan/dashboard-training');
            break;
        case 'karyawan':
        default:
            router.replace('/admin/karyawan/dashboard');
            break;
    }

  }, [userProfile, loading, router]);
  
  if (userProfile && !userProfile.employmentType) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background p-4">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Tipe Pekerjaan Tidak Ditemukan</AlertTitle>
            <AlertDescription>
                Tipe pekerjaan untuk akun Anda belum diatur. Silakan hubungi HRD untuk pembaruan. Anda akan diarahkan ke dashboard umum.
            </AlertDescription>
          </Alert>
       </div>
    )
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">Mengarahkan ke dashboard Anda...</p>
      </div>
    </div>
  );
}
