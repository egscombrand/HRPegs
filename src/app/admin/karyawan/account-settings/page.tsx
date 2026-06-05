"use client";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AccountSettingsPage } from "@/components/account/AccountSettingsPage";

export default function AccountSettingsRoute() {
  return (
    <DashboardLayout pageTitle="Pengaturan Akun">
      <AccountSettingsPage />
    </DashboardLayout>
  );
}
