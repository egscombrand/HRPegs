'use client';

import type { ReactNode } from 'react';
import React, { useMemo, createElement, useState, useEffect } from 'react';
import type { MenuGroup, MenuItem } from '@/lib/menu-config';
import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, limit } from 'firebase/firestore';
import type { NavigationSetting, UserRole, Job } from '@/lib/types';
import { MENU_CONFIG, ALL_MENU_GROUPS } from '@/lib/menu-config';
import { CheckSquare, FileHeart, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  
  // Realtime checks for recruitment-related assignments across multiple sources
  const panelistQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
        collection(firestore, 'applications'),
        where('allPanelistIds', 'array-contains', userProfile.uid),
        limit(1)
    );
  }, [firestore, userProfile?.uid]);

  const jobQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
        collection(firestore, 'jobs'),
        where('assignedUserIds', 'array-contains', userProfile.uid),
        limit(1)
    );
  }, [firestore, userProfile?.uid]);

  const { data: panelistAssignments, isLoading: isLoadingPanelists } = useCollection(panelistQuery);
  const { data: jobAssignments, isLoading: isLoadingJobs } = useCollection(jobQuery);

  const pendingBankRequestsQuery = useMemoFirebase(() => {
    if (roleKey === 'hrd' || roleKey === 'super-admin') {
      return query(
        collection(firestore, 'bank_change_requests'),
        where('status', '==', 'pending')
      );
    }
    return null;
  }, [firestore, roleKey]);
  const { data: pendingBankRequests } = useCollection(pendingBankRequestsQuery);

  const hasAnyAssignment = (panelistAssignments && panelistAssignments.length > 0) || 
                          (jobAssignments && jobAssignments.length > 0);
  
  const isAssignmentLoading = isLoadingPanelists || isLoadingJobs;

  const menuConfig = useMemo(() => {
    if (!roleKey) return [];
    
    const baseConfig = MENU_CONFIG[roleKey] || [];
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
        
        if (!reviewGroup.items.some((item: MenuItem) => item.key === overtimeApprovalMenu.key)) {
            reviewGroup.items.push(overtimeApprovalMenu);
        }
        if (!reviewGroup.items.some((item: MenuItem) => item.key === permissionApprovalMenu.key)) {
            reviewGroup.items.push(permissionApprovalMenu);
        }
    }
    
    let currentConfig = manualMenuConfig || finalConfig;

    const leaveStatus = isActiveEmployeeEligibleForLeave(userProfile);
    const userCanReview = canUserReview(userProfile);

    currentConfig = currentConfig.map((group: MenuGroup) => ({
      ...group,
      items: group.items.filter(item => {
          if (item.key === 'employee.leave') {
              return leaveStatus.isEligible;
          }
          
          const reviewKeys = ['review.reports', 'manager.overtime_approval', 'manager.permission_approval', 'hrd.permission_approval', 'hrd.overtime_approval'];
          if (reviewKeys.includes(item.key) && !userCanReview) {
              return false;
          }
          
          // Only show recruitment tasks if user is actually assigned
          // We hide it during loading to prevent the "ghost menu" flicker for non-recruiters
          if (item.key === 'recruitment.tasks' && (isAssignmentLoading || !hasAnyAssignment)) {
              return false;
          }
          
          return true;
      })
    })).filter((group) => {
        if (group.title === 'Review' && !userCanReview) {
            return false;
        }
        return group.items.length > 0;
    });


    if (!isLoadingSettings && navSettings?.visibleMenuItems) {
        const visibleKeys = new Set(navSettings.visibleMenuItems);
        currentConfig = currentConfig.map(group => ({
            ...group,
            items: group.items.filter(item => visibleKeys.has(item.key))
        })).filter(group => group.items.length > 0);
    }

    // Add badges
    currentConfig = currentConfig.map(group => ({
        ...group,
        items: group.items.map(item => {
            if (item.key === 'employee.data.karyawan') {
                const count = pendingBankRequests?.length || 0;
                if (count > 0) {
                    return { ...item, badge: <Badge variant="secondary" className="bg-red-500 text-white hover:bg-red-600 px-2 py-0 h-5 text-[10px]">{count}</Badge> };
                }
            }
            return item;
        })
    }));

    return currentConfig;
  }, [roleKey, userProfile, navSettings, isLoadingSettings, manualMenuConfig, isAssignmentLoading, hasAnyAssignment, pendingBankRequests]);

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
