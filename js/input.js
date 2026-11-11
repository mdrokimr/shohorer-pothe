// কিবোর্ড, মাউস দিয়ে চারপাশ দেখা, আর ফোনের জয়স্টিক
const HOLD = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', Space: 'space', KeyC: 'block',
};
const TAP = {
  KeyF: 'use', KeyE: 'use', KeyJ: 'phone', Tab: 'phone', KeyH: 'horn', KeyM: 'map', KeyB: 'bag', KeyN: 'mute', KeyP: 'pause', Escape: 'pause',
  Digit1: 'o1', Digit2: 'o2', Digit3: 'o3', Digit4: 'o4', Digit5: 'o5', KeyX: 'cancel', KeyV: 'view', Enter: 'enter', Space: 'jump', KeyQ: 'weapon', KeyR: 'repair', KeyG: 'act', KeyY: 'rideYes',
};

export class Input {
  constructor() {
    this.keys = {};
    this.touch = {};
    this.handlers = {};
    this.look = { dx: 0, dy: 0 };
    this.joy = { x: 0, y: 0, active: false };
    this.zoom = 0;
    this.locked = false;
  }
  on(n, f) { this.handlers[n] = f; }
  emit(n) { if (this.handlers[n]) this.handlers[n](); }
  get(k) { return !!(this.keys[k] || this.touch[k]); }
  clear() {
    this.keys = {}; this.touch = {};
    this.joy.x = this.joy.y = 0;
    document.querySelectorAll('[data-key].on').forEach((b) => b.classList.remove('on'));
  }
  // সামনে-পিছে আর ডানে-বামে (-১…১)
  axis() {
    let x = (this.get('right') ? 1 : 0) - (this.get('left') ? 1 : 0);
    let y = (this.get('up') ? 1 : 0) - (this.get('down') ? 1 : 0);
    if (this.joy.active) { x = this.joy.x; y = this.joy.y; }
    return { x, y };
  }
  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = this.look.dy = 0;
    return l;
  }
  bind(canvas, touchRoot) {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (HOLD[e.code]) { this.keys[HOLD[e.code]] = true; e.preventDefault(); }
      if (TAP[e.code] && !e.repeat) {
        this.emit(TAP[e.code]);
        if (e.code !== 'Escape') e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { if (HOLD[e.code]) this.keys[HOLD[e.code]] = false; });
    const lose = () => { this.clear(); this.emit('blur'); };
    window.addEventListener('blur', lose);
    document.addEventListener('visibilitychange', () => { if (document.hidden) lose(); });

    // মাউস: ক্যানভাসে ক্লিক করলে মাউস আটকে যায় (Esc চাপলে ছাড়ে); না পারলে টেনে ঘোরানো
    // বাম ক্লিক: ঘুষি/গুলি; ডান ক্লিক ধরে রাখা: নিশানা
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 2) { this.keys.aim = true; this.emit('alt'); return; }
      if (e.button !== 0) return;
      if (this.locked) { this.emit('attack'); return; }
      this.click = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (!this.locked && canvas.requestPointerLock && this.handlers.canLock && this.handlers.canLock()) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch (err) { /* কিছু জায়গায় অনুমতি নেই */ }
      }
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (this.locked) { this.look.dx += e.movementX || 0; this.look.dy += e.movementY || 0; return; }
      if (drag && e.pointerType === 'mouse') {
        this.look.dx += e.clientX - drag.x;
        this.look.dy += e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    window.addEventListener('pointerup', (e) => {
      drag = null;
      if (e.pointerType !== 'mouse') return;
      if (e.button === 2) { this.keys.aim = false; return; }
      // মাউস আটকানো না গেলে: টেনে না সরিয়ে ছোট ক্লিক = আক্রমণ
      const c = this.click;
      this.click = null;
      if (c && !this.locked && e.button === 0 && Math.hypot(e.clientX - c.x, e.clientY - c.y) < 6 && performance.now() - c.t < 350) this.emit('attack');
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ফোন: বাম পাশে জয়স্টিক, ডান পাশে টেনে ক্যামেরা ঘোরানো
    const joyEl = touchRoot.querySelector('.joy'), knob = touchRoot.querySelector('.knob');
    let joyId = null, jc = null;
    joyEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      try { joyEl.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      const r = joyEl.getBoundingClientRect();
      jc = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
      this.joy.active = true;
      moveJoy(e);
    });
    const moveJoy = (e) => {
      if (e.pointerId !== joyId) return;
      let dx = (e.clientX - jc.x) / jc.R, dy = (e.clientY - jc.y) / jc.R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.joy.x = dx; this.joy.y = -dy;
      knob.style.transform = `translate(${dx * jc.R * 0.6}px, ${dy * jc.R * 0.6}px)`;
    };
    joyEl.addEventListener('pointermove', moveJoy);
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; this.joy.active = false; this.joy.x = this.joy.y = 0;
      knob.style.transform = '';
    };
    joyEl.addEventListener('pointerup', endJoy);
    joyEl.addEventListener('pointercancel', endJoy);
    const lookEl = touchRoot.querySelector('.lookpad');
    let lookId = null, lp = null;
    lookEl.addEventListener('pointerdown', (e) => {
      lookId = e.pointerId; lp = { x: e.clientX, y: e.clientY };
      try { lookEl.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    });
    lookEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      this.look.dx += (e.clientX - lp.x) * 1.4;
      this.look.dy += (e.clientY - lp.y) * 1.4;
      lp = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    lookEl.addEventListener('pointerup', endLook);
    lookEl.addEventListener('pointercancel', endLook);
    touchRoot.querySelectorAll('[data-key]').forEach((btn) => {
      const k = btn.dataset.key;
      const hold = k === 'run' || k === 'space' || k === 'down' || k === 'block' || k === 'up' || k === 'left' || k === 'right';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { btn.setPointerCapture(e.pointerId); } catch (er) { /* */ }
        btn.classList.add('on');
        if (hold) this.touch[k] = true;
        if (k === 'fight') this.touch.fight = true; // ধরে রাখলে একটার পর একটা মার
        if (k === 'space') this.emit('jump');
        else if (!hold) this.emit(k);
      });
      const up = (e) => { e.preventDefault(); btn.classList.remove('on'); if (hold) this.touch[k] = false; if (k === 'fight') this.touch.fight = false; };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
}
