const CARTO_API_KEY =
  process.env.NEXT_PUBLIC_CARTO_API_KEY || 'cb1_4rl4_1_b877170eaa644026e39b00c0';

export const BASEMAPS = [
  {
    id: "google_hybrid",
    name: "Google Hybrid",
    thumbnail: "https://mt1.google.com/vt/lyrs=y&x=50&y=32&z=6",
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attributions: "&copy; Google",
    category: "satellite",
    is3D: false,
  },
  {
    id: "google_terrain",
    name: "Google Terrain",
    thumbnail: "https://mt1.google.com/vt/lyrs=p&x=50&y=32&z=6",
    url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    attributions: "&copy; Google",
    category: "relief",
    relief: true,
  },
  {
    id: "opentopomap",
    name: "OpenTopo",
    thumbnail: "https://c.tile.opentopomap.org/6/50/32.png",
    url: "https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attributions: 'Map data: © <a href="https://openstreetmap.org">OSM</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Style: © <a href="https://opentopomap.org">OpenTopoMap</a>',
    category: "relief",
    relief: true,
  },
  {
    id: "esri_hillshade",
    name: "Esri Hillshade",
    thumbnail: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/6/32/50",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
    attributions: "Tiles © Esri, USGS, NGA, NASA, CGIAR, NCEAS, NLS, OS, NMA, Geodatastyrelsen",
    category: "relief",
    relief: true,
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    thumbnail: "https://tile.openstreetmap.org/6/50/32.png",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    category: "streets",
  },
  {
    id: "satellite",
    name: "Satellite (Esri)",
    thumbnail:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/32/50",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attributions:
      'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">ArcGIS</a>',
    category: "satellite",
  },
  {
    id: "terrain",
    name: "Terrain Topo (Esri)",
    thumbnail:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/6/32/50",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attributions:
      'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer">ArcGIS</a>',
    category: "topo",
  },
  {
    id: "positron",
    name: "Positron (Light)",
    thumbnail: `https://basemaps.cartocdn.com/rastertiles/light_all/6/50/32.png?key=${CARTO_API_KEY}`,
    url: `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attributions:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    category: "monochrome",
  },
  {
    id: "dark",
    name: "Dark Matter",
    thumbnail: `https://basemaps.cartocdn.com/rastertiles/dark_all/6/50/32.png?key=${CARTO_API_KEY}`,
    url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attributions:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    category: "monochrome",
  },
  {
    id: "google_roadmap",
    name: "Google Roadmap",
    thumbnail: "https://mt1.google.com/vt/lyrs=m&x=50&y=32&z=6",
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attributions: "&copy; Google",
    category: "streets",
  },
];

export function getBasemapConfig(id) {
  if (!id) return BASEMAPS.find((b) => b.id === 'dark') || BASEMAPS[0];
  // Backward compatibility for 'hitam' or 'topografi'
  if (id === 'hitam') return BASEMAPS.find((b) => b.id === 'dark') || BASEMAPS[0];
  if (id === 'topografi') return BASEMAPS.find((b) => b.id === 'opentopomap') || BASEMAPS[0];
  return BASEMAPS.find((b) => b.id === id) || BASEMAPS.find((b) => b.id === 'dark') || BASEMAPS[0];
}

/** MapLibre tidak mengenal pola subdomain `{a-c}`; ubah jadi daftar URL. */
export function expandTileUrls(url) {
  const m = url.match(/\{([a-z])-([a-z])\}/);
  if (!m) return [url];
  const out = [];
  for (let c = m[1].charCodeAt(0); c <= m[2].charCodeAt(0); c++) {
    out.push(url.replace(m[0], String.fromCharCode(c)));
  }
  return out;
}
