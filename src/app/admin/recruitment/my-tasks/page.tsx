'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Briefcase } from 'lucide-react';

export default function MyRecruitmentTasksPage() {
  const { userProfile } = useAuth();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    // We can use a base role config, the layout will add dynamic items
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  return (
    <DashboardLayout pageTitle="Tugas Rekrutmen Saya" menuConfig={menuConfig}>
      <Card>
        <CardHeader>
          <CardTitle>Tugas Rekrutmen Anda</CardTitle>
          <CardDescription>
            Berikut adalah daftar lowongan di mana Anda ditugaskan sebagai bagian dari tim rekrutmen.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-semibold">Fitur Sedang Dikembangkan</p>
            <p className="text-sm text-muted-foreground">
              Daftar lowongan yang ditugaskan kepada Anda akan ditampilkan di sini.
            </p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
