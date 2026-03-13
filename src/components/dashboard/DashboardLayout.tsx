'use client';

import type { ReactNode } from 'react';
import React, { useMemo, createElement } from 'react';
import type { MenuGroup, MenuItem } from '@/lib/menu-config';
import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { NavigationSetting } from '@/lib/types';
import { MENU_CONFIG, ALL_MENU_GROUPS } from '@/lib/menu-config';
import { CheckSquare } from 'lucide-react';

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

  const roleKey = useMemo(() => {
    if (!userProfile) return null;
    if (userProfile.role === 'karyawan' && userProfile.employmentType && userProfile.employmentType !== 'karyawan') {
        return `karyawan-${userProfile.employmentType}`;
    }
    return userProfile.role;
  }, [userProfile]);


  const settingsDocRef = useMemoFirebase(
    () => (roleKey ? doc(firestore, 'navigation_settings', roleKey) : null),
    [roleKey, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  const menuConfig = useMemo(() => {
    if (!roleKey) return [];
    
    const baseConfig = MENU_CONFIG[roleKey] || [];
    // Perform a deep copy of the config to avoid mutating the original object.
    let finalConfig = baseConfig.map(group => ({
      ...group,
      items: group.items.map(item => ({ ...item })),
    }));

    if (userProfile?.isDivisionManager) {
        const managerApprovalMenu: MenuItem = {
            key: 'manager.overtime_approval',
            href: '/admin/manager/persetujuan-lembur',
            label: 'Persetujuan Lembur Tim',
            icon: createElement(CheckSquare),
        };

        let reviewGroup = finalConfig.find((g: MenuGroup) => g.title === 'Review');
        if (!reviewGroup) {
            reviewGroup = { title: 'Review', items: [] };
            finalConfig.push(reviewGroup);
        }

        if (!reviewGroup.items.some((item: MenuItem) => item.key === managerApprovalMenu.key)) {
            reviewGroup.items.push(managerApprovalMenu);
        }
    }
    
    if (isLoadingSettings || !navSettings?.visibleMenuItems) {
      return finalConfig;
    }
    
    const visibleKeys = new Set(navSettings.visibleMenuItems);

    // If the user is a division manager, ensure their approval menu is always visible,
    // overriding any database setting for this specific, conditional menu item.
    if (userProfile?.isDivisionManager) {
        visibleKeys.add('manager.overtime_approval');
    }
    
    return finalConfig.map((group: MenuGroup) => ({
      ...group,
      items: group.items.filter(item => visibleKeys.has(item.key))
    })).filter((group: MenuGroup) => group.items.length > 0);

  }, [roleKey, userProfile, navSettings, isLoadingSettings]);

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
