"use client";

import { useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useAuth } from "@/providers/auth-provider";
import { MENU_CONFIG } from "@/lib/menu-config";
import { BusinessTripClient } from "@/components/dashboard/dinas/BusinessTripClient";

export default function SuratTugasPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === "super-admin") return MENU_CONFIG["super-admin"];
    return MENU_CONFIG["hrd"];
  }, [userProfile]);

  if (!hasAccess) return null;

  return (
    <DashboardLayout pageTitle="Surat Perintah Dinas" menuConfig={menuConfig}>
      <BusinessTripClient mode="management" />
    </DashboardLayout>
  );
}
