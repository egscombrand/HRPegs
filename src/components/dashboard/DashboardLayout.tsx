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
import { CheckSquare, FileHeart } from 'lucide-react';
import { isActiveEmployeeEligibleForLeave, canUserReview } from '@/lib/auth-eligibility';


type DashboardLayoutProps = {
  children: React.ReactNode;
  pageTitle: string;
  actionArea?: ReactNode;
  menuConfig?: MenuGroup[];
};

export function DashboardLayout({ 
  children, 
  pageTitle, 
  actionArea,
  menuConfig: manualMenuConfig
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
        const overtimeApprovalMenu: MenuItem = {
            key: 'manager.overtime_approval',
            href: '/admin/manager/persetujuan-lembur',
            label: 'Persetujuan Lembur Tim',
            icon: createElement(CheckSquare),
        };
        const permissionApprovalMenu: MenuItem = {
            key: 'manager.permission_approval',
            href: '/admin/manager/persetujuan-izin',
            label: 'Persetujuan Izin Tim',
            icon: createElement(FileHeart),
        };

        let reviewGroup = finalConfig.find((g: MenuGroup) => g.title === 'Review');
        if (!reviewGroup) {
            reviewGroup = { title: 'Review', items: [] };
            finalConfig.push(reviewGroup);
        }
        
        // Add overtime menu if it doesn't exist
        if (!reviewGroup.items.some((item: MenuItem) => item.key === overtimeApprovalMenu.key)) {
            reviewGroup.items.push(overtimeApprovalMenu);
        }
        // Add permission menu if it doesn't exist
        if (!reviewGroup.items.some((item: MenuItem) => item.key === permissionApprovalMenu.key)) {
            reviewGroup.items.push(permissionApprovalMenu);
        }
    }
    
    // 1. Initial State: use either manual override or default role menu
    let currentConfig = manualMenuConfig || finalConfig;

    // 2. Perform Dynamic Authority Checks
    const leaveStatus = isActiveEmployeeEligibleForLeave(userProfile);
    const userCanReview = canUserReview(userProfile);

    // 3. Apply Hard Eligibility/Authority Filters
    // This part runs ALWAYS, even if DB settings are missing/broken.
    currentConfig = currentConfig.map((group: MenuGroup) => ({
      ...group,
      items: group.items.filter(item => {
          // Leave Eligibility (Staff must be active/loyal)
          if (item.key === 'employee.leave') {
              return leaveStatus.isEligible;
          }
          
          // Review Authority (Only for Managers, HRD, and Appointed Division Managers)
          const reviewKeys = ['review.reports', 'manager.overtime_approval', 'manager.permission_approval', 'hrd.permission_approval', 'hrd.overtime_approval'];
          if (reviewKeys.includes(item.key) && !userCanReview) {
              return false;
          }
          
          return true;
      })
    })).filter((group) => {
        // Double security: if the group is specifically "Review" and they aren't a reviewer, nix it.
        if (group.title === 'Review' && !userCanReview) {
            return false;
        }
        return group.items.length > 0;
    });


    // 4. Apply Database Visibility Restrictions
    // If Admin has unchecked certain items in the 'Menu Visibility Settings' panel.
    if (!isLoadingSettings && navSettings?.visibleMenuItems) {
        const visibleKeys = new Set(navSettings.visibleMenuItems);
        currentConfig = currentConfig.map(group => ({
            ...group,
            items: group.items.filter(item => visibleKeys.has(item.key))
        })).filter(group => group.items.length > 0);
    }

    return currentConfig;
  }, [roleKey, userProfile, navSettings, isLoadingSettings, manualMenuConfig]);

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
