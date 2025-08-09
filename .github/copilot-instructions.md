コードを書き直した場合必ず､以下のコマンドを実行してください:

```bash
npm run build:client && npm run dev
```

開発サーバーがすでに立ち上がっている場合は pkill を使ってプロセスを終了させてください:

```bash
pkill -f "npm run dev" && npm run build:client&& npm run dev
```

## コーディングについて

- コンポーネント化は適宜行ってください