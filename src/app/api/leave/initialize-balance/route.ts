import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { parseContractDurationMonths } from '@/lib/leave-utils';
import { differenceInCalendarDays } from 'date-fns';

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const db = admin.firestore();

    // 1. Check if balance already exists
    const balanceRef = db.collection('leave_balances').doc(uid);
    const balanceDoc = await balanceRef.get();

    if (balanceDoc.exists) {
      return NextResponse.json({ 
        message: 'Leave balance already initialized.', 
        balance: balanceDoc.data() 
      }, { status: 200 });
    }

    // 2. Fetch user profile & employee profile to determine eligibility
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'Profil user tidak ditemukan.' }, { status: 404 });
    }
    const userData = userDoc.data() || {};

    const profileDoc = await db.collection('employee_profiles').doc(uid).get();
    const profileData = profileDoc.exists ? (profileDoc.data() || {}) : {};

    // 3. Compute eligibility using leave-utils logic
    const hrdInfo = profileData.hrdEmploymentInfo || {};

    const employeeType = String(
      hrdInfo.employeeType ||
      hrdInfo.jenisKontrak ||
      hrdInfo.contractType ||
      hrdInfo.tipeKaryawan ||
      hrdInfo.employmentType ||
      userData.employmentType ||
      ""
    ).toLowerCase().trim();

    const stage = String(
      hrdInfo.employmentStatus ||
      hrdInfo.statusKerja ||
      hrdInfo.employmentStage ||
      userData.employmentStage ||
      ""
    ).toLowerCase().trim();

    const explicitAllowance = Number(
      hrdInfo.annualLeaveAllowance ||
      hrdInfo.hakCutiTahunan ||
      hrdInfo.leaveAllowance ||
      0
    );

    let isEligible = false;
    let allowance = 0;
    let reason = "";

    if (explicitAllowance > 0) {
      isEligible = true;
      allowance = explicitAllowance;
    } else if (employeeType.includes('magang') || employeeType.includes('intern')) {
      isEligible = false;
      reason = "Magang tidak mendapat cuti tahunan.";
    } else if (
      employeeType.includes('probation') || 
      employeeType.includes('training') || 
      stage.includes('probation') || 
      stage.includes('training')
    ) {
      isEligible = false;
      reason = "Probation/training tidak mendapat cuti tahunan.";
    } else if (employeeType.includes('tetap') || employeeType.includes('permanent')) {
      isEligible = true;
      allowance = 15;
    } else if (employeeType.includes('kontrak') || employeeType.includes('contract')) {
      const durasiRaw = hrdInfo.durasiKontrak || hrdInfo.contractDurationMonths || hrdInfo.contractDuration || "";
      let months = parseContractDurationMonths(durasiRaw);
      
      if (months === 0) {
        const start = hrdInfo.contractStartDate || hrdInfo.kontrakMulai;
        const end = hrdInfo.contractEndDate || hrdInfo.kontrakSelesai;
        if (start && end) {
          const startDate = start.toDate ? start.toDate() : new Date(start);
          const endDate = end.toDate ? end.toDate() : new Date(end);
          const diff = differenceInCalendarDays(endDate, startDate);
          months = Math.round(diff / 30);
        }
      }

      if (months >= 12) {
        isEligible = true;
        allowance = 12;
      } else {
        isEligible = false;
        reason = `Kontrak kurang dari 1 tahun (${months || 0} bulan) tidak mendapat cuti tahunan.`;
      }
    } else {
      isEligible = false;
      reason = "Status kepegawaian Anda belum memenuhi hak cuti tahunan.";
    }

    if (!isEligible) {
      return NextResponse.json({ 
        error: reason || 'Karyawan tidak memenuhi syarat cuti tahunan.',
        isEligible: false 
      }, { status: 400 });
    }

    // 4. Create leave balance & adjustment trail using batch
    const currentYear = new Date().getFullYear();
    const newBalance = {
      employeeId: uid,
      employeeName: userData.fullName || profileData.fullName || 'Nama Karyawan',
      employmentType: hrdInfo.employeeType || hrdInfo.tipeKaryawan || hrdInfo.jenisKontrak || hrdInfo.contractType || userData.employmentType || 'karyawan',
      contractDurationMonths: hrdInfo.durasiKontrak ? parseContractDurationMonths(hrdInfo.durasiKontrak) : 0,
      initialQuota: allowance,
      currentBalance: allowance,
      allocatedLeave: 0,
      pendingLeave: 0,
      
      // Exact compliance fields
      uid: uid,
      year: currentYear,
      annualAllowance: allowance,
      usedDays: 0,
      pendingDays: 0,
      remainingDays: allowance,
      isEligible: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const batch = db.batch();
    batch.set(balanceRef, newBalance);

    const adjRef = db.collection('leave_balance_adjustments').doc();
    batch.set(adjRef, {
      employeeId: uid,
      employeeName: newBalance.employeeName,
      previousBalance: 0,
      newBalance: allowance,
      adjustmentValue: allowance,
      reason: "Inisialisasi Kuota Cuti Tahunan Otomatis via API",
      adjustedBy: "system",
      adjustedByName: "Sistem Otomatis",
      createdAt: Timestamp.now()
    });

    await batch.commit();

    return NextResponse.json({ 
      message: 'Leave balance successfully initialized.', 
      balance: newBalance 
    }, { status: 201 });

  } catch (error: any) {
    console.error(`Failed to initialize leave balance:`, error);
    let message = error.message || 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
