export const MISSION_STATUSES = [
  "draft_mission",
  "pending_manager_validation",
  "waiting_staff_confirmation",
  "pending_hrd_finalization",
  "approved_ready_to_depart",
  "on_duty",
  "returned_pending_report",
  "final_report_submitted",
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

export type FinalReportMode = "team_report" | "individual_report";

export type ReportReviewStatus = "pending_review" | "approved" | "revision_requested" | "resubmitted";

export type FinalReport = {
  id?: string;
  missionId: string;
  reportMode: FinalReportMode;
  ringkasanKegiatan?: string;
  hasilOutput?: string;
  kendalaDanSolusi?: string;
  tindakLanjut?: string;
  catatanUntukHRD?: string;
  lampiranUrl?: string;
  dilaporkanOlehUid?: string;
  dilaporkanOlehName?: string;
  submittedAt?: any;
  totalMembers?: number;
  // Review fields
  reportReviewStatus?: ReportReviewStatus;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  revisionNote?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type MemberFinalReport = {
  id?: string;
  missionId: string;
  memberUid: string;
  memberName: string;
  kegiatanDilakukan?: string;
  hasilPribadi?: string;
  kendalaPribadi?: string;
  solusiPribadi?: string;
  catatanTambahan?: string;
  lampiranUrl?: string;
  submittedAt?: any;
  // Review fields
  reportReviewStatus?: ReportReviewStatus;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  revisionNote?: string;
  createdAt?: any;
};

export type MemberNote = {
  id?: string;
  missionId: string;
  memberUid: string;
  memberName: string;
  kontribusiPribadi?: string;
  catatanTambahan?: string;
  kendalaPribadi?: string;
  lampiranUrl?: string;
  submittedAt?: any;
  createdAt?: any;
};

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
  reportMode?: FinalReportMode;
  finalReportSubmittedAt?: any;
  finalReportSubmittedBy?: string;
  archivedAt?: any;
  archivedByUid?: string;
  archivedByName?: string;
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
  employeeType?: string | null;
  brandId?: string;
  brandName?: string;
  divisionId?: string;
  divisionName?: string;
  managerUid?: string;
  managerName?: string;
  memberStatus?: MemberStatus;
  directSupervisorUid?: string;
  directSupervisorName?: string;
  approvalTargetUid?: string | null;
  approvalTargetName?: string | null;
  approvalLevel?: "division_manager" | "director";
  isDivisionManager?: boolean;
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
  managerValidationNote?: string | null;
  managerReplacementSuggestion?: string | null;
  staffConfirmationStatus?: MemberStatus;
  staffConfirmationNote?: string | null;
  transportationPlan?: string;
  departurePoint?: string;
  contactDuringTrip?: string;

  // Trip tracking milestones (phase 2 detailed tracking)
  memberTripStatus?: "ready" | "departed" | "arrived" | "activity_done" | "return_started" | "returned" | "issue_reported";
  lastTripUpdateAt?: any;
  lastTripUpdateByUid?: string;
  lastTripUpdateByName?: string;

  // Detailed timestamps per milestone
  departedAt?: any;
  estimatedArrivalAt?: any;
  arrivedAt?: any;
  activityDoneAt?: any;
  returnStartedAt?: any;
  estimatedReturnAt?: any;
  returnedAt?: any;

  // Activity done note (short optional note when marking activity_done)
  activityNote?: string;

  // Issue tracking
  issueNote?: string;
  issueCategory?: string;
  issueUrgency?: "rendah" | "sedang" | "tinggi";
  issueAttachmentUrl?: string;
  issueAt?: any;

  actualDepartureAt?: any;
  actualReturnAt?: any;
  reportStatus?: string;
  reportSummary?: string;
  reportOutcomes?: string;
  reportIssues?: string;
  reportRecommendations?: string;
  reportAttachmentUrl?: string;
  requiresManagerValidation?: boolean;

  // Continuation assignment fields (multi-trip sequential)
  isContinuationAssignment?: boolean;
  continuedFromMissionId?: string;
  continuedFromMissionName?: string;
  continuedFromDestination?: string;
  continuedFromEndDate?: any;
  transitionType?: "direct_transfer" | "break";
  transitionNote?: string;

  // Override fields (conflict override by management)
  isConflictOverride?: boolean;
  conflictOverrideReason?: string;
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

export type MilestoneType = "departed" | "arrived" | "activity_done" | "returned";
export type MilestoneLocationStatus = "captured" | "unavailable" | "manual";
export type MilestoneLocationTrustLevel = "high" | "medium" | "low";
export type MilestoneEvidencePhotoType = "temporary_milestone_evidence" | "archive_report";

export type MilestoneEvidencePhoto = {
  photoUrl?: string | null;
  photoPath?: string | null;
  originalFileName?: string | null;
  compressedSize?: number | null;
  uploadedAt?: any;
  expiresAt?: any;
};

export type MilestoneEvidence = {
  id?: string;
  missionId: string;
  milestoneType: MilestoneType;
  confirmedByUid: string;
  confirmedByName: string;
  targetMemberUids: string[];
  targetMemberNames: string[];
  createdAt?: any;
  updatedAt?: any;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  locationCapturedAt?: any;
  locationStatus: MilestoneLocationStatus;
  // Reverse-geocoded address fields
  addressText?: string | null;
  streetName?: string | null;
  village?: string | null;
  district?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  geocodeStatus?: "success" | "failed" | null;
  locationTrustLevel?: MilestoneLocationTrustLevel | null;
  gpsPermissionStatus?: string | null;
  deviceTimestamp?: string | null;
  userAgent?: string | null;
  manualLocationNote?: string | null;
  note?: string | null;
  evidenceType?: string | null;
  photos?: MilestoneEvidencePhoto[];
  // Repair/Upload Ulang fields
  repairStatus?: "requested" | "resolved" | null;
  evidenceRepairRequested?: boolean;
  repairRequestedByUid?: string | null;
  repairRequestedByName?: string | null;
  repairRequestedAt?: any;
  repairReason?: string | null;
  repairedByUid?: string | null;
  repairedByName?: string | null;
  repairedAt?: any;
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
