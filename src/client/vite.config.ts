import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  publicDir: "public", // publicディレクトリの内容をビルド結果にコピー
  build: {
    // PWAファイルを含める設定
    rollupOptions: {
      external: [],
    }
  }
});
