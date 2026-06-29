/**
 * Wallet UI Components Tests
 *
 * Run: npx tsx test/ui/components.spec.tsx
 *
 * Coverage:
 *   - WalletButton: connect/disconnect states
 *   - NetworkBadge: all network variants
 *   - SendForm: input validation, submit flow
 *   - TransactionList: empty state, transaction rendering
 *   - WalletModal: open/close, tab switching
 *   - QRCode / CopyAddressButton
 */

import './setup';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { WalletProvider, useWalletContext } from '../../src/ui/context';
import { WalletButton } from '../../src/ui/WalletButton';
import { NetworkBadge } from '../../src/ui/NetworkBadge';
import { SendForm } from '../../src/ui/SendForm';
import { TransactionList } from '../../src/ui/TransactionList';
import { WalletModal } from '../../src/ui/WalletModal';
import { QRCode, CopyAddressButton, buildDeepLink } from '../../src/ui/qr/index';
import { injectThemeStyles } from '../../src/ui/theme/index';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  (async () => {
    try {
      cleanup();
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (e: any) {
      cleanup();
      failed++;
      console.log(`  \u2717 ${name}`);
      console.log(`    Error: ${e.message}`);
    }
  })();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function renderClean(ui: React.ReactElement) {
  cleanup();
  return render(ui);
}

// ═══════════════════════════════════════════════════════════════════
// WalletButton
// ═══════════════════════════════════════════════════════════════════

test('WalletButton renders connect CTA when not connected', () => {
  const { container } = renderClean(
    React.createElement(WalletProvider, null, React.createElement(WalletButton, null))
  );
  const btn = container.querySelector('button');
  assert(btn !== null, 'connect button exists');
  assert(btn!.textContent?.includes('Connect Wallet') === true, 'shows connect wallet text');
  assert(btn!.getAttribute('aria-label') === 'Connect Wallet', 'has correct aria-label');
});

test('WalletButton uses custom label prop', () => {
  const { container } = renderClean(
    React.createElement(WalletProvider, null, React.createElement(WalletButton, { label: 'Link Wallet' }))
  );
  const btn = container.querySelector('button');
  assert(btn!.textContent?.includes('Link Wallet') === true, 'custom label button shows');
  assert(btn!.getAttribute('aria-label') === 'Link Wallet', 'custom aria-label');
});

test('WalletButton renders connected state via context', async () => {
  function ConnectedTest() {
    const ctx = useWalletContext();
    React.useEffect(() => {
      ctx.connect('SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS', 'leather', 'mainnet');
    }, []);
    return React.createElement(WalletButton, null);
  }

  const { container } = renderClean(
    React.createElement(WalletProvider, null, React.createElement(ConnectedTest, null))
  );

  await waitFor(() => {
    const btn = container.querySelector('.vx-wallet-button--connected');
    assert(btn !== null, 'connected class applied');
    assert(btn!.textContent?.includes('SP2ZNG') === true, 'shows truncated address');
  });
});

// ═══════════════════════════════════════════════════════════════════
// NetworkBadge
// ═══════════════════════════════════════════════════════════════════

test('NetworkBadge renders mainnet with correct label', () => {
  const { container } = renderClean(React.createElement(NetworkBadge, { network: 'mainnet' }));
  assert(container.textContent?.includes('Mainnet') === true, 'shows Mainnet label');
  assert(container.querySelector('.vx-network--mainnet') !== null, 'has mainnet class');
});

test('NetworkBadge renders testnet with correct label', () => {
  const { container } = renderClean(React.createElement(NetworkBadge, { network: 'testnet' }));
  assert(container.textContent?.includes('Testnet') === true, 'shows Testnet label');
  assert(container.querySelector('.vx-network--testnet') !== null, 'has testnet class');
});

test('NetworkBadge has role="status" and aria-label', () => {
  const { container } = renderClean(React.createElement(NetworkBadge, { network: 'mainnet' }));
  const badge = container.querySelector('[role="status"]');
  assert(badge !== null, 'has status role');
  assert(badge!.getAttribute('aria-label')?.includes('Mainnet') === true, 'has descriptive aria-label');
});

// ═══════════════════════════════════════════════════════════════════
// SendForm
// ═══════════════════════════════════════════════════════════════════

test('SendForm renders all form fields', () => {
  const { container } = renderClean(
    React.createElement(SendForm, { onSend: async () => 'tx_test_123' })
  );
  assert(container.querySelector('#vx-recipient') !== null, 'has recipient input');
  assert(container.querySelector('#vx-amount') !== null, 'has amount input');
  assert(container.querySelector('#vx-memo') !== null, 'has memo input');
  assert(container.querySelector('.vx-send-form__submit') !== null, 'has send button');
});

test('SendForm validates empty recipient', async () => {
  const { container } = renderClean(
    React.createElement(SendForm, { onSend: async () => 'tx_test_123' })
  );

  const btn = container.querySelector('.vx-send-form__submit') as HTMLButtonElement;
  fireEvent.click(btn);

  await waitFor(() => {
    const err = container.querySelector('.vx-send-form__error');
    assert(err !== null, 'shows validation error for empty recipient');
  });
});

test('SendForm validates invalid Stacks address', async () => {
  const { container } = renderClean(
    React.createElement(SendForm, { onSend: async () => 'tx_test_123' })
  );

  const input = container.querySelector('#vx-recipient') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'INVALID_ADDRESS' } });

  const btn = container.querySelector('.vx-send-form__submit') as HTMLButtonElement;
  fireEvent.click(btn);

  await waitFor(() => {
    const err = container.querySelector('.vx-send-form__error');
    assert(err !== null && err.textContent?.includes('Invalid Stacks') === true, 'shows invalid address error');
  });
});

test('SendForm shows success state with txId', () => {
  const { container } = renderClean(
    React.createElement(SendForm, {
      onSend: async () => 'tx_test_456',
      txId: 'tx_test_456',
    })
  );
  assert(container.textContent?.includes('Transaction sent!') === true, 'shows success message');
  const txIdEl = container.querySelector('.vx-send-form__txid');
  assert(txIdEl !== null && txIdEl.textContent?.includes('tx_test_456') === true, 'shows txId');
});

test('SendForm shows loading state', () => {
  const { container } = renderClean(
    React.createElement(SendForm, {
      onSend: async () => 'tx_test_789',
      isLoading: true,
    })
  );
  const btn = container.querySelector('.vx-send-form__submit') as HTMLButtonElement;
  assert(btn.getAttribute('aria-busy') === 'true', 'button is busy');
  assert(btn.hasAttribute('disabled'), 'button is disabled');
});

test('SendForm renders fee options', () => {
  const { container } = renderClean(
    React.createElement(SendForm, { onSend: async () => 'tx_test_123' })
  );
  const feeOpts = container.querySelector('.vx-send-form__fee-options');
  assert(feeOpts !== null, 'fee options container exists');
  assert(feeOpts!.querySelectorAll('input[type="radio"]').length === 3, 'has 3 fee options');
});

// ═══════════════════════════════════════════════════════════════════
// TransactionList
// ═══════════════════════════════════════════════════════════════════

test('TransactionList shows empty state when no transactions', () => {
  const { container } = renderClean(
    React.createElement(TransactionList, {
      transactions: [],
      emptyMessage: 'No transactions yet',
    })
  );
  assert(container.textContent?.includes('No transactions yet') === true, 'shows empty message');
});

test('TransactionList renders transaction items', () => {
  const tx = {
    id: 'tx_1',
    txid: '0xabc',
    type: 'token_transfer',
    fromAddress: 'SP123',
    toAddress: 'SP456',
    amount: '1000000',
    status: 'confirmed',
    blockHeight: 100,
    network: 'mainnet',
    createdAt: new Date().toISOString(),
  };

  const { container } = renderClean(
    React.createElement(TransactionList, { transactions: [tx] })
  );
  assert(container.textContent?.includes('Transfer') === true, 'shows transfer type');
  assert(container.textContent?.includes('1 STX') === true, 'shows amount');
  assert(container.textContent?.includes('Confirmed') === true, 'shows confirmed status');
});

test('TransactionList shows load more button when hasMore', () => {
  const txs = Array.from({ length: 10 }, (_, i) => ({
    id: `tx_${i}`,
    txid: `0x${i}`,
    type: 'token_transfer' as const,
    fromAddress: 'SP123',
    toAddress: 'SP456',
    amount: `${(i + 1) * 1000000}`,
    status: 'confirmed' as const,
    blockHeight: 100 + i,
    network: 'mainnet',
    createdAt: new Date().toISOString(),
  }));

  const { container } = renderClean(
    React.createElement(TransactionList, {
      transactions: txs,
      hasMore: true,
      onLoadMore: () => {},
    })
  );

  const btn = container.querySelector('.vx-tx-list__load-more');
  assert(btn !== null, 'shows load more button');
  assert(btn!.textContent?.includes('Load more') === true, 'load more text');
});

test('TransactionList shows loading state on load more', () => {
  const { container } = renderClean(
    React.createElement(TransactionList, {
      transactions: [],
      hasMore: true,
      isLoading: true,
      onLoadMore: () => {},
    })
  );
  const btn = container.querySelector('.vx-tx-list__load-more') as HTMLButtonElement;
  assert(btn.getAttribute('aria-busy') === 'true', 'load more button is busy');
});

// ═══════════════════════════════════════════════════════════════════
// WalletModal
// ═══════════════════════════════════════════════════════════════════

test('WalletModal does not render when closed', () => {
  const { container } = renderClean(
    React.createElement(WalletProvider, null,
      React.createElement(WalletModal, { isOpen: false, onClose: () => {} })
    )
  );
  const modal = container.querySelector('.vx-modal');
  assert(modal === null, 'modal is not in DOM when closed');
});

test('WalletModal renders connect prompt when not connected', () => {
  const { container } = renderClean(
    React.createElement(WalletProvider, null,
      React.createElement(WalletModal, { isOpen: true, onClose: () => {} })
    )
  );
  assert(container.textContent?.includes('Connect your wallet') === true, 'shows connect prompt');
  assert(container.querySelector('.vx-modal__connect-btn') !== null, 'shows connect button');
});

test('WalletModal has dialog role and aria-modal', () => {
  const { container } = renderClean(
    React.createElement(WalletProvider, null,
      React.createElement(WalletModal, { isOpen: true, onClose: () => {} })
    )
  );
  const dialog = container.querySelector('[role="dialog"]');
  assert(dialog !== null, 'has dialog role');
  assert(dialog!.getAttribute('aria-modal') === 'true', 'is modal');
});

test('WalletModal close button has aria-label', () => {
  const { container } = renderClean(
    React.createElement(WalletProvider, null,
      React.createElement(WalletModal, { isOpen: true, onClose: () => {} })
    )
  );
  const closeBtn = container.querySelector('.vx-modal__close');
  assert(closeBtn !== null, 'close button exists');
  assert(closeBtn!.getAttribute('aria-label')?.includes('Close') === true, 'has close aria-label');
});

// ═══════════════════════════════════════════════════════════════════
// QR Code & Copy
// ═══════════════════════════════════════════════════════════════════

test('QRCode renders canvas element', () => {
  const { container } = renderClean(
    React.createElement(QRCode, { address: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS' })
  );
  const canvas = container.querySelector('.vx-qr-code__canvas');
  assert(canvas !== null, 'renders canvas');
  assert(canvas!.tagName === 'CANVAS', 'is a canvas element');
});

test('QRCode has img role and aria-label', () => {
  const { container } = renderClean(
    React.createElement(QRCode, { address: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS' })
  );
  const qr = container.querySelector('.vx-qr-code');
  assert(qr !== null, 'qr wrapper exists');
  assert(qr!.getAttribute('role') === 'img', 'has img role');
  assert(qr!.getAttribute('aria-label')?.includes('SP2ZNG') === true, 'has descriptive label');
});

test('CopyAddressButton renders copy text initially', () => {
  const { container } = renderClean(
    React.createElement(CopyAddressButton, {
      address: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
    })
  );
  assert(container.textContent?.includes('Copy address') === true, 'shows copy address text');
});

test('CopyAddressButton has aria-label', () => {
  const { container } = renderClean(
    React.createElement(CopyAddressButton, {
      address: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',
    })
  );
  const btn = container.querySelector('.vx-copy-btn');
  assert(btn !== null, 'button exists');
  assert(btn!.getAttribute('aria-label')?.includes('Copy') === true, 'has copy aria-label');
});

test('buildDeepLink generates correct URL', () => {
  const link = buildDeepLink('SP123', '1000000', 'hello');
  assert(link.startsWith('stacks://'), 'starts with stacks protocol');
  assert(link.includes('to=SP123'), 'includes recipient');
  assert(link.includes('amount=1000000'), 'includes amount');
  assert(link.includes('memo=hello'), 'includes memo');
});

test('buildDeepLink works without amount and memo', () => {
  const link = buildDeepLink('SP123');
  assert(link === 'stacks://wallet.velumx.io/send?to=SP123', 'generates minimal link');
});

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════

setTimeout(() => {
  cleanup();
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}`);
  if (failed > 0) process.exitCode = 1;
  else process.exitCode = 0;
}, 500);
