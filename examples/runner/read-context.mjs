// A runnable fixture, not an AI agent: demonstrate the exact packet hand-off.
import { readFile } from 'node:fs/promises';
const packetFile = process.env.LOOMPLANE_PACKET_FILE;
const contextFile = process.env.LOOMPLANE_CONTEXT_FILE;
if (!packetFile || !contextFile) throw new Error('Run this example with loomplane run.');
const packet = JSON.parse(await readFile(packetFile, 'utf8'));
if (packet.id !== process.env.LOOMPLANE_PACKET_ID) throw new Error('Packet ID does not match.');
process.stdout.write(await readFile(contextFile, 'utf8'));
