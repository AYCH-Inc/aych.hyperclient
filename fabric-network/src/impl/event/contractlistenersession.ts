/**
 * Copyright 2020 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlockEvent, BlockListener, ContractEvent, ContractListener, ListenerOptions, TransactionEvent } from '../../events';
import * as Logger from '../../logger';
import { Network } from '../../network';
import { ListenerSession } from './listenersession';
import * as GatewayUtils from '../gatewayutils';
const logger = Logger.getLogger('ContractListenerSession');

export class ContractListenerSession implements ListenerSession {
	private readonly listener: ContractListener;
	private chaincodeId: string;
	private network: Network;
	private blockListener: BlockListener;
	private options: ListenerOptions | undefined;

	constructor(listener: ContractListener, chaincodeId: string, network: Network, options?: ListenerOptions) {
		this.listener = listener;
		this.chaincodeId = chaincodeId;
		this.network = network;
		this.blockListener = (blockEvent: BlockEvent) => this.onBlockEvent(blockEvent);
		this.options = options;
	}

	public async start() {
		await this.network.addBlockListener(this.blockListener, this.options);
	}

	public close() {
		this.network.removeBlockListener(this.blockListener);
	}

	private async onBlockEvent(blockEvent: BlockEvent): Promise<void> {
		const transactionPromises = blockEvent.getTransactionEvents()
			.filter((transactionEvent) => transactionEvent.isValid)
			.map((transactionEvent) => this.onTransactionEvent(transactionEvent));

		// Don't use Promise.all() as it returns early if any promises are rejected
		await GatewayUtils.allSettled(transactionPromises);
	}

	private async onTransactionEvent(transactionEvent: TransactionEvent): Promise<void> {
		for (const contractEvent of transactionEvent.getContractEvents()) {
			if (this.isMatch(contractEvent)) {
				await this.notifyListener(contractEvent);
			}
		}
	}

	private isMatch(event: ContractEvent): boolean {
		return event.chaincodeId === this.chaincodeId;
	}

	private async notifyListener(event: ContractEvent): Promise<void> {
		try {
			await this.listener(event);
		} catch (error) {
			logger.warn('Error notifying contract listener', error);
		}
	}
}
