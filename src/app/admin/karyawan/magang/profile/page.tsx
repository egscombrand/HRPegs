'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import type { EmployeeProfile, Profile, Address } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeSelfProfileForm } from '@/components/dashboard/karyawan/EmployeeSelfProfileForm';
import { EmployeeProfileDisplay } from '@/components/dashboard/karyawan/EmployeeProfileDisplay';
import { useRouter, useSearchParams } from 'next/navigation';

const getAddressString = (address: any): string => {
    if (!address) return '';
    if (typeof address === 'string') return address;
    return [address.street, address.village, address.city].filter(Boolean).join(', ');
};

function InternProfilePageContent() {
    const { userProfile: authProfile, loading: authLoading, refreshUserProfile } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const mode = searchParams.get('mode');

    const employeeProfileDocRef = useMemoFirebase(
        () => (authProfile ? doc(firestore, 'employee_profiles', authProfile.uid) : null),
        [firestore, authProfile]
    );
    const { data: employeeProfile, isLoading: employeeProfileLoading, mutate: refetchProfile } = useDoc<EmployeeProfile>(employeeProfileDocRef);
    
    const recruitmentProfileDocRef = useMemoFirebase(
      () => (authProfile ? doc(firestore, 'profiles', authProfile.uid) : null),
      [firestore, authProfile]
    );
    const { data: recruitmentProfile, isLoading: recruitmentProfileLoading } = useDoc<Profile>(recruitmentProfileDocRef);


    const [editMode, setEditMode] = useState(false);
    
    const isLoading = authLoading || employeeProfileLoading || recruitmentProfileLoading;

    useEffect(() => {
        if (isLoading) return;
        
        if (!employeeProfile || !employeeProfile.completeness?.isComplete) {
          setEditMode(true);
        } else {
          setEditMode(mode === 'edit');
        }
    }, [employeeProfile, isLoading, mode]);

    const handleSaveSuccess = () => {
        setEditMode(false);
        refetchProfile();
        refreshUserProfile();
        router.push('/admin/karyawan/magang/profile'); // Go back to view mode
    };
    
    const handleCancelEdit = () => {
        if (employeeProfile?.completeness?.isComplete) {
          setEditMode(false);
          router.push('/admin/karyawan/magang/profile');
        }
    };
    
    const combinedInitialProfile = useMemo(() => {
        if (!authProfile) return {};
        
        const latestEducation = recruitmentProfile?.education?.[0];
        const addressToUse = recruitmentProfile?.isDomicileSameAsKtp ? recruitmentProfile?.addressKtp : recruitmentProfile?.addressDomicile;

        return {
            ...employeeProfile,
            fullName: authProfile.fullName,
            email: authProfile.email,
            nickName: employeeProfile?.nickName || recruitmentProfile?.nickname,
            phone: employeeProfile?.phone || recruitmentProfile?.phone,
            gender: employeeProfile?.gender || recruitmentProfile?.gender,
            birthPlace: employeeProfile?.birthPlace || recruitmentProfile?.birthPlace,
            birthDate: employeeProfile?.birthDate || (recruitmentProfile?.birthDate instanceof Timestamp ? recruitmentProfile.birthDate.toDate() : undefined),
            addressCurrent: employeeProfile?.addressCurrent || getAddressString(addressToUse),
            schoolOrCampus: employeeProfile?.schoolOrCampus || latestEducation?.institution,
            major: employeeProfile?.major || latestEducation?.fieldOfStudy,
            educationLevel: employeeProfile?.educationLevel || latestEducation?.level,
            internSubtype: employeeProfile?.internSubtype,
            emergencyContactName: employeeProfile?.emergencyContactName,
            emergencyContactRelation: employeeProfile?.emergencyContactRelation,
            emergencyContactPhone: employeeProfile?.emergencyContactPhone,
            bankName: employeeProfile?.bankName,
            bankAccountNumber: employeeProfile?.bankAccountNumber,
            bankAccountHolderName: employeeProfile?.bankAccountHolderName,
        };
    }, [employeeProfile, recruitmentProfile, authProfile]);


    if (isLoading) {
        return <Skeleton className="h-96 w-full" />;
    }

    if (!authProfile) {
        return <p>User not found.</p>;
    }
    
    return editMode ? (
        <EmployeeSelfProfileForm 
          initialProfile={combinedInitialProfile} 
          onSaveSuccess={handleSaveSuccess}
          onCancel={handleCancelEdit}
        />
      ) : (
        <EmployeeProfileDisplay
          employeeProfile={employeeProfile as EmployeeProfile}
          userProfile={authProfile}
          onEdit={() => router.push('/admin/karyawan/magang/profile?mode=edit')}
        />
      );
}

export default function InternProfilePage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <InternProfilePageContent />
        </Suspense>
    )
}
