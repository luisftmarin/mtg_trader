import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await pool.query("SELECT 1");
  console.log("DB connect: OK");

  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log("Tables:", tables.rows.map((r) => r.table_name).join(", ") || "(none)");

  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'friends' ORDER BY ordinal_position"
  );
  console.log("friends columns:", cols.rows.map((r) => r.column_name).join(", ") || "(table missing)");
} catch (e) {
  console.log("DB error:", e.message);
} finally {
  await pool.end();
}
