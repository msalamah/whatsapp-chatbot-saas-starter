#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import "../src/config/env.js";
import { initializeDatabase } from "../src/db/client.js";
import { pruneExpiredData, getRetentionConfig } from "../src/services/dataRetentionService.js";
import { logger } from "../src/utils/logger.js";

async function run() {
  await initializeDatabase();
  const summary = await pruneExpiredData();
  const config = getRetentionConfig();
  logger.info("retention.prune.complete", "maintenance", { summary, config });
  console.log("Retention prune complete:", summary);
}

run().catch((err) => {
  console.error("Retention prune failed", err);
  process.exitCode = 1;
});
