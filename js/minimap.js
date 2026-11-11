// কোণার গোল মিনি-ম্যাপ (ক্যামেরার দিক উপরে থাকে, GTA-র মতো)

export class Minimap {
  constructor(canvas, map) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.map = map;
    const B = map.bounds;
    // অফস্ক্রিন ম্যাপ: প্রতি মিটারে এক পিক্সেল
    this.w = Math.ceil(B.x1 - B.x0);
    this.h = Math.ceil(B.z1 - B.z0);
    const off = document.createElement('canvas');
    off.width = this.w;
    off.height = this.h;
    const g = off.getContext('2d');
    const X = (x) => x - B.x0, Z = (z) => z - B.z0;
    const poly = (p) => { g.beginPath(); p.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.fill(); };
    g.fillStyle = '#c9c1ae';
    g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#9cbf7a';
    for (const p of map.parks) poly(p.p);
    g.fillStyle = '#5b9bd5';
    for (const w of map.water) poly(w.p);
    g.fillStyle = '#8e8676';
    for (const b of map.buildings) poly(b.p);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const s of map.segments) {
        if (pass === 0 && !s.main) continue;
        g.strokeStyle = s.main ? '#f4e2a0' : '#ffffff';
        g.lineWidth = s.width + 2;
        g.beginPath(); g.moveTo(X(s.ax), Z(s.az)); g.lineTo(X(s.bx), Z(s.bz)); g.stroke();
      }
    }
    // বিমানবন্দর আর জেটি
    const E = map.extras;
    if (E) {
      g.fillStyle = '#7b7f84';
      const R = E.runway, A = E.apron, T = E.taxiway;
      g.fillRect(X(R.x0), Z(R.z - R.w / 2), R.x1 - R.x0, R.w);
      g.fillRect(X(A.x0), Z(A.z0), A.x1 - A.x0, A.z1 - A.z0);
      g.fillRect(X(T.x - 9), Z(T.z1), 18, T.z0 - T.z1);
      g.fillStyle = '#ffffff';
      for (let x = R.x0 + 40; x < R.x1 - 40; x += 30) g.fillRect(X(x), Z(R.z) - 0.6, 15, 1.2);
      g.fillStyle = '#8a6a44';
      for (const gh of E.ghats) g.fillRect(X(gh.pier.x0), Z(gh.pier.z0), gh.pier.x1 - gh.pier.x0, gh.pier.z1 - gh.pier.z0);
    }
    // মেট্রো লাইন
    g.strokeStyle = '#2f6f9f';
    g.lineWidth = 4;
    for (const l of map.rail || []) { g.beginPath(); l.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
    this.off = off;
  }
  draw(px, pz, camYaw, heading, route, markers) {
    const g = this.g, W = this.c.width, H = this.c.height;
    const B = this.map.bounds;
    const scale = 0.75; // পিক্সেল প্রতি মিটার
    g.save();
    g.clearRect(0, 0, W, H);
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#b8b09c';
    g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(camYaw);
    g.scale(scale, scale);
    g.translate(-(px - B.x0), -(pz - B.z0));
    g.drawImage(this.off, 0, 0);
    const X = (x) => x - B.x0, Z = (z) => z - B.z0;
    if (route && route.length > 1) {
      g.strokeStyle = '#7b2cff';
      g.lineWidth = 7 / scale * 0.9;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(X(route[0].x), Z(route[0].z));
      for (const p of route) g.lineTo(X(p.x), Z(p.z));
      g.stroke();
    }
    g.restore();
    // মার্কার (ম্যাপের বাইরে গেলে কিনারায়)
    const R = W / 2 - 10;
    // পুলিশের খোঁজার এলাকা: লাল-নীল জ্বলা-নেভা বৃত্ত
    for (const m of markers) {
      if (!m.ring) continue;
      const dx = (m.x - px) * scale, dz = (m.z - pz) * scale;
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      g.fillStyle = m.fill;
      g.strokeStyle = m.color;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(W / 2 + dx * c - dz * s, H / 2 + dx * s + dz * c, m.ring * scale, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const m of markers) {
      if (m.ring) continue;
      let dx = (m.x - px) * scale, dz = (m.z - pz) * scale;
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      let rx = dx * c - dz * s, ry = dx * s + dz * c;
      const d = Math.hypot(rx, ry);
      if (d > R) { if (m.noClamp) continue; rx *= R / d; ry *= R / d; }
      const r = m.r || 7;
      g.fillStyle = m.color;
      g.strokeStyle = '#000';
      g.lineWidth = m.r && m.r < 5 ? 1 : 2;
      g.beginPath();
      g.arc(W / 2 + rx, H / 2 + ry, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (m.label) {
        g.fillStyle = '#fff';
        g.font = '700 11px "Hind Siliguri", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(m.label, W / 2 + rx, H / 2 + ry + 1);
      }
    }
    // খেলোয়াড়ের তীর
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(camYaw - heading);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // উত্তর চিহ্ন
    const nx = Math.sin(camYaw) * R, ny = -Math.cos(camYaw) * R;
    g.fillStyle = '#c62828';
    g.font = '700 13px "Hind Siliguri", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('উ', W / 2 + nx * 0.92, H / 2 + ny * 0.92);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
