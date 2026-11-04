const PALETTES = [
  { bg: '#0b0e14', a: '#231448', b: '#0b0e14', accent: '#f5a524' },
  { bg: '#071318', a: '#0d2f3a', b: '#071318', accent: '#67e8f9' },
  { bg: '#14090a', a: '#3a1113', b: '#0b0708', accent: '#fb7185' },
  { bg: '#08120d', a: '#123326', b: '#08120d', accent: '#4ade80' },
  { bg: '#100a1c', a: '#2a1454', b: '#100a1c', accent: '#c084fc' },
  { bg: '#141008', a: '#3a2a10', b: '#141008', accent: '#facc15' }
]

const FONT_STACK =
  "'PingFang SC','Microsoft YaHei','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC',sans-serif"

const SERIF_STACK =
  "'Songti SC','SimSun','Noto Serif CJK SC','Source Han Serif SC',serif"

export interface KeyframeOptions {
  width: number
  height: number
  title: string
  subtitle: string
  body: string
  tag: string
  number: string
  seed: number
}

export function keyframeHtml(options: KeyframeOptions): string {
  const palette = PALETTES[Math.abs(options.seed) % PALETTES.length]
  const vertical = options.height > options.width
  const pad = vertical ? 72 : 56
  const titleSize = vertical ? 78 : 62
  const bodySize = vertical ? 34 : 28
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${options.width}px;height:${options.height}px;overflow:hidden;background:${palette.bg};font-family:${FONT_STACK};color:#f5f7fb}
  .stage{position:relative;width:100%;height:100%;background:
    radial-gradient(120% 80% at 78% 12%, ${hexAlpha(palette.accent, 0.28)} 0%, transparent 58%),
    radial-gradient(100% 70% at 10% 90%, ${hexAlpha(palette.a, 0.9)} 0%, transparent 62%),
    linear-gradient(155deg, ${palette.a} 0%, ${palette.b} 72%)}
  .vignette{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%, transparent 35%, rgba(0,0,0,.55) 100%)}
  .rules{position:absolute;inset:${pad * 0.55}px;border:1px solid rgba(255,255,255,.14)}
  .rules:before,.rules:after{content:'';position:absolute;width:26px;height:26px;border:2px solid ${palette.accent};opacity:.8}
  .rules:before{left:-1px;top:-1px;border-right:0;border-bottom:0}
  .rules:after{right:-1px;bottom:-1px;border-left:0;border-top:0}
  .top{position:absolute;left:${pad}px;right:${pad}px;top:${pad}px;display:flex;justify-content:space-between;align-items:center;font-size:${Math.round(bodySize * 0.62)}px;letter-spacing:.28em;color:rgba(255,255,255,.55)}
  .tag{border:1px solid ${hexAlpha(palette.accent, 0.65)};color:${palette.accent};padding:10px 18px;letter-spacing:.18em;font-size:${Math.round(bodySize * 0.58)}px}
  .number{position:absolute;right:${pad * 0.4}px;top:${vertical ? 190 : 120}px;font-family:${SERIF_STACK};font-size:${vertical ? 440 : 300}px;line-height:.8;color:rgba(255,255,255,.07);font-weight:700;letter-spacing:-.04em}
  .content{position:absolute;left:${pad}px;right:${pad}px;bottom:${vertical ? 168 : 120}px}
  .eyebrow{display:flex;align-items:center;gap:18px;color:${palette.accent};font-size:${Math.round(bodySize * 0.66)}px;letter-spacing:.3em;margin-bottom:24px}
  .eyebrow:before{content:'';width:56px;height:2px;background:${palette.accent};display:inline-block}
  h1{font-size:${titleSize}px;line-height:1.16;font-weight:600;letter-spacing:.02em;max-width:88%}
  .sub{margin-top:20px;font-size:${Math.round(bodySize * 0.9)}px;color:rgba(255,255,255,.62);letter-spacing:.06em}
  .body{margin-top:${vertical ? 34 : 22}px;font-size:${bodySize}px;line-height:1.62;color:rgba(255,255,255,.7);max-width:${vertical ? 780 : 1180}px}
  .footer{position:absolute;left:${pad}px;right:${pad}px;bottom:${Math.round(pad * 0.7)}px;display:flex;justify-content:space-between;font-size:${Math.round(bodySize * 0.55)}px;letter-spacing:.2em;color:rgba(255,255,255,.38)}
  .grain{position:absolute;inset:0;opacity:.08;background-image:repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 3px);mix-blend-mode:overlay}
  .glow{position:absolute;width:${vertical ? 720 : 620}px;height:${vertical ? 720 : 620}px;border-radius:50%;background:${hexAlpha(palette.accent, 0.16)};filter:blur(90px);right:-160px;top:${vertical ? 420 : 180}px}
</style></head><body>
<div class="stage">
  <div class="glow"></div><div class="grain"></div><div class="vignette"></div><div class="rules"></div>
  <div class="top"><span>DRAMAFORGE · ${escapeHtml(options.tag)}</span><span>${escapeHtml(options.number)}</span></div>
  <div class="number">${escapeHtml(options.number)}</div>
  <div class="content">
    <div class="eyebrow">${escapeHtml(options.tag)}</div>
    <h1>${escapeHtml(options.title)}</h1>
    <div class="sub">${escapeHtml(options.subtitle)}</div>
    <div class="body">${escapeHtml(options.body)}</div>
  </div>
  <div class="footer"><span>AI SHORT DRAMA STUDIO</span><span>${options.width} × ${options.height}</span></div>
</div>
</body></html>`
}

export function portraitHtml(options: {
  width: number
  height: number
  name: string
  role: string
  appearance: string
  seed: number
}): string {
  const palette = PALETTES[Math.abs(options.seed) % PALETTES.length]
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${options.width}px;height:${options.height}px;overflow:hidden;background:${palette.bg};font-family:${FONT_STACK};color:#f5f7fb}
  .stage{position:relative;width:100%;height:100%;background:
    radial-gradient(90% 65% at 50% 20%, ${hexAlpha(palette.accent, 0.26)} 0%, transparent 64%),
    linear-gradient(180deg, ${palette.a} 0%, ${palette.b} 78%)}
  .silhouette{position:absolute;left:50%;top:24%;transform:translateX(-50%);width:460px;height:620px;border-radius:230px 230px 40px 40px;background:linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.16);box-shadow:0 40px 120px rgba(0,0,0,.45)}
  .silhouette:after{content:'';position:absolute;left:50%;top:-150px;transform:translateX(-50%);width:260px;height:300px;border-radius:50%;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.16)}
  .meta{position:absolute;left:72px;right:72px;bottom:120px}
  .role{color:${palette.accent};letter-spacing:.32em;font-size:24px;margin-bottom:16px}
  .name{font-family:${SERIF_STACK};font-size:88px;font-weight:700;letter-spacing:.06em}
  .desc{margin-top:22px;font-size:26px;line-height:1.6;color:rgba(255,255,255,.62)}
  .tag{position:absolute;left:72px;top:72px;font-size:20px;letter-spacing:.3em;color:rgba(255,255,255,.5)}
  .grain{position:absolute;inset:0;opacity:.08;background-image:repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 3px);mix-blend-mode:overlay}
</style></head><body>
<div class="stage">
  <div class="grain"></div>
  <div class="tag">CHARACTER SHEET · 角色定妆</div>
  <div class="silhouette"></div>
  <div class="meta">
    <div class="role">${escapeHtml(options.role)}</div>
    <div class="name">${escapeHtml(options.name)}</div>
    <div class="desc">${escapeHtml(options.appearance)}</div>
  </div>
</div>
</body></html>`
}

export function cardHtml(options: {
  width: number
  height: number
  title: string
  subtitle: string
  kicker: string
  seed: number
}): string {
  const palette = PALETTES[Math.abs(options.seed) % PALETTES.length]
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${options.width}px;height:${options.height}px;overflow:hidden;background:${palette.bg};font-family:${FONT_STACK};color:#f7f8fb}
  .stage{position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(80% 60% at 50% 42%, ${hexAlpha(palette.accent, 0.22)} 0%, transparent 62%), linear-gradient(160deg, ${palette.a}, ${palette.b})}
  .kicker{font-size:26px;letter-spacing:.5em;color:${palette.accent};margin-bottom:36px}
  h1{font-family:${SERIF_STACK};font-size:120px; letter-spacing:.08em;font-weight:700;text-align:center;max-width:860px;line-height:1.15}
  .sub{margin-top:32px;font-size:32px;letter-spacing:.2em;color:rgba(255,255,255,.58)}
  .line{width:120px;height:2px;background:${palette.accent};margin:40px auto 0}
  .grain{position:absolute;inset:0;opacity:.07;background-image:repeating-linear-gradient(0deg, rgba(255,255,255,.2) 0 1px, transparent 1px 3px);mix-blend-mode:overlay}
  .corner{position:absolute;inset:56px;border:1px solid rgba(255,255,255,.14)}
</style></head><body>
<div class="stage">
  <div class="grain"></div><div class="corner"></div>
  <div class="kicker">${escapeHtml(options.kicker)}</div>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="sub">${escapeHtml(options.subtitle)}</div>
  <div class="line"></div>
</div>
</body></html>`
}

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
