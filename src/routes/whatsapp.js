import express from "express";
import { verifyWebhook, verifySignature } from "../utils/verifySignature.js";
import { handleIncomingChange } from "../services/bookingService.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// GET /webhook - verification
router.get("/webhook", (req, res) => {
  const { ok, challenge } = verifyWebhook(req);
  if (ok) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// POST /webhook - inbound messages & statuses
router.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) {
      logger.warn("Invalid signature");
      return res.sendStatus(403);
    }
    const body = req.body;
    if (body.object !== "whatsapp_business_account") {
      return res.sendStatus(200);
    }
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        await handleIncomingChange(change);
      }
    }
  } catch (err) {
    logger.error("webhook error", err);
  }
  return res.sendStatus(200);
});

router.get("/", (_, res) => res.send("OK"));
export default router;
