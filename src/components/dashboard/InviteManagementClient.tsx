'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import type { InviteBatch, Brand, UserProfile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Copy, Users, Trash2, UserX } from 'lucide-react';
import { format } from 'date-fns';
import { KpiCard } from '../recruitment/KpiCard';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const inviteEmploymentTypes = ['karyawan', 'magang', 'training'] as const;

const generateFormSchema = z.object({
  brandId: z.string({ required_error: 'Brand harus dipilih.' }),
  employmentType: z.enum(inviteEmploymentTypes, { required_error: 'Jenis pekerja harus dipilih.' }),
  quantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});
type GenerateFormValues = z.infer<typeof generateFormSchema>;

const addQuotaSchema = z.object({
  additionalQuantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});
type AddQuotaFormValues = z.infer<typeof addQuotaSchema>;


function AddQuotaDialog({ batch, open, onOpenChange, onQuotaAdded }: { batch: InviteBatch | null, open: boolean, onOpenChange: (open: boolean) => void, onQuotaAdded: () => void }) {
    const { firebaseUser } = useAuth();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    
    const form = useForm<AddQuotaFormValues>({
        resolver: zodResolver(addQuotaSchema),
        defaultValues: { additionalQuantity: 5 },
    });

    useEffect(() => {
        if(open) {
            form.reset({ additionalQuantity: 5 });
        }
    }, [open, form]);

    const handleAddQuota = async (values: AddQuotaFormValues) => {
        if (!batch || !firebaseUser) return;
        setIsSaving(true);
        try {
            const idToken = await firebaseUser.getIdToken();
            const response = await fetch(`/api/admin/invite-batches/${batch.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ additionalQuantity: values.additionalQuantity }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Gagal menambah kuota.');
            
            toast({ title: 'Kuota Ditambahkan', description: `${values.additionalQuantity} slot baru telah ditambahkan ke batch ini.` });
            onQuotaAdded();
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal', description: e.message });
        } finally {
            setIsSaving(false);
        }
    }

    if (!batch) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Tambah Kuota untuk: {batch.brandName}</DialogTitle>
                    <DialogDescription>
                        Menambah jumlah slot yang tersedia untuk batch undangan {batch.employmentType}. Link undangan tetap sama.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="add-quota-form" onSubmit={form.handleSubmit(handleAddQuota)} className="space-y-4 py-4">
                         <FormField
                            control={form.control}
                            name="additionalQuantity"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Jumlah Kuota Tambahan</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                 <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
                    <Button type="submit" form="add-quota-form" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Tambah
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export function InviteManagementClient() {
  const { firebaseUser, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandFilter, setBrandFilter] = useState('all');
  const [addQuotaBatch, setAddQuotaBatch] = useState<InviteBatch | null>(null);

  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeleteUserConfirmOpen, setIsDeleteUserConfirmOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<InviteBatch | null>(null);
  const [isDeleteBatchConfirmOpen, setIsDeleteBatchConfirmOpen] = useState(false);

  const { data: inviteBatches, isLoading: isLoadingInvites, mutate: mutateBatches } = useCollection<InviteBatch>(
    useMemoFirebase(() => collection(firestore, 'invite_batches'), [firestore])
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(
    useMemoFirebase(() => query(collection(firestore, 'users'), where('employmentType', 'in', ['magang', 'training'])), [firestore])
  );

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: { quantity: 10 },
  });

  const filteredBatches = useMemo(() => {
    if (!inviteBatches) return [];
    if (brandFilter === 'all') return inviteBatches;
    return inviteBatches.filter(batch => batch.brandId === brandFilter);
  }, [inviteBatches, brandFilter]);

  const summary = useMemo(() => {
    const batches = filteredBatches || [];
    const total = batches.reduce((sum, batch) => sum + batch.totalSlots, 0);
    const used = batches.reduce((sum, batch) => sum + batch.claimedSlots, 0);
    const rate = total > 0 ? (used / total) * 100 : 0;
    return { total, used, rate: Math.round(rate) };
  }, [filteredBatches]);
  
  const sortedBatches = useMemo(() => {
    if (!filteredBatches) return [];
    return [...filteredBatches].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [filteredBatches]);

  const usersByBatch = useMemo(() => {
    if (!users) return new Map<string, UserProfile[]>();
    return users.reduce((acc, user) => {
        if (user.inviteBatchId) {
            if (!acc.has(user.inviteBatchId)) {
                acc.set(user.inviteBatchId, []);
            }
            acc.get(user.inviteBatchId)!.push(user);
        }
        return acc;
    }, new Map<string, UserProfile[]>());
  }, [users]);


  const handleGenerate = async (values: GenerateFormValues) => {
    if (!firebaseUser) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      return;
    }
    setIsGenerating(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/admin/generate-invites', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to generate invite batch.');
      toast({ title: 'Batch Undangan Dibuat', description: `Satu link undangan dengan kuota ${result.totalSlots} telah dibuat.` });
      form.reset({ brandId: values.brandId, employmentType: values.employmentType, quantity: 10 });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Membuat Batch', description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDeleteUserClick = (user: UserProfile) => {
    setUserToDelete(user);
    setIsDeleteUserConfirmOpen(true);
  };
  
  const confirmDeleteUser = async () => {
    if (!userToDelete || !firebaseUser) return;
    try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch(`/api/users/${userToDelete.uid}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${idToken}`,
            },
        });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to delete user.');
        }
        toast({ title: 'Pengguna Dihapus', description: `Akun untuk ${userToDelete.fullName} telah dihapus.` });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Gagal menghapus pengguna',
            description: error.message,
        });
    } finally {
        setIsDeleteUserConfirmOpen(false);
        setUserToDelete(null);
    }
  };
  
  const handleDeleteBatchClick = (batch: InviteBatch) => {
    setBatchToDelete(batch);
    setIsDeleteBatchConfirmOpen(true);
  };

  const confirmDeleteBatch = async () => {
    if (!batchToDelete || !firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/invite-batches/${batchToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete batch.');
      }
      toast({ title: 'Batch Dihapus', description: `Batch undangan untuk ${batchToDelete.brandName} telah dihapus.` });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Menghapus Batch',
        description: error.message,
      });
    } finally {
      setIsDeleteBatchConfirmOpen(false);
      setBatchToDelete(null);
    }
  };


  const copyToClipboard = (batchId: string) => {
    const url = `${window.location.origin}/register?batch=${batchId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Disalin!", description: "Link registrasi untuk batch ini telah disalin." });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-end">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Filter by brand..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brands?.map(brand => <SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard title="Total Kuota Undangan" value={summary.total} />
          <KpiCard title="Kuota Terpakai" value={summary.used} />
          <KpiCard title="Tingkat Penggunaan" value={`${summary.rate}%`} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Buat Batch Undangan Baru</CardTitle>
                <CardDescription>Satu link untuk banyak pengguna dengan kuota terbatas.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-4">
                    <FormField control={form.control} name="brandId" render={({ field }) => (<FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl><SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="employmentType" render={({ field }) => (<FormItem><FormLabel>Jenis Pekerja</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl><SelectContent>{inviteEmploymentTypes.map(type => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Jumlah Kuota</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <Button type="submit" className="w-full" disabled={isGenerating}>
                      {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                      Generate Batch
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Daftar Batch Undangan</CardTitle>
                <CardDescription>Kelola dan pantau penggunaan link undangan yang telah dibuat.</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {isLoadingInvites ? <p>Loading...</p> 
                    : sortedBatches.length > 0 ? sortedBatches.map(batch => {
                      const registeredUsers = usersByBatch.get(batch.id!) || [];
                      return (
                        <AccordionItem value={batch.id!} key={batch.id!} className="border rounded-md px-4 bg-background">
                           <AccordionTrigger className="hover:no-underline [&[data-state=open]>div>button]:bg-muted">
                                <div className="flex justify-between items-center w-full pr-4">
                                    <div>
                                        <p className="font-semibold text-left">{batch.brandName}</p>
                                        <p className="text-sm text-muted-foreground capitalize text-left">{batch.employmentType}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">{batch.claimedSlots} / {batch.totalSlots} Terpakai</Badge>
                                         <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setAddQuotaBatch(batch); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setAddQuotaBatch(batch); }}} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "cursor-pointer")}>
                                            <PlusCircle className="mr-2 h-3 w-3"/> Tambah
                                         </div>
                                         <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); copyToClipboard(batch.id!); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); copyToClipboard(batch.id!); }}} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "cursor-pointer")}>
                                            <Copy className="mr-2 h-3 w-3" /> Salin Link
                                        </div>
                                        <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); handleDeleteBatchClick(batch); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleDeleteBatchClick(batch); }}} className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "h-8 w-8 cursor-pointer")}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </div>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <Separator className="mb-4" />
                                {registeredUsers.length > 0 ? (
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead>{userProfile?.role === 'super-admin' && <TableHead className="text-right">Aksi</TableHead>}</TableRow></TableHeader>
                                        <TableBody>
                                            {registeredUsers.map(user => (
                                                <TableRow key={user.uid}>
                                                    <TableCell className="flex items-center gap-2 font-medium"><Avatar className="h-6 w-6"><AvatarFallback>{getInitials(user.fullName)}</AvatarFallback></Avatar>{user.fullName}</TableCell>
                                                    <TableCell>{user.email}</TableCell>
                                                     {userProfile?.role === 'super-admin' && (
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteUserClick(user)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                        </TableCell>
                                                     )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <p className="text-center text-sm text-muted-foreground py-4">Belum ada yang menggunakan undangan dari batch ini.</p>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                      )
                    })
                    : <p className="text-center text-sm text-muted-foreground py-4">Belum ada batch undangan yang dibuat.</p>
                  }
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <DeleteConfirmationDialog 
        open={isDeleteUserConfirmOpen}
        onOpenChange={setIsDeleteUserConfirmOpen}
        onConfirm={confirmDeleteUser}
        itemName={userToDelete?.fullName}
        itemType="User Account"
      />
       <DeleteConfirmationDialog
        open={isDeleteBatchConfirmOpen}
        onOpenChange={setIsDeleteBatchConfirmOpen}
        onConfirm={confirmDeleteBatch}
        itemName={batchToDelete?.brandName}
        itemType={`Invite Batch (${batchToDelete?.employmentType})`}
      />
      <AddQuotaDialog
        batch={addQuotaBatch}
        open={!!addQuotaBatch}
        onOpenChange={(open) => !open && setAddQuotaBatch(null)}
        onQuotaAdded={mutateBatches}
      />
    </>
  );
}
