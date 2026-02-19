figma.showUI(__html__, { width: 420, height: 520 });

function uiOutput(text) {
  figma.ui.postMessage({ type: 'output', text });
}

function fail(message) {
  throw new Error(message);
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function round(n, digits = 2) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function hexToRgb01(hex) {
  const cleaned = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    fail(`HEX inválido: "${hex}". Usa formato #RRGGBB.`);
  }
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function rgb01ToHex({ r, g, b }) {
  const toByte = (x) => {
    const v = Math.round(clamp01(x) * 255);
    return v.toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// OKLab conversion (Björn Ottosson)
function linearSrgbToOklab({ r, g, b }) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearSrgb({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function oklabToOklch({ L, a, b }) {
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { L, C, h };
}

function oklchToOklab({ L, C, h }) {
  const hr = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
}

function srgb01ToOklch(rgb01) {
  const lin = { r: srgbToLinear(rgb01.r), g: srgbToLinear(rgb01.g), b: srgbToLinear(rgb01.b) };
  const lab = linearSrgbToOklab(lin);
  return oklabToOklch(lab);
}

function oklchToSrgb01InGamut(oklch) {
  const lab = oklchToOklab(oklch);
  const lin = oklabToLinearSrgb(lab);
  const srgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
  return srgb;
}

function isRgbInGamut01({ r, g, b }) {
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
}

// Simple gamut mapping: reduce chroma until sRGB fits [0,1]
function gamutMapOklchToSrgb01({ L, C, h }) {
  const tryRgb = (Cc) => oklchToSrgb01InGamut({ L, C: Cc, h });
  if (C <= 0) {
    const rgb = tryRgb(0);
    return { rgb01: { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) }, C: 0 };
  }

  let lo = 0;
  let hi = C;
  let best = tryRgb(0);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const rgb = tryRgb(mid);
    if (isRgbInGamut01(rgb)) {
      best = rgb;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { rgb01: { r: clamp01(best.r), g: clamp01(best.g), b: clamp01(best.b) }, C: lo };
}

function relativeLuminance({ r, g, b }) {
  const R = srgbToLinear(clamp01(r));
  const G = srgbToLinear(clamp01(g));
  const B = srgbToLinear(clamp01(b));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(rgbA, rgbB) {
  const L1 = relativeLuminance(rgbA);
  const L2 = relativeLuminance(rgbB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function labelSteps(steps, scheme, scaleStart, scaleEnd) {
  if (scheme === '1-14') return Array.from({ length: steps }, (_, i) => String(i + 1));
  if (scheme === 'custom' && scaleStart !== null && scaleStart !== undefined && scaleEnd !== null && scaleEnd !== undefined) {
    // Escala personalizada: interpolar entre scaleStart y scaleEnd, redondeado a bloques de 5 o 10
    // Mezcla bloques de 10 y 5 según sea necesario para evitar valores duplicados
    const range = Math.abs(scaleEnd - scaleStart);
    const stepSize = range / (steps - 1 || 1);
    
    // Calcular primero todos los valores interpolados exactos
    const exactValues = Array.from({ length: steps }, (_, i) => {
      const t = steps === 1 ? 0 : i / (steps - 1);
      return scaleStart + (scaleEnd - scaleStart) * t;
    });
    
    // Primera pasada: intentar redondear a múltiplos de 10
    const rounded10 = exactValues.map(v => Math.round(v / 10) * 10);
    const seen = new Set();
    const labels = [];
    const isDescending = scaleStart > scaleEnd;
    
    for (let i = 0; i < rounded10.length; i++) {
      let value = rounded10[i];
      let label = String(value);
      
      // Si hay duplicado, usar múltiplo de 5
      if (seen.has(label)) {
        value = Math.round(exactValues[i] / 5) * 5;
        label = String(value);
        
        // Si aún hay duplicado, buscar el múltiplo de 5 más cercano disponible
        if (seen.has(label)) {
          const base5 = value;
          const direction = isDescending ? -1 : 1;
          
          // Buscar alternativas en múltiplos de 5 manteniendo el orden
          for (let offset = 5; offset <= range; offset += 5) {
            const candidate1 = base5 + (offset * direction);
            const candidate2 = base5 - (offset * direction);
            
            // Probar candidato en dirección del orden primero
            const candidate = direction > 0 ? candidate1 : candidate2;
            const candidateLabel = String(candidate);
            
            if (!seen.has(candidateLabel)) {
              // Verificar que mantiene el orden
              if (labels.length === 0 || 
                  (isDescending && candidate <= parseInt(labels[labels.length - 1])) ||
                  (!isDescending && candidate >= parseInt(labels[labels.length - 1]))) {
                value = candidate;
                label = candidateLabel;
                break;
              }
            }
            
            // Probar el otro candidato
            const otherCandidate = direction > 0 ? candidate2 : candidate1;
            const otherLabel = String(otherCandidate);
            
            if (!seen.has(otherLabel)) {
              // Verificar que mantiene el orden
              if (labels.length === 0 || 
                  (isDescending && otherCandidate <= parseInt(labels[labels.length - 1])) ||
                  (!isDescending && otherCandidate >= parseInt(labels[labels.length - 1]))) {
                value = otherCandidate;
                label = otherLabel;
                break;
              }
            }
          }
        }
      }
      
      seen.add(label);
      labels.push(label);
    }
    
    return labels;
  }
  // Default: 50-950 with 14 steps. If steps != 14, interpolate.
  const min = 50;
  const max = 950;
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const v = Math.round(min + (max - min) * t);
    // round to nearest 50 to keep token-like labels
    const rounded = Math.round(v / 50) * 50;
    return String(Math.min(max, Math.max(min, rounded)));
  });
}

function buildRampOklch({ baseOklch, steps, lMin, lMax, chromaScale, labelScheme, scaleStart, scaleEnd }) {
  const Ldark = clamp01(lMin);
  const Llight = clamp01(lMax);
  if (!(Ldark < Llight)) fail('L mínimo debe ser menor que L máximo.');

  const labels = labelSteps(steps, labelScheme || (steps === 14 ? '50-950' : '1-14'), scaleStart, scaleEnd);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    // Light -> Dark (so first is lightest)
    const L = Llight + (Ldark - Llight) * t;
    // Slight chroma rolloff near extremes for safer gamut
    const edge = Math.abs(t - 0.5) * 2; // 0 center, 1 edges
    const rolloff = 1 - 0.18 * edge * edge;
    const C = Math.max(0, baseOklch.C * chromaScale * rolloff);
    out.push({ stepLabel: labels[i], oklch: { L, C, h: baseOklch.h } });
  }
  return out;
}

function nodeSummary(node) {
  const extra = [];
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const f0 = node.fills[0];
    if (f0 && f0.type === 'SOLID') extra.push('fill:SOLID');
  }
  if (node.type === 'TEXT') extra.push(`chars:${(node.characters || '').length}`);
  return `${node.type} "${node.name}"${extra.length ? ` (${extra.join(',')})` : ''}`;
}

function dumpTree(root, maxNodes = 600) {
  const lines = [];
  let count = 0;
  function walk(node, depth) {
    if (count >= maxNodes) return;
    lines.push(`${'  '.repeat(depth)}- ${nodeSummary(node)}`);
    count++;
    if ('children' in node) {
      for (const ch of node.children) walk(ch, depth + 1);
    }
  }
  walk(root, 0);
  if (count >= maxNodes) lines.push(`… truncado (>${maxNodes} nodos)`);
  return lines.join('\n');
}

function getSingleSelectionOrFail() {
  const sel = figma.currentPage.selection;
  if (!sel || sel.length !== 1) fail('Selecciona 1 solo nodo (instancia del componente o frame de la rampa).');
  return sel[0];
}

function findSlots(container) {
  // Basado en tu JSON: ramp -> frame "colors" -> 14 instancias "color-ramp"
  // Si no se encuentra esa ruta, caemos a heurística general.
  const norm = (s) => normalizeKey(s);

  function findDescendantFrameByName(root, wantedName) {
    const stack = [root];
    const wanted = norm(wantedName);
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (cur.type === 'FRAME' && norm(cur.name) === wanted) return cur;
      if ('children' in cur) for (const ch of cur.children) stack.push(ch);
    }
    return null;
  }

  function sortByY(nodes) {
    return nodes.slice().sort((a, b) => {
      const ya = Number.isFinite(a.y) ? a.y : 0;
      const yb = Number.isFinite(b.y) ? b.y : 0;
      return ya - yb;
    });
  }

  const colorsFrame = findDescendantFrameByName(container, 'colors');
  if (colorsFrame && 'children' in colorsFrame) {
    const direct = colorsFrame.children.filter((n) => n.type === 'INSTANCE' && norm(n.name) === norm('color-ramp'));
    if (direct.length > 0) return sortByY(direct);
    // Si hay otras capas intermedias dentro de "colors", recogemos instancias descendientes
    const inst = [];
    const stack = [colorsFrame];
    while (stack.length) {
      const cur = stack.pop();
      if (cur.type === 'INSTANCE' && norm(cur.name) === norm('color-ramp')) inst.push(cur);
      if ('children' in cur) for (const ch of cur.children) stack.push(ch);
    }
    if (inst.length > 0) return sortByY(inst);
  }

  // Fallback: children directos que parezcan slots
  if (!('children' in container)) return [];
  const candidates = container.children.filter((n) => {
    return n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE' || n.type === 'COMPONENT';
  });
  return candidates;
}

function findFirstSolidFillNode(node) {
  const stack = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (cur && 'fills' in cur && Array.isArray(cur.fills) && cur.fills.length > 0) {
      const f0 = cur.fills[0];
      if (f0 && f0.type === 'SOLID') return cur;
    }
    if (cur && 'children' in cur) stack.unshift(...cur.children);
  }
  return null;
}

function allTextNodes(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (cur.type === 'TEXT') out.push(cur);
    if ('children' in cur) for (const ch of cur.children) stack.push(ch);
  }
  return out;
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '');
}

function findFirstDescendant(node, predicate) {
  const stack = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur) continue;
    if (predicate(cur)) return cur;
    if ('children' in cur) stack.unshift(...cur.children);
  }
  return null;
}

function findDescendants(node, predicate, limit = 50) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (predicate(cur)) {
      out.push(cur);
      if (out.length >= limit) break;
    }
    if ('children' in cur) for (const ch of cur.children) stack.push(ch);
  }
  return out;
}

function findDescendantByName(node, name, type /* optional */) {
  const wanted = normalizeKey(name);
  return findFirstDescendant(node, (n) => {
    if (type && n.type !== type) return false;
    return normalizeKey(n.name) === wanted;
  });
}

function classifyTextNode(textNode) {
  const n = normalizeKey(textNode.name);
  // Header de tu componente ramp
  if (n === 'semanticname') return 'semanticName';
  if (n === 'namecolor') return 'rampName';
  if (n.includes('hex')) return 'hex';
  if (n.includes('oklch') || n.includes('oklch') || n.includes('okl')) return 'oklch';
  if (n.includes('contrast') && (n.includes('white') || n.includes('blanco'))) return 'contrastWhite';
  if (n.includes('contrast') && (n.includes('black') || n.includes('negro'))) return 'contrastBlack';
  if (n === 'name' || n.includes('token') || n.includes('colorname') || n.includes('nombre')) return 'name';
  if (n.includes('step') || n.includes('scale') || n.includes('ramp') || n.includes('grado') || n.includes('nivel')) return 'step';
  return null;
}

async function loadFontsForTextNode(textNode) {
  if (textNode.fontName !== figma.mixed) {
    await figma.loadFontAsync(textNode.fontName);
    return;
  }
  const len = textNode.characters.length;
  const seen = new Set();
  for (let i = 0; i < len; i++) {
    const fn = textNode.getRangeFontName(i, i + 1);
    const key = JSON.stringify(fn);
    if (!seen.has(key)) {
      seen.add(key);
      await figma.loadFontAsync(fn);
    }
  }
}

async function setText(textNode, value) {
  await loadFontsForTextNode(textNode);
  textNode.characters = value;
}

function setSolidFill(node, rgb01) {
  const fills = Array.isArray(node.fills) ? node.fills.slice() : [];
  const solid = { type: 'SOLID', color: { r: clamp01(rgb01.r), g: clamp01(rgb01.g), b: clamp01(rgb01.b) } };
  if (fills.length === 0) {
    node.fills = [solid];
    return;
  }
  fills[0] = solid;
  node.fills = fills;
}

function formatRgbString(rgb01) {
  const r = Math.round(clamp01(rgb01.r) * 255);
  const g = Math.round(clamp01(rgb01.g) * 255);
  const b = Math.round(clamp01(rgb01.b) * 255);
  return `${String(r).padStart(3, '0')}, ${String(g).padStart(3, '0')}, ${String(b).padStart(3, '0')}`;
}

function formatOklchValueString({ L, C, h }) {
  const Lp = Math.round(clamp01(L) * 100);
  const Cp = round(C, 2).toFixed(2);
  const hp = String(Math.round(h)).padStart(3, '0');
  // Formato aproximado al placeholder: "00%  0.00  000"
  return `${String(Lp).padStart(2, '0')}%  ${Cp}  ${hp}`;
}

function findInfoValueText(slotNode, labelKey /* hex|rgb|oklch */) {
  // Basado en tu estructura: "info-color" frame contiene un label TEXT (name: hex|rgb|oklch)
  // y un segundo TEXT con el valor.
  const frames = findDescendants(slotNode, (n) => n.type === 'FRAME' && normalizeKey(n.name) === normalizeKey('info-color'), 20);
  for (const fr of frames) {
    if (!('children' in fr)) continue;
    const texts = fr.children.filter((c) => c.type === 'TEXT');
    const label = texts.find((t) => normalizeKey(t.name) === normalizeKey(labelKey));
    if (!label) continue;
    const value = texts.find((t) => t !== label);
    if (value) return value;
  }
  return null;
}

function findContrastText(slotNode, sectionName /* on-surface|on-dark-surface */) {
  const section = findDescendantByName(slotNode, sectionName, 'FRAME');
  if (!section) return null;

  // En el componente, el KPI suele ser un TEXT que inicialmente contiene "0.00"
  // (a veces el nombre no es estable entre instancias/exports), así que lo buscamos por contenido.
  const texts = allTextNodes(section);
  const trimmed = texts
    .map((t) => ({ t, v: String(t.characters || '').trim() }))
    .filter(({ v }) => v.length > 0);

  // Preferimos exactamente "0.00"
  const exact = trimmed.find(({ v }) => v === '0.00');
  if (exact) return exact.t;

  // Si ya está rellenado con un número, también lo aceptamos.
  const numeric = trimmed.find(({ v }) => /^[0-9]+(\.[0-9]+)?$/.test(v));
  if (numeric) return numeric.t;

  // Fallback: intentamos por nombre "0-00"
  const byName = findDescendantByName(section, '0-00', 'TEXT');
  return byName;
}

function setBadgeOpacities(slotNode, sectionName, contrast) {
  const section = findDescendantByName(slotNode, sectionName, 'FRAME');
  if (!section) return;
  const aaOk = contrast >= 4.5;
  const aaaOk = contrast >= 7.0;
  const aaFrames = findDescendants(section, (n) => n.type === 'FRAME' && normalizeKey(n.name) === 'aa', 6);
  const aaaFrames = findDescendants(section, (n) => n.type === 'FRAME' && normalizeKey(n.name) === 'aaa', 6);
  // Visibilidad binaria según cumpla o no el estándar:
  // - Si cumple AA/AAA, el grupo de capas se muestra (visible = true, opacity = 1)
  // - Si no cumple, se oculta completamente (visible = false)
  for (const n of aaFrames) {
    n.visible = aaOk;
    if (aaOk) n.opacity = 1;
  }
  for (const n of aaaFrames) {
    n.visible = aaaOk;
    if (aaaOk) n.opacity = 1;
  }
}

async function applyToSlot(slotNode, payload) {
  // Basado en color-ramp-structure.json:
  // - El swatch se pinta en el FRAME interno llamado "color-ramp" (no en el ellipse)
  // - Los valores van en: name-color, info-color(hex/rgb/oklch), y contrastes en textos "0-00"

  const swatch = findFirstDescendant(slotNode, (n) => {
    if (n.type !== 'FRAME') return false;
    if (normalizeKey(n.name) !== normalizeKey('color-ramp')) return false;
    // desambiguar: este frame contiene secciones on-surface/on-dark-surface
    const hasOnSurface = !!findDescendantByName(n, 'on-surface', 'FRAME');
    const hasOnDark = !!findDescendantByName(n, 'on-dark-surface', 'FRAME');
    return hasOnSurface && hasOnDark;
  });
  if (!swatch || !('fills' in swatch)) return { ok: false, reason: 'No se encontró el FRAME "color-ramp" para pintar el swatch' };
  setSolidFill(swatch, payload.rgb01);

  const nameText = findDescendantByName(slotNode, 'name-color', 'TEXT');
  if (nameText) await setText(nameText, payload.name);

  const hexValue = findInfoValueText(slotNode, 'hex');
  if (hexValue) await setText(hexValue, payload.hex);

  const rgbValue = findInfoValueText(slotNode, 'rgb');
  if (rgbValue) await setText(rgbValue, payload.rgbString);

  const oklchValue = findInfoValueText(slotNode, 'oklch');
  if (oklchValue) await setText(oklchValue, payload.oklchValueString);

  // KPI contraste (W3C): texto negro sobre fondo (on-surface) y texto blanco sobre fondo (on-dark-surface)
  const contrastBlackText = findContrastText(slotNode, 'on-surface');
  if (contrastBlackText) await setText(contrastBlackText, payload.contrastBlack);

  const contrastWhiteText = findContrastText(slotNode, 'on-dark-surface');
  if (contrastWhiteText) await setText(contrastWhiteText, payload.contrastWhite);

  // Opcional: atenuar badges AA/AAA según pase/falle por sección
  setBadgeOpacities(slotNode, 'on-surface', payload.contrastBlackNumber);
  setBadgeOpacities(slotNode, 'on-dark-surface', payload.contrastWhiteNumber);

  return { ok: true, swatchNodeName: swatch.name };
}

async function applyToRampHeader(rampNode, payload) {
  // Si la selección incluye el header (`header-color`), rellenamos sus textos si existen.
  const texts = allTextNodes(rampNode);
  const roles = new Map();
  for (const t of texts) {
    const role = classifyTextNode(t);
    if (!role) continue;
    if (!roles.has(role)) roles.set(role, []);
    roles.get(role).push(t);
  }
  const setFirst = async (role, value) => {
    const arr = roles.get(role);
    if (!arr || arr.length === 0) return false;
    await setText(arr[0], value);
    return true;
  };
  await setFirst('semanticName', payload.semanticName || '');
  await setFirst('rampName', payload.rampName || '');
  return Array.from(roles.keys());
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'cancel') {
      figma.closePlugin();
      return;
    }

    if (msg.type === 'diagnose-selection') {
      const node = getSingleSelectionOrFail();
      uiOutput(dumpTree(node));
      return;
    }

    if (msg.type !== 'generate-ramp') return;

    const node = getSingleSelectionOrFail();
    const steps = Math.max(2, Math.min(14, Number(msg.steps) || 14));
    const baseRgb = hexToRgb01(msg.baseHex);
    const baseOklch = srgb01ToOklch(baseRgb);
    const lMin = Number.isFinite(msg.lMin) ? msg.lMin : 0.18;
    const lMax = Number.isFinite(msg.lMax) ? msg.lMax : 0.97;
    const chromaScale = Number.isFinite(msg.chromaScale) ? msg.chromaScale : 1;
    const labelScheme = msg.labelScheme;
    const scaleStart = Number.isFinite(msg.scaleStart) ? msg.scaleStart : null;
    const scaleEnd = Number.isFinite(msg.scaleEnd) ? msg.scaleEnd : null;

    const ramp = buildRampOklch({ baseOklch, steps, lMin, lMax, chromaScale, labelScheme, scaleStart, scaleEnd });

    const slots = findSlots(node);
    if (slots.length === 0) {
      fail('No encontré slots dentro de la selección. Selecciona el frame/instancia que contiene los steps como children.');
    }

    const white = { r: 1, g: 1, b: 1 };
    const black = { r: 0, g: 0, b: 0 };

    const usedSlots = Math.min(slots.length, ramp.length);
    const logs = [];
    logs.push(`Selección: ${nodeSummary(node)}`);
    logs.push(`Slots detectados (children directos): ${slots.length}`);
    logs.push(`Pasos solicitados: ${steps} | Pasos aplicados: ${usedSlots}`);

    // Relleno opcional del header (si forma parte de la selección)
    const headerRoles = await applyToRampHeader(node, {
      semanticName: 'Semantic name',
      rampName: `Ramp ${msg.baseHex}`,
    });
    if (headerRoles.length > 0) {
      logs.push(`Header actualizado: ${headerRoles.join(', ')}`);
    }
    logs.push('');

    for (let i = 0; i < usedSlots; i++) {
      const slot = slots[i];
      const item = ramp[i];
      const mapped = gamutMapOklchToSrgb01(item.oklch);
      const hex = rgb01ToHex(mapped.rgb01);
      const cW = contrastRatio(mapped.rgb01, white);
      const cB = contrastRatio(mapped.rgb01, black);
      const oklchString = `oklch(${round(item.oklch.L, 3)} ${round(mapped.C, 3)} ${round(item.oklch.h, 1)})`;
      const oklchValueString = formatOklchValueString({ L: item.oklch.L, C: mapped.C, h: item.oklch.h });
      const rgbString = formatRgbString(mapped.rgb01);

      const res = await applyToSlot(slot, {
        rgb01: mapped.rgb01,
        hex,
        oklchString,
        oklchValueString,
        rgbString,
        contrastWhite: round(cW, 2).toFixed(2),
        contrastBlack: round(cB, 2).toFixed(2),
        contrastWhiteNumber: cW,
        contrastBlackNumber: cB,
        stepLabel: item.stepLabel,
        name: `Color ${item.stepLabel}`,
      });

      if (res.ok) {
        logs.push(
          `[OK] Slot ${i + 1} "${slot.name}" -> ${hex} | ${oklchString} | Cw ${round(cW, 2)} | Cb ${round(cB, 2)}`
        );
      } else {
        logs.push(`[WARN] Slot ${i + 1} "${slot.name}" no aplicado: ${res.reason}`);
      }
    }

    if (slots.length < ramp.length) {
      logs.push('');
      logs.push(
        `Nota: tu componente solo tiene ${slots.length} slots y pediste ${steps}. Si quieres 14, añade slots en el componente o duplica el patrón.`
      );
    }

    uiOutput(logs.join('\n'));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    uiOutput(`Error: ${message}\n\nTip: usa "Diagnosticar selección" y pégame la salida para ajustar el mapeo.`);
  }
};
