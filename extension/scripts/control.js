// core logic

const SPEED_STEP = 0.25;
const MAX_SPEED = 128;
const HOTKEYS = {
  decrease: "-",
  increase: "+",
  reset: "*",
};

let currentSpeed = 1;

function setSpeed() {
  if (!Number.isFinite(currentSpeed) || currentSpeed <= 0) return;

  const videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    if (video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
  });
}

async function loadSpeed() {
  const data = await browser.storage.local.get("speed");
  currentSpeed = Number(data.speed) || 1;
  setSpeed();
}

async function saveSpeed(speed) {
  currentSpeed = speed;
  await browser.storage.local.set({ speed });
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

    await saveSpeed(updatedSpeed);
  }
});

loadSpeed();
