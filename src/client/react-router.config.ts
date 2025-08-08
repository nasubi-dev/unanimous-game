import type { Config } from "@react-router/dev/config";

export default {
  // Cloudflare Workers での簡易ホスティングのため SPA ビルドに切替
  ssr: false,
} satisfies Config;
