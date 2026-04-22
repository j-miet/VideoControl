// user interface logic

const DEFAULT_HOTKEYS = {
  increase: { key: "+", shift: false, ctrl: false, alt: false },
  decrease: { key: "-", shift: false, ctrl: false, alt: false },
  reset: { key: "*", shift: false, ctrl: false, alt: false },
  forward: { key: "h", shift: true, ctrl: false, alt: false },
  backward: { key: "g", shift: true, ctrl: false, alt: false },
  screenshot: { key: "c", shift: false, ctrl: true, alt: false },
};
const LABELS = {
  increase: {
    label: "Increase speed",
    title: "Increase video speed based on current speed value",
  },
  decrease: {
    label: "Decrease speed",
    title: "Decrease video speed based on current speed value",
  },
  reset: {
    label: "Reset speed",
    title: "Reset video speed to 1.0x",
  },
  forward: {
    label: "Forward",
    title: "Jump forward by amount defined in time step",
  },
  backward: {
    label: "Backward",
    title: "Jump backward by amount defined in time step",
  },
  screenshot: {
    label: "Screenshot",
    title:
      "Take screenshot of current main video frame and copy it to clipboard",
  },
};
// remember to adjust html if you change these values
const MIN_SPEED = 0.05;
const MAX_SPEED = 128;
const MIN_TIMESTEP = 1;
const MAX_TIMESTEP = 300;

const slider = document.getElementById("slider");
const number = document.getElementById("number");
const btn = document.getElementById("screenshotButton");
const timestepInput = document.getElementById("timeStep");
const speedstepInput = document.getElementById("speedStep");

let hotkeys = {};
let currentSite = "default";
let recordingAction = null;

async function loadSettingsUI() {
  const data = await browser.storage.local.get("settings");
  const settings = data.settings || {};

  timestepInput.value = settings.timeStep ?? 5;
  speedstepInput.value = settings.speedStep ?? 0.25;

  updateLabels(settings);
}

async function loadHotkeysUI() {
  const data = await browser.storage.local.get("hotkeys");
  hotkeys = { ...DEFAULT_HOTKEYS, ...(data.hotkeys || {}) };

  renderHotkeys();
}

async function saveHotkeys() {
  await browser.storage.local.set({ hotkeys });
}

async function load() {
  currentSite = await getCurrentSite();
  document.getElementById("site").textContent = currentSite;

  const data = await browser.storage.local.get("speeds");
  const siteSpeeds = data.speeds || {};

  const speed = Number(siteSpeeds[currentSite]) || 1;

  slider.value = speed;
  number.value = speed;
}

async function save(speed) {
  const val = Number(speed) || 1;

  const data = await browser.storage.local.get("speeds");
  const siteSpeeds = data.speeds || {};

  siteSpeeds[currentSite] = val;

  await browser.storage.local.set({ speeds: siteSpeeds });

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "SET_SPEED",
      speed: val,
    });
  }
}

async function getCurrentSite() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) return "default";

  try {
    const url = new URL(tab.url);

    if (!url.hostname) return "default";

    return url.hostname;
  } catch {
    return "default";
  }
}

function formatHotkey(hk) {
  const parts = [];

  if (hk.ctrl) parts.push("Ctrl");
  if (hk.shift) parts.push("Shift");
  if (hk.alt) parts.push("Alt");

  let key = hk.key;

  if (key === " ") key = "Space";
  if (key.startsWith("Arrow")) key = key.replace("Arrow", "");

  parts.push(key.toUpperCase?.() === key ? key : key);

  return parts.join(" + ");
}

function renderHotkeys() {
  const container = document.getElementById("hotkeys");
  container.innerHTML = "";

  Object.entries(hotkeys).forEach(([action, config]) => {
    const row = document.createElement("div");
    row.className = "hotkey-row";

    const label = document.createElement("span");
    label.textContent = LABELS[action].label || action;
    label.title = LABELS[action].title || "";

    const btn = document.createElement("button");
    btn.className = "hotkey-button";
    btn.textContent = formatHotkey(config);

    btn.addEventListener("click", () => startRecording(action, btn));

    row.appendChild(label);
    row.appendChild(btn);
    container.appendChild(row);
  });
}

function normalizeKey(key) {
  // if any changes are needed here, make sure to update matching functionality in control.js
  if (key === " ") return "Space";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function startRecording(action, btn) {
  recordingAction = action;

  btn.classList.add("recording");
  btn.textContent = "Press keys...";

  function handler(e) {
    e.stopPropagation();
    e.preventDefault();

    // ignore modifier presses alone, they must be used together with another key
    if (["Shift", "Control", "Alt"].includes(e.key)) {
      return;
    }

    const newHotkey = {
      key: normalizeKey(e.key),
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };

    hotkeys[recordingAction] = newHotkey;

    saveHotkeys();

    recordingAction = null;
    window.removeEventListener("keydown", handler);

    renderHotkeys();
  }

  window.addEventListener("keydown", handler);
}

function updateLabels(settings) {
  document.getElementById("speedStepValue").textContent =
    `${Number(settings.speedStep ?? 0.25).toFixed(2)}x`;

  document.getElementById("timeStepValue").textContent =
    `${settings.timeStep ?? 5}s`;
}

function clampSpeed(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) return 1;

  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, num));
}

timestepInput.addEventListener("input", async () => {
  const val = Math.max(1, Math.min(300, Number(timestepInput.value) || 5));

  timestepInput.value = val;

  const data = await browser.storage.local.get("settings");
  const settings = data.settings || {};

  settings.timeStep = val;

  await browser.storage.local.set({ settings });

  updateLabels(settings);

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "UPDATE_SETTINGS",
      settings,
    });
  }
});

speedstepInput.addEventListener("input", async () => {
  const val = Math.max(0.05, Math.min(5, Number(speedstepInput.value) || 0.25));

  speedstepInput.value = val;

  const data = await browser.storage.local.get("settings");
  const settings = data.settings || {};

  settings.speedStep = val;

  await browser.storage.local.set({ settings });

  updateLabels(settings);

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "UPDATE_SETTINGS",
      settings,
    });
  }
});

// input slider and number value parsers
slider.addEventListener("input", () => {
  const value = clampSpeed(slider.value);

  number.value = value;
  slider.value = value;

  save(value);
});

number.addEventListener("input", () => {
  const value = clampSpeed(number.value);

  slider.value = value;
  number.value = value;

  save(value);
});

number.addEventListener("blur", () => {
  const value = clampSpeed(number.value);

  number.value = value;
  slider.value = value;
});

// update inputs if changes detected in local storage 'speeds' field
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.speeds) return;

  const speeds = changes.speeds.newValue || {};

  const speed = Number(speeds[currentSite]) || 1;

  slider.value = speed;
  number.value = speed;
});

// screenshot
btn.addEventListener("click", async () => {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "SCREENSHOT",
    });
  }
});

load();
loadSettingsUI();
loadHotkeysUI();
