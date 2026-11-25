// Floor plans. Units are meters; x → east, z → south (north = top of the blueprint), y → up.
//
// walls: ['h', z, x0, x1, opts]  horizontal wall along x at depth z
//        ['v', x, z0, z1, opts]  vertical wall along z at position x
//   opts.ext   exterior (thicker) wall      opts.rail  balcony railing instead of a wall
//   opts.open  openings: { t: 'window'|'tall'|'slider'|'door'|'opening', c: center (m from wall start), w: width, sill?, head?, front? }
// furniture: [modelId, x, z, rotationDegrees, extra?]  (rotation 0 = front faces south / +z)
export const OPENING_DEFAULTS = {
  window: { sill: 0.9, head: 2.2 },
  tall: { sill: 0.15, head: 2.45 },
  slider: { sill: 0, head: 2.3 },
  door: { sill: 0, head: 2.1 },
  opening: { sill: 0, head: 2.25 },
};

export const BLUEPRINTS = [
  {
    id: 'the-home', name: 'The Home', blurb: 'Our sketch: L-shaped plan with a game room by the front door, study, walk-in closet, big master suite and a balcony.',
    height: 2.8, spawn: [4.4, 16.6, 0],
    footprint: [[0, 0, 13, 11.6], [0, 11.6, 5.2, 17.4]],
    rooms: [
      { name: 'Living Room', type: 'living', rect: [0, 0, 6.75, 4.9] },
      { name: 'Dining', type: 'dining', rect: [0, 4.9, 6.75, 6.75] },
      { name: 'Kitchen', type: 'kitchen', rect: [0, 6.75, 6.75, 11.6] },
      { name: 'Game Room', type: 'game', rect: [0, 11.6, 5.2, 17.4] },
      { name: 'Bathroom', type: 'bath', rect: [6.75, 0, 9.0, 4.4] },
      { name: 'Walk-in Closet', type: 'closet', rect: [6.75, 4.4, 9.0, 7.25] },
      { name: 'Study', type: 'office', rect: [6.75, 7.25, 9.0, 9.9] },
      { name: 'Hall', type: 'hall', rect: [6.75, 9.9, 9.0, 11.6] },
      { name: 'Master Suite', type: 'bedroom', rect: [9.0, 0, 13, 11.6] },
      { name: 'Balcony', type: 'outdoor', rect: [0, -2.0, 6.75, 0] },
    ],
    walls: [
      ['h', 0, 0, 13, { ext: true, open: [{ t: 'slider', c: 3.4, w: 2.4 }, { t: 'window', c: 5.6, w: 1.0 }, { t: 'window', c: 7.9, w: 0.7, sill: 1.5, head: 2.15 }] }],
      ['v', 0, 0, 17.4, { ext: true, open: [{ t: 'window', c: 2.6, w: 2.0 }, { t: 'window', c: 5.8, w: 1.4 }, { t: 'window', c: 14.3, w: 2.0 }] }],
      ['h', 17.4, 0, 5.2, { ext: true, open: [{ t: 'window', c: 1.6, w: 1.6 }, { t: 'door', c: 4.4, w: 1.0, front: true }] }],
      ['v', 5.2, 11.6, 17.4, { ext: true }],
      ['h', 11.6, 5.2, 13, { ext: true, open: [{ t: 'window', c: 0.75, w: 0.9 }, { t: 'window', c: 5.8, w: 2.0 }] }],
      ['v', 13, 0, 11.6, { ext: true, open: [{ t: 'window', c: 4.0, w: 1.8 }, { t: 'window', c: 8.5, w: 1.8 }] }],
      ['h', 11.6, 0, 3.5, {}], // the half wall between kitchen & game room
      ['v', 6.75, 0, 7.25, {}],
      ['v', 6.75, 7.25, 9.9, { open: [{ t: 'door', c: 1.3, w: 0.85 }] }],
      ['h', 4.4, 6.75, 9.0, {}],
      ['h', 7.25, 6.75, 9.0, {}],
      ['h', 9.9, 6.75, 9.0, {}],
      ['v', 9.0, 0, 11.6, { open: [{ t: 'door', c: 2.2, w: 0.8 }, { t: 'door', c: 5.8, w: 0.8 }, { t: 'door', c: 10.75, w: 0.9 }] }],
      ['h', -2.0, 0, 6.75, { rail: true }],
      ['v', 0, -2.0, 0, { rail: true }],
      ['v', 6.75, -2.0, 0, { rail: true }],
    ],
    furniture: [
      // Living
      ['sectional-l', 1.2, 3.3, 90], ['tv-console', 6.46, 2.2, -90], ['coffee-table', 3.4, 2.5, 90], ['rug', 3.3, 2.6, 90],
      ['armchair', 2.45, 0.95, 30], ['floor-lamp', 0.45, 1.3, 0], ['plant-fiddle', 6.2, 0.55, 0], ['wall-art', 6.66, 4.0, -90],
      ['mini-split', 1.2, 0.21, 0], ['curtains', 3.4, 0.17, 0], ['ceiling-fan', 3.4, 2.5, 0], ['throw-pillow', 1.7, 4.2, 20, { y: 0.62 }],
      // Dining
      ['dining-table', 3.2, 5.85, 0], ['dining-chair', 2.75, 5.05, 0], ['dining-chair', 3.65, 5.05, 0], ['dining-chair', 2.75, 6.65, 180],
      ['dining-chair', 3.65, 6.65, 180], ['dining-chair', 1.95, 5.85, 90], ['dining-chair', 4.45, 5.85, -90], ['pendant-light', 3.2, 5.85, 0],
      // Kitchen
      ['fridge', 0.475, 7.45, 90], ['kitchen-counter', 0.41, 8.5, 90], ['kitchen-sink', 0.41, 9.7, 90], ['stove-range', 0.425, 10.68, 90],
      ['kitchen-island', 2.75, 9.7, 0], ['bar-stool', 2.25, 8.95, 0], ['bar-stool', 3.25, 8.95, 0],
      ['pendant-light', 2.25, 9.7, 0], ['pendant-light', 3.25, 9.7, 0], ['plant-small', 3.5, 9.85, 0, { y: 0.94 }],
      // Game room
      ['pool-table', 2.0, 14.2, 90], ['tv-console', 4.875, 15.0, -90], ['bean-bag', 3.65, 14.5, 90], ['bean-bag', 3.65, 15.6, 90],
      ['arcade-cabinet', 0.5, 16.3, 90], ['dartboard', 5.075, 13.0, -90], ['wardrobe', 3.15, 17.0, 180], ['basketball', 1.0, 12.3, 0],
      ['pendant-light', 2.0, 13.6, 0], ['pendant-light', 2.0, 14.8, 0],
      // Bathroom
      ['bathtub', 7.66, 0.5, 0], ['toilet', 7.16, 2.0, 90], ['vanity', 7.6, 4.09, 180], ['shower', 8.49, 3.1, 0], ['ceiling-light', 7.9, 2.2, 0],
      // Walk-in closet
      ['wardrobe', 7.11, 5.2, 90], ['wardrobe', 7.11, 6.45, 90], ['ceiling-light', 7.9, 5.8, 0],
      // Study
      ['desk', 8.59, 8.6, -90], ['office-chair', 7.9, 8.6, 90], ['bookshelf', 7.6, 9.66, 180], ['guitar-stand', 7.15, 7.65, 30],
      ['table-lamp', 8.6, 9.1, 0, { y: 0.75 }], ['ceiling-light', 7.9, 8.6, 0],
      // Hall
      ['snake-plant', 8.6, 11.25, 0],
      // Master suite
      ['bed-king', 11.3, 1.175, 0], ['nightstand', 9.95, 0.3, 0], ['nightstand', 12.6, 0.3, 0],
      ['table-lamp', 9.95, 0.3, 0, { y: 0.55 }], ['table-lamp', 12.6, 0.3, 0, { y: 0.55 }], ['wall-art', 11.3, 0.12, 0, { y: 1.45 }],
      ['dresser', 9.31, 4.0, 90], ['ceiling-fan', 11.3, 3.6, 0], ['mini-split', 12.79, 6.2, -90],
      ['curtains', 12.83, 4.0, -90], ['curtains', 12.83, 8.5, -90],
      ['loveseat', 9.535, 8.4, 90], ['side-table', 10.75, 9.6, 0], ['armchair', 12.1, 9.4, -120], ['floor-lamp', 12.6, 7.4, 0], ['plant-fiddle', 12.5, 11.1, 0],
      // Balcony
      ['patio-set', 2.0, -1.0, 0], ['sun-lounger', 4.6, -1.0, 90], ['plant-fiddle', 6.2, -1.5, 0],
    ],
  },
  {
    id: 'studio-loft', name: 'Studio Loft', blurb: 'Open studio with a sleeping nook, compact bath and a full-width balcony.',
    height: 2.8, spawn: [5.5, 0.8, 180],
    footprint: [[0, 0, 10, 8]],
    rooms: [
      { name: 'Kitchen', type: 'kitchen', rect: [0, 0, 4, 3] },
      { name: 'Entry', type: 'hall', rect: [4, 0, 7, 3] },
      { name: 'Bathroom', type: 'bath', rect: [7, 0, 10, 3] },
      { name: 'Living', type: 'living', rect: [0, 3, 7, 8] },
      { name: 'Sleep Nook', type: 'bedroom', rect: [7, 3, 10, 8] },
      { name: 'Balcony', type: 'outdoor', rect: [0, 8, 10, 10] },
    ],
    walls: [
      ['h', 0, 0, 10, { ext: true, open: [{ t: 'door', c: 5.5, w: 0.95, front: true }, { t: 'window', c: 8.5, w: 0.6, sill: 1.5, head: 2.1 }] }],
      ['v', 0, 0, 8, { ext: true, open: [{ t: 'window', c: 2, w: 1.4 }] }],
      ['v', 10, 0, 8, { ext: true, open: [{ t: 'window', c: 5.5, w: 1.6 }] }],
      ['h', 8, 0, 10, { ext: true, open: [{ t: 'slider', c: 3.5, w: 2.4 }, { t: 'window', c: 8.5, w: 1.4 }] }],
      ['v', 7, 0, 3, { open: [{ t: 'door', c: 1.5, w: 0.8 }] }],
      ['h', 3, 7, 10, {}],
      ['h', 10, 0, 10, { rail: true }], ['v', 0, 8, 10, { rail: true }], ['v', 10, 8, 10, { rail: true }],
    ],
    furniture: [
      ['fridge', 0.55, 0.475, 0], ['kitchen-sink', 1.6, 0.41, 0], ['stove-range', 2.58, 0.425, 0], ['kitchen-counter', 3.56, 0.41, 0],
      ['kitchen-island', 2.0, 2.1, 0], ['bar-stool', 1.5, 2.95, 180], ['bar-stool', 2.5, 2.95, 180],
      ['tv-console', 0.325, 5.5, 90], ['sofa-3seat', 3.6, 5.5, -90], ['coffee-table', 2.2, 5.5, 90], ['rug', 2.3, 5.5, 90],
      ['armchair', 1.0, 7.3, 135], ['floor-lamp', 0.4, 7.6, 0], ['plant-fiddle', 6.5, 7.4, 0],
      ['round-table', 5.6, 4.0, 0], ['dining-chair', 5.6, 3.2, 0], ['dining-chair', 5.6, 4.85, 180],
      ['bed-queen', 8.5, 4.135, 0], ['nightstand', 7.45, 3.3, 0], ['nightstand', 9.55, 3.3, 0], ['table-lamp', 7.45, 3.3, 0, { y: 0.55 }],
      ['wardrobe', 9.6, 7.2, -90], ['ceiling-fan', 8.5, 5.5, 0],
      ['bathtub', 8.85, 0.5, 0], ['toilet', 9.55, 2.3, -90], ['vanity', 7.65, 2.69, 180],
      ['mini-split', 0.21, 3.9, 90], ['curtains', 3.5, 7.83, 180], ['pendant-light', 2.0, 2.1, 0],
      ['patio-set', 7.5, 9.0, 0], ['plant-fiddle', 0.5, 9.5, 0],
    ],
  },
  {
    id: 'penthouse', name: 'Penthouse', blurb: 'Huge great room, floor-to-ceiling glass, primary suite with ensuite and a wraparound terrace.',
    height: 3.0, spawn: [8, 0.8, 180],
    footprint: [[0, 0, 16, 12]],
    rooms: [
      { name: 'Kitchen', type: 'kitchen', rect: [0, 0, 6, 4] },
      { name: 'Entry', type: 'hall', rect: [6, 0, 10, 4] },
      { name: 'Great Room', type: 'living', rect: [0, 4, 10, 12] },
      { name: 'Closet', type: 'closet', rect: [10, 0, 12, 5] },
      { name: 'Ensuite', type: 'bath', rect: [12, 0, 16, 5] },
      { name: 'Primary Suite', type: 'bedroom', rect: [10, 5, 16, 12] },
      { name: 'Terrace', type: 'outdoor', rect: [0, 12, 16, 15] },
    ],
    walls: [
      ['h', 0, 0, 16, { ext: true, open: [{ t: 'window', c: 3, w: 2 }, { t: 'door', c: 8, w: 1.1, front: true }, { t: 'window', c: 14, w: 1, sill: 1.5 }] }],
      ['v', 0, 0, 12, { ext: true, open: [{ t: 'tall', c: 8, w: 4 }] }],
      ['h', 12, 0, 16, { ext: true, open: [{ t: 'slider', c: 3, w: 3 }, { t: 'slider', c: 7.5, w: 3 }, { t: 'slider', c: 13, w: 2.4 }] }],
      ['v', 16, 0, 12, { ext: true, open: [{ t: 'window', c: 2.5, w: 1, sill: 1.5 }, { t: 'window', c: 8.5, w: 2.5 }] }],
      ['v', 10, 0, 12, { open: [{ t: 'door', c: 6.2, w: 1 }] }],
      ['h', 5, 10, 16, { open: [{ t: 'door', c: 1, w: 0.8 }, { t: 'door', c: 4, w: 0.8 }] }],
      ['v', 12, 0, 5, {}],
      ['h', 15, 0, 16, { rail: true }], ['v', 0, 12, 15, { rail: true }], ['v', 16, 12, 15, { rail: true }],
    ],
    furniture: [
      ['fridge', 0.475, 0.55, 90], ['kitchen-sink', 0.41, 1.6, 90], ['stove-range', 0.425, 2.58, 90], ['kitchen-counter', 0.41, 3.56, 90],
      ['kitchen-island', 3.0, 2.2, 0], ['bar-stool', 2.5, 3.05, 180], ['bar-stool', 3.5, 3.05, 180], ['pendant-light', 2.6, 2.2, 0], ['pendant-light', 3.4, 2.2, 0],
      ['bookshelf', 9.765, 2.5, -90], ['plant-fiddle', 6.5, 0.5, 0],
      ['dining-table', 5.0, 5.6, 0], ['dining-chair', 4.55, 4.85, 0], ['dining-chair', 5.45, 4.85, 0], ['dining-chair', 4.55, 6.35, 180], ['dining-chair', 5.45, 6.35, 180],
      ['pendant-light', 5.0, 5.6, 0],
      ['tv-console', 9.71, 9.0, -90], ['sofa-3seat', 6.8, 9.0, 90], ['coffee-table', 8.0, 9.0, 90], ['rug', 7.8, 9.0, 90], ['armchair', 8.0, 11.0, 180],
      ['armchair', 1.0, 7.0, 90], ['floor-lamp', 0.4, 6.3, 0], ['guitar-stand', 1.0, 9.5, 60], ['plant-fiddle', 0.5, 11.5, 0], ['mini-split', 9.83, 11.2, -90],
      ['wardrobe', 10.36, 2.5, 90], ['wardrobe', 11.64, 2.5, -90],
      ['bathtub', 14.0, 0.5, 0], ['shower', 15.45, 4.49, 0], ['toilet', 15.55, 2.4, -90], ['vanity', 12.31, 2.6, 90],
      ['bed-king', 11.11, 9.0, 90], ['nightstand', 10.31, 7.65, 90], ['nightstand', 10.31, 10.35, 90], ['dresser', 15.69, 6.0, -90],
      ['armchair', 15.0, 11.0, -135], ['ceiling-fan', 12.5, 9.0, 0], ['mini-split', 15.89, 11.0, -90],
      ['patio-set', 9.0, 13.5, 0], ['plant-fiddle', 0.5, 14.5, 0], ['plant-fiddle', 15.5, 14.5, 0], ['hot-tub', 13.0, 13.6, 0], ['sun-lounger', 5.5, 13.5, 90],
    ],
  },
];
export const blueprintById = (id) => BLUEPRINTS.find((b) => b.id === id) || BLUEPRINTS[0];
