import { useEffect, useMemo, useState } from "react";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*_-+=?";

interface Options {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

function generate(opts: Options): string {
  let alphabet = "";
  if (opts.lower) alphabet += LOWER;
  if (opts.upper) alphabet += UPPER;
  if (opts.digits) alphabet += DIGITS;
  if (opts.symbols) alphabet += SYMBOLS;
  if (!alphabet) return "";

  const out: string[] = [];
  const buffer = new Uint32Array(opts.length);
  crypto.getRandomValues(buffer);
  for (let i = 0; i < opts.length; i++) {
    out.push(alphabet[buffer[i] % alphabet.length]);
  }
  // Ensure at least one of each enabled class
  const groups: Array<{ enabled: boolean; chars: string }> = [
    { enabled: opts.lower, chars: LOWER },
    { enabled: opts.upper, chars: UPPER },
    { enabled: opts.digits, chars: DIGITS },
    { enabled: opts.symbols, chars: SYMBOLS },
  ];
  const rand = new Uint32Array(groups.length);
  crypto.getRandomValues(rand);
  let slot = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.enabled) continue;
    const c = g.chars[rand[i] % g.chars.length];
    out[slot % out.length] = c;
    slot++;
  }
  return out.join("");
}

function scoreStrength(pw: string): { label: string; percent: number; color: string } {
  const len = pw.length;
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/[0-9]/.test(pw)) variety++;
  if (/[^a-zA-Z0-9]/.test(pw)) variety++;
  const bits = Math.min(100, Math.round(len * variety * 3.5));
  if (bits >= 80) return { label: "Strong", percent: bits, color: "#2dd4bf" };
  if (bits >= 55) return { label: "Good", percent: bits, color: "#a3e635" };
  if (bits >= 35) return { label: "Fair", percent: bits, color: "#facc15" };
  return { label: "Weak", percent: Math.max(10, bits), color: "#f87171" };
}

interface PasswordGeneratorProps {
  onUse?: (password: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

export function PasswordGenerator({ onUse, onClose, compact = false }: PasswordGeneratorProps) {
  const [opts, setOpts] = useState<Options>({
    length: 20,
    upper: true,
    lower: true,
    digits: true,
    symbols: true,
  });
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const regen = () => {
    setPassword(generate(opts));
    setCopied(false);
  };

  useEffect(() => {
    setPassword(generate(opts));
  }, [opts]);

  const strength = useMemo(() => scoreStrength(password), [password]);

  const copy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`password-generator${compact ? " compact" : ""}`}>
      <div className="password-generator-output">
        <input
          className="password-generator-value"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          spellCheck={false}
          readOnly={false}
        />
        <button type="button" className="password-generator-btn" onClick={regen} title="Regenerate">
          ↻
        </button>
        <button type="button" className="password-generator-btn" onClick={copy} title="Copy">
          {copied ? "✓" : "⎘"}
        </button>
      </div>
      <div className="password-generator-strength">
        <div className="password-generator-strength-bar">
          <div
            className="password-generator-strength-fill"
            style={{ width: `${strength.percent}%`, background: strength.color }}
          />
        </div>
        <span className="password-generator-strength-label" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      <div className="password-generator-controls">
        <label className="password-generator-length">
          <span>Length: {opts.length}</span>
          <input
            type="range"
            min={8}
            max={64}
            value={opts.length}
            onChange={(e) => setOpts((o) => ({ ...o, length: parseInt(e.target.value, 10) }))}
          />
        </label>
        <div className="password-generator-checks">
          <label>
            <input
              type="checkbox"
              checked={opts.upper}
              onChange={(e) => setOpts((o) => ({ ...o, upper: e.target.checked }))}
            />
            A-Z
          </label>
          <label>
            <input
              type="checkbox"
              checked={opts.lower}
              onChange={(e) => setOpts((o) => ({ ...o, lower: e.target.checked }))}
            />
            a-z
          </label>
          <label>
            <input
              type="checkbox"
              checked={opts.digits}
              onChange={(e) => setOpts((o) => ({ ...o, digits: e.target.checked }))}
            />
            0-9
          </label>
          <label>
            <input
              type="checkbox"
              checked={opts.symbols}
              onChange={(e) => setOpts((o) => ({ ...o, symbols: e.target.checked }))}
            />
            !@#
          </label>
        </div>
      </div>
      {(onUse || onClose) && (
        <div className="password-generator-actions">
          {onClose && (
            <button type="button" className="permission-deny" onClick={onClose}>
              Close
            </button>
          )}
          {onUse && (
            <button type="button" className="permission-allow" onClick={() => onUse(password)}>
              Use this password
            </button>
          )}
        </div>
      )}
    </div>
  );
}
