'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EcosystemCompaniesClient } from '@/components/dashboard/super-admin/EcosystemCompaniesClient';
import { EcosystemSectionsClient } from '@/components/dashboard/super-admin/EcosystemSectionsClient';

export default function EcosystemPage() {
  const hasAccess = useRoleGuard('super-admin');

  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Ecosystem Management" menuConfig={menuConfig}>
      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="sections">Landing Page Sections</TabsTrigger>
        </TabsList>
        <TabsContent value="companies" className="mt-4">
          <EcosystemCompaniesClient />
        </TabsContent>
        <TabsContent value="sections" className="mt-4">
          <EcosystemSectionsClient />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
