"use client";

import { CandidatePortalLayout } from "@/components/careers/CandidatePortalLayout";
import { AccountSettingsPage } from "@/components/account/AccountSettingsPage";

export default function CandidateAccountSettingsPage() {
  return (
    <CandidatePortalLayout>
      <AccountSettingsPage />
    </CandidatePortalLayout>
  );
}
