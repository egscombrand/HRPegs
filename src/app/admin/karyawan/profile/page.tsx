'use client';

import { useMemo, useState, useEffect } from 'react';
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
  const { userProfile, loading: authLoading, refreshUserProfile } = useAuth();
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

  useEffect(() => {
    // If the profile is still loading, do nothing.
    if (isLoading) return;
    
    // If profile data exists and completeness is false, force edit mode.
    // If there's no profile data at all, also force edit mode to create it.
    if (!employeeProfile || !employeeProfile.completeness?.isComplete) {
      setEditMode(true);
    }
  }, [employeeProfile, isLoading]);


  const handleSaveSuccess = () => {
    setEditMode(false);
    mutate(); // Re-fetch the employee profile data
    refreshUserProfile(); // Re-fetch the user profile in auth context
  };
  
  const handleCancelEdit = () => {
    // Only allow canceling if the profile was already complete
    if (employeeProfile?.completeness?.isComplete) {
      setEditMode(false);
    }
  };
  
  const initialProfileData = useMemo(() => {
    if (!userProfile) return {};
    // Combine auth data with profile data for the form's initial state
    return {
        ...(employeeProfile || {}),
        fullName: userProfile.fullName,
        email: userProfile.email,
        role: userProfile.role,
        employmentType: userProfile.employmentType,
        employmentStage: userProfile.employmentStage,
    };
  }, [userProfile, employeeProfile]);


  if (isLoading) {
    return (
      <DashboardLayout pageTitle="Data Diri Karyawan" menuConfig={menuConfig}>
        <ProfileSkeleton />
      </DashboardLayout>
    );
  }
  
  // If the profile is incomplete, force edit mode and don't show display component
  const isProfileIncomplete = !employeeProfile?.completeness?.isComplete;

  return (
    <DashboardLayout pageTitle="Data Diri Karyawan" menuConfig={menuConfig}>
      {editMode || isProfileIncomplete ? (
        <EmployeeSelfProfileForm 
          initialProfile={initialProfileData} 
          onSaveSuccess={handleSaveSuccess}
          onCancel={handleCancelEdit}
        />
      ) : (
        <EmployeeProfileDisplay
          employeeProfile={employeeProfile!}
          userProfile={userProfile!}
          onEdit={() => setEditMode(true)}
        />
      )}
    </DashboardLayout>
  );
}

    