'use client';

import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile, UserProfile } from '@/lib/types';
import { EmployeeProfileDisplay } from '@/components/dashboard/karyawan/EmployeeProfileDisplay';
import { EmployeeSelfProfileForm } from '@/components/dashboard/karyawan/EmployeeSelfProfileForm';

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

export default function EmployeeProfilePage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const [editMode, setEditMode] = useState(false);

  const employeeProfileRef = useMemoFirebase(() => 
    userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null,
    [firestore, userProfile?.uid]
  );
  const { data: employeeProfile, isLoading: profileLoading, mutate } = useDoc<EmployeeProfile>(employeeProfileRef);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    const roleKey = userProfile.employmentType === 'magang' ? 'karyawan-magang' : (userProfile.employmentType === 'training' ? 'karyawan-training' : 'karyawan');
    return MENU_CONFIG[roleKey] || [];
  }, [userProfile]);
  
  const isLoading = authLoading || profileLoading;

  const handleSaveSuccess = () => {
    setEditMode(false);
    mutate(); // Re-fetch the employee profile data
  };

  if (isLoading) {
    return (
      <DashboardLayout pageTitle="Profil Saya" menuConfig={menuConfig}>
        <ProfileSkeleton />
      </DashboardLayout>
    );
  }

  if (!employeeProfile) {
    // If the main profile doesn't exist, force edit mode to create it.
    return (
      <DashboardLayout pageTitle="Lengkapi Profil Anda" menuConfig={menuConfig}>
        <EmployeeSelfProfileForm 
          initialProfile={userProfile as Partial<EmployeeProfile>} 
          onSaveSuccess={handleSaveSuccess} 
          onCancel={() => {}}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Profil Saya" menuConfig={menuConfig}>
      {editMode ? (
        <EmployeeSelfProfileForm 
          initialProfile={employeeProfile} 
          onSaveSuccess={handleSaveSuccess}
          onCancel={() => setEditMode(false)}
        />
      ) : (
        <EmployeeProfileDisplay
          employeeProfile={employeeProfile}
          userProfile={userProfile!}
          onEdit={() => setEditMode(true)}
        />
      )}
    </DashboardLayout>
  );
}

    