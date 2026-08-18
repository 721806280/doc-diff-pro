/**
 * DocDiff Pro — 外部接入 API 类型契约（接入方参考）
 *
 * 本文件是 `window.DocDiffPro` 运行时 API 的类型声明模板，供接入方在自己工程中
 * 复制使用以获得类型提示。它与 `src/services/externalDocumentApi.ts` 中的实现保持
 * 同构，但不依赖应用内部的 `@/` 路径别名。
 *
 * 用法：将本文件内容复制到接入方工程（例如 `types/doc-diff-pro.d.ts`），即可：
 *
 *   declare global {
 *     interface Window { DocDiffPro?: import('./doc-diff-pro.client').DocDiffProApi }
 *   }
 */

/** 接入方业务标识，随调用透传并在事件中回传，便于对账。 */
export type ExternalDocumentMeta = {
  bizId?: string;
  source?: string;
};

/** loadDocuments 入参；baseline / revised 可只传一侧。 */
export type ExternalDocumentSet = {
  baseline?: File;
  revised?: File;
  meta?: ExternalDocumentMeta;
};

/** 比对摘要。 */
export type DiffSummary = {
  total: number;
  inserted: number;
  deleted: number;
  modified: number;
  similarity: number;
  layoutNoiseFiltered: number;
  layoutNoiseItems: unknown[];
};

/** 应用当前状态快照。 */
export type DocDiffProState = {
  ready: boolean;
  comparing: boolean;
  hasDocuments: boolean;
  hasResult: boolean;
  error: string;
};

/** 事件 payload 映射。 */
export type DocDiffProEventMap = {
  ready: Record<string, never>;
  result: { summary: DiffSummary; meta?: ExternalDocumentMeta };
  error: { message: string; meta?: ExternalDocumentMeta };
  cleared: { meta?: ExternalDocumentMeta };
};

export type DocDiffProEventName = keyof DocDiffProEventMap;

/** `window.DocDiffPro` 上的运行时 API。 */
export type DocDiffProApi = {
  /** 应用挂载、API 可用后为 true。 */
  readonly ready: boolean;
  /** 注入文档；单侧可更新，不因缺另一侧阻断。 */
  loadDocuments(documents: ExternalDocumentSet): Promise<{ sequence: number }>;
  /** 订阅生命周期/比对事件，返回取消函数。 */
  on<E extends DocDiffProEventName>(event: E, handler: (payload: DocDiffProEventMap[E]) => void): () => void;
  /** 查询当前状态。 */
  getState(): DocDiffProState;
};
