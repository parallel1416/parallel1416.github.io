const STORAGE_KEYS = {
  coinUsed: "story-vending-machine.coin-used",
  phase: "story-vending-machine.phase",
  storyIndex: "story-vending-machine.story-index",
};

const DEFAULT_STORY = {
  title: "The Story Vending Machine",
  messages: [
    "The machine hums awake beneath the carnival tent.",
    "A single brass coin falls through the throat of the cabinet.",
    "The glass screen warms as if something behind it has opened one eye.",
    "This machine dispenses only one story, and it remembers every click.",
    "The gears in the wall begin to turn, one slow tooth at a time.",
    "Some endings arrive as neatly as change. Others rattle for a while.",
  ],
};

const state = {
  phase: "idle",
  coinUsed: false,
  storyIndex: 0,
  busy: false,
  story: null,
};

const machineEl = document.getElementById("machine");
const storyTitleEl = document.getElementById("storyTitle");
const coinCounterEl = document.getElementById("coinCounter");
const coinButtonEl = document.getElementById("coinButton");
const nextButtonEl = document.getElementById("nextButton");
const resetButtonEl = document.getElementById("resetButton");
const toastEl = document.getElementById("toast");
const chatLogEl = document.getElementById("chatLog");
const panelHintEl = document.getElementById("panelHint");
const bootTitleEl = document.getElementById("bootTitle");
const bootSubtitleEl = document.getElementById("bootSubtitle");
const INITIAL_PANEL_HINT = "一枚硬币仅供游玩一次，投币后概不退款。";
const COMPLETE_PANEL_HINT = "随着机器发出的光黯淡下来，屏幕后面的故事也随之沉默。";
const views = {
  idle: document.querySelector('[data-view="idle"]'),
  boot: document.querySelector('[data-view="boot"]'),
  chat: document.querySelector('[data-view="chat"]'),
  complete: document.querySelector('[data-view="complete"]'),
};

const storyPromise = loadStory();

init().catch((error) => {
  console.error("Story vending machine failed to initialize:", error);
  showToast("BOOT FAILURE");
});

async function init() {
  restoreState();

  const story = await storyPromise;
  state.story = story;
  storyTitleEl.textContent = story.title;

  if (state.phase === "active" || state.phase === "complete") {
    renderStoryHistory();
  }

  renderMachine();

  if (state.phase === "booting") {
    await runBootSequence(true);
    return;
  }

  if (state.phase === "active") {
    showView("chat");
    return;
  }

  if (state.phase === "complete") {
    showView("chat");
    return;
  }

  if (state.coinUsed) {
    showToast("OUT OF COINS");
  }

  showView("idle");
}

function restoreState() {
  state.coinUsed = localStorage.getItem(STORAGE_KEYS.coinUsed) === "1";
  state.phase = localStorage.getItem(STORAGE_KEYS.phase) || "idle";
  state.storyIndex = Number.parseInt(localStorage.getItem(STORAGE_KEYS.storyIndex) || "0", 10);

  if (!Number.isFinite(state.storyIndex) || state.storyIndex < 0) {
    state.storyIndex = 0;
  }

  if (!state.coinUsed && state.phase !== "idle") {
    state.phase = "idle";
    state.storyIndex = 0;
  }
}

async function loadStory() {
  try {
    const response = await fetch(new URL("./story.json", window.location.href), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Unable to load story.json (${response.status})`);
    }

    const story = await response.json();
    return normalizeStory(story);
  } catch (error) {
    // Opening from the file system can block fetch() in some browsers, so keep a bundled fallback.
    console.warn("Using bundled fallback story:", error);
    return normalizeStory(DEFAULT_STORY);
  }
}

function normalizeStory(rawStory) {
  const title = typeof rawStory?.title === "string" && rawStory.title.trim()
    ? rawStory.title.trim()
    : DEFAULT_STORY.title;

  const messages = Array.isArray(rawStory?.messages)
    ? rawStory.messages
        .map((message) => (typeof message === "string" ? message.trim() : ""))
        .filter(Boolean)
    : [];

  return {
    title,
    messages: messages.length ? messages : DEFAULT_STORY.messages.slice(),
  };
}

function renderMachine() {
  coinCounterEl.textContent = `COINS: ${state.coinUsed ? 0 : 1}`;
  coinButtonEl.disabled = state.coinUsed || state.phase === "complete" || state.phase === "booting";
  nextButtonEl.disabled = state.phase !== "active" || state.busy || isStoryFinished();
  resetButtonEl.disabled = state.phase === "booting" || state.busy;
  panelHintEl.textContent = state.phase === "complete" ? COMPLETE_PANEL_HINT : INITIAL_PANEL_HINT;

  machineEl.classList.toggle("is-active", state.phase === "booting" || state.phase === "active" || state.phase === "complete");
  machineEl.classList.toggle("is-complete", state.phase === "complete");
  machineEl.classList.toggle("is-idle", state.phase === "idle");
}

function showView(name) {
  for (const [viewName, element] of Object.entries(views)) {
    element.hidden = viewName !== name;
  }
}

async function handleCoinInsert() {
  if (state.coinUsed || state.busy || state.phase === "complete") {
    showToast("OUT OF COINS");
    return;
  }

  state.coinUsed = true;
  state.phase = "booting";
  state.storyIndex = 0;
  persistState();
  renderMachine();

  coinButtonEl.classList.add("is-inserting");
  showView("boot");
  bootTitleEl.textContent = "";
  bootSubtitleEl.textContent = "";
  renderMachine();

  await delay(620);
  coinButtonEl.classList.remove("is-inserting");

  await runBootSequence(false);
}

async function runBootSequence(fromRestore) {
  state.phase = "booting";
  persistState();
  renderMachine();
  showView("boot");

  bootTitleEl.textContent = "";
  bootSubtitleEl.textContent = "";

  await typeText(bootTitleEl, "STORY VENDING MACHINE", 48);
  await delay(240);
  await typeText(bootSubtitleEl, "INITIALIZING...", 52);
  await delay(fromRestore ? 420 : 650);

  state.phase = "active";
  persistState();
  renderMachine();
  showView("chat");
  renderStoryHistory();

  if (isStoryFinished()) {
    finishStory();
  }
}

function renderStoryHistory() {
  if (!state.story) {
    return;
  }

  chatLogEl.innerHTML = "";

  for (let index = 0; index < state.storyIndex; index += 1) {
    appendMessage(state.story.messages[index]);
  }

  if (state.phase === "complete") {
    appendEndMarker();
  }

  scrollChatToBottom(false);
}

async function revealNextMessage() {
  if (state.busy || state.phase !== "active" || isStoryFinished()) {
    return;
  }

  const nextMessage = state.story.messages[state.storyIndex];
  if (!nextMessage) {
    finishStory();
    return;
  }

  state.busy = true;
  persistState();
  renderMachine();

  const typingNode = createTypingIndicator();
  chatLogEl.appendChild(typingNode);
  scrollChatToBottom(true);

  await delay(760);
  typingNode.remove();

  appendMessage(nextMessage);
  state.storyIndex += 1;
  persistState();
  renderMachine();
  scrollChatToBottom(true);

  state.busy = false;
  persistState();
  renderMachine();

  if (isStoryFinished()) {
    await delay(500);
    finishStory();
  }
}

function appendMessage(message) {
  const messageNode = document.createElement("article");
  messageNode.className = "message";
  messageNode.innerHTML = `
    <span class="message__speaker">MACHINE</span>
    <p class="message__body"></p>
  `;
  messageNode.querySelector(".message__body").textContent = message;
  chatLogEl.appendChild(messageNode);
}

function createTypingIndicator() {
  const node = document.createElement("div");
  node.className = "message message--typing";
  node.setAttribute("aria-label", "Machine is typing");
  node.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;
  return node;
}

function scrollChatToBottom(shouldAnimate) {
  if (shouldAnimate) {
    chatLogEl.scrollTo({
      top: chatLogEl.scrollHeight,
      behavior: "smooth",
    });
    return;
  }

  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function finishStory() {
  state.phase = "complete";
  state.busy = false;
  persistState();
  renderMachine();
  renderStoryHistory();
  showView("chat");
  scrollChatToBottom(false);
  showToast("STORY SEALED");
}

function resetMachine() {
  state.phase = "idle";
  state.coinUsed = false;
  state.storyIndex = 0;
  state.busy = false;
  localStorage.removeItem(STORAGE_KEYS.coinUsed);
  localStorage.removeItem(STORAGE_KEYS.phase);
  localStorage.removeItem(STORAGE_KEYS.storyIndex);
  chatLogEl.innerHTML = "";
  renderMachine();
  showView("idle");
  showToast("MACHINE RESET");
}

function appendEndMarker() {
  const marker = document.createElement("article");
  marker.className = "message message--end";
  marker.innerHTML = `
    <span class="message__speaker">SYSTEM</span>
    <p class="message__body">END OF STORY — scroll through the full history above.</p>
  `;
  chatLogEl.appendChild(marker);
}

function persistState() {
  localStorage.setItem(STORAGE_KEYS.coinUsed, state.coinUsed ? "1" : "0");
  localStorage.setItem(STORAGE_KEYS.phase, state.phase);
  localStorage.setItem(STORAGE_KEYS.storyIndex, String(state.storyIndex));
}

function isStoryFinished() {
  return Boolean(state.story) && state.storyIndex >= state.story.messages.length;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add("is-visible");

  window.clearTimeout(showToast.hideTimer);
  showToast.hideTimer = window.setTimeout(() => {
    toastEl.classList.remove("is-visible");
    window.setTimeout(() => {
      toastEl.hidden = true;
    }, 220);
  }, 1700);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function typeText(target, text, speed) {
  return new Promise((resolve) => {
    target.textContent = "";
    let index = 0;

    const tick = () => {
      target.textContent += text.charAt(index);
      index += 1;

      if (index < text.length) {
        window.setTimeout(tick, speed);
        return;
      }

      resolve();
    };

    tick();
  });
}

coinButtonEl.addEventListener("click", handleCoinInsert);
nextButtonEl.addEventListener("click", revealNextMessage);
resetButtonEl.addEventListener("click", resetMachine);
