// lint.js — programmatic QA of a set of frames, run inside Figma.
// __IDS__ and __CFG__ are substituted by the CLI before sending.
var IDS = __IDS__;
var CFG = __CFG__;
var PALETA = CFG.palette || [];
var ESCALA = CFG.typeScale || [];
var ALTURAS = CFG.controlHeights || [];
var FUENTES = CFG.fonts || [];
var R = CFG.lint || {};
var IGN = R.ignoreNames ? new RegExp(R.ignoreNames, 'i') : null;

function hex(f) {
  if (!f || f === figma.mixed || !f.length) return null;
  var p = f[0];
  if (p.type !== 'SOLID' || p.visible === false) return null;
  function h(v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); }
  return '#' + h(p.color.r) + h(p.color.g) + h(p.color.b);
}
function t(fn, d) { try { var v = fn(); return v === undefined ? d : v; } catch (e) { return d; } }

var out = [];
function add(frame, sev, msg) { out.push(sev + ' | ' + frame + ' | ' + msg); }

for (var i = 0; i < IDS.length; i++) {
  var f = await figma.getNodeByIdAsync(IDS[i]);
  if (!f) { add(IDS[i], 'ERROR', 'node does not exist'); continue; }
  var nom = f.name.slice(0, 38);
  var W = f.width, H = f.height;

  if (R.overflow) {
    var maxB = 0, maxR = 0, blameB = '', blameR = '';
    (f.children || []).forEach(function (c) {
      if (c.visible === false) return;
      var b = (c.y || 0) + (c.height || 0), r = (c.x || 0) + (c.width || 0);
      if (b > maxB) { maxB = b; blameB = c.name; }
      if (r > maxR) { maxR = r; blameR = c.name; }
    });
    if (maxB > H + 0.5) add(nom, 'ERROR', 'overflows ' + Math.round(maxB - H) + 'px at the bottom · ' + blameB);
    if (maxR > W + 0.5) add(nom, 'ERROR', 'overflows ' + Math.round(maxR - W) + 'px to the right · ' + blameR);
  }

  if (R.overlap) {
    var kids = (f.children || []).filter(function (c) {
      return c.visible !== false && c.width > 8 && c.height > 8 && !/scrim|overlay|background|fondo/i.test(c.name);
    });
    for (var a = 0; a < kids.length; a++) {
      for (var b2 = a + 1; b2 < kids.length; b2++) {
        var p = kids[a], q = kids[b2];
        var ox = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x);
        var oy = Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y);
        if (ox > 4 && oy > 4) {
          var ap = p.width * p.height, aq = q.width * q.height;
          var contains = ox * oy > Math.min(ap, aq) * 0.92;
          if (!contains && ox * oy > Math.min(ap, aq) * 0.25) {
            add(nom, 'WARN', 'overlapping: ' + p.name.slice(0, 22) + ' / ' + q.name.slice(0, 22));
          }
        }
      }
    }
  }

  var offPalette = {}, offScale = {}, offFont = {}, currency = 0, offHeights = [], clipped = [];
  (function walk(n, depth) {
    if (depth > 40 || n.visible === false) return;
    if (IGN && IGN.test(n.name)) return;
    if (n.type === 'TEXT') {
      if (R.palette && PALETA.length) {
        var col = t(function () { return hex(n.fills); }, null);
        if (col && PALETA.indexOf(col) < 0) offPalette[col] = (offPalette[col] || 0) + 1;
      }
      if (R.typeScale && ESCALA.length) {
        var fs = t(function () { return n.fontSize; }, null);
        if (fs && fs !== figma.mixed && ESCALA.indexOf(Math.round(fs)) < 0) {
          offScale[Math.round(fs)] = (offScale[Math.round(fs)] || 0) + 1;
        }
      }
      if (R.fonts && FUENTES.length) {
        var fam = t(function () { return n.fontName === figma.mixed ? null : n.fontName.family; }, null);
        if (fam && FUENTES.indexOf(fam) < 0) offFont[fam] = (offFont[fam] || 0) + 1;
      }
      var tx = t(function () { return n.characters; }, '');
      if (R.currencySpace && /\$\s/.test(tx)) currency++;
      if (R.clippedText) {
        var lh = t(function () { return (n.lineHeight && typeof n.lineHeight.value === 'number') ? n.lineHeight.value : 0; }, 0);
        var lines = tx.split('\n').length;
        if (t(function () { return n.textAutoResize; }, '') === 'NONE' && lh && lines > 1 && lines * lh > n.height + 4) {
          clipped.push(n.name.slice(0, 24));
        }
      }
    } else if (R.palette && PALETA.length) {
      var bg = t(function () { return hex(n.fills); }, null);
      if (bg && PALETA.indexOf(bg) < 0) offPalette[bg] = (offPalette[bg] || 0) + 1;
    }
    if (R.controlHeights && ALTURAS.length && n.type !== 'TEXT' &&
        /button|btn|cta|input|field|select|campo/i.test(n.name) &&
        !/bar|toolbar|topbar|navbar|barra/i.test(n.name) && n.height && n.width > 40) {
      var h = Math.round(n.height);
      if (ALTURAS.indexOf(h) < 0) offHeights.push(n.name.slice(0, 22) + '=' + h);
    }
    if (n.children) n.children.forEach(function (c) { walk(c, depth + 1); });
  })(f, 0);

  var pk = Object.keys(offPalette);
  if (pk.length) add(nom, 'WARN', 'colors outside the palette: ' + pk.slice(0, 5).map(function (k) { return k + ' x' + offPalette[k]; }).join(' '));
  var sk = Object.keys(offScale);
  if (sk.length) add(nom, 'WARN', 'sizes outside the type scale: ' + sk.slice(0, 5).map(function (k) { return k + 'px x' + offScale[k]; }).join(' '));
  var fk = Object.keys(offFont);
  if (fk.length) add(nom, 'WARN', 'fonts outside the system: ' + fk.slice(0, 4).join(', '));
  if (currency) add(nom, 'ERROR', currency + ' texts with a space after the currency sign');
  if (offHeights.length) add(nom, 'WARN', 'non-standard control height: ' + offHeights.slice(0, 4).join(', '));
  if (clipped.length) add(nom, 'ERROR', 'text clipped by a fixed height: ' + clipped.slice(0, 4).join(', '));
}
if (!out.length) out.push('OK | clean across ' + IDS.length + ' frame(s)');
return out;
