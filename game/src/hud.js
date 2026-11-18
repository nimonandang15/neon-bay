// The HUD: health, wanted stars, cash, speed, mission objective, a live
// 2D minimap, toasts and banners — all DOM over the WebGL canvas.
import { CITY, DISTRICTS, MISSIONS } from './config.js';

const MISSIONS_INDEX = Object.fromEntries(MISSIONS.map((m, i) => [m.id, i]));

// Rows for the police response panel: pursuing cars (callsign, distance,
// status), officers on foot, and the helicopter spotlight at 4-5 stars.
function policeRowsFor(g) {
  const rows = [];
  const p = g.player.pos;
  // Helicopter first — it is the most distinctive unit on the board.
  if (g.police.heli) {
    rows.push({ call: 'HELI-1', dist: 'AIR', status: 'SPOTLIGHT ON YOU', cls: 'spot' });
  }
  for (const car of g.police.cars) {
    const d = Math.round(Math.hypot(car.pos.x - p.x, car.pos.z - p.z));
    const blocked = g.police.roadblock.includes(car);
    rows.push({
      call: car.callsign || 'UNIT',
      dist: `${d} m`,
      status: blocked ? 'ROADBLOCK' : d < 12 ? 'RAMMING' : 'PURSUIT',
      cls: blocked ? 'block' : d < 12 ? 'ram' : 'pursuit',
    });
  }
  for (const off of g.police.officers) {
    if (off.protect) continue; // m6 bodyguards are not pursuers
    const d = Math.round(Math.hypot(off.pos.x - p.x, off.pos.z - p.z));
    rows.push({ call: off.callsign || 'OFFICER', dist: `${d} m`, status: 'ON FOOT', cls: 'foot' });
  }
  return rows.slice(0, 6);
}

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('health-fill'),
    healthText: $('health-text'),
    armor: $('armor-fill'),
    armorText: $('armor-text'),
    stars: $('stars'),
    cash: $('cash'),
    speed: $('speed'),
    speedUnit: $('speed-unit'),
    objective: $('objective'),
    timer: $('mission-timer'),
    distance: $('distance'),
    ammo: $('ammo'),
    weaponName: $('weapon-name'),
    weaponSlots: $('weapon-slots'),
    packages: $('packages'),
    taxiHint: $('taxi-hint'),
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
    missionNum: $('mission-num'),
    missionName: $('mission-name'),
    missionFill: $('mission-fill'),
    missionNext: $('mission-next'),
    policePanel: $('police-panel'),
    policeRows: $('police-rows'),
    dialogue: $('dialogue'),
    dlgPortrait: $('dlg-portrait'),
    dlgName: $('dlg-name'),
    dlgText: $('dlg-text'),
    districtName: $('district-name'),
    repLabel: $('rep-label'),
    repFill: $('rep-fill'),
    clock: $('clock'),
    radioStation: $('radio-station'),
    radioTrack: $('radio-track'),
    carName: $('car-name'),
    carCond: $('car-cond'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let toastTimer = null;
  let bannerTimer = null;
  let hitTimer = null;
  let dlgTimer = null;
  // Cached values so per-frame HUD updates only touch the DOM on change.
  const cache = {};
  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }
  function districtFor(x, z) {
    let best = DISTRICTS[0];
    let bd = Infinity;
    for (const d of DISTRICTS) {
      const dd = (d.x - x) * (d.x - x) + (d.z - z) * (d.z - z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best.name;
  }
  const REP_RANKS = [[400, 'ROOKIE'], [1000, 'HUSTLER'], [2000, 'WHEELMAN'], [Infinity, 'KINGPIN']];
  function repFor(g) {
    const pts = g.missions.completed.size * 400 + g.pickups.collected * 100
      + g.stats.kills * 25 + g.stats.carsStolen * 10;
    let prev = 0;
    let rank = 'ROOKIE';
    for (const [cap, name] of REP_RANKS) {
      rank = name;
      if (pts < cap) return { pts, rank, pct: Math.round(((pts - prev) / (cap - prev)) * 100) };
      prev = cap;
    }
    return { pts, rank, pct: 100 };
  }
  const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  function clockFor(dayT, day) {
    const h = (((dayT - 0.25) * 24 + 12) % 24 + 24) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${DAY_NAMES[((day % 7) + 7) % 7]} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  return {
    setHealth(hp) {
      const pct = Math.max(0, Math.min(100, hp));
      el.health.style.width = `${pct}%`;
      el.health.style.background = pct > 50 ? '#2ecc71' : pct > 25 ? '#f39c12' : '#e74c3c';
      el.healthText.textContent = `${Math.ceil(pct)}`;
    },
    setArmor(a) {
      const pct = Math.max(0, Math.min(100, a));
      el.armor.style.width = `${pct}%`;
      el.armorText.textContent = `${Math.ceil(pct)}`;
    },
    setWeapon(name, mag, reserve, current, owned, mags, reserves) {
      el.weaponName.textContent = name;
      el.ammo.textContent = mag == null ? '' : `◉ ${mag} / ${reserve}`;
      const slots = [
        ['1', 'Fists', '✊', 'fists'], ['2', 'Bat', '🏏', 'bat'], ['3', 'Pistol', '🔫', 'pistol'],
        ['4', 'Shotgun', '💥', 'shotgun'], ['5', 'SMG', '🔫', 'smg'], ['6', 'Rifle', '🎯', 'rifle'],
      ];
      el.weaponSlots.innerHTML = slots.map(([n, label, icon, id]) => {
        const has = owned[id];
        const cur = id === current;
        let ammo = '';
        if (has) {
          if (id === 'fists' || id === 'bat') ammo = '—';
          else ammo = `${mags?.[id] ?? 0}/${reserves?.[id] ?? 0}`;
        }
        return `<span class="wslot${cur ? ' cur' : ''}${has ? '' : ' locked'}" title="${label}">${icon}<b>${n}</b><i>${ammo}</i></span>`;
      }).join('');
    },
    setPackages(n, total) {
      el.packages.textContent = `Packages ${n}/${total}`;
    },
    setTaxiHint(text) {
      el.taxiHint.textContent = text || '';
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
    // Mission briefing panel (top-left): name + number, objective, stage bar,
    // NEXT line. Free-roam state when no mission is running.
    setMission(mission, stepIndex, timerSeconds) {
      if (!mission) {
        setText(el.missionNum, 'mnum', 'FREE ROAM');
        setText(el.missionName, 'mname', 'Neon Bay');
        setText(el.objective, 'obj', 'Press M to start your first job');
        el.missionFill.style.width = '0%';
        setText(el.missionNext, 'mnext', 'NEXT: Find Marla Voss — press M for a job');
        setText(el.timer, 'mtimer', '');
        this.setDistance(null);
        return;
      }
      const total = mission.steps.length;
      const step = mission.steps[stepIndex];
      const idx = MISSIONS_INDEX[mission.id] ?? 0;
      setText(el.missionNum, 'mnum', `MISSION ${idx + 1}/6`);
      setText(el.missionName, 'mname', mission.title.toUpperCase());
      setText(el.objective, 'obj', step ? step.text : '');
      el.missionFill.style.width = `${Math.round(((stepIndex + 1) / total) * 100)}%`;
      const next = mission.steps[stepIndex + 1];
      setText(el.missionNext, 'mnext', next ? `NEXT: ${next.text}` : 'NEXT: Finish the job');
      if (timerSeconds != null) this.setTimer(timerSeconds);
      else setText(el.timer, 'mtimer', '');
    },
    // Police response panel: live pursuing units with callsign, distance,
    // status. Rows: { call, dist, status, cls }. Hidden when empty.
    setPoliceList(rows) {
      if (!rows || rows.length === 0) {
        el.policePanel.classList.remove('show');
        return;
      }
      el.policePanel.classList.add('show');
      const html = rows.map((r) => `<div class="prow"><span class="pcall">${r.call}</span><span class="pdist">${r.dist}</span><span class="pstat ${r.cls}">${r.status}</span></div>`).join('');
      if (cache.prows !== html) {
        cache.prows = html;
        el.policeRows.innerHTML = html;
      }
    },
    showDialogue(name, role, text, color, ms) {
      const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      el.dlgPortrait.textContent = initials;
      el.dlgPortrait.style.background = color || '#ff2e88';
      setText(el.dlgName, 'dlgname', `${name.toUpperCase()} · ${role}`);
      setText(el.dlgText, 'dlgtext', text);
      el.dialogue.classList.add('show');
      clearTimeout(dlgTimer);
      dlgTimer = setTimeout(() => el.dialogue.classList.remove('show'), ms || 6000);
    },
    setDistrict(name) {
      setText(el.districtName, 'district', (name || 'CORAL ROW').toUpperCase());
    },
    setRep(g) {
      const r = repFor(g);
      setText(el.repLabel, 'rep', `REP · ${r.rank} — ${r.pts.toLocaleString('en-US')} PTS`);
      el.repFill.style.width = `${r.pct}%`;
    },
    setClock(dayT, day) {
      setText(el.clock, 'clock', clockFor(dayT, day));
    },
    setRadio(station, track) {
      setText(el.radioStation, 'rstation', `♪ ${station}`);
      setText(el.radioTrack, 'rtrack', track || '');
    },
    setVehicle(name, cond, driving) {
      setText(el.carName, 'carname', driving ? name : '');
      setText(el.carCond, 'carcond', driving ? `CONDITION ${Math.max(0, Math.round(cond))}%` : '');
    },
    // Recompute every HUD panel from the live game state (used in shot mode
    // and once a second in live play to catch anything the per-frame calls
    // missed).
    refreshAll(g) {
      this.setMission(g.missions.current, g.missions.stepIndex,
        g.missions.current && g.missions.currentStep() && g.missions.currentStep().time != null
          ? g.missions.timer : null);
      // Protect steps show Vic's live HP instead of the static step text.
      const step = g.missions.current && g.missions.currentStep();
      if (step && step.type === 'protect' && g.missions.vicPed) {
        this.setObjective(`Keep Vic alive — Vic ${Math.round(g.missions.vicHp)} HP`);
      }
      this.setPoliceList(policeRowsFor(g));
      this.setDistrict(districtFor(g.player.pos.x, g.player.pos.z));
      this.setRep(g);
      this.setClock(g.dayT, g.day);
      this.setRadio(g.audio.stationName(), g.audio.trackName());
      const driving = !g.player.onFoot && g.player.car;
      this.setVehicle(driving ? g.player.car.variantLabel : '', driving ? (g.player.car.hp / g.player.car.maxHp) * 100 : 0, !!driving);
    },
    hitmarker() {
      el.crosshair.classList.add('hit');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.crosshair.classList.remove('hit'), 160);
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
      // Taxi passenger / destination.
      if (g.pickups.taxi) {
        const tx = g.pickups.taxi;
        if (tx.riding) dot(tx.dest.x, tx.dest.z, '#ffe600', 4);
        else dot(tx.waiting.x, tx.waiting.z, '#ffe600', 3);
      }
      // Named districts.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const d of DISTRICTS) {
        ctx.fillText(d.name, toMap(d.x), toMap(d.z));
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
