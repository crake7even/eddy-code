declare const __EDDY_CODE_VERSION__: string | undefined;
declare const __EDDY_CODE_CHANNEL__: string | undefined;
declare const __EDDY_CODE_COMMIT__: string | undefined;
declare const __EDDY_CODE_BUILD_TARGET__: string | undefined;

export interface EddyBuildInfo {
  readonly version?: string;
  readonly channel?: string;
  readonly commit?: string;
  readonly buildTarget?: string;
}

function optionalBuildString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const EDDY_BUILD_INFO: EddyBuildInfo = {
  version:
    typeof __EDDY_CODE_VERSION__ === 'string'
      ? optionalBuildString(__EDDY_CODE_VERSION__)
      : undefined,
  channel:
    typeof __EDDY_CODE_CHANNEL__ === 'string'
      ? optionalBuildString(__EDDY_CODE_CHANNEL__)
      : undefined,
  commit:
    typeof __EDDY_CODE_COMMIT__ === 'string'
      ? optionalBuildString(__EDDY_CODE_COMMIT__)
      : undefined,
  buildTarget:
    typeof __EDDY_CODE_BUILD_TARGET__ === 'string'
      ? optionalBuildString(__EDDY_CODE_BUILD_TARGET__)
      : undefined,
};
