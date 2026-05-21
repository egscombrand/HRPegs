"use client";

import { useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useAuth } from "@/providers/auth-provider";
import { MENU_CONFIG } from "@/lib/menu-config";
import { BusinessTripClient } from "@/components/dashboard/dinas/BusinessTripClient";

export default function PengajuanDinasPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["karyawan", "manager", "hrd", "super-admin"]);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.employmentType === "magang")
      return MENU_CONFIG["karyawan-magang"];
    if (userProfile.employmentType === "training")
      return MENU_CONFIG["karyawan-training"];
    return MENU_CONFIG["karyawan"];
  }, [userProfile]);

  if (!hasAccess) return null;

  return (
    <DashboardLayout pageTitle="Pengajuan Dinas" menuConfig={menuConfig}>
      <BusinessTripClient mode="staff" />
    </DashboardLayout>
  );
}
