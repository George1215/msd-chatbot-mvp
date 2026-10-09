import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_BODY_LIMIT = 3 * 1024 * 1024;
const extensions = {
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "audio/webm": ["webm"],
  "audio/mpeg": ["mp3"],
  "audio/wav": ["wav"],
  "audio/ogg": ["ogg"],
};
const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};

export function parseAttachment(body) {
  const value = z
    .object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(180)
        .regex(/^[^/\\\u0000-\u001f\u007f]+$/),
      mime: z.string().max(100),
      data: z
        .string()
        .min(4)
        .max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4),
      requestKey: z.string().min(20).max(100),
      text: z.string().trim().max(5000).default(""),
    })
    .parse(body);
  value.mime =
    { "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav" }[value.mime] ||
    value.mime;
  if (
    !extensions[value.mime]?.includes(
      value.name.split(".").at(-1).toLowerCase(),
    )
  )
    fail("attachment_type_not_allowed");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value.data,
    )
  )
    fail("invalid_attachment_encoding");
  const bytes = Buffer.from(value.data, "base64");
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES)
    fail("attachment_too_large", 413);
  if (bytes.toString("base64") !== value.data)
    fail("invalid_attachment_encoding");
  const start = (hex) =>
    bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex"));
  const ascii = (offset, length) =>
    bytes.toString("ascii", offset, offset + length);
  let matches = false;
  switch (value.mime) {
    case "application/pdf":
      matches = ascii(0, 5) === "%PDF-";
      break;
    case "image/png":
      matches = start("89504e470d0a1a0a");
      break;
    case "image/jpeg":
      matches = start("ffd8ff");
      break;
    case "image/gif":
      matches = ["GIF87a", "GIF89a"].includes(ascii(0, 6));
      break;
    case "image/webp":
      matches = ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
      break;
    case "video/mp4":
      matches = bytes.length >= 12 && ascii(4, 4) === "ftyp";
      break;
    case "video/webm":
    case "audio/webm":
      matches = start("1a45dfa3");
      break;
    case "audio/mpeg":
      matches =
        ascii(0, 3) === "ID3" ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
      break;
    case "audio/wav":
      matches = ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
      break;
    case "audio/ogg":
      matches = ascii(0, 4) === "OggS";
      break;
    case "text/plain": {
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        fail("attachment_content_mismatch");
      }
      matches =
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) &&
        !/<\s*(?:!doctype\s+html|html\b|svg\b|script\b|iframe\b|object\b|embed\b)/i.test(
          text,
        ) &&
        !start("4d5a") &&
        !start("7f454c46");
      break;
    }
  }
  if (!matches) fail("attachment_content_mismatch");
  return { ...value, size: bytes.length };
}

// Every conversation, message response and socket payload must use this projection.
// Attachment bytes remain in private persistence and the authorized download route.
export function safeMessage(message) {
  const { attachmentData, requestKey, ...safe } = message;
  if (message.attachment) {
    const { id, name, mime, size } = message.attachment;
    safe.attachment = { id, name, mime, size };
  }
  return safe;
}

export function attachmentDisposition(name) {
  const fallback = name.replace(/[^A-Za-z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
