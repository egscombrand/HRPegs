from pathlib import Path
path = Path(r'd:\HRPEnvironesia\src\components\dashboard\approvals\ReviewOvertimeDialog.tsx')
text = path.read_text(encoding='utf-8')
old = '''          <ScrollArea className="flex-1 overflow-hidden">
            <div className="space-y-6 p-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-border bg-muted p-4">
                  <p className="text-xs uppercase text-muted-foreground">
                    Ringkasan Cepat
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tanggal</span>
                      <span>
                        {overtimeDate
                          ? format(overtimeDate, "eeee, dd MMM yyyy", {
                              locale: idLocale,
                            })
                          : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Jam</span>
                      <span>
                        {submission.startTime} - {submission.endTime}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Durasi</span>
                      <span>{submission.totalDurationMinutes} menit</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Lokasi</span>
                      <span>
                        {submission.workLocationLabel ||
                          submission.workLocation ||
                          submission.location ||
                          "-"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-muted p-4">
                  <p className="text-xs uppercase text-muted-foreground">
                    Profil Pengaju
                  </p>
                  <div className="mt-3 space-y-3 text-sm">
                    <InfoRow
                      label="Jabatan"
                      value={submission.workRole || submission.positionTitle}
                    />
                    <InfoRow label="Brand" value={submission.brandName} />
                    <InfoRow
                      label="Divisi"
                      value={submission.divisionName || submission.division}
                    />
                    <InfoRow
                      label="Tipe Karyawan"
                      value={
                        submission.employmentType ||
                        submission.employeeType ||
                        "-"
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Detail Pekerjaan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {tasks.length > 0 ? (
                        tasks.map((task, index) => (
                          <div
                            key={index}
                            className="rounded-3xl border border-border bg-background p-4"
                          >
                            <p className="font-medium">{task.description}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Estimasi: {task.estimatedMinutes} menit
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Tidak ada rincian tugas.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Total Estimasi
                      </p>
                      <p className="mt-2 font-semibold">
                        {tasks.reduce(
                          (sum, task) => sum + (task.estimatedMinutes || 0),
                          0,
                        )}{" "}
                        menit
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Alasan
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {submission.reason || "Tidak ada alasan tambahan."}
                      </p>
                    </div>

                    {submission.employeeNotes && (
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Catatan Karyawan
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {submission.employeeNotes}
                        </p>
                      </div>
                    )}

                    {submission.attachments?.length ? (
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Lampiran
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {submission.attachments.map((attachment, index) => (
                            <span
                              key={index}
                              className="rounded-full bg-muted px-3 py-1 text-xs"
                            >
                              {attachment}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Timeline Persetujuan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <OvertimeApprovalStatusBadge
                        status={resolvedStatus as any}
                        mode={mode}
                      />
                    </div>
                    <InfoRow
                      label="Diajukan"
                      value={format(submittedAt, "eeee, dd MMM yyyy HH:mm", {
                        locale: idLocale,
                      })}
                    />
                    {managerDecisionAt && (
                      <InfoRow
                        label="Keputusan Manager"
                        value={format(
                          managerDecisionAt,
                          "eeee, dd MMM yyyy HH:mm",
                          {
                            locale: idLocale,
                          },
                        )}
                      />
                    )}
                    {submission.managerNotes && (
                      <InfoRow
                        label="Catatan Manager"
                        value={submission.managerNotes}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Area Keputusan</CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form className="space-y-2">
                      <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Catatan Manager {canAct ? "(Wajib untuk Tolak/Revisi)" : ""}
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                rows={4}
                                placeholder={
                                  canAct
                                    ? "Berikan alasan atau catatan..."
                                    : "Tidak ada catatan."
                                }
                                {...field}
                                readOnly={!canAct}
                                className={
                                  !canAct ? "bg-muted cursor-not-allowed" : ""
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>

                  {isFinal && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Pengajuan Final</AlertTitle>
                      <AlertDescription>
                        Pengajuan ini telah selesai diproses dan tidak dapat
                        diubah lagi.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!isFinal && !canAct && (
                    <Alert variant="destructive">
                      <Info className="h-4 w-4" />
                      <AlertTitle>Bukan Giliran Anda</AlertTitle>
                      <AlertDescription>
                        Status saat ini adalah <strong>{resolvedStatus.replace(/_/g, " ")}</strong>.
                        Anda tidak memiliki wewenang untuk memproses pengajuan
                        pada tahap ini.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
'''
new = '''          <ScrollArea className="flex-1 overflow-hidden">
            <div className="space-y-6 p-6 pb-28">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                  <CardHeader className="px-5 py-4">
                    <CardTitle className="text-base">Ringkasan Cepat</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5 pb-5 pt-0">
                    <InfoRow
                      label="Tanggal"
                      value={
                        overtimeDate
                          ? format(overtimeDate, "eeee, dd MMM yyyy", {
                              locale: idLocale,
                            })
                          : "-"
                      }
                    />
                    <InfoRow
                      label="Jam"
                      value={`${submission.startTime} - ${submission.endTime}`}
                    />
                    <InfoRow
                      label="Durasi"
                      value={`${submission.totalDurationMinutes} menit`}
                    />
                    <InfoRow
                      label="Lokasi"
                      value={
                        submission.workLocationLabel ||
                        submission.workLocation ||
                        submission.location ||
                        "-"
                      }
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                  <CardHeader className="px-5 py-4">
                    <CardTitle className="text-base">Profil Pengaju</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5 pt-0 text-sm">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">
                        {submission.employeeName || submission.fullName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {submission.workRole || submission.positionTitle || "-"}
                      </p>
                    </div>
                    <Separator />
                    <InfoRow label="Brand" value={submission.brandName} />
                    <InfoRow
                      label="Divisi"
                      value={submission.divisionName || submission.division}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                <CardHeader className="px-5 py-4">
                  <CardTitle className="text-base">Detail Pekerjaan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 px-5 pb-5 pt-0">
                  {tasks.length > 0 ? (
                    <div className="space-y-3">
                      {tasks.map((task, index) => (
                        <div
                          key={index}
                          className="rounded-3xl border border-border bg-background p-4"
                        >
                          <p className="font-medium">{task.description}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Estimasi: {task.estimatedMinutes ?? "-"} menit
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Tidak ada rincian tugas.
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Total Estimasi
                      </p>
                      <p className="mt-2 font-semibold">
                        {tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0)} menit
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Alasan
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {submission.reason || "Tidak ada alasan tambahan."}
                      </p>
                    </div>
                  </div>

                  {submission.employeeNotes && (
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Catatan Karyawan
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {submission.employeeNotes}
                      </p>
                    </div>
                  )}

                  {submission.attachments?.length ? (
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Lampiran
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {submission.attachments.map((attachment, index) => (
                          <span
                            key={index}
                            className="rounded-full bg-muted px-3 py-1 text-xs"
                          >
                            {attachment}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                <CardHeader className="px-5 py-4">
                  <CardTitle className="text-base">Timeline Persetujuan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5 pt-0">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <OvertimeApprovalStatusBadge
                      status={resolvedStatus as any}
                      mode={mode}
                    />
                  </div>
                  <InfoRow
                    label="Diajukan"
                    value={format(submittedAt, "eeee, dd MMM yyyy HH:mm", {
                      locale: idLocale,
                    })}
                  />
                  {managerDecisionAt ? (
                    <InfoRow
                      label="Keputusan Manager"
                      value={format(
                        managerDecisionAt,
                        "eeee, dd MMM yyyy HH:mm",
                        {
                          locale: idLocale,
                        },
                      )}
                    />
                  ) : (
                    <InfoRow label="Keputusan Manager" value="Belum ada keputusan" />
                  )}
                  {submission.revisionRequestedAt && (
                    <InfoRow
                      label="Revisi Diminta"
                      value={format(
                        parseSafeDate(submission.revisionRequestedAt) || new Date(),
                        "eeee, dd MMM yyyy HH:mm",
                        { locale: idLocale },
                      )}
                    />
                  )}
                  {submission.rejectedAt && (
                    <InfoRow
                      label="Ditolak"
                      value={format(
                        parseSafeDate(submission.rejectedAt) || new Date(),
                        "eeee, dd MMM yyyy HH:mm",
                        { locale: idLocale },
                      )}
                    />
                  )}
                  {submission.managerNotes && (
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Catatan Manager
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {submission.managerNotes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border border-border bg-muted shadow-sm">
                <CardHeader className="px-5 py-4">
                  <CardTitle className="text-base">Area Keputusan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5 pt-0">
                  <Form {...form}>
                    <form className="space-y-2">
                      <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Catatan Manager {canAct ? "(Wajib untuk Tolak/Revisi)" : ""}
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                rows={4}
                                placeholder={
                                  canAct
                                    ? "Berikan alasan atau catatan..."
                                    : "Tidak ada catatan."
                                }
                                {...field}
                                readOnly={!canAct}
                                className={
                                  !canAct ? "bg-muted cursor-not-allowed" : ""
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>

                  {isFinal && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Pengajuan Final</AlertTitle>
                      <AlertDescription>
                        Pengajuan ini telah selesai diproses dan tidak dapat
                        diubah lagi.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!isFinal && !canAct && (
                    <Alert variant="destructive">
                      <Info className="h-4 w-4" />
                      <AlertTitle>Bukan Giliran Anda</AlertTitle>
                      <AlertDescription>
                        Status saat ini adalah <strong>{resolvedStatus.replace(/_/g, " ")}</strong>.
                        Anda tidak memiliki wewenang untuk memproses pengajuan
                        pada tahap ini.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
'''
if old not in text:
    raise SystemExit('Old content not found')
new_text = text.replace(old, new)
path.write_text(new_text, encoding='utf-8')
print('Modal review body updated.')
