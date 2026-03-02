'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save, MapPin, LocateFixed, Link as LinkIcon, AlertCircle, X } from 'lucide-react';
import type { AttendanceConfig } from '@/lib/types';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

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

type DraftLocation = {
    lat: number;
    lng: number;
    accuracy: number;
};

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
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [draftLocation, setDraftLocation] = useState<DraftLocation | null>(null);
  const [geocodeResult, setGeocodeResult] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [savedLocationAddress, setSavedLocationAddress] = useState<string | null>(null);

  const configRef = useMemoFirebase(() => doc(firestore, 'attendance_config', 'default'), [firestore]);
  const { data: config, isLoading } = useDoc<AttendanceConfig>(configRef);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });
  
  useEffect(() => {
    if (config?.office) {
        setSavedLocationAddress('Mencari alamat...');
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${config.office.lat}&lon=${config.office.lng}`)
            .then(res => res.json())
            .then(data => {
                if (data?.display_name) {
                    setSavedLocationAddress(data.display_name);
                } else {
                    setSavedLocationAddress('Alamat tidak ditemukan.');
                }
            })
            .catch(err => {
                console.error("Failed to reverse geocode saved location:", err);
                setSavedLocationAddress('Gagal memuat alamat.');
            });
    }
  }, [config]);


  useEffect(() => {
    if (config) {
        form.reset({
            office: config.office,
            radiusM: config.radiusM,
            shift: config.shift,
        });
    }
  }, [config, form]);

  const reverseGeocode = async (lat: number, lng: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Nominatim API failed: ${response.statusText}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setGeocodeResult(data.display_name || 'Alamat tidak ditemukan.');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setGeocodeError('Gagal mendapatkan alamat: Waktu habis.');
      } else {
        setGeocodeError(`Gagal mendapatkan alamat: ${error.message}`);
      }
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
        toast({ variant: 'destructive', title: 'Error', description: 'Geolocation tidak didukung oleh browser Anda.' });
        return;
    }
    setIsFetchingLocation(true);
    setDraftLocation(null);
    setGeocodeResult(null);
    setGeocodeError(null);
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const newLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
            };
            setDraftLocation(newLocation);
            reverseGeocode(newLocation.lat, newLocation.lng);
            setIsFetchingLocation(false);
        },
        () => {
            toast({ variant: 'destructive', title: 'Izin Lokasi Ditolak', description: 'Aktifkan izin lokasi di browser Anda untuk menggunakan fitur ini.' });
            setIsFetchingLocation(false);
        }
    );
  };

  const handleUseLocation = () => {
    if (!draftLocation) return;
    form.setValue('office.lat', draftLocation.lat);
    form.setValue('office.lng', draftLocation.lng);
    toast({ title: 'Lokasi Diterapkan', description: 'Koordinat kantor telah diisi pada formulir.'});
    setDraftLocation(null);
  };

  const setDefaults = () => {
    form.reset(DEFAULT_VALUES);
    toast({ title: 'Pengaturan Default', description: 'Formulir telah diisi dengan nilai default.'});
  };

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
                        <div className="p-3 bg-muted rounded-md text-sm">
                          <p className="font-semibold text-muted-foreground">Pengaturan Lokasi Saat Ini:</p>
                           {config ? (
                            <>
                                {savedLocationAddress ? (
                                    <p className="font-semibold">{savedLocationAddress}</p>
                                ) : (
                                    <p className="font-mono">{`${config.office.lat.toFixed(6)}, ${config.office.lng.toFixed(6)}`}</p>
                                )}
                                <p className="text-xs text-muted-foreground">Radius: {config.radiusM} meter</p>
                            </>
                            ) : (
                                <p className="text-muted-foreground italic">Belum diatur</p>
                            )}
                        </div>
                         <div className="space-y-2">
                             <Button type="button" onClick={getCurrentLocation} disabled={isFetchingLocation}>
                                 {isFetchingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                                 Ambil Lokasi Saya Sekarang
                             </Button>
                             <FormDescription>Klik tombol ini saat Anda berada di kantor untuk mengisi koordinat secara otomatis.</FormDescription>
                         </div>
                        
                        {isFetchingLocation && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Mencari lokasi dan alamat...</div>}
                        
                        {draftLocation && (
                            <div className="p-4 border-2 border-dashed rounded-lg space-y-4">
                               <div className="flex justify-between items-start">
                                 <div>
                                    <h4 className="font-semibold text-lg">Pratinjau Lokasi</h4>
                                    <p className="text-sm text-muted-foreground">Pastikan lokasi yang terdeteksi sudah benar.</p>
                                 </div>
                                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraftLocation(null)}><X className="h-4 w-4" /></Button>
                               </div>

                                <iframe
                                    width="100%"
                                    height="250"
                                    loading="lazy"
                                    className="rounded-md border"
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${draftLocation.lng - 0.005},${draftLocation.lat - 0.005},${draftLocation.lng + 0.005},${draftLocation.lat + 0.005}&layer=mapnik&marker=${draftLocation.lat},${draftLocation.lng}`}
                                ></iframe>
                                
                                {geocodeResult && <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Perkiraan Alamat</AlertTitle><AlertDescription>{geocodeResult}</AlertDescription></Alert>}
                                {geocodeError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Gagal Mendapatkan Alamat</AlertTitle><AlertDescription>{geocodeError}</AlertDescription></Alert>}

                                <div className="text-xs text-muted-foreground">
                                    <p>Koordinat: {draftLocation.lat.toFixed(6)}, {draftLocation.lng.toFixed(6)}</p>
                                    <p>Akurasi: &plusmn;{draftLocation.accuracy.toFixed(0)} meter</p>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                    <Button type="button" onClick={handleUseLocation}>Gunakan Lokasi Ini</Button>
                                    <Button asChild variant="outline"><a href={`https://www.google.com/maps?q=${draftLocation.lat},${draftLocation.lng}`} target="_blank" rel="noopener noreferrer"><LinkIcon className="mr-2 h-4 w-4" /> Buka di Google Maps</a></Button>
                                </div>
                            </div>
                        )}
                        
                        <FormField control={form.control} name="radiusM" render={({ field }) => (<FormItem><FormLabel>Radius Toleransi (meter)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Jarak maksimal dari titik kantor yang masih dianggap "Onsite".</FormDescription><FormMessage /></FormItem>)} />
                        
                        <Accordion type="single" collapsible>
                            <AccordionItem value="advanced-location">
                                <AccordionTrigger>Pengaturan Lanjutan (Koordinat Manual)</AccordionTrigger>
                                <AccordionContent className="pt-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="office.lat" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="office.lng" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                     <Button type="button" variant="outline" size="sm" onClick={setDefaults}><MapPin className="mr-2 h-4 w-4" /> Gunakan Lokasi Default</Button>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>

                    <div className="space-y-4 p-4 border rounded-lg">
                        <h3 className="font-semibold">Jam Kerja</h3>
                        <div className="p-3 bg-muted rounded-md text-sm">
                          <p className="font-semibold text-muted-foreground">Pengaturan Jam Kerja Saat Ini:</p>
                          {config ? (
                            <p className="font-mono">
                              Masuk: {config.shift.startTime}, Pulang: {config.shift.endTime}, Batas Telat: {config.shift.graceLateMinutes} menit
                            </p>
                          ) : (
                            <p className="text-muted-foreground italic">Belum diatur</p>
                          )}
                        </div>
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
