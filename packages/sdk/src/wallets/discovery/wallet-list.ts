import type { ChainType, WalletMetadata, WalletDiscoveryConfig } from '../types';
import { getConnectors } from '../connectors';

export interface WalletListItem {
  id: string;
  name: string;
  icon: string;
  installUrl: string;
  chains: ChainType[];
  detected: boolean;
}

const WALLET_LIST: Array<{
  id: string;
  name: string;
  icon: string;
  installUrl: string;
  chains: ChainType[];
}> = [
  {
    id: 'leather',
    name: 'Leather',
    icon: '👜',
    installUrl: 'https://leather.io/install',
    chains: ['stacks', 'bitcoin'],
  },
  {
    id: 'xverse',
    name: 'Xverse',
    icon: '🌐',
    installUrl: 'https://www.xverse.app/download',
    chains: ['stacks', 'bitcoin'],
  },
  {
    id: 'asigna',
    name: 'Asigna',
    icon: '🔐',
    installUrl: 'https://www.asigna.io/',
    chains: ['stacks', 'bitcoin'],
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    installUrl: 'https://metamask.io/download/',
    chains: ['ethereum'],
  },
  {
    id: 'phantom',
    name: 'Phantom',
    icon: '👻',
    installUrl: 'https://phantom.app/download',
    chains: ['solana', 'ethereum'],
  },
  {
    id: 'martian',
    name: 'Martian',
    icon: '🔴',
    installUrl: 'https://martianwallet.xyz/',
    chains: ['sui', 'aptos'],
  },
  {
    id: 'petra',
    name: 'Petra',
    icon: '🏛',
    installUrl: 'https://petra.app/',
    chains: ['aptos'],
  },
];

export function getWalletList(config?: WalletDiscoveryConfig): WalletListItem[] {
  const chainFilter = config?.chain;
  const showInstallLinks = config?.showInstallLinks !== false;

  return WALLET_LIST
    .filter((w) => !chainFilter || w.chains.includes(chainFilter))
    .map((w) => ({
      ...w,
      detected: getConnectors().some((c) => c.id === w.id && c.isAvailable()),
    }));
}

export function getWalletMetadata(walletId: string): WalletMetadata | null {
  const listItem = WALLET_LIST.find((w) => w.id === walletId);
  if (!listItem) return null;

  const connector = getConnectors().find((c) => c.id === walletId);

  const detected = connector ? connector.isAvailable() : false;
  const supportedNetworks = connector
    ? connector.supportedNetworks
    : (listItem.chains.reduce((acc, chain) => {
        acc[chain] = [];
        return acc;
      }, {} as Partial<Record<string, string[]>>));

  return {
    id: listItem.id,
    name: listItem.name,
    icon: listItem.icon,
    installUrl: listItem.installUrl,
    chains: listItem.chains,
    supportedNetworks,
    connector: connector || undefined,
    detected,
  };
}

export function createWalletHtml(wallets: WalletListItem[], config?: WalletDiscoveryConfig): string {
  const rememberChoice = config?.rememberChoice !== false;

  const walletItems = wallets
    .map(
      (w) => `
    <li class="vx-wallet-item" role="option" aria-selected="false" data-wallet-id="${w.id}" tabindex="0">
      <span class="vx-wallet-icon" aria-hidden="true">${w.icon}</span>
      <div class="vx-wallet-info">
        <span class="vx-wallet-name">${w.name}</span>
        <span class="vx-wallet-chains">${w.chains.join(', ')}</span>
      </div>
      ${
        w.detected
          ? '<span class="vx-wallet-detected">Detected</span>'
          : `<a class="vx-wallet-install" href="${w.installUrl}" target="_blank" rel="noopener noreferrer" aria-label="Install ${w.name}">Install</a>`
      }
    </li>`
    )
    .join('');

  return `
<div class="vx-wallet-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="vx-wallet-modal-title" aria-describedby="vx-wallet-modal-desc">
  <div class="vx-wallet-modal" role="document">
    <div class="vx-wallet-modal-header">
      <h2 id="vx-wallet-modal-title">Connect Wallet</h2>
      <p id="vx-wallet-modal-desc">Choose a wallet to connect to your application.</p>
      <button class="vx-wallet-modal-close" aria-label="Close wallet selection" tabindex="0">&times;</button>
    </div>
    <ul class="vx-wallet-list" role="listbox" aria-label="Available wallets">
      ${walletItems}
    </ul>
    ${
      rememberChoice
        ? `
    <div class="vx-wallet-modal-footer">
      <label class="vx-wallet-remember">
        <input type="checkbox" class="vx-wallet-remember-checkbox" />
        <span>Remember my choice</span>
      </label>
    </div>`
        : ''
    }
  </div>
</div>`;
}

const MODAL_STYLES = `
.vx-wallet-modal-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}
.vx-wallet-modal {
  background: #1a1a2e; color: #e0e0e0; border-radius: 16px;
  max-width: 400px; width: 90%; max-height: 80vh;
  overflow-y: auto; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.vx-wallet-modal-header {
  padding: 24px 24px 8px;
  position: relative;
}
.vx-wallet-modal-header h2 { margin: 0 0 4px; font-size: 20px; color: #fff; }
.vx-wallet-modal-header p { margin: 0; font-size: 14px; color: #888; }
.vx-wallet-modal-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none; color: #888; font-size: 24px;
  cursor: pointer; padding: 4px 8px;
}
.vx-wallet-modal-close:hover { color: #fff; }
.vx-wallet-list {
  list-style: none; margin: 0; padding: 8px 16px;
}
.vx-wallet-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: 12px; cursor: pointer;
  transition: background 0.15s;
  outline: none;
}
.vx-wallet-item:hover, .vx-wallet-item:focus-visible {
  background: rgba(255,255,255,0.08);
}
.vx-wallet-item[aria-selected="true"] {
  background: rgba(88,101,242,0.2); border: 1px solid #5865f2;
}
.vx-wallet-icon { font-size: 28px; width: 36px; text-align: center; }
.vx-wallet-info { flex: 1; }
.vx-wallet-name { display: block; font-size: 15px; font-weight: 600; color: #fff; }
.vx-wallet-chains { display: block; font-size: 12px; color: #888; margin-top: 2px; }
.vx-wallet-detected {
  font-size: 12px; color: #43b581; background: rgba(67,181,129,0.15);
  padding: 4px 10px; border-radius: 20px;
}
.vx-wallet-install {
  font-size: 12px; color: #5865f2; text-decoration: none;
  padding: 4px 10px; border-radius: 20px; border: 1px solid #5865f2;
}
.vx-wallet-install:hover { background: rgba(88,101,242,0.1); }
.vx-wallet-modal-footer {
  padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.08);
}
.vx-wallet-remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888; cursor: pointer; }
.vx-wallet-remember-checkbox { accent-color: #5865f2; }
`;

export function injectModalStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('vx-wallet-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'vx-wallet-modal-styles';
  style.textContent = MODAL_STYLES;
  document.head.appendChild(style);
}

export function getRememberChoice(): boolean {
  try {
    return localStorage.getItem('velumx_wallet_remember') === 'true';
  } catch {
    return false;
  }
}

export function setRememberChoice(value: boolean): void {
  try {
    localStorage.setItem('velumx_wallet_remember', value ? 'true' : 'false');
  } catch {}
}
