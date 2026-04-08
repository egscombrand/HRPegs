'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

const availabilityOptions = ['Secepatnya', '1 minggu', '2 minggu', '1 bulan', '3 bulan', '6 bulan', 'Lainnya'] as const;

const formSchema = z.object({
  selfDescription: z.string().min(20, { message: "Deskripsi diri harus diisi, minimal 20 karakter." }),
  salaryExpectation: z.string().min(1, { message: "Ekspektasi gaji harus diisi." }),
  salaryExpectationReason: z.string().min(10, { message: "Alasan ekspektasi gaji harus diisi (minimal 10 karakter)." }),
  motivation: z.string().min(20, { message: "Motivasi dan alasan harus diisi, minimal 20 karakter." }),
  workStyle: z.string().optional(),
  improvementArea: z.string().optional(),
  availability: z.enum(availabilityOptions, { required_error: 'Ketersediaan harus dipilih.' }),
  availabilityOther: z.string().optional(),
  usedToDeadline: z.enum(['ya', 'tidak'], { required_error: 'Pilihan ini harus diisi.' }),
  deadlineExperience: z.string().optional(),
  declaration: z.literal(true, {
    errorMap: () => ({ message: "Anda harus menyetujui pernyataan ini untuk menyelesaikan profil." }),
  }),
}).refine((data) => {
    if (data.usedToDeadline === 'ya' && (!data.deadlineExperience || data.deadlineExperience.length < 10)) {
        return false;
    }
    return true;
}, {
    message: 'Ceritakan pengalaman Anda dengan target/deadline (minimal 10 karakter).',
    path: ['deadlineExperience'],
}).refine(data => data.availability === 'Lainnya' ? (data.availabilityOther && data.availabilityOther.length > 0) : true, {
    message: "Harap sebutkan waktu ketersediaan Anda.",
    path: ["availabilityOther"],
});


type FormValues = z.infer<typeof formSchema>;

interface SelfDescriptionFormProps {
    initialData: {
        selfDescription?: string;
        salaryExpectation?: string;
        salaryExpectationReason?: string;
        motivation?: string;
        workStyle?: string;
        improvementArea?: string;
        availability?: typeof availabilityOptions[number];
        availabilityOther?: string;
        usedToDeadline?: boolean;
        deadlineExperience?: string;
    };
    onFinish: () => void;
    onBack: () => void;
}

export function SelfDescriptionForm({ initialData, onFinish, onBack }: SelfDescriptionFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            selfDescription: initialData?.selfDescription || '',
            salaryExpectation: initialData?.salaryExpectation || '',
            salaryExpectationReason: initialData?.salaryExpectationReason || '',
            motivation: initialData?.motivation || '',
            workStyle: initialData?.workStyle || '',
            improvementArea: initialData?.improvementArea || '',
            availability: initialData?.availability,
            availabilityOther: initialData?.availabilityOther || '',
            usedToDeadline: initialData?.usedToDeadline === true ? 'ya' : (initialData?.usedToDeadline === false ? 'tidak' : undefined),
            deadlineExperience: initialData?.deadlineExperience || '',
            declaration: false,
        },
    });

    const usedToDeadline = form.watch('usedToDeadline');
    const availability = form.watch('availability');

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const { declaration, usedToDeadline, ...rest } = values;
            
            const batch = writeBatch(firestore);
            const now = serverTimestamp();

            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            const profilePayload = {
                ...rest,
                usedToDeadline: usedToDeadline === 'ya',
                profileStatus: 'completed',
                profileStep: 6,
                updatedAt: now,
                completedAt: now,
            };
            batch.update(profileDocRef, profilePayload);

            const userDocRef = doc(firestore, 'users', firebaseUser.uid);
            batch.update(userDocRef, { isProfileComplete: true });

            await batch.commit();
            
            toast({ title: 'Profil Selesai!', description: 'Profil Anda telah berhasil disimpan dan dilengkapi.' });
            onFinish();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Deskripsi Diri & Pernyataan</CardTitle>
                <CardDescription>Ini adalah langkah terakhir. Berikan sentuhan personal pada profil Anda. Kolom dengan tanda <span className="text-destructive">*</span> adalah kolom yang wajib diisi.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        <FormField control={form.control} name="selfDescription" render={({ field }) => (<FormItem><FormLabel>Ceritakan singkat tentang diri Anda <span className="text-destructive">*</span></FormLabel><FormDescription>Fokus pada karakter, sikap kerja, keunggulan, serta hal yang ingin Anda kembangkan.</FormDescription><FormControl><Textarea {...field} value={field.value ?? ''} rows={5} /></FormControl><FormMessage /></FormItem>)} />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <FormField control={form.control} name="salaryExpectation" render={({ field }) => (<FormItem><FormLabel>Ekspektasi Gaji <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Contoh: 5 - 7 Juta atau UMR" /></FormControl><FormMessage /></FormItem>)} />
                           <FormField control={form.control} name="salaryExpectationReason" render={({ field }) => (<FormItem><FormLabel>Alasan Ekspektasi Gaji <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ceritakan pertimbangan Anda" /></FormControl><FormMessage /></FormItem>)} />
                        </div>

                        <FormField control={form.control} name="motivation" render={({ field }) => (<FormItem><FormLabel>Motivasi Melamar <span className="text-destructive">*</span></FormLabel><FormDescription>Apa yang membuat Anda tertarik dengan posisi atau bidang ini?</FormDescription><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Jelaskan motivasi dan alasan yang mendasari Anda untuk bekerja pada bidang/posisi yang Anda pilih." rows={5} /></FormControl><FormMessage /></FormItem>)} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="workStyle" render={({ field }) => (<FormItem><FormLabel>Bagaimana gaya kerja Anda?</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Contoh: lebih suka kerja mandiri atau tim, terstruktur atau fleksibel, dll." rows={3} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="improvementArea" render={({ field }) => (<FormItem><FormLabel>Apa satu hal yang ingin Anda tingkatkan?</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Contoh: meningkatkan komunikasi, manajemen waktu, atau skill teknis tertentu" rows={3} /></FormControl><FormMessage /></FormItem>)} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="availability" render={({ field }) => (<FormItem><FormLabel>Kapan Anda dapat mulai bergabung? <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih ketersediaan" /></SelectTrigger></FormControl><SelectContent>{availabilityOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                            {availability === 'Lainnya' && (
                                <FormField control={form.control} name="availabilityOther" render={({ field }) => (<FormItem><FormLabel>Sebutkan waktu ketersediaan Anda <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="usedToDeadline" render={({ field }) => (<FormItem><FormLabel>Apakah Anda terbiasa bekerja dengan target/deadline? <span className="text-destructive">*</span></FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4 pt-2"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="ya" /></FormControl><FormLabel className="font-normal">Ya</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="tidak" /></FormControl><FormLabel className="font-normal">Tidak</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)} />
                        </div>
                        
                        {usedToDeadline === 'ya' && (
                             <FormField control={form.control} name="deadlineExperience" render={({ field }) => (<FormItem><FormLabel>Ceritakan pengalaman Anda bekerja dengan target <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Ceritakan bagaimana Anda mengelola tekanan dan prioritas untuk memenuhi deadline." rows={4} /></FormControl><FormMessage /></FormItem>)} />
                        )}

                        <FormField
                            control={form.control}
                            name="declaration"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm !mt-12">
                                <FormControl>
                                    <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>Pernyataan Kebenaran Data <span className="text-destructive">*</span></FormLabel>
                                    <FormDescription>
                                        Saya menyatakan dengan sesungguhnya bahwa seluruh data yang saya berikan adalah benar dan dapat dipertanggungjawabkan.
                                    </FormDescription>
                                    <FormMessage />
                                </div>
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="secondary" onClick={onBack}>
                                Kembali
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Selesaikan & Kirim Profil
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
