'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Save } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking, useFirebaseApp } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import type { EcosystemCompany } from '@/lib/types';
import { Label } from '@/components/ui/label';

const formSchema = z.object({
  name: z.string().min(2, "Name is required."),
  websiteUrl: z.string().url("Please enter a valid URL."),
  iconFile: z.any().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0, "Sort order must be a positive number."),
});

type FormValues = z.infer<typeof formSchema>;

interface EcosystemCompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EcosystemCompany | null;
}

export function EcosystemCompanyFormDialog({ open, onOpenChange, item }: EcosystemCompanyFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { toast } = useToast();
  const mode = item ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: item?.name || '',
        websiteUrl: item?.websiteUrl || '',
        isActive: item?.isActive ?? true,
        sortOrder: item?.sortOrder || 0,
        iconFile: undefined,
      });
      setImagePreview(item?.iconUrl || null);
    }
  }, [open, item, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { // 2MB
      toast({ variant: "destructive", title: "File too large", description: "Logo size should not exceed 2MB." });
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    form.setValue('iconFile', file);
  };

  const uploadIcon = async (docId: string, file: File): Promise<string> => {
    const filePath = `ecosystem_logos/${docId}/${file.name}`;
    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  };

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const docRef = item ? doc(firestore, 'ecosystem_companies', item.id!) : doc(collection(firestore, 'ecosystem_companies'));
      let iconUrl = item?.iconUrl || '';

      if (values.iconFile instanceof File) {
        iconUrl = await uploadIcon(docRef.id, values.iconFile);
      }
      
      if (!iconUrl) {
        throw new Error("Logo image is required.");
      }

      const payload: Omit<EcosystemCompany, 'id'> = {
        name: values.name,
        websiteUrl: values.websiteUrl,
        iconUrl: iconUrl,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
        createdAt: item?.createdAt || serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };

      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({ title: `Company ${mode}d`, description: `"${values.name}" has been saved.` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: `Failed to ${mode.toLowerCase()} company`, description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode} Ecosystem Company</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id="ecosystem-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Company Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="websiteUrl" render={({ field }) => (<FormItem><FormLabel>Website URL</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="iconFile" render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo</FormLabel>
                  <FormControl>
                    <label htmlFor="icon-upload" className="relative mt-2 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted transition-colors">
                        {imagePreview ? (
                            <Image src={imagePreview} alt="Logo preview" layout="fill" className="object-contain rounded-lg p-2" />
                        ) : (
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                                <p className="mb-2 text-sm text-primary font-semibold">Choose Logo</p>
                                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 2MB</p>
                            </div>
                        )}
                        <Input id="icon-upload" name={field.name} type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
                    </label>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormDescription>
                      Urutan tampil (angka kecil lebih dulu).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <div className="flex items-center space-x-2 h-10">
                      <FormControl>
                        <Switch
                          id="is-active-switch"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <Label htmlFor="is-active-switch">Active</Label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="ecosystem-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
