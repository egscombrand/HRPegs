from pathlib import Path

path = Path('src/components/dashboard/approvals/PermissionApprovalClient.tsx')
text = path.read_text(encoding='utf-8')
start_marker = '<CardContent>'
end_marker = '</CardContent>'
start = text.find(start_marker)
if start == -1:
    raise ValueError('start marker not found')
end = text.find(end_marker, start)
if end == -1:
    raise ValueError('end marker not found')
end += len(end_marker)
old_block = text[start:end]
new_block = '''        <CardContent className="space-y-6">
          {mode === "hrd" ? (
            <div className="space-y-6">
              {renderHrdSection(
                "Butuh Validasi HRD",
                "Pengajuan izin yang sudah disetujui manager dan menunggu langkah HRD.",
                hrdPendingValidation,
                "Tidak ada pengajuan yang perlu divalidasi HRD saat ini.",
                "bg-teal-50/80 border-teal-200 dark:bg-teal-950/10",
                "Validasi",
              )}
              {renderHrdSection(
                "Sedang Proses di Manager",
                "Pengajuan yang masih menunggu persetujuan manager sebelum HRD dapat memvalidasi.",
                hrdPendingManagerSubmissions,
                "Tidak ada pengajuan yang saat ini menunggu manager.",
                "bg-amber-50/80 border-amber-200 dark:bg-amber-950/10",
                "Lihat Detail",
              )}
              {renderHrdSection(
                "Perlu Revisi",
                "Pengajuan yang diminta revisi oleh manager atau HRD.",
                hrdNeedRevision,
                "Tidak ada pengajuan yang diminta revisi saat ini.",
                "bg-orange-50/80 border-orange-200 dark:bg-orange-950/10",
                "Lihat Detail",
              )}
              {renderHrdSection(
                "Riwayat Selesai",
                "Pengajuan izin yang sudah ditutup: disetujui, terverifikasi, ditolak, atau dibatalkan.",
                hrdFinishedSubmissions,
                "Belum ada riwayat selesai untuk periode saat ini.",
                "bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/10",
                "Lihat Detail",
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[175px]">Pengaju</TableHead>
                    <TableHead className="w-[190px]">Izin</TableHead>
                    <TableHead className="w-[140px]">Periode</TableHead>
                    {mode === "hrd" && (
                      <TableHead className="w-[140px]">Brand / Divisi</TableHead>
                    )}
                    <TableHead className="w-[165px]">Keterangan</TableHead>
                    <TableHead className="w-[90px]">Lampiran</TableHead>
                    {mode === "hrd" && (
                      <TableHead className="w-[130px]">Tahap</TableHead>
                    )}
                    <TableHead className="w-[185px]">Status</TableHead>
                    <TableHead className="w-[155px]">Menunggu</TableHead>
                    <TableHead className="w-[100px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={colSpan}
                        className="h-28 text-center text-muted-foreground"
                      >
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : filteredSubmissions.length > 0 ? (
                    filteredSubmissions.map((s) => {
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
                      const needsMyAction =
                        mode === "manager" && isActionNeeded(s, uid);

                      const isHrdActionable =
                        isHrdValidationPhase(s) && !isFinalStatus(s.status);

                      let rowClass = "hover:bg-muted/40";
                      if (mode === "hrd") {
                        if (isHrdActionable) {
                          rowClass =
                            "bg-teal-50/20 hover:bg-teal-50/30 border-l-2 border-l-teal-500 dark:bg-teal-950/10 dark:hover:bg-teal-950/15";
                        } else if (s.status === "pending_manager") {
                          rowClass =
                            "bg-amber-50/10 hover:bg-amber-50/20 border-l-2 border-l-amber-400 dark:bg-amber-950/5 dark:hover:bg-amber-950/10";
                        } else if (
                          s.status === "approved" ||
                          s.status === "closed"
                        ) {
                          rowClass =
                            "bg-emerald-50/10 hover:bg-emerald-50/20 dark:bg-emerald-950/5 dark:hover:bg-emerald-950/10";
                        } else if (
                          s.status === "rejected_manager" ||
                          s.status === "rejected_hrd"
                        ) {
                          rowClass =
                            "bg-rose-50/10 hover:bg-rose-50/20 dark:bg-rose-950/5 dark:hover:bg-rose-950/10";
                        } else if (
                          s.status === "revision_manager" ||
                          s.status === "revision_hrd"
                        ) {
                          rowClass =
                            "bg-orange-50/10 hover:bg-orange-50/20 dark:bg-orange-950/5 dark:hover:bg-orange-950/10";
                        }
                      } else {
                        if (needsMyAction) {
                          rowClass =
                            "border-l-2 border-l-amber-400 bg-amber-50/25 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/15";
                        }
                      }

                      return (
                        <TableRow
                          key={s.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            rowClass,
                          )}
                          onClick={() => setSelectedSubmission(s)}
                        >
                          {/* Pengaju */}
                          <TableCell>
                            <p className="font-medium text-sm leading-snug">
                              {s.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {(() => {
                                const subtitle = getApplicantSubtitle(s);
                                return subtitle || "Data jabatan belum diatur";
                              })()}
                            </p>
                            {isOfficeExit && s.needsManagerAttention && (
                              <Badge
                                variant="outline"
                                className="mt-1 px-1 py-0 h-4 text-[9px] bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40"
                              >
                                Deviasi Durasi
                              </Badge>
                            )}
                          </TableCell>

                          {/* Izin */}
                          <TableCell>
                            <p className="text-sm font-medium leading-snug">
                              {formLabel}
                            </p>
                            {reasonLabel && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {reasonLabel}
                              </p>
                            )}
                            {s.otherTitle && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[160px]">
                                {s.otherTitle}
                              </p>
                            )}
                          </TableCell>

                          {/* Periode */}
                          <TableCell>
                            <div className="text-sm leading-snug">
                              {startDt && endDt ? (
                                isOfficeExit ? (
                                  <>
                                    <p>
                                      {format(startDt, "dd MMM yyyy", {
                                        locale: idLocale,
                                      })}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {format(startDt, "HH:mm")} —{" "}
                                      {format(endDt, "HH:mm")}
                                    </p>
                                  </>
                                ) : sameDay ? (
                                  <p>
                                    {format(startDt, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })}
                                  </p>
                                ) : (
                                  <p>
                                    {format(startDt, "dd MMM", {
                                      locale: idLocale,
                                    })} {" "}
                                    — {" "}
                                    {format(endDt, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })}
                                  </p>
                                )
                              ) : (
                                <p className="text-muted-foreground">—</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDuration(s)}
                              </p>
                            </div>
                          </TableCell>

                          {/* Brand / Divisi (HRD only) */}
                          {mode === "hrd" && (
                            <TableCell>
                              <p className="text-sm font-medium text-foreground">
                                {s._resolvedApplicantBrand || s.brandName || "—"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {s._resolvedApplicantDivision || s.division || "—"}
                              </p>
                            </TableCell>
                          )}

                          {/* Keterangan */}
                          <TableCell>
                            <p className="text-sm text-foreground/75 line-clamp-2 leading-relaxed">
                              {reasonText || (
                                <span className="text-muted-foreground text-xs italic">
                                  Tidak ada keterangan.
                                </span>
                              )}
                            </p>
                            {s.createdAt && resolveDate(s.createdAt) && (
                              <p className="text-[10px] text-muted-foreground/55 mt-0.5">
                                {formatDistanceToNow(resolveDate(s.createdAt)!, {
                                  addSuffix: true,
                                  locale: idLocale,
                                })}
                              </p>
                            )}
                          </TableCell>

                          {/* Lampiran */}
                          <TableCell>
                            {hasAttachment ? (
                              <div className="flex flex-col gap-1">
                                <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1 w-fit">
                                  <Paperclip className="h-2.5 w-2.5" /> Ada
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">
                                —
                              </span>
                            )}
                          </TableCell>

                          {/* Tahap (HRD only) */}
                          {mode === "hrd" && (
                            <TableCell>
                              {(() => {
                                const tahap = getTahapLabel(s);
                                let tahapClass = "bg-slate-100 text-slate-700";
                                if (tahap === "Menunggu Manager") {
                                  tahapClass = "bg-amber-100 text-amber-700";
                                } else if (tahap === "Butuh Validasi HRD") {
                                  tahapClass = "bg-teal-100 text-teal-700";
                                } else if (tahap === "Selesai") {
                                  tahapClass = "bg-emerald-100 text-emerald-700";
                                } else if (tahap === "Ditolak") {
                                  tahapClass = "bg-rose-100 text-rose-700";
                                } else if (tahap === "Perlu Revisi") {
                                  tahapClass = "bg-orange-100 text-orange-700";
                                }
                                return (
                                  <Badge
                                    className={cn(
                                      "border-transparent font-medium text-[10px] px-2 py-0.5",
                                      tahapClass,
                                    )}
                                  >
                                    {tahap}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                          )}

                          {/* Status */}
                          <TableCell>
                            {(() => {
                              const label = getHumanStatusLabel(s);
                              let statusClass = "bg-slate-100 text-slate-800";
                              if (s.status === "pending_manager") {
                                statusClass =
                                  "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/30";
                              } else if (
                                isHrdValidationPhase(s) &&
                                !isFinalStatus(s.status)
                              ) {
                                statusClass =
                                  "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/30";
                              } else if (
                                s.status === "approved" ||
                                s.status === "closed"
                              ) {
                                statusClass =
                                  "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/30";
                              } else if (
                                s.status === "rejected_manager" ||
                                s.status === "rejected_hrd"
                              ) {
                                statusClass =
                                  "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/30";
                              } else if (
                                s.status === "revision_manager" ||
                                s.status === "revision_hrd"
                              ) {
                                statusClass =
                                  "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/30";
                              }
                              return (
                                <Badge
                                  className={cn(
                                    "border-transparent font-medium text-xs",
                                    statusClass,
                                  )}
                                >
                                  {label}
                                </Badge>
                              );
                            })()}
                            {mode === "manager" &&
                              isApprovedByMe(s, uid) &&
                              (s.status === "approved_by_manager" ||
                                s.status === "pending_hrd") && (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                  Sudah Anda setujui
                                </p>
                              )}
                          </TableCell>

                          {/* Menunggu */}
                          <TableCell>
                            {(() => {
                              if (isFinalStatus(s.status)) {
                                return (
                                  <span className="text-xs text-muted-foreground">
                                    Selesai
                                  </span>
                                );
                              }
                              if (isHrdValidationPhase(s)) {
                                return (
                                  <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                                    HRD
                                  </span>
                                );
                              }
                              return (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                  {s.waitingForName || s.managerName || "Manager"}
                                </span>
                              );
                            })()}
                          </TableCell>

                          {/* Aksi */}
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              let btnText = "Lihat Detail";
                              let btnVariant: "default" | "outline" | "ghost" =
                                "outline";
                              let btnClass = "";

                              if (mode === "hrd") {
                                if (isHrdActionable) {
                                  btnText = "Validasi";
                                  btnVariant = "default";
                                  btnClass =
                                    "bg-teal-600 hover:bg-teal-700 text-white border-0 shadow-sm";
                                } else {
                                  btnText = "Lihat Detail";
                                  btnVariant = "outline";
                                }
                              } else {
                                if (needsMyAction) {
                                  btnText = "Review";
                                  btnVariant = "default";
                                  btnClass =
                                    "bg-amber-500 hover:bg-amber-600 text-white border-0";
                                } else {
                                  btnText = "Lihat Detail";
                                  btnVariant = "outline";
                                }
                              }

                              return (
                                <Button
                                  variant={btnVariant}
                                  size="sm"
                                  className={cn("h-8 text-sm", btnClass)}
                                  onClick={() => setSelectedSubmission(s)}
                                >
                                  {btnText}
                                </Button>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="h-36 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-25" />
                          <p className="text-sm font-medium">
                            {mode === "manager" && activeTab === "action_needed"
                              ? "Tidak ada pengajuan yang perlu Anda tindaklanjuti."
                              : hasActiveFilters
                                ? "Tidak ada pengajuan yang sesuai filter."
                                : "Belum ada data pengajuan izin."}
                          </p>
                          {hasActiveFilters && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={clearFilters}
                              className="text-xs h-auto p-0"
                            >
                              Bersihkan filter
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
'''

path.write_text(text[:start] + new_block + text[end:], encoding='utf-8')
print('replaced CardContent with HRD sections')
