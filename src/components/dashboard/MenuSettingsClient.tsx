'use client';

import { useState, useEffect } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { UserRole, ROLES } from '@/lib/types';
import { ALL_UNIQUE_MENU_ITEMS, ALL_MENU_ITEMS } from '@/lib/menu-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type NavigationSettings = {
  id: string; // role name
  visibleMenuItems: string[]; // Now stores keys
}

const rolesToDisplay = ROLES.filter(r => r !== 'kandidat');

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
      const savedSetting = initialSettings?.find(s => s.id === role);
      if (savedSetting) {
        newSettings[role] = savedSetting.visibleMenuItems;
      } else {
        // Default to all keys for that role if no setting exists
        const defaultItemsForRole = ALL_MENU_ITEMS[role as UserRole] || [];
        newSettings[role] = defaultItemsForRole.map(item => item.key);
      }
    });
    
    setSettings(newSettings);
    setIsInitialized(true);

  }, [initialSettings, isLoadingSettings, isInitialized]);

  const handleCheckboxChange = (role: string, menuItemKey: string, checked: boolean) => {
    setSettings(prevSettings => {
      const currentItems = prevSettings[role] || [];
      const newItems = checked
        ? [...currentItems, menuItemKey]
        : currentItems.filter(key => key !== menuItemKey);
      return { ...prevSettings, [role]: newItems };
    });
  };

  const handleSave = async () => {
    setLoading(true);
    const promises = Object.entries(settings).map(([role, visibleMenuItems]) => {
      if (rolesToDisplay.includes(role as UserRole)) {
        const docRef = doc(firestore, 'navigation_settings', role);
        return setDocumentNonBlocking(docRef, { role, visibleMenuItems }, { merge: true });
      }
      return Promise.resolve();
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
            Configure which navigation menu items are visible for each user role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Menu Item</TableHead>
                  {rolesToDisplay.map(role => (
                    <TableHead key={role} className="text-center font-semibold capitalize">{role.replace('-', ' ')}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_UNIQUE_MENU_ITEMS.map(menuItem => {
                   if (menuItem.key.startsWith('candidate.')) return null;
                   return (
                  <TableRow key={menuItem.key}>
                    <TableCell className="font-medium">{menuItem.label}</TableCell>
                    {rolesToDisplay.map(role => {
                      const isVisible = (settings[role] || []).includes(menuItem.key);
                      return (
                        <TableCell key={`${role}-${menuItem.key}`} className="text-center">
                          <Checkbox
                            checked={isVisible}
                            onCheckedChange={(checked) => handleCheckboxChange(role, menuItem.key, !!checked)}
                            id={`${role}-${menuItem.key}`}
                            aria-label={`Toggle ${menuItem.label} for ${role}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                   )
                })}
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
