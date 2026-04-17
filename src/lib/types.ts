"use client";

import type { Timestamp } from "firebase/firestore";

export const ROLES = [
  "super-admin",
  "hrd",
  "manager",
  "kandidat",
  "karyawan",
] as const;
export const ROLES_INTERNAL = [
  "super-admin",
  "hrd",
  "manager",
  "karyawan",
] as const;

export type UserRole = (typeof ROLES)[number];
export const EMPLOYMENT_TYPES = ["karyawan", "magang", "training"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_STAGES = [
  "intern_education",
  "intern_pre_probation",
  "probation",
  "active",
] as const;
export type EmploymentStage = (typeof EMPLOYMENT_STAGES)[number];

export type UserProfile = {
  id?: string; // Same as uid
  uid: string;
  email: string;
  fullName: string;
  nameLower?: string; // For searching
  role: UserRole;
  employmentType?: EmploymentType;
  employmentStage?: EmploymentStage;
  isActive: boolean;
  department?: string;
  jobTitle?: string;
  skills?: string[];
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  createdBy?: string;
  brandId?: string | string[];
  isProfileComplete?: boolean;
  isAssessmentComplete?: boolean;
  photoUrl?: string;
  inviteBatchId?: string;

  // Division Manager fields
  isDivisionManager?: boolean;
  managedBrandId?: string | null;
  managedDivision?: string | null;
  division?: string | null;
  positionTitle?: string | null;

  updatedAt?: Timestamp;
};

export const EMPLOYMENT_STATUSES = [
  "active",
  "probation",
  "resigned",
  "terminated",
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export type EmployeeProfile = {
  id?: string;
  uid: string;

  // --- Data Pribadi ---
  fullName: string;
  nickName?: string;
  nationality?: string;
  phone: string;
  personalEmail?: string;
  email: string;
  profilePhotoUrl?: string;
  gender?: "Laki-laki" | "Perempuan" | "Lainnya";
  birthPlace?: string;
  birthDate?: string; // YYYY-MM-DD
  maritalStatus?: "Belum Kawin" | "Kawin" | "Cerai Hidup" | "Cerai Mati";
  religion?: string;
  address?: Address;
  addressKtp?: Address;
  addressCurrent?: string;
  isDomicileSameAsKtp?: boolean;
  contact?: {
    phone: string;
    email: string;
  };

  // --- Identitas & Dokumen ---
  nik?: string;
  ktpPhotoUrl?: string;
  simNumber?: string;
  simPhotoUrl?: string;
  npwp?: string;
  npwpPhotoUrl?: string;
  bpjsKesehatan?: string;
  bpjsKetenagakerjaan?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolderName?: string;
  bankDocumentUrl?: string;
  identityVerificationStatus?: VerificationStatus;
  documentVerificationStatus?: VerificationStatus;
  documents?: DocumentRecord[];

  // --- Kontak Darurat ---
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  emergencyContactAddress?: string;

  // --- Pendidikan & Pelatihan ---
  education?: Education[];
  certifications?: Certification[];
  trainingHistory?: TrainingRecord[];

  // --- Informasi Kepegawaian ---
  employeeNumber?: string; // NIK internal
  positionTitle?: string; // Jabatan/Posisi
  division?: string; // Departemen/Bagian
  department?: string;
  brandId?: string;
  brandName?: string;
  workLocation?: string; // Office Site ID or 'Remote'
  managerUid?: string; // Atasan langsung
  managerName?: string;
  supervisorUid?: string; // Used for interns, synonymous with managerUid
  supervisorName?: string;
  joinDate?: Timestamp;
  contractEndDate?: Timestamp;
  contractType?: string;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  employmentStage?: EmploymentStage;
  probationEndDate?: Timestamp;
  isActive?: boolean;

  // --- Riwayat Karir & Kinerja ---
  careerHistory?: {
    date: Timestamp;
    event: "promotion" | "assessment" | "award" | "sanction";
    description: string;
    notes?: string;
  }[];
  careerEvents?: CareerEventRecord[];

  // --- Kehadiran & Cuti ---
  leaveBalance?: LeaveBalanceSummary;

  // --- Data Penggajian (Hanya untuk HRD) ---
  payroll?: {
    baseSalary?: number;
    allowances?: Record<string, number>;
  };
  payrollSummary?: PayrollSummary;

  // --- Metadata ---
  dataSource?: "register" | "import" | "manual";
  dataCompleteness?: "lengkap" | "sebagian" | "belum_lengkap";
  completeness?: {
    isComplete: boolean;
    completedAt?: Timestamp;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  hrdNotes?: string;
  internalNotes?: string;
  additionalFields?: Record<string, any>;
};

export type Brand = {
  id?: string;
  name: string;
  description?: string;
};

export type Division = {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
};

export type EcosystemCompany = {
  id?: string;
  name: string;
  websiteUrl: string;
  iconUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type EcosystemSection = {
  id?: string;
  sectionKey: string;
  type: "hero" | "content";
  title: string;
  subtitle?: string;
  description?: string;
  imageUrls: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type NavigationSetting = {
  id?: string;
  role: UserRole;
  visibleMenuItems: string[];
};

export type InviteBatch = {
  id?: string; // The unique batch code
  brandId: string;
  brandName: string;
  employmentType: "karyawan" | "magang" | "training";
  totalSlots: number;
  claimedSlots: number;
  createdBy: string; // UID of HRD/SuperAdmin
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Job = {
  id?: string;
  position: string;
  slug: string;
  statusJob: "fulltime" | "internship" | "contract";
  division: string;
  location: string;
  workMode?: "onsite" | "hybrid" | "remote";
  brandId: string;
  brandName?: string; // Denormalized for convenience
  coverImageUrl?: string;
  generalRequirementsHtml: string;
  specialRequirementsHtml: string;
  publishStatus: "draft" | "published" | "closed";
  applyDeadline?: Timestamp;
  numberOfOpenings?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
  assignedUserIds?: string[];
  tags?: string[]; // Added for panelist suggestions
  interviewTemplate?: {
    meetingLink?: string;
    meetingPublished?: boolean;
    defaultStartDate?: Timestamp;
    workdayStartTime?: string; // "HH:mm"
    workdayEndTime?: string; // "HH:mm"
    slotDurationMinutes?: number;
    breakMinutes?: number;
  };
};

export const ORDERED_RECRUITMENT_STAGES = [
  "draft",
  "submitted",
  "tes_kepribadian",
  "screening",
  "verification",
  "document_submission",
  "interview",
  "offered",
  "hired",
  "rejected",
] as const;
export type JobApplicationStatus = (typeof ORDERED_RECRUITMENT_STAGES)[number];

export const APPLICATION_SOURCES = [
  "website",
  "linkedin",
  "jobstreet",
  "referral",
  "instagram",
  "other",
] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const CANDIDATE_STATUSES = [
  "lolos",
  "menunggu",
  "interview_scheduled",
  "offer_received",
  "process_complete",
  "under_review",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type ApplicationTimelineEvent = {
  type:
    | "stage_changed"
    | "note_added"
    | "interview_scheduled"
    | "interview_updated"
    | "offer_sent"
    | "offer_viewed"
    | "offer_accepted"
    | "offer_rejected"
    | "assessment_graded"
    | "status_changed"
    | "panelists_updated";
  at: Timestamp;
  by: string; // Recruiter UID
  meta: {
    from?: string;
    to?: string;
    note?: string;
    added?: string[]; // UIDs
    removed?: string[]; // UIDs
    [key: string]: any;
  };
};

export type RescheduleRequest = {
  requestedAt: Timestamp;
  requestedByUid: string;
  reason: string;
  proposedSlots: Array<{ startAt: Timestamp; endAt: Timestamp }>;
  status: "pending" | "approved" | "denied" | "countered";
  hrResponseNote?: string;
  decidedAt?: Timestamp;
  decidedByUid?: string;
};

export type ApplicationInterview = {
  interviewId: string; // Unique ID for this specific interview instance
  startAt: Timestamp;
  endAt: Timestamp;
  meetingLink: string;
  panelistIds: string[];
  panelistNames: string[];
  leadPanelistId?: string;
  status: "scheduled" | "completed" | "canceled" | "reschedule_requested";
  notes?: string;
  rescheduleRequest?: RescheduleRequest;
  meetingPublished?: boolean;
  meetingPublishedAt?: Timestamp | null;
  meetingPublishedBy?: string | null;
  rescheduleReason?: string; // Legacy field
  interviewerIds?: string[]; // Legacy field
  interviewerNames?: string[]; // Legacy field
};

export type InterviewChangeRequest = {
  id?: string;
  applicationId: string;
  interviewId: string;
  requestedByUid: string;
  requestedByName: string;
  type: "replace_panelist" | "add_panelist" | "remove_panelist";
  payload: {
    removeUid?: string;
    addUid?: string;
    addUids?: string[];
    removeUids?: string[];
  };
  reason: string;
  status: "pending" | "approved" | "denied";
  createdAt: Timestamp;
  decidedByUid?: string;
  decidedAt?: Timestamp;
};

export type JobApplication = {
  id?: string;
  stage?: JobApplicationStatus;
  stageEnteredAt?: Timestamp;
  appliedAt?: Timestamp;
  lastActivityAt?: Timestamp;
  source?: ApplicationSource;
  assignedRecruiterId?: string;
  scoreManual?: number; // 0-5
  scoreAssessment?: number; // 0-100
  tags?: string[];
  interviews?: ApplicationInterview[];
  allPanelistIds?: string[]; // Denormalized flat array for querying
  timeline?: ApplicationTimelineEvent[];
  cvVerified?: boolean;
  ijazahVerified?: boolean;

  // New offer fields
  offerStatus?: "sent" | "viewed" | "accepted" | "rejected";
  offeredSalary?: number | null;
  probationDurationMonths?: number | null;
  contractStartDate?: Timestamp | null;
  contractDurationMonths?: number | null;
  contractEndDate?: Timestamp | null;
  offerSections?: Array<{
    title: string;
    content: string;
  }>;
  offerDescription?: string | null;
  workDays?: string | null;
  offerNotes?: string | null;
  masterTemplateId?: string | null;
  offerLetterNumber?: string | null;
  offerSentAt?: Timestamp | null;
  offerViewedAt?: Timestamp | null;
  offerRejectionReason?: string | null;
  candidateOfferDecisionAt?: Timestamp | null;
  internalAccessEnabled?: boolean;

  // Denormalized data
  candidateName: string;
  candidateEmail: string;
  candidatePhotoUrl?: string;
  jobPosition: string;
  jobLocation?: string;

  // Legacy fields for compatibility
  candidateUid: string;
  jobId: string;
  jobSlug: string;
  brandId: string;
  brandName: string;
  jobType: "fulltime" | "internship" | "contract";
  candidateStatus?: CandidateStatus;
  finalDecisionLocked?: boolean;
  location: string;
  status: JobApplicationStatus;
  personalityTestAssignedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt?: Timestamp;
  decisionAt?: Timestamp;
  cvUrl?: string;
  ijazahUrl?: string;
  cvFileName?: string;
  ijazahFileName?: string;
  jobApplyDeadline?: Timestamp;

  // CV text extraction cache
  cvText?: string;
  cvTextExtractedAt?: Timestamp;
  cvTextSource?: "pdf-parse" | "ocr-vision" | "ocr-docai" | "unknown";
  cvCharCount?: number;

  // --- Internal Review Features ---
  internalReviewConfig?: InternalReviewConfig;
  internalReviewSummary?: InternalReviewSummary;
  recruitmentInternalDecision?: RecruitmentInternalDecision;

  // --- Post-Interview Features ---
  postInterviewEvaluation?: PostInterviewEvaluationSummary;
  postInterviewDecision?: PostInterviewDecision;

  // --- Manual Completion ---
  interviewCompleted?: boolean;
  interviewCompletedAt?: Timestamp;
  interviewCompletionSource?: "manual" | "auto_time";
};

export type InternalReviewScore =
  | "direkomendasikan"
  | "dipertimbangkan"
  | "belum_sesuai";

export interface InternalReviewConfig {
  enabled: boolean;
  assignedReviewerUids: string[];
  assignedReviewerNames?: string[];
  visibilityMode: "shared_internal";
  reviewLocked: boolean;
  lastUpdatedAt?: Timestamp | null;
}

export interface InternalReviewSummary {
  totalAssigned: number;
  totalSubmitted: number;
  totalDirekomendasikan: number;
  totalDipertimbangkan: number;
  totalBelumSesuai: number;
  pendingReviewerUids: string[];
  submittedReviewerUids?: string[];
  allSubmitted: boolean;
  lastUpdatedAt?: Timestamp | null;
}

export type RecruitmentInternalDecisionStatus =
  | "lanjut_ke_tahap_selanjutnya"
  | "pending_internal"
  | "tidak_dilanjutkan_saat_ini";

export interface RecruitmentInternalDecision {
  status: RecruitmentInternalDecisionStatus;
  note: string;
  decidedBy: string;
  decidedByName?: string;
  decidedAt: Timestamp;
}

export type PostInterviewDecisionStatus = "lanjut" | "pending" | "tidak_lanjut";

export interface PostInterviewDecision {
  status: PostInterviewDecisionStatus;
  note?: string;
  decidedBy: string;
  decidedByName?: string;
  decidedAt: Timestamp;
}

export interface InternalReview {
  id?: string; // Same as reviewerUid
  applicationId: string;
  reviewerUid: string;
  reviewerName: string;
  reviewerRole: "hrd" | "reviewer" | "manager" | "super-admin";
  score: InternalReviewScore;
  note: string;
  strengths?: string;
  concerns?: string;
  submittedAt: Timestamp;
  updatedAt: Timestamp;
}

export type PostInterviewReviewScore =
  | "direkomendasikan"
  | "dipertimbangkan"
  | "belum_direkomendasikan";

export interface PostInterviewReview {
  id?: string; // Same as reviewerUid
  applicationId: string;
  reviewerUid: string;
  reviewerName: string;
  reviewerRole: string;
  recommendation: PostInterviewReviewScore;
  notes: string;
  strengths: string;
  concerns: string;
  communicationScore: number;
  attitudeScore: number;
  fitScore: number;
  submittedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PostInterviewEvaluationSummary {
  evaluators: string[];
  submissions: number;
  progress: number;
  notes?: string;
  recommendation?: PostInterviewReviewScore;
  lastUpdatedAt?: Timestamp | null;
}

export type Candidate = {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  photoUrl?: string;
  resumeUrl?: string;
  createdAt: Timestamp;
  tags?: string[];
  currentPosition?: string;
  currentCompany?: string;
};

// The rest of the types... (SavedJob, Education, etc.)

export type SavedJob = {
  id?: string;
  userId: string;
  jobId: string;
  jobPosition: string;
  jobSlug: string;
  brandName: string;
  savedAt: Timestamp;
};

export type Education = {
  id: string;
  institution: string;
  level: "SMA/SMK" | "D3" | "S1" | "S2" | "S3";
  fieldOfStudy?: string;
  thesisTitle?: string;
  gpa?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
};

export const JOB_TYPES = [
  "internship",
  "pkwt",
  "kwtt",
  "outsourcing",
  "freelance",
] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  internship: "Internship (Magang)",
  pkwt: "PKWT (Kontrak)",
  kwtt: "KWTT (Tetap)",
  outsourcing: "Outsourcing",
  freelance: "Freelance/Kontrak Harian",
};

export type WorkExperience = {
  id: string;
  company: string;
  position: string;
  jobType?: JobType;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  description?: string;
  reasonForLeaving?: string;
};

export type OrganizationalExperience = {
  id: string;
  organization: string;
  position: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  description?: string;
};

export type Certification = {
  id: string;
  name: string;
  organization: string;
  issueDate: string; // Storing as YYYY-MM
  expirationDate?: string; // Storing as YYYY-MM
  imageUrl?: string;
};

export type Address = {
  street: string;
  rt: string;
  rw: string;
  village: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
};

export type DocumentType =
  | "ktp"
  | "sim"
  | "npwp"
  | "bpjs_kesehatan"
  | "bpjs_ketenagakerjaan"
  | "bank_account"
  | "profile_photo";

export type VerificationStatus = "pending" | "verified" | "rejected";

export type PayrollSummary = {
  baseSalary?: number;
  allowances?: Record<string, number>;
  bonuses?: number;
  incentives?: number;
  deductions?: Record<string, number>;
  taxDeduction?: number;
  paymentMethod?: string;
  lastUpdatedAt?: Timestamp;
};

export type TrainingRecord = {
  id: string;
  name: string;
  provider: string;
  startDate: string;
  endDate?: string;
  certificateUrl?: string;
  notes?: string;
};

export type DocumentRecord = {
  id: string;
  type: DocumentType;
  fileUrl: string;
  fileName?: string;
  issuedNumber?: string;
  status?: VerificationStatus;
  uploadedAt?: Timestamp;
  verifiedBy?: string;
  verifiedAt?: Timestamp;
  notes?: string;
};

export type CareerEventRecord = {
  id: string;
  eventType: "promotion" | "mutation" | "appraisal" | "award" | "sanction";
  effectiveDate: string;
  title: string;
  description?: string;
  isVisibleToEmployee?: boolean;
  createdBy?: string;
  createdAt?: Timestamp;
};

export type LeaveBalanceSummary = {
  annual?: number;
  sick?: number;
  remainingAnnual?: number;
  remainingSick?: number;
};

export type Profile = {
  fullName: string;
  nickname: string;
  email: string;
  phone: string;
  eKtpNumber: string;
  nikHash?: string;
  gender: "Laki-laki" | "Perempuan";
  birthPlace: string;
  birthDate: Timestamp;
  addressKtp: Address;
  addressDomicile: Address;
  isDomicileSameAsKtp: boolean;
  hasNpwp?: boolean;
  npwpNumber?: string;
  willingToWfo: boolean;
  linkedinUrl?: string;
  websiteUrl?: string;
  education: Education[];
  workExperience?: WorkExperience[];
  organizationalExperience?: OrganizationalExperience[];
  skills?: string[];
  certifications?: Certification[];

  selfDescription?: string;
  salaryExpectation?: string;
  salaryExpectationReason?: string;
  motivation?: string;
  workStyle?: string;
  improvementArea?: string;
  availability?:
    | "Secepatnya"
    | "1 minggu"
    | "2 minggu"
    | "1 bulan"
    | "3 bulan"
    | "6 bulan"
    | "Lainnya";
  availabilityOther?: string;
  usedToDeadline?: boolean;
  deadlineExperience?: string;

  declaration?: boolean;

  // Document URLs
  cvUrl?: string;
  cvFileName?: string;
  ijazahUrl?: string;
  ijazahFileName?: string;
  otherDocumentUrls?: string[];

  // Wizard metadata
  profileStatus?: "draft" | "completed";
  profileStep?: number;
  updatedAt?: Timestamp;
  completedAt?: Timestamp | null;
};

// --- ASSESSMENT TYPES ---

export type AssessmentConfig = {
  id?: string;
  bigfiveCount: number;
  discCount: number;
  forcedChoiceCount?: number;
  updatedAt: Timestamp;
};

export type AssessmentFormat = "likert" | "forced-choice";

export type AssessmentTemplate = {
  id?: string;
  name: string;
  format: AssessmentFormat;
  engine: "dual" | "disc" | "bigfive";
  scale: {
    type: "likert";
    points: number;
    leftLabel: string;
    rightLabel: string;
    ui: "bubbles";
  };
  dimensions: {
    disc: { key: string; label: string }[];
    bigfive: { key: string; label: string }[];
  };
  scoring: {
    method: "sum";
    reverseEnabled: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Assessment = {
  id?: string;
  templateId: string;
  name: string;
  version: number;
  isActive: boolean;
  publishStatus: "draft" | "published";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  questionConfig?: {
    bigfiveCount?: number;
    discCount?: number;
  };
  resultTemplates: {
    disc: Record<string, Partial<ResultTemplate>>;
    bigfive: Record<
      string,
      { highText: string; midText: string; lowText: string }
    >;
    overall: {
      summaryBlocks?: string[];
      interviewQuestions: string[];
      redFlags?: string[];
      developmentTips?: string[];
    };
  };
  rules?: {
    discRule?: "highest";
    bigfiveNormalization?: "minmax";
  };
};

export type ResultTemplate = {
  title: string;
  subtitle: string;
  blocks: string[];
  strengths: string[];
  risks: string[];
  roleFit: string[];
};

export type ForcedChoice = {
  text: string;
  dimensionKey: string;
  engineKey: "disc" | "bigfive";
};

export type AssessmentQuestion = {
  id?: string;
  assessmentId: string;
  type: "likert" | "forced-choice";
  order?: number;
  isActive: boolean;

  // Likert specific
  text?: string;
  engineKey?: "disc" | "bigfive";
  dimensionKey?: string;
  reverse?: boolean;
  weight?: number;

  // Forced-choice specific
  forcedChoices?: ForcedChoice[];
};

export type AssessmentSession = {
  id?: string;
  assessmentId: string;
  candidateUid: string;
  candidateName?: string;
  candidateEmail?: string;
  applicationId?: string;
  jobPosition?: string;
  brandName?: string;
  status: "draft" | "submitted";
  deadlineAt?: Timestamp;
  currentTestPart?: "likert" | "forced-choice";
  part1GuideAck?: boolean;
  part2GuideAck?: boolean;
  selectedQuestionIds?: {
    likert: string[];
    forcedChoice: string[];
  };
  answers: { [questionId: string]: number | { most: string; least: string } };
  scores: {
    disc: Record<string, number>;
    bigfive: Record<string, number>;
  };
  normalized?: {
    bigfive: Record<string, number>;
  };
  result?: {
    discType: string;
    mbtiArchetype: {
      archetype: string;
      code: string;
    } | null;
    report: Partial<ResultTemplate> & {
      bigfiveSummary?: any[];
      interviewQuestions?: any[];
    };
  };
  hrdDecision?: "pending" | "approved" | "rejected";
  hrdDecisionAt?: Timestamp;
  hrdDecisionBy?: string;
  startedAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
};

// --- MONTHLY EVALUATION TYPES ---

export const RATING_SCALE = [
  "Sangat Baik",
  "Baik",
  "Cukup",
  "Perlu Perbaikan",
] as const;
export type RatingScale = (typeof RATING_SCALE)[number];

export type EvaluationCriteria = {
  attendance: RatingScale;
  discipline: RatingScale;
  attitude: RatingScale;
  responsibility: RatingScale;
  communication: RatingScale;
  initiative: RatingScale;
  teamwork: RatingScale;
  workQuality: RatingScale;
  learningAbility: RatingScale;
  consistency: RatingScale;
};

export type MonthlyEvaluation = {
  id?: string;
  internUid: string;
  internName?: string;
  evaluationMonth: Timestamp; // The first day of the month being evaluated
  evaluatorUid?: string;
  evaluatorName?: string;
  monthlyFocus?: string;
  ratings?: EvaluationCriteria;
  hrdComment?: string;
  mainStrengths?: string;
  improvementAreas?: string;
  nextMonthRecommendation?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ReviewCycle = {
  payrollPeriodStart: Date;
  payrollPeriodEnd: Date;
  activePeriodStart: Date;
  activePeriodEnd: Date;
  reviewDueDate: Date;
  monthId: string; // "YYYY-MM"
  isCurrent: boolean;
};

export type ReviewStatus =
  | "Belum Waktunya"
  | "Akan Jatuh Tempo"
  | "Siap Direview"
  | "Terlambat"
  | "Sudah Dievaluasi";

export interface InternWithReviewStatus extends EmployeeProfile {
  reviewCycle: ReviewCycle | null;
  reviewStatus: ReviewStatus;
  evaluation?: MonthlyEvaluation;
}

// --- NOTIFICATION TYPES ---
export type Notification = {
  id?: string;
  userId: string;
  type:
    | "recruitment_assignment"
    | "interview_scheduled"
    | "interview_updated"
    | "stage_advanced"
    | "new_application"
    | "status_update"
    | "offer"
    | "negotiation"
    | "decision";
  module: "recruitment" | "employee";
  title: string;
  message: string;
  targetType: "job" | "application" | "user";
  targetId: string;
  actionUrl: string;
  isRead: boolean;
  createdAt: Timestamp;
  createdBy: string;
  meta?: {
    jobId?: string;
    applicationId?: string;
    candidateUid?: string;
    candidateName?: string;
    jobTitle?: string;
    interviewDate?: string;
    interviewTime?: string;
    meetingLink?: string;
    [key: string]: any;
  };
};

// --- AI ANALYSIS TYPES ---

export type RecommendedDecision =
  | "advance_interview"
  | "advance_test"
  | "hold"
  | "reject";

export type Confidence = {
  level: "high" | "medium" | "low";
  reasons: string[];
};

export type RequirementMatch = {
  requirement: string;
  type: "must-have" | "nice-to-have";
  match: "yes" | "partial" | "no";
  evidence_from_cv: string;
  risk_note?: string;
};

export type ScoreBreakdown = {
  relevantExperience: number;
  adminDocumentation: number;
  communicationTeamwork: number;
  analyticalProblemSolving: number;
  toolsHardSkills: number;
  initiativeOwnership: number;
  cultureFit: {
    score: number;
    reason: string;
  };
};

export type Strength = {
  strength: string;
  evidence_from_cv: string;
};

export type GapRisk = {
  gap: string;
  impact: string;
  onboarding_mitigation: string;
};

export type InterviewQuestion = {
  question: string;
  ideal_answer: string;
};

export type CandidateFitAnalysisOutput = {
  recommendedDecision: RecommendedDecision;
  confidence: Confidence;
  overallFitScore: number;
  overallFitLabel: "strong_fit" | "moderate_fit" | "weak_fit";
  scoreSummary: string[];
  requirementMatchMatrix: RequirementMatch[];
  scoreBreakdown: ScoreBreakdown;
  strengths: Strength[];
  gapsRisks: GapRisk[];
  redFlags?: string[];
  interviewQuestions: InterviewQuestion[];
  quickTestRecommendation: string[];
  missingInformation: string[];
};

// Firestore document for interview assignments, denormalized for easy querying per user.
export interface InterviewAssignment {
  id?: string; // Composite key: `${applicationId}_${interviewId}`
  applicationId: string;
  interviewId: string;
  jobId: string;
  candidateName: string;
  startAt: Timestamp;
  endAt: Timestamp;
  meetingLink: string;
  createdAt: Timestamp;
}

// --- EMPLOYEE MONITORING TYPES ---
export type AttendanceSite = {
  id?: string;
  name: string;
  brandIds?: string[]; // Updated from brandId
  brandId?: string; // Legacy
  isActive: boolean;
  office: {
    lat: number;
    lng: number;
  };
  radiusM: number;
  timezone: string;
  workDays: string[];
  shift: {
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    graceLateMinutes: number;
  };
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export type AttendanceEvent = {
  id?: string;
  uid: string;
  userId?: string; // Alias for uid
  siteId?: string; // Denormalized site ID
  type: "tap_in" | "tap_out" | "IN" | "OUT";
  timestamp?: Timestamp; // Original HRP field
  ts?: Timestamp; // Alias for timestamp
  createdAt?: Timestamp; // Alias for timestamp
  tsServer?: Timestamp; // From AbsenHRP
  tsClient?: Timestamp; // From AbsenHRP
  dateKey?: string; // YYYY-MM-DD
  mode: "ONSITE" | "OFFSITE" | "onsite" | "offsite";
  location: {
    lat: number;
    lng: number;
  };
  photoUrl?: string;
  brandId?: string;
  displayName?: string;
  flags?: string[];
  address?: string;
};

export type ReportStatus =
  | "draft"
  | "submitted"
  | "needs_revision"
  | "approved";

export type DailyReport = {
  id?: string;
  uid: string;
  date: Timestamp;
  status: ReportStatus;
  activity: string;
  learning: string;
  obstacle: string;
  supervisorUid?: string | null;
  brandId?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt?: Timestamp;
  reviewedByUid?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: Timestamp | null;
  reviewerNotes?: string | null;
};

export const OVERTIME_SUBMISSION_STATUSES = [
  "draft",
  "pending_manager",
  "rejected_manager",
  "revision_manager",
  "approved_by_manager",
  "pending_hrd",
  "rejected_hrd",
  "revision_hrd",
  "approved",
] as const;
export type OvertimeSubmissionStatus =
  (typeof OVERTIME_SUBMISSION_STATUSES)[number];

export type OvertimeSubmission = {
  id?: string;
  uid: string;
  fullName: string;
  brandId: string;
  brandName?: string;
  division: string;
  positionTitle: string;
  date: Timestamp;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  totalDurationMinutes: number;
  overtimeType: "hari_kerja" | "hari_libur" | "urgent";
  tasks: {
    description: string;
    estimatedMinutes?: number;
    actualMinutes?: number | null;
  }[];
  reason: string;
  location: "kantor" | "remote" | "site";
  employeeNotes?: string | null;
  attachments?: string[];
  status: OvertimeSubmissionStatus;
  managerUid?: string | null;
  managerNotes?: string | null;
  managerDecisionAt?: Timestamp | null;
  hrdReviewerUid?: string | null;
  hrdNotes?: string | null;
  hrdDecisionAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export const PERMISSION_REQUEST_STATUSES = [
  "draft",
  "pending_manager",
  "rejected_manager",
  "revision_manager",
  "approved_by_manager",
  "pending_hrd",
  "rejected_hrd",
  "revision_hrd",
  "approved",

  // Specific to non-blocking office exit statuses (keluar_kantor)
  "reported", // Laporan keluar dibuat
  "returned", // Sudah tap in kembali
  "verified_manager", // Diverifikasi manager
  "closed", // Selesai / Diarsipkan HRD
] as const;
export type PermissionRequestStatus =
  (typeof PERMISSION_REQUEST_STATUSES)[number];

export const PERMISSION_TYPES = [
  "cuti",
  "sakit",
  "keluar_kantor",
  "tidak_masuk",
  "duka",
  "akademik",
  "lainnya",
] as const;
export type PermissionType = (typeof PERMISSION_TYPES)[number];

export type PermissionRequest = {
  id?: string;
  uid: string;
  fullName: string;
  brandId: string;
  brandName?: string;
  division: string;
  positionTitle: string;
  type: PermissionType;
  reason: string;
  startDate: Timestamp;
  endDate: Timestamp;
  totalDurationMinutes: number;
  attachments?: string[];
  attachmentStatus?: "provided" | "not_provided" | "verification_needed";
  status: PermissionRequestStatus;
  managerUid?: string | null;
  managerNotes?: string | null;
  managerDecisionAt?: Timestamp | null;
  hrdReviewerUid?: string | null;
  hrdNotes?: string | null;
  hrdDecisionAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // --- Detail Izin Keluar Kantor ---
  destination?: string; // For 'keluar_kantor': The location/destination.
  reportedExitAt?: Timestamp | null; // Jam keluar rencana
  expectedReturnAt?: Timestamp | null; // Estimasi jam kembali
  estimatedDurationMinutes?: number; // Estimasi durasi rencana

  // --- Realisasi Kembali (Izin Keluar Kantor) ---
  actualReturnAt?: Timestamp | null; // Jam kembali aktual
  returnSource?: "attendance_auto" | "manual_button"; // Sumber deteksi
  returnDetectedFromAttendance?: boolean; // Apakah deteksi via absen?
  actualDurationMinutes?: number; // Total durasi nyata
  exceededEstimatedReturn?: boolean; // Apakah terlambat dari estimasi?
  exceededFourHours?: boolean; // Apakah lebih dari 4 jam?
  overtimeReturnMinutes?: number; // Selisih menit keterlambatan

  // Flags & Reviewer Notes
  needsManagerAttention?: boolean; // Perlu perhatian manager
  needsHrdNote?: boolean; // Perlu catatan HRD
  managerReviewNote?: string | null;
  hrdReviewNote?: string | null;

  // --- Field Spesifik per Jenis Izin ---
  sicknessDescription?: string;
  familyRelation?: string;
  academicActivityName?: string;
  academicInstitution?: string;
  otherLeaveTitle?: string;
};

/**
 * Helper to check if a submission (Overtime or Permission) is in a final status.
 */
export function isFinalStatus(status: string): boolean {
  return [
    "approved",
    "rejected_manager",
    "rejected_hrd",
    "verified_manager",
    "closed",
  ].includes(status);
}

/**
 * Helper to check if a specific role can act on a submission based on its status.
 */
export function isActionableStatus(
  status: string,
  mode: "manager" | "hrd",
): boolean {
  if (isFinalStatus(status)) return false;

  if (mode === "manager") {
    // For normal flow
    const normalActionable =
      status === "pending_manager" || status === "revision_manager";
    // For non-blocking office exit flow
    // A manager can verify either after reported OR after returned (tap-in detected)
    const officeExitActionable = status === "reported" || status === "returned";

    return normalActionable || officeExitActionable;
  }

  if (mode === "hrd") {
    // HRD can act on items approved by manager or pending hrd review
    return (
      status === "pending_hrd" ||
      status === "approved_by_manager" ||
      status === "revision_hrd" ||
      status === "verified_manager"
    );
  }

  return false;
}

export type OfferingTemplate = {
  id?: string;
  templateName: string;
  brandName: string;
  employmentType: "fulltime" | "internship" | "contract";
  referencePdfUrl?: string;
  htmlContent: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
};
