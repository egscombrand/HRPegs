"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WilayahItem {
  code: string;
  name: string;
}

export interface RegionValue {
  provinceCode: string;
  provinceName: string;
  regencyCode: string;
  regencyName: string;
  districtCode: string;
  districtName: string;
  villageCode: string;
  villageName: string;
}

export const emptyRegionValue: RegionValue = {
  provinceCode: "",
  provinceName: "",
  regencyCode: "",
  regencyName: "",
  districtCode: "",
  districtName: "",
  villageCode: "",
  villageName: "",
};

interface RegionCascadeSelectProps {
  value: RegionValue;
  onChange: (value: RegionValue) => void;
  disabled?: boolean;
  errors?: {
    province?: string;
    regency?: string;
    district?: string;
    village?: string;
  };
}

type FetchState = "idle" | "loading" | "error" | "done";

async function fetchWilayah(url: string): Promise<WilayahItem[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return Array.isArray(json.data) ? json.data : [];
}

interface LevelSelectProps {
  label: string;
  placeholder: string;
  value: string;
  items: WilayahItem[];
  fetchState: FetchState;
  onRetry: () => void;
  onChange: (code: string) => void;
  disabled?: boolean;
  errorMsg?: string;
}

function LevelSelect({
  label,
  placeholder,
  value,
  items,
  fetchState,
  onRetry,
  onChange,
  disabled,
  errorMsg,
}: LevelSelectProps) {
  const isDisabled = disabled || fetchState === "loading" || fetchState === "idle";

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} <span className="text-destructive">*</span>
      </Label>
      {fetchState === "error" ? (
        <div className="flex items-center gap-2 h-9 px-3 border rounded-md border-destructive/50 bg-destructive/5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Gagal memuat data.</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs"
            onClick={onRetry}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Coba lagi
          </Button>
        </div>
      ) : (
        <Select
          value={value || ""}
          onValueChange={onChange}
          disabled={isDisabled}
        >
          <SelectTrigger
            className={cn(
              "h-9 text-sm",
              errorMsg && "border-destructive focus:ring-destructive",
            )}
          >
            {fetchState === "loading" ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Memuat...
              </span>
            ) : (
              <SelectValue placeholder={placeholder} />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {items.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {errorMsg && (
        <p className="text-xs font-medium text-destructive">{errorMsg}</p>
      )}
    </div>
  );
}

export function RegionCascadeSelect({
  value,
  onChange,
  disabled,
  errors,
}: RegionCascadeSelectProps) {
  const [provinces, setProvinces] = useState<WilayahItem[]>([]);
  const [regencies, setRegencies] = useState<WilayahItem[]>([]);
  const [districts, setDistricts] = useState<WilayahItem[]>([]);
  const [villages, setVillages] = useState<WilayahItem[]>([]);

  const [provState, setProvState] = useState<FetchState>("idle");
  const [regState, setRegState] = useState<FetchState>("idle");
  const [distState, setDistState] = useState<FetchState>("idle");
  const [villState, setVillState] = useState<FetchState>("idle");

  const loadProvinces = useCallback(async () => {
    setProvState("loading");
    try {
      const data = await fetchWilayah("/api/wilayah/provinces");
      setProvinces(data);
      setProvState("done");
    } catch {
      setProvState("error");
    }
  }, []);

  const loadRegencies = useCallback(async (provinceCode: string) => {
    if (!provinceCode) return;
    setRegState("loading");
    setRegencies([]);
    try {
      const data = await fetchWilayah(`/api/wilayah/regencies?provinceCode=${provinceCode}`);
      setRegencies(data);
      setRegState("done");
    } catch {
      setRegState("error");
    }
  }, []);

  const loadDistricts = useCallback(async (regencyCode: string) => {
    if (!regencyCode) return;
    setDistState("loading");
    setDistricts([]);
    try {
      const data = await fetchWilayah(`/api/wilayah/districts?regencyCode=${regencyCode}`);
      setDistricts(data);
      setDistState("done");
    } catch {
      setDistState("error");
    }
  }, []);

  const loadVillages = useCallback(async (districtCode: string) => {
    if (!districtCode) return;
    setVillState("loading");
    setVillages([]);
    try {
      const data = await fetchWilayah(`/api/wilayah/villages?districtCode=${districtCode}`);
      setVillages(data);
      setVillState("done");
    } catch {
      setVillState("error");
    }
  }, []);

  // Load provinces once on mount
  useEffect(() => {
    loadProvinces();
  }, [loadProvinces]);

  // Load regencies when province changes
  useEffect(() => {
    if (value.provinceCode) {
      loadRegencies(value.provinceCode);
    } else {
      setRegencies([]);
      setRegState("idle");
    }
  }, [value.provinceCode, loadRegencies]);

  // Load districts when regency changes
  useEffect(() => {
    if (value.regencyCode) {
      loadDistricts(value.regencyCode);
    } else {
      setDistricts([]);
      setDistState("idle");
    }
  }, [value.regencyCode, loadDistricts]);

  // Load villages when district changes
  useEffect(() => {
    if (value.districtCode) {
      loadVillages(value.districtCode);
    } else {
      setVillages([]);
      setVillState("idle");
    }
  }, [value.districtCode, loadVillages]);

  const handleProvinceChange = (code: string) => {
    const found = provinces.find((p) => p.code === code);
    onChange({
      provinceCode: code,
      provinceName: found?.name || "",
      regencyCode: "",
      regencyName: "",
      districtCode: "",
      districtName: "",
      villageCode: "",
      villageName: "",
    });
  };

  const handleRegencyChange = (code: string) => {
    const found = regencies.find((r) => r.code === code);
    onChange({
      ...value,
      regencyCode: code,
      regencyName: found?.name || "",
      districtCode: "",
      districtName: "",
      villageCode: "",
      villageName: "",
    });
  };

  const handleDistrictChange = (code: string) => {
    const found = districts.find((d) => d.code === code);
    onChange({
      ...value,
      districtCode: code,
      districtName: found?.name || "",
      villageCode: "",
      villageName: "",
    });
  };

  const handleVillageChange = (code: string) => {
    const found = villages.find((v) => v.code === code);
    onChange({
      ...value,
      villageCode: code,
      villageName: found?.name || "",
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <LevelSelect
        label="Provinsi"
        placeholder="Pilih Provinsi"
        value={value.provinceCode}
        items={provinces}
        fetchState={provState}
        onRetry={loadProvinces}
        onChange={handleProvinceChange}
        disabled={disabled}
        errorMsg={errors?.province}
      />
      <LevelSelect
        label="Kota / Kabupaten"
        placeholder="Pilih kota/kabupaten"
        value={value.regencyCode}
        items={regencies}
        fetchState={value.provinceCode ? regState : "idle"}
        onRetry={() => loadRegencies(value.provinceCode)}
        onChange={handleRegencyChange}
        disabled={disabled || !value.provinceCode}
        errorMsg={errors?.regency}
      />
      <LevelSelect
        label="Kecamatan"
        placeholder="Pilih kecamatan"
        value={value.districtCode}
        items={districts}
        fetchState={value.regencyCode ? distState : "idle"}
        onRetry={() => loadDistricts(value.regencyCode)}
        onChange={handleDistrictChange}
        disabled={disabled || !value.regencyCode}
        errorMsg={errors?.district}
      />
      <LevelSelect
        label="Kelurahan / Desa"
        placeholder="Pilih kelurahan/desa"
        value={value.villageCode}
        items={villages}
        fetchState={value.districtCode ? villState : "idle"}
        onRetry={() => loadVillages(value.districtCode)}
        onChange={handleVillageChange}
        disabled={disabled || !value.districtCode}
        errorMsg={errors?.village}
      />
    </div>
  );
}
