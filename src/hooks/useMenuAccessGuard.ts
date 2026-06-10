"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import {
  normalizeMenuKey,
  normalizeMenuRole,
  normalizeMenuVisibilityKeys,
} from "@/lib/menu-config";

export function useMenuAccessGuard(menuKey: string) {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();

  const menuRoleKey = normalizeMenuRole(
    userProfile?.role,
    (userProfile as any)?.structuralLevel,
  );

  const settingsDocRef = useMemoFirebase(
    () =>
      menuRoleKey && firestore
        ? doc(firestore, "navigation_settings", menuRoleKey)
        : null,
    [menuRoleKey, firestore],
  );

  const { data: navSettings, isLoading: settingsLoading } =
    useDoc<any>(settingsDocRef);

  useEffect(() => {
    if (authLoading || settingsLoading) return;

    if (!userProfile) {
      router.replace("/admin/login");
      return;
    }

    // Only block access if navSettings has been loaded AND key is not present
    const isSettingsLoaded = !settingsLoading;
    const hasNavSettings = isSettingsLoaded && navSettings?.visibleMenuItems != null;

    if (hasNavSettings) {
      const visibleKeys = new Set(
        normalizeMenuVisibilityKeys(navSettings.visibleMenuItems),
      );
      const hasAccess = visibleKeys.has(normalizeMenuKey(menuKey));
      if (!hasAccess) {
        router.replace("/admin");
      }
    }
  }, [userProfile, authLoading, settingsLoading, navSettings, menuKey, router]);

  // Allow access if navSettings not yet loaded. Block only if navSettings exists but key is not in it.
  const isSettingsLoaded = !settingsLoading;
  const hasNavSettings = isSettingsLoaded && navSettings?.visibleMenuItems != null;
  const hasAccess = !hasNavSettings || normalizeMenuVisibilityKeys(
    navSettings?.visibleMenuItems,
  ).includes(normalizeMenuKey(menuKey));

  return {
    loading: authLoading || settingsLoading,
    hasAccess,
  };
}
