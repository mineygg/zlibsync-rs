// Auto-generated shape of the native addon — do not edit by hand.
// The real types come from napi-rs codegen at build time.

export declare class Inflate {
  constructor(opts?: { chunkSize?: number; to?: string; windowBits?: number });
  push(data: Buffer, flushMode?: boolean | number): void;
  reset(): void;
  /** @deprecated Use takeResult() instead. */
  /** @deprecated Use takeResult() instead. */
  get result(): Buffer | string | null;
  takeResult(): Buffer | string | null;
  takeResult(): Buffer | string | null;
  get err(): number;
  get msg(): string | null;
  get chunkSize(): number;
  get windowBits(): number;
}

export declare class Deflate {
  constructor(opts?: { chunkSize?: number; to?: string; level?: number; windowBits?: number });
  push(data: Buffer, flushMode?: boolean | number): void;
  reset(): void;
  get result(): Buffer | string | null;
  get err(): number;
  get msg(): string | null;
  get chunkSize(): number;
  get windowBits(): number;
  get level(): number;
}

export declare function zNoFlush(): number;
export declare function zPartialFlush(): number;
export declare function zSyncFlush(): number;
export declare function zFullFlush(): number;
export declare function zFinish(): number;
export declare function zBlock(): number;
export declare function zTrees(): number;

export declare function zOk(): number;
export declare function zStreamEnd(): number;
export declare function zNeedDict(): number;
export declare function zErrno(): number;
export declare function zStreamError(): number;
export declare function zDataError(): number;
export declare function zMemError(): number;
export declare function zBufError(): number;
export declare function zVersionError(): number;

export declare function zNoCompression(): number;
export declare function zBestSpeed(): number;
export declare function zBestCompression(): number;
export declare function zDefaultCompression(): number;

export declare function zFiltered(): number;
export declare function zHuffmanOnly(): number;
export declare function zRle(): number;
export declare function zFixed(): number;
export declare function zDefaultStrategy(): number;

export declare function zBinary(): number;
export declare function zText(): number;
export declare function zAscii(): number;
export declare function zUnknown(): number;
export declare function zDeflated(): number;
export declare function zNull(): number;

export declare function zlibVersion(): string;