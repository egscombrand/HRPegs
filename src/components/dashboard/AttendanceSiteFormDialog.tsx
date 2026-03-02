
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save, MapPin, LocateFixed, Link as LinkIcon, AlertCircle, X, Check } from 'lucide-react';
import type { AttendanceSite, Brand } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const formSchema = z.object({
  name: z.string().min(3, "Nama site minimal 3 karakter."),
  brandId: z.string({ required_error: "Brand harus dipilih."}),
  isActive: z.boolean().default(true),
  office: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }),
  radiusM: z.coerce.number().int().min(10, 'Radius minimal 10 meter.').max(300, 'Radius maksimal 300 meter.'),
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

interface AttendanceSiteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: AttendanceSite | null;
  brands: Brand[];
}

export function AttendanceSiteFormDialog({ open, onOpenChange, site, brands }: AttendanceSiteFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [draftLocation, setDraftLocation] = useState<DraftLocation | null>(null);
  const [geocodeResult, setGeocodeResult] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  
  const mode = site ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        name: '',
        brandId: '',
        isActive: true,
        office: DEFAULT_OFFICE,
        radiusM: 150,
        shift: { startTime: '09:00', endTime: '17:00', graceLateMinutes: 15 }
    }
  });

  useEffect(() => {
    if (open) {
      if (site) {
        form.reset({ ...site, radiusM: site.radiusM || 150 });
      } else {
        form.reset({
            name: '', brandId: '', isActive: true,
            office: DEFAULT_OFFICE, radiusM: 150,
            shift: { startTime: '09:00', endTime: '17:00', graceLateMinutes: 15 }
        });
      }
      setDraftLocation(null);
      setGeocodeResult(null);
      setGeocodeError(null);
    }
  }, [open, site, form]);

  const reverseGeocode = async (lat: number, lng: number) => {
    // ... (implementation is the same as before)
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
            const newLocation = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
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
    form.setValue('office.lat', draftLocation.lat, { shouldValidate: true });
    form.setValue('office.lng', draftLocation.lng, { shouldValidate: true });
    toast({ title: 'Lokasi Diterapkan', description: 'Koordinat kantor telah diisi pada formulir.'});
    setDraftLocation(null);
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const docRef = site ? doc(firestore, 'attendance_sites', site.id!) : doc(collection(firestore, 'attendance_sites'));
      const payload: Omit<AttendanceSite, 'id'> = {
        ...values,
        timezone: 'Asia/Jakarta',
        workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        updatedAt: serverTimestamp() as Timestamp,
        updatedBy: userProfile.uid,
      };
      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({ title: 'Pengaturan Disimpan', description: `Aturan untuk site "${values.name}" telah disimpan.` });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{mode} Site Absensi</DialogTitle>
          <DialogDescription>
            Isi detail untuk lokasi kantor dan aturan absensinya.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
          <Form {...form}>
            <form id="site-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nama Site</FormLabel><FormControl><Input placeholder="Kantor Pusat Yogyakarta" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="brandId" render={({ field }) => (<FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih Brand" /></SelectTrigger></FormControl><SelectContent>{brands.map(brand => <SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Aktifkan Site Ini</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
              
              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold">Lokasi Kantor</h3>
                <Button type="button" onClick={getCurrentLocation} disabled={isFetchingLocation}>
                    {isFetchingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                    Ambil Lokasi Saya Sekarang
                </Button>
                {draftLocation && (
                    <div className="p-4 border-2 border-dashed rounded-lg space-y-4">
                        <div className="flex justify-between items-start"><h4 className="font-semibold text-lg">Pratinjau Lokasi</h4><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraftLocation(null)}><X className="h-4 w-4" /></Button></div>
                        <iframe width="100%" height="250" loading="lazy" className="rounded-md border" src={`https://www.openstreetmap.org/export/embed.html?bbox=${draftLocation.lng - 0.005},${draftLocation.lat - 0.005},${draftLocation.lng + 0.005},${draftLocation.lat + 0.005}&layer=mapnik&marker=${draftLocation.lat},${draftLocation.lng}`} />
                        {geocodeResult && <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Perkiraan Alamat</AlertTitle><AlertDescription>{geocodeResult}</AlertDescription></Alert>}
                        <div className="text-xs text-muted-foreground"><p>Koordinat: {draftLocation.lat.toFixed(6)}, {draftLocation.lng.toFixed(6)}</p><p>Akurasi: &plusmn;{draftLocation.accuracy.toFixed(0)} meter</p></div>
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <Button type="button" onClick={handleUseLocation}><Check className="mr-2 h-4 w-4" /> Gunakan Lokasi Ini</Button>
                          <Button asChild variant="outline"><a href={`https://www.google.com/maps?q=${draftLocation.lat},${draftLocation.lng}`} target="_blank" rel="noopener noreferrer"><LinkIcon className="mr-2 h-4 w-4" /> Buka di Google Maps</a></Button>
                        </div>
                    </div>
                )}
                <FormField control={form.control} name="radiusM" render={({ field }) => (<FormItem><FormLabel>Radius Toleransi (meter)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Jarak maksimal dari titik kantor yang masih dianggap "Onsite".</FormDescription><FormMessage /></FormItem>)} />
                <Accordion type="single" collapsible><AccordionItem value="advanced-location"><AccordionTrigger>Pengaturan Lanjutan (Koordinat Manual)</AccordionTrigger><AccordionContent className="pt-4 space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FormField control={form.control} name="office.lat" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="office.lng" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} /></div></AccordionContent></AccordionItem></Accordion>
              </div>

              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold">Jam Kerja</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="shift.startTime" render={({ field }) => (<FormItem><FormLabel>Jam Masuk</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="shift.endTime" render={({ field }) => (<FormItem><FormLabel>Jam Pulang</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="shift.graceLateMinutes" render={({ field }) => (<FormItem><FormLabel>Batas Telat (menit)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="site-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Pengaturan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    