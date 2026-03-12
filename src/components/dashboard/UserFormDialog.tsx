'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
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
import { UserProfile, ROLES, UserRole, Brand, EMPLOYMENT_TYPES, Division } from '@/lib/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { Checkbox } from '../ui/checkbox';
import { collection, doc, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { Separator } from '../ui/separator';

// --- Zod Schemas for Validation ---
const brandSchema = z.union([z.string(), z.array(z.string())]).optional();

const creatableRoles: UserRole[] = ['hrd', 'manager'];
const allRolesForEdit: UserRole[] = ['super-admin', 'hrd', 'manager', 'karyawan', 'kandidat'];

const baseSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email({ message: 'A valid email is required.' }),
  role: z.enum(ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  isActive: z.boolean().default(true),
  brandId: brandSchema,
  
  // Simplified manager assignment
  isDivisionManager: z.boolean().default(false),
  managedBrandId: z.string().optional().nullable(),
  managedDivision: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
    if (data.isDivisionManager) {
        if (!data.managedBrandId) {
            ctx.addIssue({ path: ["managedBrandId"], message: "Brand harus dipilih." });
        }
        if (!data.managedDivision) {
            ctx.addIssue({ path: ["managedDivision"], message: "Divisi harus dipilih." });
        }
    }
});


const createSchema = baseSchema.extend({
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
  role: z.enum(creatableRoles), // Stricter role validation for creation
});

const editSchema = baseSchema;

type FormValues = z.infer<typeof createSchema> | z.infer<typeof editSchema>;

// --- Component Props ---
interface UserFormDialogProps {
  user: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserFormDialog({ user, open, onOpenChange }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { firebaseUser, userProfile: currentUserProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = user ? 'edit' : 'create';

  const brandsCollectionRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(brandsCollectionRef);

  const form = useForm({
    resolver: zodResolver(mode === 'create' ? createSchema : editSchema),
  });

  const role = form.watch('role');
  const isDivisionManager = form.watch('isDivisionManager');
  const managedBrandId = form.watch('managedBrandId');

  // Fetch divisions for the selected managed brand
  const managedDivisionsQuery = useMemoFirebase(() => {
    if (!managedBrandId) return null;
    return query(
        collection(firestore, 'brands', managedBrandId, 'divisions'),
        where('isActive', '==', true)
    );
  }, [managedBrandId, firestore]);
  const { data: managedDivisions, isLoading: isLoadingManagedDivisions } = useCollection<Division>(managedDivisionsQuery);
  
  // Effect to reset form state when dialog opens or user prop changes
  useEffect(() => {
    if (open) {
      const defaultValues = mode === 'edit' && user ? {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        employmentType: user.employmentType || 'karyawan',
        isActive: user.isActive,
        brandId: user.role === 'hrd' ? (Array.isArray(user.brandId) ? user.brandId : []) : (typeof user.brandId === 'string' ? user.brandId : ''),
        isDivisionManager: user.isDivisionManager || false,
        managedBrandId: user.managedBrandId || null,
        managedDivision: user.managedDivision || null,
      } : { // Create mode
        fullName: '',
        email: '',
        password: '',
        role: 'hrd',
        employmentType: 'karyawan',
        isActive: true,
        brandId: [],
        isDivisionManager: false,
        managedBrandId: null,
        managedDivision: null,
      };
      form.reset(defaultValues as any);
    }
  }, [user, open, mode, form]);
  
  // Effect to adjust brandId type when role changes
  useEffect(() => {
    const currentBrandId = form.getValues('brandId');
    if (role === 'hrd' && typeof currentBrandId !== 'object') {
      form.setValue('brandId', []);
    } else if (role && role !== 'hrd' && Array.isArray(currentBrandId)) {
      form.setValue('brandId', '');
    }
  }, [role, form]);

  // Effect to clear managed fields when user is not a manager
  useEffect(() => {
    if (!isDivisionManager) {
      form.setValue('managedBrandId', null);
      form.setValue('managedDivision', null);
    }
  }, [isDivisionManager, form]);

  // Effect to clear division when brand changes
  useEffect(() => {
      form.setValue('managedDivision', null);
  }, [managedBrandId, form]);

  async function handleCreate(values: FormValues) {
    if (!firebaseUser) throw new Error("Authentication error. Please log in again.");
    
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user.');

    toast({ title: 'User Created', description: `An account for ${(values as any).fullName} has been created.` });
  }

  async function handleEdit(values: FormValues) {
    if (!user) throw new Error("User to edit is not specified.");

    const batch = writeBatch(firestore);
    const userRef = doc(firestore, 'users', user.uid);
    const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
    const hrdRoleRef = doc(firestore, 'roles_hrd', user.uid);

    const dataToUpdate: Partial<UserProfile> = {
        fullName: values.fullName,
        nameLower: values.fullName.toLowerCase(),
        role: values.role,
        employmentType: values.employmentType,
        isActive: values.isActive,
        brandId: values.brandId || null,
        isDivisionManager: values.isDivisionManager,
        managedBrandId: values.isDivisionManager ? values.managedBrandId : null,
        managedDivision: values.isDivisionManager ? values.managedDivision : null,
        updatedAt: serverTimestamp(),
    };
    batch.update(userRef, dataToUpdate);

    if (values.role === 'super-admin') {
      batch.set(adminRoleRef, { role: 'super-admin' });
    } else {
      batch.delete(adminRoleRef);
    }
    
    if (values.role === 'hrd') {
      batch.set(hrdRoleRef, { role: 'hrd' });
    } else {
      batch.delete(hrdRoleRef);
    }
    
    await batch.commit();
    toast({ title: 'User Updated', description: `${values.fullName}'s profile has been updated.` });
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      if (mode === 'create') {
        await handleCreate(values);
      } else {
        await handleEdit(values);
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: `Error: ${mode === 'edit' ? 'Updating' : 'Creating'} User`, description: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>{mode === 'edit' ? 'Edit Pengguna' : 'Buat Pengguna Baru'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? "Ubah detail pengguna di bawah ini." : "Isi detail untuk akun pengguna baru."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto">
            <Form {...form}>
              <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 px-6 py-4">

                <section className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2 mb-4">Informasi Akun</h3>
                  <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="user@example.com" {...field} readOnly={mode === 'edit'} /></FormControl><FormMessage /></FormItem>)} />
                  {mode === 'create' && (<FormField control={form.control} name="password" render={({ field }) => (<FormItem><FormLabel>Password</FormLabel><div className="relative"><FormControl><Input type={showPassword ? 'text' : 'password'} placeholder="********" className="pr-10" autoComplete="new-password" {...field} /></FormControl><button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div><FormMessage /></FormItem>)} />)}
                </section>

                <Separator />

                <section className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2 mb-4">Hak Akses & Penempatan</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={mode === 'edit' && user?.role === 'super-admin'}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(mode === 'create' ? creatableRoles : allRolesForEdit).map((r) => (
                                <SelectItem key={r} value={r} className="capitalize">{r.replace(/[-_]/g, ' ')}</SelectItem>
                              ))}
                            </SelectContent>
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
                          <FormLabel>Jenis Pekerja</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Pilih jenis pekerja" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {EMPLOYMENT_TYPES.map((r) => (
                                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {role && role !== 'super-admin' && (
                    role === 'hrd' ? (
                       <FormField
                          control={form.control}
                          name="brandId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Akses Brand HRD</FormLabel>
                              <FormDescription>Pilih satu atau lebih brand yang akan dikelola oleh HRD ini.</FormDescription>
                              <div className="max-h-32 w-full rounded-md border p-4 overflow-y-auto space-y-2">
                                 {brandsLoading ? (
                                  <p className="text-sm text-muted-foreground">Loading brands...</p>
                                 ) : (
                                  brands?.map((brand) => (
                                    <FormItem key={brand.id} className="flex flex-row items-center space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={Array.isArray(field.value) && field.value.includes(brand.id!)}
                                                onCheckedChange={(checked) => {
                                                    const currentValues = Array.isArray(field.value) ? field.value : [];
                                                    const newBrandIds = checked
                                                        ? [...currentValues, brand.id!]
                                                        : currentValues.filter((value) => value !== brand.id!);
                                                    field.onChange(newBrandIds);
                                                }}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer">{brand.name}</FormLabel>
                                    </FormItem>
                                  ))
                                 )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                    ) : (
                      <FormField control={form.control} name="brandId" render={({ field }) => (<FormItem><FormLabel>Brand Penempatan</FormLabel><Select onValueChange={(value) => field.onChange(value === 'unassigned' ? '' : value)} value={typeof field.value === 'string' ? field.value : ''} disabled={brandsLoading}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand utama user ini." /></SelectTrigger></FormControl><SelectContent><SelectItem value="unassigned">None</SelectItem>{brands?.map((brand) => (<SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>))}</SelectContent></Select><FormDescription>Pilih brand utama user ini.</FormDescription><FormMessage /></FormItem>)}/>
                    )
                  )}
                </section>

                {currentUserProfile?.role === 'super-admin' && mode === 'edit' && user?.role !== 'super-admin' && (
                  <>
                      <Separator />
                      <section className="space-y-4">
                          <h3 className="text-lg font-semibold border-b pb-2 mb-4">Penugasan Manajer Divisi</h3>
                          <FormField
                              control={form.control}
                              name="isDivisionManager"
                              render={({ field }) => (
                                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                      <div className="space-y-0.5">
                                          <FormLabel>Jadikan sebagai Manager Divisi</FormLabel>
                                          <FormDescription>Aktifkan untuk menetapkan pengguna ini sebagai penanggung jawab sebuah divisi.</FormDescription>
                                      </div>
                                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                  </FormItem>
                              )}
                          />
                          {isDivisionManager && (
                              <div className="p-4 border rounded-lg space-y-4">
                                  <FormField
                                    control={form.control}
                                    name="managedBrandId"
                                    render={({ field }) => (<FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value ?? ''} disabled={brandsLoading}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl><SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}
                                  />
                                  <FormField
                                      control={form.control}
                                      name="managedDivision"
                                      render={({ field }) => (
                                          <FormItem>
                                              <FormLabel>Divisi</FormLabel>
                                              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!managedBrandId || isLoadingManagedDivisions}>
                                                  <FormControl>
                                                      <SelectTrigger>
                                                          <SelectValue placeholder={
                                                              isLoadingManagedDivisions ? "Loading..." :
                                                              !managedBrandId ? "Pilih brand dulu" : 
                                                              "Pilih divisi"
                                                          } />
                                                      </SelectTrigger>
                                                  </FormControl>
                                                  <SelectContent>
                                                      {!isLoadingManagedDivisions && managedDivisions?.map(d => (
                                                          <SelectItem key={d.id!} value={d.name}>{d.name}</SelectItem>
                                                      ))}
                                                  </SelectContent>
                                              </Select>
                                              <FormMessage />
                                          </FormItem>
                                      )}
                                  />
                              </div>
                          )}
                      </section>
                  </>
                )}
                
                <Separator />
                
                <section>
                   <h3 className="text-lg font-semibold border-b pb-2 mb-4">Status</h3>
                  <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Status Aktif</FormLabel><FormDescription>Nonaktifkan untuk menonaktifkan sementara akses pengguna.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                </section>

              </form>
            </Form>
        </div>
        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="user-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'edit' ? 'Simpan Perubahan' : 'Buat Pengguna'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
