import os
import re
import sys
import math
import itertools
import cv2
import numpy as np

COP_SINIFI = 10


def program_klasoru():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def model_yolu():
    yanindaki = os.path.join(program_klasoru(), "rakam_modeli.onnx")
    if os.path.exists(yanindaki):
        return yanindaki
    return os.path.join(getattr(sys, "_MEIPASS", program_klasoru()), "rakam_modeli.onnx")


_model = None


def modeli_yukle():
    global _model
    if _model is None:
        _model = cv2.dnn.readNetFromONNX(np.fromfile(model_yolu(), dtype=np.uint8))
    return _model


def goruntu_oku(yol):
    return cv2.imdecode(np.fromfile(yol, dtype=np.uint8), cv2.IMREAD_COLOR)


def dogal_sira(yol):
    return [int(parca) if parca.isdigit() else parca.lower() for parca in re.split(r"(\d+)", os.path.basename(yol))]


def kareye_oturt(maske):
    ys, xs = np.nonzero(maske)
    if len(xs) == 0:
        return np.zeros((28, 28), np.float32)
    maske = maske[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = maske.shape
    olcek = 20 / max(h, w)
    yeni_w, yeni_h = max(1, round(w * olcek)), max(1, round(h * olcek))
    kucuk = cv2.resize(maske.astype(np.float32), (yeni_w, yeni_h), interpolation=cv2.INTER_AREA)
    sonuc = np.zeros((28, 28), np.float32)
    x0, y0 = (28 - yeni_w) // 2, (28 - yeni_h) // 2
    sonuc[y0:y0 + yeni_h, x0:x0 + yeni_w] = kucuk
    return np.clip(sonuc / max(sonuc.max(), 1e-6), 0, 1)


def sandik_maskesi(hsv):
    yesil = cv2.inRange(hsv, (60, 40, 20), (110, 255, 140))
    yesil = cv2.morphologyEx(yesil, cv2.MORPH_CLOSE, np.ones((41, 41), np.uint8))
    sayi, etiket, istat, _ = cv2.connectedComponentsWithStats(yesil)
    maske = np.zeros_like(yesil)
    for i in range(1, sayi):
        if istat[i][4] > 0.05 * yesil.size:
            konturlar, _ = cv2.findContours((etiket == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(maske, [cv2.convexHull(max(konturlar, key=cv2.contourArea))], -1, 255, -1)
    return maske


def yazi_bloklari(hsv, gri, sandik):
    zemin = cv2.medianBlur(gri, 31)
    referans = np.percentile(gri[sandik > 0], 99)
    zemin_doygunluk = cv2.GaussianBlur(cv2.morphologyEx(hsv[:, :, 1], cv2.MORPH_OPEN, np.ones((15, 15), np.uint8)), (0, 0), 3)
    murekkep = ((gri < 0.72 * zemin) & (zemin > 0.5 * referans) & (zemin_doygunluk < 80) & (sandik > 0)).astype(np.uint8)

    sayi, etiket, istat, _ = cv2.connectedComponentsWithStats(murekkep)
    x, y, w, h, alan = istat.T
    harf_mi = (9 <= h) & (h <= 45) & (w <= 1.6 * h) & (alan >= 15) & (alan < 0.8 * w * h)
    harf_mi[0] = False
    harfler = harf_mi[etiket].astype(np.uint8)
    birlesik = cv2.dilate(harfler, np.ones((13, 25), np.uint8))
    sayi, etiket, istat, _ = cv2.connectedComponentsWithStats(birlesik)
    bloklar = []
    for i in range(1, sayi):
        x, y, w, h, alan = istat[i]
        if not (50 <= w <= 330 and 25 <= h <= 130):
            continue
        bolge = harfler[y:y + h, x:x + w] * (etiket[y:y + h, x:x + w] == i)
        if cv2.connectedComponents(bolge)[0] - 1 >= 4:
            bloklar.append((x, y, w, h))
    return bloklar


def borulari_bul(img):
    olcek = 2048 / max(img.shape[:2])
    if abs(olcek - 1) > 0.01:
        img = cv2.resize(img, None, fx=olcek, fy=olcek, interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gri = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sandik = sandik_maskesi(hsv)

    parlaklik_ref = np.percentile(hsv[:, :, 2][sandik > 0], 99)
    en_parlak = (hsv[:, :, 2] >= 0.97 * parlaklik_ref) & (hsv[:, :, 2] < 255) & (sandik > 0)
    doygunluk_ref = float(np.median(hsv[:, :, 1][en_parlak])) if en_parlak.any() else 0.0

    beyaz = ((hsv[:, :, 1] <= doygunluk_ref + 40) & (hsv[:, :, 2] >= 0.68 * parlaklik_ref) & (sandik > 0)).astype(np.uint8) * 255
    beyaz = cv2.morphologyEx(beyaz, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    beyaz = cv2.morphologyEx(beyaz, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    sayi, etiket, istat, merkez = cv2.connectedComponentsWithStats(beyaz)
    adaylar = []
    for i in range(1, sayi):
        x, y, w, h, alan = istat[i]
        if alan < 2000 or not (20 <= h <= 130 and 80 <= w <= 400 and 1.4 <= w / h <= 8):
            continue
        if alan / (w * h) < 0.35:
            continue
        renk = hsv[y:y + h, x:x + w][etiket[y:y + h, x:x + w] == i]
        doygunluk, parlaklik = np.median(renk[:, 1]), np.percentile(renk[:, 2], 90)
        kesin = doygunluk <= doygunluk_ref + 7 and parlaklik >= 0.96 * parlaklik_ref
        adaylar.append([(x, y, w, h), kesin, False])

    for x, y, w, h in yazi_bloklari(hsv, gri, sandik):
        yazi_kutusu = (int(x - 0.2 * w), int(y - 0.35 * h), int(w * 1.4), int(h * 1.5))
        ortusenler = [a for a in adaylar if kesisim_orani(yazi_kutusu, a[0]) > 0.3]
        if ortusenler:
            for aday in ortusenler:
                aday[0] = birlesim(aday[0], (x, y, w, h))
                aday[2] = True
        else:
            adaylar.append([yazi_kutusu, False, True])

    birlesmis = []
    for kutu, kesin, yazili in sorted(adaylar, key=lambda a: -a[0][2] * a[0][3]):
        for diger in birlesmis:
            if kesisim_orani(kutu, diger[0]) > 0.5:
                diger[1] = diger[1] or kesin
                diger[2] = diger[2] or yazili
                break
        else:
            birlesmis.append([kutu, kesin, yazili])

    return [(tuple(int(round(d / olcek)) for d in kutu), kesin, yazili) for kutu, kesin, yazili in birlesmis]


def kesisim_orani(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    gx = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    gy = max(0, min(ay + ah, by + bh) - max(ay, by))
    return gx * gy / max(1, min(aw * ah, bw * bh))


def birlesim(a, b):
    x0, y0 = min(a[0], b[0]), min(a[1], b[1])
    x1, y1 = max(a[0] + a[2], b[0] + b[2]), max(a[1] + a[3], b[1] + b[3])
    return (x0, y0, x1 - x0, y1 - y0)


def boru_parcasi(img, kutu, genis=False):
    x, y, w, h = kutu
    if genis:
        pay = max(h, 45 * max(img.shape[:2]) / 2048)
        x0, y0 = max(0, x - int(w * 0.15)), max(0, y - int(pay * 0.9))
        x1, y1 = min(img.shape[1], x + w + int(w * 0.15)), min(img.shape[0], y + h + int(pay * 0.8))
    else:
        x0, y0 = max(0, x - int(w * 0.12)), max(0, y - int(h * 0.9))
        x1, y1 = min(img.shape[1], x + w + int(w * 0.12)), min(img.shape[0], y + h + int(h * 0.4))
    return img[y0:y1, x0:x1], (x - x0, y - y0, w, h)


def murekkebi_ayir(parca, aday_kutusu=None):
    olcek = 600 / parca.shape[1]
    parca = cv2.resize(parca, None, fx=olcek, fy=olcek, interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(parca, cv2.COLOR_BGR2HSV)
    gri = cv2.cvtColor(parca, cv2.COLOR_BGR2GRAY)

    beyaz = cv2.inRange(hsv, (0, 0, 110), (180, 60, 255))
    beyaz = cv2.morphologyEx(beyaz, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    sayi, etiket, istat, _ = cv2.connectedComponentsWithStats(beyaz)
    if sayi < 2:
        return parca, None
    if aday_kutusu is None:
        secilen = 1 + int(np.argmax(istat[1:, 4]))
    else:
        bx, by, bw, bh = (int(round(d * olcek)) for d in aday_kutusu)
        pencere = etiket[max(0, by):by + bh, max(0, bx):bx + bw]
        etiketler, adetler = np.unique(pencere[pencere > 0], return_counts=True)
        if len(etiketler) == 0 or adetler.max() < 0.1 * max(1, pencere.size):
            return parca, None
        secilen = int(etiketler[np.argmax(adetler)])
    konturlar, _ = cv2.findContours((etiket == secilen).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boru = np.zeros_like(beyaz)
    cv2.drawContours(boru, [cv2.convexHull(konturlar[0])], -1, 255, -1)
    boru = cv2.erode(boru, np.ones((7, 7), np.uint8))

    zemin = cv2.morphologyEx(gri, cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8))
    zemin = cv2.GaussianBlur(zemin, (0, 0), 5)
    oran = gri.astype(np.float32) / np.maximum(zemin.astype(np.float32), 1)
    murekkep = ((oran < 0.72) & (zemin > 90)).astype(np.uint8) * 255
    murekkep[boru == 0] = 0
    murekkep = cv2.morphologyEx(murekkep, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    murekkep = cv2.morphologyEx(murekkep, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return parca, murekkep


def karakterleri_bul(murekkep):
    sayi, etiket, istat, _ = cv2.connectedComponentsWithStats(murekkep)
    karakterler = []
    for i in range(1, sayi):
        x, y, w, h, alan = istat[i]
        if h < 22 or h > 140 or alan < 60 or w > 2.2 * h:
            continue
        karakterler.extend(genis_karakteri_bol(x, y, w, h, etiket[y:y + h, x:x + w] == i))
    return karakterler


def genis_karakteri_bol(x, y, w, h, maske):
    if w <= 1.15 * h:
        return [{"x": x, "y": y, "w": w, "h": h, "maske": maske}]
    orta = maske[:, int(w * 0.3):int(w * 0.7)].sum(axis=0)
    kes = int(w * 0.3) + int(np.argmin(orta))
    return [
        {"x": x, "y": y, "w": kes, "h": h, "maske": maske[:, :kes]},
        {"x": x + kes, "y": y, "w": w - kes, "h": h, "maske": maske[:, kes:]},
    ]


def satirlara_ayir(karakterler):
    satirlar = []
    for karakter in sorted(karakterler, key=lambda k: k["y"] + k["h"] / 2):
        merkez = karakter["y"] + karakter["h"] / 2
        for satir in satirlar:
            if abs(satir["merkez"] - merkez) < 0.6 * satir["yukseklik"]:
                satir["karakterler"].append(karakter)
                satir["merkez"] = np.mean([k["y"] + k["h"] / 2 for k in satir["karakterler"]])
                break
        else:
            satirlar.append({"merkez": merkez, "yukseklik": karakter["h"], "karakterler": [karakter]})
    for satir in satirlar:
        satir["karakterler"].sort(key=lambda k: k["x"])
    return [s for s in satirlar if len(s["karakterler"]) >= 3]


def siniflandir(karakterler):
    if not karakterler:
        return
    girdi = np.stack([kareye_oturt(k["maske"]) for k in karakterler])[:, None].astype(np.float32)
    model = modeli_yukle()
    parcalar = []
    for bas in range(0, len(girdi), 8):
        grup = girdi[bas:bas + 8]
        adet = len(grup)
        if adet < 8:
            grup = np.concatenate([grup, np.zeros((8 - adet, 1, 28, 28), np.float32)])
        model.setInput(grup)
        parcalar.append(model.forward()[:adet].copy())
    cikis = np.concatenate(parcalar)
    cikis = np.exp(cikis - cikis.max(axis=1, keepdims=True))
    olasiliklar = cikis / cikis.sum(axis=1, keepdims=True)
    for karakter, olasilik in zip(karakterler, olasiliklar):
        karakter["olasilik"] = olasilik
        karakter["rakam"] = int(np.argmax(olasilik[:10]))


def darbe_gruplarini_coz(gruplar):
    sayilar = [int("".join(str(r) for r in grup)) for grup in gruplar]
    darbeler = []
    i = 0
    while i < len(sayilar):
        if sayilar[i] == 50 and i + 1 < len(sayilar):
            if not 1 <= sayilar[i + 1] <= 15:
                return None
            darbeler.append(f"50/{sayilar[i + 1]}")
            i += 2
            break
        if sayilar[i] > 50:
            return None
        darbeler.append(str(sayilar[i]))
        i += 1
    if i != len(sayilar) or len(darbeler) > 3:
        return None
    refu = darbeler[-1].startswith("50/")
    if not refu and len(darbeler) != 3:
        return None
    while len(darbeler) < 3:
        darbeler.append("")
    return darbeler


def ayirma_secenekleri(karakterler):
    for bastan in range(3):
        for sondan in range(3):
            secilen = karakterler[bastan:len(karakterler) - sondan]
            adet = len(secilen)
            if adet < 3 or adet > 12:
                continue
            kirpma_puani = sum(math.log(max(k["olasilik"][COP_SINIFI], 0.15)) for k in karakterler[:bastan] + karakterler[len(karakterler) - sondan:])
            boy = float(np.median([k["h"] for k in secilen]))
            ince = [k["w"] / k["h"] < 0.95 and k["h"] >= 0.8 * boy for k in secilen]
            for ayirici_sayisi in (1, 2, 3):
                for ayiricilar in itertools.combinations(range(1, adet - 1), ayirici_sayisi):
                    if not all(ince[a] for a in ayiricilar):
                        continue
                    if any(b - a < 2 for a, b in zip(ayiricilar, ayiricilar[1:])):
                        continue
                    sinirlar = (-1,) + ayiricilar + (adet,)
                    gruplar = [[secilen[i] for i in range(a + 1, b)] for a, b in zip(sinirlar, sinirlar[1:])]
                    if any(not 1 <= len(g) <= 2 for g in gruplar):
                        continue
                    if any(g[1]["x"] - (g[0]["x"] + g[0]["w"]) > 0.45 * boy for g in gruplar if len(g) == 2):
                        continue
                    ayirici_puani = sum(math.log(secilen[a]["olasilik"][1] + secilen[a]["olasilik"][7] + 0.05) for a in ayiricilar)
                    yield gruplar, kirpma_puani, ayirici_puani, adet


def rakam_puani(karakter, rakam):
    return math.log(karakter["olasilik"][rakam] + 1e-4) + math.log(1 - karakter["olasilik"][COP_SINIFI] + 1e-4)


def darbe_satirini_oku(karakterler):
    en_iyi = None
    for gruplar, kirpma_puani, ayirici_puani, adet in ayirma_secenekleri(karakterler):
        darbeler = darbe_gruplarini_coz([[k["rakam"] for k in g] for g in gruplar])
        if darbeler is None:
            continue
        okuma_puani = ayirici_puani + sum(rakam_puani(k, k["rakam"]) for g in gruplar for k in g)
        if en_iyi is None or kirpma_puani + okuma_puani > en_iyi[0]:
            en_iyi = (kirpma_puani + okuma_puani, darbeler, okuma_puani / adet)
    if en_iyi is None:
        return None
    return en_iyi[1], math.exp(en_iyi[2])


def darbe_rakam_gruplari(darbeler):
    gruplar = []
    for darbe in darbeler:
        for parca in str(darbe).split("/"):
            if parca:
                gruplar.append([int(r) for r in parca])
    return gruplar


def hedefe_hizala(satirlar, darbeler):
    hedef = darbe_rakam_gruplari(darbeler)
    en_iyi = None
    for karakterler in satirlar:
        for gruplar, kirpma_puani, ayirici_puani, _ in ayirma_secenekleri(karakterler):
            if [len(g) for g in gruplar] != [len(g) for g in hedef]:
                continue
            puan = kirpma_puani + ayirici_puani + sum(rakam_puani(k, r) for g, h in zip(gruplar, hedef) for k, r in zip(g, h))
            if en_iyi is None or puan > en_iyi[0]:
                en_iyi = (puan, [(k["maske"], r) for g, h in zip(gruplar, hedef) for k, r in zip(g, h)])
    return None if en_iyi is None else en_iyi[1]


def ornekleri_kaydet(numune, darbeler, klasor):
    return ornekleri_yaz(hedefe_hizala(numune.get("satirlar", []), darbeler), klasor)


def ornekleri_yaz(eslesme, klasor):
    if not eslesme:
        return 0
    for maske, rakam in eslesme:
        hedef_klasor = os.path.join(klasor, str(rakam))
        os.makedirs(hedef_klasor, exist_ok=True)
        resim = (kareye_oturt(maske) * 255).astype(np.uint8)
        ad = f"{len(os.listdir(hedef_klasor)) + 1:05d}.png"
        cv2.imencode(".png", resim)[1].tofile(os.path.join(hedef_klasor, ad))
    return len(eslesme)


def takoz_karakterleri(img, kutu, yan):
    olcek = 2048 / max(img.shape[:2])
    x, y, w, h = (d * olcek for d in kutu)
    orta_y = y + h / 2
    if yan == "sol":
        x0, x1 = x - 85, x + 15
    else:
        x0, x1 = x + w - 15, x + w + 85
    y0, y1 = orta_y - 95, orta_y + 95
    x0, y0 = int(max(0, x0 / olcek)), int(max(0, y0 / olcek))
    x1, y1 = int(min(img.shape[1], x1 / olcek)), int(min(img.shape[0], y1 / olcek))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return []
    pencere = cv2.resize(img[y0:y1, x0:x1], None, fx=olcek, fy=olcek, interpolation=cv2.INTER_AREA)

    hsv = cv2.cvtColor(pencere, cv2.COLOR_BGR2HSV)
    gri = cv2.cvtColor(pencere, cv2.COLOR_BGR2GRAY)
    ust_sapka = cv2.morphologyEx(gri, cv2.MORPH_TOPHAT, np.ones((11, 11), np.uint8))
    cizgi = ((ust_sapka > 30) & (hsv[:, :, 1] < 70)).astype(np.uint8)
    cizgi = cv2.morphologyEx(cizgi, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

    sayi, etiket, istat, merkez = cv2.connectedComponentsWithStats(cizgi)
    parcalar = []
    for i in range(1, sayi):
        px, py, pw, ph, alan = istat[i]
        if 6 <= max(pw, ph) <= 45 and min(pw, ph) <= 35 and alan >= 10 and alan / (pw * ph) < 0.8:
            parcalar.append(i)
    if len(parcalar) < 2:
        return []

    en_iyi_sutun = max(
        (merkez[i][0] for i in parcalar),
        key=lambda sutun: sum(istat[j][4] for j in parcalar if abs(merkez[j][0] - sutun) < 15),
    )
    sutundakiler = sorted((i for i in parcalar if abs(merkez[i][0] - en_iyi_sutun) < 15), key=lambda i: istat[i][1])
    gruplar = [[sutundakiler[0]]]
    for i in sutundakiler[1:]:
        onceki = gruplar[-1][-1]
        if istat[i][1] - (istat[onceki][1] + istat[onceki][3]) > 22:
            gruplar.append([i])
        else:
            gruplar[-1].append(i)
    grup = max(gruplar, key=lambda g: sum(istat[i][4] for i in g))
    ust = min(istat[i][1] for i in grup)
    alt = max(istat[i][1] + istat[i][3] for i in grup)
    if len(grup) < 2 or not 35 <= alt - ust <= 150:
        return []
    maske = np.isin(etiket, grup).astype(np.uint8) * 255
    maske = cv2.morphologyEx(maske, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

    dondurulmus = cv2.rotate(maske, cv2.ROTATE_90_COUNTERCLOCKWISE)
    sayi, etiket, istat, _ = cv2.connectedComponentsWithStats(dondurulmus)
    karakterler = []
    for i in range(1, sayi):
        px, py, pw, ph, alan = istat[i]
        if ph < 12 or pw > 2.4 * ph:
            continue
        karakterler.extend(genis_karakteri_bol(px, py, pw, ph, etiket[py:py + ph, px:px + pw] == i))
    karakterler.sort(key=lambda k: k["x"])
    siniflandir(karakterler)
    return karakterler


def derinlik_rakamlari(derinlik):
    return [int(r) for r in f"{derinlik:.2f}".replace(".", "")]


def takoz_hizala(karakterler, derinlik):
    hedef = derinlik_rakamlari(derinlik)
    if not len(hedef) <= len(karakterler) <= len(hedef) + 2:
        return None
    en_iyi = None
    for bas in range(len(karakterler) - len(hedef) + 1):
        secilen = karakterler[bas:bas + len(hedef)]
        disarida = karakterler[:bas] + karakterler[bas + len(hedef):]
        puan = sum(rakam_puani(k, r) for k, r in zip(secilen, hedef))
        puan += sum(math.log(max(k["olasilik"][COP_SINIFI], 0.15)) for k in disarida)
        if en_iyi is None or puan > en_iyi[0]:
            en_iyi = (puan, [(k["maske"], r) for k, r in zip(secilen, hedef)])
    return en_iyi[1]


def takoz_ornekleri_kaydet(numune, baslangic, bitis, klasor, fotograflar):
    yol, kutu = numune.get("yol"), numune.get("kutu")
    if not yol or kutu is None:
        return 0
    if yol not in fotograflar:
        fotograflar[yol] = goruntu_oku(yol)
    img = fotograflar[yol]
    if img is None:
        return 0
    adet = 0
    for yan, derinlik in (("sol", baslangic), ("sag", bitis)):
        adet += ornekleri_yaz(takoz_hizala(takoz_karakterleri(img, kutu, yan), derinlik), klasor)
    return adet


def derinlik_satirini_oku(karakterler, uzunluk):
    rakamlar = "".join(str(k["rakam"]) for k in karakterler if k["olasilik"][COP_SINIFI] < 0.5)
    for bolum in range(3, len(rakamlar) - 2):
        ilk, ikinci = rakamlar[:bolum], rakamlar[bolum:]
        if not (3 <= len(ilk) <= 4 and 3 <= len(ikinci) <= 4):
            continue
        baslangic = int(ilk) / 100
        bitis = int(ikinci) / 100
        if abs(bitis - baslangic - uzunluk) < 0.001:
            return round(baslangic, 2), round(bitis, 2)
    return None


def boruyu_oku(img, kutu, kesin=True, yazili=True):
    sonuclar = [kirpmayi_oku(img, kutu, kesin, yazili, genis) for genis in (False, True)]
    for sonuc in sonuclar:
        sonuc["kesin"] = kesin

    def oncelik(sonuc):
        return (sonuc["tip"] == "SPT" and bool(sonuc.get("darbeler")), sonuc.get("guven", 0), "derinlik" in sonuc, sonuc["tip"] is not None)

    return max(sonuclar, key=oncelik)


def kirpmayi_oku(img, kutu, kesin, yazili, genis):
    parca, aday_kutusu = boru_parcasi(img, kutu, genis)
    parca, murekkep = murekkebi_ayir(parca, aday_kutusu)
    sonuc = {"kutu": kutu, "parca": parca, "tip": None}
    if murekkep is None:
        return sonuc
    satirlar = satirlara_ayir(karakterleri_bul(murekkep))
    for satir in satirlar:
        siniflandir(satir["karakterler"])
    sonuc["satirlar"] = [satir["karakterler"] for satir in reversed(satirlar)]
    for satir in reversed(satirlar):
        okunan = darbe_satirini_oku(satir["karakterler"])
        if kesin:
            esik = 0.4 if yazili else 0.8
        else:
            esik = 0.9
        if okunan is not None and okunan[1] >= esik:
            sonuc["tip"] = "SPT"
            sonuc["darbeler"], sonuc["guven"] = okunan
            for diger in satirlar:
                if diger is not satir:
                    derinlik = derinlik_satirini_oku(diger["karakterler"], 0.45)
                    if derinlik is not None:
                        sonuc["derinlik"] = derinlik
                        break
            return sonuc
    for satir in satirlar:
        derinlik = derinlik_satirini_oku(satir["karakterler"], 0.45)
        if derinlik is not None:
            sonuc["tip"] = "SPT"
            sonuc["derinlik"] = derinlik
            return sonuc
    if not kesin:
        return sonuc
    sonuc["ud_adayi"] = True
    if not yazili:
        return sonuc
    sonuc["tip"] = "UD"
    for satir in reversed(satirlar):
        derinlik = derinlik_satirini_oku(satir["karakterler"], 0.5)
        if derinlik is not None:
            sonuc["derinlik"] = derinlik
            break
    return sonuc


def sira_numarasi(borular):
    borular = sorted(borular, key=lambda b: b["kutu"][1] + b["kutu"][3] / 2)
    satirlar = []
    for boru in borular:
        x, y, w, h = boru["kutu"]
        merkez = y + h / 2
        if satirlar and abs(satirlar[-1][-1]["kutu"][1] + satirlar[-1][-1]["kutu"][3] / 2 - merkez) < 60:
            satirlar[-1].append(boru)
        else:
            satirlar.append([boru])
    sirali = []
    for satir in satirlar:
        sirali.extend(sorted(satir, key=lambda b: b["kutu"][0]))
    return sirali


def spt_uzunlugu(darbeler):
    for sira, darbe in enumerate(darbeler or []):
        darbe = str(darbe)
        if "/" in darbe:
            return round(0.15 * sira + int(darbe.split("/")[1]) / 100, 2)
    return 0.45


def sonraki_kat(derinlik, dahil):
    kat = math.ceil(round(derinlik / 1.5, 6)) * 1.5
    if not dahil and abs(kat - derinlik) < 0.001:
        kat += 1.5
    return round(kat, 2)


def fotograflari_oku(yollar, ilerleme=None):
    return manevralari_olustur(numuneleri_oku(yollar, ilerleme))


def numuneleri_oku(yollar, ilerleme=None):
    numuneler = []
    for sira, yol in enumerate(sorted(yollar, key=dogal_sira)):
        if ilerleme:
            ilerleme(sira, len(yollar), os.path.basename(yol))
        img = goruntu_oku(yol)
        if img is None:
            continue
        hepsi = [boruyu_oku(img, kutu, kesin, yazili) for kutu, kesin, yazili in borulari_bul(img)]
        okunanlar = tekrarlari_ayikla([o for o in hepsi if o["tip"] is not None], img.shape[0])
        sptler = [o for o in okunanlar if o["tip"] == "SPT"]
        for aday in hepsi:
            if aday["tip"] is not None or not aday.get("ud_adayi"):
                continue
            if any(kesisim_orani(aday["kutu"], o["kutu"]) > 0.25 for o in okunanlar):
                continue
            if any(yanyana(aday, spt) for spt in sptler):
                aday["tip"] = "UD"
                okunanlar.append(aday)
        okunanlar = sira_numarasi(okunanlar)
        for sira_no, okunan in enumerate(okunanlar):
            if okunan["tip"] == "UD" and "derinlik" not in okunan:
                sonraki = okunanlar[sira_no + 1] if sira_no + 1 < len(okunanlar) else None
                if not yanyana(okunan, sonraki):
                    okunan["tip"] = "SPT"
            okunan["fotograf"] = os.path.basename(yol)
            okunan["yol"] = yol
            numuneler.append(okunan)
    return numuneler


def tekrarlari_ayikla(okunanlar, goruntu_boyu):
    def oncelik(o):
        return (o.get("kesin", False), o["tip"] == "SPT", "derinlik" in o, o.get("guven", 0))

    def ayni_boru(a, b):
        if kesisim_orani(a["kutu"], b["kutu"]) > 0.25:
            return True
        ax, ay, aw, ah = a["kutu"]
        bx, by, bw, bh = b["kutu"]
        yatay = max(0, min(ax + aw, bx + bw) - max(ax, bx)) > 0.5 * min(aw, bw)
        dikey = abs((ay + ah / 2) - (by + bh / 2)) < 0.05 * goruntu_boyu
        return yatay and dikey

    kalanlar = []
    for okunan in sorted(okunanlar, key=oncelik, reverse=True):
        if not any(ayni_boru(okunan, k) for k in kalanlar):
            kalanlar.append(okunan)
    return kalanlar


def yanyana(sol, sag):
    if sag is None:
        return False
    sx, sy, sw, sh = sol["kutu"]
    gx, gy, gw, gh = sag["kutu"]
    return abs((sy + sh / 2) - (gy + gh / 2)) < 60 and 0 <= gx - (sx + sw) < 1.5 * sw


def manevralari_olustur(numuneler, baslangic_derinligi=0.0):
    satirlar = []
    derinlik = baslangic_derinligi
    onceki_tip = None
    for numune in numuneler:
        uyarilar = []
        if numune.get("elle") and "derinlik" in numune:
            baslangic, bitis = numune["derinlik"]
            if baslangic < derinlik - 0.001:
                uyarilar.append("Önceki manevrayla çakışıyor")
        elif numune["tip"] == "UD":
            tahmin_bitis = sonraki_kat(derinlik, dahil=False)
            if "derinlik" in numune:
                baslangic, bitis = numune["derinlik"]
                if abs(bitis - tahmin_bitis) > 0.001:
                    uyarilar.append(f"Etikette {bitis:.2f} okundu, 1,5 m düzenine göre {tahmin_bitis:.2f} olmalıydı")
                if baslangic < derinlik - 0.001:
                    uyarilar.append("Önceki manevrayla çakışıyor")
                    baslangic = derinlik
                    bitis = round(baslangic + 0.5, 2)
            else:
                bitis = tahmin_bitis
                baslangic = round(bitis - 0.5, 2)
                uyarilar.append("Darbe sayısı bulunamadı, UD varsayıldı; derinlik 1,5 m düzeninden çıkarıldı")
        else:
            tahmin = sonraki_kat(derinlik, dahil=(onceki_tip == "UD"))
            okunan = numune.get("derinlik")
            if okunan is not None and derinlik - 0.001 <= okunan[0] <= derinlik + 6:
                baslangic = okunan[0]
                if abs(baslangic - tahmin) > 0.001:
                    uyarilar.append(f"Etikette {baslangic:.2f} okundu, 1,5 m düzenine göre {tahmin:.2f} beklenirdi")
            else:
                if okunan is not None:
                    uyarilar.append(f"Etikette {okunan[0]:.2f} okundu ama sıraya uymuyor; 1,5 m düzeni kullanıldı")
                baslangic = tahmin
            bitis = round(baslangic + spt_uzunlugu(numune.get("darbeler")), 2)
        if numune["tip"] != "UD":
            if not any(numune.get("darbeler") or []):
                uyarilar.append("Darbe sayıları okunamadı")
            elif numune.get("guven", 1) < 0.6:
                uyarilar.append("Darbe sayıları düşük güvenle okundu")

        if baslangic - derinlik > 0.001:
            k_uyari = "Boşluk 1,5 m'den uzun, kontrol edin" if baslangic - derinlik > 1.501 else ""
            satirlar.append({"baslangic": derinlik, "bitis": baslangic, "tip": "K", "darbeler": None, "uyari": k_uyari, "numune": None})

        if numune["tip"] == "UD":
            darbeler = None
        else:
            darbeler = numune.get("darbeler") or ["", "", ""]
        satirlar.append({
            "baslangic": baslangic,
            "bitis": bitis,
            "tip": "UD" if numune["tip"] == "UD" else "SPT",
            "darbeler": darbeler,
            "uyari": "; ".join(uyarilar),
            "numune": numune,
        })
        derinlik = bitis
        onceki_tip = numune["tip"]
    return satirlar
