'use client';

import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import type { MenuGroup, MenuItem } from '@/lib/menu-config';
import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { NavigationSetting } from '@/lib/types';
import { MENU_CONFIG } from '@/lib/menu-config';

type DashboardLayoutProps = {
  children: React.ReactNode;
  pageTitle: string;
  actionArea?: ReactNode;
};

export function DashboardLayout({ 
  children, 
  pageTitle, 
  actionArea
}: DashboardLayoutProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    
    const roleMenuConfig = MENU_CONFIG[userProfile.role] || [];
    
    if (isLoadingSettings) {
      // While loading settings, return the default config to prevent UI flicker
      return roleMenuConfig;
    }

    if (navSettings && navSettings.visibleMenuItems) {
      // Filter menu items based on the keys stored in Firestore
      const visibleKeys = new Set(navSettings.visibleMenuItems);
      return roleMenuConfig.map(group => ({
        ...group,
        items: group.items.filter(item => visibleKeys.has(item.key))
      })).filter(group => group.items.length > 0);
    }
    
    // If no settings document exists, return the default full menu for that role
    return roleMenuConfig;

  }, [userProfile, navSettings, isLoadingSettings]);

  return (
    <SidebarProvider>
        <SidebarNav menuConfig={menuConfig} />
        <SidebarInset>
          <Topbar 
            pageTitle={pageTitle} 
            actionArea={actionArea}
          />
          <main className="flex-1 items-start gap-4 p-4 sm:px-6 sm:py-6 md:gap-8">
            {children}
          </main>
        </SidebarInset>
    </SidebarProvider>
  );
}
