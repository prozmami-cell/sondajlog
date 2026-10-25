// Fotoğraf okuma işçisi: Pyodide içinde gorsel_okuma.py'yi çalıştırır, arayüzü dondurmaz.
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
importScripts(PYODIDE + "pyodide.js", "rakam_agi.js");

let hazir = null;

async function indir(ad) {
  const yanit = await fetch(ad);
  if (!yanit.ok) throw new Error(ad + " indirilemedi");
  return yanit.arrayBuffer();
}

async function hazirla() {
  const [agirliklar, cekirdek] = await Promise.all(["rakam_agirliklari.bin", "rakam_cekirdek.wasm"].map(indir));
  self.rakamAgi = rakamAgiOlustur(agirliklar, cekirdek);
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  await pyodide.loadPackage(["numpy", "opencv-python"]);
  for (const ad of ["gorsel_okuma.py", "telefon.py"]) {
    pyodide.FS.writeFile("/home/pyodide/" + ad, new Uint8Array(await indir(ad)));
  }
  pyodide.runPython("import sys, os; sys.path.insert(0, '/home/pyodide'); os.chdir('/home/pyodide')");
  return pyodide.pyimport("telefon");
}

self.onmessage = async (olay) => {
  const { no, istek, veri } = olay.data;
  try {
    if (!hazir) hazir = hazirla().catch((hata) => { hazir = null; throw hata; });
    const telefon = await hazir;
    let sonuc = null;
    if (istek === "hazirla") {
      sonuc = true;
    } else if (istek === "oku") {
      telefon.resimleri_bosalt();
      for (const f of veri.fotograflar) telefon.resim_ekle(f.ad, f.piksel, f.genislik, f.yukseklik);
      sonuc = JSON.parse(telefon.numuneleri_oku(veri.fotograflar.map((f) => f.ad)));
      telefon.resimleri_bosalt();
    } else if (istek === "manevralar") {
      sonuc = JSON.parse(telefon.manevralar(JSON.stringify(veri.numuneler), veri.baslangic));
    } else if (istek === "spt_uzunlugu") {
      sonuc = telefon.spt_uzunlugu(JSON.stringify(veri.darbeler));
    }
    self.postMessage({ no, sonuc });
  } catch (hata) {
    self.postMessage({ no, hata: String(hata && hata.message ? hata.message : hata) });
  }
};
