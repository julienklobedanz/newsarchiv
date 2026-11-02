// Metadaten für Quellen und Kategorien — Artikeldaten kommen vom Backend.

export const sources = {
  spiegel: {
    id: "spiegel", abbr: "S", name: "Spiegel", color: "#C5161D", text: "#ffffff", count: 0,
    logoUrl: "https://cdn.prod.www.spiegel.de/public/spon/images/logos/der-spiegel-h60.png",
  },
  taz: {
    id: "taz", abbr: "t", name: "taz", color: "#16A34A", text: "#ffffff", count: 0,
    logoUrl: "https://taz.de/fileadmin/templates/neu/images/logo_tazde_rss_2.gif",
  },
  zeit: {
    id: "zeit", abbr: "Z", name: "Zeit", color: "#000000", text: "#ffffff", count: 0,
    logoUrl: "https://static.zeit.de/p/zeit.web/icons/favicon.svg",
  },
  faz: {
    id: "faz", abbr: "F", name: "FAZ", color: "#004A99", text: "#ffffff", count: 0,
    logoUrl: "https://www.faz.net/apple-touch-icon.png",
  },
  heise: {
    id: "heise", abbr: "h", name: "Heise", color: "#C8002A", text: "#ffffff", count: 0,
    logoUrl: "https://www.heise.de/favicon.ico",
  },
  sz: {
    id: "sz", abbr: "SZ", name: "SZ", color: "#005B99", text: "#ffffff", count: 0,
    logoUrl: "/sources/sz.ico",
  },
};

export const categories = {
  klima:        { id: "klima",        name: "Klima",        color: "#059669", text: "#ffffff" },
  ki:           { id: "ki",           name: "KI",           color: "#7C3AED", text: "#ffffff" },
  wirtschaft:   { id: "wirtschaft",   name: "Wirtschaft",   color: "#D97706", text: "#ffffff" },
  politik:      { id: "politik",      name: "Politik",      color: "#2563EB", text: "#ffffff" },
  wissenschaft: { id: "wissenschaft", name: "Wissenschaft", color: "#0891B2", text: "#ffffff" },
  technik:      { id: "technik",      name: "Technik",      color: "#4F46E5", text: "#ffffff" },
  sport:        { id: "sport",        name: "Sport",        color: "#DC2626", text: "#ffffff" },
  gesellschaft: { id: "gesellschaft", name: "Gesellschaft", color: "#64748B", text: "#ffffff" },
};

