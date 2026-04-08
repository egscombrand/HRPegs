'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from "@/providers/auth-provider";
import { Skeleton } from '@/components/ui/skeleton';
import { useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Profile } from '@/lib/types';
import { PersonalDataForm } from '@/components/profile/PersonalDataForm';
import { EducationForm } from '@/components/profile/EducationForm';
import { WorkExperienceForm } from '@/components/profile/WorkExperienceForm';
import { SkillsForm } from '@/components/profile/SkillsForm';
import { SelfDescriptionForm } from '@/components/profile/SelfDescriptionForm';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ProfileStepper } from '@/components/profile/ProfileStepper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Edit, Loader2 } from 'lucide-react';
import { OrganizationalExperienceForm } from '@/components/profile/OrganizationalExperienceForm';
import { useToast } from '@/hooks/use-toast';
import { ProfilePreview } from '@/components/profile/ProfilePreview';

const steps = [
    { id: 1, name: 'Data Pribadi' },
    { id: 2, name: 'Pendidikan' },
    { id: 3, name: 'Pengalaman Kerja' },
    { id: 4, name: 'Pengalaman Organisasi' },
    { id: 5, name: 'Dokumen & Sertifikasi' },
    { id: 6, name: 'Deskripsi & Pernyataan' },
];

function ProfileWizardContent() {
    const { userProfile: authProfile, firebaseUser, loading: authLoading, refreshUserProfile } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);

    const profileDocRef = useMemoFirebase(() => {
        if (!firestore || !firebaseUser) return null;
        return doc(firestore, 'profiles', firebaseUser.uid);
    }, [firestore, firebaseUser]);

    const { data: profile, isLoading: isProfileLoading, mutate: refreshProfile } = useDoc<Profile>(profileDocRef);

    useEffect(() => {
        const createMissingProfile = async () => {
            if (!isProfileLoading && !profile && firebaseUser && firestore && authProfile) {
                console.warn("Profile document not found for this user, creating a new one as a fallback.");
                const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
                const defaultProfileData = {
                    fullName: authProfile.fullName,
                    email: authProfile.email,
                    profileStatus: 'draft',
                    profileStep: 1,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                };
                try {
                    await setDocumentNonBlocking(profileDocRef, defaultProfileData, { merge: true });
                    toast({ title: "Profil Dibuat", description: "Memulai profil baru untuk Anda." });
                    refreshProfile();
                } catch (e: any) {
                    console.error("Failed to lazy-create profile:", e);
                    toast({ variant: "destructive", title: "Gagal membuat profil", description: e.message });
                }
            }
        };
        createMissingProfile();
    }, [isProfileLoading, profile, firebaseUser, firestore, authProfile, refreshProfile, toast]);


    const isLoading = authLoading || isProfileLoading;
    const urlStep = parseInt(searchParams.get('step') || '0', 10);
    const isPreviewMode = !!profile && urlStep === 0;

    const [effectiveStep, setEffectiveStep] = useState(1);

    const handleEnterEditMode = async (step: number = 1) => {
        if (!firebaseUser) {
            toast({
                variant: 'destructive',
                title: 'Gagal memulai edit',
                description: 'User tidak ditemukan. Silakan login kembali.',
            });
            return;
        }

        setIsEditing(true);
        try {
            if (profile?.profileStatus === 'completed') {
                const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
                await setDocumentNonBlocking(profileDocRef, { profileStatus: 'draft' }, { merge: true });
            }
            router.push(`${pathname}?step=${step}`);
        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'Gagal memulai mode edit',
                description: error.message || 'Terjadi kesalahan pada server.',
            });
        } finally {
            setIsEditing(false);
        }
    };

    useEffect(() => {
        if (isLoading || isPreviewMode) return;
        
        const profileStep = profile?.profileStep || 1;
        const targetStep = urlStep > profileStep ? profileStep : urlStep;
        
        if (targetStep !== urlStep) {
            router.replace(`${pathname}?step=${targetStep}`);
        }
        
        setEffectiveStep(targetStep || 1);

    }, [urlStep, profile, isLoading, router, pathname, isPreviewMode]);


    const handleSaveSuccess = () => {
        refreshProfile();
        refreshUserProfile();
        const nextStep = effectiveStep + 1;
        if (nextStep <= steps.length) {
            router.push(`${pathname}?step=${nextStep}`);
        } else {
             router.push(pathname);
        }
    };

    const handleBack = () => {
        const prevStep = effectiveStep - 1;
        if (prevStep >= 1) {
            router.push(`${pathname}?step=${prevStep}`);
        }
    };
    
    const handleFinish = async () => {
        refreshProfile();
        refreshUserProfile();
        router.push(pathname);
    }
    
    if (isLoading || !authProfile) {
        return (
             <div className="space-y-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-96 w-full" />
             </div>
        )
    }

    if (!profile) {
        return (
            <Card className="flex flex-col items-center justify-center text-center p-8">
                <CardHeader>
                    <CardTitle className="mt-4 text-2xl">Profil Pelamar Belum Dibuat</CardTitle>
                </CardHeader>
                <CardContent className="w-full max-w-sm">
                    <p className="text-muted-foreground mb-6">
                       Anda belum memiliki profil pelamar. Mulai isi profil Anda untuk dapat melamar pekerjaan.
                    </p>
                    <Button className="w-full" onClick={() => handleEnterEditMode(1)}>
                        Mulai Isi Profil
                    </Button>
                </CardContent>
            </Card>
        )
    }
    
    if (isPreviewMode) {
       return <ProfilePreview profile={profile} onEditRequest={handleEnterEditMode} />;
    }

    const initialProfileData = {
        ...(profile || {}),
        fullName: profile?.fullName || authProfile.fullName,
        email: profile?.email || authProfile.email,
    };


    return (
        <div className="space-y-8">
            <ProfileStepper steps={steps} currentStep={effectiveStep} />
            
            {effectiveStep === 1 && (
                <PersonalDataForm 
                    initialData={initialProfileData} 
                    onSaveSuccess={handleSaveSuccess}
                />
            )}
            {effectiveStep === 2 && (
                <EducationForm 
                    initialData={initialProfileData.education || []} 
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 3 && (
                <WorkExperienceForm
                    initialData={initialProfileData.workExperience || []}
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 4 && (
                <OrganizationalExperienceForm
                    initialData={initialProfileData.organizationalExperience || []}
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 5 && (
                 <SkillsForm
                    initialData={{
                        skills: initialProfileData.skills || [],
                        certifications: initialProfileData.certifications || [],
                        cvUrl: initialProfileData.cvUrl,
                        ijazahUrl: initialProfileData.ijazahUrl,
                    }}
                    onSaveSuccess={handleSaveSuccess}
                    onBack={handleBack}
                />
            )}
            {effectiveStep === 6 && (
                <SelfDescriptionForm
                    initialData={{
                        selfDescription: initialProfileData.selfDescription,
                        salaryExpectation: initialProfileData.salaryExpectation,
                        salaryExpectationReason: initialProfileData.salaryExpectationReason,
                        motivation: initialProfileData.motivation,
                        workStyle: initialProfileData.workStyle,
                        improvementArea: initialProfileData.improvementArea,
                        availability: initialProfileData.availability,
                        availabilityOther: initialProfileData.availabilityOther,
                        usedToDeadline: initialProfileData.usedToDeadline,
                        deadlineExperience: initialProfileData.deadlineExperience,
                    }}
                    onFinish={handleFinish}
                    onBack={handleBack}
                />
            )}
        </div>
    );
}


export default function ProfilePage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <ProfileWizardContent />
        </Suspense>
    )
}
