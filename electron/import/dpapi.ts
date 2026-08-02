import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function isDpapiAvailable(): boolean {
  return process.platform === "win32";
}

function runPowerShell(script: string, timeoutMs = 60_000): void {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: "pipe",
    timeout: timeoutMs,
  });
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
    runPowerShell(script, 15_000);
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

/**
 * Decrypt many DPAPI blobs in one PowerShell invocation (avoids spawning per password).
 * Returns null entries where decryption failed.
 */
export function dpapiUnprotectBatch(blobs: Buffer[]): Array<Buffer | null> {
  if (process.platform !== "win32") {
    throw new Error("DPAPI is only available on Windows");
  }
  if (blobs.length === 0) return [];
  if (blobs.length === 1) {
    try {
      return [dpapiUnprotect(blobs[0])];
    } catch {
      return [null];
    }
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpIn = path.join(os.tmpdir(), `inix-dpapi-batch-in-${id}.json`);
  const tmpOut = path.join(os.tmpdir(), `inix-dpapi-batch-out-${id}.json`);
  const script = `
Add-Type -AssemblyName System.Security
$in = '${tmpIn.replace(/'/g, "''")}'
$out = '${tmpOut.replace(/'/g, "''")}'
$items = Get-Content -LiteralPath $in -Raw -Encoding UTF8 | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[string]
foreach ($b64 in $items) {
  if ($null -eq $b64 -or $b64 -eq '') {
    [void]$results.Add($null)
    continue
  }
  try {
    $bytes = [Convert]::FromBase64String([string]$b64)
    $dec = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [void]$results.Add([Convert]::ToBase64String($dec))
  } catch {
    [void]$results.Add($null)
  }
}
$results | ConvertTo-Json -Compress | Set-Content -LiteralPath $out -Encoding UTF8 -NoNewline
`;

  try {
    const payload = blobs.map((blob) => blob.toString("base64"));
    fs.writeFileSync(tmpIn, JSON.stringify(payload), "utf8");
    runPowerShell(script, 120_000);
    const raw = fs.readFileSync(tmpOut, "utf8").trim();
    if (!raw) return blobs.map(() => null);

    const parsed = JSON.parse(raw) as string | (string | null)[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((entry) => {
      if (entry == null || entry === "") return null;
      try {
        return Buffer.from(entry, "base64");
      } catch {
        return null;
      }
    });
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
