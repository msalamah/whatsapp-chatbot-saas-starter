import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import whatsappRouter from "./routes/whatsapp.js";
import tenantRouter from "./routes/tenants.js";
import { adminAuth } from "./middleware/adminAuth.js";

dotenv.config();

export function createApp() {
  const app = express();

  const allowedOrigins = process.env.ADMIN_ALLOW_ORIGINS
    ? process.env.ADMIN_ALLOW_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
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

  app.use(express.json({
    verify: (req, _res, buf) => {
      if (req.method === "POST" && req.url.startsWith("/webhook")) {
        req.rawBody = Buffer.from(buf);
      }
    }
  }));

  app.use("/tenants", adminAuth, tenantRouter);
  app.use("/", whatsappRouter);

  return app;
}

const app = createApp();
export default app;
