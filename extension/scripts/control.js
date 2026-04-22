// extension core logic

const SPEED_STEP = 0.25;
const TIME_STEP = 10;
const MAX_SPEED = 128;
const HOTKEYS = {
  decrease: "-",
  increase: "+",
  reset: "*",
  forward: "ArrowRight",
  backward: "ArrowLeft",
  screenshot: "S",
};

let siteSpeeds = {}; // speed values for different websites
let currentSpeed = 1; // for tracking current speed and ensuring its validness

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

  createOverlay(video);

  if (video.playbackRate !== currentSpeed) {
    video.playbackRate = currentSpeed;
    showOverlay(video, currentSpeed);
  }
}

function createOverlay(video) {
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

function getActiveVideo() {
  const videos = Array.from(document.querySelectorAll("video"));

  let best = null;
  let bestScore = 0;

  for (const video of videos) {
    const rect = video.getBoundingClientRect();

    if (
      rect.width < 200 ||
      rect.height < 150 ||
      rect.bottom < 0 ||
      rect.top > window.innerHeight
    ) {
      continue;
    }

    const score = rect.width * rect.height;

    // find active video by comparing video size
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }

  return best;
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

// if any changes in DOM tree, re-apply speed modifier
const observer = new MutationObserver(() => {
  setSpeed();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// hotkeys
document.addEventListener("keydown", async (e) => {
  // prevent writing into any input fields
  if (["input", "textarea"].includes(document.activeElement.tagName)) return;

  const video = getActiveVideo();
  if (!video) return;

  if (
    e.key === HOTKEYS.decrease ||
    e.key === HOTKEYS.increase ||
    e.key === HOTKEYS.reset
  ) {
    let updatedSpeed = currentSpeed;

    if (e.key === HOTKEYS.increase) {
      updatedSpeed += SPEED_STEP;
    } else if (e.key === HOTKEYS.decrease) {
      updatedSpeed -= SPEED_STEP;
    } else if (e.key === HOTKEYS.reset) {
      updatedSpeed = 1;
    }
    showOverlay(video, `${currentSpeed.toFixed(2)}x`);

    updatedSpeed = Math.max(SPEED_STEP, Math.min(updatedSpeed, MAX_SPEED));
    await saveSpeedValue(updatedSpeed);
  }

  if (e.shiftKey && e.key === HOTKEYS.forward) {
    video.currentTime += TIME_STEP;
    showOverlay(video, `+${SEEK_STEP}s`);
  } else if (e.shiftKey && e.key === HOTKEYS.backward) {
    video.currentTime -= TIME_STEP;
    showOverlay(video, `-${SEEK_STEP}s`);
  } else if (e.shiftKey && e.key === HOTKEYS.screenshot) {
    const video = getActiveVideo();
    if (!video || e.repeat) return;

    takeScreenshot(video);
    showOverlay(video, "Screenshot...");
  }
});

// listen to ui inputs and update values, also onMessage should always return a promise
browser.runtime.onMessage.addListener((message) => {
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

  return Promise.resolve();
});

loadSpeedValues();
