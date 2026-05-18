import { type Firestore } from "firebase/firestore";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { sendNotification, sendHrdNotification } from "./notifications";

export type LeaveNotificationType =
  | "staff_submission"      // Staff submits, manager gets notified, staff gets submission success
  | "manager_approval"      // Manager approves, staff gets approval info, HRD gets pending final review
  | "manager_rejection"     // Manager rejects, staff gets rejection info
  | "manager_revision"      // Manager asks for revision, staff gets revision info
  | "hrd_approval"          // HRD approves, staff gets final approval, manager gets final approval
  | "hrd_rejection"         // HRD rejects, staff gets final rejection, manager gets final rejection
  | "hrd_revision"          // HRD asks for revision, staff gets revision info, manager gets revision info
  | "leave_start"           // Leave starts, staff gets active leave info
  | "leave_end"             // Leave ends, staff gets completion info
  | "handover_assignment";  // Handover person gets designated

export interface LeaveNotificationParams {
  employeeId: string;
  employeeName: string;
  managerId: string;
  managerName: string;
  handoverEmployeeId?: string;
  handoverEmployeeName?: string;
  startDate: Date | any;
  endDate: Date | any;
  reason?: string;
  notes?: string;
  requestId: string;
}

function formatDateString(dateVal: any): string {
  try {
    const d = dateVal && typeof dateVal.toDate === "function" ? dateVal.toDate() : new Date(dateVal);
    return format(d, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return String(dateVal);
  }
}

export async function sendLeaveNotification(
  firestore: Firestore,
  type: LeaveNotificationType,
  params: LeaveNotificationParams
) {
  const startStr = formatDateString(params.startDate);
  const endStr = formatDateString(params.endDate);

  switch (type) {
    case "staff_submission":
      // 1. Staff gets submission success
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Pengajuan Cuti Dikirim",
        message: "Pengajuan cuti Anda berhasil dikirim dan menunggu review Manager.",
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });

      // 2. Manager gets review pending alert
      await sendNotification(firestore, {
        userId: params.managerId,
        type: "recruitment_assignment",
        module: "employee",
        title: "Persetujuan Cuti Baru",
        message: `${params.employeeName} mengajukan cuti tanggal ${startStr} sampai ${endStr}.`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/manager/persetujuan-cuti",
        createdBy: "system"
      });

      // 3. Handover colleague gets alert
      if (params.handoverEmployeeId) {
        await sendNotification(firestore, {
          userId: params.handoverEmployeeId,
          type: "recruitment_assignment",
          module: "employee",
          title: "Tanggung Jawab Pengganti Cuti",
          message: `Anda ditunjuk sebagai pengganti sementara selama cuti ${params.employeeName} pada ${startStr} sampai ${endStr}.`,
          targetType: "user",
          targetId: params.requestId,
          actionUrl: "/admin/karyawan/pengajuan-cuti",
          createdBy: "system"
        });
      }
      break;

    case "manager_approval":
      // 1. Staff gets manager approval alert
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Disetujui Manager",
        message: "Pengajuan cuti Anda telah disetujui Manager dan menunggu review HRD.",
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });

      // 2. HRD gets final review notification
      await sendHrdNotification(firestore, {
        type: "status_update",
        module: "employee",
        title: "Persetujuan Cuti HRD",
        message: `Pengajuan cuti ${params.employeeName} telah disetujui Manager dan menunggu review HRD.`,
        targetType: "employee",
        targetId: params.requestId,
        actionUrl: "/admin/hrd/persetujuan-cuti"
      });
      break;

    case "manager_rejection":
      // Staff gets rejection message with reason
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Pengajuan Cuti Ditolak Manager",
        message: `Pengajuan cuti Anda ditolak Manager. Alasan: ${params.reason || "-"}`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });
      break;

    case "manager_revision":
      // Staff gets revision request with notes
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Revisi Cuti dari Manager",
        message: `Pengajuan cuti Anda membutuhkan revisi dari Manager. Catatan: ${params.notes || "-"}`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });
      break;

    case "hrd_approval":
      // 1. Staff gets final approval
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Pengajuan Cuti Disetujui",
        message: "Pengajuan cuti Anda telah disetujui HRD.",
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });

      // 2. Manager gets notification
      await sendNotification(firestore, {
        userId: params.managerId,
        type: "status_update",
        module: "employee",
        title: "Pengajuan Cuti Karyawan Selesai",
        message: `Pengajuan cuti ${params.employeeName} telah disetujui HRD.`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/manager/persetujuan-cuti",
        createdBy: "system"
      });
      break;

    case "hrd_rejection":
      // 1. Staff gets rejection with reason
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Pengajuan Cuti Ditolak HRD",
        message: `Pengajuan cuti Anda ditolak HRD. Alasan: ${params.reason || "-"}`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });

      // 2. Manager gets alert
      await sendNotification(firestore, {
        userId: params.managerId,
        type: "status_update",
        module: "employee",
        title: "Pengajuan Cuti Ditolak HRD",
        message: `Pengajuan cuti ${params.employeeName} ditolak HRD.`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/manager/persetujuan-cuti",
        createdBy: "system"
      });
      break;

    case "hrd_revision":
      // 1. Staff gets revision notes
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Revisi Cuti dari HRD",
        message: `Pengajuan cuti Anda membutuhkan revisi dari HRD. Catatan: ${params.notes || "-"}`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });

      // 2. Manager gets alert
      await sendNotification(firestore, {
        userId: params.managerId,
        type: "status_update",
        module: "employee",
        title: "Revisi Cuti Karyawan dari HRD",
        message: `Pengajuan cuti ${params.employeeName} membutuhkan revisi dari HRD.`,
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/manager/persetujuan-cuti",
        createdBy: "system"
      });
      break;

    case "leave_start":
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Cuti Berlangsung",
        message: "Cuti Anda sedang berlangsung mulai hari ini.",
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });
      break;

    case "leave_end":
      await sendNotification(firestore, {
        userId: params.employeeId,
        type: "status_update",
        module: "employee",
        title: "Cuti Selesai",
        message: "Cuti Anda telah selesai.",
        targetType: "user",
        targetId: params.requestId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: "system"
      });
      break;
  }
}
