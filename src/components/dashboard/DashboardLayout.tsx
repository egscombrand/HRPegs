"use client";

import type { ReactNode } from "react";
import React, { useMemo, createElement, useState, useEffect } from "react";
import type { MenuGroup, MenuItem } from "@/lib/menu-config";
import { SidebarNav } from "./SidebarNav";
import { Topbar } from "./Topbar";
import { SidebarProvider, SidebarInset } from "../ui/sidebar";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  useDoc,
  useMemoFirebase,
  useCollection,
} from "@/firebase";
import { doc, collection, query, where, limit } from "firebase/firestore";
import type { NavigationSetting, UserRole, Job } from "@/lib/types";
import {
  MENU_CONFIG,
  ALL_MENU_GROUPS,
  normalizeMenuKey,
  normalizeMenuRole,
  normalizeMenuVisibilityKeys,
} from "@/lib/menu-config";
import {
  CheckSquare,
  FileHeart,
  Briefcase,
  CalendarOff,
  User,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  isActiveEmployeeEligibleForLeave,
  canUserReview,
} from "@/lib/auth-eligibility";

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
  menuConfig: manualMenuConfig,
}: DashboardLayoutProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  // Fetch employee_profiles by uid — this is the primary source for hrdEmploymentInfo
  const profileDocRef = useMemoFirebase(
    () =>
      userProfile?.uid
        ? doc(firestore, "employee_profiles", userProfile.uid)
        : null,
    [userProfile?.uid, firestore],
  );
  const { data: employeeProfile } = useDoc<any>(profileDocRef);

  const roleKey = useMemo(() => {
    if (!userProfile) return null;
    if (
      userProfile.role === "karyawan" &&
      userProfile.employmentType &&
      userProfile.employmentType !== "karyawan"
    ) {
      return `karyawan-${userProfile.employmentType}`;
    }
    return userProfile.role;
  }, [userProfile]);

  // For navigation_settings lookup, normalize director/management roles to 'manager'
  const menuRoleKey = useMemo(() => {
    if (!roleKey) return null;
    // Use structural level if available for better normalization
    return normalizeMenuRole(roleKey, (userProfile as any)?.structuralLevel);
  }, [roleKey, userProfile]);

  const settingsDocRef = useMemoFirebase(
    () =>
      menuRoleKey ? doc(firestore, "navigation_settings", menuRoleKey) : null,
    [menuRoleKey, firestore],
  );
  const { data: navSettings, isLoading: isLoadingSettings } =
    useDoc<NavigationSetting>(settingsDocRef);

  // Realtime checks for recruitment-related assignments across multiple sources
  const panelistQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "applications"),
      where("allPanelistIds", "array-contains", userProfile.uid),
      limit(1),
    );
  }, [firestore, userProfile?.uid]);

  const jobQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "jobs"),
      where("assignedUserIds", "array-contains", userProfile.uid),
      limit(1),
    );
  }, [firestore, userProfile?.uid]);

  const { data: panelistAssignments, isLoading: isLoadingPanelists } =
    useCollection(panelistQuery);
  const { data: jobAssignments, isLoading: isLoadingJobs } =
    useCollection(jobQuery);

  const pendingBankRequestsQuery = useMemoFirebase(() => {
    if (roleKey === "hrd" || roleKey === "super-admin") {
      return query(
        collection(firestore, "bank_change_requests"),
        where("status", "==", "pending"),
      );
    }
    return null;
  }, [firestore, roleKey]);
  const { data: pendingBankRequests } = useCollection(pendingBankRequestsQuery);

  const hasAnyAssignment =
    (panelistAssignments && panelistAssignments.length > 0) ||
    (jobAssignments && jobAssignments.length > 0);

  const isAssignmentLoading = isLoadingPanelists || isLoadingJobs;

  const menuConfig = useMemo(() => {
    if (!roleKey) return [];

    // For menu lookup, use normalized role to get base config
    let lookupKey = menuRoleKey;
    if (!MENU_CONFIG[lookupKey]) {
      // Fall back to 'karyawan' if roleKey is 'karyawan-something' (like 'karyawan-kontrak') and doesn't exist in MENU_CONFIG
      lookupKey = MENU_CONFIG[roleKey]
        ? roleKey
        : roleKey.startsWith("karyawan-")
          ? "karyawan"
          : roleKey;
    }

    // Debug logging
    if (userProfile?.uid) {
      console.log("sidebar-menu-role", {
        uid: userProfile.uid,
        role: userProfile.role,
        structuralLevel: (userProfile as any)?.structuralLevel,
        roleKey,
        menuRoleKey,
        lookupKey,
        visibleMenuCount: navSettings?.visibleMenuItems?.length || 0,
      });
    }

    const hasNavigationSettings =
      !isLoadingSettings && Array.isArray(navSettings?.visibleMenuItems);
    const baseConfigSource = hasNavigationSettings
      ? ALL_MENU_GROUPS
      : MENU_CONFIG[lookupKey] || [];

    let finalConfig = baseConfigSource.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item })),
    }));

    if (hasNavigationSettings) {
      const visibleKeys = new Set(
        normalizeMenuVisibilityKeys(navSettings?.visibleMenuItems || []),
      );

      if (roleKey === "super-admin" || roleKey === "hrd") {
        visibleKeys.add("overtime_payroll_recap");
        visibleKeys.add("hrd.dashboard.karyawan");
        visibleKeys.add("hrd.dashboard.rekrutmen");
      }

      // First pass: filter by visibility
      finalConfig = ALL_MENU_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          visibleKeys.has(normalizeMenuKey(item.key)),
        ),
      })).filter((group) => group.items.length > 0);

      // Second pass: deduplicate menu items by normalized key
      const seenNormalizedKeys = new Set<string>();
      finalConfig = finalConfig
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const normalizedKey = normalizeMenuKey(item.key);
            if (seenNormalizedKeys.has(normalizedKey)) {
              return false; // Skip duplicate
            }
            seenNormalizedKeys.add(normalizedKey);
            return true;
          }),
        }))
        .filter((group) => group.items.length > 0);
    }

    if (userProfile?.isDivisionManager) {
      const overtimeApprovalMenu: MenuItem = {
        key: "manager.overtime_approval",
        href: "/admin/manager/persetujuan-lembur",
        label: "Persetujuan Lembur Tim",
        icon: createElement(CheckSquare),
      };
      const permissionApprovalMenu: MenuItem = {
        key: "manager.permission_approval",
        href: "/admin/manager/persetujuan-izin",
        label: "Persetujuan Izin Tim",
        icon: createElement(FileHeart),
      };
      const leaveApprovalMenu: MenuItem = {
        key: "manager.leave_approval",
        href: "/admin/manager/persetujuan-cuti",
        label: "Persetujuan Cuti Tim",
        icon: createElement(CalendarOff),
      };

      let reviewGroup = finalConfig.find(
        (g: MenuGroup) => g.title === "Review",
      );
      if (!reviewGroup) {
        reviewGroup = { title: "Review", items: [] };
        finalConfig.push(reviewGroup);
      }

      if (
        !reviewGroup.items.some(
          (item: MenuItem) => item.key === overtimeApprovalMenu.key,
        )
      ) {
        reviewGroup.items.push(overtimeApprovalMenu);
      }
      if (
        !reviewGroup.items.some(
          (item: MenuItem) => item.key === permissionApprovalMenu.key,
        )
      ) {
        reviewGroup.items.push(permissionApprovalMenu);
      }
      if (
        !reviewGroup.items.some(
          (item: MenuItem) => item.key === leaveApprovalMenu.key,
        )
      ) {
        reviewGroup.items.push(leaveApprovalMenu);
      }
    }

    // Detect manager/director/management users who are also active employees
    const isManagerOrDirector =
      menuRoleKey === "manager" &&
      !["super-admin", "hrd", "karyawan"].includes(roleKey || "");
    const isActiveEmployee =
      userProfile?.isEmployee === true ||
      employeeProfile?.isEmployee === true ||
      userProfile?.canUseEmployeeFeatures === true ||
      employeeProfile?.canUseEmployeeFeatures === true ||
      employeeProfile?.employmentStatus === "active";
    const canShowPersonalMenus =
      isActiveEmployee &&
      (isManagerOrDirector ||
        roleKey === "hrd" ||
        roleKey === "super-admin" ||
        roleKey === "karyawan" ||
        (roleKey || "").startsWith("karyawan-"));

    let currentConfig = hasNavigationSettings
      ? finalConfig
      : manualMenuConfig || finalConfig;

    const leaveStatus = isActiveEmployeeEligibleForLeave(
      userProfile,
      employeeProfile,
    );
    const userCanReview = canUserReview(userProfile) || menuRoleKey === "manager";

    // Check if user is management-level (director, management, structuralLevel=management)
    const isManagementLevel =
      (userProfile as any)?.structuralLevel === "management" ||
      menuRoleKey === "manager";

    currentConfig = currentConfig
      .map((group: MenuGroup) => ({
        ...group,
        items: group.items.filter((item) => {
          // When navSettings is the authority, trust its filtering and skip secondary filters
          // Only apply business rule filters (recruitment assignment checks)
          if (hasNavigationSettings) {
            if (
              item.key === "recruitment.tasks" &&
              (isAssignmentLoading || !hasAnyAssignment)
            ) {
              return false;
            }

            // navSettings is the authority - don't apply eligibility checks
            return true;
          }

          // Fallback filters when navSettings is NOT configured
          if (item.key === "employee.leave") {
            // Manager/director who is an employee: let navSettings decide (bypass eligibility)
            if (isManagerOrDirector && isActiveEmployee) return true;
            return leaveStatus.isEligible;
          }

          if (item.key === "management.business_trip_missions") {
            if (roleKey === "super-admin") return true;
            // Show for management-level users (director, management structuralLevel)
            if (isManagementLevel) return true;
            const title = (
              employeeProfile?.jobTitle ||
              employeeProfile?.organizationRole ||
              ""
            ).toLowerCase();
            return title.includes("director") || title.includes("direktur");
          }

          if (item.key === "review.dinas.validation") {
            return !!userProfile?.isDivisionManager;
          }

          const reviewKeys = [
            "review.reports",
            "manager.overtime_approval",
            "manager.permission_approval",
            "manager.leave_approval",
            "hrd.permission_approval",
            "hrd.overtime_approval",
            "hrd.leave_approval",
          ];
          if (reviewKeys.includes(item.key) && !userCanReview) {
            return false;
          }

          if (
            item.key === "recruitment.tasks" &&
            (isAssignmentLoading || !hasAnyAssignment)
          ) {
            return false;
          }

          return true;
        }),
      }))
      .filter((group) => {
        if (hasNavigationSettings) {
          // navSettings already filtered items, just remove empty groups
          return group.items.length > 0;
        }
        // Fallback: filter Review group when navSettings not configured
        if (group.title === "Review" && !userCanReview) {
          return false;
        }
        return group.items.length > 0;
      });

    // Inject personal employee menus AFTER navSettings filter
    // When navSettings is available, ensure personal items from access control rules are injected
    // For fallback (no navSettings): only inject if canShowPersonalMenus is true
    const shouldInjectPersonal =
      !manualMenuConfig &&
      (canShowPersonalMenus || hasNavigationSettings);

    if (shouldInjectPersonal) {
      const visibleKeys = new Set(
        normalizeMenuVisibilityKeys(navSettings?.visibleMenuItems || []),
      );
      const hasNavSettings =
        !isLoadingSettings && !!navSettings?.visibleMenuItems;

      const personalItems: MenuItem[] = [];

      if (
        !hasNavSettings ||
        visibleKeys.has(normalizeMenuKey("employee.profile"))
      ) {
        personalItems.push({
          key: "employee.profile",
          href: "/admin/karyawan/profile",
          label: "Data Diri Karyawan",
          icon: createElement(User),
        });
      }
      if (
        !hasNavSettings ||
        visibleKeys.has(normalizeMenuKey("employee.permission"))
      ) {
        personalItems.push({
          key: "employee.permission",
          href: "/admin/karyawan/pengajuan-izin",
          label: "Pengajuan Izin",
          icon: createElement(FileHeart),
        });
      }
      if (
        !hasNavSettings ||
        visibleKeys.has(normalizeMenuKey("employee.leave"))
      ) {
        personalItems.push({
          key: "employee.leave",
          href: "/admin/karyawan/pengajuan-cuti",
          label: "Pengajuan Cuti",
          icon: createElement(CalendarOff),
        });
      }
      if (
        !hasNavSettings ||
        visibleKeys.has(normalizeMenuKey("employee.dinas.confirmation"))
      ) {
        personalItems.push({
          key: "employee.dinas.confirmation",
          href: "/admin/karyawan/konfirmasi-dinas",
          label: "Konfirmasi & Laporan Dinas",
          icon: createElement(MapPin),
        });
      }
      if (
        isManagementLevel &&
        (!hasNavSettings ||
          visibleKeys.has(
            normalizeMenuKey("management.business_trip_missions"),
          ))
      ) {
        personalItems.push({
          key: "management.business_trip_missions",
          href: "/admin/management/perjalanan-dinas",
          label: "Perjalanan Dinas / Misi Dinas",
          icon: createElement(MapPin),
        });
      }

      if (personalItems.length > 0) {
        // Replace existing Personal group or add new one
        const existingIdx = currentConfig.findIndex(
          (g) => g.title === "Personal",
        );
        const existingItems =
          existingIdx >= 0 ? currentConfig[existingIdx].items : [];
        // Merge: keep existing non-duplicate items, add personal employee items
        const mergedItems = [
          ...personalItems,
          ...existingItems.filter(
            (e) => !personalItems.some((p) => p.key === e.key),
          ),
        ];
        if (existingIdx >= 0) {
          currentConfig = currentConfig.map((g, i) =>
            i === existingIdx ? { ...g, items: mergedItems } : g,
          );
        } else {
          currentConfig = [
            ...currentConfig,
            { title: "Personal", items: mergedItems },
          ];
        }
      }
    }

    // Add badges
    currentConfig = currentConfig.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (item.key === "employee.data.karyawan") {
          const count = pendingBankRequests?.length || 0;
          if (count > 0) {
            return {
              ...item,
              badge: (
                <Badge
                  variant="secondary"
                  className="bg-red-500 text-white hover:bg-red-600 px-2 py-0 h-5 text-[10px]"
                >
                  {count}
                </Badge>
              ),
            };
          }
        }
        return item;
      }),
    }));

    return currentConfig;
  }, [
    roleKey,
    userProfile,
    employeeProfile,
    navSettings,
    isLoadingSettings,
    manualMenuConfig,
    isAssignmentLoading,
    hasAnyAssignment,
    pendingBankRequests,
  ]);

  return (
    <SidebarProvider>
      <SidebarNav menuConfig={menuConfig} />
      <SidebarInset>
        <Topbar pageTitle={pageTitle} actionArea={actionArea} />
        <main className="flex-1 items-start gap-4 p-4 sm:px-6 sm:py-6 md:gap-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
