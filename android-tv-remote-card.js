const CARD_TAG = 'androidtv-remote-card';

function forwardHaptic(element, type) {
  element.dispatchEvent(new CustomEvent('haptic', {
    bubbles: true,
    composed: true,
    detail: type,
  }));
}

const STYLES = `
  * {
    box-sizing: border-box;
    user-select: none;
  }
  :host {
    --remote-bg: #0E0E0F;
    --remote-ui-bg: #212121;
    --remote-ui-bg-highlight: #313131;
    --remote-text: #E8EAED;
    -webkit-tap-highlight-color: transparent;
    --remote-button-size: 5rem;
    display: block;
    height: calc(var(--safe-height, 100%) - var(--ha-space-12, 0px) - 2rem);
    min-height: 400px;
  }
  ha-card {
    display: block;
    background: var(--remote-bg);
    overflow: hidden;
    height: 100%;
  }
  .container {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 1rem;
    height: 100%;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
  }
  h1 {
    margin: 0;
    color: var(--remote-text);
    font-size: 18px;
  }
  .trackpad {
    touch-action: none;
    background: var(--remote-ui-bg);
    min-height: 150px;
    flex-shrink: 1;
    border-radius: 1rem;
    position: relative;
    flex-grow: 1;
  }
  .trackpad.clicked {
    background: var(--remote-ui-bg-highlight);
  }
  .trackpad__ball {
    position: absolute;
    font-size: 3.375rem;
    width: 1em;
    height: 1em;
    border-radius: 2em;
    background: var(--remote-text);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    will-change: margin, opacity;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .trackpad__ball.moving {
    opacity: 0.6;
  }
  .trackpad__ball.finished {
    transition: all 0.3s ease;
  }
  .controls {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }
  .header {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .header__buttons {
    display: flex;
    gap: 1rem;
    margin: 0 0 0 auto;
    --remote-button-size: 3rem;
  }
  .ui-button {
    --bg: var(--remote-ui-bg);
    --face: var(--remote-text);
    font-size: 1rem;
    width: var(--remote-button-size);
    height: var(--remote-button-size);
    background: var(--bg);
    border: none;
    border-radius: var(--remote-button-size);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
  }
  .ui-button ha-icon {
    --mdc-icon-size: 2rem;
    width: 2rem;
    height: 2rem;
    margin: auto;
    color: var(--face);
  }
  .ui-button:active {
    --bg: var(--remote-text);
    --face: var(--remote-bg);
  }
  .ui-button.power-on {
    --bg: var(--remote-text);
    --face: var(--remote-bg);
  }
  .ui-button.muted ha-icon {
    opacity: 0.5;
  }
  .volume-wrapper {
    position: relative;
  }
  .volume-panel {
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    background: var(--remote-ui-bg);
    border-radius: 1rem;
    padding: 1rem 0.75rem;
    position: absolute;
    right: 0;
    bottom: calc(100% + 1rem);
    width: var(--remote-button-size);
  }
  .volume-panel.open {
    display: flex;
  }
  .volume-panel .ui-button {
    --remote-button-size: 3rem;
    flex-shrink: 0;
  }
  .volume-slider {
    -webkit-appearance: none;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 12px;
    flex: 1;
    min-height: 40px;
    border-radius: 6px;
    outline: none;
    cursor: pointer;
    touch-action: auto;
    background: linear-gradient(
      to top,
      var(--remote-text) var(--pct, 50%),
      var(--remote-ui-bg-highlight) var(--pct, 50%)
    );
  }
  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--remote-text);
    cursor: pointer;
  }
  .volume-slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--remote-text);
    cursor: pointer;
    border: none;
  }
  .volume-value {
    color: var(--remote-text);
    font-size: 0.75rem;
    text-align: center;
    font-family: monospace;
    opacity: 0.7;
  }
`;

class Remote {
  constructor(container, trackpad, trackpadBall) {
    this.container = container;
    this.trackpad = trackpad;
    this.trackpadBall = trackpadBall;

    this.isMoving = false;
    this.pollSteps = 3;
    this.moveDistance = 0;
    this.moveMultiplier = 1;
    this.deadZone = 0.1;
    this.fireRate = 750;
    this.currentFireRate = 750;
    this.fireEventStarted = false;
    this.fireEventTimeout = null;
    this.moveDirection = null;

    this.events = {
      click: 'click',
      down: 'mousedown',
      move: 'mousemove',
      up: 'mouseup',
    };

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.events.down = 'touchstart';
      this.events.move = 'touchmove';
      this.events.up = 'touchend';
    }

    this.bindEvents();
  }

  bindEvents() {
    this.trackpad.addEventListener(this.events.click, (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.isMoving) return;
      this.trackpad.classList.add('clicked');
      this.vibrate('light');
      this.container.dispatchEvent(new CustomEvent('center'));
      setTimeout(() => this.trackpad.classList.remove('clicked'), 30);
    });

    this.trackpad.addEventListener(this.events.down, (event) => {
      this.trackpadBall.classList.remove('finished');

      const startX = event.pageX ?? event.touches[0].pageX;
      const startY = event.pageY ?? event.touches[0].pageY;
      const { width: ballSize } = this.trackpadBall.getBoundingClientRect();
      const rect = this.trackpad.getBoundingClientRect();
      const maxX = rect.width / 2 - ballSize / 2 - 20;
      const maxY = rect.height / 2 - ballSize / 2 - 20;
      let startFireRate = null;

      const onMove = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const rawDeltaX = (event.pageX ?? event.touches[0].pageX) - startX;
        const rawDeltaY = (event.pageY ?? event.touches[0].pageY) - startY;
        const deltaX = Math.max(-maxX, Math.min(maxX, rawDeltaX * this.moveMultiplier));
        const deltaY = Math.max(-maxY, Math.min(maxY, rawDeltaY * this.moveMultiplier));

        const absXPercent = Math.abs(deltaX) / maxX;
        const absYPercent = Math.abs(deltaY) / maxY;

        if (absXPercent > this.deadZone || absYPercent > this.deadZone) {
          this.isMoving = true;
        }

        if (this.isMoving) {
          const newDirection = absYPercent > absXPercent
            ? (deltaY > 0 ? 'down' : 'up')
            : (deltaX > 0 ? 'right' : 'left');

          this.moveDistance = absYPercent > absXPercent ? absYPercent : absXPercent;

          if (newDirection !== this.moveDirection || this.currentFireRate !== startFireRate) {
            this.moveDirection = newDirection;
            clearTimeout(this.fireEventTimeout);
            this.fireEventStarted = false;
          }
          startFireRate = this.currentFireRate;

          if (!this.fireEventStarted && (absYPercent > this.deadZone || absXPercent > this.deadZone)) {
            this.trackpadBall.classList.add('moving');
            this.fireEvent();
          }

          this.trackpadBall.style.marginTop = `${deltaY}px`;
          this.trackpadBall.style.marginLeft = `${deltaX}px`;
        }
      };

      const onUp = () => {
        this.trackpadBall.style.marginTop = '0px';
        this.trackpadBall.style.marginLeft = '0px';
        this.trackpadBall.classList.remove('moving');
        this.trackpadBall.classList.add('finished');
        clearTimeout(this.fireEventTimeout);
        this.fireEventStarted = false;

        setTimeout(() => {
          this.trackpadBall.classList.remove('finished');
          this.isMoving = false;
        }, 300);

        document.removeEventListener(this.events.move, onMove);
        document.removeEventListener(this.events.up, onUp);
      };

      document.addEventListener(this.events.move, onMove);
      document.addEventListener(this.events.up, onUp);
    });
  }

  fireEvent() {
    this.fireEventStarted = true;
    this.vibrate();

    const stepSize = 1 / this.pollSteps;
    for (let i = 0; i < this.pollSteps; i++) {
      if (this.moveDistance <= (i + 1) * stepSize) {
        this.currentFireRate = this.fireRate / this.pollSteps * (this.pollSteps - i);
        break;
      }
    }

    if (this.moveDistance > 0.95) {
      this.currentFireRate = 60;
    }

    this.container.dispatchEvent(new CustomEvent('move', {
      detail: {
        direction: this.moveDirection,
        distance: Math.round(this.moveDistance * 100),
      },
    }));

    this.fireEventTimeout = setTimeout(() => {
      if (this.isMoving) this.fireEvent();
    }, this.currentFireRate);
  }

  vibrate(type = 'selection') {
    forwardHaptic(this.container, type);
    navigator.vibrate?.(type === 'selection' ? 20 : 50);
  }
}

class AndroidTVRemoteCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    if (!config.entity) throw new Error('androidtv-remote-card: entity is required');
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._updateState();
  }

  _render() {
    const { _config: cfg } = this;
    const hasCustom = cfg.custom_buttons?.length > 0;

    this.style.height = cfg.height ? `${cfg.height}px` : '';

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="container">
          <div class="header">
            ${cfg.hide_title ? '' : `<h1 class="title">${cfg.name ?? ''}</h1>`}
            <div class="header__buttons">
              <div class="ui-button power-button">
                <ha-icon icon="mdi:power"></ha-icon>
              </div>
            </div>
          </div>
          <div class="trackpad">
            <div class="trackpad__ball"></div>
          </div>
          <div class="controls">
            <div class="ui-button back-button">
              <ha-icon icon="mdi:chevron-left"></ha-icon>
            </div>
            <div class="ui-button home-button">
              <ha-icon icon="mdi:home"></ha-icon>
            </div>
            <div class="volume-wrapper">

              <div class="ui-button volume-button">
                <ha-icon icon="mdi:volume-high"></ha-icon>
              </div>
              <div class="volume-panel">
                <span class="volume-value">50%</span>
                <input type="range" class="volume-slider" orient="vertical" min="0" max="${cfg.max_volume ?? 100}" value="50" style="--pct:50%">
                <div class="ui-button volume-mute-btn">
                  <ha-icon icon="mdi:volume-high"></ha-icon>
                </div>
              </div>
            </div>
          </div>
          
          ${hasCustom ? `
          <div class="controls controls--custom">
            ${cfg.custom_buttons.map(btn => {
              const esc = s => String(s ?? '').replace(/"/g, '&quot;');
              const icon = esc(btn.icon);
              let attrs = '';
              if (btn.activity != null)       attrs = `data-activity="${esc(btn.activity)}"`;
              else if (btn.adb_command != null) attrs = `data-command="${esc(btn.adb_command)}" data-adb`;
              else if (btn.command != null)    attrs = `data-command="${esc(btn.command)}"`;
              return `<div class="ui-button custom-btn" ${attrs}><ha-icon icon="${icon}"></ha-icon></div>`;
            }).join('')}
          </div>
          ` : ''}
        </div>
      </ha-card>
    `;

    this._bindButtons();
    this._initRemote();
  }

  _initRemote() {
    const root = this.shadowRoot;
    const container = root.querySelector('.container');
    const remote = new Remote(
      container,
      root.querySelector('.trackpad'),
      root.querySelector('.trackpad__ball'),
    );
    this._remote = remote;

    container.addEventListener('move', ({ detail }) => this._sendDpad(detail.direction));
    container.addEventListener('center', () => this._sendRemoteCommand('DPAD_CENTER'));
  }

  _bindButtons() {
    const root = this.shadowRoot;

    root.querySelector('.power-button').addEventListener('click', () => { this._haptic('medium'); this._togglePower(); });
    root.querySelector('.back-button').addEventListener('click', () => { this._haptic('light'); this._sendRemoteCommand('BACK'); });
    root.querySelector('.home-button').addEventListener('click', () => { this._haptic('light'); this._sendRemoteCommand('HOME'); });
    root.querySelector('.volume-button').addEventListener('click', () => { this._haptic('light'); this._toggleVolumePanel(); });
    root.querySelector('.volume-mute-btn').addEventListener('click', (e) => { e.stopPropagation(); this._haptic('light'); this._toggleMute(); this._resetVolumeClose(); });

    const slider = root.querySelector('.volume-slider');
    const label  = root.querySelector('.volume-value');
    let lastSentPct = -1;
    slider.addEventListener('input', () => {
      const pct = parseInt(slider.value);
      label.textContent = `${pct}%`;
      slider.style.setProperty('--pct', `${(pct / slider.max) * 100}%`);
      this._resetVolumeClose();
      const entityId = this._config.volume_entity ?? this._config.entity;
      const isMuted = this._hass?.states[entityId]?.attributes.is_volume_muted ?? false;
      if (!isMuted) {
        root.querySelector('.volume-mute-btn ha-icon')?.setAttribute('icon', this._levelIcon(pct / 100));
      }
      if (pct !== lastSentPct) {
        lastSentPct = pct;
        this._haptic('selection');
        this._setVolume(pct / 100);
      }
    });

    root.querySelectorAll('.custom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._haptic('light');
        if (btn.dataset.activity) {
          this._launchActivity(btn.dataset.activity);
        } else if ('adb' in btn.dataset) {
          this._sendAdb(btn.dataset.command);
        } else if (btn.dataset.command) {
          this._sendRemoteCommand(btn.dataset.command);
        }
      });
    });
  }

  _updateState() {
    const root = this.shadowRoot;
    if (!root.querySelector('.container')) return;

    const entity = this._hass.states[this._config.entity];
    if (!entity) return;

    const title = root.querySelector('.title');
    if (title && !this._config.name) {
      title.textContent = entity.attributes.friendly_name ?? this._config.entity;
    }

    const isOn = entity.state !== 'off' && entity.state !== 'unavailable';
    root.querySelector('.power-button').classList.toggle('power-on', isOn);

    const volEntityId = this._config.volume_entity ?? this._config.entity;
    const volEntity = this._hass.states[volEntityId];
    if (volEntity) {
      const isMuted = volEntity.attributes.is_volume_muted ?? false;
      const volBtn = root.querySelector('.volume-button');
      volBtn.classList.toggle('muted', isMuted);
      const panelOpen = root.querySelector('.volume-panel').classList.contains('open');
      const volIcon = this._volumeIcon();
      const volBtnIcon = volBtn.querySelector('ha-icon');
      if (!panelOpen && volBtnIcon.getAttribute('icon') !== volIcon) {
        volBtnIcon.setAttribute('icon', volIcon);
      }
      const muteIcon = root.querySelector('.volume-mute-btn ha-icon');
      if (muteIcon.getAttribute('icon') !== volIcon) {
        muteIcon.setAttribute('icon', volIcon);
      }

      const slider = root.querySelector('.volume-slider');
      if (slider && !slider.matches(':active')) {
        const pct = Math.min(
          Math.round((volEntity.attributes.volume_level ?? 0) * 100),
          parseInt(slider.max),
        );
        slider.value = pct;
        slider.style.setProperty('--pct', `${(pct / slider.max) * 100}%`);
        root.querySelector('.volume-value').textContent = `${pct}%`;
      }
    }
  }

  _remoteEntity() {
    return this._config.remote_entity
      ?? this._config.entity.replace(/^media_player\./, 'remote.');
  }

  _sendRemoteCommand(command) {
    this._hass?.callService('remote', 'send_command', {
      entity_id: this._remoteEntity(),
      command,
    });
  }

  _haptic(type = 'light') {
    forwardHaptic(this, type);
    navigator.vibrate?.(type === 'medium' ? 60 : 35);
  }

  _launchActivity(activity) {
    this._hass?.callService('remote', 'turn_on', {
      entity_id: this._remoteEntity(),
      activity,
    });
  }

  _sendAdb(command) {
    this._hass?.callService('androidtv', 'adb_command', {
      entity_id: this._config.entity,
      command,
    });
  }

  _sendDpad(direction) {
    const map = {
      up:    'DPAD_UP',
      down:  'DPAD_DOWN',
      left:  'DPAD_LEFT',
      right: 'DPAD_RIGHT',
    };
    if (map[direction]) this._sendRemoteCommand(map[direction]);
  }

  _togglePower() {
    const entity = this._hass?.states[this._config.entity];
    if (!entity) return;
    const service = entity.state === 'off' ? 'turn_on' : 'turn_off';
    this._hass.callService('media_player', service, { entity_id: this._config.entity });
  }

  _toggleVolumePanel() {
    const panel = this.shadowRoot.querySelector('.volume-panel');
    const volIcon = this.shadowRoot.querySelector('.volume-button ha-icon');
    const isOpen = panel.classList.contains('open');
    if (!isOpen) {
      const trackpadH = this.shadowRoot.querySelector('.trackpad').getBoundingClientRect().height;
      panel.style.height = `${trackpadH}px`;
    }
    panel.classList.toggle('open', !isOpen);
    volIcon.setAttribute('icon', isOpen ? this._volumeIcon() : 'mdi:close');
    if (!isOpen) {
      this._resetVolumeClose();
    } else {
      clearTimeout(this._volumeCloseTimer);
    }
  }

  _volumeIcon() {
    const entityId = this._config.volume_entity ?? this._config.entity;
    const entity = this._hass?.states[entityId];
    if (entity?.attributes.is_volume_muted) return 'mdi:volume-mute';
    return this._levelIcon(entity?.attributes.volume_level ?? 0);
  }

  _levelIcon(level) {
    const max = (this._config?.max_volume ?? 100) / 100;
    const n = max > 0 ? level / max : 0;
    if (n === 0)    return 'mdi:volume-off';
    if (n < 0.34)  return 'mdi:volume-low';
    if (n < 0.67)  return 'mdi:volume-medium';
    return 'mdi:volume-high';
  }

  _resetVolumeClose() {
    clearTimeout(this._volumeCloseTimer);
    this._volumeCloseTimer = setTimeout(() => {
      const root = this.shadowRoot;
      root.querySelector('.volume-panel')?.classList.remove('open');
      root.querySelector('.volume-button ha-icon')?.setAttribute('icon', this._volumeIcon());
    }, 4000);
  }

  _setVolume(level) {
    const entityId = this._config.volume_entity ?? this._config.entity;
    this._hass?.callService('media_player', 'volume_set', {
      entity_id: entityId,
      volume_level: Math.round(level * 100) / 100,
    });
  }

  _toggleMute() {
    const entityId = this._config.volume_entity ?? this._config.entity;
    const entity = this._hass?.states[entityId];
    if (!entity) return;
    this._hass.callService('media_player', 'volume_mute', {
      entity_id: entityId,
      is_volume_muted: !(entity.attributes.is_volume_muted ?? false),
    });
  }

  getCardSize() { return 7; }

  static getConfigElement() {
    return document.createElement('androidtv-remote-card-editor');
  }

  static getStubConfig() {
    return { entity: 'media_player.android_tv' };
  }
}

const EDITOR_SCHEMA = [
  { name: 'entity',         required: true, label: 'TV entity (media_player)',          selector: { entity: { domain: 'media_player' } } },
  { name: 'remote_entity',                  label: 'Remote entity - auto-derived (optional, default: TV entity)',       selector: { entity: { domain: 'remote' } } },
  { name: 'name',                           label: 'Card title (optional)',                         selector: { text: {} } },
  { name: 'volume_entity',                  label: 'Volume entity - soundbar etc. (optional, default: TV entity)',      selector: { entity: { domain: 'media_player' } } },
  { name: 'hide_title',                     label: 'Hide title',                         selector: { boolean: {} } },
  { name: 'max_volume',                     label: 'Max volume %',                       selector: { number: { min: 1, max: 100, step: 1,   mode: 'box' } } },
  { name: 'height',                         label: 'Card height (px)',                   selector: { number: { min: 200, max: 1200, step: 10, mode: 'box' } } },
];

class AndroidTVRemoteCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const form = this.shadowRoot.querySelector('ha-form');
    if (form) form.hass = hass;
  }

  _render() {
    this.shadowRoot.innerHTML = `<style>
      p { margin: 12px 0 0; font-size: 12px; color: var(--secondary-text-color, #888); }
    </style>`;

    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config ?? {};
    form.schema = EDITOR_SCHEMA;
    form.computeLabel = (s) => s.label ?? s.name;
    form.addEventListener('value-changed', (e) => {
      this._config = e.detail.value;
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }));
    });
    this.shadowRoot.appendChild(form);

    const note = document.createElement('p');
    note.textContent = 'custom_buttons requires YAML configuration.';
    this.shadowRoot.appendChild(note);
  }
}

customElements.define('androidtv-remote-card-editor', AndroidTVRemoteCardEditor);
customElements.define(CARD_TAG, AndroidTVRemoteCard);

window.customCards ??= [];
window.customCards.push({
  type: CARD_TAG,
  name: 'Android TV Remote',
  description: 'Trackpad remote control for Android TV via ADB',
});
