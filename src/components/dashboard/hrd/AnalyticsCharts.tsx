'use client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartData, Kpi } from './HrdDashboardTypes';
import { Info } from 'lucide-react';

const chartConfig = {
  applicants: { label: 'Applicants', color: 'hsl(var(--chart-1))' },
  hadir: { label: 'Hadir', color: 'hsl(var(--chart-1))' },
  terlambat: { label: 'Terlambat', color: 'hsl(var(--chart-2))' },
  offsite: { label: 'Offsite', color: 'hsl(var(--chart-3))' },
};

export function AnalyticsCharts({ chartData }: { chartData: ChartData }) {

  const renderPlaceholder = (title: string, reason?: string) => (
     <Card>
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent>
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-center text-sm p-4">
                <Info className="h-5 w-5 mb-2" />
                <span>Data untuk chart ini belum tersedia.</span>
                {reason && <span className="text-xs mt-1">{reason}</span>}
            </div>
        </CardContent>
    </Card>
  )

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Tren 7 Hari</CardTitle>
          <CardDescription>Kehadiran, keterlambatan, dan kerja offsite selama 7 hari terakhir.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={chartData.trend}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis />
              <Tooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="hadir" stackId="1" stroke="var(--color-hadir)" fill="var(--color-hadir)" fillOpacity={0.4} />
              <Area type="monotone" dataKey="terlambat" stackId="1" stroke="var(--color-terlambat)" fill="var(--color-terlambat)" fillOpacity={0.4}/>
              <Area type="monotone" dataKey="offsite" stackId="1" stroke="var(--color-offsite)" fill="var(--color-offsite)" fillOpacity={0.4}/>
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribusi Status Kehadiran</CardTitle>
           <CardDescription>Perbandingan jumlah karyawan berdasarkan status kehadiran hari ini.</CardDescription>
        </CardHeader>
        <CardContent>
             <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                    <Pie data={chartData.statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {chartData.statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>
            </ChartContainer>
        </CardContent>
      </Card>
      
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Top 10 Keterlambatan (Minggu Ini)</CardTitle>
          <CardDescription>Karyawan dengan akumulasi keterlambatan terbanyak minggu ini.</CardDescription>
        </CardHeader>
        <CardContent>
            {chartData.topLate.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart data={chartData.topLate} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" dataKey="totalLateMinutes" name="Menit" unit=" mnt" />
                        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tickMargin={10} width={120} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="totalLateMinutes" fill="var(--color-terlambat)" radius={4} />
                    </BarChart>
                </ChartContainer>
            ) : renderPlaceholder('Top 10 Terlambat', 'Belum ada data keterlambatan minggu ini.')}
        </CardContent>
      </Card>

    </div>
  );
}
