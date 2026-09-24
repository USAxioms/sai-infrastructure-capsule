/**
 * SOVEREIGN AXIOM ARCHITECTURE
 * Domain 3: Blockchain Extension & Cognitive State Ledgers
 * 
 * Off-chain state ledger with SHA-256 hash-chaining
 * Compressed state checkpoints rolled to blockchain
 * Parent-child smart contract hierarchy governance
 */

import crypto from 'crypto';

// ============================================================================
// COGNITIVE STATE LEDGER (Off-Chain)
// ============================================================================

/**
 * Immutable, hash-chained ledger of computational states
 * Can be verified against smart contracts on-chain
 */
export class CognitiveStateLedger {
  readonly ledgerId: string;
  readonly ownerId: string;
  private entries: LedgerEntry[] = [];
  private stateCheckpoints: StateCheckpoint[] = [];
  private merkleRoot: string = '';

  constructor(ledgerId: string, ownerId: string) {
    this.ledgerId = ledgerId;
    this.ownerId = ownerId;
  }

  /**
   * Record a computational state (off-chain)
   */
  recordState(
    operation: string,
    inputs: Record<string, any>,
    output: Record<string, any>,
    proof: string
  ): LedgerEntry {
    const previousHash =
      this.entries.length > 0
        ? this.entries[this.entries.length - 1].entryHash
        : '0';

    const entry: LedgerEntry = {
      entryNumber: this.entries.length,
      timestamp: Math.floor(Date.now() / 1000),
      operation,
      inputs,
      output,
      proof,
      previousHash,
      entryHash: '',
    };

    // Compute this entry's hash (deterministic)
    entry.entryHash = this.computeEntryHash(entry);

    this.entries.push(entry);
    return entry;
  }

  /**
   * Compute SHA-256 hash for a ledger entry
   */
  private computeEntryHash(entry: LedgerEntry): string {
    const payload = JSON.stringify({
      entryNumber: entry.entryNumber,
      timestamp: entry.timestamp,
      operation: entry.operation,
      inputs: entry.inputs,
      output: entry.output,
      proof: entry.proof,
      previousHash: entry.previousHash,
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Create a state checkpoint (compressed representation)
   * Used for on-chain rollup
   */
  createStateCheckpoint(): StateCheckpoint {
    if (this.entries.length === 0) {
      throw new Error('No entries to checkpoint');
    }

    // Compute Merkle root of all entries
    this.merkleRoot = this.computeMerkleRoot();

    const checkpoint: StateCheckpoint = {
      checkpointNumber: this.stateCheckpoints.length,
      timestamp: Math.floor(Date.now() / 1000),
      ledgerId: this.ledgerId,
      entryCount: this.entries.length,
      startEntryNumber: this.stateCheckpoints.length > 0 
        ? this.stateCheckpoints[this.stateCheckpoints.length - 1].endEntryNumber + 1
        : 0,
      endEntryNumber: this.entries.length - 1,
      merkleRoot: this.merkleRoot,
      previousCheckpointHash: this.stateCheckpoints.length > 0
        ? this.stateCheckpoints[this.stateCheckpoints.length - 1].checkpointHash
        : '0',
      checkpointHash: '',
      compressionRatio: 0,
      proof: '',
    };

    // Compute checkpoint hash
    checkpoint.checkpointHash = this.computeCheckpointHash(checkpoint);
    checkpoint.compressionRatio = this.entries.length > 0
      ? checkpoint.checkpointHash.length / (this.entries.length * 100)
      : 0;

    // Generate cryptographic proof
    checkpoint.proof = crypto
      .createHmac('sha256', 'COGNITIVE_STATE_SECRET')
      .update(checkpoint.checkpointHash)
      .digest('hex');

    this.stateCheckpoints.push(checkpoint);
    return checkpoint;
  }

  /**
   * Compute Merkle root from all ledger entries
   */
  private computeMerkleRoot(): string {
    if (this.entries.length === 0) return '0';

    let hashes = this.entries.map(e => e.entryHash);

    while (hashes.length > 1) {
      const newHashes: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const hash1 = hashes[i];
        const hash2 = hashes[i + 1] || hash1; // Handle odd number
        const combined = crypto
          .createHash('sha256')
          .update(hash1 + hash2)
          .digest('hex');
        newHashes.push(combined);
      }
      hashes = newHashes;
    }

    return hashes[0];
  }

  /**
   * Compute hash for a state checkpoint
   */
  private computeCheckpointHash(checkpoint: Omit<StateCheckpoint, 'checkpointHash' | 'proof'>): string {
    const payload = JSON.stringify({
      checkpointNumber: checkpoint.checkpointNumber,
      timestamp: checkpoint.timestamp,
      ledgerId: checkpoint.ledgerId,
      entryCount: checkpoint.entryCount,
      startEntryNumber: checkpoint.startEntryNumber,
      endEntryNumber: checkpoint.endEntryNumber,
      merkleRoot: checkpoint.merkleRoot,
      previousCheckpointHash: checkpoint.previousCheckpointHash,
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verify entire ledger integrity
   */
  verifyLedgerIntegrity(): LedgerVerification {
    const errors: string[] = [];

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // Verify entry hash
      const expectedHash = this.computeEntryHash(entry);
      if (entry.entryHash !== expectedHash) {
        errors.push(`Entry ${i}: Hash mismatch`);
      }

      // Verify chain linkage
      if (i > 0) {
        const previousEntry = this.entries[i - 1];
        if (entry.previousHash !== previousEntry.entryHash) {
          errors.push(`Entry ${i}: Previous hash mismatch`);
        }
      } else {
        if (entry.previousHash !== '0') {
          errors.push(`Entry ${i}: First entry should have previousHash='0'`);
        }
      }
    }

    // Verify checkpoints
    for (let i = 0; i < this.stateCheckpoints.length; i++) {
      const checkpoint = this.stateCheckpoints[i];

      const expectedProof = crypto
        .createHmac('sha256', 'COGNITIVE_STATE_SECRET')
        .update(checkpoint.checkpointHash)
        .digest('hex');

      if (checkpoint.proof !== expectedProof) {
        errors.push(`Checkpoint ${i}: Proof verification failed`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      entryCount: this.entries.length,
      checkpointCount: this.stateCheckpoints.length,
      currentMerkleRoot: this.merkleRoot,
      verifiedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Export ledger for on-chain rollup
   */
  exportForOnChainRollup(): OnChainRollupData {
    const latestCheckpoint = this.stateCheckpoints[this.stateCheckpoints.length - 1];
    if (!latestCheckpoint) {
      throw new Error('No checkpoints created yet');
    }

    return {
      ledgerId: this.ledgerId,
      ownerId: this.ownerId,
      checkpointNumber: latestCheckpoint.checkpointNumber,
      timestamp: latestCheckpoint.timestamp,
      entryCount: latestCheckpoint.entryCount,
      merkleRoot: latestCheckpoint.merkleRoot,
      checkpointHash: latestCheckpoint.checkpointHash,
      proof: latestCheckpoint.proof,
      verification: this.verifyLedgerIntegrity(),
    };
  }

  /**
   * Get ledger statistics
   */
  getStatistics(): LedgerStatistics {
    return {
      ledgerId: this.ledgerId,
      totalEntries: this.entries.length,
      totalCheckpoints: this.stateCheckpoints.length,
      averageEntriesPerCheckpoint:
        this.stateCheckpoints.length > 0
          ? this.entries.length / this.stateCheckpoints.length
          : 0,
      currentMerkleRoot: this.merkleRoot,
      lastEntryHash: this.entries.length > 0
        ? this.entries[this.entries.length - 1].entryHash
        : '0',
      createdAt: this.entries.length > 0
        ? this.entries[0].timestamp
        : Math.floor(Date.now() / 1000),
    };
  }
}

// ============================================================================
// SMART CONTRACT INTERFACE (Parent-Child Hierarchy)
// ============================================================================

/**
 * Interface for parent-child smart contract governance
 * Defines rules for state verification and immutable accountability
 */
export interface SmartContractHierarchy {
  parentContractAddress: string;
  childContractAddresses: string[];
  rules: ContractRule[];
}

export interface ContractRule {
  ruleId: string;
  name: string;
  condition: string; // Solidity expression
  action: string; // What happens if violated
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Parent smart contract for ledger verification
 */
export class LedgerVerificationContract {
  readonly contractAddress: string;
  readonly ledgerId: string;
  private approvedCheckpoints: Map<string, CheckpointApproval> = new Map();

  constructor(contractAddress: string, ledgerId: string) {
    this.contractAddress = contractAddress;
    this.ledgerId = ledgerId;
  }

  /**
   * Verify and approve a checkpoint from the ledger
   */
  approveCheckpoint(
    rollupData: OnChainRollupData,
    signatures: string[]
  ): CheckpointApproval {
    // Verify proof
    const expectedProof = crypto
      .createHmac('sha256', 'COGNITIVE_STATE_SECRET')
      .update(rollupData.checkpointHash)
      .digest('hex');

    if (rollupData.proof !== expectedProof) {
      throw new Error('Checkpoint proof verification failed');
    }

    // Verify signatures (in production, use proper signature verification)
    if (signatures.length < 1) {
      throw new Error('Insufficient signatures');
    }

    const approval: CheckpointApproval = {
      checkpointHash: rollupData.checkpointHash,
      approvedAt: Math.floor(Date.now() / 1000),
      approverAddress: this.contractAddress,
      signatures,
      merkleRoot: rollupData.merkleRoot,
      isApproved: true,
    };

    this.approvedCheckpoints.set(rollupData.checkpointHash, approval);
    return approval;
  }

  /**
   * Query approved checkpoint
   */
  queryCheckpoint(checkpointHash: string): CheckpointApproval | null {
    return this.approvedCheckpoints.get(checkpointHash) || null;
  }

  /**
   * Get all approved checkpoints
   */
  getAllApprovedCheckpoints(): CheckpointApproval[] {
    return Array.from(this.approvedCheckpoints.values());
  }

  /**
   * Emit immutable event (on-chain)
   */
  emitCheckpointApprovedEvent(approval: CheckpointApproval): ContractEvent {
    return {
      eventType: 'CHECKPOINT_APPROVED',
      contractAddress: this.contractAddress,
      ledgerId: this.ledgerId,
      checkpoint: {
        checkpointHash: approval.checkpointHash,
        merkleRoot: approval.merkleRoot,
      },
      timestamp: approval.approvedAt,
      transactionHash: this.generateTransactionHash(),
    };
  }

  /**
   * Generate transaction hash (simulated)
   */
  private generateTransactionHash(): string {
    return '0x' + crypto.randomBytes(32).toString('hex');
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LedgerEntry {
  entryNumber: number;
  timestamp: number;
  operation: string;
  inputs: Record<string, any>;
  output: Record<string, any>;
  proof: string;
  previousHash: string;
  entryHash: string;
}

export interface StateCheckpoint {
  checkpointNumber: number;
  timestamp: number;
  ledgerId: string;
  entryCount: number;
  startEntryNumber: number;
  endEntryNumber: number;
  merkleRoot: string;
  previousCheckpointHash: string;
  checkpointHash: string;
  compressionRatio: number;
  proof: string;
}

export interface LedgerVerification {
  isValid: boolean;
  errors: string[];
  entryCount: number;
  checkpointCount: number;
  currentMerkleRoot: string;
  verifiedAt: number;
}

export interface OnChainRollupData {
  ledgerId: string;
  ownerId: string;
  checkpointNumber: number;
  timestamp: number;
  entryCount: number;
  merkleRoot: string;
  checkpointHash: string;
  proof: string;
  verification: LedgerVerification;
}

export interface CheckpointApproval {
  checkpointHash: string;
  approvedAt: number;
  approverAddress: string;
  signatures: string[];
  merkleRoot: string;
  isApproved: boolean;
}

export interface ContractEvent {
  eventType: string;
  contractAddress: string;
  ledgerId: string;
  checkpoint: {
    checkpointHash: string;
    merkleRoot: string;
  };
  timestamp: number;
  transactionHash: string;
}

export interface LedgerStatistics {
  ledgerId: string;
  totalEntries: number;
  totalCheckpoints: number;
  averageEntriesPerCheckpoint: number;
  currentMerkleRoot: string;
  lastEntryHash: string;
  createdAt: number;
}

export default {
  CognitiveStateLedger,
  LedgerVerificationContract,
};
