import { prisma, type Db } from "../db";

export async function notifyUser(
  db: Db,
  n: { userId: string; workspaceId?: string; type: string; title: string; body?: string; href?: string },
) {
  await db.notification.create({ data: n });
}

/** Notifications are user-owned: every query is scoped to the caller's id. */
export async function listNotifications(userId: string, take = 20) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true, type: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}
