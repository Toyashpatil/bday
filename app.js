const UNLOCK_HOUR = 22; // 10:00 PM local time
const BIRTHDAY = "2026-10-20";
const STORAGE_PREFIX = "birthday2026_";

// Optional production backend. Configure SUPABASE_URL and SUPABASE_ANON_KEY
// in config.js before deployment. The public page never receives a service-role key.
const BACKEND_CONFIG = window.BIRTHDAY_BACKEND || {};
let supabaseClient = null;
let remoteTestModeEnabled = false;
let remoteManualUnlocks = {};

function initBackend() {
  if (!BACKEND_CONFIG.url || !BACKEND_CONFIG.anonKey || !window.supabase) return false;
  try {
    supabaseClient = window.supabase.createClient(BACKEND_CONFIG.url, BACKEND_CONFIG.anonKey);
    return true;
  } catch (error) {
    console.error("Backend initialization failed:", error);
    return false;
  }
}

function visitorId() {
  const key = `${STORAGE_PREFIX}visitor_id`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

async function loadRemoteSettings() {
  if (!supabaseClient) return;
  try {
    const [{ data: testMode, error: testError }, { data: manualUnlocks, error: unlockError }] = await Promise.all([
      supabaseClient.rpc("get_test_mode"),
      supabaseClient.rpc("get_manual_unlocks")
    ]);
    if (testError) throw testError;
    if (unlockError) throw unlockError;
    remoteTestModeEnabled = testMode === true;
    remoteManualUnlocks = manualUnlocks && typeof manualUnlocks === "object" ? manualUnlocks : {};
  } catch (error) {
    console.warn("Could not load remote settings; keeping manual unlocks disabled.", error);
    remoteTestModeEnabled = false;
    remoteManualUnlocks = {};
  }
}

async function saveAnswerToBackend(day, answer) {
  if (!supabaseClient) return false;
  const { error } = await supabaseClient.rpc("submit_birthday_answer", {
    p_chapter_day: day,
    p_answer: answer,
    p_visitor_id: visitorId()
  });
  if (error) {
    console.error("Could not save answer to backend:", error);
    return false;
  }
  return true;
}

let activeDay = null;

const TEST_KEY = `${STORAGE_PREFIX}test_mode`;
let testState = JSON.parse(localStorage.getItem(TEST_KEY) || '{"enabled":false,"date":"2026-10-02","time":"21:59"}');

function persistTestState() {
  localStorage.setItem(TEST_KEY, JSON.stringify(testState));
}

const $ = (selector) => document.querySelector(selector);

function localNow() {
  if (testState.enabled) {
    const [y, m, d] = testState.date.split("-").map(Number);
    const [hh, mm] = testState.time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0);
  }
  const d = new Date();
  return new Date(
    d.getFullYear(), d.getMonth(), d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds()
  );
}

function unlockAt(item) {
  const [y, m, d] = item.date.split("-").map(Number);
  return new Date(y, m - 1, d, UNLOCK_HOUR, 0, 0);
}

function isUnlocked(item) {
  return remoteManualUnlocks[String(item.day)] === true || localNow() >= unlockAt(item);
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long"
  });
}

function formatDateTime(date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }) + " at " + date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function storageKey(day) {
  return `${STORAGE_PREFIX}answer_${day}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[char]));
}

function renderTimeline() {
  const timeline = $("#timeline");
  timeline.innerHTML = "";

  BIRTHDAY_CONTENT.forEach(item => {
    const unlocked = isUnlocked(item);
    const article = document.createElement("article");
    article.className = `chapter ${unlocked ? "unlocked" : "locked"}`;

    if (unlocked) {
      article.innerHTML = `
        <div class="marker"></div>
        <div class="chapter-open-area">
          <div class="chapter-number">Day ${item.day}</div>
          <button class="chapter-name" data-day="${item.day}">
            ${escapeHTML(item.title)}
          </button>
          <div class="chapter-date">${formatDate(item.date)} · Unlocked at 10:00 PM</div>
        </div>
      `;
    } else {
      article.innerHTML = `
        <div class="marker"></div>
        <button class="sealed-chapter" data-locked-day="${item.day}">
          <div class="seal-star">✦</div>
          <div class="sealed-copy">
            <div class="sealed-word">SEALED</div>
            <div class="sealed-until">Sealed until ${formatDateTime(unlockAt(item))}</div>
          </div>
        </button>
      `;
    }

    timeline.appendChild(article);
  });

  document.querySelectorAll("[data-day]").forEach(button => {
    button.addEventListener("click", () => openChapter(Number(button.dataset.day)));
  });

  document.querySelectorAll("[data-locked-day]").forEach(button => {
    button.addEventListener("click", () => showLockedChapter(Number(button.dataset.lockedDay)));
  });

  const finaleButton = $("#finaleButton");
  if (finaleButton) {
    const unlocked = isBirthdayFinaleUnlocked();
    finaleButton.textContent = unlocked ? "Enter the last page" : "Sealed until October 20 · 10:00 PM";
    finaleButton.addEventListener("click", openFinale);
    $("#finaleStatus").textContent = unlocked
      ? "The last page is finally open."
      : "Some things are worth waiting for.";
  }
}

function isBirthdayFinaleUnlocked() {
  const finaleDate = new Date(2026, 9, 20, UNLOCK_HOUR, 0, 0);
  return remoteManualUnlocks.finale === true || localNow() >= finaleDate;
}

function openBirthdayDay(day) { openChapter(day); }

function openChapter(day) {
  const item = BIRTHDAY_CONTENT.find(entry => entry.day === day);

  // Never open a future story. Show its sealed state instead.
  if (!item) return;
  if (!isUnlocked(item)) {
    showLockedChapter(day);
    return;
  }

  activeDay = item;
  showModal();
  showSeal();
}

function openFinale() {
  if (!isBirthdayFinaleUnlocked()) {
    showBirthdayLocked();
    return;
  }

  activeDay = { day: 20, date: BIRTHDAY, title: "October 20" };
  showModal();
  showFinaleSeal();
}

function showBirthdayLocked() {
  activeDay = { day: 20, date: BIRTHDAY, title: "October 20" };
  showModal();
  ["#sealStage", "#storyStage", "#finaleLetterStage"].forEach(sel => { $(sel).hidden = true; });
  $("#finaleSealStage").hidden = false;
  $("#finaleSealStage").classList.remove("finale-seal-enter");
  void $("#finaleSealStage").offsetWidth;
  $("#finaleSealStage").classList.add("finale-seal-enter");
  $("#sealDay").textContent = "";
  $("#openButton").disabled = true;
  $("#finaleOpenButton").disabled = true;
  $("#finaleOpenButton").textContent = "SEALED UNTIL OCTOBER 20";
  $("#finaleSealStage .seal-copy").innerHTML = `The last page is sealed until <span class="sealed-modal-time">${formatDateTime(new Date(2026, 9, 20, UNLOCK_HOUR, 0, 0))}</span>.<br>Some things are worth waiting for.`;
}

function showFinaleSeal() {
  ["#sealStage", "#storyStage", "#finaleLetterStage"].forEach(sel => { $(sel).hidden = true; });
  $("#finaleSealStage").hidden = false;
  $("#finaleSealStage").classList.remove("finale-seal-enter");
  void $("#finaleSealStage").offsetWidth;
  $("#finaleSealStage").classList.add("finale-seal-enter");
  $("#finaleOpenButton").disabled = false;
  $("#finaleOpenButton").textContent = "OPEN THE LAST PAGE";
}

function revealFinale() {
  if (!isBirthdayFinaleUnlocked()) return;
  const seal = $("#finaleSealStage");
  seal.classList.add("finale-seal-opening");
  launchGrandReveal();

  window.setTimeout(() => {
    if (!activeDay || activeDay.day !== 20) return;
    seal.hidden = true;
    $("#finaleLetterStage").hidden = false;

    const finale = window.BIRTHDAY_FINALE || {};
    $("#finaleEyebrow").textContent = finale.eyebrow || "For you";
    $("#finaleTitle").textContent = finale.title || "One last little thing.";
    $("#finaleIntro").textContent = finale.intro || "";
    const paragraphs = Array.isArray(finale.letter) ? finale.letter : [];
    $("#letterPaper").innerHTML = paragraphs.map((paragraph, index) => {
      const cls = index === 0 ? "letter-greeting" : (index === paragraphs.length - 1 ? "letter-signoff" : "");
      return `<p class="${cls}">${escapeHTML(paragraph)}</p>`;
    }).join("");

    $("#finaleLetterStage").classList.remove("finale-letter-enter");
    requestAnimationFrame(() => $("#finaleLetterStage").classList.add("finale-letter-enter"));
  }, 900);
}

function launchGrandReveal() {
  const symbols = ["✦", "♡", "✧", "❀", "·", "✦", "♡"];
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 150; i++) {
    const piece = document.createElement("span");
    piece.className = "grand-particle";
    piece.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    piece.style.left = `${35 + Math.random() * 30}vw`;
    piece.style.top = `${40 + Math.random() * 20}vh`;
    piece.style.fontSize = `${10 + Math.random() * 22}px`;
    piece.style.setProperty("--x", `${(Math.random() - .5) * 100}vw`);
    piece.style.setProperty("--y", `${(Math.random() - .5) * 100}vh`);
    piece.style.setProperty("--delay", `${Math.random() * .45}s`);
    fragment.appendChild(piece);
  }
  document.body.appendChild(fragment);
  setTimeout(() => document.querySelectorAll(".grand-particle").forEach(n => n.remove()), 3600);
}

function showLockedChapter(day) {
  const item = BIRTHDAY_CONTENT.find(entry => entry.day === day);
  if (!item) return;

  activeDay = item;
  showModal();

  $("#sealStage").hidden = false;
  $("#storyStage").hidden = true;
  $("#sealStage").classList.remove("seal-enter", "seal-opening");
  void $("#sealStage").offsetWidth;
  $("#sealStage").classList.add("seal-enter");

  $("#sealDay").textContent = `DAY ${item.day} · SEALED`;
  $("#sealTitle").textContent = `Sealed until ${formatDateTime(unlockAt(item))}`;
  $(".seal-copy").innerHTML = `This little chapter is still waiting for its moment.<br><span class="sealed-modal-time">It opens at exactly 10:00 PM.</span>`;
  $("#openButton").disabled = true;
  $("#openButton").textContent = "NOT YET";
}

function showModal() {
  $("#modal").classList.add("visible");
  $("#modal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function showSeal() {
  $("#sealStage").hidden = false;
  $("#storyStage").hidden = true;
  $("#sealStage").classList.remove("seal-enter", "seal-opening");
  void $("#sealStage").offsetWidth;
  $("#sealStage").classList.add("seal-enter");

  $("#sealDay").textContent = `DAY ${activeDay.day} · ${formatDate(activeDay.date)}`;
  $("#sealTitle").textContent = "A little something.";
  $(".seal-copy").innerHTML = `I could tell you what's inside.<br>But where's the fun in that?`;
  $("#openButton").disabled = false;
  $("#openButton").textContent = "OPEN";
}

function revealStory() {
  if (!activeDay || !isUnlocked(activeDay)) return;

  const dayAtReveal = activeDay.day;
  const itemAtReveal = activeDay;
  launchConfetti();

  const seal = $("#sealStage");
  seal.classList.add("seal-opening");

  window.setTimeout(() => {
    // Prevent a delayed animation from rendering an old story after the modal
    // was closed or another chapter was selected.
    if (!activeDay || activeDay.day !== dayAtReveal) return;

    seal.hidden = true;
    $("#storyStage").hidden = false;
    $("#storyStage").classList.remove("story-enter");

    $("#storyMeta").textContent =
      `DAY ${itemAtReveal.day} · ${formatDate(itemAtReveal.date)}`;
    $("#storyTitle").textContent = itemAtReveal.title || "A little story";

    const paragraphs = Array.isArray(itemAtReveal.story) ? itemAtReveal.story : [];
    $("#storyBody").innerHTML = paragraphs.length
      ? paragraphs.map(paragraph => `<p>${escapeHTML(paragraph)}</p>`).join("")
      : `<p>This chapter is still being written. Come back soon. ♡</p>`;

    $("#questionText").textContent = itemAtReveal.question || "What came to mind while reading this?";

    const previous = localStorage.getItem(storageKey(itemAtReveal.day)) || "";
    $("#answer").value = previous;
    $("#saved").hidden = true;

    requestAnimationFrame(() => {
      if (activeDay && activeDay.day === dayAtReveal) {
        $("#storyStage").classList.add("story-enter");
      }
    });
  }, 500);
}

async function saveAnswer() {
  if (!activeDay) return;

  const answer = $("#answer").value.trim();
  if (!answer) return;

  const saveButton = $("#saveButton");
  const originalText = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = "Saving quietly…";

  // Keep local persistence for offline/testing continuity. In live mode, also
  // send the answer to the private Supabase backend when configured.
  localStorage.setItem(storageKey(activeDay.day), answer);
  const savedRemotely = await saveAnswerToBackend(activeDay.day, answer);

  saveButton.disabled = false;
  saveButton.textContent = originalText;

  $("#saved").textContent = savedRemotely ? "Saved quietly. ♡" : "Saved on this device. ♡";
  $("#saved").hidden = false;
  window.setTimeout(() => {
    $("#saved").hidden = true;
  }, 2200);
}

function closeModal() {
  $("#modal").classList.remove("visible");
  $("#modal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  $("#openButton").disabled = false;
  $("#openButton").textContent = "OPEN";
  $("#finaleOpenButton").disabled = false;
  $("#finaleOpenButton").textContent = "OPEN THE LAST PAGE";
  $("#finaleSealStage").classList.remove("finale-seal-opening");
  activeDay = null;
}

function launchConfetti() {
  const symbols = ["✦", "♡", "✧", "❀", "·"];
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 85; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.fontSize = `${9 + Math.random() * 15}px`;
    piece.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    piece.style.animationDelay = `${Math.random() * 0.25}s`;
    piece.style.setProperty("--drift", `${Math.random() * 220 - 110}px`);
    piece.style.setProperty(
      "--confetti-color",
      Math.random() > 0.5 ? "#edacd3" : "#bba8ee"
    );
    fragment.appendChild(piece);
  }

  document.body.appendChild(fragment);

  setTimeout(() => {
    document.querySelectorAll(".confetti").forEach(node => node.remove());
  }, 5200);
}

function renderCurrentCard() {
  const currentCard = $("#currentCard");
  const available = BIRTHDAY_CONTENT.filter(item => isUnlocked(item));
  const current = available[available.length - 1];

  if (!current) {
    currentCard.innerHTML = `<div class="no-current">The next little chapter is still sealed.</div>`;
    return;
  }

  currentCard.innerHTML = `
    <h2>${escapeHTML(current.title)}</h2>
    <p>Tonight's little chapter is ready.</p>
    <button class="primary" id="todayButton">Open tonight's chapter</button>
  `;
  $("#todayButton").addEventListener("click", () => openChapter(current.day));
}

function refreshExperience() {
  closeModal();
  renderTimeline();
  renderCurrentCard();
  updateDevPanel();
}

function updateDevPanel() {
  const panel = $("#devPanel");
  if (!panel) return;
  $("#testEnabled").checked = testState.enabled;
  $("#testDate").value = testState.date;
  $("#testTime").value = testState.time;
  const now = localNow();
  $("#testStatus").textContent = testState.enabled
    ? `Simulating ${now.toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"})} · ${now.toLocaleTimeString("en-IN", {hour:"numeric",minute:"2-digit"})}`
    : "Live clock · visitor mode";
}

function applyTestInputs() {
  testState.enabled = $("#testEnabled").checked;
  testState.date = $("#testDate").value;
  testState.time = $("#testTime").value;
  persistTestState();
  refreshExperience();
}

function shiftTestDay(delta) {
  const [y,m,d] = testState.date.split("-").map(Number);
  const date = new Date(y,m-1,d);
  date.setDate(date.getDate()+delta);
  const yyyy=date.getFullYear(), mm=String(date.getMonth()+1).padStart(2,"0"), dd=String(date.getDate()).padStart(2,"0");
  testState.date=`${yyyy}-${mm}-${dd}`;
  testState.enabled=true;
  persistTestState();
  refreshExperience();
}

function resetAnswers() {
  Object.keys(localStorage).filter(k => k.startsWith(`${STORAGE_PREFIX}answer_`)).forEach(k => localStorage.removeItem(k));
  refreshExperience();
}

function setupDevPanel() {
  const panel = $("#devPanel");
  const toggle = $("#devToggle");
  if (!remoteTestModeEnabled) {
    testState.enabled = false;
    persistTestState();
    toggle.hidden = true;
    panel.classList.remove("visible");
    return;
  }
  toggle.hidden = false;
  toggle.addEventListener("click", () => panel.classList.toggle("visible"));
  $("#devClose").addEventListener("click", () => panel.classList.remove("visible"));
  $("#applyTest").addEventListener("click", applyTestInputs);
  $("#prevDay").addEventListener("click", () => shiftTestDay(-1));
  $("#nextDay").addEventListener("click", () => shiftTestDay(1));
  $("#lockedPreset").addEventListener("click", () => { testState.enabled=true; testState.time="21:59"; persistTestState(); refreshExperience(); });
  $("#unlockedPreset").addEventListener("click", () => { testState.enabled=true; testState.time="22:00"; persistTestState(); refreshExperience(); });
  $("#birthdayPreset").addEventListener("click", () => { testState.enabled=true; testState.date="2026-10-20"; testState.time="22:00"; persistTestState(); refreshExperience(); });
  $("#resetAnswers").addEventListener("click", resetAnswers);
  $("#liveMode").addEventListener("click", () => { testState.enabled=false; persistTestState(); refreshExperience(); });
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault(); panel.classList.toggle("visible");
    }
  });
  updateDevPanel();
}

function refreshAtNextUnlock() {
  if (testState.enabled) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(UNLOCK_HOUR, 0, 3, 0);

  if (next <= now) next.setDate(next.getDate() + 1);

  setTimeout(() => {
    renderTimeline();
    refreshAtNextUnlock();
  }, next - now);
}

async function setup() {
  initBackend();
  await loadRemoteSettings();
  if (!remoteTestModeEnabled) {
    testState.enabled = false;
    persistTestState();
  }
  renderTimeline();
  renderCurrentCard();
  setupDevPanel();
  refreshAtNextUnlock();

  $("#openButton").addEventListener("click", revealStory);
  $("#finaleOpenButton").addEventListener("click", revealFinale);
  $("#saveButton").addEventListener("click", saveAnswer);
  $("#closeButton").addEventListener("click", closeModal);

  $("#modal").addEventListener("click", event => {
    if (event.target === $("#modal")) closeModal();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && $("#modal").classList.contains("visible")) {
      closeModal();
    }
  });

}

document.addEventListener("DOMContentLoaded", setup);
