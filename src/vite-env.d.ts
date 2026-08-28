/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OG_CHAIN_ID?: string;
  readonly VITE_OG_RPC_URL?: string;
  readonly VITE_OG_EXPLORER_URL?: string;
  readonly VITE_GHOSTKEY_MANAGER_ADDRESS?: string;
  readonly VITE_ASSET_SYMBOL?: string;
  readonly VITE_ASSET_DECIMALS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
