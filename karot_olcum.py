"""Karot sandığı fotoğrafından manevra başına TCR/SCR/RQD ölçümü.

Kullanıcı karotun ortasına, bölmelerdeki 10 cm işaretlerinin hizasına noktalar koyar (her sıra ayrı bir nokta
dizisi) ve manevranın başlangıcını ve bitişini işaretler; bitiş başka bir sırada olabilir. Bu aralıktaki karot
sıra sıra düz şeritlere açılır, parçalar ve kırıklar önerilir, kullanıcı düzelttikten sonra cm olarak toplanır.

TCR: işaretlenen aralığın boyu. SCR: sağlam parçalar. RQD: 10 cm ve üzeri sağlam parçalar. Hepsi manevra boyuna bölünür.
Ezik/ufalanmış kısımlar parça olarak işaretlenmez (BOS) ve yalnızca TCR'de kalır. Uzunluklar tam cm'ye yuvarlanır.
"""
import math

import cv2
import numpy as np

PIKSEL_CM = 10       # şeritlerde 1 cm
NOKTA_ARALIGI = 10   # ardışık iki nokta arası (cm)
SERIT_YARI = 3.0     # karot ekseninin iki yanından alınan genişlik (cm)
RQD_ESIGI = 10       # RQD'ye sayılan en kısa sağlam parça (cm)
SAGLAM, BOS = "s", "b"   # BOS: ezik, ufalanmış ya da karotsuz; sağlam sayılmaz


def tam_cm(deger):
    """Yarımlar yukarı olacak şekilde tam cm (14,5 -> 15)."""
    return int(math.floor(deger + 0.5))


def goruntu_oku(yol):
    return cv2.imdecode(np.fromfile(yol, dtype=np.uint8), cv2.IMREAD_COLOR)


def baskin_ton(img):
    """Sandık plastiğinin renk tonu: fotoğraftaki doygun piksellerin en baskın tonu (yoksa None)."""
    olcek = min(1.0, 800 / max(img.shape[:2]))
    hsv = cv2.cvtColor(cv2.resize(img, None, fx=olcek, fy=olcek, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
    doygun = (hsv[:, :, 1] > 85) & (hsv[:, :, 2] > 30) & (hsv[:, :, 2] < 230)
    if doygun.mean() < 0.02:
        return None
    sayim = np.bincount(hsv[:, :, 0][doygun].ravel(), minlength=180)[:180].astype(float)
    sayim = np.convolve(np.r_[sayim[-7:], sayim, sayim[:7]], np.ones(15), "valid")
    return int(np.argmax(sayim))


def _plastik(hsv, ton):
    # sandık plastiği (kanal tabanı, bölmeler) doygun ve tek renklidir; karot ve etiketler değildir
    if ton is None:
        return np.zeros(hsv.shape[:2], bool)
    doygun = (hsv[:, :, 1] > 85) & (hsv[:, :, 2] > 30) & (hsv[:, :, 2] < 230)
    fark = np.abs(hsv[:, :, 0].astype(int) - ton)
    return doygun & (np.minimum(fark, 180 - fark) <= 14)


def _kosular(dizi, en_az=1):
    sonuc, x = [], 0
    while x < len(dizi):
        if dizi[x]:
            bas = x
            while x < len(dizi) and dizi[x]:
                x += 1
            if x - bas >= en_az:
                sonuc.append((bas, x))
        x += 1
    return sonuc


def cetvelde_konum(noktalar, x, y):
    """Fotoğraftaki bir noktanın nokta dizisi üzerindeki yeri: (cm, eksene uzaklık piksel) ya da None."""
    n = np.asarray(noktalar, np.float64).reshape(-1, 2)
    if len(n) < 2:
        return None
    q = np.array([x, y], np.float64)
    en_iyi = None
    for k in range(len(n) - 1):
        d = n[k + 1] - n[k]
        uzunluk2 = float(d @ d)
        if uzunluk2 == 0:
            continue
        # uçlarda dizinin biraz dışına da taşabilir
        t = min(2.5 if k == len(n) - 2 else 1.0, max(-1.5 if k == 0 else 0.0, float((q - n[k]) @ d) / uzunluk2))
        uzak = float(np.linalg.norm(q - (n[k] + t * d)))
        if en_iyi is None or uzak < en_iyi[1]:
            en_iyi = (NOKTA_ARALIGI * (k + t), uzak)
    return en_iyi


def cetvel_noktasi(noktalar, cm):
    """Dizide cm konumundaki nokta, eksen yönü (birim vektör) ve cm başına piksel."""
    n = np.asarray(noktalar, np.float64).reshape(-1, 2)
    k = int(min(max(np.floor(cm / NOKTA_ARALIGI), 0), len(n) - 2))
    d = n[k + 1] - n[k]
    uzunluk = max(float(np.linalg.norm(d)), 1e-6)
    return n[k] + (cm / NOKTA_ARALIGI - k) * d, d / uzunluk, uzunluk / NOKTA_ARALIGI


def aralik_parcalari(diziler, baslangic, bitis):
    """Başlangıç (sıra, cm) ile bitiş (sıra, cm) arasında her sıranın ölçülecek kısmı: [(sıra, c0, c1), ...]."""
    (sa, ca), (sb, cb) = baslangic, bitis
    if (sb, cb) <= (sa, ca):
        return []
    sonuc = []
    for s in range(sa, sb + 1):
        if s >= len(diziler) or len(diziler[s]) < 2:
            continue
        c0 = ca if s == sa else 0.0
        c1 = cb if s == sb else NOKTA_ARALIGI * (len(diziler[s]) - 1)
        if c1 - c0 > 0.2:
            sonuc.append((s, c0, c1))
    return sonuc


def serit_cikar(img, noktalar, c0, c1):
    """Dizinin c0-c1 cm arasını, karot ekseni yatay olacak şekilde düz bir şeride açar."""
    n = np.asarray(noktalar, np.float64).reshape(-1, 2)
    genislik = max(1, int(round((c1 - c0) * PIKSEL_CM)))
    yukseklik = int(2 * SERIT_YARI * PIKSEL_CM)
    cm = c0 + (np.arange(genislik) + 0.5) / PIKSEL_CM
    k = np.clip(np.floor(cm / NOKTA_ARALIGI), 0, len(n) - 2).astype(int)
    d = n[k + 1] - n[k]
    uzunluk = np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    yon, olcek = d / uzunluk, uzunluk / NOKTA_ARALIGI
    merkez = n[k] + (cm / NOKTA_ARALIGI - k)[:, None] * d
    normal = np.stack([-yon[:, 1], yon[:, 0]], axis=1)
    ofset = (np.arange(yukseklik) + 0.5) / PIKSEL_CM - SERIT_YARI
    harita = merkez[None] + ofset[:, None, None] * olcek[None] * normal[None]
    return cv2.remap(img, harita[..., 0].astype(np.float32), harita[..., 1].astype(np.float32),
                     cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def serit_oner(serit, ton):
    """Şeritteki parçalar: {"uzunluk": cm, "kesimler": [cm...], "turler": [tür...]}.

    kesimler 0 ile uzunluk arasındaki sınırlar, turler aralarındaki parçaların türü (len(kesimler) + 1 adet).
    """
    hsv = cv2.cvtColor(serit, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1].astype(int), hsv[:, :, 2].astype(int)
    plastik = _plastik(hsv, ton)
    kagit = (s < 8) & (v > 222)
    yazi = v < 120
    cm = PIKSEL_CM
    yukseklik, genislik = serit.shape[:2]
    o0, o1 = int(yukseklik * 0.2), int(yukseklik * 0.8)
    var = (1 - plastik[o0:o1].mean(axis=0)) > 0.55
    # etiketler (takozlar): kâğıt rengi ve üstünde yazı; altında karot yoktur.
    # güneş parlaması da beyazdır ama şeridin tüm genişliğini kâğıt gibi kaplamaz
    for bas, son in _kosular(kagit[o0:o1].mean(axis=0) > 0.3, cm):
        if (yazi[o0:o1, bas:son].mean() > 0.04 and son - bas < 9 * cm and kagit[o0:o1, bas:son].mean() > 0.5
                and kagit[:, bas:son].mean() > 0.4):
            var[bas:son] = False
    # kırıklar: parlaklık profilinde dar ve derin çukurlar
    parlak = np.median(v[o0:o1], axis=0).astype(np.float32)
    yerel = cv2.dilate(parlak.reshape(1, -1), np.ones((1, int(2.5 * cm)), np.uint8)).ravel()
    kirik = [(bas + son) / 2 for bas, son in _kosular((yerel - parlak) > 55) if son - bas < 2 * cm]

    parcalar = []  # (bas, son, tür) piksel
    for bas, son in _kosular(var):
        ic = [bas] + [x for x in kirik if bas + 0.5 * cm < x < son - 0.5 * cm] + [son]
        parcalar += [(a, b, SAGLAM) for a, b in zip(ic, ic[1:])]
    # boşlukları ekle, çok kısa parçaları ufalanmış say, çok dar boşlukları kırık say
    tam, konum = [], 0
    for a, b, t in parcalar:
        if a - konum >= 1.0 * cm:
            tam.append([konum, a, BOS])
        elif tam:
            tam[-1][1] = a
        else:
            a = 0
        tam.append([a, b, t if b - a >= 3 * cm else BOS])
        konum = b
    if genislik - konum >= 1.0 * cm or not tam:
        tam.append([konum, genislik, BOS])
    else:
        tam[-1][1] = genislik
    birlesik = []
    for a, b, t in tam:
        if birlesik and birlesik[-1][2] == t and t != SAGLAM:
            birlesik[-1][1] = b
        else:
            birlesik.append([a, b, t])
    return {"uzunluk": round(genislik / cm, 1), "kesimler": [round(a / cm, 1) for a, b, t in birlesik[1:]],
            "turler": [t for a, b, t in birlesik]}


def parcalar(sira):
    """Şeridin (başlangıç cm, bitiş cm, tür) listesi."""
    sinir = [0.0] + list(sira["kesimler"]) + [float(sira["uzunluk"])]
    return [(a, b, t) for a, b, t in zip(sinir, sinir[1:], sira["turler"])]


def hesapla(seritler):
    """Bir manevranın şeritlerinden TCR, SCR ve RQD (cm) ve sayılan parçalar.

    TCR: başlangıç ile bitiş arasında işaretlenen karot boyu (kayıp karot boşluk bırakmaz).
    SCR: sağlam (kırık sayılmayan) parçaların toplamı. RQD: bunlardan 10 cm ve üzeri olanların toplamı.
    """
    # her parça tam cm'ye yuvarlanır, toplamlar bu tam sayılardan yapılır
    toplam = {"tcr": 0, "scr": 0, "rqd": 0, "sayilmayan": 0, "scr_parcalar": [], "rqd_parcalar": []}
    for sira in seritler:
        toplam["tcr"] += tam_cm(sira["uzunluk"])
        for a, b, tur in parcalar(sira):
            if tur == SAGLAM:
                uzunluk = tam_cm(b - a)
                toplam["scr"] += uzunluk
                toplam["scr_parcalar"].append(uzunluk)
                if uzunluk >= RQD_ESIGI:
                    toplam["rqd"] += uzunluk
                    toplam["rqd_parcalar"].append(uzunluk)
    toplam["sayilmayan"] = toplam["tcr"] - toplam["scr"]
    return toplam
