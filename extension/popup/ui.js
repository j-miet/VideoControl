// user interface logic

const slider = document.getElementById("slider");
const number = document.getElementById("number");

let currentSite = "default";

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

// input slider and number value parsers
slider.addEventListener("input", () => {
  const value = parseFloat(slider.value);

  number.value = value;
  save(value);
});

number.addEventListener("input", () => {
  const value = parseFloat(number.value);

  slider.value = value;
  save(value);
});

// update inputs if changes detected in local storage 'speeds' field
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.speeds) return;

  const speeds = changes.speeds.newValue || {};

  const speed = Number(speeds[currentSite] ?? speeds["default"]) || 1;

  slider.value = speed;
  number.value = speed;
});

load();
