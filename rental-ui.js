/* J-Town rental UI additions. Existing board/calendar/inventory code is preserved. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const staff = !!byId('bookingForm');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sessionKey = 'jtownSession', expiryKey = 'jtownSessionExpiry';
  const attachmentHtml = booking => booking.attachment_name ? `<span class="jtown-attachment">Attachment: ${escapeHtml(booking.attachment_name)}</span>` : '';

  if (staff) {
    function addField(formId, inputId) {
      const label = document.createElement('label');
      label.id = inputId + 'Label';
      label.hidden = true;
      label.textContent = 'Dingo attachment *';
      const input = document.createElement('input');
      input.id = inputId;
      input.maxLength = 200;
      input.placeholder = 'Enter attachment';
      label.appendChild(input);
      const form = byId(formId);
      const submit = form.querySelector('button[type="submit"]');
      const anchor = Array.from(form.children).find(child => child.contains(submit)) || null;
      form.insertBefore(label, anchor);
    }
    addField('bookingForm', 'dingoAttachment');
    addField('editBookingForm', 'editDingoAttachment');
    const needsAttachment = editing => {
      const selected = byId(editing ? 'editItem' : 'item').value;
      const other = byId(editing ? 'editOtherItem' : 'otherItem').value;
      const name = inventory.find(item => String(item.id) === selected)?.name || (selected === 'other' ? other : '');
      return /\bdingo\b/i.test(name);
    };
    function syncField(editing) {
      const id = editing ? 'editDingoAttachment' : 'dingoAttachment';
      const needed = needsAttachment(editing);
      byId(id + 'Label').hidden = !needed;
      byId(id).required = needed;
      byId(id).disabled = !needed;
      byId(id).setCustomValidity('');
    }
    ['item', 'otherItem', 'editItem', 'editOtherItem'].forEach(id => {
      byId(id).addEventListener('change', () => syncField(id.startsWith('edit')));
      byId(id).addEventListener('input', () => syncField(id.startsWith('edit')));
    });
    ['bookingForm', 'editBookingForm'].forEach(id => {
      const editing = id === 'editBookingForm';
      const input = byId(editing ? 'editDingoAttachment' : 'dingoAttachment');
      input.addEventListener('input', () => input.setCustomValidity(''));
      byId(id).addEventListener('submit', event => {
        syncField(editing);
        if (needsAttachment(editing) && !input.value.trim()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          input.setCustomValidity('Enter the Dingo attachment.');
          input.reportValidity();
        }
      }, true);
      byId(id).addEventListener('reset', () => queueMicrotask(() => {
        input.value = '';
        syncField(editing);
      }));
    });
    if (typeof window.selectQuickRent === 'function') {
      const originalQuickRent = window.selectQuickRent;
      window.selectQuickRent = function(...args) {
        const result = originalQuickRent.apply(this, args);
        syncField(false);
        return result;
      };
    }
    if (typeof window.editBooking === 'function') {
      const originalEdit = window.editBooking;
      window.editBooking = function(id, ...args) {
        const result = originalEdit.call(this, id, ...args);
        const fill = () => {
          byId('editDingoAttachment').value = bookings.find(b => b.id === id)?.attachment_name || '';
          syncField(true);
        };
        fill();
        if (result && typeof result.then === 'function') result.then(fill).catch(console.error);
        return result;
      };
    }
    call = async function(action, payload = {}) {
      const editing = action === 'update_booking';
      if (action === 'create_booking' || editing) {
        syncField(editing);
        const attachment = byId(editing ? 'editDingoAttachment' : 'dingoAttachment').value.trim();
        if (needsAttachment(editing) && !attachment) throw Error('Enter the Dingo attachment before saving.');
        payload = { ...payload, attachment_name: needsAttachment(editing) ? attachment : null };
      }
      const token = localStorage.getItem(sessionKey);
      const response = await fetch(ACTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'X-JTown-Session': token || '' },
        body: JSON.stringify({ ...payload, action })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem(sessionKey);
          localStorage.removeItem(expiryKey);
          showLocked('Enter the store passkey to sign in on this device.');
        }
        throw Error(data.error || 'Request failed');
      }
      return data;
    };
    const originalRentalCard = rentalCard;
    rentalCard = function(booking) {
      const html = originalRentalCard(booking);
      return html.replace('<span class="muted">', match => attachmentHtml(booking) + match);
    };
    const originalRender = render;
    render = function(...args) {
      const result = originalRender.apply(this, args);
      syncField(false);
      return result;
    };
    byId('lock').onclick = async () => {
      byId('lock').disabled = true;
      try {
        await call('logout');
        localStorage.removeItem(sessionKey);
        localStorage.removeItem(expiryKey);
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem(expiryKey);
        bookings = [];
        render();
        byId('bookingForm').reset();
        byId('editBookingForm').reset();
        document.querySelectorAll('.modal').forEach(modal => { modal.hidden = true; });
        showLocked('Locked. Enter the store passkey.');
      } catch (error) {
        // Do not claim revocation succeeded while the server is unreachable.
        byId('error').textContent = 'Could not lock securely: ' + error.message + '. Check the connection and try again.';
      } finally { byId('lock').disabled = false; }
    };
    window.addEventListener('storage', event => {
      if (event.key === sessionKey && !event.newValue) {
        bookings = [];
        render();
        byId('bookingForm').reset();
        byId('editBookingForm').reset();
        document.querySelectorAll('.modal').forEach(modal => { modal.hidden = true; });
        showLocked('Locked in another tab. Enter the store passkey.');
      }
    });
    render();
  } else if (typeof card === 'function') {
    const originalCard = card;
    card = function(booking) {
      const html = originalCard(booking);
      const attachment = attachmentHtml(booking);
      return html.includes('class="rental-item"')
        ? html.replace(/(<div class="rental-item">[\s\S]*?<\/div>)/, match => match + attachment)
        : html.replace(/(<\/b>[^<]*<br>)/, match => match + attachment);
    };
    load();
  }

  const overlay = document.createElement('div');
  overlay.id = 'jtownSleep';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'After-hours screen');
  const wakeButton = document.createElement('button');
  wakeButton.type = 'button';
  wakeButton.textContent = 'Open rental page';
  overlay.appendChild(wakeButton);
  document.body.appendChild(overlay);
  let temporarilyAwake = false, lastActivity = 0, oldFocus = null, oldOverflow = '';
  const inertStates = new Map();
  function afterHours(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = type => parts.find(p => p.type === type)?.value;
    const weekday = get('weekday');
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    const opening = weekday === 'Sun' ? 720 : weekday === 'Sat' ? 480 : 450;
    const sleepingAt = weekday === 'Sun' ? 965 : weekday === 'Sat' ? 1025 : 1085;
    return minutes < opening || minutes >= sleepingAt;
  }
  function setSleep(sleeping) {
    if (sleeping === !overlay.hidden) return;
    if (sleeping) {
      oldFocus = document.activeElement;
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      for (const element of document.body.children) {
        if (element !== overlay) {
          inertStates.set(element, element.inert);
          element.inert = true;
        }
      }
      overlay.hidden = false;
      wakeButton.focus({ preventScroll: true });
    } else {
      overlay.hidden = true;
      inertStates.forEach((state, element) => { element.inert = state; });
      inertStates.clear();
      document.body.style.overflow = oldOverflow;
      if (oldFocus?.isConnected && !oldFocus.closest('[hidden]')) oldFocus.focus({ preventScroll: true });
    }
  }
  function checkSleep() {
    if (!afterHours()) {
      temporarilyAwake = false;
      setSleep(false);
      return;
    }
    if (temporarilyAwake && Date.now() - lastActivity < 5 * 60 * 1000) setSleep(false);
    else { temporarilyAwake = false; setSleep(true); }
  }
  wakeButton.onclick = () => {
    temporarilyAwake = true;
    lastActivity = Date.now();
    setSleep(false);
  };
  ['pointerdown', 'pointermove', 'keydown', 'input', 'wheel', 'touchstart'].forEach(type => {
    document.addEventListener(type, () => {
      if (temporarilyAwake && overlay.hidden) lastActivity = Date.now();
    }, { capture: true, passive: true });
  });
  window.addEventListener('focus', checkSleep);
  document.addEventListener('visibilitychange', checkSleep);
  setInterval(checkSleep, 1000);
  checkSleep();
})();
