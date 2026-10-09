import fs from "node:fs";
import crypto from "node:crypto";

// An exclusive ownership marker prevents the API and an offline operator command
// from overwriting each other's in-memory copy of the single-process JSON store.
export function acquireStoreLock(dataFile) {
  const lockPath = `${dataFile}.lock`;
  const owner = { pid: process.pid, nonce: crypto.randomUUID() };
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        `Store is locked: ${lockPath}. Stop the API before offline recovery. After a crash, verify the recorded PID is no longer running before removing this lock.`,
      );
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, JSON.stringify(owner));
  } catch (error) {
    fs.unlinkSync(lockPath);
    throw error;
  } finally {
    fs.closeSync(descriptor);
  }
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(lockPath, "utf8")).nonce === owner.nonce)
        fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT")
        process.stderr.write(
          "Could not release store lock; inspect it before restarting.\n",
        );
    }
  };
}
