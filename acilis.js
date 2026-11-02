// Açılış animasyonu: design/logvera-splash.html'deki "1. Fikir: Delip çıkan uç" ile aynı çizimler ve zamanlama.
// Yalnızca transform ve opacity canlandırılır (donanım hızlandırmalı); bitince katman sayfadan kaldırılır.
(() => {
  const kap = document.getElementById("acilis");
  if (!kap) return;
  const $ = (ad) => document.getElementById("acilis-" + ad);
  const NS = "http://www.w3.org/2000/svg";
  const ARALIK = 70;  // şeritler arası mesafe
  const animasyonlar = [];

  // şeritler (dönme sırasında yukarı kayarlar)
  const seritler = $("seritler");
  for (let k = -2; k < 32; k++) {
    const y = 192 + k * ARALIK;
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", `M370 ${y} C430 ${y} 500 ${y - 22} 566 ${y - 40} L566 ${y - 25} C500 ${y - 7} 430 ${y + 15} 370 ${y + 15} Z`);
    p.setAttribute("fill", "#ffffff");
    seritler.appendChild(p);
  }

  // toz parçacıkları
  const toz = $("toz"), parcaciklar = [];
  for (let i = 0; i < 14; i++) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", 468);
    c.setAttribute("cy", 464);
    c.setAttribute("r", 4 + Math.random() * 5);
    c.setAttribute("fill", i % 3 ? "#b9c6e6" : "#8fa6e8");
    c.style.opacity = 0;
    toz.appendChild(c);
    parcaciklar.push(c);
  }

  function A(el, kareler, secenekler) {
    const a = el.animate(kareler, Object.assign({ fill: "both", easing: "ease-out" }, secenekler));
    animasyonlar.push(a);
    return a;
  }

  // Dönme: hızlan, sabit, yavaşla. Toplam kayma ARALIK'ın katı olur ki şeritler logodaki konumunda dursun.
  function don(gecikme, toplam, yavaslama) {
    const N = 60, hizlanma = 250, hiz = [];
    for (let i = 0; i <= N; i++) {
      const t = toplam * i / N;
      let s = 1;
      if (t < hizlanma) s = t / hizlanma;
      if (t > yavaslama) s = Math.max(0, 1 - (t - yavaslama) / (toplam - yavaslama));
      hiz.push(s * s * (3 - 2 * s) || (s > 0 ? s : 0));
    }
    const yol = [0];
    for (let i = 1; i <= N; i++) yol.push(yol[i - 1] + (hiz[i] + hiz[i - 1]) / 2);
    const hedef = toplam / 1000 * 520;  // ~520 birim/sn kayma
    const tur = Math.max(1, Math.round(hedef / ARALIK));
    const olcek = tur * ARALIK / yol[N];
    const kareler = yol.map((x, i) => ({ transform: `translateY(${-x * olcek}px)`, offset: i / N }));
    A(seritler, kareler, { delay: gecikme, duration: toplam, easing: "linear" });
  }

  function tozSac(gecikme, adet) {
    parcaciklar.forEach((c, i) => {
      const dx = (Math.random() * 2 - 1) * 90;
      const dy = -(10 + Math.random() * 40);
      for (let b = 0; b < adet; b++) {
        A(c, [
          { opacity: 0, transform: "translate(0,0) scale(.6)" },
          { opacity: 0.9, transform: `translate(${dx * 0.3}px,${dy * 0.5}px) scale(1)`, offset: 0.25 },
          { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.4)` },
        ], { delay: gecikme + b * 260 + i * 18, duration: 520, fill: "none", easing: "cubic-bezier(.2,.7,.3,1)" });
      }
    });
  }

  function titre(gecikme, sure) {
    A($("titre"), [
      { transform: "translateX(0)" }, { transform: "translateX(-2.5px)" },
      { transform: "translateX(2.5px)" }, { transform: "translateX(0)" },
    ], { delay: gecikme, duration: 90, iterations: Math.round(sure / 90), fill: "none", easing: "linear" });
  }

  function yazilariYerlestir() {
    try {
      const w1 = $("log").getComputedTextLength(), w2 = $("vera").getComputedTextLength();
      const x = 468 - (w1 + w2) / 2 + w1;
      $("log").setAttribute("x", x);
      $("vera").setAttribute("x", x);
    } catch (hata) { /* yazı ölçülemezse tasarımdaki konumda kalır */ }
  }

  function kapanis(t) {
    // zemin çizgisi kaybolur, fazla şeritler örtülür, LV çizilir, yazılar gelir, logo büyüyerek kaybolur
    A($("cizgi"), [{ opacity: 1 }, { opacity: 0 }], { delay: t.zeminSonu, duration: 300 });
    A($("ortu"), [{ opacity: 0 }, { opacity: 1 }], { delay: t.lv - 150, duration: 300 });
    A($("ortu-ust"), [{ opacity: 0 }, { opacity: 1 }], { delay: t.lv - 150, duration: 300 });
    const L = $("l");
    L.style.transformBox = "fill-box";
    L.style.transformOrigin = "top";
    A(L, [{ opacity: 1, transform: "scaleY(0)" }, { opacity: 1, transform: "scaleY(1)" }],
      { delay: t.lv, duration: 450, easing: "cubic-bezier(.3,.7,.3,1)" });
    const S3 = $("serit3");
    S3.style.transformBox = "fill-box";
    S3.style.transformOrigin = "left";
    A(S3, [{ opacity: 1, transform: "scaleX(0)" }, { opacity: 1, transform: "scaleX(1)" }],
      { delay: t.lv + 250, duration: 350, easing: "cubic-bezier(.3,.7,.3,1)" });
    const V = $("v");
    V.style.transformBox = "fill-box";
    V.style.transformOrigin = "center";
    A(V, [
      { opacity: 0, transform: "scale(.3)" },
      { opacity: 1, transform: "scale(1.15)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" },
    ], { delay: t.lv + 400, duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });

    A($("log"), [{ opacity: 0, transform: "translateX(-70px)" }, { opacity: 1, transform: "translateX(0)" }],
      { delay: t.yazilar + 100, duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" });
    A($("vera"), [{ opacity: 0, transform: "translateX(70px)" }, { opacity: 1, transform: "translateX(0)" }],
      { delay: t.yazilar + 160, duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" });

    // büyüme logonun gövdesine doğru olsun
    const z = $("zoom"), zr = z.getBoundingClientRect(), br = $("titre").getBoundingClientRect();
    z.style.transformOrigin = `${br.left + br.width / 2 - zr.left}px ${br.top + br.height * 0.55 - zr.top}px`;
    const buyume = A(z, [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(0.94)", opacity: 1, offset: 0.2 },
      { transform: "scale(5)", opacity: 0 },
    ], { delay: t.zoom, duration: 700, easing: "cubic-bezier(.5,0,.75,.25)" });
    // tasarımda ana ekranın belirdiği an: beyaz zemin çekilir, alttaki ana ekran görünür
    const zemin = A($("zemin"), [{ opacity: 1 }, { opacity: 0 }], { delay: t.zoom + 450, duration: 400 });
    return Promise.all([buyume.finished, zemin.finished]);
  }

  function oynat() {
    yazilariYerlestir();
    A($("cizgi"), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { delay: 0, duration: 350 });
    // yukarıdan dönerek iner, zemini deler, hafifçe zıplayıp yerine oturur
    A($("matkap"), [
      { transform: "translateY(-700px)", offset: 0, easing: "cubic-bezier(.2,.7,.3,1)" },
      { transform: "translateY(0px)", offset: 0.32, easing: "ease-in-out" },
      { transform: "translateY(40px)", offset: 0.7, easing: "cubic-bezier(.3,0,.2,1)" },
      { transform: "translateY(-8px)", offset: 0.9, easing: "ease-out" },
      { transform: "translateY(0px)", offset: 1 },
    ], { delay: 200, duration: 2100 });
    titre(870, 800);
    tozSac(900, 3);
    don(200, 2500, 1500);
    return kapanis({ zeminSonu: 2200, lv: 2550, yazilar: 3050, zoom: 3950 });
  }

  function bitir() {
    animasyonlar.forEach((a) => a.cancel());
    kap.remove();
  }

  // hareket azaltma tercihi açıksa ya da tarayıcı Web Animations desteklemiyorsa doğrudan ana ekran
  if (!kap.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    bitir();
    return;
  }
  // "Log"/"vera" doğru genişlikte yerleşsin diye yazı tipi beklenir (en çok 1 sn)
  const yaziTipi = document.fonts && document.fonts.load ? document.fonts.load('800 122px "Poppins"').catch(() => {}) : Promise.resolve();
  Promise.race([yaziTipi, new Promise((coz) => setTimeout(coz, 1000))])
    .then(oynat)
    .catch(() => {})
    .then(bitir);
})();
