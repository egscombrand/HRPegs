'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
    title: string;
    value: string | number;
    delta?: string;
    deltaType?: 'default' | 'inverse';
    description?: string;
}

export function KpiCard({ title, value, delta, deltaType = 'default', description }: KpiCardProps) {
    const isIncrease = delta ? delta.startsWith('+') : false;
    const isDecrease = delta ? delta.startsWith('-') : false;
    
    const isGood = (deltaType === 'default' && isIncrease) || (deltaType === 'inverse' && isDecrease);
    const isBad = (deltaType === 'default' && isDecrease) || (deltaType === 'inverse' && isIncrease);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {/* Optional icon here */}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                    {delta && (
                        <p className={cn(
                            "flex items-center gap-1",
                            isGood && "text-green-600",
                            isBad && "text-red-600"
                        )}>
                            {isIncrease && <ArrowUp className="h-4 w-4" />}
                            {isDecrease && <ArrowDown className="h-4 w-4" />}
                            {delta}
                        </p>
                    )}
                    {description && <p className="ml-1">{description}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
