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
  return { kuyu_bilgileri: { proje: "", kuyu: "", tarih: "" }, manevralar: [], tcr_sonuclari: [], spt_degerleri: {}, birimler: [] };
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
  veri.birimler = veri.birimler || [];
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
  birimleriCiz();
  ozetiCiz();
}

// ---------- Log tanımlama (birim notları) ----------
let birimKaydiZamanlayici = null;

function birimiKaydet() {
  clearTimeout(birimKaydiZamanlayici);
  birimKaydiZamanlayici = setTimeout(kaydet, 300);
}

function metrajSuz(yazi) {
  // yalnızca rakam ve tek bir ondalık ayırıcı
  const temiz = yazi.replace(/[^0-9.,]/g, "");
  const ayirici = temiz.search(/[.,]/);
  return ayirici < 0 ? temiz : temiz.slice(0, ayirici + 1) + temiz.slice(ayirici + 1).replace(/[.,]/g, "");
}

function boyunuAyarla(alan) {
  // gizli sekmede ölçü sıfır çıkar; sekme açılınca tanimBoylariniAyarla yeniden ölçer
  if (!alan.offsetParent) return;
  alan.style.height = "auto";
  alan.style.height = alan.scrollHeight + 2 + "px";
}

function tanimBoylariniAyarla() {
  for (const alan of document.querySelectorAll("#birim-listesi textarea")) boyunuAyarla(alan);
}

window.addEventListener("resize", tanimBoylariniAyarla);

// Metraj "20,00-25,00" biçiminde tek yazı olarak saklanır; ekranda iki ayrı rakam kutusudur
// (iPhone'un rakam klavyesinde çizgi tuşu olmadığı için).
function metrajParcala(metraj) {
  const [bas = "", bit = ""] = String(metraj || "").split("-");
  return [bas.trim(), bit.trim()];
}

function metrajBirlestir(bas, bit) {
  return bas || bit ? `${bas}-${bit}` : "";
}

// Log biçimi: "20,00-25,00m", altında BİRİM ADI, altında tanım
function metrajYazisi(birim) {
  return birim[0] ? birim[0] + "m" : "";
}

function birimBasligi(birim) {
  return [metrajYazisi(birim), birim[1].trim().toLocaleUpperCase("tr-TR")].filter(Boolean).join("\n");
}

function birimLogu(birim) {
  return [birimBasligi(birim), birim[2].trim()].filter(Boolean).join("\n");
}

const KOPYA_SIMGESI = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
const TAMAM_SIMGESI = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';

function kopyaDugmesi(ne, metin) {
  const dugme = Object.assign(document.createElement("button"), { className: "kopya", innerHTML: KOPYA_SIMGESI });
  dugme.setAttribute("aria-label", ne + " kopyala");
  dugme.onclick = async () => {
    try {
      await navigator.clipboard.writeText(metin());
      dugme.innerHTML = TAMAM_SIMGESI;
      dugme.classList.add("tamam");
      setTimeout(() => { dugme.innerHTML = KOPYA_SIMGESI; dugme.classList.remove("tamam"); }, 1200);
      durumYaz(ne + " kopyalandı");
    } catch (hata) {
      durumYaz("Kopyalanamadı");
    }
  };
  return dugme;
}

function birimleriCiz() {
  const kap = $("birim-listesi");
  kap.textContent = "";
  $("birim-sayisi").textContent = veri.birimler.length ? `Birimler (${veri.birimler.length})` : "Birimler";
  if (!veri.birimler.length) {
    kap.appendChild(Object.assign(document.createElement("div"), {
      className: "kart bos-liste", textContent: "Henüz birim yok. Üstteki “Yeni Birim Ekle” ile başlayın.",
    }));
    return;
  }
  veri.birimler.forEach((birim, i) => {
    const kart = Object.assign(document.createElement("div"), { className: "kart birim" });
    const baslik = Object.assign(document.createElement("div"), { className: "birim-baslik" });
    const sil = Object.assign(document.createElement("button"), { className: "kucuk", textContent: "Sil" });
    sil.onclick = () => birimiSil(i);
    baslik.append(Object.assign(document.createElement("span"), { textContent: `Birim ${i + 1}` }), sil);

    // her alan: üstte etiket, altta kutu ve sağ kenarında kopyala düğmesi
    const alan = (etiket, kutu, ne, metin) => {
      const kap = Object.assign(document.createElement("div"), { className: "birim-alan" });
      const satir = Object.assign(document.createElement("div"), { className: "kopyali" });
      satir.append(kutu, kopyaDugmesi(ne, metin));
      kap.append(Object.assign(document.createElement("div"), { className: "alan-etiketi", textContent: etiket }), satir);
      return kap;
    };

    // tanım kutusunun üstünde metraj ve birim adı log biçiminde, yazıldıkça güncellenir
    const tanimBasligi = Object.assign(document.createElement("div"), { className: "tanim-basligi" });
    const basligiYenile = () => {
      tanimBasligi.textContent = birimBasligi(birim);
      tanimBasligi.hidden = !tanimBasligi.textContent;
    };

    const [bas, bit] = metrajParcala(birim[0]);
    const metrajKutusu = (deger, yer) => {
      const kutu = Object.assign(document.createElement("input"), {
        className: "metraj", inputMode: "decimal", autocomplete: "off", placeholder: yer, value: deger,
      });
      kutu.oninput = () => {
        const suzulmus = metrajSuz(kutu.value);
        if (suzulmus !== kutu.value) kutu.value = suzulmus;
        birim[0] = metrajBirlestir(baslangic.value, bitis.value);
        basligiYenile();
        birimiKaydet();
      };
      kutu.onblur = () => {
        const sayi = sayiya(kutu.value);
        if (sayi === null) return;
        kutu.value = yaziya(sayi);
        birim[0] = metrajBirlestir(baslangic.value, bitis.value);
        basligiYenile();
        birimiKaydet();
      };
      return kutu;
    };
    const baslangic = metrajKutusu(bas, "20,00");
    const bitis = metrajKutusu(bit, "25,00");
    const metraj = Object.assign(document.createElement("div"), { className: "metraj-cift" });
    metraj.append(baslangic, Object.assign(document.createElement("span"), { textContent: "–" }), bitis);

    const ad = Object.assign(document.createElement("input"), { autocomplete: "off", placeholder: "ör. Kil", value: birim[1] });
    ad.oninput = () => { birim[1] = ad.value; basligiYenile(); birimiKaydet(); };
    const tanim = Object.assign(document.createElement("textarea"), { rows: 3, placeholder: "Birimin tanımı…", value: birim[2] });
    tanim.oninput = () => { birim[2] = tanim.value; boyunuAyarla(tanim); birimiKaydet(); };
    const tanimKutusu = Object.assign(document.createElement("div"), { className: "tanim-kutusu" });
    tanimKutusu.append(tanimBasligi, tanim);
    tanimKutusu.onclick = (olay) => { if (olay.target !== tanim) tanim.focus(); };
    basligiYenile();

    kart.append(baslik,
      alan("Metraj (m)", metraj, "Metraj", () => metrajYazisi(birim)),
      alan("Birim adı", ad, "Birim adı", () => birim[1].trim()),
      alan("Tanımlama", tanimKutusu, "Birim logu", () => birimLogu(birim)));
    kap.appendChild(kart);
    requestAnimationFrame(() => boyunuAyarla(tanim));
  });
}

function birimEkle() {
  // yeni birim bir öncekinin bittiği metrajdan başlar
  const onceki = veri.birimler[veri.birimler.length - 1];
  const bas = onceki ? metrajParcala(onceki[0])[1] : "";
  veri.birimler.push([metrajBirlestir(bas, ""), "", ""]);
  kaydet();
  birimleriCiz();
  const kartlar = $("birim-listesi").querySelectorAll(".birim");
  const son = kartlar[kartlar.length - 1];
  son.scrollIntoView({ block: "center", behavior: "smooth" });
  son.querySelectorAll("input.metraj")[bas ? 1 : 0].focus();
}

async function birimiSil(indeks) {
  const birim = veri.birimler[indeks];
  if (birim.some((deger) => String(deger).trim())) {
    const ad = birim[1].trim() || `Birim ${indeks + 1}`;
    const cevap = await sor("Birimi sil", `"${ad}" silinsin mi?`, [["Sil", true, true], ["Vazgeç", false]]);
    if (!cevap) return;
  }
  veri.birimler.splice(indeks, 1);
  kaydet();
  birimleriCiz();
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
    // birimler log biçiminde, aralarında boş satır
    "birim": () => [veri.birimler.map(birimLogu).filter(Boolean).join("\n\n")],
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
    veri.birimler = (okunan.birimler || []).map((b) => [0, 1, 2].map((i) => String(b[i] ?? "")));
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
  if (ad === "tanim") tanimBoylariniAyarla();
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
    // manevralar yeniden yazılır; kuyu bilgileri ve log tanımları korunur
    const { kuyu_bilgileri, birimler } = veri;
    veri = bosVeri();
    Object.assign(veri, { kuyu_bilgileri, birimler });
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

// ---------- Karot ölçümü: fotoğraftan TCR / SCR / RQD ----------
// Şeritler ve öneriler işçide karot_olcum.py ile yapılır; toplama (karotHesapla) onunla aynı kurallarla burada.
const KAROT_FOTO_EN_BUYUK = 3000;
const NOKTA_ARALIGI = 10, RQD_ESIGI = 10, SERIT_PX = 10;
const KAROT_IPUCLARI = {
  nokta: "Karotun ortasına, bölmedeki 10 cm çizgilerinin hizasına, derinlik yönünde sırayla dokunun. Alt sıraya geçince yeni sıra kendiliğinden başlar. Noktaya dokun: sil • sürükle: taşı • iki parmak: yakınlaştır.",
  sinir: "Önce manevranın başladığı, sonra bittiği yere dokunun; bitiş alt sırada olabilir. İşarete dokun: sil • sürükle: taşı.",
  kirik: "Alttaki şeritte: dokun → kırık ekle • kırığa dokun → sil • sürükle → taşı.",
  tur: "Alttaki şeritte parçaya dokunun: sağlam (renkli) ↔ ezik/ufalanmış (renksiz, SCR ve RQD'ye sayılmaz).",
};
const karot = {
  tuval: null, surum: 0, gonderilen: -1, merkez: [0, 0], olcek: 1,
  diziler: [], aktif: null, baslangic: null, bitis: null, seritler: [], parcalar: [], onceki: [], gecmis: [],
  mod: "nokta", kirpma: false, cizim: null, buyutec: null, istek: 0, kayitMesaji: "",
};
const tamCm = (deger) => Math.floor(deger + 0.5);
const konumOnce = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

async function karotFotoHazirla(dosya) {
  const bitmap = await createImageBitmap(dosya, { colorSpaceConversion: "none" }).catch(() => createImageBitmap(dosya));
  const olcek = Math.min(1, KAROT_FOTO_EN_BUYUK / Math.max(bitmap.width, bitmap.height));
  const t = document.createElement("canvas");
  t.width = Math.round(bitmap.width * olcek);
  t.height = Math.round(bitmap.height * olcek);
  const b = t.getContext("2d");
  b.imageSmoothingQuality = "high";
  b.drawImage(bitmap, 0, 0, t.width, t.height);
  bitmap.close?.();
  return t;
}

async function karotAc(dosya, oncekiKoru = false) {
  let tuval;
  try {
    tuval = await karotFotoHazirla(dosya);
  } catch (hata) {
    sor("Karot Ölçümü", "Fotoğraf açılamadı.", [["Tamam", true, true]]);
    return false;
  }
  Object.assign(karot, {
    tuval, surum: karot.surum + 1, diziler: [], aktif: null, baslangic: null, bitis: null, seritler: [], parcalar: [],
    onceki: oncekiKoru ? karot.onceki : [], gecmis: [], kirpma: false, cizim: null, buyutec: null,
  });
  if ($("katman-karot").hidden) {
    karot.kayitMesaji = "";
    katmaniAc("katman-karot");
    karotManevralariniDoldur();
  }
  karotModSec("nokta");
  requestAnimationFrame(() => { karotTumu(); karotCizHepsi(); });
  motoruHazirla();
  return true;
}

function karotManevralariniDoldur(secilecek) {
  const liste = kManevralari();
  const yapilan = new Set(veri.tcr_sonuclari.map((s) => s[0]));
  secenekleriDoldur($("karot-manevra"), liste, secilecek ?? liste.find((a) => !yapilan.has(a)) ?? liste[0] ?? "");
}

function karotAralik() {
  const deger = $("karot-manevra").value;
  if (!deger) return null;
  const [a, b] = deger.split("-").map(sayiya);
  return a !== null && b !== null && b > a ? [a, b] : null;
}

function karotModSec(mod) {
  karot.mod = mod;
  for (const dugme of document.querySelectorAll("#karot-modlar button")) dugme.classList.toggle("secili", dugme.dataset.mod === mod);
  $("karot-ipucu").textContent = karot.kirpma ? "Sandığın çevresine parmağınızla bir dikdörtgen çizin; fotoğraf bu alana kırpılır." : KAROT_IPUCLARI[mod];
}

// ---- nokta dizisi (cetvel): karot_olcum.py'deki cetvelde_konum ve cetvel_noktasi ile aynı ----
function cetvelKonumu(dizi, x, y) {
  if (dizi.length < 2) return null;
  let enIyi = null;
  for (let k = 0; k < dizi.length - 1; k++) {
    const [ax, ay] = dizi[k], dx = dizi[k + 1][0] - ax, dy = dizi[k + 1][1] - ay, uzunluk2 = dx * dx + dy * dy;
    if (!uzunluk2) continue;
    const t = Math.min(k === dizi.length - 2 ? 2.5 : 1, Math.max(k === 0 ? -1.5 : 0, ((x - ax) * dx + (y - ay) * dy) / uzunluk2));
    const uzak = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (!enIyi || uzak < enIyi[1]) enIyi = [NOKTA_ARALIGI * (k + t), uzak];
  }
  return enIyi;
}

function cetvelNoktasi(dizi, cm) {
  const k = Math.min(Math.max(Math.floor(cm / NOKTA_ARALIGI), 0), dizi.length - 2);
  const [ax, ay] = dizi[k], dx = dizi[k + 1][0] - ax, dy = dizi[k + 1][1] - ay;
  const uzunluk = Math.max(Math.hypot(dx, dy), 1e-6), t = cm / NOKTA_ARALIGI - k;
  return { x: ax + t * dx, y: ay + t * dy, yx: dx / uzunluk, yy: dy / uzunluk, olcek: uzunluk / NOKTA_ARALIGI };
}

function karotCetvelde(x, y) {
  let enIyi = null;
  karot.diziler.forEach((dizi, s) => {
    const konum = cetvelKonumu(dizi, x, y);
    if (konum && (!enIyi || konum[1] < enIyi[2])) enIyi = [s, Math.round(konum[0] * 10) / 10, konum[1]];
  });
  return enIyi && enIyi.slice(0, 2);
}

const karotIsaretGecerli = (konum) => konum && konum[0] < karot.diziler.length && karot.diziler[konum[0]].length >= 2;

// ---- görünüm ----
const karotTuvali = () => $("karot-tuval");

function karotEkrana(x, y) {
  const t = karotTuvali();
  return [(x - karot.merkez[0]) * karot.olcek + t.clientWidth / 2, (y - karot.merkez[1]) * karot.olcek + t.clientHeight / 2];
}

function karotResme(ex, ey) {
  const t = karotTuvali();
  return [karot.merkez[0] + (ex - t.clientWidth / 2) / karot.olcek, karot.merkez[1] + (ey - t.clientHeight / 2) / karot.olcek];
}

function karotTumu() {
  const t = karotTuvali(), foto = karot.tuval;
  if (!foto) return;
  karot.olcek = Math.min(t.clientWidth / foto.width, t.clientHeight / foto.height);
  karot.merkez = [foto.width / 2, foto.height / 2];
  karotFotoCiz();
}

function tuvaliHazirla(t, yukseklik) {
  const oran = window.devicePixelRatio || 1;
  const genislik = t.clientWidth;
  yukseklik = yukseklik ?? t.clientHeight;
  if (t.width !== Math.round(genislik * oran) || t.height !== Math.round(yukseklik * oran)) {
    t.width = Math.round(genislik * oran);
    t.height = Math.round(yukseklik * oran);
  }
  const b = t.getContext("2d");
  b.setTransform(oran, 0, 0, oran, 0, 0);
  return [b, genislik, yukseklik];
}

function karotCaprazCiz(b, dizi, cm, yariCm, renk, kalinlik) {
  // karot eksenine dik çizgi; üst ucunun ekran konumunu döndürür
  const n = cetvelNoktasi(dizi, cm), nx = -n.yy * yariCm * n.olcek, ny = n.yx * yariCm * n.olcek;
  const a = karotEkrana(n.x - nx, n.y - ny), c = karotEkrana(n.x + nx, n.y + ny);
  b.strokeStyle = renk;
  b.lineWidth = kalinlik;
  b.beginPath(); b.moveTo(...a); b.lineTo(...c); b.stroke();
  return a[1] < c[1] ? a : c;
}

function etiketCiz(b, x, y, metin, renk) {
  b.font = "bold 13px -apple-system, sans-serif";
  const genislik = b.measureText(metin).width + 8;
  b.fillStyle = renk;
  b.fillRect(x - genislik / 2, y - 20, genislik, 18);
  b.fillStyle = "#fff";
  b.textAlign = "center";
  b.textBaseline = "middle";
  b.fillText(metin, x, y - 11);
}

function karotFotoCiz() {
  const [b, genislik, yukseklik] = tuvaliHazirla(karotTuvali());
  b.fillStyle = "#222";
  b.fillRect(0, 0, genislik, yukseklik);
  const foto = karot.tuval;
  if (!foto) return;
  const [x0, y0] = karotResme(0, 0), o = karot.olcek;
  b.imageSmoothingQuality = "high";
  b.drawImage(foto, -x0 * o, -y0 * o, foto.width * o, foto.height * o);
  karot.seritler.forEach((serit, i) => {
    for (const kesim of karot.parcalar[i]?.kesimler || []) karotCaprazCiz(b, karot.diziler[serit.sira], serit.c0 + kesim, 2.5, "#E62828", 2);
  });
  karot.diziler.forEach((dizi, s) => {
    const ekran = dizi.map(([x, y]) => karotEkrana(x, y));
    b.strokeStyle = "#FFD200";
    b.lineWidth = 1.5;
    b.beginPath();
    ekran.forEach(([x, y], j) => (j ? b.lineTo(x, y) : b.moveTo(x, y)));
    b.stroke();
    b.fillStyle = "#FFD200";
    b.strokeStyle = "#000";
    b.lineWidth = 1;
    for (const [x, y] of ekran) { b.beginPath(); b.arc(x, y, 5, 0, 2 * Math.PI); b.fill(); b.stroke(); }
    if (ekran.length) {
      b.font = "bold 13px -apple-system, sans-serif";
      b.textAlign = "right";
      b.textBaseline = "middle";
      b.fillText(`${s + 1}. sıra`, ekran[0][0] - 9, ekran[0][1]);
    }
  });
  const aralik = karotAralik();
  for (const [ad, renk, metin] of [["baslangic", "#22C55E", "Başlangıç"], ["bitis", "#EF4444", "Bitiş"]]) {
    if (!karotIsaretGecerli(karot[ad])) continue;
    const uc = karotCaprazCiz(b, karot.diziler[karot[ad][0]], karot[ad][1], 4, renk, 4);
    const derinlik = aralik ? ` ${yaziya(ad === "baslangic" ? aralik[0] : aralik[1])}` : "";
    etiketCiz(b, uc[0], uc[1], metin + derinlik, renk);
  }
  if (karot.cizim) {
    const [ax, ay, cx, cy] = karot.cizim;
    b.setLineDash([6, 4]);
    b.strokeStyle = "#fff";
    b.lineWidth = 2;
    b.strokeRect(Math.min(ax, cx), Math.min(ay, cy), Math.abs(cx - ax), Math.abs(cy - ay));
    b.setLineDash([]);
  }
  if (karot.buyutec) {
    // sürüklenen noktanın büyütülmüş görüntüsü; parmak altında kalanı gösterir
    const [px, py] = karot.buyutec, r = 60, z = Math.min(8, Math.max(1, o * 3));
    const ex = karotEkrana(px, py)[0] < genislik / 2 ? genislik - r - 10 : r + 10, ey = r + 10;
    b.save();
    b.beginPath(); b.arc(ex, ey, r, 0, 2 * Math.PI); b.clip();
    b.fillStyle = "#222"; b.fillRect(ex - r, ey - r, 2 * r, 2 * r);
    b.drawImage(foto, ex - px * z, ey - py * z, foto.width * z, foto.height * z);
    b.strokeStyle = "#FFD200"; b.lineWidth = 1;
    b.beginPath(); b.moveTo(ex - r, ey); b.lineTo(ex + r, ey); b.moveTo(ex, ey - r); b.lineTo(ex, ey + r); b.stroke();
    b.restore();
    b.strokeStyle = "#fff"; b.lineWidth = 2;
    b.beginPath(); b.arc(ex, ey, r, 0, 2 * Math.PI); b.stroke();
  }
}

// ---- noktalar ve işaretler ----
function karotGecmiseEkle() {
  const { diziler, aktif, baslangic, bitis, parcalar } = karot;
  karot.gecmis.push(JSON.stringify({ diziler, aktif, baslangic, bitis, parcalar }));
  if (karot.gecmis.length > 50) karot.gecmis.shift();
}

function karotGeriAl() {
  const kayit = karot.gecmis.pop();
  if (!kayit) return;
  const onceki = JSON.parse(kayit);
  const ayniAralik = JSON.stringify([onceki.diziler, onceki.baslangic, onceki.bitis]) === JSON.stringify([karot.diziler, karot.baslangic, karot.bitis]);
  Object.assign(karot, onceki);
  if (ayniAralik) karotCizHepsi();
  else karotSeritleriGuncelle(false);
}

function karotNoktaEkle(x, y) {
  const diziler = karot.diziler;
  const araliklar = diziler.flatMap((dizi) => dizi.slice(1).map((n, j) => Math.hypot(n[0] - dizi[j][0], n[1] - dizi[j][1]))).sort((a, b) => a - b);
  let aktif = karot.aktif;
  if (aktif !== null && aktif < diziler.length && diziler[aktif].length && araliklar.length) {
    const son = diziler[aktif][diziler[aktif].length - 1];
    // bir önceki noktaya 10 cm'den çok uzaksa alt sıraya geçilmiştir
    if (Math.hypot(x - son[0], y - son[1]) > 1.7 * araliklar[Math.floor(araliklar.length / 2)]) aktif = null;
  }
  if (aktif === null || aktif >= diziler.length) {
    diziler.push([]);
    aktif = diziler.length - 1;
  }
  diziler[aktif].push([x, y]);
  karot.aktif = aktif;
}

function karotNoktaSil(s, j) {
  const dizi = karot.diziler[s];
  dizi.splice(j, 1);
  if (dizi.length) return;
  karot.diziler.splice(s, 1);
  for (const ad of ["baslangic", "bitis"]) {
    const konum = karot[ad];
    if (konum && konum[0] === s) karot[ad] = null;
    else if (konum && konum[0] > s) karot[ad] = [konum[0] - 1, konum[1]];
  }
  karot.aktif = null;
}

function karotIsaretleriSirala() {
  if (karot.baslangic && karot.bitis && konumOnce(karot.bitis, karot.baslangic)) [karot.baslangic, karot.bitis] = [karot.bitis, karot.baslangic];
}

function karotHedefBul(ex, ey) {
  if (karot.kirpma) return { tur: "kirp" };
  if (karot.mod === "nokta") {
    // uzaktan bakarken noktalar ve sıralar sık görünür; dokunma alanı nokta aralığının üçte birini geçmez
    const araliklar = karot.diziler.flatMap((dizi) => dizi.slice(1).map((n, j) => Math.hypot(n[0] - dizi[j][0], n[1] - dizi[j][1])));
    const enKisa = araliklar.length ? Math.min(...araliklar) * karot.olcek : Infinity;
    let enIyi = null, sinir = Math.min(22, enKisa / 3);
    karot.diziler.forEach((dizi, s) => dizi.forEach(([x, y], j) => {
      const [sx, sy] = karotEkrana(x, y), uzak = Math.hypot(sx - ex, sy - ey);
      if (uzak <= sinir) { enIyi = { tur: "nokta", s, j }; sinir = uzak; }
    }));
    return enIyi;
  }
  if (karot.mod === "sinir") {
    for (const ad of ["baslangic", "bitis"]) {
      if (!karotIsaretGecerli(karot[ad])) continue;
      const n = cetvelNoktasi(karot.diziler[karot[ad][0]], karot[ad][1]);
      const [sx, sy] = karotEkrana(n.x, n.y);
      if (Math.hypot(sx - ex, sy - ey) <= 24) return { tur: "isaret", ad };
    }
  }
  return null;
}

function karotDokunuldu(ex, ey, hedef) {
  const [x, y] = karotResme(ex, ey);
  if (karot.mod === "nokta") {
    karotGecmiseEkle();
    hedef ? karotNoktaSil(hedef.s, hedef.j) : karotNoktaEkle(x, y);
  } else if (karot.mod === "sinir") {
    if (hedef) {
      karotGecmiseEkle();
      karot[hedef.ad] = null;
    } else {
      const konum = karotCetvelde(x, y);
      if (!konum) {
        sor("Karot Ölçümü", "Önce 1. adımda 10 cm noktalarını koyun (her sırada en az 2 nokta).", [["Tamam", true, true]]);
        return;
      }
      karotGecmiseEkle();
      if (!karot.baslangic) karot.baslangic = konum;
      else if (!karot.bitis) karot.bitis = konum;
      else {
        // ikisi de varsa dokunulan yere yakın olan taşınır
        const uzaklik = (ad) => { const n = cetvelNoktasi(karot.diziler[karot[ad][0]], karot[ad][1]); return Math.hypot(n.x - x, n.y - y); };
        karot[uzaklik("baslangic") <= uzaklik("bitis") ? "baslangic" : "bitis"] = konum;
      }
      karotIsaretleriSirala();
    }
  } else {
    return;
  }
  karotSeritleriGuncelle();
}

function karotDokunmalariniBagla() {
  const t = karotTuvali();
  const parmaklar = new Map();
  let onceki = null, basilan = null;
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
  t.addEventListener("pointerdown", (olay) => {
    if (!karot.tuval) return;
    t.setPointerCapture(olay.pointerId);
    const n = konum(olay);
    parmaklar.set(olay.pointerId, n);
    onceki = ozet();
    basilan = parmaklar.size === 1 ? { ...n, hedef: karotHedefBul(n.x, n.y), suruklendi: false } : null;
    if (!basilan) { karot.cizim = null; karot.buyutec = null; karotFotoCiz(); }
  });
  t.addEventListener("pointermove", (olay) => {
    if (!parmaklar.has(olay.pointerId) || !karot.tuval) return;
    const n = konum(olay);
    parmaklar.set(olay.pointerId, n);
    if (basilan && parmaklar.size === 1) {
      if (!basilan.suruklendi && Math.hypot(n.x - basilan.x, n.y - basilan.y) < 8) return;
      if (!basilan.suruklendi) {
        basilan.suruklendi = true;
        if (basilan.hedef && basilan.hedef.tur !== "kirp") karotGecmiseEkle();
      }
      const hedef = basilan.hedef;
      if (hedef) {
        const [x, y] = karotResme(n.x, n.y);
        if (hedef.tur === "kirp") karot.cizim = [basilan.x, basilan.y, n.x, n.y];
        else if (hedef.tur === "nokta") { karot.diziler[hedef.s][hedef.j] = [x, y]; karot.buyutec = [x, y]; }
        else {
          const yer = karotCetvelde(x, y);
          if (yer) karot[hedef.ad] = yer;
          karot.buyutec = [x, y];
        }
        karotFotoCiz();
        return;
      }
    }
    // tek parmak boşlukta: kaydır; iki parmak: yakınlaştır
    const simdi = ozet();
    if (simdi.adet !== onceki.adet) { onceki = simdi; return; }
    let olcek = karot.olcek;
    if (simdi.adet > 1 && onceki.mesafe > 0) {
      const enKucuk = 0.5 * Math.min(t.clientWidth / karot.tuval.width, t.clientHeight / karot.tuval.height);
      olcek = Math.min(8, Math.max(enKucuk, olcek * simdi.mesafe / onceki.mesafe));
    }
    const [noktaX, noktaY] = karotResme(onceki.x, onceki.y);
    karot.olcek = olcek;
    karot.merkez = [noktaX - (simdi.x - t.clientWidth / 2) / olcek, noktaY - (simdi.y - t.clientHeight / 2) / olcek];
    onceki = simdi;
    karotFotoCiz();
  });
  const birak = (olay) => {
    parmaklar.delete(olay.pointerId);
    onceki = parmaklar.size ? ozet() : null;
  };
  t.addEventListener("pointerup", (olay) => {
    const n = konum(olay);
    if (basilan && parmaklar.size === 1) {
      const hedef = basilan.hedef;
      if (!basilan.suruklendi) {
        if (karot.kirpma) karot.cizim = null;
        else karotDokunuldu(n.x, n.y, hedef);
      } else if (hedef?.tur === "kirp") {
        karotKirp();
      } else if (hedef) {
        karot.buyutec = null;
        karotIsaretleriSirala();
        karotSeritleriGuncelle();
      }
    }
    basilan = null;
    birak(olay);
    karotFotoCiz();
  });
  t.addEventListener("pointercancel", (olay) => { basilan = null; karot.buyutec = null; birak(olay); karotFotoCiz(); });
  t.addEventListener("wheel", (olay) => {
    if (!karot.tuval) return;
    olay.preventDefault();
    const { x, y } = konum(olay);
    const [noktaX, noktaY] = karotResme(x, y);
    karot.olcek = Math.min(8, Math.max(0.05, karot.olcek * (olay.deltaY < 0 ? 1.25 : 0.8)));
    karot.merkez = [noktaX - (x - t.clientWidth / 2) / karot.olcek, noktaY - (y - t.clientHeight / 2) / karot.olcek];
    karotFotoCiz();
  }, { passive: false });
  new ResizeObserver(() => karotFotoCiz()).observe(t);
}

// ---- çevir ve kırp ----
async function karotCevir(sagaMi) {
  if (!karot.tuval) return;
  if (karot.diziler.length && !(await sor("Çevir", "Koyduğunuz noktalar silinecek. Devam edilsin mi?", [["Çevir", true, true], ["Vazgeç", false]]))) return;
  const eski = karot.tuval, yeni = document.createElement("canvas");
  yeni.width = eski.height;
  yeni.height = eski.width;
  const b = yeni.getContext("2d");
  b.translate(yeni.width / 2, yeni.height / 2);
  b.rotate((sagaMi ? 1 : -1) * Math.PI / 2);
  b.drawImage(eski, -eski.width / 2, -eski.height / 2);
  Object.assign(karot, { tuval: yeni, surum: karot.surum + 1, diziler: [], aktif: null, baslangic: null, bitis: null, seritler: [], parcalar: [], gecmis: [] });
  karotTumu();
  karotCizHepsi();
}

function karotKirpmaDegistir() {
  if (!karot.tuval) return;
  karot.kirpma = !karot.kirpma;
  karot.cizim = null;
  $("karot-kirp").textContent = karot.kirpma ? "Vazgeç" : "Kırp";
  karotModSec(karot.mod);
  karotFotoCiz();
}

function karotKirp() {
  const cizim = karot.cizim;
  karot.cizim = null;
  karotKirpmaDegistir();
  if (!cizim) return;
  const [ax, ay] = karotResme(Math.min(cizim[0], cizim[2]), Math.min(cizim[1], cizim[3]));
  const [cx, cy] = karotResme(Math.max(cizim[0], cizim[2]), Math.max(cizim[1], cizim[3]));
  const eski = karot.tuval;
  const x0 = Math.max(0, Math.round(ax)), y0 = Math.max(0, Math.round(ay));
  const x1 = Math.min(eski.width, Math.round(cx)), y1 = Math.min(eski.height, Math.round(cy));
  if (x1 - x0 < 20 || y1 - y0 < 20) return;
  const yeni = document.createElement("canvas");
  yeni.width = x1 - x0;
  yeni.height = y1 - y0;
  yeni.getContext("2d").drawImage(eski, -x0, -y0);
  karot.tuval = yeni;
  karot.surum++;
  karot.diziler = karot.diziler.map((dizi) => dizi.map(([x, y]) => [x - x0, y - y0]));
  karot.gecmis = [];
  karotTumu();
  karotSeritleriGuncelle(false);
}

// ---- şeritler ----
async function karotSeritleriGuncelle(oner = true) {
  const no = ++karot.istek;
  if (!karot.tuval || !karotIsaretGecerli(karot.baslangic) || !karotIsaretGecerli(karot.bitis)) {
    karot.seritler = [];
    karot.parcalar = [];
    karotCizHepsi();
    return;
  }
  karotCizHepsi();
  $("karot-durum").textContent = motorHazir ? "Ölçülüyor…" : "Ölçüm motoru yükleniyor…";
  try {
    if (karot.gonderilen !== karot.surum) {
      const surum = karot.surum, t = karot.tuval;
      const piksel = t.getContext("2d").getImageData(0, 0, t.width, t.height).data;
      await iste("karot_resmi", { piksel, genislik: t.width, yukseklik: t.height }, [piksel.buffer]);
      karot.gonderilen = surum;
      motorHazir = true;
    }
    const seritler = await iste("karot_seritleri", { diziler: karot.diziler, baslangic: karot.baslangic, bitis: karot.bitis });
    if (no !== karot.istek) return;  // bu arada yeni bir istek yapıldı
    karot.seritler = seritler.map((serit) => {
      const resim = document.createElement("canvas");
      resim.width = serit.genislik;
      resim.height = serit.yukseklik;
      resim.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(serit.piksel.buffer), serit.genislik, serit.yukseklik), 0, 0);
      return { sira: serit.sira, c0: serit.c0, c1: serit.c1, genislik: serit.genislik, yukseklik: serit.yukseklik, oneri: serit.oneri, resim };
    });
    if (oner || karot.parcalar.length !== karot.seritler.length) karot.parcalar = karot.seritler.map((s) => s.oneri);
    $("karot-durum").textContent = "";
  } catch (hata) {
    if (no === karot.istek) $("karot-durum").textContent = "Ölçülemedi: " + hata.message;
  }
  karotCizHepsi();
}

function karotParcalari(sira) {
  const sinir = [0, ...sira.kesimler, sira.uzunluk];
  return sira.turler.map((tur, i) => [sinir[i], sinir[i + 1], tur]);
}

function karotSeritYerlesimi() {
  if (!karot.seritler.length) return null;
  const genislik = $("karot-serit").clientWidth, solBosluk = 54;
  const olcek = Math.min(2, (genislik - solBosluk - 8) / Math.max(...karot.seritler.map((s) => s.genislik)));
  const boy = karot.seritler[0].yukseklik * olcek;
  return { olcek, solBosluk, boy, satir: boy + 18, ust: 14 };
}

function karotSeritCiz() {
  const t = $("karot-serit"), y = karotSeritYerlesimi();
  const yukseklik = y ? y.ust + y.satir * karot.seritler.length : 64;
  t.style.height = yukseklik + "px";
  const [b, genislik] = tuvaliHazirla(t, yukseklik);
  b.fillStyle = "#222";
  b.fillRect(0, 0, genislik, yukseklik);
  b.font = "13px -apple-system, sans-serif";
  b.textBaseline = "middle";
  if (!y) {
    b.fillStyle = "#ccc";
    b.textAlign = "center";
    b.fillText("Noktaları koyup başlangıç ve bitişi işaretleyince", genislik / 2, 24);
    b.fillText("ölçülen aralık burada görünür", genislik / 2, 42);
    return;
  }
  karot.seritler.forEach((serit, i) => {
    const sira = karot.parcalar[i], ust = y.ust + i * y.satir;
    const x = (cm) => y.solBosluk + cm * SERIT_PX * y.olcek;
    b.drawImage(serit.resim, y.solBosluk, ust, serit.genislik * y.olcek, y.boy);
    for (const [a, c, tur] of karotParcalari(sira)) {
      if (tur !== "s") continue;
      const renk = tamCm(c - a) >= RQD_ESIGI ? "60, 180, 60" : "255, 210, 0";
      b.fillStyle = `rgba(${renk}, .3)`;
      b.fillRect(x(a), ust, x(c) - x(a), y.boy);
      b.strokeStyle = `rgb(${renk})`;
      b.lineWidth = 2;
      b.strokeRect(x(a) + 1, ust + 1, x(c) - x(a) - 2, y.boy - 2);
      if (x(c) - x(a) >= 22) {
        b.font = "bold 12px -apple-system, sans-serif";
        b.textAlign = "center";
        const metin = String(tamCm(c - a)), w = b.measureText(metin).width + 6;
        b.fillStyle = "#1F2937";
        b.fillRect((x(a) + x(c)) / 2 - w / 2, ust + y.boy / 2 - 8, w, 16);
        b.fillStyle = "#fff";
        b.fillText(metin, (x(a) + x(c)) / 2, ust + y.boy / 2);
      }
    }
    b.strokeStyle = "#E62828";
    b.lineWidth = 2;
    for (const kesim of sira.kesimler) { b.beginPath(); b.moveTo(x(kesim), ust); b.lineTo(x(kesim), ust + y.boy); b.stroke(); }
    // sarı çentikler fotoğraftaki 10 cm noktalarının hizasındadır
    b.strokeStyle = "#FFD200";
    for (let cm = Math.ceil(serit.c0 / NOKTA_ARALIGI) * NOKTA_ARALIGI; cm <= serit.c1 + 1e-6; cm += NOKTA_ARALIGI) {
      b.beginPath(); b.moveTo(x(cm - serit.c0), ust - 8); b.lineTo(x(cm - serit.c0), ust); b.stroke();
    }
    b.fillStyle = "#fff";
    b.font = "12px -apple-system, sans-serif";
    b.textAlign = "right";
    b.fillText(`${serit.sira + 1}. sıra`, y.solBosluk - 6, ust + y.boy / 2 - 8);
    b.fillText(`${tamCm(sira.uzunluk)} cm`, y.solBosluk - 6, ust + y.boy / 2 + 8);
  });
}

function karotKesimEkle(sira, cm) {
  const k = sira.kesimler;
  let j = 0;
  while (j < k.length && k[j] <= cm) j++;
  if (cm < 0.2 || cm > sira.uzunluk - 0.2 || (j > 0 && cm - k[j - 1] < 0.2) || (j < k.length && k[j] - cm < 0.2)) return;
  k.splice(j, 0, Math.round(cm * 10) / 10);
  sira.turler.splice(j, 0, sira.turler[j]);
}

function karotKesimSil(sira, j) {
  // kırık kaldırılınca iki yan tek parça olur; yanlardan biri sağlamsa birleşen parça da sağlamdır
  const tur = sira.turler[j] === "s" || sira.turler[j + 1] === "s" ? "s" : "b";
  sira.kesimler.splice(j, 1);
  sira.turler.splice(j, 2, tur);
}

function karotSeritBagla() {
  const t = $("karot-serit");
  let basilan = null;
  const yer = (olay) => {
    const y = karotSeritYerlesimi();
    if (!y) return null;
    const kutu = t.getBoundingClientRect(), ex = olay.clientX - kutu.left, ey = olay.clientY - kutu.top;
    const i = Math.floor((ey - y.ust + 9) / y.satir);
    if (i < 0 || i >= karot.seritler.length) return null;
    return { i, ex, cm: Math.min(karot.parcalar[i].uzunluk, Math.max(0, (ex - y.solBosluk) / y.olcek / SERIT_PX)), sinir: 14 / (y.olcek * SERIT_PX) };
  };
  t.addEventListener("pointerdown", (olay) => {
    const n = yer(olay);
    basilan = n && { ...n, suruklendi: false, j: null };
    if (!basilan || karot.mod === "tur") return;
    const adaylar = karot.parcalar[n.i].kesimler.map((k, j) => [Math.abs(k - n.cm), j]).filter(([u]) => u <= n.sinir).sort((a, b) => a[0] - b[0]);
    basilan.j = adaylar.length ? adaylar[0][1] : null;
    if (basilan.j !== null) t.setPointerCapture(olay.pointerId);
  });
  t.addEventListener("pointermove", (olay) => {
    if (!basilan || basilan.j === null) return;
    const kutu = t.getBoundingClientRect(), ex = olay.clientX - kutu.left;
    if (!basilan.suruklendi) {
      if (Math.abs(ex - basilan.ex) < 6) return;
      karotGecmiseEkle();
      basilan.suruklendi = true;
    }
    const y = karotSeritYerlesimi(), sira = karot.parcalar[basilan.i], k = sira.kesimler, j = basilan.j;
    const cm = (ex - y.solBosluk) / y.olcek / SERIT_PX;
    const alt = j > 0 ? k[j - 1] + 0.2 : 0.2, ust = j + 1 < k.length ? k[j + 1] - 0.2 : sira.uzunluk - 0.2;
    k[j] = Math.round(Math.min(ust, Math.max(alt, cm)) * 10) / 10;
    karotCizHepsi();
  });
  t.addEventListener("pointerup", () => {
    const n = basilan;
    basilan = null;
    if (!n || n.suruklendi) return;
    const sira = karot.parcalar[n.i];
    karotGecmiseEkle();
    if (karot.mod === "tur") {
      const k = sira.kesimler.filter((kesim) => kesim <= n.cm).length;
      sira.turler[k] = sira.turler[k] === "s" ? "b" : "s";
    } else {
      if (karot.mod !== "kirik") karotModSec("kirik");
      n.j !== null ? karotKesimSil(sira, n.j) : karotKesimEkle(sira, n.cm);
    }
    karotCizHepsi();
  });
  t.addEventListener("pointercancel", () => { basilan = null; });
  new ResizeObserver(() => karotSeritCiz()).observe(t);
}

// ---- sonuç ----
// karot_olcum.hesapla ile aynı: her parça tam cm'ye yuvarlanır, toplamlar bu tam sayılardan yapılır
function karotHesapla(seritler) {
  const toplam = { tcr: 0, scr: 0, rqd: 0, scrParcalar: [], rqdParcalar: [] };
  for (const sira of seritler) {
    toplam.tcr += tamCm(sira.uzunluk);
    for (const [a, b, tur] of karotParcalari(sira)) {
      if (tur !== "s") continue;
      const uzunluk = tamCm(b - a);
      toplam.scr += uzunluk;
      toplam.scrParcalar.push(uzunluk);
      if (uzunluk >= RQD_ESIGI) {
        toplam.rqd += uzunluk;
        toplam.rqdParcalar.push(uzunluk);
      }
    }
  }
  toplam.sayilmayan = toplam.tcr - toplam.scr;
  return toplam;
}

const karotYuzde = (cm, aralik) => pyRound((cm / 100) / r2(aralik[1] - aralik[0]) * 100);

function karotSonucYaz() {
  const tum = [...karot.onceki, ...karot.parcalar], aralik = karotAralik();
  const uzunluk = aralik ? tamCm((aralik[1] - aralik[0]) * 100) : 0;
  const bilgiler = [];
  if (aralik) bilgiler.push(`Manevra ${$("karot-manevra").value}: ${uzunluk} cm ilerleme`);
  if (!tum.length) {
    $("karot-sonuc").textContent = "TCR: –\nSCR: –\nRQD: –";
  } else {
    const t = karotHesapla(tum);
    const yaz = (ad) => (aralik ? `${t[ad]} ÷ ${uzunluk} cm = %${karotYuzde(t[ad], aralik)}` : `${t[ad]} cm`);
    $("karot-sonuc").textContent = `TCR: ${yaz("tcr")}\nSCR: ${yaz("scr")}\nRQD: ${yaz("rqd")}`;
    bilgiler.push(`TCR = işaretlenen aralık: ${t.tcr} cm`);
    bilgiler.push(`SCR = sağlam parçalar: ${t.scrParcalar.join(" + ") || "yok"} = ${t.scr} cm`);
    bilgiler.push(`RQD = ${RQD_ESIGI} cm ve üzeri sağlam parçalar: ${t.rqdParcalar.join(" + ") || "yok"} = ${t.rqd} cm`);
    bilgiler.push(`SCR'ye sayılmayan (ezik / ufalanmış / boş): ${t.sayilmayan} cm`);
  }
  if (karot.onceki.length) bilgiler.push(`Önceki fotoğraf(lar)dan gelen ${karot.onceki.length} sıra dahil.`);
  if (!kManevralari().length) bilgiler.push("Manevra listesinde K manevrası yok; önce Manevra sekmesinden ekleyin.");
  if (karot.kayitMesaji) bilgiler.push(karot.kayitMesaji);
  $("karot-bilgi").textContent = bilgiler.join("\n");
}

function karotCizHepsi() {
  karotFotoCiz();
  karotSeritCiz();
  karotSonucYaz();
}

async function karotKaydet() {
  const aralik = karotAralik(), tum = [...karot.onceki, ...karot.parcalar];
  if (!aralik) return sor("Karot Ölçümü", "Önce ölçtüğünüz manevrayı seçin.", [["Tamam", true, true]]);
  if (!tum.length) return sor("Karot Ölçümü", "Önce noktaları koyup manevranın başlangıcını ve bitişini işaretleyin.", [["Tamam", true, true]]);
  const secilen = $("karot-manevra").value, liste = kManevralari(), t = karotHesapla(tum);
  const yuzdeler = [t.tcr, t.scr, t.rqd].map((cm) => karotYuzde(cm, aralik));
  veri.tcr_sonuclari = veri.tcr_sonuclari.filter((s) => s[0] !== secilen);
  veri.tcr_sonuclari.push([secilen, ...yuzdeler]);
  const sira = (s) => (liste.includes(s[0]) ? liste.indexOf(s[0]) : liste.length);
  veri.tcr_sonuclari.sort((a, b) => sira(a) - sira(b));
  kaydet();
  tcrCiz();
  karot.kayitMesaji = `Kaydedildi: ${secilen} → TCR %${yuzdeler[0]}, SCR %${yuzdeler[1]}, RQD %${yuzdeler[2]}`;
  durumYaz(karot.kayitMesaji);
  // sonraki manevra bu manevranın bittiği yerden başlar
  if (liste.indexOf(secilen) + 1 < liste.length) $("karot-manevra").value = liste[liste.indexOf(secilen) + 1];
  Object.assign(karot, { onceki: [], gecmis: [], baslangic: karot.bitis, bitis: null, seritler: [], parcalar: [] });
  karotModSec("sinir");
  karotCizHepsi();
}

async function kaydedilmemisVarMi() {
  if (!karot.parcalar.length && !karot.onceki.length) return false;
  return !(await sor("Kaydedilmemiş Ölçüm", "İşaretlediğiniz manevra TCR listesine kaydedilmedi. Kaydetmeden devam edilsin mi?",
    [["Devam Et", true, true], ["Vazgeç", false]]));
}

async function karotDevam(dosya) {
  if (!karotIsaretGecerli(karot.baslangic)) {
    return sor("Karot Ölçümü", "Önce bu fotoğrafta manevranın başladığı yeri işaretleyin.", [["Tamam", true, true]]);
  }
  if (!karotIsaretGecerli(karot.bitis)) {
    // bitiş işaretlenmediyse son sıranın sonuna kadar ölçülür
    const son = karot.diziler.length - 1;
    karot.bitis = [son, NOKTA_ARALIGI * (karot.diziler[son].length - 1)];
    await karotSeritleriGuncelle();
  }
  if (!karot.parcalar.length) return sor("Karot Ölçümü", "Bu fotoğrafta ölçülecek aralık yok.", [["Tamam", true, true]]);
  karot.onceki = [...karot.onceki, ...JSON.parse(JSON.stringify(karot.parcalar))];
  if (await karotAc(dosya, true)) {
    karot.kayitMesaji = "Sonraki fotoğrafta manevranın kalanını işaretleyin: başlangıç sıranın başı, bitiş manevranın sonu.";
    karotCizHepsi();
  }
}

async function karotSonrakiGorsel(dosya) {
  if (await kaydedilmemisVarMi()) return;
  if (await karotAc(dosya)) {
    karot.kayitMesaji = "Yeni görsel açıldı: noktaları koyup manevranın başlangıcını ve bitişini işaretleyin.";
    karotCizHepsi();
  }
}

async function karotTamamla() {
  if (await kaydedilmemisVarMi()) return;
  katmaniKapat("katman-karot");
  sekmeSec("tcr");
  tcrCiz();
}

function karotBagla() {
  const dosyaIle = (kimlik, is) => {
    $(kimlik).onchange = (olay) => { const dosya = olay.target.files[0]; olay.target.value = ""; if (dosya) is(dosya); };
  };
  dosyaIle("karot-foto-sec", (dosya) => karotAc(dosya));
  dosyaIle("karot-sonraki", karotSonrakiGorsel);
  $("karot-devam").onclick = () => {
    if (!karotIsaretGecerli(karot.baslangic)) {
      sor("Karot Ölçümü", "Önce bu fotoğrafta manevranın başladığı yeri işaretleyin.", [["Tamam", true, true]]);
      return;
    }
    $("karot-devam-dosya").click();
  };
  dosyaIle("karot-devam-dosya", karotDevam);
  for (const dugme of document.querySelectorAll("#karot-modlar button")) dugme.onclick = () => karotModSec(dugme.dataset.mod);
  $("karot-sola").onclick = () => karotCevir(false);
  $("karot-saga").onclick = () => karotCevir(true);
  $("karot-kirp").onclick = karotKirpmaDegistir;
  $("karot-tum").onclick = karotTumu;
  $("karot-yeni-sira").onclick = () => { karot.aktif = null; karotModSec("nokta"); };
  $("karot-son-nokta").onclick = () => {
    const s = karot.aktif ?? karot.diziler.length - 1;
    if (s < 0 || !karot.diziler[s]) return;
    karotGecmiseEkle();
    karotNoktaSil(s, karot.diziler[s].length - 1);
    karotSeritleriGuncelle();
  };
  $("karot-geri").onclick = karotGeriAl;
  $("karot-manevra").onchange = () => karotCizHepsi();
  $("karot-kaydet").onclick = karotKaydet;
  $("karot-kaydet-alt").onclick = karotKaydet;
  $("karot-tamamla").onclick = karotTamamla;
  $("karot-tamamla-alt").onclick = karotTamamla;
  karotDokunmalariniBagla();
  karotSeritBagla();
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
  $("dugme-birim-ekle").onclick = birimEkle;
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
  karotBagla();
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
