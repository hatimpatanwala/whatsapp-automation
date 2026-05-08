import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from '../../database/entities/public/wallet.entity';
import { WalletTransaction } from '../../database/entities/public/wallet-transaction.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly txnRepo: Repository<WalletTransaction>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getOrCreateWallet(tenantId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { tenantId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ tenantId, balance: 0, currency: 'INR' });
      wallet = await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  async getBalance(tenantId: string): Promise<{ balance: number; currency: string }> {
    const wallet = await this.getOrCreateWallet(tenantId);
    return { balance: Number(wallet.balance), currency: wallet.currency };
  }

  /**
   * Credit wallet (top-up, refund, bonus).
   * Uses database transaction for atomicity.
   */
  async credit(tenantId: string, amount: number, description: string, meta?: {
    referenceType?: string;
    referenceId?: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
  }): Promise<WalletTransaction> {
    if (amount <= 0) throw new BadRequestException('Credit amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, { where: { tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      await manager.update(Wallet, wallet.id, {
        balance: balanceAfter,
        isLowBalanceAlerted: balanceAfter > Number(wallet.lowBalanceAlertThreshold) ? false : wallet.isLowBalanceAlerted,
      });

      const txn = manager.create(WalletTransaction, {
        walletId: wallet.id,
        tenantId,
        type: 'credit',
        amount,
        balanceBefore,
        balanceAfter,
        description,
        referenceType: meta?.referenceType,
        referenceId: meta?.referenceId,
        razorpayPaymentId: meta?.razorpayPaymentId,
        razorpayOrderId: meta?.razorpayOrderId,
      });

      return manager.save(WalletTransaction, txn);
    });
  }

  /**
   * Debit wallet (conversation charge, overage).
   * Returns false if insufficient balance.
   */
  async debit(tenantId: string, amount: number, description: string, meta?: {
    referenceType?: string;
    referenceId?: string;
  }): Promise<{ success: boolean; transaction?: WalletTransaction; reason?: string }> {
    if (amount <= 0) throw new BadRequestException('Debit amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, { where: { tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!wallet) return { success: false, reason: 'Wallet not found' };

      const balanceBefore = Number(wallet.balance);
      if (balanceBefore < amount) {
        // Check auto-recharge
        if (wallet.autoRecharge && Number(wallet.autoRechargeAmount) > 0) {
          this.eventEmitter.emit('wallet.auto_recharge', { tenantId, amount: Number(wallet.autoRechargeAmount) });
        }
        return { success: false, reason: 'Insufficient balance' };
      }

      const balanceAfter = balanceBefore - amount;

      await manager.update(Wallet, wallet.id, { balance: balanceAfter });

      const txn = manager.create(WalletTransaction, {
        walletId: wallet.id,
        tenantId,
        type: 'debit',
        amount: -amount,
        balanceBefore,
        balanceAfter,
        description,
        referenceType: meta?.referenceType,
        referenceId: meta?.referenceId,
      });
      const saved = await manager.save(WalletTransaction, txn);

      // Low balance alert
      if (balanceAfter <= Number(wallet.lowBalanceAlertThreshold) && !wallet.isLowBalanceAlerted) {
        await manager.update(Wallet, wallet.id, { isLowBalanceAlerted: true });
        this.eventEmitter.emit('wallet.low_balance', { tenantId, balance: balanceAfter, threshold: Number(wallet.lowBalanceAlertThreshold) });
      }

      return { success: true, transaction: saved };
    });
  }

  /**
   * Debit for a conversation (called by metering engine).
   */
  async debitConversation(tenantId: string, category: string, costInr: number, sessionId: string): Promise<boolean> {
    const result = await this.debit(tenantId, costInr, `${category} conversation charge`, {
      referenceType: 'conversation_session',
      referenceId: sessionId,
    });
    return result.success;
  }

  async getTransactions(tenantId: string, limit = 50, offset = 0): Promise<[WalletTransaction[], number]> {
    return this.txnRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async updateSettings(tenantId: string, settings: {
    autoRecharge?: boolean;
    autoRechargeAmount?: number;
    autoRechargeThreshold?: number;
    lowBalanceAlertThreshold?: number;
  }): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(tenantId);
    await this.walletRepo.update(wallet.id, settings);
    return this.walletRepo.findOne({ where: { id: wallet.id } }) as Promise<Wallet>;
  }
}
