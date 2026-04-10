'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, UploadCloud, Trash2, GripVertical } from 'lucide-react';
import { useFirestore, setDocumentNonBlocking, useFirebaseApp } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import type { EcosystemSection } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters."),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  imageFiles: z.array(z.instanceof(File)).optional(),
  imageUrls: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0, "Sort order must be a positive number."),
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
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const storage = getStorage(firebaseApp);
  const { toast } = useToast();
  const mode = item ? 'Edit' : 'Create';

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        title: item?.title || '',
        subtitle: item?.subtitle || '',
        description: item?.description || '',
        isActive: item?.isActive ?? true,
        sortOrder: item?.sortOrder || 0,
        imageFiles: [],
        imageUrls: item?.imageUrls || [],
      });
      setImagePreviews(
        item?.imageUrls.map(url => ({ id: url, url, isNew: false })) || []
      );
    } else {
       // Clean up blob URLs on close
       imagePreviews.forEach(p => { if (p.isNew) URL.revokeObjectURL(p.url); });
       setImagePreviews([]);
    }
  }, [open, item, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    const newPreviews: ImagePreview[] = files.map(file => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        file: file,
        isNew: true
    }));
    
    setImagePreviews(prev => [...prev, ...newPreviews]);
    form.setValue('imageFiles', [...(form.getValues('imageFiles') || []), ...files]);
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
        const docId = item?.id || values.title.toLowerCase().replace(/\s+/g, '-');
        const docRef = doc(firestore, 'ecosystem_sections', docId);

        const newImageUrls = await Promise.all(
            (values.imageFiles || []).map(async (file) => {
                const filePath = `ecosystem_sections/${docId}/${Date.now()}-${file.name}`;
                const storageRef = ref(storage, filePath);
                await uploadBytes(storageRef, file);
                return getDownloadURL(storageRef);
            })
        );
        
        const finalImageUrls = imagePreviews.map(p => p.url);

        const payload: Omit<EcosystemSection, 'id'> = {
            sectionKey: item?.sectionKey || (values.title.toLowerCase().replace(/\s+/g, '-') as any),
            title: values.title,
            subtitle: values.subtitle || '',
            description: values.description || '',
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
                <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="subtitle" render={({ field }) => (<FormItem><FormLabel>Subtitle (for Hero)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description (for other sections)</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>)} />

                 <FormItem>
                  <FormLabel>Images</FormLabel>
                  <FormDescription>Drag images to reorder. First image will be the main display.</FormDescription>
                  <div className="mt-2 p-4 border rounded-lg">
                    {imagePreviews.length > 0 ? (
                       <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={imagePreviews} strategy={rectSortingStrategy}>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                            {imagePreviews.map((image) => (
                              <SortableImagePreview key={image.id} image={image} onRemove={() => handleRemoveImage(image.id)} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                       <div className="text-center text-muted-foreground p-4">No images uploaded yet.</div>
                    )}
                  </div>
                 <div className="mt-2">
                    <label htmlFor="image-upload" className="cursor-pointer text-sm text-primary font-medium underline-offset-4 hover:underline">
                      <PlusCircle className="inline-block h-4 w-4 mr-2" /> Add Images
                    </label>
                    <Input id="image-upload" type="file" multiple className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
                  </div>
                </FormItem>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="sortOrder" render={({ field }) => (<FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem><FormLabel>Status</FormLabel><div className="flex items-center space-x-2 h-10"><FormControl><Switch id="is-active" checked={field.value} onCheckedChange={field.onChange} /></FormControl><Label htmlFor="is-active">Active</Label></div><FormMessage /></FormItem>)} />
                </div>
              </form>
            </Form>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="section-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
