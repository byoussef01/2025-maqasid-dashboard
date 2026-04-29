import { createClient } from "@libsql/client";
import { loadEnvConfig } from "@next/env";

import { rebuildReportingCache, ensureReportingCacheSchema } from "../lib/reports/cache";
import { getTursoConfig, getTursoHost } from "../lib/db/turso-config";

async function main() {
  loadEnvConfig(process.cwd());

  const { url, authToken } = getTursoConfig();
  const client = createClient({ url, authToken });

  await ensureReportingCacheSchema(client);
  await rebuildReportingCache(client);

  const counts = await client.execute(`
    SELECT
      (SELECT COUNT(*) FROM reporting_transactions) as reportingTransactions,
      (SELECT COUNT(*) FROM reporting_bucket_entries) as reportingBucketEntries
  `);

  const row = (counts.rows[0] ?? {}) as Record<string, unknown>;

  console.log(`Rebuilt reporting cache on ${getTursoHost()}`);
  console.log(`reporting_transactions: ${Number(row.reportingTransactions ?? 0)}`);
  console.log(`reporting_bucket_entries: ${Number(row.reportingBucketEntries ?? 0)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
