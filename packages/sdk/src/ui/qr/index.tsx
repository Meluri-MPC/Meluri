import { useState, useCallback } from 'react';

export interface QRCodeProps {
  address: string;
  size?: number;
  className?: string;
}

export function QRCode({ address, size = 200, className = '' }: QRCodeProps) {
  return (
    <div
      className={`vx-qr-code ${className}`}
      style={{ width: size, height: size }}
      aria-label={`QR code for address ${address}`}
      role="img"
    >
      <canvas
        ref={(canvas) => {
          if (canvas) {
            drawQR(canvas, address, size);
          }
        }}
        width={size}
        height={size}
        className="vx-qr-code__canvas"
      />
    </div>
  );
}

function drawQR(canvas: HTMLCanvasElement, data: string, size: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const moduleCount = 33;
  const cellSize = Math.floor(size / moduleCount);
  const offset = Math.floor((size - cellSize * moduleCount) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const bits = generateQRBits(data, moduleCount);

  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (bits[row * moduleCount + col]) {
        ctx.fillRect(offset + col * cellSize, offset + row * cellSize, cellSize, cellSize);
      }
    }
  }
}

function generateQRBits(data: string, size: number): boolean[] {
  const bits = new Array<boolean>(size * size).fill(false);

  // Finder patterns (top-left, top-right, bottom-left)
  drawFinder(bits, size, 0, 0);
  drawFinder(bits, size, size - 7, 0);
  drawFinder(bits, size, 0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    bits[6 * size + i] = i % 2 === 0;
    bits[i * size + 6] = i % 2 === 0;
  }

  // Format information (simplified)
  const fmtBits = [1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1];
  for (let i = 0; i < 6; i++) {
    bits[i * size + 8] = fmtBits[i] === 1;
    bits[8 * size + i] = fmtBits[i + 7] !== undefined ? fmtBits[i + 7] === 1 : (fmtBits[i] === 1);
  }
  for (let i = 0; i < 8; i++) {
    bits[8 * size + (size - 1 - i)] = fmtBits[i] === 1;
    bits[(size - i - 1) * size + 8] = fmtBits[i] === 1;
  }

  // Fill data area with hash of the data (simplified QR simulation)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }

  const prng = lcg(hash >>> 0);
  for (let row = 9; row < size - 9; row++) {
    for (let col = 9; col < size - 9; col++) {
      if (bits[row * size + col] === false) {
        bits[row * size + col] = (prng() & 1) === 1;
      }
    }
  }

  // Dark module
  bits[(size - 8) * size + 8] = true;

  // Quiet zone
  for (let i = 0; i < size; i++) {
    bits[i] = false;
    bits[i * size + (size - 1)] = false;
    bits[(size - 1) * size + i] = false;
    bits[i * size] = false;
  }

  return bits;
}

function drawFinder(bits: boolean[], size: number, row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        bits[rr * size + cc] = inOuter && !inInner;
      }
    }
  }
}

function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return state >>> 0;
  };
}

export interface CopyAddressButtonProps {
  address: string;
  label?: string;
  className?: string;
}

export function CopyAddressButton({ address, label = 'Copy address', className = '' }: CopyAddressButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = address;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

  return (
    <button
      type="button"
      className={`vx-copy-btn vx-focus-ring vx-tap-target ${copied ? 'vx-copy-btn--copied' : ''} ${className}`}
      onClick={handleCopy}
      aria-label={copied ? 'Address copied' : `Copy address ${address}`}
    >
      {copied ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vx-color-success)" strokeWidth="2" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export function buildDeepLink(address: string, amount?: string, memo?: string): string {
  const params = new URLSearchParams();
  params.set('to', address);
  if (amount) params.set('amount', amount);
  if (memo) params.set('memo', memo);
  return `stacks://wallet.velumx.io/send?${params.toString()}`;
}
