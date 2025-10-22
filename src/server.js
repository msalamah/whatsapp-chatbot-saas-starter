import express from "express";
import dotenv from "dotenv";
import whatsappRouter from "./routes/whatsapp.js";
import { logger } from "./utils/logger.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// JSON parsing with raw body capture for signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    if (req.method === "POST" && req.url.startsWith("/webhook")) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

// routes
app.use("/", whatsappRouter);

app.listen(PORT, () => logger.info(`Webhook running on :${PORT}`));
