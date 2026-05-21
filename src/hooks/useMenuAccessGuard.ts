'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export function useMenuAccessGuard(menuKey: string) {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();

  const roleKey = userProfile?.role;
  
  const settingsDocRef = useMemoFirebase(
    () => (roleKey && firestore ? doc(firestore, 'navigation_settings', roleKey) : null),
    [roleKey, firestore]
  );
  
  const { data: navSettings, isLoading: settingsLoading } = useDoc<any>(settingsDocRef);

  useEffect(() => {
    if (authLoading || settingsLoading) return;

    if (!userProfile) {
      router.replace('/admin/login');
      return;
    }

    if (navSettings && navSettings.visibleMenuItems) {
      const hasAccess = navSettings.visibleMenuItems.includes(menuKey);
      if (!hasAccess) {
        router.replace('/admin');
      }
    }
  }, [userProfile, authLoading, settingsLoading, navSettings, menuKey, router]);

  const hasAccess = navSettings?.visibleMenuItems?.includes(menuKey) ?? false;

  return {
    loading: authLoading || settingsLoading,
    hasAccess
  };
}
