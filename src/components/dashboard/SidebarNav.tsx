'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { ChevronDown } from 'lucide-react';
import type { MenuGroup } from '@/lib/menu-config';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SidebarNavProps {
  menuConfig: MenuGroup[];
}

const CollapsibleSidebarGroup = ({ group, pathname, groupIndex }: { group: MenuGroup, pathname: string, groupIndex: number }) => {
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

    // Load persist expanded state from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('sidebar_expanded_groups');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setExpandedGroups(new Set(parsed));
            } catch (e) {
                // Auto-expand groups that have active items
                const shouldExpand = group.items.some(item => {
                    const rootDashboardHrefs = ['/admin', '/admin/hrd', '/admin/manager', '/admin/karyawan'];
                    return rootDashboardHrefs.includes(item.href)
                        ? pathname === item.href
                        : pathname.startsWith(item.href);
                });
                if (shouldExpand) {
                    setExpandedGroups(new Set([groupIndex]));
                } else {
                    setExpandedGroups(new Set());
                }
            }
        } else {
            // Auto-expand groups that have active items
            const shouldExpand = group.items.some(item => {
                const rootDashboardHrefs = ['/admin', '/admin/hrd', '/admin/manager', '/admin/karyawan'];
                return rootDashboardHrefs.includes(item.href)
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
            });
            if (shouldExpand) {
                setExpandedGroups(new Set([groupIndex]));
            }
        }
    }, []);

    const toggleExpand = (index: number) => {
        const newSet = new Set(expandedGroups);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setExpandedGroups(newSet);
        localStorage.setItem('sidebar_expanded_groups', JSON.stringify(Array.from(newSet)));
    };

    const rootDashboardHrefs = ['/admin', '/admin/hrd', '/admin/manager', '/admin/karyawan'];
    const isOpen = expandedGroups.has(groupIndex);

    // If a group has no title, render its items directly without a collapsible trigger.
    if (!group.title) {
        return (
            <SidebarMenu>
                {group.items.map(item => (
                    <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                            asChild
                            tooltip={item.label}
                            isActive={rootDashboardHrefs.includes(item.href) ? pathname === item.href : pathname.startsWith(item.href)}
                            className="justify-start"
                        >
                            <Link href={item.href}>
                                {item.icon}
                                <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                                {item.badge && <span className="ml-auto group-data-[state=collapsed]:hidden">{item.badge}</span>}
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        )
    }

    return (
        <div className="group/menu-group">
            <button
                onClick={() => toggleExpand(groupIndex)}
                disabled={isCollapsed}
                className={cn(
                    "flex w-full items-center justify-between h-10 px-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest",
                    "hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-150",
                    "disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-600",
                    "group-data-[state=collapsed]:justify-center group-data-[state=collapsed]:px-0"
                )}
                title={isCollapsed ? group.title : undefined}
            >
                <span className="group-data-[state=collapsed]:hidden">{group.title}</span>
                <div className={cn(
                    "h-5 w-5 group-data-[state=collapsed]:hidden transition-transform duration-200 flex items-center justify-center",
                    isOpen && "rotate-180"
                )}>
                  <ChevronDown className="h-4 w-4"/>
                </div>
                {/* Horizontal line for collapsed view */}
                <div className="w-3 h-px bg-slate-300 dark:bg-slate-700 group-data-[state=expanded]:hidden" />
            </button>

            {isOpen && !isCollapsed && (
                <SidebarMenu className="mt-1 mb-2">
                    {group.items.map(item => {
                        const isActive = rootDashboardHrefs.includes(item.href)
                            ? pathname === item.href
                            : pathname.startsWith(item.href);

                        return (
                            <SidebarMenuItem key={item.label}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={item.label}
                                    isActive={isActive}
                                    className={cn(
                                        "justify-start ml-0",
                                        isActive && "bg-teal-500 dark:bg-teal-600 text-white dark:text-white hover:bg-teal-600 dark:hover:bg-teal-700"
                                    )}
                                >
                                    <Link href={item.href}>
                                        {item.icon}
                                        <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                                        {item.badge && <span className="ml-auto group-data-[state=collapsed]:hidden">{item.badge}</span>}
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            )}
        </div>
    )
}

export function SidebarNav({ menuConfig }: SidebarNavProps) {
    const pathname = usePathname();
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';

    return (
        <Sidebar collapsible="icon" className="border-r border-slate-200 dark:border-slate-800">
            <SidebarHeader className="border-b border-slate-200 dark:border-slate-800 pt-4 pb-4">
                 <Link href="/admin" className="flex items-center gap-3.5 px-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm flex-shrink-0">
                        <span className="font-bold text-white text-lg">E</span>
                    </div>
                     <div className={cn(
                        "leading-tight transition-all duration-200",
                        isCollapsed && "hidden"
                    )}>
                        <div className="font-bold text-slate-900 dark:text-white text-base">Environesia</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">Human Capital Portal</div>
                    </div>
                </Link>
            </SidebarHeader>
            <SidebarContent className="px-2 py-4">
                 {menuConfig.map((group, groupIndex) => (
                    <CollapsibleSidebarGroup key={group.title || groupIndex} group={group} pathname={pathname} groupIndex={groupIndex} />
                ))}
            </SidebarContent>
            <SidebarFooter className="border-t border-slate-200 dark:border-slate-800 py-3 px-2">
                <div className={cn(
                    "text-[10px] text-slate-500 dark:text-slate-500 text-center transition-all duration-200",
                    isCollapsed && "hidden"
                )}>
                    © Environesia<br />
                    <span className="text-slate-400 dark:text-slate-600">Human Capital Portal v1.0</span>
                </div>
                {isCollapsed && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-500 text-center">
                        E
                    </div>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
