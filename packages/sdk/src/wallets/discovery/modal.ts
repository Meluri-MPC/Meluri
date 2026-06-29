import type { ChainType, WalletConnector, WalletConnectionConfig, ConnectResult } from '../types';
import type { WalletListItem } from './wallet-list';
import {
  getWalletList,
  createWalletHtml,
  injectModalStyles,
  getRememberChoice,
  setRememberChoice,
} from './wallet-list';
import { getConnector } from '../connectors';

export interface WalletDiscoveryResult {
  connectorId: string;
  result: ConnectResult;
  rememberChoice: boolean;
}

class FocusTrap {
  private container: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;

  activate(container: HTMLElement): void {
    this.container = container;
    this.previousFocus = document.activeElement as HTMLElement;
    const focusable = this.getFocusableElements();
    if (focusable.length > 0) focusable[0].focus();
  }

  deactivate(): void {
    if (this.previousFocus) {
      this.previousFocus.focus();
    }
    this.container = null;
    this.previousFocus = null;
  }

  handleKeyDown(e: KeyboardEvent): void {
    if (!this.container) return;
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    if (e.key === 'Escape') {
      this.deactivate();
    }
  }

  private getFocusableElements(): HTMLElement[] {
    if (!this.container) return [];
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(this.container.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
  }
}

export function showWalletDiscoveryModal(
  config?: WalletConnectionConfig
): Promise<WalletDiscoveryResult | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const chain = config?.chain || 'stacks';
    const wallets = getWalletList({ chain, showInstallLinks: true, rememberChoice: config?.rememberChoice !== false });

    if (getRememberChoice() && config?.autoConnect !== false) {
      const lastChoice = getLastChoice();
      if (lastChoice) {
        const connector = getConnector(lastChoice);
        if (connector && connector.isAvailable()) {
          connector.connect(chain).then((result) => {
            resolve({ connectorId: lastChoice, result, rememberChoice: true });
          }).catch(() => {
            resolve(null);
          });
          return;
        }
      }
    }

    injectModalStyles();
    const html = createWalletHtml(wallets, { chain });
    const container = document.createElement('div');
    container.id = 'vx-wallet-discovery-container';
    container.innerHTML = html;
    document.body.appendChild(container);

    const overlay = container.querySelector('.vx-wallet-modal-overlay') as HTMLElement;
    const closeBtn = container.querySelector('.vx-wallet-modal-close') as HTMLElement;
    const rememberCheckbox = container.querySelector('.vx-wallet-remember-checkbox') as HTMLInputElement;
    const items = container.querySelectorAll<HTMLElement>('.vx-wallet-item');

    const focusTrap = new FocusTrap();
    focusTrap.activate(overlay);

    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      focusTrap.deactivate();
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }

    function selectWallet(walletItem: HTMLElement): void {
      const walletId = walletItem.getAttribute('data-wallet-id');
      if (!walletId) return;

      const item = wallets.find((w) => w.id === walletId);
      if (!item) return;

      if (item.detected) {
        updateSelectedState(items, walletItem);
        const connector = getConnector(walletId);
        if (!connector) return;

        const remember = rememberCheckbox?.checked || getRememberChoice();
        if (remember) {
          setLastChoice(walletId);
          setRememberChoice(true);
        }

        connector.connect(chain).then((result) => {
          cleanup();
          resolve({ connectorId: walletId, result, rememberChoice: remember });
        }).catch((err) => {
          cleanup();
          resolve(null);
        });
      }
    }

    closeBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
      focusTrap.handleKeyDown(e);

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const focusable = items.length > 0 ? Array.from(items).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        ) : [];
        if (focusable.length === 0) return;
        const currentIdx = focusable.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown') {
          const next = (currentIdx + 1) % focusable.length;
          focusable[next].focus();
        } else {
          const prev = (currentIdx - 1 + focusable.length) % focusable.length;
          focusable[prev].focus();
        }
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const active = document.activeElement as HTMLElement;
        if (active && active.classList.contains('vx-wallet-item')) {
          e.preventDefault();
          selectWallet(active);
        }
      }
    });

    items.forEach((item) => {
      item.addEventListener('click', () => selectWallet(item));
    });
  });
}

function updateSelectedState(items: NodeListOf<HTMLElement>, selected: HTMLElement): void {
  items.forEach((item) => {
    item.setAttribute('aria-selected', item === selected ? 'true' : 'false');
  });
}

const LAST_CHOICE_KEY = 'velumx_wallet_last_choice';

function getLastChoice(): string | null {
  try {
    return localStorage.getItem(LAST_CHOICE_KEY);
  } catch {
    return null;
  }
}

function setLastChoice(connectorId: string): void {
  try {
    localStorage.setItem(LAST_CHOICE_KEY, connectorId);
  } catch {}
}

export { getWalletList, createWalletHtml, injectModalStyles } from './wallet-list';
