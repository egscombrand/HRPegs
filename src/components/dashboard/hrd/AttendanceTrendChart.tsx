'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { AttendanceEvent } from '@/lib/types';
import { startOfDay, endOfDay, eachDayOfInterval, subDays, format } from 'date-fns';
import { Info } from 'lucide-react';

interface AttendanceTrendChartProps {
  events: AttendanceEvent[] | null;
  date: Date;
}

const getTimestamp = (event: any): any =>
  event.tsServer || event.timestamp || event.ts || event.createdAt;

export function AttendanceTrendChart({ events, date }: AttendanceTrendChartProps) {
  const chartData = useMemo(() => {
    if (!events || events.length === 0) return [];

    const trendDays = eachDayOfInterval({ start: subDays(date, 6), end: date });

    return trendDays.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const dayEvents = events.filter(e => {
        const eventDate = getTimestamp(e)?.toDate?.();
        return eventDate && eventDate >= dayStart && eventDate <= dayEnd;
      });

      // Count check-in events (hadir)
      const hadirSet = new Set(
        dayEvents
          .filter(e => e.type === 'tap_in' || e.type === 'IN')
          .map(e => e.uid || e.userId)
      );

      // Count late arrivals
      const terlambatCount = dayEvents.filter(e => e.flags?.includes('late')).length;

      return {
        date: format(day, 'dd/MM'),
        hadir: hadirSet.size,
        terlambat: terlambatCount,
      };
    });
  }, [events, date]);

  if (chartData.length === 0) {
    return (
      <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-slate-100">Tren 7 Hari Terakhir</CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">
            Tren kehadiran, keterlambatan, izin, dan cuti
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-center text-sm p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <Info className="h-5 w-5 mb-2" />
            <span>Belum ada data tren untuk ditampilkan.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-slate-800 dark:text-slate-100">Tren 7 Hari Terakhir</CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Tren kehadiran dan keterlambatan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-64 w-full">
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--foreground))" className="text-slate-500 dark:text-slate-400" />
              <YAxis stroke="hsl(var(--foreground))" className="text-slate-500 dark:text-slate-400" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="hadir" stroke="#14b8a6" strokeWidth={2} name="Hadir" />
              <Line type="monotone" dataKey="terlambat" stroke="#f97316" strokeWidth={2} name="Terlambat" />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
