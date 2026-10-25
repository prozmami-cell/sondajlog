"""Telefonda gorsel_okuma.py'yi değiştirmeden çalıştırmak için köprü."""
import json
import numpy as np
import js
from pyodide.ffi import to_js
import gorsel_okuma

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
    alanlar = ("tip", "darbeler", "guven", "kutu", "derinlik", "kesin", "fotograf", "yol")
    return json.dumps([{a: n[a] for a in alanlar if a in n} for n in numuneler], default=_sade)


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
