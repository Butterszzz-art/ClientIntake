// Local passcode gate for the coach dashboard. This is a deterrent, not real
// security: the PIN hash and all client data live in this browser's own
// localStorage, so anyone with devtools access to this browser/profile can
// bypass or clear it. It exists purely to stop a client who ends up with
// this URL from casually seeing the dashboard.

// Exported so index.html's small "coach access" panel can verify the same
// pincode (and jump straight into an unlocked coach.html) without a second,
// separately-maintained hashing implementation.
export const PIN_HASH_KEY = 'pt-intake:coach-pin-hash:v1';
export const SESSION_UNLOCK_KEY = 'pt-intake:coach-unlocked';

export async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function pinIsSet() {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

async function pinIsCorrect(pin) {
  return (await hashPin(pin)) === localStorage.getItem(PIN_HASH_KEY);
}

function isUnlockedThisSession() {
  return sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1';
}

function unlockSession() {
  sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
}

function resetAlles() {
  localStorage.clear();
  sessionStorage.clear();
}

function renderGateUI(overlay, moetInstellen) {
  overlay.innerHTML = moetInstellen ? `
    <div class="lock-card">
      <h2>Stel een pincode in</h2>
      <p class="hint">Dit dashboard bevat cliëntgegevens. Kies een pincode zodat niet iedereen met deze link erin kan.
      Let op: dit is lokale afscherming, geen echte beveiliging.</p>
      <form id="setup-form">
        <input type="password" id="setup-pin" minlength="4" inputmode="numeric" autocomplete="off" required placeholder="Kies een pincode (min. 4 tekens)">
        <input type="password" id="setup-pin-confirm" minlength="4" inputmode="numeric" autocomplete="off" required placeholder="Herhaal pincode">
        <button type="submit" class="btn btn--accent">Instellen</button>
      </form>
      <p class="vlag vlag--rood" id="setup-error" hidden></p>
    </div>
  ` : `
    <div class="lock-card">
      <h2>Coach dashboard vergrendeld</h2>
      <p class="hint">Voer je pincode in.</p>
      <form id="lock-form">
        <input type="password" id="lock-pin" inputmode="numeric" autocomplete="off" required autofocus>
        <button type="submit" class="btn btn--accent">Ontgrendelen</button>
      </form>
      <p class="vlag vlag--rood" id="lock-error" hidden>Onjuiste pincode.</p>
      <button type="button" class="btn btn--ghost btn--small" id="lock-reset">Pincode vergeten? Reset alles</button>
    </div>
  `;
}

// Shows the gate if needed, otherwise reveals the dashboard immediately.
// Calls `onUnlocked` exactly once, right before the dashboard becomes visible.
export function initCoachGate(onUnlocked) {
  const overlay = document.getElementById('lock-overlay');
  const app = document.getElementById('app');
  const header = document.querySelector('.app-header');

  function toonDashboard() {
    overlay.hidden = true;
    app.hidden = false;
    header.hidden = false;
    onUnlocked();
  }

  if (isUnlockedThisSession()) {
    toonDashboard();
    return;
  }

  const moetInstellen = !pinIsSet();
  renderGateUI(overlay, moetInstellen);

  if (moetInstellen) {
    overlay.querySelector('#setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = overlay.querySelector('#setup-pin').value;
      const confirmPin = overlay.querySelector('#setup-pin-confirm').value;
      if (pin !== confirmPin) {
        const err = overlay.querySelector('#setup-error');
        err.textContent = 'Pincodes komen niet overeen.';
        err.hidden = false;
        return;
      }
      localStorage.setItem(PIN_HASH_KEY, await hashPin(pin));
      unlockSession();
      toonDashboard();
    });
  } else {
    overlay.querySelector('#lock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = overlay.querySelector('#lock-pin').value;
      if (await pinIsCorrect(pin)) {
        unlockSession();
        toonDashboard();
      } else {
        overlay.querySelector('#lock-error').hidden = false;
      }
    });
    overlay.querySelector('#lock-reset').addEventListener('click', () => {
      if (confirm('Dit wist ALLE lokale cliëntgegevens en de pincode op dit apparaat. Dit kan niet ongedaan gemaakt worden. Doorgaan?')) {
        resetAlles();
        location.reload();
      }
    });
  }
}

export function lockNow() {
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  location.reload();
}
