/* Progressive enhancement. The page's links work without JavaScript. */
(() => {
  const tabs = [...document.querySelectorAll('[data-preview-tab]')];
  function selectTab(tab, focus = false) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus({ preventScroll: true });
  }
  for (const [index, tab] of tabs.entries()) {
    tab.disabled = false;
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next], true);
    });
  }
  for (const link of document.querySelectorAll('[data-go-tab]')) {
    link.addEventListener('click', () => {
      const target = tabs.find((tab) => tab.dataset.previewTab === link.dataset.goTab);
      if (target) selectTab(target, true);
    });
  }
  const baseline = document.getElementById('baseline-risk');
  if (baseline) {
    baseline.addEventListener('input', () => {
      const risk = Number(baseline.value);
      const treated = risk * 0.83;
      const reduction = risk - treated;
      document.getElementById('baseline-output').value = `${risk.toFixed(1)}%`;
      document.querySelector('[data-control-risk]').textContent = risk.toFixed(1);
      document.querySelector('[data-treatment-risk]').textContent = treated.toFixed(1);
      document.querySelector('[data-control-bar]').style.width = `${risk}%`;
      document.querySelector('[data-treatment-bar]').style.width = `${treated}%`;
      document.querySelector('[data-arr]').textContent = reduction.toFixed(1);
      document.querySelector('[data-nnt]').textContent = String(Math.ceil(100 / reduction));
    });
    baseline.disabled = false;
  }
  const dialog = document.querySelector('.demo-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    const video = dialog.querySelector('video');
    for (const trigger of document.querySelectorAll('[data-open-demo]')) {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        dialog.showModal();
        video.play().catch(() => {
          // Native controls remain available if the browser blocks playback.
        });
      });
    }
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      const bounds = dialog.getBoundingClientRect();
      if (
        event.target === dialog &&
        (event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom)
      )
        dialog.close();
    });
    dialog.addEventListener('close', () => video.pause());
  }
})();
