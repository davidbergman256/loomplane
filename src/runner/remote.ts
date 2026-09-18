import type { LoomplaneClient } from '../sdk/client.js';
import type { RunnerPort } from './run.js';

/** Keep remote receipt operations and immutable source reads behind the same runner contract. */
export function remoteRunnerPort(client: LoomplaneClient): RunnerPort {
  return {
    compile: (input) => client.compile(input),
    checkPacket: (id) => client.checkPacket(id),
    getPacket: (id) => client.getPacket(id),
    getRevisions: (id) => client.getRevisions(id),
    listCapsules: (id) => client.listCapsules(id),
    startReceipt: (id, agent) => client.startReceipt(id, agent),
    getReceipt: async (id) => (await client.getReceipt(id)).receipt,
    finishReceipt: (id, input) => client.finishReceipt(id, input),
  };
}
