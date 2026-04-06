'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2, X, PlusCircle, Trash2, FileUp, Eye, Globe } from 'lucide-react';
import { Separator } from '../ui/separator';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';

const certificationSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nama sertifikasi harus diisi"),
  organization: z.string().min(1, "Nama organisasi harus diisi"),
  issueDate: z.string().regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" }),
  expirationDate: z.string().regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" }).optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
});

const formSchema = z.object({
  cvUrl: z.string().min(1, "CV harus diunggah atau dilampirkan via link"),
  ijazahUrl: z.string().min(1, "Ijazah harus diunggah atau dilampirkan via link"),
  certifications: z.array(certificationSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SkillsFormProps {
    initialData: { 
        skills?: string[], 
        certifications?: any[], 
        cvUrl?: string, 
        ijazahUrl?: string 
    };
    onSaveSuccess: () => void;
    onBack: () => void;
}

// File size limit: 2MB for direct upload to Firebase
const FILE_SIZE_LIMIT = 2 * 1024 * 1024; 

function FileUploadField({ 
    label, 
    value, 
    onChange, 
    userId, 
    pathPrefix, 
    required = false 
}: { 
    label: string, 
    value?: string, 
    onChange: (url: string) => void, 
    userId: string, 
    pathPrefix: string,
    required?: boolean
}) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [useLink, setUseLink] = useState(!!value && !value.includes('firebasestorage'));
    const { toast } = useToast();

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > FILE_SIZE_LIMIT) {
            toast({
                variant: "destructive",
                title: "File Terlalu Besar",
                description: `Maksimal ukuran file adalah 2MB. Untuk file lebih besar, gunakan link Google Drive.`
            });
            setUseLink(true);
            return;
        }

        setIsUploading(true);
        const storage = getStorage();
        const storageRef = ref(storage, `user_docs/${userId}/${pathPrefix}_${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setProgress(p);
            },
            (error) => {
                console.error("Upload error:", error);
                toast({ variant: "destructive", title: "Upload Gagal", description: error.message });
                setIsUploading(false);
            },
            async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                onChange(downloadUrl);
                setIsUploading(false);
                toast({ title: "Upload Berhasil", description: `${label} telah diunggah.` });
            }
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <FormLabel className="text-sm font-semibold">{label} {required && <span className="text-destructive">*</span>}</FormLabel>
                <div className="flex items-center gap-2">
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] h-7" 
                        onClick={() => setUseLink(!useLink)}
                    >
                        {useLink ? "Gunakan Upload File" : "Gunakan Link External"}
                    </Button>
                </div>
            </div>

            {useLink ? (
                <div className="flex gap-2">
                    <Input 
                        placeholder="Link Google Drive / Dropbox" 
                        value={value || ''} 
                        onChange={(e) => onChange(e.target.value)}
                        className="flex-1"
                    />
                    {value && <Button variant="outline" size="icon" asChild><a href={value} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /></a></Button>}
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Input 
                            type="file" 
                            onChange={handleFileUpload} 
                            className="flex-1 text-xs cursor-pointer file:cursor-pointer file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:mr-4 file:px-4 file:py-2 file:rounded-full file:border-0" 
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            disabled={isUploading}
                        />
                        {value && !isUploading && <Button variant="outline" size="icon" asChild><a href={value} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /></a></Button>}
                    </div>
                    {isUploading && (
                        <div className="space-y-1">
                            <Progress value={progress} className="h-1" />
                            <p className="text-[10px] text-muted-foreground text-center">Sedang mengunggah... {Math.round(progress)}%</p>
                        </div>
                    )}
                </div>
            )}
            <p className="text-[10px] text-muted-foreground italic">
                {useLink ? "Masukkan link dari Google Drive (pastikan izin link sudah 'anyone can view')." : "Max size 2MB (PDF, Image, Doc)."}
            </p>
        </div>
    );
}

export function SkillsForm({ initialData, onSaveSuccess, onBack }: SkillsFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            cvUrl: initialData?.cvUrl || '',
            ijazahUrl: initialData?.ijazahUrl || '',
            certifications: initialData?.certifications || [],
        },
    });

    const { fields: certFields, append: appendCert, remove: removeCert } = useFieldArray({
        control: form.control,
        name: "certifications",
    });

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                cvUrl: values.cvUrl,
                ijazahUrl: values.ijazahUrl,
                certifications: values.certifications,
                profileStatus: 'draft',
                profileStep: 6,
                updatedAt: serverTimestamp() as Timestamp,
            };
            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            await setDocumentNonBlocking(profileDocRef, payload, { merge: true });
            
            toast({ title: 'Dokumen & Sertifikasi Disimpan', description: 'Melanjutkan ke langkah terakhir.' });
            onSaveSuccess();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Unggah Dokumen Wajib</CardTitle>
                        <CardDescription>Lampirkan dokumen pendukung lamaran Anda. Ukuran file maksimal 2MB per file atau lampirkan link Google Drive jika ukuran file lebih besar.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
                             <FileUploadField 
                                label="Curriculum Vitae (CV)" 
                                value={form.watch('cvUrl')} 
                                onChange={(url) => form.setValue('cvUrl', url, { shouldValidate: true })}
                                userId={firebaseUser?.uid || ''}
                                pathPrefix="cv"
                                required
                            />
                            <FileUploadField 
                                label="Ijazah / SKL" 
                                value={form.watch('ijazahUrl')} 
                                onChange={(url) => form.setValue('ijazahUrl', url, { shouldValidate: true })}
                                userId={firebaseUser?.uid || ''}
                                pathPrefix="ijazah"
                                required
                            />
                        </div>
                        {form.formState.errors.cvUrl && <p className="text-xs text-destructive">{form.formState.errors.cvUrl.message}</p>}
                        {form.formState.errors.ijazahUrl && <p className="text-xs text-destructive">{form.formState.errors.ijazahUrl.message}</p>}

                        <Alert className="bg-muted border-none">
                            <Globe className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                                Tip: Jika menggunakan Google Drive, pastikan pengaturan berbagi file diset agar "Semua orang yang memiliki link bisa melihat" agar tim HRD dapat mengakses dokumen Anda.
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sertifikasi & Pelatihan (Opsional)</CardTitle>
                        <CardDescription>Sebutkan sertifikasi profesional atau kursus yang relevan dan lampirkan bukti foto/sertifikat.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                            <Info className="h-4 w-4 text-blue-600" />
                            <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                                Punya banyak sertifikat? Masukkan semua file ke dalam satu folder Google Drive, lalu bagikan link folder tersebut pada salah satu kolom "Link External".
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-6">
                            {certFields.map((field, index) => (
                                <div key={field.id} className="space-y-4 p-5 border rounded-xl relative bg-muted/20">
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => removeCert(index)}><Trash2 className="h-4 w-4" /></Button>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`certifications.${index}.name`} render={({ field }) => (<FormItem><FormLabel>Nama Sertifikasi <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="Contoh: Certified Cloud Practitioner" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`certifications.${index}.organization`} render={({ field }) => (<FormItem><FormLabel>Lembaga Penerbit <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="Contoh: Amazon Web Services" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <FormField control={form.control} name={`certifications.${index}.issueDate`} render={({ field }) => (<FormItem><FormLabel>Tgl Terbit <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="YYYY-MM" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`certifications.${index}.expirationDate`} render={({ field }) => (<FormItem><FormLabel>Tgl Kedaluwarsa</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="YYYY-MM" /></FormControl><FormMessage /></FormItem>)} />
                                        
                                        <FileUploadField 
                                            label="Bukti Sertifikat (File/Link)" 
                                            value={form.watch(`certifications.${index}.imageUrl`)} 
                                            onChange={(url) => form.setValue(`certifications.${index}.imageUrl`, url)}
                                            userId={firebaseUser?.uid || ''}
                                            pathPrefix={`cert_${index}`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => appendCert({ id: crypto.randomUUID(), name: '', organization: '', issueDate: '' })}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Sertifikasi</Button>
                    </CardContent>
                </Card>

                <div className="flex justify-between pt-4">
                    <Button type="button" variant="secondary" onClick={onBack}>Kembali</Button>
                    <Button type="submit" disabled={isSaving} size="lg" className="min-w-[150px]">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Simpan & Lanjut"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
