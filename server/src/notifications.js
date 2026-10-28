import { pool } from "./db.js";
import { settingAllows } from "./profileSettings.js";

export async function notify(friendId, kind, payload) {
  if (!friendId || friendId === payload?.fromId) return;
  const { rows } = await pool.query("SELECT settings FROM friends WHERE id = $1", [friendId]);
  if (!settingAllows(rows[0]?.settings, kind)) return;
  await pool.query("INSERT INTO notifications (friend_id, kind, payload) VALUES ($1, $2, $3)", [
    friendId,
    kind,
    payload,
  ]);
}

export async function listNotifications(friendId) {
  const { rows } = await pool.query(
    `SELECT id, kind, payload, read_at, created_at
     FROM notifications
     WHERE friend_id = $1
     ORDER BY created_at DESC
     LIMIT 80`,
    [friendId]
  );
  return rows;
}

export async function markAllRead(friendId) {
  await pool.query("UPDATE notifications SET read_at = now() WHERE friend_id = $1 AND read_at IS NULL", [friendId]);
}

export async function markRead(friendId, id) {
  const { rows } = await pool.query(
    "UPDATE notifications SET read_at = now() WHERE id = $1 AND friend_id = $2 RETURNING id",
    [id, friendId]
  );
  if (!rows.length) {
    const err = new Error("Notification not found.");
    err.status = 404;
    throw err;
  }
}
