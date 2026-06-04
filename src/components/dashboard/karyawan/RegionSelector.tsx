"use client";

import React, { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { UseFormReturn } from "react-hook-form";
import { Loader2 } from "lucide-react";

interface RegionData {
  id: string;
  name: string;
}

const CACHE: Record<string, RegionData[]> = {};

async function fetchRegion(url: string): Promise<RegionData[]> {
  if (CACHE[url]) return CACHE[url];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Gagal mengambil data wilayah");
    const data = await res.json();
    CACHE[url] = data;
    return data;
  } catch (error) {
    console.error(error);
    return [];
  }
}

interface RegionSelectorProps {
  form: UseFormReturn<any>;
  basePath: string; // e.g. "alamat.ktp" or "alamat.domisili"
  disabled?: boolean;
}

export function RegionSelector({
  form,
  basePath,
  disabled = false,
}: RegionSelectorProps) {
  const [provinces, setProvinces] = useState<RegionData[]>([]);
  const [regencies, setRegencies] = useState<RegionData[]>([]);
  const [districts, setDistricts] = useState<RegionData[]>([]);
  const [villages, setVillages] = useState<RegionData[]>([]);

  const [loadingProvince, setLoadingProvince] = useState(false);
  const [loadingRegency, setLoadingRegency] = useState(false);
  const [loadingDistrict, setLoadingDistrict] = useState(false);
  const [loadingVillage, setLoadingVillage] = useState(false);

  const selectedProvinsi = form.watch(`${basePath}.provinsi`);
  const selectedKabupaten = form.watch(`${basePath}.kabupatenKota`);
  const selectedKecamatan = form.watch(`${basePath}.kecamatan`);

  // Initial load provinces
  useEffect(() => {
    let isMounted = true;
    const loadProvinces = async () => {
      setLoadingProvince(true);
      const data = await fetchRegion(
        "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json",
      );
      if (isMounted) {
        setProvinces(data);
        setLoadingProvince(false);
      }
    };
    loadProvinces();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load regencies when province changes
  useEffect(() => {
    let isMounted = true;
    if (selectedProvinsi?.id) {
      const loadRegencies = async () => {
        setLoadingRegency(true);
        const data = await fetchRegion(
          `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${selectedProvinsi.id}.json`,
        );
        if (isMounted) {
          setRegencies(data);
          setLoadingRegency(false);
        }
      };
      loadRegencies();
    } else {
      setRegencies([]);
    }
    return () => {
      isMounted = false;
    };
  }, [selectedProvinsi?.id]);

  // Load districts when regency changes
  useEffect(() => {
    let isMounted = true;
    if (selectedKabupaten?.id) {
      const loadDistricts = async () => {
        setLoadingDistrict(true);
        const data = await fetchRegion(
          `https://www.emsifa.com/api-wilayah-indonesia/api/districts/${selectedKabupaten.id}.json`,
        );
        if (isMounted) {
          setDistricts(data);
          setLoadingDistrict(false);
        }
      };
      loadDistricts();
    } else {
      setDistricts([]);
    }
    return () => {
      isMounted = false;
    };
  }, [selectedKabupaten?.id]);

  // Load villages when district changes
  useEffect(() => {
    let isMounted = true;
    if (selectedKecamatan?.id) {
      const loadVillages = async () => {
        setLoadingVillage(true);
        const data = await fetchRegion(
          `https://www.emsifa.com/api-wilayah-indonesia/api/villages/${selectedKecamatan.id}.json`,
        );
        if (isMounted) {
          setVillages(data);
          setLoadingVillage(false);
        }
      };
      loadVillages();
    } else {
      setVillages([]);
    }
    return () => {
      isMounted = false;
    };
  }, [selectedKecamatan?.id]);

  const handleProvinceChange = (id: string, onChange: (val: any) => void) => {
    const prov = provinces.find((p) => p.id === id);
    onChange(prov || undefined);
    form.setValue(`${basePath}.kabupatenKota`, undefined);
    form.setValue(`${basePath}.kecamatan`, undefined);
    form.setValue(`${basePath}.kelurahan`, undefined);
  };

  const handleRegencyChange = (id: string, onChange: (val: any) => void) => {
    const reg = regencies.find((r) => r.id === id);
    onChange(reg || undefined);
    form.setValue(`${basePath}.kecamatan`, undefined);
    form.setValue(`${basePath}.kelurahan`, undefined);
  };

  const handleDistrictChange = (id: string, onChange: (val: any) => void) => {
    const dist = districts.find((d) => d.id === id);
    onChange(dist || undefined);
    form.setValue(`${basePath}.kelurahan`, undefined);
  };

  const handleVillageChange = (id: string, onChange: (val: any) => void) => {
    const vill = villages.find((v) => v.id === id);
    onChange(vill || undefined);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <FormField
        control={form.control}
        name={`${basePath}.provinsi`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider font-semibold">
              Provinsi*
            </FormLabel>
            <Select
              disabled={disabled || loadingProvince || provinces.length === 0}
              value={field.value?.id || ""}
              onValueChange={(val) => handleProvinceChange(val, field.onChange)}
            >
              <FormControl>
                <SelectTrigger className="bg-white dark:bg-slate-950/40 rounded-xl h-11 border-slate-200 dark:border-slate-800">
                  {loadingProvince ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <SelectValue placeholder="Pilih Provinsi" />
                  )}
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {provinces.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${basePath}.kabupatenKota`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider font-semibold">
              Kabupaten/Kota*
            </FormLabel>
            <Select
              disabled={
                disabled ||
                loadingRegency ||
                !selectedProvinsi ||
                regencies.length === 0
              }
              value={field.value?.id || ""}
              onValueChange={(val) => handleRegencyChange(val, field.onChange)}
            >
              <FormControl>
                <SelectTrigger className="bg-white dark:bg-slate-950/40 rounded-xl h-11 border-slate-200 dark:border-slate-800">
                  {loadingRegency ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <SelectValue placeholder="Pilih Kabupaten/Kota" />
                  )}
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {regencies.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${basePath}.kecamatan`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider font-semibold">
              Kecamatan*
            </FormLabel>
            <Select
              disabled={
                disabled ||
                loadingDistrict ||
                !selectedKabupaten ||
                districts.length === 0
              }
              value={field.value?.id || ""}
              onValueChange={(val) => handleDistrictChange(val, field.onChange)}
            >
              <FormControl>
                <SelectTrigger className="bg-white dark:bg-slate-950/40 rounded-xl h-11 border-slate-200 dark:border-slate-800">
                  {loadingDistrict ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <SelectValue placeholder="Pilih Kecamatan" />
                  )}
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {districts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${basePath}.kelurahan`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider font-semibold">
              Desa/Kelurahan*
            </FormLabel>
            <Select
              disabled={
                disabled ||
                loadingVillage ||
                !selectedKecamatan ||
                villages.length === 0
              }
              value={field.value?.id || ""}
              onValueChange={(val) => handleVillageChange(val, field.onChange)}
            >
              <FormControl>
                <SelectTrigger className="bg-white dark:bg-slate-950/40 rounded-xl h-11 border-slate-200 dark:border-slate-800">
                  {loadingVillage ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <SelectValue placeholder="Pilih Kelurahan" />
                  )}
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {villages.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
