import {
  ALPHABET,
  CONJUGATION_EXAMPLE,
  HABER_TABLE,
  MATH_FOLLOWUP_QUESTIONS,
  MATH_KEY_VERBS,
  MATH_PROBLEMS,
  PAST_QUESTIONS,
  PAST_SECTIONS,
  RESULT_TIERS,
  SECRET_WORD,
  SECRET_WORD_INFO,
  VERB_ENDINGS_TABLE,
  WHEEL_SECTORS,
} from "./data.js";

const OPTION_LETTERS = ["A", "B", "C", "D"];

// -----------------------------
// Sound & Speech Utilities
// -----------------------------
let audioCtx = null;
let wheelAnimationId = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

function playTone(freq, duration, type = "sine", volume = 0.08, delay = 0) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch {
    // Audio playback optional
  }
}

function playWheelTickSound() {
  playTone(740, 0.032, "triangle", 0.055, 0);
}

function playWheelStopSound() {
  playTone(587.33, 0.12, "triangle", 0.08, 0);
  playTone(880, 0.18, "triangle", 0.085, 0.08);
}

function playCorrectSound() {
  playTone(523.25, 0.14, "triangle", 0.09, 0);
  playTone(659.25, 0.18, "triangle", 0.09, 0.09);
}

function playWrongSound() {
  playTone(240, 0.18, "sine", 0.07, 0);
  playTone(195, 0.22, "sine", 0.06, 0.11);
}

function playLetterHitSound() {
  playTone(587.33, 0.12, "triangle", 0.09, 0);
  playTone(783.99, 0.16, "triangle", 0.09, 0.08);
  playTone(1046.5, 0.24, "triangle", 0.08, 0.16);
}

function playLetterMissSound() {
  playTone(310, 0.14, "sine", 0.06, 0);
}

function playVictorySound() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, idx) => {
    playTone(n, 0.22, "triangle", 0.09, idx * 0.1);
  });
}

function speakSpanish(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 0.92;
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("es-es")) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis optional
  }
}

// -----------------------------
// Application State
// -----------------------------
function createInitialState() {
  return {
    activeTab: "past", // 'past' | 'math' | 'grammar'
    soundEnabled: true,
    openTranslations: new Set(),

    // Game 1: Поле чудес (Past Tenses + Wheel)
    past: {
      currentIndex: 0,
      selectedOption: null,
      isAnswered: false,
      awaitingLetterPick: false,
      lastLetterResult: null,
      guessedLetters: [],
      correctCount: 0,
      answeredCount: 0,
      finished: false,
      showGrammarPeek: false,

      // Wheel state
      wheelAngle: 0.15,
      isSpinning: false,
      wheelSpunThisTurn: false,
      currentSector: null, // sector object from WHEEL_SECTORS
      wheelPoints: 0,
      lastAwardedPoints: 0,
    },

    // Game 2: Problemas matemáticos
    math: {
      levelFilter: "all",
      currentIndex: 0,
      selectedOption: null,
      isAnswered: false,
      correctCount: 0,
      answeredCount: 0,
      finished: false,
      showAllFollowups: false,
    },
  };
}

let state = createInitialState();

// -----------------------------
// Helpers
// -----------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isLetterRevealed(letter) {
  return state.past.guessedLetters.includes(letter);
}

function getRevealedTileCount() {
  return SECRET_WORD.split("").filter((ch) => isLetterRevealed(ch)).length;
}

function isSecretWordSolved() {
  return getRevealedTileCount() === SECRET_WORD.length;
}

function getRankTier(score) {
  return (
    RESULT_TIERS.find((tier) => score >= tier.min && score <= tier.max) ||
    RESULT_TIERS[0]
  );
}

function getFilteredMathProblems() {
  if (state.math.levelFilter === "1") {
    return MATH_PROBLEMS.filter((p) => p.level === 1);
  }
  if (state.math.levelFilter === "2") {
    return MATH_PROBLEMS.filter((p) => p.level === 2);
  }
  return MATH_PROBLEMS;
}

function getSectionMeta(sectionId) {
  return PAST_SECTIONS.find((s) => s.id === sectionId) || PAST_SECTIONS[0];
}

function getSectorAtAngle(angle) {
  const n = WHEEL_SECTORS.length;
  const slice = (Math.PI * 2) / n;
  const normalized = (((-Math.PI / 2 - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.floor(normalized / slice) % n;
  return { index, sector: WHEEL_SECTORS[index] };
}

// Inline SVG icons (functional affordances only)
const ICONS = {
  volume: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`,
  volumeMute: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
  check: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  x: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  translate: `<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>`,
  chevronDown: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  arrowRight: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
  spin: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path><polyline points="21 3 21 9 15 9"></polyline></svg>`,
};

// -----------------------------
// Canvas Wheel Drawing & Spin Physics
// -----------------------------
function drawWheelCanvas(angle = state.past.wheelAngle) {
  const canvas = document.getElementById("wheel-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = 250;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
    canvas.width = size * dpr;
    canvas.height = size * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 6;
  const wheelRadius = outerRadius - 8;
  const n = WHEEL_SECTORS.length;
  const slice = (Math.PI * 2) / n;

  // Outer golden-amber rim
  const rimGrad = ctx.createLinearGradient(0, 0, size, size);
  rimGrad.addColorStop(0, "#FDE047");
  rimGrad.addColorStop(0.5, "#F59E0B");
  rimGrad.addColorStop(1, "#EA580C");

  ctx.beginPath();
  ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
  ctx.fillStyle = rimGrad;
  ctx.fill();

  // Inner dark green border under sectors
  ctx.beginPath();
  ctx.arc(cx, cy, wheelRadius + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#14532D";
  ctx.fill();

  // Draw sectors
  for (let i = 0; i < n; i++) {
    const sector = WHEEL_SECTORS[i];
    const startA = angle + i * slice;
    const endA = startA + slice;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, wheelRadius, startA, endA);
    ctx.closePath();
    ctx.fillStyle = sector.color;
    ctx.fill();

    // Crisp divider line between sectors
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.stroke();

    // Sector label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startA + slice / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = sector.textColor;
    ctx.font = sector.label.length > 3
      ? "800 12px 'Plus Jakarta Sans', sans-serif"
      : "800 15px 'JetBrains Mono', monospace";
    ctx.fillText(sector.label, wheelRadius - 14, 0);
    ctx.restore();
  }

  // Rim pegs (golden studs at each sector boundary)
  for (let i = 0; i < n; i++) {
    const pegAngle = angle + i * slice;
    const px = cx + Math.cos(pegAngle) * (wheelRadius + 4);
    const py = cy + Math.sin(pegAngle) * (wheelRadius + 4);

    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#FEF08A";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#9A3412";
    ctx.stroke();
  }

  // Glossy inner center hub
  const hubGrad = ctx.createRadialGradient(cx - 5, cy - 5, 4, cx, cy, 30);
  hubGrad.addColorStop(0, "#FEF08A");
  hubGrad.addColorStop(0.55, "#F97316");
  hubGrad.addColorStop(1, "#C2410C");

  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#FFFFFF";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#14532D";
  ctx.fill();

  ctx.restore();
}

function triggerPointerTick() {
  const pointer = document.getElementById("wheel-pointer");
  if (!pointer) return;
  pointer.classList.add("is-ticking");
  window.setTimeout(() => {
    const el = document.getElementById("wheel-pointer");
    if (el) el.classList.remove("is-ticking");
  }, 75);
}

function startWheelSpin() {
  if (state.past.isSpinning || state.past.finished) return;

  if (wheelAnimationId) {
    cancelAnimationFrame(wheelAnimationId);
    wheelAnimationId = null;
  }

  state.past.isSpinning = true;
  render();

  const startAngle = state.past.wheelAngle;
  // 5 to 7 full spins + random offset
  const extraSpins = 5 + Math.random() * 2.5;
  const targetDelta = extraSpins * Math.PI * 2 + Math.random() * Math.PI * 2;
  const duration = 2700;
  const startTime = performance.now();

  let lastSectorIdx = getSectorAtAngle(startAngle).index;

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // Smooth quintic ease-out for authentic drum deceleration
    const eased = 1 - Math.pow(1 - t, 4);
    const currentAngle = startAngle + targetDelta * eased;

    state.past.wheelAngle = currentAngle;
    drawWheelCanvas(currentAngle);

    const { index } = getSectorAtAngle(currentAngle);
    if (index !== lastSectorIdx) {
      lastSectorIdx = index;
      playWheelTickSound();
      triggerPointerTick();
    }

    if (t < 1) {
      wheelAnimationId = requestAnimationFrame(step);
    } else {
      wheelAnimationId = null;
      state.past.wheelAngle = currentAngle % (Math.PI * 2);
      const result = getSectorAtAngle(state.past.wheelAngle);
      state.past.currentSector = result.sector;
      state.past.wheelSpunThisTurn = true;
      state.past.isSpinning = false;
      playWheelStopSound();
      render();
    }
  }

  wheelAnimationId = requestAnimationFrame(step);
}

// -----------------------------
// Clickable Spanish -> Armenian Component
// -----------------------------
function renderSpanishBlock({
  id,
  es,
  hy,
  textClass = "text-lg font-semibold text-slate-900",
  translationClass = "text-sm text-emerald-900",
  audioText = null,
  dark = false,
  compact = false,
}) {
  const isOpen = state.openTranslations.has(id);
  const speakTarget = audioText !== null ? audioText : es;
  const hoverBg = dark ? "hover:bg-white/10" : "hover:bg-amber-50";
  const openBg = dark ? "bg-white/15" : "bg-amber-50/90";
  const audioBtnClass = dark
    ? "text-amber-200 hover:text-white hover:bg-white/15"
    : "text-orange-600 hover:text-orange-800 hover:bg-orange-100";
  const hyColor = dark ? "text-amber-200" : translationClass;

  return `
    <div class="group flex items-start gap-2 ${compact ? "py-1" : "py-1.5"}">
      <button
        type="button"
        data-action="toggle-translation"
        data-tid="${escapeHtml(id)}"
        aria-expanded="${isOpen ? "true" : "false"}"
        title="Нажми, чтобы открыть перевод на армянский"
        class="spanish-clickable flex-1 text-left rounded-xl ${compact ? "px-2 py-1" : "px-2.5 py-1.5"} -mx-2 ${isOpen ? openBg : ""} ${hoverBg}"
      >
        <span class="spanish-underline ${textClass} leading-snug">${escapeHtml(es)}</span>
        <span class="ml-2 inline-flex items-center gap-1 align-middle text-xs font-bold ${dark ? "text-amber-300" : "text-orange-600"}">
          ${ICONS.translate}
          <span>${isOpen ? "Հայ" : "HY"}</span>
        </span>
        ${
          isOpen
            ? `<div class="fade-in-fast mt-1.5 ${hyColor} leading-relaxed font-medium">${escapeHtml(hy)}</div>`
            : ""
        }
      </button>
      ${
        speakTarget
          ? `<button
              type="button"
              data-action="speak"
              data-text="${escapeHtml(speakTarget)}"
              aria-label="Слушать на испанском"
              title="Прослушать произношение (ES)"
              class="mt-1 p-2 rounded-xl transition-colors shrink-0 ${audioBtnClass}"
            >
              ${ICONS.volume}
            </button>`
          : ""
      }
    </div>
  `;
}

// -----------------------------
// Top Bar (Strict 3-Zone Contract)
// -----------------------------
function renderHeader() {
  const navItems = [
    { id: "past", label: "Поле чудес" },
    { id: "math", label: "Математика" },
    { id: "grammar", label: "Грамматика" },
  ];

  return `
    <header class="sticky top-0 z-30 bg-[#14532D] text-white border-b-2 border-[#FACC15] shadow-sm">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        <a
          href="#top"
          data-action="nav"
          data-tab="past"
          class="text-lg font-extrabold tracking-tight text-amber-300 whitespace-nowrap shrink-0"
        >
          Paso a Paso
        </a>

        <nav class="flex items-center gap-5 sm:gap-7" aria-label="Разделы приложения">
          ${navItems
            .map((item) => {
              const active = state.activeTab === item.id;
              return `
                <button
                  type="button"
                  data-action="nav"
                  data-tab="${item.id}"
                  class="relative py-5 text-sm font-bold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? "text-amber-300"
                      : "text-emerald-100 hover:text-white"
                  }"
                >
                  ${escapeHtml(item.label)}
                  ${
                    active
                      ? `<span class="absolute left-0 right-0 bottom-0 h-1 bg-[#FACC15] rounded-t"></span>`
                      : ""
                  }
                </button>
              `;
            })
            .join("")}
        </nav>

        <div class="shrink-0">
          <button
            type="button"
            data-action="reset-current"
            class="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            Начать заново
          </button>
        </div>
      </div>
    </header>
  `;
}

// -----------------------------
// Game 1: Поле чудес (Wheel + Word Board)
// -----------------------------
function renderWheelAndWordBoard() {
  const solved = isSecretWordSolved();
  const revealedCount = getRevealedTileCount();
  const letters = SECRET_WORD.split("");
  const sector = state.past.currentSector;

  let sectorStatusText = "Крути барабан, чтобы разыграть очки за этот вопрос!";
  if (state.past.isSpinning) {
    sectorStatusText = "Барабан крутится...";
  } else if (sector && state.past.wheelSpunThisTurn) {
    if (sector.type === "double") {
      sectorStatusText = "На барабане сектор ×2 — удвоение при верном ответе!";
    } else if (sector.type === "prize") {
      sectorStatusText = "На барабане ПРИЗ (+750 очков) за верный ответ!";
    } else {
      sectorStatusText = `На барабане ${sector.value} очков за верный ответ!`;
    }
  }

  return `
    <section class="bg-gradient-to-br from-[#15803D] via-[#166534] to-[#14532D] text-white rounded-3xl border-2 border-[#FACC15]/70 p-5 sm:p-7 shadow-md">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <!-- Left: Spinning Wheel ("Барабан Поля чудес") -->
        <div class="lg:col-span-5 flex flex-col items-center">
          <div class="relative flex items-center justify-center">
            <!-- Top Pointer Arrow -->
            <div
              id="wheel-pointer"
              class="wheel-pointer absolute -top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none drop-shadow-md"
              aria-hidden="true"
            >
              <svg width="32" height="36" viewBox="0 0 32 36" fill="none">
                <path d="M16 34L4 8C3.2 6.2 4.5 4 6.5 4H25.5C27.5 4 28.8 6.2 28 8L16 34Z" fill="#F97316" stroke="#FEF08A" stroke-width="3"/>
                <circle cx="16" cy="11" r="3.5" fill="#FEF08A"/>
              </svg>
            </div>

            <button
              type="button"
              data-action="spin-wheel"
              ${state.past.isSpinning || state.past.finished ? "disabled" : ""}
              aria-label="Крутить барабан Поля чудес"
              class="rounded-full focus-visible:ring-4 focus-visible:ring-amber-300 transition-transform ${
                state.past.isSpinning ? "cursor-wait" : "hover:scale-[1.02] active:scale-[0.99]"
              }"
            >
              <canvas
                id="wheel-canvas"
                width="250"
                height="250"
                class="w-[220px] h-[220px] sm:w-[250px] sm:h-[250px] rounded-full shadow-lg block"
              ></canvas>
            </button>
          </div>

          <div class="mt-4 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              data-action="spin-wheel"
              ${state.past.isSpinning || state.past.finished ? "disabled" : ""}
              class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-extrabold text-sm sm:text-base shadow-sm transition-all whitespace-nowrap ${
                state.past.isSpinning
                  ? "bg-amber-200/40 text-amber-100 cursor-wait"
                  : "bg-gradient-to-r from-[#F97316] via-[#F59E0B] to-[#EAB308] hover:from-[#EA580C] hover:to-[#CA8A04] text-white"
              }"
            >
              ${ICONS.spin}
              <span>${state.past.isSpinning ? "Крутится..." : "Крутить барабан!"}</span>
            </button>
            <p class="text-xs sm:text-sm font-semibold text-amber-200 max-w-xs">
              ${escapeHtml(sectorStatusText)}
            </p>
          </div>
        </div>

        <!-- Right: Title, Scores & 6-Letter CORNER Word Board -->
        <div class="lg:col-span-7 flex flex-col justify-between space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-300">
                Поле чудес · Pasado
              </h1>
              <p class="mt-1 text-xs sm:text-sm text-emerald-100">
                Крути барабан, отвечай на вопросы и открывай слово · Կտտացրու իսպաներեն տեքստի վրա թարգմանության համար
              </p>
            </div>
            <button
              type="button"
              data-action="toggle-sound"
              aria-label="${state.soundEnabled ? "Выключить звук" : "Включить звук"}"
              title="${state.soundEnabled ? "Звук включён" : "Звук выключен"}"
              class="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-amber-200 transition-colors shrink-0"
            >
              ${state.soundEnabled ? ICONS.volume : ICONS.volumeMute}
            </button>
          </div>

          <!-- Clean Unboxed Live Metrics -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm font-mono-num text-amber-100 border-y border-amber-300/25 py-2.5">
            <span>Вопрос <strong class="text-white">${Math.min(state.past.currentIndex + 1, PAST_QUESTIONS.length)}/${PAST_QUESTIONS.length}</strong></span>
            <span class="text-amber-300/60" aria-hidden="true">·</span>
            <span>Верно: <strong class="text-white">${state.past.correctCount}</strong></span>
            <span class="text-amber-300/60" aria-hidden="true">·</span>
            <span>Очки: <strong class="text-amber-300">${state.past.wheelPoints}</strong></span>
            <span class="text-amber-300/60" aria-hidden="true">·</span>
            <span>Букв: <strong class="text-white">${revealedCount}/${SECRET_WORD.length}</strong></span>
          </div>

          <!-- 6-Letter Secret Word Board (CORNER) -->
          <div>
            <div class="text-xs font-bold text-amber-200/90 mb-2.5">
              Табло главного слова (${SECRET_WORD.length} букв):
            </div>
            <div class="flex flex-wrap items-center gap-2.5 sm:gap-3" aria-label="Табло главного слова">
              ${letters
                .map((ch, idx) => {
                  const revealed = isLetterRevealed(ch);
                  return `
                    <div class="word-tile-wrap w-12 h-14 sm:w-16 sm:h-20">
                      <div class="word-tile relative w-full h-full ${revealed ? "is-revealed" : ""}">
                        <div class="word-tile-face absolute inset-0 flex items-center justify-center rounded-xl bg-[#0F3D22] border-2 border-[#FACC15]/70 text-amber-300 font-mono-num text-xl sm:text-2xl font-extrabold shadow-inner select-none">
                          ?
                        </div>
                        <div class="word-tile-face word-tile-back absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-b from-[#FEF9C3] to-[#FDE047] border-2 border-[#F97316] text-[#14532D] font-extrabold text-2xl sm:text-3xl tracking-wide shadow-md select-none" aria-label="Буква ${idx + 1}: ${revealed ? ch : "скрыта"}">
                          ${ch}
                        </div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>

          ${
            solved
              ? `
                <div class="fade-in-fast pt-3 border-t border-amber-300/30">
                  <div class="text-sm font-extrabold text-amber-300">
                    Главное слово угадано: ${SECRET_WORD} · Գլխավոր բառը գուշակված է!
                  </div>
                  <div class="mt-0.5">
                    ${renderSpanishBlock({
                      id: "secret-word-info",
                      es: SECRET_WORD_INFO.es,
                      hy: SECRET_WORD_INFO.hy,
                      textClass: "text-sm font-semibold text-white",
                      dark: true,
                      compact: true,
                    })}
                  </div>
                </div>
              `
              : `
                <div class="text-xs sm:text-sm text-emerald-100/90">
                  ${
                    state.past.awaitingLetterPick
                      ? "Ответ верный — выбери 1 букву из алфавита справа (без подсказок)!"
                      : "За верный ответ получаешь очки барабана и открываешь 1 букву из алфавита."
                  }
                </div>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderAlphabetPanel() {
  const canPick = state.past.awaitingLetterPick && !isSecretWordSolved();
  const solved = isSecretWordSolved();

  let statusMessage = "Ответь правильно на вопрос, чтобы выбрать 1 букву";
  let statusTone = "text-slate-600";

  if (solved) {
    statusMessage = `Слово ${SECRET_WORD} полностью открыто!`;
    statusTone = "text-emerald-800 font-bold";
  } else if (canPick) {
    statusMessage = "Выбери 1 букву из алфавита · Ընտրի՛ր 1 տառ";
    statusTone = "text-orange-700 font-bold";
  } else if (state.past.isAnswered && state.past.lastLetterResult) {
    const { letter, found, count } = state.past.lastLetterResult;
    if (found) {
      statusMessage = `Буква «${letter}» есть в слове (${count} шт.) · «${letter}» տառը կա բառում`;
      statusTone = "text-emerald-800 font-bold";
    } else {
      statusMessage = `Буквы «${letter}» нет в слове · «${letter}» տառը բառում չկա`;
      statusTone = "text-orange-800 font-semibold";
    }
  } else if (state.past.isAnswered && !state.past.awaitingLetterPick) {
    statusMessage = "Ошибка в вопросе — выбор буквы пропускается, игра продолжается";
    statusTone = "text-slate-600";
  }

  return `
    <aside class="space-y-4">
      <div class="bg-white rounded-2xl border-2 ${
        canPick ? "border-[#F97316] ring-4 ring-[#FACC15]/40" : "border-amber-200"
      } p-5 shadow-sm transition-all">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <h2 class="text-base font-extrabold text-emerald-950">Выбор буквы (A–Z)</h2>
          <span class="text-xs font-mono-num font-semibold text-orange-700">
            Проверено: ${state.past.guessedLetters.length}
          </span>
        </div>
        <p class="text-xs sm:text-sm ${statusTone} mb-4 leading-snug">
          ${escapeHtml(statusMessage)}
        </p>

        <div class="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label="Алфавит для выбора буквы">
          ${ALPHABET.map((letter) => {
            const tried = state.past.guessedLetters.includes(letter);
            const inWord = tried && SECRET_WORD.includes(letter);
            const disabled = !canPick || tried;

            let btnClasses =
              "h-11 rounded-xl font-extrabold text-sm sm:text-base transition-all flex items-center justify-center border-2 ";

            if (tried && inWord) {
              btnClasses += "bg-[#16A34A] text-white border-[#15803D] shadow-xs";
            } else if (tried && !inWord) {
              btnClasses += "bg-amber-50/70 text-slate-400 border-amber-200/70 line-through";
            } else if (canPick) {
              btnClasses +=
                "bg-[#FEF9C3] text-emerald-950 border-[#F59E0B] hover:bg-[#F97316] hover:text-white hover:border-[#EA580C] active:scale-95 shadow-xs";
            } else {
              btnClasses += "bg-amber-50/50 text-slate-400 border-amber-100 cursor-not-allowed";
            }

            return `
              <button
                type="button"
                data-action="pick-letter"
                data-letter="${letter}"
                ${disabled ? "disabled" : ""}
                class="${btnClasses}"
              >
                ${letter}
              </button>
            `;
          }).join("")}
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
        <button
          type="button"
          data-action="toggle-grammar-peek"
          class="w-full flex items-center justify-between text-left text-sm font-extrabold text-emerald-950 hover:text-orange-700 transition-colors"
        >
          <span>Հիշենք վերջավորությունները · Шпаргалка</span>
          <span class="transition-transform text-orange-600 ${state.past.showGrammarPeek ? "rotate-180" : ""}">
            ${ICONS.chevronDown}
          </span>
        </button>

        ${
          state.past.showGrammarPeek
            ? `
              <div class="fade-in-fast mt-4 overflow-x-auto">
                <table class="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr class="border-b border-amber-200 text-emerald-900">
                      <th class="py-1.5 pr-2 font-bold">Persona</th>
                      <th class="py-1.5 px-1.5 font-bold">Ind. -ar</th>
                      <th class="py-1.5 px-1.5 font-bold">Ind. -er/-ir</th>
                      <th class="py-1.5 px-1.5 font-bold">Imp. -ar</th>
                      <th class="py-1.5 pl-1.5 font-bold">Imp. -er/-ir</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-amber-100 font-mono-num">
                    ${VERB_ENDINGS_TABLE.map(
                      (row) => `
                        <tr>
                          <td class="py-1.5 pr-2 font-sans font-bold text-slate-800">${row.persona}</td>
                          <td class="py-1.5 px-1.5 font-semibold text-emerald-700">${row.indefAr}</td>
                          <td class="py-1.5 px-1.5 font-semibold text-emerald-700">${row.indefErIr}</td>
                          <td class="py-1.5 px-1.5 font-semibold text-orange-700">${row.imperfAr}</td>
                          <td class="py-1.5 pl-1.5 font-semibold text-orange-700">${row.imperfErIr}</td>
                        </tr>
                      `
                    ).join("")}
                  </tbody>
                </table>
                <div class="mt-3 pt-3 border-t border-amber-100 text-xs text-slate-700">
                  <span class="font-bold text-emerald-900">Perfecto (haber):</span>
                  he · has · ha · hemos · habéis · han + <span class="font-mono-num font-semibold text-orange-700">-ado / -ido</span>
                </div>
              </div>
            `
            : ""
        }
      </div>
    </aside>
  `;
}

function renderPastQuestionCard() {
  const q = PAST_QUESTIONS[state.past.currentIndex];
  const section = getSectionMeta(q.section);
  const isAnswered = state.past.isAnswered;
  const isCorrect = state.past.selectedOption === q.correctIndex;
  const waitingForLetter = state.past.awaitingLetterPick && !isSecretWordSolved();
  const isLast = state.past.currentIndex === PAST_QUESTIONS.length - 1;
  const progressPct = Math.round(
    ((state.past.currentIndex + (isAnswered ? 1 : 0)) / PAST_QUESTIONS.length) * 100
  );

  return `
    <div class="bg-white rounded-2xl border border-amber-200 p-5 sm:p-7 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 mb-3">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-orange-700">${escapeHtml(section.titleEs)}</span>
          <span aria-hidden="true">·</span>
          <span class="font-semibold text-emerald-800">Вопрос ${q.id} из ${PAST_QUESTIONS.length}</span>
        </div>
        <span class="font-mono-num font-bold text-emerald-800">${progressPct}%</span>
      </div>

      <progress
        value="${progressPct}"
        max="100"
        aria-label="Прогресс вопросов"
        class="quiz-progress block w-full h-2 rounded-full overflow-hidden mb-5"
      ></progress>

      <p class="text-xs font-medium text-emerald-900/80 mb-4">${escapeHtml(section.titleHy)}</p>

      <div class="space-y-2 mb-6">
        ${renderSpanishBlock({
          id: `past-q-${q.id}`,
          es: `${q.id}. ${q.questionEs}`,
          hy: q.questionHy,
          textClass: "text-lg sm:text-xl font-extrabold text-emerald-950",
          audioText: q.questionEs,
        })}

        <div class="mt-3 p-4 rounded-xl bg-amber-50/80 border border-amber-200">
          ${renderSpanishBlock({
            id: `past-sent-${q.id}`,
            es: isAnswered ? q.fullAnswerEs : q.sentenceEs,
            hy: q.sentenceHy,
            textClass: "text-base sm:text-lg font-bold text-slate-900",
            audioText: isAnswered ? q.fullAnswerEs : q.sentenceEs.replace("___", ""),
            compact: true,
          })}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Варианты ответа">
        ${q.options
          .map((opt, idx) => {
            const selected = state.past.selectedOption === idx;
            const correctOption = idx === q.correctIndex;

            let cls =
              "min-h-12 px-4 py-3 rounded-xl border-2 text-left flex items-center justify-between gap-3 transition-colors ";

            if (!isAnswered) {
              cls +=
                "bg-white border-amber-200 hover:border-[#F97316] hover:bg-amber-50 text-slate-900";
            } else if (correctOption) {
              cls += "bg-emerald-50 border-[#16A34A] text-emerald-950 font-bold";
            } else if (selected && !correctOption) {
              cls += "bg-orange-50 border-red-500 text-red-950";
            } else {
              cls += "bg-amber-50/30 border-amber-100 text-slate-400";
            }

            let stateIcon = "";
            if (isAnswered && correctOption) {
              stateIcon = `<span class="text-[#16A34A] flex items-center gap-1 text-xs font-bold">${ICONS.check}</span>`;
            } else if (isAnswered && selected && !correctOption) {
              stateIcon = `<span class="text-red-600 flex items-center gap-1 text-xs font-bold">${ICONS.x}</span>`;
            }

            const letterBadgeCls = !isAnswered
              ? "bg-amber-100 text-orange-800"
              : correctOption
                ? "bg-[#16A34A] text-white"
                : selected
                  ? "bg-red-500 text-white"
                  : "bg-slate-100 text-slate-400";

            return `
              <button
                type="button"
                data-action="answer-past"
                data-option="${idx}"
                ${isAnswered ? "disabled" : ""}
                class="${cls}"
              >
                <span class="flex items-center gap-3 min-w-0">
                  <span class="w-7 h-7 rounded-lg ${letterBadgeCls} font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0">
                    ${OPTION_LETTERS[idx]}
                  </span>
                  <span class="text-base font-semibold truncate">${escapeHtml(opt)}</span>
                </span>
                ${stateIcon}
              </button>
            `;
          })
          .join("")}
      </div>

      ${
        isAnswered
          ? `
            <div class="fade-in-fast mt-6 pt-5 border-t border-amber-200 space-y-4">
              <div class="flex items-start gap-2.5">
                <span class="mt-0.5 ${isCorrect ? "text-[#16A34A]" : "text-red-600"}">
                  ${isCorrect ? ICONS.check : ICONS.x}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-extrabold ${isCorrect ? "text-emerald-800" : "text-red-700"}">
                    ${
                      isCorrect
                        ? `Ճիշտ է · Верно! (+${state.past.lastAwardedPoints} очков)`
                        : `Սխալ է · Неверно — правильный вариант: ${OPTION_LETTERS[q.correctIndex]}) ${escapeHtml(q.options[q.correctIndex])}`
                    }
                  </div>
                  <div class="mt-1">
                    ${renderSpanishBlock({
                      id: `past-ans-${q.id}`,
                      es: `${OPTION_LETTERS[q.correctIndex]}) ${q.options[q.correctIndex]} — ${q.fullAnswerEs}`,
                      hy: `${q.answerHy} (${q.sentenceHy})`,
                      textClass: "text-sm font-semibold text-slate-800",
                      audioText: q.fullAnswerEs,
                      compact: true,
                    })}
                  </div>
                </div>
              </div>

              ${
                isCorrect
                  ? `
                    <div class="rounded-xl bg-emerald-50/90 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-950 leading-relaxed">
                      <span class="font-extrabold text-emerald-900">Լրացուցիչ կանոն:</span>
                      Արտասանի՛ր ամբողջ նախադասությունը և <span class="font-bold text-orange-700">${escapeHtml(q.verb)}</span> բայով կազմի՛ր մեկ նոր նախադասություն՝ փոխելով դեմքը (Yo / Tú / Él / Nosotros / Vosotros / Ellos)։
                    </div>
                  `
                  : `
                    <p class="text-xs sm:text-sm text-slate-700">
                      Не переживай — продолжаем игру! Переходи к следующему вопросу и крути барабан снова.
                    </p>
                  `
              }

              <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                ${
                  waitingForLetter
                    ? `<span class="text-sm font-bold text-orange-700">
                        Сначала выбери 1 букву в списке алфавита справа
                      </span>`
                    : `<button
                        type="button"
                        data-action="next-past"
                        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#15803D] hover:to-[#166534] text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
                      >
                        <span>${isLast ? "Показать результаты" : "Следующий вопрос · Հաջորդ հարցը"}</span>
                        ${ICONS.arrowRight}
                      </button>`
                }
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderPastFinishedCard() {
  const tier = getRankTier(state.past.correctCount);
  const solved = isSecretWordSolved();

  return `
    <div class="bg-white rounded-2xl border-2 border-[#FACC15] p-6 sm:p-8 space-y-6 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-amber-200">
        <div>
          <p class="text-xs font-extrabold text-orange-700 mb-1">Resultados · Արդյունքներ</p>
          <h2 class="text-2xl sm:text-3xl font-extrabold text-emerald-950 tracking-tight">
            ${escapeHtml(tier.es)} — ${escapeHtml(tier.hy)}
          </h2>
        </div>
        <div class="text-left sm:text-right">
          <div class="text-xs text-slate-500">Правильных ответов · Очки</div>
          <div class="text-2xl sm:text-3xl font-extrabold font-mono-num text-[#16A34A]">
            ${state.past.correctCount}/${PAST_QUESTIONS.length}
            <span class="text-orange-600 text-xl ml-2">${state.past.wheelPoints} очк.</span>
          </div>
        </div>
      </div>

      <div class="rounded-xl bg-amber-50 border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="text-xs font-semibold text-orange-800">Главное слово игры «Поле чудес»</div>
          <div class="text-xl font-extrabold tracking-widest text-emerald-950 mt-0.5">${SECRET_WORD}</div>
          <div class="mt-1">
            ${renderSpanishBlock({
              id: "final-secret-word",
              es: SECRET_WORD_INFO.es,
              hy: SECRET_WORD_INFO.hy,
              textClass: "text-sm font-semibold text-slate-800",
              compact: true,
            })}
          </div>
        </div>
        <div class="text-sm font-bold ${solved ? "text-emerald-800" : "text-orange-700"}">
          ${solved ? "Слово полностью угадано" : `Открыто букв: ${getRevealedTileCount()} / ${SECRET_WORD.length}`}
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          data-action="reset-past"
          class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
        >
          Играть заново · Խաղալ նորից
        </button>
        <button
          type="button"
          data-action="nav"
          data-tab="math"
          class="px-5 py-2.5 rounded-xl bg-emerald-50 border-2 border-[#16A34A] hover:bg-emerald-100 text-emerald-950 text-sm font-bold transition-colors whitespace-nowrap"
        >
          Перейти к математическим задачам
        </button>
      </div>
    </div>
  `;
}

function renderPastGame() {
  return `
    <div class="space-y-6">
      ${renderWheelAndWordBoard()}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div class="lg:col-span-7">
          ${state.past.finished ? renderPastFinishedCard() : renderPastQuestionCard()}
        </div>
        <div class="lg:col-span-5">
          ${renderAlphabetPanel()}
        </div>
      </div>
    </div>
  `;
}

// -----------------------------
// Game 2: Problemas matemáticos
// -----------------------------
function renderMathGame() {
  const problems = getFilteredMathProblems();
  const current = problems[state.math.currentIndex];
  const isAnswered = state.math.isAnswered;
  const isCorrect = current && state.math.selectedOption === current.correctIndex;
  const isLast = state.math.currentIndex >= problems.length - 1;

  const filterButtons = [
    { id: "all", label: `Все задачи (${MATH_PROBLEMS.length})` },
    { id: "1", label: "Nivel 1 · Կարճ խնդիրներ (9)" },
    { id: "2", label: "Nivel 2 · Ավելի հետաքրքիր (10)" },
  ];

  const followupsToShow =
    state.math.showAllFollowups || !current
      ? MATH_FOLLOWUP_QUESTIONS.map((item, index) => ({ ...item, index }))
      : current.suggestedQuestions.map((idx) => ({
          ...MATH_FOLLOWUP_QUESTIONS[idx],
          index: idx,
        }));

  return `
    <div class="space-y-6">
      <section class="bg-gradient-to-r from-[#15803D] via-[#166534] to-[#14532D] text-white rounded-3xl border-2 border-[#FACC15]/70 p-5 sm:p-6 shadow-md">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-amber-300">
              Problemas matemáticos en situaciones reales
            </h1>
            <p class="mt-1 text-xs sm:text-sm text-emerald-100">
              Իրական իրավիճակներով մաթեմատիկական խնդիրներ · Нажми на испанский текст для перевода на армянский
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <div class="text-xs sm:text-sm font-mono-num text-amber-100">
              <span>Задача <strong class="text-white">${Math.min(state.math.currentIndex + 1, problems.length)}/${problems.length}</strong></span>
              <span class="mx-2 text-amber-300/60">·</span>
              <span>Верно: <strong class="text-amber-300">${state.math.correctCount}</strong></span>
            </div>
            <button
              type="button"
              data-action="toggle-sound"
              aria-label="${state.soundEnabled ? "Выключить звук" : "Включить звук"}"
              class="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-amber-200 transition-colors"
            >
              ${state.soundEnabled ? ICONS.volume : ICONS.volumeMute}
            </button>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-amber-300/25 flex flex-wrap items-center gap-1.5">
          <div class="inline-flex flex-wrap items-center gap-1 p-1 bg-black/20 rounded-xl" role="tablist" aria-label="Уровень сложности">
            ${filterButtons
              .map((btn) => {
                const active = state.math.levelFilter === btn.id;
                return `
                  <button
                    type="button"
                    role="tab"
                    aria-selected="${active ? "true" : "false"}"
                    data-action="set-math-level"
                    data-level="${btn.id}"
                    class="px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? "bg-[#FACC15] text-emerald-950 shadow-sm"
                        : "text-emerald-100 hover:text-white hover:bg-white/10"
                    }"
                  >
                    ${escapeHtml(btn.label)}
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div class="lg:col-span-7">
          ${
            state.math.finished
              ? `
                <div class="bg-white rounded-2xl border-2 border-[#FACC15] p-6 sm:p-8 space-y-5 shadow-sm">
                  <p class="text-xs font-extrabold text-orange-700">Задачи завершены · Խնդիրներն ավարտվեցին</p>
                  <h2 class="text-2xl sm:text-3xl font-extrabold text-emerald-950">
                    Результат: <span class="font-mono-num text-[#16A34A]">${state.math.correctCount} / ${problems.length}</span>
                  </h2>
                  <p class="text-sm text-slate-700 leading-relaxed">
                    Отличная тренировка чисел, аудирования и глаголов прошедшего времени на испанском языке.
                  </p>
                  <div class="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      data-action="reset-math"
                      class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
                    >
                      Решать заново · Նորից լուծել
                    </button>
                    <button
                      type="button"
                      data-action="nav"
                      data-tab="past"
                      class="px-5 py-2.5 rounded-xl bg-emerald-50 border-2 border-[#16A34A] hover:bg-emerald-100 text-emerald-950 text-sm font-bold transition-colors whitespace-nowrap"
                    >
                      Вернуться в Поле чудес
                    </button>
                  </div>
                </div>
              `
              : `
                <div class="bg-white rounded-2xl border border-amber-200 p-5 sm:p-7 shadow-sm">
                  <div class="flex items-center justify-between gap-2 text-xs text-slate-600 mb-3">
                    <span>
                      <span class="font-extrabold text-orange-700">Nivel ${current.level}</span>
                      <span class="mx-1.5" aria-hidden="true">·</span>
                      <span class="font-semibold text-emerald-800">${current.level === 1 ? "Կարճ խնդիրներ" : "Ավելի հետաքրքիր իրավիճակներ"}</span>
                    </span>
                    <span class="font-mono-num font-bold text-emerald-800">${state.math.currentIndex + 1} / ${problems.length}</span>
                  </div>

                  <div class="mb-2">
                    ${renderSpanishBlock({
                      id: `math-title-${current.id}`,
                      es: `${state.math.currentIndex + 1}. ${current.titleEs}`,
                      hy: current.titleHy,
                      textClass: "text-xl font-extrabold text-emerald-950",
                      audioText: current.titleEs,
                      compact: true,
                    })}
                  </div>

                  <div class="p-4 sm:p-5 rounded-xl bg-amber-50/80 border border-amber-200 mb-6">
                    ${renderSpanishBlock({
                      id: `math-text-${current.id}`,
                      es: current.textEs,
                      hy: current.textHy,
                      textClass: "text-base sm:text-lg font-semibold text-slate-900 leading-relaxed",
                      audioText: current.textEs,
                    })}
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Варианты ответа">
                    ${current.options
                      .map((opt, idx) => {
                        const selected = state.math.selectedOption === idx;
                        const correctOption = idx === current.correctIndex;

                        let cls =
                          "min-h-12 px-4 py-3 rounded-xl border-2 text-left flex items-center justify-between gap-3 transition-colors ";

                        if (!isAnswered) {
                          cls +=
                            "bg-white border-amber-200 hover:border-[#F97316] hover:bg-amber-50 text-slate-900";
                        } else if (correctOption) {
                          cls += "bg-emerald-50 border-[#16A34A] text-emerald-950 font-bold";
                        } else if (selected && !correctOption) {
                          cls += "bg-orange-50 border-red-500 text-red-950";
                        } else {
                          cls += "bg-amber-50/30 border-amber-100 text-slate-400";
                        }

                        let icon = "";
                        if (isAnswered && correctOption) {
                          icon = `<span class="text-[#16A34A]">${ICONS.check}</span>`;
                        } else if (isAnswered && selected && !correctOption) {
                          icon = `<span class="text-red-600">${ICONS.x}</span>`;
                        }

                        const letterBadgeCls = !isAnswered
                          ? "bg-amber-100 text-orange-800"
                          : correctOption
                            ? "bg-[#16A34A] text-white"
                            : selected
                              ? "bg-red-500 text-white"
                              : "bg-slate-100 text-slate-400";

                        return `
                          <button
                            type="button"
                            data-action="answer-math"
                            data-option="${idx}"
                            ${isAnswered ? "disabled" : ""}
                            class="${cls}"
                          >
                            <span class="flex items-center gap-3 min-w-0">
                              <span class="w-7 h-7 rounded-lg ${letterBadgeCls} font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0">
                                ${OPTION_LETTERS[idx]}
                              </span>
                              <span class="text-base font-semibold truncate">${escapeHtml(opt)}</span>
                            </span>
                            ${icon}
                          </button>
                        `;
                      })
                      .join("")}
                  </div>

                  ${
                    isAnswered
                      ? `
                        <div class="fade-in-fast mt-6 pt-5 border-t border-amber-200 space-y-4">
                          <div class="flex items-start gap-2.5">
                            <span class="mt-0.5 ${isCorrect ? "text-[#16A34A]" : "text-red-600"}">
                              ${isCorrect ? ICONS.check : ICONS.x}
                            </span>
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-extrabold ${isCorrect ? "text-emerald-800" : "text-red-700"}">
                                ${isCorrect ? "Ճիշտ է · Верно!" : "Սխալ է · Неверно — продолжаем играть"}
                              </div>
                              <div class="mt-1">
                                ${renderSpanishBlock({
                                  id: `math-ans-${current.id}`,
                                  es: current.answerEs,
                                  hy: current.answerHy,
                                  textClass: "text-base font-bold text-slate-900",
                                  audioText: current.answerEs,
                                  compact: true,
                                })}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            data-action="next-math"
                            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#15803D] hover:to-[#166534] text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
                          >
                            <span>${isLast ? "Завершить уровень" : "Следующая задача · Հաջորդ խնդիրը"}</span>
                            ${ICONS.arrowRight}
                          </button>
                        </div>
                      `
                      : ""
                  }
                </div>
              `
          }
        </div>

        <aside class="lg:col-span-5 space-y-4">
          <div class="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
            <div class="flex items-center justify-between gap-2 mb-1">
              <h2 class="text-base font-extrabold text-emerald-950">Preguntas adicionales</h2>
              <button
                type="button"
                data-action="toggle-all-followups"
                class="text-xs font-bold text-orange-700 hover:text-orange-900 whitespace-nowrap"
              >
                ${state.math.showAllFollowups ? "Показать 3" : "Все 10 вопросов"}
              </button>
            </div>
            <p class="text-xs text-slate-600 mb-3">
              Լրացուցիչ հարցեր խոսակցական իսպաներենի համար · Кликни для перевода
            </p>
            <div class="divide-y divide-amber-100">
              ${followupsToShow
                .map((fq) =>
                  renderSpanishBlock({
                    id: `followup-${fq.index}`,
                    es: fq.es,
                    hy: fq.hy,
                    textClass: "text-sm font-bold text-emerald-950",
                    translationClass: "text-xs text-emerald-800",
                    audioText: fq.es,
                    compact: true,
                  })
                )
                .join("")}
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
            <h2 class="text-base font-extrabold text-emerald-950 mb-1">Глаголы из задач</h2>
            <p class="text-xs text-slate-600 mb-3">Нажми на испанский глагол, чтобы увидеть перевод на армянский</p>
            <div class="grid grid-cols-2 gap-2">
              ${MATH_KEY_VERBS.map((v, idx) => {
                const tid = `math-verb-${idx}`;
                const open = state.openTranslations.has(tid);
                return `
                  <button
                    type="button"
                    data-action="toggle-translation"
                    data-tid="${tid}"
                    class="text-left p-2.5 rounded-xl border-2 transition-colors ${
                      open
                        ? "bg-emerald-50 border-[#16A34A]"
                        : "bg-amber-50/70 border-amber-200 hover:border-[#F97316]"
                    }"
                  >
                    <div class="text-sm font-extrabold text-emerald-950 spanish-underline">${escapeHtml(v.es)}</div>
                    ${
                      open
                        ? `<div class="fade-in-fast text-xs font-semibold text-emerald-800 mt-1">${escapeHtml(v.hy)}</div>`
                        : `<div class="text-[11px] font-medium text-orange-700/80 mt-0.5">Перевод HY</div>`
                    }
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

// -----------------------------
// Tab 3: Грамматика и результаты
// -----------------------------
function renderGrammarView() {
  const currentScore = state.past.correctCount;

  return `
    <div class="space-y-6">
      <section class="bg-white rounded-2xl border border-amber-200 p-6 sm:p-7 shadow-sm">
        <h1 class="text-xl sm:text-2xl font-extrabold text-emerald-950 mb-1">
          Հիշենք բայերի վերջավորությունները
        </h1>
        <p class="text-sm text-slate-700 mb-5">
          Նպատակն է հիշել բայերի վերջավորությունները և ճիշտ կիրառել անցյալ ժամանակները տարբեր իրավիճակներում։
        </p>

        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
              <tr class="border-b-2 border-amber-200 text-emerald-900 text-xs">
                <th class="py-3 pr-4 font-bold">Persona</th>
                <th class="py-3 px-4 font-bold">Indefinido (-ar)</th>
                <th class="py-3 px-4 font-bold">Indefinido (-er/-ir)</th>
                <th class="py-3 px-4 font-bold">Imperfecto (-ar)</th>
                <th class="py-3 pl-4 font-bold">Imperfecto (-er/-ir)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-amber-100">
              ${VERB_ENDINGS_TABLE.map(
                (row) => `
                  <tr class="hover:bg-amber-50/70">
                    <td class="py-3 pr-4 font-bold text-slate-900">
                      ${escapeHtml(row.persona)}
                      <span class="ml-2 text-xs font-normal text-slate-500">${escapeHtml(row.hy)}</span>
                    </td>
                    <td class="py-3 px-4 font-mono-num font-bold text-emerald-700">${escapeHtml(row.indefAr)}</td>
                    <td class="py-3 px-4 font-mono-num font-bold text-emerald-700">${escapeHtml(row.indefErIr)}</td>
                    <td class="py-3 px-4 font-mono-num font-bold text-orange-700">${escapeHtml(row.imperfAr)}</td>
                    <td class="py-3 pl-4 font-mono-num font-bold text-orange-700">${escapeHtml(row.imperfErIr)}</td>
                  </tr>
                `
              ).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section class="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h2 class="text-lg font-extrabold text-emerald-950 mb-1">Pretérito Perfecto (Haber + Participio)</h2>
          <p class="text-xs sm:text-sm text-slate-600 mb-4">
            Անցյալում կատարված գործողություն, որը կապված է ներկայի հետ։
          </p>

          <table class="w-full text-sm text-left border-collapse mb-4">
            <thead>
              <tr class="border-b-2 border-amber-200 text-emerald-900 text-xs">
                <th class="py-2 pr-4 font-bold">Persona</th>
                <th class="py-2 pl-4 font-bold">Haber</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-amber-100">
              ${HABER_TABLE.map(
                (row) => `
                  <tr>
                    <td class="py-2.5 pr-4 font-bold text-slate-900">
                      ${escapeHtml(row.persona)}
                      <span class="ml-2 text-xs font-normal text-slate-500">${escapeHtml(row.hy)}</span>
                    </td>
                    <td class="py-2.5 pl-4 font-mono-num font-extrabold text-orange-700">${escapeHtml(row.haber)}</td>
                  </tr>
                `
              ).join("")}
            </tbody>
          </table>

          <div class="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-slate-800">
            <span class="font-extrabold text-emerald-950">Participio:</span>
            jugar → <span class="font-bold text-emerald-700">jugado</span>,
            comer → <span class="font-bold text-emerald-700">comido</span>,
            vivir → <span class="font-bold text-emerald-700">vivido</span>.
          </div>
        </section>

        <section class="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h2 class="text-lg font-extrabold text-emerald-950 mb-1">Լրացուցիչ կանոն · Устная практика</h2>
          <p class="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
            Յուրաքանչյուր ճիշտ պատասխանից հետո արտասանի՛ր ամբողջ նախադասությունը և նույն բայով կազմի՛ր մեկ նոր նախադասություն՝ փոխելով դեմքը։ Нажми на пример для перевода:
          </p>

          <div class="divide-y divide-amber-100">
            ${CONJUGATION_EXAMPLE.map((ex, idx) =>
              renderSpanishBlock({
                id: `conj-ex-${idx}`,
                es: ex.es,
                hy: ex.hy,
                textClass: "text-sm sm:text-base font-bold text-emerald-950",
                translationClass: "text-xs sm:text-sm text-emerald-800",
                audioText: ex.es,
                compact: true,
              })
            ).join("")}
          </div>
        </section>
      </div>

      <section class="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 class="text-lg font-extrabold text-emerald-950">Resultados · Արդյունքներ</h2>
          <span class="text-xs font-mono-num font-bold text-orange-700">
            Текущий счёт: ${currentScore} / ${PAST_QUESTIONS.length} · ${state.past.wheelPoints} очк.
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
              <tr class="border-b-2 border-amber-200 text-emerald-900 text-xs">
                <th class="py-2.5 pr-4 font-bold">Puntos</th>
                <th class="py-2.5 px-4 font-bold">Español</th>
                <th class="py-2.5 pl-4 font-bold">Հայերեն</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-amber-100">
              ${RESULT_TIERS.map((tier) => {
                const isCurrent =
                  state.past.answeredCount > 0 &&
                  currentScore >= tier.min &&
                  currentScore <= tier.max;
                const range = tier.min === tier.max ? `${tier.min}/30` : `${tier.min}–${tier.max}`;
                return `
                  <tr class="${isCurrent ? "bg-amber-100/80 font-bold" : ""}">
                    <td class="py-2.5 pr-4 font-mono-num text-orange-800">${range}</td>
                    <td class="py-2.5 px-4 text-emerald-950">${escapeHtml(tier.es)}</td>
                    <td class="py-2.5 pl-4 text-slate-700">${escapeHtml(tier.hy)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

// -----------------------------
// Main Render
// -----------------------------
function render() {
  const root = document.getElementById("app");
  if (!root) return;

  let content = "";
  if (state.activeTab === "past") {
    content = renderPastGame();
  } else if (state.activeTab === "math") {
    content = renderMathGame();
  } else {
    content = renderGrammarView();
  }

  root.innerHTML = `
    ${renderHeader()}
    <main id="top" class="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      ${content}
    </main>
  `;

  if (state.activeTab === "past") {
    drawWheelCanvas(state.past.wheelAngle);
  }
}

// -----------------------------
// Actions & Event Delegation
// -----------------------------
function resetPastGame() {
  if (wheelAnimationId) {
    cancelAnimationFrame(wheelAnimationId);
    wheelAnimationId = null;
  }
  state.past = createInitialState().past;
  for (const key of Array.from(state.openTranslations)) {
    if (key.startsWith("past-") || key === "secret-word-info" || key === "final-secret-word") {
      state.openTranslations.delete(key);
    }
  }
  render();
}

function resetMathGame(levelFilter = state.math.levelFilter) {
  state.math = {
    ...createInitialState().math,
    levelFilter,
  };
  for (const key of Array.from(state.openTranslations)) {
    if (key.startsWith("math-title-") || key.startsWith("math-text-") || key.startsWith("math-ans-")) {
      state.openTranslations.delete(key);
    }
  }
  render();
}

function handleAction(target) {
  const action = target.dataset.action;
  if (!action) return;

  switch (action) {
    case "nav": {
      const tab = target.dataset.tab;
      if (tab && ["past", "math", "grammar"].includes(tab)) {
        if (wheelAnimationId) {
          cancelAnimationFrame(wheelAnimationId);
          wheelAnimationId = null;
          state.past.isSpinning = false;
        }
        state.activeTab = tab;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      break;
    }

    case "reset-current": {
      if (state.activeTab === "math") {
        resetMathGame(state.math.levelFilter);
      } else {
        state.activeTab = "past";
        resetPastGame();
      }
      break;
    }

    case "reset-past": {
      resetPastGame();
      break;
    }

    case "reset-math": {
      resetMathGame(state.math.levelFilter);
      break;
    }

    case "spin-wheel": {
      startWheelSpin();
      break;
    }

    case "toggle-sound": {
      state.soundEnabled = !state.soundEnabled;
      render();
      break;
    }

    case "toggle-translation": {
      const tid = target.dataset.tid;
      if (!tid) return;
      if (state.openTranslations.has(tid)) {
        state.openTranslations.delete(tid);
      } else {
        state.openTranslations.add(tid);
      }
      render();
      break;
    }

    case "speak": {
      const text = target.dataset.text;
      if (text) speakSpanish(text);
      break;
    }

    case "answer-past": {
      if (state.past.isAnswered) return;
      const optionIdx = Number(target.dataset.option);
      const q = PAST_QUESTIONS[state.past.currentIndex];
      if (!q || Number.isNaN(optionIdx)) return;

      const isCorrect = optionIdx === q.correctIndex;
      state.past.selectedOption = optionIdx;
      state.past.isAnswered = true;
      state.past.answeredCount += 1;
      state.past.lastLetterResult = null;

      if (isCorrect) {
        state.past.correctCount += 1;
        state.past.awaitingLetterPick = !isSecretWordSolved();

        // Award points based on the wheel sector (or default 100 if player didn't spin)
        let earned = 100;
        const sec = state.past.wheelSpunThisTurn ? state.past.currentSector : null;
        if (sec) {
          if (sec.type === "double") {
            earned = state.past.wheelPoints > 0 ? state.past.wheelPoints : 300;
          } else {
            earned = sec.value;
          }
        }
        state.past.wheelPoints += earned;
        state.past.lastAwardedPoints = earned;
        playCorrectSound();
      } else {
        state.past.awaitingLetterPick = false;
        state.past.lastAwardedPoints = 0;
        playWrongSound();
      }
      render();
      break;
    }

    case "pick-letter": {
      if (!state.past.awaitingLetterPick || isSecretWordSolved()) return;
      const letter = target.dataset.letter;
      if (!letter || state.past.guessedLetters.includes(letter)) return;

      state.past.guessedLetters.push(letter);
      state.past.awaitingLetterPick = false;

      const occurrences = SECRET_WORD.split("").filter((ch) => ch === letter).length;
      const found = occurrences > 0;
      state.past.lastLetterResult = { letter, found, count: occurrences };

      if (isSecretWordSolved()) {
        playVictorySound();
      } else if (found) {
        playLetterHitSound();
      } else {
        playLetterMissSound();
      }
      render();
      break;
    }

    case "next-past": {
      if (!state.past.isAnswered) return;
      if (state.past.awaitingLetterPick && !isSecretWordSolved()) return;

      if (state.past.currentIndex >= PAST_QUESTIONS.length - 1) {
        state.past.finished = true;
        playVictorySound();
      } else {
        state.past.currentIndex += 1;
        state.past.selectedOption = null;
        state.past.isAnswered = false;
        state.past.awaitingLetterPick = false;
        state.past.lastLetterResult = null;
        state.past.wheelSpunThisTurn = false;
        state.past.currentSector = null;
        state.past.lastAwardedPoints = 0;
      }
      render();
      break;
    }

    case "toggle-grammar-peek": {
      state.past.showGrammarPeek = !state.past.showGrammarPeek;
      render();
      break;
    }

    case "set-math-level": {
      const level = target.dataset.level;
      if (level && ["all", "1", "2"].includes(level)) {
        resetMathGame(level);
      }
      break;
    }

    case "answer-math": {
      if (state.math.isAnswered) return;
      const optionIdx = Number(target.dataset.option);
      const problems = getFilteredMathProblems();
      const current = problems[state.math.currentIndex];
      if (!current || Number.isNaN(optionIdx)) return;

      const isCorrect = optionIdx === current.correctIndex;
      state.math.selectedOption = optionIdx;
      state.math.isAnswered = true;
      state.math.answeredCount += 1;

      if (isCorrect) {
        state.math.correctCount += 1;
        playCorrectSound();
      } else {
        playWrongSound();
      }
      render();
      break;
    }

    case "next-math": {
      if (!state.math.isAnswered) return;
      const problems = getFilteredMathProblems();
      if (state.math.currentIndex >= problems.length - 1) {
        state.math.finished = true;
        playVictorySound();
      } else {
        state.math.currentIndex += 1;
        state.math.selectedOption = null;
        state.math.isAnswered = false;
      }
      render();
      break;
    }

    case "toggle-all-followups": {
      state.math.showAllFollowups = !state.math.showAllFollowups;
      render();
      break;
    }

    default:
      break;
  }
}

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  if (el.tagName === "A") {
    event.preventDefault();
  }
  handleAction(el);
});

// Initial render
render();
