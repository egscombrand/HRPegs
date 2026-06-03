from pathlib import Path

path = Path('src/components/dashboard/approvals/PermissionApprovalClient.tsx')
text = path.read_text(encoding='utf-8')
needle = '    setWaitingForFilter("");\n  };\n\n  // ─── Manager tab definitions ──────────────────────────────────────────────────────────────\n'
print('have text length', len(text))
print('needle found', needle in text)
if needle not in text:
    idx = text.find('setWaitingForFilter')
    print('idx', idx)
    print(text[idx:idx+200])
else:
    insert = '''    setWaitingForFilter("");
  };

  const renderHrdSection = (
    title: string,
    description: string,
    items: PermissionRequest[],
    emptyMessage: string,
    highlightClass: string,
    buttonLabel: string,
  ) => (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-background shadow-sm">
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between p-4 border-b",
          highlightClass,
        )}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-foreground">{items.length}</p>
          <p className="text-sm text-muted-foreground">Pengajuan</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 opacity-30" />
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Pengaju</TableHead>
                <TableHead className="w-[190px]">Izin</TableHead>
                <TableHead className="w-[130px]">Periode</TableHead>
                <TableHead className="w-[150px]">Brand / Divisi</TableHead>
                <TableHead className="w-[170px]">Keterangan</TableHead>
                <TableHead className="w-[90px]">Lampiran</TableHead>
                <TableHead className="w-[210px]">Status / Menunggu</TableHead>
                <TableHead className="w-[100px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const formType = s.formType || s.type;
                const formLabel = getFormLabel(s);
                const reasonLabel = getReasonLabel(s);
                const reasonText = s.reason || s.detailedReason || "";
                const attachments = (s.attachments || []).filter(Boolean);
                const hasAttachment = attachments.length > 0;
                const startDt = resolveDate(s.startDate);
                const endDt = resolveDate(s.endDate);
                const isOfficeExit = formType === "keluar_kantor";
                const sameDay =
                  startDt &&
                  endDt &&
                  differenceInCalendarDays(endDt, startDt) === 0;
                const statusLabel = getHumanStatusLabel(s);
                const isValidation = isHrdValidationPhase(s) and not isFinalStatus(s.status);
                const waitingLabel = s.status == "pending_manager" ? `Menunggu persetujuan ${s.waitingForName or s.managerName or 'Manager'}` : 'Menunggu'
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    onClick={() => setSelectedSubmission(s)}
                  >
                    <TableCell>
                      <p className="font-medium text-sm leading-snug">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{getApplicantSubtitle(s) or 'Data jabatan belum diatur'}</p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
'''
    text = text.replace(needle, needle + insert)
    path.write_text(text, encoding='utf-8')
    print('wrote helper')
