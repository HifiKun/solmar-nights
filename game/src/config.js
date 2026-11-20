// Every tuning number, colour and mission script in one place. Solmar is a
// fictional sun-soaked city: a road grid west of a beach, sea to the east.
export const SAVE_KEY = 'solmar-nights.save.v1';

export const WORLD = {
  half: 180,          // playable half-size (x and z)
  roadEvery: 60,      // road centre spacing
  roadWidth: 12,
  beachX: 150,        // sand starts here
  seaX: 188,          // water starts here
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  jumpSpeed: 8.5,
  gravity: 22,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  maxSpeed: 42,
  maxReverse: 12,
  turnRate: 1.9,
  drag: 0.35,
};

export const WANTED = {
  max: 5,
  decayDelay: 25,     // seconds without crime before a star fades
  decayEvery: 18,     // seconds per star after that
  steal: 1,
  hitPed: 1,
  shoot: 1,
  policePerStar: 1,
  maxPolice: 5,
};

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 500,
    intro: ['Mara Solis', 'Ray, I need wheels. There is a red Comet parked by the marina — take it and bring it to my garage on Harbor Row. No questions, no cops.'],
    steps: [
      { kind: 'steal', text: 'Steal the red Comet at the marina (walk up and press E)', target: [132, 0, -102] },
      { kind: 'deliver', text: 'Deliver the Comet to Mara\'s garage', target: [-120, 0, 60] },
    ],
    done: ['Mara Solis', 'Clean work, Ray. The Comet is mine now — and so is your cut. $500. I have more jobs when you are ready.'],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    reward: 800,
    intro: ['Mara Solis', 'A package is waiting at the pier warehouse. Pick it up and take it to the rooftop bar on Coral Street. The PD is watching the pier — expect heat.'],
    steps: [
      { kind: 'pickup', text: 'Pick up the package at the pier warehouse', target: [132, 0, 120] },
      { kind: 'deliver', text: 'Deliver the package to the rooftop bar — wanted level will rise', target: [-60, 0, -120] },
    ],
    done: ['Mara Solis', 'Delivered. $800. You drive like the devil himself, Ray.'],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    reward: 1200,
    intro: ['Mara Solis', 'The PD has your plate, Ray. They are coming in hot — three stars and climbing. Lose them. All of them. Then meet me at the beach house.'],
    steps: [
      { kind: 'escape', text: 'Lose the police — get wanted level to 0', target: null },
      { kind: 'deliver', text: 'Meet Mara at the beach house', target: [132, 0, 60] },
    ],
    done: ['Mara Solis', 'Ghosted them clean. $1,200. Solmar is starting to know your name.'],
  },
  {
    id: 'vault-night',
    title: 'Vault Night',
    reward: 2500,
    intro: ['Mara Solis', 'One last job, Ray. The Solmar Trust vault on Plaza Avenue. Take the cash, lose the cops, and bring it to the lighthouse. Do this and we are legends.'],
    steps: [
      { kind: 'rob', text: 'Rob the Solmar Trust vault on Plaza Avenue', target: [0, 0, 0] },
      { kind: 'deliver', text: 'Escape the heat and deliver the cash to the lighthouse', target: [132, 0, -60] },
    ],
    done: ['Mara Solis', 'We did it, Ray. $2,500 — and the whole city saw it. Solmar Nights, baby. The story continues...'],
  },
];

export const PALETTE = {
  sky: 0x87bfe8,
  fog: 0xa8c8e0,
  sun: 0xfff2d8,
  ground: 0x9a9a8e,
  road: 0x3a3d44,
  sidewalk: 0xb8b2a4,
  sand: 0xe8d29a,
  sea: 0x2a7fb8,
  building: [0xd8c8b0, 0xc8b8a8, 0xb8c4d0, 0xd0a890, 0xa8b8c8, 0xc0a0a0],
  neon: [0xff5c8a, 0x35e0ff, 0xffd23e, 0x7dff9a],
};

export const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xe8c832, 0x38b06a, 0xe8e8e8, 0x222226, 0x8a4fd2, 0xd2702e];
