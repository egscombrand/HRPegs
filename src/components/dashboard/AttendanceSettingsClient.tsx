'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save, MapPin, LocateFixed } from 'lucide-react';
import type { AttendanceConfig } from '@/lib/types';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

const formSchema = z.object({
  office: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }),
  radiusM: z.coerce.number().int().min(10, 'Radius minimal 10 meter.'),
  shift: z.object({
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
    graceLateMinutes: z.coerce.number().int().min(0, 'Batas telat tidak boleh negatif.'),
  }),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_OFFICE = {
    lat: -7.761699086851509,
    lng: 110.36713435984919,
};

const DEFAULT_VALUES: FormValues = {
    office: DEFAULT_OFFICE,
    radiusM: 150,
    shift: {
        startTime: '09:00',
        endTime: '17:00',
        graceLateMinutes: 15,
    }
};

function SettingsFormSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-8">
                 <div className="space-y-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                 </div>
                 <div className="space-y-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-10 w-full" />
                 </div>
            </CardContent>
            <CardFooter>
                 <Skeleton className="h-10 w-32 ml-auto" />
            </CardFooter>
        </Card>
    )
}

export function AttendanceSettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const configRef = useMemoFirebase(() => doc(firestore, 'attendance_config', 'default'), [firestore]);
  const { data: config, isLoading } = useDoc<AttendanceConfig>(configRef);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });
  
  useEffect(() => {
    if (config) {
        form.reset({
            office: config.office,
            radiusM: config.radiusM,
            shift: config.shift,
        });
    }
  }, [config, form]);

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
        return;
    }
    setIsSaving(true);
    try {
      const payload: Partial<AttendanceConfig> = {
        ...values,
        timezone: config?.timezone || 'Asia/Jakarta',
        workDays: config?.workDays || ["Mon","Tue","Wed","Thu","Fri"],
        updatedAt: serverTimestamp() as Timestamp,
        updatedBy: userProfile.uid,
      };
      await setDocumentNonBlocking(configRef, payload, { merge: true });
      toast({ title: 'Pengaturan Disimpan', description: 'Aturan absensi telah berhasil diperbarui.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const setDefaults = () => {
    form.setValue('office', DEFAULT_OFFICE);
    form.setValue('radiusM', 150);
  };
  
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
        toast({ variant: 'destructive', title: 'Error', description: 'Geolocation tidak didukung oleh browser Anda.' });
        return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
        (position) => {
            form.setValue('office.lat', position.coords.latitude);
            form.setValue('office.lng', position.coords.longitude);
            toast({ title: 'Lokasi Diambil', description: 'Koordinat kantor telah diperbarui.'});
            setIsGettingLocation(false);
        },
        () => {
            toast({ variant: 'destructive', title: 'Gagal Mengambil Lokasi', description: 'Pastikan Anda telah memberikan izin akses lokasi.' });
            setIsGettingLocation(false);
        }
    );
  };

  if (isLoading) {
      return <SettingsFormSkeleton />;
  }

  return (
    <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
                <CardHeader>
                    <CardTitle>Pengaturan Absensi</CardTitle>
                    <CardDescription>Atur lokasi kantor, radius, dan jam kerja default untuk evaluasi absensi.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="space-y-4 p-4 border rounded-lg">
                        <h3 className="font-semibold">Lokasi Kantor</h3>
                         <div className="space-y-2">
                             <Button type="button" onClick={getCurrentLocation} disabled={isGettingLocation}>
                                 {isGettingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                                 Ambil Lokasi Saya Sekarang
                             </Button>
                             <FormDescription>Klik tombol ini saat Anda berada di lokasi kantor untuk mengisi koordinat secara otomatis.</FormDescription>
                         </div>
                        <FormField control={form.control} name="radiusM" render={({ field }) => (<FormItem><FormLabel>Radius Toleransi (meter)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Jarak maksimal dari titik kantor yang masih dianggap "Onsite".</FormDescription><FormMessage /></FormItem>)} />
                        
                        <Accordion type="single" collapsible>
                            <AccordionItem value="advanced-location">
                                <AccordionTrigger>Pengaturan Lanjutan (Koordinat Manual)</AccordionTrigger>
                                <AccordionContent className="pt-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="office.lat" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="office.lng" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                     <Button type="button" variant="outline" size="sm" onClick={setDefaults}><MapPin className="mr-2 h-4 w-4" /> Gunakan Alamat Default</Button>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>

                    </div>

                    <div className="space-y-4 p-4 border rounded-lg">
                        <h3 className="font-semibold">Jam Kerja</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name="shift.startTime" render={({ field }) => (<FormItem><FormLabel>Jam Masuk</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="shift.endTime" render={({ field }) => (<FormItem><FormLabel>Jam Pulang</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="shift.graceLateMinutes" render={({ field }) => (<FormItem><FormLabel>Batas Telat (menit)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1 pt-2">
                            <p>&bull; <strong>Terlambat</strong> jika Tap In &gt; Jam Masuk + Batas Telat.</p>
                            <p>&bull; <strong>Pulang Cepat</strong> jika Tap Out &lt; Jam Pulang.</p>
                            <p>&bull; <strong>Lembur</strong> jika Tap Out &gt; Jam Pulang.</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSaving} className="ml-auto">
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Simpan Pengaturan
                    </Button>
                </CardFooter>
            </Card>
        </form>
    </Form>
  );
}
