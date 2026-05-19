"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}

export function AppModal({
  open,
  onOpenChange,
  className,
  children,
}: AppModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-full max-w-4xl max-h-[85vh] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-0 text-slate-50 shadow-2xl",
          className,
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
