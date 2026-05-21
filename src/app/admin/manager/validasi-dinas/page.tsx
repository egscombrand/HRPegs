"use client";

import { useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useAuth } from "@/providers/auth-provider";
import { MENU_CONFIG } from "@/lib/menu-config";
import { BusinessTripClient } from "@/components/dashboard/dinas/BusinessTripClient";

export default function ValidasiDinasPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["manager", "hrd", "super-admin"]);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === "super-admin") return MENU_CONFIG["super-admin"];
    return MENU_CONFIG["manager"];
  }, [userProfile]);

  if (!hasAccess) return null;

  return (
    <DashboardLayout pageTitle="Validasi Dinas Staff" menuConfig={menuConfig}>
      <BusinessTripClient mode="manager" />
    </DashboardLayout>
  );
}
