"use client";

import { useMemo } from "react";
import { useAuth } from "@/providers/auth-provider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { AccountSettingsPage } from "@/components/account/AccountSettingsPage";

export default function AccountSettingsRoute() {
  const { userProfile } = useAuth();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    const roleKey =
      userProfile.role === "karyawan" && userProfile.employmentType
        ? `karyawan-${userProfile.employmentType}`
        : userProfile.role;
    return MENU_CONFIG[roleKey] || [];
  }, [userProfile]);

  return (
    <DashboardLayout pageTitle="Pengaturan Akun" menuConfig={menuConfig}>
      <AccountSettingsPage />
    </DashboardLayout>
  );
}
