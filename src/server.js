import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import whatsappRouter from "./routes/whatsapp.js";
import tenantRouter from "./routes/tenants.js";
import { adminAuth } from "./middleware/adminAuth.js";
import { logger } from "./utils/logger.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.ADMIN_ALLOW_ORIGINS
  ? process.env.ADMIN_ALLOW_ORIGINS.split(",").map(origin => origin.trim()).filter(Boolean)
  : ["http://localhost:5173", "http://localhost:4173"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: false
}));

// JSON parsing with raw body capture for signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    if (req.method === "POST" && req.url.startsWith("/webhook")) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

// routes
app.use("/tenants", adminAuth, tenantRouter);
app.use("/", whatsappRouter);

app.listen(PORT, () => logger.info(`Webhook running on :${PORT}`));
