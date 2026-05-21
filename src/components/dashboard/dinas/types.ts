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

export const COST_SCHEMAS = [
  "advance",
  "reimburse",
  "company_paid",
  "mixed",
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
export type CostSchema = (typeof COST_SCHEMAS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type BusinessTripMission = {
  id?: string;
  missionName?: string;
  assignmentNumber?: string;
  assignmentLetterUrl?: string;
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
  costScheme?: CostSchema;
  advanceAmount?: number;
  budgetEstimate?: number;
  memberCount?: number;
  managerApprovedCount?: number;
  staffConfirmedCount?: number;
  missionCode?: string;
  documentSource?: "firebase_storage" | "google_drive_link";
  googleDriveLink?: string;
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
  managerValidationStatus?: MemberStatus;
  managerValidationNote?: string;
  managerReplacementSuggestion?: string;
  staffConfirmationStatus?: MemberStatus;
  staffConfirmationNote?: string;
  transportationPlan?: string;
  departurePoint?: string;
  contactDuringTrip?: string;
  cashAdvanceRequired?: boolean;
  advanceNeededAmount?: number;
  actualDepartureAt?: any;
  actualReturnAt?: any;
  reportStatus?: string;
  reportSummary?: string;
  reportOutcomes?: string;
  reportIssues?: string;
  reportRecommendations?: string;
  reportAttachmentUrl?: string;
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
