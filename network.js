(function () {
  "use strict";

  const canvas = document.getElementById("network");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ACCENT = [34, 211, 238];
  const N = 46;

  let W = 1;
  let H = 1;
  let dpr = 1;
  let scene = null;
  let sceneName = "work";
  let running = false;
  let rafId = 0;
  let last = 0;
  let spawnAcc = 0;
  let hover = -1;
  const pointer = { x: -1e4, y: -1e4 };

  const nodes = [];
  for (let i = 0; i < N; i++) {
    nodes.push({ x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0, r: 3.5, tr: 3.5, hit: 0 });
  }
  const edges = new Map();
  let packets = [];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function scatter(rnd, count, x0, x1, y0, y1) {
    const w = x1 - x0;
    const h = y1 - y0;
    const cols = Math.max(1, Math.round(Math.sqrt((count * w) / h)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cw = w / cols;
    const ch = h / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = cells[i];
      cells[i] = cells[j];
      cells[j] = t;
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const cell = cells[i % cells.length];
      out.push({ x: x0 + (cell[0] + 0.15 + rnd() * 0.7) * cw, y: y0 + (cell[1] + 0.15 + rnd() * 0.7) * ch });
    }
    return out;
  }

  function knn(items, k) {
    const seen = new Set();
    const out = [];
    items.forEach((p) => {
      const near = items
        .filter((q) => q !== p)
        .map((q) => ({ q: q, d: Math.hypot(p.x - q.x, p.y - q.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, k);
      near.forEach(({ q }) => {
        const i = Math.min(p.i, q.i);
        const j = Math.max(p.i, q.i);
        const key = i + "-" + j;
        if (seen.has(key)) return;
        seen.add(key);
        out.push([i, j]);
      });
    });
    return out;
  }

  function blank(rnd) {
    const pos = [];
    for (let i = 0; i < N; i++) pos.push({ x: rnd() * W, y: rnd() * H, a: 0, r: 3.5 });
    return pos;
  }

  function place(pos, items, r) {
    items.forEach((p) => {
      pos[p.i] = { x: p.x, y: p.y, a: 1, r: r || 3.5 };
    });
  }

  function withIndex(points, start) {
    return points.map((p, k) => ({ i: start + k, x: p.x, y: p.y }));
  }

  const SCENES = {
    work: function () {
      const rnd = mulberry32(53);
      const pos = blank(rnd);
      const clusters = 5;
      const per = 8;
      const rad = Math.min(W, H) * 0.09;
      const e = [];
      let prev = -1;
      for (let c = 0; c < clusters; c++) {
        const cx = (0.1 + c * 0.2) * W;
        const cy = (c % 2 ? 0.3 : 0.72) * H;
        const items = [];
        for (let k = 0; k < per; k++) {
          const ang = (k / per) * Math.PI * 2 + rnd() * 0.7;
          const d = rad * (0.35 + rnd() * 0.85);
          items.push({ i: c * per + k, x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d });
        }
        place(pos, items);
        knn(items, 2).forEach((pair) => e.push(pair));
        if (prev >= 0) e.push([prev, c * per]);
        prev = c * per;
      }
      return { pos: pos, edges: e, rate: 6, speed: 190, hops: 6 };
    },
    founder: function () {
      const rnd = mulberry32(71);
      const pos = blank(rnd);
      const rad = Math.min(W, H) * 0.19;
      const groups = [
        { cx: 0.2 * W, cy: 0.5 * H, start: 0 },
        { cx: 0.8 * W, cy: 0.5 * H, start: 20 },
      ];
      const e = [];
      groups.forEach((g) => {
        const items = [];
        for (let k = 0; k < 20; k++) {
          const ang = rnd() * Math.PI * 2;
          const d = rad * Math.sqrt(rnd());
          items.push({ i: g.start + k, x: g.cx + Math.cos(ang) * d, y: g.cy + Math.sin(ang) * d });
        }
        place(pos, items);
        knn(items, 3).forEach((pair) => e.push(pair));
      });
      e.push([0, 20], [5, 25], [11, 31]);
      return { pos: pos, edges: e, rate: 7, speed: 210, hops: 5 };
    },
    stack: function () {
      const rnd = mulberry32(89);
      const pos = blank(rnd);
      const cols = 8;
      const rows = 5;
      const e = [];
      const items = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (i >= N) break;
          items.push({ i: i, x: (0.08 + (c / (cols - 1)) * 0.84) * W, y: (0.14 + (r / (rows - 1)) * 0.72) * H });
          if (c < cols - 1 && i + 1 < N) e.push([i, i + 1]);
          if (r < rows - 1 && i + cols < N) e.push([i, i + cols]);
        }
      }
      place(pos, items, 3);
      return { pos: pos, edges: e, rate: 9, speed: 260, hops: 4 };
    },
  };

  const sprite = document.createElement("canvas");
  sprite.width = 48;
  sprite.height = 48;
  (function paintSprite() {
    const c = sprite.getContext("2d");
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, "rgba(" + ACCENT.join(",") + ",0.9)");
    g.addColorStop(0.25, "rgba(" + ACCENT.join(",") + ",0.35)");
    g.addColorStop(1, "rgba(" + ACCENT.join(",") + ",0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 48);
    c.fillStyle = "#dffbff";
    c.beginPath();
    c.arc(24, 24, 2.4, 0, Math.PI * 2);
    c.fill();
  })();

  function applyScene(name, snap) {
    if (!SCENES[name]) return;
    sceneName = name;
    scene = SCENES[name]();
    scene.pos.forEach((p, i) => {
      const n = nodes[i];
      n.tx = p.x;
      n.ty = p.y;
      n.ta = p.a;
      n.tr = p.r;
    });
    edges.forEach((e) => (e.ta = 0));
    scene.edges.forEach(([i, j]) => {
      const key = i + "-" + j;
      const e = edges.get(key);
      if (e) e.ta = 1;
      else edges.set(key, { i: i, j: j, a: 0, ta: 1, key: key });
    });
    if (snap || reduceMotion.matches) snapAll();
    if (reduceMotion.matches) draw();
  }

  function snapAll() {
    nodes.forEach((n) => {
      n.x = n.tx;
      n.y = n.ty;
      n.a = n.ta;
      n.r = n.tr;
    });
    edges.forEach((e, key) => {
      e.a = e.ta;
      if (e.ta === 0) edges.delete(key);
    });
    packets = [];
  }

  function edgeUsable(e) {
    return e.ta === 1 && nodes[e.i].ta > 0.5 && nodes[e.j].ta > 0.5;
  }

  function spawn() {
    if (packets.length > 80) return;
    const usable = [];
    edges.forEach((e) => {
      if (edgeUsable(e)) usable.push(e);
    });
    if (!usable.length) return;
    const e = usable[Math.floor(Math.random() * usable.length)];
    packets.push({ e: e, t: 0, speed: scene.speed * (0.75 + Math.random() * 0.5), hops: 0, x: nodes[e.i].x, y: nodes[e.i].y });
  }

  function nextEdge(from) {
    const options = [];
    edges.forEach((e) => {
      if (e.i === from && edgeUsable(e)) options.push(e);
    });
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  function stepPackets(dt) {
    const keep = [];
    packets.forEach((p) => {
      if (p.e.ta === 0) return;
      const a = nodes[p.e.i];
      const b = nodes[p.e.j];
      const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      let boost = 1;
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const d = dx * dx + dy * dy;
      if (d < 130 * 130) boost = 1 + (1 - Math.sqrt(d) / 130) * 1.8;
      p.t += (p.speed * boost * dt) / len;
      while (p.t >= 1) {
        b.hit = 1;
        p.hops += 1;
        const next = p.hops < scene.hops ? nextEdge(p.e.j) : null;
        if (!next) return;
        p.t = (p.t - 1) * len;
        p.e = next;
        const na = nodes[next.i];
        const nb = nodes[next.j];
        p.t = p.t / Math.max(1, Math.hypot(nb.x - na.x, nb.y - na.y));
      }
      const ca = nodes[p.e.i];
      const cb = nodes[p.e.j];
      p.x = ca.x + (cb.x - ca.x) * p.t;
      p.y = ca.y + (cb.y - ca.y) * p.t;
      keep.push(p);
    });
    packets = keep;
  }

  function update(dt) {
    const k = 1 - Math.exp(-dt * 3);
    nodes.forEach((n) => {
      n.x += (n.tx - n.x) * k;
      n.y += (n.ty - n.y) * k;
      n.a += (n.ta - n.a) * k;
      n.r += (n.tr - n.r) * k;
      n.hit = Math.max(0, n.hit - dt * 2.5);
    });
    edges.forEach((e, key) => {
      e.a += (e.ta - e.a) * k;
      if (e.ta === 0 && e.a < 0.02) edges.delete(key);
    });
    spawnAcc += dt * scene.rate;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      spawn();
    }
    stepPackets(dt);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    edges.forEach((e) => {
      const a = e.a * Math.min(nodes[e.i].a, nodes[e.j].a);
      if (a < 0.01) return;
      ctx.strokeStyle = "rgba(255,255,255," + (0.15 * a).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(nodes[e.i].x, nodes[e.i].y);
      ctx.lineTo(nodes[e.j].x, nodes[e.j].y);
      ctx.stroke();
    });
    packets.forEach((p) => {
      ctx.drawImage(sprite, p.x - 12, p.y - 12, 24, 24);
    });
    nodes.forEach((n, i) => {
      if (n.a < 0.01) return;
      const glow = Math.max(n.hit, i === hover ? 1 : 0);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 2, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      if (glow > 0.01) {
        ctx.fillStyle = "rgba(" + ACCENT.join(",") + "," + (0.55 * glow * n.a).toFixed(3) + ")";
        ctx.fill();
      }
      const wr = Math.round(255 - (255 - ACCENT[0]) * glow);
      const wg = Math.round(255 - (255 - ACCENT[1]) * glow);
      const wb = Math.round(255 - (255 - ACCENT[2]) * glow);
      ctx.strokeStyle = "rgba(" + wr + "," + wg + "," + wb + "," + ((0.4 + 0.55 * glow) * n.a).toFixed(3) + ")";
      ctx.stroke();
    });
  }

  function frame(now) {
    if (!running) {
      rafId = 0;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMotion.matches) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function resize() {
    const nw = window.innerWidth;
    const nh = window.innerHeight;
    const sx = W > 1 ? nw / W : 1;
    const sy = H > 1 ? nh / H : 1;
    W = nw;
    H = nh;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes.forEach((n) => {
      n.x *= sx;
      n.y *= sy;
    });
    applyScene(sceneName, false);
    if (reduceMotion.matches) draw();
  }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    let best = -1;
    let bestD = 15 * 15;
    nodes.forEach((n, i) => {
      if (n.a < 0.5) return;
      const dx = n.x - e.clientX;
      const dy = n.y - e.clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    hover = best;
  }, { passive: true });

  window.addEventListener("pointerleave", () => {
    pointer.x = -1e4;
    pointer.y = -1e4;
    hover = -1;
  });

  document.addEventListener("scene", (e) => applyScene(e.detail, false));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) {
      stop();
      snapAll();
      draw();
    } else {
      start();
    }
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 90);
  });

  resize();
  applyScene(sceneName, true);
  nodes.forEach((n) => {
    n.a = 0;
    n.x = W / 2 + (n.tx - W / 2) * 0.75;
    n.y = H / 2 + (n.ty - H / 2) * 0.75;
  });
  edges.forEach((e) => (e.a = 0));
  if (reduceMotion.matches) {
    snapAll();
    draw();
  } else {
    start();
  }
})();
