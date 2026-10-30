"""Telefonda gorsel_okuma.py ve karot_olcum.py'yi değiştirmeden çalıştırmak için köprü."""
import json
import cv2
import numpy as np
import js
from pyodide.ffi import to_js
import gorsel_okuma
import karot_olcum

resimler = {}
gorsel_okuma.goruntu_oku = lambda yol: resimler.get(yol)


class JsAgi:
    """Rakam ağını telefonda rakam_agi.js ile çalıştırır (cv2.dnn ile aynı arayüz)."""

    def setInput(self, girdi):
        self.girdi = np.ascontiguousarray(girdi, np.float32)

    def forward(self):
        adet = len(self.girdi)
        cikis = js.rakamAgi(to_js(self.girdi.ravel()), adet)
        return np.frombuffer(cikis.to_py(), np.float32).reshape(adet, 11).copy()


_agi = JsAgi()
gorsel_okuma.modeli_yukle = lambda: _agi


def _sade(deger):
    if hasattr(deger, "item"):
        return deger.item()
    raise TypeError(type(deger).__name__)


def resim_ekle(ad, piksel, genislik, yukseklik):
    rgba = np.asarray(piksel.to_py(), np.uint8).reshape(yukseklik, genislik, 4)
    resimler[ad] = np.ascontiguousarray(rgba[:, :, 2::-1])


def resimleri_bosalt():
    resimler.clear()


def numuneleri_oku(adlar):
    def ilerleme(sira, toplam, ad):
        js.postMessage(json.dumps({"tur": "ilerleme", "sira": sira, "toplam": toplam, "ad": ad}))

    numuneler = gorsel_okuma.numuneleri_oku(list(adlar), ilerleme)
    alanlar = ("tip", "darbeler", "guven", "kutu", "alan", "takoz", "takozdan", "derinlik", "kesin", "fotograf", "yol")
    return json.dumps([{a: n[a] for a in alanlar if a in n} for n in numuneler], default=_sade, allow_nan=False)


def manevralar(numuneler_json, baslangic):
    numuneler = json.loads(numuneler_json)
    for sira, numune in enumerate(numuneler):
        numune["sira"] = sira
        if numune.get("derinlik") is not None:
            numune["derinlik"] = tuple(numune["derinlik"])
    satirlar = gorsel_okuma.manevralari_olustur(numuneler, baslangic)
    for satir in satirlar:
        satir["numune"] = None if satir["numune"] is None else satir["numune"]["sira"]
    return json.dumps(satirlar, default=_sade)


def spt_uzunlugu(darbeler_json):
    return gorsel_okuma.spt_uzunlugu(json.loads(darbeler_json))


# ---------- karot ölçümü ----------
karot = {"img": None, "ton": None, "pikseller": []}


def karot_resmi(piksel, genislik, yukseklik):
    rgba = np.asarray(piksel.to_py(), np.uint8).reshape(yukseklik, genislik, 4)
    karot["img"] = np.ascontiguousarray(rgba[:, :, 2::-1])
    karot["ton"] = karot_olcum.baskin_ton(karot["img"])


def karot_seritleri(istek_json):
    """Başlangıç ile bitiş arasındaki şeritler ve önerilen parçaları; şerit pikselleri ayrıca alınır."""
    istek = json.loads(istek_json)
    diziler = istek["diziler"]
    sonuc, karot["pikseller"] = [], []
    for s, c0, c1 in karot_olcum.aralik_parcalari(diziler, tuple(istek["baslangic"]), tuple(istek["bitis"])):
        serit = karot_olcum.serit_cikar(karot["img"], diziler[s], c0, c1)
        sonuc.append({"sira": s, "c0": c0, "c1": c1, "genislik": serit.shape[1], "yukseklik": serit.shape[0],
                      "oneri": karot_olcum.serit_oner(serit, karot["ton"])})
        karot["pikseller"].append(cv2.cvtColor(serit, cv2.COLOR_BGR2RGBA))
    return json.dumps(sonuc, default=_sade)


def karot_serit_pikseli(sira):
    return to_js(np.ascontiguousarray(karot["pikseller"][sira]).ravel())
