'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { JobApplication } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { MoreHorizontal, Eye } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import Link from 'next/link';
import { getApplicationDisplayStage } from '@/lib/recruitment/application-stage';

export function CandidatesTable({ applications }: { applications: JobApplication[] }) {
    return (
        <div className="rounded-lg border">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {applications.length > 0 ? applications.map(app => (
                    <TableRow key={app.id}>
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={`https://i.pravatar.cc/150?u=${app.candidateUid}`} />
                                    <AvatarFallback>{getInitials(app.candidateName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium">{app.candidateName}</p>
                                    <p className="text-xs text-muted-foreground">{app.candidateEmail}</p>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="text-sm">{app.jobPosition}</TableCell>
                        <TableCell><ApplicationStatusBadge status={getApplicationDisplayStage(app).displayStage} /></TableCell>
                        <TableCell>{app.updatedAt?.toDate ? format(app.updatedAt.toDate(), 'dd MMM yyyy') : '-'}</TableCell>
                        <TableCell className="text-right">
                             <Button asChild variant="outline" size="sm">
                                <Link href={`/admin/recruitment/applications/${app.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View
                                </Link>
                             </Button>
                        </TableCell>
                    </TableRow>
                )) : (
                     <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                            No applications found for the selected filters.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
        </div>
    );
}
