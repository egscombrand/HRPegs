'use client';

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RotateCcw, Search } from "lucide-react";
import type { Brand, AttendanceSite } from '@/lib/types';
import type { FilterState } from "./HrdDashboardTypes";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";

interface GlobalFilterBarProps {
  brands: Brand[];
  sites: AttendanceSite[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}

export function GlobalFilterBar({ brands, sites, filters, setFilters }: GlobalFilterBarProps) {
  
  const handleDateChange = (date: Date | null) => {
    setFilters(prev => ({ ...prev, date }));
  };

  const handleBrandChange = (brandId: string) => {
    setFilters(prev => ({ ...prev, brandId: brandId === 'all' ? undefined : brandId }));
  };
  
  const handleSiteChange = (siteId: string) => {
    setFilters(prev => ({ ...prev, siteId: siteId === 'all' ? undefined : siteId }));
  };
  
  const handleEmploymentTypeChange = (type: string) => {
    setFilters(prev => ({ ...prev, employmentType: type === 'all' ? undefined : type as FilterState['employmentType'] }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, searchTerm: e.target.value }));
  };

  const toggleNeedsAction = (checked: boolean) => {
    setFilters(prev => ({ ...prev, needsActionOnly: checked }));
  };

  const handleReset = () => {
    setFilters({ date: new Date(), brandId: undefined, siteId: undefined, employmentType: undefined, searchTerm: '', needsActionOnly: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <GoogleDatePicker value={filters.date} onChange={handleDateChange} className="w-full sm:w-auto" />
      
      <Select value={filters.brandId || 'all'} onValueChange={handleBrandChange}>
        <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Brands" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All Brands</SelectItem>{brands.map(brand => (<SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>))}</SelectContent>
      </Select>

      <Select value={filters.siteId || 'all'} onValueChange={handleSiteChange}>
        <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Sites" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All Sites</SelectItem>{sites.map(site => (<SelectItem key={site.id!} value={site.id!}>{site.name}</SelectItem>))}</SelectContent>
      </Select>
      
      <Select value={filters.employmentType || 'all'} onValueChange={handleEmploymentTypeChange}>
        <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="karyawan">Karyawan</SelectItem><SelectItem value="magang">Magang</SelectItem><SelectItem value="training">Training</SelectItem></SelectContent>
      </Select>

      <div className="relative flex-grow min-w-[200px]">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cari nama karyawan..." value={filters.searchTerm} onChange={handleSearchChange} className="pl-8" />
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="needs-action-toggle" checked={filters.needsActionOnly} onCheckedChange={toggleNeedsAction} />
        <Label htmlFor="needs-action-toggle">Butuh Aksi</Label>
      </div>
      
      <Button onClick={handleReset} variant="ghost" size="sm" className="text-muted-foreground"><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
    </div>
  );
}
