// rakam_modeli.onnx ağının (3 evrişim + 2 tam bağlı katman) telefonda çalışan karşılığı.
// Çarpımlar rakam_cekirdek.wasm (WebAssembly SIMD) içinde yapılır; ara katmanlar
// "kanal sonda" düzeninde tutulur: [örnek][piksel][kanal].
const KATMANLAR = [
  ["konv1", [32, 1, 3, 3]], ["konv2", [64, 32, 3, 3]], ["konv3", [128, 64, 3, 3]],
  ["tam1", [128, 1152]], ["tam2", [11, 128]],
];

const dortKati = (sayi) => Math.ceil(sayi / 4) * 4;

function rakamAgiOlustur(agirlikTamponu, cekirdekTamponu) {
  const cekirdek = new WebAssembly.Instance(new WebAssembly.Module(cekirdekTamponu)).exports;
  const bellek = cekirdek.bellek;
  let doluluk = 0;
  const ayir = (adet) => {
    const adres = doluluk;
    doluluk += dortKati(adet) * 4;
    const gereken = Math.ceil(doluluk / 65536) - bellek.buffer.byteLength / 65536;
    if (gereken > 0) bellek.grow(gereken);
    return adres;
  };
  const gorunum = (adres, adet) => new Float32Array(bellek.buffer, adres, adet);

  const ham = new Float32Array(agirlikTamponu);
  let konum = 0;
  const katmanlar = {};
  for (const [ad, sekil] of KATMANLAR) {
    const adet = sekil.reduce((a, b) => a * b, 1);
    const w = ham.subarray(konum, konum + adet);
    const b = ham.subarray(konum + adet, konum + adet + sekil[0]);
    konum += adet + sekil[0];

    const cikisAdet = dortKati(sekil[0]);
    let girdiAdet;
    let sirala;
    if (ad.startsWith("konv")) {
      const kanal = sekil[1];
      girdiAdet = dortKati(9 * kanal);
      // (o, c, ky, kx) -> (o, ky, kx, c): pencere satırları kanal sonda düzenle eşleşsin
      sirala = (o, i) => {
        const pencere = Math.floor(i / kanal), c = i % kanal;
        return pencere < 9 ? w[(o * kanal + c) * 9 + pencere] : 0;
      };
    } else if (ad === "tam1") {
      girdiAdet = 1152;
      // PyTorch düzleştirmesi (kanal, piksel); bizdeki düzen (piksel, kanal)
      sirala = (o, i) => w[o * 1152 + (i % 128) * 9 + Math.floor(i / 128)];
    } else {
      girdiAdet = sekil[1];
      sirala = (o, i) => w[o * sekil[1] + i];
    }
    const wAdres = ayir(cikisAdet * girdiAdet);
    const bAdres = ayir(cikisAdet);
    const wDizi = gorunum(wAdres, cikisAdet * girdiAdet);
    const bDizi = gorunum(bAdres, cikisAdet);
    for (let o = 0; o < sekil[0]; o++) {
      bDizi[o] = b[o];
      for (let i = 0; i < girdiAdet; i++) wDizi[o * girdiAdet + i] = sirala(o, i);
    }
    katmanlar[ad] = { wAdres, bAdres, cikisAdet, girdiAdet, gercekCikis: sekil[0], kanal: sekil[1] };
  }
  const sabitDoluluk = doluluk;

  // 3x3 (dolgu 1) evrişim + ReLU + 2x2 havuzlama. girdi: [adet][boy*boy][kanal]
  function evrisim(girdi, adet, boy, katman) {
    const { kanal, girdiAdet, cikisAdet } = katman;
    const alan = boy * boy;
    doluluk = sabitDoluluk;
    const xAdres = ayir(adet * alan * girdiAdet);
    const cAdres = ayir(adet * alan * cikisAdet);
    const x = gorunum(xAdres, adet * alan * girdiAdet);
    x.fill(0);
    for (let n = 0; n < adet; n++) {
      for (let y = 0; y < boy; y++) {
        for (let xx = 0; xx < boy; xx++) {
          const satir = ((n * alan) + y * boy + xx) * girdiAdet;
          for (let ky = 0; ky < 3; ky++) {
            const gy = y + ky - 1;
            if (gy < 0 || gy >= boy) continue;
            for (let kx = 0; kx < 3; kx++) {
              const gx = xx + kx - 1;
              if (gx < 0 || gx >= boy) continue;
              const kaynak = (n * alan + gy * boy + gx) * kanal;
              x.set(girdi.subarray(kaynak, kaynak + kanal), satir + (ky * 3 + kx) * kanal);
            }
          }
        }
      }
    }
    cekirdek.carp(katman.wAdres, katman.bAdres, xAdres, cAdres, cikisAdet, girdiAdet, adet * alan, 1);
    const c = gorunum(cAdres, adet * alan * cikisAdet);
    const yarim = boy >> 1;
    const cikis = new Float32Array(adet * yarim * yarim * katman.gercekCikis);
    for (let n = 0; n < adet; n++) {
      for (let y = 0; y < yarim; y++) {
        for (let xx = 0; xx < yarim; xx++) {
          const p = n * alan + 2 * y * boy + 2 * xx;
          const hedef = ((n * yarim + y) * yarim + xx) * katman.gercekCikis;
          for (let o = 0; o < katman.gercekCikis; o++) {
            cikis[hedef + o] = Math.max(
              c[p * cikisAdet + o], c[(p + 1) * cikisAdet + o],
              c[(p + boy) * cikisAdet + o], c[(p + boy + 1) * cikisAdet + o]);
          }
        }
      }
    }
    return cikis;
  }

  function tamBagli(girdi, adet, katman, relu) {
    const { girdiAdet, cikisAdet, gercekCikis } = katman;
    doluluk = sabitDoluluk;
    const xAdres = ayir(adet * girdiAdet);
    const cAdres = ayir(adet * cikisAdet);
    gorunum(xAdres, adet * girdiAdet).set(girdi);
    cekirdek.carp(katman.wAdres, katman.bAdres, xAdres, cAdres, cikisAdet, girdiAdet, adet, relu ? 1 : 0);
    const c = gorunum(cAdres, adet * cikisAdet);
    const cikis = new Float32Array(adet * gercekCikis);
    for (let n = 0; n < adet; n++) cikis.set(c.subarray(n * cikisAdet, n * cikisAdet + gercekCikis), n * gercekCikis);
    return cikis;
  }

  // girdiler: adet x 784 piksel; çıkış: adet x 11 ham puan
  return (girdiler, adet) => {
    let x = evrisim(girdiler, adet, 28, katmanlar.konv1);
    x = evrisim(x, adet, 14, katmanlar.konv2);
    x = evrisim(x, adet, 7, katmanlar.konv3);
    x = tamBagli(x, adet, katmanlar.tam1, true);
    return tamBagli(x, adet, katmanlar.tam2, false);
  };
}
