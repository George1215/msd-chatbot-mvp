import fs from "node:fs";
import path from "node:path";
import { acquireStoreLock } from "@chat-msd/shared/file-lock";
export function credentialStore(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const release = acquireStoreLock(filename);
  let value;
  try {
    value = fs.existsSync(filename)
      ? JSON.parse(fs.readFileSync(filename, "utf8"))
      : null;
    if (value && (!value.installToken || !value.siteUrl || !value.apiOrigin))
      throw Error("Invalid host installation file");
  } catch (error) {
    release();
    throw error;
  }
  return {
    read: () => value,
    write(next) {
      const temporary = filename + ".tmp";
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, filename);
      value = next;
    },
    close: release,
  };
}
