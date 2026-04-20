// extension core logic

const SPEED_STEP = 0.25;
const MAX_SPEED = 128;
const HOTKEYS = {
  decrease: "-",
  increase: "+",
  reset: "*",
};

let siteSpeeds = {}; // speed values for different websites
let currentSpeed = 1; // for tracking current speed and ensuring its validness

function getHostName() {
  return location.hostname;
}

/**
 * Returns stored speed value for current website
 */
function getSpeed() {
  const site = getHostName();
  return siteSpeeds[site] ?? siteSpeeds["default"] ?? 1;
}

/**
 * Set speed value for current website
 */
function setSpeed() {
  if (!Number.isFinite(currentSpeed) || currentSpeed <= 0) return;
  const speed = getSpeed();
  const videos = document.querySelectorAll("video");

  videos.forEach((video) => {
    video.playbackRate = speed;
  });
}

/**
 * Initialize speed value variables using local storage
 */
async function loadSpeedValues() {
  const data = await browser.storage.local.get("speeds");

  siteSpeeds = data.sidespeeds || {};
  currentSpeed = getSpeed();

  setSpeed();
}

/**
 * Update speed values for variables and save data into local storage
 */
async function saveSpeedValue(speed) {
  const site = getHostName();

  currentSpeed = speed;
  siteSpeeds[site] = speed;

  await browser.storage.local.set({ speeds: siteSpeeds });
  setSpeed();
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

    updatedSpeed = Math.max(SPEED_STEP, Math.min(updatedSpeed, MAX_SPEED));
    await saveSpeedValue(updatedSpeed);
  }
});

// listen to ui inputs and update values
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "SET_SPEED") {
    const speed = Number(message.speed);

    if (!Number.isFinite(speed) || speed <= 0) return;

    saveSpeedValue(speed);
  }
});

loadSpeedValues();
