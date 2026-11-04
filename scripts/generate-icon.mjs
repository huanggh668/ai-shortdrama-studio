import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = path.resolve('build/icon.png')
const SIZE = 1024
const SS = 2
const W = SIZE * SS

function lerp(a, b, t) {
  return a + (b - a) * t
}

function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
  return dx * dx + dy * dy <= r * r
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function insideCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

const full = new Uint8Array(W * W * 4)

for (let y = 0; y < W; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const index = (y * W + x) * 4
    if (!insideRoundRect(x, y, 0, 0, W - 1, W - 1, 220 * SS)) continue

    const t = (x / W) * 0.55 + (y / W) * 0.45
    let [r, g, b] = hslToRgb(lerp(260, 390, t), 0.72, lerp(0.56, 0.52, t))

    const cx = x - W * 0.28
    const cy = y - W * 0.22
    const glow = Math.max(0, 1 - Math.sqrt(cx * cx + cy * cy) / (W * 0.62))
    r = Math.min(255, r + glow * 22)
    g = Math.min(255, g + glow * 16)
    b = Math.min(255, b + glow * 12)

    const screen = insideRoundRect(
      x,
      y,
      W * 0.225,
      W * 0.26,
      W * 0.775,
      W * 0.745,
      W * 0.065
    )
    if (screen) {
      r = 11
      g = 14
      b = 20
    }

    const play = insideTriangle(
      x,
      y,
      W * 0.43,
      W * 0.375,
      W * 0.43,
      W * 0.625,
      W * 0.64,
      W * 0.5
    )
    if (play) {
      r = 250
      g = 250
      b = 252
    }

    if (insideRoundRect(x, y, W * 0.335, W * 0.665, W * 0.545, W * 0.695, W * 0.015)) {
      r = 245
      g = 165
      b = 36
    }
    if (insideRoundRect(x, y, W * 0.335, W * 0.715, W * 0.47, W * 0.745, W * 0.015)) {
      r = 200
      g = 205
      b = 214
    }

    if (insideCircle(x, y, W * 0.79, W * 0.215, W * 0.036)) {
      r = 255
      g = 220
      b = 150
    }

    full[index] = Math.round(r)
    full[index + 1] = Math.round(g)
    full[index + 2] = Math.round(b)
    full[index + 3] = 255
  }
}

const rgba = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const src = ((y * SS + sy) * W + (x * SS + sx)) * 4
        r += full[src]
        g += full[src + 1]
        b += full[src + 2]
        a += full[src + 3]
      }
    }
    const count = SS * SS
    const dst = (y * SIZE + x) * 4
    rgba[dst] = Math.round(r / count)
    rgba[dst + 1] = Math.round(g / count)
    rgba[dst + 2] = Math.round(b / count)
    rgba[dst + 3] = Math.round(a / count)
  }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i]
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuffer, data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, png)
console.log(`icon written: ${OUT} (${(png.length / 1024).toFixed(1)} KB)`)
