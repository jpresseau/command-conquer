/* ui/wayline.js - the stops a selected unit has queued (Shift + right-click; core/orders.js
   _rtsWayNext), drawn on the HUD as the rally point is: a dashed line from the unit to where it is
   going now, on through each stop, and a dot at each. Amber where the leg is an attack-move, the
   move's green where it is not. Only for selected units, so a queued army is not a permanent
   web across the map. */
function _rtsDrawWayline(g, e) {
  if (!e.wq || !e.wq.length) return 0;
  var pts = [{ x: e.x, z: e.z, am: e.order === 'amove' }];
  if (e.goal) pts.push({ x: e.goal.x, z: e.goal.z, am: e.order === 'amove' });
  for (var i = 0; i < e.wq.length; i++) pts.push(e.wq[i]);
  var sp = pts.map(function (p) { return _rtsWorldToScreen(p.x, _rtsElev(p.x, p.z), p.z); }), drawn = 0;
  g.save();
  g.lineWidth = 1.5; g.setLineDash([5, 4]);
  for (i = 1; i < sp.length; i++) {
    if (sp[i].behind || sp[i - 1].behind) continue;
    g.strokeStyle = pts[i].am ? 'rgba(255,190,80,0.6)' : 'rgba(142,240,122,0.55)';
    g.beginPath(); g.moveTo(sp[i - 1].x, sp[i - 1].y); g.lineTo(sp[i].x, sp[i].y); g.stroke();
    drawn++;
  }
  g.setLineDash([]);
  for (i = 2; i < sp.length; i++) {
    if (sp[i].behind) continue;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(sp[i].x, sp[i].y, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = pts[i].am ? '#ffbe50' : '#8ef07a'; g.beginPath(); g.arc(sp[i].x, sp[i].y, 2.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  return drawn;
}
