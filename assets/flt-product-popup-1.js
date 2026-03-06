/**
 * flt-product-popup-1.js
 * FLT Product Detail Popup
 *
 * Responsibilities:
 *   - Intercept product card clicks → open popup dialog
 *   - Fetch product content via Section Rendering API
 *   - Initialize content (thumbnail gallery, variant picker, qty, ATC)
 *   - Add to cart via /cart/add.js, refresh cart drawer
 *   - Manage browser history (pushState/popstate)
 *   - Response cache (Map keyed by handle)
 *
 * Vanilla JS only. No dependencies.
 */

(function () {
  'use strict';

  var SECTION_ID   = 'flt-product-popup-content-1';
  var DIALOG_ID    = 'flt-product-popup';
  var CARD_ATTR    = 'data-product-handle';
  var CART_SECTION = 'flt-cart-1';

  var cache        = new Map();
  var activeHandle = null;
  var triggerEl    = null;
  var originalPath = window.location.pathname + window.location.search;

  /* ── Helpers ─────────────────────────────────────────────────── */

  function getDialog() { return document.getElementById(DIALOG_ID); }

  function showLoading() {
    var el = document.getElementById('flt-popup-loading');
    if (el) el.removeAttribute('hidden');
    var content = document.getElementById('flt-popup-content');
    if (content) content.innerHTML = '';
  }

  function hideLoading() {
    var el = document.getElementById('flt-popup-loading');
    if (el) el.setAttribute('hidden', '');
  }

  function focusFirst(dialog) {
    var el = dialog.querySelector(
      'button:not([disabled]), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (el) setTimeout(function () { el.focus(); }, 50);
  }

  /* ── Fetch section ────────────────────────────────────────────── */

  function fetchSection(handle) {
    var url = '/products/' + handle + '?section_id=' + SECTION_ID;
    return fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (res) {
        if (!res.ok) throw new Error('Section fetch ' + res.status);
        return res.text();
      });
  }

  /* ── Inject content + init interactions ──────────────────────── */

  function injectContent(handle, html) {
    var content = document.getElementById('flt-popup-content');
    if (!content) return;
    content.innerHTML = html;
    hideLoading();
    initContent(content, handle);
    var dialog = getDialog();
    if (dialog) focusFirst(dialog);
  }

  function showError(handle) {
    hideLoading();
    var content = document.getElementById('flt-popup-content');
    if (!content) return;
    content.innerHTML =
      '<div style="padding:48px 40px;text-align:center;font-family:var(--body);color:#475569;">' +
        '<p style="margin:0 0 16px;">Unable to load product details.</p>' +
        '<a href="/products/' + handle + '" style="color:#0B2545;font-weight:700;">' +
          'View full product page →' +
        '</a>' +
      '</div>';
  }

  /* ── Content interactions ─────────────────────────────────────── */

  function initContent(root, handle) {
    initThumbs(root);
    initVariants(root);
    initQty(root);
    initATC(root, handle);
  }

  function initThumbs(root) {
    var mainImg = root.querySelector('#flt-pdc-main-img');
    var thumbs  = root.querySelectorAll('.flt-pdc__thumb');
    if (!mainImg || !thumbs.length) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        thumbs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
        thumb.setAttribute('aria-selected', 'true');
        mainImg.style.opacity = '0';
        setTimeout(function () {
          mainImg.src = thumb.dataset.src;
          mainImg.alt = thumb.dataset.alt;
          mainImg.style.opacity = '1';
        }, 150);
      });
    });
  }

  function getSelectedOptions(root) {
    var opts = [];
    root.querySelectorAll('.flt-pdc__option-btns').forEach(function (group) {
      var idx = parseInt(group.dataset.optionIndex, 10);
      var active = group.querySelector('[aria-pressed="true"]');
      opts[idx] = active ? active.dataset.value : null;
    });
    return opts;
  }

  function findVariant(variants, options) {
    return variants.find(function (v) {
      return options.every(function (opt, i) {
        return v['option' + (i + 1)] === opt;
      });
    });
  }

  function updatePriceAndATC(root, variant) {
    var priceWrap = root.querySelector('#flt-pdc-price');
    var atcBtn    = root.querySelector('#flt-pdc-atc');
    var variantIn = root.querySelector('#flt-pdc-variant-id');

    if (variantIn) variantIn.value = variant ? variant.id : '';

    if (atcBtn) {
      atcBtn.disabled = !variant || !variant.available;
      atcBtn.textContent = (!variant || !variant.available) ? 'Sold Out' : 'Add to Cart';
    }

    if (priceWrap && variant) {
      var price   = (variant.price / 100).toFixed(2);
      var html    = '<span class="flt-pdc__price">$' + price + '</span>';
      if (variant.compare_at_price && variant.compare_at_price > variant.price) {
        var compare = (variant.compare_at_price / 100).toFixed(2);
        html += '<s class="flt-pdc__compare">$' + compare + '</s>';
      }
      priceWrap.innerHTML = html;
    }
  }

  function initVariants(root) {
    var jsonEl = root.querySelector('#flt-pdc-variants-json');
    if (!jsonEl) return;

    var variants;
    try { variants = JSON.parse(jsonEl.textContent); }
    catch (e) { return; }

    root.querySelectorAll('.flt-pdc__opt-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.optionIndex, 10);
        var group = root.querySelector('.flt-pdc__option-btns[data-option-index="' + idx + '"]');
        if (group) {
          group.querySelectorAll('.flt-pdc__opt-btn').forEach(function (b) {
            b.setAttribute('aria-pressed', 'false');
          });
        }
        btn.setAttribute('aria-pressed', 'true');

        // Update label
        var label = root.querySelector('.flt-pdc__option-value[data-option-index="' + idx + '"]');
        if (label) label.textContent = btn.dataset.value;

        // Sync variant
        var selected = getSelectedOptions(root);
        var variant  = findVariant(variants, selected);
        updatePriceAndATC(root, variant);
      });
    });
  }

  function initQty(root) {
    var qtyInput = root.querySelector('#flt-pdc-qty');
    if (!qtyInput) return;
    root.querySelectorAll('.flt-pdc__qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var delta   = parseInt(btn.dataset.delta, 10);
        var current = parseInt(qtyInput.value, 10) || 1;
        qtyInput.value = Math.max(1, Math.min(99, current + delta));
      });
    });
  }

  function setMsg(root, text, cls) {
    var msg = root.querySelector('#flt-pdc-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.className   = 'flt-pdc__atc-msg' + (cls ? ' flt-pdc__atc-msg--' + cls : '');
    if (cls === 'success') {
      setTimeout(function () {
        if (msg.textContent === text) {
          msg.textContent = '';
          msg.className   = 'flt-pdc__atc-msg';
        }
      }, 3000);
    }
  }

  function refreshCartDrawer(sectionsData) {
    var html = sectionsData && sectionsData[CART_SECTION];
    if (!html) return;
    var parser  = new DOMParser();
    var doc     = parser.parseFromString(html, 'text/html');
    var newNode = doc.querySelector('[data-hydration-key="cart-drawer-inner"]');
    var oldNode = document.querySelector('[data-hydration-key="cart-drawer-inner"]');
    if (newNode && oldNode) oldNode.innerHTML = newNode.innerHTML;
  }

  function openCartDrawer() {
    var drawer = document.querySelector('cart-drawer-component');
    if (drawer && typeof drawer.open === 'function') drawer.open();
  }

  function initATC(root, handle) {
    var atcBtn   = root.querySelector('#flt-pdc-atc');
    var variantIn= root.querySelector('#flt-pdc-variant-id');
    var qtyInput = root.querySelector('#flt-pdc-qty');
    if (!atcBtn || !variantIn) return;

    atcBtn.addEventListener('click', function () {
      var variantId = parseInt(variantIn.value, 10);
      var quantity  = parseInt(qtyInput ? qtyInput.value : '1', 10) || 1;
      if (!variantId) return;

      atcBtn.setAttribute('data-loading', 'true');
      atcBtn.disabled = true;
      setMsg(root, '', '');

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:       variantId,
          quantity: quantity,
          sections: CART_SECTION
        })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        atcBtn.removeAttribute('data-loading');
        atcBtn.disabled = false;

        if (data.status === 422 || data.description) {
          throw new Error(data.description || 'Could not add to cart');
        }

        setMsg(root, 'Added to cart!', 'success');
        refreshCartDrawer(data.sections);
        setTimeout(openCartDrawer, 280);
      })
      .catch(function (err) {
        atcBtn.removeAttribute('data-loading');
        atcBtn.disabled = false;
        setMsg(root, err.message || 'Something went wrong. Please try again.', 'error');
      });
    });
  }

  /* ── Open / Close ─────────────────────────────────────────────── */

  function openPopup(handle, trigger) {
    var dialog = getDialog();
    if (!dialog) return;

    triggerEl    = trigger;
    activeHandle = handle;
    originalPath = window.location.pathname + window.location.search;

    showLoading();
    dialog.showModal();
    history.pushState({ fltPopup: handle }, '', '/products/' + handle);

    if (cache.has(handle)) {
      injectContent(handle, cache.get(handle));
      return;
    }

    fetchSection(handle)
      .then(function (html) {
        cache.set(handle, html);
        if (activeHandle === handle) injectContent(handle, html);
      })
      .catch(function (err) {
        console.error('[flt-popup] fetch error:', err);
        if (activeHandle === handle) showError(handle);
      });
  }

  function closePopup() {
    var dialog = getDialog();
    if (!dialog || !dialog.open) return;

    activeHandle = null;
    dialog.close();

    if (history.state && history.state.fltPopup) {
      history.pushState({}, '', originalPath);
    }

    if (triggerEl) {
      triggerEl.focus();
      triggerEl = null;
    }
  }

  /* ── Init ─────────────────────────────────────────────────────── */

  function init() {
    var dialog = getDialog();
    if (!dialog) return;

    // Delegated card click — intercept clicks anywhere on a [data-product-handle] card
    document.addEventListener('click', function (e) {
      // Ignore clicks inside the popup itself
      if (dialog.contains(e.target)) return;

      var card = e.target.closest('[' + CARD_ATTR + ']');
      if (!card) return;

      e.preventDefault();
      openPopup(card.getAttribute(CARD_ATTR), card);
    });

    // Close button
    var closeBtn = dialog.querySelector('.flt-popup__close');
    if (closeBtn) closeBtn.addEventListener('click', closePopup);

    // Backdrop click (target is the <dialog> itself, not its children)
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closePopup();
    });

    // Native close (Escape key or dialog.close())
    dialog.addEventListener('close', function () {
      activeHandle = null;
      if (history.state && history.state.fltPopup) {
        history.pushState({}, '', originalPath);
      }
      if (triggerEl) { triggerEl.focus(); triggerEl = null; }
    });

    // Browser back button
    window.addEventListener('popstate', function () {
      if (dialog.open) dialog.close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
