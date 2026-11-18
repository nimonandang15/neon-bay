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
  punchRange: 2.6,
  punchDamage: 40,
  pistolDamage: 100,
  magSize: 12,
  reloadTime: 1.3,
};

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
    reward: 500,
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', text: 'Drive to the Pink Flamingo', target: { x: 200, z: -200 }, radius: 10 },
    ],
  },
  {
    id: 'm2',
    title: 'The Meridian Package',
    giver: 'Marla Voss',
    briefing:
      'A package is waiting at the Meridian docks, south pier. Pick it up and get it to the Skyline Bar on the north side. Two and a half minutes. The client does not like waiting.',
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
    reward: 2000,
    steps: [
      { type: 'survive', text: 'Lose the cops — survive 60 seconds at 3 stars', time: 60, stars: 3 },
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
