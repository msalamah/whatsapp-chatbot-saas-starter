import express from "express";
import dotenv from "dotenv";
import getRawBody from "raw-body";
import whatsappRouter from "./routes/whatsapp.js";
import { logger } from "./utils/logger.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// raw body for signature verification
app.use(async (req, res, next) => {
  if (req.method === "POST" && req.url.startsWith("/webhook")) {
    try {
      req.rawBody = await getRawBody(req);
      next();
    } catch (e) {
      logger.error("Failed to read raw body", e);
      return res.sendStatus(400);
    }
  } else {
    next();
  }
});

// JSON parsing
app.use(express.json());

// routes
app.use("/", whatsappRouter);

app.listen(PORT, () => logger.info(`Webhook running on :${PORT}`));
