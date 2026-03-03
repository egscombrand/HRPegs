'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserProfile, ROLES, UserRole, Brand, EMPLOYMENT_TYPES, EmploymentType } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { Checkbox } from '../ui/checkbox';

interface UserFormDialogProps {
  user: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const brandSchema = z.union([z.string(), z.array(z.string())]).optional();

const createSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email({ message: 'A valid email is required.' }),
  employmentType: z.enum(EMPLOYMENT_TYPES, { required_error: 'Jenis pekerja harus dipilih.' }),
  isActive: z.boolean().default(true),
  brandId: brandSchema,
});

const editSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email(), // Readonly
  role: z.enum(ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  isActive: z.boolean(),
  brandId: brandSchema,
});

type FormValues = z.infer<typeof createSchema> | z.infer<typeof editSchema>;

export function UserFormDialog({ user, open, onOpenChange }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { userProfile: currentUserProfile } = useAuth();
  const firestore = useFirestore();
  const mode = user ? 'edit' : 'create';

  const brandsCollectionRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(brandsCollectionRef);

  const form = useForm({
    resolver: zodResolver(mode === 'create' ? createSchema : editSchema),
    defaultValues: {
      fullName: '',
      email: '',
      role: 'karyawan' as UserRole,
      employmentType: 'karyawan' as EmploymentType,
      isActive: true,
      brandId: '' as string | string[] | undefined,
    }
  });

  const role = form.watch('role');

  useEffect(() => {
    if (open) {
      const defaultValues =
        mode === 'edit' && user
          ? {
              fullName: user.fullName,
              email: user.email,
              role: user.role,
              employmentType: user.employmentType || 'karyawan',
              isActive: user.isActive,
              brandId: user.brandId || (user.role === 'hrd' ? [] : ''),
            }
          : {
              fullName: '',
              email: '',
              role: 'karyawan' as UserRole,
              employmentType: 'karyawan' as EmploymentType,
              isActive: true,
              brandId: '',
            };
      form.reset(defaultValues as any);
    }
  }, [user, open, mode, form]);
  
  useEffect(() => {
    const currentBrandId = form.getValues('brandId');
    if (role === 'hrd' && typeof currentBrandId === 'string') {
      form.setValue('brandId', []);
    } else if (role !== 'hrd' && Array.isArray(currentBrandId)) {
      form.setValue('brandId', '');
    }
  }, [role, form]);


  async function onSubmit(values: FormValues) {
    if (!currentUserProfile) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cannot identify current user. Please log in again.' });
        return;
    }
    setLoading(true);
    
    const finalValues: any = { ...values };

    if (finalValues.role !== 'hrd' && (finalValues.brandId === '' || finalValues.brandId === 'unassigned')) {
        finalValues.brandId = null;
    }
    
    if (finalValues.role === 'super-admin') {
      finalValues.brandId = null;
    }

    try {
      if (mode === 'edit' && user) {
        const userDocRef = doc(firestore, 'users', user.uid);
        const editValues = finalValues as z.infer<typeof editSchema>;
        
        const updateData: Partial<UserProfile> = {
          fullName: editValues.fullName,
          role: editValues.role,
          employmentType: editValues.employmentType,
          isActive: editValues.isActive,
          brandId: editValues.brandId ?? null,
        };

        if (updateData.role === 'super-admin') {
          updateData.brandId = null;
        }

        await setDocumentNonBlocking(userDocRef, updateData, { merge: true });

        // Sync role collections for consistency
        const adminRoleDocRef = doc(firestore, 'roles_admin', user.uid);
        const hrdRoleDocRef = doc(firestore, 'roles_hrd', user.uid);
        if (editValues.role === 'hrd') {
          await setDocumentNonBlocking(hrdRoleDocRef, { role: 'hrd' }, {});
        } else {
          await deleteDocumentNonBlocking(hrdRoleDocRef).catch(() => {});
        }
        if (editValues.role === 'super-admin') {
          await setDocumentNonBlocking(adminRoleDocRef, { role: 'super-admin' }, {});
        } else {
          await deleteDocumentNonBlocking(adminRoleDocRef).catch(() => {});
        }

        toast({ title: 'User Updated', description: `${editValues.fullName}'s profile has been updated.` });
        
      } else {
        const createValues = finalValues as z.infer<typeof createSchema>;
        const newUserRef = doc(collection(firestore, 'users'));

        const newUserData: Omit<UserProfile, 'id'> = {
            uid: newUserRef.id,
            fullName: createValues.fullName,
            email: createValues.email,
            role: 'karyawan',
            employmentType: createValues.employmentType,
            isActive: createValues.isActive,
            brandId: createValues.brandId,
            createdAt: serverTimestamp() as any,
            createdBy: currentUserProfile.uid,
        };
        await setDocumentNonBlocking(newUserRef, newUserData);

        toast({ title: 'User Created', description: `A record for ${createValues.fullName} has been created.` });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Error ${mode === 'edit' ? 'updating' : 'creating'} user`,
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit User' : 'Create New User'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? "Change the user's details below." : "Fill in the details for the new user profile. This won't create a login."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto -mr-6 pr-6">
          <Form {...form}>
            <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField control={form.control} name="fullName" render={({ field }) => ( <FormItem> <FormLabel>Full Name</FormLabel> <FormControl> <Input placeholder="John Doe" {...field} /> </FormControl> <FormMessage /> </FormItem> )}/>
                  <FormField control={form.control} name="email" render={({ field }) => ( <FormItem> <FormLabel>Email</FormLabel> <FormControl> <Input placeholder="user@example.com" {...field} readOnly={mode === 'edit'} /> </FormControl> <FormMessage /> </FormItem> )}/>
                  
                  {mode === 'edit' ? (
                      <FormField control={form.control} name="role" render={({ field }) => (<FormItem><FormLabel>Role</FormLabel><Select modal={false} onValueChange={field.onChange} value={(field as any).value}><FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl><SelectContent>{ROLES.map((r) => (<SelectItem key={r} value={r}>{r.replace(/[-_]/g, ' ')}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  ) : (
                      <FormField control={form.control} name="employmentType" render={({ field }) => (<FormItem><FormLabel>Jenis Pekerja</FormLabel><Select modal={false} onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis pekerja" /></SelectTrigger></FormControl><SelectContent>{EMPLOYMENT_TYPES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  )}
                  
                  {mode === 'edit' && (
                     <FormField control={form.control} name="employmentType" render={({ field }) => (<FormItem><FormLabel>Jenis Pekerja</FormLabel><Select modal={false} onValueChange={field.onChange} value={(field as any).value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis pekerja" /></SelectTrigger></FormControl><SelectContent>{EMPLOYMENT_TYPES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  )}


                  {role && role !== 'super-admin' && (
                    role === 'hrd' ? (
                      <FormField
                        control={form.control}
                        name="brandId"
                        render={() => (
                          <FormItem>
                            <FormLabel>Brands</FormLabel>
                            <FormDescription>
                              Assign one or more brands to this HRD user.
                            </FormDescription>
                            <div className="h-24 w-full rounded-md border p-4 overflow-y-auto">
                            {brandsLoading ? (
                              <p>Loading brands...</p>
                            ) : brands && brands.length > 0 ? (
                              brands.map((brand) => (
                                <FormField
                                  key={brand.id}
                                  control={form.control}
                                  name="brandId"
                                  render={({ field }) => {
                                    return (
                                      <FormItem
                                        key={brand.id}
                                        className="flex flex-row items-start space-x-3 space-y-0 mb-2"
                                      >
                                        <FormControl>
                                          <Checkbox
                                            checked={Array.isArray(field.value) && field.value.includes(brand.id!)}
                                            onCheckedChange={(checked) => {
                                              const currentValue = Array.isArray(field.value) ? field.value : [];
                                              return checked
                                                ? field.onChange([...currentValue, brand.id!])
                                                : field.onChange(
                                                    currentValue.filter(
                                                      (value) => value !== brand.id!
                                                    )
                                                  );
                                            }}
                                          />
                                        </FormControl>
                                        <FormLabel className="font-normal">
                                          {brand.name}
                                        </FormLabel>
                                      </FormItem>
                                    );
                                  }}
                                />
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">No brands exist.</p>
                            )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="brandId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Brand</FormLabel>
                            <Select
                              modal={false}
                              onValueChange={field.onChange}
                              value={typeof field.value === 'string' ? field.value : ''}
                              disabled={brandsLoading}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a brand" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {brandsLoading ? (
                                  <SelectItem value="loading" disabled>Loading brands...</SelectItem>
                                ) : (
                                  <>
                                    <SelectItem value="unassigned">None</SelectItem>
                                    {brands && brands.length > 0 ? (
                                      brands.map((brand) => (
                                        <SelectItem key={brand.id!} value={brand.id!}>
                                          {brand.name}
                                        </SelectItem>
                                      ))
                                    ) : (
                                      <SelectItem value="no-brands" disabled>
                                        No brands exist
                                      </SelectItem>
                                    )}
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Assign this user to a brand (optional).
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )
                  )}


                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Active Status</FormLabel>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
            </form>
          </Form>
        </div>
        <DialogFooter className="flex-shrink-0 pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'edit' ? 'Save Changes' : 'Create User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
