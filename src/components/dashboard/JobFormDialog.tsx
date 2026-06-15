'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { doc, collection, serverTimestamp, query, where, Timestamp } from 'firebase/firestore';
import { uploadFile } from '@/lib/storage/storage-adapter';
import { validateStorageFile, compressImage, handleStorageError } from "@/lib/storage-utils";
import { useFirestore, setDocumentNonBlocking, useFirebaseApp, useCollection, useMemoFirebase } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Info, SaveIcon, SendIcon } from 'lucide-react';
import type { Job, Brand, Division } from '@/lib/types';
import { RichTextEditor } from '../ui/RichTextEditor';
import { GoogleDatePicker } from '../ui/google-date-picker';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cleanUndefined = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  );
};

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const generateShortId = () => Math.random().toString(36).substring(2, 6);

const generateJobCode = (position: string, brandName: string) => {
  const pos = position.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const brand = brandName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
  const num = Math.floor(Math.random() * 900 + 100);
  return `${pos}-${brand}-${num}`;
};

const formSchema = z.object({
  position: z.string().min(3, { message: 'Posisi harus diisi.' }),
  statusJob: z.enum(['fulltime', 'internship']),
  divisionId: z.string().optional().nullable(),
  location: z.string().min(2, { message: 'Lokasi harus diisi.' }),
  brandId: z.string({ required_error: 'Brand/Perusahaan wajib dipilih.' }),
  workMode: z.enum(['onsite', 'hybrid', 'remote']).optional(),
  applyDeadline: z.date().optional().nullable(),
  numberOfOpenings: z.coerce.number().int().min(1, 'Minimal 1').optional().nullable(),
  coverImage: z.any().optional(),
  generalRequirementsHtml: z.string().min(10, { message: 'Persyaratan umum harus diisi.' }),
  specialRequirementsHtml: z.string().min(10, { message: 'Persyaratan khusus harus diisi.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  brands: Brand[];
}

export function JobFormDialog({ open, onOpenChange, job, brands }: JobFormDialogProps) {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const router = useRouter();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'publish'>('draft');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const mode = job ? 'Edit' : 'Buat';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      position: '',
      statusJob: 'fulltime',
      divisionId: null,
      location: '',
      brandId: undefined,
      workMode: 'onsite',
      applyDeadline: null,
      numberOfOpenings: 1,
      generalRequirementsHtml: '',
      specialRequirementsHtml: '',
    },
  });

  const selectedBrandId = form.watch('brandId');

  const divisionsQuery = useMemoFirebase(() => {
    if (!selectedBrandId) return null;
    return query(
      collection(firestore, 'brands', selectedBrandId, 'divisions'),
      where('isActive', '==', true)
    );
  }, [selectedBrandId, firestore]);

  const { data: divisions, isLoading: isLoadingDivisions } = useCollection<Division>(divisionsQuery);

  const hasDivisions = !isLoadingDivisions && !!divisions && divisions.length > 0;
  const noDivisions = !isLoadingDivisions && selectedBrandId && divisions?.length === 0;

  // Reset division when brand changes
  useEffect(() => {
    if (form.formState.isDirty) {
      form.setValue('divisionId', null);
    }
  }, [selectedBrandId, form]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    if (open) {
      if (job) {
        form.reset({
          ...job,
          divisionId: job.divisionId || null,
          applyDeadline: job.applyDeadline ? job.applyDeadline.toDate() : null,
          numberOfOpenings: job.numberOfOpenings ?? 1,
          coverImage: undefined,
        });
        setImagePreview(job.coverImageUrl || null);
      } else {
        form.reset({
          position: '', statusJob: 'fulltime', divisionId: null, location: '',
          brandId: undefined, workMode: 'onsite', applyDeadline: null,
          numberOfOpenings: 1, generalRequirementsHtml: '', specialRequirementsHtml: '',
        });
        setImagePreview(null);
      }
    }
  }, [open, job, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateStorageFile(file);
    if (!validation.isValid) {
      toast({ variant: 'destructive', title: 'File Tidak Valid', description: validation.message });
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    form.setValue('coverImage', file);
  };

  const uploadCoverImage = async (jobId: string, imageFile: File): Promise<string> => {
    const processedFile = await compressImage(imageFile);
    const filePath = `jobs/${jobId}/cover-${Date.now()}-${processedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const result = await uploadFile(processedFile, filePath, userProfile?.uid || 'system', {
      category: 'job_cover', ownerUid: userProfile?.uid || 'system', compress: false,
    });
    if (result.fileId) return `/api/storage/google-drive-preview?fileId=${result.fileId}`;
    if (result.downloadUrl) return result.downloadUrl;
    return "";
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Anda harus login.' });
      return;
    }

    // Validation for publish mode
    if (submitMode === 'publish') {
      const missingFields = [];
      if (!values.position) missingFields.push('Posisi');
      if (!values.brandId) missingFields.push('Brand/Perusahaan');
      if (!values.statusJob) missingFields.push('Tipe Pekerjaan');
      if (!values.workMode) missingFields.push('Mode Kerja');
      if (!values.location) missingFields.push('Lokasi');
      if (!values.applyDeadline) missingFields.push('Deadline Lamaran');
      if (!values.numberOfOpenings) missingFields.push('Jumlah yang Dibutuhkan');
      if (!values.generalRequirementsHtml || values.generalRequirementsHtml.trim().length < 10) missingFields.push('Persyaratan Umum (minimal 10 karakter)');

      if (missingFields.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Field Tidak Lengkap',
          description: `Harap isi: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    setLoading(true);

    try {
      const jobId = job?.id || doc(collection(firestore, 'jobs')).id;
      let finalCoverImageUrl = job?.coverImageUrl || '';

      if (values.coverImage instanceof File) {
        finalCoverImageUrl = await uploadCoverImage(jobId, values.coverImage);
      }

      const brand = brands.find(b => b.id === values.brandId);
      const brandName = brand?.name || '';

      // Resolve division info
      const selectedDiv = values.divisionId
        ? divisions?.find(d => d.id === values.divisionId)
        : null;
      const divisionName = selectedDiv?.name || null;
      const divisionId = values.divisionId || null;
      const scopeType: Job['scopeType'] = divisionId ? 'division' : 'brand';

      // Slug: keep existing on edit, generate new on create/duplicate
      const shortId = generateShortId();
      const baseSlug = slugify(values.position);
      const slug = job?.slug || `${baseSlug}-${shortId}`;
      const jobCode = job?.jobCode || generateJobCode(values.position, brandName);

      const { coverImage, ...restOfValues } = values;

      const publishStatus: Job['publishStatus'] = submitMode === 'publish' ? 'published' : 'draft';

      const jobData: Omit<Job, 'id'> = {
        ...restOfValues,
        division: divisionName,  // null if no division, string if division exists
        divisionId,              // null if no division, string if division exists
        divisionName,            // null if no division, string if division exists
        scopeType,
        numberOfOpenings: values.numberOfOpenings || 1,
        applyDeadline: values.applyDeadline ? Timestamp.fromDate(values.applyDeadline) : null,
        coverImageUrl: finalCoverImageUrl,
        slug,
        baseSlug,
        jobCode,
        publishStatus,
        publishedAt: publishStatus === 'published' && !job?.publishedAt ? serverTimestamp() as any : job?.publishedAt,
        createdAt: job?.createdAt || serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        createdBy: job?.createdBy || userProfile.uid,
        updatedBy: userProfile.uid,
        brandName,
        // Preserve deadline history
        originalDeadline: job?.originalDeadline || job?.applyDeadline || null,
        deadlineExtended: job?.deadlineExtended ?? false,
        extensionHistory: job?.extensionHistory ?? [],
      };

      // Remove undefined values before saving to Firestore
      const cleanedData = cleanUndefined(jobData as any);
      await setDocumentNonBlocking(doc(firestore, 'jobs', jobId), cleanedData, { merge: true });

      if (submitMode === 'draft') {
        toast({
          title: 'Draft Lowongan Tersimpan',
          description: `Lowongan "${values.position}" telah disimpan sebagai draft.`,
        });
      } else {
        toast({
          title: 'Lowongan Berhasil Dipublish',
          description: `Lowongan "${values.position}" sudah dipublikasikan dan terlihat di Career Page.`,
        });
        onOpenChange(false);
        router.push('/admin/hrd/job-postings');
      }
    } catch (error: any) {
      handleStorageError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none top-0 left-0 translate-x-0 translate-y-0 rounded-none flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{mode} Job Posting</DialogTitle>
          <DialogDescription>
            Isi detail lowongan di bawah ini. Klik Simpan jika sudah selesai.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
          <Form {...form}>
            <form id="job-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Position */}
                <FormField control={form.control} name="position" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posisi <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input placeholder="cth. Staff Finance" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Brand */}
                <FormField control={form.control} name="brandId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand / Perusahaan <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {brands.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Division — optional */}
                <FormField control={form.control} name="divisionId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Divisi <span className="text-slate-400 text-xs font-normal">(opsional)</span></FormLabel>
                    {noDivisions ? (
                      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        Brand ini tidak memiliki divisi. Lowongan akan dibuat untuk level Brand/Unit.
                      </div>
                    ) : (
                      <Select
                        onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                        value={field.value || '__none__'}
                        disabled={!selectedBrandId || isLoadingDivisions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={
                              isLoadingDivisions ? "Memuat divisi..." :
                              !selectedBrandId ? "Pilih brand terlebih dahulu" :
                              "Pilih divisi (opsional)"
                            } />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— Tanpa Divisi (Level Brand) —</SelectItem>
                          {hasDivisions && divisions!.map((div) => (
                            <SelectItem key={div.id!} value={div.id!}>
                              {div.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Location */}
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lokasi <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input placeholder="cth. Yogyakarta" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Job Type */}
                <FormField control={form.control} name="statusJob" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipe Pekerjaan</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="fulltime">Full-time</SelectItem>
                        <SelectItem value="internship">Internship / Magang</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Work Mode */}
                <FormField control={form.control} name="workMode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode Kerja</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Pilih mode kerja" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="onsite">On-site</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Deadline */}
                <FormField control={form.control} name="applyDeadline" render={({ field }) => (
                  <FormItem className="flex flex-col pt-2">
                    <FormLabel>Deadline Lamaran</FormLabel>
                    <FormControl>
                      <GoogleDatePicker value={field.value} onChange={field.onChange} portalled={false} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Openings */}
                <FormField control={form.control} name="numberOfOpenings" render={({ field }) => (
                  <FormItem className="flex flex-col pt-2">
                    <FormLabel>Jumlah yang Dibutuhkan</FormLabel>
                    <FormControl>
                      <Input
                        type="number" placeholder="cth. 2"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Berapa orang yang dibutuhkan untuk posisi ini.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Cover Image */}
              <FormField control={form.control} name="coverImage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cover Image</FormLabel>
                  <FormControl>
                    <div className="mt-2 space-y-4">
                      <div className="relative w-full h-64 rounded-lg border border-input bg-slate-50 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                        {imagePreview ? (
                          <img src={imagePreview} alt="Cover preview" className="w-full h-full object-contain object-center p-4"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>('.fallback-preview');
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className="fallback-preview hidden absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-muted-foreground">
                            <UploadCloud className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Tidak ada preview</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-dashed border-input bg-slate-50 dark:bg-slate-900 px-6 py-8 text-center">
                        <div className="flex text-sm leading-6 text-muted-foreground justify-center">
                          <label htmlFor="cover-image-upload" className="relative cursor-pointer rounded-md font-semibold text-primary hover:text-primary/80">
                            <span>Upload file</span>
                            <input id="cover-image-upload" name={field.name} type="file" className="sr-only" onChange={handleFileChange} accept="image/png, image/jpeg, image/jpg, image/webp" />
                          </label>
                          <p className="pl-1">atau drag & drop</p>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground mt-2">PNG, JPG, JPEG, WEBP maks. 5MB. Rekomendasi: 1200x600px.</p>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Rich Text Fields */}
              <Controller control={form.control} name="generalRequirementsHtml" render={({ field }) => (
                <FormItem>
                  <FormLabel>Persyaratan Umum</FormLabel>
                  <RichTextEditor {...field} placeholder="Daftar persyaratan umum pekerjaan..." />
                  <FormMessage />
                </FormItem>
              )} />

              <Controller control={form.control} name="specialRequirementsHtml" render={({ field }) => (
                <FormItem>
                  <FormLabel>Persyaratan Khusus</FormLabel>
                  <RichTextEditor {...field} placeholder="Daftar persyaratan teknis atau khusus..." />
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </div>
        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmitMode('draft');
                form.handleSubmit(onSubmit)();
              }}
              disabled={loading}
            >
              {loading && submitMode === 'draft' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <SaveIcon className={submitMode === 'draft' && loading ? 'hidden' : 'mr-2 h-4 w-4'} />
              Simpan Draft
            </Button>
            <Button
              type="button"
              onClick={() => {
                setSubmitMode('publish');
                form.handleSubmit(onSubmit)();
              }}
              disabled={loading}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {loading && submitMode === 'publish' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <SendIcon className={submitMode === 'publish' && loading ? 'hidden' : 'mr-2 h-4 w-4'} />
              Publish & Kembali ke List
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
