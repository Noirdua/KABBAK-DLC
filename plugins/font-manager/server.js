"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STACKS = Object.freeze(["main", "display", "arabic", "enochian", "cjk"]);
const SCRIPTS = Object.freeze(["latin", "hebrew", "greek", "arabic", "enochian", "cjk", "custom"]);
const SCRIPT_RANGES = Object.freeze({
  latin: "U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F",
  hebrew: "U+0590-05FF,U+FB1D-FB4F",
  greek: "U+0370-03FF,U+1F00-1FFF",
  arabic: "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF",
  enochian: "U+1680-169F",
  cjk: "U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF",
  custom: ""
});
const FONT_TYPES = Object.freeze({
  ".ttf": { format: "truetype", contentType: "font/ttf", magic: ["00010000", "74727565", "74797031"] },
  ".otf": { format: "opentype", contentType: "font/otf", magic: ["4f54544f"] },
  ".woff": { format: "woff", contentType: "font/woff", magic: ["774f4646"] },
  ".woff2": { format: "woff2", contentType: "font/woff2", magic: ["774f4632"] }
});
const MAX_FONT_BYTES = 20 * 1024 * 1024;
const MAX_FONTS = 64;
const MAX_ASSIGNMENTS = 20;
const UNICODE_RANGE_PATTERN = /^U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f?]{1,6})?(?:\s*,\s*U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f?]{1,6})?)*$/;

function cssFamily(value) {
  const family = String(value || "").trim().replace(/\s+/g, " ");
  if (!family || family.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(family)) {
    return "";
  }
  return family;
}

function unicodeRange(value) {
  const range = String(value || "").trim();
  if (!range) return "";
  if (range.length > 240 || !UNICODE_RANGE_PATTERN.test(range)) {
    return "";
  }
  return range;
}

function clampWeight(value) {
  const weight = Number(value);
  if (!Number.isFinite(weight)) return 400;
  return Math.max(100, Math.min(900, Math.trunc(weight / 100) * 100));
}

function fontStyle(value) {
  return String(value || "").toLowerCase() === "italic" ? "italic" : "normal";
}

function safeSlug(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "font";
}

function decodeFontData(value) {
  const raw = String(value || "");
  const match = raw.match(/^data:([^;,]+)?(?:;charset=[^;]+)?;base64,([\s\S]+)$/i);
  const encoded = match ? match[2] : raw;
  if (!encoded) {
    return null;
  }
  try {
    return Buffer.from(encoded, "base64");
  } catch (_error) {
    return null;
  }
}

function hasFontMagic(buffer, extension) {
  const info = FONT_TYPES[extension];
  if (!info || buffer.length < 4) return false;
  return info.magic.includes(buffer.subarray(0, 4).toString("hex"));
}

module.exports = function register(router, ctx) {
  const { createHttpError, createNotFoundError } = ctx;
  const { requireApiKey } = ctx.requireApi("src/middleware/api-key");
  const {
    ADMIN_API_MANAGEMENT_CAPABILITY,
    requireApiClientCapability
  } = ctx.requireApi("src/middleware/api-client-capability");

  const adminOnly = requireApiClientCapability({
    capabilityName: "adminApiManagement",
    anyRoles: ADMIN_API_MANAGEMENT_CAPABILITY.anyRoles,
    anyScopes: ADMIN_API_MANAGEMENT_CAPABILITY.anyScopes,
    errorCode: "insufficient_admin_capability",
    errorMessage: "This route requires the admin role or api:admin scope."
  });

  const fontsDir = path.join(ctx.mediaDir, "fonts");
  const fontsPath = path.join(ctx.dataDir, "fonts.json");

  function readFonts() {
    try {
      const parsed = JSON.parse(fs.readFileSync(fontsPath, "utf8"));
      return Array.isArray(parsed?.fonts) ? parsed.fonts.filter((font) => font && font.file && font.id) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeFonts(fonts) {
    fs.mkdirSync(ctx.dataDir, { recursive: true });
    fs.writeFileSync(fontsPath, `${JSON.stringify({ version: 1, fonts }, null, 2)}\n`, "utf8");
  }

  function publicFont(font) {
    const type = FONT_TYPES[path.extname(font.file).toLowerCase()];
    return {
      id: font.id,
      family: font.family,
      file: font.file,
      format: type?.format || "truetype",
      contentType: type?.contentType || "application/octet-stream",
      script: font.script,
      unicodeRange: font.unicodeRange || "",
      weight: font.weight,
      style: font.style,
      size: font.size,
      createdAt: font.createdAt
    };
  }

  function normalizeAssignments(raw, validIds) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const result = {};
    for (const stack of STACKS) {
      const list = Array.isArray(source[stack]) ? source[stack] : [];
      const seen = new Set();
      result[stack] = [];
      for (const value of list) {
        const id = String(value || "").trim();
        if (!id || seen.has(id) || !validIds.has(id)) continue;
        seen.add(id);
        result[stack].push(id);
        if (result[stack].length >= MAX_ASSIGNMENTS) break;
      }
    }
    return result;
  }

  function readAssignments(fonts) {
    const config = ctx.readConfig();
    return normalizeAssignments(config?.assignments, new Set(fonts.map((font) => font.id)));
  }

  function writeAssignments(assignments) {
    const config = ctx.readConfig();
    const next = {
      ...(config && typeof config === "object" && !Array.isArray(config) ? config : {}),
      assignments
    };
    ctx.writeConfig(next);
    return assignments;
  }

  function findFont(fileName) {
    const name = path.basename(String(fileName || ""));
    return readFonts().find((font) => font.file === name) || null;
  }

  function uploadFont(body) {
    const originalName = path.basename(String(body?.fileName || ""));
    const extension = path.extname(originalName).toLowerCase();
    const type = FONT_TYPES[extension];
    if (!type) {
      throw createHttpError(400, "unsupported_font_type", "Upload a .woff2, .woff, .ttf, or .otf font.");
    }
    const family = cssFamily(body?.family) || cssFamily(path.basename(originalName, extension));
    if (!family) {
      throw createHttpError(400, "invalid_family", "The font family name may use letters, numbers, spaces, hyphens, and underscores.");
    }
    const script = SCRIPTS.includes(String(body?.script || "").toLowerCase())
      ? String(body.script).toLowerCase()
      : "latin";
    const range = unicodeRange(body?.unicodeRange) || (script === "custom" ? "" : SCRIPT_RANGES[script]);
    if (body?.unicodeRange && !unicodeRange(body.unicodeRange)) {
      throw createHttpError(400, "invalid_unicode_range", "Use a CSS unicode-range such as U+0590-05FF.");
    }
    const buffer = decodeFontData(body?.data);
    if (!buffer || !buffer.length) {
      throw createHttpError(400, "invalid_font_data", "Upload the font as a base64 data URL.");
    }
    if (buffer.length > MAX_FONT_BYTES) {
      throw createHttpError(413, "font_too_large", "Fonts must be 20 MB or smaller.");
    }
    if (!hasFontMagic(buffer, extension)) {
      throw createHttpError(400, "invalid_font_data", "That file does not look like a valid font.");
    }

    const fonts = readFonts();
    if (fonts.length >= MAX_FONTS) {
      throw createHttpError(409, "too_many_fonts", `The font library is limited to ${MAX_FONTS} files.`);
    }

    const idBase = `${safeSlug(family)}-${Date.now().toString(36)}`;
    let id = idBase;
    let suffix = 2;
    while (fonts.some((font) => font.id === id)) {
      id = `${idBase}-${suffix}`;
      suffix += 1;
    }
    const file = `${id}${extension}`;
    const absolute = path.join(fontsDir, file);
    fs.mkdirSync(fontsDir, { recursive: true });
    fs.writeFileSync(absolute, buffer);

    const font = {
      id,
      family,
      file,
      script,
      unicodeRange: range,
      weight: clampWeight(body?.weight),
      style: fontStyle(body?.style),
      size: buffer.length,
      createdAt: new Date().toISOString()
    };
    const nextFonts = fonts.concat(font);
    try {
      writeFonts(nextFonts);
    } catch (error) {
      try {
        fs.rmSync(absolute, { force: true });
      } catch (_cleanupError) {}
      throw error;
    }
    ctx.log("info", "Font uploaded", { id: font.id, family: font.family, file: font.file, size: font.size });
    return { font: publicFont(font), fonts: nextFonts.map(publicFont) };
  }

  function deleteFont(fileName) {
    const name = path.basename(String(fileName || ""));
    const fonts = readFonts();
    const font = fonts.find((entry) => entry.file === name);
    if (!font) {
      throw createNotFoundError("font_not_found", "Font not found.");
    }
    try {
      fs.rmSync(path.join(fontsDir, font.file), { force: true });
    } catch (error) {
      throw createHttpError(500, "font_delete_failed", `Could not delete the font: ${error.message}`);
    }
    const nextFonts = fonts.filter((entry) => entry.id !== font.id);
    writeFonts(nextFonts);
    const assignments = normalizeAssignments(
      readAssignments(nextFonts),
      new Set(nextFonts.map((entry) => entry.id))
    );
    writeAssignments(assignments);
    ctx.log("info", "Font deleted", { id: font.id, family: font.family, file: font.file });
    return { fonts: nextFonts.map(publicFont), assignments };
  }

  router.get("/fonts", requireApiKey, (_request, response) => {
    const fonts = readFonts()
      .slice()
      .sort((left, right) => String(left.family).localeCompare(String(right.family)) || String(left.file).localeCompare(String(right.file)));
    response.apiSuccess({
      fonts: fonts.map(publicFont),
      assignments: readAssignments(fonts),
      stacks: STACKS,
      maxBytes: MAX_FONT_BYTES,
      maxFonts: MAX_FONTS
    });
  });

  router.get("/settings", requireApiKey, (_request, response) => {
    const fonts = readFonts();
    response.apiSuccess({ assignments: readAssignments(fonts), stacks: STACKS });
  });

  router.post("/settings", requireApiKey, adminOnly, (request, response) => {
    const fonts = readFonts();
    const assignments = normalizeAssignments(
      request.body?.assignments,
      new Set(fonts.map((font) => font.id))
    );
    response.apiSuccess({ assignments: writeAssignments(assignments), stacks: STACKS });
  });

  router.post("/fonts", requireApiKey, adminOnly, (request, response) => {
    response.status(201).apiSuccess(uploadFont(request.body || {}));
  });

  router.get("/fonts/:file", requireApiKey, (request, response, next) => {
    try {
      const font = findFont(request.params.file);
      if (!font) {
        throw createNotFoundError("font_not_found", "Font not found.");
      }
      const absolute = path.join(fontsDir, font.file);
      if (!fs.existsSync(absolute)) {
        throw createNotFoundError("font_not_found", "Font file is missing.");
      }
      const type = FONT_TYPES[path.extname(font.file).toLowerCase()];
      response.setHeader("Content-Type", type?.contentType || "application/octet-stream");
      response.setHeader("Cache-Control", "private, max-age=86400");
      response.setHeader("X-Content-Type-Options", "nosniff");
      const stream = fs.createReadStream(absolute);
      stream.on("error", next);
      stream.pipe(response);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/fonts/:file", requireApiKey, adminOnly, (request, response) => {
    response.apiSuccess(deleteFont(request.params.file));
  });
};
