// snap.js — safety inventory of a set of frames.
// Counting prototype reactions alone is not enough: a button can disappear
// without any reaction changing. So we count reactions, visible buttons AND nodes.
var IDS = __IDS__;
var out = [];
for (var i = 0; i < IDS.length; i++) {
  var f = await figma.getNodeByIdAsync(IDS[i]);
  if (!f) { out.push(IDS[i] + ' | MISSING'); continue; }
  var rx = 0, btn = 0, nodes = 0;
  (function w(n) {
    nodes++;
    if (n.reactions && n.reactions.length) rx += n.reactions.length;
    if (n.visible !== false && /button|btn|cta/i.test(n.name)) btn++;
    if (n.children) n.children.forEach(w);
  })(f);
  out.push(f.id + ' | ' + f.name.slice(0, 34) + ' | rx:' + rx + ' btn:' + btn + ' nodes:' + nodes);
}
return out;
