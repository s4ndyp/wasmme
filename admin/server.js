"use strict";

const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");
const fs = require("fs-extra");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || "/data";
const STAGING_DIR = path.join(DATA_DIR, "staging");
const PUBLISHED_DIR = path.join(DATA_DIR, "published");
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 256 * 1024 * 1024);

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function safeJoin(base, ...segments) {
  const resolved = path.resolve(base, ...segments);
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function isSafeZipEntry(entryName) {
  const normalized = entryName.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    return false;
  }
  return true;
}

async function ensureDirs() {
  await fs.ensureDir(STAGING_DIR);
  await fs.ensureDir(PUBLISHED_DIR);
}

async function dirSummary(dir) {
  const exists = await fs.pathExists(dir);
  if (!exists) {
    return { exists: false, fileCount: 0, totalBytes: 0, hasIndex: false };
  }

  let fileCount = 0;
  let totalBytes = 0;
  let hasIndex = false;

  async function walk(rel) {
    const abs = path.join(dir, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const ent of entries) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        await walk(childRel);
      } else if (ent.isFile()) {
        fileCount += 1;
        const stat = await fs.stat(path.join(dir, childRel));
        totalBytes += stat.size;
        if (childRel === "index.html" || childRel.endsWith("/index.html")) {
          hasIndex = true;
        }
        if (childRel === "index.html") {
          hasIndex = true;
        }
      }
    }
  }

  await walk("");
  hasIndex = hasIndex || (await fs.pathExists(path.join(dir, "index.html")));

  return { exists: true, fileCount, totalBytes, hasIndex };
}

async function extractZipToStaging(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  await fs.emptyDir(STAGING_DIR);

  let rootPrefix = null;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, "/");
    if (!isSafeZipEntry(name)) continue;
    const parts = name.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      rootPrefix = null;
      break;
    }
    const first = parts[0];
    if (rootPrefix === null) {
      rootPrefix = first;
    } else if (rootPrefix !== first) {
      rootPrefix = null;
      break;
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    let name = entry.entryName.replace(/\\/g, "/");
    if (!isSafeZipEntry(name)) continue;
    if (rootPrefix && name.startsWith(`${rootPrefix}/`)) {
      name = name.slice(rootPrefix.length + 1);
    } else if (rootPrefix && name === rootPrefix) {
      continue;
    }
    if (!name) continue;
    const dest = safeJoin(STAGING_DIR, name);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, entry.getData());
  }
}

async function copyTree(src, dest) {
  await fs.emptyDir(dest);
  await fs.copy(src, dest, {
    filter: (srcPath) => {
      const base = path.basename(srcPath);
      return base !== ".DS_Store";
    },
  });
}

async function publishStaging() {
  const staging = await dirSummary(STAGING_DIR);
  if (!staging.exists || staging.fileCount === 0) {
    const err = new Error("Geen bestanden in staging. Upload eerst een site.");
    err.status = 400;
    throw err;
  }

  const tempDir = path.join(DATA_DIR, ".published-next");
  await fs.remove(tempDir);
  await fs.copy(STAGING_DIR, tempDir);
  await fs.remove(PUBLISHED_DIR);
  await fs.move(tempDir, PUBLISHED_DIR);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/status", async (_req, res, next) => {
  try {
    const [staging, published] = await Promise.all([
      dirSummary(STAGING_DIR),
      dirSummary(PUBLISHED_DIR),
    ]);
    res.json({
      staging,
      published,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    });
  } catch (e) {
    next(e);
  }
});

app.post("/api/upload/zip", upload.single("archive"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Geen zip-bestand ontvangen (veld: archive)." });
      return;
    }
    await extractZipToStaging(req.file.buffer);
    const staging = await dirSummary(STAGING_DIR);
    res.json({ ok: true, staging });
  } catch (e) {
    next(e);
  }
});

app.post("/api/upload/files", upload.array("files", 500), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      res.status(400).json({ error: "Geen bestanden ontvangen (veld: files)." });
      return;
    }

    await fs.emptyDir(STAGING_DIR);
    const basePath = (req.body && req.body.basePath) || "";

    for (const file of files) {
      const relative = (file.originalname || "file").replace(/\\/g, "/");
      if (!isSafeZipEntry(relative)) {
        continue;
      }
      const dest = safeJoin(STAGING_DIR, basePath, relative);
      await fs.ensureDir(path.dirname(dest));
      await fs.writeFile(dest, file.buffer);
    }

    const staging = await dirSummary(STAGING_DIR);
    res.json({ ok: true, staging });
  } catch (e) {
    next(e);
  }
});

app.post("/api/staging/clear", async (_req, res, next) => {
  try {
    await fs.emptyDir(STAGING_DIR);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post("/api/publish", async (_req, res, next) => {
  try {
    await publishStaging();
    const published = await dirSummary(PUBLISHED_DIR);
    res.json({ ok: true, published, message: "Site gepubliceerd op poort 80." });
  } catch (e) {
    next(e);
  }
});

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message =
    status === 413
      ? "Bestand te groot."
      : err.message || "Interne serverfout";
  console.error(err);
  res.status(status).json({ error: message });
});

ensureDirs()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`WasmMe admin listening on ${PORT}, data at ${DATA_DIR}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
