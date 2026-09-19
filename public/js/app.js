/* Asset Register - single page front end. */
(function () {
  'use strict';

  var state = {
    user: null,
    companies: [],
    categories: [],
    statuses: [],
    conditions: [],
    selection: {},
    assetQuery: { page: 1, page_size: 25, sort: 's_no', dir: 'desc' },
  };

  var view = document.getElementById('view');
  var appEl = document.getElementById('app');
  var loginEl = document.getElementById('login-view');

  /* ------------------------------------------------------------------ utils */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function money(value) {
    if (value == null || value === '') return '-';
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function fmtDate(value) {
    return window.Labels.shortDate(value) || '-';
  }

  function fmtDateTime(value) {
    if (!value) return '-';
    return String(value).replace('T', ' ').slice(0, 16);
  }

  function toast(message, isBad) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show' + (isBad ? ' bad' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      el.className = 'toast';
    }, 3200);
  }

  function fail(error) {
    toast(error && error.message ? error.message : 'Something went wrong.', true);
  }

  function can(/* roles */) {
    var roles = Array.prototype.slice.call(arguments);
    return !!state.user && roles.indexOf(state.user.role) !== -1;
  }

  var canEdit = function () {
    return can('admin', 'controller');
  };

  function statusTag(status) {
    var cls = 'tag';
    if (status === 'In Use') cls += ' ok';
    else if (status === 'Under Repair' || status === 'In Store') cls += ' warn';
    else if (status === 'Lost' || status === 'Disposed') cls += ' bad';
    return '<span class="' + cls + '">' + esc(status) + '</span>';
  }

  function on(selector, event, handler, root) {
    (root || view).querySelectorAll(selector).forEach(function (node) {
      node.addEventListener(event, handler);
    });
  }

  function value(id) {
    var node = document.getElementById(id);
    return node ? node.value.trim() : '';
  }

  function checked(id) {
    var node = document.getElementById(id);
    return !!node && node.checked;
  }

  var EYE_SHOW =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M1.8 12S5.4 5.8 12 5.8 22.2 12 22.2 12 18.6 18.2 12 18.2 1.8 12 1.8 12Z"/>' +
    '<circle cx="12" cy="12" r="3.1"/></svg>';

  var EYE_HIDE =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M1.8 12S5.4 5.8 12 5.8 22.2 12 22.2 12 18.6 18.2 12 18.2 1.8 12 1.8 12Z"/>' +
    '<circle cx="12" cy="12" r="3.1"/><line x1="3.5" y1="3.5" x2="20.5" y2="20.5"/></svg>';

  /** The eye button that shows or hides what is typed in a password box. */
  function eyeButton(inputId) {
    return (
      '<button type="button" class="pw-eye" data-for="' + inputId +
      '" aria-label="Show password" aria-pressed="false">' + EYE_SHOW + '</button>'
    );
  }

  function passwordField(id, label, opts) {
    var o = opts || {};
    return (
      '<div class="field' + (o.span ? ' span-' + o.span : '') + '"' +
      (o.style ? ' style="' + o.style + '"' : '') + '>' +
      '<label for="' + id + '">' + esc(label) + (o.required ? ' <span class="req">*</span>' : '') + '</label>' +
      '<div class="pw-wrap"><input id="' + id + '" type="password" autocomplete="' +
      (o.autocomplete || 'new-password') + '">' + eyeButton(id) + '</div>' +
      (o.help ? '<span class="help">' + esc(o.help) + '</span>' : '') +
      '</div>'
    );
  }

  function setPasswordVisible(inputId, visible) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var button = document.querySelector('.pw-eye[data-for="' + inputId + '"]');
    input.type = visible ? 'text' : 'password';
    if (button) {
      button.innerHTML = visible ? EYE_HIDE : EYE_SHOW;
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    }
  }

  // One listener for every eye button on every screen, including the sign-in card.
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('.pw-eye');
    if (!button) return;
    var id = button.getAttribute('data-for');
    var input = document.getElementById(id);
    if (!input) return;
    setPasswordVisible(id, input.type === 'password');
    input.focus();
  });

  // The sign-in card is in the page from the start, so fill its button in now.
  (function () {
    var loginEye = document.querySelector('#login-view .pw-eye');
    if (loginEye) loginEye.innerHTML = EYE_SHOW;
  })();

  function companyOptions(selected) {
    return state.companies
      .filter(function (c) {
        return c.is_active || String(c.id) === String(selected);
      })
      .map(function (c) {
        return (
          '<option value="' + c.id + '"' + (String(c.id) === String(selected) ? ' selected' : '') +
          '>' + esc(c.code) + ' - ' + esc(c.name) + '</option>'
        );
      })
      .join('');
  }

  function categoryOptions(selected) {
    var groups = {};
    state.categories
      .filter(function (c) {
        return c.is_active || String(c.id) === String(selected);
      })
      .forEach(function (c) {
        (groups[c.category_group] = groups[c.category_group] || []).push(c);
      });

    return Object.keys(groups)
      .sort()
      .map(function (group) {
        var items = groups[group]
          .map(function (c) {
            return (
              '<option value="' + c.id + '"' +
              (String(c.id) === String(selected) ? ' selected' : '') + '>' +
              esc(c.name) + ' (' + esc(c.code) + ')</option>'
            );
          })
          .join('');
        return '<optgroup label="' + esc(group) + '">' + items + '</optgroup>';
      })
      .join('');
  }

  function pickOptions(list, selected) {
    return list
      .map(function (item) {
        return (
          '<option value="' + esc(item) + '"' + (item === selected ? ' selected' : '') + '>' +
          esc(item) + '</option>'
        );
      })
      .join('');
  }

  /* ------------------------------------------------------------------ modal */

  function closeModal() {
    var open = document.querySelector('.modal-backdrop');
    if (open) open.remove();
    document.removeEventListener('keydown', modalKeydown);
  }

  function modalKeydown(event) {
    if (event.key === 'Escape') closeModal();
  }

  /** Opens a dialog and returns it, so the caller can wire up its buttons. */
  function openModal(title, bodyHtml) {
    closeModal();
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
      '<button type="button" class="modal-close" aria-label="Close">&times;</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div></div>';

    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('.modal-close')) closeModal();
    });
    backdrop.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        var submit = backdrop.querySelector('[data-default-action]');
        if (submit) submit.click();
      }
    });

    document.body.appendChild(backdrop);
    document.addEventListener('keydown', modalKeydown);
    var first = backdrop.querySelector('input:not([readonly]), button');
    if (first) first.focus();
    return backdrop;
  }

  /** Same readable shape as the reset-password command line tool. */
  function generatePassword() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var bytes = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      if (i === 5) out += '-';
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  /** Clipboard API needs a secure page, so fall back to selecting the box. */
  function copyFrom(inputId) {
    var input = document.getElementById(inputId);
    if (!input) return Promise.reject(new Error('Nothing to copy.'));
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(input.value);
    }
    input.focus();
    input.select();
    input.setSelectionRange(0, 99999);
    return document.execCommand('copy')
      ? Promise.resolve()
      : Promise.reject(new Error('Press Ctrl+C to copy.'));
  }

  /* ----------------------------------------------------------------- layout */

  var NAV = [
    { route: 'dashboard', icon: '&#9632;', label: 'Dashboard' },
    { route: 'assets', icon: '&#9776;', label: 'All Assets' },
    { route: 'assets/new', icon: '&#43;', label: 'Add Asset', roles: ['admin', 'controller'] },
    { route: 'labels', icon: '&#9646;', label: 'Print Labels', roles: ['admin', 'controller'] },
    { route: 'scan', icon: '&#9906;', label: 'Scan / Find' },
    { separator: 'Setup' },
    { route: 'categories', icon: '&#9783;', label: 'Categories' },
    { route: 'companies', icon: '&#9962;', label: 'Companies' },
    { route: 'users', icon: '&#9786;', label: 'Users', roles: ['admin'] },
    { route: 'activity', icon: '&#8635;', label: 'Activity Log', roles: ['admin', 'owner'] },
    { route: 'account', icon: '&#9919;', label: 'My Password' },
  ];

  function renderNav(active) {
    var html = NAV.filter(function (item) {
      return !item.roles || can.apply(null, item.roles);
    })
      .map(function (item) {
        if (item.separator) return '<div class="group-label">' + esc(item.separator) + '</div>';
        var isActive = active === item.route || (active === '' && item.route === 'dashboard');
        return (
          '<a href="#/' + item.route + '" class="' + (isActive ? 'active' : '') + '">' +
          '<span class="ico">' + item.icon + '</span>' + esc(item.label) + '</a>'
        );
      })
      .join('');
    document.getElementById('sidebar').innerHTML = html;
  }

  function pageHead(title, subtitle, actions) {
    return (
      '<div class="page-head"><div><h2>' + esc(title) + '</h2>' +
      (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') +
      '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>'
    );
  }

  function loading() {
    view.innerHTML = '<div class="card"><div class="empty">Loading...</div></div>';
  }

  /* ------------------------------------------------------------- dashboard */

  function viewDashboard() {
    loading();
    window.api.get('/api/reports/summary').then(function (data) {
      var t = data.totals;
      var companyCards = data.by_company
        .map(function (c) {
          return (
            '<div class="stat"><div class="label">' + esc(c.code) + '</div>' +
            '<div class="value">' + c.asset_count + '</div>' +
            '<div class="hint">' + esc(c.name) + ' &middot; value ' + money(c.total_cost) + '</div></div>'
          );
        })
        .join('');

      var maxGroup = Math.max.apply(
        null,
        data.by_group.map(function (g) {
          return g.asset_count;
        }).concat([1])
      );

      var groupBars = data.by_group.length
        ? data.by_group
            .map(function (g) {
              return (
                '<div class="bar-row"><span class="name">' + esc(g.name) + '</span>' +
                '<span class="track"><span class="fill" style="width:' +
                Math.round((g.asset_count / maxGroup) * 100) + '%"></span></span>' +
                '<span class="count">' + g.asset_count + '</span></div>'
              );
            })
            .join('')
        : '<div class="empty">No assets entered yet.</div>';

      var statusRows = data.by_status.length
        ? data.by_status
            .map(function (s) {
              return (
                '<tr><td>' + statusTag(s.name) + '</td><td class="num">' + s.asset_count + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="2" class="empty">Nothing yet.</td></tr>';

      var categoryRows = data.by_category.length
        ? data.by_category
            .map(function (c) {
              return (
                '<tr><td><a href="#/assets?category_id=' + c.id + '">' + esc(c.name) + '</a></td>' +
                '<td class="mono">' + esc(c.code) + '</td>' +
                '<td class="num">' + c.asset_count + '</td>' +
                '<td class="num">' + money(c.total_cost) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>';

      var recentRows = data.recent.length
        ? data.recent
            .map(function (a) {
              return (
                '<tr><td class="num">' + a.s_no + '</td>' +
                '<td class="mono"><a href="#/assets/' + a.id + '">' + esc(a.asset_code) + '</a></td>' +
                '<td>' + esc(a.name) + '</td>' +
                '<td><span class="tag company">' + esc(a.company_code) + '</span></td>' +
                '<td>' + esc(a.category_name) + '</td>' +
                '<td>' + esc(a.created_by_name || '-') + '</td>' +
                '<td>' + fmtDateTime(a.created_at) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="7" class="empty">No assets entered yet.</td></tr>';

      var warranty = data.warranty_expiring.length
        ? '<div class="card"><h3>Warranty ending within 60 days</h3><div class="table-wrap"><table>' +
          '<thead><tr><th>Asset Code</th><th>Asset</th><th>Company</th><th>Expires</th></tr></thead><tbody>' +
          data.warranty_expiring
            .map(function (a) {
              return (
                '<tr><td class="mono"><a href="#/assets/' + a.id + '">' + esc(a.asset_code) + '</a></td>' +
                '<td>' + esc(a.name) + '</td><td>' + esc(a.company_code) + '</td>' +
                '<td>' + fmtDate(a.warranty_expiry) + '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div></div>'
        : '';

      view.innerHTML =
        pageHead(
          'Dashboard',
          'Live position of every asset across the group',
          '<a class="btn secondary" href="#/assets">Open register</a>'
        ) +
        '<div class="grid cols-4" style="margin-bottom:16px">' +
        '<div class="stat brand"><div class="label">Total assets</div><div class="value">' +
        t.total_assets + '</div><div class="hint">' + t.total_quantity + ' item(s) counted</div></div>' +
        '<div class="stat"><div class="label">Total purchase value</div><div class="value">' +
        money(t.total_cost) + '</div><div class="hint">of the costs entered</div></div>' +
        '<div class="stat"><div class="label">Labels to print</div><div class="value">' +
        (t.labels_pending || 0) + '</div><div class="hint">' +
        (canEdit() ? '<a href="#/labels">print stickers</a>' : 'sticker not yet printed') +
        '</div></div>' +
        '<div class="stat"><div class="label">Companies</div><div class="value">' +
        data.by_company.length + '</div><div class="hint">in the group</div></div>' +
        '</div>' +
        '<h3 style="margin:18px 0 10px;font-size:15px">Assets by company</h3>' +
        '<div class="grid cols-4" style="margin-bottom:6px">' + companyCards + '</div>' +
        '<div class="grid cols-2">' +
        '<div class="card"><h3>Assets by group</h3>' + groupBars + '</div>' +
        '<div class="card"><h3>Assets by status</h3><div class="table-wrap"><table><thead><tr>' +
        '<th>Status</th><th class="num">Count</th></tr></thead><tbody>' + statusRows +
        '</tbody></table></div></div>' +
        '</div>' +
        '<div class="card"><h3>Top categories</h3><div class="table-wrap"><table><thead><tr>' +
        '<th>Category</th><th>Code</th><th class="num">Assets</th><th class="num">Value</th>' +
        '</tr></thead><tbody>' + categoryRows + '</tbody></table></div></div>' +
        warranty +
        '<div class="card"><h3>Recently added</h3><div class="table-wrap"><table><thead><tr>' +
        '<th>S.NO</th><th>Asset Code</th><th>Asset</th><th>Belongs To</th><th>Category</th>' +
        '<th>Entered By</th><th>Entered On</th></tr></thead><tbody>' + recentRows +
        '</tbody></table></div></div>';
    }, fail);
  }

  /* ---------------------------------------------------------- asset listing */

  function assetFilters() {
    var q = state.assetQuery;
    return (
      '<div class="card"><div class="toolbar">' +
      '<div class="field wide"><label for="f-search">Search</label>' +
      '<input id="f-search" placeholder="Code, name, unique no, holder..." value="' +
      esc(q.search || '') + '"></div>' +
      '<div class="field"><label for="f-company">Belongs To</label><select id="f-company">' +
      '<option value="">All companies</option>' + companyOptions(q.company_id) + '</select></div>' +
      '<div class="field"><label for="f-category">Category</label><select id="f-category">' +
      '<option value="">All categories</option>' + categoryOptions(q.category_id) + '</select></div>' +
      '<div class="field"><label for="f-status">Status</label><select id="f-status">' +
      '<option value="">Any status</option>' + pickOptions(state.statuses, q.status) + '</select></div>' +
      '<div class="field"><label for="f-from">Purchased from</label>' +
      '<input id="f-from" type="date" value="' + esc(q.from || '') + '"></div>' +
      '<div class="field"><label for="f-to">to</label>' +
      '<input id="f-to" type="date" value="' + esc(q.to || '') + '"></div>' +
      '<button class="btn" id="f-apply" type="button">Apply</button>' +
      '<button class="btn ghost" id="f-clear" type="button">Clear</button>' +
      '</div></div>'
    );
  }

  function bindFilters() {
    var apply = function () {
      state.assetQuery = Object.assign({}, state.assetQuery, {
        search: value('f-search'),
        company_id: value('f-company'),
        category_id: value('f-category'),
        status: value('f-status'),
        from: value('f-from'),
        to: value('f-to'),
        page: 1,
      });
      state.selection = {};
      viewAssets();
    };
    on('#f-apply', 'click', apply);
    on('#f-search', 'keydown', function (e) {
      if (e.key === 'Enter') apply();
    });
    on('#f-clear', 'click', function () {
      state.assetQuery = { page: 1, page_size: state.assetQuery.page_size, sort: 's_no', dir: 'desc' };
      state.selection = {};
      viewAssets();
    });
  }

  function sortHeader(key, label, extraClass) {
    var q = state.assetQuery;
    var arrow = q.sort === key ? (q.dir === 'asc' ? ' &uarr;' : ' &darr;') : '';
    return (
      '<th class="sortable ' + (extraClass || '') + '" data-sort="' + key + '">' +
      esc(label) + arrow + '</th>'
    );
  }

  function viewAssets() {
    loading();
    var q = state.assetQuery;
    window.api.get('/api/assets' + window.api.query(q)).then(function (data) {
      var rows = data.assets.length
        ? data.assets
            .map(function (a) {
              return (
                '<tr>' +
                (canEdit()
                  ? '<td><input type="checkbox" class="row-check" data-id="' + a.id + '"' +
                    (state.selection[a.id] ? ' checked' : '') + '></td>'
                  : '') +
                '<td class="num">' + a.s_no + '</td>' +
                '<td class="mono"><a href="#/assets/' + a.id + '">' + esc(a.asset_code) + '</a></td>' +
                '<td>' + esc(a.name) +
                (a.unique_no ? '<div class="help" style="color:#64748b;font-size:11.5px">No. ' + esc(a.unique_no) + '</div>' : '') +
                '</td>' +
                '<td>' + esc(a.category_name) + '</td>' +
                '<td><span class="tag company">' + esc(a.company_code) + '</span></td>' +
                '<td>' + esc(a.current_user || a.handover_to || '-') + '</td>' +
                '<td>' + esc(a.location || '-') + '</td>' +
                '<td>' + fmtDate(a.purchase_date) + '</td>' +
                '<td class="num">' + money(a.purchase_cost) + '</td>' +
                '<td>' + statusTag(a.status) + '</td>' +
                '<td><div class="row-actions">' +
                '<a class="btn small ghost" href="#/assets/' + a.id + '">Open</a>' +
                (canEdit()
                  ? '<button class="btn small secondary print-one" data-id="' + a.id + '">Label</button>'
                  : '') +
                '</div></td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="12"><div class="empty"><div class="big">No assets match</div>' +
          'Change the filters, or add the first asset.</div></td></tr>';

      var selectedCount = Object.keys(state.selection).filter(function (k) {
        return state.selection[k];
      }).length;

      view.innerHTML =
        pageHead(
          'Asset Register',
          data.total + ' asset(s) found - total value ' + money(data.total_cost),
          (canEdit() ? '<a class="btn" href="#/assets/new">+ Add Asset</a>' : '') +
            '<button class="btn secondary" id="export-csv" type="button">Export CSV</button>' +
            (canEdit()
              ? '<button class="btn secondary" id="print-selected" type="button">Print labels (' +
                selectedCount + ')</button>'
              : '')
        ) +
        assetFilters() +
        '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        (canEdit() ? '<th><input type="checkbox" id="check-all"></th>' : '') +
        sortHeader('s_no', 'S.NO', 'num') +
        sortHeader('asset_code', 'Asset Code') +
        sortHeader('name', 'Name of Asset') +
        '<th>Category</th>' +
        sortHeader('company', 'Belongs To') +
        '<th>Used By</th><th>Location</th>' +
        sortHeader('purchase_date', 'Purchase Date') +
        sortHeader('purchase_cost', 'Cost', 'num') +
        '<th>Status</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="pager">' +
        '<button class="btn small ghost" id="prev-page"' + (data.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
        '<span>Page ' + data.page + ' of ' + data.pages + '</span>' +
        '<button class="btn small ghost" id="next-page"' +
        (data.page >= data.pages ? ' disabled' : '') + '>Next</button>' +
        '<span class="spacer"></span>' +
        '<label for="page-size" style="font-weight:400">Rows</label>' +
        '<select id="page-size" style="width:auto">' +
        [25, 50, 100, 200]
          .map(function (n) {
            return '<option value="' + n + '"' + (n === q.page_size ? ' selected' : '') + '>' + n + '</option>';
          })
          .join('') +
        '</select></div></div>';

      bindFilters();

      on('th.sortable', 'click', function (e) {
        var key = e.currentTarget.getAttribute('data-sort');
        state.assetQuery.dir = state.assetQuery.sort === key && state.assetQuery.dir === 'asc' ? 'desc' : 'asc';
        state.assetQuery.sort = key;
        viewAssets();
      });

      on('#prev-page', 'click', function () {
        state.assetQuery.page = Math.max(1, data.page - 1);
        viewAssets();
      });
      on('#next-page', 'click', function () {
        state.assetQuery.page = Math.min(data.pages, data.page + 1);
        viewAssets();
      });
      on('#page-size', 'change', function (e) {
        state.assetQuery.page_size = Number(e.target.value);
        state.assetQuery.page = 1;
        viewAssets();
      });

      on('#export-csv', 'click', function () {
        var params = Object.assign({}, q);
        delete params.page;
        delete params.page_size;
        downloadCsv('/api/assets/export.csv' + window.api.query(params));
      });

      on('.row-check', 'change', function (e) {
        state.selection[e.target.getAttribute('data-id')] = e.target.checked;
        refreshSelectedCount();
      });

      on('#check-all', 'change', function (e) {
        view.querySelectorAll('.row-check').forEach(function (box) {
          box.checked = e.target.checked;
          state.selection[box.getAttribute('data-id')] = e.target.checked;
        });
        refreshSelectedCount();
      });

      on('.print-one', 'click', function (e) {
        var id = e.currentTarget.getAttribute('data-id');
        printByIds([id]);
      });

      on('#print-selected', 'click', function () {
        var ids = Object.keys(state.selection).filter(function (k) {
          return state.selection[k];
        });
        if (!ids.length) return toast('Tick the assets whose labels you want to print.', true);
        printByIds(ids);
      });
    }, fail);
  }

  function refreshSelectedCount() {
    var button = document.getElementById('print-selected');
    if (!button) return;
    var count = Object.keys(state.selection).filter(function (k) {
      return state.selection[k];
    }).length;
    button.textContent = 'Print labels (' + count + ')';
  }

  /** CSV needs the auth header, so fetch it and hand the browser a blob. */
  function downloadCsv(url) {
    fetch(url, { headers: { Authorization: 'Bearer ' + window.api.getToken() } })
      .then(function (response) {
        if (!response.ok) throw new Error('Export failed.');
        return response.blob();
      })
      .then(function (blob) {
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'assets-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () {
          URL.revokeObjectURL(link.href);
        }, 4000);
      })
      .catch(fail);
  }

  function printByIds(ids) {
    Promise.all(
      ids.map(function (id) {
        return window.api.get('/api/assets/' + id).then(function (d) {
          return d.asset;
        });
      })
    )
      .then(function (assets) {
        if (!window.Labels.printLabels(assets)) return;
        return window.api.post('/api/assets/mark-printed', { ids: ids.map(Number) });
      })
      .catch(fail);
  }

  /* ------------------------------------------------------------- asset form */

  function fieldText(id, label, opts) {
    var o = opts || {};
    return (
      '<div class="field' + (o.span ? ' span-' + o.span : '') + '">' +
      '<label for="' + id + '">' + esc(label) + (o.required ? ' <span class="req">*</span>' : '') + '</label>' +
      '<input id="' + id + '" type="' + (o.type || 'text') + '"' +
      (o.value !== undefined && o.value !== null ? ' value="' + esc(o.value) + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      (o.readonly ? ' readonly' : '') +
      (o.step ? ' step="' + o.step + '"' : '') +
      (o.min !== undefined ? ' min="' + o.min + '"' : '') + '>' +
      (o.help ? '<span class="help">' + esc(o.help) + '</span>' : '') +
      '</div>'
    );
  }

  function viewAssetForm(id) {
    if (!canEdit()) {
      view.innerHTML = '<div class="card"><div class="empty">Only an asset controller or the admin can enter assets.</div></div>';
      return;
    }

    var loader = id ? window.api.get('/api/assets/' + id) : Promise.resolve({ asset: null });
    loading();

    loader.then(function (data) {
      var a = data.asset || {};
      var isEdit = !!id;
      var today = new Date().toISOString().slice(0, 10);

      view.innerHTML =
        pageHead(
          isEdit ? 'Edit Asset ' + a.asset_code : 'Add New Asset',
          isEdit
            ? 'The asset code stays as printed on the sticker.'
            : 'The asset code is generated automatically from the company and the category.',
          '<a class="btn ghost" href="#/assets">Back to list</a>'
        ) +
        '<form id="asset-form">' +
        '<div id="form-error" class="alert error hidden"></div>' +

        '<div class="card"><h3>1. Asset details</h3><div class="form-grid">' +
        '<div class="field span-2"><label for="a-name">Name of Asset <span class="req">*</span></label>' +
        '<input id="a-name" required placeholder="e.g. Dell Latitude 3540 Laptop" value="' + esc(a.name || '') + '">' +
        '<span class="help">What the item is, in plain words.</span></div>' +
        '<div class="field"><label for="a-category">Category of Asset <span class="req">*</span></label>' +
        '<select id="a-category" required>' + categoryOptions(a.category_id) + '</select>' +
        '<span class="help">Drives the middle part of the asset code.</span></div>' +
        '<div class="field"><label for="a-company">Belongs To <span class="req">*</span></label>' +
        '<select id="a-company" required>' + companyOptions(a.company_id) + '</select></div>' +
        '<div class="field"><label for="a-code">Asset Code</label>' +
        '<input id="a-code" readonly value="' + esc(a.asset_code || '') + '">' +
        '<span class="help">Generated automatically - printed on the sticker.</span></div>' +
        fieldText('a-unique', 'Unique No of Asset', {
          value: a.unique_no,
          placeholder: 'Your own tag / unique number',
          help: 'Optional, but no two assets may share it.',
        }) +
        fieldText('a-serial', 'Manufacturer Serial No', { value: a.serial_number }) +
        fieldText('a-brand', 'Brand / Make', { value: a.brand, placeholder: 'e.g. Dell, Godrej, JCB' }) +
        fieldText('a-model', 'Model', { value: a.model }) +
        fieldText('a-qty', 'Quantity', { value: a.quantity || 1, type: 'number', min: 1 }) +
        fieldText('a-unit', 'Unit', { value: a.unit || 'Nos', placeholder: 'Nos, Set, Pair' }) +
        '</div></div>' +

        '<div class="card"><h3>2. Purchase</h3><div class="form-grid">' +
        fieldText('a-pdate', 'Date of Purchase', {
          type: 'date',
          value: a.purchase_date || (isEdit ? '' : today),
          required: true,
        }) +
        fieldText('a-cost', 'Purchase Cost', { type: 'number', step: '0.01', min: 0, value: a.purchase_cost }) +
        fieldText('a-vendor', 'Vendor / Supplier', { value: a.vendor }) +
        fieldText('a-invoice', 'Invoice No', { value: a.invoice_no }) +
        fieldText('a-warranty', 'Warranty Expiry', { type: 'date', value: a.warranty_expiry }) +
        '</div></div>' +

        '<div class="card"><h3>3. Handover &amp; usage</h3><div class="form-grid">' +
        fieldText('a-handover', 'Handover To', {
          value: a.handover_to,
          placeholder: 'Person the asset was handed to',
        }) +
        fieldText('a-hdate', 'Handover Date', { type: 'date', value: a.handover_date }) +
        fieldText('a-current', 'Currently Used By', {
          value: a.current_user,
          placeholder: 'Person using it now',
        }) +
        fieldText('a-dept', 'Department / Site', { value: a.department, placeholder: 'e.g. Accounts, Site-2, School Block A' }) +
        fieldText('a-location', 'Location', { value: a.location, placeholder: 'Room, floor, store' }) +
        '<div class="field"><label for="a-condition">Condition</label><select id="a-condition">' +
        pickOptions(state.conditions, a.condition || 'Good') + '</select></div>' +
        '<div class="field"><label for="a-status">Status</label><select id="a-status">' +
        pickOptions(state.statuses, a.status || 'In Use') + '</select></div>' +
        '<div class="field span-3"><label for="a-remarks">Remarks</label>' +
        '<textarea id="a-remarks" placeholder="Anything else worth recording">' + esc(a.remarks || '') + '</textarea></div>' +
        '</div></div>' +

        '<div class="card"><div class="toolbar">' +
        (isEdit
          ? ''
          : '<label class="checkline"><input type="checkbox" id="a-print" checked> Print the sticker straight after saving</label>') +
        '<span style="flex:1"></span>' +
        '<button class="btn" type="submit" id="a-save">' + (isEdit ? 'Save changes' : 'Save asset') + '</button>' +
        (isEdit
          ? ''
          : '<button class="btn secondary" type="button" id="a-save-another">Save &amp; add another</button>') +
        '<a class="btn ghost" href="#/assets">Cancel</a>' +
        '</div></div></form>';

      var refreshCode = function () {
        if (isEdit) return;
        window.api
          .post('/api/assets/preview-code', {
            company_id: value('a-company'),
            category_id: value('a-category'),
          })
          .then(function (res) {
            document.getElementById('a-code').value = res.code;
          })
          .catch(function () {
            document.getElementById('a-code').value = '';
          });
      };

      on('#a-company', 'change', refreshCode);
      on('#a-category', 'change', refreshCode);
      refreshCode();

      var collect = function () {
        return {
          name: value('a-name'),
          category_id: value('a-category'),
          company_id: value('a-company'),
          unique_no: value('a-unique'),
          serial_number: value('a-serial'),
          brand: value('a-brand'),
          model: value('a-model'),
          quantity: value('a-qty') || 1,
          unit: value('a-unit') || 'Nos',
          purchase_date: value('a-pdate'),
          purchase_cost: value('a-cost'),
          vendor: value('a-vendor'),
          invoice_no: value('a-invoice'),
          warranty_expiry: value('a-warranty'),
          handover_to: value('a-handover'),
          handover_date: value('a-hdate'),
          current_user: value('a-current'),
          department: value('a-dept'),
          location: value('a-location'),
          condition: value('a-condition'),
          status: value('a-status'),
          remarks: (document.getElementById('a-remarks') || {}).value || '',
        };
      };

      var submit = function (again) {
        var errorBox = document.getElementById('form-error');
        errorBox.className = 'alert error hidden';
        var body = collect();
        if (!body.name) {
          errorBox.textContent = 'Enter the name of the asset.';
          errorBox.className = 'alert error';
          return;
        }

        var request = isEdit
          ? window.api.patch('/api/assets/' + id, body)
          : window.api.post('/api/assets', body);

        request
          .then(function (res) {
            var asset = res.asset;
            toast(isEdit ? 'Asset updated.' : 'Saved as ' + asset.asset_code);
            if (!isEdit && checked('a-print')) {
              window.Labels.printLabels([asset]);
              window.api.post('/api/assets/mark-printed', { ids: [asset.id] }).catch(function () {});
            }
            if (again) {
              viewAssetForm(null);
            } else {
              location.hash = '#/assets/' + asset.id;
            }
          })
          .catch(function (error) {
            errorBox.textContent = error.message;
            errorBox.className = 'alert error';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
      };

      document.getElementById('asset-form').addEventListener('submit', function (e) {
        e.preventDefault();
        submit(false);
      });
      on('#a-save-another', 'click', function () {
        submit(true);
      });
    }, fail);
  }

  /* ----------------------------------------------------------- asset detail */

  function viewAssetDetail(id) {
    loading();
    window.api.get('/api/assets/' + id).then(function (data) {
      var a = data.asset;
      var item = function (label, val) {
        return '<div class="item"><div class="k">' + esc(label) + '</div><div class="v">' + val + '</div></div>';
      };

      view.innerHTML =
        pageHead(
          a.asset_code,
          a.name,
          (canEdit() ? '<a class="btn" href="#/assets/' + a.id + '/edit">Edit</a>' : '') +
            (canEdit() ? '<button class="btn secondary" id="print-label">Print label</button>' : '') +
            (canEdit() ? '<button class="btn ghost" id="verify-btn">Mark verified</button>' : '') +
            (can('admin') ? '<button class="btn danger" id="delete-btn">Delete</button>' : '') +
            '<a class="btn ghost" href="#/assets">Back</a>'
        ) +
        '<div class="grid cols-2">' +
        '<div class="card"><h3>Sticker preview (50 x 25 mm)</h3>' +
        '<div class="label-preview-area">' + window.Labels.buildLabel(a) + '</div>' +
        '<p class="help" style="color:#64748b;margin-top:10px;font-size:12.5px">' +
        'The printed sticker carries this Code 128 barcode. Any scanner reads it back as ' +
        esc(a.asset_code) + '.</p>' +
        (canEdit()
          ? '<div class="toolbar" style="margin-top:10px">' +
            '<div class="field" style="max-width:110px"><label for="copies">Copies</label>' +
            '<input id="copies" type="number" min="1" max="50" value="1"></div>' +
            '<button class="btn secondary" id="print-copies" type="button">Print</button></div>'
          : '') +
        '</div>' +
        '<div class="card"><h3>Register entry</h3><div class="detail-list">' +
        item('S.NO', a.s_no) +
        item('Asset Code', '<span class="mono">' + esc(a.asset_code) + '</span>') +
        item('Name of Asset', esc(a.name)) +
        item('Category', esc(a.category_name) + ' <span class="tag">' + esc(a.category_code) + '</span>') +
        item('Category Group', esc(a.category_group)) +
        item('Belongs To', '<span class="tag company">' + esc(a.company_code) + '</span> ' + esc(a.company_name)) +
        item('Unique No of Asset', esc(a.unique_no || '-')) +
        item('Manufacturer Serial No', esc(a.serial_number || '-')) +
        item('Brand / Model', esc([a.brand, a.model].filter(Boolean).join(' ') || '-')) +
        item('Quantity', esc(a.quantity + ' ' + a.unit)) +
        item('Status', statusTag(a.status)) +
        item('Condition', esc(a.condition)) +
        '</div></div>' +
        '</div>' +
        '<div class="grid cols-2">' +
        '<div class="card"><h3>Purchase</h3><div class="detail-list">' +
        item('Date of Purchase', fmtDate(a.purchase_date)) +
        item('Purchase Cost', money(a.purchase_cost)) +
        item('Vendor', esc(a.vendor || '-')) +
        item('Invoice No', esc(a.invoice_no || '-')) +
        item('Warranty Expiry', fmtDate(a.warranty_expiry)) +
        '</div></div>' +
        '<div class="card"><h3>Handover &amp; usage</h3><div class="detail-list">' +
        item('Handover To', esc(a.handover_to || '-')) +
        item('Handover Date', fmtDate(a.handover_date)) +
        item('Currently Used By', esc(a.current_user || '-')) +
        item('Department / Site', esc(a.department || '-')) +
        item('Location', esc(a.location || '-')) +
        item('Remarks', esc(a.remarks || '-')) +
        '</div></div>' +
        '</div>' +
        '<div class="card"><h3>Record history</h3><div class="detail-list">' +
        item('Entered by', esc(a.created_by_name || '-') + ' on ' + fmtDateTime(a.created_at)) +
        item('Last updated by', esc(a.updated_by_name || '-') + ' on ' + fmtDateTime(a.updated_at)) +
        item('Label printed', a.label_printed_at ? fmtDateTime(a.label_printed_at) : 'Not printed yet') +
        item('Last physically verified', a.last_verified_at ? fmtDateTime(a.last_verified_at) : 'Not verified yet') +
        '</div></div>';

      on('#print-label', 'click', function () {
        printByIds([a.id]);
      });
      on('#print-copies', 'click', function () {
        var copies = Number(value('copies')) || 1;
        window.Labels.printLabels([a], { copies: copies });
        window.api.post('/api/assets/mark-printed', { ids: [a.id] }).catch(function () {});
      });
      on('#verify-btn', 'click', function () {
        window.api.post('/api/assets/' + a.id + '/verify').then(function () {
          toast('Marked as verified.');
          viewAssetDetail(id);
        }, fail);
      });
      on('#delete-btn', 'click', function () {
        if (!confirm('Delete ' + a.asset_code + ' permanently? This cannot be undone.')) return;
        window.api.del('/api/assets/' + a.id).then(function () {
          toast('Asset deleted.');
          location.hash = '#/assets';
        }, fail);
      });
    }, fail);
  }

  /* ------------------------------------------------------------ label batch */

  function viewLabels() {
    if (!canEdit()) {
      view.innerHTML = '<div class="card"><div class="empty">Label printing is for asset controllers.</div></div>';
      return;
    }
    var settings = window.Labels.loadSettings();

    view.innerHTML =
      pageHead(
        'Print Labels',
        'Sticker size 50 x 25 mm - load the roll, then print. One sticker per page.',
        '<a class="btn ghost" href="#/assets">Pick assets from the register</a>'
      ) +
      '<div class="grid cols-2">' +
      '<div class="card"><h3>Sticker setup</h3><div class="form-grid cols-2">' +
      fieldText('s-width', 'Sticker width (mm)', { type: 'number', step: '0.5', min: 20, value: settings.width }) +
      fieldText('s-height', 'Sticker height (mm)', { type: 'number', step: '0.5', min: 12, value: settings.height }) +
      fieldText('s-bar', 'Barcode height (mm)', { type: 'number', step: '0.5', min: 4, value: settings.barcode_height }) +
      fieldText('s-copies', 'Copies of each label', { type: 'number', min: 1, value: settings.copies }) +
      '<div class="field span-2">' +
      '<label class="checkline"><input type="checkbox" id="s-company"' + (settings.show_company ? ' checked' : '') + '> Show company code</label>' +
      '<label class="checkline"><input type="checkbox" id="s-category"' + (settings.show_category ? ' checked' : '') + '> Show category code</label>' +
      '<label class="checkline"><input type="checkbox" id="s-name"' + (settings.show_name ? ' checked' : '') + '> Show asset name</label>' +
      '<label class="checkline"><input type="checkbox" id="s-date"' + (settings.show_date ? ' checked' : '') + '> Show purchase date</label>' +
      '</div></div>' +
      '<div class="toolbar" style="margin-top:12px">' +
      '<button class="btn" id="s-save" type="button">Save setup</button>' +
      '<button class="btn ghost" id="s-test" type="button">Print one test sticker</button></div>' +
      '<p class="help" style="color:#64748b;margin-top:10px;font-size:12.5px">' +
      'In the printer dialog set scale to 100% (never "fit to page") and margins to none, so the barcode keeps its exact width.</p>' +
      '</div>' +
      '<div class="card"><h3>Preview</h3><div class="label-preview-area" id="preview"></div></div>' +
      '</div>' +
      '<div class="card"><h3>Batch print</h3><div class="toolbar">' +
      '<div class="field"><label for="b-company">Belongs To</label><select id="b-company">' +
      '<option value="">All companies</option>' + companyOptions('') + '</select></div>' +
      '<div class="field"><label for="b-category">Category</label><select id="b-category">' +
      '<option value="">All categories</option>' + categoryOptions('') + '</select></div>' +
      '<div class="field"><label class="checkline" style="margin-top:22px">' +
      '<input type="checkbox" id="b-pending" checked> Only assets whose sticker is not printed yet</label></div>' +
      '<button class="btn" id="b-load" type="button">Load list</button>' +
      '</div><div id="batch-result" style="margin-top:14px"></div></div>';

    var sampleAsset = {
      asset_code: 'AICC-LAP-0001',
      company_code: 'AICC',
      category_code: 'LAP',
      name: 'Dell Latitude Laptop',
      purchase_date: new Date().toISOString().slice(0, 10),
    };

    var current = function () {
      return {
        width: Number(value('s-width')) || 50,
        height: Number(value('s-height')) || 25,
        barcode_height: Number(value('s-bar')) || 8.5,
        copies: Number(value('s-copies')) || 1,
        show_company: checked('s-company'),
        show_category: checked('s-category'),
        show_name: checked('s-name'),
        show_date: checked('s-date'),
      };
    };

    var preview = function () {
      document.getElementById('preview').innerHTML = window.Labels.buildLabel(sampleAsset, current());
    };

    on('#s-save', 'click', function () {
      window.Labels.saveSettings(current());
      toast('Sticker setup saved.');
      preview();
    });
    on('#s-test', 'click', function () {
      window.Labels.printLabels([sampleAsset], Object.assign(current(), { copies: 1 }));
    });
    view.querySelectorAll('.card input').forEach(function (node) {
      node.addEventListener('change', preview);
      node.addEventListener('input', preview);
    });
    preview();

    on('#b-load', 'click', function () {
      var params = {
        company_id: value('b-company'),
        category_id: value('b-category'),
        page_size: 200,
        sort: 's_no',
        dir: 'asc',
      };
      if (checked('b-pending')) params.unlabelled = '1';

      window.api.get('/api/assets' + window.api.query(params)).then(function (data) {
        var box = document.getElementById('batch-result');
        if (!data.assets.length) {
          box.innerHTML = '<div class="empty">Nothing to print for this selection.</div>';
          return;
        }
        box.innerHTML =
          '<div class="alert info">' + data.assets.length + ' label(s) ready' +
          (data.total > data.assets.length ? ' (first ' + data.assets.length + ' of ' + data.total + ')' : '') +
          '.</div><div class="table-wrap"><table><thead><tr><th>S.NO</th><th>Asset Code</th>' +
          '<th>Asset</th><th>Belongs To</th></tr></thead><tbody>' +
          data.assets
            .map(function (a) {
              return (
                '<tr><td class="num">' + a.s_no + '</td><td class="mono">' + esc(a.asset_code) + '</td>' +
                '<td>' + esc(a.name) + '</td><td>' + esc(a.company_code) + '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>' +
          '<button class="btn" id="b-print" type="button" style="margin-top:12px">Print these ' +
          data.assets.length + ' label(s)</button>';

        on('#b-print', 'click', function () {
          window.Labels.printLabels(data.assets, current());
          window.api
            .post('/api/assets/mark-printed', {
              ids: data.assets.map(function (a) {
                return a.id;
              }),
            })
            .catch(function () {});
        });
      }, fail);
    });
  }

  /* -------------------------------------------------------------- scan/find */

  function viewScan() {
    view.innerHTML =
      pageHead('Scan / Find Asset', 'Scan the sticker with a barcode reader, or type the asset code.') +
      '<div class="card"><div class="scan-box">' +
      '<input id="scan-input" placeholder="AICC-LAP-0001" autofocus autocomplete="off">' +
      '<button class="btn" id="scan-go" type="button">Find</button></div>' +
      '<p class="help" style="color:#64748b;margin-top:8px;font-size:12.5px">' +
      'A USB barcode reader types the code and presses Enter by itself.</p></div>' +
      '<div id="scan-result"></div>';

    var lookup = function () {
      var code = value('scan-input');
      if (!code) return;
      var box = document.getElementById('scan-result');
      window.api
        .get('/api/assets/by-code/' + encodeURIComponent(code))
        .then(function (data) {
          var a = data.asset;
          box.innerHTML =
            '<div class="card"><div class="card-head"><h3>' + esc(a.asset_code) + ' - ' + esc(a.name) + '</h3>' +
            '<div class="actions"><a class="btn small secondary" href="#/assets/' + a.id + '">Open full record</a>' +
            (canEdit() ? ' <button class="btn small" id="scan-verify">Mark verified</button>' : '') +
            '</div></div><div class="detail-list">' +
            '<div class="item"><div class="k">Belongs To</div><div class="v">' + esc(a.company_name) + '</div></div>' +
            '<div class="item"><div class="k">Category</div><div class="v">' + esc(a.category_name) + '</div></div>' +
            '<div class="item"><div class="k">Currently Used By</div><div class="v">' + esc(a.current_user || '-') + '</div></div>' +
            '<div class="item"><div class="k">Location</div><div class="v">' + esc(a.location || '-') + '</div></div>' +
            '<div class="item"><div class="k">Status</div><div class="v">' + statusTag(a.status) + '</div></div>' +
            '<div class="item"><div class="k">Purchase Date</div><div class="v">' + fmtDate(a.purchase_date) + '</div></div>' +
            '</div></div>';
          on('#scan-verify', 'click', function () {
            window.api.post('/api/assets/' + a.id + '/verify').then(function () {
              toast('Verified ' + a.asset_code);
            }, fail);
          });
          var input = document.getElementById('scan-input');
          input.value = '';
          input.focus();
        })
        .catch(function (error) {
          box.innerHTML = '<div class="alert error">' + esc(error.message) + '</div>';
        });
    };

    on('#scan-go', 'click', lookup);
    on('#scan-input', 'keydown', function (e) {
      if (e.key === 'Enter') lookup();
    });
  }

  /* --------------------------------------------------------------- masters */

  function viewMaster(kind) {
    var isCategory = kind === 'categories';
    var title = isCategory ? 'Asset Categories' : 'Companies';
    var admin = can('admin');
    loading();

    window.api.get('/api/' + kind).then(function (data) {
      var rows = data[kind];
      var groups = {};
      rows.forEach(function (r) {
        var key = isCategory ? r.category_group : 'Companies';
        (groups[key] = groups[key] || []).push(r);
      });

      var body = Object.keys(groups)
        .sort()
        .map(function (group) {
          return (
            (isCategory ? '<tr><td colspan="6" style="background:#f8fafc;font-weight:600">' + esc(group) + '</td></tr>' : '') +
            groups[group]
              .map(function (r) {
                return (
                  '<tr><td class="mono">' + esc(r.code) + '</td><td>' + esc(r.name) + '</td>' +
                  '<td class="num">' + r.asset_count + '</td>' +
                  '<td>' + (r.is_active ? '<span class="tag ok">Active</span>' : '<span class="tag">Off</span>') + '</td>' +
                  (admin
                    ? '<td><div class="row-actions">' +
                      '<button class="btn small ghost m-rename" data-id="' + r.id + '" data-name="' + esc(r.name) + '">Rename</button>' +
                      '<button class="btn small ghost m-toggle" data-id="' + r.id + '" data-active="' + r.is_active + '">' +
                      (r.is_active ? 'Switch off' : 'Switch on') + '</button>' +
                      (r.asset_count ? '' : '<button class="btn small danger m-del" data-id="' + r.id + '">Delete</button>') +
                      '</div></td>'
                    : '<td></td>') +
                  '</tr>'
                );
              })
              .join('')
          );
        })
        .join('');

      view.innerHTML =
        pageHead(
          title,
          isCategory
            ? 'The category code becomes the middle part of every asset code, e.g. AICC-LAP-0007.'
            : 'The company code is the first part of every asset code.',
          ''
        ) +
        (admin
          ? '<div class="card"><h3>Add new</h3><div class="toolbar">' +
            '<div class="field"><label for="m-code">Code</label><input id="m-code" maxlength="8" placeholder="' +
            (isCategory ? 'LAP' : 'AICC') + '" style="text-transform:uppercase"></div>' +
            '<div class="field wide"><label for="m-name">Name</label><input id="m-name" placeholder="' +
            (isCategory ? 'Laptop' : 'Company name') + '"></div>' +
            (isCategory
              ? '<div class="field"><label for="m-group">Group</label><input id="m-group" list="group-list" placeholder="IT & Electronics">' +
                '<datalist id="group-list">' +
                Object.keys(groups)
                  .map(function (g) {
                    return '<option value="' + esc(g) + '">';
                  })
                  .join('') +
                '</datalist></div>'
              : '') +
            '<button class="btn" id="m-add" type="button">Add</button></div></div>'
          : '') +
        '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        '<th>Code</th><th>Name</th><th class="num">Assets</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div></div>';

      on('#m-add', 'click', function () {
        var body = { code: value('m-code').toUpperCase(), name: value('m-name') };
        if (isCategory) body.category_group = value('m-group') || 'General';
        window.api.post('/api/' + kind, body).then(function () {
          toast('Added.');
          viewMaster(kind);
        }, fail);
      });

      on('.m-rename', 'click', function (e) {
        var id = e.currentTarget.getAttribute('data-id');
        var name = prompt('New name:', e.currentTarget.getAttribute('data-name'));
        if (name === null) return;
        window.api.patch('/api/' + kind + '/' + id, { name: name }).then(function () {
          toast('Renamed.');
          viewMaster(kind);
        }, fail);
      });

      on('.m-toggle', 'click', function (e) {
        var id = e.currentTarget.getAttribute('data-id');
        var active = e.currentTarget.getAttribute('data-active') === '1';
        window.api.patch('/api/' + kind + '/' + id, { is_active: !active }).then(function () {
          viewMaster(kind);
        }, fail);
      });

      on('.m-del', 'click', function (e) {
        if (!confirm('Delete this entry?')) return;
        window.api.del('/api/' + kind + '/' + e.currentTarget.getAttribute('data-id')).then(function () {
          toast('Deleted.');
          viewMaster(kind);
        }, fail);
      });
    }, fail);
  }

  /* ----------------------------------------------------------------- users */

  /** Admin sets a new password for someone who has lost theirs. */
  function openPasswordReset(id, username) {
    var modal = openModal(
      'Reset password for ' + username,
      '<div id="rp-error" class="alert error hidden"></div>' +
        passwordField('rp-new', 'New password', { required: true, help: 'At least 6 characters.' }) +
        passwordField('rp-confirm', 'Repeat password', { required: true }) +
        '<label class="checkline" style="margin-bottom:14px">' +
        '<input type="checkbox" id="rp-force" checked> Ask them to choose their own at next sign-in' +
        '</label>' +
        '<div class="toolbar">' +
        '<button class="btn ghost" type="button" id="rp-generate">Generate</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn" type="button" id="rp-save" data-default-action>Set password</button>' +
        '<button class="btn ghost" type="button" id="rp-cancel">Cancel</button>' +
        '</div>'
    );

    var errorBox = modal.querySelector('#rp-error');

    var showError = function (message) {
      errorBox.textContent = message;
      errorBox.className = 'alert error';
    };

    var clearError = function () {
      errorBox.className = 'alert error hidden';
    };

    on('#rp-cancel', 'click', closeModal, modal);
    on('#rp-new, #rp-confirm', 'input', clearError, modal);

    on('#rp-generate', 'click', function () {
      clearError();
      var password = generatePassword();
      modal.querySelector('#rp-new').value = password;
      modal.querySelector('#rp-confirm').value = password;
      setPasswordVisible('rp-new', true);
      setPasswordVisible('rp-confirm', true);
    }, modal);

    on('#rp-save', 'click', function () {
      var password = modal.querySelector('#rp-new').value;
      if (password !== modal.querySelector('#rp-confirm').value) {
        return showError('The two passwords do not match.');
      }
      if (password.length < 6) return showError('Password must be at least 6 characters long.');

      window.api
        .post('/api/users/' + id + '/password', {
          password: password,
          must_change_password: modal.querySelector('#rp-force').checked,
        })
        .then(function () {
          // Show it once more, so the admin can pass it on before closing.
          modal.querySelector('.modal-body').innerHTML =
            '<div class="alert ok">Password set for ' + esc(username) + '.</div>' +
            '<div class="field"><label for="rp-result">Give them this password</label>' +
            '<div class="copy-row"><input id="rp-result" readonly value="' + esc(password) + '">' +
            '<button class="btn secondary" type="button" id="rp-copy">Copy</button></div></div>' +
            '<div class="toolbar"><span style="flex:1"></span>' +
            '<button class="btn" type="button" id="rp-done" data-default-action>Done</button></div>';

          on('#rp-copy', 'click', function () {
            copyFrom('rp-result').then(
              function () {
                toast('Password copied.');
              },
              function (error) {
                toast(error.message, true);
              }
            );
          }, modal);
          on('#rp-done', 'click', closeModal, modal);
          modal.querySelector('#rp-done').focus();
        })
        .catch(function (error) {
          showError(error.message);
        });
    }, modal);
  }

  function viewUsers() {
    if (!can('admin')) {
      view.innerHTML = '<div class="card"><div class="empty">Only the admin manages logins.</div></div>';
      return;
    }
    loading();

    window.api.get('/api/users').then(function (data) {
      var rows = data.users
        .map(function (u) {
          return (
            '<tr><td><strong>' + esc(u.username) + '</strong>' +
            (u.must_change_password ? ' <span class="tag warn">must change password</span>' : '') +
            '</td><td>' + esc(u.full_name || '-') + '</td>' +
            '<td><span class="tag role">' + esc(u.role) + '</span></td>' +
            '<td class="num">' + u.assets_created + '</td>' +
            '<td>' + (u.is_active ? '<span class="tag ok">Active</span>' : '<span class="tag bad">Disabled</span>') + '</td>' +
            '<td>' + (u.last_login_at ? fmtDateTime(u.last_login_at) : 'never') + '</td>' +
            '<td><div class="row-actions">' +
            '<button class="btn small ghost u-pass" data-id="' + u.id + '" data-name="' + esc(u.username) + '">Reset password</button>' +
            '<button class="btn small ghost u-toggle" data-id="' + u.id + '" data-active="' + u.is_active + '">' +
            (u.is_active ? 'Disable' : 'Enable') + '</button>' +
            (u.id === state.user.id
              ? ''
              : '<button class="btn small danger u-del" data-id="' + u.id + '">Remove</button>') +
            '</div></td></tr>'
          );
        })
        .join('');

      view.innerHTML =
        pageHead('Users', 'Create a login for each asset controller. They can enter assets and print stickers.') +
        '<div class="card"><h3>Create a login</h3><div class="form-grid">' +
        fieldText('u-username', 'Username', { required: true, placeholder: 'controller1' }) +
        fieldText('u-fullname', 'Full name', { placeholder: 'Name of the person' }) +
        '<div class="field"><label for="u-role">Role</label><select id="u-role">' +
        '<option value="controller">Asset Controller - enters assets, prints stickers</option>' +
        '<option value="owner">Owner - can see everything, cannot change</option>' +
        '<option value="admin">Admin - full control</option>' +
        '</select></div>' +
        passwordField('u-password', 'Password', {
          required: true,
          help: 'At least 6 characters. The user is asked to change it at first login.',
        }) +
        '</div><div class="toolbar" style="margin-top:12px">' +
        '<button class="btn" id="u-add" type="button">Create login</button></div></div>' +
        '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        '<th>Username</th><th>Name</th><th>Role</th><th class="num">Assets Entered</th>' +
        '<th>Status</th><th>Last Login</th><th></th></tr></thead><tbody>' + rows +
        '</tbody></table></div></div>';

      on('#u-add', 'click', function () {
        window.api
          .post('/api/users', {
            username: value('u-username'),
            full_name: value('u-fullname'),
            role: value('u-role'),
            password: document.getElementById('u-password').value,
          })
          .then(function (res) {
            toast('Login created for ' + res.user.username);
            viewUsers();
          }, fail);
      });

      on('.u-pass', 'click', function (e) {
        openPasswordReset(
          e.currentTarget.getAttribute('data-id'),
          e.currentTarget.getAttribute('data-name')
        );
      });

      on('.u-toggle', 'click', function (e) {
        var id = e.currentTarget.getAttribute('data-id');
        var active = e.currentTarget.getAttribute('data-active') === '1';
        window.api.patch('/api/users/' + id, { is_active: !active }).then(function () {
          viewUsers();
        }, fail);
      });

      on('.u-del', 'click', function (e) {
        if (!confirm('Remove this login?')) return;
        window.api.del('/api/users/' + e.currentTarget.getAttribute('data-id')).then(function (res) {
          toast(res.message || 'Removed.');
          viewUsers();
        }, fail);
      });
    }, fail);
  }

  /* -------------------------------------------------------------- activity */

  function viewActivity() {
    loading();
    window.api.get('/api/reports/activity?limit=200').then(function (data) {
      var rows = data.activity.length
        ? data.activity
            .map(function (l) {
              return (
                '<tr><td>' + fmtDateTime(l.created_at) + '</td><td>' + esc(l.username || 'system') + '</td>' +
                '<td><span class="tag">' + esc(l.action) + '</span></td>' +
                '<td>' + esc(l.entity) + '</td><td>' + esc(l.details || '-') + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="5" class="empty">Nothing recorded yet.</td></tr>';

      view.innerHTML =
        pageHead('Activity Log', 'Who did what, newest first.') +
        '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        '<th>When</th><th>User</th><th>Action</th><th>On</th><th>Details</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }, fail);
  }

  /* --------------------------------------------------------------- account */

  function viewAccount(forced) {
    view.innerHTML =
      pageHead(
        'My Password',
        forced ? 'Please choose your own password before you carry on.' : 'Change the password for ' + state.user.username
      ) +
      '<div class="card" style="max-width:460px">' +
      (forced ? '<div class="alert info">You are using the password given to you. Set a new one now.</div>' : '') +
      '<div id="pw-error" class="alert error hidden"></div>' +
      passwordField('pw-current', 'Current password', {
        autocomplete: 'current-password',
        style: 'margin-bottom:12px',
      }) +
      passwordField('pw-new', 'New password', { style: 'margin-bottom:12px' }) +
      passwordField('pw-confirm', 'Repeat new password', { style: 'margin-bottom:16px' }) +
      '<button class="btn" id="pw-save" type="button">Save password</button></div>';

    on('#pw-save', 'click', function () {
      var box = document.getElementById('pw-error');
      box.className = 'alert error hidden';
      var next = document.getElementById('pw-new').value;
      if (next !== document.getElementById('pw-confirm').value) {
        box.textContent = 'The two new passwords do not match.';
        box.className = 'alert error';
        return;
      }
      window.api
        .post('/api/auth/change-password', {
          current_password: document.getElementById('pw-current').value,
          new_password: next,
        })
        .then(function (res) {
          state.user = res.user;
          toast('Password changed.');
          location.hash = '#/dashboard';
          route();
        })
        .catch(function (error) {
          box.textContent = error.message;
          box.className = 'alert error';
        });
    });
  }

  /* ---------------------------------------------------------------- router */

  function route() {
    if (!state.user) return;

    var parts = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('?')[0].split('/');
    var head = parts[0] || 'dashboard';

    // A freshly created login must set its own password first.
    if (state.user.must_change_password && head !== 'account') {
      location.hash = '#/account';
      return;
    }

    renderNav(parts.slice(0, 2).join('/') === 'assets/new' ? 'assets/new' : head);
    document.getElementById('sidebar').classList.remove('open');
    window.scrollTo(0, 0);

    if (head === 'assets') {
      if (parts[1] === 'new') return viewAssetForm(null);
      if (parts[1] && parts[2] === 'edit') return viewAssetForm(parts[1]);
      if (parts[1]) return viewAssetDetail(parts[1]);
      var search = location.hash.split('?')[1];
      if (search) {
        search.split('&').forEach(function (pair) {
          var kv = pair.split('=');
          state.assetQuery[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        state.assetQuery.page = 1;
      }
      return viewAssets();
    }
    if (head === 'labels') return viewLabels();
    if (head === 'scan') return viewScan();
    if (head === 'categories') return viewMaster('categories');
    if (head === 'companies') return viewMaster('companies');
    if (head === 'users') return viewUsers();
    if (head === 'activity') return viewActivity();
    if (head === 'account') return viewAccount(!!state.user.must_change_password);
    return viewDashboard();
  }

  /* ------------------------------------------------------------- bootstrap */

  function showLogin(message) {
    state.user = null;
    appEl.classList.remove('ready');
    loginEl.hidden = false;
    var box = document.getElementById('login-error');
    if (message) {
      box.textContent = message;
      box.className = 'alert error';
    } else {
      box.className = 'alert error hidden';
    }
  }

  function startApp() {
    loginEl.hidden = true;
    appEl.classList.add('ready');
    document.getElementById('who-name').textContent = state.user.full_name || state.user.username;
    document.getElementById('who-role').textContent = state.user.role;
    document.getElementById('brand-sub').textContent =
      state.user.role === 'controller' ? 'Asset controller' : 'Group asset control';

    return Promise.all([
      window.api.get('/api/companies'),
      window.api.get('/api/categories'),
      window.api.get('/api/assets/meta'),
    ]).then(function (results) {
      state.companies = results[0].companies;
      state.categories = results[1].categories;
      state.statuses = results[2].statuses;
      state.conditions = results[2].conditions;
      route();
    });
  }

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var button = document.getElementById('login-submit');
    button.disabled = true;
    window.api
      .post('/api/auth/login', {
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value,
      })
      .then(function (data) {
        window.api.setToken(data.token);
        state.user = data.user;
        document.getElementById('login-password').value = '';
        return startApp();
      })
      .catch(function (error) {
        showLogin(error.message);
      })
      .then(function () {
        button.disabled = false;
      });
  });

  document.getElementById('logout-btn').addEventListener('click', function () {
    window.api.setToken('');
    location.hash = '#/dashboard';
    showLogin();
  });

  document.getElementById('menu-toggle').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('open');
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('auth:expired', function () {
    showLogin('Your session ended. Please sign in again.');
  });

  if (window.api.getToken()) {
    window.api.get('/api/auth/me').then(
      function (data) {
        state.user = data.user;
        startApp();
      },
      function () {
        showLogin();
      }
    );
  } else {
    showLogin();
  }
})();
