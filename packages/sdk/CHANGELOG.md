# Changelog

All notable changes to `@velumx/mpc` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

### Added
- Initial SDK release
- `VelumxMPC` client class for wallet orchestration
- MPC wallet creation via Turnkey integration
- Session delegation with key rotation
- STX, token, and NFT transfers
- Wallet discovery and connector framework (Leather, Xverse, Asigna)
- React UI components: `WalletButton`, `WalletModal`, `SendForm`, `TransactionList`
- React hooks: `useWallet`, `useBalance`, `useTransactions`, `useSendTransaction`
- Network detection and switching
- Wallet persistence and auto-reconnect
- Stacks message/structured/transaction signing and verification
- CDN-ready IIFE build for vanilla HTML usage
- React Native support with AsyncStorage and native OAuth
- ESM, CJS, and IIFE output formats
- Tree-shakeable subpath exports (`@velumx/mpc/react`, `@velumx/mpc/wallets`, `@velumx/mpc/ui`)
- Size budgets: <50KB core, <100KB with UI (gzipped)
