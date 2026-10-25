// Uygulama dosyalarını ve okuma motorunu (Pyodide) önbelleğe alır; internet yokken de açılır.
const ONBELLEK = "sondajlog-v1";
const MOTOR_ONBELLEGI = "sondajlog-motor-v1";
const UYGULAMA = [
  "./", "index.html", "stil.css", "uygulama.js", "isci.js", "rakam_agi.js",
  "rakam_cekirdek.wasm", "rakam_agirliklari.bin", "gorsel_okuma.py", "telefon.py",
  "manifest.webmanifest", "simge-180.png", "simge-192.png", "simge-512.png", "logo-baslik.png",
];

self.addEventListener("install", (olay) => {
  olay.waitUntil(caches.open(ONBELLEK).then((onbellek) => onbellek.addAll(UYGULAMA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((ad) => ad !== ONBELLEK && ad !== MOTOR_ONBELLEGI).map((ad) => caches.delete(ad))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET") return;
  const adres = new URL(istek.url);

  // Pyodide dosyaları sürüm numaralı, değişmez: önce önbellek
  if (adres.hostname === "cdn.jsdelivr.net") {
    olay.respondWith(caches.open(MOTOR_ONBELLEGI).then(async (onbellek) => {
      const kayitli = await onbellek.match(istek);
      if (kayitli) return kayitli;
      const yanit = await fetch(istek);
      if (yanit.ok) onbellek.put(istek, yanit.clone());
      return yanit;
    }));
    return;
  }

  // Uygulama dosyaları: internet varsa en güncelini al, yoksa önbellekten aç
  if (adres.origin === self.location.origin) {
    olay.respondWith(fetch(istek).then((yanit) => {
      if (yanit.ok) {
        const kopya = yanit.clone();
        olay.waitUntil(caches.open(ONBELLEK).then((onbellek) => onbellek.put(istek, kopya)));
      }
      return yanit;
    }).catch(() => caches.match(istek, { ignoreSearch: true })));
  }
});
