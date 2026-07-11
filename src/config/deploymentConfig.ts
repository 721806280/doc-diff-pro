export type DocumentInputMode = 'local' | 'external';
export type ConfiguredLocale = 'auto' | 'zh-CN' | 'en';

export type DeploymentConfig = {
  documentInput: DocumentInputMode;
  showHeader: boolean;
  showSampleDocuments: boolean;
  showGithubLink: boolean;
  locale: ConfiguredLocale;
  maxDocxSizeMb: number;
};

export type DeploymentConfigInput = Partial<DeploymentConfig>;

export const DEFAULT_DEPLOYMENT_CONFIG: DeploymentConfig = {
  documentInput: 'local',
  showHeader: true,
  showSampleDocuments: true,
  showGithubLink: true,
  locale: 'auto',
  maxDocxSizeMb: 25
};

export const deploymentConfig = resolveDeploymentConfig(
  typeof window === 'undefined' ? undefined : window.__DOC_DIFF_CONFIG__
);

export function resolveDeploymentConfig(input: unknown): DeploymentConfig {
  if (!isRecord(input)) return { ...DEFAULT_DEPLOYMENT_CONFIG };

  return {
    documentInput: isDocumentInputMode(input.documentInput)
      ? input.documentInput
      : DEFAULT_DEPLOYMENT_CONFIG.documentInput,
    showHeader: readBoolean(input.showHeader, 'showHeader'),
    showSampleDocuments: readBoolean(input.showSampleDocuments, 'showSampleDocuments'),
    showGithubLink: readBoolean(input.showGithubLink, 'showGithubLink'),
    locale: isConfiguredLocale(input.locale) ? input.locale : DEFAULT_DEPLOYMENT_CONFIG.locale,
    maxDocxSizeMb: isValidFileSize(input.maxDocxSizeMb)
      ? input.maxDocxSizeMb
      : DEFAULT_DEPLOYMENT_CONFIG.maxDocxSizeMb
  };
}

function readBoolean(
  value: unknown,
  key: 'showHeader' | 'showSampleDocuments' | 'showGithubLink'
): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_DEPLOYMENT_CONFIG[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDocumentInputMode(value: unknown): value is DocumentInputMode {
  return value === 'local' || value === 'external';
}

function isConfiguredLocale(value: unknown): value is ConfiguredLocale {
  return value === 'auto' || value === 'zh-CN' || value === 'en';
}

function isValidFileSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

declare global {
  interface Window {
    __DOC_DIFF_CONFIG__?: DeploymentConfigInput;
  }
}
