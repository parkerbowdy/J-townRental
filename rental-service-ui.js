/* Optional notes and service management; existing rental features remain in place. */
(() => {
  'use strict';
  const E = id => document.getElementById(id);
  const staff = !!E('bookingForm');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const endpoint = SUPABASE_URL + '/functions/v1/rental-actions-v2';
  const style = document.createElement('style');
  style.textContent = `
    .rental-notes { white-space:pre-wrap; overflow-wrap:anywhere; color:#d5dfed; margin:8px 0; }
    .notes-field { width:100%; }
    .notes-field textarea, #serviceReason { background:#111720; color:#edf1f7; border:1px solid #536176; border-radius:6px; padding:9px; font:inherit; width:100%; }
    .date-preview { font-size:12px; color:#b6c1d0; max-width:240px; }
    .service-grid { display:grid; grid-template-columns:repeat(auto-fill,150px); gap:8px; }
    .service-square { width:150px; height:150px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; overflow:auto; padding:10px; background:#342b1c; border:1px solid #c99d4a; border-radius:8px; }
    .service-square span { font-size:22px; line-height:1.15; font-weight:800; overflow-wrap:anywhere; }
    .service-reason { white-space:pre-wrap; overflow-wrap:anywhere; }
    #serviceModal[hidden] { display:none; }
  `;
  document.head.appendChild(style);
  let summary = null, holds = [], refreshing = null, serviceError = '';
  const previousAvailable = available;
  available = function(item) {
    if (summary === null) return 0;
    const held = summary.find(row => row.item_id === item.id)?.quantity || 0;
    return Math.max(0, previousAvailable(item) - Number(held));
  };
  function withNotes(html, booking) {
    if (!booking.notes) return html;
    const note = `<div class="rental-notes">Notes: ${esc(booking.notes)}</div>`;
    const label = html.indexOf('<div class="delivery-label">');
    const end = label >= 0 ? label : html.lastIndexOf('</div>');
    return end < 0 ? html : html.slice(0, end) + note + html.slice(end);
  }
  function insertField(form, label) {
    const submit = form.querySelector('button[type="submit"]');
    const anchor = Array.from(form.children).find(child => child.contains(submit)) || null;
    form.insertBefore(label, anchor);
  }
  function renderService() {
    if (staff) {
      const selected = E('serviceItem').value;
      E('serviceItem').innerHTML = '<option value="">Choose item</option>' + inventory.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      E('serviceItem').value = selected;
      E('serviceStatus').textContent = serviceError || (summary === null ? 'Checking service status; availability is temporarily unavailable.' : '');
      E('serviceRecords').innerHTML = holds.filter(hold => !hold.returned_to_service_at).map(hold => `
        <div class="card"><b>${esc(inventory.find(item => item.id === hold.item_id)?.name || 'Item')} × ${Number(hold.quantity)}</b>
        <div class="service-reason">${esc(hold.reason)}</div>
        <small>Out of service: ${esc(window.jtownFormatDate(hold.started_at))}</small><br>
        <button type="button" data-return-service="${esc(hold.id)}">Returned to Service</button></div>
      `).join('') || '<p class="muted">No equipment out of service.</p>';
    } else {
      E('serviceStatus').textContent = serviceError || (summary === null ? 'Checking service status…' : '');
      E('serviceSquares').innerHTML = (summary || []).map(row => `<div class="service-square"><span>${esc(row.name)}</span><span>× ${Number(row.quantity)}</span></div>`).join('') || (summary === null ? '' : '<p class="muted">No equipment out of service.</p>');
    }
  }
  function updateDatePreviews() {
    if (!staff) return;
    for (const id of ['pickup','due','editPickup','editDue']) {
      const input = E(id), preview = E(id + 'Readable');
      preview.textContent = input.value ? window.jtownFormatDate(input.value) : '';
    }
  }
  const previousCall = staff ? call : null;
  async function getSummary() {
    const response = await fetch(endpoint, {
      method:'POST', headers:{'Content-Type':'application/json', apikey:SUPABASE_KEY, Authorization:'Bearer ' + SUPABASE_KEY},
      body:JSON.stringify({action:'service_summary'})
    });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.summary)) throw Error(data.error || 'Could not load service status.');
    return data.summary;
  }
  function clearPrivateService() {
    holds = [];
    if (staff) {
      E('serviceForm').reset();
      E('serviceModal').hidden = true;
      renderService();
    }
  }
  async function refreshService() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const current = await getSummary();
        summary = current;
        if (staff && !E('app').hidden && localStorage.getItem('jtownSession')) {
          const data = await previousCall('service_holds');
          if (!E('app').hidden && localStorage.getItem('jtownSession')) holds = data.holds || [];
          else holds = [];
        } else holds = [];
        serviceError = '';
      } catch (error) {
        serviceError = 'Service status could not refresh: ' + error.message;
      }
      if (staff) render(); else { await load(); renderService(); }
    })();
    try { await refreshing; } finally { refreshing = null; }
  }
  if (staff) {
    for (const [formId,inputId] of [['bookingForm','rentalNotes'],['editBookingForm','editRentalNotes']]) {
      const label = document.createElement('label');
      label.className = 'notes-field';
      label.textContent = 'Notes (optional)';
      const input = document.createElement('textarea');
      input.id = inputId;
      input.rows = 3;
      input.placeholder = 'Optional rental notes';
      label.appendChild(input);
      insertField(E(formId), label);
    }
    for (const id of ['pickup','due','editPickup','editDue']) {
      const preview = document.createElement('small');
      preview.id = id + 'Readable';
      preview.className = 'date-preview';
      E(id).insertAdjacentElement('afterend', preview);
      E(id).addEventListener('input', updateDatePreviews);
      E(id).addEventListener('change', updateDatePreviews);
    }
    const servicePanel = document.createElement('section');
    servicePanel.innerHTML = '<h2>Out of Service</h2><p id="serviceStatus" class="error"></p><div id="serviceRecords" class="cards"></div>';
    E('board').appendChild(servicePanel);
    const modal = document.createElement('div');
    modal.id = 'serviceModal';
    modal.className = 'modal';
    modal.hidden = true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','serviceTitle');
    modal.innerHTML = `<div class="modal-card"><h2 id="serviceTitle">Out of Service</h2>
      <form id="serviceForm">
        <label>Item<select id="serviceItem" required></select></label>
        <label>Quantity<input id="serviceQuantity" type="number" min="1" step="1" value="1" required></label>
        <label class="notes-field">Reason<textarea id="serviceReason" rows="3" maxlength="2000" required></textarea></label>
        <div class="modal-actions"><button type="submit" id="saveService">Out of Service</button><button type="button" id="closeService" class="secondary">Cancel</button></div>
      </form><p id="serviceMessage" class="error" role="status"></p></div>`;
    document.body.appendChild(modal);
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'secondary';
    openButton.textContent = 'Out of Service';
    document.querySelector('#app nav').appendChild(openButton);
    function closeModal() { modal.hidden = true; openButton.focus(); }
    openButton.onclick = () => {
      E('serviceForm').reset(); E('serviceMessage').textContent = ''; renderService(); modal.hidden = false; E('serviceItem').focus();
    };
    E('closeService').onclick = closeModal;
    modal.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
    E('serviceForm').onsubmit = async event => {
      event.preventDefault();
      const quantity = Number(E('serviceQuantity').value), reason = E('serviceReason').value.trim();
      if (!Number.isInteger(quantity) || quantity < 1 || !reason) { E('serviceMessage').textContent = 'Select an item, a positive whole-number quantity, and a reason.'; return; }
      E('saveService').disabled = true;
      try {
        const result = await call('mark_out_of_service', {item_id:E('serviceItem').value, quantity, reason});
        await refreshService(); closeModal();
        E('success').textContent = 'Equipment marked out of service.' + (result.warning ? ' ' + result.warning : '');
      } catch (error) { E('serviceMessage').textContent = error.message; }
      finally { E('saveService').disabled = false; }
    };
    E('serviceRecords').onclick = async event => {
      const button = event.target.closest('[data-return-service]');
      if (!button) return;
      const hold = holds.find(row => row.id === button.dataset.returnService);
      if (!hold) return;
      const name = inventory.find(item => item.id === hold.item_id)?.name || 'Item';
      if (!window.confirm(`Return ${name} × ${hold.quantity} to service?`)) return;
      button.disabled = true;
      try { await call('return_to_service',{id:hold.id}); await refreshService(); E('success').textContent = 'Equipment returned to service.'; }
      catch (error) { E('serviceStatus').textContent = error.message; button.disabled = false; }
    };
    call = async function(action, payload = {}) {
      if (action === 'create_booking' || action === 'update_booking') payload = {...payload, notes:E(action === 'update_booking' ? 'editRentalNotes' : 'rentalNotes').value.trim() || null};
      const result = await previousCall(action,payload);
      if (action === 'logout') clearPrivateService();
      if (action === 'staff_bookings') queueMicrotask(() => { refreshService().catch(console.error); });
      return result;
    };
    const previousEdit = window.editBooking;
    window.editBooking = function(id,...args) {
      const result = previousEdit.call(this,id,...args);
      const fill = () => { E('editRentalNotes').value = bookings.find(row => row.id === id)?.notes || ''; updateDatePreviews(); };
      fill();
      if (result && typeof result.then === 'function') result.then(fill).catch(console.error);
      return result;
    };
    const previousCard = rentalCard;
    rentalCard = booking => withNotes(previousCard(booking),booking);
    const previousRender = render;
    render = function(...args) { const result = previousRender.apply(this,args); renderService(); updateDatePreviews(); return result; };
    new MutationObserver(() => { if (E('app').hidden) clearPrivateService(); }).observe(E('app'),{attributes:true,attributeFilter:['hidden']});
    setInterval(updateDatePreviews,1000);
    render();
  } else {
    const section = document.createElement('section');
    section.innerHTML = '<h2>Out of Service</h2><p id="serviceStatus" class="error"></p><div id="serviceSquares" class="service-grid"></div>';
    document.querySelector('main').appendChild(section);
    const previousCard = card;
    card = booking => withNotes(previousCard(booking),booking);
    renderService();
  }
  setInterval(() => { refreshService().catch(console.error); },30000);
  window.addEventListener('focus', () => { refreshService().catch(console.error); });
  refreshService().catch(console.error);
})();
