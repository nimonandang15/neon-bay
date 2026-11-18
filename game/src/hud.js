// The HUD: health, wanted stars, cash, speed, mission objective, a live
// 2D minimap, toasts and banners — all DOM over the WebGL canvas.
import { CITY } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('health-fill'),
    healthText: $('health-text'),
    stars: $('stars'),
    cash: $('cash'),
    speed: $('speed'),
    speedUnit: $('speed-unit'),
    objective: $('objective'),
    timer: $('timer'),
    distance: $('distance'),
    ammo: $('ammo'),
    toast: $('toast'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    missionCard: $('mission-card'),
    missionTitle: $('mission-title'),
    missionGiver: $('mission-giver'),
    missionBrief: $('mission-brief'),
    damage: $('damage-flash'),
    minimap: $('minimap'),
    crosshair: $('crosshair'),
    hint: $('hint'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let toastTimer = null;
  let bannerTimer = null;

  return {
    setHealth(hp) {
      const pct = Math.max(0, Math.min(100, hp));
      el.health.style.width = `${pct}%`;
      el.health.style.background = pct > 50 ? '#2ecc71' : pct > 25 ? '#f39c12' : '#e74c3c';
      el.healthText.textContent = `${Math.ceil(pct)}`;
    },
    setStars(n) {
      el.stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
      el.stars.style.color = n === 0 ? '#7f8c9b' : n <= 2 ? '#f5d76e' : '#ff4757';
    },
    setCash(c) {
      el.cash.textContent = `$${c.toLocaleString('en-US')}`;
    },
    setSpeed(kmh, driving) {
      el.speed.textContent = driving ? String(Math.round(Math.abs(kmh))) : '';
      el.speedUnit.textContent = driving ? 'km/h' : '';
    },
    setObjective(text) {
      el.objective.textContent = text;
    },
    setTimer(seconds) {
      if (seconds == null) {
        el.timer.textContent = '';
        return;
      }
      const s = Math.max(0, Math.ceil(seconds));
      el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.timer.style.color = s <= 15 ? '#ff4757' : '#ffe600';
    },
    setDistance(d) {
      el.distance.textContent = d == null ? '' : `${Math.round(d)}m`;
    },
    setAmmo(n) {
      el.ammo.textContent = n == null ? '' : `◉ ${n}`;
    },
    setHint(text) {
      el.hint.textContent = text || '';
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
    },
    showBanner(title, sub) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 4200);
    },
    showMissionCard(mission) {
      el.missionTitle.textContent = mission.title;
      el.missionGiver.textContent = `from ${mission.giver} — $${mission.reward.toLocaleString('en-US')}`;
      el.missionBrief.textContent = mission.briefing;
      el.missionCard.classList.add('show');
      setTimeout(() => el.missionCard.classList.remove('show'), 7000);
    },
    flashDamage() {
      el.damage.classList.add('show');
      setTimeout(() => el.damage.classList.remove('show'), 220);
    },
    setCrosshair(on) {
      el.crosshair.style.display = on ? 'block' : 'none';
    },
    drawMinimap(g) {
      const S = 168;
      const ctx = mapCtx;
      const scale = S / (CITY.bounds * 2 + 40);
      const toMap = (v) => (v + CITY.bounds + 20) * scale;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(10, 16, 28, 0.82)';
      ctx.fillRect(0, 0, S, S);
      // Streets.
      ctx.strokeStyle = '#5d6b7a';
      ctx.lineWidth = 5;
      for (let i = -CITY.halfBlocks; i <= CITY.halfBlocks; i += 1) {
        const c = toMap(i * CITY.pitch);
        ctx.beginPath();
        ctx.moveTo(c, 0);
        ctx.lineTo(c, S);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, c);
        ctx.lineTo(S, c);
        ctx.stroke();
      }
      const dot = (x, z, color, r) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(toMap(x), toMap(z), r, 0, Math.PI * 2);
        ctx.fill();
      };
      // Mission marker.
      const step = g.missions.currentStep();
      if (g.missions.current && step && step.target) {
        const pulse = 5 + Math.sin(g.time * 5) * 2;
        ctx.strokeStyle = '#ff2e88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(toMap(step.target.x), toMap(step.target.z), pulse, 0, Math.PI * 2);
        ctx.stroke();
        dot(step.target.x, step.target.z, '#ff2e88', 3.5);
      }
      // Police.
      for (const car of g.police.cars) dot(car.pos.x, car.pos.z, '#3d7bff', 3);
      for (const off of g.police.officers) dot(off.pos.x, off.pos.z, '#3d7bff', 2.5);
      // Traffic.
      for (const car of g.cars) {
        if (car.kind === 'traffic') dot(car.pos.x, car.pos.z, '#f5d76e', 2);
      }
      // Player: a white triangle pointing along the heading.
      const px = toMap(g.player.pos.x);
      const pz = toMap(g.player.pos.z);
      const h = g.player.car ? g.player.car.heading : g.player.heading;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(px + Math.sin(h) * 7, pz + Math.cos(h) * 7);
      ctx.lineTo(px + Math.sin(h + 2.5) * 5, pz + Math.cos(h + 2.5) * 5);
      ctx.lineTo(px + Math.sin(h - 2.5) * 5, pz + Math.cos(h - 2.5) * 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    },
  };
}
