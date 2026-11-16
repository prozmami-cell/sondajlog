// Kısa açılış: darbe, logo oluşumu ve büyüyerek çıkış tek zaman çizelgesinde.
// Yalnızca transform ve opacity canlandırılır (donanım hızlandırmalı); bitince katman sayfadan kaldırılır.
(() => {
  const kap = document.getElementById("acilis");
  if (!kap) return;
  const $ = (ad) => document.getElementById("acilis-" + ad);
  const NS = "http://www.w3.org/2000/svg";
  const ARALIK = 70;  // şeritler arası mesafe
  const animasyonlar = [];
  let bitti = false;
  window.__acilisHazir = false;

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
    c.setAttribute("r", 4 + (i % 4) * 1.5);
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

  // Dört tam aralık sonunda şeritler logodaki desenine kilitlenir.
  function don() {
    A(seritler, [
      { transform: "translateY(0)" },
      { transform: `translateY(${-ARALIK * 3}px)`, offset: 300 / 670, easing: "cubic-bezier(.15,.65,.25,1)" },
      { transform: `translateY(${-ARALIK * 4}px)` },
    ], { delay: 80, duration: 670, easing: "linear" });
  }

  function tozSac() {
    parcaciklar.forEach((parcacik, sira) => {
      const yon = sira % 2 ? 1 : -1;
      const uzaklik = yon * (38 + Math.floor(sira / 2) * 11);
      const yukseklik = 16 + (sira % 5) * 7;
      A(parcacik, [
        { opacity: 0, transform: "translate(0,0) scale(.5)" },
        { opacity: .8, transform: `translate(${uzaklik * .25}px,${-yukseklik * .7}px) scale(1)`, offset: .15 },
        { opacity: .4, transform: `translate(${uzaklik * .75}px,${-yukseklik}px) scale(.7)`, offset: .6 },
        { opacity: 0, transform: `translate(${uzaklik}px,-4px) scale(.3)` },
      ], { delay: 380, duration: 300, easing: "linear" });
    });
  }

  function titre() {
    A($("titre"), [
      { transform: "translateX(0)" }, { transform: "translateX(-2px)" },
      { transform: "translateX(1.5px)" }, { transform: "translateX(-.7px)" },
      { transform: "translateX(0)" },
    ], { delay: 380, duration: 120, easing: "linear" });
  }

  function yazilariYerlestir() {
    try {
      const w1 = $("log").getComputedTextLength(), w2 = $("vera").getComputedTextLength();
      const x = 468 - (w1 + w2) / 2 + w1;
      $("log").setAttribute("x", x);
      $("vera").setAttribute("x", x);
    } catch (hata) { /* yazı ölçülemezse tasarımdaki konumda kalır */ }
  }

  function kapanis() {
    // zemin çizgisi kaybolur, fazla şeritler örtülür, LV çizilir, yazılar gelir, logo büyüyerek kaybolur
    A($("cizgi"), [{ opacity: 1 }, { opacity: 0 }], { delay: 380, duration: 370 });
    A($("ortu"), [{ opacity: 0 }, { opacity: 1 }], { delay: 650, duration: 130 });
    A($("ortu-ust"), [{ opacity: 0 }, { opacity: 1 }], { delay: 650, duration: 130 });
    const L = $("l");
    L.style.transformBox = "fill-box";
    L.style.transformOrigin = "top";
    A(L, [{ opacity: 1, transform: "scaleY(0)" }, { opacity: 1, transform: "scaleY(1)" }],
      { delay: 680, duration: 240, easing: "cubic-bezier(.3,.7,.3,1)" });
    const S3 = $("serit3");
    S3.style.transformBox = "fill-box";
    S3.style.transformOrigin = "left";
    A(S3, [{ opacity: 1, transform: "scaleX(0)" }, { opacity: 1, transform: "scaleX(1)" }],
      { delay: 730, duration: 200, easing: "cubic-bezier(.3,.7,.3,1)" });
    const V = $("v");
    V.style.transformBox = "fill-box";
    V.style.transformOrigin = "center";
    A(V, [
      { opacity: 0, transform: "scale(.3)" },
      { opacity: 1, transform: "scale(1.06)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" },
    ], { delay: 760, duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });

    A($("log"), [{ opacity: 0, transform: "translateX(-32px)" }, { opacity: 1, transform: "translateX(0)" }],
      { delay: 800, duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    A($("vera"), [{ opacity: 0, transform: "translateX(32px)" }, { opacity: 1, transform: "translateX(0)" }],
      { delay: 820, duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });

    // büyüme logonun gövdesine doğru olsun
    const z = $("zoom"), alan = z.getBoundingClientRect();
    const merkez = new DOMPoint(469, 280).matrixTransform(kap.querySelector("svg").getScreenCTM());
    z.style.transformOrigin = `${merkez.x - alan.left}px ${merkez.y - alan.top}px`;
    const buyume = A(z, [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(5)", opacity: 0 },
    ], { delay: 1200, duration: 400, easing: "cubic-bezier(.5,0,.75,.25)" });
    // tasarımda ana ekranın belirdiği an: beyaz zemin çekilir, alttaki ana ekran görünür
    const zemin = A($("zemin"), [{ opacity: 1 }, { opacity: 0 }], { delay: 1350, duration: 300 });
    return Promise.all([buyume.finished, zemin.finished]);
  }

  function oynat() {
    if (bitti) return;
    yazilariYerlestir();
    // Çizgi merkezden açılır; matkap darbe anına kadar hızlanır.
    $("cizgi").style.transformOrigin = "468px 466px";
    A($("cizgi"), [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: 200, easing: "cubic-bezier(.2,.7,.3,1)" });
    A($("matkap"), [
      { transform: "translateY(-700px)", offset: 0, easing: "cubic-bezier(.42,0,1,1)" },
      { transform: "translateY(16px)", offset: 300 / 670, easing: "cubic-bezier(0,0,.3,1)" },
      { transform: "translateY(40px)", offset: 390 / 670, easing: "cubic-bezier(.3,0,.2,1)" },
      { transform: "translateY(-4px)", offset: 560 / 670, easing: "ease-out" },
      { transform: "translateY(0)" },
    ], { delay: 80, duration: 670, easing: "linear" });
    titre();
    tozSac();
    don();
    const tamamlanma = kapanis();
    // Tüm efektler hazır; kare üreticisi artık zamanı doğrudan atayabilir.
    window.__acilisSure = 1600;
    window.__acilisHazir = true;
    return tamamlanma;
  }

  function bitir() {
    if (bitti) return;
    bitti = true;
    kap.removeEventListener("pointerdown", bitir);
    animasyonlar.forEach((animasyon) => animasyon.cancel());
    kap.remove();
  }

  kap.addEventListener("pointerdown", bitir, { once: true });

  // hareket azaltma tercihi açıksa ya da tarayıcı Web Animations desteklemiyorsa doğrudan ana ekran
  if (!kap.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    bitir();
    return;
  }
  // "Log"/"vera" doğru genişlikte yerleşsin diye yazı tipi beklenir (en çok 1 sn)
  const yaziTipi = document.fonts && document.fonts.load ? document.fonts.load('800 122px "Poppins"').catch(() => {}) : Promise.resolve();
  // Yazı tipi bekleme sınırı da WAAPI ile tutulur; zamanlayıcı gerekmez.
  const bekleme = kap.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1000 });
  animasyonlar.push(bekleme);
  Promise.race([yaziTipi, bekleme.finished])
    .then(() => { bekleme.cancel(); return oynat(); })
    .catch(() => {})
    .then(bitir);
})();
