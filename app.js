// ----------------------------
// Veri setleri
// ----------------------------

// Basit bir ion listesi
const positiveIons = [
  { id: "Na+", label: "Na⁺ (Sodyum)", charge: +1 },
  { id: "K+", label: "K⁺ (Potasyum)", charge: +1 },
  { id: "Ca2+", label: "Ca²⁺ (Kalsiyum)", charge: +2 },
];

const negativeIons = [
  { id: "Cl-", label: "Cl⁻ (Klor)", charge: -1 },
  { id: "F-", label: "F⁻ (Flor)", charge: -1 },
  { id: "O2-", label: "O²⁻ (Oksit)", charge: -2 },
];

// Parametre setleri (tam fiziksel değerler değil, örnek/ödev amaçlı)
const paramSets = {
  // NaCl için iki farklı örgü senaryosu
  "Na+_Cl-": {
    BCC: { A: 12.0, B: 9500.0, n: 9, R0Suggestion: 3.0 },
    FCC: { A: 14.0, B: 11000.0, n: 9, R0Suggestion: 2.8 },
  },
  "K+_Cl-": {
    BCC: { A: 11.0, B: 9000.0, n: 9, R0Suggestion: 3.2 },
    FCC: { A: 13.0, B: 10500.0, n: 9, R0Suggestion: 3.0 },
  },
  "Ca2+_O2-": {
    BCC: { A: 20.0, B: 20000.0, n: 10, R0Suggestion: 2.4 },
    FCC: { A: 22.0, B: 23000.0, n: 10, R0Suggestion: 2.3 },
  },
};

// Parametre bulunamazsa kullanılacak genel set
const defaultParams = {
  BCC: { A: 10.0, B: 9000.0, n: 9, R0Suggestion: 3.0 },
  FCC: { A: 11.0, B: 9500.0, n: 9, R0Suggestion: 3.0 },
};

// Global state benzeri
let currentParams = { A: null, B: null, n: null };
let currentScale = { minR: 1, maxR: 5 };
let animationTimer = null;

// ----------------------------
// Yardımcı fonksiyonlar
// ----------------------------

function $(id) {
  return document.getElementById(id);
}

function initSelects() {
  const posSelect = $("positive-ion");
  const negSelect = $("negative-ion");

  positiveIons.forEach((ion) => {
    const opt = document.createElement("option");
    opt.value = ion.id;
    opt.textContent = ion.label;
    posSelect.appendChild(opt);
  });

  negativeIons.forEach((ion) => {
    const opt = document.createElement("option");
    opt.value = ion.id;
    opt.textContent = ion.label;
    negSelect.appendChild(opt);
  });

  // Varsayılan seçimler
  posSelect.value = "Na+";
  negSelect.value = "Cl-";
}

function getParamsForSelection() {
  const pos = $("positive-ion").value;
  const neg = $("negative-ion").value;
  const lattice = $("lattice-type").value;
  const key = `${pos}_${neg}`;

  let selected;
  if (paramSets[key] && paramSets[key][lattice]) {
    selected = paramSets[key][lattice];
  } else {
    selected = defaultParams[lattice];
  }

  currentParams = {
    A: selected.A,
    B: selected.B,
    n: selected.n,
  };

  $("param-A").textContent = selected.A.toFixed(2);
  $("param-B").textContent = selected.B.toFixed(2);
  $("param-n").textContent = selected.n.toFixed(0);

  return selected;
}

// Newton için f(R) ve türevi
function fR(R, A, B, n) {
  return A / (R * R) - (n * B) / Math.pow(R, n + 1);
}

function fRprime(R, A, B, n) {
  return (-2 * A) / Math.pow(R, 3) + (n * (n + 1) * B) / Math.pow(R, n + 2);
}

// Newton iterasyonunu hesapla
function computeNewtonIterations(A, B, n, R0, maxIter, tol) {
  const results = [];
  let R = R0;

  for (let i = 0; i < maxIter; i++) {
    const f = fR(R, A, B, n);
    const fp = fRprime(R, A, B, n);

    if (!isFinite(fp) || Math.abs(fp) < 1e-14) {
      results.push({
        i,
        R,
        Rnext: R,
        error: NaN,
        note: "Türev çok küçük / sıfıra yakın, iterasyon durduruldu.",
      });
      document.getElementById("cookie-popup").classList.add("active");
      break;
    }

    const Rnext = R - f / fp;
    const error = Math.abs(Rnext - R);

    results.push({
      i,
      R,
      Rnext,
      error,
    });

    if (!isFinite(Rnext) || Rnext <= 0) {
      results.push({
        i: i + 1,
        R: Rnext,
        Rnext: Rnext,
        error: NaN,
        note: "R negatif veya sonsuz oldu, iterasyon durduruldu.",
      });
      document.getElementById("cookie-popup").classList.add("active");
      break;
    }

    if (error < tol) {
      // Son iterasyonu da ekle
      results.push({
        i: i + 1,
        R: Rnext,
        Rnext: Rnext,
        error: 0,
        note: "Hata eşiğinin altına inildi, yakınsama sağlandı.",
      });
      break;
    }

    R = Rnext;
  }

  return results;
}

// Bisection (yarılama) yöntemi
function computeBisectionIterations(A, B, n, a, b, maxIter, tol) {
  const results = [];
  let fa = fR(a, A, B, n);
  let fb = fR(b, A, B, n);

  if (fa * fb > 0) {
    results.push({
      i: 0,
      R: NaN,
      Rnext: NaN,
      error: NaN,
      note: "Bisection için f(a) ve f(b) zıt işaretli olmalı (fa * fb < 0).",
    });
    document.getElementById("cookie-popup").classList.add("active");
    return results;
  }

  let mid = (a + b) / 2;

  for (let i = 0; i < maxIter; i++) {
    const fmid = fR(mid, A, B, n);

    // Bir adım önceki mid
    const oldMid = mid;

    // Hangi tarafa gideceğiz?
    if (fa * fmid < 0) {
      // kök [a, mid] aralığında
      b = mid;
      fb = fmid;
    } else {
      // kök [mid, b] aralığında
      a = mid;
      fa = fmid;
    }

    mid = (a + b) / 2;
    const error = Math.abs(mid - oldMid);

    results.push({
      i,
      R: oldMid,
      Rnext: mid,
      error,
    });

    if (error < tol) {
      results.push({
        i: i + 1,
        R: mid,
        Rnext: mid,
        error: 0,
        note: "Hata eşiğinin altına inildi, yakınsama sağlandı (bisection).",
      });
      break;
    }
  }

  return results;
}

// Kirişler yöntemi (Secant)
function computeSecantIterations(A, B, n, R0, R1, maxIter, tol) {
  const results = [];
  let x0 = R0;
  let x1 = R1;

  for (let i = 0; i < maxIter; i++) {
    const f0 = fR(x0, A, B, n);
    const f1 = fR(x1, A, B, n);

    const denom = f1 - f0;
    if (!isFinite(denom) || Math.abs(denom) < 1e-14) {
      results.push({
        i,
        R: x1,
        Rnext: x1,
        error: NaN,
        note: "Secant yönteminde payda çok küçük, iterasyon durduruldu.",
      });
      document.getElementById("cookie-popup").classList.add("active");
      break;
    }

    const x2 = x1 - (f1 * (x1 - x0)) / denom;
    const error = Math.abs(x2 - x1);

    results.push({
      i,
      R: x1,
      Rnext: x2,
      error,
    });

    if (!isFinite(x2) || x2 <= 0) {
      results.push({
        i: i + 1,
        R: x2,
        Rnext: x2,
        error: NaN,
        note: "R negatif veya sonsuz oldu, iterasyon durduruldu (secant).",
      });
      document.getElementById("cookie-popup").classList.add("active");
      break;
    }

    if (error < tol) {
      results.push({
        i: i + 1,
        R: x2,
        Rnext: x2,
        error: 0,
        note: "Hata eşiğinin altına inildi, yakınsama sağlandı (secant).",
      });
      break;
    }

    x0 = x1;
    x1 = x2;
  }

  return results;
}

// İterasyon log'unu yaz
function renderIterationLog(results) {
  if (!results.length) {
    $("iteration-log").textContent = "(sonuç yok)";
    return;
  }

  let lines = [];
  lines.push("i\t|R_i\t\t|R_{i+1}\t|ε");
  lines.push("-------------------------------------------");

  results.forEach((step) => {
    const Ri = step.R;
    const Rnext = step.Rnext;
    const err = step.error;
    const base =
      step.i +
      "\t|" +
      (Ri != null && isFinite(Ri) ? Ri.toFixed(5) : "NaN") +
      "\t|" +
      (Rnext != null && isFinite(Rnext) ? Rnext.toFixed(5) : "NaN") +
      "\t|" +
      (err != null && isFinite(err) ? err.toExponential(3) : "NaN");
    lines.push(base);
    if (step.note) {
      lines.push("\n" + step.note);
    }
  });

  $("iteration-log").textContent = lines.join("\n");
}

// R değerlerini görselleştirmek için ölçek
function updateScaleFromResults(results) {
  const allR = [];
  results.forEach((step) => {
    if (isFinite(step.R)) allR.push(step.R);
    if (isFinite(step.Rnext)) allR.push(step.Rnext);
  });

  if (!allR.length) {
    currentScale = { minR: 1, maxR: 5 };
    return;
  }

  let minR = Math.min(...allR);
  let maxR = Math.max(...allR);

  if (minR === maxR) {
    // Hepsi aynıysa küçük bir aralık aç
    minR *= 0.9;
    maxR *= 1.1;
  }

  currentScale = { minR, maxR };
}

// R'yi piksel mesafeye çevir
function mapRToPixels(R, visualWidth) {
  const { minR, maxR } = currentScale;
  const range = maxR - minR || 1;
  // Mesafeyi kutunun %15 ile %70'i arasında tut
  const minPx = visualWidth * 0.18;
  const maxPx = visualWidth * 0.7;
  const t = (R - minR) / range; // 0-1
  return minPx + t * (maxPx - minPx);
}

// Ana iyon çifti pozisyonlarını güncelle
function updateMainPairDistance(RValue) {
  const box = $("visual-box");
  const rect = box.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const centerX = width / 2;
  const centerY = height / 2;

  const distancePx = mapRToPixels(RValue, width);

  const leftX = centerX - distancePx / 2;
  const rightX = centerX + distancePx / 2;

  const posIonEl = $("ion-positive-main");
  const negIonEl = $("ion-negative-main");
  const bondLineEl = $("bond-line");

  posIonEl.style.left = leftX + "px";
  posIonEl.style.top = centerY + "px";

  negIonEl.style.left = rightX + "px";
  negIonEl.style.top = centerY + "px";

  bondLineEl.style.left = leftX + "px";
  bondLineEl.style.top = centerY + "px";
  bondLineEl.style.width = distancePx + "px";

  $("current-R").textContent = RValue.toFixed(4);
}

// Lattice arka plan iyonları
function renderLatticeBackground() {
  const container = $("lattice-background");
  container.innerHTML = "";

  const pos = $("positive-ion").value;
  const neg = $("negative-ion").value;
  const lattice = $("lattice-type").value;

  const isBCC = lattice === "BCC";

  if (isBCC) {
    // 8 köşede pozitif, ortada 1 negatif
    const corners = [
      { x: 12, y: 12 },
      { x: 50, y: 12 },
      { x: 88, y: 12 },
      { x: 12, y: 50 },
      { x: 88, y: 50 },
      { x: 12, y: 88 },
      { x: 50, y: 88 },
      { x: 88, y: 88 },
    ];

    corners.forEach((c) => {
      const el = document.createElement("div");
      el.className = "lattice-ion lattice-positive";
      el.style.left = c.x + "%";
      el.style.top = c.y + "%";
      el.textContent = pos;
      container.appendChild(el);
    });

    // Merkez negatif
    const center = document.createElement("div");
    center.className = "lattice-ion lattice-negative";
    center.style.left = "50%";
    center.style.top = "50%";
    center.textContent = neg;
    container.appendChild(center);
  } else {
    // FCC için: 4 köşede pozitif, 4 yüz merkezinde negatif (basit görsel)
    const posCoords = [
      { x: 12, y: 12 },
      { x: 88, y: 12 },
      { x: 12, y: 88 },
      { x: 88, y: 88 },
    ];
    const negCoords = [
      { x: 50, y: 12 },
      { x: 12, y: 50 },
      { x: 88, y: 50 },
      { x: 50, y: 88 },
    ];

    posCoords.forEach((c) => {
      const el = document.createElement("div");
      el.className = "lattice-ion lattice-positive";
      el.style.left = c.x + "%";
      el.style.top = c.y + "%";
      el.textContent = pos;
      container.appendChild(el);
    });

    negCoords.forEach((c) => {
      const el = document.createElement("div");
      el.className = "lattice-ion lattice-negative";
      el.style.left = c.x + "%";
      el.style.top = c.y + "%";
      el.textContent = neg;
      container.appendChild(el);
    });
  }
}

// Ana iyon etiketlerini (iç yazılarını) güncelle
function updateMainIonLabels() {
  const pos = $("positive-ion").value;
  const neg = $("negative-ion").value;
  $("ion-positive-main").textContent = pos;
  $("ion-negative-main").textContent = neg;
}

// İterasyon animasyonu
function animateIterations(results) {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  if (!results.length) return;

  updateScaleFromResults(results);

  let idx = 0;
  animationTimer = setInterval(() => {
    if (idx >= results.length) {
      clearInterval(animationTimer);
      animationTimer = null;
      return;
    }
    const step = results[idx];
    const Rval = isFinite(step.Rnext) ? step.Rnext : step.R;
    if (isFinite(Rval)) {
      updateMainPairDistance(Rval);
    }
    idx++;
  }, 700);
}

// Başlangıç R önerisini input'a yaz
function applySuggestedR() {
  const selected = getParamsForSelection();
  $("initial-R").value = selected.R0Suggestion.toFixed(2);
}

// Sıfırlama
function resetView() {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  $("iteration-log").textContent = "(henüz çalıştırılmadı)";
  $("current-R").textContent = "–";
  const box = $("visual-box");
  const rect = box.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const centerX = width / 2;
  const centerY = height / 2;

  const posIonEl = $("ion-positive-main");
  const negIonEl = $("ion-negative-main");
  const bondLineEl = $("bond-line");

  posIonEl.style.left = centerX - 60 + "px";
  posIonEl.style.top = centerY + "px";

  negIonEl.style.left = centerX + 60 + "px";
  negIonEl.style.top = centerY + "px";

  bondLineEl.style.left = centerX - 60 + "px";
  bondLineEl.style.top = centerY + "px";
  bondLineEl.style.width = 120 + "px";
}

// ----------------------------
// Event binding & init
// ----------------------------

document.addEventListener("DOMContentLoaded", () => {
  initSelects();
  getParamsForSelection();
  renderLatticeBackground();
  updateMainIonLabels();
  resetView();
  document.querySelector(".cookie-close").addEventListener("click", () => {
    document.getElementById("cookie-popup").classList.remove("active");
  });
  document.querySelector(".accept").addEventListener("click", () => {
    document.getElementById("cookie-popup").classList.remove("active");
  });

  $("positive-ion").addEventListener("change", () => {
    getParamsForSelection();
    renderLatticeBackground();
    updateMainIonLabels();
  });

  $("negative-ion").addEventListener("change", () => {
    getParamsForSelection();
    renderLatticeBackground();
    updateMainIonLabels();
  });

  $("lattice-type").addEventListener("change", () => {
    getParamsForSelection();
    renderLatticeBackground();
  });

  $("suggest-R").addEventListener("click", () => {
    applySuggestedR();
  });

  $("run-iterations").addEventListener("click", () => {
    const selected = getParamsForSelection();
    const method = $("method-select").value;

    const maxIter = parseInt($("max-iter").value, 10) || 10;
    const tol = parseFloat($("tolerance").value) || 0.0001;

    let results = [];

    if (method === "newton") {
      // Newton: kullanıcıdan R0 al
      let R0 = parseFloat($("initial-R").value);
      if (!isFinite(R0) || R0 <= 0) {
        alert(
          "Newton için geçerli bir başlangıç uzaklığı R₀ girin (örn. 3.0)."
        );
        return;
      }

      results = computeNewtonIterations(
        selected.A,
        selected.B,
        selected.n,
        R0,
        maxIter,
        tol
      );
    } else if (method === "bisection") {
      let RstarGuess = parseFloat($("initial-R").value);
      if (!isFinite(RstarGuess) || RstarGuess <= 0) {
        alert(
          "bisection için geçerli bir başlangıç uzaklığı R₀ girin (örn. 3.0)."
        );
        return;
      }
      const a = RstarGuess * 0.5;
      const b = RstarGuess * 1.5;

      results = computeBisectionIterations(
        selected.A,
        selected.B,
        selected.n,
        a,
        b,
        maxIter,
        tol
      );
    } else if (method === "secant") {
      // Secant: R0 input, R1 otomatik biraz farklı
      let R0 = parseFloat($("initial-R").value);
      if (!isFinite(R0) || R0 <= 0) {
        R0 = (selected.R0Suggestion || 3.0) * 0.9;
      }
      const R1 = R0 * 1.1; // R0'ın %10 uzağında ikinci tahmin

      results = computeSecantIterations(
        selected.A,
        selected.B,
        selected.n,
        R0,
        R1,
        maxIter,
        tol
      );
    }

    renderIterationLog(results);
    animateIterations(results);
  });

  $("reset-view").addEventListener("click", () => {
    resetView();
  });

  // Pencere boyutu değişince görseli güncellemek için
  window.addEventListener("resize", () => {
    // Son R değerini korumak istersen, burada okuyup tekrar çizebilirsin
  });
});
