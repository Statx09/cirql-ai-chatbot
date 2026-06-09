export async function runmigrate_DISABLED() {
  if (!process.env.POSTGRES_URL) {
    console.log("DB disabled (MVP mode)");
    return;
  }

  if (process.env.POSTGRES_URL.includes("127.0.0.1")) {
    console.log("Skipping local DB on Vercel");
    return;
  }

  console.log("Skipping migrations in MVP build");
}
