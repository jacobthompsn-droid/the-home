// Design styles. Every model color written as "@token" (e.g. "@fabric") pulls from the active style,
// so switching styles re-dresses the whole home. Add your own style by copying one below.
export const STYLES = [
  {
    id: 'modern', name: 'Modern Minimal', blurb: 'Crisp whites, black accents, warm white oak.',
    wall: '#f2f1ee', wallFinish: 'paint', trim: '#2b2b2b', ceiling: '#f7f7f5',
    floors: { main: 'whiteoak', bedroom: 'whiteoak', wet: 'tile_white', outdoor: 'deck' },
    pal: { fabric: '#d9d6cf', fabric2: '#3a3a3c', wood: '#c8a77e', woodDark: '#3b2f27', metal: '#1d1d1f', accent: '#c96f4a', accent2: '#7a8b7f', stone: '#e8e6e1', ceramic: '#f2f0ec', plant: '#4f7a43', cabinet: '#ecebe7', light: '#ffe2b8' },
  },
  {
    id: 'scandi', name: 'Scandinavian', blurb: 'Airy, light woods, soft blues and wool textures.',
    wall: '#f6f4ef', wallFinish: 'paint', trim: '#e8e4dc', ceiling: '#fafaf8',
    floors: { main: 'ash', bedroom: 'carpet_cream', wet: 'tile_white', outdoor: 'deck' },
    pal: { fabric: '#e6e1d6', fabric2: '#9fb0b8', wood: '#e2cba6', woodDark: '#8b7355', metal: '#c9c6c0', accent: '#d9a47e', accent2: '#a9bdb0', stone: '#f1efea', ceramic: '#ffffff', plant: '#5c8a4c', cabinet: '#f4f2ee', light: '#ffe8c6' },
  },
  {
    id: 'industrial', name: 'Industrial Loft', blurb: 'Exposed brick, leather, blackened steel, concrete.',
    wall: '#b8b2aa', wallFinish: 'brick', trim: '#2a2a2a', ceiling: '#d8d4ce',
    floors: { main: 'concrete', bedroom: 'walnut', wet: 'tile_dark', outdoor: 'deck' },
    pal: { fabric: '#6b4a35', fabric2: '#3d3f42', wood: '#7a5536', woodDark: '#3a2a1f', metal: '#2a2a2a', accent: '#b5732e', accent2: '#5f6b5b', stone: '#8d8d8a', ceramic: '#d8d4ce', plant: '#4a6b3a', cabinet: '#2f3134', light: '#ffcf8a' },
  },
  {
    id: 'boho', name: 'Boho Warm', blurb: 'Terracotta, rattan, layered textiles and lots of plants.',
    wall: '#efe3d3', wallFinish: 'plaster', trim: '#c9a57f', ceiling: '#f5ede2',
    floors: { main: 'oak', bedroom: 'carpet_sand', wet: 'terracotta', outdoor: 'deck' },
    pal: { fabric: '#e9d8b8', fabric2: '#c98b5e', wood: '#b98a5a', woodDark: '#6b4a33', metal: '#a67c52', accent: '#b5523b', accent2: '#d9a441', stone: '#e8dccb', ceramic: '#c97b52', plant: '#4e7d3a', cabinet: '#d9c4a5', light: '#ffd6a0' },
  },
  {
    id: 'japandi', name: 'Japandi', blurb: 'Calm, low furniture, natural wood, muted earth tones.',
    wall: '#ebe6dd', wallFinish: 'plaster', trim: '#5a5148', ceiling: '#f2eee7',
    floors: { main: 'ash', bedroom: 'ash', wet: 'tile_stone', outdoor: 'deck' },
    pal: { fabric: '#cfc5b4', fabric2: '#5a5148', wood: '#b89b77', woodDark: '#3e3730', metal: '#3a3631', accent: '#8c6a4f', accent2: '#7d8471', stone: '#d6d0c4', ceramic: '#e6e0d4', plant: '#5f7a4a', cabinet: '#c9b79a', light: '#ffe3bd' },
  },
  {
    id: 'midcentury', name: 'Mid-Century Modern', blurb: 'Teak, teal, mustard, tapered legs and globe lights.',
    wall: '#f1ebe0', wallFinish: 'paint', trim: '#6b4226', ceiling: '#f6f2ea',
    floors: { main: 'walnut', bedroom: 'walnut', wet: 'tile_white', outdoor: 'deck' },
    pal: { fabric: '#2f6f6a', fabric2: '#d99a2b', wood: '#9a6338', woodDark: '#5a3a22', metal: '#b08d57', accent: '#d9662b', accent2: '#e0b13a', stone: '#efe9df', ceramic: '#f3efe6', plant: '#4f7a43', cabinet: '#9a6338', light: '#ffd9a0' },
  },
  {
    id: 'coastal', name: 'Coastal Calm', blurb: 'Sandy neutrals, sea-glass blues, whitewashed wood.',
    wall: '#f4f6f6', wallFinish: 'paint', trim: '#ffffff', ceiling: '#ffffff',
    floors: { main: 'whiteoak', bedroom: 'carpet_cream', wet: 'tile_white', outdoor: 'deck' },
    pal: { fabric: '#f2efe8', fabric2: '#5f8fb0', wood: '#d6c3a5', woodDark: '#8a7a64', metal: '#b9bec2', accent: '#3f7ea6', accent2: '#9cc5c9', stone: '#f4f2ee', ceramic: '#ffffff', plant: '#5f8f5a', cabinet: '#ffffff', light: '#fff0d6' },
  },
];
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

export const FLOOR_TYPES = {
  whiteoak: { name: 'White Oak', kind: 'wood', color: '#cdb38f' },
  oak: { name: 'Honey Oak', kind: 'wood', color: '#b58a5a' },
  ash: { name: 'Pale Ash', kind: 'wood', color: '#dccbad' },
  walnut: { name: 'Walnut', kind: 'wood', color: '#6b4a33' },
  herringbone: { name: 'Herringbone', kind: 'herringbone', color: '#b9925f' },
  concrete: { name: 'Polished Concrete', kind: 'concrete', color: '#a19e99' },
  tile_white: { name: 'White Tile', kind: 'tile', color: '#eeeeea', grout: '#c9c9c4', size: 0.6 },
  tile_dark: { name: 'Slate Tile', kind: 'tile', color: '#3d3f42', grout: '#2a2b2d', size: 0.6 },
  tile_stone: { name: 'Stone Tile', kind: 'tile', color: '#bdb5a6', grout: '#a39b8c', size: 0.6 },
  terracotta: { name: 'Terracotta', kind: 'tile', color: '#b66a45', grout: '#8f5034', size: 0.3 },
  marble: { name: 'Marble', kind: 'marble', color: '#ecebe7' },
  carpet_cream: { name: 'Cream Carpet', kind: 'carpet', color: '#e6dccb' },
  carpet_gray: { name: 'Gray Carpet', kind: 'carpet', color: '#9a9a9a' },
  carpet_sand: { name: 'Sand Carpet', kind: 'carpet', color: '#cdb796' },
  deck: { name: 'Outdoor Deck', kind: 'deck', color: '#8a7560' },
};
export const WALL_FINISHES = { paint: 'Paint', plaster: 'Limewash Plaster', brick: 'Exposed Brick', panel: 'Wood Paneling' };

// Which style floor applies to which room type
export const floorRole = (roomType) => ({ bath: 'wet', kitchen: 'wet', laundry: 'wet', bedroom: 'bedroom', outdoor: 'outdoor' }[roomType] || 'main');
