import type { WalletConnector } from '../types';
import { leatherConnector } from './leather';
import { xverseConnector } from './xverse';
import { asignaConnector } from './asigna';

export { leatherConnector } from './leather';
export { xverseConnector } from './xverse';
export { asignaConnector } from './asigna';

const _allConnectors: WalletConnector[] = [leatherConnector, xverseConnector, asignaConnector];

export function getConnectors(): WalletConnector[] {
  return _allConnectors;
}

export function getConnector(id: string): WalletConnector | undefined {
  return _allConnectors.find((c) => c.id === id);
}

export function getConnectorsByChain(chain: string): WalletConnector[] {
  return _allConnectors.filter((c) => c.chains.includes(chain as never));
}

export function getAvailableConnectors(): WalletConnector[] {
  return _allConnectors.filter((c) => c.isAvailable());
}

export function getAvailableConnectorsByChain(chain: string): WalletConnector[] {
  return _allConnectors.filter((c) => c.chains.includes(chain as never) && c.isAvailable());
}

export function registerConnector(connector: WalletConnector): void {
  const existing = _allConnectors.findIndex((c) => c.id === connector.id);
  if (existing >= 0) {
    _allConnectors[existing] = connector;
  } else {
    _allConnectors.push(connector);
  }
}
