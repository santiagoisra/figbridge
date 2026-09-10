// tokens.js — read the design tokens actually used in this file, so the linter
// can be configured from the file itself instead of from a hardcoded list.
// Reads local paint styles, local color variables, text styles and fonts in use.
function h(v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); }
function toHex(c) { return '#' + h(c.r) + h(c.g) + h(c.b); }

var palette = {}, typeScale = {}, fonts = {}, heights = {};

var paints = await figma.getLocalPaintStylesAsync();
paints.forEach(function (s) {
  var p = s.paints && s.paints[0];
  if (p && p.type === 'SOLID') palette[toHex(p.color)] = true;
});

try {
  var vars = await figma.variables.getLocalVariablesAsync('COLOR');
  vars.forEach(function (v) {
    var modes = Object.keys(v.valuesByMode || {});
    modes.forEach(function (m) {
      var val = v.valuesByMode[m];
      if (val && typeof val === 'object' && 'r' in val) palette[toHex(val)] = true;
    });
  });
} catch (e) { /* older API, skip */ }

var texts = await figma.getLocalTextStylesAsync();
texts.forEach(function (s) {
  if (s.fontSize) typeScale[Math.round(s.fontSize)] = true;
  if (s.fontName && s.fontName.family) fonts[s.fontName.family] = true;
});

// Sample the current page for sizes and control heights actually in use.
var scanned = 0;
(function walk(n, depth) {
  if (scanned > 4000 || depth > 24) return;
  scanned++;
  if (n.type === 'TEXT') {
    try {
      if (n.fontSize && n.fontSize !== figma.mixed) typeScale[Math.round(n.fontSize)] = true;
      if (n.fontName && n.fontName !== figma.mixed) fonts[n.fontName.family] = true;
    } catch (e) { /* mixed */ }
  } else if (/button|btn|cta|input|field|select/i.test(n.name) && n.height && n.width > 40) {
    heights[Math.round(n.height)] = (heights[Math.round(n.height)] || 0) + 1;
  }
  if (n.children) n.children.forEach(function (c) { walk(c, depth + 1); });
})(figma.currentPage, 0);

var topHeights = Object.keys(heights)
  .sort(function (a, b) { return heights[b] - heights[a]; })
  .slice(0, 6)
  .map(Number)
  .sort(function (a, b) { return a - b; });

return {
  palette: Object.keys(palette).sort(),
  typeScale: Object.keys(typeScale).map(Number).sort(function (a, b) { return a - b; }),
  fonts: Object.keys(fonts).sort(),
  controlHeights: topHeights,
  scanned: scanned,
  page: figma.currentPage.name
};
