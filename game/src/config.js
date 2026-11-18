// Neon Bay — every tuning number, colour and story beat in one place.
// The city is a grid: blocks of BLOCK with ROAD-wide streets between them.
export const CITY = {
  pitch: 80, // distance between street centrelines
  road: 16, // street width
  halfBlocks: 4, // streets at -4..4 in each axis
  block: 64, // pitch - road
  bounds: 360, // playable radius from the centre
};

export const STEP = 1 / 60;

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 11,
  radius: 0.7,
  maxHp: 100,
  maxArmor: 100,
  punchRange: 2.6,
  punchDamage: 40,
  pistolDamage: 100,
  magSize: 12,
  reloadTime: 1.3,
};

// Weapons: slot, name, damage per hit, range, seconds between shots,
// magazine size, reserve carried, pellets per shot, spread, knockback,
// auto-fire, sound key. Melee weapons ignore mag/reserve.
export const WEAPONS = {
  fists: { slot: 1, name: 'Fists', melee: true, damage: 40, range: 2.6, rate: 0.45, mag: 0, reserve: 0, pellets: 1, spread: 0, knock: 1, sound: 'punch' },
  bat: { slot: 2, name: 'Baseball Bat', melee: true, damage: 70, range: 3.2, rate: 0.6, mag: 0, reserve: 0, pellets: 1, spread: 0, knock: 2.2, sound: 'bat' },
  pistol: { slot: 3, name: 'Pistol', melee: false, damage: 34, range: 60, rate: 0.28, mag: 12, reserve: 60, pellets: 1, spread: 0.012, knock: 0.6, sound: 'pistol', driveby: true },
  shotgun: { slot: 4, name: 'Shotgun', melee: false, damage: 14, range: 26, rate: 0.9, mag: 6, reserve: 30, pellets: 7, spread: 0.09, knock: 2.6, sound: 'shotgun', driveby: false },
  smg: { slot: 5, name: 'SMG', melee: false, damage: 18, range: 45, rate: 0.09, mag: 32, reserve: 128, pellets: 1, spread: 0.05, knock: 0.5, sound: 'smg', driveby: true, auto: true },
  rifle: { slot: 6, name: 'Rifle', melee: false, damage: 65, range: 120, rate: 0.7, mag: 10, reserve: 50, pellets: 1, spread: 0.004, knock: 1.2, sound: 'rifle', driveby: false },
};

export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'shotgun', 'smg', 'rifle'];

// Glowing pickups placed around the city: health, armor, weapons, the
// bribe marker and the hidden packages (10, one-time, +$100 each).
export const PICKUP_SPOTS = [
  { type: 'health', x: 200, z: -160, label: 'First Aid' },
  { type: 'health', x: -240, z: 240, label: 'First Aid' },
  { type: 'health', x: 60, z: 100, label: 'First Aid' },
  { type: 'armor', x: 240, z: -200, label: 'Body Armor' },
  { type: 'armor', x: -80, z: 120, label: 'Body Armor' },
  { type: 'armor', x: 120, z: -80, label: 'Body Armor' },
  { type: 'weapon', weapon: 'bat', x: 8, z: 148, label: 'Baseball Bat' },
  { type: 'weapon', weapon: 'shotgun', x: -240, z: 200, label: 'Shotgun' },
  { type: 'weapon', weapon: 'smg', x: 200, z: -240, label: 'SMG' },
  { type: 'weapon', weapon: 'rifle', x: 120, z: 80, label: 'Rifle' },
  { type: 'bribe', x: -120, z: -80, label: 'Bribe — $200 to drop a star' },
  { type: 'bribe', x: 80, z: -120, label: 'Bribe — $200 to drop a star' },
];

export const PACKAGE_SPOTS = [
  { x: 240, z: 40 }, { x: -240, z: -120 }, { x: 40, z: -240 }, { x: -40, z: 240 },
  { x: 240, z: 280 }, { x: -240, z: -280 }, { x: 120, z: 240 }, { x: -120, z: -240 },
  { x: 240, z: -280 }, { x: -240, z: 280 },
];

// The shop: walk up and press E. Prices in cash.
export const SHOP = {
  x: 40,
  z: 120,
  name: 'Neon Arms & Snacks',
  items: [
    { id: 'ammo', name: 'Ammo box', desc: '+60 reserve ammo (current gun)', price: 50 },
    { id: 'armor', name: 'Body armor', desc: 'Armor to 100', price: 100 },
    { id: 'health', name: 'Snack pack', desc: 'Health to 100', price: 75 },
  ],
};

// Vehicle variants: speed, acceleration, toughness, scale.
export const VEHICLES = {
  sedan: { label: 'Sedan', maxSpeed: 40, accel: 16, hp: 150, scale: 1 },
  sport: { label: 'Sports', maxSpeed: 52, accel: 22, hp: 110, scale: 0.96 },
  truck: { label: 'Truck', maxSpeed: 32, accel: 12, hp: 260, scale: 1.18 },
};

export const DISTRICTS = [
  { name: 'Coral Row', x: 0, z: 0 },
  { name: 'Meridian Docks', x: -240, z: 240 },
  { name: 'Skyline', x: 240, z: -240 },
  { name: 'Old Town', x: -240, z: -240 },
  { name: 'The Strip', x: 240, z: 240 },
  { name: 'Bay Beach', x: 0, z: 320 },
];

export const CAR = {
  accel: 16,
  brake: 34,
  reverseAccel: 10,
  maxSpeed: 40,
  maxReverse: 13,
  grip: 8,
  trafficSpeed: 11,
  trafficCount: 14,
  policeMaxSpeed: 44,
  policeHp: 120,
  playerCarHp: 150,
};

export const PED = {
  count: 26,
  walkSpeed: 2.2,
  runSpeed: 5.5,
  fleeRadius: 9,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 25, // seconds without a crime before stars start to fall
  decayInterval: 9, // seconds per lost star while calm
  policeCarPerStar: 1,
  maxPoliceCars: 4,
  officerAtStars: 2,
  maxOfficers: 3,
  bustedHold: 1.4, // seconds of officer contact to get busted
};

export const MISSIONS = [
  {
    id: 'm1',
    title: 'Keys to the City',
    giver: 'Marla Voss',
    briefing:
      'Rook, welcome to Neon Bay. First rule: nobody walks here. Jack any car on the street, then bring it to the Pink Flamingo on Coral Row. The crew is watching.',
    line: 'First rule, Rook: nobody walks in Neon Bay. Jack a car and bring it to the Pink Flamingo.',
    doneLine: 'Clean wheels, no heat. You drive like you belong here, Rook.',
    reward: 500,
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', text: 'Drive to the Pink Flamingo', target: { x: 200, z: -200 }, radius: 14 },
    ],
  },
  {
    id: 'm2',
    title: 'The Meridian Package',
    giver: 'Marla Voss',
    briefing:
      'A package is waiting at the Meridian docks, south pier. Pick it up and get it to the Skyline Bar on the north side. Two and a half minutes. The client does not like waiting.',
    line: 'Package at the Meridian docks, south pier. Skyline Bar, two and a half minutes. Do not keep the client waiting.',
    doneLine: 'Delivered, on time. The client sends his regards — and his cash.',
    reward: 1200,
    steps: [
      { type: 'goto', text: 'Pick up the package at the Meridian docks', target: { x: -240, z: 240 }, radius: 9 },
      { type: 'deliver', text: 'Deliver the package to the Skyline Bar', target: { x: 240, z: -240 }, radius: 9, time: 150 },
    ],
  },
  {
    id: 'm3',
    title: 'Heat Wave',
    giver: 'Marla Voss',
    briefing:
      'The Bay PD just put three stars on your head, Rook. Stay free for sixty seconds — no cuffs, no coffin — and the heat burns itself out. Drive like the whole city is watching, because it is.',
    line: 'Three stars, Rook. Stay free for sixty seconds and the heat burns itself out. Drive like the whole city is watching.',
    doneLine: 'Heat is gone. You made the whole department look slow, Rook.',
    reward: 2000,
    steps: [
      { type: 'survive', text: 'Lose the cops — survive 60 seconds at 3 stars', time: 60, stars: 3 },
    ],
  },
  {
    id: 'm4',
    title: 'The Informant',
    giver: 'Marla Voss',
    briefing:
      'A rat is selling the crew out from a corner in Old Town. He is marked red — take him down before he talks. Three minutes, and make it quiet. Quiet is optional.',
    line: 'The rat is marked red in Old Town. Take him down before he talks. Three minutes — quiet is optional.',
    doneLine: 'The rat stopped talking. Permanently. The crew owes you one.',
    reward: 1500,
    steps: [
      { type: 'takedown', text: 'Take down the informant (red marker)', target: { x: -240, z: -120 }, radius: 60, time: 180 },
    ],
  },
  {
    id: 'm5',
    title: 'The Long Way Home',
    giver: 'Marla Voss',
    briefing:
      'Three stars and a full tank, Rook. Get to the Bay Beach car park in two minutes with the PD still on your tail. If they catch you, the crew will not know you.',
    line: 'Three stars and a full tank. Bay Beach car park, two minutes, PD on your tail. If they catch you, the crew will not know you.',
    doneLine: 'You outran the whole department with the beach in your mirror. Beautiful.',
    reward: 1800,
    steps: [
      { type: 'escape', text: 'Reach Bay Beach before the timer runs out', target: { x: 0, z: 300 }, radius: 12, time: 120, stars: 3 },
    ],
  },
  {
    id: 'm6',
    title: 'Bodyguard',
    giver: 'Marla Voss',
    briefing:
      'Vic is holding the Skyline Bar door and the PD wants him gone. Keep him standing for sixty seconds — if Vic falls, the job fails. You have the guns, use them.',
    line: 'Vic is holding the Skyline Bar door and the PD wants him gone. Sixty seconds, Rook. Keep him standing.',
    doneLine: 'Vic is still standing, and so is the crew. That was bodyguard work, Rook.',
    reward: 2500,
    steps: [
      { type: 'protect', text: 'Keep Vic alive for 60 seconds', target: { x: 240, z: -240 }, radius: 14, time: 60 },
    ],
  },
];

export const PALETTE = {
  sky: 0x87b5e0,
  fog: 0xa8c6e0,
  sun: 0xfff2d0,
  ground: 0x3a3f4a,
  sidewalk: 0x8d929e,
  roadLine: 0xf5d76e,
  building: [0xe8b04b, 0x4b7fb8, 0xd96a6a, 0x7fb069, 0xb678d9, 0x5bc8c8, 0xe07a5f, 0x9aa5b1],
  neon: [0xff2e88, 0x00e5ff, 0xffe600, 0x7cff00, 0xff6b00],
  car: [0xd93025, 0x1f6fd6, 0xf2c200, 0x7a4fd0, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x222831],
  police: 0x1c2733,
  pedSkin: [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac],
  pedShirt: [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1],
  playerShirt: 0x19c2ff,
  playerPants: 0x232a33,
};

export const SAVE_KEY = 'neon-bay.save.v1';
export const START_CASH = 150;
