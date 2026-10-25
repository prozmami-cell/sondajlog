"use strict";
// Logvera telefon sürümü. Hesap kuralları masaüstündeki program.py ile aynıdır;
// kayıt dosyası da aynı biçimdedir, bilgisayardaki Logvera doğrudan açabilir.

const $ = (kimlik) => document.getElementById(kimlik);
// Depo anahtarları eski adla kalır; değişirse telefondaki kayıtlı kuyular kaybolur.
const DEPO_KUYULAR = "sondajlog.kuyular";
const DEPO_AKTIF = "sondajlog.aktif";
const FOTO_EN_BUYUK = 2048;

// ---------- Sayı yardımcıları ----------
const r2 = (sayi) => Math.round(sayi * 100) / 100;
const yaziya = (sayi) => sayi.toFixed(2).replace(".", ",");
function sayiya(yazi) {
  const temiz = String(yazi).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(temiz)) return null;
  return Number(temiz);
}
// Python'un round() fonksiyonu gibi: tam yarımlar çift sayıya yuvarlanır
function pyRound(sayi) {
  const yuvarlak = Math.round(sayi);
  return Math.abs(sayi % 1) === 0.5 && yuvarlak % 2 !== 0 ? yuvarlak - 1 : yuvarlak;
}

// ---------- Kayıt ----------
function bosVeri() {
  return { kuyu_bilgileri: { proje: "", kuyu: "", tarih: "" }, manevralar: [], tcr_sonuclari: [], spt_degerleri: {} };
}

function depoOku(anahtar, varsayilan) {
  try {
    const deger = localStorage.getItem(anahtar);
    return deger === null ? varsayilan : JSON.parse(deger);
  } catch (hata) {
    return varsayilan;
  }
}

function depoYaz(anahtar, deger) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
    return true;
  } catch (hata) {
    durumYaz("Kayıt yapılamadı: telefonun depolama alanı dolu olabilir.");
    return false;
  }
}

let kuyular = depoOku(DEPO_KUYULAR, {});
let aktifKimlik = depoOku(DEPO_AKTIF, null);
let veri;
let oneri = { baslangic: "0,00", bitis: "1,50" };

function yeniKimlik() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function kaydet() {
  kuyular[aktifKimlik] = { veri, guncelleme: Date.now() };
  depoYaz(DEPO_KUYULAR, kuyular);
  depoYaz(DEPO_AKTIF, aktifKimlik);
}

function kuyuAc(kimlik) {
  aktifKimlik = kimlik;
  veri = JSON.parse(JSON.stringify(kuyular[kimlik].veri));
  veri.kuyu_bilgileri = Object.assign({ proje: "", kuyu: "", tarih: "" }, veri.kuyu_bilgileri);
  veri.spt_degerleri = veri.spt_degerleri || {};
  veri.tcr_sonuclari = veri.tcr_sonuclari || [];
  oneriyiHesapla();
  depoYaz(DEPO_AKTIF, aktifKimlik);
  hepsiniCiz();
}

function yeniKuyu() {
  aktifKimlik = yeniKimlik();
  veri = bosVeri();
  oneri = { baslangic: "0,00", bitis: "1,50" };
  kaydet();
  hepsiniCiz();
}

// ---------- Manevra kuralları (program.py ile aynı) ----------
function kayittakiTip(numuneTipi) {
  if (numuneTipi.startsWith("SPT")) return "SPT";
  if (numuneTipi.startsWith("UD")) return "UD";
  return "K";
}

function yeniDurumuBul(oncekiDurum, numuneTipi, uzunluk) {
  if (numuneTipi.startsWith("SPT") || numuneTipi.startsWith("UD")) return "spt_modu";
  if (uzunluk === 1.5) return "normal";
  return oncekiDurum;
}

function durumuHesapla(manevralar) {
  let durum = "normal";
  for (const [bas, bit, tip] of manevralar) durum = yeniDurumuBul(durum, tip, r2(sayiya(bit) - sayiya(bas)));
  return durum;
}

function sonDerinlik() {
  const son = veri.manevralar[veri.manevralar.length - 1];
  return son ? sayiya(son[1]) : 0;
}

function sonrakiOneri(derinlik, numuneTipi, durum) {
  let bitis;
  if (numuneTipi.startsWith("SPT") || numuneTipi.startsWith("UD")) {
    bitis = r2(Math.ceil(derinlik / 1.5) * 1.5);
    if (bitis <= derinlik) bitis = r2(bitis + 1.5);
  } else if (durum === "spt_modu") {
    bitis = r2(derinlik + 0.45);
  } else {
    bitis = r2(derinlik + 1.5);
  }
  return { baslangic: yaziya(derinlik), bitis: yaziya(bitis) };
}

function oneriyiHesapla() {
  const son = veri.manevralar[veri.manevralar.length - 1];
  oneri = son ? sonrakiOneri(sayiya(son[1]), son[2], durumuHesapla(veri.manevralar)) : { baslangic: "0,00", bitis: "1,50" };
}

function manevrayiIsle(baslangic, bitis, zorunluTip = null) {
  const uzunluk = r2(bitis - baslangic);
  let tip = zorunluTip;
  if (tip === null) tip = uzunluk === 0.45 ? "SPT" : uzunluk === 0.5 ? "UD" : "K";
  let numuneTipi = "K";
  if (tip === "SPT") numuneTipi = `SPT-${veri.manevralar.filter((m) => m[2].startsWith("SPT")).length + 1}`;
  if (tip === "UD") numuneTipi = `UD-${veri.manevralar.filter((m) => m[2].startsWith("UD")).length + 1}`;
  veri.manevralar.push([yaziya(baslangic), yaziya(bitis), numuneTipi]);
  oneri = sonrakiOneri(bitis, numuneTipi, durumuHesapla(veri.manevralar));
  return numuneTipi;
}

async function manevraEkle() {
  const baslangic = alanOku("giris-baslangic", "Manevra başlangıcı");
  if (baslangic === null) return;
  const bitis = alanOku("giris-bitis", "Manevra bitişi");
  if (bitis === null) return;
  if (baslangic < 0) return hataGoster("Manevra başlangıcı negatif olamaz.", "giris-baslangic");
  if (r2(bitis - baslangic) <= 0) return hataGoster("Manevra bitişi, başlangıcından büyük olmalıdır.", "giris-bitis");

  let zorunluTip = null;
  const uzunluk = r2(bitis - baslangic);
  if (uzunluk < 0.45) {
    const cevap = await sor("Refü SPT", `${yaziya(uzunluk)} m'lik bu manevra refü ile biten bir SPT mi?`,
      [["SPT olarak kaydet", "SPT", true], ["Karot (K) olarak kaydet", "K"]]);
    if (cevap === null) return;
    if (cevap === "SPT") zorunluTip = "SPT";
  }
  const numuneTipi = manevrayiIsle(baslangic, bitis, zorunluTip);
  kaydet();
  durumYaz(`Eklendi: ${yaziya(baslangic)}-${yaziya(bitis)} m → ${numuneTipi}`);
  hepsiniCiz();
  $("giris-bitis").focus();
}

function sonManevrayiSil() {
  const silinen = veri.manevralar.pop();
  if (!silinen) return;
  const [bas, bit, numuneTipi] = silinen;
  let ekBilgi = "";
  if (numuneTipi === "K") {
    const aralik = `${bas}-${bit}`;
    const kalan = veri.tcr_sonuclari.filter((s) => s[0] !== aralik);
    if (kalan.length !== veri.tcr_sonuclari.length) ekBilgi = " (TCR/SCR/RQD sonucu da silindi)";
    veri.tcr_sonuclari = kalan;
  }
  if (numuneTipi.startsWith("SPT") && veri.spt_degerleri[numuneTipi]) {
    delete veri.spt_degerleri[numuneTipi];
    ekBilgi = " (SPT değerleri de silindi)";
  }
  oneri = { baslangic: bas, bitis: bit };
  kaydet();
  durumYaz(`Silindi: ${bas}-${bit} m → ${numuneTipi}${ekBilgi}`);
  hepsiniCiz();
}

// ---------- SPT ----------
function darbeCoz(yazi) {
  yazi = String(yazi).trim().replace(/\s/g, "").replace(/[.,]/g, "/");
  if (yazi === "") return ["bos", null];
  if (/^\d+$/.test(yazi)) return ["sayi", parseInt(yazi, 10)];
  const parcalar = yazi.split("/");
  if (parcalar.length === 2 && /^\d+$/.test(parcalar[0]) && /^\d+$/.test(parcalar[1]) && parseInt(parcalar[1], 10) > 0) {
    return ["refu", `${parseInt(parcalar[0], 10)}/${parseInt(parcalar[1], 10)}`];
  }
  return ["hatali", null];
}

function darbeleriDogrula(yazilar) {
  const araliklar = ["0-15 cm", "15-30 cm", "30-45 cm"];
  const darbeler = [];
  let refuOldu = false;
  for (let sira = 0; sira < 3; sira++) {
    const [tur, deger] = darbeCoz(yazilar[sira] ?? "");
    if (tur === "hatali") return { hataliSira: sira, hata: `${araliklar[sira]} için darbe sayısı (ör. 12) ya da refü değeri (ör. 50/5) giriniz.` };
    if (refuOldu && tur !== "bos") return { hataliSira: sira, hata: `Refüden sonra ${araliklar[sira]} aralığına değer girilemez.` };
    if (!refuOldu && tur === "bos") return { hataliSira: sira, hata: `${araliklar[sira]} aralığının darbe sayısını giriniz.` };
    if (tur === "refu") refuOldu = true;
    darbeler.push(deger === null ? "" : String(deger));
  }
  const sptN = refuOldu ? "R" : String(parseInt(darbeler[1], 10) + parseInt(darbeler[2], 10));
  return { degerler: [darbeler[0], darbeler[1], darbeler[2], sptN] };
}

function sptListesi() {
  return veri.manevralar.filter((m) => m[2].startsWith("SPT"));
}

function sptKaydet() {
  const secilen = $("spt-secim").value;
  const numaralar = sptListesi().map((m) => m[2]);
  if (!numaralar.includes(secilen)) return;
  const kutular = ["darbe-1", "darbe-2", "darbe-3"];
  const sonuc = darbeleriDogrula(kutular.map((k) => $(k).value));
  if (!sonuc.degerler) return hataGoster(sonuc.hata, kutular[sonuc.hataliSira]);
  veri.spt_degerleri[secilen] = sonuc.degerler;
  kaydet();
  const [d1, d2, d3, n] = sonuc.degerler;
  durumYaz(`${secilen} kaydedildi: ${d1} / ${d2} / ${d3} → N = ${n}`);
  const sonraki = numaralar[numaralar.indexOf(secilen) + 1];
  sptCiz(sonraki ?? "");
  if (sonraki) $("darbe-1").focus();
}

function sptSil() {
  const secilen = $("spt-secim").value;
  if (!veri.spt_degerleri[secilen]) return;
  delete veri.spt_degerleri[secilen];
  kaydet();
  durumYaz(`${secilen} değerleri silindi`);
  sptCiz(secilen);
}

// ---------- TCR ----------
function kManevralari() {
  return veri.manevralar.filter((m) => m[2] === "K").map((m) => `${m[0]}-${m[1]}`);
}

function tcrHesapla() {
  const secilen = $("tcr-secim").value;
  const kListesi = kManevralari();
  if (!kListesi.includes(secilen)) return;
  const [bas, bit] = secilen.split("-");
  const uzunluk = r2(sayiya(bit) - sayiya(bas));
  const degerler = [];
  for (const [kimlik, ad] of [["tcr-tcr", "TCR"], ["tcr-scr", "SCR"], ["tcr-rqd", "RQD"]]) {
    const deger = alanOku(kimlik, ad);
    if (deger === null) return;
    degerler.push(deger);
  }
  if (degerler.some((d) => d < 0)) return hataGoster("TCR, SCR ve RQD değerleri negatif olamaz.");
  const yuzdeler = degerler.map((cm) => pyRound((cm / 100) / uzunluk * 100));
  veri.tcr_sonuclari.push([secilen, ...yuzdeler]);
  kaydet();
  durumYaz(`${secilen}: TCR %${yuzdeler[0]}, SCR %${yuzdeler[1]}, RQD %${yuzdeler[2]}`);
  for (const k of ["tcr-tcr", "tcr-scr", "tcr-rqd"]) $(k).value = "";
  tcrCiz(kListesi[kListesi.indexOf(secilen) + 1] ?? "");
  $("tcr-tcr").focus();
}

function tcrSonuSil() {
  const silinen = veri.tcr_sonuclari.pop();
  if (!silinen) return;
  kaydet();
  tcrCiz(silinen[0]);
}

// ---------- Çizim ----------
function satirlariCiz(kap, basliklar, satirlar, bosMesaj) {
  kap.textContent = "";
  const baslik = document.createElement("div");
  baslik.className = "satir baslik";
  for (const b of basliklar) baslik.appendChild(Object.assign(document.createElement("span"), { textContent: b }));
  kap.appendChild(baslik);
  if (!satirlar.length) {
    kap.appendChild(Object.assign(document.createElement("div"), { className: "bos-liste", textContent: bosMesaj }));
    return [];
  }
  return satirlar.map(({ hucreler, sinif, not }) => {
    const satir = document.createElement("div");
    satir.className = "satir " + (sinif || "");
    for (const h of hucreler) satir.appendChild(Object.assign(document.createElement("span"), { textContent: h }));
    if (not) satir.appendChild(Object.assign(document.createElement("span"), { className: "not", textContent: not }));
    kap.appendChild(satir);
    return satir;
  });
}

function manevraCiz() {
  $("giris-baslangic").value = oneri.baslangic;
  $("giris-bitis").value = oneri.bitis;
  satirlariCiz($("tablo-manevra"), ["Başlangıç", "Bitiş", "Numune"],
    veri.manevralar.map(([bas, bit, tip]) => ({ hucreler: [bas, bit, tip], sinif: kayittakiTip(tip).toLowerCase() })),
    "Henüz manevra yok");
  const tablo = $("tablo-manevra");
  tablo.lastElementChild?.scrollIntoView?.({ block: "nearest" });
}

function secenekleriDoldur(secim, degerler, secilecek) {
  secim.textContent = "";
  secim.appendChild(new Option(degerler.length ? "— seçin —" : "— henüz yok —", ""));
  for (const deger of degerler) secim.appendChild(new Option(deger, deger));
  secim.value = degerler.includes(secilecek) ? secilecek : "";
}

function sptCiz(secilecek) {
  const liste = sptListesi();
  const numaralar = liste.map((m) => m[2]);
  if (secilecek === undefined) {
    secilecek = $("spt-secim").value;
    if (!numaralar.includes(secilecek)) secilecek = numaralar.find((n) => !veri.spt_degerleri[n]) ?? "";
  }
  secenekleriDoldur($("spt-secim"), numaralar, secilecek);
  sptKutulariniDoldur();
  const satirlar = satirlariCiz($("tablo-spt"), ["Aralık", "SPT", "0-15", "15-30", "30-45", "N"],
    liste.map(([bas, bit, tip]) => {
      const d = veri.spt_degerleri[tip];
      return { hucreler: [`${bas}-${bit}`, tip, ...(d || ["", "", "", ""])], sinif: d ? "" : "bos" };
    }), "Henüz SPT yok");
  satirlar.forEach((satir, i) => satir.addEventListener("click", () => {
    $("spt-secim").value = numaralar[i];
    sptKutulariniDoldur();
    $("darbe-1").focus();
  }));
}

function sptKutulariniDoldur() {
  const degerler = veri.spt_degerleri[$("spt-secim").value] || ["", "", ""];
  ["darbe-1", "darbe-2", "darbe-3"].forEach((k, i) => { $(k).value = degerler[i]; $(k).classList.remove("hatali"); });
}

function tcrCiz(secilecek) {
  const kListesi = kManevralari();
  if (secilecek === undefined) secilecek = $("tcr-secim").value;
  secenekleriDoldur($("tcr-secim"), kListesi, secilecek);
  satirlariCiz($("tablo-tcr"), ["Derinlik", "TCR%", "SCR%", "RQD%"],
    veri.tcr_sonuclari.map(([aralik, t, s, r]) => ({ hucreler: [aralik, `${t}%`, `${s}%`, `${r}%`] })),
    "Henüz sonuç yok");
}

function kuyuBilgileriniCiz() {
  for (const anahtar of ["proje", "kuyu", "tarih"]) $("kuyu-" + anahtar).value = veri.kuyu_bilgileri[anahtar] || "";
  $("kuyu-karti").open = !veri.manevralar.length;
  $("ust-kuyu").textContent = veri.kuyu_bilgileri.kuyu || "Yeni kuyu";
  document.title = veri.kuyu_bilgileri.kuyu ? `Logvera — ${veri.kuyu_bilgileri.kuyu}` : "Logvera";
}

function ozetiCiz() {
  if (!veri.manevralar.length) {
    $("durum-ozet").textContent = "Henüz manevra yok";
    return;
  }
  const sayilar = { SPT: 0, UD: 0, K: 0 };
  for (const m of veri.manevralar) sayilar[kayittakiTip(m[2])]++;
  $("durum-ozet").textContent = `${yaziya(sonDerinlik())} m · SPT ${sayilar.SPT} · UD ${sayilar.UD} · K ${sayilar.K}`;
}

function hepsiniCiz() {
  kuyuBilgileriniCiz();
  manevraCiz();
  sptCiz();
  tcrCiz();
  ozetiCiz();
}

function durumYaz(mesaj) {
  $("durum-mesaj").textContent = mesaj;
}

// ---------- Giriş ve uyarılar ----------
function alanOku(kimlik, alanAdi) {
  const sayi = sayiya($(kimlik).value);
  if (sayi === null) {
    hataGoster(`${alanAdi} için geçerli bir sayı giriniz.`, kimlik);
    return null;
  }
  $(kimlik).classList.remove("hatali");
  return sayi;
}

function hataGoster(mesaj, kimlik) {
  if (kimlik) {
    $(kimlik).classList.add("hatali");
    $(kimlik).addEventListener("input", () => $(kimlik).classList.remove("hatali"), { once: true });
  }
  sor("Hatalı Giriş", mesaj, [["Tamam", true, true]]).then(() => kimlik && $(kimlik).focus());
}

// secenekler: [etiket, deger, ana_mi]; arka plana dokunmak null döndürür
function sor(baslik, metin, secenekler) {
  return new Promise((coz) => {
    $("soru-baslik").textContent = baslik;
    $("soru-metin").textContent = metin;
    const kap = $("soru-dugmeler");
    kap.textContent = "";
    const bitir = (deger) => {
      $("soru").hidden = true;
      $("soru").onclick = null;
      coz(deger);
    };
    for (const [etiket, deger, ana] of secenekler) {
      const dugme = Object.assign(document.createElement("button"), { textContent: etiket, className: ana ? "ana" : "" });
      dugme.onclick = (olay) => { olay.stopPropagation(); bitir(deger); };
      kap.appendChild(dugme);
    }
    $("soru").onclick = (olay) => { if (olay.target === $("soru")) bitir(null); };
    $("soru").hidden = false;
  });
}

async function kopyala(tur) {
  const sptler = sptListesi();
  const darbe = (tip) => veri.spt_degerleri[tip] || ["", "", "", ""];
  const metinler = {
    "manevra": () => veri.manevralar.map((m) => m.join("\t")),
    "spt-aralik": () => sptler.map((m) => `${m[0]}\t${m[1]}`),
    "spt-darbe": () => sptler.map((m) => darbe(m[2]).join("\t")),
    "spt-n": () => sptler.map((m) => darbe(m[2])[3]),
    "tcr": () => veri.tcr_sonuclari.map((s) => String(s[1])),
    "scr": () => veri.tcr_sonuclari.map((s) => String(s[2])),
    "rqd": () => veri.tcr_sonuclari.map((s) => String(s[3])),
  };
  try {
    await navigator.clipboard.writeText(metinler[tur]().join("\n"));
    durumYaz("Panoya kopyalandı");
  } catch (hata) {
    durumYaz("Kopyalanamadı");
  }
}

// ---------- Dosya paylaşma / açma ----------
function dosyaAdi() {
  const ad = (veri.kuyu_bilgileri.kuyu || "sondaj").replace(/[\\/:*?"<>|]/g, "_");
  return ad + ".json";
}

async function paylas() {
  const metin = JSON.stringify(veri, null, 2);
  const dosya = new File([metin], dosyaAdi(), { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya], title: dosyaAdi() });
      durumYaz("Dosya paylaşıldı");
    } catch (hata) {
      if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
    }
    return;
  }
  const baglanti = Object.assign(document.createElement("a"), { href: URL.createObjectURL(dosya), download: dosyaAdi() });
  baglanti.click();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 5000);
}

async function dosyadanAc(dosya) {
  try {
    const okunan = JSON.parse(await dosya.text());
    if (!Array.isArray(okunan.manevralar)) throw new Error("manevra listesi yok");
    const yeni = bosVeri();
    Object.assign(yeni.kuyu_bilgileri, okunan.kuyu_bilgileri || {});
    for (const m of okunan.manevralar) {
      const bas = sayiya(m[0]), bit = sayiya(m[1]);
      if (bas === null || bit === null) throw new Error("hatalı derinlik: " + m.join(" "));
    }
    veri = yeni;
    for (const m of okunan.manevralar) manevrayiIsle(sayiya(m[0]), sayiya(m[1]), m.length > 2 ? kayittakiTip(m[2]) : null);
    veri.tcr_sonuclari = (okunan.tcr_sonuclari || []).map((s) => [String(s[0]), Number(s[1]), Number(s[2]), Number(s[3])]);
    for (const [tip, d] of Object.entries(okunan.spt_degerleri || {})) veri.spt_degerleri[tip] = d.map(String);
    aktifKimlik = yeniKimlik();
    kaydet();
    hepsiniCiz();
    katmaniKapat("katman-kuyular");
    durumYaz("Açıldı: " + dosya.name);
  } catch (hata) {
    kuyuAc(aktifKimlik);
    sor("Açma Hatası", "Dosya açılamadı:\n" + hata.message, [["Tamam", true, true]]);
  }
}

// ---------- Kuyular ----------
function kuyulariCiz() {
  const kap = $("kuyu-listesi");
  kap.textContent = "";
  const sirali = Object.entries(kuyular).sort((a, b) => b[1].guncelleme - a[1].guncelleme);
  for (const [kimlik, { veri: v, guncelleme }] of sirali) {
    const son = v.manevralar[v.manevralar.length - 1];
    const kart = document.createElement("div");
    kart.className = "kuyu" + (kimlik === aktifKimlik ? " aktif" : "");
    const bilgi = document.createElement("div");
    bilgi.appendChild(Object.assign(document.createElement("b"), { textContent: v.kuyu_bilgileri?.kuyu || "Adsız kuyu" }));
    const tarih = new Date(guncelleme).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
    bilgi.appendChild(Object.assign(document.createElement("small"), {
      textContent: `${v.kuyu_bilgileri?.proje ? v.kuyu_bilgileri.proje + " · " : ""}${son ? son[1] + " m" : "boş"} · ${tarih}`,
    }));
    bilgi.onclick = () => { kuyuAc(kimlik); katmaniKapat("katman-kuyular"); };
    const sil = Object.assign(document.createElement("button"), { className: "kucuk", textContent: "Sil" });
    sil.onclick = async () => {
      const cevap = await sor("Kuyuyu sil", `"${v.kuyu_bilgileri?.kuyu || "Adsız kuyu"}" telefondan silinsin mi? Bu geri alınamaz.`,
        [["Sil", true, true], ["Vazgeç", false]]);
      if (!cevap) return;
      delete kuyular[kimlik];
      depoYaz(DEPO_KUYULAR, kuyular);
      if (kimlik === aktifKimlik) {
        const kalan = Object.keys(kuyular);
        kalan.length ? kuyuAc(kalan[0]) : yeniKuyu();
      }
      kuyulariCiz();
    };
    kart.append(bilgi, sil);
    kap.appendChild(kart);
  }
}

function katmaniAc(kimlik) {
  $(kimlik).hidden = false;
  document.body.style.overflow = "hidden";
}

function katmaniKapat(kimlik) {
  $(kimlik).hidden = true;
  document.body.style.overflow = "";
}

// ---------- Sekmeler ----------
function sekmeSec(ad) {
  for (const dugme of document.querySelectorAll(".sekmeler button")) dugme.classList.toggle("secili", dugme.dataset.sekme === ad);
  for (const bolum of document.querySelectorAll(".sekme")) bolum.hidden = bolum.id !== "sekme-" + ad;
  window.scrollTo(0, 0);
  if (ad === "foto") motoruHazirla();
}

// ---------- Fotoğraf okuma işçisi ----------
let isci = null;
let istekNo = 0;
const bekleyenler = new Map();
let motorHazir = false;

function isciyiBaslat() {
  if (isci) return;
  isci = new Worker("isci.js");
  isci.onmessage = (olay) => {
    if (typeof olay.data === "string") {
      const ilerleme = JSON.parse(olay.data);
      okumaIlerlemesi?.(ilerleme);
      return;
    }
    const { no, sonuc, hata } = olay.data;
    const bekleyen = bekleyenler.get(no);
    if (!bekleyen) return;
    bekleyenler.delete(no);
    hata ? bekleyen.red(new Error(hata)) : bekleyen.coz(sonuc);
  };
  isci.onerror = (olay) => {
    for (const bekleyen of bekleyenler.values()) bekleyen.red(new Error(olay.message || "Okuma motoru durdu"));
    bekleyenler.clear();
    isci = null;
    motorHazir = false;
  };
}

function iste(istek, veriler, aktarilacaklar = []) {
  isciyiBaslat();
  return new Promise((coz, red) => {
    const no = ++istekNo;
    bekleyenler.set(no, { coz, red });
    isci.postMessage({ no, istek, veri: veriler }, aktarilacaklar);
  });
}

let okumaIlerlemesi = null;
let okumaSuruyor = false;

async function motoruHazirla() {
  if (motorHazir || okumaSuruyor) return;
  const yaz = (metin) => { if (!okumaSuruyor) $("motor-durumu").textContent = metin; };
  yaz("Okuma motoru yükleniyor… (ilk seferde ~30 MB indirilir)");
  try {
    await iste("hazirla");
    motorHazir = true;
    yaz("Okuma motoru hazır");
  } catch (hata) {
    yaz("Okuma motoru yüklenemedi: " + hata.message + ". İnternet bağlantısını kontrol edin.");
  }
}

// ---------- Fotoğraf kuyruğu ----------
const fotoKuyrugu = [];

async function fotografHazirla(dosya) {
  // Renk profili dönüşümü kapatılır ki pikseller bilgisayardaki OpenCV okumasına olabildiğince yakın olsun
  const bitmap = await createImageBitmap(dosya, { colorSpaceConversion: "none" }).catch(() => createImageBitmap(dosya));
  const olcek = Math.min(1, FOTO_EN_BUYUK / Math.max(bitmap.width, bitmap.height));
  const tuval = document.createElement("canvas");
  tuval.width = Math.round(bitmap.width * olcek);
  tuval.height = Math.round(bitmap.height * olcek);
  const baglam = tuval.getContext("2d");
  baglam.imageSmoothingQuality = "high";
  baglam.drawImage(bitmap, 0, 0, tuval.width, tuval.height);
  bitmap.close?.();
  const kucukResim = await new Promise((coz) => tuval.toBlob(coz, "image/jpeg", 0.6));
  return { tuval, kucukResim: URL.createObjectURL(kucukResim), dosyaAdi: dosya.name };
}

async function fotograflariEkle(dosyalar) {
  $("dugme-oku").disabled = true;
  for (const dosya of dosyalar) {
    try {
      fotoKuyrugu.push(await fotografHazirla(dosya));
    } catch (hata) {
      durumYaz(`${dosya.name} açılamadı`);
    }
  }
  kuyruguCiz();
}

function kuyruguCiz() {
  const kap = $("foto-kuyrugu");
  kap.textContent = "";
  fotoKuyrugu.forEach((foto, i) => {
    const satir = document.createElement("div");
    satir.className = "foto";
    satir.appendChild(Object.assign(document.createElement("img"), { src: foto.kucukResim, alt: "" }));
    satir.appendChild(Object.assign(document.createElement("div"), { className: "foto-ad", textContent: `Sandık ${i + 1}` }));
    const dugmeler = [["↑", i > 0, () => yerDegistir(i, i - 1)], ["↓", i < fotoKuyrugu.length - 1, () => yerDegistir(i, i + 1)], ["✕", true, () => {
      URL.revokeObjectURL(foto.kucukResim);
      fotoKuyrugu.splice(i, 1);
      kuyruguCiz();
    }]];
    for (const [metin, etkin, is] of dugmeler) {
      const dugme = Object.assign(document.createElement("button"), { className: "kucuk", textContent: metin, disabled: !etkin });
      dugme.onclick = is;
      satir.appendChild(dugme);
    }
    kap.appendChild(satir);
  });
  $("dugme-oku").disabled = !fotoKuyrugu.length;
  $("dugme-oku").textContent = fotoKuyrugu.length ? `${fotoKuyrugu.length} Fotoğrafı Oku` : "Fotoğrafları Oku";
}

function yerDegistir(a, b) {
  [fotoKuyrugu[a], fotoKuyrugu[b]] = [fotoKuyrugu[b], fotoKuyrugu[a]];
  kuyruguCiz();
}

async function fotograflariOku() {
  if (!fotoKuyrugu.length) return;
  const dugme = $("dugme-oku");
  dugme.disabled = true;
  okumaSuruyor = true;
  const durum = $("motor-durumu");
  durum.innerHTML = '<div id="oku-yazi"></div><div class="ilerleme"><div id="oku-cubuk"></div></div>';
  const yaz = (metin, oran) => { $("oku-yazi").textContent = metin; $("oku-cubuk").style.width = `${Math.round(oran * 100)}%`; };
  try {
    yaz("Okuma motoru yükleniyor…", 0.02);
    await iste("hazirla");
    motorHazir = true;
    const fotograflar = fotoKuyrugu.slice();
    const numuneler = [];
    for (let i = 0; i < fotograflar.length; i++) {
      yaz(`Sandık ${i + 1}/${fotograflar.length} okunuyor…`, (i + 0.1) / fotograflar.length);
      const tuval = fotograflar[i].tuval;
      const piksel = tuval.getContext("2d").getImageData(0, 0, tuval.width, tuval.height).data;
      const anahtar = `foto${i}`;
      const okunan = await iste("oku", { fotograflar: [{ ad: anahtar, piksel, genislik: tuval.width, yukseklik: tuval.height }] }, [piksel.buffer]);
      for (const numune of okunan) {
        numune.fotograf = `Sandık ${i + 1}`;
        numune.foto = i;
        numuneler.push(numune);
      }
    }
    yaz("Bitti", 1);
    if (!numuneler.length) {
      durum.textContent = "Fotoğraflarda SPT/UD borusu bulunamadı.";
      return;
    }
    durum.textContent = "";
    onizlemeyiAc(fotograflar, numuneler);
  } catch (hata) {
    durum.textContent = "Fotoğraflar okunamadı: " + hata.message;
  } finally {
    okumaSuruyor = false;
    dugme.disabled = !fotoKuyrugu.length;
  }
}

// ---------- Önizleme ----------
const onizleme = { fotograflar: [], numuneler: [], satirlar: [], secili: null, sira: 0 };
const gorunum = { foto: null, fotoNo: null, kutu: null, merkez: [0, 0], olcek: 1, otomatik: true };

function sptUzunlugu(darbeler) {
  for (let sira = 0; sira < (darbeler || []).length; sira++) {
    const darbe = String(darbeler[sira]);
    if (darbe.includes("/")) return r2(0.15 * sira + parseInt(darbe.split("/")[1], 10) / 100);
  }
  return 0.45;
}

function onizlemeBaslangici() {
  const deger = sayiya($("onizleme-baslangic").value);
  return deger === null ? 0 : Math.max(0, r2(deger));
}

function onizlemeyiAc(fotograflar, numuneler) {
  Object.assign(onizleme, { fotograflar, numuneler, satirlar: [], secili: null });
  $("onizleme-baslangic").value = yaziya(veri.manevralar.length ? sonDerinlik() : 0);
  $("onizleme-son").value = "";
  katmaniAc("katman-onizleme");
  onizlemeyiYenile().then(() => {
    const ilk = onizleme.satirlar.findIndex((s) => s.numune !== null);
    satirSec(ilk >= 0 ? ilk : null);
  });
}

async function onizlemeyiYenile(secilecekNumune) {
  const sira = ++onizleme.sira;
  const baslangic = onizlemeBaslangici();
  const satirlar = await iste("manevralar", { numuneler: onizleme.numuneler, baslangic });
  if (sira !== onizleme.sira) return;
  const sonDerin = satirlar.length ? satirlar[satirlar.length - 1].bitis : baslangic;
  const kuyuSonu = sayiya($("onizleme-son").value);
  if (kuyuSonu !== null && kuyuSonu > sonDerin + 0.001) {
    satirlar.push({ baslangic: sonDerin, bitis: kuyuSonu, tip: "K", darbeler: null, uyari: "", numune: null });
  }
  onizleme.satirlar = satirlar;
  const elemanlar = satirlariCiz($("tablo-onizleme"), ["Baş.", "Bitiş", "Tip", "0-15", "15-30", "30-45"],
    satirlar.map((s) => ({
      hucreler: [yaziya(s.baslangic), yaziya(s.bitis), s.tip, ...(s.darbeler || ["", "", ""])],
      sinif: s.uyari ? "uyari" : s.tip === "K" ? "karot" : s.tip.toLowerCase(),
      not: s.uyari,
    })), "Okunan numune yok");
  elemanlar.forEach((eleman, i) => dokununca(eleman, () => satiraDokunuldu(i)));
  if (secilecekNumune !== undefined) {
    const indeks = satirlar.findIndex((s) => s.numune === secilecekNumune);
    satirSec(indeks >= 0 ? indeks : null);
  } else if (onizleme.secili !== null) {
    satirSec(onizleme.secili < satirlar.length ? onizleme.secili : null, false);
  }
}

// Açık klavye kapanırken sayfa kayar ve "click" başka bir satıra düşebilir; bu yüzden satır,
// parmağın değdiği anda belirlenir ve parmak kaydırmadan kalkarsa seçilir.
function dokununca(eleman, is) {
  let basilan = null;
  eleman.addEventListener("pointerdown", (olay) => { basilan = { x: olay.clientX, y: olay.clientY }; });
  eleman.addEventListener("pointercancel", () => { basilan = null; });
  eleman.addEventListener("pointerup", (olay) => {
    if (basilan && Math.hypot(olay.clientX - basilan.x, olay.clientY - basilan.y) < 10) is();
    basilan = null;
  });
}

function satiraDokunuldu(indeks) {
  document.activeElement?.blur?.();
  satirSec(indeks);
}

function satirSec(indeks, gorseliGuncelle = true) {
  onizleme.secili = indeks;
  const elemanlar = $("tablo-onizleme").querySelectorAll(".satir:not(.baslik)");
  elemanlar.forEach((e, i) => e.classList.toggle("secili", i === indeks));
  const satir = indeks === null ? null : onizleme.satirlar[indeks];
  $("duzenleyici").hidden = satir === null;
  if (!satir) return;
  elemanlar[indeks]?.scrollIntoView({ block: "nearest" });
  $("duzen-tip").value = satir.tip === "UD" ? "UD" : "SPT";
  $("duzen-tip").disabled = satir.numune === null;
  $("duzen-baslangic").value = yaziya(satir.baslangic);
  $("duzen-bitis").value = yaziya(satir.bitis);
  const darbeler = satir.darbeler || ["", "", ""];
  ["duzen-d1", "duzen-d2", "duzen-d3"].forEach((k, i) => { $(k).value = darbeler[i]; });
  $("duzen-darbeler").hidden = satir.tip === "UD" || satir.numune === null;
  for (const k of ["duzen-guncelle", "duzen-sil"]) $(k).disabled = satir.numune === null;
  if (gorseliGuncelle) {
    const numune = satir.numune === null ? null : onizleme.numuneler[satir.numune];
    gorunum.fotoNo = numune && numune.foto !== undefined ? numune.foto : null;
    gorunum.foto = gorunum.fotoNo === null ? null : onizleme.fotograflar[gorunum.fotoNo];
    gorunum.kutu = numune ? numune.alan || numune.kutu || null : null;
    $("goruntu-adi").textContent = numune ? numune.fotograf || "" : "Karot manevrası";
    gorunum.otomatik = true;
    boruyaOdaklan();
  }
}

async function satiriGuncelle() {
  const satir = onizleme.satirlar[onizleme.secili];
  if (!satir || satir.numune === null) return;
  const numune = onizleme.numuneler[satir.numune];
  const tip = $("duzen-tip").value;
  const baslangic = sayiya($("duzen-baslangic").value);
  const bitis = sayiya($("duzen-bitis").value);
  if (baslangic === null || bitis === null) return hataGoster("Başlangıç ve bitiş için geçerli bir sayı giriniz.");
  const bas = r2(baslangic), bit = r2(bitis);

  let darbeler = null;
  let uzunluk = 0.5;
  if (tip === "SPT") {
    const kutular = ["duzen-d1", "duzen-d2", "duzen-d3"];
    const yazilar = kutular.map((k) => $(k).value);
    darbeler = ["", "", ""];
    if (yazilar.some((y) => y.trim())) {
      const sonuc = darbeleriDogrula(yazilar);
      if (!sonuc.degerler) return hataGoster(sonuc.hata, kutular[sonuc.hataliSira]);
      darbeler = sonuc.degerler.slice(0, 3);
    }
    uzunluk = sptUzunlugu(darbeler);
  }

  const derinlikDegisti = Math.abs(bas - satir.baslangic) > 0.001 || Math.abs(bit - satir.bitis) > 0.001;
  if (derinlikDegisti) {
    if (Math.abs(r2(bit - bas) - uzunluk) > 0.001) return hataGoster(`Bu ${tip} manevrası ${yaziya(uzunluk)} m olmalıdır.`);
    numune.derinlik = [bas, bit];
    numune.elle = true;
  } else if (numune.elle) {
    numune.derinlik = [bas, r2(bas + uzunluk)];
  } else if (tip !== satir.tip) {
    delete numune.derinlik;
  }
  if (tip === "SPT") {
    numune.darbeler = darbeler;
    numune.guven = 1.0;
  }
  numune.tip = tip;
  await onizlemeyiYenile(satir.numune);
}

async function numuneyiSil() {
  const satir = onizleme.satirlar[onizleme.secili];
  if (!satir || satir.numune === null) return;
  onizleme.numuneler.splice(satir.numune, 1);
  onizleme.secili = null;
  await onizlemeyiYenile();
  satirSec(null);
}

async function numuneEkle() {
  const yeni = { tip: "SPT", darbeler: ["", "", ""], guven: 1.0, fotograf: "Elle eklendi" };
  let konum = 0;
  if (onizleme.secili !== null) {
    const onceki = onizleme.satirlar.slice(0, onizleme.secili + 1).filter((s) => s.numune !== null);
    if (onceki.length) konum = onceki[onceki.length - 1].numune + 1;
  } else {
    konum = onizleme.numuneler.length;
  }
  onizleme.numuneler.splice(konum, 0, yeni);
  await onizlemeyiYenile(konum);
}

async function aktar() {
  const satirlar = onizleme.satirlar;
  const baslangic = onizlemeBaslangici();
  for (let i = 0; i < satirlar.length; i++) {
    const onceki = i ? satirlar[i - 1].bitis : baslangic;
    if (satirlar[i].baslangic < onceki - 0.001) {
      satirSec(i);
      return hataGoster("İşaretli manevra bir önceki manevrayla çakışıyor. Lütfen derinlikleri düzeltin.");
    }
  }
  const bosSptler = satirlar.filter((s) => s.tip === "SPT" && !(s.darbeler || []).some((d) => d));
  if (bosSptler.length) {
    const devam = await sor("Eksik değerler", `${bosSptler.length} SPT'nin darbe sayıları boş. Yine de aktarılsın mı?`,
      [["Aktar", true, true], ["Vazgeç", false]]);
    if (!devam) return;
  }
  let sonaEkle = false;
  if (veri.manevralar.length) {
    if (baslangic >= sonDerinlik() - 0.001) {
      const cevap = await sor("Mevcut kayıtlar", `Bu kuyuda ${yaziya(sonDerinlik())} m'ye kadar kayıt var.`,
        [["Sonuna ekle", "ekle", true], ["Silip yerine yaz", "yaz"], ["Vazgeç", null]]);
      if (cevap === null) return;
      sonaEkle = cevap === "ekle";
    } else {
      const devam = await sor("Mevcut kayıtlar", "Başlangıç derinliği mevcut kayıtların sonundan önce. Mevcut kayıtlar silinip fotoğraftan okunan değerler yüklenecek.",
        [["Devam et", true, true], ["Vazgeç", false]]);
      if (!devam) return;
    }
  }
  if (!sonaEkle) {
    const bilgiler = veri.kuyu_bilgileri;
    veri = bosVeri();
    veri.kuyu_bilgileri = bilgiler;
  }
  for (const satir of satirlar) {
    const numuneTipi = manevrayiIsle(satir.baslangic, satir.bitis, satir.tip);
    if (satir.tip !== "SPT" || !(satir.darbeler || []).some((d) => d)) continue;
    const sonuc = darbeleriDogrula(satir.darbeler);
    if (sonuc.degerler) veri.spt_degerleri[numuneTipi] = sonuc.degerler;
  }
  kaydet();
  katmaniKapat("katman-onizleme");
  for (const foto of fotoKuyrugu) URL.revokeObjectURL(foto.kucukResim);
  fotoKuyrugu.length = 0;
  kuyruguCiz();
  hepsiniCiz();
  sekmeSec("manevra");
  durumYaz(`Fotoğraftan ${satirlar.length} manevra aktarıldı`);
}

// ---------- Görüntüleyici (kaydırma ve iki parmakla yakınlaştırma) ----------
const tuval = () => $("goruntu");

function goruntuyuCiz() {
  const t = tuval();
  const oran = window.devicePixelRatio || 1;
  const genislik = t.clientWidth, yukseklik = t.clientHeight;
  if (t.width !== Math.round(genislik * oran) || t.height !== Math.round(yukseklik * oran)) {
    t.width = Math.round(genislik * oran);
    t.height = Math.round(yukseklik * oran);
  }
  const b = t.getContext("2d");
  b.setTransform(oran, 0, 0, oran, 0, 0);
  b.fillStyle = "#222";
  b.fillRect(0, 0, genislik, yukseklik);
  const foto = gorunum.foto;
  if (!foto) {
    b.fillStyle = "#fff";
    b.font = "15px -apple-system, sans-serif";
    b.textAlign = "center";
    b.fillText("Bu satır için görüntü yok", genislik / 2, yukseklik / 2);
    return;
  }
  const { olcek, merkez: [mx, my] } = gorunum;
  const x0 = mx - genislik / (2 * olcek), y0 = my - yukseklik / (2 * olcek);
  b.imageSmoothingQuality = "high";
  b.drawImage(foto.tuval, -x0 * olcek, -y0 * olcek, foto.tuval.width * olcek, foto.tuval.height * olcek);
  // aynı fotoğraftaki diğer borular ince beyaz çerçeveyle; dokununca satırları seçilir
  b.strokeStyle = "rgba(255, 255, 255, .8)";
  b.lineWidth = 1;
  for (const numune of onizleme.numuneler) {
    const alan = numune.alan || numune.kutu;
    if (numune.foto !== gorunum.fotoNo || !alan || alan === gorunum.kutu) continue;
    b.strokeRect((alan[0] - x0) * olcek, (alan[1] - y0) * olcek, alan[2] * olcek, alan[3] * olcek);
  }
  if (gorunum.kutu) {
    const [kx, ky, kw, kh] = gorunum.kutu;
    b.strokeStyle = "#FFDC00";
    b.lineWidth = 2;
    b.strokeRect((kx - x0) * olcek, (ky - y0) * olcek, kw * olcek, kh * olcek);
  }
}

// Boru iki takozuyla birlikte, yanlarında önceki ve sonraki manevralar da görünecek kadar yakınlaştırılır.
function odakOlcegi() {
  const t = tuval(), [, , kw, kh] = gorunum.kutu;
  return Math.min(t.clientWidth / (kw * 1.8), t.clientHeight / (kh * 1.5));
}

function boruyaOdaklan() {
  if (!gorunum.foto) return goruntuyuCiz();
  if (!gorunum.kutu) return tumFotograf();
  const [kx, ky, kw, kh] = gorunum.kutu;
  gorunum.olcek = odakOlcegi();
  gorunum.merkez = [kx + kw / 2, ky + kh / 2];
  goruntuyuCiz();
}

function fotograftaSec(ekranX, ekranY) {
  const t = tuval(), [mx, my] = gorunum.merkez;
  const x = mx + (ekranX - t.clientWidth / 2) / gorunum.olcek;
  const y = my + (ekranY - t.clientHeight / 2) / gorunum.olcek;
  const indeks = onizleme.satirlar.findIndex((satir) => {
    const numune = satir.numune === null ? null : onizleme.numuneler[satir.numune];
    const alan = numune && (numune.alan || numune.kutu);
    return alan && numune.foto === gorunum.fotoNo && alan !== gorunum.kutu &&
      x >= alan[0] && x <= alan[0] + alan[2] && y >= alan[1] && y <= alan[1] + alan[3];
  });
  if (indeks < 0) return false;
  satiraDokunuldu(indeks);
  return true;
}

function tumFotograf() {
  const t = tuval(), foto = gorunum.foto;
  if (!foto) return goruntuyuCiz();
  gorunum.olcek = Math.min(t.clientWidth / foto.tuval.width, t.clientHeight / foto.tuval.height);
  gorunum.merkez = [foto.tuval.width / 2, foto.tuval.height / 2];
  goruntuyuCiz();
}

function dokunmalariBagla() {
  const t = tuval();
  const parmaklar = new Map();
  let onceki = null;
  let sonDokunma = 0;
  const ozet = () => {
    const noktalar = [...parmaklar.values()];
    const x = noktalar.reduce((a, p) => a + p.x, 0) / noktalar.length;
    const y = noktalar.reduce((a, p) => a + p.y, 0) / noktalar.length;
    const mesafe = noktalar.length > 1 ? Math.hypot(noktalar[0].x - noktalar[1].x, noktalar[0].y - noktalar[1].y) : 0;
    return { x, y, mesafe, adet: noktalar.length };
  };
  const konum = (olay) => {
    const kutu = t.getBoundingClientRect();
    return { x: olay.clientX - kutu.left, y: olay.clientY - kutu.top };
  };
  let basilan = null;
  t.addEventListener("pointerdown", (olay) => {
    t.setPointerCapture(olay.pointerId);
    parmaklar.set(olay.pointerId, konum(olay));
    onceki = ozet();
    gorunum.otomatik = false;
    basilan = parmaklar.size === 1 ? konum(olay) : null;
    if (parmaklar.size === 1) {
      const simdi = Date.now();
      if (simdi - sonDokunma < 300) {
        const odakta = gorunum.kutu && Math.abs(gorunum.olcek - odakOlcegi()) < 1e-6;
        odakta ? tumFotograf() : boruyaOdaklan();
        basilan = null;
      }
      sonDokunma = simdi;
    }
  });
  t.addEventListener("pointermove", (olay) => {
    if (!parmaklar.has(olay.pointerId) || !gorunum.foto) return;
    parmaklar.set(olay.pointerId, konum(olay));
    const simdi = ozet();
    if (simdi.adet !== onceki.adet) { onceki = simdi; return; }
    let olcek = gorunum.olcek;
    if (simdi.adet > 1 && onceki.mesafe > 0) {
      const enKucuk = 0.5 * Math.min(t.clientWidth / gorunum.foto.tuval.width, t.clientHeight / gorunum.foto.tuval.height);
      olcek = Math.min(8, Math.max(enKucuk, olcek * simdi.mesafe / onceki.mesafe));
    }
    const [mx, my] = gorunum.merkez;
    // önceki parmak ortasının altındaki görüntü noktası yeni parmak ortasının altına gelsin
    const noktaX = mx + (onceki.x - t.clientWidth / 2) / gorunum.olcek;
    const noktaY = my + (onceki.y - t.clientHeight / 2) / gorunum.olcek;
    gorunum.olcek = olcek;
    gorunum.merkez = [noktaX - (simdi.x - t.clientWidth / 2) / olcek, noktaY - (simdi.y - t.clientHeight / 2) / olcek];
    onceki = simdi;
    goruntuyuCiz();
  });
  const birak = (olay) => {
    parmaklar.delete(olay.pointerId);
    onceki = parmaklar.size ? ozet() : null;
  };
  t.addEventListener("pointerup", (olay) => {
    const nokta = konum(olay);
    if (basilan && parmaklar.size === 1 && Math.hypot(nokta.x - basilan.x, nokta.y - basilan.y) < 8 && fotograftaSec(nokta.x, nokta.y)) {
      sonDokunma = 0;  // seçimden hemen sonraki dokunma çift dokunma sayılmasın
    }
    basilan = null;
    birak(olay);
  });
  t.addEventListener("pointercancel", (olay) => { basilan = null; birak(olay); });
  t.addEventListener("wheel", (olay) => {
    if (!gorunum.foto) return;
    olay.preventDefault();
    gorunum.otomatik = false;
    const { x, y } = konum(olay);
    const [mx, my] = gorunum.merkez;
    const noktaX = mx + (x - t.clientWidth / 2) / gorunum.olcek, noktaY = my + (y - t.clientHeight / 2) / gorunum.olcek;
    gorunum.olcek = Math.min(8, Math.max(0.05, gorunum.olcek * (olay.deltaY < 0 ? 1.25 : 0.8)));
    gorunum.merkez = [noktaX - (x - t.clientWidth / 2) / gorunum.olcek, noktaY - (y - t.clientHeight / 2) / gorunum.olcek];
    goruntuyuCiz();
  }, { passive: false });
  new ResizeObserver(() => (gorunum.otomatik ? boruyaOdaklan() : goruntuyuCiz())).observe(t);
}

// ---------- Başlangıç ----------
function baglantilariKur() {
  for (const dugme of document.querySelectorAll(".sekmeler button")) dugme.onclick = () => sekmeSec(dugme.dataset.sekme);
  for (const dugme of document.querySelectorAll("[data-kopyala]")) dugme.onclick = () => kopyala(dugme.dataset.kopyala);
  for (const dugme of document.querySelectorAll("[data-kapat]")) dugme.onclick = () => katmaniKapat(dugme.closest(".katman").id);

  $("dugme-ekle").onclick = manevraEkle;
  $("dugme-son-sil").onclick = sonManevrayiSil;
  $("giris-bitis").addEventListener("keydown", (olay) => { if (olay.key === "Enter") manevraEkle(); });
  $("giris-baslangic").addEventListener("keydown", (olay) => { if (olay.key === "Enter") $("giris-bitis").focus(); });
  for (const alan of ["giris-baslangic", "giris-bitis"]) {
    $(alan).addEventListener("input", () => { oneri = { baslangic: $("giris-baslangic").value, bitis: $("giris-bitis").value }; });
  }

  for (const anahtar of ["proje", "kuyu", "tarih"]) {
    $("kuyu-" + anahtar).addEventListener("input", (olay) => {
      veri.kuyu_bilgileri[anahtar] = olay.target.value;
      kaydet();
      if (anahtar === "kuyu") {
        $("ust-kuyu").textContent = olay.target.value || "Yeni kuyu";
        document.title = olay.target.value ? `Logvera — ${olay.target.value}` : "Logvera";
      }
    });
  }

  $("spt-secim").onchange = sptKutulariniDoldur;
  $("dugme-spt-kaydet").onclick = sptKaydet;
  $("dugme-spt-sil").onclick = sptSil;
  ["darbe-1", "darbe-2", "darbe-3"].forEach((k, i, hepsi) => $(k).addEventListener("keydown", (olay) => {
    if (olay.key !== "Enter") return;
    i < 2 ? $(hepsi[i + 1]).focus() : sptKaydet();
  }));

  $("dugme-tcr-hesapla").onclick = tcrHesapla;
  $("dugme-tcr-sil").onclick = tcrSonuSil;
  ["tcr-tcr", "tcr-scr", "tcr-rqd"].forEach((k, i, hepsi) => $(k).addEventListener("keydown", (olay) => {
    if (olay.key !== "Enter") return;
    i < 2 ? $(hepsi[i + 1]).focus() : tcrHesapla();
  }));

  $("dugme-kuyular").onclick = () => { kuyulariCiz(); katmaniAc("katman-kuyular"); };
  $("dugme-yeni-kuyu").onclick = () => { yeniKuyu(); katmaniKapat("katman-kuyular"); sekmeSec("manevra"); durumYaz("Yeni kuyu açıldı"); };
  $("dosya-ac").onchange = (olay) => { const dosya = olay.target.files[0]; olay.target.value = ""; if (dosya) dosyadanAc(dosya); };
  $("dugme-paylas").onclick = paylas;

  for (const k of ["foto-cek", "foto-sec"]) {
    $(k).onchange = (olay) => { const dosyalar = [...olay.target.files]; olay.target.value = ""; fotograflariEkle(dosyalar); };
  }
  $("dugme-oku").onclick = fotograflariOku;

  $("onizleme-iptal").onclick = async () => {
    const cevap = await sor("Okumadan çık", "Okunan değerler aktarılmadan kapatılsın mı? Fotoğraflar listede kalır.", [["Kapat", true, true], ["Vazgeç", false]]);
    if (cevap) katmaniKapat("katman-onizleme");
  };
  $("onizleme-aktar").onclick = aktar;
  $("onizleme-baslangic").addEventListener("input", () => onizlemeyiYenile());
  $("onizleme-son").addEventListener("input", () => onizlemeyiYenile());
  $("duzen-tip").onchange = () => { $("duzen-darbeler").hidden = $("duzen-tip").value === "UD"; };
  $("duzen-guncelle").onclick = satiriGuncelle;
  $("duzen-sil").onclick = numuneyiSil;
  $("duzen-ekle").onclick = numuneEkle;
  $("dugme-odak").onclick = () => { gorunum.otomatik = true; boruyaOdaklan(); };
  $("dugme-tum").onclick = () => { gorunum.otomatik = false; tumFotograf(); };
  dokunmalariBagla();
}

function baslat() {
  baglantilariKur();
  if (aktifKimlik && kuyular[aktifKimlik]) kuyuAc(aktifKimlik);
  else yeniKuyu();
  ozetiCiz();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

baslat();
