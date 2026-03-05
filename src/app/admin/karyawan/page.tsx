'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';

export default function KaryawanDashboardRedirect() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const profileDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
    [firestore, userProfile]
  );
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(profileDocRef);

  const isLoading = authLoading || (userProfile?.employmentType === 'magang' && profileLoading);

  useEffect(() => {
    if (isLoading || !userProfile) {
      return; // Wait for all data to load
    }

    if (userProfile.role !== 'karyawan') {
      router.replace('/admin');
      return;
    }

    const { employmentType } = userProfile;
    
    switch (employmentType) {
        case 'magang':
            if (!employeeProfile || !employeeProfile.completeness?.isComplete) {
                router.replace('/admin/karyawan/magang/profile');
            } else {
                router.replace('/admin/karyawan/dashboard-magang');
            }
            break;
        case 'training':
            router.replace('/admin/karyawan/dashboard-training');
            break;
        case 'karyawan':
        default:
            router.replace('/admin/karyawan/dashboard');
            break;
    }

  }, [userProfile, employeeProfile, isLoading, router]);
  
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
