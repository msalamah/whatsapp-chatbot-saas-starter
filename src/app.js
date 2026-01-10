import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import whatsappRouter from "./routes/whatsapp.js";
import tenantRouter from "./routes/tenants.js";
import ownerPortalRouter from "./routes/ownerPortal.js";
import publicRouter from "./routes/publicBooking.js";
import { adminAuth } from "./middleware/adminAuth.js";
import { initializeDatabase } from "./db/client.js";
import "./config/env.js";

dotenv.config();
await initializeDatabase();

export function createApp() {
  const app = express();

  const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:4173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5180",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  const envOrigins = process.env.ADMIN_ALLOW_ORIGINS
    ? process.env.ADMIN_ALLOW_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

  app.use(cors({
    origin: (origin, callback) => {
      // allow same-origin and non-browser requests
      if (!origin) return callback(null, true);
      // wildcard allowance
      if (allowedOrigins.includes("*")) return callback(null, true);
      // exact match
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // subdomain match when allowed origin starts with a dot (e.g. .example.com)
      const subdomainAllowed = allowedOrigins.some((o) => o.startsWith(".") && origin.endsWith(o));
      if (subdomainAllowed) return callback(null, true);
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

  // Serve built static assets (admin/owner bundles, public assets)
  app.use(express.static("public"));

  app.use("/tenants", adminAuth, tenantRouter);
  app.use("/owner", ownerPortalRouter);
  // Public booking APIs (CORS open)
  app.use("/public", cors({ origin: true }), publicRouter);
  app.use("/", whatsappRouter);

  return app;
}

const app = createApp();
export default app;
