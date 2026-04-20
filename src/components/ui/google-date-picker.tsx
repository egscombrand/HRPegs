"use client";

import * as React from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { id } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "./scroll-area";

type View = "day" | "month" | "year";

export type GoogleDatePickerProps = {
  value?: Date | null;
  date?: Date | null;
  onChange?: (date: Date | null) => void;
  onDateChange?: (date: Date | null) => void;
  placeholder?: string;
  mode?: "dob" | "general";
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  className?: string;
  portalled?: boolean;
};

export const GoogleDatePicker = React.forwardRef<
  HTMLButtonElement,
  GoogleDatePickerProps
>(
  (
    {
      value,
      date,
      onChange,
      onDateChange,
      placeholder = "Pilih tanggal",
      mode = "general",
      minYear: minYearProp,
      maxYear: maxYearProp,
      disabled,
      className,
      portalled = true,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [view, setView] = React.useState<View>("day");

    const selectedValue = value ?? date ?? null;
    const defaultCursorDate = React.useMemo(() => {
      if (selectedValue) return selectedValue;
      if (mode === "dob") {
        const date = new Date();
        date.setFullYear(date.getFullYear() - 25);
        return date;
      }
      return new Date();
    }, [selectedValue, mode]);

    const [cursorDate, setCursorDate] = React.useState(
      selectedValue || defaultCursorDate,
    );
    const yearRef = React.useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
      if (open) {
        setCursorDate(selectedValue || defaultCursorDate);
        setView("day");
      }
    }, [open, selectedValue, defaultCursorDate]);

    React.useEffect(() => {
      if (view === "year" && yearRef.current) {
        yearRef.current.scrollIntoView({ block: "center" });
      }
    }, [view]);

    const minYear =
      minYearProp || (mode === "dob" ? 1950 : new Date().getFullYear() - 100);
    const maxYear =
      maxYearProp ||
      (mode === "dob"
        ? new Date().getFullYear()
        : new Date().getFullYear() + 5);
    const changeDate = onChange ?? onDateChange;

    const handleSelectDate = (date: Date) => {
      changeDate?.(date);
      setOpen(false);
    };

    const handleClearDate = () => {
      changeDate?.(null);
      setOpen(false);
    };

    const handleToday = () => {
      const today = new Date();
      changeDate?.(today);
      setCursorDate(today);
      setOpen(false);
    };

    const firstDayOfMonth = startOfMonth(cursorDate);
    const lastDayOfMonth = endOfMonth(cursorDate);
    const firstDayOfGrid = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });
    const lastDayOfGrid = endOfWeek(lastDayOfMonth, { weekStartsOn: 1 });
    const days = eachDayOfInterval({
      start: firstDayOfGrid,
      end: lastDayOfGrid,
    });

    const years = Array.from(
      { length: maxYear - minYear + 1 },
      (_, i) => minYear + i,
    ).reverse();
    const months = Array.from({ length: 12 }, (_, i) =>
      format(new Date(0, i), "MMMM", { locale: id }),
    );

    const renderHeader = () => (
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="text-sm font-medium"
            onClick={() => setView("month")}
          >
            {format(cursorDate, "MMMM", { locale: id })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-sm font-medium"
            onClick={() => setView("year")}
          >
            {format(cursorDate, "yyyy")}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCursorDate(subMonths(cursorDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCursorDate(addMonths(cursorDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );

    const renderDayView = () => (
      <>
        {renderHeader()}
        <div className="grid grid-cols-7">
          {["M", "S", "S", "R", "K", "J", "S"].map((day, i) => (
            <div
              key={i}
              className="text-center text-xs font-medium text-muted-foreground p-2"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => (
            <div key={day.toISOString()} className="p-0.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleSelectDate(day)}
                className={cn(
                  "h-8 w-8 p-0 rounded-full font-normal",
                  !isSameMonth(day, cursorDate) && "text-muted-foreground/50",
                  isToday(day) && "ring-1 ring-primary/40",
                  value &&
                    isSameDay(day, value) &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </Button>
            </div>
          ))}
        </div>
      </>
    );

    const renderMonthView = () => (
      <>
        <div className="p-2 text-center text-sm font-medium">
          {format(cursorDate, "yyyy")}
        </div>
        <div className="grid grid-cols-3 gap-2 p-2">
          {months.map((month, i) => (
            <Button
              type="button"
              key={month}
              variant={i === cursorDate.getMonth() ? "default" : "ghost"}
              onClick={() => {
                const newDate = new Date(cursorDate);
                newDate.setMonth(i);
                setCursorDate(newDate);
                setView("day");
              }}
            >
              {month.substring(0, 3)}
            </Button>
          ))}
        </div>
      </>
    );

    const renderYearView = () => (
      <>
        <div className="p-2 text-center text-sm font-medium">Pilih Tahun</div>
        <ScrollArea className="h-60">
          <div className="grid grid-cols-4 gap-2 p-2">
            {years.map((year) => {
              const isSelectedYear = year === cursorDate.getFullYear();
              return (
                <Button
                  type="button"
                  key={year}
                  ref={isSelectedYear ? yearRef : null}
                  variant={isSelectedYear ? "default" : "ghost"}
                  onClick={() => {
                    const newDate = new Date(cursorDate);
                    newDate.setFullYear(year);
                    setCursorDate(newDate);
                    setView("month");
                  }}
                >
                  {year}
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      </>
    );

    return (
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            ref={ref}
            variant={"outline"}
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedValue && "text-muted-foreground",
              className,
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedValue ? (
              format(selectedValue, "PPP", { locale: id })
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto rounded-xl border bg-popover shadow-lg p-0"
          align="start"
          portalled={portalled}
        >
          <div className="p-3">
            {view === "day" && renderDayView()}
            {view === "month" && renderMonthView()}
            {view === "year" && renderYearView()}
          </div>
          <div className="flex justify-between items-center p-3 pt-0">
            <Button
              type="button"
              variant="ghost"
              onClick={handleToday}
              disabled={mode === "dob"}
            >
              Hari ini
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearDate}
              className="text-destructive"
            >
              Hapus
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
GoogleDatePicker.displayName = "GoogleDatePicker";
