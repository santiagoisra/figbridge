// dump.js — serialize a node tree with the properties that matter for layout work.
function hex(f) {
  if (!f || f === figma.mixed || !f.length) return null;
  var p = f[0];
  if (p.visible === false) return 'hidden';
  if (p.type !== 'SOLID') return p.type;
  var c = p.color;
  function h(v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); }
  var s = '#' + h(c.r) + h(c.g) + h(c.b);
  if (p.opacity != null && p.opacity < 1) s += '/' + p.opacity.toFixed(2);
  return s;
}
function t(fn, d) { try { var v = fn(); return v === undefined ? d : v; } catch (e) { return d; } }
function ser(n, depth) {
  var o = { id: n.id, nm: n.name, ty: n.type };
  o.box = [
    t(function () { return Math.round(n.x); }, null),
    t(function () { return Math.round(n.y); }, null),
    t(function () { return Math.round(n.width); }, null),
    t(function () { return Math.round(n.height); }, null)
  ];
  if (n.type === 'TEXT') {
    o.tx = t(function () { return n.characters; }, '');
    o.fs = t(function () { return n.fontSize === figma.mixed ? 'mixed' : n.fontSize; }, null);
    o.fw = t(function () { return n.fontName === figma.mixed ? 'mixed' : n.fontName.style; }, null);
    o.ff = t(function () { return n.fontName === figma.mixed ? 'mixed' : n.fontName.family; }, null);
    o.col = t(function () { return hex(n.fills); }, null);
    o.lh = t(function () { var l = n.lineHeight; return (l && l.value) ? l.value : (l && l.unit); }, null);
    o.ar = t(function () { return n.textAutoResize; }, null);
    o.ta = t(function () { return n.textAlignHorizontal; }, null);
  } else {
    o.bg = t(function () { return hex(n.fills); }, null);
  }
  var st = t(function () { return (n.strokes && n.strokes.length) ? (hex(n.strokes) + '@' + n.strokeWeight) : null; }, null);
  if (st) o.st = st;
  var r = t(function () { return n.cornerRadius === figma.mixed ? 'mixed' : n.cornerRadius; }, null);
  if (r) o.r = r;
  var lm = t(function () { return n.layoutMode; }, 'NONE');
  if (lm && lm !== 'NONE') {
    o.al = lm + ' gap:' + t(function () { return n.itemSpacing; }, '?') +
      ' pad:' + t(function () { return [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].join('/'); }, '?') +
      ' ' + t(function () { return n.primaryAxisSizingMode + '-' + n.counterAxisSizingMode; }, '?') +
      ' ' + t(function () { return n.primaryAxisAlignItems + '|' + n.counterAxisAlignItems; }, '?');
  }
  o.sz = t(function () { return n.layoutSizingHorizontal + '/' + n.layoutSizingVertical; }, null);
  if (n.type === 'INSTANCE') o.main = t(function () { return n.mainComponent ? n.mainComponent.name : null; }, null);
  var rx = t(function () { return n.reactions ? n.reactions.length : 0; }, 0);
  if (rx) o.rx = rx;
  if (n.visible === false) o.hidden = true;
  if (depth > 0 && n.children) o.c = n.children.map(function (ch) { return ser(ch, depth - 1); });
  return o;
}
var root = await figma.getNodeByIdAsync('__NODEID__');
if (!root) return { error: 'node not found: __NODEID__' };
return { tree: ser(root, __DEPTH__) };
