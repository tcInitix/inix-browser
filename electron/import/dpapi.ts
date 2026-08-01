import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function isDpapiAvailable(): boolean {
  return process.platform === "win32";
}

/** Decrypt data protected with Windows DPAPI (CurrentUser scope). */
export function dpapiUnprotect(data: Buffer): Buffer {
  if (process.platform !== "win32") {
    throw new Error("DPAPI is only available on Windows");
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpIn = path.join(os.tmpdir(), `inix-dpapi-in-${id}.bin`);
  const tmpOut = path.join(os.tmpdir(), `inix-dpapi-out-${id}.bin`);
  const script = `
Add-Type -AssemblyName System.Security
$in = '${tmpIn.replace(/'/g, "''")}'
$out = '${tmpOut.replace(/'/g, "''")}'
$bytes = [IO.File]::ReadAllBytes($in)
$dec = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($out, $dec)
`;

  try {
    fs.writeFileSync(tmpIn, data);
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "pipe",
      timeout: 15000,
    });
    return fs.readFileSync(tmpOut);
  } finally {
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(tmpOut);
    } catch {
      // ignore
    }
  }
}
