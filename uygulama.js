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
const KUYU_ALANLARI = ["proje", "kuyu", "baslama_tarihi", "bitis_tarihi"];

// eski kayıtlardaki tek "tarih" alanı başlama tarihine taşınır
function kuyuBilgileriniDuzenle(bilgiler) {
  const sonuc = Object.assign({ proje: "", kuyu: "", baslama_tarihi: "", bitis_tarihi: "" }, bilgiler || {});
  if (sonuc.tarih && !sonuc.baslama_tarihi) sonuc.baslama_tarihi = sonuc.tarih;
  delete sonuc.tarih;
  return sonuc;
}

// yazılan rakamlar gg/aa/yyyy biçimine çevrilir; eğik çizgiler kendiliğinden eklenir
function tarihiBicimle(yazi) {
  const rakamlar = yazi.replace(/\D/g, "").slice(0, 8);
  return [rakamlar.slice(0, 2), rakamlar.slice(2, 4), rakamlar.slice(4)].filter(Boolean).join("/");
}

function bosVeri() {
  return { kuyu_bilgileri: { proje: "", kuyu: "", baslama_tarihi: "", bitis_tarihi: "" }, manevralar: [], tcr_sonuclari: [], spt_degerleri: {}, spt_araliklari: {}, birimler: [], ud_listesi: [], numune_listesi: { yass: "", karotlar: [] } };
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
  // disaAktarim: Kaydet düğmesiyle OneDrive'a en son gönderildiği an; değişiklik ondan sonraysa düğmede nokta çıkar
  kuyular[aktifKimlik] = { ...kuyular[aktifKimlik], veri, guncelleme: Date.now() };
  depoYaz(DEPO_KUYULAR, kuyular);
  depoYaz(DEPO_AKTIF, aktifKimlik);
  kaydetIsaretiniCiz();
}

function kaydetIsaretiniCiz() {
  const kayit = kuyular[aktifKimlik];
  const bekleyen = !!kayit && ((kayit.veri.manevralar || []).length + (kayit.veri.birimler || []).length + (kayit.veri.numune_listesi?.karotlar || []).length + (kayit.veri.ud_listesi || []).length > 0 && !(kayit.disaAktarim >= kayit.guncelleme)
    || aktarilmamisFoto > 0 || makineBekliyor());  // bilgisayara gitmemiş fotoğraf / makine metrajı da bekleyen sayılır
  $("kaydet-isareti").hidden = !bekleyen;
}

function kuyuAc(kimlik) {
  aktifKimlik = kimlik;
  veri = JSON.parse(JSON.stringify(kuyular[kimlik].veri));
  veri.kuyu_bilgileri = kuyuBilgileriniDuzenle(veri.kuyu_bilgileri);
  veri.spt_degerleri = veri.spt_degerleri || {};
  veri.spt_araliklari = veri.spt_araliklari || {};
  veri.tcr_sonuclari = veri.tcr_sonuclari || [];
  veri.birimler = veri.birimler || [];
  veri.numune_listesi = numuneListesiniDuzenle(veri.numune_listesi);
  veri.ud_listesi = udListesiniDuzenle(veri.ud_listesi);
  oneriyiHesapla();
  depoYaz(DEPO_AKTIF, aktifKimlik);
  hepsiniCiz();
  kaydetIsaretiniCiz();
  aktarilmamislariSay();
}

function yeniKuyu() {
  aktifKimlik = yeniKimlik();
  veri = bosVeri();
  oneri = { baslangic: "0,00", bitis: "1,50" };
  kaydet();
  hepsiniCiz();
  aktarilmamislariSay();
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

// ---------- Manevra aralığını sonradan düzenleme ----------
// Masaüstündeki gibi: numune tipi ve adı (SPT-7 vb.) korunur; istenirse bitişik manevraların ucu da kayar. SPT listesi,
// Kaya Özellikleri ve numune listesi yeni aralığı takip eder: aralığı değişen K'nin TCR sonucu yeni aralığa taşınır ve
// yeni boya göre yeniden hesaplanır (eski % x eski boy / yeni boy; karot sığmazsa silinir), elle girilmiş UD kaydı
// taşınır. SPT sekmesinde elle düzeltilmiş SPT aralıkları (spt_araliklari) değişmez.
function aralikDegisikligi(manevralar, sira, yeniBas, yeniBit, bitisikler) {
  if (yeniBas < 0) return { hata: "Başlangıç negatif olamaz." };
  if (r2(yeniBit - yeniBas) <= 0) return { hata: "Bitiş, başlangıçtan büyük olmalı." };
  const yeni = manevralar.map((m) => [...m]);
  const eskiBas = yeni[sira][0], eskiBit = yeni[sira][1];
  yeni[sira][0] = yaziya(yeniBas);
  yeni[sira][1] = yaziya(yeniBit);
  if (bitisikler) {
    if (sira > 0 && yeni[sira - 1][1] === eskiBas) yeni[sira - 1][1] = yeni[sira][0];
    if (sira + 1 < yeni.length && yeni[sira + 1][0] === eskiBit) yeni[sira + 1][0] = yeni[sira][1];
  }
  for (let i = 0; i < yeni.length; i++) {
    const [bas, bit, tip] = yeni[i];
    if (r2(sayiya(bit) - sayiya(bas)) <= 0) return { hata: `${bas}-${bit} (${tip}) manevrasının uzunluğu sıfır ya da eksi olur.` };
    if (i > 0 && r2(sayiya(bas) - sayiya(yeni[i - 1][1])) < 0) {
      return { hata: `${yeni[i - 1][0]}-${yeni[i - 1][1]} (${yeni[i - 1][2]}) ile ${bas}-${bit} (${tip}) üst üste biniyor. Bitişik manevraları da kaydırmayı deneyin.` };
    }
  }
  return { yeni };
}

function aralikUzunlugu(aralik) {
  const [bas, bit] = aralik.split("-");
  return r2(sayiya(bit) - sayiya(bas));
}

function tcrSonuclariniTasi(sonuclar, aralikTasima) {
  const yeniSonuclar = [], notlar = [];
  let silinen = false;
  for (const sonuc of sonuclar) {
    const yeniAralik = aralikTasima[sonuc[0]];
    if (!yeniAralik) { yeniSonuclar.push(sonuc); continue; }
    const oran = aralikUzunlugu(sonuc[0]) / aralikUzunlugu(yeniAralik);
    const yuzdeler = sonuc.slice(1, 4).map((d) => pyRound(Number(d) * oran));
    if (Math.max(...yuzdeler) > 100) {
      notlar.push(`${yeniAralik} TCR sonucu silindi (yeniden ölçün)`);
      silinen = true;
      continue;
    }
    yeniSonuclar.push([yeniAralik, ...yuzdeler]);
    if (yuzdeler.some((y, i) => y !== pyRound(Number(sonuc[i + 1])))) {
      notlar.push(`${yeniAralik} TCR/SCR/RQD: ${yuzdeler.map((y) => "%" + y).join(" / ")}`);
    }
  }
  return { yeniSonuclar, notlar, silinen };
}

let duzenlenenSira = -1;

function manevraDuzenleAc(sira) {
  const [bas, bit, tip] = veri.manevralar[sira];
  duzenlenenSira = sira;
  $("aralik-baslik").textContent = `Aralığı Düzenle — ${tip}`;
  $("aralik-bilgi").textContent = `Şimdiki aralık ${bas}-${bit} m. Numune tipi ve adı değişmez; SPT değerleri bu numuneye bağlı kalır.`;
  $("aralik-bas").value = bas;
  $("aralik-bit").value = bit;
  const onceki = veri.manevralar[sira - 1], sonraki = veri.manevralar[sira + 1];
  const komsular = [];
  if (onceki && onceki[1] === bas) komsular.push(`önceki ${onceki[2]} manevrasının bitişi`);
  if (sonraki && sonraki[0] === bit) komsular.push(`sonraki ${sonraki[2]} manevrasının başlangıcı`);
  $("aralik-bitisik-satir").hidden = !komsular.length;
  $("aralik-bitisik").checked = komsular.length > 0;
  $("aralik-bitisik-metin").textContent = `Bitişik manevraları da kaydır (${komsular.join(" ve ")})`;
  $("aralik-hata").hidden = true;
  ["aralik-bas", "aralik-bit"].forEach((k) => $(k).classList.remove("hatali"));
  $("aralik-duzen").hidden = false;
}

function manevraDuzenleKapat() {
  $("aralik-duzen").hidden = true;
  duzenlenenSira = -1;
}

function manevraAraliginiKaydet() {
  const sira = duzenlenenSira;
  if (sira < 0 || !veri.manevralar[sira]) return manevraDuzenleKapat();
  const hataYaz = (metin, kimlik) => {
    $("aralik-hata").textContent = metin;
    $("aralik-hata").hidden = false;
    if (kimlik) $(kimlik).classList.add("hatali");
  };
  ["aralik-bas", "aralik-bit"].forEach((k) => $(k).classList.remove("hatali"));
  const yeniBas = sayiya($("aralik-bas").value), yeniBit = sayiya($("aralik-bit").value);
  if (yeniBas === null) return hataYaz("Başlangıcı sayı olarak yazın (ör. 21,00).", "aralik-bas");
  if (yeniBit === null) return hataYaz("Bitişi sayı olarak yazın (ör. 21,45).", "aralik-bit");
  const [eskiBas, eskiBit] = veri.manevralar[sira];
  if (yaziya(r2(yeniBas)) === eskiBas && yaziya(r2(yeniBit)) === eskiBit) return manevraDuzenleKapat();
  const sonuc = aralikDegisikligi(veri.manevralar, sira, r2(yeniBas), r2(yeniBit), $("aralik-bitisik").checked);
  if (sonuc.hata) return hataYaz(sonuc.hata);
  // eski aralık -> yeni aralık (değişen her manevra için)
  const tasima = {}, aralikTasima = {};
  veri.manevralar.forEach((eski, i) => {
    const yeni = sonuc.yeni[i];
    if (eski[0] !== yeni[0] || eski[1] !== yeni[1]) {
      tasima[`${eski[0]}|${eski[1]}`] = [yeni[0], yeni[1]];
      aralikTasima[`${eski[0]}-${eski[1]}`] = `${yeni[0]}-${yeni[1]}`;
    }
  });
  const tcr = tcrSonuclariniTasi(veri.tcr_sonuclari, aralikTasima);
  veri.manevralar = sonuc.yeni;
  veri.tcr_sonuclari = tcr.yeniSonuclar;
  veri.ud_listesi = veri.ud_listesi.map(([bas, bit, ad]) => [...(tasima[`${bas}|${bit}`] || [bas, bit]), ad]);
  oneriyiHesapla();
  kaydet();
  manevraDuzenleKapat();
  hepsiniCiz();
  const [bas, bit, tip] = veri.manevralar[sira];
  const ek = Object.keys(tasima).length > 1 ? ` (+${Object.keys(tasima).length - 1} bitişik)` : "";
  durumYaz(`Aralık güncellendi: ${tip} → ${bas}-${bit} m${ek}${tcr.notlar.map((n) => " · " + n).join("")}`);
  if (tcr.silinen) {
    sor("TCR / SCR / RQD", "Aralığı değişen bir karot manevrasının ölçülen karotu yeni boyundan uzun kalıyor; bu yüzden sonucu silindi. Kaya Özellikleri sekmesinden yeniden girin.\n\n"
      + tcr.notlar.join("\n"), [["Tamam", true, true]]);
  }
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
  if (numuneTipi.startsWith("SPT")) delete veri.spt_araliklari[numuneTipi];
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

// SPT'ler, aralığı düzeltilmişse (veri.spt_araliklari; ör. refü 21,00-21,03) gerçek aralığıyla. Manevra değişmez.
function sptListesi() {
  return veri.manevralar.filter((m) => m[2].startsWith("SPT")).map(([bas, bit, tip]) => {
    const aralik = veri.spt_araliklari[tip];
    return aralik ? [aralik[0], aralik[1], tip] : [bas, bit, tip];
  });
}

// Numune Derinliği (LogPlot Depth / Text): manevra sınırları ve karşılarına yazılacak gerçek derinlik.
// Aralığı düzeltilmiş SPT'de manevra ucunun karşısına SPT'nin gerçek ucu gelir (24,45 -> 24,14).
function numuneDerinligiSatirlari() {
  const karsilik = {};
  for (const [bas, bit, tip] of veri.manevralar) {
    const aralik = veri.spt_araliklari[tip];
    if (aralik) { karsilik[bas] = aralik[0]; karsilik[bit] = aralik[1]; }
  }
  const sinirlar = [];
  for (const [bas, bit] of veri.manevralar) {
    for (const derinlik of [bas, bit]) if (sinirlar[sinirlar.length - 1] !== derinlik) sinirlar.push(derinlik);
  }
  return sinirlar.map((derinlik) => [derinlik, karsilik[derinlik] ?? derinlik]);
}

function derinlikCiz() {
  satirlariCiz($("tablo-derinlik"), ["Derinlik", "Metin"],
    numuneDerinligiSatirlari().map(([d, m]) => ({ hucreler: [d, m], sinif: d !== m ? "spt duzeltilmis" : "" })),
    "Henüz manevra yok");
}

function sptAraliginiKaydet(sifirla = false) {
  const secilen = $("spt-secim").value;
  const manevra = veri.manevralar.find((m) => m[2] === secilen);
  if (!manevra) return hataGoster("Önce bir SPT seçin.", "spt-secim");
  if (sifirla) {
    delete veri.spt_araliklari[secilen];
  } else {
    const bas = sayiya($("spt-aralik-bas").value), bit = sayiya($("spt-aralik-bit").value);
    if (bas === null || bas < 0) return hataGoster("Başlangıcı sayı olarak yazın (ör. 21,00).", "spt-aralik-bas");
    if (bit === null || r2(bit - bas) <= 0) return hataGoster("Bitiş, başlangıçtan büyük olmalı (ör. 21,03).", "spt-aralik-bit");
    const yeni = [yaziya(r2(bas)), yaziya(r2(bit))];
    if (yeni[0] === manevra[0] && yeni[1] === manevra[1]) delete veri.spt_araliklari[secilen];
    else veri.spt_araliklari[secilen] = yeni;
  }
  kaydet();
  const [bas, bit] = veri.spt_araliklari[secilen] || manevra;
  durumYaz(`${secilen} aralığı: ${bas}-${bit} m (manevra ${manevra[0]}-${manevra[1]} m kalır)`);
  sptCiz(secilen);
  numuneCiz(false);
  derinlikCiz();
}

// LogPlot SPT-N grafiği: her SPT, başlangıç derinliğinin 0,25 m altına N değeriyle yazılır (1,50-1,95 -> 1,75)
// refü olan SPT'lerde (N = R) grafiğe 100 yazılır; SPT listesindeki N yine R kalır
function sptGrafikSatirlari() {
  return sptListesi().map(([bas, , tip]) => {
    const n = (veri.spt_degerleri[tip] || [])[3] ?? "";
    return [yaziya(r2(sayiya(bas) + 0.25)), n === "R" ? "100" : n];
  });
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
  numuneCiz(false);
  if (sonraki) $("darbe-1").focus();
}

function sptSil() {
  const secilen = $("spt-secim").value;
  if (!veri.spt_degerleri[secilen]) return;
  delete veri.spt_degerleri[secilen];
  kaydet();
  durumYaz(`${secilen} değerleri silindi`);
  sptCiz(secilen);
  numuneCiz(false);
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
    "Henüz manevra yok").forEach((satir, i) => satir.addEventListener("click", () => manevraDuzenleAc(i)));
  const tablo = $("tablo-manevra");
  tablo.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  derinlikCiz();
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
      return { hucreler: [`${bas}-${bit}`, tip, ...(d || ["", "", "", ""])], sinif: (d ? "" : "bos") + (veri.spt_araliklari[tip] ? " duzeltilmis" : "") };
    }), "Henüz SPT yok");
  satirlar.forEach((satir, i) => satir.addEventListener("click", () => {
    $("spt-secim").value = numaralar[i];
    sptKutulariniDoldur();
    $("darbe-1").focus();
  }));
  satirlariCiz($("tablo-spt-grafik"), ["Derinlik", "SPT-N"],
    sptGrafikSatirlari().map(([derinlik, n]) => ({ hucreler: [derinlik, n], sinif: n === "" ? "bos" : "" })), "Henüz SPT yok");
}

function sptKutulariniDoldur() {
  const degerler = veri.spt_degerleri[$("spt-secim").value] || ["", "", ""];
  ["darbe-1", "darbe-2", "darbe-3"].forEach((k, i) => { $(k).value = degerler[i]; $(k).classList.remove("hatali"); });
  const secilen = $("spt-secim").value;
  const manevra = veri.manevralar.find((m) => m[2] === secilen);
  const aralik = (manevra && veri.spt_araliklari[secilen]) || manevra || ["", ""];
  $("spt-aralik-bas").value = aralik[0];
  $("spt-aralik-bit").value = aralik[1];
  ["spt-aralik-bas", "spt-aralik-bit"].forEach((k) => $(k).classList.remove("hatali"));
  $("spt-aralik-ipucu").textContent = manevra
    ? `${secilen} manevrası ${manevra[0]}-${manevra[1]} m (değişmez). SPT 45 cm ilerlemediyse gerçek aralığı yazın.`
    : "SPT 45 cm ilerlemediyse (ör. refü) gerçek aralığı yazın; manevra değişmez.";
  $("dugme-spt-aralik-sifirla").disabled = !(manevra && veri.spt_araliklari[secilen]);
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
  for (const anahtar of KUYU_ALANLARI) $("kuyu-" + anahtar).value = veri.kuyu_bilgileri[anahtar] || "";
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
  udCiz();
  numuneCiz();
  birimleriCiz();
  ozetiCiz();
}

// ---------- UD numuneleri (elle) ----------
// Manevralardaki UD'ler (0,50 m) kendiliğinden gelir. Bunlara ek UD'ler elle girilir; elle girilen bir UD manevradaki
// bir UD ile aynı aralıktaysa onun yerine geçer (böylece adı da değiştirilebilir). Kayıt: ud_listesi [[bas, bit, ad]].
let udSecili = null; // { bas, bit, indeks } indeks: ud_listesi sırası, manevradan gelen için -1

const derinlikSirasi = (a, b) => sayiya(a[0]) - sayiya(b[0]) || sayiya(a[1]) - sayiya(b[1]);

function udListesiniDuzenle(liste) {
  return (Array.isArray(liste) ? liste : []).filter((u) => Array.isArray(u) && u.length >= 3).map((u) => [0, 1, 2].map((i) => String(u[i])));
}

function manevraUdleri() {
  const elle = new Set(veri.ud_listesi.map(([bas, bit]) => bas + "|" + bit));
  return veri.manevralar.filter((m) => m[2].startsWith("UD") && !elle.has(m[0] + "|" + m[1]));
}

// derinliğe göre sıralı [başlangıç, bitiş, ad, ud_listesi sırası (manevradan gelen için -1)]
function udSatirlari() {
  return [...manevraUdleri().map(([bas, bit, ad]) => [bas, bit, ad, -1]), ...veri.ud_listesi.map(([bas, bit, ad], i) => [bas, bit, ad, i])]
    .sort(derinlikSirasi);
}

function udOnerilenAd() {
  const numaralar = [...veri.manevralar.map((m) => m[2]), ...veri.ud_listesi.map((u) => u[2])]
    .map((ad) => /^UD-(\d+)$/.exec(ad)).filter(Boolean).map((e) => Number(e[1]));
  return "UD-" + (Math.max(0, ...numaralar) + 1);
}

function udCiz() {
  const satirlar = udSatirlari();
  if (udSecili && !satirlar.some(([bas, bit, , i]) => bas === udSecili.bas && bit === udSecili.bit && i === udSecili.indeks)) udSecili = null;
  const elemanlar = satirlariCiz($("tablo-ud"), ["Aralık", "Adı", "Kaynak"],
    satirlar.map(([bas, bit, ad, i]) => ({
      hucreler: [`${bas}-${bit}`, ad, i < 0 ? "manevra" : "elle"],
      sinif: (i < 0 ? "karot" : "ud") + (udSecili && udSecili.bas === bas && udSecili.bit === bit && udSecili.indeks === i ? " secili" : ""),
    })), "Henüz UD yok");
  elemanlar.forEach((eleman, k) => eleman.addEventListener("click", () => udSec(satirlar[k])));
  $("dugme-ud-duzenle").disabled = !udSecili;
  $("dugme-ud-sil").disabled = !udSecili || udSecili.indeks < 0;
  $("dugme-ud-ekle").classList.toggle("ana", !udSecili);
  $("dugme-ud-duzenle").classList.toggle("ana", !!udSecili);
  $("ud-ad").placeholder = udOnerilenAd();
}

function udSec([bas, bit, ad, indeks]) {
  if (udSecili && udSecili.bas === bas && udSecili.bit === bit && udSecili.indeks === indeks) return udKutulariniTemizle();
  udSecili = { bas, bit, indeks };
  $("ud-baslangic").value = bas;
  $("ud-bitis").value = bit;
  $("ud-ad").value = ad;
  udCiz();
  $("ud-baslangic").scrollIntoView?.({ block: "center", behavior: "smooth" });
}

function udKutulariniTemizle() {
  udSecili = null;
  for (const k of ["ud-baslangic", "ud-bitis", "ud-ad"]) $(k).value = "";
  udCiz();
}

function udKutulariniOku(haric = -1) {
  const bas = alanOku("ud-baslangic", "UD başlangıcı");
  if (bas === null) return null;
  const bit = alanOku("ud-bitis", "UD bitişi");
  if (bit === null) return null;
  if (bas < 0) return hataGoster("UD başlangıcı negatif olamaz.", "ud-baslangic"), null;
  if (r2(bit - bas) <= 0) return hataGoster("UD bitişi, başlangıcından büyük olmalıdır.", "ud-bitis"), null;
  const yeni = [yaziya(bas), yaziya(bit), $("ud-ad").value.trim() || udOnerilenAd()];
  if (veri.ud_listesi.some((u, i) => i !== haric && u[0] === yeni[0] && u[1] === yeni[1])) {
    return hataGoster(`${yeni[0]}-${yeni[1]} aralığında elle girilmiş bir UD zaten var. Onu seçip düzenleyin.`, "ud-baslangic"), null;
  }
  return yeni;
}

function udDegisti(mesaj) {
  kaydet();
  udKutulariniTemizle();
  numuneCiz(false);
  durumYaz(mesaj);
}

function udEkle() {
  const yeni = udKutulariniOku();
  if (!yeni) return;
  veri.ud_listesi.push(yeni);
  udDegisti(`UD eklendi: ${yeni[0]}-${yeni[1]} m → ${yeni[2]}`);
}

function udDuzenle() {
  if (!udSecili) return;
  const yeni = udKutulariniOku(udSecili.indeks);
  if (!yeni) return;
  // manevradan gelen UD: aynı aralıkta elle girilen kayıt onun yerine geçer
  if (udSecili.indeks < 0) veri.ud_listesi.push(yeni);
  else veri.ud_listesi[udSecili.indeks] = yeni;
  udDegisti(`UD düzenlendi: ${yeni[0]}-${yeni[1]} m → ${yeni[2]}`);
}

async function udSil() {
  if (!udSecili || udSecili.indeks < 0) return;
  const [bas, bit, ad] = veri.ud_listesi[udSecili.indeks];
  const cevap = await sor("UD'yi sil", `${bas}-${bit} m → ${ad} silinsin mi?`, [["Sil", true, true], ["Vazgeç", false]]);
  if (!cevap) return;
  veri.ud_listesi.splice(udSecili.indeks, 1);
  udDegisti(`UD silindi: ${bas}-${bit} m → ${ad}`);
}

// ---------- Numune listesi ----------
// SPT ve UD'ler manevra listesinden gelir; karot numuneleri (K) elle girilir. Biçim:
// "SK-1 NUMUNE LİSTESİ", boş satır, "27.08.2026    YASS: Rastlanmadı", boş satır, "4,50-4,95 - SPT-3"...
function numuneListesiniDuzenle(liste) {
  const sonuc = { yass: "", karotlar: [], ...(liste || {}) };
  sonuc.yass = String(sonuc.yass || "");
  sonuc.karotlar = (Array.isArray(sonuc.karotlar) ? sonuc.karotlar : [])
    .filter((k) => Array.isArray(k) && k.length >= 2).map((k) => [String(k[0]), String(k[1])]);
  return sonuc;
}

// derinliğe göre sıralı [başlangıç, bitiş, ad, karot sırası (karot değilse -1), kaynak]
function numuneSatirlari() {
  const satirlar = [
    // SPT-N'si R (refü) olan SPT'ler numune listesine girmez
    ...sptListesi().filter((m) => (veri.spt_degerleri[m[2]] || [])[3] !== "R").map(([bas, bit, tip]) => [bas, bit, tip, -1, "manevralardan"]),
    ...manevraUdleri().map(([bas, bit, ad]) => [bas, bit, ad, -1, "manevralardan"]),
    ...veri.ud_listesi.map(([bas, bit, ad]) => [bas, bit, ad, -1, "elle (UD)"]),
  ];
  veri.numune_listesi.karotlar.forEach(([bas, bit], i) => satirlar.push([bas, bit, "K", i, "elle"]));
  return satirlar.sort(derinlikSirasi);
}

function numuneBasligi() {
  const kuyu = (veri.kuyu_bilgileri.kuyu || "").trim().toLocaleUpperCase("tr-TR");
  return (kuyu ? kuyu + " " : "") + "NUMUNE LİSTESİ";
}

function numuneTarihSatiri() {
  // bitiş tarihi (yoksa başlama tarihi), noktalı: 27.08.2026
  const bilgi = veri.kuyu_bilgileri;
  const tarih = (bilgi.bitis_tarihi || bilgi.baslama_tarihi || "").trim().replace(/\//g, ".");
  return [tarih, "YASS: " + veri.numune_listesi.yass.trim()].filter(Boolean).join("    ").trim();
}

function numuneListesiMetni() {
  return [numuneBasligi(), "", numuneTarihSatiri(), "", ...numuneSatirlari().map(([bas, bit, ad]) => `${bas}-${bit} - ${ad}`)].join("\n");
}

function numuneCiz(alanlariDa = true) {
  if (alanlariDa) $("numune-yass").value = veri.numune_listesi.yass;
  const kap = $("numune-onizleme");
  kap.textContent = "";
  const yeni = (sinif, metin) => kap.appendChild(Object.assign(document.createElement("div"), { className: sinif, textContent: metin }));
  yeni("numune-baslik", numuneBasligi());
  yeni("numune-tarih", numuneTarihSatiri());
  const satirlar = numuneSatirlari();
  if (!satirlar.length) yeni("bos-liste", "Henüz numune yok");
  for (const [bas, bit, ad, karot, kaynak] of satirlar) {
    const satir = yeni("numune-satir", "");
    satir.appendChild(Object.assign(document.createElement("span"), { textContent: `${bas}-${bit} - ${ad}` }));
    if (karot < 0) {
      satir.appendChild(Object.assign(document.createElement("span"), { className: "numune-kaynak", textContent: kaynak }));
      continue;
    }
    const sil = Object.assign(document.createElement("button"), { className: "numune-sil", textContent: "×" });
    sil.setAttribute("aria-label", `${bas}-${bit} karot numunesini sil`);
    sil.onclick = () => numuneKarotSil(karot);
    satir.appendChild(sil);
  }
}

function numuneKarotEkle() {
  const bas = alanOku("numune-baslangic", "Karot numunesi başlangıcı");
  if (bas === null) return;
  const bit = alanOku("numune-bitis", "Karot numunesi bitişi");
  if (bit === null) return;
  if (bas < 0) return hataGoster("Başlangıç negatif olamaz.", "numune-baslangic");
  if (r2(bit - bas) <= 0) return hataGoster("Bitiş, başlangıçtan büyük olmalıdır.", "numune-bitis");
  const yeni = [yaziya(bas), yaziya(bit)];
  if (veri.numune_listesi.karotlar.some((k) => k[0] === yeni[0] && k[1] === yeni[1])) {
    return hataGoster(`${yeni[0]}-${yeni[1]} karot numunesi zaten listede.`, "numune-baslangic");
  }
  veri.numune_listesi.karotlar.push(yeni);
  kaydet();
  numuneCiz(false);
  $("numune-baslangic").value = "";
  $("numune-bitis").value = "";
  $("numune-baslangic").focus();
  durumYaz(`Karot numunesi eklendi: ${yeni[0]}-${yeni[1]} m`);
}

async function numuneKarotSil(indeks) {
  const [bas, bit] = veri.numune_listesi.karotlar[indeks];
  const cevap = await sor("Karot numunesini sil", `${bas}-${bit} - K listeden silinsin mi?`, [["Sil", true, true], ["Vazgeç", false]]);
  if (!cevap) return;
  veri.numune_listesi.karotlar.splice(indeks, 1);
  kaydet();
  numuneCiz(false);
  durumYaz(`Silindi: ${bas}-${bit} - K`);
}

// Numune listesinin telefon ekran görüntüsü gibi siyah zeminli JPEG'i (masaüstündeki numune_gorseli ile aynı ölçüler)
function numuneGorseli() {
  const GENISLIK = 1290, KENAR = 85, YAZI = "-apple-system, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif";
  const tuval = document.createElement("canvas"), b = tuval.getContext("2d");
  const baslikTipi = `700 84px ${YAZI}`, yaziTipi = `400 50px ${YAZI}`;
  // başlık sözcük sözcük satırlara bölünür
  b.font = baslikTipi;
  const basliklar = [];
  let satir = "";
  for (const sozcuk of numuneBasligi().split(/\s+/).filter(Boolean)) {
    const aday = satir ? satir + " " + sozcuk : sozcuk;
    if (satir && b.measureText(aday).width > GENISLIK - 2 * KENAR) { basliklar.push(satir); satir = sozcuk; } else satir = aday;
  }
  basliklar.push(satir);
  const numuneler = numuneSatirlari().map(([bas, bit, ad]) => `${bas}-${bit} - ${ad}`);
  tuval.width = GENISLIK;
  tuval.height = 50 + 108 * basliklar.length + 92 + 60 + 95 + 78 * numuneler.length + 110;
  b.fillStyle = "#000";
  b.fillRect(0, 0, tuval.width, tuval.height);
  b.fillStyle = "#E8E8E8";
  b.textBaseline = "top";
  let y = 62;
  b.font = baslikTipi;
  for (const s of basliklar) { b.fillText(s, KENAR, y); y += 108; }
  y += 92;
  b.font = yaziTipi;
  b.fillText(numuneTarihSatiri(), KENAR, y);
  y += 60 + 95;
  for (const s of numuneler) { b.fillText(s, KENAR, y); y += 78; }
  return new Promise((tamam) => tuval.toBlob(tamam, "image/jpeg", 0.92));
}

async function numuneJpegIndir() {
  const kuyu = (veri.kuyu_bilgileri.kuyu || "").trim();
  const ad = ((kuyu ? kuyu + " " : "") + "Numune Listesi.jpg").replace(/[\\/:*?"<>|]/g, "_");
  const dosya = new File([await numuneGorseli()], ad, { type: "image/jpeg" });
  // iPhone'da paylaşım sayfası açılır: "Resmi Kaydet" ile Fotoğraflar'a, ya da WhatsApp vb.
  if (navigator.canShare && navigator.canShare({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya] });
      durumYaz("Numune listesi görseli hazır: " + ad);
    } catch (hata) {
      if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
    }
    return;
  }
  const baglanti = Object.assign(document.createElement("a"), { href: URL.createObjectURL(dosya), download: ad });
  baglanti.click();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 5000);
  durumYaz("İndirildi: " + ad);
}

async function numuneListesiniPaylas() {
  const metin = numuneListesiMetni();
  if (navigator.share) {
    try {
      await navigator.share({ text: metin });
    } catch (hata) {
      if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
    }
    return;
  }
  kopyala("numune");
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
    "derinlik": () => numuneDerinligiSatirlari().map((s) => s.join("\t")),
    "derinlik-d": () => numuneDerinligiSatirlari().map((s) => s[0]),
    "derinlik-m": () => numuneDerinligiSatirlari().map((s) => s[1]),
    "spt-aralik": () => sptler.map((m) => `${m[0]}\t${m[1]}`),
    "spt-darbe": () => sptler.map((m) => darbe(m[2]).join("\t")),
    "spt-n": () => sptler.map((m) => darbe(m[2])[3]),
    "spt-d1": () => sptler.map((m) => darbe(m[2])[0]),
    "spt-d2": () => sptler.map((m) => darbe(m[2])[1]),
    "spt-d3": () => sptler.map((m) => darbe(m[2])[2]),
    "spt-grafik": () => sptGrafikSatirlari().map(([derinlik, n]) => `${derinlik}\t${n}`),
    "tcr": () => veri.tcr_sonuclari.map((s) => String(s[1])),
    "scr": () => veri.tcr_sonuclari.map((s) => String(s[2])),
    "rqd": () => veri.tcr_sonuclari.map((s) => String(s[3])),
    // birimler log biçiminde, aralarında boş satır
    "birim": () => [veri.birimler.map(birimLogu).filter(Boolean).join("\n\n")],
    "numune": () => [numuneListesiMetni()],
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

// Kaydet: kuyu dosyası ve bilgisayara henüz gitmemiş kuyu fotoğrafları aynı paylaşımda (OneDrive › Logvera). Bilgisayarda
// "Telefonu İzle" ZIP'i görünce fotoğrafları kuyunun klasörüne ekler. ZIP adı her seferinde farklıdır, üzerine yazılmaz.
async function paylas() {
  const metin = JSON.stringify(veri, null, 2);
  const dosya = new File([metin], dosyaAdi(), { type: "application/json" });
  let dosyalar = [dosya], yeniFotolar = [];
  const kuyuAdi = fotoKuyuAdi();
  if (kuyuAdi) {
    try {
      const tumu = await kuyuFotograflari();
      yeniFotolar = tumu.filter((k) => !k.aktarildi);
      if (yeniFotolar.length) {
        durumYaz("Fotoğraflar hazırlanıyor…");
        const { zip } = await fotoZipiHazirla(kuyuAdi, tumu, yeniFotolar);
        dosyalar.push(new File([zip], `${kuyuAdi} Fotoğrafları ${dosyaZamani()}.zip`, { type: "application/zip" }));
      }
    } catch (hata) {
      yeniFotolar = [];
      durumYaz("Fotoğraflar eklenemedi: " + (hata?.message || hata));
    }
  }
  const makineGidecek = makineBekliyor();
  if (makineGidecek) dosyalar.push(await makineAktarimDosyasi());
  if (dosyalar.length > 1 && !(navigator.canShare && navigator.canShare({ files: dosyalar }))) {
    dosyalar = [dosya];  // birden çok dosya birlikte paylaşılamıyorsa yalnız kuyu dosyası
    yeniFotolar = [];
  }
  const makineGitti = dosyalar.some((d) => d.name.startsWith("Makine Metrajı "));
  if (navigator.canShare && navigator.canShare({ files: dosyalar })) {
    try {
      await navigator.share({ files: dosyalar, title: dosyaAdi() });
      disaAktarildi();
      if (yeniFotolar.length) await fotolariAktarildiYap(yeniFotolar);
      if (makineGitti) makineAktarildi();
      durumYaz("Kaydedildi: " + dosyaAdi() + (yeniFotolar.length ? ` + ${yeniFotolar.length} fotoğraf` : "") + (makineGitti ? " + makine metrajı" : ""));
    } catch (hata) {
      if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
    }
    return;
  }
  const baglanti = Object.assign(document.createElement("a"), { href: URL.createObjectURL(dosya), download: dosyaAdi() });
  baglanti.click();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 5000);
  disaAktarildi();
}

function disaAktarildi() {
  if (!kuyular[aktifKimlik]) return;
  kuyular[aktifKimlik].disaAktarim = Date.now();
  depoYaz(DEPO_KUYULAR, kuyular);
  kaydetIsaretiniCiz();
}

async function dosyadanAc(dosya) {
  try {
    const okunan = JSON.parse(await dosya.text());
    if (!Array.isArray(okunan.manevralar)) throw new Error("manevra listesi yok");
    const yeni = bosVeri();
    yeni.kuyu_bilgileri = kuyuBilgileriniDuzenle(okunan.kuyu_bilgileri);
    yeni.numune_listesi = numuneListesiniDuzenle(okunan.numune_listesi);
    yeni.ud_listesi = udListesiniDuzenle(okunan.ud_listesi);
    for (const m of okunan.manevralar) {
      const bas = sayiya(m[0]), bit = sayiya(m[1]);
      if (bas === null || bit === null) throw new Error("hatalı derinlik: " + m.join(" "));
    }
    veri = yeni;
    for (const m of okunan.manevralar) manevrayiIsle(sayiya(m[0]), sayiya(m[1]), m.length > 2 ? kayittakiTip(m[2]) : null);
    veri.tcr_sonuclari = (okunan.tcr_sonuclari || []).map((s) => [String(s[0]), Number(s[1]), Number(s[2]), Number(s[3])]);
    for (const [tip, d] of Object.entries(okunan.spt_degerleri || {})) veri.spt_degerleri[tip] = d.map(String);
    // masaüstünde düzeltilen SPT aralıkları (ör. refü 21,00-21,03); telefon henüz göstermiyor ama kaydederken korur
    for (const [tip, a] of Object.entries(okunan.spt_araliklari || {})) {
      if (Array.isArray(a) && a.length === 2) veri.spt_araliklari[tip] = a.map(String);
    }
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
      kuyununFotograflariniSil(kimlik).catch(() => {});
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
const SEKME_SIRASI = ["manevra", "derinlik", "spt", "tcr", "numune", "tanim", "foto"];
let aktifSekme = "manevra";
let sekmeGecisiniBitir = null;
const hareketAzaltilmis = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function sekmeSec(ad) {
  const onceki = aktifSekme, eski = $("sekme-" + onceki), yeni = $("sekme-" + ad);
  sekmeGecisiniBitir?.();
  aktifSekme = ad;
  for (const dugme of document.querySelectorAll(".sekmeler button")) dugme.classList.toggle("secili", dugme.dataset.sekme === ad);
  camiTasi();
  const gecis = onceki !== ad && !hareketAzaltilmis() && eski.animate;
  // eski sayfa kayarken yerinde dursun diye kaydırılmadan önceki konumu alınır
  const eskiUst = eski.offsetTop - window.scrollY, eskiSol = eski.offsetLeft, eskiGenislik = eski.offsetWidth;
  for (const bolum of document.querySelectorAll(".sekme")) bolum.hidden = bolum !== yeni && !(gecis && bolum === eski);
  window.scrollTo(0, 0);
  if (gecis) sekmeGecisi(eski, yeni, SEKME_SIRASI.indexOf(ad) > SEKME_SIRASI.indexOf(onceki) ? 1 : -1, eskiUst, eskiSol, eskiGenislik);
  if (ad === "foto") { motoruHazirla(); fotolariCiz(); }
  if (ad === "tanim") tanimBoylariniAyarla();
}

// yon 1: sağdaki sekmeye geçiliyor, yeni sayfa sağdan gelir, eski sola kayar
function sekmeGecisi(eski, yeni, yon, ust, sol, genislik) {
  eski.classList.add("sekme-cikan");
  Object.assign(eski.style, { top: `${ust}px`, left: `${sol}px`, width: `${genislik}px` });
  const ayar = { duration: 300, easing: "cubic-bezier(.25, .8, .25, 1)" };
  const cikis = eski.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${-yon * 35}%)`, opacity: 0 }], ayar);
  const giris = yeni.animate([{ transform: `translateX(${yon * 35}%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], ayar);
  const bitir = () => {
    if (sekmeGecisiniBitir !== bitir) return;
    sekmeGecisiniBitir = null;
    cikis.cancel();
    giris.cancel();
    eski.classList.remove("sekme-cikan");
    eski.style.top = eski.style.left = eski.style.width = "";
    if (eski !== $("sekme-" + aktifSekme)) eski.hidden = true;
  };
  sekmeGecisiniBitir = bitir;
  giris.finished.then(bitir, bitir);
}

// ---------- Alt menü çubuğu ----------
// Çubuk yüzen bir haptır; seçili sekmenin simgesi üstte yuvarlak balonda durur ve çubuğun üst kenarı
// balonun çevresinde yumuşakça kabarır. Biçim, hap ile balon halkasının "yumuşak birleşimi" olarak çizilir.
const CUBUK = { kenar: 12, ust: 28, alt: 84, balonY: 30, halka: 26, yumusaklik: 14, balonYaricapi: 21 };
const balonDurumu = { x: null, hedef: null, kare: null };

function sekmeCubuguYolu(genislik, bx) {
  const { kenar, ust, alt, balonY, halka, yumusaklik } = CUBUK;
  const x0 = kenar, x1 = genislik - kenar, r = (alt - ust) / 2;
  // hapın üst kenarı (uçlarda yarım daire)
  const hapUst = (x) => {
    const merkez = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
    const dx = x - merkez;
    return ust + r - Math.sqrt(Math.max(0, r * r - dx * dx));
  };
  // balon halkasının üstü; halkanın dışında çok aşağıda say
  const halkaUst = (x) => {
    const dx = x - bx;
    return Math.abs(dx) < halka ? balonY - Math.sqrt(halka * halka - dx * dx) : alt + 100;
  };
  const yumusakEnUst = (a, b) => {
    const h = Math.max(yumusaklik - Math.abs(a - b), 0) / yumusaklik;
    return Math.min(a, b) - h * h * yumusaklik * 0.25;
  };
  const noktalar = [];
  for (let x = x0; x <= x1; x += x < x0 + 6 || x > x1 - 6 ? 0.5 : 2) {
    noktalar.push([x, bx === null ? hapUst(x) : yumusakEnUst(hapUst(x), halkaUst(x))]);
  }
  noktalar.push([x1, hapUst(x1)]);
  for (let x = x1; x >= x0; x -= x < x0 + 6 || x > x1 - 6 ? 0.5 : 2) noktalar.push([x, ust + alt - hapUst(x)]);
  return "M" + noktalar.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
}

function sekmeCubugunuCiz(bx) {
  const zemin = $("sekme-zemin"), yol = sekmeCubuguYolu(zemin.clientWidth, bx);
  zemin.style.clipPath = `path("${yol}")`;
  zemin.style.webkitClipPath = `path("${yol}")`;
  $("sekme-kenar-yolu").setAttribute("d", yol);
  $("sekme-kenar-dis").setAttribute("d", yol);
  if (bx !== null) $("sekme-balon").style.transform = `translateX(${bx - CUBUK.balonYaricapi}px)`;
}

function camiTasi() {
  const balon = $("sekme-balon"), dugme = document.querySelector(`.sekmeler button[data-sekme="${aktifSekme}"]`);
  if (!balon || !dugme) return;
  const nav = balon.parentElement.getBoundingClientRect(), kutu = dugme.getBoundingClientRect();
  const hedef = kutu.left + kutu.width / 2 - nav.left;
  // balonda seçili sekmenin simgesi; değişince aşağıdan balonun içine doğru yükselir,
  // bırakılan sekmenin simgesi de yukarıdan çubuktaki yerine iner
  const simge = dugme.querySelector("svg");
  if (balon.dataset.sekme !== aktifSekme) {
    const onceki = balon.dataset.sekme && document.querySelector(`.sekmeler button[data-sekme="${balon.dataset.sekme}"] svg`);
    balon.innerHTML = simge.outerHTML;
    balon.dataset.sekme = aktifSekme;
    if (balonDurumu.x !== null && !hareketAzaltilmis()) {
      balon.firstElementChild.animate([
        { transform: "translateY(30px) scale(.7)", opacity: 0 },
        { transform: "translateY(-3px) scale(1.05)", opacity: 1, offset: 0.75 },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ], { duration: 420, delay: 90, easing: "cubic-bezier(.25, .8, .3, 1)", fill: "backwards" });
      onceki?.animate([{ transform: "translateY(-14px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 320, easing: "cubic-bezier(.25, .8, .3, 1)" });
    }
  }
  balon.style.opacity = "1";
  cancelAnimationFrame(balonDurumu.kare);
  const baslangic = balonDurumu.x;
  if (baslangic === null || hareketAzaltilmis() || Math.abs(baslangic - hedef) < 0.5) {
    balonDurumu.x = hedef;
    sekmeCubugunuCiz(hedef);
    return;
  }
  // hafif yaylanarak kayar (easeOutBack)
  const sure = 460, t0 = performance.now();
  const egri = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
  const adim = (simdi) => {
    const t = Math.min(1, (simdi - t0) / sure);
    balonDurumu.x = baslangic + (hedef - baslangic) * egri(t);
    sekmeCubugunuCiz(balonDurumu.x);
    if (t < 1) balonDurumu.kare = requestAnimationFrame(adim);
  };
  balonDurumu.kare = requestAnimationFrame(adim);
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

// ---------- Makine Metrajı ----------
// Masaüstündeki "Makine Metrajı" sayfasının telefondaki karşılığı: makinelerin aylık kuyu metrajları. Kayıtlar bu
// telefonda (localStorage) kuyu dosyalarından ayrı tutulur. Excel, masaüstündekiyle aynı düzende üretilir.
const DEPO_MAKINE = "sondajlog.makine";
const MAKINELER = ["HANJİN", "TSM-750"];
const USTALAR = ["ENGİN YAVUZ", "AYHAN ÖZBAY"];
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const VARSAYILAN_PROJE = "ANTALYA-ALANYA OTOYOL PROJESİ";
const DEVAM_EDIYOR = "DEVAM EDİYOR";
const EXCEL_EN_AZ_SATIR = 27;
const makineDurumu = { yil: new Date().getFullYear(), ay: new Date().getMonth() + 1, duzenlenen: null };

function makineVerisi() {
  const v = depoOku(DEPO_MAKINE, {});
  return {
    kayitlar: Array.isArray(v.kayitlar) ? v.kayitlar.filter((k) => k && k.kimlik) : [],
    makine: MAKINELER.includes(v.makine) ? v.makine : MAKINELER[0],
    usta: USTALAR.includes(v.usta) ? v.usta : USTALAR[0],
    proje: typeof v.proje === "string" && v.proje.trim() ? v.proje : VARSAYILAN_PROJE,
    silinenler: v.silinenler && typeof v.silinenler === "object" ? v.silinenler : {},  // {kimlik: silinme zamanı}
    sonDegisiklik: Number(v.sonDegisiklik) || 0,
    sonAktarim: Number(v.sonAktarim) || 0,
  };
}

// bilgisayara gitmemiş makine metrajı değişikliği var mı
function makineBekliyor() {
  const v = makineVerisi();
  return v.sonDegisiklik > v.sonAktarim && (v.kayitlar.length > 0 || Object.keys(v.silinenler).length > 0);
}

const dosyaZamani = () => {
  const z = new Date(), iki = (n) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${iki(z.getMonth() + 1)}-${iki(z.getDate())} ${iki(z.getHours())}${iki(z.getMinutes())}${iki(z.getSeconds())}`;
};

// Bilgisayardaki Logvera "Telefonu İzle" ile alır ve kendi listesiyle birleştirir (kimlik + güncelleme zamanı)
async function makineAktarimDosyasi() {
  const v = makineVerisi();
  const bilgi = new Blob([JSON.stringify({ kayitlar: v.kayitlar, silinenler: v.silinenler }, null, 2)], { type: "application/json" });
  const zip = await zipOlustur([{ ad: "logvera_makine.json", blob: bilgi }]);
  return new File([zip], `Makine Metrajı ${dosyaZamani()}.zip`, { type: "application/zip" });
}

function makineAktarildi() {
  makineYaz({ sonAktarim: Date.now() });
  kaydetIsaretiniCiz();
}

async function makineBilgisayaraGonder() {
  const v = makineVerisi();
  if (!v.kayitlar.length && !Object.keys(v.silinenler).length) return hataGoster("Gönderilecek makine metrajı kaydı yok.");
  const dosya = await makineAktarimDosyasi();
  if (!(navigator.canShare && navigator.canShare({ files: [dosya] }))) return hataGoster("Bu telefonda dosya paylaşılamıyor.");
  try {
    await navigator.share({ files: [dosya], title: dosya.name });
    makineAktarildi();
    durumYaz("Makine metrajı gönderildi (OneDrive › Logvera klasörüne kaydedin)");
  } catch (hata) {
    if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
  }
}

function makineYaz(degisiklik) {
  return depoYaz(DEPO_MAKINE, { ...makineVerisi(), ...degisiklik });
}

const makineAyAnahtari = () => `${makineDurumu.yil}-${String(makineDurumu.ay).padStart(2, "0")}`;
const makineAyYazisi = () => `${AY_ADLARI[makineDurumu.ay - 1]} ${makineDurumu.yil}`;

// "gg.aa.yyyy" -> [yıl, ay, gün]; geçersizse null
function makineTarihCoz(yazi) {
  const m = String(yazi || "").trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const [gun, ay, yil] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(yil, ay - 1, gun));
  return t.getUTCFullYear() === yil && t.getUTCMonth() === ay - 1 && t.getUTCDate() === gun && yil >= 1900 ? [yil, ay, gun] : null;
}

const makineTarihYazisi = (t) => (t ? `${t[2]}.${String(t[1]).padStart(2, "0")}.${t[0]}` : "");
const makineTarihSirasi = (t) => (t ? t[0] * 10000 + t[1] * 100 + t[2] : 99999999);

// Yazılırken gg.aa.yyyy'ye çevirir. Nokta yazılmadıysa rakamlar 2-2-4 bölünür (03112026 -> 03.11.2026); yazılan
// noktalara uyulur, böylece tek haneli gün/ay bozulmaz (3.12.2026 olduğu gibi kalır).
function noktaliTarihBicimle(kutu) {
  const deger = kutu.value, parcalar = deger.split(/[./,]/);
  let [gun, ay = "", yil = ""] = parcalar.map((p) => p.replace(/\D/g, ""));
  if (parcalar.length === 1 && gun.length > 2) { ay = gun.slice(2); gun = gun.slice(0, 2); }
  if (parcalar.length <= 2 && ay.length > 2) { yil = ay.slice(2); ay = ay.slice(0, 2); }
  gun = gun.slice(0, 2); ay = ay.slice(0, 2); yil = yil.slice(0, 4);
  let yeni = gun;
  if (ay || parcalar.length > 1) yeni += "." + ay;
  if (yil || parcalar.length > 2) yeni += "." + yil;
  if (yeni !== deger) kutu.value = yeni;
}

// düzenleme kutusuna iki haneli gün ve ayla yüklenir (3.11.2026 -> 03.11.2026)
function makineTarihKutuya(yazi) {
  const t = makineTarihCoz(yazi);
  return t ? `${String(t[2]).padStart(2, "0")}.${String(t[1]).padStart(2, "0")}.${t[0]}` : (yazi || "");
}

function makineMetrajOku(yazi) {
  if (!String(yazi).trim()) return { deger: null };
  const sayi = sayiya(yazi);
  return sayi === null || sayi < 0 ? { hata: true } : { deger: r2(sayi) };
}

function gosterilenMakineKayitlari() {
  const { kayitlar, makine } = makineVerisi();
  return kayitlar.filter((k) => k.ay === makineAyAnahtari() && k.makine === makine)
    .sort((a, b) => makineTarihSirasi(makineTarihCoz(a.baslama)) - makineTarihSirasi(makineTarihCoz(b.baslama)) || String(a.kuyu).localeCompare(String(b.kuyu), "tr"));
}

const makineMetrajYazisi = (sayi) => (sayi === null || sayi === undefined || sayi === "" ? "" : yaziya(Number(sayi)));

function makineCiz() {
  const v = makineVerisi();
  $("makine-secim").value = v.makine;
  $("usta-secim").value = v.usta;
  if (document.activeElement !== $("makine-proje")) $("makine-proje").value = v.proje;
  $("makine-ay-yazi").textContent = makineAyYazisi();
  $("makine-ay-girdi").value = makineAyAnahtari();
  const kayitlar = gosterilenMakineKayitlari();
  const toplam = r2(kayitlar.reduce((t, k) => t + (Number(k.yapilan) || 0), 0));
  const satirlar = satirlariCiz($("tablo-makine"), ["Kuyu", "Başlama", "Bitiş", "Öner.", "Yapılan"],
    kayitlar.map((k) => ({
      hucreler: [k.kuyu, k.baslama, k.bitis || "devam", makineMetrajYazisi(k.onerilen), makineMetrajYazisi(k.yapilan)],
      sinif: k.kimlik === makineDurumu.duzenlenen ? "secili" : "",
      not: k.usta ? `Usta: ${k.usta}` : "",
    })), "Bu ay için bu makinede kayıt yok");
  satirlar.forEach((satir, i) => satir.addEventListener("click", () => makineDuzenle(kayitlar[i].kimlik)));
  const toplamSatir = Object.assign(document.createElement("div"), { className: "satir makine-toplam" });
  ["TOPLAM METRAJ", "", yaziya(toplam)].forEach((h) => toplamSatir.appendChild(Object.assign(document.createElement("span"), { textContent: h })));
  $("tablo-makine").appendChild(toplamSatir);
  $("makine-bilgi").textContent = `${v.makine} · ${makineAyYazisi()} · ${kayitlar.length} kuyu`;
}

function makineFormuTemizle() {
  makineDurumu.duzenlenen = null;
  for (const k of ["baslama", "bitis", "kuyu", "onerilen", "yapilan"]) { $("makine-" + k).value = ""; $("makine-" + k).classList.remove("hatali"); }
  $("dugme-makine-ekle").textContent = "Ekle";
  $("dugme-makine-sil").hidden = true;
}

function makineDuzenle(kimlik) {
  const kayit = makineVerisi().kayitlar.find((k) => k.kimlik === kimlik);
  if (!kayit) return;
  makineDurumu.duzenlenen = kimlik;
  $("makine-baslama").value = makineTarihKutuya(kayit.baslama);
  $("makine-bitis").value = makineTarihKutuya(kayit.bitis);
  $("makine-kuyu").value = kayit.kuyu || "";
  $("makine-onerilen").value = makineMetrajYazisi(kayit.onerilen);
  $("makine-yapilan").value = makineMetrajYazisi(kayit.yapilan);
  if (USTALAR.includes(kayit.usta)) makineYaz({ usta: kayit.usta });
  $("dugme-makine-ekle").textContent = "Güncelle";
  $("dugme-makine-sil").hidden = false;
  makineCiz();
  $("makine-form").scrollIntoView({ behavior: "smooth", block: "start" });
  durumYaz(`${kayit.kuyu} düzenleniyor; değiştirip Güncelle'ye basın`);
}

function makineKaydet() {
  const baslama = makineTarihCoz($("makine-baslama").value);
  if (!baslama) return hataGoster("Başlama tarihini gg.aa.yyyy olarak yazın (ör. 03.11.2026).", "makine-baslama");
  const bitisYazi = $("makine-bitis").value.trim();
  const bitis = bitisYazi ? makineTarihCoz(bitisYazi) : null;
  if (bitisYazi && !bitis) return hataGoster("Bitiş tarihi geçersiz. Kuyu sürüyorsa boş bırakın (DEVAM EDİYOR).", "makine-bitis");
  if (bitis && makineTarihSirasi(bitis) < makineTarihSirasi(baslama)) return hataGoster("Bitiş tarihi başlama tarihinden önce olamaz.", "makine-bitis");
  const kuyu = $("makine-kuyu").value.trim().toLocaleUpperCase("tr-TR");
  if (!kuyu) return hataGoster("Kuyu adını yazın.", "makine-kuyu");
  const onerilen = makineMetrajOku($("makine-onerilen").value), yapilan = makineMetrajOku($("makine-yapilan").value);
  if (onerilen.hata) return hataGoster("Önerilen metraj bir sayı olmalı (ör. 35,00).", "makine-onerilen");
  if (yapilan.hata) return hataGoster("Yapılan metraj bir sayı olmalı (ör. 35,00).", "makine-yapilan");
  const v = makineVerisi();
  const kayit = { ay: makineAyAnahtari(), makine: v.makine, usta: v.usta, baslama: makineTarihYazisi(baslama), bitis: makineTarihYazisi(bitis),
    kuyu, onerilen: onerilen.deger, yapilan: yapilan.deger, guncelleme: Date.now() };
  const eski = v.kayitlar.find((k) => k.kimlik === makineDurumu.duzenlenen);
  let kayitlar;
  if (eski) kayitlar = v.kayitlar.map((k) => (k === eski ? { ...eski, ...kayit, ay: eski.ay } : k));  // kendi ayında kalır
  else kayitlar = [...v.kayitlar, { ...kayit, kimlik: yeniKimlik() }];
  if (!makineYaz({ kayitlar, sonDegisiklik: Date.now() })) return hataGoster("Kayıt yazılamadı; telefonda yer kalmamış olabilir.");
  kaydetIsaretiniCiz();
  makineFormuTemizle();
  makineCiz();
  durumYaz(`${kuyu} ${eski ? "güncellendi" : "eklendi"}`);
}

async function makineSil() {
  const v = makineVerisi(), kayit = v.kayitlar.find((k) => k.kimlik === makineDurumu.duzenlenen);
  if (!kayit) return;
  const cevap = await sor("Satırı sil", `${kayit.kuyu} satırı silinsin mi?`, [["Sil", true, true], ["Vazgeç", false]]);
  if (!cevap) return;
  const silinenler = { ...v.silinenler, [kayit.kimlik]: Date.now() };  // bilgisayardan da silinsin
  if (!makineYaz({ kayitlar: v.kayitlar.filter((k) => k !== kayit), silinenler, sonDegisiklik: Date.now() })) return hataGoster("Kayıt yazılamadı.");
  kaydetIsaretiniCiz();
  makineFormuTemizle();
  makineCiz();
  durumYaz(`${kayit.kuyu} silindi`);
}

function makineAyKaydir(adim) {
  const toplam = makineDurumu.yil * 12 + makineDurumu.ay - 1 + adim;
  makineDurumu.yil = Math.floor(toplam / 12);
  makineDurumu.ay = (toplam % 12) + 1;
  makineFormuTemizle();
  makineCiz();
}

// --- Excel (.xlsx): sıkıştırmasız ZIP içinde birkaç XML dosyası ---
const xmlKacis = (yazi) => String(yazi).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function makineExcelXml(kayitlar, makine, proje) {
  const sutunlar = "ABCDEF";
  const satirlar = [];
  const hucre = (sutun, satir, stil, icerik = "") => `<c r="${sutun}${satir}" s="${stil}"${icerik}`;
  const yazi = (sutun, satir, stil, metin) => `${hucre(sutun, satir, stil, ' t="inlineStr"')}><is><t xml:space="preserve">${xmlKacis(metin)}</t></is></c>`;
  const sayi = (sutun, satir, stil, deger) => `${hucre(sutun, satir, stil)}><v>${deger}</v></c>`;
  const bos = (sutun, satir, stil) => `${hucre(sutun, satir, stil)}/>`;
  const tarihSeri = (t) => (Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(1899, 11, 30)) / 86400000;
  // 1-2: lacivert başlıklar (A:F birleşik), 3: sütun başlıkları
  for (const [no, metin] of [[1, proje], [2, `${makine} · ${makineAyYazisi().toLocaleUpperCase("tr-TR")}`]]) {
    satirlar.push(`<row r="${no}">${yazi("A", no, 1, metin)}${[..."BCDEF"].map((s) => bos(s, no, 1)).join("")}</row>`);
  }
  const basliklar = ["BAŞLAMA TARİHİ", "BİTİŞ TARİHİ", "KUYU ADI", "USTA", "ÖNERİLEN METRAJ", "YAPILAN METRAJ"];
  satirlar.push(`<row r="3">${basliklar.map((b, i) => yazi(sutunlar[i], 3, 2, b)).join("")}</row>`);
  const ilk = 4, adet = Math.max(kayitlar.length, EXCEL_EN_AZ_SATIR);
  for (let i = 0; i < adet; i++) {
    const no = ilk + i, k = kayitlar[i];
    if (!k) { satirlar.push(`<row r="${no}">${[...sutunlar].map((s) => bos(s, no, 3)).join("")}</row>`); continue; }
    const bas = makineTarihCoz(k.baslama), bit = makineTarihCoz(k.bitis);
    const metraj = (s, d) => (d === null || d === undefined || d === "" ? bos(s, no, 5) : sayi(s, no, 5, Number(d)));
    satirlar.push(`<row r="${no}">${bas ? sayi("A", no, 4, tarihSeri(bas)) : yazi("A", no, 3, k.baslama || "")}`
      + `${bit ? sayi("B", no, 4, tarihSeri(bit)) : yazi("B", no, 3, DEVAM_EDIYOR)}${yazi("C", no, 3, k.kuyu || "")}${yazi("D", no, 3, k.usta || "")}`
      + `${metraj("E", k.onerilen)}${metraj("F", k.yapilan)}</row>`);
  }
  const t = ilk + adet;
  satirlar.push(`<row r="${t}">${yazi("A", t, 6, "TOPLAM METRAJ")}${[..."BCDE"].map((s) => bos(s, t, 8)).join("")}`
    + `<c r="F${t}" s="7"><f>SUM(F${ilk}:F${t - 1})</f></c></row>`);
  const sayfa = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${[20, 20, 20, 18, 20, 20].map((g, i) => `<col min="${i + 1}" max="${i + 1}" width="${g}" customWidth="1"/>`).join("")}</cols>
<sheetData>${satirlar.join("")}</sheetData>
<mergeCells count="2"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/></mergeCells>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;
  const stiller = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="d.mm.yyyy"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="2" fontId="2" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const sayfaAdi = `${makine} ${AY_ADLARI[makineDurumu.ay - 1]}`.replace(/[\[\]:*?/\\]/g, "").slice(0, 31);
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlKacis(sayfaAdi)}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": stiller,
    "xl/worksheets/sheet1.xml": sayfa,
  };
}

async function makineExcelIndir() {
  const v = makineVerisi();
  const kayitlar = gosterilenMakineKayitlari();
  const proje = (v.proje || VARSAYILAN_PROJE).trim().toLocaleUpperCase("tr-TR");
  const parcalar = makineExcelXml(kayitlar, v.makine, proje);
  const xlsx = await zipOlustur(Object.entries(parcalar).map(([ad, metin]) => ({ ad, blob: new Blob([metin], { type: "application/xml" }) })));
  const ad = `Makine Metrajı - ${v.makine} - ${makineAyYazisi()}.xlsx`;
  const dosya = new File([xlsx], ad, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (navigator.canShare && navigator.canShare({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya], title: ad });
      durumYaz("Excel hazır: " + ad);
    } catch (hata) {
      if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
    }
    return;
  }
  const baglanti = Object.assign(document.createElement("a"), { href: URL.createObjectURL(dosya), download: ad });
  baglanti.click();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 10000);
  durumYaz("İndirildi: " + ad);
}

// --- Bilgisayardan Al: bilgisayarın OneDrive › Logvera'ya yazdığı "Makine Metrajı - Bilgisayar.zip" ---
// Bilgisayar ZIP'i sıkıştırmasız yazar; yalnız o biçim okunur. Birleştirme bilgisayardakiyle aynı kurallarla:
// kimliğe göre, daha yeni "guncelleme" kazanır; silinenler zamanıyla gelir; telefonda silinen geri gelmez.
function zipOku(tampon) {
  const v = new DataView(tampon), dosyalar = {};
  let son = -1;
  for (let i = tampon.byteLength - 22; i >= Math.max(0, tampon.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { son = i; break; }
  }
  if (son < 0) throw new Error("ZIP dosyası değil");
  let konum = v.getUint32(son + 16, true);
  const adet = v.getUint16(son + 10, true), cozucu = new TextDecoder();
  for (let n = 0; n < adet; n++) {
    if (v.getUint32(konum, true) !== 0x02014b50) throw new Error("ZIP dizini bozuk");
    const yontem = v.getUint16(konum + 10, true), boy = v.getUint32(konum + 20, true);
    const adBoy = v.getUint16(konum + 28, true), ekBoy = v.getUint16(konum + 30, true), notBoy = v.getUint16(konum + 32, true);
    const yerel = v.getUint32(konum + 42, true);
    const ad = cozucu.decode(new Uint8Array(tampon, konum + 46, adBoy));
    const veriBasi = yerel + 30 + v.getUint16(yerel + 26, true) + v.getUint16(yerel + 28, true);
    if (yontem === 0) dosyalar[ad] = new Uint8Array(tampon, veriBasi, boy);
    konum += 46 + adBoy + ekBoy + notBoy;
  }
  return dosyalar;
}

function gelenMakineKaydi(ham) {
  if (!ham || typeof ham !== "object" || !String(ham.kimlik || "").trim()) return null;
  const ay = String(ham.ay || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ay) || !MAKINELER.includes(ham.makine)) return null;
  const baslama = makineTarihCoz(ham.baslama), bitis = ham.bitis ? makineTarihCoz(ham.bitis) : null;
  const kuyu = String(ham.kuyu || "").trim().toLocaleUpperCase("tr-TR");
  if (!baslama || !kuyu || (ham.bitis && !bitis)) return null;
  const metraj = (d) => (d === null || d === undefined || d === "" ? null : Number.isFinite(Number(d)) && Number(d) >= 0 ? r2(Number(d)) : undefined);
  const onerilen = metraj(ham.onerilen), yapilan = metraj(ham.yapilan);
  if (onerilen === undefined || yapilan === undefined) return null;
  return { kimlik: String(ham.kimlik), ay, makine: ham.makine, usta: String(ham.usta || ""), baslama: makineTarihYazisi(baslama),
    bitis: makineTarihYazisi(bitis), kuyu, onerilen, yapilan, guncelleme: Number(ham.guncelleme) || 0 };
}

function makineBilgisayardanBirlestir(bilgi) {
  if (!bilgi || typeof bilgi !== "object" || !Array.isArray(bilgi.kayitlar || []) || typeof (bilgi.silinenler || {}) !== "object") {
    throw new Error("makine metrajı verisi beklenen biçimde değil");
  }
  const v = makineVerisi();
  const kayitlar = new Map(v.kayitlar.map((k) => [k.kimlik, k])), silinenler = { ...v.silinenler };
  let eklenen = 0, guncellenen = 0, silinen = 0;
  const ayni = (a, b) => ["ay", "makine", "usta", "baslama", "bitis", "kuyu", "onerilen", "yapilan"].every((x) => (a[x] ?? null) === (b[x] ?? null));
  for (const ham of bilgi.kayitlar || []) {
    const gelen = gelenMakineKaydi(ham);
    if (!gelen) continue;
    if ((silinenler[gelen.kimlik] ?? -1) >= gelen.guncelleme) continue;  // telefonda bundan sonra silinmiş
    const eski = kayitlar.get(gelen.kimlik);
    if (!eski) { kayitlar.set(gelen.kimlik, gelen); eklenen++; }
    else if ((Number(eski.guncelleme) || 0) < gelen.guncelleme && !ayni(eski, gelen)) { kayitlar.set(gelen.kimlik, { ...eski, ...gelen }); guncellenen++; }
  }
  for (const [kimlik, zamanHam] of Object.entries(bilgi.silinenler || {})) {
    const zaman = Number(zamanHam);
    if (!Number.isFinite(zaman)) continue;
    const eski = kayitlar.get(kimlik);
    if (eski && (Number(eski.guncelleme) || 0) <= zaman) { kayitlar.delete(kimlik); silinenler[kimlik] = zaman; silinen++; }
  }
  // gelenler bilgisayardan geldiği için geri gönderilmesi gerekmez: sonDegisiklik ilerletilmez
  if ((eklenen || guncellenen || silinen) && !makineYaz({ kayitlar: [...kayitlar.values()], silinenler })) throw new Error("telefonda yer kalmamış olabilir");
  return { eklenen, guncellenen, silinen };
}

async function makineBilgisayardanAl(dosya) {
  try {
    const parcalar = zipOku(await dosya.arrayBuffer());
    const icerik = parcalar["logvera_makine_bilgisayar.json"];
    if (!icerik) {
      return hataGoster("Bu dosya bilgisayarın makine metrajı değil. OneDrive › Logvera klasöründeki \"Makine Metrajı - Bilgisayar.zip\" dosyasını seçin.");
    }
    const { eklenen, guncellenen, silinen } = makineBilgisayardanBirlestir(JSON.parse(new TextDecoder().decode(icerik)));
    makineFormuTemizle();
    makineCiz();
    const ozet = [eklenen && `${eklenen} yeni`, guncellenen && `${guncellenen} güncellendi`, silinen && `${silinen} silindi`].filter(Boolean).join(", ") || "değişiklik yok";
    durumYaz("Bilgisayardan alındı: " + ozet);
    sor("Bilgisayardan Al", "Makine metrajı: " + ozet, [["Tamam", true, true]]);
  } catch (hata) {
    hataGoster("Dosya okunamadı: " + (hata?.message || hata));
  }
}

function makineAc() {
  katmaniKapat("katman-kuyular");
  katmaniAc("katman-makine");
  makineFormuTemizle();
  makineCiz();
}

function makineBagla() {
  for (const [secim, liste] of [["makine-secim", MAKINELER], ["usta-secim", USTALAR]]) {
    for (const ad of liste) $(secim).appendChild(new Option(ad, ad));
  }
  $("makine-secim").onchange = () => { makineYaz({ makine: $("makine-secim").value }); makineFormuTemizle(); makineCiz(); };
  $("usta-secim").onchange = () => makineYaz({ usta: $("usta-secim").value });
  $("makine-proje").addEventListener("change", () => makineYaz({ proje: $("makine-proje").value.trim() || VARSAYILAN_PROJE }));
  $("makine-ay-geri").onclick = () => makineAyKaydir(-1);
  $("makine-ay-ileri").onclick = () => makineAyKaydir(1);
  $("makine-ay-girdi").onchange = () => {
    const m = $("makine-ay-girdi").value.match(/^(\d{4})-(\d{2})$/);
    if (!m) return;
    makineDurumu.yil = Number(m[1]);
    makineDurumu.ay = Number(m[2]);
    makineFormuTemizle();
    makineCiz();
  };
  for (const k of ["makine-baslama", "makine-bitis"]) $(k).addEventListener("input", () => noktaliTarihBicimle($(k)));
  $("dugme-makine-ekle").onclick = makineKaydet;
  $("dugme-makine-temizle").onclick = () => { makineFormuTemizle(); makineCiz(); };
  $("dugme-makine-sil").onclick = makineSil;
  $("makine-yapilan").addEventListener("keydown", (olay) => { if (olay.key === "Enter") makineKaydet(); });
  $("dugme-makine-excel").onclick = makineExcelIndir;
  $("dugme-makine-excel-alt").onclick = makineExcelIndir;
  $("dugme-makine-gonder").onclick = makineBilgisayaraGonder;
  $("makine-bilgisayardan").onchange = async () => {
    const dosya = $("makine-bilgisayardan").files[0];
    $("makine-bilgisayardan").value = "";
    if (dosya) await makineBilgisayardanAl(dosya);
  };
  $("menu-makine").onclick = makineAc;
  $("menu-fotolar").onclick = () => { katmaniKapat("katman-kuyular"); fotolariAc(); };
}

// ---------- Kuyu fotoğrafları ----------
// Makine lokasyonu, makine, sandık ve kuyu betonu fotoğrafları bu telefonda IndexedDB'de kuyuyla (aktifKimlik) birlikte
// saklanır; localStorage'a sığmazlar. Her fotoğrafın küçük bir önizlemesi de saklanır, ekranda yalnızca o çizilir
// (tam boy fotoğrafları çözmek telefonu yorar). ZIP masaüstündeki "Kuyu Fotoğrafları" sayfasıyla aynı adlandırmayla,
// tek klasörde: "<kuyu> Fotoğrafları/<kuyu>_<Tür>_NN.jpg".
const FOTO_TURLERI = ["Lokasyon", "Makine", "Sandik", "Beton"];
let fotoDbSozu = null;

function fotoDb() {
  fotoDbSozu ??= new Promise((coz, reddet) => {
    const istek = indexedDB.open("logvera-fotolar", 1);
    istek.onupgradeneeded = () => istek.result.createObjectStore("fotolar", { keyPath: "kimlik" }).createIndex("kuyu", "kuyu");
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => { fotoDbSozu = null; reddet(istek.error); };
  });
  return fotoDbSozu;
}

async function fotoIslem(kip, is) {
  const db = await fotoDb();
  return new Promise((coz, reddet) => {
    const islem = db.transaction("fotolar", kip);
    const sonuc = is(islem.objectStore("fotolar"));
    islem.oncomplete = () => coz(sonuc?.result);
    islem.onerror = islem.onabort = () => reddet(islem.error);
  });
}

async function kuyuFotograflari(kuyu = aktifKimlik) {
  const kayitlar = await fotoIslem("readonly", (depo) => depo.index("kuyu").getAll(kuyu));
  return (kayitlar || []).sort((a, b) => a.eklenme - b.eklenme);
}

async function kucukOnizleme(dosya) {
  const bitmap = await createImageBitmap(dosya);
  const olcek = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
  const tuval = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * olcek), height: Math.round(bitmap.height * olcek) });
  tuval.getContext("2d").drawImage(bitmap, 0, 0, tuval.width, tuval.height);
  bitmap.close?.();
  return new Promise((coz) => tuval.toBlob(coz, "image/jpeg", 0.7));
}

async function fotoEkle(tur, dosyalar) {
  if (!dosyalar.length) return;
  navigator.storage?.persist?.().catch(() => {});  // tarayıcı yer açmak için fotoğrafları silmesin
  durumYaz("Fotoğraflar kaydediliyor…");
  let eklenen = 0;
  for (const [i, dosya] of [...dosyalar].entries()) {
    let kucuk = null;
    try { kucuk = await kucukOnizleme(dosya); } catch (hata) { /* çözülemeyen biçim: önizlemesiz saklanır */ }
    try {
      await fotoIslem("readwrite", (depo) => depo.put({
        kimlik: yeniKimlik(), kuyu: aktifKimlik, tur, eklenme: Date.now() + i, blob: dosya, kucuk, tip: dosya.type, ad: dosya.name,
      }));
      eklenen++;
    } catch (hata) {
      sor("Fotoğraf kaydedilemedi", "Telefonda yer kalmamış olabilir.\n" + (hata?.message || hata), [["Tamam", true, true]]);
      break;
    }
  }
  await fotolariCiz();
  durumYaz(`${eklenen} fotoğraf eklendi`);
}

async function fotoSil(kimlik) {
  const cevap = await sor("Fotoğrafı sil", "Bu fotoğraf telefondan silinsin mi?", [["Sil", true, true], ["Vazgeç", false]]);
  if (!cevap) return;
  await fotoIslem("readwrite", (depo) => depo.delete(kimlik));
  await fotolariCiz();
}

async function kuyununFotograflariniSil(kuyu) {
  const kayitlar = await kuyuFotograflari(kuyu);
  if (kayitlar.length) await fotoIslem("readwrite", (depo) => kayitlar.forEach((k) => depo.delete(k.kimlik)));
}

const fotoAdresleri = [];
let aktarilmamisFoto = 0;

async function fotolariCiz() {
  const kuyuAdi = (veri.kuyu_bilgileri.kuyu || "").trim();
  $("foto-kuyu-bilgi").textContent = kuyuAdi ? `${kuyuAdi} kuyusunun fotoğrafları` : "Kuyu adı henüz yazılmadı (Manevra › Kuyu bilgileri). ZIP için gerekir.";
  let kayitlar = [];
  try { kayitlar = await kuyuFotograflari(); } catch (hata) { durumYaz("Fotoğraflar okunamadı: " + (hata?.message || hata)); }
  fotoAdresleri.splice(0).forEach((adres) => URL.revokeObjectURL(adres));
  for (const tur of FOTO_TURLERI) {
    const kap = $("foto-" + tur), turunkiler = kayitlar.filter((k) => k.tur === tur);
    kap.textContent = "";
    $("foto-sayi-" + tur).textContent = turunkiler.length ? `${turunkiler.length} fotoğraf` : $("foto-sayi-" + tur).dataset.bos;
    turunkiler.forEach((kayit, i) => {
      const kutu = Object.assign(document.createElement("div"), { className: "foto-kucuk" });
      if (kayit.kucuk) {
        const adres = URL.createObjectURL(kayit.kucuk);
        fotoAdresleri.push(adres);
        kutu.appendChild(Object.assign(document.createElement("img"), { src: adres, alt: "" }));
      }
      kutu.appendChild(Object.assign(document.createElement("span"), { textContent: String(i + 1).padStart(2, "0") }));
      const sil = Object.assign(document.createElement("button"), { textContent: "×", ariaLabel: "Sil" });
      sil.onclick = () => fotoSil(kayit.kimlik);
      kutu.appendChild(sil);
      kap.appendChild(kutu);
    });
  }
  const toplam = kayitlar.length;
  aktarilmamisFoto = kayitlar.filter((k) => !k.aktarildi).length;
  kaydetIsaretiniCiz();
  $("dugme-kuyu-fotolari").textContent = toplam ? `Kuyu Fotoğraflarını Aç (${toplam})` : "Kuyu Fotoğraflarını Aç";
}

// --- ZIP (sıkıştırmasız; fotoğraflar zaten sıkıştırılmış) ---
const CRC_TABLOSU = (() => {
  const tablo = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tablo[n] = c >>> 0;
  }
  return tablo;
})();

function crc32(baytlar) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < baytlar.length; i++) c = CRC_TABLOSU[(c ^ baytlar[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function zipOlustur(dosyalar) {
  const kodlayici = new TextEncoder(), parcalar = [], merkez = [];
  const simdi = new Date();
  const saat = (simdi.getHours() << 11) | (simdi.getMinutes() << 5) | (simdi.getSeconds() >> 1);
  const gun = ((simdi.getFullYear() - 1980) << 9) | ((simdi.getMonth() + 1) << 5) | simdi.getDate();
  let konum = 0;
  for (const { ad, blob } of dosyalar) {
    const adBaytlari = kodlayici.encode(ad);
    const veriBaytlari = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(veriBaytlari), boy = veriBaytlari.length;
    const yerel = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, saat, 2], [12, gun, 2], [14, crc, 4], [18, boy, 4], [22, boy, 4],
      [26, adBaytlari.length, 2], [28, 0, 2]].forEach(([o, d, u]) => (u === 4 ? yerel.setUint32(o, d, true) : yerel.setUint16(o, d, true)));
    parcalar.push(yerel, adBaytlari, blob);  // blob kopyalanmaz, Blob içinde başvuru olarak kalır
    const m = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, saat, 2], [14, gun, 2], [16, crc, 4], [20, boy, 4],
      [24, boy, 4], [28, adBaytlari.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, konum, 4]]
      .forEach(([o, d, u]) => (u === 4 ? m.setUint32(o, d, true) : m.setUint16(o, d, true)));
    merkez.push(m, adBaytlari);
    konum += 30 + adBaytlari.length + boy;
  }
  const merkezBoyu = merkez.reduce((t, p) => t + p.byteLength, 0);
  const son = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, dosyalar.length, 2], [10, dosyalar.length, 2], [12, merkezBoyu, 4], [16, konum, 4], [20, 0, 2]]
    .forEach(([o, d, u]) => (u === 4 ? son.setUint32(o, d, true) : son.setUint16(o, d, true)));
  return new Blob([...parcalar, ...merkez, son], { type: "application/zip" });
}

function fotoUzantisi(kayit) {
  const tip = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif", "image/webp": "webp" }[kayit.tip];
  return tip || (kayit.ad?.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
}

const fotoKuyuAdi = () => (veri.kuyu_bilgileri.kuyu || "").trim().replace(/[\\/:*?"<>|]/g, "_");

// ZIP: "<kuyu> Fotoğrafları/<kuyu>_<Tür>_NN.jpg" + kökte logvera_fotolar.json (kimlik ve tür; bilgisayardaki Logvera
// bununla aynı fotoğrafı iki kez eklemez). yalniz verilirse yalnızca o kayıtlar konur, numaralar yine tüm listeye göre.
async function fotoZipiHazirla(kuyuAdi, tumKayitlar, yalniz = null) {
  const klasor = `${kuyuAdi} Fotoğrafları`, dosyalar = [], liste = [];
  for (const tur of FOTO_TURLERI) {
    tumKayitlar.filter((k) => k.tur === tur).forEach((kayit, i) => {
      if (yalniz && !yalniz.includes(kayit)) return;
      const ad = `${klasor}/${kuyuAdi}_${tur}_${String(i + 1).padStart(2, "0")}.${fotoUzantisi(kayit)}`;
      dosyalar.push({ ad, blob: kayit.blob });
      liste.push({ dosya: ad, kimlik: kayit.kimlik, tur, eklenme: kayit.eklenme });
    });
  }
  const bilgi = new Blob([JSON.stringify({ kuyu: veri.kuyu_bilgileri.kuyu.trim(), fotolar: liste }, null, 2)], { type: "application/json" });
  return { zip: await zipOlustur([...dosyalar, { ad: "logvera_fotolar.json", blob: bilgi }]), adet: dosyalar.length };
}

async function aktarilmamislariSay() {
  const kuyu = aktifKimlik;
  try {
    const sayi = (await kuyuFotograflari(kuyu)).filter((k) => !k.aktarildi).length;
    if (kuyu === aktifKimlik) { aktarilmamisFoto = sayi; kaydetIsaretiniCiz(); }
  } catch (hata) { /* fotoğraf deposu açılamadıysa nokta yalnız kuyu dosyasına bakar */ }
}

async function fotolariAktarildiYap(kayitlar) {
  await fotoIslem("readwrite", (depo) => kayitlar.forEach((k) => depo.put({ ...k, aktarildi: true })));
  aktarilmamisFoto = 0;
  kaydetIsaretiniCiz();
}

async function fotoZipPaylas() {
  const kuyuAdi = fotoKuyuAdi();
  if (!kuyuAdi) return hataGoster("Önce kuyu adını yazın (Manevra › Kuyu bilgileri). Fotoğraflar kuyu adıyla adlandırılır.");
  const kayitlar = await kuyuFotograflari();
  if (!kayitlar.length) return hataGoster("Bu kuyu için henüz fotoğraf yok.");
  durumYaz("ZIP hazırlanıyor…");
  const { zip, adet } = await fotoZipiHazirla(kuyuAdi, kayitlar);
  const ad = `${kuyuAdi} Fotoğrafları.zip`, dosya = new File([zip], ad, { type: "application/zip" });
  if (navigator.canShare && navigator.canShare({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya], title: ad });
      durumYaz(`ZIP hazır: ${ad} (${adet} fotoğraf)`);
    } catch (hata) {
      if (hata.name !== "AbortError") durumYaz("Paylaşılamadı: " + hata.message);
    }
    return;
  }
  const baglanti = Object.assign(document.createElement("a"), { href: URL.createObjectURL(dosya), download: ad });
  baglanti.click();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 10000);
  durumYaz(`İndirildi: ${ad} (${adet} fotoğraf)`);
}

function fotolariAc() {
  katmaniAc("katman-fotolar");
  fotolariCiz();
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
    const { kuyu_bilgileri, birimler, numune_listesi, ud_listesi } = veri;
    veri = bosVeri();
    Object.assign(veri, { kuyu_bilgileri, birimler, numune_listesi, ud_listesi });
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
  nokta: "Her sıranın altındaki bölmede 10 cm çizgilerine derinlik yönünde sırayla dokunun; alt sıraya geçince yeni sıra kendiliğinden başlar. Son sıranın altında bölme yoksa “Son Sıra (Üst Aralık)” düğmesine basın ya da noktaları üstteki bölmeye yeniden koyun. Son noktaya dokun: sil • sürükle: taşı • iki parmak: yakınlaştır.",
  sinir: "Önce manevranın başladığı, sonra bittiği yere dokunun; bitiş alt sırada olabilir. İşarete dokun: sil • sürükle: taşı.",
  kirik: "Fotoğrafta karotun üzerine dokun → kırık ekle • kırığa dokun → sil • kırığı sürükle → taşı. İki parmakla yakınlaştırın.",
  tur: "Fotoğrafta parçaya dokunun: sağlam (renkli) ↔ ezik/ufalanmış (renksiz, SCR ve RQD'ye sayılmaz).",
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

// onceki: önceki fotoğraf(lar)dan taşınan şeritler; yalnızca fotoğraf açılabilirse geçer
async function karotAc(dosya, onceki = []) {
  let tuval;
  try {
    tuval = await karotFotoHazirla(dosya);
  } catch (hata) {
    sor("Karot Ölçümü", "Fotoğraf açılamadı.", [["Tamam", true, true]]);
    return false;
  }
  Object.assign(karot, {
    tuval, surum: karot.surum + 1, diziler: [], aktif: null, baslangic: null, bitis: null, seritler: [], parcalar: [],
    onceki, gecmis: [], kirpma: false, cizim: null, buyutec: null,
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
  if (karot.tuval) karotFotoCiz();  // parçalar yalnızca kırık/tür adımında fotoğrafta gösterilir
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

// Noktalar her sıranın altındaki bölmeye konur, karot noktaların yarım sıra yukarısındadır. Son sıranın altında
// bölme olmadığından onun noktaları üstteki bölmeye, bir önceki sıranın noktalarıyla aynı çizgiye konur; böyle
// bir dizinin karotu noktaların altındadır. Yarım sıra, ardışık nokta dizileri arasındaki uzaklıktan bulunur.
const VARSAYILAN_SIRA_ARALIGI = 7;  // cm

function dizilerArasiUzaklik(a, b) {
  // b'deki noktaların a çizgisine dik uzaklıklarının ortancası (cm)
  const uzakliklar = b.map(([x, y]) => {
    const konum = cetvelKonumu(a, x, y);
    return konum ? konum[1] / cetvelNoktasi(a, konum[0]).olcek : Infinity;
  }).sort((u, v) => u - v);
  return uzakliklar.length ? uzakliklar[Math.floor(uzakliklar.length / 2)] : Infinity;
}

function karotKaydirmalari() {
  const d = karot.diziler;
  const altta = d.map((dizi, i) => dizi.length > 0 && d.slice(0, i).some((onceki) => onceki.length >= 2 && dizilerArasiUzaklik(onceki, dizi) < 2));
  const araliklar = [];
  for (let i = 1; i < d.length; i++) {
    if (altta[i] || d[i - 1].length < 2 || !d[i].length) continue;
    const u = dizilerArasiUzaklik(d[i - 1], d[i]);
    if (u > 3 && u < 20) araliklar.push(u);
  }
  araliklar.sort((u, v) => u - v);
  const yari = (araliklar.length ? araliklar[Math.floor(araliklar.length / 2)] : VARSAYILAN_SIRA_ARALIGI) / 2;
  return d.map((_, i) => (altta[i] ? 1 : -1) * yari);
}

// s. dizinin ölçtüğü karotun ekseni üzerinde, cm konumundaki nokta (yön ve ölçek cetvelNoktasi ile aynı)
function karotEksen(s, cm, kaydirmalar = karotKaydirmalari()) {
  const n = cetvelNoktasi(karot.diziler[s], cm), k = kaydirmalar[s] * n.olcek;
  return { ...n, x: n.x - n.yy * k, y: n.y + n.yx * k };
}

function karotCetvelde(x, y) {
  // dokunulan yer hangi sıranın karotuna en yakınsa o sıra seçilir (aynı çizgideki iki dizi böyle ayrılır)
  const kaydirmalar = karotKaydirmalari();
  let enIyi = null;
  karot.diziler.forEach((dizi, s) => {
    const konum = cetvelKonumu(dizi, x, y);
    if (!konum) return;
    const eksen = karotEksen(s, konum[0], kaydirmalar), uzak = Math.hypot(x - eksen.x, y - eksen.y);
    if (!enIyi || uzak < enIyi[2]) enIyi = [s, Math.round(konum[0] * 10) / 10, uzak];
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

function karotCaprazCiz(b, s, cm, yariCm, renk, kalinlik, kaydirmalar) {
  // s. sıranın karot eksenine dik çizgi; üst ucunun ekran konumunu döndürür
  const n = karotEksen(s, cm, kaydirmalar), nx = -n.yy * yariCm * n.olcek, ny = n.yx * yariCm * n.olcek;
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
  const kaydirmalar = karotKaydirmalari();
  karotParcalariCiz(b, kaydirmalar);
  karot.seritler.forEach((serit, i) => {
    for (const kesim of karot.parcalar[i]?.kesimler || []) karotCaprazCiz(b, serit.sira, serit.c0 + kesim, 2.8, "#E62828", 3, kaydirmalar);
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
    if (dizi.length >= 2) {
      // sıra adı, dizinin ölçtüğü karotun hizasına yazılır (son sıranınki noktaların altında)
      const basi = karotEksen(s, 0, kaydirmalar), [ex, ey] = karotEkrana(basi.x, basi.y);
      b.font = "bold 13px -apple-system, sans-serif";
      b.textAlign = "right";
      b.textBaseline = "middle";
      b.fillText(`${s + 1}. sıra`, ex - 9, ey);
    }
  });
  const aralik = karotAralik();
  for (const [ad, renk, metin] of [["baslangic", "#22C55E", "Başlangıç"], ["bitis", "#EF4444", "Bitiş"]]) {
    if (!karotIsaretGecerli(karot[ad])) continue;
    const uc = karotCaprazCiz(b, karot[ad][0], karot[ad][1], 4, renk, 4, kaydirmalar);
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
      const n = karotEksen(karot[ad][0], karot[ad][1]);
      const [sx, sy] = karotEkrana(n.x, n.y);
      if (Math.hypot(sx - ex, sy - ey) <= 24) return { tur: "isaret", ad };
    }
  }
  if (karot.mod === "kirik") {
    let enIyi = null, sinir = 22;
    karot.seritler.forEach((serit, i) => (karot.parcalar[i]?.kesimler || []).forEach((kesim, j) => {
      const n = karotEksen(serit.sira, serit.c0 + kesim);
      const [sx, sy] = karotEkrana(n.x, n.y), uzak = Math.hypot(sx - ex, sy - ey);
      if (uzak <= sinir) { enIyi = { tur: "kesim", i, j }; sinir = uzak; }
    }));
    return enIyi;
  }
  return null;
}

// fotoğraftaki bir noktanın ölçülen şeritlerdeki yeri: { i: şerit, cm: şeridin başından } ya da karotun dışındaysa null
function karotSeritteKonum(x, y) {
  let enIyi = null;
  karot.seritler.forEach((serit, i) => {
    const konum = cetvelKonumu(karot.diziler[serit.sira], x, y);
    if (!konum || konum[0] < serit.c0 - 0.5 || konum[0] > serit.c1 + 0.5) return;
    const eksen = karotEksen(serit.sira, konum[0]), uzak = Math.hypot(x - eksen.x, y - eksen.y);
    if (uzak > 4 * eksen.olcek || (enIyi && uzak >= enIyi.uzak)) return;
    enIyi = { i, cm: Math.min(karot.parcalar[i].uzunluk, Math.max(0, konum[0] - serit.c0)), uzak };
  });
  return enIyi;
}

// ölçülen parçalar fotoğrafta karotun üzerine, eksen boyunca yarı saydam bant olarak çizilir
function karotParcalariCiz(b, kaydirmalar) {
  if (karot.mod !== "kirik" && karot.mod !== "tur") return;  // nokta koyarken karotu örtmesin
  karot.seritler.forEach((serit, i) => {
    const sira = karot.parcalar[i];
    if (!sira) return;
    for (const [a, c, tur] of karotParcalari(sira)) {
      if (tur !== "s") continue;
      const ust = [], alt = [];
      for (let u = a; ; u = Math.min(c, u + 2)) {
        const n = karotEksen(serit.sira, serit.c0 + u, kaydirmalar), nx = -n.yy * 2.6 * n.olcek, ny = n.yx * 2.6 * n.olcek;
        ust.push(karotEkrana(n.x - nx, n.y - ny));
        alt.push(karotEkrana(n.x + nx, n.y + ny));
        if (u >= c) break;
      }
      const renk = tamCm(c - a) >= RQD_ESIGI ? "60, 180, 60" : "255, 210, 0";
      b.beginPath();
      [...ust, ...alt.reverse()].forEach(([x, y], k) => (k ? b.lineTo(x, y) : b.moveTo(x, y)));
      b.closePath();
      b.fillStyle = `rgba(${renk}, .28)`;
      b.fill();
      b.strokeStyle = `rgb(${renk})`;
      b.lineWidth = 2;
      b.stroke();
      const orta = karotEksen(serit.sira, serit.c0 + (a + c) / 2, kaydirmalar), [mx, my] = karotEkrana(orta.x, orta.y);
      if ((c - a) * orta.olcek * karot.olcek >= 22) {
        b.font = "bold 12px -apple-system, sans-serif";
        b.textAlign = "center";
        b.textBaseline = "middle";
        const metin = String(tamCm(c - a)), w = b.measureText(metin).width + 8;
        b.fillStyle = "rgba(31, 41, 55, .85)";
        b.fillRect(mx - w / 2, my - 9, w, 18);
        b.fillStyle = "#fff";
        b.fillText(metin, mx, my);
      }
    }
  });
}

function karotDokunuldu(ex, ey, hedef) {
  const [x, y] = karotResme(ex, ey);
  if (karot.mod === "nokta") {
    karotGecmiseEkle();
    // yalnızca en son konan nokta dokununca silinir; başka bir noktanın üstüne dokunmak oraya yeni nokta koyar
    // (son sıranın noktaları üstteki sıranın noktalarıyla aynı yere konur)
    const sonDizi = karot.diziler[karot.aktif];
    if (hedef && sonDizi && hedef.s === karot.aktif && hedef.j === sonDizi.length - 1) karotNoktaSil(hedef.s, hedef.j);
    else karotNoktaEkle(x, y);
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
        const uzaklik = (ad) => { const n = karotEksen(karot[ad][0], karot[ad][1]); return Math.hypot(n.x - x, n.y - y); };
        karot[uzaklik("baslangic") <= uzaklik("bitis") ? "baslangic" : "bitis"] = konum;
      }
      karotIsaretleriSirala();
    }
  } else {
    // kırık ve tür düzeltmeleri doğrudan fotoğrafta; öneriler yeniden yapılmaz
    const konum = hedef ? null : karotSeritteKonum(x, y);
    if (!hedef && !konum) {
      if (karot.seritler.length) durumYaz("Ölçülen aralığın içinde, karotun üzerine dokunun");
      return;
    }
    karotGecmiseEkle();
    if (karot.mod === "kirik") {
      hedef ? karotKesimSil(karot.parcalar[hedef.i], hedef.j) : karotKesimEkle(karot.parcalar[konum.i], konum.cm);
    } else {
      const sira = karot.parcalar[konum.i], k = sira.kesimler.filter((kesim) => kesim <= konum.cm).length;
      sira.turler[k] = sira.turler[k] === "s" ? "b" : "s";
    }
    karotCizHepsi();
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
        else if (hedef.tur === "kesim") {
          // kırık yalnızca kendi şeridinde, komşu kırıkların arasında kayar
          const serit = karot.seritler[hedef.i], sira = karot.parcalar[hedef.i], k = sira.kesimler, j = hedef.j;
          const yer = cetvelKonumu(karot.diziler[serit.sira], x, y);
          if (yer) {
            const alt = j > 0 ? k[j - 1] + 0.2 : 0.2, ust = j + 1 < k.length ? k[j + 1] - 0.2 : sira.uzunluk - 0.2;
            k[j] = Math.round(Math.min(ust, Math.max(alt, yer[0] - serit.c0)) * 10) / 10;
          }
          karot.buyutec = [x, y];
          karotCizHepsi();
          return;
        }
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
      } else if (hedef?.tur === "kesim") {
        karot.buyutec = null;
        karotCizHepsi();
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
    const seritler = await iste("karot_seritleri", { diziler: karot.diziler, kaydirmalar: karotKaydirmalari(), baslangic: karot.baslangic, bitis: karot.bitis });
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
  // parçalar tek tek yuvarlandığından toplamları TCR'yi aşabilir (19 cm'de 9,5 + 9,5 -> 10 + 10 = 20);
  // SCR işaretlenen boydan, RQD de SCR'den büyük olamaz (karot_olcum.hesapla ile aynı)
  toplam.scrHam = toplam.scr;
  toplam.rqdHam = toplam.rqd;
  toplam.scr = Math.min(toplam.scr, toplam.tcr);
  toplam.rqd = Math.min(toplam.rqd, toplam.scr);
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
    const toplamYazisi = (ham, son, ust) => (ham === son ? `${son} cm` : `${ham} cm → ${son} cm (${ust}'yi aşamaz)`);
    bilgiler.push(`SCR = sağlam parçalar: ${t.scrParcalar.join(" + ") || "yok"} = ${toplamYazisi(t.scrHam, t.scr, "TCR")}`);
    bilgiler.push(`RQD = ${RQD_ESIGI} cm ve üzeri sağlam parçalar: ${t.rqdParcalar.join(" + ") || "yok"} = ${toplamYazisi(t.rqdHam, t.rqd, "SCR")}`);
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
  // masaüstündeki gibi: bu fotoğrafın parçaları ancak sonraki fotoğraf açılınca öncekilere eklenir
  const onceki = [...karot.onceki, ...JSON.parse(JSON.stringify(karot.parcalar))];
  if (await karotAc(dosya, onceki)) {
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
  $("karot-son-sira").onclick = () => {
    // son sıranın altında bölme yok: önceki sıranın noktaları aynen kopyalanır, karotu noktaların altında sayılır
    const onceki = karot.diziler[karot.diziler.length - 1];
    if (!onceki || onceki.length < 2) {
      sor("Karot Ölçümü", "Önce üstteki sıranın noktalarını (son sıranın üstündeki bölmeye) koyun.", [["Tamam", true, true]]);
      return;
    }
    karotGecmiseEkle();
    karot.diziler.push(onceki.map(([x, y]) => [x, y]));
    karot.aktif = null;
    karotModSec("nokta");
    karotSeritleriGuncelle();
  };
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

  for (const anahtar of KUYU_ALANLARI) {
    $("kuyu-" + anahtar).addEventListener("input", (olay) => {
      if (anahtar.endsWith("_tarihi")) olay.target.value = tarihiBicimle(olay.target.value);
      veri.kuyu_bilgileri[anahtar] = olay.target.value;
      kaydet();
      numuneCiz(false);
      if (anahtar === "kuyu") {
        $("ust-kuyu").textContent = olay.target.value || "Yeni kuyu";
        document.title = olay.target.value ? `Logvera — ${olay.target.value}` : "Logvera";
      }
    });
  }

  $("spt-secim").onchange = sptKutulariniDoldur;
  $("dugme-spt-kaydet").onclick = sptKaydet;
  $("dugme-spt-sil").onclick = sptSil;
  $("aralik-kaydet").onclick = manevraAraliginiKaydet;
  makineBagla();
  $("dugme-kuyu-fotolari").onclick = fotolariAc;
  $("dugme-foto-zip").onclick = fotoZipPaylas;
  $("dugme-foto-zip-ust").onclick = fotoZipPaylas;
  for (const girdi of document.querySelectorAll("[data-foto-tur]")) {
    girdi.onchange = async () => { await fotoEkle(girdi.dataset.fotoTur, girdi.files); girdi.value = ""; };
  }
  for (const tur of FOTO_TURLERI) $("foto-sayi-" + tur).dataset.bos = $("foto-sayi-" + tur).textContent;
  $("aralik-vazgec").onclick = manevraDuzenleKapat;
  $("aralik-duzen").onclick = (olay) => { if (olay.target === $("aralik-duzen")) manevraDuzenleKapat(); };
  $("aralik-bit").addEventListener("keydown", (olay) => { if (olay.key === "Enter") manevraAraliginiKaydet(); });
  $("dugme-spt-aralik-kaydet").onclick = () => sptAraliginiKaydet();
  $("dugme-spt-aralik-sifirla").onclick = () => sptAraliginiKaydet(true);
  $("spt-aralik-bit").addEventListener("keydown", (olay) => { if (olay.key === "Enter") sptAraliginiKaydet(); });
  ["darbe-1", "darbe-2", "darbe-3"].forEach((k, i, hepsi) => $(k).addEventListener("keydown", (olay) => {
    if (olay.key !== "Enter") return;
    i < 2 ? $(hepsi[i + 1]).focus() : sptKaydet();
  }));

  $("dugme-tcr-hesapla").onclick = tcrHesapla;
  $("dugme-tcr-sil").onclick = tcrSonuSil;
  $("dugme-birim-ekle").onclick = birimEkle;
  $("numune-yass").addEventListener("input", (olay) => { veri.numune_listesi.yass = olay.target.value; kaydet(); numuneCiz(false); });
  $("numune-rastlanmadi").onclick = () => { veri.numune_listesi.yass = "Rastlanmadı"; kaydet(); numuneCiz(); };
  $("dugme-numune-ekle").onclick = numuneKarotEkle;
  $("dugme-ud-ekle").onclick = udEkle;
  $("dugme-ud-duzenle").onclick = udDuzenle;
  $("dugme-ud-sil").onclick = udSil;
  $("ud-baslangic").addEventListener("keydown", (olay) => { if (olay.key === "Enter") $("ud-bitis").focus(); });
  $("ud-bitis").addEventListener("keydown", (olay) => { if (olay.key === "Enter") $("ud-ad").focus(); });
  $("ud-ad").addEventListener("keydown", (olay) => { if (olay.key === "Enter") (udSecili ? udDuzenle : udEkle)(); });
  $("dugme-numune-paylas").onclick = numuneListesiniPaylas;
  $("dugme-numune-jpeg").onclick = numuneJpegIndir;
  $("numune-baslangic").addEventListener("keydown", (olay) => { if (olay.key === "Enter") $("numune-bitis").focus(); });
  $("numune-bitis").addEventListener("keydown", (olay) => { if (olay.key === "Enter") numuneKarotEkle(); });
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

// sw.js'deki ONBELLEK adıyla aynı tutulur; açılışta alttaki durum satırında görünür (güncelleme geldi mi diye bakmak için)
const SURUM = "v33";

// Ana ekrandaki uygulama iPhone'da arka planda donup kalır, öne gelince sayfayı yeniden yüklemez; eski kodla
// sürer. Bu yüzden her öne gelişte yeni sürüm aranır; yeni service worker devreye girince sayfa yenilenir.
// Yazı yazılırken yenilenmez (kutu odaktaysa bir sonraki öne gelişe kalır); kuyular zaten her değişiklikte kaydedilir.
function guncellemeyiIzle() {
  if (!("serviceWorker" in navigator) || !(location.protocol === "https:" || location.hostname === "localhost")) return;
  const oncekiDenetci = navigator.serviceWorker.controller;
  let yenilenecek = false;
  const yenile = () => {
    const odak = document.activeElement;
    const yaziliyor = odak && (odak.tagName === "INPUT" || odak.tagName === "TEXTAREA" || odak.tagName === "SELECT");
    if (document.visibilityState === "visible" && !yaziliyor) location.reload();
    else yenilenecek = true;
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (oncekiDenetci) yenile();  // ilk kurulumda değil, yalnızca sürüm değişince
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((kayit) => {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (yenilenecek) yenile();
      else kayit.update().catch(() => {});
    });
  }).catch(() => {});
}

function baslat() {
  baglantilariKur();
  if (aktifKimlik && kuyular[aktifKimlik]) kuyuAc(aktifKimlik);
  else yeniKuyu();
  ozetiCiz();
  durumYaz(`Logvera ${SURUM}`);
  requestAnimationFrame(camiTasi);
  window.addEventListener("resize", camiTasi);
  guncellemeyiIzle();
}

baslat();
