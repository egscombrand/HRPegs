# Rombak Monitoring Absensi HRP - Implementation Plan

## Phase 1: Data Sync dengan Web Absen ✅ (CURRENT)

### Objectives:
- Monitoring Absensi HRP harus membaca data langsung dari `attendance_events` collection (yang diisi oleh Web Absen)
- Data dari Web Absen muncul real-time di HRP tanpa delay
- Resolusi UID dan event type yang robust

### Deliverables:
1. **Helper functions** (`src/lib/attendance-helpers.ts`) ✅
   - `resolveProfileUid()` - resolve UID dari employee_profiles
   - `resolveEventUid()` - resolve UID dari attendance_events
   - `isCheckInEvent()` - detect Kehadiran Masuk
   - `isCheckOutEvent()` - detect Kehadiran Pulang
   - `resolvePhotoUrl()` - extract photo URL dari evidence
   - `resolveAddress()` - extract alamat lengkap
   - `determineStatus()` - hitung status dari check in/out
   - Utility functions: `formatTime()`, `calculateLateMinutes()`, etc.

2. **Update AttendanceMonitoringClient.tsx**
   - Import dan gunakan helper functions
   - Change data source dari hanya `users` ke `employee_profiles` + `attendance_events`
   - For each employee (web_absen):
     - Find events dari attendance_events dengan matching uid
     - Find check-in event
     - Find check-out event
     - Build record dengan data dari attendance_events
   - Implement proper UID resolution & event type detection
   - Add debug logging untuk troubleshoot

### Test Case (CRITICAL):
```
Scenario: Lutfi Imam melakukan Kehadiran Masuk di Web Absen
- Time: 14:50:39
- Status Web Absen: "Sedang Bekerja"
- Photo: tersimpan di Google Drive

Expected HRP Monitoring Absensi:
- Nama: Lutfi Imam
- Tap In: 14:50:39
- Tap Out: -
- Status: Sedang Bekerja
- Metode: Web Absen
- Lokasi: [alamat dari Web Absen]
- Foto: [button lihat bukti]
```

---

## Phase 2: UI Improvements & Modal (NEXT)

### Deliverables:
1. **New Modal Component** (`src/components/dashboard/AttendanceDetailModal.tsx`)
   - Tampilkan detail lengkap dari attendance event
   - Include: nama, ID, brand/divisi, jam, alamat, foto, device, location
   - Link ke Google Drive untuk foto

2. **Rombak AttendanceMonitoringClient UI**
   - Better table layout dengan kolom informatif
   - Foto dari evidence (bukan just avatar)
   - Address display dengan truncate
   - Status badges dengan color-coding
   - Action buttons: Detail, View Photo, Delete

3. **Improve KPI Cards**
   - Total Web Absen Karyawan
   - Hadir (check-in done)
   - Sedang Bekerja (check-in done, no check-out)
   - Sudah Pulang (check-in + check-out)
   - Terlambat
   - Pulang Awal

---

## Technical Details:

### UID Resolution:
```
Profile UID priority:
1. profile.uid
2. profile.userId
3. profile.authUid
4. profile.employeeUid
5. doc.id (if doc id is uid)

Event UID priority:
1. event.employeeUid
2. event.userId
3. event.uid
4. event.ownerUid
5. event.createdBy
6. event.employee?.uid
```

### Event Type Detection:
```
Check-In Types:
- tap_in, check_in, kehadiran_masuk, masuk, in

Check-Out Types:
- tap_out, check_out, kehadiran_pulang, pulang, out
```

### Photo URL Resolution:
```
Priority:
1. event.evidence.driveViewUrl
2. event.evidence.driveDownloadUrl
3. event.evidence.selfieUrl
4. event.photoUrl
5. event.selfieUrl
6. null (show avatar)
```

### Address Resolution:
```
Priority:
1. event.address || event.fullAddress
2. event.location.address || event.location.fullAddress
3. event.addressDetail.fullAddress
4. Concatenate: road + village + city + state
5. Coordinates if address empty
6. "-" as fallback
```

---

## Status:

- [x] Phase 1.1: Create helper functions
- [ ] Phase 1.2: Update AttendanceMonitoringClient data processing
- [ ] Phase 1.3: Test with Web Absen data
- [ ] Phase 2: UI improvements & modal
- [ ] Phase 3: Polish & edge cases

---

## Critical Notes:

✅ DO NOT CHANGE:
- Web Absen flow
- attendance_events structure
- Google Drive upload
- Firestore rules
- Auth system

❌ DO CHANGE:
- How Monitoring Absensi reads data
- How it displays Web Absen data
- UI layout for better UX
