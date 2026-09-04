/* ============================================================
   CoachGG — app.js
   Super Smash Bros Ultimate Player Analysis
   ============================================================ */

'use strict';

// ── Character Images ─────────────────────────────────────────
const CHARACTER_IMAGES = {
  "Banjo-Kazooie":      "https://ssb.wiki.gallery/images/6/60/Banjo%26KazooieHeadSSBU.png",
  "Banjo & Kazooie":    "https://ssb.wiki.gallery/images/6/60/Banjo%26KazooieHeadSSBU.png",
  "Bayonetta":          "https://ssb.wiki.gallery/images/6/6c/BayonettaHeadSSBU.png",
  "Bowser":             "https://ssb.wiki.gallery/images/b/b5/BowserHeadSSBU.png",
  "Bowser Jr.":         "https://ssb.wiki.gallery/images/0/07/BowserJrHeadSSBU.png",
  "Byleth":             "https://ssb.wiki.gallery/images/a/a2/BylethHeadSSBU.png",
  "Captain Falcon":     "https://ssb.wiki.gallery/images/3/35/CaptainFalconHeadSSBU.png",
  "Charizard":          "https://ssb.wiki.gallery/images/c/c9/CharizardHeadSSBU.png",
  "Chrom":              "https://ssb.wiki.gallery/images/2/25/ChromHeadSSBU.png",
  "Cloud":              "https://ssb.wiki.gallery/images/3/3b/CloudHeadSSBU.png",
  "Corrin":             "https://ssb.wiki.gallery/images/c/cf/CorrinHeadSSBU.png",
  "Daisy":              "https://ssb.wiki.gallery/images/9/96/DaisyHeadSSBU.png",
  "Dark Pit":           "https://ssb.wiki.gallery/images/e/ed/DarkPitHeadSSBU.png",
  "Dark Samus":         "https://ssb.wiki.gallery/images/9/96/DarkSamusHeadSSBU.png",
  "Diddy Kong":         "https://ssb.wiki.gallery/images/3/36/DiddyKongHeadSSBU.png",
  "Donkey Kong":        "https://ssb.wiki.gallery/images/b/ba/DonkeyKongHeadSSBU.png",
  "Dr. Mario":          "https://ssb.wiki.gallery/images/7/78/DrMarioHeadSSBU.png",
  "Duck Hunt":          "https://ssb.wiki.gallery/images/a/a1/DuckHuntHeadSSBU.png",
  "Falco":              "https://ssb.wiki.gallery/images/2/2f/FalcoHeadSSBU.png",
  "Fox":                "https://ssb.wiki.gallery/images/0/04/FoxHeadSSBU.png",
  "Ganondorf":          "https://ssb.wiki.gallery/images/7/78/GanondorfHeadSSBU.png",
  "Greninja":           "https://ssb.wiki.gallery/images/6/65/GreninjaHeadSSBU.png",
  "Hero":               "https://ssb.wiki.gallery/images/3/3d/HeroHeadSSBU.png",
  "Ice Climbers":       "https://ssb.wiki.gallery/images/8/8b/IceClimbersHeadSSBU.png",
  "Ike":                "https://ssb.wiki.gallery/images/b/b2/IkeHeadSSBU.png",
  "Incineroar":         "https://ssb.wiki.gallery/images/5/50/IncineroarHeadSSBU.png",
  "Inkling":            "https://ssb.wiki.gallery/images/f/f1/InklingHeadSSBU.png",
  "Isabelle":           "https://ssb.wiki.gallery/images/2/2f/IsabelleHeadSSBU.png",
  "Ivysaur":            "https://ssb.wiki.gallery/images/b/b4/IvysaurHeadSSBU.png",
  "Jigglypuff":         "https://ssb.wiki.gallery/images/9/95/JigglypuffHeadSSBU.png",
  "Joker":              "https://ssb.wiki.gallery/images/2/25/JokerHeadSSBU.png",
  "Kazuya":             "https://ssb.wiki.gallery/images/6/67/KazuyaHeadSSBU.png",
  "Ken":                "https://ssb.wiki.gallery/images/7/72/KenHeadSSBU.png",
  "King Dedede":        "https://ssb.wiki.gallery/images/b/bb/KingDededeHeadSSBU.png",
  "King K. Rool":       "https://ssb.wiki.gallery/images/d/de/KingKRoolHeadSSBU.png",
  "Kirby":              "https://ssb.wiki.gallery/images/9/91/KirbyHeadSSBU.png",
  "Link":               "https://ssb.wiki.gallery/images/a/aa/LinkHeadSSBU.png",
  "Little Mac":         "https://ssb.wiki.gallery/images/1/10/LittleMacHeadSSBU.png",
  "Lucario":            "https://ssb.wiki.gallery/images/c/cd/LucarioHeadSSBU.png",
  "Lucas":              "https://ssb.wiki.gallery/images/f/ff/LucasHeadSSBU.png",
  "Lucina":             "https://ssb.wiki.gallery/images/0/04/LucinaHeadSSBU.png",
  "Luigi":              "https://ssb.wiki.gallery/images/c/c6/LuigiHeadSSBU.png",
  "Mario":              "https://ssb.wiki.gallery/images/0/0d/MarioHeadSSBU.png",
  "Marth":              "https://ssb.wiki.gallery/images/b/bd/MarthHeadSSBU.png",
  "Mega Man":           "https://ssb.wiki.gallery/images/5/55/MegaManHeadSSBU.png",
  "Meta Knight":        "https://ssb.wiki.gallery/images/d/de/MetaKnightHeadSSBU.png",
  "Mewtwo":             "https://ssb.wiki.gallery/images/9/96/MewtwoHeadSSBU.png",
  "Mii Brawler":        "https://ssb.wiki.gallery/images/d/d8/MiiBrawlerHeadSSBU.png",
  "Mii Gunner":         "https://ssb.wiki.gallery/images/3/3d/MiiGunnerHeadSSBU.png",
  "Mii Swordfighter":   "https://ssb.wiki.gallery/images/e/ef/MiiSwordfighterHeadSSBU.png",
  "Min Min":            "https://ssb.wiki.gallery/images/d/de/MinMinHeadSSBU.png",
  "Mr. Game & Watch":   "https://ssb.wiki.gallery/images/4/46/MrGame%26WatchHeadSSBU.png",
  "Mythra":             "https://ssb.wiki.gallery/images/3/32/MythraHeadSSBU.png",
  "Ness":               "https://ssb.wiki.gallery/images/0/0f/NessHeadSSBU.png",
  "Olimar":             "https://ssb.wiki.gallery/images/9/91/OlimarHeadSSBU.png",
  "Pac-Man":            "https://ssb.wiki.gallery/images/9/9c/Pac-ManHeadSSBU.png",
  "Palutena":           "https://ssb.wiki.gallery/images/a/a9/PalutenaHeadSSBU.png",
  "Peach":              "https://ssb.wiki.gallery/images/d/d2/PeachHeadSSBU.png",
  "Pichu":              "https://ssb.wiki.gallery/images/d/d6/PichuHeadSSBU.png",
  "Pikachu":            "https://ssb.wiki.gallery/images/f/fa/PikachuHeadSSBU.png",
  "Piranha Plant":      "https://ssb.wiki.gallery/images/3/38/PiranhaPlantHeadSSBU.png",
  "Pit":                "https://ssb.wiki.gallery/images/a/aa/PitHeadSSBU.png",
  "Pokemon Trainer":    "https://ssb.wiki.gallery/images/4/4a/PokemonTrainerHeadSSBU.png",
  "Pyra":               "https://ssb.wiki.gallery/images/7/79/PyraHeadSSBU.png",
  "Pyra & Mythra":      "https://ssb.wiki.gallery/images/f/fc/PyraMythraHeadSSBU.png",
  "R.O.B.":             "https://ssb.wiki.gallery/images/b/b3/ROBHeadSSBU.png",
  "R.O.B":              "https://ssb.wiki.gallery/images/b/b3/ROBHeadSSBU.png",
  "Richter":            "https://ssb.wiki.gallery/images/b/b9/RichterHeadSSBU.png",
  "Ridley":             "https://ssb.wiki.gallery/images/b/be/RidleyHeadSSBU.png",
  "Robin":              "https://ssb.wiki.gallery/images/2/25/RobinHeadSSBU.png",
  "Rosalina":           "https://ssb.wiki.gallery/images/e/e8/RosalinaHeadSSBU.png",
  "Rosalina & Luma":    "https://ssb.wiki.gallery/images/e/e8/RosalinaHeadSSBU.png",
  "Roy":                "https://ssb.wiki.gallery/images/e/ed/RoyHeadSSBU.png",
  "Ryu":                "https://ssb.wiki.gallery/images/f/fb/RyuHeadSSBU.png",
  "Samus":              "https://ssb.wiki.gallery/images/7/7f/SamusHeadSSBU.png",
  "Sephiroth":          "https://ssb.wiki.gallery/images/5/5e/SephirothHeadSSBU.png",
  "Sheik":              "https://ssb.wiki.gallery/images/3/37/SheikHeadSSBU.png",
  "Shulk":              "https://ssb.wiki.gallery/images/c/c1/ShulkHeadSSBU.png",
  "Simon":              "https://ssb.wiki.gallery/images/d/df/SimonHeadSSBU.png",
  "Simon Belmont":      "https://ssb.wiki.gallery/images/d/df/SimonHeadSSBU.png",
  "Snake":              "https://ssb.wiki.gallery/images/9/9a/SnakeHeadSSBU.png",
  "Sonic":              "https://ssb.wiki.gallery/images/7/76/SonicHeadSSBU.png",
  "Sora":               "https://ssb.wiki.gallery/images/0/0e/SoraHeadSSBU.png",
  "Squirtle":           "https://ssb.wiki.gallery/images/4/40/SquirtleHeadSSBU.png",
  "Steve":              "https://ssb.wiki.gallery/images/1/11/SteveHeadSSBU.png",
  "Terry":              "https://ssb.wiki.gallery/images/f/f9/TerryHeadSSBU.png",
  "Toon Link":          "https://ssb.wiki.gallery/images/e/e6/ToonLinkHeadSSBU.png",
  "Villager":           "https://ssb.wiki.gallery/images/b/b9/VillagerHeadSSBU.png",
  "Wario":              "https://ssb.wiki.gallery/images/0/05/WarioHeadSSBU.png",
  "Wii Fit Trainer":    "https://ssb.wiki.gallery/images/8/87/WiiFitTrainerHeadSSBU.png",
  "Wolf":               "https://ssb.wiki.gallery/images/e/e8/WolfHeadSSBU.png",
  "Yoshi":              "https://ssb.wiki.gallery/images/0/03/YoshiHeadSSBU.png",
  "Young Link":         "https://ssb.wiki.gallery/images/c/cd/YoungLinkHeadSSBU.png",
  "Zelda":              "https://ssb.wiki.gallery/images/c/c1/ZeldaHeadSSBU.png",
  "Zero Suit Samus":    "https://ssb.wiki.gallery/images/7/71/ZeroSuitSamusHeadSSBU.png",
};

// ── Stage Images ─────────────────────────────────────────────
const STAGE_IMAGES = {
  "Battlefield":           "https://ssb.wiki.gallery/images/8/86/SSBU-Battlefield.png",
  "Small Battlefield":     "https://ssb.wiki.gallery/images/7/7e/SSBU-Small-Battlefield.jpg",
  "Final Destination":     "https://ssb.wiki.gallery/images/e/e5/SSBU-Final_Destination.png",
  "Pokémon Stadium 2":     "https://ssb.wiki.gallery/images/7/73/SSBU-Pok%C3%A9mon_Stadium_2.png",
  "Pokemon Stadium 2":     "https://ssb.wiki.gallery/images/7/73/SSBU-Pok%C3%A9mon_Stadium_2.png",
  "Smashville":            "https://ssb.wiki.gallery/images/0/02/SSBU-Smashville.png",
  "Town and City":         "https://ssb.wiki.gallery/images/2/26/SSBU-Town_and_City.png",
  "Kalos Pokémon League":  "https://ssb.wiki.gallery/images/b/bf/SSBU-Kalos_Pok%C3%A9mon_League.png",
  "Kalos Pokemon League":  "https://ssb.wiki.gallery/images/b/bf/SSBU-Kalos_Pok%C3%A9mon_League.png",
  "Hollow Bastion":        "https://ssb.wiki.gallery/images/7/7e/SSBU-Hollow_Bastion.jpg",
  "Northern Cave":         "https://ssb.wiki.gallery/images/e/ee/SSBU_Northern_Cave.png",
  "Lylat Cruise":          "https://ssb.wiki.gallery/images/4/4c/SSBU-Lylat_Cruise.png",
  "Yoshi's Story":         "https://ssb.wiki.gallery/images/3/37/SSBU-Yoshi%27s_Story.png",
  "Yoshi's Island":        "https://ssb.wiki.gallery/images/f/f0/SSBU-Yoshi%27s_Island.png",
  "Yggdrasil's Altar":     "https://ssb.wiki.gallery/images/a/a3/SSBU-Yggdrasil%27sAltar.jpg",
};

// ── Constants ─────────────────────────────────────────────────
const RING_CIRCUMFERENCE = 2 * Math.PI * 44; // ≈ 276.46

// ── State ────────────────────────────────────────────────────
const connection = new signalR.HubConnectionBuilder()
  .withUrl('/analysishub')
  .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
  .configureLogging(signalR.LogLevel.Warning)
  .build();

let connectionReady = false;

connection.onclose(() => { connectionReady = false; });
connection.onreconnecting(() => { connectionReady = false; });
connection.onreconnected(() => {
  connectionReady = true;
  if (!currentSlug) return;

  connection.invoke('Subscribe', currentSlug).catch(error => {
    progressSection.classList.add('hidden');
    showError('Could not resume live analysis. Please try again.');
    resetAnalyzeBtn();
    console.error('SignalR analysis resubscription failed:', error);
  });
});

async function ensureConnected() {
  if (connection.state === signalR.HubConnectionState.Disconnected) {
    await connection.start();
    connectionReady = true;
  }
}

let currentSlug = null;
let currentStats = {};
const stageCardMap = new Map();  // stageName → { el, data }
const charCardMap  = new Map();  // charName  → { el, data }
const matchupRowMap = new Map(); // charName  → { el, data }
const vsCharRowMap  = new Map(); // oppCharName → { el, data }

// ── DOM References ───────────────────────────────────────────
const heroSection     = document.getElementById('heroSection');
const searchForm      = document.getElementById('searchForm');
const slugInput       = document.getElementById('slugInput');
const analyzeBtn      = document.getElementById('analyzeBtn');
const progressSection = document.getElementById('progressSection');
const progressFill    = document.getElementById('progressFill');
const progressText    = document.getElementById('progressText');
const progressStats   = document.getElementById('progressStats');
const resultsSection  = document.getElementById('resultsSection');
const summaryBar      = document.getElementById('summaryBar');
const stageGrid       = document.getElementById('stageGrid');
const charGrid        = document.getElementById('charGrid');
const matchupList     = document.getElementById('matchupList');
const vsCharList      = document.getElementById('vsCharList');
const errorToast      = document.getElementById('errorToast');
const errorText       = document.getElementById('errorText');
const retryBtn         = document.getElementById('retryBtn');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function normalizeSlug(slug) {
  return String(slug).trim().replace(/^user\//i, '').toLowerCase();
}

// ── Sort State ────────────────────────────────────────────────
let currentSort = 'winrate'; // 'winrate' | 'wins'

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.sort === currentSort) return;
    currentSort = btn.dataset.sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b === btn));
    resortStageCards();
    resortCharCards();
    resortMatchupRows();
    resortVsCharRows();
  });
});

function sortComparator(a, b) {
  if (currentSort === 'wins') return b.winCount - a.winCount || b.total - a.total;
  return b.winRate - a.winRate || b.total - a.total;
}


function wrColor(wr) {
  if (wr > 60) return 'var(--win-high)';
  if (wr >= 40) return 'var(--win-mid)';
  return 'var(--win-low)';
}

function wrClass(wr) {
  if (wr > 60) return 'wr-high';
  if (wr >= 40) return 'wr-mid';
  return 'wr-low';
}

function animateValue(element, from, to, duration = 600) {
  const start = performance.now();
  const update = (time) => {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + (to - from) * eased;
    element.textContent = current.toFixed(1) + '%';
    element.style.color = wrColor(current);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function animateRing(ringEl, fromWr, toWr, duration = 700) {
  const start = performance.now();
  const update = (time) => {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = fromWr + (toWr - fromWr) * eased;
    const offset = RING_CIRCUMFERENCE * (1 - current / 100);
    ringEl.style.strokeDashoffset = offset;
    ringEl.style.stroke = wrColor(current);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function flashCard(el) {
  el.classList.remove('flash-update');
  void el.offsetWidth; // reflow
  el.classList.add('flash-update');
}

function sortedByWinrate(obj) {
  return Object.entries(obj).sort(([, a], [, b]) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.total - a.total;
  });
}

function recordText(total, winCount) {
  return `${winCount}W – ${total - winCount}L`;
}

function charImgSrc(name) {
  return CHARACTER_IMAGES[name] || '';
}

function stageImgSrc(name) {
  return STAGE_IMAGES[name] || '';
}

// ── Tab Navigation ───────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Form Submit ──────────────────────────────────────────────
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const slug = slugInput.value.trim();
  if (!slug) return;
  startAnalysis(slug);
});

async function startAnalysis(slug) {
  currentSlug = normalizeSlug(slug);
  currentStats = {};

  // Reset cards
  stageCardMap.clear();
  charCardMap.clear();
  matchupRowMap.clear();
  vsCharRowMap.clear();
  stageGrid.innerHTML = '';
  charGrid.innerHTML = '';
  matchupList.innerHTML = '';
  vsCharList.innerHTML  = '';
  summaryBar.innerHTML = '';

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('slug', currentSlug);
  window.history.pushState({}, '', url);

  // UI state
  hideError();
  analyzeBtn.classList.add('loading');
  analyzeBtn.querySelector('.btn-text').textContent = 'Analyzing...';
  heroSection.classList.add('compact');
  showProgress();  // show immediately — hide on complete/error

  try {
    await ensureConnected();
    await connection.invoke('Subscribe', currentSlug);
  } catch (error) {
    progressSection.classList.add('hidden');
    showError('Could not connect to live analysis. Please try again.');
    resetAnalyzeBtn();
    console.error('SignalR analysis connection failed:', error);
  }
}

function retry() {
  hideError();
  if (currentSlug) startAnalysis(currentSlug);
}
retryBtn.addEventListener('click', retry);

// ── Socket Events ────────────────────────────────────────────

connection.on('JobQueued', ({ slug, message }) => {
  if (slug !== currentSlug) return;
  showProgress();
  progressText.textContent = message || 'Job queued, fetching data...';
  setProgress(0, null);
});

connection.on('Progress', ({ slug, currentPage, totalPages, partialStats }) => {
  if (slug !== currentSlug) return;
  showProgress();

  const pct = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressText.textContent = `Fetching page ${currentPage} of ${totalPages > 0 ? totalPages : '?'}`;

  if (partialStats) {
    currentStats = partialStats;
    updateProgressPills(partialStats);
    showResults();
    updateAllCards(partialStats);
  }
});

connection.on('JobComplete', ({ slug, stats }) => {
  if (slug !== currentSlug) return;

  currentStats = stats;
  progressFill.style.width = '100%';
  progressText.textContent = 'Analysis complete!';

  setTimeout(() => {
    progressSection.classList.add('hidden');
  }, 800);

  showResults();
  updateAllCards(stats);
  resetAnalyzeBtn();
  celebrateSummary();
});

connection.on('JobError', ({ slug, error }) => {
  if (slug !== currentSlug) return;
  progressSection.classList.add('hidden');
  showError(error || 'An error occurred while fetching data.');
  resetAnalyzeBtn();
});

// ── UI State Helpers ─────────────────────────────────────────

function showProgress() {
  progressSection.classList.remove('hidden');
}

function showResults() {
  resultsSection.classList.remove('hidden');
}

function setProgress(current, total) {
  const pct = (total && total > 0) ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = pct + '%';
}

function resetAnalyzeBtn() {
  analyzeBtn.classList.remove('loading');
  analyzeBtn.querySelector('.btn-text').textContent = 'Analyze';
}

function showError(msg) {
  errorText.textContent = msg;
  errorToast.classList.remove('hidden');
}

function hideError() {
  errorToast.classList.add('hidden');
}

function celebrateSummary() {
  summaryBar.classList.remove('celebrate');
  void summaryBar.offsetWidth;
  summaryBar.classList.add('celebrate');
}

// ── Progress Pills ───────────────────────────────────────────
function updateProgressPills(stats) {
  const { winrateByCharacter, winrateByStage } = stats;

  let totalGames = 0;
  let totalWins = 0;
  Object.values(winrateByStage || {}).forEach(s => {
    totalGames += s.total;
    totalWins += s.winCount;
  });

  const overallWr = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '--';

  const topChar = winrateByCharacter
    ? sortedByWinrate(winrateByCharacter)[0]
    : null;

  progressStats.innerHTML = `
    <div class="progress-stat-pill">Games: <strong>${totalGames}</strong></div>
    <div class="progress-stat-pill">Win Rate: <strong>${overallWr}%</strong></div>
    ${topChar ? `<div class="progress-stat-pill">Top Char: <strong>${escapeHtml(topChar[0])}</strong></div>` : ''}
  `;
}

// ── Summary Bar ──────────────────────────────────────────────
function updateSummaryBar(stats) {
  const { winrateByCharacter, winrateByStage } = stats;

  let totalGames = 0;
  let totalWins = 0;
  Object.values(winrateByStage || {}).forEach(s => {
    totalGames += s.total;
    totalWins += s.winCount;
  });
  const overallWr = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '--';

  const sortedChars  = sortedByWinrate(winrateByCharacter || {});
  const sortedStages = sortedByWinrate(winrateByStage || {});

  const mostPlayedChar = sortedChars.sort(([,a],[,b]) => b.total - a.total)[0];
  const bestStage = sortedStages[0];

  summaryBar.innerHTML = `
    <div class="summary-stat">
      <span class="summary-value">${totalGames}</span>
      <span class="summary-label">Games Analyzed</span>
    </div>
    <div class="summary-stat">
      <span class="summary-value">${overallWr}%</span>
      <span class="summary-label">Overall Win Rate</span>
    </div>
    <div class="summary-stat">
      <span class="summary-value">${mostPlayedChar ? escapeHtml(mostPlayedChar[0]) : '--'}</span>
      <span class="summary-label">Most Played</span>
    </div>
    <div class="summary-stat">
      <span class="summary-value">${bestStage ? escapeHtml(bestStage[0]) : '--'}</span>
      <span class="summary-label">Best Stage</span>
    </div>
  `;
}

// ── Master Update ────────────────────────────────────────────
function updateAllCards(stats) {
  updateSummaryBar(stats);
  renderStageCards(stats.winrateByStage || {});
  renderCharacterCards(stats.winrateByCharacter || {});
  renderMatchups(stats.winrateStageByCharacter || {}, stats.winrateByCharacter || {});
  renderVsCharMatchups(stats.winrateMyCharByOpponentChar || {}, stats.winrateByCharacter || {});
  resortStageCards();
  resortCharCards();
  resortMatchupRows();
  resortVsCharRows();
}

// ── Stage Cards ──────────────────────────────────────────────
function renderStageCards(winrateByStage) {
  const sorted = sortedByWinrate(winrateByStage);

  sorted.forEach(([name, data], idx) => {
    if (stageCardMap.has(name)) {
      updateStageCard(name, data);
    } else {
      const el = createStageCard(name, data, idx);
      stageCardMap.set(name, { el, data: { ...data } });
      stageGrid.appendChild(el);
    }
  });
}

function createStageCard(name, data, idx) {
  const el = document.createElement('div');
  el.className = 'stage-card card-enter';
  el.style.animationDelay = (idx * 0.05) + 's';
  el.dataset.stageName = name;

  const imgSrc = stageImgSrc(name);
  const isLowData = data.total < 5;
  const colorStyle = `color: ${wrColor(data.winRate)}`;
  const losses = data.total - data.winCount;

  el.innerHTML = `
    <div class="stage-bg" style="background-image: url('${imgSrc}'); ${!imgSrc ? 'background-color: #1a1f2e' : ''}"></div>
    <div class="stage-overlay"></div>
    <div class="stage-info">
      <div class="stage-left">
        <div class="stage-name">${escapeHtml(name)}</div>
        <div class="stage-record">${recordText(data.total, data.winCount)}</div>
        <div class="stage-games">${data.total} games${isLowData ? '' : ''}</div>
        ${isLowData ? '<span class="low-data-badge">Low data</span>' : ''}
      </div>
      <div class="stage-right">
        <div class="stage-winrate" style="${colorStyle}">${data.winRate.toFixed(1)}%</div>
      </div>
    </div>
  `;
  return el;
}

function updateStageCard(name, data) {
  const entry = stageCardMap.get(name);
  if (!entry) return;
  const { el, data: prev } = entry;

  const wrEl = el.querySelector('.stage-winrate');
  const recEl = el.querySelector('.stage-record');
  const gamesEl = el.querySelector('.stage-games');

  if (data.winRate !== prev.winRate) {
    flashCard(el);
    animateValue(wrEl, prev.winRate, data.winRate);
  } else {
    wrEl.textContent = data.winRate.toFixed(1) + '%';
    wrEl.style.color = wrColor(data.winRate);
  }

  recEl.textContent = recordText(data.total, data.winCount);
  gamesEl.textContent = `${data.total} games`;

  entry.data = { ...data };
  stageCardMap.set(name, entry);
}

function resortStageCards() {
  const entries = Array.from(stageCardMap.entries())
    .sort(([, a], [, b]) => sortComparator(a.data, b.data));

  entries.forEach(([, { el }], i) => { el.style.order = i; });
  stageGrid.style.display = 'grid';
}

// ── Character Cards ──────────────────────────────────────────
function renderCharacterCards(winrateByCharacter) {
  const sorted = sortedByWinrate(winrateByCharacter);

  sorted.forEach(([name, data], idx) => {
    if (charCardMap.has(name)) {
      updateCharCard(name, data);
    } else {
      const el = createCharCard(name, data, idx);
      charCardMap.set(name, { el, data: { ...data } });
      charGrid.appendChild(el);
    }
  });
}

function createCharCard(name, data, idx) {
  const el = document.createElement('div');
  el.className = 'char-card card-enter';
  el.style.animationDelay = (idx * 0.04) + 's';
  el.dataset.charName = name;

  const imgSrc = charImgSrc(name);
  const offset = RING_CIRCUMFERENCE * (1 - data.winRate / 100);
  const color = wrColor(data.winRate);
  const isLowData = data.total < 5;

  el.innerHTML = `
    <div class="portrait-wrap">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle class="ring-bg" cx="50" cy="50" r="44"/>
        <circle class="ring-fill"
          cx="50" cy="50" r="44"
          stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          style="stroke: ${color}"
        />
      </svg>
      ${imgSrc
        ? `<img class="portrait-img" src="${imgSrc}" alt="${escapeHtml(name)}" loading="lazy" />`
        : `<div class="portrait-img" style="display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:var(--text-muted);text-align:center;padding:4px">${escapeHtml(name)}</div>`
      }
    </div>
    <div class="char-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
    <div class="char-winrate ${wrClass(data.winRate)}">${data.winRate.toFixed(1)}%</div>
    <div class="char-record">${recordText(data.total, data.winCount)}</div>
    <div class="char-games">${data.total} game${data.total !== 1 ? 's' : ''}${isLowData ? ' · Low data' : ''}</div>
  `;
  return el;
}

function updateCharCard(name, data) {
  const entry = charCardMap.get(name);
  if (!entry) return;
  const { el, data: prev } = entry;

  const wrEl = el.querySelector('.char-winrate');
  const ringEl = el.querySelector('.ring-fill');
  const recEl = el.querySelector('.char-record');
  const gamesEl = el.querySelector('.char-games');

  if (data.winRate !== prev.winRate) {
    flashCard(el);
    animateValue(wrEl, prev.winRate, data.winRate);
    animateRing(ringEl, prev.winRate, data.winRate);
  } else {
    wrEl.textContent = data.winRate.toFixed(1) + '%';
    wrEl.style.color = wrColor(data.winRate);
    const offset = RING_CIRCUMFERENCE * (1 - data.winRate / 100);
    ringEl.style.strokeDashoffset = offset;
    ringEl.style.stroke = wrColor(data.winRate);
  }

  wrEl.className = `char-winrate ${wrClass(data.winRate)}`;
  recEl.textContent = recordText(data.total, data.winCount);
  const isLowData = data.total < 5;
  gamesEl.textContent = `${data.total} game${data.total !== 1 ? 's' : ''}${isLowData ? ' · Low data' : ''}`;

  entry.data = { ...data };
  charCardMap.set(name, entry);
}

function resortCharCards() {
  const entries = Array.from(charCardMap.entries())
    .sort(([, a], [, b]) => sortComparator(a.data, b.data));

  entries.forEach(([, { el }], i) => { el.style.order = i; });
}

function resortMatchupRows() {
  const entries = Array.from(matchupRowMap.entries())
    .sort(([, a], [, b]) => sortComparator(a.data.overall, b.data.overall));
  entries.forEach(([, { el, data }], i) => {
    el.style.order = i;
    el.querySelector('.matchup-stages').innerHTML = Object.entries(data.stageData)
      .sort(([, a], [, b]) => sortComparator(a, b))
      .map(([stageName, sd]) => `
        <div class="matchup-stage-chip">
          <span class="chip-stage-name">${escapeHtml(stageName)}</span>
          <span class="chip-winrate" style="color: ${wrColor(sd.winRate)}">${sd.winRate.toFixed(1)}%</span>
          <span class="chip-record">${recordText(sd.total, sd.winCount)}</span>
        </div>`).join('');
  });
}

function resortVsCharRows() {
  const entries = Array.from(vsCharRowMap.entries())
    .sort(([, a], [, b]) => sortComparator(a.data.overall, b.data.overall));
  entries.forEach(([, { el, data }], i) => {
    el.style.order = i;
    el.querySelector('.matchup-stages').innerHTML = oppCharChipsHtml(data.myCharData);
  });
}

// ── Stage Counterpick ─────────────────────────────────────────
function renderMatchups(winrateStageByCharacter, winrateByCharacter) {
  const charNames = Object.keys(winrateStageByCharacter);

  // Sort characters by overall winrate
  const sorted = charNames.sort((a, b) => {
    const wrA = winrateByCharacter[a]?.winRate ?? 0;
    const wrB = winrateByCharacter[b]?.winRate ?? 0;
    return wrB - wrA;
  });

  sorted.forEach((charName, idx) => {
    const stageData = winrateStageByCharacter[charName];
    const overall = winrateByCharacter[charName] || { total: 0, winCount: 0, winRate: 0 };

    if (matchupRowMap.has(charName)) {
      updateMatchupRow(charName, stageData, overall);
    } else {
      const el = createMatchupRow(charName, stageData, overall, idx);
      matchupRowMap.set(charName, { el, data: { stageData: { ...stageData }, overall: { ...overall } } });
      matchupList.appendChild(el);
    }
  });
}

function createMatchupRow(charName, stageData, overall, idx) {
  const el = document.createElement('div');
  el.className = 'matchup-row card-enter';
  el.style.animationDelay = (idx * 0.03) + 's';

  const imgSrc = charImgSrc(charName);
  const color = wrColor(overall.winRate);

  const stagesHtml = Object.entries(stageData).sort(([, a], [, b]) => sortComparator(a, b)).map(([stageName, sd]) => `
    <div class="matchup-stage-chip">
      <span class="chip-stage-name">${escapeHtml(stageName)}</span>
      <span class="chip-winrate" style="color: ${wrColor(sd.winRate)}">${sd.winRate.toFixed(1)}%</span>
      <span class="chip-record">${recordText(sd.total, sd.winCount)}</span>
    </div>
  `).join('');

  el.innerHTML = `
    <button type="button" class="matchup-header" aria-expanded="false">
      ${imgSrc
        ? `<img class="matchup-portrait" src="${imgSrc}" alt="${escapeHtml(charName)}" loading="lazy" />`
        : `<div class="matchup-portrait" style="display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:var(--text-muted)">?</div>`
      }
      <div class="matchup-char-info">
        <div class="matchup-char-name">${escapeHtml(charName)}</div>
        <div class="matchup-char-record">${recordText(overall.total, overall.winCount)} &middot; ${overall.total} games</div>
      </div>
      <div class="matchup-winrate" style="color: ${color}">${overall.winRate.toFixed(1)}%</div>
      <span class="matchup-toggle">&#9660;</span>
    </button>
    <div class="matchup-stages">${stagesHtml}</div>
  `;

  // Toggle expand
  el.querySelector('.matchup-header').addEventListener('click', () => {
    el.classList.toggle('expanded');
    el.querySelector('.matchup-header').setAttribute('aria-expanded', String(el.classList.contains('expanded')));
  });

  return el;
}

function updateMatchupRow(charName, stageData, overall) {
  const entry = matchupRowMap.get(charName);
  if (!entry) return;
  const { el } = entry;

  const wrEl = el.querySelector('.matchup-winrate');
  const recEl = el.querySelector('.matchup-char-record');
  const stagesEl = el.querySelector('.matchup-stages');

  const prev = entry.data.overall;
  if (overall.winRate !== prev.winRate) {
    flashCard(el);
    animateValue(wrEl, prev.winRate, overall.winRate);
  } else {
    wrEl.textContent = overall.winRate.toFixed(1) + '%';
    wrEl.style.color = wrColor(overall.winRate);
  }

  recEl.innerHTML = `${recordText(overall.total, overall.winCount)} &middot; ${overall.total} games`;

  stagesEl.innerHTML = Object.entries(stageData).sort(([, a], [, b]) => sortComparator(a, b)).map(([stageName, sd]) => `
    <div class="matchup-stage-chip">
      <span class="chip-stage-name">${escapeHtml(stageName)}</span>
      <span class="chip-winrate" style="color: ${wrColor(sd.winRate)}">${sd.winRate.toFixed(1)}%</span>
      <span class="chip-record">${recordText(sd.total, sd.winCount)}</span>
    </div>
  `).join('');

  entry.data = { stageData: { ...stageData }, overall: { ...overall } };
  matchupRowMap.set(charName, entry);
}

// ── Character Counterpick Tab ────────────────────────────────
// winrateOppCharByMyChar: myChar → { oppChar → StatEntry }
// winrateByMyChar:        myChar → StatEntry (overall, from winrateByCharacter)
function renderVsCharMatchups(winrateOppCharByMyChar, winrateByMyChar) {
  const myChars = Object.keys(winrateOppCharByMyChar);

  myChars.forEach((myChar, idx) => {
    const oppCharData = winrateOppCharByMyChar[myChar];   // oppChar → StatEntry
    const overall     = winrateByMyChar[myChar] || { total: 0, winCount: 0, winRate: 0 };

    if (vsCharRowMap.has(myChar)) {
      updateVsCharRow(myChar, oppCharData, overall);
    } else {
      const el = createVsCharRow(myChar, oppCharData, overall, idx);
      vsCharRowMap.set(myChar, { el, data: { myCharData: { ...oppCharData }, overall: { ...overall } } });
      vsCharList.appendChild(el);
    }
  });
}

function oppCharChipsHtml(oppCharData) {
  return Object.entries(oppCharData).sort(([, a], [, b]) => sortComparator(a, b)).map(([oppChar, sd]) => {
    const img = charImgSrc(oppChar);
    return `
      <div class="matchup-stage-chip vschar-chip">
        ${img ? `<img class="chip-char-portrait" src="${img}" alt="${escapeHtml(oppChar)}" loading="lazy"/>` : ''}
        <span class="chip-stage-name">${escapeHtml(oppChar)}</span>
        <span class="chip-winrate" style="color: ${wrColor(sd.winRate)}">${sd.winRate.toFixed(1)}%</span>
        <span class="chip-record">${recordText(sd.total, sd.winCount)}</span>
      </div>`;
  }).join('');
}

function createVsCharRow(myChar, oppCharData, overall, idx) {
  const el = document.createElement('div');
  el.className = 'matchup-row card-enter';
  el.style.animationDelay = (idx * 0.03) + 's';

  const imgSrc = charImgSrc(myChar);
  const color  = wrColor(overall.winRate);

  el.innerHTML = `
    <button type="button" class="matchup-header" aria-expanded="false">
      ${imgSrc
        ? `<img class="matchup-portrait" src="${imgSrc}" alt="${escapeHtml(myChar)}" loading="lazy"/>`
        : `<div class="matchup-portrait" style="display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:var(--text-muted)">?</div>`
      }
      <div class="matchup-char-info">
        <div class="matchup-char-name">${escapeHtml(myChar)}</div>
        <div class="matchup-char-record">${recordText(overall.total, overall.winCount)} &middot; ${overall.total} games</div>
      </div>
      <div class="matchup-winrate" style="color: ${color}">${overall.winRate.toFixed(1)}%</div>
      <span class="matchup-toggle">&#9660;</span>
    </button>
    <div class="matchup-stages">${oppCharChipsHtml(oppCharData)}</div>
  `;

  el.querySelector('.matchup-header').addEventListener('click', () => {
    el.classList.toggle('expanded');
    el.querySelector('.matchup-header').setAttribute('aria-expanded', String(el.classList.contains('expanded')));
  });
  return el;
}

function updateVsCharRow(myChar, oppCharData, overall) {
  const entry = vsCharRowMap.get(myChar);
  if (!entry) return;
  const { el } = entry;

  const wrEl     = el.querySelector('.matchup-winrate');
  const recEl    = el.querySelector('.matchup-char-record');
  const chipsEl  = el.querySelector('.matchup-stages');

  const prev = entry.data.overall;
  if (overall.winRate !== prev.winRate) {
    flashCard(el);
    animateValue(wrEl, prev.winRate, overall.winRate);
  } else {
    wrEl.textContent  = overall.winRate.toFixed(1) + '%';
    wrEl.style.color  = wrColor(overall.winRate);
  }

  recEl.innerHTML   = `${recordText(overall.total, overall.winCount)} &middot; ${overall.total} games`;
  chipsEl.innerHTML = oppCharChipsHtml(oppCharData);

  entry.data = { myCharData: { ...oppCharData }, overall: { ...overall } };
  vsCharRowMap.set(myChar, entry);
}
(function checkUrlSlug() {
  // Support ?slug=xxx query param
  const params = new URLSearchParams(window.location.search);
  let slug = params.get('slug');

  // Support /counterpick/xxx URL pattern
  if (!slug) {
    const match = window.location.pathname.match(/\/counterpick\/([^/]+)/);
    if (match) slug = match[1];
  }

  if (slug) {
    slugInput.value = slug;
    setTimeout(() => startAnalysis(slug), 100);
  }
})();
