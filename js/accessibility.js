/**
 * AccessibilityProvider / AccessibilityContext / AccessibilityHooks / Storage / Utils.
 * Vanilla module used globally by CargaNet to provide WCAG-oriented user preferences.
 */
const STORAGE_KEY = "carganet.accessibility.preferences";
const DEFAULTS = {
  highContrast: false,
  fontSize: "100",
  zoom: "100",
  cursorLarge: false,
  highlightLinks: false,
  spacing: false,
  reduceMotion: false,
  dyslexiaFont: false,
  largeButtons: false
};

const OPTIONS = {
  fontSize: ["100", "110", "125", "150", "175"],
  zoom: ["100", "110", "125", "150"]
};

const state = { ...DEFAULTS, reading: false, paused: false, utterance: null, lastFocus: null };
const root = document.documentElement;

const AccessibilityStorage = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  },
  save(preferences) {
    const persisted = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, preferences[key]]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
};

function setPreference(key, value) {
  state[key] = value;
  AccessibilityStorage.save(state);
  applyPreferences();
  syncControls();
}

function applyPreferences() {
  root.dataset.a11yContrast = String(state.highContrast);
  root.dataset.a11yCursor = String(state.cursorLarge);
  root.dataset.a11yLinks = String(state.highlightLinks);
  root.dataset.a11ySpacing = String(state.spacing);
  root.dataset.a11yMotion = String(state.reduceMotion);
  root.dataset.a11yDyslexia = String(state.dyslexiaFont);
  root.dataset.a11yButtons = String(state.largeButtons);
  root.style.setProperty("--a11y-font-scale", Number(state.fontSize) / 100);
  root.style.setProperty("--a11y-ui-zoom", Number(state.zoom) / 100);
}

function getReadableText() {
  const main = document.querySelector("main, [role='main'], .auth-shell") || document.body;
  const clone = main.cloneNode(true);
  clone.querySelectorAll("script, style, canvas, .accessibility-widget, [aria-hidden='true']").forEach((node) => node.remove());
  return clone.innerText.replace(/\s+/g, " ").trim();
}

function speak(action = "play") {
  if (!("speechSynthesis" in window)) {
    alert("Tu navegador no soporta lectura en voz alta.");
    return;
  }

  if (action === "toggle") {
    if (state.reading) {
      speak("stop");
    } else {
      speak("play");
    }
    return;
  }

  if (action === "stop") {
    speechSynthesis.cancel();
    state.reading = false;
    state.paused = false;
    syncControls();
    return;
  }

  if (action === "pause" && speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    state.paused = true;
    syncControls();
    return;
  }

  if (action === "resume" && speechSynthesis.paused) {
    speechSynthesis.resume();
    state.paused = false;
    syncControls();
    return;
  }

  speechSynthesis.cancel();
  state.utterance = new SpeechSynthesisUtterance(getReadableText());
  state.utterance.lang = "es-ES";
  state.utterance.rate = 0.95;
  state.utterance.onend = () => { state.reading = false; state.paused = false; syncControls(); };
  state.reading = true;
  state.paused = false;
  speechSynthesis.speak(state.utterance);
  syncControls();
}

function togglePanel(open) {
  const panel = document.getElementById("accessibilityPanel");
  const backdrop = document.getElementById("accessibilityBackdrop");
  const button = document.getElementById("accessibilityButton");
  const shouldOpen = open ?? panel.hidden;
  panel.hidden = !shouldOpen;
  backdrop.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
  document.body.classList.toggle("a11y-panel-open", shouldOpen);
  if (shouldOpen) {
    state.lastFocus = document.activeElement;
    panel.querySelector("button, input, select")?.focus();
  } else {
    state.lastFocus?.focus?.();
  }
}

function switchControl(id, label, key) {
  return `<label class="a11y-switch" for="${id}"><span>${label}</span><input id="${id}" type="checkbox" data-a11y-key="${key}"></label>`;
}

function renderWidget() {
  const widget = document.createElement("section");
  widget.className = "accessibility-widget";
  widget.setAttribute("aria-label", "Herramientas de accesibilidad");
  widget.innerHTML = `
    <div class="accessibility-toolbar" role="region" aria-label="Accesos rápidos de accesibilidad">
      <button id="a11yQuickRead" class="accessibility-quick accessibility-quick-read" type="button" data-speech="toggle" aria-label="Leer página en voz alta">🔊 <span>Leer página</span></button>
      <button id="a11yQuickContrast" class="accessibility-quick accessibility-quick-contrast" type="button" aria-pressed="false" aria-label="Activar alto contraste">◐ <span>Contraste</span></button>
      <button id="accessibilityButton" class="accessibility-settings" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="accessibilityPanel" aria-label="Abrir más opciones de accesibilidad">⚙️</button>
    </div>
    <div id="accessibilityBackdrop" class="accessibility-backdrop" hidden></div>
    <aside id="accessibilityPanel" class="accessibility-panel" role="dialog" aria-modal="true" aria-labelledby="a11yTitle" hidden>
      <div class="a11y-panel-header"><div><p class="a11y-eyebrow">CargaNet</p><h2 id="a11yTitle">Accesibilidad</h2></div><button id="a11yClose" class="a11y-icon-button" type="button" aria-label="Cerrar panel">×</button></div>
      <p class="a11y-description">Ajusta la experiencia visual, motriz y de lectura. Tus preferencias se guardan en este navegador.</p>
      <div class="a11y-control"><label for="a11yFontSize">Tamaño del texto</label><select id="a11yFontSize" data-a11y-key="fontSize">${OPTIONS.fontSize.map(v => `<option value="${v}">${v}%</option>`).join("")}</select></div>
      <div class="a11y-control"><label for="a11yZoom">Zoom de interfaz</label><select id="a11yZoom" data-a11y-key="zoom">${OPTIONS.zoom.map(v => `<option value="${v}">${v}%</option>`).join("")}</select></div>
      ${switchControl("a11yContrast", "Alto contraste", "highContrast")}
      ${switchControl("a11yCursor", "Cursor grande", "cursorLarge")}
      ${switchControl("a11yLinks", "Resaltar enlaces", "highlightLinks")}
      ${switchControl("a11ySpacing", "Espaciado del texto", "spacing")}
      ${switchControl("a11yMotion", "Reducir animaciones", "reduceMotion")}
      ${switchControl("a11yDyslexia", "Fuente amigable para dislexia", "dyslexiaFont")}
      ${switchControl("a11yButtons", "Botones grandes", "largeButtons")}
      <div class="a11y-reader" aria-label="Lectura en voz alta"><button type="button" data-speech="play">Leer página</button><button type="button" data-speech="pause">Pausar</button><button type="button" data-speech="resume">Continuar</button><button type="button" data-speech="stop">Detener</button></div>
      <button id="a11yReset" class="a11y-reset" type="button">Restablecer configuración</button>
    </aside>`;
  document.body.append(widget);
}

function syncControls() {
  document.querySelectorAll("[data-a11y-key]").forEach((control) => {
    const key = control.dataset.a11yKey;
    if (control.type === "checkbox") control.checked = Boolean(state[key]);
    else control.value = state[key];
  });
  document.querySelectorAll("[data-speech='pause'], [data-speech='resume'], [data-speech='stop']").forEach((button) => {
    button.disabled = !state.reading;
  });
  const quickRead = document.getElementById("a11yQuickRead");
  if (quickRead) {
    quickRead.setAttribute("aria-pressed", String(state.reading));
    quickRead.setAttribute("aria-label", state.reading ? "Detener lectura en voz alta" : "Leer página en voz alta");
    quickRead.querySelector("span").textContent = state.reading ? "Detener lectura" : "Leer página";
  }
  const quickContrast = document.getElementById("a11yQuickContrast");
  if (quickContrast) {
    quickContrast.setAttribute("aria-pressed", String(state.highContrast));
    quickContrast.setAttribute("aria-label", state.highContrast ? "Desactivar alto contraste" : "Activar alto contraste");
  }
}

function improveSemantics() {
  document.querySelectorAll("aside.sidebar").forEach((sidebar) => sidebar.setAttribute("aria-label", "Navegación principal"));
  document.querySelectorAll("main").forEach((main) => main.setAttribute("role", "main"));
  document.querySelectorAll("button:not([aria-label])").forEach((button) => button.setAttribute("aria-label", button.textContent.trim() || "Botón"));
  document.querySelectorAll("input, select, textarea").forEach((field) => {
    if (field.id && !document.querySelector(`label[for='${field.id}']`) && !field.getAttribute("aria-label")) {
      field.setAttribute("aria-label", field.placeholder || field.title || field.id);
    }
  });
  document.querySelectorAll("canvas:not([role])").forEach((canvas) => {
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", canvas.previousElementSibling?.textContent?.trim() || "Gráfico de datos");
  });
}

function bindEvents() {
  document.getElementById("accessibilityButton").addEventListener("click", () => togglePanel());
  document.getElementById("a11yQuickContrast").addEventListener("click", () => setPreference("highContrast", !state.highContrast));
  document.getElementById("a11yClose").addEventListener("click", () => togglePanel(false));
  document.getElementById("accessibilityBackdrop").addEventListener("click", () => togglePanel(false));
  document.getElementById("a11yReset").addEventListener("click", () => { Object.assign(state, DEFAULTS); AccessibilityStorage.clear(); window.speechSynthesis?.cancel(); applyPreferences(); syncControls(); });
  document.addEventListener("change", (event) => {
    const key = event.target.dataset?.a11yKey;
    if (key) setPreference(key, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });
  document.addEventListener("click", (event) => {
    if (event.target.dataset?.speech) speak(event.target.dataset.speech);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") togglePanel(false);
  });
}

function initAccessibilityProvider() {
  Object.assign(state, AccessibilityStorage.load());
  applyPreferences();
  improveSemantics();
  renderWidget();
  bindEvents();
  syncControls();
}

document.addEventListener("DOMContentLoaded", initAccessibilityProvider);
