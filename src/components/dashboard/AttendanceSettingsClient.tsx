
'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { AttendanceSite, Brand } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2, Edit, MapPin } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { AttendanceSiteFormDialog } from './AttendanceSiteFormDialog';

export function AttendanceSettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<AttendanceSite | null>(null);

  const { data: sites, isLoading: isLoadingSites } = useCollection<AttendanceSite>(
    useMemoFirebase(() => collection(firestore, 'attendance_sites'), [firestore])
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );
  
  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map(brand => [brand.id!, brand.name]));
  }, [brands]);

  const handleCreate = () => {
    setSelectedSite(null);
    setIsFormOpen(true);
  };

  const handleEdit = (site: AttendanceSite) => {
    setSelectedSite(site);
    setIsFormOpen(true);
  };
  
  const handleDelete = (site: AttendanceSite) => {
    setSelectedSite(site);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedSite?.id) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'attendance_sites', selectedSite.id));
      toast({ title: 'Site Deleted', description: `Site "${selectedSite.name}" has been removed.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>Pengaturan Situs Absensi</CardTitle>
                <CardDescription>Kelola semua lokasi kantor dan aturan absensi yang berlaku.</CardDescription>
            </div>
            <Button onClick={handleCreate}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Tambah Site Baru
            </Button>
        </CardHeader>
        <CardContent>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nama Site</TableHead>
                            <TableHead>Brand Terkait</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoadingSites || isLoadingBrands ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading sites...</TableCell></TableRow>
                        ) : sites && sites.length > 0 ? (
                            sites.map(site => (
                                <TableRow key={site.id}>
                                    <TableCell className="font-medium">{site.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {site.brandIds.map(id => (
                                                <Badge key={id} variant="secondary">{brandMap.get(id) || id}</Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell><Badge variant={site.isActive ? 'default' : 'outline'}>{site.isActive ? 'Aktif' : 'Non-Aktif'}</Badge></TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(site)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                         <Button variant="ghost" size="icon" onClick={() => handleDelete(site)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    Belum ada situs yang dikonfigurasi.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
      
      <AttendanceSiteFormDialog 
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        site={selectedSite}
        brands={brands || []}
      />
      
      <DeleteConfirmationDialog 
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedSite?.name}
        itemType="Attendance Site"
      />
    </>
  );
}
