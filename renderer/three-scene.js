/* ================= DayFlow — 3D weekly chronicle ================= */
'use strict';

window.ThreeScene = (function () {
  const DATA = () => window.DayFlowData;

  const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  const CAT_COLORS = {
    work: 0x6d7cff, personal: 0xf472b6, health: 0x34d399, study: 0xfbbf24, other: 0x22d3ee
  };
  const CAT_LABELS = {
    work: 'Работа', personal: 'Личное', health: 'Здоровье', study: 'Учёба', other: 'Другое'
  };

  const hourHeight = 0.5;   // world units per hour
  const daySpacing = 2.4;
  const baseY = -6;         // 00:00 plane
  const totalH = 24 * hourHeight; // 12

  let renderer, scene, camera, controls, canvas, container;
  let weekStart = null;
  let mainGroup = null;
  let inited = false;
  let rafId = null;

  function yForHour(h) { return baseY + h * hourHeight; }

  function startOfWeek(d) {
    const r = new Date(d);
    const day = (r.getDay() + 6) % 7;
    r.setDate(r.getDate() - day);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  function makeTextSprite(text, opts) {
    opts = opts || {};
    const fontSize = opts.size || 48;
    const color = opts.color || '#ffffff';
    const padX = 16, padY = 10;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = `700 ${fontSize}px Inter, 'Segoe UI', sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
    const h = fontSize + padY * 2;
    cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d');
    c2.font = `700 ${fontSize}px Inter, 'Segoe UI', sans-serif`;
    c2.textBaseline = 'middle';
    c2.textAlign = 'center';
    c2.fillStyle = color;
    c2.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const scale = opts.scale || 1;
    sprite.scale.set(w * scale, h * scale, 1);
    return sprite;
  }

  function buildScene() {
    if (mainGroup) { scene.remove(mainGroup); disposeGroup(mainGroup); }
    mainGroup = new THREE.Group();

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const d = DATA();
    const events = d.eventsBetween(d.fmtDate(weekStart), d.fmtDate(weekEnd));

    // ---- floor grid ----
    const grid = new THREE.GridHelper(22, 22, 0x3a3f5c, 0x232842);
    grid.position.y = baseY - 0.05;
    mainGroup.add(grid);

    // ---- a translucent base platform ----
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(7 * daySpacing, 0.12, 3),
      new THREE.MeshStandardMaterial({ color: 0x141a30, roughness: 0.7, metalness: 0.2, transparent: true, opacity: 0.8 })
    );
    platform.position.y = baseY - 0.06;
    mainGroup.add(platform);

    // ---- hour gridlines ----
    for (let h = 0; h <= 24; h += 3) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3 * daySpacing - 0.9, yForHour(h), 0),
        new THREE.Vector3(3 * daySpacing + 0.9, yForHour(h), 0)
      ]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a3f5c, transparent: true, opacity: h === 0 ? 0.9 : 0.45 }));
      mainGroup.add(line);

      // hour label (left side)
      const lbl = makeTextSprite(`${String(h).padStart(2, '0')}:00`, { size: 40, color: '#8a91a8', scale: 0.0034 });
      lbl.position.set(-3 * daySpacing - 1.6, yForHour(h), 0);
      mainGroup.add(lbl);
    }

    // ---- day labels (top) ----
    const todayStr = d.todayStr();
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const x = (i - 3) * daySpacing;
      const isToday = d.fmtDate(day) === todayStr;

      const num = day.getDate();
      const name = DOW[i];
      const col = isToday ? '#ffffff' : '#9aa3b8';

      const lblDay = makeTextSprite(name, { size: 44, color: col, scale: 0.004 });
      lblDay.position.set(x, yForHour(24) + 1.1, 0);
      mainGroup.add(lblDay);

      const lblNum = makeTextSprite(String(num), { size: 64, color: isToday ? '#9d6bff' : '#cfd4e4', scale: 0.0045 });
      lblNum.position.set(x, yForHour(24) + 0.55, 0);
      mainGroup.add(lblNum);

      // highlight today's column
      if (isToday) {
        const hl = new THREE.Mesh(
          new THREE.BoxGeometry(daySpacing - 0.4, totalH, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x6d7cff, transparent: true, opacity: 0.06, roughness: 1 })
        );
        hl.position.set(x, baseY + totalH / 2, 0);
        mainGroup.add(hl);
      }
    }

    // ---- event blocks ----
    events.forEach((ev) => {
      const dayIdx = Math.round((new Date(ev.date + 'T00:00') - weekStart) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) return;
      const x = (dayIdx - 3) * daySpacing;
      const startMin = (parseInt(ev.start.slice(0, 2), 10) * 60) + parseInt(ev.start.slice(3, 5), 10);
      const endMin = (parseInt(ev.end.slice(0, 2), 10) * 60) + parseInt(ev.end.slice(3, 5), 10);
      const dur = Math.max(endMin - startMin, 15);
      const h = (dur / 60) * hourHeight;
      const yCenter = yForHour(startMin / 60) + h / 2;

      const color = CAT_COLORS[ev.category] || 0x22d3ee;
      const geo = new THREE.BoxGeometry(daySpacing - 0.55, h, 1.7);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.15,
        emissive: color,
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 0.92
      });
      const box = new THREE.Mesh(geo, mat);
      box.position.set(x, yCenter, 0);
      box.userData = ev;
      mainGroup.add(box);

      // time tag above block
      const tag = makeTextSprite(`${ev.start}`, { size: 34, color: '#cfd4e4', scale: 0.003 });
      tag.position.set(x, yCenter + h / 2 + 0.28, 0);
      mainGroup.add(tag);
    });

    // ---- "now" marker ----
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowY = yForHour(nowMin / 60);
    const nowLine = new THREE.Mesh(
      new THREE.PlaneGeometry(7 * daySpacing, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x6d7cff, transparent: true, opacity: 0.9 })
    );
    nowLine.rotation.x = -Math.PI / 2;
    nowLine.position.set(0, nowY, 0);
    mainGroup.add(nowLine);

    const nowDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x9d6bff })
    );
    nowDot.position.set(-3 * daySpacing - 1.6, nowY, 0);
    mainGroup.add(nowDot);

    scene.add(mainGroup);

    // ---- legend (HTML) ----
    renderLegend(events);
  }

  function renderLegend(events) {
    const el = document.getElementById('threeLegend');
    if (!el) return;
    const counts = {};
    events.forEach((ev) => { counts[ev.category] = (counts[ev.category] || 0) + 1; });
    const total = events.length;
    let html = `<div class="legend-chip"><span class="swatch" style="background:#6d7cff"></span>Сейчас</div>`;
    Object.keys(counts).forEach((c) => {
      const hex = '#' + CAT_COLORS[c].toString(16).padStart(6, '0');
      html += `<div class="legend-chip"><span class="swatch" style="background:${hex}"></span>${CAT_LABELS[c]} · ${counts[c]}</div>`;
    });
    html += `<div class="legend-chip">Всего за неделю: ${total}</div>`;
    el.innerHTML = html;
  }

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        else { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      }
    });
  }

  function init() {
    if (inited) return;
    inited = true;
    canvas = document.getElementById('threeCanvas');
    container = canvas.parentElement;
    weekStart = startOfWeek(new Date());

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0e1a, 18, 40);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(10, 7, 16);
    camera.lookAt(0, 1, 0);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 45;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.update();

    // lights
    scene.add(new THREE.AmbientLight(0x8890b8, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(8, 14, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);
    const point = new THREE.PointLight(0x6d7cff, 0.7, 40);
    point.position.set(-6, 6, 6);
    scene.add(point);
    const point2 = new THREE.PointLight(0x9d6bff, 0.5, 40);
    point2.position.set(6, 2, -4);
    scene.add(point2);

    buildScene();
    animate();
    resize();

    window.addEventListener('resize', resize);
    // re-render when switching to the 3D tab
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => resize());
      ro.observe(container);
    }
  }

  function resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function render() {
    if (!inited) init();
    else { buildScene(); }
  }

  function shiftWeek(delta) {
    weekStart.setDate(weekStart.getDate() + delta * 7);
    updateLabel();
    render();
  }

  function resetWeek() {
    weekStart = startOfWeek(new Date());
    updateLabel();
    render();
  }

  function updateLabel() {
    const el = document.getElementById('threeWeekLabel');
    if (!el) return;
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const label = `${weekStart.getDate()} ${MONTHS_GEN[weekStart.getMonth()]} — ${end.getDate()} ${MONTHS_GEN[end.getMonth()]}`;
    el.textContent = label;
  }

  return { init, render, resize, shiftWeek, resetWeek };
})();
