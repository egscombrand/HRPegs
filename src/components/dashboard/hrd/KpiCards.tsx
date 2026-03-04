'use client';

import { KpiCard } from '@/components/recruitment/KpiCard';
import type { Kpi } from './HrdDashboardTypes';

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
    return (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {kpis.map(kpi => (
                <KpiCard 
                    key={kpi.title} 
                    title={kpi.title} 
                    value={kpi.value} 
                    delta={kpi.delta} 
                    deltaType={kpi.deltaType} 
                    description={kpi.description}
                />
            ))}
        </div>
    );
}
