// Client-side device fingerprint generator
// This collects system characteristics to create a persistent device ID
// that survives browser switches on the same computer.

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      return `${vendor}|${renderer}`;
    }
    return 'no-debug-info';
  } catch {
    return 'webgl-error';
  }
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-2d';
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('PeridotFaucet', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('DeviceID', 4, 27);
    return canvas.toDataURL().slice(-32);
  } catch {
    return 'canvas-error';
  }
}

export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server';

  // Check if we already generated and cached one
  const cached = localStorage.getItem('peridot_device_fp');
  if (cached) return cached;

  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width + 'x' + screen.height,
    screen.colorDepth.toString(),
    (navigator.hardwareConcurrency || '').toString(),
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || '').toString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    'ontouchstart' in window ? 'touch' : 'no-touch',
    getWebGLFingerprint(),
    getCanvasFingerprint(),
  ].join('::');

  const fp = hashString(components) + hashString(components.split('').reverse().join(''));
  localStorage.setItem('peridot_device_fp', fp);
  return fp;
}
