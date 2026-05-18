'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { UserRole, ROLES, EMPLOYMENT_TYPES } from '@/lib/types';
import { ALL_MENU_GROUPS, MENU_CONFIG } from '@/lib/menu-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type NavigationSettings = {
  id: string; // role name
  visibleMenuItems: string[]; // Stores menu item keys
}

type DisplayRole = {
  id: string;
  label: string;
};

const rolesToDisplay: DisplayRole[] = [
  { id: 'super-admin', label: 'Super Admin' },
  { id: 'hrd', label: 'HRD' },
  { id: 'manager', label: 'Manager' },
  { id: 'karyawan', label: 'Karyawan (Penuh Waktu)' },
  { id: 'karyawan-magang', label: 'Karyawan (Magang)' },
  { id: 'karyawan-training', label: 'Karyawan (Training)' },
  { id: 'kandidat', label: 'Kandidat' },
];

export function MenuSettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Record<string, string[]>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  const settingsCollectionRef = useMemoFirebase(() => collection(firestore, 'navigation_settings'), [firestore]);
  const { data: initialSettings, isLoading: isLoadingSettings } = useCollection<NavigationSettings>(settingsCollectionRef);

  useEffect(() => {
    if (isLoadingSettings || isInitialized) {
      return;
    }

    const newSettings: Record<string, string[]> = {};
    
    rolesToDisplay.forEach(role => {
      const savedSetting = initialSettings?.find(s => s.id === role.id);
      if (savedSetting) {
        let items = [...savedSetting.visibleMenuItems];
        // Ensure overtime_payroll_recap defaults
        if ((role.id === 'super-admin' || role.id === 'hrd') && !items.includes('overtime_payroll_recap')) {
          items.push('overtime_payroll_recap');
        }
        // Ensure new leave management menu keys default
        if (role.id === 'super-admin') {
          if (!items.includes('hrd.leave_approval')) items.push('hrd.leave_approval');
          if (!items.includes('manager.leave_approval')) items.push('manager.leave_approval');
          if (!items.includes('employee.leave')) items.push('employee.leave');
        } else if (role.id === 'hrd') {
          if (!items.includes('hrd.leave_approval')) items.push('hrd.leave_approval');
        } else if (role.id === 'manager') {
          if (!items.includes('manager.leave_approval')) items.push('manager.leave_approval');
        } else if (role.id === 'karyawan') {
          if (!items.includes('employee.leave')) items.push('employee.leave');
        }
        newSettings[role.id] = items;
      } else {
        // Default to all menus defined for that specific role/sub-role in MENU_CONFIG
        const defaultMenus = MENU_CONFIG[role.id] || [];
        newSettings[role.id] = defaultMenus.flatMap(group => group.items.map(item => item.key));
      }
    });
    
    setSettings(newSettings);
    setIsInitialized(true);

  }, [initialSettings, isLoadingSettings, isInitialized]);

  const handleCheckboxChange = (roleId: string, menuItemKey: string, checked: boolean) => {
    setSettings(prevSettings => {
      const currentItems = prevSettings[roleId] || [];
      const newItems = checked
        ? [...currentItems, menuItemKey]
        : currentItems.filter(key => key !== menuItemKey);
      return { ...prevSettings, [roleId]: newItems };
    });
  };

  const handleSave = async () => {
    setLoading(true);
    const promises = Object.entries(settings).map(([roleId, visibleMenuItems]) => {
      const docRef = doc(firestore, 'navigation_settings', roleId);
      return setDocumentNonBlocking(docRef, { role: roleId, visibleMenuItems }, { merge: true });
    });
    
    await Promise.all(promises);

    toast({
        title: 'Settings Saved',
        description: 'Navigation menu settings have been updated.',
    });
    setLoading(false);
  };
  
  if (!isInitialized) {
    return (
        <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-10 w-32" />
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Menu Visibility Settings</CardTitle>
           <CardDescription>
            Configure which navigation menu items are visible for each user role and type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Menu Item</TableHead>
                  {rolesToDisplay.map(role => (
                    <TableHead key={role.id} className="text-center font-semibold capitalize">{role.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_MENU_GROUPS.map((group, groupIndex) => (
                    <React.Fragment key={group.title || `group-${groupIndex}`}>
                      {group.title && (
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={rolesToDisplay.length + 1} className="py-2 px-4">
                            <h4 className="font-semibold text-sm">{group.title}</h4>
                          </TableCell>
                        </TableRow>
                      )}
                      {group.items.map(menuItem => {
                         return (
                            <TableRow key={menuItem.key}>
                                <TableCell className="font-medium pl-8">{menuItem.label}</TableCell>
                                {rolesToDisplay.map(role => {
                                  const isVisible = (settings[role.id] || []).includes(menuItem.key);
                                  return (
                                    <TableCell key={`${role.id}-${menuItem.key}`} className="text-center">
                                      <Checkbox
                                        checked={isVisible}
                                        onCheckedChange={(checked) => handleCheckboxChange(role.id, menuItem.key, !!checked)}
                                        id={`${role.id}-${menuItem.key}`}
                                        aria-label={`Toggle ${menuItem.label} for ${role.label}`}
                                      />
                                    </TableCell>
                                  );
                                })}
                            </TableRow>
                         )
                      })}
                    </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
