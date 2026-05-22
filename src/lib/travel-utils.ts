import { Timestamp, writeBatch, doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { BusinessTripMission, BusinessTripMissionMember } from '@/components/dashboard/dinas/types';
import { normalizeEmployeeRow } from '@/lib/employee-row-normalizer';
import { UserProfile } from '@/providers/auth-provider';
import { Firestore } from 'firebase/firestore';

/**
 * Determine the approver for a staff member.
 * Returns the UID, name, and approval level.
 * - Regular staff: approver = their division manager.
 * - Division manager (isDivisionManager === true): approver = the director (top-level manager).
 *   The director is assumed to be the `managerUid` of the division manager.
 */
export async function determineApprovalTarget(
  staff: NormalizedStaff,
  directorUid: string,
  directorName: string,
): Promise<{ approverUid: string; approverName: string; level: 'division_manager' | 'director' }> {
  if (staff.isDivisionManager) {
    // Manager is also traveling, cannot approve self → promote to director.
    return { approverUid: directorUid, approverName: directorName, level: 'director' };
  }
  // Regular staff, approve by their division manager.
  return { approverUid: staff.managerUid, approverName: staff.managerName, level: 'division_manager' };
}

/**
 * Group selected staff members by their approver.
 * Returns a map where key is approverUid and value contains member UIDs and names.
 */
export function groupMembersByApprover(
  members: BusinessTripMissionMember[],
): Map<string, { memberUids: string[]; memberNames: string[]; approverName: string; level: 'division_manager' | 'director' }> {
  const map = new Map();
  for (const m of members) {
    const key = m.approvalTargetUid!;
    const entry = map.get(key) ?? { memberUids: [], memberNames: [], approverName: m.approvalTargetName!, level: m.approvalLevel! };
    entry.memberUids.push(m.employeeUid);
    entry.memberNames.push(m.employeeName);
    map.set(key, entry);
  }
  return map;
}

/**
 * Create a travel mission along with member documents and approval_requests sub‑collection.
 * This function consolidates the creation logic for both ManagementDinasClient and BusinessTripClient.
 */
export async function createTravelMission(params: {
  firestore: Firestore;
  missionForm: any; // shape matches UI state but without finance fields
  selectedStaffUids: string[];
  userProfile: UserProfile;
  directorUid: string; // usually the creating user's UID (director/management)
  directorName: string;
}): Promise<{ missionId: string }> {
  const { firestore, missionForm, selectedStaffUids, userProfile, directorUid, directorName } = params;
  const batch = writeBatch(firestore);

  const missionRef = doc(collection(firestore, 'business_trip_missions'));
  const missionId = missionRef.id;

  const missionData: BusinessTripMission = {
    id: missionId,
    missionName: missionForm.missionName,
    assignmentNumber: missionForm.assignmentNumber,
    projectName: missionForm.projectName,
    clientName: missionForm.clientName,
    tripType: missionForm.tripType,
    tripTypeOther: missionForm.tripTypeOther,
    destinationProvince: missionForm.destinationProvince,
    destinationRegency: missionForm.destinationRegency,
    destinationAddress: missionForm.destinationAddress,
    destinationGoogleMaps: missionForm.destinationGoogleMaps,
    startDate: missionForm.startDate,
    endDate: missionForm.endDate,
    durationDays: missionForm.durationDays,
    instructionNote: missionForm.instructionNote,
    instructionHtml: missionForm.instructionHtml,
    assignedByUid: userProfile.uid,
    assignedByName: userProfile.displayName,
    // visibility and status are derived later
    status: 'draft_mission',
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  } as BusinessTripMission;

  batch.set(missionRef, missionData);

  // Fetch employee profiles for selected staff
  const staffDocs = await Promise.all(
    selectedStaffUids.map(async (uid) => {
      const snap = await getDoc(doc(collection(firestore, 'employee_profiles'), uid));
      return { uid, data: snap.exists() ? snap.data() : null } as const;
    }),
  );

  const memberDocs: BusinessTripMissionMember[] = [];
  for (const { uid, data } of staffDocs) {
    const normalized = normalizeEmployeeRow(data);
    const { approverUid, approverName, level } = await determineApprovalTarget(normalized, directorUid, directorName);
    const member: BusinessTripMissionMember = {
      missionId,
      missionName: missionForm.missionName,
      employeeUid: uid,
      employeeName: normalized.fullName,
      brandId: normalized.brandId,
      brandName: normalized.brandName,
      divisionId: normalized.divisionId,
      divisionName: normalized.divisionName,
      managerUid: normalized.managerUid,
      managerName: normalized.managerName,
      directSupervisorUid: normalized.managerUid,
      directSupervisorName: normalized.managerName,
      approvalTargetUid: approverUid,
      approvalTargetName: approverName,
      approvalLevel: level,
      requiresApproval: true,
      approvalStatus: 'pending',
      memberStatus: 'waiting_manager_validation',
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    } as BusinessTripMissionMember;
    memberDocs.push(member);
    const memberRef = doc(collection(missionRef, 'members'));
    batch.set(memberRef, member);
  }

  // Build approval_requests sub‑collection (one doc per distinct approver)
  const approvalsMap = new Map<string, { approverName: string; level: 'division_manager' | 'director'; memberUids: string[]; memberNames: string[] }>();
  for (const m of memberDocs) {
    const key = m.approvalTargetUid!;
    const entry = approvalsMap.get(key) ?? { approverName: m.approvalTargetName!, level: m.approvalLevel!, memberUids: [], memberNames: [] };
    entry.memberUids.push(m.employeeUid);
    entry.memberNames.push(m.employeeName);
    approvalsMap.set(key, entry);
  }
  for (const [approverUid, { approverName, level, memberUids, memberNames }] of approvalsMap) {
    const approvalRef = doc(collection(missionRef, 'approval_requests'));
    const approvalData = {
      approverUid,
      approverName,
      approverRole: level === 'division_manager' ? 'manager_division' : 'director',
      approvalLevel: level,
      memberUids,
      memberNames,
      status: 'pending',
      notes: '',
      decidedAt: null,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    batch.set(approvalRef, approvalData);
  }

  await batch.commit();
  return { missionId };
}
