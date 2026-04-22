// extension core logic

const MAX_SPEED = 128;
const MIN_SPEED = 0.05;
const DEFAULT_HOTKEYS = {
  increase: { key: "+", shift: false, ctrl: false, alt: false },
  decrease: { key: "-", shift: false, ctrl: false, alt: false },
  reset: { key: "*", shift: false, ctrl: false, alt: false },
  forward: { key: "h", shift: true, ctrl: false, alt: false },
  backward: { key: "g", shift: true, ctrl: false, alt: false },
  screenshot: { key: "c", shift: false, ctrl: true, alt: false },
};

let lastVideo = null;
let hotkeys = { ...DEFAULT_HOTKEYS };
let siteSpeeds = {}; // speed values for different websites
let currentSpeed = 1; // for tracking current speed and ensuring its validness
let speedStep = 0.25;
let timeStep = 5;

async function initialize() {
  handleDomChange();

  await loadSettings();
  await loadHotkeys();
  await loadSpeedValues();
}

// settings

async function loadSettings() {
  const data = await browser.storage.local.get("settings");

  const settings = data.settings || {};

  timeStep = settings.timeStep ?? 5;
  speedStep = settings.speedStep ?? 0.25;
}

// hotkeys

async function loadHotkeys() {
  const data = await browser.storage.local.get("hotkeys");

  if (data.hotkeys) {
    hotkeys = normalizeHotkeys({ ...DEFAULT_HOTKEYS, ...data.hotkeys });
  }
}

function normalizeKey(key) {
  // modify only single characters key and leave special keys unchanged
  if (key === " ") return "Space";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function matchesHotkey(e, config) {
  // TODO could implement keycodes with e.code, making this more compatible with different keyboard layouts
  return (
    normalizeKey(e.key) === normalizeKey(config.key) &&
    e.shiftKey === !!config.shift &&
    e.ctrlKey === !!config.ctrl &&
    e.altKey === !!config.alt
  );
}

function normalizeHotkeys(hotkeys) {
  const result = {};

  for (const [action, hk] of Object.entries(hotkeys)) {
    result[action] = {
      ...hk,
      key: normalizeKey(hk.key),
    };
  }

  return result;
}

document.addEventListener("keydown", async (e) => {
  if (e.repeat) return;

  const active = document.activeElement;

  // prevent writing into any input fields
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    return;
  }

  if (["Shift", "Control", "Alt"].includes(e.key)) return; // ignore modifier keys when used alone

  const video = getActiveVideo();
  if (!video) return;

  if (matchesHotkey(e, hotkeys.increase)) {
    let updated = Math.min(currentSpeed + speedStep, MAX_SPEED);
    await saveSpeedValue(updated);

    showOverlay(video, `${updated}x`);
  } else if (matchesHotkey(e, hotkeys.decrease)) {
    let updated = Math.max(currentSpeed - speedStep, MIN_SPEED);
    await saveSpeedValue(updated);

    showOverlay(video, `${updated}x`);
  } else if (matchesHotkey(e, hotkeys.reset)) {
    await saveSpeedValue(1);

    showOverlay(video, `1.0x`);
  } else if (matchesHotkey(e, hotkeys.forward)) {
    video.currentTime += timeStep;

    showOverlay(video, `+${timeStep}s`);
  } else if (matchesHotkey(e, hotkeys.backward)) {
    video.currentTime -= timeStep;

    showOverlay(video, `-${timeStep}s`);
  } else if (matchesHotkey(e, hotkeys.screenshot)) {
    takeScreenshot(video);
  }
});

// video (speed control)
async function loadSpeedValues() {
  const data = await browser.storage.local.get("speeds");

  siteSpeeds = data.speeds || {};
  currentSpeed = getSpeed();

  setSpeed();
}

async function saveSpeedValue(speed) {
  const site = getHostName();

  currentSpeed = speed;
  siteSpeeds[site] = speed;

  await browser.storage.local.set({ speeds: siteSpeeds });
  setSpeed();
}

function getHostName() {
  return location.hostname;
}

function getSpeed() {
  const site = getHostName();
  return siteSpeeds[site] ?? siteSpeeds["default"] ?? 1;
}

function setSpeed() {
  if (!Number.isFinite(currentSpeed) || currentSpeed <= 0) return;

  const video = getActiveVideo();
  if (!video) return;

  createSpeedOverlay(video);

  if (video.playbackRate !== currentSpeed) {
    video.playbackRate = currentSpeed;
    showOverlay(video, currentSpeed);
  }
}

function createSpeedOverlay(video) {
  if (video.__speedOverlay) return;

  const overlay = document.createElement("div");

  Object.assign(overlay.style, {
    position: "absolute",
    top: "8px",
    left: "8px",
    background: "rgba(0,0,0,0.5)",
    color: "white",
    padding: "3px 8px",
    fontSize: "13px",
    borderRadius: "6px",
    zIndex: 999999,
    pointerEvents: "none",
    fontFamily: "sans-serif",
    opacity: "0",
    transition: "opacity 0.2s ease",
  });

  const parent = video.parentElement;
  if (!parent) return;

  const style = window.getComputedStyle(parent);
  if (style.position === "static") parent.style.position = "relative";

  parent.appendChild(overlay);

  video.__speedOverlay = overlay;
  video.__overlayTimeout = null;
}

function showOverlay(video, text) {
  const overlay = video.__speedOverlay;
  if (!overlay) return;

  overlay.textContent = text;
  overlay.style.opacity = "1";

  if (video.__overlayTimeout) {
    clearTimeout(video.__overlayTimeout);
  }

  video.__overlayTimeout = setTimeout(() => {
    overlay.style.opacity = "0";
  }, 1500);
}

function attachSpeedListeners() {
  const videos = document.querySelectorAll("video");

  videos.forEach((video) => {
    if (video.__rateListenerAttached) return;

    video.__rateListenerAttached = true;

    // speed enforcing: this way pausing or moving to another timestamp won't default back to 1.0x speed
    video.addEventListener("ratechange", () => {
      if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
        video.playbackRate = currentSpeed;
      }
    });
  });
}

function handleDomChange() {
  attachSpeedListeners();

  const video = getActiveVideo();

  if (video && video !== lastVideo) {
    lastVideo = video;
    setSpeed();
  }
}

// if any changes in DOM tree, re-apply speed modifier. Also add periodical updater if no changes are detected
const observer = new MutationObserver(handleDomChange);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

setInterval(handleDomChange, 1000);

// video (utils)
function getActiveVideo() {
  let video = null;
  if (location.hostname.includes("youtube.com")) {
    video = document.querySelector("video.html5-main-video");
  } else if (location.hostname.includes("twitch.tv")) {
    video = document.querySelector("video");
  }

  if (video) {
    return video;
  } else {
    const videos = Array.from(document.querySelectorAll("video"));

    let best = null;
    let bestScore = 0;

    for (const video of videos) {
      if (!video.isConnected) continue;

      const rect = video.getBoundingClientRect();

      if (
        rect.width < 200 ||
        rect.height < 150 ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight
      )
        continue;

      const isPlaying =
        !video.paused && video.currentTime > 0 && video.readyState > 2; // prioritize playing videos

      const score = rect.width * rect.height * (isPlaying ? 2 : 1);

      // find most suitable candidate for main video
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }

    return best;
  }
}

async function takeScreenshot(video) {
  try {
    const canvas = document.createElement("canvas");

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
          }),
        ]);

        showOverlay(video, "Screenshot Copied!");
      } catch (err) {
        console.error("Clipboard write failed:", err);
        showOverlay(video, "ScreenShot Failed");
      }
    }, "image/png");
  } catch (err) {
    console.error("Screenshot failed:", err);
  }
}

// synchronization with ui values
browser.runtime.onMessage.addListener((message) => {
  // listen to ui inputs and update values, also onMessage should always return a promise
  if (message?.type === "SET_SPEED") {
    const speed = Number(message.speed);

    if (!Number.isFinite(speed) || speed <= 0) return Promise.resolve();

    saveSpeedValue(speed);
  }

  if (message?.type === "SCREENSHOT") {
    const video = getActiveVideo();
    if (!video) return;

    takeScreenshot(video);
  }

  if (message?.type === "UPDATE_SETTINGS") {
    timeStep = message.settings?.timeStep ?? timeStep;
    speedStep = message.settings?.speedStep ?? speedStep;
  }

  return Promise.resolve();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.hotkeys) {
    hotkeys = { ...DEFAULT_HOTKEYS, ...changes.hotkeys.newValue };
  }
});

initialize();
