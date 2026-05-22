export const MISSION_STATUSES = [
  "draft_mission",
  "pending_manager_validation",
  "waiting_staff_confirmation",
  "pending_hrd_finalization",
  "approved_ready_to_depart",
  "on_duty",
  "returned_pending_report",
  "report_submitted",
  "expense_submitted",
  "settlement_review",
  "completed",
  "rejected",
  "cancelled",
  "archived_duplicate",
] as const;

export const MEMBER_STATUSES = [
  "waiting_manager_validation",
  "approved_by_manager",
  "validated_by_assigner",
  "replacement_requested",
  "rejected_by_manager",
  "waiting_staff_confirmation",
  "confirmed_by_staff",
  "declined_by_staff",
  "ready_to_depart",
  "on_duty",
  "returned",
  "report_submitted",
  "completed",
  "archived",
] as const;

export const TRIP_TYPES = [
  "Sampling",
  "Audit",
  "Meeting",
  "Survey",
  "Training",
  "Operasional",
  "Lainnya",
] as const;

export const EXPENSE_CATEGORIES = [
  "Transportasi",
  "Tiket perjalanan",
  "BBM",
  "Tol/Parkir",
  "Makan",
  "Penginapan",
  "Komunikasi",
  "Operasional lapangan",
  "Alat sampling kecil",
  "Print/Fotokopi dokumen",
  "Biaya masuk lokasi",
  "Pengiriman dokumen/sampel",
  "Lainnya",
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export type BusinessTripType = (typeof TRIP_TYPES)[number];

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type BusinessTripMission = {
  id?: string;
  missionName?: string;
  assignmentNumber?: string;
  assignmentLetterUrl?: string;
  assignmentLetterDriveUrl?: string;
  assignmentLetterDriveFileId?: string;
  assignmentLetterSource?:
    | "local_upload"
    | "system_drive_upload"
    | "google_drive"
    | "google_drive_link"
    | "firebase_storage";
  assignmentLetterAccessMode?: "anyone_with_link" | "internal_viewer";
  assignmentLetterUploadedBy?: string;
  documentSource?: "firebase_storage" | "google_drive_link" | "google_drive";
  assignmentLetterUploadedAt?: any;
  assignmentLetterFileName?: string;
  assignedByUid?: string;
  assignedByName?: string;
  assignedByPosition?: string;
  projectName?: string;
  clientName?: string;
  tripType?: BusinessTripType;
  tripTypeOther?: string;
  destinationCity?: string;
  destinationRegency?: string;
  destinationProvince?: string;
  destinationGoogleMaps?: string;
  destinationAddress?: string;
  startDate?: any;
  endDate?: any;
  durationDays?: number;
  instructionNote?: string;
  instructionHtml?: string;
  duplicateOf?: string;

  memberCount?: number;
  managerApprovedCount?: number;
  staffConfirmedCount?: number;
  missionCode?: string;
  googleDriveLink?: string;
  googleDriveWebViewLink?: string;
  duplicateMissionIds?: string[];
  status?: MissionStatus;
  createdAt?: any;
  updatedAt?: any;
};

export type BusinessTripMissionMember = {
  id?: string;
  missionId: string;
  missionName: string;
  assignmentNumber?: string;
  employeeUid: string;
  employeeName: string;
  employeePosition?: string;
  brandId?: string;
  brandName?: string;
  divisionId?: string;
  divisionName?: string;
  managerUid?: string;
  managerName?: string;
  memberStatus?: MemberStatus;
  directSupervisorUid?: string;
  directSupervisorName?: string;
  approvalTargetUid?: string;
  approvalTargetName?: string;
  approvalLevel?: "division_manager" | "director";
  requiresApproval?: boolean;
  approvalStatus?:
    | "pending"
    | "approved"
    | "rejected"
    | "validated_by_assigner";
  startDate?: any;
  endDate?: any;
  durationDays?: number;
  managerValidationStatus?: MemberStatus;
  managerValidationNote?: string;
  managerReplacementSuggestion?: string;
  staffConfirmationStatus?: MemberStatus;
  staffConfirmationNote?: string;
  transportationPlan?: string;
  departurePoint?: string;
  contactDuringTrip?: string;

  actualDepartureAt?: any;
  actualReturnAt?: any;
  reportStatus?: string;
  reportSummary?: string;
  reportOutcomes?: string;
  reportIssues?: string;
  reportRecommendations?: string;
  reportAttachmentUrl?: string;
  requiresManagerValidation?: boolean;
  // Sampling specific fields
  samplingPointsCount?: number;
  sampleTypes?: string;
  locationPic?: string;
  baNumber?: string;
  fieldConditionNote?: string;

  missionStatus?: MissionStatus;
  createdAt?: any;
  updatedAt?: any;
};

export type BusinessTripApprovalRequest = {
  id?: string;
  missionId: string;
  missionName?: string;
  approverUid: string;
  approverName: string;
  approverRole?: string;
  approvalLevel?: "division_manager" | "director" | "hrd";
  memberUids: string[]; // Array of employee UIDs that need approval from this approver
  memberNames: string[];
  approvedMemberUids?: string[];
  rejectedMemberUids?: string[];
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "partial_approved"
    | "replacement_requested";
  notes?: string;
  decidedAt?: any;
  rejectionReason?: string;
  replacementSuggestions?: { [uid: string]: string }; // Map of member UID to suggested replacement
  createdAt?: any;
  updatedAt?: any;
};
