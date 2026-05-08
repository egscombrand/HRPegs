import {
  addDoc,
  collection,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type { Notification } from "./types";

export async function sendNotification(
  firestore: Firestore,
  notification: Omit<Notification, "id" | "createdAt" | "isRead">,
) {
  const notificationsRef = collection(
    firestore,
    "users",
    notification.userId,
    "notifications",
  );

  await addDoc(notificationsRef, {
    ...notification,
    isRead: false,
    createdAt: Timestamp.now(),
  });
}

export async function sendHrdNotification(
  firestore: Firestore,
  notification: Omit<
    Omit<Notification, "id" | "createdAt" | "isRead" | "userId">,
    "targetType"
  > & { targetType: "user" | "job" | "application" | "employee" },
) {
  const notificationsRef = collection(firestore, "hrd_notifications");

  await addDoc(notificationsRef, {
    ...notification,
    isRead: false,
    createdAt: Timestamp.now(),
  });
}
