export function injectThemeStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('vx-theme-styles')) return;

  const style = document.createElement('style');
  style.id = 'vx-theme-styles';
  style.textContent = `
/* ═══════════════════════════════════════════════════════════════════
   Auto-injected by @velumx/mpc/ui — do not modify directly
   ═══════════════════════════════════════════════════════════════════ */

/* ── Reset ───────────────────────────────────────────────────────── */

.vx-reset,
.vx-reset *,
.vx-reset *::before,
.vx-reset *::after {
  box-sizing: border-box;
}

.vx-reset {
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-base);
  line-height: var(--vx-line-height);
  color: var(--vx-color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Utilities ──────────────────────────────────────────────────── */

.vx-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.vx-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--vx-color-border);
  border-top-color: var(--vx-color-primary);
  border-radius: 50%;
  animation: vx-spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}

@keyframes vx-spin {
  to { transform: rotate(360deg); }
}

.vx-focus-ring:focus-visible {
  outline: 2px solid var(--vx-color-border-focus);
  outline-offset: 2px;
  border-radius: var(--vx-radius-sm);
}

.vx-tap-target {
  min-height: var(--vx-tap-target-min);
  min-width: var(--vx-tap-target-min);
}

/* ── WalletButton ────────────────────────────────────────────────── */

.vx-wallet-button {
  display: inline-flex;
  align-items: center;
  gap: var(--vx-space-2);
  padding: var(--vx-space-2) var(--vx-space-4);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-md);
  background: var(--vx-color-surface);
  color: var(--vx-color-text);
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-medium);
  cursor: pointer;
  transition: background var(--vx-transition-fast), border-color var(--vx-transition-fast);
  white-space: nowrap;
}

.vx-wallet-button:hover {
  background: var(--vx-color-surface-hover);
}

.vx-wallet-button--connect {
  background: var(--vx-color-primary);
  color: var(--vx-color-primary-text);
  border-color: var(--vx-color-primary);
}

.vx-wallet-button--connect:hover {
  background: var(--vx-color-primary-hover);
  border-color: var(--vx-color-primary-hover);
}

.vx-wallet-button__icon {
  flex-shrink: 0;
}

.vx-wallet-button__dot {
  flex-shrink: 0;
  color: var(--vx-color-success);
}

.vx-wallet-button__address {
  font-family: var(--vx-font-mono);
  font-size: var(--vx-font-size-xs);
}

/* ── NetworkBadge ────────────────────────────────────────────────── */

.vx-network-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--vx-space-1);
  padding: var(--vx-space-1) var(--vx-space-2);
  border-radius: var(--vx-radius-full);
  font-size: var(--vx-font-size-xs);
  font-weight: var(--vx-font-weight-semibold);
}

.vx-network-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.vx-network--mainnet {
  background: var(--vx-color-success-bg);
  color: var(--vx-color-success-text);
}

.vx-network--testnet {
  background: var(--vx-color-warning-bg);
  color: var(--vx-color-warning-text);
}

.vx-network--devnet {
  background: var(--vx-color-error-bg);
  color: var(--vx-color-error-text);
}

/* ── SendForm ────────────────────────────────────────────────────── */

.vx-send-form {
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-4);
}

.vx-send-form--success {
  text-align: center;
  align-items: center;
  padding: var(--vx-space-6) 0;
}

.vx-send-form__success-text {
  font-size: var(--vx-font-size-lg);
  font-weight: var(--vx-font-weight-semibold);
  margin: var(--vx-space-2) 0 0;
}

.vx-send-form__txid {
  font-family: var(--vx-font-mono);
  font-size: var(--vx-font-size-xs);
  color: var(--vx-color-text-secondary);
  word-break: break-all;
}

.vx-send-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-1);
}

.vx-send-form__label {
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-medium);
  color: var(--vx-color-text-secondary);
}

.vx-send-form__label-optional {
  font-weight: var(--vx-font-weight-normal);
  color: var(--vx-color-text-tertiary);
}

.vx-send-form__input {
  width: 100%;
  padding: var(--vx-space-2) var(--vx-space-3);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-color-bg-secondary);
  color: var(--vx-color-text);
  font-family: var(--vx-font-mono);
  font-size: var(--vx-font-size-sm);
  transition: border-color var(--vx-transition-fast);
}

.vx-send-form__input:focus {
  border-color: var(--vx-color-border-focus);
  outline: none;
}

.vx-send-form__fee-options {
  display: flex;
  gap: var(--vx-space-2);
}

.vx-send-form__fee-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--vx-space-1);
  padding: var(--vx-space-2);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-sm);
  cursor: pointer;
  transition: border-color var(--vx-transition-fast), background var(--vx-transition-fast);
}

.vx-send-form__fee-option:hover {
  background: var(--vx-color-surface-hover);
}

.vx-send-form__fee-option--selected {
  border-color: var(--vx-color-primary);
  background: var(--vx-color-primary);
  color: var(--vx-color-primary-text);
}

.vx-send-form__fee-label {
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-semibold);
}

.vx-send-form__fee-desc {
  font-size: var(--vx-font-size-xs);
  opacity: 0.7;
}

.vx-send-form__error {
  padding: var(--vx-space-2) var(--vx-space-3);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-color-error-bg);
  color: var(--vx-color-error-text);
  font-size: var(--vx-font-size-sm);
}

.vx-send-form__submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--vx-space-2) var(--vx-space-6);
  border: none;
  border-radius: var(--vx-radius-md);
  background: var(--vx-color-primary);
  color: var(--vx-color-primary-text);
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-base);
  font-weight: var(--vx-font-weight-semibold);
  cursor: pointer;
  transition: background var(--vx-transition-fast);
}

.vx-send-form__submit:hover:not(:disabled) {
  background: var(--vx-color-primary-hover);
}

.vx-send-form__submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── TransactionList ─────────────────────────────────────────────── */

.vx-tx-list {
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-2);
}

.vx-tx-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--vx-space-3);
  padding: var(--vx-space-8) var(--vx-space-4);
  color: var(--vx-color-text-tertiary);
  font-size: var(--vx-font-size-sm);
}

.vx-tx-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-2);
}

.vx-tx-list__item {
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-1);
  padding: var(--vx-space-3);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-md);
  background: var(--vx-color-surface);
  transition: background var(--vx-transition-fast);
  cursor: default;
}

.vx-tx-list__item:hover {
  background: var(--vx-color-surface-hover);
}

.vx-tx-list__item-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vx-tx-list__item-type {
  display: flex;
  align-items: center;
  gap: var(--vx-space-1);
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-medium);
  color: var(--vx-color-text);
}

.vx-tx-list__item-amount {
  font-family: var(--vx-font-mono);
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-semibold);
}

.vx-tx-list__item-meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--vx-font-size-xs);
  color: var(--vx-color-text-secondary);
}

.vx-tx-list__item-address {
  font-family: var(--vx-font-mono);
}

.vx-tx-list__item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--vx-font-size-xs);
}

.vx-tx-list__item-block {
  color: var(--vx-color-text-tertiary);
}

.vx-tx-status {
  display: inline-flex;
  align-items: center;
  gap: var(--vx-space-1);
  font-weight: var(--vx-font-weight-medium);
}

.vx-tx-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.vx-tx-status--confirmed,
.vx-tx-status--confirmed .vx-tx-status__dot {
  color: var(--vx-color-success-text);
  background: var(--vx-color-success);
}

.vx-tx-status--pending,
.vx-tx-status--pending .vx-tx-status__dot {
  color: var(--vx-color-warning-text);
  background: var(--vx-color-warning);
}

.vx-tx-status--failed,
.vx-tx-status--failed .vx-tx-status__dot {
  color: var(--vx-color-error-text);
  background: var(--vx-color-error);
}

.vx-tx-list__load-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--vx-space-2) var(--vx-space-4);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-md);
  background: var(--vx-color-surface);
  color: var(--vx-color-text-secondary);
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-medium);
  cursor: pointer;
  transition: background var(--vx-transition-fast);
}

.vx-tx-list__load-more:hover:not(:disabled) {
  background: var(--vx-color-surface-hover);
}

.vx-tx-list__load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── WalletModal ─────────────────────────────────────────────────── */

.vx-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vx-color-overlay);
  animation: vx-fadeIn var(--vx-transition-base) ease;
}

@keyframes vx-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.vx-modal {
  position: relative;
  width: 100%;
  max-width: var(--vx-modal-max-width);
  max-height: 90vh;
  background: var(--vx-color-bg);
  border-radius: var(--vx-radius-xl);
  box-shadow: var(--vx-shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: vx-slideUp var(--vx-transition-base) ease;
}

@keyframes vx-slideUp {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.vx-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--vx-space-4) var(--vx-space-5);
  border-bottom: 1px solid var(--vx-color-border);
}

.vx-modal__title {
  margin: 0;
  font-size: var(--vx-font-size-lg);
  font-weight: var(--vx-font-weight-semibold);
}

.vx-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--vx-radius-sm);
  background: transparent;
  color: var(--vx-color-text-secondary);
  cursor: pointer;
  transition: background var(--vx-transition-fast);
  flex-shrink: 0;
}

.vx-modal__close:hover {
  background: var(--vx-color-surface-hover);
}

.vx-modal__wallet-info {
  padding: var(--vx-space-3) var(--vx-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-2);
  border-bottom: 1px solid var(--vx-color-border);
}

.vx-modal__address-row {
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-1);
}

.vx-modal__address-label {
  font-size: var(--vx-font-size-xs);
  color: var(--vx-color-text-tertiary);
}

.vx-modal__address {
  font-family: var(--vx-font-mono);
  font-size: var(--vx-font-size-sm);
  color: var(--vx-color-text);
}

.vx-modal__network-row {
  display: flex;
}

.vx-modal__balance {
  padding: var(--vx-space-4) var(--vx-space-5);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vx-modal__balance-label {
  font-size: var(--vx-font-size-sm);
  color: var(--vx-color-text-secondary);
}

.vx-modal__balance-amount {
  font-size: var(--vx-font-size-xl);
  font-weight: var(--vx-font-weight-bold);
  font-family: var(--vx-font-mono);
}

.vx-modal__balance-amount small {
  font-size: var(--vx-font-size-sm);
  color: var(--vx-color-text-secondary);
}

.vx-modal__tabs {
  display: flex;
  border-bottom: 1px solid var(--vx-color-border);
  padding: 0 var(--vx-space-5);
}

.vx-modal__tab {
  flex: 1;
  padding: var(--vx-space-2) var(--vx-space-4);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--vx-color-text-secondary);
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-medium);
  cursor: pointer;
  transition: color var(--vx-transition-fast), border-color var(--vx-transition-fast);
}

.vx-modal__tab--active {
  color: var(--vx-color-primary);
  border-bottom-color: var(--vx-color-primary);
}

.vx-modal__body {
  padding: var(--vx-space-4) var(--vx-space-5);
  overflow-y: auto;
  flex: 1;
}

.vx-modal__body--center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--vx-space-4);
}

.vx-modal__not-connected-text {
  font-size: var(--vx-font-size-base);
  color: var(--vx-color-text-secondary);
  text-align: center;
}

.vx-modal__connect-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--vx-space-2);
  padding: var(--vx-space-2) var(--vx-space-6);
  border: none;
  border-radius: var(--vx-radius-md);
  background: var(--vx-color-primary);
  color: var(--vx-color-primary-text);
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-base);
  font-weight: var(--vx-font-weight-semibold);
  cursor: pointer;
  transition: background var(--vx-transition-fast);
}

.vx-modal__connect-btn:hover {
  background: var(--vx-color-primary-hover);
}

.vx-modal__assets {
  display: flex;
  flex-direction: column;
  gap: var(--vx-space-2);
}

.vx-modal__asset-item {
  display: flex;
  align-items: center;
  gap: var(--vx-space-3);
  padding: var(--vx-space-3);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-md);
}

.vx-modal__asset-symbol {
  font-weight: var(--vx-font-weight-bold);
  font-family: var(--vx-font-mono);
  min-width: 40px;
}

.vx-modal__asset-name {
  flex: 1;
  font-size: var(--vx-font-size-sm);
  color: var(--vx-color-text-secondary);
}

.vx-modal__asset-balance {
  font-family: var(--vx-font-mono);
  font-weight: var(--vx-font-weight-semibold);
}

/* ── QR Code ─────────────────────────────────────────────────────── */

.vx-qr-code {
  display: inline-flex;
  padding: var(--vx-space-2);
  background: #fff;
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-md);
}

.vx-qr-code__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── CopyButton ──────────────────────────────────────────────────── */

.vx-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--vx-space-1);
  padding: var(--vx-space-1) var(--vx-space-3);
  border: 1px solid var(--vx-color-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-color-surface);
  color: var(--vx-color-text-secondary);
  font-family: var(--vx-font-family);
  font-size: var(--vx-font-size-sm);
  font-weight: var(--vx-font-weight-medium);
  cursor: pointer;
  transition: border-color var(--vx-transition-fast), color var(--vx-transition-fast);
}

.vx-copy-btn:hover {
  border-color: var(--vx-color-text-tertiary);
  color: var(--vx-color-text);
}

.vx-copy-btn--copied {
  border-color: var(--vx-color-success);
  color: var(--vx-color-success);
}

/* ── Mobile Responsive ───────────────────────────────────────────── */

@media (max-width: 520px) {
  .vx-modal {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
    position: fixed;
    inset: 0;
  }

  .vx-modal-overlay {
    align-items: flex-end;
  }

  .vx-modal__header {
    padding: var(--vx-space-3) var(--vx-space-4);
  }

  .vx-modal__body {
    padding: var(--vx-space-3) var(--vx-space-4);
  }

  .vx-modal__tabs {
    padding: 0 var(--vx-space-4);
  }

  .vx-send-form__fee-options {
    flex-direction: column;
  }
}

/* ── Reduced Motion ──────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .vx-modal-overlay,
  .vx-modal {
    animation: none;
  }

  .vx-spinner {
    animation: none;
    border-top-color: var(--vx-color-primary);
  }

  .vx-wallet-button,
  .vx-send-form__submit,
  .vx-modal__close,
  .vx-modal__tab,
  .vx-copy-btn,
  .vx-tx-list__load-more {
    transition: none;
  }
}
`;

  document.head.appendChild(style);
}
