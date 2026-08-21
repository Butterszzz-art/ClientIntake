// Real coach authentication via Firebase Auth (email + password). This
// replaces the old local-pincode deterrent: access to client data is now
// actually enforced by Firestore security rules checking `request.auth !=
// null` on the server side, not just hidden behind client-side JS.

import { auth } from './firebase.js?v=7';
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

function renderLoginUI(overlay, melding) {
  overlay.innerHTML = `
    <div class="lock-card">
      <h2>Coach-login</h2>
      <p class="hint" id="login-hint">Log in met je coach-account om het dashboard te openen.</p>
      <form id="login-form">
        <input type="email" id="login-email" autocomplete="username" required placeholder="E-mailadres">
        <input type="password" id="login-password" autocomplete="current-password" required placeholder="Wachtwoord">
        <button type="submit" class="btn btn--accent">Inloggen</button>
      </form>
      ${melding ? `<p class="vlag vlag--rood">${melding}</p>` : ''}
      <button type="button" class="btn btn--ghost btn--small" id="wachtwoord-vergeten">Wachtwoord vergeten?</button>
    </div>
  `;

  overlay.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = overlay.querySelector('#login-email').value;
    const password = overlay.querySelector('#login-password').value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged below takes it from here.
    } catch {
      renderLoginUI(overlay, 'Inloggen mislukt — controleer je e-mailadres en wachtwoord.');
    }
  });

  overlay.querySelector('#wachtwoord-vergeten').addEventListener('click', async () => {
    const email = overlay.querySelector('#login-email').value;
    if (!email) {
      renderLoginUI(overlay, 'Vul eerst je e-mailadres in, dan sturen we een reset-link.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      renderLoginUI(overlay, '');
      overlay.querySelector('#login-hint').textContent = `Reset-link verstuurd naar ${email}.`;
    } catch {
      renderLoginUI(overlay, 'Kon geen reset-mail versturen — controleer het e-mailadres.');
    }
  });
}

// Shows the login form when signed out, otherwise reveals the dashboard.
// Calls `onUnlocked` exactly once per sign-in (guarded so a Firebase token
// refresh — which also fires onAuthStateChanged — doesn't re-run init and
// attach duplicate event listeners).
export function initCoachGate(onUnlocked) {
  const overlay = document.getElementById('lock-overlay');
  const app = document.getElementById('app');
  const header = document.querySelector('.app-header');
  let alGeinitialiseerd = false;

  onAuthStateChanged(auth, (user) => {
    if (user) {
      overlay.hidden = true;
      app.hidden = false;
      header.hidden = false;
      if (!alGeinitialiseerd) {
        alGeinitialiseerd = true;
        onUnlocked();
      }
    } else {
      alGeinitialiseerd = false;
      app.hidden = true;
      header.hidden = true;
      overlay.hidden = false;
      renderLoginUI(overlay, '');
    }
  });
}

export function lockNow() {
  signOut(auth);
}
