'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Timer } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LemburPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);
  
  if (!hasAccess) {
    return <DashboardLayout pageTitle="Monitoring Lembur" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Monitoring Lembur" menuConfig={menuConfig}>
      <p>Fitur ini sedang dalam pengembangan.</p>
    </DashboardLayout>
  );
}
