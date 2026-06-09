const STORAGE_KEY = 'joka.portal.state.v1';
const CHANNEL_NAME = 'joka.portal.realtime';
const ADMIN_EMAIL = 'bediemmanuel456@gmail.com';
const ADMIN_PASSWORD = 'Bedidelali@12';
const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

const els = {
  activeClientsCount: document.getElementById('activeClientsCount'),
  openOrdersCount: document.getElementById('openOrdersCount'),
  liveUpdatesCount: document.getElementById('liveUpdatesCount'),
  clientSessionBadge: document.getElementById('clientSessionBadge'),
  clientStatusLabel: document.getElementById('clientStatusLabel'),
  clientOrdersLabel: document.getElementById('clientOrdersLabel'),
  clientLatestLabel: document.getElementById('clientLatestLabel'),
  clientOrdersList: document.getElementById('clientOrdersList'),
  clientsTable: document.getElementById('clientsTable'),
  adminOrderBoard: document.getElementById('adminOrderBoard'),
  adminBadge: document.getElementById('adminBadge'),
  adminLoginBox: document.getElementById('adminLoginBox'),
  adminDashboard: document.getElementById('adminDashboard'),
  totalClientsLabel: document.getElementById('totalClientsLabel'),
  suspendedClientsLabel: document.getElementById('suspendedClientsLabel'),
  pendingOrdersLabel: document.getElementById('pendingOrdersLabel'),
  deliveredOrdersLabel: document.getElementById('deliveredOrdersLabel'),
  signupForm: document.getElementById('signupForm'),
  loginForm: document.getElementById('loginForm'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  orderForm: document.getElementById('orderForm'),
  logoutButton: document.getElementById('logoutButton'),
  resetDemoButton: document.getElementById('resetDemoButton'),
  clientWorkspace: document.getElementById('clientWorkspace'),
};

const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
const state = loadState();
let currentClientId = state.session.currentClientId || null;
let adminLoggedIn = Boolean(state.session.adminLoggedIn);
let updateCount = state.session.updateCount || 0;
let activeTab = 'signup';

seedStateIfNeeded();
render();

if (channel) {
  channel.addEventListener('message', (event) => {
    if (event.data?.type === 'sync-state') {
      hydrateFromStorage();
      render();
    }
  });
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    hydrateFromStorage();
    render();
  }
});

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll('.tab-button').forEach((tab) => tab.classList.toggle('active', tab === button));
    els.signupForm.classList.toggle('hidden', activeTab !== 'signup');
    els.loginForm.classList.toggle('hidden', activeTab !== 'login');
  });
});

els.signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(els.signupForm);
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  if (!name || !email || !password) {
    return;
  }

  if (state.clients.some((client) => client.email === email)) {
    alert('An account with that email already exists.');
    return;
  }

  const client = {
    id: createId('client'),
    name,
    email,
    password,
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  state.clients.unshift(client);
  currentClientId = client.id;
  state.session.currentClientId = client.id;
  state.session.updateCount = ++updateCount;
  state.session.lastEvent = `Client created: ${name}`;
  saveState();
  els.signupForm.reset();
  render();
});

els.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(els.loginForm);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const client = state.clients.find((entry) => entry.email === email && entry.password === password);

  if (!client) {
    alert('Invalid client credentials.');
    return;
  }

  if (client.status === 'suspended') {
    alert('This account is suspended. Contact the admin.');
    return;
  }

  client.lastLoginAt = new Date().toISOString();
  currentClientId = client.id;
  state.session.currentClientId = client.id;
  state.session.updateCount = ++updateCount;
  state.session.lastEvent = `Client logged in: ${client.name}`;
  saveState();
  els.loginForm.reset();
  render();
});

els.adminLoginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(els.adminLoginForm);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    alert('Invalid admin credentials.');
    return;
  }

  adminLoggedIn = true;
  state.session.adminLoggedIn = true;
  state.session.updateCount = ++updateCount;
  state.session.lastEvent = 'Admin signed in';
  saveState();
  render();
});

els.orderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const client = getCurrentClient();
  if (!client) {
    alert('Sign in first to create an order.');
    return;
  }

  const formData = new FormData(els.orderForm);
  const service = String(formData.get('service') || '').trim();
  const budget = String(formData.get('budget') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  if (!service || !budget || !notes) {
    return;
  }

  const order = {
    id: createId('order'),
    clientId: client.id,
    service,
    budget,
    notes,
    status: 'new',
    createdAt: new Date().toISOString(),
    history: [
      { status: 'new', at: new Date().toISOString(), note: 'Order created by client' },
    ],
  };

  state.orders.unshift(order);
  state.session.updateCount = ++updateCount;
  state.session.lastEvent = `New order from ${client.name}`;
  saveState();
  els.orderForm.reset();
  render();
});

els.logoutButton.addEventListener('click', () => {
  currentClientId = null;
  state.session.currentClientId = null;
  state.session.updateCount = ++updateCount;
  state.session.lastEvent = 'Client logged out';
  saveState();
  render();
});

els.resetDemoButton.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  hydrateFromStorage();
  seedStateIfNeeded(true);
  currentClientId = state.session.currentClientId || null;
  adminLoggedIn = Boolean(state.session.adminLoggedIn);
  updateCount = state.session.updateCount || 0;
  render();
});

function seedStateIfNeeded(force = false) {
  if (!force && (state.clients.length || state.orders.length)) {
    return;
  }

  const demoClient = {
    id: createId('client'),
    name: 'Maya Owusu',
    email: 'maya@demo.app',
    password: 'demo1234',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const demoClientTwo = {
    id: createId('client'),
    name: 'Jordan Mensah',
    email: 'jordan@demo.app',
    password: 'demo1234',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  state.clients = [demoClient, demoClientTwo];
  state.orders = [
    createOrder(demoClient.id, 'Brand launch kit', '$620', 'Deliver the asset pack and publish-ready pages by Friday.', 'confirmed'),
    createOrder(demoClient.id, 'Client onboarding', '$180', 'Set up the onboarding flow and welcome emails.', 'preparing'),
    createOrder(demoClientTwo.id, 'Priority support queue', '$410', 'Track the support queue and escalate urgent tasks.', 'out_for_delivery'),
  ];
  state.session = {
    currentClientId: demoClient.id,
    adminLoggedIn: false,
    updateCount: 1,
    lastEvent: 'Demo data seeded',
  };
  persist();
}

function createOrder(clientId, service, budget, notes, status) {
  const createdAt = new Date().toISOString();
  return {
    id: createId('order'),
    clientId,
    service,
    budget,
    notes,
    status,
    createdAt,
    history: [
      { status: 'new', at: createdAt, note: 'Order created by client' },
      { status, at: createdAt, note: `Status moved to ${status}` },
    ],
  };
}

function loadState() {
  const fallback = {
    clients: [],
    orders: [],
    session: {
      currentClientId: null,
      adminLoggedIn: false,
      updateCount: 0,
      lastEvent: 'Ready',
    },
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed) {
      return structuredClone(fallback);
    }
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      session: {
        currentClientId: parsed.session?.currentClientId || null,
        adminLoggedIn: Boolean(parsed.session?.adminLoggedIn),
        updateCount: parsed.session?.updateCount || 0,
        lastEvent: parsed.session?.lastEvent || 'Ready',
      },
    };
  } catch {
    return structuredClone(fallback);
  }
}

function hydrateFromStorage() {
  const latest = loadState();
  state.clients = latest.clients;
  state.orders = latest.orders;
  state.session = latest.session;
  currentClientId = state.session.currentClientId || null;
  adminLoggedIn = Boolean(state.session.adminLoggedIn);
  updateCount = state.session.updateCount || 0;
}

function saveState() {
  persist();
  if (channel) {
    channel.postMessage({ type: 'sync-state' });
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const client = getCurrentClient();
  const clientOrders = client ? state.orders.filter((order) => order.clientId === client.id) : [];
  const activeClients = state.clients.filter((entry) => entry.status === 'active');
  const openOrders = state.orders.filter((entry) => entry.status !== 'delivered' && entry.status !== 'cancelled');

  els.activeClientsCount.textContent = String(activeClients.length);
  els.openOrdersCount.textContent = String(openOrders.length);
  els.liveUpdatesCount.textContent = String(state.session.updateCount || 0);

  els.clientSessionBadge.textContent = client ? client.name : 'Guest';
  els.clientStatusLabel.textContent = client ? capitalize(client.status) : 'Inactive';
  els.clientStatusLabel.className = `status-${client ? client.status : 'inactive'}`;
  els.clientOrdersLabel.textContent = String(clientOrders.length);
  els.clientLatestLabel.textContent = state.session.lastEvent || 'None';

  els.adminBadge.textContent = adminLoggedIn ? 'Unlocked' : 'Locked';
  els.adminBadge.className = adminLoggedIn ? 'badge' : 'badge warning';
  els.adminLoginBox.classList.toggle('hidden', adminLoggedIn);
  els.adminDashboard.classList.toggle('hidden', !adminLoggedIn);

  els.clientWorkspace.classList.toggle('hidden', !client);

  renderClientOrders(clientOrders);
  renderAdminMetrics();
  renderClientsTable();
  renderOrdersBoard();
}

function renderClientOrders(orders) {
  if (!orders.length) {
    els.clientOrdersList.innerHTML = '<div class="order-item"><p class="muted">No orders yet. Create your first order to start tracking progress.</p></div>';
    return;
  }

  els.clientOrdersList.innerHTML = orders.map((order) => `
    <article class="order-item">
      <div class="order-top">
        <div>
          <strong>${escapeHtml(order.service)}</strong>
          <div class="muted">Budget: ${escapeHtml(order.budget)}</div>
        </div>
        <span class="order-status status-${order.status}">${formatStatus(order.status)}</span>
      </div>
      <p>${escapeHtml(order.notes)}</p>
      <div class="order-meta">
        <span class="muted">Created ${formatDate(order.createdAt)}</span>
        <span class="muted">Updated ${formatDate(order.history[order.history.length - 1]?.at || order.createdAt)}</span>
      </div>
    </article>
  `).join('');
}

function renderAdminMetrics() {
  const suspended = state.clients.filter((client) => client.status === 'suspended');
  const pendingOrders = state.orders.filter((order) => ['new', 'confirmed', 'preparing'].includes(order.status));
  const deliveredOrders = state.orders.filter((order) => order.status === 'delivered');

  els.totalClientsLabel.textContent = String(state.clients.length);
  els.suspendedClientsLabel.textContent = String(suspended.length);
  els.pendingOrdersLabel.textContent = String(pendingOrders.length);
  els.deliveredOrdersLabel.textContent = String(deliveredOrders.length);
}

function renderClientsTable() {
  if (!state.clients.length) {
    els.clientsTable.innerHTML = '<tr><td colspan="4" class="muted">No clients yet.</td></tr>';
    return;
  }

  els.clientsTable.innerHTML = state.clients.map((client) => `
    <tr>
      <td>
        <strong>${escapeHtml(client.name)}</strong><br />
        <span class="muted">${formatDate(client.createdAt)}</span>
      </td>
      <td>
        ${escapeHtml(client.email)}<br />
        <span class="muted">Password: ${escapeHtml(client.password)}</span>
      </td>
      <td>
        <span class="client-status status-${client.status}">${capitalize(client.status)}</span>
      </td>
      <td>
        <div class="client-actions">
          <button class="small-button" data-action="toggle-client" data-client-id="${client.id}" type="button">
            ${client.status === 'active' ? 'Suspend' : 'Activate'}
          </button>
          <button class="small-button" data-action="reset-password" data-client-id="${client.id}" type="button">Reset password</button>
        </div>
      </td>
    </tr>
  `).join('');

  els.clientsTable.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => handleClientAction(button.dataset.action, button.dataset.clientId));
  });
}

function renderOrdersBoard() {
  if (!state.orders.length) {
    els.adminOrderBoard.innerHTML = '<div class="status-column"><p class="muted">No orders yet.</p></div>';
    return;
  }

  els.adminOrderBoard.innerHTML = ORDER_STATUSES.map((status) => {
    const orders = state.orders.filter((order) => order.status === status);
    return `
      <section class="status-column">
        <div class="list-header">
          <h3>${formatStatus(status)}</h3>
          <span class="muted">${orders.length} orders</span>
        </div>
        <div class="orders-list">
          ${orders.map((order) => {
            const client = state.clients.find((entry) => entry.id === order.clientId);
            return `
              <article class="order-item">
                <div class="order-top">
                  <div>
                    <strong>${escapeHtml(order.service)}</strong>
                    <div class="muted">${escapeHtml(client?.name || 'Unknown client')}</div>
                  </div>
                  <span class="order-status status-${order.status}">${formatStatus(order.status)}</span>
                </div>
                <p>${escapeHtml(order.notes)}</p>
                <div class="order-actions">
                  ${ORDER_STATUSES.filter((option) => option !== order.status).map((option) => `
                    <button class="small-button" data-action="set-status" data-order-id="${order.id}" data-status="${option}" type="button">${formatStatus(option)}</button>
                  `).join('')}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');

  els.adminOrderBoard.querySelectorAll('button[data-action="set-status"]').forEach((button) => {
    button.addEventListener('click', () => handleOrderStatus(button.dataset.orderId, button.dataset.status));
  });
}

function handleClientAction(action, clientId) {
  const client = state.clients.find((entry) => entry.id === clientId);
  if (!client) {
    return;
  }

  if (action === 'toggle-client') {
    client.status = client.status === 'active' ? 'suspended' : 'active';
    if (client.status === 'suspended' && currentClientId === client.id) {
      currentClientId = null;
      state.session.currentClientId = null;
    }
    state.session.lastEvent = `Client ${client.status}: ${client.name}`;
  }

  if (action === 'reset-password') {
    const nextPassword = prompt(`New password for ${client.name}`, client.password);
    if (!nextPassword) {
      return;
    }
    client.password = nextPassword.trim();
    state.session.lastEvent = `Password reset: ${client.name}`;
  }

  state.session.updateCount = ++updateCount;
  saveState();
  render();
}

function handleOrderStatus(orderId, nextStatus) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) {
    return;
  }

  order.status = nextStatus;
  order.history.push({
    status: nextStatus,
    at: new Date().toISOString(),
    note: `Status moved to ${nextStatus}`,
  });

  state.session.updateCount = ++updateCount;
  state.session.lastEvent = `Order ${order.service} moved to ${formatStatus(nextStatus)}`;
  saveState();
  render();
}

function getCurrentClient() {
  return state.clients.find((client) => client.id === currentClientId) || null;
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatStatus(status) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
