import { describe, expect, it } from 'vitest';
import { DEFAULT_DEPLOYMENT_CONFIG, resolveDeploymentConfig } from './deploymentConfig';

describe('deploymentConfig', () => {
  it('returns independent defaults for missing configuration', () => {
    const config = resolveDeploymentConfig(undefined);

    expect(config).toEqual(DEFAULT_DEPLOYMENT_CONFIG);
    expect(config).not.toBe(DEFAULT_DEPLOYMENT_CONFIG);
  });

  it('merges valid runtime overrides field by field', () => {
    expect(resolveDeploymentConfig({
      documentInput: 'external',
      showHeader: false,
      showSampleDocuments: false,
      showGithubLink: false,
      locale: 'zh-CN',
      maxDocxSizeMb: 40
    })).toEqual({
      documentInput: 'external',
      showHeader: false,
      showSampleDocuments: false,
      showGithubLink: false,
      locale: 'zh-CN',
      maxDocxSizeMb: 40
    });
  });

  it('falls back for malformed runtime values', () => {
    const config = resolveDeploymentConfig({
      documentInput: 'remote',
      showSampleDocuments: 'no',
      locale: 'fr',
      maxDocxSizeMb: 0
    });

    expect(config).toEqual(DEFAULT_DEPLOYMENT_CONFIG);
  });
});
