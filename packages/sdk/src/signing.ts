import { makeUnsignedSTXTokenTransfer, makeUnsignedContractCall, PostConditionMode, uintCV, noneCV, standardPrincipalCV, StacksTransactionWire, publicKeyToAddress } from '@stacks/transactions';
import { sign } from '@noble/secp256k1';
import { MpcTurnkey } from './turnkey';
import { MpcSession } from './session';
import { SessionKey } from './types';
import * as crypto from 'crypto';

interface TxBuildParams { publicKey: string; network: string; turnkeyWalletId: string; }

export class MpcSigning {
  constructor(private turnkey: MpcTurnkey, private session: MpcSession) {}

  async buildAndSignSTXTransfer(p: TxBuildParams & { recipient: string; amount: number; memo?: string }) {
    const tx = await makeUnsignedSTXTokenTransfer({
      recipient: p.recipient, amount: BigInt(p.amount), memo: p.memo || '', publicKey: p.publicKey,
      network: p.network as any, fee: 0n, sponsored: true,
    });
    return this.signTx(tx, p.publicKey, p.turnkeyWalletId);
  }

  async buildAndSignTokenTransfer(p: TxBuildParams & { contractAddress: string; recipient: string; amount: string }) {
    const [addr, name] = p.contractAddress.split('.');
    const tx = await makeUnsignedContractCall({
      contractAddress: addr, contractName: name, functionName: 'transfer',
      functionArgs: [uintCV(BigInt(p.amount)), standardPrincipalCV(p.recipient), standardPrincipalCV(p.recipient), noneCV()],
      publicKey: p.publicKey, network: p.network as any, fee: 0n, sponsored: true, postConditionMode: PostConditionMode.Allow,
    });
    return this.signTx(tx, p.publicKey, p.turnkeyWalletId);
  }

  async buildAndSignNFTTransfer(p: TxBuildParams & { contractAddress: string; tokenId: number | string; recipient: string }) {
    const [addr, name] = p.contractAddress.split('.');
    const sender = publicKeyToAddress(p.publicKey, p.network === 'mainnet' ? 'mainnet' : 'testnet');
    const tx = await makeUnsignedContractCall({
      contractAddress: addr, contractName: name, functionName: 'transfer',
      functionArgs: [uintCV(BigInt(typeof p.tokenId === 'string' ? parseInt(p.tokenId) : p.tokenId)), standardPrincipalCV(sender), standardPrincipalCV(p.recipient)],
      publicKey: p.publicKey, network: p.network as any, fee: 0n, sponsored: true, postConditionMode: PostConditionMode.Allow,
    });
    return this.signTx(tx, p.publicKey, p.turnkeyWalletId);
  }

  private async signTx(tx: StacksTransactionWire, walletPublicKey: string, tkWalletId: string): Promise<{ txHex: string; usedSessionKey: boolean; delegation?: string }> {
    const activeSession = this.session.getActiveSession();
    if (activeSession && activeSession.delegation.walletPublicKey === walletPublicKey) {
      const txBytes = tx.serializeBytes();
      const txHash = crypto.createHash('sha256').update(Buffer.from(txBytes)).digest('hex');
      const sig = await sign(Buffer.from(txHash, 'hex'), activeSession.privateKey);
      const compact = sig.toCompactRawBytes();
      const r = Buffer.from(compact.slice(0, 32)).toString('hex');
      const s = Buffer.from(compact.slice(32, 64)).toString('hex');
      const signed = Buffer.concat([Buffer.from(txBytes), Buffer.from(r, 'hex'), Buffer.from(s, 'hex'), Buffer.from([0x01])]);
      return { txHex: signed.toString('hex'), usedSessionKey: true, delegation: JSON.stringify(activeSession.delegation) };
    }

    const txBytes = tx.serializeBytes();
    const txHash = crypto.createHash('sha256').update(Buffer.from(txBytes)).digest('hex');
    const sig = await this.turnkey.signRawPayload(tkWalletId, txHash);
    const r = Buffer.from(sig.r.replace(/^0x/, ''), 'hex');
    const s = Buffer.from(sig.s.replace(/^0x/, ''), 'hex');
    const signed = Buffer.concat([Buffer.from(txBytes), r, s, Buffer.from([0x01])]);
    return { txHex: signed.toString('hex'), usedSessionKey: false };
  }
}
