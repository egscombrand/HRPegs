'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, UploadCloud, Trash2 } from 'lucide-react';
import { useFirestore, setDocumentNonBlocking, useFirebaseApp } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import type { EcosystemSection } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const formSchema = z.object({
  type: z.enum(['hero', 'content'], { required_error: "Jenis section harus dipilih." }),
  sectionKey: z.string().min(3, "Section ID harus diisi.").regex(/^[a-z0-9-]+$/, "Hanya huruf kecil, angka, dan tanda hubung yang diizinkan.").optional(),
  title: z.string().min(3, "Judul harus minimal 3 karakter."),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  imageFiles: z.array(z.instanceof(File)).optional(),
  imageUrls: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0, "Urutan harus angka positif."),
});

type FormValues = z.infer<typeof formSchema>;

interface ImagePreview {
  id: string;
  url: string;
  file?: File;
  isNew: boolean;
}

const SortableImagePreview = ({ image, onRemove }: { image: ImagePreview; onRemove: () => void; }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative aspect-square group">
            <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab" />
            <Image src={image.url} alt="Preview" layout="fill" className="object-cover rounded-md" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <Button type="button" variant="destructive" size="icon" className="h-7 w-7" onClick={onRemove}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};


interface EcosystemSectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EcosystemSection | null;
  onSuccess: () => void;
}

export function EcosystemSectionFormDialog({ open, onOpenChange, item, onSuccess }: EcosystemSectionFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { toast } = useToast();
  const mode = item ? 'Edit' : 'Create';

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  
  const sectionType = form.watch('type');

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      imagePreviews.forEach(p => {
        if (p.isNew) {
          URL.revokeObjectURL(p.url);
        }
      });
      setImagePreviews([]);
    }
    onOpenChange(isOpen);
  };

  useEffect(() => {
    if (open) {
      const type = item?.type || 'content';
      form.reset({
        type: type,
        sectionKey: item?.sectionKey || '',
        title: item?.title || '',
        subtitle: (type === 'hero' ? item?.subtitle : '') || '',
        description: (type === 'content' ? item?.description : '') || '',
        isActive: item?.isActive ?? true,
        sortOrder: item?.sortOrder || 0,
        imageFiles: [],
        imageUrls: item?.imageUrls || [],
      });
      setImagePreviews(
        item?.imageUrls.map(url => ({ id: url, url, isNew: false })) || []
      );
    }
  }, [open, item, form]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImageFiles = Array.from(files).filter(file => {
        if (!file.type.startsWith('image/')) {
            toast({ variant: "destructive", title: "Invalid File Type", description: `${file.name} is not an image.` });
            return false;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB
            toast({ variant: "destructive", title: "File Too Large", description: `${file.name} is larger than 5MB.` });
            return false;
        }
        return true;
    });

    if (newImageFiles.length === 0) return;

    const newPreviews: ImagePreview[] = newImageFiles.map(file => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        file: file,
        isNew: true
    }));
    
    setImagePreviews(prev => [...prev, ...newPreviews]);
    form.setValue('imageFiles', [...(form.getValues('imageFiles') || []), ...newImageFiles]);
  }, [form, toast]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
  };
  
  const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isEntering: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isEntering);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    handleDragEvents(e, false);
    handleFiles(e.dataTransfer.files);
  };
  
  const handleRemoveImage = (idToRemove: string) => {
    const removedPreview = imagePreviews.find(p => p.id === idToRemove);
    if (!removedPreview) return;
    
    if (removedPreview.isNew && removedPreview.file) {
        URL.revokeObjectURL(removedPreview.url);
        form.setValue('imageFiles', (form.getValues('imageFiles') || []).filter(f => f.name !== removedPreview.file!.name));
    } else {
        form.setValue('imageUrls', (form.getValues('imageUrls') || []).filter(url => url !== removedPreview.url));
    }
    setImagePreviews(prev => prev.filter(p => p.id !== idToRemove));
  };
  
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
        setImagePreviews((items) => {
            const oldIndex = items.findIndex(item => item.id === active.id);
            const newIndex = items.findIndex(item => item.id === over.id);
            return arrayMove(items, oldIndex, newIndex);
        });
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
        let sectionKey = '';
        if (mode === 'Edit' && item) {
            sectionKey = item.sectionKey;
        } else {
            sectionKey = values.type === 'hero' ? 'hero' : (values.sectionKey || slugify(values.title) + '-' + Date.now().toString(36).slice(-4));
        }

        const docRef = doc(firestore, 'ecosystem_sections', sectionKey);

        const newImageUrls = await Promise.all(
            (values.imageFiles || []).map(async (file) => {
                const filePath = `ecosystem_sections/${sectionKey}/${Date.now()}-${file.name}`;
                const storageRef = ref(storage, filePath);
                await uploadBytes(storageRef, file);
                return getDownloadURL(storageRef);
            })
        );
        
        const finalImageUrls = imagePreviews.map(p => {
          if (p.isNew) {
            const newFileIndex = (values.imageFiles || []).findIndex(f => f.name === p.file?.name);
            return newImageUrls[newFileIndex];
          }
          return p.url;
        }).filter(Boolean) as string[];

        const payload: Omit<EcosystemSection, 'id'> = {
            sectionKey: sectionKey,
            type: values.type,
            title: values.title,
            subtitle: values.type === 'hero' ? values.subtitle : '',
            description: values.type === 'content' ? values.description : '',
            imageUrls: finalImageUrls,
            isActive: values.isActive,
            sortOrder: values.sortOrder,
            createdAt: item?.createdAt || serverTimestamp() as any,
            updatedAt: serverTimestamp() as any,
        };

        await setDocumentNonBlocking(docRef, payload, { merge: true });
        toast({ title: `Section ${mode}d`, description: `"${values.title}" has been saved.` });
        onSuccess();
        onOpenChange(false);
    } catch (e: any) {
        toast({ variant: 'destructive', title: `Failed to ${mode.toLowerCase()} section`, description: e.message });
    } finally {
        setIsSaving(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b flex-shrink-0">
          <DialogTitle>{mode} Ecosystem Section</DialogTitle>
          <DialogDescription>Atur konten yang akan tampil di landing page.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow">
          <div className="p-6">
            <Form {...form}>
              <form id="section-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jenis Section</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={mode === 'Edit'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis section..." /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="hero">Hero (Banner Utama)</SelectItem>
                                <SelectItem value="content">Content (Section Informasi)</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            {field.value === 'hero' ? 'Akan tampil di bagian paling atas halaman sebagai banner utama.' : 'Akan tampil di bawah sebagai section informasi.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {mode === 'Create' && sectionType === 'content' && (
                     <FormField control={form.control} name="sectionKey" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Section ID (Pengenal Unik)</FormLabel>
                            <FormControl><Input {...field} placeholder="e.g., basecamp, our-values" /></FormControl>
                            <FormDescription>Gunakan huruf kecil tanpa spasi (boleh pakai tanda hubung "-"). Jika dikosongkan, akan dibuat otomatis dari judul.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                  )}
                  
                  <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Judul</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                         <FormDescription>Judul utama yang akan ditampilkan di section.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {sectionType === 'hero' ? (
                    <FormField control={form.control} name="subtitle" render={({ field }) => (<FormItem><FormLabel>Subtitle</FormLabel><FormControl><Textarea {...field} /></FormControl><FormDescription>Teks pendukung di bawah judul, khusus untuk Hero Section.</FormDescription><FormMessage /></FormItem>)} />
                  ) : (
                    <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Deskripsi</FormLabel><FormControl><Textarea {...field} /></FormControl><FormDescription>Paragraf deskripsi untuk Content Section.</FormDescription><FormMessage /></FormItem>)} />
                  )}

                 <FormItem>
                  <FormLabel>Gambar</FormLabel>
                  <FormDescription>Seret gambar untuk mengubah urutan. Jika lebih dari satu, akan tampil sebagai carousel.</FormDescription>
                  <label
                    htmlFor="image-upload"
                    onDragOver={(e) => handleDragEvents(e, true)}
                    onDragLeave={(e) => handleDragEvents(e, false)}
                    onDrop={handleDrop}
                    className={cn(
                      "mt-2 p-4 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center min-h-[150px] cursor-pointer",
                      isDragging ? "border-primary bg-primary/10" : "border-input hover:border-primary/50"
                    )}
                  >
                    {imagePreviews.length > 0 ? (
                       <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={imagePreviews.map(p => p.id)} strategy={verticalListSortingStrategy}>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 w-full">
                            {imagePreviews.map((image) => (
                              <SortableImagePreview key={image.id} image={image} onRemove={() => handleRemoveImage(image.id)} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                       <div className="text-center text-muted-foreground p-4 pointer-events-none">
                            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-2 font-semibold">Seret & lepas gambar di sini, atau klik untuk memilih file</p>
                            <p className="text-xs">PNG, JPG, WEBP hingga 5MB.</p>
                       </div>
                    )}
                  </label>
                  <Input id="image-upload" type="file" multiple className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
                </FormItem>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="sortOrder" render={({ field }) => (<FormItem><FormLabel>Urutan Tampil</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Angka kecil akan tampil lebih dulu.</FormDescription><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem><FormLabel>Status</FormLabel><div className="flex items-center space-x-2 h-10"><FormControl><Switch id="is-active" checked={field.value} onCheckedChange={field.onChange} /></FormControl><Label htmlFor="is-active">Aktif (Tampilkan di landing page)</Label></div><FormMessage /></FormItem>)} />
                </div>
              </form>
            </Form>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="section-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
