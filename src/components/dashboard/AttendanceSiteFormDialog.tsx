'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save, LocateFixed, Link as LinkIcon, AlertCircle, Search, MapPin } from 'lucide-react';
import type { AttendanceSite, Brand } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import L from 'leaflet';
import { Slider } from '../ui/slider';
import dynamic from 'next/dynamic';

// Fix Leaflet's default icon path issue with Webpack
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const formSchema = z.object({
  name: z.string().min(3, "Nama site minimal 3 karakter."),
  brandIds: z.array(z.string()).min(1, "Minimal pilih satu brand."),
  isActive: z.boolean().default(true),
  office: z.object({
    lat: z.coerce.number().min(-90, "Latitude tidak valid.").max(90, "Latitude tidak valid."),
    lng: z.coerce.number().min(-180, "Longitude tidak valid.").max(180, "Longitude tidak valid."),
  }),
  radiusM: z.coerce.number().int().min(10, 'Radius minimal 10 meter.').max(500, 'Radius maksimal 500 meter.'),
  shift: z.object({
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
    graceLateMinutes: z.coerce.number().int().min(0, 'Batas telat tidak boleh negatif.'),
  }),
});

type FormValues = z.infer<typeof formSchema>;

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
  const [addressSearch, setAddressSearch] = useState('');
  const mode = site ? 'Edit' : 'Create';

  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        name: '', brandIds: [], isActive: true,
        office: { lat: -7.7956, lng: 110.3695 }, radiusM: 100,
        shift: { startTime: '09:00', endTime: '17:00', graceLateMinutes: 15 }
    }
  });
  
  const watchedLat = form.watch('office.lat');
  const watchedLng = form.watch('office.lng');
  const watchedRadius = form.watch('radiusM');

  const initializeMap = useCallback(() => {
    if (mapContainerRef.current && !mapRef.current) {
        const initialCoords: [number, number] = [watchedLat, watchedLng];
        const map = L.map(mapContainerRef.current).setView(initialCoords, 16);
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        const marker = L.marker(initialCoords, { draggable: true }).addTo(map);
        markerRef.current = marker;

        const circle = L.circle(initialCoords, { radius: watchedRadius }).addTo(map);
        circleRef.current = circle;

        marker.on('dragend', (e) => {
            const { lat, lng } = e.target.getLatLng();
            form.setValue('office', { lat, lng }, { shouldValidate: true });
        });
    }
  }, [watchedLat, watchedLng, watchedRadius, form]);

  useEffect(() => {
    if (open) {
      setTimeout(() => { // Defer map initialization
          initializeMap();
      }, 100);
    } else if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, initializeMap]);

  useEffect(() => {
    if (mapRef.current) {
        setTimeout(() => mapRef.current?.invalidateSize(), 150);
    }
  }, [open, form.formState.isSubmitting]);

  useEffect(() => {
      if (mapRef.current && markerRef.current) {
          const newLatLng: [number, number] = [watchedLat, watchedLng];
          mapRef.current.setView(newLatLng, mapRef.current.getZoom());
          markerRef.current.setLatLng(newLatLng);
      }
      if(circleRef.current) {
          circleRef.current.setLatLng([watchedLat, watchedLng]);
      }
  }, [watchedLat, watchedLng]);

  useEffect(() => {
      if(circleRef.current) {
          circleRef.current.setRadius(watchedRadius);
      }
  }, [watchedRadius]);

  useEffect(() => {
    if (open) {
      const initialValues = site ? { 
        ...site, 
        radiusM: site.radiusM || 100, 
        brandIds: site.brandIds || [] 
      } : {
        name: '', brandIds: [], isActive: true,
        office: { lat: -7.7956, lng: 110.3695 }, radiusM: 100,
        shift: { startTime: '09:00', endTime: '17:00', graceLateMinutes: 15 }
      };
      form.reset(initialValues);
    }
  }, [open, site, form]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
        toast({ variant: 'destructive', title: 'Error', description: 'Geolocation tidak didukung oleh browser Anda.' });
        return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            form.setValue('office', { lat: latitude, lng: longitude }, { shouldValidate: true });
            setIsFetchingLocation(false);
            toast({ title: 'Lokasi Ditemukan', description: 'Titik lokasi telah diperbarui.'});
        },
        () => {
            toast({ variant: 'destructive', title: 'Izin Lokasi Ditolak', description: 'Aktifkan izin lokasi di browser Anda.' });
            setIsFetchingLocation(false);
        }
    );
  };
  
  const handleAddressSearch = async () => {
    if (!addressSearch) return;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            form.setValue('office', { lat: parseFloat(lat), lng: parseFloat(lon) }, { shouldValidate: true });
        } else {
            toast({ variant: 'destructive', title: 'Alamat Tidak Ditemukan' });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Gagal mencari alamat' });
    }
  };
  
  const handleUseDefaultLocation = () => {
    const defaultLocation = { lat: -7.761699, lng: 110.367134 };
    form.setValue('office', defaultLocation, { shouldValidate: true });
    toast({ title: 'Lokasi Default Digunakan'});
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
      toast({ title: 'Pengaturan Disimpan'});
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{mode} Site Absensi</DialogTitle>
          <DialogDescription>
            Isi detail untuk lokasi kantor dan aturan absensinya.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto">
         <Form {...form}>
          <form id="site-form" onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Form Fields */}
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nama Site</FormLabel><FormControl><Input placeholder="Kantor Pusat Yogyakarta" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField
                control={form.control}
                name="brandIds"
                render={() => (
                  <FormItem>
                    <FormLabel>Brand Terkait</FormLabel>
                    <div className="h-24 w-full rounded-md border p-4 overflow-y-auto">
                    {brands.map((brand) => (
                      <FormField key={brand.id} control={form.control} name="brandIds" render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 mb-2"><FormControl><Checkbox checked={field.value?.includes(brand.id!)} onCheckedChange={(checked) => {return checked ? field.onChange([...(field.value || []), brand.id!]) : field.onChange((field.value || []).filter((value) => value !== brand.id!))}} /></FormControl><FormLabel className="font-normal">{brand.name}</FormLabel></FormItem>
                      )}/>
                    ))}
                    </div>
                    <FormDescription>Satu site bisa untuk beberapa brand. Karyawan akan diarahkan ke site berdasarkan brandId mereka.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Aktifkan Site Ini</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold">Jam Kerja</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="shift.startTime" render={({ field }) => (<FormItem><FormLabel>Jam Masuk</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="shift.endTime" render={({ field }) => (<FormItem><FormLabel>Jam Pulang</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="shift.graceLateMinutes" render={({ field }) => (<FormItem><FormLabel>Batas Telat (menit)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </div>
            </div>
            <div className="p-6 lg:border-l flex flex-col gap-4">
               <h3 className="font-semibold">Titik Lokasi & Radius</h3>
               <div ref={mapContainerRef} className="w-full h-[320px] rounded-xl overflow-hidden z-0" />
               <FormField control={form.control} name="radiusM" render={({ field }) => (
                <FormItem>
                    <FormLabel>Radius Area Absensi: {field.value} meter</FormLabel>
                    <div className="flex items-center gap-4">
                      <Slider min={10} max={500} step={5} value={[field.value]} onValueChange={(vals) => field.onChange(vals[0])} className="flex-1" />
                    </div>
                    <FormMessage />
                </FormItem>
              )} />
               <div className="space-y-2">
                <Label>Cari Alamat</Label>
                <div className="flex gap-2">
                    <Input placeholder='Cari nama jalan/tempat...' value={addressSearch} onChange={(e) => setAddressSearch(e.target.value)} />
                    <Button type="button" onClick={handleAddressSearch}><Search className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={getCurrentLocation} disabled={isFetchingLocation}>
                      {isFetchingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                      Ambil Lokasi Saya
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={handleUseDefaultLocation}>Gunakan Lokasi Default</Button>
              </div>
               <Accordion type="single" collapsible><AccordionItem value="advanced-location"><AccordionTrigger>Pengaturan Lanjutan (Koordinat Manual)</AccordionTrigger><AccordionContent className="pt-4 space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FormField control={form.control} name="office.lat" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="office.lng" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>)} /></div></AccordionContent></AccordionItem></Accordion>
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
