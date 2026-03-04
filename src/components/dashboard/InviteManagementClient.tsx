'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Invite, Brand } from '@/lib/types';
import { EMPLOYMENT_TYPES } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Copy } from 'lucide-react';
import { format } from 'date-fns';

const inviteEmploymentTypes = ['magang', 'training'] as const;

const generateFormSchema = z.object({
  brandId: z.string({ required_error: 'Brand harus dipilih.' }),
  employmentType: z.enum(inviteEmploymentTypes, { required_error: 'Jenis pekerja harus dipilih.' }),
  quantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

export function InviteManagementClient() {
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: invites, isLoading: isLoadingInvites } = useCollection<Invite>(
    useMemoFirebase(() => collection(firestore, 'invites'), [firestore])
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: { quantity: 10 },
  });

  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map(brand => [brand.id!, brand.name]));
  }, [brands]);

  const sortedInvites = useMemo(() => {
    if (!invites) return [];
    return [...invites].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [invites]);

  const getInviteStatus = (invite: Invite) => {
    if (invite.usedAt) return { label: 'Used', variant: 'secondary' } as const;
    if (!invite.isActive) return { label: 'Disabled', variant: 'destructive' } as const;
    if (invite.expiresAt.toDate() < new Date()) return { label: 'Expired', variant: 'outline' } as const;
    return { label: 'Active', variant: 'default' } as const;
  };

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
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate invites.');
      }
      toast({ title: 'Codes Generated', description: `${result.count} new invite codes have been created.` });
      // Data will refresh automatically due to useCollection listener
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Generation Failed', description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const copyToClipboard = (code: string) => {
    const url = `${window.location.origin}/register?code=${code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied!", description: "Registration link copied to clipboard." });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Generate Invites</CardTitle>
            <CardDescription>Create new registration invite codes for employees.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="brandId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger></FormControl>
                        <SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl>
                        <SelectContent>{inviteEmploymentTypes.map(type => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Generate
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Generated Invites</CardTitle>
            <CardDescription>List of all invite codes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingInvites ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                  ) : sortedInvites.length > 0 ? (
                    sortedInvites.map(invite => {
                      const status = getInviteStatus(invite);
                      return (
                        <TableRow key={invite.id}>
                          <TableCell className="font-mono text-xs">{invite.code}</TableCell>
                          <TableCell>{brandMap.get(invite.brandId) || '-'}</TableCell>
                          <TableCell className="capitalize">{invite.employmentType}</TableCell>
                          <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                          <TableCell>{format(invite.expiresAt.toDate(), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-right">
                             <Button variant="outline" size="sm" onClick={() => copyToClipboard(invite.code)}><Copy className="mr-2 h-3 w-3" /> Copy Link</Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">No invites found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
