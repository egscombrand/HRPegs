'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { Education } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/providers/auth-provider';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

const EDUCATION_LEVELS = ['SMA/SMK', 'D3', 'S1', 'S2', 'S3'] as const;

const educationSchema = z.object({
  id: z.string(),
  institution: z.string().min(1, "Nama institusi harus diisi"),
  level: z.enum(EDUCATION_LEVELS, { required_error: "Jenjang pendidikan harus diisi" }),
  fieldOfStudy: z.string().optional().nullable(),
  thesisTitle: z.string().optional().nullable(),
  gpa: z.string().optional().nullable(),
  startDate: z.string().min(4, "Tahun mulai harus diisi"),
  endDate: z.string().optional().nullable(),
  isCurrent: z.boolean().default(false),
}).refine(data => data.isCurrent || (data.endDate && data.endDate.length > 0), {
    message: "Tahun selesai harus diisi jika tidak sedang menempuh pendidikan ini.",
    path: ["endDate"],
});

const formSchema = z.object({
  education: z.array(educationSchema).min(1, "Minimal harus ada satu riwayat pendidikan."),
});

type FormValues = z.infer<typeof formSchema>;

interface EducationFormProps {
    initialData: Education[];
    onSaveSuccess: () => void;
    onBack: () => void;
}

const thesisLabels: Record<string, string> = {
  'D3': 'Judul Tugas Akhir',
  'S1': 'Judul Skripsi',
  'S2': 'Judul Tesis',
  'S3': 'Judul Disertasi',
};

export function EducationForm({ initialData, onSaveSuccess, onBack }: EducationFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { education: initialData || [] },
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "education",
    });

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const sanitizedEducation = values.education.map(edu => ({
                ...edu,
                fieldOfStudy: edu.fieldOfStudy || null,
                thesisTitle: edu.isCurrent ? null : (edu.thesisTitle || null),
                gpa: edu.gpa || null,
                endDate: edu.isCurrent ? null : (edu.endDate || null),
            }));

            const payload = {
                education: sanitizedEducation,
                profileStatus: 'draft',
                profileStep: 3,
                updatedAt: serverTimestamp() as Timestamp,
            };
            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            await setDocumentNonBlocking(profileDocRef, payload, { merge: true });
            
            toast({ title: 'Pendidikan Disimpan', description: 'Melanjutkan ke langkah berikutnya...' });
            onSaveSuccess();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Riwayat Pendidikan</CardTitle>
                <CardDescription>Tambahkan riwayat pendidikan formal Anda. Minimal satu. Kolom dengan tanda <span className="text-destructive">*</span> adalah kolom yang wajib diisi.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        <div className="space-y-6">
                            {fields.map((field, index) => {
                                const isCurrent = form.watch(`education.${index}.isCurrent`);
                                const selectedLevel = form.watch(`education.${index}.level`);
                                const thesisLabel = selectedLevel ? thesisLabels[selectedLevel] : null;

                                return (
                                <div key={field.id} className="space-y-4 p-4 border rounded-md relative">
                                    <Button 
                                        type="button"
                                        variant="ghost" 
                                        size="icon" 
                                        className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                                        onClick={() => remove(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    
                                    <FormField control={form.control} name={`education.${index}.institution`} render={({ field }) => (<FormItem><FormLabel>Nama Institusi <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="Contoh: Universitas Gadjah Mada" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`education.${index}.level`} render={({ field }) => (<FormItem><FormLabel>Jenjang <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenjang" /></SelectTrigger></FormControl><SelectContent>{EDUCATION_LEVELS.map(level => (<SelectItem key={level} value={level}>{level}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`education.${index}.fieldOfStudy`} render={({ field }) => (<FormItem><FormLabel>Jurusan (Opsional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Contoh: Akuntansi" /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    
                                    <FormField control={form.control} name={`education.${index}.gpa`} render={({ field }) => (<FormItem><FormLabel>IPK / Nilai (Opsional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Contoh: 3.85" /></FormControl><FormMessage /></FormItem>)} />
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`education.${index}.startDate`} render={({ field }) => (<FormItem><FormLabel>Tahun Mulai <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" {...field} placeholder="YYYY" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        {!isCurrent && (
                                            <FormField control={form.control} name={`education.${index}.endDate`} render={({ field }) => (<FormItem><FormLabel>Tahun Selesai <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="YYYY" /></FormControl><FormMessage /></FormItem>)} />
                                        )}
                                    </div>

                                    {!isCurrent && thesisLabel && (
                                        <FormField control={form.control} name={`education.${index}.thesisTitle`} render={({ field }) => (<FormItem><FormLabel>{thesisLabel} (Opsional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder={`Contoh: Analisis...`} /></FormControl><FormMessage /></FormItem>)} />
                                    )}

                                    <FormField control={form.control} name={`education.${index}.isCurrent`} render={({ field }) => (<FormItem className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Saat ini sedang menempuh</FormLabel></div></FormItem>)} />
                                    
                                    {index < fields.length - 1 && <Separator className="!mt-6" />}
                                </div>
                            )})}
                        </div>
                        
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => append({ id: crypto.randomUUID(), institution: '', level: 'S1', fieldOfStudy: '', gpa: '', startDate: '', endDate: '', isCurrent: false, thesisTitle: '' })}
                        >
                            <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pendidikan
                        </Button>
                        <FormMessage>{form.formState.errors.education?.message}</FormMessage>
                        
                        <div className="flex justify-between pt-4">
                             <Button type="button" variant="secondary" onClick={onBack}>
                                Kembali
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan & Lanjut
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
