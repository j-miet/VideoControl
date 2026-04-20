// user interface logic

const slider = document.getElementById("slider");
const number = document.getElementById("number");

async function load() {
  const data = await browser.storage.local.get("speed");
  const speed = Number(data.speed) || 1;

  slider.value = speed;
  number.value = speed;
}

async function save(speed) {
  const val = Number(speed) || 1;

  await browser.storage.local.set({ speed: val });

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "SET_SPEED",
      speed,
    });
  }
}

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

load();
