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

      // Filter by visibility
      finalConfig = ALL_MENU_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          visibleKeys.has(normalizeMenuKey(item.key)),
        ),
      })).filter((group) => group.items.length > 0);
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
    const userCanReview =
      canUserReview(userProfile, employeeProfile) || menuRoleKey === "manager";

    // Check if user is management-level (director, management, structuralLevel=management)
    const isManagementLevel =
      (userProfile as any)?.structuralLevel === "management" ||
      menuRoleKey === "manager";

    currentConfig = currentConfig
      .map((group: MenuGroup) => ({
        ...group,
        items: group.items.filter((item) => {
          // Keys that require review authority — enforced regardless of navSettings.
          // navSettings (Access & Roles) can enable/disable these, but business eligibility
          // always wins: if canUserReview() is false, never show review items.
          const reviewKeys = [
            "review.reports",
            "manager.overtime_approval",
            "manager.permission_approval",
            "manager.leave_approval",
            "review.business_trip_approval",
          ];
          if (reviewKeys.includes(item.key) && !userCanReview) {
            return false;
          }

          // recruitment.tasks requires an active panelist/job assignment — always enforced.
          if (
            item.key === "recruitment.tasks" &&
            (isAssignmentLoading || !hasAnyAssignment)
          ) {
            return false;
          }

          // When navSettings is the authority, it already filtered visible items — trust it.
          if (hasNavigationSettings) {
            return true;
          }

          // Fallback filters when navSettings is NOT configured
          if (item.key === "employee.leave") {
            if (isManagerOrDirector && isActiveEmployee) return true;
            return leaveStatus.isEligible;
          }

          if (item.key === "management.business_trip_missions") {
            if (roleKey === "super-admin") return true;
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

          const hrdOnlyReviewKeys = [
            "hrd.permission_approval",
            "hrd.overtime_approval",
            "hrd.leave_approval",
          ];
          if (hrdOnlyReviewKeys.includes(item.key) && !userCanReview) {
            return false;
          }

          return true;
        }),
      }))
      .filter((group) => {
        // Review group is never shown to non-reviewers, regardless of navSettings
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

    // Final deduplication: Personal group wins over all other groups.
    // Remove any item from non-Personal groups if the same item exists in Personal.
    {
      const personalGroup = currentConfig.find((g) => g.title === "Personal");
      if (personalGroup && personalGroup.items.length > 0) {
        const personalKeys = new Set(
          personalGroup.items.map((i) => normalizeMenuKey(i.key)),
        );
        currentConfig = currentConfig
          .map((group) => {
            if (group.title === "Personal") return group;
            return {
              ...group,
              items: group.items.filter(
                (item) => !personalKeys.has(normalizeMenuKey(item.key)),
              ),
            };
          })
          .filter((g) => g.items.length > 0);
      }
    }

    // Move recruitment.tasks out of Personal and into "Tugas Khusus".
    // It is a team assignment — not a personal employee menu.
    {
      const recruitmentTaskItem: MenuItem = {
        key: "recruitment.tasks",
        href: "/admin/recruitment/my-tasks",
        label: "Tugas Rekrutmen",
        icon: createElement(Briefcase),
      };
      // Remove from any group that currently holds it
      let hasRecruitmentTask = false;
      currentConfig = currentConfig.map((group) => {
        const filtered = group.items.filter((item) => item.key !== "recruitment.tasks");
        if (filtered.length !== group.items.length) hasRecruitmentTask = true;
        return { ...group, items: filtered };
      }).filter((g) => g.items.length > 0);

      // Re-inject under "Tugas Khusus" if the item was present (meaning assignment check passed)
      if (hasRecruitmentTask) {
        const existingIdx = currentConfig.findIndex((g) => g.title === "Tugas Khusus");
        if (existingIdx >= 0) {
          currentConfig = currentConfig.map((g, i) =>
            i === existingIdx
              ? { ...g, items: [...g.items.filter((item) => item.key !== "recruitment.tasks"), recruitmentTaskItem] }
              : g,
          );
        } else {
          currentConfig = [...currentConfig, { title: "Tugas Khusus", items: [recruitmentTaskItem] }];
        }
      }
    }

    // ── Canonical sidebar rebuild for karyawan / manager roles ─────────────────
    // Problem: when navigation_settings (Access & Roles) is active, the sidebar is
    // built from ALL_MENU_GROUPS filtered by visible keys. This can produce legacy
    // section names like "Karyawan" with Dashboard and Pengajuan Lembur inside, and
    // the order is determined by ALL_MENU_GROUPS — not by the desired UX order.
    //
    // Fix: for employee-level roles, discard the group structure entirely and
    // reassign every visible item to its canonical section purely by item key.
    // navigation_settings still controls WHICH items are visible — it no longer
    // controls section assignment or ordering.
    //
    // Applies to: karyawan, manager, and directors (menuRoleKey === "manager").
    // Excluded: karyawan-magang, karyawan-training (custom section structure).
    const applyCanonicalOrder =
      roleKey === "karyawan" ||
      roleKey === "manager" ||
      menuRoleKey === "manager";

    if (applyCanonicalOrder) {
      // Build a flat map of key → MenuItem from all currently-visible items
      const visibleItems = new Map<string, MenuItem>();
      for (const group of currentConfig) {
        for (const item of group.items) {
          if (!visibleItems.has(item.key)) {
            visibleItems.set(item.key, item);
          }
        }
      }

      // Keys that belong to canonical sections — everything else goes to "other" groups
      const DASHBOARD_KEY = "employee.dashboard";
      const PERSONAL_KEYS = [
        "employee.profile",
        "employee.permission",
        "employee.leave",
        "employee.overtime",
        "employee.dinas.confirmation",
      ];
      const REVIEW_KEYS = [
        "review.reports",
        "manager.overtime_approval",
        "manager.permission_approval",
        "manager.leave_approval",
        "review.business_trip_approval",
      ];
      const TUGAS_KEY = "recruitment.tasks";
      const allCanonicalKeys = new Set([
        DASHBOARD_KEY,
        ...PERSONAL_KEYS,
        ...REVIEW_KEYS,
        TUGAS_KEY,
      ]);

      // Canonical sections — only included if the item is currently visible
      const dashboardItem = visibleItems.get(DASHBOARD_KEY);
      const personalItems = PERSONAL_KEYS
        .map((k) => visibleItems.get(k))
        .filter((item): item is MenuItem => !!item);
      const reviewItems = REVIEW_KEYS
        .map((k) => visibleItems.get(k))
        .filter((item): item is MenuItem => !!item);
      const tugasItem = visibleItems.get(TUGAS_KEY);

      // Non-canonical items (e.g. Manager/My Team, Management/Perjalanan Dinas) —
      // keep them in their existing groups, stripping any canonical items that
      // accidentally ended up there (e.g. "Karyawan" section gets dropped entirely).
      const otherGroups = currentConfig
        .filter(
          (g) =>
            g.title &&
            !["Personal", "Review", "Review Tim", "Tugas Khusus", "Karyawan"].includes(
              g.title,
            ),
        )
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => !allCanonicalKeys.has(item.key)),
        }))
        .filter((g) => g.items.length > 0);

      // Reconstruct in canonical order
      const rebuilt: MenuGroup[] = [];
      if (dashboardItem) rebuilt.push({ items: [dashboardItem] }); // no title = Utama
      if (personalItems.length > 0) rebuilt.push({ title: "Personal", items: personalItems });
      rebuilt.push(...otherGroups);  // role-specific (Manager, Management, etc.)
      if (reviewItems.length > 0) rebuilt.push({ title: "Review Tim", items: reviewItems });
      if (tugasItem) rebuilt.push({ title: "Tugas Khusus", items: [tugasItem] });

      currentConfig = rebuilt;
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
