import type {
  AuditEvent,
  Capsule,
  CapsuleStatus,
  CompileInput,
  CreateProject,
  CreateStream,
  Impact,
  Mount,
  MountInput,
  Packet,
  PacketCheck,
  Project,
  PublishCapsule,
  Receipt,
  Revision,
  ReviseCapsule,
  SearchHit,
  Snapshot,
  Stream,
  StreamState,
} from '../core/types.js';

export interface LoomplaneClientOptions {
  /** Server root URL. The client appends /api. */
  baseUrl?: string;
  /** Optional bearer token configured by the Loomplane server. */
  token?: string;
  /** Default request timeout in milliseconds. Set to 0 to disable. */
  timeoutMs?: number;
  /** Optional signal applied to every request made by this client. */
  signal?: AbortSignal;
}

export interface LoomplaneRequestOptions {
  signal?: AbortSignal;
  /** Per-request timeout override. Set to 0 to disable. */
  timeoutMs?: number;
}

export interface HealthResult {
  ok: true;
  version: string;
}
export interface AuthResult {
  required: boolean;
  authenticated: boolean;
  role: 'local' | 'admin' | 'reader' | 'writer' | null;
  projectId?: string | null;
}
export interface CapsuleDetails {
  capsule: Capsule;
  revisions: Revision[];
}
export interface ReceiptDetails {
  receipt: Receipt;
  check: PacketCheck;
}
export interface FinishReceiptInput {
  status: 'completed' | 'abandoned';
  outcome?: string;
  gitCommit?: string;
}
export type UpdateStreamInput = Partial<
  Pick<Stream, 'name' | 'description' | 'agent' | 'branch' | 'color'>
>;
export interface SetCapsuleStatusInput {
  status: CapsuleStatus;
  expectedVersion: number;
  author?: string;
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

export class LoomplaneApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(message: string, status: number, code: string, body?: unknown) {
    super(message);
    this.name = 'LoomplaneApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function checkedTimeout(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError('timeoutMs must be a non-negative finite number');
  return value;
}

function query(path: string, values: Record<string, string | number | undefined>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  const suffix = parameters.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export class LoomplaneClient {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly signal?: AbortSignal;

  constructor(options: LoomplaneClientOptions = {}) {
    const baseUrl = options.baseUrl ?? 'http://127.0.0.1:4318';
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      throw new TypeError('baseUrl must use http or https');
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new TypeError('baseUrl must not contain credentials, a query string, or a fragment');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.timeoutMs = checkedTimeout(options.timeoutMs ?? 10_000);
    this.signal = options.signal;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    options: LoomplaneRequestOptions = {},
  ): Promise<T> {
    const timeoutMs = checkedTimeout(options.timeoutMs ?? this.timeoutMs);
    const signals = [
      this.signal,
      options.signal,
      timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
    ].filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${this.baseUrl}/api${path}`, { ...init, headers, signal });
    const contentType = response.headers.get('content-type') ?? '';
    let responseBody: unknown;
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      const text = await response.text();
      responseBody = text || undefined;
    }

    if (!response.ok) {
      const apiBody =
        responseBody && typeof responseBody === 'object' ? (responseBody as ApiErrorBody) : {};
      const message =
        typeof apiBody.error === 'string'
          ? apiBody.error
          : `Loomplane request failed with HTTP ${response.status}`;
      const code = typeof apiBody.code === 'string' ? apiBody.code : 'HTTP_ERROR';
      throw new LoomplaneApiError(message, response.status, code, responseBody);
    }
    return responseBody as T;
  }

  private write<T>(
    method: 'POST' | 'PATCH',
    path: string,
    body: object,
    options?: LoomplaneRequestOptions,
  ): Promise<T> {
    // Writes are attempted once. Callers decide if and how an operation is safe to retry.
    return this.request<T>(path, { method, body: JSON.stringify(body) }, options);
  }

  health(options?: LoomplaneRequestOptions): Promise<HealthResult> {
    return this.request('/health', {}, options);
  }

  auth(options?: LoomplaneRequestOptions): Promise<AuthResult> {
    return this.request('/auth', {}, options);
  }

  snapshot(projectId?: string, options?: LoomplaneRequestOptions): Promise<Snapshot> {
    return this.request(query('/snapshot', { projectId }), {}, options);
  }

  listProjects(options?: LoomplaneRequestOptions): Promise<Project[]> {
    return this.request('/projects', {}, options);
  }

  async getProject(projectId: string, options?: LoomplaneRequestOptions): Promise<Project> {
    const project = (await this.listProjects(options)).find(
      (candidate) => candidate.id === projectId,
    );
    if (!project) throw new LoomplaneApiError('Project not found', 404, 'NOT_FOUND');
    return project;
  }

  createProject(input: CreateProject, options?: LoomplaneRequestOptions): Promise<Project> {
    return this.write('POST', '/projects', input, options);
  }

  listStreams(projectId: string, options?: LoomplaneRequestOptions): Promise<Stream[]> {
    return this.snapshot(projectId, options).then((snapshot) =>
      snapshot.streams.map((state) => state.stream),
    );
  }

  createStream(input: CreateStream, options?: LoomplaneRequestOptions): Promise<Stream> {
    return this.write('POST', '/streams', input, options);
  }

  getStreamState(streamId: string, options?: LoomplaneRequestOptions): Promise<StreamState> {
    return this.request(`/streams/${encodeURIComponent(streamId)}`, {}, options);
  }

  getStream(streamId: string, options?: LoomplaneRequestOptions): Promise<Stream> {
    return this.getStreamState(streamId, options).then((state) => state.stream);
  }

  updateStream(
    streamId: string,
    input: UpdateStreamInput,
    options?: LoomplaneRequestOptions,
  ): Promise<Stream> {
    return this.write('PATCH', `/streams/${encodeURIComponent(streamId)}`, input, options);
  }

  publishCapsule(input: PublishCapsule, options?: LoomplaneRequestOptions): Promise<Capsule> {
    return this.write('POST', '/capsules', input, options);
  }

  getCapsule(capsuleId: string, options?: LoomplaneRequestOptions): Promise<CapsuleDetails> {
    return this.request(`/capsules/${encodeURIComponent(capsuleId)}`, {}, options);
  }

  listCapsules(projectId: string, options?: LoomplaneRequestOptions): Promise<Capsule[]> {
    return this.snapshot(projectId, options).then((snapshot) => snapshot.capsules);
  }

  getRevisions(capsuleId: string, options?: LoomplaneRequestOptions): Promise<Revision[]> {
    return this.getCapsule(capsuleId, options).then((details) => details.revisions);
  }

  reviseCapsule(
    capsuleId: string,
    input: ReviseCapsule,
    options?: LoomplaneRequestOptions,
  ): Promise<Capsule> {
    return this.write('PATCH', `/capsules/${encodeURIComponent(capsuleId)}`, input, options);
  }

  setCapsuleStatus(
    capsuleId: string,
    input: SetCapsuleStatusInput,
    options?: LoomplaneRequestOptions,
  ): Promise<Capsule> {
    return this.write('POST', `/capsules/${encodeURIComponent(capsuleId)}/status`, input, options);
  }

  impact(capsuleId: string, options?: LoomplaneRequestOptions): Promise<Impact> {
    return this.request(`/capsules/${encodeURIComponent(capsuleId)}/impact`, {}, options);
  }

  mount(input: MountInput, options?: LoomplaneRequestOptions): Promise<Mount> {
    return this.write('POST', '/mounts', input, options);
  }

  unmount(mountId: string, options?: LoomplaneRequestOptions): Promise<{ ok: true }> {
    return this.request(`/mounts/${encodeURIComponent(mountId)}`, { method: 'DELETE' }, options);
  }

  listMounts(streamId: string, options?: LoomplaneRequestOptions): Promise<Mount[]> {
    return this.getStreamState(streamId, options).then((state) => state.mounts);
  }

  compile(input: CompileInput, options?: LoomplaneRequestOptions): Promise<Packet> {
    return this.write('POST', '/compile', input, options);
  }

  getPacket(packetId: string, options?: LoomplaneRequestOptions): Promise<Packet> {
    return this.request(`/packets/${encodeURIComponent(packetId)}`, {}, options);
  }

  getLatestPacket(streamId: string, options?: LoomplaneRequestOptions): Promise<Packet | null> {
    return this.getStreamState(streamId, options).then((state) => state.latestPacket);
  }

  checkPacket(packetId: string, options?: LoomplaneRequestOptions): Promise<PacketCheck> {
    return this.request(`/packets/${encodeURIComponent(packetId)}/check`, {}, options);
  }

  search(
    projectId: string,
    searchQuery: string,
    options?: LoomplaneRequestOptions & { limit?: number },
  ): Promise<SearchHit[]> {
    return this.request(
      query('/search', { projectId, q: searchQuery, limit: options?.limit }),
      {},
      options,
    );
  }

  events(projectId: string, options?: LoomplaneRequestOptions): Promise<AuditEvent[]> {
    return this.request(query('/events', { projectId }), {}, options);
  }

  exportProject(
    projectId: string,
    options?: LoomplaneRequestOptions,
  ): Promise<Record<string, unknown>> {
    return this.request(query('/export', { projectId }), {}, options);
  }

  startReceipt(
    packetId: string,
    agent: string,
    options?: LoomplaneRequestOptions,
  ): Promise<Receipt> {
    return this.write('POST', '/receipts', { packetId, agent }, options);
  }

  getReceipt(receiptId: string, options?: LoomplaneRequestOptions): Promise<ReceiptDetails> {
    return this.request(`/receipts/${encodeURIComponent(receiptId)}`, {}, options);
  }

  listReceipts(projectId: string, options?: LoomplaneRequestOptions): Promise<Receipt[]> {
    return this.request(query('/receipts', { projectId }), {}, options);
  }

  finishReceipt(
    receiptId: string,
    input: FinishReceiptInput,
    options?: LoomplaneRequestOptions,
  ): Promise<Receipt> {
    return this.write('PATCH', `/receipts/${encodeURIComponent(receiptId)}`, input, options);
  }

  createDemo(options?: LoomplaneRequestOptions): Promise<{ projectId: string }> {
    return this.write('POST', '/demo', {}, options);
  }
}
